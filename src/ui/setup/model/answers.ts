// src/ui/setup/model/answers.ts
//
// The setup wizard's answers model (audit A15/A16): the step list, the fresh answers, which
// equipment questions are asked, and every number derived from the raw typed strings. Pure:
// no React, no store, no clock (the caller passes `today`).
//
// WHY src/ui/setup/model AND NOT src/domain/setup. The field rules this model applies return
// the visible message text, which is skin copy (src/content/copy.ts), and they parse through
// src/ui/components/UnitInput.tsx and src/ui/setup/fieldRules.ts, which the Settings profile
// editor shares (spec R9). Moving them under src/domain would make the domain layer import UI
// modules; keeping the model beside the wizard keeps the dependency one-way while the model
// itself stays pure and unit-tested (fields.test.ts, result.test.ts).
//
// Moved verbatim out of SetupWizard.tsx; the reasons for each default and predicate are kept.
import { copy, type CopyKey } from '../../../content/copy';
import { deviceTimeZone, isValidTimeZone } from '../../../domain/dates';
import { estimateBodyFatNavy } from '../../../domain/bodyfat';
import { ACTIVITY_FACTOR, NUTRITION_DOMAIN } from '../../../domain/nutrition';
import type { SessionsPerWeek } from '../../../domain/plan/templates';
import {
  DEFAULT_BARBELL_STEP,
  DEFAULT_DUMBBELL_STEP,
  DEFAULT_STACK_STEP,
  type EquipmentAccess,
  type IsoWeekday,
  type SetupAnswers,
  type SetupDraft,
  type StatedSex,
} from '../../../domain/types';
import { parseDecimal, storedGirthCm, storedMassKg } from '../../components/UnitInput';
import { UNIT, heightCmFromParts, massDomainError, requiredInRange } from '../fieldRules';

/**
 * The steps, in order. Rendering, the step counter and the nav all read this array, so a step
 * is added by inserting one member and one branch, never by renumbering anything.
 */
export const STEPS = ['units', 'timezone', 'body', 'training', 'goal', 'guidance', 'review'] as const;

export type StepId = (typeof STEPS)[number];

/**
 * Audit A06: the step a stored draft resumes on. By `stepId` when it names a step that still
 * exists, else the stored index clamped into STEPS, so a stale or out-of-range index can never
 * open "Step 9 of 8" with no way forward.
 */
export function restoreStepIndex(draft: Pick<SetupDraft, 'stepIndex' | 'stepId'> | null): number {
  if (draft === null) return 0;
  const byId = draft.stepId === undefined ? -1 : (STEPS as readonly string[]).indexOf(draft.stepId);
  if (byId >= 0) return byId;
  return Math.min(Math.max(0, Math.trunc(draft.stepIndex)), STEPS.length - 1);
}

export const WEEKDAYS: { value: IsoWeekday; labelKey: CopyKey }[] = [
  { value: 1, labelKey: 'weekday.monday' },
  { value: 2, labelKey: 'weekday.tuesday' },
  { value: 3, labelKey: 'weekday.wednesday' },
  { value: 4, labelKey: 'weekday.thursday' },
  { value: 5, labelKey: 'weekday.friday' },
  { value: 6, labelKey: 'weekday.saturday' },
  { value: 7, labelKey: 'weekday.sunday' },
];

export const SECONDS_PER_MINUTE = 60; // [s/min]
export const DEFAULT_SESSION_DURATION_MIN = 60; // [min]
const DEFAULT_START_TIME = '07:30'; // [HH:mm] local
export const DEFAULT_SESSIONS_PER_WEEK: SessionsPerWeek = 4; // [sessions/week]
export const DEFAULT_CUP_ML = 250; // [mL] display granularity for the hydration view only
export const DEFAULT_DISPLAY_NAME = 'Operator'; // used only when the optional name is left blank

/*
 * Mirrors of two caps in src/domain/schema.ts, which does not export them. Validated here so a
 * value the schema would reject is refused at the field rather than at Confirm.
 *   MAX_STEP_KG  = 100 kg per increment.
 *   MAX_SECONDS  = 86 400 s, which is 1440 min of expected session duration.
 */
export const MAX_STEP_KG = 100; // [kg]
export const MAX_SESSION_DURATION_MIN = 1440; // [min]

export const SESSIONS_PER_WEEK_OPTIONS: readonly SessionsPerWeek[] = [2, 3, 4, 5, 6];

/** One weekday's availability as typed: raw text, [HH:mm] and [min]. */
export type DaySlot = SetupAnswers['days'][IsoWeekday];

function defaultDay(): DaySlot {
  return {
    enabled: false,
    startTime: DEFAULT_START_TIME,
    durationMin: String(DEFAULT_SESSION_DURATION_MIN),
  };
}

