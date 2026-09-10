import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ACTIVITY_BAND,
  ACTIVITY_FACTOR,
  ACTIVITY_STOPS,
  BEVERAGE_TARGET_RANGE_ML,
  FAT_LOSS_RATE_BOUND,
  FEASIBILITY_IMPROBABLE_MULTIPLE,
  NUTRITION_DOMAIN,
  caffeineDoseMg,
  computeTargets,
  creatineDoseG,
  dailyBeverageTargetML,
  fatFreeMassKg,
  isInDomain,
  seedBeverageTargetML,
  statedBeverageTargetML,
  targetDateFeasibility,
  type NutritionInput,
} from './nutrition';
import type { ActivityLevel, GoalKind, Sex } from './types';

/**
 * Base input: male, 30 y, 180 cm, 80 kg, body fat unknown.
 *
 * The content review contains no end-to-end worked energy example: Mifflin-St Jeor needs
 * height and age, which the legacy data file never collected, so no published kcal figure
 * exists for the report's own subject. This suite therefore asserts two kinds of number and
 * nothing else: (a) the report's OWN stated arithmetic (69.57 kg lean / 25.73 kg fat at
 * 95.3 kg and 27 % body fat; 190 g protein = 1.99 g/kg body mass = 2.73 g/kg FFM), and
 * (b) hand-computed values from the verified equations, with the arithmetic written out
 * longhand in the comment above each assertion so a reviewer can check it without running
 * the code.
 *
 * Units: energy kcal/day, mass kg, stature cm, age years, protein g/day, fluid mL/day,
 * creatine g/day, rate kg/week (signed, negative = mass loss).
 */
const base: NutritionInput = {
  sex: 'male',
  ageYears: 30, // years
  heightCm: 180, // cm
  massKg: 80, // kg
  bodyFatPct: null, // percent of body mass; null = not measured
  activity: 'moderate',
  goal: 'maintenance',
  sessionsPerWeek: 4, // sessions/week
  creatine: false,
};

describe('fat-free mass', () => {
  it("reproduces the report's stated body composition for 95.3 kg at 27 % body fat", () => {
    // Content review, Deliverable 1 section 1, row "Body-composition baseline", verbatim:
    // "0.27 x 95.3 = 25.73 kg fat, 69.57 kg lean".
    // Longhand: 0.27 x 95.3 = 25.731 kg fat; 95.3 - 25.731 = 69.569 kg fat-free mass.
    expect(fatFreeMassKg(95.3, 27)).toBeCloseTo(69.569, 3); // kg
    expect(95.3 - fatFreeMassKg(95.3, 27)).toBeCloseTo(25.731, 3); // kg
  });

  it('rejects a body-fat percentage outside [0, 100)', () => {
    expect(() => fatFreeMassKg(80, -1)).toThrow(RangeError);
    expect(() => fatFreeMassKg(80, 100)).toThrow(RangeError);
  });

  it('rejects a non-positive body mass', () => {
    expect(() => fatFreeMassKg(0, 20)).toThrow(RangeError);
  });
});

describe('resting metabolic rate', () => {
  it('uses Mifflin-St Jeor when body fat is unknown (male constant +5)', () => {
    // Mifflin-St Jeor 1990, DOI 10.1093/ajcn/51.2.241:
    //   RMR = 10*mass + 6.25*height - 5*age + 5
    //   10 x 80 = 800; 6.25 x 180 = 1125; -5 x 30 = -150
    //   800 + 1125 = 1925; 1925 - 150 = 1775; 1775 + 5 = 1780 kcal/day
    const t = computeTargets(base);
    expect(t.rmrKcal).toBe(1780); // kcal/day
    expect(t.basis.rmr).toBe('mifflin-st-jeor');
  });

  it('uses the female constant -161', () => {
    // 800 + 1125 - 150 = 1775; 1775 - 161 = 1614 kcal/day
    expect(computeTargets({ ...base, sex: 'female' }).rmrKcal).toBe(1614); // kcal/day
  });

  it('switches to Cunningham when body fat is known', () => {
    // Cunningham 1991, DOI 10.1093/ajcn/54.6.963: RMR = 370 + 21.6*FFM
    //   FFM = 95.3 x (1 - 0.27) = 95.3 x 0.73 = 69.569 kg
    //   21.6 x 69.569 = 69.569 x 20 + 69.569 x 1.6 = 1391.38 + 111.3104 = 1502.6904
    //   370 + 1502.6904 = 1872.6904 -> 1873 kcal/day
    const t = computeTargets({ ...base, massKg: 95.3, bodyFatPct: 27 });
    expect(t.rmrKcal).toBe(1873); // kcal/day
    expect(t.basis.rmr).toBe('cunningham');
  });
});

/**
 * DEVIATION from the P2 plan's draft, forced by master plan section 10 amendment 12
 * ("activity-levels-three-bands", adopted): `ActivityLevel` has the three verified
 * FAO/WHO/UNU 2004 bands, not the plan draft's five members. The two draft midpoints
 * (light 1.55, active 1.85) were invented placements and do not ship.
 */
const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'moderate', 'vigorous'];

