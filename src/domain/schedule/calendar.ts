// src/domain/schedule/calendar.ts
//
// Projection: what each of the next N days would be if every scheduled session were completed
// in order. The projection never writes state and never reads a clock — the caller supplies
// the starting LocalDate, so the same arguments always give the same calendar.
//
// assignToday() is the "train something else today" reshuffle. It is a SWAP inside the current
// ISO week's remaining window, so the multiset of labels the week contains is unchanged; the
// displaced session lands exactly where the picked one was (P3 "Contract decisions this plan
// pins down", item 4 and the worked example under it — a swap, deliberately not a rotation).
//
// Every date argument is a LocalDate ("YYYY-MM-DD") in the profile's timezone, produced only
// by src/domain/dates.ts. Day counts are whole calendar days [d]; instants are epoch
// milliseconds, UTC [ms]. No Date object and no toISOString appears in this module.
//
// Two amendments to the P3 plan's Task 2 code, both driven by master §6.4 as amended
// ("remainingLabelsThisWeek returns exactly the labels assignToday can honour"):
//
//   1. assignToday throws RangeError when the label is not among the labels
//      remainingLabelsThisWeek reports for that day, where the plan's draft returned the
//      argument state unchanged. The two functions are now exact duals, and a caller that
//      offers a label the domain cannot honour fails loudly instead of appearing to work.
//   2. remainingLabelsThisWeek is empty on a day whose assignment is already terminal, since
//      assignToday can honour nothing there. The draft listed the week's labels and then
//      refused all of them.
//
// The window is also computed by projecting the rest of the week rather than by a second,
// parallel copy of the consumption rule, so the two can never disagree.

import { addDays, daysBetween, isoWeekday, weekEnd } from '../dates';
import { isPaused, isTerminal, upsertAssignment } from './cursor';
import type {
  AppState,
  AvailabilitySlot,
  IsoWeekday,
  LocalDate,
  PlanCursor,
  PlannedSession,
  PlanTemplate,
  SessionAssignment,
} from '../types';

export interface CalendarDay {
  date: LocalDate;
  slot: AvailabilitySlot | null;
  assignment: SessionAssignment | null;
  projectedSession: PlannedSession | null;
  paused: boolean;
}

/**
 * One slot per ISO weekday; the first declared wins. The schema permits two slots on the same
 * weekday, and a day is one training day whichever way the user filled the form, so a
 * duplicate must never consume a second session.
 */
function slotsByWeekday(state: AppState, profileId: string): Map<IsoWeekday, AvailabilitySlot> {
  const map = new Map<IsoWeekday, AvailabilitySlot>();
  for (const slot of state.availability[profileId]?.slots ?? []) {
    if (!map.has(slot.weekday)) map.set(slot.weekday, slot);
  }
  return map;
}

function assignmentsByDate(state: AppState, profileId: string): Map<LocalDate, SessionAssignment> {
  const map = new Map<LocalDate, SessionAssignment>();
  for (const a of state.assignments[profileId] ?? []) map.set(a.date, a);
  return map;
}

/**
 * The calendar for `days` days starting at `from`.
 *
 * @param days [d] whole calendar days, >= 0; 0 or negative gives an empty calendar.
 * @throws RangeError on a fractional or non-finite day count — 2.5 would silently mean 3 and
 *         Infinity would not terminate. Mirrors addDays' guard in src/domain/dates.ts.
 */
export function projectedCalendar(
  state: AppState,
  profileId: string,
  from: LocalDate,
  days: number,
): CalendarDay[] {
  if (!Number.isInteger(days)) {
    throw new RangeError(
      `projectedCalendar: day count must be a whole number, received ${String(days)}`,
    );
  }
  if (days <= 0) return [];

  const cursor = state.cursors[profileId] ?? null;
  const plan = cursor ? (state.plans[cursor.planId] ?? null) : null;
  const pauses = state.pauses[profileId] ?? [];
  const slots = slotsByWeekday(state, profileId);
  const byDate = assignmentsByDate(state, profileId);
  const byId = new Map<string, PlannedSession>();
  for (const s of plan?.sessions ?? []) byId.set(s.id, s);

  // [sessions] offset into plan.sessions; advanced by the days this walk projects, never by
  // the passage of time. The real cursor is untouched.
  let walk = cursor ? cursor.nextSessionIndex : 0;
  const out: CalendarDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i); // [d] offset from `from`
    const paused = isPaused(pauses, date);
    const slot = slots.get(isoWeekday(date)) ?? null;
    const assignment = byDate.get(date) ?? null;
    let projectedSession: PlannedSession | null = null;

    if (assignment) {
      // A recorded day is a fact: it shows the session it was given, whatever the slot says.
      projectedSession = byId.get(assignment.sessionId) ?? null;
      // A terminal day already advanced the real cursor, so the walk must not count it again.
      if (projectedSession && !isTerminal(assignment)) walk += 1;
    } else if (!paused && slot && plan) {
      projectedSession = plan.sessions[walk] ?? null;
      if (projectedSession) walk += 1;
    }

    out.push({ date, slot, assignment, projectedSession, paused });
  }
  return out;
}

/** True when this projected day took a session off the walk. */
function consumesASession(day: CalendarDay): boolean {
  if (day.projectedSession === null) return false;
  if (day.assignment !== null) return !isTerminal(day.assignment);
  return true;
}

