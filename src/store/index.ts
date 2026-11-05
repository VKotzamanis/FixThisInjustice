import { create } from 'zustand';
import type {
  AppState,
  Availability,
  BodyMassEntry,
  EpochMs,
  Exercise,
  IntakeEntry,
  LocalDate,
  LoggedSet,
  ML,
  PlanTemplate,
  Profile,
  SessionAssignment,
  SetupDraft,
  UiPrefs,
} from '../domain/types';
import {
  IntakeEntrySchema,
  ProfileSchema,
  SessionAssignmentSchema,
  SetupDraftShapeSchema,
  CURRENT_SCHEMA_VERSION,
  defaultState,
} from '../domain/schema';
import { compareLocalDate, todayLocal } from '../domain/dates';
import {
  closeStaleSessions as closeStaleSessionsPure,
  openAssignment,
  type StaleClosure,
} from '../domain/schedule/staleSessions';
import { newId } from '../domain/ids';
import { EXERCISE_BY_ID } from '../domain/plan/library';
import type { RestTimer } from '../domain/training/restTimer';
import type { SessionEditOp } from '../domain/training/sessionEdits';
import {
  createScheduleActions,
  requireProfile,
  type ScheduleActions,
} from './scheduleActions';
import { createMotivationActions, type MotivationActions } from './motivationActions';
import { createReminderActions, type ReminderActions } from './reminderActions';
import { createFunActions, type FunActions } from './funActions';
import { applyReplacePlan, applyRestartProgramme } from './programme';
import { applyCompleteSetup, applyCreateProfile, applySetAvailability, type SetupResult } from './setup';
import { parseOrThrow } from './validate';
import type { ProgrammeChoice } from '../domain/plan/lifecycle';
import {
  UNDO_WINDOW_MS,
  applyAddCustomExercise,
  applyAddHydration,
  applyDeleteSet,
  applyEditSession,
  applyLogBodyMass,
  applyLogSet,
  applyRestoreSet,
  applyUpdateSet,
  slotTaken,
  type SetMeasurement,
} from './training';
import {
  EMPTY_SESSION,
  clearSessionMirror,
  initialSession,
  REST_GAME_WINS_MAX,
  saveSessionMirror,
  type SessionState,
} from './sessionMirror';
import type { LoadOutcome, SaveFailure, SaveResult } from './persistence';
import { clearStorage, exportJson as serialise, importJson as deserialise, loadDocument } from './persistence';
import type { QuarantinedRecord } from './db/assemble';
import type { RecordBackend } from './db/backend';
import { EMPTY_PRESERVED, encodeOps, type Preserved, type Repair } from './db/preserve';
import { diffStates, isEmptyOps, mergeOps, splitState, type RecordOps } from './db/records';

export type SaveErrorReason = SaveFailure;

/**
 * The last write failure, kept whole rather than reduced to its reason.
 *
 * The reason selects the copy and the controls the banner offers; the message
 * is the thrown value's own text, which is the only thing that distinguishes
 * one serialisation failure from another when the user reports it. Discarding
 * it left the banner unable to say anything specific about a document that
 * could not be serialised.
 */
export interface SaveError {
  reason: SaveErrorReason;
  error: string;
}

export interface StoreStatus {
  /** Non-null while the last write failed. The UI shows a blocking banner (H3). */
  lastSaveError: SaveError | null;
  /** Set when a stored document failed validation; the in-memory state is the last known good one. */
  lastLoadError: string | null;
  /**
   * The raw text of the document that failed to load, snapshotted at hydrate
   * time. The recovery UI offers it for export, and it is held in memory rather
   * than re-read on demand so the offer survives storage moving on underneath
   * it — a wipeAll(), a write from another tab, a store that has since become
   * unreachable. Null whenever the last load succeeded or found nothing.
   */
  lastLoadRaw: string | null;
  /** False until hydrate() has run, so the UI can tell "empty" from "not read yet". */
  hydrated: boolean;
  /**
   * Why the last schedule action the user attempted was refused, in the domain's own wording,
   * or null when it was honoured.
   *
   * P3's schedule transitions throw on an illegal request (master plan §6.4 as amended: a
   * paused day, a second open assignment, a label the week no longer offers). The store sorts
   * those throws — see src/store/scheduleActions.ts for the refusal/defect split — and a
   * refusal lands here instead of taking the tree down.
   *
   * NOT persisted, and deliberately so: it is a fact about one attempt, not about the
   * document (master plan §3), and a refusal restored from storage would accuse the user of
   * something they did in a previous session. selectState() therefore does not read it.
   */
  lastActionError: string | null;
  /**
   * Sessions the last catch-up closed because they were left open on an earlier civil date
   * (spec R1), for the one notice the shell shows. Not persisted. Optional so the status
   * literals existing suites build stay valid; undefined and [] both mean nothing to say.
   */
  staleClosures?: readonly StaleClosure[] | undefined;
  /**
   * Spec R13 / audit B01: stored records the last load could not read. Kept on disk exactly as
   * stored, never written over, listed in Settings and exportable. Not persisted; optional so
   * the status literals existing suites build stay valid.
   */
  quarantine?: readonly QuarantinedRecord[] | undefined;
  /** Audit B10: stored answers a schema repair replaced on read; the stored value is kept. */
  repairs?: readonly Repair[] | undefined;
  /** Why the last load failed when lastLoadError is set: invalid records or no storage (B17). */
  loadFailure?: 'invalid' | 'unavailable' | undefined;
  /**
   * Audit B03 / amendment AM-10: another instance wrote the document while this one still had a
   * change queued, so that change was dropped for the other instance's data. True until the
   * shell has shown its one notice. Not persisted; optional for the same reason as above.
   */
  externalWriteReplaced?: boolean | undefined;
}

/**
 * What one call to `logSet` produced.
 *
 * Two facts, and the second one is the reason this is an object rather than the bare id it
 * used to be: only the action that made the write can say whether a specimen was ACQUIRED, and
 * a caller asking the draw again is told the card for an ordinal that already spent one.
 */
export interface LogSetResult {
  /**
   * The stored `LoggedSet.id`, so the caller can offer an undo without re-reading the store.
   */
  id: string;
  /**
   * The `SpecimenCard.id` this call added to the collection, or null when it added none -
   * a failed roll, an exhausted pool, an ordinal whose card was already recorded (a delete and
   * relog), or a card the collection already held under an earlier ordinal.
   *
   * "Added" is the whole contract. It is what a toast may announce, and it is true at most once
   * per card for the life of a profile.
   */
  specimen: string | null;
}

