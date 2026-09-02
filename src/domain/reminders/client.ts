// src/domain/reminders/client.ts
//
// The browser side of the reminders contract (master plan §6.6): capability detection, the
// Web Push subscription lifecycle, and the schedule upload to the Worker.
//
// Division of labour. The client owns every scheduling decision; the Worker owns nothing but
// a list of {key, at, title, body} and a clock. That is why this module uploads a whole
// schedule rather than a diff: the Worker has no way to reconcile one.
//
// Secrets. The per-device secret is 256 bits from crypto.getRandomValues, base64url with no
// padding (43 characters, inside the Worker's 16..200 bound). It is the only credential the
// Worker recognises, so nothing here writes it, or the push endpoint, to the console.
//
// Units: every timestamp is epoch milliseconds, UTC (EpochMs). Durations are milliseconds.

import {
  REMINDER_API_BASE,
  SCHEDULE_HORIZON_DAYS,
  SYNC_MAX_AGE_MS,
  VAPID_PUBLIC_KEY,
} from '../../config/reminders';
import { todayLocal } from '../dates';
import { newId } from '../ids';
import type { AppState, EpochMs, PushDevice } from '../types';
import { computeReminderInstants, scheduleHash } from './instants';

/** Secret length. 32 bytes = 256 bits, well past the 128 bit floor. [bytes] */
const SECRET_BYTES = 32;

/** Uncompressed P-256 public key: 0x04 tag plus two 32 byte coordinates. [bytes] */
const VAPID_KEY_BYTES = 65;

/**
 * iOS Safari exposes installation through a non-standard navigator flag that predates the
 * display-mode media query and is absent from lib.dom. Declared, not asserted away.
 */
interface LegacyStandaloneNavigator {
  readonly standalone?: boolean;
}

// ---------------------------------------------------------------------------
// Capability detection
// ---------------------------------------------------------------------------

/**
 * True when the runtime can register a service worker and receive Web Push.
 *
 * Feature detection only. There is deliberately no user-agent parsing anywhere in this
 * module: a UA string is a claim, the presence of `PushManager` is a fact, and the fact is
 * what decides whether the next call succeeds.
 */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * True when the page is running as an installed app rather than a browser tab. The media
 * query covers Android and current iOS; navigator.standalone is the older iOS Safari flag.
 */
export function isInstalledPwa(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  // matchMedia is guarded because jsdom implements none: without the guard every caller of
  // this function in a test environment would die on a TypeError rather than read false.
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  }
  const legacy: Navigator & LegacyStandaloneNavigator = navigator;
  return legacy.standalone === true;
}

export type PushAvailability = 'ready' | 'needs-install' | 'unsupported';

/**
 * What the UI should say about push on this runtime, decided from features alone.
 *
 * "needs-install" is the case that matters: a runtime that registers service workers but
 * exposes no PushManager, viewed in a browser tab. iOS Safari is the platform that behaves
 * that way (Web Push arrived in 16.4 for Home Screen apps only), and installing is the
 * remedy. Detecting the shape rather than the vendor keeps the check honest if another
 * runtime adopts the same restriction, or if Safari lifts it.
 */
export function pushAvailability(): PushAvailability {
  if (isPushSupported()) return 'ready';
  if (typeof navigator === 'undefined') return 'unsupported';
  if ('serviceWorker' in navigator && !isInstalledPwa()) return 'needs-install';
  return 'unsupported';
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode base64url to bytes, or null when the input is not valid base64url.
 *
 * The return type names its buffer: since TypeScript 5.7 Uint8Array is generic over it, and
 * only the ArrayBuffer instantiation satisfies the BufferSource that pushManager.subscribe
 * wants. The unparameterised Uint8Array widens to ArrayBufferLike and is rejected.
 */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** 256 bits from the CSPRNG, base64url without padding: 43 characters. */
function randomSecret(): string {
  const bytes = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function deviceUrl(deviceId: string): string | null {
  const base = REMINDER_API_BASE;
  return base === null ? null : `${base}/v1/devices/${deviceId}`;
}

/**
 * Was `current` minted under exactly `expected`?
 *
 * A VAPID key rotation leaves the browser holding a subscription the new key cannot sign
 * for: the push service rejects every message against it, silently, forever. Reusing such a
 * subscription is therefore worse than minting a new one, so the keys are compared rather
 * than assumed equal.
 *
 * The loop runs over the full length instead of returning at the first mismatch. This is not
 * a timing defence (the key is public); it is a guard against an early exit that reads a
 * prefix match as equality. The sentinels differ from each other so an index that is somehow
 * absent can never contribute a zero difference, even though the length check precedes it.
 */
function sameApplicationServerKey(
  current: ArrayBuffer | null | undefined,
  expected: Uint8Array<ArrayBuffer>,
): boolean {
  if (current === null || current === undefined) return false;
  if (current.byteLength !== expected.length) return false;
  const actual = new Uint8Array(current);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= (actual[index] ?? 0x100) ^ (expected[index] ?? 0x200);
  }
  return difference === 0;
}

function readSubscriptionFields(
  subscription: PushSubscription,
): { endpoint: string; p256dh: string; auth: string } | null {
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.['p256dh'];
  const auth = json.keys?.['auth'];
  if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return null;
  }
  return { endpoint, p256dh, auth };
}

