import { describe, expect, it } from 'vitest';
import type { RestGameContext } from '../training/restTimer';
import {
  REST_GAME_FAMILIES,
  restGameDifficulty,
  restGameRng,
  restGameSeed,
  restRoundClockS,
  seededFamily,
} from './restGames';
import { restGameSeed as restGameSeedFromRestWord } from './restWord';

const CONTEXT: RestGameContext = {
  exerciseId: 'barbell-back-squat',
  sessionId: 'session-a',
  assignmentDate: '2026-09-10',
  setNumber: 2,
  sessionSetOrdinal: 4,
};

describe('rest-game registry (P6)', () => {
  it('names five families, Rest Word first', () => {
    expect(REST_GAME_FAMILIES).toEqual(['restWord', 'plateMath', 'reaction', 'sequenceRecall', 'gymAnagram']);
  });

  it('gives every family one round clock, at most half of the rest band it serves', () => {
    expect(restRoundClockS(60)).toBe(45); // [s]
    expect(restRoundClockS(90)).toBe(45);
    expect(restRoundClockS(91)).toBe(60);
    expect(restRoundClockS(120)).toBe(60);
    expect(restRoundClockS(121)).toBe(90);
    expect(restRoundClockS(180)).toBe(90);
    expect(restRoundClockS(300)).toBe(90);
    for (const [bandTopS, clockS] of [[90, 45], [120, 60], [180, 90]] as const) {
      expect(clockS).toBeLessThanOrEqual(bandTopS / 2);
    }
  });

  it('raises difficulty one tier per three sets or wins, capped at tier 3', () => {
    expect(restGameDifficulty({ ...CONTEXT, sessionSetOrdinal: 1 }, 0)).toBe(0);
    expect(restGameDifficulty({ ...CONTEXT, sessionSetOrdinal: 4 }, 0)).toBe(1);
    expect(restGameDifficulty({ ...CONTEXT, sessionSetOrdinal: 1 }, 3)).toBe(1);
    expect(restGameDifficulty({ ...CONTEXT, sessionSetOrdinal: 100 }, 0)).toBe(3);
  });

  it('derives the default family from the set, so it varies across a session', () => {
    const families = new Set(
      Array.from({ length: 20 }, (_, i) => seededFamily({ ...CONTEXT, setNumber: i + 1 })),
    );
    expect(families.size).toBe(5);
    expect(seededFamily(CONTEXT)).toBe(seededFamily({ ...CONTEXT }));
  });

  it('seeds each family separately and repeatably', () => {
    const first = restGameRng('plateMath', CONTEXT, 0)();
    expect(restGameRng('plateMath', CONTEXT, 0)()).toBe(first);
    expect(restGameRng('reaction', CONTEXT, 0)()).not.toBe(first);
    expect(restGameRng('plateMath', CONTEXT, 1)()).not.toBe(first);
  });

  it('keeps restGameSeed importable from restWord, where it started', () => {
    expect(restGameSeedFromRestWord).toBe(restGameSeed);
    expect(restGameSeed('bench:today')).toBe(restGameSeed('bench:today'));
  });
});