/** Master plan §6.7, P1 slice. Later plans extend this interface, never replace it. */
export interface AppActions {
  /**
   * Spec R13: reads the stored records through `backend` (importing fti.v3 on a first boot) and
   * installs them; from then on every action's changed records are committed through it. Never
   * throws: a refusal lands in status.lastLoadError and freezes writing.
   */
  hydrate(backend: RecordBackend): Promise<void>;
  replaceState(next: AppState): void;
  exportJson(): string;
  importJson(text: string): { ok: true } | { ok: false; error: string };
  wipeAll(): void;
  /** Shallow patch of the UI preferences; every other field is left alone. */
  setUi(patch: Partial<UiPrefs>): void;
  /**
   * Replaces the in-progress setup wizard's draft (C1.G.1), so a closed browser does not lose
   * what has been typed so far. The caller (SetupWizard.tsx) owns the debounce; every call here
   * is a whole `SetupDraft`, never a patch, because the wizard already holds the merged object
   * and a partial write here would need to reconstruct it from whatever the store last held.
   */
  saveSetupDraft(draft: SetupDraft): void;
  /** Called once setup is confirmed (or abandoned): nothing is left to resume. */
  clearSetupDraft(): void;
  /** Records the outcome of a persistence write. Called only by the subscription below. */
  reportSaveResult(r: SaveResult): void;
  /**
   * Writes the current document now and records the outcome, for the user to
   * invoke from the save-failure banner. The one write not driven by a change.
   */
  retrySave(): void;

  // P2
  /**
   * Inserts the profile, seeds its per-profile log arrays, and makes it active
   * when nothing else is. Throws on an id that already exists.
   */
  createProfile(p: Profile): void;
  /**
   * Shallow patch of one profile. An unknown id is a no-op. Throws when the
   * patch carries a non-positive `hydration.dailyTargetML`.
   */
  updateProfile(id: string, patch: Partial<Profile>): void;
  /**
   * Stores a plan for one profile and starts its cursor at session 0. Throws
   * while a session is in progress; otherwise clears that profile's stale
   * schedule (pauses, planned days, finished days before the start week) and the
   * reviews of weeks the new plan grades. The replaced plan is kept
   * (docs/design/programme-lifecycle.md).
   */
  setPlan(profileId: string, plan: PlanTemplate, startedOn: LocalDate): void;
  /**
   * Replaces the running programme with one built from the profile's current settings, starting
   * on `today` (ROADMAP L5 Update Programme, B1b Start Next Programme). `choice` may set the goal
   * kind, the split and the conditioning option; absent fields keep the running plan's. Keeps
   * and clears exactly what setPlan does. Throws, writing nothing, while a session is in
   * progress, with no running plan, or for a split above the training weekdays
   * (docs/design/programme-lifecycle.md).
   */
  restartProgramme(profileId: string, choice: ProgrammeChoice, today: LocalDate): void;
  /** One intake entry per civil date; a second entry for a date replaces the first. */
  logIntake(profileId: string, entry: IntakeEntry): void;
  /** The weekday slots and weekly session target the wizard collects; P3 consumes them. */
  setAvailability(profileId: string, a: Availability): void;
  /** Points the app at another stored profile. Throws on an unknown id. */
  setActiveProfile(id: string): void;
  /**
   * Spec R5 / audit A14: the setup wizard's confirm as ONE write. Validates the profile, the
   * availability and the plan with the loader's schemas, then creates the profile, stores the
   * availability, starts the plan on `startedOn` and clears the setup draft in a single set().
   * Throws, writing nothing, on any refusal.
   */
  completeSetup(result: SetupResult): void;

  // P4
  /**
   * Logs one set and reports what it produced. Throws on a set the schema refuses, on a profile
   * that does not exist, on a slot already logged (C03), and on a finished session unless
   * `opts.allowFinished` (C10). Re-filling the slot the undo buffer holds spends the buffer.
   *
   * @param now [ms] epoch UTC, the instant the set was logged.
   */
  logSet(set: Omit<LoggedSet, 'id' | 'loggedAt'>, now: EpochMs, opts?: { allowFinished?: boolean }): LogSetResult;
  /**
   * Removes one set and holds it in the non-persisted undo buffer for UNDO_WINDOW_MS. An
   * unknown id is a no-op and mints no buffer.
   */
  deleteSet(id: string): void;
  /**
   * Rewrites the load, reps or duration and entered unit of one logged set (ROADMAP L1), and its
   * effort when `rpe` is given (L8). Keeps the id, `loggedAt` and set number; touches no
   * session-slice field, so a running rest timer keeps running. Throws on an unknown id or a
   * value the schema refuses, writing nothing.
   */
  updateSet(id: string, m: SetMeasurement): void;
  /**
   * Changes the session assigned on `date` for this session only (ROADMAP L2-L4): swap,
   * skip, restore, move, add or remove an exercise. Stored on that day's assignment as
   * `edits` (docs/design/session-editing.md). Touches no session-slice field, so a running rest
   * timer keeps running. Throws, writing nothing, on a finished or missing session and on an
   * edit the domain refuses.
   */
  editSession(profileId: string, date: LocalDate, op: SessionEditOp): void;
  /**
   * Restores the buffered set if the window has not closed, and clears the buffer either way.
   * A no-op when nothing is buffered.
   */
  undoDelete(): void;
  /**
   * Would `undoDelete()` restore something if it were called at `now`?
   *
   * The undo control must not outlive the buffer it acts on (P4 polish item 8). The view holds
   * its own offer on screen, so it needs to ask the store rather than recompute the deadline
   * from a second clock read: two Date.now() calls a millisecond apart used to be enough to
   * leave a live control the store would silently refuse.
   *
   * @param now [ms] epoch UTC; the caller owns the clock, as everywhere else in this contract.
   */
  undoAvailable(now: EpochMs): boolean;
  /** @param now [ms] epoch UTC, the instant the weigh-in was entered. */
  logBodyMass(e: Omit<BodyMassEntry, 'id' | 'loggedAt'>, now: EpochMs): void;
  /**
   * Adds one drink to the profile's total for `date` (upsert by civil day) and records the
   * instant.
   *
   * @param volumeML [mL] non-negative integer.
   * @param now [ms] epoch UTC, the instant of the drink.
   */
  addHydration(profileId: string, date: LocalDate, volumeML: ML, now: EpochMs): void;
  /**
   * Starts, replaces or clears the rest interval. Lives in the session slice and, since spec R1,
   * also on the open assignment in fti.v3, so an iOS relaunch keeps a running rest.
   */
  setRestTimer(t: RestTimer | null): void;
  /**
   * Spec R1: closes this profile's sessions left open on an earlier civil date (completed with
   * their sets, else released so the session stays next), resets the session slice when anything
   * closed, and records what closed in status.staleClosures. Returns what it closed.
   *
   * @param now [ms] epoch, UTC
   */
  closeStaleSessions(profileId: string, now: EpochMs): readonly StaleClosure[];
  /** Empties status.staleClosures once the shell has shown its notice. */
  acknowledgeStaleClosures(): void;
  /** Clears status.externalWriteReplaced once the shell has shown its notice. */
  acknowledgeExternalWrite(): void;
  /**
   * Counts one won rest-game round in this lifting day (ROADMAP F1). Session slice only: mirrored
   * to sessionStorage, reset by clearSessionSlice, never written to fti.v3. Touches no timer field.
   */
  recordRestGameWin(): void;
  /** Adds a user-defined exercise to one profile's library under a freshly generated id (A26). */
  addCustomExercise(profileId: string, ex: Exercise): void;
  /**
   * Marks an exercise as added to this session beyond the plan. Idempotent.
   *
   * Throws on an id neither the shipped library nor the active profile's own custom library
   * knows: the slice is mirrored to session storage, so an unknown id would be read back on
   * every reload to render a card that can never appear.
   */
  addBonusExercise(exerciseId: string): void;
  /**
   * Records the civil day whose session is open, or clears it. Session slice only; mirrored,
   * because it is what `useTodaysSets` reads and a reload mid-session must not lose it.
   *
   * P3's `startSession` opens the assignment; this is the UI half of the same tap (P4 Task
   * 10). The two are separate because the store must be able to open a day for a profile
   * without asserting that THIS TAB is the one training on it.
   */
  setActiveAssignmentDate(date: LocalDate | null): void;
  /**
   * Resets the whole session slice and removes its sessionStorage mirror. Called when the
   * session ends (P4 Task 10's `Finish session`), so a reload cannot revive a finished
   * session's timer, training day or bonus exercises. Touches no persisted field.
   */
  clearSessionSlice(): void;
}

