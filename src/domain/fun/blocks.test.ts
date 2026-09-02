// src/domain/fun/blocks.test.ts
//
// The block cursor, the milestone interval and the per-block roll-up (P8 Task 10).
//
// Deviations from the P8 plan's Task 10 Step 1 literal, recorded here rather than by editing
// the plan:
//  - The shared fixture plan (src/test/migrationFactories.ts makePlan) carries TWO blocks,
//    0-19 and 20-23, not the three eight-session blocks the plan's literal assumes. The
//    boundaries are therefore stated here, as an explicit `blocks` patch, so the assertions
//    read against numbers this file owns and a change to the shared fixture cannot silently
//    move them.
//  - Repo style: single quotes, [unit] comments.
import { describe, expect, it } from 'vitest';
import {
  SET_MILESTONES,
  blockOf,
  blockStats,
  crossedMilestones,
  currentBlockIndex,
  isBlockBoundary,
} from './blocks';
import { makeAppState, makePlan } from '../../test/funFixtures';
import type { LoggedSet, PlanBlock, PlanCursor, SessionAssignment } from '../types';

/** Three eight-session blocks: 0-7, 8-15, 16-23. */
const BLOCKS: PlanBlock[] = [
  {
    index: 0,
    firstSessionIndex: 0, // [sessions] offset
    sessionCount: 8, // [sessions]
    setModifier: 1, // dimensionless
    loadModifier: 1, // dimensionless
    isDeload: false,
  },
  {
    index: 1,
    firstSessionIndex: 8, // [sessions] offset
    sessionCount: 8, // [sessions]
    setModifier: 1, // dimensionless
    loadModifier: 1, // dimensionless
    isDeload: false,
  },
  {
    index: 2,
    firstSessionIndex: 16, // [sessions] offset
    sessionCount: 8, // [sessions]
    setModifier: 0.5, // dimensionless
    loadModifier: 1, // dimensionless
    isDeload: true,
  },
];

const plan = makePlan({ blocks: BLOCKS });

const cursorAt = (n: number): PlanCursor => ({
  planId: plan.id,
  nextSessionIndex: n, // [sessions] offset
  startedOn: '2026-09-07',
  completedOn: null,
});

describe('currentBlockIndex', () => {
  it('maps a cursor position onto its block', () => {
    expect(currentBlockIndex(plan, cursorAt(0))).toBe(0);
    expect(currentBlockIndex(plan, cursorAt(7))).toBe(0);
    expect(currentBlockIndex(plan, cursorAt(8))).toBe(1);
    expect(currentBlockIndex(plan, cursorAt(15))).toBe(1);
    expect(currentBlockIndex(plan, cursorAt(16))).toBe(2);
  });

  it('stays in the final block once the plan is finished', () => {
    expect(currentBlockIndex(plan, cursorAt(24))).toBe(2);
    expect(currentBlockIndex(plan, cursorAt(999))).toBe(2);
  });

  it('returns the first block for a cursor below the first block start', () => {
    expect(currentBlockIndex(plan, cursorAt(-3))).toBe(0);
  });

  it('returns 0 for a plan with no blocks', () => {
    expect(currentBlockIndex(makePlan({ blocks: [] }), cursorAt(5))).toBe(0);
  });
});

describe('blockOf', () => {
  it('returns the block record the cursor stands in', () => {
    expect(blockOf(cursorAt(9), plan)?.index).toBe(1);
    expect(blockOf(cursorAt(9), plan)?.firstSessionIndex).toBe(8);
  });

  it('returns null for a plan with no blocks', () => {
    expect(blockOf(cursorAt(9), makePlan({ blocks: [] }))).toBeNull();
  });
});

describe('isBlockBoundary', () => {
  it('is true only when the later index is ahead of the earlier one', () => {
    expect(isBlockBoundary(0, 1)).toBe(true);
    expect(isBlockBoundary(0, 2)).toBe(true);
    expect(isBlockBoundary(1, 1)).toBe(false);
    // Browsing backwards, or a cursor moved back by an undone session, crosses nothing.
    expect(isBlockBoundary(2, 1)).toBe(false);
  });
});

