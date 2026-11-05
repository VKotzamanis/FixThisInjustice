// src/store/db/backend.ts
//
// Spec R13: what the store needs from storage, as one interface with two implementations: the
// browser's (IndexedDB + BroadcastChannel + the legacy fti.v3 key, src/store/persistence.ts) and
// an in-memory one for tests (./memoryBackend.ts), so no unit test needs IndexedDB or Web Storage.
import type { StoredRecords } from './assemble';
import type { RecordOps } from './records';

/** The meta record in the `app` store. Absent on a database nothing has written yet. */
export interface MetaRecord {
  /** The AppState schema version the records were written under (CURRENT_SCHEMA_VERSION). */
  schemaVersion: number;
  /** [commits] Increments by one per committed transaction; 0 = nothing written yet. */
  revision: number;
}

export type ReadResult =
  | { ok: true; meta: MetaRecord | null; records: StoredRecords }
  | { ok: false; reason: 'unavailable'; error: string };

export type CommitResult =
  | { ok: true; revision: number }
  /** Another instance committed first: nothing was written; `revision` is the stored one. */
  | { ok: false; reason: 'stale'; revision: number }
  /** 'serialize': a value IndexedDB cannot clone (DataCloneError); retrying the same value fails. */
  | { ok: false; reason: 'quota' | 'unavailable' | 'serialize'; error: string };

/** The record half: one read of everything, one readwrite transaction per commit. */
export interface RecordStore {
  read(): Promise<ReadResult>;
  /**
   * Applies `ops` in ONE readwrite transaction and bumps the revision, or writes nothing.
   * Refused as 'stale' unless the stored revision equals `baseRevision` (absent meta = 0).
   * `schemaVersion` is stamped into meta.
   */
  commit(ops: RecordOps, baseRevision: number, schemaVersion: number): Promise<CommitResult>;
}

export interface RecordBackend extends RecordStore {
  /** Tells every other instance of the app that `revision` was committed. */
  announce(revision: number): void;
  /** Called with each revision another instance announces. Returns the unsubscribe. */
  onAnnounce(listener: (revision: number) => void): () => void;
  /** The pre-R13 document text under fti.v3, or null. Read once, at first boot. */
  readLegacy(): string | null;
  /** Removes fti.v3. Called by the wipe only: the import leaves it as a fallback (rule 7). */
  removeLegacy(): void;
  /**
   * Amendment AM-P2-1: writes the whole document to fti.v3 so a rolled-back pre-P2 build finds
   * recent data. Best effort: never throws, a failure (quota) is logged and otherwise ignored.
   */
  writeLegacy(text: string): void;
}
