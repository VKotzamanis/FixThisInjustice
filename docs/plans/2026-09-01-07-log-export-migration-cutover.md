# P7 — Log view, export/import, v2 → v3 migration, docs and cutover

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** give the rewritten app its history — a Log view built on the new types, a validated export/import path, a lossless one-way migration of the legacy `fti.console.v2` store with an explicit unit prompt — and then retire the old tree: one `README.md`, no `DEPLOY.md`, no `PROJECT_SUMMARY.md`, no `legacy/`, and a CI gate that fails if a personal identifier ever reappears.

**Architecture:** three pure domain modules (`migrations/v2plan.ts` frozen decoding table, `migrations/v2.ts` the migration itself, `export/{summary,ics}.ts` the two text artefacts) with no React in them, plus four presentation layers over them (`MigrationWizard`, `LogView`, `ExportView`, the `SettingsView` destructive block). Nothing enters the store except through `replaceState`; nothing is read from `localStorage` except through `src/store/persistence.ts`.

**Tech Stack:** TypeScript 5.9 strict, React 19, Zustand 5, Zod 4, date-fns 4 + `@date-fns/tz` (only through `src/domain/dates.ts`), Vitest 4 + Testing Library + jsdom, `idb` 8 for the asset store, GitHub Actions for CI and Pages.

**Assumes P1–P6 are complete.** Do not re-create anything they built. This plan reads their modules and adds to them.

---

## Global Constraints

Copied from master plan §3. Every task implicitly includes them.

**Versions (floors, from `npm view` on 2026-09-01):** Node `>=22.12` (installed 22.23.1); `vite ^8.2.2`; `@vitejs/plugin-react ^6.1.1`; `react ^19.2.8`, `react-dom ^19.2.8`, `@types/react ^19.2.18`, `@types/react-dom ^19.2.5`; `typescript ^5.9.3` (NOT 7.x); `zod ^4.5.4`; `zustand ^5.0.15`; `date-fns ^4.4.0`; `@date-fns/tz ^1.5.0`; `vite-plugin-pwa ^1.3.0`; `workbox-window ^7.4.1`; `vitest ^4.1.11`; `@testing-library/react ^16.3.3`; `jsdom ^30.0.1`; `fast-check ^4.9.0`; `eslint ^10.9.1`; `typescript-eslint ^8.69.0`; `eslint-plugin-react-hooks ^7.1.1`; `globals ^17.12.0`; `@fontsource-variable/jetbrains-mono ^5.3.0`; `@fontsource-variable/geist ^5.3.0`; `idb ^8.0.3`. Worker: `wrangler ^4.128.0`; `@cloudflare/workers-types ^5.20260901.1`; `@pushforge/builder ^2.0.5`.

**TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `verbatimModuleSyntax: true`, `target: ES2022`, `moduleResolution: bundler`. No `any`, no `as` casts on external data.

**Lint gates (must fail the build):** `no-empty` with no `allowEmptyCatch`; `no-restricted-syntax` banning `CallExpression[callee.property.name='toISOString']` outside `src/domain/dates.ts`; `no-restricted-globals` banning bare `localStorage` outside `src/store/persistence.ts`; `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` as errors; `@typescript-eslint/no-explicit-any` error.

**Units and sign conventions (canonical storage, no exceptions):** mass kg, volume mL, duration s, instants epoch ms UTC, distances m, energy kcal, protein g. Display unit is a profile property applied only in `src/domain/units.ts`. `1 lb = 0.45359237 kg` exactly. Logged loads display at 0.1 resolution in the display unit with no plate quantisation (a logged value is never altered for display); only *suggested* loads are quantised, rounding down, to the user's equipment step (defaults: barbell 2.5 kg or 5 lb, dumbbells 5 kg or 10 lb per pair, from the content review's verified plate table). Body mass displays at 0.1. Entered values are converted exactly and stored with `enteredUnit`. Deltas are `current − reference`: negative body-mass delta means loss; negative weekly delta means sessions missed. Every physical quantity in code carries a unit comment.

**Dates:** `LocalDate` is `"YYYY-MM-DD"` in the profile's IANA zone, produced only by `src/domain/dates.ts`. Week starts Monday (ISO). Tests for date logic run fixtures in `Europe/Athens`, `America/New_York`, `America/Los_Angeles`, and `UTC`, across both DST transitions; a 168-day programme must measure 168 days in every zone.

**Content Security Policy (meta tag in `index.html`; enforced in CI by grepping `dist/index.html`):**
`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' https://*.workers.dev; frame-src https://yewtu.be https://inv.nadeko.net https://invidious.nerdvpn.de https://iv.duti.dev https://invidious.f5.si https://id.420129.xyz; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'`.
(`connect-src` is tightened to the exact Worker hostname in P5 once it exists; the `frame-src` host list is generated from `src/config/videoInstances.ts` at build time by a Vite HTML transform so the two never drift.) No inline `<script>`, no `eval`, no runtime JSX. `<meta name="referrer" content="no-referrer">`.

**Personal data:** no medication, biometric, or location strings in tracked source. CI gate: `git grep -nEi 'vyvans[e]|lisdexamfetamin[e]|ymc[a]|amphetamin[e]' -- ':!docs/review/*' ':!REFERENCES.md'` must return nothing after P7's cutover; during P1–P6 the legacy tree under `legacy/` is scrubbed of the lines listed in the content review §7 and security H1 before the baseline commit.

> **Deviation, flagged in "Master plan amendments requested" below.** Master plan §3 writes the four identifiers as bare literals. A gate whose pattern is a bare literal matches the workflow file that defines it and the master plan that specifies it, so it can never return nothing. The final character of each alternative is written as a one-character class (`[e]`, `[a]`) here, in `ci.yml`, and — by the amendment — in master plan §3. The regex matches exactly the same four strings; the pattern text no longer contains any of them. This document deliberately never writes any of the four identifiers as a literal.

**Storage:** single key `fti.v3`, owned by `src/store/persistence.ts`; payload carries `schemaVersion`; every load, import, and paste passes `AppStateSchema.safeParse`; on failure keep last known-good state in memory, show the error, offer export; `QuotaExceededError` shows a blocking banner. No derived values persisted.

**Destructive actions:** typed confirmation (`type DELETE`) plus automatic JSON export download before the wipe. No always-visible wipe control.

**Tests:** Vitest; unit tests next to modules as `*.test.ts`; UI tests with Testing Library under `src/ui/**/*.test.tsx`; property tests with fast-check for units and schema round-trips. `npm test` must pass before every commit.

**Tone in all user-facing copy:** clinical, formal, honest; no hype, no emoji, no motivational filler (the video is the one sanctioned exception). Terminology: use the defined quantity (kcal, g protein, kg, mL, RPE, RIR, 1RM) never a colloquial stand-in.

**Commits:** each task ends with a commit on `main` of this repository (no push unless the user asks). Commit messages: `feat|fix|test|chore|docs: <summary>`.

---

## Verification gate for this plan (master plan §7, P7 row)

| Gate | Pass criterion |
| --- | --- |
| migration | the user's real `fti.console.v2` export migrates with the unit prompt and the set count matches |
| docs | `README.md` contains no stale file lists; `DEPLOY.md` and `PROJECT_SUMMARY.md` are gone |
| legacy | `legacy/` is deleted from the tree and from git history's HEAD |
| personal data | the §3 grep gate returns nothing and is enforced in `ci.yml` |

Stated before the work: the migration gate is checked in Task 2 against a constructed fixture whose set count is known exactly (23 `LoggedSet` records from 20 `sets[]` keys plus 2 weekly push-up maxima plus 1 more), and again in Task 7 step "run the wizard on the user's phone" against the real store. The extra set is the fixture's hostile `weight: 1e999`: refused as non-finite when read as an in-memory object, but a device only ever stores JSON text, and `JSON.stringify` serialises that value as `null`, which the migration accepts as load-not-recorded.

---

## File structure

**Created**

| Path | Responsibility |
| --- | --- |
| `src/domain/migrations/v2plan.ts` | Frozen copy of the legacy `PLAN` decoding table. Data + pure decoders only. |
| `src/domain/migrations/v2plan.test.ts` | Table integrity; every id exists in the P2 library. |
| `src/domain/migrations/v2.ts` | `migrateV2` and `applyMigration`. No React, no storage access. |
| `src/domain/migrations/v2.test.ts` | Fixture-driven, both unit systems, every skip path. |
| `src/domain/migrations/fixtures/v2-sample.json` | Hand-built legacy store: 20 set keys over two weeks plus every rejection case. |
| `src/test/migrationFactories.ts` | `makeProfile`, `makePlan`, `makeAvailability`, `makeBlankState` for P7 tests. |
| `src/ui/migration/MigrationWizard.tsx` | The prompt, the report, the legacy download, the apply. |
| `src/ui/migration/MigrationWizard.test.tsx` | Wizard flow, including "no profile" and "no start date". |
| `src/ui/migration/MigrationGate.tsx` | Decides whether the wizard or the app renders. |
| `src/ui/migration/MigrationGate.test.tsx` | Gate conditions. |
| `src/domain/training/records.ts` | `computeRecords`, `weeklyAmrapMax` — shared by LogView and the summary export. |
| `src/domain/training/records.test.ts` | Tie-breaks and the reps > 10 e1RM guard. |
| `src/ui/components/BodyMassChart.tsx` | Ported `WeightChart`; domain from data, unit from profile, projection from the nutrition rate. |
| `src/ui/components/BodyMassChart.test.tsx` | Domain, projection, no `NaN` in any path. |
| `src/ui/components/ComplianceGrid.tsx` | Week rows × slot days from `assignments`, O(n). |
| `src/ui/components/ComplianceGrid.test.tsx` | Index build and cell status. |
| `src/ui/components/PRList.tsx` | Best e1RM and best load × reps per exercise, unit-formatted. |
| `src/ui/components/PRList.test.tsx` | Rendering and formatting. |
| `src/ui/components/AmrapSpark.tsx` | Weekly best AMRAP reps for one bodyweight exercise. |
| `src/ui/components/AmrapSpark.test.tsx` | Weekly maxima and empty state. |
| `src/ui/components/ConfirmDestructive.tsx` | Typed-`DELETE` confirmation shell. |
| `src/ui/components/ConfirmDestructive.test.tsx` | Confirm button stays disabled until the word matches. |
| `src/app/download.ts` | `downloadText(filename, text, mime?)`, the only Blob and anchor code. |
| `src/domain/export/summary.ts` | `buildSummary(state, profileId, now)` → plain text. |
| `src/domain/export/summary.test.ts` | Unit system stated; no hard-coded baseline. |
| `src/domain/export/ics.ts` | `buildIcs(events, timeZone, nowMs)` returns RFC 5545 text. |
| `src/domain/export/ics.test.ts` | CRLF, folding, `VALARM`, escaping. |
| `README.md` | The only prose deliverable that ships. |

**Modified**

| Path | Change |
| --- | --- |
| `src/domain/types.ts` | Add `AppState.notes`, `AppState.customExercises`, `UiPrefs.legacyMigration`. |
| `src/domain/schema.ts` | Zod mirrors for the three additions. |
| `src/store/persistence.ts` | Add `readLegacyV2Raw`, `readLegacyBundle`, `hasLegacyV2`, `hasAnyLegacyKey`, `deleteLegacyV2`. |
| `src/app/App.tsx` | Wrap the view switch in `<MigrationGate>`. |
| `src/ui/views/LogView.tsx` | Replace the placeholder with the real view. |
| `src/ui/views/ExportView.tsx` | Replace the placeholder with the real view. |
| `src/ui/views/SettingsView.tsx` | Add the destructive block. |
| `.github/workflows/ci.yml` | Add the personal-data gate step. |
| `docs/plans/2026-09-01-00-master-plan.md` | §3 grep pattern → bracketed form (amendment). |

**Deleted**

`DEPLOY.md`, `PROJECT_SUMMARY.md`, `legacy/` (whole directory).

---

### Task 1: `src/domain/migrations/v2plan.ts` — the frozen legacy decoding table

**Files:**
- Create: `src/domain/migrations/v2plan.ts`
- Create: `src/domain/migrations/v2plan.test.ts`

**Interfaces:**
- Consumes: `addDays(date: LocalDate, n: number): LocalDate` and `isValidLocalDate(s: string): s is LocalDate` from `src/domain/dates.ts` (P1, master plan §6.2); `LocalDate` from `src/domain/types.ts` (P1, §5); `EXERCISE_LIBRARY` from `src/domain/plan/library.ts` (P2, master plan §4) — a `Record<string, Exercise>` keyed by `Exercise.id`.
- Produces, for Task 2:
  - `LEGACY_SESSION_ID: "legacy-v2"`
  - `V2_VOLUME: readonly { sets: number; deload: boolean }[]` (24 entries, index 0 = week 1)
  - `V2_DAYS: readonly LegacyDay[]` (7 entries, index 0 = day 1)
  - `V2_DAY_LABEL: Readonly<Record<number, string | null>>`
  - `legacyDateOf(startDate: LocalDate, week: number, day: number): LocalDate`
  - `legacySlot(day: number, exIdx: number): LegacyExerciseSlot | null`
  - `legacyExerciseIdAt(day: number, exIdx: number, week: number): string | null`
  - `legacyTargetSets(setsSpec: string, week: number): number`
  - `legacyIdForName(name: string): string | null`
  - types `LegacyDay`, `LegacyExerciseSlot`, `LegacyExerciseRange`, `LegacyDayKind`

- [ ] **Step 1: Read the P2 exercise-library ids that this table must reference**

The table maps each legacy exercise name to an id in the P2 library. Confirm the ids exist and note the exact export name.

Run: `grep -nE "^\s*(export const EXERCISE_LIBRARY|id: \")" src/domain/plan/library.ts | head -40`
Expected: one line naming the exported record, then a list of `id: "..."` lines. Record the export name; the code below assumes `EXERCISE_LIBRARY`. If the export is named differently, use that name in `v2plan.test.ts` — it is used only by the test, never by `v2plan.ts` itself, which is deliberately dependency-free.

- [ ] **Step 2: Write the failing table-integrity test**

Create `src/domain/migrations/v2plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "../plan/library";
import {
  LEGACY_SESSION_ID,
  V2_DAYS,
  V2_DAY_LABEL,
  V2_VOLUME,
  legacyDateOf,
  legacyExerciseIdAt,
  legacyIdForName,
  legacySlot,
  legacyTargetSets,
} from "./v2plan";

describe("V2_VOLUME", () => {
  it("has one entry per legacy week", () => {
    expect(V2_VOLUME).toHaveLength(24);
  });

  it("marks exactly the four legacy deload weeks (data.js:83,89,95,101)", () => {
    const deloadWeeks = V2_VOLUME.flatMap((v, i) => (v.deload ? [i + 1] : []));
    expect(deloadWeeks).toEqual([6, 12, 18, 24]);
  });

  it("reproduces the legacy set ramp", () => {
    expect(V2_VOLUME.map((v) => v.sets)).toEqual([
      2, 2, 3, 3, 3, 2, 3, 4, 4, 4, 4, 2, 4, 4, 4, 4, 4, 2, 4, 4, 4, 4, 4, 2,
    ]);
  });
});

describe("V2_DAYS", () => {
  it("has the seven legacy rotation days in order", () => {
    expect(V2_DAYS.map((d) => d.name)).toEqual([
      "Push",
      "Pull",
      "Legs",
      "Rest",
      "Upper Power",
      "Cardio + Core",
      "Full Rest",
    ]);
  });

  it("keeps the legacy exercise counts per day", () => {
    expect(V2_DAYS.map((d) => d.exercises.length)).toEqual([5, 6, 5, 2, 5, 5, 1]);
  });

  it("covers weeks 1..24 with no gap and no overlap in every slot", () => {
    for (const day of V2_DAYS) {
      for (const slot of day.exercises) {
        const covered: number[] = [];
        for (const r of slot.ranges) {
          for (let w = r.fromWeek; w <= r.toWeek; w++) covered.push(w);
        }
        covered.sort((a, b) => a - b);
        expect(covered, `${day.name} / ${slot.legacyName}`).toEqual(
          Array.from({ length: 24 }, (_, i) => i + 1),
        );
      }
    }
  });

  it("references only ids that exist in the P2 exercise library", () => {
    const missing: string[] = [];
    for (const day of V2_DAYS) {
      for (const slot of day.exercises) {
        for (const r of slot.ranges) {
          if (r.exerciseId !== null && EXERCISE_LIBRARY[r.exerciseId] === undefined) {
            missing.push(`${day.name} / ${slot.legacyName} -> ${r.exerciseId}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("the two slots whose exercise changes mid-programme", () => {
  it("day 3 slot 2 is leg press to week 4 and Bulgarian split squat from week 5", () => {
    expect(legacyExerciseIdAt(3, 2, 4)).toBe("leg-press");
    expect(legacyExerciseIdAt(3, 2, 5)).toBe("bulgarian-split-squat");
    expect(legacyExerciseIdAt(3, 2, 24)).toBe("bulgarian-split-squat");
  });

  it("day 5 slot 0 is trap bar deadlift to week 8 and conventional from week 9", () => {
    expect(legacyExerciseIdAt(5, 0, 8)).toBe("trap-bar-deadlift");
    expect(legacyExerciseIdAt(5, 0, 9)).toBe("conventional-deadlift");
  });

  it("leaves every other slot week-independent", () => {
    expect(legacyExerciseIdAt(1, 0, 1)).toBe("barbell-bench-press");
    expect(legacyExerciseIdAt(1, 0, 24)).toBe("barbell-bench-press");
  });
});

describe("legacySlot", () => {
  it("returns null for an index past the day's exercise list", () => {
    expect(legacySlot(1, 9)).toBeNull();
  });

  it("returns null for a day outside 1..7", () => {
    expect(legacySlot(0, 0)).toBeNull();
    expect(legacySlot(8, 0)).toBeNull();
  });

  it("returns the slot for a valid index", () => {
    expect(legacySlot(2, 3)?.legacyName).toBe("Face pulls");
  });
});

describe("legacyTargetSets (reproduces console-store.jsx:372-383)", () => {
  it("returns 2 in a deload week regardless of the spec", () => {
    expect(legacyTargetSets("3→4", 6)).toBe(2);
    expect(legacyTargetSets("4", 12)).toBe(2);
  });

  it("clamps an arrow spec between its bounds using the week's volume", () => {
    expect(legacyTargetSets("2→4", 1)).toBe(2);
    expect(legacyTargetSets("2→4", 3)).toBe(3);
    expect(legacyTargetSets("2→4", 8)).toBe(4);
    expect(legacyTargetSets("2→3", 8)).toBe(3);
  });

  it("uses a fixed count verbatim", () => {
    expect(legacyTargetSets("3", 8)).toBe(3);
  });

  it("falls back to 2 for the em-dash sentinel", () => {
    expect(legacyTargetSets("—", 8)).toBe(2);
  });

  it("falls back to 2 for a week outside 1..24", () => {
    expect(legacyTargetSets("4", 99)).toBe(2);
  });
});

describe("legacyDateOf (console-store.jsx:68-77)", () => {
  it("puts week 1 day 1 on the start date itself", () => {
    expect(legacyDateOf("2026-01-05", 1, 1)).toBe("2026-01-05");
  });

  it("advances seven days per week and one per day", () => {
    expect(legacyDateOf("2026-01-05", 1, 7)).toBe("2026-01-11");
    expect(legacyDateOf("2026-01-05", 2, 1)).toBe("2026-01-12");
    expect(legacyDateOf("2026-01-05", 24, 7)).toBe("2026-06-21");
  });

  it("measures 167 days from week 1 day 1 to week 24 day 7", () => {
    const first = legacyDateOf("2026-01-05", 1, 1);
    const last = legacyDateOf("2026-01-05", 24, 7);
    expect(first).toBe("2026-01-05");
    expect(last).toBe("2026-06-21");
  });
});

describe("legacyIdForName", () => {
  it("maps a legacy display name to a library id", () => {
    expect(legacyIdForName("Face pulls")).toBe("face-pull");
  });

  it("maps an ambiguous slot name to the id of its first week range", () => {
    expect(legacyIdForName("Trap bar DL → conventional")).toBe("trap-bar-deadlift");
  });

  it("returns null for an unknown name", () => {
    expect(legacyIdForName("Kettlebell swing")).toBeNull();
  });

  it("returns null for a slot with no library equivalent", () => {
    expect(legacyIdForName("No training")).toBeNull();
  });
});

describe("V2_DAY_LABEL", () => {
  it("labels only the five legacy training days", () => {
    expect(V2_DAY_LABEL[1]).toBe("Push");
    expect(V2_DAY_LABEL[4]).toBeNull();
    expect(V2_DAY_LABEL[7]).toBeNull();
  });
});

