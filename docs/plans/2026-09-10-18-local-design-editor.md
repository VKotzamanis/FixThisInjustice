# Local Design Editor Implementation Plan

<!-- decision: local-design-editor | status: adopted | supersedes: design-mode-in-place-editing -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Codex is the implementer (`codex-subagent` skill, persona `implementer`); Claude reviews between tasks.

**Goal:** A two-pane editor the owner runs on his own machine: the live app in a preview frame on one side, a plain form for tokens, copy and intro text on the other, with UPDATE writing the form to the source files and refreshing the preview, and SAVE committing. The deployed app carries no editor at all.

**Architecture:** `design.html` is a second HTML page the Vite dev server serves and the build never emits. It mounts `src/designEditor/`, a small React app that imports the same registries the app renders from (`tokenSheet.ts`, `copy.ts`, `r10Text.ts`) and holds a draft as the existing `StoredEdits` shape. UPDATE posts `buildPatch(draft)` to a dev-only Vite plugin route which runs the existing `scripts/design-patch.mjs --write`; Vite's HMR then refreshes the preview iframe from the rewritten source. REVERT and SAVE run `git checkout --` and `git commit` over one fixed path set. The keystroke problem cannot recur because the form and the app are two documents: a key pressed in the parent page is never delivered to the iframe.

**Tech Stack:** Vite 8.2.2 dev server (multi-page HTML in dev), React 19, TypeScript 5.9, vitest 4 with Testing Library and jsdom, Node `child_process`, git. No new dependency.

## Why this shape, and what was rejected

- **Patch the in-place editor's event leakage.** Rejected. `src/ui/intro/IntroSequence.tsx:90` advances on every `keydown` at the window, and `:107` on every click of the slide. `src/design/CopyEditLayer.tsx` already stops propagation in the capture phase (`:606`) and already has to make it conditional (`:530`), and it sets `contenteditable` on labels that own form controls (`:262`). The tap that places a caret is the tap that advances the slide. One document for the editing surface and the app's input surface is the defect; it is not a missing `stopPropagation`.
- **Two panes inside the deployed app, live-applied over `postMessage`.** Rejected. It needs a runtime override store in the app, a second apply path beside `scripts/design-patch.mjs` that can disagree with it (the two-copies defect class `docs/HANDOFF-2026-09-10.md` section 4 records nine instances of), it keeps Design Mode in the shipped bundle against requirement (a), and it keeps the deploy and service-worker cycle that made the last version unusable for eight hours.
- **A standalone editor in another language.** Rejected. The token list, the 583 copy keys, the two skin tables and the evidence lock are TypeScript modules. An editor outside Vite would re-parse them and hold a second registry; `src/design/tokenSheet.ts`'s own header records why that rots. Same language is not a constraint imposed on the tool, it is where the registries already are.
- **Live-apply tokens without writing.** Rejected as unnecessary. `tokens.css` is a plain CSS import in `src/main.tsx`, so a write to it is hot-swapped by Vite with no reload. Copy and intro edits cause a full reload of the preview page (the module graph runs `copy.ts` -> `src/domain/motivation/trigger.ts` -> store -> `src/main.tsx`, which accepts nothing), and the app restores its active view from its own session mirror (`src/app/App.tsx:80`), so the reload lands on the same screen.

## Global Constraints

- No new npm dependency.
- The deployed bundle carries no editor: `dist/design.html` must not exist, and `?design=1` renders nothing (Task 5).
- Never restate a constant. Import `SHEET`, `DEFAULT_COPY`, `copyFor`, `R10_MODULES`, `TABLE_FILE`, `buildPatch`, `SKIN_IDS`. The one new list, `DESIGN_WRITE_SET`, has a test reading both sides (Task 1).
- The copy contract is enforced as he types (`validateCopyEdit`, `validateR10Edit`) and again at SAVE by `scripts/check-title-case.mjs` and `scripts/check-no-emoji.mjs`. Nothing is silently corrected; a refusal is shown with the rule and the string.
- `localStorage` and `sessionStorage` are reached only through `src/design/designStorage.ts` (eslint `no-restricted-globals`).
- Tests run as `npx vitest run --maxWorkers=1 <paths>`. `Test timed out` is not an assertion failure; check for `AssertionError` before reporting one.
- Work in a worktree branched from CURRENT main: `git merge main` first, report both commits. Commit per task with a pathspec.
- Gates before every commit: `npx tsc -b --force`, `npx eslint ./src ./scripts ./build`, `node scripts/check-no-emoji.mjs`, `node scripts/check-title-case.mjs`.
- Sizes in KiB, measured, never estimated.

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/config/designProtocol.ts` | The contract both sides share: route names, reply shape, the write set. Dependency-free, compiled by both tsconfigs (precedent: `src/config/videoInstances.ts`). |
| `build/designServer.ts` | Dev-only Vite plugin. Four routes under `/__design/`. Spawns the applier, the gates and git. Handler is pure over an injected runner. |
| `build/cspPlugin.ts` | Unchanged policy for the app; `frame-src 'self'` for `design.html` only, or the preview iframe is refused. |
| `design.html` | The editor page. Root-level HTML the dev server serves and `vite build` never emits (`build.rollupOptions.input` defaults to `index.html`). |
| `src/designEditor/main.tsx` | Mounts the editor. Imports `editor.css`, never `tokens.css`. |
| `src/designEditor/designClient.ts` | `fetch` wrapper over the four routes. |
| `src/designEditor/Editor.tsx` | Layout, draft state (`StoredEdits` via `designStorage.ts`), tabs, bottom bar. |
| `src/designEditor/TokenForm.tsx` | Per-skin token rows with colour pickers and the contrast table. |
| `src/designEditor/CopyForm.tsx` | Searchable list of every copy key for the selected skin, with the contract live. |
| `src/designEditor/IntroForm.tsx` | R10 fields for unlocked modules, the lock sentence for locked ones, notes with intents. |
| `src/designEditor/editor.css` | The editor's own stylesheet. |

---

## Task 0: Baseline

- [ ] **Step 1: Worktree from current main**

```bash
git worktree add .claude/worktrees/design-editor -b design-editor main
cd .claude/worktrees/design-editor && git merge main && git log --oneline -1 && git -C /home/vx/Desktop/Claude/FixThisInjustice log --oneline -1 main
```

Expected: both commands print the same commit. Report both.

- [ ] **Step 2: Baseline gates**

```bash
npx tsc -b --force && npx eslint ./src ./scripts ./build && node scripts/check-no-emoji.mjs && node scripts/check-title-case.mjs
find src build -name '*.test.ts*' | wc -l
```

Expected: gates exit 0. The count was 142 on 2026-09-10 at `ed90c8e`, with 2840 tests green in three chunks (50/1269, 55/918, 37/653). Re-derive; do not quote.

---

## Task 1: The protocol, the dev-server routes, and the frame permission

**Files:**
- Create: `src/config/designProtocol.ts`
- Create: `build/designServer.ts`
- Create: `build/designServer.test.ts`
- Create: `src/design/designWriteSet.test.ts`
- Modify: `build/cspPlugin.ts` (`transformIndexHtml` handler, and one new export)
- Modify: `build/cspPlugin.test.ts` (append two tests)
- Modify: `vite.config.ts` (register the plugin)
- Modify: `tsconfig.node.json:20` (`include`)
- Modify: `package.json` (`scripts.design`)

**Interfaces:**
- Produces: `DesignRoute`, `DESIGN_ROUTES`, `ServerReply`, `DESIGN_WRITE_SET` from `src/config/designProtocol.ts`; `createHandler(deps)`, `Runner`, `RunResult`, `designServerPlugin()` from `build/designServer.ts`; `resolveDesignCsp(reminderApi, mode)` from `build/cspPlugin.ts`. Routes answer JSON `ServerReply` at `${base}__design/<route>`; `apply` takes the `DesignPatch` object as its body, `save` takes `{ message: string, notes?: string[] }`, `revert` and `status` take no body.

- [ ] **Step 1: The shared protocol module**

```ts
// src/config/designProtocol.ts
/**
 * The contract between the local design editor page (src/designEditor/) and the dev-server
 * routes that act on the working tree (build/designServer.ts).
 *
 * Dependency-free on purpose, like src/config/videoInstances.ts: tsconfig.node.json compiles it
 * for the Vite plugin and tsconfig.app.json compiles it for the page, and neither project can
 * import the other's modules (the node project has no DOM lib and no `?raw` typing; the app
 * project has no `node:` typing).
 */

export type DesignRoute = 'apply' | 'revert' | 'save' | 'status';
export const DESIGN_ROUTES: readonly DesignRoute[] = ['apply', 'revert', 'save', 'status'];

/** What every route answers. `output` is the child process's stdout then stderr, verbatim. */
export interface ServerReply {
  readonly ok: boolean;
  /** The child's exit code; 2 when the request was refused before anything ran; -1 when the fetch itself failed. */
  readonly code: number;
  readonly output: string;
}

/**
 * Every path `scripts/design-patch.mjs --write` may change, plus what it regenerates afterwards
 * (docs/feedback/catalogue.json, catalogue.md and the walk pages: see that script's header,
 * "AND IT REGENERATES THE CATALOGUE"). `build/designServer.ts` reverts, reports and commits
 * exactly this set and nothing else, so an agent's uncommitted work elsewhere in the tree is
 * never swept into a design commit or discarded by a revert.
 *
 * src/design/designWriteSet.test.ts checks this list against TABLE_FILE and R10_MODULES, so a
 * module whose evidence lock opens later fails a test here rather than being silently outside
 * the revert.
 */
