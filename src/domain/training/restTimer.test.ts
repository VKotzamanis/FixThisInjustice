// src/domain/training/restTimer.test.ts
//
// The rest timer is a pair of absolute instants, never a decremented counter (code review
// A31: the legacy interval froze while the tab was backgrounded and chimed a minute late).
// Every assertion below therefore fixes `now` explicitly and reads the timer as a pure
// function of it; no test uses a real clock.
//
// Units: instants are epoch ms UTC [ms]; every rest quantity is seconds [s].
import { describe, expect, it } from 'vitest';
import { EXERCISES, EXERCISE_BY_ID, restSFor } from '../plan/library';
import {
  defaultRestS,
  extend,
  HEAVY_REP_CEILING,
  REST_HEAVY_COMPOUND_S,
  REST_ISOLATION_S,
  REST_MODERATE_COMPOUND_S,
  remainingS,
  startRest,
  totalS,
} from './restTimer';
import type { Exercise, PlannedExercise, Prescription } from '../types';

const T0 = Date.UTC(2026, 2, 2, 18, 0, 0); // [ms] epoch ms UTC, a fixed instant

// Local fixtures. src/test/trainingFixtures.ts is being written by another task; this file
// stays self-contained so the two never race.
const BASE_EXERCISE: Exercise = {
  id: 'fixture-exercise',
  name: 'Fixture exercise',
  isBodyweight: false,
  isCompoundPrimary: true,
  modality: 'barbell',
  loadClass: 'upper-compound',
  muscleGroups: [],
  secondaryMuscles: [],
  equipment: ['full-gym'],
  videoQuery: null,
  formCueId: null,
  note: null,
};

const BASE_PLANNED: PlannedExercise = {
  exerciseId: 'fixture-exercise',
  setsLo: 3,
  setsHi: 4,
  prescription: { kind: 'reps', lo: 8, hi: 12 },
  restS: 120, // [s] the planned value; defaultRestS is what seeds it
};

function makeExercise(overrides: Partial<Exercise>): Exercise {
  return { ...BASE_EXERCISE, ...overrides };
}

function makePlannedExercise(overrides: Partial<PlannedExercise>): PlannedExercise {
  return { ...BASE_PLANNED, ...overrides };
}

describe('startRest / remainingS', () => {
  it('sets endsAt one duration after now', () => {
    const t = startRest(180, T0);
    expect(t.startedAt).toBe(T0); // [ms]
    expect(t.endsAt).toBe(T0 + 180_000); // [ms] = T0 + 180 s
    expect(t.durationS).toBe(180); // [s]
    expect(remainingS(t, T0)).toBe(180); // [s]
  });

  it('counts down against wall-clock instants', () => {
    const t = startRest(90, T0);
    expect(remainingS(t, T0 + 30_000)).toBe(60); // [s] 90 s - 30 s elapsed
  });

  it('returns 0 after a simulated 10-minute background jump, not a frozen count', () => {
    // Master plan section 7, P4 timer gate. Nothing holds a countdown, so a suspended tab
    // cannot leave a stale value behind: the answer is a function of `now` alone.
    const t = startRest(90, T0);
    expect(remainingS(t, T0 + 600_000)).toBe(0); // [s] after a 600 s jump
  });

  it('clamps at 0 and never goes negative', () => {
    const t = startRest(90, T0);
    expect(remainingS(t, T0 + 10_000_000)).toBe(0); // [s]
    for (const offsetMs of [0, 1, 89_999, 90_000, 90_001, 86_400_000]) {
      expect(remainingS(t, T0 + offsetMs)).toBeGreaterThanOrEqual(0); // [s]
    }
  });

  it('rounds a part-second remainder up, so the display never shows 0 before the end', () => {
    const t = startRest(90, T0);
    expect(remainingS(t, T0 + 89_999)).toBe(1); // [s] 1 ms left reads as 1 s, not 0
    expect(remainingS(t, T0 + 90_000)).toBe(0); // [s] exactly at endsAt
  });

  it('is pure: the same arguments give the same answer and nothing is stored', () => {
    const t = startRest(90, T0);
    expect(remainingS(t, T0 + 30_000)).toBe(60); // [s]
    expect(remainingS(t, T0 + 10_000)).toBe(80); // [s] querying an earlier instant is valid
    expect(remainingS(t, T0 + 30_000)).toBe(60); // [s] unchanged by the query above
  });
});

describe('totalS', () => {
  it('equals the requested duration for an unextended timer', () => {
    expect(totalS(startRest(180, T0))).toBe(180); // [s]
  });
});

