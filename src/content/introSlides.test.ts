// src/content/introSlides.test.ts
//
// The R10 contract for the intro sequence's slide text, modelled on bodyEquations.test.ts: the
// module is exempt from the length rules R1 to R4 and from R9, and from nothing else.
import { describe, expect, it } from 'vitest';

import { INTRO_FIGURE, INTRO_SLIDES } from './introSlides';

const HEADINGS = INTRO_SLIDES.map((s) => s.heading).filter((h): h is string => h !== null);
const BODIES = INTRO_SLIDES.map((s) => s.body);
const ROWS = [...HEADINGS, ...BODIES];

describe('the intro slides obey the rules R10 does not exempt', () => {
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

describe('the six slides, and what the brief fixes about their shape', () => {
  it('carries exactly six slides, in order', () => {
    expect(INTRO_SLIDES).toHaveLength(6);
  });

  it('gives slides 1 and 5 no heading, and every other slide one', () => {
    // 0-based: slide 1 is index 0, slide 5 is index 4.
    expect(INTRO_SLIDES[0]?.heading).toBeNull();
    expect(INTRO_SLIDES[4]?.heading).toBeNull();
    expect(INTRO_SLIDES[1]?.heading).toBe('Who am I');
    expect(INTRO_SLIDES[2]?.heading).toBe('Purpose and functions');
    expect(INTRO_SLIDES[3]?.heading).toBe('Motivation');
    expect(INTRO_SLIDES[5]?.heading).toBe('Before we launch');
  });

  it('keeps slide 4 (Motivation) as exactly two paragraphs', () => {
    const body = INTRO_SLIDES[3]?.body ?? '';
    expect(body.split('\n\n')).toHaveLength(2);
    expect(body).toContain('The concept was a solo project');
  });

  it('carries no literal single newline: the brief\'s own line wrap is not part of the text', () => {
    // A single `\n` (not part of a `\n\n` paragraph break) would mean the markdown fence's
    // wrapping leaked into the string. Every `\n` here is one half of a `\n\n` pair.
    for (const slide of INTRO_SLIDES) {
      const withoutParagraphBreaks = slide.body.split('\n\n').join('');
      expect({ heading: slide.heading, hasNewline: withoutParagraphBreaks.includes('\n') }).toEqual(
        { heading: slide.heading, hasNewline: false },
      );
    }
  });

  it('states the disclaimer\'s liability sentence, byte for byte', () => {
    expect(INTRO_SLIDES[4]?.body).toBe(
      'Tl;dr: do not be MJT attempting what looks like a pull-up. If you are unsure of an exercise, skip it and ask someone who works at your gym to show you. Consider yourself warned and me not liable.',
    );
  });
});

describe('the ascii figure', () => {
  const lines = INTRO_FIGURE.split('\n');

  it('is original: no reference to a named cartoon character', () => {
    // The owner's note named a real, trademarked cartoon character for this spot. This asserts
    // none of the usual short-hands for it, or for "cartoon"/"mascot" as a borrowed identity,
    // appear in the figure text itself.
    const banned = /mickey|goofy|popeye|hulk|cartoon/i;
    expect(banned.test(INTRO_FIGURE)).toBe(false);
  });

  it('is at most 8 lines by 20 columns, the brief\'s ceiling', () => {
    expect(lines.length).toBeLessThanOrEqual(8);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(20);
  });

  it('is not empty', () => {
    expect(INTRO_FIGURE.trim().length).toBeGreaterThan(0);
  });
});
