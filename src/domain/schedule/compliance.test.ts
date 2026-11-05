import { describe, expect, it } from 'vitest';
import { complianceWeek, type DayMark } from './compliance';
import { completeSession, pausePlan, postponeSession, startSession } from './cursor';
import { closeWeeks } from './weekly';
import {
  DAY_MS,
  FRIDAY,
  MONDAY,
  NOW_MS,
  PREV_MONDAY,
  PROFILE_ID,
  THURSDAY,
  TUESDAY,
  WEDNESDAY,
  seedState,
} from '../../test/scheduleFixtures';
import type { AppState } from '../types';

const LABELS = ['A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C'];

/** Mon/Wed/Fri preferred, quota 3, programme from `startedOn`. */
function mwf(startedOn = PREV_MONDAY): AppState {
  return seedState({ labels: LABELS, weekdays: [1, 3, 5], weeklySessionTarget: 3, startedOn });
}

function marks(state: AppState, monday: string, today: string): DayMark[] {
  return complianceWeek(state, PROFILE_ID, monday, today).days.map((d) => d.mark);
}

describe('complianceWeek (D06): every cell from the schedule model', () => {
  it('marks a missed preferred Monday missed, today and later planned, rest days none', () => {
    // Running week, today Wednesday, nothing trained on Monday.
    expect(marks(mwf(MONDAY), MONDAY, WEDNESDAY)).toEqual([
      'missed', 'none', 'planned', 'none', 'planned', 'none', 'none',
    ]);
  });

  it('a make-up session on a non-preferred day clears the owed miss', () => {
    const s = completeSession(mwf(MONDAY), PROFILE_ID, TUESDAY, NOW_MS + DAY_MS); // [ms]
    expect(marks(s, MONDAY, WEDNESDAY)).toEqual([
      'none', 'completed', 'planned', 'none', 'planned', 'none', 'none',
    ]);
  });

  it('days before startedOn are blank (setup on Wednesday)', () => {
    expect(marks(mwf(WEDNESDAY), MONDAY, WEDNESDAY)).toEqual([
      'blank', 'blank', 'planned', 'none', 'planned', 'none', 'none',
    ]);
    expect(complianceWeek(mwf(WEDNESDAY), PROFILE_ID, MONDAY, WEDNESDAY).target).toBe(2);
  });

  it('a postponed today reads postponed; an open session reads in progress', () => {
    const postponed = postponeSession(mwf(MONDAY), PROFILE_ID, MONDAY);
    expect(marks(postponed, MONDAY, MONDAY)[0]).toBe('postponed');
    const open = startSession(mwf(MONDAY), PROFILE_ID, MONDAY, NOW_MS);
    expect(marks(open, MONDAY, MONDAY)[0]).toBe('in-progress');
  });

  it('paused days read paused and owe nothing', () => {
    const s = pausePlan(mwf(MONDAY), PROFILE_ID, TUESDAY, null);
    expect(marks(s, MONDAY, FRIDAY)).toEqual([
      'missed', 'paused', 'paused', 'paused', 'paused', 'paused', 'paused',
    ]);
  });

  it('a graded week reads its stored target, not the current quota (D16)', () => {
    let s = mwf(PREV_MONDAY);
    s = completeSession(s, PROFILE_ID, PREV_MONDAY, NOW_MS - 7 * DAY_MS); // [ms]
    s = closeWeeks(s, PROFILE_ID, NOW_MS); // grades week PREV_MONDAY: 1 of 3
    const availability = s.availability[PROFILE_ID];
    if (availability === undefined) throw new Error('fixture: no availability');
    const lowered = { ...s, availability: { [PROFILE_ID]: { ...availability, weeklySessionTarget: 1 } } };
    const week = complianceWeek(lowered, PROFILE_ID, PREV_MONDAY, THURSDAY);
    expect(week.target).toBe(3);
    expect(week.days.map((d) => d.mark)).toEqual([
      'completed', 'none', 'missed', 'none', 'missed', 'none', 'none',
    ]);
  });
});
