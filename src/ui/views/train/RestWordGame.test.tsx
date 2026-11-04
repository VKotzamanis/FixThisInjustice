import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../../content/copy';
import { REST_GAME_FORMAT } from '../../../content/restGameFormat';
import { restWordRound, scoreRestWordGuess } from '../../../domain/fun/restWord';
import type { RestTimer } from '../../../domain/training/restTimer';
import { DEFAULT_REST_GAME_HOST, RestGameHostContext } from './restGameHost';
import { REST_WORD_ROWS, RestWordGame } from './RestWordGame';
// The game's own sources as text, for the offline check below (?raw, the convention the
// cursor and reminders suites use: node:fs has no typings under tsconfig.app.json).
import gameSource from './RestWordGame.tsx?raw';
import mascotSource from './PixelMascot.tsx?raw';
import spriteSource from '../../components/OwnerSprite.tsx?raw';
import engineSource from '../../../domain/fun/restWord.ts?raw';
import audioSource from '../../audio/restGameAudio.ts?raw';

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

const ROUND = restWordRound(TIMER.game!, TIMER.durationS, 0);

function renderGame(hidden = false) {
  const onExit = vi.fn();
  const onWin = vi.fn();
  const view = render(
    <RestGameHostContext value={{ ...DEFAULT_REST_GAME_HOST, hidden }}>
      <RestWordGame
        onExit={onExit}
        onWin={onWin}
        overrides={{}}
        priorWins={0}
        soundsEnabled={false}
        t={copy}
        timer={TIMER}
      />
    </RestGameHostContext>,
  );
  return { ...view, onExit, onWin };
}

function type(word: string): void {
  for (const letter of word.toUpperCase()) {
    fireEvent.click(screen.getByRole('button', { name: letter }));
  }
}

function enter(): void {
  fireEvent.click(screen.getByRole('button', { name: copy('button.restWordEnter') }));
}

function firstRowLetters(): string[] {
  const board = screen.getByRole('group', { name: copy('label.restWordBoard') });
  const row = board.querySelector('.rest-word-row');
  return Array.from(row?.querySelectorAll('.rest-word-tile') ?? []).map((tile) => tile.textContent ?? '');
}

describe('RestWordGame', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is a small DOM board and records one win without changing the lifting timer', () => {
    const { container, onWin } = renderGame();
    expect(container.querySelectorAll('canvas, img, audio')).toHaveLength(0);
    expect(container.querySelectorAll('*').length).toBeLessThan(120);

    type(ROUND.target);
    enter();

    expect(screen.getByText(copy('status.restWordWon'))).toBeInTheDocument();
    expect(onWin).toHaveBeenCalledTimes(1);
    expect(TIMER.endsAt).toBe(NOW + 120_000); // [ms] the game cannot extend a prescribed rest
  });

  it('lets the user leave immediately without recording a result', () => {
    const { onExit, onWin } = renderGame();
    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordExit') }));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onWin).not.toHaveBeenCalled();
  });

  it('ends out of time when the round clock runs out, and reveals the answer', () => {
    const { container, onWin } = renderGame();
    act(() => {
      vi.advanceTimersByTime(60_000); // [ms] the 120 s rest's round is 60 s
    });
    expect(screen.getByText(copy('status.restGameTimeUp'))).toBeInTheDocument();
    expect(screen.getByText(REST_GAME_FORMAT.answer(ROUND.target))).toBeInTheDocument();
    expect(container.querySelector('.rest-loss-chomp')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: copy('label.restWordKeyboard') })).toBeNull();
    expect(onWin).not.toHaveBeenCalled();
  });

  it('ends lost after the last guess, and reveals the answer', () => {
    renderGame();
    for (let i = 0; i < ROUND.maxGuesses; i += 1) {
      type('Z'.repeat(ROUND.wordLength));
      enter();
    }
    expect(screen.getByText(copy('status.restWordLost'))).toBeInTheDocument();
    expect(screen.getByText(REST_GAME_FORMAT.answer(ROUND.target))).toBeInTheDocument();
  });

  it('names every scored tile in words as well as by colour and shape', () => {
    renderGame();
    const guess = 'ABCDE'.slice(0, ROUND.wordLength);
    type(guess);
    enter();
    const label = { exact: 'label.restWordExact', present: 'label.restWordPresent', absent: 'label.restWordAbsent' } as const;
    const expected = scoreRestWordGuess(guess, ROUND.target).map(
      (state, i) => `${guess[i] ?? ''}, ${copy(label[state])}`,
    );
    const board = screen.getByRole('group', { name: copy('label.restWordBoard') });
    expect(within(board).getAllByRole('img').map((tile) => tile.getAttribute('aria-label'))).toEqual(expected);
  });

  it('shows a legend of the three tile states in words', () => {
    renderGame();
    expect(screen.getByText(copy('label.restWordExact'))).toBeInTheDocument();
    expect(screen.getByText(copy('label.restWordPresent'))).toBeInTheDocument();
    expect(screen.getByText(copy('label.restWordAbsent'))).toBeInTheDocument();
  });
});

