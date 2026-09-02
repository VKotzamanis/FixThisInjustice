/**
 * RFC 5545 (https://www.rfc-editor.org/rfc/rfc5545.html) calendar export.
 *
 * A COURTESY ONLY. Master plan section 1.5 rejected calendar alarms as the reminder
 * mechanism: whether an imported VALARM fires is unverified on both phone platforms. The
 * Export view says so beside the button. The reminders the app relies on are Web Push (P5).
 *
 * Two decisions this file is answerable for.
 *
 * 1. Local time with a zone reference, not UTC. Every DTSTART is written as
 *    `DTSTART;TZID=<profile zone>:YYYYMMDDTHHMMSS` (section 3.3.5 FORM #3), built from
 *    src/domain/dates.ts against the profile's own IANA zone. `Date.prototype.toISOString`
 *    and the process zone are never consulted, which is what makes the output identical
 *    under any TZ= the tests run in. DTSTAMP is the exception and is UTC, because section
 *    3.8.7.2 says of it: "The value MUST be specified in the UTC time format."
 *
 * 2. A VTIMEZONE is emitted, not omitted. Section 3.2.19 is normative: "An individual
 *    'VTIMEZONE' calendar component MUST be specified for each unique 'TZID' parameter
 *    value specified in the iCalendar object." Apple Calendar and Google are widely said to
 *    resolve a bare IANA TZID with no VTIMEZONE present; that claim is UNVERIFIED here and
 *    the master plan does not record it, so the file does not depend on it.
 *
 *    The component is window-scoped, not a full zone history: an anchor sub-component
 *    carrying the offset in force at the first event, plus one sub-component per transition
 *    inside the exported window. No RRULE, which section 3.6.5 makes optional, because a
 *    28-day export needs no recurrence to be resolved. A sub-component is labelled DAYLIGHT
 *    when its offset is the larger of those observed in the window and STANDARD otherwise;
 *    that is a labelling convention only, since a client reads the offset from TZOFFSETTO.
 *
 * A session's length is a DURATION, never a second local-time value. DTEND;TZID would be
 * ambiguous across the autumn fall-back: a session starting inside the repeated hour would
 * have an end reading that resolves to the earlier of its two instants and so report a
 * length an hour short. DURATION is added to the resolved start and cannot do that.
 */

import { isValidTimeZone, localDateOf, localTimeOf, instantOf } from '../dates';
import type { EpochMs, LocalDate, LocalTime, Seconds, TimeZone } from '../types';

export interface IcsEvent {
  /** Globally unique and stable across exports of the same session. */
  uid: string;
  /** Civil date of the session in the profile's zone. */
  date: LocalDate;
  /** Wall-clock start in the profile's zone, "HH:mm". */
  startTime: LocalTime;
  durationS: Seconds; // [s]
  summary: string;
  description: string;
  /** [min] before the start at which the alarm fires. */
  alarmLeadMinutes: number;
}

const PRODID = '-//FixThisInjustice//Training companion//EN';
const MAX_OCTETS = 75; // [octets] RFC 5545 section 3.1
const MS_PER_MINUTE = 60_000; // [ms]
const MS_PER_HOUR = 3_600_000; // [ms]

/**
 * [d] widest export window this file will scan for zone transitions. The Export view asks
 * for 28 days; the cap exists so a caller that passed two events years apart could not turn
 * the hourly scan below into a hang.
 */
const MAX_WINDOW_DAYS = 400;

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/**
 * [min] the zone's UTC offset at an instant, east-positive (+180 for EEST).
 *
 * Derived from the two dates.ts readers rather than from a date-fns internal, so this file
 * has exactly one way of asking what the profile's zone is doing. localTimeOf resolves to
 * the minute, which is the resolution every post-1970 IANA offset uses; the instant is
 * floored to the minute first so the subtraction is exact.
 */
function offsetMinutes(instant: EpochMs, tz: TimeZone): number {
  const at = Math.floor(instant / MS_PER_MINUTE) * MS_PER_MINUTE; // [ms]
  const date = localDateOf(at, tz);
  const time = localTimeOf(at, tz);
  const wallUtc = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    Number(time.slice(0, 2)),
    Number(time.slice(3, 5)),
  ); // [ms] the civil reading placed on the UTC line
  return (wallUtc - at) / MS_PER_MINUTE;
}

