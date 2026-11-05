// A01's invariant (audit A-onboarding, Architecture verdict): any answers that pass every
// validateStep give a buildSetupResult output that, applied by the store's own transition,
// produces a document parseState accepts. Generators straddle each field's bounds so both
// sides of every rule are reached; fc.pre keeps only the answers the wizard would let through.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ACTIVITY_STOPS } from '../../../domain/nutrition';
import { SetupDraftShapeSchema, defaultState, parseState } from '../../../domain/schema';
import type { BodyweightEquipmentItem, HomeEquipmentItem, SetupAnswers } from '../../../domain/types';
import { applyCompleteSetup } from '../../../store/setup';
import { STEPS, initialAnswers } from './answers';
import { validateStep } from './fields';
import { buildSetupResult } from './result';

/**
 * A number as the user might type it, uniform from `lo` to `hi` at `decimals` places, sometimes
 * blank or garbage. Unbiased: fast-check's default bias piles values onto the range ends, which
 * left almost no answer set inside every bound at once.
 */
function typed(lo: number, hi: number, decimals: number): fc.Arbitrary<string> {
  const scale = 10 ** decimals;
  return fc.oneof(
    {
      weight: 20,
      arbitrary: fc
        .noBias(fc.integer({ min: Math.round(lo * scale), max: Math.round(hi * scale) }))
        .map((n) => (n / scale).toFixed(decimals)),
    },
    { weight: 1, arbitrary: fc.constantFrom('', 'abc', '-1', '0') },
  );
}

const HOME: readonly HomeEquipmentItem[] = [
  'treadmill', 'elliptical', 'rowing-machine', 'dumbbells-5-20', 'dumbbells-20-40', 'dumbbells-40-plus',
  'squat-rack', 'cable-machine', 'bench', 'leg-press', 'lat-pulldown', 'smith-machine',
];
const PORTABLE: readonly BodyweightEquipmentItem[] = ['yoga-mat', 'skipping-rope', 'pull-up-bar', 'resistance-bands'];

const day = fc.record({
  enabled: fc.oneof({ weight: 4, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
  startTime: fc.oneof({ weight: 12, arbitrary: fc.constantFrom('00:00', '07:30', '23:59') }, { weight: 1, arbitrary: fc.constantFrom('', '24:00') }),
  durationMin: typed(0.5, 1445, 2), // [min]
});

const answers: fc.Arbitrary<SetupAnswers> = fc
  .record({
    units: fc.constantFrom('metric' as const, 'imperial' as const),
    timezone: fc.constantFrom('UTC', 'America/Chicago', 'Pacific/Kiritimati', 'Not/AZone'),
    displayName: fc.string({ maxLength: 90 }),
    sex: fc.constantFrom('male' as const, 'female' as const, 'nd' as const),
    ageYears: typed(16, 82, 0), // [years]
    heightM: typed(1, 2, 0), // [m]
    heightCm: typed(0, 99, 0), // [cm]
    heightFt: typed(4, 7, 0), // [ft]
    heightIn: typed(0, 11, 0), // [in]
    mass: typed(20, 700, 1), // [kg] or [lb]
    bodyFatMode: fc.constantFrom('none' as const, 'known' as const, 'tape' as const),
    bodyFatPct: fc.oneof(typed(0, 70, 1), fc.constant('')), // [%]
    neck: typed(10, 80, 1), // [cm] or [in]
    waist: typed(30, 200, 1),
    hip: typed(40, 200, 1),
    stop: fc.constantFrom(...ACTIVITY_STOPS),
    experience: fc.constantFrom('novice' as const, 'intermediate' as const, 'advanced' as const),
    equipment: fc.constantFrom('bodyweight' as const, 'home-and-bodyweight' as const, 'home' as const, 'full-and-home' as const, 'full-gym' as const),
    barbellStep: typed(0, 250, 2), // [kg] or [lb]
    dumbbellStep: typed(0, 250, 2),
    walksToGym: fc.boolean(),
    walkMinutes: typed(0, 1445, 0), // [min]
    homeEquipment: fc.subarray([...HOME]),
    bodyweightEquipment: fc.subarray([...PORTABLE]),
    goalKind: fc.constantFrom('fat-loss' as const, 'muscle-gain' as const, 'recomposition' as const, 'maintenance' as const),
    targetMass: fc.oneof(typed(20, 700, 1), fc.constant('')), // [kg] or [lb]
    targetBodyFat: fc.oneof(typed(0, 70, 1), fc.constant('')), // [%]
    targetDate: fc.constantFrom('', '2027-01-15', '2026-02-30', 'soon'),
    creatine: fc.boolean(),
    weighInOptIn: fc.boolean(),
    sessionsPerWeek: fc.constantFrom(2 as const, 3 as const, 4 as const, 5 as const, 6 as const),
    days: fc.record({ 1: day, 2: day, 3: day, 4: day, 5: day, 6: day, 7: day }),
    weeklySessionTarget: typed(0, 7, 0), // [sessions/week]
    includeCardio: fc.boolean(),
  })
  .map(({ stop, ...rest }) => ({ ...initialAnswers(), ...rest, activity: stop.level, activityPal: stop.pal }));

describe('A01 invariant: answers every step accepts make a document the loader accepts', () => {
  it('holds for generated answers', () => {
    fc.assert(
      fc.property(answers, (a) => {
        fc.pre(STEPS.every((s) => !validateStep(s, a, {}).blocked));
        const built = buildSetupResult(a, {
          today: '2026-09-04',
          zone: a.timezone,
          profileId: 'p-prop',
          now: 1_788_000_000_000, // [ms] epoch, synthetic
          overrides: {},
        });
        if (!built.ok) throw new Error(`accepted answers did not build: ${JSON.stringify(built)}`);
        const state = applyCompleteSetup(defaultState(), built.result, 'plan-prop');
        const reloaded = parseState(JSON.parse(JSON.stringify(state)));
        expect(reloaded.ok ? 'ok' : reloaded.error).toBe('ok');
      }),
      { numRuns: 300, maxSkipsPerRun: 1000 },
    );
  });
});

describe('A06: the stored draft step index admits every step the wizard can write', () => {
  // MAX_SETUP_DRAFT_STEP_INDEX (src/domain/schema.ts) stays 8 on purpose: lowering it to
  // STEPS.length - 1 would make SetupDraftSchema's `.catch(null)` drop a draft stored at 7 or 8
  // by the nine-step wizard (rule 7). The wizard clamps such an index on restore.
  const draftAt = (stepIndex: number): unknown => ({ ...initialAnswers(), stepIndex, buffer: null });
  it('accepts 0..STEPS.length - 1 and the legacy 7 and 8, refuses 9', () => {
    for (let i = 0; i < STEPS.length; i += 1) expect(SetupDraftShapeSchema.safeParse(draftAt(i)).success).toBe(true);
    expect(SetupDraftShapeSchema.safeParse(draftAt(7)).success).toBe(true);
    expect(SetupDraftShapeSchema.safeParse(draftAt(8)).success).toBe(true);
    expect(SetupDraftShapeSchema.safeParse(draftAt(9)).success).toBe(false);
  });
});
