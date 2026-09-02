/**
 * Pure scheduling logic for the reminders Worker. No KV, no fetch, no globals —
 * everything here is a total function of its arguments so the master plan's §7
 * "exactly one send across 30 cron ticks" gate can be proved without Miniflare.
 *
 * Units: every timestamp is epoch milliseconds, UTC (EpochMs). Durations are ms.
 */

export type EpochMs = number;

export interface ReminderInstant {
  key: string;
  /** Instant the reminder falls due. Epoch milliseconds, UTC. */
  at: EpochMs;
  title: string;
  body: string;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface DeviceRecord {
  secret: string;
  subscription: PushSubscriptionRecord;
  reminders: ReminderInstant[];
  /** key -> instant the push was accepted by the push service, epoch ms UTC. Dedupe map. */
  sent: Record<string, EpochMs>;
}

export type ValidateResult =
  | { ok: true; record: DeviceRecord }
  | { ok: false; status: 400 | 403; error: string };

/** Master plan §6.6: at most 200 reminders per device. Count, dimensionless. */
export const MAX_REMINDERS = 200;
/** Master plan §6.6: `at` must be >= now - 1 h. Duration, milliseconds. */
export const PAST_WINDOW_MS = 60 * 60 * 1000;
/** Master plan §6.6: `at` must be <= now + 21 d. Duration, milliseconds. */
export const FUTURE_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;
/** Master plan §6.6: a reminder is due while `at > now - 15 min`. Duration, milliseconds. */
export const DUE_WINDOW_MS = 15 * 60 * 1000;
/** Master plan §6.6: prune `sent` entries older than 24 h. Duration, milliseconds. */
export const SENT_RETENTION_MS = 24 * 60 * 60 * 1000;
/**
 * Hard ceiling on `sent` entries after the 24 h time prune. Count, dimensionless.
 * Time alone does not bound the map: a client is free to re-upload a fresh 200-reminder
 * schedule every minute, and every key it manages to get sent stays for 24 h, so the record
 * grows until a KV value hits the 25 MB limit. Two full schedules' worth is the smallest cap
 * that can never evict a key the current schedule still needs (MAX_REMINDERS = 200).
 */
export const MAX_SENT_ENTRIES = 2 * MAX_REMINDERS;

// Input-size bounds, all in UTF-16 code units (String.length), not bytes.
const MAX_SECRET_LENGTH = 200;
const MIN_SECRET_LENGTH = 16;
const MAX_ENDPOINT_LENGTH = 1024;
const MAX_KEY_LENGTH = 120;
const MAX_TITLE_LENGTH = 100;
const MAX_BODY_LENGTH = 300;
const MAX_SUBSCRIPTION_KEY_LENGTH = 200;

/**
 * Reminder-key charset. src/domain/reminders/instants.ts emits exactly two shapes,
 * `${LocalDate}:day-of:0` and `${LocalDate}:lead:${minutes}` — e.g. "2026-10-26:day-of:0"
 * and "2026-10-26:lead:120" — so every client key is two or more ':'-separated segments
 * drawn from [A-Za-z0-9_-].
 *
 * The mandatory colon is the point. Every property name on Object.prototype
 * ("__proto__", "constructor", "toString", "__defineGetter__", …) is colon-free, so none of
 * them is expressible as a reminder key. That is defence in depth, not the fix: `sent` is a
 * null-prototype object and membership is tested with Object.hasOwn, which is what actually
 * makes such a key harmless. This regex makes it unreachable as well, and it turns a key the
 * client could never have produced into a visible 400 instead of a silent drop.
 *
 * Linear-time: the character class and the ':' separator are disjoint, so there is no
 * ambiguity for the engine to backtrack over.
 */
const REMINDER_KEY_PATTERN = /^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)+$/;

/** base64url alphabet, RFC 4648 §5, unpadded. */
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
/**
 * Octet counts fixed by the Web Push RFCs, verified against the RFC text:
 *  - p256dh: RFC 8291 §4 — "the uncompressed point form defined in [X9.62] (that is, a
 *    65-octet sequence that starts with a 0x04 octet)".
 *  - auth:   RFC 8291 §3.2 — "a hard-to-guess sequence of 16 octets".
 * Units: octets (bytes) after base64url decoding, not characters.
 */
const P256DH_OCTETS = 65;
const AUTH_OCTETS = 16;

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A fresh `sent` map with no prototype. Every map in this module is built this way so that
 * (a) `map[key] = number` for key "__proto__" creates a real own property instead of hitting
 * the Object.prototype accessor, which ignores a non-object value and drops the entry, and
 * (b) no inherited name can ever be mistaken for a stored entry. Membership is still tested
 * with Object.hasOwn rather than `in`, so neither half depends on the other.
 */
function emptySent(): Record<string, EpochMs> {
  return Object.create(null) as Record<string, EpochMs>;
}

/**
 * Number of octets a base64url string (RFC 4648 §5, unpadded) decodes to, or -1 when it
 * decodes to nothing. `atob` needs standard base64 with padding, so the two alphabet
 * substitutions and the padding are restored first; a length of 4k+1 characters encodes no
 * whole number of octets. The returned binary string holds one UTF-16 code unit per octet,
 * so its `.length` IS the octet count.
 */
