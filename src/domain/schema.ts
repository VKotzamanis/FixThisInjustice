import { z } from 'zod';
import { MICRO_PLATE_STEP } from './types';
import type { AppState } from './types';
import { isValidLocalDate, isValidLocalTime, isValidTimeZone } from './dates';
import { migrate } from './migrations';

/** The schema version this build writes and is the ceiling for what it will read. */
export const CURRENT_SCHEMA_VERSION = 3;

// ---------------------------------------------------------------------------
// Numeric bounds.
//
// Security review constraint 3: bound every numeric field; use Number.isFinite,
// never !isNaN. Zod 4's z.number() already rejects NaN and both infinities
// (verified against zod 4.5.4, not assumed), so the bounds below are the only
// thing left to state. Each is either a value the reviews fixed or a sanity
// ceiling that no real measurement can reach; the comment says which.
// ---------------------------------------------------------------------------

/** [kg] Security constraint 3 caps loads at 500. 0 is a valid bodyweight set (master plan section 8, A60). */
const MAX_LOAD_KG = 500;
/** [kg] Security constraint 3: 0 < mass <= 500. Body mass, unlike a load, cannot be zero. */
const MAX_MASS_KG = 500;
/** [reps] Security constraint 3: 1 <= reps <= 100, integer. */
const MIN_REPS = 1;
const MAX_REPS = 100;
/**
 * RPE is the 1-10 resistance-training scale, dimensionless. The scale is defined
 * on half-point increments (RPE 7.5 is a real reading; RPE 7.3 is not), so the
 * step is part of the domain, not a display convention.
 */
const MIN_RPE = 1;
const MAX_RPE = 10;
/** [cm] Sanity ceiling. The tallest recorded human stature is under 280 cm. */
const MAX_HEIGHT_CM = 300;
/** [year] Sanity window for a birth year; no verified age bound exists in the reviews. */
const MIN_BIRTH_YEAR = 1900;
const MAX_BIRTH_YEAR = 2200;
/** [s] Sanity ceiling: one day. No prescribed interval approaches it. */
const MAX_SECONDS = 86_400;
/** [mL] Sanity ceiling for a daily fluid figure. */
const MAX_ML = 20_000;
/** [kcal/day] and [g/day] sanity ceilings for a hand-entered daily total. */
const MAX_KCAL = 20_000;
const MAX_PROTEIN_G = 1_000;
/** [kg] Sanity ceiling for an equipment increment. */
const MAX_STEP_KG = 100;
/** [sets] and [sessions/week]: sanity ceilings. */
const MAX_SETS = 20;
const MAX_SESSIONS_PER_WEEK = 7;
/** [weeks] Sanity ceiling for a plan's length; two years. */
const MAX_PLAN_WEEKS = 104;
/**
 * [sessions] Sanity ceiling for any index into a plan's session list, and for a
 * count of them. MAX_PLAN_WEEKS * MAX_SESSIONS_PER_WEEK is the largest plan the
 * bounds above admit; a cursor may sit one past the last session, so the ceiling
 * is inclusive of the count itself.
 */
const MAX_PLAN_SESSIONS = MAX_PLAN_WEEKS * MAX_SESSIONS_PER_WEEK;
/** [blocks] Sanity ceiling: at most one block per week of the longest plan. */
const MAX_BLOCKS = MAX_PLAN_WEEKS;
/** Plan template revision counter, dimensionless. Sanity ceiling. */
const MAX_PLAN_VERSION = 1_000;
/** [sets] Lifetime set counter behind the specimen draw. Sanity ceiling. */
const MAX_TOTAL_SETS = 1_000_000;
/** Plan block multipliers, dimensionless: 1 means unchanged; 2 is a sanity ceiling. */
const MAX_MODIFIER = 2;
/** [min] Reminder lead time, capped at one day. */
const MAX_LEAD_MINUTES = 1_440;
/** [characters] Free-text ceilings, so a corrupted blob cannot be stored back. */
const MAX_NOTE_CHARS = 5_000;
/** [characters] Maximum length of a DNS name, RFC 1035; bounds the video host. */
const MAX_HOSTNAME_CHARS = 253;
/** [characters] Specimen card id, e.g. "c001". A sanity ceiling, not the shipped length. */
const MAX_CARD_ID_CHARS = 40;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** [kg] >= 0. Zero is a bodyweight set, not a missing value. */
const KgLoad = z.number().min(0).max(MAX_LOAD_KG);
/** [kg] > 0. Body mass. */
const KgMass = z.number().gt(0).max(MAX_MASS_KG);
/** [mL] integer >= 0. */
const MilliLitres = z.int().min(0).max(MAX_ML);
/** [s] >= 0. */
const SecondsSchema = z.number().min(0).max(MAX_SECONDS);
/**
 * [ms] Maximum magnitude of an epoch instant: the ECMAScript time-value range,
 * ±8.64e15 ms = ±100,000,000 days either side of 1970-01-01 (ECMA-262
 * §21.4.1.1, "Time Values and Time Range").
 */
