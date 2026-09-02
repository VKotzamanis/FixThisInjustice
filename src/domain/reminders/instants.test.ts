// src/domain/reminders/instants.test.ts
//
// Every epoch value below was computed for America/Chicago and is exact (checked against the
// tz database with Intl.DateTimeFormat, not against this module). The fixture window
// 2026-10-26 -> 2026-11-08 spans the 2026-11-01 end of US daylight saving: CDT (UTC-5)
// becomes CST (UTC-6), so seven days of wall clock across it are 7 d + 1 h of elapsed time.
//
// Units: every constant here is epoch milliseconds, UTC, unless the name says otherwise.

import { describe, expect, it } from 'vitest';
import { computeReminderInstants, scheduleHash } from './instants';
import { FIXTURE_PROFILE_ID, makeAppState } from './state.fixture';
import { MAX_HORIZON_MS, MAX_INSTANTS } from '../../config/reminders';
import type { AppState, ReminderSettings, SessionAssignment } from '../types';

const PROFILE_ID = FIXTURE_PROFILE_ID;

const OCT26_0000 = 1_792_990_800_000; // Mon 2026-10-26 00:00 CDT
const OCT26_0800 = 1_793_019_600_000; // Mon 2026-10-26 08:00 CDT  (day-of time)
const OCT26_0900 = 1_793_023_200_000; // Mon 2026-10-26 09:00 CDT  (exactly 21 d before NOV16_0800)
const OCT26_1200 = 1_793_034_000_000; // Mon 2026-10-26 12:00 CDT
const OCT26_1600 = 1_793_048_400_000; // Mon 2026-10-26 16:00 CDT  (120 min before 18:00)
const OCT26_1700 = 1_793_052_000_000; // Mon 2026-10-26 17:00 CDT  (60 min before 18:00)
const NOV02_1700 = 1_793_660_400_000; // Mon 2026-11-02 17:00 CST
const NOV16_0800 = 1_794_837_600_000; // Mon 2026-11-16 08:00 CST
const WEEK_PLUS_HOUR_MS = 608_400_000; // [ms] 7 d + 1 h: the DST shift the fixture proves
const HOUR_MS = 3_600_000; // [ms]

function makeState(settings: ReminderSettings, pausedOn: string | null = null): AppState {
  return makeAppState({ settings, pausedOn });
}

/** A recorded day. `status` decides whether the day still deserves a reminder. */
function assignment(
  date: string,
  sessionId: string,
  status: SessionAssignment['status'],
): SessionAssignment {
  return {
    date,
    sessionId,
    sourceIndex: 2, // [sessions] offset into plan.sessions
    status,
    startedAt: null, // [ms] epoch, UTC
    completedAt: null, // [ms] epoch, UTC
    skipReason: null,
  };
}

const SETTINGS: ReminderSettings = { enabled: true, dayOfTime: '08:00', leadMinutes: [120, 60] };

