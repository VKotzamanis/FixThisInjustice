// src/domain/training/plausibility.ts
//
// Spec R4: a load far from the one this exercise was just lifted at, or from the suggestion, is
// most likely a typing slip (62,5 read as 625, audit C02). The app asks once; it never refuses.
// The two ratios are the spec's data-entry sanity bound, not a training prescription.
import type { Kg } from '../types';

/** Dimensionless: more than this many times the reference is questioned. */
export const LOAD_PLAUSIBLE_MAX_RATIO = 2;
/** Dimensionless: less than this fraction of the reference is questioned. */
export const LOAD_PLAUSIBLE_MIN_RATIO = 0.5;

/**
 * True when `loadKg` lies outside [MIN x reference, MAX x reference]. A bodyweight set (0 kg) and
 * a missing or non-positive reference are never questioned.
 *
 * @param loadKg [kg] the load about to be logged
 * @param referenceKg [kg] the latest loaded set of this exercise today, else the suggestion
 */
export function implausibleLoad(loadKg: Kg, referenceKg: Kg | null): boolean {
  if (referenceKg === null || !(referenceKg > 0) || !(loadKg > 0)) return false;
  return (
    loadKg > referenceKg * LOAD_PLAUSIBLE_MAX_RATIO || loadKg < referenceKg * LOAD_PLAUSIBLE_MIN_RATIO
  );
}
