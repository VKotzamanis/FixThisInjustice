// Records over the logged-set history: heaviest set, best Epley estimate, best unloaded
// AMRAP, and the weekly AMRAP series the Log view sparkline draws.
//
// Deviations from the P7 plan's Task 4 Step 1 literal (recorded here; the plan is not edited):
//  - The set literal is replaced by `makeSet` from src/test/fixtures.ts, which is the shipped
//    LoggedSet builder. The plan's inline literal predates `secondaryMuscles` and the fixture
//    module, and a second hand-written literal is a second thing to keep in step with the type.
//  - `bestE1RM.e1RMKg` is asserted through `e1RM` from progression.ts rather than against the
//    number 108, so the estimate and the equation that produced it cannot drift apart.

import { beforeEach, describe, expect, it } from 'vitest';
import { makeSet, resetFixtureIds } from '../../test/fixtures';
import { e1RM } from './progression';
import { computeRecords, weeklyAmrapMax } from './records';

beforeEach(() => {
  resetFixtureIds();
});

describe('computeRecords', () => {
  it('returns nothing for an empty log', () => {
    expect(computeRecords([]).size).toBe(0);
  });

  it('takes the heaviest set, breaking ties on reps then on the earlier date', () => {
    const r = computeRecords([
      makeSet({ loadKg: 60, reps: 8, assignmentDate: '2026-01-05' }), // [kg]
      makeSet({ loadKg: 62.5, reps: 6, assignmentDate: '2026-01-12' }), // [kg]
      makeSet({ loadKg: 62.5, reps: 8, assignmentDate: '2026-01-19' }), // [kg]
      makeSet({ loadKg: 62.5, reps: 8, assignmentDate: '2026-01-26' }), // [kg]
    ]).get('barbell-bench-press');
    expect(r?.bestSet).toEqual({ loadKg: 62.5, reps: 8, date: '2026-01-19' });
  });

  it('takes the highest Epley estimate, which need not be the heaviest set', () => {
    const r = computeRecords([
      makeSet({ loadKg: 100, reps: 1, assignmentDate: '2026-01-05' }), // [kg] e1RM 103.33 kg
      makeSet({ loadKg: 90, reps: 6, assignmentDate: '2026-01-12' }), // [kg] e1RM 108 kg
    ]).get('barbell-bench-press');
    expect(r?.bestSet?.loadKg).toBe(100); // [kg]
    expect(r?.bestE1RM?.loadKg).toBe(90); // [kg]
    expect(r?.bestE1RM?.reps).toBe(6);
    expect(r?.bestE1RM?.e1RMKg).toBeCloseTo(e1RM(90, 6), 9); // [kg]
    expect(r?.bestE1RM?.date).toBe('2026-01-12');
  });

  it('ignores sets above ten reps for the Epley estimate', () => {
    // Epley is only defended below about ten repetitions (master plan section 6.5), which is
    // what e1RMOrNull enforces; a 20-rep set would otherwise report the largest estimate here.
    const r = computeRecords([
      makeSet({ loadKg: 40, reps: 20, assignmentDate: '2026-01-05' }), // [kg]
      makeSet({ loadKg: 80, reps: 5, assignmentDate: '2026-01-12' }), // [kg]
    ]).get('barbell-bench-press');
    expect(r?.bestE1RM?.loadKg).toBe(80); // [kg]
  });

  it('has no Epley estimate when every set is bodyweight or unrecorded', () => {
    const r = computeRecords([
      makeSet({ exerciseId: 'pull-up', loadKg: 0, reps: 8, assignmentDate: '2026-01-05' }), // [kg]
      makeSet({ exerciseId: 'pull-up', loadKg: null, reps: 6, assignmentDate: '2026-01-05' }),
    ]).get('pull-up');
    expect(r?.bestE1RM).toBeNull();
    expect(r?.bestSet).toEqual({ loadKg: 0, reps: 8, date: '2026-01-05' }); // [kg]
    expect(r?.bestAmrap).toEqual({ reps: 8, date: '2026-01-05' });
  });

  it('ignores sets with no rep count entirely, but still counts them', () => {
    const r = computeRecords([makeSet({ reps: null })]).get('barbell-bench-press');
    expect(r?.bestSet).toBeNull();
    expect(r?.bestE1RM).toBeNull();
    expect(r?.totalSets).toBe(1); // [sets]
  });

  it('keeps exercises apart', () => {
    const m = computeRecords([
      makeSet({}),
      makeSet({ exerciseId: 'pendlay-row', loadKg: 70, reps: 6 }), // [kg]
    ]);
    expect([...m.keys()].sort()).toEqual(['barbell-bench-press', 'pendlay-row']);
  });
});

describe('weeklyAmrapMax', () => {
  it('returns the best rep count per ISO week, ascending', () => {
    const out = weeklyAmrapMax(
      [
        makeSet({ exerciseId: 'push-up', loadKg: 0, reps: 12, assignmentDate: '2026-01-08' }),
        makeSet({ exerciseId: 'push-up', loadKg: 0, reps: 10, assignmentDate: '2026-01-09' }),
        makeSet({ exerciseId: 'push-up', loadKg: 0, reps: 15, assignmentDate: '2026-01-15' }),
        makeSet({ exerciseId: 'pull-up', loadKg: 0, reps: 99, assignmentDate: '2026-01-15' }),
      ],
      'push-up',
    );
    expect(out).toEqual([
      { weekStart: '2026-01-05', reps: 12 },
      { weekStart: '2026-01-12', reps: 15 },
    ]);
  });

  it('ignores sets with no rep count', () => {
    const out = weeklyAmrapMax(
      [
        makeSet({ exerciseId: 'push-up', reps: null, assignmentDate: '2026-01-08' }),
        makeSet({ exerciseId: 'push-up', reps: 7, assignmentDate: '2026-01-09' }),
      ],
      'push-up',
    );
    expect(out).toEqual([{ weekStart: '2026-01-05', reps: 7 }]);
  });

  it('returns nothing when the exercise has no logged reps', () => {
    expect(weeklyAmrapMax([], 'push-up')).toEqual([]);
  });
});
