import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { copyFor } from '../content/copy';
import { defaultState, useAppStore } from '../store';
import { STORAGE_KEY } from '../store/persistence';
import { installFakeStorage } from '../store/testStorage';
import { App } from './App';

vi.mock('./download', () => ({ downloadText: vi.fn() }));

beforeEach(() => {
  useAppStore.setState({
    ...defaultState(),
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: false, lastActionError: null },
  });
});

describe('a refused document opens the recovery screen (B01/B17/B18)', () => {
  it('shows recovery, never the intro or setup, and states that writes are paused', () => {
    installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });
    const { container } = render(<App />);
    expect(screen.getByRole('heading', { name: copyFor('limelight', 'hero.storedDataRefused') })).toBeInTheDocument();
    expect(screen.getByText(copyFor('limelight', 'status.writesPaused'))).toBeInTheDocument();
    expect(container.querySelector('section.intro')).toBeNull();
    expect(container.querySelector('.wiz')).toBeNull();
  });

  it('names an unreachable store differently (B17)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    render(<App />);
    expect(screen.getByRole('heading', { name: copyFor('limelight', 'hero.storageUnreadable') })).toBeInTheDocument();
  });

  it('offers the typed wipe from the recovery screen', () => {
    installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.wipeAll') }));
    expect(screen.getByRole('button', { name: copyFor('limelight', 'button.wipeConfirm') })).toBeDisabled();
  });
});