describe('extend', () => {
  it('moves endsAt only', () => {
    const t = startRest(90, T0);
    const e = extend(t, 30);
    expect(e.endsAt).toBe(t.endsAt + 30_000); // [ms] = +30 s
    expect(e.startedAt).toBe(t.startedAt); // [ms]
    expect(e.durationS).toBe(t.durationS); // [s] the originally requested duration is a record
    expect(totalS(e)).toBe(120); // [s] the actual span, which is what the progress ring uses
    expect(remainingS(e, T0)).toBe(120); // [s]
  });

  it('does not mutate the original timer', () => {
    const t = startRest(90, T0);
    extend(t, 30);
    expect(t.endsAt).toBe(T0 + 90_000); // [ms]
    expect(totalS(t)).toBe(90); // [s]
  });

  it('shortens the interval on a negative delta', () => {
    const t = startRest(90, T0);
    const e = extend(t, -30);
    expect(e.endsAt).toBe(T0 + 60_000); // [ms] = T0 + 60 s
    expect(totalS(e)).toBe(60); // [s]
    expect(remainingS(e, T0)).toBe(60); // [s]
  });

  it('clamps endsAt at startedAt when a negative delta would move it before the start', () => {
    // Rule: endsAt = max(startedAt, endsAt + deltaS). A timer can be cut to zero remaining
    // but never inverted, so totalS stays a non-negative span and remainingS reaches 0 by
    // arithmetic rather than by the clamp inside remainingS.
    const t = startRest(90, T0);
    const e = extend(t, -600);
    expect(e.endsAt).toBe(t.startedAt); // [ms] clamped, not T0 - 510 s
    expect(e.startedAt).toBe(T0); // [ms]
    expect(e.durationS).toBe(90); // [s] the request is still on record
    expect(totalS(e)).toBe(0); // [s]
    expect(remainingS(e, T0)).toBe(0); // [s]
  });

  it('chains: extensions and reductions compose on endsAt', () => {
    const t = extend(extend(startRest(90, T0), 30), -15);
    expect(t.endsAt).toBe(T0 + 105_000); // [ms] 90 + 30 - 15 = 105 s
    expect(totalS(t)).toBe(105); // [s]
    expect(t.durationS).toBe(90); // [s] unchanged by either move
  });
});

describe('defaultRestS', () => {
  const lib: Record<string, Exercise> = {
    'barbell-back-squat': makeExercise({ id: 'barbell-back-squat', loadClass: 'lower-compound' }),
    'barbell-bench-press': makeExercise({ id: 'barbell-bench-press', loadClass: 'upper-compound' }),
    'lateral-raise': makeExercise({
      id: 'lateral-raise',
      loadClass: 'isolation',
      isCompoundPrimary: false,
      modality: 'dumbbell',
    }),
    plank: makeExercise({
      id: 'plank',
      loadClass: 'isolation',
      isBodyweight: true,
      modality: 'bodyweight',
    }),
  };

  it('gives 180 s to a heavy multi-joint compound at <= 6 reps', () => {
    const planned = makePlannedExercise({
      exerciseId: 'barbell-back-squat',
      prescription: { kind: 'reps', lo: 4, hi: 6 },
    });
    expect(defaultRestS(planned, lib)).toBe(REST_HEAVY_COMPOUND_S); // [s]
    expect(REST_HEAVY_COMPOUND_S).toBe(180); // [s]
  });

  it('gives 120 s to a moderate compound at 6-12 reps', () => {
    const planned = makePlannedExercise({
      exerciseId: 'barbell-bench-press',
      prescription: { kind: 'reps', lo: 8, hi: 12 },
    });
    expect(defaultRestS(planned, lib)).toBe(REST_MODERATE_COMPOUND_S); // [s]
    expect(REST_MODERATE_COMPOUND_S).toBe(120); // [s]
  });

  it('gives 90 s to single-joint isolation work', () => {
    const planned = makePlannedExercise({
      exerciseId: 'lateral-raise',
      prescription: { kind: 'reps', lo: 12, hi: 15 },
    });
    expect(defaultRestS(planned, lib)).toBe(REST_ISOLATION_S); // [s]
    expect(REST_ISOLATION_S).toBe(90); // [s]
  });

  it('gives 90 s to a timed core hold', () => {
    const planned = makePlannedExercise({
      exerciseId: 'plank',
      prescription: { kind: 'duration', targetS: 45 },
    });
    expect(defaultRestS(planned, lib)).toBe(REST_ISOLATION_S); // [s]
  });

  it('gives 120 s to a compound with an unbounded prescription', () => {
    const planned = makePlannedExercise({
      exerciseId: 'barbell-bench-press',
      prescription: { kind: 'amrap', minimum: 5 },
    });
    expect(defaultRestS(planned, lib)).toBe(REST_MODERATE_COMPOUND_S); // [s]
  });

  it('falls back to 90 s for an exercise missing from the library', () => {
    const planned = makePlannedExercise({ exerciseId: 'not-in-library' });
    expect(defaultRestS(planned, lib)).toBe(REST_ISOLATION_S); // [s]
  });

  it('pins the heavy rep ceiling: hi at the ceiling is heavy, one rep above is moderate', () => {
    const at = makePlannedExercise({
      exerciseId: 'barbell-back-squat',
      prescription: { kind: 'reps', lo: 3, hi: HEAVY_REP_CEILING },
    });
    const above = makePlannedExercise({
      exerciseId: 'barbell-back-squat',
      prescription: { kind: 'reps', lo: 3, hi: HEAVY_REP_CEILING + 1 },
    });
    expect(defaultRestS(at, lib)).toBe(REST_HEAVY_COMPOUND_S); // [s]
    expect(defaultRestS(above, lib)).toBe(REST_MODERATE_COMPOUND_S); // [s]
  });
});

