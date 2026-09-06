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
import { FORMAT, type CopyKey } from '../../../content/copy';
import { useCopy } from '../../../content/useCopy';
import { newId } from '../../../domain/ids';
import { EXERCISE_NAME_MAX_CHARS } from '../../../domain/schema';
import { ACCESS_UNLOCKS } from '../../../domain/types';
import type { Exercise, Modality, Profile } from '../../../domain/types';
import { useAppStore } from '../../../store';
import '../../styles/train.css';

/**
 * One copy key per `Modality` member, in the order the select offers them.
 *
 * Exhaustive by type, so a sixth modality added to the union in src/domain/types.ts fails to
 * compile here rather than rendering its own identifier in the list. `MODALITIES` below is the
 * DISPLAY ORDER, which a Record cannot express; the two are kept together so the pairing is one
 * edit and not two.
 */
const MODALITY_KEY: Record<Modality, CopyKey> = {
  barbell: 'label.modality.barbell',
  dumbbell: 'label.modality.dumbbell',
  machine: 'label.modality.machine',
  cable: 'label.modality.cable',
  bodyweight: 'label.modality.bodyweight',
};

const MODALITIES: readonly Modality[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];

export function AddCustomExercise(props: { profile: Profile }): ReactElement {
  const { profile } = props;
  const c = useCopy();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [modality, setModality] = useState<Modality>('dumbbell');
  /**
   * The one line this form shows when it will not submit, or null. It is local state and not
   * `status.lastActionError`: the store's banner is for a schedule refusal the whole view has
   * to answer, and this is a field the user is still typing into.
   */
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const trimmed = name.trim();
    /*
     * P4 review item 1, first layer. `ExerciseSchema.name` is 1 to EXERCISE_NAME_MAX_CHARS
     * characters, and the trimmed name is what is stored, so the trimmed length is what is
     * checked. The bound is imported from the schema rather than restated, so the message and
     * the rule that rejects the record cannot drift apart. maxLength on the input below stops
     * a typed or pasted overrun; this stops one that reached the state by any other route
     * (an autofill, a composition event, a test) and, on the empty branch, says why nothing
     * happened where the old code returned in silence.
     */
    if (trimmed === '' || trimmed.length > EXERCISE_NAME_MAX_CHARS) {
      setError(
        FORMAT.outOfRange(
          c('quantity.exerciseName'),
          1, // [characters] ExerciseSchema.name minimum
          EXERCISE_NAME_MAX_CHARS, // [characters]
          c('unit.characters'),
        ),
      );
      return;
    }
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
      // profile.equipment is the user's EquipmentAccess (what they HAVE), not an Equipment tag
      // (what an exercise NEEDS): tag the custom exercise with every tier that access level
      // unlocks, per src/domain/types.ts ACCESS_UNLOCKS.
      equipment: [...ACCESS_UNLOCKS[profile.equipment]],
      videoQuery: `${trimmed} technique`,
      formCueId: null,
      note: null,
    };
    /*
     * P4 review item 1, second layer. `addCustomExercise` throws on a colliding id and on a
     * record the schema rejects, and this is a click handler: React does not catch a throw
     * from an event handler, so it escaped to the window and left the form sitting there with
     * no explanation. The catch turns it into the one line this form can show. The bonus-card
     * call is INSIDE the try and after it, so a refused record is never added to today's card.
     */
    try {
      // Through getState(): the store's actions are created once and never replace themselves,
      // so subscribing to one buys nothing and hands the component an unbound method.
      useAppStore.getState().addCustomExercise(profile.id, exercise);
      useAppStore.getState().addBonusExercise(exercise.id);
    } catch {
      // The thrown text names the store function and the id it minted, neither of which the
      // user chose or can act on, so the copy line is shown instead of the message.
      setError(c('status.customExerciseRefused'));
      return;
    }
    setError(null);
    setName('');
    setOpen(false);
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
    <div className="add-custom">
      <div className="unit-input">
        <label htmlFor="custom-exercise-name">{c('quantity.exerciseName')}</label>
        <input
          id="custom-exercise-name"
          type="text"
          autoComplete="off"
          // [characters] ExerciseSchema.name's own bound, imported rather than restated.
          maxLength={EXERCISE_NAME_MAX_CHARS}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            submit();
          }}
        />
      </div>
      <div className="unit-input">
        <label htmlFor="custom-exercise-modality">{c('label.equipment')}</label>
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
            // The value is the enum `Exercise.modality` persists; the label is copy. Rendering
            // the member as its own label made the model's identifiers user-facing text.
            <option key={m} value={m}>
              {c(MODALITY_KEY[m])}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(false);
        }}
      >
        {c('button.cancel')}
      </button>
      <button type="button" onClick={submit}>
        {c('button.saveExercise')}
      </button>
      {/*
       * role="alert" because it answers a control the user just pressed, and it is rendered
       * after the controls so a screen reader reaches it in the order the user caused it.
       */}
      {error !== null && (
        <p className="add-custom-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
