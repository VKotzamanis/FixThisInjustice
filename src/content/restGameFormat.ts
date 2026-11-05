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
  /** "250 ms": one clean Reaction tap [ms]. */
  reactionTime: (ms: number, overrides?: Overrides): string =>
    copy('status.restGameReactionTime', overrides).replace('{ms}', () => String(ms)),

  /** "Over by 5 kg.": how far the loaded bar is past the Plate Math target, already formatted with its unit. */
  plateOver: (amount: string, overrides?: Overrides): string =>
    copy('status.restGamePlateOver', overrides).replace('{amount}', () => amount),

  /** "Take Off 20 kg": the accessible name of a loaded plate, which removes it when tapped. */
  plateTakeOff: (plate: string, overrides?: Overrides): string =>
    copy('label.restGamePlateTakeOff', overrides).replace('{plate}', () => plate),

  /** "Best 250 ms": the fastest clean tap of a Reaction round [ms]. */
  reactionBest: (ms: number, overrides?: Overrides): string =>
    copy('status.restGameReactionBest', overrides).replace('{ms}', () => String(ms)),
  /** "Pad 3": the accessible name of a Sequence Recall pad, 1-based. */
  sequencePad: (n: number, overrides?: Overrides): string =>
    copy('label.restGameSequencePad', overrides).replace('{n}', () => String(n)),

  /** "Length 3 of 5": the sequence length now asked for, out of the goal [steps]. */
  sequenceLength: (length: number, goal: number, overrides?: Overrides): string =>
    copy('status.restGameSequenceLength', overrides)
      .replace('{length}', () => String(length))
      .replace('{goal}', () => String(goal)),
} as const;
