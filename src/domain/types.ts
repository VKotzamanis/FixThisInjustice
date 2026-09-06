// ---- primitives (canonical units in comments; storage is always canonical) ----
export type Kg = number;        // kilograms, >= 0
export type ML = number;        // millilitres, integer >= 0
export type Seconds = number;   // seconds, >= 0
export type EpochMs = number;   // epoch milliseconds, UTC
export type LocalDate = string; // "YYYY-MM-DD" in Profile.timezone; produced only by dates.ts
export type LocalTime = string; // "HH:mm" 24 h in Profile.timezone
export type TimeZone = string;  // IANA id, e.g. "America/Chicago"
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = Monday
export type UnitSystem = "metric" | "imperial";
export const KG_PER_LB = 0.45359237;                       // exact by definition
export const DEFAULT_BARBELL_STEP: Record<UnitSystem, number> = { metric: 2.5 /* kg total: pair of 1.25 kg plates */, imperial: 5 /* lb total: pair of 2.5 lb plates */ };
export const DEFAULT_DUMBBELL_STEP: Record<UnitSystem, number> = { metric: 5 /* kg per pair */, imperial: 10 /* lb per pair */ };
export const DEFAULT_STACK_STEP: Record<UnitSystem, number> = { metric: 5 /* kg per pin, typical; user-editable */, imperial: 10 /* lb per pin */ };
export const MICRO_PLATE_STEP: Record<UnitSystem, number> = { metric: 0.5 /* kg total: pair of 0.25 kg */, imperial: 1 /* lb total: pair of 0.5 lb */ };

// ---- profile ----
export type Sex = "male" | "female";                        // required by the RMR equation; collected as such
export type ActivityLevel = "sedentary" | "moderate" | "vigorous"; // the three FAO/WHO/UNU 2004 PAL bands the content review verified; no invented midpoints
export type GoalKind = "fat-loss" | "muscle-gain" | "recomposition" | "maintenance";
export type Experience = "novice" | "intermediate" | "advanced";
export type Equipment = "full-gym" | "dumbbells-only" | "bodyweight";

export interface Profile {
  id: string; displayName: string; timezone: TimeZone; units: UnitSystem; createdAt: EpochMs;
  body: { sex: Sex; birthYear: number; heightCm: number; baselineMassKg: Kg; baselineAt: LocalDate; baselineBodyFatPct: number | null; };
  activity: ActivityLevel;
  experience: Experience;
  equipment: Equipment;
  equipmentSteps: { barbellKg: number; dumbbellPairKg: number; stackKg: number; hasMicroPlates: boolean; microPlateKg: number; }; // canonical kg; seeded from DEFAULT_*_STEP / MICRO_PLATE_STEP in the user's unit at setup, editable
  goal: { kind: GoalKind; targetMassKg: Kg | null; targetBodyFatPct: number | null; targetDate: LocalDate | null; };
  supplements: { creatine: boolean; };                     // no medication fields exist by design
  hydration: { dailyTargetML: ML; cupSizeML: ML; weighInOptIn: boolean; }; // cupSizeML is display granularity only; weighInOptIn enables the pre/post-session mass check
  readiness: { screenedAt: LocalDate | null; flagged: boolean; };          // pre-participation screen (P2): flagged = any positive answer; the app then shows the physician-consult notice on every session start
}

// ---- availability ----
export interface AvailabilitySlot { weekday: IsoWeekday; startTime: LocalTime; expectedDurationS: Seconds; }
export interface Availability { slots: AvailabilitySlot[]; weeklySessionTarget: number; } // 1 <= target <= slots.length

// ---- plan template (calendar-free) ----
export type Prescription =
  | { kind: "reps"; lo: number; hi: number }               // hi >= lo
  | { kind: "amrap"; minimum: number | null }
  | { kind: "time"; targetS: Seconds }
  | { kind: "duration"; targetS: Seconds }
  | { kind: "none" };
