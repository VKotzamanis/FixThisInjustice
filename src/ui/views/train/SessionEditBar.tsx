// src/ui/views/train/SessionEditBar.tsx
//
// The controls that change one exercise of today's session, at the bottom of its open card
// (ROADMAP L2-L4, docs/design/session-editing.md).
//
// Phone, one hand: every control is a `.view button` or `.view select` (44 px minimum, 16 px
// text, src/ui/views/views.css), laid out two to a row; nothing depends on hover, drag or
// swipe. The picker is the platform's own <select>, whose OS list has large rows and scrolls
// natively. The group is named by the exercise so a screen reader hears whose Swap it is.
//
// Nothing here touches the rest timer: every control calls `onEdit`, which writes the
// document only (src/store/index.ts editSession).
import { useId, useMemo, useState, type ReactElement } from 'react';
import type { CopyKey } from '../../../content/copy';
import {
  swapAlternatives,
  type LineupEntry,
  type SessionEditOp,
} from '../../../domain/training/sessionEdits';
import type { EquipmentAccess, Exercise } from '../../../domain/types';
import '../../styles/train.css';

export interface SessionEditBarProps {
  /** The view's copy lookup, threaded like ExerciseCard's `t` (one subscription per screen). */
  t: (key: CopyKey) => string;
  entry: LineupEntry;
  /** The card's display name, which names the control group. */
  name: string;
  /** The planned exercise of the slot, whose intent a swap keeps. Null for an added card. */
  original: Exercise | null;
  access: EquipmentAccess;
  /** Shipped library plus the profile's custom exercises, in library order. */
  library: readonly Exercise[];
  /** Exercise ids the session already holds; never offered again. */
  inUse: ReadonlySet<string>;
  /** Applies the edit; false when the store refused it. */
  onEdit: (op: SessionEditOp) => boolean;
}

export function SessionEditBar(props: SessionEditBarProps): ReactElement {
  const { t, entry, name, original, access, library, inUse, onEdit } = props;
  const [swapping, setSwapping] = useState(false);
  const [choice, setChoice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();

  const alternatives = useMemo(
    () =>
      original === null || !swapping
        ? { suggested: [], others: [] }
        : swapAlternatives({ original, access, library, inUse }),
    [original, swapping, access, library, inUse],
  );
  const firstChoice = alternatives.suggested[0]?.id ?? alternatives.others[0]?.id ?? '';
  const selected = choice === '' ? firstChoice : choice;

  const run = (op: SessionEditOp): void => {
    if (!onEdit(op)) {
      setError(t('status.sessionEditRefused'));
      return;
    }
    setError(null);
    setSwapping(false);
    setChoice('');
  };

  return (
    <div className="ex-edit" role="group" aria-label={name}>
      {swapping ? (
        <div className="ex-edit-panel">
          <div className="unit-input">
            <label htmlFor={selectId}>{t('label.exerciseChoice')}</label>
            <select
              id={selectId}
              value={selected}
              onChange={(e) => {
                setChoice(e.target.value);
              }}
            >
              {alternatives.suggested.length > 0 && (
                <optgroup label={t('label.sameMuscle')}>
                  {alternatives.suggested.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {alternatives.others.length > 0 && (
                <optgroup label={t('label.otherExercises')}>
                  {alternatives.others.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="ex-edit-row">
            <button
              type="button"
              disabled={selected === ''}
              onClick={() => {
                run({ kind: 'swap', key: entry.key, exerciseId: selected });
              }}
            >
              {t('button.confirmSwap')}
            </button>
            <button
              type="button"
              onClick={() => {
                setSwapping(false);
                setChoice('');
                setError(null);
              }}
            >
              {t('button.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="ex-edit-row">
          {original !== null && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSwapping(true);
              }}
            >
              {t('button.swapExercise')}
            </button>
          )}
        </div>
      )}
      {/* role="alert": it answers the control the user just pressed. */}
      {error !== null && (
        <p className="ex-edit-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
