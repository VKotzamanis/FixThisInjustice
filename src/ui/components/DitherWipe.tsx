// src/ui/components/DitherWipe.tsx
//
// A 4 x 4 Bayer ordered-dither wipe, pink to transparent, top to bottom (stylize survey item 10).
// Three places mount it and no others, held by DitherWipe.test.tsx against the source tree:
// BootGate (boot to app), PhaseTransition (the cutscene opening), WeekStamp (the stamp landing).
//
// Canvas 2D at 1/8 of its CSS size, scaled up with `image-rendering: pixelated`, so one dither cell
// is an 8 x 8 CSS px block and a phone frame is about 5,000 cells. Bundle-only code, so CSP
// `script-src 'self'` holds; no library, no WebGL (no context-loss path to write).
//
// WHAT ENDS IT. The wipe completing, the page going hidden, or the caller unmounting: each cancels
// the pending frame, and the first two remove the canvas. The canvas never takes a pointer event
// while it exists. Reduced motion or no 2D context: it never mounts, which is the instant cut all
// three places had before it.
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { prefersReducedMotion } from '../hooks/reducedMotion';

/** Length of the wipe. [ms] */
export const DITHER_WIPE_MS = 600;
/** CSS px per canvas cell: the canvas is drawn at 1/8 of its CSS size. [CSS px / cell] */
export const DITHER_CELL_PX = 8;
/** 4 x 4 Bayer index matrix, row-major: the order (0 first) in which a 4 x 4 tile clears. */
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Height of the dithered band as a fraction of the area's height. Dimensionless. */
const BAND = 0.5;
/** The whole viewport, above every full-screen layer (boot 55, intro 56/57) and under the toasts (60). */
const VIEWPORT: CSSProperties = { position: 'fixed', inset: 0, zIndex: 59 };

/**
 * @param area where the canvas sits. Omitted: the whole viewport. WeekStamp passes an absolutely
 *   placed area so its counts are never covered (round-three section 2.5: no quantity is animated).
 */
export function DitherWipe({ area = VIEWPORT }: { area?: CSSProperties }): ReactElement | null {
  const [done, setDone] = useState<boolean>(prefersReducedMotion);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d') ?? null;
    if (canvas === null || ctx === null || document.hidden) {
      setDone(true);
      return undefined;
    }
    const box = canvas.getBoundingClientRect(); // [CSS px]
    const w = (canvas.width = Math.max(1, Math.ceil(box.width / DITHER_CELL_PX))); // [cells]
    const h = (canvas.height = Math.max(1, Math.ceil(box.height / DITHER_CELL_PX))); // [cells]
    // The colour is the token, resolved through the canvas's own `color: var(--pink)`. One cell is
    // drawn and read back so the canvas, not this file, parses whatever form the style returns.
    ctx.fillStyle = getComputedStyle(canvas).color;
    ctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
    const frame = ctx.createImageData(w, h);
    const start = performance.now(); // [ms], the clock rAF timestamps share
    let id = 0;

    const stop = (): void => {
      cancelAnimationFrame(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    function onVisibility(): void {
      if (!document.hidden) return;
      stop();
      setDone(true);
    }
    const draw = (now: number): void => {
      const t = Math.min(1, (now - start) / DITHER_WIPE_MS); // progress, 0..1
      for (let y = 0; y < h; y += 1) {
        // The clear level falls down the area: the top row clears first, the bottom row last.
        const level = t * (1 + BAND) - (BAND * y) / h; // dimensionless
        for (let x = 0; x < w; x += 1) {
          const rank = BAYER_4[(y % 4) * 4 + (x % 4)] ?? 0; // 0..15
          const i = (y * w + x) * 4; // [bytes] RGBA
          frame.data[i] = r;
          frame.data[i + 1] = g;
          frame.data[i + 2] = b;
          frame.data[i + 3] = (rank + 0.5) / 16 >= level ? 255 : 0; // still pink : cleared
        }
      }
      ctx.putImageData(frame, 0, 0);
      if (t < 1) {
        id = requestAnimationFrame(draw);
        return;
      }
      stop();
      setDone(true);
    };

    document.addEventListener('visibilitychange', onVisibility);
    draw(start);
    return stop;
  }, []);

  if (done) return null;
  return (
    <canvas
      ref={ref}
      data-testid="dither-wipe"
      aria-hidden="true"
      style={{
        ...area,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        imageRendering: 'pixelated',
        color: 'var(--pink)',
      }}
    />
  );
}
