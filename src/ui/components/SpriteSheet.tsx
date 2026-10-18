// src/ui/components/SpriteSheet.tsx
//
// Plays any one-row sprite sheet: `frames` equal cells side by side, left to right, stepped with
// CSS steps() (spriteSheet.css). Written for the owner's request of 2026-10-18, her three sheets
// in place of the pink blob (herSheets.ts): the Today hero (todayHero.ts) and the week stamp.
//
// A SIBLING OF OwnerSprite, NOT A REWRITE OF IT. The owner's 40 px sheet is a 4 x 3 grid, and one
// steps() timing function walks one axis only; folding the grid in would need a second animation
// on the other axis for one sheet. OwnerSprite and its keyframes stay as they were, so the intro
// and the rest game are untouched.
//
// A CSS background on a span, not an <img>, as OwnerSprite is: the picture is decoration (the
// words beside it carry the meaning), so it is aria-hidden and is no media element.
import { useState, type CSSProperties, type ReactElement } from 'react';
import { prefersReducedMotion } from '../hooks/reducedMotion';
import './spriteSheet.css';

/**
 * [CSS px per source px] Whole numbers only. A fractional scale drops and doubles pixel rows
 * unevenly; the type makes 1.5 a compile error rather than a blurred sprite.
 */
export type SpriteScale = 1 | 2 | 3 | 4;

/** One sheet: what the file is, never where or how it is placed. */
export interface SpriteSheetSpec {
  /** Short stable name, written to `data-sheet` for tests and devtools. */
  name: string;
  /** The built URL of the sheet (a Vite asset import: hashed, same-origin, precached). */
  src: string;
  /** [px] one frame's width, in the sheet's own pixels. */
  frameWidth: number;
  /** [px] one frame's height, in the sheet's own pixels; the sheet is one row this tall. */
  frameHeight: number;
  /** [frames] cells in the row. At least 2 to play; 1 is a still picture. */
  frames: number;
  /** [ms] how long each frame shows; one cycle is frames x frameMs. */
  frameMs: number;
}

/**
 * @param sheet the sheet to play
 * @param scale [CSS px per source px] the whole-number size for this placement
 * @param iterations [cycles] how many times through, finite; then frame 0, still. 0 never plays.
 *   Reduced motion holds frame 0 whatever is asked, read once at mount as OwnerSprite reads it.
 */
export function SpriteSheet({
  sheet,
  scale,
  iterations,
}: {
  sheet: SpriteSheetSpec;
  scale: SpriteScale;
  iterations: number;
}): ReactElement {
  const [reduced] = useState<boolean>(prefersReducedMotion);
  const playing = !reduced && iterations >= 1 && sheet.frames >= 2;
  const style: CSSProperties = {
    width: `${sheet.frameWidth * scale}px`, // [CSS px] one frame
    height: `${sheet.frameHeight * scale}px`, // [CSS px]
    backgroundImage: `url("${sheet.src}")`,
    // [%] of the box: the row is `frames` boxes wide and one box tall, so it takes the same
    // whole-number scale as the box.
    backgroundSize: `${sheet.frames * 100}% 100%`,
    ...(playing
      ? {
          animationDuration: `${sheet.frames * sheet.frameMs}ms`, // [ms] one cycle
          // One plateau per frame, both ends included: spriteSheet.css explains jump-none.
          animationTimingFunction: `steps(${sheet.frames}, jump-none)`,
          animationIterationCount: iterations, // [cycles]
        }
      : {}),
  };
  return (
    <span
      className={playing ? 'll-sheet ll-sheet-play' : 'll-sheet'}
      data-sheet={sheet.name}
      data-frames={sheet.frames}
      data-sprite={playing ? 'playing' : 'still'}
      aria-hidden="true"
      style={style}
    />
  );
}