/*
 * requireProfile — the guard for every action that writes a record keyed by a
 * profile id — is imported from ./scheduleActions rather than defined here.
 * The P1/P2 actions below and the P3 schedule slice have to agree on what "not
 * a known profile" means, so there is exactly one definition of it; it sits on
 * that side of the import edge because this module already imports that one,
 * and the reverse would be a cycle. See its doc comment for the rationale.
 */

/**
 * The persisted document sits at the top level of the store beside the actions
 * and the non-persisted `status` slice (master plan §5, "Non-persisted store
 * fields"), so `useAppStore((s) => s.profiles)` and `useAppStore((s) => s.logSet)`
 * both work and later plans can seed a test with `setState(partialAppState)`.
 *
 * Master plan §6.7's P3 block reaches the store as the ScheduleActions intersection rather
 * than as another set of signatures copied into AppActions, so the seven schedule actions are
 * declared once, next to the implementation that satisfies them.
 */
export type AppStore = AppState &
  AppActions & { status: StoreStatus; session: SessionState } & ScheduleActions &
  MotivationActions &
  ReminderActions &
  FunActions;

/**
 * The persisted fields of the store, and only those: no actions, no `status`,
 * no later non-persisted slice. Written out field by field rather than derived
 * by key filtering, so a field added to AppState fails to compile here instead
 * of silently dropping out of every save and export.
 */
export function selectState(s: AppStore): AppState {
  return {
    schemaVersion: s.schemaVersion,
    activeProfileId: s.activeProfileId,
    profiles: s.profiles,
    availability: s.availability,
    plans: s.plans,
    cursors: s.cursors,
    pauses: s.pauses,
    assignments: s.assignments,
    sets: s.sets,
    bodyMass: s.bodyMass,
    hydration: s.hydration,
    intake: s.intake,
    weeklyReviews: s.weeklyReviews,
    reminderSettings: s.reminderSettings,
    pushDevice: s.pushDevice,
    motivation: s.motivation,
    specimens: s.specimens,
    capsules: s.capsules,
    customExercises: s.customExercises,
    notes: s.notes,
    setupDraft: s.setupDraft,
    ui: s.ui,
  };
}

/**
 * Spec R13: the write side of the storage engine. One per hydrate. Every action's changed
 * records are collected for the rest of the current task (one microtask), then committed as ONE
 * transaction against the revision this instance last read or wrote. No debounce (audit B08).
 */
interface Engine {
  backend: RecordBackend;
  /** [commits] The stored revision this instance's memory reflects. */
  revision: number;
  /** [commits] The revision the last rollback mirror (AM-P2-1) wrote to fti.v3. */
  mirroredRevision: number;
  preserved: Preserved;
  /** Changes of the current task, not yet handed to the commit chain. */
  queued: RecordOps | null;
  flushScheduled: boolean;
  /** A batch that failed (quota, unavailable): merged into the next commit, so nothing is lost. */
  dirty: RecordOps | null;
  /** Commits run one after another, each on the revision the previous one produced. */
  chain: Promise<void>;
  /** Set by wipeAll: fti.v3 is removed once the clear has committed. */
  removeLegacyAfterClear: boolean;
  stopListening: () => void;
}

let engine: Engine | null = null;

/** Set while replaceState installs a document: the next change is a full replace, not a diff. */
let replacing = false;

/**
 * Set while an action makes a change that must not be written back. Zustand
 * calls subscribers synchronously inside set(), so a flag around the set() is
 * enough — no write can interleave.
 */
let suppressWrite = false;

/**
 * Drops a queued write. The state stays; only the intent to store it goes.
 *
 * Exported for one caller: RootErrorBoundary, which clears storage when the
 * store itself has thrown and wipeAll() is therefore not reachable. A clear
 * that leaves a queued write behind re-creates the key one debounce later
 * (master plan §3), so the cancel has to be available without the store.
 */
export function cancelPendingSave(): void {
  if (engine === null) return;
  engine.queued = null;
  engine.dirty = null;
}

/** Runs a state change that the persistence subscription must ignore. */
function withoutPersisting(mutate: () => void): void {
  suppressWrite = true;
  try {
    mutate();
  } finally {
    suppressWrite = false;
  }
}

/**
 * Spec R1 / audit C04: the running rest also goes onto the OPEN assignment in fti.v3, so an iOS
 * relaunch that empties sessionStorage keeps it. Written only when the row still parses with the
 * loader's schema: the store never writes a document it could not read back (spec R5).
 */
function withPersistedRest(s: AppState, t: RestTimer | null): AppState['assignments'] {
  const profileId = s.activeProfileId;
  if (profileId === null) return s.assignments;
  const open = openAssignment(s, profileId);
  if (open === null) return s.assignments;
  const candidate: SessionAssignment = { ...open };
  if (t === null) {
    if (candidate.rest === undefined) return s.assignments;
    delete candidate.rest;
  } else {
    candidate.rest = t;
  }
  if (!SessionAssignmentSchema.safeParse(candidate).success) return s.assignments;
  return {
    ...s.assignments,
    [profileId]: (s.assignments[profileId] ?? []).map((a) => (a === open ? candidate : a)),
  };
}

