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
   * when nothing else is.
   */
  createProfile(p: Profile): void;
  /** Shallow patch of one profile. An unknown id is a no-op. */
  updateProfile(id: string, patch: Partial<Profile>): void;
  /** Stores a plan for one profile and starts its cursor at session 0. */
  setPlan(profileId: string, plan: PlanTemplate, startedOn: LocalDate): void;
  /** One intake entry per civil date; a second entry for a date replaces the first. */
  logIntake(profileId: string, entry: IntakeEntry): void;
  /** The weekday slots and weekly session target the wizard collects; P3 consumes them. */
  setAvailability(profileId: string, a: Availability): void;
  /** Result of the pre-participation screen (master plan section 10, P2 item 20). */
  recordReadiness(profileId: string, screenedAt: LocalDate, flagged: boolean): void;
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
 */
export type AppStore = AppState & AppActions & { status: StoreStatus };

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
  status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: false },

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
          // Kept: after clearing an unreadable document, the in-memory snapshot
          // is the only remaining copy the recovery UI can export.
          lastLoadRaw: get().status.lastLoadRaw,
          hydrated: true,
        },
      });
    });
  },

  setUi(patch: Partial<UiPrefs>): void {
    set({ ui: { ...get().ui, ...patch } });
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
    if (!canPersist(get().status)) return;
    // The user asked for this write, so it goes now rather than through the
    // debounce, and any queued write is dropped: it can only carry an older
    // document than the one about to be written.
    cancelPendingSave();
    get().reportSaveResult(save(selectState(get())));
  },

  createProfile(p: Profile): void {
    const s = get();
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
      // Seed the profile-keyed log arrays so no later action has to guard
      // against undefined. Existing arrays are kept: this must not be a way to
      // erase a profile's history.
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
    // Shallow by contract: a caller patching `body` or `goal` supplies the whole
    // sub-object. `id` is not re-derived from the patch, so a patch carrying a
    // different id cannot move the record away from its key.
    set({ profiles: { ...s.profiles, [id]: { ...current, ...patch, id } } });
  },

  setPlan(profileId: string, plan: PlanTemplate, startedOn: LocalDate): void {
    const s = get();
    requireProfile(s, 'setPlan', profileId);
    // A PlanTemplate belongs to exactly one profile (master plan section 5), so
    // the stored copy always gets a fresh id. Without it, handing the same
    // generated template to two profiles would leave one record that either
    // profile's later edits would rewrite under the other.
    const stored: PlanTemplate = { ...plan, id: newId() };
    const replaced = s.cursors[profileId]?.planId ?? null;
    const plans: Record<string, PlanTemplate> = { ...s.plans, [stored.id]: stored };
    // Re-planning replaces the plan rather than accumulating plans: the cursor
    // about to be overwritten was the only reference to the old one, so keeping
    // it would leave a record no code path ever reads or deletes. The check is
    // cheap insurance in case a later plan does share a plan between cursors —
    // deleting a plan another cursor still points at would strand that profile.
    const stillReferenced = Object.entries(s.cursors).some(
      ([id, cursor]) => id !== profileId && cursor.planId === replaced,
    );
    if (replaced !== null && !stillReferenced) delete plans[replaced];
    set({
      plans,
      cursors: {
        ...s.cursors,
        [profileId]: { planId: stored.id, nextSessionIndex: 0, startedOn, completedOn: null },
      },
    });
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
