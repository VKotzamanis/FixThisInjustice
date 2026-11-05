import { describe, expect, it } from 'vitest';
import type { RestGameContext } from '../training/restTimer';
import {
  PLATE_MATH_TARGETS,
  plateMathLoad,
  plateMathMatches,
  plateMathRound,
} from './plateMath';
import { restRoundClockS } from './restGames';

const CONTEXT: RestGameContext = {
  exerciseId: 'barbell-back-squat',
  sessionId: 'session-a',
  assignmentDate: '2026-09-10',
  setNumber: 2,
  sessionSetOrdinal: 1,
};

/** [centi-kg or centi-lb] Integer hundredths, the engine's own arithmetic. */
const centi = (value: number): number => Math.round(value * 100);

describe('Plate Math engine (P6)', () => {
  it('uses the bar and the plates of the profile units', () => {
    const kg = plateMathRound(CONTEXT, 120, 0, 'metric');
    expect(kg.bar).toBe(20); // [kg]
    expect(kg.plates).toEqual([25, 20, 15, 10, 5, 2.5, 1.25]); // [kg]
    const lb = plateMathRound(CONTEXT, 120, 0, 'imperial');
    expect(lb.bar).toBe(45); // [lb]
    expect(lb.plates).toEqual([45, 35, 25, 10, 5, 2.5]); // [lb]
  });

  it('builds three targets, each reachable by loading both sides alike', () => {
    for (const units of ['metric', 'imperial'] as const) {
      for (let setNumber = 1; setNumber <= 12; setNumber += 1) {
        for (const priorWins of [0, 3, 6, 9]) {
          const round = plateMathRound({ ...CONTEXT, setNumber }, 120, priorWins, units);
          const smallest = Math.min(...round.plates); // [kg] or [lb]
          const largest = Math.max(...round.plates); // [kg] or [lb]
          const perSide = 2 + round.difficulty; // [plates]
          expect(round.targets).toHaveLength(PLATE_MATH_TARGETS);
          for (const target of round.targets) {
            // Both sides carry the same plates, so the load over the bar is an even multiple of
            // the smallest plate.
            expect((centi(target) - centi(round.bar)) % (2 * centi(smallest))).toBe(0);
            expect(target).toBeGreaterThanOrEqual(round.bar + 2 * perSide * smallest);
            expect(target).toBeLessThanOrEqual(round.bar + 2 * perSide * largest);
          }
        }
      }
    }
  });

  it('is the same round for the same set', () => {
    expect(plateMathRound(CONTEXT, 120, 0, 'metric')).toEqual(plateMathRound(CONTEXT, 120, 0, 'metric'));
  });

  it('adds plates in exact hundredths, both sides counted', () => {
    expect(plateMathLoad(20, [25, 2.5])).toBe(75); // [kg] 20 + 2 x 27.5
    expect(plateMathLoad(20, [1.25, 1.25])).toBe(25); // [kg] 20 + 2 x 2.5
    expect(plateMathLoad(45, [45, 2.5])).toBe(140); // [lb] 45 + 2 x 47.5
    expect(plateMathMatches(62.5, 20, [20, 1.25])).toBe(true); // [kg] 20 + 2 x 21.25
    expect(plateMathMatches(62.5, 20, [20])).toBe(false);
  });

  it('runs on the shared round clock of the rest', () => {
    for (const restS of [90, 120, 180]) {
      expect(plateMathRound(CONTEXT, restS, 0, 'metric').durationS).toBe(restRoundClockS(restS));
    }
  });
});
