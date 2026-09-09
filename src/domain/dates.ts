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

/**
 * A time zone's UTC offset, for today, as `UTC+02:00`.
 *
 * COMPUTED, NEVER STORED. An offset moves with daylight saving, so a stored one is wrong for half
 * the year; src/domain/export/fixtures/athens-dst-week.ics exists because that has already bitten
 * this project once. `atEpochMs` is a parameter rather than a `Date.now()` read so this stays a
 * pure function of its arguments, testable without faking a clock.
 *
 * Lives here rather than beside either caller: alpha round 1 shipped it duplicated into the setup
 * wizard and the Settings view, and two copies of a formatting rule drift.
 */
export function utcOffsetLabel(zone: string, atEpochMs: number): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date(atEpochMs));
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
    return offset.replace('GMT', 'UTC');
  } catch {
    // Reachable only for a zone id the runtime accepted into supportedValuesOf a moment ago and
    // now refuses; belt and braces, not a path this suite can drive.
    return 'UTC';
  }
}

// ---- the time-zone picker's grouping (round 2 claim r2.09) -------------------------------------

/**
 * A zone's UTC offset at an instant, in minutes EAST of UTC. [min]
 *
 * East-positive, so `+330` is India and `-240` is New York in July. That is `tzOffset`'s own
 * convention and the mirror of `Date.prototype.getTimezoneOffset`; `instantOf` above already
 * depends on it, and this exists so the picker sorts on the same number the label prints.
 *
 * @throws RangeError on an invalid IANA zone.
 */
export function zoneOffsetMinutes(zone: TimeZone, atEpochMs: EpochMs): number {
  assertValidTimeZone(zone, 'zoneOffsetMinutes');
  return tzOffset(zone, new Date(atEpochMs)); // [min] east of UTC
}

/**
 * `UTC/GMT-05:00`. Both abbreviations, because Europe says GMT (round 2 claim r2.09).
 *
 * BUILT FROM THE OFFSET MINUTES, not from Intl's `longOffset` string, and that is deliberate:
 * `utcOffsetLabel` above renders the zone `UTC` itself as the bare word `UTC` because that is
 * what `longOffset` returns for it, so a picker labelled from the string would show one row with
 * no offset at all. Deriving from the same number the picker SORTS on also makes it impossible
 * for the label and the ordering to disagree.
 *
 * @throws RangeError on an invalid IANA zone.
 */
export function utcGmtOffsetLabel(zone: TimeZone, atEpochMs: EpochMs): string {
  const minutes = zoneOffsetMinutes(zone, atEpochMs); // [min] east of UTC
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes); // [min]
  return `UTC/GMT${sign}${pad2(Math.trunc(abs / 60))}:${pad2(abs % 60)}`;
}

/**
 * The zone's offset on the first of each month of the year containing `atEpochMs`, as a key. [min]
 *
 * WHY A WHOLE YEAR AND NOT ONE INSTANT. Two zones that agree today can disagree in July:
 * America/New_York and America/Panama are both UTC-05:00 in January, and in July New York is
 * -04:00 and Panama is not. Sampling twelve months puts each zone's daylight-saving RULE in the
 * key, so zones collapse together only when they are interchangeable for every day of the year.
 *
 * The sample instants are UTC midnight on the first of each month, which is what the round-2
 * ruling was measured against. The measurement is stable: the same 59 groups come out of 418
 * zones for the 1st and for the 15th, and for 2026 and for 2027.
 *
 * @throws RangeError on an invalid IANA zone.
 */
export function zoneYearSignature(zone: TimeZone, atEpochMs: EpochMs): string {
  assertValidTimeZone(zone, 'zoneYearSignature');
  const year = new Date(atEpochMs).getUTCFullYear();
  const offsets: number[] = [];
  for (let month = 1; month <= 12; month += 1) {
    offsets.push(tzOffset(zone, new Date(utcMidnightOf(year, month, 1)))); // [min] east of UTC
  }
  return offsets.join(',');
}