function base64UrlOctets(value: string): number {
  const remainder = value.length % 4;
  if (remainder === 1) return -1;
  const restored = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = remainder === 0 ? restored : restored + "=".repeat(4 - remainder);
  try {
    return atob(padded).length;
  } catch {
    return -1;
  }
}

/** An https URL the WHATWG parser accepts, with a host. Not merely a string that starts "https://". */
function isHttpsUrl(value: string): boolean {
  // The literal prefix is kept alongside the parse: WHATWG normalises "https:/host/x" (one
  // slash) to the same URL, and no push service emits that form.
  if (!value.startsWith("https://")) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && parsed.hostname.length > 0;
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" ? value : null;
}

function boundedString(value: string | null, min: number, max: number): string | null {
  if (value === null) return null;
  return value.length >= min && value.length <= max ? value : null;
}

/**
 * Length-independent string comparison. Not a substitute for a real constant-time
 * primitive — the Workers runtime exposes none for strings — but it removes the
 * trivial early-exit signal from the secret check.
 */
export function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Time-prune to the 24 h retention window, then cap at MAX_SENT_ENTRIES, newest first.
 * Time first: an entry that is already expired must never displace a fresh one. Ties on
 * `at` break by key so the survivor set is a total function of the input and two Workers
 * pruning the same map produce byte-identical JSON.
 */
function prunedSent(sent: Record<string, EpochMs>, now: EpochMs): Record<string, EpochMs> {
  const fresh = Object.entries(sent).filter(([, at]) => now - at <= SENT_RETENTION_MS);
  if (fresh.length > MAX_SENT_ENTRIES) {
    fresh.sort((a, b) => (a[1] === b[1] ? (a[0] < b[0] ? -1 : 1) : b[1] - a[1]));
    fresh.length = MAX_SENT_ENTRIES;
  }
  const kept = emptySent();
  for (const [key, at] of fresh) kept[key] = at;
  return kept;
}

function parseSubscription(value: unknown): PushSubscriptionRecord | { error: string } {
  if (!isRecordObject(value)) return { error: "subscription must be an object" };
  const endpoint = boundedString(readString(value, "endpoint"), 1, MAX_ENDPOINT_LENGTH);
  if (endpoint === null || !isHttpsUrl(endpoint)) {
    return { error: "subscription.endpoint must be an https URL" };
  }
  const keys = value["keys"];
  if (!isRecordObject(keys)) return { error: "subscription.keys must be an object" };
  const p256dh = boundedString(readString(keys, "p256dh"), 1, MAX_SUBSCRIPTION_KEY_LENGTH);
  const auth = boundedString(readString(keys, "auth"), 1, MAX_SUBSCRIPTION_KEY_LENGTH);
  // Alphabet before length: base64UrlOctets is only meaningful on a base64url string.
  if (p256dh === null || !BASE64URL_PATTERN.test(p256dh) || base64UrlOctets(p256dh) !== P256DH_OCTETS) {
    return { error: `subscription.keys.p256dh must be ${P256DH_OCTETS} base64url octets` };
  }
  if (auth === null || !BASE64URL_PATTERN.test(auth) || base64UrlOctets(auth) !== AUTH_OCTETS) {
    return { error: `subscription.keys.auth must be ${AUTH_OCTETS} base64url octets` };
  }
  return { endpoint, keys: { p256dh, auth } };
}

function parseInstant(value: unknown, index: number, now: EpochMs): ReminderInstant | { error: string } {
  if (!isRecordObject(value)) return { error: `reminder ${index}: must be an object` };
  const key = boundedString(readString(value, "key"), 1, MAX_KEY_LENGTH);
  if (key === null || !REMINDER_KEY_PATTERN.test(key)) {
    return {
      error: `reminder ${index}: key must be 1..${MAX_KEY_LENGTH} characters of [A-Za-z0-9_-] segments joined by ":"`,
    };
  }
  const at = value["at"];
  if (typeof at !== "number" || !Number.isInteger(at)) {
    return { error: `reminder ${index}: at must be an integer` };
  }
  if (at < now - PAST_WINDOW_MS || at > now + FUTURE_WINDOW_MS) {
    return { error: `reminder ${index}: at is outside [now - 1 h, now + 21 d]` };
  }
  const title = boundedString(readString(value, "title"), 1, MAX_TITLE_LENGTH);
  if (title === null) return { error: `reminder ${index}: title must be a 1..100 character string` };
  const bodyText = boundedString(readString(value, "body"), 0, MAX_BODY_LENGTH);
  if (bodyText === null) return { error: `reminder ${index}: body must be a 0..300 character string` };
  return { key, at, title, body: bodyText };
}

function hasError(value: object): value is { error: string } {
  return "error" in value;
}

/**
 * Validate a `PUT /v1/devices/{id}` body.
 * `existing` is the stored record for that id, or null when the device is new.
 * On an update the presented secret must match, and the existing (pruned) `sent`
 * map is carried into the new record so a re-upload cannot cause a second send.
 */