export const MAX_EPOCH_MS = 8_640_000_000_000_000; // [ms]

/**
 * [ms] Epoch milliseconds, UTC. Integer; negative means before 1970 and is
 * allowed.
 *
 * z.int() alone stops only at the safe-integer range (±9.007e15), which is
 * wider than the range Date can represent. One millisecond past MAX_EPOCH_MS
 * makes `new Date(t)` an Invalid Date, so every helper in src/domain/dates.ts
 * would return NaN-shaped text for it and the failure would surface as a
 * corrupt date string somewhere downstream rather than as a rejected document.
 */
const EpochMsSchema = z.int().min(-MAX_EPOCH_MS).max(MAX_EPOCH_MS);

const LocalDateSchema = z
  .string()
  .refine((s) => isValidLocalDate(s), { message: 'expected a calendar-valid YYYY-MM-DD date' });

const LocalTimeSchema = z
  .string()
  .refine((s) => isValidLocalTime(s), { message: 'expected a 24-hour HH:mm time' });

const TimeZoneSchema = z
  .string()
  .refine((s) => isValidTimeZone(s), { message: 'expected an IANA time zone identifier' });

const IsoWeekdaySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

const UnitSystemSchema = z.enum(['metric', 'imperial']);
/** [%] 0 to 100. */
const PercentSchema = z.number().min(0).max(100);

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

const SexSchema = z.enum(['male', 'female']);
/**
 * Master plan section 10.1: the three FAO/WHO/UNU 2004 PAL bands the content
 * review verified. The five-band form with invented midpoints was rejected.
 */
const ActivityLevelSchema = z.enum(['sedentary', 'moderate', 'vigorous']);
const GoalKindSchema = z.enum(['fat-loss', 'muscle-gain', 'recomposition', 'maintenance']);
const ExperienceSchema = z.enum(['novice', 'intermediate', 'advanced']);
const EquipmentSchema = z.enum(['full-gym', 'dumbbells-only', 'bodyweight']);

