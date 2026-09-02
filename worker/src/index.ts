import { sendPush, type PushEnv } from "./push";
import {
  markSent,
  parseDeviceRecord,
  pruneDelta,
  removeExpired,
  secretsMatch,
  selectDue,
  validatePut,
  type DeviceRecord,
  type EpochMs,
} from "./schedule";

/**
 * The three KV methods this Worker uses. Declaring them here rather than importing
 * KVNamespace lets the tests supply an in-memory stub with no cast, which is what
 * keeps the test suite Miniflare-free (master plan §4).
 */
export interface KvStore {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env extends PushEnv {
  REMINDERS: KvStore;
  /** Public half of the VAPID pair; echoed by /v1/health so a mismatch is visible. */
  VAPID_PUBLIC_KEY: string;
  /** Exact origin of the Pages site, e.g. "https://user.github.io". */
  ALLOWED_ORIGIN: string;
}

export interface TickSummary {
  devices: number;
  sent: number;
  failed: number;
  removed: number;
  writes: number;
}

const INDEX_KEY = "idx";
/** Hard cap on indexed devices. Count, dimensionless. The free-plan subrequest
 * ceiling binds long before this. */
const MAX_DEVICES = 100;
/**
 * Request-body ceiling. Compared against String.length, i.e. UTF-16 CODE UNITS,
 * not bytes: a body of all-ASCII JSON (which this one is) makes the two equal, and
 * for non-ASCII the check is the looser of the two. 200 reminders of ~200 bytes
 * plus the subscription is well under it either way.
 */
const MAX_BODY_BYTES = 64 * 1024;
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function deviceKey(id: string): string {
  return `dev:${id}`;
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    // Duration, SECONDS (CORS preflight cache; the header is defined in seconds).
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function noContent(env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

function jsonResponse(env: Env, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(env), "Content-Type": "application/json" },
  });
}

/** Refused before any CORS header is attached, so the browser sees a hard failure. */
function forbidden(): Response {
  return new Response(JSON.stringify({ error: "origin not allowed" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

async function readIndex(kv: KvStore): Promise<string[]> {
  const raw = await kv.get(INDEX_KEY, "text");
  if (raw === null) return [];
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("idx is not valid JSON; treating it as empty");
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((value): value is string => typeof value === "string");
}

async function readDevice(kv: KvStore, id: string): Promise<DeviceRecord | null> {
  const raw = await kv.get(deviceKey(id), "text");
  if (raw === null) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`device record ${id} is not valid JSON`);
    return null;
  }
  const record = parseDeviceRecord(parsed);
  if (record === null) console.warn(`device record ${id} failed validation; treating as absent`);
  return record;
}

async function handlePut(request: Request, env: Env, id: string, now: EpochMs): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return jsonResponse(env, 413, { error: "body too large" });
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return jsonResponse(env, 400, { error: "body must be valid JSON" });
  }

  const existing = await readDevice(env.REMINDERS, id);
  const result = validatePut(parsed, now, existing);
  if (!result.ok) return jsonResponse(env, result.status, { error: result.error });

  if (existing === null) {
    const ids = await readIndex(env.REMINDERS);
    if (!ids.includes(id)) {
      if (ids.length >= MAX_DEVICES) {
        return jsonResponse(env, 503, { error: "device capacity reached" });
      }
      await env.REMINDERS.put(deviceKey(id), JSON.stringify(result.record));
      await env.REMINDERS.put(INDEX_KEY, JSON.stringify([...ids, id]));
      return noContent(env);
    }
  }
  await env.REMINDERS.put(deviceKey(id), JSON.stringify(result.record));
  return noContent(env);
}

