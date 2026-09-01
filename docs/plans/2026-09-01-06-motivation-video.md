# P6 — Motivation Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a closed ISO week shows fewer completed sessions than the weekly target and the week was not paused, confront the user once with a full-screen video popup that states the miss in clinical terms and plays a clip on an explicit tap.

**Architecture:** A pure trigger function reads the `WeeklyReview[]` that P3's `closeWeeks` already wrote and returns the one week that still deserves a popup. A separate `idb`-backed asset module holds an optional user-picked clip in IndexedDB (database `fti-assets`, object store `videos`) and resolves the playable source, preferring the custom clip over the bundled `public/media/motivation.mp4`. A presentational modal in the CRT style renders the miss, a poster, and a `Play` button that is the user gesture required to start audio on iOS. A gate component mounted in `App.tsx` connects the three and suppresses the popup during an active session.

**Tech Stack:** React 19, TypeScript 5.9, Zustand 5, `idb` 8, Vitest 4 + Testing Library + jsdom, `fake-indexeddb` 6 (new dev dependency), vite-plugin-pwa 1.3 / Workbox `injectManifest`.

## Global Constraints

Copied verbatim from master plan §3. Every task implicitly includes them.

**Versions (floors, from `npm view` on 2026-09-01):** Node `>=22.12` (installed 22.23.1); `vite ^8.2.2`; `@vitejs/plugin-react ^6.1.1`; `react ^19.2.8`, `react-dom ^19.2.8`, `@types/react ^19.2.18`, `@types/react-dom ^19.2.5`; `typescript ^5.9.3` (NOT 7.x); `zod ^4.5.4`; `zustand ^5.0.15`; `date-fns ^4.4.0`; `@date-fns/tz ^1.5.0`; `vite-plugin-pwa ^1.3.0`; `workbox-window ^7.4.1`; `vitest ^4.1.11`; `@testing-library/react ^16.3.3`; `jsdom ^30.0.1`; `fast-check ^4.9.0`; `eslint ^10.9.1`; `typescript-eslint ^8.69.0`; `eslint-plugin-react-hooks ^7.1.1`; `globals ^17.12.0`; `@fontsource-variable/jetbrains-mono ^5.3.0`; `@fontsource-variable/geist ^5.3.0`; `idb ^8.0.3`. Worker: `wrangler ^4.128.0`; `@cloudflare/workers-types ^5.20260901.1`; `@pushforge/builder ^2.0.5`.

**TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `verbatimModuleSyntax: true`, `target: ES2022`, `moduleResolution: bundler`. No `any`, no `as` casts on external data.

**Lint gates (must fail the build):** `no-empty` with no `allowEmptyCatch`; `no-restricted-syntax` banning `CallExpression[callee.property.name='toISOString']` outside `src/domain/dates.ts`; `no-restricted-globals` banning bare `localStorage` outside `src/store/persistence.ts`; `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` as errors; `@typescript-eslint/no-explicit-any` error.

**Units and sign conventions (canonical storage, no exceptions):** mass kg, volume mL, duration s, instants epoch ms UTC, distances m, energy kcal, protein g. Display unit is a profile property applied only in `src/domain/units.ts`. `1 lb = 0.45359237 kg` exactly. Logged loads display at 0.1 resolution in the display unit with no plate quantisation (a logged value is never altered for display); only *suggested* loads are quantised, rounding down, to the user's equipment step (defaults: barbell 2.5 kg or 5 lb, dumbbells 5 kg or 10 lb per pair, from the content review's verified plate table). Body mass displays at 0.1. Entered values are converted exactly and stored with `enteredUnit`. Deltas are `current − reference`: negative body-mass delta means loss; negative weekly delta means sessions missed. Every physical quantity in code carries a unit comment.

**Dates:** `LocalDate` is `"YYYY-MM-DD"` in the profile's IANA zone, produced only by `src/domain/dates.ts`. Week starts Monday (ISO). Tests for date logic run fixtures in `Europe/Athens`, `America/New_York`, `America/Los_Angeles`, and `UTC`, across both DST transitions; a 168-day programme must measure 168 days in every zone.

**Content Security Policy (meta tag in `index.html`; enforced in CI by grepping `dist/index.html`):**
`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' https://*.workers.dev; frame-src https://yewtu.be https://inv.nadeko.net https://invidious.nerdvpn.de https://iv.duti.dev https://invidious.f5.si https://id.420129.xyz; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'`.
(`connect-src` is tightened to the exact Worker hostname in P5 once it exists; the `frame-src` host list is generated from `src/config/videoInstances.ts` at build time by a Vite HTML transform so the two never drift.) No inline `<script>`, no `eval`, no runtime JSX. `<meta name="referrer" content="no-referrer">`.

**Personal data:** no medication, biometric, or location strings in tracked source. CI gate: `git grep -nEi 'vyvanse|lisdexamfetamine|ymca|amphetamine' -- ':!docs/review/*' ':!REFERENCES.md'` must return nothing after P7's cutover; during P1–P6 the legacy tree under `legacy/` is scrubbed of the lines listed in the content review §7 and security H1 before the baseline commit.

**Storage:** single key `fti.v3`, owned by `src/store/persistence.ts`; payload carries `schemaVersion`; every load, import, and paste passes `AppStateSchema.safeParse`; on failure keep last known-good state in memory, show the error, offer export; `QuotaExceededError` shows a blocking banner. No derived values persisted.

**Destructive actions:** typed confirmation (`type DELETE`) plus automatic JSON export download before the wipe. No always-visible wipe control.

**Tests:** Vitest; unit tests next to modules as `*.test.ts`; UI tests with Testing Library under `src/ui/**/*.test.tsx`; property tests with fast-check for units and schema round-trips. `npm test` must pass before every commit.

**Tone in all user-facing copy:** clinical, formal, honest; no hype, no emoji, no motivational filler (the video is the one sanctioned exception). Terminology: use the defined quantity (kcal, g protein, kg, mL, RPE, RIR, 1RM) never a colloquial stand-in.

**Commits:** each task ends with a commit on `main` of this repository (no push unless the user asks). Commit messages: `feat|fix|test|chore|docs: <summary>`.

---

## Verification gate for this plan (master plan §7, row P6)

| Gate | Pass criterion |
| --- | --- |
| trigger | a closed week with `completed < target` and no pause shows the popup once; a second app open does not; a paused week never shows it |

Task 1 proves the pure half of this gate (`pendingMotivation`), Task 3 proves the state half (`markMotivationShown` suppresses the second open), Task 5 proves it end to end through the mounted gate.

Additional checks this plan states before doing the work:

| Check | Pass criterion |
| --- | --- |
| iOS video policy | the rendered `<video>` carries `playsinline`, carries neither `autoplay` nor `muted`, and `play()` is called only from the `Play` click handler |
| asset round-trip | a 3-byte `video/mp4` `File` saved through `saveCustomVideo` returns from `getCustomVideoUrl` as a `blob:` URL; a non-video MIME type is rejected; a file over 157286400 bytes is rejected |
| object URL hygiene | unmounting the modal calls the revoke callback exactly once |
| precache | `dist/sw.js` (or the generated precache manifest) contains no entry matching `media/motivation.mp4` after `npm run build` |
| CI size gate | `scripts/check-media-size.sh` exits 1 for a 104857601-byte file, exits 0 and warns for a 30000000-byte file, exits 0 silently when the file is absent |

## Prerequisites assumed complete

- **P1** — `src/domain/types.ts` (§5), `src/domain/ids.ts` (`newId()`), `src/domain/dates.ts` (`compareLocalDate`), `src/store/index.ts` (Zustand `useAppStore`), `src/store/selectors.ts`, `src/store/persistence.ts`, `src/vite-env.d.ts` with `/// <reference types="vite/client" />`, Vitest with the jsdom environment.
- **P3** — `closeWeeks` runs on mount and on `visibilitychange`, populating `state.weeklyReviews[profileId]`; the non-persisted `session` slice exposes `activeAssignmentDate: LocalDate | null`.
- **P5** — `src/sw.ts` already registers a Workbox `CacheFirst` route for `/media/`; `src/ui/views/SettingsView.tsx` exists.

Task 5 and Task 7 each begin with a `git grep` step that verifies the specific prerequisite it depends on, and each says what to do if the grep comes back empty.

## File structure for this plan

```
src/domain/motivation/trigger.ts          Task 1 — pure miss selection and copy
src/domain/motivation/trigger.test.ts     Task 1
src/domain/motivation/assets.ts           Task 2 — idb store, bundled source, source resolution, HEAD probe
src/domain/motivation/assets.test.ts      Task 2
src/store/index.ts                        Task 3 — two actions appended
src/store/selectors.ts                    Task 3 — usePendingMotivation()
src/store/motivation.test.ts              Task 3
src/ui/motivation/MotivationModal.tsx     Task 4 — presentational modal
src/ui/motivation/motivation.css          Task 4 — CRT styling for the modal
src/ui/motivation/MotivationModal.test.tsx Task 4
src/ui/motivation/MotivationGate.tsx      Task 5 — store-connected wrapper
src/ui/motivation/MotivationGate.test.tsx Task 5
src/app/App.tsx                           Task 5 — mounts the gate
src/ui/motivation/MotivationSettings.tsx  Task 6 — Settings section
src/ui/motivation/MotivationSettings.test.tsx Task 6
src/ui/views/SettingsView.tsx             Task 6 — mounts the section
public/media/.gitkeep                     Task 7 — keeps the drop directory in git
docs/motivation-video.md                  Task 7 — where the user drops the file and how big it may be
scripts/check-media-size.sh               Task 7 — CI size gate
vite.config.ts                            Task 7 — globIgnores for the mp4
.github/workflows/ci.yml                  Task 7 — runs the size gate
```

