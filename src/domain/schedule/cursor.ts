// src/domain/schedule/cursor.ts
//
// The plan cursor is the single authority on programme position. It advances by exactly one
// when a session is completed or explicitly skipped, and never on the passage of time.
// This replaces the legacy calendar-derived programPosition() (code review A11), the
// unread s.skipped map (A62), and the three competing definitions of "done" (A63).
//
// Every date argument is a LocalDate ("YYYY-MM-DD") in the profile's timezone, produced only
// by src/domain/dates.ts. Instants (EpochMs) are epoch milliseconds, UTC. No Date objects
// and no toISOString appear in this module.
//
// Every function here is pure, with one exception: it returns a new AppState, never mutates
// its argument, and depends on nothing but its arguments — except pausePlan, which draws a
// fresh identifier from newId() (crypto.randomUUID) and so is not reproducible. A transition
// with nothing to do returns the same state reference, so a caller may use identity to detect
// a no-op.
//
// startSession, completeSession and skipSession throw rather than return a state when they
// would have to materialise a NEW assignment for a day the plan cannot open: a paused day, or
// any day while another is still open. A day that already carries an assignment is never
// blocked — whatever was started can always be finished. See assignmentFor.

import { compareLocalDate } from '../dates';
import { newId } from '../ids';
import type {
  AppState,
  EpochMs,
  LocalDate,
  PlanCursor,
  PlannedSession,
  PlanPause,
  PlanTemplate,
  SessionAssignment,
} from '../types';

/**
 * A pause covers the half-open local-date interval [from, to):
 * `from` is the first paused day and `to` is the first day the plan is active again.
 * `to === null` means the pause is still open.
 */
export function isPaused(pauses: PlanPause[], date: LocalDate): boolean {
  return pauses.some(
    (p) =>
      compareLocalDate(p.from, date) <= 0 && (p.to === null || compareLocalDate(date, p.to) < 0),
  );
}

/** A terminal assignment has already moved the cursor; it is never advanced twice. */
export function isTerminal(a: SessionAssignment): boolean {
  return a.status === 'completed' || a.status === 'skipped';
}

/**
 * Insert or replace the assignment for its date. The returned list is sorted by date on both
 * branches: calendar.ts's assignToday writes through this function, and a document persisted
 * by an older build can arrive in any order, so the replace branch cannot assume its input was
 * already sorted. The argument is never mutated.
 */
export function upsertAssignment(
  list: SessionAssignment[],
  next: SessionAssignment,
): SessionAssignment[] {
  const i = list.findIndex((a) => a.date === next.date);
  const merged = i < 0 ? [...list, next] : list.map((a, j) => (j === i ? next : a));
  return merged.sort((a, b) => compareLocalDate(a.date, b.date));
}

export function nextSession(plan: PlanTemplate, cursor: PlanCursor): PlannedSession | null {
  if (cursor.planId !== plan.id) return null;
  return plan.sessions[cursor.nextSessionIndex] ?? null;
}

interface Resolved {
  cursor: PlanCursor;
  plan: PlanTemplate;
  assignments: SessionAssignment[];
  pauses: PlanPause[];
}

function resolve(state: AppState, profileId: string): Resolved | null {
  const cursor = state.cursors[profileId];
  if (!cursor) return null;
  const plan = state.plans[cursor.planId];
  if (!plan) return null;
  return {
    cursor,
    plan,
    assignments: state.assignments[profileId] ?? [],
    pauses: state.pauses[profileId] ?? [],
  };
}

/**
 * The assignment already recorded for `date`, or a fresh `planned` one taken from the
 * cursor. Returns null once the plan is finished (nothing is left to assign, so the caller is
 * a no-op rather than an error).
 *
 * Materialising a fresh assignment is gated, and both gates throw with `fn` naming the caller:
 *   1. the plan is paused on `date` — a paused day holds no session at all;
 *   2. some other day is still open (non-terminal) — at most one assignment is open per
 *      profile, so the user cannot accumulate half-finished days that each claim a session.
 * The pause is checked first: it is the wider condition and the more actionable message.
 *
 * Neither gate can reach a day that already has an assignment, so a session started before a
 * pause began, or the single open day itself, is always free to complete or skip.
 */
function assignmentFor(r: Resolved, date: LocalDate, fn: string): SessionAssignment | null {
  const existing = r.assignments.find((a) => a.date === date);
  if (existing) return existing;
  const session = r.plan.sessions[r.cursor.nextSessionIndex];
  if (!session) return null;
  if (isPaused(r.pauses, date)) {
    throw new Error(`${fn}: the plan is paused on ${date}`);
  }
  const open = r.assignments.find((a) => !isTerminal(a));
  if (open) {
    throw new Error(`${fn}: a session is already in progress on ${open.date}`);
  }
  return {
    date,
    sessionId: session.id,
    sourceIndex: r.cursor.nextSessionIndex,
    status: 'planned',
    startedAt: null,
    completedAt: null,
    skipReason: null,
  };
}

