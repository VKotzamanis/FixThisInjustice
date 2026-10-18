// src/domain/fun/restWord.ts
//
// The first rest-game engine.  It is deliberately React-free: a puzzle can be tested by values,
// seeded from a completed set, and rendered through a small DOM/CSS component without the rules
// knowing anything about clocks or screens.

import type { RestGameContext } from '../training/restTimer';

export type RestWordTile = 'absent' | 'present' | 'exact';

export interface RestWordRound {
  target: string;
  wordLength: number; // [characters]
  maxGuesses: number; // [guesses]
  durationS: number; // [s], the game clock, never the rest clock
  difficulty: number; // [tier], 0-indexed
}

/*
 * A deliberately small, hand-reviewed English target bank.  These are source text rather than a
 * downloaded corpus: the game remains offline, adds only a few hundred bytes to the bundle, and
 * cannot inherit a third party word-list licence. Guesses accept any alphabetic sequence of the
 * right length, so this list does not falsely reject a common word just because it is not a
 * possible target.
 */
const TARGETS_BY_LENGTH: Readonly<Record<number, readonly string[]>> = {
  4: ['atom', 'beam', 'clap', 'dawn', 'echo', 'flit', 'glow', 'hush', 'iris', 'jolt', 'knot', 'lift', 'mint', 'nova', 'opal', 'peak', 'quiz', 'rest', 'snap', 'tide'],
  5: ['badge', 'bloom', 'cable', 'dodge', 'ember', 'focus', 'gauge', 'heart', 'ivory', 'jumpy', 'kneel', 'lunge', 'mirth', 'nudge', 'orbit', 'punch', 'quick', 'rally', 'spark', 'tempo'],
};

/**
 * The round fits inside the SHORTEST generated rest that can start it.
 *
 * @param restS [s] the prescribed rest (`RestTimer.durationS`); every returned durationS [s] is
 *   at most half of the band's top (45 of 90, 60 of 120, 90 of 180), so recovery time remains.
 */
function baseRoundForRest(restS: number): Pick<RestWordRound, 'wordLength' | 'maxGuesses' | 'durationS'> {
  if (restS <= 90) return { wordLength: 4, maxGuesses: 5, durationS: 45 };
  if (restS <= 120) return { wordLength: 5, maxGuesses: 6, durationS: 60 };
  return { wordLength: 5, maxGuesses: 6, durationS: 90 };
}

/** A stable non-cryptographic hash; repeatability, not secrecy, is the requirement. */
export function restGameSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * A set always maps to the same game data after a reload.  A later registry can use the same
 * exerciseId seed to select another game family; for this first trial every family entry is
 * Rest Word, while its actual target varies by set and lifting day.
 */
export function restWordRound(
  context: RestGameContext,
  restS: number, // [s] the prescribed rest, RestTimer.durationS
  priorWins: number, // [rounds] won earlier in this lifting day
): RestWordRound {
  const base = baseRoundForRest(restS);
  const difficulty = Math.min(3, Math.floor((context.sessionSetOrdinal - 1 + priorWins) / 3));
  const targets = TARGETS_BY_LENGTH[base.wordLength];
  if (targets === undefined || targets.length === 0) {
    throw new Error(`No Rest Word targets for ${base.wordLength} letters`);
  }
  const seed = restGameSeed(
    `${context.exerciseId}:${context.assignmentDate}:${context.sessionId}:${context.setNumber}:${difficulty}`,
  );
  return {
    ...base,
    target: targets[seed % targets.length] ?? targets[0]!,
    // More completed sets and wins make the puzzle stricter, but never cut into recovery time.
    maxGuesses: Math.max(3, base.maxGuesses - Math.floor(difficulty / 2)),
    difficulty,
  };
}

/** A submitted guess may contain only the same number of basic Latin letters as the target. */
export function isRestWordGuess(guess: string, wordLength: number): boolean {
  return new RegExp(`^[a-z]{${wordLength}}$`, 'i').test(guess);
}

/**
 * Scores a guess in two passes. Exact positions consume their target letter first; only then may
 * a remaining duplicate be marked present. This is the rule that prevents a target with one A
 * from colouring two guessed As yellow.
 */
export function scoreRestWordGuess(guess: string, target: string): readonly RestWordTile[] {
  const submitted = guess.toLowerCase();
  const answer = target.toLowerCase();
  if (submitted.length !== answer.length) {
    throw new Error('Rest Word guess and target must have the same length');
  }

  const score: RestWordTile[] = Array.from({ length: answer.length }, () => 'absent');
  const remaining = new Map<string, number>();
  for (const letter of answer) remaining.set(letter, (remaining.get(letter) ?? 0) + 1);

  for (let i = 0; i < answer.length; i += 1) {
    if (submitted[i] !== answer[i]) continue;
    score[i] = 'exact';
    const letter = answer[i]!;
    remaining.set(letter, (remaining.get(letter) ?? 1) - 1);
  }

  for (let i = 0; i < answer.length; i += 1) {
    if (score[i] === 'exact') continue;
    const letter = submitted[i]!;
    const count = remaining.get(letter) ?? 0;
    if (count <= 0) continue;
    score[i] = 'present';
    remaining.set(letter, count - 1);
  }
  return score;
}

/** The source-data budget protects the deliberately tiny offline word bank from creeping. */
export function restWordDataBytes(): number {
  return new TextEncoder().encode(JSON.stringify(TARGETS_BY_LENGTH)).byteLength;
}
