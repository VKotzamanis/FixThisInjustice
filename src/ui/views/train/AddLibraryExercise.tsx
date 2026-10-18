// src/ui/views/train/AddLibraryExercise.tsx
//
// Add an exercise from the library to today's session (ROADMAP L4,
// docs/design/session-editing.md). The free-text form (AddCustomExercise.tsx) stays beside it
// as the fallback for an exercise the library does not have.
//
// The picker is the platform's own <select> (OS list, large rows, native scroll), grouped into
// what the profile's equipment unlocks and the rest of the library. Nothing already in the
// session is offered. The added exercise is bonus work: its sets carry isBonus and never feed
// progression, the rule every added exercise has followed (ExerciseCard.tsx handleLog).
import { useId, useMemo, useState, type ReactElement } from 'react';
import { useCopy } from '../../../content/useCopy';
import { addChoices } from '../../../domain/training/sessionEdits';
import type { EquipmentAccess, Exercise } from '../../../domain/types';
import '../../styles/train.css';

export interface AddLibraryExerciseProps {
  access: EquipmentAccess;
  /** Shipped library plus the profile's custom exercises, in library order. */
  library: readonly Exercise[];
  /** Exercise ids the session already holds; never offered. */
  inUse: ReadonlySet<string>;
  /** Adds the exercise to today's session; false when the store refused it. */
  onAdd: (exerciseId: string) => boolean;
}

export function AddLibraryExercise(props: AddLibraryExerciseProps): ReactElement {
  const { access, library, inUse, onAdd } = props;
  // A singleton on the screen, so one subscription of its own (TrainView's note on `c`).
  const c = useCopy();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();

  const choices = useMemo(
    () => (open ? addChoices({ access, library, inUse }) : { fits: [], others: [] }),
    [open, access, library, inUse],
  );
  const firstChoice = choices.fits[0]?.id ?? choices.others[0]?.id ?? '';
  const selected = choice === '' ? firstChoice : choice;

  const close = (): void => {
    setOpen(false);
    setChoice('');
    setError(null);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {c('button.addExercise')}
      </button>
    );
  }

  return (
    <div className="add-library">
      <div className="unit-input">
        <label htmlFor={selectId}>{c('label.exerciseChoice')}</label>
        <select
          id={selectId}
          value={selected}
          onChange={(e) => {
            setChoice(e.target.value);
          }}
        >
          {choices.fits.length > 0 && (
            <optgroup label={c('label.fitsEquipment')}>
              {choices.fits.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          )}
          {choices.others.length > 0 && (
            <optgroup label={c('label.otherExercises')}>
              {choices.others.map((e) => (
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
            if (!onAdd(selected)) {
              setError(c('status.sessionEditRefused'));
              return;
            }
            close();
          }}
        >
          {c('button.addToSession')}
        </button>
        <button type="button" onClick={close}>
          {c('button.cancel')}
        </button>
      </div>
      {/* role="alert": it answers the control the user just pressed. */}
      {error !== null && (
        <p className="ex-edit-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
