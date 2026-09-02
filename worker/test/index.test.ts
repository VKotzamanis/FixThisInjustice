import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, {
  handleFetch,
  runTick,
  type Env,
  type KvListResult,
  type KvStore,
} from "../src/index";
import { sendPush } from "../src/push";
import { INERT_DEVICE_TTL_MS, type DeviceRecord, type ReminderInstant } from "../src/schedule";

vi.mock("../src/push", () => ({
  sendPush: vi.fn(() => Promise.resolve("sent")),
  APP_URL_PATH: "/FixThisInjustice/",
}));

// Mocked for the end-to-end block at the bottom, which re-imports the REAL src/push.
// The rest of the file never reaches the builder because src/push itself is mocked.
vi.mock("@pushforge/builder", () => ({
  buildPushHTTPRequest: vi.fn(),
}));

const sendMock = vi.mocked(sendPush);

/** Fixed clock for every test. Epoch milliseconds, UTC (2026-10-26T23:00:00Z). */
const NOW = 1_793_055_600_000;
/** Durations, milliseconds. */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ORIGIN = "https://example.github.io";
const DEVICE_ID = "0f9b1a2c-3d4e-4f50-8a1b-2c3d4e5f6071";
const SECRET = "s".repeat(43);
/** A real uncompressed P-256 point: 65 octets, leading 0x04, base64url (RFC 8291 §4). */
const P256DH = "BG9gwOFFUymmbn0PojtRGJa4cA_NWQJFC6EE7paZ9HSFqE355S0qgFrO7Fe3gjrBNglZH7IIU2zksWJKVX7ZR1I";
/** A 16-octet authentication secret, base64url (RFC 8291 §3.2). */
const AUTH = "tBHItJI5svbpez7KI4CCXg";
/** Reminder keys in the shape src/domain/reminders/instants.ts emits. */
const KEY = "2026-10-26:lead:120";
const KEY2 = "2026-10-27:day-of:0";

class MemoryKv implements KvStore {
  readonly data = new Map<string, string>();
  reads = 0;
  writes = 0;
  deletes = 0;
  lists = 0;
  /** Keys returned per list() call, so pagination can be exercised. Count, dimensionless. */
  pageSize = 1000;

  // KvStore.get takes a second "text" argument; the stub stores strings and has no other
  // form to select, so it declares one parameter and stays assignable to the interface.
  get(key: string): Promise<string | null> {
    this.reads += 1;
    return Promise.resolve(this.data.get(key) ?? null);
  }

  put(key: string, value: string): Promise<void> {
    this.writes += 1;
    this.data.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.deletes += 1;
    this.data.delete(key);
    return Promise.resolve();
  }

  // Lists are counted apart from reads: Cloudflare caps and bills them as their own
  // operation class (1,000/day on the free plan against 100,000 reads).
  list(options: { prefix: string; cursor?: string | undefined }): Promise<KvListResult> {
    this.lists += 1;
    const matching = [...this.data.keys()].filter((key) => key.startsWith(options.prefix)).sort();
    const start = options.cursor === undefined ? 0 : Number(options.cursor);
    const page = matching.slice(start, start + this.pageSize).map((name) => ({ name }));
    const next = start + page.length;
    return Promise.resolve(
      next >= matching.length
        ? { keys: page, list_complete: true }
        : { keys: page, list_complete: false, cursor: String(next) },
    );
  }
}

function makeEnv(store: MemoryKv): Env {
  return {
    REMINDERS: store,
    VAPID_PRIVATE_JWK: '{"kty":"EC","crv":"P-256","x":"X","y":"Y","d":"D"}',
    VAPID_PUBLIC_KEY: "BPublicKeyForTests",
    ADMIN_CONTACT: "mailto:owner@example.com",
    ALLOWED_ORIGIN: ORIGIN,
  };
}

/** `at` is an instant in epoch milliseconds, UTC. */
function instant(key: string, at: number): ReminderInstant {
  return { key, at, title: "Upper today", body: "Upper A at 18:00, session 3 of 24" };
}

function putBody(reminders: ReminderInstant[], secret = SECRET): string {
  return JSON.stringify({
    secret,
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: P256DH, auth: AUTH },
    },
    reminders,
  });
}

