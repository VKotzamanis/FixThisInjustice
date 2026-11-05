import { describe, expect, it } from 'vitest';
import { defaultState } from '../domain/schema';
import type { AppState, PlanCursor, SessionAssignment } from '../domain/types';
import { applyUndoFinish, type FinishSnapshot } from './finishUndo';

const P = 'p1';
const open: SessionAssignment = {
  date: '2026-03-02', sessionId: 's1', sourceIndex: 0, status: 'in-progress',
  startedAt: 1_000, completedAt: null, skipReason: null, // [ms] epoch UTC
};
const done: SessionAssignment = { ...open, status: 'completed', completedAt: 2_000 };
const cursorBefore: PlanCursor = { planId: 'plan', nextSessionIndex: 0, startedOn: '2026-03-02', completedOn: null };
const cursorAfter: PlanCursor = { ...cursorBefore, nextSessionIndex: 1 };

function finished(): AppState {
  return { ...defaultState(), assignments: { [P]: [done] }, cursors: { [P]: cursorAfter }, weeklyReviews: { [P]: [] } };
}

describe('applyUndoFinish (audit C12)', () => {
  it('restores the row and the cursor exactly', () => {
    const s = finished();
    const snap: FinishSnapshot = {
      profileId: P,
      before: { assignment: open, cursor: cursorBefore },
      after: { assignment: done, cursor: cursorAfter, reviews: s.weeklyReviews[P] },
    };
    const next = applyUndoFinish(s, snap);
    expect(next?.assignments[P]).toEqual([open]);
    expect(next?.cursors[P]).toBe(cursorBefore);
  });

  it('refuses when anything it would rewind has moved since', () => {
    const s = finished();
    const snap: FinishSnapshot = {
      profileId: P,
      before: { assignment: open, cursor: cursorBefore },
      after: { assignment: done, cursor: cursorAfter, reviews: s.weeklyReviews[P] },
    };
    expect(applyUndoFinish({ ...s, cursors: { [P]: { ...cursorAfter } } }, snap)).toBeNull();
    expect(applyUndoFinish({ ...s, weeklyReviews: { [P]: [] } }, snap)).toBeNull();
    expect(applyUndoFinish({ ...s, assignments: { [P]: [{ ...done }] } }, snap)).toBeNull();
  });
});
