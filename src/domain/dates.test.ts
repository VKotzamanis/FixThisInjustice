import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareLocalDate,
  daysBetween,
  deviceTimeZone,
  instantOf,
  isValidLocalDate,
  isValidLocalTime,
  isValidTimeZone,
  isoWeekday,
  localDateOf,
  localTimeOf,
  todayLocal,
  weekEnd,
  weekStart,
} from './dates';
import type { TimeZone } from './types';

/** The four zones master plan section 3 requires every date fixture to run in. */
const ZONES: readonly TimeZone[] = [
  'Europe/Athens',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

describe('validation', () => {
  it('accepts a well-formed calendar date', () => {
    expect(isValidLocalDate('2026-03-08')).toBe(true);
    expect(isValidLocalDate('2028-02-29')).toBe(true);
  });

  it('rejects malformed and calendar-invalid dates', () => {
    expect(isValidLocalDate('2026-3-8')).toBe(false);
    expect(isValidLocalDate('2026-13-01')).toBe(false);
    expect(isValidLocalDate('2026-02-30')).toBe(false);
    expect(isValidLocalDate('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isValidLocalDate('')).toBe(false);
  });

  it('validates 24-hour times', () => {
    expect(isValidLocalTime('00:00')).toBe(true);
    expect(isValidLocalTime('23:59')).toBe(true);
    expect(isValidLocalTime('24:00')).toBe(false);
    expect(isValidLocalTime('7:30')).toBe(false);
    expect(isValidLocalTime('07:60')).toBe(false);
  });

  it('validates IANA zone identifiers', () => {
    for (const zone of ZONES) {
      expect(isValidTimeZone(zone)).toBe(true);
    }
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('reports a usable device zone', () => {
    expect(isValidTimeZone(deviceTimeZone())).toBe(true);
  });
});

describe('localDateOf', () => {
  it('returns the local date, not the UTC date (master plan section 7 gate)', () => {
    // 2026-03-08T06:30Z is 01:30 EST, still 8 March in New York.
    expect(localDateOf(Date.UTC(2026, 2, 8, 6, 30), 'America/New_York')).toBe('2026-03-08');
    expect(localTimeOf(Date.UTC(2026, 2, 8, 6, 30), 'America/New_York')).toBe('01:30');
  });

  it('does not roll the day early east of Greenwich (code review A8)', () => {
    // The legacy todayISO() returned "2026-09-02" here, so the day's record
    // reset at 03:00 local instead of midnight.
    expect(localDateOf(Date.UTC(2026, 8, 2, 22, 30), 'Europe/Athens')).toBe('2026-09-03');
    expect(localTimeOf(Date.UTC(2026, 8, 2, 22, 30), 'Europe/Athens')).toBe('01:30');
  });

  it('todayLocal takes an injectable now', () => {
    expect(todayLocal('UTC', Date.UTC(2026, 8, 1, 12, 0))).toBe('2026-09-01');
  });
});

describe('instantOf across DST transitions', () => {
  it('resolves a spring-forward gap forward', () => {
    // 02:30 does not exist on 2026-03-08 in America/New_York; it becomes 03:30 EDT.
    const t = instantOf('2026-03-08', '02:30', 'America/New_York');
    expect(t).toBe(Date.UTC(2026, 2, 8, 7, 30));
    expect(localTimeOf(t, 'America/New_York')).toBe('03:30');

    // Same transition, one zone west.
    const la = instantOf('2026-03-08', '02:30', 'America/Los_Angeles');
    expect(la).toBe(Date.UTC(2026, 2, 8, 10, 30));

    // EU transition: 03:00 to 04:00 local on 2026-03-29 in Europe/Athens.
    const athens = instantOf('2026-03-29', '03:30', 'Europe/Athens');
    expect(athens).toBe(Date.UTC(2026, 2, 29, 1, 30));
    expect(localTimeOf(athens, 'Europe/Athens')).toBe('04:30');
  });

  it('resolves an autumn overlap to the later offset', () => {
    // 01:30 occurs twice on 2026-11-01 in America/New_York; the EST reading wins.
    const ny = instantOf('2026-11-01', '01:30', 'America/New_York');
    expect(ny).toBe(Date.UTC(2026, 10, 1, 6, 30));
    expect(localTimeOf(ny, 'America/New_York')).toBe('01:30');

    // EU transition on 2026-10-25 in Europe/Athens.
    const athens = instantOf('2026-10-25', '03:30', 'Europe/Athens');
    expect(athens).toBe(Date.UTC(2026, 9, 25, 1, 30));
  });

  it('is the identity in UTC', () => {
    expect(instantOf('2026-03-08', '02:30', 'UTC')).toBe(Date.UTC(2026, 2, 8, 2, 30));
  });
});

describe('calendar arithmetic is zone-free', () => {
  it('measures a 168-day programme as 168 days in every zone, across both transitions', () => {
    // 2026-02-02 + 168 d spans the US transition on 2026-03-08 and the EU
    // transition on 2026-03-29. 2026-09-01 + 168 d spans the US transition on
    // 2026-11-01 and the EU transition on 2026-10-25.
    for (const start of ['2026-02-02', '2026-09-01']) {
      const end = addDays(start, 168);
      expect(daysBetween(start, end)).toBe(168);

      for (const tz of ZONES) {
        // Every one of the 169 civil dates must survive a wall-clock round trip
        // in every zone. The legacy isoDaysBetween lost a day here (A9).
        for (let i = 0; i <= 168; i += 1) {
          const date = addDays(start, i);
          expect(localDateOf(instantOf(date, '12:00', tz), tz)).toBe(date);
        }
      }
    }
  });

  it('produces the documented endpoints', () => {
    expect(addDays('2026-02-02', 168)).toBe('2026-07-20');
    expect(addDays('2026-09-01', 168)).toBe('2027-02-16');
  });

  it('crosses month and leap-year boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('signs daysBetween as b minus a', () => {
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween('2026-03-01', '2026-02-28')).toBe(-1);
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
  });
});

describe('ISO weeks start on Monday', () => {
  it('numbers weekdays 1 through 7', () => {
    expect(isoWeekday('2026-08-31')).toBe(1); // Monday
    expect(isoWeekday('2026-09-01')).toBe(2); // Tuesday
    expect(isoWeekday('2026-09-06')).toBe(7); // Sunday
  });

  it('brackets the week', () => {
    expect(weekStart('2026-09-01')).toBe('2026-08-31');
    expect(weekEnd('2026-09-01')).toBe('2026-09-06');
    expect(weekStart('2026-08-31')).toBe('2026-08-31');
    expect(weekEnd('2026-09-06')).toBe('2026-09-06');
    expect(daysBetween(weekStart('2026-09-01'), weekEnd('2026-09-01'))).toBe(6);
  });
});

describe('compareLocalDate', () => {
  it('orders chronologically', () => {
    expect(compareLocalDate('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareLocalDate('2026-01-02', '2026-01-01')).toBe(1);
    expect(compareLocalDate('2026-01-01', '2026-01-01')).toBe(0);
  });
});