function putRequest(reminders: ReminderInstant[], secret = SECRET, id = DEVICE_ID): Request {
  return new Request(`https://worker.example/v1/devices/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: putBody(reminders, secret),
  });
}

function seed(store: MemoryKv, record: DeviceRecord, id = DEVICE_ID): void {
  store.data.set(`dev:${id}`, JSON.stringify(record));
  store.data.set("idx", JSON.stringify([id]));
}

/** `lastSyncedAt` defaults to NOW: a freshly synced device, which the reaper must never touch. */
function seededRecord(
  reminders: ReminderInstant[],
  sent: Record<string, number> = {},
  lastSyncedAt = NOW,
): DeviceRecord {
  return {
    secret: SECRET,
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: P256DH, auth: AUTH },
    },
    reminders,
    sent,
    lastSyncedAt,
  };
}

let kv: MemoryKv;
let env: Env;

beforeEach(() => {
  kv = new MemoryKv();
  env = makeEnv(kv);
  sendMock.mockResolvedValue("sent");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /v1/health", () => {
  it("reports ok and the deployed VAPID public key", async () => {
    const response = await handleFetch(
      new Request("https://worker.example/v1/health"),
      env,
      NOW,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, vapidPublicKey: "BPublicKeyForTests" });
  });

  it("echoes whatever VAPID_PUBLIC_KEY is bound, so a key mismatch is one curl away", async () => {
    const other = makeEnv(kv);
    other.VAPID_PUBLIC_KEY = "BSomeOtherDeployedKey";
    const response = await handleFetch(new Request("https://worker.example/v1/health"), other, NOW);
    expect(await response.json()).toEqual({ ok: true, vapidPublicKey: "BSomeOtherDeployedKey" });
  });

  it("never echoes the private key", async () => {
    const response = await handleFetch(new Request("https://worker.example/v1/health"), env, NOW);
    const text = await response.text();
    expect(text).not.toContain(env.VAPID_PRIVATE_JWK);
    expect(text).not.toContain('"d"');
  });
});

describe("CORS", () => {
  it("answers a preflight from the allowed origin", async () => {
    const response = await handleFetch(
      new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
        method: "OPTIONS",
        headers: { Origin: ORIGIN, "Access-Control-Request-Method": "PUT" },
      }),
      env,
      NOW,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("PUT");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("refuses a preflight from any other origin", async () => {
    const response = await handleFetch(
      new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
        method: "OPTIONS",
        headers: { Origin: "https://attacker.example", "Access-Control-Request-Method": "PUT" },
      }),
      env,
      NOW,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("refuses a PUT carrying a foreign Origin header", async () => {
    const request = new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
      body: putBody([instant(KEY, NOW + HOUR)]),
    });
    expect((await handleFetch(request, env, NOW)).status).toBe(403);
  });
});

describe("PUT /v1/devices/:id", () => {
  it("creates the record and indexes the device", async () => {
    const response = await handleFetch(putRequest([instant(KEY, NOW + HOUR)]), env, NOW);
    expect(response.status).toBe(204);
    expect(kv.data.get("idx")).toBe(JSON.stringify([DEVICE_ID]));
    const stored: unknown = JSON.parse(kv.data.get(`dev:${DEVICE_ID}`) ?? "null");
    expect(stored).toMatchObject({ secret: SECRET, sent: {} });
  });

  it("does not duplicate the id in idx on a second PUT", async () => {
    await handleFetch(putRequest([instant(KEY, NOW + HOUR)]), env, NOW);
    await handleFetch(putRequest([instant(KEY2, NOW + 2 * HOUR)]), env, NOW);
    expect(kv.data.get("idx")).toBe(JSON.stringify([DEVICE_ID]));
  });

  it("updates the reminders in place when the secret matches", async () => {
    await handleFetch(putRequest([instant(KEY, NOW + HOUR)]), env, NOW);
    const response = await handleFetch(putRequest([instant(KEY2, NOW + 2 * HOUR)]), env, NOW);
    expect(response.status).toBe(204);
    const stored: unknown = JSON.parse(kv.data.get(`dev:${DEVICE_ID}`) ?? "null");
    expect(stored).toMatchObject({ reminders: [instant(KEY2, NOW + 2 * HOUR)] });
  });

  it("carries the sent map across a re-sync so a re-upload cannot cause a second send", async () => {
    seed(kv, seededRecord([instant(KEY, NOW)], { [KEY]: NOW }));
    await handleFetch(putRequest([instant(KEY, NOW)]), env, NOW);
    const stored: unknown = JSON.parse(kv.data.get(`dev:${DEVICE_ID}`) ?? "null");
    expect(stored).toMatchObject({ sent: { [KEY]: NOW } });
    expect(await runTick(env, NOW)).toMatchObject({ sent: 0 });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret with 403", async () => {
    await handleFetch(putRequest([instant(KEY, NOW + HOUR)]), env, NOW);
    const response = await handleFetch(
      putRequest([instant(KEY, NOW + HOUR)], "w".repeat(43)),
      env,
      NOW,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "secret mismatch" });
  });

  it("rejects an instant more than 21 days ahead with 400", async () => {
    const response = await handleFetch(
      putRequest([instant("2026-11-20:lead:90", NOW + 21 * DAY + MINUTE)]),
      env,
      NOW,
    );
    expect(response.status).toBe(400);
  });

  it("rejects an instant more than an hour in the past with 400", async () => {
    const response = await handleFetch(putRequest([instant("2026-10-26:lead:30", NOW - HOUR - MINUTE)]), env, NOW);
    expect(response.status).toBe(400);
  });

  it("rejects a malformed device id with 404", async () => {
    const response = await handleFetch(
      putRequest([instant(KEY, NOW + HOUR)], SECRET, "not-a-uuid"),
      env,
      NOW,
    );
    expect(response.status).toBe(404);
  });

  it("rejects a body that is not JSON with 400", async () => {
    const request = new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: "{not json",
    });
    expect((await handleFetch(request, env, NOW)).status).toBe(400);
  });

  it("rejects a body over 64 KB with 413 before parsing it", async () => {
    // 70 000 UTF-16 code units of filler puts the body past the 65 536 ceiling.
    const oversize = JSON.stringify({ secret: SECRET, filler: "x".repeat(70_000) });
    const request = new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: oversize,
    });
    const response = await handleFetch(request, env, NOW);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "body too large" });
    expect(kv.writes).toBe(0);
  });

  it("refuses a new device with 503 once the index holds 100 devices", async () => {
    const full = Array.from({ length: 100 }, (_, i) => filledId(i));
    kv.data.set("idx", JSON.stringify(full));
    const response = await handleFetch(putRequest([instant(KEY, NOW + HOUR)]), env, NOW);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "device capacity reached" });
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(false);
  });

  it("still admits the 100th device, pinning the cap at 100 and not 99", async () => {
    const nearlyFull = Array.from({ length: 99 }, (_, i) => filledId(i));
    kv.data.set("idx", JSON.stringify(nearlyFull));
    const response = await handleFetch(putRequest([instant(KEY, NOW + HOUR)]), env, NOW);
    expect(response.status).toBe(204);
    expect(JSON.parse(kv.data.get("idx") ?? "[]")).toHaveLength(100);
  });

  it("lets an existing device update even when the index is at the cap", async () => {
    const full = Array.from({ length: 99 }, (_, i) => filledId(i));
    kv.data.set("idx", JSON.stringify([...full, DEVICE_ID]));
    kv.data.set(`dev:${DEVICE_ID}`, JSON.stringify(seededRecord([])));
    const response = await handleFetch(putRequest([instant(KEY, NOW + HOUR)]), env, NOW);
    expect(response.status).toBe(204);
  });
});

/** A syntactically valid device id for index-filling. Not a real UUID v4. */
function filledId(i: number): string {
  const hex = i.toString(16).padStart(12, "0");
  return `0f9b1a2c-3d4e-4f50-8a1b-${hex}`;
}

describe("DELETE /v1/devices/:id", () => {
  it("removes the record and the index entry when the bearer secret matches", async () => {
    seed(kv, seededRecord([instant(KEY, NOW + HOUR)]));
    const response = await handleFetch(
      new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${SECRET}`, Origin: ORIGIN },
      }),
      env,
      NOW,
    );
    expect(response.status).toBe(204);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(false);
    expect(kv.data.get("idx")).toBe("[]");
  });

  it("refuses a wrong bearer secret with 403 and keeps the record", async () => {
    seed(kv, seededRecord([instant(KEY, NOW + HOUR)]));
    const response = await handleFetch(
      new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer wrong", Origin: ORIGIN },
      }),
      env,
      NOW,
    );
    expect(response.status).toBe(403);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(true);
  });

  it("requires an Authorization header", async () => {
    seed(kv, seededRecord([]));
    const response = await handleFetch(
      new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
        method: "DELETE",
        headers: { Origin: ORIGIN },
      }),
      env,
      NOW,
    );
    expect(response.status).toBe(401);
  });

  it("rejects a non-Bearer Authorization scheme with 401", async () => {
    seed(kv, seededRecord([]));
    const response = await handleFetch(
      new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Basic ${SECRET}`, Origin: ORIGIN },
      }),
      env,
      NOW,
    );
    expect(response.status).toBe(401);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(true);
  });
});

describe("unknown routes", () => {
  it("returns 404", async () => {
    expect((await handleFetch(new Request("https://worker.example/"), env, NOW)).status).toBe(404);
  });

  it("returns 405 for a method the device route does not serve", async () => {
    const response = await handleFetch(
      new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, { method: "GET" }),
      env,
      NOW,
    );
    expect(response.status).toBe(405);
  });
});

describe("runTick", () => {
  it("sends a due reminder exactly once across 30 cron ticks", async () => {
    seed(kv, seededRecord([instant(KEY, NOW + 5 * MINUTE)]));
    for (let tick = 0; tick < 30; tick += 1) {
      await runTick(env, NOW + tick * MINUTE);
    }
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("writes the device record at most once per tick and not at all when nothing changed", async () => {
    seed(kv, seededRecord([instant("later", NOW + 6 * HOUR)]));
    const summary = await runTick(env, NOW);
    expect(summary).toEqual({ devices: 1, sent: 0, failed: 0, removed: 0, writes: 0 });
    expect(kv.writes).toBe(0);

    const sending = await runTick(env, NOW + 6 * HOUR);
    expect(sending.sent).toBe(1);
    expect(sending.writes).toBe(1);
  });

  it("sends every due instant in one tick and writes the record once", async () => {
    seed(
      kv,
      seededRecord([
        instant("a", NOW - MINUTE),
        instant("b", NOW - 2 * MINUTE),
        instant("c", NOW + HOUR),
      ]),
    );
    const summary = await runTick(env, NOW);
    expect(summary.sent).toBe(2);
    expect(summary.writes).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("retries a failed push on the next tick and stops once it succeeds", async () => {
    seed(kv, seededRecord([instant(KEY, NOW)]));
    sendMock.mockResolvedValueOnce("failed");
    await runTick(env, NOW);
    expect(sendMock).toHaveBeenCalledTimes(1);
    await runTick(env, NOW + MINUTE);
    expect(sendMock).toHaveBeenCalledTimes(2);
    await runTick(env, NOW + 2 * MINUTE);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the record and counts a failure when the push fails", async () => {
    seed(kv, seededRecord([instant(KEY, NOW)]));
    sendMock.mockResolvedValue("failed");
    const summary = await runTick(env, NOW);
    expect(summary.failed).toBe(1);
    expect(summary.sent).toBe(0);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(true);
  });

  it("deletes the device and its index entry when the push service reports gone", async () => {
    seed(kv, seededRecord([instant(KEY, NOW)]));
    sendMock.mockResolvedValue("gone");
    const summary = await runTick(env, NOW);
    expect(summary.removed).toBe(1);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(false);
    expect(kv.data.get("idx")).toBe("[]");
  });

  it("drops an index entry whose record has vanished", async () => {
    kv.data.set("idx", JSON.stringify([DEVICE_ID]));
    const summary = await runTick(env, NOW);
    expect(summary.removed).toBe(1);
    expect(kv.data.get("idx")).toBe("[]");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("prunes an expired reminder with a single write", async () => {
    seed(kv, seededRecord([instant("old", NOW - 20 * MINUTE)]));
    const summary = await runTick(env, NOW);
    expect(summary).toEqual({ devices: 1, sent: 0, failed: 0, removed: 0, writes: 1 });
    const stored: unknown = JSON.parse(kv.data.get(`dev:${DEVICE_ID}`) ?? "null");
    expect(stored).toMatchObject({ reminders: [] });
  });

  it("reads idx once and each device once per tick", async () => {
    seed(kv, seededRecord([instant("later", NOW + 6 * HOUR)]));
    kv.reads = 0;
    await runTick(env, NOW);
    expect(kv.reads).toBe(2); // idx + dev:{id}
  });

  it("does nothing when there are no devices", async () => {
    const summary = await runTick(env, NOW);
    expect(summary).toEqual({ devices: 0, sent: 0, failed: 0, removed: 0, writes: 0 });
    expect(kv.writes).toBe(0);
  });
});

describe("default export", () => {
  it("routes a fetch through handleFetch", async () => {
    const response = await worker.fetch(new Request("https://worker.example/v1/health"), env);
    expect(response.status).toBe(200);
  });

  it("runs a tick at the controller's scheduledTime", async () => {
    seed(kv, seededRecord([instant(KEY, NOW)]));
    const controller: ScheduledController = {
      // scheduledTime is an instant in epoch milliseconds, UTC.
      scheduledTime: NOW,
      cron: "* * * * *",
      noRetry: () => {},
    };
    await worker.scheduled(controller, env);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[2]?.key).toBe(KEY);
  });

  it("does not send a reminder that is not yet due at the controller's time", async () => {
    seed(kv, seededRecord([instant(KEY, NOW + HOUR)]));
    const controller: ScheduledController = {
      scheduledTime: NOW,
      cron: "* * * * *",
      noRetry: () => {},
    };
    await worker.scheduled(controller, env);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("logging hygiene", () => {
  it("never writes the device secret or the subscription keys to the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    // A wrong secret, a corrupt index, a record that is not JSON, and a record that
    // parses but fails validation - every branch that reaches a console call.
    await handleFetch(putRequest([instant(KEY, NOW + HOUR)]), env, NOW);
    await handleFetch(putRequest([instant(KEY, NOW + HOUR)], "w".repeat(43)), env, NOW);
    await handleFetch(
      new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${"w".repeat(43)}`, Origin: ORIGIN },
      }),
      env,
      NOW,
    );
    kv.data.set(`dev:${DEVICE_ID}`, `{"secret":"${SECRET}","broken`);
    await runTick(env, NOW);
    kv.data.set(`dev:${DEVICE_ID}`, JSON.stringify({ secret: SECRET, keys: { p256dh: P256DH } }));
    await runTick(env, NOW);
    kv.data.set("idx", `[not json ${SECRET}`);
    await runTick(env, NOW);

    seed(kv, seededRecord([instant(KEY, NOW)]));
    const controller: ScheduledController = { scheduledTime: NOW, cron: "* * * * *", noRetry: () => {} };
    await worker.scheduled(controller, env);

    const logged = [...warn.mock.calls, ...log.mock.calls, ...error.mock.calls]
      .flat()
      .map(String)
      .join("\n");
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(P256DH);
    expect(logged).not.toContain(AUTH);
    expect(logged).not.toContain(env.VAPID_PRIVATE_JWK);

    warn.mockRestore();
    log.mockRestore();
    error.mockRestore();
  });
});

