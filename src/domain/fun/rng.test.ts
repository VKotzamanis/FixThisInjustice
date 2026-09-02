import { describe, expect, it, vi } from 'vitest';
import { mulberry32, seedFromString, systemRng } from './rng';

/**
 * The published mulberry32, transcribed from
 * https://github.com/bryc/code/blob/master/jshash/PRNGs.md (Addendum: Mulberry32).
 * Arithmetic is verbatim; only `var` and the comma operators are rewritten so the file lints.
 * The point of the transcription is that the shipped version uses `>>> 0` where the published
 * one uses `| 0`. Both coerce to the same 32 bits and every consumer of `a` is a bitwise
 * operator or Math.imul, so the two must agree exactly. This test is what makes that claim
 * a measurement rather than an assertion.
 */
function referenceMulberry32(seed: number): () => number {
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

describe('mulberry32', () => {
  it('returns values in [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 10_000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  // Cross-platform determinism. These five values were produced by the published reference
  // implementation, not by the implementation under test, so a rewrite that drifts is caught
  // even if it drifts consistently with itself.
  it('reproduces the published output for seed 42', () => {
    const rng = mulberry32(42);
    expect(Array.from({ length: 5 }, () => rng())).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693,
      0.17481389874592423,
    ]);
  });

  it('reproduces the published output for seed 0', () => {
    const rng = mulberry32(0);
    expect(Array.from({ length: 3 }, () => rng())).toEqual([
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197,
    ]);
  });

  // The `>>> 0` rewrite must be bit-identical to the published `| 0` form across the whole
  // 32-bit state space, including seeds above 2^31 where the two differ in sign.
  it('agrees with the reference implementation over 1000 draws for extreme seeds', () => {
    for (const seed of [0, 1, 42, 2 ** 31, 4294967295, 3077301741]) {
      const mine = mulberry32(seed);
      const ref = referenceMulberry32(seed);
      const a = Array.from({ length: 1000 }, () => mine());
      const b = Array.from({ length: 1000 }, () => ref());
      expect(a, `seed ${seed}`).toEqual(b);
    }
  });

  it('is roughly uniform over 100000 draws', () => {
    const rng = mulberry32(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i += 1) {
      const idx = Math.min(9, Math.floor(rng() * 10));
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
    // Binomial: n = 100000, p = 0.1, so E = 10000 and SD = sqrt(100000 * 0.1 * 0.9) = 94.87.
    // 600 is 6.3 SD, a two-sided false-failure probability below 1e-9 per bucket. The seed is
    // fixed, so the test is deterministic and the SD only sizes the band.
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

  // Adjacent set counts must not give adjacent seeds, or the first draw of each set would be
  // correlated. mulberry32 has a weak-seeding failure mode; the hash is what avoids it.
  it('decorrelates neighbouring inputs', () => {
    const firsts = new Set<number>();
    for (let i = 0; i < 1000; i += 1) firsts.add(mulberry32(seedFromString(`p1:${i}`))());
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
