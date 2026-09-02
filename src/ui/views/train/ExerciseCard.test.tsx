// src/ui/views/train/ExerciseCard.test.tsx
//
// The exercise card's copy contract (P8 close-out C).
//
// The card does not call `useCopy()` either: it takes the lookup as `t` and forwards it to
// every SetRow it mounts, so the second case below - a limelight string rendered by a CHILD
// row - is what pins the threading, not just the card's own controls.
//
// The coach line is asserted through the KEY the card mints. `coachLine()` returns
// `{ key, params }` and TrainView resolves it against the active overlay, so the property this
// suite can prove here is that the key the card reports is one the limelight table names and
// that `FORMAT.withSlots` renders the skin sentence for it. TrainView.test.tsx asserts the
// rendered toast on the other side of the same handoff.
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMAT, SKIN_COPY, copy, copyFor, type CopyKey } from '../../../content/copy';
import { EXERCISE_BY_ID } from '../../../domain/plan/library';
import type { CoachLine } from '../../../domain/training/coach';
import type { Exercise, SkinId } from '../../../domain/types';
import { useAppStore } from '../../../store';
import { makeAppState, makeProfile, makeUiPrefs } from '../../../test/funFixtures';
import { makeBlock, makePlannedExercise } from '../../../test/fixtures';
import { TrainingModalsProvider } from '../../components/TrainingModalsProvider';
import { ExerciseCard } from './ExerciseCard';

const BENCH: Exercise = (() => {
  const ex = EXERCISE_BY_ID['barbell-bench-press'];
  if (ex === undefined) throw new Error('library.ts no longer defines barbell-bench-press');
  return ex;
})();

const TODAY = '2026-03-02';
/** [ms] epoch UTC. 12:00 on 2026-03-02 in Europe/Athens, the fixture profile's zone. */
const NOW = Date.UTC(2026, 2, 2, 10, 0, 0);

function lookup(skin: SkinId): (key: CopyKey) => string {
  return (key) => copyFor(skin, key);
}

function withSkin(skin: SkinId): void {
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin }) }));
}

function renderCard(skin: SkinId, onCoach: (line: CoachLine, specimen: string | null) => void): void {
  withSkin(skin);
  render(
    <TrainingModalsProvider>
      <ExerciseCard
        t={lookup(skin)}
        overrides={SKIN_COPY[skin]}
        profile={makeProfile()}
        exercise={BENCH}
        planned={makePlannedExercise({ exerciseId: BENCH.id })}
        block={makeBlock()}
        library={{ [BENCH.id]: BENCH }}
        assignmentDate={TODAY}
        sessionId="session-1"
        isBonusExercise={false}
        isOpen
        onToggle={vi.fn()}
        onCoach={onCoach}
        onDeleted={vi.fn()}
      />
    </TrainingModalsProvider>,
  );
}

/** Enters a load and a rep count into row `n` and submits with Enter. */
function logRow(n: number, load: string, reps: string): void {
  const loadField = screen.getByLabelText(`${FORMAT.setLoadQuantity(n)} (kg)`);
  fireEvent.change(loadField, { target: { value: load } });
  const repsField = screen.getByLabelText(FORMAT.setRepsQuantity(n));
  fireEvent.change(repsField, { target: { value: reps } });
  fireEvent.keyDown(repsField, { key: 'Enter' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

describe('ExerciseCard: the clinical words', () => {
  it('names the extra-row control and the disclosure from the default table', () => {
    renderCard('clinical', vi.fn());
    expect(screen.getByRole('button', { name: copy('button.addSet') })).toBeInTheDocument();
    expect(screen.getByText(copy('disclosure.why'))).toBeInTheDocument();
  });
});

describe('ExerciseCard: the limelight voice', () => {
  it('renders the skin string on its own control', () => {
    renderCard('limelight', vi.fn());
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.addSet') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy('button.addSet') })).toBeNull();
  });

  it('forwards the same lookup to every set row it mounts', () => {
    // The rows read `t`, not the store (SetRow.test.tsx), so this is the assertion that the
    // card actually passes it down rather than each row growing its own subscription.
    renderCard('limelight', vi.fn());
    // By TEXT, not by role name: the log control's accessible name is its aria-label
    // (`FORMAT.logSetLabel`, which numbers the row and carries no copy key), and the string
    // under test is the visible one.
    const rows = screen.getAllByText(copyFor('limelight', 'button.logSet'));
    expect(rows.length).toBeGreaterThan(0);
    expect(screen.queryByText(copy('button.logSet'))).toBeNull();
  });

  it('forwards the overlay to every set row as well as the lookup', () => {
    /*
     * P8 close-out D. The counter is `FORMAT.setCounter`, which reads `status.setCounter`, so
     * the rows need the TABLE and not only the lookup. Same argument as `t`: read once at the
     * view, threaded through this card, never subscribed to per row.
     */
    renderCard('limelight', vi.fn());
    // makePlannedExercise prescribes setsLo 3 and makeBlock leaves the modifier at 1.
    expect(screen.getByText(FORMAT.setCounter(1, 3, SKIN_COPY.limelight))).toBeInTheDocument();
    expect(screen.queryByText(FORMAT.setCounter(1, 3))).toBeNull();
  });

  it('leaves the prescription line clinical, which is what the table says about it', () => {
    // `status.setsBy` carries no limelight row (copy.test.ts records why: the mockup's own card
    // renders the clinical string). The card still resolves it THROUGH the overlay, so this is
    // the case that fails if a row is added without revisiting the decision.
    renderCard('limelight', vi.fn());
    expect(
      screen.getByText(FORMAT.setsBy('3', '6\u20138 reps', SKIN_COPY.limelight)),
    ).toBeInTheDocument();
    expect(screen.getByText(FORMAT.setsBy('3', '6\u20138 reps'))).toBeInTheDocument();
  });

  it('reports a coach line whose key the skin table names', () => {
    const onCoach = vi.fn<(line: CoachLine, specimen: string | null) => void>();
    renderCard('limelight', onCoach);

    logRow(1, '60', '8');

    expect(onCoach).toHaveBeenCalledTimes(1);
    const line = onCoach.mock.calls[0]?.[0];
    if (line === undefined) throw new Error('the card reported no coach line');
    // Resolved the way TrainView resolves it: the same key, the same params, the skin overlay.
    const limelight = FORMAT.withSlots(line.key, line.params, SKIN_COPY.limelight);
    expect(limelight).toBe(copyFor('limelight', line.key).replace('{load}', '60 kg').replace('{reps}', '8'));
    expect(limelight).not.toBe(FORMAT.withSlots(line.key, line.params));
  });
});
