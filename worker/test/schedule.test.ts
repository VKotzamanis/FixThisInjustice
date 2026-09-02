import { describe, expect, it } from "vitest";
import {
  DUE_WINDOW_MS,
  MAX_REMINDERS,
  MAX_SENT_ENTRIES,
  markSent,
  parseDeviceRecord,
  pruneDelta,
  removeExpired,
  secretsMatch,
  selectDue,
  validatePut,
  type DeviceRecord,
  type ReminderInstant,
  type ValidateResult,
} from "../src/schedule";

const NOW = 1_793_055_600_000; // 2026-10-26T23:00:00Z — the fixture instant used throughout
/** A real uncompressed P-256 point: 65 octets, leading 0x04, base64url (RFC 8291 §4). */
const P256DH = "BG9gwOFFUymmbn0PojtRGJa4cA_NWQJFC6EE7paZ9HSFqE355S0qgFrO7Fe3gjrBNglZH7IIU2zksWJKVX7ZR1I";
/** A 16-octet authentication secret, base64url (RFC 8291 §3.2). */
const AUTH = "tBHItJI5svbpez7KI4CCXg";
/** A key in the shape src/domain/reminders/instants.ts emits. */
const KEY = "2026-10-26:lead:120";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function instant(key: string, at: number): ReminderInstant {
  return { key, at, title: "Upper today", body: "Upper A at 18:00, session 3 of 24" };
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    secret: "s".repeat(43),
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: P256DH, auth: AUTH },
    },
    reminders: [instant(KEY, NOW + HOUR)],
    ...overrides,
  };
}

function record(overrides: Partial<DeviceRecord> = {}): DeviceRecord {
  return {
    secret: "s".repeat(43),
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: P256DH, auth: AUTH },
    },
    reminders: [],
    sent: {},
    ...overrides,
  };
}

describe("validatePut", () => {
  it("accepts a well-formed create and starts with an empty sent map", () => {
    const result = validatePut(body(), NOW, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.secret).toBe("s".repeat(43));
    expect(result.record.reminders).toHaveLength(1);
    expect(result.record.sent).toEqual({});
  });

  it("rejects a non-object body with 400", () => {
    expect(validatePut("nope", NOW, null)).toEqual({
      ok: false,
      status: 400,
      error: "body must be a JSON object",
    });
  });

  it("rejects an update whose secret does not match with 403", () => {
    const existing = record({ secret: "correct-secret-value-0123456789" });
    const result = validatePut(body({ secret: "wrong-secret-value-01234567890" }), NOW, existing);
    expect(result).toEqual({ ok: false, status: 403, error: "secret mismatch" });
  });

  it("accepts an update whose secret matches and carries the sent map forward", () => {
    const existing = record({
      secret: "s".repeat(43),
      sent: { "2026-10-26:day-of:0": NOW - MINUTE, "2026-10-01:day-of:0": NOW - 2 * DAY },
    });
    const result = validatePut(body(), NOW, existing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The recent key survives so a re-sync cannot cause a duplicate send;
    // the entry older than 24 h is pruned.
    expect(Object.keys(result.record.sent)).toEqual(["2026-10-26:day-of:0"]);
  });

  it("rejects an instant more than one hour in the past with 400", () => {
    const result = validatePut(
      body({ reminders: [instant("2026-10-26:lead:30", NOW - HOUR - MINUTE)] }),
      NOW,
      null,
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "reminder 0: at is outside [now - 1 h, now + 21 d]",
    });
  });

  it("accepts an instant exactly one hour in the past", () => {
    expect(validatePut(body({ reminders: [instant("2026-10-26:lead:60", NOW - HOUR)] }), NOW, null).ok).toBe(true);
  });

  it("rejects an instant more than 21 days ahead with 400", () => {
    const result = validatePut(
      body({ reminders: [instant("2026-10-26:lead:90", NOW + 21 * DAY + MINUTE)] }),
      NOW,
      null,
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "reminder 0: at is outside [now - 1 h, now + 21 d]",
    });
  });

  it("accepts exactly MAX_REMINDERS and rejects one more", () => {
    const many = Array.from({ length: MAX_REMINDERS }, (_, i) => instant(`2026-10-26:lead:${i}`, NOW + HOUR + i));
    expect(validatePut(body({ reminders: many }), NOW, null).ok).toBe(true);
    const tooMany = [...many, instant("2026-10-27:day-of:0", NOW + HOUR)];
    expect(validatePut(body({ reminders: tooMany }), NOW, null)).toEqual({
      ok: false,
      status: 400,
      error: "reminders: at most 200 entries",
    });
  });

  it("rejects duplicate reminder keys with 400", () => {
    const dup = [instant("2026-10-26:day-of:0", NOW + HOUR), instant("2026-10-26:day-of:0", NOW + 2 * HOUR)];
    expect(validatePut(body({ reminders: dup }), NOW, null)).toEqual({
      ok: false,
      status: 400,
      error: 'reminders: duplicate key "2026-10-26:day-of:0"',
    });
  });

  it("rejects a non-https endpoint with 400", () => {
    const result = validatePut(
      body({
        subscription: {
          endpoint: "http://evil.example/push",
          keys: { p256dh: "BNcRd", auth: "tBHI" },
        },
      }),
      NOW,
      null,
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "subscription.endpoint must be an https URL",
    });
  });

  it("rejects a non-finite at with 400 rather than throwing", () => {
    const result = validatePut(
      body({ reminders: [{ key: KEY, at: Number.POSITIVE_INFINITY, title: "t", body: "b" }] }),
      NOW,
      null,
    );
    expect(result).toEqual({ ok: false, status: 400, error: "reminder 0: at must be an integer" });
  });

  it("ignores unknown top-level properties instead of storing them", () => {
    const result = validatePut(body({ __proto__: { polluted: true }, extra: "x" }), NOW, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.record).sort()).toEqual([
      "reminders",
      "secret",
      "sent",
      "subscription",
    ]);
  });
});

