import type { AppState } from '../domain/types';
import { CURRENT_SCHEMA_VERSION, parseState } from '../domain/schema';
import { messageOf } from './db/errors';
import { migrate } from '../domain/migrations';
import { assembleState, type QuarantinedRecord, type StoredRecords } from './db/assemble';
import type { MetaRecord, RecordBackend } from './db/backend';
import { broadcastRevisionChannel } from './db/channel';
import { idbRecordStore } from './db/idb';
import type { Preserved, Repair } from './db/preserve';
import { APP_STORE, MAP_STORES, SINGLETON_KEYS, groupRecords, splitDocument } from './db/records';

/**
 * The one storage key, owned by the one module allowed to touch Web Storage
 * (master plan §3; security constraints 9-10). The ESLint no-restricted-globals
 * ban on bare localStorage, and the no-restricted-syntax ban on the qualified
 * window.localStorage / globalThis.localStorage forms, are switched off for this
 * file and nowhere else.
 */
export const STORAGE_KEY = 'fti.v3';

/** Why a load produced no usable state. */
export type LoadFailure =
  /** No document under STORAGE_KEY. A first run, not an error. */
  | 'absent'
  /** A document exists but is not JSON, or fails the schema. Never overwritten. */
  | 'invalid'
  /** Web Storage itself is unreachable: private browsing, blocked context. */
  | 'unavailable';

/**
 * `raw` carries the unvalidated stored text back with every failure so the
 * caller can offer it for export without a second read (master plan §3: on
 * failure keep the last known-good state in memory, show the error, offer
 * export). It is null when nothing was readable.
 */
export type LoadResult =
  | { ok: true; state: AppState }
  | { ok: false; reason: LoadFailure; error: string; raw: string | null };

/**
 * Why a write produced no stored document. Extended, never re-spelled: callers
 * that already switch on 'quota' and 'unavailable' keep compiling, and the new
 * member is the one case where retrying or exporting cannot help.
 */
export type SaveFailure =
  /** The origin's storage quota is exhausted. */
  | 'quota'
  /** Web Storage itself is unreachable: private browsing, blocked context. */
  | 'unavailable'
  /** JSON.stringify threw on the document. Storage was never touched. */
  | 'serialize';

export type SaveResult = { ok: true } | { ok: false; reason: SaveFailure; error: string };

export type ImportResult = { ok: true; state: AppState } | { ok: false; error: string };

/**
 * The raw stored text, unvalidated. The crash-recovery UI needs this: when the
 * store itself threw, a validated read is exactly what is not available, and the
 * user's data still has to be exportable.
 */
export function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Removes this app's document and nothing else. Other owners of origin data
 * (the P7 asset store in IndexedDB) clear themselves from the same caller.
 * Callers must take an export first (master plan §3).
 */
export function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to surface: the key is already unreachable, which is the goal.
    // Deliberately not an empty block; no-empty forbids that.
    return;
  }
}

/**
 * Pretty-printed export. Covers the whole persisted surface (constraint 10) with one
 * deliberate hole: `pushDevice`.
 *
 * WHY THE DEVICE IS WITHHELD. `pushDevice.secret` is not data, it is a CREDENTIAL: it is the
 * bearer token that authorises `PUT` and `DELETE /v1/devices/{id}` against this browser's
 * Worker record (worker/src/schedule.ts validatePut, worker/src/index.ts handleDelete). An
 * export is a file the user mails to themselves, syncs to cloud storage, or hands to someone
 * helping them, and anyone holding that file could silence this device's reminders or
 * overwrite its schedule. Nothing else in the document confers an ability on a reader.
 *
 * The field is set to null HERE, in the export projection, and never in state: the running
 * app keeps its device and its subscription, and the IndexedDB records (and the AM-P2-1
 * rollback mirror, its own JSON.stringify) still keep it in this browser's storage, where it
 * belongs.
 *
 * Present and null rather than absent, so the file shows the reader that the field exists and
 * was emptied on purpose, and so `parseState` takes its nullable branch.
 *
 * WHAT THE IMPORTING BROWSER SEES. It has no device, so the first sync returns "no-device"
 * and uploads nothing. If the imported document also carried `reminderSettings.enabled =
 * true`, the panel reads `status.remindersNeedReenable` ("Reminders need enabling again on
 * this device.") and keeps the toggle on screen, because switching it off and on is the one
 * thing that mints a device for that browser. That is the same two-step recovery the
 * stale-device path already uses (src/app/ReminderSync.tsx), and it is stated in "what this
 * plan does not do" in docs/plans/2026-09-01-05-reminders.md.
 *
 * It read "Reminders are on. Schedule not sent yet." until P8 close-out B, which was false on
 * both halves: nothing was on, and nothing was queued to send.
 */
