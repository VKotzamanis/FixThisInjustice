// src/domain/schedule/weekly.test.ts
//
// Weekly-closure tests. Every instant is epoch milliseconds (UTC) and is annotated with the
// civil reading it produces in each zone under test; every date is a fixture LocalDate.
//
// Deviations from the P3 plan's literal Task 3 Step 1 block, recorded here:
//
//   1. Added the same-day pause case. Master plan §5 defines a pause as the half-open
//      interval [from, to), so a pause and resume on the same day covers no days and cannot
//      overlap any week. The plan's Step 1 block did not test it and its Step 3 overlap
//      predicate got it wrong (it reported paused = true), so the case is tested here and
//      the predicate is written as an interval intersection instead.
//   2. Added the week-boundary matrix. The plan tested one instant (NOW_MS) in two zones;
//      the brief requires Sunday 23:59 and Monday 00:01 local in both zones, including two
//      instants that fall on different civil days in the two zones. The premise itself is
//      asserted rather than assumed.
//   3. Added a parseState round-trip, an incremental-close ordering case, a no-op case for a
//      cursor whose plan is missing from state, and a MAX_WEEKS_EVALUATED bound case.
//
// Coupling note: the counting tests drive state through cursor.ts (completeSession,
// skipSession, pausePlan, resumePlan) exactly as the plan wrote them, so they inherit
// whatever guards that module grows.

import { describe, expect, it } from 'vitest';
import { closeWeeks, MAX_WEEKS_EVALUATED } from './weekly';
import { completeSession, pausePlan, resumePlan, skipSession } from './cursor';
import {
  DAY_MS,
  MONDAY,
  NOW_MS,
  pausesOf,
  PREV_FRIDAY,
  PREV_MONDAY,
  PREV_SUNDAY,
  PREV_WEDNESDAY,
  PROFILE_ID,
  seedState,
  TZ_ATHENS,
  TZ_LOS_ANGELES,
} from '../../test/scheduleFixtures';
import { instantOf, localDateOf } from '../dates';
import { parseState } from '../schema';
import type { AppState, EpochMs, WeeklyReview } from '../types';

const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];
const MWF = [1, 3, 5] as const;

// The programme starts on Monday 2026-08-31, so the week 2026-08-31 .. 2026-09-06 is the
// first candidate for closure. NOW_MS is 2026-09-07T06:30Z.
function seed(timezone: string): AppState {
  return seedState({
    labels: LABELS,
    weekdays: [...MWF],
    weeklySessionTarget: 3,
    startedOn: PREV_MONDAY,
    timezone,
  });
}

function reviews(state: AppState): WeeklyReview[] {
  return state.weeklyReviews[PROFILE_ID] ?? [];
}

describe("closeWeeks — ISO week boundary is read in the profile's timezone", () => {
  it('closes the finished week in Europe/Athens, where the instant is Monday 09:30', () => {
    const out = closeWeeks(seed(TZ_ATHENS), PROFILE_ID, NOW_MS);
    expect(reviews(out)).toHaveLength(1);
    expect(reviews(out)[0]?.weekStart).toBe(PREV_MONDAY);
    expect(reviews(out)[0]?.weekEnd).toBe(PREV_SUNDAY);
  });

  it('closes nothing in America/Los_Angeles, where the same instant is Sunday 23:30', () => {
    const state = seed(TZ_LOS_ANGELES);
    const out = closeWeeks(state, PROFILE_ID, NOW_MS);
    expect(out).toBe(state);
    expect(reviews(out)).toHaveLength(0);
  });

  it('never evaluates the current, unfinished week', () => {
    const out = closeWeeks(seed(TZ_ATHENS), PROFILE_ID, NOW_MS);
    expect(reviews(out).map((r) => r.weekStart)).not.toContain(MONDAY);
  });
});

// ---------------------------------------------------------------------------
// Week boundary matrix (deviation 2). instantOf resolves a civil reading in a named zone to
// epoch milliseconds, so no UTC-offset arithmetic is written by hand here.
// ---------------------------------------------------------------------------

