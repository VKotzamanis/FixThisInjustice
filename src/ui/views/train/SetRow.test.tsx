// src/ui/views/train/SetRow.test.tsx
//
// The set row's copy contract (P8 close-out C).
//
// This suite exists because of the ONE structural decision in the Train migration: SetRow is
// mounted up to six times per exercise card and up to eight cards deep, so it does not call
// `useCopy()` - TrainView reads the hook once and threads the lookup down as `t`. The last
// cases below pin that: the store says limelight while the prop supplies its own label (or an
// empty overlay), and the row renders what the PROP says. A row that had quietly grown its own
// subscription would render the limelight word there and fail.
//
// Every skin assertion is made BY KEY through `copy`/`copyFor`, never against a literal, so a
// reworded table moves the expectation with the string it is about.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FORMAT, SKIN_COPY, copyFor, type CopyKey } from '../../../content/copy';
import { useAppStore } from '../../../store';
import { makeAppState, makeUiPrefs } from '../../../test/funFixtures';
import { makeSet } from '../../../test/fixtures';
import type { LoggedSet, Prescription, SkinId } from '../../../domain/types';
import { SetRow, type SetRowProps } from './SetRow';

/** The lookup the view would hand down, resolved for one skin. */
function lookup(skin: SkinId): (key: CopyKey) => string {
  return (key) => copyFor(skin, key);
}

function withSkin(skin: SkinId): void {
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin }) }));
}

const REPS: Prescription = { kind: 'reps', lo: 6, hi: 8 }; // [repetitions]
const TIMED: Prescription = { kind: 'time', targetS: 45 }; // [s]

function renderRow(patch: Partial<SetRowProps> = {}): void {
  const props: SetRowProps = {
    t: lookup('limelight'),
    overrides: SKIN_COPY.limelight,
    domIdPrefix: 'ex-test',
    n: 1,
    targetSets: 3, // [sets]
    isBonus: false,
    units: 'metric',
    prescription: REPS,
    suggestedKg: 60, // [kg]
    logged: null,
    isBodyweightExercise: false,
    onLog: vi.fn(),
    onEdit: vi.fn(() => true),
    onDelete: vi.fn(),
    ...patch,
  };
  render(<SetRow {...props} />);
}

/** A set already logged on row 1: 60 kg x 8 unless patched. */
function loggedSet(patch: Partial<LoggedSet> = {}): LoggedSet {
  return makeSet({ id: 'set-1', setNumber: 1, loadKg: 60, reps: 8, durationS: null, ...patch });
}

describe('SetRow: editing a logged set (ROADMAP L1)', () => {
  it('offers Edit beside Delete on a logged row', () => {
    withSkin('limelight');
    renderRow({ logged: loggedSet() });
    const edit = screen.getByRole('button', { name: FORMAT.editSetLabel(1) });
    expect(edit.textContent).toBe(copyFor('limelight', 'button.editSet'));
    expect(screen.getByRole('button', { name: FORMAT.deleteSetLabel(1) })).toBeInTheDocument();
  });

  it('reopens the row prefilled with what was logged and saves the change', () => {
    withSkin('limelight');
    const onEdit = vi.fn(() => true);
    renderRow({ logged: loggedSet(), onEdit });
    fireEvent.click(screen.getByRole('button', { name: FORMAT.editSetLabel(1) }));

    const load = screen.getByLabelText(`${FORMAT.setLoadQuantity(1)} (kg)`);
    const reps = screen.getByLabelText(FORMAT.setRepsQuantity(1));
    expect(load).toHaveValue(60); // UnitInput is a number input
    expect(reps).toHaveValue('8');

    fireEvent.change(load, { target: { value: '62.5' } });
    fireEvent.change(reps, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: FORMAT.saveSetLabel(1) }));

    expect(onEdit).toHaveBeenCalledWith(62.5, { reps: 6, durationS: null }); // [kg], [repetitions]
    // Saved: the row is a readout again.
    expect(screen.queryByRole('button', { name: FORMAT.saveSetLabel(1) })).toBeNull();
  });

  it('prefills the bodyweight toggle from a 0 kg set and can clear it', () => {
    withSkin('limelight');
    const onEdit = vi.fn(() => true);
    renderRow({ logged: loggedSet({ loadKg: 0, reps: 12 }), onEdit });
    fireEvent.click(screen.getByRole('button', { name: FORMAT.editSetLabel(1) }));

    const toggle = screen.getByLabelText(FORMAT.setBodyweightQuantity(1));
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText(`${FORMAT.setLoadQuantity(1)} (kg)`), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: FORMAT.saveSetLabel(1) }));

    expect(onEdit).toHaveBeenCalledWith(10, { reps: 12, durationS: null });
  });

  it('edits a hold in seconds', () => {
    withSkin('limelight');
    const onEdit = vi.fn(() => true);
    renderRow({
      prescription: TIMED,
      logged: loggedSet({ loadKg: 0, reps: null, durationS: 45 }),
      onEdit,
    });
    fireEvent.click(screen.getByRole('button', { name: FORMAT.editSetLabel(1) }));
    const field = screen.getByLabelText(`${FORMAT.setDurationQuantity(1)} (s)`);
    expect(field).toHaveValue(45); // [s]
    fireEvent.change(field, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: FORMAT.saveSetLabel(1) }));

    expect(onEdit).toHaveBeenCalledWith(0, { reps: null, durationS: 50 }); // [kg], [s]
  });

  it('cancels without saving', () => {
    withSkin('limelight');
    const onEdit = vi.fn(() => true);
    renderRow({ logged: loggedSet(), onEdit });
    fireEvent.click(screen.getByRole('button', { name: FORMAT.editSetLabel(1) }));
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.cancel') }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: FORMAT.editSetLabel(1) })).toBeInTheDocument();
  });

  it('stays open and says so when the store refuses the edit', () => {
    withSkin('limelight');
    renderRow({ logged: loggedSet(), onEdit: vi.fn(() => false) });
    fireEvent.click(screen.getByRole('button', { name: FORMAT.editSetLabel(1) }));
    fireEvent.click(screen.getByRole('button', { name: FORMAT.saveSetLabel(1) }));

    expect(screen.getByRole('alert').textContent).toBe(
      copyFor('limelight', 'status.sessionEditRefused'),
    );
    expect(screen.getByRole('button', { name: FORMAT.saveSetLabel(1) })).toBeInTheDocument();
  });
});

