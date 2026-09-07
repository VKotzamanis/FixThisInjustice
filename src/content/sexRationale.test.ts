// src/content/sexRationale.test.ts
//
// The R10 contract for the sex-field explainer, modelled on bodyEquations.test.ts. The module is
// exempt from the length rules R1 to R4 and from R9, and from nothing else.
//
// ROUND 2, r2.12: WHAT MOVED, AND WHY THIS FILE CHANGED WITH IT.
//
// The two RMR citations used to live in this module, and round 1's version of this suite checked
// them against src/domain/nutrition.ts. r2.12(v) moved every citation on the body step into that
// step's single reference list, and those two were already IN it
// (src/content/bodyEquations.ts, entries 1 and 2), so `SEX_RATIONALE_SOURCES` is gone rather than
// duplicated. NO COVERAGE WAS LOST: bodyEquations.test.ts checks the same two DOIs against the
// same engine file, and it checks every other DOI the step prints as well.
//
// The van Velzen citation stays here, and stays checked only for well-formedness: no engine in
// this repository implements a hormone-therapy RMR adjustment, because none is validated (that is
// segment two's whole point), so there is nothing in src/domain for it to match. It is why that
// entry is rendered from this module rather than added to bodyEquations.ts, whose every DOI must
// appear in the engine that uses it.
import { describe, expect, it } from 'vitest';

import {
  SEX_RATIONALE_CUNNINGHAM,
  SEX_RATIONALE_CUNNINGHAM_NOTE,
  SEX_RATIONALE_CUNNINGHAM_TITLE,
  SEX_RATIONALE_HRT_KNOWN,
  SEX_RATIONALE_HRT_KNOWN_TITLE,
  SEX_RATIONALE_HRT_NOW,
  SEX_RATIONALE_HRT_NOW_TITLE,
  SEX_RATIONALE_HRT_OPEN,
  SEX_RATIONALE_HRT_OPEN_TITLE,
  SEX_RATIONALE_HRT_SOURCE,
  SEX_RATIONALE_HRT_SOURCE_LEAD,
  SEX_RATIONALE_HRT_TITLE,
  SEX_RATIONALE_MSJ,
  SEX_RATIONALE_MSJ_OFFSET_NOTE,
  SEX_RATIONALE_MSJ_TITLE,
  SEX_RATIONALE_SUMMARY,
  SEX_RATIONALE_SUMMARY_TITLE,
  SEX_RATIONALE_TOPIC,
} from './sexRationale';

/** Segment two's three subsections, in the order r2.12(iv) sets. */
const HRT_SUBSECTIONS: readonly (readonly [string, readonly string[]])[] = [
  [SEX_RATIONALE_HRT_OPEN_TITLE, SEX_RATIONALE_HRT_OPEN],
  [SEX_RATIONALE_HRT_KNOWN_TITLE, SEX_RATIONALE_HRT_KNOWN],
  [SEX_RATIONALE_HRT_NOW_TITLE, SEX_RATIONALE_HRT_NOW],
];

