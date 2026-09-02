import type { AppState } from '../domain/types';
import { parseState } from '../domain/schema';

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
 * A quota failure must never be swallowed (finding H3 / A42: the legacy store
 * discarded it and kept rendering healthy-looking in-memory data). Browsers
 * disagree on how they report it, so check the standard name, the Firefox
 * legacy name, and both legacy DOMException codes.
 *
 * The check is structural rather than `e instanceof DOMException`: the thrown
 * value can come from another realm (an iframe, a worker) where instanceof
 * fails against this realm's constructor, and the legacy Safari form is not a
 * DOMException at all. Name and code are what the platform actually guarantees.
 */
function isQuotaExceeded(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const name: unknown = Reflect.get(e, 'name');
  const code: unknown = Reflect.get(e, 'code');
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 || // DOMException.QUOTA_EXCEEDED_ERR
    code === 1014 // Firefox NS_ERROR_DOM_QUOTA_REACHED
  );
}

/**
 * The thrown value's message, read structurally for the same reason
 * isQuotaExceeded is: jsdom's DOMException is not an instanceof this realm's
 * Error, and a cross-realm throw is not either, so `e instanceof Error` would
 * silently degrade a real message to "Name: message" from String(e).
 */
function messageOf(e: unknown): string {
  if (typeof e === 'object' && e !== null) {
    const message: unknown = Reflect.get(e, 'message');
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return String(e);
}

/** Reads and validates the persisted document. Never throws. */
export function load(): LoadResult {
  let text: string | null;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    // Storage can be unavailable outright: Safari private browsing, a blocked
    // third-party context, or a user setting that disables site data.
    return { ok: false, reason: 'unavailable', error: messageOf(e), raw: null };
  }

  if (text === null) return { ok: false, reason: 'absent', error: 'no stored document', raw: null };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      reason: 'invalid',
      error: `stored document is not JSON: ${messageOf(e)}`,
      raw: text,
    };
  }

  const parsed = parseState(raw);
  if (!parsed.ok) return { ok: false, reason: 'invalid', error: parsed.error, raw: text };
  return { ok: true, state: parsed.state };
}

/**
 * Writes the document. The caller surfaces a failed write; it is never silent.
 *
 * Serialisation and storage are separate steps because they fail for opposite
 * reasons and need opposite advice. A store that is full or unreachable leaves
 * the in-memory document intact, so "export it now" is the recovery; a document
 * JSON.stringify cannot handle would break that export too, and the fault is in
 * the state, not the browser. Folding both into 'unavailable' told the user to
 * do the one thing that could not work.
 */
export function save(state: AppState): SaveResult {
  let text: string;
  try {
    text = JSON.stringify(state);
  } catch (e) {
    return { ok: false, reason: 'serialize', error: messageOf(e) };
  }

  try {
    localStorage.setItem(STORAGE_KEY, text);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: isQuotaExceeded(e) ? 'quota' : 'unavailable',
      error: messageOf(e),
    };
  }
}

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

/** Pretty-printed export. Covers the whole persisted surface (constraint 10). */
export function exportJson(state: AppState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
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

/**
 * The keys the legacy console owned, none of them coordinated with the others
 * (security review M5): the store itself (legacy/console-store.jsx:6), a dead
 * prototype store (legacy/core.jsx:6) and the video-instance preference
 * (legacy/console-video.jsx:30). `fti.v3` is not among them and is never touched
 * by anything below.
 */
export const LEGACY_V2_KEY = 'fti.console.v2';
export const LEGACY_KEYS: readonly string[] = [LEGACY_V2_KEY, 'fti.plan.v1', 'fti.video.instance'];

/**
 * The legacy document as text, unparsed.
 *
 * Nothing here inspects the payload. The migration owns every judgement about
 * its shape (src/domain/migrations/v2.ts), so a document this module could not
 * make sense of still reaches the wizard, which can report why rather than
 * behaving as though there were nothing to import.
 *
 * Null when the key is absent or Web Storage is unreachable. Those two are not
 * the same fact, but they admit the same action: there is nothing to offer.
 */
export function readLegacyV2Raw(): string | null {
  return readLegacyKey(LEGACY_V2_KEY);
}

/**
 * One stored key, read defensively. Safari private browsing and blocked
 * third-party contexts throw on any access, and an absent key and an
 * unreachable store admit the same action: there is nothing to offer.
 */
function readLegacyKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Not an empty block; no-empty forbids that.
    return null;
  }
}

/**
 * Every legacy key on this device, as one JSON envelope, or null when none of
 * them is present.
 *
 * WHY AN ENVELOPE AND NOT THE v2 TEXT. `deleteLegacyV2` removes all three keys.
 * The export that gates it used to carry only `fti.console.v2`, so the dead
 * prototype store and the video-instance preference were destroyed with no copy
 * taken (security review 10 / M5). The backup now covers exactly what the
 * delete removes.
 *
 * Every value is the RAW text or null, never a parse of it. The `fti.plan.v1`
 * payload was never this app's to interpret, and a legacy document that is not
 * valid JSON still has to survive into the backup. Pretty-printed and
 * newline-terminated, matching `exportJson`: both are files a user opens.
 */
export function readLegacyBundle(): string | null {
  const entries: Record<string, string | null> = {};
  let present = false;
  for (const key of LEGACY_KEYS) {
    const raw = readLegacyKey(key);
    entries[key] = raw;
    if (raw !== null) present = true;
  }
  if (!present) return null;
  return `${JSON.stringify(entries, null, 2)}\n`;
}

/** True when a legacy document the MIGRATION can read is on this device. */
export function hasLegacyV2(): boolean {
  return readLegacyV2Raw() !== null;
}

/**
 * True when ANY key the legacy app owned is still on this device.
 *
 * Deliberately a second question rather than a widening of `hasLegacyV2`: the
 * migration needs `fti.console.v2` specifically and must not be offered without
 * it, whereas the delete reaches all three. A device holding only `fti.plan.v1`
 * has legacy data to clean up and nothing to import (security review 10 / M5).
 */
export function hasAnyLegacyKey(): boolean {
  return LEGACY_KEYS.some((key) => readLegacyKey(key) !== null);
}

/**
 * Removes every key the legacy app owned, and only those.
 *
 * Called after the migrated document has been written and the write confirmed,
 * never before: the legacy text is the only copy of whatever the migration
 * refused, so deleting it earlier would destroy the evidence for the report the
 * user was just shown.
 */
export function deleteLegacyV2(): void {
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Already unreachable, which is the outcome asked for. Nothing to surface.
      continue;
    }
  }
}
