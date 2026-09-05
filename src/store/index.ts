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
  UiPrefs,
} from '../domain/types';
import { defaultState } from '../domain/schema';
import { compareLocalDate } from '../domain/dates';
import { newId } from '../domain/ids';
import { dailyBeverageTargetML } from '../domain/nutrition';
import { EXERCISE_BY_ID } from '../domain/plan/library';
import type { RestTimer } from '../domain/training/restTimer';
import {
  createScheduleActions,
  requireProfile,
  type ScheduleActions,
} from './scheduleActions';
import { createMotivationActions, type MotivationActions } from './motivationActions';
import { createReminderActions, type ReminderActions } from './reminderActions';
import { createFunActions, type FunActions } from './funActions';
import {
  UNDO_WINDOW_MS,
  applyAddCustomExercise,
  applyAddHydration,
  applyDeleteSet,
  applyLogBodyMass,
  applyLogSet,
  applyRestoreSet,
} from './training';
import {
  EMPTY_SESSION,
  clearSessionMirror,
  initialSession,
  saveSessionMirror,
  type SessionState,
} from './sessionMirror';
import type { SaveFailure, SaveResult } from './persistence';
import {
  clearStorage,
  exportJson as serialise,
  importJson as deserialise,
  load,
  save,
} from './persistence';