export function validatePut(body: unknown, now: EpochMs, existing: DeviceRecord | null): ValidateResult {
  if (!isRecordObject(body)) return { ok: false, status: 400, error: "body must be a JSON object" };

  const secret = boundedString(readString(body, "secret"), MIN_SECRET_LENGTH, MAX_SECRET_LENGTH);
  if (secret === null) {
    return { ok: false, status: 400, error: "secret must be a 16..200 character string" };
  }
  if (existing !== null && !secretsMatch(existing.secret, secret)) {
    return { ok: false, status: 403, error: "secret mismatch" };
  }

  const subscription = parseSubscription(body["subscription"]);
  if (hasError(subscription)) return { ok: false, status: 400, error: subscription.error };

  const rawReminders = body["reminders"];
  if (!Array.isArray(rawReminders)) {
    return { ok: false, status: 400, error: "reminders must be an array" };
  }
  if (rawReminders.length > MAX_REMINDERS) {
    return { ok: false, status: 400, error: "reminders: at most 200 entries" };
  }

  const reminders: ReminderInstant[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < rawReminders.length; index += 1) {
    const parsed = parseInstant(rawReminders[index], index, now);
    if (hasError(parsed)) return { ok: false, status: 400, error: parsed.error };
    if (seen.has(parsed.key)) {
      return { ok: false, status: 400, error: `reminders: duplicate key "${parsed.key}"` };
    }
    seen.add(parsed.key);
    reminders.push(parsed);
  }

  return {
    ok: true,
    record: {
      secret,
      subscription,
      reminders,
      sent: existing === null ? emptySent() : prunedSent(existing.sent, now),
    },
  };
}

/** Reminders whose instant has passed within the last 15 minutes and were never sent. */
export function selectDue(record: DeviceRecord, now: EpochMs): ReminderInstant[] {
  return record.reminders
    // Object.hasOwn, never `in`: `"toString" in {}` is true through the prototype chain, so
    // `in` would report a reminder keyed after any Object.prototype member as already sent
    // and it would never be delivered.
    .filter((r) => r.at <= now && r.at > now - DUE_WINDOW_MS && !Object.hasOwn(record.sent, r.key))
    .sort((a, b) => a.at - b.at);
}

/**
 * Record `keys` as sent at `now`, then prune `sent` to the 24 h window and the
 * MAX_SENT_ENTRIES ceiling. Pure.
 */
export function markSent(record: DeviceRecord, keys: string[], now: EpochMs): DeviceRecord {
  // Merge first, prune second, so the size cap is applied to the map that will be stored.
  // The new keys carry `now`, the newest instant there is, so the cap can never evict them.
  const merged = emptySent();
  for (const [key, at] of Object.entries(record.sent)) merged[key] = at;
  for (const key of keys) merged[key] = now;
  return { ...record, sent: prunedSent(merged, now) };
}

/**
 * Drop reminders that can never be selected again (`at <= now - 15 min`, the exact
 * complement of selectDue's window) and prune `sent`. Pure; only ever shrinks the
 * record, which is what makes pruneDelta a valid change detector.
 */
export function removeExpired(record: DeviceRecord, now: EpochMs): DeviceRecord {
  return {
    ...record,
    reminders: record.reminders.filter((r) => r.at > now - DUE_WINDOW_MS),
    sent: prunedSent(record.sent, now),
  };
}

/** How many entries `removeExpired` dropped. Zero means nothing needs writing back. */
export function pruneDelta(before: DeviceRecord, after: DeviceRecord): number {
  return (
    before.reminders.length -
    after.reminders.length +
    (Object.keys(before.sent).length - Object.keys(after.sent).length)
  );
}

/** Narrow a value read back from KV. Returns null rather than throwing on corruption. */
export function parseDeviceRecord(raw: unknown): DeviceRecord | null {
  if (!isRecordObject(raw)) return null;
  const secret = readString(raw, "secret");
  if (secret === null) return null;
  const subscription = parseSubscription(raw["subscription"]);
  if (hasError(subscription)) return null;
  const rawReminders = raw["reminders"];
  if (!Array.isArray(rawReminders)) return null;
  const reminders: ReminderInstant[] = [];
  for (const candidate of rawReminders) {
    if (!isRecordObject(candidate)) return null;
    const key = readString(candidate, "key");
    const at = candidate["at"];
    const title = readString(candidate, "title");
    const bodyText = readString(candidate, "body");
    if (key === null || title === null || bodyText === null) return null;
    if (typeof at !== "number" || !Number.isFinite(at)) return null;
    reminders.push({ key, at, title, body: bodyText });
  }
  const rawSent = raw["sent"];
  if (!isRecordObject(rawSent)) return null;
  // Null-prototype: JSON.parse('{"__proto__":1}') creates an OWN "__proto__" property, so a
  // stored map can legitimately carry one, and copying it onto a plain object would hit the
  // accessor and silently lose the entry.
  const sent = emptySent();
  for (const [key, value] of Object.entries(rawSent)) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    sent[key] = value;
  }
  return { secret, subscription, reminders, sent };
}
