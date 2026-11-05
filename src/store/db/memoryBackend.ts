// src/store/db/memoryBackend.ts
//
// The storage engine's test double (spec R13): the same contract as the browser backend, kept in
// a plain object. Two backends built on one MemoryDisk are two instances of the app on one
// origin. No IndexedDB and no Web Storage, so the existing suites need neither.
import type { CommitResult, MetaRecord, ReadResult, RecordBackend } from './backend';
import { ALL_STORES, APP_STORE, type RecordOps, type StoreName } from './records';

export interface MemoryDisk {
  records: Map<StoreName, Map<string, unknown>>;
  meta: MetaRecord | null;
  legacy: string | null;
  /** Every announce, to every backend on this disk except the sender. */
  listeners: Set<{ from: object; listener: (revision: number) => void }>;
}

export function createMemoryDisk(opts: { legacy?: string | null } = {}): MemoryDisk {
  return { records: new Map(), meta: null, legacy: opts.legacy ?? null, listeners: new Set() };
}

export interface MemoryBackend extends RecordBackend {
  disk: MemoryDisk;
  /** Every batch this backend committed, in order (after encoding). */
  commits: RecordOps[];
  /** The next commit fails with this reason instead of writing. */
  failNextCommit(reason: 'quota' | 'unavailable' | 'serialize'): void;
  /** Every read fails as unavailable (a blocked IndexedDB). */
  makeUnavailable(): void;
}

export function createMemoryBackend(opts: { disk?: MemoryDisk; legacy?: string | null } = {}): MemoryBackend {
  const disk = opts.disk ?? createMemoryDisk({ legacy: opts.legacy ?? null });
  const self = {};
  let failNext: 'quota' | 'unavailable' | 'serialize' | null = null;
  let unavailable = false;
  const commits: RecordOps[] = [];
  return {
    disk,
    commits,
    failNextCommit(reason) {
      failNext = reason;
    },
    makeUnavailable() {
      unavailable = true;
    },
    read(): Promise<ReadResult> {
      if (unavailable) return Promise.resolve({ ok: false, reason: 'unavailable', error: 'blocked' });
      const records = new Map<StoreName, Map<string, unknown>>();
      for (const [store, map] of disk.records) records.set(store, new Map(structuredClone([...map])));
      return Promise.resolve({ ok: true, meta: disk.meta === null ? null : { ...disk.meta }, records });
    },
    commit(ops: RecordOps, baseRevision: number, schemaVersion: number): Promise<CommitResult> {
      const stored = disk.meta?.revision ?? 0;
      if (stored !== baseRevision) return Promise.resolve({ ok: false, reason: 'stale', revision: stored });
      if (failNext !== null) {
        const reason = failNext;
        failNext = null;
        return Promise.resolve({ ok: false, reason, error: `memory backend: ${reason}` });
      }
      if (ops.clear) for (const store of ALL_STORES) disk.records.delete(store);
      const at = (store: StoreName): Map<string, unknown> => {
        let map = disk.records.get(store);
        if (map === undefined) {
          map = new Map();
          disk.records.set(store, map);
        }
        return map;
      };
      // structuredClone: what IndexedDB stores is a copy, never the live object.
      for (const p of ops.puts) at(p.store).set(p.key, structuredClone(p.value));
      for (const d of ops.deletes) at(d.store).delete(d.key);
      disk.meta = { schemaVersion, revision: baseRevision + 1 };
      commits.push(structuredClone(ops));
      return Promise.resolve({ ok: true, revision: baseRevision + 1 });
    },
    announce(revision: number): void {
      for (const l of disk.listeners) if (l.from !== self) l.listener(revision);
    },
    onAnnounce(listener: (revision: number) => void): () => void {
      const entry = { from: self, listener };
      disk.listeners.add(entry);
      return () => {
        disk.listeners.delete(entry);
      };
    },
    readLegacy(): string | null {
      return disk.legacy;
    },
    removeLegacy(): void {
      disk.legacy = null;
    },
  };
}

/** The `app` store's records on a memory disk, for assertions. */
export function appRecords(disk: MemoryDisk): Map<string, unknown> {
  return disk.records.get(APP_STORE) ?? new Map<string, unknown>();
}