describe("selectDue", () => {
  it("selects a reminder whose at has just passed", () => {
    const due = selectDue(record({ reminders: [instant("a", NOW - MINUTE)] }), NOW);
    expect(due.map((r) => r.key)).toEqual(["a"]);
  });

  it("does not select a future reminder", () => {
    expect(selectDue(record({ reminders: [instant("a", NOW + MINUTE)] }), NOW)).toEqual([]);
  });

  it("does not select a reminder older than the 15-minute window", () => {
    expect(selectDue(record({ reminders: [instant("a", NOW - DUE_WINDOW_MS)] }), NOW)).toEqual([]);
    expect(
      selectDue(record({ reminders: [instant("a", NOW - DUE_WINDOW_MS + 1)] }), NOW).map((r) => r.key),
    ).toEqual(["a"]);
  });

  it("does not select a reminder already in sent", () => {
    const state = record({ reminders: [instant("a", NOW - MINUTE)], sent: { a: NOW - MINUTE } });
    expect(selectDue(state, NOW)).toEqual([]);
  });

  it("returns due reminders in ascending at order", () => {
    const state = record({
      reminders: [instant("late", NOW - MINUTE), instant("early", NOW - 5 * MINUTE)],
    });
    expect(selectDue(state, NOW).map((r) => r.key)).toEqual(["early", "late"]);
  });
});

describe("markSent", () => {
  it("adds the keys with the current instant", () => {
    const next = markSent(record(), ["a", "b"], NOW);
    expect(next.sent).toEqual({ a: NOW, b: NOW });
  });

  it("prunes sent entries older than 24 h and keeps newer ones", () => {
    const state = record({ sent: { old: NOW - DAY - 1, fresh: NOW - DAY + 1 } });
    const next = markSent(state, ["new"], NOW);
    expect(Object.keys(next.sent).sort()).toEqual(["fresh", "new"]);
  });

  it("does not mutate the input record", () => {
    const state = record({ sent: {} });
    markSent(state, ["a"], NOW);
    expect(state.sent).toEqual({});
  });
});

describe("removeExpired", () => {
  it("drops reminders that can no longer be selected and prunes sent", () => {
    const state = record({
      reminders: [instant("gone", NOW - DUE_WINDOW_MS), instant("live", NOW - MINUTE)],
      sent: { old: NOW - DAY - 1, fresh: NOW },
    });
    const next = removeExpired(state, NOW);
    expect(next.reminders.map((r) => r.key)).toEqual(["live"]);
    expect(Object.keys(next.sent)).toEqual(["fresh"]);
  });

  it("is a no-op for a fresh record", () => {
    const state = record({ reminders: [instant("live", NOW + HOUR)], sent: { fresh: NOW } });
    expect(pruneDelta(state, removeExpired(state, NOW))).toBe(0);
  });
});

