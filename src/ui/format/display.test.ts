// The brat display cut (stylize survey 2026-10-18, item 1) goes on headings, never on a numeral:
// tokens.css (the .ll-display rule) and round-three section 2.5 keep every quantity free of the
// offset shadow. One predicate decides it for every heading, so no call site re-implements it.
import { describe, expect, it } from 'vitest';
import { FORMAT } from '../../content/copy';
import { DISPLAY_CLASS, displayClass } from './display';

describe('displayClass', () => {
  it('puts the display cut on a heading made of words', () => {
    expect(displayClass('the archive')).toBe(DISPLAY_CLASS);
    expect(displayClass('day off, apparently.', 'hero-name')).toBe(`hero-name ${DISPLAY_CLASS}`);
  });

  it('withholds it from any heading that carries a numeral', () => {
    expect(displayClass('the next 14 dates')).toBeUndefined();
    expect(displayClass('Push 1', 'hero-name')).toBe('hero-name');
    expect(displayClass(FORMAT.pausedSince('2026-03-02'), 'hero-name')).toBe('hero-name');
    expect(displayClass('A 1RM is an estimate, not a measurement', 'toast-title')).toBe('toast-title');
  });

  it('counts digits from any script as numerals, not only ASCII', () => {
    expect(displayClass('week ٣')).toBeUndefined(); // ARABIC-INDIC DIGIT THREE
    expect(displayClass('round Ⅲ')).toBeUndefined(); // ROMAN NUMERAL THREE
  });
});
