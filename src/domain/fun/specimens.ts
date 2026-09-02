import type { SpecimenCard, SpecimenRarity } from '../../content/specimenCards';
import { RARITY_WEIGHT } from '../../content/specimenCards';
import type { EpochMs, SpecimenInventory } from '../types';
import { seedFromString, seededRng } from './rng';

/**
 * ORDINAL RULE (master plan section 10.8). Every specimen draw is keyed by the ordinal of the
 * logged set that triggered it, and one ordinal can yield at most one card ever.
 *
 *   1. The ordinal of a logged set is `totalSetsLogged` read AFTER the increment, that is, the
 *      just-logged set's own ordinal. There is no `+ 1`: the counter has already moved.
 *   2. `deleteSet` decrements the counter (plan Task 4, code review A47), so deleting a set and
 *      logging another gives that set the same ordinal the deleted one had.
 *   3. The card an ordinal produced is recorded against that ordinal, in `acquiredByOrdinal`.
 *      `drawSpecimenForLoggedSet` returns the recorded card and takes no new acquisition.
 *
 * Rules 2 and 3 are what close the farm. Rule 2 alone would not: it makes the ordinal repeat,
 * but the second draw runs against an inventory that now owns the first card, so that card is
 * out of the pool and the re-roll hands out a different one. Rule 3 is the part that makes the
 * repeat return the same card instead of a new one. A user who logs a set, sees the card,
 * deletes the set and logs it again therefore sees the card they already have.
 */

// ---------------------------------------------------------------------------
// Drop-chance arithmetic. Show the working; the number is not a taste call.
//
//   Cards in the pool                     N = 37
//   Default availability                  4 sessions/week
//   Working sets per session              ~20
//   Logged sets per week                  4 x 20 = 80
//   Default programme length              12 weeks  (DEFAULT_WEEKS,
//                                         src/ui/setup/SetupWizard.tsx:125) = 960 logged sets
//   Longest programme the generator       24 weeks  (PLAN_WEEKS_MAX,
//   will build                            src/domain/plan/generator.ts:41) = 1920 logged sets
//
// A drop is only ever taken from the not-yet-owned pool, so no drop is ever a duplicate and
// completing the collection takes exactly N drops. Sets to completion is therefore negative
// binomial: the number of Bernoulli(p) trials needed for r = N = 37 successes.
//
//   p = 0.02:
//     E[sets]  = r / p               = 37 / 0.02              = 1850 sets = 23.1 weeks
//     SD[sets] = sqrt(r (1 - p)) / p = sqrt(37 x 0.98) / 0.02 = 301.08 -> 301 sets = 3.8 weeks
//     median   (exact negative binomial CDF)                  = 1834 sets = 22.9 weeks
//
// Those three are computed, not quoted: the simulation in specimens.test.ts gives mean 1852.6
// and median 1827.5 over 2000 programmes, the same distribution measured a second way.
//
// WHAT THIS MEANS AT THE SHIPPED DEFAULT. The expectation lands on the 24-week maximum, not on
// the 12-week default, and the default is the case most users are in. Over the 960 logged sets
// of a default programme the collection is a capped binomial,
// E[cards] = E[min(37, Binomial(960, 0.02))] = 19.2 with median 19, and the probability of
// finishing inside one such programme is 1.7e-4. So a median user ends the default 12-week
// programme holding about half the Atlas and completes it across later programmes, which is the
// intended behaviour: the inventory is per profile and outlives any one plan. Over a 24-week
// programme the median user holds all 37, and 59 % of simulated programmes complete the pool.
//
// Legacy comparison (content review section 2.2): p = 0.15 with 42 cards gives 42 / 0.15 = 280
// sets. At 80 logged sets a week that is 3.5 weeks, after which every set produced nothing for
// the remaining 71 % of a 12-week programme. That is the defect this constant fixes.
//
// The review's own recommendation was "~1.5 %"; 2 % is chosen instead because it puts the
// expected completion at 23.1 weeks, on the longest programme the generator will build. The
// review assumed the legacy fixed 7-day split and did not have the app's 4-sessions-a-week
// default. The constant is not retuned here; it is stated against the two lines it depends on.
// ---------------------------------------------------------------------------
export const SPECIMEN_DROP_CHANCE = 0.02; // [dimensionless] probability per logged set

