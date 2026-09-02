import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB, type DBSchema } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASSET_DB_NAME,
  ASSET_DB_VERSION,
  BUNDLED_VIDEO_SRC,
  deleteCustomVideo,
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

  it('rejects a file over the size cap', async () => {
    const oversize = videoFile(0);
    Object.defineProperty(oversize, 'size', { value: MAX_VIDEO_BYTES + 1 }); // bytes
    // Asserts the cap is named in bytes; the article is left out so a sentence-case
    // tweak to the message does not break the assertion.
    await expect(saveCustomVideo(oversize, 1)).rejects.toThrow(/limit is 157286400 bytes/);
  });

  it('returns null for an unknown id', async () => {
    expect(await getCustomVideoUrl('missing')).toBeNull();
  });

  it('deletes a stored clip', async () => {
    const id = await saveCustomVideo(videoFile(8), 1); // EpochMs, UTC
    await deleteCustomVideo(id);
    expect(await getCustomVideoUrl(id)).toBeNull();
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

  it('probes the bundled file once and caches the answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    expect(await probeBundledVideo()).toBe(true);
    expect(await probeBundledVideo()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(BUNDLED_VIDEO_SRC, { method: 'HEAD' });
    vi.unstubAllGlobals();
  });

  it('reports the bundled file as absent when the HEAD request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await probeBundledVideo()).toBe(false);
    vi.unstubAllGlobals();
  });
});
