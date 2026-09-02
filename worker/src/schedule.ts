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

// Input-size bounds, all in UTF-16 code units (String.length), not bytes.
const MAX_SECRET_LENGTH = 200;
const MIN_SECRET_LENGTH = 16;
const MAX_ENDPOINT_LENGTH = 1024;
const MAX_KEY_LENGTH = 120;
const MAX_TITLE_LENGTH = 100;
const MAX_BODY_LENGTH = 300;

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function prunedSent(sent: Record<string, EpochMs>, now: EpochMs): Record<string, EpochMs> {
  const kept: Record<string, EpochMs> = {};
  for (const [key, at] of Object.entries(sent)) {
    if (now - at <= SENT_RETENTION_MS) kept[key] = at;
  }
  return kept;
}

function parseSubscription(value: unknown): PushSubscriptionRecord | { error: string } {
  if (!isRecordObject(value)) return { error: "subscription must be an object" };
  const endpoint = boundedString(readString(value, "endpoint"), 1, MAX_ENDPOINT_LENGTH);
  if (endpoint === null || !endpoint.startsWith("https://")) {
    return { error: "subscription.endpoint must be an https URL" };
  }
  const keys = value["keys"];
  if (!isRecordObject(keys)) return { error: "subscription.keys must be an object" };
  const p256dh = boundedString(readString(keys, "p256dh"), 1, 200);
  const auth = boundedString(readString(keys, "auth"), 1, 100);
  if (p256dh === null) return { error: "subscription.keys.p256dh must be a string" };
  if (auth === null) return { error: "subscription.keys.auth must be a string" };
  return { endpoint, keys: { p256dh, auth } };
}

function parseInstant(value: unknown, index: number, now: EpochMs): ReminderInstant | { error: string } {
  if (!isRecordObject(value)) return { error: `reminder ${index}: must be an object` };
  const key = boundedString(readString(value, "key"), 1, MAX_KEY_LENGTH);
  if (key === null) return { error: `reminder ${index}: key must be a 1..120 character string` };
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
      sent: existing === null ? {} : prunedSent(existing.sent, now),
    },
  };
}

/** Reminders whose instant has passed within the last 15 minutes and were never sent. */
export function selectDue(record: DeviceRecord, now: EpochMs): ReminderInstant[] {
  return record.reminders
    .filter((r) => r.at <= now && r.at > now - DUE_WINDOW_MS && !(r.key in record.sent))
    .sort((a, b) => a.at - b.at);
}

/** Record `keys` as sent at `now`, pruning `sent` entries older than 24 h. Pure. */
export function markSent(record: DeviceRecord, keys: string[], now: EpochMs): DeviceRecord {
  const sent = prunedSent(record.sent, now);
  for (const key of keys) sent[key] = now;
  return { ...record, sent };
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
  const sent: Record<string, EpochMs> = {};
  for (const [key, value] of Object.entries(rawSent)) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    sent[key] = value;
  }
  return { secret, subscription, reminders, sent };
}
