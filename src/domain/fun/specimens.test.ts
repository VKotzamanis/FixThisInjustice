import { describe, expect, it, vi } from 'vitest';
import type { SpecimenRarity } from '../../content/specimenCards';
import { RARITY_WEIGHT, SPECIMEN_CARDS } from '../../content/specimenCards';
import type { SpecimenInventory } from '../types';
import { mulberry32 } from './rng';
import {
  SPECIMEN_DROP_CHANCE,
  drawSpecimen,
  drawSpecimenForLoggedSet,
  expectedRarityShares,
  specimenSeed,
} from './specimens';

/** The legacy per-set drop chance (legacy/console-store.jsx:184), kept only as a comparison. */
const LEGACY_DROP_CHANCE = 0.15;

function emptyInventory(): SpecimenInventory {
  return { profileId: 'p1', acquired: {}, totalSetsLogged: 0 };
}

/** Runs one simulated programme and returns how many logged sets it took to collect every card. */
function setsToComplete(seed: number, dropChance: number): number {
  const rng = mulberry32(seed);
  const inv = emptyInventory();
  let sets = 0;
  // Hard stop at 100,000 sets so a broken implementation fails the assertion, not the runner.
  while (Object.keys(inv.acquired).length < SPECIMEN_CARDS.length && sets < 100_000) {
    sets += 1;
    const card = drawSpecimen(inv, SPECIMEN_CARDS, rng, dropChance);
    if (card) inv.acquired[card.id] = { at: sets, exerciseId: null };
  }
  return sets;
}

/** Collects the whole pool over `sets` logged sets at the given chance and returns the count. */
function cardsCollectedIn(sets: number, dropChance: number, seed: number): number {
  const rng = mulberry32(seed);
  const inv = emptyInventory();
  for (let i = 0; i < sets; i += 1) {
    const card = drawSpecimen(inv, SPECIMEN_CARDS, rng, dropChance);
    if (card) inv.acquired[card.id] = { at: i, exerciseId: null };
  }
  return Object.keys(inv.acquired).length;
}

describe('the shipped card library', () => {
  // Every number in this file is derived from these counts, so they are asserted, not assumed.
  it('is 12 common, 13 uncommon and 12 rare', () => {
    const byRarity = (r: SpecimenRarity): number =>
      SPECIMEN_CARDS.filter((c) => c.rarity === r).length;
    expect(byRarity('common')).toBe(12);
    expect(byRarity('uncommon')).toBe(13);
    expect(byRarity('rare')).toBe(12);
    expect(SPECIMEN_CARDS.length).toBe(37);
  });
});

describe('expectedRarityShares', () => {
  it('computes the weighted pool share of each rarity', () => {
    const shares = expectedRarityShares(SPECIMEN_CARDS);
    // 12 common x 6 + 13 uncommon x 3 + 12 rare x 1 = 72 + 39 + 12 = 123 weight units.
    // The weights are integers, so each share is an exact quotient of two exactly represented
    // integers and can be asserted with toBe rather than a tolerance.
    expect(shares.common).toBe(72 / 123);
    expect(shares.uncommon).toBe(39 / 123);
    expect(shares.rare).toBe(12 / 123);
  });

  it('has shares that sum to one', () => {
    // The exact statement is the integer one, because 72/123 is not representable in binary
    // and the sum of the three doubles need not be exactly 1.0.
    expect(72 + 39 + 12).toBe(123);
    // The float sum is checked to 1e-12. It is not exactly 1: the measured residual is
    // -1.11e-16, half a double spacing at 1 (2.22e-16), so toBe(1) would fail here for a
    // correct implementation. 1e-12 is about 4500 spacings, so rounding cannot trip it, and it
    // is far tighter than any real defect (a dropped or double-counted card moves a share by at
    // least 1/123 = 8.1e-3).
    const shares = expectedRarityShares(SPECIMEN_CARDS);
    expect(shares.common + shares.uncommon + shares.rare).toBeCloseTo(1, 12);
  });

  it('returns zeros for an empty pool rather than dividing by zero', () => {
    expect(expectedRarityShares([])).toEqual({ common: 0, uncommon: 0, rare: 0 });
  });
});

