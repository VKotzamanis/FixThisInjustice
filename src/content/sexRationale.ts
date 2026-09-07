// src/content/sexRationale.ts
//
// The sex-field explainer, opened from the body step by "Options suck? I agree. Click here for
// a workaround." (round 1 claims C1.07.6, C1.07.10 to C1.07.16; round 2 claim r2.12).
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
// verbatim in that file too, and bodyEquations.test.ts checks that they still do.
//
// SEGMENT TWO SHIPS NO SIX-MONTH THRESHOLD. The owner asked for one; the corrections doc's
// decision `hrt-no-threshold-ffm-path` records that no predictive equation has been validated in
// people on hormone therapy, so no threshold has support and none ships.
//
// ROUND 2, r2.12: THE SHAPE CHANGED, THE EVIDENCE DID NOT.
//
// The owner asked for the `wait-what` (ELI5) treatment and gave the running order himself:
// "(a) introduce the topic, (b) describe 1 function of the topic, (c) provide the corresponding
// equation, (d) describe the other function of the topic, (e) provide that equation, and (f)
// write a brief conclusion/summary as a comparison". The exports below are in exactly that order
// and the modal renders them in it, which is what puts each equation at its own point of use
// rather than leaving the two stacked together at the end, his specific objection.
//
// Following `wait-what`: the assumed background is lowered and the content is NOT. Every number,
// hedge and caveat from the round-1 text survives here unchanged and unrounded (166 kcal/day, the
// 280 kcal/day figure, "about 10 per cent in 82 per cent of cases", +5 and -161, "a couple of
// kilograms over the first year", "a fifth of transmasculine participants"); what is added is the
// plain-words definition of each term on first use, which is why this file is longer than the one
// it replaces rather than shorter.
//
// THE CITATIONS MOVED OUT, r2.12(v): "remove the reference from here and put it with all the
// others on that page." The two RMR citations this module used to carry are the same two the
// step's single reference list already prints (src/content/bodyEquations.ts, entries 1 and 2), so
// they are gone from here rather than duplicated. SEX_RATIONALE_HRT_SOURCE stays exported, and
// the STEP renders it in that same list: no engine in this repository implements a
// hormone-therapy adjustment (that is segment two's whole point), so it has no row in
// bodyEquations.ts, whose every DOI must appear in the engine that uses it.

/* ------------------------------------------------------------------ *
 * Segment one, part (a): introduce the topic
 * ------------------------------------------------------------------ */

/** The topic, before either equation is named. */
export const SEX_RATIONALE_TOPIC: readonly string[] = [
  'This app has to estimate your resting metabolic rate: the energy your body uses over a day ' +
    'doing nothing at all. Every energy figure on your screen is built on that one number.',
  'There are two published equations for it. Which one you get depends on a single thing: ' +
    'whether you give the app a body-fat percentage, meaning the share of your body mass that ' +
    'is fat.',
  'Sex matters to one of those two equations and not to the other. That is the whole of what ' +
    'this field is for.',
];

/* ------------------------------------------------------------------ *
 * Segment one, parts (b) and (c): the equation that reads sex
 * ------------------------------------------------------------------ */

/** Heading over part (b). R14: Title Case, and a noun phrase rather than a sentence. */
export const SEX_RATIONALE_MSJ_TITLE = 'Without a Body-Fat Percentage';

/** Part (b): what Mifflin-St Jeor does with the sex field, and how much it moves. */
export const SEX_RATIONALE_MSJ: readonly string[] = [
  'The app uses the Mifflin-St Jeor equation. It reads your body mass, your stature and your ' +
    'age, and then adds one fixed number that depends on sex. A fixed number added at the end ' +
    'like that is called an offset.',
  'The offset is the entire sex difference. For two people of the same body mass, stature and ' +
    'age, the gap between the two answers is exactly 166 kcal a day, whatever those other ' +
    'numbers are.',
  'After the activity factor and a fat-loss target, that lands near 280 kcal a day on the ' +
    'figure you actually see.',
  "For scale: the equation's own published error is about 10 per cent in 82 per cent of cases. " +
    "So the sex term and the equation's uncertainty are the same size.",
];

/** Part (c), under the equation: what the S term in it stands for. */
export const SEX_RATIONALE_MSJ_OFFSET_NOTE = 'S = +5 for male, -161 for female [kcal/day]';

/* ------------------------------------------------------------------ *
 * Segment one, parts (d) and (e): the equation that does not
 * ------------------------------------------------------------------ */

/** Heading over part (d). R14: Title Case, and a noun phrase. */
export const SEX_RATIONALE_CUNNINGHAM_TITLE = 'With a Body-Fat Percentage';

/** Part (d): what Cunningham reads instead, and why that removes the question. */
export const SEX_RATIONALE_CUNNINGHAM: readonly string[] = [
  'The app switches to the Cunningham equation. It reads fat-free mass instead: everything in ' +
    'your body that is not fat, which is muscle, bone, organs and water.',
  'The app works fat-free mass out from your body mass and the percentage you gave it. Nothing ' +
    'in that step asks about sex.',
  'So supplying a body-fat estimate, from a tape measurement or any other source, is the most ' +
    'direct way to stop this field mattering to your energy target.',
];

