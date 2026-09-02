import { describe, expect, it } from 'vitest';
import { addDays, instantOf } from '../dates';
import { describeMiss, MOTIVATION_MISS_WINDOW_DAYS, pendingMotivation } from './trigger';
import { makeProfile } from '../../test/fixtures';
import type { AppState, EpochMs, MotivationState, TimeZone, WeeklyReview } from '../types';

/** One day as a duration on the timeline. Not a calendar day: no DST is involved here. */
const DAY_MS = 86_400_000; // [ms/day]

/**
 * The instant that closes the sample week: midnight UTC ending Sunday 2026-08-30, which is
 * 00:00 on Monday 2026-08-31. Every clock reading below is stated as an offset from it, so
 * the age of the miss is readable in the test rather than hidden in an epoch literal.
 */
const WEEK_CLOSE: EpochMs = 1_788_134_400_000; // [ms] epoch, UTC = 2026-08-31T00:00:00Z

/** Default clock reading: half a day after the sample week closed, well inside the window. */
const NOW: EpochMs = WEEK_CLOSE + DAY_MS / 2; // [ms] epoch, UTC

function review(patch: Partial<WeeklyReview>): WeeklyReview {
  return {
    profileId: 'p1',
    weekStart: '2026-08-24',
    weekEnd: '2026-08-30',
    target: 4, // sessions/week
    completed: 1, // sessions
    skipped: 0, // sessions
    paused: false,
    delta: -3, // completed − target; negative = sessions missed
    evaluatedAt: 1_756_000_000_000, // EpochMs, UTC
    missHandled: false,
    ...patch,
  };
}

function stateOf(
  reviews: WeeklyReview[],
  motivation?: MotivationState,
  timezone: TimeZone = 'UTC',
): Pick<AppState, 'weeklyReviews' | 'motivation' | 'profiles'> {
  return {
    profiles: { p1: makeProfile({ id: 'p1', timezone }) },
    weeklyReviews: { p1: reviews },
    motivation: motivation === undefined ? {} : { p1: motivation },
  };
}

describe('pendingMotivation', () => {
  it('returns the missed week on the first open', () => {
    const state = stateOf([review({})]);
    expect(pendingMotivation(state, 'p1', NOW)?.weekStart).toBe('2026-08-24');
  });

  it('returns null on the second open, once that week has been shown', () => {
    const shown: MotivationState = {
      profileId: 'p1',
      lastShownForWeek: '2026-08-24',
      lastShownAt: 1_756_000_100_000, // EpochMs, UTC
      customVideoAssetId: null,
    };
    expect(pendingMotivation(stateOf([review({})], shown), 'p1', NOW)).toBeNull();
  });

  it('never returns a paused week', () => {
    const paused = review({ paused: true, completed: 0, delta: 0 });
    expect(pendingMotivation(stateOf([paused]), 'p1', NOW)).toBeNull();
  });

  it('never returns a paused week even if its delta is negative', () => {
    const paused = review({ paused: true, completed: 0, delta: -4 });
    expect(pendingMotivation(stateOf([paused]), 'p1', NOW)).toBeNull();
  });

  it('ignores a week whose miss was already handled', () => {
    expect(pendingMotivation(stateOf([review({ missHandled: true })]), 'p1', NOW)).toBeNull();
  });

  it('ignores a week that met its target', () => {
    expect(pendingMotivation(stateOf([review({ completed: 4, delta: 0 })]), 'p1', NOW)).toBeNull();
  });

  it('still returns an older miss when only the newest week was shown', () => {
    const shown: MotivationState = {
      profileId: 'p1',
      lastShownForWeek: '2026-08-24',
      lastShownAt: 1_756_000_100_000, // EpochMs, UTC
      customVideoAssetId: null,
    };
    const state = stateOf(
      [
        review({ weekStart: '2026-08-17', weekEnd: '2026-08-23' }),
        review({ weekStart: '2026-08-24' }),
      ],
      shown,
    );
    expect(pendingMotivation(state, 'p1', NOW)?.weekStart).toBe('2026-08-17');
  });

  it('returns null for a profile with no reviews', () => {
    expect(pendingMotivation(stateOf([review({})]), 'unknown-profile', NOW)).toBeNull();
  });
});

