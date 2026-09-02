import { describe, expect, it } from "vitest";
import {
  DUE_WINDOW_MS,
  MAX_REMINDERS,
  markSent,
  parseDeviceRecord,
  pruneDelta,
  removeExpired,
  secretsMatch,
  selectDue,
  validatePut,
  type DeviceRecord,
  type ReminderInstant,
} from "../src/schedule";

const NOW = 1_793_055_600_000; // 2026-10-26T23:00:00Z — the fixture instant used throughout
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
      keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA", auth: "tBHItJI5svbpez7KI4CCXg" },
    },
    reminders: [instant("2026-10-26:lead:120", NOW + HOUR)],
    ...overrides,
  };
}

function record(overrides: Partial<DeviceRecord> = {}): DeviceRecord {
  return {
    secret: "s".repeat(43),
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA", auth: "tBHItJI5svbpez7KI4CCXg" },
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
      body({ reminders: [instant("stale", NOW - HOUR - MINUTE)] }),
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
    expect(validatePut(body({ reminders: [instant("edge", NOW - HOUR)] }), NOW, null).ok).toBe(true);
  });

  it("rejects an instant more than 21 days ahead with 400", () => {
    const result = validatePut(
      body({ reminders: [instant("far", NOW + 21 * DAY + MINUTE)] }),
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
    const many = Array.from({ length: MAX_REMINDERS }, (_, i) => instant(`k${i}`, NOW + HOUR + i));
    expect(validatePut(body({ reminders: many }), NOW, null).ok).toBe(true);
    const tooMany = [...many, instant("overflow", NOW + HOUR)];
    expect(validatePut(body({ reminders: tooMany }), NOW, null)).toEqual({
      ok: false,
      status: 400,
      error: "reminders: at most 200 entries",
    });
  });

  it("rejects duplicate reminder keys with 400", () => {
    const dup = [instant("same", NOW + HOUR), instant("same", NOW + 2 * HOUR)];
    expect(validatePut(body({ reminders: dup }), NOW, null)).toEqual({
      ok: false,
      status: 400,
      error: "reminders: duplicate key \"same\"",
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
      body({ reminders: [{ key: "k", at: Number.POSITIVE_INFINITY, title: "t", body: "b" }] }),
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
    let state = record({ reminders: [instant("2026-10-26:lead:120", NOW + 5 * MINUTE)] });
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
    let state = record({ reminders: [instant("2026-10-26:lead:120", NOW + 5 * MINUTE)] });
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
          body({ reminders: [instant("2026-10-26:lead:120", NOW + 5 * MINUTE)] }),
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
