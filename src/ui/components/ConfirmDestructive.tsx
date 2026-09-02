import { useId, useState, type JSX } from 'react';

import { downloadText } from '../../app/download';
import { FORMAT, copy, type CopyKey } from '../../content/copy';
import './confirmDestructive.css';

export interface ConfirmDestructiveProps {
  /**
   * The exact word the user must type, compared case-sensitively. It is also the word the
   * label names, through one frame, so the two cannot disagree.
   */
  word: string;
  /** The export control's label. The caller owns the wording; this panel owns the gate. */
  exportLabelKey: CopyKey;
  /** The filename the backup is offered under. */
  exportFilename: string;
  /**
   * The text to export, read at the moment the user asks for it rather than at render.
   *
   * A function, not a string: the document being backed up is usually the live one, and a
   * value captured at render is the document as it was before the user's last change.
   */
  exportText: () => string;
  /** The destructive control's label. */
  confirmLabelKey: CopyKey;
  /**
   * The destructive action. Called once, only after both gates are open.
   *
   * Function-typed properties rather than method shorthand: a method declared with shorthand
   * is flagged by @typescript-eslint's unbound-method rule when it is destructured off the
   * props object, which is how this component reads them (the argument ToastQueue.tsx records).
   */
  onConfirm: () => void;
  /** The user backed out. Nothing has been written; the host decides what to show next. */
  onCancel: () => void;
}

/**
 * A destructive action behind the two gates the master plan requires of every one of them
 * (section 3, "Destructive actions"): a completed export, then a typed confirmation.
 *
 * Extracted from src/app/RootErrorBoundary.tsx, which is where the pattern was written first
 * and is still the one place that cannot use this component: the boundary sits above the store
 * and above the copy table's consumers, and it must render when either has thrown.
 *
 * Three properties hold, and each is a review finding rather than a preference:
 *
 *  1. The export is a fact about THIS panel, not about the session. `exported` is component
 *     state, so a backup taken somewhere else earlier does not open this gate, and a panel the
 *     host unmounts and mounts again asks for the backup again.
 *  2. The export is marked taken only after `downloadText` has returned. A browser that
 *     refuses the download leaves the gate shut, which is the safe direction: the export is
 *     the entire reason the gate exists.
 *  3. The label naming the word is FORMAT.typeToConfirm(word), one frame taking the same value
 *     the comparison uses (code review finding 3). The label the user reads and the word the
 *     control accepts are therefore one string, and a skin that rewrites the sentence cannot
 *     leave the control permanently disabled by naming a different word.
 *
 * The panel renders no trigger and no disclosure of its own. Whether the destructive action is
 * visible at all is the host's decision: the migration wizard has already put the user in
 * front of it, whereas Settings must keep it behind a disclosure (security H2, no
 * always-visible wipe control). A trigger built in here would force the wizard through a
 * second click and would put the H2 rule in a component that cannot see its own context.
 */
export function ConfirmDestructive(props: ConfirmDestructiveProps): JSX.Element {
  const { word, exportLabelKey, exportFilename, exportText, confirmLabelKey } = props;
  const { onConfirm, onCancel } = props;

  const [exported, setExported] = useState(false);
  const [typed, setTyped] = useState('');
  const fieldId = useId();

  const armed = exported && typed === word;

  return (
    <div className="confirm-destructive">
      <button
        type="button"
        onClick={() => {
          // Order matters: a throw from the download leaves `exported` false.
          downloadText(exportFilename, exportText());
          setExported(true);
        }}
      >
        {copy(exportLabelKey)}
      </button>

      {/* Polite, not assertive: the backup is a step completed, not a problem to interrupt for. */}
      <p className="confirm-destructive-note" aria-live="polite">
        {exported ? copy('status.exportTaken') : copy('advice.exportBeforeConfirm')}
      </p>

      <div className="confirm-destructive-field">
        <label htmlFor={fieldId}>{FORMAT.typeToConfirm(word)}</label>
        <input
          id={fieldId}
          type="text"
          autoComplete="off"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
          }}
        />
      </div>

      <div className="confirm-destructive-actions">
        <button type="button" className="destructive" disabled={!armed} onClick={onConfirm}>
          {copy(confirmLabelKey)}
        </button>
        <button type="button" onClick={onCancel}>
          {copy('button.cancel')}
        </button>
      </div>
    </div>
  );
}
