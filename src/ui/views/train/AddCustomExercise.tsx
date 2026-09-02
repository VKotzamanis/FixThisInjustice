// src/ui/views/train/AddCustomExercise.tsx
//
// An exercise the user adds to today's session beyond the plan.
//
// The id is generated, never positional. Code review A26 records the legacy defect: custom
// exercises were keyed by `1000 + i`, so deleting one re-attributed another's logged sets and
// orphaned the rest. The record is stored on the profile (AppState.customExercises) and the
// session-local half - "this exercise is on today's card" - is the session slice's
// bonusExerciseIds, which is mirrored to sessionStorage and dropped when the session ends.
import { useState, type ReactElement } from 'react';
import { copy } from '../../../content/copy';
import { newId } from '../../../domain/ids';
import type { Exercise, Modality, Profile } from '../../../domain/types';
import { useAppStore } from '../../../store';
import '../../styles/train.css';

const MODALITIES: readonly Modality[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];

export function AddCustomExercise(props: { profile: Profile }): ReactElement {
  const { profile } = props;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [modality, setModality] = useState<Modality>('dumbbell');

  const submit = (): void => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    const exercise: Exercise = {
      id: newId(),
      name: trimmed,
      isBodyweight: modality === 'bodyweight',
      isCompoundPrimary: false,
      modality,
      // `isolation` is the conservative default: it carries the smaller of the two progression
      // increments (2.5 %, not 5 %), so a misclassified custom lift advances too slowly rather
      // than too fast.
      loadClass: 'isolation',
      // Empty rather than guessed: a wrong muscle group would enter the weekly fractional set
      // count as if it were measured. A custom exercise contributes no set count until the
      // user can state what it trains, which P4 does not collect.
      muscleGroups: [],
      secondaryMuscles: [],
      equipment: [profile.equipment],
      videoQuery: `${trimmed} technique`,
      formCueId: null,
      note: null,
    };
    // Through getState(): the store's actions are created once and never replace themselves,
    // so subscribing to one buys nothing and hands the component an unbound method.
    useAppStore.getState().addCustomExercise(profile.id, exercise);
    useAppStore.getState().addBonusExercise(exercise.id);
    setName('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        {copy('button.addExercise')}
      </button>
    );
  }

  return (
    <div className="add-custom">
      <div className="unit-input">
        <label htmlFor="custom-exercise-name">{copy('quantity.exerciseName')}</label>
        <input
          id="custom-exercise-name"
          type="text"
          autoComplete="off"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            submit();
          }}
        />
      </div>
      <div className="unit-input">
        <label htmlFor="custom-exercise-modality">{copy('label.equipment')}</label>
        <select
          id="custom-exercise-modality"
          value={modality}
          onChange={(e) => {
            // Narrowed by lookup rather than by a cast: the select's value is a DOM string,
            // and master plan section 3 forbids asserting a type onto data from outside.
            const next = MODALITIES.find((m) => m === e.target.value);
            if (next !== undefined) setModality(next);
          }}
        >
          {MODALITIES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
        }}
      >
        {copy('button.cancel')}
      </button>
      <button type="button" onClick={submit}>
        {copy('button.saveExercise')}
      </button>
    </div>
  );
}
