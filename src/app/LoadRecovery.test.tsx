import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { copyFor } from '../content/copy';
import { defaultState, useAppStore } from '../store';
import { createMemoryBackend } from '../store/db/memoryBackend';
import { App } from './App';
import { makeBlankState } from '../test/migrationFactories';
import { preloadRoutes } from './routes';

// Audit E09: App's split screens render on their first frame only once loaded.
beforeAll(async () => {
  await preloadRoutes();
});

vi.mock('./download', () => ({ downloadText: vi.fn() }));

beforeEach(() => {
  useAppStore.setState({
    ...defaultState(),
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: false, lastActionError: null },
  });
});

describe('a refused document opens the recovery screen (B01/B17/B18)', () => {
  it('shows recovery, never the intro or setup, and states that writes are paused', async () => {
    const backend = createMemoryBackend({ legacy: '{"week":999}' });
    await useAppStore.getState().hydrate(backend);
    const { container } = render(<App />);
    expect(screen.getByRole('heading', { name: copyFor('limelight', 'hero.storedDataRefused') })).toBeInTheDocument();
    expect(screen.getByText(copyFor('limelight', 'status.writesPaused'))).toBeInTheDocument();
    expect(container.querySelector('section.intro')).toBeNull();
    expect(container.querySelector('.wiz')).toBeNull();
  });

  it('names an unreachable store differently (B17)', async () => {
    const backend = createMemoryBackend();
    backend.makeUnavailable();
    await useAppStore.getState().hydrate(backend);
    render(<App />);
    expect(screen.getByRole('heading', { name: copyFor('limelight', 'hero.storageUnreadable') })).toBeInTheDocument();
  });

  it('offers the typed wipe from the recovery screen', async () => {
    const backend = createMemoryBackend({ legacy: '{"week":999}' });
    await useAppStore.getState().hydrate(backend);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.wipeAll') }));
    expect(screen.getByRole('button', { name: copyFor('limelight', 'button.wipeConfirm') })).toBeDisabled();
  });

  it('names an unreachable database as unavailable even when fti.v3 is readable (B17)', async () => {
    const backend = createMemoryBackend({ legacy: '{"week":999}' });
    backend.makeUnavailable();
    await useAppStore.getState().hydrate(backend);
    render(<App />);
    expect(screen.getByRole('heading', { name: copyFor('limelight', 'hero.storageUnreadable') })).toBeInTheDocument();
  });

  it('imports a backup with an unreadable record: the rest loads and writing reopens (audit B04)', async () => {
    const backend = createMemoryBackend({ legacy: '{"week":999}' });
    await useAppStore.getState().hydrate(backend);
    render(<App />);
    const doc = JSON.parse(JSON.stringify(makeBlankState())) as Record<string, unknown>;
    doc.sets = { bad: { id: 'bad', rpe: 7.3 } };
    const file = new File([JSON.stringify(doc)], 'backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText(copyFor('limelight', 'label.importBackup')), { target: { files: [file] } });
    await waitFor(() => {
      expect(useAppStore.getState().status.lastLoadError).toBeNull();
    });
    expect(useAppStore.getState().status.quarantine?.map((q) => q.key)).toEqual(['bad']);
    expect(Object.keys(useAppStore.getState().profiles)).toEqual(Object.keys(makeBlankState().profiles));
  });
});