/** [ms] Sunday 2026-09-06 23:59 in Athens = 2026-09-06T20:59Z; Sunday 13:59 in Los Angeles. */
const ATHENS_SUN_2359: EpochMs = instantOf(PREV_SUNDAY, '23:59', TZ_ATHENS);
/** [ms] Monday 2026-09-07 00:01 in Athens = 2026-09-06T21:01Z; still Sunday 14:01 in LA. */
const ATHENS_MON_0001: EpochMs = instantOf(MONDAY, '00:01', TZ_ATHENS);
/** [ms] Sunday 2026-09-06 23:59 in Los Angeles = 2026-09-07T06:59Z; Monday 09:59 in Athens. */
const LA_SUN_2359: EpochMs = instantOf(PREV_SUNDAY, '23:59', TZ_LOS_ANGELES);
/** [ms] Monday 2026-09-07 00:01 in Los Angeles = 2026-09-07T07:01Z; Monday 10:01 in Athens. */
const LA_MON_0001: EpochMs = instantOf(MONDAY, '00:01', TZ_LOS_ANGELES);

function closedWeekStarts(timezone: string, now: EpochMs): string[] {
  return reviews(closeWeeks(seed(timezone), PROFILE_ID, now)).map((r) => r.weekStart);
}

describe('closeWeeks — the current week is never closed, at either zone boundary', () => {
  it('reads the two boundary instants as different civil days in the two zones', () => {
    // The premise of the matrix below, asserted rather than assumed.
    expect(localDateOf(ATHENS_MON_0001, TZ_ATHENS)).toBe(MONDAY);
    expect(localDateOf(ATHENS_MON_0001, TZ_LOS_ANGELES)).toBe(PREV_SUNDAY);
    expect(localDateOf(LA_SUN_2359, TZ_LOS_ANGELES)).toBe(PREV_SUNDAY);
    expect(localDateOf(LA_SUN_2359, TZ_ATHENS)).toBe(MONDAY);
  });

  it('closes nothing at Sunday 23:59 local in Athens', () => {
    expect(closedWeekStarts(TZ_ATHENS, ATHENS_SUN_2359)).toEqual([]);
  });

  it('closes nothing at Sunday 23:59 local in Los Angeles', () => {
    expect(closedWeekStarts(TZ_LOS_ANGELES, LA_SUN_2359)).toEqual([]);
  });

  it('closes the finished week at Monday 00:01 local in Athens', () => {
    expect(closedWeekStarts(TZ_ATHENS, ATHENS_MON_0001)).toEqual([PREV_MONDAY]);
  });

  it('closes the finished week at Monday 00:01 local in Los Angeles', () => {
    expect(closedWeekStarts(TZ_LOS_ANGELES, LA_MON_0001)).toEqual([PREV_MONDAY]);
  });

  it('splits one instant: Athens has entered Monday while Los Angeles has not', () => {
    expect(closedWeekStarts(TZ_ATHENS, ATHENS_MON_0001)).toEqual([PREV_MONDAY]);
    expect(closedWeekStarts(TZ_LOS_ANGELES, ATHENS_MON_0001)).toEqual([]);
    expect(closedWeekStarts(TZ_LOS_ANGELES, LA_SUN_2359)).toEqual([]);
    expect(closedWeekStarts(TZ_ATHENS, LA_SUN_2359)).toEqual([PREV_MONDAY]);
  });
});

