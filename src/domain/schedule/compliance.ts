// src/domain/schedule/compliance.ts
//
// The Log compliance grid, derived from the schedule model rather than from which rows happen to
// exist (audit D06). Assignments are materialised only when the user opens a day, so "no row"
// meant nothing; this module answers what each day WAS or IS for the programme:
//
//   completed / skipped / in-progress   a recorded row, shown as recorded
//   missed      a past preferred day the week still owed a session for (see below)
//   planned     today or later, and the forecast serves a session on it
//   postponed   today or later, handed back by Skip Today (spec R2)
//   paused      inside a pause
//   none        nothing was asked of the day (a rest day, or the quota was already met)
//   blank       outside the programme's span [startedOn, completedOn]
//
// Misses are COUNTED, not inferred per day: a past week owes max(0, target - completed)
// sessions, where target is the stored review's (D16: never regraded) or, for the running week,
// the pro-rated expectation up to yesterday (quota.ts). The owed misses are marked on the
// earliest unserved preferred days. A made-up session (trained on another day) therefore clears
// a miss, and a week whose quota was met shows no miss even with a preferred day left empty.
//
// Pure: no clock (the caller passes its civil today), no store.

import { addDays, compareLocalDate, daysBetween, isoWeekday } from '../dates';
import { projectedCalendar } from './calendar';
import { isPaused } from './cursor';
import { expectedSessions, preferredWeekdays, type ScheduleState } from './quota';
import type { AppState, LocalDate } from '../types';

export type DayMark =
  | 'completed'
  | 'skipped'
  | 'in-progress'
  | 'missed'
  | 'planned'
  | 'postponed'
  | 'paused'
  | 'none'
  | 'blank';

export interface ComplianceDay {
  date: LocalDate;
  mark: DayMark;
}

export interface ComplianceWeek {
  /** Monday of the ISO week. */
  monday: LocalDate;
  completed: number; // [sessions]
  /** The stored review's target once the week is graded, else the pro-rated expectation. */
  target: number; // [sessions/week]
  /** Monday..Sunday, seven entries. */
  days: ComplianceDay[];
}

export type ComplianceSource = ScheduleState & Pick<AppState, 'weeklyReviews'>;

/** [d] Days in an ISO week. */
const WEEK_DAYS = 7;

export function complianceWeek(
  state: ComplianceSource,
  profileId: string,
  monday: LocalDate,
  today: LocalDate,
): ComplianceWeek {
  const sunday = addDays(monday, WEEK_DAYS - 1);
  const cursor = state.cursors[profileId];
  const rows = new Map<LocalDate, string>();
  let completed = 0; // [sessions]
  for (const a of state.assignments[profileId] ?? []) {
    if (compareLocalDate(a.date, monday) < 0 || compareLocalDate(a.date, sunday) > 0) continue;
    rows.set(a.date, a.status);
    if (a.status === 'completed') completed += 1;
  }
  const review = (state.weeklyReviews[profileId] ?? []).find((r) => r.weekStart === monday) ?? null;
  const target = review?.target ?? expectedSessions(state, profileId, monday, sunday); // [sessions/week]

  // [sessions] owed by the days that have passed: the stored grade, or the expectation up to
  // yesterday for the running week.
  const yesterday = addDays(today, -1);
  const lastPast = compareLocalDate(yesterday, sunday) < 0 ? yesterday : sunday;
  const owedPast =
    review !== null
      ? review.target
      : compareLocalDate(lastPast, monday) < 0
        ? 0
        : expectedSessions(state, profileId, monday, lastPast);
  let missesLeft = Math.max(0, owedPast - completed); // [sessions]

  // The forecast for today and later, from the projection itself (rule 2).
  const served = new Set<LocalDate>();
  if (compareLocalDate(today, sunday) <= 0) {
    const from = compareLocalDate(today, monday) > 0 ? today : monday;
    const span = daysBetween(from, sunday) + 1; // [d] from..Sunday inclusive
    for (const day of projectedCalendar(state, profileId, from, span)) {
      if (day.assignment === null && day.projectedSession !== null) served.add(day.date);
    }
  }
  const postponed = new Set<LocalDate>(cursor?.postponed ?? []);
  const preferred = preferredWeekdays(state, profileId);
  const pauses = state.pauses[profileId] ?? [];

  const days: ComplianceDay[] = [];
  for (let i = 0; i < WEEK_DAYS; i += 1) {
    const date = addDays(monday, i); // [d]
    const status = rows.get(date);
    let mark: DayMark;
    if (status === 'completed' || status === 'skipped' || status === 'in-progress') {
      mark = status;
    } else if (status === 'planned') {
      mark = compareLocalDate(date, today) < 0 ? 'missed' : 'planned';
    } else if (
      cursor === undefined ||
      compareLocalDate(date, cursor.startedOn) < 0 ||
      (cursor.completedOn !== null && compareLocalDate(date, cursor.completedOn) > 0)
    ) {
      mark = 'blank';
    } else if (isPaused(pauses, date)) {
      mark = 'paused';
    } else if (compareLocalDate(date, today) >= 0) {
      mark = postponed.has(date) ? 'postponed' : served.has(date) ? 'planned' : 'none';
    } else if (preferred.has(isoWeekday(date)) && missesLeft > 0) {
      mark = 'missed';
      missesLeft -= 1;
    } else {
      mark = 'none';
    }
    days.push({ date, mark });
  }
  return { monday, completed, target, days };
}
