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

/**
 * Standard error of the estimate, percentage points of body fat, against hydrostatic
 * weighing in the source samples: men n=602, R=0.90 (Hodgdon & Beckett 1984, NHRC 84-11,
 * DOI 10.21236/ada143890); women n=214, R=0.85 (NHRC 84-29, DOI 10.21236/ada146456).
 * The UI must show this beside the figure: it is larger than most changes a user will chase.
 */
export const NAVY_SEE_PCT: Record<Sex, number> = { male: 3.52, female: 3.72 };

/**
 * The abdomen site differs by sex — this is not a naming variation. Men are measured at
 * Abdomen II (NHRC 84-11, DOI 10.21236/ada143890) and women at Abdomen I plus hip
 * (NHRC 84-29, DOI 10.21236/ada146456). Measuring a woman at the umbilicus, or a man at
 * minimal width, silently biases the result: the girth term carries the whole prediction.
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

/*
 * Siri's TWO-COMPARTMENT model, printed verbatim in both NHRC reports (content review
 * Deliverable 2 section 5):  %BF = 100 * ((4.95 / D) - 4.50).
 *
 * Neither constant is a tissue density. The model splits body mass into fat at a reference
 * density d_fat = 0.900 g/cm3 and fat-free mass at d_FFM = 1.100 g/cm3, and inverts the
 * volume-additivity identity  1/D = f/d_fat + (1 - f)/d_FFM  for the fat fraction f:
 *
 *   4.95 = d_fat * d_FFM / (d_FFM - d_fat) = (0.900 * 1.100) / 0.200   [g/cm3]
 *   4.50 = d_fat / (d_FFM - d_fat)         =  0.900 / 0.200            [dimensionless]
 *
 * So 4.95 is a COMPOSITE of the two reference densities, not the density of anything: no
 * tissue in the body has a density of 4.95 g/cm3, and reading it as one is a category error.
 * Both constants inherit the model's assumption that those two densities are fixed and equal
 * across people, which is one source of the Potter/Merrill bias documented above.
 */
const SIRI_NUMERATOR = 4.95; // g/cm3, composite d_fat*d_FFM/(d_FFM - d_fat) at 0.900 / 1.100
const SIRI_OFFSET = 4.5; // dimensionless, d_fat/(d_FFM - d_fat) at 0.900 / 1.100

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

/**
 * Percent body fat, or null when the input is outside the equation's domain.
 *
 * LEAN-END BEHAVIOUR — where the (0, 100) % rule actually bites. Siri returns %BF <= 0 the
 * moment the predicted density reaches d_FFM = 1.100 g/cm3, and the male equation reaches
 * that at a modest girth difference. Solving
 *   -0.19077*log10(waist - neck) + 0.15456*log10(height) + 1.0324 = 1.100
 * gives  (waist - neck) = height^0.810190 * 10^((1.0324 - 1.100)/0.19077),  i.e. 29.706 cm
 * for a 180 cm man (28.36 cm at 170 cm; the threshold scales as height^0.810). So a lean
 * 180 cm man with a 40 cm neck and a waist below about 69.7 cm gets null, not a small
 * number — the null is a routine lean-end outcome, not a rare pathological input.
 *
 * The estimate is WITHHELD, never clamped to 0: a clamp would report a fabricated figure.
 * A caller must not render this null as "measurement failed" either. At this end it means
 * the two-compartment model has left its domain, and the UI should say that.
 */
export function estimateBodyFatNavy(input: NavyTapeInput): number | null {
  const density = navyBodyDensity(input); // g/cm3
  if (density === null) return null;
  const pct = 100 * (SIRI_NUMERATOR / density - SIRI_OFFSET); // percentage points
  // Physical bound, not a tuned range: a body-fat percentage outside (0, 100) is impossible,
  // so the estimate is withheld rather than reported.
  if (!Number.isFinite(pct) || pct <= PCT_MIN || pct >= PCT_MAX) return null;
  return pct;
}
