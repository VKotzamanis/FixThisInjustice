// src/ui/styles/safeArea.test.ts
//
// Safe-area guard. index.html sets viewport-fit=cover, so on a notched phone the page draws under
// the status bar and the home indicator, and every layer pinned to a screen edge must keep its
// content out of the inset itself. Read from every sheet's text (jsdom computes no style):
//  - a rule declaring `position: fixed` or `sticky` that anchors an edge (`top`, `bottom`, `inset`)
//    names that edge's inset, either directly as `env(safe-area-inset-top|bottom)` or through a
//    token whose tokens.css definition contains it (e.g. --dock-bottom). The token list is derived
//    from tokens.css (AGENTS rule 2), so --header-h, which excludes the inset, does not count;
//  - or the rule is in ALLOWED below with a one-line reason.
import { describe, expect, it } from 'vitest';
import tokensCss from './tokens.css?raw';
import indexHtml from '../../../index.html?raw';

const ALL_SHEETS = import.meta.glob<string>('/src/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});

type Edge = 'top' | 'bottom';

/** `<sheet path> <selector>` -> why this pinned layer needs no inset of its own. */
const ALLOWED: Record<string, string> = {
  '/src/ui/styles/crt.css .crt.sc::before': 'decorative scanlines, no content, pointer-events: none',
  '/src/ui/styles/crt.css .crt.sc::after': 'decorative vignette, no content, pointer-events: none',
  '/src/ui/overlay/sheet.css .overlay-scrim':
    'full-screen scrim; its .sheet pads env(safe-area-inset-bottom) and subtracts the top inset from its max-height',
};

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Innermost `selector { declarations }` blocks; an @media wrapper's own brace is skipped. */
function rules(css: string): { selector: string; body: string }[] {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? '').trim().replace(/\s+/g, ' '),
    body: m[2] ?? '',
  }));
}

/** Tokens whose tokens.css definition already carries the edge's inset. */
function insetTokens(edge: Edge): string[] {
  const env = `env(safe-area-inset-${edge})`;
  return [...stripComments(tokensCss).matchAll(/(--[a-z0-9-]+)\s*:([^;]+);/gi)]
    .filter((m) => (m[2] ?? '').includes(env))
    .map((m) => m[1] ?? '');
}

const anchors = (body: string, edge: Edge): boolean =>
  new RegExp(`(^|[;\\s])(${edge}|inset|inset-block)\\s*:`).test(body);

function namesInset(body: string, edge: Edge): boolean {
  if (body.includes(`env(safe-area-inset-${edge})`)) return true;
  return insetTokens(edge).some((t) => body.includes(`var(${t})`));
}

function pinnedRules(): { key: string; body: string }[] {
  return Object.entries(ALL_SHEETS).flatMap(([path, css]) =>
    rules(css)
      .filter((r) => /position:\s*(fixed|sticky)\s*;/.test(r.body))
      .map((r) => ({ key: `${path} ${r.selector}`, body: r.body })),
  );
}

describe('safe-area insets on edge-pinned layers (viewport-fit=cover)', () => {
  it('index.html still asks for viewport-fit=cover, the reason this guard exists', () => {
    expect(indexHtml).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*"/);
  });

  it('derives at least one bottom inset token from tokens.css (--dock-bottom)', () => {
    expect(insetTokens('bottom')).toContain('--dock-bottom');
  });

  it('found the pinned layers', () => {
    expect(pinnedRules().length).toBeGreaterThan(10);
  });

  it('every fixed or sticky rule that anchors an edge names that edge inset, or is allowlisted', () => {
    const gaps = pinnedRules()
      .filter((r) => !(r.key in ALLOWED))
      .flatMap((r) =>
        (['top', 'bottom'] as const)
          .filter((edge) => anchors(r.body, edge) && !namesInset(r.body, edge))
          .map((edge) => `${r.key}: anchors ${edge} without env(safe-area-inset-${edge})`),
      );
    expect(gaps).toEqual([]);
  });

  it('allowlists only rules that exist and are pinned', () => {
    const pinned = new Set(pinnedRules().map((r) => r.key));
    expect(Object.keys(ALLOWED).filter((k) => !pinned.has(k))).toEqual([]);
  });
});