/** One row of the picker: the zone it stores, every zone it stands for, and how it sorts. */
export interface TimeZoneGroup {
  /** The IANA id STORED when this row is chosen. Never an offset: the offset is not the identity. */
  representative: TimeZone;
  /** Every zone with this year of offsets, the representative included, in alphabetical order. */
  members: readonly TimeZone[];
  /** The offset in force at `atEpochMs`, east-positive. The primary sort key. [min] */
  offsetMinutes: number;
  /** `UTC/GMT+05:45`, from `utcGmtOffsetLabel`. */
  offsetLabel: string;
}

/**
 * The zones a user is likely to recognise, most prominent first, one per multi-member group.
 *
 * WHAT THIS IS AND IS NOT. It is a DISPLAY preference and nothing else: which of a group's
 * interchangeable ids the row is named after. It feeds no computation, and every id in it is a
 * real IANA identifier that `timeZoneGroups.test.ts` asserts is a member of the group it is
 * chosen for. No population figure is recorded here and none is invented: the ordering is an
 * editorial judgement about which city name a reader will know, reviewable line by line, and a
 * group whose members are all absent from this list falls back to the deterministic rule below.
 *
 * The 2026 tz database groups 418 zones into 59 behaviours, 30 of which have more than one
 * member. The singletons need no entry: their one member is their representative either way.
 */
const PROMINENT_ZONES: readonly string[] = [
  'Europe/London', 'Europe/Paris', 'Europe/Athens', 'Europe/Moscow', 'Europe/Lisbon',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'America/Mexico_City', 'America/Bogota',
  'America/Caracas', 'America/Halifax', 'America/Sao_Paulo', 'America/Godthab',
  'America/Noronha', 'Pacific/Honolulu', 'Pacific/Pago_Pago',
  'Africa/Lagos', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Abidjan', 'Africa/Casablanca',
  'Asia/Dubai', 'Asia/Karachi', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Rangoon', 'Asia/Jakarta',
  'Asia/Shanghai', 'Asia/Tokyo',
  'Australia/Sydney', 'Australia/Brisbane', 'Australia/Adelaide',
  'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Apia', 'Pacific/Guadalcanal',
];

/**
 * The region a zone id names, which is the segment before the first `/`. `Europe/Amsterdam` is
 * `Europe`; the handful of ids with no slash (`UTC`) are their own region.
 */
function zoneRegion(zone: string): string {
  const slash = zone.indexOf('/');
  return slash === -1 ? zone : zone.slice(0, slash);
}

/**
 * The row's name when no member appears in `PROMINENT_ZONES`.
 *
 * Alphabetically first WITHIN THE REGION MOST OF THE GROUP LIVES IN, not alphabetically first
 * overall. The thirty-three zones that share western Europe's behaviour include `Africa/Ceuta`
 * and `Arctic/Longyearbyen`, both of which sort ahead of every `Europe/` id, so a plain
 * alphabetical rule would name Europe's row after a Spanish enclave in Morocco. Ties on the
 * region count are broken by region name, then by zone name, so the result depends on the
 * membership alone and never on the order the platform happened to list the zones in.
 */
function fallbackRepresentative(members: readonly string[]): string {
  const countByRegion = new Map<string, number>();
  for (const zone of members) {
    const region = zoneRegion(zone);
    countByRegion.set(region, (countByRegion.get(region) ?? 0) + 1);
  }
  const regions = [...countByRegion.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
  );
  const modal = regions[0]?.[0];
  const inModal = members.filter((zone) => zoneRegion(zone) === modal).sort();
  // `members` is never empty (a group exists because a zone fell into it), so both `?? ''`
  // branches are unreachable; they exist because noUncheckedIndexedAccess is on and an
  // assertion would be a runtime cost for a state the caller cannot construct.
  return inModal[0] ?? members[0] ?? '';
}

