import { tzOffset } from '@date-fns/tz';
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
import type { EpochMs, LocalDate, LocalTime, TimeZone } from './types';

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

  it('resolves an autumn overlap to the first occurrence', () => {
    // 01:30 occurs twice on 2026-11-01 in America/New_York. The first occurrence
    // wins: 01:30 EDT (UTC-4), not the EST repeat an hour of real time later.
    const ny = instantOf('2026-11-01', '01:30', 'America/New_York');
    expect(ny).toBe(Date.UTC(2026, 10, 1, 5, 30));
    expect(localTimeOf(ny, 'America/New_York')).toBe('01:30');

    // EU transition on 2026-10-25 in Europe/Athens: 03:30 EEST (UTC+3) wins.
    const athens = instantOf('2026-10-25', '03:30', 'Europe/Athens');
    expect(athens).toBe(Date.UTC(2026, 9, 25, 0, 30));

    // Southern hemisphere: DST *ends* on 2026-04-05 in Australia/Sydney, so the
    // overlap runs 02:00-03:00 and the first occurrence is AEDT (UTC+11).
    const sydney = instantOf('2026-04-05', '02:30', 'Australia/Sydney');
    expect(sydney).toBe(Date.UTC(2026, 3, 4, 15, 30));
    expect(localTimeOf(sydney, 'Australia/Sydney')).toBe('02:30');
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

/**
 * The six wall-clock readings the fix is specified against: two spring-forward
 * gaps, three autumn overlaps (including a southern-hemisphere one, where the
 * overlap falls in April), and one ordinary instant with no transition nearby.
 * Each expected instant is the one the documented rule produces — resolve a gap
 * forward, take the first occurrence of an overlap.
 */
const INSTANT_FIXTURES: readonly {
  date: LocalDate;
  time: LocalTime;
  tz: TimeZone;
  expected: EpochMs;
  note: string;
}[] = [
  {
    date: '2026-03-08',
    time: '02:30',
    tz: 'America/New_York',
    expected: Date.UTC(2026, 2, 8, 7, 30),
    note: 'gap, resolved forward to 03:30 EDT',
  },
  {
    date: '2026-11-01',
    time: '01:30',
    tz: 'America/New_York',
    expected: Date.UTC(2026, 10, 1, 5, 30),
    note: 'overlap, first occurrence, EDT (UTC-4)',
  },
  {
    date: '2026-03-29',
    time: '03:30',
    tz: 'Europe/Athens',
    expected: Date.UTC(2026, 2, 29, 1, 30),
    note: 'gap, resolved forward to 04:30 EEST',
  },
  {
    date: '2026-10-25',
    time: '03:30',
    tz: 'Europe/Athens',
    expected: Date.UTC(2026, 9, 25, 0, 30),
    note: 'overlap, first occurrence, EEST (UTC+3)',
  },
  {
    date: '2026-04-05',
    time: '02:30',
    tz: 'Australia/Sydney',
    expected: Date.UTC(2026, 3, 4, 15, 30),
    note: 'overlap, first occurrence, AEDT (UTC+11)',
  },
  {
    date: '2026-09-01',
    time: '18:00',
    tz: 'America/Chicago',
    expected: Date.UTC(2026, 8, 1, 23, 0),
    note: 'ordinary instant, CDT (UTC-5), no transition within a day',
  },
];

/**
 * Node's process.env, reached through globalThis: the app tsconfig deliberately
 * omits the node types, and this is the only place the suite needs them.
 */
const processEnv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env;

describe('instantOf does not depend on the host time zone', () => {
  it('produces the documented instant for every fixture', () => {
    for (const { date, time, tz, expected, note } of INSTANT_FIXTURES) {
      expect(instantOf(date, time, tz), `${tz} ${date} ${time} (${note})`).toBe(expected);
    }
  });

  it('produces the same instants whatever process.env.TZ is set to', () => {
    // The bug this replaces: TZDate resolved wall-clock components in the system
    // zone first, so an ambiguous autumn reading took whichever offset the host
    // happened to sit in. Node retargets the system zone when process.env.TZ is
    // reassigned, so the regression is reproducible in one process. The npm
    // script "test:tz" re-runs the whole suite under four zones as well, which
    // covers module-load-time zone capture that this test cannot see.
    const original = processEnv.TZ;
    const expected = INSTANT_FIXTURES.map((f) => f.expected);
    const probe = Date.UTC(2026, 6, 1, 12); // a July instant, away from any transition
    try {
      for (const hostZone of ZONES) {
        processEnv.TZ = hostZone;

        // Confirm the reassignment actually retargeted the system zone. Without
        // this the test could pass vacuously by never changing anything.
        // getTimezoneOffset is west-positive and tzOffset east-positive, so the
        // system value is negated to compare them. The trailing `+ 0` normalises
        // the -0 that negating a zero offset produces under UTC, which toBe
        // compares with Object.is and would otherwise read as unequal to 0. [min]
        const systemOffset = -new Date(probe).getTimezoneOffset() + 0;
        expect(systemOffset, `TZ=${hostZone} did not take effect`).toBe(
          tzOffset(hostZone, new Date(probe)),
        );

        const readings = INSTANT_FIXTURES.map((f) => instantOf(f.date, f.time, f.tz));
        expect(readings, `computed under TZ=${hostZone}`).toEqual(expected);
      }
    } finally {
      if (original === undefined) delete processEnv.TZ;
      else processEnv.TZ = original;
    }
  });
});

describe('invalid input throws RangeError rather than producing NaN text', () => {
  it('instantOf rejects a bad date, time, or zone', () => {
    expect(() => instantOf('2026-02-30', '12:00', 'UTC')).toThrow(RangeError);
    expect(() => instantOf('2026-3-8', '12:00', 'UTC')).toThrow(RangeError);
    expect(() => instantOf('2026-03-08', '24:00', 'UTC')).toThrow(RangeError);
    expect(() => instantOf('2026-03-08', '7:30', 'UTC')).toThrow(RangeError);
    expect(() => instantOf('2026-03-08', '12:00', 'Mars/Olympus_Mons')).toThrow(RangeError);
    expect(() => instantOf('2026-03-08', '12:00', '')).toThrow(RangeError);
  });

  it('localDateOf and localTimeOf reject a bad zone instead of returning "0NaN-NaN-NaN"', () => {
    const t = Date.UTC(2026, 8, 1, 12, 0);
    expect(() => localDateOf(t, 'Mars/Olympus_Mons')).toThrow(RangeError);
    expect(() => localDateOf(t, '')).toThrow(RangeError);
    expect(() => localTimeOf(t, 'Mars/Olympus_Mons')).toThrow(RangeError);
    expect(() => localTimeOf(t, '')).toThrow(RangeError);
  });

  it('todayLocal rejects a bad zone', () => {
    expect(() => todayLocal('Mars/Olympus_Mons', Date.UTC(2026, 8, 1, 12, 0))).toThrow(RangeError);
    expect(() => todayLocal('')).toThrow(RangeError);
  });

  it('addDays rejects a bad date or a non-finite day count', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addDays('not-a-date', 1)).toThrow(RangeError);
    expect(() => addDays('2026-09-01', Number.NaN)).toThrow(RangeError);
    expect(() => addDays('2026-09-01', Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => addDays('2026-09-01', Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  it('addDays rejects a fractional day count', () => {
    // A fractional count lands off UTC midnight, and formatUtcMidnight would
    // then report whichever calendar day the truncated instant fell in — a
    // silent half-day shift rather than an error.
    expect(() => addDays('2026-09-01', 1.5)).toThrow(RangeError);
    expect(() => addDays('2026-09-01', -0.5)).toThrow(RangeError);
    expect(() => addDays('2026-09-01', 0.000_1)).toThrow(RangeError);
    // Whole numbers, including negatives and zero, stay accepted.
    expect(addDays('2026-09-01', 0)).toBe('2026-09-01');
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('daysBetween rejects a bad date in either position', () => {
    expect(() => daysBetween('2026-02-30', '2026-09-01')).toThrow(RangeError);
    expect(() => daysBetween('2026-09-01', '2026-02-30')).toThrow(RangeError);
  });

  it('isoWeekday rejects a bad date instead of reporting a weekday for it', () => {
    // "2026-02-30" rolls forward to 2026-03-02 inside Date, so without the
    // guard the caller gets a plausible-looking Monday for a date that is not
    // on the calendar.
    expect(() => isoWeekday('2026-02-30')).toThrow(RangeError);
    expect(() => isoWeekday('not-a-date')).toThrow(RangeError);
    expect(() => isoWeekday('2026-9-1')).toThrow(RangeError);
  });
});
