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
 * THE COPY HALF (Task 2) OBEYS THE SAME THREE RULES. It rewrites the STRING LITERAL of a row that
 * already exists, in place, so the key, the indentation, the trailing comma, the trailing comment
 * and every comment around it survive byte for byte. `src/content/copy.ts` is 3000 lines of which
 * a large fraction is the reasoning behind individual rows - which brief added a key, which
 * contract rule forced its wording, which call site earns its exemption - and re-serialising the
 * table would destroy all of it.
 *
 *   - it refuses a key that is not already a row in `DEFAULT_COPY`, because inventing a `CopyKey`
 *     also needs a union entry, a part in scripts/alpha-parts.mjs and a step in
 *     scripts/alpha-walk.mjs, none of which a patch can supply;
 *   - it refuses a key the TARGET table does not already declare. A skin override is optional by
 *     design and `copy.limelight.ts` says in its own header that a row exists "only where the
 *     WORDS change"; inserting one would put a line in that file with no comment saying why;
 *   - it refuses a row it cannot rewrite unambiguously: a value built by concatenating two
 *     literals, or one that does not close on the line it opens on.
 *
 * AND IT REGENERATES THE CATALOGUE, OR REFUSES TO FINISH. `docs/feedback/catalogue.json` pins
 * every copy string byte for byte and `src/content/alphaCatalogue.test.ts` asserts it, so a copy
 * change without regeneration is a red suite. After a successful copy write this runs
 * alpha-catalogue and alpha-walk-pages, generate then --check, and exits non-zero if it cannot.
 *
 * `assets` and `notes` belong to Tasks 3 and 4 and are not implemented. A patch carrying either
 * is applied for the rest and warned about loudly, so nothing is half applied without the
 * operator being told which half.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { argv, execPath, exit, stdout } from 'node:process';

/** The only patch version this applier understands. Matches PATCH_VERSION in src/design. */
const SUPPORTED_VERSION = 1;

/** The three skins, by the selector that opens their block. Mirrors src/design/tokenSheet.ts. */
const SKIN_SELECTOR = {
  clinical: ':root {',
  limelight: ":root[data-skin='limelight'] {",
  board: ":root[data-skin='board'] {",
};

const DEFAULT_TOKENS = new URL('../src/ui/styles/tokens.css', import.meta.url).pathname;

const ROOT = new URL('..', import.meta.url).pathname;
const DEFAULT_CONTENT = new URL('../src/content/', import.meta.url).pathname;

/** Per skin, the file its copy rows live in and the binding that opens the table. */
const COPY_TABLE = {
  clinical: { file: 'copy.ts', open: 'export const DEFAULT_COPY: Readonly<Record<CopyKey, string>> = {' },
  limelight: {
    file: 'copy.limelight.ts',
    open: 'export const LIMELIGHT_COPY: Readonly<Partial<Record<CopyKey, string>>> = {',
  },
  board: {
    file: 'copy.board.ts',
    open: 'export const BOARD_COPY: Readonly<Partial<Record<CopyKey, string>>> = {',
  },
};

/**
 * The four commands a copy change obliges, in the order they must run.
 *
 * docs/plans/subagent-briefs/00-CONTEXT.md calls this "the trap that catches everyone":
 * `docs/feedback/catalogue.json` pins every copy string byte for byte and
 * `src/content/alphaCatalogue.test.ts` asserts it, so a rewritten row without a regenerated
 * catalogue is a red suite that names a file the author never opened.
 */
const REGEN = [
  ['scripts/alpha-catalogue.mjs'],
  ['scripts/alpha-catalogue.mjs', '--check'],
  ['scripts/alpha-walk-pages.mjs'],
  ['scripts/alpha-walk-pages.mjs', '--check'],
];

function fail(message) {
  stdout.write(`design-patch: ${message}\n`);
  exit(1);
}

