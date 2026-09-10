#!/usr/bin/env node
/**
 * Applies a Design Mode patch back to src/ui/styles/tokens.css.
 *
 *   node scripts/design-patch.mjs <patch.json>            print the diff, write nothing
 *   node scripts/design-patch.mjs <patch.json> --write    apply it
 *   node scripts/design-patch.mjs <patch.json> --tokens <path>   act on another sheet (tests)
 *
 * IT NEVER WRITES ON ONE ARGUMENT. Without `--write` it prints the diff and exits, having
 * touched nothing. This edits the source of an app that makes health claims; a tool that edits
 * on a single argument is a tool that eventually eats something a reviewer never saw.
 *
 * IT REWRITES THE VALUE AND NOTHING ELSE. The replacement is per LINE and touches only the text
 * between the colon and the semicolon: the indentation, the token name, the semicolon and any
 * trailing comment on that line survive byte for byte, and every other line in the file is
 * copied through untouched. tokens.css is heavily commented and those comments carry MEASURED
 * contrast figures and recorded decisions - the band table, the round-three ratio list, the
 * w1.03 defect note. Destroying them is not acceptable, so nothing here parses CSS or
 * re-serialises it.
 *
 * IT REFUSES RATHER THAN GUESSES:
 *   - a `version` it does not recognise;
 *   - a skin that is not one of the three the sheet declares;
 *   - a token name that is not ALREADY declared in that skin's block. A patch must not invent a
 *     token: an invented name would land in no block, or in the wrong one, and a token that
 *     exists in one skin and not another is the "CRT green leaking into a lime page" failure
 *     src/skins/tokens.test.ts exists to catch;
 *   - a value carrying `;`, `}` or a newline, which would end the declaration early and corrupt
 *     every rule after it.
 *
 * `copy`, `assets` and `notes` belong to Tasks 2, 3 and 4 of
 * docs/plans/2026-09-10-16-design-mode.md and are not implemented here. A patch carrying any of
 * them is applied for its TOKENS and warned about loudly for the rest, so nothing is half
 * applied without the operator being told which half.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit, stdout } from 'node:process';

/** The only patch version this applier understands. Matches PATCH_VERSION in src/design. */
const SUPPORTED_VERSION = 1;

/** The three skins, by the selector that opens their block. Mirrors src/design/tokenSheet.ts. */
const SKIN_SELECTOR = {
  clinical: ':root {',
  limelight: ":root[data-skin='limelight'] {",
  board: ":root[data-skin='board'] {",
};

const DEFAULT_TOKENS = new URL('../src/ui/styles/tokens.css', import.meta.url).pathname;

function fail(message) {
  stdout.write(`design-patch: ${message}\n`);
  exit(1);
}

/** The command line, as an object. Unknown flags are refused rather than ignored. */
function parseArgs(args) {
  const parsed = { patch: undefined, tokens: DEFAULT_TOKENS, write: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--write') {
      parsed.write = true;
    } else if (arg === '--tokens') {
      i += 1;
      parsed.tokens = args[i];
      if (parsed.tokens === undefined) fail('--tokens needs a path');
    } else if (arg.startsWith('--')) {
      fail(`unknown flag ${arg}`);
    } else if (parsed.patch === undefined) {
      parsed.patch = arg;
    } else {
      fail('give exactly one patch file');
    }
  }
  if (parsed.patch === undefined) {
    fail('usage: node scripts/design-patch.mjs <patch.json> [--write] [--tokens <path>]');
  }
  return parsed;
}

/** Reads and validates the patch. Every refusal names the field that caused it. */
function readPatch(path) {
  let body;
  try {
    body = readFileSync(path, 'utf8');
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
  let patch;
  try {
    patch = JSON.parse(body);
  } catch (error) {
    fail(`${path} is not JSON: ${error.message}`);
  }
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    fail('a patch must be a JSON object');
  }
  if (patch.version !== SUPPORTED_VERSION) {
    fail(
      `unrecognised patch version ${JSON.stringify(patch.version)}. ` +
        `This applier understands version ${SUPPORTED_VERSION} and refuses anything else.`,
    );
  }
  if (typeof patch.tokens !== 'object' || patch.tokens === null || Array.isArray(patch.tokens)) {
    fail('patch.tokens must be an object of skin to token map');
  }
  for (const [skin, map] of Object.entries(patch.tokens)) {
    if (!Object.hasOwn(SKIN_SELECTOR, skin)) {
      fail(`unknown skin ${JSON.stringify(skin)}. The sheet declares clinical, limelight, board.`);
    }
    if (typeof map !== 'object' || map === null || Array.isArray(map)) {
      fail(`patch.tokens.${skin} must be an object of token to value`);
    }
    for (const [name, value] of Object.entries(map)) {
      if (!/^--[a-z0-9-]+$/i.test(name)) fail(`${skin}: ${name} is not a custom property name`);
      if (typeof value !== 'string') fail(`${skin}.${name}: value must be a string`);
      if (/[;}\n\r]/.test(value)) {
        fail(`${skin}.${name}: a value may not contain ';', '}' or a newline`);
      }
      if (value.trim() === '') fail(`${skin}.${name}: value is empty`);
    }
  }
  return patch;
}