/** The answers a fresh wizard opens with. Reads the device zone, nothing else. */
export function initialAnswers(): SetupAnswers {
  return {
    units: 'metric',
    timezone: deviceTimeZone(),
    displayName: '',
    /*
     * Round 2 claim r2.11, plan decision A1: `nd` is the value a wizard OPENS with, not an error
     * state, and Next does not block on it. What it does block on is the body-fat percentage,
     * which the only sex-free equation needs (the `bodyFat` rule in ./fields).
     */
    sex: 'nd',
    ageYears: '',
    heightM: '',
    heightCm: '',
    heightFt: '',
    heightIn: '',
    mass: '',
    // Round 1 claims C1.08.1 to C1.08.4: percentage entry is first and default, not "none".
    bodyFatMode: 'known',
    bodyFatPct: '',
    bodyFatSource: 'measured',
    neck: '',
    waist: '',
    hip: '',
    activity: 'moderate',
    // Brief G: ACTIVITY_FACTOR.moderate is that band's own printed floor (stop 4 of 9), so a
    // fresh wizard that never touches the slider reproduces the pre-nine-stop default exactly.
    activityPal: ACTIVITY_FACTOR.moderate,
    experience: 'novice',
    equipment: 'full-gym',
    barbellStep: String(DEFAULT_BARBELL_STEP.metric),
    dumbbellStep: String(DEFAULT_DUMBBELL_STEP.metric),
    stackStep: String(DEFAULT_STACK_STEP.metric),
    walksToGym: false,
    walkMinutes: '0',
    homeEquipment: [],
    bodyweightEquipment: [],
    goalKind: 'fat-loss',
    targetMass: '',
    // Brief I Part 2. Empty, not null: an empty text field, exactly like targetMass beside it.
    targetBodyFat: '',
    targetDate: '',
    creatine: false,
    weighInOptIn: false,
    sessionsPerWeek: DEFAULT_SESSIONS_PER_WEEK,
    days: {
      1: defaultDay(),
      2: defaultDay(),
      3: defaultDay(),
      4: defaultDay(),
      5: defaultDay(),
      6: defaultDay(),
      7: defaultDay(),
    },
    weeklySessionTarget: String(DEFAULT_SESSIONS_PER_WEEK),
    includeCardio: false,
  };
}

/** Brief F Part 3: the walk-to-gym question, `Full gym` or `Full gym and home gym` only. */
export function showsGymCommute(equipment: EquipmentAccess): boolean {
  return equipment === 'full-gym' || equipment === 'full-and-home';
}

/**
 * Round 3 Task 8: the load-step fields, "ONLY when home gym and above is selected". The cut is
 * at the first position that includes a gym's plates or dumbbells: `Body weight only` is the one
 * position with no external load, so it is the one position the fields are hidden on.
 */
export function showsLoadSteps(equipment: EquipmentAccess): boolean {
  return equipment !== 'bodyweight';
}

/**
 * The zone every date in the wizard is computed in. An unrecognised entry blocks the time-zone
 * step, so the device zone is only ever used to keep the readouts alive while one is typed.
 */
export function zoneOf(a: SetupAnswers): string {
  return isValidTimeZone(a.timezone) ? a.timezone : deviceTimeZone();
}

/** The numbers the raw answers imply. Every quantity is null while its input is missing. */
export interface DerivedAnswers {
  /** The sex when one was given, null under `nd` (decision A1): no `?? 'male'` anywhere. */
  statedSex: StatedSex | null;
  heightCm: number | null; // [cm] exact
  massKg: number | null; // [kg] exact
  ageYears: number | null; // [years], as typed
  /** US Navy estimate for the girths so far; null unless the tape route is open and complete. */
  tapeEstimate: number | null; // [%] of body mass
  /** The body-fat percentage that will be stored, whichever way it was obtained. */
  bodyFatPct: number | null; // [%] of body mass
  /** Decision A1: without a stated sex the percentage is required (Cunningham is all that is left). */
  bodyFatRequired: boolean;
  /** The weekdays the user offered, in WEEKDAYS order. */
  enabledDays: typeof WEEKDAYS;
  currentFatKg: number | null; // [kg]
  currentLeanKg: number | null; // [kg]
  /** Brief I Part 2: the target is a body-fat percentage where a composition exists to set it against. */
  bodyFatTargetAvailable: boolean;
  /** The typed target body fat when it is valid, else null. */
  targetBodyFatPct: number | null; // [%] of body mass
  /** lean / (1 - target%), holding lean mass; null at 100 % and above. */
  impliedTargetMassKg: number | null; // [kg]
  impliedTargetFatKg: number | null; // [kg]
  /** The typed target body mass when it is valid, else null. */
  typedTargetMassKg: number | null; // [kg]
  /** The one target the calendar and the profile use: implied where available, else typed. */
  effectiveTargetMassKg: number | null; // [kg]
}

/** The body-fat target as typed; absent on drafts written before the field existed. */
export function targetBodyFatText(a: SetupAnswers): string {
  return a.targetBodyFat ?? '';
}

