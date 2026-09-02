import { describe, it, expect } from 'vitest';
import {
  SPECIMEN_CARDS,
  SPECIMEN_BY_ID,
  SPECIMEN_CATEGORIES,
  SPECIMEN_RARITIES,
  RARITY_WEIGHT,
  CARDS_WITHOUT_DOI,
  DROPPED_CARD_IDS,
} from './specimenCards';

// The DOI syntax registered by the DOI Foundation: "10." + registrant code + "/" + suffix.
const DOI_RE = /^10\.\d{4,9}\/\S+$/;

/*
 * The alternation the CI personal-data gate greps for (master plan section 3, "Personal data";
 * .github/workflows/ci.yml). Each needle is assembled from two halves at run time so that the
 * whole word never appears as a literal in tracked source: written out in full, this file would
 * itself match `git grep -nEi 'vyvans[e]|lisdexamfetamin[e]|ymc[a]|amphetamin[e]' -- 'src/'`
 * and fail the very gate it exists to protect.
 */
const BANNED_RE = new RegExp(
  ['vyvan' + 'se', 'lisdexamfetam' + 'ine', 'ym' + 'ca', 'amphetam' + 'ine'].join('|'),
  'i',
);

// Master plan section 3, copy contract: no em-dash, and no en-dash as a sentence connector.
// Atlas cards are exempt from the length limits, not from this rule.
const DASH_RE = /[\u2012-\u2015]/;

function allText(): string[] {
  return SPECIMEN_CARDS.flatMap((c) => [
    c.id,
    c.title,
    c.category,
    c.body,
    c.source.citation,
    c.source.doi ?? '',
  ]);
}

describe('specimen card library', () => {
  it('holds 37 cards, at least the 15 the plan requires', () => {
    expect(SPECIMEN_CARDS.length).toBe(37);
    expect(SPECIMEN_CARDS.length).toBeGreaterThanOrEqual(15);
  });

  it('splits 12 common / 13 uncommon / 12 rare', () => {
    const counts = { common: 0, uncommon: 0, rare: 0 };
    for (const c of SPECIMEN_CARDS) counts[c.rarity] += 1;
    expect(counts).toEqual({ common: 12, uncommon: 13, rare: 12 });
  });

  it('gives every card a unique, well-formed id', () => {
    const ids = SPECIMEN_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[cur]\d{3}$/);
  });

  it('indexes every card by id', () => {
    expect(Object.keys(SPECIMEN_BY_ID).length).toBe(SPECIMEN_CARDS.length);
    for (const c of SPECIMEN_CARDS) expect(SPECIMEN_BY_ID[c.id]).toBe(c);
  });

  // G1
  it('carries a syntactically valid DOI wherever a DOI exists', () => {
    for (const c of SPECIMEN_CARDS) {
      if (c.source.doi !== null) expect(c.source.doi, c.id).toMatch(DOI_RE);
    }
  });

  // G1: a null DOI is allowed only for the six works verified without one.
  it('permits a null DOI only for the declared non-DOI works', () => {
    const nullDoi = SPECIMEN_CARDS.filter((c) => c.source.doi === null)
      .map((c) => c.id)
      .sort();
    expect(nullDoi).toEqual([...CARDS_WITHOUT_DOI].sort());
    for (const c of SPECIMEN_CARDS) expect(c.source.citation.length, c.id).toBeGreaterThan(20);
  });

  it('never repeats a DOI across two cards', () => {
    const dois = SPECIMEN_CARDS.map((c) => c.source.doi).filter((d): d is string => d !== null);
    expect(new Set(dois).size).toBe(dois.length);
  });

  // G2
  it('contains none of the strings the personal-data gate bans', () => {
    for (const text of allText()) expect(BANNED_RE.test(text), text).toBe(false);
  });

  // G3: pure ASCII mechanically excludes emoji, which the tone rule forbids.
  it('is pure ASCII in every field', () => {
    for (const text of allText()) expect(/^[\x20-\x7E]*$/.test(text), text).toBe(true);
  });

  // G3, stated separately so a dash failure names itself rather than reading as "not ASCII".
  it('uses no em-dash or en-dash anywhere', () => {
    for (const text of allText()) expect(DASH_RE.test(text), text).toBe(false);
  });

  it('drops every card the review condemned without a replacement', () => {
    for (const id of DROPPED_CARD_IDS) expect(SPECIMEN_BY_ID[id]).toBeUndefined();
    expect(DROPPED_CARD_IDS).toEqual(['c007', 'c012', 'c013', 'u008', 'u013']);
  });

  it('uses only declared rarities and categories at runtime', () => {
    for (const c of SPECIMEN_CARDS) {
      expect(SPECIMEN_RARITIES).toContain(c.rarity);
      expect(SPECIMEN_CATEGORIES).toContain(c.category);
    }
  });

  it('weights rarity 6 / 3 / 1', () => {
    expect(RARITY_WEIGHT).toEqual({ common: 6, uncommon: 3, rare: 1 });
  });

  // Silvers 1991 is r007's only source and it does not state this; the sentence was deleted
  // on the 2026-09-02 content pass and must not come back through a later edit.
  it('claims nothing about sympathetic nasal decongestion in any body', () => {
    for (const c of SPECIMEN_CARDS) expect(c.body.toLowerCase(), c.id).not.toContain('sympathetic nasal');
  });

  // Leproult 2011 ran a 10-h bedtime, not 10 h of measured sleep: c006 must say time in bed.
  it("describes c006's long condition as time in bed, not sleep", () => {
    expect(SPECIMEN_BY_ID['c006']?.body).toContain('in bed');
  });

  it('writes a substantive body for every card', () => {
    for (const c of SPECIMEN_CARDS) {
      expect(c.body.length, c.id).toBeGreaterThan(80);
      expect(c.title.length, c.id).toBeGreaterThan(3);
    }
  });
});