describe('pendingMotivation miss window', () => {
  it('is 14 days wide', () => {
    expect(MOTIVATION_MISS_WINDOW_DAYS).toBe(14); // [days]
  });

  it('closes the sample week where dates.ts says it does', () => {
    // Pins the epoch literal above: if this fails, every age below is measured from the
    // wrong instant and the window assertions mean nothing.
    expect(WEEK_CLOSE).toBe(instantOf('2026-08-31', '00:00', 'UTC'));
  });

  it('returns a miss 13 days old', () => {
    const state = stateOf([review({})]);
    expect(pendingMotivation(state, 'p1', WEEK_CLOSE + 13 * DAY_MS)?.weekStart).toBe('2026-08-24');
  });

  it('ignores a miss 15 days old', () => {
    const state = stateOf([review({})]);
    expect(pendingMotivation(state, 'p1', WEEK_CLOSE + 15 * DAY_MS)).toBeNull();
  });

  it('excludes a miss exactly one window old', () => {
    // The window is half-open: an age of exactly MOTIVATION_MISS_WINDOW_DAYS is outside it.
    const state = stateOf([review({})]);
    expect(pendingMotivation(state, 'p1', WEEK_CLOSE + 14 * DAY_MS)).toBeNull();
  });

  it('returns the most recent of two misses inside the window', () => {
    const older = review({ weekStart: '2026-08-17', weekEnd: '2026-08-23' }); // closed 7.5 d ago
    const newer = review({ weekStart: '2026-08-24', weekEnd: '2026-08-30' }); // closed 0.5 d ago
    // Both orderings: the selector keeps the maximum, not the last element it saw.
    expect(pendingMotivation(stateOf([older, newer]), 'p1', NOW)?.weekStart).toBe('2026-08-24');
    expect(pendingMotivation(stateOf([newer, older]), 'p1', NOW)?.weekStart).toBe('2026-08-24');
  });

  it('returns only the recent miss out of a 20-week back-dated backlog', () => {
    // What a back-dated setPlan produces: closeWeeks back-fills every week since startedOn,
    // and without the window each unhandled one is a separate popup on a separate app open.
    const backlog: WeeklyReview[] = [];
    for (let k = 0; k < 20; k += 1) {
      // Mondays walking back from 2026-08-10; the newest of these closed 14.5 days before NOW.
      const weekStart = addDays('2026-08-10', -7 * k); // [d]
      backlog.push(review({ weekStart, weekEnd: addDays(weekStart, 6) }));
    }
    const recent = review({ weekStart: '2026-08-24', weekEnd: '2026-08-30' });
    const state = stateOf([...backlog, recent]);

    expect(pendingMotivation(state, 'p1', NOW)?.weekStart).toBe('2026-08-24');
    // The selector only reads: the backlog is left for the store action to decide about.
    expect(backlog.every((r) => !r.missHandled)).toBe(true);
  });

  it('measures the window in the profile timezone', () => {
    const atOneWindow = WEEK_CLOSE + 14 * DAY_MS; // [ms] epoch, UTC
    // In UTC the sample week closed exactly one window before this instant: outside.
    expect(pendingMotivation(stateOf([review({})], undefined, 'UTC'), 'p1', atOneWindow)).toBeNull();
    // Pacific/Niue is UTC-11 all year, so the same civil Sunday closed 11 hours later: inside.
    const niue = stateOf([review({})], undefined, 'Pacific/Niue');
    expect(pendingMotivation(niue, 'p1', atOneWindow)?.weekStart).toBe('2026-08-24');
  });

  it('returns null when the profile itself is gone', () => {
    // No profile means no timezone, so no week can be placed on the timeline.
    const state = stateOf([review({})]);
    expect(pendingMotivation({ ...state, profiles: {} }, 'p1', NOW)).toBeNull();
  });
});

describe('describeMiss', () => {
  it('reports partial completion', () => {
    expect(describeMiss(review({}))).toBe('Week of 2026-08-24: 1 of 4 sessions completed.');
  });

  it('reports zero completion', () => {
    expect(describeMiss(review({ completed: 0, delta: -4 }))).toBe(
      'Week of 2026-08-24: no sessions completed.',
    );
  });
});
