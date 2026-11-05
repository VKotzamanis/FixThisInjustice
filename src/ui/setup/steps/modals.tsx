// src/ui/setup/steps/modals.tsx
//
// The setup wizard's three explainers, moved verbatim out of SetupWizard.tsx (A16): the sex
// rationale and the body-fat chart (body step) and the activity levels source (training step).
import { useId, type JSX } from 'react';
import { useCopy } from '../../../content/useCopy';
import { BODY_FAT_CHART_INTRO, BODY_FAT_CHART_PERCENTAGES } from '../../../content/bodyFatChart';
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
  SEX_RATIONALE_HRT_TITLE,
  SEX_RATIONALE_MSJ,
  SEX_RATIONALE_MSJ_OFFSET_NOTE,
  SEX_RATIONALE_MSJ_TITLE,
  SEX_RATIONALE_SUMMARY,
  SEX_RATIONALE_SUMMARY_TITLE,
  SEX_RATIONALE_TOPIC,
} from '../../../content/sexRationale';
import {
  ACTIVITY_LEVELS_BAND_ROWS,
  ACTIVITY_LEVELS_CITATION,
  ACTIVITY_LEVELS_CLOSING,
  ACTIVITY_LEVELS_INTRO,
  ACTIVITY_LEVELS_STOP_ROWS,
} from '../../../content/activityLevels';
import { ModalShell } from '../../components/ModalShell';
import { BODY_FAT_CHART_CROP, BODY_FAT_CHART_VIEWS, BodyFatFigure, bodyFatChartLoader } from '../setupArt';

/**
 * The two RMR equations, as inline MathML (round 1 claim C1.07.13). MathML, not a LaTeX runtime:
 * B9 measured KaTeX at roughly 300 KB against a floor every target browser already supports
 * natively, and unlike an image the expression stays selectable text a screen reader can read.
 * `@types/react` (checked 2026-09-05, React 19.2.8) declares no MathML tag in
 * JSX.IntrinsicElements, so the markup is set once as a static string rather than fought through
 * `React.createElement` calls with untyped props; nothing here interpolates a variable, so there
 * is no injection surface. The sex term carries its own class so CSS can highlight it with
 * `var(--accent)`, per the brief and never a hex literal (00-CONTEXT accessibility rule).
 *
 * Mifflin-St Jeor is set on THREE ALIGNED ROWS, the same terms in the same order. On one row it
 * is 351 px wide at the modal's 16.8 px type, and the modal is 326 px wide on a 400 px phone and
 * 246 px on a 320 px one (MEASURED, headless Chromium, 2026-10-18), so the highlighted S was
 * scrolled out of sight. MathML Core breaks no lines, so the break is in the markup: RMR in a
 * right-aligned first column, the right-hand side in a left-aligned second one. The operator that
 * opens a row is `form="infix"`, so it keeps a binary operator's spacing and "- 5" cannot read as
 * a negative number. `columnalign` is honoured by WebKit and Gecko; Chromium ignores it, and
 * setup.css (.wiz-mathml mtd) carries the same alignment for it.
 */
const MSJ_EQUATION_MATHML =
  '<math display="block"><mtable columnalign="right left">' +
  '<mtr><mtd><mi>RMR</mi></mtd><mtd><mrow><mo form="infix">=</mo><mn>10</mn><mo>&#215;</mo>' +
  '<mi>mass</mi></mrow></mtd></mtr>' +
  '<mtr><mtd></mtd><mtd><mrow><mo form="infix">+</mo><mn>6.25</mn><mo>&#215;</mo>' +
  '<mi>height</mi></mrow></mtd></mtr>' +
  '<mtr><mtd></mtd><mtd><mrow><mo form="infix">&#8722;</mo><mn>5</mn><mo>&#215;</mo><mi>age</mi>' +
  '<mo>+</mo><mi class="wiz-mathml-term">S</mi></mrow></mtd></mtr>' +
  '</mtable></math>';
const CUNNINGHAM_EQUATION_MATHML =
  '<math display="block"><mrow><mi>RMR</mi><mo>=</mo><mn>370</mn><mo>+</mo><mn>21.6</mn>' +
  '<mo>&#215;</mo><mi>FFM</mi></mrow></math>';

/**
 * The sex explainer (C1.07.6, C1.07.10 to C1.07.16): two segments separated by a rule in
 * `var(--accent)`. NOT lime: on limelight lime is the page background
 * (`src/ui/styles/tokens.css`), and a lime rule on a lime ground is invisible, the exact defect
 * this round exists to fix (B35).
 */
export function SexRationaleModal(props: { onClose: () => void }): JSX.Element {
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
       * white highlight ("fuchsia pink here"), which is `var(--accent)` in setup.css, so a skin
       * other than limelight would resolve its own rather than inherit limelight's pink.
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
 * The body-fat visual estimator (C1.08.5, C1.08.9). A number chosen here fills the percentage
 * field with provenance `visual`, per B31.
 *
 * Survey item 4 (2026-10-18): each cell shows the owner's front and side drawings for its sex and
 * percentage, side by side, with the percentage below. Per sex a three-column grid, so the six
 * percentages fall into two rows. The cell is the same selectable button as before: its
 * accessible name is the percentage text, the drawings are aria-hidden, and each sex row is a
 * group named by its sex label so the two "25%" buttons are told apart.
 *
 * Each drawing's flex-grow is its crop width and its aspect ratio is its crop box, both read from
 * BODY_FAT_CHART_CROP: the pair's widths split in proportion to the two crops, so front and side
 * render at one height and one scale at any cell width (setup.css `.wiz-chart-pair`).
 */
export function BodyFatChartModal(props: { onSelect: (pct: number) => void; onClose: () => void }): JSX.Element {
  const t = useCopy();
  const headingId = useId();
  const rowLabelId = useId();
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
        <div
          key={sex}
          className="wiz-chart-row"
          data-sex={sex}
          role="group"
          aria-labelledby={`${rowLabelId}-${sex}`}
        >
          <p className="wiz-label" id={`${rowLabelId}-${sex}`}>
            {t(sex === 'male' ? 'label.sexMale' : 'label.sexFemale')}
          </p>
          <div className="wiz-chart-frames">
            {BODY_FAT_CHART_PERCENTAGES[sex].map((pct) => (
              <button
                key={pct}
                type="button"
                className="wiz-chart-frame"
                onClick={() => {
                  props.onSelect(pct);
                }}
              >
                <span className="wiz-chart-pair">
                  {BODY_FAT_CHART_VIEWS.map((view) => {
                    const { w, h } = BODY_FAT_CHART_CROP[view];
                    // No file for this sex, percentage and view: no figure, as before.
                    return bodyFatChartLoader(sex, pct, view) === undefined ? null : (
                      <BodyFatFigure
                        key={view}
                        sex={sex}
                        pct={pct}
                        view={view}
                        className="wiz-chart-fig"
                        style={{ flexGrow: w, aspectRatio: `${String(w)} / ${String(h)}` }}
                      />
                    );
                  })}
                </span>
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
export function ActivityLevelsModal(props: { onClose: () => void }): JSX.Element {
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
