import fc from 'fast-check';
import type {
  AppState,
  Availability,
  BodyMassEntry,
  Exercise,
  HydrationEntry,
  IntakeEntry,
  LocalDate,
  LoggedSet,
  MotivationState,
  PlanCursor,
  PlanPause,
  PlannedExercise,
  PlanTemplate,
  Prescription,
  Profile,
  PushDevice,
  ReminderSettings,
  SessionAssignment,
  SpecimenInventory,
  TimeCapsule,
  UiPrefs,
  WeeklyReview,
} from './types';
import { addDays } from './dates';
import { MAX_EPOCH_MS } from './schema';

/**
 * fast-check generators for the persisted document.
 *
 * Every generated value must survive JSON.stringify then JSON.parse unchanged,
 * because the round-trip property (security constraint 5) compares the parsed
 * result to the generated state by deep equality. Two consequences shape the
 * generators below:
 *   - negative zero is normalised to positive zero, because JSON.stringify(-0)
 *     is "0" and the asymmetry would fail the property for the wrong reason;
 *   - no NaN and no infinities are generated, because JSON.stringify turns them
 *     into null and the schema rejects them anyway (this is finding M6).
 */

/** Normalises -0 to 0 so a JSON round trip is an identity. */
function noNegativeZero(x: number): number {
  return Object.is(x, -0) ? 0 : x;
}

function finite(min: number, max: number): fc.Arbitrary<number> {
  return fc.double({ min, max, noNaN: true, noDefaultInfinity: true }).map(noNegativeZero);
}

const anyId = fc.uuid();
const anyText = fc.string({ minLength: 1, maxLength: 40 });

/** Civil dates inside a window wide enough to cross both 2026 DST transitions. */
export const anyLocalDate: fc.Arbitrary<LocalDate> = fc
  .integer({ min: 0, max: 730 })
  .map((offset) => addDays('2025-06-01', offset));

export const anyLocalTime = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

export const anyTimeZone = fc.constantFrom(
  'Europe/Athens',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
);

export const anyUnitSystem = fc.constantFrom('metric' as const, 'imperial' as const);
const anyIsoWeekday = fc.constantFrom(
  1 as const,
  2 as const,
  3 as const,
  4 as const,
  5 as const,
  6 as const,
  7 as const,
);
/**
 * [ms] Epoch instants, bounded by the schema's own limit rather than by a
 * plausible app lifetime.
 *
 * The bound is imported, not repeated: the round-trip property is the only
 * check that the generator and EpochMsSchema agree, so a generator with its own
 * literal would keep passing while the schema moved underneath it — and would
 * never exercise the extremes the schema now accepts. fc.integer is inclusive
 * at both ends, so ±MAX_EPOCH_MS themselves are generated.
 */
const anyEpochMs = fc.integer({ min: -MAX_EPOCH_MS, max: MAX_EPOCH_MS });

export const anyProfile: fc.Arbitrary<Profile> = fc.record({
  id: anyId,
  displayName: anyText,
  timezone: anyTimeZone,
  units: anyUnitSystem,
  createdAt: anyEpochMs,
  body: fc.record({
    sex: fc.constantFrom('male' as const, 'female' as const),
    birthYear: fc.integer({ min: 1900, max: 2200 }),
    heightCm: finite(1, 300), // [cm]
    baselineMassKg: finite(1, 500), // [kg]
    baselineAt: anyLocalDate,
    baselineBodyFatPct: fc.option(finite(0, 100), { nil: null }),
  }),
  // Master plan section 10: the three verified FAO/WHO/UNU PAL bands, no midpoints.
  activity: fc.constantFrom('sedentary' as const, 'moderate' as const, 'vigorous' as const),
  experience: fc.constantFrom('novice' as const, 'intermediate' as const, 'advanced' as const),
  equipment: fc.constantFrom('full-gym' as const, 'dumbbells-only' as const, 'bodyweight' as const),
  equipmentSteps: fc.record({
    barbellKg: finite(0.25, 100), // [kg] total on the bar
    dumbbellPairKg: finite(0.25, 100), // [kg] per pair
    stackKg: finite(0.25, 100), // [kg] per pin
    hasMicroPlates: fc.boolean(),
    microPlateKg: finite(0.1, 5), // [kg] total for a micro-plate pair
  }),
  goal: fc.record({
    kind: fc.constantFrom(
      'fat-loss' as const,
      'muscle-gain' as const,
      'recomposition' as const,
      'maintenance' as const,
    ),
    targetMassKg: fc.option(finite(1, 500), { nil: null }), // [kg]
    targetBodyFatPct: fc.option(finite(0, 100), { nil: null }),
    targetDate: fc.option(anyLocalDate, { nil: null }),
  }),
  supplements: fc.record({ creatine: fc.boolean() }),
  hydration: fc.record({
    dailyTargetML: fc.integer({ min: 0, max: 20_000 }), // [mL/day]
    cupSizeML: fc.integer({ min: 0, max: 20_000 }), // [mL]
    weighInOptIn: fc.boolean(),
  }),
  readiness: fc.record({
    screenedAt: fc.option(anyLocalDate, { nil: null }),
    flagged: fc.boolean(),
  }),
});

