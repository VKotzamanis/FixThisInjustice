// src/app/buildInfo.ts
//
// Audit E06: the commit and build date are read at runtime from dist/build-info.json
// (build/buildInfo.ts), not compiled into the hashed main chunk, so a commit that changes no
// code ships no new bundle and no update banner. The file is not precached: offline, or on the
// dev server, the read fails and the footer omits the two lines (never a made-up value).
import { useEffect, useState } from 'react';

export interface RuntimeBuildInfo {
  commit: string;
  date: string;
}

const COMMIT_RE = /^[0-9a-f]{7}$|^local$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts only the exact shape build/buildInfo.ts writes; anything else is "unknown" (null). */
export function parseBuildInfo(raw: unknown): RuntimeBuildInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const commit: unknown = Reflect.get(raw, 'commit');
  const date: unknown = Reflect.get(raw, 'date');
  if (typeof commit !== 'string' || !COMMIT_RE.test(commit)) return null;
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null;
  return { commit, date };
}

let cached: Promise<RuntimeBuildInfo | null> | null = null;

/** One request per page life. `no-store`: the stamp must describe the build actually deployed. */
export function loadBuildInfo(): Promise<RuntimeBuildInfo | null> {
  cached ??= fetch(`${import.meta.env.BASE_URL}build-info.json`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((raw: unknown) => parseBuildInfo(raw))
    .catch(() => null);
  return cached;
}

/** Test seam: forget the cached read. */
export function resetBuildInfoForTest(): void {
  cached = null;
}

export function useBuildInfo(): RuntimeBuildInfo | null {
  const [info, setInfo] = useState<RuntimeBuildInfo | null>(null);
  useEffect(() => {
    let live = true;
    void loadBuildInfo().then((value) => {
      if (live) setInfo(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return info;
}
