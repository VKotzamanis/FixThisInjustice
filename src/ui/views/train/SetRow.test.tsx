// src/ui/views/train/SetRow.test.tsx
//
// The set row's copy contract (P8 close-out C).
//
// This suite exists because of the ONE structural decision in the Train migration: SetRow is
// mounted up to six times per exercise card and up to eight cards deep, so it does not call
// `useCopy()` - TrainView reads the hook once and threads the lookup down as `t`. The third
// case below is what pins that: the store says limelight while the prop says clinical, and the
// row renders what the PROP says. A row that had quietly grown its own subscription would
// render the limelight word there and fail.
//
// Every skin assertion is made BY KEY through `copy`/`copyFor`, never against a literal, so a
// reworded table moves the expectation with the string it is about.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FORMAT, SKIN_COPY, copy, copyFor, type CopyKey } from '../../../content/copy';
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
    t: lookup('clinical'),
    overrides: SKIN_COPY.clinical,
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

describe('SetRow: the clinical words', () => {
  it('names the log control from the default table', () => {
    withSkin('clinical');
    renderRow();
    expect(screen.getByRole('button', { name: FORMAT.logSetLabel(1) }).textContent).toBe(
      copy('button.logSet'),
    );
  });

  it('marks a bonus row with the default label', () => {
    withSkin('clinical');
    renderRow({ isBonus: true });
    expect(screen.getByText(copy('label.bonusSet'))).toBeInTheDocument();
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
    // The store says limelight and both props say clinical. The counter follows the props,
    // which is the same guarantee the case below makes for the lookup.
    withSkin('limelight');
    renderRow({ t: lookup('clinical'), overrides: SKIN_COPY.clinical });

    expect(screen.getByText(FORMAT.setCounter(1, 3))).toBeInTheDocument();
    expect(screen.queryByText(FORMAT.setCounter(1, 3, SKIN_COPY.limelight))).toBeNull();
  });

  it('reads the prop and never the store, so a row cannot subscribe on its own', () => {
    // The store is limelight; the prop is clinical. The prop wins, which is the whole of the
    // "read the hook once at the view" decision, asserted rather than assumed.
    withSkin('limelight');
    renderRow({ t: lookup('clinical') });

    const control = screen.getByRole('button', { name: FORMAT.logSetLabel(1) });
    expect(control.textContent).toBe(copy('button.logSet'));
    expect(control.textContent).not.toBe(copyFor('limelight', 'button.logSet'));
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
describe('SetRow under the departures board', () => {
  it('mounts and falls through to the default words for every key it renders', () => {
    withSkin('board');
    expect(() => {
      renderRow({ t: lookup('board'), overrides: SKIN_COPY.board });
    }).not.toThrow();

    expect(copyFor('board', 'button.logSet')).toBe(copy('button.logSet'));
    expect(screen.getByRole('button', { name: FORMAT.logSetLabel(1) }).textContent).toBe(
      copyFor('board', 'button.logSet'),
    );
    // The counter reads `status.setCounter`, which the board table does not carry either, so
    // the overlay resolves to the default readout.
    expect(screen.getByText(FORMAT.setCounter(1, 3, SKIN_COPY.board))).toBeInTheDocument();
  });
});
