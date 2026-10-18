// src/content/bodyFatChart.ts
//
// The body-fat visual estimator's intro line, shown above the placeholder silhouette grid
// (round 1 claim C1.08.5; decision `visual-bodyfat-tracked-not-engine-feeding` in
// docs/plans/2026-09-04-11-alpha-round-1-corrections.md, section B31).
//
// WHY THIS IS NOT A COPY TABLE. The text carries an evidentiary claim ("studies... find weak
// agreement") at 47 words, well past R3's twelve-word cap for an `advice.` key and past R4's
// two-sentence cap for a `banner.` key. Copy contract R10 puts reference text a user meets on
// opening a control in its own module rather than in a copy table, as src/content/bodyEquations.ts
// and src/content/sexRationale.ts already do. It is NOT exempt from R5, R6 or R11.
//
// This module is not yet named in R10's list in docs/design/2026-09-01-copy-contract.md: that
// edit is out of this brief's listed file scope (the brief names sexRationale.ts for that edit,
// not this file), so it is flagged here and in the task report rather than made silently.
//
// The words are verbatim from docs/plans/subagent-briefs/B-bodyfat-and-sex-modal.md, Part 2b.

export const BODY_FAT_CHART_INTRO =
  'Compare against the pictures and pick the closest. This is a rough orientation, not a ' +
  'measurement: studies of people estimating their own body fat this way find weak agreement ' +
  'with measured values, and most people underestimate. A tape measurement is better, and this ' +
  'app will take one.';

/*
 * The six percentages labelled under each placeholder frame, one row per sex (ROADMAP B4).
 *
 * Source: Gallagher D et al. (2000), Am J Clin Nutr 72(3):694-701, DOI 10.1093/ajcn/72.3.694
 * (Crossref-checked 2026-10-18), Table 4, ages 20-39: BMI 18.5 / 25 / 30 map to 21 / 33 / 39 % fat
 * in women and 8 / 20 / 25 % in men, a sex gap of 12-14 points. Flegal KM et al. (2009), Am J Clin
 * Nutr 89(2):500-508, DOI 10.3945/ajcn.2008.26847 (NHANES DXA): mean 39.9 % women, 28.1 % men.
 * The shared row offered women 10 %, far below the underweight-equivalent 21 %.
 * DESIGN CHOICES, not sourced: six labels, even 5-point steps, the female row offset by +10.
 * Evidence note: docs/private/evidence/research/research-bodyfat-ranges-by-sex.md.
 */
export const BODY_FAT_CHART_PERCENTAGES: Readonly<Record<'male' | 'female', readonly number[]>> = {
  male: [10, 15, 20, 25, 30, 35],
  female: [20, 25, 30, 35, 40, 45],
};
