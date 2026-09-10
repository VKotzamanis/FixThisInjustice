import { describe, expect, it } from 'vitest';
import {
  groupTimeZones,
  matchedZoneCities,
  matchedZoneMembers,
  promoteSelectedZone,
  utcGmtOffsetLabel,
  zoneGroupMatches,
  zoneOffsetMinutes,
  zoneYearSignature,
} from './dates';
import type { TimeZoneGroup } from './dates';

/**
 * The time-zone picker's grouping and ordering (round 2 claim r2.09).
 *
 * THE CLOCK IS A CONSTANT IN EVERY TEST HERE, passed as an argument rather than read from
 * `Date.now()`. Half the northern hemisphere changes offset twice a year, so a suite that read
 * the wall clock would assert one set of offsets from March to October and a different set from
 * November to February, and would go red on a date nobody changed any code on. Two instants are
 * used, six months apart, and both are stated in UTC.
 *
 * Its own file rather than an appendix to dates.test.ts: that suite is about civil-date
 * arithmetic and runs the same fixtures under four host zones, and none of what is asserted here
 * depends on the host zone at all.
 */

/** 2026-01-15T12:00:00Z. Northern winter: New York is EST, Sydney is on daylight time. */
const JANUARY: number = Date.UTC(2026, 0, 15, 12, 0, 0);
/** 2026-07-15T12:00:00Z. Northern summer: New York is EDT, Sydney is on standard time. */
const JULY: number = Date.UTC(2026, 6, 15, 12, 0, 0);

/**
 * The platform's own list, which is what the wizard passes. `Intl.supportedValuesOf` is ES2022;
 * the two assertions that quote a measured COUNT are gated on it being present and complete, so
 * this file still runs on an engine with a trimmed ICU rather than failing for the wrong reason.
 */
const PLATFORM_ZONES: readonly string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

/** A small, hand-listed set, so the ordering tests do not depend on the platform's ICU build. */
const SAMPLE: readonly string[] = [
  'Asia/Calcutta', // +05:30 all year, one of the offsets an hour loop cannot produce
  'Asia/Katmandu', // +05:45
  'America/New_York', // -05:00 in January, -04:00 in July
  'America/Panama', // -05:00 all year
  'America/St_Johns', // -03:30 in January
  'Europe/Paris',
  'Europe/Berlin',
  'Pacific/Kiritimati', // +14:00, the eastern end of the 25-hour span
  'Pacific/Midway', // -11:00, the western end
  'UTC',
];

function groupFor(groups: readonly TimeZoneGroup[], zone: string): TimeZoneGroup | undefined {
  return groups.find((group) => group.members.includes(zone));
}

describe('offsets and labels', () => {
  it('reports the offset east-positive, in minutes', () => {
    expect(zoneOffsetMinutes('UTC', JANUARY)).toBe(0);
    expect(zoneOffsetMinutes('Asia/Calcutta', JANUARY)).toBe(330); // [min] +05:30
    expect(zoneOffsetMinutes('America/New_York', JANUARY)).toBe(-300); // [min] -05:00, EST
    expect(zoneOffsetMinutes('America/New_York', JULY)).toBe(-240); // [min] -04:00, EDT
  });

  it('labels with both abbreviations, because Europe says GMT', () => {
    expect(utcGmtOffsetLabel('America/New_York', JANUARY)).toBe('UTC/GMT-05:00');
    expect(utcGmtOffsetLabel('America/New_York', JULY)).toBe('UTC/GMT-04:00');
    expect(utcGmtOffsetLabel('Asia/Katmandu', JANUARY)).toBe('UTC/GMT+05:45');
    expect(utcGmtOffsetLabel('America/St_Johns', JANUARY)).toBe('UTC/GMT-03:30');
  });

  it('gives UTC itself an offset rather than the bare word', () => {
    // Intl's `longOffset` renders the UTC zone as "GMT" with no digits, so a label built from
    // that string would leave one row with no offset at all. This is why the label is built from
    // the offset minutes instead.
    expect(utcGmtOffsetLabel('UTC', JANUARY)).toBe('UTC/GMT+00:00');
  });

  it('rejects a zone the runtime does not know', () => {
    expect(() => zoneOffsetMinutes('Mars/Olympus_Mons', JANUARY)).toThrow(RangeError);
    expect(() => utcGmtOffsetLabel('', JANUARY)).toThrow(RangeError);
    expect(() => zoneYearSignature('Mars/Olympus_Mons', JANUARY)).toThrow(RangeError);
  });
});

