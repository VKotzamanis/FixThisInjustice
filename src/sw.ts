/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import type { WorkboxPlugin } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// Content-hashed, all-or-nothing precache. A missing entry fails the install
// visibly, unlike the legacy sw.js which swallowed 404s (A66, constraint 23).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Single-page app: every navigation is served the precached shell.
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${import.meta.env.BASE_URL}index.html`)));

// Route by origin, not by String.includes (constraint 24; A65/A66 in the legacy
// worker). Anything cross-origin — Invidious frames, the P5 Worker — is network
// only and is never written to a cache this app controls.
registerRoute(({ url }) => url.origin !== self.location.origin, new NetworkOnly());

// The one motivation video (P6). maxEntries 1 keeps a replaced video from
// accumulating; purgeOnQuotaError lets the browser reclaim it under pressure.
// The cast is a workbox-expiration 7.4.1 type defect, not a data cast: the class
// declares cacheDidUpdate as an always-present `Callback | undefined`, which
// exactOptionalPropertyTypes rejects against WorkboxPlugin's `cacheDidUpdate?`.
const mediaExpiration = new ExpirationPlugin({
  maxEntries: 1,
  purgeOnQuotaError: true,
}) as WorkboxPlugin;

registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.includes('/media/'),
  new CacheFirst({ cacheName: 'fti-media-v1', plugins: [mediaExpiration] }),
);

// P5 fills these in: decrypt the push payload, showNotification, focus or open
// the client on click. They exist now so the worker's event surface is fixed and
// P5 changes handler bodies rather than the worker's shape.
self.addEventListener('push', () => {
  /* P5: reminder delivery */
});
self.addEventListener('notificationclick', () => {
  /* P5: focus or open the app */
});
