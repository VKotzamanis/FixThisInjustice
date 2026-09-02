import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeBlock,
  makeExercise,
  makePlannedExercise,
  makeProfile,
  makeSet,
  resetFixtureIds,
} from '../../test/fixtures';
import { achievableLoad, displayLoad, toStoredLoad } from '../units';
import type { Exercise, LoggedSet, PlanBlock, PlannedExercise, PlanTemplate } from '../types';
import {
  blockFor,
  compareSetOrder,
  e1RM,
  e1RMOrNull,
  E1RM_MAX_REPS,
  IDENTITY_BLOCK,
  isCompletedSet,
  MAX_REASON_WORDS,
  sortSetHistory,
  suggestedProgression,
} from './progression';

beforeEach(() => {
  resetFixtureIds();
});

/** A full session of `count` sets at `loadKg` x `reps` on one assignment date. */
function session(
  date: string,
  count: number,
  loadKg: number, // [kg]
  reps: number, // [repetitions]
  extra: Partial<LoggedSet> = {},
): LoggedSet[] {
  return Array.from({ length: count }, (_, i) =>
    makeSet({ assignmentDate: date, setNumber: i + 1, loadKg, reps, ...extra }),
  );
}

describe('suggestedProgression', () => {
  it('adds one 2.5 kg step to a 60 kg upper-body compound at the top of the range', () => {
    // Delta_target = 0.025 x 60 kg = 1.5 kg, which rounds DOWN to 0 on 2.5 kg
    // plates, so the max(Delta, step) floor supplies the 2.5 kg step.
    const advice = suggestedProgression(
      session('2026-03-02', 3, 60, 8),
      makePlannedExercise(),
      makeExercise({ loadClass: 'upper-compound' }),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('add-load');
    expect(advice.loadKg).toBeCloseTo(62.5, 10); // [kg]
    expect(advice.nextPrescription).toEqual({ kind: 'reps', lo: 6, hi: 8 });
  });

  it('extends the rep range instead of jumping 12.5 % on a 20 kg curl', () => {
    const advice = suggestedProgression(
      session('2026-03-02', 3, 20, 12, { exerciseId: 'barbell-curl' }),
      makePlannedExercise({
        exerciseId: 'barbell-curl',
        prescription: { kind: 'reps', lo: 8, hi: 12 },
      }),
      makeExercise({ id: 'barbell-curl', loadClass: 'isolation', isCompoundPrimary: false }),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('extend-reps');
    expect(advice.nextPrescription).toEqual({ kind: 'reps', lo: 8, hi: 14 });
    expect(advice.loadKg).toBeCloseTo(20, 10); // [kg] unchanged
    expect(advice.why).toContain('12.5 %');
  });

  it('adds 5 kg to a 100 kg lower-body compound (5 % band, 2.5 kg step)', () => {
    const advice = suggestedProgression(
      session('2026-03-02', 3, 100, 6, { exerciseId: 'barbell-back-squat' }),
      makePlannedExercise({
        exerciseId: 'barbell-back-squat',
        prescription: { kind: 'reps', lo: 4, hi: 6 },
      }),
      makeExercise({ id: 'barbell-back-squat', loadClass: 'lower-compound' }),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('add-load');
    expect(advice.loadKg).toBeCloseTo(105, 10); // [kg]
  });

  it('moves an imperial 135 lb bench to 140 lb', () => {
    const profile = makeProfile({
      units: 'imperial',
      equipmentSteps: {
        barbellKg: toStoredLoad(5, 'imperial'), // [kg] 5 lb total = 2.26796185 kg
        dumbbellPairKg: toStoredLoad(10, 'imperial'), // [kg] 10 lb per pair
        stackKg: toStoredLoad(10, 'imperial'), // [kg] 10 lb per pin
        hasMicroPlates: false,
        microPlateKg: toStoredLoad(1, 'imperial'), // [kg] 1 lb total (pair of 0.5 lb)
      },
    });
    const loadKg = toStoredLoad(135, 'imperial'); // [kg] 61.23496995
    expect(loadKg).toBeCloseTo(61.23496995, 10);
    const advice = suggestedProgression(
      session('2026-03-02', 3, loadKg, 8, { enteredUnit: 'imperial' }),
      makePlannedExercise(),
      makeExercise({ loadClass: 'upper-compound' }),
      profile,
      makeBlock(),
    );
    expect(advice.kind).toBe('add-load');
    expect(advice.loadKg).toBeCloseTo(63.5029318, 9); // [kg]
    expect(displayLoad(advice.loadKg ?? 0, 'imperial')).toBe(140); // [lb]
  });

  it('treats a later-dated set as later even when its loggedAt is earlier', () => {
    // Code review A23: wall-clock order and programme order disagree when a
    // session is logged retrospectively. Programme order must win.
    const early = session('2026-03-09', 3, 60, 8).map((s) => ({ ...s, loggedAt: 1_000 }));
    const late = session('2026-03-02', 3, 80, 5).map((s) => ({ ...s, loggedAt: 9_000_000 }));
    const ordered = sortSetHistory([...late, ...early]);
    expect(ordered.at(-1)?.assignmentDate).toBe('2026-03-09');

    const advice = suggestedProgression(
      [...late, ...early],
      makePlannedExercise(),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    // The last SESSION is 2026-03-09 at 60 kg, so the suggestion is 62.5 kg.
    expect(advice.loadKg).toBeCloseTo(62.5, 10); // [kg]
  });

  it('holds the load when one prescribed set fell short of the top of the range', () => {
    const history = [
      makeSet({ assignmentDate: '2026-03-02', setNumber: 1, loadKg: 60, reps: 8 }),
      makeSet({ assignmentDate: '2026-03-02', setNumber: 2, loadKg: 60, reps: 8 }),
      makeSet({ assignmentDate: '2026-03-02', setNumber: 3, loadKg: 60, reps: 7 }),
    ];
    const advice = suggestedProgression(
      history,
      makePlannedExercise(),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('hold');
    expect(advice.loadKg).toBe(60); // [kg]
    expect(advice.why).toContain('2 sets reached 8 repetitions');
    expect(advice.why).toContain('3 prescribed sets required');
  });

  it('does not advance on two top-range sets inside one unfinished session', () => {
    // Code review A22: the legacy bumped the load mid-session after two sets.
    const history = session('2026-03-02', 2, 60, 8);
    const advice = suggestedProgression(
      history,
      makePlannedExercise(),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('hold');
  });

  it('returns deload inside a deload block, load unchanged', () => {
    const advice = suggestedProgression(
      session('2026-03-02', 3, 60, 8),
      makePlannedExercise(),
      makeExercise(),
      makeProfile(),
      makeBlock({ isDeload: true, setModifier: 0.5 }),
    );
    expect(advice.kind).toBe('deload');
    expect(advice.loadKg).toBe(60); // [kg]
    expect(advice.nextPrescription).toEqual(advice.prescription);
  });

  it('returns extend-reps for a bodyweight exercise outside a deload block', () => {
    const ex = makeExercise({ id: 'pull-up', isBodyweight: true, modality: 'bodyweight' });
    const advice = suggestedProgression(
      session('2026-03-02', 3, 0, 8, { exerciseId: 'pull-up' }),
      makePlannedExercise({ exerciseId: 'pull-up' }),
      ex,
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('extend-reps');
    expect(advice.loadKg).toBeNull();
    expect(advice.nextPrescription).toEqual({ kind: 'reps', lo: 6, hi: 10 });
  });

  it('gives a deload block precedence over the bodyweight rule', () => {
    // Master plan section 6.5 states both rules; only one can hold here. A deload
    // cuts volume, so prescribing extra repetitions inside one inverts the block.
    const ex = makeExercise({ id: 'pull-up', isBodyweight: true, modality: 'bodyweight' });
    const advice = suggestedProgression(
      session('2026-03-02', 3, 0, 8, { exerciseId: 'pull-up' }),
      makePlannedExercise({ exerciseId: 'pull-up' }),
      ex,
      makeProfile(),
      makeBlock({ isDeload: true, setModifier: 0.5 }),
    );
    expect(advice.kind).toBe('deload');
    expect(advice.nextPrescription).toEqual({ kind: 'reps', lo: 6, hi: 8 }); // hi NOT raised
    expect(advice.loadKg).toBe(0); // [kg] bodyweight sets store 0, never null (A60)
  });

  it('holds a loaded AMRAP set: there is no top of the range to reach', () => {
    // Semantics stated: double progression needs a ceiling. An AMRAP prescription
    // has none, so the load holds and nextPrescription is unchanged.
    const advice = suggestedProgression(
      session('2026-03-02', 3, 60, 14),
      makePlannedExercise({ prescription: { kind: 'amrap', minimum: 8 } }),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('hold');
    expect(advice.loadKg).toBe(60); // [kg]
    expect(advice.nextPrescription).toEqual({ kind: 'amrap', minimum: 8 });
    // Article agreement: the kind is interpolated, so an "A amrap" reading is unreachable.
    expect(advice.why).toContain('The "amrap" prescription sets no top');
  });

  it('returns extend-reps with an unchanged prescription for a bodyweight AMRAP', () => {
    // The bodyweight rule outranks the prescription check, so the kind is
    // extend-reps; extendReps is the identity on a prescription with no `hi`.
    const ex = makeExercise({ id: 'push-up', isBodyweight: true, modality: 'bodyweight' });
    const advice = suggestedProgression(
      session('2026-03-02', 3, 0, 20, { exerciseId: 'push-up' }),
      makePlannedExercise({ exerciseId: 'push-up', prescription: { kind: 'amrap', minimum: null } }),
      ex,
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('extend-reps');
    expect(advice.nextPrescription).toEqual({ kind: 'amrap', minimum: null });
  });

  it('holds with a null load when there is no history', () => {
    const advice = suggestedProgression(
      [],
      makePlannedExercise(),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('hold');
    expect(advice.loadKg).toBeNull();
    expect(advice.reason).toContain('6–8');
  });

  it('ignores bonus sets when deciding whether the range was met', () => {
    const history = [
      ...session('2026-03-02', 3, 60, 8),
      makeSet({ assignmentDate: '2026-03-02', setNumber: 4, loadKg: 40, reps: 4, isBonus: true }),
    ];
    const advice = suggestedProgression(
      history,
      makePlannedExercise(),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('add-load');
  });

  it('ignores sets logged for another exercise', () => {
    const history = [
      ...session('2026-03-02', 3, 60, 8),
      ...session('2026-03-09', 3, 20, 12, { exerciseId: 'barbell-curl' }),
    ];
    const advice = suggestedProgression(
      history,
      makePlannedExercise(),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('add-load');
    expect(advice.loadKg).toBeCloseTo(62.5, 10); // [kg]
  });

  it('extends the range when the equipment offers no increment at all', () => {
    const profile = makeProfile({
      equipmentSteps: {
        barbellKg: 0, // [kg] a user who cleared the field
        dumbbellPairKg: 5, // [kg]
        stackKg: 5, // [kg]
        hasMicroPlates: false,
        microPlateKg: 0.5, // [kg]
      },
    });
    const advice = suggestedProgression(
      session('2026-03-02', 3, 60, 8),
      makePlannedExercise(),
      makeExercise(),
      profile,
      makeBlock(),
    );
    expect(advice.kind).toBe('extend-reps');
    expect(advice.nextPrescription).toEqual({ kind: 'reps', lo: 6, hi: 10 });
  });

  it('uses the micro-plate step when the profile has micro-plates', () => {
    // 2.5 % of 20 kg = 0.5 kg, which IS achievable on a 0.5 kg micro-plate pair,
    // so the guard (0.5 / 20 = 2.5 %) does not fire and the load rises.
    const profile = makeProfile({
      equipmentSteps: {
        barbellKg: 2.5, // [kg]
        dumbbellPairKg: 5, // [kg]
        stackKg: 5, // [kg]
        hasMicroPlates: true,
        microPlateKg: 0.5, // [kg] total, pair of 0.25 kg
      },
    });
    const advice = suggestedProgression(
      session('2026-03-02', 3, 20, 12, { exerciseId: 'barbell-curl' }),
      makePlannedExercise({
        exerciseId: 'barbell-curl',
        prescription: { kind: 'reps', lo: 8, hi: 12 },
      }),
      makeExercise({ id: 'barbell-curl', loadClass: 'isolation' }),
      profile,
      makeBlock(),
    );
    expect(advice.kind).toBe('add-load');
    expect(advice.loadKg).toBeCloseTo(20.5, 10); // [kg]
  });
});

describe('advice copy contract', () => {
  // Master plan section 3: an advice line is at most 12 words, carries no
  // exclamation mark, and keeps its arithmetic behind the `why` disclosure.
  const ex = makeExercise();
  const bodyweight = makeExercise({ id: 'pull-up', isBodyweight: true, modality: 'bodyweight' });
  const cases: [string, LoggedSet[], PlannedExercise, Exercise, PlanBlock][] = [
    ['deload', session('2026-03-02', 3, 60, 8), makePlannedExercise(), ex, makeBlock({ isDeload: true })],
    [
      'bodyweight',
      session('2026-03-02', 3, 0, 8, { exerciseId: 'pull-up' }),
      makePlannedExercise({ exerciseId: 'pull-up' }),
      bodyweight,
      makeBlock(),
    ],
    [
      'amrap',
      session('2026-03-02', 3, 60, 14),
      makePlannedExercise({ prescription: { kind: 'amrap', minimum: null } }),
      ex,
      makeBlock(),
    ],
    ['no history', [], makePlannedExercise(), ex, makeBlock()],
    ['hold', session('2026-03-02', 3, 60, 7), makePlannedExercise(), ex, makeBlock()],
    ['step guard', session('2026-03-02', 3, 20, 8), makePlannedExercise(), ex, makeBlock()],
    ['add-load', session('2026-03-02', 3, 60, 8), makePlannedExercise(), ex, makeBlock()],
  ];

  it.each(cases)(
    '%s: reason stays within the 12-word limit and why carries the arithmetic',
    (_name, history, planned, exercise, block) => {
      const advice = suggestedProgression(history, planned, exercise, makeProfile(), block);
      const words = advice.reason.trim().split(/\s+/);
      expect(words.length).toBeLessThanOrEqual(MAX_REASON_WORDS);
      expect(advice.reason).not.toContain('!');
      expect(advice.why.length).toBeGreaterThan(0);
      expect(advice.why).not.toBe(advice.reason);
    },
  );
});

describe('achievableLoad tolerance contract (guards P1)', () => {
  it('re-quantising an exact 140 lb still displays 140 lb', () => {
    // 63.5029318 / (5 lb in kg) = 27.999999999999996, so an epsilon-free
    // Math.floor drops a whole 5 lb step. P1's achievableLoad must absorb that.
    const step = toStoredLoad(5, 'imperial'); // [kg]
    expect(displayLoad(achievableLoad(63.5029318, step), 'imperial')).toBe(140); // [lb]
  });
});

describe('e1RM', () => {
  it('reproduces the Epley chart value for 100 kg x 5', () => {
    expect(e1RM(100, 5)).toBeCloseTo(116.6667, 4); // [kg]
  });
  it('applies the 1/30 coefficient at a single repetition', () => {
    expect(e1RM(80, 1)).toBeCloseTo(82.6667, 4); // [kg]
  });
  it('null-guards outside the validity domain of 1 to 10 repetitions', () => {
    expect(e1RMOrNull(100, 5)).toBeCloseTo(116.6667, 4); // [kg]
    expect(e1RMOrNull(100, E1RM_MAX_REPS)).toBeCloseTo(133.3333, 4); // [kg]
    expect(e1RMOrNull(100, E1RM_MAX_REPS + 1)).toBeNull();
    expect(e1RMOrNull(100, 0)).toBeNull();
    expect(e1RMOrNull(100, Number.NaN)).toBeNull();
  });
});

describe('blockFor', () => {
  const plan = {
    id: 'plan-1',
    version: 1,
    name: 'Upper/Lower',
    sessionsPerWeek: 4,
    weeks: 12,
    sessions: [],
    blocks: [
      {
        index: 0,
        firstSessionIndex: 0,
        sessionCount: 16,
        setModifier: 1,
        loadModifier: 1,
        isDeload: false,
      },
      {
        index: 1,
        firstSessionIndex: 16,
        sessionCount: 4,
        setModifier: 0.5,
        loadModifier: 1,
        isDeload: true,
      },
    ],
  } satisfies PlanTemplate;

  it('finds the block containing a session index', () => {
    expect(blockFor(plan, 17).isDeload).toBe(true);
    expect(blockFor(plan, 15).isDeload).toBe(false);
  });
  it('falls back to the identity block outside every range', () => {
    expect(blockFor(plan, 99)).toEqual(IDENTITY_BLOCK);
  });
});

describe('compareSetOrder', () => {
  it('orders by assignment date, then set number', () => {
    const a = makeSet({ assignmentDate: '2026-03-02', setNumber: 2 });
    const b = makeSet({ assignmentDate: '2026-03-02', setNumber: 1 });
    const c = makeSet({ assignmentDate: '2026-03-09', setNumber: 1 });
    expect(compareSetOrder(a, b)).toBeGreaterThan(0);
    expect(compareSetOrder(a, c)).toBeLessThan(0);
    expect(compareSetOrder(b, b)).toBe(0);
  });
});

describe('isCompletedSet', () => {
  it('accepts a bodyweight set at 0 kg and rejects an unrecorded one', () => {
    expect(isCompletedSet(makeSet({ loadKg: 0, reps: 12 }))).toBe(true); // A60: 0 is not falsy here
    expect(isCompletedSet(makeSet({ loadKg: null }))).toBe(false);
    expect(isCompletedSet(makeSet({ reps: null }))).toBe(false);
  });
});

/**
 * Reads the shared copy frame "N set(s) reached ... M prescribed set(s) required"
 * out of a `why` string, so a test can check that a branch's counts agree with the
 * advice it returned rather than matching a literal sentence.
 */
function metCounts(why: string): { met: number; required: number } {
  const m = /(\d+) sets? reached [\s\S]*?(\d+) prescribed sets? required/.exec(why);
  return m ? { met: Number(m[1]), required: Number(m[2]) } : { met: -1, required: -1 };
}

describe('suggestedProgression counts PRESCRIBED sets, not logged sets', () => {
  // Master plan section 6.5: "hold load until every prescribed set of the LAST
  // session reached prescription.hi". The predicate is metCount >= setsLo, never
  // metCount === lastSession.length. Extra non-bonus work cannot revoke a
  // progression the prescribed sets already earned.
  it('adds load when the three prescribed sets met the top and a back-off set did not', () => {
    const history = [
      ...session('2026-03-02', 3, 60, 8), // the prescribed sets, at the working load
      // A back-off set: lighter than the working load, more repetitions, NOT a bonus
      // set, so the old `metCount === lastSession.length` test wrongly held the load.
      makeSet({ assignmentDate: '2026-03-02', setNumber: 4, loadKg: 50, reps: 12 }),
    ];
    const advice = suggestedProgression(
      history,
      makePlannedExercise({ setsLo: 3, setsHi: 4 }),
      makeExercise({ loadClass: 'upper-compound' }),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('add-load');
    expect(advice.loadKg).toBeCloseTo(62.5, 10); // [kg] 60 + one 2.5 kg step
    expect(metCounts(advice.why)).toEqual({ met: 3, required: 3 });
  });

  it('takes the required count from setsLo, so setsHi never gates a progression', () => {
    // setsLo is what the session prescribes; setsHi is the top of an OPTIONAL volume
    // range. Gating on setsHi would stall a lifter who performs the prescription.
    const advice = suggestedProgression(
      session('2026-03-02', 3, 60, 8),
      makePlannedExercise({ setsLo: 3, setsHi: 5 }),
      makeExercise({ loadClass: 'upper-compound' }),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('add-load');
    expect(metCounts(advice.why)).toEqual({ met: 3, required: 3 });
  });

  it('states counts consistently with the advice: a hold never claims the prescription was met', () => {
    const held = suggestedProgression(
      [
        ...session('2026-03-02', 2, 60, 8),
        makeSet({ assignmentDate: '2026-03-02', setNumber: 3, loadKg: 60, reps: 7 }),
      ],
      makePlannedExercise(),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(held.kind).toBe('hold');
    const heldCounts = metCounts(held.why);
    expect(heldCounts.met).toBeGreaterThanOrEqual(0); // the frame was found at all
    expect(heldCounts.met).toBeLessThan(heldCounts.required);
    expect(held.why).not.toMatch(/\bAll\b/); // "All N prescribed sets" is an add-load claim

    const added = suggestedProgression(
      session('2026-03-02', 3, 60, 8),
      makePlannedExercise(),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(added.kind).toBe('add-load');
    const addedCounts = metCounts(added.why);
    expect(addedCounts.met).toBeGreaterThanOrEqual(addedCounts.required);
    expect(addedCounts.required).toBe(3);
  });

  it('inflects the copy frame, so one prescribed set never reads "1 prescribed sets"', () => {
    const advice = suggestedProgression(
      session('2026-03-02', 1, 60, 8),
      makePlannedExercise({ setsLo: 1, setsHi: 1 }),
      makeExercise({ loadClass: 'upper-compound' }),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('add-load');
    expect(advice.why).toContain('1 set reached 8 repetitions');
    expect(advice.why).toContain('1 prescribed set required');
    expect(advice.why).not.toMatch(/1 prescribed sets/);
    expect(advice.why).not.toMatch(/\b1 sets\b/);
  });
});

describe('suggestedProgression working-load rule', () => {
  // L is the HEAVIEST non-bonus load of the last session, and only sets within
  // LOAD_EQ_TOL_KG of L count towards the prescribed-set tally.
  it('reads the working load as the heaviest non-bonus load of a mixed-load session', () => {
    const history = [
      makeSet({ assignmentDate: '2026-03-02', setNumber: 1, loadKg: 62.5, reps: 6 }),
      makeSet({ assignmentDate: '2026-03-02', setNumber: 2, loadKg: 60, reps: 8 }),
      makeSet({ assignmentDate: '2026-03-02', setNumber: 3, loadKg: 60, reps: 8 }),
    ];
    const advice = suggestedProgression(
      history,
      makePlannedExercise(),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    // L = 62.5 kg; the two 60 kg sets are outside the tolerance, so nothing counts.
    expect(advice.kind).toBe('hold');
    expect(advice.loadKg).toBe(62.5); // [kg]
    expect(metCounts(advice.why)).toEqual({ met: 0, required: 3 });
    expect(advice.why).toContain('62.5 kg');
  });

  it('counts a load within LOAD_EQ_TOL_KG of the working load as the same load', () => {
    // A kg/lb round trip leaves float residue; 0.005 kg is well inside the 0.01 kg
    // tolerance and must not silently break the tally.
    const history = [
      makeSet({ assignmentDate: '2026-03-02', setNumber: 1, loadKg: 60, reps: 8 }),
      makeSet({ assignmentDate: '2026-03-02', setNumber: 2, loadKg: 60 - 0.005, reps: 8 }),
      makeSet({ assignmentDate: '2026-03-02', setNumber: 3, loadKg: 60, reps: 8 }),
    ];
    const advice = suggestedProgression(
      history,
      makePlannedExercise(),
      makeExercise({ loadClass: 'upper-compound' }),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('add-load');
    expect(metCounts(advice.why)).toEqual({ met: 3, required: 3 });
  });
});

describe('suggestedProgression on prescriptions with no rep ceiling', () => {
  /** A timed set: a load and a duration, no repetition count. */
  function timedSet(setNumber: number, loadKg: number, durationS: number): LoggedSet {
    return makeSet({
      assignmentDate: '2026-03-02',
      setNumber,
      loadKg, // [kg]
      reps: null, // [repetitions] not recorded for timed work
      durationS, // [s]
    });
  }

  it('holds the load actually used for a "time" prescription logged as a duration', () => {
    const advice = suggestedProgression(
      [timedSet(1, 20, 45), timedSet(2, 20, 45), timedSet(3, 20, 40)],
      makePlannedExercise({ prescription: { kind: 'time', targetS: 45 } }),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('hold');
    expect(advice.loadKg).toBe(20); // [kg] carried from the last performed set
    expect(advice.why).toContain('20 kg');
    expect(advice.nextPrescription).toEqual({ kind: 'time', targetS: 45 });
  });

  it('holds the load actually used for a "duration" prescription', () => {
    const advice = suggestedProgression(
      [timedSet(1, 32.5, 60), timedSet(2, 32.5, 60)],
      makePlannedExercise({ prescription: { kind: 'duration', targetS: 60 } }),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('hold');
    expect(advice.loadKg).toBe(32.5); // [kg]
    expect(advice.nextPrescription).toEqual({ kind: 'duration', targetS: 60 });
  });

  it('holds with a null load for a timed prescription with nothing logged', () => {
    const advice = suggestedProgression(
      [],
      makePlannedExercise({ prescription: { kind: 'time', targetS: 45 } }),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('hold');
    expect(advice.loadKg).toBeNull();
  });

  it('holds the load for a "none" prescription: there is no target to progress against', () => {
    const advice = suggestedProgression(
      session('2026-03-02', 3, 45, 15),
      makePlannedExercise({ prescription: { kind: 'none' } }),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('hold');
    expect(advice.loadKg).toBe(45); // [kg]
    expect(advice.nextPrescription).toEqual({ kind: 'none' });
  });

  it('ignores a stray duration-only set when the prescription does have a rep ceiling', () => {
    // A duration-only set records no repetitions, so it cannot have reached the top
    // of the range. It counts as performed (it sets the working load) but never met.
    const history = [
      ...session('2026-03-02', 3, 60, 8),
      timedSet(4, 70, 30), // heavier, so it becomes the working load
    ];
    const advice = suggestedProgression(
      history,
      makePlannedExercise(),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('hold');
    expect(advice.loadKg).toBe(70); // [kg] heaviest non-bonus load of the session
    expect(metCounts(advice.why)).toEqual({ met: 0, required: 3 });
  });
});

describe('advice copy contract R5: no dash connectors', () => {
  // Copy contract R5: no em-dash or en-dash as a connector. An en-dash INSIDE a
  // numeric range ("6–8 repetitions") is explicitly retained, so it is stripped
  // before the assertion and every remaining dash is a connector.
  function connectorDashes(text: string): string {
    return text.replace(/(?<=\d)–(?=\d)/g, '-');
  }

  const ex = makeExercise();
  const bodyweight = makeExercise({ id: 'pull-up', isBodyweight: true, modality: 'bodyweight' });
  const timed = [
    makeSet({ assignmentDate: '2026-03-02', setNumber: 1, loadKg: 20, reps: null, durationS: 45 }),
  ];
  const r5Cases: [string, LoggedSet[], PlannedExercise, Exercise, PlanBlock][] = [
    ['deload', session('2026-03-02', 3, 60, 8), makePlannedExercise(), ex, makeBlock({ isDeload: true })],
    [
      'bodyweight',
      session('2026-03-02', 3, 0, 8, { exerciseId: 'pull-up' }),
      makePlannedExercise({ exerciseId: 'pull-up' }),
      bodyweight,
      makeBlock(),
    ],
    [
      'amrap',
      session('2026-03-02', 3, 60, 14),
      makePlannedExercise({ prescription: { kind: 'amrap', minimum: null } }),
      ex,
      makeBlock(),
    ],
    ['time', timed, makePlannedExercise({ prescription: { kind: 'time', targetS: 45 } }), ex, makeBlock()],
    [
      'duration',
      timed,
      makePlannedExercise({ prescription: { kind: 'duration', targetS: 45 } }),
      ex,
      makeBlock(),
    ],
    ['none', session('2026-03-02', 3, 45, 15), makePlannedExercise({ prescription: { kind: 'none' } }), ex, makeBlock()],
    ['no history', [], makePlannedExercise(), ex, makeBlock()],
    ['hold', session('2026-03-02', 3, 60, 7), makePlannedExercise(), ex, makeBlock()],
    ['step guard', session('2026-03-02', 3, 20, 8), makePlannedExercise(), ex, makeBlock()],
    ['add-load', session('2026-03-02', 3, 60, 8), makePlannedExercise(), ex, makeBlock()],
    [
      'add-load with a back-off set',
      [
        ...session('2026-03-02', 3, 60, 8),
        makeSet({ assignmentDate: '2026-03-02', setNumber: 4, loadKg: 50, reps: 12 }),
      ],
      makePlannedExercise(),
      ex,
      makeBlock(),
    ],
  ];

  it.each(r5Cases)('%s: reason and why carry no dash connector', (_name, history, planned, exercise, block) => {
    const advice = suggestedProgression(history, planned, exercise, makeProfile(), block);
    expect(connectorDashes(advice.reason)).not.toMatch(/[—–]/);
    expect(connectorDashes(advice.why)).not.toMatch(/[—–]/);
  });

  it.each(r5Cases)('%s: reason stays within the 12-word limit', (_name, history, planned, exercise, block) => {
    const advice = suggestedProgression(history, planned, exercise, makeProfile(), block);
    expect(advice.reason.trim().split(/\s+/).length).toBeLessThanOrEqual(MAX_REASON_WORDS);
    expect(advice.reason).not.toContain('!');
    expect(advice.why.length).toBeGreaterThan(0);
  });
});
