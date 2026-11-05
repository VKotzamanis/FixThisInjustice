import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readDurability,
  requestDurability,
  resetDurabilityForTest,
  startDurabilityWatch,
  type DurabilityApi,
} from './storageDurability';

function storage(persisted: boolean, grant: boolean): Required<DurabilityApi> {
  return {
    persisted: vi.fn(() => Promise.resolve(persisted)),
    persist: vi.fn(() => Promise.resolve(grant)),
  };
}

afterEach(() => {
  resetDurabilityForTest();
});

describe('storage durability (spec R8, audit E03/B09)', () => {
  it('reads without asking', async () => {
    const s = storage(false, true);
    await expect(readDurability(s)).resolves.toBe('best-effort');
    expect(s.persist).not.toHaveBeenCalled();
  });

  it('reports the browser answer to a request', async () => {
    await expect(requestDurability(storage(false, true))).resolves.toBe('persistent');
    await expect(requestDurability(storage(false, false))).resolves.toBe('best-effort');
  });

  it('is unsupported without a StorageManager, and when persist throws', async () => {
    await expect(readDurability(undefined)).resolves.toBe('unsupported');
    const throwing: DurabilityApi = { persist: () => Promise.reject(new TypeError('opaque')) };
    await expect(requestDurability(throwing)).resolves.toBe('unsupported');
  });

  it('asks once setup creates the first profile, never at a tab launch before it', () => {
    const s = storage(false, true);
    let ready = false;
    let hasProfile = false;
    const listeners = new Set<() => void>();
    const notify = (): void => {
      for (const l of listeners) l();
    };
    const stop = startDurabilityWatch({
      ready: () => ready,
      hasProfile: () => hasProfile,
      subscribeStore: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      standalone: () => false,
      storage: s,
    });
    expect(s.persisted).not.toHaveBeenCalled(); // nothing before the document is read
    ready = true;
    notify();
    expect(s.persisted).toHaveBeenCalledTimes(1);
    expect(s.persist).not.toHaveBeenCalled();
    hasProfile = true; // setup completed
    notify();
    notify(); // a later store change asks nothing more
    expect(s.persist).toHaveBeenCalledTimes(1);
    stop();
  });

  it('only reads at a launch whose stored document already has a profile, in a tab', () => {
    const s = storage(false, true);
    const stop = startDurabilityWatch({
      ready: () => true,
      hasProfile: () => true,
      subscribeStore: () => () => undefined,
      standalone: () => false,
      storage: s,
    });
    expect(s.persist).not.toHaveBeenCalled();
    expect(s.persisted).toHaveBeenCalledTimes(1);
    stop();
  });

  it('asks at launch when the app runs installed with a profile', () => {
    const s = storage(false, true);
    const stop = startDurabilityWatch({
      ready: () => true,
      hasProfile: () => true,
      subscribeStore: () => () => undefined,
      standalone: () => true,
      storage: s,
    });
    expect(s.persist).toHaveBeenCalledTimes(1);
    stop();
  });
});
