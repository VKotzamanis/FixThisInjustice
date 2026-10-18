// src/ui/components/herSheets.ts
//
// Her sprite sheets: the owner's own pixel character (the 40 px sprite OwnerSprite plays) drawn in
// the three poses the pink blob used to take. Owner request 2026-10-18: "Make her replace every
// pink sprite". Files in src/assets/sprite/, transparent, pixel art at native 1x, one row of
// 64 x 64 px frames each:
//
//   her-lifting.png  3 frames  halfway, lockout, halfway
//   her-resting.png  4 frames  lounging, sipping, sunglasses down (green eyes), lounging
//   her-crown.png    4 frames  arms up, hop, big smile, landing
//
// Imported, so Vite emits each as its own hashed file (build.assetsInlineLimit is 0) and the
// service worker precaches it with every other png; CSP `img-src 'self'` allows it.
//
// FRAME TIMES are this build's choice, not the owner's (he gave none): a rep at 240 ms a frame,
// a lounge slow enough to read the sip and the eyes at 360 ms, a hop at 200 ms. Every one is at
// least 200 ms, so a sheet changes frame at most 5 times a second.
import herCrownUrl from '../../assets/sprite/her-crown.png';
import herLiftingUrl from '../../assets/sprite/her-lifting.png';
import herRestingUrl from '../../assets/sprite/her-resting.png';
import type { SpriteSheetSpec } from './SpriteSheet';

export type HerSheetName = 'her-crown' | 'her-lifting' | 'her-resting';

/** [px] every frame of every sheet: 64 x 64 source pixels. */
const FRAME_PX = 64;

function sheet(name: HerSheetName, src: string, frames: number, frameMs: number): SpriteSheetSpec {
  return { name, src, frameWidth: FRAME_PX, frameHeight: FRAME_PX, frames, frameMs };
}

export const HER_SHEETS: Readonly<Record<HerSheetName, SpriteSheetSpec>> = {
  'her-crown': sheet('her-crown', herCrownUrl, 4, 200), // [frames], [ms/frame]
  'her-lifting': sheet('her-lifting', herLiftingUrl, 3, 240),
  'her-resting': sheet('her-resting', herRestingUrl, 4, 360),
};

/**
 * [cycles] Every placement plays its sheet twice, then holds frame 0. Finite on purpose: the
 * Today screen keeps one thing moving (the marquee), so a sprite there must stop.
 *
 * Frame 0 rather than lifting's lockout: lifting ends each cycle on the halfway pose, which frame
 * 0 repeats, so the stop reads as the end of a rep rather than a cut, and the still a
 * reduced-motion user sees (frame 0) is the same picture everyone else is left with.
 */
export const HER_PLAY_CYCLES = 2;
