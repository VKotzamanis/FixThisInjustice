# P3 — Calendar, Cursor, Pause, Pick-Today, Weekly Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** replace the legacy calendar-derived programme position with an attendance-driven plan cursor, and build the Today and Plan views on top of it — projection, pause/resume, pick-what-to-train-today with reshuffle, and ISO-week review closure.

**Architecture:** three pure domain modules (`cursor.ts`, `calendar.ts`, `weekly.ts`) that take an `AppState` and return a new `AppState`, with no clock of their own — every instant and every civil date is passed in. The Zustand store gets a thin action slice that only calls those functions; the React views read through memoised selectors and never compute schedule logic themselves.

**Tech Stack:** TypeScript 5.9 (strict), React 19, Zustand 5, date-fns 4 + @date-fns/tz (through `src/domain/dates.ts` only), Vitest 4 + Testing Library + jsdom.

---

## Global Constraints

*(copied verbatim from master plan §3 — every task implicitly includes them)*

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

## Why this plan exists (code review A.2 and A.10)

The legacy app derived the programme position from the calendar alone:
`programPosition(startDate, today)` (`console-store.jsx:68-77`) is a pure function of two
dates with no attendance input. Review finding **A11** shows the failure: a user who trains
days 1–3 and then travels for ten days returns to "day 14, week 2, Full Rest"; days 4–13 are
unreachable. **A8** (`todayISO()` returns the UTC date) and **A9** (`isoDaysBetween` loses a
day across spring-forward) mean the derived position is also wrong by a day for months at a
time. **A12** shows the before-start and after-end branches produce plausible-looking wrong
states whose flags nothing reads. **A13** shows nothing recomputes the position at midnight.

**A62** shows `SkipSession` wrote `s.skipped[week-day]`, a key with no reader — the button
changed nothing. **A63** shows "done" had three incompatible definitions across three views.

P3 replaces all of it with one authority: `PlanCursor.nextSessionIndex`, which moves only
when a session is completed or explicitly skipped, and one status field per day
(`SessionAssignment.status`) that every view reads.

---

## Assumed complete from P1 and P2 (do not re-create)

This plan imports the following and nothing else from earlier plans. If any import fails to
resolve, stop and fix the earlier plan's export rather than redefining it here.

| From | Import | Used by |
| --- | --- | --- |
| `src/domain/types.ts` | all types in master §5 (`AppState`, `Profile`, `Availability`, `AvailabilitySlot`, `PlanTemplate`, `PlannedSession`, `PlannedExercise`, `PlanBlock`, `Prescription`, `PlanCursor`, `PlanPause`, `SessionAssignment`, `WeeklyReview`, `UiPrefs`, `LocalDate`, `LocalTime`, `EpochMs`, `Seconds`, `IsoWeekday`, `TimeZone`) | every task |
| `src/domain/dates.ts` | `addDays`, `compareLocalDate`, `daysBetween`, `deviceTimeZone`, `isoWeekday`, `todayLocal`, `weekEnd`, `weekStart` | Tasks 1–5 |
| `src/domain/ids.ts` | `newId()` | Task 1 |
| `src/domain/plan/library.ts` | `EXERCISES: Record<string, Exercise>` | Task 5 |
| `src/store/index.ts` | `useAppStore` (Zustand bound hook, whose state is structurally an `AppState`) | Tasks 4–7 |
| `src/ui/components/TopBar.tsx` | the existing component (Task 7 edits it) | Task 7 |
| `src/app/App.tsx` | the existing view switch, which renders the view named by `ui.lastView` | Task 4 |

P2 already ships the `setAvailability` store action and writes `Availability` into the store;
P3 consumes it and does not re-create it.

---

## Contract decisions this plan pins down

The master plan §6.4 gives the signatures but leaves four points open. Each is settled here,
in code and in a test, and each is listed again in "Master plan amendments requested".

1. **A pause covers the half-open local-date interval `[from, to)`.** `from` is the first
   paused day; `to` is the first day the plan is active again; `to === null` means the pause
   is open. Rationale: the Today view's Resume control passes `to = todayLocal(...)`, and the
   user pressing Resume this morning must get this morning's session. An inclusive end would
   make Resume a no-op for the day it was pressed.
2. **Terminal is terminal.** `completeSession` and `skipSession` are no-ops on an assignment
   already `completed` or `skipped`. This is what makes "the cursor advances by one only on
   complete or skip" an invariant rather than an aspiration.
3. **`completedOn` is set by whichever transition passes the last session** — complete or
   skip — using the `date` argument (a `LocalDate`), never a clock.
4. **`PlannedSession.ordinal` is positional:** `plan.sessions[i].ordinal === i + 1` for all
   `i`. `assignToday`'s swap updates both swapped `ordinal` fields so the invariant survives.

**The reorder, defined exactly.** `assignToday(state, profileId, date, label)`:

- `target = cursor.nextSessionIndex` (the index today consumes).
- `span` = the number of days in `[date, weekEnd(date)]` that consume a session, counting
  `date` itself as one. A later day consumes one if it has a non-terminal assignment, or (no
  assignment) it is unpaused and its ISO weekday has an availability slot.
- The **window** is the contiguous index run `[target, min(target + span − 1, last)]`.
- `pick` = the lowest index in the window whose session `label` matches. No match → no-op.
- If `pick !== target`, **swap** `sessions[target]` and `sessions[pick]` (and their
  `ordinal`s). A swap is not a rotation: the displaced session lands exactly where the picked
  one was, so the multiset of labels in the window — and in the whole plan — is unchanged.
- Today's assignment is created or replaced with `sessionId = sessions[target].id` and
  `sourceIndex = target`.

---

## File structure

| Path | Responsibility | Task |
| --- | --- | --- |
| `src/test/scheduleFixtures.ts` | deterministic `AppState` builders for every P3 test | 1 |
| `src/domain/schedule/cursor.ts` | pause predicate, cursor reads, the five state transitions | 1 |
| `src/domain/schedule/cursor.test.ts` | transition and invariant tests | 1 |
| `src/domain/schedule/calendar.ts` | `projectedCalendar`, `remainingLabelsThisWeek`, `assignToday` | 2 |
| `src/domain/schedule/calendar.test.ts` | projection and reorder tests | 2 |
| `src/domain/schedule/weekly.ts` | `closeWeeks` | 3 |
| `src/domain/schedule/weekly.test.ts` | week-boundary tests in two zones | 3 |
| `src/store/scheduleActions.ts` | store action slice (pure functions only) | 4 |
| `src/store/scheduleActions.test.ts` | action-slice tests against a fake setter | 4 |
| `src/store/scheduleSelectors.ts` | `useTodayPlan`, `useUpcoming`, `usePlan`, `useCursor`, snapshot memoisation | 4 |
| `src/app/useWeeklyClose.ts` | mount + `visibilitychange` effect | 4 |
| `src/app/useWeeklyClose.test.tsx` | effect test | 4 |
| `src/ui/format/plan.ts` | `formatPrescription`, `formatSets`, `formatRest`, `formatWeekday`, `exerciseName` | 5 |
| `src/ui/format/plan.test.ts` | formatter tests | 5 |
| `src/ui/views/TodayView.tsx` | hero states, controls, picker, 14-day strip | 5 |
| `src/ui/views/TodayView.test.tsx` | hero-state and picker tests | 5 |
| `src/ui/views/PlanView.tsx` | blocks, week scrubber, sessions, cursor marker | 6 |
| `src/ui/views/PlanView.test.tsx` | scrubber and deload-flag tests | 6 |
| `src/ui/components/SessionIndicator.tsx` | "S n/N" from the cursor | 7 |
| `src/ui/components/SessionIndicator.test.tsx` | indicator tests | 7 |
| `src/ui/components/TopBar.tsx` | modified: legacy `D n/168` block replaced | 7 |

---

### Task 1: Plan cursor (`src/domain/schedule/cursor.ts`) and shared test fixtures

**Files:**
- Create: `src/test/scheduleFixtures.ts`
- Create: `src/domain/schedule/cursor.ts`
- Test: `src/domain/schedule/cursor.test.ts`

**Interfaces:**
- Consumes: `src/domain/types.ts` (all master §5 types); `src/domain/dates.ts`
  (`compareLocalDate`, `addDays`, `weekStart`, `weekEnd`, `isoWeekday`, `todayLocal`);
  `src/domain/ids.ts` (`newId`).
- Produces:
  ```ts
  // src/domain/schedule/cursor.ts
  export function isPaused(pauses: PlanPause[], date: LocalDate): boolean;
  export function isTerminal(a: SessionAssignment): boolean;
  export function upsertAssignment(list: SessionAssignment[], next: SessionAssignment): SessionAssignment[];
  export function nextSession(plan: PlanTemplate, cursor: PlanCursor): PlannedSession | null;
  export function startSession(state: AppState, profileId: string, date: LocalDate, now: EpochMs): AppState;
  export function completeSession(state: AppState, profileId: string, date: LocalDate, now: EpochMs): AppState;
  export function skipSession(state: AppState, profileId: string, date: LocalDate, reason: string | null): AppState;
  export function pausePlan(state: AppState, profileId: string, from: LocalDate, reason: string | null): AppState;
  export function resumePlan(state: AppState, profileId: string, to: LocalDate): AppState;

  // src/test/scheduleFixtures.ts
  export const PROFILE_ID = "p1";
  export const PLAN_ID = "plan-1";
  export const MONDAY: LocalDate;      // "2026-09-07"
  export const NOW_MS: EpochMs;        // Date.UTC(2026, 8, 7, 6, 30) — Mon 09:30 Athens, Sun 23:30 Los Angeles
  export function emptyState(): AppState;
  export interface SeedOptions { labels: string[]; weekdays: IsoWeekday[]; weeklySessionTarget?: number; startedOn?: LocalDate; nextSessionIndex?: number; timezone?: TimeZone; startTime?: LocalTime; sessionsPerWeek?: number; blocks?: PlanBlock[]; }
  export function seedState(opts: SeedOptions): AppState;
  export function planOf(state: AppState): PlanTemplate;
  export function cursorOf(state: AppState): PlanCursor;
  export function assignmentsOf(state: AppState): SessionAssignment[];
  export function pausesOf(state: AppState): PlanPause[];
  ```

- [ ] **Step 1: Create the shared test fixtures**

Create `src/test/scheduleFixtures.ts`:

```ts
// src/test/scheduleFixtures.ts
// Deterministic AppState builders for the P3 schedule tests. Test-only: nothing in src/
// outside *.test.ts imports this file.
//
// Calendar anchor: 2026-09-07 is a Monday (verified: 2026-09-01 is a Tuesday).
// NOW_MS is 2026-09-07T06:30Z, which is Monday 09:30 in Europe/Athens (UTC+3, EEST)
// and Sunday 23:30 in America/Los_Angeles (UTC-7, PDT) — one instant, two ISO weeks.

import type {
  AppState, Availability, AvailabilitySlot, EpochMs, IsoWeekday, LocalDate, LocalTime,
  PlanBlock, PlanCursor, PlannedExercise, PlannedSession, PlanPause, PlanTemplate, Profile,
  SessionAssignment, TimeZone,
} from "../domain/types";

export const PROFILE_ID = "p1";
export const PLAN_ID = "plan-1";

export const MONDAY: LocalDate = "2026-09-07";
export const TUESDAY: LocalDate = "2026-09-08";
export const WEDNESDAY: LocalDate = "2026-09-09";
export const THURSDAY: LocalDate = "2026-09-10";
export const FRIDAY: LocalDate = "2026-09-11";
export const SATURDAY: LocalDate = "2026-09-12";
export const SUNDAY: LocalDate = "2026-09-13";

export const PREV_MONDAY: LocalDate = "2026-08-31";
export const PREV_WEDNESDAY: LocalDate = "2026-09-02";
export const PREV_FRIDAY: LocalDate = "2026-09-04";
export const PREV_SUNDAY: LocalDate = "2026-09-06";

export const TZ_ATHENS: TimeZone = "Europe/Athens";
export const TZ_LOS_ANGELES: TimeZone = "America/Los_Angeles";

/** 2026-09-07T06:30:00Z — epoch milliseconds, UTC. */
export const NOW_MS: EpochMs = Date.UTC(2026, 8, 7, 6, 30);

export const DAY_MS = 86_400_000; // milliseconds in one UTC day

export function emptyState(): AppState {
  return {
    schemaVersion: 3,
    activeProfileId: null,
    profiles: {},
    availability: {},
    plans: {},
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
      bootSeen: true,
      lastView: "today",
      accent: "green",
      scanlines: false,
      flicker: false,
      density: "normal",
    },
  };
}

export function makeProfile(timezone: TimeZone): Profile {
  return {
    id: PROFILE_ID,
    displayName: "Test subject",
    timezone,
    units: "metric",
    createdAt: NOW_MS,
    body: {
      sex: "male",
      birthYear: 1995,
      heightCm: 180,            // cm
      baselineMassKg: 80,       // kg
      baselineAt: PREV_MONDAY,
      baselineBodyFatPct: null,
    },
    activity: "moderate",
    experience: "novice",
    equipment: "full-gym",
    equipmentSteps: {
      barbellKg: 2.5,           // kg total (pair of 1.25 kg plates)
      dumbbellPairKg: 5,        // kg per pair
      stackKg: 5,               // kg per pin
      hasMicroPlates: false,
    },
    goal: { kind: "recomposition", targetMassKg: null, targetBodyFatPct: null, targetDate: null },
    supplements: { creatine: false },
    hydration: { dailyTargetML: 3000, cupSizeML: 250 }, // mL
  };
}

export function makeExercise(n: number): PlannedExercise {
  return {
    exerciseId: `ex-${n}`,
    setsLo: 3,
    setsHi: 4,
    prescription: { kind: "reps", lo: 6, hi: 10 },
    restS: 120, // seconds
  };
}

export function makeSession(index: number, label: string): PlannedSession {
  return {
    id: `s-${index + 1}`,
    ordinal: index + 1,       // positional invariant: sessions[i].ordinal === i + 1
    name: `${label} ${index + 1}`,
    kind: "lift",
    label,
    exercises: [makeExercise(index * 2 + 1), makeExercise(index * 2 + 2)],
  };
}

export function makeAvailability(
  weekdays: IsoWeekday[],
  weeklySessionTarget: number,
  startTime: LocalTime,
): Availability {
  const slots: AvailabilitySlot[] = weekdays.map((weekday) => ({
    weekday,
    startTime,
    expectedDurationS: 3600, // seconds
  }));
  return { slots, weeklySessionTarget };
}

export interface SeedOptions {
  labels: string[];
  weekdays: IsoWeekday[];
  weeklySessionTarget?: number;
  startedOn?: LocalDate;
  nextSessionIndex?: number;
  timezone?: TimeZone;
  startTime?: LocalTime;
  sessionsPerWeek?: number;
  blocks?: PlanBlock[];
}

export function seedState(opts: SeedOptions): AppState {
  const timezone = opts.timezone ?? TZ_ATHENS;
  const startTime = opts.startTime ?? "07:00";
  const sessionsPerWeek = opts.sessionsPerWeek ?? opts.weekdays.length;
  const sessions = opts.labels.map((label, i) => makeSession(i, label));
  const blocks: PlanBlock[] = opts.blocks ?? [
    {
      index: 0,
      firstSessionIndex: 0,
      sessionCount: sessions.length,
      setModifier: 1,
      loadModifier: 1,
      isDeload: false,
    },
  ];
  const plan: PlanTemplate = {
    id: PLAN_ID,
    version: 1,
    name: "Test plan",
    sessionsPerWeek,
    weeks: Math.max(1, Math.ceil(sessions.length / Math.max(1, sessionsPerWeek))),
    sessions,
    blocks,
  };
  const cursor: PlanCursor = {
    planId: PLAN_ID,
    nextSessionIndex: opts.nextSessionIndex ?? 0,
    startedOn: opts.startedOn ?? MONDAY,
    completedOn: null,
  };
  const base = emptyState();
  return {
    ...base,
    activeProfileId: PROFILE_ID,
    profiles: { [PROFILE_ID]: makeProfile(timezone) },
    availability: {
      [PROFILE_ID]: makeAvailability(
        opts.weekdays,
        opts.weeklySessionTarget ?? opts.weekdays.length,
        startTime,
      ),
    },
    plans: { [PLAN_ID]: plan },
    cursors: { [PROFILE_ID]: cursor },
    pauses: { [PROFILE_ID]: [] },
    assignments: { [PROFILE_ID]: [] },
  };
}

export function planOf(state: AppState): PlanTemplate {
  const plan = state.plans[PLAN_ID];
  if (!plan) throw new Error("fixture: plan missing");
  return plan;
}

export function cursorOf(state: AppState): PlanCursor {
  const cursor = state.cursors[PROFILE_ID];
  if (!cursor) throw new Error("fixture: cursor missing");
  return cursor;
}

export function assignmentsOf(state: AppState): SessionAssignment[] {
  return state.assignments[PROFILE_ID] ?? [];
}

export function pausesOf(state: AppState): PlanPause[] {
  return state.pauses[PROFILE_ID] ?? [];
}

export function assignmentOn(state: AppState, date: LocalDate): SessionAssignment | null {
  return assignmentsOf(state).find((a) => a.date === date) ?? null;
}

export function labelsOf(plan: PlanTemplate): string[] {
  return plan.sessions.map((s) => s.label);
}

/** Sorted label multiset, for "the reorder preserved the labels" assertions. */
export function labelMultiset(plan: PlanTemplate, from: number, to: number): string[] {
  return plan.sessions.slice(from, to + 1).map((s) => s.label).sort();
}
```

