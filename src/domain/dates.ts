import { TZDate, tzOffset } from '@date-fns/tz';
import type { EpochMs, IsoWeekday, LocalDate, LocalTime, TimeZone } from './types';

/** Milliseconds in one calendar day measured on the UTC line, where no DST exists. */
const MS_PER_UTC_DAY = 86_400_000; // [ms/day]
/** Milliseconds in one hour. Fixed: hours are not subject to DST, only offsets are. */
const MS_PER_HOUR = 3_600_000; // [ms/h]
/** Milliseconds in one minute. tzOffset reports offsets in minutes, so this converts them. */
const MS_PER_MINUTE = 60_000; // [ms/min]

const LOCAL_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_SHAPE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ISO weekday for each JavaScript getUTCDay index; index 0 is Sunday. */
const ISO_WEEKDAY_BY_UTC_DAY: readonly IsoWeekday[] = [7, 1, 2, 3, 4, 5, 6];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/**
 * Midnight UTC for a calendar triple. setUTCFullYear rather than Date.UTC:
 * Date.UTC maps a two-digit year onto 1900+y, and "0099-01-01" is a valid
 * four-digit LocalDate.
 */
function utcMidnightOf(year: number, month: number, day: number): EpochMs {
  const d = new Date(0);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCFullYear(year, month - 1, day);
  return d.getTime();
}

function partsOf(date: LocalDate): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

function utcMidnightOfDate(date: LocalDate): EpochMs {
  const { year, month, day } = partsOf(date);
  return utcMidnightOf(year, month, day);
}