describe('closeWeeks — counting', () => {
  it('counts completed and skipped assignments inside the week', () => {
    let s = seed(TZ_ATHENS);
    s = completeSession(s, PROFILE_ID, PREV_MONDAY, NOW_MS - 6 * DAY_MS); // [ms]
    s = completeSession(s, PROFILE_ID, PREV_WEDNESDAY, NOW_MS - 4 * DAY_MS); // [ms]
    s = skipSession(s, PROFILE_ID, PREV_FRIDAY, 'travel');
    const out = closeWeeks(s, PROFILE_ID, NOW_MS);
    const r = reviews(out)[0];
    expect(r?.completed).toBe(2);
    expect(r?.skipped).toBe(1);
    expect(r?.target).toBe(3);
    expect(r?.delta).toBe(-1);
    expect(r?.missHandled).toBe(false);
    expect(r?.paused).toBe(false);
    expect(r?.evaluatedAt).toBe(NOW_MS);
    expect(r?.profileId).toBe(PROFILE_ID);
  });

  it('marks a met target with delta 0 and missHandled true', () => {
    let s = seed(TZ_ATHENS);
    s = completeSession(s, PROFILE_ID, PREV_MONDAY, NOW_MS);
    s = completeSession(s, PROFILE_ID, PREV_WEDNESDAY, NOW_MS);
    s = completeSession(s, PROFILE_ID, PREV_FRIDAY, NOW_MS);
    const r = reviews(closeWeeks(s, PROFILE_ID, NOW_MS))[0];
    expect(r?.delta).toBe(0);
    expect(r?.missHandled).toBe(true);
  });

  it('allows a positive delta when the user exceeds the target', () => {
    let s = seedState({
      labels: LABELS,
      weekdays: [...MWF],
      weeklySessionTarget: 2,
      startedOn: PREV_MONDAY,
      timezone: TZ_ATHENS,
    });
    s = completeSession(s, PROFILE_ID, PREV_MONDAY, NOW_MS);
    s = completeSession(s, PROFILE_ID, PREV_WEDNESDAY, NOW_MS);
    s = completeSession(s, PROFILE_ID, PREV_FRIDAY, NOW_MS);
    const r = reviews(closeWeeks(s, PROFILE_ID, NOW_MS))[0];
    expect(r?.delta).toBe(1);
    expect(r?.missHandled).toBe(true);
  });

  it('ignores assignments outside the week', () => {
    let s = seed(TZ_ATHENS);
    s = completeSession(s, PROFILE_ID, '2026-08-28', NOW_MS); // previous week
    const r = reviews(closeWeeks(s, PROFILE_ID, NOW_MS)).find((x) => x.weekStart === PREV_MONDAY);
    expect(r?.completed).toBe(0);
  });

  it('never reviews a week that ended before the plan started', () => {
    const out = closeWeeks(seed(TZ_ATHENS), PROFILE_ID, NOW_MS);
    // startedOn is 2026-08-31, so 2026-08-24 .. 2026-08-30 is never evaluated.
    expect(reviews(out).map((r) => r.weekStart)).toEqual([PREV_MONDAY]);
  });
});

describe('closeWeeks — pauses', () => {
  it('a paused week never yields a negative delta', () => {
    const paused = pausePlan(seed(TZ_ATHENS), PROFILE_ID, PREV_WEDNESDAY, 'illness');
    const r = reviews(closeWeeks(paused, PROFILE_ID, NOW_MS))[0];
    expect(r?.paused).toBe(true);
    expect(r?.delta).toBe(0);
    expect(r?.completed).toBe(0);
    expect(r?.missHandled).toBe(true);
  });

  it("detects a pause that only overlaps the week's last day", () => {
    const paused = pausePlan(seed(TZ_ATHENS), PROFILE_ID, PREV_SUNDAY, null);
    expect(reviews(closeWeeks(paused, PROFILE_ID, NOW_MS))[0]?.paused).toBe(true);
  });

  it('does not mark a week paused when the pause ended before it began', () => {
    const s = seed(TZ_ATHENS);
    const withPause = {
      ...s,
      pauses: { [PROFILE_ID]: [{ id: 'p', from: '2026-08-20', to: PREV_MONDAY, reason: null }] },
    };
    expect(reviews(closeWeeks(withPause, PROFILE_ID, NOW_MS))[0]?.paused).toBe(false);
  });

  it('does not mark a week paused by a same-day pause and resume, which covers no days', () => {
    const s = seed(TZ_ATHENS);
    const sameDay = resumePlan(
      pausePlan(s, PROFILE_ID, PREV_WEDNESDAY, 'illness'),
      PROFILE_ID,
      PREV_WEDNESDAY,
    );
    expect(pausesOf(sameDay)[0]?.from).toBe(PREV_WEDNESDAY);
    expect(pausesOf(sameDay)[0]?.to).toBe(PREV_WEDNESDAY); // [from, to) is empty
    const r = reviews(closeWeeks(sameDay, PROFILE_ID, NOW_MS))[0];
    expect(r?.paused).toBe(false);
    expect(r?.delta).toBe(-3);
    expect(r?.missHandled).toBe(false);
  });
});

