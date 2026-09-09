// src/content/supplementGuidance.test.ts
//
// The R10 contract for the guidance topics. The module is exempt from the length rules R1 to R4
// and from R9, and from nothing else, following bodyEquations.test.ts and formCues.test.ts.
//
// THE SUITE THAT MATTERS MOST IS "the wall cannot come back". Round 2 claim r2.18 replaced four
// sections of running prose with eight collapsible topics, because the prose was read as a wall.
// Prose grows back. MAX_PARAGRAPH_CHARS is asserted over every user-facing string in the module,
// so it cannot grow back quietly.
//
// The citations themselves moved to guidanceReferences.ts, which is the single numbered list, and
// carries its own suite. What is asserted HERE is the join between the two: a topic that points
// at an unsourced entry must carry a marked placeholder on its own face, and a topic that does
// not must not. That invariant is what stops an unsourced claim from being quietly presented as
// though it were evidenced.
import { describe, expect, it } from 'vitest';

import { GUIDANCE_REFERENCES } from './guidanceReferences';
import { MAX_PARAGRAPH_CHARS, SUPPLEMENT_GUIDANCE } from './supplementGuidance';

/** Every string this module puts in front of a reader. */
const ALL_STRINGS = SUPPLEMENT_GUIDANCE.flatMap((section) => [
  section.heading,
  section.answer,
  ...section.points,
  ...section.caution,
  ...(section.gap === null ? [] : [section.gap]),
]);

/** The paragraphs, which are everything except the heading. */
const PARAGRAPHS = SUPPLEMENT_GUIDANCE.flatMap((section) => [
  section.answer,
  ...section.points,
  ...section.caution,
  ...(section.gap === null ? [] : [section.gap]),
]);

const UNSOURCED_MARKERS = new Set(
  GUIDANCE_REFERENCES.filter((ref) => ref.cite.kind === 'unsourced').map((ref) => ref.marker),
);

describe('guidance topics obey the copy rules R10 does not exempt', () => {
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

  it('R14: every heading is Title Case', () => {
    for (const section of SUPPLEMENT_GUIDANCE) {
      const words = section.heading.split(/[\s-]+/);
      for (const word of words) {
        expect({ heading: section.heading, word, cap: /^[A-Z]/.test(word) }).toEqual({
          heading: section.heading,
          word,
          cap: true,
        });
      }
    }
  });
});

describe('the wall cannot come back', () => {
  it('no paragraph exceeds three rendered lines', () => {
    for (const str of PARAGRAPHS) {
      expect({
        str,
        chars: str.length,
        ok: str.length <= MAX_PARAGRAPH_CHARS,
      }).toEqual({ str, chars: str.length, ok: true });
    }
  });

  /**
   * The one-line answer that opens every box. Two sentences at most, and short enough that a
   * reader who opens a topic and reads nothing else has still read its point.
   */
  it('every topic opens with a one-line answer, not a paragraph', () => {
    for (const section of SUPPLEMENT_GUIDANCE) {
      const sentences = section.answer.split('.').filter((part) => part.trim() !== '').length;
      expect({
        id: section.id,
        chars: section.answer.length,
        sentences,
        ok: section.answer.length <= 120 && sentences <= 2,
      }).toEqual({ id: section.id, chars: section.answer.length, sentences, ok: true });
    }
  });

  it('every topic carries at least one bullet under the answer', () => {
    for (const section of SUPPLEMENT_GUIDANCE) {
      expect({ id: section.id, points: section.points.length > 0 }).toEqual({
        id: section.id,
        points: true,
      });
    }
  });
});

