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

/**
 * Decoded byte length per icon, measured from agy-artifacts/icons on 2026-09-01 and matching the
 * asset table in docs/design/round3/2026-09-01-round3-plan.md section 4.4 entry for entry.
 */
const ICON_BYTES: Readonly<Record<LimelightIconName, number>> = {
  alert: 390,
  barbell: 188,
  barbellPanel: 214,
  crown: 393,
  crownPanel: 420,
  drop: 481,
  fan: 492,
  heart: 356,
  heel: 411,
  lips: 294,
  martini: 459,
  megaphone: 389,
  megaphonePanel: 455,
  nails: 379,
  pause: 180,
  skip: 319,
  skull: 369,
  sparkle: 416,
  sparklePanel: 453,
  stopwatch: 477,
  stopwatchPanel: 537,
};

/*
 * The budget, quoted from the plan. Section 4.4: "Total inlined as base64 data URIs: 21 files,
 * 8 072 B raw (7.9 kB), 10 780 B encoded (10.5 kB), measured." Task 13's rationale: "inlined they
 * are 33 kB of base64 inside a JavaScript chunk the app already fetches". The plan writes 8 072 B
 * as 7.9 kB, so its kB is 1024 B, and 33 kB is 33 792 B.
 *
 * Every quantity below is an integer count of bytes or of base64 characters, so the comparison is
 * exact: epsilon = 0. No rounding, no tolerance, no floating point anywhere in these assertions.
 */
const ICON_RAW_BUDGET = 8072; // B, the sum of the 21 decoded icons
const ICON_BASE64_BUDGET = 10780; // base64 characters for the 21 icons
const MODULE_BUDGET = 33 * 1024; // B, the plan's "33 kB of base64", as the ceiling on the module

describe('limelight icons', () => {
  it('ships the sixteen icons and the five panel variants', () => {
    expect(Object.keys(LIMELIGHT_ICONS).sort()).toEqual(Object.keys(ICON_BYTES).sort());
    expect(Object.keys(LIMELIGHT_ICONS)).toHaveLength(21);
    const panels = Object.keys(LIMELIGHT_ICONS).filter((name) => name.endsWith('Panel'));
    expect(panels.sort()).toEqual([
      'barbellPanel',
      'crownPanel',
      'megaphonePanel',
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
  it('holds the decoded total the plan measured', () => {
    const icons = sum(Object.values(LIMELIGHT_ICONS).map((uri) => decode(uri).byteLength));
    expect(icons).toBe(ICON_RAW_BUDGET);
  });

  it('holds the base64 total the plan measured', () => {
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
