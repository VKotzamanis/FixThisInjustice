// src/ui/setup/steps/BodyStep.tsx
//
// Step 3: name, age, sex, stature, body mass, body fat (typed, tape or none), the weigh-in
// opt-in and the step's one reference list. Validation comes from the field table
// (../model/fields); this component only renders it. Moved verbatim out of SetupWizard.tsx (A16).
import type { JSX } from 'react';
import { FORMAT, type CopyKey } from '../../../content/copy';
import { useCopy } from '../../../content/useCopy';
import { BODY_EQUATIONS, BODY_EQUATIONS_LEAD, BODY_TAPE_DISCLAIMER } from '../../../content/bodyEquations';
import { SEX_RATIONALE_HRT_SOURCE, SEX_RATIONALE_HRT_SOURCE_LEAD } from '../../../content/sexRationale';
import { NAVY_SEE_PCT, NAVY_SITE_LABEL } from '../../../domain/bodyfat';
import { PROFILE_DISPLAY_NAME_MAX_CHARS } from '../../../domain/schema';
import type { Sex, StatedSex } from '../../../domain/types';
import { UnitInput, girthUnit, massUnit } from '../../components/UnitInput';
import { UNIT } from '../fieldRules';
import { deriveAnswers } from '../model/answers';
import { errorOf } from '../model/fields';
import { SetupIcon, type SetupIconId } from '../setupArt';
import { BodyFatChartModal, SexRationaleModal } from './modals';
import { STEP_TITLE_KEY, StepHeading, type ValidatedStepProps } from './shared';

const HEIGHT_ERROR_ID = 'f-height-error';
const TAPE_ERROR_ID = 'f-tape-error';
/*
 * The one line saying why the tape route and `Not measured` are unavailable (decision A1). Both
 * refused controls point at it with aria-describedby, so the refusal is announced, not only greyed.
 */
const BODYFAT_ND_REASON_ID = 'f-bodyfat-nd-reason';

/**
 * Copy contract R5. NAVY_SITE_LABEL (src/domain/bodyfat.ts) joins the site name to the
 * instruction with an em-dash; the connector is replaced here, at the render boundary. No word
 * changes: the site descriptions are quoted source material (R10).
 */
function withoutDashConnector(text: string): string {
  return text.replace(/\s+—\s+/g, ': ');
}

/**
 * A tape-measurement site diagram with its caption (C1.08.5, C1.08.9). The caption stays visible
 * text because the drawing is aria-hidden and the caption is what a screen reader gets (B15).
 */
function MeasurementSite(props: { art: SetupIconId; label: string }): JSX.Element {
  return (
    <div className="wiz-site">
      <SetupIcon id={props.art} className="wiz-site-art" />
      <p className="wiz-note wiz-site-caption">{props.label}</p>
    </div>
  );
}

/*
 * The waist site per stated sex, label and diagram in one row so they cannot disagree. Abdomen II
 * (umbilicus) for male and Abdomen I (minimal width) for female: the two Navy equations read
 * different sites (NAVY_SITE_LABEL).
 */
const WAIST_SITE: Readonly<Record<StatedSex, { quantity: CopyKey; art: SetupIconId }>> = {
  male: { quantity: 'quantity.abdomenII', art: 'tape-abdomen-male' },
  female: { quantity: 'quantity.abdomenI', art: 'tape-abdomen-female' },
};

export type BodyModal = 'sexRationale' | 'bodyFatChart' | null;

interface BodyStepProps extends ValidatedStepProps {
  /** Next was pressed while blocked: "enter a number" messages are revealed (C1.08.14, B33). */
  nextAttempted: boolean;
  modal: BodyModal;
  setModal: (m: BodyModal) => void;
}

