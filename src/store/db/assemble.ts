// src/store/db/assemble.ts
//
// Spec R13 / audit B01, B04: the stored records become one AppState, validated RECORD BY RECORD.
// An invalid record is quarantined (left exactly as stored, listed to the user, exportable)
// instead of refusing the whole document. Every per-record schema is the AppStateSchema field
// schema itself, applied to a one-entry map, so the record rules cannot drift from the document
// rules (AGENTS.md rule 2). Pure: no IndexedDB.
import { AppStateSchema, CURRENT_SCHEMA_VERSION, defaultState } from '../../domain/schema';
import type { AppState } from '../../domain/types';
import {
  captureExtras,
  captureRepairs,
  itemRecordId,
  listItemId,
  recordId,
  type Extras,
  type Preserved,
  type Repair,
} from './preserve';
import {
  APP_STORE,
  MAP_STORES,
  PROFILE_KEYED_STORES,
  isListStore,
  type MapStore,
  type StoreName,
} from './records';

/** Every stored record by store, then by key. A store with no records may be absent. */
export type StoredRecords = ReadonlyMap<StoreName, ReadonlyMap<string, unknown>>;

/** One stored record (or one item of a per-profile list) this build could not read. */
export interface QuarantinedRecord {
  store: StoreName;
  key: string;
  /** Position in the stored per-profile list, or null for a whole record. */
  index: number | null;
  /** Every validation issue of this record, path then reason, joined by "; " (audit B04). */
  reason: string;
  /** The record exactly as stored. */
  raw: unknown;
}

export type AssembleResult =
  | {
      ok: true;
      state: AppState;
      quarantine: readonly QuarantinedRecord[];
      repairs: readonly Repair[];
      preserved: Preserved;
    }
  | { ok: false; error: string };

const FIELD = AppStateSchema.shape;

type Parsed = { ok: true; value: unknown } | { ok: false; reason: string };

/** Every issue, not the first: a user repairing a file sees all of it at once (audit B04). */
function reasonOf(issues: readonly { path: readonly PropertyKey[]; message: string }[], prefix: string): string {
  if (issues.length === 0) return `${prefix}: unknown validation failure`;
  return issues.map((issue) => `${[prefix, ...issue.path.map(String)].join('.')}: ${issue.message}`).join('; ');
}

/** One record of a map store, through that field's own schema on a one-entry map. */
function parseEntry(store: MapStore, key: string, value: unknown): Parsed {
  const result = FIELD[store].safeParse({ [key]: value });
  if (!result.success) return { ok: false, reason: reasonOf(result.error.issues, store) };
  const data: Record<string, unknown> = result.data;
  return { ok: true, value: data[key] };
}

/**
 * Assembles the document. Refuses as a whole only when a PROFILE record is invalid: every other
 * record type hangs off a profile, so quarantining a profile would orphan its whole history and
 * open first-run setup over it (audit B01); the recovery screen is the honest answer there.
 */