// These two drive the REAL src/push against a stubbed global fetch, so the
// push-service status -> device-lifecycle coupling is proved end to end rather
// than assumed from the mocked sendPush above.
describe("end to end through the real push transport", () => {
  async function loadReal(): Promise<typeof import("../src/index")> {
    vi.doUnmock("../src/push");
    vi.resetModules();
    const builder = await import("@pushforge/builder");
    vi.mocked(builder.buildPushHTTPRequest).mockResolvedValue({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      headers: new Headers({ "content-encoding": "aes128gcm" }),
      body: new ArrayBuffer(8),
    });
    return import("../src/index");
  }

  afterEach(() => {
    vi.doMock("../src/push", () => ({
      sendPush: vi.fn(() => Promise.resolve("sent")),
      APP_URL_PATH: "/FixThisInjustice/",
    }));
    vi.resetModules();
  });

  it("deletes the device and its idx entry when the push service answers 410", async () => {
    const real = await loadReal();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 410 }))));
    seed(kv, seededRecord([instant(KEY, NOW)]));
    const summary = await real.runTick(env, NOW);
    expect(summary.removed).toBe(1);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(false);
    expect(kv.data.get("idx")).toBe("[]");
  });

  it("marks a thrown fetch as failed and keeps the device record", async () => {
    const real = await loadReal();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("connection reset"))));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    seed(kv, seededRecord([instant(KEY, NOW)]));
    const summary = await real.runTick(env, NOW);
    expect(summary.failed).toBe(1);
    expect(summary.sent).toBe(0);
    expect(summary.removed).toBe(0);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(true);
    // The record is untouched, so the next tick retries inside the 15 min window.
    expect(kv.writes).toBe(0);
    warn.mockRestore();
  });
});

