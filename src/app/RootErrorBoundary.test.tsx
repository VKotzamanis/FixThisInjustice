import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { RootErrorBoundary } from './RootErrorBoundary';
import { SAVE_DEBOUNCE_MS, defaultState, startPersistence, useAppStore } from '../store';
import { STORAGE_KEY } from '../store/persistence';
import { installFakeStorage } from '../store/testStorage';

/** A child that throws during render, so the boundary catches without the store. */
function Boom(): never {
  throw new Error('render exploded');
}

/** Teardown for a persistence subscription a test started; run even on failure. */
let stopPersistence: (() => void) | null = null;

/**
 * The real hydrate action, captured once before any test replaces it.
 *
 * eslint-disable justification: unbound-method guards against a method losing
 * its receiver, and a zustand action has none — every action in src/store is a
 * closure over get()/set() and never reads `this`. Holding the function itself
 * is the only way to put it back after a test has swapped it out.
 */
// eslint-disable-next-line @typescript-eslint/unbound-method
const REAL_HYDRATE = useAppStore.getState().hydrate;

beforeEach(() => {
  useAppStore.setState({
    ...defaultState(),
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: false },
  });
});

afterEach(() => {
  useAppStore.setState({ hydrate: REAL_HYDRATE });
  if (stopPersistence !== null) {
    const stop = stopPersistence;
    stopPersistence = null;
    stop();
  }
  vi.useRealTimers();
});

/** React logs a caught render error; silence it so the run stays readable. */
function silenceReactErrorLog(): void {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

/**
 * Makes hydrate throw, so the boundary has something to catch.
 *
 * Installed through setState and undone in afterEach rather than with
 * vi.spyOn. zustand's set() copies the whole state object, so a spy taken on
 * one snapshot is carried by value into every snapshot after it, while
 * restoreMocks restores only the object the spy was taken from. The mock
 * therefore outlived its test and threw inside every later test that called
 * hydrate() — the same class of leak the store suite's teardown registry
 * exists to stop.
 */
function makeHydrateThrow(): void {
  useAppStore.setState({
    hydrate: () => {
      throw new Error('store is unreadable');
    },
  });
}

describe('RootErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    installFakeStorage();
    render(
      <RootErrorBoundary>
        <p>all good</p>
      </RootErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('renders the recovery UI when the store throws on hydrate', () => {
    silenceReactErrorLog();
    installFakeStorage();
    makeHydrateThrow();

    render(
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('The application could not start')).toBeInTheDocument();
    expect(screen.getByText('store is unreadable')).toBeInTheDocument();
  });

  it('exports the raw stored document from the recovery UI', async () => {
    silenceReactErrorLog();
    installFakeStorage({ [STORAGE_KEY]: '{"broken":true}' });
    makeHydrateThrow();

    const onDownload = vi.fn();
    render(
      <RootErrorBoundary onDownload={onDownload}>
        <App />
      </RootErrorBoundary>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Export stored data' }));

    expect(onDownload).toHaveBeenCalledWith('fixthisinjustice-recovery.json', '{"broken":true}');
    expect(screen.getByText('Export downloaded.')).toBeInTheDocument();
  });

  it('requires an export and a typed confirmation before clearing', async () => {
    silenceReactErrorLog();
    const data = installFakeStorage({ [STORAGE_KEY]: '{"broken":true}' });
    makeHydrateThrow();

    const onDownload = vi.fn();
    render(
      <RootErrorBoundary onDownload={onDownload}>
        <App />
      </RootErrorBoundary>,
    );

    const clear = screen.getByRole('button', { name: 'Clear stored data' });
    const confirm = screen.getByLabelText(/type DELETE below/i);

    // Disabled before an export, whatever is typed.
    expect(clear).toBeDisabled();
    await userEvent.type(confirm, 'DELETE');
    expect(clear).toBeDisabled();

    // Still disabled after an export if the confirmation is wrong.
    await userEvent.click(screen.getByRole('button', { name: 'Export stored data' }));
    await userEvent.clear(confirm);
    await userEvent.type(confirm, 'delete');
    expect(clear).toBeDisabled();

    // Enabled only with both.
    await userEvent.clear(confirm);
    await userEvent.type(confirm, 'DELETE');
    expect(clear).toBeEnabled();

    await userEvent.click(clear);
    expect(data.has(STORAGE_KEY)).toBe(false);
    expect(screen.getByText('Stored data cleared')).toBeInTheDocument();
  });

  it('takes focus when the recovery UI appears', () => {
    silenceReactErrorLog();
    installFakeStorage();

    render(
      <RootErrorBoundary>
        <Boom />
      </RootErrorBoundary>,
    );

    // The tree the user was reading has been replaced. Focus has to follow it,
    // or a keyboard or screen-reader user is left on a detached position.
    expect(document.activeElement).toBe(screen.getByRole('alert'));
  });

  it('clears durably: a write already in the debounce cannot re-create the key', () => {
    silenceReactErrorLog();
    vi.useFakeTimers();
    const data = installFakeStorage({ [STORAGE_KEY]: JSON.stringify(defaultState()) });
    // Hydrated and with no load error, so the subscription is allowed to write.
    useAppStore.setState({
      status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true },
    });
    stopPersistence = startPersistence();

    // One unsaved change, still inside the coalescing window.
    useAppStore.getState().setUi({ lastView: 'train' });

    render(
      <RootErrorBoundary onDownload={vi.fn()}>
        <Boom />
      </RootErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export stored data' }));
    fireEvent.change(screen.getByLabelText(/type DELETE below/i), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear stored data' }));

    expect(data.has(STORAGE_KEY)).toBe(false);
    // clearStorage() alone would let the queued write land one debounce later
    // and put the document straight back. Master plan §3: the clear path must
    // cancel the pending write.
    vi.advanceTimersByTime(Math.max(1_000, SAVE_DEBOUNCE_MS * 4));
    expect(data.has(STORAGE_KEY)).toBe(false);
  });
});
