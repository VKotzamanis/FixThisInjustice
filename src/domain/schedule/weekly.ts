// src/domain/schedule/weekly.ts
//
// Weekly review closure. An ISO week (Monday to Sunday in the profile's timezone) is
// evaluated once, only after it has ended, and never while it is still running. The result
// is the input P6 uses to decide whether a week was lost.
//
// delta = completed − target [sessions/week], signed: negative means sessions missed.
// A week overlapped by any pause is paused = true and delta = 0, so a deliberate pause can
// never register as a miss. missHandled starts false only when delta < 0; a week that met or
// beat its target has nothing left for P6 to act on.
//
// Scope of the walk: the first evaluable week is the ISO week containing cursor.startedOn.
// Weeks that ended before the plan started are never reviewed, so a programme begun midweek
// is judged from its own first week and no earlier.
//
// Every date argument is a LocalDate ("YYYY-MM-DD") in the profile's timezone, produced only
// by src/domain/dates.ts. Instants (EpochMs) are epoch milliseconds, UTC. The single reading
// of the clock is todayLocal(profile.timezone, now): the week boundary is a civil-date
// question, so it is answered in the profile's zone and nowhere else.
//
// closeWeeks is pure: it returns a new AppState and never mutates its argument. A call with
// nothing to close returns the same state reference, so a caller may use identity to detect
// a no-op, and a second call with the same `now` adds nothing.
//
// Known limitation (master plan §6.4, amendment P3 item 8): `target` is the CURRENT
// Availability.weeklySessionTarget at evaluation time. No target history is stored, so a
// backlog of old weeks closed after the user changes their target is judged against the new
// one.

import { addDays, compareLocalDate, todayLocal, weekEnd, weekStart } from '../dates';
import type { AppState, EpochMs, LocalDate, PlanPause, WeeklyReview } from '../types';

/** Bounds the walk if `startedOn` is far in the past or corrupt: 520 weeks = 10 years. */
export const MAX_WEEKS_EVALUATED = 520;

/** The later of two dates. */
function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return compareLocalDate(a, b) >= 0 ? a : b;
}

/** The earlier of two dates. */
function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return compareLocalDate(a, b) <= 0 ? a : b;
}

/**
 * Does any pause cover at least one day of the half-open week [weekFrom, weekTo)?
 *
 * Both intervals are half-open, so this is an interval intersection: the overlap runs from
 * max(starts) to min(ends) and is real only when that range is non-empty. Written this way
 * rather than as the usual pair of inequalities because a same-day pause and resume
 * (from === to) is an empty interval — it covers no days and must not mark the week paused —
 * and only the max/min form gets that degenerate case right. An open pause (to === null)
 * runs to the end of time, so it is clamped to the end of the week.
 */
function pauseOverlapsWeek(pauses: PlanPause[], weekFrom: LocalDate, weekTo: LocalDate): boolean {
  return pauses.some((p) => {
    const from = maxDate(p.from, weekFrom);
    const to = p.to === null ? weekTo : minDate(p.to, weekTo);
    return compareLocalDate(from, to) < 0;
  });
}

export function closeWeeks(state: AppState, profileId: string, now: EpochMs): AppState {
  const profile = state.profiles[profileId];
  if (!profile) return state;
  const availability = state.availability[profileId];
  if (!availability) return state;
  const cursor = state.cursors[profileId];
  if (!cursor) return state;
  // A cursor whose plan is gone is not a running programme; there is nothing to review.
  if (!state.plans[cursor.planId]) return state;

  const today = todayLocal(profile.timezone, now);
  const existing = state.weeklyReviews[profileId] ?? [];
  const alreadyReviewed = new Set(existing.map((r) => r.weekStart));
  const assignments = state.assignments[profileId] ?? [];
  const pauses = state.pauses[profileId] ?? [];
  const target = availability.weeklySessionTarget; // [sessions/week]

  const added: WeeklyReview[] = [];
  let ws = weekStart(cursor.startedOn);

  for (let guard = 0; guard < MAX_WEEKS_EVALUATED; guard++) {
    const we = weekEnd(ws);
    // The current week is never evaluated: it must have ended strictly before today.
    if (compareLocalDate(we, today) >= 0) break;

    if (!alreadyReviewed.has(ws)) {
      let completed = 0; // [sessions]
      let skipped = 0; // [sessions]
      for (const a of assignments) {
        if (compareLocalDate(a.date, ws) < 0) continue;
        if (compareLocalDate(we, a.date) < 0) continue;
        if (a.status === 'completed') completed += 1;
        else if (a.status === 'skipped') skipped += 1;
      }
      const paused = pauseOverlapsWeek(pauses, ws, addDays(ws, 7)); // [ws, ws+7): Mon..Sun
      const delta = paused ? 0 : completed - target; // [sessions/week]
      added.push({
        profileId,
        weekStart: ws,
        weekEnd: we,
        target,
        completed,
        skipped,
        paused,
        delta,
        evaluatedAt: now, // [ms] epoch, UTC
        missHandled: delta >= 0, // only a negative delta is left for P6 to act on
      });
    }
    ws = addDays(ws, 7); // [d]
  }

  if (added.length === 0) return state;
  const merged = [...existing, ...added].sort((a, b) => compareLocalDate(a.weekStart, b.weekStart));
  return { ...state, weeklyReviews: { ...state.weeklyReviews, [profileId]: merged } };
}
