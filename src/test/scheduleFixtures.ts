// src/test/scheduleFixtures.ts
// Deterministic AppState builders for the P3 schedule tests. Test-only: nothing in src/
// outside *.test.ts imports this file.
//
// Calendar anchor: 2026-09-07 is a Monday (verified: 2026-09-01 is a Tuesday).
// NOW_MS is 2026-09-07T06:30Z, which is Monday 09:30 in Europe/Athens (UTC+3, EEST)
// and Sunday 23:30 in America/Los_Angeles (UTC-7, PDT) — one instant, two ISO weeks.
//
// Deviation from the P3 plan's literal (recorded, plan Task 1 Step 1): the plan's
// emptyState() was written before P1 shipped the additive root fields (customExercises,
// notes) and the additive UiPrefs fields (videoInstanceHost, legacyMigration,
// lastBlockSeenByProfile), and its `accent: "green"` is rejected by UiPrefsSchema, which
// requires #rrggbb. emptyState() therefore starts from schema.defaultState() — the one
// definition that cannot drift from the schema — and overrides only what the fixture needs.
// makeProfile() likewise carries equipmentSteps.microPlateKg, hydration.weighInOptIn and
// readiness, all required by the shipped Profile type.

import { MICRO_PLATE_STEP } from '../domain/types';
import type {
  AppState,
  Availability,
  AvailabilitySlot,
  EpochMs,
  IsoWeekday,
  LocalDate,
  LocalTime,
  PlanBlock,
  PlanCursor,
  PlannedExercise,
  PlannedSession,
  PlanPause,
  PlanTemplate,
  Profile,
  SessionAssignment,
  TimeZone,
} from '../domain/types';
import { defaultState } from '../domain/schema';

export const PROFILE_ID = 'p1';
export const PLAN_ID = 'plan-1';

export const MONDAY: LocalDate = '2026-09-07';
export const TUESDAY: LocalDate = '2026-09-08';
export const WEDNESDAY: LocalDate = '2026-09-09';
export const THURSDAY: LocalDate = '2026-09-10';
export const FRIDAY: LocalDate = '2026-09-11';
export const SATURDAY: LocalDate = '2026-09-12';
export const SUNDAY: LocalDate = '2026-09-13';

export const PREV_MONDAY: LocalDate = '2026-08-31';
export const PREV_WEDNESDAY: LocalDate = '2026-09-02';
export const PREV_FRIDAY: LocalDate = '2026-09-04';
export const PREV_SUNDAY: LocalDate = '2026-09-06';

export const TZ_ATHENS: TimeZone = 'Europe/Athens';
export const TZ_LOS_ANGELES: TimeZone = 'America/Los_Angeles';

/** 2026-09-07T06:30:00Z — epoch milliseconds, UTC. */
export const NOW_MS: EpochMs = Date.UTC(2026, 8, 7, 6, 30);

/** [ms] Milliseconds in one UTC day. */
export const DAY_MS = 86_400_000;

/**
 * A parsed, schema-clean document with no profile in it. Built from defaultState() so the
 * fixtures inherit every additive field the schema gains; only the boot flag, the two CRT
 * toggles and the skin are pinned, so no test depends on the shipped defaults for them.
 *
 * The skin is pinned for the reason the other three are, and it became load-bearing when
 * P8 Task 16 put the views on `useCopy()`: the shipped default is 'limelight', so a suite
 * quoting DEFAULT_COPY would otherwise be reading the wrong table. A suite about a skin
 * names the one it wants.
 */
export function emptyState(): AppState {
  const base = defaultState();
  return {
    ...base,
    ui: { ...base.ui, bootSeen: true, scanlines: false, flicker: false, skin: 'clinical' },
  };
}

export function makeProfile(timezone: TimeZone): Profile {
  return {
    id: PROFILE_ID,
    displayName: 'Test subject',
    timezone,
    units: 'metric',
    createdAt: NOW_MS, // [ms] epoch, UTC
    body: {
      sex: 'male',
      birthYear: 1995,
      heightCm: 180, // [cm]
      baselineMassKg: 80, // [kg]
      baselineAt: PREV_MONDAY,
      baselineBodyFatPct: null,
    },
    activity: 'moderate',
    experience: 'novice',
    equipment: 'full-gym',
    equipmentSteps: {
      barbellKg: 2.5, // [kg] total on the bar (pair of 1.25 kg plates)
      dumbbellPairKg: 5, // [kg] per pair
      stackKg: 5, // [kg] per pin
      hasMicroPlates: false,
      microPlateKg: MICRO_PLATE_STEP.metric, // [kg] total for a micro-plate pair
    },
    goal: { kind: 'recomposition', targetMassKg: null, targetBodyFatPct: null, targetDate: null },
    supplements: { creatine: false },
    hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: false }, // [mL]
    readiness: { screenedAt: PREV_MONDAY, flagged: false },
  };
}

export function makeExercise(n: number): PlannedExercise {
  return {
    exerciseId: `ex-${n}`,
    setsLo: 3, // [sets]
    setsHi: 4, // [sets]
    prescription: { kind: 'reps', lo: 6, hi: 10 },
    restS: 120, // [s]
  };
}

export function makeSession(index: number, label: string): PlannedSession {
  return {
    id: `s-${index + 1}`,
    ordinal: index + 1, // positional invariant: sessions[i].ordinal === i + 1
    name: `${label} ${index + 1}`,
    kind: 'lift',
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
    expectedDurationS: 3600, // [s]
  }));
  return { slots, weeklySessionTarget }; // [sessions/week]
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
  const startTime = opts.startTime ?? '07:00';
  const sessionsPerWeek = opts.sessionsPerWeek ?? opts.weekdays.length;
  const sessions = opts.labels.map((label, i) => makeSession(i, label));
  const blocks: PlanBlock[] = opts.blocks ?? [
    {
      index: 0,
      firstSessionIndex: 0,
      sessionCount: sessions.length,
      setModifier: 1, // dimensionless
      loadModifier: 1, // dimensionless
      isDeload: false,
    },
  ];
  const plan: PlanTemplate = {
    id: PLAN_ID,
    version: 1,
    name: 'Test plan',
    sessionsPerWeek,
    weeks: Math.max(1, Math.ceil(sessions.length / Math.max(1, sessionsPerWeek))), // [weeks]
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
  if (!plan) throw new Error('fixture: plan missing');
  return plan;
}

export function cursorOf(state: AppState): PlanCursor {
  const cursor = state.cursors[PROFILE_ID];
  if (!cursor) throw new Error('fixture: cursor missing');
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
  return plan.sessions
    .slice(from, to + 1)
    .map((s) => s.label)
    .sort();
}
