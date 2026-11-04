import { describe, expect, it } from 'vitest';
import { LIMELIGHT_ICONS } from './icons';
import type { LimelightIconName } from './icons';
// The generated module as text, for the drift check and the size budget. ?raw is the same
// mechanism src/domain/reminders/payload.test.ts already uses to read a sibling project's source.
// (The second generated module, the blob illustrations, was removed on 2026-10-18 when her sprite
// sheets replaced every render of it: src/ui/components/herSheets.ts.)
import iconsSource from './icons.ts?raw';
// The generator's builder, imported and run in-process: no child process, and nothing is written.
import { buildIconsModule } from '../../../scripts/inline-icons.mjs';

const PREFIX = 'data:image/png;base64,';

function decode(uri: string): Uint8Array {
  expect(uri.startsWith(PREFIX)).toBe(true);
  const binary = atob(uri.slice(PREFIX.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The 8-byte PNG signature, then IHDR width and height at the fixed offsets 16 and 20. */
function pngHeader(bytes: Uint8Array): { signature: boolean; width: number; height: number } {
  const expected = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const signature = expected.every((byte, index) => bytes[index] === byte);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { signature, width: view.getUint32(16), height: view.getUint32(20) };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Decoded byte lengths measured from the current agy-artifacts/icons bank. */
const ICON_BYTES: Readonly<Record<LimelightIconName, number>> = {
  alert: 390,
  archivePanel: 334,
  archive: 298,
  barbellPanel: 214,
  barbell: 188,
  crownPanel: 420,
  crown: 393,
  dropPanel: 498,
  drop: 481,
  fan: 492,
  heart: 356,
  heel: 411,
  lips: 294,
  martini: 459,
  megaphonePanel: 455,
  megaphone: 389,
  morePanel: 131,
  more: 121,
  nails: 379,
  pause: 180,
  skip: 319,
  skull: 369,
  sparklePanel: 453,
  sparkle: 416,
  stopwatchPanel: 537,
  stopwatch: 477,
};

/*
 * Previous totals and budgets: 8072 B raw, 10780 base64 characters (0% headroom).
 * Preserve that relative headroom for the expanded bank: 9454 B raw, 12632 base64 characters.
 * These exact budgets also pin the measured totals; the per-icon table identifies any drift.
 */
const ICON_RAW_BUDGET = 9454; // B, the sum of the 26 decoded icons
const ICON_BASE64_BUDGET = 12632; // base64 characters for the 26 icons
const MODULE_BUDGET = 33 * 1024; // B, the plan's "33 kB of base64", as the ceiling on the module

describe('limelight icons', () => {
  it('ships the eighteen icons and the eight panel variants', () => {
    expect(Object.keys(LIMELIGHT_ICONS).sort()).toEqual(Object.keys(ICON_BYTES).sort());
    expect(Object.keys(LIMELIGHT_ICONS)).toHaveLength(26);
    const panels = Object.keys(LIMELIGHT_ICONS).filter((name) => name.endsWith('Panel'));
    expect(panels.sort()).toEqual([
      'archivePanel',
      'barbellPanel',
      'crownPanel',
      'dropPanel',
      'megaphonePanel',
      'morePanel',
      'sparklePanel',
      'stopwatchPanel',
    ]);
  });

  it('decodes each icon to a 32 x 32 PNG under 1 kB', () => {
    for (const [name, uri] of Object.entries(LIMELIGHT_ICONS)) {
      const bytes = decode(uri);
      const header = pngHeader(bytes);
      expect({ name, ...header }).toEqual({ name, signature: true, width: 32, height: 32 });
      expect({ name, under1k: bytes.byteLength < 1024 }).toEqual({ name, under1k: true });
    }
  });

  it('pins each icon to its measured byte length', () => {
    for (const [name, expectedBytes] of Object.entries(ICON_BYTES)) {
      const uri = LIMELIGHT_ICONS[name as LimelightIconName];
      expect({ name, bytes: decode(uri).byteLength }).toEqual({ name, bytes: expectedBytes });
    }
  });
});

describe('the inlined byte budget', () => {
  it('holds the measured decoded total', () => {
    const icons = sum(Object.values(LIMELIGHT_ICONS).map((uri) => decode(uri).byteLength));
    expect(icons).toBe(ICON_RAW_BUDGET);
  });

  it('holds the measured base64 total', () => {
    const icons = sum(Object.values(LIMELIGHT_ICONS).map((uri) => uri.length - PREFIX.length));
    expect(icons).toBe(ICON_BASE64_BUDGET);
  });

  it('keeps the generated module inside the 33 kB ceiling', () => {
    // The module is ASCII, so one character is one byte and String.length is the byte count.
    const moduleBytes = iconsSource.length;
    expect({ moduleBytes, withinBudget: moduleBytes <= MODULE_BUDGET }).toEqual({
      moduleBytes,
      withinBudget: true,
    });
  });

  it('emits ASCII only, so the data URIs survive any encoding', () => {
    // eslint-disable-next-line no-control-regex -- the point of the test is the byte range itself
    const nonAscii = /[^\x00-\x7f]/;
    expect(nonAscii.test(iconsSource)).toBe(false);
  });
});

describe('the committed generated module', () => {
  /*
   * A stale commit is the failure mode this file exists for: the artwork changes, nobody re-runs
   * the generator, and the app ships the old pixels while the plan's table says otherwise. The
   * builder is imported and run here, so the check needs no shell and no build step.
   */
  it('is exactly what the generator produces from the artwork today', () => {
    expect(iconsSource).toBe(buildIconsModule());
  });
});
