import { describe, expect, it } from 'vitest';
import type { RestGameContext } from '../training/restTimer';
import { checkSequenceInput, sequenceRound, sequenceShowMs } from './sequenceRecall';

const CONTEXT: RestGameContext = {
  exerciseId: 'barbell-back-squat',
  sessionId: 'session-a',
  assignmentDate: '2026-09-10',
  setNumber: 2,
  sessionSetOrdinal: 1,
};

describe('Sequence Recall engine (P6)', () => {
  it('uses 4 to 6 pads and a goal of 5 to 8, rising with difficulty', () => {
    expect(sequenceRound(CONTEXT, 120, 0)).toMatchObject({ padCount: 4, goalLength: 5, startLength: 2 });
    expect(sequenceRound(CONTEXT, 120, 3)).toMatchObject({ padCount: 5, goalLength: 6 });
    expect(sequenceRound(CONTEXT, 120, 6)).toMatchObject({ padCount: 6, goalLength: 7 });
    expect(sequenceRound(CONTEXT, 120, 9)).toMatchObject({ padCount: 6, goalLength: 8 });
  });

  it('stays on the board and never lights the same pad twice in a row', () => {
    for (let setNumber = 1; setNumber <= 20; setNumber += 1) {
      for (const priorWins of [0, 3, 6, 9]) {
        const round = sequenceRound({ ...CONTEXT, setNumber }, 120, priorWins);
        expect(round.sequence).toHaveLength(round.goalLength);
        round.sequence.forEach((pad, i) => {
          expect(pad).toBeGreaterThanOrEqual(0);
          expect(pad).toBeLessThan(round.padCount);
          if (i > 0) expect(pad).not.toBe(round.sequence[i - 1]);
        });
      }
    }
  });

  it('checks a repeat step by step', () => {
    const round = sequenceRound(CONTEXT, 120, 0);
    const first = round.sequence[0] ?? 0;
    const second = round.sequence[1] ?? 0;
    expect(checkSequenceInput(round, 2, [first])).toBe('continue');
    expect(checkSequenceInput(round, 2, [first, second])).toBe('level');
    expect(checkSequenceInput(round, 2, [(first + 1) % round.padCount])).toBe('miss');
  });

  it('shows every level in at most two thirds of the shortest round clock', () => {
    for (const priorWins of [0, 3, 6, 9]) {
      const round = sequenceRound(CONTEXT, 90, priorWins);
      expect(round.durationS).toBe(45); // [s]
      expect(sequenceShowMs(round)).toBeLessThanOrEqual((2 / 3) * round.durationS * 1000); // [ms]
    }
  });

  it('is the same round for the same set', () => {
    expect(sequenceRound(CONTEXT, 120, 0)).toEqual(sequenceRound(CONTEXT, 120, 0));
  });
});
