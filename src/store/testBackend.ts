// src/store/testBackend.ts
//
// Spec R13 test support: a store booted on the in-memory backend, torn down when the test ends.
// No IndexedDB and no Web Storage (src/store/db/memoryBackend.ts).
import { onTestFinished } from 'vitest';
import { startPersistence, useAppStore } from './index';
import { assembleState } from './db/assemble';
import { createMemoryBackend, type MemoryBackend, type MemoryDisk } from './db/memoryBackend';
import type { AppState } from '../domain/types';

/**
 * Starts persistence, then hydrates from a memory backend: `legacy` is an fti.v3 text the first
 * boot imports, `disk` reuses another backend's records (a relaunch). Stops at test end.
 */
export async function bootMemoryStore(opts: { legacy?: string | null; disk?: MemoryDisk } = {}): Promise<MemoryBackend> {
  const backend = createMemoryBackend(opts);
  const stop = startPersistence();
  onTestFinished(stop);
  await useAppStore.getState().hydrate(backend);
  return backend;
}

/** The document the disk holds, read the way a boot reads it. Throws on a refused read. */
export function storedDocument(disk: MemoryDisk): AppState {
  const result = assembleState(disk.records);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
