import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { defaultState, useAppStore } from './index';
import { STORAGE_KEY } from './persistence';
import { EMPTY_SESSION } from './sessionMirror';
import { installFakeStorage } from './testStorage';
import { useTodaysSets } from './selectors';
import { startSession } from '../domain/schedule/cursor';
import { makeSet } from '../test/fixtures';
import { MONDAY, PROFILE_ID, TUESDAY, assignmentOn, seedState } from '../test/scheduleFixtures';
import type { AppState, RestTimer } from '../domain/types';

const MON_1800 = Date.UTC(2026, 8, 7, 15, 0); // [ms] Mon 18:00 Athens
const TUE_1000 = Date.UTC(2026, 8, 8, 7, 0); // [ms] Tue 10:00 Athens

function openMonday(): AppState {
  const s = seedState({ labels: ['Push', 'Legs', 'Pull'], weekdays: [1, 3, 5] });
  return startSession(s, PROFILE_ID, MONDAY, MON_1800);
}

beforeEach(() => {
  installFakeStorage();
  useAppStore.setState({
    ...defaultState(),
    session: EMPTY_SESSION,
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
});

describe('the running rest lives on the open assignment (R1, audit C04/B13)', () => {
  const rest: RestTimer = { startedAt: MON_1800, endsAt: MON_1800 + 90_000, durationS: 90 }; // [ms], [ms], [s]

  it('setRestTimer writes it onto the open row and null removes it', () => {
    useAppStore.setState(openMonday());
    useAppStore.getState().setRestTimer(rest);
    expect(assignmentOn(useAppStore.getState(), MONDAY)?.rest).toEqual(rest);
    useAppStore.getState().setRestTimer(null);
    expect(assignmentOn(useAppStore.getState(), MONDAY)).not.toHaveProperty('rest');
  });

  it('writes no document field when no session is open', () => {
    useAppStore.setState(seedState({ labels: ['Push'], weekdays: [1] }));
    const before = useAppStore.getState().assignments;
    useAppStore.getState().setRestTimer(rest);
    expect(useAppStore.getState().assignments).toBe(before);
    expect(useAppStore.getState().session.restTimer).toEqual(rest);
  });

  it('hydrate restores a still-running rest into an empty slice (an iOS relaunch)', () => {
    const doc = openMonday();
    const stored: AppState = {
      ...doc,
      assignments: { [PROFILE_ID]: (doc.assignments[PROFILE_ID] ?? []).map((a) => ({ ...a, rest })) },
    };
    installFakeStorage({ [STORAGE_KEY]: JSON.stringify(stored) });
    vi.spyOn(Date, 'now').mockReturnValue(MON_1800 + 30_000); // [ms] 30 s into the rest
    useAppStore.getState().hydrate();
    expect(useAppStore.getState().session.restTimer).toEqual(rest);
  });

  it('hydrate does not revive a rest that has already ended', () => {
    const doc = openMonday();
    const stored: AppState = {
      ...doc,
      assignments: { [PROFILE_ID]: (doc.assignments[PROFILE_ID] ?? []).map((a) => ({ ...a, rest })) },
    };
    installFakeStorage({ [STORAGE_KEY]: JSON.stringify(stored) });
    vi.spyOn(Date, 'now').mockReturnValue(MON_1800 + 600_000); // [ms] 10 min later
    useAppStore.getState().hydrate();
    expect(useAppStore.getState().session.restTimer).toBeNull();
  });
});

describe('closeStaleSessions (R1)', () => {
  it('closes a session left open yesterday, resets the slice, and reports it once', () => {
    const doc = openMonday();
    useAppStore.setState({
      ...doc,
      sets: { a: makeSet({ id: 'a', profileId: PROFILE_ID, assignmentDate: MONDAY, sessionId: 's-1', loggedAt: MON_1800 + 60_000 }) },
      session: { ...EMPTY_SESSION, activeAssignmentDate: MONDAY },
    });
    const closed = useAppStore.getState().closeStaleSessions(PROFILE_ID, TUE_1000);
    expect(closed).toEqual([{ date: MONDAY, sessionId: 's-1', outcome: 'completed' }]);
    expect(assignmentOn(useAppStore.getState(), MONDAY)?.status).toBe('completed');
    expect(useAppStore.getState().session).toEqual(EMPTY_SESSION);
    expect(useAppStore.getState().status.staleClosures).toEqual(closed);
    useAppStore.getState().acknowledgeStaleClosures();
    expect(useAppStore.getState().status.staleClosures).toEqual([]);
  });

  it('changes nothing and reports nothing when nothing is stale', () => {
    useAppStore.setState(openMonday());
    const before = useAppStore.getState().assignments;
    expect(useAppStore.getState().closeStaleSessions(PROFILE_ID, MON_1800 + 60_000)).toEqual([]);
    expect(useAppStore.getState().assignments).toBe(before);
  });
});

describe('useTodaysSets follows the open session (C15)', () => {
  it("reads the open session's date, not the clock's", () => {
    const doc = openMonday();
    useAppStore.setState({
      ...doc,
      sets: { a: makeSet({ id: 'a', profileId: PROFILE_ID, assignmentDate: MONDAY, sessionId: 's-1' }) },
    });
    vi.spyOn(Date, 'now').mockReturnValue(TUE_1000);
    const { result } = renderHook(() => useTodaysSets());
    expect(result.current.map((s) => s.id)).toEqual(['a']);
    expect(TUESDAY).not.toBe(MONDAY);
  });
});
