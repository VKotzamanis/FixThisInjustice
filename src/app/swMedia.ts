// src/app/swMedia.ts
//
// The service worker's /media/ route (the one motivation clip, ROADMAP F4), outside src/sw.ts so
// a unit test can run it (src/app/swMedia.test.ts): a service worker cannot be instantiated in jsdom.
//
// Audit E15: CacheFirst alone answers a video's Range request with the whole cached body and
// status 200; a media element that asked for bytes N-M (Safari does) then fails to play the
// cached clip. RangeRequestsPlugin slices the cached body into a 206 with Content-Range.
// CacheableResponsePlugin keeps a 206 the network returned (a partial body) out of the cache, so
// only a whole clip is ever stored; the first play that is itself a Range request therefore
// streams from the network and is not cached, which is Workbox's documented trade-off.
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import type { WorkboxPlugin } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { RangeRequestsPlugin } from 'workbox-range-requests';

export const MEDIA_CACHE = 'fti-media-v1';

/** Same-origin requests under a /media/ path; cross-origin is NetworkOnly in src/sw.ts. */
export function isMediaRequest(url: URL, origin: string): boolean {
  return url.origin === origin && url.pathname.includes('/media/');
}

/**
 * The route's plugins, in hook order: cacheability (cacheWillUpdate), expiry (one clip; the
 * browser may reclaim it under quota pressure), then the Range slice on what the cache returns.
 *
 * The three casts are a Workbox 7.4.1 type defect, not data casts: each class declares its hooks
 * (cacheWillUpdate, cacheDidUpdate, cachedResponseWillBeUsed) as always-present
 * `Callback | undefined`, which exactOptionalPropertyTypes rejects against WorkboxPlugin's
 * optional `hook?`.
 */
export function mediaPlugins(): WorkboxPlugin[] {
  return [
    new CacheableResponsePlugin({ statuses: [200] }) as WorkboxPlugin,
    new ExpirationPlugin({ maxEntries: 1, purgeOnQuotaError: true }) as WorkboxPlugin,
    new RangeRequestsPlugin() as WorkboxPlugin,
  ];
}
