// src/domain/training/swapProgression.test.ts
//
// ROADMAP R4 (lead ruling 2026-11-05): sets logged on a swapped-in exercise at a slot whose rep
// range differs from the substitute's OWN planned slot range stay in history and records but are
// excluded from that exercise's progression. A substitute with no own slot keeps the previous
// behaviour (every non-bonus set counts). The audit's example: Romanian deadlift 6-8 swapped to
// trap-bar deadlift, whose own slot is 4-6; 3 x 40 kg x 8 on the swap day used to give "Add
// 2.5 kg and reset to 4 repetitions" on the own 4-6 slot (underloaded).
import { describe, expect, it } from 'vitest';
import { EXERCISE_BY_ID } from '../plan/library';
import { makeBlock, makeProfile, makeSet } from '../../test/fixtures';
import type { Exercise, LoggedSet, PlannedExercise, PlanTemplate, SessionAssignment } from '../types';
import { progressionHistory, suggestedProgression } from './progression';
import { swapDayPrescriptions } from './sessionEdits';

const TRAP = 'trap-bar-deadlift';
const RDL = 'romanian-deadlift';

function exercise(id: string): Exercise {
  const ex = EXERCISE_BY_ID[id];
  if (ex === undefined) throw new Error(`library has no ${id}`);
  return ex;
}

const OWN_SLOT: PlannedExercise = {
  exerciseId: TRAP,
  setsLo: 3, // [sets]
  setsHi: 3, // [sets]
  prescription: { kind: 'reps', lo: 4, hi: 6 }, // [repetitions] heavy
  restS: 180, // [s]
};
const RDL_SLOT: PlannedExercise = {
  exerciseId: RDL,
  setsLo: 3, // [sets]
  setsHi: 3, // [sets]
  prescription: { kind: 'reps', lo: 6, hi: 8 }, // [repetitions] moderate
  restS: 150, // [s]
};

function plan(withOwnSlot: boolean): PlanTemplate {
  return {
    id: 'plan-1',
    version: 1,
    name: 'Lower x2',
    sessionsPerWeek: 2, // [sessions/week]
    weeks: 8, // [weeks]
    sessions: [
      { id: 'lower-a', ordinal: 1, name: 'Lower A', kind: 'lift', label: 'Lower A', exercises: withOwnSlot ? [OWN_SLOT] : [] },
      { id: 'lower-b', ordinal: 2, name: 'Lower B', kind: 'lift', label: 'Lower B', exercises: [RDL_SLOT] },
    ],
    blocks: [makeBlock()],
  };
}

const ASSIGNMENTS: SessionAssignment[] = [
  { date: '2026-03-02', sessionId: 'lower-a', sourceIndex: 0, status: 'completed', startedAt: null, completedAt: null, skipReason: null },
  {
    date: '2026-03-04',
    sessionId: 'lower-b',
    sourceIndex: 1,
    status: 'completed',
    startedAt: null,
    completedAt: null,
    skipReason: null,
    edits: { swaps: { [RDL]: TRAP }, skipped: [], added: [], order: [] },
  },
];

function sets(): LoggedSet[] {
  const own = [1, 2, 3].map((n) =>
    makeSet({ exerciseId: TRAP, assignmentDate: '2026-03-02', sessionId: 'lower-a', setNumber: n, loadKg: 60, reps: 5 }),
  );
  const swapDay = [1, 2, 3].map((n) =>
    makeSet({ exerciseId: TRAP, assignmentDate: '2026-03-04', sessionId: 'lower-b', setNumber: n, loadKg: 40, reps: 8 }),
  );
  return [...own, ...swapDay];
}

const LIBRARY = { [TRAP]: exercise(TRAP), [RDL]: exercise(RDL) };

describe('swap-day sets and the substitute\'s own progression (ROADMAP R4)', () => {
  it('reads the swap day as the RDL slot re-prescribed for the trap bar: 6-8', () => {
    const days = swapDayPrescriptions(TRAP, ASSIGNMENTS, { 'plan-1': plan(true) }, LIBRARY);
    expect([...days.entries()]).toEqual([['2026-03-04', { kind: 'reps', lo: 6, hi: 8 }]]);
  });

  it('leaves the 6-8 swap day out of the trap bar\'s own 4-6 progression', () => {
    const p = plan(true);
    const history = progressionHistory(sets(), OWN_SLOT, TRAP, ASSIGNMENTS, { [p.id]: p }, p, LIBRARY);
    expect(history.map((s) => s.assignmentDate)).toEqual(['2026-03-02', '2026-03-02', '2026-03-02']);
    const advice = suggestedProgression(history, OWN_SLOT, exercise(TRAP), makeProfile(), makeBlock());
    // Own day: 3 x 60 kg x 5 against 4-6, top not reached, so hold 60 kg (not +2.5 kg from 40).
    expect(advice.kind).toBe('hold');
    expect(advice.loadKg).toBe(60);
  });

  it('before the ruling the same history underloaded the own slot (the audit\'s measurement)', () => {
    const advice = suggestedProgression(sets(), OWN_SLOT, exercise(TRAP), makeProfile(), makeBlock());
    expect(advice.kind).toBe('add-load');
    expect(advice.loadKg).toBeLessThan(60);
  });

  it('keeps every set when the substitute has no own slot (behaviour unchanged)', () => {
    const p = plan(false);
    const all = sets();
    expect(progressionHistory(all, OWN_SLOT, TRAP, ASSIGNMENTS, { [p.id]: p }, p, LIBRARY)).toEqual(all);
  });

  it('keeps swap-day sets whose slot range equals the own slot range', () => {
    const p = plan(true);
    const sameRange: PlannedExercise = { ...OWN_SLOT, prescription: { kind: 'reps', lo: 6, hi: 8 } };
    const ownSix: PlanTemplate = { ...p, sessions: p.sessions.map((s) => (s.id === 'lower-a' ? { ...s, exercises: [sameRange] } : s)) };
    const all = sets();
    expect(progressionHistory(all, sameRange, TRAP, ASSIGNMENTS, { [ownSix.id]: ownSix }, ownSix, LIBRARY)).toEqual(all);
  });

  it('keeps the swap-day sets on the history itself: only the progression input drops them', () => {
    const p = plan(true);
    const all = sets();
    progressionHistory(all, OWN_SLOT, TRAP, ASSIGNMENTS, { [p.id]: p }, p, LIBRARY);
    expect(all).toHaveLength(6);
  });
});