describe('the year signature', () => {
  it('reads the same for a zone whichever instant of that year it is taken at', () => {
    // The signature is a property of the year, not of the moment the picker opened, so the
    // grouping does not reshuffle itself when the clocks change.
    expect(zoneYearSignature('America/New_York', JANUARY)).toBe(
      zoneYearSignature('America/New_York', JULY),
    );
    expect(zoneYearSignature('Europe/Paris', JANUARY)).toBe(zoneYearSignature('Europe/Paris', JULY));
  });

  it('separates two zones that agree in January and differ in July', () => {
    // The whole reason one row per offset is refused. Both are UTC-05:00 in January.
    expect(zoneOffsetMinutes('America/New_York', JANUARY)).toBe(
      zoneOffsetMinutes('America/Panama', JANUARY),
    );
    expect(zoneYearSignature('America/New_York', JANUARY)).not.toBe(
      zoneYearSignature('America/Panama', JANUARY),
    );
  });

  it('carries twelve offsets, one per month', () => {
    expect(zoneYearSignature('UTC', JANUARY).split(',')).toHaveLength(12);
  });
});

describe('grouping', () => {
  it('sorts by offset from the most negative to the most positive', () => {
    // r2.09: "it Shows UTC-05 America/Cancun the below UTC-04,-04,-04, and then again UTC-05".
    // Alphabetical order by IANA id is the defect; this is the fix.
    const groups = groupTimeZones(SAMPLE, JANUARY);
    const offsets = groups.map((group) => group.offsetMinutes);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(groups[0]?.offsetMinutes).toBe(-660); // [min] Pacific/Midway, -11:00
    expect(groups[groups.length - 1]?.offsetMinutes).toBe(840); // [min] Kiritimati, +14:00
  });

  it('sorts by offset for the OTHER half of the year too, not just today', () => {
    // The same assertion at an instant six months away. Without a fixed clock this test and the
    // one above would each pass for half the year and the suite would look seasonal.
    const groups = groupTimeZones(SAMPLE, JULY);
    const offsets = groups.map((group) => group.offsetMinutes);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    // New York has moved to -04:00 and Panama has not, so the two rows have swapped places
    // relative to each other's January order while both lists stay sorted.
    const newYork = groups.findIndex((g) => g.members.includes('America/New_York'));
    const panama = groups.findIndex((g) => g.members.includes('America/Panama'));
    expect(panama).toBeLessThan(newYork);
    expect(groupTimeZones(SAMPLE, JANUARY).findIndex((g) => g.members.includes('America/Panama')))
      .toBeGreaterThan(
        groupTimeZones(SAMPLE, JANUARY).findIndex((g) => g.members.includes('America/New_York')),
      );
  });

  it('sorts by representative name within one offset', () => {
    const groups = groupTimeZones(['Europe/Paris', 'Africa/Lagos', 'Africa/Tunis'], JANUARY);
    // All three are UTC+01:00 in January; Lagos and Tunis keep it all year and Paris does not,
    // so this is two rows at the same offset, ordered by name.
    expect(groups.map((g) => g.offsetMinutes)).toEqual([60, 60]);
    expect(groups.map((g) => g.representative)).toEqual(['Africa/Lagos', 'Europe/Paris']);
  });

  it('collapses zones that keep the same offset every month', () => {
    const groups = groupTimeZones(SAMPLE, JANUARY);
    const paris = groupFor(groups, 'Europe/Paris');
    expect(paris?.members).toEqual(['Europe/Berlin', 'Europe/Paris']);
    expect(paris?.representative).toBe('Europe/Paris');
  });

  it('refuses to collapse New York into Panama', () => {
    const groups = groupTimeZones(SAMPLE, JANUARY);
    expect(groupFor(groups, 'America/New_York')).not.toBe(groupFor(groups, 'America/Panama'));
    expect(groupFor(groups, 'America/New_York')?.members).toEqual(['America/New_York']);
    expect(groupFor(groups, 'America/Panama')?.members).toEqual(['America/Panama']);
  });

  it('keeps the offsets that are not whole hours', () => {
    const groups = groupTimeZones(SAMPLE, JANUARY);
    const labels = groups.map((group) => group.offsetLabel);
    expect(labels).toContain('UTC/GMT+05:30'); // India
    expect(labels).toContain('UTC/GMT+05:45'); // Nepal
    expect(labels).toContain('UTC/GMT-03:30'); // Newfoundland
  });

  it('stores an IANA id, never an offset', () => {
    for (const group of groupTimeZones(SAMPLE, JANUARY)) {
      expect(group.members).toContain(group.representative);
      expect(group.representative).not.toMatch(/^UTC[+-]/);
    }
  });
});

