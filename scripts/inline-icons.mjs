#!/usr/bin/env node
/**
 * Inline the limelight PNG artwork as base64 data URIs.
 *
 *   npm run icons:build          (or: node scripts/inline-icons.mjs)
 *
 * Inputs are finished artwork, not source: agy-artifacts/icons/*.png (21 files, 32 x 32) and
 * agy-artifacts/mascot-*-256.png (4 files, 256 x 256). Nothing is drawn or re-encoded here; the
 * bytes on disk are base64'd verbatim, so the decoded output is the input file byte for byte.
 *
 * Provenance: own work, generated with Gemini via agy on 2026-09-01. No third-party material is
 * included, so no third-party licence is claimed. Design record:
 * docs/design/round3/2026-09-01-round3-plan.md sections 4.3, 4.4 and 5.1.
 *
 * Determinism. Same inputs must give a byte-identical output, because the generated modules are
 * committed and a test compares the committed text against a fresh build. Three things could break
 * that and each is closed: readdirSync order is filesystem-dependent, so the file list is sorted;
 * Map insertion order is not the emitted order, so the keys are sorted; and nothing here reads a
 * clock, an environment variable or the working directory (paths are resolved from import.meta.url).
 *
 * The module exports its builders so a test can regenerate in-process and compare, with no child
 * process and no writing to the tree. Running the file writes; importing it does not.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Paths hang off this file's own location, never the working directory, so the output does not
// depend on where the script is run from. Written as dirname(dirname(...)) rather than
// new URL('../', import.meta.url) because Vite rewrites that literal pattern into an asset URL
// when the drift test imports this module, and the rewritten URL is no longer a file: URL.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const ICON_DIR = join(ROOT, 'agy-artifacts', 'icons');
export const ART_DIR = join(ROOT, 'agy-artifacts');
export const ICON_OUT = join(ROOT, 'src', 'skins', 'limelight', 'icons.ts');
export const ART_OUT = join(ROOT, 'src', 'skins', 'limelight', 'illustrations.ts');

const ICON_COUNT = 21; // 16 icons plus the 5 panel variants of round three section 4.3
const ICON_SIDE = 32; // px, the drawn size; the component scales it with image-rendering: pixelated
const ICON_MAX_BYTES = 1024; // per file; a larger file is a regenerated asset, not a typo
const ART_SIDE = 256; // px
const ART_MAX_BYTES = 5120; // per file
const MASCOT_POSES = ['crown', 'flop', 'lifting', 'resting'];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_URI_PREFIX = 'data:image/png;base64,';

/**
 * Width and height from the PNG IHDR, which is the first chunk and always at a fixed offset: an
 * 8-byte signature, a 4-byte length, the 4-byte type "IHDR", then width and height as big-endian
 * uint32 at byte 16 and byte 20.
 */
function pngSize(buffer, file) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${file}: not a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** 'barbell-panel' -> 'barbellPanel'; 'mascot-crown-256' -> 'mascotCrown'. */
function camel(stem) {
  return stem.replace(/-256$/, '').replace(/-([a-z0-9])/g, (_, character) => character.toUpperCase());
}

/** Read one PNG, check it is the expected square and under its ceiling, return the data URI. */
function inline(file, side, maxBytes) {
  const buffer = readFileSync(file);
  const { width, height } = pngSize(buffer, file);
  if (width !== side || height !== side) {
    throw new Error(`${file}: ${width}x${height}, expected ${side}x${side}`);
  }
  if (buffer.byteLength > maxBytes) {
    throw new Error(`${file}: ${buffer.byteLength} B exceeds the ${maxBytes} B ceiling`);
  }
  return { uri: `${DATA_URI_PREFIX}${buffer.toString('base64')}`, bytes: buffer.byteLength };
}

