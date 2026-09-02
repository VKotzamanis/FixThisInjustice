/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import type { WorkboxPlugin } from 'workbox-core';
import { handleNotificationClick, handlePush } from './domain/reminders/swHandlers';

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

/*
 * The other half of registerType: 'prompt'.
 *
 * main.tsx never lets a waiting worker take over on its own; UpdatePrompt's
 * Reload button calls the plugin's updateServiceWorker(true), which posts
 * { type: 'SKIP_WAITING' } to this worker. Without this listener that message
 * is dropped, the worker stays in `waiting` forever, and the button appears to
 * do nothing — the user reloads and gets the same old build back.
 *
 * The payload is read structurally rather than as `e.data?.type`: data is typed
 * `any`, and one unchecked member access is all it takes for a message from
 * some other sender to walk into this branch untyped.
 */
self.addEventListener('message', (e: ExtendableMessageEvent) => {
  const data: unknown = e.data;
  if (typeof data !== 'object' || data === null) return;
  if (Reflect.get(data, 'type') === 'SKIP_WAITING') void self.skipWaiting();
});

// ---- Web Push (P5) ---------------------------------------------------------
/*
 * The Worker sends { title, body, tag, url } (master plan section 6.6). Every
 * decision about that payload, and about which window a click lands in, is made
 * in domain/reminders/swHandlers.ts and domain/reminders/payload.ts, both of
 * which are unit-tested. A service worker cannot be instantiated under jsdom,
 * so what is left here is two registrations, covered by the build gate and the
 * on-device smoke test.
 *
 * The handlers take structural parameters that the real globals satisfy, so
 * `event.data`, `self.registration` and `self.clients` are passed through
 * unchanged.
 */
self.addEventListener('push', (event: PushEvent) => {
  event.waitUntil(
    handlePush(event.data, self.registration, {
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      badge: `${import.meta.env.BASE_URL}icons/icon-192.png`,
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.waitUntil(handleNotificationClick(event.notification, self.clients, self.location.origin));
});
