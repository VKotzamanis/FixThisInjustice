/**
 * The skin token blocks, asserted against the stylesheet's own text.
 *
 * `?raw` rather than node:fs because tsconfig.app.json pins `types` to the vite client, which is
 * the pattern the other source-reading suites here use (src/domain/schedule/cursor.test.ts). It
 * also sidesteps vitest's CSS stubbing: no test asserts a computed style, and none can, because
 * jsdom does not resolve custom properties through an attribute selector.
 */
import { describe, expect, it } from 'vitest';
import tokens from '../ui/styles/tokens.css?raw';

/**
 * The custom properties the sheet declares on the bare `:root`. Derived from the text rather
 * than hard-coded, so a token added to the clinical set fails this suite until both skins give
 * it a value. That failure is the point: an un-overridden token is CRT green leaking into a
 * lime page.
 */
function tokensIn(selector: string): readonly string[] {
  const start = tokens.indexOf(`${selector} {`);
  expect({ selector, found: start >= 0 }).toEqual({ selector, found: true });
  const end = tokens.indexOf('}', start);
  const block = tokens.slice(start, end);
  return [...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1] ?? '');
}

const BASE = tokensIn(':root');
const LIMELIGHT = tokensIn(":root[data-skin='limelight']");
const BOARD = tokensIn(":root[data-skin='board']");

describe('the skin attribute blocks', () => {
  it('carries the clinical set on the bare :root, so a missing attribute is clinical', () => {
    expect(BASE).toContain('--bg');
    expect(BASE).toContain('--accent-rgb');
    // 22 through P8; 25 from alpha round 1 Task 2, which added the three --topbar-* tokens
    // after the w1.03 defect showed a hard-coded bar colour surviving into every skin; 28 from
    // alpha round 2, which added --field-invalid-bg, --field-invalid-text and --highlight-bg for
    // r2.16's white-fill-and-red-border mark and r2.12(iv)'s white highlight. Both are colours a
    // component stylesheet would otherwise have had to write as a literal.
    //
    // 34 from round 2 Brief I, which added the feasibility calendar's three measured band fills
    // plus --band-ink, and the surface pair --band-surface / --band-surface-text that decides
    // WHICH GROUND those fills are drawn on. The surface pair is the one that actually varies by
    // skin: all three pastels measure 1.0 to 1.4:1 against limelight's lime --bg, below WCAG
    // 1.4.11's 3:1 non-text floor, so on that skin they render on the inverted panel instead.
    expect(BASE).toContain('--topbar-bg');
    expect(BASE).toContain('--field-invalid-bg');
    expect(BASE).toContain('--highlight-bg');
    expect(BASE).toContain('--band-realistic');
    expect(BASE).toContain('--band-surface');
    expect(BASE.length).toBe(34);
    expect(tokens).toContain('--accent: #a3e635');
  });

  it('declares both attribute-scoped blocks', () => {
    expect(tokens).toContain(":root[data-skin='limelight'] {");
    expect(tokens).toContain(":root[data-skin='board'] {");
  });

  it('gives every clinical token a value in both skins', () => {
    for (const token of BASE) {
      expect({ token, limelight: LIMELIGHT.includes(token) }).toEqual({ token, limelight: true });
      expect({ token, board: BOARD.includes(token) }).toEqual({ token, board: true });
    }
  });

  it('uses the ground and accent the round-three contrast table decided', () => {
    // Round-three section 2.3: black on lime is 10.91:1; pink on lime is 1.41:1 and is a fill only.
    expect(tokens).toContain('--lime: #8ace00');
    expect(tokens).toContain('--ink: #000000');
    expect(tokens).toContain('--pink: #ff5fcb');
    expect(tokens).toContain('--text: var(--ink)');
    expect(tokens).toContain('--accent: var(--pink)');
  });

  it('never makes pink a text colour outside a black panel', () => {
    // The rule has no size exception (round three section 2.3): pink is type only inside an
    // inverted panel, which is the one declaration allowed to set `color` from --pink.
    const fromPink = [...tokens.matchAll(/(^|\n)\s*(--text[a-z0-9-]*|color)\s*:\s*([^;]+);/g)]
      .filter((match) => /(--pink|#ff5fcb)/i.test(match[3] ?? ''))
      .map((match) => (match[0] ?? '').trim());
    expect(fromPink).toEqual(['color: var(--pink);']);
  });

  it('names the faces the fontsource packages provide', () => {
    expect(tokens).toContain("'Archivo Variable'");
    expect(tokens).toContain("'Space Mono'");
    expect(tokens).toContain("'DM Mono'");
    expect(tokens).toContain('--bg: #141517');
    expect(tokens).toContain('--accent: var(--amber)');
  });

  it('carries the display, marquee and stamp tokens the limelight skin needs', () => {
    for (const token of [
      '--display-stretch',
      '--display-weight',
      '--display-tracking',
      '--shadow-offset',
    ]) {
      expect({ token, present: LIMELIGHT.includes(token) }).toEqual({ token, present: true });
    }
    expect(tokens).toContain(".ll-panel");
    expect(tokens).toContain(".ll-display");
  });
});