/** The command line, as an object. Unknown flags are refused rather than ignored. */
function parseArgs(args) {
  const parsed = {
    patch: undefined,
    tokens: DEFAULT_TOKENS,
    content: DEFAULT_CONTENT,
    write: false,
    regen: true,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--write') {
      parsed.write = true;
    } else if (arg === '--no-regen') {
      parsed.regen = false;
    } else if (arg === '--tokens') {
      i += 1;
      parsed.tokens = args[i];
      if (parsed.tokens === undefined) fail('--tokens needs a path');
    } else if (arg === '--content') {
      i += 1;
      parsed.content = args[i];
      if (parsed.content === undefined) fail('--content needs a directory');
      if (!parsed.content.endsWith('/')) parsed.content += '/';
    } else if (arg.startsWith('--')) {
      fail(`unknown flag ${arg}`);
    } else if (parsed.patch === undefined) {
      parsed.patch = arg;
    } else {
      fail('give exactly one patch file');
    }
  }
  if (parsed.patch === undefined) {
    fail(
      'usage: node scripts/design-patch.mjs <patch.json> [--write] [--no-regen] ' +
        '[--tokens <path>] [--content <dir>]',
    );
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
  readCopyPatch(patch);
  return patch;
}

/**
 * Validates `patch.copy` in the same spirit as `patch.tokens`: every refusal names its field.
 *
 * The shape is `{ <skin>: { <CopyKey>: <string> } }`, keyed by skin exactly as `tokens` is.
 * src/design/copyEdits.ts records why: a flat `{ key: value }` map carries no skin, so this
 * applier would have to GUESS which of the three tables a key came from, and guessing wrong files
 * a Title-Case clinical sentence into a table whose whole register is lower case, where R14 - by
 * design - does not scan.
 */
function readCopyPatch(patch) {
  const copy = patch.copy ?? {};
  if (typeof copy !== 'object' || copy === null || Array.isArray(copy)) {
    fail('patch.copy must be an object of skin to key map');
  }
  for (const [skin, map] of Object.entries(copy)) {
    if (!Object.hasOwn(COPY_TABLE, skin)) {
      fail(`unknown skin ${JSON.stringify(skin)} in patch.copy. The tables are clinical, limelight, board.`);
    }
    if (typeof map !== 'object' || map === null || Array.isArray(map)) {
      fail(`patch.copy.${skin} must be an object of copy key to string`);
    }
    for (const [key, value] of Object.entries(map)) {
      if (!/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/.test(key)) {
        fail(`patch.copy.${skin}: ${JSON.stringify(key)} is not a copy key`);
      }
      if (typeof value !== 'string') fail(`patch.copy.${skin}.${key}: value must be a string`);
      if (value === '') fail(`patch.copy.${skin}.${key}: value is empty`);
      if (/[\n\r\t]/.test(value)) {
        fail(`patch.copy.${skin}.${key}: a copy string is one line and holds no tab`);
      }
      /*
       * Design Mode carries the copy key to the DOM as Unicode tag characters (U+E0000 block),
       * and the layer strips them before it ever reads a node. One arriving here would mean the
       * strip was skipped somewhere, and writing it into the table would put an invisible
       * character into `catalogue.json` that nobody could see in a diff.
       */
      if (/[\u{E0000}-\u{E007F}]/u.test(value)) {
        fail(`patch.copy.${skin}.${key}: the value carries a Design Mode marker character`);
      }
    }
  }
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

/* ------------------------------------------------------------------------------------------- *
 * The copy half.
 * ------------------------------------------------------------------------------------------- */

/** The half-open line range of one copy table's object literal, found by its `export const` line. */
function copyBlockRange(lines, skin, file) {
  const open = COPY_TABLE[skin].open;
  const from = lines.findIndex((line) => line.trimEnd() === open);
  if (from === -1) fail(`${file} has no line "${open}". Refusing to guess where the table starts.`);
  const relative = lines.slice(from + 1).findIndex((line) => line.trimEnd() === '};');
  if (relative === -1) fail(`the table in ${file} is never closed`);
  return [from + 1, from + 1 + relative];
}

/**
 * A JavaScript single- or double-quoted literal starting at `line[start]`, or null.
 *
 * Returns the index one past its closing quote. Escapes are honoured so an apostrophe written as
 * `\'` does not end the literal early.
 */
function literalEnd(line, start) {
  const quote = line[start];
  if (quote !== "'" && quote !== '"') return null;
  for (let i = start + 1; i < line.length; i += 1) {
    if (line[i] === '\\') {
      i += 1;
      continue;
    }
    if (line[i] === quote) return i + 1;
  }
  return null;
}

/**
 * Where the value literal for `key` sits, or a refusal.
 *
 * Two shapes exist in these tables and both are handled: the value on the key's own line, and the
 * value on the line after a key line that ends at the colon. A THIRD shape is refused rather than
 * guessed at - a value built by concatenating literals across lines, as
 * `advice.motivationClipLimit` is - because re-wrapping it means choosing where the join goes,
 * and a tool that picks a line break inside a sentence has started writing copy.
 */
function copyRow(lines, from, to, skin, key, file) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyPattern = new RegExp(`^(\\s*)'${escaped}':(.*)$`);
  const hits = [];
  for (let i = from; i < to; i += 1) {
    if (keyPattern.test(lines[i])) hits.push(i);
  }
  if (hits.length === 0) {
    fail(
      `${file} does not declare '${key}'. A patch may not add a row: a new CopyKey also needs a ` +
        'union entry, a part in scripts/alpha-parts.mjs and a step in scripts/alpha-walk.mjs, and ' +
        'a new skin override needs the comment that says why the skin has its own words.',
    );
  }
  if (hits.length > 1) {
    fail(`${file} declares '${key}' on ${hits.length} lines. Refusing to guess which one.`);
  }

  const keyIndex = hits[0];
  const rest = lines[keyIndex].match(keyPattern)[2];
  let index = keyIndex;
  let start = rest.trim() === '' ? -1 : lines[keyIndex].length - rest.length + rest.search(/\S/);
  if (start === -1) {
    index = keyIndex + 1;
    if (index >= to) fail(`${file}: '${key}' has no value line`);
    start = lines[index].search(/\S/);
  }

  const end = literalEnd(lines[index], start);
  if (end === null) {
    fail(
      `${file}: the value for '${key}' does not open and close a string literal on one line. ` +
        'Edit that row by hand.',
    );
  }
  const tail = lines[index].slice(end).trim();
  if (tail.startsWith('+')) {
    fail(
      `${file}: '${key}' is built by concatenating literals. Rewriting it means choosing where ` +
        'the line break goes, which is a decision for a person. Edit that row by hand.',
    );
  }
  if (!tail.startsWith(',') && tail !== '') {
    fail(`${file}: the row for '${key}' ends in ${JSON.stringify(tail)}, which is not a comma.`);
  }
  return { index, start, end };
}

