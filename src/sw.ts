/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { MEDIA_CACHE, isMediaRequest, mediaPlugins } from './app/swMedia';
import { cacheShownTags, handleNotificationClick, handlePush } from './domain/reminders/swHandlers';

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

// The one motivation video (P6): CacheFirst with Range support and one entry
// (src/app/swMedia.ts, audit E15).
registerRoute(
  ({ url }) => isMediaRequest(url, self.location.origin),
  new CacheFirst({ cacheName: MEDIA_CACHE, plugins: mediaPlugins() }),
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

/*
 * Audit E09: without claim, the page that installed the worker stays uncontrolled for its whole
 * life (`navigator.serviceWorker.controller === null` was reproduced), so the first session after
 * install fetched every lazy chunk from the network. Claiming does not change WHEN an update
 * applies: a new worker still waits for SKIP_WAITING (src/app/UpdatePrompt.tsx), and claim()
 * only adopts pages that have no controller.
 */
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
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
      // 96 x 96 px, monochrome on transparent: Android paints a badge from its alpha channel
      // only, so the full-colour 192 px icon showed as a solid blob there.
      badge: `${import.meta.env.BASE_URL}icons/notification-badge-96.png`,
    }, cacheShownTags(self.caches, self.location.origin)),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.waitUntil(handleNotificationClick(event.notification, self.clients, self.location.origin));
});
