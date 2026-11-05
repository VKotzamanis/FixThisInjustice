// e2e/support/document.ts
//
// The smallest document the app loads as a returning user: one metric profile in
// E2E_TIMEZONE, Mon/Wed/Fri 18:00 preferred, a 6-session plan (3 per week, 2 weeks), cursor at
// 0 from Monday 2026-09-07. Built by hand from types only (no app module is imported at
// runtime, so Playwright's loader never touches src/). src/test/e2eDocument.test.ts proves the
// result passes the app's own parseState unchanged.
//
// Every overlay that would intercept a tap is pre-answered: intro and boot seen, scanlines off,
// warm-up notice dismissed, block 0 already announced (no cut-scene), and the programme starts
// in the week under test, so closeWeeks grades nothing and no missed-week popup opens.
import type {
  AppState,
  BodyMassEntry,
  LoggedSet,
  PlannedSession,
  SessionAssignment,
  SetupDraft,
} from '../../src/domain/types';
import { E2E_TIMEZONE, PROFILE_ID } from './constants';

export const PLAN_ID = 'e2e-plan';
/** ISO week 37 of 2026: Monday 7 to Sunday 13 September. America/Chicago is on CDT (UTC-5). */
export const MONDAY = '2026-09-07';
export const TUESDAY = '2026-09-08';
export const WEDNESDAY = '2026-09-09';

/**
 * Rotation labels in plan order (P3 D09): Today's h1 and Train's h2 show "Week N <label>", so a
 * spec that looks for 'Lower A' finds the heading by substring.
 */
export const SESSION_NAMES = ['Lower A', 'Upper A', 'Lower B', 'Upper B', 'Lower C', 'Upper C'] as const;

function session(index: number, name: string): PlannedSession {
  const lower = index % 2 === 0;
  return {
    id: `e2e-s${String(index + 1)}`,
    ordinal: index + 1, // invariant: sessions[i].ordinal === i + 1
    name: `Week ${String(Math.floor(index / 3) + 1)} ${name}`, // the generator's format, 3 a week
    kind: 'lift',
    label: name,
    exercises: [
      {
        exerciseId: lower ? 'barbell-back-squat' : 'barbell-bench-press',
        setsLo: 3, // [sets]
        setsHi: 3, // [sets]
        prescription: { kind: 'reps', lo: 5, hi: 8 }, // [repetitions]
        restS: 120, // [s]
      },
      {
        exerciseId: lower ? 'romanian-deadlift' : 'barbell-row',
        setsLo: 3, // [sets]
        setsHi: 3, // [sets]
        prescription: { kind: 'reps', lo: 8, hi: 10 }, // [repetitions]
        restS: 90, // [s]
      },
    ],
  };
}

export interface DocumentOptions {
  /** false: a first-run document with no profile (setup on screen). Default true. */
  profile?: boolean;
  /** Default true. */
  introSeen?: boolean;
  assignments?: SessionAssignment[];
  sets?: LoggedSet[];
  setupDraft?: SetupDraft | null;
  nextSessionIndex?: number; // [sessions] offset
  /** The profile's weigh-ins. Default none. */
  bodyMass?: BodyMassEntry[];
  /** Pre/post-session weigh-in opt-in. Default false. */
  weighInOptIn?: boolean;
  /**
   * true: the install card (spec R8) is still undismissed, as on a fresh browser tab. Default
   * false: a returning user who dismissed it, like the warm-up notice above, so layout specs
   * measure the views they test rather than the card.
   */
  installCard?: boolean;
}

/** A logged set of the e2e profile, Monday, session 1, squat; patch what the spec needs. */
export function loggedSet(patch: Partial<LoggedSet> & Pick<LoggedSet, 'id'>): LoggedSet {
  return {
    profileId: PROFILE_ID,
    assignmentDate: MONDAY,
    sessionId: 'e2e-s1',
    exerciseId: 'barbell-back-squat',
    setNumber: 1, // [sets]
    isBonus: false,
    loadKg: 60, // [kg]
    enteredUnit: 'metric',
    reps: 5, // [repetitions]
    durationS: null, // [s]
    rpe: null,
    loggedAt: Date.UTC(2026, 8, 7, 23, 5), // [ms] epoch, UTC = Mon 18:05 CDT
    ...patch,
  };
}

/** A weigh-in of the e2e profile, metric, logged at 12:00 UTC on its date; patch what the spec needs. */
export function bodyMassEntry(patch: Partial<BodyMassEntry> & Pick<BodyMassEntry, 'id' | 'date' | 'massKg'>): BodyMassEntry {
  return {
    profileId: PROFILE_ID,
    enteredUnit: 'metric',
    bodyFatPct: null, // [%]
    loggedAt: Date.parse(`${patch.date}T12:00:00Z`), // [ms] epoch, UTC
    ...patch,
  };
}

