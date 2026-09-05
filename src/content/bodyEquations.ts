// src/content/bodyEquations.ts
//
// What the body step's numbers are used for, and the published methods behind each one.
//
// Round 1 claim C1.07.5: "place it on the BOTTOM of the BODY box as 'The numbers provided in
// this page are used in the calculation of..... based on the following methods:' and then have a
// citation list for the equations (do not be expansive - just transparent)."
//
// WHY THIS IS NOT A COPY TABLE. Copy contract R10: reference text a user chooses to open is
// exempt from the length rules R1 to R4 and from R9, and lives in its own module rather than in
// a copy table, as src/content/formCues.ts and src/content/specimenCards.ts already do. R10's
// module list was closed at those two and the reminders runbook; this file is named there now.
// It is NOT exempt from R5 (no em dash, no connector en dash), R6 (no emoji) or R11 (name the
// quantity), and bodyEquations.test.ts asserts all three.
//
// EVERY DOI HERE IS COPIED FROM THE ENGINE THAT USES IT, never retyped from memory:
// src/domain/nutrition.ts and src/domain/bodyfat.ts carry them with the content peer review's
// verification. FAO/WHO/UNU 2004 has no DOI, and the row says so rather than omitting itself.

/** One method, and the quantity on this screen that feeds it. */
export interface BodyEquation {
  /** The footnote marker rendered beside the field, 1-based and stable. */
  marker: number;
  /** What it computes, named as the quantity rather than colloquially (R11). */
  computes: string;
  /** The citation, with its DOI, or the words "no DOI" where none exists. */
  source: string;
}

/** The lead-in above the list. */
export const BODY_EQUATIONS_LEAD =
  'The numbers on this page are used to estimate your resting metabolic rate, your body-fat percentage and your daily beverage target, by the following published methods.';

/**
 * The methods, in the order their markers appear on the screen.
 *
 * Marker 1 sits on the sex field and marker 2 on stature, because those are the two fields whose
 * purpose is least obvious. Body mass and age carry no marker: every row below reads them, so a
 * marker on each would point at the whole list.
 */
export const BODY_EQUATIONS: readonly BodyEquation[] = [
  {
    marker: 1,
    computes:
      'Resting metabolic rate, when no body-fat percentage is given. Sex enters as a fixed offset of 166 kcal/day.',
    source:
      'Mifflin MD, St Jeor ST et al. (1990), Am J Clin Nutr 51(2):241-247. DOI 10.1093/ajcn/51.2.241',
  },
  {
    marker: 1,
    computes:
      'Body-fat percentage from tape girths. The equations for male and female bodies differ in form, not only in coefficient, and the female one reads a hip girth the male one does not.',
    source:
      'Hodgdon JA, Beckett MB (1984), NHRC 84-11 and 84-29. DOI 10.21236/ada143890 and DOI 10.21236/ada146456',
  },
  {
    marker: 1,
    computes: 'Daily beverage target, which the reference intake states separately for each sex.',
    source:
      'Institute of Medicine (2005), Dietary Reference Intakes for Water, Potassium, Sodium, Chloride and Sulfate. DOI 10.17226/10925',
  },
  {
    marker: 2,
    computes:
      'Resting metabolic rate, at 6.25 kcal/day per centimetre, and the tape body-fat estimate, which reads stature directly.',
    source: 'The two sources above.',
  },
  {
    marker: 0,
    computes:
      'Resting metabolic rate, when a body-fat percentage IS given. This equation reads fat-free mass and has no sex term at all.',
    source: 'Cunningham JJ (1991), Am J Clin Nutr 54(6):963-969. DOI 10.1093/ajcn/54.6.963',
  },
  {
    marker: 0,
    computes:
      'Total daily energy, as a multiple of resting metabolic rate chosen by the activity level set on a later step.',
    source:
      'FAO/WHO/UNU (2004), Human Energy Requirements, Table 5.3 p.38. A United Nations technical report, which carries no DOI.',
  },
];
