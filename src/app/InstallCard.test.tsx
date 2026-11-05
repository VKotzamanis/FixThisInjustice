import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { copyFor } from '../content/copy';
import { useAppStore } from '../store';
import { installFakeStorage } from '../store/testStorage';
import { MONDAY, NOW_MS, PROFILE_ID, seedState } from '../test/scheduleFixtures';
import { InstallCard } from './InstallCard';
import { startInstallPromptCapture } from './installPrompt';

let stop: (() => void) | null = null;

beforeEach(() => {
  installFakeStorage();
  useAppStore.setState(seedState({ labels: ['Push'], weekdays: [1], startedOn: MONDAY }));
  stop = startInstallPromptCapture();
});

afterEach(() => {
  stop?.();
  stop = null;
});

const heading = (): HTMLElement | null =>
  screen.queryByRole('heading', { name: copyFor('limelight', 'hero.installHomeScreen') });

describe('InstallCard (spec R8, audit E04)', () => {
  it('shows the written steps in a browser tab, without the reminder sentence', () => {
    render(<InstallCard />);
    expect(heading()).toBeInTheDocument();
    expect(screen.getByText(copyFor('limelight', 'status.installIosShare'))).toBeInTheDocument();
    expect(screen.queryByText(copyFor('limelight', 'advice.installOnlyInstalledApp'))).toBeNull();
  });

  it('offers the Android install prompt when Chromium provides one', async () => {
    const prompt = vi.fn(() => Promise.resolve({ outcome: 'accepted' as const }));
    render(<InstallCard />);
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.installApp') }));
      await Promise.resolve();
    });
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('stays dismissed: the choice is stored in the document', () => {
    render(<InstallCard />);
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.dismiss') }));
    expect(heading()).toBeNull();
    expect(useAppStore.getState().ui.installNudgeDismissed).toBe(true);
  });

  it('is absent before setup and while a session is open', () => {
    useAppStore.setState({ activeProfileId: null });
    const before = render(<InstallCard />);
    expect(heading()).toBeNull();
    before.unmount();
    useAppStore.setState(seedState({ labels: ['Push'], weekdays: [1], startedOn: MONDAY }));
    useAppStore.setState({
      assignments: {
        [PROFILE_ID]: [
          {
            date: MONDAY,
            sessionId: 's-0',
            sourceIndex: 0,
            status: 'in-progress',
            startedAt: NOW_MS, // [ms] epoch, UTC
            completedAt: null,
            skipReason: null,
          },
        ],
      },
    });
    render(<InstallCard />);
    expect(heading()).toBeNull();
  });

  it('is absent once the app is installed', () => {
    render(<InstallCard />);
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(heading()).toBeNull();
  });
});
