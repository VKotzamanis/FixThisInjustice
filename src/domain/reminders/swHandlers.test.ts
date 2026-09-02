import { describe, expect, it, vi } from 'vitest';

import { APP_SCOPE_PATH, FALLBACK_TITLE } from './payload';
import { handleNotificationClick, handlePush } from './swHandlers';
import type { AppWindow, PushIcons, PushJson, WindowRegistry } from './swHandlers';

/*
 * These are the bodies of the two service worker events, lifted out of
 * src/sw.ts so that they can be run. sw.ts itself cannot be imported here:
 * jsdom has no ServiceWorkerGlobalScope, no PushEvent and no
 * registration.showNotification, so whatever stays in sw.ts is covered only by
 * the build gate and the on-device smoke test. What is left there is two
 * addEventListener calls.
 */

const ORIGIN = 'https://example.github.io';
const SCOPE_HREF = `${ORIGIN}${APP_SCOPE_PATH}`;
const TARGET = `${ORIGIN}${APP_SCOPE_PATH}today`;
const ICONS: PushIcons = {
  icon: `${APP_SCOPE_PATH}icons/icon-192.png`,
  badge: `${APP_SCOPE_PATH}icons/icon-192.png`,
};

/** A registration that records what it was asked to show. */
function fakeRegistration() {
  const showNotification = vi.fn<(title: string, options?: NotificationOptions) => Promise<void>>(
    () => Promise.resolve(),
  );
  return { registration: { showNotification }, showNotification };
}

/** The decrypted payload wrapper: only `json()` is ever called. */
function pushData(json: () => unknown): PushJson {
  return { json };
}

/**
 * One open window. `navigate` is omitted when `navigate` is null, which is the
 * engine that does not implement it; a rejecting `navigate` is the window that
 * this service worker does not control.
 */
function fakeWindow(url: string, navigate: ((url: string) => Promise<unknown>) | null) {
  const focus = vi.fn(() => Promise.resolve({ url }));
  const navigateMock = navigate === null ? null : vi.fn(navigate);
  const client: AppWindow =
    navigateMock === null ? { url, focus } : { url, focus, navigate: navigateMock };
  return { client, focus, navigate: navigateMock };
}

function fakeClients(windows: AppWindow[]) {
  const openWindow = vi.fn((url: string) => Promise.resolve({ url }));
  const matchAll = vi.fn(() => Promise.resolve(windows as readonly AppWindow[]));
  const clients: WindowRegistry = { matchAll, openWindow };
  return { clients, openWindow, matchAll };
}

function fakeNotification(data: unknown) {
  const close = vi.fn();
  return { notification: { close, data }, close };
}

describe('handlePush', () => {
  it('shows exactly one notification for a well-formed payload', async () => {
    const { registration, showNotification } = fakeRegistration();
    await handlePush(
      pushData(() => ({ title: 'Upper today', body: 'Upper A at 18:00', tag: 'k', url: TARGET })),
      registration,
      ICONS,
    );
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification.mock.calls[0]?.[0]).toBe('Upper today');
    expect(showNotification.mock.calls[0]?.[1]?.tag).toBe('k');
    expect(showNotification.mock.calls[0]?.[1]?.icon).toBe(ICONS.icon);
    expect(showNotification.mock.calls[0]?.[1]?.badge).toBe(ICONS.badge);
  });

  it('still shows one notification when the push carries no data', async () => {
    // A delivered push that shows nothing costs the subscription on iOS Safari
    // (master plan section 1.7), so there is no early return in this handler.
    const { registration, showNotification } = fakeRegistration();
    await handlePush(null, registration, ICONS);
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification.mock.calls[0]?.[0]).toBe(FALLBACK_TITLE);
  });

  it('still shows one notification when the payload is not JSON', async () => {
    const { registration, showNotification } = fakeRegistration();
    await handlePush(
      pushData(() => {
        throw new SyntaxError('Unexpected token');
      }),
      registration,
      ICONS,
    );
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification.mock.calls[0]?.[0]).toBe(FALLBACK_TITLE);
  });

  it('keeps the click target on the notification data', async () => {
    const { registration, showNotification } = fakeRegistration();
    await handlePush(
      pushData(() => ({ title: 't', url: `${APP_SCOPE_PATH}today` })),
      registration,
      ICONS,
    );
    expect(showNotification.mock.calls[0]?.[1]?.data).toEqual({ url: `${APP_SCOPE_PATH}today` });
  });
});

