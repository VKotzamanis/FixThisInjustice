# P4b Platform: Updates, Durability, Build and Deploy Implementation Plan

> SUPERSEDED 2026-11-06 executed plan (P4b shipped). Deploy and update behaviour: `docs/runbooks/deploy.md`, `src/app/updateController.ts`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deploy reaches an installed phone without two cold launches and never reloads a live session; a docs-only commit ships nothing; the deploy publishes only the tested bytes of a push to `main` that is still `main`'s HEAD; first load carries only the screens it shows; a backup is proven by the user, not by a returned call; the browser is asked to keep the data; install guidance is shown to everyone who has not installed.

**Architecture:** The update model is one controller (`src/app/updateController.ts`) fed by a pure policy (`src/app/updatePolicy.ts`): poll on visible and every 30 min, apply a waiting worker at a safe moment (no session open and nobody touching the page), banner only while a session is open. The build stamp moves into a non-precached `build-info.json`, so `sw.js` is byte-identical across builds of the same code (measured). Deploy downloads CI's `dist` artifact, skips by content fingerprint, by HEAD check and by event origin. Screens are split with a small `lazyRoute` (no `React.lazy`: a failed chunk stays local and retryable). Durability and install state are module-level external stores read by Settings and an install card.

**Tech Stack:** React 19.2.8, TypeScript 5.9, Vite 8.2.2, vite-plugin-pwa 1.3.0 (`registerType: 'prompt'`, `injectManifest`), workbox-window 7.4.1, Zustand 5, Zod 4.5.4, Vitest 4, @playwright/test 1.63.0 (Chromium 1243, iPhone 13 + Pixel 7 emulation), GitHub Actions (checkout v7, download-artifact v8, upload-artifact v7, upload-pages-artifact v5, deploy-pages v5).

**Spec:** `docs/plans/2026-11-04-aaa-rebuild-spec.md` rulings R7 (updates) and R8 (durability); phase P4 platform half. Audit `docs/private/audit-2026-11-04/E-connectivity.md` (E01, E06, E07, E08, E09, E11, E12, E13, E14, E15; gitignored, this laptop only) and `B-data.md` (B07, B09). Out of scope here: E05 form videos (P7), E10 Worker (P7), E02 safe areas (P4a), every R6 shell item (P4a).

## Global Constraints

- AGENTS.md rules 1-10 and its Verify block apply to every task.
- Rule 1: no new health number. The only new constants are engineering bounds (poll interval, retry count, URL lifetime, z-index); each carries its unit and reason in a comment.
- Rule 2: derive, never copy. The confirmation word, the build stamp shape and the shipped-sound list each have one source; a test reads both sides where two files must agree.
- Rule 3: stage with pathspecs (`git add -- <files>`), never `git add -A`.
- Rule 5: colours only through tokens in `src/ui/styles/tokens.css`; no hex, rgb or hsl literal in component CSS.
- Rule 6: only `src/store/persistence.ts` touches web storage (`sessionMirror.ts` owns sessionStorage); `toISOString()` only in `src/domain/dates.ts`. `navigator.storage.persist()` is not web storage and is not banned; it lives in `src/app/storageDurability.ts`.
- Rule 7: old `fti.v3` documents and old JSON exports load unchanged. The one schema change (Task 9) is an additive OPTIONAL field; `CURRENT_SCHEMA_VERSION` stays 3; no new enum value.
- Rule 8: re-run the gates yourself; a subagent's "passed" is a claim.
- Wording is out of scope (owner: "Do not focus on the text"). A copy key is added only where a new control or notice needs one: base table `src/content/copy.ts` only (union member AND table row), never `copy.limelight.ts`; `button.`/`label.`/`hero.` values in Title Case; button at most 3 words, advice at most 12; no em dash, no emoji, no `!`, no URL. Each new key also gets its row in `src/content/__fixtures__/limelight-resolved.json` through the exact `node -e` command the task gives (the fixture is one line of compact JSON ending in a newline). Existing strings are never edited.
- Tests: always `--maxWorkers=1`, by group. 16 GB machine shared with MATLAB and other agents: run `free -m` first and wait while available is under 1500 MB. "Test timed out" is not an assertion failure; rerun once alone.
- Units and sign conventions in comments for every quantity: `[ms]`, `[ms] epoch, UTC`, `[s]`, `[B]` (bytes), `[attempts]`.
- Phone width 320-412 px; installed iPhone Safari and Android Chrome are the targets. Playwright here is Chromium with device emulation, NOT WebKit: every iOS claim below is marked [U] unless a source is cited.
- Implementers (Codex, no network, no ports) run vitest, tsc and eslint only. The Claude runner runs `npm run e2e` (port 4174) and reviews. E2E specs carry no `test.fail()`.
- Commit once per task with the given message; never push (the owner pushes). In a `.claude/worktrees/*` worktree the git guard refuses git: stop, leave changes uncommitted, list the files.
- Anchor every edit in a shared file by its quoted content, never by line number. Line numbers below are HEAD 92ebd80 numbers and are hints only.

## Merge order and shared files (lead)

- P4b lands after P1 (it reads `openAssignment`, `useOpenAssignment`, `LoadRecovery.tsx`, `CONFIRM_WORD` exported from `DataSection.tsx`, P1 Task 9's guarded `handleDayOfTime`). Task 12 needs P6 landed (`src/ui/views/train/RestGameSheet.tsx`); it stops otherwise.
- Tasks 1, 2, 3, 7, 8, 10, 11 do not touch `App.tsx`, `appShell.css` or `main.tsx` beyond what is listed and can land before or after P4a.
- Tasks 4, 5, 6, 9 touch `src/main.tsx`, `src/app/App.tsx` and append to `src/app/appShell.css`. Recommended: land them AFTER P4a. Their `App.tsx` edits are import-line swaps plus one JSX line after `<UpdatePrompt />`; if P4a moved those lines into another file under `src/app/`, apply the same edit there (grep for the quoted line). Task 5 REQUIRES P4a Task 1 (the `--z-*` ladder in `tokens.css`, `docs/plans/2026-11-04-p4a-shell-design.md`) and docks at `calc(var(--z-modal) + 1)`; it measures the header through `header.topbar`, which P4a's one-line header keeps.
- P2 (storage engine): Task 4 calls `flushSave` from `src/store/index.ts` through an injected `flush` dependency; if P2 removes the debounce, pass a no-op or P2's flush in `src/main.tsx` only. Task 1's guard test fails on any new `from 'zod'` import: P2's record schemas must import `z` from `src/domain/zod.ts`. Task 10 touches no file of P2; P2's `storage.estimate()` warning can sit beside Task 10's line in `DataSection.tsx`.
- Copy keys: each task inserts after a distinct existing key (`'button.reload'`, `'status.exportTaken'`, `'status.installAndroidOpen'`, `'advice.dataOnDevice'`), so the base table never conflicts; the one-line fixture always conflicts textually with any concurrent key addition: resolve by taking one side and re-running the other side's `node -e` command.

---

## File Structure

| Path | Status | Responsibility | Task |
|---|---|---|---|
| `src/domain/zod.ts` | create | The one import of Zod; `z.config({ jitless: true })` before any schema is built | 1 |
| `src/domain/zod.test.ts` | create | jitless is on; no other app module imports `zod` | 1 |
| `src/domain/schema.ts`, `src/store/training.ts`, `src/store/sessionMirror.ts` | modify | import `z` from `src/domain/zod.ts` | 1 |
| `src/sw.ts` | modify | `clients.claim()` on activate | 1 |
| `vite.config.ts` | modify | manifest `id`; font decision comment (1); stamp define removed, plugin added (2); `__SFX_FILES__` define (11) | 1, 2, 11 |
| `src/app/pwaPlatform.test.ts` | create | manifest id, claim, precache font decision | 1 |
| `e2e/p4b-platform.spec.ts` | create | no CSP violation (1), stamp file (2), no sfx request (11) | 1, 2, 11 |
| `build/buildInfo.ts` (+ `.test.ts`) | create | Emits `dist/build-info.json` | 2 |
| `src/app/buildInfo.ts` (+ `.test.ts`) | create | Reads the stamp at runtime, validates its shape | 2 |
| `src/ui/components/SiteFooter.tsx` | modify | Version/commit/date lines from the runtime stamp | 2 |
| `vitest.config.ts`, `src/config/build.d.ts`, `tsconfig.node.json` | modify | Stamp globals removed; build files registered; `__SFX_FILES__` | 2, 3, 11 |
| `scripts/dist-fingerprint.sh` | create | One SHA-256 over the published bytes minus the stamp | 2 |
| `build/distFingerprint.test.ts` | create | Same bytes -> same fingerprint; stamp ignored | 2 |
| `.github/workflows/ci.yml` | modify | Fingerprint and upload `dist` on push | 3 |
| `.github/workflows/deploy.yml` | rewrite | Event/origin guard, HEAD check, CI's dist, content skip, live check | 3 |
| `build/workflows.test.ts` | create | CI assertion that the deploy job and every guard stay | 3 |
| `docs/runbooks/deploy.md` | modify | New deploy flow, rollback by re-run, no-slash offline note | 3 |
| `src/app/updatePolicy.ts` (+ `.test.ts`) | create | Pure apply/prompt/defer decision; 30 min interval | 4 |
| `src/app/updateController.ts` (+ `.test.ts`) | create | Checks, apply, banner, other-window reload | 4 |
| `src/main.tsx` | modify | Controller wiring (4), install capture (9), durability watch (10) | 4, 9, 10 |
| `e2e/r7-update.spec.ts` | create | A new worker applies itself on resume; the first page is controlled | 4 |
| `docs/ARCHITECTURE.md` | modify | Updates row (4), Durability row (10) | 4, 10 |
| `src/app/UpdatePrompt.tsx` (+ test) | modify | Fixed dock under the header, above every scrim | 5 |
| `src/app/appShell.css` | modify | `.update-dock` (5), route placeholders (6), install card (9) | 5, 6, 9 |
| `src/app/lazyRoute.tsx`, `src/app/routes.tsx`, `src/app/routes.test.tsx` | create | Split screens, local retry, import-graph guard | 6 |
| `src/app/App.tsx` | modify | Screens imported from `./routes` (6); `<InstallCard />` (9) | 6, 9 |
| `src/ui/components/confirmWord.ts` | create | `CONFIRM_WORD`, one source (was in DataSection and ExportView) | 6 |
| `src/app/LoadRecovery.tsx`, `src/ui/settings/DataSection.tsx`, `src/ui/views/ExportView.tsx` | modify | read `CONFIRM_WORD` from `confirmWord.ts` (6); Data durability line (10); share export (8) | 6, 8, 10 |
| `src/app/App.test.tsx`, `src/ui/views/TargetsView.test.tsx` | modify | `beforeAll(preloadRoutes)` | 6 |
| `src/ui/components/useLazyMarkup.ts` (+ `.test.tsx`) | create | Lazy SVG text with cache and in-place retry | 7 |
| `src/ui/views/atlasArt.tsx` | modify | `CardIcon` on the shared hook | 7 |
| `src/ui/setup/setupArt.tsx`, `setupArt.test.ts`, `SetupWizard.tsx`, `SetupWizard.test.tsx` | modify | Body-fat drawings as lazy chunks (`BodyFatFigure`) | 7 |
| `src/app/saveFile.ts` (+ `.test.ts`) | create | Share-sheet-or-download, decided inside the tap | 8 |
| `src/app/download.ts` (+ test) | modify | Object URL revoked after 60 s, not synchronously | 8 |
| `src/ui/components/ConfirmDestructive.tsx` (+ test), `DataSection.test.tsx`, `ExportView.test.tsx` | modify | Gate opens on a completed share or a user-confirmed download | 8 |
| `src/app/installPrompt.ts` (+ `.test.ts`) | create | Standalone detection, `beforeinstallprompt` capture | 9 |
| `src/app/InstallCard.tsx` (+ `.test.tsx`) | create | Dismissible install card, any view, after setup, no session open | 9 |
| `src/ui/components/InstallGuide.tsx` | modify | `reason` prop; `useId` heading | 9 |
| `src/domain/types.ts`, `src/domain/schema.ts`, `src/domain/arbitraries.ts`, `src/domain/schema.test.ts` | modify | `ui.installNudgeDismissed?: true` | 9 |
| `src/app/storageDurability.ts` (+ `.test.ts`) | create | `persist()`/`persisted()` with the R8 timing | 10 |
| `src/ui/settings/DataSection.test.tsx` | modify | Durability line and Request button | 10 |
| `src/ui/components/ReminderSettingsPanel.tsx` (+ test) | modify | Inputs inert when unconfigured | 11 |
| `build/sfxManifest.ts` (+ `.test.ts`), `src/skins/sfx.ts` (+ test) | create/modify | Fetch only sound files that ship | 11 |
| `src/ui/views/train/RestTimerPanel.tsx`, `src/ui/views/train/restGameRoute.ts` | modify/create | Game sheet as its own chunk | 12 |
| `src/content/copy.ts`, `src/content/__fixtures__/limelight-resolved.json` | modify | New keys | 6, 8, 9, 10 |

Measured while planning (scratch copy of HEAD 92ebd80, `npx vite build`, 2026-11-04):
- Baseline: main chunk `index-*.js` 865,331 B raw, 280,408 B gzip -9; precache 52 entries.
- Two builds with different `GITHUB_SHA` differ in `index-*.js`, `index.html` and `sw.js` (E06 reproduced).
- With Task 2 applied: two builds with different `GITHUB_SHA` differ ONLY in `build-info.json`; `sw.js` identical; `build-info.json` absent from `sw.js`. `scripts/dist-fingerprint.sh` gives the same hash for both and a different hash for a build with code changes.
- With Task 6 applied: entry chunk 356,919 B + shared vendor chunk 265,588 B = 622,507 B raw (117,182 + 83,777 = 200,959 B gzip -9) on the critical path, vs 865,331 B / 280,408 B; `SetupWizard` chunk 195,462 B (68,791 B gz) loaded only during setup. Precache 65 entries.
- Without Task 1's wrapper, a `z.config` call placed in `main.tsx` lands in the entry chunk AFTER the shared chunk that builds the schemas (the probe would still fire); with `src/domain/zod.ts` the `jitless:!0` call precedes the first schema in the same chunk.
- `archivo-latin-ext-*.woff2` is 86,240 B; `archivo-vietnamese-*.woff2` 34,464 B.
- Prototypes of Tasks 2, 4, 6, 7, 8, 10 passed their own tests, eslint and `npx tsc -p tsconfig.app.json --noEmit` in the scratch copy; the 7 App/Targets tests that broke under Task 6 passed after `beforeAll(preloadRoutes)`; the 16 gate tests that broke under Task 8 passed after the confirm step.

---

### Task 1: Zod jitless, `clients.claim()`, manifest `id`, font precache decision (E11, E09, E15)

**Files:**
- Create: `src/domain/zod.ts`, `src/domain/zod.test.ts`, `src/app/pwaPlatform.test.ts`, `e2e/p4b-platform.spec.ts`
- Modify: `src/domain/schema.ts:1`, `src/store/training.ts:13`, `src/store/sessionMirror.ts:20` (one import line each), `src/sw.ts` (append after the `message` listener), `vite.config.ts` (manifest block; latin-ext comment)

**Interfaces:**
- Produces: `export { z }` from `src/domain/zod.ts` (the same namespace object as `import { z } from 'zod'`, with `jitless` set). Every later app module that needs Zod imports it from here.

Why a wrapper module and not a call in `main.tsx`: Zod 4.5.4 runs its `new Function('')` probe when a `z.object()` is CONSTRUCTED (`node_modules/zod/v4/core/schemas.js:1085-1087`, `jit && allowsEval.value`; `util.js:148-152` returns false without probing under `jitless`). In a production build the schemas live in a shared chunk the entry imports, which is evaluated before the entry's own body (measured, see header), so only a module every schema module imports can run first.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/zod.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { z } from './zod';

/** Every non-test source file under src, as text, keyed by its path relative to this file. */
const SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('Zod is configured before any schema is built (audit E11)', () => {
  it('runs jitless, so the eval probe never fires under the CSP', () => {
    expect(z.config().jitless).toBe(true);
  });

  it("no app module imports 'zod' except src/domain/zod.ts", () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path, text]) => path !== './zod.ts' && /from 'zod(\/[^']*)?'/.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
```
Create `src/app/pwaPlatform.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
// ?raw, not node:fs: tsconfig.app.json pins `types` to the vite client types (pwaIcons.test.ts).
import viteConfigSource from '../../vite.config.ts?raw';
import swSource from '../sw.ts?raw';

