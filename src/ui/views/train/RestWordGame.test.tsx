import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../../content/copy';
import { restWordRound } from '../../../domain/fun/restWord';
import type { RestTimer } from '../../../domain/training/restTimer';
import { RestWordGame } from './RestWordGame';
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

function renderGame() {
  const onExit = vi.fn();
  const onWin = vi.fn();
  const renderResult = render(
    <RestWordGame
      onExit={onExit}
      onWin={onWin}
      overrides={{}}
      priorWins={0}
      soundsEnabled={false}
      t={copy}
      timer={TIMER}
    />,
  );
  return { ...renderResult, onExit, onWin };
}

describe('RestWordGame', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a small DOM board and records one win without changing the lifting timer', () => {
    const { container, onWin } = renderGame();
    // A CSS/DOM game, not a canvas, image, audio element or dependency-driven scene graph.
    expect(container.querySelectorAll('canvas, img, audio')).toHaveLength(0);
    expect(container.querySelectorAll('*').length).toBeLessThan(100);

    const target = restWordRound(TIMER.game!, TIMER.durationS, 0).target.toUpperCase();
    for (const letter of target) {
      fireEvent.click(screen.getByRole('button', { name: letter }));
    }
    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordSubmit') }));

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

  it('shows the code-native chomp loop when the stage clock expires', () => {
    const { container, onWin } = renderGame();
    act(() => {
      vi.advanceTimersByTime(60_000); // [ms] the 120-second-rest stage is one minute
    });

    expect(screen.getByText(copy('status.restWordLost'))).toBeInTheDocument();
    expect(container.querySelector('.rest-loss-chomp')).toBeInTheDocument();
    expect(container.querySelectorAll('img, canvas, audio')).toHaveLength(0);
    expect(onWin).not.toHaveBeenCalled();
  });
});

/*
 * Stylize survey item 7: the owner's own sprite replaces the ASCII stand-in for it. It holds its
 * still frame through the round and plays its 11 frames once on a win (ownerSprite.css runs one
 * iteration; OwnerSprite.test.tsx reads that). A loss does not play it.
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

  function win(): void {
    const target = restWordRound(TIMER.game!, TIMER.durationS, 0).target.toUpperCase();
    for (const letter of target) fireEvent.click(screen.getByRole('button', { name: letter }));
    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordSubmit') }));
  }

  it('holds frame 0 through the round and plays once on the win', () => {
    const { container } = renderGame();
    const sprite = container.querySelector('.ll-sprite');
    expect(container.querySelectorAll('.ll-sprite')).toHaveLength(1);
    expect(sprite?.getAttribute('data-sprite')).toBe('still');
    // The ASCII face it replaces is gone.
    expect(container.querySelector('pre.rest-game-mascot')).toBeNull();

    win();

    // The same element starts playing: not remounted, so the one-iteration animation runs once.
    expect(container.querySelector('.ll-sprite')).toBe(sprite);
    expect(sprite?.getAttribute('data-sprite')).toBe('playing');
    act(() => {
      vi.advanceTimersByTime(5_000); // [ms] the round clock ticks on; nothing restarts the play
    });
    expect(container.querySelector('.ll-sprite')).toBe(sprite);
  });

  it('does not play on a loss', () => {
    const { container } = renderGame();
    act(() => {
      vi.advanceTimersByTime(60_000); // [ms] the 120 s rest's 60 s round runs out
    });
    expect(screen.getByText(copy('status.restWordLost'))).toBeInTheDocument();
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
    win();
    expect(screen.getByText(copy('status.restWordWon'))).toBeInTheDocument();
    expect(container.querySelector('.ll-sprite')?.getAttribute('data-sprite')).toBe('still');
  });
});

describe('RestWordGame: phone keyboard (ROADMAP F1)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('has one on-screen key per letter, A to Z, plus Delete and Submit', () => {
    renderGame();
    const keyboard = screen.getByRole('group', { name: copy('label.restWordKeyboard') });
    const names = within(keyboard)
      .getAllByRole('button')
      .map((key) => key.textContent);
    expect(names).toEqual([
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      copy('button.restWordDelete'),
      copy('button.restWordSubmit'),
    ]);
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
    const target = restWordRound(TIMER.game!, TIMER.durationS, 0).target;
    for (const letter of target) fireEvent.keyDown(document.body, { key: letter });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onWin).toHaveBeenCalledTimes(1);
  });
});

describe('RestWordGame: offline (ROADMAP F1)', () => {
  it('makes no request and loads no media during a whole round', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { container } = renderGame();
    for (const letter of 'ABCDE') fireEvent.click(screen.getByRole('button', { name: letter }));
    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordSubmit') }));
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