/**
 * Advance by exactly one, clamped at the end of the plan: `nextSessionIndex` never exceeds
 * plan.sessions.length, the one-past-the-last position that means "finished". Without the
 * clamp a day left in progress and closed out after the rest of the plan already finished
 * pushes the index to length + 1, which reads as a programme longer than the plan it came
 * from (day 7 of 6).
 *
 * `completedOn` is stamped once, by whichever transition — complete or skip — first pushes the
 * index to that end position, and it records the LocalDate of that session, never a clock
 * reading. A later transition on a stale day never rewrites it.
 *
 * Note on a stale day: if the user closes out a day whose recorded `sourceIndex` is behind
 * the cursor (they completed a later day first), the recorded sourceIndex is left alone as a
 * historical fact and the cursor still advances by one, so the "one session, one advance"
 * accounting stays exact.
 */
function advanceCursor(cursor: PlanCursor, plan: PlanTemplate, date: LocalDate): PlanCursor {
  const end = plan.sessions.length; // [sessions] one past the last index
  const nextIndex = Math.min(cursor.nextSessionIndex + 1, end); // [sessions] offset, clamped
  return {
    ...cursor,
    nextSessionIndex: nextIndex,
    completedOn: cursor.completedOn ?? (nextIndex >= end ? date : null),
  };
}

function withAssignment(
  state: AppState,
  profileId: string,
  assignments: SessionAssignment[],
  next: SessionAssignment,
): AppState['assignments'] {
  return { ...state.assignments, [profileId]: upsertAssignment(assignments, next) };
}

export function startSession(
  state: AppState,
  profileId: string,
  date: LocalDate,
  now: EpochMs, // [ms] epoch, UTC
): AppState {
  const r = resolve(state, profileId);
  if (!r) return state;
  const a = assignmentFor(r, date, 'startSession');
  if (!a || isTerminal(a)) return state;
  const next: SessionAssignment = {
    ...a,
    status: 'in-progress',
    startedAt: a.startedAt ?? now, // first start wins; a resumed session keeps its origin
  };
  return { ...state, assignments: withAssignment(state, profileId, r.assignments, next) };
}

export function completeSession(
  state: AppState,
  profileId: string,
  date: LocalDate,
  now: EpochMs, // [ms] epoch, UTC
): AppState {
  const r = resolve(state, profileId);
  if (!r) return state;
  const a = assignmentFor(r, date, 'completeSession');
  if (!a || isTerminal(a)) return state;
  const next: SessionAssignment = { ...a, status: 'completed', completedAt: now };
  return {
    ...state,
    assignments: withAssignment(state, profileId, r.assignments, next),
    cursors: { ...state.cursors, [profileId]: advanceCursor(r.cursor, r.plan, date) },
  };
}

export function skipSession(
  state: AppState,
  profileId: string,
  date: LocalDate,
  reason: string | null,
): AppState {
  const r = resolve(state, profileId);
  if (!r) return state;
  const a = assignmentFor(r, date, 'skipSession');
  if (!a || isTerminal(a)) return state;
  const next: SessionAssignment = { ...a, status: 'skipped', skipReason: reason };
  return {
    ...state,
    assignments: withAssignment(state, profileId, r.assignments, next),
    cursors: { ...state.cursors, [profileId]: advanceCursor(r.cursor, r.plan, date) },
  };
}

export function pausePlan(
  state: AppState,
  profileId: string,
  from: LocalDate,
  reason: string | null,
): AppState {
  const list = state.pauses[profileId] ?? [];
  if (list.some((p) => p.to === null)) return state; // already paused: no-op
  const pause: PlanPause = { id: newId(), from, to: null, reason };
  return { ...state, pauses: { ...state.pauses, [profileId]: [...list, pause] } };
}

/**
 * Close the open pause at `to`, the first active day again. `to === from` is an empty pause:
 * [from, from) covers no days, so isPaused is false everywhere and a user who paused and
 * resumed on the same day was never paused. That is recorded rather than refused, so a
 * mistaken pause is undone by resuming on the day it started.
 */
export function resumePlan(state: AppState, profileId: string, to: LocalDate): AppState {
  const list = state.pauses[profileId] ?? [];
  const i = list.findIndex((p) => p.to === null);
  if (i < 0) return state; // not paused: no-op
  const open = list[i];
  if (!open) return state;
  // A resume earlier than the pause start would be a negative interval; clamp to zero length.
  const end = compareLocalDate(to, open.from) < 0 ? open.from : to;
  const copy = list.slice();
  copy[i] = { ...open, to: end };
  return { ...state, pauses: { ...state.pauses, [profileId]: copy } };
}