/**
 * Forces the exact lost-update interleaving on `idx`: the first two reads of `idx` both
 * complete before either write lands. Deterministic — a barrier promise, no timers.
 */
class InterleavedKv extends MemoryKv {
  private indexReads = 0;
  private releaseBarrier: (() => void) | null = null;
  private barrier: Promise<void> | null = null;

  override async get(key: string): Promise<string | null> {
    const value = await super.get(key);
    if (key !== "idx") return value;
    this.barrier ??= new Promise<void>((resolve) => {
      this.releaseBarrier = resolve;
    });
    this.indexReads += 1;
    if (this.indexReads >= 2) this.releaseBarrier?.();
    else await this.barrier;
    return value;
  }
}

describe("idx lost update", () => {
  const OTHER_ID = "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9";

  it("loses one id when two creates interleave, and re-indexes it on that device's next PUT", async () => {
    const raced = new InterleavedKv();
    const racedEnv = makeEnv(raced);
    const [first, second] = await Promise.all([
      handleFetch(putRequest([instant(KEY, NOW + HOUR)], SECRET, DEVICE_ID), racedEnv, NOW),
      handleFetch(putRequest([instant(KEY, NOW + HOUR)], SECRET, OTHER_ID), racedEnv, NOW),
    ]);
    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    // Both records exist; only the last writer's id survives in idx. That device is orphaned:
    // never ticked, never counted against the cap, never deleted.
    expect(raced.data.has(`dev:${DEVICE_ID}`)).toBe(true);
    expect(raced.data.has(`dev:${OTHER_ID}`)).toBe(true);
    const afterRace = JSON.parse(raced.data.get("idx") ?? "[]") as string[];
    expect(afterRace).toHaveLength(1);
    const orphan = afterRace.includes(DEVICE_ID) ? OTHER_ID : DEVICE_ID;

    // The orphan's next PUT is an UPDATE, not a create, and it must still repair idx.
    const repair = await handleFetch(
      putRequest([instant("2026-10-27:day-of:0", NOW + HOUR)], SECRET, orphan),
      racedEnv,
      NOW,
    );
    expect(repair.status).toBe(204);
    expect((JSON.parse(raced.data.get("idx") ?? "[]") as string[]).sort()).toEqual(
      [DEVICE_ID, OTHER_ID].sort(),
    );
  });

  it("does not rewrite idx when the id is already indexed", async () => {
    await handleFetch(putRequest([instant(KEY, NOW + HOUR)]), env, NOW);
    kv.writes = 0;
    await handleFetch(putRequest([instant("2026-10-27:day-of:0", NOW + HOUR)]), env, NOW);
    // The device record, and nothing else.
    expect(kv.writes).toBe(1);
    expect(kv.data.get("idx")).toBe(JSON.stringify([DEVICE_ID]));
  });
});