export const ProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(80),
  timezone: TimeZoneSchema,
  units: UnitSystemSchema,
  createdAt: EpochMsSchema,
  body: z.object({
    sex: SexSchema,
    birthYear: z.int().min(MIN_BIRTH_YEAR).max(MAX_BIRTH_YEAR), // [year]
    heightCm: z.number().gt(0).max(MAX_HEIGHT_CM), // [cm]
    baselineMassKg: KgMass, // [kg]
    baselineAt: LocalDateSchema,
    baselineBodyFatPct: PercentSchema.nullable(), // [%]
  }),
  activity: ActivityLevelSchema,
  experience: ExperienceSchema,
  equipment: EquipmentSchema,
  equipmentSteps: z.object({
    barbellKg: z.number().gt(0).max(MAX_STEP_KG), // [kg] total on the bar
    dumbbellPairKg: z.number().gt(0).max(MAX_STEP_KG), // [kg] per pair
    stackKg: z.number().gt(0).max(MAX_STEP_KG), // [kg] per pin
    hasMicroPlates: z.boolean(),
    // [kg] total for a micro-plate pair. Added after the field set was first
    // written, so it defaults to the metric MICRO_PLATE_STEP for documents that
    // predate it; those documents already carried hasMicroPlates.
    microPlateKg: z.number().gt(0).max(MAX_STEP_KG).default(MICRO_PLATE_STEP.metric),
  }),
  goal: z.object({
    kind: GoalKindSchema,
    targetMassKg: KgMass.nullable(), // [kg]
    targetBodyFatPct: PercentSchema.nullable(), // [%]
    targetDate: LocalDateSchema.nullable(),
  }),
  supplements: z.object({ creatine: z.boolean() }),
  hydration: z.object({
    dailyTargetML: MilliLitres, // [mL/day]
    cupSizeML: MilliLitres, // [mL] display granularity only
    // Additive: the pre/post-session mass check is opt-in, so an older document
    // that never offered the choice loads as "not opted in".
    weighInOptIn: z.boolean().default(false),
  }),
  // Additive (master plan section 10, P2 item 20): the pre-participation screen.
  // A document written before the screen existed has not been screened.
  readiness: z
    .object({ screenedAt: LocalDateSchema.nullable(), flagged: z.boolean() })
    .default({ screenedAt: null, flagged: false }),
});

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export const AvailabilitySlotSchema = z.object({
  weekday: IsoWeekdaySchema,
  startTime: LocalTimeSchema,
  expectedDurationS: SecondsSchema, // [s]
});

export const AvailabilitySchema = z
  .object({
    slots: z.array(AvailabilitySlotSchema).max(MAX_SESSIONS_PER_WEEK),
    weeklySessionTarget: z.int().min(1).max(MAX_SESSIONS_PER_WEEK), // [sessions/week]
  })
  .refine((a) => a.weeklySessionTarget <= a.slots.length, {
    message: 'weeklySessionTarget cannot exceed the number of available slots',
  });

// ---------------------------------------------------------------------------
// Plan template
// ---------------------------------------------------------------------------

export const PrescriptionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('reps'),
      lo: z.int().min(MIN_REPS).max(MAX_REPS), // [reps]
      hi: z.int().min(MIN_REPS).max(MAX_REPS), // [reps]
    })
    .refine((p) => p.hi >= p.lo, { message: 'reps hi must be >= lo' }),
  z.object({
    kind: z.literal('amrap'),
    minimum: z.int().min(MIN_REPS).max(MAX_REPS).nullable(), // [reps]
  }),
  z.object({ kind: z.literal('time'), targetS: SecondsSchema }), // [s]
  z.object({ kind: z.literal('duration'), targetS: SecondsSchema }), // [s]
  z.object({ kind: z.literal('none') }),
]);

const ModalitySchema = z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight']);
const LoadClassSchema = z.enum(['lower-compound', 'upper-compound', 'isolation']);

/**
 * [characters] Longest exercise name the document will hold, trimmed.
 *
 * Exported so the form that collects the name caps its input against the same number the
 * schema rejects it by (P4 review item 1): the field had no maxLength, so a longer name
 * reached the store and threw out of a click handler no boundary catches.
 */
export const EXERCISE_NAME_MAX_CHARS = 120; // [characters]

export const ExerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(EXERCISE_NAME_MAX_CHARS),
  isBodyweight: z.boolean(),
  isCompoundPrimary: z.boolean(),
  modality: ModalitySchema,
  loadClass: LoadClassSchema,
  /** Direct movers; each counts as a whole set in the weekly volume tally. */
  muscleGroups: z.array(z.string().min(1)),
  /**
   * Additive: dynamic assisting movers, each counting as half a set. An older
   * exercise record has none, which reproduces the pre-amendment tally exactly.
   */
  secondaryMuscles: z.array(z.string().min(1)).default([]),
  equipment: z.array(EquipmentSchema),
  videoQuery: z.string().max(MAX_NOTE_CHARS).nullable(),
  formCueId: z.string().max(120).nullable(),
  note: z.string().max(MAX_NOTE_CHARS).nullable(),
});