describe('crossedMilestones', () => {
  it('returns the milestone reached by a single increment', () => {
    expect(crossedMilestones(49, 50)).toEqual([50]);
  });

  // G11: A46 - a batched double increment must not step over a milestone.
  it('returns a milestone stepped over by a jump', () => {
    expect(crossedMilestones(49, 51)).toEqual([50]);
  });

  it('returns every milestone inside a large jump', () => {
    expect(crossedMilestones(40, 300)).toEqual([50, 100, 250]);
  });

  it('returns nothing when no milestone lies in the interval', () => {
    expect(crossedMilestones(51, 60)).toEqual([]);
    expect(crossedMilestones(50, 50)).toEqual([]);
  });

  it('returns nothing for a decreasing count', () => {
    expect(crossedMilestones(100, 99)).toEqual([]);
  });

  it('declares the milestone set', () => {
    expect(SET_MILESTONES).toEqual([50, 100, 250, 500, 1000]);
  });
});

describe('blockStats', () => {
  function stateWithBlockOneWork(): ReturnType<typeof makeAppState> {
    const assignments: SessionAssignment[] = [
      // sourceIndex 8 and 9 are inside block 1.
      {
        date: '2026-11-02',
        sessionId: 's9',
        sourceIndex: 8,
        status: 'completed',
        startedAt: 1, // [ms] epoch UTC
        completedAt: 2, // [ms] epoch UTC
        skipReason: null,
      },
      {
        date: '2026-11-03',
        sessionId: 's10',
        sourceIndex: 9,
        status: 'completed',
        startedAt: 1, // [ms] epoch UTC
        completedAt: 2, // [ms] epoch UTC
        skipReason: null,
      },
      // sourceIndex 2 is inside block 0 and must not be counted.
      {
        date: '2026-09-10',
        sessionId: 's3',
        sourceIndex: 2,
        status: 'completed',
        startedAt: 1, // [ms] epoch UTC
        completedAt: 2, // [ms] epoch UTC
        skipReason: null,
      },
      // A skipped session inside block 1 is not a completed session.
      {
        date: '2026-11-04',
        sessionId: 's11',
        sourceIndex: 10,
        status: 'skipped',
        startedAt: null,
        completedAt: null,
        skipReason: 'ill',
      },
    ];
    const set = (
      id: string,
      date: string,
      sessionId: string,
      loadKg: number | null,
      reps: number | null,
    ): LoggedSet => ({
      id,
      profileId: 'p1',
      assignmentDate: date,
      sessionId,
      exerciseId: 'barbell-bench-press',
      setNumber: 1,
      isBonus: false,
      loadKg, // [kg]; 0 is bodyweight, null is not recorded
      enteredUnit: 'metric',
      reps, // [repetitions]
      durationS: null, // [s]
      rpe: 7,
      loggedAt: 1, // [ms] epoch UTC
    });
    return makeAppState({
      plans: { [plan.id]: plan },
      assignments: { p1: assignments },
      sets: {
        a: set('a', '2026-11-02', 's9', 60, 8), // 480 kg
        b: set('b', '2026-11-03', 's10', 100, 5), // 500 kg
        c: set('c', '2026-11-03', 's10', 0, 12), // bodyweight: a set, 0 kg tonnage
        d: set('d', '2026-11-03', 's10', null, null), // not recorded: a set, 0 kg tonnage
        e: set('e', '2026-09-10', 's3', 80, 8), // block 0, excluded
      },
      specimens: {
        p1: {
          profileId: 'p1',
          acquired: { c001: { at: 1, exerciseId: null } },
          totalSetsLogged: 5, // [sets]
        },
      },
    });
  }

  it('counts completed sessions, sets and tonnage inside the block only', () => {
    const stats = blockStats(stateWithBlockOneWork(), 'p1', 1);
    expect(stats.sessionsCompleted).toBe(2);
    expect(stats.setsLogged).toBe(4);
    expect(stats.tonnageKg).toBe(980); // [kg] 60x8 + 100x5 + 0x12 + 0
    expect(stats.specimensOwned).toBe(1);
  });

  it('returns zeros for a block with no work', () => {
    const stats = blockStats(stateWithBlockOneWork(), 'p1', 2);
    expect(stats).toEqual({
      sessionsCompleted: 0,
      setsLogged: 0,
      tonnageKg: 0, // [kg]
      specimensOwned: 1,
    });
  });

  it('returns zeros for an unknown profile', () => {
    expect(blockStats(stateWithBlockOneWork(), 'nobody', 1)).toEqual({
      sessionsCompleted: 0,
      setsLogged: 0,
      tonnageKg: 0, // [kg]
      specimensOwned: 0,
    });
  });

  it('returns zeros for a block index the plan does not define', () => {
    expect(blockStats(stateWithBlockOneWork(), 'p1', -1)).toEqual({
      sessionsCompleted: 0,
      setsLogged: 0,
      tonnageKg: 0, // [kg]
      specimensOwned: 1,
    });
  });
});