async function handleDelete(request: Request, env: Env, id: string): Promise<Response> {
  const header = request.headers.get("Authorization");
  if (header === null || !header.startsWith("Bearer ")) {
    return jsonResponse(env, 401, { error: "missing bearer secret" });
  }
  const secret = header.slice("Bearer ".length);
  const existing = await readDevice(env.REMINDERS, id);
  if (existing === null) return noContent(env); // idempotent delete
  if (!secretsMatch(existing.secret, secret)) {
    return jsonResponse(env, 403, { error: "secret mismatch" });
  }
  await env.REMINDERS.delete(deviceKey(id));
  const ids = await readIndex(env.REMINDERS);
  if (ids.includes(id)) {
    await env.REMINDERS.put(INDEX_KEY, JSON.stringify(ids.filter((value) => value !== id)));
  }
  return noContent(env);
}

export async function handleFetch(request: Request, env: Env, now: EpochMs): Promise<Response> {
  const origin = request.headers.get("Origin");
  // CORS is a browser convenience here, not the authorisation boundary; the
  // per-device secret is. A request with no Origin (curl, uptime check) is allowed.
  if (origin !== null && origin !== env.ALLOWED_ORIGIN) return forbidden();

  if (request.method === "OPTIONS") return noContent(env);

  const url = new URL(request.url);
  if (url.pathname === "/v1/health" && request.method === "GET") {
    return jsonResponse(env, 200, { ok: true, vapidPublicKey: env.VAPID_PUBLIC_KEY });
  }

  const match = /^\/v1\/devices\/([^/]+)$/.exec(url.pathname);
  if (match !== null) {
    const id = match[1] ?? "";
    if (!DEVICE_ID_PATTERN.test(id)) return jsonResponse(env, 404, { error: "unknown device" });
    if (request.method === "PUT") return handlePut(request, env, id, now);
    if (request.method === "DELETE") return handleDelete(request, env, id);
    return jsonResponse(env, 405, { error: "method not allowed" });
  }

  return jsonResponse(env, 404, { error: "not found" });
}

/**
 * One cron tick. `now` is an instant in epoch milliseconds, UTC. Sequential on
 * purpose: the free plan allows 50 subrequests and 10 ms CPU per invocation, so a
 * burst of parallel pushes is a liability, not a win.
 */
export async function runTick(env: Env, now: EpochMs): Promise<TickSummary> {
  const ids = await readIndex(env.REMINDERS);
  const summary: TickSummary = { devices: ids.length, sent: 0, failed: 0, removed: 0, writes: 0 };
  const removed: string[] = [];

  for (const id of ids) {
    const record = await readDevice(env.REMINDERS, id);
    if (record === null) {
      removed.push(id);
      continue;
    }

    const due = selectDue(record, now);
    const sentKeys: string[] = [];
    let gone = false;
    for (const reminder of due) {
      const outcome = await sendPush(env, record.subscription, reminder);
      if (outcome === "sent") sentKeys.push(reminder.key);
      else if (outcome === "gone") {
        gone = true;
        break;
      } else summary.failed += 1;
    }

    if (gone) {
      await env.REMINDERS.delete(deviceKey(id));
      removed.push(id);
      continue;
    }

    summary.sent += sentKeys.length;
    const trimmed = removeExpired(record, now);
    const next = sentKeys.length > 0 ? markSent(trimmed, sentKeys, now) : trimmed;
    if (sentKeys.length > 0 || pruneDelta(record, trimmed) > 0) {
      await env.REMINDERS.put(deviceKey(id), JSON.stringify(next));
      summary.writes += 1;
    }
  }

  if (removed.length > 0) {
    summary.removed = removed.length;
    await env.REMINDERS.put(INDEX_KEY, JSON.stringify(ids.filter((id) => !removed.includes(id))));
    summary.writes += 1;
  }

  return summary;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleFetch(request, env, Date.now());
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    // controller.scheduledTime is an instant in epoch milliseconds, UTC.
    const summary = await runTick(env, controller.scheduledTime);
    console.log(
      `tick devices=${summary.devices} sent=${summary.sent} failed=${summary.failed} ` +
        `removed=${summary.removed} writes=${summary.writes}`,
    );
  },
};
