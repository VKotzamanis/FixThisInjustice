import { useEffect, useId, useMemo, useRef, useState, type JSX, type Ref } from 'react';
import './setup.css';
import { FORMAT, copy } from '../../content/copy';
import type { CopyKey } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { NAVY_SEE_PCT, NAVY_SITE_LABEL, estimateBodyFatNavy } from '../../domain/bodyfat';
import {
  addDays,
  compareLocalDate,
  daysBetween,
  deviceTimeZone,
  groupTimeZones,
  isValidLocalDate,
  isValidTimeZone,
  isoWeekday,
  matchedZoneCities,
  matchedZoneMembers,
  promoteSelectedZone,
  todayLocal,
  zoneGroupMatches,
} from '../../domain/dates';
import { newId } from '../../domain/ids';
import {
  ACTIVITY_FACTOR,
  ACTIVITY_STOPS,
  NUTRITION_DOMAIN,
  computeTargets,
  isInDomain,
  seedBeverageTargetML,
  targetDateFeasibility,
  type Feasibility,
  type FeasibilityBand,
  type FeasibilityGap,
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
  GOAL_AXES_BY_KIND,
  GOAL_KIND_BY_AXES,
  KG_PER_LB,
  type ActivityLevel,
  type Availability,
  type AvailabilitySlot,
  type BodyweightEquipmentItem,
  type EquipmentAccess,
  type Experience,
  type FatAxis,
  type GoalKind,
  type HomeEquipmentItem,
  type IsoWeekday,
  type LocalDate,
  type MuscleAxis,
  type Profile,
  type SetupAnswers,
  type Sex,
  type StatedSex,
  type UnitSystem,
} from '../../domain/types';
import { displayMass, formatBeverageTarget, formatMass } from '../../domain/units';
import { WEEKDAY_ABBR, formatDayOfMonth } from '../format/plan';
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
import {
  BODY_EQUATIONS,
  BODY_EQUATIONS_LEAD,
  BODY_TAPE_DISCLAIMER,
} from '../../content/bodyEquations';
import {
  REVIEW_DATA_HOW_TO_MOVE,
  REVIEW_DATA_HOW_TO_RESET,
  REVIEW_DATA_WHERE_IT_LIVES,
} from '../../content/reviewDataNotes';
import { BODY_FAT_CHART_INTRO, BODY_FAT_CHART_PERCENTAGES } from '../../content/bodyFatChart';
import {
  SEX_RATIONALE_CUNNINGHAM,
  SEX_RATIONALE_CUNNINGHAM_NOTE,
  SEX_RATIONALE_CUNNINGHAM_TITLE,
  SEX_RATIONALE_HRT_KNOWN,
  SEX_RATIONALE_HRT_KNOWN_TITLE,
  SEX_RATIONALE_HRT_NOW,
  SEX_RATIONALE_HRT_NOW_TITLE,
  SEX_RATIONALE_HRT_OPEN,
  SEX_RATIONALE_HRT_OPEN_TITLE,
  SEX_RATIONALE_HRT_SOURCE,
  SEX_RATIONALE_HRT_SOURCE_LEAD,
  SEX_RATIONALE_HRT_TITLE,
  SEX_RATIONALE_MSJ,
  SEX_RATIONALE_MSJ_OFFSET_NOTE,
  SEX_RATIONALE_MSJ_TITLE,
  SEX_RATIONALE_SUMMARY,
  SEX_RATIONALE_SUMMARY_TITLE,
  SEX_RATIONALE_TOPIC,
} from '../../content/sexRationale';
import {
  ACTIVITY_LEVELS_BAND_ROWS,
  ACTIVITY_LEVELS_CITATION,
  ACTIVITY_LEVELS_CLOSING,
  ACTIVITY_LEVELS_INTRO,
  ACTIVITY_LEVELS_STOP_ROWS,
} from '../../content/activityLevels';
import { vibrate } from '../audio/chime';
import { ModalShell } from '../components/ModalShell';
import { GuidanceScreen } from './GuidanceScreen';
import { usePublishSetupBanner } from './setupBanner';
import {
  ACTIVITY_LEVEL_EXAMPLES,
  ACTIVITY_STOP_EXAMPLES,
  EQUIPMENT_ACCESS_EXAMPLES,
} from '../../content/setupSliderExamples';

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

/**
 * How many matched member zones a time-zone row names beside its own (round 2, r2.09).
 *
 * A search for "st" matches thirty of the thirty-three zones that share western Europe's
 * behaviour, and a row that listed all of them would be unreadable inside an `<option>`. Two is
 * enough to say "your city is in this row" without the row becoming the list it replaced.
 */
const MATCHED_ZONES_SHOWN = 2;

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
/*
 * The one line saying why the tape route and `Not measured` are unavailable (round 2 decision
 * A1). Both refused controls point at it with aria-describedby, so the state is ANNOUNCED rather
 * than only greyed: a control that looks different and says nothing is invisible to a screen
 * reader, which is the accessibility rule 00-CONTEXT states for selection state and which
 * applies with more force to a refusal.
 */