export function exportJson(state: AppState): string {
  return `${JSON.stringify({ ...state, pushDevice: null }, null, 2)}\n`;
}

/**
 * Import goes through the same validator as every other entry point, and writes
 * nothing: a rejected document must leave both memory and storage untouched
 * (security C1). The caller installs the returned state through the store's
 * replaceState, which is the only writer and the only path.
 */
export function importJson(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `not valid JSON: ${messageOf(e)}` };
  }
  const parsed = parseState(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, state: parsed.state };
}

/*
 * The old console's keys (`fti.console.v2`, `fti.plan.v1`, `fti.video.instance`) are not read,
 * written or removed by this module or any other. Their one-way import and the control that
 * deleted them were dropped (ROADMAP N5, owner ruling 2026-10-18); a device that still holds
 * them keeps them exactly as stored, because removing a user's data is not this code's decision.
 */

/*
 * ---- Spec R13: the IndexedDB engine's entry points ----
 */

/**
 * Amendment AM-P2-1: the rollback mirror. Writes the document text to fti.v3 so a pre-P2 build,
 * which reads only this key, loads data at most one app session old. Best effort by ruling: a
 * full or unreachable store is logged and ignored, because the records in IndexedDB are the
 * copy that counts and the banner must not accuse a write that did succeed there.
 */
export function writeLegacyMirror(text: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch (e) {
    console.warn(`fti.v3 rollback mirror not written: ${messageOf(e)}`);
  }
}

/** The legacy-key half of the browser backend: fti.v3 is read once and removed only by a wipe. */
export function createBrowserBackend(): RecordBackend {
  const records = idbRecordStore();
  const channel = broadcastRevisionChannel();
  return {
    read: () => records.read(),
    commit: (ops, base, version) => records.commit(ops, base, version),
    announce: (revision) => {
      channel.announce(revision);
    },
    onAnnounce: (listener) => channel.subscribe(listener),
    readLegacy: readRaw,
    removeLegacy: clearStorage,
    writeLegacy: writeLegacyMirror,
  };
}

/**
 * The stored records as one unvalidated document, for the recovery export of a refused load
 * (audit B04: the backup is what is stored, not the in-memory default). Pretty-printed like
 * exportJson so a user can read and repair it.
 */
export function rawDocumentText(meta: MetaRecord | null, records: StoredRecords): string {
  const doc: Record<string, unknown> = { schemaVersion: meta?.schemaVersion ?? CURRENT_SCHEMA_VERSION };
  for (const store of MAP_STORES) doc[store] = Object.fromEntries(records.get(store) ?? new Map<string, unknown>());
  const app = records.get(APP_STORE) ?? new Map<string, unknown>();
  for (const key of SINGLETON_KEYS) if (app.has(key)) doc[key] = app.get(key);
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export type LoadOutcome =
  | {
      ok: true;
      state: AppState;
      /** [commits] The stored revision this state was read at; 0 when nothing is stored yet. */
      revision: number;
      quarantine: readonly QuarantinedRecord[];
      repairs: readonly Repair[];
      preserved: Preserved;
      /** True when this boot imported fti.v3 into the empty database. */
      imported: boolean;
    }
  | { ok: false; reason: 'absent'; revision: 0 }
  | { ok: false; reason: 'invalid' | 'unavailable'; error: string; raw: string | null; revision: number };

/**
 * Reads the stored records into a document (spec R13). On a database nothing has written yet,
 * imports fti.v3 first, in ONE transaction that refuses if another instance imported meanwhile,
 * and leaves fti.v3 exactly as it was, as a fallback backup (AGENTS.md rule 7). Never throws.
 */
export async function loadDocument(backend: RecordBackend, attempt = 0): Promise<LoadOutcome> {
  const read = await backend.read();
  if (!read.ok) {
    return { ok: false, reason: 'unavailable', error: read.error, raw: backend.readLegacy(), revision: 0 };
  }
  if (read.meta === null) {
    const text = backend.readLegacy();
    if (text === null) return { ok: false, reason: 'absent', revision: 0 };
    const imported = await importLegacy(backend, text);
    if (imported === 'stale' && attempt === 0) return loadDocument(backend, 1);
    if (imported === 'stale') {
      return { ok: false, reason: 'unavailable', error: 'the database kept changing during the import', raw: text, revision: 0 };
    }
    if (!imported.ok) return { ...imported, raw: text, revision: 0 };
    return { ...imported.assembled, revision: imported.revision, imported: true };
  }
  const raw = (): string => rawDocumentText(read.meta, read.records);
  if (read.meta.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'invalid',
      error: `saved by a newer version of the app (schema ${String(read.meta.schemaVersion)}, this build understands ${String(CURRENT_SCHEMA_VERSION)})`,
      raw: raw(),
      revision: read.meta.revision,
    };
  }
  const assembled = assembleState(read.records);
  if (!assembled.ok) return { ok: false, reason: 'invalid', error: assembled.error, raw: raw(), revision: read.meta.revision };
  return { ...assembled, revision: read.meta.revision, imported: false };
}

