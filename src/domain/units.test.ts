import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  UNIT_LABEL,
  achievableLoad,
  displayLoad,
  displayMass,
  formatLoad,
  formatMass,
  formatVolume,
  stepFor,
  toStoredGirthCm,
  toStoredLoad,
  toStoredMass,
} from './units';
import { KG_PER_LB } from './types';
import type { Exercise, Profile, UnitSystem } from './types';

const STEPS: Profile['equipmentSteps'] = {
  barbellKg: 2.5, // [kg] total, a pair of 1.25 kg plates
  dumbbellPairKg: 5, // [kg] per pair
  stackKg: 5, // [kg] per pin
  hasMicroPlates: false,
  microPlateKg: 0.5, // [kg] total, a pair of 0.25 kg plates
};

function exercise(id: string, modality: Exercise['modality']): Exercise {
  return {
    id,
    name: id,
    isBodyweight: modality === 'bodyweight',
    isCompoundPrimary: false,
    modality,
    loadClass: 'isolation',
    muscleGroups: [],
    secondaryMuscles: [],
    equipment: ['full-gym'],
    videoQuery: null,
    formCueId: null,
    note: null,
  };
}

describe('exact conversion', () => {
  it('converts pounds to kilograms by the exact definition', () => {
    // 225 lb x 0.45359237 kg/lb = 102.05828325 kg exactly.
    expect(toStoredLoad(225, 'imperial')).toBe(102.05828325);
    expect(toStoredLoad(225, 'imperial')).toBe(225 * KG_PER_LB);
  });

  it('stores a metric entry unchanged', () => {
    expect(toStoredLoad(60, 'metric')).toBe(60); // [kg]
    expect(toStoredMass(95.3, 'metric')).toBe(95.3); // [kg]
  });

  it('reproduces the master plan P4 example', () => {
    // An imperial user entering 135 lb stores 61.23496995 kg.
    expect(toStoredLoad(135, 'imperial')).toBe(61.23496995);
    // A metric user viewing the same set sees 61.2 kg.
    expect(displayLoad(61.23496995, 'metric')).toBe(61.2);
    // The imperial user sees 135 lb, not 134.9 or 135.1.
    expect(displayLoad(61.23496995, 'imperial')).toBe(135);
  });
});

describe('display rounding', () => {
  it('rounds loads to 0.1 in the display unit', () => {
    expect(displayLoad(60.04, 'metric')).toBe(60); // [kg]
    expect(displayLoad(60.05, 'metric')).toBe(60.1); // [kg]
  });

  it('rounds body mass to 0.1 in the display unit', () => {
    expect(displayMass(95.34, 'metric')).toBe(95.3); // [kg]
    expect(displayMass(95.3, 'imperial')).toBe(210.1); // [lb]
  });
});

describe('achievableLoad', () => {
  it('rounds down to the equipment step', () => {
    expect(achievableLoad(61.23, 2.5)).toBe(60); // [kg]
  });

  it('returns an exact multiple when the target is already one', () => {
    expect(achievableLoad(62.5, 2.5)).toBe(62.5); // [kg]
  });

  it('passes the target through when there is no discrete step', () => {
    expect(achievableLoad(61.23, 0)).toBe(61.23); // [kg]
  });

  it('never rounds up across a float division boundary', () => {
    // 61.5 / 2.5 evaluates to 24.6 and floors to 24 steps = 60 kg.
    expect(achievableLoad(61.5, 2.5)).toBe(60); // [kg]
    // 0.3 / 0.1 evaluates to 2.9999999999999996; without the epsilon the result
    // would be 0.2, one step below an on-grid target.
    expect(achievableLoad(0.3, 0.1)).toBeCloseTo(0.3, 10); // [kg]
  });

  it('leaves an on-grid target untouched when the step comes from the other unit (P1 gate)', () => {
    // 63.5029318 kg is exactly 28 x (5 lb) = 28 x 2.26796185 kg. The division
    // evaluates to 27.999999999999996, so the epsilon is what keeps the count at
    // 28 rather than 27; returning the target itself is what keeps the result
    // bit-identical instead of 63.502931800000006.
    const fiveLbStepKg = toStoredLoad(5, 'imperial'); // [kg] one 5 lb plate pair
    expect(achievableLoad(63.5029318, fiveLbStepKg)).toBe(63.5029318); // [kg]
  });
});

