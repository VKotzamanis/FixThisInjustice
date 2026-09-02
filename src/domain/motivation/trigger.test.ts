import { describe, expect, it } from 'vitest';
import { describeMiss, pendingMotivation } from './trigger';
import type { AppState, MotivationState, WeeklyReview } from '../types';

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
): Pick<AppState, 'weeklyReviews' | 'motivation'> {
  return {
    weeklyReviews: { p1: reviews },
    motivation: motivation === undefined ? {} : { p1: motivation },
  };
}

describe('pendingMotivation', () => {
  it('returns the missed week on the first open', () => {
    const state = stateOf([review({})]);
    expect(pendingMotivation(state, 'p1')?.weekStart).toBe('2026-08-24');
  });

  it('returns null on the second open, once that week has been shown', () => {
    const shown: MotivationState = {
      profileId: 'p1',
      lastShownForWeek: '2026-08-24',
      lastShownAt: 1_756_000_100_000, // EpochMs, UTC
      customVideoAssetId: null,
    };
    expect(pendingMotivation(stateOf([review({})], shown), 'p1')).toBeNull();
  });

  it('never returns a paused week', () => {
    const paused = review({ paused: true, completed: 0, delta: 0 });
    expect(pendingMotivation(stateOf([paused]), 'p1')).toBeNull();
  });

  it('never returns a paused week even if its delta is negative', () => {
    const paused = review({ paused: true, completed: 0, delta: -4 });
    expect(pendingMotivation(stateOf([paused]), 'p1')).toBeNull();
  });

  it('ignores a week whose miss was already handled', () => {
    expect(pendingMotivation(stateOf([review({ missHandled: true })]), 'p1')).toBeNull();
  });

  it('ignores a week that met its target', () => {
    expect(pendingMotivation(stateOf([review({ completed: 4, delta: 0 })]), 'p1')).toBeNull();
  });

  it('picks the most recent of several unhandled misses', () => {
    const state = stateOf([
      review({ weekStart: '2026-08-10', weekEnd: '2026-08-16' }),
      review({ weekStart: '2026-08-24', weekEnd: '2026-08-30' }),
      review({ weekStart: '2026-08-17', weekEnd: '2026-08-23' }),
    ]);
    expect(pendingMotivation(state, 'p1')?.weekStart).toBe('2026-08-24');
  });

  it('still returns an older miss when only the newest week was shown', () => {
    const shown: MotivationState = {
      profileId: 'p1',
      lastShownForWeek: '2026-08-24',
      lastShownAt: 1_756_000_100_000, // EpochMs, UTC
      customVideoAssetId: null,
    };
    const state = stateOf(
      [review({ weekStart: '2026-08-17', weekEnd: '2026-08-23' }), review({ weekStart: '2026-08-24' })],
      shown,
    );
    expect(pendingMotivation(state, 'p1')?.weekStart).toBe('2026-08-17');
  });

  it('returns null for a profile with no reviews', () => {
    expect(pendingMotivation(stateOf([review({})]), 'unknown-profile')).toBeNull();
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
