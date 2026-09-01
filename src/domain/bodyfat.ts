import type { Sex } from './types';

/**
 * US Navy circumference (tape) method — METRIC form.
 *
 * Hodgdon JA, Beckett MB (1984), Prediction of Percent Body Fat for U.S. Navy Men from Body
 * Circumferences and Height, NHRC Report 84-11, DOI 10.21236/ada143890 (verified);
 * ... for U.S. Navy Women ..., NHRC Report 84-29, DOI 10.21236/ada146456 (verified).
 *
 * The equations predict body DENSITY (g/cm3), not %BF; Siri's equation, printed verbatim in
 * both reports, converts it. Girths and stature in cm; logarithms base 10.
 *
 *   Men:   D = -0.19077*log10(abdomen II - neck) + 0.15456*log10(height) + 1.0324
 *   Women: D = -0.35004*log10(abdomen I + hip - neck) + 0.22100*log10(height) + 1.29579
 *   %BF   = 100 * ((4.95 / D) - 4.50)
 *
 * The metric form is implemented and the imperial DoD form is NOT: the two are not
 * algebraically equivalent (the imperial coefficients are a first-order linearisation that
 * returns %BF directly), and mixing them would introduce a silent ~0.3-0.7 %BF disagreement.
 *
 * Accuracy, from the same reports: men n=602, R=0.90, SEE 3.52 %BF; women n=214, R=0.85,
 * SEE 3.72 %BF. Potter 2022 (DOI 10.3389/fphys.2022.868627) measured the bias against DXA:
 * underestimates men by ~2.5 %BF, overestimates women by 1.3-2.3 %BF, and concludes verbatim
 * that the method "is not suitable for applications requiring quantitative body composition
 * assessment". Merrill 2020 (DOI 10.1002/osp4.392) found 17.3 % relative RMSE in general
 * working adults. USE IT TO TRACK CHANGE OVER TIME, NEVER AS AN ABSOLUTE NUMBER — the UI
 * must show the SEE beside the figure.
 *
 * Valid input domain (outside it the functions return null; nothing is ever clamped, so a
 * withheld estimate is visible to the caller rather than silently corrected):
 *   - heightCm, neckCm, waistCm: finite and > 0 cm.
 *   - hipCm: finite and > 0 cm for sex === 'female'; ignored for 'male'.
 *   - the log10 argument (waist - neck, or waist + hip - neck) must be > 0 cm.
 *   - the resulting density must be finite and > 0 g/cm3, and Siri's %BF must fall in
 *     (0, 100) — a percentage outside that interval is physically impossible.
 * These are domain conditions of the equations, not a plausibility filter: girths inside the
 * domain but far outside the NHRC calibration samples (young, fit, active-duty personnel)
 * still return a number, and it still carries the SEE and the Potter/Merrill bias above.
 */

export interface NavyTapeInput {
  sex: Sex;
  heightCm: number; // cm, > 0
  neckCm: number; // cm, > 0, measured below the larynx
  waistCm: number; // cm, > 0; men: Abdomen II (umbilicus); women: Abdomen I (minimal width)
  hipCm: number | null; // cm, > 0; women only — required for the female equation
}

/** Standard error of the estimate, percentage points of body fat (NHRC 84-11 / 84-29). */
export const NAVY_SEE_PCT: Record<Sex, number> = { male: 3.52, female: 3.72 };

/**
 * The abdomen site differs by sex — this is not a naming variation. Measuring a woman at the
 * umbilicus, or a man at minimal width, silently biases the result.
 */
export const NAVY_SITE_LABEL: Record<Sex, { waist: string; hip: string | null }> = {
  male: { waist: 'Abdomen II — horizontal, at the umbilicus', hip: null },
  female: {
    waist: 'Abdomen I — horizontal, at minimal width, midway between xyphoid and umbilicus',
    hip: 'Hip — horizontal, at the greatest posterior protrusion of the buttocks',
  },
};

// Male density coefficients (NHRC 84-11, DOI 10.21236/ada143890).
const M_LOG_GIRTH = -0.19077; // g/cm3 per log10(cm), on (abdomen II - neck)
const M_LOG_HEIGHT = 0.15456; // g/cm3 per log10(cm), on stature
const M_INTERCEPT = 1.0324; // g/cm3

// Female density coefficients (NHRC 84-29, DOI 10.21236/ada146456).
// The hip term is part of the girth sum; Potter 2022 prints this equation without it.
const F_LOG_GIRTH = -0.35004; // g/cm3 per log10(cm), on (abdomen I + hip - neck)
const F_LOG_HEIGHT = 0.221; // g/cm3 per log10(cm), on stature
const F_INTERCEPT = 1.29579; // g/cm3

// Siri (printed verbatim in both NHRC reports): %BF = 100 * ((4.95 / D) - 4.50).
const SIRI_NUMERATOR = 4.95; // g/cm3 (density of the two-compartment reference)
const SIRI_OFFSET = 4.5; // dimensionless

// Physical bounds on a body-fat percentage. Used to withhold an estimate, never to clamp one.
const PCT_MIN = 0; // %BF, exclusive
const PCT_MAX = 100; // %BF, exclusive

function positive(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v) && v > 0);
}

/** Body density in g/cm3, or null when the input is outside the equation's domain. */
export function navyBodyDensity(input: NavyTapeInput): number | null {
  if (!positive(input.heightCm, input.neckCm, input.waistCm)) return null;

  let girthSum: number; // cm
  let logGirthCoeff: number; // g/cm3 per log10(cm)
  let logHeightCoeff: number; // g/cm3 per log10(cm)
  let intercept: number; // g/cm3

  if (input.sex === 'male') {
    girthSum = input.waistCm - input.neckCm; // cm
    logGirthCoeff = M_LOG_GIRTH;
    logHeightCoeff = M_LOG_HEIGHT;
    intercept = M_INTERCEPT;
  } else {
    if (input.hipCm === null || !positive(input.hipCm)) return null;
    girthSum = input.waistCm + input.hipCm - input.neckCm; // cm
    logGirthCoeff = F_LOG_GIRTH;
    logHeightCoeff = F_LOG_HEIGHT;
    intercept = F_INTERCEPT;
  }

  if (!(girthSum > 0)) return null; // log10 is undefined at or below zero

  const density = // g/cm3
    logGirthCoeff * Math.log10(girthSum) + logHeightCoeff * Math.log10(input.heightCm) + intercept;
  return Number.isFinite(density) && density > 0 ? density : null;
}

/** Percent body fat, or null when the input is outside the equation's domain. */
export function estimateBodyFatNavy(input: NavyTapeInput): number | null {
  const density = navyBodyDensity(input); // g/cm3
  if (density === null) return null;
  const pct = 100 * (SIRI_NUMERATOR / density - SIRI_OFFSET); // percentage points
  // Physical bound, not a tuned range: a body-fat percentage outside (0, 100) is impossible,
  // so the estimate is withheld rather than reported.
  if (!Number.isFinite(pct) || pct <= PCT_MIN || pct >= PCT_MAX) return null;
  return pct;
}