export function BodyStep(props: BodyStepProps): JSX.Element {
  const { answers: draft, patch, headingRef, validation, nextAttempted, modal, setModal } = props;
  const t = useCopy();
  const { statedSex, tapeEstimate, bodyFatRequired } = deriveAnswers(draft);
  const massLabelUnit = massUnit(draft.units);
  const sexRationaleOpen = modal === 'sexRationale';
  const bodyFatChartOpen = modal === 'bodyFatChart';
  const setSexRationaleOpen = (open: boolean): void => {
    setModal(open ? 'sexRationale' : null);
  };
  const setBodyFatChartOpen = (open: boolean): void => {
    setModal(open ? 'bodyFatChart' : null);
  };

  const nameError = errorOf(validation, 'name');
  const ageError = errorOf(validation, 'age');
  const heightError = errorOf(validation, 'height');
  const massError = errorOf(validation, 'mass');
  const knownBodyFatError = errorOf(validation, 'bodyFat');
  const tapeDomainError = errorOf(validation, 'tapeDomain');
  const tapeIncomplete =
    errorOf(validation, 'neck') !== null ||
    errorOf(validation, 'waist') !== null ||
    errorOf(validation, 'hip') !== null;

  /**
   * `error.valueRequired` hidden until Next has been pressed on this step; every other message
   * shows as computed (an out-of-range value is informative the moment it appears).
   */
  function bodyFieldError(error: string | null): string | null {
    if (error === null || error !== t('error.valueRequired')) return error;
    return nextAttempted ? error : null;
  }

  /**
   * The sex control's one writer, including the deselect back to `nd` (r2.11). It also REPAIRS
   * the body-fat mode on the same click: under `nd` only `known` is available (A1), so the screen
   * never renders a forbidden combination. The typed percentage is never cleared.
   */
  function selectSex(next: Sex): void {
    if (next !== 'nd' || draft.bodyFatMode === 'known') {
      patch({ sex: next });
      return;
    }
    patch({ sex: next, bodyFatMode: 'known' });
  }

  return (
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
       * tokens, so the face and colour are the skin's, not this component's.
       */}
      <div className="wiz-field">
        <label htmlFor="f-name">{t('label.name')}</label>
        <input
          id="f-name"
          className="wiz-name"
          type="text"
          maxLength={PROFILE_DISPLAY_NAME_MAX_CHARS}
          aria-invalid={nameError !== null}
          aria-describedby={nameError === null ? undefined : 'f-name-error'}
          value={draft.displayName}
          onChange={(e) => {
            patch({ displayName: e.target.value });
          }}
        />
        {nameError !== null && (
          <p className="wiz-error" id="f-name-error">
            {nameError}
          </p>
        )}
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
        {/* Wraps: below two 12rem parts the stature pair takes the whole box (setup.css). */}
        <div className="wiz-row wiz-row-wrap">
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
                error={bodyFieldError(errorOf(validation, 'neck'))}
                sharedErrorId={tapeDomainError === null ? null : TAPE_ERROR_ID}
                onChange={(v) => {
                  patch({ neck: v });
                }}
              />
              {/* The caption is the site description the NHRC reports print, so the
                  instruction sits beside the field it governs rather than behind a
                  disclosure (r2.14(ii), and B15: the caption is what a screen reader gets,
                  since the diagram is aria-hidden). NAVY_SITE_LABEL names no neck site. */}
              <MeasurementSite art="tape-neck" label={t('quantity.neck')} />
            </div>

            <div className="wiz-row wiz-row-site">
              <UnitInput
                id="f-waist"
                quantity={t(WAIST_SITE[statedSex].quantity)}
                unit={girthUnit(draft.units)}
                value={draft.waist}
                error={bodyFieldError(errorOf(validation, 'waist'))}
                sharedErrorId={tapeDomainError === null ? null : TAPE_ERROR_ID}
                onChange={(v) => {
                  patch({ waist: v });
                }}
              />
              <MeasurementSite
                art={WAIST_SITE[statedSex].art}
                label={withoutDashConnector(NAVY_SITE_LABEL[statedSex].waist)}
              />
            </div>

            {statedSex === 'female' && (
              <div className="wiz-row wiz-row-site">
                <UnitInput
                  id="f-hip"
                  quantity={t('quantity.hip')}
                  unit={girthUnit(draft.units)}
                  value={draft.hip}
                  error={bodyFieldError(errorOf(validation, 'hip'))}
                  sharedErrorId={tapeDomainError === null ? null : TAPE_ERROR_ID}
                  onChange={(v) => {
                    patch({ hip: v });
                  }}
                />
                <MeasurementSite
                  art="tape-hip"
                  label={withoutDashConnector(NAVY_SITE_LABEL.female.hip ?? '')}
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
  );
}
