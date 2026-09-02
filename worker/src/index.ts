import { sendPush, type PushEnv } from "./push";
import {
  DEVICE_ID_PATTERN,
  isInert,
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
 * Re-exported for one release. DEVICE_ID_PATTERN now lives in ./schedule, which holds no
 * Workers-only globals and can therefore be imported from the app's test suite without
 * pulling the Workers runtime types into that TypeScript program. Importers should move to
 * `worker/src/schedule`; this line goes at the next release.
 */
export { DEVICE_ID_PATTERN } from "./schedule";

/** One page of a KV key listing. Structurally the shape KVNamespace.list() returns. */
export interface KvListResult {
  keys: { name: string }[];
  list_complete: boolean;
  cursor?: string;
}

/**
 * The four KV methods this Worker uses. Declaring them here rather than importing
 * KVNamespace lets the tests supply an in-memory stub with no cast, which is what
 * keeps the test suite Miniflare-free (master plan §4).
 */
export interface KvStore {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string | undefined }): Promise<KvListResult>;
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
 * Request-body ceiling, in UTF-8 OCTETS — the unit the master plan's "body > 64 KB -> 413"
 * is stated in, and the unit the wire actually carries. String.length would measure UTF-16
 * code units instead, which for astral or CJK text understates the payload by up to 3x:
 * 59,296 U+4E00 characters are 59,296 code units but 177,888 octets.
 * 200 reminders of ~200 octets plus the subscription sit well under it.
 */
const MAX_BODY_BYTES = 64 * 1024;
const DEVICE_PREFIX = "dev:";

function deviceKey(id: string): string {
  return `${DEVICE_PREFIX}${id}`;
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

/**
 * Refused before any Access-Control-Allow-Origin is attached, so the browser sees a hard
 * failure. `Vary: Origin` is still sent: the response body depends on the Origin header, and
 * without it a shared cache could serve this refusal for a request from the allowed origin.
 */
function forbidden(): Response {
  return new Response(JSON.stringify({ error: "origin not allowed" }), {
    status: 403,
    headers: { "Content-Type": "application/json", Vary: "Origin" },
  });
}

/** 405 carries `Allow`; RFC 9110 §15.5.6 makes the header mandatory on this status. */
function methodNotAllowed(env: Env, allow: string): Response {
  return new Response(JSON.stringify({ error: "method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders(env), "Content-Type": "application/json", Allow: allow },
  });
}

async function readIndex(kv: KvStore): Promise<string[]> {
  const raw = await kv.get(INDEX_KEY, "text");
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("idx is not valid JSON; treating it as empty");
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((value): value is string => typeof value === "string");
}

/**
 * Why the three states are distinguished: "absent" means there is nothing under the key, so
 * deleting it would spend one of the free plan's 1,000 daily deletes on a no-op. "corrupt"
 * means a value exists that can never parse, so the tick deletes it rather than paying a KV
 * read for it on every reconcile and leaving a dead subscription on disk.
 */
type DeviceLoad =
  | { state: "ok"; record: DeviceRecord }
  | { state: "absent" }
  | { state: "corrupt" };

async function loadDevice(kv: KvStore, id: string): Promise<DeviceLoad> {
  const raw = await kv.get(deviceKey(id), "text");
  if (raw === null) return { state: "absent" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`device record ${id} is not valid JSON`);
    return { state: "corrupt" };
  }
  const record = parseDeviceRecord(parsed);
  if (record === null) {
    console.warn(`device record ${id} failed validation; treating as absent`);
    return { state: "corrupt" };
  }
  return { state: "ok", record };
}

/** The request handlers treat a corrupt record exactly as they treat a missing one. */
async function readDevice(kv: KvStore, id: string): Promise<DeviceRecord | null> {
  const loaded = await loadDevice(kv, id);
  return loaded.state === "ok" ? loaded.record : null;
}

/**
 * Every `dev:` id in KV, the authoritative answer that `idx` only approximates. Paginated:
 * one KV list request returns at most 1,000 keys, and MAX_DEVICES caps the namespace well
 * inside that, so the steady state is a single request.
 */
async function listDeviceIds(kv: KvStore): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await kv.list(
      cursor === undefined ? { prefix: DEVICE_PREFIX } : { prefix: DEVICE_PREFIX, cursor },
    );
    for (const entry of page.keys) ids.push(entry.name.slice(DEVICE_PREFIX.length));
    if (page.list_complete || page.cursor === undefined) return ids;
    cursor = page.cursor;
  }
}

/**
 * True on the tick at minute 0 of the hour. `now` is epoch milliseconds, UTC.
 *
 * The reconcile below costs one KV list request per call, and Cloudflare's Workers Free plan
 * allows 1,000 list requests per day (Workers KV pricing table; logged in REFERENCES.md).
 * The cron fires every minute, so reconciling on every tick would need 1,440 list requests a
 * day and exceed that quota by 44 %, at which point the reconcile — and nothing else — starts
 * failing. Once an hour needs 24, i.e. 2.4 % of the quota, and bounds an orphaned device's
 * invisibility at 60 minutes. The PUT-side re-assert repairs it sooner whenever the orphaned
 * device syncs at all, so this is the backstop for a device that has gone quiet.
 */
function isReconcileTick(now: EpochMs): boolean {
  return new Date(now).getUTCMinutes() === 0;
}