export function assembleState(stored: StoredRecords): AssembleResult {
  const quarantine: QuarantinedRecord[] = [];
  const extras = new Map<string, Extras>();
  const repairs: Repair[] = [];
  const quarantinedItems = new Map<string, unknown[]>();
  const records = (store: StoreName): ReadonlyMap<string, unknown> => stored.get(store) ?? new Map<string, unknown>();
  const out: Record<string, Record<string, unknown>> = {};

  // Profiles first: every other map is checked against their ids. Every bad profile is named
  // before refusing, so one refusal lists all of them (audit B04).
  const profiles: Record<string, unknown> = {};
  const refusals: string[] = [];
  for (const [key, raw] of records('profiles')) {
    const parsed = parseEntry('profiles', key, raw);
    if (!parsed.ok) {
      refusals.push(`profiles.${key}: ${parsed.reason}`);
      continue;
    }
    const id: unknown = Reflect.get(parsed.value as object, 'id');
    if (id !== key) {
      refusals.push(`profiles.${key}: profile record key "${key}" does not match its id "${String(id)}"`);
      continue;
    }
    profiles[key] = parsed.value;
    captureExtras(extras, recordId('profiles', key), raw, parsed.value);
    captureRepairs(repairs, key, raw, parsed.value);
  }
  if (refusals.length > 0) return { ok: false, error: refusals.join('; ') };
  out.profiles = profiles;
  const profileIds = new Set(Object.keys(profiles));

  for (const store of MAP_STORES) {
    if (store === 'profiles') continue;
    const map: Record<string, unknown> = {};
    for (const [key, raw] of records(store)) {
      if (PROFILE_KEYED_STORES.includes(store) && !profileIds.has(key)) {
        quarantine.push({
          store,
          key,
          index: null,
          reason: `${store}.${key}: ${store} is keyed by profile id, and "${key}" is not a known profile`,
          raw,
        });
        continue;
      }
      if (isListStore(store)) {
        if (!Array.isArray(raw)) {
          quarantine.push({ store, key, index: null, reason: `${store}.${key}: expected a list`, raw });
          continue;
        }
        const items: unknown[] = [];
        raw.forEach((item: unknown, index) => {
          const parsed = parseEntry(store, key, [item]);
          if (!parsed.ok) {
            quarantine.push({ store, key, index, reason: parsed.reason.replace(`${store}.${key}.0`, `${store}.${key}.${String(index)}`), raw: item });
            quarantinedItems.set(recordId(store, key), [...(quarantinedItems.get(recordId(store, key)) ?? []), item]);
            return;
          }
          const value = (parsed.value as unknown[])[0];
          items.push(value);
          captureExtras(extras, itemRecordId(store, key, listItemId(store, value)), item, value);
        });
        map[key] = items;
        continue;
      }
      const parsed = parseEntry(store, key, raw);
      if (!parsed.ok) {
        quarantine.push({ store, key, index: null, reason: parsed.reason, raw });
        continue;
      }
      if (store === 'sets' && Reflect.get(parsed.value as object, 'id') !== key) {
        quarantine.push({ store, key, index: null, reason: `sets.${key}: set record key "${key}" does not match its id`, raw });
        continue;
      }
      map[key] = parsed.value;
      captureExtras(extras, recordId(store, key), raw, parsed.value);
    }
    out[store] = map;
  }

  const app = records(APP_STORE);
  const fallback = defaultState();
  const hasProfiles = profileIds.size > 0;

  let activeProfileId: string | null = null;
  const rawActive = app.get('activeProfileId');
  const active = FIELD.activeProfileId.safeParse(rawActive ?? null);
  if (active.success && (active.data === null || profileIds.has(active.data))) {
    activeProfileId = active.data;
  } else {
    quarantine.push({ store: APP_STORE, key: 'activeProfileId', index: null, reason: 'activeProfileId: not a known profile', raw: rawActive });
  }
  // A document with profiles always has an active one: null would open first-run setup over them.
  if (activeProfileId === null && hasProfiles) activeProfileId = [...profileIds].sort()[0] ?? null;

  const rawDevice = app.get('pushDevice');
  const device = FIELD.pushDevice.safeParse(rawDevice ?? null);
  if (!device.success) {
    quarantine.push({ store: APP_STORE, key: 'pushDevice', index: null, reason: reasonOf(device.error.issues, 'pushDevice'), raw: rawDevice });
  } else {
    captureExtras(extras, recordId(APP_STORE, 'pushDevice'), rawDevice, device.data);
  }

  const rawDraft = app.get('setupDraft');
  // SetupDraftSchema catches to null: a corrupt draft costs the draft, never the document.
  const draft = FIELD.setupDraft.parse(rawDraft ?? null);

  const rawUi = app.get('ui');
  let ui = fallback.ui;
  if (rawUi !== undefined) {
    const parsedUi = FIELD.ui.safeParse(rawUi);
    if (parsedUi.success) {
      ui = parsedUi.data;
      captureExtras(extras, recordId(APP_STORE, 'ui'), rawUi, parsedUi.data);
    } else {
      quarantine.push({ store: APP_STORE, key: 'ui', index: null, reason: reasonOf(parsedUi.error.issues, 'ui'), raw: rawUi });
      // Preferences only. A user with profiles has met the intro and the boot already.
      ui = { ...fallback.ui, introSeen: hasProfiles, bootSeen: hasProfiles };
    }
  }

  // Every field below was produced by its own AppStateSchema field schema above.
  const state = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeProfileId,
    ...out,
    pushDevice: device.success ? device.data : null,
    setupDraft: draft,
    ui,
  } as AppState;
  return {
    ok: true,
    state,
    quarantine,
    repairs,
    preserved: { extras, repairs, quarantinedItems },
  };
}
