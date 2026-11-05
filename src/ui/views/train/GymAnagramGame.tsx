// src/ui/views/train/GymAnagramGame.tsx
//
// Gym Anagram (P6, R10): tap the scrambled tiles in order to spell the gym word; two words a
// round. A used tile is struck through and locked (a shape, not only a colour). It reads the rest
// timer and never writes it.
//
// Units: instants [ms] epoch UTC; the round clock [s].
import { useEffect, useState, type ReactElement } from 'react';
import { REST_GAME_FORMAT } from '../../../content/restGameFormat';
import { gymAnagramRound, type GymAnagramRound } from '../../../domain/fun/gymAnagram';
import { playRestGameCue } from '../../audio/restGameAudio';
import { RestGameFrame, type RestGameResult } from './RestGameFrame';
import { gameContext, type RestGameCopy, type RestGameProps } from './restGameProps';
import { useRoundClock } from './useRoundClock';
import '../../styles/restGames.css';

export const GYM_ANAGRAM_COPY = {
  titleKey: 'hero.restGameAnagram',
  ruleKey: 'advice.restGameAnagramRule',
} as const satisfies RestGameCopy;

export function GymAnagramGame(props: RestGameProps): ReactElement {
  const { timer, priorWins, soundsEnabled, t, overrides, onExit, onWin } = props;
  const context = gameContext(timer, 'GymAnagramGame');
  const [round] = useState<GymAnagramRound>(() => gymAnagramRound(context, timer.durationS, priorWins));
  const clock = useRoundClock(timer, round.durationS);
  const [solved, setSolved] = useState(0); // [words]
  const [picked, setPicked] = useState<readonly number[]>([]); // tile indices, in tap order
  const [wrong, setWrong] = useState(false);
  const [result, setResult] = useState<RestGameResult>(null);
  const puzzle = round.puzzles[solved] ?? round.puzzles[round.puzzles.length - 1] ?? { word: '', letters: [] };
  const canPlay = result === null && clock.remainingS > 0;

  useEffect(() => {
    if (result !== null || clock.remainingS > 0) return;
    setResult('timeUp');
    playRestGameCue('lose', soundsEnabled);
  }, [clock.remainingS, result, soundsEnabled]);

  const pick = (index: number): void => {
    if (!canPlay || picked.includes(index)) return;
    const next = [...picked, index];
    setWrong(false);
    if (next.length < puzzle.word.length) {
      setPicked(next);
      return;
    }
    const spelled = next.map((i) => puzzle.letters[i] ?? '').join('');
    if (spelled !== puzzle.word) {
      setPicked([]);
      setWrong(true);
      return;
    }
    const done = solved + 1; // [words]
    if (done >= round.puzzles.length) {
      setPicked(next);
      setResult('won');
      playRestGameCue('win', soundsEnabled);
      onWin();
      return;
    }
    playRestGameCue('submit', soundsEnabled);
    setSolved(done);
    setPicked([]);
  };

  const undo = (): void => {
    if (!canPlay) return;
    setPicked((value) => value.slice(0, -1));
  };

  const clear = (): void => {
    if (!canPlay) return;
    setPicked([]);
  };

  return (
    <RestGameFrame
      variant="rest-anagram"
      {...GYM_ANAGRAM_COPY}
      t={t}
      overrides={overrides}
      clock={clock}
      result={result}
      answer={puzzle.word}
      endNote={null}
      status={
        wrong
          ? t('status.restGameAnagramWrong')
          : REST_GAME_FORMAT.progress(solved, round.puzzles.length, overrides)
      }
      onExit={onExit}
    >
      <div className="rest-anagram-answer" role="group" aria-label={t('label.restGameAnagramAnswer')}>
        {Array.from({ length: puzzle.word.length }, (_, slot) => (
          <span className="rest-anagram-slot" key={slot}>
            {(puzzle.letters[picked[slot] ?? -1] ?? '').toUpperCase()}
          </span>
        ))}
      </div>

      <div className="rest-anagram-letters" role="group" aria-label={t('label.restGameAnagramLetters')}>
        {puzzle.letters.map((letter, index) => (
          <button
            type="button"
            // Keyed by word and position: the next word mounts fresh tiles.
            key={`${String(solved)}-${String(index)}`}
            className={picked.includes(index) ? 'rest-anagram-letter is-used' : 'rest-anagram-letter'}
            disabled={!canPlay || picked.includes(index)}
            onClick={() => {
              pick(index);
            }}
          >
            {letter.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="rest-anagram-tools">
        <button type="button" className="rest-anagram-undo" disabled={!canPlay || picked.length === 0} onClick={undo}>
          {t('button.restGameAnagramUndo')}
        </button>
        <button type="button" className="rest-anagram-clear" disabled={!canPlay || picked.length === 0} onClick={clear}>
          {t('button.restGameAnagramClear')}
        </button>
      </div>
    </RestGameFrame>
  );
}
