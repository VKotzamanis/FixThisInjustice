// src/store/db/preserve.ts
//
// What this build reads but does not understand, kept so a write never destroys it.
//   Audit B06: keys a newer build added (z.object strips them on read) go back onto the same
//   record, and the same list item, when this build rewrites it.
//   Audit B10: a `.catch()` repair (an unreadable sex read as 'nd', an unknown equipment tier as
//   'full-gym', an out-of-range PAL as null) is listed, and the STORED answer is written back
//   unless the user has since changed that field.
//   Quarantined list items stay in their list on disk, after the readable items.
// Pure: no IndexedDB.
import type { z } from '../../domain/zod';
import { ActivityPalStrictSchema, ProfileEquipmentStrictSchema, SexEnumSchema } from '../../domain/schema';
import { LIST_ITEM_ID, isListStore, type RecordOps, type StoreName } from './records';

/** Unknown keys of one stored object: its own, and those of its nested plain objects. */
export interface Extras {
  own: Record<string, unknown>;
  nested: Record<string, Extras>;
}

/** A stored answer a `.catch()` replaced on read (audit B10). */
export interface Repair {
  store: 'profiles';
  key: string;
  path: readonly string[];
  /** The value as stored. */
  stored: unknown;
  /** The value the app runs with. */
  readAs: unknown;
}

export interface Preserved {
  /** By recordId() or itemRecordId(). */
  extras: ReadonlyMap<string, Extras>;
  repairs: readonly Repair[];
  /** By recordId(): the raw list items that failed validation, kept on disk in place. */
  quarantinedItems: ReadonlyMap<string, readonly unknown[]>;
}

export const EMPTY_PRESERVED: Preserved = { extras: new Map(), repairs: [], quarantinedItems: new Map() };

export function recordId(store: StoreName, key: string): string {
  return `${store}\u0000${key}`;
}

export function itemRecordId(store: StoreName, key: string, itemId: string): string {
  return `${store}\u0000${key}\u0000${itemId}`;
}

/**
 * The profile fields whose schema repairs a bad value with `.catch()`, each with the same schema
 * minus the catch. A stored value the strict schema refuses is a repair.
 */
const REPAIRABLE: readonly { path: readonly string[]; strict: z.ZodType }[] = [
  { path: ['body', 'sex'], strict: SexEnumSchema },
  { path: ['equipment'], strict: ProfileEquipmentStrictSchema },
  { path: ['activityPal'], strict: ActivityPalStrictSchema },
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The keys of `raw` that `parsed` lacks, recursively through plain objects (not arrays). */
export function extrasOf(raw: unknown, parsed: unknown): Extras | null {
  if (!isPlainObject(raw) || !isPlainObject(parsed)) return null;
  const own: Record<string, unknown> = {};
  const nested: Record<string, Extras> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!Object.hasOwn(parsed, key)) {
      own[key] = value;
      continue;
    }
    const sub = extrasOf(value, parsed[key]);
    if (sub !== null) nested[key] = sub;
  }
  return Object.keys(own).length === 0 && Object.keys(nested).length === 0 ? null : { own, nested };
}

/** `value` with the unknown keys put back where their parent object still exists. */
export function withExtras(value: unknown, extras: Extras | undefined): unknown {
  if (extras === undefined || !isPlainObject(value)) return value;
  const out: Record<string, unknown> = { ...value };
  for (const [key, v] of Object.entries(extras.own)) {
    if (!Object.hasOwn(out, key)) out[key] = v;
  }
  for (const [key, sub] of Object.entries(extras.nested)) {
    if (Object.hasOwn(out, key)) out[key] = withExtras(out[key], sub);
  }
  return out;
}

function getPath(v: unknown, path: readonly string[]): unknown {
  let at: unknown = v;
  for (const key of path) {
    if (!isPlainObject(at)) return undefined;
    at = at[key];
  }
  return at;
}

function setPath(v: unknown, path: readonly string[], leaf: unknown): unknown {
  const [head, ...rest] = path;
  if (head === undefined || !isPlainObject(v)) return v;
  return { ...v, [head]: rest.length === 0 ? leaf : setPath(v[head], rest, leaf) };
}

export function captureExtras(into: Map<string, Extras>, id: string, raw: unknown, parsed: unknown): void {
  const found = extrasOf(raw, parsed);
  if (found !== null) into.set(id, found);
}

export function captureRepairs(into: Repair[], key: string, raw: unknown, parsed: unknown): void {
  for (const { path, strict } of REPAIRABLE) {
    const stored = getPath(raw, path);
    if (stored === undefined || strict.safeParse(stored).success) continue;
    into.push({ store: 'profiles', key, path, stored, readAs: getPath(parsed, path) });
  }
}

export function listItemId(store: keyof typeof LIST_ITEM_ID, item: unknown): string {
  const id: unknown = isPlainObject(item) ? item[LIST_ITEM_ID[store]] : undefined;
  return typeof id === 'string' ? id : '';
}

/** The value to store for one record: the app's value plus everything preserved for it. */
export function encodeValue(store: StoreName, key: string, value: unknown, preserved: Preserved): unknown {
  if (isListStore(store) && Array.isArray(value)) {
    const items = value.map((item: unknown) =>
      withExtras(item, preserved.extras.get(itemRecordId(store, key, listItemId(store, item)))),
    );
    return [...items, ...(preserved.quarantinedItems.get(recordId(store, key)) ?? [])];
  }
  let out = withExtras(value, preserved.extras.get(recordId(store, key)));
  if (store === 'profiles') {
    for (const repair of preserved.repairs) {
      if (repair.key !== key) continue;
      // Only while the app still holds the substitute: a value the user chose since wins.
      if (getPath(out, repair.path) === repair.readAs) out = setPath(out, repair.path, repair.stored);
    }
  }
  return out;
}

export function encodeOps(ops: RecordOps, preserved: Preserved): RecordOps {
  return {
    clear: ops.clear,
    puts: ops.puts.map((p) => ({ ...p, value: encodeValue(p.store, p.key, p.value, preserved) })),
    deletes: ops.deletes,
  };
}