describe('the representative', () => {
  it('keeps canonical and Link spellings available for prominent zones', () => {
    for (const pair of [
      ['Asia/Kolkata', 'Asia/Calcutta'],
      ['Asia/Yangon', 'Asia/Rangoon'],
      ['America/Nuuk', 'America/Godthab'],
    ]) {
      expect(pair.some((zone) => PLATFORM_ZONES.includes(zone))).toBe(true);
    }
  });

  it('names the row after a member a reader is likely to know', () => {
    const groups = groupTimeZones(['Europe/Berlin', 'Europe/Paris', 'Europe/Vaduz'], JANUARY);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.representative).toBe('Europe/Paris');
  });

  it('falls back to the region most of the group lives in, not to plain alphabetical order', () => {
    // Africa/Ceuta and Arctic/Longyearbyen both sort ahead of every Europe/ id, so a plain
    // alphabetical rule would name western Europe's row after a Spanish enclave in Morocco.
    const groups = groupTimeZones(
      ['Africa/Ceuta', 'Arctic/Longyearbyen', 'Europe/Vaduz', 'Europe/Zagreb'],
      JANUARY,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.representative).toBe('Europe/Vaduz');
  });

  it('promotes the zone the user actually chose to the head of its own row', () => {
    const groups = groupTimeZones(SAMPLE, JANUARY);
    const promoted = promoteSelectedZone(groups, 'Europe/Berlin');
    expect(groupFor(promoted, 'Europe/Berlin')?.representative).toBe('Europe/Berlin');
    // Every other row is untouched, and the member lists never change.
    expect(promoted.map((g) => g.members)).toEqual(groups.map((g) => g.members));
    expect(groupFor(promoted, 'Asia/Calcutta')?.representative).toBe('Asia/Calcutta');
  });

  it('leaves every row alone when the selection is in no group', () => {
    const groups = groupTimeZones(SAMPLE, JANUARY);
    expect(promoteSelectedZone(groups, 'Antarctica/Troll').map((g) => g.representative)).toEqual(
      groups.map((g) => g.representative),
    );
  });
});

