// src/content/restGameFormat.ts
//
// The rest-game frames that carry a value (P6). Same pattern as FORMAT in copy.ts: the words come
// from the table through `copy(key, overrides)`, the value is substituted with a function
// replacement so a `$` in a value is never expanded. Kept beside copy.ts rather than inside its
// FORMAT block so rest-game changes stay in rest-game files.
import { copy, type CopyKey } from './copy';

type Overrides = Readonly<Partial<Record<CopyKey, string>>>;

export const REST_GAME_FORMAT = {
  /** "The answer was LUNGE.": the reveal after a lost or timed-out round. */
  answer: (answer: string, overrides?: Overrides): string =>
    copy('status.restGameAnswer', overrides).replace('{answer}', () => answer.toUpperCase()),

  /** "1 of 3 done.": targets, words or trials completed in this round. */
  progress: (done: number, total: number, overrides?: Overrides): string =>
    copy('status.restGameProgress', overrides)
      .replace('{done}', () => String(done))
      .replace('{total}', () => String(total)),
} as const;
