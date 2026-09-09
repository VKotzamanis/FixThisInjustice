// src/content/activityLevels.ts
//
// "Where These Levels Come From", the reference modal opened from the training step's Everyday
// Activity Level slider (Brief G: the activity slider, nine stops. Decision
// `activity-slider-nine-stops`, supersedes `activity-levels-three-bands`).
//
// WHY THIS IS NOT A COPY TABLE. Copy contract R10: reference text a user chooses to open lives
// in its own module rather than a copy table, as src/content/bodyEquations.ts and its siblings
// already do; this file is named in R10's list (docs/design/2026-09-01-copy-contract.md). It is
// NOT exempt from R5 (no em dash, no connector en dash), R6 (no emoji) or R11 (name the
// quantity), and activityLevels.test.ts asserts all three, following bodyEquations.test.ts's own
// pattern rather than inventing a new one.
//
// EVERY NUMBER HERE IS COPIED FROM THE ENGINE THAT USES IT, never retyped from memory:
// src/domain/nutrition.ts's ACTIVITY_BAND and ACTIVITY_STOPS carry the FAO/WHO/UNU (2004) Table
// 5.3 p.38 numbers with the content peer review's verification. activityLevels.test.ts scans
// that file's own source text (the same `?raw` technique bodyEquations.test.ts uses for its
// DOIs) and asserts every PAL and band bound printed below also appears there, so this module
// cannot drift from the engine it describes without the test noticing. This module deliberately
// does NOT import from src/domain/nutrition.ts at runtime, matching bodyEquations.ts's own
// precedent: a content module is data, and the cross-check lives in the test, not in a shared
// import that would make this module something other than plain content.
//
// FAO/WHO/UNU (2004) is a United Nations technical report and carries no DOI;
// ACTIVITY_LEVELS_CITATION says so in words, worded exactly as src/content/bodyEquations.ts's
// own marker-6 row for the same source, rather than omitting the row or inventing a DOI.
//
// The intro paragraph and the closing line paraphrase the brief's own prose description of what
// those two passages must say (docs/plans/subagent-briefs/G-activity-slider.md gives content
// requirements there, not a verbatim string to copy); neither states a fact beyond what this
// module's band rows, stop rows and citation already carry.

/** One short paragraph, shown first in the modal. */
export const ACTIVITY_LEVELS_INTRO =
  'Fitness guidance compresses a whole week of behaviour into a handful of bands, because that ' +
  'is the resolution the underlying research supports. These are the three bands this app ' +
  'uses, and the nine stops on the slider are points inside them.';

/**
 * The three FAO/WHO/UNU (2004) Table 5.3 p.38 bands, name and printed range verbatim
 * (src/domain/nutrition.ts's own ACTIVITY_BAND doc comment quotes the same table).
 */
export const ACTIVITY_LEVELS_BAND_ROWS: readonly string[] = [
  'Sedentary or light activity: PAL 1.40 to 1.69.',
  'Active or moderately active: PAL 1.70 to 1.99.',
  'Vigorous or vigorously active: PAL 2.00 to 2.40.',
];

/**
 * The nine stops, band, PAL and Example column, verbatim from the brief's own table (itself the
 * same FAO/WHO/UNU 2004 Table 5.3 p.38 src/domain/nutrition.ts's ACTIVITY_STOPS doc comment
 * cites), in stop order 1 to 9.
 */
export const ACTIVITY_LEVELS_STOP_ROWS: readonly string[] = [
  'Stop 1, sedentary, PAL 1.40: Desk, car, sofa. You have wondered whether standing counts as ' +
    'cardio.',
  'Stop 2, sedentary, PAL 1.55: Desk job, but you walk somewhere most days and take the stairs ' +
    'when the lift is slow.',
  'Stop 3, sedentary, PAL 1.69: Desk job with a commute on foot, and weekends that involve ' +
    'leaving the house.',
  'Stop 4, moderate, PAL 1.70: You train a couple of times a week and are on your feet more ' +
    'than you sit.',
  'Stop 5, moderate, PAL 1.85: Three or four sessions a week, or a job that keeps you moving ' +
    'all day.',
  'Stop 6, moderate, PAL 1.99: Training most days, or an active job with training on top.',
  'Stop 7, vigorous, PAL 2.00: Hard training most days, and a job that does not let you sit ' +
    'down.',
  'Stop 8, vigorous, PAL 2.20: Two sessions most days, or manual work plus serious training.',
  'Stop 9, vigorous, PAL 2.40: Athlete, or your job is brutal and you train as well.',
];

/** One closing line, paraphrasing the brief's own description of what it must say. */
export const ACTIVITY_LEVELS_CLOSING =
  'This is a starting estimate. The app re-derives your targets from your own weigh-ins as ' +
  'they arrive.';

/**
 * FAO/WHO/UNU (2004), stated exactly as src/content/bodyEquations.ts's own marker-6 row states
 * it for the same source, so the two citations of one report read identically everywhere they
 * appear.
 */
export const ACTIVITY_LEVELS_CITATION =
  'FAO/WHO/UNU. Human Energy Requirements, Table 5.3 p.38, 2004. A United Nations technical ' +
  'report, which carries no DOI.';