/**
 * The half-open line range [from, to) of one skin's token block.
 *
 * The block ends at the first line that is exactly `}`, which is how every top-level rule in
 * this sheet closes. Nested rules inside the file come AFTER that line, so they are never
 * searched and a token name that also appears in one of them cannot be matched by mistake.
 */
function blockRange(lines, skin) {
  const selector = SKIN_SELECTOR[skin];
  const from = lines.findIndex((line) => line.trimEnd() === selector.trimEnd());
  if (from === -1) fail(`the sheet has no block for ${skin} (${selector})`);
  const relative = lines.slice(from + 1).findIndex((line) => line.trimEnd() === '}');
  if (relative === -1) fail(`the ${skin} block is never closed`);
  return [from + 1, from + 1 + relative];
}

/** The single line in [from, to) that declares `name`, or a refusal. */
function declarationLine(lines, from, to, skin, name) {
  const pattern = new RegExp(`^(\\s*)(${name})(\\s*:\\s*)([^;]*)(;.*)$`);
  const hits = [];
  for (let i = from; i < to; i += 1) {
    if (pattern.test(lines[i])) hits.push(i);
  }
  if (hits.length === 0) {
    fail(
      `${skin} does not declare ${name}. A patch may not invent a token: add it to ` +
        'src/ui/styles/tokens.css by hand, with the comment that says why it exists.',
    );
  }
  if (hits.length > 1) {
    fail(`${skin} declares ${name} on ${hits.length} lines. Refusing to guess which one.`);
  }
  return { index: hits[0], pattern };
}

function main() {
  const args = parseArgs(argv.slice(2));
  const patch = readPatch(args.patch);

  let sheet;
  try {
    sheet = readFileSync(args.tokens, 'utf8');
  } catch (error) {
    fail(`cannot read ${args.tokens}: ${error.message}`);
  }
  const lines = sheet.split('\n');

  const changes = [];
  for (const [skin, map] of Object.entries(patch.tokens)) {
    const [from, to] = blockRange(lines, skin);
    for (const [name, value] of Object.entries(map)) {
      const { index, pattern } = declarationLine(lines, from, to, skin, name);
      const before = lines[index];
      // Only group 4, the value, is replaced. Indent, name, colon, semicolon and any trailing
      // comment on the line are carried through by the other groups.
      const after = before.replace(pattern, `$1$2$3${value.trim()}$5`);
      if (before === after) continue;
      changes.push({ skin, name, line: index + 1, before, after });
      lines[index] = after;
    }
  }

  for (const field of ['copy', 'assets', 'notes']) {
    const carried = patch[field];
    const size = Array.isArray(carried)
      ? carried.length
      : typeof carried === 'object' && carried !== null
        ? Object.keys(carried).length
        : 0;
    if (size > 0) {
      stdout.write(
        `design-patch: WARNING. This patch carries ${size} ${field} entries and this applier ` +
          `does NOT implement them (Tasks 2 to 4). They were NOT applied.\n`,
      );
    }
  }

  if (changes.length === 0) {
    stdout.write('design-patch: nothing to change. Every patched value already matches the sheet.\n');
    exit(0);
  }

  stdout.write(`design-patch: ${changes.length} declaration(s) in ${args.tokens}\n\n`);
  for (const change of changes) {
    stdout.write(`  ${change.skin}  line ${change.line}\n`);
    stdout.write(`  - ${change.before}\n`);
    stdout.write(`  + ${change.after}\n\n`);
  }

  if (!args.write) {
    stdout.write('design-patch: DRY RUN. No file was written. Re-run with --write to apply.\n');
    exit(0);
  }

  writeFileSync(args.tokens, lines.join('\n'));
  stdout.write(`design-patch: wrote ${changes.length} declaration(s) to ${args.tokens}.\n`);
  stdout.write('design-patch: run npx vitest run src/skins/tokens.test.ts src/app/topbar.test.ts next.\n');
}

main();
