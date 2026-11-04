import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState, useAppStore } from './index';
import { installFakeStorage } from './testStorage';
import { makeProfile } from '../test/fixtures';
import { planOf, seedState } from '../test/scheduleFixtures';
import type { Availability } from '../domain/types';

const AVAILABILITY: Availability = {
  slots: [
    { weekday: 1, startTime: '18:00', expectedDurationS: 3600 }, // [s]
    { weekday: 3, startTime: '18:00', expectedDurationS: 3600 },
  ],
  weeklySessionTarget: 2, // [sessions/week]
};
const PLAN = planOf(seedState({ labels: ['A', 'B'], weekdays: [1, 3] }));

beforeEach(() => {
  installFakeStorage();
  useAppStore.setState({
    ...defaultState(),
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
});

describe('every write of user input parses with the loader schema (R5)', () => {
  it('createProfile refuses an 81-character name and writes nothing (A01/B02)', () => {
    expect(() => useAppStore.getState().createProfile(makeProfile({ displayName: 'A'.repeat(81) }))).toThrow(
      /createProfile: displayName/,
    );
    expect(useAppStore.getState().profiles).toEqual({});
  });

  it('setAvailability refuses a cleared start time (A01 path 1)', () => {
    useAppStore.getState().createProfile(makeProfile());
    const bad: Availability = { ...AVAILABILITY, slots: [{ weekday: 1, startTime: '', expectedDurationS: 3600 }], weeklySessionTarget: 1 };
    expect(() => useAppStore.getState().setAvailability('profile-1', bad)).toThrow(/setAvailability: slots/);
    expect(useAppStore.getState().availability).toEqual({});
  });

  it('updateProfile refuses a name over the cap', () => {
    useAppStore.getState().createProfile(makeProfile());
    expect(() => useAppStore.getState().updateProfile('profile-1', { displayName: 'A'.repeat(81) })).toThrow(
      /updateProfile: displayName/,
    );
    expect(useAppStore.getState().profiles['profile-1']?.displayName).toBe('Test subject');
  });

  it('logIntake refuses a negative total', () => {
    useAppStore.getState().createProfile(makeProfile());
    expect(() =>
      useAppStore.getState().logIntake('profile-1', { profileId: 'profile-1', date: '2026-03-02', kcal: -1, proteinG: 100 }),
    ).toThrow(/logIntake: kcal/);
  });

  it('setReminderSettings refuses a cleared time (B02 latent)', () => {
    useAppStore.getState().createProfile(makeProfile());
    expect(() =>
      useAppStore.getState().setReminderSettings('profile-1', { enabled: true, dayOfTime: '', leadMinutes: [120] }),
    ).toThrow(/setReminderSettings: dayOfTime/);
  });
});

describe('completeSetup (R5, A14)', () => {
  it('stores profile, availability, plan and cursor, and clears the draft, in one write', () => {
    const listener = vi.fn();
    const unsubscribe = useAppStore.subscribe(listener);
    useAppStore.getState().completeSetup({ profile: makeProfile(), availability: AVAILABILITY, plan: PLAN, startedOn: '2026-03-02' });
    unsubscribe();
    const s = useAppStore.getState();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(s.activeProfileId).toBe('profile-1');
    expect(s.availability['profile-1']).toEqual(AVAILABILITY);
    expect(s.cursors['profile-1']).toMatchObject({ nextSessionIndex: 0, startedOn: '2026-03-02' });
    expect(s.setupDraft).toBeNull();
  });

  it('writes nothing when any part is refused', () => {
    const bad: Availability = { ...AVAILABILITY, slots: [{ weekday: 1, startTime: '', expectedDurationS: 3600 }], weeklySessionTarget: 1 };
    expect(() =>
      useAppStore.getState().completeSetup({ profile: makeProfile(), availability: bad, plan: PLAN, startedOn: '2026-03-02' }),
    ).toThrow(/completeSetup/);
    expect(useAppStore.getState().profiles).toEqual({});
  });
});
