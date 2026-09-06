import { useEffect, useId, useMemo, useRef, useState, type JSX, type Ref } from 'react';
import './setup.css';
import { FORMAT, copy } from '../../content/copy';
import type { CopyKey } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { NAVY_SEE_PCT, NAVY_SITE_LABEL, estimateBodyFatNavy } from '../../domain/bodyfat';
import { deviceTimeZone, isValidLocalDate, isValidTimeZone, todayLocal, utcOffsetLabel } from '../../domain/dates';
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
  type SetupDraft,
  type UnitSystem,
} from '../../domain/types';
import { displayMass, formatMass, formatVolume } from '../../domain/units';
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
import { BODY_EQUATIONS, BODY_EQUATIONS_LEAD } from '../../content/bodyEquations';
import { BODY_FAT_CHART_INTRO, BODY_FAT_CHART_PERCENTAGES } from '../../content/bodyFatChart';
import {
  SEX_RATIONALE_CUNNINGHAM_NOTE,
  SEX_RATIONALE_HRT,
  SEX_RATIONALE_HRT_SOURCE,
  SEX_RATIONALE_HRT_TITLE,
  SEX_RATIONALE_INTRO,
  SEX_RATIONALE_MSJ_OFFSET_NOTE,
  SEX_RATIONALE_SOURCES,
} from '../../content/sexRationale';
import { vibrate } from '../audio/chime';
import { ModalShell } from '../components/ModalShell';
import { GuidanceScreen } from './GuidanceScreen';

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
 */
export const STEPS = [
  'units',
  'timezone',
  'body',
  'training',
  'goal',
  'availability',
  'programme',
  'guidance',
  'review',
] as const;

export type StepId = (typeof STEPS)[number];

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
  guidance: 'step.guidance',
  review: 'step.review',
};

/**
 * The three groups the nine steps fall into, and which group each step belongs to.
 *
 * Round 1 claims C1.02.5 and C1.02.6: "the Steps 1:9 need to be broken down into one of these
 * three categories and the title of Setup would change to Setup: Personal Information".
 *
 * Derived from STEPS rather than restated as a list, so a step added above without a group is a
 * COMPILE ERROR rather than a step that silently renders the bare hero. Review is deliberately
 * null: it is the screen that writes the profile and reviews all three groups, so prefixing it
 * with one of them would misdescribe it.
 */
export type SetupGroup = 'settings' | 'personal' | 'goal';

const GROUP_TITLE_KEY: Record<SetupGroup, CopyKey> = {
  settings: 'group.settings',
  personal: 'group.personal',
  goal: 'group.goal',
};

const STEP_GROUP: Record<StepId, SetupGroup | null> = {
  units: 'settings',
  timezone: 'settings',
  body: 'personal',
  training: 'goal',
  goal: 'goal',
  availability: 'goal',
  programme: 'goal',
  guidance: 'personal',
  review: null,
};

/*
 * Units, not copy: a unit label is part of the contract and never changes with a skin
 * (copy contract, "Numbers, units and quantity names are part of the contract"). The mass and
 * load labels come from UNIT_LABEL through UnitInput; these are the ones UNIT_LABEL does not
 * carry because they are the same in both unit systems.
 */
const UNIT = { years: 'years', weeks: 'weeks', minutes: 'min', m: 'm', cm: 'cm', ft: 'ft', inch: 'in', pct: '%' };

const CM_PER_INCH = 2.54; // [cm/in] exact by definition
const CM_PER_METRE = 100; // [cm/m]
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

const SHAKE_DURATION_MS = 400; // [ms], matches the .wiz-shake keyframe duration in setup.css
// [ms] one short haptic pulse on a failed Next (Part 4, C1.08.12). Additive only: 00-CONTEXT
// notes navigator.vibrate is a no-op on iOS at every version and must never be the only cue.
const FAILED_NEXT_VIBRATE_MS = 120;
/*
 * [ms] C1.G.1: how long the wizard waits after the last keystroke before handing the store a
 * new draft to persist. A SEPARATE coalescing step from the store's own write-to-storage
 * debounce (src/store/index.ts SAVE_DEBOUNCE_MS = 250 ms): that one softens how often the
 * finished document reaches Web Storage; this one softens how often typing here hands the store
 * a new object to begin with, which would otherwise re-render every store subscriber on every
 * character.
 */
const SETUP_DRAFT_SAVE_DEBOUNCE_MS = 400;

/*
 * DOM ids for the messages that belong to more than one control, or to a control this file
 * renders itself rather than through UnitInput. Every one of them is referenced from an
 * aria-describedby on the control(s) that produced it while, and only while, it is on screen.
 */
const STEP_HEADING_ID = 'wiz-step-heading';
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

