import type { Exercise, Kg, ML, Profile, UnitSystem } from './types';
import { KG_PER_LB } from './types';

/** 1 US fluid ounce = 29.5735295625 mL exactly (1 US gal = 3.785411784 L / 128). */
const ML_PER_US_FL_OZ = 29.5735295625; // [mL/fl oz]

/**
 * Guards the binary-float division inside achievableLoad. Dimensionless: it is
 * added to a count of steps, not to a mass, which makes it a relative tolerance
 * of one part in 1e9 of a single step. 63.5029318 kg / (5 lb in kg) evaluates to
 * 27.999999999999996 and would floor one whole step too low without it.
 */
const STEP_COUNT_EPS = 1e-9; // dimensionless

export const UNIT_LABEL: Record<
  UnitSystem,
  { load: 'kg' | 'lb'; mass: 'kg' | 'lb'; volume: 'mL' | 'fl oz' }
> = {
  metric: { load: 'kg', mass: 'kg', volume: 'mL' },
  imperial: { load: 'lb', mass: 'lb', volume: 'fl oz' },
};

/** Canonical kg -> display unit, rounded to 0.1 in the display unit. */
function toDisplay(valueKg: Kg, units: UnitSystem): number {
  const inDisplayUnit = units === 'imperial' ? valueKg / KG_PER_LB : valueKg; // [lb] or [kg]
  return Math.round(inDisplayUnit * 10) / 10; // [lb] or [kg], 0.1 resolution
}

/** Display unit -> canonical kg, exact: no rounding at the storage boundary. */
function toCanonical(entered: number, units: UnitSystem): Kg {
  return units === 'imperial' ? entered * KG_PER_LB : entered; // [kg]
}

/** Logged load for display. No plate quantisation: a logged value is shown as lifted. */
export function displayLoad(loadKg: Kg, units: UnitSystem): number {
  return toDisplay(loadKg, units); // [lb] or [kg]
}

/** Load as typed by the user, converted exactly for storage. */
export function toStoredLoad(entered: number, units: UnitSystem): Kg {
  return toCanonical(entered, units); // [kg]
}

/** Body mass for display, 0.1 resolution, no quantisation. */
export function displayMass(massKg: Kg, units: UnitSystem): number {
  return toDisplay(massKg, units); // [lb] or [kg]
}

/** Body mass as typed by the user, converted exactly for storage. */
export function toStoredMass(entered: number, units: UnitSystem): Kg {
  return toCanonical(entered, units); // [kg]
}

/**
 * Largest multiple of stepKg that is <= targetKg. Rounds DOWN, never up: a
 * suggestion the user cannot assemble is worse than one slightly under.
 * stepKg <= 0 means "no discrete step" (bodyweight) and the target passes
 * through unchanged.
 *
 * A target already on the grid is returned unchanged rather than rebuilt as
 * steps * stepKg. The rebuild is not the identity in binary floating point when
 * the step came from the other unit system -- 28 * (5 lb in kg) evaluates to
 * 63.502931800000006, not the 63.5029318 that went in -- and master plan
 * section 7's units gate requires exact equality there.
 */
export function achievableLoad(targetKg: Kg, stepKg: number): Kg {
  if (!(stepKg > 0)) return targetKg; // [kg] no discrete step
  const exactSteps = targetKg / stepKg; // dimensionless count, before flooring
  const steps = Math.floor(exactSteps + STEP_COUNT_EPS); // dimensionless count
  if (Math.abs(exactSteps - steps) < STEP_COUNT_EPS) return targetKg; // [kg] already on the grid
  return steps * stepKg; // [kg]
}

/** Smallest load increment the profile's equipment can assemble, in kg. */
export function stepFor(ex: Exercise, steps: Profile['equipmentSteps']): number {
  switch (ex.modality) {
    case 'barbell':
      return steps.hasMicroPlates ? steps.microPlateKg : steps.barbellKg; // [kg] total on the bar
    case 'dumbbell':
      return steps.dumbbellPairKg; // [kg] per pair
    case 'machine':
    case 'cable':
      return steps.stackKg; // [kg] per pin
    case 'bodyweight':
      return 0; // [kg] no discrete step
  }
}

/** "60 kg" | "135 lb" | "BW" (bodyweight, loadKg 0) | "—" (not recorded, null). */
export function formatLoad(loadKg: Kg | null, units: UnitSystem): string {
  if (loadKg === null) return '—';
  if (loadKg === 0) return 'BW';
  return `${displayLoad(loadKg, units)} ${UNIT_LABEL[units].load}`;
}

/** "95.3 kg" | "210.1 lb" — always one decimal. */
export function formatMass(massKg: Kg, units: UnitSystem): string {
  return `${displayMass(massKg, units).toFixed(1)} ${UNIT_LABEL[units].mass}`;
}

/** "500 mL" | "17 fl oz" — whole units; volume is never shown to a decimal. */
export function formatVolume(ml: ML, units: UnitSystem): string {
  if (units === 'metric') return `${Math.round(ml)} ${UNIT_LABEL.metric.volume}`;
  return `${Math.round(ml / ML_PER_US_FL_OZ)} ${UNIT_LABEL.imperial.volume}`; // [fl oz]
}
