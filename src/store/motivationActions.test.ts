// src/store/motivationActions.test.ts
//
// The P6 store slice (master plan §6.7) and the selector that drives the popup, exercised
// against the real store rather than a hand-built harness: these two actions carry no domain
// logic of their own beyond the backlog rule, so what is worth pinning is the wiring — that
// `set` lands on the store the views read, that the flags survive a save/load round trip, and
// that the selector cannot re-render itself in a loop.
//
// Clock. Every test runs on a fake system clock anchored to WEEK_CLOSE, because
// `pendingMotivation` compares the week's close against `now` and the fixture weeks would
// otherwise drift out of the 14 day window as the calendar moves (master plan §10.5).
//
// Timezone. The fixture profile is on UTC so a week's close is midnight UTC and every epoch
// literal below can be read as an offset from WEEK_CLOSE. The zone-dependence of that close is
// trigger.test.ts's subject, not this file's.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { defaultState, useAppStore } from './index';
import { usePendingMotivation } from './selectors';
import { installFakeStorage } from './testStorage';
import { makeProfile } from '../test/fixtures';
import { parseState } from '../domain/schema';
import type { EpochMs, LocalDate, WeeklyReview } from '../domain/types';

/** [ms/day] One day as an elapsed duration. */
const DAY_MS = 86_400_000;

/** The instant the sample week closed: midnight UTC opening Monday 2026-08-31. */
const WEEK_CLOSE: EpochMs = 1_788_134_400_000; // [ms] epoch, UTC = 2026-08-31T00:00:00Z

/** Default clock reading: half a day after that close, well inside the 14 day window. */
const NOW: EpochMs = WEEK_CLOSE + DAY_MS / 2; // [ms] epoch, UTC

const RECENT_WEEK: LocalDate = '2026-08-24';

function review(patch: Partial<WeeklyReview>): WeeklyReview {
  return {
    profileId: 'p1',
    weekStart: RECENT_WEEK,
    weekEnd: '2026-08-30',
    target: 4, // sessions/week
    completed: 1, // sessions
    skipped: 0, // sessions
    paused: false,
    delta: -3, // completed − target; negative = sessions missed
    evaluatedAt: WEEK_CLOSE, // [ms] epoch, UTC
    missHandled: false,
    ...patch,
  };
}

/** A missed week, named by its Monday. weekEnd is that Monday plus six days. */
function missOn(weekStart: LocalDate, weekEnd: LocalDate): WeeklyReview {
  return review({ weekStart, weekEnd });
}

function seed(reviews: WeeklyReview[]): void {
  useAppStore.setState({
    ...defaultState(),
    activeProfileId: 'p1',
    profiles: { p1: makeProfile({ id: 'p1', timezone: 'UTC' }) },
    weeklyReviews: { p1: reviews },
    motivation: {},
    status: {
      lastSaveError: null,
      lastLoadError: null,
      lastLoadRaw: null,
      hydrated: true,
      lastActionError: null,
    },
  });
}