export const DESIGN_WRITE_SET: readonly string[] = [
  'src/ui/styles/tokens.css',
  'src/content/copy.ts',
  'src/content/copy.limelight.ts',
  'src/content/copy.board.ts',
  'src/content/introSlides.ts',
  'docs/feedback/catalogue.json',
  'docs/feedback/catalogue.md',
  'docs/feedback/walk',
];
```

- [ ] **Step 2: The write-set test, run to see it pass (it pins the list to the registries)**

```ts
// src/design/designWriteSet.test.ts
import { describe, expect, it } from 'vitest';
import { DESIGN_WRITE_SET } from '../config/designProtocol';
import { TABLE_FILE } from './copyEdits';
import { R10_MODULES } from '../content/r10Text';

describe('DESIGN_WRITE_SET', () => {
  it('names the token sheet', () => {
    expect(DESIGN_WRITE_SET).toContain('src/ui/styles/tokens.css');
  });

  it('names every copy table the applier can rewrite', () => {
    for (const file of Object.values(TABLE_FILE)) expect(DESIGN_WRITE_SET).toContain(file);
  });

  it('names every R10 module whose evidence lock is open', () => {
    const open = R10_MODULES.filter((module) => module.lock === null).map((module) => module.file);
    expect(open.length).toBeGreaterThan(0);
    for (const file of open) expect(DESIGN_WRITE_SET).toContain(file);
  });

  it('names what the applier regenerates after a copy write', () => {
    expect(DESIGN_WRITE_SET).toContain('docs/feedback/catalogue.json');
    expect(DESIGN_WRITE_SET).toContain('docs/feedback/catalogue.md');
    expect(DESIGN_WRITE_SET).toContain('docs/feedback/walk');
  });
});
```

Run: `npx vitest run --maxWorkers=1 src/design/designWriteSet.test.ts`
Expected: 4 passed. If the third test fails, a module other than `introSlides` has an open lock; add its file to the list and say so in the commit.

- [ ] **Step 3: The handler test, written first**

```ts
// build/designServer.test.ts
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESIGN_WRITE_SET } from '../src/config/designProtocol.ts';
import { createHandler, type RunResult } from './designServer.ts';

interface Call {
  readonly file: string;
  readonly args: readonly string[];
}

/** A runner that records every call and answers with one exit code, or a code per call. */
function fakeRunner(codes: readonly number[] = [0]) {
  const calls: Call[] = [];
  const run = async (file: string, args: readonly string[]): Promise<RunResult> => {
    calls.push({ file, args });
    const code = codes[Math.min(calls.length - 1, codes.length - 1)] ?? 0;
    return { code, stdout: `ran ${file} ${args.join(' ')}`, stderr: code === 0 ? '' : 'refused' };
  };
  return { calls, run };
}

const tmpDir = (): Promise<string> => mkdtemp(join(tmpdir(), 'fti-design-test-'));

const PATCH = { version: 1, generatedAt: '2026-09-10T00:00:00Z', tokens: {}, copy: {}, r10: [], assets: [], notes: [] };

