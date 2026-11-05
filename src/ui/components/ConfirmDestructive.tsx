import { useId, useState, type JSX } from 'react';

import { saveFile } from '../../app/saveFile';
import { FORMAT, type CopyKey } from '../../content/copy';
import { useCopy } from '../../content/useCopy';
import './confirmDestructive.css';

export interface ConfirmDestructiveProps {
  /**
   * The panel's own name, rendered as the accessible name of its `role="group"`.
   *
   * Required rather than optional, and a CopyKey rather than a string: two panels can be on
   * screen at once (the Settings wipe, and the Replace confirmation in the export view mounted
   * directly above it). Both label their field 'Type DELETE to confirm' and both carry a
   * 'Cancel', so an unnamed group leaves a screen reader with two indistinguishable sets of
   * controls that destroy different things.
   *
   * No visible heading. The plan's draft named the panel only through `aria-label` (docs/plans
   * /2026-09-01-07-log-export-migration-cutover.md, Task 6 Step 3), and every host already
   * renders its own sentence above the panel saying what is about to be destroyed.
   */
  titleKey: CopyKey;
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
 * Four properties hold, and each is a review finding rather than a preference:
 *
 *  1. The export is a fact about THIS panel, not about the session. `exported` is component
 *     state, so a backup taken somewhere else earlier does not open this gate, and a panel the
 *     host unmounts and mounts again asks for the backup again.
 *  2. The export is marked taken only on proof (audit B07): a share sheet that resolved, or a
 *     download the user confirms with a tick. A download call that returned proves nothing
 *     (`downloadText` never throws), and a cancelled share sheet leaves the gate shut.
 *  3. The panel is a named `role="group"`, so two of them on screen at once are two distinct
 *     regions rather than two copies of the same anonymous set of controls (P7 Task 6 review,
 *     item 2). The host names it; nothing here assumes which destructive action it holds.
 *  4. The label naming the word is FORMAT.typeToConfirm(word), one frame taking the same value
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
  const { titleKey, word, exportLabelKey, exportFilename, exportText, confirmLabelKey } = props;
  const { onConfirm, onCancel } = props;

  /*
   * Audit B07: what became of the backup. 'shared' is the share sheet resolving (a target took
   * the file); 'downloaded' is only the browser being asked, so the user confirms it below.
   */
  const [taken, setTaken] = useState<'none' | 'pending' | 'shared' | 'downloaded'>('none');
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [typed, setTyped] = useState('');
  const fieldId = useId();
  const savedId = useId();
  const t = useCopy();

  const exported = taken === 'shared' || (taken === 'downloaded' && savedConfirmed);
  const armed = exported && typed === word;

  return (
    <div className="confirm-destructive" role="group" aria-label={t(titleKey)}>
      <button
        type="button"
        disabled={taken === 'pending'}
        onClick={() => {
          // Order matters: a throw from exportText or the download leaves the gate shut.
          const result = saveFile(exportFilename, exportText());
          if (result.route === 'download') {
            setTaken('downloaded');
            return;
          }
          setTaken('pending');
          void result.outcome.then((outcome) => {
            // A cancelled sheet saved nothing; a failed one fell back to the download.
            setTaken(outcome === 'shared' ? 'shared' : outcome === 'failed' ? 'downloaded' : 'none');
          });
        }}
      >
        {t(exportLabelKey)}
      </button>

      {/* Polite, not assertive: the backup is a step completed, not a problem to interrupt for. */}
      <p className="confirm-destructive-note" aria-live="polite">
        {exported ? t('status.exportTaken') : t('advice.exportBeforeConfirm')}
      </p>

      {/* B07: a returned download call is not proof of a file; the user says they have it. */}
      {taken === 'downloaded' && (
        <div className="confirm-destructive-saved">
          <input
            id={savedId}
            type="checkbox"
            checked={savedConfirmed}
            onChange={(e) => {
              setSavedConfirmed(e.target.checked);
            }}
          />
          <label htmlFor={savedId}>{t('label.backupSaved')}</label>
        </div>
      )}

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
          {t(confirmLabelKey)}
        </button>
        <button type="button" onClick={onCancel}>
          {t('button.cancel')}
        </button>
      </div>
    </div>
  );
}
