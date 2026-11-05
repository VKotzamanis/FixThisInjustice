// src/store/measurements.ts
//
// Pure AppState transformers for correcting measurements (spec R9, audit G03, G07). No React, no
// I/O. Every write is parsed with the loader's schema (spec R5), so a refusal throws before the
// store's set() and writes nothing. Units: mass [kg], volume [mL], instants [ms] epoch UTC.
import { compareLocalDate } from '../domain/dates';
import { BodyMassEntrySchema, HydrationEntrySchema } from '../domain/schema';
import type {
  AppState,
  BodyMassEntry,
  BodyMassRole,
  EpochMs,
  Kg,
  LocalDate,
  ML,
  UnitSystem,
} from '../domain/types';
import { requireProfile } from './scheduleActions';
import { parseOrThrow } from './validate';

/** What an edit may change. `role: null` stores the entry untagged. */
export interface BodyMassEdit {
  massKg: Kg; // [kg] canonical
  enteredUnit: UnitSystem;
  bodyFatPct: number | null; // [%] of body mass, or null
  role: BodyMassRole | null;
}

/** Civil-date order, which every reader of bodyMass may assume (stable: a day keeps its order). */
function byDate(list: readonly BodyMassEntry[]): BodyMassEntry[] {
  return [...list].sort((a, b) => compareLocalDate(a.date, b.date));
}

/**
 * Rewrites one entry's measurement in place. The id, the civil date and `loggedAt` (when it was
 * measured) are the record's identity and are kept. Throws on an unknown id or a refused value.
 */
export function applyUpdateBodyMass(
  state: AppState,
  profileId: string,
  id: string,
  edit: BodyMassEdit,
): AppState {
  requireProfile(state, 'updateBodyMass', profileId);
  const list = state.bodyMass[profileId] ?? [];
  const current = list.find((e) => e.id === id);
  if (current === undefined) {
    throw new Error(`updateBodyMass: no body-mass entry "${id}"; it may have been deleted`);
  }
  const candidate: BodyMassEntry = {
    ...current,
    massKg: edit.massKg, // [kg]
    enteredUnit: edit.enteredUnit,
    bodyFatPct: edit.bodyFatPct, // [%] or null
  };
  if (edit.role === null) delete candidate.role;
  else candidate.role = edit.role;
  const stored = parseOrThrow(BodyMassEntrySchema, candidate, 'updateBodyMass');
  return {
    ...state,
    bodyMass: { ...state.bodyMass, [profileId]: list.map((e) => (e === current ? stored : e)) },
  };
}

/** Removes one entry and hands it back for the undo offer; identity unchanged for an unknown id. */
export function applyDeleteBodyMass(
  state: AppState,
  profileId: string,
  id: string,
): { next: AppState; removed: BodyMassEntry | null } {
  const list = state.bodyMass[profileId] ?? [];
  const removed = list.find((e) => e.id === id) ?? null;
  if (removed === null) return { next: state, removed: null };
  return {
    next: { ...state, bodyMass: { ...state.bodyMass, [profileId]: list.filter((e) => e !== removed) } },
    removed,
  };
}

/** Puts a deleted entry back exactly as it was. A no-op when its id is already stored. */
export function applyRestoreBodyMass(state: AppState, entry: BodyMassEntry): AppState {
  requireProfile(state, 'restoreBodyMass', entry.profileId);
  const list = state.bodyMass[entry.profileId] ?? [];
  if (list.some((e) => e.id === entry.id)) return state;
  const stored = parseOrThrow(BodyMassEntrySchema, entry, 'restoreBodyMass');
  return { ...state, bodyMass: { ...state.bodyMass, [entry.profileId]: byDate([...list, stored]) } };
}

/**
 * Takes back one drink: subtracts its volume (floored at 0) and removes the mark logged at `at`.
 * Idempotent: a mark that is no longer there changes nothing, so a second undo tap is harmless.
 *
 * @param volumeML [mL] the volume that drink added
 * @param at [ms] epoch UTC, the instant addHydration recorded for it
 */
export function applyRemoveDrink(
  state: AppState,
  profileId: string,
  date: LocalDate,
  volumeML: ML,
  at: EpochMs,
): AppState {
  const list = state.hydration[profileId] ?? [];
  const current = list.find((e) => e.date === date);
  if (current === undefined) return state;
  const index = current.marks.indexOf(at);
  if (index < 0) return state;
  const candidate = {
    ...current,
    volumeML: Math.max(0, current.volumeML - volumeML), // [mL] cumulative for the day
    marks: current.marks.filter((_, k) => k !== index), // [ms] epoch UTC
  };
  const stored = parseOrThrow(HydrationEntrySchema, candidate, 'removeDrink');
  return {
    ...state,
    hydration: { ...state.hydration, [profileId]: list.map((e) => (e === current ? stored : e)) },
  };
}
