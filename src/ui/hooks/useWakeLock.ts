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
 *
 * A held lock can also go away without anyone asking. The sentinel fires "release" when the
 * platform drops it (document hidden, battery saver, user revocation), and that event is the
 * only notification: a hook that does not listen for it goes on reporting "active" for a lock
 * it no longer holds.
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
    // True from the moment request('screen') is called until it settles. See the in-flight
    // guard in `acquire`.
    let requesting = false;
    // Bounds the retry driven by the sentinel's own "release" event to one per effect run.
    let retriedAfterRelease = false;

    /** Drops the reference to a sentinel and detaches our listener from it. */
    const forget = (): WakeLockSentinel | null => {
      const held = sentinel;
      sentinel = null;
      if (held !== null) held.removeEventListener('release', onRelease);
      return held;
    };

    const onRelease = (): void => {
      // The platform releases the lock on its own: the document is hidden, a battery saver
      // engages, or the user revokes it. Nothing else tells us, so without this listener the
      // hook keeps reporting "active" for a lock it no longer holds. The sentinel is spent
      // once this fires and is dropped rather than released again.
      forget();
      if (cancelled) return; // the effect was torn down, i.e. `active` is no longer true
      setStatus('released');
      // Re-request only while the document is visible: every implementation refuses a hidden
      // request, and the visibilitychange handler below takes the lock back on return. Once
      // per effect run, so a platform that granted and immediately released on every attempt
      // cannot spin; visibilitychange remains the unbounded recovery path.
      if (!retriedAfterRelease && document.visibilityState === 'visible') {
        retriedAfterRelease = true;
        void acquire();
      }
    };

    const acquire = async (): Promise<void> => {
      // In-flight guard. request('screen') is async and two paths reach `acquire` (mount and
      // visibilitychange), so without `requesting` a second call can start while the first is
      // still pending; both resolve, the second assignment overwrites the first sentinel, and
      // that first lock is then held with no reference left to release it.
      if (cancelled || requesting || sentinel !== null) return;
      requesting = true;
      try {
        const next = await api.request('screen');
        if (cancelled) {
          void next.release(); // the component went away while the request was in flight
          return;
        }
        next.addEventListener('release', onRelease);
        sentinel = next;
        setStatus('active');
      } catch {
        // The browser refuses while the document is hidden, under a battery saver, and inside
        // a browser tab on iOS < 18.4. The session is unaffected; only the screen sleeps.
        if (!cancelled) setStatus('denied');
      } finally {
        requesting = false;
      }
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        void acquire(); // the platform dropped the lock while we were hidden
        return;
      }
      forget(); // the platform has already released it; only the reference is ours to drop
      setStatus('released');
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const held = forget();
      if (held !== null) void held.release();
    };
  }, [active]);

  return status;
}
