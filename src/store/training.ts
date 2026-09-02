// src/store/training.ts
//
// Pure AppState transformers for the P4 log actions. No React, no I/O, no localStorage: code
// review A41 makes the store the only writer, and this file is the only place that decides
// what a log action does to the document. src/store/index.ts adds the wiring and nothing else.
//
// Every write goes through the schema that guards the loader (security constraint 1: nothing
// enters the store unvalidated), so a value the document could not be reloaded with is refused
// at the point it is logged rather than at the user's next reload.
//
// Units, per master plan section 3: mass [kg], volume [mL], duration [s], instants [ms] epoch
// UTC. Nothing derived is stored (A28).
import { z } from 'zod';
import {
  BodyMassEntrySchema,
  ExerciseSchema,
  HydrationEntrySchema,
  LoggedSetSchema,
} from '../domain/schema';
import { compareLocalDate } from '../domain/dates';
import { requireProfile } from './scheduleActions';
import type {
  AppState,
  BodyMassEntry,
  EpochMs,
  Exercise,
  LocalDate,
  LoggedSet,
  ML,
} from '../domain/types';

/**
 * [ms] How long a deleted set stays restorable.
 *
 * Six seconds is the window the P4 plan fixes for the undo control; the buffer lives in the
 * non-persisted session slice, so it dies with the tab and can never restore a set from a
 * previous session (src/store/sessionMirror.ts).
 */
export const UNDO_WINDOW_MS = 6_000;

/**
 * Validates against a schema or throws, naming the field that failed.
 *
 * The message is assembled the way parseState assembles its own — first issue, path then
 * reason — rather than from `error.message`, which in Zod 4 is the serialised issue array and
 * reads as a wall of JSON in a thrown Error.
 */
function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown, what: string): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  const where = first === undefined ? '(root)' : first.path.join('.') || '(root)';
  const why = first === undefined ? 'unknown validation failure' : first.message;
  throw new Error(`${what}: ${where}: ${why}`);
}

/**
 * Stores one logged set under `id`.
 *
 * Only the section 5 fields are stored. Code review A28: the legacy froze the exercise name,
 * both rep-range bounds, the suggestion and the lifetime best into every set, roughly a 5x
 * multiplier on the largest table in the store, and every one of those values went stale the
 * moment the plan or the history changed. They are all derivable, so they are derived.
 *
 * @param now [ms] epoch UTC, the instant the set was logged; supplied by the caller, never
 *   read from a clock here.
 */
export function applyLogSet(
  state: AppState,
  input: Omit<LoggedSet, 'id' | 'loggedAt'>,
  id: string,
  now: EpochMs,
): AppState {
  // Amended contract (master plan section 6.7): every action that writes a record naming a
  // profile checks that the profile exists. `sets` is keyed by set id, so the schema's root
  // refinement cannot catch a set logged against a profile nobody owns; this is the only gate.
  requireProfile(state, 'logSet', input.profileId);
  const candidate: LoggedSet = { ...input, id, loggedAt: now };
  const loggedSet = parseOrThrow(LoggedSetSchema, candidate, 'logSet');
  return { ...state, sets: { ...state.sets, [loggedSet.id]: loggedSet } };
}

/**
 * Removes one set and hands it back, so the caller can hold it in the undo buffer.
 *
 * Returns the argument unchanged (by identity, which the store reads as "no write") when the
 * id names nothing: a delete of an already-deleted set is not an error, and it must not mint
 * an undo buffer holding null.
 */
export function applyDeleteSet(
  state: AppState,
  id: string,
): { next: AppState; removed: LoggedSet | null } {
  const removed = state.sets[id] ?? null;
  if (removed === null) return { next: state, removed: null };
  const sets = { ...state.sets };
  delete sets[id];
  return { next: { ...state, sets }, removed };
}

/**
 * Puts a removed set back exactly as it was, id and `loggedAt` included. Undo restores the
 * record the user deleted, not a new record that looks like it.
 */
export function applyRestoreSet(state: AppState, loggedSet: LoggedSet): AppState {
  return { ...state, sets: { ...state.sets, [loggedSet.id]: loggedSet } };
}

/**
 * Appends a body-mass entry and keeps the profile's list in civil-date order, which every
 * reader (the trend chart, latestBodyMassEntry) is entitled to assume.
 *
 * @param now [ms] epoch UTC, the instant the weigh-in was entered.
 */
export function applyLogBodyMass(
  state: AppState,
  input: Omit<BodyMassEntry, 'id' | 'loggedAt'>,
  id: string,
  now: EpochMs,
): AppState {
  requireProfile(state, 'logBodyMass', input.profileId);
  const entry = parseOrThrow(BodyMassEntrySchema, { ...input, id, loggedAt: now }, 'logBodyMass');
  const existing = state.bodyMass[entry.profileId] ?? [];
  // Sorted by date only: two weigh-ins on one civil day keep insertion order, and
  // latestBodyMassEntry breaks that tie by `loggedAt` rather than by position.
  const merged = [...existing, entry].sort((a, b) => compareLocalDate(a.date, b.date));
  return { ...state, bodyMass: { ...state.bodyMass, [entry.profileId]: merged } };
}

/**
 * Records one drink: upsert by civil date, adding the volume and appending the instant.
 *
 * One entry per local day (HydrationEntry is keyed by profile and date, master plan section 5),
 * so a second drink on the same day accumulates rather than creating a second row. The marks
 * are kept because the in-session cue needs to know when the user last drank; the daily total
 * alone cannot say that.
 *
 * @param volumeML [mL] the volume just drunk, a non-negative integer (schema-checked).
 * @param now [ms] epoch UTC, the instant of the drink.
 */
export function applyAddHydration(
  state: AppState,
  profileId: string,
  date: LocalDate,
  volumeML: ML,
  now: EpochMs,
): AppState {
  requireProfile(state, 'addHydration', profileId);
  const existing = state.hydration[profileId] ?? [];
  const current = existing.find((e) => e.date === date) ?? null;
  const candidate = {
    profileId,
    date,
    volumeML: (current?.volumeML ?? 0) + volumeML, // [mL] cumulative for the local day
    marks: [...(current?.marks ?? []), now], // [ms] epoch UTC, one per drink
  };
  // Validated as the WHOLE entry rather than as the increment, so a negative or fractional
  // increment is caught by the same bound that guards the stored total.
  const entry = parseOrThrow(HydrationEntrySchema, candidate, 'addHydration');
  const merged =
    current === null ? [...existing, entry] : existing.map((e) => (e.date === date ? entry : e));
  return { ...state, hydration: { ...state.hydration, [profileId]: merged } };
}

/**
 * Adds a user-defined exercise to one profile's library.
 *
 * Code review A26: the id is the caller's generated one (the store mints it with newId), never
 * a positional index. Deleting one custom exercise from a positionally-keyed list
 * re-attributed the next one's logged sets to it.
 *
 * The empty-name check is the schema's (`name: z.string().min(1)`), not a hand-written one:
 * the P4 plan asks for the rule to live in the schema wherever the schema already carries it.
 */
export function applyAddCustomExercise(
  state: AppState,
  profileId: string,
  ex: Exercise,
): AppState {
  requireProfile(state, 'addCustomExercise', profileId);
  const exercise = parseOrThrow(ExerciseSchema, ex, 'addCustomExercise');
  const existing = state.customExercises[profileId] ?? [];
  return {
    ...state,
    customExercises: { ...state.customExercises, [profileId]: [...existing, exercise] },
  };
}