describe("hourly idx reconcile", () => {
  const ORPHAN_ID = "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9";

  function seedOrphan(): void {
    kv.data.set(`dev:${DEVICE_ID}`, JSON.stringify(seededRecord([instant(KEY, NOW + 6 * HOUR)])));
    kv.data.set(`dev:${ORPHAN_ID}`, JSON.stringify(seededRecord([instant(KEY, NOW + 6 * HOUR)])));
    kv.data.set("idx", JSON.stringify([DEVICE_ID]));
  }

  it("picks the orphan up on a tick at minute 0", async () => {
    seedOrphan();
    // NOW is 2026-10-26T23:00:00Z — minute 0.
    const summary = await runTick(env, NOW);
    expect(kv.lists).toBe(1);
    expect(summary.devices).toBe(2);
    expect((JSON.parse(kv.data.get("idx") ?? "[]") as string[]).sort()).toEqual(
      [DEVICE_ID, ORPHAN_ID].sort(),
    );
  });

  it("does not list, and does not pick the orphan up, on a tick at any other minute", async () => {
    seedOrphan();
    for (const minute of [1, 17, 59]) {
      kv.lists = 0;
      const summary = await runTick(env, NOW + minute * MINUTE);
      expect(kv.lists, `minute ${minute}`).toBe(0);
      expect(summary.devices, `minute ${minute}`).toBe(1);
      expect(kv.data.get("idx")).toBe(JSON.stringify([DEVICE_ID]));
    }
  });

  it("costs 24 lists a day, not 1440", async () => {
    seed(kv, seededRecord([instant(KEY, NOW + 6 * HOUR)]));
    kv.lists = 0;
    // One simulated day of one-minute cron ticks.
    for (let minute = 0; minute < 24 * 60; minute += 1) await runTick(env, NOW + minute * MINUTE);
    expect(kv.lists).toBe(24);
  });

  it("writes nothing on an idle reconcile tick", async () => {
    seed(kv, seededRecord([instant(KEY, NOW + 6 * HOUR)]));
    kv.writes = 0;
    kv.lists = 0;
    const summary = await runTick(env, NOW);
    expect(kv.lists).toBe(1);
    expect(summary).toEqual({ devices: 1, sent: 0, failed: 0, removed: 0, writes: 0 });
    expect(kv.writes).toBe(0);
  });

  it("pages through a listing that does not complete in one call", async () => {
    kv.data.set(`dev:${DEVICE_ID}`, JSON.stringify(seededRecord([])));
    kv.data.set(`dev:${ORPHAN_ID}`, JSON.stringify(seededRecord([])));
    kv.data.set("idx", "[]");
    kv.pageSize = 1;
    const summary = await runTick(env, NOW);
    expect(kv.lists).toBe(2);
    expect(summary.devices).toBe(2);
  });
});