describe('stepFor', () => {
  it('maps modality to the profile equipment step', () => {
    expect(stepFor(exercise('bench', 'barbell'), STEPS)).toBe(2.5); // [kg]
    expect(stepFor(exercise('curl', 'dumbbell'), STEPS)).toBe(5); // [kg]
    expect(stepFor(exercise('press', 'machine'), STEPS)).toBe(5); // [kg]
    expect(stepFor(exercise('row', 'cable'), STEPS)).toBe(5); // [kg]
    expect(stepFor(exercise('pushup', 'bodyweight'), STEPS)).toBe(0); // [kg]
  });

  it('uses the micro-plate step for barbells when the user has them', () => {
    expect(stepFor(exercise('bench', 'barbell'), { ...STEPS, hasMicroPlates: true })).toBe(0.5); // [kg]
  });
});

describe('formatting', () => {
  it('formats loads', () => {
    expect(formatLoad(60, 'metric')).toBe('60 kg');
    expect(formatLoad(61.23496995, 'imperial')).toBe('135 lb');
  });

  it('distinguishes a bodyweight set from an unrecorded load', () => {
    // loadKg 0 is a real bodyweight set and must never be dropped (A60).
    expect(formatLoad(0, 'metric')).toBe('BW');
    expect(formatLoad(null, 'metric')).toBe('—');
  });

  it('formats body mass with one decimal', () => {
    expect(formatMass(95.3, 'metric')).toBe('95.3 kg');
    expect(formatMass(95.3, 'imperial')).toBe('210.1 lb');
  });

  it('formats volume in whole units', () => {
    expect(formatVolume(500, 'metric')).toBe('500 mL');
    expect(formatVolume(500, 'imperial')).toBe('17 fl oz');
  });

  it('labels both unit systems', () => {
    expect(UNIT_LABEL.metric).toEqual({ load: 'kg', mass: 'kg', volume: 'mL', girth: 'cm' });
    expect(UNIT_LABEL.imperial).toEqual({
      load: 'lb',
      mass: 'lb',
      volume: 'fl oz',
      girth: 'in',
    });
  });
});

const anyUnits: fc.Arbitrary<UnitSystem> = fc.constantFrom('metric', 'imperial');
// [kg] canonical load, the range the app can plausibly store.
const anyLoadKg = fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true });

describe('properties', () => {
  it('round-trips every load to within 0.05 of the display unit', () => {
    fc.assert(
      fc.property(anyLoadKg, anyUnits, (loadKg, units) => {
        const back = toStoredLoad(displayLoad(loadKg, units), units); // [kg]
        // Signed as master plan section 3 requires: the delta is back − loadKg,
        // then taken absolute and expressed in the display unit.
        const errorInDisplayUnit = Math.abs(back - loadKg) / (units === 'imperial' ? KG_PER_LB : 1);
        return errorInDisplayUnit <= 0.05 + 1e-9; // [lb] or [kg]
      }),
      { numRuns: 10_000 },
    );
  });

  it('keeps achievableLoad a multiple of the step, at or below the target', () => {
    fc.assert(
      fc.property(anyLoadKg, fc.constantFrom(0.5, 1, 1.25, 2.5, 5, 10), (targetKg, stepKg) => {
        const got = achievableLoad(targetKg, stepKg); // [kg]
        const stepsTaken = got / stepKg; // dimensionless count
        const isMultiple = Math.abs(stepsTaken - Math.round(stepsTaken)) < 1e-9;
        // Tolerance is the epsilon guard's worth of one step, in kg.
        const tol = stepKg * 1e-9; // [kg]
        return isMultiple && got <= targetKg + tol && got > targetKg - stepKg - tol;
      }),
      { numRuns: 10_000 },
    );
  });
});

/*
 * Girth entry, added by alpha round 1 Task 3. The three tape girths were held as cm regardless
 * of the profile's unit system (SetupWizard.tsx Draft.neck/waist/hip, all commented "[cm], as
 * typed"), so an imperial user typed inches into a field the Navy equation read as centimetres
 * and got a plausible, wrong body-fat estimate. These tests fix the conversion at the boundary.
 *
 * 1 in = 2.54 cm is exact by definition (international inch, 1959), so equality here is exact
 * and no epsilon is specified: 15 * 2.54 = 38.1 and 34 * 2.54 = 86.36 are both bit-exact.
 */
describe('girth entry converts at the storage boundary', () => {
  it('passes a metric girth through unchanged', () => {
    expect(toStoredGirthCm(38.1, 'metric')).toBe(38.1); // [cm]
  });

  it('converts an imperial girth from inches to centimetres, exactly', () => {
    expect(toStoredGirthCm(15, 'imperial')).toBe(38.1); // [cm], 15 in
    expect(toStoredGirthCm(34, 'imperial')).toBe(86.36); // [cm], 34 in
  });

  it('labels the girth unit by the unit system, which is the defect this fixes', () => {
    expect(UNIT_LABEL.metric.girth).toBe('cm');
    expect(UNIT_LABEL.imperial.girth).toBe('in');
  });
});
