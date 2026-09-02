// src/domain/reminders/client.test.ts
//
// The client half of the reminders contract: capability detection, Web Push subscription,
// and the schedule upload to the Worker.
//
// The request-body assertions do not hand-check a JSON shape. They feed the body the client
// produced to `validatePut` from `worker/src/schedule.ts`, i.e. the exact function the
// deployed Worker runs. A body this suite accepts is a body the Worker accepts; a drift in
// either half fails here rather than in production.
//
// Units: NOW and every `at` are epoch milliseconds, UTC.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import {
  isInstalledPwa,
  isPushSupported,
  pushAvailability,
  subscribe,
  syncSchedule,
  unsubscribe,
} from './client';
import { FIXTURE_PROFILE_ID, FIXTURE_START_MS, makeAppState } from './state.fixture';
import { MAX_INSTANTS, SYNC_MAX_AGE_MS } from '../../config/reminders';
import { DEVICE_ID_PATTERN, validatePut } from '../../../worker/src/schedule';
import type { AppState, PushDevice } from '../types';

/** The two build variables client.ts reads, made writable for the unconfigured-build cases. */
interface ConfigOverride {
  base: string | null;
  vapid: string | null;
}

// Mutable so a single test can drop one build variable and re-enter the module. The mock
// exposes getters, not copied values, so client.ts sees the change on its next read.
const config = vi.hoisted(
  (): ConfigOverride => ({
    base: 'https://fti-reminders.example.workers.dev',
    // 87 base64url characters decode to 65 bytes, the length of an uncompressed P-256 point.
    vapid: `BP${'A'.repeat(85)}`,
  }),
);

vi.mock('../../config/reminders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/reminders')>();
  return {
    ...actual,
    get REMINDER_API_BASE(): string | null {
      return config.base;
    },
    get VAPID_PUBLIC_KEY(): string | null {
      return config.vapid;
    },
    get REMINDERS_CONFIGURED(): boolean {
      return config.base !== null && config.vapid !== null;
    },
  };
});

/** Mon 2026-10-26 00:00 CDT. The fixture's training days are Mon and Thu at 18:00 local. */
const NOW = FIXTURE_START_MS;
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
const OTHER_ENDPOINT = 'https://updates.push.services.mozilla.com/wpush/v2/xyz789';
/** The configured key. 87 base64url characters decode to 65 bytes, an uncompressed P-256 point. */
const VAPID = `BP${'A'.repeat(85)}`;
/** A second, equally well formed 65 byte key: the key the deployment rotated to. */
const ROTATED_VAPID = `BQ${'B'.repeat(85)}`;
/*
 * The same 65 byte key in the two encodings a deployment can hand the build. The decoder
 * tolerates both deliberately: a VAPID public key copied out of the Cloudflare dashboard and
 * one read back from `wrangler secret` can differ in alphabet and padding, so the key arrives
 * either as base64url with no padding or as standard base64 with "+", "/" and a trailing "=".
 * Rejecting either encoding would refuse a key that is in fact correct.
 */
const KEY_BASE64URL = `BP${'-_'.repeat(42)}A`;
const KEY_BASE64_PADDED = `${KEY_BASE64URL.replace(/-/g, '+').replace(/_/g, '/')}=`;
// RFC 8291: p256dh is a 65 octet uncompressed P-256 point (87 base64url characters, and the
// leading "BA" decodes to the mandatory 0x04 tag octet); auth is 16 octets (22 characters).
// The Worker validates both lengths, so a short placeholder would fail validatePut below.
const KEYS = { p256dh: `BA${'x'.repeat(85)}`, auth: 'tBHItJI5svbpez7KI4CCAA' };
const SECRET = 's'.repeat(43);
const DEVICE_ID = '0f9b1a2c-3d4e-4f50-8a1b-2c3d4e5f6071';

function device(overrides: Partial<PushDevice> = {}): PushDevice {
  return {
    deviceId: DEVICE_ID,
    secret: SECRET,
    endpoint: ENDPOINT,
    keys: { ...KEYS },
    createdAt: NOW - 86_400_000, // [ms]
    lastSyncAt: null,
    lastSyncHash: null,
    ...overrides,
  };
}

function stateWith(pushDevice: PushDevice | null, enabled = true): AppState {
  return makeAppState({
    settings: { enabled, dayOfTime: '08:00', leadMinutes: [120, 60] },
    pushDevice,
  });
}

