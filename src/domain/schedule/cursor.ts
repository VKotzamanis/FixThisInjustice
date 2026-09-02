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
// Every function here is pure: it returns a new AppState and never mutates its argument. A
// transition with nothing to do returns the same state reference, so a caller may use
// identity to detect a no-op.

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

/** Insert or replace the assignment for its date, keeping the list sorted by date. */
export function upsertAssignment(
  list: SessionAssignment[],
  next: SessionAssignment,
): SessionAssignment[] {
  const i = list.findIndex((a) => a.date === next.date);
  if (i < 0) {
    return [...list, next].sort((a, b) => compareLocalDate(a.date, b.date));
  }
  const copy = list.slice();
  copy[i] = next;
  return copy;
}

export function nextSession(plan: PlanTemplate, cursor: PlanCursor): PlannedSession | null {
  if (cursor.planId !== plan.id) return null;
  return plan.sessions[cursor.nextSessionIndex] ?? null;
}

interface Resolved {
  cursor: PlanCursor;
  plan: PlanTemplate;
  assignments: SessionAssignment[];
}

function resolve(state: AppState, profileId: string): Resolved | null {
  const cursor = state.cursors[profileId];
  if (!cursor) return null;
  const plan = state.plans[cursor.planId];
  if (!plan) return null;
  return { cursor, plan, assignments: state.assignments[profileId] ?? [] };
}

/**
 * The assignment already recorded for `date`, or a fresh `planned` one taken from the
 * cursor. Returns null once the plan is finished (nothing is left to assign).
 */
function assignmentFor(r: Resolved, date: LocalDate): SessionAssignment | null {
  const existing = r.assignments.find((a) => a.date === date);
  if (existing) return existing;
  const session = r.plan.sessions[r.cursor.nextSessionIndex];
  if (!session) return null;
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
 * Advance by exactly one. `completedOn` is stamped by whichever transition — complete or
 * skip — pushes the index past the last session, and it records the LocalDate of that
 * session, never a clock reading.
 *
 * Note on a stale day: if the user closes out a day whose recorded `sourceIndex` is behind
 * the cursor (they completed a later day first), the recorded sourceIndex is left alone as a
 * historical fact and the cursor still advances by one, so the "one session, one advance"
 * accounting stays exact.
 */
function advanceCursor(cursor: PlanCursor, plan: PlanTemplate, date: LocalDate): PlanCursor {
  const nextIndex = cursor.nextSessionIndex + 1; // [sessions] offset
  return {
    ...cursor,
    nextSessionIndex: nextIndex,
    completedOn: nextIndex >= plan.sessions.length ? date : cursor.completedOn,
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
  const a = assignmentFor(r, date);
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
  const a = assignmentFor(r, date);
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
  const a = assignmentFor(r, date);
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
