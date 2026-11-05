import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RootErrorBoundary } from './RootErrorBoundary';
import { defaultState, useAppStore, whenPersisted } from '../store';
import { STORAGE_KEY } from '../store/persistence';
import { bootMemoryStore, storedDocument } from '../store/testBackend';
import { createMemoryBackend } from '../store/db/memoryBackend';
import { installFakeStorage } from '../store/testStorage';

/** A child that throws during render, so the boundary catches without the store. */
function Boom(): never {
  throw new Error('render exploded');
}

/** A child that reads the store during render, as every view does. */
function ReadsTheStore(): null {
  useAppStore.getState().exportJson();
  return null;
}

/**
 * The real exportJson action, captured once before any test replaces it.
 *
 * eslint-disable justification: unbound-method guards against a method losing
 * its receiver, and a zustand action has none — every action in src/store is a
 * closure over get()/set() and never reads `this`. Holding the function itself
 * is the only way to put it back after a test has swapped it out.
 */
// eslint-disable-next-line @typescript-eslint/unbound-method
const REAL_EXPORT_JSON = useAppStore.getState().exportJson;

beforeEach(() => {
  useAppStore.setState({
    ...defaultState(),
    status: {
      lastSaveError: null,
      lastLoadError: null,
      lastLoadRaw: null,
      hydrated: false,
      lastActionError: null,
    },
  });
});

afterEach(() => {
  useAppStore.setState({ exportJson: REAL_EXPORT_JSON });
  vi.useRealTimers();
});

/** React logs a caught render error; silence it so the run stays readable. */
function silenceReactErrorLog(): void {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

/**
 * Makes a store read throw, so the boundary has something to catch.
 *
 * Installed through setState and undone in afterEach rather than with vi.spyOn: zustand's set()
 * copies the whole state object, so a spy taken on one snapshot outlives restoreMocks.
 */
function makeStoreThrow(): void {
  useAppStore.setState({
    exportJson: () => {
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

  it('renders the recovery UI when a store read throws during render', () => {
    silenceReactErrorLog();
    installFakeStorage();
    makeStoreThrow();

    render(
      <RootErrorBoundary>
        <ReadsTheStore />
      </RootErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('The app could not start')).toBeInTheDocument();
    expect(screen.getByText('store is unreadable')).toBeInTheDocument();
  });

  it('exports the raw stored document from the recovery UI', async () => {
    silenceReactErrorLog();
    installFakeStorage({ [STORAGE_KEY]: '{"broken":true}' });
    makeStoreThrow();

    const onDownload = vi.fn();
    render(
      <RootErrorBoundary onDownload={onDownload}>
        <ReadsTheStore />
      </RootErrorBoundary>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Export stored data' }));

    expect(onDownload).toHaveBeenCalledWith('fixthisinjustice-recovery.json', '{"broken":true}');
    expect(screen.getByText('Export downloaded.')).toBeInTheDocument();
  });

  it('requires an export and a typed confirmation before clearing', async () => {
    silenceReactErrorLog();
    const data = installFakeStorage({ [STORAGE_KEY]: '{"broken":true}' });
    makeStoreThrow();

    const onDownload = vi.fn();
    render(
      <RootErrorBoundary onDownload={onDownload}>
        <ReadsTheStore />
      </RootErrorBoundary>,
    );

    const clear = screen.getByRole('button', { name: 'Clear stored data' });
    const confirm = screen.getByLabelText(/type DELETE/i);

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

  it('clears durably: a change still waiting to commit cannot re-create a record', async () => {
    silenceReactErrorLog();
    const backend = await bootMemoryStore({ legacy: JSON.stringify(defaultState()) });

    // One change, queued in this task and not yet committed.
    useAppStore.getState().setUi({ lastView: 'train' });

    render(
      <RootErrorBoundary onDownload={vi.fn()} backend={backend}>
        <Boom />
      </RootErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export stored data' }));
    fireEvent.change(screen.getByLabelText(/type DELETE/i), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear stored data' }));
    await whenPersisted();

    // Master plan section 3: the clear path drops the pending change, so nothing lands after it.
    expect(storedDocument(backend.disk)).toEqual(defaultState());
    expect(backend.disk.legacy).toBeNull();
  });

  it('exports the records in the database, not the legacy key (R13, B04)', async () => {
    silenceReactErrorLog();
    installFakeStorage({ [STORAGE_KEY]: '{"legacy":true}' });
    const backend = await bootMemoryStore({ legacy: JSON.stringify(defaultState()) });
    useAppStore.getState().setUi({ lastView: 'atlas' });
    await whenPersisted();

    const onDownload = vi.fn();
    render(
      <RootErrorBoundary onDownload={onDownload} backend={backend}>
        <Boom />
      </RootErrorBoundary>,
    );
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Export stored data' }));
      expect(onDownload).toHaveBeenLastCalledWith(
        'fixthisinjustice-recovery.json',
        expect.stringContaining('"lastView": "atlas"'),
      );
    });
  });

  it('clears the database even when the store is not running (no engine)', async () => {
    silenceReactErrorLog();
    const backend = createMemoryBackend({ legacy: JSON.stringify(defaultState()) });
    // Records exist on disk; this page never hydrated, so the store has no engine.
    await backend.commit({ clear: false, puts: [{ store: 'app', key: 'ui', value: defaultState().ui }], deletes: [] }, 0, 3);
    render(
      <RootErrorBoundary onDownload={vi.fn()} backend={backend}>
        <Boom />
      </RootErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export stored data' }));
    fireEvent.change(screen.getByLabelText(/type DELETE/i), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear stored data' }));
    await waitFor(() => {
      expect(backend.disk.records.get('app')?.size ?? 0).toBe(0);
    });
    expect(backend.disk.legacy).toBeNull();
  });
});

describe('RootErrorBoundary reload (A12)', () => {
  it('offers Reload, because an installed app has no browser reload button', () => {
    silenceReactErrorLog();
    installFakeStorage();
    const onReload = vi.fn();
    render(
      <RootErrorBoundary onReload={onReload}>
        <Boom />
      </RootErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
