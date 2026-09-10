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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  it('warns loudly about copy, assets and notes rather than half applying them', () => {
    const patch = writePatch('p.json', {
      version: 1,
      tokens: { clinical: { '--accent': '#ff0000' } },
      copy: { 'button.start': 'Go' },
      assets: [{ registerRow: 'r1' }],
      notes: ['[part] move it left'],
    });

    const result = run([patch, '--tokens', sheet]);

    expect(result.stdout).toContain('1 copy entries and this applier does NOT implement them');
    expect(result.stdout).toContain('1 assets entries');
    expect(result.stdout).toContain('1 notes entries');
  });
});
