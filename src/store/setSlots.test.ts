import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState, useAppStore } from './index';
import { applyLogSet, applyRestoreSet, slotTaken } from './training';
import { installFakeStorage } from './testStorage';
import { EMPTY_SESSION } from './sessionMirror';
import { makeProfile } from '../test/fixtures';
import type { AppState, LoggedSet } from '../domain/types';

const NOW = Date.UTC(2026, 2, 2, 18, 30); // [ms] epoch, UTC
const DAY = '2026-03-02';
const input: Omit<LoggedSet, 'id' | 'loggedAt'> = {
  profileId: 'profile-1',
  assignmentDate: DAY,
  sessionId: 's1',
  exerciseId: 'barbell-bench-press',
  setNumber: 1,
  isBonus: false,
  loadKg: 60, // [kg]
  enteredUnit: 'metric',
  reps: 8, // [repetitions]
  durationS: null,
  rpe: null,
};

function base(status: 'in-progress' | 'completed' = 'in-progress'): AppState {
  const profile = makeProfile();
  return {
    ...defaultState(),
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    assignments: {
      [profile.id]: [
        { date: DAY, sessionId: 's1', sourceIndex: 0, status, startedAt: NOW, completedAt: status === 'completed' ? NOW : null, skipReason: null },
      ],
    },
  };
}

describe('one set per (profile, day, exercise, set number) (C03)', () => {
  it('refuses a second set in a filled slot', () => {
    const once = applyLogSet(base(), input, 'a', NOW);
    expect(slotTaken(once, input)).toBe(true);
    expect(() => applyLogSet(once, input, 'b', NOW)).toThrow(
      `logSet: set 1 of barbell-bench-press on ${DAY} is already logged`,
    );
  });

  it('refuses to restore a deleted set into a slot that has been filled again', () => {
    const once = applyLogSet(base(), input, 'a', NOW);
    const deleted = once.sets['a']!;
    const refilled = applyLogSet({ ...once, sets: {} }, input, 'b', NOW + 1);
    expect(applyRestoreSet(refilled, deleted)).toBe(refilled);
  });
});

describe('a finished session takes no new set unless asked (C10)', () => {
  it('refuses by default and accepts with allowFinished', () => {
    expect(() => applyLogSet(base('completed'), input, 'a', NOW)).toThrow(
      `logSet: the session on ${DAY} is already completed`,
    );
    expect(applyLogSet(base('completed'), input, 'a', NOW, { allowFinished: true }).sets['a']).toBeDefined();
  });
});

describe('the store spends the undo once the slot is re-filled', () => {
  beforeEach(() => {
    installFakeStorage();
    useAppStore.setState({ ...base(), session: EMPTY_SESSION });
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  it('undo restores nothing after a delete and a relog', () => {
    const { id } = useAppStore.getState().logSet(input, NOW);
    useAppStore.getState().deleteSet(id);
    expect(useAppStore.getState().undoAvailable(NOW)).toBe(true);
    useAppStore.getState().logSet({ ...input, reps: 9 }, NOW + 1_000);
    expect(useAppStore.getState().session.undo).toBeNull();
    expect(useAppStore.getState().undoAvailable(NOW + 1_000)).toBe(false);
    useAppStore.getState().undoDelete();
    expect(Object.values(useAppStore.getState().sets).map((s) => s.reps)).toEqual([9]);
  });
});
