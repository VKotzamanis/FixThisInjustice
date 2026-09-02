import { useMemo, useState, type JSX } from 'react';
import './setup.css';
import { FORMAT, copy } from '../../content/copy';
import { NAVY_SEE_PCT, NAVY_SITE_LABEL, estimateBodyFatNavy } from '../../domain/bodyfat';
import { deviceTimeZone, isValidLocalDate, isValidTimeZone, todayLocal } from '../../domain/dates';
import { newId } from '../../domain/ids';
import { NUTRITION_DOMAIN, computeTargets, dailyBeverageTargetML } from '../../domain/nutrition';
import { EXERCISES } from '../../domain/plan/library';
import {
  PLAN_WEEKS_MAX,
  PLAN_WEEKS_MIN,
  generatePlan,
  volumeReport,
} from '../../domain/plan/generator';
import { SPLIT_TEMPLATES, type SessionsPerWeek } from '../../domain/plan/templates';
import {
  DEFAULT_BARBELL_STEP,
  DEFAULT_DUMBBELL_STEP,
  DEFAULT_STACK_STEP,
  MICRO_PLATE_STEP,
  type ActivityLevel,
  type Availability,
  type AvailabilitySlot,
  type Equipment,
  type Experience,
  type GoalKind,
  type IsoWeekday,
  type Profile,
  type Sex,
  type UnitSystem,
} from '../../domain/types';
import { displayMass, formatVolume } from '../../domain/units';
import {
  UnitInput,
  loadUnit,
  massUnit,
  parseDecimal,
  storedLoadKg,
  storedMassKg,
} from '../components/UnitInput';
import { useAppStore } from '../../store';

/**
 * Setup wizard.
 *
 * Screen order is fixed by one dependency: the unit system is chosen FIRST because every later
 * field is labelled in it (master plan section 3). Everything after that is grouped by what the
 * engines need, not by what is quick to answer.
 *
 * Two rules this file exists to enforce, both structural rather than advisory:
 *
 *   - NO medication, condition, biometric-identifier or location field appears anywhere in it,
 *     and `Profile.supplements` has exactly one member. The only free-text inputs in the whole
 *     wizard are the display name and the IANA time-zone id; every other control is a number, a
 *     date, a time, a select or a toggle, and `SetupWizard.test.tsx` asserts that structurally.
 *
 *   - No value reaches `computeTargets` before the form has checked it against NUTRITION_DOMAIN
 *     (master plan section 6.3). The engine throws a RangeError outside its validated adult
 *     domain; a wizard that let a value through would surface that as a crash rather than as a
 *     message attached to the field that caused it.
 */

/**
 * The steps, in order. Rendering, the step counter and the nav all read this array, so a step
 * is added by inserting one member and one branch, never by renumbering anything.
 *
 * P2 Task 9 inserts its pre-participation readiness step at READINESS_INSERT_INDEX, immediately
 * before 'review': the screen has to be answered before the profile is written, and Review is
 * the screen that writes it.
 */
export const STEPS = [
  'units',
  'timezone',
  'body',
  'training',
  'goal',
  'availability',
  'programme',
  'review',
] as const;

export type StepId = (typeof STEPS)[number];

/** Insertion point for Task 9's readiness step. Review is last, and stays last. */
export const READINESS_INSERT_INDEX = STEPS.length - 1;

const STEP_TITLE: Record<StepId, string> = {
  units: copy('step.units'),
  timezone: copy('step.timezone'),
  body: copy('step.body'),
  training: copy('step.training'),
  goal: copy('step.goal'),
  availability: copy('step.availability'),
  programme: copy('step.programme'),
  review: copy('step.review'),
};

/*
 * Units, not copy: a unit label is part of the contract and never changes with a skin
 * (copy contract, "Numbers, units and quantity names are part of the contract"). The mass and
 * load labels come from UNIT_LABEL through UnitInput; these are the ones UNIT_LABEL does not
 * carry because they are the same in both unit systems.
 */
const UNIT = { years: 'years', weeks: 'weeks', minutes: 'min', cm: 'cm', inch: 'in', pct: '%' };

const CM_PER_INCH = 2.54; // [cm/in] exact by definition
const INCHES_PER_FOOT = 12; // [in/ft]
const SECONDS_PER_MINUTE = 60; // [s/min]
const DEFAULT_SESSION_DURATION_MIN = 60; // [min]
const DEFAULT_START_TIME = '07:30'; // [HH:mm] local
const DEFAULT_WEEKS = 12; // [weeks], inside PLAN_WEEKS_MIN..PLAN_WEEKS_MAX
const DEFAULT_SESSIONS_PER_WEEK: SessionsPerWeek = 4; // [sessions/week]
const DEFAULT_CUP_ML = 250; // [mL] display granularity for the hydration view only
const DEFAULT_DISPLAY_NAME = 'Operator'; // used only when the optional name is left blank

/*
 * Mirrors of two caps in src/domain/schema.ts, which does not export them. They are validated
 * here so a value the schema would reject can never be written: createProfile does not
 * re-validate, so an over-cap step or duration would only fail at the next load.
 *   MAX_STEP_KG  = 100 kg per increment.
 *   MAX_SECONDS  = 86 400 s, which is 1440 min of expected session duration.
 */
const MAX_STEP_KG = 100; // [kg]
const MAX_SESSION_DURATION_MIN = 1440; // [min]

/** Display name of each RMR equation. A proper noun, not skin copy. */
const RMR_EQUATION_NAME: Record<'mifflin-st-jeor' | 'cunningham', string> = {
  'mifflin-st-jeor': 'Mifflin-St Jeor',
  cunningham: 'Cunningham',
};

const WEEKDAYS: { value: IsoWeekday; label: string }[] = [
  { value: 1, label: copy('weekday.monday') },
  { value: 2, label: copy('weekday.tuesday') },
  { value: 3, label: copy('weekday.wednesday') },
  { value: 4, label: copy('weekday.thursday') },
  { value: 5, label: copy('weekday.friday') },
  { value: 6, label: copy('weekday.saturday') },
  { value: 7, label: copy('weekday.sunday') },
];

