import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB, type DBSchema } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASSET_DB_NAME,
  ASSET_DB_VERSION,
  BUNDLED_VIDEO_SRC,
  clearAssetStorage,
  deleteCustomVideo,
  getCustomVideoMeta,
  getCustomVideoUrl,
  MAX_VIDEO_BYTES,
  probeBundledVideo,
  resetAssetDbForTests,
  resolveVideoSrc,
  revokeVideoUrl,
  saveCustomVideo,
  type StoredVideo,
} from './assets';
import type { MotivationState } from '../types';

/** Mirrors the private schema in assets.ts so the test can read the raw record without a cast. */
interface AssetDbForTests extends DBSchema {
  videos: { key: string; value: StoredVideo };
}

function videoFile(bytes: number, type = 'video/mp4', name = 'clip.mp4'): File {
  return new File([new Uint8Array(bytes)], name, { type }); // bytes = payload length
}

/** Name of the throwaway database used to manufacture a genuine open failure. */
const AHEAD_DB_NAME = 'fti-assets-open-failure';

/**
 * A stand-in for indexedDB.open that fails once, the way a real failure reaches us: not a
 * synchronous throw but an IDBOpenDBRequest that fires 'error', so openDB returns a REJECTED
 * promise. Manufactured by leaving a database at version 2 on the factory and then asking for
 * version 1, which the spec answers with VersionError. Safari private mode and a quota refusal
 * differ only in the error they carry.
 */
async function failingOpen(): Promise<() => IDBOpenDBRequest> {
  const ahead = await openDB(AHEAD_DB_NAME, 2);
  ahead.close();
  const realOpen = globalThis.indexedDB.open.bind(globalThis.indexedDB);
  return () => realOpen(AHEAD_DB_NAME, 1);
}

function motivation(customVideoAssetId: string | null): { motivation: Record<string, MotivationState> } {
  return {
    motivation: {
      p1: { profileId: 'p1', lastShownForWeek: null, lastShownAt: null, customVideoAssetId },
    },
  };
}

beforeEach(() => {
  // fake-indexeddb keeps its databases on the factory, so a fresh factory is a fresh disk.
  globalThis.indexedDB = new IDBFactory();
  resetAssetDbForTests();
});

afterEach(() => {
  // Lifted here, not at the end of each test body: a failed assertion aborts the body, and a
  // stubbed fetch left standing would answer for the next test as well. Spies are restored by
  // the suite-wide restoreMocks in vitest.config.ts; global stubs are not covered by it.
  vi.unstubAllGlobals();
});

