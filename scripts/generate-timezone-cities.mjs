#!/usr/bin/env node
/**
 * Regenerates src/domain/timeZoneCities.generated.ts from @vvo/tzdb's raw-time-zones.json.
 *
 *   node scripts/generate-timezone-cities.mjs
 *
 * WHY THIS EXISTS (round 3, Task 4 / owner's question iii). The time-zone search matches an IANA
 * zone id against the query, and IANA names roughly 418 representative places, not cities: no
 * IANA identifier contains "houston" (Houston keeps America/Chicago). The owner's instruction was
 * not to invent city data but to use "how it's done on different apps": a maintained city-per-zone
 * dataset. @vvo/tzdb (MIT, github.com/vvo/tzdb) tracks IANA upstream and ships a `mainCities` array
 * per zone. This script vendors exactly that field so the app carries no runtime dependency and no
 * network call of its own.
 *
 * WHAT IS KEPT AND WHAT IS NOT. Each entry in the source has a `name` (the zone id tzdb considers
 * canonical for the record) and a `mainCities` array. Those two fields are kept, verbatim, keyed by
 * `name`. The source's `group` field is DELIBERATELY DROPPED: per tzdb's own README, `group` lists
 * zones that share a country and today's DST/standard offsets, which is a weaker equivalence than
 * this app's own src/domain/dates.ts groupTimeZones (same offset in EVERY month of a whole year,
 * r2.09). Spot-checking the fetched file shows `group` also links zones across DIFFERENT countries
 * that merely share today's offset (for example Africa/Bamako, Mali, appears inside
 * Africa/Abidjan's, Ivory Coast, group). Using `group` for city lookup would silently reintroduce
 * the "one row per offset" defect r2.09 already refused. A city is therefore attached only to the
 * zone id tzdb names as the record's own `name`.
 *
 * DETERMINISM. Output keys are sorted, so a re-fetch that returns the same records in a different
 * order still produces a byte-identical module. Nothing here reads a clock for the DATA itself;
 * the fetch date recorded in the header is the one piece of provenance that legitimately changes
 * between runs, and it is written from the wall clock exactly once, at the top of `main()`.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://raw.githubusercontent.com/vvo/tzdb/main/raw-time-zones.json';
const COMMITS_API_URL =
  'https://api.github.com/repos/vvo/tzdb/commits?path=raw-time-zones.json&sha=main&per_page=1';
const LICENCE = 'MIT (c) CodeAgain SASU, https://github.com/vvo/tzdb/blob/main/LICENSE';

// dirname(dirname(fileURLToPath(...))) rather than new URL('../', import.meta.url): Vite rewrites
// that literal pattern into an asset URL when a test imports this module (scripts/inline-icons.mjs
// carries the same note), and the rewritten URL is no longer a file: URL fileURLToPath can accept.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const OUT_PATH = join(ROOT, 'src', 'domain', 'timeZoneCities.generated.ts');

/**
 * `raw-time-zones.json`'s shape, narrowed to the two fields this module vendors. `group` is read
 * only so a caller of this function can see it was considered and set aside; it is never written.
 */
export function extractCities(rawEntries) {
  const byZone = new Map();
  for (const entry of rawEntries) {
    if (typeof entry.name !== 'string' || !Array.isArray(entry.mainCities)) {
      throw new Error(`unexpected record shape: ${JSON.stringify(entry)}`);
    }
    if (byZone.has(entry.name)) {
      throw new Error(`duplicate zone name in source: ${entry.name}`);
    }
    byZone.set(entry.name, entry.mainCities);
  }
  return new Map([...byZone.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** The committed module's text, built from an already-sorted zone-to-cities map. */
export function buildModule(sortedCities, provenance) {
  const lines = [];
  for (const [zone, cities] of sortedCities) {
    lines.push(`  ${JSON.stringify(zone)}: ${JSON.stringify(cities)},`);
  }
  return `/*
 * GENERATED FILE - do not edit by hand. Rebuild with: node scripts/generate-timezone-cities.mjs
 *
 * Source: ${SOURCE_URL}
 * Fetched: ${provenance.fetchedAt}${provenance.commitSha ? ` (upstream commit ${provenance.commitSha}, ${provenance.commitDate})` : ' (upstream commit lookup unavailable at generation time)'}
 * Licence: ${LICENCE}
 * Regenerate with: node scripts/generate-timezone-cities.mjs
 *
 * WHAT THIS IS. One IANA zone id (the source record's own \`name\` field, never the source's
 * \`group\` field, which the generator script's header explains) mapped to @vvo/tzdb's \`mainCities\`
 * for that zone, in the source's own order (most populous first). ${sortedCities.size} zones.
 *
 * WHAT THIS IS NOT. Not every one of the platform's ~418 zone ids has an entry: a zone with no
 * entry here has no vendored city (round 3, Task 4). Nothing here is inferred, translated or
 * corrected from this generator's own knowledge of geography; every row is copied from the source
 * verbatim, so a city missing from a real zone is a gap in the upstream data, not this file.
 */

import type { TimeZone } from './types';

export const TIMEZONE_CITIES: Readonly<Record<TimeZone, readonly string[]>> = {
${lines.join('\n')}
};
`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const fetchedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const rawEntries = await fetchJson(SOURCE_URL);
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    throw new Error('source returned no records');
  }

  let commitSha;
  let commitDate;
  try {
    const commits = await fetchJson(COMMITS_API_URL);
    commitSha = commits[0]?.sha;
    commitDate = commits[0]?.commit?.author?.date;
  } catch (err) {
    console.warn(`commit lookup failed, provenance will omit it: ${String(err)}`);
  }

  const sorted = extractCities(rawEntries);
  const text = buildModule(sorted, { fetchedAt, commitSha, commitDate });
  writeFileSync(OUT_PATH, text);
  console.log(`wrote ${OUT_PATH}: ${sorted.size} zones`);
}

// Import-without-running, exactly as scripts/inline-icons.mjs does, so a test can call
// buildModule() in-process without triggering a network fetch.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
