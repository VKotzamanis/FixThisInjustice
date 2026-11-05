import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../../content/copy';
import { REST_GAME_FORMAT } from '../../../content/restGameFormat';
import { sequenceRound } from '../../../domain/fun/sequenceRecall';
import type { RestTimer } from '../../../domain/training/restTimer';
import { DEFAULT_REST_GAME_HOST, RestGameHostContext } from './restGameHost';
import { SequenceRecallGame } from './SequenceRecallGame';

const NOW = Date.UTC(2026, 8, 11, 12, 0, 0); // [ms] epoch UTC

const TIMER: RestTimer = {
  startedAt: NOW,
  endsAt: NOW + 120_000, // [ms]
  durationS: 120, // [s]
  game: {
    exerciseId: 'barbell-bench-press',
    sessionId: 'session-1',
    assignmentDate: '2026-09-11',
    setNumber: 1,
    sessionSetOrdinal: 1,
  },
};

const ROUND = sequenceRound(TIMER.game!, TIMER.durationS, 0);
const STRIDE_MS = ROUND.stepMs + ROUND.gapMs; // [ms]

function renderGame() {
  const onExit = vi.fn();
  const onWin = vi.fn();
  const view = render(
    <SequenceRecallGame
      timer={TIMER}
      priorWins={0}
      soundsEnabled={false}
      t={copy}
      overrides={{}}
      onExit={onExit}
      onWin={onWin}
    />,
  );
  return { ...view, onExit, onWin };
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms); // [ms]
  });
}

function padButton(pad: number): HTMLElement {
  return screen.getByRole('button', { name: REST_GAME_FORMAT.sequencePad(pad + 1) });
}

/** The pause, then the whole showing of a level of `length` steps. */
function watch(length: number): void {
  advance(ROUND.pauseMs);
  advance(length * STRIDE_MS);
}

function repeat(length: number): void {
  for (let i = 0; i < length; i += 1) fireEvent.click(padButton(ROUND.sequence[i] ?? 0));
}

describe('SequenceRecallGame (P6)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lights the first step after a short pause, with every pad locked while it shows', () => {
    const { container } = renderGame();
    advance(ROUND.pauseMs);
    advance(0);
    const lit = container.querySelector('.rest-seq-pad.is-lit');
    expect(lit?.getAttribute('aria-label')).toBe(REST_GAME_FORMAT.sequencePad((ROUND.sequence[0] ?? 0) + 1));
    expect(screen.getByText(copy('label.restGameSequenceWatch'))).toBeInTheDocument();
    expect(padButton(0)).toBeDisabled();
  });

  it('hands over after the showing and grows by one on a correct repeat', () => {
    renderGame();
    watch(2);
    expect(screen.getByText(copy('label.restGameSequenceRepeat'))).toBeInTheDocument();
    expect(padButton(0)).toBeEnabled();
    repeat(2);
    expect(screen.getByText(REST_GAME_FORMAT.sequenceLength(3, ROUND.goalLength))).toBeInTheDocument();
  });

  it('wins when the goal length is repeated', () => {
    const { onWin } = renderGame();
    for (let length = ROUND.startLength; length <= ROUND.goalLength; length += 1) {
      watch(length);
      repeat(length);
    }
    expect(screen.getByText(copy('status.restWordWon'))).toBeInTheDocument();
    expect(screen.getByText(REST_GAME_FORMAT.sequenceLength(ROUND.goalLength, ROUND.goalLength))).toBeInTheDocument();
    expect(onWin).toHaveBeenCalledTimes(1);
  });

  it('ends lost on a wrong pad', () => {
    const { onWin } = renderGame();
    watch(2);
    fireEvent.click(padButton(((ROUND.sequence[0] ?? 0) + 1) % ROUND.padCount));
    expect(screen.getByText(copy('status.restWordLost'))).toBeInTheDocument();
    expect(onWin).not.toHaveBeenCalled();
  });

  it('replays the level from its pause when the sheet is shown again after a Hide mid-showing (R-G1)', () => {
    const element = (hidden: boolean) => (
      <RestGameHostContext value={{ ...DEFAULT_REST_GAME_HOST, hidden }}>
        <SequenceRecallGame
          timer={TIMER}
          priorWins={0}
          soundsEnabled={false}
          t={copy}
          overrides={{}}
          onExit={vi.fn()}
          onWin={vi.fn()}
        />
      </RestGameHostContext>
    );
    const { container, rerender } = render(element(false));
    advance(ROUND.pauseMs);
    advance(0);
    expect(container.querySelector('.rest-seq-pad.is-lit')).not.toBeNull();
    rerender(element(true));
    // Hidden: nothing lights and the turn never hands over, however long the sheet stays down.
    advance(10_000); // [ms] well inside the 60 s round clock
    expect(container.querySelector('.rest-seq-pad.is-lit')).toBeNull();
    expect(screen.queryByText(copy('label.restGameSequenceRepeat'))).toBeNull();
    rerender(element(false));
    // Shown again: the whole level is shown from its first step, then the turn is the user's.
    advance(ROUND.pauseMs);
    advance(0);
    expect(container.querySelector('.rest-seq-pad.is-lit')?.getAttribute('aria-label')).toBe(
      REST_GAME_FORMAT.sequencePad((ROUND.sequence[0] ?? 0) + 1),
    );
    advance(2 * STRIDE_MS);
    expect(screen.getByText(copy('label.restGameSequenceRepeat'))).toBeInTheDocument();
    repeat(2);
    expect(screen.getByText(REST_GAME_FORMAT.sequenceLength(3, ROUND.goalLength))).toBeInTheDocument();
  });

  it('ends out of time when the round clock runs out', () => {
    const { onWin } = renderGame();
    advance(60_000); // [ms] the 120 s rest's round is 60 s
    expect(screen.getByText(copy('status.restGameTimeUp'))).toBeInTheDocument();
    expect(onWin).not.toHaveBeenCalled();
    expect(TIMER.endsAt).toBe(NOW + 120_000); // [ms]
  });
});
