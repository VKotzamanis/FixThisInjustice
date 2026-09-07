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
//
// ROUND 2, r2.15: TWO FORMAT DEFECTS FIXED, AND NOTHING RE-SOURCED.
//
// 1. THE DOUBLE NUMBERING. The list rendered as an <ol> whose items ALSO carried superscripts of
//    their own, so the second entry read "2. (1) Body-fat percentage...". Two numbering schemes
//    over one list is exactly as confusing as he reported. There is one scheme now: `marker` IS
//    the entry number, it is unique across the list, it is the superscript printed beside the
//    field on screen, and the list itself is unordered so nothing enumerates it a second time.
//
// 2. ELSEVIER ORDER. Author initials after the surname, journal abbreviated, volume(issue):pages,
//    then the year, then the DOI last. Every `source` below is the round-1 string with its
//    elements REORDERED into that shape. Nothing was looked up to do it: no author was added to an
//    "et al.", no article title was supplied, and no DOI, volume, issue, page range or year was
//    retyped from memory. A reformat that needed a new fact would not be a reformat.
//
// The order of the entries changed with the numbering, so that the four fields carrying a
// superscript on screen take the four lowest numbers. The CONTENT of each entry is unchanged.

/** One method, and the quantity on this screen that feeds it. */
export interface BodyEquation {
  /**
   * The entry's number. UNIQUE across the list (r2.15), because it is both the superscript
   * printed beside a field and the entry's own marker in the reference list: one number, one
   * scheme. An entry no field points at still carries one, the way any numbered reference does.
   */
  marker: number;
  /**
   * What it computes, named as the quantity rather than colloquially (R11).
   *
   * r2.15(iii) asks for "a bold small brief sentence that says what this reference is about"
   * above each citation, consistently. This field already was that sentence for most rows; it is
   * that sentence for every row now, and the step renders it in bold above the `source` line.
   */
  computes: string;
  /** The citation in Elsevier order, with its DOI, or the words "no DOI" where none exists. */
  source: string;
}

/** The lead-in above the list. */
export const BODY_EQUATIONS_LEAD =
  'The numbers on this page are used to estimate your resting metabolic rate, your body-fat percentage and your daily beverage target, by the following published methods.';

/**
 * The methods, numbered once.
 *
 * Markers 1 to 4 are the four that appear on screen as a superscript: 1 beside the sex control,
 * 2 beside the body-fat percentage field (the owner's own example, "Percentage^2"), 3 beside the
 * Body Fat Estimate subheading and inside its disclaimer, and 4 beside stature. Markers 5 and 6
 * carry no superscript because no single field on this step owns them: every row above reads this
 * page's numbers too, and a marker on each would point at the whole list.
 */
export const BODY_EQUATIONS: readonly BodyEquation[] = [
  {
    marker: 1,
    computes:
      'Resting metabolic rate, when no body-fat percentage is given. Sex enters as a fixed offset of 166 kcal/day.',
    source: 'Mifflin MD, St Jeor ST, et al. Am J Clin Nutr 51(2):241-247, 1990. DOI 10.1093/ajcn/51.2.241',
  },
  {
    marker: 2,
    computes:
      'Resting metabolic rate, when a body-fat percentage IS given. This equation reads fat-free mass and has no sex term at all.',
    source: 'Cunningham JJ. Am J Clin Nutr 54(6):963-969, 1991. DOI 10.1093/ajcn/54.6.963',
  },
  {
    marker: 3,
    computes:
      'Body-fat percentage from tape girths, by the US Navy circumference method. The equations for male and female bodies differ in form, not only in coefficient, and the female one reads a hip girth the male one does not.',
    source:
      'Hodgdon JA, Beckett MB. NHRC 84-11 and 84-29, 1984. DOI 10.21236/ada143890 and DOI 10.21236/ada146456',
  },
  {
    marker: 4,
    computes:
      'Resting metabolic rate, at 6.25 kcal/day per centimetre, and the tape body-fat estimate, which reads stature directly.',
    source: 'Entries 1 and 3 above. Stature has no separate method of its own.',
  },
  {
    marker: 5,
    computes: 'Daily beverage target, which the reference intake states separately for each sex.',
    source:
      'Institute of Medicine. Dietary Reference Intakes for Water, Potassium, Sodium, Chloride and Sulfate, 2005. DOI 10.17226/10925',
  },
  {
    marker: 6,
    computes:
      'Total daily energy, as a multiple of resting metabolic rate chosen by the activity level set on a later step.',
    source:
      'FAO/WHO/UNU. Human Energy Requirements, Table 5.3 p.38, 2004. A United Nations technical report, which carries no DOI.',
  },
];

/**
 * The tape-method disclaimer, r2.14(iii), rendered inside a `Disclaimer` box below the US Navy
 * line on the body step.
 *
 * THE OWNER'S OWN TEXT, grammar corrected only, as the brief supplies it. It is not an `advice.`
 * copy key because R3 caps that family at twelve words and this is two sentences; R10 puts long
 * reference text in a content module instead, which is this one, and bodyEquations.test.ts gates
 * it for R5, R6, R11 and URLs alongside every row above.
 *
 * What it REPLACES is the old contents of that disclosure, which named which girths to enter.
 * That text is gone rather than moved: the fields themselves now say which girth each one is,
 * and they change with the selected sex, so repeating it under a `why?` was the duplication he
 * was reading past.
 */
export const BODY_TAPE_DISCLAIMER =
  'FYI: the fields differ between male and female in this method. For the best results, have somebody else measure you; the tape should be horizontal and must NOT follow your body curves.';