describe('computeReminderInstants', () => {
  it('emits a day-of instant and one instant per lead time for every training day', () => {
    const instants = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      14,
      OCT26_0000,
    );
    // Mondays 2026-10-26, 2026-11-02; Thursdays 2026-10-29, 2026-11-05. Four days x 3 instants.
    expect(instants).toHaveLength(12);
  });

  it('places the day-of instant at ReminderSettings.dayOfTime and the leads before the slot', () => {
    const instants = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      14,
      OCT26_0000,
    );
    const monday = instants.filter((i) => i.key.startsWith('2026-10-26:'));
    expect(monday.map((i) => [i.key, i.at])).toEqual([
      ['2026-10-26:day-of:0', OCT26_0800],
      ['2026-10-26:lead:120', OCT26_1600],
      ['2026-10-26:lead:60', OCT26_1700],
    ]);
  });

  it("uses the master plan's title and body, with a comma and no em dash", () => {
    const instants = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      14,
      OCT26_0000,
    );
    const first = instants[0];
    expect(first?.title).toBe('Upper today');
    expect(first?.body).toBe('Upper A at 18:00, session 3 of 24');
    // Copy contract (master plan section 3): no em dash or en dash as a sentence connector.
    for (const i of instants) {
      expect(i.title).not.toMatch(/[–—]/);
      expect(i.body).not.toMatch(/[–—]/);
    }
  });

  it('gives both kinds on a day the same title and body', () => {
    const instants = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      14,
      OCT26_0000,
    );
    const monday = instants.filter((i) => i.key.startsWith('2026-10-26:'));
    expect(new Set(monday.map((i) => `${i.title}|${i.body}`)).size).toBe(1);
  });

  it('returns instants sorted ascending by at', () => {
    const instants = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      14,
      OCT26_0000,
    );
    const times = instants.map((i) => i.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('holds the wall-clock time across the end of daylight saving', () => {
    const instants = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      14,
      OCT26_0000,
    );
    const before = instants.find((i) => i.key === '2026-10-26:lead:60');
    const after = instants.find((i) => i.key === '2026-11-02:lead:60');
    expect(before?.at).toBe(OCT26_1700);
    expect(after?.at).toBe(NOV02_1700);
    // 7 days of wall clock across a CDT -> CST transition is 7 d + 1 h of elapsed time.
    expect((after?.at ?? 0) - (before?.at ?? 0)).toBe(WEEK_PLUS_HOUR_MS);
  });

  it('skips instants that are already in the past and keeps the leads still ahead', () => {
    const instants = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      14,
      OCT26_1200,
    );
    expect(instants.filter((i) => i.key.startsWith('2026-10-26:')).map((i) => i.key)).toEqual([
      '2026-10-26:lead:120',
      '2026-10-26:lead:60',
    ]);
    expect(instants).toHaveLength(11);
  });

  it('skips paused days', () => {
    const instants = computeReminderInstants(
      makeState(SETTINGS, '2026-10-29'),
      PROFILE_ID,
      '2026-10-26',
      14,
      OCT26_0000,
    );
    expect(instants.some((i) => i.key.startsWith('2026-10-29:'))).toBe(false);
    expect(instants).toHaveLength(9);
  });

  it('skips days whose assignment is already completed or skipped', () => {
    const state = makeAppState({
      settings: SETTINGS,
      assignments: [
        assignment('2026-10-26', 'session-3', 'completed'),
        assignment('2026-11-05', 'session-4', 'skipped'),
      ],
    });
    const instants = computeReminderInstants(state, PROFILE_ID, '2026-10-26', 14, OCT26_0000);
    expect(instants.some((i) => i.key.startsWith('2026-10-26:'))).toBe(false);
    expect(instants.some((i) => i.key.startsWith('2026-11-05:'))).toBe(false);
    // The two untouched training days, 2026-10-29 and 2026-11-02, still get three each.
    expect(instants).toHaveLength(6);
  });

  it('still reminds on a day whose assignment is planned or in progress', () => {
    const state = makeAppState({
      settings: SETTINGS,
      assignments: [
        assignment('2026-10-26', 'session-3', 'planned'),
        assignment('2026-10-29', 'session-4', 'in-progress'),
      ],
    });
    const instants = computeReminderInstants(state, PROFILE_ID, '2026-10-26', 14, OCT26_0000);
    expect(instants.some((i) => i.key === '2026-10-26:day-of:0')).toBe(true);
    expect(instants.some((i) => i.key === '2026-10-29:day-of:0')).toBe(true);
  });

  it('emits nothing when reminders are disabled', () => {
    const state = makeState({ enabled: false, dayOfTime: '08:00', leadMinutes: [120] });
    expect(computeReminderInstants(state, PROFILE_ID, '2026-10-26', 14, OCT26_0000)).toEqual([]);
  });

  it('emits only day-of instants when leadMinutes is empty', () => {
    const state = makeState({ enabled: true, dayOfTime: '08:00', leadMinutes: [] });
    const instants = computeReminderInstants(state, PROFILE_ID, '2026-10-26', 14, OCT26_0000);
    expect(instants).toHaveLength(4);
    expect(instants.every((i) => i.key.endsWith(':day-of:0'))).toBe(true);
  });

  it('de-duplicates repeated lead times', () => {
    const state = makeState({ enabled: true, dayOfTime: '08:00', leadMinutes: [120, 120] });
    const instants = computeReminderInstants(state, PROFILE_ID, '2026-10-26', 14, OCT26_0000);
    expect(instants).toHaveLength(8);
  });

  it("never returns more than the Worker's 200-instant limit", () => {
    // 21 days from 2026-10-26 hold six training days (Mondays 10-26, 11-02, 11-09;
    // Thursdays 10-29, 11-05, 11-12), so the count is 6 x (1 + leads), far under the cap.
    const twoLeads = computeReminderInstants(
      makeState({ enabled: true, dayOfTime: '08:00', leadMinutes: [120, 60] }),
      PROFILE_ID,
      '2026-10-26',
      21,
      OCT26_0000,
    );
    const threeLeads = computeReminderInstants(
      makeState({ enabled: true, dayOfTime: '08:00', leadMinutes: [120, 60, 30] }),
      PROFILE_ID,
      '2026-10-26',
      21,
      OCT26_0000,
    );
    expect(twoLeads).toHaveLength(18);
    expect(threeLeads).toHaveLength(24);
    expect(twoLeads.length).toBeLessThanOrEqual(MAX_INSTANTS);
    expect(threeLeads.length).toBeLessThanOrEqual(MAX_INSTANTS);
  });

  it("keeps every instant inside the Worker's [now - 1 h, now + 21 d] window", () => {
    const state = makeState({ enabled: true, dayOfTime: '23:59', leadMinutes: [120, 60, 30] });
    const instants = computeReminderInstants(state, PROFILE_ID, '2026-10-26', 21, OCT26_0000);
    expect(instants.length).toBeGreaterThan(0);
    for (const i of instants) {
      expect(i.at).toBeGreaterThan(OCT26_0000 - HOUR_MS);
      expect(i.at).toBeLessThanOrEqual(OCT26_0000 + MAX_HORIZON_MS);
    }
  });

  it('drops instants beyond 21 days when the caller asks for a longer window', () => {
    // 25 days from 2026-10-26 reaches 2026-11-19. The 2026-11-01 fall-back adds an hour
    // of elapsed time, so the clamp is on milliseconds, not on the day count: now + 21 d
    // is 2026-11-15 23:00 CST, which is before the 2026-11-16 08:00 day-of instant.
    const instants = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      25,
      OCT26_0000,
    );
    expect(instants.some((i) => i.key === '2026-11-12:day-of:0')).toBe(true);
    expect(instants.some((i) => i.key === '2026-11-16:day-of:0')).toBe(false);
    for (const i of instants) {
      expect(i.at).toBeLessThanOrEqual(OCT26_0000 + MAX_HORIZON_MS);
    }
  });

  it('clamps on milliseconds at exactly 21 d, inclusive', () => {
    // OCT26_0900 + MAX_HORIZON_MS === NOV16_0800 exactly: 21 d of elapsed time from
    // 09:00 CDT lands on 08:00 CST because the fall-back gives the window an extra hour.
    expect(OCT26_0900 + MAX_HORIZON_MS).toBe(NOV16_0800);
    const atBoundary = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      22,
      OCT26_0900,
    );
    const kept = atBoundary.find((i) => i.key === '2026-11-16:day-of:0');
    expect(kept?.at).toBe(NOV16_0800);
    // One millisecond earlier and the same instant is one millisecond outside the horizon.
    const justOutside = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      22,
      OCT26_0900 - 1,
    );
    expect(justOutside.some((i) => i.key === '2026-11-16:day-of:0')).toBe(false);
  });

  it('returns an empty list for an unknown profile', () => {
    expect(computeReminderInstants(makeState(SETTINGS), 'nobody', '2026-10-26', 14, OCT26_0000)).toEqual(
      [],
    );
  });

  it('returns an empty list for a zero-day window', () => {
    expect(computeReminderInstants(makeState(SETTINGS), PROFILE_ID, '2026-10-26', 0, OCT26_0000)).toEqual(
      [],
    );
  });
});