describe('search reaches every zone the list collapsed', () => {
  const groups = groupTimeZones(SAMPLE, JANUARY);

  it('matches a member the row is not named after', () => {
    const paris = groupFor(groups, 'Europe/Paris');
    expect(paris).toBeDefined();
    if (paris === undefined) return;
    expect(paris.representative).toBe('Europe/Paris');
    expect(zoneGroupMatches(paris, 'berlin')).toBe(true);
    expect(matchedZoneMembers(paris, 'berlin')).toEqual(['Europe/Berlin']);
  });

  it('folds the underscore to a space, because that is how a person writes the name', () => {
    const newYork = groupFor(groups, 'America/New_York');
    expect(newYork).toBeDefined();
    if (newYork === undefined) return;
    expect(zoneGroupMatches(newYork, 'New York')).toBe(true);
    expect(zoneGroupMatches(newYork, 'new_york')).toBe(true);
  });

  it('matches the offset label as well as the name', () => {
    const nepal = groupFor(groups, 'Asia/Katmandu');
    expect(nepal).toBeDefined();
    if (nepal === undefined) return;
    expect(zoneGroupMatches(nepal, '+05:45')).toBe(true);
    expect(zoneGroupMatches(nepal, 'gmt+05:45')).toBe(true);
  });

  it('shows every row for an empty query, and names no member for it', () => {
    for (const group of groups) {
      expect(zoneGroupMatches(group, '')).toBe(true);
      expect(zoneGroupMatches(group, '   ')).toBe(true);
      expect(matchedZoneMembers(group, '')).toEqual([]);
      expect(matchedZoneCities(group, '')).toEqual([]);
    }
  });

  it('never names the row after itself in the matched list', () => {
    const paris = groupFor(groups, 'Europe/Paris');
    expect(paris).toBeDefined();
    if (paris === undefined) return;
    expect(matchedZoneMembers(paris, 'paris')).toEqual([]);
    expect(zoneGroupMatches(paris, 'paris')).toBe(true);
  });

  it('matches nothing, on any row, for a string no IANA id, offset or vendored city carries', () => {
    // The domain-level half of "typing a city that is in no list surfaces nothing and says so"
    // (round 3, Task 4). The UI half is advice.timezoneNoMatch, unchanged by this brief.
    expect(groups.some((g) => zoneGroupMatches(g, 'not-a-real-place-zzz'))).toBe(false);
  });
});

/*
 * ROUND 3, TASK 4: the owner typed "houston" and nothing appeared, because no IANA identifier
 * contains it -- Houston keeps America/Chicago. src/domain/timeZoneCities.generated.ts vendors
 * @vvo/tzdb's `mainCities` for exactly this reason.
 */
describe('search also reaches a vendored city, not only an IANA id', () => {
  it('finds America/Chicago by "houston", which is a tzdb city and not an IANA id', () => {
    const groups = groupTimeZones(['America/Chicago', 'America/Denver'], JANUARY);
    const chicago = groupFor(groups, 'America/Chicago');
    expect(chicago).toBeDefined();
    if (chicago === undefined) return;
    expect(chicago.representative).toBe('America/Chicago');
    expect(zoneGroupMatches(chicago, 'houston')).toBe(true);
    expect(matchedZoneCities(chicago, 'houston')).toEqual(['Houston']);
    // Houston is a vendored CITY, not a member zone id: the existing member-matching path finds
    // nothing, which is exactly why matchedZoneCities has to exist.
    expect(matchedZoneMembers(chicago, 'houston')).toEqual([]);
  });

  it('names every vendored city a search matches, not only the first', () => {
    const groups = groupTimeZones(['America/Chicago'], JANUARY);
    const chicago = groupFor(groups, 'America/Chicago');
    expect(chicago).toBeDefined();
    if (chicago === undefined) return;
    // America/Chicago's vendored cities are Chicago, Houston, San Antonio, Dallas; "a" is in
    // Dallas and San Antonio (and Chicago, excluded below), not in Houston.
    expect(matchedZoneCities(chicago, 'a')).toEqual(['Dallas', 'San Antonio']);
  });

  it('excludes a city that only restates the row\'s own representative', () => {
    const groups = groupTimeZones(['America/Chicago'], JANUARY);
    const chicago = groupFor(groups, 'America/Chicago');
    expect(chicago).toBeDefined();
    if (chicago === undefined) return;
    // "chicago" still finds the row, through the IANA id itself; matchedZoneCities does not also
    // echo "Chicago" back, the same principle matchedZoneMembers applies to the representative.
    expect(zoneGroupMatches(chicago, 'chicago')).toBe(true);
    expect(matchedZoneCities(chicago, 'chicago')).toEqual([]);
  });

  it('is additive: nothing the old member and offset checks matched stops matching', () => {
    const groups = groupTimeZones(SAMPLE, JANUARY);
    const paris = groupFor(groups, 'Europe/Paris');
    const nepal = groupFor(groups, 'Asia/Katmandu');
    expect(paris).toBeDefined();
    expect(nepal).toBeDefined();
    if (paris === undefined || nepal === undefined) return;
    expect(zoneGroupMatches(paris, 'berlin')).toBe(true);
    expect(zoneGroupMatches(nepal, '+05:45')).toBe(true);
  });
});