export const anyAvailability: fc.Arbitrary<Availability> = fc
  .array(
    fc.record({
      weekday: anyIsoWeekday,
      startTime: anyLocalTime,
      expectedDurationS: finite(0, 86_400), // [s]
    }),
    { minLength: 1, maxLength: 7 },
  )
  .chain((slots) =>
    fc
      .integer({ min: 1, max: slots.length })
      .map((weeklySessionTarget) => ({ slots, weeklySessionTarget })),
  );

const anyPrescription: fc.Arbitrary<Prescription> = fc.oneof(
  fc.tuple(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 0, max: 99 })).map(([lo, extra]) => ({
    kind: 'reps' as const,
    lo,
    hi: Math.min(100, lo + extra),
  })),
  fc.record({
    kind: fc.constant('amrap' as const),
    minimum: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
  }),
  fc.record({ kind: fc.constant('time' as const), targetS: finite(0, 86_400) }),
  fc.record({ kind: fc.constant('duration' as const), targetS: finite(0, 86_400) }),
  fc.record({ kind: fc.constant('none' as const) }),
);

const anyPlannedExercise: fc.Arbitrary<PlannedExercise> = fc
  .tuple(
    anyId,
    fc.integer({ min: 1, max: 20 }),
    fc.integer({ min: 0, max: 19 }),
    anyPrescription,
    finite(0, 86_400),
  )
  .map(([exerciseId, setsLo, extra, prescription, restS]) => ({
    exerciseId,
    setsLo,
    setsHi: Math.min(20, setsLo + extra),
    prescription,
    restS, // [s]
  }));

/** A user-added exercise. Library exercises use the canonical slugs; these do not. */
export const anyExercise: fc.Arbitrary<Exercise> = fc.record({
  id: anyId,
  name: anyText,
  isBodyweight: fc.boolean(),
  isCompoundPrimary: fc.boolean(),
  modality: fc.constantFrom(
    'barbell' as const,
    'dumbbell' as const,
    'machine' as const,
    'cable' as const,
    'bodyweight' as const,
  ),
  loadClass: fc.constantFrom(
    'lower-compound' as const,
    'upper-compound' as const,
    'isolation' as const,
  ),
  muscleGroups: fc.array(anyText, { maxLength: 3 }),
  secondaryMuscles: fc.array(anyText, { maxLength: 3 }),
  equipment: fc.array(
    fc.constantFrom('full-gym' as const, 'dumbbells-only' as const, 'bodyweight' as const),
    { maxLength: 3 },
  ),
  videoQuery: fc.option(anyText, { nil: null }),
  formCueId: fc.option(anyId, { nil: null }),
  note: fc.option(anyText, { nil: null }),
});

export const anyPlanTemplate: fc.Arbitrary<PlanTemplate> = fc.record({
  id: anyId,
  version: fc.integer({ min: 1, max: 10 }),
  name: anyText,
  sessionsPerWeek: fc.integer({ min: 1, max: 7 }),
  weeks: fc.integer({ min: 1, max: 104 }),
  sessions: fc.array(
    fc.record({
      id: anyId,
      ordinal: fc.integer({ min: 1, max: 200 }), // 1-based position in the plan
      name: anyText,
      kind: fc.constantFrom('lift' as const, 'cardio' as const),
      label: anyText,
      exercises: fc.array(anyPlannedExercise, { maxLength: 3 }),
    }),
    { maxLength: 3 },
  ),
  blocks: fc.array(
    fc.record({
      index: fc.integer({ min: 0, max: 20 }),
      firstSessionIndex: fc.integer({ min: 0, max: 200 }),
      sessionCount: fc.integer({ min: 0, max: 200 }),
      setModifier: finite(0.01, 2),
      loadModifier: finite(0.01, 2),
      isDeload: fc.boolean(),
    }),
    { maxLength: 3 },
  ),
});

export const anyPlanCursor: fc.Arbitrary<PlanCursor> = fc.record({
  planId: anyId,
  nextSessionIndex: fc.integer({ min: 0, max: 200 }),
  startedOn: anyLocalDate,
  completedOn: fc.option(anyLocalDate, { nil: null }),
});

export const anyPlanPause: fc.Arbitrary<PlanPause> = fc.record({
  id: anyId,
  from: anyLocalDate,
  to: fc.option(anyLocalDate, { nil: null }),
  reason: fc.option(anyText, { nil: null }),
});

