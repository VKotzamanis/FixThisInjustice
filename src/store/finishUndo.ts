// src/store/finishUndo.ts
//
// Audit C12: Finish can be taken back for UNDO_WINDOW_MS. The view snapshots the assignment row
// and the cursor before and after completeSession; the undo puts the BEFORE records back only if
// the AFTER records (and the week's reviews) are still the stored objects, so it never rewinds
// a state another action has moved on from (a graded week above all).
import type { AppState, PlanCursor, SessionAssignment, WeeklyReview } from '../domain/types';

export interface FinishSnapshot {
  profileId: string;
  before: { assignment: SessionAssignment; cursor: PlanCursor };
  after: { assignment: SessionAssignment; cursor: PlanCursor; reviews: readonly WeeklyReview[] | undefined };
}

/** The state with the pre-Finish row and cursor restored, or null when something moved since. */
export function applyUndoFinish(state: AppState, snap: FinishSnapshot): AppState | null {
  const { profileId } = snap;
  const rows = state.assignments[profileId] ?? [];
  const current = rows.find((a) => a.date === snap.after.assignment.date);
  if (current !== snap.after.assignment) return null;
  if (state.cursors[profileId] !== snap.after.cursor) return null;
  if (state.weeklyReviews[profileId] !== snap.after.reviews) return null;
  return {
    ...state,
    assignments: { ...state.assignments, [profileId]: rows.map((a) => (a === current ? snap.before.assignment : a)) },
    cursors: { ...state.cursors, [profileId]: snap.before.cursor },
  };
}
