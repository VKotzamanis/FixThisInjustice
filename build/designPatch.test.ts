// @vitest-environment node
//
// scripts/design-patch.mjs, driven as the command line it is.
//
// WHY THE REAL PROCESS AND NOT AN IMPORTED FUNCTION. The two guarantees that matter here are
// properties of the COMMAND: that it writes nothing without `--write`, and that it exits
// non-zero on a patch it refuses. Both are things a caller learns from the process, so the test
// runs the process. It acts on a temporary copy of the sheet, never on src/ui/styles/tokens.css.
//
// It lives in build/ rather than src/ because it needs node:fs and node:child_process, and
// tsconfig.app.json pins `types` to the vite client. build/ is the node-side project, and
// build/cspPlugin.test.ts already sets that precedent.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const SCRIPT = join(ROOT, 'scripts', 'design-patch.mjs');
const REAL_TOKENS = join(ROOT, 'src', 'ui', 'styles', 'tokens.css');

/** The trailing comment on the --band-surface line, which must survive a rewrite of that line. */
const TRAILING_COMMENT = "/* this skin's own --bg, the ground the table above measured */";

/** A comment near --accent, three lines of measured decision that must not move or change. */
const NEIGHBOUR_COMMENT = '--accent is the one the CSS actually rendered';

interface Run {
  readonly status: number;
  readonly stdout: string;
}

let dir = '';
let sheet = '';
let original = '';

function run(args: readonly string[]): Run {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    return { status: 0, stdout };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    return { status: failure.status ?? -1, stdout: failure.stdout ?? '' };
  }
}

function writePatch(name: string, body: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(body));
  return path;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'design-patch-'));
  sheet = join(dir, 'tokens.css');
  original = readFileSync(REAL_TOKENS, 'utf8');
  writeFileSync(sheet, original);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the applier without --write', () => {
  it('prints the diff and changes no byte of the sheet', () => {
    const patch = writePatch('p.json', {
      version: 1,
      generatedAt: '2026-09-10T00:00:00Z',
      tokens: { clinical: { '--accent': '#ff0000' } },
      copy: {},
      assets: [],
      notes: [],
    });

    const result = run([patch, '--tokens', sheet]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('-   --accent: #a3e635;');
    expect(result.stdout).toContain('+   --accent: #ff0000;');
    expect(result.stdout).toContain('DRY RUN. No file was written.');
    expect(readFileSync(sheet, 'utf8')).toBe(original);
  });
});

describe('the applier with --write', () => {
  it('rewrites the value and leaves the neighbouring comments untouched', () => {
    const patch = writePatch('p.json', {
      version: 1,
      generatedAt: '2026-09-10T00:00:00Z',
      tokens: { clinical: { '--accent': '#ff0000' } },
      copy: {},
      assets: [],
      notes: [],
    });

    const result = run([patch, '--tokens', sheet, '--write']);
    const after = readFileSync(sheet, 'utf8');

    expect(result.status).toBe(0);
    expect(after).toContain('  --accent: #ff0000;');
    expect(after).not.toContain('  --accent: #a3e635;');
    expect(after).toContain(NEIGHBOUR_COMMENT);
    // Every line except the one rewritten is identical, in the same order.
    const beforeLines = original.split('\n');
    const afterLines = after.split('\n');
    expect(afterLines.length).toBe(beforeLines.length);
    const differing = afterLines
      .map((line, i) => (line === beforeLines[i] ? null : i))
      .filter((i): i is number => i !== null);
    expect(differing.length).toBe(1);
  });

  it('preserves a comment that sits on the same line as the declaration', () => {
    const patch = writePatch('p.json', {
      version: 1,
      generatedAt: '2026-09-10T00:00:00Z',
      tokens: { clinical: { '--band-surface': '#123456' } },
      copy: {},
      assets: [],
      notes: [],
    });

    expect(run([patch, '--tokens', sheet, '--write']).status).toBe(0);
    expect(readFileSync(sheet, 'utf8')).toContain(`  --band-surface: #123456; ${TRAILING_COMMENT}`);
  });

  it('writes into the skin block the patch names, not the first block that matches', () => {
    const patch = writePatch('p.json', {
      version: 1,
      generatedAt: '2026-09-10T00:00:00Z',
      tokens: { board: { '--accent-rgb': '1, 2, 3' } },
      copy: {},
      assets: [],
      notes: [],
    });

    expect(run([patch, '--tokens', sheet, '--write']).status).toBe(0);
    const after = readFileSync(sheet, 'utf8');
    expect(after).toContain('  --accent-rgb: 1, 2, 3;');
    expect(after).toContain('  --accent-rgb: 163, 230, 53;'); // clinical, untouched
    expect(after).toContain('  --accent-rgb: 255, 95, 203;'); // limelight, untouched
  });
});

