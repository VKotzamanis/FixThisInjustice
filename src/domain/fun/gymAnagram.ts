// src/domain/fun/gymAnagram.ts
//
// Gym Anagram (P6, R10): unscramble a gym word. The bank is source text (offline, a few hundred
// bytes, no third-party word list or licence), written by hand from plain gym vocabulary.
//
// Units: word lengths [letters]; the round clock [s].
import type { RestGameContext } from '../training/restTimer';
import { restGameDifficulty, restGameRng, restRoundClockS } from './restGames';

/*
 * By length. Left out on purpose because their letters also spell another common word, which the
 * game would then refuse: hinge (neigh), swing (wings), plates (staple), clean (lance), snatch
 * (chants), spotter (protest), sprint (prints).
 */
const GYM_WORDS: Readonly<Record<number, readonly string[]>> = {
  5: ['bench', 'cable', 'chalk', 'glute', 'lunge', 'plank', 'press', 'shrug', 'squat', 'tempo'],
  6: ['biceps', 'cardio', 'collar', 'pullup', 'rowing', 'warmup'],
  7: ['barbell', 'chinups', 'pushups', 'stretch', 'triceps'],
  8: ['cooldown', 'deadlift', 'dumbbell', 'overhead'],
};

export const GYM_ANAGRAM_MIN_LENGTH = 5; // [letters] at tier 0
export const GYM_ANAGRAM_WORDS_PER_ROUND = 2; // [words]

export interface AnagramPuzzle {
  word: string;
  letters: readonly string[]; // the word's letters, scrambled
}

export interface GymAnagramRound {
  puzzles: readonly AnagramPuzzle[];
  durationS: number; // [s] the round clock
  difficulty: number; // [tier] 0-3
}

/**
 * Fisher-Yates with the given stream. A shuffle that lands on the word itself is rotated left by
 * one, which differs from the word unless every letter is the same (no bank word is).
 */
export function scrambleWord(word: string, rng: () => number): readonly string[] {
  const letters = Array.from(word);
  for (let i = letters.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = letters[i]!;
    letters[i] = letters[j]!;
    letters[j] = swap;
  }
  if (letters.join('') === word) letters.push(letters.shift()!);
  return letters;
}

/**
 * @param restS [s] the prescribed rest, RestTimer.durationS
 * @param priorWins [rounds] won earlier in this lifting day
 */
export function gymAnagramRound(context: RestGameContext, restS: number, priorWins: number): GymAnagramRound {
  const difficulty = restGameDifficulty(context, priorWins);
  const bank = GYM_WORDS[GYM_ANAGRAM_MIN_LENGTH + difficulty] ?? GYM_WORDS[GYM_ANAGRAM_MIN_LENGTH] ?? [];
  if (bank.length < GYM_ANAGRAM_WORDS_PER_ROUND) {
    throw new Error(`Gym Anagram needs ${String(GYM_ANAGRAM_WORDS_PER_ROUND)} words of one length`);
  }
  const rng = restGameRng('gymAnagram', context, difficulty);
  const first = Math.floor(rng() * bank.length);
  // A second index other than the first, uniform over the rest of the bank.
  const second = (first + 1 + Math.floor(rng() * (bank.length - 1))) % bank.length;
  const puzzles = [first, second].map((index) => {
    const word = bank[index] ?? bank[0]!;
    return { word, letters: scrambleWord(word, rng) };
  });
  return { puzzles, durationS: restRoundClockS(restS), difficulty };
}

/** Every word in the bank, for the curation tests. */
export function gymAnagramWords(): readonly string[] {
  return Object.values(GYM_WORDS).flat();
}

/** The source-data budget keeps the bank from creeping (< 2 KiB, tested). */
export function gymAnagramDataBytes(): number {
  return new TextEncoder().encode(JSON.stringify(GYM_WORDS)).byteLength; // [bytes]
}
