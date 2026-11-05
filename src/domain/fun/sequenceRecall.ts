// src/domain/fun/sequenceRecall.ts
//
// Sequence Recall (P6, R10): pads light a growing sequence; repeat it. React-free and clock-free:
// the component owns the timers, this module owns the sequence and the rules.
//
// Units: step, gap and pause times [ms]; the round clock [s]; pads are 0-based indices.
import type { RestGameContext } from '../training/restTimer';
import { restGameDifficulty, restGameRng, restRoundClockS } from './restGames';

export const SEQUENCE_START_LENGTH = 2; // [steps]
export const SEQUENCE_STEP_MS = 450; // [ms] a pad stays lit
export const SEQUENCE_GAP_MS = 250; // [ms] dark between two steps
export const SEQUENCE_PAUSE_MS = 600; // [ms] before each showing
const MIN_PADS = 4; // [pads]
const BASE_GOAL = 5; // [steps] at tier 0

export interface SequenceRound {
  padCount: number; // [pads]
  sequence: readonly number[]; // pad indices, length goalLength
  startLength: number; // [steps]
  goalLength: number; // [steps]
  stepMs: number; // [ms]
  gapMs: number; // [ms]
  pauseMs: number; // [ms]
  durationS: number; // [s] the round clock
  difficulty: number; // [tier] 0-3
}

export type SequenceCheck = 'continue' | 'level' | 'miss';

/**
 * @param restS [s] the prescribed rest, RestTimer.durationS
 * @param priorWins [rounds] won earlier in this lifting day
 */
export function sequenceRound(context: RestGameContext, restS: number, priorWins: number): SequenceRound {
  const difficulty = restGameDifficulty(context, priorWins);
  const padCount = MIN_PADS + Math.min(2, difficulty);
  const goalLength = BASE_GOAL + difficulty;
  const rng = restGameRng('sequenceRecall', context, difficulty);
  const sequence: number[] = [];
  for (let i = 0; i < goalLength; i += 1) {
    const previous = sequence[i - 1];
    if (previous === undefined) {
      sequence.push(Math.floor(rng() * padCount));
      continue;
    }
    // Uniform over the other pads: draw from padCount - 1 and step over the previous one.
    const pick = Math.floor(rng() * (padCount - 1));
    sequence.push(pick >= previous ? pick + 1 : pick);
  }
  return {
    padCount,
    sequence,
    startLength: SEQUENCE_START_LENGTH,
    goalLength,
    stepMs: SEQUENCE_STEP_MS,
    gapMs: SEQUENCE_GAP_MS,
    pauseMs: SEQUENCE_PAUSE_MS,
    durationS: restRoundClockS(restS),
    difficulty,
  };
}

/** The verdict on the taps so far at this level: keep going, level done, or a miss. */
export function checkSequenceInput(
  round: SequenceRound,
  length: number,
  inputs: readonly number[],
): SequenceCheck {
  const last = inputs.length - 1;
  if (last < 0) return 'continue';
  if (inputs[last] !== round.sequence[last]) return 'miss';
  return inputs.length >= length ? 'level' : 'continue';
}

/** Time spent showing every level from the start length to the goal, pauses included [ms]. */
export function sequenceShowMs(round: SequenceRound): number {
  let total = 0; // [ms]
  for (let length = round.startLength; length <= round.goalLength; length += 1) {
    total += round.pauseMs + length * (round.stepMs + round.gapMs);
  }
  return total;
}