describe('the topics, and what they point at', () => {
  it('has eight topics in the order the brief specifies', () => {
    expect(SUPPLEMENT_GUIDANCE.map((s) => s.id)).toEqual([
      'creatine',
      'caffeine',
      'protein',
      'water',
      'cooldown',
      'electrolytes',
      'shoes',
      'kit',
    ]);
  });

  it('every marker a topic prints exists in the reference list', () => {
    const known = new Set(GUIDANCE_REFERENCES.map((ref) => ref.marker));
    for (const section of SUPPLEMENT_GUIDANCE) {
      expect({ id: section.id, markers: section.markers.length > 0 }).toEqual({
        id: section.id,
        markers: true,
      });
      for (const marker of section.markers) {
        expect({ id: section.id, marker, known: known.has(marker) }).toEqual({
          id: section.id,
          marker,
          known: true,
        });
      }
    }
  });

  /**
   * THE INVARIANT THIS WHOLE STEP TURNS ON. A topic resting on a reference that has no source
   * must say so on its own face, and a topic resting only on published sources must not carry a
   * placeholder it does not need. Either half failing would misrepresent the evidence: the first
   * by presenting an opinion as sourced, the second by disclaiming a claim that is sourced.
   */
  it('a topic has a marked placeholder exactly when one of its references is unsourced', () => {
    for (const section of SUPPLEMENT_GUIDANCE) {
      const restsOnUnsourced = section.markers.some((marker) => UNSOURCED_MARKERS.has(marker));
      expect({ id: section.id, restsOnUnsourced, hasGap: section.gap !== null }).toEqual({
        id: section.id,
        restsOnUnsourced,
        hasGap: restsOnUnsourced,
      });
    }
  });

  it('the four unsourced topics are water, electrolytes, shoes and kit', () => {
    const gapped = SUPPLEMENT_GUIDANCE.filter((s) => s.gap !== null).map((s) => s.id);
    expect(gapped).toEqual(['water', 'electrolytes', 'shoes', 'kit']);
  });

  /**
   * The defect this rebuild fixed. The old bodies carried literal `{dose}`, `{lo}` and `{hi}`
   * slots and the screen rendered the body raw, so the reader actually saw the braces. The
   * personalised numbers come from FORMAT frames now, and no slot may reappear here.
   */
  it('carries no brace slot, because nothing in this module is interpolated', () => {
    for (const str of ALL_STRINGS) {
      expect({ str, braces: /[{}]/.test(str) }).toEqual({ str, braces: false });
    }
  });
});

describe('nothing that was already sourced was re-derived', () => {
  /**
   * Brief L section 2: keep the substance of creatine, caffeine and protein exactly. These are
   * the load-bearing numbers, asserted as text so a rewrite cannot drop or round one of them.
   */
  it('keeps the caffeine safety limits verbatim', () => {
    const caffeine = SUPPLEMENT_GUIDANCE.find((s) => s.id === 'caffeine');
    const text = caffeine?.caution.join(' ') ?? '';
    expect(text).toContain('safe single dose for healthy adults at 200 mg');
    expect(text).toContain('safe daily total at 400 mg');
  });

  it('keeps the protein contamination sampling verbatim', () => {
    const protein = SUPPLEMENT_GUIDANCE.find((s) => s.id === 'protein');
    const text = protein?.caution.join(' ') ?? '';
    expect(text).toContain('634 supplements sampled across thirteen countries');
    expect(text).toContain('14.8 per cent');
    expect(text).toContain('200 online products found 35 per cent');
  });

  it('keeps the per-meal protein dose and the creatine kidney caution', () => {
    const protein = SUPPLEMENT_GUIDANCE.find((s) => s.id === 'protein');
    expect(protein?.points.join(' ')).toContain('0.4 g per kg of body mass');
    const creatine = SUPPLEMENT_GUIDANCE.find((s) => s.id === 'creatine');
    expect(creatine?.caution.join(' ')).toContain('kidney disease');
  });

  /**
   * The fluid threshold, which is the only number the water and electrolyte topics may print.
   * The commonly cited "1.5 L per kg lost" replacement figure is marked PARAPHRASE in this
   * project's content review and ships nowhere, so it may not appear here either.
   */
  it('prints the 2 per cent body-mass loss limit and no replacement volume', () => {
    const water = SUPPLEMENT_GUIDANCE.find((s) => s.id === 'water');
    expect(water?.points.join(' ')).toContain('under 2 per cent of your body mass');
    for (const str of ALL_STRINGS) {
      expect({ str, paraphrase: /1\.5\s*L/i.test(str) }).toEqual({ str, paraphrase: false });
    }
  });
});

describe('the tempo finding follows the evidence, not the gym truism', () => {
  /**
   * Brief L section 3b. Schoenfeld 2015 found SIMILAR hypertrophy across repetition durations of
   * roughly 0.5 to 8 s, which REFUTES the claim that fast repetitions do not build muscle. The
   * owner asked to be told the truth rather than agreed with, so the copy must state the refuted
   * version explicitly rather than quietly omitting the truism.
   */
  const cooldown = SUPPLEMENT_GUIDANCE.find((s) => s.id === 'cooldown');
  const text = cooldown?.points.join(' ') ?? '';

  it('states the measured range and that hypertrophy was similar across it', () => {
    expect(text).toContain('similar hypertrophy');
    expect(text).toContain('0.5 to 8 seconds');
  });

  it('names the truism and says it is not supported', () => {
    expect(text).toContain('fast repetitions do not build muscle is not supported');
  });

  it('does not claim that slower repetitions grow more muscle', () => {
    expect(text).not.toMatch(/slower is better|slow(er)? reps? build/i);
  });
});
