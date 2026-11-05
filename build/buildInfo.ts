// build/buildInfo.ts
//
// Audit E06: the build stamp (commit, date) lives in its own file, dist/build-info.json, never in
// a hashed chunk. The precache globs (vite.config.ts injectManifest.globPatterns) do not match
// .json, so the file is not in sw.js's manifest: a rebuild that changes only the stamp leaves
// every precached byte, and therefore sw.js, unchanged, and installed apps see no update.
import type { Plugin } from 'vite';

/** The published path, relative to the site base. src/app/buildInfo.ts reads it. */
export const BUILD_INFO_FILE = 'build-info.json';

export interface BuildInfo {
  /** First 7 characters of GITHUB_SHA, or 'local' outside CI. */
  commit: string;
  /** The build's calendar date in UTC, YYYY-MM-DD. */
  date: string;
}

/**
 * YYYY-MM-DD in UTC, computed by hand: eslint bans toISOString() outside src/domain/dates.ts
 * (it shifts civil dates); a build has no civil zone, so the hand form is byte-identical.
 */
export function utcDate(at: Date): string {
  return [
    at.getUTCFullYear(),
    String(at.getUTCMonth() + 1).padStart(2, '0'),
    String(at.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function buildInfo(env: Readonly<Record<string, string | undefined>>, at: Date): BuildInfo {
  return { commit: env.GITHUB_SHA?.slice(0, 7) ?? 'local', date: utcDate(at) };
}

/** Emits dist/build-info.json on `vite build` only; the dev server has no file (footer omits the lines). */
export function buildInfoPlugin(): Plugin {
  return {
    name: 'fti-build-info',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: BUILD_INFO_FILE,
        source: `${JSON.stringify(buildInfo(process.env, new Date()))}\n`,
      });
    },
  };
}
