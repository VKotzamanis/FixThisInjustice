import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_KEYS,
  LEGACY_V2_KEY,
  STORAGE_KEY,
  clearStorage,
  deleteLegacyV2,
  exportJson,
  hasAnyLegacyKey,
  hasLegacyV2,
  importJson,
  load,
  readLegacyBundle,
  readLegacyV2Raw,
  readRaw,
  save,
} from './persistence';
import { defaultState } from '../domain/schema';
import type { AppState, PushDevice } from '../domain/types';
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

  it('distinguishes a document that will not serialise from an unreachable store', () => {
    installFakeStorage();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    // A cycle is the one way JSON.stringify throws on an otherwise ordinary
    // object; the cast is the only way to hand save() a document the type
    // system already forbids.
    const circular: { self?: unknown } = {};
    circular.self = circular;

    const result = save(circular as unknown as AppState);

    expect(result.ok).toBe(false);
    // The fault is in the document, not in storage, and the two need different
    // recovery advice: "export now" is useless when the export would throw too.
    if (!result.ok) expect(result.reason).toBe('serialize');
    expect(setItem).not.toHaveBeenCalled();
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

/**
 * The push device is the one field in the document that is a CREDENTIAL rather than data:
 * `secret` is the bearer token that authorises a PUT or a DELETE against this browser's
 * Worker record. An export is a file the user mails to themselves, drops in cloud storage, or
 * hands to a support channel, so it must not carry it.
 *
 * Instants are epoch milliseconds, UTC.
 */
describe('the push device is excluded from an export', () => {
  const DEVICE: PushDevice = {
    deviceId: '0f9b1a2c-3d4e-4f50-8a1b-2c3d4e5f6071',
    secret: 'sEcReTsEcReTsEcReTsEcReTsEcReTsEcReTsEcReT1',
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: `B${'A'.repeat(85)}`, auth: 'tBHItJI5svbpez7KI4CCXg' },
    createdAt: 1_793_055_600_000, // [ms]
    lastSyncAt: 1_793_055_600_000, // [ms]
    lastSyncHash: 'f00dcafe',
  };

  function stateWithDevice(): AppState {
    return { ...defaultState(), pushDevice: DEVICE };
  }

  it('writes pushDevice as null, and never the secret', () => {
    const text = exportJson(stateWithDevice());
    expect(text).not.toContain(DEVICE.secret);
    expect(text).not.toContain(DEVICE.endpoint);
    expect((JSON.parse(text) as AppState).pushDevice).toBeNull();
  });

  it('keeps the key in the document rather than dropping it', () => {
    // Present-and-null, not absent: a reader of the file can see that the field exists and
    // was deliberately emptied, and parseState reaches its nullable branch rather than a
    // default.
    expect(exportJson(stateWithDevice())).toContain('"pushDevice": null');
  });

  it('projects the export without touching the state it was given', () => {
    const state = stateWithDevice();
    exportJson(state);
    expect(state.pushDevice).toBe(DEVICE);
  });

  it('changes nothing else about the document', () => {
    expect(JSON.parse(exportJson(stateWithDevice()))).toEqual(
      JSON.parse(exportJson({ ...defaultState(), pushDevice: null })),
    );
  });

  it('imports a document whose pushDevice is null', () => {
    const result = importJson(exportJson(stateWithDevice()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pushDevice).toBeNull();
    // The importing browser mints its own device when the user next switches reminders on.
    // Nothing else is lost.
    expect(result.state).toEqual({ ...defaultState(), pushDevice: null });
  });
});

describe('the legacy console keys', () => {
  it('names the key the legacy console wrote', () => {
    expect(LEGACY_V2_KEY).toBe('fti.console.v2');
  });

  it('reports no legacy document when the key is absent', () => {
    installFakeStorage();
    expect(hasLegacyV2()).toBe(false);
    expect(readLegacyV2Raw()).toBeNull();
  });

  it('returns the raw legacy payload without parsing it', () => {
    // Deliberately not a valid legacy document: this module must hand the text
    // over untouched and leave every judgement about it to migrateV2.
    installFakeStorage({ [LEGACY_V2_KEY]: '{"week":2,' });
    expect(hasLegacyV2()).toBe(true);
    expect(readLegacyV2Raw()).toBe('{"week":2,');
  });

  it('removes every key the legacy app owned and leaves the v3 document', () => {
    const data = installFakeStorage({
      'fti.console.v2': '{}',
      'fti.plan.v1': '{}',
      'fti.video.instance': 'https://yewtu.be',
      [STORAGE_KEY]: '{"schemaVersion":3}',
      'other.owner': 'keep me',
    });
    deleteLegacyV2();
    for (const key of LEGACY_KEYS) expect(data.get(key)).toBeUndefined();
    expect(data.get(STORAGE_KEY)).toBe('{"schemaVersion":3}');
    expect(data.get('other.owner')).toBe('keep me');
  });

  it('treats unreachable storage as no legacy document and never throws', () => {
    makeStorageUnavailable();
    expect(readLegacyV2Raw()).toBeNull();
    expect(hasLegacyV2()).toBe(false);
    expect(() => {
      deleteLegacyV2();
    }).not.toThrow();
  });
});

/*
 * Security review 10 / M5. `deleteLegacyV2` removes THREE keys, and the gate in front of it
 * used to export only `fti.console.v2`: the other two were destroyed with no copy taken. The
 * bundle is the export that matches what the delete removes.
 */
describe('readLegacyBundle', () => {
  it('is null when no legacy key is on the device', () => {
    installFakeStorage({ [STORAGE_KEY]: '{"schemaVersion":3}', 'other.owner': 'keep me' });
    expect(readLegacyBundle()).toBeNull();
  });

  it('carries all three keys, unparsed, with null for the ones that are absent', () => {
    installFakeStorage({
      [LEGACY_V2_KEY]: '{"week":2,',
      'fti.video.instance': 'https://yewtu.be',
      [STORAGE_KEY]: '{"schemaVersion":3}',
    });
    const bundle = readLegacyBundle();
    expect(bundle).not.toBeNull();
    // The raw text is carried as a STRING, never re-parsed: the v2 payload here is not even
    // valid JSON, and the backup has to survive that.
    expect(JSON.parse(bundle ?? 'null')).toEqual({
      'fti.console.v2': '{"week":2,',
      'fti.plan.v1': null,
      'fti.video.instance': 'https://yewtu.be',
    });
    // Not the v3 document, and not any other owner's key.
    expect(bundle).not.toContain('schemaVersion');
  });

  it('is a bundle even when the only legacy key is one the migration cannot use', () => {
    installFakeStorage({ 'fti.plan.v1': '{"plan":1}' });
    expect(JSON.parse(readLegacyBundle() ?? 'null')).toEqual({
      'fti.console.v2': null,
      'fti.plan.v1': '{"plan":1}',
      'fti.video.instance': null,
    });
  });

  it('is null rather than a throw when storage is unreachable', () => {
    makeStorageUnavailable();
    expect(readLegacyBundle()).toBeNull();
  });
});

describe('hasAnyLegacyKey', () => {
  /*
   * hasLegacyV2 stays keyed on fti.console.v2 because the MIGRATION needs that document. The
   * DELETE has a wider reach, so the control that offers it asks a wider question: a device
   * holding only fti.plan.v1 has legacy data to clean up and no document to import.
   */
  it('is true for a device holding only the dead prototype key', () => {
    installFakeStorage({ 'fti.plan.v1': '{}' });
    expect(hasAnyLegacyKey()).toBe(true);
    expect(hasLegacyV2()).toBe(false);
  });

  it('is true for a device holding only the video-instance preference', () => {
    installFakeStorage({ 'fti.video.instance': 'https://yewtu.be' });
    expect(hasAnyLegacyKey()).toBe(true);
    expect(hasLegacyV2()).toBe(false);
  });

  it('is false when only this app\'s own document is stored', () => {
    installFakeStorage({ [STORAGE_KEY]: '{"schemaVersion":3}' });
    expect(hasAnyLegacyKey()).toBe(false);
  });

  it('is false rather than a throw when storage is unreachable', () => {
    makeStorageUnavailable();
    expect(hasAnyLegacyKey()).toBe(false);
  });
});
