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
import { instantOf } from '../dates';
import type { AppState, IsoWeekday, ReminderSettings, SessionAssignment } from '../types';

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

// Lead-offset convention (P5 Task 5 review, item 1). Europe/Athens moves EET (UTC+2) to EEST
// (UTC+3) at 03:00 local on 2026-03-29, so 03:00 to 03:59 does not exist that day. Every value
// below was computed with Intl.DateTimeFormat against the tz database, not with this module.
const ATHENS = 'Europe/Athens';
const ATHENS_SLOT_0430 = 1_774_747_800_000; // Sun 2026-03-29 04:30 EEST = 2026-03-29T01:30Z
const ATHENS_LEAD_90 = 1_774_742_400_000; // 04:30 EEST minus 90 min elapsed = 02:00 EET
const ATHENS_WALL_0300 = 1_774_746_000_000; // the nonexistent 03:00 reading, resolved to 04:00 EEST
const ATHENS_NOW = 1_774_648_800_000; // Sat 2026-03-28 00:00 EET, before every instant below
const NINETY_MINUTES_MS = 5_400_000; // [ms] 90 min of elapsed time

// 200-instant cap (P5 Task 5 review, item 4).
const CAP_NOW = 1_793_054_400_000; // Mon 2026-10-26 17:40 CDT
const CAP_LAST_KEPT = 1_794_786_000_000; // Sun 2026-11-15 17:40 CST, the 200th instant
const CAP_DROPPED = 1_794_786_600_000; // Sun 2026-11-15 17:50 CST, the 201st and latest
/** Nine leads, 10 min apart, so a training day carries 1 day-of plus 9 leads. [min] */
const CAP_LEADS = [90, 80, 70, 60, 50, 40, 30, 20, 10];

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

/** The fixture profile moved to another zone and another slot time, everything else intact. */
function relocated(
  settings: ReminderSettings,
  timezone: string,
  weekdays: IsoWeekday[],
  startTime: string,
): AppState {
  const base = makeAppState({ settings });
  const profile = base.profiles[PROFILE_ID];
  if (profile === undefined) throw new Error('fixture profile is missing');
  return {
    ...base,
    profiles: { [PROFILE_ID]: { ...profile, timezone } },
    availability: {
      [PROFILE_ID]: {
        slots: weekdays.map((weekday) => ({ weekday, startTime, expectedDurationS: 3600 })), // [s]
        weeklySessionTarget: weekdays.length, // [sessions/week]
      },
    },
  };
}

const EVERY_WEEKDAY: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

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

  it('keeps a lead exactly leadMinutes of elapsed time before the slot across a spring-forward', () => {
    // The convention under test: the lead is elapsed time, not wall-clock subtraction. On the
    // morning Athens loses an hour, a 04:30 session gets its 90 minute lead at 02:00 EET, which
    // is 90 real minutes of notice and a 150 minute gap on the clock face.
    const state = relocated(
      { enabled: true, dayOfTime: '08:00', leadMinutes: [90] },
      ATHENS,
      [7], // Sunday: 2026-03-29
      '04:30',
    );
    const instants = computeReminderInstants(state, PROFILE_ID, '2026-03-29', 1, ATHENS_NOW);
    const slotAt = instantOf('2026-03-29', '04:30', ATHENS);
    const lead = instants.find((i) => i.key === '2026-03-29:lead:90');

    expect(slotAt).toBe(ATHENS_SLOT_0430);
    expect(lead?.at).toBe(ATHENS_SLOT_0430 - NINETY_MINUTES_MS);
    expect(lead?.at).toBe(ATHENS_LEAD_90);
    expect((slotAt - (lead?.at ?? 0)) / 60_000).toBe(90); // [min] elapsed, exactly

    // The rejected alternative, for the record: subtracting 90 minutes on the wall clock gives
    // 03:00, which does not exist that day. instantOf resolves the gap forward to 04:00 EEST,
    // 30 minutes of notice rather than the promised 90.
    expect(instantOf('2026-03-29', '03:00', ATHENS)).toBe(ATHENS_WALL_0300);
    expect(ATHENS_SLOT_0430 - ATHENS_WALL_0300).toBe(30 * 60_000); // [ms]
    expect(lead?.at).not.toBe(ATHENS_WALL_0300);
  });

  it('caps the list at 200 instants and drops the latest, not the soonest', () => {
    // The cap cannot be reached through the UI: the horizon holds at most 21 days and the
    // settings screen offers three lead choices, so the ceiling a user can produce is
    // 21 x (1 + 3) = 84. This state therefore comes from outside the UI (an imported or
    // hand-edited document), which is the case the cap exists for.
    //
    // Arithmetic: a slot every weekday at 18:00, nine leads at 16:30..17:50, a day-of at
    // 08:00. `now` is 17:40 on the first day, so that day keeps only its 17:50 lead;
    // 2026-10-27..2026-11-15 keep all ten each. 1 + 20 x 10 = 201 instants before the cap.
    const state = relocated(
      { enabled: true, dayOfTime: '08:00', leadMinutes: CAP_LEADS },
      'America/Chicago',
      EVERY_WEEKDAY,
      '18:00',
    );
    const instants = computeReminderInstants(state, PROFILE_ID, '2026-10-26', 21, CAP_NOW);

    expect(instants).toHaveLength(MAX_INSTANTS);
    expect(instants.map((i) => i.at)).toEqual([...instants.map((i) => i.at)].sort((a, b) => a - b));
    // Soonest first: the first day contributes exactly its one surviving lead.
    expect(instants.filter((i) => i.key.startsWith('2026-10-26:')).map((i) => i.key)).toEqual([
      '2026-10-26:lead:10',
    ]);
    // The 201st, which is the latest, is the one that went.
    expect(instants.at(-1)?.key).toBe('2026-11-15:lead:20');
    expect(instants.at(-1)?.at).toBe(CAP_LAST_KEPT);
    expect(instants.some((i) => i.key === '2026-11-15:lead:10')).toBe(false);
    expect(instants.every((i) => i.at < CAP_DROPPED)).toBe(true);
    // Nothing else was thinned: the last day keeps nine of its ten.
    expect(instants.filter((i) => i.key.startsWith('2026-11-15:'))).toHaveLength(9);
  });

  it('keeps a future lead on an in-progress day whose day-of instant has already passed', () => {
    const state = makeAppState({
      settings: { enabled: true, dayOfTime: '00:00', leadMinutes: [120, 60] },
      assignments: [assignment('2026-10-26', 'session-3', 'in-progress')],
    });
    // Midday: the 00:00 day-of instant is twelve hours gone, both leads are still ahead.
    const instants = computeReminderInstants(state, PROFILE_ID, '2026-10-26', 14, OCT26_1200);
    expect(instants.filter((i) => i.key.startsWith('2026-10-26:')).map((i) => [i.key, i.at])).toEqual([
      ['2026-10-26:lead:120', OCT26_1600],
      ['2026-10-26:lead:60', OCT26_1700],
    ]);
    expect(instants.some((i) => i.key === '2026-10-26:day-of:0')).toBe(false);
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