describe('custom video asset store', () => {
  it('round-trips a picked file to an object URL', async () => {
    const id = await saveCustomVideo(videoFile(8), 1_756_000_000_000); // EpochMs, UTC
    const url = await getCustomVideoUrl(id);
    expect(url).not.toBeNull();
    expect(url).toMatch(/^blob:/);
    if (url !== null) revokeVideoUrl(url);
  });

  it('stores the file bytes unaltered', async () => {
    // A distinctive payload: a silently degraded record (the rejected Blob format
    // returns {}) cannot pass a byte-for-byte comparison.
    const payload = new Uint8Array([0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff]); // 6 bytes
    const file = new File([payload], 'clip.mp4', { type: 'video/mp4' });
    const id = await saveCustomVideo(file, 1_756_000_000_000); // EpochMs, UTC

    const db = await openDB<AssetDbForTests>(ASSET_DB_NAME, ASSET_DB_VERSION);
    const record = await db.get('videos', id);
    db.close();
    if (record === undefined) throw new Error('the saved record was not found');

    expect(new Uint8Array(record.data)).toEqual(payload);
    expect(record.data.byteLength).toBe(payload.byteLength); // bytes
    expect(record.size).toBe(payload.byteLength);            // bytes, as reported by the File
    expect(record.type).toBe('video/mp4');
    expect(record.name).toBe('clip.mp4');
    expect(record.createdAt).toBe(1_756_000_000_000);        // EpochMs, UTC
  });

  it('rejects a non-video MIME type', async () => {
    await expect(saveCustomVideo(videoFile(4, 'image/png', 'x.png'), 1)).rejects.toThrow(
      /Not a video file/,
    );
  });

  it('accepts a video the browser gave no type for, judging it by extension', async () => {
    // The iOS Files app can hand over a .mov with type ''. The file is playable; only the
    // metadata is missing, so the extension is the only evidence there is.
    const id = await saveCustomVideo(videoFile(8, '', 'IMG_0421.MOV'), 1); // EpochMs, UTC
    const db = await openDB<AssetDbForTests>(ASSET_DB_NAME, ASSET_DB_VERSION);
    const record = await db.get('videos', id);
    db.close();
    expect(record?.name).toBe('IMG_0421.MOV');
    // getCustomVideoUrl rebuilds the Blob with this type, and a <video> element handed a blob
    // URL with an empty type has nothing to go on, so the extension supplies one.
    expect(record?.type).toBe('video/quicktime');
  });

  it('accepts an untyped .mp4 and .m4v as well', async () => {
    await expect(saveCustomVideo(videoFile(8, '', 'clip.mp4'), 1)).resolves.toBeTypeOf('string');
    await expect(saveCustomVideo(videoFile(8, '', 'clip.m4v'), 1)).resolves.toBeTypeOf('string');
  });

  it('rejects a file with no type and no video extension', async () => {
    await expect(saveCustomVideo(videoFile(4, '', 'notes.txt'), 1)).rejects.toThrow(
      /Not a video file/,
    );
  });

  it('rejects a file over the size cap', async () => {
    const oversize = videoFile(0);
    Object.defineProperty(oversize, 'size', { value: MAX_VIDEO_BYTES + 1 }); // bytes
    // Asserts the cap is named in bytes; the article is left out so a sentence-case
    // tweak to the message does not break the assertion.
    await expect(saveCustomVideo(oversize, 1)).rejects.toThrow(/limit is 157286400 bytes/);
  });

  it('keeps one clip only: a second save replaces the first', async () => {
    const first = await saveCustomVideo(videoFile(8, 'video/mp4', 'first.mp4'), 1); // EpochMs, UTC
    const second = await saveCustomVideo(videoFile(8, 'video/mp4', 'second.mp4'), 2);
    expect(second).not.toBe(first);

    const db = await openDB<AssetDbForTests>(ASSET_DB_NAME, ASSET_DB_VERSION);
    const keys = await db.getAllKeys('videos');
    db.close();
    // Two records is up to 300 MiB for one clip the user can play, and the orphan is
    // unreachable: nothing in state names it once customVideoAssetId moves on.
    expect(keys).toEqual([second]);
    expect(await getCustomVideoUrl(first)).toBeNull();
  });

  it('keeps the records named in `keep`, so one profile does not sweep another', async () => {
    // One videos store backs every profile while customVideoAssetId is per profile, so an
    // unqualified sweep makes profile B's save delete profile A's clip while profile A's
    // Settings still reports that a clip is stored.
    const a = await saveCustomVideo(videoFile(8, 'video/mp4', 'a.mp4'), 1); // EpochMs, UTC
    const b = await saveCustomVideo(videoFile(8, 'video/mp4', 'b.mp4'), 2, {
      keep: new Set([a]),
    });

    const urlA = await getCustomVideoUrl(a);
    const urlB = await getCustomVideoUrl(b);
    expect(urlA).not.toBeNull();
    expect(urlB).not.toBeNull();
    if (urlA !== null) revokeVideoUrl(urlA);
    if (urlB !== null) revokeVideoUrl(urlB);
  });

  it('sweeps the replaced clip and an unnamed orphan while `keep` survives', async () => {
    const a = await saveCustomVideo(videoFile(8, 'video/mp4', 'a.mp4'), 1); // EpochMs, UTC
    const bOld = await saveCustomVideo(videoFile(8, 'video/mp4', 'b-old.mp4'), 2, {
      keep: new Set([a]),
    });
    // Nothing in state names this record once it is written: it stands in for what a failed
    // removal leaves behind, and the next save is what clears it.
    const orphan = await saveCustomVideo(videoFile(8, 'video/mp4', 'orphan.mp4'), 3, {
      keep: new Set([a, bOld]),
    });

    // Profile B replaces its clip: state names profile A's asset and B's new one, nothing else.
    const bNew = await saveCustomVideo(videoFile(8, 'video/mp4', 'b-new.mp4'), 4, {
      keep: new Set([a]),
    });

    const db = await openDB<AssetDbForTests>(ASSET_DB_NAME, ASSET_DB_VERSION);
    const keys = await db.getAllKeys('videos');
    db.close();
    expect(new Set(keys)).toEqual(new Set([a, bNew]));
    expect(await getCustomVideoUrl(bOld)).toBeNull();
    expect(await getCustomVideoUrl(orphan)).toBeNull();
  });

  it('reports a stored clip name and size, so a reload can name what it holds', async () => {
    const id = await saveCustomVideo(videoFile(2048, 'video/mp4', 'holiday.mp4'), 1); // EpochMs
    expect(await getCustomVideoMeta(id)).toEqual({ name: 'holiday.mp4', size: 2048 }); // bytes
  });

  it('returns null metadata for an id that is not stored', async () => {
    expect(await getCustomVideoMeta('missing')).toBeNull();
  });

  it('leaves deleteCustomVideo a no-op for an id that is not there', async () => {
    // Task 6 calls this on a possibly stale id; it must not throw.
    await expect(deleteCustomVideo('never-stored')).resolves.toBeUndefined();
  });

  it('returns null for an unknown id', async () => {
    expect(await getCustomVideoUrl('missing')).toBeNull();
  });

  it('deletes a stored clip', async () => {
    const id = await saveCustomVideo(videoFile(8), 1); // EpochMs, UTC
    await deleteCustomVideo(id);
    expect(await getCustomVideoUrl(id)).toBeNull();
  });

  it('empties the store for the Settings wipe and leaves it usable', async () => {
    // Security constraint 10: the wipe covers everything the app owns, and the clip is the
    // only thing the app puts outside localStorage.
    const a = await saveCustomVideo(videoFile(8, 'video/mp4', 'a.mp4'), 1); // EpochMs, UTC
    const b = await saveCustomVideo(videoFile(8, 'video/mp4', 'b.mp4'), 2, {
      keep: new Set([a]),
    });

    await clearAssetStorage();

    expect(await getCustomVideoUrl(a)).toBeNull();
    expect(await getCustomVideoUrl(b)).toBeNull();
    const db = await openDB<AssetDbForTests>(ASSET_DB_NAME, ASSET_DB_VERSION);
    const keys = await db.getAllKeys('videos');
    db.close();
    expect(keys).toEqual([]);

    // A wipe is not a teardown: the store the next pick writes to has to still be there.
    const after = await saveCustomVideo(videoFile(8, 'video/mp4', 'after.mp4'), 3);
    const url = await getCustomVideoUrl(after);
    expect(url).not.toBeNull();
    if (url !== null) revokeVideoUrl(url);
  });

  it('wipes a device that never stored a clip without complaining', async () => {
    // The one absence the wipe treats as success: nothing was there to remove.
    await expect(clearAssetStorage()).resolves.toBeUndefined();
  });

  it('caps custom clips at 150 MiB', () => {
    expect(MAX_VIDEO_BYTES).toBe(157286400); // bytes
  });
});