describe('defaultRestS delegates to library.restSFor', () => {
  // Master plan section 6.5 as amended: defaultRestS is a lookup plus restSFor, never a
  // second rest table. This suite fails the moment the two disagree, so a change to the
  // cited defaults in library.ts cannot silently leave a stale copy here.
  const prescriptions: Prescription[] = [
    { kind: 'reps', lo: 3, hi: 5 },
    { kind: 'reps', lo: 5, hi: 6 },
    { kind: 'reps', lo: 6, hi: 8 },
    { kind: 'reps', lo: 8, hi: 12 },
    { kind: 'reps', lo: 15, hi: 20 },
    { kind: 'amrap', minimum: null },
    { kind: 'time', targetS: 30 }, // [s]
    { kind: 'duration', targetS: 45 }, // [s]
    { kind: 'none' },
  ];

  it('agrees with restSFor for every library exercise and prescription shape', () => {
    for (const ex of EXERCISES) {
      for (const prescription of prescriptions) {
        const planned = makePlannedExercise({ exerciseId: ex.id, prescription });
        expect(defaultRestS(planned, EXERCISE_BY_ID)).toBe(restSFor(ex, prescription)); // [s]
      }
    }
  });

  it('pins the three exported constants to the values restSFor returns', () => {
    const squat = EXERCISE_BY_ID['barbell-back-squat'];
    const bench = EXERCISE_BY_ID['barbell-bench-press'];
    const raise = EXERCISE_BY_ID['lateral-raise'];
    if (squat === undefined || bench === undefined || raise === undefined) {
      throw new Error('library.ts no longer exports the three canonical ids this test pins');
    }
    expect(REST_HEAVY_COMPOUND_S).toBe(restSFor(squat, { kind: 'reps', lo: 3, hi: 5 })); // [s]
    expect(REST_MODERATE_COMPOUND_S).toBe(restSFor(bench, { kind: 'reps', lo: 8, hi: 12 })); // [s]
    expect(REST_ISOLATION_S).toBe(restSFor(raise, { kind: 'reps', lo: 12, hi: 15 })); // [s]
  });
});

describe('serialisation', () => {
  it('round-trips through JSON unchanged', () => {
    // P4's session slice mirrors the timer to sessionStorage so a mid-session reload keeps
    // it. Both fields are epoch ms and durationS is a plain number, so the structure must
    // survive JSON with no revival step.
    const t = extend(startRest(90, T0), 30);
    const revived: unknown = JSON.parse(JSON.stringify(t));
    expect(revived).toEqual(t);
  });

  it('a revived timer answers remainingS identically', () => {
    const t = startRest(180, T0);
    const revived: unknown = JSON.parse(JSON.stringify(t));
    expect(revived).toEqual(t);
    // Narrow through the same shape the store will validate, then compare answers.
    const { startedAt, endsAt, durationS } = t;
    expect(remainingS({ startedAt, endsAt, durationS }, T0 + 60_000)).toBe(120); // [s]
    expect(totalS({ startedAt, endsAt, durationS })).toBe(180); // [s]
  });
});