const ALL_ROWS: readonly string[] = [
  ...SEX_RATIONALE_TOPIC,
  SEX_RATIONALE_MSJ_TITLE,
  ...SEX_RATIONALE_MSJ,
  SEX_RATIONALE_MSJ_OFFSET_NOTE,
  SEX_RATIONALE_CUNNINGHAM_TITLE,
  ...SEX_RATIONALE_CUNNINGHAM,
  SEX_RATIONALE_CUNNINGHAM_NOTE,
  SEX_RATIONALE_SUMMARY_TITLE,
  ...SEX_RATIONALE_SUMMARY,
  SEX_RATIONALE_HRT_TITLE,
  ...HRT_SUBSECTIONS.flatMap(([title, points]) => [title, ...points]),
  SEX_RATIONALE_HRT_SOURCE_LEAD,
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

/*
 * r2.12(iii): "(a) introduce the topic, (b) describe 1 fucntion of the topic, (c) provide the
 * corresponding equation, (d) describe the other function of the topic, (e) provide that
 * equation, and (f) write a brief conclusion /summary as a comparison."
 *
 * The equations themselves are MathML in SetupWizard.tsx, so what this suite can assert is that
 * the module supplies a described part for each of (a), (b), (d) and (f), each with its own
 * heading where the rubric calls for one, and that the caption under each equation is the one
 * that belongs to it. The modal's own suite asserts the rendered order.
 */
describe('segment one follows the owner rubric, r2.12(iii)', () => {
  it('supplies a described part for the topic, each equation and the comparison', () => {
    expect(SEX_RATIONALE_TOPIC.length).toBeGreaterThan(0);
    expect(SEX_RATIONALE_MSJ.length).toBeGreaterThan(0);
    expect(SEX_RATIONALE_CUNNINGHAM.length).toBeGreaterThan(0);
    expect(SEX_RATIONALE_SUMMARY.length).toBeGreaterThan(0);
  });

  it('pairs each equation with the caption that belongs to it, not with both', () => {
    // The defect he reported: "The two equations appear together but they are referred to in
    // different points of the text explanation." The offset note belongs under Mifflin-St Jeor
    // and names its two constants; the Cunningham note belongs under Cunningham and says the
    // opposite thing about sex. Neither caption may describe the other equation.
    expect(SEX_RATIONALE_MSJ_OFFSET_NOTE).toContain('+5 for male');
    expect(SEX_RATIONALE_MSJ_OFFSET_NOTE).toContain('-161 for female');
    expect(SEX_RATIONALE_CUNNINGHAM_NOTE).toMatch(/no sex term/i);
    expect(SEX_RATIONALE_CUNNINGHAM_NOTE).not.toContain('+5');
  });

  it('states the exact offset difference the brief quotes: +5 minus -161 is 166', () => {
    expect(SEX_RATIONALE_MSJ.some((row) => row.includes('166 kcal a day'))).toBe(true);
  });

  it('keeps every number the round-1 text carried, unrounded (wait-what: content is not lowered)', () => {
    const segmentOne = [...SEX_RATIONALE_TOPIC, ...SEX_RATIONALE_MSJ, ...SEX_RATIONALE_CUNNINGHAM]
      .join(' ');
    expect(segmentOne).toContain('166 kcal a day');
    expect(segmentOne).toContain('280 kcal a day');
    expect(segmentOne).toContain('10 per cent in 82 per cent of cases');
  });

  it('every heading is Title Case and a noun phrase (R14)', () => {
    for (const heading of [
      SEX_RATIONALE_MSJ_TITLE,
      SEX_RATIONALE_CUNNINGHAM_TITLE,
      SEX_RATIONALE_SUMMARY_TITLE,
      SEX_RATIONALE_HRT_TITLE,
    ]) {
      // Every word that is not an article, a conjunction or a short preposition is capitalised.
      const small = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'by']);
      const words = heading.split(/\s+/);
      const offenders = words.filter(
        (word, i) =>
          !/^[A-Z]/.test(word) && !(small.has(word.toLowerCase()) && i > 0 && i < words.length - 1),
      );
      expect({ heading, offenders }).toEqual({ heading, offenders: [] });
    }
    // A noun phrase, not a conditional clause: round 1's "If you are on gender-affirming hormone
    // therapy" is the exact wording R14's second clause names as wrong.
    expect(SEX_RATIONALE_HRT_TITLE).not.toMatch(/^If /);
  });
});

describe('segment two ships no six-month hormone-therapy threshold', () => {
  it('never states a fixed number of months as a rule', () => {
    for (const row of HRT_SUBSECTIONS.flatMap(([, points]) => points)) {
      expect({ row, months: /\bsix[- ]month\b|\b6[- ]month\b/i.test(row) }).toEqual({
        row,
        months: false,
      });
    }
  });

  it("carries the owner's three subsection headings, in his order (r2.12(iv))", () => {
    expect(HRT_SUBSECTIONS.map(([title]) => title)).toEqual([
      'Still an Open Research Question',
      'What We Know',
      'I Do. So, What Now?',
    ]);
    for (const [, points] of HRT_SUBSECTIONS) {
      expect(points.length).toBeGreaterThan(0);
    }
  });

  it('keeps the two findings that make the no-threshold ruling defensible', () => {
    const known = SEX_RATIONALE_HRT_KNOWN.join(' ');
    expect(known).toContain('a couple of kilograms over the first year');
    expect(known).toContain('a fifth of transmasculine participants');
  });

  it('carries a well-formed DOI for its own citation, and a lead saying what it is for', () => {
    const doi = SEX_RATIONALE_HRT_SOURCE.match(/10\.\d{4,9}\/\S+/);
    expect(doi).not.toBeNull();
    // r2.15(iii): one bold sentence above each citation saying what it is about. This module
    // supplies its own, because the step renders this entry in the same list as the engine rows.
    expect(SEX_RATIONALE_HRT_SOURCE_LEAD.length).toBeGreaterThan(0);
    expect(SEX_RATIONALE_HRT_SOURCE_LEAD).not.toContain('10.1530');
  });

  it('prints the citation in Elsevier order: initials after surname, then year, then DOI', () => {
    // r2.15(ii). The elements are the round-1 string's own, REORDERED; nothing was looked up to
    // produce it, so the assertion is on the ORDER and on the elements still being present.
    expect(SEX_RATIONALE_HRT_SOURCE).toBe(
      'van Velzen DM, et al. Eur J Endocrinol 183(5):529-536, 2020. DOI 10.1530/EJE-20-0609',
    );
    const yearAt = SEX_RATIONALE_HRT_SOURCE.indexOf('2020');
    const pagesAt = SEX_RATIONALE_HRT_SOURCE.indexOf('529-536');
    const doiAt = SEX_RATIONALE_HRT_SOURCE.indexOf('DOI');
    expect(pagesAt).toBeLessThan(yearAt);
    expect(yearAt).toBeLessThan(doiAt);
  });
});
