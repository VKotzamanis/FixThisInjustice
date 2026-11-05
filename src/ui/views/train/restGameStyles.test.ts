// src/ui/views/train/restGameStyles.test.ts
//
// The rest games' CSS guarantees (ROADMAP F1, P6, docs/design/rest-games.md), asserted in the
// sheet's own text: jsdom performs no layout and evaluates no media query, the same reason
// src/ui/components/Marquee.test.tsx and src/app/topbar.test.ts read their sheets this way.
// Every rest-game rule lives in restGames.css (P6 Task 1), so every rule of that file is checked.
import { describe, expect, it } from 'vitest';
import gamesCss from '../../styles/restGames.css?raw';
import trainCss from '../../styles/train.css?raw';

interface Rule {
  selector: string;
  body: string;
}

/** Innermost `selector { body }` pairs; an @media wrapper is dropped, its rules are kept. */
function rulesOf(css: string): Rule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? '').trim(),
    body: m[2] ?? '',
  }));
}

/** The text of the block opened by `at`, up to its matching closing brace. */
function blockAt(css: string, at: number): string {
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, i);
  }
  return '';
}

/** Any class a rest-game rule names. train.css must hold none of them after the move. */
const GAME_SELECTOR = /\.rest-(game|word|loss|sheet|picker|plate|react|seq|anagram)/;
const gameRules = rulesOf(gamesCss);

/** [px per rem] The 16 px root the 44 px target rule in views.css is written against. */
const PX_PER_REM = 16;
/** [px] The minimum interactive height (views.css: min-height 2.75rem = 44 px). */
const TARGET_PX = 44;

function remOf(body: string, property: string): number | null {
  const m = new RegExp(`(?:^|;|\\s)${property}:\\s*([\\d.]+)rem`).exec(body);
  return m === null ? null : Number(m[1]);
}

describe('rest game styles (ROADMAP F1)', () => {
  it('has rules to check', () => {
    expect(gameRules.length).toBeGreaterThan(0);
  });

  it('keeps every rest-game rule out of train.css', () => {
    const left = rulesOf(trainCss)
      .filter((rule) => GAME_SELECTOR.test(rule.selector))
      .map((rule) => rule.selector);
    expect(left).toEqual([]);
  });

  it('stops every rest-game animation under prefers-reduced-motion', () => {
    const animated = gameRules
      .filter((rule) => /(^|;|\s)animation:\s*(?!none)/.test(rule.body))
      .map((rule) => rule.selector);
    expect(animated.length).toBeGreaterThan(0);

    const reduced = [...gamesCss.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g)]
      .map((m) => blockAt(gamesCss, m.index))
      .join('\n');
    const stopped = rulesOf(reduced)
      .filter((rule) => /animation:\s*none/.test(rule.body))
      .flatMap((rule) => rule.selector.split(',').map((s) => s.trim()));
    for (const selectorList of animated) {
      for (const selector of selectorList.split(',').map((s) => s.trim())) {
        expect({ selector, stopped: stopped.includes(selector) }).toEqual({ selector, stopped: true });
      }
    }
  });

  /** [px] .rest-sheet padding-left and padding-right without a safe-area inset (Task 9 asserts it). */
  const SHEET_SIDE_PADDING_PX = 12;
  /** [px] WCAG 2.2 SC 2.5.8 (Level AA) minimum target, "at least 24 by 24 CSS pixels". */
  const MIN_TARGET_PX = 24;

  it('makes every on-screen key 44 px tall and lets the grid set its width', () => {
    const key = gameRules.find((rule) => rule.selector === '.view .rest-word-key');
    expect(key).toBeDefined();
    const body = key?.body ?? '';
    expect((remOf(body, 'min-height') ?? 0) * PX_PER_REM).toBeGreaterThanOrEqual(TARGET_PX);
    expect(body).toMatch(/min-width:\s*0;/);
  });

  it('lays QWERTY on 20 half-columns whose key is at least 24 px wide from 320 to 412 px', () => {
    const grid = gameRules.find((rule) => rule.selector === '.rest-word-keyboard');
    const body = grid?.body ?? '';
    expect(body).toMatch(/grid-template-columns:\s*repeat\(20,\s*minmax\(0,\s*1fr\)\)/);
    const gapPx = (remOf(body, 'column-gap') ?? Number.NaN) * PX_PER_REM; // [px]
    expect(gapPx).toBe(4);
    for (const viewport of [320, 360, 390, 412]) {
      const width = viewport - 2 * SHEET_SIDE_PADDING_PX; // [px] keyboard width
      const half = (width - 19 * gapPx) / 20; // [px] one half-column
      const keyPx = 2 * half + gapPx; // [px] a letter spans two half-columns and the gap between
      expect({ viewport, ok: keyPx >= MIN_TARGET_PX }).toEqual({ viewport, ok: true });
    }
  });

  it('sizes the tiles so Rest Word fills, and does not overflow, a 472 px sheet at 390 x 664', () => {
    const tile = gameRules.find((rule) => rule.selector === '.rest-word-tile');
    expect(tile?.body).toMatch(/width:\s*clamp\(1\.5rem,\s*calc\(\(100svh - 29\.75rem\) \/ 6\),\s*2\.125rem\)/);
    const viewportH = 664; // [px] iPhone 13 Safari with its bars
    const sheetH = viewportH - 12 * PX_PER_REM; // [px] 100svh - 12rem
    const chrome = 16.5 * PX_PER_REM; // [px] everything but the six tile rows
    const gaps = 5 * 4; // [px] five 0.25rem row gaps
    const tilePx = Math.min(34, Math.max(24, (viewportH - 29.75 * PX_PER_REM) / 6)); // [px]
    expect(sheetH).toBe(472);
    expect(chrome + gaps + 6 * tilePx).toBeLessThanOrEqual(sheetH + 0.01);
  });

  it('has no hover-only control: no rest-game rule depends on :hover', () => {
    expect(gameRules.filter((rule) => rule.selector.includes(':hover'))).toEqual([]);
  });

  it('colours only through tokens: no hex, rgb or hsl literal in a rest-game rule', () => {
    const literal = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i;
    const offenders = gameRules.filter((rule) => literal.test(rule.body)).map((r) => r.selector);
    expect(offenders).toEqual([]);
  });
});