type ImportOutcome =
  | { ok: true; revision: number; assembled: Extract<ReturnType<typeof assembleState>, { ok: true }> }
  | { ok: false; reason: 'invalid' | 'unavailable'; error: string }
  | 'stale';

/** fti.v3 -> raw records, written verbatim (unknown keys and invalid records included). */
async function importLegacy(backend: RecordBackend, text: string): Promise<ImportOutcome> {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'invalid', error: `stored document is not JSON: ${messageOf(e)}` };
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return { ok: false, reason: 'invalid', error: 'not a JSON object' };
  }
  const version: unknown = Reflect.get(doc, 'schemaVersion');
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return { ok: false, reason: 'invalid', error: 'missing or non-integer schemaVersion' };
  }
  const migrated = migrate(doc, version, CURRENT_SCHEMA_VERSION);
  if (!migrated.ok) return { ok: false, reason: 'invalid', error: migrated.error };
  if (typeof migrated.value !== 'object' || migrated.value === null) {
    return { ok: false, reason: 'invalid', error: 'not a JSON object' };
  }
  const split = splitDocument(migrated.value as Record<string, unknown>);
  if (!split.ok) return { ok: false, reason: 'invalid', error: split.error };
  // Audit B01 (e2e/b01-recovery.spec.ts): a document the loader refuses is not imported. The
  // records are assembled BEFORE the commit, so a refused fti.v3 leaves the database empty
  // (nothing written) and fti.v3 untouched; a quarantined record still imports as stored.
  const assembled = assembleState(groupRecords(split.puts));
  if (!assembled.ok) return { ok: false, reason: 'invalid', error: assembled.error };
  const committed = await backend.commit({ clear: false, puts: split.puts, deletes: [] }, 0, CURRENT_SCHEMA_VERSION);
  if (committed.ok) return { ok: true, revision: committed.revision, assembled };
  if (committed.reason === 'stale') return 'stale';
  return { ok: false, reason: 'unavailable', error: committed.error };
}

/**
 * The stored records as export text for a recovery screen (audit B04: the backup is what is
 * stored, not the in-memory default); fti.v3 while the database holds nothing. Never throws.
 */
export async function readStoredText(backend: RecordBackend = createBrowserBackend()): Promise<string | null> {
  const read = await backend.read();
  if (read.ok && read.meta !== null) return rawDocumentText(read.meta, read.records);
  return backend.readLegacy();
}

/**
 * Empties every record store and removes fti.v3 without going through the store: the root
 * boundary's clear, which must work when the store is what failed. Resolves true when the
 * database clear committed.
 */
export async function clearDatabase(backend: RecordBackend = createBrowserBackend()): Promise<boolean> {
  const read = await backend.read();
  const base = read.ok ? (read.meta?.revision ?? 0) : 0; // [commits]
  const result = await backend.commit({ clear: true, puts: [], deletes: [] }, base, CURRENT_SCHEMA_VERSION);
  backend.removeLegacy();
  if (result.ok) backend.announce(result.revision);
  return result.ok;
}

/**
 * Audit B04: the records this build could not read and the answers it repaired, as stored, in
 * one file the user can keep or send. Separate from exportJson, whose format is unchanged.
 */
export function exportUnreadable(quarantine: readonly QuarantinedRecord[], repairs: readonly Repair[]): string {
  return `${JSON.stringify({ quarantined: quarantine, repairs }, null, 2)}\n`;
}
