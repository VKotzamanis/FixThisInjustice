// src/app/topbar.test.ts
//
// The sticky top bar's contrast, per skin.
//
// ALPHA ROUND 1 DEFECT w1.03. appShell.css hard-coded `background: rgba(10, 11, 12, 0.92)`,
// which is the clinical skin's own --bg at 92 %. Nothing restated it per skin, so limelight
// inherited it: a near-black bar carrying --text #000000 and --text-2 #454545. The owner
// reported the bar as invisible and could "somehow" make out only the status line. Measured
// below: 1.19:1 for the brand and 1.84:1 for the status, against the 4.5:1 AA asks for.
//
// WHY THIS IS ARITHMETIC AND NOT A RENDER. vitest runs jsdom, which performs no layout and
// resolves no custom property, so getComputedStyle returns "var(--topbar-bg)" as a string.
// Reading the stylesheets and resolving the tokens tests the thing that actually broke, the
// values. The visual pass stays manual, in docs/phone-visual-check.md.
//
// ?raw rather than node:fs because tsconfig.app.json pins `types` to the vite client types,
// the convention src/domain/schedule/cursor.test.ts already uses.
import { describe, expect, it } from 'vitest';

import shellCss from './appShell.css?raw';
import indexHtml from '../../index.html?raw';
import { BRAND_SHORT } from './brand';
import tokensCss from '../ui/styles/tokens.css?raw';

type Rgb = readonly [number, number, number];

/** The sole shipped skin, by the selector that opens its token block. */
const SKIN_SELECTOR = {
  limelight: ":root[data-skin='limelight'] {",
} as const;

type SkinName = keyof typeof SKIN_SELECTOR;
const SKINS: readonly SkinName[] = ['limelight'];

/** The three tokens the bar reads. */
const TOPBAR_TOKENS = ['--topbar-bg', '--topbar-text', '--topbar-brand'] as const;

/** The declarations inside one token block, as a map. Nested blocks are not read. */
function tokenBlock(skin: SkinName): Map<string, string> {
  const selector = SKIN_SELECTOR[skin];
  const start = tokensCss.indexOf(selector);
  if (start === -1) throw new Error(`tokens.css: no block for ${skin}`);
  const end = tokensCss.indexOf('\n}', start);
  const body = tokensCss.slice(start + selector.length, end === -1 ? undefined : end);
  const out = new Map<string, string>();
  for (const line of body.split('\n')) {
    const m = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i.exec(line);
    const name = m?.[1];
    const value = m?.[2];
    if (name !== undefined && value !== undefined) out.set(name, value.trim());
  }
  return out;
}

/** Follows `var(--x)` indirection inside the skin, then the clinical root, to a literal. */
function resolve(name: string, skin: SkinName): string {
  const own = tokenBlock(skin);
  const root = tokenBlock('limelight');
  let value = own.get(name) ?? root.get(name);
  for (let hops = 0; hops < 8; hops += 1) {
    if (value === undefined || !value.startsWith('var(')) break;
    const inner = /var\((--[a-z0-9-]+)\)/i.exec(value)?.[1];
    if (inner === undefined) break;
    value = own.get(inner) ?? root.get(inner);
  }
  if (value === undefined) throw new Error(`${skin}: ${name} resolves to nothing`);
  return value;
}

/** One channel of a #rrggbb pair, 0-255. */
function hexPair(hex: string, index: number): number {
  const pair = hex.slice(index, index + 2);
  const value = Number.parseInt(pair, 16);
  if (!Number.isFinite(value)) throw new Error(`bad hex pair: ${pair}`);
  return value;
}