---

### Task 1: Missed-week trigger and copy

**Files:**
- Create: `src/domain/motivation/trigger.ts`
- Test: `src/domain/motivation/trigger.test.ts`

**Interfaces:**
- Consumes: `AppState`, `WeeklyReview`, `MotivationState` from `src/domain/types.ts` (master plan §5); `compareLocalDate(a: LocalDate, b: LocalDate): -1 | 0 | 1` from `src/domain/dates.ts` (§6.2).
- Produces:
  - `pendingMotivation(state: AppState, profileId: string): WeeklyReview | null`
  - `describeMiss(review: WeeklyReview): string`

- [ ] **Step 1: Write the failing test**

Create `src/domain/motivation/trigger.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeMiss, pendingMotivation } from "./trigger";
import type { AppState, MotivationState, WeeklyReview } from "../types";

function review(patch: Partial<WeeklyReview>): WeeklyReview {
  return {
    profileId: "p1",
    weekStart: "2026-08-24",
    weekEnd: "2026-08-30",
    target: 4,          // sessions/week
    completed: 1,       // sessions
    skipped: 0,         // sessions
    paused: false,
    delta: -3,          // completed − target; negative = sessions missed
    evaluatedAt: 1_756_000_000_000, // EpochMs, UTC
    missHandled: false,
    ...patch,
  };
}

function stateOf(reviews: WeeklyReview[], motivation?: MotivationState): Pick<AppState, "weeklyReviews" | "motivation"> {
  return {
    weeklyReviews: { p1: reviews },
    motivation: motivation === undefined ? {} : { p1: motivation },
  };
}

describe("pendingMotivation", () => {
  it("returns the missed week on the first open", () => {
    const state = stateOf([review({})]);
    expect(pendingMotivation(state, "p1")?.weekStart).toBe("2026-08-24");
  });

  it("returns null on the second open, once that week has been shown", () => {
    const shown: MotivationState = {
      profileId: "p1",
      lastShownForWeek: "2026-08-24",
      lastShownAt: 1_756_000_100_000,
      customVideoAssetId: null,
    };
    expect(pendingMotivation(stateOf([review({})], shown), "p1")).toBeNull();
  });

  it("never returns a paused week", () => {
    const paused = review({ paused: true, completed: 0, delta: 0 });
    expect(pendingMotivation(stateOf([paused]), "p1")).toBeNull();
  });

  it("never returns a paused week even if its delta is negative", () => {
    const paused = review({ paused: true, completed: 0, delta: -4 });
    expect(pendingMotivation(stateOf([paused]), "p1")).toBeNull();
  });

  it("ignores a week whose miss was already handled", () => {
    expect(pendingMotivation(stateOf([review({ missHandled: true })]), "p1")).toBeNull();
  });

  it("ignores a week that met its target", () => {
    expect(pendingMotivation(stateOf([review({ completed: 4, delta: 0 })]), "p1")).toBeNull();
  });

  it("picks the most recent of several unhandled misses", () => {
    const state = stateOf([
      review({ weekStart: "2026-08-10", weekEnd: "2026-08-16" }),
      review({ weekStart: "2026-08-24", weekEnd: "2026-08-30" }),
      review({ weekStart: "2026-08-17", weekEnd: "2026-08-23" }),
    ]);
    expect(pendingMotivation(state, "p1")?.weekStart).toBe("2026-08-24");
  });

  it("still returns an older miss when only the newest week was shown", () => {
    const shown: MotivationState = {
      profileId: "p1",
      lastShownForWeek: "2026-08-24",
      lastShownAt: 1_756_000_100_000,
      customVideoAssetId: null,
    };
    const state = stateOf(
      [review({ weekStart: "2026-08-17", weekEnd: "2026-08-23" }), review({ weekStart: "2026-08-24" })],
      shown,
    );
    expect(pendingMotivation(state, "p1")?.weekStart).toBe("2026-08-17");
  });

  it("returns null for a profile with no reviews", () => {
    expect(pendingMotivation(stateOf([review({})]), "unknown-profile")).toBeNull();
  });
});

describe("describeMiss", () => {
  it("reports partial completion", () => {
    expect(describeMiss(review({}))).toBe(
      "Week of 2026-08-24: 1 of 4 sessions completed. Target missed by 3.",
    );
  });

  it("reports zero completion", () => {
    expect(describeMiss(review({ completed: 0, delta: -4 }))).toBe(
      "Week of 2026-08-24: no sessions completed. Target missed by 4.",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/motivation/trigger.test.ts`

