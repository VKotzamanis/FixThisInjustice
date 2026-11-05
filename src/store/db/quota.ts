// src/store/db/quota.ts
//
// Audit B05: warn before the origin's storage quota is reached, not after the first refused
// write. The estimate covers the whole origin (records, the clip, other projects on the same
// GitHub Pages origin), which is the quota a write actually competes for.

/**
 * [dimensionless] usage/quota at which the app warns. An engineering bound, not a measured
 * threshold: it leaves a fifth of the quota for the export and the next commits.
 */
export const STORAGE_WARN_RATIO = 0.8;

export interface StorageReading {
  usageBytes: number; // [bytes]
  quotaBytes: number; // [bytes]
}

/** The browser's estimate, or null when the API is missing, throws, or reports no quota. */
export async function readStorageEstimate(): Promise<StorageReading | null> {
  const storage: unknown = typeof navigator === 'undefined' ? undefined : Reflect.get(navigator, 'storage');
  const estimate: unknown = typeof storage === 'object' && storage !== null ? Reflect.get(storage, 'estimate') : undefined;
  if (typeof estimate !== 'function') return null;
  try {
    const result: unknown = await (estimate as () => Promise<unknown>).call(storage);
    const usage: unknown = typeof result === 'object' && result !== null ? Reflect.get(result, 'usage') : undefined;
    const quota: unknown = typeof result === 'object' && result !== null ? Reflect.get(result, 'quota') : undefined;
    if (typeof usage !== 'number' || typeof quota !== 'number' || !(quota > 0)) return null;
    return { usageBytes: usage, quotaBytes: quota };
  } catch {
    return null;
  }
}

export function nearQuota(reading: StorageReading | null): boolean {
  return reading !== null && reading.usageBytes / reading.quotaBytes >= STORAGE_WARN_RATIO;
}
