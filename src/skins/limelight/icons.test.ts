import { describe, expect, it } from 'vitest';
import { LIMELIGHT_ICONS } from './icons';
import type { LimelightIconName } from './icons';
import { LIMELIGHT_ILLUSTRATIONS } from './illustrations';
import type { LimelightIllustrationName } from './illustrations';
// The two generated modules as text, for the drift check and the size budget. ?raw is the same
// mechanism src/domain/reminders/payload.test.ts already uses to read a sibling project's source.
import iconsSource from './icons.ts?raw';
import illustrationsSource from './illustrations.ts?raw';
// The generator's builders, imported and run in-process: no child process, and nothing is written.
import { buildIconsModule, buildIllustrationsModule } from '../../../scripts/inline-icons.mjs';

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

const ILLUSTRATION_BYTES: Readonly<Record<LimelightIllustrationName, number>> = {
  mascotCrown: 2645,
  mascotFlop: 2913,
  mascotLifting: 3947,
  mascotResting: 4023,
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
const ILLUSTRATION_RAW_BUDGET = 13528; // B, the sum of the 4 decoded illustrations
const ICON_BASE64_BUDGET = 10780; // base64 characters for the 21 icons
const ILLUSTRATION_BASE64_BUDGET = 18040; // base64 characters for the 4 illustrations
const MODULE_BUDGET = 33 * 1024; // B, the plan's "33 kB of base64", as the ceiling on both modules

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

describe('limelight illustrations', () => {
  it('ships the four mascot poses', () => {
    expect(Object.keys(LIMELIGHT_ILLUSTRATIONS).sort()).toEqual([
      'mascotCrown',
      'mascotFlop',
      'mascotLifting',
      'mascotResting',
    ]);
  });

  it('decodes each illustration to a 256 x 256 PNG under 5 kB', () => {
    for (const [name, uri] of Object.entries(LIMELIGHT_ILLUSTRATIONS)) {
      const bytes = decode(uri);
      const header = pngHeader(bytes);
      expect({ name, ...header }).toEqual({ name, signature: true, width: 256, height: 256 });
      expect({ name, under5k: bytes.byteLength < 5120 }).toEqual({ name, under5k: true });
    }
  });

  it('pins each illustration to its measured byte length', () => {
    for (const [name, expectedBytes] of Object.entries(ILLUSTRATION_BYTES)) {
      const uri = LIMELIGHT_ILLUSTRATIONS[name as LimelightIllustrationName];
      expect({ name, bytes: decode(uri).byteLength }).toEqual({ name, bytes: expectedBytes });
    }
  });
});

describe('the inlined byte budget', () => {
  it('holds the decoded totals the plan measured', () => {
    const icons = sum(Object.values(LIMELIGHT_ICONS).map((uri) => decode(uri).byteLength));
    const illustrations = sum(
      Object.values(LIMELIGHT_ILLUSTRATIONS).map((uri) => decode(uri).byteLength),
    );
    expect({ icons, illustrations, total: icons + illustrations }).toEqual({
      icons: ICON_RAW_BUDGET,
      illustrations: ILLUSTRATION_RAW_BUDGET,
      total: ICON_RAW_BUDGET + ILLUSTRATION_RAW_BUDGET,
    });
  });

  it('holds the base64 totals the plan measured', () => {
    const icons = sum(Object.values(LIMELIGHT_ICONS).map((uri) => uri.length - PREFIX.length));
    const illustrations = sum(
      Object.values(LIMELIGHT_ILLUSTRATIONS).map((uri) => uri.length - PREFIX.length),
    );
    expect({ icons, illustrations }).toEqual({
      icons: ICON_BASE64_BUDGET,
      illustrations: ILLUSTRATION_BASE64_BUDGET,
    });
  });

  it('keeps both generated modules inside the 33 kB ceiling', () => {
    // Both modules are ASCII, so one character is one byte and String.length is the byte count.
    const moduleBytes = iconsSource.length + illustrationsSource.length;
    expect({ moduleBytes, withinBudget: moduleBytes <= MODULE_BUDGET }).toEqual({
      moduleBytes,
      withinBudget: true,
    });
  });

  it('emits ASCII only, so the data URIs survive any encoding', () => {
    // eslint-disable-next-line no-control-regex -- the point of the test is the byte range itself
    const nonAscii = /[^\x00-\x7f]/;
    expect(nonAscii.test(iconsSource)).toBe(false);
    expect(nonAscii.test(illustrationsSource)).toBe(false);
  });
});

describe('the committed generated modules', () => {
  /*
   * A stale commit is the failure mode this file exists for: the artwork changes, nobody re-runs
   * the generator, and the app ships the old pixels while the plan's table says otherwise. The
   * builders are imported and run here, so the check needs no shell and no build step.
   */
  it('are exactly what the generator produces from the artwork today', () => {
    expect(iconsSource).toBe(buildIconsModule());
    expect(illustrationsSource).toBe(buildIllustrationsModule());
  });
});
