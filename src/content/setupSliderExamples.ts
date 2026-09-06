// src/content/setupSliderExamples.ts
//
// The "Examples" disclosure content for two of setup step 4's three sliders: Everyday Activity
// Level (Brief F Part 1a) and Equipment Access (Brief F Part 1c). Gym Comfort needs no separate
// module: its three position labels are short enough to render directly (Brief F Part 1b) and
// are quoted verbatim from the owner in SetupWizard.tsx itself.
//
// WHY THIS IS NOT A COPY TABLE. Several of the sentences below run past R3's twelve-word cap for
// an `advice.` key ("Sedentary: a desk job and a car commute, with little walking in a normal
// day." is fifteen), and the shortest one ("Full gym: racks, barbells, machines and cables.") is
// grouped with the rest rather than split out, so the whole set reads consistently. Copy contract
// R10 puts reference text a user meets on opening a disclosure in its own module rather than in
// a copy table, as src/content/bodyEquations.ts, src/content/sexRationale.ts and
// src/content/bodyFatChart.ts already do. It is NOT exempt from R5, R6 or R11 (this module's own
// test, setupSliderExamples.test.ts, checks those).
//
// This module is not yet named in R10's list in docs/design/2026-09-01-copy-contract.md: that
// edit is out of Brief F's listed file scope, so it is flagged here and in the task report rather
// than made silently (the same call bodyFatChart.ts's own header makes).
//
// The words are verbatim from docs/plans/subagent-briefs/F-equipment-sliders.md, Parts 1a and 1c.

import type { EquipmentAccess } from '../domain/types';

/**
 * Brief F Part 1a. The walk-to-the-gym example appears HERE and nowhere else: the FAO/WHO/UNU
 * 2004 PAL bands these three positions encode already count everything a person does in a normal
 * day, so a separate walking field would double-count it, and no MET coefficient exists in this
 * project to build one from (see the `Do you walk to and from the gym?` question in
 * SetupWizard.tsx, whose answer is stored and feeds no energy calculation for the same reason).
 */
export const ACTIVITY_LEVEL_EXAMPLES: readonly string[] = [
  'Sedentary: a desk job and a car commute, with little walking in a normal day.',
  'Moderate: regular walking, including a walk to and from the gym, an active job, or training ' +
    'most days.',
  'Vigorous: heavy physical work, or training hard most days on top of an active job.',
];

/**
 * Brief F Part 1c. Shown for the selected slider position only, one sentence at a time -- not a
 * list, so a `Record` keyed by the position rather than an array kept in slider order, which
 * would silently desync if a position were ever reordered.
 */
export const EQUIPMENT_ACCESS_EXAMPLES: Record<EquipmentAccess, string> = {
  bodyweight: 'Body weight only: a mat, a rope, and what your own weight can do.',
  'home-and-bodyweight':
    'Home gym and body weight: dumbbells combined with rope work, walking or burpees.',
  home: 'Home gym: dumbbells, and whatever else is in the room.',
  'full-and-home': 'Full gym and home gym: three days at the gym, one at home.',
  'full-gym': 'Full gym: racks, barbells, machines and cables.',
};
