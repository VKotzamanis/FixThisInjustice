// The remaining pink-on-lime pairs (build brief 2026-10-18, art style; stylize survey item 2).
//
// tokens.css bans pink as type on the lime ground at every size (#FF5FCB on #8ACE00 = 1.41:1,
// round-three section 2.3). The pair is symmetric, so lime type on a pink fill is the same 1.41:1.
// WCAG 2.1 SC 1.4.3 asks 4.5:1 of text; SC 1.4.11 asks 3:1 of a control's boundary and of the
// mark that shows its state (focus included). jsdom resolves no custom property and computes no
// colour, so the ratios are computed here from the sheets' own text and the limelight token block,
// as src/app/topbar.test.ts does for the top bar.
import { describe, expect, it } from 'vitest';
import tokensCss from './tokens.css?raw';
import trainCss from './train.css?raw';
import phaseCss from '../components/phaseTransition.css?raw';
import capsuleCss from '../components/timeCapsule.css?raw';
import introCss from '../intro/intro.css?raw';
import motivationCss from '../motivation/motivation.css?raw';
import setupCss from '../setup/setup.css?raw';
import atlasCss from '../views/atlas.css?raw';
import viewsCss from '../views/views.css?raw';

/** Every stylesheet under src, by path, for the sweeps at the end. */
const ALL_SHEETS = import.meta.glob<string>('/src/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});

type Rgb = readonly [number, number, number];

interface Rule {
  selector: string;
  body: string;
}

/** Innermost `selector { body }` pairs, comments removed; an @media wrapper's rules are kept. */
function rulesOf(css: string): Rule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? '').trim().replace(/\s+/g, ' '),
    body: m[2] ?? '',
  }));
}

function ruleFor(css: string, selector: string): Rule {
  const rule = rulesOf(css).find((r) => r.selector === selector);
  if (rule === undefined) throw new Error(`no rule for ${selector}`);
  return rule;
}

/** The value of one property in a rule body, exactly that property (not `accent-color`). */
function valueOf(body: string, property: string): string | null {
  const m = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+);`).exec(body);
  return m === null ? null : (m[1] ?? '').trim().replace(/\s+/g, ' ');
}

/** The limelight token block of tokens.css, as a map. */
const TOKENS: ReadonlyMap<string, string> = (() => {
  const selector = ":root[data-skin='limelight'] {";
  const start = tokensCss.indexOf(selector);
  if (start === -1) throw new Error('tokens.css: no limelight block');
  const body = tokensCss.slice(start + selector.length, tokensCss.indexOf('\n}', start));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    if (m[1] !== undefined && m[2] !== undefined) out.set(m[1], m[2].trim());
  }
  return out;
})();

/** Follows `var(--x)` through the token block to a literal; throws on an undefined token. */
function resolve(token: string): string {
  let value = TOKENS.get(token);
  for (let hops = 0; hops < 8 && value?.startsWith('var(') === true; hops += 1) {
    const inner = /^var\((--[a-z0-9-]+)\)$/i.exec(value)?.[1];
    value = inner === undefined ? undefined : TOKENS.get(inner);
  }
  if (value === undefined) throw new Error(`${token} is not defined in the limelight block`);
  return value;
}

/** The token a declaration paints with: the first `var(--x)` in it (`2px solid var(--ink)`). */
function tokenIn(declaration: string): string {
  const token = /var\((--[a-z0-9-]+)/i.exec(declaration)?.[1];
  if (token === undefined) throw new Error(`no token in "${declaration}"`);
  return token;
}

/** sRGB channels of an opaque #rrggbb literal, 0-255. */
function rgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`not an opaque #rrggbb colour: ${hex}`);
  return [Number.parseInt(m[1] ?? '', 16), Number.parseInt(m[2] ?? '', 16), Number.parseInt(m[3] ?? '', 16)];
}

