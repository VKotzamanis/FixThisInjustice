# P4 — Training Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build the Train view — unit-aware set logging, a cited progression engine, a coach line, an absolute-timestamp rest timer with wake lock and audio, a hydration cue that prescribes no fixed volume, corrected form cues, and the Invidious video modal.

**Architecture:** four pure domain modules (`progression`, `coach`, `restTimer`, `hydration`) with no React and no I/O; pure state transformers in `src/store/training.ts` wired into the existing Zustand store; a non-persisted `session` slice mirrored to `sessionStorage` so a mid-session reload keeps the rest timer; React context providers for the two modals (no `window.__videoModal`); and one view, `TrainView`, assembled from small focused components.

**Tech Stack:** React 19, TypeScript 5.9 (strict), Zustand 5, Zod 4, date-fns 4 + `@date-fns/tz`, Vitest 4 + Testing Library + jsdom.

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

## P4 verification gates (master plan §7)

| Gate | Pass criterion | Task |
| --- | --- | --- |
| timer | backgrounding for 10 min (simulated `now` jump) yields `remainingS === 0`, not a frozen count; rest timer survives a reload | 3, 6, 10 |
| units in UI | an imperial user entering 135 stores `61.23496995 kg` and sees "135 lb"; a metric user viewing the same set sees "61.2 kg"; a suggested next load for a 60 kg barbell lift (upper-compound, 2.5 kg step) is 62.5 kg, and for a 20 kg curl the advice is `extend-reps`, never a 12.5 % jump | 1, 10 |

## Sources permitted for defaults and thresholds

Only `docs/review/2026-09-01-content-peer-review.md` may supply a number in this plan, and every number carries its DOI in a code comment:

- ACSM (2009), *Progression Models in Resistance Training for Healthy Adults*, Med Sci Sports Exerc 41(3):687-708, DOI `10.1249/mss.0b013e3181915670` — the 2–10 % load-increment band (review §10).
- ACSM; Sawka MN et al. (2007), *Exercise and Fluid Replacement*, Med Sci Sports Exerc 39(2):377-390, DOI `10.1249/mss.0b013e31802ca597` — no fixed in-session volume; prevent > 2 % body-mass loss (review §3, §8).
- Institute of Medicine (2005), *DRI for Water, Potassium, Sodium, Chloride, and Sulfate*, DOI `10.17226/10925` — beverage share 3.0 L men / 2.2 L women (review §3, §8).
- Schoenfeld BJ et al. (2016), J Strength Cond Res 30(7):1805-1812, DOI `10.1519/JSC.0000000000001272`; Grgic J et al. (2018), Sports Med 48(1):137-151, DOI `10.1007/s40279-017-0788-x`; de Salles BF et al. (2009), Sports Med 39(9):765-777, DOI `10.2165/11315230-000000000-00000` — rest-interval defaults (review §9).
- Epley B (1985), *Poundage chart*, in *Boyd Epley Workout*, Body Enterprises p.86 — no DOI, self-published; labelled as such (review §5 c003).
- Plate table (review §10): metric barbell 2.5 kg total, imperial barbell 5 lb total, metric dumbbells 5 kg/pair, imperial dumbbells 10 lb/pair, smallest fractional pair 0.25 kg total.

Anything the review marked PARAPHRASE or COULD NOT VERIFY may not appear as a number. In particular **the ~1.5 L per kg lost replacement figure must not ship**, and the legacy "500 mL between sets" instruction is deleted outright.

---

## File structure delivered by P4

```
src/test/fixtures.ts                       shared object builders for tests (Task 1, extended in Task 6)
src/domain/training/progression.ts         suggestedProgression(), e1RM(), set ordering, block lookup
src/domain/training/progression.test.ts
src/domain/training/coach.ts               coachLine()
src/domain/training/coach.test.ts
src/domain/training/restTimer.ts           startRest/remainingS/extend/defaultRestS
src/domain/training/restTimer.test.ts
src/domain/training/hydration.ts           dailyBeverageTargetML(), hydrationCue(), body-mass loss check
src/domain/training/hydration.test.ts
src/store/training.ts                      pure AppState transformers for P4 actions
src/store/training.test.ts
src/store/sessionMirror.ts                 sessionStorage read/write for the non-persisted session slice
src/store/sessionMirror.test.ts
src/content/formCues.ts                    corrected FORM_CUES keyed by exercise id + warm-up notice
src/content/formCues.test.ts
src/ui/components/UnitInput.tsx            unit-aware numeric entry (load and mass)
src/ui/components/UnitInput.test.tsx
src/ui/components/VideoModal.tsx           Invidious modal + context provider + useVideoModal()
src/ui/components/VideoModal.test.tsx
src/ui/components/FormCuesModal.tsx        form-cue modal + context provider + useFormCues()
src/ui/audio/chime.ts                      one long-lived AudioContext, unlocked on a user gesture
src/ui/hooks/useWakeLock.ts                Screen Wake Lock, feature-detected
src/ui/views/train/RestTimerPanel.tsx      SVG ring, tick, +30 s / skip, chime, vibrate, notification
src/ui/views/train/HydrationBanner.tsx
src/ui/views/train/BodyMassQuickLog.tsx
src/ui/views/train/SetRow.tsx
src/ui/views/train/ExerciseCard.tsx
src/ui/views/train/AddCustomExercise.tsx
src/ui/views/train/SessionToast.tsx
src/ui/views/TrainView.tsx
src/ui/views/TrainView.test.tsx
src/ui/styles/train.css
```

Modified: `src/domain/types.ts`, `src/domain/schema.ts`, `src/store/index.ts`, `src/store/selectors.ts`, `src/app/App.tsx`, `src/ui/views/TodayView.tsx`.

## What P4 assumes from P1–P3 (do not re-create)

```ts
// src/domain/types.ts — every type in master plan §5, verbatim
// src/domain/ids.ts
export function newId(): string;
// src/domain/units.ts — master plan §6.1, all of it
export function displayLoad(loadKg: Kg, units: UnitSystem): number;
export function toStoredLoad(entered: number, units: UnitSystem): Kg;
export function displayMass(massKg: Kg, units: UnitSystem): number;
export function toStoredMass(entered: number, units: UnitSystem): Kg;
export function achievableLoad(targetKg: Kg, stepKg: number): Kg;
export function stepFor(ex: Exercise, steps: Profile["equipmentSteps"]): number;
export function formatLoad(loadKg: Kg | null, units: UnitSystem): string;
export function formatMass(massKg: Kg, units: UnitSystem): string;
export function formatVolume(ml: ML, units: UnitSystem): string;
export const UNIT_LABEL: Record<UnitSystem, { load: "kg" | "lb"; mass: "kg" | "lb"; volume: "mL" | "fl oz" }>;
// src/domain/dates.ts — master plan §6.2, all of it (localDateOf, localTimeOf, todayLocal,
// instantOf, addDays, daysBetween, isoWeekday, weekStart, weekEnd, compareLocalDate, ...)
// src/domain/schema.ts — Zod mirrors named <TypeName>Schema, plus CURRENT_SCHEMA_VERSION and parseState()
export const LoggedSetSchema: z.ZodType<LoggedSet>;
export const BodyMassEntrySchema: z.ZodType<BodyMassEntry>;
export const HydrationEntrySchema: z.ZodType<HydrationEntry>;
export const ExerciseSchema: z.ZodType<Exercise>;
export const AppStateSchema: z.ZodType<AppState>;
// src/domain/plan/library.ts (P2)
export const EXERCISES: Exercise[];
// src/config/videoInstances.ts (P1) — only the `host` field is consumed by P4
export const VIDEO_INSTANCES: ReadonlyArray<{ host: string }>;
// src/store/index.ts (P1 skeleton, extended by P2/P3)
export interface AppStore extends AppActions { state: AppState; session: SessionState; }
export const useAppStore: <T>(selector: (s: AppStore) => T) => T;   // Zustand 5 bound store
// P3 actions this plan calls: startSession, completeSession, setUi
// src/ui/views/TodayView.tsx (P3) — has a "Start session" control that calls startSession
//   and setUi({ lastView: "train" }); P4 adds one line to it (Task 9).
```

If any of these differ, fix the import, not the contract, and add the difference to the amendments section at the end of this file.

---

### Task 1: Progression engine

**Files:**
- Create: `src/test/fixtures.ts`
- Create: `src/domain/training/progression.ts`
- Test: `src/domain/training/progression.test.ts`

**Interfaces:**
- Consumes: `Exercise`, `Kg`, `LoggedSet`, `PlanBlock`, `PlanTemplate`, `PlannedExercise`, `Prescription`, `Profile`, `UnitSystem` from `src/domain/types.ts`; `achievableLoad`, `stepFor`, `formatLoad`, `displayLoad`, `toStoredLoad`, `UNIT_LABEL` from `src/domain/units.ts`; `compareLocalDate` from `src/domain/dates.ts`.
- Produces:
  ```ts
  // src/test/fixtures.ts
  export function makeProfile(patch?: Partial<Profile>): Profile;
  export function makeExercise(patch?: Partial<Exercise>): Exercise;
  export function makePlannedExercise(patch?: Partial<PlannedExercise>): PlannedExercise;
  export function makeBlock(patch?: Partial<PlanBlock>): PlanBlock;
  export function makeSet(patch?: Partial<LoggedSet>): LoggedSet;
  export function resetFixtureIds(): void;
  // src/domain/training/progression.ts
  export interface ProgressionAdvice {
    kind: "hold" | "add-load" | "extend-reps" | "deload";
    loadKg: Kg | null;
    reason: string;
    prescription: Prescription;
    nextPrescription: Prescription;
  }
  export interface CompletedSet extends LoggedSet { loadKg: Kg; reps: number }
  export function isCompletedSet(s: LoggedSet): s is CompletedSet;
  export function compareSetOrder(a: LoggedSet, b: LoggedSet): number;
  export function sortSetHistory(sets: readonly LoggedSet[]): LoggedSet[];
  export function blockFor(plan: PlanTemplate, sessionIndex: number): PlanBlock;
  export function e1RM(loadKg: Kg, reps: number): Kg;
  export function suggestedProgression(
    history: readonly LoggedSet[], planned: PlannedExercise, ex: Exercise,
    profile: Profile, block: PlanBlock,
  ): ProgressionAdvice;
  export const INCREMENT_FRACTION: Record<Exercise["loadClass"], number>;
  export const STEP_GUARD_FRACTION: number;
  export const REP_RANGE_EXTENSION: number;
  export const LOAD_EQ_TOL_KG: number;
  export const IDENTITY_BLOCK: PlanBlock;
  ```

**Two ordering decisions recorded here, because a reviewer will ask:**

1. **A deload block is checked before the bodyweight rule.** Master plan §6.5 says bodyweight exercises yield `"extend-reps"` only, and that a deload block yields `"deload"`. Both cannot hold for a bodyweight exercise inside a deload block. A deload cuts volume (master plan §5, `PlanBlock`), so telling a lifter to add repetitions during one inverts the block's purpose. The deload branch therefore runs first, and the bodyweight rule governs every non-deload session. Both branches are tested.
2. **History is ordered by `(assignmentDate, setNumber)`, never by `loggedAt`.** Code review A23: the legacy sorted by wall-clock timestamp, so a set logged late for an earlier session outranked a set logged on time for a later one, and the suggestion for week 5 came from a trial set logged while scrubbing week 24. `loggedAt` is retained in storage for audit but never orders the progression.

- [ ] **Step 1: Write the shared test fixtures**

Create `src/test/fixtures.ts`:

```ts
// Test object builders. Deterministic ids so assertions can name them.
// Every physical quantity below carries its canonical unit in a comment.
import type {
  Exercise, LoggedSet, PlanBlock, PlannedExercise, Profile,
} from "../domain/types";

let counter = 0;
export function resetFixtureIds(): void {
  counter = 0;
}
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter).padStart(4, "0")}`;
}

export function makeProfile(patch: Partial<Profile> = {}): Profile {
  const base: Profile = {
    id: "profile-1",
    displayName: "Test Subject",
    timezone: "Europe/Athens",
    units: "metric",
    createdAt: Date.UTC(2026, 0, 1),                 // epoch ms UTC
    body: {
      sex: "male",
      birthYear: 1995,
      heightCm: 180,                                  // cm
      baselineMassKg: 95,                             // kg
      baselineAt: "2026-01-01",
      baselineBodyFatPct: null,                       // percent
    },
    activity: "moderate",
    experience: "intermediate",
    equipment: "full-gym",
    equipmentSteps: {
      barbellKg: 2.5,                                 // kg total (pair of 1.25 kg plates)
      dumbbellPairKg: 5,                              // kg per pair
      stackKg: 5,                                     // kg per pin
      hasMicroPlates: false,
    },
    goal: { kind: "muscle-gain", targetMassKg: null, targetBodyFatPct: null, targetDate: null },
    supplements: { creatine: true },
    hydration: { dailyTargetML: 3000, cupSizeML: 250 }, // mL/day, mL
  };
  return { ...base, ...patch };
}

export function makeExercise(patch: Partial<Exercise> = {}): Exercise {
  const base: Exercise = {
    id: "barbell-bench-press",
    name: "Barbell bench press",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "barbell",
    loadClass: "upper-compound",
    muscleGroups: ["chest", "triceps", "front delts"],
    equipment: ["full-gym"],
    videoQuery: "barbell bench press technique",
    formCueId: "barbell-bench-press",
    note: null,
  };
  return { ...base, ...patch };
}

export function makePlannedExercise(patch: Partial<PlannedExercise> = {}): PlannedExercise {
  const base: PlannedExercise = {
    exerciseId: "barbell-bench-press",
    setsLo: 3,
    setsHi: 4,
    prescription: { kind: "reps", lo: 6, hi: 8 },
    restS: 120,                                       // s
  };
  return { ...base, ...patch };
}

export function makeBlock(patch: Partial<PlanBlock> = {}): PlanBlock {
  const base: PlanBlock = {
    index: 0,
    firstSessionIndex: 0,
    sessionCount: 12,
    setModifier: 1,                                   // dimensionless multiplier
    loadModifier: 1,                                  // dimensionless multiplier
    isDeload: false,
  };
  return { ...base, ...patch };
}

export function makeSet(patch: Partial<LoggedSet> = {}): LoggedSet {
  const base: LoggedSet = {
    id: nextId("set"),
    profileId: "profile-1",
    assignmentDate: "2026-03-02",
    sessionId: "session-1",
    exerciseId: "barbell-bench-press",
    setNumber: 1,
    isBonus: false,
    loadKg: 60,                                       // kg
    enteredUnit: "metric",
    reps: 8,                                          // repetitions
    durationS: null,                                  // s
    rpe: null,                                        // RPE, Borg CR-10 anchored (Zourdos 2016)
    loggedAt: Date.UTC(2026, 2, 2, 10, 0),            // epoch ms UTC
  };
  return { ...base, ...patch };
}
```

- [ ] **Step 2: Write the failing progression tests**

Create `src/domain/training/progression.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeBlock, makeExercise, makePlannedExercise, makeProfile, makeSet } from "../../test/fixtures";
import { achievableLoad, displayLoad, toStoredLoad } from "../units";
import {
  blockFor, compareSetOrder, e1RM, IDENTITY_BLOCK, sortSetHistory, suggestedProgression,
} from "./progression";
import type { PlanTemplate } from "../types";

// A full session of `count` sets at `loadKg` x `reps` on one date.
function session(date: string, count: number, loadKg: number, reps: number, extra: Partial<ReturnType<typeof makeSet>> = {}) {
  return Array.from({ length: count }, (_, i) =>
    makeSet({ assignmentDate: date, setNumber: i + 1, loadKg, reps, ...extra }));
}

