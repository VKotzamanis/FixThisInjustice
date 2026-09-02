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
// Amendments to the P3 plan's Task 2 code, all driven by master §6.4 as amended
// ("remainingLabelsThisWeek returns exactly the labels assignToday can honour", plus the
// cursor invariants: at most one open assignment per profile, and nothing materialises on a
// paused day):
//
//   1. assignToday throws RangeError when the label is not among the labels
//      remainingLabelsThisWeek reports for that day, where the plan's draft returned the
//      argument state unchanged. The two functions are now exact duals, and a caller that
//      offers a label the domain cannot honour fails loudly instead of appearing to work.
//   2. remainingLabelsThisWeek is empty on a day whose assignment is already terminal, since
//      assignToday can honour nothing there. The draft listed the week's labels and then
//      refused all of them.
//   3. assignToday materialises an assignment, so it carries the cursor's own gates
//      (cursor.ts assignmentFor): a paused day, a day whose session has already started, and
//      any day while ANOTHER day is still open are all refused. Without them a pick wrote a
//      second open assignment claiming the same cursor index, and the week then delivered one
//      session twice and another never — the multiset the reorder exists to preserve.
//   4. assignToday accepts only the day the projection serves cursor.nextSessionIndex on. A
//      pick on any other day wrote a session the calendar does not place there.
//   5. The reshuffled plan is stored under cursor.planId, the key every read in this module
//      resolves the plan by, not under plan.id.
//
// Every refusal is shared with remainingLabelsThisWeek through one predicate (gateReason), so
// the two cannot drift: the labels offered are exactly the labels honoured.
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
 * How many sessions the rest of this ISO week can absorb, counting `date` itself as one: it is
 * only ever asked about a day the projection already serves (see gateReason's fourth rule), so
 * the count is the number of consuming days in [date, Sunday].
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
 * The first day, from `date` onward inside its ISO week, that takes a session off the walk —
 * the day the plan serves `cursor.nextSessionIndex` on. The projection's walk starts at the
 * cursor, so its first consuming day is by construction the day that index lands on. Null when
 * the rest of the week serves nothing at all: a weekend tail, or a week entirely paused.
 */
function nextServedDate(state: AppState, profileId: string, date: LocalDate): LocalDate | null {
  const daysLeft = daysBetween(date, weekEnd(date)) + 1; // [d] date .. Sunday inclusive, >= 1
  const week = projectedCalendar(state, profileId, date, daysLeft);
  return week.find(consumesASession)?.date ?? null;
}

/**
 * Why `date` refuses a pick — the tail of assignToday's message — or null when it accepts one.
 * remainingLabelsThisWeek is empty for exactly these days, so the two functions stay exact
 * duals (master §6.4 as amended).
 *
 * The first three rules are the cursor's own (cursor.ts assignmentFor). assignToday
 * materialises an assignment just as startSession does, so it has to obey them or it opens a
 * session behind the cursor's back. The order is the cursor's too: the pause is the widest
 * condition and the most actionable message, so it is reported first.
 *
 *   1. paused day — a paused day holds no session at all;
 *   2. already started — a reshuffle would swap the exercises out from under a session the
 *      user is logging. The UI offers "train other" before Start, never after;
 *   3. another day open — at most one assignment is non-terminal per profile, so a pick may
 *      not open a second day that claims the same cursor index;
 *   4. not the served day — the pick writes the session at cursor.nextSessionIndex, so it may
 *      only be written on the day the projection places that index on.
 *
 * Rule 4 subsumes the pause for `date` itself (a paused day serves nothing), but the pause is
 * still tested first because "the plan is paused" tells the caller what to do about it.
 */
function gateReason(state: AppState, profileId: string, date: LocalDate): string | null {
  if (isPaused(state.pauses[profileId] ?? [], date)) {
    return `the plan is paused on ${date}`;
  }
  const assignments = state.assignments[profileId] ?? [];
  const today = assignments.find((a) => a.date === date) ?? null;
  if (today?.status === 'in-progress') {
    return `session already started on ${date}`;
  }
  const open = assignments.find((a) => a.date !== date && !isTerminal(a));
  if (open) {
    return `a session is already open on ${open.date}`;
  }
  if (nextServedDate(state, profileId, date) !== date) {
    return `${date} is not the next session day`;
  }
  return null;
}

/**
 * The current ISO week's remaining sequence: the contiguous index run
 * `[target, min(target + span - 1, last)]`, where `target` is the index today consumes and
 * `span` is the number of sessions the rest of the week can absorb. Null when there is
 * nothing today can be given: no cursor, no plan, the plan finished, today already closed, or
 * any gateReason refusal.
 */
interface SwapWindow {
  plan: PlanTemplate;
  cursor: PlanCursor;
  today: SessionAssignment | null;
  target: number; // [sessions] offset: the index today consumes
  end: number; // [sessions] offset: last index reachable inside this ISO week
}

/** Everything the window needs that does not depend on the rest of the week. */
type WindowBase = Omit<SwapWindow, 'end'>;

/** Null when the plan has nothing to give on `date`, before any gate is consulted. */
function windowBase(state: AppState, profileId: string, date: LocalDate): WindowBase | null {
  const cursor = state.cursors[profileId];
  if (!cursor) return null;
  const plan = state.plans[cursor.planId];
  if (!plan) return null;
  const target = cursor.nextSessionIndex; // [sessions] offset
  if (target >= plan.sessions.length) return null; // plan finished
  const today = (state.assignments[profileId] ?? []).find((a) => a.date === date) ?? null;
  if (today && isTerminal(today)) return null; // a finished day is a record, not a choice
  return { plan, cursor, today, target };
}

function withSpan(
  state: AppState,
  profileId: string,
  date: LocalDate,
  base: WindowBase,
): SwapWindow {
  const span = weekSpan(state, profileId, date); // [sessions] >= 1
  return { ...base, end: Math.min(base.target + span - 1, base.plan.sessions.length - 1) };
}

function swapWindow(state: AppState, profileId: string, date: LocalDate): SwapWindow | null {
  const base = windowBase(state, profileId, date);
  if (!base) return null;
  if (gateReason(state, profileId, date) !== null) return null;
  return withSpan(state, profileId, date, base);
}

/** The refusal for a label this day cannot place, naming what it could have placed instead. */
function notOffered(
  state: AppState,
  profileId: string,
  date: LocalDate,
  sessionLabel: string,
): RangeError {
  const offered = remainingLabelsThisWeek(state, profileId, date);
  return new RangeError(
    `assignToday: ${JSON.stringify(sessionLabel)} is not among the sessions remaining on ` +
      `${date} (${offered.length > 0 ? offered.join(', ') : 'none'})`,
  );
}

/** The lowest index in the window whose session carries `label`, or -1. */
function pickIndex(w: SwapWindow, sessionLabel: string): number {
  for (let i = w.target; i <= w.end; i++) {
    if (w.plan.sessions[i]?.label === sessionLabel) return i;
  }
  return -1;
}

/**
 * The DISTINCT labels `assignToday` will honour on `date`, in window order: a label the week
 * offers twice is listed once, because one pick can only place one of them today.
 *
 * Empty — the day offers no choice at all — when the profile has no cursor or no plan, the
 * plan is finished, the day is already completed or skipped, the plan is PAUSED on it, its
 * session is already IN PROGRESS, another day is still open, or the projection does not serve
 * the cursor's next session on it. These are exactly assignToday's refusals (gateReason), so
 * a caller that offers this list can never offer a label the domain then refuses.
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

/** Field-by-field equality, so a pick that changes nothing can be detected before writing. */
function sameAssignment(a: SessionAssignment, b: SessionAssignment): boolean {
  return (
    a.date === b.date &&
    a.sessionId === b.sessionId &&
    a.sourceIndex === b.sourceIndex &&
    a.status === b.status &&
    a.startedAt === b.startedAt &&
    a.completedAt === b.completedAt &&
    a.skipReason === b.skipReason
  );
}

/**
 * Train `sessionLabel` today. The picked label's first occurrence inside the current ISO
 * week's remaining sequence is transposed with the session at the cursor, and both ordinals
 * are rewritten so `plan.sessions[i].ordinal === i + 1` still holds across the whole plan. The
 * displaced session takes the picked one's place, so the week's label multiset — and the
 * plan's — is unchanged. Today's assignment is created or replaced, recording `sourceIndex`
 * for auditability. The cursor does not move: only completing or skipping advances it.
 *
 * A pick that changes nothing — the label already at the cursor, already recorded on `date` —
 * returns the argument state itself, so a caller may use identity to detect a no-op exactly as
 * it may with cursor.ts's transitions.
 *
 * @throws RangeError when `date` refuses a pick (see `remainingLabelsThisWeek`: paused,
 *         already started, another day open, or not the day the projection serves next), or
 *         when `sessionLabel` is not one of
 *         `remainingLabelsThisWeek(state, profileId, date)`.
 */
export function assignToday(
  state: AppState,
  profileId: string,
  date: LocalDate,
  sessionLabel: string,
): AppState {
  const base = windowBase(state, profileId, date);
  if (!base) throw notOffered(state, profileId, date, sessionLabel);
  const blocked = gateReason(state, profileId, date);
  if (blocked !== null) throw new RangeError(`assignToday: ${blocked}`);

  const w = withSpan(state, profileId, date, base);
  const pick = pickIndex(w, sessionLabel);
  if (pick < 0) throw notOffered(state, profileId, date, sessionLabel);

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
    // An in-progress day is refused above and a terminal day opens no window, so the only
    // assignment that can survive to here is a planned one.
    status: 'planned',
    startedAt: w.today?.startedAt ?? null, // [ms] epoch, UTC; carried rather than discarded
    completedAt: null,
    skipReason: null,
  };

  // A true no-op: no reorder, and today already carries exactly this assignment.
  if (plan === w.plan && w.today !== null && sameAssignment(w.today, next)) return state;

  return {
    ...state,
    // Only rewrite the plan map when the reorder actually changed the template, so a pick that
    // is already today's projection leaves plan identity — and any memoised selector — alone.
    // The key is the cursor's planId: that is how every read here resolves the plan, and a
    // document whose map key and plan.id disagree would otherwise strand the reshuffle under a
    // key nothing reads.
    plans: plan === w.plan ? state.plans : { ...state.plans, [w.cursor.planId]: plan },
    assignments: {
      ...state.assignments,
      [profileId]: upsertAssignment(state.assignments[profileId] ?? [], next),
    },
  };
}
