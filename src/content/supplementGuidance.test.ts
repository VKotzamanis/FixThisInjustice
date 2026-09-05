// src/content/supplementGuidance.test.ts
//
// The R10 contract for the supplement guidance list. The module is exempt from the length rules
// R1 to R4 and from R9, and from nothing else, following bodyEquations.test.ts and formCues.test.ts.
//
// Asserts that every DOI printed to a user in supplementGuidance.ts is present in
// src/domain/nutrition.ts, so citations do not drift from the engine.
import { describe, expect, it } from 'vitest';

import nutritionSource from '../domain/nutrition.ts?raw';
import { SUPPLEMENT_GUIDANCE } from './supplementGuidance';

const ALL_STRINGS = SUPPLEMENT_GUIDANCE.flatMap((section) => [
  section.heading,
  section.body,
  ...(section.caution ? [section.caution] : []),
  ...section.sources,
]);

describe('supplement guidance obeys the copy rules R10 does not exempt', () => {
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

  it('states no URL, because a string is not a place to put a link', () => {
    for (const str of ALL_STRINGS) {
      expect({ str, url: /https?:\/\//.test(str) }).toEqual({ str, url: false });
    }
  });
});

describe('the citations match the engine', () => {
  it('every DOI in sources appears in nutrition.ts', () => {
    const allSources = SUPPLEMENT_GUIDANCE.flatMap((s) => s.sources);
    const printedDois = allSources.flatMap((src) => src.match(/10\.\d{4,9}\/[^\s,]+/g) ?? []);
    expect(printedDois.length).toBeGreaterThanOrEqual(6);
    for (const doi of printedDois) {
      expect({ doi, inEngine: nutritionSource.includes(doi) }).toEqual({ doi, inEngine: true });
    }
  });

  it('has four sections in the specified order', () => {
    expect(SUPPLEMENT_GUIDANCE.map((s) => s.id)).toEqual(['creatine', 'caffeine', 'protein', 'kit']);
  });
});
