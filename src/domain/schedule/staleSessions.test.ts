import { describe, expect, it } from 'vitest';
import { STALE_SESSION_GRACE_MS, closeStaleSessions, openAssignment } from './staleSessions';
import { assignToday } from './calendar';
import { completeSession, startSession } from './cursor';
import { parseState } from '../schema';
import { makeSet } from '../../test/fixtures';
import {
  MONDAY,
  PROFILE_ID,
  TUESDAY,
  assignmentOn,
  assignmentsOf,
  cursorOf,
  seedState,
} from '../../test/scheduleFixtures';
import type { AppState, LoggedSet } from '../types';

// Profile zone Europe/Athens (UTC+3 in September).
const MON_1800 = Date.UTC(2026, 8, 7, 15, 0); // [ms] Mon 18:00 Athens
const MON_1900 = Date.UTC(2026, 8, 7, 16, 0); // [ms] Mon 19:00 Athens, the last set
const TUE_1000 = Date.UTC(2026, 8, 8, 7, 0); // [ms] Tue 10:00 Athens

function seed(): AppState {
  return seedState({ labels: ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'], weekdays: [1, 3, 5] });
}

function withSets(state: AppState, sets: LoggedSet[]): AppState {
  const map: Record<string, LoggedSet> = {};
  for (const s of sets) map[s.id] = s;
  return { ...state, sets: map };
}

function mondaySet(id: string, loggedAt: number): LoggedSet {
  return makeSet({ id, profileId: PROFILE_ID, assignmentDate: MONDAY, sessionId: 's-1', exerciseId: 'ex-1', loggedAt });
}

function expectValid(state: AppState): void {
  const parsed = parseState(state);
  if (!parsed.ok) throw new Error(parsed.error);
  expect(parsed.state).toEqual(state);
}

describe('closeStaleSessions (spec R1)', () => {
  it('completes an earlier open session that has sets, at its last set, and advances the cursor', () => {
    const started = startSession(seed(), PROFILE_ID, MONDAY, MON_1800);
    const input = withSets(started, [mondaySet('a', MON_1800 + 60_000), mondaySet('b', MON_1900)]);
    const { state, closed } = closeStaleSessions(input, PROFILE_ID, TUESDAY, TUE_1000);
    expect(closed).toEqual([{ date: MONDAY, sessionId: 's-1', outcome: 'completed' }]);
    expect(assignmentOn(state, MONDAY)).toMatchObject({ status: 'completed', completedAt: MON_1900 });
    expect(cursorOf(state).nextSessionIndex).toBe(1);
    expectValid(state);
  });

  it('releases an earlier open session with no sets: the row goes and the session stays next', () => {
    const started = startSession(seed(), PROFILE_ID, MONDAY, MON_1800);
    const { state, closed } = closeStaleSessions(started, PROFILE_ID, TUESDAY, TUE_1000);
    expect(closed).toEqual([{ date: MONDAY, sessionId: 's-1', outcome: 'released' }]);
    expect(assignmentsOf(state)).toEqual([]);
    expect(cursorOf(state).nextSessionIndex).toBe(0);
    expectValid(state);
  });

  it('releases a planned pick left on an earlier day (no past non-terminal row can block)', () => {
    const picked = assignToday(seed(), PROFILE_ID, MONDAY, 'Legs');
    const { state, closed } = closeStaleSessions(picked, PROFILE_ID, TUESDAY, TUE_1000);
    expect(closed.map((c) => c.outcome)).toEqual(['released']);
    expect(assignmentsOf(state)).toEqual([]);
  });

  it('keeps a session open across midnight while its last activity is inside the grace period', () => {
    const start = Date.UTC(2026, 8, 7, 20, 30); // [ms] Mon 23:30 Athens
    const lastSet = Date.UTC(2026, 8, 7, 21, 10); // [ms] Tue 00:10 Athens
    const now = lastSet + STALE_SESSION_GRACE_MS - 60_000; // [ms] one minute inside the grace
    const input = withSets(startSession(seed(), PROFILE_ID, MONDAY, start), [mondaySet('a', lastSet)]);
    const result = closeStaleSessions(input, PROFILE_ID, TUESDAY, now);
    expect(result.closed).toEqual([]);
    expect(result.state).toBe(input);
  });

  it('closes a row whose set is stamped in the future: an instant later than now is no evidence of activity (FIX-2)', () => {
    const YEAR_MS = 365 * 24 * 60 * 60 * 1000; // [ms] 365 d
    const DAY_MS = 24 * 60 * 60 * 1000; // [ms] 1 d
    const future = MON_1900 + YEAR_MS; // [ms] a phone clock one year ahead when the set was logged
    const now = MON_1800 + 21 * DAY_MS; // [ms] three weeks after Monday
    const input = withSets(startSession(seed(), PROFILE_ID, MONDAY, MON_1800), [mondaySet('a', future)]);
    const { state, closed } = closeStaleSessions(input, PROFILE_ID, '2026-09-28', now);
    expect(closed).toEqual([{ date: MONDAY, sessionId: 's-1', outcome: 'completed' }]);
    // completedAt [ms] is clamped to `now`: a completion is never recorded in the future.
    expect(assignmentOn(state, MONDAY)).toMatchObject({ status: 'completed', completedAt: now });
    expectValid(state);
  });

  it("never touches today's open session", () => {
    const started = startSession(seed(), PROFILE_ID, TUESDAY, TUE_1000);
    const result = closeStaleSessions(started, PROFILE_ID, TUESDAY, TUE_1000 + 3_600_000);
    expect(result.state).toBe(started);
  });

  it('returns the argument itself when nothing is stale', () => {
    const s = seed();
    expect(closeStaleSessions(s, PROFILE_ID, TUESDAY, TUE_1000).state).toBe(s);
  });
});

describe('openAssignment', () => {
  it('finds the in-progress row whatever its date, and nothing else', () => {
    const started = startSession(seed(), PROFILE_ID, MONDAY, MON_1800);
    expect(openAssignment(started, PROFILE_ID)?.date).toBe(MONDAY);
    expect(openAssignment(seed(), PROFILE_ID)).toBeNull();
    expect(openAssignment(assignToday(seed(), PROFILE_ID, MONDAY, 'Legs'), PROFILE_ID)).toBeNull();
  });
});

describe('closing a session drops its persisted rest', () => {
  it('completeSession removes `rest` from the row', () => {
    const started = startSession(seed(), PROFILE_ID, MONDAY, MON_1800);
    const rest = { startedAt: MON_1800, endsAt: MON_1800 + 90_000, durationS: 90 }; // [ms], [ms], [s]
    const withRest: AppState = {
      ...started,
      assignments: { [PROFILE_ID]: assignmentsOf(started).map((a) => ({ ...a, rest })) },
    };
    const done = completeSession(withRest, PROFILE_ID, MONDAY, MON_1900);
    expect(assignmentOn(done, MONDAY)).not.toHaveProperty('rest');
    expectValid(done);
  });
});
