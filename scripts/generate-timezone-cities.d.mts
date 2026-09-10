/*
 * Types for scripts/generate-timezone-cities.mjs, which is plain Node ESM and sits outside the
 * TypeScript project. The generator is not compiled; this file exists so
 * src/domain/timeZoneCities.generated.test.ts can import its pure builders and exercise them
 * in-process, against a synthetic fixture, without spawning the script or touching the network.
 */

/** Absolute path of the generated module (src/domain/timeZoneCities.generated.ts). */
export declare const OUT_PATH: string;

/** One @vvo/tzdb raw-time-zones.json record, narrowed to the fields this generator reads. */
export interface RawTimeZoneRecord {
  name: string;
  mainCities: readonly string[];
  /** Present in the source but deliberately never read; see the generator's own header. */
  group?: readonly string[];
}

/** Where the fetched module header's provenance line came from. */
export interface Provenance {
  fetchedAt: string;
  commitSha?: string;
  commitDate?: string;
}

/**
 * `raw-time-zones.json`'s records reduced to `name -> mainCities`, sorted by zone id. Throws on a
 * duplicate zone name or a record missing either field.
 */
export declare function extractCities(
  rawEntries: readonly RawTimeZoneRecord[],
): Map<string, readonly string[]>;

/** The committed module's text, built from an already-sorted zone-to-cities map. Writes nothing. */
export declare function buildModule(
  sortedCities: Map<string, readonly string[]>,
  provenance: Provenance,
): string;
