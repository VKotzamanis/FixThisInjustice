import { useState, type JSX } from 'react';
import './setup.css';
import { useCopy } from '../../content/useCopy';
import { READINESS_QUESTIONS, READINESS_SOURCE } from '../../content/readinessQuestions';
import { todayLocal } from '../../domain/dates';
import type { LocalDate } from '../../domain/types';

export interface ReadinessResult {
  /** Local calendar date in the profile's IANA zone, never UTC. */
  screenedAt: LocalDate;
  /** True when at least one of the seven answers is yes. */
  flagged: boolean;
}

type Answer = 'yes' | 'no';

/**
 * The pre-participation readiness screen (master plan section 10.4).
 *
 * Rendered twice: as the wizard step before Review, and as the redo panel in Settings. It owns
 * no store state and calls no action, because the two call sites cannot write the same way. In
 * Settings the profile already exists and Continue goes through `recordReadiness`; in the wizard
 * no profile exists until Confirm runs, so the result is carried in the draft and written into
 * the Profile literal Confirm is already building. Creating the profile first and patching it
 * second would leave an unscreened profile on disk if the user abandoned Review.
 *
 * Every control is a radio. Nothing here can be typed into, so no condition or medication string
 * can be collected (global constraint: Personal data), and the only thing stored is the date and
 * one boolean.
 */
export function ReadinessScreen(props: {
  /** IANA zone of the profile being screened. The screening date is local to it, not to UTC. */
  timezone: string;
  onComplete: (result: ReadinessResult) => void;
}): JSX.Element {
  const t = useCopy();
  const [answers, setAnswers] = useState<Partial<Record<number, Answer>>>({});

  const answered = READINESS_QUESTIONS.every((q) => answers[q.id] !== undefined);
  const anyYes = READINESS_QUESTIONS.some((q) => answers[q.id] === 'yes');

  return (
    <div className="rq" data-testid="readiness-screen">
      <p className="rq-lede">{t('advice.notMedicalAdvice')}</p>
      <p className="rq-lede">{t('advice.readinessAnyYes')}</p>

      {/* R9: what this is modelled on, what it stores, and the citation. Never on the face. */}
      <details>
        <summary>{t('disclosure.why')}</summary>
        <p className="rq-note">{t('why.readiness')}</p>
        <p className="rq-source">{READINESS_SOURCE}</p>
      </details>

      {READINESS_QUESTIONS.map((q) => (
        <fieldset key={q.id} data-testid={`readiness-q${q.id}`}>
          <legend>{q.id}</legend>
          <p className="rq-text">{q.text}</p>
          {q.note !== null && <p className="rq-note">{q.note}</p>}
          <div className="rq-answers">
            {(['yes', 'no'] as const).map((choice) => (
              <label className="rq-answer" key={choice}>
                <input
                  type="radio"
                  name={`readiness-${q.id}`}
                  aria-label={choice === 'yes' ? t('label.yes') : t('label.no')}
                  checked={answers[q.id] === choice}
                  onChange={() => {
                    setAnswers((a) => ({ ...a, [q.id]: choice }));
                  }}
                />
                {choice === 'yes' ? t('label.yes') : t('label.no')}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="rq-nav">
        <button
          type="button"
          disabled={!answered}
          onClick={() => {
            // Guarded as well as disabled: a click that arrives before React has re-rendered the
            // button would otherwise report a screening with unanswered questions.
            if (!answered) return;
            props.onComplete({ screenedAt: todayLocal(props.timezone), flagged: anyYes });
          }}
        >
          {t('button.continue')}
        </button>
      </div>
    </div>
  );
}
