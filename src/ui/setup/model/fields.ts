// src/ui/setup/model/fields.ts
//
// One field table per setup step (audit A09/A16). Each row says when its field is SHOWN and what
// its error is. `stepFields` reads the first column, `validateStep` both, and the step components
// render each field's message from `validateStep`, so the Next gate and the visible message are
// one computation and can no longer disagree (A09: a hidden field blocked Next with nothing on
// screen to fix). The rules themselves are the wizard's, moved verbatim out of SetupWizard.tsx;
// layer choice is explained in ./answers.ts.
import { FORMAT, copy, type CopyKey } from '../../../content/copy';
import { isValidLocalDate, isValidLocalTime, isValidTimeZone } from '../../../domain/dates';
import { NUTRITION_DOMAIN } from '../../../domain/nutrition';
import { MAX_MASS_KG, PROFILE_DISPLAY_NAME_MAX_CHARS } from '../../../domain/schema';
import type { IsoWeekday, SetupAnswers, UnitSystem } from '../../../domain/types';
import { displayMass } from '../../../domain/units';
import { loadUnit, massUnit, parseDecimal, storedLoadKg } from '../../components/UnitInput';
import {
  UNIT,
  ageYearsError,
  heightCmError,
  massBoundInDisplayUnit,
  massDomainError,
  requiredInRange,
  requiredIntegerInRange,
  round1,
} from '../fieldRules';
import {
  MAX_SESSION_DURATION_MIN,
  MAX_STEP_KG,
  WEEKDAYS,
  deriveAnswers,
  showsGymCommute,
  showsLoadSteps,
  targetBodyFatError,
  targetMassError,
  type DerivedAnswers,
  type StepId,
} from './answers';

type Overrides = Readonly<Partial<Record<CopyKey, string>>>;

/** Every validated field. `start-N`/`duration-N` are weekday N's slot (ISO 1 = Monday). */
export type FieldId =
  | 'timezone'
  | 'name'
  | 'age'
  | 'height'
  | 'mass'
  | 'bodyFatMode'
  | 'bodyFat'
  | 'neck'
  | 'waist'
  | 'hip'
  | 'tapeDomain'
  | 'tapeWithheld'
  | 'walkMinutes'
  | 'dumbbellStep'
  | 'barbellStep'
  | 'weekdays'
  | 'availabilityDays'
  | `start-${IsoWeekday}`
  | `duration-${IsoWeekday}`
  | 'weeklyTarget'
  | 'targetBodyFat'
  | 'targetMass'
  | 'targetDate';

interface FieldRule {
  id: FieldId;
  /** The same predicate the step component renders the field under. */
  shown(a: SetupAnswers, d: DerivedAnswers): boolean;
  error(a: SetupAnswers, d: DerivedAnswers, o: Overrides): string | null;
  /** The DOM id a failed Next focuses (body step, r2.16); absent where no control owns the fault. */
  focusId?(a: SetupAnswers): string;
}

const always = (): boolean => true;

