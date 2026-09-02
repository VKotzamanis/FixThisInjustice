import { describe, expect, it } from 'vitest';
import { weekDeltaKey } from './weekDelta';
import { DEFAULT_COPY } from '../../content/copy';
import type { WeeklyReview } from '../../domain/types';

/** A closed week, patched per case. Only `delta` is read by the mapper. */
function review(patch: Partial<WeeklyReview> = {}): WeeklyReview {
  return {
    profileId: 'p1',
    weekStart: '2026-08-24',
    weekEnd: '2026-08-30',
    target: 4, // [sessions/week]
    completed: 4, // [sessions]
    skipped: 0, // [sessions]
    paused: false,
    delta: 0, // [sessions/week]
    evaluatedAt: 1_756_684_800_000, // [ms] epoch, UTC
    missHandled: true,
    ...patch,
  };
}

describe('weekDeltaKey', () => {
  it('reads the sign of the stored delta, and nothing else', () => {
    expect(weekDeltaKey(review({ delta: -3 }))).toBe('status.weekDeltaNegative');
    expect(weekDeltaKey(review({ delta: 0 }))).toBe('status.weekDeltaZero');
    expect(weekDeltaKey(review({ delta: 1 }))).toBe('status.weekDeltaPositive');
  });

  it('ignores the two counts, which are the caller`s to render', () => {
    // A document whose stored delta disagrees with completed - target is a document defect, and
    // the mapper reports the STORED value rather than quietly correcting it to the arithmetic.
    expect(weekDeltaKey(review({ completed: 0, target: 4, delta: 1 }))).toBe(
      'status.weekDeltaPositive',
    );
  });

  it('names three keys that carry the same two slots', () => {
    const slots = (key: 'status.weekDeltaNegative' | 'status.weekDeltaZero' | 'status.weekDeltaPositive') =>
      [...DEFAULT_COPY[key].matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]).sort();
    expect(slots('status.weekDeltaNegative')).toEqual(['completed', 'target']);
    expect(slots('status.weekDeltaZero')).toEqual(['completed', 'target']);
    expect(slots('status.weekDeltaPositive')).toEqual(['completed', 'target']);
  });
});