describe('SetRow: the limelight words', () => {
  it('names the log control from the default table', () => {
    withSkin('limelight');
    renderRow();
    expect(screen.getByRole('button', { name: FORMAT.logSetLabel(1) }).textContent).toBe(
      copyFor('limelight', 'button.logSet'),
    );
  });

  it('marks a bonus row with the default label', () => {
    withSkin('limelight');
    renderRow({ isBonus: true });
    expect(screen.getByText(copyFor('limelight', 'label.bonusSet'))).toBeInTheDocument();
  });
});

describe('SetRow: the limelight voice', () => {
  it('renders the skin string on the log control', () => {
    withSkin('limelight');
    renderRow({ t: lookup('limelight') });
    expect(screen.getByRole('button', { name: FORMAT.logSetLabel(1) }).textContent).toBe(
      copyFor('limelight', 'button.logSet'),
    );
  });

  it('states an unusable hold in the skin words', () => {
    withSkin('limelight');
    renderRow({ t: lookup('limelight'), prescription: TIMED });

    // A duration of 0 is refused by the row itself rather than by the store, so the message is
    // this file's to render (see MAX_DURATION_S).
    const field = screen.getByLabelText(`${FORMAT.setDurationQuantity(1)} (s)`);
    fireEvent.change(field, { target: { value: '0' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(screen.getByText(copyFor('limelight', 'advice.durationNeeded'))).toBeInTheDocument();
  });

  it('counts the row through the overlay it is handed', () => {
    /*
     * P8 close-out D. `FORMAT.setCounter` reads `status.setCounter`, which the limelight table
     * words as "set {n} of {targetSets}". The table arrives as a PROP beside `t`, for the
     * reason `t` is a prop: one subscription at the view, not one per row.
     */
    withSkin('limelight');
    renderRow({ t: lookup('limelight'), overrides: SKIN_COPY.limelight });

    expect(screen.getByText(FORMAT.setCounter(1, 3, SKIN_COPY.limelight))).toBeInTheDocument();
    expect(screen.queryByText(FORMAT.setCounter(1, 3))).toBeNull();
  });

  it('reads the overlay prop and never the store either', () => {
    // The store says limelight while the prop deliberately supplies no override.
    withSkin('limelight');
    renderRow({ t: lookup('limelight'), overrides: {} });

    expect(screen.getByText(FORMAT.setCounter(1, 3))).toBeInTheDocument();
    expect(screen.queryByText(FORMAT.setCounter(1, 3, SKIN_COPY.limelight))).toBeNull();
  });

  it('reads the prop and never the store, so a row cannot subscribe on its own', () => {
    const propLabel = 'prop-supplied log label';
    withSkin('limelight');
    renderRow({
      t: (key) => (key === 'button.logSet' ? propLabel : copyFor('limelight', key)),
    });

    const control = screen.getByRole('button', { name: FORMAT.logSetLabel(1) });
    expect(control.textContent).toBe(propLabel);
    expect(control.textContent).not.toBe(copyFor('limelight', 'button.logSet'));
  });
});