describe('drawSpecimen', () => {
  it('returns null when the roll fails', () => {
    // rng() = 0.99 on the first call, which is >= any sane drop chance.
    const rng = (): number => 0.99;
    expect(drawSpecimen(emptyInventory(), SPECIMEN_CARDS, rng, 0.02)).toBeNull();
  });

  it('returns null when dropChance is zero, without consuming randomness', () => {
    let calls = 0;
    const rng = (): number => {
      calls += 1;
      return 0;
    };
    expect(drawSpecimen(emptyInventory(), SPECIMEN_CARDS, rng, 0)).toBeNull();
    expect(calls).toBe(0);
  });

  // Code review A57: the legacy roll ran inside a React state updater, where a double-invoked
  // reducer rolls twice. The draw takes its randomness as a parameter and touches no global.
  it('never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    drawSpecimen(emptyInventory(), SPECIMEN_CARDS, mulberry32(5), 1);
    expect(spy).not.toHaveBeenCalled();
  });

  // G6: an exhausted pool returns null instead of throwing.
  it('returns null rather than throwing when the pool is empty', () => {
    const inv = emptyInventory();
    for (const c of SPECIMEN_CARDS) inv.acquired[c.id] = { at: 1, exerciseId: null };
    expect(() => drawSpecimen(inv, SPECIMEN_CARDS, mulberry32(1), 1)).not.toThrow();
    expect(drawSpecimen(inv, SPECIMEN_CARDS, mulberry32(1), 1)).toBeNull();
  });

  it('tolerates a missing inventory', () => {
    const card = drawSpecimen(undefined, SPECIMEN_CARDS, mulberry32(3), 1);
    expect(card).not.toBeNull();
  });

  // G5: the master plan section 7 P8 gate.
  it('keeps rarity proportions within 2 percentage points over 10,000 draws', () => {
    const rng = mulberry32(20260901);
    const counts: Record<SpecimenRarity, number> = { common: 0, uncommon: 0, rare: 0 };
    const n = 10_000;
    for (let i = 0; i < n; i += 1) {
      const card = drawSpecimen(emptyInventory(), SPECIMEN_CARDS, rng, 1);
      expect(card).not.toBeNull();
      if (card) counts[card.rarity] += 1;
    }
    const expected = expectedRarityShares(SPECIMEN_CARDS);
    // Binomial standard error on a share is sqrt(p(1-p)/n). At n = 10,000:
    //   common   p = 0.5854 -> SE = 0.00493, so 0.02 is 4.1 SE
    //   uncommon p = 0.3171 -> SE = 0.00465, so 0.02 is 4.3 SE
    //   rare     p = 0.0976 -> SE = 0.00297, so 0.02 is 6.7 SE
    // The seed is fixed, so the test is deterministic; the SE only justifies the band width.
    // Observed: common 0.5872, uncommon 0.3150, rare 0.0978, all within 0.43 SE of expectation.
    for (const rarity of ['common', 'uncommon', 'rare'] as const) {
      const observed = counts[rarity] / n;
      expect(Math.abs(observed - expected[rarity]), rarity).toBeLessThan(0.02);
    }
  });

  it('weights common cards above rare ones in the same pool', () => {
    expect(RARITY_WEIGHT.common).toBeGreaterThan(RARITY_WEIGHT.uncommon);
    expect(RARITY_WEIGHT.uncommon).toBeGreaterThan(RARITY_WEIGHT.rare);
  });

  // G6: excluding owned cards means a drop never repeats, so exactly N drops complete the pool.
  it('never repeats a card and returns null on the drop after the last one', () => {
    const rng = mulberry32(99);
    const inv = emptyInventory();
    const seen: string[] = [];
    for (let i = 0; i < SPECIMEN_CARDS.length; i += 1) {
      const card = drawSpecimen(inv, SPECIMEN_CARDS, rng, 1);
      expect(card, `draw ${i}`).not.toBeNull();
      if (card) {
        seen.push(card.id);
        inv.acquired[card.id] = { at: i, exerciseId: null };
      }
    }
    expect(new Set(seen).size).toBe(SPECIMEN_CARDS.length);
    expect(drawSpecimen(inv, SPECIMEN_CARDS, rng, 1)).toBeNull();
  });
});

describe('rarity exhaustion', () => {
  // Rarity is not drawn first: the ticket runs over the remaining pool, so an emptied rarity
  // simply stops contributing weight. Nothing needs to fall back and nothing returns null
  // until the whole pool is gone.
  it('keeps drawing from the remaining rarities once every rare card is owned', () => {
    const inv = emptyInventory();
    for (const c of SPECIMEN_CARDS.filter((x) => x.rarity === 'rare')) {
      inv.acquired[c.id] = { at: 1, exerciseId: null };
    }
    const rng = mulberry32(4242);
    const counts: Record<SpecimenRarity, number> = { common: 0, uncommon: 0, rare: 0 };
    const n = 5000;
    for (let i = 0; i < n; i += 1) {
      const card = drawSpecimen(inv, SPECIMEN_CARDS, rng, 1);
      expect(card, `draw ${i}`).not.toBeNull();
      if (card) counts[card.rarity] += 1;
    }
    expect(counts.rare).toBe(0);
    // Weights renormalise over what is left: 72 common and 39 uncommon of 111 units.
    // n = 5000, p = 72/111 = 0.6486 -> SE = sqrt(p(1-p)/n) = 0.00675, so 0.03 is 4.4 SE.
    expect(Math.abs(counts.common / n - 72 / 111)).toBeLessThan(0.03);
    expect(Math.abs(counts.uncommon / n - 39 / 111)).toBeLessThan(0.03);
  });

  it('returns null only when every rarity is exhausted', () => {
    const inv = emptyInventory();
    for (const c of SPECIMEN_CARDS) {
      if (c.rarity !== 'common') inv.acquired[c.id] = { at: 1, exerciseId: null };
    }
    expect(drawSpecimen(inv, SPECIMEN_CARDS, mulberry32(8), 1)).not.toBeNull();
    for (const c of SPECIMEN_CARDS) inv.acquired[c.id] = { at: 1, exerciseId: null };
    expect(drawSpecimen(inv, SPECIMEN_CARDS, mulberry32(8), 1)).toBeNull();
  });
});

