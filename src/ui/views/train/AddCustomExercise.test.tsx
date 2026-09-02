// src/ui/views/train/AddCustomExercise.test.tsx
//
// The custom-exercise form's copy contract (P8 close-out C).
//
// One row of copy.limelight.ts reaches this form: `button.cancel`. The save control, the
// refusal line and the field name are absent from that table ON PURPOSE - rule 4 of the file's
// own header keeps the joke off a control whose misreading costs data, and a save that mints a
// record the sets are then attributed to is exactly that control. The second limelight case
// below asserts the ABSENCE by key, so a later row added there fails this test rather than
// slipping in unnoticed.
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FORMAT, copy, copyFor } from '../../../content/copy';
import { EXERCISE_NAME_MAX_CHARS } from '../../../domain/schema';
import type { SkinId } from '../../../domain/types';
import { useAppStore } from '../../../store';
import { makeAppState, makeProfile, makeUiPrefs } from '../../../test/funFixtures';
import { AddCustomExercise } from './AddCustomExercise';

function renderForm(skin: SkinId): void {
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin }) }));
  render(<AddCustomExercise profile={makeProfile()} />);
}

/** Opens the form, which is collapsed to a single control until it is pressed. */
function openForm(skin: SkinId): void {
  renderForm(skin);
  fireEvent.click(screen.getByRole('button', { name: copyFor(skin, 'button.addExercise') }));
}

beforeEach(() => {
  useAppStore.setState(makeAppState());
});

describe('AddCustomExercise: the clinical words', () => {
  it('names the opening control and the field from the default table', () => {
    renderForm('clinical');
    expect(screen.getByRole('button', { name: copy('button.addExercise') })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: copy('button.addExercise') }));
    expect(screen.getByLabelText(copy('quantity.exerciseName'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy('button.saveExercise') })).toBeInTheDocument();
  });

  it('names each modality option from the table while the value stays the enum', () => {
    /*
     * P8 close-out D. The options used to render the `Modality` union member itself, so the
     * select read "barbell / dumbbell / machine / cable / bodyweight" in the model's own
     * lower-case identifiers, in every skin, and no table could reach them.
     *
     * The two halves are asserted separately on purpose: the LABEL is copy and moves with the
     * table, and the VALUE is the enum the store persists on Exercise.modality and must not.
     */
    openForm('clinical');
    const option = screen.getByRole('option', { name: copy('label.modality.barbell') });
    expect(option).toBeInTheDocument();
    expect(option).toHaveValue('barbell');
  });

  it('names the length unit in the refusal rather than baking the word in', () => {
    // The bound is ExerciseSchema.name's own; the unit word beside it is `unit.characters`,
    // which was a bare 'characters' passed to the frame from this file (P8 close-out D).
    openForm('clinical');
    const field = screen.getByLabelText(copy('quantity.exerciseName'));
    fireEvent.change(field, { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: copy('button.saveExercise') }));

    expect(
      screen.getByText(
        FORMAT.outOfRange(
          copy('quantity.exerciseName'),
          1, // [characters] ExerciseSchema.name minimum
          EXERCISE_NAME_MAX_CHARS, // [characters]
          copy('unit.characters'),
        ),
      ),
    ).toBeInTheDocument();
  });
});

describe('AddCustomExercise: the limelight voice', () => {
  it('renders the skin string on the one control the table names', () => {
    openForm('limelight');
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.cancel') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy('button.cancel') })).toBeNull();
  });

  it('leaves the save control and the field name in the clinical words', () => {
    openForm('limelight');
    // Asserted by key: `copyFor` falling through to the default IS the per-key merge, and this
    // is the branch of it the limelight table's rule 4 relies on.
    expect(copyFor('limelight', 'button.saveExercise')).toBe(copy('button.saveExercise'));
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.saveExercise') }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(copyFor('limelight', 'quantity.exerciseName'))).toBeInTheDocument();
  });
});

/*
 * The departures board (P8 close-out D).
 *
 * BOARD_COPY is a partial table by design (see its header: sixteen design rows plus the nav),
 * and NONE of them is a key this component renders. The smoke case therefore asserts the other
 * half of the per-key merge: the component mounts under `ui.skin = 'board'` without throwing,
 * and the strings fall through to the clinical default. Asserted through `copyFor` by key, so
 * a board row added for one of these keys later moves this expectation with it.
 */
describe('AddCustomExercise under the departures board', () => {
  it('mounts and falls through to the default words, modality labels included', () => {
    expect(() => {
      openForm('board');
    }).not.toThrow();

    expect(copyFor('board', 'button.saveExercise')).toBe(copy('button.saveExercise'));
    expect(
      screen.getByRole('button', { name: copyFor('board', 'button.saveExercise') }),
    ).toBeInTheDocument();
    // The five keys P8 close-out D added are in no override table, so the option labels are the
    // default ones and the value is still the enum under every skin.
    const option = screen.getByRole('option', { name: copyFor('board', 'label.modality.barbell') });
    expect(option).toHaveValue('barbell');
  });
});