describe('design server handler', () => {
  it('apply writes the patch to a file and runs the applier on it with --write', async () => {
    const { calls, run } = fakeRunner();
    const result = await createHandler({ run, tmpDir })('apply', PATCH);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.file).toBe(process.execPath);
    expect(calls[0]?.args[0]).toBe('scripts/design-patch.mjs');
    expect(calls[0]?.args[2]).toBe('--write');
    const written = JSON.parse(await readFile(String(calls[0]?.args[1]), 'utf8')) as unknown;
    expect(written).toEqual(PATCH);
  });

  it('apply refuses a body that is not an object, and runs nothing', async () => {
    const { calls, run } = fakeRunner();
    const result = await createHandler({ run, tmpDir })('apply', 'not a patch');
    expect(result.ok).toBe(false);
    expect(result.code).toBe(2);
    expect(calls).toHaveLength(0);
  });

  it('a non-zero exit is ok:false and keeps both streams', async () => {
    const { run } = fakeRunner([1]);
    const result = await createHandler({ run, tmpDir })('apply', PATCH);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(1);
    expect(result.output).toContain('ran ');
    expect(result.output).toContain('refused');
  });

  it('revert checks out exactly the write set', async () => {
    const { calls, run } = fakeRunner();
    await createHandler({ run, tmpDir })('revert', null);
    expect(calls).toEqual([{ file: 'git', args: ['checkout', '--', ...DESIGN_WRITE_SET] }]);
  });

  it('status reports the write set only', async () => {
    const { calls, run } = fakeRunner();
    await createHandler({ run, tmpDir })('status', null);
    expect(calls).toEqual([{ file: 'git', args: ['status', '--short', '--', ...DESIGN_WRITE_SET] }]);
  });

  it('save runs both gates, then commits the write set with the message and the notes', async () => {
    const { calls, run } = fakeRunner();
    const result = await createHandler({ run, tmpDir })('save', {
      message: 'design: warmer lime',
      notes: ['[introSlides:INTRO_SLIDES.3.rest] Promote this to a heading.'],
    });
    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.args[0])).toEqual([
      'scripts/check-title-case.mjs',
      'scripts/check-no-emoji.mjs',
      'commit',
    ]);
    expect(calls[2]).toEqual({
      file: 'git',
      args: [
        'commit',
        '-m',
        'design: warmer lime',
        '-m',
        '[introSlides:INTRO_SLIDES.3.rest] Promote this to a heading.',
        '--',
        ...DESIGN_WRITE_SET,
      ],
    });
  });

  it('save with no notes passes one -m only', async () => {
    const { calls, run } = fakeRunner();
    await createHandler({ run, tmpDir })('save', { message: 'design: warmer lime' });
    expect(calls[2]?.args).toEqual(['commit', '-m', 'design: warmer lime', '--', ...DESIGN_WRITE_SET]);
  });

  it('save stops at the first gate that refuses, and does not commit', async () => {
    const { calls, run } = fakeRunner([0, 1]);
    const result = await createHandler({ run, tmpDir })('save', { message: 'design: x' });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(2);
    expect(result.output).toContain('scripts/check-no-emoji.mjs refused the commit');
  });

  it('save refuses an empty or multi-line message before running anything', async () => {
    const { calls, run } = fakeRunner();
    const handle = createHandler({ run, tmpDir });
    expect((await handle('save', { message: '   ' })).code).toBe(2);
    expect((await handle('save', { message: 'a\nb' })).code).toBe(2);
    expect((await handle('save', null)).code).toBe(2);
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run --maxWorkers=1 build/designServer.test.ts`
Expected: FAIL, `Failed to resolve import "./designServer.ts"`.

- [ ] **Step 5: The plugin**

```ts
// build/designServer.ts
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import {
  DESIGN_ROUTES,
  DESIGN_WRITE_SET,
  type DesignRoute,
  type ServerReply,
} from '../src/config/designProtocol.ts';

/**
 * The local design editor's dev-server side (docs/plans/2026-09-10-18-local-design-editor.md).
 *
 * Four routes under `/__design/`, served only by `vite` in dev (`apply: 'serve'`), never built:
 *
 *   apply   body = the DesignPatch buildPatch() returns  -> scripts/design-patch.mjs <file> --write
 *   revert  no body                                       -> git checkout -- <DESIGN_WRITE_SET>
 *   save    body = { message, notes? }                    -> both copy gates, then git commit
 *   status  no body                                       -> git status --short -- <DESIGN_WRITE_SET>
 *
 * THE APPLIER IS THE ONLY WRITER. This file never edits a source file itself: it hands the patch
 * to scripts/design-patch.mjs, which refuses a key it does not know, a token it does not have, a
 * value that would end a declaration early, and regenerates the catalogue after a copy write.
 * One apply path, so what the preview shows after UPDATE is what is on disk, never a runtime
 * override that the applier might later refuse.
 *
 * THE WRITE SET IS THE ONLY THING REVERTED OR COMMITTED. A `git checkout --` or `git commit`
 * over the whole tree would discard or sweep in whatever an agent has open in a worktree beside
 * this one. src/config/designProtocol.ts holds the list and the test that pins it.
 *
 * THESE ROUTES WRITE TO THE MACHINE THEY RUN ON. Bound to localhost unless `--host` is passed;
 * configureServer warns when it is, because then anyone on the LAN can rewrite copy.ts.
 */

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs one command in the repository root. Injected so the handler is testable without spawning. */
export type Runner = (file: string, args: readonly string[]) => Promise<RunResult>;

export interface HandlerDeps {
  readonly run: Runner;
  /** A fresh directory the patch file is written to before the applier reads it. */
  readonly tmpDir: () => Promise<string>;
}

const GATES: readonly string[] = ['scripts/check-title-case.mjs', 'scripts/check-no-emoji.mjs'];

function reply(result: RunResult): ServerReply {
  const output = [result.stdout, result.stderr].filter((s) => s.length > 0).join('\n');
  return { ok: result.code === 0, code: result.code, output };
}

function refused(output: string): ServerReply {
  return { ok: false, code: 2, output };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneLine(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !/[\n\r]/.test(value);
}

export function createHandler(
  deps: HandlerDeps,
): (route: DesignRoute, body: unknown) => Promise<ServerReply> {
  return async (route, body) => {
    switch (route) {
      case 'status':
        return reply(await deps.run('git', ['status', '--short', '--', ...DESIGN_WRITE_SET]));

      case 'revert':
        return reply(await deps.run('git', ['checkout', '--', ...DESIGN_WRITE_SET]));

      case 'apply': {
        if (!isRecord(body)) return refused('apply: the body must be the patch object buildPatch() returns.');
        const file = join(await deps.tmpDir(), 'patch.json');
        await writeFile(file, `${JSON.stringify(body, null, 2)}\n`);
        return reply(await deps.run(process.execPath, ['scripts/design-patch.mjs', file, '--write']));
      }

      case 'save': {
        const message = isRecord(body) ? body['message'] : undefined;
        if (!oneLine(message)) return refused('save: a one-line commit message is required.');
        const rawNotes = isRecord(body) ? body['notes'] : undefined;
        const notes = Array.isArray(rawNotes) ? rawNotes.filter(oneLine) : [];
        for (const gate of GATES) {
          const result = await deps.run(process.execPath, [gate]);
          if (result.code !== 0) {
            return reply({
              ...result,
              stdout: `${gate} refused the commit. Nothing was committed.\n${result.stdout}`,
            });
          }
        }
        const args = ['commit', '-m', message.trim()];
        if (notes.length > 0) args.push('-m', notes.join('\n'));
        args.push('--', ...DESIGN_WRITE_SET);
        return reply(await deps.run('git', args));
      }
    }
  };
}

/** The real runner: execFile in `cwd`, exit code from the error when there is one. */
export function execRunner(cwd: string): Runner {
  return (file, args) =>
    new Promise((resolve) => {
      execFile(file, [...args], { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      });
    });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** The route a request names, or null. Matched on the path's tail so the configured base does not matter. */
export function routeOf(url: string | undefined): DesignRoute | null {
  const pathname = new URL(url ?? '/', 'http://localhost').pathname;
  for (const route of DESIGN_ROUTES) if (pathname.endsWith(`/__design/${route}`)) return route;
  return null;
}

function send(res: ServerResponse, status: number, body: ServerReply): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

export function designServerPlugin(): Plugin {
  return {
    name: 'fti-design-server',
    apply: 'serve',
    configureServer(server) {
      const host = server.config.server.host;
      if (host !== undefined && host !== false && host !== 'localhost' && host !== '127.0.0.1') {
        server.config.logger.warn(
          '[fti-design] the /__design/ routes rewrite this tree and are reachable from the network.',
        );
      }
      const handle = createHandler({
        run: execRunner(server.config.root),
        tmpDir: () => mkdtemp(join(tmpdir(), 'fti-design-')),
      });
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const route = routeOf(req.url);
        if (route === null) {
          next();
          return;
        }
        void (async () => {
          let body: unknown = null;
          if (req.method === 'POST') {
            const raw = await readBody(req);
            if (raw !== '') {
              try {
                body = JSON.parse(raw);
              } catch {
                send(res, 400, refused('The request body is not JSON.'));
                return;
              }
            }
          }
          send(res, 200, await handle(route, body));
        })();
      });
    },
  };
}
```

- [ ] **Step 6: Run the handler test to see it pass**

Run: `npx vitest run --maxWorkers=1 build/designServer.test.ts`
Expected: 9 passed.

- [ ] **Step 7: Let the editor page frame the app**

In `build/cspPlugin.ts`, add after `resolveCsp`:

```ts
/**
 * The policy for design.html, the local editor page (Task 1 of
 * docs/plans/2026-09-10-18-local-design-editor.md). Identical to the app's, except that
 * `frame-src` is `'self'`: the page's whole purpose is to frame the app, and the app's own
 * `frame-src` names only the video hosts. The page is served by `vite` in dev and never built,
 * so this policy ships in no bundle; the app's policy is unchanged.
 */
export function resolveDesignCsp(reminderApi: string | undefined, mode: string): string {
  return buildCsp({ frameSrc: ["'self'"], connectSrc: workerConnectSrc(reminderApi, mode) });
}
```

Change the plugin body so both policies are computed and the handler picks by page:

```ts
export function cspPlugin(): Plugin {
  let csp = '';
  let designCsp = '';

  return {
    name: 'fti-csp',
    configResolved(resolved) {
      const env = loadEnv(resolved.mode, resolved.root, 'VITE_');
      const reminderApi = env['VITE_REMINDER_API'];
      const configured = typeof reminderApi === 'string' && reminderApi.trim().length > 0;
      if (resolved.command === 'build' && !configured) {
        console.warn(
          "[fti-csp] VITE_REMINDER_API is unset: connect-src is 'self' only, so reminders " +
            'cannot reach the Worker from this build.',
        );
      }
      csp = resolveCsp(reminderApi, resolved.mode);
      designCsp = resolveDesignCsp(reminderApi, resolved.mode);
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html: string, ctx: IndexHtmlTransformContext) {
        // In dev ctx.path is the URL path (`/FixThisInjustice/design.html`); in a build it is
        // the file name. Either way the editor page is the one ending in design.html.
        const content = ctx.path.endsWith('design.html') ? designCsp : csp;
        return {
          html,
          tags: [
            {
              tag: 'meta',
              attrs: { 'http-equiv': 'Content-Security-Policy', content },
              injectTo: 'head-prepend',
            },
          ],
        };
      },
    },
  };
}
```

Against the current file the only additions are `designCsp`, its assignment, the `ctx` parameter and the `content` selection; every existing comment stays. Add `IndexHtmlTransformContext` to the type import: `import { loadEnv, type IndexHtmlTransformContext, type Plugin } from 'vite';`. Keep every existing comment in the file.

- [ ] **Step 8: Pin both policies**

Append to `build/cspPlugin.test.ts`:

```ts
import { resolveDesignCsp } from './cspPlugin.ts';

describe('resolveDesignCsp', () => {
  it("frames only the same origin, and changes nothing else", () => {
    const app = resolveCsp(undefined, 'development');
    const page = resolveDesignCsp(undefined, 'development');
    expect(page).toContain("frame-src 'self'");
    expect(directivesExcept(page, 'frame-src')).toEqual(directivesExcept(app, 'frame-src'));
  });

  it('is not the policy the app ships', () => {
    expect(resolveCsp(undefined, 'production')).not.toContain("frame-src 'self'");
  });
});
```

`directivesExcept` already exists in that file (used at `:128`); place the import beside the existing one from `./cspPlugin.ts`.

Run: `npx vitest run --maxWorkers=1 build/cspPlugin.test.ts`
Expected: every existing test still passes, plus 2.

- [ ] **Step 9: Register the plugin, the tsconfig entries, and the script**

`vite.config.ts`: add `import { designServerPlugin } from './build/designServer.ts';` under the `cspPlugin` import, and `designServerPlugin(),` after `cspPlugin(),` in `plugins`.

`tsconfig.node.json:20`:

```json
  "include": ["vite.config.ts", "vitest.config.ts", "build/cspPlugin.ts", "build/cspPlugin.test.ts", "build/designPatch.test.ts", "build/designServer.ts", "build/designServer.test.ts", "src/config/videoInstances.ts", "src/config/designProtocol.ts"]
```

`package.json`, in `scripts`, after `"dev": "vite",`:

```json
    "design": "vite --open /FixThisInjustice/design.html",
```

- [ ] **Step 10: Gates, then the route answers over HTTP**

```bash
npx tsc -b --force && npx eslint ./src ./scripts ./build
npx vitest run --maxWorkers=1 build/ src/design/designWriteSet.test.ts
```

Expected: exit 0; all build tests pass.

Then, with `npx vite` running in another terminal:

```bash
curl -s -X POST http://localhost:5173/FixThisInjustice/__design/status
```

Expected: `{"ok":true,"code":0,"output":""}` on a clean tree (the `output` lists changed write-set files otherwise). Stop the server.

- [ ] **Step 11: Commit**

```bash
git add src/config/designProtocol.ts build/designServer.ts build/designServer.test.ts src/design/designWriteSet.test.ts build/cspPlugin.ts build/cspPlugin.test.ts vite.config.ts tsconfig.node.json package.json
git commit -m "feat(design): dev-server routes for the local editor, and frame-src 'self' for its page" -- src/config/designProtocol.ts build/designServer.ts build/designServer.test.ts src/design/designWriteSet.test.ts build/cspPlugin.ts build/cspPlugin.test.ts vite.config.ts tsconfig.node.json package.json
```

---

## Task 2: The editor page, with the token form

**Files:**
- Create: `design.html`
- Create: `src/designEditor/main.tsx`
- Create: `src/designEditor/designClient.ts`
- Create: `src/designEditor/Editor.tsx`
- Create: `src/designEditor/TokenForm.tsx`
- Create: `src/designEditor/editor.css`
- Test: `src/designEditor/Editor.test.tsx`, `src/designEditor/TokenForm.test.tsx`

**Interfaces:**
- Consumes: `ServerReply`, `DesignRoute` (Task 1); `StoredEdits`, `readStoredEdits`, `writeStoredEdits`, `clearStoredEdits` from `src/design/designStorage.ts`; `buildPatch`, `patchSize`, `DesignPatch` from `src/design/designPatch.ts`; `SHEET`, `groupedTokens`, `shippedValues`, `isColourToken` from `src/design/tokenSheet.ts`; `readAllPairs` from `src/design/contrastPairs.ts`; `formatRatio`, `parseColour`, `toHex` from `src/design/colour.ts`; `SKIN_IDS` from `src/skins/skinContext.tsx`; `SkinId` from `src/domain/types.ts`.
- Produces: `Editor({ client? })`, `EditorTab`, `FormProps { skin, edits, onChange }` (the shape every form takes; Tasks 3 and 4 implement it), `designClient: DesignClient`, `draftValues(skin, edits)`.

- [ ] **Step 1: The page and the entry**

```html
<!-- design.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <title>FTI Design Editor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/designEditor/main.tsx"></script>
  </body>
</html>
```

```tsx
// src/designEditor/main.tsx
/**
 * The local design editor (docs/plans/2026-09-10-18-local-design-editor.md). Served by `npm run
 * design` from design.html, which `vite build` never emits, so nothing here reaches a user.
 *
 * NOT tokens.css: the editor is not skinned by the app it edits. The preview iframe loads the
 * app's own stylesheets on its own.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './editor.css';
import { Editor } from './Editor';

const container = document.getElementById('root');
if (container === null) throw new Error('design.html is missing <div id="root">');

createRoot(container).render(
  <StrictMode>
    <Editor />
  </StrictMode>,
);
```

- [ ] **Step 2: The client**

```ts
// src/designEditor/designClient.ts
import type { DesignRoute, ServerReply } from '../config/designProtocol';
import type { DesignPatch } from '../design/designPatch';

const FAILED: ServerReply = { ok: false, code: -1, output: '' };

async function post(route: DesignRoute, body: unknown): Promise<ServerReply> {
  const url = `${import.meta.env.BASE_URL}__design/${route}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? '' : JSON.stringify(body),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ...FAILED, output: `${route}: ${reason}. Is \`npm run design\` running?` };
  }
  const text = await response.text();
  try {
    return JSON.parse(text) as ServerReply;
  } catch {
    return {
      ...FAILED,
      output: `${route}: the server answered ${response.status} with something that is not JSON. This page must be served by \`npm run design\`, not by \`vite preview\` or GitHub Pages.`,
    };
  }
}

export const designClient = {
  apply: (patch: DesignPatch): Promise<ServerReply> => post('apply', patch),
  revert: (): Promise<ServerReply> => post('revert', undefined),
  save: (message: string, notes: readonly string[]): Promise<ServerReply> =>
    post('save', { message, notes }),
  status: (): Promise<ServerReply> => post('status', undefined),
};

export type DesignClient = typeof designClient;
```

- [ ] **Step 3: The editor test, written first**

```tsx
// src/designEditor/Editor.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerReply } from '../config/designProtocol';
import { clearStoredEdits, readStoredEdits } from '../design/designStorage';
import { SHEET } from '../design/tokenSheet';
import type { DesignClient } from './designClient';
import { Editor } from './Editor';

const OK: ServerReply = { ok: true, code: 0, output: '' };

function fakeClient(replies: Partial<Record<keyof DesignClient, ServerReply>> = {}): DesignClient {
  return {
    apply: vi.fn(async () => replies.apply ?? OK),
    revert: vi.fn(async () => replies.revert ?? OK),
    save: vi.fn(async () => replies.save ?? OK),
    status: vi.fn(async () => replies.status ?? OK),
  };
}

function firstTokenInput(): HTMLInputElement {
  const first = SHEET.clinical[0];
  if (first === undefined) throw new Error('the clinical sheet is empty');
  return screen.getByRole('textbox', { name: first.name });
}

beforeEach(() => {
  clearStoredEdits();
});

describe('Editor', () => {
  it('frames the app from the base URL at phone width', () => {
    render(<Editor client={fakeClient()} />);
    const frame = screen.getByTitle('App preview');
    expect(frame).toHaveAttribute('src', import.meta.env.BASE_URL);
    expect(frame).toHaveAttribute('width', '390');
  });

  it('Update is disabled with nothing pending, and posts only the changed token', async () => {
    const client = fakeClient();
    render(<Editor client={client} />);
    const update = screen.getByRole('button', { name: 'Update' });
    expect(update).toBeDisabled();

    const input = firstTokenInput();
    fireEvent.change(input, { target: { value: '#123456' } });
    expect(update).toBeEnabled();

    fireEvent.click(update);
    await waitFor(() => expect(client.apply).toHaveBeenCalledTimes(1));
    const patch = vi.mocked(client.apply).mock.calls[0]?.[0];
    expect(patch?.tokens).toEqual({ clinical: { [input.name]: '#123456' } });
    expect(patch?.copy).toEqual({});
    expect(patch?.r10).toEqual([]);
  });

  it('clears the draft after a successful apply, and shows the applier output', async () => {
    const client = fakeClient({ apply: { ok: true, code: 0, output: 'design-patch: wrote 1 declaration(s)' } });
    render(<Editor client={client} />);
    fireEvent.change(firstTokenInput(), { target: { value: '#123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await screen.findByText(/wrote 1 declaration/);
    expect(readStoredEdits().tokens).toEqual({});
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
  });

  it('keeps the draft when the applier refuses', async () => {
    const client = fakeClient({ apply: { ok: false, code: 1, output: 'design-patch: unknown token' } });
    render(<Editor client={client} />);
    fireEvent.change(firstTokenInput(), { target: { value: '#123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await screen.findByText(/unknown token/);
    expect(readStoredEdits().tokens.clinical).toEqual({ [firstTokenInput().name]: '#123456' });
    expect(screen.getByRole('button', { name: 'Update' })).toBeEnabled();
  });

  it('Save is disabled until a message is typed, then posts it', async () => {
    const client = fakeClient();
    render(<Editor client={client} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Commit message' }), { target: { value: 'design: warmer lime' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(client.save).toHaveBeenCalledWith('design: warmer lime', []));
  });

  it('Revert asks first, and does nothing when refused', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const client = fakeClient();
    render(<Editor client={client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }));
    expect(client.revert).not.toHaveBeenCalled();
  });

  it('Revert runs when confirmed, and empties the draft', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const client = fakeClient();
    render(<Editor client={client} />);
    fireEvent.change(firstTokenInput(), { target: { value: '#123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }));
    await waitFor(() => expect(client.revert).toHaveBeenCalledTimes(1));
    expect(readStoredEdits().tokens).toEqual({});
  });

  it('reads git status on mount and shows it in the bar', async () => {
    const client = fakeClient({ status: { ok: true, code: 0, output: ' M src/ui/styles/tokens.css' } });
    render(<Editor client={client} />);
    await screen.findByText(/M src\/ui\/styles\/tokens\.css/);
  });
});
```

- [ ] **Step 4: The token form test, written first**

```tsx
// src/designEditor/TokenForm.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTRAST_PAIRS } from '../design/contrastPairs';
import { clearStoredEdits, readStoredEdits, type StoredEdits } from '../design/designStorage';
import { SHEET, shippedValues } from '../design/tokenSheet';
import { draftValues, TokenForm } from './TokenForm';

beforeEach(() => {
  clearStoredEdits();
});

/** An empty draft, from the store's own reader rather than a restated literal. */
const empty = (): StoredEdits => readStoredEdits();

describe('TokenForm', () => {
  it('renders one text input per declaration of the chosen skin', () => {
    render(<TokenForm skin="limelight" edits={empty()} onChange={() => undefined} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(SHEET.limelight.length);
  });

  it('an edit lands under the skin, and typing the shipped value back removes it', () => {
    const onChange = vi.fn();
    const first = SHEET.board[0];
    if (first === undefined) throw new Error('the board sheet is empty');
    const { rerender } = render(<TokenForm skin="board" edits={empty()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: first.name }), { target: { value: '#abcdef' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...empty(), tokens: { board: { [first.name]: '#abcdef' } } });

    const edited: StoredEdits = { ...empty(), tokens: { board: { [first.name]: '#abcdef' } } };
    rerender(<TokenForm skin="board" edits={edited} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: first.name }), { target: { value: first.value } });
    expect(onChange).toHaveBeenLastCalledWith({ ...empty(), tokens: { board: {} } });
  });

  it('draftValues lays the draft over the shipped sheet', () => {
    const first = SHEET.clinical[0];
    if (first === undefined) throw new Error('the clinical sheet is empty');
    const values = draftValues('clinical', { ...empty(), tokens: { clinical: { [first.name]: '#010203' } } });
    expect(values.get(first.name)).toBe('#010203');
    expect(values.size).toBe(shippedValues('clinical').size);
  });

  it('a contrast reading follows the draft: fg set to its own ground fails AA', () => {
    const pair = CONTRAST_PAIRS[0];
    if (pair === undefined) throw new Error('no contrast pairs');
    const ground = shippedValues('clinical').get(pair.bg);
    if (ground === undefined) throw new Error(`${pair.bg} is not in the clinical sheet`);
    const edits: StoredEdits = { ...empty(), tokens: { clinical: { [pair.fg]: ground } } };
    render(<TokenForm skin="clinical" edits={edits} onChange={() => undefined} />);
    const row = screen.getByText(pair.label).closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveClass('ed-fail');
  });
});
```

- [ ] **Step 5: Run both to see them fail**

Run: `npx vitest run --maxWorkers=1 src/designEditor/`
Expected: FAIL, unresolved imports `./Editor` and `./TokenForm`.

- [ ] **Step 6: The token form**

```tsx
// src/designEditor/TokenForm.tsx
import type { ReactElement } from 'react';
import { formatRatio, parseColour, toHex } from '../design/colour';
import { readAllPairs } from '../design/contrastPairs';
import type { StoredEdits } from '../design/designStorage';
import { groupedTokens, isColourToken, shippedValues } from '../design/tokenSheet';
import type { SkinId } from '../domain/types';

