// src/content/sexRationale.test.ts
//
// The R10 contract for the sex-field explainer, modelled on bodyEquations.test.ts. The module is
// exempt from the length rules R1 to R4 and from R9, and from nothing else.
//
// This module differs from bodyEquations.ts in one respect that changes the citation check: it
// cites a fact the app's engines do NOT compute (segment two, hormone therapy) alongside two the
// engine does compute (segment one, RMR). So the Mifflin-St Jeor and Cunningham DOIs are checked
// against src/domain/nutrition.ts, exactly as bodyEquations.test.ts checks them, but the van
// Velzen DOI is checked only for well-formedness: no engine in this repository implements a
// hormone-therapy RMR adjustment, because none is validated (that is segment two's whole point),
// so there is nothing in src/domain for it to match.
import { describe, expect, it } from 'vitest';

import nutritionSource from '../domain/nutrition.ts?raw';
import {
  SEX_RATIONALE_CUNNINGHAM_NOTE,
  SEX_RATIONALE_HRT,
  SEX_RATIONALE_HRT_SOURCE,
  SEX_RATIONALE_HRT_TITLE,
  SEX_RATIONALE_INTRO,
  SEX_RATIONALE_MSJ_OFFSET_NOTE,
  SEX_RATIONALE_SOURCES,
} from './sexRationale';

const ALL_ROWS = [
  ...SEX_RATIONALE_INTRO,
  SEX_RATIONALE_MSJ_OFFSET_NOTE,
  SEX_RATIONALE_CUNNINGHAM_NOTE,
  ...SEX_RATIONALE_SOURCES,
  SEX_RATIONALE_HRT_TITLE,
  ...SEX_RATIONALE_HRT,
  SEX_RATIONALE_HRT_SOURCE,
];

describe('the sex rationale text obeys the rules R10 does not exempt', () => {
  it('R5: no em dash, and no en dash used as a connector', () => {
    for (const row of ALL_ROWS) {
      expect({ row, dash: /—|–/.test(row) }).toEqual({ row, dash: false });
    }
  });

  it('R6: no emoji', () => {
    for (const row of ALL_ROWS) {
      expect({ row, emoji: /\p{Extended_Pictographic}/u.test(row) }).toEqual({
        row,
        emoji: false,
      });
    }
  });

  it('R11: names the defined quantity, never a colloquial stand-in', () => {
    for (const row of ALL_ROWS) {
      expect({ row, loose: /\bweight\b|\bcalories\b/i.test(row) }).toEqual({ row, loose: false });
    }
  });

  it('states no URL, because a string is not a place to put a link', () => {
    for (const row of ALL_ROWS) {
      expect({ row, url: /https?:\/\//.test(row) }).toEqual({ row, url: false });
    }
  });
});

describe('the two RMR citations match the engine that computes them', () => {
  it('prints the Mifflin-St Jeor and Cunningham DOIs, both present in nutrition.ts', () => {
    const printed = SEX_RATIONALE_SOURCES.flatMap((row) => row.match(/10\.\d{4,9}\/[^\s,]+/g) ?? []);
    expect(printed.length).toBe(2);
    for (const doi of printed) {
      expect({ doi, inEngine: nutritionSource.includes(doi) }).toEqual({ doi, inEngine: true });
    }
  });

  it('names the sex-free equation, because it is the answer to the sex question', () => {
    expect(SEX_RATIONALE_CUNNINGHAM_NOTE).toMatch(/no sex term/i);
  });

  it('states the exact offset difference the brief quotes: +5 minus -161 is 166', () => {
    expect(SEX_RATIONALE_INTRO.some((row) => row.includes('166 kcal a day'))).toBe(true);
    expect(SEX_RATIONALE_MSJ_OFFSET_NOTE).toContain('+5 for male');
    expect(SEX_RATIONALE_MSJ_OFFSET_NOTE).toContain('-161 for female');
  });
});

describe('segment two ships no six-month hormone-therapy threshold', () => {
  it('never states a fixed number of months as a rule', () => {
    for (const row of SEX_RATIONALE_HRT) {
      expect({ row, months: /\bsix[- ]month\b|\b6[- ]month\b/i.test(row) }).toEqual({
        row,
        months: false,
      });
    }
  });

  it('carries a well-formed DOI for its own citation, distinct from the RMR pair', () => {
    const doi = SEX_RATIONALE_HRT_SOURCE.match(/10\.\d{4,9}\/\S+/);
    expect(doi).not.toBeNull();
    expect(SEX_RATIONALE_SOURCES.join(' ')).not.toContain(doi?.[0] ?? '');
  });
});