describe('the applier refuses rather than guesses', () => {
  it('refuses a version it does not recognise, writing nothing', () => {
    const patch = writePatch('p.json', {
      version: 2,
      tokens: { clinical: { '--accent': '#ff0000' } },
    });

    const result = run([patch, '--tokens', sheet, '--write']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('unrecognised patch version 2');
    expect(readFileSync(sheet, 'utf8')).toBe(original);
  });

  it('refuses a token the sheet does not already declare, writing nothing', () => {
    const patch = writePatch('p.json', {
      version: 1,
      tokens: { clinical: { '--invented-token': '#ff0000' } },
    });

    const result = run([patch, '--tokens', sheet, '--write']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('does not declare --invented-token');
    expect(result.stdout).toContain('A patch may not invent a token');
    expect(readFileSync(sheet, 'utf8')).toBe(original);
  });

  it('refuses a token that exists in another skin but not this one', () => {
    // --lime is declared by limelight and by no other block.
    const patch = writePatch('p.json', {
      version: 1,
      tokens: { clinical: { '--lime': '#00ff00' } },
    });

    const result = run([patch, '--tokens', sheet, '--write']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('clinical does not declare --lime');
    expect(readFileSync(sheet, 'utf8')).toBe(original);
  });

  it('refuses an unknown skin', () => {
    const patch = writePatch('p.json', { version: 1, tokens: { midnight: { '--bg': '#000' } } });
    const result = run([patch, '--tokens', sheet, '--write']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('unknown skin "midnight"');
  });

  it('refuses a value that would end the declaration early', () => {
    const patch = writePatch('p.json', {
      version: 1,
      tokens: { clinical: { '--accent': '#ff0000; } body { display: none' } },
    });
    const result = run([patch, '--tokens', sheet, '--write']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("may not contain ';'");
    expect(readFileSync(sheet, 'utf8')).toBe(original);
  });
});

describe('the applier reports what it did not do', () => {
  /*
   * REPLACED, NOT DELETED. This case asserted that BOTH `assets` and `notes` were warned about as
   * unimplemented, in the words "(Tasks 3 and 4)". `notes` are now implemented, in the only sense
   * a note can be: they are PRINTED as `[part] text` for a person to act on, and nothing is
   * written for them. src/design/r10Edits.ts records why a structural change is a note rather than
   * a rewritten array literal. `assets` is still Task 3's and is still warned about, so the half
   * of this case that still holds is kept verbatim and the half that was superseded says so.
   */
  it('warns about assets, and prints notes rather than warning about them', () => {
    const patch = writePatch('p.json', {
      version: 1,
      tokens: { clinical: { '--accent': '#ff0000' } },
      copy: {},
      assets: [{ registerRow: 'r1' }],
      notes: [{ part: 'setup.step3', text: 'move it left' }],
    });

    const result = run([patch, '--tokens', sheet]);

    expect(result.stdout).toContain('1 asset entries');
    expect(result.stdout).toContain('(Task 3)');
    expect(result.stdout).toContain('[setup.step3] move it left');
    expect(result.stdout).toContain('Nothing below was applied.');
  });
});

/*
 * ------------------------------------------------------------------------------------------
 * THE COPY HALF (Task 2).
 *
 * Every case below acts on a COPY of src/content, never on the tree itself, for the reason the
 * token half already gives. The property that earns the suite is the same one: the applier
 * rewrites a string literal and nothing else, so the 3000 lines of reasoning around it - which
 * brief added a key, which contract rule forced its wording - survive byte for byte.
 * ------------------------------------------------------------------------------------------
 */
/*
 * The three copy tables, plus the two long-form modules the R10 cases below act on:
 * `introSlides.ts` is the one module the registry reports editable, and
 * `guidanceReferences.ts` is the one the applier must refuse because the file on disk
 * carries thirty DOIs. Every case in this file asserts the files it did not name are
 * unchanged, so widening this list widens that guarantee too.
 */
const CONTENT_FILES = [
  'copy.ts',
  'copy.limelight.ts',
  'copy.board.ts',
  'introSlides.ts',
  'guidanceReferences.ts',
] as const;
const REAL_CONTENT = join(ROOT, 'src', 'content');

/** A throwaway copy of the three tables, and the bytes they started with. */
function contentCopy(): { dir: string; before: ReadonlyMap<string, string> } {
  const target = join(dir, 'content');
  mkdirSync(target, { recursive: true });
  const before = new Map<string, string>();
  for (const name of CONTENT_FILES) {
    const body = readFileSync(join(REAL_CONTENT, name), 'utf8');
    before.set(name, body);
    writeFileSync(join(target, name), body);
  }
  return { dir: target, before };
}

/** The current bytes of one file in the throwaway copy. */
function contentNow(target: string, name: string): string {
  return readFileSync(join(target, name), 'utf8');
}

describe('the copy half, without --write', () => {
  it('prints the diff and changes no byte of any table', () => {
    const { dir: content, before } = contentCopy();
    const patch = writePatch('p.json', {
      version: 1,
      generatedAt: '2026-09-10T00:00:00Z',
      tokens: {},
      copy: { clinical: { 'button.reload': 'Reload Now' } },
      assets: [],
      notes: [],
    });

    const result = run([patch, '--tokens', sheet, '--content', content]);

    expect(result.status).toBe(0);
    // The row's own two-space indent is inside the diff line, which is the point: the indent is
    // carried through rather than reconstructed.
    expect(result.stdout).toContain("-   'button.reload': 'Reload',");
    expect(result.stdout).toContain("+   'button.reload': 'Reload Now',");
    expect(result.stdout).toContain('DRY RUN. No file was written.');
    for (const name of CONTENT_FILES) {
      expect({ name, body: contentNow(content, name) }).toEqual({ name, body: before.get(name) });
    }
  });
});

describe('the copy half, with --write', () => {
  it('rewrites one row and leaves every other line identical', () => {
    const { dir: content, before } = contentCopy();
    const patch = writePatch('p.json', {
      version: 1,
      tokens: {},
      copy: { clinical: { 'button.reload': 'Reload Now' } },
      assets: [],
      notes: [],
    });

    // --no-regen: the catalogue scripts each start a Vite server, and this suite is about the
    // rewrite. The regeneration itself is asserted separately, below.
    const result = run([patch, '--tokens', sheet, '--content', content, '--write', '--no-regen']);
    const after = contentNow(content, 'copy.ts');

    expect(after).toContain("  'button.reload': 'Reload Now',");
    const beforeLines = (before.get('copy.ts') ?? '').split('\n');
    const afterLines = after.split('\n');
    expect(afterLines.length).toBe(beforeLines.length);
    const differing = afterLines
      .map((line, i) => (line === beforeLines[i] ? null : i))
      .filter((i): i is number => i !== null);
    expect(differing.length).toBe(1);
    // The other two tables were not opened for writing at all.
    expect(contentNow(content, 'copy.limelight.ts')).toBe(before.get('copy.limelight.ts'));
    expect(result.stdout).toContain('wrote 1 copy row(s)');
  });

  it('keeps the trailing comment on a row that carries one', () => {
    const { dir: content } = contentCopy();
    const patch = writePatch('p.json', {
      version: 1,
      tokens: {},
      copy: { clinical: { 'banner.loadInvalid.body': 'Stored data failed: {reason}.' } },
      assets: [],
      notes: [],
    });

    run([patch, '--tokens', sheet, '--content', content, '--write', '--no-regen']);

    expect(contentNow(content, 'copy.ts')).toContain(
      "    'Stored data failed: {reason}.', // template; FORMAT.loadInvalid",
    );
  });

  it('writes a skin edit to that skin table and never to the default', () => {
    const { dir: content, before } = contentCopy();
    const patch = writePatch('p.json', {
      version: 1,
      tokens: {},
      copy: { limelight: { 'status.rest': 'take five babes' } },
      assets: [],
      notes: [],
    });

    run([patch, '--tokens', sheet, '--content', content, '--write', '--no-regen']);

    expect(contentNow(content, 'copy.limelight.ts')).toContain(
      "  'status.rest': 'take five babes',",
    );
    // The clinical row is untouched: the two registers are separate decisions.
    expect(contentNow(content, 'copy.ts')).toBe(before.get('copy.ts'));
  });

  it('quotes a value carrying an apostrophe the way the tables already do', () => {
    const { dir: content } = contentCopy();
    const patch = writePatch('p.json', {
      version: 1,
      tokens: {},
      copy: { limelight: { 'status.rest': "catch ur breath, it's fine" } },
      assets: [],
      notes: [],
    });

    run([patch, '--tokens', sheet, '--content', content, '--write', '--no-regen']);

    expect(contentNow(content, 'copy.limelight.ts')).toContain(
      '  \'status.rest\': "catch ur breath, it\'s fine",',
    );
  });
});

describe('the copy half refuses rather than guesses', () => {
  it('refuses a key that is not already a row in the default table', () => {
    const { dir: content, before } = contentCopy();
    const patch = writePatch('p.json', {
      version: 1,
      tokens: {},
      copy: { clinical: { 'button.notAKeyAtAll': 'Go' } },
      assets: [],
      notes: [],
    });

    const result = run([patch, '--tokens', sheet, '--content', content, '--write', '--no-regen']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("does not declare 'button.notAKeyAtAll'");
    expect(result.stdout).toContain('a new CopyKey also needs a union entry');
    expect(contentNow(content, 'copy.ts')).toBe(before.get('copy.ts'));
  });

  it('refuses a real key the SKIN table does not already override', () => {
    const { dir: content, before } = contentCopy();
    const patch = writePatch('p.json', {
      version: 1,
      tokens: {},
      copy: { limelight: { 'button.reload': 'reload babes' } },
      assets: [],
      notes: [],
    });

    const result = run([patch, '--tokens', sheet, '--content', content, '--write', '--no-regen']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("copy.limelight.ts does not declare 'button.reload'");
    expect(contentNow(content, 'copy.limelight.ts')).toBe(before.get('copy.limelight.ts'));
  });

  it('refuses a row built by concatenating two literals', () => {
    const { dir: content } = contentCopy();
    const patch = writePatch('p.json', {
      version: 1,
      tokens: {},
      copy: { clinical: { 'advice.motivationClipLimit': 'The limit is {bytes} bytes.' } },
      assets: [],
      notes: [],
    });

    const result = run([patch, '--tokens', sheet, '--content', content, '--write', '--no-regen']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('built by concatenating literals');
  });

  it('refuses a value carrying a newline, an empty value and an unknown skin', () => {
    const { dir: content } = contentCopy();
    const cases: ReadonlyArray<readonly [unknown, string]> = [
      [{ clinical: { 'button.reload': 'one\ntwo' } }, 'one line'],
      [{ clinical: { 'button.reload': '' } }, 'value is empty'],
      [{ mystery: { 'button.reload': 'x' } }, 'unknown skin'],
      [{ clinical: { notAKey: 'x' } }, 'is not a copy key'],
      [[], 'must be an object'],
    ];
    for (const [copy, expected] of cases) {
      const patch = writePatch('p.json', { version: 1, tokens: {}, copy, assets: [], notes: [] });
      const result = run([patch, '--tokens', sheet, '--content', content]);
      expect({ expected, status: result.status }).toEqual({ expected, status: 1 });
      expect({ expected, ok: result.stdout.includes(expected) }).toEqual({ expected, ok: true });
    }
    // Five refusals means five real child processes, which is the point: each is a property of
    // the COMMAND, not of an imported function. The explicit budget is because five spawns on a
    // loaded machine can exceed the 20 s default, and a timeout here would read as a refusal that
    // stopped working rather than as a busy laptop.
  }, 60_000);

  it('refuses a value carrying a Design Mode marker character', () => {
    const { dir: content } = contentCopy();
    const patch = writePatch('p.json', {
      version: 1,
      tokens: {},
      // U+E0041 is a tag character: invisible, and never legitimately part of a copy string.
      copy: { clinical: { 'button.reload': `Reload${String.fromCodePoint(0xe0041)}` } },
      assets: [],
      notes: [],
    });

    const result = run([patch, '--tokens', sheet, '--content', content]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Design Mode marker character');
  });
});

describe('a copy change is not finished until the catalogue agrees', () => {
  it('refuses to exit clean when it could not regenerate, and prints the four commands', () => {
    const { dir: content } = contentCopy();
    const patch = writePatch('p.json', {
      version: 1,
      tokens: {},
      copy: { clinical: { 'button.reload': 'Reload Now' } },
      assets: [],
      notes: [],
    });

    // A throwaway content tree is not the shipped one, so regenerating against it would be
    // meaningless. The applier says so and exits non-zero rather than reporting success.
    const result = run([patch, '--tokens', sheet, '--content', content, '--write']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('the catalogue was not regenerated');
    expect(result.stdout).toContain('node scripts/alpha-catalogue.mjs');
    expect(result.stdout).toContain('node scripts/alpha-catalogue.mjs --check');
    expect(result.stdout).toContain('node scripts/alpha-walk-pages.mjs');
    expect(result.stdout).toContain('node scripts/alpha-walk-pages.mjs --check');
  });

  it('says the catalogue is stale when --no-regen was passed', () => {
    const { dir: content } = contentCopy();
    const patch = writePatch('p.json', {
      version: 1,
      tokens: {},
      copy: { clinical: { 'button.reload': 'Reload Now' } },
      assets: [],
      notes: [],
    });

    const result = run([patch, '--tokens', sheet, '--content', content, '--write', '--no-regen']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('The catalogue is now STALE');
  });
});

/*
 * ------------------------------------------------------------------------------------------
 * THE R10 HALF: long-form text, in the modules `copy()` never reaches.
 *
 * The property that earns this block is the one the whole widening turns on. `introSlides.ts` is
 * mostly a header recording why the slides read as they do, which brief supplied them, and which
 * feature slide 4 promises that the repository does not yet build. A rewrite that lost any of
 * that would be worse than not having the tool: the words could be retyped, the reasoning could
 * not. So every case asserts the module byte for byte outside the single literal it changed.
 * ------------------------------------------------------------------------------------------
 */

/** A bullet lead from slide 2. Long enough to be unambiguous, and the owner's own words. */
const INTRO_LEAD = 'Still the guy who shows up';

/** A header line that must survive every rewrite. */
const INTRO_HEADER = 'THE ASCII FIGURE IS ORIGINAL.';

function r10Patch(rows: readonly unknown[], notes: readonly unknown[] = []): unknown {
  return {
    version: 1,
    generatedAt: '2026-09-10T00:00:00Z',
    tokens: {},
    copy: {},
    r10: rows,
    assets: [],
    notes,
  };
}

/** One row, so each case names only what it is varying. */
function introRow(before: string, after: string): unknown {
  return {
    module: 'introSlides',
    file: 'src/content/introSlides.ts',
    field: 'INTRO_SLIDES.1.bullets.1.lead',
    before,
    after,
  };
}

describe('the R10 half', () => {
  it('prints the diff and changes no byte without --write', () => {
    const { dir: content, before } = contentCopy();
    expect(before.get('introSlides.ts')).toContain(`'${INTRO_LEAD}'`);
    const patch = writePatch('p.json', r10Patch([introRow(INTRO_LEAD, 'Still the one who turns up')]));

    const result = run([patch, '--tokens', sheet, '--content', content]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('introSlides  src/content/introSlides.ts');
    expect(result.stdout).toContain(`- '${INTRO_LEAD}'`);
    expect(result.stdout).toContain("+ 'Still the one who turns up'");
    expect(result.stdout).toContain('DRY RUN. No file was written.');
    for (const name of CONTENT_FILES) {
      expect({ name, body: contentNow(content, name) }).toEqual({ name, body: before.get(name) });
    }
  });

  it('rewrites the literal and leaves every comment in the module intact', () => {
    const { dir: content, before } = contentCopy();
    const patch = writePatch('p.json', r10Patch([introRow(INTRO_LEAD, 'Still the one who turns up')]));

    const result = run([patch, '--tokens', sheet, '--content', content, '--write', '--no-regen']);
    const after = contentNow(content, 'introSlides.ts');

    expect(result.status).toBe(0);
    expect(after).toContain("{ lead: 'Still the one who turns up', rest:");
    expect(after).not.toContain(`'${INTRO_LEAD}'`);
    expect(after).toContain(INTRO_HEADER);
    expect(after).toContain('decision: intro-slides-are-owner-editable-in-design-mode');
    expect(after).toContain('/** One bullet: an emphasised lead phrase, then the rest of the sentence. */');
    // The ONLY difference is that one literal.
    const shipped = before.get('introSlides.ts') ?? '';
    expect(after).toBe(shipped.replace(`'${INTRO_LEAD}'`, "'Still the one who turns up'"));
    expect(contentNow(content, 'copy.ts')).toBe(before.get('copy.ts'));
    expect(contentNow(content, 'guidanceReferences.ts')).toBe(before.get('guidanceReferences.ts'));
  });

  it('round-trips: the rewritten literal is what a second patch then finds as its before', () => {
    const { dir: content, before } = contentCopy();
    const first = writePatch('a.json', r10Patch([introRow(INTRO_LEAD, 'Still the one who turns up')]));
    run([first, '--tokens', sheet, '--content', content, '--write', '--no-regen']);

    const second = writePatch('b.json', r10Patch([introRow('Still the one who turns up', INTRO_LEAD)]));
    const back = run([second, '--tokens', sheet, '--content', content, '--write', '--no-regen']);

    expect(back.status).toBe(0);
    expect(contentNow(content, 'introSlides.ts')).toBe(before.get('introSlides.ts'));
  });

  /*
   * THE LOCK, RE-DERIVED FROM THE FILE ON DISK. The panel derives it too, in the browser, from
   * the module's own strings. This one answers a different question - "is the file I am about to
   * WRITE one that cites something" - and it is the one that holds when a patch generated last
   * week meets a module that gained a citation this morning.
   */
  it('refuses a module whose source carries a DOI, whatever the patch claims', () => {
    const { dir: content, before } = contentCopy();
    const patch = writePatch(
      'p.json',
      r10Patch([
        {
          module: 'guidanceReferences',
          file: 'src/content/guidanceReferences.ts',
          field: 'GUIDANCE_REFERENCES.0.title',
          before: 'anything',
          after: 'anything else',
        },
      ]),
    );

    const result = run([patch, '--tokens', sheet, '--content', content, '--write', '--no-regen']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('carries a DOI, so it is locked');
    expect(contentNow(content, 'guidanceReferences.ts')).toBe(before.get('guidanceReferences.ts'));
  });

  it('refuses a shipped string it cannot find, rather than guessing which row was meant', () => {
    const { dir: content, before } = contentCopy();
    const patch = writePatch(
      'p.json',
      r10Patch([introRow('a sentence that is not in the module', 'a replacement for it')]),
    );

    const result = run([patch, '--tokens', sheet, '--content', content, '--write', '--no-regen']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('does not contain the shipped text');
    expect(contentNow(content, 'introSlides.ts')).toBe(before.get('introSlides.ts'));
  });

  it('refuses a file outside src/content, and a module that disagrees with its file', () => {
    const { dir: content } = contentCopy();
    const outside = writePatch(
      'a.json',
      r10Patch([
        { module: 'nutrition', file: 'src/domain/nutrition.ts', field: 'X', before: 'a', after: 'b' },
      ]),
    );
    expect(run([outside, '--tokens', sheet, '--content', content]).stdout).toContain(
      'Only a file directly under src/content may be rewritten.',
    );

    const mismatched = writePatch(
      'b.json',
      r10Patch([
        { module: 'introSlides', file: 'src/content/copy.ts', field: 'X', before: 'a', after: 'b' },
      ]),
    );
    expect(run([mismatched, '--tokens', sheet, '--content', content]).stdout).toContain('disagree');
  });

  it('refuses a replacement carrying a Design Mode marker or a newline', () => {
    const { dir: content } = contentCopy();
    const marker = writePatch('a.json', r10Patch([introRow(INTRO_LEAD, 'Still the guy\u{E0001}')]));
    expect(run([marker, '--tokens', sheet, '--content', content]).stdout).toContain(
      'Design Mode marker character',
    );

    const newline = writePatch('b.json', r10Patch([introRow(INTRO_LEAD, 'Still\nthe guy')]));
    expect(run([newline, '--tokens', sheet, '--content', content]).stdout).toContain('one line');
  });

  /*
   * NOTES ARE PRINTED AND NOTHING IS APPLIED FOR THEM. src/design/r10Edits.ts records why
   * promoting a bullet to a heading and deleting one arrive as instructions: rewriting a nested
   * array literal means GENERATING source lines, and a comment above a deleted bullet then has no
   * defined destination.
   */
  it('prints a note as [part] text and writes nothing for it', () => {
    const { dir: content, before } = contentCopy();
    const patch = writePatch(
      'p.json',
      r10Patch([], [{ part: 'introSlides:INTRO_SLIDES.3.bullets.1.lead', text: 'Delete this.' }]),
    );

    const result = run([patch, '--tokens', sheet, '--content', content, '--write', '--no-regen']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[introSlides:INTRO_SLIDES.3.bullets.1.lead] Delete this.');
    expect(result.stdout).toContain('Nothing below was applied.');
    expect(contentNow(content, 'introSlides.ts')).toBe(before.get('introSlides.ts'));
  });
});