/** sRGB channels from #rgb, #rrggbb or rgba(). Alpha is composited over `under`. */
function channels(css: string, under: Rgb): Rgb {
  const text = css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)?.[1];
  if (hex !== undefined) {
    const full =
      hex.length === 3
        ? [...hex].map((c) => `${c}${c}`).join('')
        : hex;
    return [hexPair(full, 0), hexPair(full, 2), hexPair(full, 4)];
  }
  const inner = /^rgba?\(([^)]+)\)$/i.exec(text)?.[1];
  if (inner === undefined) throw new Error(`unparsed colour: ${css}`);
  const parts = inner.split(',').map((p) => Number(p.trim()));
  const [r, g, b, a] = parts;
  if (r === undefined || g === undefined || b === undefined) {
    throw new Error(`rgb() needs three channels: ${css}`);
  }
  const alpha = a ?? 1;
  // Composite over the surface behind it: a translucent bar is only as dark as what it sits on.
  const over = (c: number, u: number): number => c * alpha + u * (1 - alpha);
  return [over(r, under[0]), over(g, under[1]), over(b, under[2])];
}

/** WCAG 2.1 relative luminance. */
function luminance(rgb: Rgb): number {
  const lin = ([rgb[0], rgb[1], rgb[2]] as const).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
}

/** WCAG 2.1 contrast ratio, 1:1 to 21:1. */
function contrast(fg: Rgb, bg: Rgb): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2.1 SC 1.4.3, normal text. The bar is 11 px and 13 px, so AA is 4.5:1. */
const AA_NORMAL = 4.5;

/** The surface each skin's bar sits over, for compositing a translucent background. */
const GROUND: Record<SkinName, Rgb> = {
  limelight: [138, 206, 0], // --lime #8ace00
};

/** The .topbar rules, from the block's start to the next top-level rule. */
function topbarRules(): string {
  const start = shellCss.indexOf('.topbar {');
  const end = shellCss.indexOf('main {');
  if (start === -1 || end === -1) throw new Error('appShell.css: .topbar block not found');
  return shellCss.slice(start, end);
}

