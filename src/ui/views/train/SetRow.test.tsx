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
import type { Prescription, SkinId } from '../../../domain/types';
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
    onDelete: vi.fn(),
    ...patch,
  };
  render(<SetRow {...props} />);
}

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