/**
 * How many sessions the rest of this ISO week can absorb, counting `date` itself as one
 * because the user is choosing to train it — even on a day with no availability slot.
 *
 * Every later day is judged by the projection itself, so this can never drift from what
 * projectedCalendar would show.
 *
 * @returns [sessions] >= 1.
 */
function weekSpan(state: AppState, profileId: string, date: LocalDate): number {
  const daysLeft = daysBetween(date, weekEnd(date)) + 1; // [d] date .. Sunday inclusive, >= 1
  const week = projectedCalendar(state, profileId, date, daysLeft);
  let span = 1; // [sessions] today
  for (const day of week.slice(1)) {
    if (consumesASession(day)) span += 1;
  }
  return span;
}

/**
 * The current ISO week's remaining sequence: the contiguous index run
 * `[target, min(target + span - 1, last)]`, where `target` is the index today consumes and
 * `span` is the number of sessions the rest of the week can absorb. Null when there is
 * nothing today can be given: no cursor, no plan, the plan finished, or today already closed.
 */
interface SwapWindow {
  plan: PlanTemplate;
  cursor: PlanCursor;
  today: SessionAssignment | null;
  target: number; // [sessions] offset: the index today consumes
  end: number; // [sessions] offset: last index reachable inside this ISO week
}

function swapWindow(state: AppState, profileId: string, date: LocalDate): SwapWindow | null {
  const cursor = state.cursors[profileId];
  if (!cursor) return null;
  const plan = state.plans[cursor.planId];
  if (!plan) return null;
  const target = cursor.nextSessionIndex; // [sessions] offset
  if (target >= plan.sessions.length) return null; // plan finished
  const today = (state.assignments[profileId] ?? []).find((a) => a.date === date) ?? null;
  if (today && isTerminal(today)) return null; // a finished day is a record, not a choice
  const span = weekSpan(state, profileId, date); // [sessions]
  const end = Math.min(target + span - 1, plan.sessions.length - 1);
  return { plan, cursor, today, target, end };
}

/** The lowest index in the window whose session carries `label`, or -1. */
function pickIndex(w: SwapWindow, sessionLabel: string): number {
  for (let i = w.target; i <= w.end; i++) {
    if (w.plan.sessions[i]?.label === sessionLabel) return i;
  }
  return -1;
}

/**
 * Distinct labels `assignToday` will honour on `date`, in window order. Empty when the plan is
 * finished, the profile has no plan, or the day is already completed or skipped.
 */
export function remainingLabelsThisWeek(
  state: AppState,
  profileId: string,
  date: LocalDate,
): string[] {
  const w = swapWindow(state, profileId, date);
  if (!w) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = w.target; i <= w.end; i++) {
    const s = w.plan.sessions[i];
    if (!s || seen.has(s.label)) continue;
    seen.add(s.label);
    out.push(s.label);
  }
  return out;
}

/**
 * Train `sessionLabel` today. The picked label's first occurrence inside the current ISO
 * week's remaining sequence is transposed with the session at the cursor, and both ordinals
 * are rewritten so `plan.sessions[i].ordinal === i + 1` still holds across the whole plan. The
 * displaced session takes the picked one's place, so the week's label multiset — and the
 * plan's — is unchanged. Today's assignment is created or replaced, recording `sourceIndex`
 * for auditability. The cursor does not move: only completing or skipping advances it.
 *
 * @throws RangeError when `sessionLabel` is not one of
 *         `remainingLabelsThisWeek(state, profileId, date)`.
 */
export function assignToday(
  state: AppState,
  profileId: string,
  date: LocalDate,
  sessionLabel: string,
): AppState {
  const w = swapWindow(state, profileId, date);
  const pick = w ? pickIndex(w, sessionLabel) : -1;
  if (!w || pick < 0) {
    const offered = remainingLabelsThisWeek(state, profileId, date);
    throw new RangeError(
      `assignToday: ${JSON.stringify(sessionLabel)} is not among the sessions remaining on ` +
        `${date} (${offered.length > 0 ? offered.join(', ') : 'none'})`,
    );
  }

  let plan = w.plan;
  if (pick !== w.target) {
    const sessions = w.plan.sessions.slice();
    const atTarget = sessions[w.target];
    const atPick = sessions[pick];
    if (!atTarget || !atPick) {
      throw new RangeError(`assignToday: window [${w.target}, ${w.end}] is outside the plan`);
    }
    // Transpose, and restore the positional invariant sessions[i].ordinal === i + 1.
    sessions[w.target] = { ...atPick, ordinal: w.target + 1 };
    sessions[pick] = { ...atTarget, ordinal: pick + 1 };
    plan = { ...w.plan, sessions };
  }

  const chosen = plan.sessions[w.target];
  if (!chosen) {
    throw new RangeError(`assignToday: no session at index ${w.target}`);
  }
  const next: SessionAssignment = {
    date,
    sessionId: chosen.id,
    sourceIndex: w.target, // [sessions] offset the day was drawn from
    status: w.today?.status === 'in-progress' ? 'in-progress' : 'planned',
    startedAt: w.today?.startedAt ?? null, // [ms] epoch, UTC; a started day keeps its origin
    completedAt: null,
    skipReason: null,
  };

  return {
    ...state,
    // Only rewrite the plan map when the reorder actually changed the template, so a pick that
    // is already today's projection leaves plan identity — and any memoised selector — alone.
    plans: plan === w.plan ? state.plans : { ...state.plans, [plan.id]: plan },
    assignments: {
      ...state.assignments,
      [profileId]: upsertAssignment(state.assignments[profileId] ?? [], next),
    },
  };
}