/**
 * Every derived number, from the answers alone.
 *
 * The validity tests for the two optional targets call the field rules themselves (with no
 * overrides: whether a message exists does not depend on its wording), so "valid" here and the
 * visible error in ./fields are the same function.
 */
export function deriveAnswers(a: SetupAnswers): DerivedAnswers {
  const statedSex: StatedSex | null = a.sex === 'nd' ? null : a.sex;
  const heightCm = heightCmFromParts(a.units, {
    m: a.heightM,
    cm: a.heightCm,
    ft: a.heightFt,
    inch: a.heightIn,
  }); // [cm] exact
  const massKg = storedMassKg(a.mass, a.units); // [kg] exact
  const ageYears = parseDecimal(a.ageYears); // [years]

  let tapeEstimate: number | null = null; // [%]
  if (a.bodyFatMode === 'tape' && statedSex !== null) {
    const neckCm = storedGirthCm(a.neck, a.units); // [cm]
    const waistCm = storedGirthCm(a.waist, a.units); // [cm]
    const hipCm = storedGirthCm(a.hip, a.units); // [cm]
    if (
      heightCm !== null &&
      neckCm !== null &&
      waistCm !== null &&
      !(statedSex === 'female' && hipCm === null)
    ) {
      tapeEstimate = estimateBodyFatNavy({ sex: statedSex, heightCm, neckCm, waistCm, hipCm });
    }
  }

  const bodyFatPct: number | null =
    a.bodyFatMode === 'known'
      ? parseDecimal(a.bodyFatPct)
      : a.bodyFatMode === 'tape'
        ? tapeEstimate
        : null; // [%]

  const currentFatKg = massKg !== null && bodyFatPct !== null ? massKg * (bodyFatPct / 100) : null; // [kg]
  const currentLeanKg = massKg !== null && currentFatKg !== null ? massKg - currentFatKg : null; // [kg]
  const bodyFatTargetAvailable = currentLeanKg !== null;

  const targetBodyFatPct =
    targetBodyFatError(a, {}) === null ? parseDecimal(targetBodyFatText(a)) : null; // [%]
  const impliedTargetMassKg =
    currentLeanKg !== null && targetBodyFatPct !== null && targetBodyFatPct < 100
      ? currentLeanKg / (1 - targetBodyFatPct / 100)
      : null; // [kg]
  const impliedTargetFatKg =
    impliedTargetMassKg !== null && currentLeanKg !== null ? impliedTargetMassKg - currentLeanKg : null; // [kg]

  const typedTargetMassKg = targetMassError(a, {}) === null ? storedMassKg(a.targetMass, a.units) : null; // [kg]

  return {
    statedSex,
    heightCm,
    massKg,
    ageYears,
    tapeEstimate,
    bodyFatPct,
    bodyFatRequired: statedSex === null,
    enabledDays: WEEKDAYS.filter((d) => a.days[d.value].enabled),
    currentFatKg,
    currentLeanKg,
    bodyFatTargetAvailable,
    targetBodyFatPct,
    impliedTargetMassKg,
    impliedTargetFatKg,
    typedTargetMassKg,
    effectiveTargetMassKg: bodyFatTargetAvailable ? impliedTargetMassKg : typedTargetMassKg,
  };
}

type Overrides = Readonly<Partial<Record<CopyKey, string>>>;

/**
 * Optional target body mass. An empty target is not an error; a target that IS given is held to
 * the same canonical kg bound as the baseline, so the profile never stores a mass the engine
 * refuses. The goal step's `targetMass` field rule (./fields) is this function.
 */
export function targetMassError(a: SetupAnswers, overrides: Overrides): string | null {
  return a.targetMass.trim() === ''
    ? null
    : massDomainError(copy('quantity.targetBodyMass', overrides), a.targetMass, a.units, overrides);
}

/**
 * Optional target body fat (Brief I Part 2, C1.10.5): empty is not an error, a value is bounded by
 * NUTRITION_DOMAIN. The goal step's `targetBodyFat` field rule (./fields) is this function.
 */
export function targetBodyFatError(a: SetupAnswers, overrides: Overrides): string | null {
  const text = targetBodyFatText(a);
  return text.trim() === ''
    ? null
    : requiredInRange(
        copy('quantity.targetBodyFat', overrides),
        text,
        NUTRITION_DOMAIN.bodyFatPct,
        overrides,
        UNIT.pct,
      );
}

/**
 * The sessions per week the targets read: the typed weekly target when it is a whole number
 * inside NUTRITION_DOMAIN, else the split's own count.
 */
export function sessionsPerWeekForTargets(a: SetupAnswers): number {
  const typed = parseDecimal(a.weeklySessionTarget); // [sessions/week]
  return typed !== null &&
    Number.isInteger(typed) &&
    typed >= NUTRITION_DOMAIN.sessionsPerWeek.lo &&
    typed <= NUTRITION_DOMAIN.sessionsPerWeek.hi
    ? typed
    : a.sessionsPerWeek;
}