describe('the top bar carries its colour as a token, not a literal', () => {
  it('takes background, text and brand from custom properties', () => {
    const rule = topbarRules();
    expect(rule).toContain('background: var(--topbar-bg)');
    expect(rule).toContain('color: var(--topbar-text)');
    expect(rule).toContain('color: var(--topbar-brand)');
  });

  it('states no colour literal inside the .topbar rules', () => {
    // The defect was a literal. A hex or an rgb() here is the defect returning.
    const rule = topbarRules();
    expect(rule).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(rule).not.toMatch(/\brgba?\(/i);
  });

  it('defines all three tokens in every shipped skin', () => {
    for (const skin of SKINS) {
      for (const token of TOPBAR_TOKENS) {
        expect(() => resolve(token, skin), `${skin} ${token}`).not.toThrow();
      }
    }
  });
});

describe('the top bar clears WCAG AA in every shipped skin', () => {
  for (const skin of SKINS) {
    it(`${skin}: status text and brand both clear ${AA_NORMAL}:1`, () => {
      const bg = channels(resolve('--topbar-bg', skin), GROUND[skin]);
      for (const token of ['--topbar-text', '--topbar-brand'] as const) {
        const ratio = contrast(channels(resolve(token, skin), bg), bg);
        expect({ skin, token, pass: ratio >= AA_NORMAL }).toEqual({ skin, token, pass: true });
      }
    });
  }

  it('records the ratios the defect actually produced, so the regression stays legible', () => {
    // limelight, over lime, with the old hard-coded bar.
    const oldBar = channels('rgba(10, 11, 12, 0.92)', GROUND.limelight);
    const status = contrast(channels('#454545', oldBar), oldBar); // --text-2
    const brand = contrast(channels('#000000', oldBar), oldBar); // --text
    expect(Number(status.toFixed(2))).toBe(1.84);
    expect(Number(brand.toFixed(2))).toBe(1.19);
  });
});

/*
 * P4 brief 2.1 as amended by AM-4a-1 (the owner keeps the moving ticker): ONE 44 px row plus the
 * top inset holding brand, title and ticker. The title keeps its own width up to a cap and the
 * ticker takes the rest, so the title is never squeezed to a letter (F07); the ticker paints its
 * own ground and type from the bar's tokens (it rendered ink on black, F06 / D4).
 */
describe('one-line header with safe area (P4 brief 2.1, AM-4a-1; F04, F06, F07, F15)', () => {
  const rule = (selector: string): string => {
    const clean = shellCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const m = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((r) => (r[1] ?? '').trim() === selector);
    if (m === undefined) throw new Error(`appShell.css: no rule ${selector}`);
    return m[2] ?? '';
  };

  it('is 44 px plus the top inset, border included, with inset-aware side padding', () => {
    const b = rule('.topbar');
    expect(b).toMatch(/box-sizing:\s*border-box;/);
    expect(b).toMatch(/height:\s*calc\(var\(--header-h\) \+ env\(safe-area-inset-top\)\);/);
    expect(b).toMatch(/padding-top:\s*env\(safe-area-inset-top\);/);
    expect(b).toMatch(/padding-left:\s*max\(var\(--gutter\), env\(safe-area-inset-left\)\);/);
    expect(b).toMatch(/padding-right:\s*max\(var\(--gutter\), env\(safe-area-inset-right\)\);/);
    expect(b).toMatch(/z-index:\s*var\(--z-header\);/);
  });

  it('carries no backdrop blur (F15)', () => {
    expect(shellCss).not.toMatch(/backdrop-filter/);
  });

  it('keeps the title at its own width up to a cap, ellipsised, never squeezed (F07)', () => {
    const b = rule('.topbar-title');
    expect(b).toMatch(/flex:\s*0 0 auto;/);
    expect(b).toMatch(/max-width:\s*7rem;/);
    expect(b).toMatch(/text-overflow:\s*ellipsis;/);
    expect(b).toMatch(/font-size:\s*13px;/);
  });

  it('gives the ticker the rest of the row, in the bar colours (AM-4a-1, F06)', () => {
    const marquee = rule('.topbar .ll-marquee');
    expect(marquee).toMatch(/flex:\s*1 1 0;/);
    expect(marquee).toMatch(/min-width:\s*0;/);
    const strip = rule('.topbar .ll-marquee-strip');
    expect(strip).toMatch(/background:\s*var\(--topbar-bg\);/);
    expect(strip).toMatch(/color:\s*var\(--topbar-text\);/);
    // White on black: the pair the bar's own AA test above already measures.
    const bg = channels(resolve('--topbar-bg', 'limelight'), GROUND.limelight);
    expect(contrast(channels(resolve('--topbar-text', 'limelight'), bg), bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('main has no side gutter of its own (brief 2.3: one gutter, on .view)', () => {
    const phone = shellCss.slice(shellCss.indexOf('@media (max-width: 820px)'));
    expect(phone).toMatch(/main \{\s*padding:\s*var\(--space-4\) 0 calc\(var\(--tabbar-h\) \+ env\(safe-area-inset-bottom\) \+ var\(--space-4\)\);/);
  });
});

describe('compact brand below 400 px (ruling R-HDR)', () => {
  it("is index.html's apple-mobile-web-app-title, one source for the short name", () => {
    const m = /<meta name="apple-mobile-web-app-title" content="([^"]+)"/.exec(indexHtml);
    expect(m?.[1]).toBe(BRAND_SHORT);
  });

  it('swaps the full name for the short one under 400 px and keeps the full name readable', () => {
    const at = shellCss.indexOf('@media (max-width: 399.98px)');
    expect(at).toBeGreaterThan(-1);
    const block = shellCss.slice(at, shellCss.indexOf('\n}\n', at));
    expect(block).toMatch(/\.topbar \.brand-short \{\s*display:\s*inline;/);
    expect(block).toMatch(/\.topbar \.brand-full \{[^}]*clip-path:\s*inset\(50%\);/);
  });
});