/**
 * Three bands, not five (master plan section 10.1, decision `activity-levels-three-bands`).
 * Each label names the band FAO/WHO/UNU 2004 Table 5.3 prints; the two midpoint levels the
 * legacy ladder carried had no primary source and do not ship.
 */
const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: copy('option.activitySedentary') },
  { value: 'moderate', label: copy('option.activityModerate') },
  { value: 'vigorous', label: copy('option.activityVigorous') },
];

const EXPERIENCE_OPTIONS: { value: Experience; label: string }[] = [
  { value: 'novice', label: copy('option.experienceNovice') },
  { value: 'intermediate', label: copy('option.experienceIntermediate') },
  { value: 'advanced', label: copy('option.experienceAdvanced') },
];

const EQUIPMENT_OPTIONS: { value: Equipment; label: string }[] = [
  { value: 'full-gym', label: copy('option.equipmentFullGym') },
  { value: 'dumbbells-only', label: copy('option.equipmentDumbbells') },
  { value: 'bodyweight', label: copy('option.equipmentBodyweight') },
];

const GOAL_OPTIONS: { value: GoalKind; label: string }[] = [
  { value: 'fat-loss', label: copy('option.goalFatLoss') },
  { value: 'muscle-gain', label: copy('option.goalMuscleGain') },
  { value: 'recomposition', label: copy('option.goalRecomposition') },
  { value: 'maintenance', label: copy('option.goalMaintenance') },
];

const SESSIONS_PER_WEEK_OPTIONS: readonly SessionsPerWeek[] = [2, 3, 4, 5, 6];

/**
 * Copy contract R5. NAVY_SITE_LABEL (src/domain/bodyfat.ts) joins the site name to the
 * instruction with an em-dash. That module is a committed dependency this task does not own, so
 * the connector is replaced here, at the render boundary, and nowhere else. No word changes:
 * the site descriptions are quoted source material (R10).
 */
function withoutDashConnector(text: string): string {
  return text.replace(/\s+—\s+/g, ': ');
}

interface DaySlot {
  enabled: boolean;
  startTime: string; // [HH:mm] local wall clock
  durationMin: string; // [min], as typed
}

interface Draft {
  units: UnitSystem;
  timezone: string;
  displayName: string;
  sex: Sex;
  birthYear: string; // [year], as typed
  heightCm: string; // [cm], metric entry, as typed
  heightFt: string; // [ft], imperial entry, as typed
  heightIn: string; // [in], imperial entry, as typed
  mass: string; // [kg] or [lb], as typed
  bodyFatMode: 'none' | 'known' | 'tape';
  bodyFatPct: string; // [%], as typed
  neck: string; // [cm], as typed
  waist: string; // [cm], as typed
  hip: string; // [cm], as typed
  activity: ActivityLevel;
  experience: Experience;
  equipment: Equipment;
  barbellStep: string; // [kg] or [lb], as typed
  dumbbellStep: string; // [kg] or [lb] per pair, as typed
  stackStep: string; // [kg] or [lb] per pin, as typed
  hasMicroPlates: boolean;
  microPlateStep: string; // [kg] or [lb] per pair, as typed
  goalKind: GoalKind;
  targetMass: string; // [kg] or [lb], as typed
  targetDate: string; // [YYYY-MM-DD]
  creatine: boolean;
  weighInOptIn: boolean;
  sessionsPerWeek: SessionsPerWeek; // [sessions/week]
  days: Record<IsoWeekday, DaySlot>;
  weeklySessionTarget: string; // [sessions/week], as typed
  weeks: string; // [weeks], as typed
  includeCardio: boolean;
}

function defaultDay(): DaySlot {
  return {
    enabled: false,
    startTime: DEFAULT_START_TIME,
    durationMin: String(DEFAULT_SESSION_DURATION_MIN),
  };
}

function initialDraft(): Draft {
  return {
    units: 'metric',
    timezone: deviceTimeZone(),
    displayName: '',
    sex: 'male',
    birthYear: '',
    heightCm: '',
    heightFt: '',
    heightIn: '',
    mass: '',
    bodyFatMode: 'none',
    bodyFatPct: '',
    neck: '',
    waist: '',
    hip: '',
    activity: 'moderate',
    experience: 'novice',
    equipment: 'full-gym',
    barbellStep: String(DEFAULT_BARBELL_STEP.metric),
    dumbbellStep: String(DEFAULT_DUMBBELL_STEP.metric),
    stackStep: String(DEFAULT_STACK_STEP.metric),
    hasMicroPlates: false,
    microPlateStep: String(MICRO_PLATE_STEP.metric),
    goalKind: 'fat-loss',
    targetMass: '',
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
    weeks: String(DEFAULT_WEEKS),
    includeCardio: false,
  };
}

/* Select values are parsed against their closed option list, never cast (master plan section 3). */
function pick<T extends string>(options: readonly { value: T }[], raw: string, fallback: T): T {
  return options.find((o) => o.value === raw)?.value ?? fallback;
}

function pickSessionsPerWeek(raw: string): SessionsPerWeek {
  const value = Number(raw);
  return (
    SESSIONS_PER_WEEK_OPTIONS.find((n) => n === value) ?? DEFAULT_SESSIONS_PER_WEEK
  );
}

/** Round to 0.1 for a bound shown in a message. Display resolution only, never storage. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

interface Bound {
  lo: number;
  hi: number;
}

/** Required numeric field: empty is an error, and so is a value outside the bound. */
function requiredInRange(
  quantity: string,
  text: string,
  bound: Bound,
  unit?: string,
): string | null {
  const value = parseDecimal(text);
  if (value === null) return copy('error.valueRequired');
  if (value < bound.lo || value > bound.hi) {
    return FORMAT.outOfRange(quantity, bound.lo, bound.hi, unit);
  }
  return null;
}

