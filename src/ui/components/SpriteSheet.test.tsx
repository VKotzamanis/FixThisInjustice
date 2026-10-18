// src/ui/components/SpriteSheet.test.tsx
//
// The one-row sprite-sheet player (owner request 2026-10-18: her sheets replace the pink blob).
// The component half is a render test on the inline style it writes; the animation itself is CSS,
// and jsdom runs no animation and evaluates no media query, so that half is asserted in the
// sheet's own text, as OwnerSprite.test.tsx does for the owner's sprite.
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpriteSheet, type SpriteSheetSpec } from './SpriteSheet';
import sheetCss from './spriteSheet.css?raw';

/** A synthetic three-frame sheet: 3 cells of 64 x 64 px in one row, 240 ms each. */
const SHEET: SpriteSheetSpec = {
  name: 'test-sheet',
  src: '/assets/test-sheet.png',
  frameWidth: 64, // [px] source pixels
  frameHeight: 64, // [px] source pixels
  frames: 3, // [frames]
  frameMs: 240, // [ms] per frame
};

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

function sprite(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>('.ll-sheet');
  expect(element).not.toBeNull();
  return element as HTMLElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SpriteSheet', () => {
  it('draws one frame box at an integer scale, the whole row behind it', () => {
    for (const scale of [1, 2] as const) {
      const { container, unmount } = render(<SpriteSheet sheet={SHEET} scale={scale} iterations={2} />);
      const box = sprite(container);
      expect({ scale, width: box.style.width, height: box.style.height }).toEqual({
        scale,
        width: `${64 * scale}px`, // [CSS px] 64 or 128
        height: `${64 * scale}px`,
      });
      // The row is frames x the box wide and exactly the box tall, so the scale holds for the
      // sheet too: every source pixel is scale x scale CSS px.
      expect(box.style.backgroundSize).toBe('300% 100%');
      expect(box.style.backgroundImage).toContain(SHEET.src);
      expect(box.getAttribute('data-sheet')).toBe('test-sheet');
      expect(box.getAttribute('data-frames')).toBe('3');
      unmount();
    }
  });

  it('is decoration: hidden from assistive technology, and no media element', () => {
    const { container } = render(<SpriteSheet sheet={SHEET} scale={1} iterations={2} />);
    expect(sprite(container).getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('img, canvas, video')).toHaveLength(0);
  });

  it('steps through every frame once per cycle, for the cycles asked and no more', () => {
    const { container } = render(<SpriteSheet sheet={SHEET} scale={1} iterations={2} />);
    const box = sprite(container);
    expect(box.classList.contains('ll-sheet-play')).toBe(true);
    expect(box.getAttribute('data-sprite')).toBe('playing');
    expect(box.style.animationDuration).toBe(`${3 * 240}ms`); // [ms] one cycle: 720
    // One plateau per frame, no in-between position (spriteSheet.css explains jump-none).
    expect(box.style.animationTimingFunction).toBe('steps(3, jump-none)');
    expect(box.style.animationIterationCount).toBe('2'); // [cycles] then frame 0, still
  });

  it('holds frame 0 with no animation under prefers-reduced-motion', () => {
    reduceMotion();
    const { container } = render(<SpriteSheet sheet={SHEET} scale={1} iterations={2} />);
    const box = sprite(container);
    expect(box.getAttribute('data-sprite')).toBe('still');
    expect(box.classList.contains('ll-sheet-play')).toBe(false);
    expect(box.style.animationDuration).toBe('');
    expect(box.style.animationIterationCount).toBe('');
    // Still drawn: the base rule's position 0 0 is frame 0.
    expect(box.style.backgroundImage).toContain(SHEET.src);
  });

  it('holds frame 0 when asked for no cycles, or when the sheet has one frame', () => {
    for (const [sheet, iterations] of [
      [SHEET, 0],
      [{ ...SHEET, frames: 1 }, 2],
    ] as const) {
      const { container, unmount } = render(
        <SpriteSheet sheet={sheet} scale={1} iterations={iterations} />,
      );
      expect(sprite(container).getAttribute('data-sprite')).toBe('still');
      unmount();
    }
  });
});

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

const CSS = sheetCss.replace(/\/\*[\s\S]*?\*\//g, '');

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

describe('spriteSheet.css', () => {
  it('rests on frame 0, nearest-neighbour, one copy of the row', () => {
    const body = bodyOf('.ll-sheet');
    expect(body).toMatch(/background-position:\s*0 0\s*;/);
    expect(body).toMatch(/background-repeat:\s*no-repeat/);
    expect(body).toMatch(/image-rendering:\s*pixelated/);
  });

  it('walks the row from the first frame to the last, and never loops forever', () => {
    const name = /animation-name:\s*([\w-]+)/.exec(bodyOf('.ll-sheet-play'))?.[1] ?? '';
    const at = CSS.indexOf(`@keyframes ${name}`);
    expect(at).toBeGreaterThanOrEqual(0);
    const stops = rulesOf(blockAt(CSS, at)).map((rule) => ({
      stop: rule.selector,
      x: /background-position-x:\s*([\d.]+%)/.exec(rule.body)?.[1],
    }));
    // 0% puts the row's left edge on the box's (frame 0); 100% its right edge (the last frame).
    expect(stops).toEqual([
      { stop: 'from', x: '0%' },
      { stop: 'to', x: '100%' },
    ]);
    // No fill: the play hands back to the base rule, frame 0.
    expect(bodyOf('.ll-sheet-play')).not.toMatch(/animation-fill-mode:\s*(forwards|both)/);
    expect(CSS).not.toMatch(/\binfinite\b/);
  });

  it('stops under prefers-reduced-motion, leaving frame 0', () => {
    const at = CSS.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(at).toBeGreaterThanOrEqual(0);
    const stopped = rulesOf(blockAt(CSS, at))
      .filter((rule) => /animation:\s*none/.test(rule.body))
      .flatMap((rule) => rule.selector.split(',').map((s) => s.trim()));
    expect(stopped).toContain('.ll-sheet-play');
  });

  it('colours nothing: no hex, rgb or hsl literal in the sheet', () => {
    expect(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(CSS)).toBe(false);
  });
});
