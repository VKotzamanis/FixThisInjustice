import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ACTIVITY_BAND,
  ACTIVITY_FACTOR,
  FAT_LOSS_RATE_BOUND,
  NUTRITION_DOMAIN,
  computeTargets,
  dailyBeverageTargetML,
  fatFreeMassKg,
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
    expect(dailyBeverageTargetML('male')).toBe(3000); // mL/day
    expect(dailyBeverageTargetML('female')).toBe(2200); // mL/day
    expect(computeTargets(base).fluidML).toBe(3000); // mL/day
    expect(computeTargets({ ...base, sex: 'female' }).fluidML).toBe(2200); // mL/day
  });

  it('never displays the total-water AI or the legacy flat 3.5 L', () => {
    const banned = [3700, 2700, 3500]; // mL/day
    expect(banned).not.toContain(dailyBeverageTargetML('male'));
    expect(banned).not.toContain(dailyBeverageTargetML('female'));
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
