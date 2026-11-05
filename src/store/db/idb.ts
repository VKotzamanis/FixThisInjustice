// src/store/db/idb.ts
//
// Spec R13: the IndexedDB half of the storage engine. One database (RECORD_DB_NAME), one object
// store per AppState map field plus `app` (singletons + meta), out-of-line string keys. The only
// app module besides src/domain/motivation/assets.ts that may open IndexedDB (eslint.config.js).
//
// Why two databases (records here, the motivation clip in `fti-assets`): merging would copy
// clips of up to 150 MiB between databases on upgrade and tie the clip module's version to this
// engine's; no transaction ever spans a record and the clip (resolveVideoSrc falls back when the
// clip is gone). The wipe clears this database first, then the clip (src/ui/settings/DataSection.tsx).
import { openDB, type IDBPDatabase } from 'idb';
import type { StoredRecords } from './assemble';
import type { CommitResult, MetaRecord, ReadResult, RecordStore } from './backend';
import { isQuotaExceeded, messageOf } from './errors';
import { ALL_STORES, APP_STORE, META_KEY, RECORD_DB_NAME, type RecordOps, type StoreName } from './records';


let connection: Promise<IDBPDatabase> | null = null;

/**
 * Opens the database at WHATEVER version it already has, and upgrades (version + 1) only when a
 * store this build needs is missing. A fixed version would make an older build fail to open a
 * database a newer build had upgraded (audit B06, rollback); stores a newer build added are left
 * alone. A rejected open is evicted from the cache: IndexedDB failures are not permanent.
 */
function open(name: string): Promise<IDBPDatabase> {
  connection ??= (async () => {
    let db = await openDB(name);
    const missing = ALL_STORES.filter((s) => !db.objectStoreNames.contains(s));
    if (missing.length === 0) return watch(db);
    const version = db.version + 1;
    db.close();
    db = await openDB(name, version, {
      upgrade(upgrading) {
        for (const store of ALL_STORES) {
          if (!upgrading.objectStoreNames.contains(store)) upgrading.createObjectStore(store);
        }
      },
    });
    return watch(db);
  })().catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

/** A newer build asking to upgrade gets the database: this connection closes and is forgotten. */
function watch(db: IDBPDatabase): IDBPDatabase {
  db.addEventListener('versionchange', () => {
    db.close();
    connection = null;
  });
  return db;
}

/** Drops the cached connection (tests swap globalThis.indexedDB between cases). */
export function resetRecordDbForTests(): void {
  connection = null;
}

function revisionOf(meta: unknown): number {
  const revision: unknown = typeof meta === 'object' && meta !== null ? Reflect.get(meta, 'revision') : undefined;
  return typeof revision === 'number' && Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

function metaOf(raw: unknown): MetaRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const schemaVersion: unknown = Reflect.get(raw, 'schemaVersion');
  return {
    schemaVersion: typeof schemaVersion === 'number' ? schemaVersion : 0,
    revision: revisionOf(raw),
  };
}

function failureOf(e: unknown): 'quota' | 'unavailable' | 'serialize' {
  if (isQuotaExceeded(e)) return 'quota';
  const name: unknown = typeof e === 'object' && e !== null ? Reflect.get(e, 'name') : undefined;
  return name === 'DataCloneError' ? 'serialize' : 'unavailable';
}

export function idbRecordStore(name: string = RECORD_DB_NAME): RecordStore {
  return {
    async read(): Promise<ReadResult> {
      try {
        const db = await open(name);
        const tx = db.transaction([...ALL_STORES], 'readonly');
        const records = new Map<StoreName, Map<string, unknown>>();
        let meta: MetaRecord | null = null;
        await Promise.all(
          ALL_STORES.map(async (store) => {
            const os = tx.objectStore(store);
            const [keys, values] = await Promise.all([os.getAllKeys(), os.getAll()]);
            const map = new Map<string, unknown>();
            keys.forEach((key, i) => {
              if (store === APP_STORE && key === META_KEY) meta = metaOf(values[i]);
              else if (typeof key === 'string') map.set(key, values[i]);
            });
            records.set(store, map);
          }),
        );
        await tx.done;
        const stored: StoredRecords = records;
        return { ok: true, meta, records: stored };
      } catch (e) {
        return { ok: false, reason: 'unavailable', error: messageOf(e) };
      }
    },

    async commit(ops: RecordOps, baseRevision: number, schemaVersion: number): Promise<CommitResult> {
      let db: IDBPDatabase;
      try {
        db = await open(name);
      } catch (e) {
        return { ok: false, reason: failureOf(e), error: messageOf(e) };
      }
      const touched = new Set<StoreName>([APP_STORE]);
      if (ops.clear) for (const s of ALL_STORES) touched.add(s);
      for (const p of ops.puts) touched.add(p.store);
      for (const d of ops.deletes) touched.add(d.store);
      const tx = db.transaction([...touched], 'readwrite');
      try {
        const app = tx.objectStore(APP_STORE);
        const current: unknown = await app.get(META_KEY);
        const stored = revisionOf(current);
        if (stored !== baseRevision) {
          tx.abort();
          await tx.done.catch(() => undefined);
          return { ok: false, reason: 'stale', revision: stored };
        }
        // Every request below is issued in this same turn, so the transaction never idles.
        const requests: Promise<unknown>[] = [];
        if (ops.clear) for (const s of ALL_STORES) requests.push(tx.objectStore(s).clear());
        for (const p of ops.puts) requests.push(tx.objectStore(p.store).put(p.value, p.key));
        for (const d of ops.deletes) requests.push(tx.objectStore(d.store).delete(d.key));
        const revision = baseRevision + 1;
        const meta: MetaRecord = { schemaVersion, revision };
        requests.push(app.put({ ...(typeof current === 'object' && current !== null ? current : {}), ...meta }, META_KEY));
        await Promise.all([...requests, tx.done]);
        return { ok: true, revision };
      } catch (e) {
        await tx.done.catch(() => undefined);
        const error: unknown = tx.error ?? e;
        return { ok: false, reason: failureOf(error), error: messageOf(error) };
      }
    },
  };
}