// ---------------------------------------------------------------------------
// Subscription lifecycle
// ---------------------------------------------------------------------------

export type SubscribeFailure =
  | 'unsupported'
  | 'not-configured'
  | 'not-installed'
  | 'denied'
  | 'failed';

export type SubscribeResult =
  | { ok: true; device: PushDevice }
  | { ok: false; reason: SubscribeFailure };

/**
 * Register this device for Web Push and return the record the store should hold.
 *
 * Order of refusals is deliberate. The "not-installed" and "unsupported" checks come before
 * Notification.requestPermission because that prompt is one-shot per origin: spending it in a
 * context that cannot receive a push leaves the user with a denied permission and no way back
 * except clearing site data.
 *
 * @param vapidPublicKey base64url VAPID public key, or null to use the configured one.
 * @param existing       the device already in the store, or null.
 * @param now            [ms] epoch, UTC. This module never reads a clock.
 *
 * `existing` matters because pushManager.subscribe returns the subscription that is already
 * registered rather than minting a new one. Issuing a fresh deviceId in that case would
 * strand the previous Worker record, which would keep sending. When the endpoint matches, the
 * stored id, secret and createdAt are reused. lastSyncAt and lastSyncHash are always reset:
 * after a subscribe the invariant is that the Worker holds nothing for this device.
 */