export function e2eDocument(opts: DocumentOptions = {}): AppState {
  const withProfile = opts.profile ?? true;
  const sets: Record<string, LoggedSet> = {};
  for (const s of opts.sets ?? []) sets[s.id] = s;
  const ui: AppState['ui'] = {
    bootSeen: true,
    introSeen: opts.introSeen ?? true,
    lastView: 'today',
    accent: '#a3e635',
    scanlines: false,
    flicker: false,
    density: 'normal',
    videoInstanceHost: null,
    legacyMigration: 'pending',
    lastBlockSeenByProfile: withProfile ? { [PROFILE_ID]: 0 } : {},
    skin: 'limelight',
    sounds: false,
    milestoneFloorByProfile: {},
    hotkeys: true,
    warmupNoticeDismissedByProfile: withProfile ? { [PROFILE_ID]: true } : {},
    ...(opts.installCard === true ? {} : { installNudgeDismissed: true as const }),
  };
  const empty: AppState = {
    schemaVersion: 3,
    activeProfileId: null,
    profiles: {},
    availability: {},
    plans: {},
    cursors: {},
    pauses: {},
    assignments: {},
    sets,
    bodyMass: {},
    hydration: {},
    intake: {},
    weeklyReviews: {},
    reminderSettings: {},
    pushDevice: null,
    motivation: {},
    specimens: {},
    capsules: {},
    customExercises: {},
    notes: {},
    setupDraft: opts.setupDraft ?? null,
    ui,
  };
  if (!withProfile) return empty;
  return {
    ...empty,
    activeProfileId: PROFILE_ID,
    profiles: {
      [PROFILE_ID]: {
        id: PROFILE_ID,
        displayName: 'E2E',
        timezone: E2E_TIMEZONE,
        units: 'metric',
        createdAt: Date.UTC(2026, 8, 1), // [ms] epoch, UTC
        body: {
          sex: 'male',
          birthYear: 1990,
          heightCm: 180, // [cm]
          baselineMassKg: 80, // [kg]
          baselineAt: '2026-09-01',
          baselineBodyFatPct: null,
        },
        activity: 'moderate',
        experience: 'novice',
        equipment: 'full-gym',
        equipmentSteps: { barbellKg: 2.5, dumbbellPairKg: 5, stackKg: 5 }, // [kg]
        gymCommute: { walks: false, minutesEachWay: null },
        homeEquipment: [],
        bodyweightEquipment: [],
        goal: { kind: 'maintenance', targetMassKg: null, targetBodyFatPct: null, targetDate: null },
        supplements: { creatine: false },
        hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: opts.weighInOptIn ?? false }, // [mL]
        readiness: { screenedAt: null, flagged: false },
      },
    },
    availability: {
      [PROFILE_ID]: {
        slots: [1, 3, 5].map((weekday) => ({
          weekday: weekday as 1 | 3 | 5,
          startTime: '18:00',
          expectedDurationS: 3600, // [s]
        })),
        weeklySessionTarget: 3, // [sessions/week]
      },
    },
    plans: {
      [PLAN_ID]: {
        id: PLAN_ID,
        version: 1,
        name: 'E2E plan',
        sessionsPerWeek: 3, // [sessions/week]
        weeks: 2, // [weeks]
        sessions: SESSION_NAMES.map((name, i) => session(i, name)),
        blocks: [
          {
            index: 0,
            firstSessionIndex: 0,
            sessionCount: SESSION_NAMES.length, // [sessions]
            setModifier: 1,
            loadModifier: 1,
            isDeload: false,
          },
        ],
      },
    },
    cursors: {
      [PROFILE_ID]: {
        planId: PLAN_ID,
        nextSessionIndex: opts.nextSessionIndex ?? 0,
        startedOn: MONDAY,
        completedOn: null,
      },
    },
    pauses: { [PROFILE_ID]: [] },
    assignments: { [PROFILE_ID]: opts.assignments ?? [] },
    bodyMass: { [PROFILE_ID]: opts.bodyMass ?? [] },
    hydration: { [PROFILE_ID]: [] },
    intake: { [PROFILE_ID]: [] },
    weeklyReviews: { [PROFILE_ID]: [] },
  };
}

/** Mon/Wed/Fri at 18:00 for 60 min; the other days off. Raw text, as the wizard stores it. */
export const REVIEW_DAYS: SetupDraft['days'] = {
  1: { enabled: true, startTime: '18:00', durationMin: '60' },
  2: { enabled: false, startTime: '18:00', durationMin: '60' },
  3: { enabled: true, startTime: '18:00', durationMin: '60' },
  4: { enabled: false, startTime: '18:00', durationMin: '60' },
  5: { enabled: true, startTime: '18:00', durationMin: '60' },
  6: { enabled: false, startTime: '18:00', durationMin: '60' },
  7: { enabled: false, startTime: '18:00', durationMin: '60' },
};

/**
 * A setup draft parked on the Review step (STEPS index 7 in SetupWizard.tsx) with every step
 * answered validly; `patch` breaks exactly the field a spec is about.
 */
export function reviewDraft(patch: Partial<SetupDraft> = {}): SetupDraft {
  return {
    units: 'metric',
    timezone: E2E_TIMEZONE,
    displayName: 'E2E',
    sex: 'male',
    ageYears: '30',
    heightM: '1',
    heightCm: '80',
    heightFt: '',
    heightIn: '',
    mass: '80',
    bodyFatMode: 'known',
    bodyFatPct: '',
    bodyFatSource: 'measured',
    neck: '',
    waist: '',
    hip: '',
    activity: 'moderate',
    activityPal: 1.7,
    experience: 'novice',
    equipment: 'full-gym',
    barbellStep: '2.5',
    dumbbellStep: '5',
    stackStep: '5',
    walksToGym: false,
    walkMinutes: '0',
    homeEquipment: [],
    bodyweightEquipment: [],
    goalKind: 'maintenance',
    targetMass: '',
    targetBodyFat: '',
    targetDate: '',
    creatine: false,
    weighInOptIn: false,
    sessionsPerWeek: 3,
    days: REVIEW_DAYS,
    weeklySessionTarget: '3',
    weeks: '12',
    includeCardio: false,
    stepIndex: 7,
    buffer: null,
    ...patch,
  };
}