describe('the seeded per-set draw', () => {
  // The seed is the profile id and the 1-based ordinal of the logged set, hashed. Replaying the
  // same logged set therefore replays the same roll and the same card.
  it('derives the seed from the profile id and the set ordinal', () => {
    expect(specimenSeed('p1', 0)).toBe(specimenSeed('p1', 0));
    expect(specimenSeed('p1', 1)).not.toBe(specimenSeed('p1', 0));
    expect(specimenSeed('p2', 1)).not.toBe(specimenSeed('p1', 1));
  });

  it('yields the same card every time the same logged set is replayed', () => {
    const inv = emptyInventory();
    const first = drawSpecimenForLoggedSet(inv, SPECIMEN_CARDS, 'p1', 1, 1);
    expect(first).not.toBeNull();
    for (let i = 0; i < 5; i += 1) {
      expect(drawSpecimenForLoggedSet(inv, SPECIMEN_CARDS, 'p1', 1, 1)?.id).toBe(first?.id);
    }
  });

  it('gives different profiles different draws for the same set ordinal', () => {
    const ids = new Set<string | undefined>();
    for (const profileId of ['p1', 'p2', 'p3', 'p4']) {
      ids.add(drawSpecimenForLoggedSet(emptyInventory(), SPECIMEN_CARDS, profileId, 1, 1)?.id);
    }
    expect(ids.size).toBeGreaterThan(1);
  });

  // The per-set seeds are consecutive integers behind a hash, so the drop rate has to be
  // measured, not assumed: a weak hash would correlate the first output of adjacent streams.
  it('holds the drop rate across 10,000 consecutive set ordinals', () => {
    const n = 10_000;
    let drops = 0;
    for (let i = 1; i <= n; i += 1) {
      if (drawSpecimenForLoggedSet(emptyInventory(), SPECIMEN_CARDS, 'p1', i, SPECIMEN_DROP_CHANCE))
        drops += 1;
    }
    // Binomial: E = n p = 200 drops, SD = sqrt(n p (1 - p)) = sqrt(10000 x 0.02 x 0.98) = 14.0.
    // The band is 4 SD = 56 drops. Observed: 216, which is 1.1 SD high.
    expect(Math.abs(drops - 200)).toBeLessThan(56);
  });
});

describe('drop-chance economy', () => {
  it('uses the tuned 2 percent chance', () => {
    expect(SPECIMEN_DROP_CHANCE).toBe(0.02);
    expect(SPECIMEN_DROP_CHANCE).toBeLessThan(LEGACY_DROP_CHANCE);
  });

  // G7: at 4 sessions/week x ~20 sets = 80 logged sets/week, completion should land near the
  // 24-week programme length. Sets-to-complete is negative binomial: mean N/p = 37/0.02 = 1850
  // (23.1 weeks), SD = sqrt(N(1-p))/p = 301 sets, and the right skew puts the median near 1833.
  // The median of 200 runs has SE = 1.2533 SD / sqrt(200) = 27 sets, so the band is ~7 SE either
  // side. Observed here: 1771.5 (min 1156, max 2912), 4.6 SE inside the lower edge.
  //
  // The seeds are consecutive integers, which is mulberry32's documented weak-seeding pattern,
  // so it was checked rather than assumed: re-running with seedFromString-hashed seeds gives
  // median 1776.5 at n = 200 and 1829.0 at n = 2000, against 1771.5 and 1829.5 for the raw
  // seeds. The two agree and both converge on the theoretical median, so the raw seeds stay.
  it('completes the pool in a median 1650-2050 logged sets across 200 programmes', () => {
    const runs: number[] = [];
    for (let seed = 1; seed <= 200; seed += 1) runs.push(setsToComplete(seed, SPECIMEN_DROP_CHANCE));
    runs.sort((a, b) => a - b);
    const median = (runs[99]! + runs[100]!) / 2;
    expect(median).toBeGreaterThanOrEqual(1650);
    expect(median).toBeLessThanOrEqual(2050);
  });

  // G8: the legacy 15 percent rate exhausted the library in about 280 logged sets, roughly 3.2
  // weeks of the 24-week programme (content review section 2.2). This test states both halves:
  // the legacy chance still empties the pool, and the tuned chance does not come close. Under
  // the legacy rule the second assertion fails by construction, which is the defect being fixed.
  it('collects fewer than 15 cards over the 280 sets that exhausted the legacy pool', () => {
    expect(cardsCollectedIn(280, LEGACY_DROP_CHANCE, 555)).toBeGreaterThanOrEqual(30);
    expect(cardsCollectedIn(280, SPECIMEN_DROP_CHANCE, 555)).toBeLessThan(15);
  });
});
