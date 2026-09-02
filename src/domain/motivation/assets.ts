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

/**
 * The one connection this module opens, cached so concurrent callers share it.
 *
 * The cache holds only a connection that is still worth having. A rejected promise is evicted
 * by the same expression that stores it, because IndexedDB failures are not permanent: Safari
 * in private mode, a quota refusal and a database left open by another tab all reject one open
 * and say nothing about the next. Caching the rejection would turn a transient refusal into a
 * dead module for the rest of the page's life. The reset runs in a later microtask than the
 * assignment, so it always overwrites the entry it is meant to clear, and the rethrow leaves
 * the caller's error intact.
 */
function assetDb(): Promise<IDBPDatabase<AssetDb>> {
  connection ??= openDB<AssetDb>(ASSET_DB_NAME, ASSET_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(VIDEO_STORE)) db.createObjectStore(VIDEO_STORE);
    },
  }).catch((error: unknown) => {
    connection = null;
    throw error;
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

/**
 * The MIME type to store for a file the browser gave no type for, keyed by extension.
 *
 * .m4v is mapped to video/mp4 rather than Apple's video/x-m4v: an .m4v IS an MP4 container,
 * and video/mp4 is the type every engine accepts on a blob URL, which is what this value ends
 * up being used for in getCustomVideoUrl.
 */
const VIDEO_TYPE_BY_EXTENSION = [
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.mov', 'video/quicktime'],
] as const;

/**
 * The MIME type to store for a picked file, or null when it is not a video.
 *
 * A file.type the browser did fill in is the answer, accepted or refused on its own. An EMPTY
 * type is not a refusal: the iOS Files app hands over a .mov with type '', and the file is
 * perfectly playable. Only in that case does the name get a say, and the extension then also
 * supplies the type to store, because a Blob rebuilt with an empty type gives the <video>
 * element nothing to work with. Matching is case-insensitive: iOS names its captures .MOV.
 */
function videoTypeOf(file: File): string | null {
  if (file.type.startsWith('video/')) return file.type;
  if (file.type !== '') return null;
  const name = file.name.toLowerCase();
  for (const [extension, type] of VIDEO_TYPE_BY_EXTENSION) {
    if (name.endsWith(extension)) return type;
  }
  return null;
}

/** Saves the picked clip and returns its asset id. `now` is epoch milliseconds, UTC. */
export async function saveCustomVideo(file: File, now: EpochMs): Promise<string> {
  const type = videoTypeOf(file);
  if (type === null) {
    throw new Error(`Not a video file: ${file.type}.`);
  }
  if (file.size > MAX_VIDEO_BYTES) {
    // both sides in bytes
    throw new Error(`File is too large. The limit is ${MAX_VIDEO_BYTES} bytes.`);
  }
  const data = await file.arrayBuffer();
  const id = newId();
  const db = await assetDb();

  // One clip per profile, so one record per store. The put and the sweep share a transaction:
  // if the sweep fails the put is rolled back with it, so the store never ends up empty or
  // holding two clips. Writing them separately is how an interrupted save strands up to
  // MAX_VIDEO_BYTES of data that nothing in state names any more, and the quota it consumes is
  // what makes the NEXT save fail.
  const tx = db.transaction(VIDEO_STORE, 'readwrite');
  const written = tx.store.put(
    { id, name: file.name, type, size: file.size, data, createdAt: now },
    id,
  );
  // Issued in the same turn as the put and never awaited before it, so no event-loop turn
  // passes with the transaction idle: an IndexedDB transaction auto-commits as soon as one
  // does. Requests are served in order, so this already sees the record just written.
  const keys = await tx.store.getAllKeys();
  const stale = keys.filter((key) => key !== id);
  await Promise.all([written, ...stale.map((key) => tx.store.delete(key)), tx.done]);
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
    // A database that will not open is the same outcome for the caller as an asset that is no
    // longer there: play the bundled clip. The error is swallowed on purpose and only here,
    // because this is the one call site with a working answer to fall back on; every other
    // export lets the failure reach the caller, which is what Settings needs in order to say
    // that saving a clip did not work.
    let url: string | null = null;
    try {
      url = await getCustomVideoUrl(assetId);
    } catch {
      url = null;
    }
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
 * Whether public/media/motivation.mp4 was actually shipped.
 *
 * Only a definite answer is cached, and it is cached for the page's lifetime because it cannot
 * change without a redeploy while Settings may ask repeatedly:
 *
 *   2xx        -> present. The file is there.
 *   404 or 410 -> absent. The server answered, and the answer is that it was not deployed.
 *   anything else, or a rejected fetch -> unreachable, which is NOT the same as absent. This
 *                 call still reports false, because Settings must not offer a clip it cannot
 *                 play right now, but the answer is not kept: the first paint of an offline
 *                 launch would otherwise tell the user for the rest of the page's life that a
 *                 clip which is in fact deployed does not exist.
 *
 * The cache is cleared from inside the settled handlers, which run in a later microtask than
 * the assignment below, so the eviction always overwrites the entry it is meant to clear.
 */
export function probeBundledVideo(): Promise<boolean> {
  bundledProbe ??= fetch(BUNDLED_VIDEO_SRC, { method: 'HEAD' })
    .then((response) => {
      if (response.ok) return true;
      if (response.status === 404 || response.status === 410) return false;
      bundledProbe = null;
      return false;
    })
    .catch(() => {
      bundledProbe = null;
      return false;
    });
  return bundledProbe;
}
