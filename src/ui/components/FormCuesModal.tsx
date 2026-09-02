// src/ui/components/FormCuesModal.tsx
//
// Form cues for one exercise. Reached through React context; the legacy used
// `window.__formCuesModal` (code review A53).
//
// Cues are looked up BY EXERCISE ID. The legacy object was keyed by display name and one key
// had drifted, so that exercise silently showed nothing (content review section 6). An id
// that carries no cue is stated rather than rendered as an empty dialog (security constraint
// 30: no silent no-op on a user-initiated action).
//
// WARMUP_NOTICE is rendered above every cue set, on every open: the review required a warm-up
// protocol and a pre-participation screen, and the notice is the whole of what can be said
// without a sourced protocol. It carries no digit, and src/content/formCues.test.ts asserts
// that, so nothing here prescribes a number.

import { createContext, useContext, useId } from 'react';
import type { ReactElement } from 'react';
import { ModalShell } from './ModalShell';
import { FORM_CUES, WARMUP_NOTICE } from '../../content/formCues';
import { copy } from '../../content/copy';
import '../styles/train.css';

export interface CueRequest {
  /** `Exercise.formCueId`, never a display name. */
  exerciseId: string;
  title: string;
}

export interface FormCuesModalApi {
  open(request: CueRequest): void;
  close(): void;
}

export const FormCuesModalContext = createContext<FormCuesModalApi | null>(null);

export function useFormCuesModal(): FormCuesModalApi {
  const api = useContext(FormCuesModalContext);
  if (api === null) throw new Error('useFormCuesModal used outside TrainingModalsProvider');
  return api;
}

/** A cue list. Ordered where the order is the instruction, unordered where it is a set. */
function CueSection(props: {
  heading: string;
  lines: readonly string[];
  ordered: boolean;
  className?: string;
}): ReactElement {
  const items = props.lines.map((line) => <li key={line}>{line}</li>);
  return (
    <section>
      <h3 className={`fcm-h${props.className === undefined ? '' : ` ${props.className}`}`}>
        {props.heading}
      </h3>
      {props.ordered ? <ol className="fcm-list">{items}</ol> : <ul className="fcm-list">{items}</ul>}
    </section>
  );
}

export function FormCuesModal(props: {
  request: CueRequest;
  onClose: () => void;
}): ReactElement {
  const headingId = useId();
  const cue = FORM_CUES[props.request.exerciseId];

  return (
    <ModalShell
      labelledBy={headingId}
      className="fcm"
      backdropClassName="fcm-bg"
      testId="form-cues-backdrop"
      onClose={props.onClose}
    >
      <div className="fcm-head">
        <div id={headingId}>
          <div className="fcm-eyebrow">{copy('label.formCues')}</div>
          <h2 className="fcm-name">{props.request.title}</h2>
        </div>
        <button
          type="button"
          className="fcm-close"
          onClick={props.onClose}
          aria-label={copy('button.closeModal')}
        >
          {/* Copy contract R6: a mark from the token set, not an emoji. */}
          {'✕'}
        </button>
      </div>

      <div className="fcm-body">
        <p className="fcm-warmup">{WARMUP_NOTICE}</p>
        {cue === undefined ? (
          <p className="fcm-none">{copy('advice.noFormCues')}</p>
        ) : (
          <>
            {cue.caution !== null && (
              <p className="fcm-caution" role="note">
                <strong>{copy('label.caution')}</strong>: {cue.caution}
              </p>
            )}
            <CueSection heading={copy('label.cueSetup')} lines={cue.setup} ordered />
            <CueSection heading={copy('label.cueExecution')} lines={cue.execution} ordered />
            <CueSection
              heading={copy('label.cueMistakes')}
              lines={cue.mistakes}
              ordered={false}
              className="fcm-danger"
            />
            {cue.tip !== null && (
              <p className="fcm-tip">
                <strong>{copy('label.cueTip')}</strong>: {cue.tip}
              </p>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}
