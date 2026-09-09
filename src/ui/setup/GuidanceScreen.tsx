import type { JSX } from 'react';
import './setup.css';
import { FORMAT } from '../../content/copy';
import {
  GUIDANCE_REFERENCES,
  GUIDANCE_REFERENCES_LEAD,
  GUIDANCE_UNSOURCED_LABEL,
} from '../../content/guidanceReferences';
import { SUPPLEMENT_GUIDANCE } from '../../content/supplementGuidance';
import { useCopy } from '../../content/useCopy';
import { caffeineDoseMg, creatineDoseG } from '../../domain/nutrition';

export interface GuidanceScreenProps {
  massKg: number;
}

/**
 * The guidance step, round 2 claim r2.18.
 *
 * EVERY BOX IS CLOSED. `<details>` carries no `open` attribute anywhere in this file, and
 * `GuidanceScreen.test.tsx` asserts `open === false` on every one of them, including the
 * references box. That is the whole change: the owner read the old four-section prose as a wall,
 * so the step opens as a menu of eight headings and expands only what he asks for.
 *
 * WHY `<details>` RATHER THAN STATE. It is the same control the `why?` disclosures across this
 * wizard already use. It needs no JavaScript, it is keyboard operable and screen-reader
 * announced without an aria-expanded of our own, and it survives a re-render without a store.
 *
 * THE HEADING IS A HEADING, and it is not the accessible name of the marker. `<h3>` holds the
 * heading text and nothing else, so `getByRole('heading', { name })` still finds it; the
 * superscript sits beside it inside the `<summary>` as its own element, aria-hidden because the
 * reference list beneath is the thing that carries meaning and a screen reader reading "1, 2"
 * after a heading learns nothing.
 *
 * THE REFERENCES BOX reuses `.wiz-refs`, `.wiz-cite-list`, `.wiz-cite-lead` and `.wiz-cite-src`,
 * the classes brief K's body-step list defines in `setup.css`. Reuse is deliberate: the brief
 * asks for a box "matching the one brief K built", and two boxes that must look identical should
 * not be styled twice.
 *
 * Units are stated in the content modules, not here. This file formats nothing itself: the two
 * personalised doses come from `FORMAT.guidanceCreatine` and `FORMAT.guidanceCaffeine`, which own
 * the grams and the milligrams respectively.
 */
export function GuidanceScreen({ massKg }: GuidanceScreenProps): JSX.Element {
  const t = useCopy();
  const creatineDose = creatineDoseG(massKg);
  const caffeineDose = caffeineDoseMg(massKg);

  return (
    <div className="guidance-screen" data-testid="guidance-screen">
      <p className="guidance-hero">{t('hero.guidance')}</p>

      {SUPPLEMENT_GUIDANCE.map((section) => (
        <details
          key={section.id}
          className="guidance-topic"
          data-testid={`guidance-${section.id}`}
        >
          <summary className="guidance-topic-summary">
            <h3 className="guidance-topic-heading">{section.heading}</h3>
            <sup className="guidance-topic-markers" aria-hidden="true">
              {section.markers.join(', ')}
            </sup>
          </summary>

          <p className="guidance-answer">{section.answer}</p>

          {section.id === 'creatine' && (
            <p className="guidance-dose" data-testid="guidance-creatine-dose">
              {FORMAT.guidanceCreatine(creatineDose)}
            </p>
          )}

          {section.id === 'caffeine' && (
            <p className="guidance-dose" data-testid="guidance-caffeine-dose">
              {FORMAT.guidanceCaffeine(caffeineDose.lo, caffeineDose.hi)}
            </p>
          )}

          <ul className="guidance-points">
            {section.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>

          {section.caution.length > 0 && (
            <div className="guidance-caution" role="note">
              <strong className="guidance-caution-badge">{t('label.caution')}</strong>
              <ul className="guidance-points">
                {section.caution.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {/*
            The marked placeholder, on the face of the box rather than only in the reference list.
            A claim with no source is a thing the reader should see while reading the claim, not
            something to discover later, and the owner drops his own recommendation in here.
          */}
          {section.gap !== null && (
            <p className="guidance-gap" data-testid={`guidance-gap-${section.id}`}>
              <strong className="guidance-gap-badge">{GUIDANCE_UNSOURCED_LABEL}</strong>{' '}
              {section.gap}
            </p>
          )}
        </details>
      ))}

      <details className="wiz-refs guidance-refs" data-testid="guidance-references">
        <summary>{t('disclosure.references')}</summary>
        <p className="wiz-note">{GUIDANCE_REFERENCES_LEAD}</p>
        <ul className="wiz-cite-list">
          {GUIDANCE_REFERENCES.map((ref) => (
            <li key={ref.marker}>
              <p className="wiz-cite-lead">
                <sup>{ref.marker}</sup> {ref.lead}
              </p>
              {ref.cite.kind === 'published' ? (
                <span className="wiz-cite-src">{ref.cite.text}</span>
              ) : (
                <span className="wiz-cite-src guidance-cite-none">
                  <strong className="guidance-gap-badge">{GUIDANCE_UNSOURCED_LABEL}</strong>{' '}
                  {ref.cite.claim}
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
