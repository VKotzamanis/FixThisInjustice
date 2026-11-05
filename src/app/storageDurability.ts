// src/app/storageDurability.ts
//
// Spec R8 (audit E03, B09): ask the browser to keep this origin's storage (the `fti.v3` document
// and the clip) out of automatic eviction, and say in Settings > Data what it answered.
//
// MDN, Storage quotas and eviction criteria (read 2026-11-04,
// https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria):
// best-effort data "persists as long as the origin is below its quota, the device has enough
// storage space, and the user doesn't choose to delete the data"; persistent data "is only
// evicted, or deleted, if the user chooses to". Firefox shows a permission popup for persist();
// Safari and Chromium decide from the user's interaction history with no prompt.
//
// WHEN IT ASKS (so Firefox's popup never appears unprompted at a cold launch):
//  1. right after setup completes (a profile appears in this page life),
//  2. at a launch with a profile while running installed (Chromium grants installed apps), and
//  3. when the user taps Request Persistence in Settings > Data.
// Otherwise a launch only READS persisted(), which never prompts.
import { useSyncExternalStore } from 'react';

export type Durability = 'unknown' | 'unsupported' | 'persistent' | 'best-effort';

/** The slice of StorageManager used here; jsdom and old browsers have neither method. */
export interface DurabilityApi {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

let state: Durability = 'unknown';
const listeners = new Set<() => void>();

function set(next: Durability): void {
  state = next;
  for (const listener of listeners) listener();
}

function api(): DurabilityApi | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.storage;
}

/** Reads the current answer without asking. Never prompts. */
export async function readDurability(storage: DurabilityApi | undefined = api()): Promise<Durability> {
  if (storage?.persisted === undefined) {
    set('unsupported');
    return 'unsupported';
  }
  try {
    const next: Durability = (await storage.persisted()) ? 'persistent' : 'best-effort';
    set(next);
    return next;
  } catch {
    set('unsupported');
    return 'unsupported';
  }
}

/** Asks for persistence. May show Firefox's permission popup; call after a user action. */
export async function requestDurability(storage: DurabilityApi | undefined = api()): Promise<Durability> {
  if (storage?.persist === undefined) return readDurability(storage);
  try {
    const next: Durability = (await storage.persist()) ? 'persistent' : 'best-effort';
    set(next);
    return next;
  } catch {
    // TypeError when the origin is opaque or storage is disabled (MDN, StorageManager.persist).
    set('unsupported');
    return 'unsupported';
  }
}

export interface DurabilityWatchDeps {
  /** The stored document has been read (status.hydrated): before it, no profile is known. */
  ready: () => boolean;
  hasProfile: () => boolean;
  /** Subscribes to store changes; returns the unsubscribe. */
  subscribeStore: (listener: () => void) => () => void;
  standalone: () => boolean;
  storage?: DurabilityApi | undefined;
}

/**
 * Called once from main.tsx. When the document is first read: asks if a profile exists and the
 * app runs installed, else only reads. Afterwards, asks the moment a profile appears (setup
 * completed in this page life). Returns the unsubscribe.
 */
export function startDurabilityWatch(deps: DurabilityWatchDeps): () => void {
  let hadProfile: boolean | null = null; // null until the document has been read
  const onChange = (): void => {
    if (!deps.ready()) return;
    const has = deps.hasProfile();
    if (hadProfile === null) {
      if (has && deps.standalone()) void requestDurability(deps.storage);
      else void readDurability(deps.storage);
    } else if (has && !hadProfile) {
      void requestDurability(deps.storage);
    }
    hadProfile = has;
  };
  const unsubscribe = deps.subscribeStore(onChange);
  onChange();
  return unsubscribe;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Durability {
  return state;
}

export function useDurability(): Durability {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test seam. */
export function resetDurabilityForTest(): void {
  state = 'unknown';
}
