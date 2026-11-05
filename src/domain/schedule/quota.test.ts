import { describe, expect, it } from 'vitest';
import { expectedSessions, weeklyQuota } from './quota';
import { projectedCalendar } from './calendar';
import { closeWeeks } from './weekly';
import { pausePlan } from './cursor';
import {
  DAY_MS,
  FRIDAY,
  MONDAY,
  NOW_MS,
  PREV_MONDAY,
  PROFILE_ID,
  seedState,
  WEDNESDAY,
} from '../../test/scheduleFixtures';

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

describe('expectedSessions (D03, D10): the quota pro-rated to the days the week could hold', () => {
  const MWF = [1, 3, 5] as const;
  const SUNDAY_AFTER = '2026-09-13';

  it('asks the full quota of a whole week inside the programme', () => {
    const s = seedState({ labels: ['A', 'B', 'C'], weekdays: [...MWF], weeklySessionTarget: 3 });
    expect(expectedSessions(s, PROFILE_ID, MONDAY, SUNDAY_AFTER)).toBe(3); // [sessions]
  });

  it('asks only the preferred days from startedOn on: set up on Wednesday', () => {
    const s = seedState({ labels: ['A', 'B', 'C'], weekdays: [...MWF], weeklySessionTarget: 3, startedOn: WEDNESDAY });
    expect(expectedSessions(s, PROFILE_ID, MONDAY, SUNDAY_AFTER)).toBe(2); // Wed, Fri
  });

  it('asks nothing after the day the programme completed', () => {
    const base = seedState({ labels: ['A', 'B', 'C'], weekdays: [...MWF], weeklySessionTarget: 3 });
    const cursor = base.cursors[PROFILE_ID];
    if (cursor === undefined) throw new Error('fixture: no cursor');
    const s = { ...base, cursors: { [PROFILE_ID]: { ...cursor, completedOn: MONDAY } } };
    expect(expectedSessions(s, PROFILE_ID, MONDAY, SUNDAY_AFTER)).toBe(1); // Monday only
  });

  it('skips paused days and never exceeds the quota', () => {
    const paused = pausePlan(
      seedState({ labels: ['A', 'B', 'C'], weekdays: [1, 2, 3, 4, 5], weeklySessionTarget: 2 }),
      PROFILE_ID,
      FRIDAY,
      null,
    );
    expect(expectedSessions(paused, PROFILE_ID, MONDAY, SUNDAY_AFTER)).toBe(2); // min(2, Mon-Thu)
    const late = pausePlan(
      seedState({ labels: ['A', 'B', 'C'], weekdays: [...MWF], weeklySessionTarget: 3 }),
      PROFILE_ID,
      WEDNESDAY,
      null,
    );
    expect(expectedSessions(late, PROFILE_ID, MONDAY, SUNDAY_AFTER)).toBe(1); // Monday only
  });

  it('counts a kept finished row before startedOn as inside the span (ROADMAP B1d restart week)', () => {
    const base = seedState({ labels: ['A', 'B', 'C'], weekdays: [...MWF], weeklySessionTarget: 3, startedOn: WEDNESDAY });
    const s = {
      ...base,
      assignments: {
        [PROFILE_ID]: [
          { date: MONDAY, sessionId: 'old', sourceIndex: 0, status: 'completed' as const, startedAt: null, completedAt: NOW_MS, skipReason: null },
        ],
      },
    };
    expect(expectedSessions(s, PROFILE_ID, MONDAY, SUNDAY_AFTER)).toBe(3); // Mon (kept row), Wed, Fri
  });

  it('is 0 without a cursor', () => {
    const s = { ...seedState({ labels: ['A'], weekdays: [...MWF] }), cursors: {} };
    expect(expectedSessions(s, PROFILE_ID, PREV_MONDAY, SUNDAY_AFTER)).toBe(0);
  });
});