export const PlannedExerciseSchema = z
  .object({
    exerciseId: z.string().min(1),
    setsLo: z.int().min(1).max(MAX_SETS), // [sets]
    setsHi: z.int().min(1).max(MAX_SETS), // [sets]
    prescription: PrescriptionSchema,
    restS: SecondsSchema, // [s]
  })
  .refine((p) => p.setsHi >= p.setsLo, { message: 'setsHi must be >= setsLo' });

const SessionKindSchema = z.enum(['lift', 'cardio']);

export const PlannedSessionSchema = z.object({
  id: z.string().min(1),
  // 1-based position in the plan (types.ts: plan.sessions[i].ordinal === i + 1),
  // so 0 is not a legal ordinal.
  ordinal: z.int().min(1).max(MAX_PLAN_SESSIONS),
  name: z.string().min(1).max(120),
  kind: SessionKindSchema,
  label: z.string().min(1).max(60),
  exercises: z.array(PlannedExerciseSchema),
});

export const PlanBlockSchema = z.object({
  index: z.int().min(0).max(MAX_BLOCKS), // 0-based block position
  firstSessionIndex: z.int().min(0).max(MAX_PLAN_SESSIONS), // [sessions] offset
  sessionCount: z.int().min(0).max(MAX_PLAN_SESSIONS), // [sessions]
  setModifier: z.number().gt(0).max(MAX_MODIFIER), // dimensionless, 1 = unchanged
  loadModifier: z.number().gt(0).max(MAX_MODIFIER), // dimensionless, 1 = unchanged
  isDeload: z.boolean(),
});

export const PlanTemplateSchema = z.object({
  id: z.string().min(1),
  version: z.int().min(1).max(MAX_PLAN_VERSION), // revision counter, dimensionless
  name: z.string().min(1).max(120),
  sessionsPerWeek: z.int().min(1).max(MAX_SESSIONS_PER_WEEK), // [sessions/week]
  weeks: z.int().min(1).max(MAX_PLAN_WEEKS), // [weeks]
  sessions: z.array(PlannedSessionSchema).max(MAX_PLAN_SESSIONS),
  blocks: z.array(PlanBlockSchema).max(MAX_BLOCKS),
});

// ---------------------------------------------------------------------------
// Cursor, pauses, assignments
// ---------------------------------------------------------------------------

export const PlanCursorSchema = z.object({
  planId: z.string().min(1),
  nextSessionIndex: z.int().min(0).max(MAX_PLAN_SESSIONS), // [sessions] offset
  startedOn: LocalDateSchema,
  completedOn: LocalDateSchema.nullable(),
});

export const PlanPauseSchema = z.object({
  id: z.string().min(1),
  from: LocalDateSchema,
  to: LocalDateSchema.nullable(),
  reason: z.string().max(500).nullable(),
});

const AssignmentStatusSchema = z.enum(['planned', 'in-progress', 'completed', 'skipped']);

export const SessionAssignmentSchema = z.object({
  date: LocalDateSchema,
  sessionId: z.string().min(1),
  sourceIndex: z.int().min(0).max(MAX_PLAN_SESSIONS), // [sessions] offset
  status: AssignmentStatusSchema,
  startedAt: EpochMsSchema.nullable(), // [ms]
  completedAt: EpochMsSchema.nullable(), // [ms]
  skipReason: z.string().max(500).nullable(),
});

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export const LoggedSetSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  assignmentDate: LocalDateSchema,
  sessionId: z.string().min(1),
  exerciseId: z.string().min(1),
  setNumber: z.int().min(1).max(MAX_SETS), // [sets] 1-based
  isBonus: z.boolean(),
  loadKg: KgLoad.nullable(), // [kg]
  enteredUnit: UnitSystemSchema,
  reps: z.int().min(MIN_REPS).max(MAX_REPS).nullable(), // [reps]
  durationS: SecondsSchema.nullable(), // [s]
  // dimensionless, 1-10 on the half-point grid. v * 2 is integral exactly for
  // every representable half, so the test needs no tolerance.
  rpe: z
    .number()
    .min(MIN_RPE)
    .max(MAX_RPE)
    .refine((v) => Number.isInteger(v * 2), {
      message: 'rpe is recorded in 0.5 steps',
    })
    .nullable(),
  loggedAt: EpochMsSchema, // [ms]
});