/*
 * THE MEASURED RULING, run against the platform rather than quoted from the brief.
 *
 * "Show 59, search 418" was measured on this machine on 2026-09-06 and the numbers are asserted
 * here so a tz-database update that changes them is reported rather than shipped. They are
 * properties of the ICU build, not of this code, so the block is skipped where the engine has no
 * complete zone list to measure.
 */
describe.skipIf(PLATFORM_ZONES.length < 400)('the platform list, measured', () => {
  it('groups 418 zones into 59 behaviours', () => {
    expect(PLATFORM_ZONES).toHaveLength(418);
    expect(groupTimeZones(PLATFORM_ZONES, JANUARY)).toHaveLength(59);
    // Not a property of the season: the same 59 come out six months later.
    expect(groupTimeZones(PLATFORM_ZONES, JULY)).toHaveLength(59);
  });

  it('would have collapsed 37 offsets in January, 16 of which split by July', () => {
    // The measurement behind the refusal, stated as an assertion so nobody has to take it on
    // trust. This is what one row per offset would have produced.
    const january = new Map<number, string[]>();
    for (const zone of PLATFORM_ZONES) {
      const offset = zoneOffsetMinutes(zone, JANUARY); // [min]
      const bucket = january.get(offset);
      if (bucket === undefined) january.set(offset, [zone]);
      else bucket.push(zone);
    }
    expect(january.size).toBe(37);
    const split = [...january.values()].filter(
      (members) => new Set(members.map((zone) => zoneOffsetMinutes(zone, JULY))).size > 1,
    );
    expect(split).toHaveLength(16);
  });

  it('spans 25 hours, and eleven January offsets are not whole hours', () => {
    const januaryOffsets = [
      ...new Set(PLATFORM_ZONES.map((zone) => zoneOffsetMinutes(zone, JANUARY))),
    ].sort((a, b) => a - b);
    const julyOffsets = [...new Set(PLATFORM_ZONES.map((zone) => zoneOffsetMinutes(zone, JULY)))];
    const all = [...new Set([...januaryOffsets, ...julyOffsets])].sort((a, b) => a - b);
    expect(all[0]).toBe(-660); // [min] -11:00
    expect(all[all.length - 1]).toBe(840); // [min] +14:00
    // 25 hours, not 24, so a picker built from `for (h = -12; h <= 12; h++)` cannot express it.
    expect((840 - -660) / 60).toBe(25); // [h]
    expect(januaryOffsets.filter((minutes) => minutes % 60 !== 0)).toHaveLength(11);
    // Across the WHOLE year it is thirteen, not eleven: Newfoundland's -02:30 and Adelaide's
    // +10:30 are daylight offsets that no January sample can see. The brief's list of eleven is
    // the standard-time set. Nothing in this module depends on either count -- every offset is
    // read from the tz database -- but the number is pinned so the discrepancy stays visible.
    expect(all.filter((minutes) => minutes % 60 !== 0)).toHaveLength(13);
  });

  it('puts thirty-three European zones on one row, named after Paris', () => {
    const groups = groupTimeZones(PLATFORM_ZONES, JANUARY);
    const paris = groupFor(groups, 'Europe/Paris');
    expect(paris?.members).toHaveLength(33);
    expect(paris?.representative).toBe('Europe/Paris');
    expect(paris?.members).toContain('Europe/Amsterdam');
    expect(paris?.members).toContain('Africa/Ceuta');
    expect(paris?.members).toContain('Arctic/Longyearbyen');
    // And search still reaches every one of them.
    expect(paris === undefined ? false : zoneGroupMatches(paris, 'amsterdam')).toBe(true);
  });

  it('names every row after one of its own members', () => {
    for (const group of groupTimeZones(PLATFORM_ZONES, JANUARY)) {
      expect({ representative: group.representative, ok: true }).toEqual({
        representative: group.representative,
        ok: group.members.includes(group.representative),
      });
    }
  });
});