describe('PWA platform (audit E09, E15)', () => {
  it('pins the manifest id to the current start_url, so identity survives a start_url change', () => {
    expect(viteConfigSource).toMatch(/start_url: '\/FixThisInjustice\/',/);
    expect(viteConfigSource).toMatch(/\bid: '\/FixThisInjustice\/',/);
  });

  it('claims open pages when a worker activates (first session is served offline-first)', () => {
    expect(swSource).toMatch(/self\.addEventListener\('activate'/);
    expect(swSource).toMatch(/self\.clients\.claim\(\)/);
  });

  it('keeps the latin-ext and vietnamese subsets out of the precache (decision E15)', () => {
    const ignores = viteConfigSource.slice(viteConfigSource.indexOf('globIgnores'));
    expect(ignores).toContain("'**/archivo-latin-ext-*'");
    expect(ignores).toContain("'**/archivo-vietnamese-*'");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/domain/zod.test.ts src/app/pwaPlatform.test.ts`
Expected: FAIL: `./zod` cannot be resolved; the `id` and `clients.claim` assertions fail.

- [ ] **Step 3: Implement**

Create `src/domain/zod.ts`:
```ts
// src/domain/zod.ts
//
// Audit E11: the ONE way app code reaches Zod. Zod 4 probes `new Function('')` when a z.object()
// is CONSTRUCTED unless `jitless` is set (node_modules/zod/v4/core/schemas.js: `jit &&
// allowsEval.value`; util.js allowsEval returns false under jitless without probing), and the
// app's CSP (`script-src 'self'`, no 'unsafe-eval') reports that probe as a
// securitypolicyviolation on every load. A config call in main.tsx is too late: the bundler
// evaluates the shared chunk that builds the schemas before the entry's own body (measured in a
// production build, 2026-11-04). Every schema module imports `z` from here, so the config runs
// before the first schema is built, in any chunk order. zod.test.ts fails on a direct import.
import { z } from 'zod';

z.config({ jitless: true });

export { z };
```
In `src/domain/schema.ts` replace `import { z } from 'zod';` with `import { z } from './zod';`.
In `src/store/training.ts` and `src/store/sessionMirror.ts` replace `import { z } from 'zod';` with `import { z } from '../domain/zod';`.

In `src/sw.ts`, directly after the closing `});` of the `self.addEventListener('message', ...)` block, insert:
```ts

/*
 * Audit E09: without claim, the page that installed the worker stays uncontrolled for its whole
 * life (`navigator.serviceWorker.controller === null` was reproduced), so the first session after
 * install fetched every lazy chunk from the network. Claiming does not change WHEN an update
 * applies: a new worker still waits for SKIP_WAITING (src/app/updateController.ts), and claim()
 * only adopts pages that have no controller.
 */
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});
```
In `vite.config.ts`, in the `manifest:` object, replace
```ts
        start_url: '/FixThisInjustice/',
```
with
```ts
        /*
         * Audit E15: identity pinned to today's start_url. Without `id` the browser keys the
         * installed app on start_url, so changing start_url would install a second app. MDN,
         * manifest `id` (read 2026-11-04): "If id is not specified ... the start_url value is
         * used"; a relative id is resolved against start_url's origin, so this is the same
         * identity installed apps already have.
         */
        id: '/FixThisInjustice/',
        start_url: '/FixThisInjustice/',
```
In `vite.config.ts`, inside the `globIgnores` comment that begins `* Font subsets the app can never render (code review).`, replace its last sentence
```
           * when a page asks for it, because the file is still in dist.
```
with
```
           * when a page asks for it, because the file is still in dist.
           *
           * Decision E15 (2026-11-04): kept out. Precaching latin-ext would add 86,240 B and
           * vietnamese 34,464 B [B, measured woff2] to every install and every font update, for
           * one case: user-typed text with Central European or Vietnamese letters, opened
           * OFFLINE before the subset was ever fetched online. That text still renders, in the
           * system face. Rejected: precache both (cost on every install for a rare glyph case).
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=1 src/domain src/app/pwaPlatform.test.ts src/app/pwaIcons.test.ts src/store`
Expected: PASS (`zod.test.ts` 2 tests, `pwaPlatform.test.ts` 3 tests).
Run: `npx tsc -b --force && npx eslint ./src ./scripts ./build`
Expected: no output errors.

- [ ] **Step 5: E2E spec (the runner runs it)**

Create `e2e/p4b-platform.spec.ts`:
```ts
// P4b platform checks that only a real browser can make (spec R7/R8, audit E06, E11, E15).
import { expect, test } from '@playwright/test';
import { openApp, seedDocument } from './support/app';
import { e2eDocument } from './support/document';

test('E11: a cold load raises no CSP violation', async ({ context }) => {
  await context.addInitScript(() => {
    const seen: string[] = [];
    Reflect.set(window, '__cspViolations', seen);
    document.addEventListener('securitypolicyviolation', (e) => {
      seen.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await seedDocument(context, e2eDocument());
  const page = await openApp(context);
  await page.waitForTimeout(1_000); // [ms] let late scripts run
  expect(await page.evaluate(() => Reflect.get(window, '__cspViolations') as string[])).toEqual([]);
});
```
Runner: `npm run e2e -- e2e/p4b-platform.spec.ts` -> `2 passed` (one per project). Before this task the same spec fails with `["script-src eval"]` (audit E11).

- [ ] **Step 6: Commit**

```bash
git add -- src/domain/zod.ts src/domain/zod.test.ts src/domain/schema.ts src/store/training.ts src/store/sessionMirror.ts src/sw.ts vite.config.ts src/app/pwaPlatform.test.ts e2e/p4b-platform.spec.ts
git commit -m "fix(platform): Zod jitless before any schema, clients.claim, manifest id, font precache decision (E11, E09, E15)"
```

---

### Task 2: Build stamp out of the hashed chunk; content fingerprint (E06)

**Files:**
- Create: `build/buildInfo.ts`, `build/buildInfo.test.ts`, `src/app/buildInfo.ts`, `src/app/buildInfo.test.tsx`, `scripts/dist-fingerprint.sh`, `build/distFingerprint.test.ts`
- Modify: `vite.config.ts` (imports; delete the `BUILD_DATE_ISO` block; `define`; `plugins`), `vitest.config.ts` (delete the `BUILD_DATE_ISO` block and two define lines), `src/config/build.d.ts` (delete two declarations), `tsconfig.node.json` (`include`), `src/ui/components/SiteFooter.tsx`, `src/content/copy.ts` (two comments only), `e2e/p4b-platform.spec.ts` (append)

**Interfaces:**
- Produces: `BUILD_INFO_FILE = 'build-info.json'`, `interface BuildInfo { commit: string; date: string }`, `buildInfo(env, at: Date): BuildInfo`, `utcDate(at: Date): string`, `buildInfoPlugin(): Plugin` in `build/buildInfo.ts`; `parseBuildInfo(raw: unknown): RuntimeBuildInfo | null`, `loadBuildInfo(): Promise<RuntimeBuildInfo | null>`, `useBuildInfo(): RuntimeBuildInfo | null`, `resetBuildInfoForTest(): void` in `src/app/buildInfo.ts`; `scripts/dist-fingerprint.sh DIR` prints one 64-hex SHA-256 (used by Task 3).

Design: `dist/build-info.json` is not matched by `injectManifest.globPatterns` (`**/*.{js,css,html,ico,png,svg,woff,woff2}`), so it is never in `sw.js`: a rebuild that changes only the commit or date leaves every precached byte and `sw.js` identical, so installed apps see no update (measured, header). The footer reads it at runtime; when it cannot (offline, dev server) the version and build lines are omitted, never filled with an invented value. Rejected: a manifest field (the manifest is precached, so `sw.js` would change per commit); keeping the define and only adding `paths-ignore` (`workflow_run` has no `paths` filter, Task 3).

- [ ] **Step 1: Write the failing tests**

Create `build/buildInfo.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BUILD_INFO_FILE, buildInfo, utcDate } from './buildInfo.ts';

describe('build stamp (audit E06)', () => {
  it('takes the short commit from GITHUB_SHA and the UTC date of the build', () => {
    const at = new Date(Date.UTC(2026, 10, 4, 23, 30)); // 2026-11-04T23:30Z
    expect(buildInfo({ GITHUB_SHA: '0123456789abcdef' }, at)).toEqual({ commit: '0123456', date: '2026-11-04' });
  });

  it("says 'local' outside CI", () => {
    expect(buildInfo({}, new Date(Date.UTC(2026, 0, 2))).commit).toBe('local');
  });

  it('pads month and day', () => {
    expect(utcDate(new Date(Date.UTC(2026, 0, 2)))).toBe('2026-01-02');
  });

  it('is a .json file, which the precache globs do not match', () => {
    expect(BUILD_INFO_FILE.endsWith('.json')).toBe(true);
  });
});
```
Create `src/app/buildInfo.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import viteConfigSource from '../../vite.config.ts?raw';
import { FORMAT, copyFor } from '../content/copy';
import { SiteFooter } from '../ui/components/SiteFooter';
import { installFakeStorage } from '../store/testStorage';
import { parseBuildInfo, resetBuildInfoForTest } from './buildInfo';

afterEach(() => {
  resetBuildInfoForTest();
  vi.unstubAllGlobals();
});

describe('runtime build stamp (audit E06)', () => {
  it('accepts exactly the shape build/buildInfo.ts writes', () => {
    expect(parseBuildInfo({ commit: 'a1b2c3d', date: '2026-11-04' })).toEqual({ commit: 'a1b2c3d', date: '2026-11-04' });
    expect(parseBuildInfo({ commit: 'local', date: '2026-11-04' })).not.toBeNull();
    expect(parseBuildInfo({ commit: '<script>', date: '2026-11-04' })).toBeNull();
    expect(parseBuildInfo({ commit: 'a1b2c3d' })).toBeNull();
    expect(parseBuildInfo(null)).toBeNull();
  });

  it('the footer shows version, commit and date from build-info.json', async () => {
    installFakeStorage();
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ commit: 'a1b2c3d', date: '2026-11-04' }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<SiteFooter />);
    const version = FORMAT.footerVersion(__APP_VERSION__, 'a1b2c3d');
    await waitFor(() => {
      expect(screen.getByText(version)).toBeInTheDocument();
    });
    expect(screen.getByText(FORMAT.footerUpdated('2026-11-04'))).toBeInTheDocument();
    // `${BASE_URL}build-info.json`: BASE_URL is '/' under vitest, '/FixThisInjustice/' in the build.
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/build-info\.json$/), { cache: 'no-store' });
  });

  it('omits the two lines when the stamp cannot be read (offline), and invents nothing', async () => {
    installFakeStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    const { container } = render(<SiteFooter />);
    await waitFor(() => {
      expect(screen.getByText(copyFor('limelight', 'footer.licence'))).toBeInTheDocument();
    });
    expect(screen.queryByText(FORMAT.footerVersion(__APP_VERSION__, 'local'))).toBeNull();
    expect(container.querySelectorAll('.site-footer p')).toHaveLength(6); // 8 lines minus the two
  });

  it('keeps the commit and date out of the hashed main chunk', () => {
    expect(viteConfigSource).not.toContain('__BUILD_COMMIT__');
    expect(viteConfigSource).not.toContain('__BUILD_DATE__');
    expect(viteConfigSource).toContain('buildInfoPlugin()');
    // build-info.json must never be precached, or sw.js would change on every commit.
    expect(viteConfigSource).toMatch(/globPatterns: \['\*\*\/\*\.\{js,css,html,ico,png,svg,woff,woff2\}'\]/);
  });
});
```
Note: the `'footer.licence'` row is asserted in `src/app/App.test.tsx` already, so it exists. If `FORMAT.footerVersion`/`footerUpdated` take an optional `overrides` second/third argument (they do, `src/content/copy.ts` `footerVersion`), the default-table call above returns the same string the limelight skin renders unless limelight overrides `footer.version`; if the run shows a mismatch, call them with `LIMELIGHT_COPY` from `../content/copy` as the overrides argument.

Create `build/distFingerprint.test.ts`:
```ts
// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'scripts/dist-fingerprint.sh');
const made: string[] = [];

function site(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'fti-fp-'));
  made.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function fingerprint(dir: string): string {
  return execFileSync('bash', [SCRIPT, dir], { encoding: 'utf8' }).trim();
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('scripts/dist-fingerprint.sh (audit E06)', () => {
  const base = { 'index.html': '<html>', 'assets/index-a.js': 'code', 'sw.js': 'sw' };

  it('prints one SHA-256', () => {
    expect(fingerprint(site(base))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores the per-build stamp and its own output file', () => {
    const a = site({ ...base, 'build-info.json': '{"commit":"aaaaaaa"}' });
    const b = site({ ...base, 'build-info.json': '{"commit":"bbbbbbb"}', 'content-sha256.txt': 'x' });
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('changes when any shipped byte or path changes', () => {
    const a = fingerprint(site(base));
    expect(fingerprint(site({ ...base, 'assets/index-a.js': 'code2' }))).not.toBe(a);
    expect(fingerprint(site({ 'index.html': '<html>', 'assets/index-b.js': 'code', 'sw.js': 'sw' }))).not.toBe(a);
    expect(fingerprint(site({ ...base, 'media/clip.mp4': 'video' }))).not.toBe(a);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=1 build/buildInfo.test.ts build/distFingerprint.test.ts src/app/buildInfo.test.tsx`
Expected: FAIL (modules and script missing).

- [ ] **Step 3: Implement the build side**

Create `build/buildInfo.ts`:
```ts
// build/buildInfo.ts
//
// Audit E06: the build stamp (commit, date) lives in its own file, dist/build-info.json, never in
// a hashed chunk. The precache globs (vite.config.ts injectManifest.globPatterns) do not match
// .json, so the file is not in sw.js's manifest: a rebuild that changes only the stamp leaves
// every precached byte, and therefore sw.js, unchanged, and installed apps see no update.
import type { Plugin } from 'vite';

/** The published path, relative to the site base. src/app/buildInfo.ts reads it. */
export const BUILD_INFO_FILE = 'build-info.json';

export interface BuildInfo {
  /** First 7 characters of GITHUB_SHA, or 'local' outside CI. */
  commit: string;
  /** The build's calendar date in UTC, YYYY-MM-DD. */
  date: string;
}

/**
 * YYYY-MM-DD in UTC, computed by hand: eslint bans toISOString() outside src/domain/dates.ts
 * (it shifts civil dates); a build has no civil zone, so the hand form is byte-identical.
 */
export function utcDate(at: Date): string {
  return [
    at.getUTCFullYear(),
    String(at.getUTCMonth() + 1).padStart(2, '0'),
    String(at.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function buildInfo(env: Readonly<Record<string, string | undefined>>, at: Date): BuildInfo {
  return { commit: env.GITHUB_SHA?.slice(0, 7) ?? 'local', date: utcDate(at) };
}

/** Emits dist/build-info.json on `vite build` only; the dev server has no file (footer omits the lines). */
export function buildInfoPlugin(): Plugin {
  return {
    name: 'fti-build-info',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: BUILD_INFO_FILE,
        source: `${JSON.stringify(buildInfo(process.env, new Date()))}\n`,
      });
    },
  };
}
```
In `vite.config.ts`: after `import { cspPlugin } from './build/cspPlugin.ts';` add `import { buildInfoPlugin } from './build/buildInfo.ts';`. Delete the whole comment block beginning `/*\n * The build date, as YYYY-MM-DD in UTC.` through `].join('-');` (the `buildDate` and `BUILD_DATE_ISO` constants). In `define`, delete the two lines
```ts
    __BUILD_COMMIT__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'),
    __BUILD_DATE__: JSON.stringify(BUILD_DATE_ISO),
```
and replace the comment above `define:` (`// The three constants src/ui/components/SiteFooter.tsx reads ...` three lines) with:
```ts
  // The package version SiteFooter reads (declared in src/config/build.d.ts). The commit and the
  // build date are NOT compiled in (audit E06): they change on every commit and would rehash the
  // main chunk; build/buildInfo.ts writes them to dist/build-info.json instead.
```
In `plugins`, after `cspPlugin(),` add `buildInfoPlugin(),`.

In `vitest.config.ts`: delete the `/*\n * The build date, as YYYY-MM-DD in UTC.` block through `].join('-');`, and the two define lines `__BUILD_COMMIT__: ...` and `__BUILD_DATE__: ...`. In its comment `the bare identifiers\n   * \`__APP_VERSION__\`, \`__BUILD_COMMIT__\` and \`__BUILD_DATE__\` src/ui/components/SiteFooter.tsx` replace the three names with `` `__APP_VERSION__` `` and "are" with "is" where it reads "are undeclared globals" (keep the rest).

In `src/config/build.d.ts` delete the two declarations and their doc comments:
```ts
/** The first 7 characters of `GITHUB_SHA` at build time, or 'local' outside CI. */
declare const __BUILD_COMMIT__: string;

/** The ISO calendar date (YYYY-MM-DD) the build ran, in UTC. */
declare const __BUILD_DATE__: string;
```
and in its header comment replace "the three build-time constants" with "the build-time constant" and add the line `// The commit and build date moved to dist/build-info.json (audit E06, build/buildInfo.ts).`

In `tsconfig.node.json` `include`, after `"build/cspPlugin.ts", ` insert `"build/buildInfo.ts", "build/buildInfo.test.ts", "build/distFingerprint.test.ts", `.

Create `scripts/dist-fingerprint.sh` (then `chmod +x scripts/dist-fingerprint.sh`):
```bash
#!/usr/bin/env bash
# scripts/dist-fingerprint.sh DIR
#
# Audit E06: one SHA-256 over every published file in DIR except the per-build stamp
# (build-info.json) and this fingerprint's own file (content-sha256.txt). Two builds that ship
# the same bytes get the same fingerprint, so deploy.yml skips a publish that would change
# nothing a user downloads (a docs-only commit). Paths are hashed with their contents, so a
# renamed file changes it too. LC_ALL=C fixes the sort order across runners.
set -euo pipefail
dir="${1:?usage: dist-fingerprint.sh DIR}"
cd "$dir"
find . -type f ! -name build-info.json ! -name content-sha256.txt -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 sha256sum \
  | sha256sum \
  | cut -d' ' -f1
```

- [ ] **Step 4: Implement the runtime side**

Create `src/app/buildInfo.ts`:
```ts
// src/app/buildInfo.ts
//
// Audit E06: the commit and build date are read at runtime from dist/build-info.json
// (build/buildInfo.ts), not compiled into the hashed main chunk, so a commit that changes no
// code ships no new bundle and no update banner. The file is not precached: offline, or on the
// dev server, the read fails and the footer omits the two lines (never a made-up value).
import { useEffect, useState } from 'react';

export interface RuntimeBuildInfo {
  commit: string;
  date: string;
}

const COMMIT_RE = /^[0-9a-f]{7}$|^local$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts only the exact shape build/buildInfo.ts writes; anything else is "unknown" (null). */
export function parseBuildInfo(raw: unknown): RuntimeBuildInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const commit: unknown = Reflect.get(raw, 'commit');
  const date: unknown = Reflect.get(raw, 'date');
  if (typeof commit !== 'string' || !COMMIT_RE.test(commit)) return null;
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null;
  return { commit, date };
}

let cached: Promise<RuntimeBuildInfo | null> | null = null;

/** One request per page life. `no-store`: the stamp must describe the build actually deployed. */
export function loadBuildInfo(): Promise<RuntimeBuildInfo | null> {
  cached ??= fetch(`${import.meta.env.BASE_URL}build-info.json`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((raw: unknown) => parseBuildInfo(raw))
    .catch(() => null);
  return cached;
}

/** Test seam: forget the cached read. */
export function resetBuildInfoForTest(): void {
  cached = null;
}

export function useBuildInfo(): RuntimeBuildInfo | null {
  const [info, setInfo] = useState<RuntimeBuildInfo | null>(null);
  useEffect(() => {
    let live = true;
    void loadBuildInfo().then((value) => {
      if (live) setInfo(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return info;
}
```
In `src/ui/components/SiteFooter.tsx`:
- after `import { useHydrated } from '../../store/selectors';` add `import { useBuildInfo } from '../../app/buildInfo';`
- after `const hydrated = useHydrated();` add `const build = useBuildInfo();`
- replace
```tsx
      <p>{FORMAT.footerVersion(__APP_VERSION__, __BUILD_COMMIT__, overrides)}</p>
      <p>{FORMAT.footerUpdated(__BUILD_DATE__, overrides)}</p>
```
with
```tsx
      {/* Audit E06: read from dist/build-info.json; absent offline and in dev, never invented. */}
      {build !== null && <p>{FORMAT.footerVersion(__APP_VERSION__, build.commit, overrides)}</p>}
      {build !== null && <p>{FORMAT.footerUpdated(build.date, overrides)}</p>}
```
- in the header comment replace "each is compiled in by vite.config.ts's `define` block (declared in src/config/build.d.ts)\n// rather than read at runtime, so the footer needs no fetch to know its own version." with "the version is compiled in (`define`, src/config/build.d.ts); the commit and date are read once\n// from dist/build-info.json (src/app/buildInfo.ts, audit E06)."

In `src/content/copy.ts` (comments only, no string changes): in the footer comment replace "are read in src/ui/components/SiteFooter.tsx from `__APP_VERSION__`, `__BUILD_COMMIT__` and\n  // `__BUILD_DATE__` (src/config/build.d.ts)" with "are read in src/ui/components/SiteFooter.tsx from `__APP_VERSION__` and\n  // dist/build-info.json (src/app/buildInfo.ts)"; in the `footerVersion` doc replace "the two build-time constants\n   * vite.config.ts's `define` block injects (`__APP_VERSION__`, `__BUILD_COMMIT__`)" with "`__APP_VERSION__` and the commit\n   * from dist/build-info.json"; in `footerUpdated`'s doc replace "`date` is `__BUILD_DATE__`" with "`date` is build-info.json's `date`".

- [ ] **Step 5: Run**

Run: `npx vitest run --maxWorkers=1 build src/app src/ui/components/SiteFooter.test.tsx src/content`
Expected: PASS (`buildInfo.test.ts` 4, `distFingerprint.test.ts` 3, `buildInfo.test.tsx` 4).
Run: `npx tsc -b --force && npx eslint ./src ./scripts ./build && npm run build && bash scripts/check-dist-csp.sh`
Expected: clean; `dist/build-info.json` exists; `grep -c build-info dist/sw.js` prints `0`.
Determinism check (the E06 claim, about 2 min, one build at a time):
```bash
GITHUB_SHA=aaaaaaaaaaaa npx vite build --outDir /tmp/fti-a >/dev/null && GITHUB_SHA=bbbbbbbbbbbb npx vite build --outDir /tmp/fti-b >/dev/null
diff -rq /tmp/fti-a /tmp/fti-b; bash scripts/dist-fingerprint.sh /tmp/fti-a; bash scripts/dist-fingerprint.sh /tmp/fti-b; rm -rf /tmp/fti-a /tmp/fti-b
```
Expected: `diff` lists only `build-info.json`; the two fingerprints are equal.

- [ ] **Step 6: E2E (the runner runs it)**

Append to `e2e/p4b-platform.spec.ts`:
```ts

test('E06: the build stamp is its own file and the service worker does not precache it', async ({ page }) => {
  const info = await page.request.get('build-info.json');
  expect(info.ok()).toBe(true);
  expect(await info.json()).toMatchObject({ commit: expect.stringMatching(/^([0-9a-f]{7}|local)$/) as unknown });
  const sw = await page.request.get('sw.js');
  expect(await sw.text()).not.toContain('build-info.json');
});
```
Runner: `npm run e2e -- e2e/p4b-platform.spec.ts` -> `4 passed`.

- [ ] **Step 7: Commit**

```bash
git add -- build/buildInfo.ts build/buildInfo.test.ts build/distFingerprint.test.ts scripts/dist-fingerprint.sh src/app/buildInfo.ts src/app/buildInfo.test.tsx src/ui/components/SiteFooter.tsx vite.config.ts vitest.config.ts src/config/build.d.ts tsconfig.node.json src/content/copy.ts e2e/p4b-platform.spec.ts
git commit -m "fix(build): build stamp in a non-precached build-info.json, content fingerprint script (E06)"
```

---

### Task 3: Deploy publishes only CI's tested dist, of a push, while HEAD, when bytes change (E06, E07, E08, E15)

**Files:**
- Modify: `.github/workflows/ci.yml` (append two steps to job `verify`), `docs/runbooks/deploy.md`, `tsconfig.node.json` (`include`)
- Rewrite: `.github/workflows/deploy.yml`
- Create: `build/workflows.test.ts`

**Interfaces:**
- Consumes: `scripts/dist-fingerprint.sh` (Task 2), `dist/build-info.json` (Task 2).
- Produces: CI artifact named `dist` on push runs, containing `content-sha256.txt`.

GitHub facts this task rests on (planner read; RUNNER: re-open both pages before the first push and confirm each, the implementer has no network):
- `workflow_run` supports only `branches` / `branches-ignore` filters ("You can use the `branches` or `branches-ignore` filter to specify what branches the triggering workflow must run on"); no `paths` filter. https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows (read 2026-11-04). Hence the content-based skip instead of `paths-ignore`.
- A workflow run object carries `event` (e.g. `"push"`), `head_branch`, `head_sha`, `conclusion`, `id` and `head_repository.full_name`. https://docs.github.com/en/rest/actions/workflow-runs example response (read 2026-11-04, via r.jina.ai). `github.event.workflow_run` in a `workflow_run`-triggered workflow is that object [U: assumed from the webhook payload page, whose properties are collapsed].
- `actions/download-artifact@v8` (v8.0.2, 2026-10-07) takes `name`, `path`, `run-id`, `github-token` and downloads from another run when `github-token` is given; `actions/upload-artifact@v7` (v7.0.2) takes `name`, `path`, `retention-days`, `if-no-files-found`. Read from each `action.yml` at those tags with `gh api`, 2026-11-04. Cross-run download needs `actions: read`.

Design: (1) job `if` requires `event == 'push'` and `head_repository.full_name == github.repository` (E08: `branches: [main]` matches a fork PR's branch NAME). (2) First step compares `head_sha` with `git ls-remote <repo> refs/heads/main` (public repo, no checkout); a re-run (`run_attempt > 1`) is a deliberate rollback/redeploy and skips this check (E07; keeps the runbook's "re-run the last good deploy" rollback). (3) Downloads CI's `dist` (E15: ships the bytes the gates saw; no second build). (4) Skips when CI's fingerprint equals the live `content-sha256.txt` (E06: docs-only commits publish nothing). (5) After `deploy-pages`, polls the live `build-info.json` until it names the commit (E15: a green run is not proof). (6) `build/workflows.test.ts` runs in `npm test` in CI and fails if the `deploy` job or any guard disappears (E15: the job was once lost). Rejected: `cancel-in-progress: true` alone (cancels a newer run's deploy midway and still lets an older run finish last); `paths-ignore` on CI's `push` (would also skip the privacy gate on docs commits in a public repo).

- [ ] **Step 1: Write the failing test**

Create `build/workflows.test.ts`:
```ts
// @vitest-environment node
//
// Audit E15: nothing asserted that deploy.yml keeps its deploy job (it was once lost to a bad
// edit, AGENTS.md Deploy), and E06/E07/E08 guards are one line each. This runs in `npm test`, so
// CI fails the moment one is removed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string): string => readFileSync(join(process.cwd(), '.github/workflows', name), 'utf8');
const deploy = read('deploy.yml');
const ci = read('ci.yml');

describe('deploy.yml', () => {
  it('has a build job and a deploy job that needs it and runs deploy-pages', () => {
    expect(deploy).toMatch(/^ {2}build:$/m);
    expect(deploy).toMatch(/^ {2}deploy:$/m);
    expect(deploy).toMatch(/^ {4}needs: build$/m);
    expect(deploy).toContain('uses: actions/deploy-pages@v5');
    expect(deploy).toContain("if: needs.build.outputs.publish == 'true'");
  });

  it('publishes only a successful push run of this repository (E08)', () => {
    expect(deploy).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(deploy).toContain("github.event.workflow_run.event == 'push'");
    expect(deploy).toContain('github.event.workflow_run.head_repository.full_name == github.repository');
  });

  it("publishes only main's HEAD, except on a deliberate re-run (E07)", () => {
    expect(deploy).toContain('git ls-remote "$REPO_URL" refs/heads/main');
    expect(deploy).toContain('RUN_ATTEMPT: ${{ github.run_attempt }}');
  });

  it("ships CI's tested dist, never a second build (E15)", () => {
    expect(deploy).toContain('uses: actions/download-artifact@v8');
    expect(deploy).toContain('run-id: ${{ github.event.workflow_run.id }}');
    expect(deploy).not.toContain('npm run build');
    expect(deploy).not.toContain('npm ci');
  });

  it('skips a publish that changes no shipped byte (E06), and checks the live site after (E15)', () => {
    expect(deploy).toContain('content-sha256.txt');
    expect(deploy).toContain('build-info.json');
  });
});

describe('ci.yml', () => {
  it('fingerprints and uploads the tested dist on push only', () => {
    expect(ci).toContain('bash scripts/dist-fingerprint.sh dist > dist/content-sha256.txt');
    expect(ci).toContain('uses: actions/upload-artifact@v7');
    expect(ci).toMatch(/name: dist\n/);
    expect(ci.match(/if: github\.event_name == 'push'/g)?.length).toBe(2);
  });
});
```
In `tsconfig.node.json` `include`, after `"build/distFingerprint.test.ts", ` insert `"build/workflows.test.ts", `.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=1 build/workflows.test.ts`
Expected: FAIL (guards and upload absent).

- [ ] **Step 3: CI uploads the tested dist**

In `.github/workflows/ci.yml`, job `verify`, after the step
```yaml
      - name: No private identifiers in the tracked tree
        env:
          PRIVACY_PATTERN: ${{ secrets.PRIVACY_PATTERN }}
        run: bash scripts/check-private.sh
```
append (same indentation):
```yaml

      # Audit E06/E15: deploy.yml publishes exactly these bytes, after every gate above passed on
      # them. Push events only: a pull request's build is never published. The fingerprint lets
      # Deploy skip a publish that changes nothing a user downloads (a docs-only commit).
      - name: Fingerprint the published bytes
        if: github.event_name == 'push'
        run: bash scripts/dist-fingerprint.sh dist > dist/content-sha256.txt

      - name: Upload dist for Deploy
        if: github.event_name == 'push'
        uses: actions/upload-artifact@v7
        with:
          name: dist
          path: dist
          # [d] Matches the 30-day re-run window the rollback runbook relies on.
          retention-days: 30
          if-no-files-found: error
```

- [ ] **Step 4: Rewrite deploy.yml**

Replace the whole of `.github/workflows/deploy.yml` with:
```yaml
# Publishes the dist/ that CI built and tested, only for a push to main of this repository, only
# while that commit is still main's HEAD (or on a deliberate re-run), and only when the published
# bytes would change. Audit E06, E07, E08, E15. workflow_run accepts only `branches` filters (no
# `paths`), so the docs-only skip is decided by content: scripts/dist-fingerprint.sh in ci.yml.
# build/workflows.test.ts fails CI if a job or guard below is removed.
name: Deploy to GitHub Pages

on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write
  # Reads the dist artifact CI uploaded in the triggering run.
  actions: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    # E08: `branches: [main]` matches the triggering run's head branch NAME, which a fork's pull
    # request can also carry. Only a push to this repository may publish.
    if: >-
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.event == 'push' &&
      github.event.workflow_run.head_repository.full_name == github.repository
    runs-on: ubuntu-latest
    outputs:
      publish: ${{ steps.decide.outputs.publish }}
    steps:
      # E07: runs complete in any order; an older commit's run finishing after a newer push must
      # not publish over it. A re-run (attempt > 1) is a deliberate rollback or redeploy
      # (docs/runbooks/deploy.md) and skips this check.
      - name: Still main's HEAD?
        id: head
        env:
          HEAD_SHA: ${{ github.event.workflow_run.head_sha }}
          REPO_URL: ${{ github.server_url }}/${{ github.repository }}.git
          RUN_ATTEMPT: ${{ github.run_attempt }}
        run: |
          set -euo pipefail
          current=$(git ls-remote "$REPO_URL" refs/heads/main | cut -f1)
          echo "main is $current, this run built $HEAD_SHA, attempt $RUN_ATTEMPT"
          if [ "$current" = "$HEAD_SHA" ] || [ "$RUN_ATTEMPT" != "1" ]; then
            echo "head=true" >> "$GITHUB_OUTPUT"
          else
            echo "head=false" >> "$GITHUB_OUTPUT"
          fi

      # E15: ship the bytes CI built, linted, tested and checked, never a second build.
      - name: Download CI's dist
        if: steps.head.outputs.head == 'true'
        uses: actions/download-artifact@v8
        with:
          name: dist
          path: dist
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ github.token }}

      # E06: a commit that changes nothing users download (docs only) publishes nothing, so
      # installed apps see no update. The live fingerprint is fetched with a unique query so the
      # Pages CDN (max-age=600) cannot answer from cache; no file (first run) means publish.
      - name: Would this change the site?
        id: decide
        env:
          HEAD_OK: ${{ steps.head.outputs.head }}
          SITE: https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}
          RUN_ID: ${{ github.run_id }}
        run: |
          set -euo pipefail
          if [ "$HEAD_OK" != "true" ]; then echo "publish=false" >> "$GITHUB_OUTPUT"; exit 0; fi
          test -f dist/index.html  # the artifact unpacked at the site root
          built=$(cat dist/content-sha256.txt)  # written by ci.yml (scripts/dist-fingerprint.sh)
          live=$(curl -fsS "$SITE/content-sha256.txt?run=$RUN_ID" || true)
          echo "built $built, live ${live:-none}"
          if [ "$built" = "$live" ]; then echo "publish=false" >> "$GITHUB_OUTPUT"; else echo "publish=true" >> "$GITHUB_OUTPUT"; fi

      - uses: actions/upload-pages-artifact@v5
        if: steps.decide.outputs.publish == 'true'
        with:
          path: dist

  deploy:
    needs: build
    if: needs.build.outputs.publish == 'true'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5

      # E15: a green workflow is not proof (AGENTS.md Deploy). The live stamp must name this
      # commit. [s] 21 attempts x 30 s = 630 s covers the CDN's 600 s max-age.
      - name: The live site serves this commit
        env:
          PAGE_URL: ${{ steps.deployment.outputs.page_url }}
          HEAD_SHA: ${{ github.event.workflow_run.head_sha }}
          RUN_ID: ${{ github.run_id }}
        run: |
          set -euo pipefail
          want="${HEAD_SHA:0:7}"
          for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21; do
            got=$(curl -fsS "${PAGE_URL%/}/build-info.json?run=$RUN_ID-$attempt" | sed -E 's/.*"commit":"([^"]+)".*/\1/' || true)
            echo "attempt $attempt: live commit ${got:-none}, want $want"
            if [ "$got" = "$want" ]; then exit 0; fi
            sleep 30
          done
          echo "FAIL: the live build-info.json never named $want"
          exit 1
```
Validate the YAML locally: `python3 -c "import yaml; [yaml.safe_load(open(f)) for f in ('.github/workflows/ci.yml', '.github/workflows/deploy.yml')]; print('ok')"` -> `ok`.

- [ ] **Step 5: Runbook**

Replace the `## Deploy` and `## Roll back` sections of `docs/runbooks/deploy.md` with:
```markdown
## Deploy
- Push `main`. `.github/workflows/ci.yml` runs every gate, fingerprints `dist/` (`scripts/dist-fingerprint.sh`) and uploads it as artifact `dist` (push only). On success `.github/workflows/deploy.yml` (workflow_run) publishes THAT artifact, never a rebuild, if: the CI run was a `push` of this repository (not a fork PR), its commit is still `main`'s HEAD (an older run finishing late skips), and the fingerprint differs from the live `content-sha256.txt` (docs-only commits publish nothing and installed apps see no update).
- After publishing, the deploy job polls the live `build-info.json` until it names the commit (up to 630 s; the Pages CDN caches for 600 s). `build/workflows.test.ts` fails CI if the deploy job or a guard is removed.
- Pages source must be "GitHub Actions" (set once, already done).
- Repo variables used at build (CI): reminder Worker URL and VAPID public key (see `docs/runbooks/reminders.md`); unset = reminders show "not set up on this deployment".
- Verify the live bundle, not the workflow status:
  ```
  U=https://vkotzamanis.github.io/FixThisInjustice
  curl -s "$U/build-info.json?x=$RANDOM"                         # commit of the live build
  JS=$(curl -s $U/ | grep -oE 'assets/index-[^"]+\.js' | head -1)
  curl -s "$U/$JS" | grep -c 'a string only your change adds'   # must be >= 1
  ```

## Roll back
- Site: Actions -> "Deploy to GitHub Pages" -> last good run -> Re-run all jobs. A re-run (attempt > 1) skips the HEAD check on purpose; it needs that CI run's `dist` artifact (kept 30 days). Older: `git revert` and push.
- Worker: `npx wrangler rollback` in `worker/` (`docs/runbooks/reminders.md`).
- Data: lives in each user's browser; a deploy never touches it. Schema changes must keep old documents loading (AGENTS rule 7).
```
Append to `## Known risk`:
```markdown
- Offline, `/FixThisInjustice` (no trailing slash) does not open: it is outside the service worker's scope `/FixThisInjustice/` (audit E15, reproduced in Chromium). Online, Pages redirects it to the slash form; the installed app's start_url has the slash. Not fixable here: a wider scope needs a `Service-Worker-Allowed` header, which Pages cannot set.
```

- [ ] **Step 6: Run**

Run: `npx vitest run --maxWorkers=1 build`
Expected: PASS (`workflows.test.ts` 6 tests).
Run: `npx tsc -b --force && npx eslint ./src ./scripts ./build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add -- .github/workflows/ci.yml .github/workflows/deploy.yml build/workflows.test.ts tsconfig.node.json docs/runbooks/deploy.md
git commit -m "ci(deploy): publish CI's tested dist, push-of-this-repo only, HEAD only, skip unchanged bytes, live check (E06, E07, E08, E15)"
```
Runner after the owner's push: confirm in the Deploy run that `Still main's HEAD?` printed matching SHAs, `Would this change the site?` printed `live none` (first run) and the live-check step passed; then push a docs-only commit and confirm the Deploy run ends with `publish=false` and no `deploy` job run.

---

### Task 4: The update model: poll, apply at a safe moment, banner only mid-session (R7, E01)

**Files:**
- Create: `src/app/updatePolicy.ts`, `src/app/updatePolicy.test.ts`, `src/app/updateController.ts`, `src/app/updateController.test.ts`, `e2e/r7-update.spec.ts`
- Modify: `src/main.tsx` (imports; replace the registration block), `docs/ARCHITECTURE.md` (one row)

**Interfaces:**
- Consumes: `registerSW` from `virtual:pwa-register` (vite-plugin-pwa 1.3.0: options `immediate`, `onNeedRefresh`, `onNeedReload`, `onRegisteredSW(swUrl, registration)`; returns `(reloadPage?: boolean) => Promise<void>` that posts SKIP_WAITING; `node_modules/vite-plugin-pwa/dist/client/build/register.js`); `notifyUpdateReady(apply: () => void)` from `src/app/UpdatePrompt.tsx`; `openAssignment(state, profileId)` from `src/domain/schedule/staleSessions.ts` (P1); `flushSave()` and `useAppStore` from `src/store`.
- Produces: `decideUpdate(facts: UpdateFacts): 'apply' | 'prompt' | 'defer'`, `UPDATE_POLL_INTERVAL_MS = 1_800_000`; `startUpdateController(deps: UpdateControllerDeps): { lastDecision(): UpdateDecision | null; stop(): void }`.

Facts the design rests on: the plugin, in prompt mode, attaches a `controlling` listener when a worker is waiting and calls `onNeedReload` (or `window.location.reload()` when absent) when the new worker takes control; with two windows open, applying in one reloaded both (audit E01, reproduced). A worker found waiting at registration is reported again on every launch (audit E01: "banner again"). `registration.update()` was never called (E01).

Ruling (spec R7, with the case R7 leaves open): a waiting worker is APPLIED when no session is open and the page is hidden, or visible but not touched since it last became visible (cold launch, or resume before the first tap); PROMPTED (banner) while a session is open; DEFERRED (applied at the next hidden or untouched-visible moment) when no session is open but the user is using the page. A window that did not apply but finds the new worker controlling it reloads under the same rule, so another window's update never reloads a live session. Rejected: `registerType: 'autoUpdate'` (reloads mid-workout, R7); banner whenever the user is active (R7: "banner only mid-session"); reload on every visible with no session (a reload under a tap in progress).

- [ ] **Step 1: Write the failing tests**

Create `src/app/updatePolicy.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { UPDATE_POLL_INTERVAL_MS, decideUpdate } from './updatePolicy';

describe('decideUpdate (spec R7)', () => {
  it.each([
    // sessionOpen, hidden, interacted -> decision
    [true, false, false, 'prompt'],
    [true, false, true, 'prompt'],
    [true, true, false, 'prompt'],
    [true, true, true, 'prompt'],
    [false, false, false, 'apply'], // cold launch / fresh resume, nothing touched yet
    [false, true, true, 'apply'], // the user left the app
    [false, true, false, 'apply'],
    [false, false, true, 'defer'], // in use, no session: wait for a safe moment
  ] as const)('session %s, hidden %s, interacted %s -> %s', (sessionOpen, hidden, interacted, want) => {
    expect(decideUpdate({ sessionOpen, hidden, interacted })).toBe(want);
  });

  it('polls every 30 min', () => {
    expect(UPDATE_POLL_INTERVAL_MS).toBe(1_800_000); // [ms]
  });
});
```
Create `src/app/updateController.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startUpdateController, type RegisterOptions, type UpdateControllerDeps } from './updateController';
import { UPDATE_POLL_INTERVAL_MS } from './updatePolicy';

/** A page whose visibility the test sets, and whose events the test dispatches. */
function harness(initial: { sessionOpen?: boolean; ready?: boolean } = {}) {
  const doc = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  doc.visibilityState = 'visible';
  let sessionOpen = initial.sessionOpen ?? false;
  let ready = initial.ready ?? true;
  const storeListeners = new Set<() => void>();
  let options: RegisterOptions | null = null;
  const applyUpdate = vi.fn<(reloadPage?: boolean) => Promise<void>>(() => Promise.resolve());
  const update = vi.fn(() => Promise.resolve());
  const deps = {
    register: (o: RegisterOptions) => {
      options = o;
      return applyUpdate;
    },
    ready: () => ready,
    isSessionOpen: () => sessionOpen,
    flush: vi.fn(),
    reload: vi.fn(),
    showBanner: vi.fn<(onReload: () => void) => void>(),
    subscribeStore: (l: () => void) => {
      storeListeners.add(l);
      return () => storeListeners.delete(l);
    },
    doc,
    win: window,
  } satisfies UpdateControllerDeps;
  const controller = startUpdateController(deps);
  const opts = (): RegisterOptions => {
    if (options === null) throw new Error('register was not called');
    return options;
  };
  return {
    deps,
    controller,
    applyUpdate,
    update,
    registered: () => {
      opts().onRegisteredSW('sw.js', { update } as unknown as ServiceWorkerRegistration);
    },
    waiting: () => {
      opts().onNeedRefresh();
    },
    newWorkerTookControl: () => {
      opts().onNeedReload();
    },
    setVisibility: (v: DocumentVisibilityState) => {
      doc.visibilityState = v;
      doc.dispatchEvent(new Event('visibilitychange'));
    },
    tap: () => {
      window.dispatchEvent(new Event('pointerdown'));
    },
    setSession: (open: boolean) => {
      sessionOpen = open;
      for (const l of storeListeners) l();
    },
    setReady: (r: boolean) => {
      ready = r;
      for (const l of storeListeners) l();
    },
  };
}

let h: ReturnType<typeof harness> | null = null;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  h?.controller.stop();
  h = null;
  vi.useRealTimers();
});

