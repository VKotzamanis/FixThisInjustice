// src/domain/fun/blocks.ts
//
// Where the plan CURSOR stands, which milestones a set count has just crossed, and what was
// done inside one block. Pure: no clock, no store, no React, so every rule below is asserted
// as arithmetic rather than through a render.
//
// Two code review findings are the reason this module exists at all.
//
// A61: the legacy cutscene was keyed to `s.week`, the Plan view's SCRUB position, and closing
// it wrote `lastPhaseSeen`. Dragging the week slider to week 20 in week 2 therefore fired the
// transition immediately, reported the statistics of a block not yet trained, and consumed the
// flag, after which no real transition could ever fire again. Everything here is keyed to
// PlanCursor.nextSessionIndex, which advances only when a session is completed or skipped;
// browsing cannot move it.
//
// A46: `MILESTONES.includes(newCount)` lost a milestone whenever the counter advanced by more
// than one between two reads. crossedMilestones works on the half-open interval instead, so a
// jump cannot step over one.
//
// Units: session indices are [sessions] offsets into PlanTemplate.sessions, counted from 0.
// Set counts are [sets]. Tonnage is [kg].

import type { AppState, PlanBlock, PlanCursor, PlanTemplate } from '../types';

/** Set counts that earn a milestone toast. Carried over from the legacy list unchanged. */
export const SET_MILESTONES: readonly number[] = [50, 100, 250, 500, 1000]; // [sets]

/**
 * The milestones inside the half-open interval (before, after].
 *
 * Half-open at the low end so a count that has already been announced is not announced again,
 * and closed at the high end so the milestone is reported by the read that reaches it. A
 * decreasing interval (a deleted set) yields nothing: the filter's lower bound is the higher
 * number, and nothing can be both above it and at or below the lower one.
 */
export function crossedMilestones(before: number, after: number): number[] {
  return SET_MILESTONES.filter((m) => m > before && m <= after);
}

/**
 * The block record the plan cursor stands in, or null for a plan that declares no blocks.
 *
 * A cursor before the first block's start belongs to the first block, and a cursor past the
 * end of the last one stays in the last: the cursor is a position in a programme that has a
 * beginning and an end, and neither edge is a block of its own.
 */
export function blockOf(cursor: PlanCursor, plan: PlanTemplate): PlanBlock | null {
  const blocks = plan.blocks;
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (first === undefined || last === undefined) return null;
  const i = cursor.nextSessionIndex; // [sessions] offset
  if (i < first.firstSessionIndex) return first;
  for (const b of blocks) {
    if (i >= b.firstSessionIndex && i < b.firstSessionIndex + b.sessionCount) return b;
  }
  // Cursor past the end of the plan: stay in the final block rather than inventing one.
  return last;
}

/**
 * The index of the block the plan cursor stands in.
 *
 * Derived from PlanCursor.nextSessionIndex for the A61 reason this file's header records. A
 * plan with no blocks answers 0, which is the index a single implicit block would carry: it is
 * a plan whose whole length is one undivided stretch, not an error.
 */
export function currentBlockIndex(plan: PlanTemplate, cursor: PlanCursor): number {
  return blockOf(cursor, plan)?.index ?? 0;
}

/**
 * True when `next` is a block ahead of `last`, which is the only direction a transition is due
 * in.
 *
 * Equality is false, so the same block cannot fire twice; a lower `next` is false as well,
 * because a cursor that moved back (an undone session) has not entered anything new and the
 * transition for the block it is re-entering has already been shown.
 */
export function isBlockBoundary(last: number, next: number): boolean {
  return next > last;
}

/**
 * The five slices blockStats reads.
 *
 * A structural subset of AppState rather than AppState itself, which is a WIDENING of the
 * plan's draft signature: every AppState still satisfies it, and the cutscene's gate can build
 * one from the individual store slices it subscribes to. Passing the whole document instead
 * would mean either a store selector that returns a fresh object on every call - an unbounded
 * re-render - or a getState() read the gate could not make reactive.
 */
export type BlockStatsSource = Pick<
  AppState,
  'cursors' | 'plans' | 'assignments' | 'sets' | 'specimens'
>;

export interface BlockStats {
  sessionsCompleted: number; // [sessions]
  setsLogged: number; // [sets]
  /** Sum of loadKg x reps over the block's logged sets. [kg] */
  tonnageKg: number;
  /** The whole collection, not the block's share: a card is acquired once and kept. */
  specimensOwned: number; // [cards]
}

/**
 * The work done inside one block.
 *
 * A LoggedSet carries an assignmentDate and a sessionId but no block, so the join runs through
 * SessionAssignment.sourceIndex, which is the index into PlanTemplate.sessions that the block
 * bounds are stated in. A set whose (date, sessionId) pair matches no assignment belongs to no
 * block and is counted in none.
 *
 * A set with loadKg 0 (bodyweight, code review A60) or a null load counts as a SET and adds
 * zero tonnage; it is never dropped. Dropping it would make "sets logged" disagree with the
 * count the specimen ordinal is keyed by.
 */
export function blockStats(
  state: BlockStatsSource,
  profileId: string,
  blockIndex: number,
): BlockStats {
  const empty: BlockStats = { sessionsCompleted: 0, setsLogged: 0, tonnageKg: 0, specimensOwned: 0 };
  const cursor = state.cursors[profileId];
  if (cursor === undefined) return empty;
  const plan = state.plans[cursor.planId];
  if (plan === undefined) return empty;
  const specimensOwned = Object.keys(state.specimens[profileId]?.acquired ?? {}).length;
  const block = plan.blocks.find((b) => b.index === blockIndex);
  if (block === undefined) return { ...empty, specimensOwned };

  const lo = block.firstSessionIndex; // [sessions] offset, inclusive
  const hi = block.firstSessionIndex + block.sessionCount; // [sessions] offset, exclusive
  const assignments = state.assignments[profileId] ?? [];
  const inBlock = assignments.filter((a) => a.sourceIndex >= lo && a.sourceIndex < hi);
  // (date, sessionId) is what a LoggedSet carries; the same session id can recur on other
  // days, so the date is part of the key rather than a second filter.
  const keys = new Set(inBlock.map((a) => `${a.date} ${a.sessionId}`));

  let setsLogged = 0; // [sets]
  let tonnageKg = 0; // [kg]
  for (const s of Object.values(state.sets)) {
    if (s.profileId !== profileId) continue;
    if (!keys.has(`${s.assignmentDate} ${s.sessionId}`)) continue;
    setsLogged += 1;
    tonnageKg += (s.loadKg ?? 0) * (s.reps ?? 0); // [kg] = [kg] x [repetitions]
  }

  return {
    sessionsCompleted: inBlock.filter((a) => a.status === 'completed').length,
    setsLogged,
    tonnageKg,
    specimensOwned,
  };
}