- [ ] **Step 2: Write the failing cursor tests**

Create `src/domain/schedule/cursor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  completeSession, isPaused, isTerminal, nextSession, pausePlan, resumePlan, skipSession,
  startSession, upsertAssignment,
} from "./cursor";
import {
  assignmentOn, cursorOf, MONDAY, NOW_MS, PROFILE_ID, pausesOf, planOf, seedState, TUESDAY,
  WEDNESDAY, FRIDAY, SUNDAY, DAY_MS,
} from "../../test/scheduleFixtures";
import type { PlanPause, SessionAssignment } from "../types";

const THREE = ["Push", "Legs", "Pull", "Push", "Legs", "Pull"];
const WEEKDAYS = [1, 3, 5] as const;

function seed(nextSessionIndex = 0) {
  return seedState({ labels: THREE, weekdays: [...WEEKDAYS], nextSessionIndex });
}

describe("isPaused", () => {
  const open: PlanPause = { id: "x", from: WEDNESDAY, to: null, reason: null };
  const closed: PlanPause = { id: "y", from: MONDAY, to: WEDNESDAY, reason: null };

  it("is false before the pause starts", () => {
    expect(isPaused([open], TUESDAY)).toBe(false);
  });

  it("is true on the first paused day", () => {
    expect(isPaused([open], WEDNESDAY)).toBe(true);
  });

  it("stays true for an open pause", () => {
    expect(isPaused([open], SUNDAY)).toBe(true);
  });

  it("treats `to` as exclusive: the resume day is active", () => {
    expect(isPaused([closed], TUESDAY)).toBe(true);
    expect(isPaused([closed], WEDNESDAY)).toBe(false);
  });

  it("is false with no pauses", () => {
    expect(isPaused([], MONDAY)).toBe(false);
  });
});

describe("nextSession", () => {
  it("returns the session at the cursor index", () => {
    const s = seed(2);
    const session = nextSession(planOf(s), cursorOf(s));
    expect(session?.id).toBe("s-3");
    expect(session?.label).toBe("Pull");
  });

  it("returns null past the last session", () => {
    const s = seed(6);
    expect(nextSession(planOf(s), cursorOf(s))).toBeNull();
  });

  it("returns null when the cursor belongs to another plan", () => {
    const s = seed(0);
    const cursor = { ...cursorOf(s), planId: "other" };
    expect(nextSession(planOf(s), cursor)).toBeNull();
  });
});

describe("upsertAssignment", () => {
  const a: SessionAssignment = {
    date: WEDNESDAY, sessionId: "s-2", sourceIndex: 1, status: "planned",
    startedAt: null, completedAt: null, skipReason: null,
  };

  it("inserts in date order", () => {
    const later: SessionAssignment = { ...a, date: FRIDAY, sessionId: "s-3", sourceIndex: 2 };
    const list = upsertAssignment(upsertAssignment([], later), a);
    expect(list.map((x) => x.date)).toEqual([WEDNESDAY, FRIDAY]);
  });

  it("replaces the entry for the same date", () => {
    const list = upsertAssignment([a], { ...a, status: "completed" });
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe("completed");
  });
});

describe("isTerminal", () => {
  const base: SessionAssignment = {
    date: MONDAY, sessionId: "s-1", sourceIndex: 0, status: "planned",
    startedAt: null, completedAt: null, skipReason: null,
  };
  it("is true only for completed and skipped", () => {
    expect(isTerminal(base)).toBe(false);
    expect(isTerminal({ ...base, status: "in-progress" })).toBe(false);
    expect(isTerminal({ ...base, status: "completed" })).toBe(true);
    expect(isTerminal({ ...base, status: "skipped" })).toBe(true);
  });
});

describe("startSession", () => {
  it("materialises the cursor's session as in-progress and does not advance", () => {
    const next = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const a = assignmentOn(next, MONDAY);
    expect(a?.sessionId).toBe("s-1");
    expect(a?.sourceIndex).toBe(0);
    expect(a?.status).toBe("in-progress");
    expect(a?.startedAt).toBe(NOW_MS);
    expect(cursorOf(next).nextSessionIndex).toBe(0);
  });

  it("keeps the first startedAt when started twice", () => {
    const once = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const twice = startSession(once, PROFILE_ID, MONDAY, NOW_MS + 60_000);
    expect(assignmentOn(twice, MONDAY)?.startedAt).toBe(NOW_MS);
  });

  it("is a no-op on a terminal day", () => {
    const done = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const after = startSession(done, PROFILE_ID, MONDAY, NOW_MS + 1000);
    expect(after).toBe(done);
  });

  it("is a no-op with no cursor", () => {
    const s = seed(0);
    const stripped = { ...s, cursors: {} };
    expect(startSession(stripped, PROFILE_ID, MONDAY, NOW_MS)).toBe(stripped);
  });
});

describe("completeSession", () => {
  it("marks the day completed and advances the cursor by exactly one", () => {
    const next = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const a = assignmentOn(next, MONDAY);
    expect(a?.status).toBe("completed");
    expect(a?.completedAt).toBe(NOW_MS);
    expect(a?.sessionId).toBe("s-1");
    expect(cursorOf(next).nextSessionIndex).toBe(1);
    expect(cursorOf(next).completedOn).toBeNull();
  });

  it("completes an in-progress day without losing startedAt", () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const done = completeSession(started, PROFILE_ID, MONDAY, NOW_MS + 3_600_000);
    expect(assignmentOn(done, MONDAY)?.startedAt).toBe(NOW_MS);
    expect(cursorOf(done).nextSessionIndex).toBe(1);
  });

  it("is a no-op when the day is already completed (never advances twice)", () => {
    const once = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const twice = completeSession(once, PROFILE_ID, MONDAY, NOW_MS + 1000);
    expect(twice).toBe(once);
    expect(cursorOf(twice).nextSessionIndex).toBe(1);
  });

  it("sets completedOn when the index passes the last session", () => {
    const next = completeSession(seed(5), PROFILE_ID, FRIDAY, NOW_MS);
    expect(cursorOf(next).nextSessionIndex).toBe(6);
    expect(cursorOf(next).completedOn).toBe(FRIDAY);
  });

  it("is a no-op once the plan is finished", () => {
    const finished = completeSession(seed(5), PROFILE_ID, FRIDAY, NOW_MS);
    const after = completeSession(finished, PROFILE_ID, SUNDAY, NOW_MS);
    expect(after).toBe(finished);
  });

  it("does not mutate the input state", () => {
    const before = seed(0);
    completeSession(before, PROFILE_ID, MONDAY, NOW_MS);
    expect(cursorOf(before).nextSessionIndex).toBe(0);
    expect(before.assignments[PROFILE_ID]).toEqual([]);
  });
});

describe("skipSession", () => {
  it("marks the day skipped, records the reason, and advances by one", () => {
    const next = skipSession(seed(0), PROFILE_ID, MONDAY, "illness");
    const a = assignmentOn(next, MONDAY);
    expect(a?.status).toBe("skipped");
    expect(a?.skipReason).toBe("illness");
    expect(a?.completedAt).toBeNull();
    expect(cursorOf(next).nextSessionIndex).toBe(1);
  });

  it("accepts a null reason", () => {
    const next = skipSession(seed(0), PROFILE_ID, MONDAY, null);
    expect(assignmentOn(next, MONDAY)?.skipReason).toBeNull();
  });

  it("is a no-op on an already skipped day", () => {
    const once = skipSession(seed(0), PROFILE_ID, MONDAY, null);
    expect(skipSession(once, PROFILE_ID, MONDAY, "changed my mind")).toBe(once);
  });

  it("sets completedOn when skipping the last session", () => {
    const next = skipSession(seed(5), PROFILE_ID, FRIDAY, null);
    expect(cursorOf(next).completedOn).toBe(FRIDAY);
  });
});

describe("pausePlan / resumePlan", () => {
  it("opens a pause with a null end", () => {
    const next = pausePlan(seed(0), PROFILE_ID, WEDNESDAY, "travel");
    expect(pausesOf(next)).toHaveLength(1);
    expect(pausesOf(next)[0]?.from).toBe(WEDNESDAY);
    expect(pausesOf(next)[0]?.to).toBeNull();
    expect(pausesOf(next)[0]?.reason).toBe("travel");
  });

  it("is a no-op when a pause is already open", () => {
    const once = pausePlan(seed(0), PROFILE_ID, WEDNESDAY, null);
    expect(pausePlan(once, PROFILE_ID, FRIDAY, null)).toBe(once);
  });

  it("closes the open pause with `to`", () => {
    const paused = pausePlan(seed(0), PROFILE_ID, MONDAY, null);
    const resumed = resumePlan(paused, PROFILE_ID, WEDNESDAY);
    expect(pausesOf(resumed)[0]?.to).toBe(WEDNESDAY);
    expect(isPaused(pausesOf(resumed), WEDNESDAY)).toBe(false);
    expect(isPaused(pausesOf(resumed), TUESDAY)).toBe(true);
  });

  it("is a no-op when nothing is paused", () => {
    const s = seed(0);
    expect(resumePlan(s, PROFILE_ID, MONDAY)).toBe(s);
  });

  it("clamps a resume date earlier than the pause start to a zero-length pause", () => {
    const paused = pausePlan(seed(0), PROFILE_ID, WEDNESDAY, null);
    const resumed = resumePlan(paused, PROFILE_ID, MONDAY);
    expect(pausesOf(resumed)[0]?.to).toBe(WEDNESDAY);
    expect(isPaused(pausesOf(resumed), WEDNESDAY)).toBe(false);
  });

  it("allows a second pause after the first is closed", () => {
    const first = resumePlan(pausePlan(seed(0), PROFILE_ID, MONDAY, null), PROFILE_ID, WEDNESDAY);
    const second = pausePlan(first, PROFILE_ID, FRIDAY, null);
    expect(pausesOf(second)).toHaveLength(2);
  });
});

describe("invariant: the cursor is attendance-driven, not clock-driven (code review A11)", () => {
  it("60 days of clock advance with no completions leave nextSessionIndex unchanged", () => {
    const s = seed(0);
    const laterInstants = [1, 7, 30, 60].map((d) => NOW_MS + d * DAY_MS);
    for (const t of laterInstants) {
      // Nothing in cursor.ts reads a clock; the only clock input is an explicit argument.
      const untouched = startSession(s, PROFILE_ID, MONDAY, t);
      expect(cursorOf(untouched).nextSessionIndex).toBe(0);
    }
    expect(cursorOf(s).nextSessionIndex).toBe(0);
    expect(nextSession(planOf(s), cursorOf(s))?.id).toBe("s-1");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/domain/schedule/cursor.test.ts`

Expected: FAIL — `Error: Failed to resolve import "./cursor" from "src/domain/schedule/cursor.test.ts"`.

- [ ] **Step 4: Implement `src/domain/schedule/cursor.ts`**

Create `src/domain/schedule/cursor.ts`:

```ts
// src/domain/schedule/cursor.ts
//
// The plan cursor is the single authority on programme position. It advances by exactly one
// when a session is completed or explicitly skipped, and never on the passage of time.
// This replaces the legacy calendar-derived programPosition() (code review A11), the
// unread s.skipped map (A62), and the three competing definitions of "done" (A63).
//
// Every date argument is a LocalDate ("YYYY-MM-DD") in the profile's timezone, produced only
// by src/domain/dates.ts. Instants (EpochMs) are epoch milliseconds, UTC. No Date objects
// and no toISOString appear in this module.

import { compareLocalDate } from "../dates";
import { newId } from "../ids";
import type {
  AppState, EpochMs, LocalDate, PlanCursor, PlanPause, PlannedSession, PlanTemplate,
  SessionAssignment,
} from "../types";

/**
 * A pause covers the half-open local-date interval [from, to):
 * `from` is the first paused day and `to` is the first day the plan is active again.
 * `to === null` means the pause is still open.
 */
export function isPaused(pauses: PlanPause[], date: LocalDate): boolean {
  return pauses.some(
    (p) =>
      compareLocalDate(p.from, date) <= 0 &&
      (p.to === null || compareLocalDate(date, p.to) < 0),
  );
}

/** A terminal assignment has already moved the cursor; it is never advanced twice. */
export function isTerminal(a: SessionAssignment): boolean {
  return a.status === "completed" || a.status === "skipped";
}

/** Insert or replace the assignment for its date, keeping the list sorted by date. */
export function upsertAssignment(
  list: SessionAssignment[],
  next: SessionAssignment,
): SessionAssignment[] {
  const i = list.findIndex((a) => a.date === next.date);
  if (i < 0) {
    return [...list, next].sort((a, b) => compareLocalDate(a.date, b.date));
  }
  const copy = list.slice();
  copy[i] = next;
  return copy;
}

export function nextSession(plan: PlanTemplate, cursor: PlanCursor): PlannedSession | null {
  if (cursor.planId !== plan.id) return null;
  return plan.sessions[cursor.nextSessionIndex] ?? null;
}

interface Resolved {
  cursor: PlanCursor;
  plan: PlanTemplate;
  assignments: SessionAssignment[];
}

function resolve(state: AppState, profileId: string): Resolved | null {
  const cursor = state.cursors[profileId];
  if (!cursor) return null;
  const plan = state.plans[cursor.planId];
  if (!plan) return null;
  return { cursor, plan, assignments: state.assignments[profileId] ?? [] };
}

/**
 * The assignment already recorded for `date`, or a fresh `planned` one taken from the
 * cursor. Returns null once the plan is finished (nothing is left to assign).
 */
function assignmentFor(r: Resolved, date: LocalDate): SessionAssignment | null {
  const existing = r.assignments.find((a) => a.date === date);
  if (existing) return existing;
  const session = r.plan.sessions[r.cursor.nextSessionIndex];
  if (!session) return null;
  return {
    date,
    sessionId: session.id,
    sourceIndex: r.cursor.nextSessionIndex,
    status: "planned",
    startedAt: null,
    completedAt: null,
    skipReason: null,
  };
}

/**
 * Advance by exactly one. `completedOn` is stamped by whichever transition — complete or
 * skip — pushes the index past the last session, and it records the LocalDate of that
 * session, never a clock reading.
 *
 * Note on a stale day: if the user closes out a day whose recorded `sourceIndex` is behind
 * the cursor (they completed a later day first), the recorded sourceIndex is left alone as a
 * historical fact and the cursor still advances by one, so the "one session, one advance"
 * accounting stays exact.
 */
function advanceCursor(cursor: PlanCursor, plan: PlanTemplate, date: LocalDate): PlanCursor {
  const nextIndex = cursor.nextSessionIndex + 1;
  return {
    ...cursor,
    nextSessionIndex: nextIndex,
    completedOn: nextIndex >= plan.sessions.length ? date : cursor.completedOn,
  };
}

function withAssignment(
  state: AppState,
  profileId: string,
  assignments: SessionAssignment[],
  next: SessionAssignment,
): AppState["assignments"] {
  return { ...state.assignments, [profileId]: upsertAssignment(assignments, next) };
}

export function startSession(
  state: AppState,
  profileId: string,
  date: LocalDate,
  now: EpochMs,
): AppState {
  const r = resolve(state, profileId);
  if (!r) return state;
  const a = assignmentFor(r, date);
  if (!a || isTerminal(a)) return state;
  const next: SessionAssignment = {
    ...a,
    status: "in-progress",
    startedAt: a.startedAt ?? now, // first start wins; a resumed session keeps its origin
  };
  return { ...state, assignments: withAssignment(state, profileId, r.assignments, next) };
}

export function completeSession(
  state: AppState,
  profileId: string,
  date: LocalDate,
  now: EpochMs,
): AppState {
  const r = resolve(state, profileId);
  if (!r) return state;
  const a = assignmentFor(r, date);
  if (!a || isTerminal(a)) return state;
  const next: SessionAssignment = { ...a, status: "completed", completedAt: now };
  return {
    ...state,
    assignments: withAssignment(state, profileId, r.assignments, next),
    cursors: { ...state.cursors, [profileId]: advanceCursor(r.cursor, r.plan, date) },
  };
}

export function skipSession(
  state: AppState,
  profileId: string,
  date: LocalDate,
  reason: string | null,
): AppState {
  const r = resolve(state, profileId);
  if (!r) return state;
  const a = assignmentFor(r, date);
  if (!a || isTerminal(a)) return state;
  const next: SessionAssignment = { ...a, status: "skipped", skipReason: reason };
  return {
    ...state,
    assignments: withAssignment(state, profileId, r.assignments, next),
    cursors: { ...state.cursors, [profileId]: advanceCursor(r.cursor, r.plan, date) },
  };
}

export function pausePlan(
  state: AppState,
  profileId: string,
  from: LocalDate,
  reason: string | null,
): AppState {
  const list = state.pauses[profileId] ?? [];
  if (list.some((p) => p.to === null)) return state; // already paused: no-op
  const pause: PlanPause = { id: newId(), from, to: null, reason };
  return { ...state, pauses: { ...state.pauses, [profileId]: [...list, pause] } };
}

export function resumePlan(state: AppState, profileId: string, to: LocalDate): AppState {
  const list = state.pauses[profileId] ?? [];
  const i = list.findIndex((p) => p.to === null);
  if (i < 0) return state; // not paused: no-op
  const open = list[i];
  if (!open) return state;
  // A resume earlier than the pause start would be a negative interval; clamp to zero length.
  const end = compareLocalDate(to, open.from) < 0 ? open.from : to;
  const copy = list.slice();
  copy[i] = { ...open, to: end };
  return { ...state, pauses: { ...state.pauses, [profileId]: copy } };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/domain/schedule/cursor.test.ts`