describe("LEGACY_SESSION_ID", () => {
  it("is a stable literal other modules can compare against", () => {
    expect(LEGACY_SESSION_ID).toBe("legacy-v2");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/domain/migrations/v2plan.test.ts`
Expected: FAIL — `Failed to resolve import "./v2plan"`.

- [ ] **Step 4: Write `src/domain/migrations/v2plan.ts`**

```ts
// src/domain/migrations/v2plan.ts
//
// Frozen decoding table for the legacy console store (localStorage key
// "fti.console.v2"). Every value is copied verbatim from the legacy `data.js`
// (`window.PLAN`) as it stood at the cutover commit. It exists ONLY to decode keys
// that are already on the user's phone. It is not a training plan, it is never used
// to prescribe anything, and it must never be edited to "improve" the programme:
// editing it silently rewrites the user's history.
//
// Legacy key scheme (console-store.jsx:152, console-train.jsx:391):
//   sets[`${week}-${day}-${exIdx}-${setNumber}`]
//     week      1..24
//     day       1..7      position in a fixed 7-day rotation, NOT a calendar weekday
//     exIdx     0..n-1    index into PLAN.days[day-1].exercises
//               1000 + i  the i-th user-added exercise of that (week, day)
//     setNumber 1-based
//
// Legacy calendar semantics (console-store.jsx:68-77, `programPosition`):
//   day 1 of week 1 IS `startDate`; the day index is (week - 1) * 7 + (day - 1).
//
// Two slots and only two change which exercise they mean part-way through the
// programme. Both are recorded in data.js as a note on a single slot rather than as a
// second exercise list, so the LIST ITSELF never differs between phases — the length,
// the order and every other slot are constant across all 24 weeks:
//   day 3 slot 2 "Leg press → Bulgarian split"  note "Bulgarian from wk 5"
//                (data.js:154; corroborated by the week-5 volume note, data.js:82)
//   day 5 slot 0 "Trap bar DL → conventional"   note "Conventional from wk 9. Always first."
//                (data.js:177; corroborated by the week-9 volume note, data.js:86, and
//                 by the phase-2 summary, data.js:43)
// Everything else in data.js that varies by week — set counts and deloads — varies in
// PLAN.volume, which is reproduced below as V2_VOLUME, not in the exercise lists.

import type { LocalDate } from "../types";
import { addDays } from "../dates";

/**
 * Session id carried by every migrated set whose legacy day has no equally named
 * session in the user's new plan. It is a real, stable id, not a sentinel: the Log
 * view groups by it and shows it as "legacy import".
 */
export const LEGACY_SESSION_ID = "legacy-v2";

export const LEGACY_WEEKS = 24;
export const LEGACY_DAYS_PER_WEEK = 7;

export type LegacyDayKind = "lift" | "cardio" | "rest";

export interface LegacyExerciseRange {
  /** inclusive legacy week number, 1..24 */
  fromWeek: number;
  /** inclusive legacy week number, 1..24 */
  toWeek: number;
  /** id in src/domain/plan/library.ts, or null when the slot has no library equivalent */
  exerciseId: string | null;
}

export interface LegacyExerciseSlot {
  /** PLAN.days[d-1].exercises[i].name, verbatim */
  legacyName: string;
  /** PLAN.days[d-1].exercises[i].sets, verbatim: "2→4", "3", "—" */
  setsSpec: string;
  /** covers weeks 1..24 with no gap and no overlap */
  ranges: readonly LegacyExerciseRange[];
}

export interface LegacyDay {
  /** 1..7 */
  day: number;
  /** PLAN.days[d-1].name, verbatim */
  name: string;
  kind: LegacyDayKind;
  exercises: readonly LegacyExerciseSlot[];
}

/** Every slot that never changes exercise gets this shape. */
function allWeeks(exerciseId: string | null): readonly LegacyExerciseRange[] {
  return [{ fromWeek: 1, toWeek: LEGACY_WEEKS, exerciseId }];
}

/**
 * PLAN.volume (data.js:77-102). Index 0 is week 1.
 * `sets` is the volume-ramp target; `deload` forces the target to 2 (console-store.jsx:374).
 */
export const V2_VOLUME: readonly { sets: number; deload: boolean }[] = [
  { sets: 2, deload: false }, // w1  baseline, establish form
  { sets: 2, deload: false }, // w2
  { sets: 3, deload: false }, // w3
  { sets: 3, deload: false }, // w4
  { sets: 3, deload: false }, // w5  Bulgarian split squats introduced
  { sets: 2, deload: true },  // w6  deload
  { sets: 3, deload: false }, // w7
  { sets: 4, deload: false }, // w8
  { sets: 4, deload: false }, // w9  conventional deadlift reintroduced
  { sets: 4, deload: false }, // w10
  { sets: 4, deload: false }, // w11
  { sets: 2, deload: true },  // w12 deload
  { sets: 4, deload: false }, // w13
  { sets: 4, deload: false }, // w14
  { sets: 4, deload: false }, // w15
  { sets: 4, deload: false }, // w16
  { sets: 4, deload: false }, // w17
  { sets: 2, deload: true },  // w18 deload
  { sets: 4, deload: false }, // w19
  { sets: 4, deload: false }, // w20
  { sets: 4, deload: false }, // w21
  { sets: 4, deload: false }, // w22
  { sets: 4, deload: false }, // w23
  { sets: 2, deload: true },  // w24 deload
];

/**
 * PLAN.days (data.js:115-208). Index 0 is day 1.
 * `Barbell row (Pendlay)` (day 2) and `Barbell row (heavier)` (day 5) are kept as two
 * distinct library ids because the legacy app keyed personal records on the display
 * name and therefore tracked them separately. Merging them here would rewrite history.
 */
export const V2_DAYS: readonly LegacyDay[] = [
  {
    day: 1,
    name: "Push",
    kind: "lift",
    exercises: [
      { legacyName: "Barbell bench press", setsSpec: "2→4", ranges: allWeeks("barbell-bench-press") },
      { legacyName: "Overhead press (barbell)", setsSpec: "2→4", ranges: allWeeks("barbell-overhead-press") },
      { legacyName: "Incline DB press", setsSpec: "2→3", ranges: allWeeks("incline-dumbbell-press") },
      { legacyName: "Lateral raises", setsSpec: "2→3", ranges: allWeeks("lateral-raise") },
      { legacyName: "Tricep overhead extension", setsSpec: "2→3", ranges: allWeeks("overhead-triceps-extension") },
    ],
  },
  {
    day: 2,
    name: "Pull",
    kind: "lift",
    exercises: [
      { legacyName: "Pull-ups (or lat pulldown)", setsSpec: "2→4", ranges: allWeeks("pull-up") },
      { legacyName: "Barbell row (Pendlay)", setsSpec: "2→4", ranges: allWeeks("pendlay-row") },
      { legacyName: "DB single-arm row", setsSpec: "2→3", ranges: allWeeks("dumbbell-single-arm-row") },
      { legacyName: "Face pulls", setsSpec: "3", ranges: allWeeks("face-pull") },
      { legacyName: "Barbell bicep curl", setsSpec: "2→3", ranges: allWeeks("barbell-biceps-curl") },
      { legacyName: "Hammer curl", setsSpec: "2", ranges: allWeeks("hammer-curl") },
    ],
  },
  {
    day: 3,
    name: "Legs",
    kind: "lift",
    exercises: [
      { legacyName: "Barbell back squat", setsSpec: "2→4", ranges: allWeeks("barbell-back-squat") },
      { legacyName: "Romanian deadlift", setsSpec: "2→3", ranges: allWeeks("romanian-deadlift") },
      {
        legacyName: "Leg press → Bulgarian split",
        setsSpec: "2→3",
        // data.js:154 note "Bulgarian from wk 5"
        ranges: [
          { fromWeek: 1, toWeek: 4, exerciseId: "leg-press" },
          { fromWeek: 5, toWeek: LEGACY_WEEKS, exerciseId: "bulgarian-split-squat" },
        ],
      },
      { legacyName: "Leg curl (machine)", setsSpec: "2→3", ranges: allWeeks("lying-leg-curl") },
      { legacyName: "Calf raise", setsSpec: "3→4", ranges: allWeeks("standing-calf-raise") },
    ],
  },
  {
    day: 4,
    name: "Rest",
    kind: "rest",
    exercises: [
      { legacyName: "Push-ups (3 × max)", setsSpec: "3", ranges: allWeeks("push-up") },
      // "Light walk" has no load, no reps and no library entry; sets: "—".
      { legacyName: "Light walk", setsSpec: "—", ranges: allWeeks(null) },
    ],
  },
  {
    day: 5,
    name: "Upper Power",
    kind: "lift",
    exercises: [
      {
        legacyName: "Trap bar DL → conventional",
        setsSpec: "4",
        // data.js:177 note "Conventional from wk 9. Always first."
        ranges: [
          { fromWeek: 1, toWeek: 8, exerciseId: "trap-bar-deadlift" },
          { fromWeek: 9, toWeek: LEGACY_WEEKS, exerciseId: "conventional-deadlift" },
        ],
      },
      { legacyName: "Weighted pull-ups", setsSpec: "3", ranges: allWeeks("weighted-pull-up") },
      { legacyName: "Close-grip bench press", setsSpec: "3", ranges: allWeeks("close-grip-bench-press") },
      { legacyName: "Barbell row (heavier)", setsSpec: "3", ranges: allWeeks("barbell-row") },
      { legacyName: "Push press", setsSpec: "3", ranges: allWeeks("push-press") },
    ],
  },
  {
    day: 6,
    name: "Cardio + Core",
    kind: "cardio",
    exercises: [
      { legacyName: "Rower intervals", setsSpec: "—", ranges: allWeeks("rowing-intervals") },
      { legacyName: "Stair climber", setsSpec: "—", ranges: allWeeks("stair-climber") },
      { legacyName: "Plank", setsSpec: "3", ranges: allWeeks("plank") },
      { legacyName: "Ab wheel rollout", setsSpec: "3", ranges: allWeeks("ab-wheel-rollout") },
      { legacyName: "Hanging knee raise", setsSpec: "3", ranges: allWeeks("hanging-knee-raise") },
    ],
  },
  {
    day: 7,
    name: "Full Rest",
    kind: "rest",
    exercises: [
      // "No training" is a placeholder row, not an exercise.
      { legacyName: "No training", setsSpec: "—", ranges: allWeeks(null) },
    ],
  },
];

/**
 * The session label a legacy day claims, for matching against PlannedSession.label in
 * the user's new plan. `null` means the legacy day was a rest day and claims no label.
 * Day 6 claims "Cardio" but is matched on SessionKind in v2.ts, not on this string.
 */
export const V2_DAY_LABEL: Readonly<Record<number, string | null>> = {
  1: "Push",
  2: "Pull",
  3: "Legs",
  4: null,
  5: "Upper Power",
  6: "Cardio",
  7: null,
};

/** The legacy day record, or null when `day` is outside 1..7. */
export function legacyDay(day: number): LegacyDay | null {
  return V2_DAYS[day - 1] ?? null;
}

/** The slot at `exIdx` of `day`, or null when either index is out of range. */
export function legacySlot(day: number, exIdx: number): LegacyExerciseSlot | null {
  const d = legacyDay(day);
  if (d === null) return null;
  return d.exercises[exIdx] ?? null;
}

/**
 * The library id this (day, exIdx) meant in `week`, or null when the slot has no
 * library equivalent, the indices are out of range, or the week is outside 1..24.
 */
export function legacyExerciseIdAt(day: number, exIdx: number, week: number): string | null {
  const slot = legacySlot(day, exIdx);
  if (slot === null) return null;
  for (const r of slot.ranges) {
    if (week >= r.fromWeek && week <= r.toWeek) return r.exerciseId;
  }
  return null;
}

/**
 * Reproduces console-store.jsx:372-383 (`setsForWeek`) exactly, including its
 * fallbacks, so that `isBonus` on a migrated set means what it meant in the old app:
 * a set logged beyond the prescribed count for that week.
 */
export function legacyTargetSets(setsSpec: string, week: number): number {
  const vol = V2_VOLUME[week - 1];
  if (vol === undefined) return 2;
  if (vol.deload) return 2;
  const m = /(\d+)\s*→\s*(\d+)/.exec(setsSpec);
  if (m !== null) {
    const lo = Number.parseInt(m[1] ?? "", 10);
    const hi = Number.parseInt(m[2] ?? "", 10);
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
      return Math.min(hi, Math.max(lo, vol.sets));
    }
    return 2;
  }
  const n = Number.parseInt(setsSpec, 10);
  return Number.isFinite(n) ? n : 2;
}

/**
 * (week, day) -> calendar date, using the legacy rule that day 1 of week 1 is the
 * start date itself. `week` and `day` are 1-based; the caller validates their ranges.
 */
export function legacyDateOf(startDate: LocalDate, week: number, day: number): LocalDate {
  return addDays(startDate, (week - 1) * 7 + (day - 1));
}

/**
 * Display name -> library id, for the `exName` field frozen into legacy set payloads
 * and for the `exercise` field on legacy specimen records. For the two slots whose
 * exercise changes mid-programme the name alone is ambiguous, so this returns the id
 * of the FIRST week range; callers that hold a week number use `legacyExerciseIdAt`
 * instead, which is exact.
 */
export function legacyIdForName(name: string): string | null {
  const key = name.trim();
  for (const day of V2_DAYS) {
    for (const slot of day.exercises) {
      if (slot.legacyName === key) return slot.ranges[0]?.exerciseId ?? null;
    }
  }
  return null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/domain/migrations/v2plan.test.ts`
Expected: PASS, 20 tests.

If "references only ids that exist in the P2 exercise library" fails, the P2 library named those exercises differently. Fix the ids **in `V2_DAYS`**, never in the library: this table is the only place the mapping lives, and the library is the contract P2 already shipped.

- [ ] **Step 6: Run the whole suite and lint**

Run: `npm test && npx eslint src/domain/migrations`
Expected: all suites pass; eslint prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/domain/migrations/v2plan.ts src/domain/migrations/v2plan.test.ts
git commit -m "feat: freeze the legacy PLAN decoding table for the v2 migration"
```

---

### Task 2: `src/domain/migrations/v2.ts` — the migration itself

**Files:**
- Modify: `src/domain/types.ts` (add `AppState.notes`, `AppState.customExercises`, `UiPrefs.legacyMigration`)
- Modify: `src/domain/schema.ts` (Zod mirrors for the three additions)
- Create: `src/test/migrationFactories.ts`
- Create: `src/domain/migrations/fixtures/v2-sample.json`
- Create: `src/domain/migrations/v2.ts`
- Create: `src/domain/migrations/v2.test.ts`

**Interfaces:**
- Consumes: `legacyDateOf`, `legacyExerciseIdAt`, `legacySlot`, `legacyTargetSets`, `legacyIdForName`, `V2_DAY_LABEL`, `LEGACY_SESSION_ID` from Task 1; `newId(): string` from `src/domain/ids.ts` (P1); `toStoredLoad(entered: number, units: UnitSystem): Kg`, `toStoredMass(entered: number, units: UnitSystem): Kg` from `src/domain/units.ts` (P1, §6.1); `instantOf(date, time, tz): EpochMs`, `isValidLocalDate(s): s is LocalDate`, `compareLocalDate(a, b): -1 | 0 | 1` from `src/domain/dates.ts` (P1, §6.2); `CURRENT_SCHEMA_VERSION: number` from `src/domain/schema.ts` (P1).
- Produces, for Tasks 3, 5 and 6:
  - `migrateV2(raw: unknown, opts: MigrateV2Options): MigrateV2Result`
  - `applyMigration(base: AppState, migrated: AppState, profileId: string): ApplyMigrationResult`
  - `MigrateV2Options`, `MigrateV2Result`, `ApplyMigrationResult`, `MigrationReport`,
    `MigrationSkip`, `LegacyUnit`
  - `CUP_ML: 500`
- Produces, for every P7 test file: `makeProfile`, `makePlan`, `makeAvailability`, `makeBlankState` from `src/test/migrationFactories.ts`.

- [ ] **Step 1: Add the three fields to `src/domain/types.ts`**

In `UiPrefs`, add the last field:

```ts
// ---- ui preferences (persisted) ----
export interface UiPrefs {
  bootSeen: boolean;
  lastView: string;
  accent: string;
  scanlines: boolean;
  flicker: boolean;
  density: "compact" | "normal";
  /**
   * State of the one-way import from the legacy console store.
   * "pending"   nothing has been decided yet (the default for every new install)
   * "done"      the wizard ran and its result was committed
   * "dismissed" the user chose to start clean; the legacy key is left untouched
   */
  legacyMigration: "pending" | "done" | "dismissed";
}
```

In `AppState`, add two slices immediately after `sets`:

```ts
  sets: Record<string, LoggedSet>;
  /** profileId -> LocalDate -> free-text note for that day. Migrated from the v2 `notes` map. */
  notes: Record<string, Record<LocalDate, string>>;
  /** profileId -> exercises the user added themselves. Ids are stable (never `1000 + index`). */
  customExercises: Record<string, Exercise[]>;
```

- [ ] **Step 2: Find the exercise schema's export name**

Run: `grep -nE "Exercise[A-Za-z]*Schema" src/domain/schema.ts | head`
Expected: at least one line, e.g. `export const ExerciseSchema = z.object({`. Use that exact name in the next step.

- [ ] **Step 3: Add the Zod mirrors to `src/domain/schema.ts`**

Add above `AppStateSchema`:

```ts
/** "YYYY-MM-DD"; the record KEY type for the notes slice. */
const LocalDateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/** profileId -> LocalDate -> note. 20 000 characters is generous for a day's note and
 *  bounded so a hostile import cannot inflate the payload past the storage quota. */
export const NotesSliceSchema = z.record(
  z.string().min(1),
  z.record(LocalDateKeySchema, z.string().max(20_000)),
);

/** profileId -> user-added exercises. */
export const CustomExercisesSliceSchema = z.record(z.string().min(1), z.array(ExerciseSchema));
```

Inside the `z.object({ ... })` passed to `AppStateSchema`, add the two slices next to `sets` and extend `UiPrefsSchema`:

```ts
  notes: NotesSliceSchema.default({}),
  customExercises: CustomExercisesSliceSchema.default({}),
```

```ts
  legacyMigration: z.enum(["pending", "done", "dismissed"]).default("pending"),
```

`.default(...)` is required on all three: a `fti.v3` payload written by P1–P6 has none of these keys, and without the defaults every existing development install would fail `safeParse` on the next boot and land in the recovery UI.

- [ ] **Step 4: Run the P1 schema suite to verify the additions did not break it**

Run: `npx vitest run src/domain/schema.test.ts`
Expected: PASS. The round-trip property test now also covers the three new fields.

- [ ] **Step 5: Commit the contract change**

```bash
git add src/domain/types.ts src/domain/schema.ts
git commit -m "feat: add notes, customExercises and ui.legacyMigration to the app state"
```

- [ ] **Step 6: Write the test factories**

Create `src/test/migrationFactories.ts`:

```ts
// Fixtures shared by the P7 tests. Deliberately explicit: every field of Profile and
// PlanTemplate is written out so a reader can see exactly what the migration is given.
import { CURRENT_SCHEMA_VERSION } from "../domain/schema";
import type {
  AppState,
  Availability,
  PlanTemplate,
  Profile,
} from "../domain/types";

export function makeProfile(patch: Partial<Profile> = {}): Profile {
  const base: Profile = {
    id: "p1",
    displayName: "Test subject",
    timezone: "Europe/Athens",
    units: "metric",
    createdAt: 1767600000000, // 2026-01-05T08:00:00Z
    body: {
      sex: "male",
      birthYear: 1996,
      heightCm: 178,
      baselineMassKg: 95.3, // kg
      baselineAt: "2026-01-05",
      baselineBodyFatPct: 27,
    },
    activity: "light",
    experience: "intermediate",
    equipment: "full-gym",
    equipmentSteps: {
      barbellKg: 2.5, // kg total
      dumbbellPairKg: 5, // kg per pair
      stackKg: 5, // kg per pin
      hasMicroPlates: false,
    },
    goal: {
      kind: "fat-loss",
      targetMassKg: 79, // kg
      targetBodyFatPct: 12,
      targetDate: "2026-06-21",
    },
    supplements: { creatine: true },
    hydration: { dailyTargetML: 3000, cupSizeML: 500 }, // mL
  };
  return { ...base, ...patch };
}

export function makePlan(patch: Partial<PlanTemplate> = {}): PlanTemplate {
  const base: PlanTemplate = {
    id: "plan-upper-lower",
    version: 1,
    name: "Upper / Lower ×2",
    sessionsPerWeek: 4,
    weeks: 12,
    sessions: [
      {
        id: "s-push",
        ordinal: 0,
        name: "Push",
        kind: "lift",
        label: "Push",
        exercises: [
          {
            exerciseId: "barbell-bench-press",
            setsLo: 3,
            setsHi: 4,
            prescription: { kind: "reps", lo: 6, hi: 8 },
            restS: 180, // s
          },
        ],
      },
      {
        id: "s-pull",
        ordinal: 1,
        name: "Pull",
        kind: "lift",
        label: "Pull",
        exercises: [
          {
            exerciseId: "pendlay-row",
            setsLo: 3,
            setsHi: 4,
            prescription: { kind: "reps", lo: 6, hi: 8 },
            restS: 180, // s
          },
        ],
      },
      {
        id: "s-legs",
        ordinal: 2,
        name: "Legs",
        kind: "lift",
        label: "Legs",
        exercises: [
          {
            exerciseId: "barbell-back-squat",
            setsLo: 3,
            setsHi: 4,
            prescription: { kind: "reps", lo: 6, hi: 8 },
            restS: 180, // s
          },
        ],
      },
      {
        id: "s-cardio",
        ordinal: 3,
        name: "Conditioning",
        kind: "cardio",
        label: "Cardio",
        exercises: [
          {
            exerciseId: "rowing-intervals",
            setsLo: 1,
            setsHi: 1,
            prescription: { kind: "duration", targetS: 1200 }, // s
            restS: 0, // s
          },
        ],
      },
    ],
    blocks: [
      { index: 0, firstSessionIndex: 0, sessionCount: 20, setModifier: 1, loadModifier: 1, isDeload: false },
      { index: 1, firstSessionIndex: 20, sessionCount: 4, setModifier: 0.5, loadModifier: 1, isDeload: true },
    ],
  };
  return { ...base, ...patch };
}

export function makeAvailability(patch: Partial<Availability> = {}): Availability {
  const base: Availability = {
    slots: [
      { weekday: 1, startTime: "09:00", expectedDurationS: 4200 }, // s
      { weekday: 3, startTime: "09:00", expectedDurationS: 4200 }, // s
      { weekday: 5, startTime: "09:00", expectedDurationS: 4200 }, // s
      { weekday: 6, startTime: "10:00", expectedDurationS: 3600 }, // s
    ],
    weeklySessionTarget: 4,
  };
  return { ...base, ...patch };
}

/** A valid, empty v3 state carrying one profile and one plan. */
export function makeBlankState(profile = makeProfile(), plan = makePlan()): AppState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    availability: { [profile.id]: makeAvailability() },
    plans: { [plan.id]: plan },
    cursors: {
      [profile.id]: {
        planId: plan.id,
        nextSessionIndex: 0,
        startedOn: "2026-01-05",
        completedOn: null,
      },
    },
    pauses: {},
    assignments: {},
    sets: {},
    notes: {},
    customExercises: {},
    bodyMass: {},
    hydration: {},
    intake: {},
    weeklyReviews: {},
    reminderSettings: {},
    pushDevice: null,
    motivation: {},
    specimens: {},
    capsules: {},
    ui: {
      bootSeen: true,
      lastView: "today",
      accent: "#a3e635",
      scanlines: true,
      flicker: false,
      density: "normal",
      legacyMigration: "pending",
    },
  };
}
```

- [ ] **Step 7: Write the fixture**

Create `src/domain/migrations/fixtures/v2-sample.json`. It is a real legacy store shape
(`defaultState()` from `console-store.jsx:80-111` plus the four fields that file omits,
per code review A45), holding 20 decodable set keys across weeks 1 and 2 and one
instance of every rejection path.

```json
{
  "startDate": "2026-01-05",
  "bootSeen": true,
  "view": "log",
  "week": 2,
  "day": 3,
  "sets": {
    "1-1-0-1": { "weight": 60, "reps": 8, "ts": 1767610800000, "exName": "Barbell bench press", "repsLo": 6, "repsHi": 8 },
    "1-1-0-2": { "weight": 60, "reps": 7, "ts": 1767610860000, "exName": "Barbell bench press" },
    "1-1-1-1": { "weight": 35, "reps": 10, "ts": 1767611000000, "exName": "Overhead press (barbell)" },
    "1-1-1-2": { "weight": 35, "reps": 9, "ts": 1767611060000, "exName": "Overhead press (barbell)" },
    "1-1-2-1": { "weight": 22.5, "reps": 12, "ts": 1767611200000, "exName": "Incline DB press" },
    "1-1-2-2": { "weight": 22.5, "reps": 11, "ts": 1767611260000, "exName": "Incline DB press" },
    "1-1-1000-1": { "weight": 15, "reps": 15, "ts": 1767611400000, "exName": "Cable fly" },
    "1-2-0-1": { "weight": 0, "reps": 6, "ts": 1767697200000, "exName": "Pull-ups (or lat pulldown)" },
    "1-2-0-2": { "weight": 0, "reps": 5, "ts": 1767697260000, "exName": "Pull-ups (or lat pulldown)" },
    "1-2-1-1": { "weight": 60, "reps": 8, "ts": 1767697400000, "exName": "Barbell row (Pendlay)" },
    "1-2-1-2": { "weight": 60, "reps": 8, "ts": 1767697460000, "exName": "Barbell row (Pendlay)" },
    "1-3-2-1": { "weight": 80, "reps": 12, "ts": 1767783600000, "exName": "Leg press → Bulgarian split" },
    "1-3-2-2": { "weight": 80, "reps": 12, "ts": 1767783660000, "exName": "Leg press → Bulgarian split" },
    "2-1-0-1": { "weight": 62.5, "reps": 8, "ts": 1768215600000, "exName": "Barbell bench press" },
    "2-1-0-2": { "weight": 62.5, "reps": 8, "ts": 1768215660000, "exName": "Barbell bench press" },
    "2-1-0-3": { "weight": 62.5, "reps": 6, "ts": 1768215720000, "exName": "Barbell bench press" },
    "2-4-0-1": { "weight": 0, "reps": 20, "ts": 1768474800000, "exName": "Push-ups (3 × max)" },
    "2-4-0-2": { "weight": 0, "reps": 18, "ts": 1768474860000, "exName": "Push-ups (3 × max)" },
    "2-5-0-1": { "weight": 100, "reps": 5, "ts": 1768561200000, "exName": "Trap bar DL → conventional" },
    "2-5-0-2": { "weight": 100, "reps": 5, "ts": 1768561260000, "exName": "Trap bar DL → conventional" },

    "3-1-0-1": { "weight": -5, "reps": 5, "ts": 1769000000000, "exName": "Barbell bench press" },
    "1-2-0-3": { "weight": 1e999, "reps": 4, "ts": 1767697520000, "exName": "Pull-ups (or lat pulldown)" },
    "25-1-0-1": { "weight": 50, "reps": 5, "ts": 1769100000000 },
    "1-1-9-1": { "weight": 50, "reps": 5, "ts": 1767611500000 },
    "1-7-0-1": { "weight": 0, "reps": 1, "ts": 1767700000000, "exName": "No training" },
    "1-3-0-1": { "weight": 70, "reps": 250, "ts": 1767783700000, "exName": "Barbell back squat" },
    "1-1-3-1": { "weight": 12, "reps": 15, "ts": 1767611600000, "exName": "Hammer curl" },
    "1-1-4-1": { "ts": 1767611800000, "exName": "Tricep overhead extension" },
    "1-1-1000-9": { "weight": 15, "reps": 12, "ts": 1767611900000, "exName": "Cable fly" },
    "not-a-key": { "weight": 40, "reps": 10, "ts": 1767611700000 }
  },
  "completed": { "1-1-0": true, "1-3-4": true, "1-1-1": false },
  "weightLog": [
    { "wk": 1, "lb": 210, "ts": 1767610000000 },
    { "wk": 2, "lb": 208.2, "ts": 1768214000000 },
    { "wk": 3, "lb": "heavy", "ts": 1768818000000 }
  ],
  "pushupLog": { "1": 12, "2": 15, "3": -4 },
  "water": { "2026-01-05": 7, "2026-01-06": 5, "2026-01-07": 0, "not-a-date": 3 },
  "waterTarget": 7,
  "notes": { "2026-01-05": "first session back after eighteen months", "2026-01-06": "   " },
  "mealSwaps": { "3": "chicken instead of salmon" },
  "mealOutNote": "",
  "streak": { "last": "2026-01-06", "count": 2 },
  "specimens": {
    "c003": { "acquiredAt": 1767611000000, "exercise": "Barbell bench press" },
    "c019": { "acquiredAt": 1767697400000, "exercise": "Kettlebell swing" }
  },
  "totalSetsLogged": 31,
  "lastDrop": null,
  "lastTelemetry": null,
  "lastMilestone": null,
  "lastPhaseSeen": 1,
  "timeCapsule": { "note": "Read this at graduation.", "writtenAt": "2026-01-05", "opened": false },
  "customEx": {
    "1-1": [{ "name": "Cable fly", "sets": "3", "reps": "12-15" }],
    "2-1": [{ "name": "Cable fly", "sets": "3", "reps": "12-15" }]
  },
  "tweaks": { "accent": "#a3e635", "scanlines": true, "flicker": true, "density": "comfortable" }
}
```

`1e999` is valid JSON number syntax and `JSON.parse` turns it into `Infinity`. That is the
exact path security review M6 describes, so the fixture carries it rather than describing it.

The test imports this file directly, so `tsconfig.json` must allow it. Confirm:

Run: `grep -n resolveJsonModule tsconfig.json`
Expected: `"resolveJsonModule": true,`. If the grep prints nothing, add that line to
`compilerOptions` in `tsconfig.json`.

- [ ] **Step 8: Write the failing migration test**

Create `src/domain/migrations/v2.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import raw from "./fixtures/v2-sample.json";
import { KG_PER_LB } from "../types";
import type { AppState, LoggedSet } from "../types";
import { makeBlankState, makePlan, makeProfile } from "../../test/migrationFactories";
import { LEGACY_SESSION_ID } from "./v2plan";
import { CUP_ML, applyMigration, migrateV2 } from "./v2";

const OPTS = {
  loadsEnteredIn: "metric",
  bodyMassEnteredIn: "imperial",
  timezone: "Europe/Athens",
  profile: makeProfile(),
  plan: makePlan(),
} as const;

function run(overrides: Partial<typeof OPTS> = {}) {
  return migrateV2(raw, { ...OPTS, ...overrides });
}

function setsOf(state: AppState): LoggedSet[] {
  return Object.values(state.sets);
}

function skipKeys(report: { setsSkipped: { key: string }[] }): string[] {
  return report.setsSkipped.map((s) => s.key).sort();
}

describe("migrateV2 — set decoding", () => {
  it("migrates 20 decodable set keys plus 2 weekly push-up maxima", () => {
    const { report } = run();
    expect(report.setsMigrated).toBe(22);
  });

  it("gives every migrated set a fresh unique id", () => {
    const { state } = run();
    const ids = setsOf(state).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(state.sets).sort()).toEqual(ids.sort());
  });

  it("resolves (week, day) to a date with day 1 of week 1 on the start date", () => {
    const { state } = run();
    const bench = setsOf(state).filter((s) => s.exerciseId === "barbell-bench-press");
    expect(bench.map((s) => s.assignmentDate).sort()).toEqual([
      "2026-01-05",
      "2026-01-05",
      "2026-01-12",
      "2026-01-12",
      "2026-01-12",
    ]);
  });

  it("stores metric loads unchanged", () => {
    const { state } = run({ loadsEnteredIn: "metric" });
    const first = setsOf(state).find(
      (s) => s.exerciseId === "barbell-bench-press" && s.assignmentDate === "2026-01-05" && s.setNumber === 1,
    );
    expect(first?.loadKg).toBe(60);
    expect(first?.enteredUnit).toBe("metric");
  });

  it("converts imperial loads exactly, with no rounding", () => {
    const { state } = run({ loadsEnteredIn: "imperial" });
    const first = setsOf(state).find(
      (s) => s.exerciseId === "barbell-bench-press" && s.assignmentDate === "2026-01-05" && s.setNumber === 1,
    );
    expect(first?.loadKg).toBe(60 * KG_PER_LB);
    expect(first?.enteredUnit).toBe("imperial");
  });

  it("keeps a logged 0 as a bodyweight load, never as null", () => {
    const { state } = run();
    const pullup = setsOf(state).find(
      (s) => s.exerciseId === "pull-up" && s.setNumber === 1,
    );
    expect(pullup?.loadKg).toBe(0);
  });

  it("resolves the two slots that change exercise mid-programme by week", () => {
    const { state } = run();
    const ids = setsOf(state).map((s) => s.exerciseId);
    expect(ids).toContain("leg-press"); // week 1, day 3, slot 2
    expect(ids).not.toContain("bulgarian-split-squat");
    expect(ids).toContain("trap-bar-deadlift"); // week 2, day 5, slot 0
    expect(ids).not.toContain("conventional-deadlift");
  });

  it("marks a set beyond the week's prescribed count as a bonus set", () => {
    const { state } = run();
    const third = setsOf(state).find(
      (s) => s.exerciseId === "barbell-bench-press" && s.assignmentDate === "2026-01-12" && s.setNumber === 3,
    );
    expect(third?.isBonus).toBe(true);
    const second = setsOf(state).find(
      (s) => s.exerciseId === "barbell-bench-press" && s.assignmentDate === "2026-01-12" && s.setNumber === 2,
    );
    expect(second?.isBonus).toBe(false);
  });

  it("maps a legacy day label onto the matching session of the new plan", () => {
    const { state } = run();
    const push = setsOf(state).find((s) => s.exerciseId === "barbell-bench-press");
    expect(push?.sessionId).toBe("s-push");
    const pull = setsOf(state).find((s) => s.exerciseId === "pendlay-row");
    expect(pull?.sessionId).toBe("s-pull");
  });

  it("falls back to the legacy session id when no label matches", () => {
    const { state } = run();
    // legacy day 5 "Upper Power" has no equally named session in the test plan
    const dl = setsOf(state).find((s) => s.exerciseId === "trap-bar-deadlift");
    expect(dl?.sessionId).toBe(LEGACY_SESSION_ID);
    // legacy day 4 is a rest day and claims no label
    const pushup = setsOf(state).find((s) => s.exerciseId === "push-up");
    expect(pushup?.sessionId).toBe(LEGACY_SESSION_ID);
  });

  it("does not relabel a Push set as Upper for an upper/lower plan", () => {
    const plan = makePlan({
      sessions: makePlan().sessions.map((s) =>
        s.id === "s-push" ? { ...s, label: "Upper", name: "Upper" } : s,
      ),
    });
    const { state } = run({ plan });
    const push = setsOf(state).find((s) => s.exerciseId === "barbell-bench-press");
    expect(push?.sessionId).toBe(LEGACY_SESSION_ID);
  });
});

describe("migrateV2 — rejections, all reported", () => {
  it("reports exactly the ten undecodable set keys", () => {
    const { report } = run();
    const setSkips = skipKeys(report).filter((k) => k.startsWith("sets."));
    expect(setSkips).toEqual(
      [
        "sets.1-1-1000-9",
        "sets.1-1-3-1",
        "sets.1-1-4-1",
        "sets.1-1-9-1",
        "sets.1-2-0-3",
        "sets.1-3-0-1",
        "sets.1-7-0-1",
        "sets.25-1-0-1",
        "sets.3-1-0-1",
        "sets.not-a-key",
      ].sort(),
    );
  });

  it("names the reason for each rejection", () => {
    const { report } = run();
    const reason = (key: string) =>
      report.setsSkipped.find((s) => s.key === key)?.reason ?? "";
    expect(reason("sets.3-1-0-1")).toMatch(/negative/i);
    expect(reason("sets.1-2-0-3")).toMatch(/finite/i);
    expect(reason("sets.25-1-0-1")).toMatch(/week/i);
    expect(reason("sets.1-1-9-1")).toMatch(/exercise slot/i);
    expect(reason("sets.1-7-0-1")).toMatch(/no equivalent/i);
    expect(reason("sets.1-3-0-1")).toMatch(/reps/i);
    expect(reason("sets.1-1-3-1")).toMatch(/does not match/i);
    expect(reason("sets.1-1-4-1")).toMatch(/neither a load nor a rep count/i);
    expect(reason("sets.1-1-1000-9")).toMatch(/custom exercise/i);
    expect(reason("sets.not-a-key")).toMatch(/week-day-exIdx-setNumber/);
  });

  it("reports non-set records with an origin-prefixed key", () => {
    const { report } = run();
    const keys = skipKeys(report);
    expect(keys).toContain("weightLog[2]");
    expect(keys).toContain("water.not-a-date");
    expect(keys).toContain("water.2026-01-07");
    expect(keys).toContain("notes.2026-01-06");
    expect(keys).toContain("pushupLog.3");
    expect(keys).toContain("completed.1-3-4");
    expect(keys).toContain("mealSwaps.3");
  });

  it("does not report a completed flag that a logged set already covers", () => {
    const { report } = run();
    expect(skipKeys(report)).not.toContain("completed.1-1-0");
    expect(skipKeys(report)).not.toContain("completed.1-1-1");
  });

  it("rejects a payload that is not an object without throwing", () => {
    const { state, report } = migrateV2("not a store", OPTS);
    expect(report.setsMigrated).toBe(0);
    expect(report.setsSkipped[0]?.key).toBe("<root>");
    expect(Object.keys(state.sets)).toHaveLength(0);
  });

  it("skips every date-derived record when the legacy start date is missing", () => {
    const { report } = migrateV2({ ...raw, startDate: null }, OPTS);
    expect(report.setsMigrated).toBe(0);
    expect(report.bodyMassMigrated).toBe(0);
    // notes and hydration are keyed by date already, so they still migrate
    expect(report.hydrationDays).toBe(2);
    expect(report.notesKept).toBe(1);
    expect(report.setsSkipped.some((s) => /start date/i.test(s.reason))).toBe(true);
  });
});

describe("migrateV2 — push-up maxima", () => {
  it("appends each weekly maximum as an AMRAP set on legacy day 4 of that week", () => {
    const { state } = run();
    const pushups = setsOf(state)
      .filter((s) => s.exerciseId === "push-up")
      .sort((a, b) => a.assignmentDate.localeCompare(b.assignmentDate) || a.setNumber - b.setNumber);
    expect(pushups.map((s) => [s.assignmentDate, s.setNumber, s.reps, s.isBonus])).toEqual([
      ["2026-01-08", 1, 12, true], // week 1 maximum, no sets logged that day
      ["2026-01-15", 1, 20, false], // set logged in the old app
      ["2026-01-15", 2, 18, false], // set logged in the old app
      ["2026-01-15", 3, 15, true], // week 2 maximum, appended after them
    ]);
    expect(pushups.every((s) => s.loadKg === 0)).toBe(true);
  });
});

describe("migrateV2 — body mass", () => {
  it("converts lb to kg exactly when the user says the old field was lb", () => {
    const { state, report } = run({ bodyMassEnteredIn: "imperial" });
    const entries = state.bodyMass["p1"] ?? [];
    expect(report.bodyMassMigrated).toBe(2);
    expect(entries[0]?.massKg).toBe(210 * KG_PER_LB);
    expect(entries[0]?.date).toBe("2026-01-05");
    expect(entries[0]?.enteredUnit).toBe("imperial");
    expect(entries[1]?.date).toBe("2026-01-12");
  });

  it("stores the number unchanged when the user says the old field was kg", () => {
    const { state } = run({ bodyMassEnteredIn: "metric" });
    expect((state.bodyMass["p1"] ?? [])[0]?.massKg).toBe(210);
  });
});

describe("migrateV2 — hydration, notes, specimens, capsule", () => {
  it("converts cups to millilitres at 500 mL per cup", () => {
    const { state, report } = run();
    expect(CUP_ML).toBe(500);
    const h = state.hydration["p1"] ?? [];
    expect(report.hydrationDays).toBe(2);
    expect(h.map((e) => [e.date, e.volumeML])).toEqual([
      ["2026-01-05", 3500],
      ["2026-01-06", 2500],
    ]);
    expect(h.every((e) => e.marks.length === 0)).toBe(true);
  });

  it("keeps non-empty notes and drops whitespace-only ones", () => {
    const { state, report } = run();
    expect(report.notesKept).toBe(1);
    expect(state.notes["p1"]).toEqual({
      "2026-01-05": "first session back after eighteen months",
    });
  });

  it("carries the specimen inventory across and recomputes the set counter", () => {
    const { state } = run();
    const inv = state.specimens["p1"];
    expect(Object.keys(inv?.acquired ?? {}).sort()).toEqual(["c003", "c019"]);
    expect(inv?.acquired["c003"]?.exerciseId).toBe("barbell-bench-press");
    expect(inv?.acquired["c019"]?.exerciseId).toBeNull();
    // legacy totalSetsLogged was 31 and only ever increased (code review A47)
    expect(inv?.totalSetsLogged).toBe(22);
  });

  it("carries the time capsule and gives it the week-24 opening date", () => {
    const { state } = run();
    const capsule = state.capsules["p1"];
    expect(capsule?.note).toBe("Read this at graduation.");
    expect(capsule?.opensOn).toBe("2026-06-15"); // start + 23 weeks
    expect(capsule?.opened).toBe(false);
  });
});

describe("migrateV2 — custom exercises", () => {
  it("gives each distinct custom exercise one stable id, not 1000 + index", () => {
    const { state } = run();
    const customs = state.customExercises["p1"] ?? [];
    expect(customs).toHaveLength(1);
    expect(customs[0]?.name).toBe("Cable fly");
    expect(customs[0]?.id).not.toMatch(/^100\d$/);
    const set = setsOf(state).find((s) => s.exerciseId === customs[0]?.id);
    expect(set?.reps).toBe(15);
  });

  it("says in the exercise note that modality and load class were not recorded", () => {
    const { state } = run();
    expect(state.customExercises["p1"]?.[0]?.note).toMatch(/no modality/i);
  });
});

describe("applyMigration", () => {
  it("merges only the migrated slices and leaves the plan and cursor alone", () => {
    const base = makeBlankState();
    const { state: migrated } = run();
    const next = applyMigration(base, migrated, "p1");
    expect(next.cursors).toEqual(base.cursors);
    expect(next.plans).toEqual(base.plans);
    expect(next.availability).toEqual(base.availability);
    expect(Object.keys(next.sets)).toHaveLength(22);
    expect(next.notes["p1"]?.["2026-01-05"]).toBe("first session back after eighteen months");
  });

  it("keeps an existing note over a migrated one for the same day", () => {
    const base = makeBlankState();
    base.notes = { p1: { "2026-01-05": "written in the new app" } };
    const { state: migrated } = run();
    const next = applyMigration(base, migrated, "p1");
    expect(next.notes["p1"]?.["2026-01-05"]).toBe("written in the new app");
  });

  it("keeps an existing time capsule rather than overwriting it", () => {
    const base = makeBlankState();
    base.capsules = { p1: { note: "already sealed", writtenAt: 1, opensOn: "2026-12-01", opened: false } };
    const { state: migrated } = run();
    const next = applyMigration(base, migrated, "p1");
    expect(next.capsules["p1"]?.note).toBe("already sealed");
  });
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `npx vitest run src/domain/migrations/v2.test.ts`
Expected: FAIL — `Failed to resolve import "./v2"`.

- [ ] **Step 10: Write `src/domain/migrations/v2.ts`**

```ts
// src/domain/migrations/v2.ts
//
// One-way import of the legacy console store (localStorage "fti.console.v2") into a
// v3 AppState. It is pure: it reads no storage, writes no storage, and touches no
// React. The caller supplies the two facts the legacy store never recorded — which
// unit the loads were typed in and which unit the body mass was typed in (code review
// A1, A2, A6: the old app had no unit system, only field names and display strings).
//
// Nothing is dropped silently. Every record the migration refuses is appended to
// `report.setsSkipped` with an origin-prefixed key (`sets.`, `weightLog[`, `water.`,
// `notes.`, `pushupLog.`, `completed.`, `customEx.`, `mealSwaps.`) and a reason in
// plain language. The wizard shows the list; the user keeps the untouched legacy JSON.

import type {
  AppState,
  BodyMassEntry,
  EpochMs,
  Exercise,
  HydrationEntry,
  Kg,
  LocalDate,
  LoggedSet,
  PlanTemplate,
  Profile,
  TimeZone,
  TimeCapsule,
  UnitSystem,
} from "../types";
import { instantOf, isValidLocalDate } from "../dates";
import { newId } from "../ids";
import { CURRENT_SCHEMA_VERSION } from "../schema";
import { toStoredLoad, toStoredMass } from "../units";
import {
  LEGACY_SESSION_ID,
  LEGACY_WEEKS,
  V2_DAY_LABEL,
  legacyDateOf,
  legacyExerciseIdAt,
  legacyIdForName,
  legacySlot,
  legacyTargetSets,
} from "./v2plan";

export type LegacyUnit = "kg" | "lb";

export interface MigrateV2Options {
  /** The unit the user says the legacy set-log weight box was typed in. */
  units: LegacyUnit;
  /**
   * The unit the legacy body-mass field held. Defaults to 'lb', which is what the field name,
   * its placeholder, its 100..300 gate and the legacy export all say it was.
   */
  bodyMassUnits?: LegacyUnit;
  /** IANA zone used to place a legacy date on the time line. */
  timezone: TimeZone;
  profile: Profile;
  plan: PlanTemplate;
}

export interface MigrationSkip {
  /** origin-prefixed identifier of the refused record */
  key: string;
  reason: string;
}

export interface MigrationReport {
  /** LoggedSet records written, including weekly push-up maxima */
  setsMigrated: number;
  /** every refused record, whatever its origin */
  setsSkipped: MigrationSkip[];
  bodyMassMigrated: number;
  hydrationDays: number;
  notesKept: number;
}

export type MigrateV2Result =
  | { ok: true; state: AppState; report: MigrationReport }
  | { ok: false; reason: string };

export type ApplyMigrationResult =
  /** `skipped` holds the migrated sets the target state already had. */
  | { ok: true; state: AppState; skipped: MigrationSkip[] }
  | { ok: false; reason: string };

/** console-store.jsx:95 — "waterTarget: 7, // 500 ml × 7 = 3.5 L". */
export const CUP_ML = 500; // mL per legacy cup

const MAX_LOAD_KG = 500; // kg; security review constraint 3
const MIN_REPS = 1;
const MAX_REPS = 100; // security review constraint 3
const MIN_BODY_MASS_KG = 20; // kg
const MAX_BODY_MASS_KG = 400; // kg
const MAX_CUPS = 24; // legacy waterTarget was bounded 1..24
const MAX_NOTE_CHARS = 20_000;
const MAX_SET_NUMBER = 50;
const MAX_PUSHUPS = 500;
const CUSTOM_EX_BASE = 1000; // console-train.jsx:391

// ---------------------------------------------------------------------------
// narrowing helpers — no `as`, no `any`
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** finite numbers only: `Number.isFinite(Infinity)` is false, `!isNaN(Infinity)` is not (M6). */
function finiteNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// ---------------------------------------------------------------------------

/**
 * The session in `plan` that a legacy day belongs to.
 *
 * Rule: exact match, case- and whitespace-insensitive, on `PlannedSession.label`,
 * taking the first session in plan order. The legacy cardio day matches on
 * `SessionKind === "cardio"` instead, because the label of a conditioning session is
 * not fixed by the templates. There is deliberately no fuzzy matching: a v2 "Push" set
 * is not silently relabelled "Upper" for an upper/lower user. Anything unmatched — the
 * two rest days, and any label the new plan does not use — gets LEGACY_SESSION_ID,
 * which is the honest record that the set predates the current plan.
 */
function resolveSessionId(plan: PlanTemplate, day: number): string {
  const label = V2_DAY_LABEL[day] ?? null;
  if (label === null) return LEGACY_SESSION_ID;
  if (label === "Cardio") {
    return plan.sessions.find((s) => s.kind === "cardio")?.id ?? LEGACY_SESSION_ID;
  }
  const want = label.trim().toLowerCase();
  return plan.sessions.find((s) => s.label.trim().toLowerCase() === want)?.id ?? LEGACY_SESSION_ID;
}

/** A valid, empty v3 state carrying only the profile and plan the caller supplied. */
function blankState(profile: Profile, plan: PlanTemplate): AppState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    availability: {},
    plans: { [plan.id]: plan },
    cursors: {},
    pauses: {},
    assignments: {},
    sets: {},
    notes: {},
    customExercises: {},
    bodyMass: {},
    hydration: {},
    intake: {},
    weeklyReviews: {},
    reminderSettings: {},
    pushDevice: null,
    motivation: {},
    specimens: {},
    capsules: {},
    ui: {
      bootSeen: true,
      lastView: "today",
      accent: "#a3e635",
      scanlines: true,
      flicker: false,
      density: "normal",
      legacyMigration: "pending",
    },
  };
}

export function migrateV2(raw: unknown, opts: MigrateV2Options): MigrateV2Result {
  const { profile, plan, timezone, loadsEnteredIn, bodyMassEnteredIn } = opts;
  const profileId = profile.id;
  const skipped: MigrationSkip[] = [];
  const state = blankState(profile, plan);

  const report = (): MigrateV2Result => ({
    state,
    report: {
      setsMigrated: Object.keys(state.sets).length,
      setsSkipped: skipped,
      bodyMassMigrated: (state.bodyMass[profileId] ?? []).length,
      hydrationDays: (state.hydration[profileId] ?? []).length,
      notesKept: Object.keys(state.notes[profileId] ?? {}).length,
    },
  });

  if (!isRecord(raw)) {
    skipped.push({ key: "<root>", reason: "the legacy payload is not a JSON object" });
    return report();
  }

  const startRaw = str(raw["startDate"]);
  const startDate: LocalDate | null =
    startRaw !== null && isValidLocalDate(startRaw) ? startRaw : null;
  const NO_START = "the legacy store records no start date, so (week, day) cannot be resolved to a calendar date";

  /** noon avoids every DST gap, so this never throws and never lands on the wrong day */
  const noonOf = (date: LocalDate): EpochMs => instantOf(date, "12:00", timezone);
  const timestamp = (v: unknown, date: LocalDate): EpochMs => finiteNum(v) ?? noonOf(date);

  // ---- custom exercises first: the set loop needs their ids -----------------
  const customByName = new Map<string, Exercise>();
  const customSetsSpec = new Map<string, string>();
  const customList: Exercise[] = [];
  const customRaw = isRecord(raw["customEx"]) ? raw["customEx"] : {};
  for (const dayKey of Object.keys(customRaw).sort()) {
    const list = customRaw[dayKey];
    if (!Array.isArray(list)) {
      skipped.push({ key: `customEx.${dayKey}`, reason: "not an array of exercises" });
      continue;
    }
    list.forEach((entry: unknown, i: number) => {
      const where = `customEx.${dayKey}[${i}]`;
      if (!isRecord(entry)) {
        skipped.push({ key: where, reason: "not an object" });
        return;
      }
      const name = (str(entry["name"]) ?? "").trim();
      if (name === "") {
        skipped.push({ key: where, reason: "custom exercise has no name" });
        return;
      }
      const norm = name.toLowerCase();
      if (!customSetsSpec.has(norm)) customSetsSpec.set(norm, str(entry["sets"]) ?? "3");
      if (customByName.has(norm)) return; // same exercise re-added on another day
      const ex: Exercise = {
        id: newId(),
        name,
        isBodyweight: false,
        isCompoundPrimary: false,
        modality: "dumbbell",
        loadClass: "isolation",
        muscleGroups: [],
        equipment: [profile.equipment],
        videoQuery: name,
        formCueId: null,
        note:
          "Imported from the v2 console. The old app recorded no modality and no load class, " +
          "so this defaults to dumbbell / isolation, which takes the smaller 2.5 % progression " +
          "increment. Correct it in Settings if that is wrong.",
      };
      customByName.set(norm, ex);
      customList.push(ex);
    });
  }
  if (customList.length > 0) state.customExercises[profileId] = customList;

  // ---- sets -----------------------------------------------------------------
  const setsRaw = isRecord(raw["sets"]) ? raw["sets"] : {};
  const KEY_RE = /^(\d+)-(\d+)-(\d+)-(\d+)$/;
  /** `${date}|${exerciseId}` -> highest setNumber written, so push-up maxima append after */
  const highestSetNumber = new Map<string, number>();
  /** `${week}-${day}-${exIdx}` seen with at least one migrated set, for the `completed` pass */
  const slotsWithSets = new Set<string>();

  for (const key of Object.keys(setsRaw).sort()) {
    const where = `sets.${key}`;
    const m = KEY_RE.exec(key);
    if (m === null) {
      skipped.push({ key: where, reason: "key is not `week-day-exIdx-setNumber`" });
      continue;
    }
    const week = Number.parseInt(m[1] ?? "", 10);
    const day = Number.parseInt(m[2] ?? "", 10);
    const exIdx = Number.parseInt(m[3] ?? "", 10);
    const setNumber = Number.parseInt(m[4] ?? "", 10);

    if (week < 1 || week > LEGACY_WEEKS) {
      skipped.push({ key: where, reason: `week ${week} is outside the legacy range 1..${LEGACY_WEEKS}` });
      continue;
    }
    if (day < 1 || day > 7) {
      skipped.push({ key: where, reason: `day ${day} is outside the legacy range 1..7` });
      continue;
    }
    if (setNumber < 1 || setNumber > MAX_SET_NUMBER) {
      skipped.push({ key: where, reason: `set number ${setNumber} is outside 1..${MAX_SET_NUMBER}` });
      continue;
    }

    const payload = setsRaw[key];
    if (!isRecord(payload)) {
      skipped.push({ key: where, reason: "the set record is not an object" });
      continue;
    }

    // exercise identity
    let exerciseId: string | null;
    let expectedName: string | null;
    if (exIdx >= CUSTOM_EX_BASE) {
      const i = exIdx - CUSTOM_EX_BASE;
      const defs = customRaw[`${week}-${day}`];
      const def = Array.isArray(defs) ? defs[i] : undefined;
      const name = isRecord(def) ? (str(def["name"]) ?? "").trim() : "";
      const ex = name === "" ? undefined : customByName.get(name.toLowerCase());
      if (ex === undefined) {
        skipped.push({ key: where, reason: `no custom exercise is defined at index ${i} of ${week}-${day}` });
        continue;
      }
      exerciseId = ex.id;
      expectedName = ex.name;
    } else {
      const slot = legacySlot(day, exIdx);
      if (slot === null) {
        skipped.push({ key: where, reason: `day ${day} has no exercise slot ${exIdx}` });
        continue;
      }
      expectedName = slot.legacyName;
      exerciseId = legacyExerciseIdAt(day, exIdx, week);
      if (exerciseId === null) {
        skipped.push({ key: where, reason: `"${slot.legacyName}" has no equivalent in the exercise library` });
        continue;
      }
    }

    // the payload carries a frozen copy of the display name; disagreement means the
    // record is internally inconsistent, so refuse it rather than guess which is right
    const recordedName = str(payload["exName"]);
    if (recordedName !== null && recordedName.trim() !== expectedName) {
      skipped.push({
        key: where,
        reason: `the key resolves to "${expectedName}" but the record does not match it ("${recordedName.trim()}")`,
      });
      continue;
    }

    // load
    let loadKg: Kg | null = null;
    const rawWeight = payload["weight"];
    if (rawWeight !== undefined && rawWeight !== null) {
      const w = finiteNum(rawWeight);
      if (w === null) {
        skipped.push({ key: where, reason: "the logged load is not a finite number" });
        continue;
      }
      if (w < 0) {
        skipped.push({ key: where, reason: `the logged load is negative (${w})` });
        continue;
      }
      const kg = toStoredLoad(w, loadsEnteredIn);
      if (kg > MAX_LOAD_KG) {
        skipped.push({ key: where, reason: `the logged load is ${kg.toFixed(1)} kg, above the ${MAX_LOAD_KG} kg bound` });
        continue;
      }
      loadKg = kg; // kg, canonical
    }

    // reps
    let reps: number | null = null;
    const rawReps = payload["reps"];
    if (rawReps !== undefined && rawReps !== null) {
      const r = finiteNum(rawReps);
      if (r === null || !Number.isInteger(r) || r < MIN_REPS || r > MAX_REPS) {
        skipped.push({ key: where, reason: `reps must be a whole number in ${MIN_REPS}..${MAX_REPS}` });
        continue;
      }
      reps = r;
    }

    if (loadKg === null && reps === null) {
      skipped.push({ key: where, reason: "the record holds neither a load nor a rep count" });
      continue;
    }

    if (startDate === null) {
      skipped.push({ key: where, reason: NO_START });
      continue;
    }
    const assignmentDate = legacyDateOf(startDate, week, day);

    const setsSpec =
      exIdx >= CUSTOM_EX_BASE
        ? (customSetsSpec.get((expectedName ?? "").toLowerCase()) ?? "3")
        : (legacySlot(day, exIdx)?.setsSpec ?? "3");
    const target =
      exIdx >= CUSTOM_EX_BASE
        ? (Number.isFinite(Number.parseInt(setsSpec, 10)) ? Number.parseInt(setsSpec, 10) : 3)
        : legacyTargetSets(setsSpec, week);

    const id = newId();
    state.sets[id] = {
      id,
      profileId,
      assignmentDate,
      sessionId: resolveSessionId(plan, day),
      exerciseId,
      setNumber,
      isBonus: setNumber > target,
      loadKg, // kg
      enteredUnit: loadsEnteredIn,
      reps,
      durationS: null, // the legacy set row had no duration field
      rpe: null, // the legacy set row had no RPE field
      loggedAt: timestamp(payload["ts"], assignmentDate),
    };
    slotsWithSets.add(`${week}-${day}-${exIdx}`);
    const seenKey = `${assignmentDate}|${exerciseId}`;
    highestSetNumber.set(seenKey, Math.max(highestSetNumber.get(seenKey) ?? 0, setNumber));
  }

  // ---- weekly push-up maxima -------------------------------------------------
  // `pushupLog[wk]` is one number per legacy week. Its meaning was never settled in
  // the old app (code review A64: documented as a weekly maximum, incremented daily),
  // so it is imported as one AMRAP set on legacy day 4 — the only day whose exercise
  // list actually contains push-ups — appended after any set already logged there.
  const pushupRaw = isRecord(raw["pushupLog"]) ? raw["pushupLog"] : {};
  for (const wkKey of Object.keys(pushupRaw).sort((a, b) => Number(a) - Number(b))) {
    const where = `pushupLog.${wkKey}`;
    const week = Number.parseInt(wkKey, 10);
    const n = finiteNum(pushupRaw[wkKey]);
    if (!Number.isInteger(week) || week < 1 || week > LEGACY_WEEKS) {
      skipped.push({ key: where, reason: `week ${wkKey} is outside the legacy range 1..${LEGACY_WEEKS}` });
      continue;
    }
    if (n === null || !Number.isInteger(n) || n < 1 || n > MAX_PUSHUPS) {
      skipped.push({ key: where, reason: `the maximum must be a whole number in 1..${MAX_PUSHUPS}` });
      continue;
    }
    const exerciseId = legacyExerciseIdAt(4, 0, week);
    if (exerciseId === null) {
      skipped.push({ key: where, reason: "the push-up slot has no equivalent in the exercise library" });
      continue;
    }
    if (startDate === null) {
      skipped.push({ key: where, reason: NO_START });
      continue;
    }
    const assignmentDate = legacyDateOf(startDate, week, 4);
    const seenKey = `${assignmentDate}|${exerciseId}`;
    const setNumber = (highestSetNumber.get(seenKey) ?? 0) + 1;
    highestSetNumber.set(seenKey, setNumber);
    const id = newId();
    state.sets[id] = {
      id,
      profileId,
      assignmentDate,
      sessionId: resolveSessionId(plan, 4),
      exerciseId,
      setNumber,
      isBonus: true, // a weekly test, not a prescribed set
      loadKg: 0, // kg — bodyweight
      enteredUnit: loadsEnteredIn,
      reps: n,
      durationS: null,
      rpe: null,
      loggedAt: noonOf(assignmentDate),
    };
  }

  // ---- body mass -------------------------------------------------------------
  const massRaw = raw["weightLog"];
  const massEntries: BodyMassEntry[] = [];
  if (Array.isArray(massRaw)) {
    massRaw.forEach((entry: unknown, i: number) => {
      const where = `weightLog[${i}]`;
      if (!isRecord(entry)) {
        skipped.push({ key: where, reason: "not an object" });
        return;
      }
      const week = finiteNum(entry["wk"]);
      const value = finiteNum(entry["lb"]);
      if (week === null || !Number.isInteger(week) || week < 1 || week > LEGACY_WEEKS) {
        skipped.push({ key: where, reason: `week is not a whole number in 1..${LEGACY_WEEKS}` });
        return;
      }
      if (value === null) {
        skipped.push({ key: where, reason: "the recorded body mass is not a finite number" });
        return;
      }
      const massKg = toStoredMass(value, bodyMassEnteredIn); // kg, canonical
      if (massKg < MIN_BODY_MASS_KG || massKg > MAX_BODY_MASS_KG) {
        skipped.push({
          key: where,
          reason: `${massKg.toFixed(1)} kg is outside the plausible range ${MIN_BODY_MASS_KG}..${MAX_BODY_MASS_KG} kg`,
        });
        return;
      }
      if (startDate === null) {
        skipped.push({ key: where, reason: NO_START });
        return;
      }
      const date = legacyDateOf(startDate, week, 1);
      massEntries.push({
        id: newId(),
        profileId,
        date,
        massKg, // kg
        enteredUnit: bodyMassEnteredIn,
        bodyFatPct: null, // the legacy log had no body-fat field
        loggedAt: timestamp(entry["ts"], date),
      });
    });
  } else if (massRaw !== undefined) {
    skipped.push({ key: "weightLog", reason: "not an array" });
  }
  massEntries.sort((a, b) => a.date.localeCompare(b.date));
  if (massEntries.length > 0) state.bodyMass[profileId] = massEntries;

  // ---- hydration -------------------------------------------------------------
  const waterRaw = isRecord(raw["water"]) ? raw["water"] : {};
  const hydration: HydrationEntry[] = [];
  for (const date of Object.keys(waterRaw).sort()) {
    const where = `water.${date}`;
    if (!isValidLocalDate(date)) {
      skipped.push({ key: where, reason: "the key is not a YYYY-MM-DD date" });
      continue;
    }
    const cups = finiteNum(waterRaw[date]);
    if (cups === null || !Number.isInteger(cups) || cups < 0 || cups > MAX_CUPS) {
      skipped.push({ key: where, reason: `the cup count must be a whole number in 0..${MAX_CUPS}` });
      continue;
    }
    if (cups === 0) {
      skipped.push({ key: where, reason: "zero cups recorded; there is no volume to migrate" });
      continue;
    }
    hydration.push({
      profileId,
      date,
      volumeML: cups * CUP_ML, // mL
      marks: [], // the legacy store kept a count, never the instants
    });
  }
  if (hydration.length > 0) state.hydration[profileId] = hydration;

  // ---- notes -----------------------------------------------------------------
  const notesRaw = isRecord(raw["notes"]) ? raw["notes"] : {};
  const notes: Record<LocalDate, string> = {};
  for (const date of Object.keys(notesRaw).sort()) {
    const where = `notes.${date}`;
    if (!isValidLocalDate(date)) {
      skipped.push({ key: where, reason: "the key is not a YYYY-MM-DD date" });
      continue;
    }
    const text = str(notesRaw[date]);
    if (text === null) {
      skipped.push({ key: where, reason: "the note is not text" });
      continue;
    }
    const trimmed = text.trim();
    if (trimmed === "") {
      skipped.push({ key: where, reason: "the note is empty" });
      continue;
    }
    if (trimmed.length > MAX_NOTE_CHARS) {
      skipped.push({ key: where, reason: `the note is longer than ${MAX_NOTE_CHARS} characters` });
      continue;
    }
    notes[date] = trimmed;
  }
  if (Object.keys(notes).length > 0) state.notes[profileId] = notes;

  // ---- specimens -------------------------------------------------------------
  const specRaw = isRecord(raw["specimens"]) ? raw["specimens"] : {};
  const acquired: Record<string, { at: EpochMs; exerciseId: string | null }> = {};
  for (const cardId of Object.keys(specRaw).sort()) {
    const rec = specRaw[cardId];
    if (!isRecord(rec)) {
      skipped.push({ key: `specimens.${cardId}`, reason: "not an object" });
      continue;
    }
    const exName = str(rec["exercise"]);
    acquired[cardId] = {
      at: finiteNum(rec["acquiredAt"]) ?? profile.createdAt,
      exerciseId: exName === null ? null : legacyIdForName(exName),
    };
  }
  state.specimens[profileId] = {
    profileId,
    acquired,
    // recomputed, not carried: the legacy counter only ever increased (code review A47)
    totalSetsLogged: Object.keys(state.sets).length,
  };

  // ---- time capsule ----------------------------------------------------------
  const capsuleRaw = raw["timeCapsule"];
  if (isRecord(capsuleRaw)) {
    const note = str(capsuleRaw["note"]);
    const writtenOn = str(capsuleRaw["writtenAt"]);
    if (note === null || note.trim() === "") {
      skipped.push({ key: "timeCapsule", reason: "the capsule holds no text" });
    } else if (writtenOn === null || !isValidLocalDate(writtenOn)) {
      skipped.push({ key: "timeCapsule", reason: "the capsule has no valid written-on date" });
    } else if (startDate === null) {
      skipped.push({ key: "timeCapsule", reason: NO_START });
    } else {
      // the legacy capsule unlocked at programme week 24 (console-fun.jsx:313)
      const capsule: TimeCapsule = {
        note: note.trim(),
        writtenAt: noonOf(writtenOn),
        opensOn: legacyDateOf(startDate, LEGACY_WEEKS, 1),
        opened: capsuleRaw["opened"] === true,
      };
      state.capsules[profileId] = capsule;
    }
  }

  // ---- records with no home in v3 -------------------------------------------
  // `completed[wk-day-exIdx]` marked a whole exercise done. v3 records completion on
  // SessionAssignment, which belongs to the new plan's calendar, so a legacy flag has
  // nowhere to go. It is only reported when no logged set already covers that exact
  // slot — otherwise nothing is lost and the report stays readable.
  const completedRaw = isRecord(raw["completed"]) ? raw["completed"] : {};
  for (const key of Object.keys(completedRaw).sort()) {
    if (completedRaw[key] !== true) continue;
    if (slotsWithSets.has(key)) continue;
    skipped.push({
      key: `completed.${key}`,
      reason: "an exercise was marked complete with no logged set; v3 records completion per session, not per exercise",
    });
  }

  const swapsRaw = isRecord(raw["mealSwaps"]) ? raw["mealSwaps"] : {};
  for (const i of Object.keys(swapsRaw).sort()) {
    const text = (str(swapsRaw[i]) ?? "").trim();
    if (text === "") continue;
    skipped.push({
      key: `mealSwaps.${i}`,
      reason: "the fixed meal plan these notes annotate is not part of v3; the text stays in the legacy JSON",
    });
  }
  const outNote = (str(raw["mealOutNote"]) ?? "").trim();
  if (outNote !== "") {
    skipped.push({
      key: "mealOutNote",
      reason: "the fixed meal plan this note annotates is not part of v3; the text stays in the legacy JSON",
    });
  }

  return report();
}

/**
 * Merge a migration result onto the state the setup wizard already produced.
 * Only the slices the migration writes are touched, plus `ui.legacyMigration`, which is
 * set to "done" so the wizard does not offer itself again: the plan, cursor,
 * availability and reminder settings the user just configured are left exactly as they
 * are. Where both sides hold a value for the same day, the value entered in the new app
 * wins.
 */
export function applyMigration(base: AppState, migrated: AppState, profileId: string): AppState {
  const mergedHydration = new Map<LocalDate, HydrationEntry>();
  for (const e of migrated.hydration[profileId] ?? []) mergedHydration.set(e.date, e);
  for (const e of base.hydration[profileId] ?? []) mergedHydration.set(e.date, e);

  const mergedMass = [...(migrated.bodyMass[profileId] ?? []), ...(base.bodyMass[profileId] ?? [])].sort(
    (a, b) => a.date.localeCompare(b.date),
  );

  const baseInv = base.specimens[profileId];
  const migratedInv = migrated.specimens[profileId];
  const specimenInventory =
    migratedInv === undefined
      ? baseInv
      : {
          profileId,
          acquired: { ...migratedInv.acquired, ...(baseInv?.acquired ?? {}) },
          totalSetsLogged: migratedInv.totalSetsLogged + (baseInv?.totalSetsLogged ?? 0),
        };

  const next: AppState = {
    ...base,
    sets: { ...base.sets, ...migrated.sets },
    notes: {
      ...base.notes,
      [profileId]: { ...(migrated.notes[profileId] ?? {}), ...(base.notes[profileId] ?? {}) },
    },
    customExercises: {
      ...base.customExercises,
      [profileId]: [
        ...(base.customExercises[profileId] ?? []),
        ...(migrated.customExercises[profileId] ?? []),
      ],
    },
    bodyMass: { ...base.bodyMass, [profileId]: mergedMass },
    hydration: {
      ...base.hydration,
      [profileId]: [...mergedHydration.values()].sort((a, b) => a.date.localeCompare(b.date)),
    },
    capsules: {
      ...base.capsules,
      [profileId]: base.capsules[profileId] ?? migrated.capsules[profileId] ?? null,
    },
    ui: { ...base.ui, legacyMigration: "done" },
  };
  if (specimenInventory !== undefined) next.specimens = { ...base.specimens, [profileId]: specimenInventory };
  return next;
}
```

- [ ] **Step 11: Run the migration test**

Run: `npx vitest run src/domain/migrations/v2.test.ts`
Expected: PASS, 27 tests.

- [ ] **Step 12: Register the migration in the chain**

`src/domain/migrations/index.ts` (P1) holds the ordered `{2 → 3}` chain. The v2 store is
a *different localStorage key*, not an older `fti.v3` payload, so it is not part of that
chain — it is invoked by the wizard. Add the re-export so the chain module stays the
single entry point for migration code:

```ts
export { migrateV2, applyMigration, CUP_ML } from "./v2";
export type {
  ApplyMigrationResult,
  LegacyUnit,
  MigrateV2Options,
  MigrateV2Result,
  MigrationReport,
  MigrationSkip,
} from "./v2";
```

- [ ] **Step 13: Run the whole suite and lint**

Run: `npm test && npx eslint src`
Expected: all suites pass; eslint prints nothing.

- [ ] **Step 14: Commit**

```bash
git add src/domain/migrations src/test/migrationFactories.ts src/domain/types.ts src/domain/schema.ts
git commit -m "feat: migrate the legacy fti.console.v2 store into v3 state with a unit prompt"
```

---

### Task 3: the migration wizard

**Files:**
- Modify: `src/store/persistence.ts` (legacy read/delete)
- Modify: `src/store/index.ts` (bring `setUi` forward from P8)
- Create: `src/app/download.ts`
- Create: `src/ui/migration/MigrationWizard.tsx`
- Create: `src/ui/migration/MigrationWizard.test.tsx`
- Create: `src/ui/migration/MigrationGate.tsx`
- Create: `src/ui/migration/MigrationGate.test.tsx`
- Modify: `src/app/App.tsx` (wrap the view switch)

**Interfaces:**
- Consumes: `migrateV2`, `applyMigration`, `MigrationReport` from Task 2; `useAppStore` with `replaceState(next: AppState): void`, `exportJson(): string` (P1, §6.7); `AppStateSchema` from `src/domain/schema.ts` (P1); `Profile`, `PlanTemplate`, `AppState`, `UnitSystem`, `LocalDate` from `src/domain/types.ts`; `isValidLocalDate`, `deviceTimeZone` from `src/domain/dates.ts` (P1, §6.2).
- Produces:
  - `readLegacyV2Raw(): string | null`, `readLegacyBundle(): string | null`, `hasLegacyV2(): boolean`, `hasAnyLegacyKey(): boolean`, `deleteLegacyV2(): void` from `src/store/persistence.ts`, used again by Task 6. `readLegacyBundle()` returns a JSON envelope of all three legacy keys, which is what the wipe and the wizard both export.
  - `downloadText(filename: string, text: string, mime?: string): void` from `src/app/download.ts`, used again by Tasks 5 and 6. `mime` defaults to `application/json`.
  - `setUi(patch: Partial<UiPrefs>): void` on the store (already in master plan §6.7, scheduled for P8; brought forward here)
  - `<MigrationGate>{children}</MigrationGate>` from `src/ui/migration/MigrationGate.tsx`
  - `<MigrationWizard …>` from `src/ui/migration/MigrationWizard.tsx`

- [ ] **Step 1: Write the failing persistence test**

Append to `src/store/persistence.test.ts` (P1 created this file):

```ts
import { deleteLegacyV2, hasLegacyV2, readLegacyV2Raw } from "./persistence";

describe("legacy console keys", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reports no legacy store when the key is absent", () => {
    expect(hasLegacyV2()).toBe(false);
    expect(readLegacyV2Raw()).toBeNull();
  });

  it("returns the raw legacy payload without parsing it", () => {
    window.localStorage.setItem("fti.console.v2", '{"week":2}');
    expect(hasLegacyV2()).toBe(true);
    expect(readLegacyV2Raw()).toBe('{"week":2}');
  });

  it("deletes all three keys the legacy app owned", () => {
    window.localStorage.setItem("fti.console.v2", "{}");
    window.localStorage.setItem("fti.plan.v1", "{}");
    window.localStorage.setItem("fti.video.instance", "https://yewtu.be");
    window.localStorage.setItem("fti.v3", '{"schemaVersion":3}');
    deleteLegacyV2();
    expect(window.localStorage.getItem("fti.console.v2")).toBeNull();
    expect(window.localStorage.getItem("fti.plan.v1")).toBeNull();
    expect(window.localStorage.getItem("fti.video.instance")).toBeNull();
    // the v3 key is not a legacy key and must survive
    expect(window.localStorage.getItem("fti.v3")).toBe('{"schemaVersion":3}');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/store/persistence.test.ts`
Expected: FAIL, `readLegacyV2Raw is not exported`.

- [ ] **Step 3: Add the legacy accessors to `src/store/persistence.ts`**

Append to the module:

```ts
/**
 * The three keys the legacy console owned, none of them coordinated with the others
 * (security review M5): the store (console-store.jsx:6), a dead prototype store
 * (core.jsx:6) and the video-instance preference (console-video.jsx:30).
 * This module is the only place in the app allowed to touch localStorage.
 */
const LEGACY_V2_KEY = "fti.console.v2";
const LEGACY_KEYS: readonly string[] = [LEGACY_V2_KEY, "fti.plan.v1", "fti.video.instance"];

/** The raw legacy payload, unparsed, or null when there is none or storage is unreadable. */
export function readLegacyV2Raw(): string | null {
  try {
    return window.localStorage.getItem(LEGACY_V2_KEY);
  } catch (err) {
    // Safari in private mode throws on any access. There is nothing to import in that
    // case, so treat it as absent — but say so rather than swallow it (security H3).
    console.warn("legacy store unreadable", err);
    return null;
  }
}

export function hasLegacyV2(): boolean {
  return readLegacyV2Raw() !== null;
}

/** Removes every key the legacy app owned. Leaves `fti.v3` alone. */
export function deleteLegacyV2(): void {
  for (const key of LEGACY_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      console.warn(`could not remove ${key}`, err);
    }
  }
}
```

- [ ] **Step 4: Run the persistence test to verify it passes**

Run: `npx vitest run src/store/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Bring `setUi` forward from P8**

Master plan §6.7 already specifies `setUi(patch: Partial<UiPrefs>): void`, scheduled for
P8. P7 needs it now, so implement it here; P8 will find it present.

Run: `grep -n "setUi" src/store/index.ts`
Expected: nothing (it has not been written yet). If it prints a line, skip to Step 7.

Add to the `AppActions` interface in `src/store/index.ts`:

```ts
  setUi(patch: Partial<UiPrefs>): void;
```

and to the store creator, alongside the other actions:

```ts
  setUi: (patch) => {
    set((s) => ({ ui: { ...s.ui, ...patch } }));
  },
```

- [ ] **Step 6: Commit the store plumbing**

```bash
git add src/store/persistence.ts src/store/persistence.test.ts src/store/index.ts
git commit -m "feat: read and delete the legacy console keys; add setUi"
```

- [ ] **Step 7: Write the download helper**

Create `src/app/download.ts`:

```ts
/**
 * Hand the browser a file. The only Blob/anchor code in the app, so the CSP and the
 * object-URL lifetime are reasoned about once.
 */
export function downloadText(filename: string, text: string, mime = "application/json"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick: revoking synchronously cancels the download in Safari.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
```

- [ ] **Step 8: Write the failing wizard test**

Create `src/ui/migration/MigrationWizard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import raw from "../../domain/migrations/fixtures/v2-sample.json";
import { makeBlankState, makePlan, makeProfile } from "../../test/migrationFactories";
import { useAppStore } from "../../store";
import { MigrationWizard } from "./MigrationWizard";

const LEGACY_JSON = JSON.stringify(raw);

beforeEach(() => {
  // jsdom implements neither of these
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  window.localStorage.clear();
  useAppStore.getState().replaceState(makeBlankState());
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderWizard(over: Partial<ComponentProps<typeof MigrationWizard>> = {}) {
  const onApply = vi.fn();
  const onDismiss = vi.fn();
  const onRequireSetup = vi.fn();
  render(
    <MigrationWizard
      legacyRaw={LEGACY_JSON}
      profile={makeProfile()}
      plan={makePlan()}
      onApply={onApply}
      onDismiss={onDismiss}
      onRequireSetup={onRequireSetup}
      {...over}
    />,
  );
  return { onApply, onDismiss, onRequireSetup };
}

describe("MigrationWizard", () => {
  it("explains what will be imported before asking anything", () => {
    renderWizard();
    expect(screen.getByRole("heading", { name: /import from the old app/i })).toBeTruthy();
    expect(screen.getByText(/nothing is deleted from the old app/i)).toBeTruthy();
  });

  it("routes to setup when there is no profile", () => {
    const { onRequireSetup } = renderWizard({ profile: null, plan: null });
    fireEvent.click(screen.getByRole("button", { name: /set up your profile/i }));
    expect(onRequireSetup).toHaveBeenCalledTimes(1);
  });

  it("asks both unit questions", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(
      screen.getByText(/in which unit did you type your loads in the old app\?/i),
    ).toBeTruthy();
    expect(screen.getByText(/in which unit did you type your body mass\?/i)).toBeTruthy();
  });

  it("reports what it migrated and what it refused", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByLabelText(/^kilograms \(kg\)$/i));
    fireEvent.click(screen.getByLabelText(/^pounds \(lb\)$/i));
    fireEvent.click(screen.getByRole("button", { name: /run the import/i }));
    expect(screen.getByText(/22 sets/i)).toBeTruthy();
    expect(screen.getByText(/2 body-mass check-ins/i)).toBeTruthy();
    expect(screen.getByText(/2 days of hydration/i)).toBeTruthy();
    expect(screen.getByText(/1 daily note/i)).toBeTruthy();
    expect(screen.getByText(/17 records could not be imported/i)).toBeTruthy();
  });

  it("keeps the apply button disabled until the legacy JSON has been downloaded", () => {
    const { onApply } = renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /run the import/i }));
    const apply = screen.getByRole("button", { name: /keep this import/i });
    expect(apply.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /download legacy json/i }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(apply.hasAttribute("disabled")).toBe(false);
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("hands onApply a state whose set count matches the report", () => {
    const { onApply } = renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /run the import/i }));
    fireEvent.click(screen.getByRole("button", { name: /download legacy json/i }));
    fireEvent.click(screen.getByRole("button", { name: /keep this import/i }));
    const state = onApply.mock.calls[0]?.[0];
    expect(Object.keys(state.sets)).toHaveLength(22);
  });

  it("asks for a start date when the legacy store has none", () => {
    renderWizard({ legacyRaw: JSON.stringify({ ...raw, startDate: null }) });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    const field = screen.getByLabelText(/which date was day 1/i);
    expect(screen.getByRole("button", { name: /run the import/i }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(field, { target: { value: "2026-01-05" } });
    fireEvent.click(screen.getByRole("button", { name: /run the import/i }));
    expect(screen.getByText(/22 sets/i)).toBeTruthy();
  });

  it("refuses a legacy payload that is not JSON and offers only the download", () => {
    renderWizard({ legacyRaw: "{not json" });
    expect(screen.getByText(/could not be read as JSON/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /continue/i })).toBeNull();
    expect(screen.getByRole("button", { name: /download legacy json/i })).toBeTruthy();
  });

  it("lets the user start clean without touching the legacy key", () => {
    const { onDismiss } = renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /start clean/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 9: Run it to verify it fails**

Run: `npx vitest run src/ui/migration/MigrationWizard.test.tsx`
Expected: FAIL — `Failed to resolve import "./MigrationWizard"`.

- [ ] **Step 10: Write `src/ui/migration/MigrationWizard.tsx`**

```tsx
import { useMemo, useState } from "react";
import { applyMigration, migrateV2 } from "../../domain/migrations/v2";
import type { MigrationReport } from "../../domain/migrations/v2";
import { AppStateSchema } from "../../domain/schema";
import { isValidLocalDate } from "../../domain/dates";
import type { AppState, LocalDate, PlanTemplate, Profile, UnitSystem } from "../../domain/types";
import { useAppStore } from "../../store";
import { downloadText } from "../../app/download";

export interface MigrationWizardProps {
  /** the raw string held at localStorage["fti.console.v2"] */
  legacyRaw: string;
  /** null until the setup wizard has run */
  profile: Profile | null;
  /** null until the setup wizard has run */
  plan: PlanTemplate | null;
  /** commit the merged state; wired to the store's replaceState */
  onApply(next: AppState): void;
  /** the user chose to start clean; the legacy key is left untouched */
  onDismiss(): void;
  /** the user has no profile yet and must run the setup wizard first */
  onRequireSetup(): void;
}

type Phase = "intro" | "questions" | "review";

interface RunResult {
  state: AppState;
  report: MigrationReport;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function UnitChoice(props: {
  legend: string;
  name: string;
  value: UnitSystem;
  onChange(next: UnitSystem): void;
  metricLabel: string;
  imperialLabel: string;
}) {
  return (
    <fieldset className="unit-choice">
      <legend>{props.legend}</legend>
      <label>
        <input
          type="radio"
          name={props.name}
          checked={props.value === "metric"}
          onChange={() => { props.onChange("metric"); }}
        />
        {props.metricLabel}
      </label>
      <label>
        <input
          type="radio"
          name={props.name}
          checked={props.value === "imperial"}
          onChange={() => { props.onChange("imperial"); }}
        />
        {props.imperialLabel}
      </label>
    </fieldset>
  );
}

export function MigrationWizard(props: MigrationWizardProps) {
  const { legacyRaw, profile, plan, onApply, onDismiss, onRequireSetup } = props;
  const [phase, setPhase] = useState<Phase>("intro");
  const [loadsEnteredIn, setLoadsEnteredIn] = useState<UnitSystem>("metric");
  const [bodyMassEnteredIn, setBodyMassEnteredIn] = useState<UnitSystem>("imperial");
  const [startInput, setStartInput] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo<{ ok: true; value: unknown } | { ok: false }>(() => {
    try {
      return { ok: true, value: JSON.parse(legacyRaw) };
    } catch {
      return { ok: false };
    }
  }, [legacyRaw]);

  const downloadLegacy = (): void => {
    downloadText("fti-legacy-console-v2.json", legacyRaw);
    setDownloaded(true);
  };

  const needsStartDate =
    parsed.ok &&
    isRecord(parsed.value) &&
    !(typeof parsed.value["startDate"] === "string" && isValidLocalDate(parsed.value["startDate"]));

  const startDateOk = !needsStartDate || isValidLocalDate(startInput);

  const legacyDownloadButton = (
    <button type="button" onClick={downloadLegacy}>
      Download legacy JSON
    </button>
  );

  if (!parsed.ok) {
    return (
      <section className="migration">
        <h2>Import from the old app</h2>
        <p>The old data could not be read as JSON. Nothing has been changed.</p>
        <div className="migration-actions">
          {legacyDownloadButton}
          <button type="button" onClick={onDismiss}>
            Start clean
          </button>
        </div>
      </section>
    );
  }

  if (profile === null || plan === null) {
    return (
      <section className="migration">
        <h2>Import from the old app</h2>
        <p>Old data was found. Set up your profile first.</p>
        <details>
          <summary>why?</summary>
          <p>
            The old data records no units, no goal and no schedule, so there is nothing to
            attach it to until a profile and a plan exist.
          </p>
        </details>
        <p>Nothing is deleted from the old app.</p>
        <div className="migration-actions">
          <button type="button" onClick={onRequireSetup}>
            Set up your profile
          </button>
          {legacyDownloadButton}
        </div>
      </section>
    );
  }

  if (phase === "intro") {
    return (
      <section className="migration">
        <h2>Import from the old app</h2>
        <p>Old data was found on this device.</p>
        <details>
          <summary>What transfers</summary>
          <p>
            Logged sets, weekly push-up maxima, body-mass check-ins, hydration, daily notes,
            the specimen cards you collected, and your sealed time capsule.
          </p>
        </details>
        <p>The old app stored bare numbers. A wrong unit rescales your history.</p>
        <p>Nothing is deleted from the old app.</p>
        <div className="migration-actions">
          <button type="button" onClick={() => { setPhase("questions"); }}>
            Continue
          </button>
          <button type="button" onClick={onDismiss}>
            Start clean
          </button>
        </div>
      </section>
    );
  }

  if (phase === "questions") {
    const run = (): void => {
      const payload =
        needsStartDate && isRecord(parsed.value)
          ? { ...parsed.value, startDate: startInput }
          : parsed.value;
      const outcome = migrateV2(payload, {
        loadsEnteredIn,
        bodyMassEnteredIn,
        timezone: profile.timezone,
        profile,
        plan,
      });
      setResult(outcome);
      setPhase("review");
    };

    return (
      <section className="migration">
        <h2>Import from the old app</h2>
        <UnitChoice
          legend="In which unit did you type your loads in the old app?"
          name="loads"
          value={loadsEnteredIn}
          onChange={setLoadsEnteredIn}
          metricLabel="Kilograms (kg)"
          imperialLabel="Pounds (lb)"
        />
        <UnitChoice
          legend="In which unit did you type your body mass?"
          name="mass"
          value={bodyMassEnteredIn}
          onChange={setBodyMassEnteredIn}
          metricLabel="Kilograms (kg), body mass"
          imperialLabel="Pounds (lb), body mass"
        />
        {needsStartDate && (
          <p>
            <label htmlFor="legacy-start">
              The old app has no start date recorded. Which date was day 1?
            </label>
            <input
              id="legacy-start"
              type="date"
              value={startInput}
              onChange={(e) => { setStartInput(e.target.value); }}
            />
          </p>
        )}
        <div className="migration-actions">
          <button type="button" disabled={!startDateOk} onClick={run}>
            Run the import
          </button>
          <button type="button" onClick={onDismiss}>
            Start clean
          </button>
        </div>
      </section>
    );
  }

  if (result === null) {
    return (
      <section className="migration">
        <h2>Import from the old app</h2>
        <p>The import produced no result. Nothing has been changed.</p>
        <div className="migration-actions">{legacyDownloadButton}</div>
      </section>
    );
  }

  const { report } = result;
  const apply = (): void => {
    const current = AppStateSchema.safeParse(JSON.parse(useAppStore.getState().exportJson()));
    if (!current.success) {
      setError(`The current state could not be read back: ${current.error.message}`);
      return;
    }
    onApply(applyMigration(current.data, result.state, profile.id));
  };

  return (
    <section className="migration">
      <h2>Import from the old app</h2>
      <ul className="migration-report">
        <li>{report.setsMigrated} sets</li>
        <li>{report.bodyMassMigrated} body-mass check-ins</li>
        <li>{report.hydrationDays} days of hydration</li>
        <li>{report.notesKept} daily notes</li>
        <li>{report.setsSkipped.length} records could not be imported</li>
      </ul>
      {report.setsSkipped.length > 0 && (
        <details>
          <summary>What could not be imported, and why</summary>
          <ul>
            {report.setsSkipped.map((s) => (
              <li key={s.key}>
                <code>{s.key}</code>: {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p>
        Download the untouched copy first. It is the only record of what was refused.
      </p>
      {error !== null && <p role="alert">{error}</p>}
      <div className="migration-actions">
        {legacyDownloadButton}
        <button type="button" disabled={!downloaded} onClick={apply}>
          Keep this import
        </button>
        <button type="button" onClick={onDismiss}>
          Start clean
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 11: Run the wizard test**

Run: `npx vitest run src/ui/migration/MigrationWizard.test.tsx`
Expected: PASS, 9 tests.

The `17 records could not be imported` assertion is the exact skip count of the fixture:
10 set keys, 1 body-mass row, 2 hydration days, 1 note, 1 push-up week, 1 completion flag,
1 meal swap. If it fails, read the printed list — the number is a property of the fixture,
not a magic constant, and the failure names which record moved.

- [ ] **Step 12: Write the failing gate test**

Create `src/ui/migration/MigrationGate.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { makeBlankState } from "../../test/migrationFactories";
import { useAppStore } from "../../store";
import { MigrationGate } from "./MigrationGate";

beforeEach(() => {
  window.localStorage.clear();
  useAppStore.getState().replaceState(makeBlankState());
});

describe("MigrationGate", () => {
  it("renders the app when there is no legacy store", () => {
    render(<MigrationGate><p>the app</p></MigrationGate>);
    expect(screen.getByText("the app")).toBeTruthy();
  });

  it("renders the wizard when a legacy store exists and nothing has been decided", () => {
    window.localStorage.setItem("fti.console.v2", '{"startDate":"2026-01-05"}');
    render(<MigrationGate><p>the app</p></MigrationGate>);
    expect(screen.getByRole("heading", { name: /import from the old app/i })).toBeTruthy();
    expect(screen.queryByText("the app")).toBeNull();
  });

  it("renders the app once the migration is done", () => {
    window.localStorage.setItem("fti.console.v2", '{"startDate":"2026-01-05"}');
    const s = makeBlankState();
    s.ui.legacyMigration = "done";
    useAppStore.getState().replaceState(s);
    render(<MigrationGate><p>the app</p></MigrationGate>);
    expect(screen.getByText("the app")).toBeTruthy();
  });

  it("renders the app once the user has dismissed the offer", () => {
    window.localStorage.setItem("fti.console.v2", '{"startDate":"2026-01-05"}');
    const s = makeBlankState();
    s.ui.legacyMigration = "dismissed";
    useAppStore.getState().replaceState(s);
    render(<MigrationGate><p>the app</p></MigrationGate>);
    expect(screen.getByText("the app")).toBeTruthy();
  });
});
```

- [ ] **Step 13: Run it to verify it fails**

Run: `npx vitest run src/ui/migration/MigrationGate.test.tsx`
Expected: FAIL — `Failed to resolve import "./MigrationGate"`.

- [ ] **Step 14: Write `src/ui/migration/MigrationGate.tsx`**

```tsx
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AppState } from "../../domain/types";
import { readLegacyV2Raw } from "../../store/persistence";
import { useAppStore } from "../../store";
import { MigrationWizard } from "./MigrationWizard";

/**
 * Renders the migration wizard instead of the app when, and only when, a legacy console
 * store exists on this device and the user has not yet decided what to do about it.
 * The legacy key is never written or removed here: the decision is recorded in
 * `ui.legacyMigration`, so declining is remembered without destroying anything.
 */
export function MigrationGate({ children }: { children: ReactNode }) {
  // read once per mount: the key does not change under us while the app is open
  const [legacyRaw] = useState<string | null>(() => readLegacyV2Raw());
  const status = useAppStore((s) => s.ui.legacyMigration);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const profile = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.profiles[s.activeProfileId] ?? null),
  );
  const cursor = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.cursors[s.activeProfileId] ?? null),
  );
  const plans = useAppStore((s) => s.plans);
  const replaceState = useAppStore((s) => s.replaceState);
  const setUi = useAppStore((s) => s.setUi);
  const [setupRequested, setSetupRequested] = useState(false);

  const plan = useMemo(
    () => (cursor === null ? null : (plans[cursor.planId] ?? null)),
    [cursor, plans],
  );

  if (legacyRaw === null || status !== "pending" || setupRequested) {
    return <>{children}</>;
  }

  const apply = (next: AppState): void => {
    replaceState(next);
  };

  return (
    <MigrationWizard
      legacyRaw={legacyRaw}
      profile={activeProfileId === null ? null : profile}
      plan={plan}
      onApply={apply}
      onDismiss={() => { setUi({ legacyMigration: "dismissed" }); }}
      onRequireSetup={() => { setSetupRequested(true); }}
    />
  );
}
```

`onApply` receives a state whose `ui.legacyMigration` is already `"done"` — `applyMigration`
sets it — so committing it through `replaceState` both stores the data and closes the gate
in one write. There is no second write to race it (code review A43).

- [ ] **Step 15: Run the gate test**

Run: `npx vitest run src/ui/migration/MigrationGate.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 16: Wrap the app in the gate**

In `src/app/App.tsx`, add the import and wrap whatever the component currently returns:

```tsx
import { MigrationGate } from "../ui/migration/MigrationGate";
```

```tsx
  return (
    <MigrationGate>
      {/* the existing return value of App, unchanged */}
    </MigrationGate>
  );
```

`onRequireSetup` unmounts the wizard for the rest of the session, so the setup wizard that
P2 renders for a profile-less state takes over. When setup finishes, the profile exists and
the next app open offers the import again — `ui.legacyMigration` is still `"pending"`.

- [ ] **Step 17: Run the whole suite, lint and build**

Run: `npm test && npx eslint src && npm run build`
Expected: all suites pass; eslint prints nothing; the build succeeds.

- [ ] **Step 18: Commit**

```bash
git add src/app/download.ts src/ui/migration src/app/App.tsx
git commit -m "feat: offer a guided one-way import of the legacy console store on boot"
```

---

### Task 4: `src/ui/views/LogView.tsx` — charts, compliance and records

**Files:**
- Create: `src/domain/training/records.ts`
- Create: `src/domain/training/records.test.ts`
- Create: `src/ui/components/BodyMassChart.tsx`
- Create: `src/ui/components/BodyMassChart.test.tsx`
- Create: `src/ui/components/ComplianceGrid.tsx`
- Create: `src/ui/components/ComplianceGrid.test.tsx`
- Create: `src/ui/components/PRList.tsx`
- Create: `src/ui/components/PRList.test.tsx`
- Create: `src/ui/components/AmrapSpark.tsx`
- Create: `src/ui/components/AmrapSpark.test.tsx`
- Modify: `src/ui/views/LogView.tsx`

**Interfaces:**
- Consumes: `e1RM(loadKg: Kg, reps: number): Kg` from `src/domain/training/progression.ts` (P4, §6.5); `computeTargets(input: NutritionInput): NutritionTargets` from `src/domain/nutrition.ts` (P2, §6.3); `displayMass`, `formatMass`, `formatLoad`, `UNIT_LABEL` from `src/domain/units.ts` (P1, §6.1); `weekStart`, `addDays`, `daysBetween`, `todayLocal`, `compareLocalDate` from `src/domain/dates.ts` (P1, §6.2); `EXERCISE_LIBRARY` from `src/domain/plan/library.ts` (P2).
- Produces, for Task 5:
  - `computeRecords(sets: readonly LoggedSet[]): Map<string, ExerciseRecords>`
  - `weeklyAmrapMax(sets: readonly LoggedSet[], exerciseId: string): { weekStart: LocalDate; reps: number }[]`
  - `ExerciseRecords`, `BestSet`, `BestE1RM`

- [ ] **Step 1: Write the failing records test**

Create `src/domain/training/records.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LoggedSet } from "../types";
import { computeRecords, weeklyAmrapMax } from "./records";

function set(patch: Partial<LoggedSet>): LoggedSet {
  return {
    id: patch.id ?? "x",
    profileId: "p1",
    assignmentDate: "2026-01-05",
    sessionId: "s-push",
    exerciseId: "barbell-bench-press",
    setNumber: 1,
    isBonus: false,
    loadKg: 60, // kg
    enteredUnit: "metric",
    reps: 8,
    durationS: null,
    rpe: null,
    loggedAt: 1767610800000,
    ...patch,
  };
}

describe("computeRecords", () => {
  it("returns nothing for an empty log", () => {
    expect(computeRecords([]).size).toBe(0);
  });

  it("takes the heaviest set, breaking ties on reps then on the earlier date", () => {
    const r = computeRecords([
      set({ id: "a", loadKg: 60, reps: 8 }),
      set({ id: "b", loadKg: 62.5, reps: 6, assignmentDate: "2026-01-12" }),
      set({ id: "c", loadKg: 62.5, reps: 8, assignmentDate: "2026-01-19" }),
      set({ id: "d", loadKg: 62.5, reps: 8, assignmentDate: "2026-01-26" }),
    ]).get("barbell-bench-press");
    expect(r?.bestSet).toEqual({ loadKg: 62.5, reps: 8, date: "2026-01-19" });
  });

  it("takes the highest Epley estimate, which need not be the heaviest set", () => {
    const r = computeRecords([
      set({ id: "a", loadKg: 100, reps: 1 }), // e1RM 103.33
      set({ id: "b", loadKg: 90, reps: 6, assignmentDate: "2026-01-12" }), // e1RM 108
    ]).get("barbell-bench-press");
    expect(r?.bestSet?.loadKg).toBe(100);
    expect(r?.bestE1RM?.loadKg).toBe(90);
    expect(r?.bestE1RM?.reps).toBe(6);
    expect(r?.bestE1RM?.e1RMKg).toBeCloseTo(108, 6);
  });

  it("ignores sets above 10 reps for the Epley estimate (§6.5 guard)", () => {
    const r = computeRecords([
      set({ id: "a", loadKg: 40, reps: 20 }),
      set({ id: "b", loadKg: 80, reps: 5, assignmentDate: "2026-01-12" }),
    ]).get("barbell-bench-press");
    expect(r?.bestE1RM?.loadKg).toBe(80);
  });

  it("has no Epley estimate when every set is bodyweight or unrecorded", () => {
    const r = computeRecords([
      set({ id: "a", exerciseId: "pull-up", loadKg: 0, reps: 8 }),
      set({ id: "b", exerciseId: "pull-up", loadKg: null, reps: 6 }),
    ]).get("pull-up");
    expect(r?.bestE1RM).toBeNull();
    expect(r?.bestSet).toEqual({ loadKg: 0, reps: 8, date: "2026-01-05" });
    expect(r?.bestAmrap).toEqual({ reps: 8, date: "2026-01-05" });
  });

  it("ignores sets with no rep count entirely", () => {
    const r = computeRecords([set({ id: "a", reps: null })]).get("barbell-bench-press");
    expect(r?.bestSet).toBeNull();
    expect(r?.totalSets).toBe(1);
  });

  it("keeps exercises apart", () => {
    const m = computeRecords([
      set({ id: "a" }),
      set({ id: "b", exerciseId: "pendlay-row", loadKg: 70, reps: 6 }),
    ]);
    expect([...m.keys()].sort()).toEqual(["barbell-bench-press", "pendlay-row"]);
  });
});

describe("weeklyAmrapMax", () => {
  it("returns the best rep count per ISO week, ascending", () => {
    const out = weeklyAmrapMax(
      [
        set({ id: "a", exerciseId: "push-up", loadKg: 0, reps: 12, assignmentDate: "2026-01-08" }),
        set({ id: "b", exerciseId: "push-up", loadKg: 0, reps: 10, assignmentDate: "2026-01-09" }),
        set({ id: "c", exerciseId: "push-up", loadKg: 0, reps: 15, assignmentDate: "2026-01-15" }),
        set({ id: "d", exerciseId: "pull-up", loadKg: 0, reps: 99, assignmentDate: "2026-01-15" }),
      ],
      "push-up",
    );
    expect(out).toEqual([
      { weekStart: "2026-01-05", reps: 12 },
      { weekStart: "2026-01-12", reps: 15 },
    ]);
  });

  it("returns nothing when the exercise has no logged reps", () => {
    expect(weeklyAmrapMax([], "push-up")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/domain/training/records.test.ts`
Expected: FAIL — `Failed to resolve import "./records"`.

- [ ] **Step 3: Write `src/domain/training/records.ts`**

```ts
// Personal records over the logged-set history. Pure and library-free: it never looks
// an exercise up, so it works identically for library exercises and user-added ones.

import type { Kg, LocalDate, LoggedSet } from "../types";
import { weekStart } from "../dates";
import { e1RM } from "./progression";

/** Epley is only defended below about 10 reps (master plan §6.5). */
const MAX_E1RM_REPS = 10;

export interface BestSet {
  loadKg: Kg; // kg
  reps: number;
  date: LocalDate;
}

export interface BestE1RM {
  loadKg: Kg; // kg
  reps: number;
  e1RMKg: Kg; // kg, Epley estimate
  date: LocalDate;
}

export interface ExerciseRecords {
  exerciseId: string;
  /** heaviest set: max load, then max reps, then the earliest date it was first achieved */
  bestSet: BestSet | null;
  /** highest Epley estimate among sets with a load above 0 and at most 10 reps */
  bestE1RM: BestE1RM | null;
  /** most reps in one unloaded set (loadKg 0 or not recorded) */
  bestAmrap: { reps: number; date: LocalDate } | null;
  /** every set for this exercise, including ones with no rep count */
  totalSets: number;
}

/** true when `a` should replace `b` as the best set. */
function beatsSet(a: { loadKg: Kg; reps: number; date: LocalDate }, b: BestSet): boolean {
  if (a.loadKg !== b.loadKg) return a.loadKg > b.loadKg;
  if (a.reps !== b.reps) return a.reps > b.reps;
  return a.date < b.date; // same performance, keep the first time it happened
}

export function computeRecords(sets: readonly LoggedSet[]): Map<string, ExerciseRecords> {
  const out = new Map<string, ExerciseRecords>();
  for (const s of sets) {
    let rec = out.get(s.exerciseId);
    if (rec === undefined) {
      rec = { exerciseId: s.exerciseId, bestSet: null, bestE1RM: null, bestAmrap: null, totalSets: 0 };
      out.set(s.exerciseId, rec);
    }
    rec.totalSets += 1;
    if (s.reps === null) continue;

    const load = s.loadKg;
    if (load !== null) {
      const candidate = { loadKg: load, reps: s.reps, date: s.assignmentDate };
      if (rec.bestSet === null || beatsSet(candidate, rec.bestSet)) rec.bestSet = candidate;

      if (load > 0 && s.reps <= MAX_E1RM_REPS) {
        const estimate = e1RM(load, s.reps); // kg
        if (
          rec.bestE1RM === null ||
          estimate > rec.bestE1RM.e1RMKg ||
          (estimate === rec.bestE1RM.e1RMKg && s.assignmentDate < rec.bestE1RM.date)
        ) {
          rec.bestE1RM = { loadKg: load, reps: s.reps, e1RMKg: estimate, date: s.assignmentDate };
        }
      }
    }

    if (load === null || load === 0) {
      if (
        rec.bestAmrap === null ||
        s.reps > rec.bestAmrap.reps ||
        (s.reps === rec.bestAmrap.reps && s.assignmentDate < rec.bestAmrap.date)
      ) {
        rec.bestAmrap = { reps: s.reps, date: s.assignmentDate };
      }
    }
  }
  return out;
}

/** Best rep count per ISO week for one exercise, ascending by week. */
export function weeklyAmrapMax(
  sets: readonly LoggedSet[],
  exerciseId: string,
): { weekStart: LocalDate; reps: number }[] {
  const best = new Map<LocalDate, number>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || s.reps === null) continue;
    const wk = weekStart(s.assignmentDate);
    best.set(wk, Math.max(best.get(wk) ?? 0, s.reps));
  }
  return [...best.entries()]
    .map(([wk, reps]) => ({ weekStart: wk, reps }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
```

- [ ] **Step 4: Run the records test**

Run: `npx vitest run src/domain/training/records.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/training/records.ts src/domain/training/records.test.ts
git commit -m "feat: compute per-exercise records and weekly AMRAP maxima"
```

- [ ] **Step 6: Write the failing body-mass chart test**

Create `src/ui/components/BodyMassChart.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BodyMassEntry } from "../../domain/types";
import { BodyMassChart } from "./BodyMassChart";

function entry(date: string, massKg: number, id: string): BodyMassEntry {
  return {
    id,
    profileId: "p1",
    date,
    massKg, // kg
    enteredUnit: "metric",
    bodyFatPct: null,
    loggedAt: 1767610800000,
  };
}

const BASE = {
  baselineKg: 95.3, // kg
  baselineDate: "2026-01-05",
  expectedRateKgPerWeek: -0.5, // kg/week, negative = loss
  horizonDays: 168,
};

describe("BodyMassChart", () => {
  it("draws a projection even with no measurements", () => {
    const { container } = render(<BodyMassChart entries={[]} units="metric" {...BASE} />);
    const proj = container.querySelector("[data-testid='projection']");
    expect(proj?.getAttribute("d")).toMatch(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/);
    expect(container.querySelectorAll("[data-testid='measured-point']")).toHaveLength(0);
  });

  it("plots one point per measurement", () => {
    const { container } = render(
      <BodyMassChart
        entries={[entry("2026-01-05", 95.3, "a"), entry("2026-01-19", 93.1, "b")]}
        units="metric"
        {...BASE}
      />,
    );
    expect(container.querySelectorAll("[data-testid='measured-point']")).toHaveLength(2);
  });

  it("never emits NaN or Infinity into an SVG attribute", () => {
    const { container } = render(
      <BodyMassChart
        entries={[entry("2026-01-05", 95.3, "a"), entry("2026-01-05", 95.3, "b")]}
        units="metric"
        {...BASE}
        expectedRateKgPerWeek={0}
      />,
    );
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("widens a degenerate domain instead of dividing by zero", () => {
    const { container } = render(
      <BodyMassChart
        entries={[entry("2026-01-05", 80, "a")]}
        units="metric"
        baselineKg={80}
        baselineDate="2026-01-05"
        expectedRateKgPerWeek={0}
        horizonDays={28}
      />,
    );
    const labels = [...container.querySelectorAll("[data-testid='y-label']")].map(
      (n) => n.textContent ?? "",
    );
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("labels the axis in the profile's display unit", () => {
    const { container } = render(
      <BodyMassChart entries={[entry("2026-01-05", 95.3, "a")]} units="imperial" {...BASE} />,
    );
    const labels = [...container.querySelectorAll("[data-testid='y-label']")].map(
      (n) => n.textContent ?? "",
    );
    expect(labels.every((l) => l.endsWith(" lb"))).toBe(true);
  });

  it("extends the domain to cover a measurement taken before the baseline", () => {
    const { container } = render(
      <BodyMassChart entries={[entry("2025-12-01", 99, "a")]} units="metric" {...BASE} />,
    );
    const point = container.querySelector("[data-testid='measured-point']");
    expect(Number(point?.getAttribute("cx"))).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/ui/components/BodyMassChart.test.tsx`
Expected: FAIL — `Failed to resolve import "./BodyMassChart"`.

- [ ] **Step 8: Write `src/ui/components/BodyMassChart.tsx`**

```tsx
// Ported from the legacy core.jsx WeightChart. The three defects that made it
// single-subject are fixed: the y domain comes from the data instead of a fixed
// 180-212 lb window (code review A4), the projection comes from the profile's own
// expected rate instead of a hard-coded 24-week lb curve (A3), and the SVG no longer
// carries `overflow: visible`, so nothing can be drawn over neighbouring UI.

import type { BodyMassEntry, Kg, LocalDate, UnitSystem } from "../../domain/types";
import { daysBetween } from "../../domain/dates";
import { displayMass, formatMass } from "../../domain/units";

export interface BodyMassChartProps {
  entries: readonly BodyMassEntry[];
  units: UnitSystem;
  /** the profile's recorded starting mass */
  baselineKg: Kg; // kg
  baselineDate: LocalDate;
  /** signed; negative means loss (master plan §6.3 NutritionTargets) */
  expectedRateKgPerWeek: number; // kg/week
  /** how far the projection runs from the baseline date */
  horizonDays: number;
  height?: number;
}

const VIEW_W = 640;
const VIEW_H = 260;
const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 26;
const Y_TICKS = 5;

export function BodyMassChart(props: BodyMassChartProps) {
  const { entries, units, baselineKg, baselineDate, expectedRateKgPerWeek, horizonDays } = props;
  const height = props.height ?? 260;

  const offsets = entries.map((e) => daysBetween(baselineDate, e.date));
  const firstDay = Math.min(0, ...offsets);
  const lastDay = Math.max(horizonDays, ...offsets, firstDay + 1);
  const projStartKg = baselineKg; // kg
  const projEndKg = baselineKg + (expectedRateKgPerWeek * lastDay) / 7; // kg

  const values = [projStartKg, projEndKg, ...entries.map((e) => e.massKg)];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 1) {
    const mid = (hi + lo) / 2;
    lo = mid - 1;
    hi = mid + 1;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;

  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = VIEW_H - PAD_T - PAD_B;
  const xAt = (day: number): number => PAD_L + ((day - firstDay) / (lastDay - firstDay)) * innerW;
  const yAt = (kg: number): number => PAD_T + (1 - (kg - lo) / (hi - lo)) * innerH;

  const ticks = Array.from({ length: Y_TICKS }, (_, i) => lo + ((hi - lo) * i) / (Y_TICKS - 1));
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const measuredPath = sorted
    .map((e, i) => `${i === 0 ? "M" : "L"} ${xAt(daysBetween(baselineDate, e.date)).toFixed(1)} ${yAt(e.massKg).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      height={height}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Body mass, measured against a projection of ${displayMass(expectedRateKgPerWeek, units).toFixed(2)} per week`}
    >
      {ticks.map((kg) => (
        <g key={kg.toFixed(3)}>
          <line
            x1={PAD_L}
            x2={VIEW_W - PAD_R}
            y1={yAt(kg).toFixed(1)}
            y2={yAt(kg).toFixed(1)}
            stroke="var(--chart-grid)"
          />
          <text
            data-testid="y-label"
            x={PAD_L - 6}
            y={yAt(kg) + 3}
            textAnchor="end"
            fontSize="10"
            fill="var(--chart-text)"
          >
            {formatMass(kg, units)}
          </text>
        </g>
      ))}
      <path
        data-testid="projection"
        d={`M ${xAt(0).toFixed(1)} ${yAt(projStartKg).toFixed(1)} L ${xAt(lastDay).toFixed(1)} ${yAt(projEndKg).toFixed(1)}`}
        fill="none"
        stroke="var(--chart-line)"
        strokeWidth="1.25"
        strokeDasharray="3 3"
      />
      {measuredPath !== "" && (
        <path
          data-testid="measured"
          d={measuredPath}
          fill="none"
          stroke="var(--chart-actual)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      )}
      {sorted.map((e) => (
        <circle
          key={e.id}
          data-testid="measured-point"
          cx={xAt(daysBetween(baselineDate, e.date)).toFixed(1)}
          cy={yAt(e.massKg).toFixed(1)}
          r="3"
          fill="var(--chart-actual)"
        >
          <title>{`${e.date}: ${formatMass(e.massKg, units)}`}</title>
        </circle>
      ))}
    </svg>
  );
}
```

- [ ] **Step 9: Run the chart test**

Run: `npx vitest run src/ui/components/BodyMassChart.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 10: Write the failing compliance-grid test**

Create `src/ui/components/ComplianceGrid.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionAssignment } from "../../domain/types";
import { ComplianceGrid, buildStatusIndex } from "./ComplianceGrid";

function assignment(date: string, status: SessionAssignment["status"]): SessionAssignment {
  return {
    date,
    sessionId: "s-push",
    sourceIndex: 0,
    status,
    startedAt: null,
    completedAt: null,
    skipReason: null,
  };
}

describe("buildStatusIndex", () => {
  it("indexes every assignment by date in one pass", () => {
    const idx = buildStatusIndex([
      assignment("2026-01-05", "completed"),
      assignment("2026-01-07", "skipped"),
    ]);
    expect(idx.get("2026-01-05")).toBe("completed");
    expect(idx.get("2026-01-07")).toBe("skipped");
    expect(idx.get("2026-01-06")).toBeUndefined();
  });

  it("keeps the last assignment when a date somehow appears twice", () => {
    const idx = buildStatusIndex([
      assignment("2026-01-05", "planned"),
      assignment("2026-01-05", "completed"),
    ]);
    expect(idx.get("2026-01-05")).toBe("completed");
  });
});

describe("ComplianceGrid", () => {
  const props = {
    weekStarts: ["2026-01-05", "2026-01-12"],
    slotWeekdays: [1, 3, 5] as const,
  };

  it("renders one cell per slot day per week, never a rest day", () => {
    render(<ComplianceGrid assignments={[]} weekStarts={props.weekStarts} slotWeekdays={[...props.slotWeekdays]} />);
    expect(screen.getAllByRole("gridcell")).toHaveLength(6);
    expect(screen.queryByLabelText(/2026-01-06/)).toBeNull(); // Tuesday is not a slot day
  });

  it("marks the status of each slot day", () => {
    render(
      <ComplianceGrid
        assignments={[assignment("2026-01-05", "completed"), assignment("2026-01-07", "skipped")]}
        weekStarts={props.weekStarts}
        slotWeekdays={[...props.slotWeekdays]}
      />,
    );
    expect(screen.getByLabelText("2026-01-05: completed")).toBeTruthy();
    expect(screen.getByLabelText("2026-01-07: skipped")).toBeTruthy();
    expect(screen.getByLabelText("2026-01-09: not planned")).toBeTruthy();
  });

  it("renders nothing but a message when there are no weeks yet", () => {
    render(<ComplianceGrid assignments={[]} weekStarts={[]} slotWeekdays={[1]} />);
    expect(screen.getByText(/no weeks to show yet/i)).toBeTruthy();
  });
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `npx vitest run src/ui/components/ComplianceGrid.test.tsx`
Expected: FAIL — `Failed to resolve import "./ComplianceGrid"`.

- [ ] **Step 12: Write `src/ui/components/ComplianceGrid.tsx`**

```tsx
// Rewritten from the legacy console-shared.jsx ComplianceGrid. That version built a
// 168-element array and then called `cells.find(...)` inside a nested render loop —
// about 14,000 comparisons per render (code review A48) — and marked every rest day
// non-compliant. This one indexes the assignments once, O(n), and only ever renders
// days the user actually said they train on, so a rest day cannot look like a failure.

import type { AssignmentStatus, IsoWeekday, LocalDate, SessionAssignment } from "../../domain/types";
import { addDays } from "../../domain/dates";

export interface ComplianceGridProps {
  assignments: readonly SessionAssignment[];
  /** Monday of each week to display, ascending */
  weekStarts: readonly LocalDate[];
  /** the weekdays the user has availability slots on, ascending; rest days are absent */
  slotWeekdays: readonly IsoWeekday[];
}

/** date -> status, built in one pass. */
export function buildStatusIndex(
  assignments: readonly SessionAssignment[],
): Map<LocalDate, AssignmentStatus> {
  const idx = new Map<LocalDate, AssignmentStatus>();
  for (const a of assignments) idx.set(a.date, a.status);
  return idx;
}

export function ComplianceGrid(props: ComplianceGridProps) {
  const { assignments, weekStarts, slotWeekdays } = props;
  const index = buildStatusIndex(assignments);

  if (weekStarts.length === 0) {
    return <p className="empty">No weeks to show yet.</p>;
  }

  return (
    <div className="compliance" role="grid" aria-label="Session compliance by week">
      {weekStarts.map((monday) => (
        <div className="compliance-row" role="row" key={monday}>
          <span className="compliance-week">{monday}</span>
          {slotWeekdays.map((weekday) => {
            const date = addDays(monday, weekday - 1);
            const status = index.get(date) ?? null;
            return (
              <span
                key={date}
                role="gridcell"
                className={`compliance-cell ${status ?? "none"}`}
                aria-label={`${date}: ${status ?? "not planned"}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 13: Run the grid test**

Run: `npx vitest run src/ui/components/ComplianceGrid.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 14: Write the failing PR-list and AMRAP-spark tests**

Create `src/ui/components/PRList.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Exercise, LoggedSet } from "../../domain/types";
import { PRList } from "./PRList";

const BENCH: Exercise = {
  id: "barbell-bench-press",
  name: "Barbell bench press",
  isBodyweight: false,
  isCompoundPrimary: true,
  modality: "barbell",
  loadClass: "upper-compound",
  muscleGroups: ["chest"],
  equipment: ["full-gym"],
  videoQuery: null,
  formCueId: null,
  note: null,
};

function set(patch: Partial<LoggedSet>): LoggedSet {
  return {
    id: "x",
    profileId: "p1",
    assignmentDate: "2026-01-05",
    sessionId: "s-push",
    exerciseId: "barbell-bench-press",
    setNumber: 1,
    isBonus: false,
    loadKg: 60, // kg
    enteredUnit: "metric",
    reps: 8,
    durationS: null,
    rpe: null,
    loggedAt: 1767610800000,
    ...patch,
  };
}

describe("PRList", () => {
  const library = { [BENCH.id]: BENCH };

  it("says so when nothing has been logged", () => {
    render(<PRList sets={[]} library={library} units="metric" />);
    expect(screen.getByText(/no sets logged yet/i)).toBeTruthy();
  });

  it("shows the best load times reps and the best estimated 1RM, in kg", () => {
    render(
      <PRList
        sets={[set({ id: "a", loadKg: 60, reps: 8 }), set({ id: "b", loadKg: 90, reps: 3 })]}
        library={library}
        units="metric"
      />,
    );
    expect(screen.getByText("Barbell bench press")).toBeTruthy();
    expect(screen.getByText(/^90(\.0)? kg × 3$/)).toBeTruthy();
    expect(screen.getByText(/^99(\.0)? kg estimated 1RM$/)).toBeTruthy();
  });

  it("shows the same records in lb for an imperial profile", () => {
    render(<PRList sets={[set({ id: "a", loadKg: 60, reps: 8 })]} library={library} units="imperial" />);
    expect(screen.getByText(/^132\.3 lb × 8$/)).toBeTruthy();
  });

  it("names an exercise that is not in the library by its id", () => {
    render(<PRList sets={[set({ id: "a", exerciseId: "ghost" })]} library={library} units="metric" />);
    expect(screen.getByText("ghost")).toBeTruthy();
  });

  it("shows BW for a bodyweight record instead of 0 kg", () => {
    render(
      <PRList
        sets={[set({ id: "a", exerciseId: "ghost", loadKg: 0, reps: 20 })]}
        library={library}
        units="metric"
      />,
    );
    expect(screen.getByText(/^BW × 20$/)).toBeTruthy();
  });
});
```

Create `src/ui/components/AmrapSpark.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Exercise, LoggedSet } from "../../domain/types";
import { AmrapSpark } from "./AmrapSpark";

const PUSHUP: Exercise = {
  id: "push-up",
  name: "Push-up",
  isBodyweight: true,
  isCompoundPrimary: false,
  modality: "bodyweight",
  loadClass: "upper-compound",
  muscleGroups: ["chest"],
  equipment: ["bodyweight"],
  videoQuery: null,
  formCueId: null,
  note: null,
};

function set(date: string, reps: number, id: string): LoggedSet {
  return {
    id,
    profileId: "p1",
    assignmentDate: date,
    sessionId: "legacy-v2",
    exerciseId: "push-up",
    setNumber: 1,
    isBonus: true,
    loadKg: 0, // kg
    enteredUnit: "metric",
    reps,
    durationS: null,
    rpe: null,
    loggedAt: 1767610800000,
  };
}

describe("AmrapSpark", () => {
  it("says so when the exercise has no logged reps", () => {
    render(<AmrapSpark sets={[]} exercise={PUSHUP} />);
    expect(screen.getByText(/no push-up sets logged yet/i)).toBeTruthy();
  });

  it("draws one point per week and states the best", () => {
    const { container } = render(
      <AmrapSpark
        sets={[set("2026-01-08", 12, "a"), set("2026-01-09", 10, "b"), set("2026-01-15", 15, "c")]}
        exercise={PUSHUP}
      />,
    );
    expect(container.querySelectorAll("[data-testid='amrap-point']")).toHaveLength(2);
    expect(screen.getByText(/best 15 reps/i)).toBeTruthy();
  });

  it("does not divide by zero on a single week", () => {
    const { container } = render(<AmrapSpark sets={[set("2026-01-08", 12, "a")]} exercise={PUSHUP} />);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});
```

- [ ] **Step 15: Run both to verify they fail**

Run: `npx vitest run src/ui/components/PRList.test.tsx src/ui/components/AmrapSpark.test.tsx`
Expected: FAIL — both imports unresolved.

- [ ] **Step 16: Write `src/ui/components/PRList.tsx`**

```tsx
// Ported from console-views.jsx PRList. The max-by-(load, reps) reduction was correct
// and is kept; what changes is that the unit label comes from the profile instead of
// being the literal string "kg" (code review A1, A5), the reduction lives in a tested
// domain module instead of a `useMemo` in the view, and the estimated 1RM is shown
// beside the heaviest set because they are frequently different sessions.

import type { Exercise, LoggedSet, UnitSystem } from "../../domain/types";
import { computeRecords } from "../../domain/training/records";
import { formatLoad } from "../../domain/units";

export interface PRListProps {
  sets: readonly LoggedSet[];
  library: Readonly<Record<string, Exercise>>;
  units: UnitSystem;
}

export function PRList(props: PRListProps) {
  const { sets, library, units } = props;
  const records = [...computeRecords(sets).values()]
    .filter((r) => r.bestSet !== null)
    .map((r) => ({ ...r, name: library[r.exerciseId]?.name ?? r.exerciseId }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (records.length === 0) {
    return <p className="empty">No sets logged yet.</p>;
  }

  return (
    <ul className="pr-list">
      {records.map((r) => (
        <li key={r.exerciseId} className="pr-row">
          <span className="pr-name">{r.name}</span>
          <span className="pr-best">
            {formatLoad(r.bestSet?.loadKg ?? null, units)} × {r.bestSet?.reps ?? 0}
          </span>
          <span className="pr-e1rm">
            {r.bestE1RM === null
              ? "no estimated 1RM"
              : `${formatLoad(r.bestE1RM.e1RMKg, units)} estimated 1RM`}
          </span>
          <span className="pr-when">{r.bestSet?.date ?? ""}</span>
        </li>
      ))}
    </ul>
  );
}
```

`formatLoad` returns `"BW"` for a load of 0 and rounds to 0.1 in the display unit, so
`60 kg` shows as `132.3 lb` for an imperial profile and the estimated 1RM of a 90 kg × 3
set shows as `99 kg` (Epley: 90 × (1 + 3/30) = 99).

- [ ] **Step 17: Write `src/ui/components/AmrapSpark.tsx`**

```tsx
// Replaces the legacy PushupSpark (core.jsx:151-179), which plotted one subject's
// hard-coded 24-week push-up target curve on a fixed 0-55 axis. This one takes its
// domain from the data and works for any bodyweight exercise the user actually logs.

import type { Exercise, LoggedSet } from "../../domain/types";
import { weeklyAmrapMax } from "../../domain/training/records";

export interface AmrapSparkProps {
  sets: readonly LoggedSet[];
  exercise: Exercise;
  height?: number;
}

const VIEW_W = 320;
const VIEW_H = 64;
const PAD = 6;

export function AmrapSpark(props: AmrapSparkProps) {
  const { sets, exercise } = props;
  const height = props.height ?? 64;
  const series = weeklyAmrapMax(sets, exercise.id);

  if (series.length === 0) {
    return <p className="empty">{`No ${exercise.name} sets logged yet.`}</p>;
  }

  const best = Math.max(...series.map((p) => p.reps));
  const span = Math.max(1, series.length - 1);
  const top = Math.max(1, best);
  const xAt = (i: number): number => PAD + (i / span) * (VIEW_W - 2 * PAD);
  const yAt = (reps: number): number => VIEW_H - PAD - (reps / top) * (VIEW_H - 2 * PAD);
  const path = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.reps).toFixed(1)}`)
    .join(" ");

  return (
    <figure className="amrap-spark">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${exercise.name}: best reps per week`}
      >
        <path d={path} fill="none" stroke="var(--chart-actual)" strokeWidth="1.5" />
        {series.map((p, i) => (
          <circle
            key={p.weekStart}
            data-testid="amrap-point"
            cx={xAt(i).toFixed(1)}
            cy={yAt(p.reps).toFixed(1)}
            r="2.5"
            fill="var(--chart-actual)"
          >
            <title>{`${p.weekStart}: ${p.reps} reps`}</title>
          </circle>
        ))}
      </svg>
      <figcaption>{`${exercise.name}: best ${best} reps in one set`}</figcaption>
    </figure>
  );
}
```

- [ ] **Step 18: Run both component tests**

Run: `npx vitest run src/ui/components/PRList.test.tsx src/ui/components/AmrapSpark.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 19: Assemble `src/ui/views/LogView.tsx`**

Replace the file's contents:

```tsx
import { useMemo } from "react";
import { addDays, compareLocalDate, todayLocal, weekStart } from "../../domain/dates";
import { computeTargets } from "../../domain/nutrition";
import { EXERCISE_LIBRARY } from "../../domain/plan/library";
import type { Exercise, IsoWeekday, LocalDate, LoggedSet } from "../../domain/types";
import { useAppStore } from "../../store";
import { AmrapSpark } from "../components/AmrapSpark";
import { BodyMassChart } from "../components/BodyMassChart";
import { ComplianceGrid } from "../components/ComplianceGrid";
import { PRList } from "../components/PRList";

/** Every Monday from `from` up to and including the week containing `to`. */
function weeksBetween(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  let cursor = weekStart(from);
  const last = weekStart(to);
  while (compareLocalDate(cursor, last) <= 0) {
    out.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return out;
}

export function LogView() {
  const profileId = useAppStore((s) => s.activeProfileId);
  const profile = useAppStore((s) => (s.activeProfileId === null ? null : (s.profiles[s.activeProfileId] ?? null)));
  const availability = useAppStore((s) => (profileId === null ? null : (s.availability[profileId] ?? null)));
  const cursor = useAppStore((s) => (profileId === null ? null : (s.cursors[profileId] ?? null)));
  const assignments = useAppStore((s) => (profileId === null ? null : (s.assignments[profileId] ?? null)));
  const bodyMass = useAppStore((s) => (profileId === null ? null : (s.bodyMass[profileId] ?? null)));
  const allSets = useAppStore((s) => s.sets);
  const customExercises = useAppStore((s) => (profileId === null ? null : (s.customExercises[profileId] ?? null)));

  const sets = useMemo<LoggedSet[]>(
    () => (profileId === null ? [] : Object.values(allSets).filter((s) => s.profileId === profileId)),
    [allSets, profileId],
  );

  const library = useMemo<Record<string, Exercise>>(() => {
    const merged: Record<string, Exercise> = { ...EXERCISE_LIBRARY };
    for (const ex of customExercises ?? []) merged[ex.id] = ex;
    return merged;
  }, [customExercises]);

  if (profile === null || profileId === null) {
    return <p className="empty">No profile yet. Finish setup first.</p>;
  }

  const today = todayLocal(profile.timezone);
  const latestMassKg = (bodyMass ?? []).at(-1)?.massKg ?? profile.body.baselineMassKg; // kg
  const targets = computeTargets({
    sex: profile.body.sex,
    ageYears: Number(today.slice(0, 4)) - profile.body.birthYear,
    heightCm: profile.body.heightCm,
    massKg: latestMassKg, // kg
    bodyFatPct: profile.body.baselineBodyFatPct,
    activity: profile.activity,
    goal: profile.goal.kind,
    sessionsPerWeek: availability?.weeklySessionTarget ?? 0,
    creatine: profile.supplements.creatine,
  });

  const weekStarts = weeksBetween(cursor?.startedOn ?? profile.body.baselineAt, today);
  const slotWeekdays: IsoWeekday[] = [...new Set((availability?.slots ?? []).map((s) => s.weekday))].sort(
    (a, b) => a - b,
  );

  const bodyweightExercises = [...new Set(sets.map((s) => s.exerciseId))]
    .map((id) => library[id])
    .filter((ex): ex is Exercise => ex !== undefined && ex.isBodyweight);

  return (
    <div className="log">
      <h2>Log</h2>

      <section>
        <h3>Body mass</h3>
        <p className="card-meta">{`Baseline ${profile.body.baselineAt}.`}</p>
        <details>
          <summary>why?</summary>
          <p className="card-meta">
            {`Projection ${targets.expectedRateKgPerWeek.toFixed(2)} kg per week (${targets.basis.deficitRule}).`}
          </p>
        </details>
        <BodyMassChart
          entries={bodyMass ?? []}
          units={profile.units}
          baselineKg={profile.body.baselineMassKg}
          baselineDate={profile.body.baselineAt}
          expectedRateKgPerWeek={targets.expectedRateKgPerWeek}
          horizonDays={weekStarts.length * 7}
        />
      </section>

      <section>
        <h3>Compliance</h3>
        <ComplianceGrid
          assignments={assignments ?? []}
          weekStarts={weekStarts}
          slotWeekdays={slotWeekdays}
        />
      </section>

      {bodyweightExercises.map((ex) => (
        <section key={ex.id}>
          <h3>{`${ex.name}: best reps per week`}</h3>
          <AmrapSpark sets={sets} exercise={ex} />
        </section>
      ))}

      <section>
        <h3>Personal records</h3>
        <PRList sets={sets} library={library} units={profile.units} />
      </section>
    </div>
  );
}
```

- [ ] **Step 20: Run the whole suite, lint and build**

Run: `npm test && npx eslint src && npm run build`
Expected: all suites pass; eslint prints nothing; the build succeeds.

If `computeTargets` rejects `sessionsPerWeek: 0` (no availability yet), guard the call by
returning the "No profile yet" branch when `availability === null` as well — the Log view
has nothing to project against before setup finishes.

- [ ] **Step 21: Commit**

```bash
git add src/ui/components src/ui/views/LogView.tsx
git commit -m "feat: rebuild the Log view on the v3 types with unit-aware records"
```

---

### Task 5: `src/ui/views/ExportView.tsx` — export, calendar and validated import

**Files:**
- Create: `src/domain/export/ics.ts`
- Create: `src/domain/export/ics.test.ts`
- Create: `src/domain/export/summary.ts`
- Create: `src/domain/export/summary.test.ts`
- Modify: `src/ui/views/ExportView.tsx`
- Create: `src/ui/views/ExportView.test.tsx`

**Interfaces:**
- Consumes: `downloadText` from `src/app/download.ts` (Task 3); `computeRecords` from `src/domain/training/records.ts` (Task 4); `computeTargets` from `src/domain/nutrition.ts` (P2, §6.3); `projectedCalendar(state, profileId, from, days): CalendarDay[]` from `src/domain/schedule/calendar.ts` (P3, §6.4); `instantOf`, `todayLocal` from `src/domain/dates.ts` (P1); `formatLoad`, `formatMass`, `UNIT_LABEL` from `src/domain/units.ts` (P1); `exportJson(): string`, `importJson(text): { ok: true } | { ok: false; error: string }` from the store (P1, §6.7); `AppStateSchema` from `src/domain/schema.ts` (P1); `EXERCISE_LIBRARY` from `src/domain/plan/library.ts` (P2).
- Produces:
  - `buildIcs(events: readonly IcsEvent[], timeZone: TimeZone, nowMs: EpochMs): string`, `IcsEvent`
  - `buildSummary(state: AppState, profileId: string, now: EpochMs): string`

Per master plan §8, `importJson` is the only path into the store for imported data and it
commits through `replaceState`; this view never writes state itself. That closes the
import race the old app had (code review A43) and the unvalidated-write path (security C1).

P9 correction, 2026-09-02. The shipped `buildIcs` takes the profile's IANA zone as its
second argument and emits a `VTIMEZONE` block built from it, so a calendar client places the
session at the wall-clock time the user sees. It throws a `RangeError` on a zone this build's
ICU data cannot resolve rather than falling back to the device zone. `IcsEvent` carries `date`
and `startTime` in that zone, not the `startMs` instant the draft below uses. The draft in this
task predates both changes; `src/domain/export/ics.ts` is the contract.

- [ ] **Step 1: Write the failing `.ics` test**

Create `src/domain/export/ics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildIcs } from "./ics";
import type { IcsEvent } from "./ics";

const NOW = Date.UTC(2026, 8, 1, 12, 0, 0); // 2026-09-01T12:00:00Z

function event(patch: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: "2026-09-07-s-push@fixthisinjustice",
    startMs: Date.UTC(2026, 8, 7, 6, 0, 0), // 2026-09-07T06:00:00Z
    durationS: 4200, // s
    summary: "Push",
    description: "Session 5 of 48",
    alarmLeadMinutes: 120,
    ...patch,
  };
}

describe("buildIcs", () => {
  it("terminates every line with CRLF", () => {
    const out = buildIcs([event()], NOW);
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(out.split("\r\n").length - 1).toBe(out.split("\n").length - 1);
  });

  it("wraps the events in a single VCALENDAR with a PRODID", () => {
    const out = buildIcs([event(), event({ uid: "b@x" })], NOW);
    expect(out.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(out).toContain("PRODID:-//FixThisInjustice//Training companion//EN");
    expect(out).toContain("VERSION:2.0");
  });

  it("writes DTSTAMP, DTSTART and DTEND as UTC instants", () => {
    const out = buildIcs([event()], NOW);
    expect(out).toContain("DTSTAMP:20260901T120000Z");
    expect(out).toContain("DTSTART:20260907T060000Z");
    expect(out).toContain("DTEND:20260907T071000Z"); // +4200 s
  });

  it("attaches a DISPLAY alarm two hours before the start", () => {
    const out = buildIcs([event()], NOW);
    expect(out).toContain("BEGIN:VALARM");
    expect(out).toContain("ACTION:DISPLAY");
    expect(out).toContain("TRIGGER:-PT2H");
    expect(out).toMatch(/BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT2H\r\nDESCRIPTION:/);
  });

  it("expresses a lead time that is not a whole hour in minutes", () => {
    const out = buildIcs([event({ alarmLeadMinutes: 90 })], NOW);
    expect(out).toContain("TRIGGER:-PT90M");
  });

  it("escapes the characters RFC 5545 reserves in TEXT values", () => {
    const out = buildIcs([event({ summary: "Legs; heavy, back\\front\nsecond line" })], NOW);
    expect(out).toContain("SUMMARY:Legs\\; heavy\\, back\\\\front\\nsecond line");
  });

  it("folds every content line at 75 octets with a leading space", () => {
    const out = buildIcs([event({ description: "x".repeat(300) })], NOW);
    const lines = out.split("\r\n").filter((l) => l !== "");
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(lines.some((l) => l.startsWith(" "))).toBe(true);
  });

  it("produces a valid empty calendar for no events", () => {
    const out = buildIcs([], NOW);
    expect(out).toContain("BEGIN:VCALENDAR");
    expect(out).not.toContain("BEGIN:VEVENT");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/domain/export/ics.test.ts`
Expected: FAIL — `Failed to resolve import "./ics"`.

- [ ] **Step 3: Write `src/domain/export/ics.ts`**

```ts
// RFC 5545 (https://www.rfc-editor.org/rfc/rfc5545.html) calendar export.
// A courtesy only: master plan §1.5 rejected calendar alarms as the reminder mechanism
// because whether an imported VALARM fires is unverified on both phone platforms. The
// Export view says so beside the button. The reminders that are relied on are Web Push
// (P5).
//
// Instants are written in UTC ("...Z"), so no VTIMEZONE component is needed: these are
// 28 discrete instants, not a recurring local-time series.

import type { EpochMs, Seconds } from "../types";

export interface IcsEvent {
  /** globally unique and stable across exports of the same session */
  uid: string;
  startMs: EpochMs; // epoch ms, UTC
  durationS: Seconds; // s
  summary: string;
  description: string;
  /** minutes before the start at which the alarm fires */
  alarmLeadMinutes: number;
}

const PRODID = "-//FixThisInjustice//Training companion//EN";
const MAX_OCTETS = 75;

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

/** epoch ms -> "YYYYMMDDTHHMMSSZ". Built from UTC getters, never from toISOString. */
function icsStamp(ms: EpochMs): string {
  const d = new Date(ms);
  return (
    String(d.getUTCFullYear()) +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    "Z"
  );
}

/** RFC 5545 §3.3.11 TEXT escaping. Backslash first, or the others get double-escaped. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

/**
 * RFC 5545 §3.1: "Lines of text SHOULD NOT be longer than 75 octets" and a long line is
 * split by inserting CRLF followed by a single space. The limit is octets, not
 * characters, so this measures UTF-8 and never splits a multi-byte sequence.
 */
function fold(line: string): string[] {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= MAX_OCTETS) return [line];
  const out: string[] = [];
  let current = "";
  let budget = MAX_OCTETS;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (encoder.encode(current).length + size > budget) {
      out.push(current);
      current = " ";
      budget = MAX_OCTETS;
    }
    current += ch;
  }
  if (current !== "") out.push(current);
  return out;
}

/** "-PT2H" for whole hours, "-PT90M" otherwise. */
function trigger(leadMinutes: number): string {
  const minutes = Math.max(0, Math.round(leadMinutes));
  return minutes % 60 === 0 && minutes !== 0
    ? `-PT${String(minutes / 60)}H`
    : `-PT${String(minutes)}M`;
}

export function buildIcs(events: readonly IcsEvent[], nowMs: EpochMs): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${icsStamp(nowMs)}`,
      `DTSTART:${icsStamp(e.startMs)}`,
      `DTEND:${icsStamp(e.startMs + e.durationS * 1000)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      `DESCRIPTION:${escapeText(e.description)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `TRIGGER:${trigger(e.alarmLeadMinutes)}`,
      `DESCRIPTION:${escapeText(e.summary)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.flatMap(fold).join("\r\n") + "\r\n";
}
```

- [ ] **Step 4: Run the `.ics` test**

Run: `npx vitest run src/domain/export/ics.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the failing summary test**

Create `src/domain/export/summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeBlankState, makeProfile } from "../../test/migrationFactories";
import type { AppState, LoggedSet } from "../types";
import { buildSummary } from "./summary";

const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);

function withSets(state: AppState): AppState {
  const set = (id: string, loadKg: number, reps: number): LoggedSet => ({
    id,
    profileId: "p1",
    assignmentDate: "2026-01-05",
    sessionId: "s-push",
    exerciseId: "barbell-bench-press",
    setNumber: 1,
    isBonus: false,
    loadKg, // kg
    enteredUnit: "metric",
    reps,
    durationS: null,
    rpe: null,
    loggedAt: 1767610800000,
  });
  return { ...state, sets: { a: set("a", 60, 8), b: set("b", 90, 3) } };
}

describe("buildSummary", () => {
  it("states the unit system explicitly", () => {
    const out = buildSummary(makeBlankState(), "p1", NOW);
    expect(out).toMatch(/Units:\s+metric \(kg, mL\)/);
    expect(out).toMatch(/All loads and masses in this document are in kg\./);
  });

  it("states the imperial unit system for an imperial profile", () => {
    const state = makeBlankState(makeProfile({ units: "imperial" }));
    const out = buildSummary(state, "p1", NOW);
    expect(out).toMatch(/Units:\s+imperial \(lb, fl oz\)/);
    expect(out).toMatch(/All loads and masses in this document are in lb\./);
  });

  it("reports the profile's own goal, never a hard-coded baseline", () => {
    const out = buildSummary(makeBlankState(), "p1", NOW);
    expect(out).toContain("Test subject");
    expect(out).toMatch(/Goal:\s+fat-loss/);
    expect(out).toMatch(/Baseline:\s+95\.3 kg on 2026-01-05/);
  });

  it("lists the nutrition targets computed for this profile", () => {
    const out = buildSummary(makeBlankState(), "p1", NOW);
    expect(out).toMatch(/Resting metabolic rate:\s+\d+ kcal/);
    expect(out).toMatch(/Protein:\s+\d+-\d+ g/);
    expect(out).toMatch(/Expected rate:\s+-?\d+\.\d\d kg\/week/);
  });

  it("lists sessions completed against the weekly target", () => {
    const state = makeBlankState();
    state.weeklyReviews = {
      p1: [
        {
          profileId: "p1",
          weekStart: "2026-01-05",
          weekEnd: "2026-01-11",
          target: 4,
          completed: 3,
          skipped: 1,
          paused: false,
          delta: -1,
          evaluatedAt: NOW,
          missHandled: false,
        },
      ],
    };
    const out = buildSummary(state, "p1", NOW);
    expect(out).toMatch(/2026-01-05\s+3 \/ 4\s+\(-1\)/);
  });

  it("lists personal records with the exercise name and the estimated 1RM", () => {
    const out = buildSummary(withSets(makeBlankState()), "p1", NOW);
    expect(out).toContain("Barbell bench press");
    expect(out).toMatch(/90(\.0)? kg × 3/);
    expect(out).toMatch(/99(\.0)? kg estimated 1RM/);
  });

  it("returns a stated failure rather than throwing for an unknown profile", () => {
    const out = buildSummary(makeBlankState(), "nobody", NOW);
    expect(out).toMatch(/no profile with id "nobody"/i);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/domain/export/summary.test.ts`
Expected: FAIL — `Failed to resolve import "./summary"`.

- [ ] **Step 7: Write `src/domain/export/summary.ts`**

```ts
// The plain-text export. Ported from console-views.jsx ExportView, with the two defects
// the code review named repaired: the unit system is stated in the document instead of
// being implied (A6), and every figure comes from the profile instead of one subject's
// hard-coded 210 lb baseline (A3).

import type { AppState, EpochMs } from "../types";
import { localDateOf } from "../dates";
import { computeTargets } from "../nutrition";
import { EXERCISE_LIBRARY } from "../plan/library";
import { computeRecords } from "../training/records";
import { UNIT_LABEL, formatLoad, formatMass } from "../units";

function pad(label: string, width: number): string {
  return label.length >= width ? `${label} ` : label + " ".repeat(width - label.length);
}

export function buildSummary(state: AppState, profileId: string, now: EpochMs): string {
  const profile = state.profiles[profileId];
  if (profile === undefined) {
    return `FIXTHISINJUSTICE TRAINING SUMMARY\n\nThere is no profile with id "${profileId}" in this state.\n`;
  }

  const units = profile.units;
  const label = UNIT_LABEL[units];
  const today = localDateOf(now, profile.timezone);
  const mass = state.bodyMass[profileId] ?? [];
  const latestMassKg = mass.at(-1)?.massKg ?? profile.body.baselineMassKg; // kg
  const availability = state.availability[profileId] ?? null;

  const targets = computeTargets({
    sex: profile.body.sex,
    ageYears: Number(today.slice(0, 4)) - profile.body.birthYear,
    heightCm: profile.body.heightCm,
    massKg: latestMassKg, // kg
    bodyFatPct: profile.body.baselineBodyFatPct,
    activity: profile.activity,
    goal: profile.goal.kind,
    sessionsPerWeek: availability?.weeklySessionTarget ?? 0,
    creatine: profile.supplements.creatine,
  });

  const sets = Object.values(state.sets).filter((s) => s.profileId === profileId);
  const library = { ...EXERCISE_LIBRARY };
  for (const ex of state.customExercises[profileId] ?? []) library[ex.id] = ex;
  const records = [...computeRecords(sets).values()]
    .filter((r) => r.bestSet !== null)
    .map((r) => ({ ...r, name: library[r.exerciseId]?.name ?? r.exerciseId }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const reviews = [...(state.weeklyReviews[profileId] ?? [])].sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  );

  const lines: string[] = [];
  lines.push("FIXTHISINJUSTICE TRAINING SUMMARY");
  lines.push("");
  lines.push(`${pad("Generated:", 18)}${today}`);
  lines.push(`${pad("Profile:", 18)}${profile.displayName}`);
  lines.push(`${pad("Time zone:", 18)}${profile.timezone}`);
  lines.push(`${pad("Units:", 18)}${units} (${label.load}, ${label.volume})`);
  lines.push(
    `${pad("Goal:", 18)}${profile.goal.kind}` +
      (profile.goal.targetMassKg === null
        ? ""
        : `, target ${formatMass(profile.goal.targetMassKg, units)}`) +
      (profile.goal.targetDate === null ? "" : ` by ${profile.goal.targetDate}`),
  );
  lines.push(`${pad("Baseline:", 18)}${formatMass(profile.body.baselineMassKg, units)} on ${profile.body.baselineAt}`);
  lines.push(`${pad("Latest body mass:", 18)}${formatMass(latestMassKg, units)}`);
  lines.push("");

  lines.push("TARGETS (per day)");
  lines.push(`  ${pad("Resting metabolic rate:", 26)}${String(Math.round(targets.rmrKcal))} kcal`);
  lines.push(`  ${pad("Total daily energy:", 26)}${String(Math.round(targets.tdeeKcal))} kcal`);
  lines.push(`  ${pad("Intake target:", 26)}${String(Math.round(targets.targetKcal))} kcal`);
  lines.push(`  ${pad("Protein:", 26)}${String(Math.round(targets.proteinG.lo))}-${String(Math.round(targets.proteinG.hi))} g`);
  lines.push(`  ${pad("Fluid (beverages):", 26)}${String(Math.round(targets.fluidML))} mL`);
  lines.push(
    `  ${pad("Creatine:", 26)}${targets.creatineG === null ? "not taken" : `${String(targets.creatineG)} g`}`,
  );
  lines.push(`  ${pad("Expected rate:", 26)}${targets.expectedRateKgPerWeek.toFixed(2)} kg/week`);
  lines.push(`  ${pad("Basis:", 26)}${targets.basis.rmr}; ${targets.basis.proteinRule}; ${targets.basis.deficitRule}`);
  lines.push("");

  lines.push("SESSIONS PER WEEK (completed / target)");
  if (reviews.length === 0) {
    lines.push("  (no completed week yet)");
  } else {
    for (const r of reviews) {
      const delta = r.delta > 0 ? `+${String(r.delta)}` : String(r.delta);
      const suffix = r.paused ? "  paused" : "";
      lines.push(`  ${r.weekStart}   ${String(r.completed)} / ${String(r.target)}   (${delta})${suffix}`);
    }
  }
  lines.push("");

  lines.push("PERSONAL RECORDS");
  if (records.length === 0) {
    lines.push("  (no sets logged yet)");
  } else {
    for (const r of records) {
      const best = `${formatLoad(r.bestSet?.loadKg ?? null, units)} × ${String(r.bestSet?.reps ?? 0)}`;
      const est =
        r.bestE1RM === null
          ? "no estimated 1RM"
          : `${formatLoad(r.bestE1RM.e1RMKg, units)} estimated 1RM`;
      lines.push(`  ${pad(r.name, 30)}${pad(best, 18)}${pad(est, 26)}${r.bestSet?.date ?? ""}`);
    }
  }
  lines.push("");

  lines.push("TOTALS");
  lines.push(`  ${pad("Sets logged:", 26)}${String(sets.length)}`);
  lines.push(`  ${pad("Body-mass check-ins:", 26)}${String(mass.length)}`);
  lines.push(`  ${pad("Weeks reviewed:", 26)}${String(reviews.length)}`);
  lines.push("");
  lines.push(`All loads and masses in this document are in ${label.load}.`);
  lines.push("");
  return lines.join("\n");
}
```

- [ ] **Step 8: Run the summary test**

Run: `npx vitest run src/domain/export/summary.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 9: Commit the two export modules**

```bash
git add src/domain/export
git commit -m "feat: build the plain-text summary and the RFC 5545 calendar export"
```

- [ ] **Step 10: Write the failing Export view test**

Create `src/ui/views/ExportView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBlankState } from "../../test/migrationFactories";
import { useAppStore } from "../../store";
import { ExportView } from "./ExportView";

beforeEach(() => {
  window.localStorage.clear();
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  useAppStore.getState().replaceState(makeBlankState());
});

function paste(text: string): void {
  fireEvent.change(screen.getByLabelText(/paste a previous export/i), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
}

describe("ExportView", () => {
  it("offers the three downloads", () => {
    render(<ExportView />);
    expect(screen.getByRole("button", { name: /download json/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /download summary \.txt/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /download calendar \.ics/i })).toBeTruthy();
  });

  it("says the calendar alarms are a courtesy, not the reminder mechanism", () => {
    render(<ExportView />);
    expect(screen.getByText(/whether an imported alarm fires is not guaranteed/i)).toBeTruthy();
  });

  it("hands the browser a file for each download", () => {
    render(<ExportView />);
    fireEvent.click(screen.getByRole("button", { name: /download json/i }));
    fireEvent.click(screen.getByRole("button", { name: /download summary \.txt/i }));
    fireEvent.click(screen.getByRole("button", { name: /download calendar \.ics/i }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
  });

  it("shows the validation error and changes nothing for a hostile import", () => {
    render(<ExportView />);
    const before = useAppStore.getState().exportJson();
    paste('{"week":999}');
    expect(screen.getByRole("alert").textContent ?? "").not.toBe("");
    expect(useAppStore.getState().exportJson()).toBe(before);
  });

  it("shows a parse error and changes nothing for text that is not JSON", () => {
    render(<ExportView />);
    const before = useAppStore.getState().exportJson();
    paste("{not json");
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(useAppStore.getState().exportJson()).toBe(before);
  });

  it("re-imports its own export to an equal state", () => {
    render(<ExportView />);
    const exported = useAppStore.getState().exportJson();
    const seeded = makeBlankState();
    seeded.ui.accent = "#ffffff";
    useAppStore.getState().replaceState(seeded);
    expect(useAppStore.getState().exportJson()).not.toBe(exported);
    paste(exported);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(JSON.parse(useAppStore.getState().exportJson())).toEqual(JSON.parse(exported));
  });
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `npx vitest run src/ui/views/ExportView.test.tsx`
Expected: FAIL — the view has no such controls yet.

- [ ] **Step 12: Write `src/ui/views/ExportView.tsx`**

Replace the file's contents:

```tsx
import { useState } from "react";
import { buildIcs } from "../../domain/export/ics";
import type { IcsEvent } from "../../domain/export/ics";
import { buildSummary } from "../../domain/export/summary";
import { instantOf, todayLocal } from "../../domain/dates";
import { projectedCalendar } from "../../domain/schedule/calendar";
import { AppStateSchema } from "../../domain/schema";
import type { AppState } from "../../domain/types";
import { useAppStore } from "../../store";
import { downloadText } from "../../app/download";

const CALENDAR_DAYS = 28;
const ALARM_LEAD_MINUTES = 120;

/** The store's own serialisation, read back through the schema so this view holds a
 *  plain AppState with no actions attached. */
function readState(json: string): AppState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const result = AppStateSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function ExportView() {
  const exportJson = useAppStore((s) => s.exportJson);
  const importJson = useAppStore((s) => s.importJson);
  const profileId = useAppStore((s) => s.activeProfileId);
  const profile = useAppStore((s) => (s.activeProfileId === null ? null : (s.profiles[s.activeProfileId] ?? null)));
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const stamp = profile === null ? "export" : todayLocal(profile.timezone);

  const downloadState = (): void => {
    downloadText(`fti-state-${stamp}.json`, exportJson());
  };

  const downloadSummary = (): void => {
    const state = readState(exportJson());
    if (state === null || profileId === null) {
      setError("The current state could not be read back, so no summary was produced.");
      return;
    }
    downloadText(`fti-summary-${stamp}.txt`, buildSummary(state, profileId, Date.now()), "text/plain");
  };

  const downloadCalendar = (): void => {
    const state = readState(exportJson());
    if (state === null || profileId === null || profile === null) {
      setError("The current state could not be read back, so no calendar was produced.");
      return;
    }
    const from = todayLocal(profile.timezone);
    const events: IcsEvent[] = [];
    for (const day of projectedCalendar(state, profileId, from, CALENDAR_DAYS)) {
      if (day.slot === null || day.paused || day.projectedSession === null) continue;
      events.push({
        uid: `${day.date}-${day.projectedSession.id}@fixthisinjustice`,
        startMs: instantOf(day.date, day.slot.startTime, profile.timezone),
        durationS: day.slot.expectedDurationS, // s
        summary: day.projectedSession.label,
        description: `${day.projectedSession.name} at ${day.slot.startTime}`,
        alarmLeadMinutes: ALARM_LEAD_MINUTES,
      });
    }
    downloadText(
      `fti-sessions-${stamp}.ics`,
      buildIcs(events, profile.timezone, Date.now()),
      "text/calendar;charset=utf-8",
    );
  };

  const runImport = (): void => {
    setOk(null);
    const result = importJson(text);
    if (result.ok) {
      setError(null);
      setOk("Imported. The current state has been replaced.");
      setText("");
      return;
    }
    setError(result.error);
  };

  const readFile = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      setText(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      setError("The file could not be read.");
    };
    reader.readAsText(file);
  };

  return (
    <div className="export">
      <h2>Export and import</h2>

      <section>
        <h3>Download</h3>
        <div className="export-actions">
          <button type="button" onClick={downloadState}>
            Download JSON
          </button>
          <button type="button" onClick={downloadSummary}>
            Download summary .txt
          </button>
          <button type="button" onClick={downloadCalendar}>
            Download calendar .ics
          </button>
        </div>
        <p className="note">The JSON file is the complete backup.</p>
        <p className="note">
          The calendar holds the next {CALENDAR_DAYS} days, one alarm two hours before each
          session. Whether an imported alarm fires is not guaranteed, so it does not replace
          reminders.
        </p>
      </section>

      <section>
        <h3>Import</h3>
        <p className="note">
          Importing replaces everything on this device. An invalid file changes nothing.
        </p>
        <label htmlFor="import-text">Paste a previous export, or choose a file</label>
        <textarea
          id="import-text"
          rows={6}
          value={text}
          onChange={(e) => { setText(e.target.value); }}
        />
        <div className="export-actions">
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Choose an export file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file !== undefined) readFile(file);
            }}
          />
          <button type="button" disabled={text.trim() === ""} onClick={runImport}>
            Import
          </button>
        </div>
        {error !== null && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {ok !== null && <p className="ok">{ok}</p>}
      </section>
    </div>
  );
}
```

- [ ] **Step 13: Run the Export view test**

Run: `npx vitest run src/ui/views/ExportView.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 14: Run the whole suite, lint and build**

Run: `npm test && npx eslint src && npm run build`
Expected: all suites pass; eslint prints nothing; the build succeeds.

- [ ] **Step 15: Commit**

```bash
git add src/ui/views/ExportView.tsx src/ui/views/ExportView.test.tsx
git commit -m "feat: export state, summary and calendar; import through the schema gate"
```

---

### Task 6: `src/ui/views/SettingsView.tsx` — the two destructive controls

**Files:**
- Create: `src/ui/components/ConfirmDestructive.tsx`
- Create: `src/ui/components/ConfirmDestructive.test.tsx`
- Modify: `src/domain/motivation/assets.ts` (export the database name; add `clearAssetStorage`)
- Modify: `src/ui/views/SettingsView.tsx`
- Create: `src/ui/views/SettingsView.destructive.test.tsx`

**Interfaces:**
- Consumes: `downloadText` from `src/app/download.ts` (Task 3); `deleteLegacyV2`, `hasLegacyV2` from `src/store/persistence.ts` (Task 3); `wipeAll(): void`, `exportJson(): string` from the store (P1, §6.7); `deleteDB` from `idb`.
- Produces: `<ConfirmDestructive>` from `src/ui/components/ConfirmDestructive.tsx`; `clearAssetStorage(): Promise<void>` and `ASSET_DB_NAME` from `src/domain/motivation/assets.ts`.

Master plan §3: a destructive action takes a typed confirmation **and** an automatic JSON
export first. Security H2: there is no always-visible wipe control — both live inside a
disclosure in Settings, not in a footer on every screen.

- [ ] **Step 1: Write the failing confirmation test**

Create `src/ui/components/ConfirmDestructive.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDestructive } from "./ConfirmDestructive";

function open(onConfirm: () => void) {
  render(
    <ConfirmDestructive
      title="Wipe all data"
      description="Everything on this device is removed."
      confirmWord="DELETE"
      actionLabel="Wipe all data"
      onConfirm={onConfirm}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /wipe all data/i }));
}

describe("ConfirmDestructive", () => {
  it("does not show the action until the disclosure is opened", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDestructive
        title="Wipe all data"
        description="Everything on this device is removed."
        confirmWord="DELETE"
        actionLabel="Wipe all data"
        onConfirm={onConfirm}
      />,
    );
    expect(screen.queryByLabelText(/type DELETE to confirm/i)).toBeNull();
  });

  it("keeps the action disabled until the word matches exactly", () => {
    const onConfirm = vi.fn();
    open(onConfirm);
    const field = screen.getByLabelText(/type DELETE to confirm/i);
    const action = screen.getByRole("button", { name: /^wipe all data$/i, hidden: false });
    fireEvent.change(field, { target: { value: "delete" } });
    expect(screen.getByTestId("confirm-action").hasAttribute("disabled")).toBe(true);
    fireEvent.change(field, { target: { value: "DELETE" } });
    expect(screen.getByTestId("confirm-action").hasAttribute("disabled")).toBe(false);
    expect(action).toBeTruthy();
  });

  it("calls onConfirm exactly once", () => {
    const onConfirm = vi.fn();
    open(onConfirm);
    fireEvent.change(screen.getByLabelText(/type DELETE to confirm/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("confirm-action"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes and clears the field on cancel", () => {
    const onConfirm = vi.fn();
    open(onConfirm);
    fireEvent.change(screen.getByLabelText(/type DELETE to confirm/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByLabelText(/type DELETE to confirm/i)).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/components/ConfirmDestructive.test.tsx`
Expected: FAIL — `Failed to resolve import "./ConfirmDestructive"`.

- [ ] **Step 3: Write `src/ui/components/ConfirmDestructive.tsx`**

P9 correction, 2026-09-02. The shipped props are the ones below, not the draft's:

```ts
export interface ConfirmDestructiveProps {
  /** The panel's own name, rendered as the accessible name of its `role="group"`. */
  titleKey: CopyKey;
  /** The exact word the user must type, compared case-sensitively. */
  word: string;
  /** The export control's label. The caller owns the wording; this panel owns the gate. */
  exportLabelKey: CopyKey;
  /** The filename the backup is offered under. */
  exportFilename: string;
  /** The text to export, read when the user asks for it rather than at render. */
  exportText: () => string;
  /** The destructive control's label. */
  confirmLabelKey: CopyKey;
  onConfirm: () => void;
  onCancel: () => void;
}
```

`titleKey` is required rather than optional, and a `CopyKey` rather than a string, because two
panels can be on screen at once: the Settings wipe, and the Replace confirmation in the export
view mounted above it. Both label their field `Type DELETE to confirm` and both carry a
`Cancel`, so an unnamed group hands a screen reader two indistinguishable sets of controls that
destroy different things. The panel renders no trigger and no visible heading; the host owns the
disclosure and the sentence above it. The draft below keeps its own trigger and its four string
props, and predates the extraction.

```tsx
import { useId, useState } from "react";

export interface ConfirmDestructiveProps {
  title: string;
  description: string;
  /** the exact word the user must type, case-sensitive */
  confirmWord: string;
  actionLabel: string;
  onConfirm(): void;
}

/**
 * A destructive action, gated. The control is not visible until the disclosure is
 * opened (security H2: the old app put a one-tap wipe in the footer of every view), and
 * the action stays disabled until the confirmation word is typed exactly.
 */
export function ConfirmDestructive(props: ConfirmDestructiveProps) {
  const { title, description, confirmWord, actionLabel, onConfirm } = props;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const fieldId = useId();

  const close = (): void => {
    setOpen(false);
    setTyped("");
  };

  if (!open) {
    return (
      <button type="button" className="destructive-trigger" onClick={() => { setOpen(true); }}>
        {title}
      </button>
    );
  }

  return (
    <div className="destructive" role="group" aria-label={title}>
      <p>{description}</p>
      <label htmlFor={fieldId}>{`Type ${confirmWord} to confirm`}</label>
      <input
        id={fieldId}
        type="text"
        autoComplete="off"
        value={typed}
        onChange={(e) => { setTyped(e.target.value); }}
      />
      <div className="destructive-actions">
        <button type="button" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          data-testid="confirm-action"
          disabled={typed !== confirmWord}
          onClick={() => {
            onConfirm();
            close();
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the confirmation test**

Run: `npx vitest run src/ui/components/ConfirmDestructive.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Expose the asset database so the wipe can clear it**

`wipeAll` (P1) clears the `fti.v3` key. The user-picked motivation video lives in
IndexedDB (P6), so the wipe path must clear that too — security constraint 10 requires
the wipe to cover everything the app owns.

Run: `grep -n "openDB(" src/domain/motivation/assets.ts`
Expected: one line whose first argument is the database name string.

If that name is not already a named export, extract it and use the constant in the
`openDB` call:

```ts
export const ASSET_DB_NAME = "fti-assets"; // whatever literal the openDB call uses
```

Then append to `src/domain/motivation/assets.ts`:

```ts
import { deleteDB } from "idb";

/** Removes the whole asset database. Used only by the wipe path in Settings. */
export async function clearAssetStorage(): Promise<void> {
  await deleteDB(ASSET_DB_NAME);
}
```

- [ ] **Step 6: Write the failing Settings test**

Create `src/ui/views/SettingsView.destructive.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBlankState } from "../../test/migrationFactories";
import { useAppStore } from "../../store";
import { SettingsView } from "./SettingsView";

vi.mock("../../domain/motivation/assets", () => ({
  ASSET_DB_NAME: "fti-assets",
  clearAssetStorage: vi.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  window.localStorage.clear();
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  useAppStore.getState().replaceState(makeBlankState());
});

describe("SettingsView — destructive actions", () => {
  it("does not show a wipe control until the disclosure is opened", () => {
    render(<SettingsView />);
    expect(screen.queryByLabelText(/type DELETE to confirm/i)).toBeNull();
  });

  it("downloads the JSON before wiping, then clears the v3 key", async () => {
    window.localStorage.setItem("fti.v3", '{"schemaVersion":3}');
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: /^wipe all data$/i }));
    fireEvent.change(screen.getByLabelText(/type DELETE to confirm/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("confirm-action"));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(window.localStorage.getItem("fti.v3")).toBeNull();
    });
  });

  it("hides the legacy control when there is no legacy store", () => {
    render(<SettingsView />);
    expect(screen.queryByRole("button", { name: /delete legacy data/i })).toBeNull();
  });

  it("deletes all three legacy keys behind a typed confirmation", () => {
    window.localStorage.setItem("fti.console.v2", "{}");
    window.localStorage.setItem("fti.plan.v1", "{}");
    window.localStorage.setItem("fti.video.instance", "https://yewtu.be");
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: /delete legacy data/i }));
    fireEvent.change(screen.getByLabelText(/type DELETE to confirm/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("confirm-action"));
    expect(window.localStorage.getItem("fti.console.v2")).toBeNull();
    expect(window.localStorage.getItem("fti.plan.v1")).toBeNull();
    expect(window.localStorage.getItem("fti.video.instance")).toBeNull();
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/ui/views/SettingsView.destructive.test.tsx`
Expected: FAIL — the view has no such controls yet.

- [ ] **Step 8: Add the destructive block to `src/ui/views/SettingsView.tsx`**

Add these imports at the top of the file:

```tsx
import { useState } from "react";
import { todayLocal } from "../../domain/dates";
import { clearAssetStorage } from "../../domain/motivation/assets";
import { deleteLegacyV2, hasLegacyV2 } from "../../store/persistence";
import { useAppStore } from "../../store";
import { useActiveProfile } from "../../store/selectors";
import { ConfirmDestructive } from "../components/ConfirmDestructive";
import { downloadText } from "../../app/download";
```

P9 correction, 2026-09-02. The block shipped in `src/ui/settings/DataSection.tsx` rather than
in `SettingsView.tsx`, and each `<ConfirmDestructive>` below carries the shipped props named in
Step 3 instead of the draft's `title`, `description`, `confirmWord` and `actionLabel`.

Add this section to the component's returned JSX, at the end, after every other section:

```tsx
      <section className="danger">
        <h3>Data on this device</h3>
        <p className="note">
          Everything stays on this device. A wipe cannot be undone.
        </p>
        <ConfirmDestructive
          title="Wipe all data"
          description="Everything on this device is removed. A JSON backup downloads first."
          confirmWord="DELETE"
          actionLabel="Wipe all data"
          onConfirm={wipeEverything}
        />
        {legacyPresent && (
          <>
            <p className="note">
              The old app's data is still here. Removing it stops the import offer.
            </p>
            <ConfirmDestructive
              title="Delete legacy data"
              description="The old app's three storage keys are removed from this device. Anything not imported is lost."
              confirmWord="DELETE"
              actionLabel="Delete legacy data"
              onConfirm={removeLegacy}
            />
          </>
        )}
      </section>
```

Add this state and these two handlers inside the component, above the `return`:

```tsx
  const exportJson = useAppStore((s) => s.exportJson);
  const wipeAll = useAppStore((s) => s.wipeAll);
  const profile = useActiveProfile();
  const [legacyPresent, setLegacyPresent] = useState(() => hasLegacyV2());

  // Every backup is stamped with the PROFILE's own civil date, never the device's, so the
  // filename names the day the user was living in (src/ui/settings/DataSection.tsx:82).
  const stamp = profile === null ? "export" : todayLocal(profile.timezone, Date.now());

  const wipeEverything = (): void => {
    // master plan §3: automatic export first, then the wipe
    downloadText(`fti-state-${stamp}.json`, exportJson());
    // the asset store is a second origin-scoped database; clearing it is part of the
    // same action (security constraint 10) but is asynchronous, so it is sequenced here
    // rather than inside the synchronous wipeAll action
    void clearAssetStorage()
      .catch((err: unknown) => {
        console.warn("the asset store could not be cleared", err);
      })
      .finally(() => {
        wipeAll();
        setLegacyPresent(hasLegacyV2());
      });
  };

  const removeLegacy = (): void => {
    deleteLegacyV2();
    setLegacyPresent(false);
  };
```

- [ ] **Step 9: Run the Settings test**

Run: `npx vitest run src/ui/views/SettingsView.destructive.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 10: Run the whole suite, lint and build**

Run: `npm test && npx eslint src && npm run build`
Expected: all suites pass; eslint prints nothing; the build succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/ui/components/ConfirmDestructive.tsx src/ui/components/ConfirmDestructive.test.tsx src/ui/views/SettingsView.tsx src/ui/views/SettingsView.destructive.test.tsx src/domain/motivation/assets.ts
git commit -m "feat: gate the wipe and the legacy delete behind a typed confirmation and an export"
```

---

### Task 7: documentation, legacy removal, the CI gate, and the cutover

**Files:**
- Create: `README.md`
- Delete: `DEPLOY.md`, `PROJECT_SUMMARY.md`, `legacy/` (whole directory)
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/plans/2026-09-01-00-master-plan.md` (§3 pattern; see the amendment note)

**Interfaces:**
- Consumes: nothing from earlier tasks at build time. The README describes what P1–P7 shipped.
- Produces: the personal-data CI gate; the cutover checklist below is executed once, by hand.

Security review L5 is the reason `DEPLOY.md` goes rather than gets corrected: it lists a
file set that stops existing the moment the deployed artefact is `dist/`, produced by the
build. `PROJECT_SUMMARY.md` goes because it describes one subject's 24-week protocol,
which is exactly the personal-data class the gate now forbids.

- [ ] **Step 1: Confirm the reminder runbook's path**

Run: `ls worker/RUNBOOK.md`
Expected: `worker/RUNBOOK.md`. If P5 named it differently, move it so the README link is
correct: `git mv <p5-path> worker/RUNBOOK.md`.

- [ ] **Step 2: Write `README.md`**

````markdown
# FixThisInjustice

A phone-first training companion. It holds one person's training plan, generated from
their own body data, goal, equipment and weekly availability; logs every set in the unit
they chose; times rest; reminds them before each session; and keeps every number on
their own device.

It is a static web app: no accounts, no analytics, no server-side user data. The one
piece of infrastructure is a Cloudflare Worker that does nothing except send the push
reminders the app asked it to send.

## Install it on a phone

Open the site in the phone's browser and add it to the home screen. Installing is not
optional: on iPhone, Web Push only works for a web app that has been added to the home
screen.

**Android (Chrome):** open the URL, menu (⋮) → *Install app*.

**iPhone (Safari):** open the URL, Share → *Add to Home Screen*.

**iOS floor: 18.4 or later.** Two things below that version break: Web Push needs an
installed home-screen app (since 16.4), and the Screen Wake Lock that keeps the display
on during a rest timer was only fixed for installed web apps in 18.4. On an older iOS the
app still runs, but reminders and the wake lock will not.

## Where your data is, and who can read it

Everything the app records (profile, plan, logged sets, body mass, hydration, notes,
the sealed time capsule) is stored in your browser's storage on the device you are
using. It never leaves the device, it is not synced, and nobody else can see it. Take a
backup from **Export → Download JSON** and keep the file somewhere you control.

Two things do leave the device, and only these:

1. **Your push subscription**: an opaque endpoint URL issued by your browser vendor,
   plus two public keys. It identifies a browser install, not a person.
2. **Reminder instants**: the times of your next three weeks of sessions, with the
   session label ("Push", "Legs") in the notification text.

The Worker stores nothing else. No name, no body mass, no logged sets, no notes.

**Known hosting limitation.** This is a GitHub Pages *project* site, so it shares its
origin with every other project published under the same account. The same-origin policy
is defined on the origin, not on the path, which means any page served from that account
can read this app's storage and shares its storage quota. That is a hosting decision, not
a code defect: moving to a custom domain or a dedicated `<name>.github.io` user site
closes it. Until then, do not publish untrusted code to the same account.

The data is not encrypted at rest. Anyone holding the unlocked phone can read it.

## Run it locally

Node 22.12 or later.

```bash
npm ci
npm run dev      # http://localhost:5173/FixThisInjustice/
npm test         # Vitest, must pass before every commit
npm run lint     # ESLint; the lint rules are build gates, not suggestions
npm run build    # produces dist/
npm run preview  # serves dist/ so the service worker can be exercised
```

The service worker only registers on a built site, so test install and offline behaviour
against `npm run preview`, never against `npm run dev`.

## Deploy it

The deployed artefact is `dist/`, produced by the build. There is no hand-maintained file
list.

1. In the repository, **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main`. `.github/workflows/ci.yml` runs lint, tests, the build and the two
   content gates; `.github/workflows/deploy.yml` then publishes `dist/`.
3. The site appears at the URL Pages reports.

The reminder Worker is deployed separately and rarely. Its runbook covers Wrangler setup,
the KV namespace, the VAPID key pair, the cron trigger and the end-to-end smoke test on a
real phone: [`worker/RUNBOOK.md`](worker/RUNBOOK.md).

## The motivation video

The clip shown after a missed week is `public/media/motivation.mp4`. It is user-provided
and is deliberately excluded from the precache: it is fetched at runtime and cached on
first play, so a large file never blocks the install of the app itself. A user can replace
it with their own file from Settings, which is stored in IndexedDB on their device only.

## Coming from the old console

If the previous version of this app was installed on the same device, its data is still
there. The first launch offers a one-way import and asks the two questions the old app
never recorded: which unit loads were typed in, and which unit body mass was typed in.
The old data is not deleted by the import. Remove it yourself in **Settings → Delete
legacy data** once you are satisfied the import is right.

## Layout

| Path | What lives there |
| --- | --- |
| `src/domain/` | Pure logic: units, dates, schema, nutrition, plan generation, scheduling, training, reminders, migrations, export. No React. |
| `src/store/` | The Zustand store and the single localStorage key `fti.v3`. `persistence.ts` is the only module allowed to touch web storage. |
| `src/ui/` | Views and components. |
| `worker/` | The Cloudflare Worker that sends reminders, and its runbook. |
| `docs/plans/` | The master plan and the numbered implementation plans. |
| `docs/review/` | The security, code and content peer reviews the rewrite was built from. |
| `REFERENCES.md` | Every external source used, with the method and the session that fetched it. |
````

- [ ] **Step 3: Delete the two superseded documents and the legacy tree**

```bash
git rm DEPLOY.md PROJECT_SUMMARY.md
git rm -r legacy/
```

Expected: git lists the removed paths. `legacy/` held the pre-rewrite tree that P1 moved
aside; every part of it worth keeping is now ported, and the port table in
`docs/review/2026-09-01-code-review.md` §B records what was dropped and why.

- [ ] **Step 4: Confirm nothing still references the deleted files**

Run: `git grep -nE 'DEPLOY\.md|PROJECT_SUMMARY\.md|legacy/' -- ':!docs/review/*' ':!docs/plans/*'`
Expected: no output. If a source file references `legacy/`, it is a stale import and the
build would already have failed; fix it before continuing.

- [ ] **Step 5: Add the personal-data gate to CI**

Append this step to the job in `.github/workflows/ci.yml` that already runs the CSP grep:

```yaml
      - name: Personal-data gate
        run: |
          # Master plan §3. The final character of each alternative is written as a
          # one-character class so that this pattern does not match the file that
          # defines it, nor the master plan that specifies it. The strings matched are
          # unchanged.
          if git grep -nEi 'vyvans[e]|lisdexamfetamin[e]|ymc[a]|amphetamin[e]' \
               -- ':!docs/review/*' ':!REFERENCES.md'; then
            echo "personal-data gate: a forbidden identifier is present in tracked source"
            exit 1
          fi
          echo "personal-data gate: clean"
```

`git grep` exits 1 when it matches nothing, so the `if` guard is what makes the step pass
on a clean tree under `set -e`.

- [ ] **Step 6: Apply the same form to the master plan's own §3**

The pattern as written in master plan §3 uses bare literals, so it matches the master plan
itself and can never return nothing. Rewrite it in place:

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path("docs/plans/2026-09-01-00-master-plan.md")
s = p.read_text()
old = "'" + "|".join(["vyv" + "anse", "lisdexamfeta" + "mine", "ym" + "ca", "amphet" + "amine"]) + "'"
new = "'" + "|".join(["vyvans[e]", "lisdexamfetamin[e]", "ymc[a]", "amphetamin[e]"]) + "'"
assert old in s, "master plan §3 does not carry the pattern in the expected form"
p.write_text(s.replace(old, new))
print("master plan §3 pattern rewritten")
PY
```

Expected: `master plan §3 pattern rewritten`.

- [ ] **Step 7: Run the gate locally**

Run:

```bash
git add -A
git grep -nEi 'vyvans[e]|lisdexamfetamin[e]|ymc[a]|amphetamin[e]' -- ':!docs/review/*' ':!REFERENCES.md'; echo "exit=$?"
```

Expected output, exactly:

```
exit=1
```

No matching lines, and `git grep`'s exit status 1 meaning "nothing matched". If any line
is printed, it names the file. For a plan document under `docs/plans/`, apply the same
one-character-class form there. For a source file, remove the string: the identifier does
not belong in tracked source at all.

- [ ] **Step 8: Run the full pipeline as CI will**

Run: `npm run lint && npm test && npm run build`
Expected: lint prints nothing; every suite passes; `dist/` is written.

Run: `grep -c '<script' dist/index.html && grep -c 'unpkg\|text/babel' dist/index.html; echo "exit=$?"`
Expected: a small count for `<script` (all with `src`), then `0` and `exit=1` for the
second grep — no CDN references and no in-browser Babel survive the build.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "docs: replace DEPLOY.md and PROJECT_SUMMARY.md with README.md; delete legacy/; gate personal data in CI"
```

- [ ] **Step 10: Cutover — nothing to bump**

Confirm there is no hand-maintained cache version left to increment. The legacy `sw.js`
required bumping a `CACHE_NAME` constant on every deploy; Workbox content-hashes the
precache manifest, so a changed file changes its own revision.

Run: `git grep -n "CACHE_NAME\|fti-v[0-9]" -- src public`
Expected: no output.

- [ ] **Step 11: Cutover — confirm the Pages source**

In the repository on github.com: **Settings → Pages → Build and deployment**.
Expected: **Source: GitHub Actions**. If it still says *Deploy from a branch*, change it —
the deploy workflow uploads an artefact that a branch-based Pages build ignores, so the
old hand-uploaded site would keep serving.

- [ ] **Step 12: Cutover — push**

```bash
git push origin main
```

Then watch the two workflows finish on the Actions tab. Expected: `ci` green (including
the personal-data gate step printing `personal-data gate: clean`) and `deploy` green with
a deployment URL.

- [ ] **Step 13: Cutover — open it on the phone that has the old app installed**

Open the deployed URL in the phone's browser (not the installed old app). Expected: the
new app loads.

- [ ] **Step 14: Cutover — confirm the old service worker has been replaced**

The old install had a hand-written cache-first worker. In the phone's browser devtools
console — or on a desktop browser at the same URL, which shares nothing with the phone but
verifies the deployed worker — run:

```js
navigator.serviceWorker.getRegistrations().then((rs) =>
  console.log(rs.map((r) => ({ scope: r.scope, script: r.active && r.active.scriptURL }))),
);
caches.keys().then(console.log);
```

Expected: exactly one registration, its `scope` ending in `/FixThisInjustice/`, and
`caches.keys()` listing a Workbox precache (a name containing `workbox-precache`) and no
`weight-console-v5`. If the old cache name is still listed, the old worker is still in
control: close every tab for the origin, reopen, and check again; if it persists, unregister
it once from that console with
`navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()))`
and reload.

- [ ] **Step 15: Cutover — run the migration wizard on the phone**

Open the installed app. Expected: the import offer appears, because
`localStorage["fti.console.v2"]` is present on that device.

1. Complete the setup wizard if it asks (profile, goal, units, equipment, availability).
2. Reopen the app. The import offer appears again.
3. Answer both unit questions. **This is the one irreversible judgement in the whole
   cutover**: the old app stored bare numbers with no unit, so answering "kg" when the
   loads were typed in lb rescales the entire history by 2.2. The old body-mass field was
   literally named `lb` and its input was gated to 100–300, which only pounds pass — but
   the set-log weight box was labelled "kg" in its placeholder and never validated, so the
   loads question must be answered from memory, not from the field names.
4. Tap **Download legacy JSON** and save the file somewhere off the phone.
5. Read the report. Expected: the set count matches the number of sets actually logged in
   the old app. Cross-check it against the old app's Export view, which printed
   `Sets logged: N` — that N and `report.setsMigrated` minus the number of weekly push-up
   maxima must be equal.
6. Tap **Keep this import**.
7. Open the Log view. Expected: the personal records list shows the old lifts with loads in
   the chosen unit, and the body-mass chart shows the old check-ins against the new
   projection.

If the count does not match, do **not** keep the import. Tap **Start clean**, keep the
downloaded legacy JSON, and open the skipped-records list — every refused record is in it
with a reason.

- [ ] **Step 16: Cutover — remove the legacy data**

Only once the import has been checked and the legacy JSON is saved off the device:
**Settings → Delete legacy data**, type `DELETE`. Expected: the control disappears and the
import offer never returns.

---

## Master plan amendments requested

Each of these changes a contract in `docs/plans/2026-09-01-00-master-plan.md`. They are
listed for the master plan to absorb; P7 implements them as written above.

1. **§5 `AppState.notes: Record<string, Record<LocalDate, string>>`** (new slice, keyed by
   profileId). The legacy store held a free-text note per day and §5 had nowhere to put it.
   Sanctioned by this plan's brief; implemented in Task 2, schema mirror included.

2. **§5 `AppState.customExercises: Record<string, Exercise[]>`** (new slice, keyed by
   profileId). Code review A26 requires user-added exercises to carry stable ids instead of
   the legacy `1000 + index` scheme, and §5 defined `Exercise` but no place to store a
   user's own. Implemented in Task 2.

3. **§5 `UiPrefs.legacyMigration: "pending" | "done" | "dismissed"`.** Without a persisted
   decision the import offer either reappears on every launch or requires destroying the
   legacy key to silence it. Implemented in Task 2, defaulted in the Zod schema so states
   written by P1–P6 still parse.

4. **§3 personal-data gate pattern.** The pattern as written matches the workflow file that
   carries it and the master plan section that specifies it, so the stated pass criterion
   ("must return nothing") is unreachable. Each alternative's final character becomes a
   one-character class. The set of matched strings is unchanged. Rewritten in Task 7 Step 6.

5. **§4 file structure additions.** `src/domain/export/summary.ts`, `src/domain/export/ics.ts`,
   `src/domain/training/records.ts`, `src/app/download.ts`, `src/ui/migration/MigrationWizard.tsx`,
   `src/ui/migration/MigrationGate.tsx`, `src/ui/components/{BodyMassChart,ComplianceGrid,PRList,AmrapSpark,ConfirmDestructive}.tsx`,
   `src/test/migrationFactories.ts`. None of these change an existing contract; they are
   modules §4 did not enumerate.

6. **§4 `src/store/persistence.ts` surface.** Gains `readLegacyV2Raw()`, `readLegacyBundle()`,
   `hasLegacyV2()`, `hasAnyLegacyKey()` and `deleteLegacyV2()`. §4 describes the module as "the
   only localStorage user", which is precisely why the legacy keys are read and removed here
   rather than in a view. `readLegacyBundle()` returns a JSON envelope of all three legacy keys,
   so a backup taken before the wipe carries everything the old app wrote.

7. **§6.7 `setUi` moves from P8 to P7.** The signature is unchanged; only the plan that
   first implements it changes. P8 will find it present.

8. **`migrateV2`'s report field `setsSkipped` carries every refused record, not only sets.**
   The field name comes from this plan's brief and is kept so the contract is stable; its
   documented meaning is widened, and each entry's `key` is prefixed with its origin
   (`sets.`, `weightLog[`, `water.`, `notes.`, `pushupLog.`, `completed.`, `customEx.`,
   `mealSwaps.`, `timeCapsule`). Nothing is dropped silently, which was the requirement.

9. **`applyMigration` is added beside `migrateV2`.** `migrateV2` returns a self-contained
   `AppState` per its specified signature, but the wizard runs *after* setup, so a plain
   `replaceState` of that result would discard the plan, cursor and availability the user
   had just configured. `applyMigration(base, migrated, profileId)` merges only the
   migrated slices. It is an addition, not a change to the specified signature.

10. **The migration also carries `timeCapsule` and `pushupLog`, which the brief did not
    list.** Both have homes in §5 (`capsules`, and `sets` as AMRAP records) and both are
    irreplaceable user content, so reporting them as skipped would have been a data loss
    dressed up as diligence. The push-up rule is documented in the code and shown in the
    wizard: one AMRAP set on legacy day 4 of each week, appended after any set already
    logged there.

11. **`wipeAll` remains synchronous; the asset store is cleared by the caller.** §6.7 types
    `wipeAll(): void`, and clearing an IndexedDB database is asynchronous. The Settings
    handler sequences `clearAssetStorage()` and then `wipeAll()`, so the wipe *path* still
    clears everything the app owns (security constraint 10) without changing the action's
    signature.

## What this plan does not do

- **It does not synthesise `SessionAssignment` records for legacy history.** Migrated sets
  carry their real `assignmentDate`, but no assignment rows are created for dates before
  the new plan started, because P3's cursor and `closeWeeks` invariants are defined over
  the current plan's calendar and back-filling them would break the tested guarantee that a
  paused week never yields a negative delta. The consequence is visible and intended: the
  compliance grid starts at the new plan's first week, while the records list and the
  body-mass chart show the full history.
- **It does not verify that the P2 exercise-library ids match the ones in `v2plan.ts`.**
  The test in Task 1 Step 2 asserts it, but the assertion can only run once P2 exists; if
  the ids differ the table is corrected there, and no other file changes.
- **It does not test the migration against the user's real store.** The fixture is
  constructed, not captured — the real store holds personal data and cannot enter the
  tracked tree (master plan §3). The real store is exercised once, by hand, in Task 7
  Step 15, which is where the master plan's P7 migration gate is actually satisfied.
- **It does not check that an imported `.ics` alarm fires on either phone.** Master plan
  §1.5 already recorded that as unverified, and the Export view says so; nothing here
  changes that status.
- **It does not touch the Worker.** Reminder behaviour is P5's and is unmodified.
- **It does not confirm the deployed site's CSP against a live response.** CI greps
  `dist/index.html`; whether GitHub Pages serves that document unmodified is checked by the
  cutover steps only insofar as the app works at all.

## Self-review

**Spec coverage.** Every numbered deliverable in the brief maps to a task: the frozen table
(1), `migrateV2` (2), the wizard (3), the Log view (4), the Export view (5), the Settings
destructive block (6), docs and cutover (7). Master plan §7's P7 row is covered by Task 2's
count assertions and Task 7 Steps 7 and 15. Security C1 is covered by Task 5's two
"changes nothing" tests, H2 by Task 6, H3 by the persistence warnings in Task 3 Step 3,
M5 by the single-key wipe and the legacy-key removal, M6 by the finite/range checks in
Task 2 and the fixture's `1e999`, L5 by Task 7 Step 3. Code review A.1 is covered by the
unit prompt and `enteredUnit` on every migrated record, A.7 by importing only through
`importJson` → `replaceState`, and the five §B port rows by Tasks 4 and 5.

**Placeholders.** None. Every code step carries complete code; every command states its
expected output; the two places where an earlier plan's naming cannot be known from here
(the exercise-library export name, the asset database name) are resolved by a `grep` step
with a stated expectation rather than by a hedge.

**Type consistency.** `migrateV2`/`applyMigration`/`MigrationReport` are used with the same
signatures in Tasks 2, 3 and 6. `computeRecords`/`weeklyAmrapMax` are defined in Task 4 and
consumed unchanged in Task 5. `downloadText(filename, text, mime?)` is defined in Task 3 and
called with that argument order in Tasks 3, 5 and 6. `ConfirmDestructive`'s `word` is required,
not optional, so `exactOptionalPropertyTypes` cannot bite. `buildStatusIndex` and
`ComplianceGrid` are exported from the same module and both are imported by the test.
`LEGACY_SESSION_ID` is defined once, in `v2plan.ts`, and compared against in `v2.test.ts`.

---

## P9 corrections (2026-09-02)

Every fragment below stated a contract another agent would have implemented from this plan, so
each was replaced with the declaration that shipped rather than annotated.

1. `MigrateV2Result` and `ApplyMigrationResult` are discriminated unions
   (`src/domain/migrations/v2.ts:111` and `:115`). `migrateV2` must never throw, so an unknown
   IANA zone and a payload that is not a JSON object both arrive as `{ ok: false, reason }`.
   `applyMigration` returns `ApplyMigrationResult`, not `AppState`.
2. `MigrateV2Options` names `units: LegacyUnit` and `bodyMassUnits?: LegacyUnit`, not
   `loadsEnteredIn` and `bodyMassEnteredIn`. `LegacyUnit` is `'kg' | 'lb'`, exported from the
   same module and re-exported from `src/domain/migrations/index.ts`.
3. The legacy persistence exports are `readLegacyV2Raw`, `readLegacyBundle`, `hasLegacyV2`,
   `hasAnyLegacyKey` and `deleteLegacyV2`. The two names this plan used before, one for the read
   and one for the delete, were renamed throughout, including in the draft code, so no reader
   implements a name the tree does not export.
4. The download helper is `downloadText(filename, text, mime?)` in `src/app/download.ts`. The
   plan put it under `src/ui/` and named the arguments in the order filename, mime, text.
   `mime` defaults to
   `application/json`; the summary and the calendar pass their own type. The four draft call
   sites were reordered with it.
5. `ConfirmDestructive` takes `titleKey`, `word`, `exportLabelKey`, `exportFilename`,
   `exportText`, `confirmLabelKey`, `onConfirm` and `onCancel`. `titleKey` is required because
   two panels can be on screen at once. The shipped panel renders no trigger; the host owns the
   disclosure, and the host is `src/ui/settings/DataSection.tsx`, not `SettingsView.tsx`.
6. `buildIcs(events, timeZone, nowMs)` takes the profile's IANA zone second and emits a
   `VTIMEZONE` block from it. `IcsEvent` carries `date` and `startTime` rather than `startMs`.
7. Every backup filename is stamped with the profile's own civil date, so
   `fti-state-before-wipe.json` became `fti-state-${stamp}.json`. `App.tsx` and
   `RootErrorBoundary.tsx` still write `fixthisinjustice-export.json` and
   `fixthisinjustice-recovery.json`; those are the crash-path names and stay distinct on purpose,
   because the boundary sits above the store and cannot read a profile.

Two drafts were left standing and labelled instead of rewritten: the `.ics` draft in Task 5 and
the `ConfirmDestructive` draft in Task 6 Step 3. Both diverged from the shipped file in body as
well as in signature, and reproducing 200 shipped lines inside a plan would put a second copy of
the contract where the first can drift from it. Each now carries a correction paragraph naming
the shipped declaration and the file that holds it.