/** What every form takes: the skin being edited, the whole draft, and the setter for the whole draft. */
export interface FormProps {
  readonly skin: SkinId;
  readonly edits: StoredEdits;
  readonly onChange: (next: StoredEdits) => void;
}

/** The skin's values with the draft laid over the shipped sheet. Exported for the contrast table's test. */
export function draftValues(skin: SkinId, edits: StoredEdits): ReadonlyMap<string, string> {
  const map = new Map(shippedValues(skin));
  for (const [name, value] of Object.entries(edits.tokens[skin] ?? {})) map.set(name, value);
  return map;
}

export function TokenForm({ skin, edits, onChange }: FormProps): ReactElement {
  const shipped = shippedValues(skin);
  const values = draftValues(skin, edits);
  // `var()` references fall through to the clinical block, exactly as the cascade resolves them.
  const root = draftValues('clinical', edits);
  const readings = readAllPairs(values, root);

  const set = (name: string, value: string): void => {
    const current: Record<string, string> = { ...(edits.tokens[skin] ?? {}) };
    if (value.trim() === shipped.get(name)) delete current[name];
    else current[name] = value;
    onChange({ ...edits, tokens: { ...edits.tokens, [skin]: current } });
  };

  return (
    <div className="ed-tokens">
      <table className="ed-contrast">
        <caption>Contrast, WCAG AA, against the draft</caption>
        <tbody>
          {readings.map((reading) => (
            <tr
              key={`${reading.pair.fg}/${reading.pair.bg}`}
              className={reading.passes === false ? 'ed-fail' : reading.passes === null ? 'ed-unknown' : ''}
            >
              <td>{reading.pair.label}</td>
              <td>{reading.ratio === null ? '?' : formatRatio(reading.ratio)}</td>
              <td>{reading.threshold}:1</td>
            </tr>
          ))}
        </tbody>
      </table>

      {groupedTokens(skin).map(([group, decls]) => (
        <fieldset key={group} className="ed-group">
          <legend>{group}</legend>
          {decls.map((decl) => {
            const value = values.get(decl.name) ?? decl.value;
            const changed = value !== decl.value;
            const rgb = isColourToken(decl.name, skin) ? parseColour(value) : null;
            return (
              <div key={decl.name} className={changed ? 'ed-row ed-changed' : 'ed-row'}>
                <label htmlFor={`tok-${decl.name}`}>
                  <code>{decl.name}</code>
                </label>
                {rgb !== null ? (
                  <input
                    type="color"
                    aria-label={`${decl.name} picker`}
                    value={toHex(rgb)}
                    onChange={(event) => set(decl.name, event.target.value)}
                  />
                ) : (
                  <span />
                )}
                <input
                  id={`tok-${decl.name}`}
                  type="text"
                  name={decl.name}
                  aria-label={decl.name}
                  value={value}
                  onChange={(event) => set(decl.name, event.target.value)}
                />
                {changed && (
                  <button type="button" aria-label={`Reset ${decl.name}`} onClick={() => set(decl.name, decl.value)}>
                    Reset
                  </button>
                )}
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: The editor**

```tsx
// src/designEditor/Editor.tsx
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { buildPatch, patchSize } from '../design/designPatch';
import { clearStoredEdits, readStoredEdits, writeStoredEdits, type StoredEdits } from '../design/designStorage';
import { buildNotes } from '../design/r10Edits';
import type { SkinId } from '../domain/types';
import { SKIN_IDS } from '../skins/skinContext';
import { designClient, type DesignClient } from './designClient';
import { TokenForm } from './TokenForm';

export type EditorTab = 'tokens';
const TABS: ReadonlyArray<{ readonly id: EditorTab; readonly label: string }> = [
  { id: 'tokens', label: 'Colours and Tokens' },
];

/** The phone width every walk page and screenshot in docs/feedback uses. */
export const PREVIEW_WIDTH_PX = 390; // [px]
export const PREVIEW_HEIGHT_PX = 844; // [px]

function isSkinId(value: string): value is SkinId {
  return (SKIN_IDS as readonly string[]).includes(value);
}

export interface EditorProps {
  /** Injected by tests. The page uses the real client. */
  readonly client?: DesignClient;
}

export function Editor({ client = designClient }: EditorProps): ReactElement {
  const [edits, setEdits] = useState<StoredEdits>(() => readStoredEdits());
  const [tab, setTab] = useState<EditorTab>('tokens');
  const [skin, setSkin] = useState<SkinId>('clinical');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('');
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');

  const update = useCallback((next: StoredEdits): void => {
    setEdits(next);
    writeStoredEdits(next);
  }, []);

  const refreshStatus = useCallback(async (): Promise<void> => {
    const result = await client.status();
    if (!result.ok) {
      setStatus(result.output);
      return;
    }
    setStatus(result.output.trim() === '' ? 'Nothing uncommitted.' : result.output.trim());
  }, [client]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const patch = buildPatch(edits, Date.now());
  // Notes are instructions for a person, not edits the applier performs; they ride on SAVE.
  const pendingWrites = patchSize(patch) - patch.notes.length;

  const onUpdate = async (): Promise<void> => {
    setBusy(true);
    const result = await client.apply(patch);
    setLog(result.output);
    if (result.ok) {
      // The edits are on disk now; keep only the notes for the commit message.
      clearStoredEdits();
      update({ ...readStoredEdits(), notes: edits.notes });
    }
    await refreshStatus();
    setBusy(false);
  };

  const onRevert = async (): Promise<void> => {
    if (!window.confirm('Discard every design change on disk since the last commit, and this draft?')) return;
    setBusy(true);
    const result = await client.revert();
    setLog(result.output === '' ? 'Reverted.' : result.output);
    clearStoredEdits();
    setEdits(readStoredEdits());
    await refreshStatus();
    setBusy(false);
  };

  const onSave = async (): Promise<void> => {
    setBusy(true);
    const notes = buildNotes(edits.notes).map((note) => `[${note.part}] ${note.text}`);
    const result = await client.save(message, notes);
    setLog(result.output);
    if (result.ok) {
      setMessage('');
      clearStoredEdits();
      setEdits(readStoredEdits());
    }
    await refreshStatus();
    setBusy(false);
  };

  return (
    <div className="ed-shell">
      <section className="ed-preview" aria-label="Preview">
        <iframe title="App preview" src={import.meta.env.BASE_URL} width={PREVIEW_WIDTH_PX} height={PREVIEW_HEIGHT_PX} />
        <p className="ed-hint">
          The preview is the app, on the skin the app itself has selected in Settings. Navigate it
          as you would on the phone. Update rewrites the source and the preview follows.
        </p>
      </section>

      <section className="ed-form" aria-label="Editor">
        <header className="ed-tabs">
          <div role="tablist" aria-label="Sections">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <label>
            Skin to edit{' '}
            <select value={skin} onChange={(event) => { if (isSkinId(event.target.value)) setSkin(event.target.value); }}>
              {SKIN_IDS.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </label>
        </header>

        <div className="ed-body">
          {tab === 'tokens' && <TokenForm skin={skin} edits={edits} onChange={update} />}
        </div>

        <footer className="ed-bar">
          <span className="ed-status">
            {pendingWrites} pending, {edits.notes.length} notes. {status}
          </span>
          <button type="button" onClick={() => void onUpdate()} disabled={busy || pendingWrites === 0}>
            Update
          </button>
          <button type="button" onClick={() => void onRevert()} disabled={busy}>
            Revert
          </button>
          <input
            type="text"
            aria-label="Commit message"
            placeholder="design: what changed"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button type="button" onClick={() => void onSave()} disabled={busy || message.trim() === ''}>
            Save
          </button>
          <pre className="ed-log" aria-live="polite">{log}</pre>
        </footer>
      </section>
    </div>
  );
}
```

- [ ] **Step 8: The stylesheet**

```css
/* src/designEditor/editor.css */
/* The editor's own look. Never imports tokens.css: the app is skinned inside the iframe, and
   the editor around it is deliberately plain so a colour judgement is made on the preview. */
:root {
  color-scheme: light;
  font: 14px/1.4 system-ui, sans-serif;
}
body { margin: 0; background: #f4f4f4; color: #111; }
.ed-shell { display: grid; grid-template-columns: 420px 1fr; min-height: 100vh; }
@media (max-width: 900px) { .ed-shell { grid-template-columns: 1fr; } }
.ed-preview { position: sticky; top: 0; align-self: start; padding: 16px; }
.ed-preview iframe { display: block; border: 1px solid #999; background: #000; }
.ed-hint { color: #555; margin: 8px 0 0; max-width: 390px; }
.ed-form { display: flex; flex-direction: column; min-height: 100vh; }
.ed-tabs { display: flex; gap: 16px; align-items: center; padding: 12px 16px; background: #fff; border-bottom: 1px solid #ccc; }
.ed-tabs [role='tab'] { padding: 6px 10px; border: 1px solid #ccc; background: #eee; }
.ed-tabs [role='tab'][aria-selected='true'] { background: #111; color: #fff; }
.ed-body { flex: 1; padding: 16px; overflow-y: auto; }
.ed-group { border: 1px solid #ddd; margin: 0 0 16px; padding: 8px 12px; }
.ed-row { display: grid; grid-template-columns: 220px auto 1fr auto; gap: 8px; align-items: center; padding: 4px 0; }
.ed-row.ed-changed { background: #fff6c8; }
.ed-row input[type='text'], .ed-row textarea { width: 100%; font: inherit; }
.ed-row textarea:disabled { background: #eee; color: #666; }
.ed-block, .ed-error { grid-column: 1 / -1; color: #a00; margin: 0; }
.ed-advisory { grid-column: 1 / -1; color: #7a5200; margin: 0; }
.ed-note { grid-column: 1 / -1; margin: 0; color: #333; }
.ed-contrast { border-collapse: collapse; margin: 0 0 16px; }
.ed-contrast td { padding: 2px 8px; border-bottom: 1px solid #eee; }
.ed-contrast .ed-fail td { color: #a00; font-weight: 600; }
.ed-contrast .ed-unknown td { color: #777; }
.ed-bar { position: sticky; bottom: 0; display: grid; grid-template-columns: 1fr auto auto 2fr auto; gap: 8px; align-items: center; padding: 12px 16px; background: #fff; border-top: 1px solid #ccc; }
.ed-bar button { padding: 8px 14px; font: inherit; }
.ed-bar input { font: inherit; padding: 6px; }
.ed-status { color: #333; white-space: pre-wrap; }
.ed-log { grid-column: 1 / -1; max-height: 160px; overflow: auto; margin: 0; padding: 8px; background: #111; color: #ddd; white-space: pre-wrap; }
.ed-search { display: flex; gap: 12px; align-items: center; margin: 0 0 12px; }
.ed-search input[type='search'] { flex: 1; font: inherit; padding: 6px; }
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `npx vitest run --maxWorkers=1 src/designEditor/`
Expected: 12 passed across two files.

- [ ] **Step 10: The page in a browser, with a real write**

Gates first: `npx tsc -b --force && npx eslint ./src ./scripts ./build`.

Then `npm run design`. The browser opens `http://localhost:5173/FixThisInjustice/design.html`. Check, and record each outcome:

1. The preview shows the app; typing in any token field changes nothing in the preview (the intro must not advance).
2. Change `--accent` in the clinical block to a visibly different colour, press Update. Expected: the log shows `design-patch: wrote 1 declaration(s)`, the preview recolours WITHOUT reloading (CSS HMR), the bar shows ` M src/ui/styles/tokens.css`.
3. Press Revert, confirm. Expected: the preview returns to the shipped colour; the bar shows `Nothing uncommitted.`
4. `git status --short` in the terminal is clean.

If step 2 reloads the preview instead of hot-swapping, say so: it is a finding about the module graph, not a failure of this task.

- [ ] **Step 11: Commit**

```bash
git add design.html src/designEditor/main.tsx src/designEditor/designClient.ts src/designEditor/Editor.tsx src/designEditor/TokenForm.tsx src/designEditor/editor.css src/designEditor/Editor.test.tsx src/designEditor/TokenForm.test.tsx
git commit -m "feat(design): the local editor page, with the token form and Update, Revert, Save" -- design.html src/designEditor/
```

---

## Task 3: The copy form

**Files:**
- Create: `src/designEditor/CopyForm.tsx`
- Modify: `src/designEditor/Editor.tsx` (`EditorTab`, `TABS`, the body switch)
- Test: `src/designEditor/CopyForm.test.tsx`

**Interfaces:**
- Consumes: `FormProps` (Task 2); `DEFAULT_COPY`, `copyFor`, `CopyKey` from `src/content/copy.ts`; `blockedReason`, `validateCopyEdit`, `describeTarget` from `src/design/copyEdits.ts`; `LENGTH_EXEMPT` from `src/content/copyContract.ts` (test only).
- Produces: `CopyForm(props: FormProps)`, `COPY_KEYS`.

- [ ] **Step 1: The test, written first**

```tsx
// src/designEditor/CopyForm.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COPY, SKIN_COPY, type CopyKey } from '../content/copy';
import { LENGTH_EXEMPT } from '../content/copyContract';
import { clearStoredEdits, readStoredEdits, type StoredEdits } from '../design/designStorage';
import { CopyForm, COPY_KEYS } from './CopyForm';

beforeEach(() => {
  clearStoredEdits();
});

const empty = (): StoredEdits => readStoredEdits();

function keyWhere(predicate: (key: CopyKey) => boolean): CopyKey {
  const found = COPY_KEYS.find(predicate);
  if (found === undefined) throw new Error('no key matches');
  return found;
}

describe('CopyForm', () => {
  it('lists every key of the default table for the clinical skin, sorted', () => {
    render(<CopyForm skin="clinical" edits={empty()} onChange={() => undefined} />);
    // The search input has role searchbox, not textbox, so this counts the textareas alone.
    expect(screen.getAllByRole('textbox')).toHaveLength(Object.keys(DEFAULT_COPY).length);
    expect([...COPY_KEYS]).toEqual([...COPY_KEYS].sort());
  });

  it('disables a limelight key that has no row of its own, and says why', () => {
    const key = keyWhere((k) => SKIN_COPY.limelight[k] === undefined);
    render(<CopyForm skin="limelight" edits={empty()} onChange={() => undefined} />);
    expect(screen.getByRole('textbox', { name: key })).toBeDisabled();
    expect(screen.getByText(/has no row for/)).toBeInTheDocument();
  });

  it('a four-word button label shows the R1 rule as an error, live', () => {
    const key = keyWhere((k) => k.startsWith('button.') && !LENGTH_EXEMPT.has(k));
    const edits: StoredEdits = { ...empty(), copy: { clinical: { [key]: 'One Two Three Four' } } };
    const { container } = render(<CopyForm skin="clinical" edits={edits} onChange={() => undefined} />);
    expect(container.querySelector('.ed-error')).not.toBeNull();
  });

  it('an edit lands under the skin; typing the shipped words back removes it', () => {
    const onChange = vi.fn();
    const key = COPY_KEYS[0];
    if (key === undefined) throw new Error('no keys');
    render(<CopyForm skin="clinical" edits={empty()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: key }), { target: { value: 'Something Else' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...empty(), copy: { clinical: { [key]: 'Something Else' } } });
    fireEvent.change(screen.getByRole('textbox', { name: key }), { target: { value: DEFAULT_COPY[key] } });
    expect(onChange).toHaveBeenLastCalledWith({ ...empty(), copy: { clinical: {} } });
  });

  it('a pasted newline becomes a space: copy rows are one line', () => {
    const onChange = vi.fn();
    const key = COPY_KEYS[0];
    if (key === undefined) throw new Error('no keys');
    render(<CopyForm skin="clinical" edits={empty()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: key }), { target: { value: 'Two\nLines' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...empty(), copy: { clinical: { [key]: 'Two Lines' } } });
  });

  it('search narrows by key or by words', () => {
    render(<CopyForm skin="clinical" edits={empty()} onChange={() => undefined} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search copy' }), { target: { value: 'button.' } });
    expect(screen.getAllByRole('textbox')).toHaveLength(COPY_KEYS.filter((k) => k.includes('button.')).length);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --maxWorkers=1 src/designEditor/CopyForm.test.tsx`
Expected: FAIL, unresolved import `./CopyForm`.

- [ ] **Step 3: The form**

```tsx
// src/designEditor/CopyForm.tsx
import { useMemo, useState, type ReactElement } from 'react';
import { copyFor, DEFAULT_COPY, type CopyKey } from '../content/copy';
import { blockedReason, describeTarget, validateCopyEdit } from '../design/copyEdits';
import type { FormProps } from './TokenForm';

/** Every key the default table declares, sorted so the list is stable and the prefixes group themselves. */
export const COPY_KEYS: readonly CopyKey[] = (Object.keys(DEFAULT_COPY) as CopyKey[]).slice().sort();

export function CopyForm({ skin, edits, onChange }: FormProps): ReactElement {
  const [query, setQuery] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const draft: Record<string, string> = edits.copy[skin] ?? {};

  const keys = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return COPY_KEYS.filter((key) => {
      if (changedOnly && draft[key] === undefined) return false;
      if (needle === '') return true;
      return key.toLowerCase().includes(needle) || copyFor(skin, key).toLowerCase().includes(needle);
    });
  }, [query, changedOnly, draft, skin]);

  const set = (key: CopyKey, raw: string): void => {
    // A copy row is one line. scripts/design-patch.mjs refuses a newline; the form folds it first.
    const value = raw.replace(/[\r\n\t]+/g, ' ');
    const next: Record<string, string> = { ...draft };
    if (value === copyFor(skin, key)) delete next[key];
    else next[key] = value;
    onChange({ ...edits, copy: { ...edits.copy, [skin]: next } });
  };

  return (
    <div className="ed-copy">
      <p className="ed-hint">{describeTarget(skin)}</p>
      <div className="ed-search">
        <input
          type="search"
          aria-label="Search copy"
          placeholder="Search keys or words"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label>
          <input type="checkbox" checked={changedOnly} onChange={(event) => setChangedOnly(event.target.checked)} />{' '}
          Changed only
        </label>
        <span>
          {keys.length} of {COPY_KEYS.length}
        </span>
      </div>

      {keys.map((key) => {
        const block = blockedReason(skin, key);
        const shipped = copyFor(skin, key);
        const value = draft[key] ?? shipped;
        const changed = value !== shipped;
        const violations = block === null && changed ? validateCopyEdit(skin, key, value) : [];
        return (
          <div key={key} className={changed ? 'ed-row ed-changed' : 'ed-row'}>
            <label htmlFor={`copy-${key}`}>
              <code>{key}</code>
            </label>
            <span />
            <textarea
              id={`copy-${key}`}
              name={key}
              aria-label={key}
              rows={value.length > 80 ? 3 : 1}
              value={value}
              disabled={block !== null}
              onChange={(event) => set(key, event.target.value)}
            />
            {changed ? (
              <button type="button" aria-label={`Reset ${key}`} onClick={() => set(key, shipped)}>
                Reset
              </button>
            ) : (
              <span />
            )}
            {block !== null && <p className="ed-block">{block.message}</p>}
            {violations.map((violation) => (
              <p key={violation.rule} className={violation.severity === 'error' ? 'ed-error' : 'ed-advisory'}>
                {violation.message}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: The tab**

In `src/designEditor/Editor.tsx`:

```tsx
import { CopyForm } from './CopyForm';

export type EditorTab = 'tokens' | 'copy';
const TABS: ReadonlyArray<{ readonly id: EditorTab; readonly label: string }> = [
  { id: 'tokens', label: 'Colours and Tokens' },
  { id: 'copy', label: 'Words' },
];
```

and in the body:

```tsx
          {tab === 'tokens' && <TokenForm skin={skin} edits={edits} onChange={update} />}
          {tab === 'copy' && <CopyForm skin={skin} edits={edits} onChange={update} />}
```

- [ ] **Step 5: Run to see it pass**

Run: `npx vitest run --maxWorkers=1 src/designEditor/`
Expected: every test passes, 6 new. Rendering 583 textareas in jsdom takes a few seconds; the file timeout is 20 s.

- [ ] **Step 6: A real copy write, in the browser**

`npm run design`. In Words, search `button.continue`, change the value to two different Title Case words, Update. Expected, record each:

1. The log ends with `design-patch: run npx vitest run, plus check-title-case and check-no-emoji, next.` (the applier regenerated the catalogue itself).
2. The preview reloaded once and is on the same screen it was on before (the view is restored from the app's session mirror).
3. The bar lists `copy.ts`, `catalogue.json`, `catalogue.md` and walk pages as modified.
4. Revert, confirm: `git status --short` is clean.

- [ ] **Step 7: Commit**

```bash
git add src/designEditor/CopyForm.tsx src/designEditor/CopyForm.test.tsx src/designEditor/Editor.tsx
git commit -m "feat(design): the Words form, every copy key per skin with the contract live" -- src/designEditor/
```

---

## Task 4: The intro form, with notes

**Files:**
- Create: `src/designEditor/IntroForm.tsx`
- Modify: `src/designEditor/Editor.tsx` (`EditorTab`, `TABS`, the body switch)
- Test: `src/designEditor/IntroForm.test.tsx`

**Interfaces:**
- Consumes: `StoredEdits` (Task 2); `R10_MODULES` from `src/content/r10Text.ts`; `r10Blocked`, `validateR10Edit`, `describeR10Target`, `withoutNote`, `DesignNote`, `NoteIntent` from `src/design/r10Edits.ts`.
- Produces: `IntroForm({ edits, onChange })`. The form takes no skin: R10 text is one string per field for every skin (`src/design/designStorage.ts` records why).

- [ ] **Step 1: The test, written first**

```tsx
// src/designEditor/IntroForm.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { R10_MODULES } from '../content/r10Text';
import { clearStoredEdits, readStoredEdits, type StoredEdits } from '../design/designStorage';
import { IntroForm } from './IntroForm';

beforeEach(() => {
  clearStoredEdits();
});

const empty = (): StoredEdits => readStoredEdits();
const open = R10_MODULES.filter((module) => module.lock === null);
const locked = R10_MODULES.filter((module) => module.lock !== null);

function firstOpenField() {
  const field = open[0]?.fields[0];
  if (field === undefined) throw new Error('no open R10 field');
  return field;
}

describe('IntroForm', () => {
  it('renders one textarea per field of every open module, and none for a locked one', () => {
    render(<IntroForm edits={empty()} onChange={() => undefined} />);
    const expected = open.reduce((n, module) => n + module.fields.length, 0);
    expect(screen.getAllByRole('textbox', { name: /:/ })).toHaveLength(expected);
    for (const module of locked) {
      for (const field of module.fields) expect(screen.queryByRole('textbox', { name: field.id })).toBeNull();
    }
  });

  it('shows each locked module with its lock sentence', () => {
    render(<IntroForm edits={empty()} onChange={() => undefined} />);
    for (const module of locked) expect(screen.getByText(module.lock ?? '')).toBeInTheDocument();
  });

  it('an edit lands under the field id; the shipped string back removes it', () => {
    const onChange = vi.fn();
    const field = firstOpenField();
    render(<IntroForm edits={empty()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: field.id }), { target: { value: 'New words.' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...empty(), r10: { [field.id]: 'New words.' } });
    fireEvent.change(screen.getByRole('textbox', { name: field.id }), { target: { value: field.value } });
    expect(onChange).toHaveBeenLastCalledWith({ ...empty(), r10: {} });
  });

  it('an em dash shows the contract as an error', () => {
    const field = firstOpenField();
    const edits: StoredEdits = { ...empty(), r10: { [field.id]: 'Before — after.' } };
    const { container } = render(<IntroForm edits={edits} onChange={() => undefined} />);
    expect(container.querySelector('.ed-error')).not.toBeNull();
  });

  it('a note is added against the field and can be removed', () => {
    const onChange = vi.fn();
    const field = firstOpenField();
    const { rerender } = render(<IntroForm edits={empty()} onChange={onChange} />);
    const row = screen.getByRole('textbox', { name: field.id }).closest('.ed-row');
    if (row === null) throw new Error('no row');
    const kind = row.querySelector('select');
    const text = row.querySelector('input[type="text"]');
    const add = Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Add note');
    if (kind === null || text === null || add === undefined) throw new Error('note controls missing');
    fireEvent.change(kind, { target: { value: 'heading' } });
    fireEvent.change(text, { target: { value: 'Above the list' } });
    fireEvent.click(add);
    const note = { target: field.id, intent: 'heading', text: 'Above the list' };
    expect(onChange).toHaveBeenLastCalledWith({ ...empty(), notes: [note] });

    rerender(<IntroForm edits={{ ...empty(), notes: [note] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove note 0' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...empty(), notes: [] });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --maxWorkers=1 src/designEditor/IntroForm.test.tsx`
Expected: FAIL, unresolved import `./IntroForm`.

- [ ] **Step 3: The form**

```tsx
// src/designEditor/IntroForm.tsx
import { useState, type ReactElement } from 'react';
import { R10_MODULES } from '../content/r10Text';
import type { StoredEdits } from '../design/designStorage';
import {
  describeR10Target,
  r10Blocked,
  validateR10Edit,
  withoutNote,
  type NoteIntent,
} from '../design/r10Edits';

const INTENTS: readonly NoteIntent[] = ['heading', 'bullet', 'delete', 'note'];

function isIntent(value: string): value is NoteIntent {
  return (INTENTS as readonly string[]).includes(value);
}

export interface IntroFormProps {
  readonly edits: StoredEdits;
  readonly onChange: (next: StoredEdits) => void;
}

/**
 * The long-form text: one field per string the open R10 modules export, and the lock sentence
 * for every module the evidence gate closes (src/content/r10Text.ts derives the lock; nothing
 * here decides it). Notes are the structural changes the applier will not perform, promoting,
 * demoting, deleting, moving; they go into the commit message on SAVE and a person does them.
 */
export function IntroForm({ edits, onChange }: IntroFormProps): ReactElement {
  const setText = (id: string, shipped: string, raw: string): void => {
    const value = raw.replace(/[\r\n\t]+/g, ' ');
    const next: Record<string, string> = { ...edits.r10 };
    if (value === shipped) delete next[id];
    else next[id] = value;
    onChange({ ...edits, r10: next });
  };
  const addNote = (target: string, intent: NoteIntent, text: string): void => {
    onChange({ ...edits, notes: [...edits.notes, { target, intent, text }] });
  };
  const removeNote = (index: number): void => {
    onChange({ ...edits, notes: withoutNote(edits.notes, index) });
  };

  return (
    <div className="ed-intro">
      <p className="ed-hint">{describeR10Target()}</p>
      {R10_MODULES.map((module) => (
        <fieldset key={module.id} className="ed-group">
          <legend>
            <code>{module.file}</code>
          </legend>
          {module.lock !== null ? (
            <p className="ed-block">{module.lock}</p>
          ) : (
            module.fields.map((field) => {
              const block = r10Blocked(field.id);
              const value = edits.r10[field.id] ?? field.value;
              const changed = value !== field.value;
              const violations = block === null && changed ? validateR10Edit(field.id, value) : [];
              const notes = edits.notes
                .map((note, index) => ({ note, index }))
                .filter(({ note }) => note.target === field.id);
              return (
                <div key={field.id} className={changed ? 'ed-row ed-changed' : 'ed-row'}>
                  <label htmlFor={`r10-${field.id}`}>
                    <code>{field.path}</code> <em>{field.kind}</em>
                  </label>
                  <span />
                  <textarea
                    id={`r10-${field.id}`}
                    name={field.id}
                    aria-label={field.id}
                    rows={2}
                    value={value}
                    disabled={block !== null}
                    onChange={(event) => setText(field.id, field.value, event.target.value)}
                  />
                  {changed ? (
                    <button type="button" aria-label={`Reset ${field.id}`} onClick={() => setText(field.id, field.value, field.value)}>
                      Reset
                    </button>
                  ) : (
                    <span />
                  )}
                  {block !== null && <p className="ed-block">{block.message}</p>}
                  {violations.map((violation) => (
                    <p key={violation.rule} className={violation.severity === 'error' ? 'ed-error' : 'ed-advisory'}>
                      {violation.message}
                    </p>
                  ))}
                  {block === null && <NoteAdder onAdd={(intent, text) => addNote(field.id, intent, text)} />}
                  {notes.map(({ note, index }) => (
                    <p key={index} className="ed-note">
                      {note.intent}
                      {note.text === '' ? '' : `: ${note.text}`}{' '}
                      <button type="button" aria-label={`Remove note ${index}`} onClick={() => removeNote(index)}>
                        Remove
                      </button>
                    </p>
                  ))}
                </div>
              );
            })
          )}
        </fieldset>
      ))}
    </div>
  );
}

function NoteAdder({ onAdd }: { readonly onAdd: (intent: NoteIntent, text: string) => void }): ReactElement {
  const [intent, setIntent] = useState<NoteIntent>('note');
  const [text, setText] = useState('');
  const submit = (): void => {
    // A bare intent (heading, bullet, delete) is an instruction on its own; a bare note is nothing.
    if (intent === 'note' && text.trim() === '') return;
    onAdd(intent, text.trim());
    setText('');
  };
  return (
    <div className="ed-note ed-note-adder">
      <select aria-label="Note kind" value={intent} onChange={(event) => { if (isIntent(event.target.value)) setIntent(event.target.value); }}>
        {INTENTS.map((id) => (
          <option key={id} value={id}>{id}</option>
        ))}
      </select>{' '}
      <input type="text" aria-label="Note text" value={text} placeholder="Move this above the heading" onChange={(event) => setText(event.target.value)} />{' '}
      <button type="button" onClick={submit}>Add note</button>
    </div>
  );
}
```

- [ ] **Step 4: The tab**

In `src/designEditor/Editor.tsx`:

```tsx
import { IntroForm } from './IntroForm';

export type EditorTab = 'tokens' | 'copy' | 'intro';
const TABS: ReadonlyArray<{ readonly id: EditorTab; readonly label: string }> = [
  { id: 'tokens', label: 'Colours and Tokens' },
  { id: 'copy', label: 'Words' },
  { id: 'intro', label: 'Intro Text' },
];
```

and in the body:

```tsx
          {tab === 'intro' && <IntroForm edits={edits} onChange={update} />}
```

- [ ] **Step 5: Run to see it pass, then the whole editor directory and the gates**

```bash
npx vitest run --maxWorkers=1 src/designEditor/
npx tsc -b --force && npx eslint ./src ./scripts ./build && node scripts/check-no-emoji.mjs && node scripts/check-title-case.mjs
```

Expected: all pass; gates exit 0.

- [ ] **Step 6: A real intro write, in the browser**

`npm run design`. In the preview, reach the intro (a fresh profile, or wherever the app replays it) and advance to the fourth slide. In Intro Text, change one word of that slide's `rest` string, Update. Expected, record each:

1. The log shows `design-patch: wrote 1 long-form row(s) to src/content/introSlides.ts`.
2. The preview reloaded and the intro restarted at its first slide (`IntroSequence` keeps its index in component state, not in the session mirror). Tap through to the fourth: the new word is there. State this in the report; the decision about persisting the slide index is the owner's (see "Decisions for the owner").
3. Add a note `heading` on that field, type a commit message, Save. Expected: `git log -1 --format=%B` shows the message, a blank line, then `[introSlides:INTRO_SLIDES.3.rest] Promote this to a heading.` (the id will be whatever the field's id is; read it off the form label).
4. `git show --stat HEAD` lists only `src/content/introSlides.ts`.

Then `git reset --soft HEAD~1 && git checkout -- src/content/introSlides.ts` to drop the trial commit, and say so.

- [ ] **Step 7: Commit**

```bash
git add src/designEditor/IntroForm.tsx src/designEditor/IntroForm.test.tsx src/designEditor/Editor.tsx
git commit -m "feat(design): the Intro Text form, with the evidence lock and notes that ride on Save" -- src/designEditor/
```

---

## Task 5: The deployed app is not editable, and the documents say so

**Files:**
- Modify: `src/app/App.tsx:34` (import) and `:784-793` (the mount and its comment)
- Create: `scripts/check-dist-no-editor.sh`
- Modify: `.github/workflows/ci.yml:148` (one step after the CSP check)
- Modify: `docs/plans/2026-09-10-16-design-mode.md` (decision header at the top)
- Modify: `docs/HANDOFF-2026-09-10.md` section 3 (one paragraph at the top)
- Modify: `docs/plans/2026-09-10-17-next-phase.md` Job 1 (the flow)

**Interfaces:**
- Consumes: nothing new.
- Produces: a build with no editor, checked in CI.

- [ ] **Step 1: Measure the bundle before**

```bash
npm run build > /dev/null && du -k dist/assets/index-*.js | cut -f1 && grep -c 'Promote this to a heading' dist/assets/index-*.js
```

Record both numbers. The second is expected to be 1 today.

- [ ] **Step 2: Remove the mount**

In `src/app/App.tsx` delete line 34 (`import { DesignGate } from '../design/DesignGate';`) and replace the comment block plus `<DesignGate />` at `:784-793` with:

```tsx
      {/*
       * NO DESIGN MODE HERE. The in-place editor that used to mount last (`?design=1`) was
       * replaced on 2026-09-10 by the local editor at design.html, which frames this app in a
       * dev-server page and edits the source directly: docs/plans/2026-09-10-18-local-design-editor.md.
       * Nothing in the shipped app is editable, and src/design/ is reached only from that page.
       */}
```

- [ ] **Step 3: The dist check, written so CI fails if the editor ever ships**

```bash
#!/usr/bin/env bash
# scripts/check-dist-no-editor.sh
# The local design editor (docs/plans/2026-09-10-18-local-design-editor.md) lives at design.html,
# which vite serves in dev and must never build, and its panel must not be reachable from the
# app. Both are checked on the built output, because that is what ships.
set -euo pipefail
dist="${1:-dist}"
if [ -e "$dist/design.html" ]; then
  echo "FAIL: $dist/design.html exists. The editor page must not be built."
  exit 1
fi
if grep -l 'Promote this to a heading' "$dist"/assets/*.js >/dev/null 2>&1; then
  echo "FAIL: the bundle contains the design editor's note text. Something still imports src/design/r10Edits.ts from the app."
  exit 1
fi
echo "OK: no editor page, no editor code in $dist."
```

`chmod +x scripts/check-dist-no-editor.sh`. In `.github/workflows/ci.yml`, after the step at `:148` (`run: bash scripts/check-dist-csp.sh dist/index.html`), add:

```yaml
      - name: The built app carries no design editor
        run: bash scripts/check-dist-no-editor.sh dist
```

Match the indentation of the step above it.

- [ ] **Step 4: Build and measure after**

```bash
npx tsc -b --force && npx eslint ./src ./scripts ./build
npm run build > /dev/null && du -k dist/assets/index-*.js | cut -f1 && bash scripts/check-dist-no-editor.sh dist && bash scripts/check-dist-csp.sh dist/index.html
npx vitest run --maxWorkers=1 src/app/ src/design/
```

Expected: the check prints `OK`, the CSP check passes, the suite passes, and the bundle is smaller. State the delta in KiB. If the grep still finds the string, `src/content/copy.ts` -> `src/design/copyMarkers.ts` is expected to remain (it is small and gated); anything reaching `r10Edits.ts` is not, and must be traced with `npx vite build --debug` or by reading the importers.

- [ ] **Step 5: The documents**

At the top of `docs/plans/2026-09-10-16-design-mode.md`, above the title:

```markdown
<!-- decision: design-mode-in-place-editing | status: superseded | supersedes: none -->
> **Superseded 2026-09-10** by `docs/plans/2026-09-10-18-local-design-editor.md`. Editing inside the running app's own document put the caret's tap on the same element the intro advances on; the replacement frames the app from a separate page. Tasks 1, 2 and 2b here shipped and their modules (`tokenSheet`, `copyEdits`, `r10Edits`, `designPatch`, `designStorage`, `colour`, `contrastPairs`) are what the local editor is built from. Task 3 and Task 4 are carried forward in the new plan's "Not in this plan".
```

In `docs/HANDOFF-2026-09-10.md`, at the top of section 3, before the URL:

```markdown
**Replaced on 2026-09-10.** The `?design=1` overlay is gone from the shipped app. He edits at
`http://localhost:5173/FixThisInjustice/design.html` after `npm run design`, on his own machine;
Update writes the source through `scripts/design-patch.mjs`, Save commits. The plan and the
reasons are `docs/plans/2026-09-10-18-local-design-editor.md`. The table below records what
was built and is kept for the modules the new editor reuses.
```

In `docs/plans/2026-09-10-17-next-phase.md`, replace the first paragraph of Job 1 and its first three checkboxes with:

```markdown
He edits on his own machine: `npm run design` opens the editor, Update rewrites `tokens.css`,
`copy.ts`, the skin tables and `introSlides.ts` through `scripts/design-patch.mjs` (which
regenerates the catalogue itself), and Save commits the write set with his message. There is
no JSON to paste and no cached bundle to export from. Your job on his commits:

- [ ] Read them: `git log --stat -- src/ui/styles/tokens.css src/content/`. Every change in
      them is his decision.
- [ ] Run the gates and the suite on the merged tree. Save already ran `check-title-case` and
      `check-no-emoji` and refused the commit if either failed, so a red gate here means
      something else moved.
- [ ] Notes travel in the commit message body as `[field] instruction`. Implement those by hand.
```

Keep "Notes are not edits" (shortened to what still applies: the applier prints them, the message carries them) and keep "When his copy breaks a rule" unchanged.

- [ ] **Step 6: Gates and commit**

```bash
node scripts/check-no-emoji.mjs && node scripts/check-title-case.mjs
git add src/app/App.tsx scripts/check-dist-no-editor.sh .github/workflows/ci.yml docs/plans/2026-09-10-16-design-mode.md docs/HANDOFF-2026-09-10.md docs/plans/2026-09-10-17-next-phase.md
git commit -m "The shipped app is not editable: Design Mode unmounted, checked in CI, documents pointed at the local editor" -- src/app/App.tsx scripts/check-dist-no-editor.sh .github/workflows/ci.yml docs/plans/2026-09-10-16-design-mode.md docs/HANDOFF-2026-09-10.md docs/plans/2026-09-10-17-next-phase.md
```

---

## Merge, deploy, verify

- [ ] Merge the worktree branch into main with `--no-ff`; run the full suite by chunk on main (`src/domain/ src/content/`, `src/ui/`, `src/app/ src/store/ src/skins/ src/design/ src/designEditor/ src/config/ build/`); count files against `find src build -name '*.test.ts*' | wc -l`.
- [ ] Push. Wait for both workflows on THIS head SHA. Fetch the page, read the asset name from the HTML, fetch the chunk **checking the HTTP status is 200** (a 404 page is 9 KB and greps clean), and confirm `grep -c 'Promote this to a heading'` is 0 on the served chunk.
- [ ] Tell him to open the deployed app in a private tab once so the service worker drops the old bundle.

## Decisions for the owner

1. **The intro restarts after an intro-text Update.** The preview reloads (module graph, see "Why this shape"), and `IntroSequence` keeps the slide index in component state. Tapping through is three taps. Persisting the index in the session mirror would make the app itself resume a half-read intro after any reload, which is a shipped behaviour change; it is one small task if wanted.
2. **Phone use means the LAN.** `npm run design -- --host` serves the editor to the phone at the laptop's address, and then the write routes are reachable by anyone on that network. Default is localhost only. Say if the phone matters.
3. **The in-place layer's files are still in the tree** (`DesignGate.tsx`, `DesignPanel.tsx`, `CopyEditLayer.tsx`, `copyMarkers.ts`, `pasteGuard.ts`, `introEditing.test.tsx`, `designMode.ts`, and the marker branch in `copy.ts:1999-2023`). They ship in no bundle after Task 5 and are deleted in a follow-on once the editor has been used for one real session.
4. **Save commits; pushing stays manual.** A push publishes; a commit does not. Say if Save should push.

## Not in this plan

- Design Mode Task 3 (dropping an image into a placeholder frame) and Task 4 (layout pins). The asset job (`docs/plans/2026-09-10-17-next-phase.md` Job 4) still wants Task 3 first if he wants to judge placement; it would be a fourth tab here, `Images`, posting `{ registerRow, filename, dataUri }` rows the applier already reserves the `assets` field for.
- Font size and weight. Not tokenised (`docs/plans/2026-09-10-16-design-mode.md` Task 0); the token form edits what the sheet declares.
- Deleting the in-place layer (decision 3 above).
- A phone layout beyond the stacked fallback at 900 px.
- `graphify --update`. The graph predates `src/design/` (last built 2026-09-02) and this plan's decision headers are not in it.
