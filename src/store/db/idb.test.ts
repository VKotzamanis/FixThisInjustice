import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { idbRecordStore, resetRecordDbForTests } from './idb';
import { ALL_STORES, RECORD_DB_NAME } from './records';

beforeEach(() => {
  // fake-indexeddb keeps its databases on the factory, so a fresh factory is a fresh disk.
  globalThis.indexedDB = new IDBFactory();
  resetRecordDbForTests();
});

const PUT = { clear: false, puts: [{ store: 'sets' as const, key: 'a', value: { id: 'a' } }], deletes: [] };

describe('the IndexedDB record store (R13)', () => {
  it('creates every store on first open and reads an empty database with no meta', async () => {
    const result = await idbRecordStore().read();
    expect(result).toEqual({ ok: true, meta: null, records: expect.any(Map) as unknown });
    const db = await openDB(RECORD_DB_NAME);
    for (const store of ALL_STORES) expect(db.objectStoreNames.contains(store)).toBe(true);
    db.close();
  });

  it('commits a batch in one transaction and bumps the revision', async () => {
    const store = idbRecordStore();
    expect(await store.commit(PUT, 0, 3)).toEqual({ ok: true, revision: 1 });
    const read = await store.read();
    if (!read.ok) throw new Error(read.error);
    expect(read.meta).toEqual({ schemaVersion: 3, revision: 1 });
    expect(read.records.get('sets')?.get('a')).toEqual({ id: 'a' });
  });

  it('refuses a commit from a stale base and writes nothing (B03)', async () => {
    const store = idbRecordStore();
    await store.commit(PUT, 0, 3);
    const stale = { clear: false, puts: [{ store: 'sets' as const, key: 'b', value: { id: 'b' } }], deletes: [] };
    expect(await store.commit(stale, 0, 3)).toEqual({ ok: false, reason: 'stale', revision: 1 });
    const read = await store.read();
    if (!read.ok) throw new Error(read.error);
    expect(read.records.get('sets')?.has('b')).toBe(false);
    expect(read.meta?.revision).toBe(1);
  });

  it('clear empties every store but keeps the meta record (no re-import after a wipe)', async () => {
    const store = idbRecordStore();
    await store.commit(PUT, 0, 3);
    expect(await store.commit({ clear: true, puts: [], deletes: [] }, 1, 3)).toEqual({ ok: true, revision: 2 });
    const read = await store.read();
    if (!read.ok) throw new Error(read.error);
    expect(read.records.get('sets')?.size).toBe(0);
    expect(read.meta).toEqual({ schemaVersion: 3, revision: 2 });
  });

  it('opens a database a newer build upgraded, and keeps the stores it added (B06)', async () => {
    await idbRecordStore().commit(PUT, 0, 3);
    resetRecordDbForTests();
    const first = await openDB(RECORD_DB_NAME);
    const version = first.version;
    first.close();
    const newer = await openDB(RECORD_DB_NAME, version + 1, {
      upgrade(db) {
        db.createObjectStore('futureStore');
      },
    });
    newer.close();
    const read = await idbRecordStore().read();
    if (!read.ok) throw new Error(read.error);
    expect(read.records.get('sets')?.get('a')).toEqual({ id: 'a' });
    const after = await openDB(RECORD_DB_NAME);
    expect(after.objectStoreNames.contains('futureStore')).toBe(true);
    after.close();
  });
});