describe('activity factors', () => {
  it('exposes exactly the three verified FAO 2004 bands', () => {
    expect(Object.keys(ACTIVITY_FACTOR).sort()).toEqual(['moderate', 'sedentary', 'vigorous']);
    expect(Object.keys(ACTIVITY_BAND).sort()).toEqual(['moderate', 'sedentary', 'vigorous']);
    // FAO/WHO/UNU 2004, Table 5.3 p.38 (PAL = TEE / BMR, dimensionless).
    expect(ACTIVITY_BAND.sedentary).toEqual([1.4, 1.69]);
    expect(ACTIVITY_BAND.moderate).toEqual([1.7, 1.99]);
    expect(ACTIVITY_BAND.vigorous).toEqual([2.0, 2.4]);
  });

  it('places every factor inside its FAO 2004 band', () => {
    for (const level of ACTIVITY_LEVELS) {
      const [lo, hi] = ACTIVITY_BAND[level];
      expect(ACTIVITY_FACTOR[level]).toBeGreaterThanOrEqual(lo);
      expect(ACTIVITY_FACTOR[level]).toBeLessThanOrEqual(hi);
    }
  });

  it('uses only printed band floors, never an interpolated value', () => {
    expect(ACTIVITY_FACTOR.sedentary).toBe(1.4);
    expect(ACTIVITY_FACTOR.moderate).toBe(1.7);
    expect(ACTIVITY_FACTOR.vigorous).toBe(2.0);
    for (const level of ACTIVITY_LEVELS) {
      expect(ACTIVITY_FACTOR[level]).toBe(ACTIVITY_BAND[level][0]);
    }
  });

  it('never uses the unsourced gym ladder', () => {
    // Content review, Deliverable 2 section 2: 1.2 / 1.375 / 1.55 / 1.725 / 1.9 has no
    // primary source; 1.375 and 1.725 are arithmetic interpolations and 1.2 is Black's
    // NON-AMBULANT limit. All five are banned, including 1.55, which the plan draft used
    // for the now-deleted `light` level.
    const banned = [1.2, 1.375, 1.55, 1.725, 1.9];
    for (const v of Object.values(ACTIVITY_FACTOR)) expect(banned).not.toContain(v);
  });

  it('multiplies RMR by the factor to get TDEE', () => {
    // 1780 x 1.70 = 3026 kcal/day
    const t = computeTargets(base);
    expect(t.basis.activityFactor).toBe(1.7); // PAL, dimensionless
    expect(t.tdeeKcal).toBe(3026); // kcal/day
  });
});

/**
 * Brief G: the nine-stop slider, decision `activity-slider-nine-stops` (supersedes
 * `activity-levels-three-bands`). The containment test below is, in the brief's own words,
 * "the gate that makes this defensible": every stop's PAL must lie inside the band ACTIVITY_BAND
 * already publishes for it. The bound comes from ACTIVITY_BAND itself in every assertion here,
 * never a restated 1.40/1.69/1.70/1.99/2.00/2.40 literal, because restating it is exactly what
 * would let a later edit drift a stop out of its band without this test noticing.
 */
describe('ACTIVITY_STOPS (Brief G: nine stops, three per FAO 2004 band)', () => {
  it('has nine members, three per band, in sedentary/moderate/vigorous order', () => {
    expect(ACTIVITY_STOPS).toHaveLength(9);
    expect(ACTIVITY_STOPS.map((stop) => stop.level)).toEqual([
      'sedentary',
      'sedentary',
      'sedentary',
      'moderate',
      'moderate',
      'moderate',
      'vigorous',
      'vigorous',
      'vigorous',
    ]);
  });

  it("places every stop's PAL inside its own ACTIVITY_BAND, read from ACTIVITY_BAND and never restated", () => {
    for (const stop of ACTIVITY_STOPS) {
      const [lo, hi] = ACTIVITY_BAND[stop.level];
      expect(stop.pal).toBeGreaterThanOrEqual(lo);
      expect(stop.pal).toBeLessThanOrEqual(hi);
    }
  });

  it('is strictly increasing, so no stop duplicates or reorders another', () => {
    for (let i = 1; i < ACTIVITY_STOPS.length; i += 1) {
      expect(ACTIVITY_STOPS[i]?.pal).toBeGreaterThan(ACTIVITY_STOPS[i - 1]?.pal ?? Number.NaN);
    }
  });

  it('carries the three band floors ACTIVITY_FACTOR already uses, at the same array positions', () => {
    // Stop 1, 4 and 7 (index 0, 3, 6) are each band's own floor, so the default slider position
    // (Brief G's stop 4, index 3) reproduces ACTIVITY_FACTOR.moderate exactly rather than a
    // second, independently typed 1.7.
    expect(ACTIVITY_STOPS[0]).toEqual({ pal: ACTIVITY_FACTOR.sedentary, level: 'sedentary' });
    expect(ACTIVITY_STOPS[3]).toEqual({ pal: ACTIVITY_FACTOR.moderate, level: 'moderate' });
    expect(ACTIVITY_STOPS[6]).toEqual({ pal: ACTIVITY_FACTOR.vigorous, level: 'vigorous' });
  });
});

describe('computeTargets prefers activityPal over the band floor when present (Brief G)', () => {
  it('falls back to ACTIVITY_FACTOR[activity] when activityPal is null', () => {
    const withNull = computeTargets({ ...base, activityPal: null });
    const withoutField = computeTargets(base);
    expect(withNull).toEqual(withoutField);
    expect(withNull.basis.activityFactor).toBe(ACTIVITY_FACTOR.moderate);
  });

  it('uses activityPal verbatim when it is a number, even above the band floor', () => {
    // base.activity is 'moderate'; stop 5 (index 4) is the moderate mid-point, PAL 1.85.
    const stop = ACTIVITY_STOPS[4];
    if (stop === undefined) throw new Error('unreachable: ACTIVITY_STOPS has nine members');
    const t = computeTargets({ ...base, activityPal: stop.pal });
    expect(t.basis.activityFactor).toBe(stop.pal);
    // 1780 x 1.85 = 3293 kcal/day
    expect(t.tdeeKcal).toBe(1780 * stop.pal);
  });

  it('can now over-prescribe relative to the floor: a stop above ACTIVITY_FACTOR raises TDEE', () => {
    // The reversal nutrition.ts's own ACTIVITY_FACTOR comment records: the floor-only table
    // could not do this; activityPal above the floor can.
    const floorTdee = computeTargets({ ...base, activityPal: null }).tdeeKcal;
    const stop = ACTIVITY_STOPS[5]; // moderate ceiling, PAL 1.99
    if (stop === undefined) throw new Error('unreachable: ACTIVITY_STOPS has nine members');
    const raisedTdee = computeTargets({ ...base, activityPal: stop.pal }).tdeeKcal;
    expect(raisedTdee).toBeGreaterThan(floorTdee);
  });
});