/*
 * The inert-device reaper. A record whose reminders have all fired is otherwise immortal: it
 * is never pushed to, so it never earns a 410, so it is never deleted, and it costs one KV
 * read on every one of the 1,440 daily ticks and holds one of the 100 MAX_DEVICES slots for
 * as long as the namespace exists.
 *
 * Units: every instant is epoch milliseconds, UTC. TTL_MS mirrors INERT_DEVICE_TTL_MS in
 * worker/src/schedule.ts; the assertion below pins the two together.
 */
describe("inert device reaper", () => {
  const TTL_MS = 14 * DAY;

  it("mirrors the Worker's own TTL constant", () => {
    expect(INERT_DEVICE_TTL_MS).toBe(TTL_MS);
  });

  /** A record with nothing left to send, last synced `age` milliseconds before NOW. */
  function drained(age: number): DeviceRecord {
    return seededRecord([], {}, NOW - age);
  }

  it("keeps a drained record through 13 days of ticks", async () => {
    seed(kv, drained(0));
    for (let day = 1; day <= 13; day += 1) {
      // Minute 0 of the hour, so every one of these is a reconcile tick: the reaper's own
      // tick class, which is what makes the survival meaningful.
      await runTick(env, NOW + day * DAY);
      await runTick(env, NOW + day * DAY + 30 * MINUTE);
    }
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(true);
    expect(kv.deletes).toBe(0);
  });

  it("keeps a drained record at exactly the TTL and reaps it on the next reconcile tick", async () => {
    seed(kv, drained(0));
    await runTick(env, NOW + TTL_MS);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(true);

    const summary = await runTick(env, NOW + TTL_MS + HOUR);
    expect(summary.removed).toBe(1);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(false);
    expect(JSON.parse(kv.data.get("idx") ?? "null")).toEqual([]);
    expect(kv.deletes).toBe(1);
  });

  it("never reaps a record that still holds a future reminder", async () => {
    seed(kv, seededRecord([instant("later", NOW + 20 * DAY)], {}, NOW - 30 * DAY));
    await runTick(env, NOW);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(true);
    expect(kv.deletes).toBe(0);
  });

  it("never reaps a record whose reminder is still inside the 15 minute due window", async () => {
    // Uploaded 30 days ago, so the sync is stale, but this instant has not left selectDue's
    // window yet. Reaping on a bare `at >= now` test would drop it unsent.
    seed(kv, seededRecord([instant(KEY, NOW - 5 * MINUTE)], {}, NOW - 30 * DAY));
    const summary = await runTick(env, NOW);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(summary.removed).toBe(0);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(true);
  });

  it("reaps nothing outside a reconcile tick, and writes nothing", async () => {
    seed(kv, drained(30 * DAY));
    kv.writes = 0;
    const summary = await runTick(env, NOW + 30 * MINUTE);
    expect(summary).toEqual({ devices: 1, sent: 0, failed: 0, removed: 0, writes: 0 });
    expect(kv.writes).toBe(0);
    expect(kv.deletes).toBe(0);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(true);
  });

  it("reaps every inert record in one reconcile tick and leaves the live ones indexed", async () => {
    const live = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    kv.data.set(`dev:${DEVICE_ID}`, JSON.stringify(drained(30 * DAY)));
    kv.data.set(`dev:${live}`, JSON.stringify(seededRecord([instant("later", NOW + DAY)])));
    kv.data.set("idx", JSON.stringify([DEVICE_ID, live]));

    const summary = await runTick(env, NOW);
    expect(summary.removed).toBe(1);
    expect(JSON.parse(kv.data.get("idx") ?? "null")).toEqual([live]);
    expect(kv.deletes).toBe(1);
  });

  it("stamps lastSyncedAt on every PUT, which resets the reaper clock", async () => {
    seed(kv, drained(30 * DAY));
    await handleFetch(putRequest([]), env, NOW);
    const stored: unknown = JSON.parse(kv.data.get(`dev:${DEVICE_ID}`) ?? "null");
    expect(stored).toMatchObject({ lastSyncedAt: NOW });
    await runTick(env, NOW);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(true);
  });

  it("does not bump lastSyncedAt when the tick writes the record back", async () => {
    const synced = NOW - 2 * DAY;
    seed(kv, seededRecord([instant(KEY, NOW)], {}, synced));
    await runTick(env, NOW);
    const stored: unknown = JSON.parse(kv.data.get(`dev:${DEVICE_ID}`) ?? "null");
    expect(stored).toMatchObject({ lastSyncedAt: synced });
  });

  it("treats a record stored before this release, with no lastSyncedAt, as never synced", async () => {
    // Records written by the previous Worker carry no stamp. parseDeviceRecord reads the
    // missing field as 0, so a drained legacy record is reaped on the first reconcile tick
    // and a legacy record with live reminders is not. The client re-creates either one on
    // its next sync, at most SYNC_MAX_AGE_MS (6 h) later.
    const legacy = { ...seededRecord([]) } as Partial<DeviceRecord>;
    delete legacy.lastSyncedAt;
    kv.data.set(`dev:${DEVICE_ID}`, JSON.stringify(legacy));
    kv.data.set("idx", JSON.stringify([DEVICE_ID]));
    await runTick(env, NOW);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(false);
  });
});

