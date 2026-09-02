// src/store/reminderActions.test.ts
//
// The reminder store slice (master plan section 6.7), exercised against the real store rather
// than a hand-built harness. Neither action carries domain logic, so what is worth pinning is
// the wiring: that `set` lands on the store the views read, that an unchanged write mints no
// new object (the persistence subscription compares the persisted fields by reference, so a
// gratuitous new object costs a write and re-renders every subscriber), and that both fields
// survive a save/load round trip.
//
// Units: every timestamp is epoch milliseconds, UTC. leadMinutes are minutes before the slot.

import { beforeEach, describe, expect, it } from 'vitest';
import { defaultState, useAppStore } from './index';
import { installFakeStorage } from './testStorage';
import { makeProfile } from '../test/fixtures';
import { parseState } from '../domain/schema';
import type { PushDevice, ReminderSettings } from '../domain/types';

const PROFILE_ID = 'profile-1';

const SETTINGS: ReminderSettings = {
  enabled: true,
  dayOfTime: '08:00', // local wall clock in the profile's zone
  leadMinutes: [120], // [min] before the slot start
};

const DEVICE: PushDevice = {
  deviceId: '0f9b1a2c-3d4e-4f50-8a1b-2c3d4e5f6071',
  secret: 's'.repeat(43),
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'BNcRd', auth: 'tBHI' },
  createdAt: 1_792_990_800_000, // [ms] epoch, UTC
  lastSyncAt: null,
  lastSyncHash: null,
};

beforeEach(() => {
  installFakeStorage();
  useAppStore.setState({
    ...defaultState(),
    activeProfileId: PROFILE_ID,
    profiles: { [PROFILE_ID]: makeProfile({ id: PROFILE_ID }) },
  });
});

describe('setReminderSettings', () => {
  it('writes the settings under the profile id', () => {
    useAppStore.getState().setReminderSettings(PROFILE_ID, SETTINGS);
    expect(useAppStore.getState().reminderSettings[PROFILE_ID]).toEqual(SETTINGS);
  });

  it('throws when the profile id is not one this document owns', () => {
    // A key no profile owns is refused by the schema's root refinement, so writing one would
    // produce a document that cannot be saved and would lose data at the next load.
    expect(() => {
      useAppStore.getState().setReminderSettings('nobody', SETTINGS);
    }).toThrow(/not a known profile/);
  });

  it('mints no new map when the settings are unchanged', () => {
    useAppStore.getState().setReminderSettings(PROFILE_ID, SETTINGS);
    const first = useAppStore.getState().reminderSettings;
    useAppStore.getState().setReminderSettings(PROFILE_ID, { ...SETTINGS, leadMinutes: [120] });
    expect(useAppStore.getState().reminderSettings).toBe(first);
  });

  it('replaces the record when a lead time changes', () => {
    useAppStore.getState().setReminderSettings(PROFILE_ID, SETTINGS);
    const first = useAppStore.getState().reminderSettings;
    useAppStore.getState().setReminderSettings(PROFILE_ID, { ...SETTINGS, leadMinutes: [120, 30] });
    expect(useAppStore.getState().reminderSettings).not.toBe(first);
    expect(useAppStore.getState().reminderSettings[PROFILE_ID]?.leadMinutes).toEqual([120, 30]);
  });

  it('leaves the record of another profile alone', () => {
    useAppStore.setState({
      profiles: {
        [PROFILE_ID]: makeProfile({ id: PROFILE_ID }),
        other: makeProfile({ id: 'other' }),
      },
      reminderSettings: { other: SETTINGS },
    });
    useAppStore.getState().setReminderSettings(PROFILE_ID, { ...SETTINGS, enabled: false });
    expect(useAppStore.getState().reminderSettings['other']).toEqual(SETTINGS);
  });
});

describe('setPushDevice', () => {
  it('stores the device', () => {
    useAppStore.getState().setPushDevice(DEVICE);
    expect(useAppStore.getState().pushDevice).toEqual(DEVICE);
  });

  it('clears the device with null', () => {
    useAppStore.getState().setPushDevice(DEVICE);
    useAppStore.getState().setPushDevice(null);
    expect(useAppStore.getState().pushDevice).toBeNull();
  });

  it('is a no-op when the device is already absent', () => {
    const before = useAppStore.getState();
    useAppStore.getState().setPushDevice(null);
    expect(useAppStore.getState().pushDevice).toBe(before.pushDevice);
  });

  it('is not keyed by profile: the device belongs to the browser', () => {
    // PushDevice is one per device, not per profile (src/domain/types.ts), so this action
    // takes no profile id and needs no requireProfile guard.
    useAppStore.setState({ activeProfileId: null, profiles: {} });
    useAppStore.getState().setPushDevice(DEVICE);
    expect(useAppStore.getState().pushDevice).toEqual(DEVICE);
  });
});

describe('persistence', () => {
  it('both fields survive a schema round trip', () => {
    useAppStore.getState().setReminderSettings(PROFILE_ID, SETTINGS);
    useAppStore.getState().setPushDevice(DEVICE);
    const parsed = parseState(JSON.parse(useAppStore.getState().exportJson()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.reminderSettings[PROFILE_ID]).toEqual(SETTINGS);
    expect(parsed.state.pushDevice).toEqual(DEVICE);
  });
});
