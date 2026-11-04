// src/domain/fun/restGames.ts
//
// The rest-game registry (P6, R10; docs/design/rest-games.md). What every family shares lives here
// once (AGENTS rule 2): the seed hash, the difficulty tier, the round clock and the family a rest
// suggests. React-free and clock-free, like every engine beside it.
//
// Units: rest and round durations are seconds [s]; difficulty is a tier [0..3].
import type { RestGameContext } from '../training/restTimer';
import { seededRng } from './rng';

export type RestGameFamily = 'restWord' | 'plateMath' | 'reaction' | 'sequenceRecall' | 'gymAnagram';

/** Every family, in the order the picker lists them after its first entry. */
export const REST_GAME_FAMILIES: readonly RestGameFamily[] = [
  'restWord',
  'plateMath',
  'reaction',
  'sequenceRecall',
  'gymAnagram',
];

/** The highest difficulty tier. */
export const REST_GAME_MAX_DIFFICULTY = 3; // [tier]

/** A stable non-cryptographic hash (FNV-1a, 32 bit); repeatability, not secrecy, is the requirement. */
export function restGameSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * The round clock every family uses, so a round fits inside the SHORTEST rest that offers it.
 * Each value is at most half of its band's top (45 of 90, 60 of 120, 90 of 180), so recovery time
 * remains. Moved from restWord.ts (baseRoundForRest), values unchanged.
 *
 * @param restS [s] the prescribed rest, RestTimer.durationS
 * @returns the round clock [s]
 */
export function restRoundClockS(restS: number): number {
  if (restS <= 90) return 45; // [s]
  if (restS <= 120) return 60; // [s]
  return 90; // [s]
}

/**
 * More completed sets and more wins make a round stricter: one tier per three of either, capped.
 * The formula Rest Word shipped with (restWord.ts), now shared.
 */
export function restGameDifficulty(context: RestGameContext, priorWins: number): number {
  return Math.min(REST_GAME_MAX_DIFFICULTY, Math.floor((context.sessionSetOrdinal - 1 + priorWins) / 3));
}

/** The family a rest suggests when the user has picked none this session; varies set by set. */
export function seededFamily(context: RestGameContext): RestGameFamily {
  const seed = restGameSeed(
    `family:${context.exerciseId}:${context.assignmentDate}:${context.sessionId}:${String(context.setNumber)}`,
  );
  return REST_GAME_FAMILIES[seed % REST_GAME_FAMILIES.length] ?? 'restWord';
}

/** One seeded stream per family, set and tier, so a reload restores the same round. */
export function restGameRng(
  family: RestGameFamily,
  context: RestGameContext,
  difficulty: number,
): () => number {
  return seededRng(
    restGameSeed(
      `${family}:${context.exerciseId}:${context.assignmentDate}:${context.sessionId}:${String(context.setNumber)}:${String(difficulty)}`,
    ),
  );
}
