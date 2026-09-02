import { describe, expect, it, vi } from 'vitest';
import { seedFromString, seededRng, splitmix32, systemRng } from './rng';

/**
 * The published splitmix32, transcribed from
 * https://github.com/bryc/code/blob/master/jshash/PRNGs.md (SplitMix32), the first of the two
 * variants that section publishes: multipliers 0x85ebca6b and 0xc2b2ae35, shifts 15, 13, 16.
 * Arithmetic is verbatim; only `var` and the multi-statement lines are rewritten so the file
 * lints. The point of the transcription is that the shipped version uses `>>> 0` where the
 * published one uses `| 0`. Both coerce to the same 32 bits and every consumer of `a` is a
 * bitwise operator or Math.imul, so the two must agree exactly. This test is what makes that
 * claim a measurement rather than an assertion.
 */
function referenceSplitmix32(seed: number): () => number {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 15);
    t = Math.imul(t, 0x85ebca6b);
    t = t ^ (t >>> 13);
    t = Math.imul(t, 0xc2b2ae35);
    t = t ^ (t >>> 16);
    return (t >>> 0) / 4294967296;
  };
}

/**
 * The mulberry32 this module used to ship, transcribed from the same page. It is kept only as
 * the control in the bijection test below: it is what the measurement that motivated the swap
 * was taken against (master plan section 10.7). Nothing imports it.
 */
function rejectedMulberry32(seed: number): () => number {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = ((t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The published xmur3, same source (Addendum A: Seed generating functions).
 */
function referenceXmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next(): number {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

describe('seededRng', () => {
  it('is splitmix32, so the swap in the doc comment is one line', () => {
    expect(seededRng).toBe(splitmix32);
  });

  it('returns values in [0, 1)', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 10_000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = seededRng(1234);
    const b = seededRng(1234);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = seededRng(1);
    const b = seededRng(2);
    expect(a()).not.toBe(b());
  });

  // Cross-platform determinism. These values were produced by the published reference
  // implementation, not by the implementation under test, so a rewrite that drifts is caught
  // even if it drifts consistently with itself.
  it('reproduces the published output for seed 42', () => {
    const rng = seededRng(42);
    expect(Array.from({ length: 5 }, () => rng())).toEqual([
      0.27670720568858087, 0.6023990209214389, 0.6910246594343334, 0.42249477305449545,
      0.6998302508145571,
    ]);
  });

  it('reproduces the published output for seed 0', () => {
    const rng = seededRng(0);
    expect(Array.from({ length: 3 }, () => rng())).toEqual([
      0.9497471370268613, 0.4484545465093106, 0.4985702340491116,
    ]);
  });

  // The `>>> 0` rewrite must be bit-identical to the published `| 0` form across the whole
  // 32-bit state space, including seeds above 2^31 where the two differ in sign.
  it('agrees with the reference implementation over 1000 draws for extreme seeds', () => {
    for (const seed of [0, 1, 42, 2 ** 31, 4294967295, 3077301741]) {
      const mine = seededRng(seed);
      const ref = referenceSplitmix32(seed);
      const a = Array.from({ length: 1000 }, () => mine());
      const b = Array.from({ length: 1000 }, () => ref());
      expect(a, `seed ${seed}`).toEqual(b);
    }
  });

  // The reason for the generator (master plan section 10.7). splitmix32 is a bijection on the
  // 32-bit state: a Weyl step by an odd constant, then a MurmurHash3 finalizer built from
  // xor-shifts and odd multiplies, each of which is invertible. So a window of n draws holds
  // exactly n distinct values and can hold no repeat until the period runs out. mulberry32 is
  // not a bijection and repeats inside the same window; it is asserted here as the control, so
  // the test states the defect as well as the fix.
  it('emits no repeated 32-bit value in 2^20 draws, where mulberry32 repeats hundreds', () => {
    const n = 2 ** 20;
    for (const seed of [0, 42, 7]) {
      const rng = seededRng(seed);
      const seen = new Set<number>();
      for (let i = 0; i < n; i += 1) seen.add(rng() * 4294967296);
      expect(seen.size, `splitmix32 seed ${seed}`).toBe(n);

      const control = rejectedMulberry32(seed);
      const seenControl = new Set<number>();
      for (let i = 0; i < n; i += 1) seenControl.add(control() * 4294967296);
      // Measured: 304, 283 and 277 repeats for seeds 0, 42 and 7. The band only has to
      // separate "collides" from "does not"; 50 is a fifth of the smallest measurement.
      expect(n - seenControl.size, `mulberry32 seed ${seed}`).toBeGreaterThan(50);
    }
  });

  it('is roughly uniform over 100000 draws', () => {
    const rng = seededRng(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i += 1) {
      const idx = Math.min(9, Math.floor(rng() * 10));
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
    // Binomial: n = 100000, p = 0.1, so E = 10000 and SD = sqrt(100000 * 0.1 * 0.9) = 94.87.
    // 600 is 6.3 SD, a two-sided false-failure probability below 1e-9 per bucket. The seed is
    // fixed, so the test is deterministic and the SD only sizes the band.
    // Observed: max deviation 201, 2.1 SD.
    for (const b of buckets) expect(Math.abs(b - 10_000)).toBeLessThan(600);
  });
});

describe('seedFromString', () => {
  it('reproduces the published xmur3 output', () => {
    expect(seedFromString('p1:0')).toBe(3077301741);
    expect(seedFromString('p1:1')).toBe(1945395608);
    expect(seedFromString('')).toBe(167010153);
  });

  it('agrees with the reference implementation', () => {
    for (const text of ['', 'a', 'p1:0', 'profile-9f3a:1847', 'the quick brown fox']) {
      expect(seedFromString(text), text).toBe(referenceXmur3(text)());
    }
  });

  it('returns an unsigned 32-bit integer', () => {
    for (const text of ['', 'a', 'p1:0', 'zzz', 'profile-9f3a:1847']) {
      const seed = seedFromString(text);
      expect(Number.isInteger(seed), text).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });

  it('is deterministic', () => {
    expect(seedFromString('p1:12')).toBe(seedFromString('p1:12'));
  });

  // The hash is what turns a profile id and an integer ordinal into one 32-bit seed at all.
  // Under splitmix32 the distinctness below is exact rather than probable: distinct seeds give
  // distinct first outputs because the generator is a bijection, so this asserts that xmur3 is
  // injective over these 1000 inputs and nothing weaker.
  it('gives 1000 neighbouring inputs 1000 distinct first draws', () => {
    const firsts = new Set<number>();
    for (let i = 0; i < 1000; i += 1) firsts.add(seededRng(seedFromString(`p1:${i}`))());
    expect(firsts.size).toBe(1000);
  });
});

describe('systemRng', () => {
  it('delegates to Math.random', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    expect(systemRng()).toBe(0.25);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
