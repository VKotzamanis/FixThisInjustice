import { describe, expect, it } from 'vitest';
import { defaultState } from '../../domain/schema';
import { makeProfile, makeSet } from '../../test/fixtures';
import type { AppState } from '../../domain/types';
import {
  ALL_STORES,
  MAP_STORES,
  SINGLETON_KEYS,
  diffStates,
  groupRecords,
  legacyExtraKey,
  mergeOps,
  splitDocument,
  splitState,
} from './records';

function withProfileAndSet(): AppState {
  const profile = makeProfile();
  const set = makeSet({ id: 'set-1', profileId: profile.id });
  return {
    ...defaultState(),
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    sets: { [set.id]: set },
  };
}

describe('the record layout (spec R13)', () => {
  it('has one store per map field plus app, and every other field is a singleton or schemaVersion', () => {
    expect(ALL_STORES).toEqual([...MAP_STORES, 'app']);
    const fields = Object.keys(defaultState()).sort();
    expect([...MAP_STORES, ...SINGLETON_KEYS, 'schemaVersion'].sort()).toEqual(fields);
  });

  it('splitState writes one record per map entry and one per singleton', () => {
    const s = withProfileAndSet();
    const puts = splitState(s);
    expect(puts).toContainEqual({ store: 'sets', key: 'set-1', value: s.sets['set-1'] });
    expect(puts).toContainEqual({ store: 'profiles', key: 'profile-1', value: s.profiles['profile-1'] });
    expect(puts).toContainEqual({ store: 'app', key: 'ui', value: s.ui });
    expect(puts).toContainEqual({ store: 'app', key: 'activeProfileId', value: 'profile-1' });
    expect(puts.filter((p) => p.store === 'app')).toHaveLength(SINGLETON_KEYS.length);
  });
});

describe('diffStates writes only what changed identity', () => {
  it('nothing for the same document', () => {
    const s = withProfileAndSet();
    expect(diffStates(s, s)).toEqual({ clear: false, puts: [], deletes: [] });
  });

  it('one put for an added set, one delete for a removed one, one put for a changed singleton', () => {
    const s = withProfileAndSet();
    const added = makeSet({ id: 'set-2' });
    expect(diffStates(s, { ...s, sets: { ...s.sets, [added.id]: added } }).puts).toEqual([
      { store: 'sets', key: 'set-2', value: added },
    ]);
    expect(diffStates(s, { ...s, sets: {} })).toEqual({ clear: false, puts: [], deletes: [{ store: 'sets', key: 'set-1' }] });
    const ui = { ...s.ui, lastView: 'log' };
    expect(diffStates(s, { ...s, ui })).toEqual({ clear: false, puts: [{ store: 'app', key: 'ui', value: ui }], deletes: [] });
  });

  it('a rebuilt map with the same entries writes nothing', () => {
    const s = withProfileAndSet();
    expect(diffStates(s, { ...s, sets: { ...s.sets } })).toEqual({ clear: false, puts: [], deletes: [] });
  });
});

describe('mergeOps', () => {
  it('lets the later write of a record win and keeps a clear', () => {
    const a = { clear: true, puts: [{ store: 'sets' as const, key: 'x', value: 1 }], deletes: [] };
    const b = { clear: false, puts: [], deletes: [{ store: 'sets' as const, key: 'x' }] };
    expect(mergeOps(a, b)).toEqual({ clear: true, puts: [], deletes: [{ store: 'sets', key: 'x' }] });
    expect(mergeOps(b, a)).toEqual(a);
  });
});

describe('splitDocument (the fti.v3 import)', () => {
  it('keeps every record raw and an unknown top-level field under its own app key (B06)', () => {
    const result = splitDocument({ schemaVersion: 3, sets: { s: { rpe: 7.3 } }, ui: { x: 1 }, futureTopLevel: [1] });
    expect(result).toEqual({
      ok: true,
      puts: [
        { store: 'sets', key: 's', value: { rpe: 7.3 } },
        { store: 'app', key: 'ui', value: { x: 1 } },
        { store: 'app', key: legacyExtraKey('futureTopLevel'), value: [1] },
      ],
    });
  });

  it('refuses a map field that is not an object', () => {
    expect(splitDocument({ schemaVersion: 3, sets: 5 })).toEqual({ ok: false, error: 'sets: expected an object' });
  });

  it('groupRecords groups by store then key', () => {
    const grouped = groupRecords([
      { store: 'sets', key: 'a', value: 1 },
      { store: 'sets', key: 'b', value: 2 },
    ]);
    expect([...(grouped.get('sets') ?? new Map<string, unknown>())]).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });
});