export const BodyMassEntrySchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  date: LocalDateSchema,
  massKg: KgMass, // [kg]
  enteredUnit: UnitSystemSchema,
  bodyFatPct: PercentSchema.nullable(), // [%]
  loggedAt: EpochMsSchema, // [ms]
});

export const HydrationEntrySchema = z.object({
  profileId: z.string().min(1),
  date: LocalDateSchema,
  volumeML: MilliLitres, // [mL]
  marks: z.array(EpochMsSchema), // [ms]
});

export const IntakeEntrySchema = z.object({
  profileId: z.string().min(1),
  date: LocalDateSchema,
  kcal: z.number().min(0).max(MAX_KCAL), // [kcal/day]
  proteinG: z.number().min(0).max(MAX_PROTEIN_G), // [g/day]
});

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export const PushDeviceSchema = z.object({
  deviceId: z.string().min(1),
  secret: z.string().min(1),
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  createdAt: EpochMsSchema, // [ms]
  lastSyncAt: EpochMsSchema.nullable(), // [ms]
  lastSyncHash: z.string().max(200).nullable(),
});

export const ReminderSettingsSchema = z.object({
  enabled: z.boolean(),
  dayOfTime: LocalTimeSchema,
  leadMinutes: z.array(z.int().min(0).max(MAX_LEAD_MINUTES)).max(4), // [min]
});

export const ReminderInstantSchema = z.object({
  key: z.string().min(1),
  at: EpochMsSchema, // [ms]
  title: z.string().min(1).max(200),
  body: z.string().max(500),
});

// ---------------------------------------------------------------------------
// Weekly review and motivation
// ---------------------------------------------------------------------------

export const WeeklyReviewSchema = z.object({
  profileId: z.string().min(1),
  weekStart: LocalDateSchema,
  weekEnd: LocalDateSchema,
  target: z.int().min(0).max(MAX_SESSIONS_PER_WEEK), // [sessions/week]
  completed: z.int().min(0).max(MAX_SESSIONS_PER_WEEK), // [sessions/week]
  skipped: z.int().min(0).max(MAX_SESSIONS_PER_WEEK), // [sessions/week]
  paused: z.boolean(),
  // [sessions/week] delta = completed - target. Negative means sessions missed.
  delta: z.int().min(-MAX_SESSIONS_PER_WEEK).max(MAX_SESSIONS_PER_WEEK),
  evaluatedAt: EpochMsSchema, // [ms]
  missHandled: z.boolean(),
});

export const MotivationStateSchema = z.object({
  profileId: z.string().min(1),
  lastShownForWeek: LocalDateSchema.nullable(),
  lastShownAt: EpochMsSchema.nullable(), // [ms]
  customVideoAssetId: z.string().max(200).nullable(),
});

// ---------------------------------------------------------------------------
// Fun mechanics and UI preferences
// ---------------------------------------------------------------------------

/**
 * A logged set's ordinal as a JSON object key: a decimal integer, unsigned and unpadded.
 * Keys are validated rather than accepted as any string, for the same reason `notes` validates
 * its inner keys as local dates: the store is the only writer and it writes String(ordinal), so
 * anything else in this position is a corrupted document rather than data to be kept.
 */
const SetOrdinalKeySchema = z.string().regex(/^(?:0|[1-9][0-9]*)$/, 'expected a set ordinal');

/**
 * A specimen card id. Bounded, not checked against the shipped pool: this module knows nothing
 * about src/content, and a card retired from the pool must not make an old document unreadable
 * (drawSpecimenForLoggedSet already returns null for an id the pool no longer holds).
 */
const CardIdSchema = z.string().min(1).max(MAX_CARD_ID_CHARS);

