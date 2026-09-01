import { describe, expect, it } from 'vitest';
import {
  estimateBodyFatNavy,
  navyBodyDensity,
  NAVY_SEE_PCT,
  NAVY_SITE_LABEL,
  type NavyTapeInput,
} from './bodyfat';

// All girths and stature in cm (master plan section 3: cm/kg canonical).
const man: NavyTapeInput = { sex: 'male', heightCm: 180, neckCm: 40, waistCm: 95, hipCm: null };
const woman: NavyTapeInput = { sex: 'female', heightCm: 165, neckCm: 32, waistCm: 75, hipCm: 95 };

/*
 * NHRC 84-11 / 84-29 print no worked example, so every expectation below is
 * longhand arithmetic carried out to twelve decimal places in the comment
 * above it. Density is g/cm3; %BF is percentage points.
 */
describe('US Navy circumference method, metric form', () => {
  it('computes the male density and %BF longhand', () => {
    // D = -0.19077*log10(95 - 40) + 0.15456*log10(180) + 1.0324        [g/cm3]
    //   log10(55)  = 1.740362689494  ->  -0.19077 * it = -0.332008990275
    //   log10(180) = 2.255272505103  ->   0.15456 * it =  0.348574918389
    //   D = -0.332008990275 + 0.348574918389 + 1.0324 = 1.048965928114
    // %BF = 100*(4.95/1.048965928114 - 4.50) = 21.893306287 %
    expect(navyBodyDensity(man)).toBeCloseTo(1.0489659281, 9);
    expect(estimateBodyFatNavy(man)).toBeCloseTo(21.8933063, 6);
  });

  it('computes the female density and %BF longhand, hip term included', () => {
    // D = -0.35004*log10(75 + 95 - 32) + 0.22100*log10(165) + 1.29579  [g/cm3]
    //   log10(138) = 2.139879086401  ->  -0.35004 * it = -0.749043275404
    //   log10(165) = 2.217483944214  ->   0.22100 * it =  0.490063951671
    //   D = -0.749043275404 + 0.490063951671 + 1.29579 = 1.036810676267
    // %BF = 100*(4.95/1.036810676267 - 4.50) = 27.425639348 %
    expect(navyBodyDensity(woman)).toBeCloseTo(1.0368106763, 9);
    expect(estimateBodyFatNavy(woman)).toBeCloseTo(27.4256394, 6);
  });

  it('keeps the hip term (guards the Potter 2022 published typo)', () => {
    // Hip 95 -> 100 cm moves the girth sum 138 -> 143 cm, and nothing else.
    //   log10(143) = 2.155336037465  ->  -0.35004 * it = -0.754453826554
    //   D = 1.031400125117  ->  %BF = 100*(4.95/1.031400125117 - 4.50) = 29.930133753 %
    // Dropping the hip term, as Potter 2022 Methods does, would leave the
    // female estimate invariant under hip girth. It must not be.
    const wider = estimateBodyFatNavy({ ...woman, hipCm: 100 });
    expect(wider).toBeCloseTo(29.9301338, 6);
    expect(wider).not.toBeCloseTo(27.4256394, 3);
  });

  it('is monotone increasing in waist girth for both sexes', () => {
    // The girth coefficient is negative and log10 is increasing, so a larger
    // waist lowers D; Siri's 4.95/D is decreasing in D, so %BF rises.
    const a = estimateBodyFatNavy(man) ?? 0;
    const b = estimateBodyFatNavy({ ...man, waistCm: 105 }) ?? 0;
    expect(b).toBeGreaterThan(a);
    const c = estimateBodyFatNavy(woman) ?? 0;
    const d = estimateBodyFatNavy({ ...woman, waistCm: 85 }) ?? 0;
    expect(d).toBeGreaterThan(c);
  });

  it("carries the report's standard error of the estimate", () => {
    expect(NAVY_SEE_PCT.male).toBe(3.52);
    expect(NAVY_SEE_PCT.female).toBe(3.72);
  });

  it('names the sex-specific abdomen site and gives women a hip site', () => {
    // The site differs by sex; it is not a naming variation (NHRC 84-11 / 84-29).
    // Men: Abdomen II at the umbilicus, no hip. Women: Abdomen I at minimal width, plus hip.
    expect(NAVY_SITE_LABEL.male.waist).toMatch(/Abdomen II/);
    expect(NAVY_SITE_LABEL.male.hip).toBeNull();
    expect(NAVY_SITE_LABEL.female.waist).toMatch(/Abdomen I\b/);
    expect(NAVY_SITE_LABEL.female.hip).toMatch(/Hip/);
  });

  it('ignores a hip girth supplied for the male equation', () => {
    // The male equation has no hip term. A caller that carries a hip measurement from a
    // previous female entry, or a shared form, must not perturb the male result.
    const withHip = estimateBodyFatNavy({ ...man, hipCm: 100 });
    expect(withHip).toBe(estimateBodyFatNavy(man));
    expect(withHip).toBeCloseTo(21.8933063, 6); // unchanged from the longhand value above
    expect(navyBodyDensity({ ...man, hipCm: 100 })).toBe(navyBodyDensity(man));
  });
});

