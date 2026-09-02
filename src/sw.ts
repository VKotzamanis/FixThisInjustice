/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import type { WorkboxPlugin } from 'workbox-core';
import {
  APP_SCOPE_PATH,
  notificationClickTarget,
  parsePushPayload,
  resolveClickUrl,
} from './domain/reminders/payload';

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
 * decision about that payload is made in domain/reminders/payload.ts, which is
 * unit-tested; a service worker cannot be instantiated under jsdom, so what is
 * left here is two registrations, covered by the build gate and the on-device
 * smoke test.
 */

/**
 * The decrypted payload, or null when there is none or it is not JSON.
 * PushMessageData.json() is typed `any`, so the result lands in an `unknown`
 * and every field is read through parsePushPayload rather than by member
 * access here.
 */
function readPushJson(data: PushMessageData | null): unknown {
  if (data === null) return null;
  try {
    const parsed: unknown = data.json();
    return parsed;
  } catch {
    // Not JSON. parsePushPayload is total, so a notification is still shown.
    return null;
  }
}

self.addEventListener('push', (event: PushEvent) => {
  /*
   * Unconditional: iOS Safari revokes the push subscription when a delivered
   * push produces no user-visible notification, and Chrome/Edge require
   * userVisibleOnly on the subscription. A malformed payload therefore still
   * shows a notification, with the constant fallback title. There is no early
   * return in this handler, by design.
   */
  const payload = parsePushPayload(readPushJson(event.data));
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // The ReminderInstant key: a re-sent reminder replaces its predecessor
      // instead of stacking a second copy.
      tag: payload.tag,
      data: { url: payload.url },
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      badge: `${import.meta.env.BASE_URL}icons/icon-192.png`,
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  // notification.data is typed `any`; read it as unknown so no member access
  // goes unchecked.
  const data: unknown = event.notification.data;
  const target = notificationClickTarget(resolveClickUrl(data), self.location.origin);
  event.waitUntil(focusOrOpen(target));
});

/** Focus an app window if one is open, otherwise open a new one. */
async function focusOrOpen(target: string): Promise<void> {
  const scope = new URL(APP_SCOPE_PATH, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    // Same origin and inside our scope: another project site on the same
    // github.io host is somebody else's app, not a window to steal.
    if (!client.url.startsWith(scope)) continue;
    await client.focus();
    // navigate() is absent on some engines; focusing without it leaves the user
    // on whichever view was already open, which is better than no window.
    if ('navigate' in client) await client.navigate(target);
    return;
  }
  await self.clients.openWindow(target);
}