export async function subscribe(
  vapidPublicKey: string | null,
  existing: PushDevice | null,
  now: EpochMs,
): Promise<SubscribeResult> {
  const key = vapidPublicKey ?? VAPID_PUBLIC_KEY;
  if (key === null || REMINDER_API_BASE === null) return { ok: false, reason: 'not-configured' };

  const availability = pushAvailability();
  if (availability === 'needs-install') return { ok: false, reason: 'not-installed' };
  if (availability === 'unsupported') return { ok: false, reason: 'unsupported' };

  // MDN gives applicationServerKey as BufferSource or base64url string, but the string form
  // is not honoured everywhere, so the bytes are passed explicitly.
  const applicationServerKey = base64UrlToBytes(key);
  if (applicationServerKey === null || applicationServerKey.length !== VAPID_KEY_BYTES) {
    return { ok: false, reason: 'not-configured' };
  }

  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  try {
    const registration = await navigator.serviceWorker.ready;
    const current = await registration.pushManager.getSubscription();
    let subscription = current;
    // `options` is optional chained because a runtime that predates PushSubscriptionOptions
    // reports undefined rather than the declared object; that reads as "key unknown", which
    // resubscribes, rather than as a TypeError that would surface as reason "failed".
    if (
      subscription !== null &&
      !sameApplicationServerKey(subscription.options?.applicationServerKey, applicationServerKey)
    ) {
      try {
        // The boolean result is discarded and a rejection is swallowed: either way the stale
        // subscription is not one this device can keep using, and the resubscribe below is
        // the remedy in both cases. Nothing is logged, because the endpoint is a credential.
        await subscription.unsubscribe();
      } catch {
        // Deliberately empty: see above.
      }
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
    const fields = readSubscriptionFields(subscription);
    if (fields === null) return { ok: false, reason: 'failed' };

    const sameDevice = existing !== null && existing.endpoint === fields.endpoint;
    return {
      ok: true,
      device: {
        deviceId: sameDevice ? existing.deviceId : newId(),
        secret: sameDevice ? existing.secret : randomSecret(),
        endpoint: fields.endpoint,
        keys: { p256dh: fields.p256dh, auth: fields.auth },
        createdAt: sameDevice ? existing.createdAt : now, // [ms] epoch, UTC
        lastSyncAt: null,
        lastSyncHash: null,
      },
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

// ---------------------------------------------------------------------------
// Schedule upload
// ---------------------------------------------------------------------------

export type SyncResult =
  | { status: 'unconfigured' }
  | { status: 'no-device' }
  | { status: 'disabled' }
  | { status: 'unchanged' }
  | { status: 'synced'; device: PushDevice }
  | { status: 'stale-device'; error: string }
  | { status: 'failed'; error: string };

/**
 * Is the last acknowledged upload recent enough to trust?
 *
 * A negative age means the device clock moved backwards since the upload; that is treated as
 * stale rather than fresh, so a clock correction costs one extra PUT instead of silently
 * suppressing every upload until the clock catches up again.
 */
function lastSyncIsFresh(lastSyncAt: EpochMs | null, now: EpochMs): boolean {
  if (lastSyncAt === null) return false;
  const age = now - lastSyncAt; // [ms]
  return age >= 0 && age <= SYNC_MAX_AGE_MS;
}

/*
 * Contract the UI must honour (Task 8). This module returns outcomes and stores nothing, so
 * three rules live with the caller rather than here.
 *
 * 1. On "stale-device", clear state.pushDevice and call subscribe() once. The Worker record
 *    is gone or belongs to another secret, so every further sync repeats the same 403 or
 *    404. Once, not in a loop: if the fresh subscription is refused too, staleness was not
 *    the fault and a retry loop would only spend the permission prompt against it.
 * 2. When the user switches reminders off, await unsubscribe(pushDevice) before writing
 *    enabled = false. In the other order the sync short circuits on "disabled" and the
 *    Worker record is never deleted, so the device keeps receiving until its endpoint dies.
 * 3. A "disabled" result must never clear the Worker record. It reports that this client
 *    had nothing to upload, not that the server should forget the device; deleting on it
 *    would silence a device whose owner paused reminders for a single day.
 */
/**
 * Upload the next SCHEDULE_HORIZON_DAYS days of instants, unless the Worker already holds
 * them and the upload is recent.
 *
 * Two reasons to send. The schedule changed, or the last acknowledged upload is older than
 * SYNC_MAX_AGE_MS: the Worker prunes each reminder once it has fired, so a device whose plan
 * never changes would otherwise run dry at the end of the 21 day horizon.
 *
 * The hash is taken over exactly the array that is uploaded, so "unchanged" can never mean
 * "unchanged from something the Worker was never sent".
 *
 * @param now [ms] epoch, UTC.
 * @returns a typed outcome; the caller decides what to store. On "failed" and "stale-device"
 *          no device is returned, which is what leaves lastSyncAt/lastSyncHash untouched and
 *          makes the next call retry. Nothing here retries by itself.
 */
export async function syncSchedule(
  state: AppState,
  profileId: string,
  now: EpochMs,
): Promise<SyncResult> {
  const device = state.pushDevice;
  if (device === null) return { status: 'no-device' };
  const url = deviceUrl(device.deviceId);
  if (url === null) return { status: 'unconfigured' };

  const profile = state.profiles[profileId];
  const settings = state.reminderSettings[profileId];
  if (profile === undefined || settings === undefined) return { status: 'disabled' };
  if (!settings.enabled) return { status: 'disabled' };

  const from = todayLocal(profile.timezone, now);
  // computeReminderInstants already clamps to (now, now + MAX_HORIZON_MS] and caps the list at
  // MAX_INSTANTS, which is the Worker's own contract. No second filter is applied here: it
  // would be unreachable, and a filter applied after the hash would let the two disagree.
  const instants = computeReminderInstants(state, profileId, from, SCHEDULE_HORIZON_DAYS, now);
  const hash = scheduleHash(instants);
  if (hash === device.lastSyncHash && lastSyncIsFresh(device.lastSyncAt, now)) {
    return { status: 'unchanged' };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PUT',
      // The Worker authenticates a PUT from the body, not a header, so that a stray
      // Authorization header can never be the thing that grants access.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: device.secret,
        subscription: { endpoint: device.endpoint, keys: device.keys },
        reminders: instants,
      }),
    });
  } catch {
    return { status: 'failed', error: 'network' };
  }

  // 403 is a secret mismatch and 404 an unknown device: in both cases the Worker record is
  // not ours and no number of retries will change that. The caller re-subscribes.
  if (response.status === 403 || response.status === 404) {
    return { status: 'stale-device', error: `HTTP ${response.status}` };
  }
  if (!response.ok) return { status: 'failed', error: `HTTP ${response.status}` };

  return { status: 'synced', device: { ...device, lastSyncAt: now, lastSyncHash: hash } };
}

/**
 * Delete the Worker record and drop the browser subscription.
 *
 * The local unsubscribe runs even when the Worker call fails, so a user who switched
 * reminders off is never left receiving them. An orphaned Worker record stops sending on its
 * own: the push service returns 404/410 for the dead endpoint and the cron tick deletes it.
 */
export async function unsubscribe(
  device: PushDevice,
): Promise<{ ok: boolean; error: string | null }> {
  let error: string | null = null;

  const url = deviceUrl(device.deviceId);
  if (url !== null) {
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${device.secret}` },
      });
      if (!response.ok) error = `HTTP ${response.status}`;
    } catch {
      error = 'network';
    }
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription !== null) await subscription.unsubscribe();
  } catch {
    error = error ?? 'local unsubscribe failed';
  }

  return { ok: error === null, error };
}
