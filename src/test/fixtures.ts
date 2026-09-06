// src/test/fixtures.ts
// Shared object builders for the P4 training suites. Deterministic ids so assertions can
// name them. Every physical quantity carries its canonical unit in a comment.
//
// Deviations from the P4 plan's Task 1 Step 1 literal (recorded here; the plan is not edited):
//  - Profile carries hydration.weighInOptIn, readiness, gymCommute, homeEquipment and
//    bodyweightEquipment. All are required (or, for the latter three, additive-with-default) on
//    the shipped Profile type and postdate the plan text. equipmentSteps.hasMicroPlates and
//    .microPlateKg, which the plan text also predates, were removed rather than added (Brief F
//    Part 3: the owner asked for the micro-plate option to go).
//  - Exercise carries secondaryMuscles (required by the shipped Exercise type), and the base
//    object is the shipped library's barbell bench press rather than a hand-written copy, so a
//    fixture cannot drift from the data the app ships. The literal in the plan had already
//    drifted: it omitted secondaryMuscles and used the muscle name "front delts", which is not
//    in library.ts's closed thirteen-group vocabulary ("front-delt").
//  - Repo style: single quotes and [unit] comments, matching src/test/scheduleFixtures.ts.
//
// src/test/scheduleFixtures.ts also exports makeProfile and makeExercise, with different
// signatures (a timezone-keyed Profile, and a PlannedExercise). That file belongs to the P3
// suites and is left untouched; the two modules are imported separately and never merged here.

import { EXERCISE_BY_ID } from '../domain/plan/library';
import type {
  Exercise,
  LoggedSet,
  PlanBlock,
  PlannedExercise,
  Profile,
} from '../domain/types';

let counter = 0;

/** Call in beforeEach so set ids are reproducible across files and runs. */
export function resetFixtureIds(): void {
  counter = 0;
}

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter).padStart(4, '0')}`;
}

/** The shipped library entry the exercise fixture is built from. */
const BENCH_PRESS: Exercise = (() => {
  const ex = EXERCISE_BY_ID['barbell-bench-press'];
  if (!ex) throw new Error('fixtures: library.ts no longer defines barbell-bench-press');
  return ex;
})();

export function makeProfile(patch: Partial<Profile> = {}): Profile {
  const base: Profile = {
    id: 'profile-1',
    displayName: 'Test subject',
    timezone: 'Europe/Athens',
    units: 'metric',
    createdAt: Date.UTC(2026, 0, 1), // [ms] epoch, UTC
    body: {
      sex: 'male',
      birthYear: 1995,
      heightCm: 180, // [cm]
      baselineMassKg: 95, // [kg]
      baselineAt: '2026-01-01',
      baselineBodyFatPct: null, // [%]
    },
    activity: 'moderate',
    experience: 'intermediate',
    equipment: 'full-gym',
    equipmentSteps: {
      barbellKg: 2.5, // [kg] total on the bar (pair of 1.25 kg plates)
      dumbbellPairKg: 5, // [kg] per pair
      stackKg: 5, // [kg] per pin
    },
    gymCommute: { walks: false, minutesEachWay: null },
    homeEquipment: [],
    bodyweightEquipment: [],
    goal: { kind: 'muscle-gain', targetMassKg: null, targetBodyFatPct: null, targetDate: null },
    supplements: { creatine: true },
    hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: false }, // [mL/day], [mL]
    readiness: { screenedAt: '2026-01-01', flagged: false },
  };
  return { ...base, ...patch };
}

/** Barbell bench press as shipped, patchable. Arrays stay frozen: treat them as read-only. */
export function makeExercise(patch: Partial<Exercise> = {}): Exercise {
  return { ...BENCH_PRESS, ...patch };
}

export function makePlannedExercise(patch: Partial<PlannedExercise> = {}): PlannedExercise {
  const base: PlannedExercise = {
    exerciseId: 'barbell-bench-press',
    setsLo: 3, // [sets]
    setsHi: 4, // [sets]
    prescription: { kind: 'reps', lo: 6, hi: 8 }, // [repetitions]
    restS: 120, // [s]
  };
  return { ...base, ...patch };
}

export function makeBlock(patch: Partial<PlanBlock> = {}): PlanBlock {
  const base: PlanBlock = {
    index: 0,
    firstSessionIndex: 0,
    sessionCount: 12, // [sessions]
    setModifier: 1, // dimensionless multiplier
    loadModifier: 1, // dimensionless multiplier
    isDeload: false,
  };
  return { ...base, ...patch };
}

export function makeSet(patch: Partial<LoggedSet> = {}): LoggedSet {
  const base: LoggedSet = {
    id: nextId('set'),
    profileId: 'profile-1',
    assignmentDate: '2026-03-02',
    sessionId: 'session-1',
    exerciseId: 'barbell-bench-press',
    setNumber: 1,
    isBonus: false,
    loadKg: 60, // [kg]
    enteredUnit: 'metric',
    reps: 8, // [repetitions]
    durationS: null, // [s]
    rpe: null, // [RPE] 1-10 repetitions-in-reserve scale (Zourdos 2016, DOI 10.1519/JSC.0000000000001049); P4 writes null
    loggedAt: Date.UTC(2026, 2, 2, 10, 0), // [ms] epoch, UTC
  };
  return { ...base, ...patch };
}
