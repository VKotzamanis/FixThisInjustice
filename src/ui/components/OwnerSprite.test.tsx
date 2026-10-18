// src/ui/components/OwnerSprite.test.tsx
//
// The owner's 11-frame sprite (asset manifest section 10, stylize survey item 7). The component
// half is a render test; the animation itself is CSS, and jsdom runs no animation and evaluates no
// media query, so that half is asserted in the sheet's own text, as restGameStyles.test.ts does.
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OwnerSprite } from './OwnerSprite';
import spriteCss from './ownerSprite.css?raw';

/** [px] One cell of the owner's sheet: 160 x 120 px, a 4 x 3 grid of 40 x 40 px cells. */
const CELL_PX = 40;
const COLUMNS = 4; // [cells] per row of the sheet
const ROWS = 3; // [cells] per column of the sheet
const FRAMES = 11; // [frames] row-major; the twelfth cell is empty
const FRAME_MS = 130; // [ms] per frame, the owner's GIF (11 frames, 13 cs each)
const SCALE = 2; // integer: 80 CSS px per 40 px cell

function reduceMotion(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
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

const CSS = spriteCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** Innermost `selector { body }` pairs of a sheet or block. */
function rulesOf(css: string): { selector: string; body: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? '').trim(),
    body: m[2] ?? '',
  }));
}

function bodyOf(selector: string): string {
  const rule = rulesOf(CSS).find((r) => r.selector === selector);
  expect({ selector, found: rule !== undefined }).toEqual({ selector, found: true });
  return rule?.body ?? '';
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OwnerSprite', () => {
  it('shows frame 0, still and decorative, until it is asked to play', () => {
    const { container } = render(<OwnerSprite play={false} />);
    const sprite = container.querySelector('.ll-sprite');
    expect(sprite).not.toBeNull();
    expect(sprite?.getAttribute('data-sprite')).toBe('still');
    expect(sprite?.classList.contains('ll-sprite-play')).toBe(false);
    // The words beside it carry the meaning; a screen reader skips the picture.
    expect(sprite?.getAttribute('aria-hidden')).toBe('true');
    // A CSS background, not an <img>: no element the offline game tests count as media.
    expect(container.querySelectorAll('img, canvas, video')).toHaveLength(0);
  });

  it('plays when asked', () => {
    const { container } = render(<OwnerSprite play />);
    const sprite = container.querySelector('.ll-sprite');
    expect(sprite?.getAttribute('data-sprite')).toBe('playing');
    expect(sprite?.classList.contains('ll-sprite-play')).toBe(true);
  });

  it('stays on frame 0 under prefers-reduced-motion, even when asked to play', () => {
    reduceMotion();
    const { container } = render(<OwnerSprite play />);
    const sprite = container.querySelector('.ll-sprite');
    expect(sprite?.getAttribute('data-sprite')).toBe('still');
    expect(sprite?.classList.contains('ll-sprite-play')).toBe(false);
  });
});

describe('ownerSprite.css', () => {
  it('draws one 40 px cell at an integer 2x, nearest-neighbour', () => {
    const body = bodyOf('.ll-sprite');
    expect(body).toMatch(new RegExp(`(^|;|\\s)width:\\s*${CELL_PX * SCALE}px`));
    expect(body).toMatch(new RegExp(`(^|;|\\s)height:\\s*${CELL_PX * SCALE}px`));
    // The whole sheet at the same integer scale: 320 x 240 CSS px.
    expect(body).toContain(`${COLUMNS * CELL_PX * SCALE}px ${ROWS * CELL_PX * SCALE}px`);
    expect(body).toMatch(/image-rendering:\s*pixelated/);
    // The owner's sheet, byte-identical, from src/assets (built as a hashed, precached file).
    expect(body).toContain('assets/sprite/sprite-40x40px-11f-sheet.png');
  });

  it('steps through the eleven frames row-major, 130 ms each, exactly once', () => {
    const animation = /animation:\s*([\w-]+)\s+(\d+)ms\s+steps\(1,\s*end\)\s+(\d+)\s*;/.exec(
      bodyOf('.ll-sprite-play'),
    );
    expect(animation).not.toBeNull();
    const [, name = '', durationMs = '0', iterations = '0'] = animation ?? [];
    expect(Number(durationMs)).toBe(FRAMES * FRAME_MS); // [ms] 1430
    expect(Number(iterations)).toBe(1); // once: then back on the still frame

    const at = CSS.indexOf(`@keyframes ${name}`);
    expect(at).toBeGreaterThanOrEqual(0);
    const frames = rulesOf(blockAt(CSS, at)).flatMap((rule) =>
      rule.selector.split(',').map((stop) => {
        const xy = /background-position:\s*(-?\d+)(?:px)?\s+(-?\d+)(?:px)?/.exec(rule.body);
        return { percent: Number.parseFloat(stop), x: Number(xy?.[1]), y: Number(xy?.[2]) };
      }),
    );
    const byStart = frames.filter((f) => f.percent < 100).sort((a, b) => a.percent - b.percent);
    expect(byStart).toHaveLength(FRAMES);
    byStart.forEach((frame, k) => {
      // Frame k starts at k / 11 of the play and shows cell (k mod 4, floor(k / 4)).
      expect(frame.percent).toBeCloseTo((k * 100) / FRAMES, 3);
      expect({ k, x: frame.x, y: frame.y }).toEqual({
        k,
        x: -(k % COLUMNS) * CELL_PX * SCALE || 0,
        y: -Math.floor(k / COLUMNS) * CELL_PX * SCALE || 0,
      });
    });
  });

  it('stops under prefers-reduced-motion, leaving frame 0', () => {
    const at = CSS.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(at).toBeGreaterThanOrEqual(0);
    const stopped = rulesOf(blockAt(CSS, at))
      .filter((rule) => /animation:\s*none/.test(rule.body))
      .flatMap((rule) => rule.selector.split(',').map((s) => s.trim()));
    expect(stopped).toContain('.ll-sprite-play');
    // The still state IS frame 0: the base rule draws the sheet's top-left cell.
    expect(bodyOf('.ll-sprite')).toMatch(/\b0 0 \//);
  });

  it('colours nothing: no hex, rgb or hsl literal in the sheet', () => {
    expect(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(CSS)).toBe(false);
  });
});