describe("pruneDelta", () => {
  it("counts removed reminders and removed sent entries", () => {
    const before = record({
      reminders: [instant("a", NOW), instant("b", NOW)],
      sent: { x: NOW, y: NOW },
    });
    const after = record({ reminders: [instant("a", NOW)], sent: { x: NOW } });
    expect(pruneDelta(before, after)).toBe(2);
  });
});

describe("secretsMatch", () => {
  it("accepts an identical secret and rejects any difference", () => {
    expect(secretsMatch("a".repeat(43), "a".repeat(43))).toBe(true);
    expect(secretsMatch("a".repeat(43), "a".repeat(42) + "b")).toBe(false);
    expect(secretsMatch("a".repeat(43), "a".repeat(42))).toBe(false);
    expect(secretsMatch("", "")).toBe(true);
  });
});

describe("parseDeviceRecord", () => {
  it("round-trips a stored record", () => {
    const stored = record({ reminders: [instant("a", NOW)], sent: { a: NOW } });
    const parsed: unknown = JSON.parse(JSON.stringify(stored));
    expect(parseDeviceRecord(parsed)).toEqual(stored);
  });

  it("returns null for corrupt data instead of throwing", () => {
    expect(parseDeviceRecord(null)).toBeNull();
    expect(parseDeviceRecord({ secret: 1 })).toBeNull();
    expect(parseDeviceRecord({ ...record(), reminders: "no" })).toBeNull();
  });
});

describe("single-send invariant", () => {
  it("sends a reminder exactly once across 30 one-minute cron ticks", () => {
    // The reminder falls due 5 ticks in. Every tick applies the production sequence:
    // selectDue -> (send) -> removeExpired -> markSent.
    let state = record({ reminders: [instant(KEY, NOW + 5 * MINUTE)] });
    let sends = 0;
    for (let tick = 0; tick < 30; tick += 1) {
      const now = NOW + tick * MINUTE;
      const due = selectDue(state, now);
      sends += due.length;
      const trimmed = removeExpired(state, now);
      state = due.length > 0 ? markSent(trimmed, due.map((r) => r.key), now) : trimmed;
    }
    expect(sends).toBe(1);
  });

  it("still sends exactly once when the client re-uploads the schedule after the send", () => {
    let state = record({ reminders: [instant(KEY, NOW + 5 * MINUTE)] });
    let sends = 0;
    for (let tick = 0; tick < 30; tick += 1) {
      const now = NOW + tick * MINUTE;
      const due = selectDue(state, now);
      sends += due.length;
      const trimmed = removeExpired(state, now);
      state = due.length > 0 ? markSent(trimmed, due.map((r) => r.key), now) : trimmed;
      if (tick === 7) {
        // The client re-syncs an unchanged schedule two ticks after the send.
        const result = validatePut(
          body({ reminders: [instant(KEY, NOW + 5 * MINUTE)] }),
          now,
          state,
        );
        expect(result.ok).toBe(true);
        if (result.ok) state = result.record;
      }
    }
    expect(sends).toBe(1);
  });
});

