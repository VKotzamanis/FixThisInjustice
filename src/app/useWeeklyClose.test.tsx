// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { MockInstance } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WEEKLY_CLOSE_THROTTLE_MS, useWeeklyClose } from './useWeeklyClose';
import { useAppStore } from '../store';
import { NOW_MS, PREV_MONDAY, PROFILE_ID, TZ_ATHENS, seedState } from '../test/scheduleFixtures';

const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];

/**
 * The wall clock, pinned. Held here rather than re-spied per test so a test can move it:
 * the throttle below reads the same clock, so advancing it is how a later visibility event
 * is made to look later rather than by waiting.
 */
let nowSpy: MockInstance<() => number>;

beforeEach(() => {
  nowSpy = vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  useAppStore.setState(
    seedState({
      labels: LABELS,
      weekdays: [1, 3, 5],
      weeklySessionTarget: 3, // [sessions/week]
      startedOn: PREV_MONDAY,
      timezone: TZ_ATHENS,
    }),
  );
});

describe('useWeeklyClose', () => {
  it('closes finished weeks on mount', () => {
    renderHook(() => useWeeklyClose());
    expect(useAppStore.getState().weeklyReviews[PROFILE_ID]).toHaveLength(1);
  });

  it('closes again when the document becomes visible', () => {
    renderHook(() => useWeeklyClose());
    useAppStore.setState({ weeklyReviews: {} });
    expect(useAppStore.getState().weeklyReviews[PROFILE_ID]).toBeUndefined();

    document.dispatchEvent(new Event('visibilitychange'));

    expect(useAppStore.getState().weeklyReviews[PROFILE_ID]).toHaveLength(1);
  });

  it('does nothing without an active profile', () => {
    useAppStore.setState({ activeProfileId: null, weeklyReviews: {} });
    renderHook(() => useWeeklyClose());
    expect(useAppStore.getState().weeklyReviews[PROFILE_ID]).toBeUndefined();
  });

  it('collapses a burst of visibility events into one close', () => {
    // Stubbed rather than counted through the document: the point of this test is how many
    // times the walk is asked for, and closeWeeks is idempotent, so the state cannot say.
    const closeWeeks = vi.spyOn(useAppStore.getState(), 'closeWeeks').mockImplementation(() => {});

    renderHook(() => useWeeklyClose());
    expect(closeWeeks).toHaveBeenCalledTimes(1); // the mount catch-up

    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(closeWeeks).toHaveBeenCalledTimes(2); // three events, one walk
  });

  it('closes again once the throttle window has passed', () => {
    const closeWeeks = vi.spyOn(useAppStore.getState(), 'closeWeeks').mockImplementation(() => {});
    renderHook(() => useWeeklyClose());

    document.dispatchEvent(new Event('visibilitychange'));
    nowSpy.mockReturnValue(NOW_MS + WEEKLY_CLOSE_THROTTLE_MS); // [ms] the window has elapsed
    document.dispatchEvent(new Event('visibilitychange'));

    expect(closeWeeks).toHaveBeenCalledTimes(3); // mount, the first event, the later event
  });

  it('ignores a visibilitychange that hid the page', () => {
    const closeWeeks = vi.spyOn(useAppStore.getState(), 'closeWeeks').mockImplementation(() => {});
    renderHook(() => useWeeklyClose());
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    document.dispatchEvent(new Event('visibilitychange'));

    expect(closeWeeks).toHaveBeenCalledTimes(1); // the mount catch-up and nothing else
  });

  it('stops listening once unmounted', () => {
    const closeWeeks = vi.spyOn(useAppStore.getState(), 'closeWeeks').mockImplementation(() => {});
    const { unmount } = renderHook(() => useWeeklyClose());
    unmount();

    document.dispatchEvent(new Event('visibilitychange'));

    expect(closeWeeks).toHaveBeenCalledTimes(1);
  });

  it('reads the clock at each run, not once at mount', () => {
    const closeWeeks = vi.spyOn(useAppStore.getState(), 'closeWeeks').mockImplementation(() => {});
    renderHook(() => useWeeklyClose());
    const later = NOW_MS + 8 * 86_400_000; // [ms] a week later, the tab never closed
    nowSpy.mockReturnValue(later);

    document.dispatchEvent(new Event('visibilitychange'));

    expect(closeWeeks).toHaveBeenLastCalledWith(PROFILE_ID, later);
  });
});