Expected: PASS — `Test Files  1 passed (1)`, `Tests  32 passed (32)`.

- [ ] **Step 6: Run the full gate**

Run: `npm run lint && npx tsc --noEmit && npm test`

Expected: no lint errors, no type errors, all test files pass.

- [ ] **Step 7: Commit**

```bash
git add src/test/scheduleFixtures.ts src/domain/schedule/cursor.ts src/domain/schedule/cursor.test.ts
git commit -m "feat: attendance-driven plan cursor with pause, complete and skip transitions"
```

---

### Task 2: Projected calendar and pick-today reshuffle (`src/domain/schedule/calendar.ts`)

**Files:**
- Create: `src/domain/schedule/calendar.ts`
- Test: `src/domain/schedule/calendar.test.ts`

**Interfaces:**
- Consumes: `src/domain/schedule/cursor.ts` (`isPaused`, `isTerminal`, `upsertAssignment`);
  `src/domain/dates.ts` (`addDays`, `compareLocalDate`, `isoWeekday`, `weekEnd`);
  `src/test/scheduleFixtures.ts` in tests.
- Produces:
  ```ts
  export interface CalendarDay {
    date: LocalDate;
    slot: AvailabilitySlot | null;
    assignment: SessionAssignment | null;
    projectedSession: PlannedSession | null;
    paused: boolean;
  }
  export function projectedCalendar(state: AppState, profileId: string, from: LocalDate, days: number): CalendarDay[];
  export function remainingLabelsThisWeek(state: AppState, profileId: string, date: LocalDate): string[];
  export function assignToday(state: AppState, profileId: string, date: LocalDate, sessionLabel: string): AppState;
  ```

- [ ] **Step 1: Write the failing projection tests**

Create `src/domain/schedule/calendar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assignToday, projectedCalendar, remainingLabelsThisWeek } from "./calendar";
import { completeSession, pausePlan, skipSession, startSession } from "./cursor";
import {
  FRIDAY, MONDAY, NOW_MS, PROFILE_ID, SATURDAY, SUNDAY, THURSDAY, TUESDAY, WEDNESDAY,
  assignmentOn, cursorOf, labelMultiset, labelsOf, planOf, seedState,
} from "../../test/scheduleFixtures";

// Availability: Monday, Wednesday, Friday at 07:00. Plan labels run Push / Legs / Pull.
const LABELS = ["Push", "Legs", "Pull", "Push", "Legs", "Pull"];
const MWF = [1, 3, 5] as const;

function seed(nextSessionIndex = 0) {
  return seedState({ labels: LABELS, weekdays: [...MWF], nextSessionIndex });
}

describe("projectedCalendar", () => {
  it("returns one entry per requested day, starting at `from`", () => {
    const days = projectedCalendar(seed(), PROFILE_ID, MONDAY, 7);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.date)).toEqual([
      MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY,
    ]);
  });

  it("returns an empty array for a non-positive day count", () => {
    expect(projectedCalendar(seed(), PROFILE_ID, MONDAY, 0)).toEqual([]);
  });

  it("attaches the availability slot for the day's ISO weekday", () => {
    const days = projectedCalendar(seed(), PROFILE_ID, MONDAY, 3);
    expect(days[0]?.slot?.startTime).toBe("07:00");
    expect(days[1]?.slot).toBeNull();
    expect(days[2]?.slot?.weekday).toBe(3);
  });

  it("projects nothing on a day with no slot", () => {
    const days = projectedCalendar(seed(), PROFILE_ID, MONDAY, 2);
    expect(days[1]?.projectedSession).toBeNull();
  });

  it("walks the cursor forward over slot days only", () => {
    const days = projectedCalendar(seed(0), PROFILE_ID, MONDAY, 7);
    expect(days[0]?.projectedSession?.id).toBe("s-1"); // Mon
    expect(days[2]?.projectedSession?.id).toBe("s-2"); // Wed
    expect(days[4]?.projectedSession?.id).toBe("s-3"); // Fri
    expect(days[5]?.projectedSession).toBeNull();      // Sat
  });

  it("starts from the cursor's current index, not from zero", () => {
    const days = projectedCalendar(seed(2), PROFILE_ID, MONDAY, 5);
    expect(days[0]?.projectedSession?.id).toBe("s-3");
    expect(days[2]?.projectedSession?.id).toBe("s-4");
  });

  it("stops projecting once the plan is exhausted", () => {
    const days = projectedCalendar(seed(5), PROFILE_ID, MONDAY, 7);
    expect(days[0]?.projectedSession?.id).toBe("s-6");
    expect(days[2]?.projectedSession).toBeNull();
  });

  it("projects nothing on a paused day and does not consume a session", () => {
    const paused = pausePlan(seed(0), PROFILE_ID, WEDNESDAY, null);
    const days = projectedCalendar(paused, PROFILE_ID, MONDAY, 7);
    expect(days[0]?.projectedSession?.id).toBe("s-1"); // Mon before the pause
    expect(days[2]?.paused).toBe(true);
    expect(days[2]?.projectedSession).toBeNull();      // Wed consumed nothing
    expect(days[4]?.paused).toBe(true);
    expect(days[4]?.projectedSession).toBeNull();      // Fri still paused
  });

  it("resumes the walk at the same index after a closed pause", () => {
    const paused = pausePlan(seed(0), PROFILE_ID, TUESDAY, null);
    const resumed = { ...paused, pauses: { [PROFILE_ID]: [{ id: "p", from: TUESDAY, to: FRIDAY, reason: null }] } };
    const days = projectedCalendar(resumed, PROFILE_ID, MONDAY, 7);
    expect(days[0]?.projectedSession?.id).toBe("s-1"); // Mon
    expect(days[2]?.projectedSession).toBeNull();      // Wed paused
    expect(days[4]?.projectedSession?.id).toBe("s-2"); // Fri resumes at s-2
  });

  it("honours an existing non-terminal assignment and consumes one session for it", () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const days = projectedCalendar(started, PROFILE_ID, MONDAY, 5);
    expect(days[0]?.assignment?.status).toBe("in-progress");
    expect(days[0]?.projectedSession?.id).toBe("s-1");
    expect(days[2]?.projectedSession?.id).toBe("s-2");
  });

  it("does not double-count a terminal assignment, because the cursor already moved", () => {
    const done = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const days = projectedCalendar(done, PROFILE_ID, MONDAY, 5);
    expect(days[0]?.assignment?.status).toBe("completed");
    expect(days[0]?.projectedSession?.id).toBe("s-1");
    expect(days[2]?.projectedSession?.id).toBe("s-2"); // Wed, not s-3
  });

  it("keeps a skipped day visible with the session it was going to be", () => {
    const skipped = skipSession(seed(0), PROFILE_ID, MONDAY, "illness");
    const days = projectedCalendar(skipped, PROFILE_ID, MONDAY, 5);
    expect(days[0]?.assignment?.status).toBe("skipped");
    expect(days[0]?.projectedSession?.id).toBe("s-1");
    expect(days[2]?.projectedSession?.id).toBe("s-2");
  });

  it("reports slots and pauses but no sessions when there is no plan", () => {
    const s = seed(0);
    const noPlan = { ...s, plans: {}, cursors: {} };
    const days = projectedCalendar(noPlan, PROFILE_ID, MONDAY, 3);
    expect(days[0]?.slot?.startTime).toBe("07:00");
    expect(days[0]?.projectedSession).toBeNull();
  });

  it("returns bare days for an unknown profile", () => {
    const days = projectedCalendar(seed(0), "nobody", MONDAY, 2);
    expect(days).toHaveLength(2);
    expect(days[0]?.slot).toBeNull();
    expect(days[0]?.projectedSession).toBeNull();
    expect(days[0]?.assignment).toBeNull();
  });
});

describe("remainingLabelsThisWeek", () => {
  it("lists the distinct labels of the week's remaining sessions, in order", () => {
    expect(remainingLabelsThisWeek(seed(0), PROFILE_ID, MONDAY)).toEqual(["Push", "Legs", "Pull"]);
  });

  it("shrinks as the week is consumed", () => {
    const done = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    expect(remainingLabelsThisWeek(done, PROFILE_ID, WEDNESDAY)).toEqual(["Legs", "Pull"]);
  });

  it("is empty once the plan is finished", () => {
    expect(remainingLabelsThisWeek(seed(6), PROFILE_ID, MONDAY)).toEqual([]);
  });

  it("counts a non-slot day as trainable, so today is always offered a choice", () => {
    expect(remainingLabelsThisWeek(seed(0), PROFILE_ID, TUESDAY)).toEqual(["Push", "Legs", "Pull"]);
  });
});

describe("assignToday", () => {
  it("swaps the picked label into today's position", () => {
    const next = assignToday(seed(0), PROFILE_ID, MONDAY, "Legs");
    expect(labelsOf(planOf(next))).toEqual(["Legs", "Push", "Pull", "Push", "Legs", "Pull"]);
    expect(assignmentOn(next, MONDAY)?.sessionId).toBe("s-2");
    expect(assignmentOn(next, MONDAY)?.sourceIndex).toBe(0);
    expect(assignmentOn(next, MONDAY)?.status).toBe("planned");
  });

  it("makes the next slot day project the session it displaced", () => {
    const next = assignToday(seed(0), PROFILE_ID, MONDAY, "Legs");
    const days = projectedCalendar(next, PROFILE_ID, MONDAY, 5);
    expect(days[0]?.projectedSession?.label).toBe("Legs");
    expect(days[2]?.projectedSession?.label).toBe("Push"); // Wednesday
  });

  it("is a swap, not a rotation: a non-adjacent pick leaves the middle session in place", () => {
    const s = seedState({ labels: ["Push", "Pull", "Legs", "Push", "Pull", "Legs"], weekdays: [...MWF] });
    const next = assignToday(s, PROFILE_ID, MONDAY, "Legs");
    expect(labelsOf(planOf(next)).slice(0, 3)).toEqual(["Legs", "Pull", "Push"]);
    const days = projectedCalendar(next, PROFILE_ID, MONDAY, 5);
    expect(days[2]?.projectedSession?.label).toBe("Pull"); // Wednesday
    expect(days[4]?.projectedSession?.label).toBe("Push"); // Friday
  });

  it("preserves the multiset of labels in the week window", () => {
    const before = seed(0);
    const after = assignToday(before, PROFILE_ID, MONDAY, "Pull");
    expect(labelMultiset(planOf(after), 0, 2)).toEqual(labelMultiset(planOf(before), 0, 2));
    expect(labelMultiset(planOf(after), 0, 5)).toEqual(labelMultiset(planOf(before), 0, 5));
  });

  it("keeps the positional ordinal invariant after the swap", () => {
    const next = assignToday(seed(0), PROFILE_ID, MONDAY, "Pull");
    planOf(next).sessions.forEach((s, i) => {
      expect(s.ordinal).toBe(i + 1);
    });
  });

  it("does not reach past the end of the current ISO week", () => {
    // Friday: the window is Friday alone, so only Friday's own label is reachable.
    const s = seed(0);
    expect(remainingLabelsThisWeek(s, PROFILE_ID, FRIDAY)).toEqual(["Push"]);
    const next = assignToday(s, PROFILE_ID, FRIDAY, "Pull");
    expect(next).toBe(s); // "Pull" is next week's business
  });

  it("is a no-op when the label is not in the plan at all", () => {
    const s = seed(0);
    expect(assignToday(s, PROFILE_ID, MONDAY, "Cardio")).toBe(s);
  });

  it("is a no-op when the picked label is already today's projection", () => {
    const s = seed(0);
    const next = assignToday(s, PROFILE_ID, MONDAY, "Push");
    expect(labelsOf(planOf(next))).toEqual(labelsOf(planOf(s)));
    expect(assignmentOn(next, MONDAY)?.sessionId).toBe("s-1"); // still materialised
  });

  it("replaces an earlier pick on the same day", () => {
    const once = assignToday(seed(0), PROFILE_ID, MONDAY, "Legs");
    const twice = assignToday(once, PROFILE_ID, MONDAY, "Pull");
    expect(assignmentOn(twice, MONDAY)?.sessionId).toBe("s-3");
    expect(labelMultiset(planOf(twice), 0, 2)).toEqual(["Legs", "Pull", "Push"]);
  });

  it("keeps an in-progress day in progress", () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const next = assignToday(started, PROFILE_ID, MONDAY, "Legs");
    expect(assignmentOn(next, MONDAY)?.status).toBe("in-progress");
    expect(assignmentOn(next, MONDAY)?.startedAt).toBe(NOW_MS);
  });

  it("is a no-op on a completed day", () => {
    const done = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    expect(assignToday(done, PROFILE_ID, MONDAY, "Pull")).toBe(done);
  });

  it("is a no-op once the plan is finished", () => {
    const s = seed(6);
    expect(assignToday(s, PROFILE_ID, MONDAY, "Push")).toBe(s);
  });

  it("does not move the cursor", () => {
    const next = assignToday(seed(0), PROFILE_ID, MONDAY, "Legs");
    expect(cursorOf(next).nextSessionIndex).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/schedule/calendar.test.ts`

Expected: FAIL — `Error: Failed to resolve import "./calendar" from "src/domain/schedule/calendar.test.ts"`.

- [ ] **Step 3: Implement `src/domain/schedule/calendar.ts`**

Create `src/domain/schedule/calendar.ts`:

```ts
// src/domain/schedule/calendar.ts
//
// Projection: what each of the next N days would be if every scheduled session were
// completed in order. The projection never writes state and never reads a clock — the caller
// supplies the starting LocalDate.
//
// assignToday() is the "train something else today" reshuffle. It is a SWAP inside the
// current ISO week's remaining window, so the multiset of labels the week contains is
// unchanged; the displaced session lands exactly where the picked one was.

import { addDays, compareLocalDate, isoWeekday, weekEnd } from "../dates";
import { isPaused, isTerminal, upsertAssignment } from "./cursor";
import type {
  AppState, AvailabilitySlot, IsoWeekday, LocalDate, PlanCursor, PlanTemplate,
  PlannedSession, SessionAssignment,
} from "../types";

export interface CalendarDay {
  date: LocalDate;
  slot: AvailabilitySlot | null;
  assignment: SessionAssignment | null;
  projectedSession: PlannedSession | null;
  paused: boolean;
}

function slotsByWeekday(state: AppState, profileId: string): Map<IsoWeekday, AvailabilitySlot> {
  const map = new Map<IsoWeekday, AvailabilitySlot>();
  for (const slot of state.availability[profileId]?.slots ?? []) {
    if (!map.has(slot.weekday)) map.set(slot.weekday, slot); // one slot per weekday; first wins
  }
  return map;
}

function assignmentsByDate(state: AppState, profileId: string): Map<LocalDate, SessionAssignment> {
  const map = new Map<LocalDate, SessionAssignment>();
  for (const a of state.assignments[profileId] ?? []) map.set(a.date, a);
  return map;
}

export function projectedCalendar(
  state: AppState,
  profileId: string,
  from: LocalDate,
  days: number,
): CalendarDay[] {
  const cursor = state.cursors[profileId] ?? null;
  const plan = cursor ? (state.plans[cursor.planId] ?? null) : null;
  const pauses = state.pauses[profileId] ?? [];
  const slots = slotsByWeekday(state, profileId);
  const byDate = assignmentsByDate(state, profileId);
  const byId = new Map<string, PlannedSession>();
  for (const s of plan?.sessions ?? []) byId.set(s.id, s);

  let walk = cursor ? cursor.nextSessionIndex : 0;
  const out: CalendarDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const paused = isPaused(pauses, date);
    const slot = slots.get(isoWeekday(date)) ?? null;
    const assignment = byDate.get(date) ?? null;
    let projectedSession: PlannedSession | null = null;

    if (assignment) {
      // A recorded day is a fact: it shows the session it was given, whatever the slot says.
      projectedSession = byId.get(assignment.sessionId) ?? null;
      // A terminal day already advanced the real cursor, so the walk must not count it again.
      if (projectedSession && !isTerminal(assignment)) walk += 1;
    } else if (!paused && slot && plan) {
      projectedSession = plan.sessions[walk] ?? null;
      if (projectedSession) walk += 1;
    }

    out.push({ date, slot, assignment, projectedSession, paused });
  }
  return out;
}

/**
 * Days in [date, weekEnd(date)] that would consume a session, counting `date` itself as one
 * because the user is choosing to train it. Mirrors the consumption rule in
 * projectedCalendar exactly.
 */
function remainingConsumingDays(state: AppState, profileId: string, date: LocalDate): number {
  const pauses = state.pauses[profileId] ?? [];
  const byDate = assignmentsByDate(state, profileId);
  const slotWeekdays = new Set<IsoWeekday>(
    (state.availability[profileId]?.slots ?? []).map((s) => s.weekday),
  );
  const end = weekEnd(date);
  let n = 1;
  for (let d = addDays(date, 1); compareLocalDate(d, end) <= 0; d = addDays(d, 1)) {
    const a = byDate.get(d);
    if (a) {
      if (!isTerminal(a)) n += 1;
      continue;
    }
    if (isPaused(pauses, d)) continue;
    if (slotWeekdays.has(isoWeekday(d))) n += 1;
  }
  return n;
}

interface SwapWindow {
  plan: PlanTemplate;
  cursor: PlanCursor;
  target: number; // index today consumes
  end: number;    // last index reachable inside this ISO week
}

function swapWindow(state: AppState, profileId: string, date: LocalDate): SwapWindow | null {
  const cursor = state.cursors[profileId];
  if (!cursor) return null;
  const plan = state.plans[cursor.planId];
  if (!plan) return null;
  const target = cursor.nextSessionIndex;
  if (target >= plan.sessions.length) return null; // plan finished
  const span = remainingConsumingDays(state, profileId, date);
  const end = Math.min(target + span - 1, plan.sessions.length - 1);
  return { plan, cursor, target, end };
}

/** Distinct labels available to `assignToday` on `date`, in window order. */
export function remainingLabelsThisWeek(
  state: AppState,
  profileId: string,
  date: LocalDate,
): string[] {
  const w = swapWindow(state, profileId, date);
  if (!w) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = w.target; i <= w.end; i++) {
    const s = w.plan.sessions[i];
    if (!s || seen.has(s.label)) continue;
    seen.add(s.label);
    out.push(s.label);
  }
  return out;
}

export function assignToday(
  state: AppState,
  profileId: string,
  date: LocalDate,
  sessionLabel: string,
): AppState {
  const w = swapWindow(state, profileId, date);
  if (!w) return state;

  const assignments = state.assignments[profileId] ?? [];
  const existing = assignments.find((a) => a.date === date) ?? null;
  if (existing && isTerminal(existing)) return state; // a finished day is a record, not a choice

  let pick = -1;
  for (let i = w.target; i <= w.end; i++) {
    const s = w.plan.sessions[i];
    if (s && s.label === sessionLabel) {
      pick = i;
      break;
    }
  }
  if (pick < 0) return state; // that label is not in this week's remainder

  let plan = w.plan;
  if (pick !== w.target) {
    const sessions = w.plan.sessions.slice();
    const atTarget = sessions[w.target];
    const atPick = sessions[pick];
    if (!atTarget || !atPick) return state;
    // Swap positions and restore the positional invariant sessions[i].ordinal === i + 1.
    sessions[w.target] = { ...atPick, ordinal: w.target + 1 };
    sessions[pick] = { ...atTarget, ordinal: pick + 1 };
    plan = { ...w.plan, sessions };
  }

  const chosen = plan.sessions[w.target];
  if (!chosen) return state;
  const next: SessionAssignment = {
    date,
    sessionId: chosen.id,
    sourceIndex: w.target,
    status: existing?.status === "in-progress" ? "in-progress" : "planned",
    startedAt: existing?.startedAt ?? null,
    completedAt: null,
    skipReason: null,
  };

  return {
    ...state,
    plans: { ...state.plans, [plan.id]: plan },
    assignments: { ...state.assignments, [profileId]: upsertAssignment(assignments, next) },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/schedule/calendar.test.ts`

Expected: PASS — `Test Files  1 passed (1)`, `Tests  31 passed (31)`.

- [ ] **Step 5: Run the full gate**

Run: `npm run lint && npx tsc --noEmit && npm test`

Expected: no lint errors, no type errors, all test files pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/schedule/calendar.ts src/domain/schedule/calendar.test.ts
git commit -m "feat: projected calendar and label-preserving pick-today reshuffle"
```

---

### Task 3: Weekly review closure (`src/domain/schedule/weekly.ts`)

**Files:**
- Create: `src/domain/schedule/weekly.ts`
- Test: `src/domain/schedule/weekly.test.ts`

**Interfaces:**
- Consumes: `src/domain/dates.ts` (`addDays`, `compareLocalDate`, `todayLocal`, `weekEnd`,
  `weekStart`); `src/domain/types.ts` (`WeeklyReview`).
- Produces:
  ```ts
  export const MAX_WEEKS_EVALUATED = 520;
  export function closeWeeks(state: AppState, profileId: string, now: EpochMs): AppState;
  ```

- [ ] **Step 1: Write the failing weekly-closure tests**

Create `src/domain/schedule/weekly.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { closeWeeks } from "./weekly";
import { completeSession, pausePlan, skipSession } from "./cursor";
import {
  DAY_MS, NOW_MS, PREV_FRIDAY, PREV_MONDAY, PREV_SUNDAY, PREV_WEDNESDAY, PROFILE_ID,
  TZ_ATHENS, TZ_LOS_ANGELES, seedState,
} from "../../test/scheduleFixtures";
import type { AppState, WeeklyReview } from "../types";

const LABELS = ["Push", "Legs", "Pull", "Push", "Legs", "Pull"];
const MWF = [1, 3, 5] as const;

// The programme starts on Monday 2026-08-31, so the week 2026-08-31 .. 2026-09-06 is the
// first candidate for closure. NOW_MS is 2026-09-07T06:30Z.
function seed(timezone: string): AppState {
  return seedState({
    labels: LABELS,
    weekdays: [...MWF],
    weeklySessionTarget: 3,
    startedOn: PREV_MONDAY,
    timezone,
  });
}

function reviews(state: AppState): WeeklyReview[] {
  return state.weeklyReviews[PROFILE_ID] ?? [];
}

describe("closeWeeks — ISO week boundary is read in the profile's timezone", () => {
  it("closes the finished week in Europe/Athens, where the instant is Monday 09:30", () => {
    const out = closeWeeks(seed(TZ_ATHENS), PROFILE_ID, NOW_MS);
    expect(reviews(out)).toHaveLength(1);
    expect(reviews(out)[0]?.weekStart).toBe(PREV_MONDAY);
    expect(reviews(out)[0]?.weekEnd).toBe(PREV_SUNDAY);
  });

  it("closes nothing in America/Los_Angeles, where the same instant is Sunday 23:30", () => {
    const state = seed(TZ_LOS_ANGELES);
    const out = closeWeeks(state, PROFILE_ID, NOW_MS);
    expect(out).toBe(state);
    expect(reviews(out)).toHaveLength(0);
  });

  it("never evaluates the current, unfinished week", () => {
    const out = closeWeeks(seed(TZ_ATHENS), PROFILE_ID, NOW_MS);
    expect(reviews(out).map((r) => r.weekStart)).not.toContain("2026-09-07");
  });
});

describe("closeWeeks — counting", () => {
  it("counts completed and skipped assignments inside the week", () => {
    let s = seed(TZ_ATHENS);
    s = completeSession(s, PROFILE_ID, PREV_MONDAY, NOW_MS - 6 * DAY_MS);
    s = completeSession(s, PROFILE_ID, PREV_WEDNESDAY, NOW_MS - 4 * DAY_MS);
    s = skipSession(s, PROFILE_ID, PREV_FRIDAY, "travel");
    const out = closeWeeks(s, PROFILE_ID, NOW_MS);
    const r = reviews(out)[0];
    expect(r?.completed).toBe(2);
    expect(r?.skipped).toBe(1);
    expect(r?.target).toBe(3);
    expect(r?.delta).toBe(-1);
    expect(r?.missHandled).toBe(false);
    expect(r?.paused).toBe(false);
    expect(r?.evaluatedAt).toBe(NOW_MS);
    expect(r?.profileId).toBe(PROFILE_ID);
  });

  it("marks a met target with delta 0 and missHandled true", () => {
    let s = seed(TZ_ATHENS);
    s = completeSession(s, PROFILE_ID, PREV_MONDAY, NOW_MS);
    s = completeSession(s, PROFILE_ID, PREV_WEDNESDAY, NOW_MS);
    s = completeSession(s, PROFILE_ID, PREV_FRIDAY, NOW_MS);
    const r = reviews(closeWeeks(s, PROFILE_ID, NOW_MS))[0];
    expect(r?.delta).toBe(0);
    expect(r?.missHandled).toBe(true);
  });

  it("allows a positive delta when the user exceeds the target", () => {
    let s = seedState({
      labels: LABELS, weekdays: [...MWF], weeklySessionTarget: 2,
      startedOn: PREV_MONDAY, timezone: TZ_ATHENS,
    });
    s = completeSession(s, PROFILE_ID, PREV_MONDAY, NOW_MS);
    s = completeSession(s, PROFILE_ID, PREV_WEDNESDAY, NOW_MS);
    s = completeSession(s, PROFILE_ID, PREV_FRIDAY, NOW_MS);
    const r = reviews(closeWeeks(s, PROFILE_ID, NOW_MS))[0];
    expect(r?.delta).toBe(1);
    expect(r?.missHandled).toBe(true);
  });

  it("ignores assignments outside the week", () => {
    let s = seed(TZ_ATHENS);
    s = completeSession(s, PROFILE_ID, "2026-08-28", NOW_MS); // previous week
    const r = reviews(closeWeeks(s, PROFILE_ID, NOW_MS)).find((x) => x.weekStart === PREV_MONDAY);
    expect(r?.completed).toBe(0);
  });
});

describe("closeWeeks — pauses", () => {
  it("a paused week never yields a negative delta", () => {
    const paused = pausePlan(seed(TZ_ATHENS), PROFILE_ID, PREV_WEDNESDAY, "illness");
    const r = reviews(closeWeeks(paused, PROFILE_ID, NOW_MS))[0];
    expect(r?.paused).toBe(true);
    expect(r?.delta).toBe(0);
    expect(r?.completed).toBe(0);
    expect(r?.missHandled).toBe(true);
  });

  it("detects a pause that only overlaps the week's last day", () => {
    const paused = pausePlan(seed(TZ_ATHENS), PROFILE_ID, PREV_SUNDAY, null);
    expect(reviews(closeWeeks(paused, PROFILE_ID, NOW_MS))[0]?.paused).toBe(true);
  });

  it("does not mark a week paused when the pause ended before it began", () => {
    const s = seed(TZ_ATHENS);
    const withPause = {
      ...s,
      pauses: { [PROFILE_ID]: [{ id: "p", from: "2026-08-20", to: PREV_MONDAY, reason: null }] },
    };
    expect(reviews(closeWeeks(withPause, PROFILE_ID, NOW_MS))[0]?.paused).toBe(false);
  });
});