function formatUtcMidnight(instant: EpochMs): LocalDate {
  const d = new Date(instant);
  return `${pad4(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Guard for the arguments every exported helper shares. Throws rather than returning NaN text. */
function assertValidDate(date: LocalDate, fn: string): void {
  if (!isValidLocalDate(date)) {
    throw new RangeError(`${fn}: invalid LocalDate ${JSON.stringify(date)}, expected "YYYY-MM-DD"`);
  }
}

function assertValidTimeZone(tz: TimeZone, fn: string): void {
  if (!isValidTimeZone(tz)) {
    throw new RangeError(`${fn}: invalid IANA time zone ${JSON.stringify(tz)}`);
  }
}

/** True when s is a well-formed and calendar-valid "YYYY-MM-DD". */
export function isValidLocalDate(s: string): s is LocalDate {
  if (!LOCAL_DATE_SHAPE.test(s)) return false;
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  const day = Number(s.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(utcMidnightOf(year, month, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
}

/** True when s is a well-formed 24-hour "HH:mm". */
export function isValidLocalTime(s: string): s is LocalTime {
  return LOCAL_TIME_SHAPE.test(s);
}

/** True when Intl accepts s as an IANA time zone identifier. */
export function isValidTimeZone(s: string): s is TimeZone {
  if (s === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s });
    return true;
  } catch {
    return false;
  }
}

/** The zone the device is configured for; the setup wizard's default. */
export function deviceTimeZone(): TimeZone {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Civil date of an instant in the given zone. Never uses toISOString (A8, A10).
 *
 * @throws RangeError on an invalid IANA zone, which otherwise formats as "0NaN-NaN-NaN".
 */
export function localDateOf(instant: EpochMs, tz: TimeZone): LocalDate {
  assertValidTimeZone(tz, 'localDateOf');
  const d = new TZDate(instant, tz);
  return `${pad4(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Wall-clock time of an instant in the given zone, "HH:mm".
 *
 * @throws RangeError on an invalid IANA zone.
 */
export function localTimeOf(instant: EpochMs, tz: TimeZone): LocalTime {
  assertValidTimeZone(tz, 'localTimeOf');
  const d = new TZDate(instant, tz);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Today's civil date in the given zone.
 *
 * @throws RangeError on an invalid IANA zone.
 */
export function todayLocal(tz: TimeZone, now: EpochMs = Date.now()): LocalDate {
  assertValidTimeZone(tz, 'todayLocal');
  return localDateOf(now, tz);
}

/**
 * Wall-clock date and time in a zone -> instant.
 *
 * The instant comes only from the offsets tzOffset reports for the zone, so the
 * result does not depend on the process time zone. Constructing a TZDate from
 * components does depend on it: TZDateMini resolves the components in the system
 * zone before correcting them, so an ambiguous autumn wall time used to take
 * whichever offset the host happened to sit in.
 *
 * A wall-clock reading is not always one instant:
 *
 * - Spring-forward gap: the reading does not exist. It resolves forward, by the
 *   offset in force before the transition, so 02:30 on 2026-03-08 in
 *   America/New_York becomes 03:30 EDT (07:30Z).
 * - Overlap: the reading occurs twice. The earlier instant is chosen. Because
 *   an instant is `wallUtc - offset`, the earlier one is produced by the
 *   *larger* (further east) UTC offset. That is the DST offset only when the
 *   overlap is a daylight-saving fall-back; a zone that shifts its standard
 *   offset westward permanently produces the same kind of overlap with no DST
 *   involved, and the same rule picks the earlier instant there too. So 01:30
 *   on 2026-11-01 in America/New_York is 01:30 EDT (05:30Z), not the EST repeat
 *   an hour later.
 *
 * Both rules match Temporal's `disambiguation: 'compatible'`.
 *
 * @throws RangeError on an invalid date, time, or IANA zone.
 */
export function instantOf(date: LocalDate, time: LocalTime, tz: TimeZone): EpochMs {
  assertValidDate(date, 'instantOf');
  if (!isValidLocalTime(time)) {
    throw new RangeError(`instantOf: invalid LocalTime ${JSON.stringify(time)}, expected "HH:mm"`);
  }
  assertValidTimeZone(tz, 'instantOf');

  const { year, month, day } = partsOf(date);
  const hours = Number(time.slice(0, 2)); // [h], 0..23
  const minutes = Number(time.slice(3, 5)); // [min], 0..59

  // The wall-clock components placed on the UTC line: the civil reading treated
  // as though the zone's offset were zero. Not an instant on its own. [ms]
  const wallUtc = utcMidnightOf(year, month, day) + hours * MS_PER_HOUR + minutes * MS_PER_MINUTE;

  // The offsets in force a day either side of the reading, which bracket any
  // single transition near it. tzOffset is signed east-positive: +480 for UTC+8,
  // -240 for EDT, the mirror of Date.prototype.getTimezoneOffset. So the instant
  // for a candidate offset is wallUtc - offset. [min]
  const offsetBefore = tzOffset(tz, new Date(wallUtc - MS_PER_UTC_DAY));
  const offsetAfter = tzOffset(tz, new Date(wallUtc + MS_PER_UTC_DAY));
  const offsets = offsetBefore === offsetAfter ? [offsetBefore] : [offsetBefore, offsetAfter];

  // A candidate is valid when the zone's actual offset at that instant is the
  // offset that produced it. A normal reading yields exactly one; an overlap
  // yields two; a gap yields none.
  const valid: EpochMs[] = [];
  for (const offset of offsets) {
    const instant = wallUtc - offset * MS_PER_MINUTE; // [ms]
    if (tzOffset(tz, new Date(instant)) === offset) valid.push(instant);
  }

  // Gap: apply the pre-transition offset, which lands one offset step past the
  // gap and so resolves the reading forward.
  if (valid.length === 0) return wallUtc - offsetBefore * MS_PER_MINUTE;

  // One candidate on a normal day. On an overlap, the earlier instant is the
  // first occurrence of the reading.
  return Math.min(...valid);
}

/**
 * Calendar arithmetic on the UTC line, so no DST transition can shift it.
 * This is the fix for code review A9 and A10, where the legacy helpers parsed
 * "YYYY-MM-DDT00:00:00" as local midnight and formatted as UTC.
 *
 * n must be a whole number of days. A fractional count lands off UTC midnight
 * and formatUtcMidnight would report whichever calendar day the resulting
 * instant fell in — addDays(d, 1.5) silently behaving as addDays(d, 1). The
 * integer check also covers NaN and both infinities, which are not integers.
 *
 * @throws RangeError on an invalid date or a non-integer day count.
 */
export function addDays(date: LocalDate, n: number): LocalDate {
  assertValidDate(date, 'addDays');
  if (!Number.isInteger(n)) {
    throw new RangeError(`addDays: day count must be a whole number, received ${String(n)}`);
  }
  return formatUtcMidnight(utcMidnightOfDate(date) + n * MS_PER_UTC_DAY); // [d] -> [ms]
}

/**
 * b − a in whole calendar days. Zone-free, DST-free.
 *
 * @throws RangeError on an invalid date.
 */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  assertValidDate(a, 'daysBetween');
  assertValidDate(b, 'daysBetween');
  return Math.round((utcMidnightOfDate(b) - utcMidnightOfDate(a)) / MS_PER_UTC_DAY); // [ms] -> [d]
}

/**
 * ISO weekday, 1 = Monday through 7 = Sunday.
 *
 * The guard matters here more than elsewhere: Date rolls an out-of-range triple
 * forward, so "2026-02-30" would otherwise return a perfectly plausible weekday
 * (2026-03-02's Monday) for a date that is not on the calendar. weekStart and
 * weekEnd are built on this, so the bad date would propagate silently.
 *
 * @throws RangeError on an invalid date.
 */
export function isoWeekday(date: LocalDate): IsoWeekday {
  assertValidDate(date, 'isoWeekday');
  const utcDay = new Date(utcMidnightOfDate(date)).getUTCDay();
  const weekday = ISO_WEEKDAY_BY_UTC_DAY[utcDay];
  if (weekday === undefined) {
    throw new Error(`getUTCDay returned ${utcDay} for ${date}`);
  }
  return weekday;
}

/** Monday of the ISO week containing date. */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, -(isoWeekday(date) - 1));
}

/** Sunday of the ISO week containing date. */
export function weekEnd(date: LocalDate): LocalDate {
  return addDays(weekStart(date), 6);
}

/** Chronological order. Zero-padded ISO dates sort lexicographically. */
export function compareLocalDate(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
