/**
 * Seedable randomness for the fun mechanics, so every roll can be replayed in a test.
 *
 * ALGORITHM. splitmix32, in the JavaScript form published by bryc at
 * https://github.com/bryc/code/blob/master/jshash/PRNGs.md (section "SplitMix32"), which is the
 * MurmurHash3 fmix32 finalizer driven by a Weyl sequence. That section publishes two variants;
 * this is the first, with multipliers 0x85ebca6b and 0xc2b2ae35 and shifts 15, 13, 16. The seed
 * hash is xmur3 from Addendum A of the same page, a MurmurHash3 finalizer chain.
 *
 * WHY THIS ONE, AND WHAT WAS REJECTED. mulberry32 shipped here first and was replaced. Its
 * author records that it never emits about a third of the 32-bit values (bryc's page, section
 * "Mulberry32"), and the measurement bears it out: over the first 2^27 outputs mulberry32
 * repeats a 32-bit value 4,560,378 times from seed 0, and between 4,560,378 and 4,567,010 times
 * across seeds 0, 1, 42, 2^31 and 2^32-1, against 2,097,152 for an ideal uniform 32-bit source
 * by the birthday bound. splitmix32 repeats none: the Weyl step adds an odd constant and the
 * finalizer composes xor-shifts with odd multiplies, so the whole map is a bijection on the
 * 32-bit state and the period 2^32 stream is a permutation of all 2^32 values. That costs
 * nothing here, so the defect is not worth carrying. See master plan section 10.7.
 *
 * The export is named `seededRng` rather than for the algorithm, so replacing it later is the
 * one assignment at the bottom of this file and no call site moves. Nothing security-relevant
 * may use it: ids come from crypto.randomUUID() via src/domain/ids.ts.
 *
 * PORTABILITY. Every step is Math.imul, a bitwise operator, or `>>> 0`, all of which are
 * exactly specified 32-bit integer operations in ECMA-262. No float bit reinterpretation is
 * used, so the stream is identical on every engine. rng.test.ts pins the output against the
 * published reference implementation to keep it that way.
 */

/**
 * Uniform pseudo-random doubles in [0, 1) from a 32-bit seed. Period 2^32, and because the
 * generator is a bijection the period is also the point at which the first value can recur.
 */
export function splitmix32(seed: number): () => number {
  let a = seed >>> 0; // [dimensionless] 32-bit state, advanced by a Weyl sequence
  return function next(): number {
    a = (a + 0x9e3779b9) >>> 0; // 2^32 / golden ratio, the standard Weyl increment; odd
    let t = a ^ (a >>> 15);
    t = Math.imul(t, 0x85ebca6b);
    t = t ^ (t >>> 13);
    t = Math.imul(t, 0xc2b2ae35);
    t = t ^ (t >>> 16);
    return (t >>> 0) / 4294967296; // 2^32, so the result is in [0, 1)
  };
}

/**
 * xmur3: hash a string to one well-distributed unsigned 32-bit seed.
 *
 * Needed because a seed here is a profile id and an integer ordinal, which have to become one
 * 32-bit number before any generator can take them. It also decorrelates ordinals that differ
 * by one. Under splitmix32 that second job is belt and braces rather than load bearing, since
 * splitmix32's own first output is already a MurmurHash3 finalizer of its seed; under
 * mulberry32, which correlates on nearby seeds, it was the thing keeping adjacent sets apart.
 */
export function seedFromString(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The production source of randomness. One call site so tests can see what they replaced. */
export function systemRng(): number {
  return Math.random();
}

/** The seeded generator every caller uses. Swapping the algorithm is this one line. */
export const seededRng: (seed: number) => () => number = splitmix32;