/**
 * A labelled empty frame standing in for a measurement-site or body-fat-percentage illustration.
 * Round 1 claims C1.08.5 and C1.08.9: the artwork itself is out of this brief's scope (an
 * original asset, per decision `visual-bodyfat-tracked-not-engine-feeding`, is drawn separately
 * and registered in docs/design/2026-09-04-icon-register.csv, which does not exist yet). This
 * renders the frame at the size and position the real asset will take, captioned in visible text
 * so a screen reader loses nothing while the frame is empty (B15: "a caption for screen-reader
 * users, who get nothing from an image").
 */
function ArtworkPlaceholder(props: { label: string; className: string }): JSX.Element {
  return (
    <div className={props.className}>
      <div className="wiz-placeholder-frame" aria-hidden="true" />
      <p className="wiz-note wiz-placeholder-caption">{props.label}</p>
    </div>
  );
}

interface DaySlot {
  enabled: boolean;
  startTime: string; // [HH:mm] local wall clock
  durationMin: string; // [min], as typed
}

/*
 * `SetupDraft` (src/domain/types.ts) is now the canonical shape: it is what gets PERSISTED
 * (C1.G.1), so it has to live in the domain layer rather than in this component, the same way
 * `Profile` does. `Draft` is derived from it with `Omit`, not hand-retyped, so the two cannot
 * drift the way two independently maintained field lists would; every field comment now lives
 * on `SetupDraft` itself. `stepIndex` is the one field this component tracks separately (its own
 * `useState`, below), which is exactly what the `Omit` removes.
 */
type Draft = Omit<SetupDraft, 'stepIndex'>;

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

/**
 * The two RMR equations, as inline MathML (round 1 claim C1.07.13). MathML, not a LaTeX runtime:
 * B9 measured KaTeX at roughly 300 KB against a floor every target browser already supports
 * natively, and unlike an image the expression stays selectable text a screen reader can read.
 * `@types/react` (checked 2026-09-05, React 19.2.8) declares no MathML tag in
 * JSX.IntrinsicElements, so the markup is set once as a static string rather than fought through
 * `React.createElement` calls with untyped props; nothing here interpolates a variable, so there
 * is no injection surface. The sex term carries its own class so CSS can highlight it with
 * `var(--accent)`, per the brief and never a hex literal (00-CONTEXT accessibility rule).
 */
const MSJ_EQUATION_MATHML =
  '<math display="block"><mrow><mi>RMR</mi><mo>=</mo><mn>10</mn><mo>&#215;</mo><mi>mass</mi>' +
  '<mo>+</mo><mn>6.25</mn><mo>&#215;</mo><mi>height</mi><mo>&#8722;</mo><mn>5</mn><mo>&#215;</mo>' +
  '<mi>age</mi><mo>+</mo><mi class="wiz-mathml-term">S</mi></mrow></math>';
const CUNNINGHAM_EQUATION_MATHML =
  '<math display="block"><mrow><mi>RMR</mi><mo>=</mo><mn>370</mn><mo>+</mo><mn>21.6</mn>' +
  '<mo>&#215;</mo><mi>FFM</mi></mrow></math>';

/**
 * The sex explainer (C1.07.6, C1.07.10 to C1.07.16): two segments separated by a rule in
 * `var(--accent)`. NOT lime: on limelight lime is the page background
 * (`src/ui/styles/tokens.css`), and a lime rule on a lime ground is invisible, the exact defect
 * this round exists to fix (B35).
 */
