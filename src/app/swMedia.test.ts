// src/app/swMedia.test.ts
//
// Audit E15: the /media/ route (the motivation clip, ROADMAP F4) must answer a Range request
// from the cache with a 206 slice (Safari fetches video with Range headers and expects 206), and must never
// cache a 206 (a partial body stored as the whole clip). A service worker cannot be instantiated
// in a unit test, so the route's predicate and plugins live in src/app/swMedia.ts and are run here
// directly against Fetch API objects (Node's globals; jsdom supplies the `self` workbox reads).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { RangeRequestsPlugin } from 'workbox-range-requests';
import { isMediaRequest, mediaPlugins } from './swMedia';

const ORIGIN = 'https://example.test';

function pluginOf<T>(ctor: new (...args: never[]) => T): T {
  const found = mediaPlugins().find((p) => p instanceof ctor);
  expect(found).toBeDefined();
  return found as T;
}

describe('media route (audit E15)', () => {
  it('matches same-origin /media/ paths only', () => {
    expect(isMediaRequest(new URL(`${ORIGIN}/FixThisInjustice/media/clip.mp4`), ORIGIN)).toBe(true);
    expect(isMediaRequest(new URL(`${ORIGIN}/FixThisInjustice/assets/index.js`), ORIGIN)).toBe(false);
    expect(isMediaRequest(new URL('https://other.test/media/clip.mp4'), ORIGIN)).toBe(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers a Range request from a cached full response with a 206 slice', async () => {
    // Test-environment artifact only: jsdom replaces the global Blob, while Node's Response.blob()
    // returns Node's, and Workbox's dev-build assertion checks `instanceof Blob`. A service
    // worker has one Blob class.
    vi.stubGlobal('Blob', (await new Response('').blob()).constructor);
    const range = pluginOf(RangeRequestsPlugin);
    const request = new Request(`${ORIGIN}/media/clip.mp4`, { headers: { Range: 'bytes=2-5' } });
    const cachedResponse = new Response('0123456789', { status: 200 });
    const out = await range.cachedResponseWillBeUsed?.({
      request,
      cachedResponse,
      cacheName: 'fti-media-v1',
      event: undefined as never,
      state: undefined,
    } as never);
    expect(out?.status).toBe(206);
    expect(await out?.text()).toBe('2345');
    expect(out?.headers.get('Content-Range')).toBe('bytes 2-5/10');
  });

  it('caches a 200 and refuses to cache a 206 partial body', async () => {
    const cacheable = pluginOf(CacheableResponsePlugin);
    const ok = new Response('whole', { status: 200 });
    const partial = new Response('part', { status: 206 });
    const args = (response: Response) => ({ request: new Request(`${ORIGIN}/media/clip.mp4`), response }) as never;
    expect(await cacheable.cacheWillUpdate?.(args(ok))).toBe(ok);
    expect(await cacheable.cacheWillUpdate?.(args(partial))).toBeNull();
  });
});
