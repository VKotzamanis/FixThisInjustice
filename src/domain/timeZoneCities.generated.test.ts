// src/domain/timeZoneCities.generated.test.ts
//
// Two things are asserted here, kept apart because they fail for different reasons.
//
// 1. THE COMMITTED DATA (round 3, Task 4). Every claim the brief made must hold of what actually
//    shipped: Houston is a vendored city of America/Chicago, and no key in the map is a zone id
//    the platform does not recognise. `isValidTimeZone` (src/domain/dates.ts), not
//    `Intl.supportedValuesOf('timeZone')`, is the app's own definition of "a zone the platform
//    offers": it is what SettingsView.tsx's free-text fallback and ProfileSchema both check, and
//    it accepts every spelling a conforming engine recognises, not only the ~418-item snapshot
//    one particular ICU build returns from supportedValuesOf.
// 2. THE GENERATOR'S OWN LOGIC (scripts/generate-timezone-cities.mjs), against a small synthetic
//    fixture, never against a live fetch: a vitest run must not depend on network access, and the
//    fixture below is clearly fabricated test scaffolding, not a claimed real city-to-zone pair.
import { describe, expect, it } from 'vitest';

import { extractCities, buildModule } from '../../scripts/generate-timezone-cities.mjs';
import type { RawTimeZoneRecord } from '../../scripts/generate-timezone-cities.mjs';
import { isValidTimeZone } from './dates';
import { TIMEZONE_CITIES } from './timeZoneCities.generated';

describe('the vendored city data', () => {
  it('carries Houston under America/Chicago, the exact fact the brief was verified against', () => {
    expect(TIMEZONE_CITIES['America/Chicago']).toContain('Houston');
  });

  it('keys every entry with a zone id the platform actually offers', () => {
    for (const zone of Object.keys(TIMEZONE_CITIES)) {
      expect(isValidTimeZone(zone)).toBe(true);
    }
  });

  it('never carries an empty city list or an empty city name', () => {
    for (const [zone, cities] of Object.entries(TIMEZONE_CITIES)) {
      expect(cities.length, `${zone} has no cities`).toBeGreaterThan(0);
      for (const city of cities) {
        expect(city.trim(), `${zone} has an empty city name`).not.toBe('');
      }
    }
  });

  // Measured against the fetched file (see the generated module's own header for the exact
  // fetch date and upstream commit). A future regeneration that moves this count is upstream tz
  // data changing, not a bug here; update the number once you have looked at what moved.
  it('holds the measured number of zones, so an upstream change is seen rather than shipped silently', () => {
    expect(Object.keys(TIMEZONE_CITIES)).toHaveLength(315);
  });
});

describe('the generator, against a synthetic fixture (no network)', () => {
  const ZONE_BETA: RawTimeZoneRecord = {
    name: 'Zone/Beta',
    mainCities: ['Beta City', 'Second Town'],
    group: ['Zone/Beta', 'Zone/Alpha'], // deliberately wrong, to prove `group` is never read
  };
  const ZONE_ALPHA: RawTimeZoneRecord = {
    name: 'Zone/Alpha',
    mainCities: ['Alpha City'],
    group: ['Zone/Alpha'],
  };
  const FIXTURE: readonly RawTimeZoneRecord[] = [ZONE_BETA, ZONE_ALPHA];

  it('keys by each record\'s own `name`, ignoring `group` entirely', () => {
    const cities = extractCities(FIXTURE);
    expect(cities.get('Zone/Alpha')).toEqual(['Alpha City']);
    expect(cities.get('Zone/Beta')).toEqual(['Beta City', 'Second Town']);
    // Zone/Alpha's cities must not have picked up Zone/Beta's group listing.
    expect(cities.get('Zone/Alpha')).not.toContain('Beta City');
  });

  it('sorts the output by zone id regardless of source order', () => {
    const cities = extractCities(FIXTURE);
    expect([...cities.keys()]).toEqual(['Zone/Alpha', 'Zone/Beta']);
  });

  it('refuses a source with the same zone name twice, rather than picking one silently', () => {
    expect(() => extractCities([ZONE_BETA, ZONE_BETA])).toThrow(/duplicate/);
  });

  it('writes provenance into the module header: source, fetch date and licence', () => {
    const text = buildModule(extractCities(FIXTURE), {
      fetchedAt: '2026-01-01 00:00',
      commitSha: 'deadbeef',
      commitDate: '2026-01-01T00:00:00Z',
    });
    expect(text).toContain('raw-time-zones.json');
    expect(text).toContain('2026-01-01 00:00');
    expect(text).toContain('deadbeef');
    expect(text).toContain('MIT');
    expect(text).toContain('node scripts/generate-timezone-cities.mjs');
    expect(text).toContain('"Zone/Alpha": ["Alpha City"]');
  });

  it('still writes a header when the commit lookup failed, rather than fabricating one', () => {
    const text = buildModule(extractCities(FIXTURE), { fetchedAt: '2026-01-01 00:00' });
    expect(text).toContain('lookup unavailable');
    expect(text).not.toContain('undefined');
  });
});
