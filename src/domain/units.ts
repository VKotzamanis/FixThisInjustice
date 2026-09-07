import type { BeverageTarget } from './nutrition';
import type { Exercise, Kg, ML, Profile, UnitSystem } from './types';
import { KG_PER_LB } from './types';

/** 1 US fluid ounce = 29.5735295625 mL exactly (1 US gal = 3.785411784 L / 128). */
const ML_PER_US_FL_OZ = 29.5735295625; // [mL/fl oz]

/** 1 international inch = 2.54 cm exactly, by definition since 1959. */
const CM_PER_IN = 2.54; // [cm/in]

/**
 * Guards the binary-float division inside achievableLoad. Dimensionless: it is
 * added to a count of steps, not to a mass, which makes it a relative tolerance
 * of one part in 1e9 of a single step. 63.5029318 kg / (5 lb in kg) evaluates to
 * 27.999999999999996 and would floor one whole step too low without it.
 */
const STEP_COUNT_EPS = 1e-9; // dimensionless

export const UNIT_LABEL: Record<
  UnitSystem,
  { load: 'kg' | 'lb'; mass: 'kg' | 'lb'; volume: 'mL' | 'fl oz'; girth: 'cm' | 'in' }
> = {
  metric: { load: 'kg', mass: 'kg', volume: 'mL', girth: 'cm' },
  imperial: { load: 'lb', mass: 'lb', volume: 'fl oz', girth: 'in' },
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
 * A tape girth as typed by the user, converted exactly to the centimetres the Navy equation
 * takes. Added by alpha round 1 Task 3, which found the three girth fields held as cm whatever
 * the profile's unit system: an imperial user entered inches and `estimateBodyFatNavy` read them
 * as centimetres, returning a plausible and wrong body-fat percentage with no error anywhere.
 *
 * The conversion is at the ENTRY boundary and the equation stays metric. The imperial DoD form
 * is deliberately not implemented: src/domain/bodyfat.ts records that the two are not
 * algebraically equivalent, the imperial coefficients being a first-order linearisation that
 * returns %BF directly, and that mixing them introduces a silent 0.3-0.7 %BF disagreement.
 */
export function toStoredGirthCm(entered: number, units: UnitSystem): number {
  return units === 'imperial' ? entered * CM_PER_IN : entered; // [cm]
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
      return steps.barbellKg; // [kg] total on the bar
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

/**
 * "3000 mL", or "2200 mL to 3000 mL" when the sex was not disclosed.
 *
 * Round 2 decision A1: the IOM 2005 beverage share is published per sex, so with `nd` the app
 * shows BOTH figures and never averages them or picks one. This is the single place that decision
 * is rendered, so no view can print one endpoint of the range as though it were the target; the
 * type (`BeverageTarget` in ./nutrition) is what forces every caller through here.
 *
 * The connector is the word "to", not a dash: copy contract R5 bars an en dash as a connector.
 */
export function formatBeverageTarget(target: BeverageTarget, units: UnitSystem): string {
  if (target.kind === 'stated') return formatVolume(target.ml, units);
  return `${formatVolume(target.loML, units)} to ${formatVolume(target.hiML, units)}`;
}
