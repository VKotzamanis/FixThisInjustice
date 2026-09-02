import type { SpecimenCard, SpecimenRarity } from '../../content/specimenCards';
import { RARITY_WEIGHT } from '../../content/specimenCards';
import type { SpecimenInventory } from '../types';
import { mulberry32, seedFromString } from './rng';

// ---------------------------------------------------------------------------
// Drop-chance arithmetic. Show the working; the number is not a taste call.
//
//   Cards in the pool                       N = 37
//   Default availability                    4 sessions/week
//   Working sets per session                ~20
//   Logged sets per week                    4 x 20 = 80
//   Programme length (master plan section 3) 24 weeks = 1920 logged sets
//
// A drop is only ever taken from the not-yet-owned pool, so no drop is ever a duplicate and
// completing the collection takes exactly N drops. The number of logged sets that requires is
// the sum of N geometric(p) variables:
//
//   E[sets] = N / p                         SD[sets] = sqrt(N (1 - p)) / p
//
//   p = 0.02  ->  E = 37 / 0.02   = 1850 sets = 23.1 weeks   (96 % of the programme)
//                 SD = sqrt(37 x 0.98) / 0.02 = 301 sets = 3.8 weeks
//
// So a typical user finishes the Atlas between roughly week 19 and week 27: the mechanic stays
// alive for the whole programme and completing it is an event rather than a formality.
//
// Legacy comparison (content review section 2.2): p = 0.15 with 42 cards gives 42 / 0.15 = 280
// sets. At the legacy 70-89 sets/week that is ~3.2 weeks, after which every set produced
// nothing for the remaining ~87 % of the programme. That is the defect this constant fixes.
//
// The review's own recommendation was "~1.5 %"; 2 % is chosen instead because it lands the
// expectation on the programme length for the app's default 4-sessions-a-week availability,
// which the review did not have (it assumed the legacy fixed 7-day split).
// ---------------------------------------------------------------------------
export const SPECIMEN_DROP_CHANCE = 0.02; // [dimensionless] probability per logged set

/**
 * Share of drops each rarity should win from a full pool, given the rarity weights.
 * For the shipped 37-card pool: common 72/123, uncommon 39/123, rare 12/123.
 */
export function expectedRarityShares(
  cards: readonly SpecimenCard[],
): Record<SpecimenRarity, number> {
  const weight: Record<SpecimenRarity, number> = { common: 0, uncommon: 0, rare: 0 };
  let total = 0; // [dimensionless] sum of integer rarity weights
  for (const c of cards) {
    const w = RARITY_WEIGHT[c.rarity];
    weight[c.rarity] += w;
    total += w;
  }
  if (total === 0) return { common: 0, uncommon: 0, rare: 0 };
  return {
    common: weight.common / total,
    uncommon: weight.uncommon / total,
    rare: weight.rare / total,
  };
}

/**
 * Attempt one specimen drop for a logged set.
 *
 * Consumes at most two values from `rng`: one for the drop roll, one to select the card.
 * `rng` is a parameter rather than a module-level `Math.random` so the caller can keep the roll
 * out of any React state updater (code review A57) and so the economy is testable.
 *
 * Rarity is not chosen first. The ticket runs over the remaining pool, so an exhausted rarity
 * stops contributing weight and the other rarities take its share; the shares in
 * expectedRarityShares() are the full-pool case, and they renormalise as cards are collected.
 *
 * Returns the drawn card, or null when the roll fails, the pool is exhausted, or `dropChance`
 * is not positive. It never throws.
 */
export function drawSpecimen(
  inventory: SpecimenInventory | undefined,
  cards: readonly SpecimenCard[],
  rng: () => number,
  dropChance: number,
): SpecimenCard | null {
  if (!(dropChance > 0)) return null;
  if (rng() >= dropChance) return null;

  const owned = inventory?.acquired ?? {};
  const pool = cards.filter((c) => !Object.prototype.hasOwnProperty.call(owned, c.id));
  if (pool.length === 0) return null;

  let total = 0; // [dimensionless] weight units in the remaining pool
  for (const c of pool) total += RARITY_WEIGHT[c.rarity];
  if (total <= 0) return null;

  let ticket = rng() * total;
  for (const c of pool) {
    ticket -= RARITY_WEIGHT[c.rarity];
    if (ticket < 0) return c;
  }
  // Floating-point guard: only reachable if ticket lands exactly on `total`.
  return pool[pool.length - 1] ?? null;
}

/**
 * The seed for one logged set's drop.
 *
 * `setIndex` is the 1-based ordinal of the set within the profile's history, which the caller
 * takes as `inventory.totalSetsLogged + 1` at the moment the set is logged. Both inputs are
 * stable state, so the same logged set always produces the same roll and the same card however
 * often it is replayed: a re-render, a reducer double-invocation (code review A57) or a
 * replayed migration cannot reroll a drop, and a user cannot farm one by undoing a set.
 *
 * The parts are hashed rather than added because mulberry32 correlates on nearby seeds, and
 * consecutive set ordinals are as near as seeds get.
 */
export function specimenSeed(profileId: string, setIndex: number): number {
  return seedFromString(`${profileId}:${setIndex}`);
}

/** The generator for one logged set. Fresh per set, so drops never depend on call order. */
export function specimenRngForLoggedSet(profileId: string, setIndex: number): () => number {
  return mulberry32(specimenSeed(profileId, setIndex));
}

/**
 * drawSpecimen for one logged set, seeded from stable state instead of an ambient generator.
 * This is the production entry point; `drawSpecimen` stays exported for the statistical tests
 * and for any caller that already holds a stream.
 */
export function drawSpecimenForLoggedSet(
  inventory: SpecimenInventory | undefined,
  cards: readonly SpecimenCard[],
  profileId: string,
  setIndex: number,
  dropChance: number,
): SpecimenCard | null {
  return drawSpecimen(inventory, cards, specimenRngForLoggedSet(profileId, setIndex), dropChance);
}
