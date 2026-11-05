import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../../content/copy';
import { REST_GAME_FORMAT } from '../../../content/restGameFormat';
import { gymAnagramRound } from '../../../domain/fun/gymAnagram';
import type { RestTimer } from '../../../domain/training/restTimer';
import { GymAnagramGame } from './GymAnagramGame';

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

const ROUND = gymAnagramRound(TIMER.game!, TIMER.durationS, 0);
const FIRST = ROUND.puzzles[0]?.word ?? '';
const SECOND = ROUND.puzzles[1]?.word ?? '';

function renderGame() {
  const onExit = vi.fn();
  const onWin = vi.fn();
  const view = render(
    <GymAnagramGame
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

/** Taps the first free tile of each letter in turn. */
function spell(word: string): void {
  const group = screen.getByRole('group', { name: copy('label.restGameAnagramLetters') });
  for (const letter of word.toUpperCase()) {
    const tile = within(group)
      .getAllByRole('button', { name: letter })
      .find((button) => !(button as HTMLButtonElement).disabled);
    if (tile === undefined) throw new Error(`no free tile for ${letter}`);
    fireEvent.click(tile);
  }
}

function answerText(): string {
  const group = screen.getByRole('group', { name: copy('label.restGameAnagramAnswer') });
  return Array.from(group.querySelectorAll('.rest-anagram-slot'))
    .map((slot) => slot.textContent ?? '')
    .join('');
}

describe('GymAnagramGame (P6)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('solves two words and records one win without touching the timer', () => {
    const { onWin } = renderGame();
    spell(FIRST);
    expect(screen.getByText(REST_GAME_FORMAT.progress(1, 2))).toBeInTheDocument();
    spell(SECOND);
    expect(screen.getByText(copy('status.restWordWon'))).toBeInTheDocument();
    expect(onWin).toHaveBeenCalledTimes(1);
    expect(TIMER.endsAt).toBe(NOW + 120_000); // [ms]
  });

  it('strikes a used tile and locks it', () => {
    renderGame();
    const group = screen.getByRole('group', { name: copy('label.restGameAnagramLetters') });
    const tile = within(group).getAllByRole('button')[0] as HTMLButtonElement;
    fireEvent.click(tile);
    expect(tile).toBeDisabled();
    expect(tile.classList.contains('is-used')).toBe(true);
  });

  it('steps back with Undo Letter and Clear Answer', () => {
    renderGame();
    spell(FIRST.slice(0, 2));
    expect(answerText()).toBe(FIRST.slice(0, 2).toUpperCase());
    fireEvent.click(screen.getByRole('button', { name: copy('button.restGameAnagramUndo') }));
    expect(answerText()).toBe(FIRST.slice(0, 1).toUpperCase());
    fireEvent.click(screen.getByRole('button', { name: copy('button.restGameAnagramClear') }));
    expect(answerText()).toBe('');
  });

  it('clears a wrong full answer and says so', () => {
    renderGame();
    const group = screen.getByRole('group', { name: copy('label.restGameAnagramLetters') });
    // The scramble is never the word (engine test), so tapping the tiles in shown order is wrong.
    for (const tile of within(group).getAllByRole('button')) fireEvent.click(tile);
    expect(screen.getByText(copy('status.restGameAnagramWrong'))).toBeInTheDocument();
    expect(answerText()).toBe('');
  });

  it('ends out of time and reveals the word', () => {
    const { onWin } = renderGame();
    act(() => {
      vi.advanceTimersByTime(60_000); // [ms] the 120 s rest's round is 60 s
    });
    expect(screen.getByText(copy('status.restGameTimeUp'))).toBeInTheDocument();
    expect(screen.getByText(REST_GAME_FORMAT.answer(FIRST))).toBeInTheDocument();
    expect(onWin).not.toHaveBeenCalled();
  });
});
