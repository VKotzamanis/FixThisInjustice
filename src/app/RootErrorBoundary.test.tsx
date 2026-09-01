import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { RootErrorBoundary } from './RootErrorBoundary';
import { useAppStore } from '../store';
import { STORAGE_KEY } from '../store/persistence';
import { installFakeStorage } from '../store/testStorage';

/** React logs a caught render error; silence it so the run stays readable. */
function silenceReactErrorLog(): void {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

/**
 * Makes hydrate throw, so the boundary has something to catch. A spy rather
 * than setState: vitest.config.ts sets restoreMocks, so the real action comes
 * back after each test without a teardown that has to name it.
 */
function makeHydrateThrow(): void {
  vi.spyOn(useAppStore.getState(), 'hydrate').mockImplementation(() => {
    throw new Error('store is unreadable');
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
});
