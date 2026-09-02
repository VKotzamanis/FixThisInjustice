import { describe, expect, it } from 'vitest';
import { instantOf } from '../dates';
import { buildIcs } from './ics';
import type { IcsEvent } from './ics';
// ?raw rather than node:fs, the convention the reminders and cursor suites already use:
// tsconfig.app.json pins `types` to the vite client, so node's typings are not in scope.
import athensDstWeek from './fixtures/athens-dst-week.ics?raw';

/**
 * Instants in this suite are written as Date.UTC(...) or derived through instantOf, never
 * from a wall-clock literal: the process zone must not reach any assertion. The two TZ= runs
 * recorded in the P7 Task 5 report exist to prove that, and this file is the thing they run.
 */
const NOW = Date.UTC(2026, 8, 1, 12, 0, 0); // [ms] 2026-09-01T12:00:00Z
const ATHENS = 'Europe/Athens';

function event(patch: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: '2026-09-07-s-push@fixthisinjustice',
    date: '2026-09-07',
    startTime: '06:00',
    durationS: 4200, // [s] 1 h 10 min
    summary: 'Push',
    description: 'Session 5 of 48',
    alarmLeadMinutes: 120, // [min] before the start
    ...patch,
  };
}

/** RFC 5545 section 3.1 unfolding: a CRLF followed by one SPACE or HTAB is removed. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, '').split('\r\n').slice(0, -1);
}

/** A JS string holds UTF-16 code units; a fold that split a code point leaves a lone surrogate. */
function hasLoneSurrogate(line: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(line);
}

