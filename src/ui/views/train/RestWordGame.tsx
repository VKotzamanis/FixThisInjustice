// src/ui/views/train/RestWordGame.tsx
//
// Rest Word, the first rest game (ROADMAP F1; redesigned in P6, R10). A DOM/CSS board inside
// RestGameFrame: QWERTY keys sized from the sheet's width (restGames.css, plan D2), tiles that say
// their state in words to a screen reader and by shape to the eye (pink solid with an ink bar,
// lime dashed, grey struck through), a round clock, and the answer on a loss. No canvas, media
// element, font request or network call. It reads the rest timer and never writes it.
//
// Units: instants are epoch ms UTC [ms]; durations are seconds [s].
import { Fragment, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { CopyKey } from '../../../content/copy';
import {
  isRestWordGuess,
  restWordRound,
  scoreRestWordGuess,
  type RestWordRound,
  type RestWordTile,
} from '../../../domain/fun/restWord';
import { playRestGameCue } from '../../audio/restGameAudio';
import { RestGameFrame, type RestGameResult } from './RestGameFrame';
import { useRestGameHost } from './restGameHost';
import { gameContext, type RestGameCopy, type RestGameProps } from './restGameProps';
import { useRoundClock } from './useRoundClock';
import '../../styles/restGames.css';

export const REST_WORD_COPY = {
  titleKey: 'hero.restWord',
  ruleKey: 'advice.restWordRule',
} as const satisfies RestGameCopy;

/** The three on-screen letter rows, top to bottom. Enter opens and Del closes the last row. */
export const REST_WORD_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'] as const;

/** The words a scored tile carries beside its colour and its shape (WCAG 1.4.1). */
const TILE_LABEL: Readonly<Record<RestWordTile, CopyKey>> = {
  exact: 'label.restWordExact',
  present: 'label.restWordPresent',
  absent: 'label.restWordAbsent',
};

const LEGEND_ORDER: readonly RestWordTile[] = ['exact', 'present', 'absent'];

/** Kept for callers that named the old props type; every game takes RestGameProps. */
export type RestWordGameProps = RestGameProps;

/**
 * A hardware key belongs to the game only when nothing else claims it: focus on the page body, or
 * inside the sheet that hosts the board (RestGameSheet focuses itself when it opens), or inside the
 * board. Enter on a focused Log Set control, or a letter typed into a set field, is left alone, so
 * the next set always logs with the board open.
 */
function keyIsForGame(event: KeyboardEvent, game: HTMLElement | null): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof Node)) return false;
  if (target === document.body || target === document.documentElement) return true;
  const scope: Element | null = game === null ? null : (game.closest('.rest-sheet') ?? game);
  if (scope === null || !scope.contains(target)) return false;
  return !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement);
}

/**
 * One round inside one rest. Its own deadline is the earlier of the round clock and the rest's
 * end; winning, losing and leaving can never pause, skip or extend the prescribed rest.
 */
export function RestWordGame(props: RestGameProps): ReactElement {
  const { timer, priorWins, soundsEnabled, t, overrides, onExit, onWin } = props;
  const host = useRestGameHost();
  const context = gameContext(timer, 'RestWordGame');
  // Frozen for the life of this board: a win raises priorWins for the NEXT rest and must never
  // reshuffle the board the player just solved.
  const [round] = useState<RestWordRound>(() => restWordRound(context, timer.durationS, priorWins));
  const clock = useRoundClock(timer, round.durationS);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [scores, setScores] = useState<readonly (readonly RestWordTile[])[]>([]);
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<RestGameResult>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const canEnter = result === null && clock.remainingS > 0;

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
    if (result !== null || clock.remainingS > 0) return;
    setResult('timeUp');
    playRestGameCue('lose', soundsEnabled);
  }, [clock.remainingS, result, soundsEnabled]);

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
      playRestGameCue('win', soundsEnabled);
      onWin();
      return;
    }
    if (guesses.length + 1 >= round.maxGuesses) {
      setResult('lost');
      playRestGameCue('lose', soundsEnabled);
      return;
    }
    playRestGameCue('submit', soundsEnabled);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (host.hidden || !keyIsForGame(event, sectionRef.current)) return;
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

  const keyClass = (letter: string, offset: boolean): string =>
    ['rest-word-key', offset ? 'rest-word-offset' : '', keyStates[letter.toLowerCase()] ?? '']
      .filter((name) => name !== '')
      .join(' ');

  return (
    <RestGameFrame
      variant="rest-word"
      {...REST_WORD_COPY}
      t={t}
      overrides={overrides}
      clock={clock}
      result={result}
      answer={round.target}
      endNote={null}
      status=""
      onExit={onExit}
      sectionRef={sectionRef}
    >
      {/* Decorative for a screen reader: every scored tile already says its state. */}
      <div className="rest-word-legend" aria-hidden="true">
        {LEGEND_ORDER.map((state) => (
          <span className="rest-word-legend-item" key={state}>
            <span className={`rest-word-tile rest-word-tile-mini ${state}`}>A</span>
            {t(TILE_LABEL[state])}
          </span>
        ))}
      </div>

      <div className="rest-word-grid" role="group" aria-label={t('label.restWordBoard')}>
        {Array.from({ length: round.maxGuesses }, (_, rowIndex) => {
          const guess = guesses[rowIndex] ?? (rowIndex === guesses.length ? draft : '');
          const score = scores[rowIndex];
          return (
            <div className="rest-word-row" key={rowIndex}>
              {Array.from({ length: round.wordLength }, (_, columnIndex) => {
                const letter = (guess[columnIndex] ?? '').toUpperCase();
                const state = score?.[columnIndex];
                return state === undefined ? (
                  <span className="rest-word-tile" key={columnIndex}>
                    {letter}
                  </span>
                ) : (
                  <span
                    className={`rest-word-tile ${state}`}
                    key={columnIndex}
                    role="img"
                    aria-label={`${letter}, ${t(TILE_LABEL[state])}`}
                  >
                    {letter}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="rest-word-keyboard" role="group" aria-label={t('label.restWordKeyboard')}>
        {REST_WORD_ROWS.map((row, rowIndex) => (
          <Fragment key={row}>
            {rowIndex === 2 && (
              <button
                type="button"
                className="rest-word-key rest-word-wide"
                disabled={!canEnter || draft.length !== round.wordLength}
                onClick={submit}
              >
                {t('button.restWordEnter')}
              </button>
            )}
            {Array.from(row).map((letter, index) => (
              <button
                type="button"
                className={keyClass(letter, rowIndex === 1 && index === 0)}
                disabled={!canEnter}
                key={letter}
                onClick={() => {
                  appendLetter(letter);
                }}
              >
                {letter}
              </button>
            ))}
            {rowIndex === 2 && (
              <button
                type="button"
                className="rest-word-key rest-word-wide"
                disabled={!canEnter}
                onClick={removeLetter}
              >
                {t('button.restWordDel')}
              </button>
            )}
          </Fragment>
        ))}
      </div>
    </RestGameFrame>
  );
}
