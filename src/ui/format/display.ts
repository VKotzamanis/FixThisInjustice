// src/ui/format/display.ts
//
// Which headings take the brat display cut (stylize survey 2026-10-18, item 1).
//
// `.ll-display` (src/ui/styles/tokens.css) is limelight's signature line: Archivo at the 62 %
// width, weight 800, tight tracking, ink, and a hard pink offset shadow. The same sheet states
// the one exclusion: never on a numeral. A quantity is never blurred, faded or doubled by a
// shadow (round-three section 2.5), and a heading such as a session name ("Push 1"), a dated
// heading or "the next 14 dates" carries one. CSS cannot see a digit in a text node, so the test
// is made here, on the string the heading will actually render, and every heading asks the same
// predicate rather than each call site deciding by eye which of its strings might hold a number.

/** The class tokens.css defines for the display line. */
export const DISPLAY_CLASS = 'll-display';

/**
 * Any Unicode number character: ASCII and other-script digits, Roman numerals, fractions. The
 * rule protects quantities, and a quantity written in another script is still a quantity.
 */
const NUMERAL = /\p{N}/u;

/**
 * The class list for a heading: `base` plus the display class, unless `text` holds a numeral.
 *
 * Returns undefined when there is neither a base nor the display class, so a bare `<h2>` keeps
 * no empty class attribute.
 *
 * @param text the exact string the heading renders (after the skin's copy has been applied)
 * @param base the heading's own classes, if any
 */
export function displayClass(text: string, base?: string): string | undefined {
  const own = base === undefined || base === '' ? [] : [base];
  const classes = NUMERAL.test(text) ? own : [...own, DISPLAY_CLASS];
  return classes.length === 0 ? undefined : classes.join(' ');
}
