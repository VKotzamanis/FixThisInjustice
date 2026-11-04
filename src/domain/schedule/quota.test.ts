import { describe, expect, it } from 'vitest';
import { weeklyQuota } from './quota';
import { projectedCalendar } from './calendar';
import { closeWeeks } from './weekly';
import { DAY_MS, MONDAY, NOW_MS, PROFILE_ID, seedState } from '../../test/scheduleFixtures';

describe('weeklyQuota (AM-5)', () => {
  it('uses the availability target for both forecast and grading when the plan differs', () => {
    const state = seedState({
      labels: ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'],
      weekdays: [1, 2, 3, 4, 5],
      sessionsPerWeek: 5,
      weeklySessionTarget: 2,
    });
    const quota = weeklyQuota(state, PROFILE_ID);
    expect(quota).toBe(2); // [sessions/week]
    expect(projectedCalendar(state, PROFILE_ID, MONDAY, 7).filter((d) => d.projectedSession))
      .toHaveLength(quota);
    const closed = closeWeeks(state, PROFILE_ID, NOW_MS + 7 * DAY_MS); // [ms] next Monday
    expect(closed.weeklyReviews[PROFILE_ID]?.[0]?.target).toBe(quota);
  });

  it('returns zero without availability; forecasting serves nothing and grading stays a no-op', () => {
    const state = {
      ...seedState({ labels: ['Push', 'Legs', 'Pull'], weekdays: [1, 3, 5] }),
      availability: {},
    };
    expect(weeklyQuota(state, PROFILE_ID)).toBe(0);
    expect(projectedCalendar(state, PROFILE_ID, MONDAY, 7).every((d) => d.projectedSession === null))
      .toBe(true);
    expect(closeWeeks(state, PROFILE_ID, NOW_MS + 7 * DAY_MS)).toBe(state);
  });
});