beforeEach(() => {
  installFakeStorage();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  seed([review({})]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('markMotivationShown', () => {
  it('records the week and the instant, and marks the review handled', () => {
    useAppStore.getState().markMotivationShown('p1', RECENT_WEEK, NOW);

    const state = useAppStore.getState();
    expect(state.motivation.p1?.lastShownForWeek).toBe(RECENT_WEEK);
    expect(state.motivation.p1?.lastShownAt).toBe(NOW);
    expect(state.weeklyReviews.p1?.[0]?.missHandled).toBe(true);
  });

  it('keeps an existing custom video id', () => {
    useAppStore.getState().setCustomVideo('p1', 'asset-1');
    useAppStore.getState().markMotivationShown('p1', RECENT_WEEK, NOW);

    expect(useAppStore.getState().motivation.p1?.customVideoAssetId).toBe('asset-1');
  });

  it('clears the whole older backlog, leaving weeks that were not misses alone', () => {
    // Five misses stranded outside the 14 day window, plus one week that met its target and
    // one that was paused, and the recent miss the popup is actually showing.
    seed([
      missOn('2026-06-01', '2026-06-07'),
      missOn('2026-06-08', '2026-06-14'),
      review({ weekStart: '2026-06-15', weekEnd: '2026-06-21', completed: 4, delta: 0 }),
      missOn('2026-06-22', '2026-06-28'),
      review({ weekStart: '2026-06-29', weekEnd: '2026-07-05', paused: true, completed: 0, delta: -4 }),
      missOn('2026-07-06', '2026-07-12'),
      missOn('2026-07-13', '2026-07-19'),
      missOn(RECENT_WEEK, '2026-08-30'),
    ]);

    useAppStore.getState().markMotivationShown('p1', RECENT_WEEK, NOW);

    const handled = new Map(
      (useAppStore.getState().weeklyReviews.p1 ?? []).map((r) => [r.weekStart, r.missHandled]),
    );
    // The six misses, the recent one included.
    for (const weekStart of [
      '2026-06-01',
      '2026-06-08',
      '2026-06-22',
      '2026-07-06',
      '2026-07-13',
      RECENT_WEEK,
    ]) {
      expect(handled.get(weekStart)).toBe(true);
    }
    // A week that met its target and a paused week are not misses, so nothing was answered
    // for them and their flag stays where closeWeeks left it.
    expect(handled.get('2026-06-15')).toBe(false);
    expect(handled.get('2026-06-29')).toBe(false);

    const { result } = renderHook(() => usePendingMotivation());
    expect(result.current).toBeNull();
  });

  it('leaves a miss from a later week pending', () => {
    seed([
      missOn('2026-08-17', '2026-08-23'),
      missOn(RECENT_WEEK, '2026-08-30'),
    ]);

    // Dismissing the older of the two (the Settings preview can show one out of order) must
    // not answer a week the user has not been shown yet.
    useAppStore.getState().markMotivationShown('p1', '2026-08-17', NOW);

    const handled = new Map(
      (useAppStore.getState().weeklyReviews.p1 ?? []).map((r) => [r.weekStart, r.missHandled]),
    );
    expect(handled.get('2026-08-17')).toBe(true);
    expect(handled.get(RECENT_WEEK)).toBe(false);
  });

  it('throws on a profile id nobody owns, and writes nothing', () => {
    const before = useAppStore.getState().motivation;

    expect(() => {
      useAppStore.getState().markMotivationShown('p2', RECENT_WEEK, NOW);
    }).toThrow('markMotivationShown: "p2" is not a known profile');
    expect(useAppStore.getState().motivation).toBe(before);
  });

  it('leaves the reviews array identity alone when nothing needed handling', () => {
    useAppStore.getState().markMotivationShown('p1', RECENT_WEEK, NOW);
    const map = useAppStore.getState().weeklyReviews;
    const after = map.p1;

    // A second dismissal of the same week: the flag is already true, so neither the review
    // record, nor its array, nor the record holding it may be minted again (the persistence
    // subscription compares the top-level fields by identity, so a rebuilt map is a write).
    useAppStore.getState().markMotivationShown('p1', RECENT_WEEK, NOW + 1000);
    expect(useAppStore.getState().weeklyReviews.p1).toBe(after);
    expect(useAppStore.getState().weeklyReviews).toBe(map);
  });

  it('survives the export/parse round trip', () => {
    useAppStore.getState().markMotivationShown('p1', RECENT_WEEK, NOW);

    const parsed = parseState(JSON.parse(useAppStore.getState().exportJson()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.motivation.p1?.lastShownForWeek).toBe(RECENT_WEEK);
    expect(parsed.state.motivation.p1?.lastShownAt).toBe(NOW);
    expect(parsed.state.weeklyReviews.p1?.[0]?.missHandled).toBe(true);
  });
});

describe('setCustomVideo', () => {
  it('sets and clears the asset id without disturbing the shown week', () => {
    useAppStore.getState().markMotivationShown('p1', RECENT_WEEK, 7);
    useAppStore.getState().setCustomVideo('p1', 'asset-1');
    expect(useAppStore.getState().motivation.p1?.lastShownForWeek).toBe(RECENT_WEEK);

    useAppStore.getState().setCustomVideo('p1', null);
    expect(useAppStore.getState().motivation.p1?.customVideoAssetId).toBeNull();
    expect(useAppStore.getState().motivation.p1?.lastShownAt).toBe(7);
  });

  it('touches no weekly review', () => {
    const before = useAppStore.getState().weeklyReviews;
    useAppStore.getState().setCustomVideo('p1', 'asset-1');
    expect(useAppStore.getState().weeklyReviews).toBe(before);
  });

  it('throws on a profile id nobody owns', () => {
    expect(() => {
      useAppStore.getState().setCustomVideo('p2', 'asset-1');
    }).toThrow('setCustomVideo: "p2" is not a known profile');
  });

  it('survives the export/parse round trip', () => {
    useAppStore.getState().setCustomVideo('p1', 'asset-1');

    const parsed = parseState(JSON.parse(useAppStore.getState().exportJson()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.motivation.p1?.customVideoAssetId).toBe('asset-1');
  });
});

describe('usePendingMotivation', () => {
  it('reports the miss, then reports nothing once it is marked shown', () => {
    const { result } = renderHook(() => usePendingMotivation());
    expect(result.current?.weekStart).toBe(RECENT_WEEK);

    act(() => {
      useAppStore.getState().markMotivationShown('p1', RECENT_WEEK, NOW);
    });
    expect(result.current).toBeNull();
  });

  it('reports nothing with no active profile', () => {
    useAppStore.setState({ activeProfileId: null });
    const { result } = renderHook(() => usePendingMotivation());
    expect(result.current).toBeNull();
  });

  it('returns the same reference across a re-render with no store change', () => {
    const { result, rerender } = renderHook(() => usePendingMotivation());
    const first = result.current;
    rerender();
    rerender();
    expect(result.current).toBe(first);
  });

  it('drops the miss when the window closes under it, without a store change', () => {
    // 30 s inside the window, so the miss is still offered.
    vi.setSystemTime(WEEK_CLOSE + 14 * DAY_MS - 30_000); // [ms] epoch, UTC
    const { result } = renderHook(() => usePendingMotivation());
    expect(result.current?.weekStart).toBe(RECENT_WEEK);

    // One minute of the selector's own clock carries it past the window's edge. Nothing in
    // the store changed, so this can only come from the clock the selector reads.
    act(() => {
      vi.advanceTimersByTime(60_000); // [ms]
    });
    expect(result.current).toBeNull();
  });

  it('re-reads the clock when the tab becomes visible again', () => {
    vi.setSystemTime(WEEK_CLOSE + 14 * DAY_MS - 30_000); // [ms] epoch, UTC
    const { result } = renderHook(() => usePendingMotivation());
    expect(result.current?.weekStart).toBe(RECENT_WEEK);

    // A locked phone throttles or suspends the interval, so the visibility event is the only
    // trigger left. The system clock is moved WITHOUT running any timer, so a pass here can
    // come from nothing else. jsdom reports visibilityState 'visible' by default.
    vi.setSystemTime(WEEK_CLOSE + 14 * DAY_MS + 30_000); // [ms] epoch, UTC
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBeNull();
  });
});