/**
 * The session slice after a document is installed (hydrate, import). An empty slice takes the
 * rest persisted on the open assignment; a slice the tab's own mirror restored wins. A rest that
 * has already ended is not revived: its cue would sound on launch for a rest long finished.
 *
 * @param now [ms] epoch, UTC
 */
export function restoredSession(session: SessionState, state: AppState, now: EpochMs): SessionState {
  if (session.restTimer !== null) return session;
  const profileId = state.activeProfileId;
  if (profileId === null) return session;
  const rest = openAssignment(state, profileId)?.rest;
  if (rest === undefined || rest.endsAt <= now) return session;
  return { ...session, restTimer: rest };
}

export const useAppStore = create<AppStore>()((set, get) => {
  /*
   * P3's schedule slice, built before the store object so the two transitions that END a
   * session can be wrapped below. The adapter is the whole of the store's involvement: the
   * slice sees a pure AppState -> AppState transition and a channel for the refusal message,
   * and knows nothing about zustand, persistence, or the status slice.
   */
  const schedule = createScheduleActions({
    set: (updater) => {
      set((s) => updater(s));
    },
    setActionError: (message) => {
      // Idempotent by contract (ScheduleActionDeps): the slice calls this after every
      // attempt, and an unchanged message must not mint a new status object and re-render
      // every subscriber. Compared by value because the field is a string.
      if (get().status.lastActionError === message) return;
      set({ status: { ...get().status, lastActionError: message } });
    },
  });

  /*
   * P6's motivation slice. Same adapter as the schedule slice above, minus the error
   * channel: neither of its two actions can be refused (motivationActions.ts says why).
   */
  const motivation = createMotivationActions({
    set: (updater) => {
      set((s) => updater(s));
    },
  });

  /*
   * P5's reminder slice. Same adapter again, and the same absence of an error channel:
   * neither action can be refused (reminderActions.ts says why).
   */
  const reminders = createReminderActions({
    set: (updater) => {
      set((s) => updater(s));
    },
  });

  /*
   * P8's fun-mechanics slice. Same adapter, plus a `get`: attemptSpecimenDraw has to read the
   * document, decide, and only then write, and the read must not happen inside an updater
   * (code review A57; funActions.ts says why). It carries no error channel either.
   */
  const fun = createFunActions({
    set: (updater) => {
      set((s) => updater(s));
    },
    get: () => get(),
  });

  /**
   * The assignment for one civil day, or null. Read before and after a transition so the
   * wrapper below can tell a real move from a refusal or a documented no-op.
   */
  const assignmentOn = (profileId: string, date: LocalDate): SessionAssignment | null =>
    (get().assignments[profileId] ?? []).find((a) => a.date === date) ?? null;

  /**
   * Runs a transition and resets the session slice when it actually ended that day's session.
   *
   * The reset belongs to the store rather than to the Train view (P4 polish item 3). The view
   * cleared the slice unconditionally after completeSession, so a REFUSED completion still
   * threw away the running timer and the training day; and `skipSession` - reachable from
   * Today, with the same finality for the cursor - cleared nothing at all, leaving a rest
   * timer counting down for a session that no longer existed and an activeAssignmentDate that
   * would file the next logged set against it.
   *
   * "Actually ended" is a comparison of the assignment record's identity plus its status, not
   * of the status alone: the slice actions replace the objects they touch, so identity is the
   * store's own no-op signal, and a transition that was refused or that had nothing to do
   * leaves the record it would have rewritten untouched.
   */
  const endingSession = (profileId: string, date: LocalDate, run: () => void): void => {
    const before = assignmentOn(profileId, date);
    run();
    const after = assignmentOn(profileId, date);
    if (after === null || after === before) return;
    if (after.status !== 'completed' && after.status !== 'skipped') return;
    get().clearSessionSlice();
  };

  return {
  ...defaultState(),
  status: {
    lastSaveError: null,
    lastLoadError: null,
    lastLoadRaw: null,
    hydrated: false,
    lastActionError: null,
  },

  /*
   * The non-persisted session slice, restored from its sessionStorage mirror at store
   * creation. This is what makes a reload mid-session keep the rest timer running and the
   * training day open: the slice is rebuilt before React mounts, so nothing renders a session
   * that has silently forgotten what the user was doing thirty seconds ago. An absent,
   * unreadable or refused mirror yields EMPTY_SESSION (src/store/sessionMirror.ts).
   */
  session: initialSession(),

  async hydrate(backend: RecordBackend): Promise<void> {
    let outcome: LoadOutcome;
    try {
      outcome = await loadDocument(backend);
    } catch (e) {
      // loadDocument is written not to throw; if it ever does, the store must still leave the
      // loading state, and must not open setup over data it could not read.
      outcome = { ok: false, reason: 'unavailable', error: String(e), raw: backend.readLegacy(), revision: 0 };
    }
    installOutcome(outcome);
    engine?.stopListening();
    const e: Engine = {
      backend,
      revision: outcome.revision,
      // AM-P2-1: what fti.v3 holds now already equals this revision (an import leaves it as read).
      mirroredRevision: outcome.revision,
      preserved: outcome.ok ? outcome.preserved : EMPTY_PRESERVED,
      queued: null,
      flushScheduled: false,
      dirty: null,
      chain: Promise.resolve(),
      removeLegacyAfterClear: false,
      stopListening: () => undefined,
    };
    // Audit B03: another instance committed a newer revision; re-read before anything is written.
    e.stopListening = backend.onAnnounce((revision) => {
      if (engine !== e || revision <= e.revision) return;
      e.chain = e.chain.then(() => reloadFrom(e));
    });
    engine = e;
  },

  replaceState(next: AppState): void {
    // A complete AppState, so a shallow merge replaces every persisted field.
    //
    // Clearing lastLoadError is what re-opens persistence after a failed load:
    // the user chose to replace the unreadable document, so overwriting it is
    // now their decision rather than silent data loss. lastLoadRaw is kept, so
    // the recovery export stays available until the next hydrate().
    replacing = true;
    try {
      set({ ...next, status: { ...get().status, lastLoadError: null } });
    } finally {
      replacing = false;
    }
  },

  exportJson(): string {
    return serialise(selectState(get()));
  },

  importJson(text: string): { ok: true } | { ok: false; error: string } {
    const result = deserialise(text);
    if (!result.ok) return { ok: false, error: result.error };
    // Import goes through the store, never straight to storage: writing behind
    // the store's back is finding A43, where the persistence effect overwrote
    // the imported snapshot before the reload landed. It goes through
    // replaceState specifically, so installing a document has one code path and
    // one set of rules — including the load-error reset — rather than two that
    // drift apart.
    //
    // Audit B12: the user stays on the view they imported from, so they see the result there.
    const here = get().ui.lastView;
    get().replaceState({ ...result.state, ui: { ...result.state.ui, lastView: here } });
    // Audit B12: the session slice described the replaced document; it restarts from the new one.
    set({ session: restoredSession(EMPTY_SESSION, result.state, Date.now()) }); // [ms] epoch, UTC
    clearSessionMirror();
    return { ok: true };
  },

  wipeAll(): void {
    // The session mirror is this app's other key. It is not the document, but it names the
    // day the user was training and holds a running timer, so a wipe that left it behind
    // would restore both on the next reload, over a store that no longer has the profile or
    // the assignment they refer to.
    clearSessionMirror();
    // Two writes have to be stopped, not one. The debounce may already hold the
    // pre-wipe document, and the reset below is itself a persisted change; left
    // alone, either re-creates the key one debounce interval after the user
    // asked for it to be gone.
    cancelPendingSave();
    withoutPersisting(() => {
      set({
        ...defaultState(),
        session: EMPTY_SESSION,
        status: {
          lastSaveError: null,
          // The user chose to clear, so writes resume from the next change on.
          lastLoadError: null,
          // A refusal is about an attempt on a document that no longer exists.
          lastActionError: null,
          // Kept: after clearing an unreadable document, the in-memory snapshot
          // is the only remaining copy the recovery UI can export.
          lastLoadRaw: get().status.lastLoadRaw,
          hydrated: true,
        },
      });
    });
    // Spec R13: every store emptied in one transaction, then fti.v3 removed (audit B14: the
    // records go first). The clip store is the caller's (src/ui/settings/DataSection.tsx).
    if (engine !== null) {
      engine.removeLegacyAfterClear = true;
      queueOps({ clear: true, puts: [], deletes: [] });
    } else {
      // No engine (persistence never started, or a test): only the legacy key can be cleared.
      clearStorage();
    }
  },

  /*
   * setUi is not written here. It is declared in AppActions above (P1 owns the contract) and
   * implemented once, in the schedule slice spread in at the bottom of this object, because
   * two identical shallow patches of `ui` in one initialiser is a duplicate the compiler is
   * right to reject (TS2783) and a second place for the behaviour to drift.
   */

  saveSetupDraft(draft: SetupDraft): void {
    // Spec R5 (review N4): parse with the loader's draft shape, never its `.catch(null)` wrapper,
    // so a refused write throws and the last valid draft stays stored.
    set({ setupDraft: parseOrThrow(SetupDraftShapeSchema, draft, 'saveSetupDraft') });
  },

  clearSetupDraft(): void {
    set({ setupDraft: null });
  },

  reportSaveResult(r: SaveResult): void {
    const next: SaveError | null = r.ok ? null : { reason: r.reason, error: r.error };
    const prev = get().status.lastSaveError;
    // Identity comparison is gone with the object, so compare by value: an
    // unchanged failure must not produce a new status object every 250 ms and
    // re-render every banner subscriber.
    if (prev === null && next === null) return;
    if (prev !== null && next !== null && prev.reason === next.reason && prev.error === next.error) {
      return;
    }
    set({ status: { ...get().status, lastSaveError: next } });
  },

  retrySave(): void {
    // The same gate the subscription obeys. A retry is a user action, but not
    // a decision to replace a document the store never managed to read: that
    // decision is wipeAll() or replaceState(), and only those reopen writing.
    if (!canPersist(get().status) || engine === null) return;
    // Nothing failed is still held: there is nothing unsaved, so the banner can go.
    if (engine.dirty === null) {
      get().reportSaveResult({ ok: true });
      return;
    }
    // The failed batch is still held (engine.dirty); an empty batch commits it now.
    queueOps({ clear: false, puts: [], deletes: [] });
  },

  createProfile(p: Profile): void {
    // Spec R5: create-not-upsert, the beverage seed, the seeded log arrays and the loader's
    // schema all live in applyCreateProfile (./setup.ts), shared with completeSetup. A refusal
    // throws before set(), so nothing is written.
    set(applyCreateProfile(get(), p, 'createProfile'));
  },

  updateProfile(id: string, patch: Partial<Profile>): void {
    const s = get();
    const current = s.profiles[id];
    if (current === undefined) return;
    // A zero or negative daily fluid target is not a preference, it is a broken
    // one: it is a DENOMINATOR, and P4 renders hydration progress as
    // volume/target, so 0 gives Infinity and a negative target runs the bar
    // backwards. createProfile already refuses to store one (it substitutes the
    // IOM beverage figure); the patch path has to refuse it too, or the guard
    // only ever covers the first write. Written as !(x > 0) rather than x <= 0
    // so NaN — which compares false against everything — is refused as well.
    if (patch.hydration !== undefined && !(patch.hydration.dailyTargetML > 0)) {
      throw new Error(
        `updateProfile: hydration.dailyTargetML must be > 0 mL/day; received ${String(patch.hydration.dailyTargetML)}`,
      );
    }
    // Shallow by contract: a caller patching `body` or `goal` supplies the whole
    // sub-object. `id` is not re-derived from the patch, so a patch carrying a
    // different id cannot move the record away from its key.
    // Spec R5: the merged record is parsed with the loader's schema before it is stored.
    const merged = parseOrThrow(ProfileSchema, { ...current, ...patch, id }, 'updateProfile');
    set({ profiles: { ...s.profiles, [id]: merged } });
  },

  setPlan(profileId: string, plan: PlanTemplate, startedOn: LocalDate): void {
    // What a new plan keeps and clears, and the in-progress refusal, live in applyReplacePlan
    // (src/store/programme.ts), shared with restartProgramme. It throws before set() runs, so a
    // refusal writes nothing.
    const next = applyReplacePlan(get(), 'setPlan', profileId, plan, newId(), startedOn);
    set({
      ...next,
      /*
       * The non-persisted session slice goes with the old schedule, in the same set(), for the
       * same reason: `activeAssignmentDate` names a row in the schedule just replaced, the rest
       * timer belongs to a session of the plan just replaced, and the bonus exercises were
       * added to that session. The in-progress guard makes this a formality rather than a data
       * loss — a running timer implies an in-progress assignment, which has already thrown —
       * but leaving the slice behind would still hand the new plan the old plan's open day.
       */
      session: EMPTY_SESSION,
    });
    // Outside the set() because it is I/O, not state: without it a reload would restore the
    // slice this set() just cleared.
    clearSessionMirror();
  },

  restartProgramme(profileId: string, choice: ProgrammeChoice, today: LocalDate): void {
    // Same shape as setPlan: the pure transition throws before set() on any refusal, and the
    // session slice and its mirror go with the replaced schedule.
    const next = applyRestartProgramme(get(), profileId, choice, today, newId());
    set({ ...next, session: EMPTY_SESSION });
    clearSessionMirror();
  },

  completeSetup(result: SetupResult): void {
    const next = applyCompleteSetup(get(), result, newId());
    // Same as setPlan: the session slice and its mirror go with any earlier schedule.
    set({ ...next, session: EMPTY_SESSION });
    clearSessionMirror();
  },

  logIntake(profileId: string, entry: IntakeEntry): void {
    const s = get();
    requireProfile(s, 'logIntake', profileId);
    if (entry.profileId !== profileId) {
      throw new Error(
        `logIntake: entry.profileId "${entry.profileId}" does not match the map key "${profileId}"`,
      );
    }
    const parsed = parseOrThrow(IntakeEntrySchema, entry, 'logIntake');
    const list = s.intake[profileId] ?? [];
    // One entry per civil date: a second entry for the same date replaces the
    // first, so the daily total the user last typed is the one stored. Kept in
    // date order so every reader can assume it without re-sorting.
    const next = [...list.filter((e) => e.date !== parsed.date), parsed].sort((a, b) =>
      compareLocalDate(a.date, b.date),
    );
    set({ intake: { ...s.intake, [profileId]: next } });
  },

  setAvailability(profileId: string, a: Availability): void {
    set(applySetAvailability(get(), profileId, a, 'setAvailability'));
  },

  setActiveProfile(id: string): void {
    const s = get();
    // Throws for the same reason the schema's root refinement rejects the
    // document: activeProfileId must name a profile that exists. Pointing it at
    // an unknown id makes every active-profile selector return null, which the
    // UI reads as "no profile yet" and answers with the setup wizard — a stored
    // profile silently replaced by a first-run screen.
    requireProfile(s, 'setActiveProfile', id);
    // No early return when the id is already active: the field is a string, and
    // persistedChanged compares it by value, so a no-op costs no write anyway.
    set({ activeProfileId: id });
  },

  /*
   * ---- P4 ----
   *
   * Each of these is a call into a pure transformer in ./training under set(), plus, for the
   * three that touch the session slice, one write to the sessionStorage mirror. The rules
   * about what a log action does to the document live in that module; nothing here branches
   * on the document's contents, and nothing here reads a clock except where the contract in
   * master plan section 6.7 gives the action no `now` parameter to read it from.
   *
   * The updater form of set() is used throughout so the read and the write are one atomic
   * step, and so a transformer that throws (a schema refusal, an unknown profile) leaves the
   * store untouched: zustand applies nothing when the updater does not return.
   */

  logSet(
    input: Omit<LoggedSet, 'id' | 'loggedAt'>,
    now: EpochMs,
    opts: { allowFinished?: boolean } = {},
  ): LogSetResult {
    // The id is minted before the write so it can be returned: the caller needs it to offer
    // an undo, and re-deriving it from the document afterwards would mean searching by value.
    const id = newId();
    set((s) => {
      const next = applyLogSet(s, input, id, now, opts); // now: [ms] epoch, UTC
      // C03: a set logged into the slot the undo buffer holds spends that buffer in the same
      // write, so Undo can never put a second set there.
      const pending = s.session.undo;
      if (pending !== null && slotTaken(next, pending.set)) {
        return { ...next, session: { ...s.session, undo: null } };
      }
      return next;
    });
    /*
     * P8. The specimen roll runs HERE, after the updater has returned, and never inside it:
     * React may invoke an updater more than once for a single dispatch, and a roll inside one
     * would yield different state on the second invocation (code review A57).
     *
     * The roll is reached only if the set was actually stored: applyLogSet throws on a refused
     * set, and zustand applies nothing when an updater does not return.
     */
    const before = get().specimens[input.profileId];
    const card = fun.attemptSpecimenDraw(input.profileId, input.exerciseId, now); // [ms] epoch
    /*
     * Whether this call ACQUIRED the card, which is not the same question as whether a card
     * came back, and is why the answer is reported from here rather than left to the caller.
     *
     * `attemptSpecimenDraw` returns the card an ordinal produced, and for an ordinal already in
     * the ledger `drawSpecimenForLoggedSet` returns the RECORDED one - by design, so that one
     * ordinal yields at most one card ever (master plan section 10.8, rule 3). A delete and
     * relog reuses the ordinal, so the Train view asking the draw a second time was told a card
     * had dropped and raised a second toast for an acquisition that never happened.
     *
     * The test is the inventory's IDENTITY, not a membership check on `acquired`. Every path
     * through recordSpecimen that writes nothing - the ordinal already spent, the card already
     * held, an id no shipped card owns - returns the state object by reference, and that is the
     * store's own no-op signal (funActions.ts). A membership check would have to restate each
     * of those rules here and would go wrong on the one document where they disagree: an
     * ordinal spent under a card the collection no longer holds.
     */
    const acquired = card !== null && get().specimens[input.profileId] !== before;
    return { id, specimen: acquired ? card.id : null };
  },

  deleteSet(id: string): void {
    set((s) => {
      const { next, removed } = applyDeleteSet(s, id);
      // Identity preserved for an unknown id: no persisted field changed, so no write, and no
      // undo buffer holding nothing.
      if (removed === null) return s;
      /*
       * Date.now() rather than an injected instant: master plan section 6.7 gives deleteSet
       * no `now` parameter, and the expiry is a fact about the tab (when the control stops
       * being offered), not about the record. Tests pin it with fake timers.
       */
      const session: SessionState = {
        ...s.session,
        undo: { set: removed, expiresAt: Date.now() + UNDO_WINDOW_MS }, // [ms] epoch, UTC
      };
      // The mirror is deliberately not rewritten here: it carries only the three durable
      // fields, none of which this action touches (src/store/sessionMirror.ts).
      return { ...next, session };
    });
  },

  updateSet(id: string, m: SetMeasurement): void {
    // A document write only: the session slice (rest timer, undo buffer) is carried by the
    // spread inside applyUpdateSet untouched, so editing a set mid-rest never restarts or stops
    // the timer.
    set((s) => applyUpdateSet(s, id, m));
  },

  editSession(profileId: string, date: LocalDate, op: SessionEditOp): void {
    // Same rule as updateSet: a document write only, the session slice rides along untouched.
    set((s) => applyEditSession(s, profileId, date, op));
  },

  undoDelete(): void {
    set((s) => {
      const pending = s.session.undo;
      if (pending === null) return s;
      // Spent either way: an undo offered after the window closed must not silently restore
      // the set, and the buffer must not survive the attempt.
      const session: SessionState = { ...s.session, undo: null };
      if (Date.now() > pending.expiresAt) return { ...s, session };
      // The record goes back exactly as it was, id and loggedAt included.
      return { ...applyRestoreSet(s, pending.set), session };
    });
  },

  undoAvailable(now: EpochMs): boolean {
    const pending = get().session.undo;
    // Same comparison undoDelete makes, so the control and the action cannot disagree: the
    // buffer is spent at `now > expiresAt`, and available at exactly expiresAt. A slot filled
    // again since the delete makes the offer void (C03).
    return pending !== null && now <= pending.expiresAt && !slotTaken(get(), pending.set);
  },

  logBodyMass(entry: Omit<BodyMassEntry, 'id' | 'loggedAt'>, now: EpochMs): void {
    set((s) => applyLogBodyMass(s, entry, newId(), now)); // now: [ms] epoch, UTC
  },

  addHydration(profileId: string, date: LocalDate, volumeML: ML, now: EpochMs): void {
    set((s) => applyAddHydration(s, profileId, date, volumeML, now)); // volumeML: [mL], now: [ms]
  },

  setRestTimer(t: RestTimer | null): void {
    set((s) => {
      const session: SessionState = { ...s.session, restTimer: t };
      // Mirrored: this is the field a mid-session reload must not lose.
      saveSessionMirror(session);
      // Spec R1: and persisted on the open assignment, which an iOS relaunch does not lose.
      return { ...s, session, assignments: withPersistedRest(s, t) };
    });
  },

  recordRestGameWin(): void {
    set((s) => {
      const session: SessionState = {
        ...s.session,
        // Saturates at the mirror schema's ceiling, so a very long session never writes a mirror
        // this same build would refuse on reload.
        restGameWins: Math.min(REST_GAME_WINS_MAX, s.session.restGameWins + 1), // [rounds]
      };
      saveSessionMirror(session);
      return { ...s, session };
    });
  },

  addCustomExercise(profileId: string, ex: Exercise): void {
    set((s) => applyAddCustomExercise(s, profileId, ex));
  },

  addBonusExercise(exerciseId: string): void {
    set((s) => {
      /*
       * The id must name an exercise this profile can actually render (P4 polish item 6): the
       * shipped library, or its own custom one. The Train view resolves cards from exactly
       * that overlay and drops any id it cannot resolve, so an unknown id used to be accepted,
       * mirrored, and then silently ignored on every render for the rest of the tab's life.
       */
      const profileId = s.activeProfileId;
      const custom = profileId === null ? [] : (s.customExercises[profileId] ?? []);
      if (EXERCISE_BY_ID[exerciseId] === undefined && !custom.some((e) => e.id === exerciseId)) {
        throw new Error(`addBonusExercise: "${exerciseId}" is not a known exercise`);
      }
      // Idempotent: tapping "add" twice adds one exercise. The list is an ordered set, and the
      // order is the order the user added them in.
      if (s.session.bonusExerciseIds.includes(exerciseId)) return s;
      const session: SessionState = {
        ...s.session,
        bonusExerciseIds: [...s.session.bonusExerciseIds, exerciseId],
      };
      saveSessionMirror(session);
      return { ...s, session };
    });
  },

  setActiveAssignmentDate(date: LocalDate | null): void {
    set((s) => {
      const session: SessionState = { ...s.session, activeAssignmentDate: date };
      // Mirrored for the same reason the timer is: a reload mid-session must log the next set
      // against the day the session was opened on, not against whatever day it is now.
      saveSessionMirror(session);
      return { ...s, session };
    });
  },

  clearSessionSlice(): void {
    set((s) => {
      // The mirror is REMOVED rather than rewritten empty. An empty mirror and no mirror are
      // the same state to initialSession(), but leaving a key behind for a session that is
      // over is a record of nothing.
      clearSessionMirror();
      return { ...s, session: EMPTY_SESSION };
    });
  },

  closeStaleSessions(profileId: string, now: EpochMs): readonly StaleClosure[] {
    const s = get();
    const profile = s.profiles[profileId];
    if (profile === undefined) return [];
    const today = todayLocal(profile.timezone, now); // the profile's civil date
    const result = closeStaleSessionsPure(selectState(s), profileId, today, now);
    if (result.closed.length === 0) return [];
    set({
      ...result.state,
      // The slice described the session just closed (its timer, its day, its bonus cards).
      session: EMPTY_SESSION,
      status: { ...get().status, staleClosures: result.closed },
    });
    clearSessionMirror();
    return result.closed;
  },

  acknowledgeStaleClosures(): void {
    if ((get().status.staleClosures ?? []).length === 0) return;
    set({ status: { ...get().status, staleClosures: [] } });
  },

  acknowledgeExternalWrite(): void {
    if (get().status.externalWriteReplaced !== true) return;
    set({ status: { ...get().status, externalWriteReplaced: false } });
  },

  /*
   * P3's schedule slice, spread LAST so its members win over any earlier placeholder of the
   * same name. Only setUi collides today, and the two implementations are the same shallow
   * patch, so the precedence changes no behaviour; it is stated here because the ordering is
   * what makes the file safe to extend.
   */
  ...schedule,

  /* P6's motivation slice (master plan §6.7). Collides with nothing. */
  ...motivation,
  ...reminders,

  /* P8's fun-mechanics slice (master plan section 6.7). Collides with nothing. */
  ...fun,

  /*
   * The two transitions that end a session, wrapped so the non-persisted session slice and its
   * mirror go with it. Declared AFTER the spread, so these win; each calls the slice's own
   * implementation, which is captured in `schedule` and is not reachable through get().
   */
  completeSession(profileId: string, date: LocalDate, now: EpochMs): void {
    endingSession(profileId, date, () => {
      schedule.completeSession(profileId, date, now); // now: [ms] epoch, UTC
    });
  },

  skipSession(profileId: string, date: LocalDate, reason: string | null): void {
    endingSession(profileId, date, () => {
      schedule.skipSession(profileId, date, reason);
    });
  },
  };
});

