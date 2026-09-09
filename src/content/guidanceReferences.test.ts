// src/content/guidanceReferences.test.ts
//
// The R10 contract for the guidance step's reference list, and the gate on its citations.
//
// A FABRICATED CITATION IS THE ONE UNRECOVERABLE ERROR IN THIS PROJECT, and this step makes
// health claims, so it carries the most exposure to it. Every published DOI here must appear in
// the module that already carried it with the content review's verification, which is what
// `recordedIn` names. A citation invented in this file cannot satisfy that, because there would
// be no engine holding the DOI to match it against.
//
// The single exception carries `recordedIn: null` and is asserted by name: the tempo
// meta-analysis, which no engine implements. It came from brief L section 3b's closed source set,
// verified against CrossRef by the orchestrator on 2026-09-09.
import { describe, expect, it } from 'vitest';

import nutritionSource from '../domain/nutrition.ts?raw';
import restTimerSource from '../domain/training/restTimer.ts?raw';
import {
  GUIDANCE_REFERENCES,
  GUIDANCE_REFERENCES_LEAD,
  GUIDANCE_UNSOURCED_LABEL,
} from './guidanceReferences';

/** The modules a `recordedIn` may name, and their text. */
const SOURCE_OF: Readonly<Record<string, string>> = {
  'src/domain/nutrition.ts': nutritionSource,
  'src/domain/training/restTimer.ts': restTimerSource,
};

const PUBLISHED = GUIDANCE_REFERENCES.flatMap((ref) =>
  ref.cite.kind === 'published' ? [{ marker: ref.marker, cite: ref.cite }] : [],
);

const UNSOURCED = GUIDANCE_REFERENCES.flatMap((ref) =>
  ref.cite.kind === 'unsourced' ? [{ marker: ref.marker, cite: ref.cite }] : [],
);

const ALL_STRINGS = [
  GUIDANCE_REFERENCES_LEAD,
  GUIDANCE_UNSOURCED_LABEL,
  ...GUIDANCE_REFERENCES.flatMap((ref) => [
    ref.lead,
    ref.cite.kind === 'published' ? ref.cite.text : ref.cite.claim,
  ]),
];

