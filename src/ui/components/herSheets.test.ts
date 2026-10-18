// src/ui/components/herSheets.test.ts
//
// Her three sheets (owner request 2026-10-18), which replaced the round-three pink-blob
// illustrations everywhere they rendered. The manifest is checked against the PNG files
// themselves, and the source tree is checked for any route back to the blob.
import { describe, expect, it } from 'vitest';
import { HER_PLAY_CYCLES, HER_SHEETS, type HerSheetName } from './herSheets';

/** Each sheet as a data URI (`?inline`), only to read its PNG header. Nothing ships this way. */
const SHEET_FILES: Record<string, string> = import.meta.glob('../../assets/sprite/her-*.png', {
  query: '?inline',
  import: 'default',
  eager: true,
});

/** Every non-suite `.ts`/`.tsx` under `src`, as raw text, keyed by its root-relative path. */
const SOURCES: Record<string, string> = import.meta.glob(
  ['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
);

/** The owner's brief, restated: frames per sheet, 64 x 64 px each, one row. */
const EXPECTED_FRAMES: Readonly<Record<HerSheetName, number>> = {
  'her-crown': 4, // arms up, hop, big smile, landing
  'her-lifting': 3, // halfway, lockout, halfway
  'her-resting': 4, // lounging, sipping, sunglasses down, lounging
};
const FRAME_PX = 64; // [px] source pixels, square

/** PNG IHDR width and height: big-endian uint32 at byte 16 and byte 20, after the signature. */
function pngSize(uri: string): { width: number; height: number } {
  const binary = atob(uri.slice(uri.indexOf(',') + 1));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe('HER_SHEETS', () => {
  it('names the three sheets the owner supplied, and nothing else', () => {
    expect(Object.keys(HER_SHEETS).sort()).toEqual(Object.keys(EXPECTED_FRAMES).sort());
    for (const [name, sheet] of Object.entries(HER_SHEETS)) {
      expect({ name, field: sheet.name }).toEqual({ name, field: name });
    }
  });

  it('matches each PNG: one row of 64 x 64 px frames, as many as the brief lists', () => {
    expect(Object.keys(SHEET_FILES)).toHaveLength(3);
    for (const name of Object.keys(EXPECTED_FRAMES) as HerSheetName[]) {
      const uri = SHEET_FILES[`../../assets/sprite/${name}.png`];
      expect({ name, found: uri !== undefined }).toEqual({ name, found: true });
      const sheet = HER_SHEETS[name];
      expect({ name, frames: sheet.frames, w: sheet.frameWidth, h: sheet.frameHeight }).toEqual({
        name,
        frames: EXPECTED_FRAMES[name],
        w: FRAME_PX,
        h: FRAME_PX,
      });
      expect({ name, ...pngSize(uri ?? '') }).toEqual({
        name,
        width: sheet.frames * sheet.frameWidth, // [px] the row
        height: sheet.frameHeight, // [px]
      });
    }
  });

  it('plays every placement twice, then holds frame 0', () => {
    expect(HER_PLAY_CYCLES).toBe(2);
  });
});

describe('the pink blob is gone', () => {
  it('reads the tree it claims to read', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
  });

  it('ships no blob module and no import of one', () => {
    const paths = Object.keys(SOURCES);
    expect(paths).not.toContain('/src/skins/limelight/illustrations.ts');
    expect(paths).not.toContain('/src/skins/limelight/Illustration.tsx');
    const importers = Object.entries(SOURCES)
      .filter(([, text]) =>
        /LIMELIGHT_ILLUSTRATIONS|LimelightIllustrationName|limelight\/[Ii]llustrations?['"]|<Illustration\b/.test(
          text,
        ),
      )
      .map(([path]) => path);
    expect(importers).toEqual([]);
  });
});
