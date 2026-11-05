// Panel effects (plan AM-4a-7 effects 2-4, AM-4a-8): the echo is read once, the knockout stamp
// and the eyebrow take tokens only, and the owner's glow switch defaults to none. Contrast and
// computed sizes are swept in the browser (e2e/p4a-sweeps.spec.ts); this pins the sheets.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import tokensCss from '../styles/tokens.css?raw';
import effectsCss from './panelEffects.css?raw';
import limelightCss from './limelight.css?raw';
import { Echo } from './Echo';

const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const ruleBody = (css: string, selector: string): string => {
  const m = [...strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((r) => (r[1] ?? '').trim() === selector);
  if (m === undefined) throw new Error(`no rule ${selector}`);
  return m[2] ?? '';
};

describe('echo (AM-4a-7 effect 2)', () => {
  it('reads the word once: the hollow copy is aria-hidden', () => {
    render(
      <h3>
        <Echo text="Rest Word" />
      </h3>,
    );
    expect(screen.getByRole('heading', { name: 'Rest Word' })).toBeInTheDocument();
    expect(document.querySelector('.ll-echo-ghost')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the copy as a hard stroke from tokens, no blur', () => {
    const ghost = ruleBody(effectsCss, '.ll-echo-ghost');
    expect(ghost).toMatch(/-webkit-text-stroke:\s*var\(--echo-stroke\) var\(--echo-color\);/);
    expect(ghost).toMatch(/top:\s*var\(--echo-offset\);/);
    expect(ghost).toMatch(/color:\s*transparent;/);
    expect(strip(effectsCss)).not.toMatch(/#[0-9a-fA-F]{3,6}\b|blur|animation/);
  });
});

describe('knockout week stamp (AM-4a-7 effect 3)', () => {
  it('is ink on a pink sticker with an ink border and a hard ink offset (7.75:1)', () => {
    const b = ruleBody(limelightCss, '.ll-stamp p.ll-stamp-word.ll-display');
    expect(b).toMatch(/background:\s*var\(--pink\);/);
    expect(b).toMatch(/color:\s*var\(--ink\);/);
    expect(b).toMatch(/border:\s*2px solid var\(--ink\);/);
    expect(b).toMatch(/box-shadow:\s*var\(--shadow-offset\) var\(--shadow-offset\) 0 var\(--ink\);/);
    expect(b).toMatch(/text-shadow:\s*none;/);
  });
});

describe('panel eyebrow (AM-4a-7 effect 4) and the glow switch (AM-4a-8)', () => {
  it('is 12 px, tracked 0.24em, lime, from tokens', () => {
    const b = ruleBody(effectsCss, '.ll-eyebrow');
    expect(b).toMatch(/font-size:\s*var\(--eyebrow-size\);/);
    expect(b).toMatch(/letter-spacing:\s*var\(--eyebrow-tracking\);/);
    expect(b).toMatch(/color:\s*var\(--lime\);/);
  });

  it('declares every effect token in both token blocks, the glow off by default', () => {
    for (const [name, value] of [
      ['--eyebrow-size', '12px'],
      ['--eyebrow-tracking', '0.24em'],
      ['--echo-color', 'var(--pink)'],
      ['--panel-glow', 'none'],
    ] as const) {
      const found = [...tokensCss.matchAll(new RegExp(`${name}:\\s*([^;]+);`, 'g'))].map((m) => m[1]);
      expect(found).toEqual([value, value]);
    }
  });
});
