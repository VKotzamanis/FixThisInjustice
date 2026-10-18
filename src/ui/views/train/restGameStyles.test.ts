// src/ui/views/train/restGameStyles.test.ts
//
// The rest game's CSS guarantees (ROADMAP F1, docs/design/rest-games.md), asserted in the sheet's
// own text: jsdom performs no layout and evaluates no media query, the same reason
// src/ui/components/Marquee.test.tsx and src/app/topbar.test.ts read their sheets this way.
import { describe, expect, it } from 'vitest';
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

const GAME_SELECTOR = /\.rest-(game|word|loss)/;
const gameRules = rulesOf(trainCss).filter((rule) => GAME_SELECTOR.test(rule.selector));

/** [px per rem] The 16 px root the 44 px target rule in views.css is written against. */
const PX_PER_REM = 16;
/** [px] The minimum interactive target (views.css: min-height 2.75rem = 44 px). */
const TARGET_PX = 44;

function remOf(body: string, property: string): number | null {
  const m = new RegExp(`(?:^|;|\\s)${property}:\\s*([\\d.]+)rem`).exec(body);
  return m === null ? null : Number(m[1]);
}

describe('rest game styles (ROADMAP F1)', () => {
  it('has rules to check', () => {
    expect(gameRules.length).toBeGreaterThan(0);
  });

  it('stops every rest-game animation under prefers-reduced-motion', () => {
    const animated = gameRules
      .filter((rule) => /(^|;|\s)animation:\s*(?!none)/.test(rule.body))
      .map((rule) => rule.selector);
    expect(animated.length).toBeGreaterThan(0);

    const reduced = [...trainCss.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g)]
      .map((m) => blockAt(trainCss, m.index))
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

  it('makes every on-screen key at least 44 by 44 px', () => {
    const key = gameRules.find((rule) => rule.selector === '.view .rest-word-key');
    expect(key).toBeDefined();
    const body = key?.body ?? '';
    expect((remOf(body, 'min-width') ?? 0) * PX_PER_REM).toBeGreaterThanOrEqual(TARGET_PX);
    expect((remOf(body, 'min-height') ?? 0) * PX_PER_REM).toBeGreaterThanOrEqual(TARGET_PX);
  });

  it('gives the keyboard six fixed columns of at least 44 px, so it fits a 360 px phone', () => {
    const grid = gameRules.find((rule) => rule.selector === '.rest-word-keyboard');
    const m = /grid-template-columns:\s*repeat\((\d+),\s*minmax\(([\d.]+)rem/.exec(grid?.body ?? '');
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBe(6);
    expect(Number(m?.[2]) * PX_PER_REM).toBeGreaterThanOrEqual(TARGET_PX);
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
