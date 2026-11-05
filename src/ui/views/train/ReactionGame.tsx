// src/ui/views/train/ReactionGame.tsx
//
// Reaction (P6, R10): one big pad. Start, wait while it is dark, tap when it turns lime. Five
// trials; three clean taps win. The pad says its state in words and by its edge (dashed while
// waiting, solid ink on lime at go), so colour never stands alone. It reads the rest timer and
// never writes it.
//
// Hidden = no penalty (lead ruling R-G1): while the sheet is minimised the trial in progress is
// voided (never counted as a miss or a foul), the wait and the go window stop, and when the sheet
// is shown again a fresh trial starts with its full wait. The round clock runs on: it is bounded
// by the rest, which never stops.
//
// Units: instants [ms] epoch UTC; reaction times and waits [ms]; the round clock [s].
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { REST_GAME_FORMAT } from '../../../content/restGameFormat';
import {
  REACTION_MIN_DELAY_MS,
  reactionRound,
  reactionSummary,
  type ReactionRound,
  type ReactionTrial,
} from '../../../domain/fun/reaction';
import { playRestGameCue } from '../../audio/restGameAudio';
import { RestGameFrame, type RestGameResult } from './RestGameFrame';
import { useRestGameHost } from './restGameHost';
import { gameContext, type RestGameCopy, type RestGameProps } from './restGameProps';
import { useRoundClock } from './useRoundClock';
import '../../styles/restGames.css';

export const REACTION_COPY = {
  titleKey: 'hero.restGameReaction',
  ruleKey: 'advice.restGameReactionRule',
} as const satisfies RestGameCopy;

type Phase = 'idle' | 'waiting' | 'go' | 'feedback';

export function ReactionGame(props: RestGameProps): ReactElement {
  const { timer, priorWins, soundsEnabled, t, overrides, onExit, onWin } = props;
  const { hidden } = useRestGameHost();
  const context = gameContext(timer, 'ReactionGame');
  const [round] = useState<ReactionRound>(() => reactionRound(context, timer.durationS, priorWins));
  const clock = useRoundClock(timer, round.durationS);
  const [phase, setPhase] = useState<Phase>('idle');
  const [trials, setTrials] = useState<readonly ReactionTrial[]>([]);
  const [result, setResult] = useState<RestGameResult>(null);
  const goAtRef = useRef(0); // [ms] epoch UTC, the instant the pad turned lime
  const canPlay = result === null && clock.remainingS > 0;
  const summary = reactionSummary(round, trials);

  // R-G1: a Hide voids the running trial. Every started phase falls back to 'waiting', whose
  // timer below does not run while hidden, so the shown-again pad starts the next trial afresh.
  // Done while rendering, on the change of `hidden`, so no effect sets state.
  const [wasHidden, setWasHidden] = useState(hidden);
  if (hidden !== wasHidden) {
    setWasHidden(hidden);
    if (hidden && phase !== 'idle') setPhase('waiting');
  }

  const record = (trial: ReactionTrial): void => {
    const next = [...trials, trial];
    setTrials(next);
    const after = reactionSummary(round, next);
    if (!after.finished) {
      setPhase('feedback');
      return;
    }
    setPhase('idle');
    if (after.won) {
      setResult('won');
      playRestGameCue('win', soundsEnabled);
      onWin();
      return;
    }
    setResult('lost');
    playRestGameCue('lose', soundsEnabled);
  };
  // The go-window timeout records a miss through this ref, so the effect below does not re-run
  // on every render for a new `record` closure.
  const recordRef = useRef(record);
  useEffect(() => {
    recordRef.current = record;
  });

  useEffect(() => {
    if (result !== null || clock.remainingS > 0) return;
    setResult('timeUp');
    playRestGameCue('lose', soundsEnabled);
  }, [clock.remainingS, result, soundsEnabled]);

  const trialIndex = trials.length; // [trials] done so far
  useEffect(() => {
    if (result !== null || hidden) return undefined;
    let id: number | undefined;
    if (phase === 'waiting') {
      id = window.setTimeout(() => {
        goAtRef.current = Date.now(); // [ms] epoch UTC
        setPhase('go');
      }, round.delaysMs[trialIndex] ?? REACTION_MIN_DELAY_MS);
    } else if (phase === 'go') {
      id = window.setTimeout(() => {
        recordRef.current({ kind: 'missed' });
      }, round.goWindowMs);
    } else if (phase === 'feedback') {
      id = window.setTimeout(() => {
        setPhase('waiting');
      }, round.feedbackMs);
    }
    return () => {
      if (id !== undefined) window.clearTimeout(id);
    };
  }, [phase, result, trialIndex, round, hidden]);

  const tap = (): void => {
    if (!canPlay || hidden) return;
    if (phase === 'idle') {
      setPhase('waiting');
      return;
    }
    if (phase === 'waiting') {
      record({ kind: 'foul' });
      return;
    }
    if (phase === 'go') {
      record({ kind: 'clean', ms: Math.max(0, Date.now() - goAtRef.current) }); // [ms]
    }
  };

  const trialText = (trial: ReactionTrial): string => {
    if (trial.kind === 'clean') return REST_GAME_FORMAT.reactionTime(trial.ms, overrides);
    return trial.kind === 'foul' ? t('label.restGameReactionFoul') : t('label.restGameReactionMissed');
  };
  const last = trials[trials.length - 1];
  const padText =
    phase === 'idle'
      ? t('button.restGameReactionStart')
      : phase === 'waiting'
        ? t('label.restGameReactionWait')
        : phase === 'go'
          ? t('label.restGameReactionGo')
          : last === undefined
            ? ''
            : trialText(last);

  return (
    <RestGameFrame
      variant="rest-react"
      {...REACTION_COPY}
      t={t}
      overrides={overrides}
      clock={clock}
      result={result}
      answer={null}
      endNote={summary.bestMs === null ? null : REST_GAME_FORMAT.reactionBest(summary.bestMs, overrides)}
      status={REST_GAME_FORMAT.progress(trials.length, round.trials, overrides)}
      onExit={onExit}
    >
      <button type="button" className={`rest-react-pad is-${phase}`} disabled={!canPlay} onClick={tap}>
        {padText}
      </button>
      <ol className="rest-react-trials" aria-label={t('label.restGameReactionTrials')}>
        {trials.map((trial, index) => (
          <li key={index}>{trialText(trial)}</li>
        ))}
      </ol>
    </RestGameFrame>
  );
}
