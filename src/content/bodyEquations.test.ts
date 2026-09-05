// src/content/bodyEquations.test.ts
//
// The R10 contract for the body-step equation list. The module is exempt from the length rules
// R1 to R4 and from R9, and from nothing else; the precedent is formCues.test.ts and
// specimenCards.test.ts, which gate their own modules the same way.
//
// The last test is the one that matters: every DOI printed to a user must also appear in the
// engine that uses it, so a citation cannot drift from the code it describes.
import { describe, expect, it } from 'vitest';

import bodyfatSource from '../domain/bodyfat.ts?raw';
import nutritionSource from '../domain/nutrition.ts?raw';
import { BODY_EQUATIONS, BODY_EQUATIONS_LEAD } from './bodyEquations';

const ROWS = [...BODY_EQUATIONS.map((e) => `${e.computes} ${e.source}`), BODY_EQUATIONS_LEAD];

describe('the body equation list obeys the rules R10 does not exempt', () => {
  it('R5: no em dash, and no en dash used as a connector', () => {
    for (const row of ROWS) {
      expect({ row, dash: /—|–/.test(row) }).toEqual({ row, dash: false });
    }
  });

  it('R6: no emoji', () => {
    for (const row of ROWS) {
      expect({ row, emoji: /\p{Extended_Pictographic}/u.test(row) }).toEqual({ row, emoji: false });
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

describe('the citations match the engines that use them', () => {
  it('prints only DOIs that appear in nutrition.ts or bodyfat.ts', () => {
    const engines = `${nutritionSource}\n${bodyfatSource}`;
    const printed = ROWS.flatMap((row) => row.match(/10\.\d{4,9}\/[^\s,]+/g) ?? []);
    // The list would be pointless if it cited nothing.
    expect(printed.length).toBeGreaterThanOrEqual(5);
    for (const doi of printed) {
      expect({ doi, inEngine: engines.includes(doi) }).toEqual({ doi, inEngine: true });
    }
  });

  it('says so in words where a source carries no DOI, rather than omitting the row', () => {
    const fao = ROWS.find((row) => row.includes('FAO/WHO/UNU'));
    expect(fao).toBeDefined();
    expect(fao).toContain('no DOI');
  });

  it('names the sex-free equation, because it is the answer to the sex question', () => {
    const cunningham = ROWS.find((row) => row.includes('Cunningham'));
    expect(cunningham).toBeDefined();
    expect(cunningham).toContain('no sex term');
  });
});
