// src/ui/motivation/MotivationGate.tsx
//
// The one line the app shell mounts for the weekly-miss popup (P6 Task 5). It decides WHETHER
// the popup is on screen; MotivationModal decides what it shows and what a dismissal writes.
//
// The split matters, because the dismissal is a store write with a side effect. The modal calls
// markMotivationShown itself (Task 4), and that action sweeps every OLDER unhandled miss to
// handled as well (motivationActions.ts). A gate that also called it would run that sweep a
// second time, so this file never writes: it reads the pending week, mounts the modal, and
// unmounts it because usePendingMotivation has gone null under it.

import type { ReactElement } from 'react';
import { MotivationModal } from './MotivationModal';
import { useAppStore } from '../../store';
import { usePendingMotivation } from '../../store/selectors';

/**
 * What the modal calls once it has recorded the dismissal.
 *
 * Nothing, deliberately, and hoisted so the modal's dismiss callback keeps one identity across
 * renders. markMotivationShown writes both `motivation.lastShownForWeek` and the review's
 * `missHandled`, and `pendingMotivation` skips a week on either, so the selector this gate reads
 * returns null on the very next render and the modal unmounts. There is no local "dismissed"
 * flag here for the same reason: a second source of truth could disagree with the store, and the
 * store is the one that survives a reload.
 */
const CLOSED_BY_THE_STORE = (): void => {
  /* the store write is the close; see the note above */
};

/**
 * Mounts the motivation popup when P3's weekly close has left an unhandled missed week.
 *
 * Three conditions have to hold together, and none of them is a fact the modal can supply for
 * itself:
 *
 *  - a week is pending. `usePendingMotivation` owns that question in full: a miss (delta < 0),
 *    not paused, not already handled, not the week last shown, and closed inside
 *    MOTIVATION_MISS_WINDOW_DAYS = 14. An older miss is never offered.
 *  - a profile is active. markMotivationShown throws on an unknown profile, so mounting the
 *    modal without one would arm a control that cannot be used. It is also what keeps the popup
 *    off the setup wizard, which is the whole screen precisely while no profile exists.
 *  - no session is in progress. `session.activeAssignmentDate` is "the civil day the user is
 *    training, once a session has been opened on it" (sessionMirror.ts), so a non-null value
 *    means sets are being logged and a rest timer may be running. Confronting the user with a
 *    missed week mid-workout would interrupt the work that fixes it.
 *
 * Not gated on the old console's document (`fti.console.v2`). Its import is gone (ROADMAP N5),
 * so the key offers nothing and holds nothing back; it used to suppress the popup while the
 * import wizard was on screen.
 *
 * Not gated on the readiness screen. A profile whose `readiness.screenedAt` is still null has
 * just been created, so it has no plan cursor, so `closeWeeks` has produced no WeeklyReview for
 * it and `usePendingMotivation` is null anyway. The condition would be dead code.
 */
export function MotivationGate(): ReactElement | null {
  const review = usePendingMotivation();
  const profileId = useAppStore((s) => s.activeProfileId);
  const activeAssignmentDate = useAppStore((s) => s.session.activeAssignmentDate);

  if (review === null || profileId === null) return null;
  if (activeAssignmentDate !== null) return null;

  return (
    <MotivationModal review={review} profileId={profileId} onDismiss={CLOSED_BY_THE_STORE} />
  );
}
