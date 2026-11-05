// src/store/db/records.ts
//
// Spec R13: how the in-memory AppState maps onto IndexedDB records. Pure: no IndexedDB, no
// clock. One object store per AppState map field (key = that map's own key: a record id or a
// profile id), plus the `app` store holding the four singleton fields under their own names and
// the meta record (schemaVersion, revision). `schemaVersion` lives only in meta.
import type { AppState } from '../../domain/types';

/**
 * The records database (spec R13). The motivation clip keeps its own database, `fti-assets`
 * (src/domain/motivation/assets.ts): see src/store/db/idb.ts for why there are two.
 */
export const RECORD_DB_NAME = 'fti';

/** The AppState fields stored one entry per record, in a store named after the field. */
export const MAP_STORES = [
  'profiles',
  'availability',
  'plans',
  'cursors',
  'pauses',
  'assignments',
  'sets',
  'bodyMass',
  'hydration',
  'intake',
  'weeklyReviews',
  'reminderSettings',
  'motivation',
  'specimens',
  'capsules',
  'customExercises',
  'notes',
] as const satisfies readonly (keyof AppState)[];
export type MapStore = (typeof MAP_STORES)[number];

/** The AppState fields stored as one record each in the `app` store, keyed by field name. */
export const SINGLETON_KEYS = ['activeProfileId', 'pushDevice', 'setupDraft', 'ui'] as const satisfies readonly (keyof AppState)[];
export type SingletonKey = (typeof SINGLETON_KEYS)[number];

export const APP_STORE = 'app';
/** The meta record's key in the `app` store. */
export const META_KEY = 'meta';
export type StoreName = MapStore | typeof APP_STORE;
export const ALL_STORES: readonly StoreName[] = [...MAP_STORES, APP_STORE];

/*
 * Compile-time exhaustiveness (rule 2): every AppState field is a map store, a singleton, or
 * schemaVersion (meta). A field added to AppState and to neither list fails to compile here
 * instead of silently never being stored.
 */
type Unstored = Exclude<keyof AppState, MapStore | SingletonKey | 'schemaVersion'>;
const EVERY_FIELD_IS_STORED: [Unstored] extends [never] ? true : never = true;
void EVERY_FIELD_IS_STORED;

/** Map stores whose keys are profile ids (the root refinement's PROFILE_KEYED_MAPS). */
export const PROFILE_KEYED_STORES: readonly MapStore[] = MAP_STORES.filter(
  (s) => s !== 'profiles' && s !== 'plans' && s !== 'sets',
);

/**
 * Map stores whose record is a per-profile LIST. Each list item is validated on its own on read
 * (one bad row is quarantined, its neighbours load), and the property named here identifies an
 * item across a rewrite, so unknown keys read with it go back onto the same item (audit B06).
 */
export const LIST_ITEM_ID = {
  pauses: 'id',
  assignments: 'date',
  bodyMass: 'id',
  hydration: 'date',
  intake: 'date',
  weeklyReviews: 'weekStart',
  customExercises: 'id',
} as const satisfies Partial<Record<MapStore, string>>;
export type ListStore = keyof typeof LIST_ITEM_ID;

export function isListStore(store: StoreName): store is ListStore {
  return Object.hasOwn(LIST_ITEM_ID, store);
}

/** One stored record. `value` is what goes to IndexedDB (structured-clonable JSON). */
export interface RecordPut {
  store: StoreName;
  key: string;
  value: unknown;
}
export interface RecordDelete {
  store: StoreName;
  key: string;
}
/** What one commit writes. `clear: true` empties every store except meta first (wipe, replace). */
export interface RecordOps {
  clear: boolean;
  puts: RecordPut[];
  deletes: RecordDelete[];
}

export const NO_OPS: RecordOps = { clear: false, puts: [], deletes: [] };

export function isEmptyOps(ops: RecordOps): boolean {
  return !ops.clear && ops.puts.length === 0 && ops.deletes.length === 0;
}

/** Every record of a document, for a full replace (import) or a test seed. */
export function splitState(state: AppState): RecordPut[] {
  const puts: RecordPut[] = [];
  for (const store of MAP_STORES) {
    for (const [key, value] of Object.entries(state[store])) puts.push({ store, key, value });
  }
  for (const key of SINGLETON_KEYS) puts.push({ store: APP_STORE, key, value: state[key] });
  return puts;
}

