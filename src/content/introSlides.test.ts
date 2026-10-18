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
  // Emoji and "weight"/"calories" allowed here since 2026-10-18: the owner's own intro wording.
  it('has no em dash, connector en dash, or URL', () => {
    for (const row of TEXT) {
      expect(/—|–|https?:\/\//iu.test(row)).toBe(false);
    }
  });
});

/*
 * STRUCTURE, NOT WORDING. Both tests here used to pin the headings, the warning and the
 * acknowledgement verbatim, which was the right guard while only an agent could change them.
 * The owner now rewrites these same strings himself in Design Mode, so a verbatim pin would fail
 * on every save he makes; what still has to hold is the shape the sequence renders and the
 * single-line form scripts/design-patch.mjs can rewrite.
 */
describe('the restructured slides', () => {
  it('has five slides: no heading on the first, a heading and led bullets on the rest', () => {
    expect(INTRO_SLIDES).toHaveLength(5);
    expect(INTRO_SLIDES[0]?.heading).toBeNull();
    for (const [index, slide] of INTRO_SLIDES.entries()) {
      // Slide 1 carries the greeting: a lead and no bullets, which is how INTRO_SLIDES declares it.
      if (index === 0) continue;
      expect({
        index,
        blankHeading: (slide.heading ?? '').trim() === '',
        hasBullet: slide.bullets.length > 0,
        blankLeads: slide.bullets.filter((bullet) => bullet.lead.trim() === '').length,
      }).toEqual({ index, blankHeading: false, hasBullet: true, blankLeads: 0 });
    }
  });

  it('keeps the warning, its heading and the acknowledgement non-empty and on one line', () => {
    for (const [name, value] of [
      ['INTRO_DISCLAIMER', INTRO_DISCLAIMER],
      ['INTRO_DISCLAIMER_HEADING', INTRO_DISCLAIMER_HEADING],
      ['INTRO_ACKNOWLEDGEMENT', INTRO_ACKNOWLEDGEMENT],
    ] as const) {
      expect({
        name,
        type: typeof value,
        blank: value.trim() === '',
        newline: /\n/.test(value),
      }).toEqual({ name, type: 'string', blank: false, newline: false });
    }
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
