import { describe, expect, it } from 'vitest';
import type { RestGameContext } from '../training/restTimer';
import {
  GYM_ANAGRAM_WORDS_PER_ROUND,
  gymAnagramDataBytes,
  gymAnagramRound,
  gymAnagramWords,
  scrambleWord,
} from './gymAnagram';
import { seededRng } from './rng';

const CONTEXT: RestGameContext = {
  exerciseId: 'barbell-back-squat',
  sessionId: 'session-a',
  assignmentDate: '2026-09-10',
  setNumber: 2,
  sessionSetOrdinal: 1,
};

const sorted = (letters: readonly string[]): string => [...letters].sort().join('');

describe('Gym Anagram engine (P6)', () => {
  it('keeps the word bank in source and under 2 KiB', () => {
    expect(gymAnagramDataBytes()).toBeLessThan(2048); // [bytes]
  });

  it('holds only lower-case words of 5 to 8 letters, at least two of each length', () => {
    const words = gymAnagramWords();
    for (const word of words) expect(word).toMatch(/^[a-z]{5,8}$/);
    for (let length = 5; length <= 8; length += 1) {
      expect(words.filter((word) => word.length === length).length).toBeGreaterThanOrEqual(2);
    }
    expect(new Set(words).size).toBe(words.length);
  });

  it('scrambles every word into a different order of the same letters', () => {
    for (const word of gymAnagramWords()) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const letters = scrambleWord(word, seededRng(seed));
        expect(sorted(letters)).toBe(sorted(Array.from(word)));
        expect({ word, same: letters.join('') === word }).toEqual({ word, same: false });
      }
    }
  });

  it('gives two different words of 5 + difficulty letters', () => {
    const easy = gymAnagramRound(CONTEXT, 120, 0);
    expect(easy.puzzles).toHaveLength(GYM_ANAGRAM_WORDS_PER_ROUND);
    expect(easy.puzzles.map((p) => p.word.length)).toEqual([5, 5]);
    expect(easy.puzzles[0]?.word).not.toBe(easy.puzzles[1]?.word);
    const hard = gymAnagramRound(CONTEXT, 120, 9);
    expect(hard.puzzles.map((p) => p.word.length)).toEqual([8, 8]);
  });

  it('is the same round for the same set', () => {
    expect(gymAnagramRound(CONTEXT, 120, 0)).toEqual(gymAnagramRound(CONTEXT, 120, 0));
  });
});