async function handlePut(request: Request, env: Env, id: string, now: EpochMs): Promise<Response> {
  // Declared size first, so an oversize body is refused before a byte of it is read. A
  // missing or non-numeric Content-Length falls through to the measured check (NaN > n is
  // false), which is the only check a chunked upload gets.
  const declared = request.headers.get("Content-Length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    return jsonResponse(env, 413, { error: "body too large" });
  }
  const text = await request.text();
  // Octets, not UTF-16 code units: see MAX_BODY_BYTES.
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return jsonResponse(env, 413, { error: "body too large" });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return jsonResponse(env, 400, { error: "body must be valid JSON" });
  }

  const existing = await readDevice(env.REMINDERS, id);
  const result = validatePut(parsed, now, existing);
  if (!result.ok) return jsonResponse(env, result.status, { error: result.error });

  // Re-assert the index on EVERY put, update as well as create. `idx` is read-modify-write
  // over a single key with no compare-and-swap, so two concurrent creates both read it before
  // either writes, and the second write drops the first device: its record is in KV but its
  // id is not in `idx`, so it is never ticked, never counted against MAX_DEVICES and never
  // deleted. Checking on an update costs one KV read and repairs the orphan the moment that
  // device next syncs.
  const ids = await readIndex(env.REMINDERS);
  const indexed = ids.includes(id);
  if (!indexed && ids.length >= MAX_DEVICES) {
    return jsonResponse(env, 503, { error: "device capacity reached" });
  }
  await env.REMINDERS.put(deviceKey(id), JSON.stringify(result.record));
  // Written only when it actually changed: `idx` is one hot key and the free plan allows
  // 1,000 KV writes a day.
  if (!indexed) await env.REMINDERS.put(INDEX_KEY, JSON.stringify([...ids, id]));
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
  // Read-modify-write on `idx` with no compare-and-swap, exactly like handlePut, and
  // deliberately not repaired the way handlePut repairs itself. The asymmetry is in what the
  // two races cost. A create that loses the race leaves an id in KV but NOT in `idx`, and an
  // unindexed device is invisible: never ticked, never counted against MAX_DEVICES, never
  // deleted - so handlePut re-asserts on every PUT and the hourly reconcile backstops it. A
  // removal that loses the race leaves the opposite, an id in `idx` whose record is gone, and
  // that repairs itself for free: the next tick reads the key, gets "absent", and drops the
  // id from `idx` in the write it was already making. Paying for a CAS here would buy nothing
  // the next tick does not already do. runTick's own `idx` write is unguarded for the same
  // reason.
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

  // OPTIONS is answered per route, not before routing: a preflight for a path this Worker
  // does not serve must 404, or the browser is told a route exists that does not.
  const url = new URL(request.url);
  if (url.pathname === "/v1/health") {
    if (request.method === "GET") {
      return jsonResponse(env, 200, { ok: true, vapidPublicKey: env.VAPID_PUBLIC_KEY });
    }
    if (request.method === "OPTIONS") return noContent(env);
    return methodNotAllowed(env, "GET, OPTIONS");
  }

  const match = /^\/v1\/devices\/([^/]+)$/.exec(url.pathname);
  if (match !== null) {
    const id = match[1] ?? "";
    if (!DEVICE_ID_PATTERN.test(id)) return jsonResponse(env, 404, { error: "unknown device" });
    if (request.method === "PUT") return handlePut(request, env, id, now);
    if (request.method === "DELETE") return handleDelete(request, env, id);
    if (request.method === "OPTIONS") return noContent(env);
    return methodNotAllowed(env, "PUT, DELETE, OPTIONS");
  }

  return jsonResponse(env, 404, { error: "not found" });
}

/**
 * One cron tick. `now` is an instant in epoch milliseconds, UTC. Sequential on
 * purpose: the free plan allows 50 subrequests and 10 ms CPU per invocation, so a
 * burst of parallel pushes is a liability, not a win.
 */
export async function runTick(env: Env, now: EpochMs): Promise<TickSummary> {
  const stored = await readIndex(env.REMINDERS);
  let ids = stored;
  let reconciled = false;
  const reconcile = isReconcileTick(now);
  if (reconcile) {
    const known = new Set(stored);
    const orphans = (await listDeviceIds(env.REMINDERS)).filter((id) => !known.has(id));
    if (orphans.length > 0) {
      ids = [...stored, ...orphans];
      reconciled = true;
    }
  }

  const summary: TickSummary = { devices: ids.length, sent: 0, failed: 0, removed: 0, writes: 0 };
  const removed: string[] = [];

  for (const id of ids) {
    const loaded = await loadDevice(env.REMINDERS, id);
    if (loaded.state !== "ok") {
      // A corrupt value can never become valid, so delete it rather than pay a KV read for it
      // on every tick and leave a dead subscription on disk. An absent one costs no delete.
      if (loaded.state === "corrupt") await env.REMINDERS.delete(deviceKey(id));
      removed.push(id);
      continue;
    }
    const record = loaded.record;

    // Reap an inert device: nothing left to deliver and no client sync for
    // INERT_DEVICE_TTL_MS. Without this, such a record is never pushed to, so it never earns
    // a 410, so nothing ever deletes it - one KV read on every one of the 1,440 daily ticks
    // and one of the MAX_DEVICES slots, forever.
    //
    // On the reconcile tick only, for two reasons. It costs one delete per reaped record
    // against the free plan's 1,000 a day, and checking hourly rather than every minute
    // divides the worst case by 60 while delaying a reap by at most an hour on a 14 day
    // clock. And it keeps this loop write-free on the other 1,416 ticks of the day, which is
    // the property the idle-tick budget in docs/RUNBOOK-reminders.md §11 rests on.
    if (reconcile && isInert(record, now)) {
      await env.REMINDERS.delete(deviceKey(id));
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

  summary.removed = removed.length;
  // Unguarded read-modify-write on `idx`, for the reason spelled out in handleDelete: a
  // create that this write clobbers is re-asserted by that device's next PUT and by the next
  // reconcile, and this write only ever removes ids whose records are already gone.
  if (removed.length > 0 || reconciled) {
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
