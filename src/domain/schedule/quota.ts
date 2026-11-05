// src/domain/schedule/quota.ts
//
// The weekly session quota and its pro-rated expectation (AM-5, P3 D03/D10/D16). ONE quota
// feeds the forecast (calendar.ts), the weekly grade (weekly.ts) and the Log grid
// (compliance.ts), so the three can never disagree about how many sessions a week asks for.
//
// Every date is a LocalDate in the profile's zone. Counts are [sessions] or [days].

import { addDays, compareLocalDate, isoWeekday } from '../dates';
import { isPaused } from './cursor';
import type { AppState, IsoWeekday, LocalDate } from '../types';

/**
 * The slices the schedule reads. Every AppState is one; the Log view builds one from the slices
 * it subscribes to, so a memo keyed on them recomputes exactly when the schedule changes.
 */
export type ScheduleState = Pick<AppState, 'availability' | 'cursors' | 'plans' | 'pauses' | 'assignments'>;

/** [sessions/week] One availability target for the forecast and weekly grading (AM-5). */
export function weeklyQuota(state: ScheduleState, profileId: string): number {
  return state.availability[profileId]?.weeklySessionTarget ?? 0;
}

/** The distinct ISO weekdays the profile prefers to train on (one per availability slot). */
export function preferredWeekdays(state: ScheduleState, profileId: string): ReadonlySet<IsoWeekday> {
  return new Set((state.availability[profileId]?.slots ?? []).map((slot) => slot.weekday));
}

/**
 * [days] Preferred days in the inclusive range [from, to] that the programme can ask for: inside
 * the programme span [cursor.startedOn, cursor.completedOn] (open-ended while it runs) and not
 * paused. 0 with no cursor or an empty range.
 *
 * A day before startedOn that still carries a finished row counts as inside the span: those are
 * the start week's days trained under the plan a restart replaced (applyReplacePlan keeps them,
 * ROADMAP B1d), and closeWeeks counts their completions, so the expectation must count their
 * days too or a restart week would be graded on more sessions than days.
 */
export function askableDays(
  state: ScheduleState,
  profileId: string,
  from: LocalDate,
  to: LocalDate,
): number {
  const cursor = state.cursors[profileId];
  if (cursor === undefined) return 0;
  const preferred = preferredWeekdays(state, profileId);
  const pauses = state.pauses[profileId] ?? [];
  const recorded = new Set((state.assignments[profileId] ?? []).map((a) => a.date));
  let n = 0; // [days]
  for (let d = from; compareLocalDate(d, to) <= 0; d = addDays(d, 1)) {
    if (compareLocalDate(d, cursor.startedOn) < 0 && !recorded.has(d)) continue;
    if (cursor.completedOn !== null && compareLocalDate(d, cursor.completedOn) > 0) continue;
    if (!preferred.has(isoWeekday(d))) continue;
    if (isPaused(pauses, d)) continue;
    n += 1;
  }
  return n;
}

/**
 * [sessions] What the range [from, to] (inside one ISO week) can fairly ask for: the weekly
 * quota, pro-rated to the preferred days the programme actually spanned, unpaused.
 * expected = min(quota, askableDays). A first week begun on Wednesday, a final week that ended
 * on Monday and a week with a pause in it are each graded against what they could hold (D03,
 * D10), never against the full quota.
 */
export function expectedSessions(
  state: ScheduleState,
  profileId: string,
  from: LocalDate,
  to: LocalDate,
): number {
  return Math.min(weeklyQuota(state, profileId), askableDays(state, profileId, from, to));
}