/** Part (e), under the equation: the point of showing it at all. */
export const SEX_RATIONALE_CUNNINGHAM_NOTE = 'No sex term appears in this equation.';

/* ------------------------------------------------------------------ *
 * Segment one, part (f): the comparison
 * ------------------------------------------------------------------ */

/** Heading over part (f). R14: Title Case, and a noun phrase. */
export const SEX_RATIONALE_SUMMARY_TITLE = 'The Two Side by Side';

/** Part (f): the one-screen comparison, and the two places sex still enters. */
export const SEX_RATIONALE_SUMMARY: readonly string[] = [
  "With no body-fat percentage, sex moves your energy target by about as much as the equation's " +
    'own error does. With one, sex does not enter the energy target at all.',
  'Sex still enters two other places on this page: the tape body-fat equations, whose male and ' +
    'female forms differ in shape rather than in coefficient, and the daily beverage target.',
];

/* ------------------------------------------------------------------ *
 * Segment two: hormone therapy
 * ------------------------------------------------------------------ */

/**
 * Segment two's heading.
 *
 * R14, second clause: a heading is a NOUN PHRASE, not a sentence or a question. Round 1 shipped
 * "If you are on gender-affirming hormone therapy", which is a conditional clause; this is the
 * same audience named as a noun phrase, in Title Case.
 */
export const SEX_RATIONALE_HRT_TITLE = 'Individuals in Gender-Affirming Hormone Therapy';

/** r2.12(iv): segment two's first subsection heading, the owner's own words. */
export const SEX_RATIONALE_HRT_OPEN_TITLE = 'Still an Open Research Question';

/** Under that heading: there is no validated equation, and this app is not pretending there is. */
export const SEX_RATIONALE_HRT_OPEN: readonly string[] = [
  'No predictive equation for resting metabolic rate has been validated in people on hormone ' +
    'therapy. Not the one this app uses, and not its alternatives.',
  'Anyone who tells you which box to tick is guessing, including this app.',
];

/** r2.12(iv): segment two's second subsection heading, the owner's own words. */
export const SEX_RATIONALE_HRT_KNOWN_TITLE = 'What We Know';

/** Under that heading: what the published estimates say, and how much they disagree. */
export const SEX_RATIONALE_HRT_KNOWN: readonly string[] = [
  'Body composition does change on hormone therapy. The published estimates put the lean-mass ' +
    'shift in the region of a couple of kilograms over the first year.',
  'The studies disagree with each other, and the variation between individuals is large. In one ' +
    'cohort followed for two years, a fifth of transmasculine participants showed no measurable ' +
    'change at all.',
  'A rule keyed to months elapsed would therefore be wrong for a lot of people, which is why ' +
    'this app ships no such rule.',
];

/**
 * r2.12(iv): segment two's third subsection heading, the owner's own words.
 *
 * The sprite he is supplying sits beside this one (asset register row `sprite-subsection-marker`,
 * docs/design/2026-09-06-asset-manifest.md). The modal leaves the space; nothing here draws it.
 */
export const SEX_RATIONALE_HRT_NOW_TITLE = 'I Do. So, What Now?';

/** Under that heading: the way round the question, and the way through it. */
export const SEX_RATIONALE_HRT_NOW: readonly string[] = [
  'The honest way round it is to skip the question. Leave the sex field cleared, give the app a ' +
    'body-fat percentage from a tape measurement or any other source, and it switches to the ' +
    'equation with no sex term in it.',
  'If you would rather not, pick whichever option you expect to fit your current body ' +
    'composition better, and treat every energy number that follows as the estimate it already ' +
    'was.',
];

/**
 * Segment two's source, verbatim, rendered in the STEP's reference list rather than here
 * (r2.12(v)). The lead sentence beside it follows the pattern r2.15 asks for: one bold line
 * saying what the reference is for, then the citation, in Elsevier order.
 */
export const SEX_RATIONALE_HRT_SOURCE_LEAD =
  'Body composition change on gender-affirming hormone therapy, and how much the studies disagree.';
/*
 * REORDERED, NEVER RE-SOURCED. Round 1 shipped this as
 *   "van Velzen DM et al. (2020), Eur J Endocrinol 183(5):529-537. DOI 10.1530/EJE-20-0609"
 * and r2.15 asks for Elsevier order: initials after the surname, journal abbreviated,
 * volume(issue):pages, year, DOI last. Every element below is one of those, moved. No author was
 * added to the "et al.", no article title was supplied, and no DOI was retyped from memory: the
 * string a reviewer can check is the same string, in the order he asked for.
 */
export const SEX_RATIONALE_HRT_SOURCE =
  'van Velzen DM, et al. Eur J Endocrinol 183(5):529-537, 2020. DOI 10.1530/EJE-20-0609';