/** "+0300" | "-0430" | "+0000" from an offset in minutes. */
function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${pad2(Math.floor(abs / 60))}${pad2(abs % 60)}`;
}

/** "YYYYMMDDTHHMMSS" from the UTC fields of an instant. Seconds are always zero here. */
function formatCivil(msOnUtcLine: EpochMs): string {
  const d = new Date(msOnUtcLine);
  return (
    pad4(d.getUTCFullYear()) +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    'T' +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds())
  );
}

/** "YYYYMMDDTHHMMSSZ", the only form DTSTAMP admits (section 3.8.7.2). */
function utcStamp(ms: EpochMs): string {
  return `${formatCivil(ms)}Z`;
}

/** RFC 5545 section 3.3.11 TEXT escaping. Backslash first, or the others get double-escaped. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/**
 * RFC 5545 section 3.1: "Lines of text SHOULD NOT be longer than 75 octets, excluding the
 * line break", and a long line "can be split between any two characters by inserting a CRLF
 * immediately followed by a single linear white-space character".
 *
 * The limit is octets and the split point is between CHARACTERS, so this measures UTF-8 and
 * iterates code points. The RFC names the failure this avoids: "It is possible for very
 * simple implementations to generate improperly folded lines in the middle of a UTF-8
 * multi-octet sequence." The continuation space counts against the next line's 75.
 */
function fold(line: string): string[] {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let octets = 0; // [octets] of `current`
  for (const ch of line) {
    const size = encoder.encode(ch).length; // [octets], 1..4
    if (octets + size > MAX_OCTETS) {
      out.push(current);
      current = ' ';
      octets = 1;
    }
    current += ch;
    octets += size;
  }
  out.push(current);
  return out;
}

/** "-PT2H" for a whole number of hours, "-PT90M" otherwise. */
function triggerOf(leadMinutes: number): string {
  const minutes = Math.max(0, Math.round(leadMinutes)); // [min]
  return minutes !== 0 && minutes % 60 === 0
    ? `-PT${String(minutes / 60)}H`
    : `-PT${String(minutes)}M`;
}

/** "PT1H10M" | "PT45M" | "PT1H" | "PT0S". Section 3.3.6 DURATION, always positive here. */
function durationOf(durationS: Seconds): string {
  const total = Math.max(0, Math.round(durationS)); // [s]
  if (total === 0) return 'PT0S';
  const hours = Math.floor(total / 3600); // [h]
  const minutes = Math.floor((total % 3600) / 60); // [min]
  const seconds = total % 60; // [s]
  return (
    'PT' +
    (hours > 0 ? `${String(hours)}H` : '') +
    (minutes > 0 ? `${String(minutes)}M` : '') +
    (seconds > 0 ? `${String(seconds)}S` : '')
  );
}

interface Transition {
  atMs: EpochMs; // [ms] first instant on the new offset
  fromOffset: number; // [min]
  toOffset: number; // [min]
}

/**
 * The first minute in (loMs, hiMs] whose offset differs from `loOffset`. Both bounds are
 * minute-aligned, so the bisection terminates on a whole minute.
 */
function bisectTransition(loMs: EpochMs, hiMs: EpochMs, loOffset: number, tz: TimeZone): EpochMs {
  let lo = loMs;
  let hi = hiMs;
  while (hi - lo > MS_PER_MINUTE) {
    const mid = lo + Math.floor((hi - lo) / 2 / MS_PER_MINUTE) * MS_PER_MINUTE; // [ms]
    if (mid === lo) break;
    if (offsetMinutes(mid, tz) === loOffset) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Every offset change inside [fromMs, toMs], found by an hourly scan refined to the minute. */
function transitionsIn(fromMs: EpochMs, toMs: EpochMs, tz: TimeZone): Transition[] {
  const out: Transition[] = [];
  let prevMs = fromMs;
  let prevOffset = offsetMinutes(fromMs, tz); // [min]
  for (let probe = fromMs + MS_PER_HOUR; prevMs < toMs; probe += MS_PER_HOUR) {
    const at = Math.min(probe, toMs); // [ms]
    const offset = offsetMinutes(at, tz); // [min]
    if (offset !== prevOffset) {
      out.push({
        atMs: bisectTransition(prevMs, at, prevOffset, tz),
        fromOffset: prevOffset,
        toOffset: offset,
      });
      prevOffset = offset;
    }
    prevMs = at;
  }
  return out;
}

/**
 * The VTIMEZONE the events' TZID parameter refers to, covering the exported window only.
 * `fromMs` is the first event's start and `toMs` the last event's end.
 */
function timezoneLines(tz: TimeZone, fromMs: EpochMs, toMs: EpochMs): string[] {
  const transitions = transitionsIn(fromMs, toMs, tz);
  const baseOffset = offsetMinutes(fromMs, tz); // [min]

  /*
   * The zone's standard offset, taken as the smaller of its mid-January and mid-July offsets
   * in every calendar year the window touches. A 28-day window can see one offset and still
   * be inside summer time, so the DAYLIGHT / STANDARD label cannot be decided from the window
   * alone. Sampling both solstitial months covers the southern hemisphere, where the daylight
   * offset holds in January. The label is cosmetic either way: a client takes the offset from
   * TZOFFSETTO.
   *
   * Sampling only fromMs's year is not enough: a window that opens in December and closes in
   * January (MAX_WINDOW_DAYS allows up to ~13 months) can close in a year whose Jan/Jul
   * offsets differ from the opening year's, if the zone's DST rule itself changes at the
   * boundary (a legislated change, not a transition the zone's *current* rule produces every
   * year). Sampling every year from fromMs's through toMs's covers that case; the loop runs
   * at most a small handful of times, bounded by MAX_WINDOW_DAYS.
   */
  const fromYear = Number(localDateOf(fromMs, tz).slice(0, 4));
  const toYear = Number(localDateOf(toMs, tz).slice(0, 4));
  const years: number[] = [];
  for (let y = fromYear; y <= toYear; y++) years.push(y);
  const observed = [
    ...years.flatMap((y) => [
      offsetMinutes(Date.UTC(y, 0, 15, 12), tz),
      offsetMinutes(Date.UTC(y, 6, 15, 12), tz),
    ]),
    baseOffset,
    ...transitions.map((t) => t.toOffset),
  ];
  const minOffset = Math.min(...observed); // [min]

  const lines: string[] = ['BEGIN:VTIMEZONE', `TZID:${tz}`];

  /*
   * The anchor: the offset already in force when the window opens. FROM equals TO because
   * this sub-component describes a state rather than a change.
   *
   * Its DTSTART is the first event's own local start, not the 19700101T000000 that generators
   * with an RRULE conventionally use. Without an RRULE that early anchor would assert one
   * fixed offset over half a century of a zone's history, most of which it gets wrong. Onset
   * is inclusive, so an anchor placed exactly at the earliest exported reading covers every
   * reading in the file and claims nothing outside it.
   */
  const anchorKind = baseOffset > minOffset ? 'DAYLIGHT' : 'STANDARD';
  lines.push(
    `BEGIN:${anchorKind}`,
    `DTSTART:${formatCivil(fromMs + baseOffset * MS_PER_MINUTE)}`,
    `TZOFFSETFROM:${formatOffset(baseOffset)}`,
    `TZOFFSETTO:${formatOffset(baseOffset)}`,
    `END:${anchorKind}`,
  );

  for (const t of transitions) {
    // Section 3.6.5: the sub-component's DTSTART is the effective onset as a LOCAL time, read
    // in the offset it is leaving. Shifting the instant by fromOffset puts that reading on the
    // UTC line, where formatCivil can print it.
    const kind = t.toOffset > t.fromOffset ? 'DAYLIGHT' : 'STANDARD';
    lines.push(
      `BEGIN:${kind}`,
      `DTSTART:${formatCivil(t.atMs + t.fromOffset * MS_PER_MINUTE)}`,
      `TZOFFSETFROM:${formatOffset(t.fromOffset)}`,
      `TZOFFSETTO:${formatOffset(t.toOffset)}`,
      `END:${kind}`,
    );
  }

  lines.push('END:VTIMEZONE');
  return lines;
}

/**
 * One VCALENDAR holding one VEVENT per session, all in `timeZone`.
 *
 * @param events sessions in the profile's own civil time; order is preserved.
 * @param timeZone the profile's IANA zone. Never the device zone: an export read on a
 *        second device must describe the same instants.
 * @param nowMs [ms] the export instant, written to DTSTAMP in UTC.
 * @throws RangeError on an unresolvable zone, or on a window wider than MAX_WINDOW_DAYS.
 */
export function buildIcs(
  events: readonly IcsEvent[],
  timeZone: TimeZone,
  nowMs: EpochMs,
): string {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`buildIcs: invalid IANA time zone ${JSON.stringify(timeZone)}`);
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  /*
   * The start of every session as an instant, then read back through the same zone. Going
   * out and back rather than reformatting the caller's strings is what makes instantOf's
   * validation and its gap rule load-bearing: a reading that does not exist on the clock (the
   * hour spring-forward removes) resolves to the instant just past the gap, and DTSTART then
   * names the time the calendar will actually show instead of one that never occurs.
   */
  const starts = events.map((e) => instantOf(e.date, e.startTime, timeZone)); // [ms]

  if (events.length > 0) {
    const ends = events.map((e, i) => (starts[i] ?? 0) + Math.max(0, e.durationS) * 1000); // [ms]
    const fromMs = Math.min(...starts); // [ms]
    // Ceiling to the whole minute: the scan below steps on minute-aligned instants.
    const toMs = Math.ceil(Math.max(...ends) / MS_PER_MINUTE) * MS_PER_MINUTE; // [ms]
    const spanDays = (toMs - fromMs) / 86_400_000; // [d]
    if (spanDays > MAX_WINDOW_DAYS) {
      throw new RangeError(
        `buildIcs: export window of ${spanDays.toFixed(1)} days exceeds the ${String(MAX_WINDOW_DAYS)}-day limit`,
      );
    }
    lines.push(...timezoneLines(timeZone, fromMs, toMs));
  }

  events.forEach((e, i) => {
    const startMs = starts[i] ?? 0; // [ms]
    const local = `${localDateOf(startMs, timeZone).replace(/-/g, '')}T${localTimeOf(startMs, timeZone).replace(':', '')}00`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${utcStamp(nowMs)}`,
      `DTSTART;TZID=${timeZone}:${local}`,
      `DURATION:${durationOf(e.durationS)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      `DESCRIPTION:${escapeText(e.description)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:${triggerOf(e.alarmLeadMinutes)}`,
      `DESCRIPTION:${escapeText(e.summary)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}
