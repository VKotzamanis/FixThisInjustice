/**
 * The paste guard, which is the rule that keeps markup out of the copy tables.
 *
 * The pair of assertions that earns this file: a fragment carrying formatting is REFUSED with a
 * message naming what was found, and a plain fragment wrapped in the boilerplate every browser
 * adds is ACCEPTED. Refusing both would make the guard unusable; accepting both would put a
 * `<span style>` into `catalogue.json`.
 */
import { describe, expect, it } from 'vitest';
import { judgePaste, markupFound, normaliseEditedText } from './pasteGuard';

describe('markupFound', () => {
  it('ignores the wrapper a browser adds around every copied fragment', () => {
    expect(markupFound('<html><head><meta charset="utf-8"></head><body>Reload</body></html>')).toEqual(
      [],
    );
    expect(markupFound('')).toEqual([]);
    expect(markupFound('   ')).toEqual([]);
  });

  it('names the formatting it found, so the message can say what did not survive', () => {
    expect(markupFound('<b>Reload</b>')).toEqual(['<b>']);
    expect(markupFound('<p>one</p><a href="#">two</a>')).toEqual(['<a>', '<p>']);
  });

  it('catches an inline style, which is what a word processor actually pastes', () => {
    expect(markupFound('<meta charset="utf-8"><span style="font-weight:700">Reload</span>')).toEqual([
      '<span>',
      'style=',
    ]);
  });

  it('does not count a comment as an element', () => {
    expect(markupFound('<!--StartFragment-->Reload<!--EndFragment-->')).toEqual([]);
  });
});

describe('judgePaste', () => {
  it('refuses a paste carrying markup and says what was in it', () => {
    const verdict = judgePaste('<b>Go On</b>', 'Go On');
    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) throw new Error('unreachable');
    expect(verdict.message).toContain('Paste refused');
    expect(verdict.message).toContain('<b>');
  });

  it('accepts a plain fragment and hands back the PLAIN flavour, never the HTML one', () => {
    const verdict = judgePaste('<html><body>Go On</body></html>', 'Go On');
    expect(verdict).toEqual({ accepted: true, text: 'Go On' });
  });

  it('accepts a paste with no HTML flavour at all', () => {
    expect(judgePaste('', 'Body Mass')).toEqual({ accepted: true, text: 'Body Mass' });
  });

  it('refuses a line break, because a copy string is one line', () => {
    const verdict = judgePaste('', 'one\ntwo');
    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) throw new Error('unreachable');
    expect(verdict.message).toContain('line break');
  });

  it('refuses a clipboard with no plain text rather than inserting nothing silently', () => {
    const verdict = judgePaste('', '');
    expect(verdict.accepted).toBe(false);
  });
});

describe('normaliseEditedText', () => {
  it('turns the no-break space contenteditable inserts back into a space', () => {
    // The first argument holds a literal U+00A0 NO-BREAK SPACE and the expectation an ordinary
    // U+0020. They are indistinguishable on screen, which is exactly why an edit that picked one
    // up from `contenteditable` has to be normalised before it reaches a table.
    expect(normaliseEditedText('Body Mass')).toBe('Body Mass');
  });

  it('collapses a stray break and trims, rather than discarding the edit', () => {
    expect(normaliseEditedText('  Body \n Mass  ')).toBe('Body Mass');
  });
});
