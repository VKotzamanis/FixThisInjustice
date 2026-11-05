// src/ui/setup/model/result.ts
//
// The wizard's Confirm as a pure function (audit A01/A16): answers in, either the exact
// `SetupResult` that the store's `completeSetup` takes or the reason there is none. The store
// stays the authority (src/store/setup.ts parses again before it writes); this checks the same
// schemas first so the result can be tested without a store, and so the invariant "answers that
// pass every step give a document the loader accepts" is a property of this module
// (result.property.test.ts). Moved verbatim out of SetupWizard.tsx's confirm(); the plan is
// generated here unless the caller passes the one it already previewed.
import { AvailabilitySchema, PlanTemplateSchema, ProfileSchema } from '../../../domain/schema';
import { seedBeverageTargetML } from '../../../domain/nutrition';
import { inventoryOf, showsHomeEquipment, showsPortableEquipment } from '../../../domain/plan/inventory';
import { EXERCISES } from '../../../domain/plan/library';
import { generatePlan, type PlanInput } from '../../../domain/plan/generator';
import { INITIAL_WEEKS } from '../../../domain/plan/engine';
import {
  DEFAULT_BARBELL_STEP,
  DEFAULT_DUMBBELL_STEP,
  type Availability,
  type AvailabilitySlot,
  type LocalDate,
  type PlanTemplate,
  type Profile,
  type SetupAnswers,
} from '../../../domain/types';
import type { CopyKey } from '../../../content/copy';
import type { SetupResult } from '../../../store/setup';
import { parseOrThrow } from '../../../store/validate';
import { parseDecimal, storedLoadKg } from '../../components/UnitInput';
import {
  DEFAULT_CUP_ML,
  DEFAULT_DISPLAY_NAME,
  DEFAULT_SESSION_DURATION_MIN,
  SECONDS_PER_MINUTE,
  STEPS,
  deriveAnswers,
  showsGymCommute,
  showsLoadSteps,
  type StepId,
} from './answers';
import { stepError, validateStep } from './fields';

type Overrides = Readonly<Partial<Record<CopyKey, string>>>;

/**
 * The generator input the answers describe. The preview on Review and the stored plan are built
 * from this one object. The inventory lists are re-gated on the final equipment position, the
 * same re-gating the profile below applies.
 */
export function planInputOf(a: SetupAnswers): PlanInput {
  return {
    sessionsPerWeek: a.sessionsPerWeek,
    // ROADMAP L6: no programme length is asked; INITIAL_WEEKS is a materialisation depth.
    weeks: INITIAL_WEEKS, // [weeks]
    goal: a.goalKind,
    experience: a.experience,
    equipment: a.equipment,
    includeCardio: a.includeCardio,
    inventory: inventoryOf({
      equipment: a.equipment,
      homeEquipment: showsHomeEquipment(a.equipment) ? a.homeEquipment : [],
      bodyweightEquipment: showsPortableEquipment(a.equipment) ? a.bodyweightEquipment : [],
      inventoryAnsweredFor: a.equipment,
    }),
  };
}

export interface SetupContext {
  /** The civil date in the profile's zone; the programme starts on it. */
  today: LocalDate;
  /** The resolved IANA zone (answers.ts zoneOf). */
  zone: string;
  profileId: string;
  /** [ms] epoch, stored as Profile.createdAt. */
  now: number;
  overrides: Overrides;
  /** The plan already previewed; generated from planInputOf when absent. */
  plan?: PlanTemplate;
}

export type SetupBuild =
  | { ok: true; result: SetupResult }
  /** A step's own fields still fail; nothing to build. */
  | { ok: false; reason: 'blocked'; steps: StepId[] }
  /** A quantity every step requires is missing; unreachable once no step is blocked. */
  | { ok: false; reason: 'incomplete' }
  /** A loader schema refuses what was built: `error` names the field (parseOrThrow's text). */
  | { ok: false; reason: 'schema'; error: string };

/**
 * Builds the profile, availability and plan Confirm writes. Pure apart from `generatePlan`'s ids
 * when no `ctx.plan` is passed.
 */