/**
 * The zones, grouped by the offsets they keep across the whole year.
 *
 * ONE ROW PER OFFSET IS REFUSED AND STAYS REFUSED (round 2, r2.09). There are 37 distinct offsets
 * in January and 16 of them split by July, so a list keyed on the offset would put New York and
 * Panama on the same row and get one of them wrong for eight months of the year. That is the
 * defect class src/domain/export/fixtures/athens-dst-week.ics exists to catch. The identity is
 * the IANA id; the offset is a property it has today.
 *
 * WHAT IS COLLAPSED IS SAFE. Two zones with the same offset in every month of the year are
 * interchangeable for everything this app computes, which is civil dates and reminder instants.
 * Measured against the platform's own list on 2026-09-06: 418 zones, 59 behaviours.
 *
 * Sorted by offset from the most negative to the most positive, then by representative name
 * within an offset. Alphabetical order by IANA id is what r2.09 reports as the defect: it reads
 * -05:00, -04:00, -04:00, -04:00, -05:00.
 *
 * @param zones every zone to consider; the caller passes `Intl.supportedValuesOf('timeZone')`.
 * @param atEpochMs the instant the OFFSET and the sort order are read at. The signature uses the
 *   whole year containing it, so the grouping itself does not move with the season.
 * @throws RangeError on an invalid IANA zone.
 */
export function groupTimeZones(zones: readonly string[], atEpochMs: EpochMs): TimeZoneGroup[] {
  const bySignature = new Map<string, string[]>();
  for (const zone of zones) {
    const signature = zoneYearSignature(zone, atEpochMs);
    const members = bySignature.get(signature);
    if (members === undefined) bySignature.set(signature, [zone]);
    else members.push(zone);
  }

  const groups: TimeZoneGroup[] = [];
  for (const members of bySignature.values()) {
    const sorted = [...members].sort();
    const prominent = PROMINENT_ZONES.find((zone) => sorted.includes(zone));
    const representative = prominent ?? fallbackRepresentative(sorted);
    groups.push({
      representative,
      members: sorted,
      offsetMinutes: zoneOffsetMinutes(representative, atEpochMs), // [min] east of UTC
      offsetLabel: utcGmtOffsetLabel(representative, atEpochMs),
    });
  }

  groups.sort(
    (a, b) =>
      a.offsetMinutes - b.offsetMinutes ||
      (a.representative < b.representative ? -1 : a.representative > b.representative ? 1 : 0),
  );
  return groups;
}

/**
 * The same rows, with `selected` promoted to representative of whichever group holds it.
 *
 * A user must see the zone they actually chose. The device's own zone is very often a collapsed
 * member rather than the row's name (Europe/Berlin sits under Europe/Paris), and a picker that
 * silently renamed it would read as having ignored the answer. Cheap by construction: it is one
 * pass over 59 rows, so it can run on every keystroke, where re-grouping 418 zones cannot.
 *
 * A `selected` that is in no group leaves every row untouched, which is the caller's cue that the
 * entry is not one of the platform's zones.
 */
export function promoteSelectedZone(
  groups: readonly TimeZoneGroup[],
  selected: string,
): TimeZoneGroup[] {
  return groups.map((group) =>
    group.representative !== selected && group.members.includes(selected)
      ? { ...group, representative: selected }
      : { ...group },
  );
}

/**
 * Whether a row answers a search, matched against EVERY member and against the offset label.
 *
 * Search reaches all 418 zones while the list shows 59, which is the whole reason the reduction
 * is safe to ship: someone typing "Amsterdam" finds their group even though the row is named
 * after Paris. The underscore in an IANA id is folded to a space, so "New York" finds
 * America/New_York, which is how a person writes the name.
 */
export function zoneGroupMatches(group: TimeZoneGroup, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  if (group.offsetLabel.toLowerCase().includes(needle)) return true;
  return group.members.some((zone) => zoneNameMatches(zone, needle));
}

/** One zone id against an already-lowercased, already-trimmed needle. */
function zoneNameMatches(zone: string, needle: string): boolean {
  const name = zone.toLowerCase();
  return name.includes(needle) || name.replace(/_/g, ' ').includes(needle);
}

/**
 * The members of `group` a search matched, excluding the row's own name, alphabetically.
 *
 * This is what lets the row identify itself to a user in a collapsed city: with "berlin" typed,
 * the Europe/Paris row can say so. Empty for an empty query, because with nothing typed there is
 * no particular member to name.
 */
export function matchedZoneMembers(group: TimeZoneGroup, query: string): readonly string[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  return group.members.filter(
    (zone) => zone !== group.representative && zoneNameMatches(zone, needle),
  );
}