function installOutcome(outcome: LoadOutcome): void {
  const store = useAppStore;
  // Installing what was read is not a change to store: no outcome may schedule a write.
  withoutPersisting(() => {
    const status = store.getState().status;
    if (outcome.ok) {
      store.setState({
        ...outcome.state,
        session: restoredSession(store.getState().session, outcome.state, Date.now()), // [ms] epoch, UTC
        status: {
          ...status,
          lastLoadError: null,
          lastLoadRaw: null,
          loadFailure: undefined,
          hydrated: true,
          quarantine: outcome.quarantine,
          repairs: outcome.repairs,
        },
      });
      return;
    }
    if (outcome.reason === 'absent') {
      // First run. defaultState() already in place; nothing to report.
      store.setState({ status: { ...status, lastLoadError: null, lastLoadRaw: null, hydrated: true } });
      return;
    }
    // Keep the last known-good state in memory, show the error, offer the stored text for
    // export, and write nothing until the user imports or wipes (canPersist).
    cancelPendingSave();
    store.setState({
      status: {
        ...status,
        lastLoadError: outcome.error,
        lastLoadRaw: outcome.raw,
        loadFailure: outcome.reason,
        hydrated: true,
      },
    });
  });
}

/** Audit B03: re-reads the records another instance changed; this instance's unsaved batch goes. */
async function reloadFrom(e: Engine): Promise<void> {
  if (engine !== e) return;
  e.queued = null;
  e.dirty = null;
  const outcome = await loadDocument(e.backend);
  if (engine !== e) return;
  installOutcome(outcome);
  e.revision = outcome.revision;
  e.preserved = outcome.ok ? outcome.preserved : EMPTY_PRESERVED;
}

