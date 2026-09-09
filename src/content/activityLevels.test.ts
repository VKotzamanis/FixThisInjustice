// src/content/activityLevels.test.ts
//
// The R10 contract for "Where These Levels Come From". Exempt from R1 to R4 and from R9,
// following bodyEquations.test.ts's own pattern; not exempt from R5, R6 or R11.
//
// The second describe block is the one that matters: every PAL and band bound printed to a user
// must also appear in src/domain/nutrition.ts's own source, so this module cannot drift from the
// engine it describes. That is the same `?raw`-source technique bodyEquations.test.ts uses for
// its DOIs, applied here to numbers instead.
import { describe, expect, it } from 'vitest';

import nutritionSource from '../domain/nutrition.ts?raw';
import {
  ACTIVITY_LEVELS_BAND_ROWS,
  ACTIVITY_LEVELS_CITATION,
  ACTIVITY_LEVELS_CLOSING,
  ACTIVITY_LEVELS_INTRO,
  ACTIVITY_LEVELS_STOP_ROWS,
} from './activityLevels';

const ROWS = [
  ACTIVITY_LEVELS_INTRO,
  ...ACTIVITY_LEVELS_BAND_ROWS,
  ...ACTIVITY_LEVELS_STOP_ROWS,
  ACTIVITY_LEVELS_CLOSING,
  ACTIVITY_LEVELS_CITATION,
];

describe('the activity-levels modal obeys the rules R10 does not exempt', () => {
  it('R5: no em dash, and no en dash used as a connector', () => {
    for (const row of ROWS) expect({ row, dash: /—|–/.test(row) }).toEqual({ row, dash: false });
  });

  it('R6: no emoji', () => {
    for (const row of ROWS) {
      expect({ row, emoji: /\p{Extended_Pictographic}/u.test(row) }).toEqual({
        row,
        emoji: false,
      });
    }
  });

  it('R11: names the defined quantity, never a colloquial stand-in', () => {
    // "weight" for body mass and "calories" for kcal are the two the contract calls out by name.
    for (const row of ROWS) {
      expect({ row, loose: /\bweight\b|\bcalories\b/i.test(row) }).toEqual({ row, loose: false });
    }
  });

  it('states no URL, because a string is not a place to put a link', () => {
    for (const row of ROWS) {
      expect({ row, url: /https?:\/\//.test(row) }).toEqual({ row, url: false });
    }
  });
});

describe('the content matches the brief verbatim', () => {
  it('carries exactly the nine stops, in order, worded exactly as the brief table', () => {
    expect(ACTIVITY_LEVELS_STOP_ROWS).toEqual([
      'Stop 1, sedentary, PAL 1.40: Desk, car, sofa. You have wondered whether standing counts ' +
        'as cardio.',
      'Stop 2, sedentary, PAL 1.55: Desk job, but you walk somewhere most days and take the ' +
        'stairs when the lift is slow.',
      'Stop 3, sedentary, PAL 1.69: Desk job with a commute on foot, and weekends that involve ' +
        'leaving the house.',
      'Stop 4, moderate, PAL 1.70: You train a couple of times a week and are on your feet ' +
        'more than you sit.',
      'Stop 5, moderate, PAL 1.85: Three or four sessions a week, or a job that keeps you ' +
        'moving all day.',
      'Stop 6, moderate, PAL 1.99: Training most days, or an active job with training on top.',
      'Stop 7, vigorous, PAL 2.00: Hard training most days, and a job that does not let you ' +
        'sit down.',
      'Stop 8, vigorous, PAL 2.20: Two sessions most days, or manual work plus serious training.',
      'Stop 9, vigorous, PAL 2.40: Athlete, or your job is brutal and you train as well.',
    ]);
  });

  it('carries exactly the three bands, in order', () => {
    expect(ACTIVITY_LEVELS_BAND_ROWS).toEqual([
      'Sedentary or light activity: PAL 1.40 to 1.69.',
      'Active or moderately active: PAL 1.70 to 1.99.',
      'Vigorous or vigorously active: PAL 2.00 to 2.40.',
    ]);
  });
});

describe('the numbers match src/domain/nutrition.ts, so this module cannot drift from the engine', () => {
  it('has nine stop rows, one per ACTIVITY_STOPS member', () => {
    expect(ACTIVITY_LEVELS_STOP_ROWS).toHaveLength(9);
  });

  it("prints every stop's PAL, and every one also appears in nutrition.ts's own source", () => {
    const pals = ['1.40', '1.55', '1.69', '1.70', '1.85', '1.99', '2.00', '2.20', '2.40'];
    const stopText = ACTIVITY_LEVELS_STOP_ROWS.join(' ');
    for (const pal of pals) {
      expect(stopText).toContain(`PAL ${pal}`);
      expect({ pal, inEngine: nutritionSource.includes(pal) }).toEqual({ pal, inEngine: true });
    }
  });

  it('prints the three band bounds, and every one also appears in nutrition.ts', () => {
    const bounds = ['1.40', '1.69', '1.70', '1.99', '2.00', '2.40'];
    for (const bound of bounds) {
      expect({ bound, inEngine: nutritionSource.includes(bound) }).toEqual({
        bound,
        inEngine: true,
      });
    }
  });

  it('says so in words where the source carries no DOI, rather than omitting the row', () => {
    expect(ACTIVITY_LEVELS_CITATION).toContain('FAO/WHO/UNU');
    expect(ACTIVITY_LEVELS_CITATION).toContain('no DOI');
  });
});