describe('energy target by goal', () => {
  it('cuts 10 % of TDEE for fat loss', () => {
    // Content review Deliverable 1 section 2.2, row "Plateau response": cut 10-15 % of
    // current intake. The BOTTOM of that band is used because the activity factor is
    // already the FAO band floor, so the two conservative choices must not compound.
    // 1780 x 1.70 = 3026; 3026 x 0.90 = 2723.4 -> 2723 kcal/day
    expect(computeTargets({ ...base, goal: 'fat-loss' }).targetKcal).toBe(2723); // kcal/day
  });

  it('adds 500 kcal for muscle gain', () => {
    // 3026 + 500 = 3526 kcal/day (Garthe 2011 counselled 506 +/- 84 kcal/day)
    expect(computeTargets({ ...base, goal: 'muscle-gain' }).targetKcal).toBe(3526); // kcal/day
  });

  it('holds TDEE for maintenance and recomposition', () => {
    expect(computeTargets(base).targetKcal).toBe(3026); // kcal/day
    expect(computeTargets({ ...base, goal: 'recomposition' }).targetKcal).toBe(3026); // kcal/day
  });
});

describe('expected rate of body-mass change', () => {
  it('is signed negative for fat loss at 0.7 %BW/week', () => {
    // Garthe 2011, DOI 10.1123/ijsnem.21.2.97: aim for 0.7 %BW/week.
    // -0.007 x 80 kg = -0.56 kg/week (negative = loss, per the delta convention)
    const t = computeTargets({ ...base, goal: 'fat-loss' });
    expect(t.expectedRateKgPerWeek).toBeCloseTo(-0.56, 10); // kg/week
  });

  it('never exceeds the Helms 0.5-1.0 %BW/week bound at any body mass', () => {
    fc.assert(
      fc.property(
        fc.double({ min: NUTRITION_DOMAIN.massKg.lo, max: NUTRITION_DOMAIN.massKg.hi, noNaN: true }),
        (massKg) => {
          const t = computeTargets({ ...base, massKg, goal: 'fat-loss' });
          const rate = t.expectedRateKgPerWeek; // kg/week, signed
          if (rate === null) return false;
          const fraction = Math.abs(rate) / massKg; // fraction of body mass per week
          return (
            rate < 0 &&
            fraction >= FAT_LOSS_RATE_BOUND.loFraction - 1e-12 &&
            fraction <= FAT_LOSS_RATE_BOUND.hiFraction + 1e-12
          );
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('reports the Helms 2014 bound as 0.5-1.0 %BW/week', () => {
    expect(FAT_LOSS_RATE_BOUND).toEqual({ loFraction: 0.005, hiFraction: 0.01 });
  });

  it('is null for muscle gain because the report gives no study duration', () => {
    const t = computeTargets({ ...base, goal: 'muscle-gain' });
    expect(t.expectedRateKgPerWeek).toBeNull();
    expect(t.basis.rateRule).toMatch(/no weekly rate/i);
  });

  it('is exactly zero for maintenance and recomposition', () => {
    expect(computeTargets(base).expectedRateKgPerWeek).toBe(0); // kg/week
    expect(computeTargets({ ...base, goal: 'recomposition' }).expectedRateKgPerWeek).toBe(0);
  });
});

describe('protein targets keep their denominators separate', () => {
  it('uses body mass for maintenance (1.4-2.0 g/kg)', () => {
    // Jaeger 2017, DOI 10.1186/s12970-017-0177-8: 1.4 x 80 = 112; 2.0 x 80 = 160 g/day
    const t = computeTargets(base);
    expect(t.proteinG).toEqual({ lo: 112, hi: 160 }); // g/day
    expect(t.basis.proteinRule).toMatch(/body mass/);
  });

  it('uses body mass for muscle gain (1.6-2.2 g/kg)', () => {
    // Morton 2018, DOI 10.1136/bjsports-2017-097608: 1.6 x 80 = 128; 2.2 x 80 = 176 g/day
    expect(computeTargets({ ...base, goal: 'muscle-gain' }).proteinG).toEqual({ lo: 128, hi: 176 });
  });

  it("uses FFM for fat loss (2.3-3.1 g/kg FFM) and brackets the report's 190 g example", () => {
    // Helms 2014, DOI 10.1123/ijsnem.2013-0054, verbatim "2.3-3.1 g/kg of FFM".
    // FFM = 69.569 kg.
    //   2.3 x 69.569 = 69.569 x 2 + 69.569 x 0.3 = 139.138 + 20.8707 = 160.0087 -> 160 g/day
    //   3.1 x 69.569 = 69.569 x 3 + 69.569 x 0.1 = 208.707  +  6.9569 = 215.6639 -> 216 g/day
    // Content review Deliverable 1 section 1: 190 g = 2.73 g/kg FFM, inside 2.3-3.1.
    const t = computeTargets({ ...base, massKg: 95.3, bodyFatPct: 27, goal: 'fat-loss' });
    expect(t.proteinG).toEqual({ lo: 160, hi: 216 }); // g/day
    expect(190).toBeGreaterThanOrEqual(t.proteinG.lo);
    expect(190).toBeLessThanOrEqual(t.proteinG.hi);
    expect(t.basis.proteinRule).toMatch(/fat-free mass/);
  });

  it("reproduces the report's own two g/kg conversions for 190 g", () => {
    // Content review, Deliverable 1 section 1, row "Protein mass", verbatim: "190 g =
    // 1.99 g/kg body weight = 2.73 g/kg FFM at the stated 95.3 kg / 27% BF".
    // Longhand: 190 / 95.3    = 1.9937... -> 1.99 g/kg body mass
    //           190 / 69.569  = 2.7311... -> 2.73 g/kg fat-free mass
    expect(190 / 95.3).toBeCloseTo(1.99, 2);
    expect(190 / fatFreeMassKg(95.3, 27)).toBeCloseTo(2.73, 2);
  });

  it('falls back to the body-mass maintenance row when fat loss is requested without a body-fat estimate', () => {
    // The FFM range must never be applied to body mass: at 25 % body fat that is a ~33 %
    // overfeed (content review, Deliverable 2 section 4, "Unit trap - do not propagate").
    // With no FFM the engine drops to the lower, body-mass row.
    const t = computeTargets({ ...base, goal: 'fat-loss' });
    expect(t.proteinG).toEqual({ lo: 112, hi: 160 }); // g/day
    expect(t.basis.proteinRule).toMatch(/no body-fat estimate/i);
  });

  it('never applies the FFM range to body mass', () => {
    // Guard on the unit trap itself: at 25 % body fat the FFM row applied to body mass
    // would give 2.3 x 80 = 184 g/day; the correct FFM row gives 2.3 x 60 = 138 g/day.
    const t = computeTargets({ ...base, bodyFatPct: 25, goal: 'fat-loss' });
    expect(t.proteinG).toEqual({ lo: 138, hi: 186 }); // g/day: 2.3 x 60 = 138; 3.1 x 60 = 186
  });
});

describe('fluid and creatine', () => {
  it('uses the IOM beverage share, not the total-water AI', () => {
    // IOM 2005, DOI 10.17226/10925: total-water AI 3.7 L men / 2.7 L women, of which
    // BEVERAGES supply 3.0 L and 2.2 L (~81 %). The app cannot measure water in food.
    expect(dailyBeverageTargetML('male')).toEqual({ kind: 'stated', ml: 3000 }); // mL/day
    expect(dailyBeverageTargetML('female')).toEqual({ kind: 'stated', ml: 2200 }); // mL/day
    expect(computeTargets(base).fluidML).toEqual({ kind: 'stated', ml: 3000 }); // mL/day
    expect(computeTargets({ ...base, sex: 'female' }).fluidML).toEqual({
      kind: 'stated',
      ml: 2200,
    }); // mL/day
  });

  /*
   * Round 2 decision A1, third consequence, ruled by the owner: with a non-disclosed sex the
   * screen shows 2200 to 3000 mL and states that the reference intake is published per sex. It
   * does not average the two and it does not pick one.
   *
   * The union is what enforces that. A consumer cannot read a millilitre figure off the result
   * without handling the range case first, so "print a single number" is not something a view can
   * do by accident.
   */
  it('returns the published RANGE under nd, and never an average or one endpoint', () => {
    expect(dailyBeverageTargetML('nd')).toEqual({ kind: 'range', loML: 2200, hiML: 3000 });
    expect(BEVERAGE_TARGET_RANGE_ML).toEqual({ loML: 2200, hiML: 3000 });
    // The mean of the two published figures, 2600 mL/day, is a number nobody published. It must
    // appear nowhere in the result.
    expect(JSON.stringify(dailyBeverageTargetML('nd'))).not.toContain('2600');
    // `nd` needs a body-fat percentage to compute at all (see the domain suite below), so the
    // targets are read from an input that has one.
    const nd = computeTargets({ ...base, sex: 'nd', bodyFatPct: 20 });
    expect(nd.fluidML).toEqual({ kind: 'range', loML: 2200, hiML: 3000 });
    // And the RMR came from the equation with no sex term, not from a defaulted offset.
    expect(nd.basis.rmr).toBe('cunningham');
  });

  /*
   * The seed is the ONE place the range becomes a single figure, because
   * `Profile.hydration.dailyTargetML` is a stored preference and a denominator. It takes the low
   * end, which is a published figure rather than an average; `seedBeverageTargetML`'s own comment
   * states why the low end and not the high one.
   */
  it('seeds a stored hydration preference from a published figure, never from an average', () => {
    expect(seedBeverageTargetML('male')).toBe(3000); // mL/day
    expect(seedBeverageTargetML('female')).toBe(2200); // mL/day
    expect(seedBeverageTargetML('nd')).toBe(2200); // mL/day, the low END, not the mean
    expect(seedBeverageTargetML('nd')).not.toBe(2600); // the mean of the two: unpublished
  });

  it('never displays the total-water AI or the legacy flat 3.5 L', () => {
    const banned = [3700, 2700, 3500]; // mL/day
    expect(banned).not.toContain(statedBeverageTargetML('male'));
    expect(banned).not.toContain(statedBeverageTargetML('female'));
  });

  it('returns null creatine when the toggle is off', () => {
    expect(computeTargets(base).creatineG).toBeNull();
  });

  it('doses creatine by body mass: max(3 g, 0.1 g/kg), capped at 10 g/day', () => {
    // Content review Deliverable 2 section 11 engine rule, verbatim: "maintenance
    // max(3 g, 0.1 g/kg), capped near 10 g/d". Kreider 2017, DOI 10.1186/s12970-017-0173-z;
    // Antonio 2021, DOI 10.1186/s12970-021-00412-w. Dose by body mass, not sex.
    // The 3 g floor is INERT inside the adult domain: NUTRITION_DOMAIN.massKg.lo = 30 kg is
    // exactly where 0.1 g/kg reaches 3 g, so max(3, 0.1*m) = 0.1*m for every admissible mass.
    // It is kept as a guard on the constant, not as a live branch. 0.1 x 30 = 3 g/day.
    expect(computeTargets({ ...base, creatine: true, massKg: 30 }).creatineG).toBe(3); // g/day
    expect(computeTargets({ ...base, creatine: true, massKg: 80 }).creatineG).toBe(8); // 0.1 x 80 = 8 g/day
    expect(computeTargets({ ...base, creatine: true, massKg: 95.3 }).creatineG).toBe(9.5); // 0.1 x 95.3 = 9.53 -> 9.5 g/day
    expect(computeTargets({ ...base, creatine: true, massKg: 140 }).creatineG).toBe(10); // 0.1 x 140 = 14 -> cap 10 g/day
  });

  it('doses creatine identically for both sexes at the same body mass', () => {
    const m = computeTargets({ ...base, creatine: true, sex: 'male', massKg: 70 }).creatineG;
    const f = computeTargets({ ...base, creatine: true, sex: 'female', massKg: 70 }).creatineG;
    expect(m).toBe(f); // g/day; neither source gives a sex-specific dose
  });

  it('creatineDoseG delegates to the verified engine creatine logic', () => {
    expect(creatineDoseG(70)).toBe(7);
    expect(creatineDoseG(30)).toBe(3);
    expect(creatineDoseG(140)).toBe(10);
    expect(() => creatineDoseG(0)).toThrow(RangeError);
  });
});

describe('caffeineDoseMg', () => {
  it('doses caffeine in 0.9-2.0 mg/kg range for a 70 kg adult without hitting the EFSA cap', () => {
    const dose = caffeineDoseMg(70);
    expect(dose.lo).toBe(63); // 70 x 0.9 = 63 mg
    expect(dose.hi).toBe(140); // 70 x 2.0 = 140 mg
    expect(dose.capped).toBe(false);
  });

  it('caps the upper dose at 200 mg for a 120 kg adult per the EFSA single-dose guidance', () => {
    const dose = caffeineDoseMg(120);
    expect(dose.lo).toBe(108); // 120 x 0.9 = 108 mg
    expect(dose.hi).toBe(200); // 120 x 2.0 = 240 mg -> capped at 200 mg
    expect(dose.capped).toBe(true);
  });

  it('rejects a non-positive body mass', () => {
    expect(() => caffeineDoseMg(0)).toThrow(RangeError);
    expect(() => caffeineDoseMg(-10)).toThrow(RangeError);
  });
});

describe('goal direction is monotone in energy', () => {
  it('fat loss is always below TDEE and muscle gain always above', () => {
    const sexes: Sex[] = ['male', 'female'];
    fc.assert(
      fc.property(
        // Sampled inside the adult domain the engine validates (NUTRITION_DOMAIN);
        // outside it computeTargets throws by design, so the property does not apply.
        fc.double({ min: NUTRITION_DOMAIN.massKg.lo, max: NUTRITION_DOMAIN.massKg.hi, noNaN: true }), // kg
        fc.double({
          min: NUTRITION_DOMAIN.heightCm.lo,
          max: NUTRITION_DOMAIN.heightCm.hi,
          noNaN: true,
        }), // cm
        fc.integer({ min: NUTRITION_DOMAIN.ageYears.lo, max: NUTRITION_DOMAIN.ageYears.hi }), // years
        fc.constantFrom(...sexes),
        fc.constantFrom(...ACTIVITY_LEVELS),
        fc.option(
          fc.double({
            min: NUTRITION_DOMAIN.bodyFatPct.lo,
            max: NUTRITION_DOMAIN.bodyFatPct.hi,
            noNaN: true,
          }),
          { nil: null },
        ), // percent
        (massKg, heightCm, ageYears, sex, activity, bodyFatPct) => {
          const shared = { ...base, massKg, heightCm, ageYears, sex, activity, bodyFatPct };
          const lossGoal: GoalKind = 'fat-loss';
          const gainGoal: GoalKind = 'muscle-gain';
          const loss = computeTargets({ ...shared, goal: lossGoal });
          const gain = computeTargets({ ...shared, goal: gainGoal });
          return loss.targetKcal < loss.tdeeKcal && gain.targetKcal > gain.tdeeKcal;
        },
      ),
      { numRuns: 2000 },
    );
  });
});

describe('input validation', () => {
  it('throws on non-positive mass, height or age', () => {
    expect(() => computeTargets({ ...base, massKg: 0 })).toThrow(RangeError);
    expect(() => computeTargets({ ...base, heightCm: 0 })).toThrow(RangeError);
    expect(() => computeTargets({ ...base, ageYears: 0 })).toThrow(RangeError);
  });

  it('throws on a non-finite input', () => {
    expect(() => computeTargets({ ...base, massKg: Number.NaN })).toThrow(RangeError);
    expect(() => computeTargets({ ...base, heightCm: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    );
  });
});

/**
 * The adult domain gate. Mifflin-St Jeor was validated on adults aged 19-78 (content review
 * Deliverable 2 section 1, n=498), so the engine refuses input it cannot stand behind rather
 * than extrapolating silently. Every message names the offending field so the wizard can
 * attach the error to the right control (master plan section 6.3, P2 Task 7).
 */
describe('adult domain gate', () => {
  it('publishes the bounds the wizard must reuse', () => {
    expect(NUTRITION_DOMAIN.ageYears).toEqual({ lo: 18, hi: 80 }); // years
    expect(NUTRITION_DOMAIN.heightCm).toEqual({ lo: 120, hi: 230 }); // cm
    expect(NUTRITION_DOMAIN.massKg).toEqual({ lo: 30, hi: 300 }); // kg
    expect(NUTRITION_DOMAIN.bodyFatPct).toEqual({ lo: 3, hi: 60 }); // percent of body mass
    expect(NUTRITION_DOMAIN.sessionsPerWeek).toEqual({ lo: 0, hi: 14 }); // sessions/week
  });

  it('rejects a child and an impossible age, naming ageYears', () => {
    expect(() => computeTargets({ ...base, ageYears: 8 })).toThrow(RangeError);
    expect(() => computeTargets({ ...base, ageYears: 8 })).toThrow(/ageYears/);
    expect(() => computeTargets({ ...base, ageYears: 400 })).toThrow(RangeError);
    expect(() => computeTargets({ ...base, ageYears: 400 })).toThrow(/ageYears/);
  });

  it('rejects stature and body mass outside the domain, naming the field', () => {
    expect(() => computeTargets({ ...base, heightCm: 119.9 })).toThrow(/heightCm/);
    expect(() => computeTargets({ ...base, heightCm: 230.1 })).toThrow(/heightCm/);
    expect(() => computeTargets({ ...base, massKg: 29.9 })).toThrow(/massKg/);
    expect(() => computeTargets({ ...base, massKg: 300.1 })).toThrow(/massKg/);
  });

  it('rejects a training frequency that is not an integer in [0, 14]', () => {
    expect(() => computeTargets({ ...base, sessionsPerWeek: Number.NaN })).toThrow(RangeError);
    expect(() => computeTargets({ ...base, sessionsPerWeek: Number.NaN })).toThrow(
      /sessionsPerWeek/,
    );
    expect(() => computeTargets({ ...base, sessionsPerWeek: -4 })).toThrow(RangeError);
    expect(() => computeTargets({ ...base, sessionsPerWeek: -4 })).toThrow(/sessionsPerWeek/);
    expect(() => computeTargets({ ...base, sessionsPerWeek: 15 })).toThrow(/sessionsPerWeek/);
    expect(() => computeTargets({ ...base, sessionsPerWeek: 3.5 })).toThrow(/sessionsPerWeek/);
  });

  it('names bodyFatPct, not the internal fat-free-mass helper', () => {
    // The bound is the engine's own domain, not fatFreeMassKg's wider [0, 100): a caller
    // fixing the error must be told which INPUT field to change.
    expect(() => computeTargets({ ...base, bodyFatPct: 2 })).toThrow(/bodyFatPct/);
    expect(() => computeTargets({ ...base, bodyFatPct: 2 })).not.toThrow(/fatFreeMassKg/);
    expect(() => computeTargets({ ...base, bodyFatPct: 61 })).toThrow(/bodyFatPct/);
    expect(() => computeTargets({ ...base, bodyFatPct: Number.NaN })).toThrow(/bodyFatPct/);
  });

  it('accepts every boundary value', () => {
    // Inclusive bounds. 18 y and 79-80 y are edge extrapolations of Mifflin's 19-78 y
    // sample, documented as such in nutrition.ts; they are admitted, not silently ignored.
    for (const ageYears of [18, 80]) {
      expect(() => computeTargets({ ...base, ageYears })).not.toThrow();
    }
    for (const heightCm of [120, 230]) {
      expect(() => computeTargets({ ...base, heightCm })).not.toThrow();
    }
    for (const massKg of [30, 300]) {
      expect(() => computeTargets({ ...base, massKg })).not.toThrow();
    }
    for (const bodyFatPct of [3, 60]) {
      expect(() => computeTargets({ ...base, bodyFatPct })).not.toThrow();
    }
    for (const sessionsPerWeek of [0, 14]) {
      expect(() => computeTargets({ ...base, sessionsPerWeek })).not.toThrow();
    }
  });
});

describe('isInDomain', () => {
  /**
   * The predicate exists so a caller that cannot handle an exception can ask first
   * (master plan section 6.3). It is only useful if it answers exactly the question
   * computeTargets answers by throwing, so both directions are asserted: every boundary
   * value is accepted, every value one step outside is refused, and over generated inputs
   * the predicate agrees with the throw.
   */
  it('accepts every inclusive boundary value', () => {
    for (const ageYears of [18, 80]) expect(isInDomain({ ...base, ageYears })).toBe(true); // years
    for (const heightCm of [120, 230]) expect(isInDomain({ ...base, heightCm })).toBe(true); // cm
    for (const massKg of [30, 300]) expect(isInDomain({ ...base, massKg })).toBe(true); // kg
    for (const bodyFatPct of [3, 60]) expect(isInDomain({ ...base, bodyFatPct })).toBe(true); // %
    for (const sessionsPerWeek of [0, 14]) {
      expect(isInDomain({ ...base, sessionsPerWeek })).toBe(true); // sessions/week
    }
  });

  it('refuses the value one step outside each boundary', () => {
    for (const ageYears of [17, 81]) expect(isInDomain({ ...base, ageYears })).toBe(false); // years
    for (const heightCm of [119.9, 230.1]) expect(isInDomain({ ...base, heightCm })).toBe(false); // cm
    for (const massKg of [29.9, 300.1]) expect(isInDomain({ ...base, massKg })).toBe(false); // kg
    for (const bodyFatPct of [2.9, 60.1]) expect(isInDomain({ ...base, bodyFatPct })).toBe(false); // %
    for (const sessionsPerWeek of [-1, 15]) {
      expect(isInDomain({ ...base, sessionsPerWeek })).toBe(false); // sessions/week
    }
  });

  it('treats an unmeasured body fat as in-domain and a fractional session count as out', () => {
    // null is "not measured", which selects Mifflin-St Jeor; it is not a bound violation.
    expect(isInDomain({ ...base, bodyFatPct: null })).toBe(true);
    // sessionsPerWeek changes no number (NOTE-FREQ) but reaches a basis string the UI shows,
    // so a fraction or a NaN is refused here exactly as computeTargets refuses it.
    expect(isInDomain({ ...base, sessionsPerWeek: 3.5 })).toBe(false);
    expect(isInDomain({ ...base, sessionsPerWeek: Number.NaN })).toBe(false);
    expect(isInDomain({ ...base, massKg: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isInDomain({ ...base, heightCm: Number.NaN })).toBe(false);
  });

  it('never throws, whatever it is handed', () => {
    expect(() => isInDomain({ ...base, ageYears: Number.NaN, massKg: -1, heightCm: 0 })).not.toThrow();
    expect(isInDomain({ ...base, ageYears: Number.NaN, massKg: -1, heightCm: 0 })).toBe(false);
  });

  it('answers exactly the question computeTargets answers by throwing', () => {
    // Each range straddles its bound, so roughly a quarter of the generated inputs are
    // in-domain and both verdicts get exercised. The enums are always valid members: an
    // unknown one is a type error, not a domain violation, and is not this gate's job.
    // The oddballs are mixed in explicitly because a ranged fc.double never produces them
    // and they are exactly what a corrupted stored document would carry.
    const oddball = fc.constantFrom(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );
    const straddling = (min: number, max: number): fc.Arbitrary<number> =>
      fc.oneof(
        { weight: 9, arbitrary: fc.double({ min, max, noNaN: true }) },
        { weight: 1, arbitrary: oddball },
      );
    fc.assert(
      fc.property(
        fc.record({
          sex: fc.constantFrom('male' as const, 'female' as const),
          ageYears: straddling(10, 90), // years, domain 18-80
          heightCm: straddling(100, 250), // cm, domain 120-230
          massKg: straddling(20, 320), // kg, domain 30-300
          bodyFatPct: fc.option(straddling(0, 70), { nil: null }), // %, domain 3-60 or null
          activity: fc.constantFrom('sedentary' as const, 'moderate' as const, 'vigorous' as const),
          goal: fc.constantFrom(
            'fat-loss' as const,
            'muscle-gain' as const,
            'recomposition' as const,
            'maintenance' as const,
          ),
          // Mostly integers, so the integer requirement is not the only thing under test.
          sessionsPerWeek: fc.oneof(
            { weight: 7, arbitrary: fc.integer({ min: -2, max: 16 }) },
            { weight: 2, arbitrary: fc.double({ min: -2, max: 16, noNaN: true }) },
            { weight: 1, arbitrary: oddball },
          ), // sessions/week, domain integer 0-14
          creatine: fc.boolean(),
        }),
        (input: NutritionInput) => {
          let threw = false;
          try {
            computeTargets(input);
          } catch {
            threw = true;
          }
          return isInDomain(input) === !threw;
        },
      ),
      { numRuns: 5000 },
    );
  });
});

describe('the basis strings disclose the conservative bias and the independence of the two estimates', () => {
  it('states that the band floor and the band-minimum cut both lean conservative', () => {
    const rule = computeTargets({ ...base, goal: 'fat-loss' }).basis.deficitRule;
    expect(rule).toMatch(/10 % cut from TDEE/);
    expect(rule).toMatch(/band floor/);
    expect(rule).toMatch(/bottom of that 10-15 % band/);
    expect(rule).toMatch(/lean conservative/);
    expect(rule).toMatch(/HEURISTIC/);
    // Compounding bias: never the top of the band while the PAL is already the floor.
    expect(rule).not.toMatch(/15 % cut/);
  });

  it("says the review's row is a plateau response and that the target is re-derived", () => {
    const rule = computeTargets({ ...base, goal: 'fat-loss' }).basis.deficitRule;
    expect(rule).toMatch(/plateau response/i);
    expect(rule).toMatch(/weight-stable/);
    expect(rule).toMatch(/re-derived at every body-mass re-measure/);
  });

  it('uses no em-dash or en-dash anywhere in the basis strings', () => {
    const goals: GoalKind[] = ['fat-loss', 'muscle-gain', 'maintenance', 'recomposition'];
    for (const goal of goals) {
      const b = computeTargets({ ...base, goal }).basis;
      expect(b.deficitRule).not.toMatch(/[\u2013\u2014]/);
      expect(b.rateRule).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it('states on every goal that the two estimates are never converted into each other', () => {
    const goals: GoalKind[] = ['fat-loss', 'muscle-gain', 'maintenance', 'recomposition'];
    for (const goal of goals) {
      expect(computeTargets({ ...base, goal }).basis.rateRule).toMatch(
        /separate estimates and are not converted into each other/,
      );
    }
  });

  it('keeps the muscle-gain null rate and its stated reason', () => {
    const t = computeTargets({ ...base, goal: 'muscle-gain' });
    expect(t.expectedRateKgPerWeek).toBeNull();
    expect(t.basis.rateRule).toMatch(/no weekly rate/i);
    expect(t.basis.rateRule).toMatch(/study duration/);
  });
});

/**
 * Brief I Part 4: the target-date feasibility bands.
 *
 * EVERY THRESHOLD IN THIS SUITE IS READ FROM THE MODULE, never restated as 0.005 or 0.01. That
 * is the whole point of the suite: a band written as a literal here would keep passing after
 * someone edited `FAT_LOSS_RATE_BOUND` and silently stop testing the cited number. The one
 * assertion that DOES quote a figure is the existing `FAT_LOSS_RATE_BOUND` identity test above,
 * which is where the constant is pinned to Helms 2014 on purpose.
 *
 * The rates are constructed from the bound rather than from a chosen date: for a 100 kg body
 * mass over 10 weeks, a required fraction f needs a loss of f * 100 * 10 kg, so a target mass of
 * 100 * (1 - 10f) puts the required rate exactly on f.
 */
describe('targetDateFeasibility', () => {
  const CURRENT_KG = 100; // [kg]
  const WEEKS = 10; // [week]

  /** The target body mass whose required rate is `fraction` of body mass per week. */
  function targetForFraction(fraction: number): number {
    return CURRENT_KG * (1 - fraction * WEEKS); // [kg]
  }

  function bandAt(fraction: number): string {
    const result = targetDateFeasibility({
      goal: 'fat-loss',
      currentMassKg: CURRENT_KG,
      targetMassKg: targetForFraction(fraction),
      weeks: WEEKS,
    });
    return result.assessable ? result.band : `gap:${result.gap}`;
  }

  it('puts the band edges exactly on FAT_LOSS_RATE_BOUND, read from the module', () => {
    const { loFraction, hiFraction } = FAT_LOSS_RATE_BOUND;
    // A rate a thousandth of the upper bound: far inside double precision, far outside the
    // rounding error of the target-mass round trip above.
    const step = hiFraction / 1000;

    // The prescribed window is REALISTIC at both of its own endpoints, inclusive.
    expect(bandAt(loFraction)).toBe('realistic');
    expect(bandAt(hiFraction)).toBe('realistic');
    expect(bandAt((loFraction + hiFraction) / 2)).toBe('realistic');

    // Below the lower bound is still realistic, and is flagged as slower than prescribed rather
    // than coloured as a warning: a date further out than the prescription needs is not a risk.
    const slow = targetDateFeasibility({
      goal: 'fat-loss',
      currentMassKg: CURRENT_KG,
      targetMassKg: targetForFraction(loFraction - step),
      weeks: WEEKS,
    });
    expect(slow.assessable).toBe(true);
    expect(slow.assessable && slow.band).toBe('realistic');
    expect(slow.assessable && slow.belowBound).toBe(true);
    expect(slow.assessable && slow.requiredFraction).toBeCloseTo(loFraction - step, 12);

    // AT the lower bound it is not flagged: the endpoint is inside the window, not below it.
    const atBound = targetDateFeasibility({
      goal: 'fat-loss',
      currentMassKg: CURRENT_KG,
      targetMassKg: targetForFraction(loFraction),
      weeks: WEEKS,
    });
    expect(atBound.assessable && atBound.belowBound).toBe(false);

    // The first rate ABOVE the upper bound is improbable, and the last rate at or below
    // FEASIBILITY_IMPROBABLE_MULTIPLE times it still is.
    expect(bandAt(hiFraction + step)).toBe('improbable');
    expect(bandAt(hiFraction * FEASIBILITY_IMPROBABLE_MULTIPLE)).toBe('improbable');
    expect(bandAt(hiFraction * FEASIBILITY_IMPROBABLE_MULTIPLE + step)).toBe('highly-improbable');
  });

  it('reports the required rate as a fraction of CURRENT body mass per week', () => {
    // 5 kg off 100 kg over 10 weeks is 0.5 %BW/week, which is the lower bound exactly.
    const result = targetDateFeasibility({
      goal: 'fat-loss',
      currentMassKg: 100,
      targetMassKg: 95,
      weeks: 10,
    });
    expect(result.assessable && result.requiredFraction).toBeCloseTo(
      FAT_LOSS_RATE_BOUND.loFraction,
      12,
    );
  });

  it('never colours a muscle-gain target date, at any horizon or target', () => {
    /*
     * `energyPlan` returns rateKgPerWeek: null for muscle gain because Garthe 2011 gives a total
     * gain and the content review does not state the study duration. There is therefore no
     * weekly rate to test a date against, and borrowing the fat-loss bound would be inventing a
     * coefficient. Asserted over the whole input space, not at one date: no combination of mass,
     * target and horizon may produce a band.
     */
    fc.assert(
      fc.property(
        fc.double({ min: 40, max: 200, noNaN: true }),
        fc.double({ min: 40, max: 200, noNaN: true }),
        fc.double({ min: -50, max: 500, noNaN: true }),
        (currentMassKg, targetMassKg, weeks) => {
          expect(
            targetDateFeasibility({ goal: 'muscle-gain', currentMassKg, targetMassKg, weeks }),
          ).toEqual({ assessable: false, gap: 'no-weekly-rate' });
        },
      ),
    );
    // And with no target at all, which is the state a fresh wizard opens the calendar in.
    expect(
      targetDateFeasibility({
        goal: 'muscle-gain',
        currentMassKg: 80,
        targetMassKg: null,
        weeks: 12,
      }),
    ).toEqual({ assessable: false, gap: 'no-weekly-rate' });
  });

  it('colours neither maintenance nor recomposition, because both hold body mass', () => {
    for (const goal of ['maintenance', 'recomposition'] as const) {
      expect(
        targetDateFeasibility({ goal, currentMassKg: 100, targetMassKg: 90, weeks: 10 }),
      ).toEqual({ assessable: false, gap: 'mass-held' });
    }
  });

  it('names the missing input rather than banding a date it cannot assess', () => {
    const base = { goal: 'fat-loss', currentMassKg: 100, weeks: 10 } as const;
    expect(targetDateFeasibility({ ...base, targetMassKg: null })).toEqual({
      assessable: false,
      gap: 'no-target',
    });
    // Today, and a date already past: neither gives a finite required rate.
    expect(targetDateFeasibility({ ...base, targetMassKg: 90, weeks: 0 })).toEqual({
      assessable: false,
      gap: 'no-horizon',
    });
    expect(targetDateFeasibility({ ...base, targetMassKg: 90, weeks: -1 })).toEqual({
      assessable: false,
      gap: 'no-horizon',
    });
    // A target at or above current mass under a fat-loss goal: the bound is stated for LOSS.
    expect(targetDateFeasibility({ ...base, targetMassKg: 100 })).toEqual({
      assessable: false,
      gap: 'not-a-loss',
    });
    expect(targetDateFeasibility({ ...base, targetMassKg: 110 })).toEqual({
      assessable: false,
      gap: 'not-a-loss',
    });
  });

  it('states the improbable edge as a multiple of the cited bound, not as its own rate', () => {
    /*
     * The guard against the defect this model exists to avoid: had the edge been hard-coded as
     * 0.015, moving the cited bound would leave the band behind. The assertion is that the edge
     * MOVES with the bound, and that it sits outside the prescribed window rather than inside it.
     */
    const edge = FAT_LOSS_RATE_BOUND.hiFraction * FEASIBILITY_IMPROBABLE_MULTIPLE;
    expect(bandAt(edge)).toBe('improbable');
    expect(bandAt(edge * 1.001)).toBe('highly-improbable');
    expect(edge).toBeGreaterThan(FAT_LOSS_RATE_BOUND.hiFraction);
  });
});