/** [ms] Coalescing window for writes. One write per burst, not one per keystroke (A41). */
export const SAVE_DEBOUNCE_MS = 250;

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
  hydrate(): void;
  replaceState(next: AppState): void;
  exportJson(): string;
  importJson(text: string): { ok: true } | { ok: false; error: string };
  wipeAll(): void;
  /** Shallow patch of the UI preferences; every other field is left alone. */
  setUi(patch: Partial<UiPrefs>): void;
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
   * schedule (assignments and pauses). The replaced plan is kept.
   */
  setPlan(profileId: string, plan: PlanTemplate, startedOn: LocalDate): void;
  /** One intake entry per civil date; a second entry for a date replaces the first. */
  logIntake(profileId: string, entry: IntakeEntry): void;
  /** The weekday slots and weekly session target the wizard collects; P3 consumes them. */
  setAvailability(profileId: string, a: Availability): void;
  /** Points the app at another stored profile. Throws on an unknown id. */
  setActiveProfile(id: string): void;

  // P4
  /**
   * Logs one set and reports what it produced. Throws on a set the schema refuses (master plan
   * section 5: loadKg 0 is valid, negative and non-finite are not; RPE is on the 0.5 grid) or
   * on a profile that does not exist.
   *
   * @param now [ms] epoch UTC, the instant the set was logged.
   */
  logSet(set: Omit<LoggedSet, 'id' | 'loggedAt'>, now: EpochMs): LogSetResult;
  /**
   * Removes one set and holds it in the non-persisted undo buffer for UNDO_WINDOW_MS. An
   * unknown id is a no-op and mints no buffer.
   */
  deleteSet(id: string): void;
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
  /** Starts, replaces or clears the rest interval. Session slice only; never persisted. */
  setRestTimer(t: RestTimer | null): void;
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
    ui: s.ui,
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: AppState | null = null;

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
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pending = null;
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

  hydrate(): void {
    const result = load();
    // Hydrating is a read, so none of its three outcomes may schedule a write.
    // The valid case would re-serialise the bytes it just parsed — a write that
    // can fail and cannot help; the invalid case must not go near the stored
    // document at all.
    withoutPersisting(() => {
      if (result.ok) {
        set({
          ...result.state,
          status: { ...get().status, lastLoadError: null, lastLoadRaw: null, hydrated: true },
        });
        return;
      }
      if (result.reason === 'absent') {
        // First run. defaultState() already in place; nothing to report.
        set({
          status: { ...get().status, lastLoadError: null, lastLoadRaw: null, hydrated: true },
        });
        return;
      }
      // Constraint 2: keep the last known-good state in memory, show the error,
      // offer export. Never overwrite the stored document with a guess. The raw
      // text is kept here because it is the user's only copy of data the schema
      // could not read, and storage is about to stop being a reliable source of
      // it — result.raw is null when the store was unreachable.
      //
      // A write queued before this load is dropped rather than allowed to land:
      // freezing the document has to cover writes already in flight, not only
      // the ones the gate below will refuse.
      cancelPendingSave();
      set({
        status: {
          ...get().status,
          lastLoadError: result.error,
          lastLoadRaw: result.raw,
          hydrated: true,
        },
      });
    });
  },

  replaceState(next: AppState): void {
    // A complete AppState, so a shallow merge replaces every persisted field.
    //
    // Clearing lastLoadError is what re-opens persistence after a failed load:
    // the user chose to replace the unreadable document, so overwriting it is
    // now their decision rather than silent data loss. lastLoadRaw is kept, so
    // the recovery export stays available until the next hydrate().
    set({ ...next, status: { ...get().status, lastLoadError: null } });
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
    get().replaceState(result.state);
    return { ok: true };
  },

  wipeAll(): void {
    // Only this app's key. Any other owner of origin data (the P7 asset store)
    // is cleared by the same caller, not from here.
    clearStorage();
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
  },

  /*
   * setUi is not written here. It is declared in AppActions above (P1 owns the contract) and
   * implemented once, in the schedule slice spread in at the bottom of this object, because
   * two identical shallow patches of `ui` in one initialiser is a duplicate the compiler is
   * right to reject (TS2783) and a second place for the behaviour to drift.
   */

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
    if (!canPersist(get().status)) return;
    // The user asked for this write, so it goes now rather than through the
    // debounce, and any queued write is dropped: it can only carry an older
    // document than the one about to be written.
    cancelPendingSave();
    get().reportSaveResult(save(selectState(get())));
  },

  createProfile(p: Profile): void {
    const s = get();
    // Create, not upsert. Reusing an existing id would silently replace that
    // profile's record while every log keyed by the id stayed put, leaving a
    // history that belongs to nobody now stored under someone else's name.
    // updateProfile is the way to change a profile that exists; a caller that
    // reaches here with a live id has a bug, and losing a person's identity is
    // not an acceptable way to report it.
    if (s.profiles[p.id] !== undefined) {
      throw new Error(`createProfile: "${p.id}" already exists`);
    }
    // The hydration target is a stored preference, not a derived value, so it
    // has to hold a number from the moment the profile exists. A caller that
    // left it at 0 gets the IOM 2005 beverage figure for the profile's sex
    // (nutrition.ts, dailyBeverageTargetML) rather than a silent zero target.
    const stored: Profile =
      p.hydration.dailyTargetML > 0
        ? p
        : {
            ...p,
            hydration: { ...p.hydration, dailyTargetML: dailyBeverageTargetML(p.body.sex) }, // [mL/day]
          };
    set({
      // Keyed by the profile's own id, which is the invariant the schema's root
      // refinement checks: profiles[id].id === id.
      profiles: { ...s.profiles, [stored.id]: stored },
      activeProfileId: s.activeProfileId ?? stored.id,
      /*
       * Seeded here: the six ARRAY-valued per-profile logs. Every later action
       * that appends to one of them (logIntake, P3's assignments and pauses,
       * P4's body mass and hydration, P6's weekly reviews) can then read the key
       * without a guard, and an empty array is the truthful value for a profile
       * that has logged nothing.
       *
       * Deliberately NOT seeded, and each for the same reason — no key is the
       * honest representation of "not collected yet", and any value written here
       * would be one the user never supplied:
       *   availability      no weekday slots collected until the wizard asks
       *   cursors           no plan; seeding one would need a planId to point at,
       *                     and useActivePlan could no longer tell "no plan" from
       *                     "a plan"
       *   reminderSettings  P5; absent means never configured, not "disabled"
       *   motivation        P6; absent means nothing has been shown yet
       *   specimens         P8; absent means nothing drawn
       *   capsules          P8; absent means no capsule, which is not the same as
       *                     the null a written-and-opened capsule leaves behind
       *   customExercises   P4; absent and empty read identically through `?? []`
       *   notes             P7 migration; same, through `?? {}`
       * Both of the last two carry Zod defaults at the root, so an absent key
       * survives a save/load round trip as an empty collection either way.
       *
       * `?? []` rather than a bare []: belt and braces behind the duplicate-id
       * guard above, which already makes a pre-existing array for this id
       * unreachable. It costs nothing and it must never become a way to erase a
       * profile's history.
       */
      pauses: { ...s.pauses, [stored.id]: s.pauses[stored.id] ?? [] },
      assignments: { ...s.assignments, [stored.id]: s.assignments[stored.id] ?? [] },
      bodyMass: { ...s.bodyMass, [stored.id]: s.bodyMass[stored.id] ?? [] },
      hydration: { ...s.hydration, [stored.id]: s.hydration[stored.id] ?? [] },
      intake: { ...s.intake, [stored.id]: s.intake[stored.id] ?? [] },
      weeklyReviews: { ...s.weeklyReviews, [stored.id]: s.weeklyReviews[stored.id] ?? [] },
    });
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
    set({ profiles: { ...s.profiles, [id]: { ...current, ...patch, id } } });
  },

  setPlan(profileId: string, plan: PlanTemplate, startedOn: LocalDate): void {
    const s = get();
    requireProfile(s, 'setPlan', profileId);
    /*
     * Refuse rather than discard. An in-progress assignment means the user is
     * mid-session: sets are being logged against `assignment.date` and
     * `session.id`, and a rest timer may be running. Clearing that row would
     * strand those sets on a schedule entry that no longer exists and leave the
     * timer counting for a session the app has forgotten, so re-planning is not
     * something the store may decide to do quietly. The caller finishes or skips
     * the session first (P3's completeSession / skipSession) and then re-plans.
     */
    const schedule = s.assignments[profileId] ?? [];
    if (schedule.some((a) => a.status === 'in-progress')) {
      throw new Error('setPlan: a session is in progress');
    }
    // A PlanTemplate belongs to exactly one profile (master plan section 5), so
    // the stored copy always gets a fresh id. Without it, handing the same
    // generated template to two profiles would leave one record that either
    // profile's later edits would rewrite under the other.
    const stored: PlanTemplate = { ...plan, id: newId() };
    set({
      /*
       * The replaced plan is KEPT (master plan section 6.7). Every LoggedSet
       * carries the `sessionId` of the session it was logged under, and `plans`
       * is the only place that id resolves to a name, an ordinal or an exercise
       * list. Deleting the plan on re-planning severed every set logged before
       * the change from its session — the sets survived, but nothing could say
       * what they were sets OF. The cursor, not the contents of this map, is
       * what identifies the active plan, so an unreferenced plan here is history
       * rather than an orphan. It is bounded by how often a user re-plans.
       */
      plans: { ...s.plans, [stored.id]: stored },
      cursors: {
        ...s.cursors,
        [profileId]: { planId: stored.id, nextSessionIndex: 0, startedOn, completedOn: null },
      },
      /*
       * The schedule is cleared in the SAME set() as the cursor, so no reader
       * ever observes the new plan beside the old plan's calendar. Both records
       * point into the plan that has just stopped being current:
       *
       *   assignments  each row names a `sessionId` and a `sourceIndex` into the
       *                REPLACED plan's session list. Left in place, P3's
       *                projectedCalendar would resolve today's row against the
       *                new plan and show whichever session happens to sit at
       *                that index. Terminal rows (completed, skipped) go too:
       *                they are the old plan's calendar, and the logged sets —
       *                which is what the user actually did — are in `sets` and
       *                are not touched.
       *   pauses       a pause is a suspension OF a plan. An open pause (to ===
       *                null) carried across would silently suspend the plan the
       *                user just asked to start.
       */
      assignments: { ...s.assignments, [profileId]: [] },
      pauses: { ...s.pauses, [profileId]: [] },
      /*
       * The non-persisted session slice goes with them, in the same set(), for the same
       * reason: `activeAssignmentDate` names a row in the schedule just cleared, the rest
       * timer belongs to a session of the plan just replaced, and the bonus exercises were
       * added to that session. The in-progress guard above makes this a formality rather than
       * a data loss — a running timer implies an in-progress assignment, which has already
       * thrown by this line — but leaving the slice behind would still hand the new plan the
       * old plan's open day.
       */
      session: EMPTY_SESSION,
    });
    // Outside the set() because it is I/O, not state: without it a reload would restore the
    // slice this set() just cleared.
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
    const list = s.intake[profileId] ?? [];
    // One entry per civil date: a second entry for the same date replaces the
    // first, so the daily total the user last typed is the one stored. Kept in
    // date order so every reader can assume it without re-sorting.
    const next = [...list.filter((e) => e.date !== entry.date), entry].sort((a, b) =>
      compareLocalDate(a.date, b.date),
    );
    set({ intake: { ...s.intake, [profileId]: next } });
  },

  setAvailability(profileId: string, a: Availability): void {
    const s = get();
    requireProfile(s, 'setAvailability', profileId);
    set({ availability: { ...s.availability, [profileId]: a } });
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

  logSet(input: Omit<LoggedSet, 'id' | 'loggedAt'>, now: EpochMs): LogSetResult {
    // The id is minted before the write so it can be returned: the caller needs it to offer
    // an undo, and re-deriving it from the document afterwards would mean searching by value.
    const id = newId();
    set((s) => applyLogSet(s, input, id, now)); // now: [ms] epoch, UTC
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
    // buffer is spent at `now > expiresAt`, and available at exactly expiresAt.
    return pending !== null && now <= pending.expiresAt;
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

/** Writes any coalesced state immediately. Safe to call when nothing is pending. */
export function flushSave(): void {
  const toSave = pending;
  cancelPendingSave();
  if (toSave === null) return;

  useAppStore.getState().reportSaveResult(save(toSave));
}

/**
 * True when any persisted field changed identity. Actions replace the objects
 * they touch rather than mutating them, so reference comparison is enough, and a
 * status-only update — which touches no persisted field — costs no write.
 *
 * The `as` is over the store's own keys, not over external data: Object.keys
 * types its result as string[], and both operands are AppState by construction.
 */
function persistedChanged(next: AppStore, prev: AppStore): boolean {
  const a = selectState(next);
  const b = selectState(prev);
  return (Object.keys(a) as (keyof AppState)[]).some((key) => a[key] !== b[key]);
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
 * Persists the store on change. The store is the only writer, so there is no
 * race between a direct localStorage write and the subscription (A43).
 *
 * Writes are debounced because the legacy store serialised the whole document
 * on every keystroke (A41). They are flushed on pagehide because a phone can
 * discard the page without ever firing unload, which would lose the last burst.
 * Returns a teardown that flushes first.
 */
export function startPersistence(): () => void {
  const unsubscribe = useAppStore.subscribe((next, prev) => {
    // A change the store made to itself — hydrating, resetting — is not a
    // change to store.
    if (suppressWrite) return;
    // Only a persisted change is worth a write; status is not persisted.
    if (!persistedChanged(next, prev)) return;
    if (!canPersist(next.status)) {
      // A blocked write must not sit in the queue waiting for the gate to open:
      // by then it would carry a document assembled while the store was in a
      // state it refused to persist.
      cancelPendingSave();
      return;
    }
    pending = selectState(next);
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  });

  const onPageHide = (): void => {
    flushSave();
  };
  window.addEventListener('pagehide', onPageHide);

  /**
   * Android discards a backgrounded tab without firing pagehide, so the last
   * event a page is guaranteed to see is visibilitychange to "hidden". A flush
   * on becoming visible would be pointless, hence the state check.
   */
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') flushSave();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    flushSave();
  };
}

export { defaultState };