export const anySessionAssignment: fc.Arbitrary<SessionAssignment> = fc.record({
  date: anyLocalDate,
  sessionId: anyId,
  sourceIndex: fc.integer({ min: 0, max: 200 }),
  status: fc.constantFrom(
    'planned' as const,
    'in-progress' as const,
    'completed' as const,
    'skipped' as const,
  ),
  startedAt: fc.option(anyEpochMs, { nil: null }),
  completedAt: fc.option(anyEpochMs, { nil: null }),
  skipReason: fc.option(anyText, { nil: null }),
});

export const anyLoggedSet: fc.Arbitrary<LoggedSet> = fc.record({
  id: anyId,
  profileId: anyId,
  assignmentDate: anyLocalDate,
  sessionId: anyId,
  exerciseId: anyId,
  setNumber: fc.integer({ min: 1, max: 20 }),
  isBonus: fc.boolean(),
  // [kg] 0 is a real bodyweight set; null means the load was not recorded.
  loadKg: fc.option(finite(0, 500), { nil: null }),
  enteredUnit: anyUnitSystem,
  reps: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
  durationS: fc.option(finite(0, 86_400), { nil: null }), // [s]
  // dimensionless, 1-10 on the half-point grid the schema enforces. n / 2 for
  // integral n is exact in binary floating point, so it survives JSON unchanged.
  rpe: fc.option(
    fc.integer({ min: 2, max: 20 }).map((n) => n / 2),
    { nil: null },
  ),
  loggedAt: anyEpochMs,
});

export const anyBodyMassEntry: fc.Arbitrary<BodyMassEntry> = fc.record({
  id: anyId,
  profileId: anyId,
  date: anyLocalDate,
  massKg: finite(1, 500), // [kg]
  enteredUnit: anyUnitSystem,
  bodyFatPct: fc.option(finite(0, 100), { nil: null }),
  loggedAt: anyEpochMs,
});

export const anyHydrationEntry: fc.Arbitrary<HydrationEntry> = fc.record({
  profileId: anyId,
  date: anyLocalDate,
  volumeML: fc.integer({ min: 0, max: 20_000 }), // [mL]
  marks: fc.array(anyEpochMs, { maxLength: 5 }),
});

export const anyIntakeEntry: fc.Arbitrary<IntakeEntry> = fc.record({
  profileId: anyId,
  date: anyLocalDate,
  kcal: finite(0, 20_000), // [kcal/day]
  proteinG: finite(0, 1_000), // [g/day]
});

export const anyReminderSettings: fc.Arbitrary<ReminderSettings> = fc.record({
  enabled: fc.boolean(),
  dayOfTime: anyLocalTime,
  leadMinutes: fc.array(fc.integer({ min: 0, max: 1_440 }), { maxLength: 4 }), // [min]
});

export const anyWeeklyReview: fc.Arbitrary<WeeklyReview> = fc
  .tuple(
    anyId,
    anyLocalDate,
    fc.integer({ min: 0, max: 7 }),
    fc.integer({ min: 0, max: 7 }),
    fc.integer({ min: 0, max: 7 }),
    fc.boolean(),
    anyEpochMs,
    fc.boolean(),
  )
  .map(([profileId, weekStart, target, completed, skipped, paused, evaluatedAt, missHandled]) => ({
    profileId,
    weekStart,
    weekEnd: addDays(weekStart, 6),
    target,
    completed,
    skipped,
    paused,
    // delta = completed - target; negative means sessions missed.
    delta: completed - target,
    evaluatedAt,
    missHandled,
  }));

export const anyMotivationState: fc.Arbitrary<MotivationState> = fc.record({
  profileId: anyId,
  lastShownForWeek: fc.option(anyLocalDate, { nil: null }),
  lastShownAt: fc.option(anyEpochMs, { nil: null }),
  customVideoAssetId: fc.option(anyId, { nil: null }),
});

export const anySpecimenInventory: fc.Arbitrary<SpecimenInventory> = fc.record({
  profileId: anyId,
  acquired: fc.dictionary(
    anyId,
    fc.record({ at: anyEpochMs, exerciseId: fc.option(anyId, { nil: null }) }),
    { maxKeys: 3 },
  ),
  totalSetsLogged: fc.integer({ min: 0, max: 10_000 }),
});

export const anyTimeCapsule: fc.Arbitrary<TimeCapsule> = fc.record({
  note: fc.string({ maxLength: 200 }),
  writtenAt: anyEpochMs,
  opensOn: anyLocalDate,
  opened: fc.boolean(),
});

/** One profile's daily notes, keyed by local day. */
const anyNotesForProfile: fc.Arbitrary<Record<LocalDate, string>> = fc
  .array(fc.tuple(anyLocalDate, fc.string({ maxLength: 120 })), { maxLength: 3 })
  .map((pairs) => {
    const out: Record<LocalDate, string> = {};
    for (const [date, text] of pairs) out[date] = text;
    return out;
  });

