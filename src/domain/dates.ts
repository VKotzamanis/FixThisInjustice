import { TZDate } from '@date-fns/tz';
import type { EpochMs, IsoWeekday, LocalDate, LocalTime, TimeZone } from './types';

/** Milliseconds in one calendar day measured on the UTC line, where no DST exists. */
const MS_PER_UTC_DAY = 86_400_000; // [ms/day]

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

/** Civil date of an instant in the given zone. Never uses toISOString (A8, A10). */
export function localDateOf(instant: EpochMs, tz: TimeZone): LocalDate {
  const d = new TZDate(instant, tz);
  return `${pad4(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Wall-clock time of an instant in the given zone, "HH:mm". */
export function localTimeOf(instant: EpochMs, tz: TimeZone): LocalTime {
  const d = new TZDate(instant, tz);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Today's civil date in the given zone. */
export function todayLocal(tz: TimeZone, now: EpochMs = Date.now()): LocalDate {
  return localDateOf(now, tz);
}

/**
 * Wall-clock date and time in a zone -> instant.
 *
 * A time inside a spring-forward gap does not exist; TZDate resolves it forward
 * (02:30 on 2026-03-08 in America/New_York becomes 03:30 EDT). A time inside an
 * autumn overlap is ambiguous; TZDate picks the later offset (01:30 on
 * 2026-11-01 in America/New_York is 01:30 EST, 06:30Z).
 */
export function instantOf(date: LocalDate, time: LocalTime, tz: TimeZone): EpochMs {
  const { year, month, day } = partsOf(date);
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  return new TZDate(year, month - 1, day, hours, minutes, 0, 0, tz).getTime();
}

/**
 * Calendar arithmetic on the UTC line, so no DST transition can shift it.
 * This is the fix for code review A9 and A10, where the legacy helpers parsed
 * "YYYY-MM-DDT00:00:00" as local midnight and formatted as UTC.
 */
export function addDays(date: LocalDate, n: number): LocalDate {
  return formatUtcMidnight(utcMidnightOfDate(date) + n * MS_PER_UTC_DAY);
}

/** b − a in whole calendar days. Zone-free, DST-free. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((utcMidnightOfDate(b) - utcMidnightOfDate(a)) / MS_PER_UTC_DAY);
}

/** ISO weekday, 1 = Monday through 7 = Sunday. */
export function isoWeekday(date: LocalDate): IsoWeekday {
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