function queueOps(ops: RecordOps): void {
  const e = engine;
  if (e === null) return;
  e.queued = e.queued === null ? ops : mergeOps(e.queued, ops);
  if (e.flushScheduled) return;
  e.flushScheduled = true;
  // One transaction per action: everything the current task changed, then commit.
  queueMicrotask(() => {
    flushQueued(e);
  });
}

function flushQueued(e: Engine): void {
  e.flushScheduled = false;
  if (engine !== e) return;
  const batch = e.queued;
  e.queued = null;
  if (batch === null) return;
  const encoded = encodeOps(batch, e.preserved);
  e.chain = e.chain.then(() => commitBatch(e, encoded));
}

async function commitBatch(e: Engine, batch: RecordOps): Promise<void> {
  if (engine !== e) return;
  const ops = e.dirty === null ? batch : mergeOps(e.dirty, batch);
  e.dirty = null;
  if (isEmptyOps(ops)) return;
  const result = await e.backend.commit(ops, e.revision, CURRENT_SCHEMA_VERSION);
  if (engine !== e) return;
  if (result.ok) {
    e.revision = result.revision;
    if (ops.clear && e.removeLegacyAfterClear) {
      e.removeLegacyAfterClear = false;
      e.backend.removeLegacy();
    }
    e.backend.announce(result.revision);
    useAppStore.getState().reportSaveResult({ ok: true });
    return;
  }
  if (result.reason === 'stale') {
    await reloadFrom(e);
    return;
  }
  // Kept, so the next commit (or Retry) writes it: per-record writes must not lose a change.
  e.dirty = ops;
  useAppStore.getState().reportSaveResult({ ok: false, reason: result.reason, error: result.error });
}

