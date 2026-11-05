// src/ui/components/marqueeHover.test.ts
//
// Audit F15: on a touch screen `:hover` sticks after a tap, so the marquee stayed paused until
// the user tapped somewhere else. The hover pause is kept for a real pointer only, inside
// `@media (hover: hover)`; the tap (`:active`), focus and the explicit toggle still pause it.
// Asserted on the stylesheet text: jsdom evaluates no media queries and runs no animation.
import { describe, expect, it } from 'vitest';
import limelightCss from './limelight.css?raw';

const CSS = limelightCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** The text of every `@media (hover: hover)` block (one level of nesting, as the file uses). */
function hoverBlocks(css: string): string[] {
  return [...css.matchAll(/@media\s*\(hover:\s*hover\)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g)].map((m) => m[1] ?? '');
}

describe('marquee hover pause (audit F15)', () => {
  it('has no :hover pause outside @media (hover: hover)', () => {
    const outside = CSS.replace(/@media\s*\(hover:\s*hover\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    expect(outside).not.toMatch(/\.ll-marquee-strip:hover/);
  });

  it('pauses on hover inside @media (hover: hover)', () => {
    const inside = hoverBlocks(CSS).join('\n');
    expect(inside).toMatch(/\.ll-marquee-strip:hover\s+\.ll-marquee-track\s*\{[^}]*animation-play-state:\s*paused/);
  });

  it('still pauses on tap, focus and the toggle everywhere', () => {
    for (const sel of ["[data-paused='true']", ':focus-visible', ':active']) {
      expect(CSS).toContain(`.ll-marquee-strip${sel} .ll-marquee-track`);
    }
  });
});
