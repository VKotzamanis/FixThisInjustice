import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { newId } from '../ids';
import type { AppState, EpochMs } from '../types';

export const ASSET_DB_NAME = 'fti-assets';
export const ASSET_DB_VERSION = 1;
export const VIDEO_STORE = 'videos';
export const MAX_VIDEO_BYTES = 157_286_400; // bytes = 150 MiB
export const BUNDLED_VIDEO_SRC = `${import.meta.env.BASE_URL}media/motivation.mp4`; // BASE_URL always ends in "/"

export interface StoredVideo {
  id: string;
  name: string;
  type: string;
  size: number; // bytes
  data: ArrayBuffer; // the clip; see the storage-format decision in the P6 plan
  createdAt: EpochMs; // epoch milliseconds, UTC
}

interface AssetDb extends DBSchema {
  videos: { key: string; value: StoredVideo };
}

let connection: Promise<IDBPDatabase<AssetDb>> | null = null;
let bundledProbe: Promise<boolean> | null = null;

function assetDb(): Promise<IDBPDatabase<AssetDb>> {
  connection ??= openDB<AssetDb>(ASSET_DB_NAME, ASSET_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(VIDEO_STORE)) db.createObjectStore(VIDEO_STORE);
    },
  });
  return connection;
}

/**
 * Drops the cached connection and the cached HEAD probe.
 * Tests replace globalThis.indexedDB with a fresh IDBFactory between cases; a connection
 * cached against the previous factory would silently read a database that no longer exists.
 */
export function resetAssetDbForTests(): void {
  connection = null;
  bundledProbe = null;
}

/** Saves the picked clip and returns its asset id. `now` is epoch milliseconds, UTC. */
export async function saveCustomVideo(file: File, now: EpochMs): Promise<string> {
  if (!file.type.startsWith('video/')) {
    throw new Error(`Not a video file: ${file.type}.`);
  }
  if (file.size > MAX_VIDEO_BYTES) {
    // both sides in bytes
    throw new Error(`File is too large. The limit is ${MAX_VIDEO_BYTES} bytes.`);
  }
  const data = await file.arrayBuffer();
  const id = newId();
  const db = await assetDb();
  await db.put(
    VIDEO_STORE,
    { id, name: file.name, type: file.type, size: file.size, data, createdAt: now },
    id,
  );
  return id;
}

export async function getCustomVideoUrl(id: string): Promise<string | null> {
  const db = await assetDb();
  const record = await db.get(VIDEO_STORE, id);
  if (record === undefined) return null;
  return URL.createObjectURL(new Blob([record.data], { type: record.type }));
}

export function revokeVideoUrl(url: string): void {
  // The bundled clip is a plain path; only object URLs hold a reference to release.
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

export async function deleteCustomVideo(id: string): Promise<void> {
  const db = await assetDb();
  await db.delete(VIDEO_STORE, id);
}

const NO_REVOKE = (): void => {
  /* the bundled clip is a static URL under the site origin; there is nothing to release */
};

export interface VideoSource {
  src: string;
  revoke: () => void;
}

/**
 * The clip to play, preferring the profile's custom asset.
 * The caller owns the returned revoke() and must call it exactly once when the
 * element using src goes away; for the bundled clip it is a no-op.
 */
export async function resolveVideoSrc(
  state: Pick<AppState, 'motivation'>,
  profileId: string,
): Promise<VideoSource> {
  const assetId = state.motivation[profileId]?.customVideoAssetId ?? null;
  if (assetId !== null) {
    const url = await getCustomVideoUrl(assetId);
    if (url !== null) {
      return {
        src: url,
        revoke: () => {
          revokeVideoUrl(url);
        },
      };
    }
  }
  return { src: BUNDLED_VIDEO_SRC, revoke: NO_REVOKE };
}

/**
 * Whether public/media/motivation.mp4 was actually shipped. Cached for the page's
 * lifetime: the answer cannot change without a redeploy, and Settings may ask repeatedly.
 */
export function probeBundledVideo(): Promise<boolean> {
  bundledProbe ??= fetch(BUNDLED_VIDEO_SRC, { method: 'HEAD' })
    .then((response) => response.ok)
    .catch(() => false);
  return bundledProbe;
}
