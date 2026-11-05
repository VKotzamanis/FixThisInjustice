import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../../content/copy';
import { REST_GAME_FORMAT } from '../../../content/restGameFormat';
import { reactionRound } from '../../../domain/fun/reaction';
import type { RestTimer } from '../../../domain/training/restTimer';
import { ReactionGame } from './ReactionGame';

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

const ROUND = reactionRound(TIMER.game!, TIMER.durationS, 0);

function renderGame() {
  const onExit = vi.fn();
  const onWin = vi.fn();
  const view = render(
    <ReactionGame
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

function pad(container: HTMLElement): HTMLButtonElement {
  const element = container.querySelector<HTMLButtonElement>('.rest-react-pad');
  if (element === null) throw new Error('no reaction pad');
  return element;
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms); // [ms]
  });
}

function start(): void {
  fireEvent.click(screen.getByRole('button', { name: copy('button.restGameReactionStart') }));
}

describe('ReactionGame (P6)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits, turns lime, and times the tap in milliseconds', () => {
    const { container } = renderGame();
    start();
    expect(pad(container).textContent).toBe(copy('label.restGameReactionWait'));
    advance(ROUND.delaysMs[0] ?? 0);
    expect(pad(container).textContent).toBe(copy('label.restGameReactionGo'));
    expect(pad(container).classList.contains('is-go')).toBe(true);
    advance(250);
    fireEvent.click(pad(container));
    expect(pad(container).textContent).toBe(REST_GAME_FORMAT.reactionTime(250));
  });

  it('counts a tap before lime as a foul', () => {
    const { container } = renderGame();
    start();
    advance(100);
    fireEvent.click(pad(container));
    expect(pad(container).textContent).toBe(copy('label.restGameReactionFoul'));
  });

  it('counts no tap inside the go window as a miss', () => {
    const { container } = renderGame();
    start();
    advance(ROUND.delaysMs[0] ?? 0);
    advance(ROUND.goWindowMs);
    expect(pad(container).textContent).toBe(copy('label.restGameReactionMissed'));
  });

  it('wins on three clean taps of five and shows the best time', () => {
    const { container, onWin } = renderGame();
    start();
    const times = [300, 250, 280, 260, 270]; // [ms]
    times.forEach((ms, i) => {
      advance(ROUND.delaysMs[i] ?? 0);
      advance(ms);
      fireEvent.click(pad(container));
      if (i < times.length - 1) advance(ROUND.feedbackMs);
    });
    expect(screen.getByText(copy('status.restWordWon'))).toBeInTheDocument();
    expect(screen.getByText(REST_GAME_FORMAT.reactionBest(250))).toBeInTheDocument();
    expect(onWin).toHaveBeenCalledTimes(1);
  });

  it('loses when fewer than three taps are clean', () => {
    const { container, onWin } = renderGame();
    start();
    for (let i = 0; i < 5; i += 1) {
      if (i > 0) advance(ROUND.feedbackMs);
      fireEvent.click(pad(container)); // a foul: the pad is still waiting
    }
    expect(screen.getByText(copy('status.restWordLost'))).toBeInTheDocument();
    expect(onWin).not.toHaveBeenCalled();
  });

  it('ends out of time when the round clock runs out first', () => {
    const { onWin } = renderGame();
    advance(60_000); // [ms] the 120 s rest's round is 60 s; Start was never tapped
    expect(screen.getByText(copy('status.restGameTimeUp'))).toBeInTheDocument();
    expect(onWin).not.toHaveBeenCalled();
    expect(TIMER.endsAt).toBe(NOW + 120_000); // [ms]
  });
});