describe('buildIcs', () => {
  it('terminates every line with CRLF and none with a bare LF', () => {
    const out = buildIcs([event()], ATHENS, NOW);
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(out.split('\r\n').length).toBe(out.split('\n').length);
  });

  it('wraps the events in a single VCALENDAR with a PRODID', () => {
    const out = buildIcs([event(), event({ uid: 'b@x' })], ATHENS, NOW);
    expect(out.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(out).toContain('PRODID:-//FixThisInjustice//Training companion//EN');
    expect(out).toContain('VERSION:2.0');
  });

  it('stamps the export in UTC, which is the only form DTSTAMP admits', () => {
    const out = buildIcs([event()], ATHENS, NOW);
    expect(out).toContain('DTSTAMP:20260901T120000Z');
  });

  it('writes DTSTART as local time in the profile zone, tagged with that zone', () => {
    const lines = unfold(buildIcs([event()], ATHENS, NOW));
    expect(lines).toContain('DTSTART;TZID=Europe/Athens:20260907T060000');
    // No instant anywhere in the file is written in the UTC form except DTSTAMP, and every
    // event start carries the zone. A bare local DTSTART is legal inside VTIMEZONE only.
    expect(lines.filter((l) => /^DTSTART:\d{8}T\d{6}Z$/.test(l))).toHaveLength(0);
    expect(lines.filter((l) => l.startsWith('DTSTART;'))).toHaveLength(1);
  });

  it('labels the summer offset DAYLIGHT even when the window shows only that offset', () => {
    // 2026-09-07 in Athens is EEST throughout, so the window observes one offset. The label
    // still has to come from the zone's own year, not from what this window happened to see.
    const lines = unfold(buildIcs([event()], ATHENS, NOW));
    expect(lines).toContain('BEGIN:DAYLIGHT');
    expect(lines).toContain('TZOFFSETTO:+0300');
    expect(lines).not.toContain('BEGIN:STANDARD');
  });

  it('states the length as a DURATION rather than a second local-time value', () => {
    const out = buildIcs([event()], ATHENS, NOW);
    expect(unfold(out)).toContain('DURATION:PT1H10M');
    expect(out).not.toContain('DTEND');
  });

  it('writes a whole-minute duration without an hour part and a whole hour without minutes', () => {
    expect(unfold(buildIcs([event({ durationS: 2700 })], ATHENS, NOW))).toContain('DURATION:PT45M');
    expect(unfold(buildIcs([event({ durationS: 3600 })], ATHENS, NOW))).toContain('DURATION:PT1H');
  });

  it('attaches a DISPLAY alarm two hours before the start', () => {
    const out = buildIcs([event()], ATHENS, NOW);
    expect(out).toContain('BEGIN:VALARM');
    expect(out).toMatch(/BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT2H\r\nDESCRIPTION:/);
  });

  it('expresses a lead time that is not a whole hour in minutes', () => {
    expect(buildIcs([event({ alarmLeadMinutes: 90 })], ATHENS, NOW)).toContain('TRIGGER:-PT90M');
  });

  it('escapes the characters RFC 5545 reserves in TEXT values', () => {
    const out = buildIcs([event({ summary: 'Legs; heavy, back\\front\nsecond line' })], ATHENS, NOW);
    expect(unfold(out)).toContain('SUMMARY:Legs\\; heavy\\, back\\\\front\\nsecond line');
  });

  it('folds every content line at 75 octets with a leading space', () => {
    const out = buildIcs([event({ description: 'x'.repeat(300) })], ATHENS, NOW);
    const lines = out.split('\r\n').filter((l) => l !== '');
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(lines.some((l) => l.startsWith(' '))).toBe(true);
  });

  it('folds on octets without splitting a multi-byte character at the boundary', () => {
    // "SUMMARY:" is 8 octets; 66 more take the line to 74, one octet short of the limit, so
    // the next character straddles it. U+00B1 is 2 octets, U+4E2D 3, U+1D400 4 (a surrogate
    // pair in UTF-16): each in turn has to move whole to the continuation line.
    for (const wide of ['\u00b1', '\u4e2d', '\u{1d400}']) {
      const summary = `${'x'.repeat(66)}${wide}${'y'.repeat(80)}${wide}`;
      const out = buildIcs([event({ summary })], ATHENS, NOW);
      for (const line of out.split('\r\n')) {
        expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
        expect(hasLoneSurrogate(line)).toBe(false);
      }
      expect(unfold(out)).toContain(`SUMMARY:${summary}`);
    }
  });

  it('declares the VTIMEZONE its own TZID references, as section 3.2.19 requires', () => {
    const out = unfold(buildIcs([event()], ATHENS, NOW));
    expect(out).toContain('BEGIN:VTIMEZONE');
    expect(out).toContain('TZID:Europe/Athens');
    expect(out.indexOf('BEGIN:VTIMEZONE')).toBeLessThan(out.indexOf('BEGIN:VEVENT'));
  });

  it('carries the transition when the export window crosses the end of Athens summer time', () => {
    const week: IcsEvent[] = [
      event({ uid: 'a@x', date: '2026-10-19', startTime: '09:00' }),
      event({ uid: 'b@x', date: '2026-10-26', startTime: '09:00' }),
    ];
    const out = unfold(buildIcs(week, ATHENS, NOW));

    // The wall-clock reading is the same on both sides; the instant is one hour further apart
    // than seven whole days, which is what a DST-naive export would get wrong.
    expect(out).toContain('DTSTART;TZID=Europe/Athens:20261019T090000');
    expect(out).toContain('DTSTART;TZID=Europe/Athens:20261026T090000');
    const shiftMs =
      instantOf('2026-10-26', '09:00', ATHENS) - instantOf('2026-10-19', '09:00', ATHENS);
    expect(shiftMs).toBe(7 * 86_400_000 + 3_600_000);

    // EU summer time ends at 01:00 UTC on the last Sunday of October: 04:00 EEST becomes
    // 03:00 EET. The sub-component's DTSTART is the local reading in the OFFSETFROM offset.
    expect(out).toContain('BEGIN:STANDARD');
    expect(out).toContain('DTSTART:20261025T040000');
    expect(out).toContain('TZOFFSETFROM:+0300');
    expect(out).toContain('TZOFFSETTO:+0200');
  });

  it('matches the stored Athens DST-week calendar byte for byte', () => {
    // Guards the golden itself: a checkout that normalised the fixture's line endings would
    // otherwise weaken this test silently instead of failing it.
    expect(athensDstWeek).toContain('\r\n');
    const week: IcsEvent[] = [
      { uid: 'w1@fixthisinjustice', date: '2026-10-19', startTime: '09:00', durationS: 4200, summary: 'Push', description: 'Session 1 of 4', alarmLeadMinutes: 120 },
      { uid: 'w2@fixthisinjustice', date: '2026-10-21', startTime: '09:00', durationS: 4200, summary: 'Pull', description: 'Session 2 of 4', alarmLeadMinutes: 120 },
      { uid: 'w3@fixthisinjustice', date: '2026-10-23', startTime: '09:00', durationS: 4200, summary: 'Legs', description: 'Session 3 of 4', alarmLeadMinutes: 120 },
      { uid: 'w4@fixthisinjustice', date: '2026-10-26', startTime: '09:00', durationS: 4200, summary: 'Push', description: 'Session 4 of 4', alarmLeadMinutes: 120 },
    ];
    expect(buildIcs(week, ATHENS, NOW)).toBe(athensDstWeek);
  });

  it('produces a calendar with no VEVENT and no VTIMEZONE for no events', () => {
    const out = buildIcs([], ATHENS, NOW);
    expect(out).toContain('BEGIN:VCALENDAR');
    expect(out).not.toContain('BEGIN:VEVENT');
    expect(out).not.toContain('BEGIN:VTIMEZONE');
  });

  it('rejects a zone it cannot resolve rather than exporting the process zone', () => {
    expect(() => buildIcs([event()], 'Not/AZone', NOW)).toThrow(RangeError);
  });
});
