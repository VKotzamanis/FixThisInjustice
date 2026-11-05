// src/ui/styles/cssHygiene.test.ts
//
// Stylesheet-wide guarantees, read from every sheet's text (jsdom computes no style):
//  - z-order comes from the one ladder in tokens.css (P4 design brief section 1, critique D11);
//  - no hex colour outside tokens.css (AGENTS rule 5; the 96 `var(--x, #hex)` fallbacks carried
//    retired clinical colours);
//  - no custom property is read that nothing declares (a dropped fallback must not leave a hole).
import { describe, expect, it } from 'vitest';
import tokensCss from './tokens.css?raw';

const ALL_SHEETS = import.meta.glob<string>('/src/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const declaredIn = (css: string): Set<string> =>
  new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1] ?? ''));
const TOKENS = declaredIn(tokensCss);

/** `var(--z-name)` or `calc(var(--z-name) + n)`; -1 is a local stacking order (Atlas foil). */
const LADDER_VALUE = /^(var\(--z-[a-z]+\)|calc\(var\(--z-[a-z]+\) [+-] \d\)|-1)$/;

describe('stylesheet hygiene (P4 design brief section 1, AGENTS rule 5)', () => {
  it('found the sheets', () => {
    expect(Object.keys(ALL_SHEETS).length).toBeGreaterThan(20);
  });

  it('sets every z-index from the --z-* ladder', () => {
    const literal = Object.entries(ALL_SHEETS).flatMap(([path, css]) =>
      [...stripComments(css).matchAll(/z-index:\s*([^;]+);/g)]
        .map((m) => (m[1] ?? '').trim())
        .filter((value) => !LADDER_VALUE.test(value))
        .map((value) => `${path}: ${value}`),
    );
    expect(literal).toEqual([]);
  });

  it('writes no hex colour outside tokens.css', () => {
    const hex = Object.entries(ALL_SHEETS)
      .filter(([path]) => !path.endsWith('/tokens.css'))
      .flatMap(([path, css]) =>
        [...stripComments(css).matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => `${path}: ${m[0]}`),
      );
    expect(hex).toEqual([]);
  });

  it('reads no custom property without a fallback that neither tokens.css nor the sheet declares', () => {
    const missing = Object.entries(ALL_SHEETS).flatMap(([path, css]) => {
      const local = declaredIn(css);
      return [...stripComments(css).matchAll(/var\((--[a-z0-9-]+)\)/gi)]
        .map((m) => m[1] ?? '')
        .filter((name) => !TOKENS.has(name) && !local.has(name))
        .map((name) => `${path}: ${name}`);
    });
    expect([...new Set(missing)]).toEqual([]);
  });
  it('sets no font size under 12 px (brief 3.1; .konami-art is aria-hidden ASCII art)', () => {
    const PX_PER_REM = 16; // [px/rem] the root size
    const small = Object.entries(ALL_SHEETS).flatMap(([path, css]) =>
      [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((rule) =>
        [...(rule[2] ?? '').matchAll(/font-size:\s*([0-9.]+)(px|rem)\b/g)]
          .filter((d) => Number(d[1]) * (d[2] === 'rem' ? PX_PER_REM : 1) < 12)
          .filter(() => !(rule[1] ?? '').includes('.konami-art'))
          .map((d) => `${path}: ${(rule[1] ?? '').trim()} ${d[0]}`),
      ),
    );
    expect(small).toEqual([]);
  });
});
