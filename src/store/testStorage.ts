import { vi } from 'vitest';

/**
 * Installs an in-memory Web Storage backing for one test.
 *
 * Tests never name the localStorage global: master plan §3 reserves it for
 * src/store/persistence.ts and the ESLint ban has no test exemption, so a test
 * that reached for it would be indistinguishable from application code doing the
 * same thing. Spying on Storage.prototype also makes each test hermetic — no
 * state leaks between tests through the shared jsdom store.
 *
 * vitest.config.ts sets restoreMocks: true, so the spies are removed after each
 * test without an explicit teardown.
 */
export function installFakeStorage(initial?: Record<string, string>): Map<string, string> {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => data.get(key) ?? null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
    data.set(key, value);
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
    data.delete(key);
  });
  return data;
}

/** Makes every read throw, as Safari private browsing and blocked contexts do. */
export function makeStorageUnavailable(): void {
  const throwSecurityError = (): never => {
    throw new DOMException('storage is not available in this context', 'SecurityError');
  };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(throwSecurityError);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwSecurityError);
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(throwSecurityError);
}

/** Makes every write throw the given quota error, leaving reads working. */
export function makeStorageFull(error: DOMException): void {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw error;
  });
}

/** A DOMException carrying a specific legacy numeric code. */
export function domExceptionWithCode(name: string, code: number): DOMException {
  const e = new DOMException('storage is full', name);
  Object.defineProperty(e, 'code', { value: code });
  return e;
}
