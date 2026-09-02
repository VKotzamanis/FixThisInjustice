import { create } from 'zustand';
import type {
  AppState,
  Availability,
  IntakeEntry,
  LocalDate,
  PlanTemplate,
  Profile,
  UiPrefs,
} from '../domain/types';
import { defaultState } from '../domain/schema';
import { compareLocalDate } from '../domain/dates';
import { newId } from '../domain/ids';
import { dailyBeverageTargetML } from '../domain/nutrition';
import { createScheduleActions, type ScheduleActions } from './scheduleActions';
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
  /** Result of the pre-participation screen (master plan section 10, P2 item 20). */
  recordReadiness(profileId: string, screenedAt: LocalDate, flagged: boolean): void;
  /** Points the app at another stored profile. Throws on an unknown id. */
  setActiveProfile(id: string): void;
}

/**
 * Guard for every action that writes a record keyed by a profile id.
 *
 * The schema's root refinement rejects a document whose per-profile map carries
 * a key no profile owns (master plan section 5), and the store is the only
 * writer, so the check belongs at the point of writing rather than at the next
 * reload: a caller that passes an id nobody owns has a bug, and the alternative
 * to throwing is a document that cannot be saved and a silent data loss at the
 * next load. `updateProfile` is deliberately not on this path — its contract
 * says an unknown id is a no-op, and it writes nothing keyed by that id.
 */
function requireProfile(state: AppState, action: string, profileId: string): Profile {
  const profile = state.profiles[profileId];
  if (profile === undefined) {
    throw new Error(`${action}: "${profileId}" is not a known profile`);
  }
  return profile;
}

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
export type AppStore = AppState & AppActions & { status: StoreStatus } & ScheduleActions;

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

export const useAppStore = create<AppStore>()((set, get) => ({
  ...defaultState(),
  status: {
    lastSaveError: null,
    lastLoadError: null,
    lastLoadRaw: null,
    hydrated: false,
    lastActionError: null,
  },

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
    // Two writes have to be stopped, not one. The debounce may already hold the
    // pre-wipe document, and the reset below is itself a persisted change; left
    // alone, either re-creates the key one debounce interval after the user
    // asked for it to be gone.
    cancelPendingSave();
    withoutPersisting(() => {
      set({
        ...defaultState(),
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
    });
    /*
     * Non-persisted session slice: nothing to reset yet. P4 adds
     * `session: { restTimer: RestTimer | null; activeAssignmentDate: LocalDate |
     * null }` to this store (master plan section 6.7, mirrored to
     * sessionStorage). Both fields point at the schedule that was just cleared,
     * so P4 clears them HERE, inside the set() above, at the same time as
     * `assignments`. The in-progress guard makes that a formality rather than a
     * data loss: a running timer implies an in-progress assignment, which has
     * already thrown by this line.
     */
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

  recordReadiness(profileId: string, screenedAt: LocalDate, flagged: boolean): void {
    const s = get();
    // Unlike updateProfile, an unknown id throws here: a discarded screen is
    // the one case where losing the write changes what the app tells the user
    // about their health (a flagged screen shows the physician-consult notice
    // at every session start), so it must not fail silently.
    const current = requireProfile(s, 'recordReadiness', profileId);
    set({
      profiles: { ...s.profiles, [profileId]: { ...current, readiness: { screenedAt, flagged } } },
    });
  },

  /*
   * P3's schedule slice, spread LAST so its members win over any earlier placeholder of the
   * same name. Only setUi collides today, and the two implementations are the same shallow
   * patch, so the precedence changes no behaviour; it is stated here because the ordering is
   * what makes the file safe to extend.
   *
   * The adapter is the whole of the store's involvement: the slice sees a pure
   * AppState -> AppState transition and a channel for the refusal message, and knows nothing
   * about zustand, persistence, or the status slice.
   */
  ...createScheduleActions({
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
  }),
}));

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