Expected: FAIL — `Failed to resolve import "./trigger"` (the module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/domain/motivation/trigger.ts`:

```ts
import { compareLocalDate } from "../dates";
import type { AppState, WeeklyReview } from "../types";

/**
 * The most recent closed week that still deserves the motivation popup, or null.
 *
 * A week qualifies when all four hold:
 *   delta < 0        — sessions completed fell short of the weekly target
 *                      (delta = completed − target; negative = sessions missed)
 *   paused === false — a week overlapping a PlanPause is not a miss (master plan §6.4)
 *   missHandled === false — the popup has not already been answered for this week
 *   weekStart !== motivation.lastShownForWeek — this week was not the one last shown
 *
 * The last two conditions are deliberately redundant: markMotivationShown sets both,
 * so either one alone is enough to stop the popup reappearing on the next app open.
 */
export function pendingMotivation(
  state: Pick<AppState, "weeklyReviews" | "motivation">,
  profileId: string,
): WeeklyReview | null {
  const reviews = state.weeklyReviews[profileId];
  if (reviews === undefined) return null;

  const lastShownForWeek = state.motivation[profileId]?.lastShownForWeek ?? null;

  let candidate: WeeklyReview | null = null;
  for (const review of reviews) {
    if (review.delta >= 0) continue;
    if (review.paused) continue;
    if (review.missHandled) continue;
    if (lastShownForWeek !== null && review.weekStart === lastShownForWeek) continue;
    if (candidate === null || compareLocalDate(review.weekStart, candidate.weekStart) === 1) {
      candidate = review;
    }
  }
  return candidate;
}

/**
 * One clinical sentence pair naming the week and the size of the shortfall.
 * No hype, no second person, no exclamation (master plan §3, tone).
 */
export function describeMiss(review: WeeklyReview): string {
  const missed = -review.delta; // sessions short of target; delta is negative here
  const head =
    review.completed === 0
      ? `Week of ${review.weekStart}: no sessions completed.`
      : `Week of ${review.weekStart}: ${review.completed} of ${review.target} sessions completed.`;
  return `${head} Target missed by ${missed}.`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/motivation/trigger.test.ts`

Expected: PASS — `Tests  11 passed (11)`.

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/domain/motivation`

Expected: both exit 0 with no output.

- [ ] **Step 6: Commit**

```bash
git add src/domain/motivation/trigger.ts src/domain/motivation/trigger.test.ts
git commit -m "feat: add missed-week motivation trigger and clinical miss copy"
```

---

### Task 2: Custom video asset store and source resolution

**Files:**
- Create: `src/domain/motivation/assets.ts`
- Test: `src/domain/motivation/assets.test.ts`
- Modify: `package.json` (add the `fake-indexeddb` dev dependency)

**Interfaces:**
- Consumes: `newId(): string` from `src/domain/ids.ts`; `AppState`, `EpochMs` from `src/domain/types.ts`; `openDB`, `IDBPDatabase`, `DBSchema` from `idb` ^8.0.3.
- Produces:
  - `ASSET_DB_NAME = "fti-assets"`, `ASSET_DB_VERSION = 1`, `VIDEO_STORE = "videos"`, `MAX_VIDEO_BYTES = 157_286_400`, `BUNDLED_VIDEO_SRC: string`
  - `interface StoredVideo { id: string; name: string; type: string; size: number; data: ArrayBuffer; createdAt: EpochMs }`
  - `interface VideoSource { src: string; revoke: () => void }`
  - `saveCustomVideo(file: File, now: EpochMs): Promise<string>`
  - `getCustomVideoUrl(id: string): Promise<string | null>`
  - `revokeVideoUrl(url: string): void`
  - `deleteCustomVideo(id: string): Promise<void>`
  - `resolveVideoSrc(state: Pick<AppState, "motivation">, profileId: string): Promise<VideoSource>`
  - `probeBundledVideo(): Promise<boolean>`
  - `resetAssetDbForTests(): void`

<!-- decision: motivation-asset-arraybuffer | status: adopted | supersedes: none -->
**Storage format decision (adopted).** The object store holds `{ id, name, type, size, data: ArrayBuffer, createdAt }` and the playable `Blob` is reconstructed at read time with `new Blob([record.data], { type: record.type })`. `ArrayBuffer` is a core structured-clone type, so the record survives every IndexedDB implementation, including the `fake-indexeddb` + jsdom test environment. Cost, stated plainly: `file.arrayBuffer()` materialises the whole clip in JS memory while saving, so a 150 MiB clip briefly costs ~150 MiB of heap plus the clone the transaction makes. This is why Task 6's Settings copy steers the user towards a clip of a few tens of MiB.

<!-- decision: motivation-asset-blob-direct | status: rejected | supersedes: none -->
**Storing the `File`/`Blob` directly (rejected in favour of motivation-asset-arraybuffer).** Browsers store IndexedDB Blobs by reference and would avoid the heap spike, which is the better production behaviour. It was rejected because it cannot be tested here: `fake-indexeddb` dropped its `structuredClone` polyfill in v5 and defers to Node's, and Node's serialiser does not recognise a jsdom `Blob`. Measured in this environment on 2026-09-01 with vitest 4.1.11 / jsdom 30 / fake-indexeddb 6.2.5: `db.put(store, jsdomBlob)` followed by `db.get` returns `{}` — no throw, no warning, silent total data loss. A storage format whose failure mode is a silent empty object and whose test suite cannot detect it is not shippable.

- [ ] **Step 1: Add the test-only IndexedDB implementation**

Run: `npm install --save-dev fake-indexeddb@^6.2.5`

Expected: `package.json` gains `"fake-indexeddb": "^6.2.5"` under `devDependencies`. (Version confirmed with `npm view fake-indexeddb version` on 2026-09-01 → `6.2.5`.)

- [ ] **Step 2: Write the failing test**

Create `src/domain/motivation/assets.test.ts`:

```ts
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUNDLED_VIDEO_SRC,
  deleteCustomVideo,
  getCustomVideoUrl,
  MAX_VIDEO_BYTES,
  probeBundledVideo,
  resetAssetDbForTests,
  resolveVideoSrc,
  revokeVideoUrl,
  saveCustomVideo,
} from "./assets";
import type { MotivationState } from "../types";

function videoFile(bytes: number, type = "video/mp4", name = "clip.mp4"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function motivation(customVideoAssetId: string | null): { motivation: Record<string, MotivationState> } {
  return {
    motivation: {
      p1: { profileId: "p1", lastShownForWeek: null, lastShownAt: null, customVideoAssetId },
    },
  };
}

beforeEach(() => {
  // fake-indexeddb keeps its databases on the factory, so a fresh factory is a fresh disk.
  globalThis.indexedDB = new IDBFactory();
  resetAssetDbForTests();
});

describe("custom video asset store", () => {
  it("round-trips a picked file to an object URL", async () => {
    const id = await saveCustomVideo(videoFile(8), 1_756_000_000_000);
    const url = await getCustomVideoUrl(id);
    expect(url).not.toBeNull();
    expect(url).toMatch(/^blob:/);
    if (url !== null) revokeVideoUrl(url);
  });

  it("rejects a non-video MIME type", async () => {
    await expect(saveCustomVideo(videoFile(4, "image/png", "x.png"), 1)).rejects.toThrow(/Not a video file/);
  });

  it("rejects a file over the size cap", async () => {
    const oversize = videoFile(0);
    Object.defineProperty(oversize, "size", { value: MAX_VIDEO_BYTES + 1 });
    await expect(saveCustomVideo(oversize, 1)).rejects.toThrow(/the limit is 157286400 bytes/);
  });

  it("returns null for an unknown id", async () => {
    expect(await getCustomVideoUrl("missing")).toBeNull();
  });

  it("deletes a stored clip", async () => {
    const id = await saveCustomVideo(videoFile(8), 1);
    await deleteCustomVideo(id);
    expect(await getCustomVideoUrl(id)).toBeNull();
  });

  it("caps custom clips at 150 MiB", () => {
    expect(MAX_VIDEO_BYTES).toBe(157286400);
  });
});

describe("resolveVideoSrc and the bundled probe", () => {
  it("falls back to the bundled clip when no custom asset is set", async () => {
    const got = await resolveVideoSrc({ motivation: {} }, "p1");
    expect(got.src).toBe(BUNDLED_VIDEO_SRC);
    expect(BUNDLED_VIDEO_SRC.endsWith("media/motivation.mp4")).toBe(true);
    got.revoke();
  });

  it("prefers the custom asset", async () => {
    const id = await saveCustomVideo(videoFile(8), 1);
    const got = await resolveVideoSrc(motivation(id), "p1");
    expect(got.src).toMatch(/^blob:/);
    got.revoke();
  });

  it("falls back when the referenced asset is gone", async () => {
    expect((await resolveVideoSrc(motivation("gone"), "p1")).src).toBe(BUNDLED_VIDEO_SRC);
  });

  it("probes the bundled file once and caches the answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeBundledVideo()).toBe(true);
    expect(await probeBundledVideo()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(BUNDLED_VIDEO_SRC, { method: "HEAD" });
    vi.unstubAllGlobals();
  });

  it("reports the bundled file as absent when the HEAD request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await probeBundledVideo()).toBe(false);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/domain/motivation/assets.test.ts`

Expected: FAIL — `Failed to resolve import "./assets"`.

- [ ] **Step 4: Write the implementation**

Create `src/domain/motivation/assets.ts`:

```ts
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { newId } from "../ids";
import type { AppState, EpochMs } from "../types";

export const ASSET_DB_NAME = "fti-assets";
export const ASSET_DB_VERSION = 1;
export const VIDEO_STORE = "videos";
export const MAX_VIDEO_BYTES = 157_286_400; // bytes = 150 MiB
export const BUNDLED_VIDEO_SRC = `${import.meta.env.BASE_URL}media/motivation.mp4`; // BASE_URL always ends in "/"

export interface StoredVideo {
  id: string;
  name: string;
  type: string;
  size: number;      // bytes
  data: ArrayBuffer; // the clip; see the storage-format decision in the plan
  createdAt: EpochMs; // epoch milliseconds, UTC
}

interface AssetDb extends DBSchema {
  videos: { key: string; value: StoredVideo };
}

let connection: Promise<IDBPDatabase<AssetDb>> | null = null;
let bundledProbe: Promise<boolean> | null = null;

function assetDb(): Promise<IDBPDatabase<AssetDb>> {
  connection ??= openDB<AssetDb>(ASSET_DB_NAME, ASSET_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(VIDEO_STORE)) db.createObjectStore(VIDEO_STORE);
    },
  });
  return connection;
}

/**
 * Drops the cached connection and the cached HEAD probe.
 * Tests replace globalThis.indexedDB with a fresh IDBFactory between cases; a connection
 * cached against the previous factory would silently read a database that no longer exists.
 */
export function resetAssetDbForTests(): void {
  connection = null;
  bundledProbe = null;
}

export async function saveCustomVideo(file: File, now: EpochMs): Promise<string> {
  if (!file.type.startsWith("video/")) {
    throw new Error(`Not a video file: MIME type "${file.type}".`);
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(`File is ${file.size} bytes; the limit is ${MAX_VIDEO_BYTES} bytes.`);
  }
  const data = await file.arrayBuffer();
  const id = newId();
  const db = await assetDb();
  await db.put(
    VIDEO_STORE,
    { id, name: file.name, type: file.type, size: file.size, data, createdAt: now },
    id,
  );
  return id;
}

export async function getCustomVideoUrl(id: string): Promise<string | null> {
  const db = await assetDb();
  const record = await db.get(VIDEO_STORE, id);
  if (record === undefined) return null;
  return URL.createObjectURL(new Blob([record.data], { type: record.type }));
}

export function revokeVideoUrl(url: string): void {
  // The bundled clip is a plain path; only object URLs hold a reference to release.
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

export async function deleteCustomVideo(id: string): Promise<void> {
  const db = await assetDb();
  await db.delete(VIDEO_STORE, id);
}

const NO_REVOKE = (): void => {
  /* the bundled clip is a static URL under the site origin; there is nothing to release */
};

export interface VideoSource {
  src: string;
  revoke: () => void;
}

/**
 * The clip to play, preferring the profile's custom asset.
 * The caller owns the returned revoke() and must call it exactly once when the
 * element using src goes away; for the bundled clip it is a no-op.
 */
export async function resolveVideoSrc(
  state: Pick<AppState, "motivation">,
  profileId: string,
): Promise<VideoSource> {
  const assetId = state.motivation[profileId]?.customVideoAssetId ?? null;
  if (assetId !== null) {
    const url = await getCustomVideoUrl(assetId);
    if (url !== null) return { src: url, revoke: () => { revokeVideoUrl(url); } };
  }
  return { src: BUNDLED_VIDEO_SRC, revoke: NO_REVOKE };
}

/**
 * Whether public/media/motivation.mp4 was actually shipped. Cached for the page's
 * lifetime: the answer cannot change without a redeploy, and Settings may ask repeatedly.
 */
export function probeBundledVideo(): Promise<boolean> {
  bundledProbe ??= fetch(BUNDLED_VIDEO_SRC, { method: "HEAD" })
    .then((response) => response.ok)
    .catch(() => false);
  return bundledProbe;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/domain/motivation/assets.test.ts`

Expected: PASS — `Tests  11 passed (11)`.

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/domain/motivation`

Expected: both exit 0 with no output. If `tsc` reports `Property 'env' does not exist on type 'ImportMeta'`, `src/vite-env.d.ts` is missing its `/// <reference types="vite/client" />` line — restore it rather than casting `import.meta`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/domain/motivation/assets.ts src/domain/motivation/assets.test.ts
git commit -m "feat: store a user-picked motivation clip in IndexedDB and resolve the playable source"
```

---

### Task 3: Store actions and the pending-motivation selector

**Files:**
- Modify: `src/store/index.ts` (add the two P6 actions declared in master plan §6.7)
- Modify: `src/store/selectors.ts` (add `usePendingMotivation`)
- Test: `src/store/motivation.test.ts`

**Interfaces:**
- Consumes: `pendingMotivation` from Task 1; `useAppStore` from `src/store/index.ts`; `MotivationState`, `WeeklyReview`, `LocalDate`, `EpochMs` from `src/domain/types.ts`.
- Produces:
  - `markMotivationShown(profileId: string, weekStart: LocalDate, now: EpochMs): void` — writes `MotivationState.lastShownForWeek`/`lastShownAt` and sets `missHandled: true` on the matching `WeeklyReview`
  - `setCustomVideo(profileId: string, assetId: string | null): void`
  - `usePendingMotivation(): WeeklyReview | null`

**Store shape this task assumes:** `useAppStore`'s state spreads `AppState` at the top level and carries the non-persisted `session` slice beside it, i.e. `AppState & { session: { restTimer: RestTimer | null; activeAssignmentDate: LocalDate | null } } & AppActions`. Verify with `git grep -n "create<" src/store/index.ts` before starting; if the store nests `AppState` under a key instead, change `pendingMotivation(s, ...)` to `pendingMotivation(s.<key>, ...)` in `usePendingMotivation` and adjust the `set` returns to match — nothing else in this plan depends on the shape.

- [ ] **Step 1: Write the failing test**

Create `src/store/motivation.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./index";
import { usePendingMotivation } from "./selectors";
import type { WeeklyReview } from "../domain/types";

const missed: WeeklyReview = {
  profileId: "p1",
  weekStart: "2026-08-24",
  weekEnd: "2026-08-30",
  target: 4,          // sessions/week
  completed: 1,       // sessions
  skipped: 0,         // sessions
  paused: false,
  delta: -3,          // completed − target
  evaluatedAt: 1_756_000_000_000, // EpochMs, UTC
  missHandled: false,
};

beforeEach(() => {
  useAppStore.setState({
    activeProfileId: "p1",
    weeklyReviews: { p1: [missed] },
    motivation: {},
    session: { activeAssignmentDate: null },
  });
});

describe("markMotivationShown", () => {
  it("records the week and marks the review handled", () => {
    useAppStore.getState().markMotivationShown("p1", "2026-08-24", 1_756_000_500_000);
    const state = useAppStore.getState();
    expect(state.motivation.p1?.lastShownForWeek).toBe("2026-08-24");
    expect(state.motivation.p1?.lastShownAt).toBe(1_756_000_500_000);
    expect(state.weeklyReviews.p1?.[0]?.missHandled).toBe(true);
  });

  it("keeps an existing custom video id", () => {
    useAppStore.getState().setCustomVideo("p1", "asset-1");
    useAppStore.getState().markMotivationShown("p1", "2026-08-24", 1);
    expect(useAppStore.getState().motivation.p1?.customVideoAssetId).toBe("asset-1");
  });

  it("is inert for a profile with no reviews", () => {
    useAppStore.getState().markMotivationShown("p2", "2026-08-24", 1);
    expect(useAppStore.getState().motivation.p2?.lastShownForWeek).toBe("2026-08-24");
    expect(useAppStore.getState().weeklyReviews.p1?.[0]?.missHandled).toBe(false);
  });
});

describe("setCustomVideo", () => {
  it("sets and clears without disturbing the shown week", () => {
    useAppStore.getState().markMotivationShown("p1", "2026-08-24", 7);
    useAppStore.getState().setCustomVideo("p1", "asset-1");
    expect(useAppStore.getState().motivation.p1?.lastShownForWeek).toBe("2026-08-24");
    useAppStore.getState().setCustomVideo("p1", null);
    expect(useAppStore.getState().motivation.p1?.customVideoAssetId).toBeNull();
    expect(useAppStore.getState().motivation.p1?.lastShownAt).toBe(7);
  });
});

describe("usePendingMotivation", () => {
  it("reports the miss, then reports nothing once it is marked shown", () => {
    const { result } = renderHook(() => usePendingMotivation());
    expect(result.current?.weekStart).toBe("2026-08-24");
    act(() => {
      useAppStore.getState().markMotivationShown("p1", "2026-08-24", 1);
    });
    expect(result.current).toBeNull();
  });

  it("reports nothing with no active profile", () => {
    useAppStore.setState({ activeProfileId: null });
    const { result } = renderHook(() => usePendingMotivation());
    expect(result.current).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/store/motivation.test.ts`

Expected: FAIL — `TypeError: useAppStore.getState(...).markMotivationShown is not a function` (and `usePendingMotivation` is not exported).

- [ ] **Step 3: Declare the two actions on the store interface**

In `src/store/index.ts`, find the `AppActions` interface. If it does not already carry the P6 line from master plan §6.7, add it after the P5 line, verbatim:

```ts
  // P6
  markMotivationShown(profileId: string, weekStart: LocalDate, now: EpochMs): void; setCustomVideo(profileId: string, assetId: string | null): void;
```

Ensure the file's type imports include `MotivationState` (add it to the existing `import type { ... } from "../domain/types";` line if absent).

- [ ] **Step 4: Implement the two actions**

In `src/store/index.ts`, inside the object returned by the store creator, immediately after the P5 action `setPushDevice`, add:

```ts
  markMotivationShown(profileId, weekStart, now) {
    set((s) => {
      const prev = s.motivation[profileId];
      const next: MotivationState = {
        profileId,
        lastShownForWeek: weekStart,
        lastShownAt: now, // EpochMs, UTC
        customVideoAssetId: prev?.customVideoAssetId ?? null,
      };
      // Marking the review handled is the durable half of the guard: pendingMotivation
      // rejects a handled review even if lastShownForWeek later moves to another week.
      const reviews = s.weeklyReviews[profileId];
      const weeklyReviews =
        reviews === undefined
          ? s.weeklyReviews
          : {
              ...s.weeklyReviews,
              [profileId]: reviews.map((r) => (r.weekStart === weekStart ? { ...r, missHandled: true } : r)),
            };
      return { motivation: { ...s.motivation, [profileId]: next }, weeklyReviews };
    });
  },

  setCustomVideo(profileId, assetId) {
    set((s) => {
      const prev = s.motivation[profileId];
      const next: MotivationState = {
        profileId,
        lastShownForWeek: prev?.lastShownForWeek ?? null,
        lastShownAt: prev?.lastShownAt ?? null,
        customVideoAssetId: assetId,
      };
      return { motivation: { ...s.motivation, [profileId]: next } };
    });
  },
```

- [ ] **Step 5: Add the selector**

Add to `src/store/selectors.ts` — the imports at the top beside the file's existing imports, the function at the end:

```ts
import { pendingMotivation } from "../domain/motivation/trigger";
import type { WeeklyReview } from "../domain/types";
import { useAppStore } from "./index";

/**
 * The week that still owes the user a popup, or null.
 * Returns the WeeklyReview object held in the store, so the reference is stable
 * between renders and cannot drive Zustand into a re-render loop.
 * The active-session suppression is NOT here — it belongs to MotivationGate (Task 5),
 * so that Settings' preview can reuse this selector unchanged.
 */
export function usePendingMotivation(): WeeklyReview | null {
  return useAppStore((s) => (s.activeProfileId === null ? null : pendingMotivation(s, s.activeProfileId)));
}
```

If `src/store/selectors.ts` already imports `useAppStore` or `WeeklyReview`, merge into the existing import lines rather than duplicating them.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/store/motivation.test.ts`

Expected: PASS — `Tests  6 passed (6)`.

- [ ] **Step 7: Type-check, lint, and run the whole suite**

Run: `npx tsc --noEmit && npx eslint src && npm test`

Expected: all three exit 0; `npm test` reports every P1–P6 test passing.

- [ ] **Step 8: Commit**

```bash
git add src/store/index.ts src/store/selectors.ts src/store/motivation.test.ts
git commit -m "feat: add motivation store actions and the pending-motivation selector"
```

---

### Task 4: The motivation modal

**Files:**
- Create: `src/ui/motivation/MotivationModal.tsx`
- Create: `src/ui/motivation/motivation.css`
- Test: `src/ui/motivation/MotivationModal.test.tsx`

**Interfaces:**
- Consumes: `describeMiss` from Task 1; `WeeklyReview` from `src/domain/types.ts`.
- Produces:
  - `POSTER_DATA_URI: string`
  - `interface MotivationModalProps { review: WeeklyReview | null; videoSrc: string; posterSrc: string; revokeOnUnmount: () => void; onDismiss: () => void; onDismissForWeek: () => void }`
  - `MotivationModal(props: MotivationModalProps): ReactElement`

**Why the modal never autoplays.** WebKit's iOS video policy (REFERENCES.md, `https://webkit.org/blog/6784/new-video-policies-for-ios/`) sets three rules this component obeys literally: `playsinline` is required or iPhone Safari takes the video fullscreen on play; autoplay is permitted only when the element is muted; and starting playback *with sound* requires a user gesture. So the element carries `playsinline` and carries neither `autoplay` nor `muted`, and the only call to `play()` sits inside the `Play` button's click handler. A muted autoplay was rejected: a silent confrontation clip defeats the feature's purpose, and unmuting later would itself need the gesture.

`review === null` is preview mode, used by Settings in Task 6. The modal has no other mode flag: the two dismissal callbacks are injected, so the caller decides whether dismissing records anything.

- [ ] **Step 1: Write the failing test**

Create `src/ui/motivation/MotivationModal.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { MotivationModal, POSTER_DATA_URI } from "./MotivationModal";
import type { WeeklyReview } from "../../domain/types";

const review: WeeklyReview = {
  profileId: "p1",
  weekStart: "2026-08-24",
  weekEnd: "2026-08-30",
  target: 4,          // sessions/week
  completed: 1,       // sessions
  skipped: 0,         // sessions
  paused: false,
  delta: -3,          // completed − target
  evaluatedAt: 1_756_000_000_000, // EpochMs, UTC
  missHandled: false,
};

let play: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // jsdom has no media pipeline: HTMLMediaElement.play() exists but is not implemented.
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderModal(over: Partial<ComponentProps<typeof MotivationModal>> = {}) {
  const props = {
    review,
    videoSrc: "/media/motivation.mp4",
    posterSrc: POSTER_DATA_URI,
    revokeOnUnmount: vi.fn(),
    onDismiss: vi.fn(),
    onDismissForWeek: vi.fn(),
    ...over,
  };
  return { props, ...render(<MotivationModal {...props} />) };
}

describe("MotivationModal", () => {
  it("headlines the miss with describeMiss", () => {
    renderModal();
    expect(screen.getByRole("heading", { name: "Weekly target missed" })).toBeDefined();
    expect(
      screen.getByText("Week of 2026-08-24: 1 of 4 sessions completed. Target missed by 3."),
    ).toBeDefined();
  });

  it("obeys the iOS video policy: playsinline, no autoplay, not muted", () => {
    renderModal();
    const video = screen.getByTestId("motivation-video");
    expect(video.getAttribute("playsinline")).not.toBeNull();
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.getAttribute("poster")).toBe(POSTER_DATA_URI);
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.hasAttribute("autoplay")).toBe(false);
    expect(video.hasAttribute("muted")).toBe(false);
  });

  it("starts playback with sound only on the Play gesture", async () => {
    const user = userEvent.setup();
    renderModal();
    expect(play).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledTimes(1);
    const video = screen.getByTestId("motivation-video");
    expect(video instanceof HTMLVideoElement && video.muted).toBe(false);
  });

  it("reports both dismissals and treats Escape as Dismiss", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Don't show again for this week" }));
    expect(props.onDismissForWeek).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(props.onDismiss).toHaveBeenCalledTimes(2);
  });

  it("focuses Play on mount and traps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    renderModal();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Play" }));
    await user.tab(); // Dismiss
    await user.tab(); // Don't show again for this week (last focusable)
    await user.tab(); // wraps to the first focusable: the video
    expect(document.activeElement).toBe(screen.getByTestId("motivation-video"));
  });

  it("revokes the object URL exactly once on unmount", () => {
    const { props, unmount } = renderModal();
    expect(props.revokeOnUnmount).not.toHaveBeenCalled();
    unmount();
    expect(props.revokeOnUnmount).toHaveBeenCalledTimes(1);
  });

  it("renders preview copy when there is no review", () => {
    renderModal({ review: null });
    expect(screen.getByRole("heading", { name: "Motivation video — preview" })).toBeDefined();
    expect(screen.getByText("Preview. No weekly review is being reported.")).toBeDefined();
  });

  it("is an accessible modal dialog", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("motivation-title");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/motivation/MotivationModal.test.tsx`

Expected: FAIL — `Failed to resolve import "./MotivationModal"`.

- [ ] **Step 3: Write the stylesheet**

Create `src/ui/motivation/motivation.css`:

```css
/* Motivation modal — CRT surface. Token names fall back to literals so the file
   renders correctly even if P1's tokens.css uses different names. */
.motivation-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgb(0 0 0 / 88%);
}

.motivation-modal {
  width: min(56rem, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 1.25rem;
  color: var(--fg, #d8e6d8);
  background: var(--bg-raised, #0a0e0a);
  border: 1px solid var(--accent, #6ee7a8);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 60%), 0 0 32px rgb(110 231 168 / 12%);
  font-family: var(--font-mono, "JetBrains Mono Variable", ui-monospace, monospace);
}

.motivation-title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent, #6ee7a8);
}

.motivation-detail {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  line-height: 1.5;
}

.motivation-video {
  display: block;
  width: 100%;
  max-height: 60vh;
  background: #000;
  border: 1px solid var(--border, #22331f);
}

.motivation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.motivation-actions button {
  flex: 1 1 auto;
  min-height: 2.75rem; /* touch target */
  padding: 0.5rem 1rem;
  color: var(--fg, #d8e6d8);
  background: transparent;
  border: 1px solid var(--accent, #6ee7a8);
  font: inherit;
  cursor: pointer;
}

.motivation-actions button:focus-visible,
.motivation-video:focus-visible {
  outline: 2px solid var(--accent, #6ee7a8);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .motivation-modal { box-shadow: none; }
}
```

- [ ] **Step 4: Write the component**

Create `src/ui/motivation/MotivationModal.tsx`:

```tsx
import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactElement } from "react";
import { describeMiss } from "../../domain/motivation/trigger";
import type { WeeklyReview } from "../../domain/types";
import "./motivation.css";

/** A flat near-black 16:9 frame. Inline so the poster exists whether or not the user
 *  shipped an image; `img-src 'self' data: blob:` in the CSP admits a data: URI. */
export const POSTER_DATA_URI =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2016%209'%3E%3Crect%20width='16'%20height='9'%20fill='%230a0e0a'/%3E%3C/svg%3E";

export interface MotivationModalProps {
  /** The week being reported, or null for Settings' preview. */
  review: WeeklyReview | null;
  videoSrc: string;
  posterSrc: string;
  /** Called once when this modal unmounts; releases the object URL behind videoSrc. */
  revokeOnUnmount: () => void;
  onDismiss: () => void;
  onDismissForWeek: () => void;
}

const FOCUSABLE = "button, [href], [tabindex]:not([tabindex='-1'])";

export function MotivationModal(props: MotivationModalProps): ReactElement {
  const { review, videoSrc, posterSrc, revokeOnUnmount, onDismiss, onDismissForWeek } = props;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playRef = useRef<HTMLButtonElement | null>(null);

  // Held in a ref so a caller that passes a fresh closure each render cannot make the
  // cleanup run early; the effect must fire on unmount and only on unmount.
  const revokeRef = useRef(revokeOnUnmount);
  revokeRef.current = revokeOnUnmount;
  useEffect(
    () => () => {
      revokeRef.current();
    },
    [],
  );

  useEffect(() => {
    playRef.current?.focus();
  }, []);

  const handlePlay = useCallback((): void => {
    const video = videoRef.current;
    if (video === null) return;
    // iOS allows playback with sound only from a user gesture, and this click is it
    // (webkit.org/blog/6784/new-video-policies-for-ios/). The element is never muted and
    // never autoplays, so this is the sole entry point into playback with audio.
    video.muted = false;
    void video.play().catch(() => {
      /* a rejected play() leaves the native controls as the fallback affordance */
    });
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (root === null) return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onDismiss],
  );

  return (
    <div className="motivation-backdrop">
      <div
        className="crt-modal motivation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="motivation-title"
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <h2 id="motivation-title" className="motivation-title">
          {review === null ? "Motivation video — preview" : "Weekly target missed"}
        </h2>
        <p className="motivation-detail">
          {review === null ? "Preview. No weekly review is being reported." : describeMiss(review)}
        </p>
        <video
          ref={videoRef}
          className="motivation-video"
          src={videoSrc}
          poster={posterSrc}
          playsInline
          preload="metadata"
          controls
          tabIndex={0}
          data-testid="motivation-video"
        />
        <div className="motivation-actions">
          <button type="button" ref={playRef} onClick={handlePlay}>
            Play
          </button>
          <button type="button" onClick={onDismiss}>
            Dismiss
          </button>
          <button type="button" onClick={onDismissForWeek}>
            Don&apos;t show again for this week
          </button>
        </div>
      </div>
    </div>
  );
}
```

`tabIndex={0}` on the video is deliberate: it makes the element the first stop of the focus cycle so keyboard users reach the native controls, and it is what puts the video inside the `FOCUSABLE` query used by the trap.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/ui/motivation/MotivationModal.test.tsx`

Expected: PASS — `Tests  8 passed (8)`.

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/ui/motivation`

Expected: both exit 0 with no output.

- [ ] **Step 7: Commit**

```bash
git add src/ui/motivation/MotivationModal.tsx src/ui/motivation/motivation.css src/ui/motivation/MotivationModal.test.tsx
git commit -m "feat: add the motivation modal with tap-to-play and a focus trap"
```

---

### Task 5: Gate the popup and mount it in the app

**Files:**
- Create: `src/ui/motivation/MotivationGate.tsx`
- Test: `src/ui/motivation/MotivationGate.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `usePendingMotivation` from Task 3; `markMotivationShown` from Task 3; `resolveVideoSrc`, `VideoSource` from Task 2; `MotivationModal`, `POSTER_DATA_URI` from Task 4; `useAppStore` from `src/store/index.ts`.
- Produces: `MotivationGate(): ReactElement | null` — renders nothing unless a week is pending, a profile is active, and no session is in progress.

**Ownership of the object URL.** `resolveVideoSrc` hands back a `revoke`. The gate passes it to the modal, which calls it once on unmount (Task 4). The gate therefore revokes in only one case of its own: when the promise settles after the effect was cancelled, so the modal never received it. `key={source.src}` forces a remount when the source changes, which is what makes the previous URL's revoke actually run.

- [ ] **Step 1: Verify the P3 prerequisite**

Run: `git grep -n "closeWeeks" -- src/app/App.tsx`

Expected: at least two hits — one in a mount effect and one in a `visibilitychange` handler. If this returns nothing, stop and report it as a P3 defect: this plan reads the `WeeklyReview[]` that `closeWeeks` writes and must not create its own scheduling path.

- [ ] **Step 2: Write the failing test**

Create `src/ui/motivation/MotivationGate.test.tsx`:

```tsx
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotivationGate } from "./MotivationGate";
import { resetAssetDbForTests } from "../../domain/motivation/assets";
import { useAppStore } from "../../store/index";
import type { WeeklyReview } from "../../domain/types";

const missed: WeeklyReview = {
  profileId: "p1",
  weekStart: "2026-08-24",
  weekEnd: "2026-08-30",
  target: 4,          // sessions/week
  completed: 1,       // sessions
  skipped: 0,         // sessions
  paused: false,
  delta: -3,          // completed − target
  evaluatedAt: 1_756_000_000_000, // EpochMs, UTC
  missHandled: false,
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetAssetDbForTests();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  useAppStore.setState({
    activeProfileId: "p1",
    weeklyReviews: { p1: [missed] },
    motivation: {},
    session: { activeAssignmentDate: null },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MotivationGate", () => {
  it("shows the popup once for a missed week", async () => {
    render(<MotivationGate />);
    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(
      screen.getByText("Week of 2026-08-24: 1 of 4 sessions completed. Target missed by 3."),
    ).toBeDefined();
  });

  it("does not show it again after Dismiss, including on a remount", async () => {
    const user = userEvent.setup();
    const first = render(<MotivationGate />);
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(useAppStore.getState().motivation.p1?.lastShownForWeek).toBe("2026-08-24");
    first.unmount();
    render(<MotivationGate />);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("marks the week shown from the explicit suppression button too", async () => {
    const user = userEvent.setup();
    render(<MotivationGate />);
    await user.click(await screen.findByRole("button", { name: "Don't show again for this week" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(useAppStore.getState().weeklyReviews.p1?.[0]?.missHandled).toBe(true);
  });

  it("never shows during an active session", async () => {
    useAppStore.setState({ session: { activeAssignmentDate: "2026-09-01" } });
    render(<MotivationGate />);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("shows nothing when no week is pending", async () => {
    useAppStore.setState({ weeklyReviews: { p1: [{ ...missed, completed: 4, delta: 0 }] } });
    render(<MotivationGate />);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
```

If P1's `session` slice carries `restTimer` as well, extend the two `useAppStore.setState({ session: ... })` calls to `{ restTimer: null, activeAssignmentDate: ... }` so the slice stays complete.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/ui/motivation/MotivationGate.test.tsx`

Expected: FAIL — `Failed to resolve import "./MotivationGate"`.

- [ ] **Step 4: Write the gate**

Create `src/ui/motivation/MotivationGate.tsx`:

```tsx
import { useEffect, useState, type ReactElement } from "react";
import { MotivationModal, POSTER_DATA_URI } from "./MotivationModal";
import { resolveVideoSrc, type VideoSource } from "../../domain/motivation/assets";
import { useAppStore } from "../../store/index";
import { usePendingMotivation } from "../../store/selectors";

/**
 * Mounts the motivation popup when P3's closeWeeks has left an unhandled missed week.
 * Suppressed while a session is in progress: confronting the user mid-workout would
 * interrupt set logging and the rest timer.
 */
export function MotivationGate(): ReactElement | null {
  const review = usePendingMotivation();
  const profileId = useAppStore((s) => s.activeProfileId);
  const activeAssignmentDate = useAppStore((s) => s.session.activeAssignmentDate);
  const markMotivationShown = useAppStore((s) => s.markMotivationShown);
  const customVideoAssetId = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.motivation[s.activeProfileId]?.customVideoAssetId ?? null),
  );
  const [source, setSource] = useState<VideoSource | null>(null);

  const shouldShow = review !== null && profileId !== null && activeAssignmentDate === null;

  useEffect(() => {
    if (!shouldShow || profileId === null) {
      setSource(null);
      return;
    }
    let cancelled = false;
    // getState() rather than a subscription: the store is read once per resolution, and
    // customVideoAssetId in the dependency list is what makes a swap re-resolve.
    void resolveVideoSrc(useAppStore.getState(), profileId).then((resolved) => {
      if (cancelled) {
        resolved.revoke(); // the modal never took ownership, so release it here
        return;
      }
      setSource(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldShow, profileId, customVideoAssetId]);

  if (!shouldShow || source === null || review === null || profileId === null) return null;

  const mark = (): void => {
    markMotivationShown(profileId, review.weekStart, Date.now());
  };

  return (
    <MotivationModal
      key={source.src}
      review={review}
      videoSrc={source.src}
      posterSrc={POSTER_DATA_URI}
      revokeOnUnmount={source.revoke}
      onDismiss={mark}
      onDismissForWeek={mark}
    />
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/ui/motivation/MotivationGate.test.tsx`

Expected: PASS — `Tests  5 passed (5)`.

- [ ] **Step 6: Mount the gate in App.tsx**

Add this import beside the other view imports in `src/app/App.tsx`:

```tsx
import { MotivationGate } from "../ui/motivation/MotivationGate";
```

Then render `<MotivationGate />` as the **last** child of the element `App` returns, after the view switch and after any existing toast or modal host, so it paints above them:

```tsx
      <MotivationGate />
```

Run: `git diff --stat src/app/App.tsx`

Expected: `1 file changed, 2 insertions(+)`.

- [ ] **Step 7: Type-check, lint, and run the whole suite**

Run: `npx tsc --noEmit && npx eslint src && npm test`

Expected: all three exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/ui/motivation/MotivationGate.tsx src/ui/motivation/MotivationGate.test.tsx src/app/App.tsx
git commit -m "feat: mount the motivation popup after the weekly close, never mid-session"
```

---

### Task 6: Settings section for the motivation clip

**Files:**
- Create: `src/ui/motivation/MotivationSettings.tsx`
- Test: `src/ui/motivation/MotivationSettings.test.tsx`
- Modify: `src/ui/views/SettingsView.tsx`

**Interfaces:**
- Consumes: `probeBundledVideo`, `saveCustomVideo`, `deleteCustomVideo`, `resolveVideoSrc`, `MAX_VIDEO_BYTES`, `VideoSource` from Task 2; `setCustomVideo` from Task 3; `MotivationModal`, `POSTER_DATA_URI` from Task 4.
- Produces: `MotivationSettings(): ReactElement | null` — renders null when no profile is active.

Preview passes `review={null}` and wires both dismissal callbacks to a local close, so previewing never calls `markMotivationShown` and never consumes a real pending week.

- [ ] **Step 1: Write the failing test**

Create `src/ui/motivation/MotivationSettings.test.tsx`:

```tsx
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotivationSettings } from "./MotivationSettings";
import { resetAssetDbForTests } from "../../domain/motivation/assets";
import { useAppStore } from "../../store/index";

function videoFile(bytes: number, type = "video/mp4", name = "clip.mp4"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetAssetDbForTests();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  useAppStore.setState({
    activeProfileId: "p1",
    weeklyReviews: {},
    motivation: {},
    session: { activeAssignmentDate: null },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MotivationSettings", () => {
  it("reports the bundled clip as present", async () => {
    render(<MotivationSettings />);
    expect(await screen.findByText("Bundled clip: present.")).toBeDefined();
  });

  it("reports the bundled clip as absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<MotivationSettings />);
    expect(await screen.findByText(/Bundled clip: absent\./)).toBeDefined();
  });

  it("stores a picked clip and records its id", async () => {
    const user = userEvent.setup();
    render(<MotivationSettings />);
    await user.upload(screen.getByLabelText("Choose a custom clip"), videoFile(16));
    await waitFor(() => {
      expect(useAppStore.getState().motivation.p1?.customVideoAssetId).not.toBeNull();
    });
    expect(await screen.findByText("Custom clip: stored on this device.")).toBeDefined();
  });

  it("reports a rejected file and stores nothing", async () => {
    render(<MotivationSettings />);
    // fireEvent, not userEvent: userEvent.upload honours the accept="video/*" filter,
    // which is exactly the path being bypassed to exercise the module's own validation.
    fireEvent.change(screen.getByLabelText("Choose a custom clip"), {
      target: { files: [videoFile(4, "image/png", "x.png")] },
    });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(useAppStore.getState().motivation.p1?.customVideoAssetId ?? null).toBeNull();
  });

  it("removes the custom clip", async () => {
    const user = userEvent.setup();
    render(<MotivationSettings />);
    await user.upload(screen.getByLabelText("Choose a custom clip"), videoFile(16));
    await user.click(await screen.findByRole("button", { name: "Remove custom clip" }));
    await waitFor(() => {
      expect(useAppStore.getState().motivation.p1?.customVideoAssetId).toBeNull();
    });
    expect(screen.getByText("Custom clip: none.")).toBeDefined();
  });

  it("previews without marking any week shown", async () => {
    const user = userEvent.setup();
    render(<MotivationSettings />);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.getByText("Preview. No weekly review is being reported.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(useAppStore.getState().motivation.p1?.lastShownForWeek ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/motivation/MotivationSettings.test.tsx`

Expected: FAIL — `Failed to resolve import "./MotivationSettings"`.

- [ ] **Step 3: Write the component**

Create `src/ui/motivation/MotivationSettings.tsx`:

```tsx
import { useCallback, useEffect, useState, type ChangeEvent, type ReactElement } from "react";
import { MotivationModal, POSTER_DATA_URI } from "./MotivationModal";
import {
  deleteCustomVideo,
  MAX_VIDEO_BYTES,
  probeBundledVideo,
  resolveVideoSrc,
  saveCustomVideo,
  type VideoSource,
} from "../../domain/motivation/assets";
import { useAppStore } from "../../store/index";

export function MotivationSettings(): ReactElement | null {
  const profileId = useAppStore((s) => s.activeProfileId);
  const customVideoAssetId = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.motivation[s.activeProfileId]?.customVideoAssetId ?? null),
  );
  const setCustomVideo = useAppStore((s) => s.setCustomVideo);

  const [bundled, setBundled] = useState<boolean | null>(null); // null = probe in flight
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VideoSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    void probeBundledVideo().then((present) => {
      if (!cancelled) setBundled(present);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onPick = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0];
      event.target.value = ""; // let the same file be re-picked after a rejection
      if (file === undefined || profileId === null) return;
      const previous = customVideoAssetId;
      void saveCustomVideo(file, Date.now())
        .then(async (id) => {
          if (previous !== null) await deleteCustomVideo(previous); // one clip per profile
          setCustomVideo(profileId, id);
          setError(null);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "The file could not be stored.");
        });
    },
    [profileId, customVideoAssetId, setCustomVideo],
  );

  const onRemove = useCallback((): void => {
    if (profileId === null || customVideoAssetId === null) return;
    void deleteCustomVideo(customVideoAssetId).then(() => {
      setCustomVideo(profileId, null);
      setError(null);
    });
  }, [profileId, customVideoAssetId, setCustomVideo]);

  const onPreview = useCallback((): void => {
    if (profileId === null) return;
    void resolveVideoSrc(useAppStore.getState(), profileId).then(setPreview);
  }, [profileId]);

  const closePreview = useCallback((): void => {
    setPreview(null);
  }, []);

  if (profileId === null) return null;

  return (
    <section className="settings-section" aria-labelledby="motivation-settings-title">
      <h3 id="motivation-settings-title">Motivation video</h3>
      <p>
        {bundled === null
          ? "Bundled clip: checking."
          : bundled
            ? "Bundled clip: present."
            : "Bundled clip: absent. Ship one at public/media/motivation.mp4, or choose a file below."}
      </p>
      <p>{customVideoAssetId === null ? "Custom clip: none." : "Custom clip: stored on this device."}</p>
      <label htmlFor="motivation-file">Choose a custom clip</label>
      <input id="motivation-file" type="file" accept="video/*" onChange={onPick} />
      <p>
        Stored in this browser only and never uploaded. Hard limit {MAX_VIDEO_BYTES} bytes (150 MiB);
        a clip of 25 MiB or less is recommended.
      </p>
      {error !== null ? <p role="alert">{error}</p> : null}
      <div className="settings-actions">
        <button type="button" onClick={onPreview}>
          Preview
        </button>
        {customVideoAssetId === null ? null : (
          <button type="button" onClick={onRemove}>
            Remove custom clip
          </button>
        )}
      </div>
      {preview === null ? null : (
        <MotivationModal
          key={preview.src}
          review={null}
          videoSrc={preview.src}
          posterSrc={POSTER_DATA_URI}
          revokeOnUnmount={preview.revoke}
          onDismiss={closePreview}
          onDismissForWeek={closePreview}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/motivation/MotivationSettings.test.tsx`

Expected: PASS — `Tests  6 passed (6)`.

- [ ] **Step 5: Mount the section in the Settings view**

Add this import beside the other section imports in `src/ui/views/SettingsView.tsx`:

```tsx
import { MotivationSettings } from "../motivation/MotivationSettings";
```

Render it after the reminder settings section (P5) and before any destructive-action section, so the wipe control stays last:

```tsx
      <MotivationSettings />
```

Run: `git diff --stat src/ui/views/SettingsView.tsx`

Expected: `1 file changed, 2 insertions(+)`.

- [ ] **Step 6: Type-check, lint, and run the whole suite**

Run: `npx tsc --noEmit && npx eslint src && npm test`

Expected: all three exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/ui/motivation/MotivationSettings.tsx src/ui/motivation/MotivationSettings.test.tsx src/ui/views/SettingsView.tsx
git commit -m "feat: manage the motivation clip from Settings with a preview"
```

---

### Task 7: Asset handling, precache exclusion, and the CI size gate

**Files:**
- Create: `public/media/.gitkeep`
- Create: `docs/motivation-video.md`
- Create: `scripts/check-media-size.sh`
- Modify: `vite.config.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `BUNDLED_VIDEO_SRC` from Task 2 (the path the build must serve); the `CacheFirst` route for `/media/` that P5 registered in `src/sw.ts`.
- Produces: `scripts/check-media-size.sh` — exit 1 above 104857600 bytes, exit 0 otherwise; a precache manifest with no `media/*.mp4` entry.

**Where the file goes, and how big it may be.**
- The user drops their clip at `public/media/motivation.mp4`. Vite copies `public/` verbatim into `dist/`, so the file is served at `<base>media/motivation.mp4`, which is exactly what `BUNDLED_VIDEO_SRC` builds from `import.meta.env.BASE_URL`.
- Size, from GitHub's own documentation (recorded in `REFERENCES.md`): a file over **100 MiB (104857600 bytes) is blocked on push** — this is the CI gate's hard failure; over **50 MiB** git prints a warning; **25 MiB** is GitHub's browser-upload ceiling and the practical guidance here. A published Pages site may be no larger than **1 GB** and carries a soft bandwidth limit of **100 GB/month**, so a large clip multiplied by every install is the real cost, not the repository.
- The clip is deliberately **not** precached. Precaching means every install downloads it before the app is usable offline. It is excluded from the manifest by `globIgnores` and cached instead on first play by the `CacheFirst` route P5 registered for `/media/`, so it costs nothing until the user actually triggers the popup once.
- A user who does not want to commit a clip at all can leave `public/media/` empty and pick a file in Settings (Task 6); it is stored per-browser in IndexedDB and never enters the repository.

- [ ] **Step 1: Verify the P5 prerequisite**

Run: `git grep -n "media" -- src/sw.ts`

Expected: a `registerRoute` whose matcher covers `/media/` with a `CacheFirst` strategy. If this returns nothing, stop and report it as a P5 defect — do not add a second caching strategy here.

- [ ] **Step 2: Create the drop directory and its documentation**

```bash
mkdir -p public/media
touch public/media/.gitkeep
```

Create `docs/motivation-video.md`:

```markdown
# Motivation video

The app shows one video when a closed ISO week finished under its weekly session
target and the week was not paused. It shows it once per week, never during a session.

## Shipping a clip with the app

Put an MP4 at `public/media/motivation.mp4`. The build copies `public/` verbatim, so the
file is served at `<base>media/motivation.mp4` and works offline after the first play.

Size limits, from GitHub's documentation:

| Threshold | Meaning |
| --- | --- |
| 25 MiB | GitHub's browser-upload ceiling; the recommended ceiling for this file |
| 50 MiB | git prints a large-file warning |
| 100 MiB (104857600 bytes) | GitHub blocks the push; `scripts/check-media-size.sh` fails CI here |

A published Pages site may be no larger than 1 GB and has a soft bandwidth limit of
100 GB per month, so the clip's real cost is one download per install, not disk.

The file is excluded from the service worker's precache manifest (`globIgnores` in
`vite.config.ts`) and is cached on first play by the `CacheFirst` route for `/media/`.
Precaching it would make every install download it before the app could work offline.

## Using your own clip instead

Settings → Motivation video → "Choose a custom clip". The file is stored in this
browser's IndexedDB (database `fti-assets`, object store `videos`), never uploaded, and
takes precedence over the bundled file. Hard limit 150 MiB; a clip of 25 MiB or less is
recommended, because saving reads the whole file into memory.
```

- [ ] **Step 3: Write the CI size gate**

Create `scripts/check-media-size.sh`:

```bash
#!/usr/bin/env bash
# Fails the build when public/media/motivation.mp4 exceeds GitHub's hard file limit.
# Limits from docs.github.com (see REFERENCES.md): 100 MiB blocks the push, 50 MiB warns,
# 25 MiB is the browser-upload ceiling and the guidance for a Pages project site.
set -euo pipefail

FILE="public/media/motivation.mp4"
HARD_LIMIT=104857600   # bytes, 100 MiB — GitHub blocks the push above this
SOFT_LIMIT=26214400    # bytes, 25 MiB — guidance for a Pages project site

if [ ! -f "$FILE" ]; then
  echo "check-media-size: $FILE is absent. The app falls back to a custom clip chosen in Settings."
  exit 0
fi

SIZE=$(wc -c < "$FILE")
echo "check-media-size: $FILE is $SIZE bytes."

if [ "$SIZE" -gt "$HARD_LIMIT" ]; then
  echo "check-media-size: FAIL — $SIZE bytes exceeds the 100 MiB ($HARD_LIMIT bytes) GitHub file limit." >&2
  exit 1
fi

if [ "$SIZE" -gt "$SOFT_LIMIT" ]; then
  echo "check-media-size: WARNING — $SIZE bytes exceeds the 25 MiB ($SOFT_LIMIT bytes) guidance for a Pages project site."
fi

echo "check-media-size: OK."
```

Then: `chmod +x scripts/check-media-size.sh`

- [ ] **Step 4: Run the gate against all three branches**

```bash
./scripts/check-media-size.sh; echo "absent -> exit $?"
head -c 30000000 /dev/zero > public/media/motivation.mp4
./scripts/check-media-size.sh; echo "30 MB -> exit $?"
head -c 104857601 /dev/zero > public/media/motivation.mp4
set +e; ./scripts/check-media-size.sh; echo "100 MiB + 1 -> exit $?"; set -e
rm -f public/media/motivation.mp4
```

Expected, in order:
```
check-media-size: public/media/motivation.mp4 is absent. The app falls back to a custom clip chosen in Settings.
absent -> exit 0
check-media-size: public/media/motivation.mp4 is 30000000 bytes.
check-media-size: WARNING — 30000000 bytes exceeds the 25 MiB (26214400 bytes) guidance for a Pages project site.
check-media-size: OK.
30 MB -> exit 0
check-media-size: public/media/motivation.mp4 is 104857601 bytes.
check-media-size: FAIL — 104857601 bytes exceeds the 100 MiB (104857600 bytes) GitHub file limit.
100 MiB + 1 -> exit 1
```

Confirm `git status --short public/media` shows only `.gitkeep`; the test files must not be committed.

- [ ] **Step 5: Exclude the clip from the precache manifest**

In `vite.config.ts`, inside the `VitePWA({ ... })` options object beside `strategies`, `srcDir`, and `filename`, add:

```ts
    injectManifest: {
      // Precache the shell only. globPatterns omits video extensions and globIgnores
      // states the exclusion explicitly so a future pattern change cannot re-admit the
      // clip. It is cached instead on first play by the CacheFirst route for /media/.
      globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}"],
      globIgnores: ["**/media/*.mp4"],
    },
```

(`globPatterns`, `globIgnores`, and their defaults are `workbox-build` options; see `REFERENCES.md` → `developer.chrome.com/docs/workbox/modules/workbox-build`.)

- [ ] **Step 6: Prove the built service worker does not precache the clip**

```bash
head -c 30000000 /dev/zero > public/media/motivation.mp4
npm run build
grep -c "motivation.mp4" dist/sw.js; echo "grep exit $?"
ls -l dist/media/motivation.mp4
rm -f public/media/motivation.mp4
```

Expected: `grep -c` prints `0` and `grep exit 1` (grep exits 1 when it matches nothing), and `ls -l` shows the 30000000-byte file present in `dist/media/` — served, but not precached. If the count is not 0, the `injectManifest` block landed in the wrong options object.

- [ ] **Step 7: Add the gate to CI**

In `.github/workflows/ci.yml`, add this step to the existing job immediately after the checkout step and before the build step:

```yaml
      - name: Check the motivation clip's size
        run: ./scripts/check-media-size.sh
```

- [ ] **Step 8: Verify the workflow file parses**

Run: `python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); print([s.get('name') for j in d['jobs'].values() for s in j['steps']])"`

Expected: a list of step names that includes `Check the motivation clip's size` in the position described above.

- [ ] **Step 9: Run the whole suite**

Run: `npx tsc --noEmit && npx eslint src && npm test && npm run build`

Expected: all four exit 0.

- [ ] **Step 10: Commit**

```bash
git add public/media/.gitkeep docs/motivation-video.md scripts/check-media-size.sh vite.config.ts .github/workflows/ci.yml
git commit -m "chore: keep the motivation clip out of precache and gate its size in CI"
```

---

## What this plan does not do

- It does not create or edit `closeWeeks`, `WeeklyReview` production, the `session` slice, `src/sw.ts`, or the `CacheFirst` route. Tasks 5 and 7 verify those exist and stop if they do not.
- It does not add the clip to `AppStateSchema` — the clip lives in IndexedDB, and only the `assetId` string reaches `fti.v3`, where `MotivationState.customVideoAssetId` already covers it. A dangling id (cleared browser storage, another device after an import) degrades to the bundled clip: `resolveVideoSrc` returns `BUNDLED_VIDEO_SRC` when `getCustomVideoUrl` yields null, and Task 2 tests that path.
- It does not export or import the clip itself. P7's export carries the id only; the binary stays on the device that chose it.
- It does not transcode, validate the container, or check the duration. `file.type` and `file.size` are the only checks; a file that decodes to nothing shows the poster and the browser's own error state.
- It does not run on a real iPhone. The `playsinline`/gesture behaviour is enforced by construction and asserted in jsdom, which has no media pipeline — the on-device check belongs to P5's smoke-test runbook and should be added there.
- It does not localise any copy; every string is English, matching the rest of the app.

## Master plan amendments requested

Each item is a change to `docs/plans/2026-09-01-00-master-plan.md` that this plan's implementation assumes. None changes a signature another plan already consumes.

1. **§3, Content Security Policy paragraph — add the precache exclusion as a stated constraint.** The task brief for P6 cited a `globIgnores` rule in §3; §3 does not contain one. The requirement exists only as prose in §4 (`public/media/motivation.mp4 … excluded from precache; runtime CacheFirst`). Add to §3: *"PWA precache: `injectManifest.globIgnores` must exclude `**/media/*.mp4`; the clip is cached at first play by the `CacheFirst` route for `/media/`."*

2. **§3, version list — add `fake-indexeddb ^6.2.5`** to the dev-dependency floors (confirmed with `npm view fake-indexeddb version` on 2026-09-01). It is required to test anything that touches IndexedDB.

3. **§6 — add a §6.8 for the motivation contracts.** §4 names `motivation/trigger.ts` and `motivation/assets.ts` but §6 carries no signatures for them, so other plans have nothing to consume. Proposed block:
   ```ts
   // 6.8 src/domain/motivation/trigger.ts, assets.ts (P6)
   export function pendingMotivation(state: Pick<AppState, "weeklyReviews" | "motivation">, profileId: string): WeeklyReview | null;
   export function describeMiss(review: WeeklyReview): string;
   export const BUNDLED_VIDEO_SRC: string;            // import.meta.env.BASE_URL + "media/motivation.mp4"
   export const MAX_VIDEO_BYTES = 157_286_400;        // bytes = 150 MiB
   export interface VideoSource { src: string; revoke: () => void }
   export function saveCustomVideo(file: File, now: EpochMs): Promise<string>;
   export function getCustomVideoUrl(id: string): Promise<string | null>;
   export function revokeVideoUrl(url: string): void;
   export function deleteCustomVideo(id: string): Promise<void>;
   export function resolveVideoSrc(state: Pick<AppState, "motivation">, profileId: string): Promise<VideoSource>;
   export function probeBundledVideo(): Promise<boolean>;
   ```

4. **`saveCustomVideo` takes `now: EpochMs` explicitly.** The brief's signature was `saveCustomVideo(file: File): Promise<string>`. Every other domain function in §6 receives `now` from the caller instead of reading the clock, which is what keeps them deterministic under test; `StoredVideo.createdAt` is the only clock use here and it follows the same rule.

5. **§6.7 — state what `markMotivationShown` writes.** It sets `MotivationState.lastShownForWeek`/`lastShownAt` **and** `missHandled: true` on the `WeeklyReview` whose `weekStart` matches. §6.4 says `closeWeeks` produces `missHandled: false` and no other plan writes the field, so P6 claims ownership of it. The redundancy with `lastShownForWeek` is deliberate: either guard alone stops the §7 gate's "second app open" case.

6. **The two dismissal controls are behaviourally identical, and the contract cannot make them differ.** §7's P6 gate requires that a second app open not show the popup, which forces plain `Dismiss` to record the week; `MotivationState` has no field expressing a shorter suppression. Two options, both cheap — either **(a)** drop "Don't show again for this week" and keep one `Dismiss`, or **(b)** add `dismissedUntil: EpochMs | null` to `MotivationState` in §5 so `Dismiss` can mean "not again today" while the second button means "not again this week". This plan implements the contract as written (both call `markMotivationShown`) and flags the redundancy rather than inventing a field. **Decision needed from the user before P7 freezes the schema.**

7. **§1.8 — record the custom clip's storage format and its cost.** §1.8 says IndexedDB holds "binary assets" without a record shape. The adopted shape is `{ id, name, type, size, data: ArrayBuffer, createdAt }` with the `Blob` rebuilt at read time; the rejected alternative (storing the `Blob` directly) is untestable because `fake-indexeddb` + jsdom silently degrades a jsdom `Blob` to `{}`. The cost of the adopted shape is a heap spike of the file's full size while saving, which is why the Settings copy recommends 25 MiB or less against a 150 MiB hard cap.

8. **§4 file tree — add `public/media/.gitkeep`, `docs/motivation-video.md`, `scripts/check-media-size.sh`, `src/ui/motivation/MotivationGate.tsx`, `src/ui/motivation/MotivationSettings.tsx`, and `src/ui/motivation/motivation.css`.** §4 lists only `MotivationModal.tsx` under `ui/motivation/`.

9. **No CSP change is required, and this is worth recording.** The modal's poster is an inline `data:` SVG, admitted by the existing `img-src 'self' data: blob:`; a custom clip plays from a `blob:` object URL, admitted by the existing `media-src 'self' blob:`; the bundled clip is same-origin. If the poster ever becomes a shipped image file, `img-src 'self'` still covers it.