describe('handleNotificationClick', () => {
  it('closes the notification', async () => {
    const { notification, close } = fakeNotification({ url: `${APP_SCOPE_PATH}today` });
    const { clients } = fakeClients([]);
    await handleNotificationClick(notification, clients, ORIGIN);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('opens a window when none is open', async () => {
    const { notification } = fakeNotification({ url: `${APP_SCOPE_PATH}today` });
    const { clients, openWindow } = fakeClients([]);
    await handleNotificationClick(notification, clients, ORIGIN);
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(openWindow).toHaveBeenCalledWith(TARGET);
  });

  it('focuses and navigates an open window, without opening a second one', async () => {
    const { notification } = fakeNotification({ url: `${APP_SCOPE_PATH}today` });
    const open = fakeWindow(SCOPE_HREF, () => Promise.resolve(null));
    const { clients, openWindow } = fakeClients([open.client]);
    await handleNotificationClick(notification, clients, ORIGIN);
    expect(open.focus).toHaveBeenCalledTimes(1);
    expect(open.navigate).toHaveBeenCalledWith(TARGET);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('opens a window when navigate rejects on an uncontrolled window', async () => {
    /*
     * WindowClient.navigate() rejects with a TypeError when the window is not
     * controlled by this service worker (W3C Service Workers, navigate(url)
     * step 4: the client's active service worker is not this worker), and
     * matchAll({ includeUncontrolled: true }) asks for exactly those windows:
     * any tab loaded before this worker took control. Unguarded, that rejection
     * propagates through waitUntil and no window ever opens.
     */
    const { notification } = fakeNotification({ url: `${APP_SCOPE_PATH}today` });
    const open = fakeWindow(SCOPE_HREF, () => Promise.reject(new TypeError('not controlled')));
    const { clients, openWindow } = fakeClients([open.client]);
    await expect(handleNotificationClick(notification, clients, ORIGIN)).resolves.toBeUndefined();
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(openWindow).toHaveBeenCalledWith(TARGET);
  });

  it('leaves the user in place on an engine without navigate', async () => {
    const { notification } = fakeNotification({ url: `${APP_SCOPE_PATH}today` });
    const open = fakeWindow(SCOPE_HREF, null);
    const { clients, openWindow } = fakeClients([open.client]);
    await handleNotificationClick(notification, clients, ORIGIN);
    expect(open.focus).toHaveBeenCalledTimes(1);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('ignores a same-origin window belonging to another project site', async () => {
    // github.io is shared with every other project site of the same account.
    const { notification } = fakeNotification({ url: `${APP_SCOPE_PATH}today` });
    const other = fakeWindow(`${ORIGIN}/other-project/`, () => Promise.resolve(null));
    const { clients, openWindow } = fakeClients([other.client]);
    await handleNotificationClick(notification, clients, ORIGIN);
    expect(other.focus).not.toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledWith(TARGET);
  });

  it('falls back to the app base for notification data that carries no url', async () => {
    const { notification } = fakeNotification(undefined);
    const { clients, openWindow } = fakeClients([]);
    await handleNotificationClick(notification, clients, ORIGIN);
    expect(openWindow).toHaveBeenCalledWith(SCOPE_HREF);
  });

  it('asks only for windows, including the ones this worker does not control', async () => {
    const { notification } = fakeNotification(null);
    const { clients, matchAll } = fakeClients([]);
    await handleNotificationClick(notification, clients, ORIGIN);
    expect(matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
  });
});
