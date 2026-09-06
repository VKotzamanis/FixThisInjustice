// src/content/sexRationale.ts
//
// The sex-field explainer, opened from the body step by "Options suck? I agree. Click here for
// a workaround." (round 1 claims C1.07.6, C1.07.10 to C1.07.16).
//
// WHY THIS IS NOT A COPY TABLE. Copy contract R10: reference text a user chooses to open lives in
// its own module rather than in a copy table, as src/content/bodyEquations.ts and
// src/content/formCues.ts already do; this file is named in R10's list beside them
// (docs/design/2026-09-01-copy-contract.md). It is NOT exempt from R5 (no em dash, no connector
// en dash), R6 (no emoji) or R11 (name the quantity), and sexRationale.test.ts asserts all three.
//
// EVERY NUMBER AND CITATION HERE IS COPIED VERBATIM FROM THE BRIEF
// (docs/plans/subagent-briefs/B-bodyfat-and-sex-modal.md), which took it from
// docs/plans/2026-09-04-11-alpha-round-1-corrections.md sections B3, B9 and B10. None of it is
// re-derived here. The 166 kcal/day figure is exactly MSJ_CONSTANT.male - MSJ_CONSTANT.female in
// src/domain/nutrition.ts (5 - (-161) = 166); the Mifflin-St Jeor and Cunningham DOIs both appear
// verbatim in that file too, and sexRationale.test.ts checks that they still do.
//
// SEGMENT TWO SHIPS NO SIX-MONTH THRESHOLD. The owner asked for one; the corrections doc's
// decision `hrt-no-threshold-ffm-path` records that no predictive equation has been validated in
// people on hormone therapy, so no threshold has support and none ships. The paragraphs below are
// the replacement text, verbatim from the brief, and add nothing beyond it.

/** Segment one: which RMR equation is used, and how much the sex term moves it. */
export const SEX_RATIONALE_INTRO: readonly string[] = [
  'Your resting metabolic rate is estimated from one of two published equations, and which one ' +
    'depends on whether you give a body-fat percentage.',
  "Without one, the app uses Mifflin-St Jeor, where sex enters as a fixed offset. For two people " +
    'of the same body mass, stature and age the difference is exactly 166 kcal a day, whatever ' +
    'those other numbers are. After the activity factor and a fat-loss target that lands near 280 ' +
    "kcal a day on the figure you actually see. For scale, the equation's own published error is " +
    "about 10 per cent in 82 per cent of cases, so the sex term and the equation's uncertainty " +
    'are the same size.',
  'With a body-fat percentage, the app uses Cunningham instead, which reads fat-free mass and has ' +
    'no sex term at all. Supplying a body-fat estimate is therefore the most direct way to stop ' +
    'this field mattering to your energy target.',
  'Sex still enters two other places: the tape body-fat equations, whose male and female forms ' +
    'differ in shape rather than in coefficient, and the daily beverage target.',
];

/** The sex term in the Mifflin-St Jeor equation, rendered under the MathML as plain text. */
export const SEX_RATIONALE_MSJ_OFFSET_NOTE = 'S = +5 for male, -161 for female [kcal/day]';

/** The Cunningham equation carries no sex term at all; stated under its MathML. */
export const SEX_RATIONALE_CUNNINGHAM_NOTE = 'No sex term appears in this equation.';

/** The two published equations segment one cites, verbatim. */
export const SEX_RATIONALE_SOURCES: readonly string[] = [
  'Mifflin MD, St Jeor ST et al. (1990), Am J Clin Nutr 51(2):241-247. DOI 10.1093/ajcn/51.2.241',
  'Cunningham JJ (1991), Am J Clin Nutr 54(6):963-969. DOI 10.1093/ajcn/54.6.963',
];

/** Segment two's heading, verbatim. */
export const SEX_RATIONALE_HRT_TITLE = 'If you are on gender-affirming hormone therapy';

/** Segment two: why no six-month threshold ships, and the honest way round the question. */
export const SEX_RATIONALE_HRT: readonly string[] = [
  'No predictive equation for resting metabolic rate has been validated in people on hormone ' +
    'therapy. Not the one this app uses, and not its alternatives. Anyone who tells you which box ' +
    'to tick is guessing, including this app.',
  'Body composition does change on hormone therapy, and the published estimates put the lean-mass ' +
    'shift in the region of a couple of kilograms over the first year, though the studies disagree ' +
    'and the variation between individuals is large: in one cohort followed for two years, a fifth ' +
    'of transmasculine participants showed no measurable change at all. A rule keyed to months ' +
    'elapsed would therefore be wrong for a lot of people.',
  'The honest way round it is to skip the question. Give the app a body-fat percentage, from a ' +
    'tape measurement or any other source, and it switches to the equation with no sex term in it. ' +
    'If you would rather not, pick whichever option you expect to fit your current body ' +
    'composition better, and treat every energy number that follows as the estimate it already was.',
];

/** Segment two's source, verbatim. */
export const SEX_RATIONALE_HRT_SOURCE =
  'van Velzen DM et al. (2020), Eur J Endocrinol 183(5):529-537. DOI 10.1530/EJE-20-0609';
