import type { JSX } from 'react';
import './setup.css';
import { FORMAT } from '../../content/copy';
import { SUPPLEMENT_GUIDANCE } from '../../content/supplementGuidance';
import { useCopy } from '../../content/useCopy';
import { caffeineDoseMg, creatineDoseG } from '../../domain/nutrition';

export interface GuidanceScreenProps {
  massKg: number;
}

export function GuidanceScreen({ massKg }: GuidanceScreenProps): JSX.Element {
  const t = useCopy();
  const creatineDose = creatineDoseG(massKg);
  const caffeineDose = caffeineDoseMg(massKg);

  return (
    <div className="guidance-screen" data-testid="guidance-screen">
      <p className="guidance-hero">{t('hero.guidance')}</p>

      {SUPPLEMENT_GUIDANCE.map((section) => (
        <section
          key={section.id}
          className="guidance-section"
          data-testid={`guidance-${section.id}`}
        >
          <h3>{section.heading}</h3>
          <p className="guidance-body">{section.body}</p>

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

          {section.caution !== null && (
            <div className="guidance-caution" role="note">
              <strong className="guidance-caution-badge">{t('label.caution')}</strong>: {section.caution}
            </div>
          )}

          {section.sources.length > 0 && (
            <details className="guidance-sources">
              <summary>{t('disclosure.why')}</summary>
              <ul className="guidance-sources-list">
                {section.sources.map((source) => (
                  <li key={source}>{source}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}
    </div>
  );
}