describe('the game sheet (P6, R10, audit C14)', () => {
  const sheet = gameRules.find((rule) => rule.selector === '.rest-sheet')?.body ?? '';

  it('is fixed to the bottom edge, out of the page flow', () => {
    expect(sheet).toMatch(/position:\s*fixed;/);
    expect(sheet).toMatch(/(^|;|\s)bottom:\s*0;/);
    expect(sheet).toMatch(/(^|;|\s)left:\s*0;/);
    expect(sheet).toMatch(/(^|;|\s)right:\s*0;/);
  });

  it('caps its height at 100svh - 12rem, border-box, with a vh fallback first', () => {
    expect(sheet).toMatch(/max-height:\s*calc\(100vh - 12rem\);[\s\S]*max-height:\s*calc\(100svh - 12rem\);/);
    expect(sheet).toMatch(/box-sizing:\s*border-box;/);
    expect(sheet).toMatch(/overflow-y:\s*auto;/);
  });

  it('keeps the 12 px side padding the QWERTY arithmetic uses, plus every safe-area inset', () => {
    expect(sheet).toMatch(/padding-left:\s*calc\(0\.75rem \+ env\(safe-area-inset-left\)\);/);
    expect(sheet).toMatch(/padding-right:\s*calc\(0\.75rem \+ env\(safe-area-inset-right\)\);/);
    expect(sheet).toMatch(/padding-bottom:\s*calc\(0\.5rem \+ env\(safe-area-inset-bottom\)\);/);
    expect(0.75 * PX_PER_REM).toBe(12); // [px] SHEET_SIDE_PADDING_PX in the keyboard case
  });

  it('pads the Train page under an open or a minimised sheet', () => {
    const open = gameRules.find((rule) => rule.selector === 'body.rest-sheet-open .view.train');
    const min = gameRules.find((rule) => rule.selector === 'body.rest-sheet-min .view.train');
    expect(open?.body).toMatch(/padding-bottom:\s*calc\(min\(100svh - 12rem, 30rem\) \+ 1rem\);/);
    expect(min?.body).toMatch(/padding-bottom:/);
  });
});
