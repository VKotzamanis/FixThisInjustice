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
import { copy, copyFor } from '../../../content/copy';
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