export const SpecimenInventorySchema = z.object({
  profileId: z.string().min(1),
  acquired: z.record(
    z.string(),
    z.object({ at: EpochMsSchema /* [ms] */, exerciseId: z.string().min(1).nullable() }),
  ),
  totalSetsLogged: z.int().min(0).max(MAX_TOTAL_SETS), // [sets] lifetime counter
  /*
   * Additive (master plan section 10.8): set ordinal -> the id of the card that ordinal drew.
   * Without it the field was stripped on every load, because a z.object drops unknown keys, and
   * the ordinal ledger that stops a delete-and-relog rerolling a drop would have survived only
   * until the next reload.
   *
   * Optional rather than carrying a default: an absent map and an empty one are the same state
   * to every reader (`?.[ordinal]` is undefined either way), while a default would make the
   * field required on every SpecimenInventory in the tree and would write a key into documents
   * that never recorded one. CURRENT_SCHEMA_VERSION stays 3 either way.
   */
  acquiredByOrdinal: z.record(SetOrdinalKeySchema, CardIdSchema).optional(),
});

export const TimeCapsuleSchema = z.object({
  note: z.string().max(MAX_NOTE_CHARS),
  writtenAt: EpochMsSchema, // [ms]
  opensOn: LocalDateSchema,
  opened: z.boolean(),
});

export const UiPrefsSchema = z.object({
  bootSeen: z.boolean(),
  lastView: z.string().min(1).max(40),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a #rrggbb colour'),
  scanlines: z.boolean(),
  flicker: z.boolean(),
  density: z.enum(['compact', 'normal']),
  // Additive. null means "no instance chosen yet", which is what a document
  // written before the chooser existed means.
  videoInstanceHost: z.string().min(1).max(MAX_HOSTNAME_CHARS).nullable().default(null),
  // Additive. A document that predates the legacy import has not been offered
  // it, so "pending" is the honest default.
  legacyMigration: z.enum(['pending', 'done', 'dismissed']).default('pending'),
  // Additive. Block index last shown per profile; empty means nothing shown yet.
  lastBlockSeenByProfile: z.record(z.string(), z.int().min(0).max(MAX_BLOCKS)).default({}),
});

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

/**
 * The per-profile maps: every record key is a profile id, checked by the root
 * refinement below. `plans` is deliberately absent from this list because a plan
 * template is keyed by its own id, not by the profile that owns it.
 */
const PROFILE_KEYED_MAPS = [
  'availability',
  'cursors',
  'pauses',
  'assignments',
  'bodyMass',
  'hydration',
  'intake',
  'weeklyReviews',
  'reminderSettings',
  'motivation',
  'specimens',
  'capsules',
  'customExercises',
  'notes',
] as const;

