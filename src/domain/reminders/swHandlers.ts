/**
 * The bodies of the two Web Push service worker events, as functions that can
 * be run outside a service worker.
 *
 * `src/sw.ts` cannot be imported by a test: jsdom has no
 * ServiceWorkerGlobalScope, no PushEvent and no registration.showNotification.
 * Anything left in `sw.ts` is therefore covered only by the build gate and the
 * on-device smoke test, so everything the worker decides lives here and `sw.ts`
 * keeps two `addEventListener` calls that forward to these two functions.
 *
 * The parameters are minimal structural subsets of the platform interfaces
 * rather than the lib types themselves (PushMessageData,
 * ServiceWorkerRegistration, Clients, WindowClient). The real objects are
 * assignable to them, so `sw.ts` passes `event.data`, `self.registration` and
 * `self.clients` through unchanged, while a test supplies a two-property object
 * instead of casting through decoder methods this module never calls.
 */
import {
  APP_SCOPE_PATH,
  notificationClickTarget,
  parsePushPayload,
  resolveClickUrl,
} from './payload';

/** The one method of `PushMessageData` this module calls. */
export interface PushJson {
  json(): unknown;
}

/** The one method of `ServiceWorkerRegistration` this module calls. */
export interface NotificationShower {
  showNotification(title: string, options?: NotificationOptions): Promise<void>;
}

/** Precached notification art, built from `import.meta.env.BASE_URL` by `sw.ts`. */
export interface PushIcons {
  icon: string;
  badge: string;
}

/** The part of `WindowClient` the click handler touches. */
export interface AppWindow {
  url: string;
  focus(): Promise<unknown>;
  /** Absent on engines that do not implement it; see `focusOrOpen`. */
  navigate?: ((url: string) => Promise<unknown>) | undefined;
}

/** The `Clients.matchAll` query this module makes, spelled out so a test can assert it. */
export interface WindowQuery {
  type: 'window';
  includeUncontrolled: boolean;
}

/** The part of `Clients` the click handler uses. */
export interface WindowRegistry {
  matchAll(options: WindowQuery): Promise<readonly AppWindow[]>;
  openWindow(url: string): Promise<unknown>;
}

/** The part of `Notification` the click handler reads. `data` is `any` in the lib. */
export interface ClickedNotification {
  close(): void;
  data: unknown;
}

/**
 * The decrypted payload, or null when there is none or it is not JSON.
 * The result lands in an `unknown` and every field is read through
 * `parsePushPayload` rather than by member access here.
 */
function readPushJson(data: PushJson | null): unknown {
  if (data === null) return null;
  try {
    const parsed: unknown = data.json();
    return parsed;
  } catch {
    // Not JSON. parsePushPayload is total, so a notification is still shown.
    return null;
  }
}

/**
 * Show the reminder a push carried.
 *
 * Unconditional: iOS Safari revokes the push subscription when a delivered push
 * produces no user-visible notification (master plan section 1.7), and
 * Chrome/Edge require userVisibleOnly on the subscription. A malformed payload
 * therefore still shows a notification, with the constant fallback title. There
 * is no early return in this function, by design.
 */
export async function handlePush(
  data: PushJson | null,
  registration: NotificationShower,
  icons: PushIcons,
): Promise<void> {
  const payload = parsePushPayload(readPushJson(data));
  await registration.showNotification(payload.title, {
    body: payload.body,
    // The ReminderInstant key: a re-sent reminder replaces its predecessor
    // instead of stacking a second copy. `renotify` is left at its default
    // false, so that replacement is silent: no second buzz or sound for a
    // reminder the user has already been shown.
    tag: payload.tag,
    data: { url: payload.url },
    icon: icons.icon,
    // Android masks the badge to a monochrome silhouette, so the full-colour
    // 192 px icon renders there as a solid blob. A dedicated monochrome badge
    // asset is a P9 item and does not exist yet; this passes the colour icon,
    // which is the current behaviour rather than the intended one.
    badge: icons.badge,
  });
}

/**
 * Focus an app window if one is open, otherwise open a new one.
 *
 * `origin` is `self.location.origin` in the worker.
 */
async function focusOrOpen(
  target: string,
  clients: WindowRegistry,
  origin: string,
): Promise<void> {
  const scope = new URL(APP_SCOPE_PATH, origin).href;
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    // Same origin and inside our scope: another project site on the same
    // github.io host is somebody else's app, not a window to steal.
    if (!client.url.startsWith(scope)) continue;
    try {
      await client.focus();
      /*
       * navigate() is absent on some engines, and on the rest it rejects with a
       * TypeError whenever the window is not controlled by this service worker.
       * W3C Service Workers, navigate(url) step 4: "If this's associated
       * service worker client's active service worker is not this's relevant
       * global object's service worker, return a promise rejected with a
       * TypeError". Those are exactly the windows
       * matchAll({ includeUncontrolled: true }) is asked for: any tab loaded
       * before this worker took control. Unguarded, that rejection propagates
       * out through event.waitUntil and the openWindow below never runs, so the
       * click does nothing at all.
       *
       * Absent navigate: focusing alone leaves the user on whichever view was
       * already open, which is better than no window.
       */
      if (typeof client.navigate === 'function') await client.navigate(target);
      return;
    } catch {
      // This window cannot be reused. Stop at the first in-scope match, as the
      // success path does, and open a fresh window instead.
      break;
    }
  }
  await clients.openWindow(target);
}

/**
 * Close the notification and bring the app up on the path it carried.
 *
 * The url is read back through `resolveClickUrl` and `notificationClickTarget`,
 * so a payload that reached `Notification.data` can only ever open a same-origin
 * path inside the app scope.
 */
export async function handleNotificationClick(
  notification: ClickedNotification,
  clients: WindowRegistry,
  origin: string,
): Promise<void> {
  notification.close();
  const target = notificationClickTarget(resolveClickUrl(notification.data), origin);
  await focusOrOpen(target, clients, origin);
}
