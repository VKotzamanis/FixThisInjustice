import { describe, expect, it, vi } from 'vitest';
import { STORAGE_WARN_RATIO, nearQuota, readStorageEstimate } from './quota';

describe('the storage estimate (B05)', () => {
  it('warns at or above the ratio and not below it, nor when unknown', () => {
    expect(nearQuota({ usageBytes: 80, quotaBytes: 100 })).toBe(true); // [bytes]
    expect(nearQuota({ usageBytes: 79, quotaBytes: 100 })).toBe(false);
    expect(nearQuota(null)).toBe(false);
    expect(STORAGE_WARN_RATIO).toBe(0.8);
  });

  it('reads navigator.storage.estimate, and null when it is missing or throws', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: () => Promise.resolve({ usage: 5, quota: 10 }) } });
    expect(await readStorageEstimate()).toEqual({ usageBytes: 5, quotaBytes: 10 });
    vi.stubGlobal('navigator', { storage: { estimate: () => Promise.reject(new Error('no')) } });
    expect(await readStorageEstimate()).toBeNull();
    vi.stubGlobal('navigator', {});
    expect(await readStorageEstimate()).toBeNull();
    vi.unstubAllGlobals();
  });
});