describe("reminder keys that collide with Object.prototype", () => {
  it("selects a reminder keyed toString, which `key in sent` would swallow", () => {
    // `"toString" in {}` is true through the prototype chain, so the reminder looks
    // already-sent and is silently never delivered.
    const state = record({ reminders: [instant("toString", NOW - MINUTE)] });
    expect(selectDue(state, NOW).map((r) => r.key)).toEqual(["toString"]);
  });

  it("selects a reminder keyed constructor", () => {
    const state = record({ reminders: [instant("constructor", NOW - MINUTE)] });
    expect(selectDue(state, NOW).map((r) => r.key)).toEqual(["constructor"]);
  });

  it("still refuses a reminder that really is in sent", () => {
    const sent: Record<string, number> = Object.create(null) as Record<string, number>;
    sent["toString"] = NOW - MINUTE;
    expect(selectDue(record({ reminders: [instant("toString", NOW - MINUTE)], sent }), NOW)).toEqual(
      [],
    );
  });

  it("records __proto__ in the sent map instead of dropping it on the floor", () => {
    // On a plain object `sent["__proto__"] = number` hits the accessor, which ignores a
    // non-object value: the entry vanishes and the reminder is re-sent every tick.
    const next = markSent(record({ sent: {} }), ["__proto__", "toString"], NOW);
    expect(Object.hasOwn(next.sent, "__proto__")).toBe(true);
    expect(next.sent["__proto__"]).toBe(NOW);
    // Read through the descriptor: `next.sent["toString"]` reads as an unbound method
    // reference to the linter, and the descriptor also proves it is a DATA property.
    expect(Object.getOwnPropertyDescriptor(next.sent, "toString")?.value).toBe(NOW);
    expect(Object.getPrototypeOf(next.sent)).toBeNull();
  });

  it("round-trips a sent map through JSON without poisoning any prototype", () => {
    const stored = {
      secret: "s".repeat(43),
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
        keys: { p256dh: P256DH, auth: AUTH },
      },
      reminders: [],
      // JSON.parse creates an OWN "__proto__" data property, so a stored map can carry one.
      sent: { ["__proto__"]: NOW, "2026-10-26:lead:120": NOW },
    };
    const parsed = parseDeviceRecord(JSON.parse(JSON.stringify(stored)));
    expect(parsed).not.toBeNull();
    if (parsed === null) return;
    expect(Object.getPrototypeOf(parsed.sent)).toBeNull();
    expect(Object.hasOwn(parsed.sent, "__proto__")).toBe(true);
    expect(parsed.sent["__proto__"]).toBe(NOW);
    expect(parsed.sent["2026-10-26:lead:120"]).toBe(NOW);
    // Nothing global moved.
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["2026-10-26:lead:120"]).toBeUndefined();
    // And the map survives a second trip through KV.
    const again = parseDeviceRecord(JSON.parse(JSON.stringify(parsed)));
    expect(again?.sent["__proto__"]).toBe(NOW);
  });
});

describe("validatePut reminder-key charset", () => {
  it("refuses a reminder keyed __proto__ with 400 rather than storing it", () => {
    const result = validatePut(body({ reminders: [instant("__proto__", NOW + HOUR)] }), NOW, null);
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'reminder 0: key must be 1..120 characters of [A-Za-z0-9_-] segments joined by ":"',
    });
  });

  it("refuses constructor, toString and every other bare Object.prototype name", () => {
    for (const name of Object.getOwnPropertyNames(Object.prototype)) {
      const result = validatePut(body({ reminders: [instant(name, NOW + HOUR)] }), NOW, null);
      expect(result.ok, `${name} must be refused`).toBe(false);
    }
  });

  it("refuses a key carrying a character outside the charset", () => {
    const bad = ["2026-10-26:lead:120 ", "a:b/c", "a:b.c", "a:b一", ":lead:1", "a:", ""];
    for (const key of bad) {
      expect(validatePut(body({ reminders: [instant(key, NOW + HOUR)] }), NOW, null).ok, key).toBe(
        false,
      );
    }
  });

  it("accepts every key shape src/domain/reminders/instants.ts emits", () => {
    const good = ["2026-10-26:day-of:0", "2026-10-26:lead:120", "2027-01-01:lead:5", "2026-12-31:lead:1440"];
    for (const key of good) {
      expect(validatePut(body({ reminders: [instant(key, NOW + HOUR)] }), NOW, null).ok, key).toBe(
        true,
      );
    }
  });
});

