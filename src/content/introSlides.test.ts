import { describe, expect, it } from 'vitest';
import {
  INTRO_ACKNOWLEDGEMENT,
  INTRO_DISCLAIMER,
  INTRO_DISCLAIMER_HEADING,
  INTRO_FIGURE,
  INTRO_SLIDES,
} from './introSlides';
import { titleCaseOffenders } from './copyContract';

const TEXT = INTRO_SLIDES.flatMap((slide) => [
  ...(slide.heading === null ? [] : [slide.heading]),
  ...(slide.lead === null ? [] : [slide.lead]),
  ...slide.bullets.flatMap((bullet) => [bullet.lead, ...(bullet.rest === null ? [] : [bullet.rest])]),
  INTRO_DISCLAIMER,
  INTRO_ACKNOWLEDGEMENT,
]);

describe('the intro slides obey the rules R10 does not exempt', () => {
  it('has no em dash, connector en dash, emoji, loose quantity name, or URL', () => {
    for (const row of TEXT) {
      expect(/—|–|\p{Extended_Pictographic}|\bweight\b|\bcalories\b|https?:\/\//iu.test(row)).toBe(false);
    }
  });
});

describe('the restructured slides', () => {
  it('has five slides with heading, optional lead, and bullets', () => {
    expect(INTRO_SLIDES).toHaveLength(5);
    expect(INTRO_SLIDES[0]?.heading).toBeNull();
    expect(INTRO_SLIDES[1]?.heading).toBe('Who I Am');
    expect(INTRO_SLIDES[2]?.heading).toBe('Purpose of the App');
    expect(INTRO_SLIDES[3]?.heading).toBe('Motivation');
    expect(INTRO_SLIDES[4]?.heading).toBe('What Setup Collects');
  });

  it('keeps the supplied warning and acknowledgement verbatim', () => {
    expect(INTRO_DISCLAIMER).toBe('Tl;dr: do not be MJT attempting what looks like a pull-up. If you are unsure of an exercise, skip it and ask someone who works at your gym to show you. Consider yourself warned and me not liable.');
    expect(INTRO_ACKNOWLEDGEMENT).toBe('I realise that asking for help from an actual human is necessary when I am unsure about my form. I agree to use common sense and stop being shy to the detriment of my own health.');
  });
});

describe('the ascii figure', () => {
  it('is original and within its size ceiling', () => {
    expect(/mickey|goofy|popeye|hulk|cartoon/i.test(INTRO_FIGURE)).toBe(false);
    const lines = INTRO_FIGURE.split('\n');
    expect(lines.length).toBeLessThanOrEqual(8);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(20);
  });
});

/*
 * R14 OVER THE SLIDE HEADINGS, AT MERGE.
 *
 * Design Mode now lets the owner retype these headings on his phone, and it flags a lower-case one
 * AS HE TYPES (src/content/r10Text.ts applies R14 to a field whose path ends in `heading`). That
 * live check is the useful one, and it is not a gate: it warns, and he can export anyway.
 *
 * `scripts/check-title-case.mjs` scans `DEFAULT_COPY` and nothing else, by design, so it would
 * never see these. Rather than widen that script - which would change the "0 of N" line CI reads
 * and mix a copy-table gate with a content module - the gate for these four headings lives here,
 * next to the strings it governs, exactly as this file's R5, R6, R11 and URL assertions already do.
 */
describe('the slide headings are Title Case, which the panel checks live and this checks at merge', () => {
  it('has no lower-case word in any heading', () => {
    for (const slide of INTRO_SLIDES) {
      if (slide.heading === null) continue;
      expect({ heading: slide.heading, bad: titleCaseOffenders(slide.heading) }).toEqual({
        heading: slide.heading,
        bad: [],
      });
    }
    expect(titleCaseOffenders(INTRO_DISCLAIMER_HEADING)).toEqual([]);
  });
});
