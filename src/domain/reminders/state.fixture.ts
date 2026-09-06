// src/domain/reminders/state.fixture.ts
//
// One complete, schema-shaped AppState for the reminder tests. Test-only: it is imported by
// *.test.ts files alone, so it never reaches the production bundle. It exists because Task 5
// and Task 6 both need the same document and two inline copies would drift.
//
// Calendar anchor: 2026-10-26 is a Monday and 2026-11-01 is the end of US daylight saving,
// so a 14-day window from 2026-10-26 straddles the CDT (UTC−5) → CST (UTC−6) fall-back. The
// profile trains Monday and Thursday at 18:00 local, which puts two training days on each
// side of the transition.
//
// Deviations from the P5 plan's literal draft, recorded here:
//   1. The document is built from schema.defaultState() rather than spelled out field by
//      field. The plan's draft predates the additive root fields (customExercises, notes) and
//      the additive UiPrefs fields (videoInstanceHost, legacyMigration, lastBlockSeenByProfile),
//      and would not compile. Starting from defaultState() is the same technique
//      src/test/scheduleFixtures.ts uses and cannot drift from the schema.
//   2. Profile carries hydration.weighInOptIn, readiness, gymCommute, homeEquipment and
//      bodyweightEquipment, required (or additive-with-default) on the shipped Profile type and
//      absent from the draft. equipmentSteps.hasMicroPlates/.microPlateKg, also absent from the
//      draft, were removed rather than added (Brief F Part 3).
//   3. FixtureOptions gains `assignments`, so a test can put a terminal (completed or skipped)
//      assignment on a training day. Master plan §6.6 as amended emits no instants there.
//   4. A one-day pause on D is stored as [D, D+1), not [D, D]. PlanPause is a HALF-OPEN
//      interval (cursor.ts isPaused), so the draft's { from: D, to: D } is empty and pauses
//      nothing; the "skips paused days" test would have passed for the wrong reason.
//   5. src/test/scheduleFixtures.ts is deliberately NOT reused: it states as an invariant that
//      nothing outside a *.test.ts file imports it, and its makeSession() names sessions
//      "<label> <n>", which is not the copy this plan's body string asserts.

import { addDays } from '../dates';
import { defaultState } from '../schema';
import type {
  AppState,
  Availability,
  EpochMs,
  LocalDate,
  PlanTemplate,
  Profile,
  PushDevice,
  ReminderSettings,
  SessionAssignment,
  TimeZone,
} from '../types';

export const FIXTURE_PROFILE_ID = 'profile-1';
export const FIXTURE_PLAN_ID = 'plan-1';
export const FIXTURE_TIMEZONE: TimeZone = 'America/Chicago';

/** Mon 2026-10-26 00:00 CDT (UTC−5), exact. [ms] epoch, UTC. */
export const FIXTURE_START_MS: EpochMs = 1_792_990_800_000;

/** The profile's single slot start time, both training weekdays. Local wall clock. */
export const FIXTURE_SLOT_TIME = '18:00';

/** plan.sessions.length — the denominator in the notification body. [sessions] */
export const FIXTURE_SESSION_COUNT = 24;

/** cursor.nextSessionIndex: the first projected day serves plan.sessions[2], ordinal 3. */
export const FIXTURE_NEXT_SESSION_INDEX = 2;

function profile(): Profile {
  return {
    id: FIXTURE_PROFILE_ID,
    displayName: 'Tester',
    timezone: FIXTURE_TIMEZONE,
    units: 'metric',
    createdAt: FIXTURE_START_MS, // [ms] epoch, UTC
    body: {
      sex: 'male',
      birthYear: 1995,
      heightCm: 180, // [cm]
      baselineMassKg: 85, // [kg]
      baselineAt: '2026-10-01',
      baselineBodyFatPct: null,
    },
    activity: 'moderate',
    experience: 'intermediate',
    equipment: 'full-gym',
    equipmentSteps: {
      barbellKg: 2.5, // [kg] total on the bar
      dumbbellPairKg: 5, // [kg] per pair
      stackKg: 5, // [kg] per pin
    },
    gymCommute: { walks: false, minutesEachWay: null },
    homeEquipment: [],
    bodyweightEquipment: [],
    goal: { kind: 'muscle-gain', targetMassKg: null, targetBodyFatPct: null, targetDate: null },
    supplements: { creatine: true },
    hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: false }, // [mL]
    readiness: { screenedAt: '2026-10-01', flagged: false },
  };
}

function availability(): Availability {
  return {
    // Monday and Thursday, 18:00 local, one hour each.
    slots: [
      { weekday: 1, startTime: FIXTURE_SLOT_TIME, expectedDurationS: 3600 }, // [s]
      { weekday: 4, startTime: FIXTURE_SLOT_TIME, expectedDurationS: 3600 }, // [s]
    ],
    weeklySessionTarget: 2, // [sessions/week]
  };
}

function plan(): PlanTemplate {
  return {
    id: FIXTURE_PLAN_ID,
    version: 1,
    name: 'Upper/Lower',
    sessionsPerWeek: 2,
    weeks: 12,
    sessions: Array.from({ length: FIXTURE_SESSION_COUNT }, (_, index) => ({
      id: `session-${index + 1}`,
      ordinal: index + 1, // positional invariant: sessions[i].ordinal === i + 1
      name: index % 2 === 0 ? 'Upper A' : 'Lower A',
      kind: 'lift' as const,
      label: index % 2 === 0 ? 'Upper' : 'Lower',
      exercises: [],
    })),
    blocks: [
      {
        index: 0,
        firstSessionIndex: 0,
        sessionCount: FIXTURE_SESSION_COUNT,
        setModifier: 1, // dimensionless
        loadModifier: 1, // dimensionless
        isDeload: false,
      },
    ],
  };
}

export interface FixtureOptions {
  settings?: ReminderSettings;
  /** A single-day pause on this LocalDate, or null for no pause. */
  pausedOn?: LocalDate | null;
  /** Recorded assignments, e.g. a completed or skipped training day. */
  assignments?: SessionAssignment[];
  pushDevice?: PushDevice | null;
}

export function makeAppState(options: FixtureOptions = {}): AppState {
  const settings = options.settings ?? { enabled: true, dayOfTime: '08:00', leadMinutes: [120, 60] };
  const pausedOn = options.pausedOn ?? null;
  const id = FIXTURE_PROFILE_ID;
  const base = defaultState();
  return {
    ...base,
    activeProfileId: id,
    profiles: { [id]: profile() },
    availability: { [id]: availability() },
    plans: { [FIXTURE_PLAN_ID]: plan() },
    cursors: {
      [id]: {
        planId: FIXTURE_PLAN_ID,
        nextSessionIndex: FIXTURE_NEXT_SESSION_INDEX,
        startedOn: '2026-10-05',
        completedOn: null,
      },
    },
    // PlanPause is half-open [from, to): `to` is the first active day again, so a one-day
    // pause on D runs from D to D+1, not D to D.
    pauses: {
      [id]:
        pausedOn === null
          ? []
          : [{ id: 'pause-1', from: pausedOn, to: addDays(pausedOn, 1), reason: null }],
    },
    assignments: { [id]: options.assignments ?? [] },
    reminderSettings: { [id]: settings },
    pushDevice: options.pushDevice ?? null,
    motivation: {
      [id]: { profileId: id, lastShownForWeek: null, lastShownAt: null, customVideoAssetId: null },
    },
    specimens: { [id]: { profileId: id, acquired: {}, totalSetsLogged: 0 } },
    capsules: { [id]: null },
  };
}

