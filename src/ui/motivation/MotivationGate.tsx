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

import { useState } from 'react';
import type { ReactElement } from 'react';
import { MotivationModal } from './MotivationModal';
import { hasLegacyV2 } from '../../store/persistence';
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
 * Four conditions have to hold together, and none of them is a fact the modal can supply for
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
 *  - the legacy migration is not being offered. See the latch below.
 *
 * Not gated on the readiness screen. A profile whose `readiness.screenedAt` is still null has
 * just been created, so it has no plan cursor, so `closeWeeks` has produced no WeeklyReview for
 * it and `usePendingMotivation` is null anyway. The condition would be dead code.
 */
export function MotivationGate(): ReactElement | null {
  const review = usePendingMotivation();
  const profileId = useAppStore((s) => s.activeProfileId);
  const activeAssignmentDate = useAppStore((s) => s.session.activeAssignmentDate);
  const legacyDecision = useAppStore((s) => s.ui.legacyMigration);

  /*
   * Read once per mount, as MigrationGate reads it: the legacy key does not appear while the
   * app is open, and it DISAPPEARS when the wizard's delete step runs, which must not be read
   * as "the migration is over" a frame before the wizard says so.
   */
  const [legacyPresent] = useState<boolean>(() => hasLegacyV2());

  /*
   * Latched, and deliberately not the live condition alone.
   *
   * The live condition is the one MigrationGate mounts on: a legacy document exists and the
   * decision is still 'pending'. But applyMigration writes ui.legacyMigration = 'done' as part
   * of the document it installs, while the wizard is still on screen making its last offer to
   * delete the old data. A gate reading only the live condition would therefore un-suppress
   * mid-wizard and paint a second modal over a destructive confirmation, with two ModalShells
   * fighting over focus and the scroll lock.
   *
   * The cost of the latch is that a user who migrates or dismisses the offer in this session
   * sees the popup on the next app open rather than immediately. That is the right way round:
   * the popup is a once-per-week nudge, and the migration is a one-way data decision.
   *
   * Setting state during render is React's documented way to derive state from a changed input;
   * it re-renders before committing, so no extra paint is shown.
   */
  const migrationOffered = legacyPresent && legacyDecision === 'pending';
  const [suppressedByMigration, setSuppressedByMigration] = useState(migrationOffered);
  if (migrationOffered && !suppressedByMigration) setSuppressedByMigration(true);

  if (suppressedByMigration) return null;
  if (review === null || profileId === null) return null;
  if (activeAssignmentDate !== null) return null;

  return (
    <MotivationModal review={review} profileId={profileId} onDismiss={CLOSED_BY_THE_STORE} />
  );
}
