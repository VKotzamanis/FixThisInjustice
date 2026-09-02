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
// Scope of the walk: the evaluation window is the MAX_WEEKS_EVALUATED weeks ending with the
// current one, intersected with the plan's own lifetime. The first evaluable week is therefore
// the later of the ISO week containing cursor.startedOn and the week MAX_WEEKS_EVALUATED - 1
// weeks before today. Weeks that ended before the plan started are never reviewed, so a
// programme begun midweek is judged from its own first week and no earlier; and a programme
// begun longer ago than the window still closes the week that has just ended, because the
// window is anchored at the present rather than at the plan start.
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

import { addDays, compareLocalDate, todayLocal, weekStart } from '../dates';
import type { AppState, EpochMs, LocalDate, PlanPause, WeeklyReview } from '../types';

/**
 * Width of the evaluation window: 520 weeks = 10 years. It bounds the work one call can do
 * when `startedOn` is far in the past or corrupt. The window is anchored at the most recent
 * weeks, never at `startedOn`, so exceeding it drops the OLDEST weeks — the ones a review can
 * no longer act on — and never the newest.
 */
export const MAX_WEEKS_EVALUATED = 520; // [weeks]

/** The later of two dates. */
function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return compareLocalDate(a, b) >= 0 ? a : b;
}

/** The earlier of two dates. */
function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return compareLocalDate(a, b) <= 0 ? a : b;
}

/**
 * One ISO week in the single representation the walk uses. A week is read two ways here — the
 * inclusive Monday..Sunday span the assignment count and the stored WeeklyReview use, and the
 * half-open [Monday, next Monday) interval the pause predicate needs — and both are derived
 * from the same Monday, so the two readings cannot drift apart.
 */
interface WeekRange {
  /** Monday: the first day of the week. */
  start: LocalDate;
  /** Sunday: the last day of the week, inclusive. Stored as WeeklyReview.weekEnd. */
  end: LocalDate;
  /** The following Monday: the exclusive bound of the half-open interval [start, next). */
  next: LocalDate;
}

/** The ISO week containing `date`. Idempotent on a Monday, so it also advances the walk. */
function weekRangeOf(date: LocalDate): WeekRange {
  const start = weekStart(date);
  return { start, end: addDays(start, 6), next: addDays(start, 7) }; // [d]
}

/**
 * Does any pause cover at least one day of the half-open week [week.start, week.next)?
 *
 * Both intervals are half-open, so this is an interval intersection: the overlap runs from
 * max(starts) to min(ends) and is real only when that range is non-empty. Written this way
 * rather than as the usual pair of inequalities because a same-day pause and resume
 * (from === to) is an empty interval — it covers no days and must not mark the week paused —
 * and only the max/min form gets that degenerate case right. An open pause (to === null)
 * runs to the end of time, so it is clamped to the end of the week.
 */
function pauseOverlapsWeek(pauses: PlanPause[], week: WeekRange): boolean {
  return pauses.some((p) => {
    const from = maxDate(p.from, week.start);
    const to = p.to === null ? week.next : minDate(p.to, week.next);
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

  // The oldest week the window reaches: MAX_WEEKS_EVALUATED - 1 weeks back from today, so the
  // window is the MAX_WEEKS_EVALUATED weeks ending with the current one. Anchoring it here
  // rather than at cursor.startedOn is what lets a plan begun more than 10 years ago close the
  // week that has just ended: anchored at the start, the walk spent its whole budget in the
  // distant past and stopped years short of the present, so the just-ended week was never
  // reviewed and the next call repeated the same stall.
  const oldest = weekStart(addDays(today, -7 * (MAX_WEEKS_EVALUATED - 1))); // [d]
  let week = weekRangeOf(maxDate(weekStart(cursor.startedOn), oldest));

  // The guard counts only the weeks this call actually evaluates. A week already reviewed
  // costs nothing, so a backlog closed over several calls is never charged twice and each call
  // can still reach the present. Termination does not rest on this counter — `today` ends the
  // walk, and the anchor puts it at most MAX_WEEKS_EVALUATED steps away — but it is kept as an
  // explicit bound on the work and on the size of one call's result.
  let evaluated = 0; // [weeks]
  while (evaluated < MAX_WEEKS_EVALUATED) {
    // The current week is never evaluated: it must have ended strictly before today.
    if (compareLocalDate(week.end, today) >= 0) break;

    if (!alreadyReviewed.has(week.start)) {
      evaluated += 1;
      let completed = 0; // [sessions]
      let skipped = 0; // [sessions]
      for (const a of assignments) {
        if (compareLocalDate(a.date, week.start) < 0) continue;
        if (compareLocalDate(week.end, a.date) < 0) continue;
        // Only the two terminal statuses are counted. A day left 'planned' or 'in-progress' is
        // neither a session done nor one deliberately given up, so it falls through both
        // totals and reaches the review as the miss it is.
        if (a.status === 'completed') completed += 1;
        else if (a.status === 'skipped') skipped += 1;
      }
      const paused = pauseOverlapsWeek(pauses, week);
      const delta = paused ? 0 : completed - target; // [sessions/week]
      added.push({
        profileId,
        weekStart: week.start,
        weekEnd: week.end,
        target,
        completed,
        skipped,
        paused,
        delta,
        evaluatedAt: now, // [ms] epoch, UTC
        missHandled: delta >= 0, // only a negative delta is left for P6 to act on
      });
    }
    week = weekRangeOf(week.next);
  }

  if (added.length === 0) return state;
  const merged = [...existing, ...added].sort((a, b) => compareLocalDate(a.weekStart, b.weekStart));
  return { ...state, weeklyReviews: { ...state.weeklyReviews, [profileId]: merged } };
}