describe('the reference list obeys the copy rules R10 does not exempt', () => {
  it('R5: no em dash, and no en dash used as a connector', () => {
    for (const str of ALL_STRINGS) {
      expect({ str, dash: /—|–/.test(str) }).toEqual({ str, dash: false });
    }
  });

  it('R6: no emoji', () => {
    for (const str of ALL_STRINGS) {
      expect({ str, emoji: /\p{Extended_Pictographic}/u.test(str) }).toEqual({ str, emoji: false });
    }
  });

  it('R11: names the defined quantity, never colloquial stand-ins', () => {
    for (const str of ALL_STRINGS) {
      expect({
        str,
        loose: /\bbodyweight\b|\blean body mass\b|\bweightlifting\b/i.test(str),
      }).toEqual({ str, loose: false });
    }
  });

  it('states no URL, because a DOI is not a link and a string is not a place to put one', () => {
    for (const str of ALL_STRINGS) {
      expect({ str, url: /https?:\/\//.test(str) }).toEqual({ str, url: false });
    }
  });
});

describe('one numbering scheme, as r2.15 settled for the body step', () => {
  it('markers are unique', () => {
    const markers = GUIDANCE_REFERENCES.map((ref) => ref.marker);
    expect(new Set(markers).size).toBe(markers.length);
  });

  it('markers run from 1 with no gap, so a superscript always finds a row', () => {
    const markers = GUIDANCE_REFERENCES.map((ref) => ref.marker);
    expect(markers).toEqual(markers.map((_, i) => i + 1));
  });

  it('every entry carries a bold lead line saying what the reference is for', () => {
    for (const ref of GUIDANCE_REFERENCES) {
      expect({ marker: ref.marker, lead: ref.lead.trim().length > 0 }).toEqual({
        marker: ref.marker,
        lead: true,
      });
    }
  });
});

describe('every published citation matches the module that already carried it', () => {
  it('the DOI appears in the engine named by recordedIn', () => {
    for (const { marker, cite } of PUBLISHED) {
      if (cite.recordedIn === null) continue;
      const source = SOURCE_OF[cite.recordedIn];
      expect({ marker, module: cite.recordedIn, known: source !== undefined }).toEqual({
        marker,
        module: cite.recordedIn,
        known: true,
      });
      expect({
        marker,
        doi: cite.doi,
        inEngine: source?.includes(cite.doi) ?? false,
      }).toEqual({ marker, doi: cite.doi, inEngine: true });
    }
  });

  it('the DOI it records is the DOI it prints', () => {
    for (const { marker, cite } of PUBLISHED) {
      expect({ marker, doi: cite.doi, printed: cite.text.includes(`DOI ${cite.doi}`) }).toEqual({
        marker,
        doi: cite.doi,
        printed: true,
      });
    }
  });

  /**
   * The one entry with no engine behind it. Asserted BY NAME rather than by a blanket allowance,
   * so a second unbacked DOI cannot be added later under the same exemption.
   */
  it('exactly one citation has no engine, and it is the repetition-duration meta-analysis', () => {
    const orphans = PUBLISHED.filter(({ cite }) => cite.recordedIn === null);
    expect(orphans.map(({ cite }) => cite.doi)).toEqual(['10.1007/s40279-015-0304-0']);
  });
});

describe('the sources brief L section 3b rejected, which may not come back', () => {
  const PRINTED = GUIDANCE_REFERENCES.map((ref) =>
    ref.cite.kind === 'published' ? ref.cite.text : ref.cite.claim,
  ).join(' ');

  /**
   * Convertino 1996, the 1996 ACSM position stand. It resolves and it is real, and it is
   * SUPERSEDED by the 2007 stand this project already cites at marker 10. Citing a superseded
   * guideline when its replacement is in the tree is a defect, not a citation.
   */
  it('does not cite the superseded 1996 fluid-replacement stand', () => {
    expect(PRINTED).not.toContain('10.1097/00005768-199610000-00045');
    expect(PRINTED).not.toContain('Convertino');
  });

  /** Peacock 2012: 20 minutes of resistance exercise, ad libitum water, no schedule. Rejected. */
  it('does not cite the rejected ad libitum water study', () => {
    expect(PRINTED).not.toContain('10.1016/j.appet.2011.08.023');
  });

  /**
   * The 1996 stand's "greater than 1 hour" threshold was NOT carried across to the 2007
   * citation. Attaching a figure to a paper that was not checked for it is the quiet version of
   * fabricating one.
   */
  it('attaches no duration threshold to the 2007 fluid-replacement stand', () => {
    const fluid = GUIDANCE_REFERENCES.find((ref) => ref.marker === 10);
    expect(fluid?.lead).not.toMatch(/\bhour\b|\b1 h\b|\b60 min\b/i);
  });
});

describe('the claims with no source are named rather than filled', () => {
  /**
   * FIVE rows, across FOUR topics: the shoes topic carries two of them, because the footwear
   * claim and the baby-powder claim are separate claims and collapsing them into one row would
   * hide that neither is evidenced.
   */
  it('there are five unsourced entries', () => {
    expect(UNSOURCED.map(({ marker }) => marker)).toEqual([11, 16, 17, 18, 19]);
  });

  it('each names the claim it stands in for, in a full sentence', () => {
    for (const { marker, cite } of UNSOURCED) {
      expect({ marker, named: cite.claim.trim().length > 40 }).toEqual({ marker, named: true });
    }
  });

  it('none smuggles a DOI into the placeholder text', () => {
    for (const { marker, cite } of UNSOURCED) {
      expect({ marker, doi: /10\.\d{4,9}\//.test(cite.claim) }).toEqual({ marker, doi: false });
    }
  });

  it('the water and electrolyte rows print no volume and no duration', () => {
    for (const marker of [11, 16]) {
      const ref = GUIDANCE_REFERENCES.find((r) => r.marker === marker);
      const claim = ref?.cite.kind === 'unsourced' ? ref.cite.claim : '';
      expect({ marker, number: /\d+\s*(mL|L|min|hour)/i.test(claim) }).toEqual({
        marker,
        number: false,
      });
    }
  });
});
