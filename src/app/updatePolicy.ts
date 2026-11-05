// src/app/updatePolicy.ts
//
// Spec R7 (audit E01): what to do with a new build the service worker has installed and is
// holding in `waiting`. Pure; src/app/updateController.ts feeds it the page's facts.
//
//   apply  activate it now (the page reloads onto the new build): nothing is lost and nobody
//          is looking, i.e. no session is open AND either the page is hidden or the user has not
//          touched it since it last became visible (a cold launch, or a resume from the app
//          switcher before the first tap).
//   prompt show the banner: a session is open. The user decides; a live session is never
//          reloaded under them (rejected: autoUpdate, which reloads mid-workout).
//   defer  no session, but the user is using the page: wait for the next hidden or fresh-visible
//          moment rather than reload under a tap.
export type UpdateDecision = 'apply' | 'prompt' | 'defer';

export interface UpdateFacts {
  /** Any profile has an in-progress session (spec R1 open assignment). */
  sessionOpen: boolean;
  /** document.visibilityState === 'hidden'. */
  hidden: boolean;
  /** A pointerdown or keydown reached the page since it last became visible (or loaded). */
  interacted: boolean;
}

export function decideUpdate(facts: UpdateFacts): UpdateDecision {
  if (facts.sessionOpen) return 'prompt';
  if (facts.hidden || !facts.interacted) return 'apply';
  return 'defer';
}

/** [ms] Spec R7: the interval between update checks while the page stays open. 30 min. */
export const UPDATE_POLL_INTERVAL_MS = 30 * 60 * 1000;
