// src/ui/intro/emphasis.test.ts
//
// The mark rules, and the three strings in src/content/introSlides.ts that carry marks today.
// Those three are asserted by DERIVING the expected offsets from the string itself
// (`indexOf`), never by writing a number down: the owner edits those sentences in the design
// editor, and a hard-coded offset would fail the moment he added a word before the mark.

import { describe, expect, it } from 'vitest';
import { emphasisRuns } from './emphasis';
import { INTRO_DISCLAIMER, INTRO_SLIDES } from '../../content/introSlides';

/** What a reader sees: every run joined, marks already gone. */
function shown(text: string): string {
  return emphasisRuns(text).map((run) => run.text).join('');
}

/** Each strong run as `[start, end)` in the mark-free text: the range, not just the word. */
function strongRanges(text: string): ReadonlyArray<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  let at = 0;
  for (const run of emphasisRuns(text)) {
    if (run.strong) ranges.push([at, at + run.text.length]);
    at += run.text.length;
  }
  return ranges;
}

/** `[start, end)` of `word` in `text`, so a test states the word and not an offset. */
function rangeOf(text: string, word: string): readonly [number, number] {
  const at = text.indexOf(word);
  expect(at).toBeGreaterThan(-1);
  return [at, at + word.length];
}

describe('emphasisRuns', () => {
  it('returns plain text as one run', () => {
    expect(emphasisRuns('Nothing is marked here.')).toEqual([
      { text: 'Nothing is marked here.', strong: false },
    ]);
  });

  it('makes the run between a pair of single marks strong, and drops the marks', () => {
    expect(emphasisRuns('the *habit* of exercising')).toEqual([
      { text: 'the ', strong: false },
      { text: 'habit', strong: true },
      { text: ' of exercising', strong: false },
    ]);
  });

  it('reads two pairs in one string', () => {
    expect(emphasisRuns('*one* and *two*')).toEqual([
      { text: 'one', strong: true },
      { text: ' and ', strong: false },
      { text: 'two', strong: true },
    ]);
    expect(shown('*one* and *two*')).toBe('one and two');
  });

  it('reads a pair of double marks the same way', () => {
    expect(emphasisRuns('**So, Basically.** You')).toEqual([
      { text: 'So, Basically.', strong: true },
      { text: ' You', strong: false },
    ]);
  });

  it('opens a strong run to the end when the typewriter cuts inside one', () => {
    expect(emphasisRuns('the *hab')).toEqual([
      { text: 'the ', strong: false },
      { text: 'hab', strong: true },
    ]);
    expect(emphasisRuns('ever. **Again, no dat')).toEqual([
      { text: 'ever. ', strong: false },
      { text: 'Again, no dat', strong: true },
    ]);
  });

  it('shows no mark when the typewriter cuts right after an opening one', () => {
    expect(emphasisRuns('the *')).toEqual([{ text: 'the ', strong: false }]);
    expect(shown('the *')).toBe('the ');
  });

  it('leaves a lone mark between spaces, and an empty pair, as text', () => {
    expect(emphasisRuns('3 * 4 is arithmetic')).toEqual([
      { text: '3 * 4 is arithmetic', strong: false },
    ]);
    expect(emphasisRuns('nothing inside **')).toEqual([
      { text: 'nothing inside **', strong: false },
    ]);
  });

  it('leaves tildes and every other character alone', () => {
    expect(emphasisRuns('stress-free and ~fun~')).toEqual([
      { text: 'stress-free and ~fun~', strong: false },
    ]);
  });

  it('reads the marks the owner wrote into slide 3', () => {
    const lead = INTRO_SLIDES[2]?.lead ?? '';
    expect(lead).toContain('*habit*');
    const text = shown(lead);
    expect(text).not.toContain('*');
    expect(text).toContain('~fun~'); // A tilde is not a mark: his squiggles survive.
    expect(strongRanges(lead)).toEqual([rangeOf(text, 'habit')]);
  });

  it('reads the marks the owner wrote into slide 5', () => {
    const lead = INTRO_SLIDES[4]?.lead ?? '';
    const sentence = 'Again, no data is collected at all, ever.';
    expect(lead).toContain(`**${sentence}**`);
    const text = shown(lead);
    expect(text).not.toContain('*');
    expect(strongRanges(lead)).toEqual([rangeOf(text, sentence)]);
  });

  it('reads every pair the owner has left in the disclaimer', () => {
    /*
     * ASSERTED AS AN INVARIANT, NOT AS A PHRASE LIST, and that is a correction rather than a
     * choice. This test named its two phrases until the owner edited the sentence mid-task,
     * dropping one pair and keeping the other; the test then failed for a sentence that parses
     * perfectly. What must hold whatever he writes: nothing is left on screen that looks like a
     * mark, and every phrase that comes back strong is a phrase he wrapped. Both KINDS of pair
     * are covered above, on fixtures this file owns.
     */
    const text = shown(INTRO_DISCLAIMER);
    expect(text).not.toContain('*');
    const strong = emphasisRuns(INTRO_DISCLAIMER).filter((run) => run.strong).map((run) => run.text);
    expect(strong.length).toBeGreaterThan(0);
    for (const phrase of strong) {
      const wrapped = INTRO_DISCLAIMER.includes(`**${phrase}**`) || INTRO_DISCLAIMER.includes(`*${phrase}*`);
      expect(wrapped).toBe(true);
      expect(strongRanges(INTRO_DISCLAIMER)).toContainEqual(rangeOf(text, phrase));
    }
  });

  it('never returns an empty run, whatever the prefix', () => {
    for (let length = 0; length <= INTRO_DISCLAIMER.length; length += 1) {
      const runs = emphasisRuns(INTRO_DISCLAIMER.slice(0, length));
      expect(runs.some((run) => run.text === '')).toBe(false);
    }
  });
});
