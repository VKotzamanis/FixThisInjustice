import { describe, expect, it } from 'vitest';
import tokens from '../ui/styles/tokens.css?raw';

function blockFor(selector: string): string {
  const start = tokens.indexOf(`${selector} {`);
  expect({ selector, found: start >= 0 }).toEqual({ selector, found: true });
  const end = tokens.indexOf('\n}', start);
  return tokens.slice(start, end);
}

function declarationsIn(block: string): readonly string[] {
  return [...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1] ?? '');
}

const BASE_BLOCK = blockFor(':root');
const LIMELIGHT_BLOCK = blockFor(":root[data-skin='limelight']");
const LIMELIGHT_TOKENS = new Set([
  ...declarationsIn(BASE_BLOCK),
  ...declarationsIn(LIMELIGHT_BLOCK),
]);

describe('the limelight token contract', () => {
  it('uses the ground and accent the round-three contrast table decided', () => {
    expect(tokens).toContain('--lime: #8ace00');
    expect(tokens).toContain('--ink: #000000');
    expect(tokens).toContain('--pink: #ff5fcb');
    expect(tokens).toContain('--text: var(--ink)');
    expect(tokens).toContain('--accent: var(--pink)');
  });

  it('never makes pink a text colour outside a black panel', () => {
    const fromPink = [...tokens.matchAll(/(^|\n)\s*(--text[a-z0-9-]*|color)\s*:\s*([^;]+);/g)]
      .filter((match) => /(--pink|#ff5fcb)/i.test(match[3] ?? ''))
      .map((match) => (match[0] ?? '').trim());
    expect(fromPink).toEqual(['color: var(--pink);']);
  });

  it('names the face the remaining fontsource package provides', () => {
    expect(tokens).toContain("'Archivo Variable'");
    expect(tokens).not.toContain("'Space Mono'");
    expect(tokens).not.toContain("'DM Mono'");
    expect(tokens).not.toContain("'JetBrains Mono Variable'");
    expect(tokens).not.toContain("'Geist Variable'");
  });

  it('carries the display, marquee and stamp tokens the limelight skin needs', () => {
    for (const token of [
      '--display-stretch',
      '--display-weight',
      '--display-tracking',
      '--shadow-offset',
    ]) {
      expect({ token, present: LIMELIGHT_TOKENS.has(token) }).toEqual({ token, present: true });
    }
    expect(tokens).toContain('.ll-panel');
    expect(tokens).toContain('.ll-display');
  });

  it('paints the same values from the bare :root block as from the limelight block', () => {
    // The bare block is what renders before useApplySkin() writes data-skin, so it restates the
    // limelight values. Two copies of one fact, held together here (AGENTS.md rule 2): every
    // token the bare block declares must carry the identical value in the limelight block.
    const valuesIn = (block: string): Record<string, string> =>
      Object.fromEntries(
        [...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)].map((match) => [
          match[1] ?? '',
          (match[2] ?? '').trim(),
        ]),
      );
    const base = valuesIn(BASE_BLOCK);
    const limelight = valuesIn(LIMELIGHT_BLOCK);
    expect(Object.keys(base).length).toBeGreaterThan(30);
    const disagree = Object.keys(base).filter((token) => limelight[token] !== base[token]);
    expect(disagree).toEqual([]);
  });

  it('gives every token used in CSS a limelight value', () => {
    const used = new Set(
      [...tokens.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1] ?? ''),
    );
    const missing = [...used].filter((token) => !LIMELIGHT_TOKENS.has(token)).sort();
    expect(missing).toEqual([]);
  });
});
