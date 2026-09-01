import { create } from 'zustand';
import type { AppState, UiPrefs } from '../domain/types';
import { defaultState } from '../domain/schema';
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

export interface StoreStatus {
  /** Non-null while the last write failed. The UI shows a blocking banner (H3). */
  lastSaveError: SaveErrorReason | null;
  /** Set when a stored document failed validation; the in-memory state is the last known good one. */
  lastLoadError: string | null;
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

export const useAppStore = create<AppStore>()((set, get) => ({
  ...defaultState(),
  status: { lastSaveError: null, lastLoadError: null, hydrated: false },

  hydrate(): void {
    const result = load();
    if (result.ok) {
      set({ ...result.state, status: { ...get().status, lastLoadError: null, hydrated: true } });
      return;
    }
    if (result.reason === 'absent') {
      // First run. defaultState() already in place; nothing to report.
      set({ status: { ...get().status, lastLoadError: null, hydrated: true } });
      return;
    }
    // Constraint 2: keep the last known-good state in memory, show the error,
    // offer export. Never overwrite the stored document with a guess.
    set({ status: { ...get().status, lastLoadError: result.error, hydrated: true } });
  },

  replaceState(next: AppState): void {
    // A complete AppState, so a shallow merge replaces every persisted field.
    set(next);
  },

  exportJson(): string {
    return serialise(selectState(get()));
  },

  importJson(text: string): { ok: true } | { ok: false; error: string } {
    const result = deserialise(text);
    if (!result.ok) return { ok: false, error: result.error };
    // Import goes through the store, never straight to storage: writing behind
    // the store's back is finding A43, where the persistence effect overwrote
    // the imported snapshot before the reload landed.
    set({ ...result.state, status: { ...get().status, lastLoadError: null } });
    return { ok: true };
  },

  wipeAll(): void {
    // Only this app's key. Any other owner of origin data (the P7 asset store)
    // is cleared by the same caller, not from here.
    clearStorage();
    set({
      ...defaultState(),
      status: { lastSaveError: null, lastLoadError: null, hydrated: true },
    });
  },

  setUi(patch: Partial<UiPrefs>): void {
    set({ ui: { ...get().ui, ...patch } });
  },

  reportSaveResult(r: SaveResult): void {
    const reason = r.ok ? null : r.reason;
    if (get().status.lastSaveError === reason) return;
    set({ status: { ...get().status, lastSaveError: reason } });
  },
}));

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: AppState | null = null;

/** Writes any coalesced state immediately. Safe to call when nothing is pending. */
export function flushSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const toSave = pending;
  pending = null;
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
    // Only a persisted change is worth a write; status is not persisted.
    if (!persistedChanged(next, prev)) return;
    pending = selectState(next);
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  });

  const onPageHide = (): void => {
    flushSave();
  };
  window.addEventListener('pagehide', onPageHide);

  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', onPageHide);
    flushSave();
  };
}

export { defaultState };
