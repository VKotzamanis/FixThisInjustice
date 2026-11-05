import { describe, expect, it } from 'vitest';
import type { RestGameContext } from '../training/restTimer';
import {
  REACTION_CLEAN_TO_WIN,
  REACTION_TRIALS,
  reactionRound,
  reactionSummary,
  reactionWorstCaseMs,
} from './reaction';

const CONTEXT: RestGameContext = {
  exerciseId: 'barbell-back-squat',
  sessionId: 'session-a',
  assignmentDate: '2026-09-10',
  setNumber: 2,
  sessionSetOrdinal: 1,
};

describe('Reaction engine (P6)', () => {
  it('plays five trials and wins on three clean taps', () => {
    const round = reactionRound(CONTEXT, 120, 0);
    expect(round.trials).toBe(REACTION_TRIALS);
    expect(round.trials).toBe(5);
    expect(round.cleanToWin).toBe(REACTION_CLEAN_TO_WIN);
    expect(round.cleanToWin).toBe(3);
  });

  it('waits a seeded 1.2 to 3.5 s before each go, the same for the same set', () => {
    for (let setNumber = 1; setNumber <= 20; setNumber += 1) {
      const round = reactionRound({ ...CONTEXT, setNumber }, 120, 0);
      expect(round.delaysMs).toHaveLength(5);
      for (const delay of round.delaysMs) {
        expect(delay).toBeGreaterThanOrEqual(1200); // [ms]
        expect(delay).toBeLessThan(3500); // [ms]
      }
    }
    expect(reactionRound(CONTEXT, 120, 0)).toEqual(reactionRound(CONTEXT, 120, 0));
  });

  it('narrows the go window as difficulty rises', () => {
    expect(reactionRound(CONTEXT, 120, 0).goWindowMs).toBe(2000); // [ms] tier 0
    expect(reactionRound(CONTEXT, 120, 9).goWindowMs).toBe(1250); // [ms] tier 3
  });

  it('fits five worst-case trials inside the round clock of every rest', () => {
    for (const restS of [60, 90, 120, 180]) {
      for (const priorWins of [0, 3, 6, 9]) {
        const round = reactionRound(CONTEXT, restS, priorWins);
        expect(reactionWorstCaseMs(round)).toBeLessThanOrEqual(round.durationS * 1000); // [ms]
      }
    }
  });

  it('summarises trials: best clean time, fouls, misses, win', () => {
    const round = reactionRound(CONTEXT, 120, 0);
    expect(
      reactionSummary(round, [
        { kind: 'clean', ms: 300 },
        { kind: 'foul' },
        { kind: 'clean', ms: 250 },
        { kind: 'missed' },
        { kind: 'clean', ms: 280 },
      ]),
    ).toEqual({ bestMs: 250, clean: 3, fouls: 1, missed: 1, finished: true, won: true });
    expect(reactionSummary(round, [{ kind: 'clean', ms: 300 }]).finished).toBe(false);
    expect(
      reactionSummary(round, [
        { kind: 'clean', ms: 300 },
        { kind: 'clean', ms: 310 },
        { kind: 'foul' },
        { kind: 'foul' },
        { kind: 'missed' },
      ]),
    ).toMatchObject({ finished: true, won: false, bestMs: 300 });
  });
});