/**
 * An inventory carrying the ordinal ledger rule 3 needs: which card each set ordinal produced.
 *
 * Now an alias. The field was declared here as an intersection over `SpecimenInventory` while
 * `SpecimenInventory` did not have it; plan Task 4 moved it into src/domain/types.ts and into
 * `SpecimenInventorySchema`, which is what makes it survive a save and load (a `z.object`
 * strips unknown keys, so before that move the ledger lasted only until the next reload). The
 * alias stays so no call site or test moves, and so the name still says which contract these
 * two functions depend on.
 *
 * The map is keyed by the ordinal rendered as a decimal string rather than by a number,
 * because a JSON object key always is one and the type must state what a reloaded document
 * actually holds. Indexing it with the numeric ordinal is unchanged: JavaScript coerces.
 */
export type OrdinalKeyedInventory = SpecimenInventory;

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
 * Consumes at most two values from `rng`: one for the drop roll, one to select the card. The
 * order is fixed and pinned by a golden test, because swapping the two changes both whether a
 * card drops and which card it is.
 *
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
 * `ordinal` is the ordinal of the set within the profile's history, which the caller takes as
 * `inventory.totalSetsLogged` after the increment (rule 1 above). Both inputs are stable state,
 * so the same logged set always produces the same roll and the same card however often it is
 * replayed: a re-render, a reducer double-invocation (code review A57) or a replayed migration
 * cannot reroll a drop.
 *
 * The parts are hashed rather than combined arithmetically because a profile id is a string and
 * the seed has to be one 32-bit integer.
 */
export function specimenSeed(profileId: string, ordinal: number): number {
  return seedFromString(`${profileId}:${ordinal}`);
}

/** The generator for one logged set. Fresh per set, so drops never depend on call order. */
export function specimenRngForLoggedSet(profileId: string, ordinal: number): () => number {
  return seededRng(specimenSeed(profileId, ordinal));
}

/**
 * drawSpecimen for one logged set, seeded from stable state instead of an ambient generator.
 * This is the production entry point; `drawSpecimen` stays exported for the statistical tests
 * and for any caller that already holds a stream.
 *
 * Returns the recorded card when the ordinal has already produced one, and rolls only when it
 * has not, so one ordinal yields at most one card ever (rule 3). A recorded id that is no
 * longer in `cards` returns null rather than falling through to a fresh roll: the ordinal is
 * spent either way, and re-rolling it would be the farm this rule exists to close.
 *
 * Pure: recording the result is `recordSpecimenDraw`.
 */
export function drawSpecimenForLoggedSet(
  inventory: OrdinalKeyedInventory | undefined,
  cards: readonly SpecimenCard[],
  profileId: string,
  ordinal: number,
  dropChance: number,
): SpecimenCard | null {
  const recorded = inventory?.acquiredByOrdinal?.[ordinal];
  if (recorded !== undefined) return cards.find((c) => c.id === recorded) ?? null;
  return drawSpecimen(inventory, cards, specimenRngForLoggedSet(profileId, ordinal), dropChance);
}

/**
 * Record one drop against both the card id and the set ordinal that produced it.
 *
 * Returns the inventory unchanged, by reference, when the ordinal is already spent, so a
 * repeated call cannot add a second acquisition however it is reached: a double-invoked
 * reducer, a replayed migration, or a delete and relog at the reused ordinal.
 *
 * `at` is [epoch ms, UTC], the instant the set was logged.
 */
export function recordSpecimenDraw(
  inventory: OrdinalKeyedInventory,
  ordinal: number,
  card: SpecimenCard,
  at: EpochMs,
  exerciseId: string | null,
): OrdinalKeyedInventory {
  if (inventory.acquiredByOrdinal?.[ordinal] !== undefined) return inventory;
  return {
    ...inventory,
    acquired: { ...inventory.acquired, [card.id]: { at, exerciseId } },
    acquiredByOrdinal: { ...inventory.acquiredByOrdinal, [ordinal]: card.id },
  };
}
