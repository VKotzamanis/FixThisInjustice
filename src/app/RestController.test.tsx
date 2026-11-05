// Audit C06, C11: one app-level rest controller fires the rest-over cues once per interval,
// whichever view is on screen, gated on ui.sounds, with a notification while hidden.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extend } from '../domain/training/restTimer';
import { useAppStore } from '../store';
import { EMPTY_SESSION } from '../store/sessionMirror';
import { makeAppState, makeUiPrefs } from '../test/funFixtures';
import { REST_OVER_GRACE_MS, RestController, VIBRATE_PATTERN } from './RestController';

const playChime = vi.hoisted(() => vi.fn(() => true));
const vibrate = vi.hoisted(() => vi.fn(() => true));
vi.mock('../ui/audio/chime', () => ({ playChime, vibrate }));
const playSfx = vi.hoisted(() => vi.fn());
vi.mock('../skins/sfx', () => ({ playSfx }));

/** [ms] epoch UTC. */
const NOW = Date.UTC(2026, 2, 2, 10, 0, 0);
const REST_MS = 90_000; // [ms]

function seed(sounds: boolean): void {
  useAppStore.setState({ ...makeAppState({ ui: makeUiPrefs({ skin: 'limelight', sounds }) }), session: EMPTY_SESSION });
  useAppStore.getState().setRestTimer({ startedAt: NOW, endsAt: NOW + REST_MS, durationS: REST_MS / 1000 });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(NOW);
  playChime.mockClear();
  vibrate.mockClear();
  playSfx.mockClear();
});

afterEach(() => {
  useAppStore.getState().setRestTimer(null);
  vi.useRealTimers();
});

describe('RestController (C06, C11)', () => {
  it('fires the cues once at the end of the rest, with no view mounted at all', () => {
    seed(true);
    render(<RestController />);
    act(() => {
      vi.advanceTimersByTime(REST_MS - 1);
    });
    expect(playSfx).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(playChime).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith('rest_over');
    expect(vibrate).toHaveBeenCalledWith(VIBRATE_PATTERN);
    act(() => {
      vi.advanceTimersByTime(60_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it('plays no chime with ui.sounds off (C11)', () => {
    seed(false);
    render(<RestController />);
    act(() => {
      vi.advanceTimersByTime(REST_MS);
    });
    expect(playChime).not.toHaveBeenCalled();
    // The sample gates itself inside sfx.ts; vibration is not a sound.
    expect(playSfx).toHaveBeenCalledWith('rest_over');
  });

  it('re-arms for an extension and fires once at the new end', () => {
    seed(true);
    render(<RestController />);
    act(() => {
      const timer = useAppStore.getState().session.restTimer;
      if (timer !== null) useAppStore.getState().setRestTimer(extend(timer, 30)); // [s]
    });
    act(() => {
      vi.advanceTimersByTime(REST_MS);
    });
    expect(playChime).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it('is silent for a rest that ended long before the app looked (relaunch, frozen tab)', () => {
    seed(true);
    vi.setSystemTime(NOW + REST_MS + REST_OVER_GRACE_MS + 1);
    render(<RestController />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(playChime).not.toHaveBeenCalled();
    expect(playSfx).not.toHaveBeenCalled();
  });

  it('posts the notification when the rest ends while the page is hidden', async () => {
    const showNotification = vi.fn(() => Promise.resolve());
    vi.stubGlobal('Notification', { permission: 'granted' });
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ showNotification }) },
      configurable: true,
    });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    seed(true);
    render(<RestController />);
    await act(async () => {
      vi.advanceTimersByTime(REST_MS);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(showNotification).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Reflect.deleteProperty(navigator, 'serviceWorker');
    vi.unstubAllGlobals();
  });
});
