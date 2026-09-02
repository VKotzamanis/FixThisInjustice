// src/app/useWeeklyClose.ts
//
// Closes every finished ISO week on mount and whenever the tab becomes visible again.
//
// The legacy app recomputed nothing on a clock tick (code review A13), so an app left open
// across midnight kept showing yesterday. Weekly closure is the one piece of state that must
// catch up with the wall clock, and it does so on visibility rather than on a timer: a timer
// in a backgrounded tab is throttled to minutes on mobile and burns a wake-up when it is not,
// while the moment that matters is exactly the moment the user comes back.
//
// Rate limiting. Restoring a tab does not fire one visibilitychange, it fires a burst (and
// bfcache restores add their own), and each one would otherwise walk every week since the
// plan started. The limit is a LEADING-EDGE THROTTLE, not a trailing debounce: the first
// event of a burst runs immediately and the rest of the window is dropped. A trailing
// debounce would be the wrong shape here, because it would defer the catch-up past the render
// that needs it and leave the first paint after a restore showing last week.
//
// The mount run is not throttled. It happens once per hook instance, it is what makes the
// first paint correct, and it is not part of any burst.
//
// closeWeeks is idempotent (weekly.ts: a call with nothing to close returns the same state
// reference, and zustand's set() then does not notify), so a run this throttle lets through
// unnecessarily costs a walk and nothing else. That is what makes the leading edge safe to
// take: the throttle protects the CPU, never correctness.

import { useEffect } from 'react';
import type { EpochMs } from '../domain/types';
import { useAppStore } from '../store';

/**
 * [ms] Throttle window for visibility-driven closures. One second is far longer than the
 * burst a single tab restore produces and far shorter than any interval in which a week can
 * end, so it cannot delay a real close.
 */
export const WEEKLY_CLOSE_THROTTLE_MS = 1000;

export function useWeeklyClose(): void {
  const profileId = useAppStore((s) => s.activeProfileId);

  useEffect(() => {
    if (profileId === null) return;

    /*
     * [ms] epoch, UTC. When the last VISIBILITY-driven close ran; the mount run below does
     * not set it. The two are different triggers: mount fires once per hook instance and is
     * what makes the first paint correct, while the throttle exists to collapse a burst of
     * events. Arming the window from mount would swallow the first genuine visibility event
     * whenever it arrived within the window of the mount, which is exactly what a restore
     * from bfcache looks like. Negative infinity, so the first event is never inside it.
     */
    let lastVisibilityRunAt = Number.NEGATIVE_INFINITY;

    /*
     * Reached through getState() rather than subscribed to, which is how every action call in
     * this codebase is written (App.tsx): the store's actions are created once and never
     * replace themselves, so subscribing buys nothing and hands the caller an unbound method.
     * It also keeps the effect's dependency list down to the one thing that can really change.
     *
     * The clock is read once per run and passed down, so the throttle and the closure it
     * guards can never disagree about what time it is.
     */
    const close = (now: EpochMs): void => {
      useAppStore.getState().closeWeeks(profileId, now); // [ms] epoch, UTC
    };

    close(Date.now());

    const onVisibility = (): void => {
      if (document.visibilityState !== 'visible') return;
      const now: EpochMs = Date.now(); // [ms] epoch, UTC
      // A wall clock that jumps backwards (a manual change, an NTP correction) can only
      // suppress closures for one window, and the next event runs them.
      if (now - lastVisibilityRunAt < WEEKLY_CLOSE_THROTTLE_MS) return;
      lastVisibilityRunAt = now;
      close(now);
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [profileId]);
}