describe('update checks (audit E01)', () => {
  it('checks for a new worker every time the page becomes visible', () => {
    h = harness();
    h.registered();
    h.setVisibility('hidden');
    h.setVisibility('visible');
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it('checks every 30 min while visible, and not while hidden', () => {
    h = harness();
    h.registered();
    vi.advanceTimersByTime(UPDATE_POLL_INTERVAL_MS);
    expect(h.update).toHaveBeenCalledTimes(1);
    h.setVisibility('hidden');
    vi.advanceTimersByTime(UPDATE_POLL_INTERVAL_MS);
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it('survives a rejected check (offline)', () => {
    h = harness();
    h.update.mockRejectedValueOnce(new Error('offline'));
    h.registered();
    expect(() => {
      vi.advanceTimersByTime(UPDATE_POLL_INTERVAL_MS);
    }).not.toThrow();
  });
});

describe('a waiting worker (spec R7)', () => {
  it('applies at a cold launch with no session open: flushes, then activates, no banner', () => {
    h = harness();
    h.waiting();
    expect(h.deps.flush).toHaveBeenCalledTimes(1);
    expect(h.applyUpdate).toHaveBeenCalledWith(true);
    expect(h.deps.showBanner).not.toHaveBeenCalled();
  });

  it('decides nothing before the document is read, then applies once it is', () => {
    h = harness({ ready: false });
    h.waiting();
    expect(h.applyUpdate).not.toHaveBeenCalled();
    h.setReady(true);
    expect(h.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('shows the banner, never applies, while a session is open', () => {
    h = harness({ sessionOpen: true });
    h.waiting();
    h.setVisibility('hidden');
    expect(h.applyUpdate).not.toHaveBeenCalled();
    expect(h.deps.showBanner).toHaveBeenCalled();
  });

  it('applies from the banner only when the user taps it', () => {
    h = harness({ sessionOpen: true });
    h.waiting();
    const onReload = h.deps.showBanner.mock.calls[0]?.[0];
    expect(h.applyUpdate).not.toHaveBeenCalled();
    onReload?.();
    expect(h.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('waits while the user is using the app, then applies when the page goes hidden', () => {
    h = harness();
    h.tap();
    h.waiting();
    expect(h.controller.lastDecision()).toBe('defer');
    expect(h.applyUpdate).not.toHaveBeenCalled();
    h.setVisibility('hidden');
    expect(h.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('applies on a resume before the first tap', () => {
    h = harness();
    h.tap();
    h.waiting();
    h.setSession(true);
    h.setVisibility('hidden'); // session open: still nothing
    expect(h.applyUpdate).not.toHaveBeenCalled();
    h.setSession(false);
    h.setVisibility('visible');
    expect(h.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('applies once the session closes while the page is hidden', () => {
    h = harness({ sessionOpen: true });
    h.waiting();
    h.setVisibility('hidden');
    h.setSession(false);
    expect(h.applyUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('another window applied the update (audit E01: both windows reloaded)', () => {
  it('reloads this window at once when it has no session open', () => {
    h = harness();
    h.newWorkerTookControl();
    expect(h.deps.flush).toHaveBeenCalled();
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads a window with a session open; banner, then reload on the tap', () => {
    h = harness({ sessionOpen: true });
    h.newWorkerTookControl();
    expect(h.deps.reload).not.toHaveBeenCalled();
    const onReload = h.deps.showBanner.mock.calls[0]?.[0];
    onReload?.();
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads it later, when the session has closed and the page is hidden', () => {
    h = harness({ sessionOpen: true });
    h.tap();
    h.newWorkerTookControl();
    h.setSession(false); // Finish tapped: the user is still on the page
    expect(h.deps.reload).not.toHaveBeenCalled();
    h.setVisibility('hidden');
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=1 src/app/updatePolicy.test.ts src/app/updateController.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the policy and the controller**

Create `src/app/updatePolicy.ts`:
```ts
// src/app/updatePolicy.ts
//
// Spec R7 (audit E01): what to do with a new build the service worker has installed and is
// holding in `waiting`. Pure; src/app/updateController.ts feeds it the page's facts.
//
//   apply  activate it now (the page reloads onto the new build): nothing is lost and nobody
//          is looking, i.e. no session is open AND either the page is hidden or the user has not
//          touched it since it last became visible (a cold launch, or a resume from the app
//          switcher before the first tap).
//   prompt show the banner: a session is open. The user decides; a live session is never
//          reloaded under them (rejected: autoUpdate, which reloads mid-workout).
//   defer  no session, but the user is using the page: wait for the next hidden or fresh-visible
//          moment rather than reload under a tap.
export type UpdateDecision = 'apply' | 'prompt' | 'defer';

export interface UpdateFacts {
  /** Any profile has an in-progress session (spec R1 open assignment). */
  sessionOpen: boolean;
  /** document.visibilityState === 'hidden'. */
  hidden: boolean;
  /** A pointerdown or keydown reached the page since it last became visible (or loaded). */
  interacted: boolean;
}

export function decideUpdate(facts: UpdateFacts): UpdateDecision {
  if (facts.sessionOpen) return 'prompt';
  if (facts.hidden || !facts.interacted) return 'apply';
  return 'defer';
}

/** [ms] Spec R7: the interval between update checks while the page stays open. 30 min. */
export const UPDATE_POLL_INTERVAL_MS = 30 * 60 * 1000;
```
Create `src/app/updateController.ts`:
```ts
// src/app/updateController.ts
//
// Spec R7 (audit E01): the app's whole update model, in one place.
//
//  - CHECKS. The browser looks for a new sw.js only on a navigation, and an installed iPhone app
//    resumed from the app switcher never navigates, so a deploy did not reach it (E01). Here
//    `registration.update()` runs every time the page becomes visible and every
//    UPDATE_POLL_INTERVAL_MS while it stays visible. Pages serves sw.js with max-age=600 behind
//    its CDN, so a check can still see the previous deploy for up to 10 min (audit E01, [U]).
//  - APPLY. A waiting worker is applied by updatePolicy.decideUpdate: at a cold launch or a
//    resume before the first tap, or when the page goes hidden, and only with no session open.
//    Applying flushes the pending document write first (the reload must not drop it).
//  - BANNER. Only while a session is open (UpdatePrompt); its Reload is the user's choice.
//  - ANOTHER WINDOW APPLIED IT. vite-plugin-pwa reloads every window when the new worker takes
//    control. `onNeedReload` intercepts that: a window with a session open shows the banner and
//    reloads only on the tap (or when it is next hidden or untouched with the session closed).
//
// Every browser API arrives through `deps`, so updateController.test.ts drives it in jsdom.
import { decideUpdate, UPDATE_POLL_INTERVAL_MS, type UpdateDecision } from './updatePolicy';

/** The subset of vite-plugin-pwa's RegisterSWOptions this controller passes. */
export interface RegisterOptions {
  immediate: boolean;
  onNeedRefresh: () => void;
  onNeedReload: () => void;
  onRegisteredSW: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
}

export interface UpdateControllerDeps {
  /** `registerSW` from 'virtual:pwa-register'. Returns the apply function (posts SKIP_WAITING). */
  register: (options: RegisterOptions) => (reloadPage?: boolean) => Promise<void>;
  /** The stored document has been read (status.hydrated). Nothing is decided before it. */
  ready: () => boolean;
  isSessionOpen: () => boolean;
  /** Writes any debounced document change now (src/store/index.ts flushSave). */
  flush: () => void;
  reload: () => void;
  /** Shows the banner with this Reload action (src/app/UpdatePrompt.tsx notifyUpdateReady). */
  showBanner: (onReload: () => void) => void;
  /** Subscribes to store changes (a session closing re-evaluates). Returns the unsubscribe. */
  subscribeStore: (listener: () => void) => () => void;
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  win: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>;
}

export interface UpdateController {
  /** For tests: the last decision taken for a waiting worker, or null when none is waiting. */
  lastDecision: () => UpdateDecision | null;
  stop: () => void;
}

export function startUpdateController(deps: UpdateControllerDeps): UpdateController {
  let waiting = false; // a new worker is installed and waiting
  let controlledByNew = false; // the new worker already controls this page (another window applied)
  let applying = false;
  let interacted = false;
  let decision: UpdateDecision | null = null;
  let registration: ServiceWorkerRegistration | undefined;
  let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;
  let poll: number | null = null;

  const hidden = (): boolean => deps.doc.visibilityState === 'hidden';

  const check = (): void => {
    // update() rejects offline or on a fetch error; the next visible/interval tick tries again.
    registration?.update().catch(() => undefined);
  };

  const apply = (): void => {
    if (applying || applyUpdate === null) return;
    applying = true;
    deps.flush();
    void applyUpdate(true);
  };

  const evaluate = (): void => {
    // Before hydrate the store holds the default document, which never has a session open.
    if (!deps.ready()) return;
    if (controlledByNew) {
      // The page runs the old code under the new worker: reload at the first safe moment.
      if (!deps.isSessionOpen() && (hidden() || !interacted)) {
        deps.flush();
        deps.reload();
      }
      return;
    }
    if (!waiting) return;
    decision = decideUpdate({ sessionOpen: deps.isSessionOpen(), hidden: hidden(), interacted });
    if (decision === 'apply') apply();
    else if (decision === 'prompt') deps.showBanner(apply);
  };

  applyUpdate = deps.register({
    immediate: true,
    onNeedRefresh: () => {
      waiting = true;
      evaluate();
    },
    onNeedReload: () => {
      // This window asked for the update (apply above) or another window did.
      if (applying || !deps.isSessionOpen()) {
        deps.flush();
        deps.reload();
        return;
      }
      controlledByNew = true;
      deps.showBanner(() => {
        deps.flush();
        deps.reload();
      });
    },
    onRegisteredSW: (_url, reg) => {
      registration = reg;
      poll = deps.win.setInterval(() => {
        if (!hidden()) check();
      }, UPDATE_POLL_INTERVAL_MS);
    },
  });

  const onInteract = (): void => {
    interacted = true;
  };
  const onVisibility = (): void => {
    if (hidden()) {
      evaluate();
      return;
    }
    interacted = false; // a resume is a fresh look at the app
    check();
    evaluate();
  };
  const unsubscribe = deps.subscribeStore(evaluate);

  deps.win.addEventListener('pointerdown', onInteract, { capture: true, passive: true });
  deps.win.addEventListener('keydown', onInteract, { capture: true, passive: true });
  deps.doc.addEventListener('visibilitychange', onVisibility);

  return {
    lastDecision: () => decision,
    stop: () => {
      unsubscribe();
      if (poll !== null) deps.win.clearInterval(poll);
      deps.win.removeEventListener('pointerdown', onInteract, { capture: true });
      deps.win.removeEventListener('keydown', onInteract, { capture: true });
      deps.doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
```

- [ ] **Step 4: Wire it in main.tsx**

In `src/main.tsx` replace
```ts
import { notifyUpdateReady } from './app/UpdatePrompt';
import { startPersistence } from './store';
```
with
```ts
import { notifyUpdateReady } from './app/UpdatePrompt';
import { startUpdateController } from './app/updateController';
import { openAssignment } from './domain/schedule/staleSessions';
import { flushSave, startPersistence, useAppStore } from './store';
```
Replace the whole block from `/*\n * Service-worker registration. vite.config.ts sets injectRegister: false` through the closing `});` of `const updateServiceWorker = registerSW({ ... });` with:
```ts
/*
 * Service worker and the update model (spec R7): src/app/updateController.ts. vite.config.ts
 * keeps registerType 'prompt' and injectRegister false (the CSP forbids an inline script), so
 * this call is the only registration. immediate: true registers as soon as this module runs,
 * which makes a cold first visit installable without a second round trip.
 */
startUpdateController({
  register: registerSW,
  ready: () => useAppStore.getState().status.hydrated,
  // Any profile's open session counts: the banner, never a reload, while one is open.
  isSessionOpen: () => {
    const s = useAppStore.getState();
    return Object.keys(s.profiles).some((id) => openAssignment(s, id) !== null);
  },
  flush: flushSave,
  reload: () => {
    window.location.reload();
  },
  showBanner: notifyUpdateReady,
  subscribeStore: (listener) => useAppStore.subscribe(listener),
  doc: document,
  win: window,
});
```
(If P2 has removed `flushSave`, pass `flush: () => undefined` and say so in the commit body: P2 writes per action.)

In `docs/ARCHITECTURE.md`, after the `| State | ... |` row add:
```markdown
| Updates | `registerType: 'prompt'`; `src/app/updateController.ts` checks `registration.update()` on every visible and every 30 min; a waiting worker applies itself when no session is open and the page is hidden or untouched since it became visible; banner only mid-session; `clients.claim()` in `src/sw.ts`; build stamp in non-precached `build-info.json` (spec R7, audit E01/E06) | Deploys reached an open or resumed installed app only after two cold launches or a tap | `autoUpdate` (reloads mid-workout); prompt-only with no polling (E01) |
```

- [ ] **Step 5: Run**

Run: `npx vitest run --maxWorkers=1 src/app`
Expected: PASS (`updatePolicy.test.ts` 9, `updateController.test.ts` 13; `UpdatePrompt.test.tsx` unchanged and passing).
Run: `npx tsc -b --force && npx eslint ./src ./scripts ./build && npm run build`
Expected: clean.

- [ ] **Step 6: E2E (the runner runs it)**

Create `e2e/r7-update.spec.ts`:
```ts
// Spec R7 (audit E01, E09): a new deploy reaches a resumed app with no session open and no tap,
// without a banner, and the first page after install is controlled (clients.claim).
//
// A deploy is simulated by appending a comment to dist/sw.js: the browser compares the worker
// script byte for byte, and `vite preview` serves dist/ from disk per request (sirv `dev: true`,
// node_modules/vite/dist/node/chunks/node.js). The file is restored in `finally`.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openApp, seedDocument } from './support/app';
import { e2eDocument } from './support/document';

test.use({ serviceWorkers: 'allow' });

test('R7: a new worker applies itself on resume when no session is open', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  const page = await openApp(context);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // E09: claimed on activate, so this first page is controlled without a reload.
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.evaluate(() => {
    Reflect.set(window, '__beforeUpdate', true);
  });
  const swPath = 'dist/sw.js';
  const original = readFileSync(swPath, 'utf8');
  try {
    writeFileSync(swPath, `${original}\n// e2e: a new deploy\n`);
    // A resume: the controller checks on visibilitychange (Playwright pages stay 'visible').
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Applied: the page reloaded onto the new worker, so the marker is gone.
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, '__beforeUpdate') === true).catch(() => true), {
        timeout: 30_000, // [ms]
      })
      .toBe(false);
    await expect(page.locator('.banner.update')).toHaveCount(0);
  } finally {
    writeFileSync(swPath, original);
  }
});
```
Runner: `npm run e2e -- e2e/r7-update.spec.ts` -> `2 passed`. If it times out, first check (`page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r?.waiting !== null))`) whether the new worker reached `waiting`; report the observation rather than loosening the assertion.

- [ ] **Step 7: Commit**

```bash
git add -- src/app/updatePolicy.ts src/app/updatePolicy.test.ts src/app/updateController.ts src/app/updateController.test.ts src/main.tsx docs/ARCHITECTURE.md e2e/r7-update.spec.ts
git commit -m "feat(pwa): update checks on visible and every 30 min, auto-apply when no session is open, banner only mid-session (R7, E01)"
```

---

### Task 5: Update banner docked under the header, above every scrim (E13)

**Files:**
- Modify: `src/app/UpdatePrompt.tsx`, `src/app/UpdatePrompt.test.tsx`, `src/app/appShell.css` (append)

**Precondition:** P4a Task 1 (the z ladder) has landed. Run `grep -q -- '--z-modal:' src/ui/styles/tokens.css && grep -q -- '--z-system:' src/ui/styles/tokens.css && echo READY`. Not `READY`: STOP and report "P4a z ladder not landed; Task 5 deferred".

**Interfaces:**
- Consumes: `notifyUpdateReady` (unchanged API; Task 4 calls it); P4a's ladder in `src/ui/styles/tokens.css` (`--z-header: 30; --z-dock: 32; --z-sheet: 35; --z-crt: 44; --z-toast: 45; --z-modal: 50; --z-system: 60;`, P4a plan Task 1) and its hygiene test (`LADDER_VALUE` accepts `calc(var(--z-x) + n)`).
- Produces: `UPDATE_DOCK_ANCHOR = 'header.topbar'` exported from `UpdatePrompt.tsx`; the rung `calc(var(--z-modal) + 1)` for `.update-dock`.

Design: the banner was in-flow at the top of `<main>` (scrolled out of sight) and under `.mmod-bg` it could not be tapped (audit E13, reproduced). It becomes a fixed dock whose `top` is the header's measured bottom edge, one rung above every modal sheet and scrim (`--z-modal`, which P4a also gives the spotlight palette) and below the system layers (`--z-system`: boot, intro, Konami). Toasts (`--z-toast`) sit under it. App.tsx is not touched: the component keeps its place in `<main>` (P4a plan: "`UpdatePrompt` keeps its place inside `<main>`") and positions itself. Rejected: a second row inside the sticky header (the header's own stacking context would keep it under every modal); a portal (not needed: `.crt` creates no stacking context, `src/ui/styles/crt.css:9-12`); a new ladder rung (P4a owns the ladder; `modal + 1` is expressible in its grammar).

- [ ] **Step 1: Write the failing tests**

Append to `src/app/UpdatePrompt.test.tsx`:
```tsx

// Every stylesheet under src, as text, keyed by path (the limeContrast.test.ts convention).
const SHEETS = import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true });

describe('UpdatePrompt placement (audit E13)', () => {
  it('renders inside a fixed dock, not in the scrolling flow', () => {
    act(() => {
      notifyUpdateReady(vi.fn());
    });
    render(<UpdatePrompt />);
    const dock = document.querySelector('.update-dock');
    expect(dock).not.toBeNull();
    expect(dock?.querySelector('.banner.update')).not.toBeNull();
  });

  it('docks fixed, under the header, one rung above every modal and below the system layers', () => {
    const shell = SHEETS['./appShell.css'] ?? '';
    const rule = /\.update-dock\s*\{([^}]*)\}/.exec(shell)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/z-index:\s*calc\(var\(--z-modal\) \+ 1\);/);
    const tokens = SHEETS['../ui/styles/tokens.css'] ?? '';
    const rung = (name: string): number => Number(new RegExp(`--z-${name}:\\s*(\\d+);`).exec(tokens)?.[1]);
    expect(rung('modal') + 1).toBeLessThan(rung('system'));
    expect(rung('toast')).toBeLessThan(rung('modal') + 1);
    // Nothing else claims the dock's rung or sits between it and the system layers.
    const crowding = Object.entries(SHEETS)
      .filter(([path]) => !path.endsWith('appShell.css'))
      .flatMap(([path, css]) => [...css.matchAll(/z-index:\s*calc\(var\(--z-modal\) \+ (\d)\)/g)].map((m) => `${path}: +${m[1] ?? ''}`));
    expect(crowding).toEqual([]);
  });

  it('measures the header it docks under', () => {
    expect(UPDATE_DOCK_ANCHOR).toBe('header.topbar');
  });
});
```
and change the file's import line `import { UpdatePrompt, notifyUpdateReady } from './UpdatePrompt';` to `import { UPDATE_DOCK_ANCHOR, UpdatePrompt, notifyUpdateReady } from './UpdatePrompt';`. The glob keys from this file are `./appShell.css` and `../ui/styles/tokens.css`. `vitest.config.ts` already processes every `*.css?raw` as text.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --maxWorkers=1 src/app/UpdatePrompt.test.tsx`
Expected: FAIL (`UPDATE_DOCK_ANCHOR` not exported; no `.update-dock`).

- [ ] **Step 3: Implement**

In `src/app/UpdatePrompt.tsx`:
- replace `import { useSyncExternalStore } from 'react';` with `import { useEffect, useState, useSyncExternalStore } from 'react';`
- replace the header comment's second paragraph ("vite.config.ts sets registerType: 'prompt' ... this component is what the user sees.") with:
```ts
 * vite.config.ts sets registerType: 'prompt', so a new build never takes over a
 * running session on its own. src/app/updateController.ts decides (spec R7): it applies a
 * waiting worker itself when no session is open, and calls notifyUpdateReady() only while
 * one is, so this banner is the mid-session case. Its Reload is the user's choice.
```
- after `function getSnapshot() ... }` add:
```ts
/**
 * The element the dock sits under (audit E13). P4a's one-line header keeps `header.topbar`; a
 * later rename changes this selector, and UpdatePrompt.test.tsx names it.
 */
export const UPDATE_DOCK_ANCHOR = 'header.topbar';

/** [px] The anchor's bottom edge in the viewport, kept current on resize; 0 when absent. */
function useAnchorBottom(): number {
  const [bottom, setBottom] = useState(0);
  useEffect(() => {
    const anchor = document.querySelector(UPDATE_DOCK_ANCHOR);
    const measure = (): void => {
      setBottom(Math.max(0, anchor?.getBoundingClientRect().bottom ?? 0));
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' || anchor === null ? null : new ResizeObserver(measure);
    if (anchor !== null) observer?.observe(anchor);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);
  return bottom;
}
```
- in `UpdatePrompt`, after `const t = useCopy();` add `const top = useAnchorBottom(); // [px]` (before the early return, rules of hooks), and replace the returned JSX with:
```tsx
    // Audit E13: fixed under the header, above modal scrims, so it is visible when scrolled and
    // tappable while a dialog is open.
    <div className="update-dock" style={{ top: `${String(top)}px` }}>
      <div className="banner update" role="status">
        <span className="banner-tag">{t('banner.update.tag')}</span>
        <span>{t('banner.update.body')}</span>
        <button type="button" onClick={apply}>
          {t('button.reload')}
        </button>
      </div>
    </div>
```
Append to `src/app/appShell.css`:
```css

/*
 * The update banner's dock (audit E13). Fixed, so it stays visible however far the view is
 * scrolled; `top` is set inline to the header's measured bottom edge (UpdatePrompt.tsx), so it
 * sits directly under the header on any header height (safe-area padding included). One rung
 * above every modal sheet and scrim, so Reload is tappable with a dialog open; below the
 * system layers (boot, intro). UpdatePrompt.test.tsx holds the order.
 */
.update-dock {
  position: fixed;
  left: 0;
  right: 0;
  z-index: calc(var(--z-modal) + 1);
  padding: 0 14px;
  pointer-events: none;
}

.update-dock .banner {
  max-width: 1280px;
  margin: 8px auto 0;
  pointer-events: auto;
}
```

- [ ] **Step 4: Run**

Run: `npx vitest run --maxWorkers=1 src/app src/ui/styles`
Expected: PASS (`UpdatePrompt.test.tsx` 4 tests; `topbar.test.ts`, `limeContrast.test.ts` and P4a's stylesheet-hygiene test unchanged and passing: no colour declared, the z-index is a ladder value).
Run: `npx tsc -b --force && npx eslint ./src`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -- src/app/UpdatePrompt.tsx src/app/UpdatePrompt.test.tsx src/app/appShell.css
git commit -m "fix(pwa): update banner docked under the header, above every scrim (E13)"
```

---

### Task 6: Route-level code splitting; one confirmation word (E09, F14)

**Files:**
- Create: `src/app/lazyRoute.tsx`, `src/app/routes.tsx`, `src/app/routes.test.tsx`, `src/ui/components/confirmWord.ts`
- Modify: `src/app/App.tsx` (five import lines out, one in), `src/app/LoadRecovery.tsx` (one import), `src/ui/settings/DataSection.tsx` and `src/ui/views/ExportView.tsx` (the `CONFIRM_WORD` declaration), `src/app/App.test.tsx`, `src/ui/views/TargetsView.test.tsx` (preload), `src/app/appShell.css` (append), `src/content/copy.ts`, `src/content/__fixtures__/limelight-resolved.json`

**Interfaces:**
- Produces: `lazyRoute<P extends object>(name: string, load: () => Promise<ComponentType<P>>): { Component: (props: P) => ReactElement; preload(): Promise<void> }`; from `src/app/routes.tsx`: `SetupWizard`, `AtlasView`, `LogView`, `SettingsView` (route components, same names App.tsx used), `IntroGate(): ReactElement | null`, `preloadRoutes(): Promise<void>`; `CONFIRM_WORD = 'DELETE'` from `src/ui/components/confirmWord.ts`; copy keys `advice.screenLoadFailed`, `button.tryAgain`.
- Consumes: post-P1 `src/app/LoadRecovery.tsx` line `import { CONFIRM_WORD } from '../ui/settings/DataSection';` and post-P1 `DataSection.tsx` line `export const CONFIRM_WORD = 'DELETE';`.

Design: `React.lazy` caches a rejected import for the life of the page and its throw reaches `RootErrorBoundary`, replacing the whole app with the crash screen; a chunk that failed once offline or after a deploy would brick the session. `lazyRoute` keeps the failure local (retry panel), renders synchronously once loaded (module scope), and exposes `preload()` for tests. Chrome 156 and Firefox 155 re-fetch a failed module on a later `import()`; Safari does not ("Retriable module loading", https://web-platform-dx.github.io/web-features-explorer/features/retriable-module-loading/, read 2026-11-04), hence a Reload button beside Try Again. The intro gate stays in the main chunk as one store read, so returning users never request the intro chunk. Every chunk is precached (`globPatterns` `**/*.js`). Rejected: React.lazy + Suspense (above); splitting Today, Plan, Train, Targets (the common first screens; a placeholder flash on the views used every day).

`LoadRecovery.tsx` (main chunk, P1) imports `CONFIRM_WORD` from `DataSection.tsx`, which would pull DataSection and ExportView back into the main chunk; `ExportView.tsx` also declares its own copy of the word (rule 2). Both now read `src/ui/components/confirmWord.ts`. `routes.test.tsx` fails on any static import that pulls a split screen back.

- [ ] **Step 1: Write the failing tests**

Create `src/app/routes.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { copyFor } from '../content/copy';
import { lazyRoute } from './lazyRoute';

/** Every non-test source file under src, as text, keyed by its path relative to src/. */
const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).map(([path, text]) => [path.startsWith('./') ? `app/${path.slice(2)}` : path.replace(/^\.\.\//, ''), text]),
);

/**
 * Each split screen (path under src/, no extension) and the only files that may import it
 * STATICALLY. Any other static import pulls the screen back into the main chunk (audit E09).
 * ProgrammeSettings reads a constant from the wizard; it is itself inside the Settings chunk.
 */
const SPLIT: Readonly<Record<string, readonly string[]>> = {
  'ui/setup/SetupWizard': ['ui/settings/ProgrammeSettings.tsx'],
  'ui/intro/IntroSequence': [],
  'ui/views/AtlasView': [],
  'ui/views/LogView': [],
  'ui/views/SettingsView': [],
  'ui/settings/DataSection': ['ui/views/SettingsView.tsx'],
  'ui/views/ExportView': ['ui/settings/DataSection.tsx'],
};

/** Static, value-level import specifiers of one file (type-only imports are erased). */
function staticImports(text: string): string[] {
  return [...text.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)';/gms)].map((m) => m[1] ?? '');
}

/** `ui/setup/SetupWizard.tsx` importing `./setupArt` -> `ui/setup/setupArt`. */
function resolve(importer: string, spec: string): string {
  return new URL(spec, `file:///${importer}`).pathname.slice(1).replace(/\.(tsx?|js)$/, '');
}

describe('split screens stay out of the main chunk (audit E09)', () => {
  it('reads the source tree', () => {
    expect(Object.keys(SOURCES)).toContain('app/App.tsx');
    expect(Object.keys(SOURCES)).toContain('app/routes.tsx');
  });

  it('imports each split screen statically only from its allowed files', () => {
    const offenders: string[] = [];
    for (const [importer, text] of Object.entries(SOURCES)) {
      for (const spec of staticImports(text)) {
        if (!spec.startsWith('.')) continue;
        const target = resolve(importer, spec);
        const allowed = SPLIT[target];
        if (allowed !== undefined && !allowed.includes(importer)) offenders.push(`${importer} -> ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has one confirmation word (rule 2)', () => {
    const declaring = Object.entries(SOURCES)
      .filter(([, text]) => /const CONFIRM_WORD\b/.test(text))
      .map(([path]) => path);
    expect(declaring).toEqual(['ui/components/confirmWord.ts']);
  });
});

describe('lazyRoute', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a busy placeholder, then the screen; a later mount is drawn at once', async () => {
    const route = lazyRoute('demo', () => Promise.resolve(() => <p>loaded screen</p>));
    const first = render(<route.Component />);
    expect(first.container.querySelector('[data-route="demo"][aria-busy="true"]')).not.toBeNull();
    expect(await screen.findByText('loaded screen')).toBeInTheDocument();
    first.unmount();
    render(<route.Component />);
    expect(screen.getByText('loaded screen')).toBeInTheDocument();
  });

  it('renders synchronously after preload()', async () => {
    const route = lazyRoute('pre', () => Promise.resolve(() => <p>preloaded</p>));
    await route.preload();
    render(<route.Component />);
    expect(screen.getByText('preloaded')).toBeInTheDocument();
  });

  it('keeps a failed load local, and Try Again loads it again', async () => {
    const load = vi
      .fn<() => Promise<() => ReactElement>>()
      .mockRejectedValueOnce(new Error('chunk 404'))
      .mockResolvedValueOnce(() => <p>second try</p>);
    const route = lazyRoute('flaky', load);
    render(<route.Component />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(copyFor('limelight', 'advice.screenLoadFailed'));
    expect(screen.getByRole('button', { name: copyFor('limelight', 'button.reload') })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.tryAgain') }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByText('second try')).toBeInTheDocument();
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('passes props through', async () => {
    const route = lazyRoute('props', () => Promise.resolve((props: { label: string }) => <p>{props.label}</p>));
    await route.preload();
    render(<route.Component label="hello" />);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --maxWorkers=1 src/app/routes.test.tsx`
Expected: FAIL (`./lazyRoute` missing).

- [ ] **Step 3: Copy keys**

In `src/content/copy.ts`, in the `CopyKey` union replace `  | 'button.reload'` with:
```ts
  | 'button.reload'
  | 'advice.screenLoadFailed'
  | 'button.tryAgain'
```
and in `DEFAULT_COPY` replace `  'button.reload': 'Reload',` with:
```ts
  'button.reload': 'Reload',
  // Audit E09: a split screen whose chunk did not load (src/app/lazyRoute.tsx).
  'advice.screenLoadFailed': 'This screen did not load.',
  'button.tryAgain': 'Try Again',
```
Run:
```bash
node -e "const fs=require('fs');const p='src/content/__fixtures__/limelight-resolved.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));Object.assign(d,{'advice.screenLoadFailed':'This screen did not load.','button.tryAgain':'Try Again'});fs.writeFileSync(p,JSON.stringify(d)+'\n');"
```

- [ ] **Step 4: lazyRoute and the routes**

Create `src/app/lazyRoute.tsx`:
```tsx
// src/app/lazyRoute.tsx
//
// Audit E09/F14: route-level code splitting without React.lazy. A screen the user may never
// open on this launch (setup, intro, Atlas, Log, Settings, the rest games) is its own chunk;
// the service worker precaches every chunk (vite.config.ts globPatterns `**/*.js`), so offline
// it still opens.
//
// WHY NOT React.lazy + Suspense. A rejected React.lazy is cached inside the lazy object, so a
// chunk that failed once (offline first session, a stale deploy) fails for the life of the page,
// and the throw reaches RootErrorBoundary: the whole app is replaced by the crash screen. Here a
// failure is local: the screen shows Try Again, which calls the loader again (Chrome 156+ and
// Firefox 155+ re-fetch a failed module; Safari caches the failure, hence the Reload control
// beside it), and the rest of the shell keeps working.
//
// SYNCHRONOUS ONCE LOADED. The module is held at module scope, so after the first load every
// mount renders the screen on its first frame, and `preload()` lets a test (or an idle hint)
// make the first mount synchronous too.
import { useEffect, useState, type ComponentType, type ReactElement } from 'react';
import { useCopy } from '../content/useCopy';

export interface LazyRoute<P extends object> {
  /** Renders the screen, a sized empty placeholder while it loads, or the retry panel. */
  Component: (props: P) => ReactElement;
  /** Starts (or joins) the load. Resolves once the screen can render synchronously. */
  preload: () => Promise<void>;
}

type LoadState<P> =
  | { status: 'idle' }
  | { status: 'loading'; promise: Promise<void> }
  | { status: 'ready'; component: ComponentType<P> }
  | { status: 'failed' };

export function lazyRoute<P extends object>(
  name: string,
  load: () => Promise<ComponentType<P>>,
): LazyRoute<P> {
  let state: LoadState<P> = { status: 'idle' };
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const preload = (): Promise<void> => {
    if (state.status === 'ready') return Promise.resolve();
    if (state.status === 'loading') return state.promise;
    const promise = load().then(
      (component) => {
        state = { status: 'ready', component };
        notify();
      },
      () => {
        state = { status: 'failed' };
        notify();
      },
    );
    state = { status: 'loading', promise };
    return promise;
  };

  function Component(props: P): ReactElement {
    const [, setTick] = useState(0);
    useEffect(() => {
      const listener = (): void => {
        setTick((n) => n + 1);
      };
      listeners.add(listener);
      if (state.status === 'idle') void preload();
      return () => {
        listeners.delete(listener);
      };
    }, []);

    if (state.status === 'ready') {
      const Loaded = state.component;
      return <Loaded {...props} />;
    }
    if (state.status === 'failed') {
      return (
        <RouteLoadFailed
          name={name}
          onRetry={() => {
            state = { status: 'idle' };
            void preload();
            notify();
          }}
        />
      );
    }
    // `aria-busy` so assistive technology hears that the region is filling, not empty.
    return <div className="route-loading" data-route={name} aria-busy="true" />;
  }

  return { Component, preload };
}

function RouteLoadFailed(props: { name: string; onRetry: () => void }): ReactElement {
  const t = useCopy();
  return (
    <div className="route-failed" data-route={props.name} role="alert">
      <p>{t('advice.screenLoadFailed')}</p>
      <button type="button" onClick={props.onRetry}>
        {t('button.tryAgain')}
      </button>
      <button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
      >
        {t('button.reload')}
      </button>
    </div>
  );
}
```
Create `src/app/routes.tsx`:
```tsx
// src/app/routes.tsx
//
// Audit E09/F14: the screens split out of the main chunk. App.tsx imports these names from here
// instead of from the screen modules, so its JSX is unchanged. A screen module imported
// statically anywhere in the main chunk's graph would be pulled back in; routes.test.tsx holds
// the list of files that may import each screen.
import type { ReactElement } from 'react';
import { useAppStore } from '../store';
import { lazyRoute } from './lazyRoute';

const setupRoute = lazyRoute('setup', () => import('../ui/setup/SetupWizard').then((m) => m.SetupWizard));
const introRoute = lazyRoute('intro', () => import('../ui/intro/IntroSequence').then((m) => m.IntroSequence));
const atlasRoute = lazyRoute('atlas', () => import('../ui/views/AtlasView').then((m) => m.AtlasView));
const logRoute = lazyRoute('log', () => import('../ui/views/LogView').then((m) => m.LogView));
const settingsRoute = lazyRoute('settings', () => import('../ui/views/SettingsView').then((m) => m.SettingsView));

export const SetupWizard = setupRoute.Component;
export const AtlasView = atlasRoute.Component;
export const LogView = logRoute.Component;
export const SettingsView = settingsRoute.Component;

/**
 * The intro gate stays in the main chunk because it is a single store read; only the sequence it
 * opens is split. On every launch after the first, `introSeen` is true and the intro chunk is
 * never requested.
 */
export function IntroGate(): ReactElement | null {
  const introSeen = useAppStore((s) => s.ui.introSeen);
  return introSeen ? null : <introRoute.Component />;
}

/** Every split screen, loaded now. For tests that mount <App /> and query a screen at once. */
export function preloadRoutes(): Promise<void> {
  return Promise.all([
    setupRoute.preload(),
    introRoute.preload(),
    atlasRoute.preload(),
    logRoute.preload(),
    settingsRoute.preload(),
  ]).then(() => undefined);
}
```
In `src/app/App.tsx` (or wherever P4a moved these lines; grep each) delete exactly these five lines:
```ts
import { IntroGate } from '../ui/intro/IntroSequence';
import { SetupWizard } from '../ui/setup/SetupWizard';
import { AtlasView } from '../ui/views/AtlasView';
import { LogView } from '../ui/views/LogView';
import { SettingsView } from '../ui/views/SettingsView';
```
and after `import { StaleSessionNotice } from './StaleSessionNotice';` add:
```ts
// Audit E09: split screens, loaded on first use; same names, so the JSX below is unchanged.
import { AtlasView, IntroGate, LogView, SettingsView, SetupWizard } from './routes';
```

- [ ] **Step 5: One confirmation word**

Create `src/ui/components/confirmWord.ts`:
```ts
// src/ui/components/confirmWord.ts
//
// The word master plan section 3 fixes for every destructive confirmation. One source (rule 2):
// it was declared in both DataSection.tsx and ExportView.tsx, and LoadRecovery.tsx imported it
// from DataSection, which pulled the whole Settings data section into the main chunk (audit E09).
export const CONFIRM_WORD = 'DELETE';
```
In `src/ui/settings/DataSection.tsx` replace
```ts
/** The word master plan section 3 fixes for every destructive confirmation. */
export const CONFIRM_WORD = 'DELETE';
```
with nothing, and add `import { CONFIRM_WORD } from '../components/confirmWord';` after `import { ConfirmDestructive } from '../components/ConfirmDestructive';`.
In `src/ui/views/ExportView.tsx` delete
```ts
/** The word master plan section 3 fixes for every destructive confirmation. */
const CONFIRM_WORD = 'DELETE';
```
and add `import { CONFIRM_WORD } from '../components/confirmWord';` after `import { ConfirmDestructive } from '../components/ConfirmDestructive';`.
In `src/app/LoadRecovery.tsx` replace `import { CONFIRM_WORD } from '../ui/settings/DataSection';` with `import { CONFIRM_WORD } from '../ui/components/confirmWord';`.
Run `grep -rn "CONFIRM_WORD" src e2e` and repoint any other importer of `DataSection`'s word the same way.

- [ ] **Step 6: Placeholder styles**

Append to `src/app/appShell.css`:
```css

/*
 * A split screen while its chunk loads (src/app/lazyRoute.tsx, audit E09): an empty box that
 * holds the view's place, so the footer does not jump up and back. 60vh is a layout bound, not
 * a measured view height.
 */
.route-loading {
  min-height: 60vh;
}

/* The retry panel: the save-banner look, so a failure reads like the app's other failures. */
.route-failed {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  margin-bottom: 18px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--danger);
  background: var(--bg-2);
  font-family: var(--sans);
  font-size: 13.5px;
  color: var(--text-2);
}

.route-failed p {
  margin: 0;
  flex: 1 1 12rem;
}

.route-failed button {
  font: inherit;
  min-height: 2.75rem;
  padding: 6px 12px;
  border: 1px solid var(--ink);
  background: var(--accent);
  color: var(--ink);
  cursor: pointer;
}
```

- [ ] **Step 7: Tests that mount the whole App**

Measured while planning: 7 tests break when the screens load asynchronously (`src/app/App.test.tsx`: "reaches the Atlas, which is a tab like any other", the five "top bar banner" tests that type into the wizard; `src/ui/views/TargetsView.test.tsx`: "reaches the settings view and switches the display unit without changing storage"). In both files add `beforeAll` to the existing `vitest` import and, after the last import:
```ts
import { preloadRoutes } from './routes'; // TargetsView.test.tsx: '../../app/routes'

// Audit E09: App's split screens render on their first frame only once loaded.
beforeAll(async () => {
  await preloadRoutes();
});
```
Then run the wider suites (Step 8); any further test that fails because a setup, intro, Settings, Log or Atlas element is missing right after `render(<App />)` gets the same three lines (P1 to P4a may have added such tests; `src/app/RootErrorBoundary.test.tsx`, `src/ui/views/PlanView.test.tsx`, `src/ui/views/TodayView.test.tsx` also mount `<App />` and passed unchanged at HEAD).

- [ ] **Step 8: Run**

Run: `npx vitest run --maxWorkers=1 src/app src/content`
Then: `npx vitest run --maxWorkers=1 src/ui`
Expected: PASS (`routes.test.tsx` 7 tests).
Run: `npx tsc -b --force && npx eslint ./src && npm run build && bash scripts/check-dist-csp.sh`
Expected: clean; `ls -S dist/assets/*.js | head -3` lists the entry, a shared vendor chunk and `SetupWizard-*.js`; the entry chunk is about 357 KB raw (planning measurement 356,919 B; P1-P4a changes move it).
Runner: `npm run e2e` (the whole suite; every spec opens split screens).

- [ ] **Step 9: Commit**

```bash
git add -- src/app/lazyRoute.tsx src/app/routes.tsx src/app/routes.test.tsx src/app/App.tsx src/app/App.test.tsx src/ui/views/TargetsView.test.tsx src/app/LoadRecovery.tsx src/ui/components/confirmWord.ts src/ui/settings/DataSection.tsx src/ui/views/ExportView.tsx src/app/appShell.css src/content/copy.ts src/content/__fixtures__/limelight-resolved.json
git commit -m "perf(app): setup, intro, Atlas, Log and Settings load as their own chunks with a local retry; one confirmation word (E09, F14)"
```
(Add any further test file Step 7 touched to the pathspec.)

---

### Task 7: Lazy art with in-place retry; body-fat drawings out of the setup chunk (E12, E09)

**Files:**
- Create: `src/ui/components/useLazyMarkup.ts`, `src/ui/components/useLazyMarkup.test.tsx`
- Modify: `src/ui/views/atlasArt.tsx` (`CardIcon` and its imports), `src/ui/setup/setupArt.tsx` (body-fat glob and API), `src/ui/setup/setupArt.test.ts`, `src/ui/setup/SetupWizard.tsx` (one import block, one map body), `src/ui/setup/SetupWizard.test.tsx` (one test)

**Interfaces:**
- Produces: `MAX_LAZY_MARKUP_ATTEMPTS = 3`, `useLazyMarkup(key: string, load: (() => Promise<string>) | undefined, cache: Map<string, string>): { markup: string | undefined; state: 'loading' | 'ready' | 'failed' }`; in `setupArt.tsx`: `bodyFatChartLoader(sex, pct, view): (() => Promise<string>) | undefined` (replaces `bodyFatChartArt`), `BodyFatFigure(props: { sex; pct; view; className: string; style?: CSSProperties | undefined }): JSX.Element` (renders `data-art`, `data-art-state`). P5 (body-fat re-measure) can reuse `BodyFatFigure`.

Design: E12 reproduced a card icon stuck at `loading` forever after its chunk failed, retried only on remount. The shared hook retries in place on the `online` event and on `visibilitychange` to visible, at most 3 attempts per mount [attempts, engineering bound], and reports `failed` (observable as `data-icon-state="failed"`) when it stops. The 24 body-fat drawings (87,685 B raw, audit E09) were an eager glob inside the setup chunk; they become one chunk each, fetched when the chart opens. Loader functions are memoised per id so a re-render never restarts a load in flight.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/components/useLazyMarkup.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MAX_LAZY_MARKUP_ATTEMPTS, useLazyMarkup } from './useLazyMarkup';

describe('useLazyMarkup (audit E12)', () => {
  it('loads once, caches, and returns a cached file on the first render', async () => {
    const cache = new Map<string, string>();
    const load = vi.fn(() => Promise.resolve('<svg/>'));
    const first = renderHook(() => useLazyMarkup('a', load, cache));
    expect(first.result.current).toEqual({ markup: undefined, state: 'loading' });
    await waitFor(() => {
      expect(first.result.current.state).toBe('ready');
    });
    first.unmount();
    const second = renderHook(() => useLazyMarkup('a', load, cache));
    expect(second.result.current).toEqual({ markup: '<svg/>', state: 'ready' });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reports a failed load, then retries in place when the browser comes back online', async () => {
    const cache = new Map<string, string>();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('chunk 404'))
      .mockResolvedValueOnce('<svg id="b"/>');
    const { result } = renderHook(() => useLazyMarkup('b', load, cache));
    await waitFor(() => {
      expect(result.current.state).toBe('failed');
    });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => {
      expect(result.current).toEqual({ markup: '<svg id="b"/>', state: 'ready' });
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('retries when the page becomes visible again', async () => {
    const cache = new Map<string, string>();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('<svg id="c"/>');
    const { result } = renderHook(() => useLazyMarkup('c', load, cache));
    await waitFor(() => {
      expect(result.current.state).toBe('failed');
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => {
      expect(result.current.state).toBe('ready');
    });
  });

  it(`stops after ${String(MAX_LAZY_MARKUP_ATTEMPTS)} attempts`, async () => {
    const cache = new Map<string, string>();
    const load = vi.fn<() => Promise<string>>(() => Promise.reject(new Error('gone')));
    const { result } = renderHook(() => useLazyMarkup('d', load, cache));
    for (let i = 0; i < MAX_LAZY_MARKUP_ATTEMPTS + 2; i += 1) {
      await waitFor(() => {
        expect(result.current.state).toBe('failed');
      });
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
    }
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(MAX_LAZY_MARKUP_ATTEMPTS);
    });
  });

  it('is failed at once when no file exists for the key', async () => {
    const { result } = renderHook(() => useLazyMarkup('none', undefined, new Map()));
    await waitFor(() => {
      expect(result.current).toEqual({ markup: undefined, state: 'failed' });
    });
  });
});
```
In `src/ui/setup/setupArt.test.ts`:
- replace `  bodyFatChartArt,\n} from './setupArt';` with `  bodyFatChartLoader,\n} from './setupArt';\nimport setupArtSource from './setupArt.tsx?raw';`
- in "has a front and a side drawing for every percentage, ids derived from the percentages": make the callback `async () =>` and replace
```ts
          const markup = bodyFatChartArt(sex, pct, view);
          expect(markup, bodyFatArtId(sex, pct, view)).toBeDefined();
          expect(markup).toContain('currentColor');
```
with
```ts
          const load = bodyFatChartLoader(sex, pct, view);
          expect(load, bodyFatArtId(sex, pct, view)).toBeDefined();
          const markup = await load?.();
          expect(markup).toContain('currentColor');
```
- in "crops every drawing to its view box, one box per view so the scale is shared": make the callback `async () =>` and replace `const markup = bodyFatChartArt(sex, pct, view) ?? '';` with `const markup = (await bodyFatChartLoader(sex, pct, view)?.()) ?? '';`
- replace the last test with:
```ts
  it('has no loader for a percentage with no drawing', () => {
    expect(bodyFatChartLoader('female', 15, 'front')).toBeUndefined();
  });
```
- append:
```ts

describe('body-fat chart art is split out (audit E09)', () => {
  it('reads the drawings through a lazy glob, never an eager one', () => {
    expect(setupArtSource).toMatch(/bf-\*\.svg'/);
    expect(setupArtSource).not.toMatch(/bf-\*\.svg', \{[^}]*eager: true/s);
  });
});
```
In `src/ui/setup/SetupWizard.test.tsx`: add `waitFor` to the `@testing-library/react` import (`import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';`); in `it('draws a front and side pair per percentage, per sex, in the order of the percentages', () => {` make the callback `async () =>`, and replace
```ts
        for (const el of art) {
          expect(el.getAttribute('aria-hidden')).toBe('true');
          expect(el.querySelector('svg')).not.toBeNull();
        }
      });
    }
```
with
```ts
        for (const el of art) {
          expect(el.getAttribute('aria-hidden')).toBe('true');
        }
      });
    }
    // Audit E09: each drawing is its own chunk, filled into a box that is already in place.
    await waitFor(() => {
      for (const el of chart.querySelectorAll('[data-art^="bf-"]')) {
        expect(el.getAttribute('data-art-state')).toBe('ready');
        expect(el.querySelector('svg')).not.toBeNull();
      }
    });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/components/useLazyMarkup.test.tsx src/ui/setup/setupArt.test.ts`
Expected: FAIL (hook and `bodyFatChartLoader` missing).

- [ ] **Step 3: The hook**

Create `src/ui/components/useLazyMarkup.ts`:
```ts
// src/ui/components/useLazyMarkup.ts
//
// One bundled SVG file, fetched as its own chunk on first use (the Atlas card icons, the setup
// wizard's body-fat drawings). Shared so both get the same two guarantees:
//
//  1. A file already loaded this page life is returned on the first render (no placeholder
//     frame), from the caller's cache.
//  2. Audit E12: a load that fails (offline first session, a chunk gone after a deploy) is
//     retried in place when the browser reports it is back online or the page becomes visible
//     again, at most MAX_LAZY_MARKUP_ATTEMPTS times per mount, instead of leaving an empty box
//     until a remount. Chrome 156+ and Firefox 155+ re-fetch a failed module on a later import();
//     Safari keeps the failure for the page's life, so there the box stays empty and says
//     'failed' (the caption beside every drawing still names it).
import { useEffect, useState } from 'react';

/** [attempts] per mount: the first load plus two retries. An engineering bound, not tuned. */
export const MAX_LAZY_MARKUP_ATTEMPTS = 3;

export type LazyMarkupState = 'loading' | 'ready' | 'failed';

export interface LazyMarkup {
  markup: string | undefined;
  state: LazyMarkupState;
}

/**
 * @param key   the file's id; a change of key starts a new load.
 * @param load  the chunk loader, or undefined when no file exists for the key (state 'failed').
 *              Must be stable per key (memoise it), or every render restarts the load.
 * @param cache module-scope map owned by the caller, keyed by `key`.
 */
export function useLazyMarkup(
  key: string,
  load: (() => Promise<string>) | undefined,
  cache: Map<string, string>,
): LazyMarkup {
  const [arrived, setArrived] = useState<{ key: string; markup: string } | undefined>(undefined);
  const [failedKey, setFailedKey] = useState<string | undefined>(undefined);
  const markup = arrived?.key === key ? arrived.markup : cache.get(key);

  useEffect(() => {
    if (cache.has(key)) return undefined;
    if (load === undefined) {
      setFailedKey(key);
      return undefined;
    }
    let live = true;
    let attempts = 0; // [attempts]
    let waiting = false;

    const attempt = (): void => {
      waiting = false;
      attempts += 1;
      setFailedKey(undefined);
      load().then(
        (text) => {
          cache.set(key, text);
          if (live) setArrived({ key, markup: text });
        },
        () => {
          if (!live) return;
          setFailedKey(key);
          waiting = attempts < MAX_LAZY_MARKUP_ATTEMPTS;
        },
      );
    };
    const retry = (): void => {
      if (live && waiting) attempt();
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') retry();
    };

    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisible);
    attempt();
    return () => {
      live = false;
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, load, cache]);

  if (markup !== undefined) return { markup, state: 'ready' };
  return { markup: undefined, state: failedKey === key ? 'failed' : 'loading' };
}
```

- [ ] **Step 4: CardIcon on the hook**

In `src/ui/views/atlasArt.tsx` replace
```ts
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { InlineArt } from '../components/InlineArt';
```
with
```ts
import type { ReactElement } from 'react';
import { InlineArt } from '../components/InlineArt';
import { useLazyMarkup } from '../components/useLazyMarkup';
```
and replace the whole `export function CardIcon(props: { id: string; className: string }): ReactElement { ... }` with:
```tsx
export function CardIcon(props: { id: string; className: string }): ReactElement {
  const { id } = props;
  // Audit E12: a failed load retries in place (online / visible), and says 'failed' when it stops.
  const { markup, state } = useLazyMarkup(id, CARD_ICON_LOADERS[id], loadedIcons);
  return (
    <InlineArt
      markup={markup ?? ''}
      data={{ 'data-card-icon': id, 'data-icon-state': state }}
      className={props.className}
    />
  );
}
```
In the doc comment above `CardIcon`, replace "A file that fails to load leaves the box empty: the title still names the card." with "A file that fails to load leaves the box empty and `failed`, retried in place (useLazyMarkup): the title still names the card."

- [ ] **Step 5: Body-fat drawings lazy**

In `src/ui/setup/setupArt.tsx`:
- after `import { InlineArt } from '../components/InlineArt';` add `import { useLazyMarkup } from '../components/useLazyMarkup';` (keep the InlineArt line exactly; `InlineArt.test.tsx` matches it)
- replace the comment and constant from `/*\n * Every body-fat drawing in the folder, by file name.` through the `BODY_FAT_FILES` glob's `});` with:
```ts
/*
 * Every body-fat drawing in the folder, by file name, as a LOADER (audit E09): the 24 drawings
 * (87,685 B raw) are each their own chunk, fetched when the chart opens, not carried by the setup
 * chunk's first load. The service worker precaches every chunk, so the chart still draws offline.
 * The glob is the only list of files: which ones the chart asks for is derived from
 * BODY_FAT_CHART_PERCENTAGES (AGENTS rule 2), so a percentage with no drawing reads as a missing
 * entry, which setupArt.test.ts fails on.
 */
const BODY_FAT_FILES = import.meta.glob<string>('../../assets/art/bf-*.svg', {
  query: '?raw',
  import: 'default',
});
```
- replace the whole `bodyFatChartArt` function and its doc comment (`/**\n * One body-fat drawing with its view's crop applied, ...` through its closing `}`) with:
```tsx
/** Applies the view's crop to one drawing's text. A file in another frame is returned uncropped. */
function cropBodyFat(markup: string, view: BodyFatChartView): string {
  const { x, y, w, h } = BODY_FAT_CHART_CROP[view];
  return markup.replace(
    BODY_FAT_SOURCE_VIEWBOX,
    `viewBox="${String(x)} ${String(y)} ${String(w)} ${String(h)}"`,
  );
}

/** One loader per drawing id, created once, so a re-render never restarts a load in flight. */
const bodyFatLoaders = new Map<string, () => Promise<string>>();

/**
 * The loader for one drawing, with its view's crop applied, or undefined when the folder has no
 * file for that sex, percentage and view.
 */
export function bodyFatChartLoader(
  sex: BodyFatChartSex,
  pct: number,
  view: BodyFatChartView,
): (() => Promise<string>) | undefined {
  const id = bodyFatArtId(sex, pct, view);
  const memo = bodyFatLoaders.get(id);
  if (memo !== undefined) return memo;
  const load = BODY_FAT_FILES[`../../assets/art/${id}.svg`];
  if (load === undefined) return undefined;
  const cropped = (): Promise<string> => load().then((markup) => cropBodyFat(markup, view));
  bodyFatLoaders.set(id, cropped);
  return cropped;
}

/** Drawings already loaded this page life, by id: a reopened chart draws on its first frame. */
const bodyFatLoaded = new Map<string, string>();

/**
 * One body-fat drawing, loaded on demand into a box that is already in place (audit E09/E12).
 * `data-art-state` reads loading, ready or failed; a failed load retries in place when the
 * browser is back online or the page is visible again (useLazyMarkup).
 */
export function BodyFatFigure(props: {
  sex: BodyFatChartSex;
  pct: number;
  view: BodyFatChartView;
  className: string;
  style?: CSSProperties | undefined;
}): JSX.Element {
  const id = bodyFatArtId(props.sex, props.pct, props.view);
  const { markup, state } = useLazyMarkup(id, bodyFatChartLoader(props.sex, props.pct, props.view), bodyFatLoaded);
  return (
    <InlineArt
      // Trimmed: the files end in whitespace after </svg>, which would add a text node.
      markup={(markup ?? '').trim()}
      data={{ 'data-art': id, 'data-art-state': state }}
      className={`wiz-art ${props.className}`}
      style={props.style}
    />
  );
}
```
In `src/ui/setup/SetupWizard.tsx` replace
```ts
  SetupArt,
  SetupIcon,
  bodyFatArtId,
  bodyFatChartArt,
  type SetupIconId,
```
with
```ts
  BodyFatFigure,
  SetupIcon,
  bodyFatChartLoader,
  type SetupIconId,
```
(if `SetupArt` or `bodyFatArtId` is still used elsewhere in the file after the next edit, keep it in the import; `npx tsc` tells) and replace
```tsx
                  {BODY_FAT_CHART_VIEWS.map((view) => {
                    const markup = bodyFatChartArt(sex, pct, view);
                    const { w, h } = BODY_FAT_CHART_CROP[view];
                    return markup === undefined ? null : (
                      <SetupArt
                        key={view}
                        id={bodyFatArtId(sex, pct, view)}
                        markup={markup}
                        className="wiz-chart-fig"
                        style={{ flexGrow: w, aspectRatio: `${String(w)} / ${String(h)}` }}
                      />
                    );
                  })}
```
with
```tsx
                  {BODY_FAT_CHART_VIEWS.map((view) => {
                    const { w, h } = BODY_FAT_CHART_CROP[view];
                    // No file for this sex, percentage and view: no figure, as before.
                    return bodyFatChartLoader(sex, pct, view) === undefined ? null : (
                      <BodyFatFigure
                        key={view}
                        sex={sex}
                        pct={pct}
                        view={view}
                        className="wiz-chart-fig"
                        style={{ flexGrow: w, aspectRatio: `${String(w)} / ${String(h)}` }}
                      />
                    );
                  })}
```

- [ ] **Step 6: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/components/useLazyMarkup.test.tsx src/ui/components/InlineArt.test.tsx src/ui/views/atlasArt.test.tsx src/ui/views/AtlasView.test.tsx src/ui/setup/setupArt.test.ts`
Then: `npx vitest run --maxWorkers=1 src/ui/setup/SetupWizard.test.tsx`
Expected: PASS (`useLazyMarkup.test.tsx` 5; `setupArt.test.ts` 5).
Run: `npx tsc -b --force && npx eslint ./src && npm run build`
Expected: clean; `ls dist/assets | grep -c '^bf-'` prints 24.

- [ ] **Step 7: Commit**

```bash
git add -- src/ui/components/useLazyMarkup.ts src/ui/components/useLazyMarkup.test.tsx src/ui/views/atlasArt.tsx src/ui/setup/setupArt.tsx src/ui/setup/setupArt.test.ts src/ui/setup/SetupWizard.tsx src/ui/setup/SetupWizard.test.tsx
git commit -m "perf(art): body-fat drawings as lazy chunks; lazy art retries in place online or on resume (E09, E12)"
```

---

### Task 8: Backup by share sheet or download; the gate needs proof from the user (B07)

**Files:**
- Create: `src/app/saveFile.ts`, `src/app/saveFile.test.ts`
- Modify: `src/app/download.ts`, `src/app/download.test.ts`, `src/ui/components/ConfirmDestructive.tsx`, `src/ui/components/ConfirmDestructive.test.tsx`, `src/ui/settings/DataSection.test.tsx`, `src/ui/views/ExportView.tsx` (`downloadState`), `src/ui/views/ExportView.test.tsx` (`backUpInPanel`), `src/content/copy.ts`, `src/content/__fixtures__/limelight-resolved.json`

**Interfaces:**
- Produces: `shareableFile(filename: string, text: string, mime: string): File | null`, `shareFile(file: File): Promise<'shared' | 'cancelled' | 'failed'>`, `saveFile(filename: string, text: string, mime?: string): { route: 'download' } | { route: 'share'; outcome: Promise<ShareOutcome> }`; `DOWNLOAD_URL_LIFETIME_MS = 60_000` in `download.ts`; copy key `label.backupSaved`.

Design (B07): `downloadText` never throws, so `ConfirmDestructive` opened its gate whether or not a file was kept, and revoked the object URL synchronously after `click()`. Now: (1) where `navigator.canShare({ files })` says yes, the system share sheet opens (the route to Save to Files on an installed iPhone [U: iOS not tested]); Chromium shares only an allow-list of file types and is reported to refuse `application/json` [community: Stack Overflow 70243790, "Permission denied" for application/json], so Android falls through to the download; (2) a resolved share opens the gate (a target took the file); a cancelled sheet leaves it shut; (3) a download opens the gate only after the user ticks "I Have the Backup File"; (4) the object URL lives 60 s [ms, engineering bound] so a browser that starts the download asynchronously still reads it. The decision is synchronous inside the tap (share requires user activation). `src/app/App.tsx`'s two emergency banner exports stay plain downloads (no gate behind them). Rejected: treating a returned call as proof (B07 itself); asking for the tick after a completed share too (the share sheet's completion is the platform's only signal; one more tap for no information).

- [ ] **Step 1: Write the failing tests**

Create `src/app/saveFile.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadText } from './download';
import { saveFile, shareableFile, shareFile } from './saveFile';

vi.mock('./download', () => ({ downloadText: vi.fn() }));

function stubShare(share: () => Promise<void>, canShare = true): void {
  Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => canShare), configurable: true });
  Object.defineProperty(navigator, 'share', { value: vi.fn(share), configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
  vi.clearAllMocks();
});

describe('saveFile (audit B07)', () => {
  it('downloads where the browser cannot share files (jsdom, most desktops)', () => {
    expect(shareableFile('a.json', '{}', 'application/json')).toBeNull();
    expect(saveFile('a.json', '{}')).toEqual({ route: 'download' });
    expect(downloadText).toHaveBeenCalledWith('a.json', '{}', 'application/json');
  });

  it('downloads when the browser refuses this file type (Chromium and JSON)', () => {
    stubShare(() => Promise.resolve(), false);
    expect(saveFile('a.json', '{}').route).toBe('download');
  });

  it('shares when it can, and downloads nothing', async () => {
    stubShare(() => Promise.resolve());
    const result = saveFile('a.json', '{"x":1}');
    expect(result.route).toBe('share');
    if (result.route === 'share') await expect(result.outcome).resolves.toBe('shared');
    expect(downloadText).not.toHaveBeenCalled();
    const shared = vi.mocked(navigator.share).mock.calls[0]?.[0];
    expect(shared?.files?.[0]?.name).toBe('a.json');
  });

  it('reports a closed sheet as cancelled, and does not download behind the user', async () => {
    stubShare(() => Promise.reject(new DOMException('closed', 'AbortError')));
    const result = saveFile('a.json', '{}');
    if (result.route === 'share') await expect(result.outcome).resolves.toBe('cancelled');
    expect(downloadText).not.toHaveBeenCalled();
  });

  it('falls back to the download when the share itself fails', async () => {
    stubShare(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    const result = saveFile('a.json', '{}');
    if (result.route === 'share') await expect(result.outcome).resolves.toBe('failed');
    expect(downloadText).toHaveBeenCalledWith('a.json', '{}', 'application/json');
  });

  it('shareFile maps AbortError to cancelled and anything else to failed', async () => {
    stubShare(() => Promise.reject(new Error('boom')));
    await expect(shareFile(new File(['x'], 'x.json'))).resolves.toBe('failed');
  });
});
```
In `src/app/download.test.ts`: change the `beforeEach` to also call `vi.useFakeTimers();`, add `vi.useRealTimers();` to `afterEach`, import `DOWNLOAD_URL_LIFETIME_MS` from `./download`, and replace
```ts
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fti/1');
```
with
```ts
    // Audit B07: revoked after a delay, not synchronously, so a download that starts
    // asynchronously (reported for Safari [U]) can still read the blob.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DOWNLOAD_URL_LIFETIME_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fti/1');
```
In `src/ui/components/ConfirmDestructive.test.tsx`:
- after the `function button(name: string): HTMLElement { ... }` helper add:
```tsx

/** Download the backup and confirm it was kept: the full gate on a browser with no file share. */
function takeBackup(): void {
  fireEvent.click(button(copyFor('limelight', 'button.downloadBackup')));
  fireEvent.click(screen.getByLabelText(copyFor('limelight', 'label.backupSaved')));
}
```
- in the three tests 'releases the action once the backup is taken and the word matches exactly', 'calls onConfirm exactly once and never cancels' and 'compares the typed word case-sensitively against the word it was given', replace `fireEvent.click(button(copyFor('limelight', 'button.downloadBackup')));` with `takeBackup();` (leave 'holds the action after the backup when the typed word does not match' and 'calls onCancel and never confirms' as they are: both pass with the tick missing)
- replace the test 'hands the export the filename and the text it was given, and says so' with:
```tsx
  it('hands the export the filename and the text it was given, and says so once confirmed', () => {
    renderPanel();
    fireEvent.click(button(copyFor('limelight', 'button.downloadBackup')));
    expect(downloadText).toHaveBeenCalledTimes(1);
    expect(downloadText).toHaveBeenCalledWith('fti-state-2026-09-01.json', BACKUP, 'application/json');
    fireEvent.click(screen.getByLabelText(copyFor('limelight', 'label.backupSaved')));
    expect(screen.getByText(copyFor('limelight', 'status.exportTaken'))).toBeTruthy();
    expect(screen.queryByText(copyFor('limelight', 'advice.exportBeforeConfirm'))).toBeNull();
  });

  it('does not treat a returned download as a backup (audit B07)', () => {
    renderPanel();
    fireEvent.click(button(copyFor('limelight', 'button.downloadBackup')));
    type(WORD);
    expect(button(copyFor('limelight', 'button.wipeConfirm'))).toBeDisabled();
    expect(screen.getByText(copyFor('limelight', 'advice.exportBeforeConfirm'))).toBeTruthy();
    fireEvent.click(screen.getByLabelText(copyFor('limelight', 'label.backupSaved')));
    expect(button(copyFor('limelight', 'button.wipeConfirm'))).toBeEnabled();
  });
```
- append:
```tsx

describe('ConfirmDestructive: the share sheet (audit B07)', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
  });

  function stubShare(share: () => Promise<void>): void {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: vi.fn(share), configurable: true });
  }

  it('opens the gate when the share sheet takes the file, with no download and no tick', async () => {
    stubShare(() => Promise.resolve());
    renderPanel();
    fireEvent.click(button(copyFor('limelight', 'button.downloadBackup')));
    expect(await screen.findByText(copyFor('limelight', 'status.exportTaken'))).toBeTruthy();
    expect(downloadText).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(copyFor('limelight', 'label.backupSaved'))).toBeNull();
    type(WORD);
    expect(button(copyFor('limelight', 'button.wipeConfirm'))).toBeEnabled();
  });

  it('keeps the gate shut when the share sheet is closed', async () => {
    stubShare(() => Promise.reject(new DOMException('closed', 'AbortError')));
    renderPanel();
    fireEvent.click(button(copyFor('limelight', 'button.downloadBackup')));
    await waitFor(() => {
      expect(button(copyFor('limelight', 'button.downloadBackup'))).toBeEnabled();
    });
    type(WORD);
    expect(button(copyFor('limelight', 'button.wipeConfirm'))).toBeDisabled();
    expect(downloadText).not.toHaveBeenCalled();
  });
});
```
and add `waitFor` to the file's `@testing-library/react` import.
In `src/ui/settings/DataSection.test.tsx`, before `function typeWord(value: string): void {` add:
```tsx
/** Audit B07: the user confirms the downloaded backup before the gate opens. */
function confirmSaved(): void {
  fireEvent.click(within(panel()).getByLabelText(copyFor('limelight', 'label.backupSaved')));
}

```
and after every line `    click(copyFor('limelight', 'button.downloadBackup'));` (six at HEAD) add a line `    confirmSaved();`.
In `src/ui/views/ExportView.test.tsx`, in `function backUpInPanel(): void {`, after its `fireEvent.click(...button.downloadBackup...)` line add:
```ts
  // Audit B07: a download is confirmed by the user before the gate opens.
  fireEvent.click(within(replacePanel()).getByLabelText(copyFor('limelight', 'label.backupSaved')));
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=1 src/app/saveFile.test.ts src/app/download.test.ts src/ui/components/ConfirmDestructive.test.tsx`
Expected: FAIL (`./saveFile` missing; the revoke is synchronous; no `label.backupSaved`).

- [ ] **Step 3: Implement**

In `src/content/copy.ts` replace the union line `  | 'status.exportTaken'` with
```ts
  | 'status.exportTaken'
  | 'label.backupSaved'
```
and the table row `  'status.exportTaken': 'Backup downloaded.',` with
```ts
  'status.exportTaken': 'Backup downloaded.',
  // Audit B07: the user's own word that the downloaded backup exists (ConfirmDestructive).
  'label.backupSaved': 'I Have the Backup File',
```
Run:
```bash
node -e "const fs=require('fs');const p='src/content/__fixtures__/limelight-resolved.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));Object.assign(d,{'label.backupSaved':'I Have the Backup File'});fs.writeFileSync(p,JSON.stringify(d)+'\n');"
```
In `src/app/download.ts`, before `export function downloadText(` add:
```ts
/**
 * [ms] How long the object URL outlives the click (audit B07). Revoking it synchronously, as
 * this helper did, can cancel a download a browser starts asynchronously [U: reported for
 * Safari, not tested here]. The cost is the blob held in memory for this long.
 */
export const DOWNLOAD_URL_LIFETIME_MS = 60_000;

```
replace the last line of `downloadText`, `  URL.revokeObjectURL(url);`, with
```ts
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, DOWNLOAD_URL_LIFETIME_MS);
```
and in its doc comment replace "and it is revoked immediately after the synthetic click: the\n * click has already been dispatched by then, so the download is committed." with "and it is revoked DOWNLOAD_URL_LIFETIME_MS after the synthetic click (audit B07)."

Create `src/app/saveFile.ts`:
```ts
// src/app/saveFile.ts
//
// Audit B07: how a backup leaves the device. Two paths, decided synchronously inside the tap
// (navigator.share requires user activation):
//
//  - SHARE (files). Where the browser says it can share this exact file
//    (`navigator.canShare({ files })`), the system share sheet opens: on an installed iPhone app
//    this is the route to Save to Files, where an `<a download>` may open a preview with no way
//    back [U: iOS not tested]. Chromium shares only an allow-list of file types and is reported
//    to refuse application/json [community], so Android falls through to the download.
//  - DOWNLOAD. `downloadText` (src/app/download.ts), everywhere else.
//
// Neither path proves a file was kept. A resolved share means a share target accepted it; a
// download that returned means only that the browser was asked. ConfirmDestructive therefore
// treats only 'shared' as done and asks the user to confirm a download.
import { downloadText } from './download';

export type ShareOutcome = 'shared' | 'cancelled' | 'failed';

/** The file to share, or null when this browser cannot share it (then: download). */
export function shareableFile(filename: string, text: string, mime: string): File | null {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return null;
  const file = new File([text], filename, { type: mime });
  try {
    return navigator.canShare({ files: [file] }) ? file : null;
  } catch {
    return null;
  }
}

/** Opens the share sheet. AbortError is the user closing it; anything else is a failure. */
export async function shareFile(file: File): Promise<ShareOutcome> {
  try {
    await navigator.share({ files: [file], title: file.name });
    return 'shared';
  } catch (error) {
    return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/**
 * Starts saving `text` from inside a tap: shares when it can, else downloads. Returns the route
 * taken and, for a share, its outcome. A failed share (not a cancel) falls back to the download.
 */
export function saveFile(
  filename: string,
  text: string,
  mime: string = 'application/json',
): { route: 'download' } | { route: 'share'; outcome: Promise<ShareOutcome> } {
  const file = shareableFile(filename, text, mime);
  if (file === null) {
    downloadText(filename, text, mime);
    return { route: 'download' };
  }
  const outcome = shareFile(file).then((result) => {
    if (result === 'failed') downloadText(filename, text, mime);
    return result;
  });
  return { route: 'share', outcome };
}
```
In `src/ui/components/ConfirmDestructive.tsx`:
- replace `import { downloadText } from '../../app/download';` with `import { saveFile } from '../../app/saveFile';`
- replace
```ts
  const [exported, setExported] = useState(false);
  const [typed, setTyped] = useState('');
  const fieldId = useId();
  const t = useCopy();

  const armed = exported && typed === word;
```
with
```ts
  /*
   * Audit B07: what became of the backup. 'shared' is the share sheet resolving (a target took
   * the file); 'downloaded' is only the browser being asked, so the user confirms it below.
   */
  const [taken, setTaken] = useState<'none' | 'pending' | 'shared' | 'downloaded'>('none');
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [typed, setTyped] = useState('');
  const fieldId = useId();
  const savedId = useId();
  const t = useCopy();

  const exported = taken === 'shared' || (taken === 'downloaded' && savedConfirmed);
  const armed = exported && typed === word;
```
- replace
```tsx
        onClick={() => {
          // Order matters: a throw from the download leaves `exported` false.
          downloadText(exportFilename, exportText());
          setExported(true);
        }}
```
with
```tsx
        disabled={taken === 'pending'}
        onClick={() => {
          // Order matters: a throw from exportText or the download leaves the gate shut.
          const result = saveFile(exportFilename, exportText());
          if (result.route === 'download') {
            setTaken('downloaded');
            return;
          }
          setTaken('pending');
          void result.outcome.then((outcome) => {
            // A cancelled sheet saved nothing; a failed one fell back to the download.
            setTaken(outcome === 'shared' ? 'shared' : outcome === 'failed' ? 'downloaded' : 'none');
          });
        }}
```
- after the `<p className="confirm-destructive-note" aria-live="polite">...</p>` element add:
```tsx

      {/* B07: a returned download call is not proof of a file; the user says they have it. */}
      {taken === 'downloaded' && (
        <div className="confirm-destructive-saved">
          <input
            id={savedId}
            type="checkbox"
            checked={savedConfirmed}
            onChange={(e) => {
              setSavedConfirmed(e.target.checked);
            }}
          />
          <label htmlFor={savedId}>{t('label.backupSaved')}</label>
        </div>
      )}
```
- in the component doc comment replace property 2 ("2. The export is marked taken only after `downloadText` has returned. ... the entire reason the gate exists.") with:
```ts
 *  2. The export is marked taken only on proof (audit B07): a share sheet that resolved, or a
 *     download the user confirms with a tick. A download call that returned proves nothing
 *     (`downloadText` never throws), and a cancelled share sheet leaves the gate shut.
```
In `src/ui/views/ExportView.tsx` add `import { saveFile } from '../../app/saveFile';` after `import { downloadText } from '../../app/download';` and replace
```ts
  const downloadState = (): void => {
    downloadText(stateFilename, useAppStore.getState().exportJson());
  };
```
with
```ts
  const downloadState = (): void => {
    // Audit B07: the share sheet where this browser can share the file (iPhone: Save to Files).
    saveFile(stateFilename, useAppStore.getState().exportJson());
  };
```

- [ ] **Step 4: Run**

Run: `npx vitest run --maxWorkers=1 src/app src/ui/components/ConfirmDestructive.test.tsx src/ui/settings src/ui/views/ExportView.test.tsx src/content`
Expected: PASS (`saveFile.test.ts` 6 tests; `ConfirmDestructive.test.tsx` gains 3; planning measured 16 gate tests failing without the confirm step and all 41 passing with it). `src/app/LoadRecovery.test.tsx` (P1) asserts only that the wipe is disabled: passes unchanged.
Run: `npx tsc -b --force && npx eslint ./src`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -- src/app/saveFile.ts src/app/saveFile.test.ts src/app/download.ts src/app/download.test.ts src/ui/components/ConfirmDestructive.tsx src/ui/components/ConfirmDestructive.test.tsx src/ui/settings/DataSection.test.tsx src/ui/views/ExportView.tsx src/ui/views/ExportView.test.tsx src/content/copy.ts src/content/__fixtures__/limelight-resolved.json
git commit -m "fix(export): share sheet where the browser can share the file; the backup gate needs a completed share or the user's word (B07)"
```

---

### Task 9: Install guidance for everyone not installed; Android install prompt (R8, E04)

**Files:**
- Create: `src/app/installPrompt.ts`, `src/app/installPrompt.test.ts`, `src/app/InstallCard.tsx`, `src/app/InstallCard.test.tsx`
- Modify: `src/ui/components/InstallGuide.tsx` (`reason` prop, `useId`), `src/app/App.tsx` (one import, one JSX line), `src/main.tsx` (one import, one call), `src/app/appShell.css` (append), `src/domain/types.ts`, `src/domain/schema.ts`, `src/domain/arbitraries.ts`, `src/domain/schema.test.ts`, `src/content/copy.ts`, `src/content/__fixtures__/limelight-resolved.json`, `e2e/p4b-platform.spec.ts` (append)

**Interfaces:**
- Consumes: `useActiveProfile()` (`src/store/selectors.ts`), `useOpenAssignment()` (P1, `src/store/selectors.ts`), `setUi(patch: Partial<UiPrefs>)`.
- Produces: `runsStandalone(win?: Window): boolean`, `startInstallPromptCapture(win?: Window): () => void`, `promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'>`, `useInstallState(): { standalone: boolean; canPrompt: boolean }` in `src/app/installPrompt.ts` (Task 10 uses `runsStandalone`); `InstallCard(): ReactElement | null`; `UiPrefs.installNudgeDismissed?: true | undefined`; `InstallGuide(props: { reason?: CopyKey | null })`; copy key `button.installApp`.

Design (E04: the only install guidance rendered inside the reminder panel, reachable only on a build with the Worker configured, which the live build is not): a card shown on every view once setup is done, while the app is not running standalone, no session is open, and the user has not dismissed it (persisted in `ui.installNudgeDismissed`, device-level, optional field, rule 7). On Chromium the captured `beforeinstallprompt` (MDN: "Limited availability", Chromium only, https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event, read 2026-11-04) drives an Install App button; elsewhere the existing written steps (`InstallGuide`) show, without the reminder-specific sentence. Standalone = `display-mode: standalone` or iOS `navigator.standalone`. The capture starts in `main.tsx` because Chromium may fire the event before the first render. The reminder panel keeps its own guide for `needs-install`. `InstallGuide`'s fixed heading id becomes `useId()` (card and panel can be on screen together). Rejected: Today only (TodayView is edited by P1, P3 and P5; one line in App.tsx reaches every view); showing it during setup (the wizard is the whole screen); a non-dismissible card (the owner's "too verbose" feedback).

- [ ] **Step 1: Write the failing tests**

Create `src/app/installPrompt.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { promptInstall, runsStandalone, startInstallPromptCapture, useInstallState } from './installPrompt';

function promptEvent(outcome: 'accepted' | 'dismissed'): Event {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(e, { prompt: vi.fn(() => Promise.resolve({ outcome })) });
  return e;
}

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
});

describe('install prompt capture (spec R8, audit E04)', () => {
  it('is not standalone in a browser tab (jsdom has no display-mode match)', () => {
    expect(runsStandalone()).toBe(false);
  });

  it("holds Chromium's event, cancels the mini-infobar, and offers the prompt", () => {
    stop = startInstallPromptCapture();
    const { result } = renderHook(() => useInstallState());
    expect(result.current.canPrompt).toBe(false);
    const e = promptEvent('accepted');
    act(() => {
      window.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(true);
    expect(result.current.canPrompt).toBe(true);
  });

  it('prompts once: the event is single-use', async () => {
    stop = startInstallPromptCapture();
    window.dispatchEvent(promptEvent('dismissed'));
    await expect(promptInstall()).resolves.toBe('dismissed');
    await expect(promptInstall()).resolves.toBe('unavailable');
  });

  it('reads as standalone once the app is installed', () => {
    stop = startInstallPromptCapture();
    const { result } = renderHook(() => useInstallState());
    act(() => {
      window.dispatchEvent(promptEvent('accepted'));
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current).toEqual({ standalone: true, canPrompt: false });
  });

  it('reads iOS navigator.standalone', () => {
    const win = { matchMedia: undefined, navigator: { standalone: true } } as unknown as Window;
    expect(runsStandalone(win)).toBe(true);
  });
});
```
Create `src/app/InstallCard.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { copyFor } from '../content/copy';
import { useAppStore } from '../store';
import { installFakeStorage } from '../store/testStorage';
import { MONDAY, NOW_MS, PROFILE_ID, seedState } from '../test/scheduleFixtures';
import { InstallCard } from './InstallCard';
import { startInstallPromptCapture } from './installPrompt';

let stop: (() => void) | null = null;

beforeEach(() => {
  installFakeStorage();
  useAppStore.setState(seedState({ labels: ['Push'], weekdays: [1], startedOn: MONDAY }));
  stop = startInstallPromptCapture();
});

afterEach(() => {
  stop?.();
  stop = null;
});

const heading = (): HTMLElement | null =>
  screen.queryByRole('heading', { name: copyFor('limelight', 'hero.installHomeScreen') });

describe('InstallCard (spec R8, audit E04)', () => {
  it('shows the written steps in a browser tab, without the reminder sentence', () => {
    render(<InstallCard />);
    expect(heading()).toBeInTheDocument();
    expect(screen.getByText(copyFor('limelight', 'status.installIosShare'))).toBeInTheDocument();
    expect(screen.queryByText(copyFor('limelight', 'advice.installOnlyInstalledApp'))).toBeNull();
  });

  it('offers the Android install prompt when Chromium provides one', async () => {
    const prompt = vi.fn(() => Promise.resolve({ outcome: 'accepted' as const }));
    render(<InstallCard />);
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.installApp') }));
      await Promise.resolve();
    });
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('stays dismissed: the choice is stored in the document', () => {
    render(<InstallCard />);
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.dismiss') }));
    expect(heading()).toBeNull();
    expect(useAppStore.getState().ui.installNudgeDismissed).toBe(true);
  });

  it('is absent before setup and while a session is open', () => {
    useAppStore.setState({ activeProfileId: null });
    const before = render(<InstallCard />);
    expect(heading()).toBeNull();
    before.unmount();
    useAppStore.setState(seedState({ labels: ['Push'], weekdays: [1], startedOn: MONDAY }));
    useAppStore.setState({
      assignments: {
        [PROFILE_ID]: [
          {
            date: MONDAY,
            sessionId: 's-0',
            sourceIndex: 0,
            status: 'in-progress',
            startedAt: NOW_MS, // [ms] epoch, UTC
            completedAt: null,
            skipReason: null,
          },
        ],
      },
    });
    render(<InstallCard />);
    expect(heading()).toBeNull();
  });

  it('is absent once the app is installed', () => {
    render(<InstallCard />);
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(heading()).toBeNull();
  });
});
```
(If P1 removed `skipReason` from `SessionAssignment`, drop that line; `npx tsc` says.)
In `src/domain/schema.test.ts`, after the `describe('UiPrefs.warmupNoticeDismissedByProfile (owner 2026-10-18, rule 7)', ...)` block, add:
```ts

describe('UiPrefs.installNudgeDismissed (spec R8, rule 7)', () => {
  it('keeps the dismissal through a save and load', () => {
    const doc = storedBeforeWarmupDismissal();
    doc.ui = { ...(doc.ui as Record<string, unknown>), installNudgeDismissed: true };
    const result = parseState(throughJson(doc));
    expect(result.ok ? null : result.error).toBeNull();
    if (!result.ok) return;
    expect(result.state.ui.installNudgeDismissed).toBe(true);
  });

  it('loads a document stored without the field, unchanged', () => {
    const stored = storedBeforeWarmupDismissal();
    expect('installNudgeDismissed' in (stored.ui as Record<string, unknown>)).toBe(false);
    const result = parseState(stored);
    expect(result.ok ? null : result.error).toBeNull();
    if (!result.ok) return;
    expect(result.state).toStrictEqual(stored);
  });

  it('refuses any value but true', () => {
    const doc = storedBeforeWarmupDismissal();
    doc.ui = { ...(doc.ui as Record<string, unknown>), installNudgeDismissed: false };
    expect(parseState(doc).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=1 src/app/installPrompt.test.ts src/app/InstallCard.test.tsx src/domain/schema.test.ts`
Expected: FAIL (modules missing; the schema strips the unknown key so the first schema test fails).

- [ ] **Step 3: Schema field (rule 7: optional, additive)**

In `src/domain/types.ts`, in the comment block above `export interface UiPrefs`, after the `warmupNoticeDismissedByProfile` lines add:
```ts
// installNudgeDismissed: this device's user dismissed the install card (spec R8,
// src/app/InstallCard.tsx). OPTIONAL `true`, absent until dismissed, exactly as above.
```
and replace `warmupNoticeDismissedByProfile?: Record<string, true> | undefined; }` with `warmupNoticeDismissedByProfile?: Record<string, true> | undefined; installNudgeDismissed?: true | undefined; }`.
In `src/domain/schema.ts` replace
```ts
  warmupNoticeDismissedByProfile: z.record(z.string(), z.literal(true)).optional(),
});
```
with
```ts
  warmupNoticeDismissedByProfile: z.record(z.string(), z.literal(true)).optional(),
  /*
   * Additive and OPTIONAL (spec R8). The install card was dismissed on this device. Same shape
   * of fact as the warm-up dismissal above: `true` or absent, so an old document or export
   * parses to exactly what was stored (rule 7). CURRENT_SCHEMA_VERSION stays 3.
   */
  installNudgeDismissed: z.literal(true).optional(),
});
```
In `src/domain/arbitraries.ts` replace
```ts
  warmupNoticeDismissedByProfile: fc.option(
    fc.dictionary(anyId, fc.constant(true as const), { maxKeys: 2 }),
    { nil: undefined },
  ),
```
with
```ts
  warmupNoticeDismissedByProfile: fc.option(
    fc.dictionary(anyId, fc.constant(true as const), { maxKeys: 2 }),
    { nil: undefined },
  ),
  // The install card's dismissal: optional `true`, absence generated too (spec R8).
  installNudgeDismissed: fc.option(fc.constant(true as const), { nil: undefined }),
```

- [ ] **Step 4: Copy key**

In `src/content/copy.ts` replace the union line `  | 'status.installAndroidOpen'` with
```ts
  | 'status.installAndroidOpen'
  | 'button.installApp'
```
and the row `  'status.installAndroidOpen': 'Open the app from the home screen icon.',` with
```ts
  'status.installAndroidOpen': 'Open the app from the home screen icon.',
  // Spec R8: Chromium's own install dialog, from the install card (src/app/InstallCard.tsx).
  'button.installApp': 'Install App',
```
Run:
```bash
node -e "const fs=require('fs');const p='src/content/__fixtures__/limelight-resolved.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));Object.assign(d,{'button.installApp':'Install App'});fs.writeFileSync(p,JSON.stringify(d)+'\n');"
```

- [ ] **Step 5: Implement**

Create `src/app/installPrompt.ts`:
```ts
// src/app/installPrompt.ts
//
// Spec R8 (audit E04): install guidance that does not depend on reminders.
//
//  - STANDALONE. The app is already installed when `display-mode: standalone` matches (Chromium,
//    and iOS Home Screen apps [U: iOS not tested]) or `navigator.standalone` is true (older iOS).
//    Then no guidance is shown at all.
//  - ANDROID. Chromium fires `beforeinstallprompt` when the app is installable; the event is held
//    (preventDefault stops the mini-infobar) so the card's Install App button can call prompt()
//    from a tap. MDN marks the event "Limited availability" (Chromium only): Safari and Firefox
//    never fire it, and there the card shows the written steps instead.
//    https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event (read 2026-11-04)
//  - `appinstalled` clears the held event: the card disappears without a reload.
//
// Module state, not the store: none of it is a fact about the user's data, and the event must be
// captured in main.tsx before React mounts (Chromium may fire it before the first render).
import { useSyncExternalStore } from 'react';

/** The part of Chromium's BeforeInstallPromptEvent this module uses (not in lib.dom). */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  /** The app runs installed (standalone). */
  standalone: boolean;
  /** Chromium offered an install prompt this page life, not yet used. */
  canPrompt: boolean;
}

let held: InstallPromptEvent | null = null;
let installed = false;
let snapshot: InstallState = { standalone: false, canPrompt: false };
const listeners = new Set<() => void>();

function isInstallPromptEvent(e: Event): e is InstallPromptEvent {
  return typeof Reflect.get(e, 'prompt') === 'function';
}

export function runsStandalone(win: Window = window): boolean {
  const media = typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
  // Older iOS exposes only this non-standard flag.
  return media || Reflect.get(win.navigator, 'standalone') === true;
}

function publish(win: Window): void {
  snapshot = { standalone: installed || runsStandalone(win), canPrompt: held !== null };
  for (const listener of listeners) listener();
}

/** Called once from main.tsx. Returns the teardown (tests). */
export function startInstallPromptCapture(win: Window = window): () => void {
  const onPrompt = (e: Event): void => {
    if (!isInstallPromptEvent(e)) return;
    e.preventDefault();
    held = e;
    publish(win);
  };
  const onInstalled = (): void => {
    held = null;
    installed = true;
    publish(win);
  };
  win.addEventListener('beforeinstallprompt', onPrompt);
  win.addEventListener('appinstalled', onInstalled);
  publish(win);
  return () => {
    win.removeEventListener('beforeinstallprompt', onPrompt);
    win.removeEventListener('appinstalled', onInstalled);
    held = null;
    installed = false;
    snapshot = { standalone: false, canPrompt: false };
  };
}

/** Shows Chromium's install dialog. Must run inside a tap. The event is single-use. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = held;
  if (event === null) return 'unavailable';
  held = null;
  publish(window);
  try {
    const choice = await event.prompt();
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): InstallState {
  return snapshot;
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
```
In `src/ui/components/InstallGuide.tsx`:
- replace `import { type JSX } from 'react';` with `import { useId, type JSX } from 'react';` and add `import type { CopyKey } from '../../content/copy';`
- replace the signature and body head
```tsx
export function InstallGuide(): JSX.Element {
  const t = useCopy();

  return (
    <aside className="fti-reminders-install" aria-labelledby="fti-install-heading">
      <h3 id="fti-install-heading">{t('hero.installHomeScreen')}</h3>
      <p>{t('advice.installOnlyInstalledApp')}</p>
```
with
```tsx
export function InstallGuide(props: {
  /**
   * Why install, under the heading. The reminder panel keeps the default (notifications need an
   * installed app); the install card (spec R8) passes null and states no reason.
   */
  reason?: CopyKey | null;
} = {}): JSX.Element {
  const t = useCopy();
  // Unique per mount: the install card and the reminder panel's guide can be on screen together.
  const headingId = useId();
  const reason = props.reason === undefined ? 'advice.installOnlyInstalledApp' : props.reason;

  return (
    <aside className="fti-reminders-install" aria-labelledby={headingId}>
      <h3 id={headingId}>{t('hero.installHomeScreen')}</h3>
      {reason !== null && <p>{t(reason)}</p>}
```
Create `src/app/InstallCard.tsx`:
```tsx
// src/app/InstallCard.tsx
//
// Spec R8 (audit E04): install guidance for everyone who has not installed, not only for a build
// with reminders. Mounted once in App.tsx's <main>, so it reaches every view. Shown after setup,
// while not standalone, with no session open (it must not push the set rows down mid-workout),
// until dismissed (ui.installNudgeDismissed, stored in the document).
import { type ReactElement } from 'react';
import { useCopy } from '../content/useCopy';
import { useAppStore } from '../store';
import { useActiveProfile, useOpenAssignment } from '../store/selectors';
import { InstallGuide } from '../ui/components/InstallGuide';
import { promptInstall, useInstallState } from './installPrompt';

export function InstallCard(): ReactElement | null {
  const t = useCopy();
  const profile = useActiveProfile();
  const open = useOpenAssignment();
  const dismissed = useAppStore((s) => s.ui.installNudgeDismissed === true);
  const { standalone, canPrompt } = useInstallState();
  if (profile === null || open !== null || dismissed || standalone) return null;

  return (
    <section className="install-card">
      {canPrompt ? (
        <>
          <h3>{t('hero.installHomeScreen')}</h3>
          <button
            type="button"
            onClick={() => {
              void promptInstall();
            }}
          >
            {t('button.installApp')}
          </button>
        </>
      ) : (
        <InstallGuide reason={null} />
      )}
      <button
        type="button"
        onClick={() => {
          useAppStore.getState().setUi({ installNudgeDismissed: true });
        }}
      >
        {t('button.dismiss')}
      </button>
    </section>
  );
}
```
In `src/app/App.tsx` (or the file holding `<UpdatePrompt />` after P4a): after `import { UpdatePrompt } from './UpdatePrompt';` add `import { InstallCard } from './InstallCard';`, and replace the line `              <UpdatePrompt />` with
```tsx
              <UpdatePrompt />
              {/* Spec R8: install guidance on every view after setup, until dismissed. */}
              <InstallCard />
```
In `src/main.tsx`: after `import { startUpdateController } from './app/updateController';` add `import { startInstallPromptCapture } from './app/installPrompt';`, and after the line `startPersistence();` add:
```ts

// Spec R8: Chromium may fire beforeinstallprompt before the first render; hold it from here.
startInstallPromptCapture();
```
Append to `src/app/appShell.css`:
```css

/* The install card (spec R8, src/app/InstallCard.tsx): informational, so the update banner's
 * accent edge rather than danger. Tokens only. */
.install-card {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  margin-bottom: 18px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  background: var(--bg-2);
  font-family: var(--sans);
  font-size: 13.5px;
  color: var(--text-2);
}

.install-card h3 {
  margin: 0;
  flex: 1 1 100%;
  font-size: 15px;
  color: var(--text);
}

.install-card .fti-reminders-install {
  flex: 1 1 100%;
}

.install-card button {
  font: inherit;
  min-height: 2.75rem;
  padding: 6px 12px;
  border: 1px solid var(--ink);
  background: var(--accent);
  color: var(--ink);
  cursor: pointer;
}
```

- [ ] **Step 6: Run**

Run: `npx vitest run --maxWorkers=1 src/app src/domain src/content src/ui/components/InstallGuide.test.tsx src/ui/components/ReminderSettingsPanel.test.tsx src/ui/styles`
Expected: PASS (`installPrompt.test.ts` 5, `InstallCard.test.tsx` 5, `schema.test.ts` +3). If an `App.test.tsx` test now finds two elements by a query the card also matches (heading text, a `Dismiss` button), scope that query to the view (`within(screen.getByRole('main'))` does not exclude it; use the view's own container) or seed `ui.installNudgeDismissed: true` in that test's setup; say which in the commit body.
Run: `npx tsc -b --force && npx eslint ./src`
Expected: clean.

- [ ] **Step 7: E2E (the runner runs it)**

Append to `e2e/p4b-platform.spec.ts` (add `flushWrites` and `readDocument` to the `./support/app` import):
```ts

test('R8: the install card shows in a browser tab after setup and stays dismissed', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  const page = await openApp(context);
  const card = page.locator('section.install-card');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Dismiss' }).click();
  await expect(card).toHaveCount(0);
  await flushWrites(page);
  expect((await readDocument(page)).ui.installNudgeDismissed).toBe(true);
  const again = await openApp(context);
  await expect(again.locator('section.install-card')).toHaveCount(0);
});
```
(`'Dismiss'` is `copyFor('limelight', 'button.dismiss')`, measured from `src/content/copy.ts` at HEAD; no limelight override.) Runner: `npm run e2e` (whole suite: the card now sits above every view in every spec; a spec that breaks on it is reported, not patched around).

- [ ] **Step 8: Commit**

```bash
git add -- src/app/installPrompt.ts src/app/installPrompt.test.ts src/app/InstallCard.tsx src/app/InstallCard.test.tsx src/ui/components/InstallGuide.tsx src/app/App.tsx src/main.tsx src/app/appShell.css src/domain/types.ts src/domain/schema.ts src/domain/arbitraries.ts src/domain/schema.test.ts src/content/copy.ts src/content/__fixtures__/limelight-resolved.json e2e/p4b-platform.spec.ts
git commit -m "feat(pwa): install card for every non-installed user after setup, Android install prompt, dismissal stored (R8, E04)"
```

---

### Task 10: Ask the browser to keep the data; say what it answered (R8, E03, B09)

**Files:**
- Create: `src/app/storageDurability.ts`, `src/app/storageDurability.test.ts`
- Modify: `src/main.tsx` (one import, one call), `src/ui/settings/DataSection.tsx`, `src/ui/settings/DataSection.test.tsx`, `src/content/copy.ts`, `src/content/__fixtures__/limelight-resolved.json`, `docs/ARCHITECTURE.md` (Storage row)

**Interfaces:**
- Consumes: `runsStandalone()` (Task 9).
- Produces: `type Durability = 'unknown' | 'unsupported' | 'persistent' | 'best-effort'`; `readDurability(storage?)`, `requestDurability(storage?)`: `Promise<Durability>`; `startDurabilityWatch(deps: DurabilityWatchDeps): () => void`; `useDurability(): Durability`; `resetDurabilityForTest()`; copy keys `status.storagePersistent`, `status.storageBestEffort`, `status.storageUnknown`, `button.requestStorage`.

Facts (MDN, "Storage quotas and eviction criteria", https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria, read 2026-11-04): best-effort data "persists as long as the origin is below its quota, the device has enough storage space, and the user doesn't choose to delete the data"; persistent data "is only evicted, or deleted, if the user chooses to"; Firefox shows a permission popup for `persist()`; Safari and Chromium "automatically approve or deny the request based on the user's history of interaction with the site and do not show any prompts". MDN `StorageManager.persist()`: resolves true when granted; throws `TypeError` for an opaque origin or disabled storage.

Ruling (when to ask, so Firefox's popup never appears unprompted at a cold launch): ask (1) the moment setup creates the first profile in this page life, (2) at a launch whose stored document already has a profile when the app runs standalone (Chromium grants installed apps), (3) when the user taps Request Persistence in Settings > Data (shown only while best-effort). Every other launch only READS `persisted()`, which never prompts. Settings > Data states the answer. Rejected: asking at every launch (Firefox popup with no context); asking only on the button (R8: "after setup").

- [ ] **Step 1: Write the failing tests**

Create `src/app/storageDurability.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readDurability,
  requestDurability,
  resetDurabilityForTest,
  startDurabilityWatch,
  type DurabilityApi,
} from './storageDurability';

function storage(persisted: boolean, grant: boolean): Required<DurabilityApi> {
  return {
    persisted: vi.fn(() => Promise.resolve(persisted)),
    persist: vi.fn(() => Promise.resolve(grant)),
  };
}

afterEach(() => {
  resetDurabilityForTest();
});

describe('storage durability (spec R8, audit E03/B09)', () => {
  it('reads without asking', async () => {
    const s = storage(false, true);
    await expect(readDurability(s)).resolves.toBe('best-effort');
    expect(s.persist).not.toHaveBeenCalled();
  });

  it('reports the browser answer to a request', async () => {
    await expect(requestDurability(storage(false, true))).resolves.toBe('persistent');
    await expect(requestDurability(storage(false, false))).resolves.toBe('best-effort');
  });

  it('is unsupported without a StorageManager, and when persist throws', async () => {
    await expect(readDurability(undefined)).resolves.toBe('unsupported');
    const throwing: DurabilityApi = { persist: () => Promise.reject(new TypeError('opaque')) };
    await expect(requestDurability(throwing)).resolves.toBe('unsupported');
  });

  it('asks once setup creates the first profile, never at a tab launch before it', () => {
    const s = storage(false, true);
    let ready = false;
    let hasProfile = false;
    const listeners = new Set<() => void>();
    const notify = (): void => {
      for (const l of listeners) l();
    };
    const stop = startDurabilityWatch({
      ready: () => ready,
      hasProfile: () => hasProfile,
      subscribeStore: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      standalone: () => false,
      storage: s,
    });
    expect(s.persisted).not.toHaveBeenCalled(); // nothing before the document is read
    ready = true;
    notify();
    expect(s.persisted).toHaveBeenCalledTimes(1);
    expect(s.persist).not.toHaveBeenCalled();
    hasProfile = true; // setup completed
    notify();
    notify(); // a later store change asks nothing more
    expect(s.persist).toHaveBeenCalledTimes(1);
    stop();
  });

  it('only reads at a launch whose stored document already has a profile, in a tab', () => {
    const s = storage(false, true);
    const stop = startDurabilityWatch({
      ready: () => true,
      hasProfile: () => true,
      subscribeStore: () => () => undefined,
      standalone: () => false,
      storage: s,
    });
    expect(s.persist).not.toHaveBeenCalled();
    expect(s.persisted).toHaveBeenCalledTimes(1);
    stop();
  });

  it('asks at launch when the app runs installed with a profile', () => {
    const s = storage(false, true);
    const stop = startDurabilityWatch({
      ready: () => true,
      hasProfile: () => true,
      subscribeStore: () => () => undefined,
      standalone: () => true,
      storage: s,
    });
    expect(s.persist).toHaveBeenCalledTimes(1);
    stop();
  });
});
```
Append to `src/ui/settings/DataSection.test.tsx`:
```tsx

describe('Settings > Data states the storage durability (spec R8, audit B09)', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'storage');
    resetDurabilityForTest();
  });

  function stubStorage(persisted: boolean, grant: boolean): { persist: ReturnType<typeof vi.fn> } {
    const persist = vi.fn(() => Promise.resolve(grant));
    Object.defineProperty(navigator, 'storage', {
      value: { persisted: () => Promise.resolve(persisted), persist },
      configurable: true,
    });
    return { persist };
  }

  it('says best-effort, offers the request, and reports the answer', async () => {
    const { persist } = stubStorage(false, true);
    await act(async () => {
      await readDurability();
    });
    render(<DataSection />);
    expect(screen.getByText(copyFor('limelight', 'status.storageBestEffort'))).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.requestStorage') }));
      await Promise.resolve();
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(copyFor('limelight', 'status.storagePersistent'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copyFor('limelight', 'button.requestStorage') })).toBeNull();
  });

  it('says so when the browser reports nothing', async () => {
    await act(async () => {
      await readDurability(undefined);
    });
    render(<DataSection />);
    expect(screen.getByText(copyFor('limelight', 'status.storageUnknown'))).toBeInTheDocument();
  });
});
```
and add to that file's imports `import { readDurability, resetDurabilityForTest } from '../../app/storageDurability';` (add `act` to the `@testing-library/react` import if absent). The file's `beforeEach` seeds a profile through `makeBlankState()`; if `DataSection` renders nothing without one, seed as the existing wipe tests do.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=1 src/app/storageDurability.test.ts src/ui/settings/DataSection.test.tsx`
Expected: FAIL (module and keys missing).

- [ ] **Step 3: Copy keys**

In `src/content/copy.ts` replace the union line `  | 'advice.dataOnDevice'` with
```ts
  | 'advice.dataOnDevice'
  | 'status.storagePersistent'
  | 'status.storageBestEffort'
  | 'status.storageUnknown'
  | 'button.requestStorage'
```
and the row `  'advice.dataOnDevice': 'Everything stays on this device. No account.',` with
```ts
  'advice.dataOnDevice': 'Everything stays on this device. No account.',
  // Spec R8 / audit B09: the browser's answer to navigator.storage.persist(), in Settings > Data.
  // Meanings from MDN "Storage quotas and eviction criteria" (read 2026-11-04).
  'status.storagePersistent': 'This browser keeps the app data until you delete it.',
  'status.storageBestEffort': 'This browser may clear the app data when space runs low. Keep a backup.',
  'status.storageUnknown': 'This browser does not say whether it keeps the app data.',
  'button.requestStorage': 'Request Persistence',
```
Run:
```bash
node -e "const fs=require('fs');const p='src/content/__fixtures__/limelight-resolved.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));Object.assign(d,{'status.storagePersistent':'This browser keeps the app data until you delete it.','status.storageBestEffort':'This browser may clear the app data when space runs low. Keep a backup.','status.storageUnknown':'This browser does not say whether it keeps the app data.','button.requestStorage':'Request Persistence'});fs.writeFileSync(p,JSON.stringify(d)+'\n');"
```

- [ ] **Step 4: Implement**

Create `src/app/storageDurability.ts`:
```ts
// src/app/storageDurability.ts
//
// Spec R8 (audit E03, B09): ask the browser to keep this origin's storage (the `fti.v3` document
// and the clip) out of automatic eviction, and say in Settings > Data what it answered.
//
// MDN, Storage quotas and eviction criteria (read 2026-11-04,
// https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria):
// best-effort data "persists as long as the origin is below its quota, the device has enough
// storage space, and the user doesn't choose to delete the data"; persistent data "is only
// evicted, or deleted, if the user chooses to". Firefox shows a permission popup for persist();
// Safari and Chromium decide from the user's interaction history with no prompt.
//
// WHEN IT ASKS (so Firefox's popup never appears unprompted at a cold launch):
//  1. right after setup completes (a profile appears in this page life),
//  2. at a launch with a profile while running installed (Chromium grants installed apps), and
//  3. when the user taps Request Persistence in Settings > Data.
// Otherwise a launch only READS persisted(), which never prompts.
import { useSyncExternalStore } from 'react';

export type Durability = 'unknown' | 'unsupported' | 'persistent' | 'best-effort';

/** The slice of StorageManager used here; jsdom and old browsers have neither method. */
export interface DurabilityApi {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

let state: Durability = 'unknown';
const listeners = new Set<() => void>();

function set(next: Durability): void {
  state = next;
  for (const listener of listeners) listener();
}

function api(): DurabilityApi | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.storage;
}

/** Reads the current answer without asking. Never prompts. */
export async function readDurability(storage: DurabilityApi | undefined = api()): Promise<Durability> {
  if (storage?.persisted === undefined) {
    set('unsupported');
    return 'unsupported';
  }
  try {
    const next: Durability = (await storage.persisted()) ? 'persistent' : 'best-effort';
    set(next);
    return next;
  } catch {
    set('unsupported');
    return 'unsupported';
  }
}

/** Asks for persistence. May show Firefox's permission popup; call after a user action. */
export async function requestDurability(storage: DurabilityApi | undefined = api()): Promise<Durability> {
  if (storage?.persist === undefined) return readDurability(storage);
  try {
    const next: Durability = (await storage.persist()) ? 'persistent' : 'best-effort';
    set(next);
    return next;
  } catch {
    // TypeError when the origin is opaque or storage is disabled (MDN, StorageManager.persist).
    set('unsupported');
    return 'unsupported';
  }
}

export interface DurabilityWatchDeps {
  /** The stored document has been read (status.hydrated): before it, no profile is known. */
  ready: () => boolean;
  hasProfile: () => boolean;
  /** Subscribes to store changes; returns the unsubscribe. */
  subscribeStore: (listener: () => void) => () => void;
  standalone: () => boolean;
  storage?: DurabilityApi | undefined;
}

/**
 * Called once from main.tsx. When the document is first read: asks if a profile exists and the
 * app runs installed, else only reads. Afterwards, asks the moment a profile appears (setup
 * completed in this page life). Returns the unsubscribe.
 */
export function startDurabilityWatch(deps: DurabilityWatchDeps): () => void {
  let hadProfile: boolean | null = null; // null until the document has been read
  const onChange = (): void => {
    if (!deps.ready()) return;
    const has = deps.hasProfile();
    if (hadProfile === null) {
      if (has && deps.standalone()) void requestDurability(deps.storage);
      else void readDurability(deps.storage);
    } else if (has && !hadProfile) {
      void requestDurability(deps.storage);
    }
    hadProfile = has;
  };
  const unsubscribe = deps.subscribeStore(onChange);
  onChange();
  return unsubscribe;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Durability {
  return state;
}

export function useDurability(): Durability {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test seam. */
export function resetDurabilityForTest(): void {
  state = 'unknown';
}
```
In `src/main.tsx`: replace `import { startInstallPromptCapture } from './app/installPrompt';` with
```ts
import { runsStandalone, startInstallPromptCapture } from './app/installPrompt';
import { startDurabilityWatch } from './app/storageDurability';
```
and after the line `startInstallPromptCapture();` add:
```ts

// Spec R8: ask the browser to keep the data after setup (and at an installed launch).
startDurabilityWatch({
  ready: () => useAppStore.getState().status.hydrated,
  hasProfile: () => useAppStore.getState().activeProfileId !== null,
  subscribeStore: (listener) => useAppStore.subscribe(listener),
  standalone: () => runsStandalone(),
});
```
In `src/ui/settings/DataSection.tsx`:
- add after `import { useAppStore } from '../../store';`:
```ts
import type { CopyKey } from '../../content/copy';
import { requestDurability, useDurability, type Durability } from '../../app/storageDurability';

/** What Settings > Data says for each answer (spec R8). 'unknown' (not read yet) says nothing. */
const DURABILITY_COPY: Readonly<Record<Exclude<Durability, 'unknown'>, CopyKey>> = {
  persistent: 'status.storagePersistent',
  'best-effort': 'status.storageBestEffort',
  unsupported: 'status.storageUnknown',
};
```
- after `const t = useCopy();` in `DataSection` add `const durability = useDurability();`
- replace `      <p className="view-note">{t('advice.dataOnDevice')}</p>` with:
```tsx
      <p className="view-note">{t('advice.dataOnDevice')}</p>
      {durability !== 'unknown' && (
        <p className="view-note" data-durability={durability}>
          {t(DURABILITY_COPY[durability])}
        </p>
      )}
      {durability === 'best-effort' && (
        <button
          type="button"
          onClick={() => {
            // A tap: Firefox may show its permission popup here, with the reason on screen.
            void requestDurability();
          }}
        >
          {t('button.requestStorage')}
        </button>
      )}
```
In `docs/ARCHITECTURE.md`, at the end of the `| Storage | ... |` row's "Why" cell, append: ` Durability: navigator.storage.persist() after setup and at installed launches, answer shown in Settings > Data (spec R8, src/app/storageDurability.ts).`

- [ ] **Step 5: Run**

Run: `npx vitest run --maxWorkers=1 src/app src/ui/settings src/content`
Expected: PASS (`storageDurability.test.ts` 6; `DataSection.test.tsx` +2).
Run: `npx tsc -b --force && npx eslint ./src`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -- src/app/storageDurability.ts src/app/storageDurability.test.ts src/main.tsx src/ui/settings/DataSection.tsx src/ui/settings/DataSection.test.tsx src/content/copy.ts src/content/__fixtures__/limelight-resolved.json docs/ARCHITECTURE.md
git commit -m "feat(storage): ask for persistent storage after setup and at installed launches; Settings > Data states the answer (R8, E03, B09)"
```

---

### Task 11: Reminder schedule inert when unconfigured; no request for a sound that does not ship (E14, E15)

**Files:**
- Create: `build/sfxManifest.ts`, `build/sfxManifest.test.ts`
- Modify: `src/ui/components/ReminderSettingsPanel.tsx`, `src/ui/components/ReminderSettingsPanel.test.tsx`, `src/skins/sfx.ts`, `src/skins/sfx.test.ts`, `vite.config.ts` (`define`), `vitest.config.ts` (`define`), `src/config/build.d.ts`, `tsconfig.node.json` (`include`), `e2e/p4b-platform.spec.ts` (append)

**Interfaces:**
- Produces: `shippedSfx(publicDir: string): string[]` (sorted `'<skin>/<name>.m4a'` paths under `public/sfx`); global `__SFX_FILES__: readonly string[]`; `sfxRelativePath(skin: SkinId, name: SfxName): string`; optional `SfxDeps.shipped?: (skin: SkinId, name: SfxName) => boolean`.

Design: E14 reproduced the day-of time and lead-time controls editable on a build with no Worker when an imported document had reminders enabled; they change nothing. They are now disabled whenever the status is `not-configured`. E15 reproduced 4 x 404 per launch with sounds on, because `public/sfx/` ships empty by design (`src/skins/sfx.ts` header). The build now lists the files that ship (one function, read by both `vite.config.ts` and `vitest.config.ts`, rule 2) and the player fetches only those. Rejected: `import.meta.glob` over `public/` (Vite treats files in `public/` as non-importable; an import of one may fail the build once a sound is added [U: not tested]); a runtime manifest fetch (still a request per launch).

- [ ] **Step 1: Write the failing tests**

In `src/ui/components/ReminderSettingsPanel.test.tsx`, inside `describe('states the panel cannot act on', () => {`, after the test 'says reminders are not set up on this deployment and disables the toggle', add:
```tsx
  it('leaves the schedule inert on a build with no Worker, even with reminders stored on (E14)', () => {
    config.configured = false;
    config.vapid = null;
    seed({ enabled: true });
    render(<ReminderSettingsPanel />);
    expect(screen.getByLabelText(copyFor('limelight', 'label.reminderDayOfTime'))).toBeDisabled();
    for (const minutes of LEAD_MINUTE_CHOICES) {
      expect(screen.getByLabelText(FORMAT.reminderLead(minutes))).toBeDisabled();
    }
  });
```
Create `build/sfxManifest.test.ts`:
```ts
// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { shippedSfx } from './sfxManifest.ts';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('shippedSfx (audit E15)', () => {
  it('lists the .m4a files under public/sfx by skin, and nothing else', () => {
    const pub = mkdtempSync(join(tmpdir(), 'fti-sfx-'));
    made.push(pub);
    mkdirSync(join(pub, 'sfx', 'limelight'), { recursive: true });
    writeFileSync(join(pub, 'sfx', '.gitkeep'), '');
    writeFileSync(join(pub, 'sfx', 'limelight', 'rest_over.m4a'), 'x');
    writeFileSync(join(pub, 'sfx', 'limelight', 'notes.txt'), 'x');
    expect(shippedSfx(pub)).toEqual(['limelight/rest_over.m4a']);
  });

  it('is empty when the folder is absent', () => {
    expect(shippedSfx(join(tmpdir(), 'fti-no-such-public'))).toEqual([]);
  });

  it('matches the repository today: no sound ships', () => {
    expect(shippedSfx(join(process.cwd(), 'public'))).toEqual([]);
  });
});
```
In `src/skins/sfx.test.ts` add `sfxRelativePath,` to the import from `./sfx`, and inside `describe('createSfxPlayer', () => {` add:
```ts
  it('fetches only the files the build says ship (audit E15)', async () => {
    const h = harness();
    const player = createSfxPlayer({ ...h.deps, shipped: (skin, name) => name === 'rest_over' && skin === 'limelight' });
    await player.unlock();
    expect(h.fetched).toEqual([sfxUrl('limelight', 'rest_over')]);
  });

  it('fetches nothing when no file ships', async () => {
    const h = harness();
    const player = createSfxPlayer({ ...h.deps, shipped: () => false });
    await player.unlock();
    expect(h.fetched).toEqual([]);
  });
```
and inside `describe('sfxUrl', () => {` add:
```ts
  it('builds the URL from the one relative path the shipped list also uses', () => {
    expect(sfxUrl('limelight', 'pr_stamp').endsWith(`sfx/${sfxRelativePath('limelight', 'pr_stamp')}`)).toBe(true);
    expect(sfxRelativePath('limelight', 'pr_stamp')).toBe('limelight/pr_stamp.m4a');
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/components/ReminderSettingsPanel.test.tsx src/skins/sfx.test.ts build/sfxManifest.test.ts`
Expected: FAIL (inputs enabled; `sfxRelativePath` and `./sfxManifest.ts` missing; `shipped` ignored).

- [ ] **Step 3: E14**

In `src/ui/components/ReminderSettingsPanel.tsx`, after the line `const offersToggle = status !== 'unsupported' && status !== 'needs-install';` add:
```ts

  // Audit E14: on a build with no Worker the schedule controls change nothing, so they are not
  // offered as working controls even when an imported document has reminders enabled.
  const scheduleInert = busy || status === 'not-configured';
```
and in the time input and the lead-time checkbox replace `disabled={busy}` with `disabled={scheduleInert}` (two places).

- [ ] **Step 4: E15**

Create `build/sfxManifest.ts`:
```ts
// build/sfxManifest.ts
//
// Audit E15: the sound files that ship, read from public/sfx at config time. public/sfx ships
// empty by design (src/skins/sfx.ts), and the player used to fetch all four moments on every
// unlock with sounds on: 4 x 404 per launch. vite.config.ts and vitest.config.ts both define
// `__SFX_FILES__` from this one function (rule 2); src/skins/sfx.ts fetches only listed files.
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Every `.m4a` under `<publicDir>/sfx`, as `'<skin>/<name>.m4a'`, sorted; [] when absent. */
export function shippedSfx(publicDir: string): string[] {
  const root = join(publicDir, 'sfx');
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.m4a')) found.push(relative(root, path).split(sep).join('/'));
    }
  };
  walk(root);
  return found.sort();
}
```
In `vite.config.ts` add `import { shippedSfx } from './build/sfxManifest.ts';` after the `buildInfoPlugin` import, and in `define` after the `__APP_VERSION__` line add:
```ts
    // Audit E15: the sound files that ship; the player fetches nothing else.
    __SFX_FILES__: JSON.stringify(shippedSfx(`${process.cwd()}/public`)),
```
In `vitest.config.ts` add `import { shippedSfx } from './build/sfxManifest.ts';` and the same `__SFX_FILES__` line in its `define`.
In `src/config/build.d.ts` append:
```ts

/** Audit E15: the sound files under public/sfx at build time, as '<skin>/<name>.m4a'. */
declare const __SFX_FILES__: readonly string[];
```
In `tsconfig.node.json` `include`, after `"build/workflows.test.ts", ` insert `"build/sfxManifest.ts", "build/sfxManifest.test.ts", `.
In `src/skins/sfx.ts`:
- replace
```ts
export function sfxUrl(skin: SkinId, name: SfxName): string {
  return `${import.meta.env.BASE_URL}sfx/${skin}/${name}.m4a`;
}
```
with
```ts
export function sfxUrl(skin: SkinId, name: SfxName): string {
  return `${import.meta.env.BASE_URL}sfx/${sfxRelativePath(skin, name)}`;
}

/** The file's path under public/sfx; the one form the URL and the shipped list share (rule 2). */
export function sfxRelativePath(skin: SkinId, name: SfxName): string {
  return `${skin}/${name}.m4a`;
}

/** Audit E15: the files the build found under public/sfx (build/sfxManifest.ts). */
const SHIPPED_SFX: ReadonlySet<string> = new Set(__SFX_FILES__);
```
- in `interface SfxDeps`, after `isVisible(): boolean;` add:
```ts
  /**
   * Audit E15: does a file ship for this moment? Absent means "assume it does" (tests). The app
   * passes the build's list, so an install with no sounds asks the network for none.
   */
  shipped?: (skin: SkinId, name: SfxName) => boolean;
```
- in `decodeAll`, at the top of the `for (const name of SFX_NAMES) {` loop body add:
```ts
      if (deps.shipped !== undefined && !deps.shipped(skin, name)) continue;
```
- in the `sfxPlayer` deps object, after `isVisible: () => document.visibilityState === 'visible',` add:
```ts
  shipped: (skin: SkinId, name: SfxName) => SHIPPED_SFX.has(sfxRelativePath(skin, name)),
```

- [ ] **Step 5: Run**

Run: `npx vitest run --maxWorkers=1 build src/skins src/ui/components/ReminderSettingsPanel.test.tsx`
Expected: PASS (`sfxManifest.test.ts` 3; `sfx.test.ts` +3; panel +1).
Run: `npx tsc -b --force && npx eslint ./src ./scripts ./build && npm run build`
Expected: clean.

- [ ] **Step 6: E2E (the runner runs it)**

Append to `e2e/p4b-platform.spec.ts`:
```ts

test('E15: with sounds on, a launch asks the network for no sound file that does not ship', async ({ context }) => {
  const doc = e2eDocument();
  doc.ui.sounds = true;
  await seedDocument(context, doc);
  const sfxRequests: string[] = [];
  context.on('request', (request) => {
    if (request.url().includes('/sfx/')) sfxRequests.push(request.url());
  });
  const page = await openApp(context);
  await page.locator('main').click({ position: { x: 5, y: 5 } }); // the first gesture unlocks audio
  await page.waitForTimeout(1_000); // [ms]
  expect(sfxRequests).toEqual([]);
});
```
Runner: `npm run e2e -- e2e/p4b-platform.spec.ts`.

- [ ] **Step 7: Commit**

```bash
git add -- src/ui/components/ReminderSettingsPanel.tsx src/ui/components/ReminderSettingsPanel.test.tsx build/sfxManifest.ts build/sfxManifest.test.ts src/skins/sfx.ts src/skins/sfx.test.ts vite.config.ts vitest.config.ts src/config/build.d.ts tsconfig.node.json e2e/p4b-platform.spec.ts
git commit -m "fix(platform): reminder schedule inert without a Worker; fetch only sound files that ship (E14, E15)"
```

---

### Task 12: The rest-game sheet as its own chunk (F14, games)

**Precondition:** P6 has landed. Run `test -f src/ui/views/train/RestGameSheet.tsx && grep -rln "/RestGameSheet';" src --include=*.tsx | grep -v '\.test\.'`. The first must succeed and the second must list the file(s) that mount the sheet: `src/ui/views/train/RestTimerPanel.tsx` after P6 Task 9, or the app-level rest controller / dock file after P4a Tasks 11-12. If `RestGameSheet.tsx` is absent, STOP and report "P6 not landed; Task 12 deferred". Do not split `RestWordGame` instead.

**Files:**
- Create: `src/ui/views/train/restGameRoute.ts`
- Modify: every non-test file the precondition's grep lists (one import line each; `src/ui/views/train/RestTimerPanel.tsx` at P6), `src/app/routes.test.tsx` (`SPLIT`), the test files that mount the sheet's host (`src/ui/views/train/RestTimerPanel.test.tsx`, `src/ui/views/TrainView.test.tsx`, plus any the grep in Step 2 lists) (preload)

**Interfaces:**
- Consumes: `lazyRoute` (Task 6); P6's `RestGameSheet(props: RestGameSheetProps): ReactElement` from `./RestGameSheet`.
- Produces: `RestGameSheet` (lazy, same props) and `preloadRestGames(): Promise<void>` from `src/ui/views/train/restGameRoute.ts`.

Design: the sheet (picker plus five families, P6) is opened only during a rest, so it leaves the Train chunk. Train itself stays eager (it is the screen a resumed session lands on). A failed load shows the retry panel inside the sheet's slot, never a crash, and never touches the rest timer (P6 constraint 1: no game code writes it).

- [ ] **Step 1: Write the failing guard**

In `src/app/routes.test.tsx`, add to `SPLIT`:
```ts
  'ui/views/train/RestGameSheet': [],
```
Run: `npx vitest run --maxWorkers=1 src/app/routes.test.tsx`
Expected: FAIL with `ui/views/train/RestTimerPanel.tsx -> ui/views/train/RestGameSheet`.

- [ ] **Step 2: Implement**

Create `src/ui/views/train/restGameRoute.ts`:
```ts
// src/ui/views/train/restGameRoute.ts
//
// F14 (audit E09): the rest-game sheet, its picker and the five families load as their own
// chunk the first time a rest offers a game, not with Train. Precached like every chunk, so a
// rest offline still opens it. A failed load shows lazyRoute's retry panel in the sheet's place;
// the rest timer is untouched either way (docs/design/rest-games.md constraint 1).
import { lazyRoute } from '../../../app/lazyRoute';

const sheetRoute = lazyRoute('rest-games', () => import('./RestGameSheet').then((m) => m.RestGameSheet));

export const RestGameSheet = sheetRoute.Component;

/** For tests that open the sheet and query it at once. */
export const preloadRestGames = sheetRoute.preload;
```
In each file the precondition's grep listed, replace its `import { RestGameSheet } from '<path>/RestGameSheet';` with the same line ending in `/restGameRoute';` (same directory, same relative prefix), preceded by the comment `// F14: the sheet is its own chunk (restGameRoute.ts); same name, so the JSX is unchanged.` At P6 that is, in `src/ui/views/train/RestTimerPanel.tsx`:
```ts
// F14: the sheet is its own chunk (restGameRoute.ts); same name, so the JSX is unchanged.
import { RestGameSheet } from './restGameRoute';
```
If a host also imports a VALUE from `./RestGameSheet` (for example `REST_SHEET_BODY_CLASS`, P6 Task 9), move that constant into a new `src/ui/views/train/restSheetClass.ts`, re-export it from `RestGameSheet.tsx` (`export { REST_SHEET_BODY_CLASS } from './restSheetClass';`) and import it in the host from `./restSheetClass`: a value import from `./RestGameSheet` would pull the sheet back into the host's chunk, and `routes.test.tsx` fails on it. `import type` lines may stay.
In `src/ui/views/train/RestTimerPanel.test.tsx` and `src/ui/views/TrainView.test.tsx`: add `beforeAll` to the `vitest` import and after the last import:
```ts
import { preloadRestGames } from './restGameRoute'; // TrainView.test.tsx: './train/restGameRoute'

// F14: the game sheet renders on its first frame only once its chunk is loaded.
beforeAll(async () => {
  await preloadRestGames();
});
```
Also add the same three lines to any other test file that renders `RestTimerPanel` or `TrainView` and opens the sheet (`grep -rln "RestTimerPanel\|<TrainView" src --include=*.test.tsx`); P6's `RestGameSheet.test.tsx` imports `./RestGameSheet` directly and needs nothing.

- [ ] **Step 3: Run**

Run: `npx vitest run --maxWorkers=1 src/app/routes.test.tsx src/ui/views/train`
Then: `npx vitest run --maxWorkers=1 src/ui/views/TrainView.test.tsx`
Expected: PASS.
Run: `npx tsc -b --force && npx eslint ./src && npm run build`
Expected: clean; `ls dist/assets | grep RestGameSheet` lists one chunk. Report its size and the entry/Train chunk sizes before and after in the commit body (measured, `wc -c`).
Runner: `npm run e2e` (P6's sheet-layout spec opens the sheet).

- [ ] **Step 4: Commit**

```bash
git add -- src/ui/views/train/restGameRoute.ts src/ui/views/train/RestTimerPanel.tsx src/app/routes.test.tsx src/ui/views/train/RestTimerPanel.test.tsx src/ui/views/TrainView.test.tsx
# plus every other file Steps 1-2 touched (each host file, restSheetClass.ts if created, each preloaded test)
git commit -m "perf(train): rest-game sheet loads as its own chunk on the first rest that offers a game (F14)"
```

---

## Final verification (runner, after Task 12)

Run the AGENTS.md Verify block in full, by group, `--maxWorkers=1`, then `npm run e2e`. Count test files against `find src build -name '*.test.ts*' | wc -l`. Update `docs/STATUS.md` in place (rule 9): R7, R8, E01, E06, E07, E08, E09, E11-E15, B07, B09 done; E05, E10, E02 not in this phase. On-device checks no agent can make here (owner, after the push): iPhone installed app receives a deploy on resume without a banner when no session is open; Save to Files from the backup share sheet; `persisted()` answer on iPhone and Android; install card hidden in the installed app.

---

## Self-review

**Spec coverage.**
- R7 / E01: Task 4 (update() on visible + 30 min, apply at cold launch with no session, banner only mid-session, other-window reload guarded), Task 1 (`clients.claim()`), Task 2 (stamp out of the chunk). E13 banner placement: Task 5.
- E06: Task 2 (stamp file, fingerprint) + Task 3 (content skip in place of `paths-ignore`, which `workflow_run` does not support). E07, E08: Task 3. E15 "deploy ships CI's tested dist", live check, "CI asserts the deploy job": Task 3.
- E09/F14: Task 6 (setup, intro, Atlas, Log, Settings), Task 7 (body-fat art), Task 12 (games), chunks precached by the existing `**/*.js` glob.
- E11: Task 1. E12: Task 7. E14: Task 11.
- E15 small items: sfx 404 (Task 11), manifest `id` (Task 1), offline no-slash note (Task 3 runbook), latin-ext decision (Task 1, kept out, measured cost), deploy ships tested dist + deploy-job assertion (Task 3).
- R8 / E03 / B09: Task 10 (persist after setup, result in Settings > Data). R8 / E04: Task 9 (install guidance decoupled, not standalone, dismissible, Android `beforeinstallprompt`).
- B07: Task 8 (share files path, download fallback, gate needs a completed share or the user's confirmation).
- Out of scope by the brief: E05, E10, E02 (safe areas); none touched.

**Placeholder scan.** No TBD/TODO. Two conditional instructions remain on purpose, each with an exact test: Task 4 Step 4 (`flushSave` removed by P2: pass a no-op) and Task 12's precondition (stop if P6 is absent). Task 6 Step 7 and Task 9 Step 6 tell the implementer how to fix any further App-mounting test the run reveals, with the exact lines; planning measured which tests break at HEAD.

**Type consistency.** `startUpdateController(deps)` / `UpdateControllerDeps` (Task 4) is called in `main.tsx` with `register, ready, isSessionOpen, flush, reload, showBanner, subscribeStore, doc, win`, matching the interface. `notifyUpdateReady(apply: () => void)` matches `showBanner`. `lazyRoute(name, load)` returns `{ Component, preload }` in Tasks 6 and 12. `useLazyMarkup(key, load, cache)` returns `{ markup, state }` in Task 7 for both callers. `saveFile` returns `{ route: 'download' } | { route: 'share'; outcome }`, consumed in ConfirmDestructive and ExportView (Task 8). `runsStandalone()` is produced in Task 9 and consumed in Task 10. `Durability` keys match `DURABILITY_COPY`. Copy keys added: `advice.screenLoadFailed`, `button.tryAgain` (6), `label.backupSaved` (8), `button.installApp` (9), `status.storagePersistent`, `status.storageBestEffort`, `status.storageUnknown`, `button.requestStorage` (10); each with its fixture row and a call site.

**Risks the runner should watch.**
- `e2e/r7-update.spec.ts` assumes Chromium re-fetches `sw.js` from `vite preview` on `registration.update()` and installs a byte-different worker; if the worker never reaches `waiting`, report the observation (Task 4 Step 6). Unit tests cover the policy either way.
- iOS behaviour (share sheet with a JSON file, `display-mode: standalone`, `persist()` answer, resume firing `visibilitychange`) is [U]; Chromium emulation cannot show it. Owner's phone check is listed in Final verification.
- The Pages CDN may serve a stale `content-sha256.txt` for up to 600 s; the unique query is meant to bypass it [U]. A stale match would skip one deploy; the next push publishes.
- The install card adds a block above every view in every e2e spec after setup; Task 9 Step 7 runs the whole suite.
