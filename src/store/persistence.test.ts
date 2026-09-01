import { describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEY,
  clearStorage,
  exportJson,
  importJson,
  load,
  readRaw,
  save,
} from './persistence';
import { defaultState } from '../domain/schema';
import {
  domExceptionWithCode,
  installFakeStorage,
  makeStorageFull,
  makeStorageUnavailable,
} from './testStorage';

describe('the storage key', () => {
  it('is fti.v3', () => {
    expect(STORAGE_KEY).toBe('fti.v3');
  });
});

describe('load', () => {
  it('reports an absent document on first run', () => {
    installFakeStorage();
    const result = load();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('absent');
      expect(result.raw).toBeNull();
    }
  });

  it('round-trips a saved document', () => {
    installFakeStorage();
    const s = defaultState();
    expect(save(s)).toEqual({ ok: true });
    const result = load();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toEqual(s);
  });

  it('reports non-JSON text as invalid rather than throwing', () => {
    installFakeStorage({ [STORAGE_KEY]: 'not json {' });
    const result = load();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
      expect(result.error).toContain('not JSON');
      // The unparsed text travels with the failure so the recovery UI can offer
      // it for export without a second read (master plan §3).
      expect(result.raw).toBe('not json {');
    }
  });

  it('reports a schema failure as invalid and leaves the stored text alone', () => {
    const data = installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });
    const result = load();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
      expect(result.error).toBe('missing or non-integer schemaVersion');
      expect(result.raw).toBe('{"week":999}');
    }
    // Constraint 2: reject, do not coerce, and leave the document intact so the
    // user can still export it.
    expect(data.get(STORAGE_KEY)).toBe('{"week":999}');
  });

  it('reports unavailable storage rather than throwing', () => {
    makeStorageUnavailable();
    const result = load();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unavailable');
      expect(result.raw).toBeNull();
    }
  });
});

describe('save', () => {
  it('writes the document under the one key', () => {
    const data = installFakeStorage();
    expect(save(defaultState())).toEqual({ ok: true });
    expect([...data.keys()]).toEqual([STORAGE_KEY]);
  });

  it('reports a quota failure by standard name', () => {
    installFakeStorage();
    makeStorageFull(new DOMException('full', 'QuotaExceededError'));
    expect(save(defaultState())).toEqual({ ok: false, reason: 'quota', error: 'full' });
  });

  it('reports a quota failure by legacy code 22', () => {
    installFakeStorage();
    makeStorageFull(domExceptionWithCode('SomeOtherName', 22));
    expect(save(defaultState())).toEqual({
      ok: false,
      reason: 'quota',
      error: 'storage is full',
    });
  });

  it('reports a quota failure by Firefox legacy code 1014', () => {
    installFakeStorage();
    makeStorageFull(domExceptionWithCode('NS_ERROR_DOM_QUOTA_REACHED', 1014));
    expect(save(defaultState())).toEqual({
      ok: false,
      reason: 'quota',
      error: 'storage is full',
    });
  });

  it('distinguishes an unavailable store from a full one', () => {
    makeStorageUnavailable();
    const result = save(defaultState());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unavailable');
  });

  it('never throws, whatever storage does', () => {
    installFakeStorage();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('something else entirely');
    });
    expect(() => save(defaultState())).not.toThrow();
  });
});

describe('readRaw and clearStorage', () => {
  it('returns the stored text unvalidated, for crash recovery', () => {
    installFakeStorage({ [STORAGE_KEY]: '{"broken":true}' });
    expect(readRaw()).toBe('{"broken":true}');
  });

  it('returns null rather than throwing when storage is unreachable', () => {
    makeStorageUnavailable();
    expect(readRaw()).toBeNull();
  });

  it('removes the document', () => {
    const data = installFakeStorage();
    save(defaultState());
    clearStorage();
    expect(data.has(STORAGE_KEY)).toBe(false);
  });

  it('removes only the one key, leaving other origin data alone', () => {
    // The asset store and any other owner clear themselves (master plan §3;
    // P7 clears the IndexedDB assets from the same caller).
    const data = installFakeStorage({ [STORAGE_KEY]: '{}', 'unrelated.key': 'keep me' });
    clearStorage();
    expect(data.has(STORAGE_KEY)).toBe(false);
    expect(data.get('unrelated.key')).toBe('keep me');
  });

  it('does not throw when storage is unreachable', () => {
    makeStorageUnavailable();
    expect(() => {
      clearStorage();
    }).not.toThrow();
  });
});

describe('exportJson and importJson', () => {
  it('exports pretty-printed JSON ending in a newline', () => {
    const text = exportJson(defaultState());
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "schemaVersion": 3');
  });

  it('imports what it exported', () => {
    const s = defaultState();
    const result = importJson(exportJson(s));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toEqual(s);
  });

  it('rejects malformed JSON with a message, not an exception', () => {
    const result = importJson('{');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not valid JSON');
  });

  it('rejects a valid-JSON document that fails the schema', () => {
    const result = importJson('{"week":999}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('missing or non-integer schemaVersion');
  });

  it('writes nothing when an import fails validation', () => {
    const data = installFakeStorage({ [STORAGE_KEY]: 'untouched' });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    expect(importJson('{"week":999}').ok).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(data.get(STORAGE_KEY)).toBe('untouched');
  });
});
