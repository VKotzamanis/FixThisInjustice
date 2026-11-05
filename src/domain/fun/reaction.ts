// src/domain/fun/reaction.ts
//
// Reaction (P6, R10): tap when the pad turns lime. Five trials, each after a seeded wait; a tap
// before the go is a foul, no tap in the go window is a miss, three clean taps win. A game score:
// the times are shown, never judged against a norm.
//
// Units: every time here is milliseconds [ms]; the round clock is seconds [s].
import type { RestGameContext } from '../training/restTimer';
import { restGameDifficulty, restGameRng, restRoundClockS } from './restGames';

export const REACTION_TRIALS = 5; // [trials]
export const REACTION_CLEAN_TO_WIN = 3; // [trials]
export const REACTION_MIN_DELAY_MS = 1200; // [ms] shortest wait before the pad turns lime
export const REACTION_DELAY_SPREAD_MS = 2300; // [ms] waits fall in [1200, 3500)
export const REACTION_FEEDBACK_MS = 700; // [ms] a trial's result stays on the pad this long
const GO_WINDOW_MS = 2000; // [ms] at tier 0
const GO_WINDOW_STEP_MS = 250; // [ms] narrower per tier

export interface ReactionRound {
  trials: number; // [trials]
  delaysMs: readonly number[]; // [ms] one wait per trial
  goWindowMs: number; // [ms]
  feedbackMs: number; // [ms]
  cleanToWin: number; // [trials]
  durationS: number; // [s] the round clock
  difficulty: number; // [tier] 0-3
}

export type ReactionTrial = { kind: 'clean'; ms: number } | { kind: 'foul' } | { kind: 'missed' };

export interface ReactionSummary {
  bestMs: number | null; // [ms] the fastest clean tap, null before one
  clean: number; // [trials]
  fouls: number; // [trials]
  missed: number; // [trials]
  finished: boolean;
  won: boolean;
}

/**
 * @param restS [s] the prescribed rest, RestTimer.durationS
 * @param priorWins [rounds] won earlier in this lifting day
 */
export function reactionRound(context: RestGameContext, restS: number, priorWins: number): ReactionRound {
  const difficulty = restGameDifficulty(context, priorWins);
  const rng = restGameRng('reaction', context, difficulty);
  const delaysMs = Array.from(
    { length: REACTION_TRIALS },
    () => REACTION_MIN_DELAY_MS + Math.floor(rng() * REACTION_DELAY_SPREAD_MS),
  );
  return {
    trials: REACTION_TRIALS,
    delaysMs,
    goWindowMs: GO_WINDOW_MS - GO_WINDOW_STEP_MS * difficulty,
    feedbackMs: REACTION_FEEDBACK_MS,
    cleanToWin: REACTION_CLEAN_TO_WIN,
    durationS: restRoundClockS(restS),
    difficulty,
  };
}

export function reactionSummary(round: ReactionRound, trials: readonly ReactionTrial[]): ReactionSummary {
  let bestMs: number | null = null;
  let clean = 0;
  let fouls = 0;
  let missed = 0;
  for (const trial of trials) {
    if (trial.kind === 'clean') {
      clean += 1;
      bestMs = bestMs === null ? trial.ms : Math.min(bestMs, trial.ms);
    } else if (trial.kind === 'foul') {
      fouls += 1;
    } else {
      missed += 1;
    }
  }
  const finished = trials.length >= round.trials;
  return { bestMs, clean, fouls, missed, finished, won: finished && clean >= round.cleanToWin };
}

/** Every wait in full, every go window run out, every result shown [ms]: the longest round. */
export function reactionWorstCaseMs(round: ReactionRound): number {
  const waits = round.delaysMs.reduce((sum, delay) => sum + delay, 0); // [ms]
  return waits + round.trials * (round.goWindowMs + round.feedbackMs); // [ms]
}