describe('validation returns null rather than a wrong number', () => {
  it('rejects non-positive or non-finite measurements', () => {
    expect(estimateBodyFatNavy({ ...man, neckCm: 0 })).toBeNull();
    expect(estimateBodyFatNavy({ ...man, heightCm: Number.NaN })).toBeNull();
    expect(estimateBodyFatNavy({ ...man, waistCm: -1 })).toBeNull();
  });

  it('rejects a female measurement with no hip girth', () => {
    expect(estimateBodyFatNavy({ ...woman, hipCm: null })).toBeNull();
  });

  it('rejects a logarithm argument that is not positive', () => {
    // waist <= neck for a man leaves log10(0) or log10(negative)
    expect(estimateBodyFatNavy({ ...man, waistCm: 40 })).toBeNull();
    expect(estimateBodyFatNavy({ ...man, waistCm: 35 })).toBeNull();
  });

  it('rejects a result outside the physically possible range', () => {
    // A girth combination that drives Siri outside (0, 100) must not be reported.
    // 40.5 - 40 = 0.5 cm gives D = 1.438402410662 and %BF = -105.868 %.
    expect(estimateBodyFatNavy({ ...man, waistCm: 40.5, neckCm: 40 })).toBeNull();
  });

  it('returns null for infinite measurements, never NaN and never a throw', () => {
    // Infinity would carry through log10 to +/-Infinity and, in the female girth sum,
    // to Infinity - Infinity = NaN. The finiteness guard must catch all of them, and the
    // caller must never receive NaN, which compares false against every bound it is tested
    // against downstream and would silently survive a `pct > 0` check written the wrong way.
    const inf = Number.POSITIVE_INFINITY;
    const neg = Number.NEGATIVE_INFINITY;
    for (const bad of [
      { ...man, heightCm: inf },
      { ...man, neckCm: inf },
      { ...man, waistCm: inf },
      { ...man, waistCm: inf, neckCm: inf },
      { ...man, heightCm: neg },
      { ...woman, hipCm: inf },
      { ...woman, waistCm: inf, hipCm: inf },
    ] satisfies NavyTapeInput[]) {
      const pct = estimateBodyFatNavy(bad);
      expect(pct).toBeNull();
      expect(Number.isNaN(pct as unknown as number)).toBe(false);
      expect(navyBodyDensity(bad)).toBeNull();
    }
  });

  it('withholds the estimate at the lean end instead of reporting a non-positive %BF', () => {
    // Siri gives %BF <= 0 once D reaches d_FFM = 1.100 g/cm3. For a 180 cm man that is
    //   waist - neck = 180^(0.15456/0.19077) * 10^((1.0324 - 1.100)/0.19077) = 29.706156 cm
    // so a 40 cm neck puts the cut-off at a waist of 69.706 cm.
    // waist 69.7 -> girth 29.700 -> D = 1.100017170553 -> %BF = -0.007024 % -> withheld
    expect(estimateBodyFatNavy({ ...man, neckCm: 40, waistCm: 69.7 })).toBeNull();
    // waist 71 -> girth 31 -> D = 1.096467848056 -> %BF = +1.449626068 % -> reported
    expect(estimateBodyFatNavy({ ...man, neckCm: 40, waistCm: 71 })).toBeCloseTo(1.4496261, 6);
  });
});
