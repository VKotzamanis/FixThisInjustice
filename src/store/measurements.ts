// src/store/measurements.ts
//
// Pure AppState transformers for correcting measurements (spec R9, audit G03). No React, no
// I/O. Every write is parsed with the loader's schema (spec R5), so a refusal throws before the
// store's set() and writes nothing. Units: mass [kg], instants [ms] epoch UTC.
import { compareLocalDate } from '../domain/dates';
import { BodyMassEntrySchema } from '../domain/schema';
import type {
  AppState,
  BodyMassEntry,
  BodyMassRole,
  Kg,
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

