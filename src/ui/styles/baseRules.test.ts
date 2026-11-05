// src/ui/styles/baseRules.test.ts
//
// The base-rule contract (P4 design brief 3.1, 3.3; audit F06, F10, F15), read from the sheets'
// text because jsdom computes no style. Layout-dependent acceptances (computed sizes, contrast)
// are in e2e/p4a-sweeps.spec.ts.
import { describe, expect, it } from 'vitest';
import tokensCss from './tokens.css?raw';
import viewsCss from '../views/views.css?raw';

interface Rule {
  selector: string;
  body: string;
}

function rulesOf(css: string): Rule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? '').trim().replace(/\s+/g, ' '),
    body: m[2] ?? '',
  }));
}

const VIEW_RULES = rulesOf(viewsCss);
const body = (selector: string): string => {
  const rule = VIEW_RULES.find((r) => r.selector === selector);
  if (rule === undefined) throw new Error(`views.css: no rule ${selector}`);
  return rule.body;
};

describe('base element rules weigh nothing (F06)', () => {
  it('no views.css selector names .view directly in front of a bare element', () => {
    const heavy = VIEW_RULES.map((r) => r.selector).filter((s) =>
      /(^|,\s*)\.view (button|input|select|textarea)\b/.test(s),
    );
    expect(heavy).toEqual([]);
  });

  it('styles buttons through :where(), with tap hygiene (F15)', () => {
    const b = body(':where(.view) :where(button)');
    expect(b).toMatch(/min-height:\s*var\(--tap\);/);
    expect(b).toMatch(/touch-action:\s*manipulation;/);
    expect(b).toMatch(/-webkit-tap-highlight-color:\s*transparent;/);
  });
});

describe('every text-entry control is 16 px (F10)', () => {
  it('one app-wide rule covers search, time, date, text, number, select and textarea', () => {
    const rule = VIEW_RULES.find((r) => r.selector.startsWith(':where(input:not('));
    expect(rule?.selector).toContain("[type='checkbox']");
    expect(rule?.selector).toContain("[type='radio']");
    expect(rule?.selector).toContain("[type='range']");
    expect(rule?.selector).toContain('select, textarea');
    expect(rule?.body).toMatch(/font-size:\s*16px;/);
    expect(rule?.body).toMatch(/caret-color:\s*var\(--ink\);/);
  });
});

describe('states (brief 3.3)', () => {
  it('pressed is an inset ink ring, never a colour flash', () => {
    expect(body(':where(.view) :where(button):active:not(:disabled)')).toMatch(
      /box-shadow:\s*inset 0 0 0 2px var\(--ink\);/,
    );
  });

  it('disabled is shape as well as opacity', () => {
    const b = body(':where(.view) :where(button):disabled');
    expect(b).toMatch(/opacity:\s*0\.45;/);
    expect(b).toMatch(/border-style:\s*dashed;/);
  });

  it('focus-visible is the themed ring, lime inside a black panel', () => {
    expect(body(':where(:focus-visible)')).toMatch(/outline:\s*var\(--focus\);/);
    expect(body(':where(.ll-panel :focus-visible)')).toMatch(/outline:\s*var\(--focus-on-panel\);/);
  });

  it('native checkbox, radio and range take the ink accent, never platform blue (A10)', () => {
    const rule = VIEW_RULES.find((r) => r.selector.includes("input[type='radio']") && r.body.includes('accent-color'));
    expect(rule?.body).toMatch(/accent-color:\s*var\(--ink\);/);
  });

  it('text selection is themed', () => {
    expect(body('::selection')).toMatch(/background:\s*var\(--ink\);/);
    expect(body('::selection')).toMatch(/color:\s*var\(--lime\);/);
  });

  it('defines the one primary sticker', () => {
    const b = body('.view .is-primary');
    expect(b).toMatch(/background:\s*var\(--accent\);/);
    expect(b).toMatch(/color:\s*var\(--ink\);/);
    expect(b).toMatch(/border:\s*2px solid var\(--ink\);/);
    expect(b).toMatch(/min-height:\s*var\(--tap-primary\);/);
  });
});

describe('type scale (brief 3.1)', () => {
  it('body text is 16 px', () => {
    expect(tokensCss).toMatch(/body \{[^}]*font-size:\s*var\(--text-md\);/);
    expect(tokensCss).not.toMatch(/body \{[^}]*font-size:\s*13px;/);
  });
});