export const AppStateSchema = z
  .object({
    // Typed as a bounded integer rather than z.literal so the inferred output is
    // `number` and matches AppState.schemaVersion exactly; the refinement still
    // pins the value to this build's version. The type-parity assertion in
    // schema.test.ts fails if the two ever drift apart.
    //
    // The `: boolean` return annotation is load-bearing, not decoration.
    // TypeScript 5.5 infers a type predicate for `(v) => v === 3`, Zod's .refine
    // overload forwards that predicate into the output type, and the field would
    // silently infer the literal 3 again. Annotating the return suppresses the
    // predicate inference.
    schemaVersion: z
      .number()
      .int()
      .refine((v: number): boolean => v === CURRENT_SCHEMA_VERSION, {
        message: `expected schemaVersion ${CURRENT_SCHEMA_VERSION}`,
      }),
    activeProfileId: z.string().min(1).nullable(),
    profiles: z.record(z.string(), ProfileSchema),
    availability: z.record(z.string(), AvailabilitySchema),
    plans: z.record(z.string(), PlanTemplateSchema),
    cursors: z.record(z.string(), PlanCursorSchema),
    pauses: z.record(z.string(), z.array(PlanPauseSchema)),
    assignments: z.record(z.string(), z.array(SessionAssignmentSchema)),
    sets: z.record(z.string(), LoggedSetSchema),
    bodyMass: z.record(z.string(), z.array(BodyMassEntrySchema)),
    hydration: z.record(z.string(), z.array(HydrationEntrySchema)),
    intake: z.record(z.string(), z.array(IntakeEntrySchema)),
    weeklyReviews: z.record(z.string(), z.array(WeeklyReviewSchema)),
    reminderSettings: z.record(z.string(), ReminderSettingsSchema),
    pushDevice: PushDeviceSchema.nullable(),
    motivation: z.record(z.string(), MotivationStateSchema),
    specimens: z.record(z.string(), SpecimenInventorySchema),
    capsules: z.record(z.string(), TimeCapsuleSchema.nullable()),
    // Additive: user-added exercises by profile id, with generated ids (A26).
    customExercises: z.record(z.string(), z.array(ExerciseSchema)).default({}),
    // Additive: daily notes by profile id then local day. The inner key is
    // validated as a LocalDate, so a corrupted key is rejected rather than stored.
    notes: z
      .record(z.string(), z.record(LocalDateSchema, z.string().max(MAX_NOTE_CHARS)))
      .default({}),
    ui: UiPrefsSchema,
  })
  /**
   * Referential integrity between a record key and the entity it stores.
   *
   * A record is not a set of independent cells: `profiles["a"].id === "a"` and
   * `sets["s"].id === "s"` are read as facts by every selector, and a per-profile
   * map keyed by an id no profile owns is an orphan that no code path will ever
   * delete. Field-level validation cannot see any of this, so the check has to
   * sit on the root, where the whole document is in scope.
   *
   * Zod runs an object-level check only after the object itself parses, so every
   * issue raised here is a genuine key disagreement rather than a knock-on effect
   * of a malformed value.
   */
  .superRefine((state, ctx) => {
    for (const [key, profile] of Object.entries(state.profiles)) {
      if (key !== profile.id) {
        ctx.addIssue({
          code: 'custom',
          path: ['profiles', key],
          message: `profile record key "${key}" does not match its id "${profile.id}"`,
        });
      }
    }

    for (const [key, loggedSet] of Object.entries(state.sets)) {
      if (key !== loggedSet.id) {
        ctx.addIssue({
          code: 'custom',
          path: ['sets', key],
          message: `set record key "${key}" does not match its id "${loggedSet.id}"`,
        });
      }
    }

    const profileIds = new Set(Object.keys(state.profiles));

    for (const map of PROFILE_KEYED_MAPS) {
      for (const key of Object.keys(state[map])) {
        if (!profileIds.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: [map, key],
            message: `${map} is keyed by profile id, and "${key}" is not a known profile`,
          });
        }
      }
    }

    if (state.activeProfileId !== null && !profileIds.has(state.activeProfileId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['activeProfileId'],
        message: `activeProfileId "${state.activeProfileId}" is not a known profile`,
      });
    }
  });

/** The empty document a first run starts from. No profile exists yet; P2 creates one. */
export function defaultState(): AppState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
    customExercises: {},
    notes: {},
    ui: {
      bootSeen: false,
      lastView: 'today',
      // Reconciled accent, code review A67; matches tokens.css and the manifest.
      accent: '#a3e635',
      scanlines: true,
      flicker: false,
      density: 'normal',
      videoInstanceHost: null,
      legacyMigration: 'pending',
      lastBlockSeenByProfile: {},
    },
  };
}

export type ParseStateResult = { ok: true; state: AppState } | { ok: false; error: string };

/**
 * The single entry point for untrusted data: localStorage rehydration, file
 * import, and paste-import all come through here (security constraint 1).
 * Never throws, never coerces, never casts.
 */
export function parseState(raw: unknown): ParseStateResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'not a JSON object' };
  }

  const versionField: unknown = Reflect.get(raw, 'schemaVersion');
  if (typeof versionField !== 'number' || !Number.isInteger(versionField)) {
    return { ok: false, error: 'missing or non-integer schemaVersion' };
  }
  if (versionField > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `saved by a newer version of the app (schema ${versionField}, this build understands ${CURRENT_SCHEMA_VERSION})`,
    };
  }

  const migrated = migrate(raw, versionField, CURRENT_SCHEMA_VERSION);
  if (!migrated.ok) {
    return { ok: false, error: migrated.error };
  }

  const parsed = AppStateSchema.safeParse(migrated.value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first === undefined ? '(root)' : first.path.join('.') || '(root)';
    const why = first === undefined ? 'unknown validation failure' : first.message;
    return { ok: false, error: `${where}: ${why}` };
  }

  return { ok: true, state: parsed.data };
}