/** `value` as a source literal, quoted the way the tables already quote such a string. */
function quoteValue(value) {
  const escaped = value.replace(/\\/g, '\\\\');
  if (!escaped.includes("'")) return `'${escaped}'`;
  // The tables already do this: copy.limelight.ts writes "LET'S GO BABES" in double quotes rather
  // than escaping the apostrophe, because an escaped quote inside a sentence is harder to read.
  if (!escaped.includes('"')) return `"${escaped}"`;
  return `'${escaped.replace(/'/g, "\\'")}'`;
}

/**
 * Runs the four commands a copy change obliges, or says exactly which four to run.
 *
 * Returns true when the tree is consistent again. It refuses to finish silently either way: the
 * one outcome this must never produce is a rewritten table, a stale `catalogue.json` and no word
 * about the gap.
 */
function regenerate(args) {
  // The explicit flag is honoured first: an operator who asked not to regenerate is told the
  // consequence in those terms, rather than being given a reason he did not choose.
  if (!args.regen) {
    stdout.write('\ndesign-patch: --no-regen. The catalogue is now STALE. Run:\n');
    printRegen();
    return false;
  }
  if (args.content !== DEFAULT_CONTENT) {
    stdout.write(
      '\ndesign-patch: copy rows were written to a tree that is NOT src/content, so the ' +
        'catalogue was not regenerated. Against the real tree, run:\n',
    );
    printRegen();
    return false;
  }
  stdout.write('\ndesign-patch: regenerating the catalogue and the walk pages.\n');
  for (const command of REGEN) {
    stdout.write(`  node ${command.join(' ')}\n`);
    const run = spawnSync(execPath, command, { cwd: ROOT, encoding: 'utf8' });
    if (run.stdout) stdout.write(`${run.stdout}`);
    if (run.status !== 0) {
      stdout.write(`design-patch: node ${command.join(' ')} exited ${run.status}. Stopping here.\n`);
      return false;
    }
  }
  stdout.write('design-patch: catalogue and walk pages regenerated.\n');
  return true;
}

