// src/ui/views/train/RestWordGame.tsx
//
// Rest Word, the first rest game (ROADMAP F1, docs/design/rest-games.md). A small DOM/CSS board:
// no canvas, media element, font request or network call. Its one picture is the owner's sprite
// sheet as a CSS background, a precached same-origin file (ownerSprite.css). It reads the rest
// timer and never writes it; RestTimerPanel mounts it inside a rest and unmounts it when that
// rest ends.
//
// Units: instants are epoch ms UTC [ms]; durations are seconds [s].
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { FORMAT, type CopyKey } from '../../../content/copy';
import {
  isRestWordGuess,
  restWordRound,
  scoreRestWordGuess,
  type RestWordRound,
  type RestWordTile,
} from '../../../domain/fun/restWord';
import type { RestGameContext, RestTimer } from '../../../domain/training/restTimer';
import { playRestGameCue, type RestGameCue } from '../../audio/restGameAudio';
import { OwnerSprite } from '../../components/OwnerSprite';
import { LossChomp } from './PixelMascot';

type RoundResult = 'won' | 'lost' | null;

/*
 * Alphabetical, six to a row, not QWERTY: a 44 px key (views.css) leaves room for six columns on
 * a 360 px phone and for ten on none, and a QWERTY row cut short stops being QWERTY. The last
 * row is Y, Z, then Delete and Submit at two columns each, so the grid closes square.
 */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TICK_MS = 1000; // [ms]
const S_PER_MIN = 60; // [s/min]
const MS_PER_S = 1000; // [ms/s]

export interface RestWordGameProps {
  timer: RestTimer;
  priorWins: number; // [rounds] in this lifting day, before this round begins
  /** ui.sounds; passed to every cue, which is silent when it is false. */
  soundsEnabled: boolean;
  t: (key: CopyKey) => string;
  overrides: Readonly<Partial<Record<CopyKey, string>>>;
  onExit: () => void;
  onWin: () => void;
}

function gameContext(timer: RestTimer): RestGameContext {
  if (timer.game === undefined) {
    throw new Error(
      'RestWordGame was mounted for a rest timer with no game identity. Mount it only when timer.game is set (RestTimerPanel does).',
    );
  }
  return timer.game;
}

/**
 * A hardware key belongs to the game only when nothing else claims it: focus on the page body or
 * inside the game itself. Enter on a focused Log Set or Skip control, or a letter typed into a
 * set field, is left alone, so the next set always logs with the board open.
 */
function keyIsForGame(event: KeyboardEvent, game: HTMLElement | null): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof Node)) return false;
  if (target === document.body || target === document.documentElement) return true;
  if (game === null || !game.contains(target)) return false;
  return !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement);
}

/**
 * One round inside one rest. Its own deadline is the earlier of the round clock and the rest's
 * end; winning, losing and leaving can never pause, skip or extend the prescribed rest.
 */