export type Modality = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight";
export type LoadClass = "lower-compound" | "upper-compound" | "isolation"; // drives the progression percentage (5 % / 2.5 % / 2.5 %)
export interface Exercise { id: string; name: string; isBodyweight: boolean; isCompoundPrimary: boolean; modality: Modality; loadClass: LoadClass; muscleGroups: string[]; secondaryMuscles: string[]; equipment: Equipment[]; videoQuery: string | null; formCueId: string | null; note: string | null; } // muscleGroups = direct movers (1.0 set), secondaryMuscles = dynamic assisting movers (0.5 set) for fractional weekly set counting
// Canonical exercise ids: the 40 slugs listed in docs/plans/2026-09-01-00-master-plan.md §5 (31 ported plus nine equipment-tier additions); src/domain/plan/library.ts is the executable source of truth and its test asserts the set. formCueId === id where a cue exists.
export interface PlannedExercise { exerciseId: string; setsLo: number; setsHi: number; prescription: Prescription; restS: Seconds; }
export type SessionKind = "lift" | "cardio";
export interface PlannedSession { id: string; ordinal: number; name: string; kind: SessionKind; label: string; exercises: PlannedExercise[]; } // label e.g. "Push", "Pull", "Legs", "Upper", "Lower", "Full body A". Invariant: plan.sessions[i].ordinal === i + 1; assignToday's swap updates both ordinals. A PlanTemplate belongs to exactly one profile (setPlan always creates a fresh plan id).
export interface PlanBlock { index: number; firstSessionIndex: number; sessionCount: number; setModifier: number; loadModifier: number; isDeload: boolean; } // multipliers, 1 = unchanged. A deload block cuts VOLUME (setModifier 0.4–0.6) and keeps loadModifier 1.0 (content review §2.2, Bosquet 2007); never the reverse
export interface PlanTemplate { id: string; version: number; name: string; sessionsPerWeek: number; weeks: number; sessions: PlannedSession[]; blocks: PlanBlock[]; }

// ---- cursor, pauses, assignments ----
export interface PlanCursor { planId: string; nextSessionIndex: number; startedOn: LocalDate; completedOn: LocalDate | null; } // advances only on complete/skip
export interface PlanPause { id: string; from: LocalDate; to: LocalDate | null; reason: string | null; } // half-open [from, to): `to` is the first active day again; null = still paused
export type AssignmentStatus = "planned" | "in-progress" | "completed" | "skipped";
export interface SessionAssignment { date: LocalDate; sessionId: string; sourceIndex: number; status: AssignmentStatus; startedAt: EpochMs | null; completedAt: EpochMs | null; skipReason: string | null; }

// ---- logs ----
export interface LoggedSet { id: string; profileId: string; assignmentDate: LocalDate; sessionId: string; exerciseId: string; setNumber: number; isBonus: boolean; loadKg: Kg | null; enteredUnit: UnitSystem; reps: number | null; durationS: Seconds | null; rpe: number | null; loggedAt: EpochMs; } // loadKg 0 is valid (bodyweight); null = not recorded
export interface BodyMassEntry { id: string; profileId: string; date: LocalDate; massKg: Kg; enteredUnit: UnitSystem; bodyFatPct: number | null; loggedAt: EpochMs; }
export interface HydrationEntry { profileId: string; date: LocalDate; volumeML: ML; marks: EpochMs[]; }
export interface IntakeEntry { profileId: string; date: LocalDate; kcal: number; proteinG: number; } // daily totals entered by the user

// ---- reminders ----
export interface PushDevice { deviceId: string; secret: string; endpoint: string; keys: { p256dh: string; auth: string }; createdAt: EpochMs; lastSyncAt: EpochMs | null; lastSyncHash: string | null; }
export interface ReminderSettings { enabled: boolean; dayOfTime: LocalTime; leadMinutes: number[]; } // defaults: "08:00", [120]; second entry optional e.g. [120, 60]
export interface ReminderInstant { key: string; at: EpochMs; title: string; body: string; }       // key = `${date}:${kind}:${leadMinutes}`

// ---- weekly review and motivation ----
export interface WeeklyReview { profileId: string; weekStart: LocalDate; weekEnd: LocalDate; target: number; completed: number; skipped: number; paused: boolean; delta: number; evaluatedAt: EpochMs; missHandled: boolean; } // delta = completed − target
export interface MotivationState { profileId: string; lastShownForWeek: LocalDate | null; lastShownAt: EpochMs | null; customVideoAssetId: string | null; } // markMotivationShown sets lastShownForWeek/lastShownAt AND WeeklyReview.missHandled = true; a single Dismiss control does this (no separate 'not this week' control)