/*
 * Stylize survey item 7: the owner's own sprite. P6 moves her into the end state: she plays her
 * 11 frames once on a win (ownerSprite.css runs one iteration) and stands still on a loss.
 */
describe("RestWordGame: the owner's sprite", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the board clear during play and plays her once on the win', () => {
    const { container } = renderGame();
    expect(container.querySelectorAll('.ll-sprite')).toHaveLength(0);
    type(ROUND.target);
    enter();
    expect(container.querySelectorAll('.ll-sprite')).toHaveLength(1);
    expect(container.querySelector('.ll-sprite')?.getAttribute('data-sprite')).toBe('playing');
  });

  it('holds her still on a loss', () => {
    const { container } = renderGame();
    act(() => {
      vi.advanceTimersByTime(60_000); // [ms]
    });
    expect(container.querySelector('.ll-sprite')?.getAttribute('data-sprite')).toBe('still');
  });

  it('shows frame 0 only under prefers-reduced-motion, win included', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    const { container } = renderGame();
    type(ROUND.target);
    enter();
    expect(screen.getByText(copy('status.restWordWon'))).toBeInTheDocument();
    expect(container.querySelector('.ll-sprite')?.getAttribute('data-sprite')).toBe('still');
  });
});

describe('RestWordGame: QWERTY keyboard (P6)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lays the keys out as QWERTY rows, with Enter and Del closing the last row', () => {
    renderGame();
    expect(REST_WORD_ROWS).toEqual(['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']);
    const keyboard = screen.getByRole('group', { name: copy('label.restWordKeyboard') });
    const names = within(keyboard)
      .getAllByRole('button')
      .map((key) => key.textContent);
    expect(names).toEqual([
      ...'QWERTYUIOP',
      ...'ASDFGHJKL',
      copy('button.restWordEnter'),
      ...'ZXCVBNM',
      copy('button.restWordDel'),
    ]);
  });

  it('removes the last letter with Del', () => {
    renderGame();
    type('AB');
    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordDel') }));
    expect(firstRowLetters().slice(0, 2)).toEqual(['A', '']);
  });

  it('leaves Enter on a control outside the game alone, so the next set still logs', () => {
    renderGame();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    // fireEvent returns false when a listener called preventDefault.
    expect(fireEvent.keyDown(outside, { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(outside, { key: 'a' })).toBe(true);
    outside.remove();
  });

  it('takes letters from a hardware keyboard when nothing else has focus', () => {
    const { onWin } = renderGame();
    for (const letter of ROUND.target) fireEvent.keyDown(document.body, { key: letter });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onWin).toHaveBeenCalledTimes(1);
  });

  it('takes no hardware key while the sheet hides the board', () => {
    const { onWin } = renderGame(true);
    for (const letter of ROUND.target) fireEvent.keyDown(document.body, { key: letter });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onWin).not.toHaveBeenCalled();
    expect(firstRowLetters().join('')).toBe('');
  });
});

describe('RestWordGame: offline (ROADMAP F1)', () => {
  it('makes no request and loads no media during a whole round', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { container } = renderGame();
    type('ABCDE'.slice(0, ROUND.wordLength));
    enter();
    act(() => {
      vi.advanceTimersByTime(60_000); // [ms] past the 120 s rest's 60 s round
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.querySelectorAll('img, audio, video, iframe, canvas, link, source')).toHaveLength(0);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('names no network API and no remote address in any game source', () => {
    const NETWORK = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|https?:\/\/|\bimport\s*\(/;
    for (const [file, text] of Object.entries({
      'RestWordGame.tsx': gameSource,
      'PixelMascot.tsx': mascotSource,
      'OwnerSprite.tsx': spriteSource,
      'restWord.ts': engineSource,
      'restGameAudio.ts': audioSource,
    })) {
      expect({ file, network: NETWORK.test(text) }).toEqual({ file, network: false });
    }
  });
});