/** WCAG 2.1 relative luminance, 0 (black) to 1 (white). */
function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** WCAG 2.1 contrast ratio between two tokens, 1:1 to 21:1. */
function ratio(fgToken: string, bgToken: string): number {
  const a = luminance(rgb(resolve(fgToken)));
  const b = luminance(rgb(resolve(bgToken)));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** SC 1.4.3 normal text, and SC 1.4.11 non-text (boundaries, state marks, focus rings). */
const TEXT_MIN = 4.5;
const BOUNDARY_MIN = 3;

describe('the token arithmetic reproduces the ratios tokens.css quotes', () => {
  it.each([
    ['--pink', '--lime', 1.41],
    ['--ink', '--lime', 10.91],
    ['--ink', '--pink', 7.75],
    ['--pink', '--panel', 7.75],
  ])('%s on %s is %s:1', (fg, bg, quoted) => {
    expect(ratio(fg, bg)).toBeCloseTo(quoted, 2);
  });
});

/*
 * Text that was pink (or lime on a pink fill) and is ink now. `ground` is the surface the words
 * sit on: a token named here when the rule inherits its ground, or `own` when the rule paints the
 * fill itself, in which case the fill is read from the rule and must be the one stated.
 */
const TEXT_RULES: readonly {
  sheet: string;
  css: string;
  selector: string;
  ground: string;
  own?: true;
}[] = [
  // .phase, the card the cutscene art sits in, is --bg-2 (lime).
  { sheet: 'phaseTransition.css', css: phaseCss, selector: '.pt-art', ground: '--bg-2' },
  // Always rendered with .intro-highlight (IntroSequence.tsx), whose fill is --highlight-bg.
  { sheet: 'intro.css', css: introCss, selector: '.intro-heading', ground: '--highlight-bg' },
  { sheet: 'intro.css', css: introCss, selector: '.intro-highlight', ground: '--highlight-bg', own: true },
  { sheet: 'timeCapsule.css', css: capsuleCss, selector: '.capsule-seal', ground: '--accent', own: true },
  // A link inside the wizard, on its lime page or its lime modal (--bg-2).
  { sheet: 'setup.css', css: setupCss, selector: '.wiz .wiz-link', ground: '--bg-2' },
  { sheet: 'setup.css', css: setupCss, selector: '.wiz-mathml-term', ground: '--accent', own: true },
  // The text input's own fill, from `.wiz input[type='text']`.
  { sheet: 'setup.css', css: setupCss, selector: '.wiz input.wiz-name', ground: '--bg-2' },
  { sheet: 'setup.css', css: setupCss, selector: '.wiz-glyph:has(input:checked)', ground: '--accent', own: true },
  { sheet: 'setup.css', css: setupCss, selector: '.wiz-modal-close', ground: '--accent', own: true },
];

describe('text that was pink on lime, or lime on pink, clears 4.5:1', () => {
  it.each(TEXT_RULES.map((r) => [`${r.sheet} ${r.selector}`, r] as const))('%s', (_, r) => {
    const { body } = ruleFor(r.css, r.selector);
    const color = valueOf(body, 'color');
    expect(color, 'the rule names its text colour').not.toBeNull();
    if (r.own === true) expect(tokenIn(valueOf(body, 'background') ?? 'none')).toBe(r.ground);
    const fg = tokenIn(color ?? '');
    const measured = ratio(fg, r.ground);
    expect(measured, `${fg} on ${r.ground} = ${measured.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT_MIN);
  });
});

/*
 * Boundaries and state marks on the lime ground. `value` is the whole declaration, so the width
 * is pinned too: the colour changes, the box does not (a border width is layout).
 */
const BOUNDARY_RULES: readonly {
  sheet: string;
  css: string;
  selector: string;
  property: string;
  value: string;
}[] = [
  { sheet: 'views.css', css: viewsCss, selector: '.view button', property: 'border', value: '1px solid var(--line-2)' },
  {
    sheet: 'views.css',
    css: viewsCss,
    selector: '.view.plan .plan-session.is-next',
    property: 'border-left',
    value: '2px solid var(--line-2)',
  },
  { sheet: 'setup.css', css: setupCss, selector: '.wiz button', property: 'border', value: '1px solid var(--line-2)' },
  {
    sheet: 'setup.css',
    css: setupCss,
    selector: '.rq .rq-nav button',
    property: 'border',
    value: '1px solid var(--line-2)',
  },
  {
    sheet: 'setup.css',
    css: setupCss,
    selector: '.wiz-glyph:has(input:checked)',
    property: 'border-color',
    value: 'var(--line-2)',
  },
  {
    sheet: 'setup.css',
    css: setupCss,
    selector: '.wiz input.wiz-name',
    property: 'border',
    value: '2px solid var(--line-2)',
  },
  { sheet: 'timeCapsule.css', css: capsuleCss, selector: '.capsule-seal', property: 'border-color', value: 'var(--ink)' },
  // Focus rings: the state a keyboard user steers by. Outlines take no layout space.
  {
    sheet: 'setup.css',
    css: setupCss,
    selector: '.wiz .wiz-heading:focus-visible',
    property: 'outline',
    value: '2px solid var(--line-2)',
  },
  {
    sheet: 'setup.css',
    css: setupCss,
    selector: '.rq label.rq-answer:focus-within',
    property: 'outline',
    value: '2px solid var(--line-2)',
  },
  {
    sheet: 'setup.css',
    css: setupCss,
    selector: '.wiz-glyph:has(input:focus-visible)',
    property: 'outline',
    value: '3px solid var(--line-2)',
  },
  {
    sheet: 'setup.css',
    css: setupCss,
    selector: '.wiz-modal:focus-visible',
    property: 'outline',
    value: '2px solid var(--line-2)',
  },
  {
    sheet: 'motivation.css',
    css: motivationCss,
    selector: '.mmod:focus-visible',
    property: 'outline',
    value: '2px solid var(--line-2)',
  },
  {
    sheet: 'motivation.css',
    css: motivationCss,
    selector: '.mmod-video:focus-visible',
    property: 'outline',
    value: '2px solid var(--line-2)',
  },
  {
    sheet: 'motivation.css',
    css: motivationCss,
    selector: '.mmod-dismiss:focus-visible',
    property: 'outline',
    value: '2px solid var(--line-2)',
  },
  {
    sheet: 'train.css',
    css: trainCss,
    selector: '.vmod:focus-visible, .fcm:focus-visible',
    property: 'outline',
    value: '2px solid var(--line-2)',
  },
];

describe('control boundaries, state marks and focus rings on lime clear 3:1', () => {
  it.each(BOUNDARY_RULES.map((r) => [`${r.sheet} ${r.selector} ${r.property}`, r] as const))('%s', (_, r) => {
    const value = valueOf(ruleFor(r.css, r.selector).body, r.property);
    expect(value).toBe(r.value);
    expect(ratio(tokenIn(value ?? ''), '--lime')).toBeGreaterThanOrEqual(BOUNDARY_MIN);
  });

  it('an inset focus ring clears the 1 px edge it sits inside, so it reads as a second line', () => {
    // Offset -4 px with a 2 px ring leaves a 1 px lime gap inside the 1 px ink border; at -2 px
    // an ink ring would merge with the border and the focus change would be one pixel of width.
    for (const [css, selector] of [
      [setupCss, '.wiz-modal:focus-visible'],
      [motivationCss, '.mmod:focus-visible'],
      [trainCss, '.vmod:focus-visible, .fcm:focus-visible'],
    ] as const) {
      expect(valueOf(ruleFor(css, selector).body, 'outline-offset'), selector).toBe('-4px');
    }
  });

  it('keeps the brand where it is decoration: the name box carries the pink offset block', () => {
    // A shadow takes no layout space; the ink border is the boundary, the pink is the fun r2.11
    // asked for.
    const { body } = ruleFor(setupCss, '.wiz input.wiz-name');
    expect(valueOf(body, 'box-shadow')).toBe(
      'var(--shadow-offset, 4px) var(--shadow-offset, 4px) 0 var(--pink)',
    );
  });
});

/*
 * The sweeps: every sheet under src, so a new rule cannot bring the pair back unseen. Each
 * allowed pink-type rule names the surface that makes it legal.
 */
const PINK = /var\(--(accent|accent-d|pink)\b/;

const PINK_TYPE_ALLOWED: ReadonlyMap<string, string> = new Map([
  ['.topbar .brand .acc', 'the black top bar, --topbar-bg, 7.75:1'],
  [":root[data-skin='limelight'] .ll-panel .ll-panel-state", 'the black panel, 7.75:1'],
  ['.rest-loss-chomp', 'inside .rest-game, which is --panel (black), 7.75:1'],
  // OPEN, for the owner: r2.12(iv) asked for fuchsia on this heading; it sits on the white
  // --highlight-bg, where pink measures 2.71:1 (computed below), under the 4.5:1 SC 1.4.3 asks.
  ['.wiz-modal-hrt', 'owner ruling r2.12(iv), on --highlight-bg; open'],
]);

describe('sweep: no other stylesheet in src sets pink type', () => {
  it('pink `color` appears only in the listed rules', () => {
    const found: string[] = [];
    for (const [path, css] of Object.entries(ALL_SHEETS)) {
      for (const rule of rulesOf(css)) {
        if (PINK.test(valueOf(rule.body, 'color') ?? '') && !PINK_TYPE_ALLOWED.has(rule.selector)) {
          found.push(`${path} ${rule.selector}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('records the open heading at its measured ratio rather than passing it', () => {
    expect(Number(ratio('--pink', '--highlight-bg').toFixed(2))).toBe(2.71);
  });

  it('every rule that paints a pink fill and names its type colour clears 4.5:1 on it', () => {
    const failing: string[] = [];
    for (const [path, css] of Object.entries(ALL_SHEETS)) {
      for (const rule of rulesOf(css)) {
        const fill = valueOf(rule.body, 'background') ?? valueOf(rule.body, 'background-color');
        const color = valueOf(rule.body, 'color');
        if (fill === null || color === null || !PINK.test(fill) || !/var\(--/.test(color)) continue;
        const r = ratio(tokenIn(color), '--pink');
        if (r < TEXT_MIN) failing.push(`${path} ${rule.selector} ${color} ${r.toFixed(2)}:1`);
      }
    }
    expect(failing).toEqual([]);
  });

  it('no stylesheet reads the undefined --bad or --line-1 tokens', () => {
    // Neither is defined in tokens.css, so every use painted its hex fallback (#f87171, #1c2227).
    const found = Object.entries(ALL_SHEETS)
      .filter(([, css]) => /var\(--(bad|line-1)\b/.test(css))
      .map(([path]) => path);
    expect(found).toEqual([]);
  });

  it('the cutscene rows take the defined line token in place of --line-1', () => {
    const value = valueOf(ruleFor(phaseCss, '.pt-row').body, 'border-bottom');
    expect(value).toBe('1px solid var(--line)');
    expect(TOKENS.has('--line')).toBe(true);
  });

  it('atlas.css sets no pink type: its pink is fills, rules and focus rings on the black face', () => {
    expect(rulesOf(atlasCss).filter((r) => PINK.test(valueOf(r.body, 'color') ?? ''))).toEqual([]);
  });
});
