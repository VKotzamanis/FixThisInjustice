// src/ui/components/weekStampStyles.test.ts
//
// Where the week stamp's sparkles land, asserted in limelight.css's own text: jsdom computes no
// layout and runs no animation (restPanelStyles.test.ts's reason).
//
// The defect (screenshot, 2026-10-18): the fan was centred on the whole stamp and flew 44 px out,
// so sparkles landed on the mascot, on MOTHER and on "3 of 3. she delivered.". The stamp's own
// box now hugs its content, and the sparkles stand in two wings OUTSIDE that box, left and right,
// so no landing spot, and no start spot, is over a word.
import { describe, expect, it } from 'vitest';
import limelightCss from './limelight.css?raw';
import { SPARKLE_COUNT } from './WeekStamp';

const CSS = limelightCss.replace(/\/\*[\s\S]*?\*\//g, '');

function rulesOf(css: string): { selector: string; body: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? '').trim().replace(/\s+/g, ' '),
    body: m[2] ?? '',
  }));
}

function bodyOf(selector: string): string {
  const rule = rulesOf(CSS).find((r) => r.selector === selector);
  expect({ selector, found: rule !== undefined }).toEqual({ selector, found: true });
  return rule?.body ?? '';
}

function declared(body: string, property: string): string | null {
  const m = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+);`).exec(body);
  return m === null ? null : (m[1] ?? '').trim().replace(/\s+/g, ' ');
}

const WING = 6; // [sparkles per side]

describe('week stamp sparkles stand clear of every word', () => {
  it('hugs its content, so the box edges are the edges of the widest line', () => {
    const body = bodyOf('.ll-stamp');
    expect(declared(body, 'width')).toBe('fit-content');
    expect(declared(body, 'max-width')).toBe('100%');
    expect(declared(body, 'margin')).toBe('12px auto');
  });

  it('rests the left wing outside the left edge and the right wing outside the right edge', () => {
    const left = bodyOf('.ll-stamp-sparkle');
    expect(declared(left, 'left')).toBe('0');
    expect(declared(left, 'top')).toBe('var(--wing-top)');
    expect(declared(left, '--wing-rest')).toBe('translate(calc(-100% - var(--wing-gap)), -50%)');
    expect(declared(left, 'transform')).toBe('var(--wing-rest)');

    const right = bodyOf(`.ll-stamp-sparkle:nth-child(n + ${WING + 1})`);
    expect(declared(right, 'left')).toBe('100%');
    expect(declared(right, '--wing-rest')).toBe('translate(var(--wing-gap), -50%)');
  });

  it('starts every sparkle outside the box too: each gap exceeds the outward drift', () => {
    const drift = Number(/^(\d+(?:\.\d+)?)px$/.exec(declared(bodyOf('.ll-stamp-sparkle'), '--wing-drift') ?? '')?.[1]);
    expect(drift).toBeGreaterThan(0); // [px]
    const tops: number[] = [];
    for (let k = 1; k <= WING; k += 1) {
      const body = bodyOf(`.ll-stamp-sparkle:nth-child(${String(WING)}n + ${String(k)})`);
      const gap = Number(/^(\d+(?:\.\d+)?)px$/.exec(declared(body, '--wing-gap') ?? '')?.[1]); // [px]
      const top = Number(/^(\d+(?:\.\d+)?)%$/.exec(declared(body, '--wing-top') ?? '')?.[1]); // [%]
      expect(gap - drift, `sparkle ${String(k)}: start gap`).toBeGreaterThan(0);
      expect(top).toBeGreaterThan(0);
      expect(top).toBeLessThan(100);
      tops.push(top);
    }
    // Six distinct heights a side, so the twelve never stack on one another.
    expect(new Set(tops).size).toBe(WING);
    expect(2 * WING).toBe(SPARKLE_COUNT);
  });

  it('keeps no radial track through the middle of the stamp', () => {
    expect(CSS).not.toMatch(/--fan-angle/);
  });

  it('under reduced motion, shows the sparkles static at their resting place', () => {
    const at = CSS.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(at).toBeGreaterThanOrEqual(0);
    const reduced = rulesOf(CSS.slice(at)).find((r) => r.selector === '.ll-stamp-sparkle');
    expect(declared(reduced?.body ?? '', 'animation')).toBe('none');
    expect(declared(reduced?.body ?? '', 'opacity')).toBe('0.92');
  });
});
