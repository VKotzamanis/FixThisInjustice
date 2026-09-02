/**
 * Seedable randomness for the fun mechanics, so every roll can be replayed in a test.
 *
 * ALGORITHM. mulberry32, by Tommy Ettinger (public domain, 2017;
 * https://gist.github.com/tommyettinger/46a874533244883189143505d203312c), in the JavaScript
 * form published by bryc at
 * https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 * The seed hash is xmur3 from Addendum A of the same page, a MurmurHash3 finalizer chain.
 *
 * KNOWN LIMITATION. The author notes in a later comment on that gist that mulberry32 never
 * emits about a third of the 32-bit values, and recommends splitmix32 where that matters. It
 * does not matter here: this generator picks collectible cards, the coarsest use of randomness
 * in the app, and the rarity split it has to hold is asserted to two decimal places. It is
 * kept rather than replaced because the plan's contract names mulberry32 and the defect has no
 * measurable consequence at this resolution. Nothing security-relevant may use it - ids come
 * from crypto.randomUUID() via src/domain/ids.ts.
 *
 * PORTABILITY. Every step is Math.imul, a bitwise operator, or `>>> 0`, all of which are
 * exactly specified 32-bit integer operations in ECMA-262. No float bit reinterpretation is
 * used, so the stream is identical on every engine. rng.test.ts pins the output against the
 * published reference implementation to keep it that way.
 */

/** Uniform pseudo-random doubles in [0, 1) from a 32-bit seed. Period 2^32. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0; // [dimensionless] 32-bit state
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // 2^32, so the result is in [0, 1)
  };
}

/**
 * xmur3: hash a string to one well-distributed unsigned 32-bit seed.
 *
 * Needed because mulberry32 correlates on similar seeds, and the seeds here are built from a
 * profile id and a counter that increments by one. Hashing decorrelates them.
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
