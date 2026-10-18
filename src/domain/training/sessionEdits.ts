// src/domain/training/sessionEdits.ts
//
// Changing today's session while training (ROADMAP L2-L4, docs/design/session-editing.md).
// Pure: no store, no React, no clock. The store persists the result on the day's
// SessionAssignment (`edits`, optional) and the Train view renders `sessionLineup`.
//
// Units: set counts [sets], rest [s], rep ranges [repetitions]; every prescription and rest
// interval here comes from src/domain/plan/templates.ts and library.ts, never from a literal
// restated in this file (rule 2).
import { SPLIT_TEMPLATES, prescriptionFor, restSFor, slotIntensityOf } from '../plan/templates';
import { ACCESS_UNLOCKS } from '../types';
import type {
  EquipmentAccess,
  Exercise,
  PlannedExercise,
  PlannedSession,
  SessionEdits,
} from '../types';

/** No change: the plan as written. Never mutated; every transformer returns a fresh object. */
export const EMPTY_EDITS: SessionEdits = Object.freeze({
  swaps: Object.freeze({}) as Record<string, string>,
  skipped: Object.freeze([]) as unknown as string[],
  added: Object.freeze([]) as unknown as string[],
  order: Object.freeze([]) as unknown as string[],
});

/**
 * [sets] Set count of an exercise the plan never prescribed (an added or a logged-only card).
 * It is the default the Train view has always used for a bonus card, not a prescription derived
 * from anything: nothing about an unplanned exercise is known.
 */
export const UNPLANNED_SETS = 3;

/**
 * What a card in today's session is.
 *  planned      a plan slot, as written
 *  swapped      a plan slot whose exercise the user replaced for this session
 *  added        an exercise the user added this session (library or custom); bonus work
 *  swapped-out  the planned exercise of a swapped slot, shown because sets were logged on it
 *               today before the swap; its rows keep the slot's prescription
 *  logged       any other exercise with sets logged today that the lineup does not hold; bonus
 */
export type LineupKind = 'planned' | 'swapped' | 'added' | 'swapped-out' | 'logged';

export interface LineupEntry {
  /**
   * Card identity. For `planned`, `swapped` and `added` it is also the slot key an edit names:
   * the planned exerciseId, or the added exerciseId. The two read-only kinds carry a prefixed
   * key so they can never collide with a slot key.
   */
  key: string;
  /** What this card logs sets against. */
  exerciseId: string;
  /** The prescription the card renders: the plan's, the swap's re-prescription, or a default. */
  planned: PlannedExercise;
  kind: LineupKind;
  /** `swapped`: the planned exerciseId the slot was swapped away from. Null otherwise. */
  replaces: string | null;
  /** True when the user skipped this slot for this session. */
  skipped: boolean;
}

/** The edits a card can be the target of (`planned`, `swapped`, `added`). */
export function isEditable(e: LineupEntry): boolean {
  return e.kind === 'planned' || e.kind === 'swapped' || e.kind === 'added';
}

/**
 * True when sets on this card are bonus work (LoggedSet.isBonus): an exercise the plan never
 * prescribed for this slot. A swapped-in exercise fills a planned slot and is NOT bonus, so its
 * sets feed its own progression; see the design doc, "Derived numbers".
 */
export function isBonusEntry(e: LineupEntry): boolean {
  return e.kind === 'added' || e.kind === 'logged';
}

/** One edit, as the Train view asks for it. `key` is a slot key (see LineupEntry.key). */
export type SessionEditOp =
  | { kind: 'swap'; key: string; exerciseId: string }
  | { kind: 'skip'; key: string }
  | { kind: 'restore'; key: string }
  | { kind: 'move'; key: string; by: -1 | 1 };

/** Slot keys in the order the plan (then the user's additions) gives them. */
function defaultOrder(session: PlannedSession, e: SessionEdits): string[] {
  return [...session.exercises.map((p) => p.exerciseId), ...e.added];
}

/**
 * Slot keys in display order: the keys `e.order` names that still exist, then every other
 * key in default order. Tolerates a stale order (a key that is gone, a slot added since), so a
 * stored order can never hide a slot.
 */