describe('closeWeeks — idempotence and bounds', () => {
  it('adds nothing on a second run', () => {
    const once = closeWeeks(seed(TZ_ATHENS), PROFILE_ID, NOW_MS);
    const twice = closeWeeks(once, PROFILE_ID, NOW_MS);
    expect(twice).toBe(once);
    expect(reviews(twice)).toHaveLength(1);
  });

  it('closes every intervening week in one run, in date order', () => {
    const out = closeWeeks(seed(TZ_ATHENS), PROFILE_ID, NOW_MS + 28 * DAY_MS); // [ms]
    expect(reviews(out).map((r) => r.weekStart)).toEqual([
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
  });

  it('keeps earlier reviews untouched when later weeks close in a second run', () => {
    const once = closeWeeks(seed(TZ_ATHENS), PROFILE_ID, NOW_MS);
    const later = closeWeeks(once, PROFILE_ID, NOW_MS + 28 * DAY_MS); // [ms]
    expect(reviews(later).map((r) => r.weekStart)).toEqual([
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
    expect(reviews(later)[0]).toEqual(reviews(once)[0]); // evaluatedAt of week 1 is not restamped
  });

  it('leaves the cursor untouched over a 60-day clock advance with no completions', () => {
    const s = seed(TZ_ATHENS);
    const out = closeWeeks(s, PROFILE_ID, NOW_MS + 60 * DAY_MS); // [ms]
    expect(out.cursors[PROFILE_ID]?.nextSessionIndex).toBe(0);
    expect(reviews(out).every((r) => r.delta === -3)).toBe(true);
  });

  it('stops at MAX_WEEKS_EVALUATED when startedOn is far in the past', () => {
    const s = seedState({
      labels: LABELS,
      weekdays: [...MWF],
      weeklySessionTarget: 3,
      startedOn: '2000-01-03', // a Monday, 1391 weeks before NOW_MS
      timezone: TZ_ATHENS,
    });
    const out = closeWeeks(s, PROFILE_ID, NOW_MS);
    expect(reviews(out)).toHaveLength(MAX_WEEKS_EVALUATED);
    expect(reviews(out)[0]?.weekStart).toBe('2000-01-03');
  });

  it('is a no-op without a profile, availability, or cursor', () => {
    const s = seed(TZ_ATHENS);
    expect(closeWeeks({ ...s, profiles: {} }, PROFILE_ID, NOW_MS)).toEqual({ ...s, profiles: {} });
    expect(closeWeeks({ ...s, availability: {} }, PROFILE_ID, NOW_MS)).toEqual({
      ...s,
      availability: {},
    });
    expect(closeWeeks({ ...s, cursors: {} }, PROFILE_ID, NOW_MS)).toEqual({ ...s, cursors: {} });
  });

  it('is a no-op when the cursor points at a plan that is not in state', () => {
    const orphan = { ...seed(TZ_ATHENS), plans: {} };
    expect(closeWeeks(orphan, PROFILE_ID, NOW_MS)).toBe(orphan);
  });
});

describe('closeWeeks — persistence', () => {
  it('produces reviews that round-trip through parseState', () => {
    const out = closeWeeks(seed(TZ_ATHENS), PROFILE_ID, NOW_MS + 28 * DAY_MS); // [ms]
    const parsed = parseState(JSON.parse(JSON.stringify(out)) as unknown);
    expect(parsed.ok ? '' : parsed.error).toBe('');
    if (!parsed.ok) return;
    expect(parsed.state.weeklyReviews[PROFILE_ID]).toEqual(reviews(out));
  });
});
