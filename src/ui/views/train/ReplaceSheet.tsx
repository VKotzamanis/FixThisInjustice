// src/ui/views/train/ReplaceSheet.tsx
//
// Replace (owner: "if at one day you have to do triceps at the cable machine and the machine is
// taken or you just dont feel like it you can place replace when you start the exercise and
// another tricep exercise would be recommended"). Opened from the card header's Replace button
// (ExerciseCard `onReplace`); one tap on a row swaps the slot and closes the sheet, two taps in
// all. The rows are replaceChoices (src/domain/training/sessionEdits.ts): no ranking of its own.
//
// A reading sheet on the one overlay stack (ModalShell): Android Back, Escape and the scrim close
// it. Every row is a button at least 44 px tall (train.css, .replace-row); no native <select>.
import { useId, useState, type ReactElement } from 'react';
import { FORMAT, type CopyKey } from '../../../content/copy';
import type { ReplaceChoices } from '../../../domain/training/sessionEdits';
import type { Exercise } from '../../../domain/types';
import { ModalShell } from '../../components/ModalShell';
import { displayClass } from '../../format/display';
import { MODALITY_KEY } from './AddCustomExercise';
import '../../styles/train.css';

export interface ReplaceSheetProps {
  t: (key: CopyKey) => string;
  overrides: Readonly<Partial<Record<CopyKey, string>>>;
  /** The name of the exercise the slot holds now. */
  name: string;
  choices: ReplaceChoices;
  /** Swaps the slot to `exerciseId`; false when the store refused it (the sheet stays open). */
  onPick: (exerciseId: string) => boolean;
  /** Must be referentially stable (ModalShell). */
  onClose: () => void;
}

export function ReplaceSheet(props: ReplaceSheetProps): ReactElement {
  const { t, overrides, name, choices, onPick, onClose } = props;
  const titleId = useId();
  const [refused, setRefused] = useState(false);
  const title = FORMAT.withSlots('label.replaceTitle', { name }, overrides);

  const pick = (exerciseId: string): void => {
    if (onPick(exerciseId)) return;
    setRefused(true);
  };

  /** The quiet line: implement, then the direct movers, as the library records them. */
  const meta = (e: Exercise): string =>
    [t(MODALITY_KEY[e.modality]), e.muscleGroups.join(', ')].filter((s) => s !== '').join(' · ');

  const row = (e: Exercise, label: string = e.name, recommended = false): ReactElement => (
    <button
      type="button"
      className={recommended ? 'replace-row is-recommended' : 'replace-row'}
      onClick={() => {
        pick(e.id);
      }}
    >
      {recommended && <span className="replace-tag">{t('label.recommended')}</span>}
      <span className="replace-name">{label}</span>
      <span className="replace-meta">{meta(e)}</span>
    </button>
  );

  return (
    <ModalShell
      labelledBy={titleId}
      className="replace-sheet"
      backdropClassName="replace-sheet-bg"
      testId="replace-sheet"
      onClose={onClose}
      sheet="reading"
    >
      <h2 id={titleId} className={displayClass(title)}>
        {title}
      </h2>
      {refused && (
        <p className="ex-edit-error" role="alert">
          {t('status.sessionEditRefused')}
        </p>
      )}
      <div className="replace-rows">
        {choices.recommended !== null && row(choices.recommended, choices.recommended.name, true)}
        {choices.backToPlan !== null &&
          row(
            choices.backToPlan,
            FORMAT.withSlots('label.backToPlan', { name: choices.backToPlan.name }, overrides),
          )}
      </div>
      {choices.sameMuscle.length > 0 && (
        <>
          <h3 className="replace-group">{t('label.sameMuscle')}</h3>
          <ul className="replace-rows">
            {choices.sameMuscle.map((e) => (
              <li key={e.id}>{row(e)}</li>
            ))}
          </ul>
        </>
      )}
      {choices.others.length > 0 && (
        <details className="replace-more">
          <summary>{t('label.otherExercises')}</summary>
          <ul className="replace-rows">
            {choices.others.map((e) => (
              <li key={e.id}>{row(e)}</li>
            ))}
          </ul>
        </details>
      )}
    </ModalShell>
  );
}
