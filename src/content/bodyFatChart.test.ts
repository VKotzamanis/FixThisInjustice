// The R10 contract for the body-fat chart module. Exempt from the length rules R1 to R4, and
// from nothing else. Written because the module shipped ungated: brief B named only
// sexRationale.ts in R10, so this one had no suite and no exemption of its own.
import { describe, expect, it } from 'vitest';

import { BODY_FAT_CHART_INTRO, BODY_FAT_CHART_PERCENTAGES } from './bodyFatChart';

const ROWS = [BODY_FAT_CHART_INTRO];

describe('the body-fat chart text obeys the rules R10 does not exempt', () => {
  it('R5: no em dash, and no en dash used as a connector', () => {
    for (const row of ROWS) expect({ row, dash: /—|–/.test(row) }).toEqual({ row, dash: false });
  });

  it('R6: no emoji', () => {
    for (const row of ROWS) {
      expect({ row, emoji: /\p{Extended_Pictographic}/u.test(row) }).toEqual({ row, emoji: false });
    }
  });

  it('R11: names the defined quantity, never a colloquial stand-in', () => {
    for (const row of ROWS) {
      expect({ row, loose: /\bweight\b|\bcalories\b/i.test(row) }).toEqual({ row, loose: false });
    }
  });

  it('states no URL', () => {
    for (const row of ROWS) expect({ row, url: /https?:\/\//.test(row) }).toEqual({ row, url: false });
  });
});

describe('the chart tells the reader what it is worth', () => {
  it('says plainly that this is orientation and not a measurement', () => {
    // Decision `visual-bodyfat-tracked-not-engine-feeding`: a visual estimate is stored and
    // tracked but must not silently displace a validated equation, so the screen has to say so.
    expect(BODY_FAT_CHART_INTRO).toContain('not a measurement');
    expect(BODY_FAT_CHART_INTRO).toContain('underestimate');
  });

  it('labels a rising series of percentages, low to high, for each sex', () => {
    for (const sex of ['male', 'female'] as const) {
      const pct = [...BODY_FAT_CHART_PERCENTAGES[sex]];
      expect(pct.length).toBeGreaterThanOrEqual(5);
      expect([...pct].sort((a, b) => a - b)).toEqual(pct);
    }
  });

  // ROADMAP B4. Gallagher et al. 2000, Am J Clin Nutr 72(3):694-701, DOI 10.1093/ajcn/72.3.694
  // (Crossref-checked 2026-10-18), Table 4, age 20-39: the BMI 18.5 (underweight) cut-off maps to
  // 21 % fat in women and 8 % in men, so a shared low label of 10 % sat far below the
  // underweight-equivalent for women.
  it('never offers a woman a label below the underweight-equivalent band (Gallagher 2000)', () => {
    expect(Math.min(...BODY_FAT_CHART_PERCENTAGES.female)).toBeGreaterThanOrEqual(20);
  });

  it('keeps the male row as it was', () => {
    expect([...BODY_FAT_CHART_PERCENTAGES.male]).toEqual([10, 15, 20, 25, 30, 35]);
  });
});