function effectiveOrder(session: PlannedSession, e: SessionEdits): string[] {
  const all = defaultOrder(session, e);
  const named = e.order.filter((k, i) => all.includes(k) && e.order.indexOf(k) === i);
  return [...named, ...all.filter((k) => !named.includes(k))];
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

/**
 * The substitute's prescription for a planned slot. Set counts are the slot's volume decision
 * and are kept; the rep range is re-derived for what the substitute IS, at the slot's
 * intensity (a heavy press slot stays heavy, a push-up becomes AMRAP, a hold is timed), and the
 * rest comes from the one cited table.
 */
export function substitutePlanned(slot: PlannedExercise, sub: Exercise): PlannedExercise {
  const prescription = prescriptionFor(sub, slotIntensityOf(slot.prescription));
  return {
    exerciseId: sub.id,
    setsLo: slot.setsLo, // [sets]
    setsHi: slot.setsHi, // [sets]
    prescription,
    restS: restSFor(sub, prescription), // [s]
  };
}

/** The prescription of an exercise the plan never prescribed: the moderate default, 3 sets. */
export function unplannedSlot(ex: Exercise): PlannedExercise {
  const prescription = prescriptionFor(ex, 'moderate');
  return {
    exerciseId: ex.id,
    setsLo: UNPLANNED_SETS, // [sets]
    setsHi: UNPLANNED_SETS, // [sets]
    prescription,
    restS: restSFor(ex, prescription), // [s]
  };
}

export interface LineupInput {
  session: PlannedSession;
  edits: SessionEdits | undefined;
  /** Shipped library overlaid by the profile's custom exercises, keyed by id. */
  library: Readonly<Record<string, Exercise>>;
  /** Exercise ids with sets logged today (any order, duplicates allowed). */
  loggedExerciseIds: readonly string[];
}

/**
 * Today's session as the Train view renders it: the plan's slots with the user's edits
 * applied, plus a card for every exercise with sets logged today that the edited session no
 * longer holds, so no logged set is ever hidden by an edit.
 *
 * An id the library cannot resolve renders nothing, the rule the view has always applied.
 */
export function sessionLineup(input: LineupInput): LineupEntry[] {
  const { session, library, loggedExerciseIds } = input;
  const e = input.edits ?? EMPTY_EDITS;

  const skipped = new Set(e.skipped);
  const byKey = new Map<string, LineupEntry>();
  for (const planned of session.exercises) {
    const original = library[planned.exerciseId];
    if (original === undefined) continue;
    const subId = e.swaps[planned.exerciseId];
    const sub = subId === undefined ? undefined : library[subId];
    byKey.set(
      planned.exerciseId,
      sub === undefined
        ? {
            key: planned.exerciseId,
            exerciseId: planned.exerciseId,
            planned,
            kind: 'planned',
            replaces: null,
            skipped: skipped.has(planned.exerciseId),
          }
        : {
            key: planned.exerciseId,
            exerciseId: sub.id,
            planned: substitutePlanned(planned, sub),
            kind: 'swapped',
            replaces: planned.exerciseId,
            skipped: skipped.has(planned.exerciseId),
          },
    );
  }
  const slots = effectiveOrder(session, e).flatMap((k) => {
    const entry = byKey.get(k);
    return entry === undefined ? [] : [entry];
  });

  const shown = new Set(slots.map((s) => s.exerciseId));
  const logged = new Set(loggedExerciseIds);
  const out: LineupEntry[] = [];
  for (const slot of slots) {
    out.push(slot);
    // A swapped-out original with sets today stays on screen, next to the slot it left.
    if (slot.replaces !== null && logged.has(slot.replaces) && !shown.has(slot.replaces)) {
      const planned = session.exercises.find((p) => p.exerciseId === slot.replaces);
      if (planned !== undefined) {
        out.push({
          key: `logged:${slot.replaces}`,
          exerciseId: slot.replaces,
          planned,
          kind: 'swapped-out',
          replaces: null,
          skipped: false,
        });
        shown.add(slot.replaces);
      }
    }
  }

  for (const id of logged) {
    if (shown.has(id)) continue;
    const exercise = library[id];
    if (exercise === undefined) continue;
    out.push({
      key: `logged:${id}`,
      exerciseId: id,
      planned: unplannedSlot(exercise),
      kind: 'logged',
      replaces: null,
      skipped: false,
    });
    shown.add(id);
  }
  return out;
}

/** The exercise ids the edited session holds in its slots (planned, swapped, added). */
function idsInUse(session: PlannedSession, e: SessionEdits): Set<string> {
  const ids = new Set<string>();
  for (const p of session.exercises) ids.add(e.swaps[p.exerciseId] ?? p.exerciseId);
  for (const id of e.added) ids.add(id);
  return ids;
}

/**
 * Applies one edit and returns the next edits, or throws with what was wrong. The input is
 * never mutated. Refusals are the faults a stale screen can produce (a slot that is gone, an
 * exercise already on the card list), named so the store can report them.
 */
export function applySessionEdit(
  session: PlannedSession,
  current: SessionEdits | undefined,
  op: SessionEditOp,
  library: Readonly<Record<string, Exercise>>,
): SessionEdits {
  const e = current ?? EMPTY_EDITS;
  const plannedKeys = new Set(session.exercises.map((p) => p.exerciseId));

  switch (op.kind) {
    case 'swap': {
      if (!plannedKeys.has(op.key)) {
        throw new Error(`swap: "${op.key}" is not a planned exercise of this session`);
      }
      if (library[op.exerciseId] === undefined) {
        throw new Error(`swap: "${op.exerciseId}" is not a known exercise`);
      }
      const swaps = { ...e.swaps };
      if (op.exerciseId === op.key) {
        // Back to the plan: the slot carries no swap at all, not a swap to itself.
        delete swaps[op.key];
        return { ...e, swaps };
      }
      if (e.swaps[op.key] === op.exerciseId) return { ...e, swaps };
      if (idsInUse(session, e).has(op.exerciseId)) {
        throw new Error(`swap: "${op.exerciseId}" is already in this session`);
      }
      swaps[op.key] = op.exerciseId;
      return { ...e, swaps };
    }
    case 'skip': {
      if (!defaultOrder(session, e).includes(op.key)) {
        throw new Error(`skip: "${op.key}" is not in this session`);
      }
      return e.skipped.includes(op.key) ? { ...e } : { ...e, skipped: [...e.skipped, op.key] };
    }
    case 'restore': {
      if (!defaultOrder(session, e).includes(op.key)) {
        throw new Error(`restore: "${op.key}" is not in this session`);
      }
      return { ...e, skipped: e.skipped.filter((k) => k !== op.key) };
    }
    case 'move': {
      const keys = effectiveOrder(session, e);
      const i = keys.indexOf(op.key);
      if (i < 0) throw new Error(`move: "${op.key}" is not in this session`);
      const j = i + op.by;
      // Already at that end: nothing to move, and not an error (the control is disabled there).
      if (j < 0 || j >= keys.length) return { ...e };
      const moved = [...keys];
      moved[i] = keys[j] ?? op.key;
      moved[j] = op.key;
      // Back in default order: store none, so a restored day carries no `order` at all.
      return { ...e, order: sameOrder(moved, defaultOrder(session, e)) ? [] : moved };
    }
  }
}

/** True when the edits change nothing, so the store can drop the field entirely. */
export function isEmptyEdits(e: SessionEdits): boolean {
  return (
    Object.keys(e.swaps).length === 0 &&
    e.skipped.length === 0 &&
    e.added.length === 0 &&
    e.order.length === 0
  );
}

/**
 * The curated substitutes for an exercise: every other candidate of every split-template slot
 * that lists it, best first, in template order (2 to 6 days). These lists are the generator's
 * own "same movement, other equipment" tables (src/domain/plan/templates.ts), so a swap offers
 * what the plan itself would have prescribed in that slot.
 */
function templatePeers(id: string): string[] {
  const peers: string[] = [];
  for (const template of Object.values(SPLIT_TEMPLATES)) {
    for (const session of template.sessions) {
      for (const slot of session.slots) {
        if (!slot.candidates.includes(id)) continue;
        for (const c of slot.candidates) if (c !== id && !peers.includes(c)) peers.push(c);
      }
    }
  }
  return peers;
}

export interface SwapAlternativesInput {
  /** The PLANNED exercise of the slot (not its current substitute), whose intent the swap keeps. */
  original: Exercise;
  access: EquipmentAccess;
  /** Shipped library plus the profile's custom exercises. */
  library: readonly Exercise[];
  /** Exercise ids the session already holds, the slot's current one included. */
  inUse: ReadonlySet<string>;
}

/**
 * What to offer when the user swaps a slot (ROADMAP L2).
 *
 * `suggested`, best first: the planned exercise itself when the slot has been swapped away
 * from it; then the template peers; then any library exercise sharing a DIRECT mover
 * (`muscleGroups`, counted 1.0 set) with the planned one. Only exercises the user's equipment
 * unlocks (ACCESS_UNLOCKS) are suggested. `others`: everything else in the library, custom
 * exercises included, for the gym that has what the profile says it does not.
 *
 * Nothing already in the session is offered: one exercise is one card.
 */
export function swapAlternatives(input: SwapAlternativesInput): {
  suggested: Exercise[];
  others: Exercise[];
} {
  const { original, access, library, inUse } = input;
  const byId = new Map(library.map((e) => [e.id, e]));
  const unlocked = ACCESS_UNLOCKS[access];
  const fits = (e: Exercise): boolean => e.equipment.some((tier) => unlocked.includes(tier));
  const sharesDirectMover = (e: Exercise): boolean =>
    e.muscleGroups.some((m) => original.muscleGroups.includes(m));

  const ranked = [
    original.id,
    ...templatePeers(original.id),
    ...library.filter((e) => e.id !== original.id && sharesDirectMover(e)).map((e) => e.id),
  ];
  const suggested: Exercise[] = [];
  const taken = new Set<string>();
  for (const id of ranked) {
    if (taken.has(id) || inUse.has(id)) continue;
    const e = byId.get(id);
    if (e === undefined || !fits(e)) continue;
    suggested.push(e);
    taken.add(id);
  }
  const others = library.filter((e) => !taken.has(e.id) && !inUse.has(e.id));
  return { suggested, others };
}