describe("closeWeeks — idempotence and bounds", () => {
  it("adds nothing on a second run", () => {
    const once = closeWeeks(seed(TZ_ATHENS), PROFILE_ID, NOW_MS);
    const twice = closeWeeks(once, PROFILE_ID, NOW_MS);
    expect(twice).toBe(once);
    expect(reviews(twice)).toHaveLength(1);
  });

  it("closes every intervening week in one run, in date order", () => {
    const out = closeWeeks(seed(TZ_ATHENS), PROFILE_ID, NOW_MS + 28 * DAY_MS);
    expect(reviews(out).map((r) => r.weekStart)).toEqual([
      "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28",
    ]);
  });

  it("leaves the cursor untouched over a 60-day clock advance with no completions", () => {
    const s = seed(TZ_ATHENS);
    const out = closeWeeks(s, PROFILE_ID, NOW_MS + 60 * DAY_MS);
    expect(out.cursors[PROFILE_ID]?.nextSessionIndex).toBe(0);
    expect(reviews(out).every((r) => r.delta === -3)).toBe(true);
  });

  it("is a no-op without a profile, availability, or cursor", () => {
    const s = seed(TZ_ATHENS);
    expect(closeWeeks({ ...s, profiles: {} }, PROFILE_ID, NOW_MS)).toEqual({ ...s, profiles: {} });
    expect(closeWeeks({ ...s, availability: {} }, PROFILE_ID, NOW_MS)).toEqual({ ...s, availability: {} });
    expect(closeWeeks({ ...s, cursors: {} }, PROFILE_ID, NOW_MS)).toEqual({ ...s, cursors: {} });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/schedule/weekly.test.ts`

Expected: FAIL — `Error: Failed to resolve import "./weekly" from "src/domain/schedule/weekly.test.ts"`.

- [ ] **Step 3: Implement `src/domain/schedule/weekly.ts`**

Create `src/domain/schedule/weekly.ts`:

```ts
// src/domain/schedule/weekly.ts
//
// Weekly review closure. An ISO week (Monday to Sunday in the profile's timezone) is
// evaluated once, only after it has ended, and never while it is still running. The result
// is the input P6 uses to decide whether a week was lost.
//
// delta = completed − target (signed: negative means sessions missed).
// A week overlapped by any pause is paused = true and delta = 0, so a deliberate pause can
// never register as a miss.

import { addDays, compareLocalDate, todayLocal, weekEnd, weekStart } from "../dates";
import type { AppState, EpochMs, WeeklyReview } from "../types";

/** Bounds the walk if `startedOn` is far in the past or corrupt: 520 weeks = 10 years. */
export const MAX_WEEKS_EVALUATED = 520;

export function closeWeeks(state: AppState, profileId: string, now: EpochMs): AppState {
  const profile = state.profiles[profileId];
  if (!profile) return state;
  const availability = state.availability[profileId];
  if (!availability) return state;
  const cursor = state.cursors[profileId];
  if (!cursor) return state;

  const today = todayLocal(profile.timezone, now);
  const existing = state.weeklyReviews[profileId] ?? [];
  const alreadyReviewed = new Set(existing.map((r) => r.weekStart));
  const assignments = state.assignments[profileId] ?? [];
  const pauses = state.pauses[profileId] ?? [];
  const target = availability.weeklySessionTarget;

  const added: WeeklyReview[] = [];
  let ws = weekStart(cursor.startedOn);

  for (let guard = 0; guard < MAX_WEEKS_EVALUATED; guard++) {
    const we = weekEnd(ws);
    // The current week is never evaluated: it must have ended strictly before today.
    if (compareLocalDate(we, today) >= 0) break;

    if (!alreadyReviewed.has(ws)) {
      let completed = 0;
      let skipped = 0;
      for (const a of assignments) {
        if (compareLocalDate(a.date, ws) < 0) continue;
        if (compareLocalDate(we, a.date) < 0) continue;
        if (a.status === "completed") completed += 1;
        else if (a.status === "skipped") skipped += 1;
      }
      // Pause intervals are half-open [from, to); overlap with [ws, we] is
      // from <= we AND (to === null OR to > ws).
      const paused = pauses.some(
        (p) =>
          compareLocalDate(p.from, we) <= 0 &&
          (p.to === null || compareLocalDate(ws, p.to) < 0),
      );
      const delta = paused ? 0 : completed - target;
      added.push({
        profileId,
        weekStart: ws,
        weekEnd: we,
        target,
        completed,
        skipped,
        paused,
        delta,
        evaluatedAt: now,
        missHandled: delta >= 0, // only a negative delta is left for P6 to act on
      });
    }
    ws = addDays(ws, 7);
  }

  if (added.length === 0) return state;
  const merged = [...existing, ...added].sort((a, b) => compareLocalDate(a.weekStart, b.weekStart));
  return { ...state, weeklyReviews: { ...state.weeklyReviews, [profileId]: merged } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/schedule/weekly.test.ts`

Expected: PASS — `Test Files  1 passed (1)`, `Tests  15 passed (15)`.

- [ ] **Step 5: Run the full gate**

Run: `npm run lint && npx tsc --noEmit && npm test`

Expected: no lint errors, no type errors, all test files pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/schedule/weekly.ts src/domain/schedule/weekly.test.ts
git commit -m "feat: ISO weekly review closure in the profile timezone"
```

---

### Task 4: Store actions, selectors, and the weekly-close effect

**Files:**
- Create: `src/store/scheduleActions.ts`
- Create: `src/store/scheduleSelectors.ts`
- Create: `src/app/useWeeklyClose.ts`
- Modify: `src/store/index.ts` (three insertions, located by reading the file)
- Modify: `src/app/App.tsx` (two insertions, located by reading the file)
- Test: `src/store/scheduleActions.test.ts`
- Test: `src/app/useWeeklyClose.test.tsx`

**Interfaces:**
- Consumes: `src/domain/schedule/cursor.ts`, `src/domain/schedule/calendar.ts`,
  `src/domain/schedule/weekly.ts`, `src/store/index.ts` (`useAppStore`).
- Produces:
  ```ts
  // src/store/scheduleActions.ts
  export interface ScheduleActionDeps { set(updater: (state: AppState) => AppState): void; }
  export interface ScheduleActions {
    startSession(profileId: string, date: LocalDate, now: EpochMs): void;
    completeSession(profileId: string, date: LocalDate, now: EpochMs): void;
    skipSession(profileId: string, date: LocalDate, reason: string | null): void;
    pausePlan(profileId: string, from: LocalDate, reason: string | null): void;
    resumePlan(profileId: string, to: LocalDate): void;
    assignToday(profileId: string, date: LocalDate, label: string): void;
    closeWeeks(profileId: string, now: EpochMs): void;
    setUi(patch: Partial<UiPrefs>): void;
  }
  export function createScheduleActions(deps: ScheduleActionDeps): ScheduleActions;

  // src/store/scheduleSelectors.ts
  export function selectTimeZone(state: AppState): TimeZone;
  export function selectPlan(state: AppState): PlanTemplate | null;
  export function selectCursor(state: AppState): PlanCursor | null;
  export function selectCalendar(state: AppState, profileId: string, from: LocalDate, days: number): readonly CalendarDay[];
  export function selectRemainingLabels(state: AppState, profileId: string, date: LocalDate): readonly string[];
  export function useTimeZone(): TimeZone;
  export function useTodayDate(): LocalDate;
  export function useActiveProfileId(): string | null;
  export function usePlan(): PlanTemplate | null;
  export function useCursor(): PlanCursor | null;
  export function useUpcoming(days: number): readonly CalendarDay[];
  export function useTodayPlan(): CalendarDay | null;
  export function useRemainingLabels(date: LocalDate | null): readonly string[];

  // src/app/useWeeklyClose.ts
  export function useWeeklyClose(): void;
  ```

- [ ] **Step 1: Write the failing action-slice tests**

Create `src/store/scheduleActions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createScheduleActions, type ScheduleActions } from "./scheduleActions";
import {
  MONDAY, NOW_MS, PREV_MONDAY, PROFILE_ID, TZ_ATHENS, WEDNESDAY, seedState,
} from "../test/scheduleFixtures";
import type { AppState } from "../domain/types";

const LABELS = ["Push", "Legs", "Pull", "Push", "Legs", "Pull"];
const MWF = [1, 3, 5] as const;

interface Harness {
  actions: ScheduleActions;
  read(): AppState;
}

function harness(initial: AppState): Harness {
  let state = initial;
  const actions = createScheduleActions({
    set: (updater) => {
      state = updater(state);
    },
  });
  return { actions, read: () => state };
}

function seed(): AppState {
  return seedState({ labels: LABELS, weekdays: [...MWF], startedOn: PREV_MONDAY, timezone: TZ_ATHENS });
}

describe("createScheduleActions", () => {
  it("startSession writes an in-progress assignment", () => {
    const h = harness(seed());
    h.actions.startSession(PROFILE_ID, MONDAY, NOW_MS);
    const a = h.read().assignments[PROFILE_ID]?.[0];
    expect(a?.status).toBe("in-progress");
    expect(a?.startedAt).toBe(NOW_MS);
  });

  it("completeSession advances the cursor", () => {
    const h = harness(seed());
    h.actions.completeSession(PROFILE_ID, MONDAY, NOW_MS);
    expect(h.read().cursors[PROFILE_ID]?.nextSessionIndex).toBe(1);
  });

  it("skipSession records the reason and advances the cursor", () => {
    const h = harness(seed());
    h.actions.skipSession(PROFILE_ID, MONDAY, "illness");
    expect(h.read().assignments[PROFILE_ID]?.[0]?.skipReason).toBe("illness");
    expect(h.read().cursors[PROFILE_ID]?.nextSessionIndex).toBe(1);
  });

  it("pausePlan then resumePlan closes the pause", () => {
    const h = harness(seed());
    h.actions.pausePlan(PROFILE_ID, MONDAY, "travel");
    expect(h.read().pauses[PROFILE_ID]?.[0]?.to).toBeNull();
    h.actions.resumePlan(PROFILE_ID, WEDNESDAY);
    expect(h.read().pauses[PROFILE_ID]?.[0]?.to).toBe(WEDNESDAY);
  });

  it("assignToday swaps the label into today's slot", () => {
    const h = harness(seed());
    h.actions.assignToday(PROFILE_ID, MONDAY, "Legs");
    expect(h.read().assignments[PROFILE_ID]?.[0]?.sessionId).toBe("s-2");
    expect(h.read().plans["plan-1"]?.sessions[0]?.label).toBe("Legs");
  });

  it("closeWeeks writes the finished week's review", () => {
    const h = harness(seed());
    h.actions.closeWeeks(PROFILE_ID, NOW_MS);
    expect(h.read().weeklyReviews[PROFILE_ID]).toHaveLength(1);
  });

  it("setUi patches ui preferences without dropping the others", () => {
    const h = harness(seed());
    h.actions.setUi({ lastView: "train" });
    expect(h.read().ui.lastView).toBe("train");
    expect(h.read().ui.bootSeen).toBe(true);
    expect(h.read().ui.density).toBe("normal");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/store/scheduleActions.test.ts`

Expected: FAIL — `Error: Failed to resolve import "./scheduleActions" from "src/store/scheduleActions.test.ts"`.

- [ ] **Step 3: Implement `src/store/scheduleActions.ts`**

Create `src/store/scheduleActions.ts`:

```ts
// src/store/scheduleActions.ts
//
// The store's schedule actions. Every one of them is a one-line call into a pure domain
// function, so the behaviour is tested in the domain modules and the wiring is tested here.
// No date, no clock, and no branching lives in this file.

import { assignToday as assignTodayPure } from "../domain/schedule/calendar";
import {
  completeSession as completeSessionPure,
  pausePlan as pausePlanPure,
  resumePlan as resumePlanPure,
  skipSession as skipSessionPure,
  startSession as startSessionPure,
} from "../domain/schedule/cursor";
import { closeWeeks as closeWeeksPure } from "../domain/schedule/weekly";
import type { AppState, EpochMs, LocalDate, UiPrefs } from "../domain/types";

export interface ScheduleActionDeps {
  /** Applies a pure AppState transition. Zustand's `set` is adapted to this in index.ts. */
  set(updater: (state: AppState) => AppState): void;
}

export interface ScheduleActions {
  startSession(profileId: string, date: LocalDate, now: EpochMs): void;
  completeSession(profileId: string, date: LocalDate, now: EpochMs): void;
  skipSession(profileId: string, date: LocalDate, reason: string | null): void;
  pausePlan(profileId: string, from: LocalDate, reason: string | null): void;
  resumePlan(profileId: string, to: LocalDate): void;
  assignToday(profileId: string, date: LocalDate, label: string): void;
  closeWeeks(profileId: string, now: EpochMs): void;
  setUi(patch: Partial<UiPrefs>): void;
}

export function createScheduleActions(deps: ScheduleActionDeps): ScheduleActions {
  return {
    startSession: (profileId, date, now) =>
      deps.set((s) => startSessionPure(s, profileId, date, now)),
    completeSession: (profileId, date, now) =>
      deps.set((s) => completeSessionPure(s, profileId, date, now)),
    skipSession: (profileId, date, reason) =>
      deps.set((s) => skipSessionPure(s, profileId, date, reason)),
    pausePlan: (profileId, from, reason) =>
      deps.set((s) => pausePlanPure(s, profileId, from, reason)),
    resumePlan: (profileId, to) => deps.set((s) => resumePlanPure(s, profileId, to)),
    assignToday: (profileId, date, label) =>
      deps.set((s) => assignTodayPure(s, profileId, date, label)),
    closeWeeks: (profileId, now) => deps.set((s) => closeWeeksPure(s, profileId, now)),
    setUi: (patch) => deps.set((s) => ({ ...s, ui: { ...s.ui, ...patch } })),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/store/scheduleActions.test.ts`

Expected: PASS — `Test Files  1 passed (1)`, `Tests  7 passed (7)`.

- [ ] **Step 5: Wire the slice into the store**

Read `src/store/index.ts` and note two things: the name of the state type passed to
`create<...>()`, and the position of the store initialiser's returned object literal.

Insertion 1 — add to the import block at the top of the file:

```ts
import { createScheduleActions, type ScheduleActions } from "./scheduleActions";
```

Insertion 2 — intersect the store's state type with `ScheduleActions`. If the type is
declared as e.g. `export type StoreState = AppState & AppActions & { session: SessionSlice };`,
append the intersection member so it reads:

```ts
export type StoreState = AppState & AppActions & { session: SessionSlice } & ScheduleActions;
```

(If `AppActions` already declares the P3 method signatures from master §6.7, the intersection
is a no-op at the type level and still compiles, because the signatures are identical.)

Insertion 3 — spread the slice into the object returned by the store initialiser, as the
**last** entry so it takes precedence over any placeholder implementations from P1:

```ts
      ...createScheduleActions({ set: (updater) => set((s) => updater(s)) }),
```

- [ ] **Step 6: Verify the store still type-checks and boots**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; all existing test files still pass.

- [ ] **Step 7: Write the failing selector and effect tests**

Create `src/app/useWeeklyClose.test.tsx`:

```tsx
// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWeeklyClose } from "./useWeeklyClose";
import { useAppStore } from "../store";
import {
  NOW_MS, PREV_MONDAY, PROFILE_ID, TZ_ATHENS, seedState,
} from "../test/scheduleFixtures";

const LABELS = ["Push", "Legs", "Pull", "Push", "Legs", "Pull"];

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
  useAppStore.setState(
    seedState({
      labels: LABELS,
      weekdays: [1, 3, 5],
      weeklySessionTarget: 3,
      startedOn: PREV_MONDAY,
      timezone: TZ_ATHENS,
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWeeklyClose", () => {
  it("closes finished weeks on mount", () => {
    renderHook(() => useWeeklyClose());
    expect(useAppStore.getState().weeklyReviews[PROFILE_ID]).toHaveLength(1);
  });

  it("closes again when the document becomes visible", () => {
    renderHook(() => useWeeklyClose());
    useAppStore.setState({ weeklyReviews: {} });
    expect(useAppStore.getState().weeklyReviews[PROFILE_ID]).toBeUndefined();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(useAppStore.getState().weeklyReviews[PROFILE_ID]).toHaveLength(1);
  });

  it("does nothing without an active profile", () => {
    useAppStore.setState({ activeProfileId: null, weeklyReviews: {} });
    renderHook(() => useWeeklyClose());
    expect(useAppStore.getState().weeklyReviews[PROFILE_ID]).toBeUndefined();
  });
});
```

- [ ] **Step 8: Run the effect test to verify it fails**

Run: `npx vitest run src/app/useWeeklyClose.test.tsx`

Expected: FAIL — `Error: Failed to resolve import "./useWeeklyClose" from "src/app/useWeeklyClose.test.tsx"`.

- [ ] **Step 9: Implement the selectors**

Create `src/store/scheduleSelectors.ts`:

```ts
// src/store/scheduleSelectors.ts
//
// React-facing schedule selectors. These are hooks, so they live apart from the pure
// derivations in selectors.ts.
//
// projectedCalendar() builds a fresh array on every call. Zustand 5 compares snapshots with
// Object.is and warns ("The result of getSnapshot should be cached") when a selector returns
// a new object each time, so results are memoised on the identity of the state object they
// were computed from. A new state object means a real change, so the cache can never go
// stale, and the WeakMap lets old states be collected.

import { useCallback } from "react";
import { deviceTimeZone, todayLocal } from "../domain/dates";
import {
  projectedCalendar, remainingLabelsThisWeek, type CalendarDay,
} from "../domain/schedule/calendar";
import type { AppState, LocalDate, PlanCursor, PlanTemplate, TimeZone } from "../domain/types";
import { useAppStore } from "./index";

const EMPTY_DAYS: readonly CalendarDay[] = Object.freeze([]);
const EMPTY_LABELS: readonly string[] = Object.freeze([]);

const calendarCache = new WeakMap<object, Map<string, readonly CalendarDay[]>>();
const labelCache = new WeakMap<object, Map<string, readonly string[]>>();

function cached<T>(
  store: WeakMap<object, Map<string, T>>,
  state: AppState,
  key: string,
  compute: () => T,
): T {
  let byKey = store.get(state);
  if (!byKey) {
    byKey = new Map<string, T>();
    store.set(state, byKey);
  }
  const hit = byKey.get(key);
  if (hit !== undefined) return hit;
  const fresh = compute();
  byKey.set(key, fresh);
  return fresh;
}

export function selectCalendar(
  state: AppState,
  profileId: string,
  from: LocalDate,
  days: number,
): readonly CalendarDay[] {
  return cached(calendarCache, state, `cal|${profileId}|${from}|${days}`, () =>
    projectedCalendar(state, profileId, from, days),
  );
}

export function selectRemainingLabels(
  state: AppState,
  profileId: string,
  date: LocalDate,
): readonly string[] {
  return cached(labelCache, state, `lab|${profileId}|${date}`, () =>
    remainingLabelsThisWeek(state, profileId, date),
  );
}

export function selectTimeZone(state: AppState): TimeZone {
  const id = state.activeProfileId;
  const profile = id === null ? undefined : state.profiles[id];
  return profile ? profile.timezone : deviceTimeZone();
}

export function selectPlan(state: AppState): PlanTemplate | null {
  const id = state.activeProfileId;
  if (id === null) return null;
  const cursor = state.cursors[id];
  if (!cursor) return null;
  return state.plans[cursor.planId] ?? null;
}

export function selectCursor(state: AppState): PlanCursor | null {
  const id = state.activeProfileId;
  if (id === null) return null;
  return state.cursors[id] ?? null;
}

export function useActiveProfileId(): string | null {
  return useAppStore((s: AppState) => s.activeProfileId);
}

export function useTimeZone(): TimeZone {
  return useAppStore(selectTimeZone);
}

/** Today's LocalDate in the active profile's timezone. Never Date.toISOString(). */
export function useTodayDate(): LocalDate {
  return todayLocal(useTimeZone());
}

export function usePlan(): PlanTemplate | null {
  return useAppStore(selectPlan);
}

export function useCursor(): PlanCursor | null {
  return useAppStore(selectCursor);
}

export function useUpcoming(days: number): readonly CalendarDay[] {
  const from = useTodayDate();
  const select = useCallback(
    (s: AppState): readonly CalendarDay[] => {
      const id = s.activeProfileId;
      return id === null ? EMPTY_DAYS : selectCalendar(s, id, from, days);
    },
    [from, days],
  );
  return useAppStore(select);
}

export function useTodayPlan(): CalendarDay | null {
  return useUpcoming(1)[0] ?? null;
}

export function useRemainingLabels(date: LocalDate | null): readonly string[] {
  const select = useCallback(
    (s: AppState): readonly string[] => {
      const id = s.activeProfileId;
      if (id === null || date === null) return EMPTY_LABELS;
      return selectRemainingLabels(s, id, date);
    },
    [date],
  );
  return useAppStore(select);
}
```

- [ ] **Step 10: Implement the weekly-close effect**

Create `src/app/useWeeklyClose.ts`:

```ts
// src/app/useWeeklyClose.ts
//
// Closes every finished ISO week on mount and whenever the tab becomes visible again.
// The legacy app recomputed nothing on a clock tick (code review A13), so an app left open
// across midnight kept showing yesterday. Weekly closure is the one piece of state that must
// catch up with the wall clock, and it does so on visibility, not on a timer.

import { useEffect } from "react";
import { useAppStore } from "../store";

export function useWeeklyClose(): void {
  const profileId = useAppStore((s) => s.activeProfileId);
  const closeWeeks = useAppStore((s) => s.closeWeeks);

  useEffect(() => {
    if (profileId === null) return;
    const run = (): void => {
      closeWeeks(profileId, Date.now()); // epoch ms, UTC
    };
    run();
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [profileId, closeWeeks]);
}
```

- [ ] **Step 11: Run the effect test to verify it passes**

Run: `npx vitest run src/app/useWeeklyClose.test.tsx`

Expected: PASS — `Test Files  1 passed (1)`, `Tests  3 passed (3)`.

- [ ] **Step 12: Call the effect from App**

Read `src/app/App.tsx` and find the `App` component's body.

Insertion 1 — add to the import block at the top of the file:

```ts
import { useWeeklyClose } from "./useWeeklyClose";
```

Insertion 2 — add as the first statement inside the `App` component body, before any early
return, so the hook order is stable:

```ts
  useWeeklyClose();
```

- [ ] **Step 13: Run the full gate**

Run: `npm run lint && npx tsc --noEmit && npm test`

Expected: no lint errors, no type errors, all test files pass.

- [ ] **Step 14: Commit**

```bash
git add src/store/scheduleActions.ts src/store/scheduleActions.test.ts src/store/scheduleSelectors.ts src/store/index.ts src/app/useWeeklyClose.ts src/app/useWeeklyClose.test.tsx src/app/App.tsx
git commit -m "feat: schedule store actions, memoised selectors, and weekly-close effect"
```

---

### Task 5: Today view (`src/ui/views/TodayView.tsx`) and the plan formatters

**Files:**
- Create: `src/ui/format/plan.ts`
- Create: `src/ui/views/TodayView.tsx`
- Test: `src/ui/format/plan.test.ts`
- Test: `src/ui/views/TodayView.test.tsx`

**Interfaces:**
- Consumes: `src/store/scheduleSelectors.ts` (`useTodayPlan`, `useUpcoming`, `usePlan`,
  `useCursor`, `useTodayDate`, `useActiveProfileId`, `useRemainingLabels`);
  `src/store/index.ts` (`useAppStore` for actions); `src/domain/plan/library.ts` (`EXERCISES`).
- Produces:
  ```ts
  // src/ui/format/plan.ts
  export function formatSeconds(s: Seconds): string;
  export function formatPrescription(p: Prescription): string;
  export function formatSets(setsLo: number, setsHi: number): string;
  export function formatRest(restS: Seconds): string;
  export const WEEKDAY_ABBR: Record<IsoWeekday, string>;
  export function formatWeekday(date: LocalDate): string;
  export function formatDayOfMonth(date: LocalDate): string;
  export function exerciseName(exerciseId: string): string;

  // src/ui/views/TodayView.tsx
  export function TodayView(): ReactElement;
  ```

- [ ] **Step 1: Write the failing formatter tests**

Create `src/ui/format/plan.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../../domain/plan/library", () => ({
  EXERCISES: {
    "ex-1": { id: "ex-1", name: "Barbell bench press" },
  },
}));

import {
  WEEKDAY_ABBR, exerciseName, formatDayOfMonth, formatPrescription, formatRest, formatSeconds,
  formatSets, formatWeekday,
} from "./plan";

describe("formatSeconds", () => {
  it("prints seconds below two minutes", () => {
    expect(formatSeconds(45)).toBe("45 s");
    expect(formatSeconds(90)).toBe("90 s");
  });
  it("prints whole minutes at or above two minutes", () => {
    expect(formatSeconds(120)).toBe("2 min");
    expect(formatSeconds(180)).toBe("3 min");
  });
  it("keeps seconds when the value is not a whole number of minutes", () => {
    expect(formatSeconds(150)).toBe("150 s");
  });
});

describe("formatPrescription", () => {
  it("prints a rep range", () => {
    expect(formatPrescription({ kind: "reps", lo: 6, hi: 10 })).toBe("6–10 reps");
  });
  it("collapses a single rep target", () => {
    expect(formatPrescription({ kind: "reps", lo: 5, hi: 5 })).toBe("5 reps");
  });
  it("prints AMRAP with and without a minimum", () => {
    expect(formatPrescription({ kind: "amrap", minimum: null })).toBe("AMRAP");
    expect(formatPrescription({ kind: "amrap", minimum: 8 })).toBe("AMRAP, min 8 reps");
  });
  it("prints a timed hold", () => {
    expect(formatPrescription({ kind: "time", targetS: 45 })).toBe("hold 45 s");
  });
  it("prints a continuous bout", () => {
    expect(formatPrescription({ kind: "duration", targetS: 1800 })).toBe("30 min");
  });
  it("prints an em dash for no prescription", () => {
    expect(formatPrescription({ kind: "none" })).toBe("—");
  });
});

describe("formatSets and formatRest", () => {
  it("prints a set range and a fixed set count", () => {
    expect(formatSets(3, 4)).toBe("3–4");
    expect(formatSets(3, 3)).toBe("3");
  });
  it("prints rest", () => {
    expect(formatRest(120)).toBe("rest 2 min");
    expect(formatRest(90)).toBe("rest 90 s");
  });
});

describe("weekday formatting", () => {
  it("maps ISO weekdays Monday-first", () => {
    expect(WEEKDAY_ABBR[1]).toBe("Mon");
    expect(WEEKDAY_ABBR[7]).toBe("Sun");
  });
  it("formats a LocalDate's weekday and day of month", () => {
    expect(formatWeekday("2026-09-07")).toBe("Mon");
    expect(formatWeekday("2026-09-13")).toBe("Sun");
    expect(formatDayOfMonth("2026-09-07")).toBe("07");
  });
});

describe("exerciseName", () => {
  it("resolves a known id", () => {
    expect(exerciseName("ex-1")).toBe("Barbell bench press");
  });
  it("falls back to the id rather than throwing", () => {
    expect(exerciseName("ex-unknown")).toBe("ex-unknown");
  });
});
```

- [ ] **Step 2: Run the formatter tests to verify they fail**

Run: `npx vitest run src/ui/format/plan.test.ts`

Expected: FAIL — `Error: Failed to resolve import "./plan" from "src/ui/format/plan.test.ts"`.

- [ ] **Step 3: Implement `src/ui/format/plan.ts`**

Create `src/ui/format/plan.ts`:

```ts
// src/ui/format/plan.ts
//
// Presentation-only formatting for plan content. Clinical register: no hype, no emoji,
// the defined quantity every time. Durations are seconds in the model and are printed as
// whole minutes only when they divide exactly, so no value is rounded for looks.

import { isoWeekday } from "../../domain/dates";
import { EXERCISES } from "../../domain/plan/library";
import type { IsoWeekday, LocalDate, Prescription, Seconds } from "../../domain/types";

export function formatSeconds(s: Seconds): string {
  if (s >= 120 && s % 60 === 0) return `${s / 60} min`;
  return `${s} s`;
}

export function formatPrescription(p: Prescription): string {
  switch (p.kind) {
    case "reps":
      return p.lo === p.hi ? `${p.lo} reps` : `${p.lo}–${p.hi} reps`;
    case "amrap":
      return p.minimum === null ? "AMRAP" : `AMRAP, min ${p.minimum} reps`;
    case "time":
      return `hold ${formatSeconds(p.targetS)}`;
    case "duration":
      return formatSeconds(p.targetS);
    case "none":
      return "—";
  }
}

export function formatSets(setsLo: number, setsHi: number): string {
  return setsLo === setsHi ? `${setsLo}` : `${setsLo}–${setsHi}`;
}

export function formatRest(restS: Seconds): string {
  return `rest ${formatSeconds(restS)}`;
}

export const WEEKDAY_ABBR: Record<IsoWeekday, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

export function formatWeekday(date: LocalDate): string {
  return WEEKDAY_ABBR[isoWeekday(date)];
}

/** The "DD" of a LocalDate. String slicing, never a Date object. */
export function formatDayOfMonth(date: LocalDate): string {
  return date.slice(8, 10);
}

export function exerciseName(exerciseId: string): string {
  return EXERCISES[exerciseId]?.name ?? exerciseId;
}
```

- [ ] **Step 4: Run the formatter tests to verify they pass**

Run: `npx vitest run src/ui/format/plan.test.ts`

Expected: PASS — `Test Files  1 passed (1)`, `Tests  15 passed (15)`.

- [ ] **Step 5: Write the failing Today view tests**

Create `src/ui/views/TodayView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../domain/plan/library", () => ({
  EXERCISES: {
    "ex-1": { id: "ex-1", name: "Barbell bench press" },
    "ex-2": { id: "ex-2", name: "Overhead press" },
  },
}));

import { TodayView } from "./TodayView";
import { useAppStore } from "../../store";
import {
  MONDAY, NOW_MS, PROFILE_ID, TUESDAY, WEDNESDAY, seedState,
} from "../../test/scheduleFixtures";
import type { AppState } from "../../domain/types";

const LABELS = ["Push", "Legs", "Pull", "Push", "Legs", "Pull"];
const MWF = [1, 3, 5] as const;

function seed(over?: Partial<AppState>): AppState {
  const base = seedState({
    labels: LABELS,
    weekdays: [...MWF],
    weeklySessionTarget: 3,
    startedOn: MONDAY,
  });
  return over ? { ...base, ...over } : base;
}

function setState(state: AppState): void {
  useAppStore.setState(state);
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW_MS); // Monday 2026-09-07, 09:30 Europe/Athens
  setState(seed());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TodayView hero — session scheduled", () => {
  it("shows the session name, its ordinal of the total, the label and the start time", () => {
    render(<TodayView />);
    expect(screen.getByText("Push 1")).toBeTruthy();
    expect(screen.getByText("SESSION 1 OF 6")).toBeTruthy();
    expect(screen.getByText(/Push · 07:00 · 2 exercises/)).toBeTruthy();
  });

  it("previews the session's exercises", () => {
    render(<TodayView />);
    expect(screen.getByText("Barbell bench press")).toBeTruthy();
    expect(screen.getByText("Overhead press")).toBeTruthy();
    expect(screen.getAllByText("3–4 × 6–10 reps").length).toBe(2);
  });

  it("Start session marks the day in progress and switches to the Train view", () => {
    render(<TodayView />);
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));
    const state = useAppStore.getState();
    expect(state.assignments[PROFILE_ID]?.[0]?.status).toBe("in-progress");
    expect(state.assignments[PROFILE_ID]?.[0]?.startedAt).toBe(NOW_MS);
    expect(state.ui.lastView).toBe("train");
  });

  it("Mark completed advances the cursor by one", () => {
    render(<TodayView />);
    fireEvent.click(screen.getByRole("button", { name: "Mark completed" }));
    expect(useAppStore.getState().cursors[PROFILE_ID]?.nextSessionIndex).toBe(1);
  });

  it("Skip today records an optional reason", () => {
    render(<TodayView />);
    fireEvent.click(screen.getByRole("button", { name: "Skip today" }));
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "illness" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm skip" }));
    const a = useAppStore.getState().assignments[PROFILE_ID]?.[0];
    expect(a?.status).toBe("skipped");
    expect(a?.skipReason).toBe("illness");
  });

  it("Skip today with an empty reason stores null", () => {
    render(<TodayView />);
    fireEvent.click(screen.getByRole("button", { name: "Skip today" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm skip" }));
    expect(useAppStore.getState().assignments[PROFILE_ID]?.[0]?.skipReason).toBeNull();
  });

  it("Pause plan opens a pause from today", () => {
    render(<TodayView />);
    fireEvent.click(screen.getByRole("button", { name: "Pause plan" }));
    const pause = useAppStore.getState().pauses[PROFILE_ID]?.[0];
    expect(pause?.from).toBe(MONDAY);
    expect(pause?.to).toBeNull();
  });
});

describe("TodayView hero — the other states", () => {
  it("shows a rest hero and the next slot day when today has no slot", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW_MS + 86_400_000); // Tuesday
    render(<TodayView />);
    expect(screen.getByText("No session scheduled today.")).toBeTruthy();
    expect(screen.getByText("Next: Wed 07:00 Push.")).toBeTruthy();
  });

  it("shows the in-progress hero", () => {
    const state = useAppStore.getState();
    setState({
      ...state,
      assignments: {
        [PROFILE_ID]: [{
          date: MONDAY, sessionId: "s-1", sourceIndex: 0, status: "in-progress",
          startedAt: NOW_MS, completedAt: null, skipReason: null,
        }],
      },
    });
    render(<TodayView />);
    expect(screen.getByText("Session in progress.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Return to session" })).toBeTruthy();
  });

  it("shows the completed hero", () => {
    const state = useAppStore.getState();
    setState({
      ...state,
      assignments: {
        [PROFILE_ID]: [{
          date: MONDAY, sessionId: "s-1", sourceIndex: 0, status: "completed",
          startedAt: NOW_MS, completedAt: NOW_MS, skipReason: null,
        }],
      },
    });
    render(<TodayView />);
    expect(screen.getByText("Session completed.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start session" })).toBeNull();
  });

  it("shows the skipped hero with its reason", () => {
    const state = useAppStore.getState();
    setState({
      ...state,
      assignments: {
        [PROFILE_ID]: [{
          date: MONDAY, sessionId: "s-1", sourceIndex: 0, status: "skipped",
          startedAt: null, completedAt: null, skipReason: "illness",
        }],
      },
    });
    render(<TodayView />);
    expect(screen.getByText("Session skipped.")).toBeTruthy();
    expect(screen.getByText("Reason: illness")).toBeTruthy();
  });

  it("shows the paused hero and resumes from today", () => {
    const state = useAppStore.getState();
    setState({
      ...state,
      pauses: { [PROFILE_ID]: [{ id: "p", from: MONDAY, to: null, reason: "travel" }] },
    });
    render(<TodayView />);
    expect(screen.getByText("Plan paused since 2026-09-07.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));
    expect(useAppStore.getState().pauses[PROFILE_ID]?.[0]?.to).toBe(MONDAY);
  });

  it("shows the programme-complete hero", () => {
    const state = useAppStore.getState();
    setState({
      ...state,
      cursors: { [PROFILE_ID]: { planId: "plan-1", nextSessionIndex: 6, startedOn: MONDAY, completedOn: MONDAY } },
    });
    render(<TodayView />);
    expect(screen.getByText("Programme complete.")).toBeTruthy();
  });
});

describe("TodayView — pick another session today", () => {
  it("offers exactly the labels remaining this week", () => {
    render(<TodayView />);
    fireEvent.click(screen.getByRole("button", { name: "Train something else" }));
    const picker = screen.getByTestId("label-picker");
    expect(picker.textContent).toContain("Push");
    expect(picker.textContent).toContain("Legs");
    expect(picker.textContent).toContain("Pull");
  });

  it("choosing Legs calls assignToday and re-projects the week", () => {
    render(<TodayView />);
    fireEvent.click(screen.getByRole("button", { name: "Train something else" }));
    fireEvent.click(screen.getByRole("button", { name: "Train Legs today" }));
    const state = useAppStore.getState();
    expect(state.assignments[PROFILE_ID]?.[0]?.sessionId).toBe("s-2");
    expect(state.assignments[PROFILE_ID]?.[0]?.sourceIndex).toBe(0);
    expect(state.plans["plan-1"]?.sessions.map((s) => s.label)).toEqual([
      "Legs", "Push", "Pull", "Push", "Legs", "Pull",
    ]);
    expect(screen.getByText("Legs 2")).toBeTruthy();
  });
});

describe("TodayView — 14-day strip", () => {
  it("renders fourteen days with weekday, slot time and projected label", () => {
    render(<TodayView />);
    const rows = screen.getAllByTestId("strip-day");
    expect(rows).toHaveLength(14);
    expect(rows[0]?.textContent).toContain("Mon");
    expect(rows[0]?.textContent).toContain("07:00");
    expect(rows[0]?.textContent).toContain("Push");
    expect(rows[1]?.textContent).toContain("Tue");
    expect(rows[1]?.textContent).toContain("rest");
  });

  it("marks a completed day and a paused day with their glyphs", () => {
    const state = useAppStore.getState();
    setState({
      ...state,
      assignments: {
        [PROFILE_ID]: [{
          date: MONDAY, sessionId: "s-1", sourceIndex: 0, status: "completed",
          startedAt: NOW_MS, completedAt: NOW_MS, skipReason: null,
        }],
      },
      pauses: { [PROFILE_ID]: [{ id: "p", from: TUESDAY, to: WEDNESDAY, reason: null }] },
    });
    render(<TodayView />);
    const rows = screen.getAllByTestId("strip-day");
    expect(rows[0]?.getAttribute("data-status")).toBe("completed");
    expect(rows[1]?.getAttribute("data-status")).toBe("paused");
    expect(rows[2]?.getAttribute("data-status")).toBe("planned");
  });
});
```

- [ ] **Step 6: Run the Today view tests to verify they fail**

Run: `npx vitest run src/ui/views/TodayView.test.tsx`

Expected: FAIL — `Error: Failed to resolve import "./TodayView" from "src/ui/views/TodayView.test.tsx"`.

- [ ] **Step 7: Implement `src/ui/views/TodayView.tsx`**

Create `src/ui/views/TodayView.tsx`:

```tsx
// src/ui/views/TodayView.tsx
//
// The Today hero reports one thing: what the plan cursor says about this civil day. It never
// derives position from the calendar (code review A11), never reads a UTC date (A8), and has
// exactly one definition of "done" — SessionAssignment.status (A63).
//
// Hero precedence: completed > skipped > in progress > paused > scheduled session > rest.

import { useState, type ReactElement } from "react";
import { useAppStore } from "../../store";
import {
  useActiveProfileId, useCursor, usePlan, useRemainingLabels, useTodayDate, useTodayPlan,
  useUpcoming,
} from "../../store/scheduleSelectors";
import type { CalendarDay } from "../../domain/schedule/calendar";
import {
  exerciseName, formatDayOfMonth, formatPrescription, formatRest, formatSets, formatWeekday,
} from "../format/plan";

const STRIP_DAYS = 14;

type DayStatus = "completed" | "skipped" | "in-progress" | "paused" | "planned" | "rest";

function dayStatus(day: CalendarDay): DayStatus {
  const status = day.assignment?.status;
  if (status === "completed") return "completed";
  if (status === "skipped") return "skipped";
  if (status === "in-progress") return "in-progress";
  if (day.paused) return "paused";
  if (day.projectedSession) return "planned";
  return "rest";
}

const GLYPH: Record<DayStatus, string> = {
  completed: "✓",
  skipped: "×",
  "in-progress": "▸",
  paused: "‖",
  planned: "·",
  rest: "–",
};

const STATUS_TEXT: Record<DayStatus, string> = {
  completed: "completed",
  skipped: "skipped",
  "in-progress": "in progress",
  paused: "paused",
  planned: "planned",
  rest: "rest",
};

function nextSlotDay(days: readonly CalendarDay[]): CalendarDay | null {
  return days.slice(1).find((d) => d.slot !== null && !d.paused && d.projectedSession !== null) ?? null;
}

export function TodayView(): ReactElement {
  const profileId = useActiveProfileId();
  const today = useTodayDate();
  const plan = usePlan();
  const cursor = useCursor();
  const day = useTodayPlan();
  const upcoming = useUpcoming(STRIP_DAYS);
  const labels = useRemainingLabels(profileId === null ? null : today);

  const startSession = useAppStore((s) => s.startSession);
  const completeSession = useAppStore((s) => s.completeSession);
  const skipSession = useAppStore((s) => s.skipSession);
  const pausePlan = useAppStore((s) => s.pausePlan);
  const resumePlan = useAppStore((s) => s.resumePlan);
  const assignToday = useAppStore((s) => s.assignToday);
  const setUi = useAppStore((s) => s.setUi);

  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  if (profileId === null || plan === null || cursor === null || day === null) {
    return (
      <div className="today">
        <div className="today-hero">
          <h1 className="hero-name">No plan configured.</h1>
          <p className="today-sub">Complete setup to generate a plan.</p>
        </div>
      </div>
    );
  }

  const status = dayStatus(day);
  const session = day.projectedSession;
  const total = plan.sessions.length;
  const openPause = (useAppStore.getState().pauses[profileId] ?? []).find((p) => p.to === null) ?? null;

  const goTrain = (): void => {
    setUi({ lastView: "train" });
  };
  const onStart = (): void => {
    startSession(profileId, today, Date.now()); // epoch ms, UTC
    goTrain();
  };
  const onComplete = (): void => {
    completeSession(profileId, today, Date.now()); // epoch ms, UTC
  };
  const onConfirmSkip = (): void => {
    const reason = skipReason.trim();
    skipSession(profileId, today, reason === "" ? null : reason);
    setSkipOpen(false);
    setSkipReason("");
  };
  const onPick = (label: string): void => {
    assignToday(profileId, today, label);
    setPickerOpen(false);
  };

  const controls = (
    <div className="today-controls">
      {status === "planned" && (
        <button type="button" onClick={onStart}>Start session</button>
      )}
      {status === "in-progress" && (
        <button type="button" onClick={goTrain}>Return to session</button>
      )}
      {(status === "planned" || status === "in-progress") && (
        <>
          <button type="button" onClick={onComplete}>Mark completed</button>
          <button type="button" onClick={() => setSkipOpen(true)}>Skip today</button>
          <button type="button" onClick={() => setPickerOpen((v) => !v)}>
            Train something else
          </button>
        </>
      )}
      {status !== "paused" && (
        <button type="button" onClick={() => pausePlan(profileId, today, null)}>Pause plan</button>
      )}
      {status === "paused" && (
        <button type="button" onClick={() => resumePlan(profileId, today)}>Resume plan</button>
      )}
    </div>
  );

  let hero: ReactElement;
  if (cursor.completedOn !== null && day.assignment === null) {
    hero = (
      <div className="today-hero">
        <div className="today-eyebrow">PROGRAMME</div>
        <h1 className="hero-name">Programme complete.</h1>
        <p className="today-sub">{total} of {total} sessions closed on {cursor.completedOn}.</p>
      </div>
    );
  } else if (status === "completed") {
    hero = (
      <div className="today-hero">
        <div className="today-eyebrow">{today}</div>
        <h1 className="hero-name">Session completed.</h1>
        <p className="today-sub">{session ? session.name : "Session"} · session {session?.ordinal ?? "—"} of {total}</p>
      </div>
    );
  } else if (status === "skipped") {
    hero = (
      <div className="today-hero">
        <div className="today-eyebrow">{today}</div>
        <h1 className="hero-name">Session skipped.</h1>
        <p className="today-sub">{session ? session.name : "Session"} · session {session?.ordinal ?? "—"} of {total}</p>
        {day.assignment?.skipReason !== null && day.assignment !== null && (
          <p className="today-sub">Reason: {day.assignment.skipReason}</p>
        )}
      </div>
    );
  } else if (status === "in-progress") {
    hero = (
      <div className="today-hero">
        <div className="today-eyebrow">SESSION {session?.ordinal ?? "—"} OF {total}</div>
        <h1 className="hero-name">Session in progress.</h1>
        <p className="today-sub">{session ? session.name : "Session"}</p>
      </div>
    );
  } else if (status === "paused") {
    hero = (
      <div className="today-hero">
        <div className="today-eyebrow">{today}</div>
        <h1 className="hero-name">Plan paused since {openPause ? openPause.from : today}.</h1>
        <p className="today-sub">
          The cursor holds at session {cursor.nextSessionIndex + 1} of {total}. No session is
          consumed while the plan is paused.
        </p>
      </div>
    );
  } else if (session !== null) {
    hero = (
      <div className="today-hero">
        <div className="today-eyebrow">SESSION {session.ordinal} OF {total}</div>
        <h1 className="hero-name">{session.name}</h1>
        <p className="today-sub">
          {session.label} · {day.slot ? day.slot.startTime : "unscheduled"} ·{" "}
          {session.exercises.length} exercises
        </p>
        <ul className="session-list">
          {session.exercises.map((ex) => (
            <li key={ex.exerciseId} className="sess-row">
              <span className="sess-name">{exerciseName(ex.exerciseId)}</span>
              <span className="sess-rep">
                {formatSets(ex.setsLo, ex.setsHi)} × {formatPrescription(ex.prescription)}
              </span>
              <span className="sess-rest">{formatRest(ex.restS)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  } else {
    const next = nextSlotDay(upcoming);
    hero = (
      <div className="today-hero">
        <div className="today-eyebrow">{today}</div>
        <h1 className="hero-name">No session scheduled today.</h1>
        <p className="today-sub">
          {next && next.slot && next.projectedSession
            ? `Next: ${formatWeekday(next.date)} ${next.slot.startTime} ${next.projectedSession.label}.`
            : "No sessions in the next 14 days."}
        </p>
      </div>
    );
  }

  return (
    <div className="today">
      {hero}
      {controls}

      {skipOpen && (
        <div className="today-skip">
          <label htmlFor="skip-reason">Reason (optional)</label>
          <input
            id="skip-reason"
            type="text"
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
          />
          <button type="button" onClick={onConfirmSkip}>Confirm skip</button>
          <button type="button" onClick={() => setSkipOpen(false)}>Cancel</button>
        </div>
      )}

      {pickerOpen && (
        <div className="today-picker" data-testid="label-picker">
          <p className="card-eyebrow">REMAINING THIS WEEK</p>
          {labels.length === 0 && <p className="today-sub">No sessions remain this week.</p>}
          {labels.map((label) => (
            <button key={label} type="button" onClick={() => onPick(label)}>
              Train {label} today
            </button>
          ))}
        </div>
      )}

      <div className="today-strip" data-testid="day-strip">
        {upcoming.map((d) => {
          const s = dayStatus(d);
          return (
            <div key={d.date} className="strip-day" data-testid="strip-day" data-status={s}>
              <span className="sd-weekday">{formatWeekday(d.date)}</span>
              <span className="sd-date">{formatDayOfMonth(d.date)}</span>
              <span className="sd-time">{d.slot ? d.slot.startTime : "—"}</span>
              <span className="sd-label">{d.projectedSession ? d.projectedSession.label : "rest"}</span>
              <span className="sd-glyph" title={STATUS_TEXT[s]} aria-label={STATUS_TEXT[s]}>
                {GLYPH[s]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run the Today view tests to verify they pass**

Run: `npx vitest run src/ui/views/TodayView.test.tsx`

Expected: PASS — `Test Files  1 passed (1)`, `Tests  17 passed (17)`.

- [ ] **Step 9: Run the full gate**

Run: `npm run lint && npx tsc --noEmit && npm test`

Expected: no lint errors, no type errors, all test files pass.

- [ ] **Step 10: Commit**

```bash
git add src/ui/format/plan.ts src/ui/format/plan.test.ts src/ui/views/TodayView.tsx src/ui/views/TodayView.test.tsx
git commit -m "feat: cursor-driven Today view with pause, skip and pick-today controls"
```

---

### Task 6: Plan view (`src/ui/views/PlanView.tsx`)

**Files:**
- Create: `src/ui/views/PlanView.tsx`
- Test: `src/ui/views/PlanView.test.tsx`

**Interfaces:**
- Consumes: `src/store/scheduleSelectors.ts` (`usePlan`, `useCursor`); `src/ui/format/plan.ts`
  (`formatPrescription`, `formatSets`, `formatRest`, `exerciseName`).
- Produces:
  ```ts
  export function deloadNote(setModifier: number): string; // "volume −50 %, load unchanged"
  export function weekOfIndex(sessionIndex: number, sessionsPerWeek: number): number; // 0-based
  export function PlanView(): ReactElement;
  ```

- [ ] **Step 1: Write the failing Plan view tests**

Create `src/ui/views/PlanView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../domain/plan/library", () => ({
  EXERCISES: {
    "ex-1": { id: "ex-1", name: "Barbell bench press" },
    "ex-2": { id: "ex-2", name: "Overhead press" },
    "ex-3": { id: "ex-3", name: "Back squat" },
    "ex-4": { id: "ex-4", name: "Romanian deadlift" },
    "ex-5": { id: "ex-5", name: "Barbell row" },
    "ex-6": { id: "ex-6", name: "Lat pulldown" },
    "ex-7": { id: "ex-7", name: "Incline press" },
    "ex-8": { id: "ex-8", name: "Cable fly" },
  },
}));

import { PlanView, deloadNote, weekOfIndex } from "./PlanView";
import { useAppStore } from "../../store";
import { MONDAY, NOW_MS, seedState } from "../../test/scheduleFixtures";
import type { PlanBlock } from "../../domain/types";

const LABELS = ["Push", "Legs", "Pull", "Push", "Legs", "Pull"];
const BLOCKS: PlanBlock[] = [
  { index: 0, firstSessionIndex: 0, sessionCount: 3, setModifier: 1, loadModifier: 1, isDeload: false },
  { index: 1, firstSessionIndex: 3, sessionCount: 3, setModifier: 0.5, loadModifier: 1, isDeload: true },
];

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
  useAppStore.setState(
    seedState({
      labels: LABELS,
      weekdays: [1, 3, 5],
      sessionsPerWeek: 3,
      startedOn: MONDAY,
      nextSessionIndex: 1,
      blocks: BLOCKS,
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deloadNote", () => {
  it("states the volume cut and that load is unchanged", () => {
    expect(deloadNote(0.5)).toBe("volume −50 %, load unchanged");
  });
  it("reports the actual modifier rather than a fixed number", () => {
    expect(deloadNote(0.6)).toBe("volume −40 %, load unchanged");
    expect(deloadNote(0.4)).toBe("volume −60 %, load unchanged");
  });
});

describe("weekOfIndex", () => {
  it("chunks session indices into zero-based weeks", () => {
    expect(weekOfIndex(0, 3)).toBe(0);
    expect(weekOfIndex(2, 3)).toBe(0);
    expect(weekOfIndex(3, 3)).toBe(1);
  });
  it("guards against a zero sessions-per-week", () => {
    expect(weekOfIndex(4, 0)).toBe(0);
  });
});

describe("PlanView", () => {
  it("lists the plan's blocks and flags the deload block", () => {
    render(<PlanView />);
    expect(screen.getByRole("button", { name: /Block 1/ })).toBeTruthy();
    const deload = screen.getByRole("button", { name: /Block 2/ });
    expect(deload.textContent).toContain("DELOAD");
    expect(deload.textContent).toContain("volume −50 %, load unchanged");
  });

  it("shows the cursor marker on the session the cursor points at", () => {
    render(<PlanView />);
    const rows = screen.getAllByTestId("plan-session");
    expect(rows[0]?.getAttribute("data-cursor")).toBe("false");
    expect(rows[1]?.getAttribute("data-cursor")).toBe("true");
    expect(rows[1]?.textContent).toContain("next");
  });

  it("renders each exercise as sets × prescription with rest", () => {
    render(<PlanView />);
    expect(screen.getAllByText("3–4 × 6–10 reps").length).toBeGreaterThan(0);
    expect(screen.getAllByText("rest 2 min").length).toBeGreaterThan(0);
    expect(screen.getByText("Barbell bench press")).toBeTruthy();
  });

  it("starts on the cursor's own week", () => {
    render(<PlanView />);
    expect(screen.getByTestId("week-label").textContent).toBe("Week 1 of 2");
    expect(screen.getAllByTestId("plan-session")).toHaveLength(3);
  });

  it("scrubs to another week and lists that week's sessions", () => {
    render(<PlanView />);
    fireEvent.change(screen.getByLabelText("Week"), { target: { value: "2" } });
    expect(screen.getByTestId("week-label").textContent).toBe("Week 2 of 2");
    const rows = screen.getAllByTestId("plan-session");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("Push 4");
  });

  it("selecting a block jumps the scrubber to that block's first week", () => {
    render(<PlanView />);
    fireEvent.click(screen.getByRole("button", { name: /Block 2/ }));
    expect(screen.getByTestId("week-label").textContent).toBe("Week 2 of 2");
  });

  it("renders a message when no plan exists", () => {
    useAppStore.setState({ plans: {}, cursors: {} });
    render(<PlanView />);
    expect(screen.getByText("No plan configured.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the Plan view tests to verify they fail**

Run: `npx vitest run src/ui/views/PlanView.test.tsx`

Expected: FAIL — `Error: Failed to resolve import "./PlanView" from "src/ui/views/PlanView.test.tsx"`.

- [ ] **Step 3: Implement `src/ui/views/PlanView.tsx`**

Create `src/ui/views/PlanView.tsx`:

```tsx
// src/ui/views/PlanView.tsx
//
// The plan is calendar-free: blocks and sessions in order, with the cursor marking the next
// one. The week scrubber is a view of the session list, not a position — moving it cannot
// desynchronise the programme (code review A14, where scrubbing silently changed the
// session shown under "today is …").
//
// A deload block cuts VOLUME and leaves load unchanged (content review §2.2, Bosquet 2007).
// The note is computed from the block's own setModifier so it can never overstate the cut.

import { useState, type ReactElement } from "react";
import { useCursor, usePlan } from "../../store/scheduleSelectors";
import { exerciseName, formatPrescription, formatRest, formatSets } from "../format/plan";
import type { PlanBlock } from "../../domain/types";

export function deloadNote(setModifier: number): string {
  const cutPct = Math.round((1 - setModifier) * 100); // per cent of planned sets removed
  return `volume −${cutPct} %, load unchanged`;
}

/** Zero-based week index of a session position. */
export function weekOfIndex(sessionIndex: number, sessionsPerWeek: number): number {
  if (sessionsPerWeek <= 0) return 0;
  return Math.floor(sessionIndex / sessionsPerWeek);
}

function blockFirstWeek(block: PlanBlock, sessionsPerWeek: number): number {
  return weekOfIndex(block.firstSessionIndex, sessionsPerWeek);
}

export function PlanView(): ReactElement {
  const plan = usePlan();
  const cursor = useCursor();
  const spw = plan && plan.sessionsPerWeek > 0 ? plan.sessionsPerWeek : 1;
  const initialWeek = cursor ? weekOfIndex(cursor.nextSessionIndex, spw) : 0;
  const [week, setWeek] = useState(initialWeek);

  if (plan === null || cursor === null) {
    return (
      <div className="plan">
        <h2 className="vh">PLAN</h2>
        <p className="today-sub">No plan configured.</p>
      </div>
    );
  }

  const weekCount = Math.max(1, Math.ceil(plan.sessions.length / spw));
  const clampedWeek = Math.min(Math.max(week, 0), weekCount - 1);
  const first = clampedWeek * spw;
  const sessions = plan.sessions.slice(first, first + spw);

  return (
    <div className="plan">
      <h2 className="vh">PLAN</h2>

      <div className="phase-row">
        {plan.blocks.map((block) => {
          const from = block.firstSessionIndex + 1;
          const to = block.firstSessionIndex + block.sessionCount;
          return (
            <button
              key={block.index}
              type="button"
              className={"phase-btn" + (block.isDeload ? " is-deload" : "")}
              onClick={() => setWeek(blockFirstWeek(block, spw))}
            >
              <span className="pb-id">Block {block.index + 1}</span>
              <span className="pb-meta">sessions {from}–{to}</span>
              {block.isDeload && (
                <span className="pb-name">DELOAD · {deloadNote(block.setModifier)}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="week-scrub">
        <label htmlFor="week-scrubber">Week</label>
        <input
          id="week-scrubber"
          type="range"
          min={1}
          max={weekCount}
          value={clampedWeek + 1}
          onChange={(e) => setWeek(Number(e.target.value) - 1)}
        />
        <span className="ws-meta" data-testid="week-label">
          Week {clampedWeek + 1} of {weekCount}
        </span>
      </div>

      <div className="plan-detail">
        {sessions.map((session, i) => {
          const index = first + i;
          const isNext = index === cursor.nextSessionIndex;
          return (
            <div
              key={session.id}
              className={"pd-session" + (isNext ? " is-next" : "")}
              data-testid="plan-session"
              data-cursor={isNext ? "true" : "false"}
            >
              <div className="pd-head">
                <span className="pd-i">{String(session.ordinal).padStart(2, "0")}</span>
                <h3>{session.name}</h3>
                <span className="pd-sub">{session.label}</span>
                {isNext && <span className="pd-cursor">▸ next</span>}
              </div>
              <div className="pd-list">
                {session.exercises.map((ex) => (
                  <div key={ex.exerciseId} className="pd-row">
                    <span className="pd-name">{exerciseName(ex.exerciseId)}</span>
                    <span className="pd-sets">
                      {formatSets(ex.setsLo, ex.setsHi)} × {formatPrescription(ex.prescription)}
                    </span>
                    <span className="pd-rest">{formatRest(ex.restS)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the Plan view tests to verify they pass**

Run: `npx vitest run src/ui/views/PlanView.test.tsx`

Expected: PASS — `Test Files  1 passed (1)`, `Tests  11 passed (11)`.

- [ ] **Step 5: Run the full gate**

Run: `npm run lint && npx tsc --noEmit && npm test`

Expected: no lint errors, no type errors, all test files pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/views/PlanView.tsx src/ui/views/PlanView.test.tsx
git commit -m "feat: plan view with block strip, week scrubber and cursor marker"
```

---

### Task 7: Session indicator in the top bar

**Files:**
- Create: `src/ui/components/SessionIndicator.tsx`
- Test: `src/ui/components/SessionIndicator.test.tsx`
- Modify: `src/ui/components/TopBar.tsx` (replace the legacy position block)

**Interfaces:**
- Consumes: `src/store/scheduleSelectors.ts` (`usePlan`, `useCursor`).
- Produces:
  ```ts
  export function SessionIndicator(): ReactElement | null;
  ```

- [ ] **Step 1: Write the failing indicator tests**

Create `src/ui/components/SessionIndicator.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionIndicator } from "./SessionIndicator";
import { useAppStore } from "../../store";
import { MONDAY, NOW_MS, PROFILE_ID, seedState } from "../../test/scheduleFixtures";

const LABELS = ["Push", "Legs", "Pull", "Push", "Legs", "Pull"];

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
  useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SessionIndicator", () => {
  it("reads the session number from the cursor, not the calendar", () => {
    render(<SessionIndicator />);
    expect(screen.getByTestId("session-indicator").textContent).toBe("S 1/6");
  });

  it("moves with the cursor", () => {
    useAppStore.setState({
      cursors: { [PROFILE_ID]: { planId: "plan-1", nextSessionIndex: 3, startedOn: MONDAY, completedOn: null } },
    });
    render(<SessionIndicator />);
    expect(screen.getByTestId("session-indicator").textContent).toBe("S 4/6");
  });

  it("reports a finished programme without overrunning the total", () => {
    useAppStore.setState({
      cursors: { [PROFILE_ID]: { planId: "plan-1", nextSessionIndex: 6, startedOn: MONDAY, completedOn: MONDAY } },
    });
    render(<SessionIndicator />);
    expect(screen.getByTestId("session-indicator").textContent).toBe("S 6/6 complete");
  });

  it("renders nothing without a plan", () => {
    useAppStore.setState({ plans: {}, cursors: {} });
    const { container } = render(<SessionIndicator />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the indicator tests to verify they fail**

Run: `npx vitest run src/ui/components/SessionIndicator.test.tsx`

Expected: FAIL — `Error: Failed to resolve import "./SessionIndicator" from "src/ui/components/SessionIndicator.test.tsx"`.

- [ ] **Step 3: Implement `src/ui/components/SessionIndicator.tsx`**

Create `src/ui/components/SessionIndicator.tsx`:

```tsx
// src/ui/components/SessionIndicator.tsx
//
// "S n/N" — the position the plan cursor is actually at. This replaces the legacy
// "D n/168" indicator, which counted calendar days since the start date and therefore
// reported a position the user had not reached (code review A11, A12).

import type { ReactElement } from "react";
import { useCursor, usePlan } from "../../store/scheduleSelectors";

export function SessionIndicator(): ReactElement | null {
  const plan = usePlan();
  const cursor = useCursor();
  if (plan === null || cursor === null) return null;

  const total = plan.sessions.length;
  const shown = total === 0 ? 0 : Math.min(cursor.nextSessionIndex + 1, total);
  const complete = cursor.completedOn !== null;

  return (
    <span className="day-ind" data-testid="session-indicator" title="Plan position">
      S {shown}/{total}{complete ? " complete" : ""}
    </span>
  );
}
```

- [ ] **Step 4: Run the indicator tests to verify they pass**

Run: `npx vitest run src/ui/components/SessionIndicator.test.tsx`

Expected: PASS — `Test Files  1 passed (1)`, `Tests  4 passed (4)`.

- [ ] **Step 5: Replace the legacy indicator in TopBar**

Read `src/ui/components/TopBar.tsx`. It carries the ported legacy position block — the
element with `className="day-ind"` showing `D {n}/168`, `WK {n}/24`, and `P {n}`, together
with whatever selector feeds it.

Apply exactly these three edits:

1. Add to the import block at the top of the file:

```ts
import { SessionIndicator } from "./SessionIndicator";
```

2. Delete the whole `<span className="day-ind"> … </span>` block (and its surrounding
   conditional, if it is wrapped in one) from the left-hand group, and put in its place:

```tsx
        <SessionIndicator />
```

3. Delete any now-unused imports, hooks, or local variables that only fed the deleted block
   (typically a `pos`/`phase` selector call). Leave every other control — the brand, the
   Today button, the spotlight hint — untouched.

- [ ] **Step 6: Verify nothing else in TopBar broke**

Run: `npm run lint && npx tsc --noEmit && npm test`

Expected: no lint errors (an unused variable left behind would fail here), no type errors,
all test files pass.

- [ ] **Step 7: Confirm the legacy indicator is gone**

Run: `git grep -n "168" -- src/ui | grep -v test`

Expected: no output. (The 168-day constant belonged to the single-user programme; the generic
app has `plan.sessions.length` instead.)

- [ ] **Step 8: Commit**

```bash
git add src/ui/components/SessionIndicator.tsx src/ui/components/SessionIndicator.test.tsx src/ui/components/TopBar.tsx
git commit -m "feat: top bar reports cursor position S n/N instead of calendar day D n/168"
```

---

## Verification gate for P3 (master plan §7)

| Gate | Pass criterion | Where it is proved |
| --- | --- | --- |
| cursor | 60-day clock advance with no completions leaves the cursor unchanged | `cursor.test.ts` "invariant: the cursor is attendance-driven"; `weekly.test.ts` "leaves the cursor untouched over a 60-day clock advance" |
| cursor | `assignToday` preserves the weekly label multiset | `calendar.test.ts` "preserves the multiset of labels in the week window" |
| cursor | paused weeks never produce a negative delta | `weekly.test.ts` "a paused week never yields a negative delta" |

Run the gate in one command before declaring P3 done:

```bash
npx vitest run src/domain/schedule src/store/scheduleActions.test.ts src/app/useWeeklyClose.test.tsx src/ui
```

Expected: `Test Files  9 passed (9)`.

---

## Master plan amendments requested

Each item is a change to `docs/plans/2026-09-01-00-master-plan.md`. P3 was implemented on the
master plan's terms; these record where the terms were silent, self-contradictory, or where
P3 had to add a name.

1. **§4, `schedule/calendar.ts` line.** Change `projectedCalendar(), reorderForToday()` to
   `projectedCalendar(), remainingLabelsThisWeek(), assignToday()`. §6.4 and §6.7 both name
   the function `assignToday`; `reorderForToday` exists nowhere else in the document.

2. **§6.4, `isPaused`.** Add the interval definition: *"A `PlanPause` covers the half-open
   local-date interval `[from, to)`: `from` is the first paused day and `to` is the first day
   the plan is active again. `to === null` means the pause is open."* Without this the Resume
   control cannot restore the day it is pressed on.

3. **§6.4, add `startSession`.** Insert
   `export function startSession(state: AppState, profileId: string, date: LocalDate, now: EpochMs): AppState; // marks assignment in-progress, sets startedAt, does NOT advance the cursor`
   §6.7 requires the store action but §6.4 lists no pure function for it, and the
   materialise-from-cursor logic is identical to `completeSession`'s.

4. **§6.4, add three exports** used across the schedule modules and the Today picker:
   `isTerminal(a: SessionAssignment): boolean`, `upsertAssignment(list, next)`, and
   `remainingLabelsThisWeek(state, profileId, date): string[]`. The picker must offer exactly
   the labels `assignToday` can honour; deriving them twice would let the two drift.

5. **§6.4, `completeSession` / `skipSession`.** Add: *"Both are no-ops on an assignment that
   is already `completed` or `skipped`, so the cursor can never advance twice for one day.
   `completedOn` is set by whichever transition pushes the index past the last session."*

6. **§6.7, move `setUi` from the P8 group to the P3 group.** Today's `Start session` control
   navigates with `setUi({ lastView: "train" })`, so the action must exist in P3.

7. **§5, `PlannedSession`.** State the positional invariant: *"`plan.sessions[i].ordinal ===
   i + 1`. `assignToday`'s swap updates both swapped `ordinal` fields to preserve it."*
   Without it the displayed session numbers go out of order after a reshuffle.

8. **§6.4, `closeWeeks`.** Record the limitation: *"`target` is read from the profile's
   current `Availability.weeklySessionTarget`. No history of the target is stored, so
   changing the weekly target retroactively changes the delta of every week not yet
   evaluated."* Alternatively add `targetAt: LocalDate` history to `Availability` — that is a
   §5 change and is out of P3's scope.

9. **§5 / §6.4, plan ownership.** `assignToday` writes back to `state.plans[planId]`. Add:
   *"A `PlanTemplate` belongs to exactly one profile; two cursors must never share a
   `planId`, because a reshuffle rewrites the template."*

10. **§4, `plan/library.ts`.** Change the description from `Exercise[] ported from data.js`
    to `EXERCISES: Record<string, Exercise> ported from data.js`. `PlannedExercise.exerciseId`
    is a key, and every consumer (P3's Today and Plan views, P4's Train view) needs a keyed
    lookup rather than an array scan.

11. **§4, new files created by P3** to add to the tree: `src/store/scheduleActions.ts`,
    `src/store/scheduleSelectors.ts`, `src/app/useWeeklyClose.ts`, `src/ui/format/plan.ts`,
    `src/ui/components/SessionIndicator.tsx`, `src/test/scheduleFixtures.ts`.

---

## What this plan does not do

- It does not build the Train view, set logging, the rest timer, or the hydration cue — those
  are P4, and `Start session` here only sets `ui.lastView` and the assignment status.
- It does not show the motivation video on a negative `delta`; P3 only produces the
  `WeeklyReview` with `missHandled: false` that P6 consumes.
- It does not compute reminder instants from the projection; P5 consumes
  `projectedCalendar()` for that.
- It does not touch `Availability` editing UI: P2 owns the setup wizard and the
  `setAvailability` action, and P3 reads what P2 wrote.
- It does not migrate legacy `s.skipped` or `s.completed` data; P7 owns the v2 → v3
  migration.
- It stores one availability slot per ISO weekday (the first wins if the data holds more).
  Two sessions on one calendar day are out of scope and are not represented anywhere in §5.