export function RestWordGame(props: RestWordGameProps): ReactElement {
  const { timer, priorWins, soundsEnabled, t, overrides, onExit, onWin } = props;
  const context = gameContext(timer);
  // Frozen for the life of this board: a win raises priorWins for the NEXT rest and must never
  // reshuffle the board the player just solved.
  const [round] = useState<RestWordRound>(() => restWordRound(context, timer.durationS, priorWins));
  const [openedAt] = useState<number>(() => Date.now()); // [ms] epoch UTC
  const [now, setNow] = useState<number>(() => Date.now()); // [ms] epoch UTC
  const [guesses, setGuesses] = useState<string[]>([]);
  const [scores, setScores] = useState<readonly (readonly RestWordTile[])[]>([]);
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<RoundResult>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // Read from the CURRENT timer each render, so the board can never outlive the rest it is in.
  const endsAt = Math.min(openedAt + round.durationS * MS_PER_S, timer.endsAt); // [ms] epoch UTC
  const remainingS = Math.max(0, Math.ceil((endsAt - now) / MS_PER_S)); // [s]
  const canEnter = result === null && remainingS > 0;

  const cue = (name: RestGameCue): void => {
    playRestGameCue(name, soundsEnabled);
  };

  const keyStates = useMemo(() => {
    const rank: Record<RestWordTile, number> = { absent: 1, present: 2, exact: 3 };
    const byLetter: Partial<Record<string, RestWordTile>> = {};
    scores.forEach((score, guessIndex) => {
      const guess = guesses[guessIndex] ?? '';
      score.forEach((state, letterIndex) => {
        const letter = guess[letterIndex];
        if (letter === undefined) return;
        const old = byLetter[letter];
        if (old === undefined || rank[state] > rank[old]) byLetter[letter] = state;
      });
    });
    return byLetter;
  }, [guesses, scores]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now()); // [ms] epoch UTC
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (result !== null || remainingS > 0) return;
    setResult('lost');
    playRestGameCue('lose', soundsEnabled);
  }, [remainingS, result, soundsEnabled]);

  const appendLetter = (letter: string): void => {
    if (!canEnter || draft.length >= round.wordLength) return;
    setDraft((value) => `${value}${letter.toLowerCase()}`);
  };

  const removeLetter = (): void => {
    if (!canEnter) return;
    setDraft((value) => value.slice(0, -1));
  };

  const submit = (): void => {
    if (!canEnter || !isRestWordGuess(draft, round.wordLength)) return;
    const score = scoreRestWordGuess(draft, round.target);
    setGuesses((value) => [...value, draft]);
    setScores((value) => [...value, score]);
    setDraft('');
    if (score.every((tile) => tile === 'exact')) {
      setResult('won');
      cue('win');
      onWin();
      return;
    }
    if (guesses.length + 1 >= round.maxGuesses) {
      setResult('lost');
      cue('lose');
      return;
    }
    cue('submit');
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!keyIsForGame(event, sectionRef.current)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        removeLetter();
        return;
      }
      if (/^[a-z]$/i.test(event.key)) {
        event.preventDefault();
        appendLetter(event.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  const minutes = Math.floor(remainingS / S_PER_MIN); // [min]
  const seconds = remainingS % S_PER_MIN; // [s]
  const mascotMood = result === 'won' ? 'win' : result === 'lost' ? 'lose' : 'idle';

  return (
    <section
      ref={sectionRef}
      className={`rest-game rest-word result-${result ?? 'active'}`}
      aria-labelledby="rest-word-title"
    >
      <div className="rest-game-topline">
        <div>
          <h3 id="rest-word-title">{t('hero.restWord')}</h3>
          <p>{t('advice.restWordRule')}</p>
        </div>
        <span className="rest-game-clock">{FORMAT.restRemaining(minutes, seconds, overrides)}</span>
      </div>

      <div className="rest-word-playfield">
        <div className="rest-word-grid" role="group" aria-label={t('label.restWordBoard')}>
          {Array.from({ length: round.maxGuesses }, (_, rowIndex) => {
            const guess = guesses[rowIndex] ?? (rowIndex === guesses.length ? draft : '');
            const score = scores[rowIndex];
            return (
              <div className="rest-word-row" key={rowIndex}>
                {Array.from({ length: round.wordLength }, (_, columnIndex) => (
                  <span className={`rest-word-tile ${score?.[columnIndex] ?? ''}`} key={columnIndex}>
                    {(guess[columnIndex] ?? '').toUpperCase()}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
        {/* The owner's sprite (stylize survey item 7): still through the round, one play on a
            win. The wrapper carries the mood, so a loss still shakes (train.css). */}
        <span className={`rest-game-mascot rest-game-mascot-${mascotMood}`}>
          <OwnerSprite play={result === 'won'} />
        </span>
        {result === 'lost' && <LossChomp />}
      </div>

      <p className="rest-game-result" aria-live="polite">
        {result === 'won' ? t('status.restWordWon') : result === 'lost' ? t('status.restWordLost') : ''}
      </p>

      {result === null && (
        <div className="rest-word-keyboard" role="group" aria-label={t('label.restWordKeyboard')}>
          {Array.from(LETTERS).map((letter) => (
            <button
              type="button"
              className={`rest-word-key ${keyStates[letter.toLowerCase()] ?? ''}`}
              disabled={!canEnter}
              key={letter}
              onClick={() => {
                appendLetter(letter);
              }}
            >
              {letter}
            </button>
          ))}
          <button type="button" className="rest-word-key rest-word-action" disabled={!canEnter} onClick={removeLetter}>
            {t('button.restWordDelete')}
          </button>
          <button
            type="button"
            className="rest-word-key rest-word-action"
            disabled={!canEnter || draft.length !== round.wordLength}
            onClick={submit}
          >
            {t('button.restWordSubmit')}
          </button>
        </div>
      )}

      {/* Always enabled: the board can be left at any moment, won, lost or mid-guess. */}
      <button type="button" className="rest-game-exit" onClick={onExit}>
        {t('button.restWordExit')}
      </button>
    </section>
  );
}
