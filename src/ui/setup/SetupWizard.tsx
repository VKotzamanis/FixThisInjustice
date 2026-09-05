import { useEffect, useMemo, useRef, useState, type JSX, type Ref } from 'react';
import './setup.css';
import { FORMAT, copy } from '../../content/copy';
import type { CopyKey } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { NAVY_SEE_PCT, NAVY_SITE_LABEL, estimateBodyFatNavy } from '../../domain/bodyfat';
import { deviceTimeZone, isValidLocalDate, isValidTimeZone, todayLocal } from '../../domain/dates';
import { newId } from '../../domain/ids';
import {
  NUTRITION_DOMAIN,
  computeTargets,
  dailyBeverageTargetML,
  isInDomain,
  type NutritionInput,
} from '../../domain/nutrition';
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
  KG_PER_LB,
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
  girthUnit,
  loadUnit,
  massUnit,
  parseDecimal,
  storedGirthCm,
  storedLoadKg,
  storedMassKg,
} from '../components/UnitInput';
import { useAppStore } from '../../store';
import { ReadinessScreen, type ReadinessResult } from './ReadinessScreen';

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
 * P2 Task 9 inserted its pre-participation readiness step at READINESS_INSERT_INDEX, immediately
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
  'readiness',
  'review',
] as const;

export type StepId = (typeof STEPS)[number];

/**
 * Where the readiness step sits. Derived from the array rather than restated as a literal, so
 * inserting a step above it cannot leave the constant pointing at a different screen. Review is
 * last, and stays last: it is the screen that writes the profile.
 */
export const READINESS_INSERT_INDEX = STEPS.indexOf('readiness');

/*
 * The step titles as KEYS, not as resolved strings. A module constant is evaluated once at
 * import, so a baked title would be whatever skin happened to be active then and would never
 * move again; the wizard resolves each one per render through `useCopy()`.
 */