function mediaQueryList(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(display-mode: standalone)',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  };
}

/** jsdom implements no matchMedia at all, so the query is installed rather than spied on. */
function stubDisplayMode(standalone: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mediaQueryList(standalone)),
  );
}

/**
 * Decode base64url to the ArrayBuffer shape PushSubscriptionOptions.applicationServerKey
 * carries. Kept separate from the client's own decoder so a bug there cannot cancel out.
 */
function keyBytes(base64Url: string): ArrayBuffer {
  const padded = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

/** The applicationServerKey the client handed to pushManager.subscribe. */
function keyPassedTo(subscribeSpy: MockInstance): Uint8Array {
  const options: unknown = subscribeSpy.mock.calls[0]?.[0];
  const key: unknown = (options as { applicationServerKey: unknown }).applicationServerKey;
  if (!(key instanceof Uint8Array)) throw new Error('expected a Uint8Array applicationServerKey');
  return key;
}

function pushSubscription(
  endpoint: string,
  unsubscribeSpy: () => Promise<boolean>,
  applicationServerKey: ArrayBuffer | null,
): unknown {
  return {
    endpoint,
    // The key the subscription was minted under, i.e. what a rotation invalidates.
    options: { userVisibleOnly: true, applicationServerKey },
    unsubscribe: unsubscribeSpy,
    toJSON: () => ({ endpoint, keys: { ...KEYS } }),
  };
}

interface StubbedPush {
  subscribeSpy: MockInstance;
  unsubscribeSpy: MockInstance;
  getSubscriptionSpy: MockInstance;
}

/**
 * Install a service worker registration whose push manager already holds
 * `existingEndpoint` (or nothing when null) and mints `ENDPOINT` on a fresh subscribe.
 *
 * @param existingKey   application server key on the held subscription. Defaults to the
 *                      configured one, so callers that do not care read as "no rotation".
 * @param unsubscribeImpl what the held subscription's unsubscribe() does.
 */
function stubPushEnvironment(
  existingEndpoint: string | null,
  existingKey: ArrayBuffer | null = keyBytes(VAPID),
  unsubscribeImpl: () => Promise<boolean> = () => Promise.resolve(true),
): StubbedPush {
  const unsubscribeSpy = vi.fn(unsubscribeImpl);
  const existing =
    existingEndpoint === null
      ? null
      : pushSubscription(existingEndpoint, unsubscribeSpy, existingKey);
  const getSubscriptionSpy = vi.fn(() => Promise.resolve(existing));
  const subscribeSpy = vi.fn(() =>
    Promise.resolve(pushSubscription(ENDPOINT, unsubscribeSpy, keyBytes(VAPID))),
  );
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: { getSubscription: getSubscriptionSpy, subscribe: subscribeSpy },
      }),
    },
  });
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { requestPermission: vi.fn(() => Promise.resolve('granted')) });
  return { subscribeSpy, unsubscribeSpy, getSubscriptionSpy };
}

function stubFetch(status: number): MockInstance {
  const spy = vi.fn(() => Promise.resolve(new Response(null, { status })));
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** The request body as sent. Fails loudly rather than stringifying an object to [object Object]. */
function bodyText(init: RequestInit): string {
  const body = init.body;
  if (typeof body !== 'string') throw new Error('expected a serialised string request body');
  return body;
}

function watchConsole(): MockInstance[] {
  return [
    vi.spyOn(console, 'log').mockImplementation(() => undefined),
    vi.spyOn(console, 'info').mockImplementation(() => undefined),
    vi.spyOn(console, 'debug').mockImplementation(() => undefined),
    vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
  ];
}

beforeEach(() => {
  config.base = 'https://fti-reminders.example.workers.dev';
  config.vapid = VAPID;
  stubDisplayMode(false);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(navigator, 'userAgent');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isPushSupported', () => {
  it('is false when the runtime exposes no PushManager', () => {
    expect(isPushSupported()).toBe(false);
  });

  it('is true when service workers, PushManager and Notification all exist', () => {
    stubPushEnvironment(null);
    expect(isPushSupported()).toBe(true);
  });

  it('is false when Notification is missing even though PushManager exists', () => {
    stubPushEnvironment(null);
    vi.unstubAllGlobals();
    vi.stubGlobal('PushManager', class {});
    expect(isPushSupported()).toBe(false);
  });
});

describe('isInstalledPwa', () => {
  it('is true when the display mode is standalone', () => {
    stubDisplayMode(true);
    expect(isInstalledPwa()).toBe(true);
  });

  it('is true when the legacy iOS navigator.standalone flag is set', () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    expect(isInstalledPwa()).toBe(true);
    Reflect.deleteProperty(navigator, 'standalone');
  });

  it('is false in a plain browser tab', () => {
    expect(isInstalledPwa()).toBe(false);
  });

  it('is false without throwing when the runtime exposes no matchMedia', () => {
    // Some embedded webviews ship no matchMedia at all. An unguarded query would raise a
    // TypeError out of a capability check, i.e. the one place that must never throw.
    vi.stubGlobal('matchMedia', undefined);
    expect(isInstalledPwa()).toBe(false);
    expect(['ready', 'needs-install', 'unsupported']).toContain(pushAvailability());
  });
});

