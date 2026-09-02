// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  selectCalendar,
  selectRemainingLabels,
  useActiveCursor,
  useActiveProfileId,
  usePlan,
  useRemainingLabelsThisWeek,
  useTimeZone,
  useTodayDate,
  useTodayPlan,
  useUpcoming,
  useWeeklyReviews,
} from './scheduleSelectors';
import { useAppStore } from './index';
import {
  DAY_MS,
  MONDAY,
  NOW_MS,
  PLAN_ID,
  PREV_MONDAY,
  PREV_SUNDAY,
  PROFILE_ID,
  TZ_ATHENS,
  TZ_LOS_ANGELES,
  seedState,
} from '../test/scheduleFixtures';
import type { TimeZone } from '../domain/types';

const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];

function seed(timezone: TimeZone = TZ_ATHENS): void {
  useAppStore.setState(
    seedState({
      labels: LABELS,
      weekdays: [1, 3, 5], // Mon, Wed, Fri
      weeklySessionTarget: 3, // [sessions/week]
      startedOn: PREV_MONDAY,
      timezone,
    }),
  );
}

beforeEach(() => {
  seed();
});

describe('today, in the profile timezone', () => {
  /*
   * NOW_MS is one instant that falls on two civil days: Monday 09:30 in Athens and Sunday
   * 23:30 in Los Angeles. The selectors must answer with the PROFILE's day, which is the
   * whole reason todayLocal takes a zone (master plan §3, dates).
   */
  it('reads the civil date in the active profile zone', () => {
    expect(renderHook(() => useTodayDate(NOW_MS)).result.current).toBe(MONDAY);
    seed(TZ_LOS_ANGELES);
    expect(renderHook(() => useTodayDate(NOW_MS)).result.current).toBe(PREV_SUNDAY);
  });

  it('useTimeZone reports the profile zone, not the device zone', () => {
    expect(renderHook(() => useTimeZone()).result.current).toBe(TZ_ATHENS);
  });

  it('useTodayPlan returns the calendar day for that date', () => {
    const day = renderHook(() => useTodayPlan(NOW_MS)).result.current;
    expect(day?.date).toBe(MONDAY);
    expect(day?.slot?.weekday).toBe(1);
    expect(day?.projectedSession?.id).toBe('s-1');
    expect(day?.paused).toBe(false);
  });

  it('useTodayPlan follows the profile zone across the date boundary', () => {
    seed(TZ_LOS_ANGELES);
    expect(renderHook(() => useTodayPlan(NOW_MS)).result.current?.date).toBe(PREV_SUNDAY);
  });
});

describe('projection selectors', () => {
  it('useUpcoming returns one entry per requested day, starting today', () => {
    const days = renderHook(() => useUpcoming(7, NOW_MS)).result.current;
    expect(days).toHaveLength(7);
    expect(days[0]?.date).toBe(MONDAY);
    expect(days[6]?.date).toBe('2026-09-13');
    // Mon/Wed/Fri carry the plan; the rest are rest days with no session projected.
    expect(days.filter((d) => d.projectedSession !== null).map((d) => d.date)).toEqual([
      '2026-09-07',
      '2026-09-09',
      '2026-09-11',
    ]);
  });

  /*
   * Zustand 5 compares snapshots with Object.is and has no equality-function overload, so a
   * selector that builds a fresh array on every call makes React re-render until it gives up
   * ("The result of getSnapshot should be cached"). This is the test that the memo holds.
   */
  it('returns the same array across re-renders while the state is unchanged', () => {
    const hook = renderHook(() => useUpcoming(7, NOW_MS));
    const first = hook.result.current;
    hook.rerender();
    expect(hook.result.current).toBe(first);
  });

  it('recomputes once the document changes', () => {
    const hook = renderHook(() => useUpcoming(7, NOW_MS));
    const first = hook.result.current;
    act(() => {
      useAppStore.getState().startSession(PROFILE_ID, MONDAY, NOW_MS);
    });
    expect(hook.result.current).not.toBe(first);
    expect(hook.result.current[0]?.assignment?.status).toBe('in-progress');
  });

  it('useRemainingLabelsThisWeek offers the labels the week has left', () => {
    const labels = renderHook(() => useRemainingLabelsThisWeek(NOW_MS)).result.current;
    expect(labels).toEqual(['Push', 'Legs', 'Pull']);
  });

  it('useActiveCursor, usePlan and useWeeklyReviews read the active profile', () => {
    expect(renderHook(() => useActiveProfileId()).result.current).toBe(PROFILE_ID);
    expect(renderHook(() => useActiveCursor()).result.current?.planId).toBe(PLAN_ID);
    expect(renderHook(() => usePlan()).result.current?.id).toBe(PLAN_ID);
    expect(renderHook(() => useWeeklyReviews()).result.current).toEqual([]);

    useAppStore.getState().closeWeeks(PROFILE_ID, NOW_MS);
    expect(renderHook(() => useWeeklyReviews()).result.current).toHaveLength(1);
  });
});

describe('without an active profile', () => {
  beforeEach(() => {
    useAppStore.setState({ activeProfileId: null });
  });

  it('answers empty rather than throwing', () => {
    expect(renderHook(() => useTodayPlan(NOW_MS)).result.current).toBeNull();
    expect(renderHook(() => useUpcoming(7, NOW_MS)).result.current).toEqual([]);
    expect(renderHook(() => useRemainingLabelsThisWeek(NOW_MS)).result.current).toEqual([]);
    expect(renderHook(() => useActiveCursor()).result.current).toBeNull();
    expect(renderHook(() => usePlan()).result.current).toBeNull();
    expect(renderHook(() => useWeeklyReviews()).result.current).toEqual([]);
  });

  it('keeps the empty results referentially stable', () => {
    const hook = renderHook(() => useUpcoming(7, NOW_MS));
    const first = hook.result.current;
    hook.rerender();
    expect(hook.result.current).toBe(first);
  });
});

describe('the pure selectors memoise on state identity', () => {
  it('reuses the computed calendar for one state and one key', () => {
    const state = useAppStore.getState();
    expect(selectCalendar(state, PROFILE_ID, MONDAY, 7)).toBe(
      selectCalendar(state, PROFILE_ID, MONDAY, 7),
    );
    expect(selectCalendar(state, PROFILE_ID, MONDAY, 7)).not.toBe(
      selectCalendar(state, PROFILE_ID, MONDAY, 14),
    );
    expect(selectRemainingLabels(state, PROFILE_ID, MONDAY)).toBe(
      selectRemainingLabels(state, PROFILE_ID, MONDAY),
    );
  });
});

/*
 * Master plan §7, P3 gate, through the store and its selectors: the cursor is advanced by
 * attendance, never by the clock. Sixty days of weekly closure and a projection that starts
 * sixty days out must still show the first session of the plan as the next one.
 */
describe('the cursor does not move with the clock', () => {
  it('60 days later the next session is still the first one', () => {
    const before = useAppStore.getState().cursors[PROFILE_ID];

    for (let day = 0; day <= 60; day++) {
      useAppStore.getState().closeWeeks(PROFILE_ID, NOW_MS + day * DAY_MS); // [ms] epoch, UTC
    }

    expect(renderHook(() => useActiveCursor()).result.current).toEqual(before);
    const days = renderHook(() => useUpcoming(7, NOW_MS + 60 * DAY_MS)).result.current;
    const firstTrainingDay = days.find((d) => d.projectedSession !== null);
    expect(firstTrainingDay?.projectedSession?.id).toBe('s-1');
    expect(useAppStore.getState().assignments[PROFILE_ID]).toEqual([]);
  });
});
