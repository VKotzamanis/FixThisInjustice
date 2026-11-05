// src/ui/setup/steps/ReviewStep.tsx
//
// The last step: the user's own answers read back, creatine, the daily targets, the programme,
// the three facts about the document, and the "Looks Good" acknowledgement that gates Confirm.
// Moved verbatim out of SetupWizard.tsx (A16).
import { useMemo, type JSX } from 'react';
import { FORMAT } from '../../../content/copy';
import { useCopy } from '../../../content/useCopy';
import { RMR_EQUATION_NAME } from '../../../content/rmrEquations';
import {
  REVIEW_DATA_HOW_TO_MOVE,
  REVIEW_DATA_HOW_TO_RESET,
  REVIEW_DATA_WHERE_IT_LIVES,
} from '../../../content/reviewDataNotes';
import { computeTargets, isInDomain, type NutritionInput } from '../../../domain/nutrition';
import { EXERCISES } from '../../../domain/plan/library';
import { volumeReport } from '../../../domain/plan/generator';
import { SPLIT_TEMPLATES } from '../../../domain/plan/templates';
import type { PlanTemplate } from '../../../domain/types';
import { displayMass, formatBeverageTarget, formatMass } from '../../../domain/units';
import { massUnit } from '../../components/UnitInput';
import { UNIT, round1 } from '../fieldRules';
import { deriveAnswers, sessionsPerWeekForTargets } from '../model/answers';
import { LoneStepHeading, STEP_TITLE_KEY, type StepProps } from './shared';

interface ReviewStepProps extends StepProps {
  /** The plan Confirm will store, previewed here (the shell builds it once). */
  plan: PlanTemplate;
  /** Brief M, r2.19: a gesture, never stored; it gates Confirm in the shell. */
  reviewAcknowledged: boolean;
  setReviewAcknowledged: (v: boolean) => void;
}

export function ReviewStep(props: ReviewStepProps): JSX.Element {
  const { answers: draft, patch, headingRef, plan, reviewAcknowledged, setReviewAcknowledged } = props;
  const t = useCopy();
  const { massKg, heightCm, ageYears, bodyFatPct } = deriveAnswers(draft);
  const sessionsForTargets = sessionsPerWeekForTargets(draft); // [sessions/week], integer
  const volume = useMemo(() => volumeReport(plan, EXERCISES), [plan]);

  /**
   * Null until every input is inside NUTRITION_DOMAIN. The gate is `isInDomain`, the engine's
   * OWN predicate (master plan section 6.3), so no gap can open between a field message and what
   * computeTargets accepts; a gap in render would be an uncaught RangeError, not a message.
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
      // Brief G: the slider's own PAL, preferred over the band floor whenever it is a number.
      activityPal: draft.activityPal ?? null,
      goal: draft.goalKind,
      sessionsPerWeek: sessionsForTargets, // [sessions/week], integer
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
    sessionsForTargets,
  ]);

  /** "-0.9 lb/week", or the honest statement that the evidence base gives no rate. */
  function signedRate(): string {
    if (targets === null || targets.expectedRateKgPerWeek === null) {
      return t('status.rateUnknown');
    }
    return FORMAT.signedRate(displayMass(targets.expectedRateKgPerWeek, draft.units), massUnit(draft.units));
  }

  return (
    <div data-testid="review">
      {/* Review carries fieldsets of its own, so its heading stands above them. */}
      <LoneStepHeading title={t(STEP_TITLE_KEY.review)} headingRef={headingRef} />
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
          {FORMAT.splitSummary(SPLIT_TEMPLATES[draft.sessionsPerWeek].name, draft.sessionsPerWeek)}{' '}
          {t('advice.programmeContinues')}{' '}
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
  );
}