describe('capability detection', () => {
  it('never reads navigator.userAgent', () => {
    const userAgent = vi.fn(() => 'irrelevant');
    Object.defineProperty(navigator, 'userAgent', { get: userAgent, configurable: true });
    stubPushEnvironment(null);
    isPushSupported();
    isInstalledPwa();
    pushAvailability();
    expect(userAgent).not.toHaveBeenCalled();
  });

  it('reports needs-install when service workers run but push is absent from a tab', () => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
    expect(pushAvailability()).toBe('needs-install');
  });

  it('reports unsupported when push is absent from an installed app', () => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
    stubDisplayMode(true);
    expect(pushAvailability()).toBe('unsupported');
  });

  it('reports ready when push is available', () => {
    stubPushEnvironment(null);
    expect(pushAvailability()).toBe('ready');
  });
});

describe('subscribe', () => {
  it('refuses when the build carried no worker configuration', async () => {
    stubPushEnvironment(null);
    config.base = null;
    config.vapid = null;
    await expect(subscribe(null, null, NOW)).resolves.toEqual({
      ok: false,
      reason: 'not-configured',
    });
  });

  it('refuses as unsupported when push is absent from an installed app', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
    stubDisplayMode(true);
    await expect(subscribe(null, null, NOW)).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });

  it('refuses as not-installed when push is absent from a browser tab', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
    await expect(subscribe(null, null, NOW)).resolves.toEqual({
      ok: false,
      reason: 'not-installed',
    });
  });

  it('does not prompt for permission when it refuses before the prompt', async () => {
    const requestPermission = vi.fn(() => Promise.resolve('granted'));
    vi.stubGlobal('Notification', { requestPermission });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
    await subscribe(null, null, NOW);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('refuses when the user denies notification permission', async () => {
    stubPushEnvironment(null);
    vi.stubGlobal('Notification', { requestPermission: vi.fn(() => Promise.resolve('denied')) });
    await expect(subscribe(null, null, NOW)).resolves.toEqual({ ok: false, reason: 'denied' });
  });

  it('mints a device the Worker will accept and a 256 bit base64url secret', async () => {
    const { subscribeSpy } = stubPushEnvironment(null);
    const result = await subscribe(null, null, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The pattern is imported from the Worker, not copied: a change on either side fails
    // here. Asserted through .test() rather than toMatch(): vitest's toMatch(undefined)
    // passes silently, so a broken import would leave this assertion vacuous.
    expect(DEVICE_ID_PATTERN.test(result.device.deviceId)).toBe(true);
    expect(result.device.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.device.endpoint).toBe(ENDPOINT);
    expect(result.device.keys).toEqual(KEYS);
    expect(result.device.createdAt).toBe(NOW);
    expect(result.device.lastSyncAt).toBeNull();
    expect(result.device.lastSyncHash).toBeNull();
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('passes the VAPID key as a 65 byte applicationServerKey, not a string', async () => {
    const { subscribeSpy } = stubPushEnvironment(null);
    await subscribe(null, null, NOW);
    const options: unknown = subscribeSpy.mock.calls[0]?.[0];
    expect(options).toMatchObject({ userVisibleOnly: true });
    const key: unknown = (options as { applicationServerKey: unknown }).applicationServerKey;
    expect(key).toBeInstanceOf(Uint8Array);
    expect((key as Uint8Array).length).toBe(65);
  });

  it('falls back to the configured VAPID key when the caller passes none', async () => {
    const { subscribeSpy } = stubPushEnvironment(null);
    config.vapid = ROTATED_VAPID;
    await subscribe(null, null, NOW);
    const explicit = stubPushEnvironment(null);
    await subscribe(ROTATED_VAPID, null, NOW);
    const fromConfig: unknown = subscribeSpy.mock.calls[0]?.[0];
    const fromCaller: unknown = explicit.subscribeSpy.mock.calls[0]?.[0];
    expect(fromConfig).toEqual(fromCaller);
  });

  it('draws a different secret on every fresh subscription', async () => {
    stubPushEnvironment(null);
    const first = await subscribe(null, null, NOW);
    stubPushEnvironment(null);
    const second = await subscribe(null, null, NOW);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.device.secret).not.toBe(second.device.secret);
  });

  it('reuses the stored id and secret when the browser returns the same endpoint', async () => {
    const { subscribeSpy } = stubPushEnvironment(ENDPOINT);
    const stored = device({ lastSyncAt: NOW - 1000, lastSyncHash: 'cafebabe' });
    const result = await subscribe(null, stored, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.device.deviceId).toBe(stored.deviceId);
    expect(result.device.secret).toBe(stored.secret);
    expect(result.device.createdAt).toBe(stored.createdAt);
    // Always reset: the Worker record was deleted on unsubscribe, so it must be re-uploaded.
    expect(result.device.lastSyncAt).toBeNull();
    expect(result.device.lastSyncHash).toBeNull();
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it('mints a new id and secret when the browser returns a different endpoint', async () => {
    stubPushEnvironment(OTHER_ENDPOINT);
    const stored = device();
    const result = await subscribe(null, stored, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.device.endpoint).toBe(OTHER_ENDPOINT);
    expect(result.device.deviceId).not.toBe(stored.deviceId);
    expect(result.device.secret).not.toBe(stored.secret);
  });

  it('refuses a VAPID key one byte short of a P-256 point', async () => {
    stubPushEnvironment(null);
    // 86 base64url characters decode to 64 bytes: well formed, and still the wrong key.
    await expect(subscribe('B'.repeat(86), null, NOW)).resolves.toEqual({
      ok: false,
      reason: 'not-configured',
    });
  });

  it('refuses a VAPID key one byte longer than a P-256 point', async () => {
    stubPushEnvironment(null);
    // 88 base64url characters with no padding decode to 66 bytes.
    await expect(subscribe('C'.repeat(88), null, NOW)).resolves.toEqual({
      ok: false,
      reason: 'not-configured',
    });
  });

  it('accepts a 65 byte key in either base64 alphabet and decodes both alike', async () => {
    expect(KEY_BASE64URL).toHaveLength(87);
    expect(KEY_BASE64_PADDED).toHaveLength(88);
    expect(KEY_BASE64_PADDED.endsWith('=')).toBe(true);
    expect(KEY_BASE64_PADDED).toMatch(/\+/);
    expect(KEY_BASE64_PADDED).toMatch(/\//);

    const urlSafe = stubPushEnvironment(null);
    await expect(subscribe(KEY_BASE64URL, null, NOW)).resolves.toMatchObject({ ok: true });
    const standard = stubPushEnvironment(null);
    await expect(subscribe(KEY_BASE64_PADDED, null, NOW)).resolves.toMatchObject({ ok: true });

    const fromUrlSafe = keyPassedTo(urlSafe.subscribeSpy);
    const fromStandard = keyPassedTo(standard.subscribeSpy);
    expect(fromUrlSafe).toHaveLength(65);
    expect(Array.from(fromStandard)).toEqual(Array.from(fromUrlSafe));
  });

  it('reuses the current subscription when its application server key still matches', async () => {
    const { subscribeSpy, unsubscribeSpy } = stubPushEnvironment(ENDPOINT);
    await expect(subscribe(null, device(), NOW)).resolves.toMatchObject({ ok: true });
    expect(subscribeSpy).not.toHaveBeenCalled();
    expect(unsubscribeSpy).not.toHaveBeenCalled();
  });

  it('replaces a subscription minted under a superseded VAPID key', async () => {
    // After a key rotation the held subscription is signed for a key the server no longer
    // owns, so every push against it is rejected until the subscription is replaced.
    const { subscribeSpy, unsubscribeSpy } = stubPushEnvironment(
      ENDPOINT,
      keyBytes(ROTATED_VAPID),
    );
    await expect(subscribe(null, null, NOW)).resolves.toMatchObject({ ok: true });
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    // Order matters: the stale registration goes before the replacement is requested.
    const droppedAt = unsubscribeSpy.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    const mintedAt = subscribeSpy.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY;
    expect(droppedAt).toBeLessThan(mintedAt);
    expect(Array.from(keyPassedTo(subscribeSpy))).toEqual(
      Array.from(new Uint8Array(keyBytes(VAPID))),
    );
  });

  it('resubscribes when the current subscription reports no application server key', async () => {
    // unsubscribe() resolving false is not an error: the subscription is gone either way.
    const { subscribeSpy, unsubscribeSpy } = stubPushEnvironment(ENDPOINT, null, () =>
      Promise.resolve(false),
    );
    await expect(subscribe(null, null, NOW)).resolves.toMatchObject({ ok: true });
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('subscribes afresh even when dropping the superseded subscription rejects', async () => {
    const spies = watchConsole();
    const { subscribeSpy, unsubscribeSpy } = stubPushEnvironment(
      ENDPOINT,
      keyBytes(ROTATED_VAPID),
      () => Promise.reject(new Error('subscription already gone')),
    );
    await expect(subscribe(null, null, NOW)).resolves.toMatchObject({ ok: true });
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('reports failed when the push service rejects the subscription', async () => {
    stubPushEnvironment(null);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: () => Promise.resolve(null),
            subscribe: () => Promise.reject(new Error('push service unavailable')),
          },
        }),
      },
    });
    await expect(subscribe(null, null, NOW)).resolves.toEqual({ ok: false, reason: 'failed' });
  });
});

describe('syncSchedule', () => {
  it('reports no-device when nothing is subscribed and makes no request', async () => {
    const fetchSpy = stubFetch(204);
    await expect(syncSchedule(stateWith(null), FIXTURE_PROFILE_ID, NOW)).resolves.toEqual({
      status: 'no-device',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports unconfigured when the build carried no worker base URL', async () => {
    const fetchSpy = stubFetch(204);
    config.base = null;
    await expect(syncSchedule(stateWith(device()), FIXTURE_PROFILE_ID, NOW)).resolves.toEqual({
      status: 'unconfigured',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports disabled when reminders are switched off and makes no request', async () => {
    const fetchSpy = stubFetch(204);
    await expect(syncSchedule(stateWith(device(), false), FIXTURE_PROFILE_ID, NOW)).resolves.toEqual(
      { status: 'disabled' },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('PUTs to the device path and returns the device stamped with the upload', async () => {
    const fetchSpy = stubFetch(204);
    const result = await syncSchedule(stateWith(device()), FIXTURE_PROFILE_ID, NOW);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://fti-reminders.example.workers.dev/v1/devices/${DEVICE_ID}`);
    expect(init.method).toBe('PUT');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    // The Worker authenticates a PUT from the body, never a header.
    expect(new Headers(init.headers).get('Authorization')).toBeNull();
    expect(result.status).toBe('synced');
    if (result.status !== 'synced') return;
    expect(result.device.lastSyncAt).toBe(NOW);
    expect(result.device.lastSyncHash).toMatch(/^[0-9a-f]{8}$/);
    expect(result.device.secret).toBe(SECRET);
  });

  it('sends a body the deployed Worker validator accepts', async () => {
    const fetchSpy = stubFetch(204);
    await syncSchedule(stateWith(device()), FIXTURE_PROFILE_ID, NOW);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body: unknown = JSON.parse(bodyText(init));
    const accepted = validatePut(body, NOW, null);
    expect(accepted.ok ? null : accepted.error).toBeNull();
    // The Worker's clock is later than the client's by the request latency.
    const later = validatePut(body, NOW + 30_000, null);
    expect(later.ok ? null : later.error).toBeNull();
    expect(body).toMatchObject({
      secret: SECRET,
      subscription: { endpoint: ENDPOINT, keys: KEYS },
    });
    const reminders = (body as { reminders: unknown[] }).reminders;
    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.length).toBeLessThanOrEqual(MAX_INSTANTS);
  });

  it('skips the upload when the schedule and the last sync are both current', async () => {
    const fetchSpy = stubFetch(204);
    const first = await syncSchedule(stateWith(device()), FIXTURE_PROFILE_ID, NOW);
    expect(first.status).toBe('synced');
    if (first.status !== 'synced') return;
    fetchSpy.mockClear();
    await expect(
      syncSchedule(stateWith(first.device), FIXTURE_PROFILE_ID, NOW + 1000),
    ).resolves.toEqual({ status: 'unchanged' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uploads anyway once the last sync is older than the staleness floor', async () => {
    const fetchSpy = stubFetch(204);
    const first = await syncSchedule(stateWith(device()), FIXTURE_PROFILE_ID, NOW);
    if (first.status !== 'synced') throw new Error('setup failed');
    fetchSpy.mockClear();
    const stale = { ...first.device, lastSyncAt: NOW - SYNC_MAX_AGE_MS - 1 };
    const result = await syncSchedule(stateWith(stale), FIXTURE_PROFILE_ID, NOW);
    expect(result.status).toBe('synced');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('uploads again when a lead time changes the schedule', async () => {
    const fetchSpy = stubFetch(204);
    const first = await syncSchedule(stateWith(device()), FIXTURE_PROFILE_ID, NOW);
    if (first.status !== 'synced') throw new Error('setup failed');
    fetchSpy.mockClear();
    const changed = makeAppState({
      settings: { enabled: true, dayOfTime: '08:00', leadMinutes: [30] },
      pushDevice: first.device,
    });
    const result = await syncSchedule(changed, FIXTURE_PROFILE_ID, NOW + 1000);
    expect(result.status).toBe('synced');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('reports a stale device on 403 and does not retry', async () => {
    const fetchSpy = stubFetch(403);
    await expect(syncSchedule(stateWith(device()), FIXTURE_PROFILE_ID, NOW)).resolves.toEqual({
      status: 'stale-device',
      error: 'HTTP 403',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('reports a stale device on 404 and does not retry', async () => {
    const fetchSpy = stubFetch(404);
    await expect(syncSchedule(stateWith(device()), FIXTURE_PROFILE_ID, NOW)).resolves.toEqual({
      status: 'stale-device',
      error: 'HTTP 404',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('reports failure on 503 and leaves the last sync fields untouched', async () => {
    const fetchSpy = stubFetch(503);
    const stored = device({ lastSyncAt: NOW - 7 * 60 * 60 * 1000, lastSyncHash: 'deadbeef' });
    const result = await syncSchedule(stateWith(stored), FIXTURE_PROFILE_ID, NOW);
    expect(result).toEqual({ status: 'failed', error: 'HTTP 503' });
    expect(result).not.toHaveProperty('device');
    expect(stored.lastSyncAt).toBe(NOW - 7 * 60 * 60 * 1000);
    expect(stored.lastSyncHash).toBe('deadbeef');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('reports failure when the device is offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(syncSchedule(stateWith(device()), FIXTURE_PROFILE_ID, NOW)).resolves.toEqual({
      status: 'failed',
      error: 'network',
    });
  });
});

describe('unsubscribe', () => {
  it('DELETEs with the bearer secret and drops the browser subscription', async () => {
    const { unsubscribeSpy } = stubPushEnvironment(ENDPOINT);
    const fetchSpy = stubFetch(204);
    await expect(unsubscribe(device())).resolves.toEqual({ ok: true, error: null });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://fti-reminders.example.workers.dev/v1/devices/${DEVICE_ID}`);
    expect(init.method).toBe('DELETE');
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${SECRET}`);
    expect(init.body ?? null).toBeNull();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('still unsubscribes locally when the Worker call fails', async () => {
    const { unsubscribeSpy } = stubPushEnvironment(ENDPOINT);
    stubFetch(500);
    await expect(unsubscribe(device())).resolves.toEqual({ ok: false, error: 'HTTP 500' });
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes locally without a request when no worker is configured', async () => {
    const { unsubscribeSpy } = stubPushEnvironment(ENDPOINT);
    const fetchSpy = stubFetch(204);
    config.base = null;
    await expect(unsubscribe(device())).resolves.toEqual({ ok: true, error: null });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('secret handling', () => {
  it('writes neither the secret nor the endpoint to the console', async () => {
    const spies = watchConsole();
    const { unsubscribeSpy } = stubPushEnvironment(ENDPOINT);
    stubFetch(403);
    await subscribe(null, null, NOW);
    await syncSchedule(stateWith(device()), FIXTURE_PROFILE_ID, NOW);
    await unsubscribe(device());
    expect(unsubscribeSpy).toHaveBeenCalled();
    for (const spy of spies) {
      const logged = JSON.stringify(spy.mock.calls);
      expect(logged).not.toContain(SECRET);
      expect(logged).not.toContain(ENDPOINT);
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