describe("corrupt device values", () => {
  it("deletes the value as well as the index entry", async () => {
    kv.data.set(`dev:${DEVICE_ID}`, JSON.stringify({ secret: SECRET, subscription: "not an object" }));
    kv.data.set("idx", JSON.stringify([DEVICE_ID]));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    kv.deletes = 0;
    const summary = await runTick(env, NOW);
    warn.mockRestore();
    expect(summary.removed).toBe(1);
    expect(kv.deletes).toBe(1);
    expect(kv.data.get("idx")).toBe("[]");
    expect(await kv.get(`dev:${DEVICE_ID}`)).toBeNull();
  });

  it("deletes a value that is not JSON at all", async () => {
    kv.data.set(`dev:${DEVICE_ID}`, "{not json");
    kv.data.set("idx", JSON.stringify([DEVICE_ID]));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await runTick(env, NOW);
    warn.mockRestore();
    expect(await kv.get(`dev:${DEVICE_ID}`)).toBeNull();
    expect(kv.data.get("idx")).toBe("[]");
  });

  it("spends no delete on an index entry whose value was already gone", async () => {
    kv.data.set("idx", JSON.stringify([DEVICE_ID]));
    kv.deletes = 0;
    const summary = await runTick(env, NOW);
    expect(summary.removed).toBe(1);
    expect(kv.deletes).toBe(0);
  });
});

