import { describe, expect, it } from 'vitest';
import { completeSession } from '../domain/schedule/cursor';
import {
  DAY_MS,
  NOW_MS,
  PREV_MONDAY,
  PROFILE_ID,
  makeAvailability,
  seedState,
} from '../test/scheduleFixtures';
import { applyUpdateAvailability } from './availability';

const LABELS = ['A', 'B', 'C', 'A', 'B', 'C'];

describe('applyUpdateAvailability (D05, D16)', () => {
  it('grades the ended week under the old target, then stores the new days; plan and cursor untouched', () => {
    let s = seedState({ labels: LABELS, weekdays: [1, 3, 5], weeklySessionTarget: 3, startedOn: PREV_MONDAY });
    s = completeSession(s, PROFILE_ID, PREV_MONDAY, NOW_MS - 7 * DAY_MS); // [ms]
    const next = applyUpdateAvailability(s, PROFILE_ID, makeAvailability([2, 4], 1, '19:00'), NOW_MS);
    expect(next.weeklyReviews[PROFILE_ID]).toEqual([
      expect.objectContaining({ weekStart: PREV_MONDAY, completed: 1, target: 3, delta: -2 }),
    ]);
    expect(next.availability[PROFILE_ID]).toEqual(makeAvailability([2, 4], 1, '19:00'));
    expect(next.plans).toBe(s.plans);
    expect(next.cursors).toBe(s.cursors);
    expect(next.assignments).toBe(s.assignments);
  });

  it('refuses a target above the number of days and a cleared start time, writing nothing', () => {
    const s = seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: PREV_MONDAY });
    expect(() => applyUpdateAvailability(s, PROFILE_ID, makeAvailability([1], 2, '18:00'), NOW_MS)).toThrow(
      /^updateAvailability: /,
    );
    expect(() => applyUpdateAvailability(s, PROFILE_ID, makeAvailability([1], 1, ''), NOW_MS)).toThrow(
      /^updateAvailability: slots/,
    );
  });
});

describe('useAppStore.updateAvailability', () => {
  it('is one write through the store, and refuses without writing', async () => {
    const { useAppStore } = await import('./index');
    const seeded = seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: PREV_MONDAY });
    useAppStore.setState(seeded);
    useAppStore.getState().updateAvailability(PROFILE_ID, makeAvailability([1, 3], 2, '18:00'), NOW_MS);
    expect(useAppStore.getState().availability[PROFILE_ID]).toEqual(makeAvailability([1, 3], 2, '18:00'));
    const before = useAppStore.getState().availability;
    expect(() =>
      useAppStore.getState().updateAvailability(PROFILE_ID, makeAvailability([1], 2, '18:00'), NOW_MS),
    ).toThrow(/^updateAvailability: /);
    expect(useAppStore.getState().availability).toBe(before);
  });
});
