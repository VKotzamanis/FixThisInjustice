import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../ui/styles/crt.css';
import { App } from './App';
import { defaultState, useAppStore } from '../store';
import { STORAGE_KEY } from '../store/persistence';
import { installFakeStorage } from '../store/testStorage';
import { downloadText } from './download';

/**
 * The download helper is the seam. It is the one thing in these tests that
 * touches the platform (an object URL and a synthetic click), and what matters
 * here is *which text* each banner hands it, not that jsdom can download.
 */
vi.mock('./download', () => ({ downloadText: vi.fn() }));

/** A save failure as the store records it: the reason plus the thrown message. */
const SERIALIZE_FAILURE = { reason: 'serialize' as const, error: 'BigInt' };

function seedSaveError(): void {
  useAppStore.setState({
    status: {
      lastSaveError: SERIALIZE_FAILURE,
      lastLoadError: null,
      lastLoadRaw: null,
      hydrated: true,
    },
  });
}

beforeEach(() => {
  useAppStore.setState({
    ...defaultState(),
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: false },
  });
});

describe('SaveErrorBanner', () => {
  it('says the change could not be saved and that the stored copy is unchanged', () => {
    installFakeStorage();
    seedSaveError();

    render(<App />);

    // Not "storage is full" and not "storage is unavailable": the store was
    // never touched, so advice about the store would send the user nowhere.
    expect(screen.getByText(/could not be saved/i)).toBeInTheDocument();
    expect(screen.getByText(/stored copy is unchanged/i)).toBeInTheDocument();
    expect(screen.queryByText(/Storage is full/i)).toBeNull();
    expect(screen.queryByText(/Storage is unavailable/i)).toBeNull();
  });

  it('offers the last stored document, not the in-memory one, and does not throw', async () => {
    installFakeStorage({ [STORAGE_KEY]: '{"stored":"document"}' });
    seedSaveError();

    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: 'Export stored copy' }));

    // exportJson() would have produced a pretty-printed AppState. The raw
    // stored text proves this branch never went near it: a document that
    // JSON.stringify refused is exactly the document an export cannot carry.
    expect(downloadText).toHaveBeenCalledWith(
      'fixthisinjustice-recovery.json',
      '{"stored":"document"}',
    );
  });

  it('re-runs the persistence save when Retry save is used', async () => {
    const data = installFakeStorage();
    seedSaveError();

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry save' }));

    expect(data.get(STORAGE_KEY)).toContain('"schemaVersion":3');
    // A write that now succeeds clears the banner, through the same
    // reportSaveResult path the debounced subscription uses.
    expect(useAppStore.getState().status.lastSaveError).toBeNull();
  });

  it('keeps the quota branch on the in-memory export', async () => {
    installFakeStorage();
    useAppStore.setState({
      status: {
        lastSaveError: { reason: 'quota', error: 'full' },
        lastLoadError: null,
        lastLoadRaw: null,
        hydrated: true,
      },
    });

    render(<App />);
    expect(screen.getByText(/Storage is full/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));

    // The in-memory document, pretty-printed by exportJson().
    expect(downloadText).toHaveBeenCalledWith(
      'fixthisinjustice-export.json',
      expect.stringContaining('"schemaVersion": 3'),
    );
  });
});

describe('LoadErrorBanner', () => {
  it('offers the original corrupt text after storage has moved on underneath it', async () => {
    const data = installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });

    render(<App />);
    expect(screen.getByText(/did not validate/i)).toBeInTheDocument();

    // Another tab, or this app's own wipeAll(), removes the key. The snapshot
    // taken at hydrate time is now the user's only copy.
    data.delete(STORAGE_KEY);
    await userEvent.click(screen.getByRole('button', { name: 'Export stored data' }));

    expect(downloadText).toHaveBeenCalledWith('fixthisinjustice-recovery.json', '{"week":999}');
  });
});

describe('CRT presentation preferences', () => {
  it('paints neither layer when both preferences are off', () => {
    installFakeStorage();
    useAppStore.setState({ ui: { ...defaultState().ui, scanlines: false, flicker: false } });

    const { container } = render(<App />);
    expect(container.querySelector('.crt')?.className).toBe('crt');
  });

  it('paints both layers when the preferences ask for them', () => {
    installFakeStorage();
    useAppStore.setState({ ui: { ...defaultState().ui, scanlines: true, flicker: true } });

    const { container } = render(<App />);
    expect(container.querySelector('.crt')).toHaveClass('crt', 'sc', 'fl');
  });

  it('disables the flicker under prefers-reduced-motion', () => {
    // A full-viewport opacity animation is exactly what that setting exists to
    // stop, and the class this component now applies is what makes the rule
    // reachable. jsdom does not evaluate media queries, so the guarantee is
    // asserted in the injected stylesheet text rather than a computed style.
    const stylesheet = [...document.querySelectorAll('style')]
      .map((el) => el.textContent ?? '')
      .join('\n');
    expect(stylesheet).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.crt\.fl\s*\{\s*animation:\s*none/,
    );
  });
});