describe('resolveVideoSrc and the bundled probe', () => {
  it('falls back to the bundled clip when no custom asset is set', async () => {
    const got = await resolveVideoSrc({ motivation: {} }, 'p1');
    expect(got.src).toBe(BUNDLED_VIDEO_SRC);
    expect(BUNDLED_VIDEO_SRC.endsWith('media/motivation.mp4')).toBe(true);
    got.revoke();
  });

  it('prefers the custom asset', async () => {
    const id = await saveCustomVideo(videoFile(8), 1); // EpochMs, UTC
    const got = await resolveVideoSrc(motivation(id), 'p1');
    expect(got.src).toMatch(/^blob:/);
    got.revoke();
  });

  it('falls back when the referenced asset is gone', async () => {
    expect((await resolveVideoSrc(motivation('gone'), 'p1')).src).toBe(BUNDLED_VIDEO_SRC);
  });

  it('falls back to the bundled clip when the database cannot be opened', async () => {
    const openOnceAndFail = await failingOpen();
    const open = vi.spyOn(globalThis.indexedDB, 'open').mockImplementationOnce(openOnceAndFail);

    const fallback = await resolveVideoSrc(motivation('any-asset'), 'p1');
    expect(fallback.src).toBe(BUNDLED_VIDEO_SRC);
    expect(open).toHaveBeenCalledTimes(1);
    fallback.revoke();
  });

  it('reopens the database on the next call instead of caching the rejection', async () => {
    const openOnceAndFail = await failingOpen();
    vi.spyOn(globalThis.indexedDB, 'open').mockImplementationOnce(openOnceAndFail);
    await resolveVideoSrc(motivation('any-asset'), 'p1');

    // The stub is spent, so this reaches the real factory. No resetAssetDbForTests() here:
    // that is the point. A cached rejected promise would keep every later call failing for
    // the rest of the page's life, which is what one Safari private-mode refusal would cost.
    const id = await saveCustomVideo(videoFile(8), 1); // EpochMs, UTC
    const got = await resolveVideoSrc(motivation(id), 'p1');
    expect(got.src).toMatch(/^blob:/);
    got.revoke();
  });

  it('probes the bundled file once and caches the answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    expect(await probeBundledVideo()).toBe(true);
    expect(await probeBundledVideo()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(BUNDLED_VIDEO_SRC, { method: 'HEAD' });
  });

  it('reports the bundled file as absent when the HEAD request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await probeBundledVideo()).toBe(false);
  });

  it('caches a 404 as absent', async () => {
    // Definite: the server answered, and the answer is that the file was not deployed.
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    expect(await probeBundledVideo()).toBe(false);
    expect(await probeBundledVideo()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache a network failure', async () => {
    // Unreachable is not absent. Offline at first paint would otherwise tell Settings for the
    // rest of the page's life that a clip which is in fact deployed does not exist.
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    expect(await probeBundledVideo()).toBe(false);
    expect(await probeBundledVideo()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache an indefinite HTTP status', async () => {
    // A 503 from a proxy says nothing about what was deployed, so it is retried.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    expect(await probeBundledVideo()).toBe(false);
    expect(await probeBundledVideo()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
