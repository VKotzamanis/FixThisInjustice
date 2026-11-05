// src/domain/fun/plateMath.ts
//
// Plate Math (P6, R10): load one side of a bar so the whole bar matches a target. A puzzle in
// plain arithmetic, in the profile's own units; nothing here is a health number or feeds training.
// The arithmetic runs in integer hundredths, so 1.25 kg plates never meet a floating-point miss.
//
// Units: every load is [kg] for a metric round and [lb] for an imperial one, BOTH sides of the bar
// included; a plate is the mass of ONE plate; durations [s].
import type { RestGameContext } from '../training/restTimer';
import type { UnitSystem } from '../types';
import { restGameDifficulty, restGameRng, restRoundClockS } from './restGames';

/** One plate of each size the game offers, heaviest first [kg] or [lb] per plate. */
export const PLATE_MATH_PLATES: Readonly<Record<UnitSystem, readonly number[]>> = {
  metric: [25, 20, 15, 10, 5, 2.5, 1.25], // [kg]
  imperial: [45, 35, 25, 10, 5, 2.5], // [lb]
};

/** The empty bar [kg] or [lb]. */
export const PLATE_MATH_BAR: Readonly<Record<UnitSystem, number>> = { metric: 20, imperial: 45 };

/** Targets per round [targets]. */
export const PLATE_MATH_TARGETS = 3;

/** A side holds at most this many plates [plates]; further taps are ignored. */
export const PLATE_MATH_MAX_PER_SIDE = 12;

const CENTI = 100; // [hundredths per unit]

export interface PlateMathRound {
  units: UnitSystem;
  bar: number; // [kg] or [lb]
  plates: readonly number[]; // [kg] or [lb] per plate, heaviest first
  targets: readonly number[]; // [kg] or [lb] whole bar, both sides
  durationS: number; // [s] the round clock
  difficulty: number; // [tier] 0-3
}

function centi(value: number): number {
  return Math.round(value * CENTI);
}

/** The whole bar: the bar plus the same plates on both sides [kg] or [lb]. */
export function plateMathLoad(bar: number, side: readonly number[]): number {
  const total = centi(bar) + 2 * side.reduce((sum, plate) => sum + centi(plate), 0); // [hundredths]
  return total / CENTI;
}

/** True when the loaded bar equals the target to the hundredth. */
export function plateMathMatches(target: number, bar: number, side: readonly number[]): boolean {
  return centi(plateMathLoad(bar, side)) === centi(target);
}

/**
 * Three targets, each built from 2 + difficulty seeded plates per side, so every target is
 * reachable with the plates on offer.
 *
 * @param restS [s] the prescribed rest, RestTimer.durationS
 * @param priorWins [rounds] won earlier in this lifting day
 */
export function plateMathRound(
  context: RestGameContext,
  restS: number,
  priorWins: number,
  units: UnitSystem,
): PlateMathRound {
  const difficulty = restGameDifficulty(context, priorWins);
  const plates = PLATE_MATH_PLATES[units];
  const bar = PLATE_MATH_BAR[units];
  const rng = restGameRng('plateMath', context, difficulty);
  const perSide = 2 + difficulty; // [plates]
  const targets: number[] = [];
  for (let i = 0; i < PLATE_MATH_TARGETS; i += 1) {
    const side = Array.from({ length: perSide }, () => plates[Math.floor(rng() * plates.length)] ?? plates[0]!);
    targets.push(plateMathLoad(bar, side));
  }
  return { units, bar, plates, targets, durationS: restRoundClockS(restS), difficulty };
}
