// src/ui/intro/emphasis.ts
//
// ASTERISKS MEAN BOLD. The owner's decision, 2026-09-11. He writes the intro's prose in the
// design editor (src/designEditor/IntroForm.tsx) and had started wrapping words in asterisks;
// until today they reached the screen as asterisks, because the intro renders its strings as
// plain text. This module is the whole of the rule, kept as a pure function of a string so the
// rule can be tested without a DOM and so the typewriter, the modal and anything later that
// renders one of those strings all read the marks identically.
//
// NOT A MARKDOWN PARSER, AND DELIBERATELY NOT. One mark, one meaning. A tilde is a tilde
// (`~fun~` on slide 3 is his own squiggle and stays visible), an underscore is an underscore, a
// backtick is a backtick. Adding a second syntax would mean deciding what happens where two of
// them overlap, and nothing on screen needs that.
//
// THE RULES, in the order the scanner applies them:
//
//   1. Between a pair of single marks, or a pair of double marks, is strong.
//   2. The marks never appear in a run. Not while typing, not at rest.
//   3. An opening mark with no closer opens a strong run to the end of the text. This is the
//      state EVERY marked word passes through while the typewriter is mid-word, so it is the
//      common case and not an error case.
//   4. A mark with whitespace on both sides is text: arithmetic, a footnote star, a bullet.
//      Start-of-string and end-of-string do not count as whitespace here, which is what keeps
//      rule 3 from being swallowed by this one.
//   5. `**` with nothing inside it is text, for the same reason: an empty bold run is not
//      something anyone means to write, and two visible marks are a typo a reader can see.
//
// The one input the rules do not define is four bare marks, `****`, which is rule 5's pair
// nested inside rule 1's pair. The scanner is deterministic there rather than clever: it finds
// no closer and falls through to rule 5, so two of the four marks stay on screen. Left visible
// on purpose. Guessing an intention would hide a typo.

import { createElement, type ReactNode } from 'react';

/** One stretch of the owner's text, and whether he marked it bold. */
export interface EmphasisRun {
  readonly text: string;
  readonly strong: boolean;
}

const MARK = '*';
const DOUBLE = '**';

/** Rule 4. `?? ''` so either end of the string reads as "not whitespace", never as a space. */
function isText(text: string, at: number): boolean {
  return /\s/.test(text[at - 1] ?? '') && /\s/.test(text[at + 1] ?? '');
}

/** The next mark that closes rather than reads as text, or -1. */
function closer(text: string, from: number): number {
  for (let at = from; at < text.length; at += 1) {
    if (text[at] === MARK && !isText(text, at)) return at;
  }
  return -1;
}

/**
 * The owner's marked-up string, split into the runs a renderer draws. Never returns an empty
 * run, so a caller can map runs to nodes without filtering.
 */
export function emphasisRuns(text: string): ReadonlyArray<EmphasisRun> {
  const runs: EmphasisRun[] = [];
  let plain = '';
  const flush = (): void => {
    if (plain !== '') runs.push({ text: plain, strong: false });
    plain = '';
  };
  const push = (value: string): void => {
    if (value !== '') runs.push({ text: value, strong: true });
  };
  /** Rule 3: whatever follows an unclosed mark is strong, and is scanned by the same rules. */
  const tail = (from: number): ReadonlyArray<EmphasisRun> => {
    flush();
    for (const run of emphasisRuns(text.slice(from))) push(run.text);
    return runs;
  };

  let at = 0;
  while (at < text.length) {
    if (text[at] !== MARK) {
      plain += text[at];
      at += 1;
      continue;
    }
    if (text.startsWith(DOUBLE, at)) {
      // From at+3, not at+2: `****` then finds no closer and falls through to rule 5 below.
      const end = text.indexOf(DOUBLE, at + 3);
      if (end !== -1) {
        flush();
        push(text.slice(at + 2, end));
        at = end + 2;
        continue;
      }
      if (at + 2 >= text.length) {
        plain += DOUBLE; // Rule 5.
        at += 2;
        continue;
      }
      return tail(at + 2);
    }
    if (isText(text, at)) {
      plain += MARK; // Rule 4.
      at += 1;
      continue;
    }
    const end = closer(text, at + 1);
    if (end === -1) return tail(at + 1);
    flush();
    push(text.slice(at + 1, end));
    at = end + 1;
  }
  flush();
  return runs;
}

/**
 * The runs as nodes: one `<strong>` per marked run, the text either side left a plain string.
 *
 * `createElement` rather than JSX so the rule and its renderer stay in ONE `.ts` module, imported
 * by both callers (src/ui/intro/IntroSequence.tsx and src/ui/components/SiteFooter.tsx). A second
 * copy of six lines is how the intro and the footer would come to disagree about what a mark
 * means, which is the whole failure this module exists to prevent.
 *
 * A run cannot straddle two elements: a mark opened in a bullet's lead phrase and closed in its
 * rest is unclosed in both, because each span is emphasised on its own. Every mark in
 * src/content/introSlides.ts today opens and closes inside one field.
 */
export function emphasise(value: string): readonly ReactNode[] {
  return emphasisRuns(value).map((run, index) =>
    run.strong ? createElement('strong', { key: index }, run.text) : run.text,
  );
}