describe("suggestedProgression", () => {
  it("adds one 2.5 kg step to a 60 kg upper-body compound at the top of the range", () => {
    // Delta_target = 0.025 x 60 kg = 1.5 kg, which rounds DOWN to 0 on 2.5 kg
    // plates, so the max(Delta, step) floor supplies the 2.5 kg step.
    const advice = suggestedProgression(
      session("2026-03-02", 3, 60, 8),
      makePlannedExercise(),
      makeExercise({ loadClass: "upper-compound" }),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe("add-load");
    expect(advice.loadKg).toBeCloseTo(62.5, 10);
  });

  it("extends the rep range instead of jumping 12.5 % on a 20 kg curl", () => {
    const advice = suggestedProgression(
      session("2026-03-02", 3, 20, 12, { exerciseId: "barbell-curl" }),
      makePlannedExercise({ exerciseId: "barbell-curl", prescription: { kind: "reps", lo: 8, hi: 12 } }),
      makeExercise({ id: "barbell-curl", loadClass: "isolation", isCompoundPrimary: false }),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe("extend-reps");
    expect(advice.nextPrescription).toEqual({ kind: "reps", lo: 8, hi: 14 });
  });

  it("adds 5 kg to a 100 kg lower-body compound (5 % band, 2.5 kg step)", () => {
    const advice = suggestedProgression(
      session("2026-03-02", 3, 100, 6, { exerciseId: "barbell-back-squat" }),
      makePlannedExercise({ exerciseId: "barbell-back-squat", prescription: { kind: "reps", lo: 4, hi: 6 } }),
      makeExercise({ id: "barbell-back-squat", loadClass: "lower-compound" }),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe("add-load");
    expect(advice.loadKg).toBeCloseTo(105, 10);
  });

  it("moves an imperial 135 lb bench to 140 lb", () => {
    const profile = makeProfile({
      units: "imperial",
      equipmentSteps: {
        barbellKg: toStoredLoad(5, "imperial"),        // 5 lb total = 2.26796185 kg
        dumbbellPairKg: toStoredLoad(10, "imperial"),  // 10 lb per pair
        stackKg: toStoredLoad(10, "imperial"),         // 10 lb per pin
        hasMicroPlates: false,
      },
    });
    const loadKg = toStoredLoad(135, "imperial");      // 61.23496995 kg
    expect(loadKg).toBeCloseTo(61.23496995, 10);
    const advice = suggestedProgression(
      session("2026-03-02", 3, loadKg, 8, { enteredUnit: "imperial" }),
      makePlannedExercise(),
      makeExercise({ loadClass: "upper-compound" }),
      profile,
      makeBlock(),
    );
    expect(advice.kind).toBe("add-load");
    expect(advice.loadKg).toBeCloseTo(63.5029318, 9);
    expect(displayLoad(advice.loadKg ?? 0, "imperial")).toBe(140);
  });

  it("treats a later-dated set as later even when its loggedAt is earlier", () => {
    // Code review A23: wall-clock order and programme order disagree when a
    // session is logged retrospectively. Programme order must win.
    const early = session("2026-03-09", 3, 60, 8).map((s) => ({ ...s, loggedAt: 1_000 }));
    const late = session("2026-03-02", 3, 80, 5).map((s) => ({ ...s, loggedAt: 9_000_000 }));
    const ordered = sortSetHistory([...late, ...early]);
    expect(ordered.at(-1)?.assignmentDate).toBe("2026-03-09");

    const advice = suggestedProgression(
      [...late, ...early], makePlannedExercise(), makeExercise(), makeProfile(), makeBlock(),
    );
    // The last SESSION is 2026-03-09 at 60 kg, so the suggestion is 62.5 kg.
    expect(advice.loadKg).toBeCloseTo(62.5, 10);
  });

  it("holds the load when one prescribed set fell short of the top of the range", () => {
    const history = [
      makeSet({ assignmentDate: "2026-03-02", setNumber: 1, loadKg: 60, reps: 8 }),
      makeSet({ assignmentDate: "2026-03-02", setNumber: 2, loadKg: 60, reps: 8 }),
      makeSet({ assignmentDate: "2026-03-02", setNumber: 3, loadKg: 60, reps: 7 }),
    ];
    const advice = suggestedProgression(history, makePlannedExercise(), makeExercise(), makeProfile(), makeBlock());
    expect(advice.kind).toBe("hold");
    expect(advice.loadKg).toBe(60);
  });

  it("does not advance on two top-range sets inside one unfinished session", () => {
    // Code review A22: the legacy bumped the load mid-session after two sets.
    const history = session("2026-03-02", 2, 60, 8);
    const advice = suggestedProgression(history, makePlannedExercise(), makeExercise(), makeProfile(), makeBlock());
    expect(advice.kind).toBe("hold");
  });

  it("returns deload inside a deload block, load unchanged", () => {
    const advice = suggestedProgression(
      session("2026-03-02", 3, 60, 8), makePlannedExercise(), makeExercise(),
      makeProfile(), makeBlock({ isDeload: true, setModifier: 0.5 }),
    );
    expect(advice.kind).toBe("deload");
    expect(advice.loadKg).toBe(60);
  });

  it("returns extend-reps for a bodyweight exercise outside a deload block", () => {
    const ex = makeExercise({ id: "pull-up", isBodyweight: true, modality: "bodyweight" });
    const advice = suggestedProgression(
      session("2026-03-02", 3, 0, 8, { exerciseId: "pull-up" }),
      makePlannedExercise({ exerciseId: "pull-up" }), ex, makeProfile(), makeBlock(),
    );
    expect(advice.kind).toBe("extend-reps");
    expect(advice.loadKg).toBeNull();
  });

  it("holds with a null load when there is no history", () => {
    const advice = suggestedProgression([], makePlannedExercise(), makeExercise(), makeProfile(), makeBlock());
    expect(advice.kind).toBe("hold");
    expect(advice.loadKg).toBeNull();
  });

  it("ignores bonus sets when deciding whether the range was met", () => {
    const history = [
      ...session("2026-03-02", 3, 60, 8),
      makeSet({ assignmentDate: "2026-03-02", setNumber: 4, loadKg: 40, reps: 4, isBonus: true }),
    ];
    const advice = suggestedProgression(history, makePlannedExercise(), makeExercise(), makeProfile(), makeBlock());
    expect(advice.kind).toBe("add-load");
  });
});

describe("achievableLoad tolerance contract (guards P1)", () => {
  it("re-quantising an exact 140 lb still displays 140 lb", () => {
    // 63.5029318 / (5 lb in kg) = 27.999999999999996, so an epsilon-free
    // Math.floor drops a whole 5 lb step. P1's achievableLoad must absorb that.
    const step = toStoredLoad(5, "imperial");
    expect(displayLoad(achievableLoad(63.5029318, step), "imperial")).toBe(140);
  });
});

describe("e1RM", () => {
  it("reproduces the Epley chart value for 100 kg x 5", () => {
    expect(e1RM(100, 5)).toBeCloseTo(116.6667, 4);
  });
  it("applies the 1/30 coefficient at a single repetition", () => {
    expect(e1RM(80, 1)).toBeCloseTo(82.6667, 4);
  });
});

describe("blockFor", () => {
  const plan = {
    id: "plan-1", version: 1, name: "Upper/Lower", sessionsPerWeek: 4, weeks: 12,
    sessions: [],
    blocks: [
      { index: 0, firstSessionIndex: 0, sessionCount: 16, setModifier: 1, loadModifier: 1, isDeload: false },
      { index: 1, firstSessionIndex: 16, sessionCount: 4, setModifier: 0.5, loadModifier: 1, isDeload: true },
    ],
  } satisfies PlanTemplate;

  it("finds the block containing a session index", () => {
    expect(blockFor(plan, 17).isDeload).toBe(true);
    expect(blockFor(plan, 15).isDeload).toBe(false);
  });
  it("falls back to the identity block outside every range", () => {
    expect(blockFor(plan, 99)).toEqual(IDENTITY_BLOCK);
  });
});

describe("compareSetOrder", () => {
  it("orders by assignment date, then set number", () => {
    const a = makeSet({ assignmentDate: "2026-03-02", setNumber: 2 });
    const b = makeSet({ assignmentDate: "2026-03-02", setNumber: 1 });
    const c = makeSet({ assignmentDate: "2026-03-09", setNumber: 1 });
    expect(compareSetOrder(a, b)).toBeGreaterThan(0);
    expect(compareSetOrder(a, c)).toBeLessThan(0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/domain/training/progression.test.ts`
Expected: FAIL — `Failed to resolve import "./progression"`.

- [ ] **Step 4: Write the progression module**

Create `src/domain/training/progression.ts`:

```ts
// Double progression with a percentage increment and an equipment guard.
// Every threshold below comes from docs/review/2026-09-01-content-peer-review.md
// with the DOI reproduced; nothing here is invented.
import { compareLocalDate } from "../dates";
import type {
  Exercise, Kg, LoggedSet, PlanBlock, PlanTemplate, PlannedExercise, Prescription, Profile,
} from "../types";
import { achievableLoad, formatLoad, stepFor } from "../units";

/**
 * Fraction of the working load added when the top of the rep range is met on
 * every prescribed set. The 2-10 % band is ACSM (2009), Progression Models in
 * Resistance Training for Healthy Adults, Med Sci Sports Exerc 41(3):687-708,
 * DOI 10.1249/mss.0b013e3181915670, verbatim: "2-10% increase in load be
 * applied when the individual can perform the current workload for one to two
 * repetitions over the desired number".
 * The 5 % / 2.5 % split inside that band is the content peer review's §10
 * heuristic and is marked INSUFFICIENT EVIDENCE there - no study compares
 * increment sizes head to head. It is a choice inside a cited range, not a
 * finding, and must be presented as such.
 */
export const INCREMENT_FRACTION: Record<Exercise["loadClass"], number> = {
  "lower-compound": 0.05,   // dimensionless fraction of the working load
  "upper-compound": 0.025,  // dimensionless
  "isolation": 0.025,       // dimensionless
};

/**
 * When the smallest achievable equipment step is more than this fraction of the
 * working load, no load increment can honour the ACSM band, so the engine
 * extends the rep range instead (content peer review §10: a 20 kg curl in a
 * metric gym faces a 2.5 kg floor = 12.5 % of the working load).
 */
export const STEP_GUARD_FRACTION = 0.10;   // dimensionless

/** Repetitions added to prescription.hi when the guard fires (review §10). */
export const REP_RANGE_EXTENSION = 2;      // repetitions

/**
 * Two logged loads count as the same working load within this tolerance.
 * Code review A24: exact float equality gated the legacy progression and any
 * residue from a kg<->lb conversion killed the rule silently. 0.01 kg is an
 * order of magnitude below the smallest fractional plate pair in the review's
 * §10 plate table (0.25 kg total), so it can absorb float residue and nothing
 * a lifter could physically load.
 */
export const LOAD_EQ_TOL_KG = 0.01;        // kg

export interface ProgressionAdvice {
  kind: "hold" | "add-load" | "extend-reps" | "deload";
  loadKg: Kg | null;               // kg, canonical; null when no load can be suggested
  reason: string;
  prescription: Prescription;      // as programmed for the session just performed
  nextPrescription: Prescription;  // what the next session should use
}

/** A set with both a load and a rep count recorded. */
export interface CompletedSet extends LoggedSet { loadKg: Kg; reps: number }

export function isCompletedSet(s: LoggedSet): s is CompletedSet {
  return s.loadKg !== null && s.reps !== null;
}

/**
 * Programme order, never wall-clock order. Code review A23: the legacy sorted
 * by `loggedAt`, so a set logged while scrubbing a future week outranked the
 * real history. `loggedAt` stays in storage for audit and orders nothing.
 */
export function compareSetOrder(a: LoggedSet, b: LoggedSet): number {
  const byDate = compareLocalDate(a.assignmentDate, b.assignmentDate);
  if (byDate !== 0) return byDate;
  return a.setNumber - b.setNumber;
}

export function sortSetHistory(sets: readonly LoggedSet[]): LoggedSet[] {
  return [...sets].sort(compareSetOrder);
}

/** Used when a session index falls outside every declared block. */
export const IDENTITY_BLOCK: PlanBlock = {
  index: -1, firstSessionIndex: 0, sessionCount: 0,
  setModifier: 1, loadModifier: 1, isDeload: false,
};

export function blockFor(plan: PlanTemplate, sessionIndex: number): PlanBlock {
  for (const b of plan.blocks) {
    if (sessionIndex >= b.firstSessionIndex && sessionIndex < b.firstSessionIndex + b.sessionCount) {
      return b;
    }
  }
  return IDENTITY_BLOCK;
}

/**
 * Epley estimate of a one-repetition maximum.
 * Epley B (1985), Poundage chart, in Boyd Epley Workout, Body Enterprises p.86.
 * The content peer review §5 (card c003) records that this source is
 * self-published, not peer reviewed, with N unknown, and that Reynolds JM et al.
 * (2006), J Strength Cond Res 20(3):584-592, report a standard error of
 * estimate of 1.85 kg (chest press) to 14.05 kg (leg press) at 5RM. Treat the
 * output as an index for comparing sets, not as a measured 1RM.
 * Validity domain: reps <= 10. The caller guards; this function does not.
 */
export function e1RM(loadKg: Kg, reps: number): Kg {   // kg in, kg out
  return loadKg * (1 + reps / 30);
}

function extendReps(p: Prescription): Prescription {
  return p.kind === "reps" ? { kind: "reps", lo: p.lo, hi: p.hi + REP_RANGE_EXTENSION } : p;
}

export function suggestedProgression(
  history: readonly LoggedSet[],
  planned: PlannedExercise,
  ex: Exercise,
  profile: Profile,
  block: PlanBlock,
): ProgressionAdvice {
  const prescription = planned.prescription;
  const units = profile.units;
  const base = { prescription, nextPrescription: prescription };

  // Prescribed, completed sets for this exercise only. Bonus sets are extra
  // work by definition and never decide whether the prescription was met.
  const ordered = sortSetHistory(
    history.filter((s) => s.exerciseId === ex.id && !s.isBonus && isCompletedSet(s)),
  ).filter(isCompletedSet);
  const last = ordered.at(-1);

  // 1. A deload block is a programme-level instruction and outranks everything
  //    else: it cuts volume (master plan §5) and holds the load. Telling a
  //    lifter to add reps here would invert the block's purpose.
  if (block.isDeload) {
    return {
      ...base, kind: "deload", loadKg: last ? last.loadKg : null,
      reason: "Deload block: hold the load; the plan cuts the set count.",
    };
  }

  // 2. Bodyweight exercises carry no external load to increment.
  if (ex.isBodyweight) {
    return {
      ...base, kind: "extend-reps", loadKg: null,
      nextPrescription: extendReps(prescription),
      reason: "Bodyweight exercise: progress by adding repetitions.",
    };
  }

  // 3. Only a bounded rep prescription can trigger a load increment; timed and
  //    AMRAP work has no "top of the range" to reach.
  if (prescription.kind !== "reps") {
    return {
      ...base, kind: "hold", loadKg: last ? last.loadKg : null,
      reason: "No bounded rep range: hold the load and progress the prescription.",
    };
  }

  if (!last) {
    return {
      ...base, kind: "hold", loadKg: null,
      reason: `No previous set recorded. Choose a load you can complete ${prescription.lo}-${prescription.hi} repetitions with.`,
    };
  }

  // The working load of the last session, and whether every prescribed set of
  // that session reached the top of the range at that load.
  const lastSession = ordered.filter((s) => s.assignmentDate === last.assignmentDate);
  const workingLoadKg = lastSession.reduce((m, s) => Math.max(m, s.loadKg), 0);   // kg
  const prescribedSets = Math.max(1, planned.setsLo);
  const metTop =
    lastSession.length >= prescribedSets &&
    lastSession.every(
      (s) => s.reps >= prescription.hi && Math.abs(s.loadKg - workingLoadKg) <= LOAD_EQ_TOL_KG,
    );

  if (!metTop) {
    return {
      ...base, kind: "hold", loadKg: workingLoadKg,
      reason: `Hold ${formatLoad(workingLoadKg, units)} until all ${prescribedSets} prescribed sets reach ${prescription.hi} repetitions.`,
    };
  }

  const stepKg = stepFor(ex, profile.equipmentSteps);   // kg, smallest achievable increment
  if (stepKg <= 0) {
    return {
      ...base, kind: "extend-reps", loadKg: workingLoadKg,
      nextPrescription: extendReps(prescription),
      reason: "No load increment is available for this equipment: add repetitions.",
    };
  }

  // Guard. A zero working load makes the ratio Infinity, which correctly routes
  // to extend-reps rather than dividing by zero downstream.
  if (stepKg / workingLoadKg > STEP_GUARD_FRACTION) {
    return {
      ...base, kind: "extend-reps", loadKg: workingLoadKg,
      nextPrescription: extendReps(prescription),
      reason: `The smallest available increment (${formatLoad(stepKg, units)}) exceeds 10 % of ${formatLoad(workingLoadKg, units)}. Extend the rep range instead of adding load.`,
    };
  }

  const deltaTargetKg = INCREMENT_FRACTION[ex.loadClass] * workingLoadKg;   // kg
  const deltaKg = Math.max(achievableLoad(deltaTargetKg, stepKg), stepKg);  // kg, rounded DOWN then floored at one step
  const nextKg = workingLoadKg + deltaKg;                                   // kg
  return {
    ...base, kind: "add-load", loadKg: nextKg,
    reason: `All prescribed sets reached ${prescription.hi} repetitions. Add ${formatLoad(deltaKg, units)} and reset to ${prescription.lo} repetitions.`,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/domain/training/progression.test.ts`
Expected: PASS — 17 passed.

- [ ] **Step 6: Run lint and type checks**

Run: `npx tsc --noEmit && npx eslint src/domain/training/progression.ts src/test/fixtures.ts`
Expected: no output, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add src/test/fixtures.ts src/domain/training/progression.ts src/domain/training/progression.test.ts
git commit -m "feat: cited double-progression engine with equipment guard"
```

---

### Task 2: Coach line

**Files:**
- Create: `src/domain/training/coach.ts`
- Test: `src/domain/training/coach.test.ts`

**Interfaces:**
- Consumes: `ProgressionAdvice`, `CompletedSet`, `isCompletedSet`, `LOAD_EQ_TOL_KG` from `./progression`; `LoggedSet`, `UnitSystem` from `../types`; `displayLoad`, `formatLoad`, `toStoredLoad`, `UNIT_LABEL` from `../units`.
- Produces:
  ```ts
  export interface CoachLine { text: string; tone: "coach" | "telemetry" }
  export function coachLine(
    set: LoggedSet, history: readonly LoggedSet[], advice: ProgressionAdvice, units: UnitSystem,
  ): CoachLine;
  export const OVER_BAND: Record<UnitSystem, number>;
  export const UNDER_BAND: Record<UnitSystem, number>;
  ```

**What the port changes and why.** The ladder order is the legacy one (`console-store.jsx:10-39`): load PR against the lifetime best, then a rep PR at the same load, then against the suggested load, then against the prescribed rep range, then at the top of the range, then inside it. Three defects are fixed:

- **Code review A5.** The `±0.5` and `±2.5` deadbands were unlabelled constants compared against input that might be lb, so on lb entry the "over suggested" band collapsed to 0.5 lb and fired on nearly every set. They are now declared in the display unit and converted exactly.
- **Code review A25.** "weight PR" and "overall record" shared one object and one label. Rung 1 is now labelled a load PR (heaviest load) and rung 2 a rep PR at that load; neither claims to be an e1RM record.
- **Global tone constraint.** "pushing hard" and "save it for next set if recovered" are motivational filler and are deleted. The replacement text states the measurement.

- [ ] **Step 1: Write the failing coach tests**

Create `src/domain/training/coach.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeExercise, makePlannedExercise, makeProfile, makeSet, makeBlock } from "../../test/fixtures";
import { toStoredLoad } from "../units";
import { coachLine } from "./coach";
import { suggestedProgression, type ProgressionAdvice } from "./progression";

const HOLD_AT_60: ProgressionAdvice = {
  kind: "hold", loadKg: 60, reason: "",
  prescription: { kind: "reps", lo: 6, hi: 8 },
  nextPrescription: { kind: "reps", lo: 6, hi: 8 },
};

describe("coachLine (metric)", () => {
  it("reports a load PR against the lifetime best", () => {
    const history = [makeSet({ loadKg: 60, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 62.5, reps: 6 }), history, HOLD_AT_60, "metric");
    expect(line.text).toBe("Load PR. Previous best 60 kg × 8.");
    expect(line.tone).toBe("telemetry");
  });

  it("reports a rep PR at the same load", () => {
    const history = [makeSet({ loadKg: 60, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 9 }), history, HOLD_AT_60, "metric");
    expect(line.text).toBe("Rep PR at 60 kg. Previous best 8 reps.");
    expect(line.tone).toBe("telemetry");
  });

  it("reports a load above the suggestion once the 0.5 kg band is cleared", () => {
    const history = [makeSet({ loadKg: 70, reps: 8 })];   // lifetime best is higher, so no PR
    const line = coachLine(makeSet({ loadKg: 62.5, reps: 7 }), history, HOLD_AT_60, "metric");
    expect(line.text).toBe("2.5 kg over the suggested load.");
    expect(line.tone).toBe("coach");
  });

  it("reports a load below the suggestion once the 2.5 kg band is cleared", () => {
    const history = [makeSet({ loadKg: 70, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 55, reps: 7 }), history, HOLD_AT_60, "metric");
    expect(line.text).toBe("5 kg under the suggested load.");
  });

  it("stays silent about the suggestion inside the deadband", () => {
    const history = [makeSet({ loadKg: 70, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 7 }), history, HOLD_AT_60, "metric");
    expect(line.text).toBe("60 kg × 7, inside the prescribed 6-8.");
  });

  it("reports repetitions above the prescribed range", () => {
    const history = [makeSet({ loadKg: 70, reps: 12 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 10 }), history, HOLD_AT_60, "metric");
    expect(line.text).toBe("2 reps above the prescribed range. Earn the load increment next session.");
  });

  it("reports repetitions below the prescribed range", () => {
    const history = [makeSet({ loadKg: 70, reps: 12 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 4 }), history, HOLD_AT_60, "metric");
    expect(line.text).toBe("4 reps, below the prescribed 6-8.");
  });

  it("reports the top of the range", () => {
    const history = [makeSet({ loadKg: 70, reps: 12 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 8 }), history, HOLD_AT_60, "metric");
    expect(line.text).toBe("Top of range at 60 kg × 8.");
    expect(line.tone).toBe("coach");
  });

  it("falls back to a plain readout for a timed set", () => {
    const set = makeSet({ loadKg: 0, reps: null, durationS: 45 });
    const advice: ProgressionAdvice = { ...HOLD_AT_60, prescription: { kind: "duration", targetS: 45 }, nextPrescription: { kind: "duration", targetS: 45 } };
    const line = coachLine(set, [], advice, "metric");
    expect(line.text).toBe("45 s logged.");
    expect(line.tone).toBe("telemetry");
  });
});

describe("coachLine (imperial)", () => {
  const lb = (n: number) => toStoredLoad(n, "imperial");

  it("labels a load PR in pounds", () => {
    const history = [makeSet({ loadKg: lb(135), reps: 8, enteredUnit: "imperial" })];
    const line = coachLine(makeSet({ loadKg: lb(140), reps: 6, enteredUnit: "imperial" }), history, HOLD_AT_60, "imperial");
    expect(line.text).toBe("Load PR. Previous best 135 lb × 8.");
  });

  it("uses a 1 lb over-band and a 5 lb under-band, not 0.5 and 2.5", () => {
    // Code review A5: a 0.5 lb band fired on almost every set.
    const advice: ProgressionAdvice = { ...HOLD_AT_60, loadKg: lb(135) };
    const history = [makeSet({ loadKg: lb(200), reps: 8 })];
    const inside = coachLine(makeSet({ loadKg: lb(135.5), reps: 7 }), history, advice, "imperial");
    expect(inside.text).toBe("135.5 lb × 7, inside the prescribed 6-8.");
    const outside = coachLine(makeSet({ loadKg: lb(140), reps: 7 }), history, advice, "imperial");
    expect(outside.text).toBe("5 lb over the suggested load.");
  });
});

describe("coachLine integrates with suggestedProgression", () => {
  it("announces the top of range when the engine is about to add load", () => {
    const history = [
      makeSet({ assignmentDate: "2026-03-02", setNumber: 1, loadKg: 60, reps: 8 }),
      makeSet({ assignmentDate: "2026-03-02", setNumber: 2, loadKg: 60, reps: 8 }),
      makeSet({ assignmentDate: "2026-03-02", setNumber: 3, loadKg: 60, reps: 8 }),
    ];
    const advice = suggestedProgression(history, makePlannedExercise(), makeExercise(), makeProfile(), makeBlock());
    expect(advice.kind).toBe("add-load");
    const line = coachLine(makeSet({ assignmentDate: "2026-03-09", loadKg: 62.5, reps: 6 }), history, advice, "metric");
    expect(line.text).toBe("Load PR. Previous best 60 kg × 8.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/training/coach.test.ts`
Expected: FAIL — `Failed to resolve import "./coach"`.

- [ ] **Step 3: Write the coach module**

Create `src/domain/training/coach.ts`:

```ts
// One short line about the set that was just logged, ranked by what is most
// worth saying. Ported from console-store.jsx:10-39 with the unit and labelling
// defects of code review A5 and A25 fixed, and the motivational filler removed
// per the global tone constraint.
import type { LoggedSet, UnitSystem } from "../types";
import { displayLoad, formatLoad, toStoredLoad, UNIT_LABEL } from "../units";
import { isCompletedSet, LOAD_EQ_TOL_KG, type CompletedSet, type ProgressionAdvice } from "./progression";

export interface CoachLine {
  text: string;
  /** "telemetry" = a measured record or a plain readout; "coach" = an instruction. */
  tone: "coach" | "telemetry";
}

/**
 * Deadbands for the "over / under the suggested load" rungs, declared in the
 * user's DISPLAY unit and converted exactly. Code review A5: the legacy values
 * (0.5 and 2.5) were unlabelled numbers compared against possibly-lb input.
 * The imperial values hold the same fraction of the smallest common barbell
 * step in each system (content peer review §10 plate table: 2.5 kg metric,
 * 5 lb imperial): 0.5/2.5 = 0.2 -> 1 lb, and 2.5/2.5 = 1.0 -> 5 lb.
 */
export const OVER_BAND: Record<UnitSystem, number> = { metric: 0.5, imperial: 1 };   // display unit
export const UNDER_BAND: Record<UnitSystem, number> = { metric: 2.5, imperial: 5 };  // display unit

/** Lifetime best: heaviest load, and among equal loads the most repetitions. */
function lifetimeBest(history: readonly LoggedSet[]): CompletedSet | null {
  let best: CompletedSet | null = null;
  for (const s of history) {
    if (!isCompletedSet(s)) continue;
    if (best === null) { best = s; continue; }
    const heavier = s.loadKg > best.loadKg + LOAD_EQ_TOL_KG;
    const sameLoadMoreReps = Math.abs(s.loadKg - best.loadKg) <= LOAD_EQ_TOL_KG && s.reps > best.reps;
    if (heavier || sameLoadMoreReps) best = s;
  }
  return best;
}

/** A load difference, in the display unit, without the "BW" special case. */
function formatDelta(deltaKg: number, units: UnitSystem): string {   // kg in
  return `${displayLoad(deltaKg, units)} ${UNIT_LABEL[units].load}`;
}

export function coachLine(
  set: LoggedSet,
  history: readonly LoggedSet[],
  advice: ProgressionAdvice,
  units: UnitSystem,
): CoachLine {
  if (!isCompletedSet(set)) {
    if (set.durationS !== null) return { text: `${set.durationS} s logged.`, tone: "telemetry" };
    return { text: "Set logged.", tone: "telemetry" };
  }

  const best = lifetimeBest(history);

  // 1. Load PR against the lifetime best. This is a heaviest-load record and is
  //    labelled as one; it is not an estimated-1RM record (code review A25).
  if (best !== null && set.loadKg > best.loadKg + LOAD_EQ_TOL_KG) {
    return {
      text: `Load PR. Previous best ${formatLoad(best.loadKg, units)} × ${best.reps}.`,
      tone: "telemetry",
    };
  }

  // 2. Rep PR at the same load.
  if (best !== null && Math.abs(set.loadKg - best.loadKg) <= LOAD_EQ_TOL_KG && set.reps > best.reps) {
    return {
      text: `Rep PR at ${formatLoad(set.loadKg, units)}. Previous best ${best.reps} reps.`,
      tone: "telemetry",
    };
  }

  // 3. Against the suggested load.
  const suggestedKg = advice.loadKg;   // kg
  if (suggestedKg !== null) {
    const overBandKg = toStoredLoad(OVER_BAND[units], units);     // kg
    const underBandKg = toStoredLoad(UNDER_BAND[units], units);   // kg
    if (set.loadKg > suggestedKg + overBandKg) {
      return { text: `${formatDelta(set.loadKg - suggestedKg, units)} over the suggested load.`, tone: "coach" };
    }
    if (set.loadKg < suggestedKg - underBandKg) {
      return { text: `${formatDelta(suggestedKg - set.loadKg, units)} under the suggested load.`, tone: "coach" };
    }
  }

  // 4-6. Against the prescribed rep range.
  const p = advice.prescription;
  if (p.kind === "reps") {
    if (set.reps > p.hi) {
      const over = set.reps - p.hi;   // repetitions
      return {
        text: `${over} rep${over === 1 ? "" : "s"} above the prescribed range. Earn the load increment next session.`,
        tone: "coach",
      };
    }
    if (set.reps < p.lo) {
      return { text: `${set.reps} reps, below the prescribed ${p.lo}-${p.hi}.`, tone: "coach" };
    }
    if (set.reps === p.hi) {
      return { text: `Top of range at ${formatLoad(set.loadKg, units)} × ${set.reps}.`, tone: "coach" };
    }
    return {
      text: `${formatLoad(set.loadKg, units)} × ${set.reps}, inside the prescribed ${p.lo}-${p.hi}.`,
      tone: "coach",
    };
  }

  return { text: `${formatLoad(set.loadKg, units)} × ${set.reps} logged.`, tone: "telemetry" };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/training/coach.test.ts`
Expected: PASS — 12 passed.

- [ ] **Step 5: Run lint and type checks**

Run: `npx tsc --noEmit && npx eslint src/domain/training/coach.ts`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/domain/training/coach.ts src/domain/training/coach.test.ts
git commit -m "feat: unit-aware coach line ported from the legacy ladder"
```

---

### Task 3: Rest timer domain

**Files:**
- Create: `src/domain/training/restTimer.ts`
- Test: `src/domain/training/restTimer.test.ts`

**Interfaces:**
- Consumes: `Exercise`, `PlannedExercise`, `Seconds`, `EpochMs` from `../types`.
- Produces:
  ```ts
  export interface RestTimer { startedAt: EpochMs; endsAt: EpochMs; durationS: Seconds }
  export function startRest(durationS: Seconds, now: EpochMs): RestTimer;
  export function remainingS(timer: RestTimer, now: EpochMs): Seconds;
  export function totalS(timer: RestTimer): Seconds;
  export function extend(timer: RestTimer, deltaS: number): RestTimer;
  export function defaultRestS(ex: PlannedExercise, lib: Record<string, Exercise>): Seconds;
  export const REST_HEAVY_COMPOUND_S: Seconds;
  export const REST_MODERATE_COMPOUND_S: Seconds;
  export const REST_ISOLATION_S: Seconds;
  export const HEAVY_REP_CEILING: number;
  ```

The timer is a pair of absolute instants, never a decremented counter. Code review A31: the legacy chime lived inside a `setInterval` callback, and background tabs are throttled to >= 1 s and on iOS suspended outright, so a 90 s rest that ran while the phone was locked chimed 60 s late. Nothing here holds a countdown; `remainingS` is a function of `now`.

- [ ] **Step 1: Write the failing rest-timer tests**

Create `src/domain/training/restTimer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeExercise, makePlannedExercise } from "../../test/fixtures";
import {
  defaultRestS, extend, remainingS, REST_HEAVY_COMPOUND_S, REST_ISOLATION_S,
  REST_MODERATE_COMPOUND_S, startRest, totalS,
} from "./restTimer";
import type { Exercise } from "../types";

const T0 = Date.UTC(2026, 2, 2, 18, 0, 0);   // epoch ms UTC

describe("startRest / remainingS", () => {
  it("sets endsAt one duration after now", () => {
    const t = startRest(180, T0);
    expect(t.startedAt).toBe(T0);
    expect(t.endsAt).toBe(T0 + 180_000);
    expect(t.durationS).toBe(180);
    expect(remainingS(t, T0)).toBe(180);
  });

  it("counts down against wall-clock instants", () => {
    const t = startRest(90, T0);
    expect(remainingS(t, T0 + 30_000)).toBe(60);
  });

  it("returns 0 after a simulated 10-minute background jump, not a frozen count", () => {
    // Master plan §7, P4 timer gate.
    const t = startRest(90, T0);
    expect(remainingS(t, T0 + 600_000)).toBe(0);
  });

  it("clamps at 0 and never goes negative", () => {
    const t = startRest(90, T0);
    expect(remainingS(t, T0 + 10_000_000)).toBe(0);
  });
});

describe("extend", () => {
  it("moves endsAt only", () => {
    const t = startRest(90, T0);
    const e = extend(t, 30);
    expect(e.endsAt).toBe(t.endsAt + 30_000);
    expect(e.startedAt).toBe(t.startedAt);
    expect(e.durationS).toBe(t.durationS);
    expect(totalS(e)).toBe(120);
  });

  it("does not mutate the original timer", () => {
    const t = startRest(90, T0);
    extend(t, 30);
    expect(t.endsAt).toBe(T0 + 90_000);
  });
});

describe("defaultRestS", () => {
  const lib: Record<string, Exercise> = {
    "barbell-back-squat": makeExercise({ id: "barbell-back-squat", loadClass: "lower-compound" }),
    "barbell-bench-press": makeExercise({ id: "barbell-bench-press", loadClass: "upper-compound" }),
    "lateral-raise": makeExercise({ id: "lateral-raise", loadClass: "isolation", isCompoundPrimary: false, modality: "dumbbell" }),
    "plank": makeExercise({ id: "plank", loadClass: "isolation", isBodyweight: true, modality: "bodyweight" }),
  };

  it("gives 180 s to a heavy multi-joint compound at <= 6 reps", () => {
    const planned = makePlannedExercise({ exerciseId: "barbell-back-squat", prescription: { kind: "reps", lo: 4, hi: 6 } });
    expect(defaultRestS(planned, lib)).toBe(REST_HEAVY_COMPOUND_S);
    expect(REST_HEAVY_COMPOUND_S).toBe(180);
  });

  it("gives 120 s to a moderate compound at 6-12 reps", () => {
    const planned = makePlannedExercise({ exerciseId: "barbell-bench-press", prescription: { kind: "reps", lo: 8, hi: 12 } });
    expect(defaultRestS(planned, lib)).toBe(REST_MODERATE_COMPOUND_S);
    expect(REST_MODERATE_COMPOUND_S).toBe(120);
  });

  it("gives 90 s to single-joint isolation work", () => {
    const planned = makePlannedExercise({ exerciseId: "lateral-raise", prescription: { kind: "reps", lo: 12, hi: 15 } });
    expect(defaultRestS(planned, lib)).toBe(REST_ISOLATION_S);
    expect(REST_ISOLATION_S).toBe(90);
  });

  it("gives 90 s to a timed core hold", () => {
    const planned = makePlannedExercise({ exerciseId: "plank", prescription: { kind: "duration", targetS: 45 } });
    expect(defaultRestS(planned, lib)).toBe(REST_ISOLATION_S);
  });

  it("gives 120 s to a compound with an unbounded prescription", () => {
    const planned = makePlannedExercise({ exerciseId: "barbell-bench-press", prescription: { kind: "amrap", minimum: 5 } });
    expect(defaultRestS(planned, lib)).toBe(REST_MODERATE_COMPOUND_S);
  });

  it("falls back to 90 s for an exercise missing from the library", () => {
    const planned = makePlannedExercise({ exerciseId: "not-in-library" });
    expect(defaultRestS(planned, lib)).toBe(REST_ISOLATION_S);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/training/restTimer.test.ts`
Expected: FAIL — `Failed to resolve import "./restTimer"`.

- [ ] **Step 3: Write the rest-timer module**

Create `src/domain/training/restTimer.ts`:

```ts
// Rest interval as a pair of absolute instants. Nothing here decrements a
// counter: code review A31 records that the legacy interval froze while the tab
// was backgrounded and then chimed a minute late.
import type { EpochMs, Exercise, PlannedExercise, Seconds } from "../types";

/**
 * Rest-interval defaults, content peer review §9.
 *
 * Heavy multi-joint compound (>= 80 % 1RM, <= 6 reps): 180-300 s.
 *   de Salles BF et al. (2009), Rest Interval between Sets in Strength
 *   Training, Sports Med 39(9):765-777, DOI 10.2165/11315230-000000000-00000
 *   (3-5 min at 50-90 % 1RM); Grgic J et al. (2018), Sports Med 48(1):137-151,
 *   DOI 10.1007/s40279-017-0788-x (> 2 min to maximise strength in trained
 *   individuals). Default: the bottom of the band.
 *
 * Moderate compound (6-12 reps): 120-180 s.
 *   Schoenfeld BJ et al. (2016), J Strength Cond Res 30(7):1805-1812,
 *   DOI 10.1519/JSC.0000000000001272: 3 min beat 1 min for 1RM squat, 1RM
 *   bench and anterior-thigh thickness in 21 trained men over 8 weeks.
 *
 * Single-joint isolation, machine and accessory work: 60-90 s (lower systemic
 * cost). Default: the top of the band.
 *
 * Contradicting evidence, stated rather than omitted (review §9): ACSM 2026
 * found strength "was not affected by ... short (< 1 min) versus long (> 1 min)
 * between-set rest intervals" and "insufficient data" for hypertrophy. The
 * acute effect is uncontested - short rest reduces reps and load in subsequent
 * sets - so rest acts on adaptation through volume-load, not as an independent
 * stimulus. Long rest on heavy compounds costs only clock time.
 *
 * Honest limit (review §9): the literature stratifies rest by LOAD and GOAL,
 * not by exercise type. Keying on loadClass plus the rep ceiling is the closest
 * faithful mapping onto the load ranges actually tested; exercise-type
 * stratification per se is INSUFFICIENT EVIDENCE.
 */
export const REST_HEAVY_COMPOUND_S: Seconds = 180;     // s
export const REST_MODERATE_COMPOUND_S: Seconds = 120;  // s
export const REST_ISOLATION_S: Seconds = 90;           // s

/** Rep ceiling that puts a multi-joint set in the heavy band (review §9). */
export const HEAVY_REP_CEILING = 6;                    // repetitions

export interface RestTimer {
  startedAt: EpochMs;   // epoch ms UTC
  endsAt: EpochMs;      // epoch ms UTC
  durationS: Seconds;   // s, as originally requested; extensions move endsAt only
}

export function startRest(durationS: Seconds, now: EpochMs): RestTimer {
  return { startedAt: now, endsAt: now + durationS * 1000, durationS };
}

/** Seconds left, computed from endsAt and clamped at 0. Never decremented. */
export function remainingS(timer: RestTimer, now: EpochMs): Seconds {
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));   // s
}

/** Full span of the timer including any extensions; drives the progress ring. */
export function totalS(timer: RestTimer): Seconds {
  return Math.max(0, Math.round((timer.endsAt - timer.startedAt) / 1000));   // s
}

/** Extends the interval by moving endsAt; startedAt and durationS are untouched. */
export function extend(timer: RestTimer, deltaS: number): RestTimer {
  return { ...timer, endsAt: timer.endsAt + deltaS * 1000 };
}

export function defaultRestS(ex: PlannedExercise, lib: Record<string, Exercise>): Seconds {
  const exercise = lib[ex.exerciseId];
  // Unknown exercise: the conservative default is the shortest interval, which
  // never over-prescribes clock time for work that does not need it.
  if (exercise === undefined) return REST_ISOLATION_S;
  // Machine and cable single-joint work carries loadClass "isolation" in the
  // library, so the "isolation / machine -> 90 s" row is satisfied through
  // loadClass; a multi-joint machine press at <= 6 reps is treated by load.
  if (exercise.loadClass === "isolation") return REST_ISOLATION_S;
  if (ex.prescription.kind === "reps" && ex.prescription.hi <= HEAVY_REP_CEILING) {
    return REST_HEAVY_COMPOUND_S;
  }
  return REST_MODERATE_COMPOUND_S;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/training/restTimer.test.ts`
Expected: PASS — 12 passed.

- [ ] **Step 5: Run lint and type checks**

Run: `npx tsc --noEmit && npx eslint src/domain/training/restTimer.ts`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/domain/training/restTimer.ts src/domain/training/restTimer.test.ts
git commit -m "feat: absolute-timestamp rest timer with cited interval defaults"
```

---

### Task 4: Persisted-contract amendments

Three persisted fields are added. All are requested as master plan §5 amendments in the final section of this file *and* implemented here, because P4's scope depends on them. Every one is added to the Zod schema with a default so an existing `schemaVersion: 3` document still parses — no migration step, no `CURRENT_SCHEMA_VERSION` bump.

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/schema.ts`
- Test: `src/domain/schema.test.ts` (append; the file exists from P1)

**Interfaces:**
- Produces:
  ```ts
  // src/domain/types.ts
  Profile["hydration"] gains: weighInOptIn: boolean;      // pre/post-session weigh-in consent
  UiPrefs gains:            videoInstanceHost: string | null;  // last Invidious host that loaded
  AppState gains:           customExercises: Record<string, Exercise[]>;  // keyed by profileId
  ```

- [ ] **Step 1: Write the failing schema tests**

Append to `src/domain/schema.test.ts`:

```ts
describe("P4 persisted-contract additions", () => {
  it("defaults weighInOptIn, videoInstanceHost and customExercises on a v3 document without them", () => {
    const legacy = {
      schemaVersion: 3,
      activeProfileId: "profile-1",
      profiles: {
        "profile-1": {
          id: "profile-1", displayName: "T", timezone: "UTC", units: "metric", createdAt: 0,
          body: { sex: "male", birthYear: 1995, heightCm: 180, baselineMassKg: 95, baselineAt: "2026-01-01", baselineBodyFatPct: null },
          activity: "moderate", experience: "intermediate", equipment: "full-gym",
          equipmentSteps: { barbellKg: 2.5, dumbbellPairKg: 5, stackKg: 5, hasMicroPlates: false },
          goal: { kind: "muscle-gain", targetMassKg: null, targetBodyFatPct: null, targetDate: null },
          supplements: { creatine: true },
          hydration: { dailyTargetML: 3000, cupSizeML: 250 },
        },
      },
      availability: {}, plans: {}, cursors: {}, pauses: {}, assignments: {}, sets: {},
      bodyMass: {}, hydration: {}, intake: {}, weeklyReviews: {}, reminderSettings: {},
      pushDevice: null, motivation: {}, specimens: {}, capsules: {},
      ui: { bootSeen: true, lastView: "today", accent: "amber", scanlines: true, flicker: false, density: "normal" },
    };
    const parsed = AppStateSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.profiles["profile-1"]?.hydration.weighInOptIn).toBe(false);
    expect(parsed.data.ui.videoInstanceHost).toBeNull();
    expect(parsed.data.customExercises).toEqual({});
  });

  it("accepts a custom exercise with a generated id", () => {
    const ex = {
      id: "c7b1f0e2-0000-4000-8000-000000000000", name: "Cable crunch", isBodyweight: false,
      isCompoundPrimary: false, modality: "cable", loadClass: "isolation",
      muscleGroups: [], equipment: ["full-gym"], videoQuery: "cable crunch", formCueId: null, note: null,
    };
    expect(ExerciseSchema.safeParse(ex).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/schema.test.ts -t "P4 persisted-contract additions"`
Expected: FAIL — `expected undefined to be false` on `weighInOptIn`.

- [ ] **Step 3: Edit `src/domain/types.ts`**

Replace the `hydration` line inside `Profile`:

```ts
  hydration: { dailyTargetML: ML; cupSizeML: ML; };        // cupSizeML is display granularity only
```

with:

```ts
  hydration: {
    dailyTargetML: ML;        // mL/day, seeded from dailyBeverageTargetML(sex), editable
    cupSizeML: ML;            // mL, display granularity only
    weighInOptIn: boolean;    // consent to the pre/post-session body-mass check (ACSM 2007)
  };
```

Replace the `UiPrefs` interface:

```ts
export interface UiPrefs { bootSeen: boolean; lastView: string; accent: string; scanlines: boolean; flicker: boolean; density: "compact" | "normal"; }
```

with:

```ts
export interface UiPrefs {
  bootSeen: boolean; lastView: string; accent: string; scanlines: boolean;
  flicker: boolean; density: "compact" | "normal";
  videoInstanceHost: string | null;   // last Invidious host whose iframe loaded; null = try the list in order
}
```

Add one line to `AppState`, immediately after `plans: Record<string, PlanTemplate>;`:

```ts
  customExercises: Record<string, Exercise[]>;   // keyed by profileId; user-added library entries
```

- [ ] **Step 4: Edit `src/domain/schema.ts`**

Inside the `hydration` object of `ProfileSchema`, add:

```ts
    weighInOptIn: z.boolean().default(false),
```

Inside `UiPrefsSchema`, add:

```ts
  videoInstanceHost: z.string().max(253).nullable().default(null),
```

Inside `AppStateSchema`, add:

```ts
  customExercises: z.record(z.string(), z.array(ExerciseSchema)).default({}),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/domain/schema.test.ts`
Expected: PASS — every existing schema test plus the two new ones.

- [ ] **Step 6: Fix the fixtures that now miss a required field**

In `src/test/fixtures.ts`, replace the `hydration` line of `makeProfile`'s base object:

```ts
    hydration: { dailyTargetML: 3000, cupSizeML: 250 }, // mL/day, mL
```

with:

```ts
    hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: false }, // mL/day, mL, consent flag
```

- [ ] **Step 7: Run the whole suite and the type check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/domain/types.ts src/domain/schema.ts src/domain/schema.test.ts src/test/fixtures.ts
git commit -m "feat: add weighInOptIn, videoInstanceHost and customExercises to the v3 document"
```

---

### Task 5: Hydration cues

**Files:**
- Create: `src/domain/training/hydration.ts`
- Test: `src/domain/training/hydration.test.ts`
- Modify: `src/test/fixtures.ts` (add `makeState`)

**Interfaces:**
- Consumes: `AppState`, `EpochMs`, `HydrationEntry`, `Kg`, `LocalDate`, `ML`, `Sex` from `../types`; `localTimeOf`, `todayLocal` from `../dates`; `formatVolume` from `../units`.
- Produces:
  ```ts
  export interface HydrationCue {
    kind: "session-check" | "daily-shortfall" | "post-session-weigh";
    message: string;
    shortfallML: ML | null;
  }
  export function dailyBeverageTargetML(sex: Sex): ML;
  export function hydrationCue(state: AppState, profileId: string, now: EpochMs, sessionActive: boolean): HydrationCue | null;
  export function bodyMassLossFraction(preKg: Kg, postKg: Kg): number;
  export function exceedsDehydrationThreshold(preKg: Kg, postKg: Kg): boolean;
  export const SESSION_CHECK_INTERVAL_MS: number;
  export const DAILY_SHORTFALL_AFTER: string;
  export const DAILY_SHORTFALL_FRACTION: number;
  export const DEHYDRATION_LOSS_FRACTION: number;
  // src/test/fixtures.ts
  export function makeState(patch?: Partial<AppState>): AppState;
  ```

**Deleted content, recorded so it cannot creep back.** The legacy "water 500 mL between sets" instruction (`console-train.jsx:262-266`) is deleted outright: content review §3 computes it at up to 4.5 L in one session, exceeding any plausible sweat rate or gastric-emptying rate, with exercise-associated hyponatraemia as the mechanism of harm. No fixed between-set volume appears anywhere in this module or in the UI. The commonly cited "~1.5 L per kg lost" replacement figure is marked PARAPHRASE in the review (publisher returned HTTP 402) and must not ship as a number.

- [ ] **Step 1: Add `makeState` to the fixtures**

First add `AppState` to the existing type import at the top of `src/test/fixtures.ts`:

```ts
import type {
  AppState, Exercise, LoggedSet, PlanBlock, PlannedExercise, Profile,
} from "../domain/types";
```

Then append:

```ts
export function makeState(patch: Partial<AppState> = {}): AppState {
  const profile = makeProfile();
  const base: AppState = {
    schemaVersion: 3,
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    availability: {},
    plans: {},
    customExercises: {},
    cursors: {},
    pauses: {},
    assignments: {},
    sets: {},
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
      bootSeen: true, lastView: "today", accent: "amber",
      scanlines: true, flicker: false, density: "normal", videoInstanceHost: null,
    },
  };
  return { ...base, ...patch };
}
```

- [ ] **Step 2: Write the failing hydration tests**

Create `src/domain/training/hydration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeProfile, makeState } from "../../test/fixtures";
import {
  bodyMassLossFraction, dailyBeverageTargetML, exceedsDehydrationThreshold, hydrationCue,
} from "./hydration";

// Europe/Athens is UTC+2 on 2026-03-02 (EET, before the 29 March transition),
// so 16:00 UTC is 18:00 local.
const AT_1800_LOCAL = Date.UTC(2026, 2, 2, 16, 0, 0);   // epoch ms UTC
const AT_1200_LOCAL = Date.UTC(2026, 2, 2, 10, 0, 0);   // epoch ms UTC

describe("dailyBeverageTargetML", () => {
  it("gives the IOM 2005 beverage share, not the total-water AI", () => {
    expect(dailyBeverageTargetML("male")).toBe(3000);     // mL/day
    expect(dailyBeverageTargetML("female")).toBe(2200);   // mL/day
  });
});

describe("hydrationCue: session-check", () => {
  it("says 'Drink to thirst' after 20 minutes of an active session", () => {
    const startedAt = AT_1200_LOCAL;
    const state = makeState({
      assignments: {
        "profile-1": [{
          date: "2026-03-02", sessionId: "s1", sourceIndex: 0, status: "in-progress",
          startedAt, completedAt: null, skipReason: null,
        }],
      },
    });
    expect(hydrationCue(state, "profile-1", startedAt + 19 * 60_000, true)).toBeNull();
    const cue = hydrationCue(state, "profile-1", startedAt + 20 * 60_000, true);
    expect(cue?.kind).toBe("session-check");
    expect(cue?.message).toBe("Drink to thirst.");
    expect(cue?.shortfallML).toBeNull();
  });

  it("restarts the 20-minute window from the most recent drink mark", () => {
    const startedAt = AT_1200_LOCAL;
    const state = makeState({
      assignments: {
        "profile-1": [{
          date: "2026-03-02", sessionId: "s1", sourceIndex: 0, status: "in-progress",
          startedAt, completedAt: null, skipReason: null,
        }],
      },
      hydration: {
        "profile-1": [{
          profileId: "profile-1", date: "2026-03-02", volumeML: 500,
          marks: [startedAt + 15 * 60_000],
        }],
      },
    });
    expect(hydrationCue(state, "profile-1", startedAt + 30 * 60_000, true)).toBeNull();
    expect(hydrationCue(state, "profile-1", startedAt + 35 * 60_000, true)?.kind).toBe("session-check");
  });

  it("never prescribes a between-set volume", () => {
    const startedAt = AT_1200_LOCAL;
    const state = makeState({
      assignments: {
        "profile-1": [{
          date: "2026-03-02", sessionId: "s1", sourceIndex: 0, status: "in-progress",
          startedAt, completedAt: null, skipReason: null,
        }],
      },
    });
    const cue = hydrationCue(state, "profile-1", startedAt + 25 * 60_000, true);
    expect(cue?.message).not.toMatch(/\d/);
  });
});

describe("hydrationCue: daily-shortfall", () => {
  it("fires after 18:00 local when intake is below half the target", () => {
    const state = makeState({
      hydration: { "profile-1": [{ profileId: "profile-1", date: "2026-03-02", volumeML: 1000, marks: [] }] },
    });
    const cue = hydrationCue(state, "profile-1", AT_1800_LOCAL, false);
    expect(cue?.kind).toBe("daily-shortfall");
    expect(cue?.shortfallML).toBe(2000);   // mL, 3000 target - 1000 logged
  });

  it("does not fire before 18:00 local", () => {
    const state = makeState({
      hydration: { "profile-1": [{ profileId: "profile-1", date: "2026-03-02", volumeML: 1000, marks: [] }] },
    });
    expect(hydrationCue(state, "profile-1", AT_1200_LOCAL, false)).toBeNull();
  });

  it("does not fire at or above half the target", () => {
    const state = makeState({
      hydration: { "profile-1": [{ profileId: "profile-1", date: "2026-03-02", volumeML: 1500, marks: [] }] },
    });
    expect(hydrationCue(state, "profile-1", AT_1800_LOCAL, false)).toBeNull();
  });
});

describe("hydrationCue: post-session-weigh", () => {
  const completedAt = AT_1200_LOCAL;
  const completedState = (weighInOptIn: boolean) => makeState({
    profiles: {
      "profile-1": makeProfile({
        hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn },
      }),
    },
    assignments: {
      "profile-1": [{
        date: "2026-03-02", sessionId: "s1", sourceIndex: 0, status: "completed",
        startedAt: completedAt - 3_600_000, completedAt, skipReason: null,
      }],
    },
  });

  it("asks for a post-session mass when the profile opted in", () => {
    const cue = hydrationCue(completedState(true), "profile-1", completedAt + 60_000, false);
    expect(cue?.kind).toBe("post-session-weigh");
  });

  it("stays silent when the profile did not opt in", () => {
    expect(hydrationCue(completedState(false), "profile-1", completedAt + 60_000, false)).toBeNull();
  });

  it("stops asking once a mass has been logged after the session ended", () => {
    const state = completedState(true);
    const withEntry = {
      ...state,
      bodyMass: {
        "profile-1": [{
          id: "bm-1", profileId: "profile-1", date: "2026-03-02", massKg: 94.2,
          enteredUnit: "metric" as const, bodyFatPct: null, loggedAt: completedAt + 30_000,
        }],
      },
    };
    expect(hydrationCue(withEntry, "profile-1", completedAt + 60_000, false)).toBeNull();
  });
});

describe("body-mass loss check", () => {
  it("computes loss as a positive fraction of pre-session mass", () => {
    expect(bodyMassLossFraction(100, 98)).toBeCloseTo(0.02, 10);
    expect(bodyMassLossFraction(100, 101)).toBeCloseTo(-0.01, 10);
  });

  it("flags a loss strictly greater than 2 % of pre-session mass", () => {
    expect(exceedsDehydrationThreshold(100, 98)).toBe(false);
    expect(exceedsDehydrationThreshold(100, 97.9)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/domain/training/hydration.test.ts`
Expected: FAIL — `Failed to resolve import "./hydration"`.

- [ ] **Step 4: Write the hydration module**

Create `src/domain/training/hydration.ts`:

```ts
// Hydration cues. There is no fixed between-set volume anywhere in this file
// and there must never be one: content peer review §3 computed the legacy
// "500 mL between sets" instruction at up to 4.5 L in a single session, which
// exceeds any plausible sweat rate and any plausible gastric-emptying rate,
// with exercise-associated hyponatraemia as the mechanism of harm.
import { localTimeOf, todayLocal } from "../dates";
import type { AppState, EpochMs, Kg, ML, Sex } from "../types";
import { formatVolume } from "../units";

/**
 * Baseline daily fluid target, sex-specific.
 * Institute of Medicine (2005), Dietary Reference Intakes for Water, Potassium,
 * Sodium, Chloride, and Sulfate, National Academies Press,
 * DOI 10.17226/10925, verbatim: "The AI for total water intake for young men
 * and women (ages 19 to 30 years) is 3.7 L and 2.7 L per day", of which
 * BEVERAGES supplied 3.0 L and 2.2 L - approximately 81 % of total water
 * intake, with food supplying the remaining ~19 %.
 * The app can only observe beverages, so it displays the beverage figure. It
 * must never display "drink 3.7 L", which is the total including food water.
 * Rejected: a flat 3.5 L for everyone (the legacy rule) - it overshoots the
 * female total AI by ~30 % and undershoots the male, and is sex-invariant where
 * the DRI is not. Rejected: the "8 x 8" rule - Valtin H (2002), Am J Physiol
 * Regul Integr Comp Physiol 283(5):R993-R1004, DOI 10.1152/ajpregu.00365.2002,
 * verbatim: "No scientific studies were found in support of 8 x 8."
 */
export function dailyBeverageTargetML(sex: Sex): ML {
  return sex === "male" ? 3000 : 2200;   // mL/day
}

/** Minimum interval between in-session drink prompts. */
export const SESSION_CHECK_INTERVAL_MS = 20 * 60 * 1000;   // ms (20 min)

/** Local wall-clock time after which a daily shortfall is worth reporting. */
export const DAILY_SHORTFALL_AFTER = "18:00";              // HH:mm, profile timezone

/** Fraction of the daily target below which the shortfall cue fires. */
export const DAILY_SHORTFALL_FRACTION = 0.5;               // dimensionless

/**
 * In-session body-mass loss above which fluid replacement was inadequate.
 * ACSM; Sawka MN, Burke LM, Eichner ER, Maughan RJ, Montain SJ, Stachenfeld NS
 * (2007), Exercise and Fluid Replacement, Med Sci Sports Exerc 39(2):377-390,
 * DOI 10.1249/mss.0b013e31802ca597, verbatim: the goal is to prevent
 * "excessive (> 2 % body weight loss from water deficit) dehydration", and
 * "customized fluid replacement programs are recommended. Individual sweat
 * rates can be estimated by measuring body weight before and after exercise."
 * The commonly cited ~1.5 L per kg lost replacement figure is a PARAPHRASE in
 * the review (the publisher returned HTTP 402) and MUST NOT ship as a number.
 */
export const DEHYDRATION_LOSS_FRACTION = 0.02;             // dimensionless

export interface HydrationCue {
  kind: "session-check" | "daily-shortfall" | "post-session-weigh";
  message: string;
  shortfallML: ML | null;   // mL, only for daily-shortfall
}

/** Positive result = mass lost. Sign convention: (pre - post) / pre. */
export function bodyMassLossFraction(preKg: Kg, postKg: Kg): number {   // kg, kg -> dimensionless
  if (preKg <= 0) return 0;
  return (preKg - postKg) / preKg;
}

export function exceedsDehydrationThreshold(preKg: Kg, postKg: Kg): boolean {
  return bodyMassLossFraction(preKg, postKg) > DEHYDRATION_LOSS_FRACTION;
}

function latestMark(marks: readonly EpochMs[]): EpochMs {
  return marks.reduce((m, t) => (t > m ? t : m), 0);   // epoch ms UTC, 0 = none
}

export function hydrationCue(
  state: AppState,
  profileId: string,
  now: EpochMs,
  sessionActive: boolean,
): HydrationCue | null {
  const profile = state.profiles[profileId];
  if (profile === undefined) return null;

  const tz = profile.timezone;
  const today = todayLocal(tz, now);
  const entry = (state.hydration[profileId] ?? []).find((e) => e.date === today) ?? null;
  const volumeML = entry?.volumeML ?? 0;                                   // mL
  const assignment = (state.assignments[profileId] ?? []).find((a) => a.date === today) ?? null;

  // 1. Post-session weigh-in. Only for profiles that opted in, only once, and
  //    only until a body-mass entry lands after the session ended.
  if (profile.hydration.weighInOptIn && assignment !== null && assignment.status === "completed") {
    const completedAt = assignment.completedAt;
    if (completedAt !== null) {
      const alreadyWeighed = (state.bodyMass[profileId] ?? []).some((b) => b.loggedAt >= completedAt);
      if (!alreadyWeighed) {
        return {
          kind: "post-session-weigh",
          message: "Log your post-session body mass. A loss above two per cent of your pre-session mass means fluid replacement was inadequate (ACSM 2007).",
          shortfallML: null,
        };
      }
    }
  }

  // 2. In-session check. The anchor is whichever is later: the session start or
  //    the most recent drink mark. No volume is named - the instruction is
  //    "drink to thirst" and nothing more.
  if (sessionActive && assignment !== null) {
    const anchor = Math.max(assignment.startedAt ?? 0, latestMark(entry?.marks ?? []));   // epoch ms UTC
    if (anchor > 0 && now - anchor >= SESSION_CHECK_INTERVAL_MS) {
      return { kind: "session-check", message: "Drink to thirst.", shortfallML: null };
    }
  }

  // 3. Daily shortfall against the user's own editable target.
  const targetML = profile.hydration.dailyTargetML;                        // mL/day
  if (localTimeOf(now, tz) >= DAILY_SHORTFALL_AFTER && volumeML < DAILY_SHORTFALL_FRACTION * targetML) {
    return {
      kind: "daily-shortfall",
      message: `Beverage intake today is ${formatVolume(volumeML, profile.units)} against a ${formatVolume(targetML, profile.units)} target.`,
      shortfallML: Math.max(0, Math.round(targetML - volumeML)),           // mL
    };
  }

  return null;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/domain/training/hydration.test.ts`
Expected: PASS — 12 passed.

- [ ] **Step 6: Prove the deleted instruction is gone from the new tree**

Run: `git grep -nEi '500 ?m[lL] between|between sets' -- src/ || echo "clean"`
Expected: `clean`.

- [ ] **Step 7: Run lint and type checks**

Run: `npx tsc --noEmit && npx eslint src/domain/training/hydration.ts src/test/fixtures.ts`
Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add src/domain/training/hydration.ts src/domain/training/hydration.test.ts src/test/fixtures.ts
git commit -m "feat: sex-specific hydration target and drink-to-thirst cue, no fixed volume"
```

---

### Task 6: Store — session slice, training actions, selectors

**Files:**
- Create: `src/store/training.ts`
- Create: `src/store/training.test.ts`
- Create: `src/store/sessionMirror.ts`
- Create: `src/store/sessionMirror.test.ts`
- Modify: `src/store/index.ts`
- Modify: `src/store/selectors.ts`

**Interfaces:**
- Consumes: `BodyMassEntrySchema`, `ExerciseSchema`, `HydrationEntrySchema`, `LoggedSetSchema` from `../domain/schema`; `compareLocalDate` from `../domain/dates`; `newId` from `../domain/ids`; `todayLocal` from `../domain/dates`; `RestTimer` from `../domain/training/restTimer`; `sortSetHistory` from `../domain/training/progression`; the existing `useAppStore` from `./index`.
- Produces:
  ```ts
  // src/store/training.ts — pure transformers, no React, no I/O
  export function applyLogSet(state: AppState, input: Omit<LoggedSet, "id" | "loggedAt">, id: string, now: EpochMs): AppState;
  export function applyDeleteSet(state: AppState, id: string): { next: AppState; removed: LoggedSet | null };
  export function applyRestoreSet(state: AppState, set: LoggedSet): AppState;
  export function applyLogBodyMass(state: AppState, input: Omit<BodyMassEntry, "id" | "loggedAt">, id: string, now: EpochMs): AppState;
  export function applyAddHydration(state: AppState, profileId: string, date: LocalDate, volumeML: ML, now: EpochMs): AppState;
  export function applyAddCustomExercise(state: AppState, profileId: string, ex: Exercise): AppState;
  export const UNDO_WINDOW_MS: number;
  // src/store/sessionMirror.ts
  export interface SessionState {
    restTimer: RestTimer | null;
    activeAssignmentDate: LocalDate | null;
    bonusExerciseIds: string[];
    undo: PendingUndo | null;          // never mirrored
  }
  export interface PendingUndo { set: LoggedSet; expiresAt: EpochMs }
  export const EMPTY_SESSION: SessionState;
  export function loadSessionMirror(): Pick<SessionState, "restTimer" | "activeAssignmentDate" | "bonusExerciseIds"> | null;
  export function saveSessionMirror(s: SessionState): void;
  export function clearSessionMirror(): void;
  // src/store/index.ts — added actions
  logSet(set: Omit<LoggedSet, "id" | "loggedAt">, now: EpochMs): string;
  deleteSet(id: string): void;
  undoDelete(): void;
  logBodyMass(e: Omit<BodyMassEntry, "id" | "loggedAt">, now: EpochMs): void;
  addHydration(profileId: string, date: LocalDate, volumeML: ML, now: EpochMs): void;
  setRestTimer(t: RestTimer | null): void;
  addCustomExercise(profileId: string, ex: Exercise): void;
  addBonusExercise(exerciseId: string): void;
  // src/store/selectors.ts
  export function useExerciseHistory(exerciseId: string): LoggedSet[];
  export function useTodaysSets(): LoggedSet[];
  ```

**Why the transformers are separate.** They are pure `AppState -> AppState`, so they are tested without React, without a store, and without jsdom. `src/store/index.ts` then gains only thin wiring. Code review A41 also applies: the store is the only writer, so nothing here touches `localStorage`.

**Why `undo` is not mirrored.** A six-second undo buffer that survived a reload would let a user restore a set minutes later from a stale buffer. `saveSessionMirror` writes only the three durable fields.

- [ ] **Step 1: Write the failing transformer tests**

Create `src/store/training.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeExercise, makeSet, makeState } from "../test/fixtures";
import {
  applyAddCustomExercise, applyAddHydration, applyDeleteSet, applyLogBodyMass,
  applyLogSet, applyRestoreSet,
} from "./training";
import type { LoggedSet } from "../domain/types";

const NOW = Date.UTC(2026, 2, 2, 18, 30, 0);   // epoch ms UTC

const setInput: Omit<LoggedSet, "id" | "loggedAt"> = {
  profileId: "profile-1", assignmentDate: "2026-03-02", sessionId: "s1",
  exerciseId: "barbell-bench-press", setNumber: 1, isBonus: false,
  loadKg: 60, enteredUnit: "metric", reps: 8, durationS: null, rpe: null,
};

describe("applyLogSet", () => {
  it("stores the set under its generated id with the supplied instant", () => {
    const next = applyLogSet(makeState(), setInput, "set-abc", NOW);
    expect(next.sets["set-abc"]).toEqual({ ...setInput, id: "set-abc", loggedAt: NOW });
  });

  it("accepts loadKg 0 for a bodyweight set instead of dropping it", () => {
    // Master plan §8 / code review A60: 0 is a valid load, never falsy-dropped.
    const next = applyLogSet(makeState(), { ...setInput, loadKg: 0, exerciseId: "push-up" }, "set-bw", NOW);
    expect(next.sets["set-bw"]?.loadKg).toBe(0);
  });

  it("stores no derived values", () => {
    // Code review A28: the legacy froze exName, repsLo, repsHi, the suggestion
    // object and the lifetime-best object into every persisted set.
    const next = applyLogSet(makeState(), setInput, "set-abc", NOW);
    expect(Object.keys(next.sets["set-abc"] ?? {}).sort()).toEqual([
      "assignmentDate", "enteredUnit", "exerciseId", "durationS", "id", "isBonus",
      "loadKg", "loggedAt", "profileId", "reps", "rpe", "sessionId", "setNumber",
    ].sort());
  });

  it("rejects a negative load through the schema", () => {
    expect(() => applyLogSet(makeState(), { ...setInput, loadKg: -1 }, "set-bad", NOW)).toThrow(/loadKg|Invalid|greater/i);
  });

  it("rejects a non-finite load through the schema", () => {
    expect(() => applyLogSet(makeState(), { ...setInput, loadKg: Number.POSITIVE_INFINITY }, "set-inf", NOW)).toThrow();
  });
});

describe("applyDeleteSet / applyRestoreSet", () => {
  it("removes the set and returns it for the undo buffer", () => {
    const seeded = applyLogSet(makeState(), setInput, "set-abc", NOW);
    const { next, removed } = applyDeleteSet(seeded, "set-abc");
    expect(next.sets["set-abc"]).toBeUndefined();
    expect(removed?.id).toBe("set-abc");
  });

  it("returns null and leaves the state alone for an unknown id", () => {
    const state = makeState();
    const { next, removed } = applyDeleteSet(state, "nope");
    expect(removed).toBeNull();
    expect(next).toBe(state);
  });

  it("restores a removed set unchanged", () => {
    const seeded = applyLogSet(makeState(), setInput, "set-abc", NOW);
    const { next, removed } = applyDeleteSet(seeded, "set-abc");
    expect(removed).not.toBeNull();
    if (removed === null) return;
    expect(applyRestoreSet(next, removed).sets["set-abc"]).toEqual(removed);
  });
});

describe("applyLogBodyMass", () => {
  it("appends an entry and keeps the list ordered by date", () => {
    const first = applyLogBodyMass(makeState(), {
      profileId: "profile-1", date: "2026-03-09", massKg: 94.2,
      enteredUnit: "metric", bodyFatPct: null,
    }, "bm-2", NOW);
    const second = applyLogBodyMass(first, {
      profileId: "profile-1", date: "2026-03-02", massKg: 95,
      enteredUnit: "metric", bodyFatPct: null,
    }, "bm-1", NOW);
    expect(second.bodyMass["profile-1"]?.map((e) => e.date)).toEqual(["2026-03-02", "2026-03-09"]);
  });
});

describe("applyAddHydration", () => {
  it("creates the day entry and records the drink instant", () => {
    const next = applyAddHydration(makeState(), "profile-1", "2026-03-02", 250, NOW);
    expect(next.hydration["profile-1"]?.[0]).toEqual({
      profileId: "profile-1", date: "2026-03-02", volumeML: 250, marks: [NOW],
    });
  });

  it("accumulates volume and appends a mark on the same day", () => {
    const once = applyAddHydration(makeState(), "profile-1", "2026-03-02", 250, NOW);
    const twice = applyAddHydration(once, "profile-1", "2026-03-02", 250, NOW + 60_000);
    expect(twice.hydration["profile-1"]?.[0]?.volumeML).toBe(500);
    expect(twice.hydration["profile-1"]?.[0]?.marks).toEqual([NOW, NOW + 60_000]);
  });

  it("rejects a negative volume", () => {
    expect(() => applyAddHydration(makeState(), "profile-1", "2026-03-02", -100, NOW)).toThrow();
  });
});

describe("applyAddCustomExercise", () => {
  it("appends to the per-profile custom library", () => {
    const ex = makeExercise({ id: "9f0c1d2e-0000-4000-8000-000000000001", name: "Cable crunch", formCueId: null });
    const next = applyAddCustomExercise(makeState(), "profile-1", ex);
    expect(next.customExercises["profile-1"]).toEqual([ex]);
  });

  it("rejects an exercise with an empty name", () => {
    const ex = makeExercise({ name: "" });
    expect(() => applyAddCustomExercise(makeState(), "profile-1", ex)).toThrow();
  });

  it("keeps ids stable when an earlier custom exercise is removed", () => {
    // Code review A26: positional 1000 + i indices re-attributed logged sets.
    const a = makeExercise({ id: "id-a", name: "Cable crunch" });
    const b = makeExercise({ id: "id-b", name: "Face pull" });
    const withBoth = applyAddCustomExercise(applyAddCustomExercise(makeState(), "profile-1", a), "profile-1", b);
    const withoutA = {
      ...withBoth,
      customExercises: { "profile-1": (withBoth.customExercises["profile-1"] ?? []).filter((e) => e.id !== "id-a") },
    };
    expect(withoutA.customExercises["profile-1"]?.[0]?.id).toBe("id-b");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/store/training.test.ts`
Expected: FAIL — `Failed to resolve import "./training"`.

- [ ] **Step 3: Write the transformer module**

Create `src/store/training.ts`:

```ts
// Pure AppState transformers for the P4 actions. No React, no I/O, no
// localStorage: code review A41 makes the store the only writer, and this file
// is the only place that decides what a log action does to the document.
import { BodyMassEntrySchema, ExerciseSchema, HydrationEntrySchema, LoggedSetSchema } from "../domain/schema";
import { compareLocalDate } from "../domain/dates";
import type {
  AppState, BodyMassEntry, EpochMs, Exercise, LocalDate, LoggedSet, ML,
} from "../domain/types";

/** How long a deleted set stays restorable. */
export const UNDO_WINDOW_MS = 6_000;   // ms

function parseOrThrow<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { message: string } } }, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`${what} failed validation: ${result.error.message}`);
  return result.data;
}

export function applyLogSet(
  state: AppState,
  input: Omit<LoggedSet, "id" | "loggedAt">,
  id: string,
  now: EpochMs,
): AppState {
  // Only the §5 fields are stored. Code review A28: the legacy froze the
  // exercise name, both rep-range bounds, the suggestion and the lifetime best
  // into every set, roughly a 5x multiplier on the largest table in the store.
  const candidate: LoggedSet = { ...input, id, loggedAt: now };
  const set = parseOrThrow(LoggedSetSchema, candidate, "logSet");
  return { ...state, sets: { ...state.sets, [set.id]: set } };
}

export function applyDeleteSet(state: AppState, id: string): { next: AppState; removed: LoggedSet | null } {
  const removed = state.sets[id] ?? null;
  if (removed === null) return { next: state, removed: null };
  const sets = { ...state.sets };
  delete sets[id];
  return { next: { ...state, sets }, removed };
}

export function applyRestoreSet(state: AppState, set: LoggedSet): AppState {
  return { ...state, sets: { ...state.sets, [set.id]: set } };
}

export function applyLogBodyMass(
  state: AppState,
  input: Omit<BodyMassEntry, "id" | "loggedAt">,
  id: string,
  now: EpochMs,
): AppState {
  const entry = parseOrThrow(BodyMassEntrySchema, { ...input, id, loggedAt: now }, "logBodyMass");
  const existing = state.bodyMass[entry.profileId] ?? [];
  const merged = [...existing, entry].sort((a, b) => compareLocalDate(a.date, b.date));
  return { ...state, bodyMass: { ...state.bodyMass, [entry.profileId]: merged } };
}

export function applyAddHydration(
  state: AppState,
  profileId: string,
  date: LocalDate,
  volumeML: ML,
  now: EpochMs,
): AppState {
  const existing = state.hydration[profileId] ?? [];
  const current = existing.find((e) => e.date === date) ?? null;
  const candidate = {
    profileId,
    date,
    volumeML: (current?.volumeML ?? 0) + volumeML,        // mL, cumulative for the local day
    marks: [...(current?.marks ?? []), now],              // epoch ms UTC, one per drink
  };
  const entry = parseOrThrow(HydrationEntrySchema, candidate, "addHydration");
  const merged = current === null
    ? [...existing, entry]
    : existing.map((e) => (e.date === date ? entry : e));
  return { ...state, hydration: { ...state.hydration, [profileId]: merged } };
}

export function applyAddCustomExercise(state: AppState, profileId: string, ex: Exercise): AppState {
  // Code review A26: a stable generated id, never a positional index, or
  // deleting one custom exercise re-attributes another's logged sets.
  const exercise = parseOrThrow(ExerciseSchema, ex, "addCustomExercise");
  if (exercise.name.trim().length === 0) throw new Error("addCustomExercise failed validation: name is empty");
  const existing = state.customExercises[profileId] ?? [];
  return {
    ...state,
    customExercises: { ...state.customExercises, [profileId]: [...existing, exercise] },
  };
}
```

If `ExerciseSchema` does not already reject an empty `name`, tighten it there instead and delete the explicit check above; a schema rule is preferable to a hand-written one.

- [ ] **Step 4: Run the transformer tests to verify they pass**

Run: `npx vitest run src/store/training.test.ts`
Expected: PASS — 15 passed.

- [ ] **Step 5: Write the failing sessionStorage-mirror tests**

Create `src/store/sessionMirror.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { clearSessionMirror, EMPTY_SESSION, loadSessionMirror, saveSessionMirror } from "./sessionMirror";
import { startRest } from "../domain/training/restTimer";

const T0 = Date.UTC(2026, 2, 2, 18, 0, 0);   // epoch ms UTC

describe("sessionMirror", () => {
  beforeEach(() => { sessionStorage.clear(); });

  it("returns null when nothing was written", () => {
    expect(loadSessionMirror()).toBeNull();
  });

  it("round-trips a running rest timer", () => {
    const timer = startRest(90, T0);
    saveSessionMirror({ ...EMPTY_SESSION, restTimer: timer, activeAssignmentDate: "2026-03-02" });
    expect(loadSessionMirror()).toEqual({
      restTimer: timer, activeAssignmentDate: "2026-03-02", bonusExerciseIds: [],
    });
  });

  it("never mirrors the undo buffer", () => {
    saveSessionMirror({
      ...EMPTY_SESSION,
      undo: {
        set: {
          id: "s", profileId: "p", assignmentDate: "2026-03-02", sessionId: "x",
          exerciseId: "e", setNumber: 1, isBonus: false, loadKg: 60,
          enteredUnit: "metric", reps: 8, durationS: null, rpe: null, loggedAt: T0,
        },
        expiresAt: T0 + 6_000,
      },
    });
    const raw = sessionStorage.getItem("fti.session.v3") ?? "";
    expect(raw).not.toContain("undo");
    expect(loadSessionMirror()?.restTimer).toBeNull();
  });

  it("returns null for corrupt JSON instead of throwing", () => {
    sessionStorage.setItem("fti.session.v3", "{not json");
    expect(loadSessionMirror()).toBeNull();
  });

  it("returns null for a structurally invalid payload", () => {
    sessionStorage.setItem("fti.session.v3", JSON.stringify({ restTimer: { startedAt: "soon" } }));
    expect(loadSessionMirror()).toBeNull();
  });

  it("clears the mirror", () => {
    saveSessionMirror({ ...EMPTY_SESSION, activeAssignmentDate: "2026-03-02" });
    clearSessionMirror();
    expect(loadSessionMirror()).toBeNull();
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/store/sessionMirror.test.ts`
Expected: FAIL — `Failed to resolve import "./sessionMirror"`.

- [ ] **Step 7: Write the session mirror**

Create `src/store/sessionMirror.ts`:

```ts
// The non-persisted session slice, mirrored to sessionStorage so a reload
// mid-session keeps the rest timer running. sessionStorage, not localStorage:
// this state is scoped to one tab and one session and must not outlive it.
import { z } from "zod";
import type { EpochMs, LocalDate, LoggedSet } from "../domain/types";
import type { RestTimer } from "../domain/training/restTimer";

const SESSION_KEY = "fti.session.v3";

export interface PendingUndo {
  set: LoggedSet;
  expiresAt: EpochMs;   // epoch ms UTC
}

export interface SessionState {
  restTimer: RestTimer | null;
  activeAssignmentDate: LocalDate | null;
  /** Exercises added to today's session beyond the plan; sets carry isBonus. */
  bonusExerciseIds: string[];
  /** Six-second delete buffer. Deliberately NOT mirrored. */
  undo: PendingUndo | null;
}

export const EMPTY_SESSION: SessionState = {
  restTimer: null,
  activeAssignmentDate: null,
  bonusExerciseIds: [],
  undo: null,
};

const MirrorSchema = z.object({
  restTimer: z.object({
    startedAt: z.number().int().finite(),   // epoch ms UTC
    endsAt: z.number().int().finite(),      // epoch ms UTC
    durationS: z.number().nonnegative().finite(),   // s
  }).nullable(),
  activeAssignmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  bonusExerciseIds: z.array(z.string()).max(50),
});

export type SessionMirror = z.infer<typeof MirrorSchema>;

export function loadSessionMirror(): SessionMirror | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw === null) return null;
    const parsed = MirrorSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // sessionStorage can throw in private mode or when the tab is partitioned.
    // The only cost is that the timer does not survive a reload.
    return null;
  }
}

export function saveSessionMirror(s: SessionState): void {
  const mirror: SessionMirror = {
    restTimer: s.restTimer,
    activeAssignmentDate: s.activeAssignmentDate,
    bonusExerciseIds: s.bonusExerciseIds,
  };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(mirror));
  } catch {
    return;
  }
}

export function clearSessionMirror(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    return;
  }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/store/sessionMirror.test.ts`
Expected: PASS — 6 passed.

- [ ] **Step 9: Wire the actions into `src/store/index.ts`**

Add the imports at the top of `src/store/index.ts`:

```ts
import { newId } from "../domain/ids";
import type { RestTimer } from "../domain/training/restTimer";
import {
  applyAddCustomExercise, applyAddHydration, applyDeleteSet, applyLogBodyMass,
  applyLogSet, applyRestoreSet, UNDO_WINDOW_MS,
} from "./training";
import {
  clearSessionMirror, EMPTY_SESSION, loadSessionMirror, saveSessionMirror,
  type SessionState,
} from "./sessionMirror";
```

Replace the `session` initialiser in the store's initial state (P1 created it as `session: { restTimer: null, activeAssignmentDate: null }`) with:

```ts
  session: { ...EMPTY_SESSION, ...(loadSessionMirror() ?? {}) } satisfies SessionState,
```

Add these actions to the object returned by the store creator, immediately after the last P3 action (`closeWeeks`):

```ts
  // ---- P4 ----
  logSet(input, now) {
    const id = newId();
    set((s) => ({ ...s, state: applyLogSet(s.state, input, id, now) }));
    return id;
  },
  deleteSet(id) {
    set((s) => {
      const { next, removed } = applyDeleteSet(s.state, id);
      if (removed === null) return s;
      const session: SessionState = { ...s.session, undo: { set: removed, expiresAt: Date.now() + UNDO_WINDOW_MS } };
      saveSessionMirror(session);
      return { ...s, state: next, session };
    });
  },
  undoDelete() {
    set((s) => {
      const pending = s.session.undo;
      if (pending === null || Date.now() > pending.expiresAt) {
        const cleared: SessionState = { ...s.session, undo: null };
        return { ...s, session: cleared };
      }
      const session: SessionState = { ...s.session, undo: null };
      saveSessionMirror(session);
      return { ...s, state: applyRestoreSet(s.state, pending.set), session };
    });
  },
  logBodyMass(entry, now) {
    set((s) => ({ ...s, state: applyLogBodyMass(s.state, entry, newId(), now) }));
  },
  addHydration(profileId, date, volumeML, now) {
    set((s) => ({ ...s, state: applyAddHydration(s.state, profileId, date, volumeML, now) }));
  },
  setRestTimer(t: RestTimer | null) {
    set((s) => {
      const session: SessionState = { ...s.session, restTimer: t };
      saveSessionMirror(session);
      return { ...s, session };
    });
  },
  addCustomExercise(profileId, ex) {
    set((s) => ({ ...s, state: applyAddCustomExercise(s.state, profileId, ex) }));
  },
  addBonusExercise(exerciseId: string) {
    set((s) => {
      if (s.session.bonusExerciseIds.includes(exerciseId)) return s;
      const session: SessionState = { ...s.session, bonusExerciseIds: [...s.session.bonusExerciseIds, exerciseId] };
      saveSessionMirror(session);
      return { ...s, session };
    });
  },
```

Extend the `AppActions` interface in `src/domain/types.ts` or wherever P1 declared it (master plan §6.7 already lists the first five; add the three new ones):

```ts
  // P4
  logSet(set: Omit<LoggedSet, "id" | "loggedAt">, now: EpochMs): string;
  deleteSet(id: string): void;
  undoDelete(): void;
  logBodyMass(e: Omit<BodyMassEntry, "id" | "loggedAt">, now: EpochMs): void;
  addHydration(profileId: string, date: LocalDate, volumeML: ML, now: EpochMs): void;
  setRestTimer(t: RestTimer | null): void;
  addCustomExercise(profileId: string, ex: Exercise): void;
  addBonusExercise(exerciseId: string): void;
```

Finally, extend P3's `completeSession` action so it clears the session slice. Add these two lines at the end of its `set` callback, keeping everything P3 already does:

```ts
      clearSessionMirror();
      return { ...updated, session: EMPTY_SESSION };
```

- [ ] **Step 10: Add the selectors**

Append to `src/store/selectors.ts`:

```ts
import { useMemo } from "react";
import { todayLocal } from "../domain/dates";
import { sortSetHistory } from "../domain/training/progression";
import type { LoggedSet } from "../domain/types";
import { useAppStore } from "./index";

/**
 * Every logged set for one exercise and the active profile, in programme order
 * (assignmentDate, setNumber). The raw `sets` record is selected first because
 * it is a stable reference; deriving inside useMemo avoids returning a new array
 * from the Zustand selector on every render, which Zustand 5 would treat as a
 * changed snapshot and loop on.
 */
export function useExerciseHistory(exerciseId: string): LoggedSet[] {
  const sets = useAppStore((s) => s.state.sets);
  const profileId = useAppStore((s) => s.state.activeProfileId);
  return useMemo(() => {
    if (profileId === null) return [];
    return sortSetHistory(
      Object.values(sets).filter((x) => x.profileId === profileId && x.exerciseId === exerciseId),
    );
  }, [sets, profileId, exerciseId]);
}

/** Every set logged against today's assignment date for the active profile. */
export function useTodaysSets(): LoggedSet[] {
  const sets = useAppStore((s) => s.state.sets);
  const profileId = useAppStore((s) => s.state.activeProfileId);
  const timezone = useAppStore((s) => (s.state.activeProfileId === null ? null : s.state.profiles[s.state.activeProfileId]?.timezone ?? null));
  const activeDate = useAppStore((s) => s.session.activeAssignmentDate);
  return useMemo(() => {
    if (profileId === null || timezone === null) return [];
    const date = activeDate ?? todayLocal(timezone);
    return sortSetHistory(
      Object.values(sets).filter((x) => x.profileId === profileId && x.assignmentDate === date),
    );
  }, [sets, profileId, timezone, activeDate]);
}
```

- [ ] **Step 11: Run the whole suite, lint and type check**

Run: `npm test && npx tsc --noEmit && npx eslint src/store`
Expected: PASS, no type errors, no lint output.

- [ ] **Step 12: Commit**

```bash
git add src/store/training.ts src/store/training.test.ts src/store/sessionMirror.ts src/store/sessionMirror.test.ts src/store/index.ts src/store/selectors.ts src/domain/types.ts
git commit -m "feat: set logging, undo buffer, hydration and rest-timer session slice"
```

---

### Task 7: Form cues, corrected

**Files:**
- Create: `src/content/formCues.ts`
- Test: `src/content/formCues.test.ts`

**Interfaces:**
- Consumes: `EXERCISES` from `../domain/plan/library`.
- Produces:
  ```ts
  export interface FormCue {
    setup: string[]; execution: string[]; mistakes: string[];
    tip: string | null; caution: string | null;
  }
  export const FORM_CUES: Record<string, FormCue>;
  export const WARMUP_NOTICE: string;
  ```

**Every change the content peer review §6 demanded, and where it lands.**

| Review row | Legacy text | Change made here |
| --- | --- | --- |
| No warm-up anywhere | — | `WARMUP_NOTICE` added and rendered above the exercise stack (Task 10). The review supplies no sourced protocol and the global constraints forbid unsourced numbers, so the notice prescribes no sets, loads or durations. A sourced protocol and a pre-participation screen are requested as a P2 amendment. |
| Heavy row permits "cheat" reps | "you can use a slight cheat / TnT"; "5-6 reps, slightly cheaty TnT is fine here" | Both deleted. The strict standard is kept, matching the same file's own "Rounding lower back → injury" mistake line. |
| Valsalva without caveat | "Big breath HELD throughout the rep" | Cue kept; `caution` added naming the arterial-pressure response and gating on the screening step. |
| Leg press ROM cap | "Lower until knees ~90°... STOP at 90°" | Replaced by the lumbar limit the cue already named: stop when the lower back leaves the pad. |
| "Never lock out" | "Locking knees fully at the top → joint stress" | Restated as "do not slam into extension"; the folklore injury claim is gone. |
| Knee valgus → "ACL strain" | "Knees caving inward → ACL strain" | Correction kept ("push the knees out"); the injury attribution softened to an association observed in landing and cutting tasks. |
| Weighted pull-up equivalence | "1 weighted pull-up at +20 kg ≈ 5-7 bodyweight pull-ups" | Deleted (no source located). |
| Knee push-ups "don't transfer" | "Knee push-ups train a different pattern and don't transfer well" | Deleted; knee push-ups are named as a legitimate load regression (Ebben 2011 measured 49 % of body mass). |
| Push press +20 % | "~20% more weight than strict press" | COULD NOT VERIFY, so the number is deleted; the directional statement remains. |
| Stair-climber rails −30 % | "reduces calorie burn ~30%" | COULD NOT VERIFY, number deleted; the direction remains. |
| Rower "legs do 60%" | "Legs do 60%." | COULD NOT VERIFY, number deleted; the drive sequence remains. |
| Form-cue key mismatch | `"Leg press → Bulgarian split"` vs `"Leg press → Bulgarian split squat"` | Structurally impossible now: cues are keyed by exercise id and the test in Step 1 fails if a key does not resolve. |

Three legacy combined entries are also split, because a generic library has one id per movement: `"Pull-ups (or lat pulldown)"` → `pull-up` + `lat-pulldown`; `"Leg press → Bulgarian split squat"` → `leg-press` + `bulgarian-split-squat`; `"Trap bar DL → conventional"` → `trap-bar-deadlift` + `conventional-deadlift`. The rest-day pseudo-entry `"No training"` is dropped; it is not an exercise.

Tone across all 31 entries is normalised to the global constraint: no hype, no superlatives, no emoji. "brutally effective per joule of effort", "the king of upper-body strength" and "the hardest ab exercise that exists" are gone; "per joule" is also not a quantity this literature reports (content review §5, c002).

- [ ] **Step 1: Write the failing form-cue tests**

Create `src/content/formCues.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXERCISES } from "../domain/plan/library";
import { FORM_CUES, WARMUP_NOTICE } from "./formCues";

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

describe("FORM_CUES", () => {
  it("keys every cue to an exercise that exists in the library", () => {
    const orphans = Object.keys(FORM_CUES).filter((id) => !byId.has(id));
    expect(orphans).toEqual([]);
  });

  it("gives every cue a non-empty setup, execution and mistakes list", () => {
    for (const [id, cue] of Object.entries(FORM_CUES)) {
      expect(cue.setup.length, `${id} setup`).toBeGreaterThan(0);
      expect(cue.execution.length, `${id} execution`).toBeGreaterThan(0);
      expect(cue.mistakes.length, `${id} mistakes`).toBeGreaterThan(0);
    }
  });

  it("carries a Valsalva caution on the back squat", () => {
    expect(FORM_CUES["barbell-back-squat"]?.caution).toMatch(/arterial pressure/i);
  });

  it("ships no unverifiable number from the content review §6", () => {
    const all = JSON.stringify(FORM_CUES) + WARMUP_NOTICE;
    expect(all).not.toMatch(/20\s*%\s*more weight/i);   // push press
    expect(all).not.toMatch(/30\s*%/);                  // stair-climber rails
    expect(all).not.toMatch(/legs do 60/i);             // rower
    expect(all).not.toMatch(/5-7 bodyweight pull-ups/i);
  });

  it("does not sanction cheat reps on the heavy row", () => {
    const row = JSON.stringify(FORM_CUES["barbell-row"]);
    expect(row).not.toMatch(/cheat|TnT/i);
  });

  it("does not claim knee push-ups fail to transfer", () => {
    expect(JSON.stringify(FORM_CUES["push-up"])).not.toMatch(/don't transfer|do not transfer/i);
  });

  it("caps leg-press depth by lumbar position, not by a fixed angle", () => {
    const legPress = JSON.stringify(FORM_CUES["leg-press"]);
    expect(legPress).not.toMatch(/STOP at 90/i);
    expect(legPress).toMatch(/lower back|lumbar/i);
  });

  it("prescribes no numbers in the warm-up notice", () => {
    expect(WARMUP_NOTICE).not.toMatch(/\d/);
  });

  it("contains no medication, stimulant or personal content", () => {
    expect(JSON.stringify(FORM_CUES)).not.toMatch(/vyvanse|lisdexamfetamine|amphetamine/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/content/formCues.test.ts`
Expected: FAIL — `Failed to resolve import "./formCues"`.

- [ ] **Step 3: Write the form-cue content**

Create `src/content/formCues.ts`:

```ts
// Form cues, ported from the legacy console-content.js FORM_CUES with every
// correction the content peer review §6 required. Keyed by Exercise.id, never
// by name: the legacy keyed by name and one key drifted, so that exercise
// silently had no cues at all (review §6, last row).
export interface FormCue {
  setup: string[];
  execution: string[];
  mistakes: string[];
  tip: string | null;
  /** Safety note gated on the pre-participation screen; rendered in red. */
  caution: string | null;
}

/**
 * Content peer review §6, first row: the legacy programme prescribed heavy
 * barbell work with no warm-up protocol, no readiness screening, no
 * injury-history intake and no contraindication language anywhere. The review
 * requires both a warm-up protocol and a pre-participation screen but supplies
 * no sourced protocol, and the global constraints forbid shipping an unsourced
 * number. This notice therefore states the requirement without prescribing sets,
 * loads or durations. A sourced protocol and a screening questionnaire are
 * requested as a P2 amendment.
 */
export const WARMUP_NOTICE =
  "Warm up before the first working set of each compound lift: general aerobic work, then progressively loaded ramp-up sets. Seek medical clearance before training if you have a cardiovascular, metabolic or renal condition, or symptoms that suggest one.";

export const FORM_CUES: Record<string, FormCue> = {
  "barbell-bench-press": {
    setup: [
      "Eyes under the bar. Shoulder blades squeezed together and down toward the back pockets.",
      "Feet flat, slight arch in the lower back, glutes in contact with the bench throughout.",
      "Grip just outside shoulder width, forearms vertical at the bottom.",
    ],
    execution: [
      "Pull the bar out of the rack rather than pressing it up. Hold it locked.",
      "Lower under control to the lower chest and touch lightly.",
      "Drive the feet into the floor and press in a slight arc up and back toward the rack.",
    ],
    mistakes: [
      "Elbows flared to 90 degrees from the torso: shoulder impingement risk. Tuck to about 70.",
      "Bouncing the bar off the chest: pause briefly instead.",
      "Lower back flat and glutes off the bench: loses leg drive and shoulder position.",
      "Bar drifting up the chest during the press: press up and back.",
    ],
    tip: "If the shoulders fatigue before the chest, the scapulae are not retracted enough.",
    caution: null,
  },
  "overhead-press-barbell": {
    setup: [
      "Bar in the front rack on the shelf of the upper chest, elbows under the bar, wrists straight.",
      "Stance hip-width, glutes and abdominals braced. Rib cage stacked over the pelvis.",
      "Grip just outside the shoulders, forearms vertical when viewed from the side.",
    ],
    execution: [
      "Press straight up. As the bar passes the face, shrug and move the head through.",
      "Lock out over the mid-foot with the biceps near the ears.",
      "Lower under control to the front rack. Reset the breath each rep on heavy sets.",
    ],
    mistakes: [
      "Hyperextending the lower back: brace the abdominals and squeeze the glutes.",
      "Pushing the bar forward instead of up: the bar must travel vertically.",
      "Not shrugging at lockout: leaves the upper trapezius disengaged.",
      "Flaring the elbows wide: use roughly a 30 degree elbow angle.",
    ],
    tip: "Think of pushing the body down past the bar rather than pushing the bar up.",
    caution: null,
  },
  "incline-db-press": {
    setup: [
      "Bench at about 30 degrees. Above 45 degrees the movement becomes a shoulder press.",
      "Feet flat. Retract the shoulder blades while sitting down.",
      "Kick the dumbbells onto the thighs, then back and down into the start position.",
    ],
    execution: [
      "Start with the arms locked, palms facing slightly inward.",
      "Lower under control with the elbows about 45 degrees from the torso.",
      "Press up and slightly together without letting the bells collide.",
    ],
    mistakes: [
      "Bench too steep: recruits the front deltoids and removes the upper chest.",
      "Elbows flared to 90 degrees: shoulder strain. Keep 45 to 60 degrees.",
      "Dumbbells drifting apart at the top: loses chest tension.",
      "Bouncing off the chest or stopping short: use the full range under control.",
    ],
    tip: "The upper chest responds better to controlled eccentrics than to added load.",
    caution: null,
  },
  "lateral-raise": {
    setup: [
      "Dumbbells at the sides, a slight elbow bend held constant for the whole set.",
      "Lean forward slightly from the hips. Ribs stacked over the pelvis.",
      "Little fingers slightly higher than the thumbs.",
    ],
    execution: [
      "Raise the arms out to the side, leading with the elbows.",
      "Stop at shoulder height; higher trades deltoid work for trapezius.",
      "Lower slowly. The eccentric carries the stimulus.",
    ],
    mistakes: [
      "Swinging the torso: removes the deltoid work.",
      "Lifting above shoulder height: recruits the trapezius and upper back.",
      "Thumbs higher than the little fingers: internally rotates and shifts load to the front deltoid.",
      "Load too heavy for strict form.",
    ],
    tip: "This is not a strength lift. Choose a load that allows strict repetitions across the prescribed range.",
    caution: null,
  },
  "triceps-overhead-extension": {
    setup: [
      "Hold one dumbbell with both hands cupping the top plate.",
      "Press it overhead with the elbows close to the ears and the upper arms near vertical.",
      "Ribs stacked over the pelvis, slight knee bend if standing.",
    ],
    execution: [
      "Lower the weight behind the head with the elbows tracking forward.",
      "Reach a deep stretch: the long head requires the lengthened position.",
      "Extend at the elbow only. The shoulder does not move.",
    ],
    mistakes: [
      "Elbows flaring outward: loses the long-head stretch.",
      "Stopping short of the stretch.",
      "Hyperextending the lumbar spine: anchor the torso with abdominals and glutes.",
      "Load too heavy for a small joint to control.",
    ],
    tip: "The long head of the triceps is only loaded in the stretched position with the shoulder flexed.",
    caution: null,
  },
  "pull-up": {
    setup: [
      "Grip slightly wider than the shoulders, palms forward.",
      "Hang with the shoulders depressed, away from the ears.",
      "Cross the ankles or tuck the feet to prevent kipping.",
    ],
    execution: [
      "Pull the elbows down toward the ribcage.",
      "Bring the collarbone, not the chin, toward the bar.",
      "Lower under control until the elbows are fully extended.",
    ],
    mistakes: [
      "Kipping or swinging the legs: use band assistance instead.",
      "Partial repetitions from the top: no full latissimus engagement.",
      "Pulling with the biceps: drive the elbows.",
      "Shrugging at the bottom: keep the shoulders depressed.",
    ],
    tip: "If a full repetition is not yet available, use controlled eccentrics from the top position.",
    caution: null,
  },
  "lat-pulldown": {
    setup: [
      "Thighs secured under the pad, feet flat.",
      "Grip slightly wider than the shoulders, palms forward.",
      "Chest up, shoulders depressed before the first repetition.",
    ],
    execution: [
      "Pull the bar to the upper chest by driving the elbows down.",
      "Hold the contracted position briefly.",
      "Return under control to a full stretch without letting the shoulders shrug.",
    ],
    mistakes: [
      "Leaning far back and turning it into a row.",
      "Pulling behind the neck: unnecessary shoulder external rotation under load.",
      "Letting the weight stack pull the shoulders up at the top.",
      "Partial range at either end.",
    ],
    tip: "The pulldown is the load-adjustable regression of the pull-up; the movement pattern is the same.",
    caution: null,
  },
  "barbell-row-pendlay": {
    setup: [
      "Bar over the mid-foot. Hinge to a flat back with the torso parallel to the floor.",
      "Grip shoulder width, overhand. The bar resets on the floor each repetition.",
      "Brace hard. The back is flat, neither rounded nor extended.",
    ],
    execution: [
      "Pull the bar to the lower chest or upper abdomen.",
      "Pull the elbows back rather than up. Squeeze the shoulder blades together.",
      "Lower under control to the floor, pause, reset, repeat.",
    ],
    mistakes: [
      "Standing up during the pull: turns it into a partial deadlift.",
      "Pulling to the navel: loses upper-back work.",
      "Rounding the lower back: reset the position every repetition.",
      "Load too heavy for a strict movement.",
    ],
    tip: "The dead-stop reset is what keeps the position honest between repetitions.",
    caution: null,
  },
  "barbell-row": {
    setup: [
      "Bar over the mid-foot. Hinge to a flat back at 35 to 45 degrees from horizontal.",
      "Grip shoulder width, overhand. Knees soft.",
      "Brace hard before the first repetition.",
    ],
    execution: [
      "Pull the bar to the lower chest or upper abdomen with strict form.",
      "Drive the elbows back and squeeze the shoulder blades.",
      "Lower under control. Stop the set when the torso angle starts to rise.",
    ],
    mistakes: [
      "Standing up through the pull: the torso angle stays fixed.",
      "Rounding the lower back: reduce the load.",
      "Letting the bar drift forward: keep the pull line vertical.",
      "Pulling with the hands rather than driving the elbows.",
    ],
    tip: "Stop the set at the first repetition that needs body English; the strict standard applies at every load.",
    caution: null,
  },
  "db-single-arm-row": {
    setup: [
      "One knee and one hand on the bench, the other foot planted.",
      "Back flat, torso parallel to the floor.",
      "The dumbbell hangs directly below the shoulder with the arm extended.",
    ],
    execution: [
      "Pull the dumbbell toward the hip, not the chest.",
      "Drive the elbow back along the ribs.",
      "Squeeze at the top and lower slowly to a full stretch.",
    ],
    mistakes: [
      "Twisting the torso to move the weight.",
      "Pulling to chest level: the biceps take over.",
      "Rushing the eccentric.",
      "Letting the shoulder shrug at the bottom.",
    ],
    tip: "Allow the shoulder blade to travel forward at the bottom; the stretch is what loads the latissimus.",
    caution: null,
  },
  "face-pull": {
    setup: [
      "Cable at face height with a rope attachment.",
      "Grip with the thumbs pointing back toward the body. Step back to load the cable.",
      "Staggered stance if stability is needed.",
    ],
    execution: [
      "Pull the rope to the face, not the chest.",
      "Externally rotate at the end range so the thumbs finish behind the ears.",
      "Hold the contracted position briefly, then return slowly.",
    ],
    mistakes: [
      "Pulling to the chest: becomes a horizontal row and misses the external rotators.",
      "Skipping the external rotation.",
      "Load too heavy, bringing the trapezius in.",
      "Hunching forward.",
    ],
    tip: "Light load, high repetitions, every pulling session.",
    caution: null,
  },
  "barbell-curl": {
    setup: [
      "Feet hip width, bar at the thighs, grip shoulder width, palms up.",
      "Shoulder blades slightly retracted, elbows against the ribs.",
      "Brace to prevent torso swing.",
    ],
    execution: [
      "Curl by flexing at the elbow only.",
      "Bring the bar to the upper chest and hold briefly.",
      "Lower slowly to full extension.",
    ],
    mistakes: [
      "Swinging the torso: reduce the load.",
      "Elbows travelling forward or shoulders shrugging: recruits the front deltoid.",
      "Stopping short of full extension.",
      "Locking the wrists into extension.",
    ],
    tip: "An EZ bar is biomechanically equivalent for the biceps and easier on the wrists.",
    caution: null,
  },
  "hammer-curl": {
    setup: [
      "Dumbbells at the sides, palms facing each other.",
      "Elbows against the ribs, standing tall.",
      "Slight knee bend, abdominals braced.",
    ],
    execution: [
      "Curl with the palms staying neutral throughout.",
      "Bring the dumbbell to shoulder height and hold briefly.",
      "Lower under control without swinging.",
    ],
    mistakes: [
      "Rotating to palms-up at the top: that is a supinated curl.",
      "Swinging the body.",
      "Stopping short of the full range.",
      "Elbows drifting forward.",
    ],
    tip: "The neutral grip loads the brachialis and brachioradialis, which a supinated curl underworks.",
    caution: null,
  },
  "barbell-back-squat": {
    setup: [
      "Bar on the mid-trapezius (low bar) or the front of the trapezius (high bar). Choose one and keep it.",
      "Stance shoulder width, toes turned out 15 to 30 degrees.",
      "Brace the abdominals. Big breath held throughout the repetition.",
    ],
    execution: [
      "Sit down and back, knees tracking over the toes.",
      "Descend to at least parallel: hip crease below the top of the knee.",
      "Drive through the whole foot and stand tall.",
    ],
    mistakes: [
      "Knees caving inward: push the knees out. Dynamic valgus is associated with knee injury in landing and cutting tasks, so correct it, but a squat knee cave is not itself evidence of ligament strain.",
      "Looking up or far forward: keep a neutral spine.",
      "Stopping above parallel.",
      "Lower back rounding at the bottom: work on hip mobility and do not descend beyond the position you can hold.",
    ],
    tip: "Film from the side. The back angle should stay approximately constant through the lift.",
    caution: "The held breath raises arterial pressure sharply. Complete the pre-participation screen before training heavy with a braced breath hold, and seek medical clearance if you have hypertension or another cardiovascular risk factor.",
  },
  "romanian-deadlift": {
    setup: [
      "Bar at the hip crease, grip shoulder width.",
      "Soft knee bend, held in that position for the whole set.",
      "Shoulder blades back, chest up, abdominals braced.",
    ],
    execution: [
      "Push the hips back.",
      "Lower the bar along the thighs and shins, keeping it in contact with the body.",
      "Descend until the hamstrings reach a strong stretch, then drive the hips forward to stand.",
    ],
    mistakes: [
      "Bending the knees further during the repetition: that is a deadlift.",
      "Rounding the lower back: stop at the end of your own hamstring range.",
      "Letting the bar drift away from the body.",
      "Hyperextending at the top: stand tall with the glutes squeezed.",
    ],
    tip: "This is a hip hinge, not a knee bend. If the knees travel forward, reset.",
    caution: null,
  },
  "leg-press": {
    setup: [
      "Sit firmly with the lower back pressed into the pad.",
      "Feet shoulder width on the platform.",
      "Brace before releasing the safeties.",
    ],
    execution: [
      "Lower until the lower back begins to leave the pad, and no further.",
      "Drive through the whole foot.",
      "Extend without slamming into the end range.",
    ],
    mistakes: [
      "Descending past the point where the lower back peels off the pad: that is the real depth limit, not a fixed knee angle.",
      "Slamming into full extension at the top.",
      "Bouncing out of the bottom.",
      "Load too heavy to control the eccentric.",
    ],
    tip: "Depth is limited by the lumbar spine, not by an angle read off the machine.",
    caution: null,
  },
  "bulgarian-split-squat": {
    setup: [
      "Rear foot elevated behind you on a bench.",
      "Front foot far enough forward that the knee tracks over the ankle at the bottom.",
      "Brace the core, stand tall.",
    ],
    execution: [
      "Lower straight down; the front knee bends and the rear leg follows.",
      "Descend until the front thigh is at least parallel.",
      "Drive through the front heel to stand.",
    ],
    mistakes: [
      "Front knee travelling far past the toes: move the front foot forward.",
      "Driving off the rear foot: that is a lunge.",
      "Torso collapsing forward.",
      "Losing balance from a stance that is too narrow.",
    ],
    tip: "Unilateral loading exposes side-to-side differences that a bilateral squat hides.",
    caution: null,
  },
  "leg-curl-machine": {
    setup: [
      "Lying or seated. The pad sits just above the heel.",
      "Hips anchored against the pad.",
      "Choose a load that allows the full range.",
    ],
    execution: [
      "Curl the heels toward the glutes and hold the contracted position briefly.",
      "Lower slowly to a full stretch.",
      "Keep the hips down throughout.",
    ],
    mistakes: [
      "Lifting the hips off the pad to move the weight.",
      "Partial repetitions.",
      "No eccentric control.",
      "Changing ankle position between repetitions: pick dorsiflexed or plantarflexed and keep it.",
    ],
    tip: "Knee flexion work balances the quadriceps-dominant pattern of squats and presses.",
    caution: null,
  },
  "calf-raise": {
    setup: [
      "Balls of the feet on the edge of a step or platform, heels free.",
      "Stand tall with a slight knee bend.",
      "Hold something for balance if standing.",
    ],
    execution: [
      "Rise as high as the ankle allows.",
      "Hold the top position briefly.",
      "Lower slowly until the calves reach a deep stretch.",
    ],
    mistakes: [
      "Bouncing through repetitions.",
      "Short range: the heel must drop below the platform.",
      "Bending the knees mid-repetition: shifts load from the gastrocnemius to the soleus.",
      "Load too heavy to complete the range.",
    ],
    tip: "Range and controlled eccentrics matter more here than added load.",
    caution: null,
  },
  "push-up": {
    setup: [
      "Hands under the shoulders, slightly wider than shoulder width.",
      "Head, hips and heels in one line.",
      "Abdominals braced, glutes squeezed.",
    ],
    execution: [
      "Lower until the chest is just off the floor.",
      "Elbows about 45 degrees from the torso, not flared to 90.",
      "Press up and lock out the arms.",
    ],
    mistakes: [
      "Hips sagging: brace harder.",
      "Hips high: reduces the load.",
      "Elbows flared to 90 degrees.",
      "Partial repetitions.",
    ],
    tip: "To regress, elevate the hands on a bench, or drop to the knees; both are load regressions of the same movement pattern and both transfer.",
    caution: null,
  },
  "trap-bar-deadlift": {
    setup: [
      "Stand inside the trap bar and grip the handles with a neutral grip.",
      "Hinge to a flat back, chest up, abdominals braced hard.",
      "Weight balanced over the mid-foot.",
    ],
    execution: [
      "Push the floor away, driving through the whole foot.",
      "Hips and shoulders rise together.",
      "Stand tall and squeeze the glutes without hyperextending.",
    ],
    mistakes: [
      "Hips rising first: turns the lift into a stiff-legged pull.",
      "Rounding the lower back at the bottom: reset or reduce the load.",
      "Letting the handles drift forward.",
      "Hyperextending at lockout.",
    ],
    tip: "The trap bar shifts the load line and reduces the hip moment relative to a straight bar (Swinton 2011); it is a different loading pattern, not an easier one.",
    caution: null,
  },
  "conventional-deadlift": {
    setup: [
      "Bar over the mid-foot, shins close to the bar.",
      "Grip just outside the knees.",
      "Hinge to a flat back, chest up, abdominals braced hard.",
    ],
    execution: [
      "Push the floor away; hips and shoulders rise together.",
      "Keep the bar in contact with the legs the whole way up.",
      "Lock out by standing tall and squeezing the glutes.",
    ],
    mistakes: [
      "Hips shooting up first.",
      "Rounding the lower back: stop the set and reset.",
      "Bar drifting forward of the mid-foot.",
      "Hyperextending at the top.",
    ],
    tip: "Lower in reverse: push the hips back first, then bend the knees once the bar passes them.",
    caution: null,
  },
  "weighted-pull-up": {
    setup: [
      "Load with a dip belt, a plate between the feet, or a weighted vest.",
      "Same grip and hang as an unloaded pull-up.",
      "Hang with the shoulders depressed.",
    ],
    execution: [
      "Pull the elbows down; bring the collarbone toward the bar.",
      "Lower under control rather than dropping.",
      "Reset between repetitions if position is lost.",
    ],
    mistakes: [
      "Adding load faster than form allows.",
      "Partial repetitions from the top.",
      "Kipping the final repetitions: leave them undone and log honestly.",
      "Dropping out of the bottom position.",
    ],
    tip: "Add load in the smallest increment your equipment allows; this lift has a short useful rep range.",
    caution: null,
  },
  "close-grip-bench-press": {
    setup: [
      "Grip about shoulder width. Narrower than that loads the wrists without adding triceps work.",
      "Feet planted, slight arch, shoulder blades retracted.",
      "Forearms vertical at the bottom.",
    ],
    execution: [
      "Lower the bar to the lower chest.",
      "Elbows tucked to about 30 degrees from the torso.",
      "Press, driving the lockout with the triceps.",
    ],
    mistakes: [
      "Grip too narrow: wrist strain with no added benefit.",
      "Elbows flared: that is a standard bench press.",
      "Lowering to the upper chest: recruits the shoulders.",
      "Bouncing off the chest.",
    ],
    tip: "This is the highest-load triceps movement available and carries over to bench lockout strength.",
    caution: null,
  },
  "push-press": {
    setup: [
      "Bar in the front rack, as for the overhead press.",
      "Stance hip width, feet flat.",
      "Abdominals braced, glutes squeezed.",
    ],
    execution: [
      "Quick quarter-squat dip with the knees forward and the torso upright.",
      "Drive up explosively so the leg drive transfers into the bar.",
      "Finish with arm extension and lock out overhead.",
    ],
    mistakes: [
      "Dipping with the torso leaning forward: dumps the bar forward.",
      "A slow dip: loses the elastic contribution.",
      "Pressing forward rather than straight up.",
      "Not finishing the press with the arms.",
    ],
    tip: "The leg drive lets you handle more load than a strict press, which is why it is programmed for overhead strength rather than as a pressing substitute.",
    caution: null,
  },
  "rower-intervals": {
    setup: [
      "Feet strapped in, balls of the feet against the pad.",
      "Damper setting in the middle of the range.",
      "Grip the handle overhand, just outside the knees.",
    ],
    execution: [
      "Drive order: legs, then back, then arms.",
      "Return order: arms, then back, then legs.",
      "Pull the handle to the sternum with a slight backward lean.",
    ],
    mistakes: [
      "Pulling with the arms first: the legs initiate the drive.",
      "Slamming the back open at the catch.",
      "Bending the knees too early on the return: the seat catches the hands.",
      "Pulling to the chin: keep the finish at the sternum.",
    ],
    tip: "A higher damper setting is a lower stroke rate against more drag, not a harder workout by itself.",
    caution: null,
  },
  "plank": {
    setup: [
      "Forearms flat, elbows under the shoulders.",
      "Head, hips and heels in one line.",
      "Toes tucked, glutes squeezed, abdominals drawn in.",
    ],
    execution: [
      "Hold the position and breathe normally.",
      "Keep a slight posterior pelvic tilt.",
      "Maintain hard bracing for the prescribed duration.",
    ],
    mistakes: [
      "Hips sagging.",
      "Hips high, which reduces the demand.",
      "Holding the breath.",
      "Extending the hold at the cost of position.",
    ],
    tip: "Hold quality decides the useful duration. When position can be held easily, add external load rather than time.",
    caution: null,
  },
  "ab-wheel-rollout": {
    setup: [
      "Knees on a pad, handles directly under the shoulders.",
      "Brace the abdominals and glutes before moving.",
      "Slight posterior pelvic tilt.",
    ],
    execution: [
      "Roll forward slowly, holding the pelvic position.",
      "Go as far as you can without the lower back extending.",
      "Pull back with the abdominals, not the arms.",
    ],
    mistakes: [
      "Lower back extending at the bottom: that is the range limit, not a target to pass.",
      "Progressing from knees to standing too early.",
      "Pulling back with the arms.",
      "Rushing the eccentric.",
    ],
    tip: "Range is earned by holding the pelvic position, not by reaching further.",
    caution: null,
  },
  "hanging-knee-raise": {
    setup: [
      "Hang from a bar, grip shoulder width, palms forward.",
      "Shoulders depressed with slight latissimus tension.",
      "Legs hanging neutrally.",
    ],
    execution: [
      "Tilt the pelvis posteriorly first.",
      "Bring the knees toward the chest so the pelvis curls up.",
      "Lower slowly without swinging.",
    ],
    mistakes: [
      "Swinging the legs.",
      "Flexing only at the hip: the pelvic tilt is the abdominal component.",
      "Stopping at horizontal.",
      "Dropping the legs quickly.",
    ],
    tip: "Without the pelvic tilt this is a hip-flexor exercise.",
    caution: null,
  },
  "walk": {
    setup: ["Comfortable shoes."],
    execution: ["Walk at a conversational pace with upright posture."],
    mistakes: [
      "Turning it into a conditioning session: this is recovery work.",
      "Walking hunched over a phone.",
      "Skipping it on busy days: any duration counts.",
    ],
    tip: "Low-intensity walking adds energy expenditure without adding recovery cost.",
    caution: null,
  },
  "stair-climber": {
    setup: ["Set the machine to a moderate level."],
    execution: ["Stand tall with a full foot on each step."],
    mistakes: [
      "Hunching over and supporting body mass on the rails: reduces the energy cost of the work.",
      "Climbing on the toes.",
      "Setting a pace you cannot hold for the prescribed duration.",
    ],
    tip: "If the rails are needed for support, lower the level instead.",
    caution: null,
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/content/formCues.test.ts`
Expected: PASS — 9 passed. If the first test fails with a list of orphan ids, P2's library uses different ids: fix the keys here to match `EXERCISES`, and record the divergence in the amendments section.

- [ ] **Step 5: Run lint and type checks**

Run: `npx tsc --noEmit && npx eslint src/content/formCues.ts`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/content/formCues.ts src/content/formCues.test.ts
git commit -m "feat: form cues keyed by exercise id with the content review §6 corrections"
```

---

### Task 8: Video and form-cue modals, via React context

**Files:**
- Create: `src/ui/components/VideoModal.tsx`
- Create: `src/ui/components/VideoModal.test.tsx`
- Create: `src/ui/components/FormCuesModal.tsx`
- Create: `src/ui/styles/train.css`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `VIDEO_INSTANCES` from `../../config/videoInstances`; `FORM_CUES` from `../../content/formCues`; `useAppStore` from `../../store` (for `state.ui.videoInstanceHost` and the `setUi` action).
- Produces:
  ```ts
  // VideoModal.tsx
  export function VideoModalProvider(props: { children: React.ReactNode }): React.JSX.Element;
  export function useVideoModal(): { open(query: string, title: string): void; close(): void };
  // FormCuesModal.tsx
  export function FormCuesProvider(props: { children: React.ReactNode }): React.JSX.Element;
  export function useFormCues(): { open(exerciseId: string, title: string): void; close(): void };
  ```

**What changes from the legacy.** `window.__videoModal` and `window.__formCuesModal` are gone: both modals are reached through a React context, so nothing writes to the global object and the components are testable in isolation. `localStorage` is no longer touched directly (the lint gate forbids it outside `persistence.ts`); the working host is persisted through `setUi({ videoInstanceHost })`. The search-query design is retained: an 11-character YouTube id embeds directly, anything else renders the search panel with a link out. The iframe gains `sandbox="allow-scripts allow-same-origin"` per master plan §8, and `referrerPolicy="no-referrer"`.

**One honest limitation, stated in a comment in the code.** An iframe `load` event fires for an error page as well as a working embed, so "the instance worked" is a best-effort signal. It is still better than the legacy behaviour, which only persisted a host when the user clicked "open in new tab".

- [ ] **Step 1: Write the failing VideoModal tests**

Create `src/ui/components/VideoModal.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VIDEO_INSTANCES } from "../../config/videoInstances";
import { useVideoModal, VideoModalProvider } from "./VideoModal";

function Opener({ video, title }: { video: string; title: string }) {
  const modal = useVideoModal();
  return <button onClick={() => modal.open(video, title)}>open</button>;
}

function renderWith(video: string, title: string) {
  return render(
    <VideoModalProvider>
      <Opener video={video} title={title} />
    </VideoModalProvider>,
  );
}

describe("VideoModal", () => {
  it("renders nothing until opened", () => {
    renderWith("dQw4w9WgXcQ", "Barbell bench press");
    expect(screen.queryByTitle("Barbell bench press")).toBeNull();
  });

  it("embeds an 11-character video id with the required iframe hardening", () => {
    renderWith("dQw4w9WgXcQ", "Barbell bench press");
    fireEvent.click(screen.getByText("open"));
    const frame = screen.getByTitle("Barbell bench press");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("src")).toContain(VIDEO_INSTANCES[0]?.host ?? "");
    expect(frame.getAttribute("src")).toContain("/embed/dQw4w9WgXcQ");
  });

  it("renders the search panel for anything that is not a video id", () => {
    renderWith("barbell bench press technique", "Barbell bench press");
    fireEvent.click(screen.getByText("open"));
    expect(screen.queryByTitle("Barbell bench press")).toBeNull();
    expect(screen.getByText(/barbell bench press technique/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /search/i });
    expect(link.getAttribute("href")).toContain("/search?q=");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("rotates to the next instance", () => {
    renderWith("dQw4w9WgXcQ", "Barbell bench press");
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(screen.getByRole("button", { name: /try next instance/i }));
    const frame = screen.getByTitle("Barbell bench press");
    expect(frame.getAttribute("src")).toContain(VIDEO_INSTANCES[1]?.host ?? "");
  });

  it("closes on Escape", () => {
    renderWith("dQw4w9WgXcQ", "Barbell bench press");
    fireEvent.click(screen.getByText("open"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTitle("Barbell bench press")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/components/VideoModal.test.tsx`
Expected: FAIL — `Failed to resolve import "./VideoModal"`.

- [ ] **Step 3: Write the video modal**

Create `src/ui/components/VideoModal.tsx`:

```tsx
// Invidious form-reference modal. Reached through React context, never through
// a global (the legacy used window.__videoModal). The instance list is the
// single source that also generates the CSP frame-src allowlist at build time,
// so the two cannot drift.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { VIDEO_INSTANCES } from "../../config/videoInstances";
import { useAppStore } from "../../store";
import "../styles/train.css";

/** 11-character URL-safe base64 is a YouTube id; anything else is a search query. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

interface VideoRequest { video: string; title: string }

interface VideoModalApi {
  open(video: string, title: string): void;
  close(): void;
}

const VideoModalContext = createContext<VideoModalApi | null>(null);

export function useVideoModal(): VideoModalApi {
  const api = useContext(VideoModalContext);
  if (api === null) throw new Error("useVideoModal used outside VideoModalProvider");
  return api;
}

function startIndex(preferredHost: string | null): number {
  if (preferredHost === null) return 0;
  const i = VIDEO_INSTANCES.findIndex((x) => x.host === preferredHost);
  return i >= 0 ? i : 0;
}

function VideoModal({ request, onClose }: { request: VideoRequest; onClose: () => void }) {
  const preferredHost = useAppStore((s) => s.state.ui.videoInstanceHost);
  const setUi = useAppStore((s) => s.setUi);
  const [index, setIndex] = useState(() => startIndex(preferredHost));
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const instance = VIDEO_INSTANCES[index] ?? VIDEO_INSTANCES[0];
  if (instance === undefined) return null;

  const isId = VIDEO_ID_RE.test(request.video);
  const query = isId ? request.title : request.video;
  const embedUrl = `https://${instance.host}/embed/${request.video}?autoplay=1`;
  const watchUrl = `https://${instance.host}/watch?v=${request.video}`;
  const searchUrl = `https://${instance.host}/search?q=${encodeURIComponent(query)}`;

  // An iframe load event also fires for an error page, so this is a best-effort
  // signal that the host responded at all. It is still strictly better than the
  // legacy behaviour, which only recorded a host when the user clicked out.
  const onFrameLoad = () => {
    if (instance.host !== preferredHost) setUi({ videoInstanceHost: instance.host });
  };

  const nextInstance = () => {
    setIndex((i) => (i + 1) % VIDEO_INSTANCES.length);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="vmod-bg" onClick={onClose}>
      <div className="vmod" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Form reference">
        <div className="vmod-head">
          <div>
            <div className="vmod-eyebrow">FORM REFERENCE</div>
            <div className="vmod-name">{request.title}</div>
          </div>
          <button className="vmod-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="vmod-instance">
          <span className="vmod-inst-host">{instance.host}</span>
          <span className="vmod-inst-meta">instance {index + 1} of {VIDEO_INSTANCES.length}</span>
          <button onClick={nextInstance}>Try next instance</button>
        </div>

        {isId ? (
          <div className="vmod-frame">
            <iframe
              key={`${index}-${reloadKey}`}
              src={embedUrl}
              title={request.title}
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              onLoad={onFrameLoad}
            />
          </div>
        ) : (
          <div className="vmod-search">
            <div className="vmod-search-eyebrow">SEARCH</div>
            <div className="vmod-search-q">{query}</div>
            <div className="vmod-search-note">No specific clip is recorded for this exercise.</div>
          </div>
        )}

        <div className="vmod-foot">
          {isId && (
            <a className="vmod-link" href={watchUrl} target="_blank" rel="noopener noreferrer">
              Open in a new tab
            </a>
          )}
          <a className="vmod-link" href={searchUrl} target="_blank" rel="noopener noreferrer">
            Search this instance
          </a>
        </div>
      </div>
    </div>
  );
}

export function VideoModalProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<VideoRequest | null>(null);
  const close = useCallback(() => setRequest(null), []);
  const open = useCallback((video: string, title: string) => setRequest({ video, title }), []);
  const api = useMemo<VideoModalApi>(() => ({ open, close }), [open, close]);
  return (
    <VideoModalContext.Provider value={api}>
      {children}
      {request !== null && <VideoModal request={request} onClose={close} />}
    </VideoModalContext.Provider>
  );
}
```

- [ ] **Step 4: Write the form-cues modal**

Create `src/ui/components/FormCuesModal.tsx`:

```tsx
// Form-cue modal, reached through React context (the legacy used
// window.__formCuesModal). Cues are looked up by exercise id, so the silent
// name-key drift of content review §6 cannot recur.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { FORM_CUES, WARMUP_NOTICE } from "../../content/formCues";
import "../styles/train.css";

interface CueRequest { exerciseId: string; title: string }

interface FormCuesApi {
  open(exerciseId: string, title: string): void;
  close(): void;
}

const FormCuesContext = createContext<FormCuesApi | null>(null);

export function useFormCues(): FormCuesApi {
  const api = useContext(FormCuesContext);
  if (api === null) throw new Error("useFormCues used outside FormCuesProvider");
  return api;
}

function FormCuesModal({ request, onClose }: { request: CueRequest; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const cue = FORM_CUES[request.exerciseId];
  if (cue === undefined) return null;

  return (
    <div className="fcm-bg" onClick={onClose}>
      <div className="fcm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Form cues">
        <div className="fcm-head">
          <div>
            <div className="fcm-eyebrow">FORM CUES AND COMMON MISTAKES</div>
            <div className="fcm-name">{request.title}</div>
          </div>
          <button className="fcm-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="fcm-body">
          <p className="fcm-warmup">{WARMUP_NOTICE}</p>
          {cue.caution !== null && <p className="fcm-caution" role="note">{cue.caution}</p>}
          <section>
            <h4 className="fcm-h">SETUP</h4>
            <ol className="fcm-list">{cue.setup.map((s) => <li key={s}>{s}</li>)}</ol>
          </section>
          <section>
            <h4 className="fcm-h">EXECUTION</h4>
            <ol className="fcm-list">{cue.execution.map((s) => <li key={s}>{s}</li>)}</ol>
          </section>
          <section>
            <h4 className="fcm-h fcm-danger">COMMON MISTAKES</h4>
            <ul className="fcm-list">{cue.mistakes.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>
          {cue.tip !== null && <p className="fcm-tip">{cue.tip}</p>}
        </div>
      </div>
    </div>
  );
}

export function FormCuesProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<CueRequest | null>(null);
  const close = useCallback(() => setRequest(null), []);
  const open = useCallback((exerciseId: string, title: string) => setRequest({ exerciseId, title }), []);
  const api = useMemo<FormCuesApi>(() => ({ open, close }), [open, close]);
  return (
    <FormCuesContext.Provider value={api}>
      {children}
      {request !== null && <FormCuesModal request={request} onClose={close} />}
    </FormCuesContext.Provider>
  );
}
```

- [ ] **Step 5: Write the train stylesheet**

Create `src/ui/styles/train.css`:

```css
/* Train-view surfaces. Colours come from the tokens P1 defined; nothing here
   introduces a new palette entry. */
.vmod-bg, .fcm-bg {
  position: fixed; inset: 0; z-index: 40;
  background: rgb(0 0 0 / 0.72);
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.vmod, .fcm {
  background: var(--bg-1); border: 1px solid var(--bg-3); color: var(--fg-1);
  width: min(48rem, 100%); max-height: 90vh; overflow-y: auto;
}
.vmod-head, .fcm-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 0.75rem 1rem; border-bottom: 1px solid var(--bg-3); }
.vmod-eyebrow, .fcm-eyebrow { font-size: 0.7rem; letter-spacing: 0.08em; color: var(--fg-3); }
.vmod-name, .fcm-name { font-size: 1rem; }
.vmod-close, .fcm-close { background: none; border: none; color: var(--fg-2); font-size: 1.25rem; cursor: pointer; }
.vmod-instance { display: flex; gap: 0.5rem; align-items: center; padding: 0.5rem 1rem; font-size: 0.75rem; border-bottom: 1px solid var(--bg-3); }
.vmod-inst-meta { color: var(--fg-3); margin-right: auto; }
.vmod-frame { position: relative; padding-top: 56.25%; }
.vmod-frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.vmod-search { padding: 1.5rem 1rem; }
.vmod-search-q { font-size: 1.1rem; margin: 0.5rem 0; }
.vmod-foot { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem; }
.vmod-link { color: var(--accent); }
.fcm-body { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
.fcm-warmup { font-size: 0.8rem; color: var(--fg-3); border-left: 2px solid var(--fg-3); padding-left: 0.75rem; }
.fcm-caution { font-size: 0.8rem; color: var(--danger); border-left: 2px solid var(--danger); padding-left: 0.75rem; }
.fcm-h { font-size: 0.7rem; letter-spacing: 0.08em; color: var(--fg-3); margin: 0 0 0.35rem; }
.fcm-danger { color: var(--danger); }
.fcm-list { margin: 0; padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.25rem; }
.fcm-tip { font-size: 0.85rem; color: var(--fg-2); }

/* Train view */
.train-header { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: flex-start; }
.train-warmup { font-size: 0.8rem; color: var(--fg-3); border-left: 2px solid var(--fg-3); padding-left: 0.75rem; margin: 0.75rem 0; }
.ex-card { border: 1px solid var(--bg-3); margin-bottom: 0.5rem; }
.ex-head { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; background: none; border: none; color: inherit; padding: 0.75rem; cursor: pointer; text-align: left; }
.ex-body { padding: 0 0.75rem 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
.ex-prev { font-size: 0.8rem; color: var(--fg-3); display: flex; gap: 1rem; flex-wrap: wrap; }
.set-row { display: grid; grid-template-columns: 4rem 1fr 1fr auto; gap: 0.5rem; align-items: end; }
.set-row.done { opacity: 0.6; }
.unit-input { display: flex; flex-direction: column; gap: 0.15rem; }
.unit-input label { font-size: 0.65rem; letter-spacing: 0.06em; color: var(--fg-3); }
.unit-input input { width: 100%; background: var(--bg-2); border: 1px solid var(--bg-3); color: var(--fg-1); padding: 0.4rem; font: inherit; }
.rest-panel { display: flex; gap: 0.75rem; align-items: center; }
.rest-ring { position: relative; width: 64px; height: 64px; }
.rest-time { position: absolute; inset: 0; display: grid; place-items: center; font-variant-numeric: tabular-nums; }
.hydration-banner { border: 1px solid var(--accent); padding: 0.5rem 0.75rem; margin: 0.75rem 0; font-size: 0.85rem; display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
.session-toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: 4.5rem; z-index: 30; display: flex; flex-direction: column; gap: 0.35rem; }
.session-toast > div { background: var(--bg-2); border: 1px solid var(--bg-3); padding: 0.5rem 0.75rem; font-size: 0.85rem; }
.session-toast .telemetry { color: var(--accent); }
```

If `--danger` is not among the tokens P1 defined, add it to `src/ui/styles/tokens.css` rather than hard-coding a colour here.

- [ ] **Step 6: Mount both providers in `src/app/App.tsx`**

Add the imports:

```tsx
import { FormCuesProvider } from "../ui/components/FormCuesModal";
import { VideoModalProvider } from "../ui/components/VideoModal";
```

Then wrap the element `App` already returns. Concretely: find `App`'s `return (` and its matching closing `);`, insert `<VideoModalProvider><FormCuesProvider>` immediately after the opening parenthesis and `</FormCuesProvider></VideoModalProvider>` immediately before the closing one, leaving every existing child untouched. Both providers render their children unconditionally, so no existing behaviour changes; only the two modal roots are added. Verify with:

Run: `npx vitest run src/app` and `npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/ui/components/VideoModal.test.tsx`
Expected: PASS — 5 passed.

- [ ] **Step 8: Run lint and type checks**

Run: `npx tsc --noEmit && npx eslint src/ui/components src/app/App.tsx`
Expected: no output, exit code 0.

- [ ] **Step 9: Commit**

```bash
git add src/ui/components/VideoModal.tsx src/ui/components/VideoModal.test.tsx src/ui/components/FormCuesModal.tsx src/ui/styles/train.css src/app/App.tsx
git commit -m "feat: video and form-cue modals behind React context, no window globals"
```

---

### Task 9: Shared UI primitives — UnitInput, chime, wake lock

**Files:**
- Create: `src/ui/components/UnitInput.tsx`
- Create: `src/ui/components/UnitInput.test.tsx`
- Create: `src/ui/audio/chime.ts`
- Create: `src/ui/hooks/useWakeLock.ts`
- Modify: `src/ui/views/TodayView.tsx`

**Interfaces:**
- Consumes: `displayLoad`, `displayMass`, `toStoredLoad`, `toStoredMass`, `UNIT_LABEL` from `../../domain/units`.
- Produces:
  ```ts
  // UnitInput.tsx
  export interface UnitInputProps {
    id: string; label: string; kind: "load" | "mass"; units: UnitSystem;
    valueKg: Kg | null; onCommit: (kg: Kg | null) => void;
    onEnter?: () => void; disabled?: boolean; placeholderKg?: Kg | null;
    inputRef?: React.RefObject<HTMLInputElement | null>;
  }
  export function UnitInput(props: UnitInputProps): React.JSX.Element;
  // chime.ts
  export function unlockAudio(): void;
  export function playChime(): void;
  export function releaseAudio(): void;
  // useWakeLock.ts
  export function useWakeLock(active: boolean): void;
  ```

**Why `unlockAudio` is called from the Start session tap.** Code review A29: the legacy constructed an `AudioContext` inside a `setInterval` callback, so it started `suspended` and never resumed, and no chime was ever produced on iOS Safari or on Chrome without a prior gesture. One long-lived context is created and resumed inside the user gesture that starts the session, and the oscillator is scheduled on it later. TrainView also calls `unlockAudio` on its own first pointer event, so a user who navigates to Train directly still gets a working chime.

**Why the wake lock is feature-detected.** `REFERENCES.md` records `caniuse.com/wake-lock` (iOS Safari 16.4+, Chrome Android) and WebKit bug 254545: Screen Wake Lock was broken inside installed Home Screen web apps until iOS/iPadOS 18.4, which is the platform floor this project adopted. The API is absent in jsdom, so the hook must be a no-op there.

- [ ] **Step 1: Write the failing UnitInput tests**

Create `src/ui/components/UnitInput.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnitInput } from "./UnitInput";

describe("UnitInput", () => {
  it("labels the field with the display unit", () => {
    render(<UnitInput id="l" label="Load" kind="load" units="imperial" valueKg={null} onCommit={() => {}} />);
    expect(screen.getByLabelText("Load (lb)")).toBeTruthy();
  });

  it("uses a decimal input mode so phones show a numeric keypad", () => {
    render(<UnitInput id="l" label="Load" kind="load" units="metric" valueKg={null} onCommit={() => {}} />);
    expect(screen.getByLabelText("Load (kg)").getAttribute("inputmode")).toBe("decimal");
  });

  it("converts an imperial entry exactly on submit", () => {
    const onCommit = vi.fn();
    render(<UnitInput id="l" label="Load" kind="load" units="imperial" valueKg={null} onCommit={onCommit} />);
    const input = screen.getByLabelText("Load (lb)");
    fireEvent.change(input, { target: { value: "135" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(61.23496995);
  });

  it("renders a stored kilogram value in the display unit at 0.1 resolution", () => {
    render(<UnitInput id="m" label="Body mass" kind="mass" units="metric" valueKg={61.23496995} onCommit={() => {}} />);
    expect((screen.getByLabelText("Body mass (kg)") as HTMLInputElement).value).toBe("61.2");
  });

  it("commits null for an empty entry", () => {
    const onCommit = vi.fn();
    render(<UnitInput id="l" label="Load" kind="load" units="metric" valueKg={60} onCommit={onCommit} />);
    const input = screen.getByLabelText("Load (kg)");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it("calls onEnter after committing", () => {
    const order: string[] = [];
    render(
      <UnitInput
        id="l" label="Load" kind="load" units="metric" valueKg={null}
        onCommit={() => order.push("commit")} onEnter={() => order.push("enter")}
      />,
    );
    const input = screen.getByLabelText("Load (kg)");
    fireEvent.change(input, { target: { value: "60" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(order).toEqual(["commit", "enter"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/components/UnitInput.test.tsx`
Expected: FAIL — `Failed to resolve import "./UnitInput"`.

- [ ] **Step 3: Write UnitInput**

Create `src/ui/components/UnitInput.tsx`:

```tsx
// Numeric entry in the user's display unit, stored canonically in kg.
// The conversion happens once, here, on commit: code review A1 and A6 record
// that the legacy had two unit conventions that never met and exactly one
// conversion, in the export path.
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { Kg, UnitSystem } from "../../domain/types";
import { displayLoad, displayMass, toStoredLoad, toStoredMass, UNIT_LABEL } from "../../domain/units";
import "../styles/train.css";

export interface UnitInputProps {
  id: string;
  label: string;
  kind: "load" | "mass";
  units: UnitSystem;
  /** Canonical kg. null renders an empty field. */
  valueKg: Kg | null;
  onCommit: (kg: Kg | null) => void;
  onEnter?: () => void;
  disabled?: boolean;
  placeholderKg?: Kg | null;
  inputRef?: RefObject<HTMLInputElement | null>;
}

function toDisplay(kg: Kg | null, kind: "load" | "mass", units: UnitSystem): string {
  if (kg === null) return "";
  return String(kind === "load" ? displayLoad(kg, units) : displayMass(kg, units));
}

function toStored(entered: number, kind: "load" | "mass", units: UnitSystem): Kg {
  return kind === "load" ? toStoredLoad(entered, units) : toStoredMass(entered, units);
}

export function UnitInput(props: UnitInputProps) {
  const { id, label, kind, units, valueKg, onCommit, onEnter, disabled, placeholderKg, inputRef } = props;
  const unitLabel = kind === "load" ? UNIT_LABEL[units].load : UNIT_LABEL[units].mass;
  const [text, setText] = useState(() => toDisplay(valueKg, kind, units));

  // Re-sync when the stored value or the display unit changes underneath us.
  useEffect(() => { setText(toDisplay(valueKg, kind, units)); }, [valueKg, kind, units]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === "") { onCommit(null); return; }
    const entered = Number.parseFloat(trimmed);
    if (Number.isNaN(entered) || !Number.isFinite(entered) || entered < 0) return;
    onCommit(toStored(entered, kind, units));   // exact conversion, no rounding
  };

  return (
    <div className="unit-input">
      <label htmlFor={id}>{label} ({unitLabel})</label>
      <input
        id={id}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={`${label} (${unitLabel})`}
        value={text}
        disabled={disabled === true}
        placeholder={placeholderKg === undefined || placeholderKg === null ? "" : toDisplay(placeholderKg, kind, units)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          commit();
          if (onEnter !== undefined) onEnter();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the UnitInput tests to verify they pass**

Run: `npx vitest run src/ui/components/UnitInput.test.tsx`
Expected: PASS — 6 passed.

- [ ] **Step 5: Write the chime module**

Create `src/ui/audio/chime.ts`:

```ts
// One long-lived AudioContext, created and resumed inside a user gesture.
// Code review A29: the legacy constructed a context inside a setInterval
// callback, so it started suspended, resume() was never called, and no sound
// was ever produced on iOS Safari or on Chrome without a prior page gesture.
const CHIME_FREQUENCY_HZ = 880;   // Hz, A5
const CHIME_DURATION_S = 0.4;     // s
const CHIME_PEAK_GAIN = 0.25;     // dimensionless, linear gain

let context: AudioContext | null = null;

/** Must be called from inside a user-gesture handler ("Start session" tap). */
export function unlockAudio(): void {
  if (typeof AudioContext === "undefined") return;   // jsdom, or an unsupported browser
  if (context === null) context = new AudioContext();
  if (context.state === "suspended") void context.resume();
}

export function playChime(): void {
  if (context === null || context.state !== "running") return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = CHIME_FREQUENCY_HZ;
  gain.gain.value = 0.001;
  oscillator.connect(gain);
  gain.connect(context.destination);
  const t0 = context.currentTime;   // s, context clock
  gain.gain.exponentialRampToValueAtTime(CHIME_PEAK_GAIN, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + CHIME_DURATION_S - 0.05);
  oscillator.start(t0);
  oscillator.stop(t0 + CHIME_DURATION_S);
}

/** Called when the session ends; the context is not needed between sessions. */
export function releaseAudio(): void {
  if (context === null) return;
  void context.close();
  context = null;
}
```

- [ ] **Step 6: Write the wake-lock hook**

Create `src/ui/hooks/useWakeLock.ts`:

```ts
// Screen Wake Lock while a training session is on screen.
// Support, from REFERENCES.md: caniuse.com/wake-lock gives iOS Safari 16.4+ and
// Chrome on Android; WebKit bug 254545 records that the API was broken inside
// installed Home Screen web apps until iOS/iPadOS 18.4, which is this project's
// platform floor. The API is absent in jsdom, so this hook must be a no-op
// there rather than throwing.
import { useEffect } from "react";

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
};

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav: NavigatorWithWakeLock = navigator;
    const api = nav.wakeLock;
    if (api === undefined) return;   // feature-detected; nothing to release

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const next = await api.request("screen");
        if (cancelled) { void next.release(); return; }
        sentinel = next;
      } catch {
        // The browser refuses the lock when the document is hidden or the
        // battery saver is on. The timer still works; only the screen sleeps.
        sentinel = null;
      }
    };

    // A wake lock is released automatically when the page is hidden, so it has
    // to be re-acquired when the user returns to the tab.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && sentinel === null) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel !== null) void sentinel.release();
      sentinel = null;
    };
  }, [active]);
}
```

- [ ] **Step 7: Unlock audio from the Start session tap in `src/ui/views/TodayView.tsx`**

Add the import:

```tsx
import { unlockAudio } from "../audio/chime";
```

and call it as the first statement of the existing "Start session" click handler, before `startSession(...)` and `setUi({ lastView: "train" })`:

```tsx
    unlockAudio();   // must run inside the gesture task, not later (code review A29)
```

- [ ] **Step 8: Run the whole suite, lint and type check**

Run: `npm test && npx tsc --noEmit && npx eslint src/ui`
Expected: PASS, no type errors, no lint output.

- [ ] **Step 9: Commit**

```bash
git add src/ui/components/UnitInput.tsx src/ui/components/UnitInput.test.tsx src/ui/audio/chime.ts src/ui/hooks/useWakeLock.ts src/ui/views/TodayView.tsx
git commit -m "feat: unit-aware input, gesture-unlocked chime, feature-detected wake lock"
```

---

### Task 10: TrainView

**Files:**
- Create: `src/ui/views/train/SessionToast.tsx`
- Create: `src/ui/views/train/RestTimerPanel.tsx`
- Create: `src/ui/views/train/HydrationBanner.tsx`
- Create: `src/ui/views/train/BodyMassQuickLog.tsx`
- Create: `src/ui/views/train/SetRow.tsx`
- Create: `src/ui/views/train/ExerciseCard.tsx`
- Create: `src/ui/views/train/AddCustomExercise.tsx`
- Create: `src/ui/views/TrainView.tsx`
- Test: `src/ui/views/TrainView.test.tsx`
- Test: `src/store/sessionRestore.test.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 1-9, plus `EXERCISES` from `../../domain/plan/library`, `newId` from `../../domain/ids`, `todayLocal` from `../../domain/dates`, and the P3 action `completeSession`.
- Produces: `export function TrainView(): React.JSX.Element;` — mounted by `src/app/App.tsx`'s view switch under the key `"train"`, which P3 already routes.

- [ ] **Step 1: Write the failing TrainView tests**

Create `src/ui/views/TrainView.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeBlock, makePlannedExercise, makeProfile, makeState } from "../../test/fixtures";
import { EXERCISES } from "../../domain/plan/library";
import { toStoredLoad } from "../../domain/units";
import { useAppStore } from "../../store";
import { FormCuesProvider } from "../components/FormCuesModal";
import { VideoModalProvider } from "../components/VideoModal";
import { TrainView } from "./TrainView";
import type { AppState, LoggedSet, PlanTemplate, UnitSystem } from "../../domain/types";

const TODAY = "2026-03-02";
const NOW = Date.UTC(2026, 2, 2, 10, 0, 0);   // 12:00 in Europe/Athens

// Take a real loaded upper-body compound from the library so the test does not
// hard-code an id that P2 may have named differently.
const EX = EXERCISES.find((e) => e.loadClass === "upper-compound" && !e.isBodyweight) ?? EXERCISES[0];

function seed(units: UnitSystem, sets: Record<string, LoggedSet> = {}): AppState {
  if (EX === undefined) throw new Error("the exercise library is empty");
  const steps = units === "imperial"
    ? {
        barbellKg: toStoredLoad(5, "imperial"),
        dumbbellPairKg: toStoredLoad(10, "imperial"),
        stackKg: toStoredLoad(10, "imperial"),
        hasMicroPlates: false,
      }
    : { barbellKg: 2.5, dumbbellPairKg: 5, stackKg: 5, hasMicroPlates: false };
  const profile = makeProfile({ units, equipmentSteps: steps });
  const plan: PlanTemplate = {
    id: "plan-1", version: 1, name: "Upper/Lower", sessionsPerWeek: 4, weeks: 12,
    sessions: [{
      id: "session-1", ordinal: 1, name: "Upper A", kind: "lift", label: "Upper",
      exercises: [makePlannedExercise({ exerciseId: EX.id })],
    }],
    blocks: [makeBlock()],
  };
  return makeState({
    profiles: { "profile-1": profile },
    plans: { "plan-1": plan },
    cursors: { "profile-1": { planId: "plan-1", nextSessionIndex: 0, startedOn: TODAY, completedOn: null } },
    assignments: {
      "profile-1": [{
        date: TODAY, sessionId: "session-1", sourceIndex: 0, status: "in-progress",
        startedAt: NOW, completedAt: null, skipReason: null,
      }],
    },
    sets,
  });
}

function renderTrain() {
  return render(
    <VideoModalProvider>
      <FormCuesProvider>
        <TrainView />
      </FormCuesProvider>
    </VideoModalProvider>,
  );
}

describe("TrainView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    sessionStorage.clear();
    useAppStore.getState().setRestTimer(null);
  });
  afterEach(() => { vi.useRealTimers(); });

  it("stores an imperial entry canonically and renders it in pounds", () => {
    useAppStore.getState().replaceState(seed("imperial"));
    renderTrain();
    fireEvent.change(screen.getByLabelText("Set 1 load (lb)"), { target: { value: "135" } });
    fireEvent.keyDown(screen.getByLabelText("Set 1 load (lb)"), { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Set 1 reps"), { target: { value: "5" } });
    fireEvent.keyDown(screen.getByLabelText("Set 1 reps"), { key: "Enter" });

    const stored = Object.values(useAppStore.getState().state.sets);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.loadKg).toBe(61.23496995);   // kg
    expect(stored[0]?.enteredUnit).toBe("imperial");
    expect(screen.getByText("135 lb × 5")).toBeTruthy();
  });

  it("renders the same stored set as 61.2 kg for a metric viewer", () => {
    if (EX === undefined) throw new Error("the exercise library is empty");
    const set: LoggedSet = {
      id: "set-1", profileId: "profile-1", assignmentDate: TODAY, sessionId: "session-1",
      exerciseId: EX.id, setNumber: 1, isBonus: false, loadKg: 61.23496995,
      enteredUnit: "imperial", reps: 5, durationS: null, rpe: null, loggedAt: NOW,
    };
    useAppStore.getState().replaceState(seed("metric", { "set-1": set }));
    renderTrain();
    expect(screen.getByText("61.2 kg × 5")).toBeTruthy();
  });

  it("advances focus from the load field to the reps field on Enter", () => {
    useAppStore.getState().replaceState(seed("metric"));
    renderTrain();
    const load = screen.getByLabelText("Set 1 load (kg)");
    load.focus();
    fireEvent.change(load, { target: { value: "60" } });
    fireEvent.keyDown(load, { key: "Enter" });
    expect(document.activeElement).toBe(screen.getByLabelText("Set 1 reps"));
  });

  it("stores 0 kg when the bodyweight toggle is set", () => {
    useAppStore.getState().replaceState(seed("metric"));
    renderTrain();
    fireEvent.click(screen.getByLabelText("Set 1 bodyweight"));
    fireEvent.change(screen.getByLabelText("Set 1 reps"), { target: { value: "12" } });
    fireEvent.click(screen.getByLabelText("Log set 1"));
    const stored = Object.values(useAppStore.getState().state.sets);
    expect(stored[0]?.loadKg).toBe(0);
  });

  it("shows a coach line after a logged set", () => {
    useAppStore.getState().replaceState(seed("metric"));
    renderTrain();
    fireEvent.change(screen.getByLabelText("Set 1 load (kg)"), { target: { value: "60" } });
    fireEvent.keyDown(screen.getByLabelText("Set 1 load (kg)"), { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Set 1 reps"), { target: { value: "8" } });
    fireEvent.keyDown(screen.getByLabelText("Set 1 reps"), { key: "Enter" });
    expect(screen.getByText("Top of range at 60 kg × 8.")).toBeTruthy();
  });

  it("offers an undo after deleting a set and restores it", () => {
    if (EX === undefined) throw new Error("the exercise library is empty");
    const set: LoggedSet = {
      id: "set-1", profileId: "profile-1", assignmentDate: TODAY, sessionId: "session-1",
      exerciseId: EX.id, setNumber: 1, isBonus: false, loadKg: 60,
      enteredUnit: "metric", reps: 8, durationS: null, rpe: null, loggedAt: NOW,
    };
    useAppStore.getState().replaceState(seed("metric", { "set-1": set }));
    renderTrain();
    fireEvent.click(screen.getByLabelText("Delete set 1"));
    expect(useAppStore.getState().state.sets["set-1"]).toBeUndefined();
    fireEvent.click(screen.getByText("Undo"));
    expect(useAppStore.getState().state.sets["set-1"]?.loadKg).toBe(60);
  });

  it("starts a rest timer after a logged set and counts down from endsAt", () => {
    useAppStore.getState().replaceState(seed("metric"));
    renderTrain();
    fireEvent.change(screen.getByLabelText("Set 1 load (kg)"), { target: { value: "60" } });
    fireEvent.keyDown(screen.getByLabelText("Set 1 load (kg)"), { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Set 1 reps"), { target: { value: "8" } });
    fireEvent.keyDown(screen.getByLabelText("Set 1 reps"), { key: "Enter" });
    const timer = useAppStore.getState().session.restTimer;
    expect(timer).not.toBeNull();
    expect(screen.getByText("2:00")).toBeTruthy();   // the fixture prescribes 120 s
  });

  it("renders a restored rest timer from the session slice", () => {
    useAppStore.getState().replaceState(seed("metric"));
    useAppStore.getState().setRestTimer({ startedAt: NOW - 30_000, endsAt: NOW + 60_000, durationS: 90 });
    renderTrain();
    expect(screen.getByText("1:00")).toBeTruthy();
  });

  it("adds a custom exercise with a generated id and shows it as a bonus card", () => {
    useAppStore.getState().replaceState(seed("metric"));
    renderTrain();
    fireEvent.click(screen.getByText("Add an exercise to this session"));
    fireEvent.change(screen.getByLabelText("Exercise name"), { target: { value: "Cable crunch" } });
    fireEvent.click(screen.getByText("Add exercise"));
    const custom = useAppStore.getState().state.customExercises["profile-1"] ?? [];
    expect(custom).toHaveLength(1);
    expect(custom[0]?.name).toBe("Cable crunch");
    expect(custom[0]?.id).not.toBe("1000");
    expect(screen.getByText(/Cable crunch \(bonus\)/)).toBeTruthy();
  });
});

describe("TrainView wake lock", () => {
  beforeEach(() => { sessionStorage.clear(); });

  it("requests a screen wake lock on mount and releases it on unmount", async () => {
    const release = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const request = vi.fn<(t: "screen") => Promise<{ release: () => Promise<void> }>>().mockResolvedValue({ release });
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });

    useAppStore.getState().replaceState(seed("metric"));
    const { unmount } = renderTrain();
    await waitFor(() => { expect(request).toHaveBeenCalledWith("screen"); });
    unmount();
    await waitFor(() => { expect(release).toHaveBeenCalled(); });

    Reflect.deleteProperty(navigator, "wakeLock");
  });

  it("renders without a wake lock API present", () => {
    expect("wakeLock" in navigator).toBe(false);
    useAppStore.getState().replaceState(seed("metric"));
    expect(() => renderTrain()).not.toThrow();
  });
});
```

Create `src/store/sessionRestore.test.ts` — the reload half of the timer gate, run without React so the module registry can be reset safely:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const NOW = Date.UTC(2026, 2, 2, 10, 0, 0);   // epoch ms UTC

describe("session restore", () => {
  beforeEach(() => { sessionStorage.clear(); vi.resetModules(); });

  it("restores a running rest timer from sessionStorage at module init", async () => {
    sessionStorage.setItem("fti.session.v3", JSON.stringify({
      restTimer: { startedAt: NOW - 30_000, endsAt: NOW + 60_000, durationS: 90 },
      activeAssignmentDate: "2026-03-02",
      bonusExerciseIds: [],
    }));
    const { useAppStore } = await import("./index");
    expect(useAppStore.getState().session.restTimer).toEqual({
      startedAt: NOW - 30_000, endsAt: NOW + 60_000, durationS: 90,
    });
    expect(useAppStore.getState().session.activeAssignmentDate).toBe("2026-03-02");
  });

  it("starts empty when nothing was mirrored", async () => {
    const { useAppStore } = await import("./index");
    expect(useAppStore.getState().session.restTimer).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/views/TrainView.test.tsx src/store/sessionRestore.test.ts`
Expected: FAIL — `Failed to resolve import "./TrainView"`.

- [ ] **Step 3: Write the session toast**

Create `src/ui/views/train/SessionToast.tsx`:

```tsx
import type { EpochMs } from "../../../domain/types";
import "../../styles/train.css";

export interface ToastItem {
  id: string;
  text: string;
  tone: "coach" | "telemetry" | "undo";
  expiresAt: EpochMs;             // epoch ms UTC
  actionLabel: string | null;
  onAction: (() => void) | null;
}

export function SessionToast({ items }: { items: ToastItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="session-toast" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={t.tone}>
          <span>{t.text}</span>
          {t.actionLabel !== null && t.onAction !== null && (
            <button onClick={t.onAction}>{t.actionLabel}</button>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write the rest-timer panel**

Create `src/ui/views/train/RestTimerPanel.tsx`:

```tsx
// The countdown is a function of Date.now() and the timer's endsAt. The
// interval only forces a re-render; it never holds the value (code review A31:
// the legacy interval froze while backgrounded and chimed a minute late).
import { useEffect, useRef, useState } from "react";
import { extend, remainingS, totalS } from "../../../domain/training/restTimer";
import { playChime } from "../../audio/chime";
import { useAppStore } from "../../../store";
import "../../styles/train.css";

const RING_RADIUS = 28;                                  // px
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;    // px
const EXTEND_S = 30;                                     // s

async function notifyRestOver(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification("Rest over", { tag: "rest" });
  } catch {
    // A push-less service worker or a revoked permission: the visual timer and
    // the chime still ran. Nothing to recover.
    return;
  }
}

export function RestTimerPanel() {
  const timer = useAppStore((s) => s.session.restTimer);
  const setRestTimer = useAppStore((s) => s.setRestTimer);
  const [now, setNow] = useState<number>(() => Date.now());   // epoch ms UTC
  const firedRef = useRef(false);

  // Tick once per second only while the document is visible, and recompute
  // immediately on visibilitychange so a backgrounded return is not stale.
  useEffect(() => {
    if (timer === null) return;
    firedRef.current = false;
    let id: number | undefined;
    const tick = () => setNow(Date.now());
    const start = () => { if (id === undefined) id = window.setInterval(tick, 1000); };
    const stop = () => { if (id !== undefined) { window.clearInterval(id); id = undefined; } };
    const onVisibility = () => { tick(); if (document.hidden) stop(); else start(); };
    tick();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [timer]);

  useEffect(() => {
    if (timer === null || firedRef.current) return;
    if (remainingS(timer, now) > 0) return;
    firedRef.current = true;
    playChime();
    // navigator.vibrate is not implemented in Safari on iOS or iPadOS at any
    // version (REFERENCES.md, caniuse.com/mdn-api_navigator_vibrate), so this
    // is an Android-only cue and must never be the only one.
    navigator.vibrate?.([180, 80, 180]);   // ms on/off/on
    if (document.hidden) void notifyRestOver();
  }, [timer, now]);

  if (timer === null) return null;

  const remaining = remainingS(timer, now);            // s
  const total = Math.max(1, totalS(timer));            // s
  const elapsedFraction = Math.min(1, (total - remaining) / total);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div className="rest-panel">
      <div className="rest-ring">
        <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
          <circle cx="32" cy="32" r={RING_RADIUS} fill="none" stroke="var(--bg-3)" strokeWidth="3" />
          <circle
            cx="32" cy="32" r={RING_RADIUS} fill="none" stroke="var(--accent)" strokeWidth="3"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * elapsedFraction}
            transform="rotate(-90 32 32)" strokeLinecap="round"
          />
        </svg>
        <span className="rest-time">{minutes}:{String(seconds).padStart(2, "0")}</span>
      </div>
      <div>
        <div className="rest-label">REST</div>
        <button onClick={() => setRestTimer(extend(timer, EXTEND_S))}>+30 s</button>
        <button onClick={() => setRestTimer(null)}>Skip</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the hydration banner and the body-mass quick log**

Create `src/ui/views/train/HydrationBanner.tsx`:

```tsx
import { useEffect, useState } from "react";
import { hydrationCue } from "../../../domain/training/hydration";
import type { LocalDate, Profile } from "../../../domain/types";
import { formatVolume } from "../../../domain/units";
import { useAppStore } from "../../../store";
import "../../styles/train.css";

const REEVALUATE_MS = 60_000;   // ms; the cue only changes on the minute scale

export function HydrationBanner({ profile, date, sessionActive }: {
  profile: Profile; date: LocalDate; sessionActive: boolean;
}) {
  // The whole document is selected here because hydrationCue reads assignments,
  // hydration and bodyMass. This is a single banner; the re-render cost is one
  // small subtree.
  const state = useAppStore((s) => s.state);
  const addHydration = useAppStore((s) => s.addHydration);
  const [now, setNow] = useState<number>(() => Date.now());   // epoch ms UTC

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), REEVALUATE_MS);
    return () => window.clearInterval(id);
  }, []);

  const cue = hydrationCue(state, profile.id, now, sessionActive);
  if (cue === null) return null;

  return (
    <div className="hydration-banner" role="status">
      <span>{cue.message}</span>
      {cue.kind !== "post-session-weigh" && (
        <button onClick={() => addHydration(profile.id, date, profile.hydration.cupSizeML, Date.now())}>
          Log {formatVolume(profile.hydration.cupSizeML, profile.units)}
        </button>
      )}
    </div>
  );
}
```

Create `src/ui/views/train/BodyMassQuickLog.tsx`:

```tsx
import { useState } from "react";
import {
  bodyMassLossFraction, DEHYDRATION_LOSS_FRACTION, exceedsDehydrationThreshold,
} from "../../../domain/training/hydration";
import type { Kg, LocalDate, Profile } from "../../../domain/types";
import { useAppStore } from "../../../store";
import { UnitInput } from "../../components/UnitInput";
import "../../styles/train.css";

export function BodyMassQuickLog({ profile, date, preSessionMassKg, label }: {
  profile: Profile;
  date: LocalDate;
  /** kg, the mass this session started from; null disables the loss check. */
  preSessionMassKg: Kg | null;
  label: string;
}) {
  const logBodyMass = useAppStore((s) => s.logBodyMass);
  const [massKg, setMassKg] = useState<Kg | null>(null);   // kg
  const [flag, setFlag] = useState<string | null>(null);

  const submit = () => {
    if (massKg === null) return;
    logBodyMass(
      { profileId: profile.id, date, massKg, enteredUnit: profile.units, bodyFatPct: null },
      Date.now(),
    );
    if (preSessionMassKg !== null && exceedsDehydrationThreshold(preSessionMassKg, massKg)) {
      const pct = (bodyMassLossFraction(preSessionMassKg, massKg) * 100).toFixed(1);   // percent
      setFlag(
        `Loss of ${pct} per cent of pre-session mass, above the ${DEHYDRATION_LOSS_FRACTION * 100} per cent threshold (ACSM 2007). Replace the deficit over the hours after the session.`,
      );
    } else {
      setFlag(null);
    }
    setMassKg(null);
  };

  return (
    <div className="mass-quick-log">
      <UnitInput
        id="body-mass-quick"
        label={label}
        kind="mass"
        units={profile.units}
        valueKg={massKg}
        onCommit={setMassKg}
        onEnter={submit}
      />
      <button onClick={submit}>Log body mass</button>
      {flag !== null && <p className="fcm-caution" role="alert">{flag}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Write the set row**

Create `src/ui/views/train/SetRow.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import type { Kg, LoggedSet, UnitSystem } from "../../../domain/types";
import { formatLoad } from "../../../domain/units";
import { UnitInput } from "../../components/UnitInput";
import "../../styles/train.css";

export interface SetRowProps {
  n: number;
  targetSets: number;
  isBonus: boolean;
  units: UnitSystem;
  /** kg, the load the engine suggests; prefills an empty row. */
  suggestedKg: Kg | null;
  logged: LoggedSet | null;
  isBodyweightExercise: boolean;
  onLog: (loadKg: Kg, reps: number) => void;
  onDelete: () => void;
}

export function SetRow(props: SetRowProps) {
  const { n, targetSets, isBonus, units, suggestedKg, logged, isBodyweightExercise, onLog, onDelete } = props;
  const [loadKg, setLoadKg] = useState<Kg | null>(logged?.loadKg ?? suggestedKg);   // kg
  const [repsText, setRepsText] = useState(logged?.reps === undefined || logged?.reps === null ? "" : String(logged.reps));
  const [bodyweight, setBodyweight] = useState(isBodyweightExercise);
  const loadRef = useRef<HTMLInputElement | null>(null);
  const repsRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLoadKg(logged?.loadKg ?? suggestedKg);
    setRepsText(logged?.reps === undefined || logged?.reps === null ? "" : String(logged.reps));
  }, [logged, suggestedKg]);

  const submit = () => {
    const reps = Number.parseInt(repsText, 10);
    if (!Number.isFinite(reps) || reps <= 0) return;
    // Bodyweight sets store 0, never null and never a dropped falsy value
    // (master plan §8, code review A60).
    const load = bodyweight ? 0 : loadKg;
    if (load === null) return;
    onLog(load, reps);
    repsRef.current?.blur();
  };

  if (logged !== null) {
    return (
      <div className="set-row done">
        <span>{isBonus ? "BONUS" : `SET ${n}/${targetSets}`}</span>
        <span>{formatLoad(logged.loadKg, units)} × {logged.reps ?? "-"}</span>
        <button onClick={onDelete} aria-label={`Delete set ${n}`}>Delete</button>
      </div>
    );
  }

  return (
    <div className={isBonus ? "set-row bonus" : "set-row"}>
      <span>{isBonus ? "BONUS" : `SET ${n}/${targetSets}`}</span>
      <UnitInput
        id={`set-${n}-load`}
        label={`Set ${n} load`}
        kind="load"
        units={units}
        valueKg={bodyweight ? 0 : loadKg}
        onCommit={setLoadKg}
        onEnter={() => repsRef.current?.focus()}
        disabled={bodyweight}
        placeholderKg={suggestedKg}
        inputRef={loadRef}
      />
      <div className="unit-input">
        <label htmlFor={`set-${n}-reps`}>Reps</label>
        <input
          id={`set-${n}-reps`}
          ref={repsRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`Set ${n} reps`}
          value={repsText}
          onChange={(e) => setRepsText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        />
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={bodyweight}
            onChange={(e) => setBodyweight(e.target.checked)}
            aria-label={`Set ${n} bodyweight`}
          />
          BW
        </label>
        <button onClick={submit} aria-label={`Log set ${n}`}>Log</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write the exercise card**

Create `src/ui/views/train/ExerciseCard.tsx`:

```tsx
import { useMemo, useState } from "react";
import { coachLine, type CoachLine } from "../../../domain/training/coach";
import { suggestedProgression } from "../../../domain/training/progression";
import { defaultRestS, startRest } from "../../../domain/training/restTimer";
import type {
  Exercise, Kg, LocalDate, LoggedSet, PlanBlock, PlannedExercise, Profile,
} from "../../../domain/types";
import { achievableLoad, formatLoad, stepFor } from "../../../domain/units";
import { useExerciseHistory } from "../../../store/selectors";
import { useAppStore } from "../../../store";
import { useFormCues } from "../../components/FormCuesModal";
import { useVideoModal } from "../../components/VideoModal";
import { FORM_CUES } from "../../../content/formCues";
import { SetRow } from "./SetRow";
import "../../styles/train.css";

export interface ExerciseCardProps {
  profile: Profile;
  exercise: Exercise;
  planned: PlannedExercise;
  block: PlanBlock;
  library: Record<string, Exercise>;
  assignmentDate: LocalDate;
  sessionId: string;
  isBonusExercise: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onCoach: (line: CoachLine) => void;
  onDeleted: (setId: string) => void;
}

export function ExerciseCard(props: ExerciseCardProps) {
  const {
    profile, exercise, planned, block, library, assignmentDate, sessionId,
    isBonusExercise, isOpen, onToggle, onCoach, onDeleted,
  } = props;

  const history = useExerciseHistory(exercise.id);
  const logSet = useAppStore((s) => s.logSet);
  const deleteSet = useAppStore((s) => s.deleteSet);
  const setRestTimer = useAppStore((s) => s.setRestTimer);
  const video = useVideoModal();
  const cues = useFormCues();
  const [bonusRows, setBonusRows] = useState(0);

  // Today's own sets never feed the suggestion: the rule advances only after a
  // completed session (code review A22).
  const priorHistory = useMemo(
    () => history.filter((s) => s.assignmentDate !== assignmentDate),
    [history, assignmentDate],
  );
  const todaysSets = useMemo(
    () => history.filter((s) => s.assignmentDate === assignmentDate),
    [history, assignmentDate],
  );

  const advice = useMemo(
    () => suggestedProgression(priorHistory, planned, exercise, profile, block),
    [priorHistory, planned, exercise, profile, block],
  );

  const stepKg = stepFor(exercise, profile.equipmentSteps);   // kg
  const suggestedKg: Kg | null =
    advice.loadKg === null ? null : stepKg > 0 ? achievableLoad(advice.loadKg, stepKg) : advice.loadKg;

  const lastDate = priorHistory.at(-1)?.assignmentDate ?? null;
  const lastSession = lastDate === null ? [] : priorHistory.filter((s) => s.assignmentDate === lastDate);

  // The deload block's volume cut is applied here, by the caller, exactly as
  // master plan §6.5 specifies.
  const targetSets = Math.max(1, Math.round(planned.setsLo * block.setModifier));
  const maxLoggedNumber = todaysSets.reduce((m, s) => Math.max(m, s.setNumber), 0);
  const rowCount = Math.max(targetSets, maxLoggedNumber) + bonusRows;

  const restS = planned.restS > 0 ? planned.restS : defaultRestS(planned, library);   // s

  const handleLog = (n: number, loadKg: Kg, reps: number) => {
    const set: Omit<LoggedSet, "id" | "loggedAt"> = {
      profileId: profile.id,
      assignmentDate,
      sessionId,
      exerciseId: exercise.id,
      setNumber: n,
      isBonus: isBonusExercise || n > targetSets,
      loadKg,                       // kg, canonical
      enteredUnit: profile.units,
      reps,
      durationS: null,
      rpe: null,
    };
    const now = Date.now();         // epoch ms UTC
    const id = logSet(set, now);
    onCoach(coachLine({ ...set, id, loggedAt: now }, history, advice, profile.units));
    setRestTimer(startRest(restS, now));
  };

  const prescriptionText =
    planned.prescription.kind === "reps"
      ? `${planned.prescription.lo}-${planned.prescription.hi} reps`
      : planned.prescription.kind === "amrap"
        ? "AMRAP"
        : planned.prescription.kind === "time" || planned.prescription.kind === "duration"
          ? `${planned.prescription.targetS} s`
          : "-";

  return (
    <div className={isOpen ? "ex-card open" : "ex-card"}>
      <button className="ex-head" onClick={onToggle} aria-expanded={isOpen}>
        <span className="ex-title">{exercise.name}{isBonusExercise ? " (bonus)" : ""}</span>
        <span className="ex-sub">{targetSets} × {prescriptionText}</span>
        <span className="ex-prog">{todaysSets.length}/{targetSets}</span>
      </button>

      {isOpen && (
        <div className="ex-body">
          <div className="ex-prev">
            {lastSession.length > 0 && (
              <span>
                Last session {lastDate}: {formatLoad(lastSession[0]?.loadKg ?? null, profile.units)} × {lastSession.map((s) => s.reps ?? 0).join(", ")}
              </span>
            )}
            <span>
              Suggested: {suggestedKg === null ? "-" : formatLoad(suggestedKg, profile.units)} ({advice.kind})
            </span>
            <span className="ex-reason">{advice.reason}</span>
          </div>

          <div className="ex-links">
            {exercise.videoQuery !== null && (
              <button onClick={() => video.open(exercise.videoQuery ?? "", exercise.name)}>
                Form reference
              </button>
            )}
            {FORM_CUES[exercise.id] !== undefined && (
              <button onClick={() => cues.open(exercise.id, exercise.name)}>
                Form cues and common mistakes
              </button>
            )}
          </div>

          <div className="set-list">
            {Array.from({ length: rowCount }, (_, i) => i + 1).map((n) => {
              const logged = todaysSets.find((s) => s.setNumber === n) ?? null;
              return (
                <SetRow
                  key={n}
                  n={n}
                  targetSets={targetSets}
                  isBonus={n > targetSets}
                  units={profile.units}
                  suggestedKg={suggestedKg}
                  logged={logged}
                  isBodyweightExercise={exercise.isBodyweight}
                  onLog={(loadKg, reps) => handleLog(n, loadKg, reps)}
                  onDelete={() => { if (logged !== null) { deleteSet(logged.id); onDeleted(logged.id); } }}
                />
              );
            })}
          </div>

          <button onClick={() => setBonusRows((b) => b + 1)}>Add a bonus set</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Write the custom-exercise form**

Create `src/ui/views/train/AddCustomExercise.tsx`:

```tsx
import { useState } from "react";
import { newId } from "../../../domain/ids";
import type { Exercise, Modality, Profile } from "../../../domain/types";
import { useAppStore } from "../../../store";
import "../../styles/train.css";

const MODALITIES: Modality[] = ["barbell", "dumbbell", "machine", "cable", "bodyweight"];

export function AddCustomExercise({ profile }: { profile: Profile }) {
  const addCustomExercise = useAppStore((s) => s.addCustomExercise);
  const addBonusExercise = useAppStore((s) => s.addBonusExercise);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [modality, setModality] = useState<Modality>("dumbbell");

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed === "") return;
    // A stable generated id, never a positional index (code review A26: the
    // legacy used 1000 + i, so deleting one custom exercise re-attributed
    // another's logged sets and orphaned the rest).
    const exercise: Exercise = {
      id: newId(),
      name: trimmed,
      isBodyweight: modality === "bodyweight",
      isCompoundPrimary: false,
      modality,
      loadClass: "isolation",
      muscleGroups: [],
      equipment: [profile.equipment],
      videoQuery: `${trimmed} technique`,
      formCueId: null,
      note: null,
    };
    addCustomExercise(profile.id, exercise);
    addBonusExercise(exercise.id);
    setName("");
    setOpen(false);
  };

  if (!open) {
    return <button onClick={() => setOpen(true)}>Add an exercise to this session</button>;
  }

  return (
    <div className="add-custom">
      <div className="unit-input">
        <label htmlFor="custom-name">Exercise name</label>
        <input
          id="custom-name"
          type="text"
          aria-label="Exercise name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        />
      </div>
      <div className="unit-input">
        <label htmlFor="custom-modality">Equipment</label>
        <select
          id="custom-modality"
          aria-label="Equipment"
          value={modality}
          onChange={(e) => {
            const next = MODALITIES.find((m) => m === e.target.value);
            if (next !== undefined) setModality(next);
          }}
        >
          {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <button onClick={() => setOpen(false)}>Cancel</button>
      <button onClick={submit}>Add exercise</button>
    </div>
  );
}
```

- [ ] **Step 9: Write TrainView**

Create `src/ui/views/TrainView.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { WARMUP_NOTICE } from "../../content/formCues";
import { todayLocal } from "../../domain/dates";
import { newId } from "../../domain/ids";
import { EXERCISES } from "../../domain/plan/library";
import type { CoachLine } from "../../domain/training/coach";
import { blockFor, IDENTITY_BLOCK } from "../../domain/training/progression";
import { UNDO_WINDOW_MS } from "../../store/training";
import type { Exercise, PlannedExercise } from "../../domain/types";
import { useAppStore } from "../../store";
import { useTodaysSets } from "../../store/selectors";
import { releaseAudio, unlockAudio } from "../audio/chime";
import { useWakeLock } from "../hooks/useWakeLock";
import { AddCustomExercise } from "./train/AddCustomExercise";
import { BodyMassQuickLog } from "./train/BodyMassQuickLog";
import { ExerciseCard } from "./train/ExerciseCard";
import { HydrationBanner } from "./train/HydrationBanner";
import { RestTimerPanel } from "./train/RestTimerPanel";
import { SessionToast, type ToastItem } from "./train/SessionToast";
import "../styles/train.css";

const COACH_TOAST_MS = 5_000;   // ms

/** A planned slot synthesised for a bonus exercise that is not in the plan. */
function bonusSlot(exerciseId: string): PlannedExercise {
  return {
    exerciseId,
    setsLo: 3,
    setsHi: 3,
    prescription: { kind: "reps", lo: 8, hi: 12 },
    restS: 0,   // 0 means "use defaultRestS"
  };
}

export function TrainView() {
  const profileId = useAppStore((s) => s.state.activeProfileId);
  const profiles = useAppStore((s) => s.state.profiles);
  const plans = useAppStore((s) => s.state.plans);
  const cursors = useAppStore((s) => s.state.cursors);
  const assignments = useAppStore((s) => s.state.assignments);
  const customExercises = useAppStore((s) => s.state.customExercises);
  const bonusExerciseIds = useAppStore((s) => s.session.bonusExerciseIds);
  const todaysSets = useTodaysSets();
  const undoDelete = useAppStore((s) => s.undoDelete);
  const completeSession = useAppStore((s) => s.completeSession);

  const [openId, setOpenId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useWakeLock(true);

  // A user who navigates straight to Train never passed through the Start
  // session tap, so the audio context is unlocked on the first pointer event
  // here as well (code review A29).
  useEffect(() => {
    const handler = () => unlockAudio();
    window.addEventListener("pointerdown", handler, { once: true });
    return () => window.removeEventListener("pointerdown", handler);
  }, []);

  useEffect(() => {
    const id = window.setInterval(
      () => setToasts((items) => items.filter((t) => t.expiresAt > Date.now())),
      500,
    );
    return () => window.clearInterval(id);
  }, []);

  const pushToast = useCallback((item: Omit<ToastItem, "id">) => {
    setToasts((items) => [...items.slice(-2), { ...item, id: newId() }]);
  }, []);

  const onCoach = useCallback((line: CoachLine) => {
    pushToast({
      text: line.text, tone: line.tone, expiresAt: Date.now() + COACH_TOAST_MS,
      actionLabel: null, onAction: null,
    });
  }, [pushToast]);

  const onDeleted = useCallback(() => {
    pushToast({
      text: "Set deleted.", tone: "undo", expiresAt: Date.now() + UNDO_WINDOW_MS,
      actionLabel: "Undo", onAction: () => undoDelete(),
    });
  }, [pushToast, undoDelete]);

  const profile = profileId === null ? null : profiles[profileId] ?? null;

  const library = useMemo<Record<string, Exercise>>(() => {
    const map: Record<string, Exercise> = {};
    for (const e of EXERCISES) map[e.id] = e;
    for (const e of profileId === null ? [] : customExercises[profileId] ?? []) map[e.id] = e;
    return map;
  }, [customExercises, profileId]);

  if (profile === null || profileId === null) {
    return <p>No profile is active. Complete setup first.</p>;
  }

  const today = todayLocal(profile.timezone);
  const assignment = (assignments[profileId] ?? []).find((a) => a.date === today) ?? null;
  const cursor = cursors[profileId] ?? null;
  const plan = cursor === null ? null : plans[cursor.planId] ?? null;
  const session = plan === null || assignment === null
    ? null
    : plan.sessions.find((s) => s.id === assignment.sessionId) ?? null;
  const block = plan === null || assignment === null ? IDENTITY_BLOCK : blockFor(plan, assignment.sourceIndex);
  const sessionActive = assignment !== null && assignment.status === "in-progress";

  // Bonus cards come from the session slice AND from any set already logged
  // today against an exercise the plan does not contain, so the cards survive
  // even if the sessionStorage mirror was lost.
  const plannedIds = new Set(session?.exercises.map((e) => e.exerciseId) ?? []);
  const bonusIds = Array.from(new Set([
    ...bonusExerciseIds,
    ...todaysSets.map((s) => s.exerciseId),
  ])).filter((id) => !plannedIds.has(id) && library[id] !== undefined);

  if (session === null || assignment === null) {
    return (
      <div className="train">
        <h2>TRAIN</h2>
        <p>No session is assigned to {today}. Pick one on the Today view.</p>
        <HydrationBanner profile={profile} date={today} sessionActive={false} />
      </div>
    );
  }

  return (
    <div className="train">
      <div className="train-header">
        <div>
          <div className="train-eyebrow">SESSION {session.ordinal} · {session.label}</div>
          <h2>{session.name}</h2>
          {block.isDeload && <div className="train-deload">Deload block: set count reduced, load held.</div>}
        </div>
        <RestTimerPanel />
      </div>

      <p className="train-warmup">{WARMUP_NOTICE}</p>
      <HydrationBanner profile={profile} date={today} sessionActive={sessionActive} />

      <div className="ex-stack">
        {session.exercises.map((planned) => {
          const exercise = library[planned.exerciseId];
          if (exercise === undefined) return null;
          return (
            <ExerciseCard
              key={planned.exerciseId}
              profile={profile}
              exercise={exercise}
              planned={planned}
              block={block}
              library={library}
              assignmentDate={today}
              sessionId={session.id}
              isBonusExercise={false}
              isOpen={openId === null ? planned.exerciseId === session.exercises[0]?.exerciseId : openId === planned.exerciseId}
              onToggle={() => setOpenId((cur) => (cur === planned.exerciseId ? "" : planned.exerciseId))}
              onCoach={onCoach}
              onDeleted={onDeleted}
            />
          );
        })}
        {bonusIds.map((id) => {
          const exercise = library[id];
          if (exercise === undefined) return null;
          return (
            <ExerciseCard
              key={id}
              profile={profile}
              exercise={exercise}
              planned={bonusSlot(id)}
              block={block}
              library={library}
              assignmentDate={today}
              sessionId={session.id}
              isBonusExercise
              isOpen={openId === id}
              onToggle={() => setOpenId((cur) => (cur === id ? "" : id))}
              onCoach={onCoach}
              onDeleted={onDeleted}
            />
          );
        })}
      </div>

      <AddCustomExercise profile={profile} />

      <BodyMassQuickLog profile={profile} date={today} preSessionMassKg={null} label="Body mass" />

      <button
        onClick={() => {
          completeSession(profileId, today, Date.now());
          releaseAudio();
        }}
      >
        Finish session
      </button>

      {profile.hydration.weighInOptIn && assignment.status === "completed" && (
        <BodyMassQuickLog
          profile={profile}
          date={today}
          preSessionMassKg={profile.body.baselineMassKg}
          label="Post-session body mass"
        />
      )}

      <SessionToast items={toasts} />
    </div>
  );
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run src/ui/views/TrainView.test.tsx src/store/sessionRestore.test.ts`
Expected: PASS — 14 passed.

- [ ] **Step 11: Run the whole suite, lint, type check and build**

Run: `npm test && npx tsc --noEmit && npx eslint src && npm run build`
Expected: all pass; `dist/index.html` still carries the CSP meta tag and no inline script.

- [ ] **Step 12: Verify the P4 gates by hand**

Run: `npx vitest run -t "60 kg upper" -t "20 kg curl" -t "imperial 135 lb" -t "10-minute background" -t "imperial entry"`
Expected: the progression, timer and unit gates from master plan §7 all report PASS. Record the actual output in the commit message if any gate needed a fix.

- [ ] **Step 13: Commit**

```bash
git add src/ui/views/TrainView.tsx src/ui/views/TrainView.test.tsx src/ui/views/train src/store/sessionRestore.test.ts
git commit -m "feat: Train view with unit-aware logging, rest timer, hydration cue and video modal"
```

---

## Master plan amendments requested

Each item is a change to `docs/plans/2026-09-01-00-master-plan.md`. Items marked **implemented here** are already delivered by a task in this plan; the master plan text still needs updating so later plans see the same contract. Items marked **correction** are defects found in the master plan while writing P4 and need no code in P4.

**§5 shared types — implemented here (Task 4).**

1. `Profile.hydration` gains `weighInOptIn: boolean`. §6.5 makes the post-session weigh-in conditional on the profile having "opted in to pre/post weigh-ins", but no field existed to record that consent. Zod default `false`, so no migration and no `CURRENT_SCHEMA_VERSION` bump.
2. `AppState` gains `customExercises: Record<string, Exercise[]>`, keyed by `profileId`. Custom exercises are in P4's scope and code review A26 requires stable generated ids rather than positional indices. Zod default `{}`.
3. `UiPrefs` gains `videoInstanceHost: string | null`. The legacy video modal persisted the working Invidious host in its own `localStorage` key; the lint gate forbids that outside `persistence.ts`, so the preference moves into the persisted document. Zod default `null`.

**§6.5 module contracts — implemented here (Tasks 1 and 3).**

4. `ProgressionAdvice` gains `prescription: Prescription` (the prescription the session just performed was programmed at) and `nextPrescription: Prescription` (what the next session should use; it differs from `prescription` only in the `extend-reps` branch, where `hi` rises by 2). Without them `coachLine(set, history, advice, units)` — a four-argument signature — has no access to the rep range its "over range / below range / top of range" rungs are defined against, and the UI has nowhere to read the raised ceiling from.
5. `restTimer.ts` also exports `totalS(timer: RestTimer): Seconds`. `extend` moves `endsAt` only, so `durationS` no longer spans the timer and the progress ring needs the actual span.
6. `progression.ts` also exports `compareSetOrder`, `sortSetHistory`, `blockFor`, `IDENTITY_BLOCK`, `isCompletedSet` and the named threshold constants. `sortSetHistory` is shared with `src/store/selectors.ts` so programme ordering is defined once.
7. `hydration.ts` also exports `bodyMassLossFraction(preKg, postKg)` and `exceedsDehydrationThreshold(preKg, postKg)`. §6.5 requires the post-session cue to *flag* a loss above 2 %, which is a computation on the entered mass, not on the cue.

**§6.7 store actions — implemented here (Task 6).**

8. Add `undoDelete(): void`. §6.7 specifies `deleteSet(id)` and this plan's brief specifies a six-second undo buffer, but no action restored from it.
9. Add `addCustomExercise(profileId: string, ex: Exercise): void` and `addBonusExercise(exerciseId: string): void`.
10. The non-persisted `session` slice gains `bonusExerciseIds: string[]` (mirrored to `sessionStorage`) and `undo: PendingUndo | null` (deliberately **not** mirrored — a six-second buffer that survived a reload would let a set be restored minutes later).

**§4 file structure — implemented here.**

11. `src/ui/components/UnitInput.tsx` is listed among the components but assigned to no plan. P4 creates it. If P2's setup wizard already created one, reuse it and delete the duplicate.
12. P4 adds `src/ui/audio/chime.ts`, `src/ui/hooks/useWakeLock.ts`, `src/ui/styles/train.css` and the `src/ui/views/train/` component directory, none of which appear in §4.
13. P4's `SessionToast` is a Train-view-local, self-dismissing toast list. P8 delivers the global toast queue; when it lands it should absorb this one rather than run alongside it.

**Contracts P4 depends on that no plan has fixed — please confirm or correct.**

14. **Exercise ids.** `src/content/formCues.ts` is keyed by the 31 ids listed in Task 7 (`barbell-bench-press`, `overhead-press-barbell`, `incline-db-press`, `lateral-raise`, `triceps-overhead-extension`, `pull-up`, `lat-pulldown`, `barbell-row-pendlay`, `barbell-row`, `db-single-arm-row`, `face-pull`, `barbell-curl`, `hammer-curl`, `barbell-back-squat`, `romanian-deadlift`, `leg-press`, `bulgarian-split-squat`, `leg-curl-machine`, `calf-raise`, `push-up`, `trap-bar-deadlift`, `conventional-deadlift`, `weighted-pull-up`, `close-grip-bench-press`, `push-press`, `rower-intervals`, `plank`, `ab-wheel-rollout`, `hanging-knee-raise`, `walk`, `stair-climber`). P2's `library.ts` must use the same slugs, and set `Exercise.formCueId` equal to `Exercise.id` wherever a cue exists. The test in Task 7 Step 1 fails loudly if they diverge, so this is enforced rather than assumed.
15. **`EXERCISES` shape.** §4 describes it as `Exercise[]`; §6.5's `defaultRestS` takes `Record<string, Exercise>`. P4 consumes the array and builds the map itself. Confirm the array is the exported form.
16. **`config/videoInstances.ts` shape.** P4 reads only `.host` from each entry, so any additional fields (label, flag, region) are free. Confirm `host` is the field name.
17. **`useAppStore` exposes `getState()`.** Standard for a Zustand bound store; the tests in Task 10 depend on it.

**Corrections — no P4 code.**

18. **§7, P1 units gate is arithmetically wrong.** It states `toStoredLoad(225, "imperial") === 102.0582832`. `225 × 0.45359237 = 102.05828325`; the stated value is truncated at the eighth decimal and the strict equality can never hold. Change the gate to `102.05828325`.
19. **§6.1 `achievableLoad` needs a relative epsilon, and the master plan should say so.** With a bare `Math.floor(target / step) * step`, `achievableLoad(63.5029318, toStoredLoad(5, "imperial"))` returns `61.23496995`, because `63.5029318 / 2.26796185 = 27.999999999999996` — a whole 5 lb step is silently dropped. The P4 units gate ("an imperial user ... sees 140 lb") therefore fails against an epsilon-free implementation. Specify `Math.floor(target / step + 1e-9) * step` or an equivalent tolerance. Task 1 ships a test that fails if P1's version lacks it.
20. **§6.5's rest-interval comment and the review's §9 stratification differ.** §6.5 says "isolation / machine 60-90 s → default 90". The review stratifies by load and rep range and states plainly that exercise-type stratification is INSUFFICIENT EVIDENCE. P4 keys on `loadClass` (so single-joint machine and cable work lands on 90 s through its `loadClass: "isolation"`) and treats a multi-joint machine press by its rep range. Recommend §6.5 be reworded to match.
21. **The bodyweight and deload rules in §6.5 conflict.** "Bodyweight exercises → extend-reps only" and "in a deload block return deload" cannot both hold for a bodyweight exercise in a deload block. P4 resolves it deload-first, because a deload cuts volume (§5 `PlanBlock`) and prescribing extra repetitions there inverts the block. Recommend §6.5 state the precedence.
22. **§3's personal-data CI gate will fail on the plans directory.** The gate excludes `docs/review/*` and `REFERENCES.md` but not `docs/plans/*`. This plan file necessarily contains the banned tokens twice: once in the verbatim copy of §3 itself, and once in a negative assertion in `src/content/formCues.test.ts` that proves no stimulant content survived the port. Add `':!docs/plans/*'` to the gate, or narrow it to `-- 'src/'`.
23. **A pre-participation screen is missing from every plan.** Content review §6 requires both a warm-up protocol and a readiness screen before this ships to anyone but the author. P4 ships `WARMUP_NOTICE` (non-numeric, since the review supplies no sourced protocol) and a Valsalva contraindication on the back squat, both gated on a screen that does not exist. The screen belongs in P2's setup wizard. This is the largest open safety gap in the project and it is not closed by P4.

## What this plan does not do

Stated plainly, because silence about an omission reads as completeness.

- **No pre-participation screening questionnaire.** See amendment 22. The `caution` field and `WARMUP_NOTICE` reference a screen that P2 must build.
- **No sourced warm-up protocol.** The content review recommends one but supplies no citation, and the global constraints forbid shipping an unsourced number, so `WARMUP_NOTICE` prescribes no sets, loads or durations.
- **No RPE or RIR entry in the UI.** `LoggedSet.rpe` exists in the schema and P4 always writes `null`. Zourdos 2016 (DOI 10.1519/JSC.0000000000001049) is verified in the review and an RPE control is defensible, but it is not in P4's brief.
- **No pre-session weigh-in prompt.** `BodyMassQuickLog` is rendered with `preSessionMassKg` taken from `profile.body.baselineMassKg` in the post-session case, which is the profile baseline and not a same-day pre-session mass. A true pre/post pair needs a prompt at session start; that belongs with P3's `startSession` and is not implemented here. The 2 % flag is therefore currently measured against the baseline, which is the wrong reference for a single session, and the code comment says so.
- **No timed-set logging control.** `Prescription` supports `time` and `duration`, and `LoggedSet.durationS` exists, but `SetRow` only offers load and repetitions. A plank cannot be logged from `TrainView` as written.
- **No keyboard `j`/`k` navigation between exercise cards.** The legacy had it (`console-train.jsx:328-343`); it is not in P4's brief and no test covers it.
- **`navigator.vibrate` and `showNotification` are not covered by an automated test.** Neither exists in jsdom. The vibrate call is guarded by optional chaining and the notification path by a `serviceWorker in navigator` check, so both are inert under test; they need a real-device check in P5's runbook.
- **The iframe `load` event is a weak signal.** It fires for an error page too, so `videoInstanceHost` can record a host that returned an error page. Stated in a code comment; not fixed.
- **`HydrationBanner` subscribes to the whole document.** `hydrationCue` reads assignments, hydration and bodyMass, so the banner re-renders on any state change. Measured cost was not assessed; if it shows up, split the cue into three narrower selectors.
- **Nothing in P4 was executed.** Every command and expected output in this plan is written from the source contracts, not observed. The arithmetic in the four progression gate cases and the `achievableLoad` epsilon defect (amendment 19) *were* computed numerically before being written down; the rest of the expected output — test counts, failure messages — is predicted.