function printRegen() {
  for (const command of REGEN) stdout.write(`  node ${command.join(' ')}\n`);
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

  /*
   * THE COPY ROWS. `clinical` is the DEFAULT table, which is also the membership test every other
   * skin's row has to pass: a key the default table does not declare is not a `CopyKey` at all,
   * whatever file the patch aims it at.
   */
  const copyFiles = new Map(); // absolute path -> lines
  const copyChanges = [];
  const defaultPath = `${args.content}${COPY_TABLE.clinical.file}`;
  for (const [skin, map] of Object.entries(patch.copy ?? {})) {
    const path = `${args.content}${COPY_TABLE[skin].file}`;
    for (const source of new Set([defaultPath, path])) {
      if (copyFiles.has(source)) continue;
      try {
        copyFiles.set(source, readFileSync(source, 'utf8').split('\n'));
      } catch (error) {
        fail(`cannot read ${source}: ${error.message}`);
      }
    }
    const defaultLines = copyFiles.get(defaultPath);
    const [defaultFrom, defaultTo] = copyBlockRange(defaultLines, 'clinical', COPY_TABLE.clinical.file);
    const targetLines = copyFiles.get(path);
    const [from, to] = copyBlockRange(targetLines, skin, COPY_TABLE[skin].file);

    for (const [key, value] of Object.entries(map)) {
      // A CopyKey is a row in the default table. Checked even for a skin patch, so an invented
      // key cannot slip in through a file whose rows are optional by design.
      copyRow(defaultLines, defaultFrom, defaultTo, 'clinical', key, COPY_TABLE.clinical.file);
      const row = copyRow(targetLines, from, to, skin, key, COPY_TABLE[skin].file);
      const before = targetLines[row.index];
      const after =
        before.slice(0, row.start) + quoteValue(value) + before.slice(row.end);
      if (before === after) continue;
      copyChanges.push({
        skin,
        key,
        file: COPY_TABLE[skin].file,
        path,
        line: row.index + 1,
        before,
        after,
      });
      targetLines[row.index] = after;
    }
  }

  for (const field of ['assets', 'notes']) {
    const carried = patch[field];
    const size = Array.isArray(carried)
      ? carried.length
      : typeof carried === 'object' && carried !== null
        ? Object.keys(carried).length
        : 0;
    if (size > 0) {
      stdout.write(
        `design-patch: WARNING. This patch carries ${size} ${field} entries and this applier ` +
          `does NOT implement them (Tasks 3 and 4). They were NOT applied.\n`,
      );
    }
  }

  if (changes.length === 0 && copyChanges.length === 0) {
    stdout.write('design-patch: nothing to change. Every patched value already matches the source.\n');
    exit(0);
  }

  if (changes.length > 0) {
    stdout.write(`design-patch: ${changes.length} declaration(s) in ${args.tokens}\n\n`);
    for (const change of changes) {
      stdout.write(`  ${change.skin}  line ${change.line}\n`);
      stdout.write(`  - ${change.before}\n`);
      stdout.write(`  + ${change.after}\n\n`);
    }
  }

  if (copyChanges.length > 0) {
    stdout.write(`design-patch: ${copyChanges.length} copy row(s)\n\n`);
    for (const change of copyChanges) {
      stdout.write(`  ${change.skin}  ${change.file}  line ${change.line}  ${change.key}\n`);
      stdout.write(`  - ${change.before}\n`);
      stdout.write(`  + ${change.after}\n\n`);
    }
  }

  if (!args.write) {
    stdout.write('design-patch: DRY RUN. No file was written. Re-run with --write to apply.\n');
    exit(0);
  }

  if (changes.length > 0) {
    writeFileSync(args.tokens, lines.join('\n'));
    stdout.write(`design-patch: wrote ${changes.length} declaration(s) to ${args.tokens}.\n`);
    stdout.write(
      'design-patch: run npx vitest run src/skins/tokens.test.ts src/app/topbar.test.ts next.\n',
    );
  }

  if (copyChanges.length === 0) return;

  const touched = new Set(copyChanges.map((change) => change.path));
  for (const path of touched) writeFileSync(path, copyFiles.get(path).join('\n'));
  stdout.write(
    `design-patch: wrote ${copyChanges.length} copy row(s) to ${[...touched].join(', ')}.\n`,
  );

  /*
   * A COPY CHANGE IS NOT FINISHED UNTIL THE CATALOGUE AGREES WITH IT. Exiting non-zero when the
   * regeneration did not happen is the point: a zero exit here would say the tree is consistent,
   * and the next person to run the suite would find out otherwise from a fixture diff.
   */
  if (!regenerate(args)) exit(1);
  stdout.write('design-patch: run npx vitest run, plus check-title-case and check-no-emoji, next.\n');
}

main();