const BODYFAT_ND_REASON_ID = 'f-bodyfat-nd-reason';

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
 * SUPERSEDED (Brief G, decision `activity-slider-nine-stops`): master plan section 10.1's
 * amendment `activity-levels-three-bands` read "the bands are not arbitrary, so no slider wider
 * than three positions." That was half right. The bands are not arbitrary, but they are RANGES,
 * not points, and a stop INSIDE a published range invents nothing. The slider below is nine
 * positions, three per band, every PAL printed in the same FAO/WHO/UNU 2004 Table 5.3 the three-
 * band amendment already cited; `src/domain/nutrition.ts`'s ACTIVITY_STOPS carries the table and
 * the citation. `ActivityLevel` itself is UNCHANGED (still exactly `sedentary | moderate |
 * vigorous`): a stop's band is DERIVED from it, never a second, independently editable field, and
 * the earlier five-member ladder with invented midpoints at 1.55 and 1.85 stays rejected exactly
 * as before -- those two numbers now ship, but as points INSIDE the sedentary and moderate
 * bands (Brief G's own stops 2 and 5), not as a replacement for the printed floor the old ladder
 * used them for.
 */
const ACTIVITY_LEVEL_LABEL_KEY: Record<ActivityLevel, CopyKey> = {
  sedentary: 'option.activitySedentary',
  moderate: 'option.activityModerate',
  vigorous: 'option.activityVigorous',
};

/**
 * The nine-stop slider's own option list, `value` keyed by PAL rather than by band so
 * `sliderIndexOf`/`sliderValueAt` can address it exactly like every string-keyed slider on this
 * step (see their own updated doc comment above). `level` travels alongside each PAL so choosing
 * a stop sets `activity` (the band) and `activityPal` (the stop) together in one `patch` call --
 * the band is never chosen independently of the stop that implies it.
 */
const ACTIVITY_STOP_OPTIONS: { value: number; level: ActivityLevel }[] = ACTIVITY_STOPS.map(
  (stop) => ({ value: stop.pal, level: stop.level }),
);

/**
 * Brief F Part 1b: "Experience" renamed to Gym Comfort IN THE UI ONLY -- the type stays
 * `Experience` (novice | intermediate | advanced), and so does this array; only the copy the
 * three keys resolve to changed, to the owner's own verbatim wording. Each position also carries
 * an icon row id from docs/design/2026-09-04-icon-register.csv: the artwork does not exist yet,
 * so the render below is a labelled ArtworkPlaceholder naming the row, not generated art.
 */
const EXPERIENCE_OPTIONS: { value: Experience; labelKey: CopyKey; iconRow: string }[] = [
  { value: 'novice', labelKey: 'option.experienceNovice', iconRow: 'comfort-1-starting' },
  {
    value: 'intermediate',
    labelKey: 'option.experienceIntermediate',
    iconRow: 'comfort-2-machines',
  },
  {
    value: 'advanced',
    labelKey: 'option.experienceAdvanced',
    iconRow: 'comfort-3-freeweights',
  },
];

/**
 * Brief F Part 1c: five positions, lowest to highest access. The two combination positions
 * (`home-and-bodyweight`, `full-and-home`) carry no exercise tag of their own -- they resolve
 * through `ACCESS_UNLOCKS` (src/domain/types.ts) at generation time, in `resolveSlot`
 * (src/domain/plan/templates.ts). This is why library.ts needed no retagging: see that type's own
 * comment for the proof that a combination resolves identically to its dominant pure tier.
 */
const EQUIPMENT_ACCESS_OPTIONS: { value: EquipmentAccess; labelKey: CopyKey; iconRow: string }[] = [
  { value: 'bodyweight', labelKey: 'option.accessBodyweight', iconRow: 'equip-1-bodyweight' },
  {
    value: 'home-and-bodyweight',
    labelKey: 'option.accessHomeAndBodyweight',
    iconRow: 'equip-2-home-bodyweight',
  },
  { value: 'home', labelKey: 'option.accessHome', iconRow: 'equip-3-home' },
  { value: 'full-and-home', labelKey: 'option.accessFullAndHome', iconRow: 'equip-4-full-home' },
  { value: 'full-gym', labelKey: 'option.accessFullGym', iconRow: 'equip-5-full-gym' },
];

/**
 * Round 3 Task 7, his words: "can we have a slider with 5 markers and 3 of them (start, middle,
 * and end) have icons instead of markers?"
 *
 * DERIVED, not written out as [0, 2, 4]. The middle of a five-stop slider is index 2; the middle
 * of a list that grows to seven would be index 3, and a literal would silently mark the wrong
 * stop. `Math.floor` picks the LOWER of the two middles on an even-length list, which is a
 * choice rather than an accident: a list with no true middle has no middle marker to be right
 * about, and the lower one keeps the three icons in ascending order.
 */
const EQUIPMENT_ICON_INDICES: readonly number[] = [
  0,
  Math.floor((EQUIPMENT_ACCESS_OPTIONS.length - 1) / 2),
  EQUIPMENT_ACCESS_OPTIONS.length - 1,
];

/** Brief F Part 3: the aerobic row of the "What equipment do you have?" multi-select. */
const HOME_AEROBIC_OPTIONS: { value: HomeEquipmentItem; labelKey: CopyKey }[] = [
  { value: 'treadmill', labelKey: 'option.homeTreadmill' },
  { value: 'elliptical', labelKey: 'option.homeElliptical' },
  { value: 'rowing-machine', labelKey: 'option.homeRowingMachine' },
];

/**
 * Brief F Part 3: the three dumbbell bands. Each carries its own lower bound and an optional
 * upper bound (`hi: null` is the open-ended "40 and above" band); FORMAT.dumbbellBand /
 * dumbbellBandOpen append the profile's own unit at render, per the owner's own flag ("a range
 * with no unit is ambiguous"). The NUMBERS are the same in both unit systems -- the brief states
 * the pair verbatim as "5 to 20 kg" or "5 to 20 lb" -- only the trailing unit word changes.
 */
const HOME_DUMBBELL_BANDS: { value: HomeEquipmentItem; lo: number; hi: number | null }[] = [
  { value: 'dumbbells-5-20', lo: 5, hi: 20 },
  { value: 'dumbbells-20-40', lo: 20, hi: 40 },
  { value: 'dumbbells-40-plus', lo: 40, hi: null },
];

/** Brief F Part 3: the machine row of the "What equipment do you have?" multi-select. */
const HOME_MACHINE_OPTIONS: { value: HomeEquipmentItem; labelKey: CopyKey }[] = [
  { value: 'squat-rack', labelKey: 'option.homeSquatRack' },
  { value: 'cable-machine', labelKey: 'option.homeCableMachine' },
  { value: 'bench', labelKey: 'option.homeBench' },
  { value: 'leg-press', labelKey: 'option.homeLegPress' },
  { value: 'lat-pulldown', labelKey: 'option.homeLatPulldown' },
  { value: 'smith-machine', labelKey: 'option.homeSmithMachine' },
];

/** Brief F Part 3: the Body Weight Only multi-select, a flat unlabelled list. */
const BODYWEIGHT_EQUIPMENT_OPTIONS: { value: BodyweightEquipmentItem; labelKey: CopyKey }[] = [
  { value: 'yoga-mat', labelKey: 'option.bodyweightYogaMat' },
  { value: 'skipping-rope', labelKey: 'option.bodyweightSkippingRope' },
  { value: 'pull-up-bar', labelKey: 'option.bodyweightPullUpBar' },
  { value: 'resistance-bands', labelKey: 'option.bodyweightResistanceBands' },
];

/** Brief F Part 3: `Home gym`, or either combination that includes it. */
function showsHomeEquipment(equipment: EquipmentAccess): boolean {
  return equipment === 'home' || equipment === 'home-and-bodyweight' || equipment === 'full-and-home';
}

/** Brief F Part 3: `Full gym`, or `Full gym and home gym`. */
function showsGymCommute(equipment: EquipmentAccess): boolean {
  return equipment === 'full-gym' || equipment === 'full-and-home';
}

/**
 * Round 3 Task 8: the load-step fields, "ONLY when home gym and above is selected".
 *
 * THE CUT IS AT THE FIRST POSITION THAT INCLUDES A GYM, not at the position literally spelled
 * `Home gym`. The reason the task gives for the gate is that "below that there are no plates and
 * no dumbbells to step", and `Home gym and body weight` -- the stop immediately BELOW `Home gym`
 * on the slider -- has both. Reading "home gym and above" as index >= 2 would therefore hide the
 * plate and dumbbell increments from a user who owns the plates and dumbbells the fields are
 * about, which is the opposite of the stated reason. `Body weight only` is the one position with
 * no external load at all, so it is the one position the fields are hidden on.
 */
function showsLoadSteps(equipment: EquipmentAccess): boolean {
  return equipment !== 'bodyweight';
}

/**
 * The four goals, by their engine names. Still rendered, as the read-back of what the two axes
 * below derived, so the setup screen and the Targets screen call the same goal the same thing.
 * The chooser itself is `FAT_AXIS_OPTIONS` and `MUSCLE_AXIS_OPTIONS`.
 */
const GOAL_OPTIONS: { value: GoalKind; labelKey: CopyKey }[] = [
  { value: 'fat-loss', labelKey: 'option.goalFatLoss' },
  { value: 'muscle-gain', labelKey: 'option.goalMuscleGain' },
  { value: 'recomposition', labelKey: 'option.goalRecomposition' },
  { value: 'maintenance', labelKey: 'option.goalMaintenance' },
];

/**
 * The two axes the goal step actually asks about (Brief I Part 1, claims C1.10.2 to C1.10.6).
 *
 * DERIVED, NEVER STORED. Neither axis is a draft field: the pair maps onto `GoalKind` and back
 * through `GOAL_KIND_BY_AXES` / `GOAL_AXES_BY_KIND` in src/domain/types.ts, so `draft.goalKind`
 * IS the state of both controls and there is no second copy of it that could disagree.
 */
const FAT_AXIS_OPTIONS: { value: FatAxis; labelKey: CopyKey }[] = [
  { value: 'lose', labelKey: 'option.fatLose' },
  { value: 'hold', labelKey: 'option.fatHold' },
];

const MUSCLE_AXIS_OPTIONS: { value: MuscleAxis; labelKey: CopyKey }[] = [
  { value: 'gain', labelKey: 'option.muscleGain' },
  { value: 'hold', labelKey: 'option.muscleHold' },
];

/** The plain-sentence outcome for each derived goal, in the owner's register rather than the engine's. */
const GOAL_OUTCOME_KEY: Record<GoalKind, CopyKey> = {
  'fat-loss': 'advice.goalOutcomeFatLoss',
  'muscle-gain': 'advice.goalOutcomeMuscleGain',
  recomposition: 'advice.goalOutcomeRecomposition',
  maintenance: 'advice.goalOutcomeMaintenance',
};

/** The band word that ships beside every band fill. WCAG 1.4.1: colour is never the only carrier. */
const BAND_WORD_KEY: Record<FeasibilityBand, CopyKey> = {
  realistic: 'status.bandRealistic',
  improbable: 'status.bandImprobable',
  'highly-improbable': 'status.bandHighlyImprobable',
};

/**
 * The line shown when a date carries NO band, one per reason the model can give.
 *
 * `Record<FeasibilityGap, CopyKey>` is total by type, so a reason added to the model without a
 * sentence to explain it is a compile error rather than a blank panel. Every one of these names
 * a rule or an input that is MISSING; not one of them states a rate.
 */
const FEASIBILITY_GAP_KEY: Record<FeasibilityGap, CopyKey> = {
  'no-weekly-rate': 'advice.feasibilityNoWeeklyRate',
  'mass-held': 'advice.feasibilityMassHeld',
  'not-a-loss': 'advice.feasibilityNotALoss',
  'no-horizon': 'advice.feasibilityNeedsFuture',
  'no-target': 'advice.feasibilityNeedsTarget',
};

/** The token class that paints one band fill. The hexes and their measured ratios are in tokens.css. */
const BAND_CLASS: Record<FeasibilityBand, string> = {
  realistic: 'wiz-band-realistic',
  improbable: 'wiz-band-improbable',
  'highly-improbable': 'wiz-band-highly-improbable',
};

/**
 * How far ahead the calendar will page. A guard on the month arrows, not a claim about how far
 * out a target date may be: the date INPUT beside the grid accepts any valid date, and
 * `targetDateFeasibility` bands whatever it is given.
 */
const CALENDAR_MAX_MONTHS_AHEAD = 60; // [month], five years

/** Days in the calendar month containing `date`, as LocalDates, Monday-aligned by the caller. */
function monthDays(date: LocalDate): LocalDate[] {
  const first = `${date.slice(0, 7)}-01`;
  const days: LocalDate[] = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(d);
  return days;
}

/** The first of the month `n` months from `date`'s month. Clamped to day 01, so no month is skipped. */
function shiftMonth(date: LocalDate, n: number): LocalDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const zero = year * 12 + (month - 1) + n;
  const y = Math.floor(zero / 12);
  const m = (zero % 12) + 1;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
}

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
function ArtworkPlaceholder(props: {
  label: string;
  className: string;
  /** docs/design/2026-09-04-icon-register.csv row id, rendered as a data attribute so the
   * naming lives at the render site rather than only in a comment above the call (Brief F
   * Part 1b: "leave a comment naming the register row"). Optional: the body step's
   * measurement-site and body-fat-chart placeholders predate the icon register. */
  iconRow?: string;
}): JSX.Element {
  return (
    <div className={props.className} data-icon-row={props.iconRow}>
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
 * `SetupAnswers` (src/domain/types.ts) is the canonical shape: it is what gets PERSISTED
 * (C1.G.1), so it lives in the domain layer rather than in this component, the same way
 * `Profile` does. `Draft` is that type under this file's own name, not a hand-retyped copy, so
 * the two cannot drift the way two independently maintained field lists would; every field
 * comment lives on `SetupAnswers` itself. `stepIndex` and the uncommitted `buffer` are the two
 * fields this component tracks separately (their own `useState`, below), which is exactly what
 * `SetupDraft` adds on top of `SetupAnswers`.
 */
type Draft = SetupAnswers;

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
    /*
     * Round 2 claim r2.11, ruled in plan decision A1: "Have ND be the default field variable for
     * SEX and it would be overriden when NEXT is pressed with a sex option." `nd` is therefore
     * the value a wizard OPENS with, not an error state and not a fallback after a failure, and
     * Next does not block on it. What it does block on is the body-fat percentage, which the
     * only sex-free equation needs; see `knownBodyFatError` below.
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
    weeks: String(DEFAULT_WEEKS),
    includeCardio: false,
  };
}

/*
 * `pick` lived here: it parsed a <select>'s raw string value against its closed option list
 * rather than casting it (master plan section 3). Brief I replaced the goal <select>, its last
 * caller, with two radio groups, and a radio's handler closes over the already-typed option
 * value, so there is no raw string left to parse. `pickSessionsPerWeek` below is the same guard
 * for the one select that remains, and it still parses rather than casting.
 */
function pickSessionsPerWeek(raw: string): SessionsPerWeek {
  const value = Number(raw);
  return (
    SESSIONS_PER_WEEK_OPTIONS.find((n) => n === value) ?? DEFAULT_SESSIONS_PER_WEEK
  );
}

/**
 * A `<input type="range">`'s current position: the index of `value` in `options`, or 0. The
 * range's own value is ALWAYS an index into a closed list (Brief F Part 1), never a free number,
 * so this and `sliderValueAt` below are the only two places a slider's index and its domain value
 * meet.
 *
 * `T extends string | number` rather than Brief F's original `string`-only bound (Brief G): the
 * nine-stop Everyday Activity Level slider addresses its options by PAL, a number, not a string
 * enum member like every other slider on this step. Widening the bound here keeps that slider on
 * the SAME two functions instead of forking a numeric-only pair beside them, which is what the
 * doc comment's own "only two places" claim depends on staying true.
 */
function sliderIndexOf<T extends string | number>(options: readonly { value: T }[], value: T): number {
  const i = options.findIndex((o) => o.value === value);
  return i === -1 ? 0 : i;
}

/** The domain value at a `<input type="range">`'s raw string index, or `fallback` off the list. */
function sliderValueAt<T extends string | number>(
  options: readonly { value: T }[],
  raw: string,
  fallback: T,
): T {
  const i = Number(raw);
  return options[i]?.value ?? fallback;
}

/** Adds `item` to `list` if absent, removes it if present. Order of the rest is preserved. */
function toggleItem<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
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
      {/*
       * r2.12(i): "The X should be on then upper right corner (more intuitive) and should be bold
       * and stand out." This REVERSES round 1's C1.07.11, which put it upper left. Plan ruling
       * D2.12.2 allows the reversal and notes that it makes the app CONSISTENT: FormCuesModal
       * already closes upper right. The comment in setup.css that recorded the old ruling was
       * updated with the rule, not left contradicting it. ModalShell still renders no close
       * control of its own, so this is the only one.
       */}
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

      {/*
       * SEGMENT ONE, in the owner's own running order (r2.12(iii)): "(a) introduce the topic, (b)
       * describe 1 function of the topic, (c) provide the corresponding equation, (d) describe the
       * other function of the topic, (e) provide that equation, and (f) write a brief
       * conclusion/summary as a comparison."
       *
       * Each equation now sits at ITS OWN point of use, under the paragraphs that describe it,
       * which is what he objected to: "The two equations appear together but they are referred to
       * in different points of the text explanation."
       *
       * The citations that used to close this segment are gone from here and live in the step's
       * one reference list (r2.12(v)).
       */}
      <div className="wiz-modal-segment">
        {/* (a) */}
        {SEX_RATIONALE_TOPIC.map((paragraph) => (
          <p key={paragraph} className="wiz-note">
            {paragraph}
          </p>
        ))}

        {/* (b) */}
        <h3 className="wiz-modal-subtitle">{SEX_RATIONALE_MSJ_TITLE}</h3>
        <ul className="wiz-modal-points">
          {SEX_RATIONALE_MSJ.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        {/* (c) */}
        <div className="wiz-mathml" dangerouslySetInnerHTML={{ __html: MSJ_EQUATION_MATHML }} />
        <p className="wiz-note wiz-mathml-caption">{SEX_RATIONALE_MSJ_OFFSET_NOTE}</p>

        {/* (d) */}
        <h3 className="wiz-modal-subtitle">{SEX_RATIONALE_CUNNINGHAM_TITLE}</h3>
        <ul className="wiz-modal-points">
          {SEX_RATIONALE_CUNNINGHAM.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        {/* (e) */}
        <div
          className="wiz-mathml"
          dangerouslySetInnerHTML={{ __html: CUNNINGHAM_EQUATION_MATHML }}
        />
        <p className="wiz-note wiz-mathml-caption">{SEX_RATIONALE_CUNNINGHAM_NOTE}</p>

        {/* (f) */}
        <h3 className="wiz-modal-subtitle">{SEX_RATIONALE_SUMMARY_TITLE}</h3>
        <ul className="wiz-modal-points">
          {SEX_RATIONALE_SUMMARY.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>

      <hr className="wiz-modal-divider" />

      {/*
       * SEGMENT TWO, r2.12(iv). Three subsection headings, his words and his order, with the wall
       * of text under each broken into points. The heading itself takes the theme colour on a
       * white highlight ("fuchsia pink here"), which is `var(--accent)` in setup.css so clinical
       * and board resolve their own rather than inheriting limelight's pink.
       */}
      <div className="wiz-modal-segment">
        <h3 className="wiz-modal-subtitle wiz-modal-hrt">{SEX_RATIONALE_HRT_TITLE}</h3>

        <h4 className="wiz-modal-subsection">{SEX_RATIONALE_HRT_OPEN_TITLE}</h4>
        <ul className="wiz-modal-points">
          {SEX_RATIONALE_HRT_OPEN.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>

        <h4 className="wiz-modal-subsection">{SEX_RATIONALE_HRT_KNOWN_TITLE}</h4>
        <ul className="wiz-modal-points">
          {SEX_RATIONALE_HRT_KNOWN.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>

        {/*
         * r2.12(iv), last sentence: "I will add a sprite next to that heading so make space. It
         * will be a small emoji type as height as the text of the subsection."
         *
         * The space, and nothing else. The artwork is the owner's (plan decision A3: no agent
         * draws, generates or re-specifies an asset), and the row it will fill is
         * `sprite-subsection-marker` in docs/design/2026-09-06-asset-manifest.md, which is still
         * marked needs-decision because what was asked for is a real person's likeness. The slot
         * is sized to the heading's own text height so the line does not reflow when it lands, and
         * it is aria-hidden because it is a decorative marker beside a heading that already reads.
         */}
        <div className="wiz-modal-subsection-row">
          <h4 className="wiz-modal-subsection">{SEX_RATIONALE_HRT_NOW_TITLE}</h4>
          <span
            className="wiz-sprite-slot"
            data-icon-row="sprite-subsection-marker"
            aria-hidden="true"
          />
        </div>
        <ul className="wiz-modal-points">
          {SEX_RATIONALE_HRT_NOW.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
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

/**
 * "Where These Levels Come From" (Brief G), opened from the training step's Everyday Activity
 * Level slider. Same `ModalShell`, same upper-right close control as SexRationaleModal and
 * BodyFatChartModal above: the brief's own text says "close control upper left", the position
 * round 1 shipped, but r2.12(i)/ruling D2.12.2 moved every other modal's close control upper
 * right for consistency (FormCuesModal included) after this brief was written, and matching the
 * two modals above rather than the brief's now-superseded wording is what keeps this one
 * consistent with them.
 */
function ActivityLevelsModal(props: { onClose: () => void }): JSX.Element {
  const t = useCopy();
  const headingId = useId();
  return (
    <ModalShell
      labelledBy={headingId}
      className="wiz-modal"
      backdropClassName="wiz-modal-bg"
      testId="activity-levels-backdrop"
      onClose={props.onClose}
    >
      <button
        type="button"
        className="wiz-modal-close"
        onClick={props.onClose}
        aria-label={t('button.closeModal')}
      >
        {/* A mark from the token set, not an emoji (copy contract R6), matching every other
            modal's close control in this file. */}
        {'✕'}
      </button>
      <h2 id={headingId} className="wiz-modal-title">
        {t('label.activityLevelsSource')}
      </h2>
      <p className="wiz-note">{ACTIVITY_LEVELS_INTRO}</p>
      <ul className="wiz-modal-points">
        {ACTIVITY_LEVELS_BAND_ROWS.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
      <ol className="wiz-modal-points">
        {ACTIVITY_LEVELS_STOP_ROWS.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ol>
      <p className="wiz-note">{ACTIVITY_LEVELS_CLOSING}</p>
      <p className="wiz-note wiz-cite-src">{ACTIVITY_LEVELS_CITATION}</p>
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
  const [committed, setCommitted] = useState<Draft>((): Draft => {
    const stored = useAppStore.getState().setupDraft;
    if (stored === null) return initialDraft();
    const { stepIndex, buffer, ...answers } = stored;
    void stepIndex; // read by a sibling initialiser below, not here
    void buffer; // likewise
    return answers;
  });
  /*
   * The UNCOMMITTED half of the two tiers, r2.11 / plan decision A2: "the data of a field cell
   * should not be replaced at the entry point (store it as temp), but it should be replaced only
   * when NEXT is pressed." Every control on every step writes here; Next merges this into
   * `committed` and clears it, and Back clears it without merging, which is what makes Back
   * non-destructive.
   *
   * It is RESTORED from storage, not started empty, and that is the whole point of persisting two
   * tiers rather than one. Round 1's most valued behaviour (C1.G.1) is that setup survives a
   * closed browser; if a field only reached storage on Next, closing the browser mid-step would
   * lose the step, which is the exact loss C1.G.1 exists to prevent.
   */
  const [buffer, setBuffer] = useState<Draft | null>(
    () => useAppStore.getState().setupDraft?.buffer ?? null,
  );
  const [stepIndex, setStepIndex] = useState<number>(
    () => useAppStore.getState().setupDraft?.stepIndex ?? 0,
  );
  /*
   * What the screen renders and what every validator below reads: the committed answers with the
   * step in progress laid over them. Nothing downstream of this line knows there are two tiers,
   * which is why the commit boundary could be added without rewriting the step bodies.
   */
  const draft: Draft = buffer ?? committed;
  /** Latched by the first successful confirm; the profile is created exactly once. */
  const [submitted, setSubmitted] = useState(false);
  /*
   * Brief M, claim r2.19: the review step's "Looks Good" acknowledgement. A gesture, not a
   * record, exactly like the intro sequence's own acknowledgement (src/ui/intro/IntroSequence.tsx)
   * -- it gates BLOCKED.review below and is never written to the store or to setupDraft.
   */
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [sexRationaleOpen, setSexRationaleOpen] = useState(false);
  const [bodyFatChartOpen, setBodyFatChartOpen] = useState(false);
  const [activityLevelsOpen, setActivityLevelsOpen] = useState(false);
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
   * The time-zone search box (round 2, r2.09). NOT part of the draft and not persisted: it is a
   * view of the list, not an answer, so it belongs in neither tier of the two-tier draft and a
   * reload should reopen the step with the full list rather than with someone's half-typed
   * filter still hiding most of it.
   */
  const [zoneQuery, setZoneQuery] = useState('');

  /*
   * Which month the feasibility calendar is showing, as an offset from the month of the day the
   * wizard was opened (Brief I Part 4). NOT part of the draft, for the same reason `zoneQuery`
   * is not: it is a view of the calendar, not an answer, and the answer itself is
   * `draft.targetDate`, which the grid writes and reads like any other control.
   */
  const [monthOffset, setMonthOffset] = useState(0);

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
      // BOTH tiers, separately (A2). The committed answers spread flat, exactly as before; the
      // step in progress rides beside them under `buffer` and never overwrites them.
      useAppStore.getState().saveSetupDraft({ ...committed, stepIndex, buffer });
    }, SETUP_DRAFT_SAVE_DEBOUNCE_MS);
    return () => {
      if (draftSaveTimer.current !== null) clearTimeout(draftSaveTimer.current);
    };
  }, [committed, buffer, stepIndex, submitted]);

  const step: StepId = STEPS[stepIndex] ?? 'units';

  /*
   * The top bar's banner reads these two and nothing else (round 2, r2-onboarding.general). The
   * banner is rendered in <header> by src/app/App.tsx, above <main>, so it cannot reach this
   * component's state without being handed it; src/ui/setup/setupBanner.tsx records why that is
   * a context and not the persisted draft.
   *
   * `draft.displayName`, WHICH IS THE MERGED VIEW (`buffer ?? committed`), and so is exactly the
   * string the name field's own `value` renders. The banner therefore updates as the user types
   * and can never disagree with the field two lines below it. It is passed RAW: the banner
   * decides whether a name was given by trimming, and renders what was typed.
   */
  usePublishSetupBanner(draft.displayName, step === 'review');

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
   * The 418 zones reduced to the 59 distinct behaviours, sorted by offset (round 2, r2.09).
   *
   * THE ORDERING WAS THE DEFECT the owner reported: "it Shows UTC-05 America/Cancun the below
   * UTC-04,-04,-04, and then again UTC-05 : America/Cayman. That is confusing." The list was in
   * IANA alphabetical order. `groupTimeZones` sorts by the offset in force, most negative first.
   *
   * ONE ROW PER OFFSET IS REFUSED, and src/domain/dates.ts carries the measurement that refuses
   * it: 37 offsets in January, 16 of which split by July. Rows are keyed on the zone's offsets
   * across the WHOLE YEAR instead, so New York and Panama stay apart.
   *
   * Memoised on `timeZoneOptions` alone, which never changes after mount, so the twelve-month
   * signature is computed once per mount rather than on every keystroke on the step. `Date.now()`
   * is read once, here, for the reason the previous version gave: the point of computing rather
   * than storing an offset is to track daylight saving over MONTHS, not to chase a millisecond
   * within one render.
   *
   * The selected zone is appended when the platform's list does not carry it, so a zone restored
   * from a draft written by another build, or typed into the fallback field below, still has a
   * row of its own rather than silently selecting someone else's.
   */
  const timeZoneGroups = useMemo(() => {
    if (timeZoneOptions.length === 0) return [];
    const known = isValidTimeZone(draft.timezone) && !timeZoneOptions.includes(draft.timezone);
    const zones = known ? [...timeZoneOptions, draft.timezone] : timeZoneOptions;
    return groupTimeZones(zones, Date.now());
    // draft.timezone is deliberately NOT a dependency: re-grouping 418 zones on every selection
    // change would run 5016 offset lookups per keystroke. What the selection changes is which
    // row is NAMED after it, and `promoteSelectedZone` below does that in one cheap pass. The
    // list itself only has to be rebuilt when a zone outside the platform's own list appears,
    // which the mount-time read covers for every path that can produce one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZoneOptions]);

  /**
   * The rows as the picker actually draws them: the chosen zone naming its own row, the search
   * applied, and the chosen row always present even when the search would have hidden it.
   *
   * SEARCH READS ALL 418 WHILE THE LIST SHOWS 59. Someone typing "Amsterdam" has to find their
   * group even though the row is named after Paris, or the reduction has cost them the ability
   * to find themselves; when a search names a member the row is not named after, the row says so.
   */
  const shownTimeZoneRows = useMemo(() => {
    const promoted = promoteSelectedZone(timeZoneGroups, draft.timezone);
    const query = zoneQuery.trim();
    return promoted
      .filter(
        (group) => group.representative === draft.timezone || zoneGroupMatches(group, query),
      )
      .map((group) => {
        // matchedZoneMembers says which member ID matched ("berlin" -> Europe/Berlin);
        // matchedZoneCities says which vendored city matched ("houston" -> Houston, under
        // America/Chicago). Members first, so an existing zone-id match keeps its position.
        const matched = [...matchedZoneMembers(group, query), ...matchedZoneCities(group, query)];
        const also =
          matched.length > 0
            ? matched.slice(0, MATCHED_ZONES_SHOWN).join(', ')
            : group.members.length > 1
              ? FORMAT.timeZoneAlso(group.members.length - 1, overrides)
              : '';
        return {
          zone: group.representative,
          label: FORMAT.timeZoneOption(group.offsetLabel, group.representative, also),
        };
      });
  }, [timeZoneGroups, draft.timezone, zoneQuery, overrides]);

  /**
   * Writes into the UNCOMMITTED tier (A2). The functional update seeds the buffer from the
   * committed answers on its first call of a step, so a second keystroke on the same step builds
   * on the first rather than on a stale copy.
   */
  function patch(next: Partial<Draft>): void {
    setBuffer((b) => ({ ...(b ?? committed), ...next }));
  }

  /**
   * The sex control's one writer, including the deselect back to `nd` (r2.11).
   *
   * It also REPAIRS the body-fat mode, because decision A1 makes two of the three modes
   * unavailable the moment the sex is cleared: the tape equations have no `nd` form, and
   * `Not measured` cannot stand while a percentage is the only thing Cunningham can read. The
   * repair happens on the click that caused it rather than in an effect, so the screen never
   * renders a combination the rules forbid, not even for one frame.
   *
   * The typed percentage is NOT cleared on the way in either direction. Losing a number the user
   * supplied because they changed a different field is the app throwing away their work.
   */
  function selectSex(next: Sex): void {
    if (next !== 'nd' || draft.bodyFatMode === 'known') {
      patch({ sex: next });
      return;
    }
    patch({ sex: next, bodyFatMode: 'known' });
  }

  function patchDay(weekday: IsoWeekday, next: Partial<DaySlot>): void {
    setBuffer((b) => {
      const base = b ?? committed;
      return { ...base, days: { ...base.days, [weekday]: { ...base.days[weekday], ...next } } };
    });
  }

  /**
   * Next: the step's answers become the committed ones, and the buffer empties.
   *
   * `setCommitted(draft)` and not `setCommitted({ ...committed, ...buffer })`, because `draft` is
   * already that merge and computing it twice is how the two would drift.
   */
  function commitStep(): void {
    if (buffer !== null) setCommitted(draft);
    setBuffer(null);
  }

  /**
   * Back: the step's answers are DISCARDED rather than committed (A2, "Back does not commit").
   * The committed answers are what the previous step renders, so a user who typed something on a
   * step and then went back finds the screen as they last confirmed it, not half-edited.
   */
  function discardStep(): void {
    setBuffer(null);
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
    });
  }

  /**
   * The sex when one was actually given, and `null` under `nd` (round 2 decision A1).
   *
   * Every sex-keyed table and every equation with no sex-free form takes `StatedSex`, so this one
   * narrowing is where the branch is made, once, in the open. There is deliberately no `?? 'male'`
   * anywhere in this file: defaulting a non-disclosed sex to a stated one would feed a coefficient
   * the user never supplied into three engines, silently, which is the failure mode decision A1
   * exists to make impossible.
   */
  const statedSex: StatedSex | null = draft.sex === 'nd' ? null : draft.sex;

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

  /**
   * The US Navy estimate for the girths entered so far, or null while it is unavailable.
   *
   * Null under `nd` and not merely absent from the screen: decision A1 disables the tape route
   * without a stated sex, because the male and female equations differ in FORM rather than in
   * coefficient, so there is no third equation to fall back to and no defensible average of the
   * two. `estimateBodyFatNavy` takes a `StatedSex`, so this is a compile-time guarantee.
   */
  const tapeEstimate = useMemo((): number | null => {
    if (draft.bodyFatMode !== 'tape') return null;
    if (statedSex === null) return null;
    const neckCm = storedGirthCm(draft.neck, draft.units);
    const waistCm = storedGirthCm(draft.waist, draft.units);
    const hipCm = storedGirthCm(draft.hip, draft.units);
    if (heightCm === null || neckCm === null || waistCm === null) return null;
    if (statedSex === 'female' && hipCm === null) return null;
    return estimateBodyFatNavy({ sex: statedSex, heightCm, neckCm, waistCm, hipCm }); // [%]
  }, [draft.bodyFatMode, draft.neck, draft.waist, draft.hip, statedSex, draft.units, heightCm]);

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
  /**
   * Round 2 decision A1, the consequence that has to ship with `nd` or the state is incoherent:
   * WITHOUT a stated sex the body-fat percentage is REQUIRED.
   *
   * It is not a form preference. Mifflin-St Jeor has no sex-free form and averaging its two
   * constants would invent a coefficient, so the only equation left is Cunningham, and Cunningham
   * reads fat-free mass, which the app can only get from a body-fat percentage. `isInDomain`
   * (src/domain/nutrition.ts) reports the same combination as out of domain, so this rule and the
   * engine's own rule are the same rule stated in the two places that have to agree.
   */
  const bodyFatRequired = statedSex === null;

  const knownBodyFatError =
    draft.bodyFatMode === 'known' && draft.bodyFatPct.trim() === ''
      ? bodyFatRequired
        ? copy('error.valueRequired', overrides)
        : null
      : draft.bodyFatMode === 'known'
        ? requiredInRange(
            copy('quantity.bodyFat', overrides),
            draft.bodyFatPct,
            NUTRITION_DOMAIN.bodyFatPct,
            overrides,
            UNIT.pct,
          )
        : null;

  /**
   * A mode that cannot produce a percentage, while one is required.
   *
   * `Not measured` and the tape route are both unavailable under `nd` (A1), and the controls say
   * so and refuse the selection. This is the belt: a draft restored from storage can arrive on
   * this step already holding `bodyFatMode: 'none'` with `sex: 'nd'`, a combination no click on
   * this screen can now produce, and it must block rather than confirm a profile the engine will
   * refuse to compute targets for.
   */
  const bodyFatModeUnavailable = bodyFatRequired && draft.bodyFatMode !== 'known';

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
    statedSex !== null &&
    (girthError(draft.neck, overrides) !== null ||
      girthError(draft.waist, overrides) !== null ||
      (statedSex === 'female' && girthError(draft.hip, overrides) !== null));

  /** Girths are complete and positive, yet the equation returned no estimate for them. */
  const tapeWithheld =
    draft.bodyFatMode === 'tape' &&
    statedSex !== null &&
    !tapeIncomplete &&
    tapeEstimate === null;

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
    /*
     * NO `stack` ENTRY, round 3 Task 8. The weight-stack field is off the screen, so an error
     * about it would block Next on a message with no field to correct it in -- the exact defect
     * BLOCKED.goal's own comment records for the two alternative body-mass targets. `stackStep`
     * itself stays in the draft at its default and `confirm` still writes it; a default that
     * nothing can edit cannot become invalid.
     */
  };

  /**
   * Brief F Part 3: the walk-to-gym minutes field, required only while it is on screen (full
   * gym or full gym and home gym, and the user answered Yes). A generous sanity bound, mirroring
   * MAX_WALK_MINUTES in src/domain/schema.ts, not a claim about how far anyone should walk.
   */
  const walkMinutesError =
    showsGymCommute(draft.equipment) && draft.walksToGym
      ? requiredInRange(
          copy('quantity.walkMinutes', overrides),
          draft.walkMinutes,
          { lo: 1, hi: MAX_SESSION_DURATION_MIN },
          overrides,
          UNIT.minutes,
        )
      : null;

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

  /*
   * Brief I Part 2, round 1 claim C1.10.5. Same shape as targetMassError above and for the same
   * reason: optional, so an empty box is not an error, and bounded by NUTRITION_DOMAIN when it
   * holds a value, so the profile never stores a percentage the engine would refuse.
   */
  const targetBodyFatText = draft.targetBodyFat ?? '';
  const targetBodyFatError =
    targetBodyFatText.trim() === ''
      ? null
      : requiredInRange(
          copy('quantity.targetBodyFat', overrides),
          targetBodyFatText,
          NUTRITION_DOMAIN.bodyFatPct,
          overrides,
          UNIT.pct,
        );

  const targetDateError =
    draft.targetDate === '' || isValidLocalDate(draft.targetDate)
      ? null
      : t('error.valueRequired');

  /* ---- the goal step's derived model (Brief I Parts 1, 2 and 4) ---------------------------- */

  /**
   * The two axes, READ BACK OUT of the goal rather than stored beside it, and the goal the pair
   * derives. `GOAL_AXES_BY_KIND` and `GOAL_KIND_BY_AXES` are total in both directions, so this
   * round trip cannot produce a goal the engine has no rule for.
   */
  const axes = GOAL_AXES_BY_KIND[draft.goalKind];
  function setAxes(next: { fat?: FatAxis; muscle?: MuscleAxis }): void {
    const fat = next.fat ?? axes.fat;
    const muscle = next.muscle ?? axes.muscle;
    patch({ goalKind: GOAL_KIND_BY_AXES[fat][muscle] });
  }

  /**
   * Current fat mass and lean mass, from the body step's own body-fat percentage.
   *
   * Both are null unless BOTH inputs exist: a percentage with no mass beside it, or a mass with
   * no percentage, describes no composition at all. `bodyFatPct` is whichever route the body
   * step took, typed or tape, exactly as `Profile.body.baselineBodyFatPct` will store it.
   */
  const currentFatKg = massKg !== null && bodyFatPct !== null ? massKg * (bodyFatPct / 100) : null; // [kg]
  const currentLeanKg = massKg !== null && currentFatKg !== null ? massKg - currentFatKg : null; // [kg]

  /**
   * Brief I Part 2: the target is a BODY-FAT PERCENTAGE where an estimate exists to set it
   * against, and target body mass only where none does.
   *
   * "instead of having a 'target body mass' which is stupid... Target body mass can be muscle or
   * fat." It can, which is why the percentage is the better question, and why the fat mass and
   * lean mass it implies are shown beside it.
   */
  const bodyFatTargetAvailable = currentLeanKg !== null;
  const targetBodyFatPct = targetBodyFatError === null ? parseDecimal(targetBodyFatText) : null; // [%]

  /**
   * The body mass a body-fat target implies, HOLDING LEAN MASS.
   *
   *   target mass = current lean mass / (1 - target body fat / 100)      [kg]
   *
   * The assumption is stated, not hidden: lean mass held is what the prescribed fat-loss rate
   * targets in the first place (Garthe 2011's 0.7 %BW/week arm is the one that PRESERVED lean
   * body mass, at +2.1 +/- 0.4 %, where 1.4 %/wk lost it). It is algebra on that assumption and
   * on the definition of a percentage, not a coefficient: nothing here is fitted, borrowed or
   * interpolated, and `advice.targetBodyFatBasis` says so on the screen.
   *
   * Null at 100 % and above, where the expression has no positive root and the field's own
   * NUTRITION_DOMAIN bound has already rejected the value anyway.
   */
  const impliedTargetMassKg =
    currentLeanKg !== null && targetBodyFatPct !== null && targetBodyFatPct < 100
      ? currentLeanKg / (1 - targetBodyFatPct / 100)
      : null; // [kg]
  const impliedTargetFatKg =
    impliedTargetMassKg !== null && currentLeanKg !== null ? impliedTargetMassKg - currentLeanKg : null; // [kg]

  /**
   * The target the calendar measures a date against: the body-fat target's implied mass where
   * that route is open, the typed target body mass where it is not. One quantity, never both.
   */
  const typedTargetMassKg = targetMassError === null ? storedMassKg(draft.targetMass, draft.units) : null; // [kg]
  const effectiveTargetMassKg = bodyFatTargetAvailable ? impliedTargetMassKg : typedTargetMassKg; // [kg]

  /**
   * The band for one date, or the reason it has none. Every rule is in
   * `targetDateFeasibility` (src/domain/nutrition.ts), which reads FAT_LOSS_RATE_BOUND and
   * converts no kcal into any kg; this closure only supplies the horizon.
   *
   * Weeks are whole calendar days divided by seven, through `daysBetween`, which is zone-free
   * and DST-free. A fractional week is kept rather than rounded: rounding 3 days to 0 weeks
   * would make a required rate infinite, and rounding it to 1 would make a three-day target
   * look like a week's work.
   */
  function feasibilityOf(date: LocalDate): Feasibility {
    if (massKg === null) return { assessable: false, gap: 'no-target' };
    return targetDateFeasibility({
      goal: draft.goalKind,
      currentMassKg: massKg, // [kg]
      targetMassKg: effectiveTargetMassKg, // [kg] or null
      weeks: daysBetween(today, date) / 7, // [week]
    });
  }

  const targetDateFeasibilityResult: Feasibility | null =
    draft.targetDate !== '' && targetDateError === null ? feasibilityOf(draft.targetDate) : null;

  /** The month the grid is showing, and the days in it, Monday-aligned by leading blanks. */
  const calendarMonthStart = shiftMonth(today, monthOffset);
  const calendarDays = monthDays(calendarMonthStart);
  const calendarLeadingBlanks = isoWeekday(calendarMonthStart) - 1;

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
      bodyFatModeUnavailable ||
      tapeDomainError !== null ||
      tapeIncomplete ||
      tapeWithheld,
    /*
     * THE AVAILABILITY GUARDS MOVED OFF THIS STEP WITH THEIR FIELDS (round 3 Task 9). What is
     * left is the equipment half: the two load steps and the walk-to-the-gym minutes. A guard
     * has to sit on the step that RENDERS the field it guards, or Next is blocked by a message
     * the user cannot see -- which is what leaving these on `training` would now do.
     */
    training:
      Object.values(stepErrors).some((e) => e !== null) ||
      walkMinutesError !== null,
    /*
     * Only the target that is ON SCREEN can block the step. The two are alternatives, never both
     * (Brief I Part 2), so gating on whichever is hidden would stop Next on a message the user
     * cannot see or correct: a target body mass typed before a body-fat estimate existed stays
     * in the draft, and the field it belongs to is no longer rendered. Same re-gating rule
     * `gymCommute` and `homeEquipment` already follow at confirm, applied to the guard as well.
     *
     * THE AVAILABILITY GUARDS ARE HERE NOW, because the weekday, duration and weekly-target
     * fields render at the top of this step (round 3 Task 9). They keep the same rule they had
     * on the training step; only the step id changed.
     */
    goal:
      (bodyFatTargetAvailable ? targetBodyFatError : targetMassError) !== null ||
      targetDateError !== null ||
      weekdayError !== null ||
      availabilityDaysError !== null ||
      weeklyTargetError !== null ||
      Object.values(durationErrors).some((e) => e !== null),
    programme: weeksError !== null,
    guidance: false,
    /*
     * Brief M, claim r2.19: Confirm (gated through `confirmBlocked` below, which is
     * `STEPS.some((s) => BLOCKED[s])`) stays disabled until "Looks Good" is ticked. Review has no
     * Next button (it is the last step), so this reaches only `confirmBlocked` and the guard
     * `confirm()` itself repeats, never a Next control.
     */
    review: !reviewAcknowledged,
  };

  /*
   * Confirm writes every screen's answers at once, so it is gated on every screen's guard rather
   * than on the one the user is looking at. Reaching Review already requires each of them to have
   * passed; this closes the case where a value goes stale behind the user (a unit switch, a
   * weekday unchecked on the way back through) and keeps the store write off the invalid path.
   */
  const confirmBlocked = STEPS.some((s) => BLOCKED[s]);

  /**
   * The ids of EVERY invalid control on the body step, top to bottom, or an empty list when
   * nothing blocks it.
   *
   * Round 2 claim r2.16, second half, which is the real work of that claim: "Highlight the
   * textboxes that are missing info. So i dont have to click next over and over again until im
   * reminded of all of them." Round 1 marked one field per press, so a step with three blanks
   * took three presses to discover. This returns all of them, `handleFailedBodyNext` focuses the
   * FIRST (a caret can only be in one place) and `bodyNextAttempted` reveals every outstanding
   * message at once, which is what puts the white fill and the bold red border on all of them
   * together: setup.css marks on `aria-invalid`, and a message is what sets `aria-invalid`.
   *
   * BLOCKED.body, not this order, is still what actually gates the step.
   */
  function invalidBodyFieldIds(): readonly string[] {
    const ids: string[] = [];
    if (ageError !== null) ids.push('f-age');
    if (heightError !== null) ids.push(draft.units === 'metric' ? 'f-height-m' : 'f-height-ft');
    if (massError !== null) ids.push('f-mass');
    if (knownBodyFatError !== null) ids.push('f-bodyfat');
    if (draft.bodyFatMode === 'tape' && statedSex !== null) {
      if (girthError(draft.neck, overrides) !== null) ids.push('f-neck');
      if (girthError(draft.waist, overrides) !== null) ids.push('f-waist');
      if (statedSex === 'female' && girthError(draft.hip, overrides) !== null) ids.push('f-hip');
      // tapeDomainError and tapeWithheld are properties of the three girths TOGETHER rather than
      // of one field; the neck field is the first of the three and the reasonable landing spot.
      if ((tapeDomainError !== null || tapeWithheld) && !ids.includes('f-neck')) ids.push('f-neck');
    }
    return ids;
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
    // r2.16: every invalid field is marked, and the FIRST one is where the caret goes. The
    // marking is not done here: it follows from the messages this flag reveals, so a field cannot
    // be marked without also saying, in words, what is wrong with it.
    const targetId = invalidBodyFieldIds()[0] ?? null;
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
      // Brief G: the nine-stop slider's own PAL, preferred over `activity`'s band floor by
      // computeTargets whenever it is a number (it always is once the training step's default
      // has run; `?? null` only guards a draft resumed from a document written before this
      // field existed).
      activityPal: draft.activityPal ?? null,
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
    draft.activityPal,
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
    /*
     * Brief I Part 2. Where the body-fat route was open, the stored target mass is the one that
     * percentage IMPLIES at held lean mass, so the two stored fields describe one target rather
     * than two that can disagree. Where it was not, the typed target body mass is stored as
     * before and `targetBodyFatPct` stays null.
     */
    const targetMassKg = bodyFatTargetAvailable
      ? impliedTargetMassKg
      : storedMassKg(draft.targetMass, draft.units); // [kg]
    // [min] one way, stored only (Brief F Part 3). "0" whenever the field is not shown or the
    // answer is No, matching draft.walkMinutes's own reset on a No click.
    const walkMinutesTyped = parseDecimal(draft.walkMinutes);
    if (
      massKg === null ||
      heightCm === null ||
      birthYear === null ||
      barbellKg === null ||
      dumbbellPairKg === null ||
      stackKg === null
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
      // Brief G: the nine-stop slider's own PAL choice, stored alongside the band it implies.
      activityPal: draft.activityPal ?? null,
      experience: draft.experience,
      equipment: draft.equipment,
      equipmentSteps: {
        // Entered in the display unit, stored canonically in kg.
        barbellKg,
        dumbbellPairKg,
        stackKg,
      },
      // Brief F Part 3. Re-gated on showsGymCommute here, not just on draft.walksToGym: the
      // question and its Yes/No answer both live in draft state independent of the slider, so a
      // Yes given at Full gym must not survive into a stored profile whose final slider position
      // is Home gym, where the question was never shown for this confirm.
      gymCommute: {
        walks: showsGymCommute(draft.equipment) && draft.walksToGym,
        minutesEachWay:
          showsGymCommute(draft.equipment) && draft.walksToGym ? (walkMinutesTyped ?? 0) : 0, // [min]
      },
      // Same re-gating as gymCommute above, and for the same reason: an inventory ticked while
      // the slider sat somewhere it applied must not survive into a profile whose final slider
      // position no longer shows that question.
      homeEquipment: showsHomeEquipment(draft.equipment) ? draft.homeEquipment : [],
      bodyweightEquipment: draft.equipment === 'bodyweight' ? draft.bodyweightEquipment : [],
      goal: {
        /*
         * The DERIVED goal, and the only place either axis is recorded (Brief I Part 1,
         * decision goal-axes-derived-not-stored). The chooser reads its own two positions back
         * out of this field through GOAL_AXES_BY_KIND, so no axis is stored beside it.
         */
        kind: draft.goalKind,
        targetMassKg, // [kg] or null
        /*
         * Brief I Part 2, claim C1.10.5. This field has existed since the schema was written and
         * the wizard wrote null into it until now; the note that used to stand here said the
         * tape estimate's standard error is larger than any target a user would set against it.
         * That is still TRUE and it is now stated to the user instead of used to withhold the
         * field: `advice.targetBodyFatBasis` prints NAVY_SEE_PCT for the stated sex, live from
         * src/domain/bodyfat.ts, beside the target itself. The owner's objection is that a
         * target body mass cannot say whether it means muscle or fat, and a percentage can.
         */
        targetBodyFatPct: bodyFatTargetAvailable ? targetBodyFatPct : null, // [%] or null
        targetDate: draft.targetDate === '' ? null : draft.targetDate,
      },
      supplements: { creatine: draft.creatine },
      hydration: {
        /*
         * The SEEDED preference, not the published reference. With a stated sex the two are the
         * same figure; under `nd` the reference is a range and this field cannot hold one, so
         * `seedBeverageTargetML` (src/domain/nutrition.ts) owns that single conversion and states
         * why it takes the low end. The reference itself is shown to the user as the range, on
         * the review screen below and in Settings. Editable afterwards in Settings either way.
         */
        dailyTargetML: seedBeverageTargetML(draft.sex), // [mL/day]
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
            {timeZoneOptions.length > 0 ? (
              <>
                {/*
                 * The search box, above the list rather than beside it: the list shows 59 rows
                 * and the search reads all 418 zones, so this is how a user in one of the
                 * collapsed cities finds their group (round 2, r2.09). An IANA id is
                 * case-sensitive and contains no words, and so does what a user types towards
                 * one: autocapitalising, autocorrecting or spell-checking it can only get in
                 * the way. type="search" rather than type="text" so a phone offers the clear
                 * control and a search-shaped keyboard.
                 */}
                <label htmlFor="f-timezone-search">{t('label.timezoneSearch')}</label>
                <input
                  id="f-timezone-search"
                  type="search"
                  value={zoneQuery}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => {
                    setZoneQuery(e.target.value);
                  }}
                />
                <p className="wiz-note">{t('advice.timezoneGrouped')}</p>
                {/*
                 * The lead-in sits with the LIST, not at the top of the field group: it says
                 * "Select from the drop down menu:" and the first control in the group is now
                 * the search box, which is not one.
                 */}
                <p className="wiz-label">{t('advice.timezonePick')}</p>
                <label htmlFor="f-timezone">{t('label.timezone')}</label>
                {/*
                 * A closed choice from the platform's own list (C1.06.2), grouped by year-round
                 * behaviour and SORTED BY OFFSET, most negative first, which is the defect
                 * r2.09 reported. Each row carries both abbreviations, because Europe says GMT:
                 * "(UTC/GMT-05:00) America/New_York". The VALUE is the representative's IANA id
                 * and never an offset: the offset is a property a zone has today, not its
                 * identity (src/domain/dates.ts carries the measurement that refuses one row
                 * per offset).
                 */}
                <select
                  id="f-timezone"
                  value={draft.timezone}
                  aria-invalid={timezoneError !== null}
                  aria-describedby={timezoneError === null ? undefined : 'f-timezone-error'}
                  onChange={(e) => {
                    patch({ timezone: e.target.value });
                  }}
                >
                  {shownTimeZoneRows.map((row) => (
                    <option key={row.zone} value={row.zone}>
                      {row.label}
                    </option>
                  ))}
                </select>
                {/*
                 * The chosen row is never filtered out, so this is reached only when a search
                 * matched nothing else: the list is not empty, it is down to the one row the
                 * user already has.
                 */}
                {shownTimeZoneRows.length === 1 && zoneQuery.trim() !== '' && (
                  <p className="wiz-note">{t('advice.timezoneNoMatch')}</p>
                )}
              </>
            ) : (
              /*
               * Reached only when the platform has no Intl.supportedValuesOf('timeZone') to
               * build the select's options from, or it throws (both treated as "no list" by
               * `timeZoneOptions` above). An IANA identifier is case-sensitive and contains no
               * words: autocapitalising, autocorrecting or spell-checking it can only corrupt
               * it.
               */
              <>
                <p className="wiz-label">{t('advice.timezonePick')}</p>
                <label htmlFor="f-timezone">{t('label.timezone')}</label>
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
              </>
            )}
            {timezoneError !== null && (
              <p className="wiz-error" id="f-timezone-error">
                {timezoneError}
              </p>
            )}
          </div>

          {/*
           * The bordered box r2.09 asks for, below the field: "have a seperate bordered textbox
           * below that say: Heading 'Important: Time Functions' (rework the title). Then below
           * it says in 2 bullet points where we need this."
           *
           * The first bullet is the one he asked to stand out ("*make this bold/underlined/ make
           * it stand out*"). The emphasis is `.wiz-tz-primary` in setup.css, drawn from tokens,
           * never a mark written into the copy string and never a hex literal.
           */}
          <div className="wiz-box wiz-tz-why">
            <h3 className="wiz-box-title">{t('hero.timezoneWhy')}</h3>
            <ul className="wiz-tz-why-list">
              <li className="wiz-tz-primary">
                <strong>{t('label.timezoneDayBoundary')}</strong> {t('advice.timezoneDayBoundary')}
              </li>
              <li>
                <strong>{t('label.timezoneReminders')}</strong> {t('advice.timezoneReminders')}
              </li>
            </ul>
          </div>
        </fieldset>
      )}

      {step === 'body' && (
        /* `wiz-step-body` scopes r2.16's invalid-field mark to the step the claim was filed
           against; setup.css keys the mark on aria-invalid inside it. */
        <fieldset className="wiz-step-body">
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

          {/*
           * r2.11: "Let's make the name box print the name with the skins overall theme, just to
           * distinguish it aesthetically and make it more 'fun'." STYLE ONLY. The value is the
           * user's own text and nothing here alters it: no capitalisation, no trimming for
           * display, no substitution. `wiz-name` sets the skin's display face and accent through
           * tokens, so limelight, clinical and board each resolve their own.
           */}
          <div className="wiz-field">
            <label htmlFor="f-name">{t('label.name')}</label>
            <input
              id="f-name"
              className="wiz-name"
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
                {/*
                 * r2.11: "we need to allow the user to click on what they have selected again and
                 * deselect it if they don't feel comfortable picking one." Clicking the checked
                 * option clears the group back to `nd`.
                 *
                 * WHY THE HANDLER IS SPLIT ACROSS onChange AND onClick. A radio that is already
                 * checked fires no `change` event when it is clicked again, in every engine and in
                 * jsdom, so a deselect can only be seen on `click`. The two cannot double-fire:
                 * `click` runs first and reads React state that has not moved yet, so on an
                 * UNCHECKED option its guard is false and only `onChange` acts, while on the
                 * CHECKED option `onChange` never runs at all.
                 */}
                <div className="wiz-choice" role="radiogroup" aria-labelledby="sex-label">
                  {(['male', 'female'] as const).map((value) => (
                    <label key={value} className="wiz-glyph">
                      <input
                        type="radio"
                        name="sex"
                        checked={draft.sex === value}
                        onChange={() => {
                          selectSex(value);
                        }}
                        onClick={() => {
                          if (draft.sex === value) selectSex('nd');
                        }}
                      />
                      <span aria-hidden="true" className="wiz-glyph-mark" data-sex={value} />
                      {t(value === 'male' ? 'label.sexMale' : 'label.sexFemale')}
                    </label>
                  ))}
                </div>
                {/*
                 * The third state, named. `nd` is the default (A1), so this is what the step opens
                 * showing, and a group with nothing checked is otherwise indistinguishable from a
                 * group that failed to render. It is a live region because clearing the selection
                 * is a state change a screen reader would otherwise get no announcement of: the
                 * radios simply stop being checked.
                 */}
                <p className="wiz-note" role="status" data-testid="sex-state">
                  {draft.sex === 'nd' ? t('label.sexNotDisclosed') : t('advice.sexDeselect')}
                </p>
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
                  {/* Entry 4 of the reference list below: one numbering scheme, r2.15(ii). */}
                  <sup>4</sup>
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
           * THE BODY-FAT BOX, r2.13(i): "Put the Body fat also in a bordered box. That box should
           * have everything w.r.t. the souces and body fat."
           *
           * Round 1 claims C1.08.1 to C1.08.4 and C1.08.7 still hold inside it: percentage entry
           * first and pre-selected (initialDraft), and no obesity or category classification
           * anywhere (numbers only, and none is rendered). What round 2 moves is the ORDER inside
           * the box, r2.13(iii) and (iv): "Optional. With it..." sits ABOVE the percentage field
           * and "Click here to estimate" BELOW it. Plan ruling D2.13.3/D2.13.4 records that this
           * is not a contradiction of round 1, which was about the mode radio group rather than
           * about the number field.
           *
           * The `why?` disclosures that used to explain the field are gone, r2.13(ii): "Let's
           * remove the Why?. We can replace that element with just citation superscripts. For
           * example Percentage^2." The superscripts below are those, and they point into the one
           * reference list at the foot of the step.
           */}
          <div className="wiz-box wiz-box-bodyfat">
            <p className="wiz-label" id="bodyfat-box-label">
              {t('label.bodyFat')}
            </p>

            <div className="wiz-choice" role="radiogroup" aria-labelledby="bodyfat-box-label">
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
                {/* r2.13(ii), his own example: "Percentage^2". Entry 2 is Cunningham, the
                    equation a percentage actually buys the user. */}
                <sup>2</sup>
              </label>
              {/*
               * Decision A1, second consequence: `nd` DISABLES the tape route. "Show the option,
               * disabled, with one line saying why. Do not hide it."
               *
               * `aria-disabled` and a refused handler, not the `disabled` attribute: a disabled
               * input is removed from the tab order, so a screen-reader user arrows past it and
               * never hears the reason. This way the control keeps focus, keeps its accessible
               * description, and announces itself as unavailable. The handler still refuses the
               * selection, so the state cannot be reached by keyboard either.
               */}
              <label className="wiz-inline" aria-disabled={bodyFatRequired}>
                <input
                  type="radio"
                  name="bodyfat"
                  checked={draft.bodyFatMode === 'tape'}
                  aria-disabled={bodyFatRequired}
                  aria-describedby={bodyFatRequired ? BODYFAT_ND_REASON_ID : undefined}
                  onChange={() => {
                    if (bodyFatRequired) return;
                    patch({ bodyFatMode: 'tape', bodyFatSource: 'tape' });
                  }}
                />
                {t('label.bodyFatTape')}
                {/*
                 * Round 3 Task 3, the owner: "it just seems unresponsive." `aria-disabled` alone
                 * is announced but not SEEN, so the refusal had no visible cause. This is the
                 * cause, in italic, beside the control it refuses. It is not aria-hidden: read
                 * out, it turns the option's accessible name into "Body Measurements (Needs
                 * Biological Sex)", which is the same sentence the sighted user gets.
                 */}
                {bodyFatRequired && (
                  <em className="wiz-needs">{t('label.needsBiologicalSex')}</em>
                )}
              </label>
              <label className="wiz-inline" aria-disabled={bodyFatRequired}>
                <input
                  type="radio"
                  name="bodyfat"
                  checked={draft.bodyFatMode === 'none'}
                  aria-disabled={bodyFatRequired}
                  aria-describedby={bodyFatRequired ? BODYFAT_ND_REASON_ID : undefined}
                  onChange={() => {
                    if (bodyFatRequired) return;
                    patch({ bodyFatMode: 'none' });
                  }}
                />
                {t('label.bodyFatNone')}
                {/* The same hint on the same terms: decision A1 refuses this option under `nd`
                    for the identical reason, so leaving it greyed and unexplained would leave
                    half of the owner's complaint standing. */}
                {bodyFatRequired && (
                  <em className="wiz-needs">{t('label.needsBiologicalSex')}</em>
                )}
              </label>
            </div>
            {/* The one line saying why, wired to both refused controls by aria-describedby so it
                is announced rather than merely greyed. */}
            {bodyFatRequired && (
              <p className="wiz-note" id={BODYFAT_ND_REASON_ID} data-testid="bodyfat-nd-reason">
                {t('advice.tapeNeedsSex')}
              </p>
            )}

            {draft.bodyFatMode === 'known' && (
              <>
                {/* r2.13(iii): above the field it explains. Under `nd` it is not optional at
                    all, and the line says which of the two situations the user is in. */}
                <p className="wiz-note" data-testid="bodyfat-optional">
                  {bodyFatRequired ? t('advice.bodyFatRequiredND') : t('advice.bodyFatOptional')}
                </p>
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
                {/* r2.13(iv): below the field it fills. */}
                <button
                  type="button"
                  className="wiz-link"
                  onClick={() => {
                    setBodyFatChartOpen(true);
                  }}
                >
                  {t('advice.estimateBodyFat')}
                </button>
              </>
            )}

            {draft.bodyFatMode === 'tape' && statedSex !== null && (
              <>
                {/*
                 * r2.14, last sentence: "if the tape measurement are used as a way to estimate
                 * the Body Fat, right now that's now clear. You would need to have a Body Fat
                 * Estimate as a subheading." This is that subheading, and it carries entry 3's
                 * superscript because entry 3 is the method it runs.
                 */}
                <h3 className="wiz-subheading">
                  {t('label.bodyFatEstimate')}
                  <sup>3</sup>
                </h3>
                <p className="wiz-note">{t('advice.tapeMethod')}</p>

                {/*
                 * r2.14(ii): "make the Neck image call out be next to the Neck textbox. Like a 2
                 * column array. Similar change for the other measurements." Each girth is its own
                 * two-column row, input beside diagram, rather than one stack of inputs followed
                 * by one stack of pictures.
                 *
                 * ALREADY SEX-CONDITIONED BEFORE ROUND 2, and verified rather than rebuilt: the
                 * waist label has always swapped between Abdomen II (male) and Abdomen I (female)
                 * and the hip field has always been female-only, because the two Navy equations
                 * read different sites. What round 2 adds is the `nd` branch above, which is why
                 * this whole block sits behind `statedSex !== null`.
                 */}
                <div className="wiz-row wiz-row-site">
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
                  {/* The caption is the site description the NHRC reports print, so the
                      instruction sits beside the field it governs rather than behind a
                      disclosure (r2.14(ii), and B15: a caption is what a screen reader gets
                      while the artwork is a frame). NAVY_SITE_LABEL names no neck site. */}
                  <ArtworkPlaceholder label={t('quantity.neck')} className="wiz-site" />
                </div>

                <div className="wiz-row wiz-row-site">
                  <UnitInput
                    id="f-waist"
                    quantity={
                      statedSex === 'male' ? t('quantity.abdomenII') : t('quantity.abdomenI')
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
                    label={withoutDashConnector(NAVY_SITE_LABEL[statedSex].waist)}
                    className="wiz-site"
                  />
                </div>

                {statedSex === 'female' && (
                  <div className="wiz-row wiz-row-site">
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
                    <ArtworkPlaceholder
                      label={withoutDashConnector(NAVY_SITE_LABEL.female.hip ?? '')}
                      className="wiz-site"
                    />
                  </div>
                )}

                <p className="wiz-note" data-testid="bodyfat-estimate">
                  {tapeIncomplete
                    ? statedSex === 'female'
                      ? t('advice.tapeNeedFemale')
                      : t('advice.tapeNeedMale')
                    : tapeEstimate === null
                      ? t('advice.tapeOutOfDomain')
                      : FORMAT.bodyFatEstimate(tapeEstimate, NAVY_SEE_PCT[statedSex])}
                </p>
                {/*
                 * The standard error, in words, on the face rather than behind a `why?`.
                 * r2.13(ii) removes the disclosure CONTROL; it does not remove this caveat, and
                 * this one is not arithmetic (R9 sends derivations behind a disclosure, and there
                 * is none here). It says what the number after the plus-or-minus sign is and why
                 * the figure is for tracking change rather than for reading absolutely, which is
                 * the caveat src/domain/bodyfat.ts requires the UI to print beside the estimate.
                 */}
                {tapeEstimate !== null && (
                  <p className="wiz-note" data-testid="bodyfat-why">
                    {t('why.bodyFatEstimate')}
                  </p>
                )}
                {/* One estimate, three girths: described by each of the fields that produced it. */}
                {tapeDomainError !== null && (
                  <p className="wiz-error" id={TAPE_ERROR_ID}>
                    {tapeDomainError}
                  </p>
                )}

                {/*
                 * r2.14(iii): "Move the Why? hidden box, below the US Navy Ci... text and rename
                 * it as Disclaimer." A NEW key, per plan ruling D2.14.3: `disclosure.why` has six
                 * call sites across the app and renaming it would relabel every one of them.
                 *
                 * The old contents, which named which girth to enter where, are GONE rather than
                 * moved: the fields above now say it themselves, and they change with the sex.
                 * The superscript is entry 3, the method whose fields differ by sex, which is the
                 * citation his own text asked for after "in this method".
                 */}
                <details>
                  <summary>{t('disclosure.disclaimer')}</summary>
                  <p className="wiz-note" data-testid="tape-disclaimer">
                    {BODY_TAPE_DISCLAIMER}
                    <sup>3</sup>
                  </p>
                </details>
              </>
            )}
          </div>

          {/*
           * THE WEIGH-IN OPT-IN, round 3 Task 9. It sat on the goal step, beside a target date;
           * it belongs here, on the step the user is already measuring themselves on.
           *
           * IT IS NOT DECORATION, and the copy says so rather than calling itself optional and
           * stopping. src/ui/views/TrainView.tsx gates the pre- and post-session mass prompts on
           * `hydration.weighInOptIn`, and src/domain/training/hydration.ts computes Sawka 2007's
           * "> 2 % body mass" comparison from exactly those two entries: with the opt-in off the
           * prompts never appear and the flag can never be raised. It does NOT touch the energy
           * or macro targets, which re-derive from any body-mass entry either way.
           */}
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
          {/* His own reassurance, tightened rather than replaced. */}
          <p className="wiz-note">{t('advice.weighInReassurance')}</p>

          {/*
           * THE REFERENCE LIST, r2.15. One collapsible box at the foot of the step, in the
           * pattern the `why?` disclosures already use, holding every citation the step prints.
           *
           * Round 1 claim C1.07.5 asked for the methods here and "do not be expansive, just
           * transparent"; r2.15 keeps that and fixes the format. Two things changed:
           *
           *   ONE NUMBERING SCHEME. It used to be an <ol> whose items carried superscripts of
           *   their own, so entry two read "2. (1) Body-fat percentage...". It is a <ul> now and
           *   the superscript IS the entry number, unique across the list and the same number
           *   printed beside the field above.
           *
           *   A BOLD LEAD SENTENCE ABOVE EACH CITATION, consistently, r2.15(iii). That is
           *   `BodyEquation.computes`, which already was that sentence for most rows.
           *
           * The last entry is the hormone-therapy source, moved out of the sex explainer by
           * r2.12(v) so that every citation on this step is in one place. It lives in
           * sexRationale.ts rather than in bodyEquations.ts because no engine in this repository
           * implements a hormone-therapy adjustment, and bodyEquations.test.ts requires every DOI
           * in that module to appear in the engine that uses it.
           */}
          <details className="wiz-refs" data-testid="references">
            <summary>{t('disclosure.references')}</summary>
            <p className="wiz-note">{BODY_EQUATIONS_LEAD}</p>
            <ul className="wiz-cite-list">
              {BODY_EQUATIONS.map((eq) => (
                <li key={eq.marker}>
                  <p className="wiz-cite-lead">
                    <sup>{eq.marker}</sup> {eq.computes}
                  </p>
                  <span className="wiz-cite-src">{eq.source}</span>
                </li>
              ))}
              <li key="hrt">
                <p className="wiz-cite-lead">
                  <sup>{BODY_EQUATIONS.length + 1}</sup> {SEX_RATIONALE_HRT_SOURCE_LEAD}
                </p>
                <span className="wiz-cite-src">{SEX_RATIONALE_HRT_SOURCE}</span>
              </li>
            </ul>
          </details>
        </fieldset>
      )}

      {step === 'training' && (
        <fieldset>
          <StepHeading title={t(STEP_TITLE_KEY.training)} headingRef={headingRef} />

          {activityLevelsOpen && (
            <ActivityLevelsModal
              onClose={() => {
                setActivityLevelsOpen(false);
              }}
            />
          )}

          {/* Brief G: Everyday Activity Level, widened from Brief F Part 1a's 3-position slider
              to nine stops, three per FAO/WHO/UNU 2004 band -- ACTIVITY_STOP_OPTIONS above,
              read from src/domain/nutrition.ts's ACTIVITY_STOPS. Interpolating BETWEEN bands to
              invent a new category is still forbidden, exactly as it was at three positions:
              every one of the nine values is printed in the same Table 5.3 the three bands
              already cite. Choosing a stop sets `activity` (the band) and `activityPal` (the
              stop) together in one patch, never independently. */}
          <div className="wiz-field wiz-slider">
            <label htmlFor="f-activity">{t('label.activity')}</label>
            <input
              id="f-activity"
              type="range"
              min={0}
              max={ACTIVITY_STOP_OPTIONS.length - 1}
              step={1}
              value={sliderIndexOf(ACTIVITY_STOP_OPTIONS, draft.activityPal ?? ACTIVITY_FACTOR.moderate)}
              onChange={(e) => {
                const pal = sliderValueAt(ACTIVITY_STOP_OPTIONS, e.target.value, ACTIVITY_FACTOR.moderate);
                const level =
                  ACTIVITY_STOP_OPTIONS.find((option) => option.value === pal)?.level ?? 'moderate';
                patch({ activity: level, activityPal: pal });
              }}
            />
            {/*
             * ROUND 3 TASK 5: a tick at each of the nine stops, aligned to the THUMB centres.
             *
             * One span per member of ACTIVITY_STOP_OPTIONS, so the count is the slider's own and
             * a tenth stop added to src/domain/nutrition.ts's ACTIVITY_STOPS grows a tenth tick
             * rather than leaving nine ticks under ten positions.
             *
             * `aria-hidden`, and no live region of its own: the position this control is at is
             * already announced by `.wiz-slider-position` below, which is the live region. A
             * second announcement of the same state is noise, not access.
             */}
            <div className="wiz-slider-ticks" aria-hidden="true">
              {ACTIVITY_STOP_OPTIONS.map((option) => (
                <span key={option.value} className="wiz-slider-tick" />
              ))}
            </div>
            {/* THE BAND AND THE STOP, both. Brief G widened this control to nine stops and
                left the readout showing only the band, so the three stops inside a band were
                indistinguishable and six of nine positions changed nothing a user could see.
                The band still names the FAO/WHO/UNU category the number comes from; the sentence
                below it is what actually differs from one stop to the next. Both sit in the one
                live region so a screen reader announces the change once, not twice. */}
            <p className="wiz-slider-position" aria-live="polite">
              {t(
                ACTIVITY_LEVEL_LABEL_KEY[
                  ACTIVITY_STOP_OPTIONS[
                    sliderIndexOf(ACTIVITY_STOP_OPTIONS, draft.activityPal ?? ACTIVITY_FACTOR.moderate)
                  ]?.level ?? 'moderate'
                ],
              )}
              <span className="wiz-slider-stop">
                {ACTIVITY_STOP_EXAMPLES[draft.activityPal ?? ACTIVITY_FACTOR.moderate] ?? ''}
              </span>
            </p>
            <details>
              <summary>{t('disclosure.examples')}</summary>
              {ACTIVITY_LEVEL_EXAMPLES.map((line) => (
                <p key={line} className="wiz-note">
                  {line}
                </p>
              ))}
            </details>
            {/* Brief G's callout: a text link under the slider opening the same ModalShell the
                sex explainer uses, with the FAO/WHO/UNU citation and the full nine-stop table. */}
            <button
              type="button"
              className="wiz-link"
              onClick={() => {
                setActivityLevelsOpen(true);
              }}
            >
              {t('advice.activityLevelsSource')}
            </button>
          </div>

          {/*
           * GYM COMFORT, round 3 Task 6. The owner: "Gym comfort should not a slider, I think it
           * should just be a selection of image boxes, just like the gender option."
           *
           * SO IT IS THE SEX CONTROL'S SHAPE, not a second picker pattern invented beside it:
           * `.wiz-choice[role=radiogroup]` labelled by its own `.wiz-label`, one `.wiz-glyph`
           * label per option, the mark as an `aria-hidden` <span> before the text. A <span> and
           * not `ArtworkPlaceholder`, which renders a <div> and a <p>: a <label>'s content model
           * is phrasing content, so a paragraph inside it is invalid markup, and the sex control
           * puts a bare <span> there for the same reason. The option's own text is the caption.
           *
           * `Experience` is untouched. This is a CONTROL change: the stored type still has its
           * three values and `draft.experience` still holds one of them.
           *
           * The artwork does not exist and is the owner's to draw. Each frame names its
           * docs/design/2026-09-04-icon-register.csv row in `data-icon-row` and draws nothing:
           * comfort-1-starting, comfort-2-machines, comfort-3-freeweights.
           */}
          <div className="wiz-field">
            <p className="wiz-label" id="experience-label">
              {t('label.experience')}
            </p>
            <div className="wiz-choice" role="radiogroup" aria-labelledby="experience-label">
              {EXPERIENCE_OPTIONS.map((o) => (
                <label key={o.value} className="wiz-glyph wiz-glyph-boxed">
                  <input
                    type="radio"
                    name="experience"
                    checked={draft.experience === o.value}
                    onChange={() => {
                      patch({ experience: o.value });
                    }}
                  />
                  <span
                    aria-hidden="true"
                    className="wiz-option-frame"
                    data-icon-row={o.iconRow}
                  />
                  {t(o.labelKey)}
                </label>
              ))}
            </div>
          </div>

          {/* Brief F Part 1c: Equipment Access, 5 positions. The two combination positions
              carry no exercise tag of their own; see EQUIPMENT_ACCESS_OPTIONS's own comment. */}
          <div className="wiz-field wiz-slider">
            <label htmlFor="f-equipment-access">{t('label.equipmentAccess')}</label>
            <input
              id="f-equipment-access"
              type="range"
              min={0}
              max={EQUIPMENT_ACCESS_OPTIONS.length - 1}
              step={1}
              value={sliderIndexOf(EQUIPMENT_ACCESS_OPTIONS, draft.equipment)}
              onChange={(e) => {
                patch({
                  equipment: sliderValueAt(EQUIPMENT_ACCESS_OPTIONS, e.target.value, 'full-gym'),
                });
              }}
            />
            {/*
             * ROUND 3 TASK 7: one marker per position, and the start, the middle and the end
             * carry a placeholder icon frame instead of a plain marker (EQUIPMENT_ICON_INDICES
             * above derives which three). The frames are empty: the artwork is the owner's, and
             * each names its docs/design/2026-09-04-icon-register.csv row in `data-icon-row`
             * rather than drawing, generating or substituting a character for it.
             *
             * `aria-hidden` for the same reason the activity ticks are: the position is already
             * announced by the live region below.
             */}
            <div className="wiz-slider-ticks" aria-hidden="true">
              {EQUIPMENT_ACCESS_OPTIONS.map((o, i) =>
                EQUIPMENT_ICON_INDICES.includes(i) ? (
                  <span key={o.value} className="wiz-slider-tick-icon" data-icon-row={o.iconRow} />
                ) : (
                  <span key={o.value} className="wiz-slider-tick" />
                ),
              )}
            </div>
            <p className="wiz-slider-position" aria-live="polite">
              {t(EQUIPMENT_ACCESS_OPTIONS[sliderIndexOf(EQUIPMENT_ACCESS_OPTIONS, draft.equipment)]?.labelKey ?? 'option.accessFullGym')}
            </p>
            {/* Round 3 Task 7, last point: the per-position example sentence stays, and still
                changes with the position. */}
            <p className="wiz-note">{EQUIPMENT_ACCESS_EXAMPLES[draft.equipment]}</p>
          </div>

          {/* Brief F Part 3: "Do you walk to and from the gym?", Full gym or Full gym and home
              gym only. Answer is STORED and feeds NO energy calculation -- see 1a above for why:
              the PAL band already counts it. */}
          {showsGymCommute(draft.equipment) && (
            <div className="wiz-field">
              <p className="wiz-label" id="walk-to-gym-label">
                {t('advice.walkToGym')}
              </p>
              <div className="wiz-choice" role="radiogroup" aria-labelledby="walk-to-gym-label">
                <label className="wiz-glyph">
                  <input
                    type="radio"
                    name="walks-to-gym"
                    checked={draft.walksToGym}
                    onChange={() => {
                      patch({ walksToGym: true });
                    }}
                  />
                  {t('button.yes')}
                </label>
                <label className="wiz-glyph">
                  <input
                    type="radio"
                    name="walks-to-gym"
                    checked={!draft.walksToGym}
                    onChange={() => {
                      // No sets it to zero (Brief F Part 3), not to blank: the field carries no
                      // meaning once the answer is No.
                      patch({ walksToGym: false, walkMinutes: '0' });
                    }}
                  />
                  {t('button.no')}
                </label>
              </div>
              {draft.walksToGym && (
                <UnitInput
                  id="f-walk-minutes"
                  quantity={t('quantity.walkMinutes')}
                  unit={UNIT.minutes}
                  inputMode="numeric"
                  value={draft.walkMinutes}
                  error={walkMinutesError}
                  onChange={(v) => {
                    patch({ walkMinutes: v });
                  }}
                />
              )}
            </div>
          )}

          {/* Brief F Part 3: "What equipment do you have?", Home gym or either combination that
              includes it. Multi-select: a non-contiguous inventory (a light dumbbell pair and a
              heavy one, nothing between) is uncommon but real, so nothing here is exclusive. */}
          {showsHomeEquipment(draft.equipment) && (
            <div className="wiz-field">
              <p className="wiz-label" id="home-equipment-label">
                {t('advice.equipmentInventoryPrompt')}
              </p>
              <div role="group" aria-labelledby="home-equipment-label">
                <p className="wiz-label">{t('label.homeEquipmentAerobic')}</p>
                <div className="wiz-choice">
                  {HOME_AEROBIC_OPTIONS.map((o) => (
                    <label key={o.value} className="wiz-glyph">
                      <input
                        type="checkbox"
                        checked={draft.homeEquipment.includes(o.value)}
                        onChange={() => {
                          patch({ homeEquipment: toggleItem(draft.homeEquipment, o.value) });
                        }}
                      />
                      {t(o.labelKey)}
                    </label>
                  ))}
                </div>
                <p className="wiz-label">{t('label.homeEquipmentDumbbells')}</p>
                <div className="wiz-choice">
                  {HOME_DUMBBELL_BANDS.map((band) => (
                    <label key={band.value} className="wiz-glyph">
                      <input
                        type="checkbox"
                        checked={draft.homeEquipment.includes(band.value)}
                        onChange={() => {
                          patch({ homeEquipment: toggleItem(draft.homeEquipment, band.value) });
                        }}
                      />
                      {band.hi === null
                        ? FORMAT.dumbbellBandOpen(band.lo, loadLabelUnit)
                        : FORMAT.dumbbellBand(band.lo, band.hi, loadLabelUnit)}
                    </label>
                  ))}
                </div>
                <p className="wiz-label">{t('label.homeEquipmentMachines')}</p>
                <div className="wiz-choice">
                  {HOME_MACHINE_OPTIONS.map((o) => (
                    <label key={o.value} className="wiz-glyph">
                      <input
                        type="checkbox"
                        checked={draft.homeEquipment.includes(o.value)}
                        onChange={() => {
                          patch({ homeEquipment: toggleItem(draft.homeEquipment, o.value) });
                        }}
                      />
                      {t(o.labelKey)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Brief F Part 3: Body weight only, its own flat multi-select. Nothing reads either
              list yet; that wiring is a later task. */}
          {draft.equipment === 'bodyweight' && (
            <div className="wiz-field">
              <p className="wiz-label" id="bodyweight-equipment-label">
                {t('advice.equipmentInventoryPrompt')}
              </p>
              <div
                className="wiz-choice"
                role="group"
                aria-labelledby="bodyweight-equipment-label"
              >
                {BODYWEIGHT_EQUIPMENT_OPTIONS.map((o) => (
                  <label key={o.value} className="wiz-glyph">
                    <input
                      type="checkbox"
                      checked={draft.bodyweightEquipment.includes(o.value)}
                      onChange={() => {
                        patch({
                          bodyweightEquipment: toggleItem(draft.bodyweightEquipment, o.value),
                        });
                      }}
                    />
                    {t(o.labelKey)}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/*
           * THE LOAD-STEP FIELDS, round 3 Task 8. His paragraph, in six parts:
           *
           *   1. "should appear ONLY when home gym and above is selected" -- `showsLoadSteps`
           *      above, and see its comment for why the cut sits where it does.
           *   2. "should come after the 'what equipment do you have'" -- they are last on the
           *      step now, below every equipment question, rather than above all of them.
           *   3. "Right now the three textboxes are 1 column, 3 rows. remake it so it is 1 row 2
           *      columns" -- `.wiz-row-tight`, which is the one row rule that stays two columns
           *      below the 560 px breakpoint (a bare `.wiz-row` collapses to one there).
           *   4. "Just have a title above them 'Load Step'" -- `label.loadStep`, R14.
           *   5. "below 'Dumbbell' and the other 'Plates'" -- in that order, left to right.
           *   6. "We don't need 3. Machine increment is standardized anyways." The weight-stack
           *      field is GONE. `Profile.equipmentSteps.stackKg` is NOT: it is a stored field,
           *      it keeps its existing default (`initialDraft`, and the unit reseed above), and
           *      `confirm` still writes it. Removing a stored field nothing will write is a
           *      migration, and `schemaVersion` stays 3.
           */}
          {showsLoadSteps(draft.equipment) && (
            <div className="wiz-box">
              <p className="wiz-label">{t('label.loadStep')}</p>
              <div className="wiz-row wiz-row-tight">
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
                  id="f-barbell-step"
                  quantity={t('quantity.barbellStep')}
                  unit={loadLabelUnit}
                  value={draft.barbellStep}
                  error={stepErrors.barbell}
                  onChange={(v) => {
                    patch({ barbellStep: v });
                  }}
                />
              </div>
              <p className="wiz-note">{t('advice.loadSteps')}</p>
            </div>
          )}
        </fieldset>
      )}

      {/*
       * AVAILABILITY, now the FIRST thing on the goal step (round 3 Task 9). The owner asked
       * what step 4 still holds; this is the half that left it.
       *
       * THIS DOES NOT UNDO C1.10.8, which is "if I choose an unrealistic goal and a 2 day
       * target, who will tell me that im being delusional?". What that claim requires is that
       * the training frequency is KNOWN before the target date is chosen, and it still is: this
       * block renders above the target-date field and the feasibility calendar on the same
       * screen, and `feasibilityOf` reads `draft.sessionsPerWeek` at render, not at step change.
       * The step COUNT is unchanged; the wizard is still the eight steps STEPS declares.
       *
       * A SEPARATE `step === 'goal'` block rather than one merged fieldset, and it carries the
       * step's heading because it is now the first thing on the step: each group keeps its own
       * <fieldset>, exactly as the training step's two groups did.
       */}
      {step === 'goal' && (
        <fieldset>
          <StepHeading title={t(STEP_TITLE_KEY.goal)} headingRef={headingRef} />

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
      {/* The goal itself, below the availability block that now opens this step. */}
      {step === 'goal' && (
        <fieldset>
          {/*
            Brief I Part 1, round 1 claims C1.10.2 to C1.10.6. The owner: "The way the 'Goal' is
            seperated is exclusionary. Recomposition and fat loss are not exclusionary."

            They are not, so the exclusive menu is gone and the two questions underneath it are
            asked instead. Radios, not a select: the whole point is that the user sees both axes
            at once and reads the pair, which a collapsed menu hides. Each group is a
            `radiogroup` labelled by its own heading, and the label element around each radio is
            the 44 px tap target (setup.css, `.wiz-inline`).
          */}
          <div className="wiz-field">
            <p className="wiz-label" id="f-fat-axis-label">
              {t('label.fatAxis')}
            </p>
            <div role="radiogroup" aria-labelledby="f-fat-axis-label">
              {FAT_AXIS_OPTIONS.map((o) => (
                <label className="wiz-inline" key={o.value}>
                  <input
                    type="radio"
                    name="f-fat-axis"
                    value={o.value}
                    checked={axes.fat === o.value}
                    onChange={() => {
                      setAxes({ fat: o.value });
                    }}
                  />
                  {t(o.labelKey)}
                </label>
              ))}
            </div>
          </div>

          <div className="wiz-field">
            <p className="wiz-label" id="f-muscle-axis-label">
              {t('label.muscleAxis')}
            </p>
            <div role="radiogroup" aria-labelledby="f-muscle-axis-label">
              {MUSCLE_AXIS_OPTIONS.map((o) => (
                <label className="wiz-inline" key={o.value}>
                  <input
                    type="radio"
                    name="f-muscle-axis"
                    value={o.value}
                    checked={axes.muscle === o.value}
                    onChange={() => {
                      setAxes({ muscle: o.value });
                    }}
                  />
                  {t(o.labelKey)}
                </label>
              ))}
            </div>
          </div>

          {/*
            The read-back: the outcome in the owner's register, then the goal's engine name, so
            the setup screen and the Targets screen call the same goal the same thing. `output`
            rather than a `<p>` because it is the computed result of the two controls above it,
            and `aria-live` because it changes without the focus moving.
          */}
          <p className="wiz-note">{t(GOAL_OUTCOME_KEY[draft.goalKind])}</p>
          <div className="wiz-field">
            <p className="wiz-label">{t('label.goal')}</p>
            <output className="wiz-derived-goal" aria-live="polite" data-testid="derived-goal">
              {t(GOAL_OPTIONS.find((o) => o.value === draft.goalKind)?.labelKey ?? 'option.goalFatLoss')}
            </output>
          </div>

          {/*
            Brief I Part 1, last paragraph: where recomposition is chosen, say what it costs.
            R9 puts the reasoning behind a disclosure; the sentence itself restates what
            src/domain/nutrition.ts already says in its own basis strings.
          */}
          {draft.goalKind === 'recomposition' && (
            <details>
              <summary>{t('disclosure.why')}</summary>
              <p className="wiz-note">{t('advice.goalRecompositionCost')}</p>
            </details>
          )}

          {/*
            Brief I Part 2, claim C1.10.5: "instead of having a 'target body mass' which is
            stupid... Target body mass can be muscle or fat."

            One target, never two. Where a body-fat estimate exists the target is a PERCENTAGE
            and the fat mass and lean mass it implies are printed beside it, so the number means
            something physical. Where none exists the old target body mass stands, with a line
            saying why the better question could not be asked.
          */}
          {bodyFatTargetAvailable ? (
            <>
              <UnitInput
                id="f-target-bodyfat"
                quantity={t('quantity.targetBodyFat')}
                unit={UNIT.pct}
                value={targetBodyFatText}
                error={targetBodyFatError}
                onChange={(v) => {
                  patch({ targetBodyFat: v });
                }}
              />
              {impliedTargetFatKg !== null && currentLeanKg !== null && (
                <p className="wiz-note" data-testid="implied-composition">
                  {FORMAT.impliedComposition(
                    formatMass(impliedTargetFatKg, draft.units),
                    formatMass(currentLeanKg, draft.units),
                    overrides,
                  )}
                </p>
              )}
              <details>
                <summary>{t('disclosure.why')}</summary>
                <p className="wiz-note">
                  {/*
                    The tape method's standard error for the STATED sex, read live from
                    src/domain/bodyfat.ts. Under `nd` the tape route is closed and the estimate
                    can only have been typed in, so the male figure is not a defensible stand-in;
                    the female figure is the larger of the two (3.72 against 3.52 percentage
                    points), so quoting it is the conservative reading rather than an invented
                    average of two equations that differ in form.
                  */}
                  {FORMAT.targetBodyFatBasis(NAVY_SEE_PCT[statedSex ?? 'female'], overrides)}
                </p>
              </details>
            </>
          ) : (
            <>
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
              <p className="wiz-note">{t('advice.targetBodyFatUnavailable')}</p>
            </>
          )}

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

          {/*
            THE FEASIBILITY CALENDAR (Brief I Part 4, claims C1.11.2 to C1.11.5).

            The owner: "if I choose an unrealistic goal and a 2 day target, who will tell me that
            im being delusional?" This does, at the moment the date is picked, and it does it in
            three colours he specified with the word beside each one.

            THE SURFACE IS A LAYOUT CONSTRAINT, NOT A STYLE. `.wiz-calendar` paints
            `--band-surface`, which is `--bg` in clinical, `--board` in board, and the INVERTED
            PANEL (#000000) in limelight. All three pastels measure 1.0 to 1.4:1 against
            limelight's lime `--bg`, below even WCAG 1.4.11's 3:1 non-text floor, so on that skin
            the fills would be invisible on the bare page. tokens.css carries the measured table.
          */}
          <div className="wiz-field">
            <p className="wiz-label" id="f-feasibility-label">
              {t('label.feasibility')}
            </p>
            <div className="wiz-calendar" aria-labelledby="f-feasibility-label">
              <div className="wiz-calendar-head">
                <button
                  type="button"
                  className="wiz-calendar-nav"
                  disabled={monthOffset <= 0}
                  onClick={() => {
                    setMonthOffset((n) => Math.max(0, n - 1));
                  }}
                >
                  {t('button.previousMonth')}
                </button>
                {/*
                  The month as its ISO prefix, "2027-03". Deliberately not a month NAME: a name
                  is either a string literal in a component, which the copy contract forbids, or
                  twelve more copy keys for words the rest of this wizard already writes as ISO
                  dates in `label.targetDate`'s own field. ISO is also unambiguous in every
                  locale, which a three-letter abbreviation is not.
                */}
                <span className="wiz-calendar-month" data-testid="calendar-month">
                  {calendarMonthStart.slice(0, 7)}
                </span>
                <button
                  type="button"
                  className="wiz-calendar-nav"
                  disabled={monthOffset >= CALENDAR_MAX_MONTHS_AHEAD}
                  onClick={() => {
                    setMonthOffset((n) => Math.min(CALENDAR_MAX_MONTHS_AHEAD, n + 1));
                  }}
                >
                  {t('button.nextMonth')}
                </button>
              </div>

              <div className="wiz-calendar-grid">
                {/*
                  WEEKDAY_ABBR comes from src/ui/format/plan.ts, the same constant the Plan view
                  labels its rows with. A format constant, not copy: it is not retunable by a
                  skin, and reusing it keeps one spelling of "Mon" in the app rather than two.
                  `aria-hidden` because each day cell already names its own full date.
                */}
                {([1, 2, 3, 4, 5, 6, 7] as const).map((wd) => (
                  <span key={wd} className="wiz-calendar-weekday" aria-hidden="true">
                    {WEEKDAY_ABBR[wd]}
                  </span>
                ))}
                {Array.from({ length: calendarLeadingBlanks }, (_unused, i) => (
                  <span key={`blank-${String(i)}`} className="wiz-calendar-blank" aria-hidden="true" />
                ))}
                {calendarDays.map((date) => {
                  const result = feasibilityOf(date);
                  const bandWord = result.assessable ? t(BAND_WORD_KEY[result.band]) : '';
                  const past = compareLocalDate(date, today) < 0;
                  return (
                    <button
                      type="button"
                      key={date}
                      className={[
                        'wiz-calendar-day',
                        result.assessable ? BAND_CLASS[result.band] : 'wiz-band-none',
                        past ? 'wiz-calendar-past' : '',
                      ]
                        .filter((c) => c !== '')
                        .join(' ')}
                      disabled={past}
                      aria-pressed={date === draft.targetDate}
                      aria-label={FORMAT.calendarDay(date, bandWord)}
                      onClick={() => {
                        patch({ targetDate: date });
                      }}
                    >
                      {formatDayOfMonth(date)}
                    </button>
                  );
                })}
              </div>

              {/*
                WCAG 1.4.1: the three fills never carry the meaning alone. The legend prints each
                band's word beside its own swatch, and every day cell repeats the word in its
                accessible name.
              */}
              <ul className="wiz-calendar-legend">
                {(['realistic', 'improbable', 'highly-improbable'] as const).map((band) => (
                  <li key={band}>
                    <span className={`wiz-calendar-swatch ${BAND_CLASS[band]}`} aria-hidden="true" />
                    {t(BAND_WORD_KEY[band])}
                  </li>
                ))}
              </ul>
            </div>

            {/*
              What the chosen date means, in words. `targetDateFeasibilityResult` is null until a
              valid date is picked; after that it either carries a band or names the rule that is
              MISSING, never a rate that was guessed at.
            */}
            <div data-testid="feasibility-verdict">
              {targetDateFeasibilityResult !== null && targetDateFeasibilityResult.assessable && (
                <>
                  <p className="wiz-note">
                    {t(BAND_WORD_KEY[targetDateFeasibilityResult.band])}
                  </p>
                  <p className="wiz-note">
                    {FORMAT.feasibilityRate(
                      `${(targetDateFeasibilityResult.requiredFraction * 100).toFixed(2)} ${UNIT.pct}`,
                      overrides,
                    )}
                  </p>
                  {targetDateFeasibilityResult.belowBound && (
                    <p className="wiz-note">{t('advice.feasibilitySlow')}</p>
                  )}
                </>
              )}
              {targetDateFeasibilityResult !== null && !targetDateFeasibilityResult.assessable && (
                <p className="wiz-note">
                  {t(FEASIBILITY_GAP_KEY[targetDateFeasibilityResult.gap])}
                </p>
              )}
              {/* Brief I Part 4, point 3: say it is an estimate, in the register the basis
                  strings use. Always on show, not only once a date is picked. */}
              <p className="wiz-note">{t('advice.feasibilityEstimate')}</p>
            </div>
          </div>

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
                {/* Three states, read back as the user left them (r2.11). `nd` is named, not
                    shown as a blank: a blank row would read as a screen that lost the answer. */}
                {t(
                  draft.sex === 'male'
                    ? 'label.sexMale'
                    : draft.sex === 'female'
                      ? 'label.sexFemale'
                      : 'label.sexNotDisclosed',
                )}
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

          {/*
           * CREATINE, round 3 Task 9 and his closing instruction: "Put the monohydrate on the
           * last page." It sat on the goal step; this is the last page.
           *
           * It is placed here, between the read-back above and the Daily Targets panel below,
           * because the panel is what it changes: ticking it adds the `label.creatineDose` row
           * a few lines further down the same screen, so the control and its consequence are
           * visible together. `computeTargets` reads `creatine` and nothing else on this step
           * does.
           */}
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
                  <dd data-testid="target-fluid">
                    {formatBeverageTarget(targets.fluidML, draft.units)}
                  </dd>
                  <dt>{t('label.expectedRate')}</dt>
                  <dd data-testid="target-rate">{signedRate()}</dd>
                  {targets.creatineG !== null && (
                    <>
                      <dt>{t('label.creatineDose')}</dt>
                      <dd data-testid="target-creatine">{FORMAT.grams(targets.creatineG)}</dd>
                    </>
                  )}
                </dl>
                {/* Decision A1: the reason the fluid row is a range and not a figure. Rendered
                    only in that case, so a stated-sex profile is not told about a rule it never
                    met. */}
                {targets.fluidML.kind === 'range' && (
                  <p className="wiz-note" data-testid="fluid-range-note">
                    {t('advice.beverageRange')}
                  </p>
                )}
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

          {/*
           * Brief M, claim r2.19: three facts about the document itself, on the last screen
           * before Confirm writes it. The words are src/content/reviewDataNotes.ts (R10 content,
           * not a copy table): the middle fact names the real ExportView controls rather than
           * the guessed "Settings, then Data" path, and the third states plainly that clearing
           * site data cannot be undone.
           */}
          <fieldset className="wiz-review-data">
            <legend>{t('hero.yourData')}</legend>
            <p className="wiz-note">{REVIEW_DATA_WHERE_IT_LIVES}</p>
            <p className="wiz-note">{REVIEW_DATA_HOW_TO_MOVE}</p>
            <p className="wiz-note wiz-review-reset-row">
              {/*
               * THE ICON IS THE OWNER'S. docs/design/2026-09-04-icon-register.csv row
               * `reset-cookies-icon` is marked owner-supplied on every column; this is the frame
               * it will sit in, and nothing here draws, generates or substitutes one.
               */}
              <span
                className="wiz-review-reset-icon"
                data-icon-row="reset-cookies-icon"
                aria-hidden="true"
              />
              {REVIEW_DATA_HOW_TO_RESET}
            </p>
          </fieldset>

          {/*
           * Brief M, claim r2.19: an acknowledgement before Confirm, exactly like the intro
           * sequence's own gesture (src/ui/intro/IntroSequence.tsx) -- stored nowhere, and it
           * gates BLOCKED.review above rather than the store.
           */}
          <label className="wiz-inline">
            <input
              type="checkbox"
              checked={reviewAcknowledged}
              onChange={(e) => {
                setReviewAcknowledged(e.target.checked);
              }}
            />
            {t('label.looksGood')}
          </label>
        </div>
      )}

      <div className="wiz-nav">
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={() => {
              // A2: Back discards the step in progress instead of committing it.
              discardStep();
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
              // A2: this press, and only this press, is what replaces the stored answers.
              commitStep();
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
