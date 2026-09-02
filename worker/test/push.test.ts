import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPushHTTPRequest } from "@pushforge/builder";
import { sendPush, type PushEnv } from "../src/push";
import type { PushSubscriptionRecord, ReminderInstant } from "../src/schedule";

vi.mock("@pushforge/builder", () => ({
  buildPushHTTPRequest: vi.fn(),
}));

const buildMock = vi.mocked(buildPushHTTPRequest);

const ENV: PushEnv = {
  VAPID_PRIVATE_JWK: '{"kty":"EC","crv":"P-256","x":"X","y":"Y","d":"D"}',
  ADMIN_CONTACT: "mailto:owner@example.com",
};

const SUBSCRIPTION: PushSubscriptionRecord = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA", auth: "tBHItJI5svbpez7KI4CCXg" },
};

const INSTANT: ReminderInstant = {
  key: "2026-10-26:lead:120",
  // Instant the reminder falls due. Epoch milliseconds, UTC (2026-10-26T21:00:00Z).
  at: 1_793_048_400_000,
  title: "Upper today",
  body: "Upper A at 18:00, session 3 of 24",
};

function respondWith(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(null, { status }))),
  );
}

beforeEach(() => {
  buildMock.mockResolvedValue({
    endpoint: SUBSCRIPTION.endpoint,
    headers: new Headers({ "content-encoding": "aes128gcm" }),
    body: new ArrayBuffer(8),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("sendPush", () => {
  it("maps 201 to sent", async () => {
    respondWith(201);
    await expect(sendPush(ENV, SUBSCRIPTION, INSTANT)).resolves.toBe("sent");
  });

  it("maps any other 2xx to sent so a reminder is never re-sent", async () => {
    respondWith(200);
    await expect(sendPush(ENV, SUBSCRIPTION, INSTANT)).resolves.toBe("sent");
  });

  it("maps 404 to gone", async () => {
    respondWith(404);
    await expect(sendPush(ENV, SUBSCRIPTION, INSTANT)).resolves.toBe("gone");
  });

  it("maps 410 to gone", async () => {
    respondWith(410);
    await expect(sendPush(ENV, SUBSCRIPTION, INSTANT)).resolves.toBe("gone");
  });

  it("maps 429 and 500 to failed", async () => {
    respondWith(429);
    await expect(sendPush(ENV, SUBSCRIPTION, INSTANT)).resolves.toBe("failed");
    respondWith(500);
    await expect(sendPush(ENV, SUBSCRIPTION, INSTANT)).resolves.toBe("failed");
  });

  it("returns failed instead of throwing when the network rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("connection reset"))));
    await expect(sendPush(ENV, SUBSCRIPTION, INSTANT)).resolves.toBe("failed");
  });

  it("returns failed instead of throwing when the request cannot be built", async () => {
    respondWith(201);
    buildMock.mockRejectedValueOnce(new Error("bad JWK"));
    await expect(sendPush(ENV, SUBSCRIPTION, INSTANT)).resolves.toBe("failed");
  });

  it("builds the payload and options the master plan specifies", async () => {
    respondWith(201);
    await sendPush(ENV, SUBSCRIPTION, INSTANT);
    expect(buildMock).toHaveBeenCalledWith({
      privateJWK: ENV.VAPID_PRIVATE_JWK,
      subscription: SUBSCRIPTION,
      message: {
        payload: {
          title: "Upper today",
          body: "Upper A at 18:00, session 3 of 24",
          tag: "2026-10-26:lead:120",
          url: "/FixThisInjustice/",
        },
        adminContact: "mailto:owner@example.com",
        // ttl is a duration in SECONDS (Web Push TTL header, RFC 8030 §5.2).
        options: { ttl: 3600, urgency: "high" },
      },
    });
  });

  it("POSTs to the endpoint the builder returned", async () => {
    respondWith(201);
    await sendPush(ENV, SUBSCRIPTION, INSTANT);
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(SUBSCRIPTION.endpoint);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("never writes the VAPID private key or the subscription keys to the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    respondWith(500);
    await sendPush(ENV, SUBSCRIPTION, INSTANT);
    buildMock.mockRejectedValueOnce(new Error("bad JWK"));
    await sendPush(ENV, SUBSCRIPTION, INSTANT);
    const logged = warn.mock.calls.flat().map(String).join("\n");
    expect(logged).not.toContain(ENV.VAPID_PRIVATE_JWK);
    expect(logged).not.toContain(SUBSCRIPTION.keys.p256dh);
    expect(logged).not.toContain(SUBSCRIPTION.keys.auth);
    warn.mockRestore();
  });
});

describe("failure logging", () => {
  const ENDPOINT = "https://push.example/abc";
  const LEAKY = new Error(`POST ${ENDPOINT} failed: p256dh must be 65 bytes`);

  function spyConsole(): { text: () => string; restore: () => void } {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    return {
      text: () =>
        [...warn.mock.calls, ...error.mock.calls, ...log.mock.calls].flat().map(String).join("\n"),
      restore: () => {
        warn.mockRestore();
        error.mockRestore();
        log.mockRestore();
      },
    };
  }

  /** First 8 hex characters of SHA-256(endpoint) — the label sendPush is expected to log. */
  async function digest8(endpoint: string): Promise<string> {
    const bytes = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)),
    );
    return [...bytes.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  it("never logs an error message that embeds the endpoint", async () => {
    const spy = spyConsole();
    respondWith(201);
    buildMock.mockRejectedValueOnce(LEAKY);
    const outcome = await sendPush(ENV, { ...SUBSCRIPTION, endpoint: ENDPOINT }, INSTANT);
    const logged = spy.text();
    spy.restore();
    expect(outcome).toBe("failed");
    expect(logged).not.toContain(ENDPOINT);
    expect(logged).not.toContain("push.example");
    expect(logged).not.toContain(LEAKY.message);
  });

  it("never logs the endpoint when fetch itself throws", async () => {
    const spy = spyConsole();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new TypeError(`fetch to ${ENDPOINT} failed`);
      }),
    );
    const outcome = await sendPush(ENV, { ...SUBSCRIPTION, endpoint: ENDPOINT }, INSTANT);
    const logged = spy.text();
    spy.restore();
    expect(outcome).toBe("failed");
    expect(logged).not.toContain("push.example");
    // The error's constructor name is the whole diagnosis that survives.
    expect(logged).toContain("error=TypeError");
  });

  it("logs the reminder key, the error name and the endpoint digest, and nothing else", async () => {
    const spy = spyConsole();
    respondWith(201);
    buildMock.mockRejectedValueOnce(LEAKY);
    await sendPush(ENV, { ...SUBSCRIPTION, endpoint: ENDPOINT }, INSTANT);
    const logged = spy.text();
    spy.restore();
    expect(logged).toBe(
      `push threw: key=${INSTANT.key} error=Error endpoint=${await digest8(ENDPOINT)}`,
    );
  });

  it("gives two endpoints two different digests, so failures stay attributable", async () => {
    const a = await digest8(ENDPOINT);
    const b = await digest8("https://push.example/def");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it("labels a rejected status with the digest too, never the endpoint", async () => {
    const spy = spyConsole();
    respondWith(500);
    await sendPush(ENV, { ...SUBSCRIPTION, endpoint: ENDPOINT }, INSTANT);
    const logged = spy.text();
    spy.restore();
    expect(logged).toBe(
      `push rejected: status=500 key=${INSTANT.key} endpoint=${await digest8(ENDPOINT)}`,
    );
  });

  it("returns failed rather than throwing when a non-Error value is thrown", async () => {
    const spy = spyConsole();
    respondWith(201);
    buildMock.mockRejectedValueOnce("a bare string mentioning https://push.example/abc");
    const outcome = await sendPush(ENV, { ...SUBSCRIPTION, endpoint: ENDPOINT }, INSTANT);
    const logged = spy.text();
    spy.restore();
    expect(outcome).toBe("failed");
    expect(logged).not.toContain("push.example");
  });
});