/** Optional numeric field: empty is acceptable; a value outside the bound is not. */
function optionalInRange(
  quantity: string,
  text: string,
  bound: Bound,
  unit?: string,
): string | null {
  if (text.trim() === '') return null;
  return requiredInRange(quantity, text, bound, unit);
}

/** A load increment: strictly positive, and no larger than the schema's per-step cap. */
function stepError(quantity: string, text: string, units: UnitSystem): string | null {
  const entered = parseDecimal(text);
  if (entered === null) return copy('error.valueRequired');
  if (entered <= 0) return copy('error.positive');
  const kg = storedLoadKg(text, units); // [kg]
  if (kg !== null && kg > MAX_STEP_KG) {
    return FORMAT.atMost(quantity, round1(displayMass(MAX_STEP_KG, units)), loadUnit(units));
  }
  return null;
}

/** A tape girth in cm: strictly positive. The equation's own domain is checked by bodyfat.ts. */
function girthError(text: string): string | null {
  const value = parseDecimal(text);
  if (value === null) return copy('error.valueRequired');
  if (value <= 0) return copy('error.positive');
  return null;
}

export function SetupWizard(): JSX.Element {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [stepIndex, setStepIndex] = useState(0);

  const step: StepId = STEPS[stepIndex] ?? 'units';

  function patch(next: Partial<Draft>): void {
    setDraft((d) => ({ ...d, ...next }));
  }

  function patchDay(weekday: IsoWeekday, next: Partial<DaySlot>): void {
    setDraft((d) => ({ ...d, days: { ...d.days, [weekday]: { ...d.days[weekday], ...next } } }));
  }

  /** Switching unit re-seeds every equipment step in the new unit. */
  function setUnits(units: UnitSystem): void {
    patch({
      units,
      barbellStep: String(DEFAULT_BARBELL_STEP[units]),
      dumbbellStep: String(DEFAULT_DUMBBELL_STEP[units]),
      stackStep: String(DEFAULT_STACK_STEP[units]),
      microPlateStep: String(MICRO_PLATE_STEP[units]),
    });
  }

  // The zone every date on this screen is computed in. An unrecognised entry blocks the time-zone
  // step, so the fallback is only ever used to keep the age readout alive while it is being typed.
  const zone = isValidTimeZone(draft.timezone) ? draft.timezone : deviceTimeZone();
  const today = todayLocal(zone);

  const heightCm = useMemo((): number | null => {
    if (draft.units === 'metric') return parseDecimal(draft.heightCm); // [cm]
    const feet = parseDecimal(draft.heightFt);
    const inches = parseDecimal(draft.heightIn);
    if (feet === null && inches === null) return null;
    return ((feet ?? 0) * INCHES_PER_FOOT + (inches ?? 0)) * CM_PER_INCH; // [cm] exact
  }, [draft.units, draft.heightCm, draft.heightFt, draft.heightIn]);

  const massKg = useMemo(
    () => storedMassKg(draft.mass, draft.units), // [kg] exact
    [draft.mass, draft.units],
  );

  const birthYear = parseDecimal(draft.birthYear); // [year]
  const ageYears = birthYear === null ? null : Number(today.slice(0, 4)) - birthYear; // [years]

  /** The US Navy estimate for the girths entered so far, or null while it is unavailable. */
  const tapeEstimate = useMemo((): number | null => {
    if (draft.bodyFatMode !== 'tape') return null;
    const neckCm = parseDecimal(draft.neck);
    const waistCm = parseDecimal(draft.waist);
    const hipCm = parseDecimal(draft.hip);
    if (heightCm === null || neckCm === null || waistCm === null) return null;
    if (draft.sex === 'female' && hipCm === null) return null;
    return estimateBodyFatNavy({ sex: draft.sex, heightCm, neckCm, waistCm, hipCm }); // [%]
  }, [draft.bodyFatMode, draft.neck, draft.waist, draft.hip, draft.sex, heightCm]);

  /** The body-fat percentage that will be stored, whichever way it was obtained. */
  const bodyFatPct: number | null =
    draft.bodyFatMode === 'known'
      ? parseDecimal(draft.bodyFatPct)
      : draft.bodyFatMode === 'tape'
        ? tapeEstimate
        : null;

  const massBound: Bound = {
    lo: round1(displayMass(NUTRITION_DOMAIN.massKg.lo, draft.units)),
    hi: round1(displayMass(NUTRITION_DOMAIN.massKg.hi, draft.units)),
  };

  const enabledDays = WEEKDAYS.filter((d) => draft.days[d.value].enabled);

  // ---- validation -----------------------------------------------------------------------
  // Every message is rendered beside the control that produced it, and every one names the
  // bound it failed rather than saying that something is wrong.

  const timezoneError = isValidTimeZone(draft.timezone) ? null : copy('advice.timezoneInvalid');

  const birthYearError =
    birthYear === null
      ? copy('error.valueRequired')
      : ageYears === null ||
          ageYears < NUTRITION_DOMAIN.ageYears.lo ||
          ageYears > NUTRITION_DOMAIN.ageYears.hi
        ? FORMAT.outOfRange(
            copy('quantity.age'),
            NUTRITION_DOMAIN.ageYears.lo,
            NUTRITION_DOMAIN.ageYears.hi,
            UNIT.years,
          )
        : null;

  const heightError =
    heightCm === null
      ? copy('error.valueRequired')
      : heightCm < NUTRITION_DOMAIN.heightCm.lo || heightCm > NUTRITION_DOMAIN.heightCm.hi
        ? draft.units === 'metric'
          ? FORMAT.outOfRange(
              copy('quantity.height'),
              NUTRITION_DOMAIN.heightCm.lo,
              NUTRITION_DOMAIN.heightCm.hi,
              UNIT.cm,
            )
          : FORMAT.outOfRange(
              copy('quantity.height'),
              round1(NUTRITION_DOMAIN.heightCm.lo / CM_PER_INCH),
              round1(NUTRITION_DOMAIN.heightCm.hi / CM_PER_INCH),
              UNIT.inch,
            )
        : null;

  const massError = requiredInRange(
    copy('quantity.bodyMass'),
    draft.mass,
    massBound,
    massUnit(draft.units),
  );

  const knownBodyFatError =
    draft.bodyFatMode === 'known'
      ? requiredInRange(
          copy('quantity.bodyFat'),
          draft.bodyFatPct,
          NUTRITION_DOMAIN.bodyFatPct,
          UNIT.pct,
        )
      : null;

  /**
   * A tape estimate outside the engine's body-fat domain blocks the step. It is not clamped and
   * it is not silently dropped: either would put a number in the profile that the user never saw.
   */
  const tapeDomainError =
    draft.bodyFatMode === 'tape' &&
    tapeEstimate !== null &&
    (tapeEstimate < NUTRITION_DOMAIN.bodyFatPct.lo || tapeEstimate > NUTRITION_DOMAIN.bodyFatPct.hi)
      ? FORMAT.outOfRange(
          copy('quantity.bodyFat'),
          NUTRITION_DOMAIN.bodyFatPct.lo,
          NUTRITION_DOMAIN.bodyFatPct.hi,
          UNIT.pct,
        )
      : null;

  const tapeIncomplete =
    draft.bodyFatMode === 'tape' &&
    (girthError(draft.neck) !== null ||
      girthError(draft.waist) !== null ||
      (draft.sex === 'female' && girthError(draft.hip) !== null));

  /** Girths are complete and positive, yet the equation returned no estimate for them. */
  const tapeWithheld = draft.bodyFatMode === 'tape' && !tapeIncomplete && tapeEstimate === null;

  const stepErrors = {
    barbell: stepError(copy('quantity.barbellStep'), draft.barbellStep, draft.units),
    dumbbell: stepError(copy('quantity.dumbbellStep'), draft.dumbbellStep, draft.units),
    stack: stepError(copy('quantity.stackStep'), draft.stackStep, draft.units),
    microPlate: draft.hasMicroPlates
      ? stepError(copy('quantity.microPlateStep'), draft.microPlateStep, draft.units)
      : null,
  };

  const targetMassError = optionalInRange(
    copy('quantity.targetBodyMass'),
    draft.targetMass,
    massBound,
    massUnit(draft.units),
  );

  const targetDateError =
    draft.targetDate === '' || isValidLocalDate(draft.targetDate)
      ? null
      : copy('error.valueRequired');

  const weekdayError = enabledDays.length === 0 ? copy('error.pickOneDay') : null;

  const durationErrors: Record<number, string | null> = {};
  for (const day of enabledDays) {
    durationErrors[day.value] = requiredInRange(
      FORMAT.slotField(day.label, copy('label.duration')),
      draft.days[day.value].durationMin,
      { lo: 1, hi: MAX_SESSION_DURATION_MIN },
      UNIT.minutes,
    );
  }

  const weeklyTargetError =
    enabledDays.length === 0
      ? null
      : requiredInRange(copy('quantity.weeklySessionTarget'), draft.weeklySessionTarget, {
          lo: 1,
          hi: enabledDays.length,
        });

  const weeksError = requiredInRange(
    copy('quantity.programmeWeeks'),
    draft.weeks,
    { lo: PLAN_WEEKS_MIN, hi: PLAN_WEEKS_MAX },
    UNIT.weeks,
  );

  const BLOCKED: Record<StepId, boolean> = {
    units: false,
    timezone: timezoneError !== null,
    body:
      birthYearError !== null ||
      heightError !== null ||
      massError !== null ||
      knownBodyFatError !== null ||
      tapeDomainError !== null ||
      tapeIncomplete ||
      tapeWithheld,
    training: Object.values(stepErrors).some((e) => e !== null),
    goal: targetMassError !== null || targetDateError !== null,
    availability:
      weekdayError !== null ||
      weeklyTargetError !== null ||
      Object.values(durationErrors).some((e) => e !== null),
    programme: weeksError !== null,
    review: false,
  };

  // ---- derived plan and targets ---------------------------------------------------------

  const weeksTyped = parseDecimal(draft.weeks);
  // Clamped for the preview only. The Programme step is blocked while `weeks` is out of range,
  // so the plan that is actually stored always uses the number the user typed.
  const weeks =
    weeksTyped === null
      ? DEFAULT_WEEKS
      : Math.min(PLAN_WEEKS_MAX, Math.max(PLAN_WEEKS_MIN, Math.round(weeksTyped))); // [weeks]

  const plan = useMemo(
    () =>
      generatePlan(
        {
          sessionsPerWeek: draft.sessionsPerWeek,
          weeks,
          goal: draft.goalKind,
          experience: draft.experience,
          equipment: draft.equipment,
          includeCardio: draft.includeCardio,
        },
        EXERCISES,
      ),
    [
      draft.sessionsPerWeek,
      draft.goalKind,
      draft.experience,
      draft.equipment,
      draft.includeCardio,
      weeks,
    ],
  );

  const volume = useMemo(() => volumeReport(plan, EXERCISES), [plan]);

  const weeklyTargetTyped = parseDecimal(draft.weeklySessionTarget); // [sessions/week]
  const sessionsPerWeekForTargets =
    weeklyTargetTyped !== null &&
    Number.isInteger(weeklyTargetTyped) &&
    weeklyTargetTyped >= NUTRITION_DOMAIN.sessionsPerWeek.lo &&
    weeklyTargetTyped <= NUTRITION_DOMAIN.sessionsPerWeek.hi
      ? weeklyTargetTyped
      : draft.sessionsPerWeek;

  /**
   * Null until every input is inside NUTRITION_DOMAIN. The gate is the same one the field
   * messages report, so the engine is never called with a value the form has already refused.
   */
  const targets = useMemo(() => {
    if (massKg === null || heightCm === null || ageYears === null) return null;
    if (birthYearError !== null || heightError !== null || massError !== null) return null;
    if (knownBodyFatError !== null || tapeDomainError !== null) return null;
    return computeTargets({
      sex: draft.sex,
      ageYears, // [years]
      heightCm, // [cm]
      massKg, // [kg]
      bodyFatPct, // [%] or null
      activity: draft.activity,
      goal: draft.goalKind,
      sessionsPerWeek: sessionsPerWeekForTargets, // [sessions/week]
      creatine: draft.creatine,
    });
  }, [
    massKg,
    heightCm,
    ageYears,
    birthYearError,
    heightError,
    massError,
    knownBodyFatError,
    tapeDomainError,
    bodyFatPct,
    draft.sex,
    draft.activity,
    draft.goalKind,
    draft.creatine,
    sessionsPerWeekForTargets,
  ]);

  /** "-0.9 lb/week", or the honest statement that the evidence base gives no rate. */
  function signedRate(): string {
    if (targets === null || targets.expectedRateKgPerWeek === null) {
      return copy('status.rateUnknown');
    }
    return FORMAT.signedRate(
      displayMass(targets.expectedRateKgPerWeek, draft.units),
      massUnit(draft.units),
    );
  }

  // ---- submit ---------------------------------------------------------------------------

  function confirm(): void {
    const barbellKg = storedLoadKg(draft.barbellStep, draft.units); // [kg]
    const dumbbellPairKg = storedLoadKg(draft.dumbbellStep, draft.units); // [kg]
    const stackKg = storedLoadKg(draft.stackStep, draft.units); // [kg]
    const microPlateKg = storedLoadKg(draft.microPlateStep, draft.units); // [kg]
    const targetMassKg = storedMassKg(draft.targetMass, draft.units); // [kg]
    if (
      massKg === null ||
      heightCm === null ||
      birthYear === null ||
      barbellKg === null ||
      dumbbellPairKg === null ||
      stackKg === null ||
      microPlateKg === null
    ) {
      return; // unreachable: every one of these blocks its own step
    }

    const profileId = newId();
    const profile: Profile = {
      id: profileId,
      displayName: draft.displayName.trim() === '' ? DEFAULT_DISPLAY_NAME : draft.displayName.trim(),
      timezone: zone,
      units: draft.units,
      createdAt: Date.now(), // [ms] epoch
      body: {
        sex: draft.sex,
        birthYear, // [year]
        heightCm, // [cm]
        baselineMassKg: massKg, // [kg]
        baselineAt: today,
        baselineBodyFatPct: bodyFatPct, // [%] or null
      },
      activity: draft.activity,
      experience: draft.experience,
      equipment: draft.equipment,
      equipmentSteps: {
        // Entered in the display unit, stored canonically in kg.
        barbellKg,
        dumbbellPairKg,
        stackKg,
        hasMicroPlates: draft.hasMicroPlates,
        microPlateKg,
      },
      goal: {
        kind: draft.goalKind,
        targetMassKg, // [kg] or null
        // No target body-fat percentage is collected: the tape estimate's standard error is
        // larger than any target a user would set against it (src/domain/bodyfat.ts).
        targetBodyFatPct: null,
        targetDate: draft.targetDate === '' ? null : draft.targetDate,
      },
      supplements: { creatine: draft.creatine },
      hydration: {
        // IOM 2005 beverage share for the stated sex; editable afterwards in Settings.
        dailyTargetML: dailyBeverageTargetML(draft.sex), // [mL/day]
        cupSizeML: DEFAULT_CUP_ML, // [mL]
        weighInOptIn: draft.weighInOptIn,
      },
      // The pre-participation screen is P2 Task 9. A profile created before it has run is
      // unscreened, which is what these two values mean; they are never a claim that it passed.
      readiness: { screenedAt: null, flagged: false },
    };

    const slots: AvailabilitySlot[] = enabledDays.map((d) => ({
      weekday: d.value,
      startTime: draft.days[d.value].startTime, // [HH:mm]
      expectedDurationS:
        (parseDecimal(draft.days[d.value].durationMin) ?? DEFAULT_SESSION_DURATION_MIN) *
        SECONDS_PER_MINUTE, // [s]
    }));
    const requested = weeklyTargetTyped ?? slots.length; // [sessions/week]
    const availability: Availability = {
      slots,
      weeklySessionTarget: Math.min(Math.max(1, Math.round(requested)), Math.max(1, slots.length)),
    };

    /*
     * The actions are read at click time rather than selected into the render, for the reason
     * `App.tsx` reads them the same way: `AppActions` declares them as methods, and holding a
     * method reference separated from its object is what @typescript-eslint/unbound-method
     * forbids. Nothing here re-renders on an action changing identity either, so a subscription
     * would buy nothing.
     *
     * Order matters. createProfile must land first: setAvailability and setPlan both throw on a
     * profile id the store does not know.
     */
    const store = useAppStore.getState();
    store.createProfile(profile);
    store.setAvailability(profileId, availability);
    store.setPlan(profileId, plan, today);
  }

  // ---- render ---------------------------------------------------------------------------

  const massLabelUnit = massUnit(draft.units);
  const loadLabelUnit = loadUnit(draft.units);

  return (
    <div className="wiz">
      <h1>{copy('setup.hero')}</h1>
      <p className="wiz-step">{FORMAT.stepOf(stepIndex + 1, STEPS.length, STEP_TITLE[step])}</p>

      {step === 'units' && (
        <fieldset>
          <legend>{STEP_TITLE.units}</legend>
          <p className="wiz-note">{copy('advice.unitsOnce')}</p>
          <label className="wiz-inline">
            <input
              type="radio"
              name="units"
              checked={draft.units === 'metric'}
              onChange={() => {
                setUnits('metric');
              }}
            />
            {copy('label.unitsMetric')}
          </label>
          <label className="wiz-inline">
            <input
              type="radio"
              name="units"
              checked={draft.units === 'imperial'}
              onChange={() => {
                setUnits('imperial');
              }}
            />
            {copy('label.unitsImperial')}
          </label>
        </fieldset>
      )}

      {step === 'timezone' && (
        <fieldset>
          <legend>{STEP_TITLE.timezone}</legend>
          <p className="wiz-note">{copy('advice.timezoneDetected')}</p>
          <div className="wiz-field">
            <label htmlFor="f-timezone">{copy('label.timezone')}</label>
            <input
              id="f-timezone"
              type="text"
              value={draft.timezone}
              aria-invalid={timezoneError !== null}
              aria-describedby={timezoneError === null ? undefined : 'f-timezone-error'}
              onChange={(e) => {
                patch({ timezone: e.target.value });
              }}
            />
            {timezoneError !== null && (
              <p className="wiz-error" id="f-timezone-error">
                {timezoneError}
              </p>
            )}
          </div>
        </fieldset>
      )}

      {step === 'body' && (
        <fieldset>
          <legend>{STEP_TITLE.body}</legend>

          <div className="wiz-field">
            <label htmlFor="f-name">{copy('label.name')}</label>
            <input
              id="f-name"
              type="text"
              value={draft.displayName}
              onChange={(e) => {
                patch({ displayName: e.target.value });
              }}
            />
          </div>

          <p className="wiz-note">{copy('advice.sexUsedFor')}</p>
          <label className="wiz-inline">
            <input
              type="radio"
              name="sex"
              checked={draft.sex === 'male'}
              onChange={() => {
                patch({ sex: 'male' });
              }}
            />
            {copy('label.sexMale')}
          </label>
          <label className="wiz-inline">
            <input
              type="radio"
              name="sex"
              checked={draft.sex === 'female'}
              onChange={() => {
                patch({ sex: 'female' });
              }}
            />
            {copy('label.sexFemale')}
          </label>

          <UnitInput
            id="f-birth-year"
            quantity={copy('label.birthYear')}
            unit={null}
            step="1"
            value={draft.birthYear}
            error={birthYearError}
            onChange={(v) => {
              patch({ birthYear: v });
            }}
          />

          {draft.units === 'metric' ? (
            <UnitInput
              id="f-height-cm"
              quantity={copy('quantity.height')}
              unit={UNIT.cm}
              value={draft.heightCm}
              error={heightError}
              onChange={(v) => {
                patch({ heightCm: v });
              }}
            />
          ) : (
            <>
              <div className="wiz-row">
                <UnitInput
                  id="f-height-ft"
                  quantity={copy('label.feet')}
                  unit={null}
                  value={draft.heightFt}
                  error={null}
                  onChange={(v) => {
                    patch({ heightFt: v });
                  }}
                />
                <UnitInput
                  id="f-height-in"
                  quantity={copy('label.inches')}
                  unit={null}
                  value={draft.heightIn}
                  error={null}
                  onChange={(v) => {
                    patch({ heightIn: v });
                  }}
                />
              </div>
              {heightError !== null && <p className="wiz-error">{heightError}</p>}
            </>
          )}

          <UnitInput
            id="f-mass"
            quantity={copy('quantity.bodyMass')}
            unit={massLabelUnit}
            value={draft.mass}
            error={massError}
            onChange={(v) => {
              patch({ mass: v });
            }}
          />

          <p className="wiz-note">{copy('advice.bodyFatOptional')}</p>
          <details>
            <summary>{copy('disclosure.why')}</summary>
            <p className="wiz-note">{copy('why.bodyFatOptional')}</p>
          </details>

          <label className="wiz-inline">
            <input
              type="radio"
              name="bodyfat"
              checked={draft.bodyFatMode === 'none'}
              onChange={() => {
                patch({ bodyFatMode: 'none' });
              }}
            />
            {copy('label.bodyFatNone')}
          </label>
          <label className="wiz-inline">
            <input
              type="radio"
              name="bodyfat"
              checked={draft.bodyFatMode === 'known'}
              onChange={() => {
                patch({ bodyFatMode: 'known' });
              }}
            />
            {copy('label.bodyFatKnown')}
          </label>
          <label className="wiz-inline">
            <input
              type="radio"
              name="bodyfat"
              checked={draft.bodyFatMode === 'tape'}
              onChange={() => {
                patch({ bodyFatMode: 'tape' });
              }}
            />
            {copy('label.bodyFatTape')}
          </label>

          {draft.bodyFatMode === 'known' && (
            <UnitInput
              id="f-bodyfat"
              quantity={copy('quantity.bodyFat')}
              unit={UNIT.pct}
              value={draft.bodyFatPct}
              error={knownBodyFatError}
              onChange={(v) => {
                patch({ bodyFatPct: v });
              }}
            />
          )}

          {draft.bodyFatMode === 'tape' && (
            <>
              <p className="wiz-note">{copy('advice.tapeMethod')}</p>
              <UnitInput
                id="f-neck"
                quantity={copy('quantity.neck')}
                unit={UNIT.cm}
                value={draft.neck}
                error={girthError(draft.neck)}
                onChange={(v) => {
                  patch({ neck: v });
                }}
              />
              <UnitInput
                id="f-waist"
                quantity={
                  draft.sex === 'male' ? copy('quantity.abdomenII') : copy('quantity.abdomenI')
                }
                unit={UNIT.cm}
                value={draft.waist}
                error={girthError(draft.waist)}
                onChange={(v) => {
                  patch({ waist: v });
                }}
              />
              <p className="wiz-note">{withoutDashConnector(NAVY_SITE_LABEL[draft.sex].waist)}</p>
              {draft.sex === 'female' && (
                <>
                  <UnitInput
                    id="f-hip"
                    quantity={copy('quantity.hip')}
                    unit={UNIT.cm}
                    value={draft.hip}
                    error={girthError(draft.hip)}
                    onChange={(v) => {
                      patch({ hip: v });
                    }}
                  />
                  <p className="wiz-note">
                    {withoutDashConnector(NAVY_SITE_LABEL.female.hip ?? '')}
                  </p>
                </>
              )}
              <p className="wiz-note" data-testid="bodyfat-estimate">
                {tapeIncomplete
                  ? draft.sex === 'female'
                    ? copy('advice.tapeNeedFemale')
                    : copy('advice.tapeNeedMale')
                  : tapeEstimate === null
                    ? copy('advice.tapeOutOfDomain')
                    : FORMAT.bodyFatEstimate(tapeEstimate, NAVY_SEE_PCT[draft.sex])}
              </p>
              {tapeDomainError !== null && <p className="wiz-error">{tapeDomainError}</p>}
              {tapeEstimate !== null && (
                <details>
                  <summary>{copy('disclosure.why')}</summary>
                  <p className="wiz-note" data-testid="bodyfat-why">
                    {copy('why.bodyFatEstimate')}
                  </p>
                </details>
              )}
            </>
          )}
        </fieldset>
      )}

      {step === 'training' && (
        <fieldset>
          <legend>{STEP_TITLE.training}</legend>

          <div className="wiz-field">
            <label htmlFor="f-activity">{copy('label.activity')}</label>
            <select
              id="f-activity"
              value={draft.activity}
              onChange={(e) => {
                patch({ activity: pick(ACTIVITY_OPTIONS, e.target.value, 'moderate') });
              }}
            >
              {ACTIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="wiz-field">
            <label htmlFor="f-experience">{copy('label.experience')}</label>
            <select
              id="f-experience"
              value={draft.experience}
              onChange={(e) => {
                patch({ experience: pick(EXPERIENCE_OPTIONS, e.target.value, 'novice') });
              }}
            >
              {EXPERIENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="wiz-field">
            <label htmlFor="f-equipment">{copy('label.equipment')}</label>
            <select
              id="f-equipment"
              value={draft.equipment}
              onChange={(e) => {
                patch({ equipment: pick(EQUIPMENT_OPTIONS, e.target.value, 'full-gym') });
              }}
            >
              {EQUIPMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <p className="wiz-note">{copy('advice.loadSteps')}</p>
          <UnitInput
            id="f-barbell-step"
            quantity={copy('quantity.barbellStep')}
            unit={loadLabelUnit}
            value={draft.barbellStep}
            error={stepErrors.barbell}
            onChange={(v) => {
              patch({ barbellStep: v });
            }}
          />
          <UnitInput
            id="f-dumbbell-step"
            quantity={copy('quantity.dumbbellStep')}
            unit={loadLabelUnit}
            value={draft.dumbbellStep}
            error={stepErrors.dumbbell}
            onChange={(v) => {
              patch({ dumbbellStep: v });
            }}
          />
          <UnitInput
            id="f-stack-step"
            quantity={copy('quantity.stackStep')}
            unit={loadLabelUnit}
            value={draft.stackStep}
            error={stepErrors.stack}
            onChange={(v) => {
              patch({ stackStep: v });
            }}
          />
          <label className="wiz-inline">
            <input
              type="checkbox"
              checked={draft.hasMicroPlates}
              onChange={(e) => {
                patch({ hasMicroPlates: e.target.checked });
              }}
            />
            {copy('label.microPlates')}
          </label>
          {/* Shown only when the toggle is on, because that is exactly when stepFor() uses it. */}
          {draft.hasMicroPlates && (
            <UnitInput
              id="f-microplate-step"
              quantity={copy('quantity.microPlateStep')}
              unit={loadLabelUnit}
              value={draft.microPlateStep}
              error={stepErrors.microPlate}
              onChange={(v) => {
                patch({ microPlateStep: v });
              }}
            />
          )}
        </fieldset>
      )}

      {step === 'goal' && (
        <fieldset>
          <legend>{STEP_TITLE.goal}</legend>

          <div className="wiz-field">
            <label htmlFor="f-goal">{copy('label.goal')}</label>
            <select
              id="f-goal"
              value={draft.goalKind}
              onChange={(e) => {
                patch({ goalKind: pick(GOAL_OPTIONS, e.target.value, 'fat-loss') });
              }}
            >
              {GOAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <UnitInput
            id="f-target-mass"
            quantity={copy('quantity.targetBodyMass')}
            unit={massLabelUnit}
            value={draft.targetMass}
            error={targetMassError}
            onChange={(v) => {
              patch({ targetMass: v });
            }}
          />

          <div className="wiz-field">
            <label htmlFor="f-target-date">{copy('label.targetDate')}</label>
            <input
              id="f-target-date"
              type="date"
              value={draft.targetDate}
              aria-invalid={targetDateError !== null}
              onChange={(e) => {
                patch({ targetDate: e.target.value });
              }}
            />
            {targetDateError !== null && <p className="wiz-error">{targetDateError}</p>}
          </div>

          <label className="wiz-inline">
            <input
              type="checkbox"
              checked={draft.creatine}
              onChange={(e) => {
                patch({ creatine: e.target.checked });
              }}
            />
            {copy('label.creatine')}
          </label>
          <p className="wiz-note">{copy('advice.creatineOnly')}</p>

          <label className="wiz-inline">
            <input
              type="checkbox"
              checked={draft.weighInOptIn}
              onChange={(e) => {
                patch({ weighInOptIn: e.target.checked });
              }}
            />
            {copy('label.weighIn')}
          </label>
          <p className="wiz-note">{copy('advice.weighIn')}</p>
        </fieldset>
      )}

      {step === 'availability' && (
        <fieldset>
          <legend>{STEP_TITLE.availability}</legend>

          <div className="wiz-field">
            <label htmlFor="f-sessions">{copy('label.sessionsPerWeek')}</label>
            <select
              id="f-sessions"
              value={String(draft.sessionsPerWeek)}
              onChange={(e) => {
                const sessions = pickSessionsPerWeek(e.target.value);
                patch({ sessionsPerWeek: sessions, weeklySessionTarget: String(sessions) });
              }}
            >
              {SESSIONS_PER_WEEK_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <p className="wiz-note">{SPLIT_TEMPLATES[draft.sessionsPerWeek].note}</p>

          {WEEKDAYS.map((d) => (
            <div key={d.value}>
              <label className="wiz-inline">
                <input
                  type="checkbox"
                  checked={draft.days[d.value].enabled}
                  onChange={(e) => {
                    patchDay(d.value, { enabled: e.target.checked });
                  }}
                />
                {d.label}
              </label>
              {draft.days[d.value].enabled && (
                <div className="wiz-row">
                  <div className="wiz-field">
                    <label htmlFor={`f-start-${d.value}`}>
                      {FORMAT.slotField(d.label, copy('label.startTime'))}
                    </label>
                    <input
                      id={`f-start-${d.value}`}
                      type="time"
                      value={draft.days[d.value].startTime}
                      onChange={(e) => {
                        patchDay(d.value, { startTime: e.target.value });
                      }}
                    />
                  </div>
                  <UnitInput
                    id={`f-duration-${d.value}`}
                    quantity={FORMAT.slotField(d.label, copy('label.duration'))}
                    unit={UNIT.minutes}
                    step="1"
                    value={draft.days[d.value].durationMin}
                    error={durationErrors[d.value] ?? null}
                    onChange={(v) => {
                      patchDay(d.value, { durationMin: v });
                    }}
                  />
                </div>
              )}
            </div>
          ))}
          {weekdayError !== null && <p className="wiz-error">{weekdayError}</p>}

          <UnitInput
            id="f-weekly-target"
            quantity={copy('quantity.weeklySessionTarget')}
            unit={null}
            step="1"
            value={draft.weeklySessionTarget}
            error={weeklyTargetError}
            onChange={(v) => {
              patch({ weeklySessionTarget: v });
            }}
          />
        </fieldset>
      )}

      {step === 'programme' && (
        <fieldset>
          <legend>{STEP_TITLE.programme}</legend>
          <UnitInput
            id="f-weeks"
            quantity={copy('quantity.programmeWeeks')}
            unit={UNIT.weeks}
            step="1"
            value={draft.weeks}
            error={weeksError}
            onChange={(v) => {
              patch({ weeks: v });
            }}
          />
          <p className="wiz-note">{copy('advice.deloadEveryFourth')}</p>
          <label className="wiz-inline">
            <input
              type="checkbox"
              checked={draft.includeCardio}
              onChange={(e) => {
                patch({ includeCardio: e.target.checked });
              }}
            />
            {copy('label.includeCardio')}
          </label>
        </fieldset>
      )}

      {step === 'review' && (
        <div data-testid="review">
          <fieldset>
            <legend>{copy('hero.dailyTargets')}</legend>
            {targets === null ? (
              <p className="wiz-error">{copy('error.valueRequired')}</p>
            ) : (
              <>
                <dl>
                  <dt>{copy('label.energy')}</dt>
                  <dd data-testid="target-kcal">{FORMAT.kcal(targets.targetKcal)}</dd>
                  <dt>{copy('label.protein')}</dt>
                  <dd data-testid="target-protein">
                    {FORMAT.gramsRange(targets.proteinG.lo, targets.proteinG.hi)}
                  </dd>
                  <dt>{copy('label.fluid')}</dt>
                  <dd data-testid="target-fluid">{formatVolume(targets.fluidML, draft.units)}</dd>
                  <dt>{copy('label.expectedRate')}</dt>
                  <dd data-testid="target-rate">{signedRate()}</dd>
                  {targets.creatineG !== null && (
                    <>
                      <dt>{copy('label.creatineDose')}</dt>
                      <dd data-testid="target-creatine">{FORMAT.grams(targets.creatineG)}</dd>
                    </>
                  )}
                </dl>
                {/* R9: the derivation is never inline. */}
                <details>
                  <summary>{copy('disclosure.why')}</summary>
                  <div data-testid="targets-basis">
                    <p className="wiz-note">
                      {FORMAT.rmrBasis(
                        RMR_EQUATION_NAME[targets.basis.rmr],
                        targets.basis.activityFactor,
                      )}
                    </p>
                    <p className="wiz-note">{targets.basis.proteinRule}</p>
                    <p className="wiz-note">{targets.basis.deficitRule}</p>
                    <p className="wiz-note">{targets.basis.rateRule}</p>
                  </div>
                </details>
              </>
            )}
          </fieldset>

          <fieldset>
            <legend>{copy('hero.programme')}</legend>
            <p data-testid="split-summary">
              {FORMAT.splitSummary(
                SPLIT_TEMPLATES[draft.sessionsPerWeek].name,
                weeks,
                plan.sessions.length,
              )}{' '}
              {FORMAT.muscleList(copy('label.inTargetRange'), volume.inBand, copy('label.none'))}{' '}
              {FORMAT.muscleList(
                copy('label.maintenanceOnly'),
                volume.maintenance,
                copy('label.none'),
              )}
            </p>
            <p className="wiz-note">{SPLIT_TEMPLATES[draft.sessionsPerWeek].note}</p>
          </fieldset>
        </div>
      )}

      <div className="wiz-nav">
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={() => {
              setStepIndex((n) => n - 1);
            }}
          >
            {copy('button.back')}
          </button>
        )}
        {stepIndex < STEPS.length - 1 && (
          <button
            type="button"
            disabled={BLOCKED[step]}
            onClick={() => {
              if (BLOCKED[step]) return;
              setStepIndex((n) => Math.min(STEPS.length - 1, n + 1));
            }}
          >
            {copy('button.continue')}
          </button>
        )}
        {stepIndex === STEPS.length - 1 && (
          <button type="button" onClick={confirm}>
            {copy('button.confirmStart')}
          </button>
        )}
      </div>
    </div>
  );
}