/**
 * The records whose identity changed between two documents (spec R13: per-action writes of the
 * records whose identity changed). Actions replace what they touch and keep everything else by
 * reference, so identity is the change signal, exactly as the store's old persistedChanged was.
 */
export function diffStates(prev: AppState, next: AppState): RecordOps {
  const puts: RecordPut[] = [];
  const deletes: RecordDelete[] = [];
  for (const store of MAP_STORES) {
    const a: Record<string, unknown> = prev[store];
    const b: Record<string, unknown> = next[store];
    if (a === b) continue;
    for (const [key, value] of Object.entries(b)) {
      if (!Object.hasOwn(a, key) || a[key] !== value) puts.push({ store, key, value });
    }
    for (const key of Object.keys(a)) {
      if (!Object.hasOwn(b, key)) deletes.push({ store, key });
    }
  }
  for (const key of SINGLETON_KEYS) {
    if (prev[key] !== next[key]) puts.push({ store: APP_STORE, key, value: next[key] });
  }
  return { clear: false, puts, deletes };
}

/**
 * Two batches as one: later puts and deletes of the same record win. A `clear` in `later`
 * discards everything `earlier` held (it is about to be erased anyway).
 */
export function mergeOps(earlier: RecordOps, later: RecordOps): RecordOps {
  if (later.clear) return later;
  const byRecord = new Map<string, { put: RecordPut } | { del: RecordDelete }>();
  const id = (r: { store: string; key: string }): string => `${r.store}\u0000${r.key}`;
  for (const p of earlier.puts) byRecord.set(id(p), { put: p });
  for (const d of earlier.deletes) byRecord.set(id(d), { del: d });
  for (const p of later.puts) byRecord.set(id(p), { put: p });
  for (const d of later.deletes) byRecord.set(id(d), { del: d });
  const puts: RecordPut[] = [];
  const deletes: RecordDelete[] = [];
  for (const entry of byRecord.values()) {
    if ('put' in entry) puts.push(entry.put);
    else deletes.push(entry.del);
  }
  return { clear: earlier.clear, puts, deletes };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The `app` store key an unknown top-level field of an imported fti.v3 document is kept under. */
export function legacyExtraKey(field: string): string {
  return `legacy:${field}`;
}

/**
 * An UNVALIDATED (already migrated) fti.v3 document as raw records, for the first-boot import
 * (spec R13). Nothing is parsed here: assembleState validates what is read back, so an imported
 * record and a record written later go through one validator. A top-level field this build does
 * not know is kept in the `app` store under legacyExtraKey() (audit B06). Returns an error when
 * a map field is not an object, because there is then no record to split it into.
 */
export function splitDocument(doc: Record<string, unknown>): { ok: true; puts: RecordPut[] } | { ok: false; error: string } {
  const puts: RecordPut[] = [];
  const known = new Set<string>([...MAP_STORES, ...SINGLETON_KEYS, 'schemaVersion']);
  for (const store of MAP_STORES) {
    const field = doc[store];
    if (field === undefined) continue;
    if (!isPlainObject(field)) return { ok: false, error: `${store}: expected an object` };
    for (const [key, value] of Object.entries(field)) puts.push({ store, key, value });
  }
  for (const key of SINGLETON_KEYS) {
    if (doc[key] !== undefined) puts.push({ store: APP_STORE, key, value: doc[key] });
  }
  for (const [field, value] of Object.entries(doc)) {
    if (!known.has(field)) puts.push({ store: APP_STORE, key: legacyExtraKey(field), value });
  }
  return { ok: true, puts };
}

/** Records grouped by store then key, the shape a full read returns. */
export function groupRecords(puts: readonly RecordPut[]): Map<StoreName, Map<string, unknown>> {
  const out = new Map<StoreName, Map<string, unknown>>();
  for (const { store, key, value } of puts) {
    let map = out.get(store);
    if (map === undefined) {
      map = new Map<string, unknown>();
      out.set(store, map);
    }
    map.set(key, value);
  }
  return out;
}
