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
import {
  BodyMassEntrySchema,
  ExerciseSchema,
  LoggedSetSchema,
  SessionAssignmentSchema,
} from '../domain/schema';
import { parseOrThrow } from './validate';
import { compareLocalDate } from '../domain/dates';
import { EXERCISE_BY_ID } from '../domain/plan/library';
import {
  applySessionEdit,
  isEmptyEdits,
  type SessionEditOp,
} from '../domain/training/sessionEdits';
import { inventoryOf } from './funActions';
import { requireProfile } from './scheduleActions';
import type {
  AppState,
  BodyMassEntry,
  EpochMs,
  Exercise,
  LocalDate,
  LoggedSet,
  SessionAssignment,
  SessionEdits,
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
 * Audit C03: is this (profile, day, exercise, set number) already logged? The invariant every
 * reader assumes (ExerciseCard shows the first set per number and counts all of them), enforced
 * at the one place sets are written.
 */
export function slotTaken(
  state: AppState,
  set: Pick<LoggedSet, 'profileId' | 'assignmentDate' | 'exerciseId' | 'setNumber'>,
): boolean {
  return Object.values(state.sets).some(
    (s) =>
      s.profileId === set.profileId &&
      s.assignmentDate === set.assignmentDate &&
      s.exerciseId === set.exerciseId &&
      s.setNumber === set.setNumber,
  );
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
  opts: { allowFinished?: boolean } = {},
): AppState {
  // Amended contract (master plan section 6.7): every action that writes a record naming a
  // profile checks that the profile exists. `sets` is keyed by set id, so the schema's root
  // refinement cannot catch a set logged against a profile nobody owns; this is the only gate.
  requireProfile(state, 'logSet', input.profileId);
  const candidate: LoggedSet = { ...input, id, loggedAt: now };
  const loggedSet = parseOrThrow(LoggedSetSchema, candidate, 'logSet');
  // Audit C10: a finished day is a record. Train's "Add Forgotten Set" is the one explicit way in.
  const day = (state.assignments[loggedSet.profileId] ?? []).find(
    (a) => a.date === loggedSet.assignmentDate,
  );
  if (
    day !== undefined &&
    (day.status === 'completed' || day.status === 'skipped') &&
    opts.allowFinished !== true
  ) {
    throw new Error(`logSet: the session on ${loggedSet.assignmentDate} is already ${day.status}`);
  }
  if (slotTaken(state, loggedSet)) {
    throw new Error(
      `logSet: set ${String(loggedSet.setNumber)} of ${loggedSet.exerciseId} on ${loggedSet.assignmentDate} is already logged`,
    );
  }
  /*
   * P8. `totalSetsLogged` is the ordinal the specimen draw is keyed by (master plan section
   * 10.8, rule 1) and the counter the milestone toasts read, so it moves with the set list and
   * nothing else.
   *
   * The increment happens HERE, inside the transformer, computed from the state this call was
   * handed. Code review A46: it used to be computed in the view from a render closure, so two
   * sets logged in one React batch both read the same stale value and one of them vanished
   * from the count. A bodyweight set stores loadKg 0 and counts like any other (A60).
   */
  const inventory = inventoryOf(state.specimens, loggedSet.profileId);
  return {
    ...state,
    sets: { ...state.sets, [loggedSet.id]: loggedSet },
    specimens: {
      ...state.specimens,
      [loggedSet.profileId]: { ...inventory, totalSetsLogged: inventory.totalSetsLogged + 1 }, // [sets]
    },
  };
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
  /*
   * P8, code review A47: the counter tracks the REAL set count, so a delete takes it back
   * down. A counter that only ever rose drifted above the set list on every log-delete-log,
   * and the drift was permanent.
   *
   * Clamped at zero rather than allowed negative: documents migrated from the old console (an
   * import removed 2026-10-18, ROADMAP N5) had their counter recomputed from the set list, and a
   * set logged before that recount can still be deleted afterwards.
   */
  const inventory = inventoryOf(state.specimens, removed.profileId);
  const specimens = {
    ...state.specimens,
    [removed.profileId]: {
      ...inventory,
      totalSetsLogged: Math.max(0, inventory.totalSetsLogged - 1), // [sets]
    },
  };
  return { next: { ...state, sets, specimens }, removed };
}

/**
 * Puts a removed set back exactly as it was, id and `loggedAt` included. Undo restores the
 * record the user deleted, not a new record that looks like it.
 */
export function applyRestoreSet(state: AppState, loggedSet: LoggedSet): AppState {
  // Audit C03: the slot was filled again since the delete; undo restores nothing.
  if (slotTaken(state, loggedSet)) return state;
  /*
   * P8. The counter goes back up with the set. applyDeleteSet took it down, and undo restores
   * the record the user deleted, so leaving it down would put `totalSetsLogged` one BELOW the
   * real set count - the same drift A47 fixed, in the other direction.
   *
   * This cannot hand out a second card. The restored set reoccupies the ordinal it held, and
   * that ordinal is already recorded in `acquiredByOrdinal` if it ever drew one, so the next
   * draw for it returns the card it produced the first time (master plan section 10.8, rule 3).
   */
  const inventory = inventoryOf(state.specimens, loggedSet.profileId);
  return {
    ...state,
    sets: { ...state.sets, [loggedSet.id]: loggedSet },
    specimens: {
      ...state.specimens,
      [loggedSet.profileId]: { ...inventory, totalSetsLogged: inventory.totalSetsLogged + 1 }, // [sets]
    },
  };
}

/**
 * What an edit of a logged set may change (ROADMAP L1): the measurement and the unit it was
 * typed in. Everything else on a LoggedSet is the record's identity - which set of which
 * exercise on which day, when it was logged, whether it was bonus work - and an edit that moved
 * any of those would be a different set wearing this one's id.
 *
 * `rpe` (ROADMAP L8, the one-tap effort) is optional: absent keeps the stored effort, so an
 * edit that does not mention it cannot erase it; `null` clears it; a number records it.
 */
export type SetMeasurement = Pick<LoggedSet, 'loadKg' | 'reps' | 'durationS' | 'enteredUnit'> & {
  rpe?: LoggedSet['rpe']; // [RPE] dimensionless, 1-10 on the half-point grid, or null
};

/**
 * Rewrites the measurement of one logged set in place.
 *
 * `loggedAt` is kept: it records when the set was performed, and the history is ordered by
 * assignment date and set number anyway (sortSetHistory), so an edit cannot reorder it. The
 * specimen counter is not touched - the set count did not change - so no milestone or card can
 * be produced by an edit.
 *
 * Throws on an id that names no set rather than returning the state: the caller is showing the
 * user an edit form, and a silent no-op would let it report a save that never happened.
 *
 * @param m loadKg [kg] canonical (0 = bodyweight, A60), reps [repetitions] or null,
 *   durationS [s] or null, enteredUnit the unit the user typed in, rpe [RPE] when given.
 */
export function applyUpdateSet(state: AppState, id: string, m: SetMeasurement): AppState {
  const current = state.sets[id];
  if (current === undefined) {
    throw new Error(`updateSet: no logged set "${id}"; it may have been deleted`);
  }
  const candidate: LoggedSet = {
    ...current,
    loadKg: m.loadKg, // [kg]
    reps: m.reps, // [repetitions]
    durationS: m.durationS, // [s]
    enteredUnit: m.enteredUnit,
    rpe: m.rpe === undefined ? current.rpe : m.rpe, // [RPE] absent = keep
  };
  const edited = parseOrThrow(LoggedSetSchema, candidate, 'updateSet');
  return { ...state, sets: { ...state.sets, [id]: edited } };
}

/**
 * The exercises one profile can name: the shipped library overlaid by its own custom ones,
 * the same overlay the Train view renders cards from.
 */
export function profileLibrary(state: AppState, profileId: string): Record<string, Exercise> {
  const map: Record<string, Exercise> = { ...EXERCISE_BY_ID };
  for (const e of state.customExercises[profileId] ?? []) map[e.id] = e;
  return map;
}

/**
 * Applies one session edit (ROADMAP L2-L4) to the assignment on `date` and stores the result
 * as that assignment's `edits` (docs/design/session-editing.md).
 *
 * Refused, by throwing, when there is nothing it may change: an unknown profile, no session
 * assigned on the day, or a session already completed or skipped - the record of what was done
 * is the logged sets plus the lineup as it stood at Finish, and it is not rewritten afterwards.
 * The domain's own refusals (a slot that is gone, an exercise already in the session) pass
 * through with this action's name in front.
 *
 * When the edits are back to "nothing changed" the field is REMOVED rather than stored empty,
 * so a day that was edited and then restored is byte-identical to one that never was.
 *
 * The session slice is not read or written: a running rest timer keeps running.
 */
export function applyEditSession(
  state: AppState,
  profileId: string,
  date: LocalDate,
  op: SessionEditOp,
): AppState {
  requireProfile(state, 'editSession', profileId);
  const list = state.assignments[profileId] ?? [];
  const day = list.find((a) => a.date === date);
  if (day === undefined) {
    throw new Error(`editSession: no session is assigned on ${date}; start one from Today first`);
  }
  if (day.status === 'completed' || day.status === 'skipped') {
    throw new Error(`editSession: the session on ${date} is already ${day.status}`);
  }
  const cursor = state.cursors[profileId];
  const plan = cursor === undefined ? undefined : state.plans[cursor.planId];
  const session = plan?.sessions.find((s) => s.id === day.sessionId);
  if (session === undefined) {
    throw new Error(`editSession: session "${day.sessionId}" is not in the active plan`);
  }

  let next: SessionEdits;
  try {
    next = applySessionEdit(session, day.edits, op, profileLibrary(state, profileId));
  } catch (err) {
    throw new Error(`editSession: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }

  const candidate: SessionAssignment = { ...day, edits: next };
  if (isEmptyEdits(next)) delete candidate.edits;
  const stored = parseOrThrow(SessionAssignmentSchema, candidate, 'editSession');
  return {
    ...state,
    assignments: {
      ...state.assignments,
      [profileId]: list.map((a) => (a === day ? stored : a)),
    },
  };
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
 * Adds a user-defined exercise to one profile's library.
 *
 * Code review A26: the id is the caller's generated one (the store mints it with newId), never
 * a positional index. Deleting one custom exercise from a positionally-keyed list
 * re-attributed the next one's logged sets to it.
 *
 * The empty-name check is the schema's (`name: z.string().min(1)`), not a hand-written one:
 * the P4 plan asks for the rule to live in the schema wherever the schema already carries it.
 *
 * The id must be free, in both directions (P4 polish item 6). The Train view resolves an
 * exercise as EXERCISES overlaid with the profile's own, so a custom entry under a SHIPPED id
 * shadows that exercise everywhere: every set already logged against the real one would render
 * and progress against the user's copy of it, and the shipped record would be unreachable. A
 * duplicate within the profile is worse still - two records under one id make "which exercise
 * is this set against" unanswerable, and the answer would depend on array order. Both are
 * thrown rather than ignored, because the caller minted the id and a silent no-op would leave
 * it believing the exercise was added.
 *
 * Order matters: the profile guard runs first, then the schema, then the id. A caller passing
 * a bad profile AND a colliding id is told about the profile, which is the fault it can act on.
 */
export function applyAddCustomExercise(
  state: AppState,
  profileId: string,
  ex: Exercise,
): AppState {
  requireProfile(state, 'addCustomExercise', profileId);
  const exercise = parseOrThrow(ExerciseSchema, ex, 'addCustomExercise');
  const existing = state.customExercises[profileId] ?? [];
  if (EXERCISE_BY_ID[exercise.id] !== undefined) {
    throw new Error(
      `addCustomExercise: "${exercise.id}" is already an exercise in the shipped library`,
    );
  }
  if (existing.some((e) => e.id === exercise.id)) {
    throw new Error(
      `addCustomExercise: "${exercise.id}" is already a custom exercise of "${profileId}"`,
    );
  }
  return {
    ...state,
    customExercises: { ...state.customExercises, [profileId]: [...existing, exercise] },
  };
}
