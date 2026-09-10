// The R10 contract for the setup-slider examples module. Exempt from the length rules R1 to R4,
// and from nothing else.
import { describe, expect, it } from 'vitest';

import { ACTIVITY_STOPS } from '../domain/nutrition';
import {
  ACTIVITY_LEVEL_EXAMPLES,
  ACTIVITY_STOP_EXAMPLES,
  EQUIPMENT_ACCESS_EXAMPLES,
} from './setupSliderExamples';

const ROWS = [...ACTIVITY_LEVEL_EXAMPLES, ...Object.values(EQUIPMENT_ACCESS_EXAMPLES)];

describe('the setup-slider examples obey the rules R10 does not exempt', () => {
  it('R5: no em dash, and no en dash used as a connector', () => {
    for (const row of ROWS) expect({ row, dash: /—|–/.test(row) }).toEqual({ row, dash: false });
  });

  it('R6: no emoji', () => {
    for (const row of ROWS) {
      expect({ row, emoji: /\p{Extended_Pictographic}/u.test(row) }).toEqual({ row, emoji: false });
    }
  });

  it(
    'R11: no loose "calories" stand-in ' +
      '("weight" is exempt here: every occurrence names the bodyweight-training tier, the ' +
      'correct term this project uses throughout for it, e.g. types.ts Equipment = ' +
      '"bodyweight", not a stand-in for the body-mass quantity R11 actually guards)',
    () => {
      for (const row of ROWS) {
        expect({ row, loose: /\bcalories\b/i.test(row) }).toEqual({ row, loose: false });
      }
    },
  );

  it('states no URL', () => {
    for (const row of ROWS) {
      expect({ row, url: /https?:\/\//.test(row) }).toEqual({ row, url: false });
    }
  });
});

describe('the content matches the brief verbatim', () => {
  it('carries exactly the three activity bands, in order', () => {
    expect(ACTIVITY_LEVEL_EXAMPLES).toEqual([
      'Sedentary: a desk job and a car commute, with little walking in a normal day.',
      'Moderate: regular walking, including a walk to and from the gym, an active job, or ' +
        'training most days.',
      'Vigorous: heavy physical work, or training hard most days on top of an active job.',
    ]);
  });

  it('carries exactly the five equipment access positions', () => {
    expect(EQUIPMENT_ACCESS_EXAMPLES).toEqual({
      bodyweight: 'Body weight only: a mat, a rope, and what your own weight can do.',
      'home-and-bodyweight':
        'Home gym and body weight: dumbbells combined with rope work, walking or burpees.',
      home: 'Home gym: dumbbells, and whatever else is in the room.',
      'full-and-home': 'Full gym and home gym: three days at the gym, one at home.',
      'full-gym': 'Full gym: racks, barbells, machines and cables.',
    });
  });

  it('mentions the walk to the gym only in the activity band, never in the equipment examples', () => {
    // The walk-to-the-gym question (SetupWizard.tsx) stores its answer but feeds no energy
    // calculation, because the Moderate band above already counts it. If it also appeared in an
    // equipment example, a reader could reasonably infer it was being counted twice.
    expect(ACTIVITY_LEVEL_EXAMPLES.join(' ')).toContain('walk to and from the gym');
    for (const row of Object.values(EQUIPMENT_ACCESS_EXAMPLES)) {
      expect(row).not.toContain('walk to and from the gym');
    }
  });

  /*
   * THE ANTI-DESYNC GATE, and the reason ACTIVITY_STOP_EXAMPLES is keyed by PAL rather than by
   * slider index.
   *
   * Brief G widened the activity slider from three stops to nine and left the readout showing
   * only the BAND, so the three stops inside a band were indistinguishable: six of the nine
   * positions changed nothing a user could see. The per-stop sentences fix that, and these two
   * assertions are what stop the fix rotting. A tenth stop cannot ship without its sentence, and
   * a removed stop cannot leave an orphan sentence behind.
   */
  it('gives every ACTIVITY_STOPS stop exactly one example, and no example an absent stop', () => {
    const stopPals = ACTIVITY_STOPS.map((stop) => stop.pal).sort((a, b) => a - b);
    const examplePals = Object.keys(ACTIVITY_STOP_EXAMPLES)
      .map(Number)
      .sort((a, b) => a - b);
    expect(examplePals).toEqual(stopPals);
    for (const pal of stopPals) {
      expect(ACTIVITY_STOP_EXAMPLES[pal], `no example for PAL ${String(pal)}`).toBeTruthy();
    }
  });

  it('gives the nine stops nine DISTINCT sentences', () => {
    // Two stops sharing a sentence is the same defect as no sentence at all: the user still
    // cannot tell the two positions apart.
    const sentences = Object.values(ACTIVITY_STOP_EXAMPLES);
    expect(sentences).toHaveLength(ACTIVITY_STOPS.length);
    expect(new Set(sentences).size).toBe(sentences.length);
  });
});