describe("request body size", () => {
  /** A body whose UTF-16 length passes the old check but whose UTF-8 size does not. */
  function wideBody(): string {
    // 59 296 x U+4E00. One UTF-16 code unit each, THREE UTF-8 octets each.
    return JSON.stringify({ secret: SECRET, filler: "一".repeat(59_296) });
  }

  it("counts UTF-8 octets, not UTF-16 code units", async () => {
    const text = wideBody();
    expect(text.length).toBeLessThan(65_536);
    expect(new TextEncoder().encode(text).byteLength).toBeGreaterThan(177_000);
    const response = await handleFetch(
      new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: text,
      }),
      env,
      NOW,
    );
    expect(response.status).toBe(413);
    expect(kv.writes).toBe(0);
  });

  it("admits a body of exactly 65 536 ASCII octets to the validator", async () => {
    // 65 536 octets: at the ceiling, not over it. It fails validation, not the size check.
    const filler = "x".repeat(65_536 - JSON.stringify({ secret: SECRET, filler: "" }).length);
    const text = JSON.stringify({ secret: SECRET, filler });
    expect(new TextEncoder().encode(text).byteLength).toBe(65_536);
    const response = await handleFetch(
      new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: text,
      }),
      env,
      NOW,
    );
    expect(response.status).toBe(400);
  });

  it("refuses on a Content-Length over the ceiling before reading the body", async () => {
    // The body itself is valid and would answer 204; only the declared length refuses it.
    const request = new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        "Content-Length": "70000",
      },
      body: putBody([instant(KEY, NOW + HOUR)]),
    });
    expect(request.headers.get("Content-Length")).toBe("70000");
    const response = await handleFetch(request, env, NOW);
    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
    expect(kv.writes).toBe(0);
  });

  it("ignores a Content-Length that is not a number", async () => {
    const request = new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, "Content-Length": "many" },
      body: putBody([instant(KEY, NOW + HOUR)]),
    });
    expect((await handleFetch(request, env, NOW)).status).toBe(204);
  });
});

describe("method and route refusals", () => {
  it("answers PUT /v1/health with 405 and an Allow header, not 404", async () => {
    const response = await handleFetch(
      new Request("https://worker.example/v1/health", { method: "PUT", headers: { Origin: ORIGIN } }),
      env,
      NOW,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, OPTIONS");
    expect(await response.json()).toEqual({ error: "method not allowed" });
  });

  it("still answers a health preflight with 204", async () => {
    const response = await handleFetch(
      new Request("https://worker.example/v1/health", {
        method: "OPTIONS",
        headers: { Origin: ORIGIN },
      }),
      env,
      NOW,
    );
    expect(response.status).toBe(204);
  });

  it("answers OPTIONS on an unknown path with 404, not 204", async () => {
    const response = await handleFetch(
      new Request("https://worker.example/v1/nothing", {
        method: "OPTIONS",
        headers: { Origin: ORIGIN, "Access-Control-Request-Method": "PUT" },
      }),
      env,
      NOW,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
  });

  it("names the device route's methods in Allow", async () => {
    const response = await handleFetch(
      new Request(`https://worker.example/v1/devices/${DEVICE_ID}`, {
        method: "GET",
        headers: { Origin: ORIGIN },
      }),
      env,
      NOW,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("PUT, DELETE, OPTIONS");
  });

  it("varies the forbidden response on Origin so a shared cache cannot serve it to the allowed origin", async () => {
    const response = await handleFetch(
      new Request("https://worker.example/v1/health", {
        headers: { Origin: "https://attacker.example" },
      }),
      env,
      NOW,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("Vary")).toBe("Origin");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
