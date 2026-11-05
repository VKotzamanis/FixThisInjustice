// src/ui/setup/unitSwitch.ts
//
// Audit A04: the wizard keeps typed quantities as text in the unit chosen on the first step, so
// switching units used to REINTERPRET them: 80 kg became "80 lb" (36.3 kg) and every target was
// computed from it. Switching now converts what was typed into the new unit (plan ruling PR-8).
// Text that does not parse is left exactly as typed; the field's own validator still reports it.

import { CM_PER_IN, displayGirth, displayMass, toStoredGirthCm, toStoredMass } from '../../domain/units';
import type { SetupAnswers, UnitSystem } from '../../domain/types';
import { parseDecimal } from '../components/UnitInput';

const CM_PER_M = 100; // [cm/m]
const IN_PER_FT = 12; // [in/ft]

/** The typed fields whose meaning depends on the unit system. Load steps are re-seeded instead. */
export type UnitBoundAnswers = Pick<
  SetupAnswers,
  'mass' | 'targetMass' | 'neck' | 'waist' | 'hip' | 'heightM' | 'heightCm' | 'heightFt' | 'heightIn'
>;

/** A body mass typed in `from`, shown in `to` at 0.1 resolution ([kg] or [lb]). */
function massText(text: string, from: UnitSystem, to: UnitSystem): string {
  const entered = parseDecimal(text);
  return entered === null ? text : String(displayMass(toStoredMass(entered, from), to));
}

/** A girth typed in `from`, shown in `to` at 0.1 resolution ([cm] or [in]). */
function girthText(text: string, from: UnitSystem, to: UnitSystem): string {
  const entered = parseDecimal(text);
  return entered === null ? text : String(displayGirth(toStoredGirthCm(entered, from), to));
}

/** [cm] Stature from the pair of fields of `units`, or null when both are blank. */
function statureCm(a: UnitBoundAnswers, units: UnitSystem): number | null {
  if (units === 'metric') {
    const metres = parseDecimal(a.heightM);
    const centimetres = parseDecimal(a.heightCm);
    if (metres === null && centimetres === null) return null;
    return (metres ?? 0) * CM_PER_M + (centimetres ?? 0); // [cm]
  }
  const feet = parseDecimal(a.heightFt);
  const inches = parseDecimal(a.heightIn);
  if (feet === null && inches === null) return null;
  return ((feet ?? 0) * IN_PER_FT + (inches ?? 0)) * CM_PER_IN; // [cm]
}

/**
 * The unit-bound answers re-expressed in `to`. Stature is whole numbers only, as the wizard
 * requires ("ONLY integers", round 1 C1.07.21): whole inches or whole centimetres.
 */
export function convertBodyAnswers(a: SetupAnswers, to: UnitSystem): UnitBoundAnswers {
  const from = a.units;
  const same: UnitBoundAnswers = {
    mass: a.mass,
    targetMass: a.targetMass,
    neck: a.neck,
    waist: a.waist,
    hip: a.hip,
    heightM: a.heightM,
    heightCm: a.heightCm,
    heightFt: a.heightFt,
    heightIn: a.heightIn,
  };
  if (from === to) return same;
  const cm = statureCm(same, from); // [cm]
  let height = {};
  if (cm !== null && to === 'imperial') {
    const inches = Math.round(cm / CM_PER_IN); // [in] whole
    height = { heightFt: String(Math.floor(inches / IN_PER_FT)), heightIn: String(inches % IN_PER_FT) };
  } else if (cm !== null) {
    const whole = Math.round(cm); // [cm] whole
    height = { heightM: String(Math.floor(whole / CM_PER_M)), heightCm: String(whole % CM_PER_M) };
  }
  return {
    ...same,
    ...height,
    mass: massText(a.mass, from, to),
    targetMass: massText(a.targetMass, from, to),
    neck: girthText(a.neck, from, to),
    waist: girthText(a.waist, from, to),
    hip: girthText(a.hip, from, to),
  };
}
