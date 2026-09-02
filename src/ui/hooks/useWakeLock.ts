/**
 * Hold a Screen Wake Lock while a component is on screen (master plan section 6.5: the Train
 * view holds one for the duration of a session, so the phone does not sleep between sets).
 *
 * Support, from REFERENCES.md: caniuse.com/wake-lock gives iOS Safari 16.4+ and Chrome on
 * Android, and WebKit bug 254545 records that the API was broken inside installed Home Screen
 * web apps until iOS/iPadOS 18.4, which is this project's platform floor. The API is also
 * absent from jsdom. Absence and refusal are therefore ordinary runtime states: they are
 * reported through the returned status and never thrown, because a session that cannot dim-lock
 * the screen still has a working timer.
 */
import { useEffect, useState } from 'react';

export type WakeLockStatus = 'active' | 'unsupported' | 'denied' | 'released';

function wakeLockApi(): WakeLock | null {
  if (typeof navigator === 'undefined') return null;
  if (!('wakeLock' in navigator)) return null; // jsdom, Safari < 16.4, and every older browser
  return navigator.wakeLock;
}

/**
 * @param active true while the lock should be held. Flipping it to false, or unmounting,
 *               releases the lock.
 * @returns the current status: "active" while the lock is held, "unsupported" where the API
 *          does not exist, "denied" where the browser refused it, "released" otherwise.
 */
export function useWakeLock(active: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>(() =>
    wakeLockApi() === null ? 'unsupported' : 'released',
  );

  useEffect(() => {
    const api = wakeLockApi();
    if (api === null) {
      setStatus('unsupported');
      return;
    }
    if (!active) {
      setStatus('released');
      return;
    }

    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    const acquire = async (): Promise<void> => {
      if (cancelled || sentinel !== null) return;
      try {
        const next = await api.request('screen');
        if (cancelled) {
          void next.release(); // the component went away while the request was in flight
          return;
        }
        sentinel = next;
        setStatus('active');
      } catch {
        // The browser refuses while the document is hidden, under a battery saver, and inside
        // a browser tab on iOS < 18.4. The session is unaffected; only the screen sleeps.
        if (!cancelled) setStatus('denied');
      }
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        void acquire(); // the platform dropped the lock while we were hidden
        return;
      }
      sentinel = null;
      setStatus('released');
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const held = sentinel;
      sentinel = null;
      if (held !== null) void held.release();
    };
  }, [active]);

  return status;
}
