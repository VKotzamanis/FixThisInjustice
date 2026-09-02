#!/usr/bin/env node
/**
 * Gate: no emoji in the copy tables or in any component.
 *
 * Round-three verification criterion 5, as an executable check. The user asked for icons rather
 * than emoji, and "gone from the visible screens" is a weaker claim than the one that was asked
 * for, so the scan is over whole files: markup, string literals and comments alike. An emoji in a
 * comment is not shipped, but it is a tone rule that has already started to slip.
 *
 * SCOPE: every tracked src/content/copy*.ts and every tracked src/**\/*.tsx. The copy tables hold
 * the strings and the .tsx files hold everything rendered around them. Generated asset modules
 * (src/skins/limelight/icons.ts, illustrations.ts) are .ts files of base64 and are outside this
 * scope by construction.
 *
 * THE BLIND SPOT IS LOCAL, AND IT IS THE WORD "TRACKED". The file list comes from `git ls-files`,
 * which reports the index, so a component or copy table that has never been added is not scanned
 * at all: a local run passes on a file CI will scan as soon as it is committed. Add the file, then
 * run this again. CI does not share the blind spot, because a checkout holds tracked files only.
 *
 * WHAT COUNTS AS AN EMOJI:
 *   - Unicode Extended_Pictographic, which is the property the standard defines for this and is
 *     wider than a hand-written code point range: it catches U+2764 HEAVY BLACK HEART, which sits
 *     below the U+1F300 block that a range check usually starts at.
 *   - Regional indicators U+1F1E6 to U+1F1FF, which are Extended_Pictographic=No but pair up into
 *     flags. P1 already dropped a legacy flag emoji from videoInstances.ts for the tone rule, so
 *     this is a case that has happened here rather than a hypothetical one.
 *   - U+FE0F VARIATION SELECTOR-16, whose only job is to demand emoji presentation.
 *
 * WHAT DOES NOT COUNT: the three legal marks that are Extended_Pictographic but render as text by
 * default, (c) U+00A9, (r) U+00AE and TM U+2122, unless one of them is followed by U+FE0F, which
 * is a request for the emoji picture. A copyright sign in a licence line is a legal mark, not
 * decoration, and failing the build on one would be a false positive with no tone cost behind it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PATHSPECS = ['src/content/copy*.ts', ':(glob)src/**/*.tsx'];

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const VARIATION_SELECTOR_16 = 0xfe0f;
const REGIONAL_INDICATOR_FIRST = 0x1f1e6;
const REGIONAL_INDICATOR_LAST = 0x1f1ff;
const TEXT_DEFAULT_MARKS = new Set([0x00a9, 0x00ae, 0x2122]); // (c), (r), TM

/** True when this code point is an emoji for the purpose of the tone rule. `next` is the one after it. */
function isEmoji(point, next) {
  if (point === VARIATION_SELECTOR_16) return true;
  if (point >= REGIONAL_INDICATOR_FIRST && point <= REGIONAL_INDICATOR_LAST) return true;
  if (!PICTOGRAPHIC.test(String.fromCodePoint(point))) return false;
  // A legal mark is text by default and is banned only where an emoji presentation is asked for.
  if (TEXT_DEFAULT_MARKS.has(point)) return next === VARIATION_SELECTOR_16;
  return true;
}

const tracked = execFileSync('git', ['ls-files', '--', ...PATHSPECS], { encoding: 'utf8' })
  .split('\n')
  .filter((line) => line.length > 0);

/*
 * git ls-files reports the index. A file staged but deleted in the working tree is listed and
 * cannot be read, which happens while another change is in flight and is not this gate's business.
 * The skip is counted and printed rather than swallowed, so a scan that covered less than the
 * index says so out loud.
 */
const files = tracked.filter((file) => existsSync(file));
const skipped = tracked.length - files.length;

let found = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const points = [...text].map((character) => character.codePointAt(0) ?? 0);
  let line = 1;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point === 0x0a) {
      line += 1;
      continue;
    }
    if (isEmoji(point, points[i + 1])) {
      const hex = point.toString(16).toUpperCase().padStart(4, '0');
      console.log(`${file}:${line}: emoji U+${hex}`);
      found += 1;
    }
  }
}

if (skipped > 0) {
  console.log(`check-no-emoji: ${String(skipped)} tracked file(s) absent from the working tree, not scanned.`);
}

if (found === 0) {
  console.log(`check-no-emoji: OK - ${String(files.length)} file(s) clean.`);
  process.exit(0);
}

console.log(`check-no-emoji: FAIL - ${String(found)} emoji code point(s). The screens use icons, not emoji.`);
process.exit(1);