/**
 * Resolves once every change made so far has been committed (or has failed and been reported).
 * For the wipe's ordering (audit B14) and for tests.
 */
export async function whenPersisted(): Promise<void> {
  for (;;) {
    const e = engine;
    if (e === null) return;
    if (e.flushScheduled) flushQueued(e);
    const chain = e.chain;
    await chain;
    if (engine !== e || (e.chain === chain && !e.flushScheduled)) return;
  }
}

/**
 * Whether the store may write over the stored document at all.
 *
 * Both gates protect data the store never successfully read:
 *
 *  - Before hydrate(), the in-memory document is defaultState(). Writing that
 *    would replace a perfectly good stored document with an empty one.
 *  - After a *failed* hydrate, the stored bytes are the user's only copy of
 *    data the schema could not parse, and the in-memory document is again the
 *    default. Any write destroys the original — including the ones the user
 *    never asked for, such as a UI preference touched while the recovery banner
 *    is on screen. So the whole document is frozen, not the failing part.
 *
 * Writes resume exactly when lastLoadError returns to null, which happens on
 * two user decisions and nowhere else: wipeAll() (clear it) and replaceState(),
 * including the importJson() path (replace it). Neither is reachable without
 * the user acting on the banner, so the corrupt document is never overwritten
 * by a background write.
 */