/** A load increment: strictly positive, and no larger than the schema's per-step cap. */
export function stepError(quantity: string, text: string, units: UnitSystem, overrides: Overrides): string | null {
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
export function girthError(text: string, overrides: Overrides): string | null {
  const value = parseDecimal(text);
  if (value === null) return copy('error.valueRequired', overrides);
  if (value <= 0) return copy('error.positive', overrides);
  return null;
}

const tapeOpen = (a: SetupAnswers, d: DerivedAnswers): boolean =>
  a.bodyFatMode === 'tape' && d.statedSex !== null;

/** True when a shown girth is missing or non-positive (the estimate note asks for them). */
function tapeIncomplete(a: SetupAnswers, d: DerivedAnswers): boolean {
  return (
    tapeOpen(a, d) &&
    (girthError(a.neck, {}) !== null ||
      girthError(a.waist, {}) !== null ||
      (d.statedSex === 'female' && girthError(a.hip, {}) !== null))
  );
}

const BODY: readonly FieldRule[] = [
  {
    // Spec R5 / audit A01-A08: the loader refuses a longer name, so the field refuses it by the
    // same number. maxLength stops typing; this catches a restored draft. Not a focus target.
    id: 'name',
    shown: always,
    error: (a, _d, o) =>
      a.displayName.trim().length > PROFILE_DISPLAY_NAME_MAX_CHARS
        ? FORMAT.withSlots('error.nameTooLong', { max: PROFILE_DISPLAY_NAME_MAX_CHARS }, o)
        : null,
  },
  { id: 'age', shown: always, error: (_a, d, o) => ageYearsError(d.ageYears, o), focusId: () => 'f-age' },
  {
    id: 'height',
    shown: always,
    error: (a, d, o) => heightCmError(d.heightCm, a.units, o),
    focusId: (a) => (a.units === 'metric' ? 'f-height-m' : 'f-height-ft'),
  },
  {
    id: 'mass',
    shown: always,
    error: (a, _d, o) => massDomainError(copy('quantity.bodyMass', o), a.mass, a.units, o),
    focusId: () => 'f-mass',
  },
  {
    /*
     * Decision A1: a mode that cannot produce a percentage while one is required. No click can
     * reach it (the controls refuse), but a restored draft can arrive holding `none` or `tape`
     * under `nd`, and it must block rather than confirm a profile the engine cannot compute for.
     * The message is the reason line the step already shows under `nd`.
     */
    id: 'bodyFatMode',
    shown: always,
    error: (a, d, o) =>
      d.bodyFatRequired && a.bodyFatMode !== 'known' ? copy('advice.tapeNeedsSex', o) : null,
  },
  {
    /*
     * Body fat stays optional in `known` mode (B31) unless no sex is stated (A1), where it is
     * required: Cunningham, the only sex-free equation, reads fat-free mass.
     */
    id: 'bodyFat',
    shown: (a) => a.bodyFatMode === 'known',
    error: (a, d, o) =>
      a.bodyFatPct.trim() === ''
        ? d.bodyFatRequired
          ? copy('error.valueRequired', o)
          : null
        : requiredInRange(copy('quantity.bodyFat', o), a.bodyFatPct, NUTRITION_DOMAIN.bodyFatPct, o, UNIT.pct),
    focusId: () => 'f-bodyfat',
  },
  { id: 'neck', shown: tapeOpen, error: (a, _d, o) => girthError(a.neck, o), focusId: () => 'f-neck' },
  { id: 'waist', shown: tapeOpen, error: (a, _d, o) => girthError(a.waist, o), focusId: () => 'f-waist' },
  {
    id: 'hip',
    shown: (a, d) => tapeOpen(a, d) && d.statedSex === 'female',
    error: (a, _d, o) => girthError(a.hip, o),
    focusId: () => 'f-hip',
  },
  {
    // An estimate outside the engine's domain blocks; it is never clamped or dropped. A property
    // of the three girths together, so the neck field (the first of them) takes focus.
    id: 'tapeDomain',
    shown: tapeOpen,
    error: (_a, d, o) =>
      d.tapeEstimate !== null &&
      (d.tapeEstimate < NUTRITION_DOMAIN.bodyFatPct.lo || d.tapeEstimate > NUTRITION_DOMAIN.bodyFatPct.hi)
        ? FORMAT.outOfRange(
            copy('quantity.bodyFat', o),
            NUTRITION_DOMAIN.bodyFatPct.lo,
            NUTRITION_DOMAIN.bodyFatPct.hi,
            UNIT.pct,
          )
        : null,
    focusId: () => 'f-neck',
  },
  {
    // Girths complete and positive, yet the equation returned no estimate. The message is the
    // line the estimate note shows in that state.
    id: 'tapeWithheld',
    shown: tapeOpen,
    error: (a, d, o) =>
      !tapeIncomplete(a, d) && d.tapeEstimate === null ? copy('advice.tapeOutOfDomain', o) : null,
    focusId: () => 'f-neck',
  },
];

const TRAINING: readonly FieldRule[] = [
  {
    // Brief F Part 3: required only while on screen (full gym or full and home, answered Yes).
    // A sanity bound mirroring MAX_WALK_MINUTES in src/domain/schema.ts.
    id: 'walkMinutes',
    shown: (a) => showsGymCommute(a.equipment) && a.walksToGym,
    error: (a, _d, o) =>
      requiredInRange(
        copy('quantity.walkMinutes', o),
        a.walkMinutes,
        { lo: 1, hi: MAX_SESSION_DURATION_MIN },
        o,
        UNIT.minutes,
      ),
  },
  /*
   * A09: the load steps guard only while shown (hidden on Body weight only). No `stack` row
   * (round 3 Task 8): the field is gone from the screen and its default cannot become invalid.
   */
  {
    id: 'dumbbellStep',
    shown: (a) => showsLoadSteps(a.equipment),
    error: (a, _d, o) => stepError(copy('quantity.dumbbellStep', o), a.dumbbellStep, a.units, o),
  },
  {
    id: 'barbellStep',
    shown: (a) => showsLoadSteps(a.equipment),
    error: (a, _d, o) => stepError(copy('quantity.barbellStep', o), a.barbellStep, a.units, o),
  },
];

/** Weekday N's start time and duration rows, shown while N is ticked. */
const SLOT_RULES: readonly FieldRule[] = WEEKDAYS.flatMap((day): FieldRule[] => [
  {
    // Audit A01 path 1: a cleared time picker stores '', which LocalTimeSchema refuses.
    id: `start-${day.value}`,
    shown: (a) => a.days[day.value].enabled,
    error: (a, _d, o) => (isValidLocalTime(a.days[day.value].startTime) ? null : copy('error.startTimeRequired', o)),
  },
  {
    id: `duration-${day.value}`,
    shown: (a) => a.days[day.value].enabled,
    error: (a, _d, o) =>
      requiredInRange(
        FORMAT.slotField(copy(day.labelKey, o), copy('label.duration', o)),
        a.days[day.value].durationMin,
        { lo: 1, hi: MAX_SESSION_DURATION_MIN },
        o,
        UNIT.minutes,
      ),
  },
]);

const GOAL: readonly FieldRule[] = [
  {
    id: 'weekdays',
    shown: always,
    error: (_a, d, o) => (d.enabledDays.length === 0 ? copy('error.pickOneDay', o) : null),
  },
  ...SLOT_RULES,
  {
    // Fewer checked days than sessions silently drops sessions off the calendar, so it blocks and
    // names both counts (the fix is a choice between them).
    id: 'availabilityDays',
    shown: always,
    error: (a, d) =>
      d.enabledDays.length > 0 && d.enabledDays.length < a.sessionsPerWeek
        ? FORMAT.daysForSessions(d.enabledDays.length, a.sessionsPerWeek)
        : null,
  },
  {
    id: 'weeklyTarget',
    shown: always,
    error: (a, d, o) =>
      d.enabledDays.length === 0
        ? null
        : requiredIntegerInRange(
            copy('quantity.weeklySessionTarget', o),
            a.weeklySessionTarget,
            { lo: 1, hi: d.enabledDays.length },
            o,
          ),
  },
  // Brief I Part 2: one target on screen, never both, and only that one can block.
  {
    id: 'targetBodyFat',
    shown: (_a, d) => d.bodyFatTargetAvailable,
    // Audit A01 path 3: the mass this target implies at held lean mass is what the profile
    // stores, so it is held to the loader's own cap (MAX_MASS_KG), stated in the display unit.
    error: (a, d, o) =>
      targetBodyFatError(a, o) ??
      (d.impliedTargetMassKg !== null && d.impliedTargetMassKg > MAX_MASS_KG
        ? FORMAT.atMost(
            copy('quantity.targetBodyMass', o),
            massBoundInDisplayUnit({ lo: 0, hi: MAX_MASS_KG }, a.units).hi, // [kg] or [lb]
            massUnit(a.units),
          )
        : null),
  },
  { id: 'targetMass', shown: (_a, d) => !d.bodyFatTargetAvailable, error: (a, _d, o) => targetMassError(a, o) },
  {
    id: 'targetDate',
    shown: always,
    error: (a, _d, o) =>
      a.targetDate === '' || isValidLocalDate(a.targetDate) ? null : copy('error.valueRequired', o),
  },
];

const FIELD_TABLE: Readonly<Record<StepId, readonly FieldRule[]>> = {
  units: [],
  timezone: [
    {
      id: 'timezone',
      shown: always,
      error: (a, _d, o) => (isValidTimeZone(a.timezone) ? null : copy('advice.timezoneInvalid', o)),
    },
  ],
  body: BODY,
  training: TRAINING,
  goal: GOAL,
  guidance: [],
  // Review's "Looks Good" is a gesture, not an answer: the shell gates it (Brief M, r2.19).
  review: [],
};

/** The fields `step` shows for these answers, in render order. */
export function stepFields(step: StepId, a: SetupAnswers): FieldId[] {
  const d = deriveAnswers(a);
  return FIELD_TABLE[step].filter((rule) => rule.shown(a, d)).map((rule) => rule.id);
}

export interface StepValidation {
  /** The message for each SHOWN field that fails; a hidden or valid field has no entry. */
  errors: Partial<Record<FieldId, string>>;
  /** True when any shown field fails: the step's Next gate. */
  blocked: boolean;
  /** DOM ids of the failing controls in render order, deduplicated (the failed-Next focus list). */
  invalidFocusIds: string[];
}

/** Validates the fields `step` shows, and only those (A09). Pure. */
export function validateStep(step: StepId, a: SetupAnswers, overrides: Overrides): StepValidation {
  const d = deriveAnswers(a);
  const errors: Partial<Record<FieldId, string>> = {};
  const invalidFocusIds: string[] = [];
  for (const rule of FIELD_TABLE[step]) {
    if (!rule.shown(a, d)) continue;
    const message = rule.error(a, d, overrides);
    if (message === null) continue;
    errors[rule.id] = message;
    const focus = rule.focusId?.(a);
    if (focus !== undefined && !invalidFocusIds.includes(focus)) invalidFocusIds.push(focus);
  }
  return { errors, blocked: Object.keys(errors).length > 0, invalidFocusIds };
}

/** The message for `id`, or null. A convenience for the step components. */
export function errorOf(v: StepValidation, id: FieldId): string | null {
  return v.errors[id] ?? null;
}
