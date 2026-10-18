// The pink-type sweep and the pink sticker states (stylize survey 2026-10-18, items 2 and 9).
//
// tokens.css bans pink as type on the lime ground at every size (#FF5FCB on #8ACE00 = 1.41:1,
// round-three section 2.3) and allows it as a FILL under ink (7.75:1) or as type inside the black
// panel (7.75:1). jsdom resolves no custom property and computes no colour, so these guarantees
// are asserted in the sheets' own text, the way src/app/topbar.test.ts and
// src/ui/views/train/restGameStyles.test.ts already do.
import { describe, expect, it } from 'vitest';
import shellCss from '../../app/appShell.css?raw';
import toastCss from '../components/toastQueue.css?raw';
import motivationCss from '../motivation/motivation.css?raw';
import viewsCss from '../views/views.css?raw';
import trainCss from './train.css?raw';

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

/** The value of one property in a rule body, exactly that property (not `accent-color`). */
function valueOf(body: string, property: string): string | null {
  const m = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+);`).exec(body);
  return m === null ? null : (m[1] ?? '').trim();
}

const PINK = /var\(--(accent|accent-d|pink)\b/;

/** Every rule whose TEXT colour is pink. */
function pinkTextRules(css: string): string[] {
  return rulesOf(css)
    .filter((rule) => PINK.test(valueOf(rule.body, 'color') ?? ''))
    .map((rule) => rule.selector);
}

function ruleFor(css: string, selector: string): Rule {
  const rule = rulesOf(css).find((r) => r.selector === selector);
  if (rule === undefined) throw new Error(`no rule for ${selector}`);
  return rule;
}

describe('pink is never type on lime in the swept sheets', () => {
  it('views.css, toastQueue.css and motivation.css set no pink text at all', () => {
    expect(pinkTextRules(viewsCss)).toEqual([]);
    expect(pinkTextRules(toastCss)).toEqual([]);
    expect(pinkTextRules(motivationCss)).toEqual([]);
  });

  it('appShell.css keeps pink type only on the black top bar', () => {
    // --topbar-bg is #000000 (tokens.css), where pink measures 7.75:1.
    expect(pinkTextRules(shellCss)).toEqual(['.topbar .brand .acc']);
  });

  it('train.css: the three listed rules on the lime ground carry ink, not pink', () => {
    for (const selector of ['.vmod-link', '.train-deload', '.set-row.bonus .set-marker']) {
      expect({ selector, pink: PINK.test(valueOf(ruleFor(trainCss, selector).body, 'color') ?? '') }).toEqual({
        selector,
        pink: false,
      });
    }
  });
});

describe('pink sticker states: a pink fill with ink type and an ink border', () => {
  const STICKERS: readonly [string, string][] = [
    ['active nav tab', ".viewnav button[aria-current='true']"],
    ['current plan chip', ".view.plan .plan-chip[data-current='true']"],
  ];

  it.each(STICKERS)('%s', (_, selector) => {
    const css = selector.startsWith('.viewnav') ? shellCss : viewsCss;
    const { body } = ruleFor(css, selector);
    expect(valueOf(body, 'background')).toBe('var(--accent)');
    expect(valueOf(body, 'color')).toBe('var(--ink)');
    expect(valueOf(body, 'border')).toBe('2px solid var(--ink)');
  });

  it('marks the block on screen by shape, not by a black fill that hid its ink type', () => {
    const { body } = ruleFor(viewsCss, ".view.plan .plan-chip[aria-pressed='true']");
    expect(valueOf(body, 'background')).toBeNull();
    expect(valueOf(body, 'box-shadow')).toMatch(/^inset .*var\(--ink\)$/);
  });
});

describe('no undefined token in the swept sheets', () => {
  it('neither views.css nor appShell.css reads --bad or --line-1', () => {
    // Neither token is defined in tokens.css; every use rendered its hex fallback, an unmeasured
    // red (#f87171) on lime among them. State is ink in this skin (--danger), lines are --line.
    for (const css of [viewsCss, shellCss]) {
      expect(css).not.toMatch(/var\(--bad\b/);
      expect(css).not.toMatch(/var\(--line-1\b/);
    }
  });
});
