// src/ui/setup/steps/GoalStep.tsx
//
// Step 5: availability first (split, cardio, weekdays and their slots, weekly target), then the
// goal axes, one target (body fat where a composition exists, else body mass), the target date
// and the feasibility calendar. Validation comes from the field table (../model/fields); the
// derived composition from ../model/answers. Moved verbatim out of SetupWizard.tsx (A16).
import type { JSX } from 'react';
import { FORMAT, type CopyKey } from '../../../content/copy';
import { useCopy, useCopyOverrides } from '../../../content/useCopy';
import { NAVY_SEE_PCT } from '../../../domain/bodyfat';
import { addDays, compareLocalDate, daysBetween, isoWeekday } from '../../../domain/dates';
import {
  earliestRealisticDays,
  targetDateFeasibility,
  type Feasibility,
  type FeasibilityBand,
  type FeasibilityGap,
} from '../../../domain/nutrition';
import { SPLIT_TEMPLATES, type SessionsPerWeek } from '../../../domain/plan/templates';
import {
  GOAL_AXES_BY_KIND,
  GOAL_KIND_BY_AXES,
  type FatAxis,
  type GoalKind,
  type IsoWeekday,
  type LocalDate,
  type MuscleAxis,
} from '../../../domain/types';
import { formatMass } from '../../../domain/units';
import { WEEKDAY_ABBR, formatDayOfMonth } from '../../format/plan';
import { UnitInput, massUnit } from '../../components/UnitInput';
import { UNIT } from '../fieldRules';
import {
  DEFAULT_SESSIONS_PER_WEEK,
  SESSIONS_PER_WEEK_OPTIONS,
  WEEKDAYS,
  deriveAnswers,
  targetBodyFatText,
  type DaySlot,
} from '../model/answers';
import { errorOf } from '../model/fields';
import { STEP_TITLE_KEY, StepHeading, describedBy, type ValidatedStepProps } from './shared';

const TARGET_DATE_ERROR_ID = 'f-target-date-error';
const WEEKDAY_ERROR_ID = 'f-weekday-error';
const AVAILABILITY_DAYS_ERROR_ID = 'f-availability-days-error';

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

/** Whole calendar months from `from`'s month to `to`'s month; the inverse of shiftMonth's `n`. */
function monthsBetween(from: LocalDate, to: LocalDate): number {
  const index = (d: LocalDate): number => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)); // [month]
  return index(to) - index(from);
}

/** The split select's value parsed against its closed option list, never cast. */
function pickSessionsPerWeek(raw: string): SessionsPerWeek {
  const value = Number(raw);
  return SESSIONS_PER_WEEK_OPTIONS.find((n) => n === value) ?? DEFAULT_SESSIONS_PER_WEEK;
}

interface GoalStepProps extends ValidatedStepProps {
  patchDay: (weekday: IsoWeekday, next: Partial<DaySlot>) => void;
  /** The civil date in the profile's zone; the calendar and every horizon start here. */
  today: LocalDate;
  /**
   * The calendar's month offset: a view, not an answer, so the shell keeps it across visits.
   * Null until an arrow is tapped: the grid then opens on the chosen date's month, else on the
   * earliest realistic date's month (P9), else on today's.
   */
  monthOffset: number | null;
  setMonthOffset: (n: number) => void;
}