const STEP_TITLE_KEY: Record<StepId, CopyKey> = {
  units: 'step.units',
  timezone: 'step.timezone',
  body: 'step.body',
  training: 'step.training',
  goal: 'step.goal',
  availability: 'step.availability',
  programme: 'step.programme',
  readiness: 'step.readiness',
  review: 'step.review',
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

/*
 * DOM ids for the messages that belong to more than one control, or to a control this file
 * renders itself rather than through UnitInput. Every one of them is referenced from an
 * aria-describedby on the control(s) that produced it while, and only while, it is on screen.
 */
const STEP_HEADING_ID = 'wiz-step-heading';
const TIMEZONE_LIST_ID = 'f-timezone-options';
const HEIGHT_ERROR_ID = 'f-height-error';
const TAPE_ERROR_ID = 'f-tape-error';
const TARGET_DATE_ERROR_ID = 'f-target-date-error';
const WEEKDAY_ERROR_ID = 'f-weekday-error';
const AVAILABILITY_DAYS_ERROR_ID = 'f-availability-days-error';

/** Display name of each RMR equation. A proper noun, not skin copy. */
const RMR_EQUATION_NAME: Record<'mifflin-st-jeor' | 'cunningham', string> = {
  'mifflin-st-jeor': 'Mifflin-St Jeor',
  cunningham: 'Cunningham',
};

const WEEKDAYS: { value: IsoWeekday; labelKey: CopyKey }[] = [
  { value: 1, labelKey: 'weekday.monday' },
  { value: 2, labelKey: 'weekday.tuesday' },
  { value: 3, labelKey: 'weekday.wednesday' },
  { value: 4, labelKey: 'weekday.thursday' },
  { value: 5, labelKey: 'weekday.friday' },
  { value: 6, labelKey: 'weekday.saturday' },
  { value: 7, labelKey: 'weekday.sunday' },
];

/**
 * Three bands, not five (master plan section 10.1, decision `activity-levels-three-bands`).
 * Each label names the band FAO/WHO/UNU 2004 Table 5.3 prints; the two midpoint levels the
 * legacy ladder carried had no primary source and do not ship.
 */
const ACTIVITY_OPTIONS: { value: ActivityLevel; labelKey: CopyKey }[] = [
  { value: 'sedentary', labelKey: 'option.activitySedentary' },
  { value: 'moderate', labelKey: 'option.activityModerate' },
  { value: 'vigorous', labelKey: 'option.activityVigorous' },
];

const EXPERIENCE_OPTIONS: { value: Experience; labelKey: CopyKey }[] = [
  { value: 'novice', labelKey: 'option.experienceNovice' },
  { value: 'intermediate', labelKey: 'option.experienceIntermediate' },
  { value: 'advanced', labelKey: 'option.experienceAdvanced' },
];

const EQUIPMENT_OPTIONS: { value: Equipment; labelKey: CopyKey }[] = [
  { value: 'full-gym', labelKey: 'option.equipmentFullGym' },
  { value: 'dumbbells-only', labelKey: 'option.equipmentDumbbells' },
  { value: 'bodyweight', labelKey: 'option.equipmentBodyweight' },
];

const GOAL_OPTIONS: { value: GoalKind; labelKey: CopyKey }[] = [
  { value: 'fat-loss', labelKey: 'option.goalFatLoss' },
  { value: 'muscle-gain', labelKey: 'option.goalMuscleGain' },
  { value: 'recomposition', labelKey: 'option.goalRecomposition' },
  { value: 'maintenance', labelKey: 'option.goalMaintenance' },
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

/**
 * The step heading, rendered INSIDE the fieldset's legend (HTML allows heading content there).
 * One string serves as the group's name and as the document heading, so neither is a duplicate
 * of the other, and it is the element that takes focus on a step change: tabIndex -1 makes it
 * programmatically focusable without adding it to the tab order, so the next Tab press
 * continues into the step's first control rather than restarting at the top of the document.
 */
function StepHeading(props: {
  title: string;
  headingRef: Ref<HTMLHeadingElement>;
}): JSX.Element {
  return (
    <legend>
      <h2 className="wiz-heading" id={STEP_HEADING_ID} ref={props.headingRef} tabIndex={-1}>
        {props.title}
      </h2>
    </legend>
  );
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
  neck: string; // [cm] or [in], as typed, per Draft.units; converted by storedGirthCm
  waist: string; // [cm] or [in], as typed, per Draft.units; converted by storedGirthCm
  hip: string; // [cm] or [in], as typed, per Draft.units; converted by storedGirthCm
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
  /**
   * The screening result, or null until the readiness step has been completed. Held in the
   * draft rather than written through `recordReadiness`, because that action takes a profile id
   * and no profile exists until Confirm runs.
   */
  readiness: ReadinessResult | null;
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
    readiness: null,
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

/**
 * A bound rounded INWARD to 0.1, for message text.
 *
 * Rounding to nearest prints a bound that is itself refused: the 30 kg floor is 66.1387 lb,
 * which rounds to 66.1 lb, and 66.1 lb converts back to 29.98 kg. Every endpoint this returns
 * converts to a value strictly inside the bound it came from, so a user who types the number
 * the message names is accepted.
 */
function inwardBound(bound: Bound): Bound {
  return { lo: Math.ceil(bound.lo * 10) / 10, hi: Math.floor(bound.hi * 10) / 10 };
}

/**
 * A canonical kg bound expressed in the display unit, for message text only. The conversion is
 * the exact inverse of toStoredMass (1 lb = 0.45359237 kg exactly, master plan section 3), not
 * displayMass, because displayMass rounds to nearest and a message bound must round inward.
 */
function massBoundInDisplayUnit(kgBound: Bound, units: UnitSystem): Bound {
  if (units === 'metric') return inwardBound(kgBound); // [kg]
  return inwardBound({ lo: kgBound.lo / KG_PER_LB, hi: kgBound.hi / KG_PER_LB }); // [lb]
}

/** The stature domain in inches, inward-rounded, for the imperial height message. */
const HEIGHT_BOUND_IN: Bound = inwardBound({
  lo: NUTRITION_DOMAIN.heightCm.lo / CM_PER_INCH, // [in]
  hi: NUTRITION_DOMAIN.heightCm.hi / CM_PER_INCH, // [in]
});

/** The ids of the messages currently on screen, for aria-describedby, or undefined when none is. */
function describedBy(...ids: (string | null)[]): string | undefined {
  const shown = ids.filter((id): id is string => id !== null);
  return shown.length === 0 ? undefined : shown.join(' ');
}

/** Required numeric field: empty is an error, and so is a value outside the bound. */
function requiredInRange(
  quantity: string,
  text: string,
  bound: Bound,
  overrides: Readonly<Partial<Record<CopyKey, string>>>,
  unit?: string,
): string | null {
  const value = parseDecimal(text);
  if (value === null) return copy('error.valueRequired', overrides);
  if (value < bound.lo || value > bound.hi) {
    return FORMAT.outOfRange(quantity, bound.lo, bound.hi, unit);
  }
  return null;
}

/**
 * Required whole-number count. `Math.round` is never applied to a user value: the schema stores
 * `birthYear`, `weeklySessionTarget` and the plan's `weeks` as `z.int()`, so a fraction is
 * refused here, visibly, rather than rounded into the document behind the user's back.
 */
function requiredIntegerInRange(
  quantity: string,
  text: string,
  bound: Bound,
  overrides: Readonly<Partial<Record<CopyKey, string>>>,
  unit?: string,
): string | null {
  const value = parseDecimal(text);
  if (value === null) return copy('error.valueRequired', overrides);
  if (!Number.isInteger(value)) return copy('error.wholeNumber', overrides);
  if (value < bound.lo || value > bound.hi) {
    return FORMAT.outOfRange(quantity, bound.lo, bound.hi, unit);
  }
  return null;
}

/**
 * A body mass entered in the display unit, validated in CANONICAL kg after the exact conversion.
 *
 * This is not the same test as comparing the entered number against a rounded display bound, and
 * the difference is a crash: 66.1 lb clears a 66.1 lb floor, converts to 29.98 kg, and
 * computeTargets throws RangeError on it while Review renders (master plan section 6.3). The
 * rounded bound appears in the message text and nowhere else.
 */
function massDomainError(
  quantity: string,
  text: string,
  units: UnitSystem,
  overrides: Readonly<Partial<Record<CopyKey, string>>>,
): string | null {
  const kg = storedMassKg(text, units); // [kg] exact
  if (kg === null) return copy('error.valueRequired', overrides);
  if (kg < NUTRITION_DOMAIN.massKg.lo || kg > NUTRITION_DOMAIN.massKg.hi) {
    const shown = massBoundInDisplayUnit(NUTRITION_DOMAIN.massKg, units); // [lb] or [kg]
    return FORMAT.outOfRange(quantity, shown.lo, shown.hi, massUnit(units));
  }
  return null;
}

/** A load increment: strictly positive, and no larger than the schema's per-step cap. */
function stepError(
  quantity: string,
  text: string,
  units: UnitSystem,
  overrides: Readonly<Partial<Record<CopyKey, string>>>,
): string | null {
  const entered = parseDecimal(text);
  if (entered === null) return copy('error.valueRequired', overrides);
  if (entered <= 0) return copy('error.positive', overrides);
  const kg = storedLoadKg(text, units); // [kg]
  if (kg !== null && kg > MAX_STEP_KG) {
    return FORMAT.atMost(quantity, round1(displayMass(MAX_STEP_KG, units)), loadUnit(units));
  }
  return null;
}

/** A tape girth in cm: strictly positive. The equation's own domain is checked by bodyfat.ts. */
function girthError(
  text: string,
  overrides: Readonly<Partial<Record<CopyKey, string>>>,
): string | null {
  const value = parseDecimal(text);
  if (value === null) return copy('error.valueRequired', overrides);
  if (value <= 0) return copy('error.positive', overrides);
  return null;
}

export function SetupWizard(): JSX.Element {
  const t = useCopy();
  const overrides = useCopyOverrides();
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [stepIndex, setStepIndex] = useState(0);
  /** Latched by the first successful confirm; the profile is created exactly once. */
  const [submitted, setSubmitted] = useState(false);

  const step: StepId = STEPS[stepIndex] ?? 'units';

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const shownStepIndex = useRef(stepIndex);

  /*
   * Focus follows the step. Without this the focus ring stays on the Continue button that has
   * just been replaced, so a keyboard or screen-reader user is left at the bottom of a screen
   * whose contents changed silently. The first render is skipped: arriving at the wizard should
   * not pull focus away from wherever the user already is.
   */
  useEffect(() => {
    if (shownStepIndex.current === stepIndex) return;
    shownStepIndex.current = stepIndex;
    headingRef.current?.focus();
  }, [stepIndex]);

  /*
   * The IANA zone list the platform knows, for the time-zone field's datalist. Intl.
   * supportedValuesOf is ES2022 and absent on older engines, and a locked-down engine can throw
   * on it, so both are treated as "no list" rather than as a failure: the field stays a plain
   * text entry validated by isValidTimeZone.
   */
  const timeZoneOptions = useMemo((): readonly string[] => {
    if (typeof Intl.supportedValuesOf !== 'function') return [];
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return [];
    }
  }, []);

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
    const neckCm = storedGirthCm(draft.neck, draft.units);
    const waistCm = storedGirthCm(draft.waist, draft.units);
    const hipCm = storedGirthCm(draft.hip, draft.units);
    if (heightCm === null || neckCm === null || waistCm === null) return null;
    if (draft.sex === 'female' && hipCm === null) return null;
    return estimateBodyFatNavy({ sex: draft.sex, heightCm, neckCm, waistCm, hipCm }); // [%]
  }, [draft.bodyFatMode, draft.neck, draft.waist, draft.hip, draft.sex, draft.units, heightCm]);

  /** The body-fat percentage that will be stored, whichever way it was obtained. */
  const bodyFatPct: number | null =
    draft.bodyFatMode === 'known'
      ? parseDecimal(draft.bodyFatPct)
      : draft.bodyFatMode === 'tape'
        ? tapeEstimate
        : null;

  const enabledDays = WEEKDAYS.filter((d) => draft.days[d.value].enabled);

  // ---- validation -----------------------------------------------------------------------
  // Every message is rendered beside the control that produced it, and every one names the
  // bound it failed rather than saying that something is wrong.

  const timezoneError = isValidTimeZone(draft.timezone) ? null : t('advice.timezoneInvalid');

  const birthYearError =
    birthYear === null
      ? t('error.valueRequired')
      : !Number.isInteger(birthYear)
        ? t('error.wholeNumber')
        : ageYears === null ||
            ageYears < NUTRITION_DOMAIN.ageYears.lo ||
            ageYears > NUTRITION_DOMAIN.ageYears.hi
          ? FORMAT.outOfRange(
              t('quantity.age'),
              NUTRITION_DOMAIN.ageYears.lo,
              NUTRITION_DOMAIN.ageYears.hi,
              UNIT.years,
            )
          : null;

  const heightError =
    heightCm === null
      ? t('error.valueRequired')
      : heightCm < NUTRITION_DOMAIN.heightCm.lo || heightCm > NUTRITION_DOMAIN.heightCm.hi
        ? draft.units === 'metric'
          ? FORMAT.outOfRange(
              t('quantity.height'),
              NUTRITION_DOMAIN.heightCm.lo,
              NUTRITION_DOMAIN.heightCm.hi,
              UNIT.cm,
            )
          : FORMAT.outOfRange(
              t('quantity.height'),
              HEIGHT_BOUND_IN.lo,
              HEIGHT_BOUND_IN.hi,
              UNIT.inch,
            )
        : null;

  const massError = massDomainError(
    copy('quantity.bodyMass', overrides),
    draft.mass,
    draft.units,
    overrides,
  );

  const knownBodyFatError =
    draft.bodyFatMode === 'known'
      ? requiredInRange(
          copy('quantity.bodyFat', overrides),
          draft.bodyFatPct,
          NUTRITION_DOMAIN.bodyFatPct,
          overrides,
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
          t('quantity.bodyFat'),
          NUTRITION_DOMAIN.bodyFatPct.lo,
          NUTRITION_DOMAIN.bodyFatPct.hi,
          UNIT.pct,
        )
      : null;

  const tapeIncomplete =
    draft.bodyFatMode === 'tape' &&
    (girthError(draft.neck, overrides) !== null ||
      girthError(draft.waist, overrides) !== null ||
      (draft.sex === 'female' && girthError(draft.hip, overrides) !== null));

  /** Girths are complete and positive, yet the equation returned no estimate for them. */
  const tapeWithheld = draft.bodyFatMode === 'tape' && !tapeIncomplete && tapeEstimate === null;

  const stepErrors = {
    barbell: stepError(
      copy('quantity.barbellStep', overrides),
      draft.barbellStep,
      draft.units,
      overrides,
    ),
    dumbbell: stepError(
      copy('quantity.dumbbellStep', overrides),
      draft.dumbbellStep,
      draft.units,
      overrides,
    ),
    stack: stepError(
      copy('quantity.stackStep', overrides),
      draft.stackStep,
      draft.units,
      overrides,
    ),
    microPlate: draft.hasMicroPlates
      ? stepError(
          copy('quantity.microPlateStep', overrides),
          draft.microPlateStep,
          draft.units,
          overrides,
        )
      : null,
  };

  // Optional: an empty target is not an error. A target that IS given is held to the same
  // canonical kg bound as the baseline, so the profile never stores a mass the engine refuses.
  const targetMassError =
    draft.targetMass.trim() === ''
      ? null
      : massDomainError(
          copy('quantity.targetBodyMass', overrides),
          draft.targetMass,
          draft.units,
          overrides,
        );

  const targetDateError =
    draft.targetDate === '' || isValidLocalDate(draft.targetDate)
      ? null
      : t('error.valueRequired');

  const weekdayError = enabledDays.length === 0 ? t('error.pickOneDay') : null;

  /*
   * The generator builds draft.sessionsPerWeek sessions in every week and the cursor can only
   * place a session on an available weekday, so fewer checked days than sessions silently drops
   * sessions off the calendar. It blocks, and the message names both counts because the fix is a
   * choice between them: check more days, or choose a smaller split.
   */
  const availabilityDaysError =
    enabledDays.length > 0 && enabledDays.length < draft.sessionsPerWeek
      ? FORMAT.daysForSessions(enabledDays.length, draft.sessionsPerWeek)
      : null;

  const durationErrors: Record<number, string | null> = {};
  for (const day of enabledDays) {
    durationErrors[day.value] = requiredInRange(
      FORMAT.slotField(copy(day.labelKey, overrides), copy('label.duration', overrides)),
      draft.days[day.value].durationMin,
      { lo: 1, hi: MAX_SESSION_DURATION_MIN },
      overrides,
      UNIT.minutes,
    );
  }

  const weeklyTargetError =
    enabledDays.length === 0
      ? null
      : requiredIntegerInRange(
          copy('quantity.weeklySessionTarget', overrides),
          draft.weeklySessionTarget,
          { lo: 1, hi: enabledDays.length },
          overrides,
        );

  const weeksError = requiredIntegerInRange(
    copy('quantity.programmeWeeks', overrides),
    draft.weeks,
    { lo: PLAN_WEEKS_MIN, hi: PLAN_WEEKS_MAX },
    overrides,
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
      availabilityDaysError !== null ||
      weeklyTargetError !== null ||
      Object.values(durationErrors).some((e) => e !== null),
    programme: weeksError !== null,
    /*
     * The readiness step has no Continue of its own in this nav: the screen renders one and
     * enables it only once all seven questions carry an answer. This entry is what keeps Confirm
     * disabled if the draft somehow reaches Review unscreened, since `confirmBlocked` is the OR
     * of every step's guard.
     */
    readiness: draft.readiness === null,
    review: false,
  };

  /*
   * Confirm writes every screen's answers at once, so it is gated on every screen's guard rather
   * than on the one the user is looking at. Reaching Review already requires each of them to have
   * passed; this closes the case where a value goes stale behind the user (a unit switch, a
   * weekday unchecked on the way back through) and keeps the store write off the invalid path.
   */
  const confirmBlocked = STEPS.some((s) => BLOCKED[s]);

  // ---- derived plan and targets ---------------------------------------------------------

  const weeksTyped = parseDecimal(draft.weeks);
  /*
   * The preview falls back to the default while the entry is unusable; it is never the typed
   * value adjusted. Rounding or clamping here would show a plan for a length the user did not
   * ask for, and the Programme step blocks on exactly the same conditions, so the plan that is
   * stored is always the number the user typed.
   */
  const weeks =
    weeksTyped !== null &&
    Number.isInteger(weeksTyped) &&
    weeksTyped >= PLAN_WEEKS_MIN &&
    weeksTyped <= PLAN_WEEKS_MAX
      ? weeksTyped // [weeks]
      : DEFAULT_WEEKS; // [weeks]

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
   * Null until every input is inside NUTRITION_DOMAIN.
   *
   * The gate is `isInDomain`, which is the engine's OWN predicate: master plan section 6.3
   * specifies it as exactly the condition `computeTargets` throws on, so no gap can open between
   * what a field message checks and what the engine accepts. Restating the field conditions here
   * would leave that gap, and a gap in render is an uncaught RangeError, not a message. When the
   * predicate is false the review screen says the targets are not estimated.
   */
  const targets = useMemo(() => {
    if (massKg === null || heightCm === null || ageYears === null) return null;
    const input: NutritionInput = {
      sex: draft.sex,
      ageYears, // [years]
      heightCm, // [cm]
      massKg, // [kg]
      bodyFatPct, // [%] of body mass, or null
      activity: draft.activity,
      goal: draft.goalKind,
      sessionsPerWeek: sessionsPerWeekForTargets, // [sessions/week], integer
      creatine: draft.creatine,
    };
    if (!isInDomain(input)) return null;
    return computeTargets(input);
  }, [
    massKg,
    heightCm,
    ageYears,
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
      return t('status.rateUnknown');
    }
    return FORMAT.signedRate(
      displayMass(targets.expectedRateKgPerWeek, draft.units),
      massUnit(draft.units),
    );
  }

  // ---- submit ---------------------------------------------------------------------------

  function confirm(): void {
    // Idempotent by latch, not by the disabled attribute alone: a double tap can deliver two
    // clicks before React has re-rendered the button, and each one would create a new profile.
    if (submitted || confirmBlocked) return;
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
      microPlateKg === null ||
      draft.readiness === null
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
      /*
       * The screening answered on the readiness step, written in the SAME document write as the
       * rest of the profile. `recordReadiness` is not used here and cannot be: it takes a
       * profile id, and a create-then-patch would leave an unscreened profile on disk if the
       * user abandoned Review.
       */
      readiness: draft.readiness,
    };

    const slots: AvailabilitySlot[] = enabledDays.map((d) => ({
      weekday: d.value,
      startTime: draft.days[d.value].startTime, // [HH:mm]
      expectedDurationS:
        (parseDecimal(draft.days[d.value].durationMin) ?? DEFAULT_SESSION_DURATION_MIN) *
        SECONDS_PER_MINUTE, // [s]
    }));
    /*
     * Stored as typed. The availability step refuses a fraction and refuses anything outside
     * 1..slots.length, so there is nothing left here to round or clamp, and rounding a value the
     * user typed is exactly what the schema's z.int() would have hidden.
     */
    const availability: Availability = {
      slots,
      weeklySessionTarget: weeklyTargetTyped ?? slots.length, // [sessions/week], integer
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
    setSubmitted(true);
  }

  // ---- render ---------------------------------------------------------------------------

  const massLabelUnit = massUnit(draft.units);
  const loadLabelUnit = loadUnit(draft.units);

  return (
    <div className="wiz">
      <h1>{t('setup.hero')}</h1>
      {/*
       * The step counter is the live region: it is the one line that changes on every step, so
       * a polite announcement of it names both the position and the screen without the heading
       * having to be re-read.
       */}
      <p className="wiz-step" role="status" aria-live="polite" data-testid="wiz-step-status">
        {FORMAT.stepOf(stepIndex + 1, STEPS.length, t(STEP_TITLE_KEY[step]))}
      </p>

      {step === 'units' && (
        <fieldset>
          <StepHeading title={t(STEP_TITLE_KEY.units)} headingRef={headingRef} />
          <p className="wiz-note">{t('advice.unitsOnce')}</p>
          <label className="wiz-inline">
            <input
              type="radio"
              name="units"
              checked={draft.units === 'metric'}
              onChange={() => {
                setUnits('metric');
              }}
            />
            {t('label.unitsMetric')}
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
            {t('label.unitsImperial')}
          </label>
        </fieldset>
      )}

      {step === 'timezone' && (
        <fieldset>
          <StepHeading title={t(STEP_TITLE_KEY.timezone)} headingRef={headingRef} />
          <p className="wiz-note">{t('advice.timezoneDetected')}</p>
          <div className="wiz-field">
            <label htmlFor="f-timezone">{t('label.timezone')}</label>
            {/*
             * An IANA identifier is case-sensitive and contains no words: autocapitalising,
             * autocorrecting or spell-checking it can only corrupt it.
             */}
            <input
              id="f-timezone"
              type="text"
              value={draft.timezone}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              list={timeZoneOptions.length === 0 ? undefined : TIMEZONE_LIST_ID}
              aria-invalid={timezoneError !== null}
              aria-describedby={timezoneError === null ? undefined : 'f-timezone-error'}
              onChange={(e) => {
                patch({ timezone: e.target.value });
              }}
            />
            {timeZoneOptions.length > 0 && (
              <datalist id={TIMEZONE_LIST_ID}>
                {timeZoneOptions.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            )}
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
          <StepHeading title={t(STEP_TITLE_KEY.body)} headingRef={headingRef} />

          <div className="wiz-field">
            <label htmlFor="f-name">{t('label.name')}</label>
            <input
              id="f-name"
              type="text"
              value={draft.displayName}
              onChange={(e) => {
                patch({ displayName: e.target.value });
              }}
            />
          </div>

          <p className="wiz-note">{t('advice.sexUsedFor')}</p>
          <label className="wiz-inline">
            <input
              type="radio"
              name="sex"
              checked={draft.sex === 'male'}
              onChange={() => {
                patch({ sex: 'male' });
              }}
            />
            {t('label.sexMale')}
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
            {t('label.sexFemale')}
          </label>

          <UnitInput
            id="f-birth-year"
            quantity={t('label.birthYear')}
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
              quantity={t('quantity.height')}
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
                  quantity={t('label.feet')}
                  unit={null}
                  value={draft.heightFt}
                  error={null}
                  sharedErrorId={heightError === null ? null : HEIGHT_ERROR_ID}
                  onChange={(v) => {
                    patch({ heightFt: v });
                  }}
                />
                <UnitInput
                  id="f-height-in"
                  quantity={t('label.inches')}
                  unit={null}
                  value={draft.heightIn}
                  error={null}
                  sharedErrorId={heightError === null ? null : HEIGHT_ERROR_ID}
                  onChange={(v) => {
                    patch({ heightIn: v });
                  }}
                />
              </div>
              {/* One stature, two fields: the message is rendered once and described by both. */}
              {heightError !== null && (
                <p className="wiz-error" id={HEIGHT_ERROR_ID}>
                  {heightError}
                </p>
              )}
            </>
          )}

          <UnitInput
            id="f-mass"
            quantity={t('quantity.bodyMass')}
            unit={massLabelUnit}
            value={draft.mass}
            error={massError}
            onChange={(v) => {
              patch({ mass: v });
            }}
          />

          <p className="wiz-note">{t('advice.bodyFatOptional')}</p>
          <details>
            <summary>{t('disclosure.why')}</summary>
            <p className="wiz-note">{t('why.bodyFatOptional')}</p>
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
            {t('label.bodyFatNone')}
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
            {t('label.bodyFatKnown')}
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
            {t('label.bodyFatTape')}
          </label>

          {draft.bodyFatMode === 'known' && (
            <UnitInput
              id="f-bodyfat"
              quantity={t('quantity.bodyFat')}
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
              <p className="wiz-note">{t('advice.tapeMethod')}</p>
              <UnitInput
                id="f-neck"
                quantity={t('quantity.neck')}
                unit={girthUnit(draft.units)}
                value={draft.neck}
                error={girthError(draft.neck, overrides)}
                sharedErrorId={tapeDomainError === null ? null : TAPE_ERROR_ID}
                onChange={(v) => {
                  patch({ neck: v });
                }}
              />
              <UnitInput
                id="f-waist"
                quantity={
                  draft.sex === 'male' ? t('quantity.abdomenII') : t('quantity.abdomenI')
                }
                unit={girthUnit(draft.units)}
                value={draft.waist}
                error={girthError(draft.waist, overrides)}
                sharedErrorId={tapeDomainError === null ? null : TAPE_ERROR_ID}
                onChange={(v) => {
                  patch({ waist: v });
                }}
              />
              <p className="wiz-note">{withoutDashConnector(NAVY_SITE_LABEL[draft.sex].waist)}</p>
              {draft.sex === 'female' && (
                <>
                  <UnitInput
                    id="f-hip"
                    quantity={t('quantity.hip')}
                    unit={girthUnit(draft.units)}
                    value={draft.hip}
                    error={girthError(draft.hip, overrides)}
                    sharedErrorId={tapeDomainError === null ? null : TAPE_ERROR_ID}
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
                    ? t('advice.tapeNeedFemale')
                    : t('advice.tapeNeedMale')
                  : tapeEstimate === null
                    ? t('advice.tapeOutOfDomain')
                    : FORMAT.bodyFatEstimate(tapeEstimate, NAVY_SEE_PCT[draft.sex])}
              </p>
              {/* One estimate, three girths: described by each of the fields that produced it. */}
              {tapeDomainError !== null && (
                <p className="wiz-error" id={TAPE_ERROR_ID}>
                  {tapeDomainError}
                </p>
              )}
              {tapeEstimate !== null && (
                <details>
                  <summary>{t('disclosure.why')}</summary>
                  <p className="wiz-note" data-testid="bodyfat-why">
                    {t('why.bodyFatEstimate')}
                  </p>
                </details>
              )}
            </>
          )}
        </fieldset>
      )}

      {step === 'training' && (
        <fieldset>
          <StepHeading title={t(STEP_TITLE_KEY.training)} headingRef={headingRef} />

          <div className="wiz-field">
            <label htmlFor="f-activity">{t('label.activity')}</label>
            <select
              id="f-activity"
              value={draft.activity}
              onChange={(e) => {
                patch({ activity: pick(ACTIVITY_OPTIONS, e.target.value, 'moderate') });
              }}
            >
              {ACTIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div className="wiz-field">
            <label htmlFor="f-experience">{t('label.experience')}</label>
            <select
              id="f-experience"
              value={draft.experience}
              onChange={(e) => {
                patch({ experience: pick(EXPERIENCE_OPTIONS, e.target.value, 'novice') });
              }}
            >
              {EXPERIENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div className="wiz-field">
            <label htmlFor="f-equipment">{t('label.equipment')}</label>
            <select
              id="f-equipment"
              value={draft.equipment}
              onChange={(e) => {
                patch({ equipment: pick(EQUIPMENT_OPTIONS, e.target.value, 'full-gym') });
              }}
            >
              {EQUIPMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <p className="wiz-note">{t('advice.loadSteps')}</p>
          <UnitInput
            id="f-barbell-step"
            quantity={t('quantity.barbellStep')}
            unit={loadLabelUnit}
            value={draft.barbellStep}
            error={stepErrors.barbell}
            onChange={(v) => {
              patch({ barbellStep: v });
            }}
          />
          <UnitInput
            id="f-dumbbell-step"
            quantity={t('quantity.dumbbellStep')}
            unit={loadLabelUnit}
            value={draft.dumbbellStep}
            error={stepErrors.dumbbell}
            onChange={(v) => {
              patch({ dumbbellStep: v });
            }}
          />
          <UnitInput
            id="f-stack-step"
            quantity={t('quantity.stackStep')}
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
            {t('label.microPlates')}
          </label>
          {/* Shown only when the toggle is on, because that is exactly when stepFor() uses it. */}
          {draft.hasMicroPlates && (
            <UnitInput
              id="f-microplate-step"
              quantity={t('quantity.microPlateStep')}
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
          <StepHeading title={t(STEP_TITLE_KEY.goal)} headingRef={headingRef} />

          <div className="wiz-field">
            <label htmlFor="f-goal">{t('label.goal')}</label>
            <select
              id="f-goal"
              value={draft.goalKind}
              onChange={(e) => {
                patch({ goalKind: pick(GOAL_OPTIONS, e.target.value, 'fat-loss') });
              }}
            >
              {GOAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <UnitInput
            id="f-target-mass"
            quantity={t('quantity.targetBodyMass')}
            unit={massLabelUnit}
            value={draft.targetMass}
            error={targetMassError}
            onChange={(v) => {
              patch({ targetMass: v });
            }}
          />

          <div className="wiz-field">
            <label htmlFor="f-target-date">{t('label.targetDate')}</label>
            <input
              id="f-target-date"
              type="date"
              value={draft.targetDate}
              aria-invalid={targetDateError !== null}
              aria-describedby={targetDateError === null ? undefined : TARGET_DATE_ERROR_ID}
              onChange={(e) => {
                patch({ targetDate: e.target.value });
              }}
            />
            {targetDateError !== null && (
              <p className="wiz-error" id={TARGET_DATE_ERROR_ID}>
                {targetDateError}
              </p>
            )}
          </div>

          <label className="wiz-inline">
            <input
              type="checkbox"
              checked={draft.creatine}
              onChange={(e) => {
                patch({ creatine: e.target.checked });
              }}
            />
            {t('label.creatine')}
          </label>
          <p className="wiz-note">{t('advice.creatineOnly')}</p>

          <label className="wiz-inline">
            <input
              type="checkbox"
              checked={draft.weighInOptIn}
              onChange={(e) => {
                patch({ weighInOptIn: e.target.checked });
              }}
            />
            {t('label.weighIn')}
          </label>
          <p className="wiz-note">{t('advice.weighIn')}</p>
        </fieldset>
      )}

      {step === 'availability' && (
        <fieldset>
          <StepHeading title={t(STEP_TITLE_KEY.availability)} headingRef={headingRef} />

          <div className="wiz-field">
            <label htmlFor="f-sessions">{t('label.sessionsPerWeek')}</label>
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
                  aria-invalid={weekdayError !== null || availabilityDaysError !== null}
                  aria-describedby={describedBy(
                    weekdayError === null ? null : WEEKDAY_ERROR_ID,
                    availabilityDaysError === null ? null : AVAILABILITY_DAYS_ERROR_ID,
                  )}
                  onChange={(e) => {
                    patchDay(d.value, { enabled: e.target.checked });
                  }}
                />
                {t(d.labelKey)}
              </label>
              {draft.days[d.value].enabled && (
                <div className="wiz-row">
                  <div className="wiz-field">
                    <label htmlFor={`f-start-${d.value}`}>
                      {FORMAT.slotField(t(d.labelKey), t('label.startTime'))}
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
                    quantity={FORMAT.slotField(t(d.labelKey), t('label.duration'))}
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
          {/*
           * Both messages are about the SET of checked days, so every weekday control describes
           * them: there is no single control that owns the fault.
           */}
          {weekdayError !== null && (
            <p className="wiz-error" id={WEEKDAY_ERROR_ID}>
              {weekdayError}
            </p>
          )}
          {availabilityDaysError !== null && (
            <p className="wiz-error" id={AVAILABILITY_DAYS_ERROR_ID}>
              {availabilityDaysError}
            </p>
          )}

          <UnitInput
            id="f-weekly-target"
            quantity={t('quantity.weeklySessionTarget')}
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
          <StepHeading title={t(STEP_TITLE_KEY.programme)} headingRef={headingRef} />
          <UnitInput
            id="f-weeks"
            quantity={t('quantity.programmeWeeks')}
            unit={UNIT.weeks}
            step="1"
            value={draft.weeks}
            error={weeksError}
            onChange={(v) => {
              patch({ weeks: v });
            }}
          />
          <p className="wiz-note">{t('advice.deloadEveryFourth')}</p>
          <label className="wiz-inline">
            <input
              type="checkbox"
              checked={draft.includeCardio}
              onChange={(e) => {
                patch({ includeCardio: e.target.checked });
              }}
            />
            {t('label.includeCardio')}
          </label>
        </fieldset>
      )}

      {step === 'readiness' && (
        <div>
          {/* The screen renders its own fieldsets, so this step's heading stands above them.
              It is also the element that takes focus on a step change, as on every other step. */}
          <h2
            className="wiz-heading wiz-heading-alone"
            id={STEP_HEADING_ID}
            ref={headingRef}
            tabIndex={-1}
          >
            {t(STEP_TITLE_KEY.readiness)}
          </h2>
          <ReadinessScreen
            timezone={zone}
            onComplete={(readiness) => {
              patch({ readiness });
              setStepIndex((n) => Math.min(STEPS.length - 1, n + 1));
            }}
          />
        </div>
      )}

      {step === 'review' && (
        <div data-testid="review">
          {/* Review carries fieldsets of its own, so its heading stands above them. */}
          <h2
            className="wiz-heading wiz-heading-alone"
            id={STEP_HEADING_ID}
            ref={headingRef}
            tabIndex={-1}
          >
            {t(STEP_TITLE_KEY.review)}
          </h2>
          <fieldset>
            <legend>{t('hero.dailyTargets')}</legend>
            {targets === null ? (
              <p className="wiz-error" data-testid="targets-unavailable">
                {t('status.targetsNotEstimated')}
              </p>
            ) : (
              <>
                <dl>
                  <dt>{t('label.energy')}</dt>
                  <dd data-testid="target-kcal">{FORMAT.kcal(targets.targetKcal)}</dd>
                  <dt>{t('label.protein')}</dt>
                  <dd data-testid="target-protein">
                    {FORMAT.gramsRange(targets.proteinG.lo, targets.proteinG.hi)}
                  </dd>
                  <dt>{t('label.fluid')}</dt>
                  <dd data-testid="target-fluid">{formatVolume(targets.fluidML, draft.units)}</dd>
                  <dt>{t('label.expectedRate')}</dt>
                  <dd data-testid="target-rate">{signedRate()}</dd>
                  {targets.creatineG !== null && (
                    <>
                      <dt>{t('label.creatineDose')}</dt>
                      <dd data-testid="target-creatine">{FORMAT.grams(targets.creatineG)}</dd>
                    </>
                  )}
                </dl>
                {/* R9: the derivation is never inline. */}
                <details>
                  <summary>{t('disclosure.why')}</summary>
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
            <legend>{t('hero.programme')}</legend>
            <p data-testid="split-summary">
              {FORMAT.splitSummary(
                SPLIT_TEMPLATES[draft.sessionsPerWeek].name,
                weeks,
                plan.sessions.length,
              )}{' '}
              {FORMAT.muscleList(t('label.inTargetRange'), volume.inBand, t('label.none'))}{' '}
              {FORMAT.muscleList(
                t('label.maintenanceOnly'),
                volume.maintenance,
                t('label.none'),
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
            {t('button.back')}
          </button>
        )}
        {/* The readiness step supplies its own Continue, which stays disabled until all seven
            questions are answered, so the generic one must not also render there. */}
        {step !== 'readiness' && stepIndex < STEPS.length - 1 && (
          <button
            type="button"
            disabled={BLOCKED[step]}
            onClick={() => {
              if (BLOCKED[step]) return;
              setStepIndex((n) => Math.min(STEPS.length - 1, n + 1));
            }}
          >
            {t('button.continue')}
          </button>
        )}
        {stepIndex === STEPS.length - 1 && (
          <button type="button" disabled={confirmBlocked || submitted} onClick={confirm}>
            {t('button.confirmStart')}
          </button>
        )}
      </div>
    </div>
  );
}
