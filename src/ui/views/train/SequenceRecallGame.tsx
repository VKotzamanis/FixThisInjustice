// src/ui/views/train/SequenceRecallGame.tsx
//
// Sequence Recall (P6, R10): numbered pads light a growing sequence; repeat it. A miss ends the
// round lost, the round clock ends it out of time. A lit pad is lime with a double ink edge and
// the status line says Watch or Your Turn, so colour never stands alone. Lighting a pad is the
// game itself, not decoration, so it is a state change with no CSS animation and reduced motion
// leaves it as it is. It reads the rest timer and never writes it.
//
// Hidden = no penalty (lead ruling R-G1): while the sheet is minimised the showing stops, and when
// it is shown again the level is shown afresh from its pause, so a Hide never costs a step the
// user could not see. The repeat turn has no input deadline, so it simply waits. The round clock
// runs on (it is bounded by the rest, which never stops).
//
// Units: instants [ms] epoch UTC; step, gap and pause times [ms]; the round clock [s].
import { useEffect, useState, type ReactElement } from 'react';
import { REST_GAME_FORMAT } from '../../../content/restGameFormat';
import { checkSequenceInput, sequenceRound, type SequenceRound } from '../../../domain/fun/sequenceRecall';
import { playRestGameCue } from '../../audio/restGameAudio';
import { RestGameFrame, type RestGameResult } from './RestGameFrame';
import { useRestGameHost } from './restGameHost';
import { gameContext, type RestGameCopy, type RestGameProps } from './restGameProps';
import { useRoundClock } from './useRoundClock';
import '../../styles/restGames.css';

export const SEQUENCE_RECALL_COPY = {
  titleKey: 'hero.restGameSequence',
  ruleKey: 'advice.restGameSequenceRule',
} as const satisfies RestGameCopy;

type Phase = 'pause' | 'watch' | 'repeat';

export function SequenceRecallGame(props: RestGameProps): ReactElement {
  const { timer, priorWins, soundsEnabled, t, overrides, onExit, onWin } = props;
  const { hidden } = useRestGameHost();
  const context = gameContext(timer, 'SequenceRecallGame');
  const [round] = useState<SequenceRound>(() => sequenceRound(context, timer.durationS, priorWins));
  const clock = useRoundClock(timer, round.durationS);
  const [length, setLength] = useState(round.startLength); // [steps]
  const [phase, setPhase] = useState<Phase>('pause');
  const [lit, setLit] = useState<number | null>(null); // the pad lit now, if any
  const [inputs, setInputs] = useState<readonly number[]>([]);
  const [result, setResult] = useState<RestGameResult>(null);
  const canPlay = result === null && clock.remainingS > 0;

  // A Hide during the pause or the showing rewinds the level to its pause (R-G1). Done while
  // rendering, on the change of `hidden`, so no effect sets state and no stale step stays lit.
  const [wasHidden, setWasHidden] = useState(hidden);
  if (hidden !== wasHidden) {
    setWasHidden(hidden);
    if (hidden && phase !== 'repeat') {
      setPhase('pause');
      setLit(null);
    }
  }

  useEffect(() => {
    if (result !== null || clock.remainingS > 0) return;
    setResult('timeUp');
    playRestGameCue('lose', soundsEnabled);
  }, [clock.remainingS, result, soundsEnabled]);

  useEffect(() => {
    if (result !== null || hidden) return undefined;
    const ids: number[] = [];
    const strideMs = round.stepMs + round.gapMs; // [ms]
    if (phase === 'pause') {
      ids.push(
        window.setTimeout(() => {
          setPhase('watch');
        }, round.pauseMs),
      );
    } else if (phase === 'watch') {
      for (let i = 0; i < length; i += 1) {
        const pad = round.sequence[i] ?? null;
        ids.push(
          window.setTimeout(() => {
            setLit(pad);
          }, i * strideMs),
        );
        ids.push(
          window.setTimeout(() => {
            setLit(null);
          }, i * strideMs + round.stepMs),
        );
      }
      ids.push(
        window.setTimeout(() => {
          setPhase('repeat');
        }, length * strideMs),
      );
    }
    return () => {
      for (const id of ids) window.clearTimeout(id);
    };
  }, [phase, length, result, round, hidden]);

  const tap = (pad: number): void => {
    if (!canPlay || phase !== 'repeat') return;
    const next = [...inputs, pad];
    const check = checkSequenceInput(round, length, next);
    if (check === 'miss') {
      setInputs(next);
      setResult('lost');
      playRestGameCue('lose', soundsEnabled);
      return;
    }
    if (check === 'continue') {
      setInputs(next);
      return;
    }
    if (length >= round.goalLength) {
      setInputs(next);
      setResult('won');
      playRestGameCue('win', soundsEnabled);
      onWin();
      return;
    }
    playRestGameCue('submit', soundsEnabled);
    setInputs([]);
    setLength(length + 1);
    setPhase('pause');
  };

  return (
    <RestGameFrame
      variant="rest-seq"
      {...SEQUENCE_RECALL_COPY}
      t={t}
      overrides={overrides}
      clock={clock}
      result={result}
      answer={null}
      endNote={REST_GAME_FORMAT.sequenceLength(length, round.goalLength, overrides)}
      status={phase === 'repeat' ? t('label.restGameSequenceRepeat') : t('label.restGameSequenceWatch')}
      onExit={onExit}
    >
      <p className="rest-seq-length">{REST_GAME_FORMAT.sequenceLength(length, round.goalLength, overrides)}</p>
      <div
        className={`rest-seq-grid pads-${String(round.padCount)}`}
        role="group"
        aria-label={t('label.restGameSequencePads')}
      >
        {Array.from({ length: round.padCount }, (_, pad) => (
          <button
            type="button"
            key={pad}
            className={lit === pad ? 'rest-seq-pad is-lit' : 'rest-seq-pad'}
            aria-label={REST_GAME_FORMAT.sequencePad(pad + 1, overrides)}
            disabled={!canPlay || phase !== 'repeat'}
            onClick={() => {
              tap(pad);
            }}
          >
            {pad + 1}
          </button>
        ))}
      </div>
    </RestGameFrame>
  );
}
