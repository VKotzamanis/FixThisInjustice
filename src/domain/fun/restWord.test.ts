import { describe, expect, it } from 'vitest';
import {
  isRestWordGuess,
  restGameSeed,
  restWordDataBytes,
  restWordRound,
  scoreRestWordGuess,
} from './restWord';
import type { RestGameContext } from '../training/restTimer';

const CONTEXT: RestGameContext = {
  exerciseId: 'barbell-back-squat',
  sessionId: 'session-a',
  assignmentDate: '2026-09-10',
  setNumber: 2,
  sessionSetOrdinal: 4,
};

describe('Rest Word engine', () => {
  it('maps the three shipped rest lengths to a stage that leaves recovery time', () => {
    expect(restWordRound(CONTEXT, 90, 0)).toMatchObject({ wordLength: 4, durationS: 45 });
    expect(restWordRound(CONTEXT, 120, 0)).toMatchObject({ wordLength: 5, durationS: 60 });
    expect(restWordRound(CONTEXT, 180, 0)).toMatchObject({ wordLength: 5, durationS: 90 });
  });

  it('is deterministic for the same completed set and becomes stricter after wins', () => {
    expect(restWordRound(CONTEXT, 120, 0)).toEqual(restWordRound(CONTEXT, 120, 0));
    expect(restWordRound(CONTEXT, 120, 6).maxGuesses).toBeLessThan(restWordRound(CONTEXT, 120, 0).maxGuesses);
    expect(restGameSeed('bench:today')).toBe(restGameSeed('bench:today'));
  });

  it('scores duplicate letters without over-crediting them', () => {
    expect(scoreRestWordGuess('eerie', 'refer')).toEqual(['present', 'exact', 'present', 'absent', 'absent']);
  });

  it('accepts alphabetic guesses of exactly the board length', () => {
    expect(isRestWordGuess('lift', 4)).toBe(true);
    expect(isRestWordGuess('lifts', 4)).toBe(false);
    expect(isRestWordGuess('li4t', 4)).toBe(false);
  });

  it('keeps the embedded source data under one KiB', () => {
    expect(restWordDataBytes()).toBeLessThan(1024);
  });
});
