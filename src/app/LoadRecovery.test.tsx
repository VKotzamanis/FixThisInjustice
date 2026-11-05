import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { copyFor } from '../content/copy';
import { defaultState, useAppStore } from '../store';
import { createMemoryBackend } from '../store/db/memoryBackend';
import { App } from './App';

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
});