// ---- fun mechanics (P8) ----
// SpecimenInventory.acquiredByOrdinal maps a logged set's ORDINAL to the id of the card that
// ordinal produced. The ordinal is totalSetsLogged read AFTER logSet's increment, that is the
// just-logged set's own position with no `+ 1`, rendered as a decimal string because a JSON
// object key always is. Optional and additive: an inventory written before the field existed
// reads as "no ordinal recorded yet". It is what makes one ordinal yield at most one card ever,
// so a delete and relog returns the card already held instead of rerolling a fresh one (master
// plan section 10.8, rule 3); the counter decrementing on delete is rule 2 and does not close
// the farm on its own. Written only by the store's recordSpecimen, via recordSpecimenDraw.
export interface SpecimenInventory { profileId: string; acquired: Record<string, { at: EpochMs; exerciseId: string | null }>; totalSetsLogged: number; acquiredByOrdinal?: Record<string, string> | undefined; }
export interface TimeCapsule { note: string; writtenAt: EpochMs; opensOn: LocalDate; opened: boolean; }

// ---- ui preferences (persisted) ----
// The three shipped skins, in the order the picker offers them. One id, never a class list:
// a list can carry two skins at once and the cascade then depends on stylesheet order rather
// than on state, so the attribute makes the invalid state unrepresentable.
export type SkinId = 'clinical' | 'limelight' | 'board';
// skin default 'limelight'; sounds default false (Zod defaults, no version bump). The default
// is the round-three merge rather than the clinical set the copy contract is written against:
// clinical stays reachable from the picker and stays the bare `:root` token block.
// milestoneFloorByProfile: the highest [sets] count a set-count milestone has been announced
// for, per profile. A high-water MARK, not the live counter: deleting a set decrements
// SpecimenInventory.totalSetsLogged, so a check against the live count re-announces the same
// milestone the moment the set is relogged. It is persisted rather than held in a component ref
// because the fact belongs to the profile, not to one mount of the Train view: a ref reset on
// every navigation away and back, and the fiftieth set announced itself again. Empty means
// nothing announced yet, and the baseline is then the count before the set just logged.
// hotkeys: the WCAG 2.1 SC 2.1.4 off switch for the single-character shortcuts (the view
// digits, and j/k/arrows on the Plan view). Default TRUE, a Zod default like the two above: the
// criterion asks for a mechanism to turn them off, not for them to ship off, and a document
// written before the switch existed was running with them on. Combos carrying a modifier
// (mod+k) and keys that type no character (Escape) are outside the criterion and stay bound.
// introSeen: has this device shown the four-caveat / disclaimer intro sequence
// (src/ui/intro/IntroSequence.tsx, alpha round 1 claims C1.01.2-C1.01.15)? Additive with a Zod
// default of false: a fresh document has not met it, and it is set true once, by finishing or by
// Skip, and never returns (App.tsx gates the sequence on it, ahead of the boot gate). A document
// migrated from v2, or any other test/production fixture standing in for an existing user, seeds
// it true, exactly as bootSeen does, so a returning user is never shown a first-run screen.
export interface UiPrefs { bootSeen: boolean; introSeen: boolean; lastView: string; accent: string; scanlines: boolean; flicker: boolean; density: "compact" | "normal"; videoInstanceHost: string | null; legacyMigration: "pending" | "done" | "dismissed"; lastBlockSeenByProfile: Record<string, number>; skin: SkinId; sounds: boolean; milestoneFloorByProfile: Record<string, number>; hotkeys: boolean; }

// ---- root ----
export interface AppState {
  schemaVersion: number;                 // CURRENT_SCHEMA_VERSION = 3
  activeProfileId: string | null;
  profiles: Record<string, Profile>;
  availability: Record<string, Availability>;
  plans: Record<string, PlanTemplate>;
  cursors: Record<string, PlanCursor>;
  pauses: Record<string, PlanPause[]>;
  assignments: Record<string, SessionAssignment[]>;
  sets: Record<string, LoggedSet>;
  bodyMass: Record<string, BodyMassEntry[]>;
  hydration: Record<string, HydrationEntry[]>;
  intake: Record<string, IntakeEntry[]>;
  weeklyReviews: Record<string, WeeklyReview[]>;
  reminderSettings: Record<string, ReminderSettings>;
  pushDevice: PushDevice | null;         // one per device, not per profile
  motivation: Record<string, MotivationState>;
  specimens: Record<string, SpecimenInventory>;
  capsules: Record<string, TimeCapsule | null>;
  customExercises: Record<string, Exercise[]>;     // by profileId; user-added exercises with generated ids (never positional)
  notes: Record<string, Record<LocalDate, string>>; // by profileId then local day; migrated from legacy daily notes
  ui: UiPrefs;
}
// Additive fields carry Zod defaults; CURRENT_SCHEMA_VERSION stays 3 for all of P1–P8. Non-persisted store fields: status { hydrated, lastLoadError, lastSaveError }, session slice, exerciseNames (derived).