export function GoalStep(props: GoalStepProps): JSX.Element {
  const { answers: draft, patch, patchDay, headingRef, validation, today, monthOffset, setMonthOffset } = props;
  const t = useCopy();
  const overrides = useCopyOverrides();
  const { statedSex, massKg, currentLeanKg, bodyFatTargetAvailable, impliedTargetFatKg, effectiveTargetMassKg } =
    deriveAnswers(draft);
  const massLabelUnit = massUnit(draft.units);
  const targetBodyFatTextValue = targetBodyFatText(draft);

  const weekdayError = errorOf(validation, 'weekdays');
  const availabilityDaysError = errorOf(validation, 'availabilityDays');
  const weeklyTargetError = errorOf(validation, 'weeklyTarget');
  const targetBodyFatError = errorOf(validation, 'targetBodyFat');
  const targetMassError = errorOf(validation, 'targetMass');
  const targetDateError = errorOf(validation, 'targetDate');
  const startTimeErrors: Record<number, string | null> = {};
  const durationErrors: Record<number, string | null> = {};
  for (const day of WEEKDAYS) {
    startTimeErrors[day.value] = errorOf(validation, `start-${day.value}`);
    durationErrors[day.value] = errorOf(validation, `duration-${day.value}`);
  }

  /**
   * The two axes, READ BACK OUT of the goal rather than stored beside it (Brief I Part 1).
   * GOAL_AXES_BY_KIND and GOAL_KIND_BY_AXES are total both ways, so no round trip leaves the
   * engine's goals.
   */
  const axes = GOAL_AXES_BY_KIND[draft.goalKind];
  function setAxes(next: { fat?: FatAxis; muscle?: MuscleAxis }): void {
    const fat = next.fat ?? axes.fat;
    const muscle = next.muscle ?? axes.muscle;
    patch({ goalKind: GOAL_KIND_BY_AXES[fat][muscle] });
  }

  /**
   * The band for one date, or the reason it has none; every rule is in targetDateFeasibility
   * (src/domain/nutrition.ts). Weeks are whole calendar days / 7 through daysBetween (zone- and
   * DST-free), kept fractional: rounding 3 days to 0 weeks would make the rate infinite.
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

  /**
   * P9 R2: the reason NO date can be banded (the goal has no rate rule, or there is no target or
   * no loss), known before any date is picked, so it is stated above the grid at once. Null when
   * the goal and target can be banded. A positive horizon is passed only because the model needs
   * one; for these gaps the horizon is never read.
   */
  const standingGap: FeasibilityGap | null = (() => {
    const f = feasibilityOf(addDays(today, 7));
    return f.assessable ? null : f.gap === 'no-horizon' ? null : f.gap;
  })();

  /** P9 R1: the first date banded realistic, from FAT_LOSS_RATE_BOUND (src/domain/nutrition.ts). */
  const earliestDays =
    massKg === null
      ? null
      : earliestRealisticDays({ goal: draft.goalKind, currentMassKg: massKg, targetMassKg: effectiveTargetMassKg }); // [day]
  const earliestDate: LocalDate | null = earliestDays === null ? null : addDays(today, earliestDays);
  const earliestPastRange =
    earliestDate !== null && monthsBetween(today, earliestDate) > CALENDAR_MAX_MONTHS_AHEAD;

  const clampOffset = (n: number): number => Math.min(CALENDAR_MAX_MONTHS_AHEAD, Math.max(0, n)); // [month]
  const openingOffset = clampOffset(
    draft.targetDate !== '' && targetDateError === null
      ? monthsBetween(today, draft.targetDate)
      : earliestDate !== null
        ? monthsBetween(today, earliestDate)
        : 0,
  ); // [month]
  const shownOffset = monthOffset ?? openingOffset; // [month]

  /** The month the grid is showing, and the days in it, Monday-aligned by leading blanks. */
  const calendarMonthStart = shiftMonth(today, shownOffset);
  const calendarDays = monthDays(calendarMonthStart);
  const calendarLeadingBlanks = isoWeekday(calendarMonthStart) - 1;

  return (
    <>
    {/*
     * AVAILABILITY, now the FIRST thing on the goal step (round 3 Task 9). The owner asked
     * what step 4 still holds; this is the half that left it.
     *
     * THIS DOES NOT UNDO C1.10.8, which is "if I choose an unrealistic goal and a 2 day
     * target, who will tell me that im being delusional?". What that claim requires is that
     * the training frequency is KNOWN before the target date is chosen, and it still is: this
     * block renders above the target-date field and the feasibility calendar on the same
     * screen, and `feasibilityOf` reads `draft.sessionsPerWeek` at render, not at step change.
     * The wizard is the steps STEPS declares (seven since ROADMAP L6 removed the programme step).
     *
     * A SEPARATE `step === 'goal'` block rather than one merged fieldset, and it carries the
     * step's heading because it is now the first thing on the step: each group keeps its own
     * <fieldset>, exactly as the training step's two groups did.
     */}
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
        {/* ROADMAP L6: moved here from the removed programme-length step. */}
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
        <p className="wiz-note">{t('advice.deloadEveryFourth')}</p>

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
                    required
                    aria-invalid={(startTimeErrors[d.value] ?? null) !== null}
                    aria-describedby={
                      (startTimeErrors[d.value] ?? null) === null ? undefined : `f-start-${d.value}-error`
                    }
                    value={draft.days[d.value].startTime}
                    onChange={(e) => {
                      patchDay(d.value, { startTime: e.target.value });
                    }}
                  />
                  {(startTimeErrors[d.value] ?? null) !== null && (
                    <p className="wiz-error" id={`f-start-${d.value}-error`}>
                      {startTimeErrors[d.value]}
                    </p>
                  )}
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
    {/* The goal itself, below the availability block that now opens this step. */}
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
              value={targetBodyFatTextValue}
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
          `--band-surface`, which is `--bg` in limelight, `--limelight` in limelight, and the INVERTED
          PANEL (#000000) in limelight. All three pastels measure 1.0 to 1.4:1 against
          limelight's lime `--bg`, below even WCAG 1.4.11's 3:1 non-text floor, so on that skin
          the fills would be invisible on the bare page. tokens.css carries the measured table.
        */}
        <div className="wiz-field">
          <p className="wiz-label" id="f-feasibility-label">
            {t('label.feasibility')}
          </p>
          {earliestDate !== null && (
            <div className="wiz-field" data-testid="earliest-realistic">
              <p className="wiz-note">
                {FORMAT.earliestRealisticDate(earliestDate, earliestPastRange, overrides)}
              </p>
              <button
                type="button"
                onClick={() => {
                  patch({ targetDate: earliestDate });
                }}
              >
                {t('button.useThisDate')}
              </button>
            </div>
          )}
          {standingGap !== null && (
            <p className="wiz-note" data-testid="feasibility-gap">
              {t(FEASIBILITY_GAP_KEY[standingGap])}
            </p>
          )}
          <div className="wiz-calendar" aria-labelledby="f-feasibility-label">
            <div className="wiz-calendar-head">
              <button
                type="button"
                className="wiz-calendar-nav"
                disabled={shownOffset <= 0}
                onClick={() => {
                  setMonthOffset(clampOffset(shownOffset - 1));
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
                disabled={shownOffset >= CALENDAR_MAX_MONTHS_AHEAD}
                onClick={() => {
                  setMonthOffset(clampOffset(shownOffset + 1));
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
              accessible name. P9 R2: hidden while no date can be banded, so a grid of grey
              days under three coloured swatches does not read as a broken calendar.
            */}
            {standingGap === null && (
              <ul className="wiz-calendar-legend">
                {(['realistic', 'improbable', 'highly-improbable'] as const).map((band) => (
                  <li key={band}>
                    <span className={`wiz-calendar-swatch ${BAND_CLASS[band]}`} aria-hidden="true" />
                    {t(BAND_WORD_KEY[band])}
                  </li>
                ))}
              </ul>
            )}
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
            {/* A gap already stated above the grid is not repeated here. */}
            {targetDateFeasibilityResult !== null &&
              !targetDateFeasibilityResult.assessable &&
              targetDateFeasibilityResult.gap !== standingGap && (
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
    </>
  );
}