function canPersist(status: StoreStatus): boolean {
  return status.hydrated && status.lastLoadError === null;
}

/**
 * Persists the store on change (spec R13): each action's changed records are committed through
 * the backend hydrate() installed, one transaction per action, no debounce. Returns a teardown
 * that stops writing and stops listening to other instances.
 *
 * Amendment AM-P2-1 (rollback mirror): on visibilitychange to hidden and on pagehide the whole
 * document is also written to fti.v3, so a pre-P2 build (which reads only fti.v3) loads data at
 * most one app session old after a rollback. Best effort, never per action, never on the
 * critical path. Remove two releases after P2 ships (docs/STATUS.md).
 */
export function startPersistence(): () => void {
  const unsubscribe = useAppStore.subscribe((next, prev) => {
    // A change the store made to itself (hydrating, resetting) is not a change to store.
    if (suppressWrite) return;
    if (engine === null) return;
    const ops = replacing
      ? { clear: true, puts: splitState(selectState(next)), deletes: [] }
      : diffStates(selectState(prev), selectState(next));
    if (isEmptyOps(ops)) return;
    if (!canPersist(next.status)) {
      // A blocked change must not wait in the queue for the gate to open.
      cancelPendingSave();
      return;
    }
    // A replaced document carries none of the old one's unknown keys or quarantined rows.
    if (replacing) engine.preserved = EMPTY_PRESERVED;
    queueOps(ops);
  });

  const onPageHide = (): void => {
    writeRollbackMirror();
  };
  window.addEventListener('pagehide', onPageHide);
  // Android discards a backgrounded tab without firing pagehide; "hidden" is the last event a
  // page is guaranteed to see.
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') writeRollbackMirror();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    engine?.stopListening();
    engine = null;
  };
}

/**
 * Amendment AM-P2-1: the in-memory document to fti.v3, in the shape the pre-P2 save() wrote
 * (JSON.stringify of the whole AppState, so an old build's parseState loads it and this
 * browser keeps its own push device). Never over a document the store refused to read
 * (canPersist): fti.v3 may then be the user's only copy. Skipped when nothing changed since the
 * last mirror. A failure (quota) is logged by persistence.ts and otherwise ignored.
 */
function writeRollbackMirror(): void {
  const e = engine;
  if (e === null) return;
  const state = useAppStore.getState();
  if (!canPersist(state.status)) return;
  const unchanged = e.queued === null && e.dirty === null && !e.flushScheduled && e.mirroredRevision === e.revision;
  if (unchanged) return;
  let text: string;
  try {
    text = JSON.stringify(selectState(state));
  } catch (err) {
    // A document JSON cannot hold is already reported by the commit path ('serialize').
    console.warn(`fti.v3 rollback mirror skipped: ${String(err)}`);
    return;
  }
  e.backend.writeLegacy(text);
  e.mirroredRevision = e.revision;
}

export { defaultState };
export type { SetupResult } from './setup';
