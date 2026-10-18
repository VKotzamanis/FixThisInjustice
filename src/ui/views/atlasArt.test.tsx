// The Atlas art: one glyph per specimen category, and the pixel question mark a locked slot
// carries instead of one.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SPECIMEN_CARDS, SPECIMEN_CATEGORIES } from '../../content/specimenCards';
import { CATEGORY_GLYPH, UnknownMark } from './atlasArt';

/**
 * The shipped glyph files, read by FILE NAME rather than through the map under test, so a map
 * that pointed one category at another category's file fails here instead of passing because
 * it agrees with itself.
 */
const GLYPH_FILES = import.meta.glob<string>('../../assets/art/glyph-*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('CATEGORY_GLYPH', () => {
  it('resolves every category to the glyph file named for it, and to no other', () => {
    expect(Object.keys(CATEGORY_GLYPH).sort()).toEqual([...SPECIMEN_CATEGORIES].sort());
    for (const category of SPECIMEN_CATEGORIES) {
      expect(CATEGORY_GLYPH[category]).toBe(GLYPH_FILES[`../../assets/art/glyph-${category}.svg`]);
    }
    expect(new Set(Object.values(CATEGORY_GLYPH)).size).toBe(SPECIMEN_CATEGORIES.length);
  });

  it('gives every shipped card a glyph', () => {
    for (const card of SPECIMEN_CARDS) {
      expect(CATEGORY_GLYPH[card.category]).toMatch(/^<svg[\s>]/);
    }
  });

  it('draws every glyph in currentColor on the 480 unit box, with no colour of its own', () => {
    // currentColor is what lets the panel's lime reach the art; a literal fill would not follow
    // the token, which is AGENTS rule 5 for art as much as for CSS.
    for (const category of SPECIMEN_CATEGORIES) {
      const host = document.createElement('div');
      host.innerHTML = CATEGORY_GLYPH[category];
      const svg = host.querySelector('svg');
      expect(svg?.getAttribute('viewBox')).toBe('0 0 480 480');
      expect(CATEGORY_GLYPH[category]).toContain('fill="currentColor"');
      expect(CATEGORY_GLYPH[category]).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });
});

describe('UnknownMark', () => {
  it('is a decorative 12 by 12 pixel mark in currentColor, on whole cells only', () => {
    const { container } = render(<UnknownMark className="probe" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 12 12');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('shape-rendering')).toBe('crispEdges');
    expect(svg?.getAttribute('data-mark')).toBe('unknown');
    expect(svg?.classList.contains('probe')).toBe(true);
    const path = svg?.querySelector('path');
    expect(path?.getAttribute('fill')).toBe('currentColor');
    // Every coordinate is a whole cell inside the grid: a fraction would land between pixels.
    const numbers = (path?.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g) ?? [];
    expect(numbers.length).toBeGreaterThan(0);
    for (const n of numbers) {
      expect(Number.isInteger(Number(n))).toBe(true);
      expect(Number(n)).toBeGreaterThanOrEqual(0);
      expect(Number(n)).toBeLessThanOrEqual(12);
    }
  });
});
