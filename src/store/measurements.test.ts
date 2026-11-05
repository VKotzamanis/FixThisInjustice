import { beforeEach, describe, expect, it } from 'vitest';
import { defaultState, useAppStore } from './index';
import { installFakeStorage } from './testStorage';
import { makeProfile } from '../test/fixtures';

const P = 'profile-1';
const NOW = Date.UTC(2026, 8, 7, 12, 0); // [ms] epoch UTC

beforeEach(() => {
  installFakeStorage();
  useAppStore.setState({
    ...defaultState(),
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
  useAppStore.getState().createProfile(makeProfile());
});

function log(massKg: number, role?: 'morning' | 'pre' | 'post'): string {
  return useAppStore.getState().logBodyMass(
    { profileId: P, date: '2026-09-07', massKg, enteredUnit: 'metric', bodyFatPct: null, ...(role === undefined ? {} : { role }) },
    NOW,
  );
}

describe('body-mass corrections (spec R9, audit G03)', () => {
  it('logBodyMass returns the stored id', () => {
    const id = log(80);
    expect(useAppStore.getState().bodyMass[P]?.map((e) => e.id)).toEqual([id]);
  });

  it('edits the measurement and role in place, keeping id, date and loggedAt', () => {
    const id = log(18); // [kg] the typo
    useAppStore.getState().updateBodyMass(P, id, { massKg: 81.6, enteredUnit: 'metric', bodyFatPct: null, role: 'morning' });
    expect(useAppStore.getState().bodyMass[P]).toEqual([
      { id, profileId: P, date: '2026-09-07', massKg: 81.6, enteredUnit: 'metric', bodyFatPct: null, loggedAt: NOW, role: 'morning' },
    ]);
  });

  it('removes the role when the edit says untagged', () => {
    const id = log(80, 'pre');
    useAppStore.getState().updateBodyMass(P, id, { massKg: 80, enteredUnit: 'metric', bodyFatPct: null, role: null });
    expect(useAppStore.getState().bodyMass[P]?.[0]).not.toHaveProperty('role');
  });

  it('refuses an edit the loader would refuse, and an unknown id, writing nothing', () => {
    const id = log(80);
    const before = useAppStore.getState().bodyMass;
    expect(() =>
      useAppStore.getState().updateBodyMass(P, id, { massKg: 600, enteredUnit: 'metric', bodyFatPct: null, role: null }),
    ).toThrow(/updateBodyMass: massKg/);
    expect(() =>
      useAppStore.getState().updateBodyMass(P, 'nope', { massKg: 80, enteredUnit: 'metric', bodyFatPct: null, role: null }),
    ).toThrow(/updateBodyMass: no body-mass entry/);
    expect(useAppStore.getState().bodyMass).toBe(before);
  });

  it('deletes and restores the identical record', () => {
    const a = log(80);
    const b = log(81);
    const removed = useAppStore.getState().deleteBodyMass(P, a);
    expect(useAppStore.getState().bodyMass[P]?.map((e) => e.id)).toEqual([b]);
    expect(removed?.id).toBe(a);
    if (removed === null) throw new Error('nothing removed');
    useAppStore.getState().restoreBodyMass(removed);
    useAppStore.getState().restoreBodyMass(removed); // idempotent
    expect(useAppStore.getState().bodyMass[P]?.map((e) => e.id).sort()).toEqual([a, b].sort());
    expect(useAppStore.getState().deleteBodyMass(P, 'nope')).toBeNull();
  });
});

describe('taking back a drink (audit G07)', () => {
  it('subtracts the volume and removes that one mark, once', () => {
    const s = useAppStore.getState();
    s.addHydration(P, '2026-09-07', 250, NOW); // [mL]
    s.addHydration(P, '2026-09-07', 250, NOW + 1); // [mL]
    useAppStore.getState().removeDrink(P, '2026-09-07', 250, NOW + 1);
    useAppStore.getState().removeDrink(P, '2026-09-07', 250, NOW + 1); // already gone
    expect(useAppStore.getState().hydration[P]).toEqual([
      { profileId: P, date: '2026-09-07', volumeML: 250, marks: [NOW] },
    ]);
  });
});
