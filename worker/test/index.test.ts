import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { handleFetch, runTick, type Env, type KvStore } from "../src/index";
import { sendPush } from "../src/push";
import type { DeviceRecord, ReminderInstant } from "../src/schedule";

vi.mock("../src/push", () => ({
  sendPush: vi.fn(async () => "sent"),
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
const P256DH = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA";
const AUTH = "tBHItJI5svbpez7KI4CCXg";

class MemoryKv implements KvStore {
  readonly data = new Map<string, string>();
  reads = 0;
  writes = 0;
  deletes = 0;

  async get(key: string, _type: "text"): Promise<string | null> {
    this.reads += 1;
    return this.data.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.writes += 1;
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.deletes += 1;
    this.data.delete(key);
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

function seededRecord(reminders: ReminderInstant[], sent: Record<string, number> = {}): DeviceRecord {
  return {
    secret: SECRET,
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: P256DH, auth: AUTH },
    },
    reminders,
    sent,
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
      body: putBody([instant("k", NOW + HOUR)]),
    });
    expect((await handleFetch(request, env, NOW)).status).toBe(403);
  });
});

describe("PUT /v1/devices/:id", () => {
  it("creates the record and indexes the device", async () => {
    const response = await handleFetch(putRequest([instant("k", NOW + HOUR)]), env, NOW);
    expect(response.status).toBe(204);
    expect(kv.data.get("idx")).toBe(JSON.stringify([DEVICE_ID]));
    const stored: unknown = JSON.parse(kv.data.get(`dev:${DEVICE_ID}`) ?? "null");
    expect(stored).toMatchObject({ secret: SECRET, sent: {} });
  });

  it("does not duplicate the id in idx on a second PUT", async () => {
    await handleFetch(putRequest([instant("k", NOW + HOUR)]), env, NOW);
    await handleFetch(putRequest([instant("k2", NOW + 2 * HOUR)]), env, NOW);
    expect(kv.data.get("idx")).toBe(JSON.stringify([DEVICE_ID]));
  });

  it("updates the reminders in place when the secret matches", async () => {
    await handleFetch(putRequest([instant("k", NOW + HOUR)]), env, NOW);
    const response = await handleFetch(putRequest([instant("k2", NOW + 2 * HOUR)]), env, NOW);
    expect(response.status).toBe(204);
    const stored: unknown = JSON.parse(kv.data.get(`dev:${DEVICE_ID}`) ?? "null");
    expect(stored).toMatchObject({ reminders: [instant("k2", NOW + 2 * HOUR)] });
  });

  it("carries the sent map across a re-sync so a re-upload cannot cause a second send", async () => {
    seed(kv, seededRecord([instant("k", NOW)], { k: NOW }));
    await handleFetch(putRequest([instant("k", NOW)]), env, NOW);
    const stored: unknown = JSON.parse(kv.data.get(`dev:${DEVICE_ID}`) ?? "null");
    expect(stored).toMatchObject({ sent: { k: NOW } });
    expect(await runTick(env, NOW)).toMatchObject({ sent: 0 });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret with 403", async () => {
    await handleFetch(putRequest([instant("k", NOW + HOUR)]), env, NOW);
    const response = await handleFetch(
      putRequest([instant("k", NOW + HOUR)], "w".repeat(43)),
      env,
      NOW,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "secret mismatch" });
  });

  it("rejects an instant more than 21 days ahead with 400", async () => {
    const response = await handleFetch(
      putRequest([instant("far", NOW + 21 * DAY + MINUTE)]),
      env,
      NOW,
    );
    expect(response.status).toBe(400);
  });

  it("rejects an instant more than an hour in the past with 400", async () => {
    const response = await handleFetch(putRequest([instant("stale", NOW - HOUR - MINUTE)]), env, NOW);
    expect(response.status).toBe(400);
  });

  it("rejects a malformed device id with 404", async () => {
    const response = await handleFetch(
      putRequest([instant("k", NOW + HOUR)], SECRET, "not-a-uuid"),
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
    const response = await handleFetch(putRequest([instant("k", NOW + HOUR)]), env, NOW);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "device capacity reached" });
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(false);
  });

  it("still admits the 100th device, pinning the cap at 100 and not 99", async () => {
    const nearlyFull = Array.from({ length: 99 }, (_, i) => filledId(i));
    kv.data.set("idx", JSON.stringify(nearlyFull));
    const response = await handleFetch(putRequest([instant("k", NOW + HOUR)]), env, NOW);
    expect(response.status).toBe(204);
    expect(JSON.parse(kv.data.get("idx") ?? "[]")).toHaveLength(100);
  });

  it("lets an existing device update even when the index is at the cap", async () => {
    const full = Array.from({ length: 99 }, (_, i) => filledId(i));
    kv.data.set("idx", JSON.stringify([...full, DEVICE_ID]));
    kv.data.set(`dev:${DEVICE_ID}`, JSON.stringify(seededRecord([])));
    const response = await handleFetch(putRequest([instant("k", NOW + HOUR)]), env, NOW);
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
    seed(kv, seededRecord([instant("k", NOW + HOUR)]));
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
    seed(kv, seededRecord([instant("k", NOW + HOUR)]));
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
    seed(kv, seededRecord([instant("2026-10-26:lead:120", NOW + 5 * MINUTE)]));
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
    seed(kv, seededRecord([instant("k", NOW)]));
    sendMock.mockResolvedValueOnce("failed");
    await runTick(env, NOW);
    expect(sendMock).toHaveBeenCalledTimes(1);
    await runTick(env, NOW + MINUTE);
    expect(sendMock).toHaveBeenCalledTimes(2);
    await runTick(env, NOW + 2 * MINUTE);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the record and counts a failure when the push fails", async () => {
    seed(kv, seededRecord([instant("k", NOW)]));
    sendMock.mockResolvedValue("failed");
    const summary = await runTick(env, NOW);
    expect(summary.failed).toBe(1);
    expect(summary.sent).toBe(0);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(true);
  });

  it("deletes the device and its index entry when the push service reports gone", async () => {
    seed(kv, seededRecord([instant("k", NOW)]));
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
    seed(kv, seededRecord([instant("k", NOW)]));
    const controller: ScheduledController = {
      // scheduledTime is an instant in epoch milliseconds, UTC.
      scheduledTime: NOW,
      cron: "* * * * *",
      noRetry: () => {},
    };
    await worker.scheduled(controller, env);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[2]?.key).toBe("k");
  });

  it("does not send a reminder that is not yet due at the controller's time", async () => {
    seed(kv, seededRecord([instant("k", NOW + HOUR)]));
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
    await handleFetch(putRequest([instant("k", NOW + HOUR)]), env, NOW);
    await handleFetch(putRequest([instant("k", NOW + HOUR)], "w".repeat(43)), env, NOW);
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

    seed(kv, seededRecord([instant("k", NOW)]));
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
      sendPush: vi.fn(async () => "sent"),
      APP_URL_PATH: "/FixThisInjustice/",
    }));
    vi.resetModules();
  });

  it("deletes the device and its idx entry when the push service answers 410", async () => {
    const real = await loadReal();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 410 })));
    seed(kv, seededRecord([instant("k", NOW)]));
    const summary = await real.runTick(env, NOW);
    expect(summary.removed).toBe(1);
    expect(kv.data.has(`dev:${DEVICE_ID}`)).toBe(false);
    expect(kv.data.get("idx")).toBe("[]");
  });

  it("marks a thrown fetch as failed and keeps the device record", async () => {
    const real = await loadReal();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection reset");
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    seed(kv, seededRecord([instant("k", NOW)]));
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