/**
 * base64url is the encoding the Web Push API uses for the subscription keys
 * (RFC 8291 / RFC 4648 section 5): the URL-safe alphabet, no padding.
 */
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split(
  '',
);

function base64Url(length: number): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...BASE64URL_ALPHABET), { minLength: length, maxLength: length })
    .map((chars) => chars.join(''));
}

/**
 * A push subscription as a real user agent hands it over: an https endpoint on a
 * push service, a 65-byte uncompressed P-256 public key (87 base64url chars) and
 * a 16-byte auth secret (22 base64url chars).
 */
export const anyPushDevice: fc.Arbitrary<PushDevice> = fc.record({
  deviceId: anyId,
  secret: base64Url(32),
  endpoint: fc
    .tuple(
      fc.constantFrom(
        'https://fcm.googleapis.com/fcm/send/',
        'https://updates.push.services.mozilla.com/wpush/v2/',
        'https://wns2-par02p.notify.windows.com/w/?token=',
      ),
      base64Url(24),
    )
    .map(([prefix, token]) => `${prefix}${token}`),
  keys: fc.record({ p256dh: base64Url(87), auth: base64Url(22) }),
  createdAt: anyEpochMs, // [ms]
  lastSyncAt: fc.option(anyEpochMs, { nil: null }), // [ms]
  lastSyncHash: fc.option(base64Url(43), { nil: null }),
});

export const anyUiPrefs: fc.Arbitrary<UiPrefs> = fc.record({
  bootSeen: fc.boolean(),
  lastView: anyText,
  accent: fc.constantFrom('#a3e635', '#67e8f9', '#fbbf24'),
  scanlines: fc.boolean(),
  flicker: fc.boolean(),
  density: fc.constantFrom('compact' as const, 'normal' as const),
  videoInstanceHost: fc.option(
    fc.constantFrom('invidious.nerdvpn.de', 'inv.nadeko.net', 'invidious.tiekoetter.com'),
    { nil: null },
  ),
  legacyMigration: fc.constantFrom('pending' as const, 'done' as const, 'dismissed' as const),
  lastBlockSeenByProfile: fc.dictionary(anyId, fc.integer({ min: 0, max: 20 }), { maxKeys: 2 }),
});

/**
 * A whole persisted document. Profile ids are shared across the per-profile maps
 * so the generated state resembles a real one rather than a bag of orphans.
 */
export const anyAppState: fc.Arbitrary<AppState> = fc
  .array(anyId, { minLength: 0, maxLength: 2 })
  .chain((profileIds) => {
    const byProfile = <T>(arb: fc.Arbitrary<T>): fc.Arbitrary<Record<string, T>> =>
      fc.tuple(...profileIds.map(() => arb)).map((values) => {
        const out: Record<string, T> = {};
        profileIds.forEach((id, i) => {
          const v = values[i];
          if (v !== undefined) out[id] = v;
        });
        return out;
      });

    return fc.record({
      schemaVersion: fc.constant(3 as const),
      activeProfileId: fc.constant(profileIds[0] ?? null),
      profiles: byProfile(anyProfile).map((m) => {
        const out: Record<string, Profile> = {};
        for (const [id, p] of Object.entries(m)) out[id] = { ...p, id };
        return out;
      }),
      availability: byProfile(anyAvailability),
      plans: byProfile(anyPlanTemplate),
      cursors: byProfile(anyPlanCursor),
      pauses: byProfile(fc.array(anyPlanPause, { maxLength: 2 })),
      assignments: byProfile(fc.array(anySessionAssignment, { maxLength: 3 })),
      sets: fc.array(anyLoggedSet, { maxLength: 4 }).map((list) => {
        const out: Record<string, LoggedSet> = {};
        for (const s of list) out[s.id] = s;
        return out;
      }),
      bodyMass: byProfile(fc.array(anyBodyMassEntry, { maxLength: 3 })),
      hydration: byProfile(fc.array(anyHydrationEntry, { maxLength: 3 })),
      intake: byProfile(fc.array(anyIntakeEntry, { maxLength: 3 })),
      weeklyReviews: byProfile(fc.array(anyWeeklyReview, { maxLength: 3 })),
      reminderSettings: byProfile(anyReminderSettings),
      pushDevice: fc.option(anyPushDevice, { nil: null }),
      motivation: byProfile(anyMotivationState),
      specimens: byProfile(anySpecimenInventory),
      capsules: byProfile(fc.option(anyTimeCapsule, { nil: null })),
      customExercises: byProfile(fc.array(anyExercise, { maxLength: 2 })),
      notes: byProfile(anyNotesForProfile),
      ui: anyUiPrefs,
    });
  });