export function buildSetupResult(a: SetupAnswers, ctx: SetupContext): SetupBuild {
  const blocked = STEPS.filter((s) => validateStep(s, a, ctx.overrides).blocked);
  if (blocked.length > 0) return { ok: false, reason: 'blocked', steps: blocked };

  const d = deriveAnswers(a);
  /*
   * A09: a hidden load step can neither block nor break Confirm. An unusable hidden value is
   * replaced by the unit's default, the value the field is seeded with.
   */
  const loadStepsShown = showsLoadSteps(a.equipment);
  const loadStepKg = (text: string, fallback: number): number | null =>
    loadStepsShown || stepError('', text, a.units, ctx.overrides) === null
      ? storedLoadKg(text, a.units)
      : storedLoadKg(String(fallback), a.units);
  const barbellKg = loadStepKg(a.barbellStep, DEFAULT_BARBELL_STEP[a.units]); // [kg]
  const dumbbellPairKg = loadStepKg(a.dumbbellStep, DEFAULT_DUMBBELL_STEP[a.units]); // [kg]
  const stackKg = storedLoadKg(a.stackStep, a.units); // [kg]
  const birthYear = d.ageYears === null ? null : Number(ctx.today.slice(0, 4)) - d.ageYears; // [year]
  if (
    d.massKg === null ||
    d.heightCm === null ||
    birthYear === null ||
    barbellKg === null ||
    dumbbellPairKg === null ||
    stackKg === null
  ) {
    // Every one of these blocks its own step except stackKg, a default no control edits.
    return { ok: false, reason: 'incomplete' };
  }
  /*
   * Brief I Part 2: where the body-fat route was open, the stored target mass is the one that
   * percentage implies at held lean mass, so the two stored fields describe one target.
   */
  const targetMassKg = d.bodyFatTargetAvailable ? d.impliedTargetMassKg : d.typedTargetMassKg; // [kg]
  const walks = showsGymCommute(a.equipment) && a.walksToGym;
  const walkMinutesTyped = parseDecimal(a.walkMinutes); // [min] one way

  const profile: Profile = {
    id: ctx.profileId,
    displayName: a.displayName.trim() === '' ? DEFAULT_DISPLAY_NAME : a.displayName.trim(),
    timezone: ctx.zone,
    units: a.units,
    createdAt: ctx.now, // [ms] epoch
    body: {
      sex: a.sex,
      birthYear, // [year]
      heightCm: d.heightCm, // [cm]
      baselineMassKg: d.massKg, // [kg]
      baselineAt: ctx.today,
      baselineBodyFatPct: d.bodyFatPct, // [%] or null
    },
    activity: a.activity,
    activityPal: a.activityPal ?? null, // PAL, dimensionless
    experience: a.experience,
    equipment: a.equipment,
    // Entered in the display unit, stored canonically in kg.
    equipmentSteps: { barbellKg, dumbbellPairKg, stackKg },
    // Re-gated on the final slider position: a Yes given at Full gym must not survive into a
    // profile whose final position never asked the question.
    gymCommute: { walks, minutesEachWay: walks ? (walkMinutesTyped ?? 0) : 0 }, // [min]
    homeEquipment: showsHomeEquipment(a.equipment) ? a.homeEquipment : [],
    bodyweightEquipment: showsPortableEquipment(a.equipment) ? a.bodyweightEquipment : [],
    // P3a (audit D07): where the lists were asked, so an empty answer differs from "never asked".
    inventoryAnsweredFor: a.equipment,
    goal: {
      kind: a.goalKind, // the derived goal; neither axis is stored (Brief I Part 1)
      targetMassKg, // [kg] or null
      targetBodyFatPct: d.bodyFatTargetAvailable ? d.targetBodyFatPct : null, // [%] or null
      targetDate: a.targetDate === '' ? null : a.targetDate,
    },
    supplements: { creatine: a.creatine },
    hydration: {
      // The SEEDED preference (nutrition.ts owns the `nd` low-end rule); editable in Settings.
      dailyTargetML: seedBeverageTargetML(a.sex), // [mL/day]
      cupSizeML: DEFAULT_CUP_ML, // [mL]
      weighInOptIn: a.weighInOptIn,
    },
    // Readiness screening is retired (Brief A); kept on the schema for old documents.
    readiness: { screenedAt: null, flagged: false },
  };

  const slots: AvailabilitySlot[] = d.enabledDays.map((day) => ({
    weekday: day.value,
    startTime: a.days[day.value].startTime, // [HH:mm]
    expectedDurationS:
      (parseDecimal(a.days[day.value].durationMin) ?? DEFAULT_SESSION_DURATION_MIN) * SECONDS_PER_MINUTE, // [s]
  }));
  // Stored as typed: the goal step refuses a fraction and anything outside 1..slots.length.
  const availability: Availability = {
    slots,
    weeklySessionTarget: parseDecimal(a.weeklySessionTarget) ?? slots.length, // [sessions/week]
  };

  const plan = ctx.plan ?? generatePlan(planInputOf(a), EXERCISES);

  // The loader's schemas through the store's own boundary check (src/store/validate.ts).
  try {
    parseOrThrow(ProfileSchema, profile, 'profile');
    parseOrThrow(AvailabilitySchema, availability, 'availability');
    parseOrThrow(PlanTemplateSchema, plan, 'plan');
  } catch (e) {
    return { ok: false, reason: 'schema', error: e instanceof Error ? e.message : String(e) };
  }

  return { ok: true, result: { profile, availability, plan, startedOn: ctx.today } };
}