describe("subscription validation", () => {
  const goodKeys = { p256dh: P256DH, auth: AUTH };

  function withSubscription(sub: unknown): ValidateResult {
    return validatePut(body({ subscription: sub }), NOW, null);
  }

  it("refuses an endpoint that is not a parsable URL with a host", () => {
    for (const endpoint of ["https://", "https://?a=b", "https://#frag", "https:// /x"]) {
      const result = withSubscription({ endpoint, keys: goodKeys });
      expect(result).toEqual({
        ok: false,
        status: 400,
        error: "subscription.endpoint must be an https URL",
      });
    }
  });

  it("refuses a non-https scheme even when it starts with the right letters", () => {
    for (const endpoint of ["http://fcm.googleapis.com/x", "javascript:alert(1)", "https:/fcm.example/x"]) {
      expect(withSubscription({ endpoint, keys: goodKeys }).ok, endpoint).toBe(false);
    }
  });

  it("accepts a real push endpoint", () => {
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc123", keys: goodKeys };
    expect(withSubscription(sub).ok).toBe(true);
  });

  it("refuses keys outside the base64url alphabet", () => {
    expect(
      withSubscription({
        endpoint: "https://fcm.example/x",
        keys: { p256dh: "not base64!", auth: AUTH },
      }),
    ).toEqual({
      ok: false,
      status: 400,
      error: "subscription.keys.p256dh must be 65 base64url octets",
    });
    expect(
      withSubscription({
        endpoint: "https://fcm.example/x",
        keys: { p256dh: P256DH, auth: "aa+bb/cc==" },
      }),
    ).toEqual({
      ok: false,
      status: 400,
      error: "subscription.keys.auth must be 16 base64url octets",
    });
  });

  it("refuses a p256dh that is the wrong number of octets", () => {
    // RFC 8291 section 4: the uncompressed point is a 65-octet sequence starting 0x04.
    const short = P256DH.slice(0, 43); // 32 octets
    const long = `${P256DH}AAAA`; // 68 octets
    for (const p256dh of [short, long]) {
      const sub = { endpoint: "https://fcm.example/x", keys: { p256dh, auth: AUTH } };
      expect(withSubscription(sub).ok, p256dh).toBe(false);
    }
  });

  it("refuses an auth secret that is not 16 octets", () => {
    // RFC 8291 section 3.2: "a hard-to-guess sequence of 16 octets".
    for (const auth of ["AAAA", `${AUTH}AAAA`]) {
      const sub = { endpoint: "https://fcm.example/x", keys: { p256dh: P256DH, auth } };
      expect(withSubscription(sub).ok, auth).toBe(false);
    }
  });

  it("rejects a stored record whose keys no longer satisfy the RFC lengths", () => {
    const stored = {
      ...record(),
      subscription: { endpoint: "https://fcm.example/x", keys: { p256dh: "BNcRd", auth: "tBHI" } },
    };
    expect(parseDeviceRecord(JSON.parse(JSON.stringify(stored)))).toBeNull();
  });
});

describe("sent-map size cap", () => {
  it("keeps only the newest MAX_SENT_ENTRIES after time pruning", () => {
    const sent: Record<string, number> = {};
    // 500 entries, all inside the 24 h retention window; larger i means older.
    for (let i = 0; i < 500; i += 1) sent[`2026-10-26:lead:${i}`] = NOW - i * 1000;
    const next = markSent(record({ sent }), ["2026-10-27:day-of:0"], NOW);
    expect(MAX_SENT_ENTRIES).toBe(400);
    expect(Object.keys(next.sent)).toHaveLength(MAX_SENT_ENTRIES);
    // The just-sent key shares the newest instant, so it always survives.
    expect(next.sent["2026-10-27:day-of:0"]).toBe(NOW);
    expect(next.sent["2026-10-26:lead:0"]).toBe(NOW);
    expect(next.sent["2026-10-26:lead:398"]).toBe(NOW - 398 * 1000);
    expect(next.sent["2026-10-26:lead:399"]).toBeUndefined();
    expect(next.sent["2026-10-26:lead:499"]).toBeUndefined();
  });

  it("time-prunes before capping, so a stale entry never displaces a fresh one", () => {
    const sent: Record<string, number> = {};
    for (let i = 0; i < 400; i += 1) sent[`old:${i}`] = NOW - DAY - 1; // all expired
    for (let i = 0; i < 10; i += 1) sent[`fresh:${i}`] = NOW - i;
    const next = removeExpired(record({ sent }), NOW);
    expect(Object.keys(next.sent).sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `fresh:${i}`).sort(),
    );
  });

  it("counts the capped entries in pruneDelta so the record is written back", () => {
    const sent: Record<string, number> = {};
    for (let i = 0; i < 500; i += 1) sent[`2026-10-26:lead:${i}`] = NOW - i * 1000;
    const before = record({ sent });
    expect(pruneDelta(before, removeExpired(before, NOW))).toBe(100);
  });
});