describe('scheduleHash', () => {
  it('is stable for the same instants', () => {
    const state = makeState(SETTINGS);
    const a = computeReminderInstants(state, PROFILE_ID, '2026-10-26', 14, OCT26_0000);
    const b = computeReminderInstants(state, PROFILE_ID, '2026-10-26', 14, OCT26_0000);
    expect(scheduleHash(a)).toBe(scheduleHash(b));
  });

  it('is order-independent', () => {
    const state = makeState(SETTINGS);
    const a = computeReminderInstants(state, PROFILE_ID, '2026-10-26', 14, OCT26_0000);
    expect(scheduleHash([...a].reverse())).toBe(scheduleHash(a));
  });

  it('changes when a lead time is added', () => {
    const two = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      14,
      OCT26_0000,
    );
    const three = computeReminderInstants(
      makeState({ enabled: true, dayOfTime: '08:00', leadMinutes: [120, 60, 30] }),
      PROFILE_ID,
      '2026-10-26',
      14,
      OCT26_0000,
    );
    expect(scheduleHash(two)).not.toBe(scheduleHash(three));
  });

  it('changes when a single instant moves by one minute', () => {
    const base = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      14,
      OCT26_0000,
    );
    const moved = base.map((i, index) => (index === 0 ? { ...i, at: i.at + 60_000 } : i));
    expect(scheduleHash(base)).not.toBe(scheduleHash(moved));
  });

  it('changes when only the body copy changes', () => {
    const base = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      14,
      OCT26_0000,
    );
    const reworded = base.map((i, index) => (index === 0 ? { ...i, body: `${i.body}.` } : i));
    expect(scheduleHash(base)).not.toBe(scheduleHash(reworded));
  });

  it('returns a fixed-width lowercase hex string', () => {
    expect(scheduleHash([])).toMatch(/^[0-9a-f]{8}$/);
    const base = computeReminderInstants(
      makeState(SETTINGS),
      PROFILE_ID,
      '2026-10-26',
      14,
      OCT26_0000,
    );
    expect(scheduleHash(base)).toMatch(/^[0-9a-f]{8}$/);
  });
});