function SexRationaleModal(props: { onClose: () => void }): JSX.Element {
  const t = useCopy();
  const headingId = useId();
  return (
    <ModalShell
      labelledBy={headingId}
      className="wiz-modal"
      backdropClassName="wiz-modal-bg"
      testId="sex-rationale-backdrop"
      onClose={props.onClose}
    >
      {/* Drawn at the upper left by the caller, per the owner's explicit instruction: ModalShell
          renders no close control of its own (C1.07.11). */}
      <button
        type="button"
        className="wiz-modal-close"
        onClick={props.onClose}
        aria-label={t('button.closeModal')}
      >
        {/* A mark from the token set, not an emoji (copy contract R6), matching FormCuesModal. */}
        {'✕'}
      </button>
      <h2 id={headingId} className="wiz-modal-title">
        {t('label.sexRationale')}
      </h2>
      <div className="wiz-modal-segment">
        {SEX_RATIONALE_INTRO.map((paragraph) => (
          <p key={paragraph} className="wiz-note">
            {paragraph}
          </p>
        ))}
        <div className="wiz-mathml" dangerouslySetInnerHTML={{ __html: MSJ_EQUATION_MATHML }} />
        <p className="wiz-note wiz-mathml-caption">{SEX_RATIONALE_MSJ_OFFSET_NOTE}</p>
        <div
          className="wiz-mathml"
          dangerouslySetInnerHTML={{ __html: CUNNINGHAM_EQUATION_MATHML }}
        />
        <p className="wiz-note wiz-mathml-caption">{SEX_RATIONALE_CUNNINGHAM_NOTE}</p>
        <ol className="wiz-cite-list">
          {SEX_RATIONALE_SOURCES.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ol>
      </div>
      <hr className="wiz-modal-divider" />
      <div className="wiz-modal-segment">
        <h3 className="wiz-modal-subtitle">{SEX_RATIONALE_HRT_TITLE}</h3>
        {SEX_RATIONALE_HRT.map((paragraph) => (
          <p key={paragraph} className="wiz-note">
            {paragraph}
          </p>
        ))}
        <p className="wiz-note wiz-cite-src">{SEX_RATIONALE_HRT_SOURCE}</p>
      </div>
    </ModalShell>
  );
}

/**
 * The body-fat visual estimator (C1.08.5, C1.08.9). A placeholder grid, not the drawn asset
 * (B31: the chart ships, but the artwork is separate work; this is the frame it will sit in).
 * A number chosen here fills the percentage field with provenance `visual`, per B31.
 */
function BodyFatChartModal(props: { onSelect: (pct: number) => void; onClose: () => void }): JSX.Element {
  const t = useCopy();
  const headingId = useId();
  return (
    <ModalShell
      labelledBy={headingId}
      className="wiz-modal"
      backdropClassName="wiz-modal-bg"
      testId="bodyfat-chart-backdrop"
      onClose={props.onClose}
    >
      <button
        type="button"
        className="wiz-modal-close"
        onClick={props.onClose}
        aria-label={t('button.closeModal')}
      >
        {'✕'}
      </button>
      <h2 id={headingId} className="wiz-modal-title">
        {t('label.bodyFatChart')}
      </h2>
      <p className="wiz-note">{BODY_FAT_CHART_INTRO}</p>
      {(['male', 'female'] as const).map((sex) => (
        <div key={sex} className="wiz-chart-row">
          <p className="wiz-label">{t(sex === 'male' ? 'label.sexMale' : 'label.sexFemale')}</p>
          <div className="wiz-chart-frames">
            {BODY_FAT_CHART_PERCENTAGES.map((pct) => (
              <button
                key={pct}
                type="button"
                className="wiz-chart-frame"
                onClick={() => {
                  props.onSelect(pct);
                }}
              >
                {/* Placeholder for the silhouette artwork; not drawn in this brief. See
                    docs/design/2026-09-04-icon-register.csv for the id, prompt and status. */}
                <span className="wiz-placeholder-frame" aria-hidden="true" />
                <span className="wiz-chart-pct">{`${String(pct)}%`}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </ModalShell>
  );
}

export function SetupWizard(): JSX.Element {
  const t = useCopy();
  const overrides = useCopyOverrides();
  /*
   * C1.G.1: "if I don't end the onboarding and close the browser, when I open the page again,
   * the information that has been put there needs to be there waiting for me." Both lazy
   * initialisers read `useAppStore.getState().setupDraft` directly rather than through a hook,
   * because this only has to run once, on the first render, and neither call can observe the
   * other change it: nothing between them yields to the event loop.
   *
   * A corrupt stored draft never reaches here as anything other than `null` -
   * `SetupDraftSchema` (src/domain/schema.ts) is `.catch(null)`, so whatever the store holds by
   * the time a component can read it is either a fully valid `SetupDraft` or nothing.
   */
  const [draft, setDraft] = useState<Draft>((): Draft => {
    const stored = useAppStore.getState().setupDraft;
    if (stored === null) return initialDraft();
    const { stepIndex, ...draftFields } = stored;
    void stepIndex; // read by the sibling initialiser below, not here
    return draftFields;
  });
  const [stepIndex, setStepIndex] = useState<number>(
    () => useAppStore.getState().setupDraft?.stepIndex ?? 0,
  );
  /** Latched by the first successful confirm; the profile is created exactly once. */
  const [submitted, setSubmitted] = useState(false);
  const [sexRationaleOpen, setSexRationaleOpen] = useState(false);
  const [bodyFatChartOpen, setBodyFatChartOpen] = useState(false);
  /*
   * Round 1 claim C1.08.14 (B33): `error.valueRequired` stays, but it must not stand as helper
   * text under a field nobody has touched yet. `bodyNextAttempted` is the touched set the brief
   * asks for, scoped to a single flag rather than a per-field Set<string>: UnitInput
   * (src/ui/components/UnitInput.tsx) exposes no onBlur, and that shared component used by every
   * numeric field in the app is outside this brief's file list, so there is no per-field "left
   * the control" event to populate a finer set from. Pressing Next while blocked (Part 4,
   * C1.08.12) sets this flag and reveals every outstanding "enter a number" on the step at once,
   * which is the literal "mark every field touched" Part 4 asks for. Scoped to the body step
   * only: the other eight steps keep their pre-existing disabled-Next behaviour unchanged.
   */
  const [bodyNextAttempted, setBodyNextAttempted] = useState(false);

  /*
   * Persists the draft on change, debounced (C1.G.1). `draftSaveTimer` is read from `confirm()`
   * too, below, so a keystroke's pending write cannot land a few hundred milliseconds AFTER
   * Confirm has already cleared the draft and created the profile - the two clearTimeout sites
   * (this effect's own cleanup, and `confirm()`) are belt and braces for the same race, not a
   * duplicate: the effect's handles the general case (an edit pending when the component
   * unmounts some other way), and `confirm()`'s handles the one this brief calls out by name.
   *
   * `draftSaveMounted` skips exactly the first run, which is the restore this component's own
   * lazy initialisers just performed: persisting it again would be a write of exactly what the
   * store already holds (or, for a brand-new draft, of nothing new).
   */
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSaveMounted = useRef(false);
  useEffect(() => {
    if (!draftSaveMounted.current) {
      draftSaveMounted.current = true;
      return;
    }
    if (submitted) return;
    draftSaveTimer.current = setTimeout(() => {
      useAppStore.getState().saveSetupDraft({ ...draft, stepIndex });
    }, SETUP_DRAFT_SAVE_DEBOUNCE_MS);
    return () => {
      if (draftSaveTimer.current !== null) clearTimeout(draftSaveTimer.current);
    };
  }, [draft, stepIndex, submitted]);

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

  /**
   * `timeZoneOptions`, each paired with its computed "(UTC+02:00)" label (C1.06.2). Memoised on
   * `timeZoneOptions` alone, which itself never changes after mount, so this runs Intl's
   * formatter at most once per mount rather than on every render or every keystroke elsewhere on
   * the step. `Date.now()` is read once, here, rather than per option: the two calendar dates a
   * mount could ever straddle agree on every zone's offset to within the same civil day, and the
   * point of computing rather than storing is to track daylight saving over MONTHS, not to
   * chase a millisecond of drift within one render.
   */
  const timeZoneOptionLabels = useMemo(
    () =>
      timeZoneOptions.map((zone) => ({
        zone,
        label: `(${utcOffsetLabel(zone, Date.now())}) ${zone}`,
      })),
    [timeZoneOptions],
  );

  function patch(next: Partial<Draft>): void {
    setDraft((d) => ({ ...d, ...next }));
  }

  function patchDay(weekday: IsoWeekday, next: Partial<DaySlot>): void {
    setDraft((d) => ({ ...d, days: { ...d.days, [weekday]: { ...d.days[weekday], ...next } } }));
  }

  /**
   * `error.valueRequired` hidden until Next has been pressed on this step, everywhere else shown
   * as computed. Only the "enter a number" message is gated: an out-of-range or malformed value
   * the user has just typed is informative the moment it appears, and every existing domain-guard
   * test relies on that (SetupWizard.test.tsx, "domain guards" and "whole-number counts").
   * Comparing by VALUE against the resolved string, not by re-deriving "was this blank", keeps
   * this a thin render helper rather than a second copy of every validator's blank/invalid
   * branch.
   */
  function bodyFieldError(error: string | null): string | null {
    if (error === null || error !== t('error.valueRequired')) return error;
    return bodyNextAttempted ? error : null;
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

  /*
   * Stature from two whole-number fields, in both unit systems. Round 1 claims C1.07.20 and
   * C1.07.21: metres and centimetres, or feet and inches, and "ONLY integers. Not 5' or
   * 5 inches or 5.45". Either field may be blank and counts as zero, so 1 m 78 and 5 ft 0 both
   * work; both blank is null, which is a missing entry rather than a zero one.
   */
  const heightCm = useMemo((): number | null => {
    if (draft.units === 'metric') {
      const metres = parseDecimal(draft.heightM);
      const centimetres = parseDecimal(draft.heightCm);
      if (metres === null && centimetres === null) return null;
      return (metres ?? 0) * CM_PER_METRE + (centimetres ?? 0); // [cm]
    }
    const feet = parseDecimal(draft.heightFt);
    const inches = parseDecimal(draft.heightIn);
    if (feet === null && inches === null) return null;
    return ((feet ?? 0) * INCHES_PER_FOOT + (inches ?? 0)) * CM_PER_INCH; // [cm] exact
  }, [draft.units, draft.heightM, draft.heightCm, draft.heightFt, draft.heightIn]);

  const massKg = useMemo(
    () => storedMassKg(draft.mass, draft.units), // [kg] exact
    [draft.mass, draft.units],
  );

  const ageYears = parseDecimal(draft.ageYears); // [years], as typed
  // Back-calculated for storage, never for display: see the Draft.ageYears comment.
  const birthYear = ageYears === null ? null : Number(today.slice(0, 4)) - ageYears; // [year]

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

  const ageError =
    ageYears === null
      ? t('error.valueRequired')
      : !Number.isInteger(ageYears)
        ? t('error.wholeNumber')
        : ageYears < NUTRITION_DOMAIN.ageYears.lo ||
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

  /*
   * Body fat stays optional in every mode, `known` included (round 1 decision
   * `visual-bodyfat-tracked-not-engine-feeding`, B31: skipping it falls back to a validated
   * equation, it does not produce nothing). `known` is now the pre-selected default
   * (initialDraft, C1.08.1 to C1.08.4), so a blank box on first arrival must not block the step
   * the way a genuinely required field does; only a value the user TYPED and got wrong does. The
   * pattern mirrors targetMassError below, the wizard's other optional bounded quantity.
   */
  const knownBodyFatError =
    draft.bodyFatMode === 'known' && draft.bodyFatPct.trim() !== ''
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
      ageError !== null ||
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
    guidance: false,
    review: false,
  };

  /*
   * Confirm writes every screen's answers at once, so it is gated on every screen's guard rather
   * than on the one the user is looking at. Reaching Review already requires each of them to have
   * passed; this closes the case where a value goes stale behind the user (a unit switch, a
   * weekday unchecked on the way back through) and keeps the store write off the invalid path.
   */
  const confirmBlocked = STEPS.some((s) => BLOCKED[s]);

  /**
   * The id of the first invalid control on the body step, top to bottom, or null when nothing
   * blocks it. Used only by the failed-Next cue (Part 4, C1.08.12): BLOCKED.body itself, not
   * this order, is what actually gates the step.
   */
  function firstInvalidBodyFieldId(): string | null {
    if (ageError !== null) return 'f-age';
    if (heightError !== null) return draft.units === 'metric' ? 'f-height-m' : 'f-height-ft';
    if (massError !== null) return 'f-mass';
    if (knownBodyFatError !== null) return 'f-bodyfat';
    if (draft.bodyFatMode === 'tape') {
      if (girthError(draft.neck, overrides) !== null) return 'f-neck';
      if (girthError(draft.waist, overrides) !== null) return 'f-waist';
      if (draft.sex === 'female' && girthError(draft.hip, overrides) !== null) return 'f-hip';
      // tapeDomainError and tapeWithheld are properties of the three girths TOGETHER rather than
      // of one field; the neck field is the first of the three and the reasonable landing spot.
      if (tapeDomainError !== null || tapeWithheld) return 'f-neck';
    }
    return null;
  }

  /**
   * Part 4, C1.08.12: Next on the body step is never HTML-disabled (see the nav button below),
   * so a blocked press reaches here instead of being silently swallowed by the browser. It marks
   * every outstanding "enter a number" touched at once, focuses and scrolls to the first invalid
   * control, shakes it (branching on prefers-reduced-motion in CSS, not here), and vibrates as an
   * additive cue. Every OTHER step keeps its original disabled-button behaviour untouched.
   */
  function handleFailedBodyNext(): void {
    setBodyNextAttempted(true);
    const targetId = firstInvalidBodyFieldId();
    if (targetId !== null) {
      const el = document.getElementById(targetId);
      if (el !== null) {
        el.focus();
        // jsdom (SetupWizard.test.tsx) implements no layout engine and does not define
        // scrollIntoView at all, unlike every shipped browser above this app's stated floor; the
        // guard keeps the primary cues (focus, shake) working under test rather than throwing.
        el.scrollIntoView?.({ block: 'center' });
        el.classList.add('wiz-shake');
        window.setTimeout(() => {
          el.classList.remove('wiz-shake');
        }, SHAKE_DURATION_MS);
      }
    }
    vibrate(FAILED_NEXT_VIBRATE_MS);
  }

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
      /*
       * Readiness screening is retired (Brief A). Profile.readiness is preserved on the schema
       * for backwards compatibility and Zod stripping safety.
       */
      readiness: { screenedAt: null, flagged: false },
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
    /*
     * C1.G.1: setup is finished, so there is nothing left to resume. The pending debounce
     * timer is cancelled explicitly, on top of the persistence effect's own cleanup (which
     * `setSubmitted(true)` below will also trigger): a write already queued before this click
     * must not resurrect the draft a few hundred milliseconds after it has just been cleared.
     */
    if (draftSaveTimer.current !== null) {
      clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = null;
    }
    store.clearSetupDraft();
    setSubmitted(true);
  }

  // ---- render ---------------------------------------------------------------------------

  const massLabelUnit = massUnit(draft.units);
  const loadLabelUnit = loadUnit(draft.units);

  return (
    <div className="wiz">
      <h1>
        {FORMAT.setupGroup(
          t('setup.hero'),
          STEP_GROUP[step] === null ? null : t(GROUP_TITLE_KEY[STEP_GROUP[step]]),
        )}
      </h1>
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
          <p className="wiz-label">{t('label.units')}</p>
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
          {/* Below the control, not above it: round 1 claim C1.08.1, stated as a principle. */}
          <p className="wiz-note">{t('advice.unitsOnce')}</p>
        </fieldset>
      )}

      {step === 'timezone' && (
        <fieldset>
          <StepHeading title={t(STEP_TITLE_KEY.timezone)} headingRef={headingRef} />
          <p className="wiz-note">{t('advice.timezoneDetected')}</p>
          <div className="wiz-field">
            <p className="wiz-label">{t('advice.timezonePick')}</p>
            <label htmlFor="f-timezone">{t('label.timezone')}</label>
            {timeZoneOptions.length > 0 ? (
              // A closed choice from the platform's own list (C1.06.2), each option labelled
              // with today's computed offset so "Europe/Athens" reads as "(UTC+02:00)
              // Europe/Athens" rather than asking the owner to already know it.
              <select
                id="f-timezone"
                value={draft.timezone}
                aria-invalid={timezoneError !== null}
                aria-describedby={timezoneError === null ? undefined : 'f-timezone-error'}
                onChange={(e) => {
                  patch({ timezone: e.target.value });
                }}
              >
                {timeZoneOptionLabels.map((o) => (
                  <option key={o.zone} value={o.zone}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              /*
               * Reached only when the platform has no Intl.supportedValuesOf('timeZone') to
               * build the select's options from, or it throws (both treated as "no list" by
               * `timeZoneOptions` above). An IANA identifier is case-sensitive and contains no
               * words: autocapitalising, autocorrecting or spell-checking it can only corrupt
               * it.
               */
              <input
                id="f-timezone"
                type="text"
                value={draft.timezone}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={timezoneError !== null}
                aria-describedby={timezoneError === null ? undefined : 'f-timezone-error'}
                onChange={(e) => {
                  patch({ timezone: e.target.value });
                }}
              />
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

          {sexRationaleOpen && (
            <SexRationaleModal
              onClose={() => {
                setSexRationaleOpen(false);
              }}
            />
          )}
          {bodyFatChartOpen && (
            <BodyFatChartModal
              onClose={() => {
                setBodyFatChartOpen(false);
              }}
              onSelect={(pct) => {
                patch({
                  bodyFatMode: 'known',
                  bodyFatPct: String(pct),
                  bodyFatSource: 'visual',
                });
                setBodyFatChartOpen(false);
              }}
            />
          )}

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

          {/*
           * Round 1 claims C1.07.2, C1.07.18 and C1.07.19: two-column rows inside their own
           * bordered boxes, so the step stops needing a scroll. Age sits with sex because the
           * two are read together by the RMR equation; stature sits with body mass for the same
           * reason. The name stays outside both: it reaches no equation at all.
           */}
          <div className="wiz-box">
            <div className="wiz-row">
              <UnitInput
                id="f-age"
                quantity={t('quantity.age')}
                unit={UNIT.years}
                step="1"
                inputMode="numeric"
                value={draft.ageYears}
                error={bodyFieldError(ageError)}
                onChange={(v) => {
                  patch({ ageYears: v });
                }}
              />
              <div className="wiz-field">
                <p className="wiz-label" id="sex-label">
                  {t('label.sex')}
                  <sup>1</sup>
                </p>
                <div className="wiz-choice" role="radiogroup" aria-labelledby="sex-label">
                  {(['male', 'female'] as const).map((value) => (
                    <label key={value} className="wiz-glyph">
                      <input
                        type="radio"
                        name="sex"
                        checked={draft.sex === value}
                        onChange={() => {
                          patch({ sex: value });
                        }}
                      />
                      <span aria-hidden="true" className="wiz-glyph-mark" data-sex={value} />
                      {t(value === 'male' ? 'label.sexMale' : 'label.sexFemale')}
                    </label>
                  ))}
                </div>
                {/* C1.07.6, C1.07.10: the sex explainer, reached under the field it explains. */}
                <button
                  type="button"
                  className="wiz-link"
                  onClick={() => {
                    setSexRationaleOpen(true);
                  }}
                >
                  {t('advice.sexWorkaround')}
                </button>
              </div>
            </div>
          </div>

          <div className="wiz-box">
            <div className="wiz-row">
              <UnitInput
                id="f-mass"
                quantity={t('quantity.bodyMass')}
                unit={massLabelUnit}
                step="0.1"
                value={draft.mass}
                error={bodyFieldError(massError)}
                onChange={(v) => {
                  patch({ mass: v });
                }}
              />
              {/*
               * Stature is two whole-number fields in both systems, which is C1.07.20 and
               * C1.07.21. One message serves both, described by each.
               */}
              <div className="wiz-field">
                <p className="wiz-label" id="height-label">
                  {t('quantity.height')}
                  <sup>2</sup>
                </p>
                <div className="wiz-row wiz-row-tight">
                  <UnitInput
                    id={draft.units === 'metric' ? 'f-height-m' : 'f-height-ft'}
                    quantity={t(draft.units === 'metric' ? 'label.metres' : 'label.feet')}
                    unit={null}
                    step="1"
                    inputMode="numeric"
                    value={draft.units === 'metric' ? draft.heightM : draft.heightFt}
                    error={null}
                    sharedErrorId={bodyFieldError(heightError) === null ? null : HEIGHT_ERROR_ID}
                    onChange={(v) => {
                      patch(draft.units === 'metric' ? { heightM: v } : { heightFt: v });
                    }}
                  />
                  <UnitInput
                    id={draft.units === 'metric' ? 'f-height-cm' : 'f-height-in'}
                    quantity={t(draft.units === 'metric' ? 'label.centimetres' : 'label.inches')}
                    unit={null}
                    step="1"
                    inputMode="numeric"
                    value={draft.units === 'metric' ? draft.heightCm : draft.heightIn}
                    error={null}
                    sharedErrorId={bodyFieldError(heightError) === null ? null : HEIGHT_ERROR_ID}
                    onChange={(v) => {
                      patch(draft.units === 'metric' ? { heightCm: v } : { heightIn: v });
                    }}
                  />
                </div>
                {bodyFieldError(heightError) !== null && (
                  <p className="wiz-error" id={HEIGHT_ERROR_ID}>
                    {bodyFieldError(heightError)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/*
           * Round 1 claims C1.08.1 to C1.08.4, C1.08.7: percentage entry first and pre-selected
           * (initialDraft), "why?" and "Optional" moved BELOW the control they explain, no
           * obesity or category classification anywhere (numbers only, and none is rendered).
           */}
          <div className="wiz-choice" role="radiogroup" aria-label={t('quantity.bodyFat')}>
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
                  patch({ bodyFatMode: 'tape', bodyFatSource: 'tape' });
                }}
              />
              {t('label.bodyFatTape')}
            </label>
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
          </div>

          {draft.bodyFatMode === 'known' && (
            <>
              <button
                type="button"
                className="wiz-link"
                onClick={() => {
                  setBodyFatChartOpen(true);
                }}
              >
                {t('advice.estimateBodyFat')}
              </button>
              <UnitInput
                id="f-bodyfat"
                quantity={t('quantity.bodyFat')}
                unit={UNIT.pct}
                value={draft.bodyFatPct}
                error={bodyFieldError(knownBodyFatError)}
                onChange={(v) => {
                  patch({ bodyFatPct: v, bodyFatSource: 'measured' });
                }}
              />
            </>
          )}

          {draft.bodyFatMode === 'tape' && (
            <>
              <p className="wiz-note">{t('advice.tapeMethod')}</p>
              <UnitInput
                id="f-neck"
                quantity={t('quantity.neck')}
                unit={girthUnit(draft.units)}
                value={draft.neck}
                error={bodyFieldError(girthError(draft.neck, overrides))}
                sharedErrorId={tapeDomainError === null ? null : TAPE_ERROR_ID}
                onChange={(v) => {
                  patch({ neck: v });
                }}
              />
              <ArtworkPlaceholder label={t('quantity.neck')} className="wiz-site" />
              <UnitInput
                id="f-waist"
                quantity={
                  draft.sex === 'male' ? t('quantity.abdomenII') : t('quantity.abdomenI')
                }
                unit={girthUnit(draft.units)}
                value={draft.waist}
                error={bodyFieldError(girthError(draft.waist, overrides))}
                sharedErrorId={tapeDomainError === null ? null : TAPE_ERROR_ID}
                onChange={(v) => {
                  patch({ waist: v });
                }}
              />
              <ArtworkPlaceholder
                label={draft.sex === 'male' ? t('quantity.abdomenII') : t('quantity.abdomenI')}
                className="wiz-site"
              />
              {draft.sex === 'female' && (
                <>
                  <UnitInput
                    id="f-hip"
                    quantity={t('quantity.hip')}
                    unit={girthUnit(draft.units)}
                    value={draft.hip}
                    error={bodyFieldError(girthError(draft.hip, overrides))}
                    sharedErrorId={tapeDomainError === null ? null : TAPE_ERROR_ID}
                    onChange={(v) => {
                      patch({ hip: v });
                    }}
                  />
                  <ArtworkPlaceholder label={t('quantity.hip')} className="wiz-site" />
                </>
              )}
              {/*
               * C1.08.10, C1.08.13: the site prose moves behind why?, it is not deleted, because
               * it is what keeps the estimate valid (B15). R10 exempts a disclosure's length.
               */}
              <details>
                <summary>{t('disclosure.why')}</summary>
                <p className="wiz-note">{withoutDashConnector(NAVY_SITE_LABEL[draft.sex].waist)}</p>
                {draft.sex === 'female' && (
                  <p className="wiz-note">
                    {withoutDashConnector(NAVY_SITE_LABEL.female.hip ?? '')}
                  </p>
                )}
              </details>
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

          {/* C1.08.1: explanatory text below the control it explains, not above it. */}
          <p className="wiz-note">{t('advice.bodyFatOptional')}</p>
          <details>
            <summary>{t('disclosure.why')}</summary>
            <p className="wiz-note">{t('why.bodyFatOptional')}</p>
          </details>

          {/*
           * Round 1 claim C1.07.5: the methods, at the foot of the box, "do not be expansive -
           * just transparent". The markers are superscripts beside the two fields whose purpose
           * is least obvious; a row with marker 0 carries no marker and is listed for
           * completeness, because it reads this page's numbers too.
           */}
          <div className="wiz-cites">
            <p className="wiz-note">{BODY_EQUATIONS_LEAD}</p>
            <ol className="wiz-cite-list">
              {BODY_EQUATIONS.map((eq, n) => (
                <li key={`${String(eq.marker)}-${String(n)}`}>
                  {eq.marker > 0 && <sup>{eq.marker}</sup>} {eq.computes}{' '}
                  <span className="wiz-cite-src">{eq.source}</span>
                </li>
              ))}
            </ol>
          </div>
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

      {step === 'guidance' && (
        <div>
          {/* The screen renders its own sections, so this step's heading stands above them.
              It is also the element that takes focus on a step change, as on every other step. */}
          <h2
            className="wiz-heading wiz-heading-alone"
            id={STEP_HEADING_ID}
            ref={headingRef}
            tabIndex={-1}
          >
            {t(STEP_TITLE_KEY.guidance)}
          </h2>
          <GuidanceScreen massKg={massKg ?? 70} />
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
          {/*
           * What the earlier steps collected, read back before Confirm writes it. Round 1 claim
           * C1.14 asked for this step to be redone once the steps above settled: the rest of the
           * screen shows DERIVED numbers, which stay current on their own, but nothing showed the
           * user their own answers, which is the one thing a review screen exists to do.
           *
           * Every value is formatted through the same helpers the fields use, so a number here can
           * never disagree with the number typed above it.
           */}
          <fieldset>
            <legend>{t('hero.yourAnswers')}</legend>
            <dl>
              <dt>{t('label.name')}</dt>
              <dd data-testid="review-name">{draft.displayName}</dd>
              <dt>{t('quantity.age')}</dt>
              <dd data-testid="review-age">{FORMAT.quantityWithUnit(draft.ageYears, UNIT.years)}</dd>
              <dt>{t('label.sex')}</dt>
              <dd data-testid="review-sex">
                {t(draft.sex === 'male' ? 'label.sexMale' : 'label.sexFemale')}
              </dd>
              <dt>{t('quantity.bodyMass')}</dt>
              <dd data-testid="review-mass">
                {massKg === null ? t('label.none') : formatMass(massKg, draft.units)}
              </dd>
              <dt>{t('quantity.height')}</dt>
              <dd data-testid="review-height">
                {heightCm === null
                  ? t('label.none')
                  : draft.units === 'metric'
                    ? `${draft.heightM} ${UNIT.m} ${draft.heightCm} ${UNIT.cm}`
                    : `${draft.heightFt} ${UNIT.ft} ${draft.heightIn} ${UNIT.inch}`}
              </dd>
              <dt>{t('quantity.bodyFat')}</dt>
              <dd data-testid="review-bodyfat">
                {bodyFatPct === null
                  ? t('label.bodyFatNone')
                  : FORMAT.quantityWithUnit(round1(bodyFatPct).toString(), UNIT.pct)}
              </dd>
              <dt>{t('label.timezone')}</dt>
              <dd data-testid="review-timezone">{draft.timezone}</dd>
            </dl>
          </fieldset>

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
        {stepIndex < STEPS.length - 1 && (
          <button
            type="button"
            /*
             * Every step but body keeps the original disabled-Next behaviour: BLOCKED[step]
             * disables the control outright, exactly as before this brief. The body step alone
             * uses aria-disabled instead (Part 4, C1.08.12): a native disabled button cannot
             * dispatch a click at all, so "when Next is pressed with a blocking error" could
             * never fire. aria-disabled keeps the same visual/semantic blocked state without
             * removing the click that reveals it.
             */
            disabled={step === 'body' ? false : BLOCKED[step]}
            aria-disabled={step === 'body' ? BLOCKED[step] : undefined}
            onClick={() => {
              if (BLOCKED[step]) {
                if (step === 'body') handleFailedBodyNext();
                return;
              }
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