/** The generated module text. Keys are sorted, so the emitted order does not depend on the input order. */
function renderModule(entries, typeName, constName, header) {
  const names = [...entries.keys()].sort();
  const union = names.map((name) => `  | '${name}'`).join('\n');
  const rows = names.map((name) => `  ${name}: '${entries.get(name).uri}',`).join('\n');
  return (
    `${header}\n` +
    `export type ${typeName} =\n${union};\n\n` +
    `export const ${constName}: Readonly<Record<${typeName}, string>> = {\n${rows}\n};\n`
  );
}

/** The shared provenance block. One statement of it, so the two modules cannot disagree. */
function provenance() {
  return (
    ' * Provenance: own work, generated with Gemini via agy on 2026-09-01. No third-party material is\n' +
    ' * included, so no third-party licence is claimed. Design record:\n' +
    ' * docs/design/round3/2026-09-01-round3-plan.md sections 4.3, 4.4 and 5.1.'
  );
}

function totalBytes(entries) {
  return [...entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
}

function readIcons() {
  const entries = new Map();
  const files = readdirSync(ICON_DIR)
    .filter((name) => name.endsWith('.png'))
    .sort();
  for (const file of files) {
    entries.set(camel(basename(file, '.png')), inline(join(ICON_DIR, file), ICON_SIDE, ICON_MAX_BYTES));
  }
  if (entries.size !== ICON_COUNT) throw new Error(`expected ${ICON_COUNT} icons, found ${entries.size}`);
  return entries;
}

function readIllustrations() {
  const entries = new Map();
  for (const pose of MASCOT_POSES) {
    const file = join(ART_DIR, `mascot-${pose}-256.png`);
    entries.set(camel(`mascot-${pose}`), inline(file, ART_SIDE, ART_MAX_BYTES));
  }
  return entries;
}

/** Regenerate src/skins/limelight/icons.ts and return its text. Reads only; writes nothing. */
export function buildIconsModule() {
  const entries = readIcons();
  const header =
    '/*\n' +
    ' * GENERATED FILE - do not edit by hand. Rebuild with: npm run icons:build\n' +
    ' * Written by scripts/inline-icons.mjs from agy-artifacts/icons/*.png.\n' +
    ' *\n' +
    `${provenance()}\n` +
    ' *\n' +
    ` * ${entries.size} files, ${ICON_SIDE} x ${ICON_SIDE} pixel art, ${totalBytes(entries)} B decoded in total. The five names ending\n` +
    ' * in Panel are the variants with the black outline remapped to lime, so the silhouette survives\n' +
    ' * an inverted panel (section 4.3). The other eleven only ever sit on lime.\n' +
    ' */\n';
  return renderModule(entries, 'LimelightIconName', 'LIMELIGHT_ICONS', header);
}

/** Regenerate src/skins/limelight/illustrations.ts and return its text. Reads only; writes nothing. */
export function buildIllustrationsModule() {
  const entries = readIllustrations();
  const header =
    '/*\n' +
    ' * GENERATED FILE - do not edit by hand. Rebuild with: npm run icons:build\n' +
    ' * Written by scripts/inline-icons.mjs from agy-artifacts/mascot-*-256.png.\n' +
    ' *\n' +
    `${provenance()}\n` +
    ' *\n' +
    ` * ${entries.size} files, ${ART_SIDE} x ${ART_SIDE}, ${totalBytes(entries)} B decoded in total: four poses of one character\n` +
    ' * (section 5). The raw 1024 px generations stay in agy-artifacts and are not inlined.\n' +
    ' */\n';
  return renderModule(entries, 'LimelightIllustrationName', 'LIMELIGHT_ILLUSTRATIONS', header);
}

function main() {
  const icons = buildIconsModule();
  const illustrations = buildIllustrationsModule();
  writeFileSync(ICON_OUT, icons);
  writeFileSync(ART_OUT, illustrations);
  // Repo-relative, so the line is the same on any machine and carries no home directory.
  console.log(
    `wrote ${relative(ROOT, ICON_OUT)} (${icons.length} B) and ` +
      `${relative(ROOT, ART_OUT)} (${illustrations.length} B)`,
  );
}

// Importing this module must not touch the tree; only running it writes.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
