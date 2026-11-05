// src/store/engine.test.ts
//
// Spec R13: the store's write side on the storage engine. Everything here runs on the in-memory
// backend (src/store/db/memoryBackend.ts): no IndexedDB, no Web Storage.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import alphaFixtureJson from '../../docs/feedback/alpha-fixture.json?raw';
import { defaultState, selectState, startPersistence, useAppStore, whenPersisted } from './index';
import { appRecords, createMemoryBackend, type MemoryBackend } from './db/memoryBackend';
import { exportJson } from './persistence';
import { parseState } from '../domain/schema';
import type { AppState } from '../domain/types';

const live = new Set<() => void>();

function persist(): void {
  live.add(startPersistence());
}

function alpha(): AppState {
  const parsed = parseState(JSON.parse(alphaFixtureJson));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.state;
}

beforeEach(() => {
  useAppStore.setState({
    ...defaultState(),
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: false, lastActionError: null },
  });
});

afterEach(() => {
  for (const stop of live) stop();
  live.clear();
});

async function boot(backend: MemoryBackend): Promise<void> {
  persist();
  await useAppStore.getState().hydrate(backend);
}

describe('hydrate (R13)', () => {
  it('a first run with nothing stored marks the store hydrated and writes nothing', async () => {
    const backend = createMemoryBackend();
    await boot(backend);
    expect(useAppStore.getState().status).toMatchObject({ hydrated: true, lastLoadError: null });
    expect(selectState(useAppStore.getState())).toEqual(defaultState());
    expect(backend.commits).toEqual([]);
  });

  it('imports fti.v3 on the first boot and leaves the key untouched (rule 7)', async () => {
    const backend = createMemoryBackend({ legacy: alphaFixtureJson });
    await boot(backend);
    expect(selectState(useAppStore.getState())).toEqual(alpha());
    expect(backend.disk.legacy).toBe(alphaFixtureJson);
    expect(backend.disk.meta?.revision).toBe(1);
  });

  it('a second boot reads the database, not fti.v3', async () => {
    const backend = createMemoryBackend({ legacy: alphaFixtureJson });
    await boot(backend);
    backend.disk.legacy = '{"week":999}';
    await useAppStore.getState().hydrate(createMemoryBackend({ disk: backend.disk }));
    expect(useAppStore.getState().status.lastLoadError).toBeNull();
    expect(selectState(useAppStore.getState())).toEqual(alpha());
  });

  it('a refused fti.v3 freezes writing and keeps its text for export', async () => {
    const backend = createMemoryBackend({ legacy: '{"week":999}' });
    await boot(backend);
    expect(useAppStore.getState().status).toMatchObject({
      lastLoadError: 'missing or non-integer schemaVersion',
      lastLoadRaw: '{"week":999}',
      loadFailure: 'invalid',
      hydrated: true,
    });
    useAppStore.getState().setUi({ lastView: 'train' });
    await whenPersisted();
    expect(backend.commits).toEqual([]);
  });

  it('an unreachable database is reported as unavailable, not as invalid data (B17)', async () => {
    const backend = createMemoryBackend();
    backend.makeUnavailable();
    await boot(backend);
    expect(useAppStore.getState().status.loadFailure).toBe('unavailable');
  });

  it('lists a quarantined record and loads the rest (B01)', async () => {
    const doc = JSON.parse(alphaFixtureJson) as { sets: Record<string, Record<string, unknown>> };
    const id = Object.keys(doc.sets)[0] ?? '';
    doc.sets[id] = { ...doc.sets[id], rpe: 7.3 };
    await boot(createMemoryBackend({ legacy: JSON.stringify(doc) }));
    expect(useAppStore.getState().status.lastLoadError).toBeNull();
    expect(useAppStore.getState().status.quarantine).toEqual([expect.objectContaining({ store: 'sets', key: id })]);
    expect(useAppStore.getState().sets[id]).toBeUndefined();
  });
});

describe('per-action writes (R13, B08)', () => {
  it('one action is one commit of exactly the records it changed, with no debounce', async () => {
    const backend = createMemoryBackend({ legacy: alphaFixtureJson });
    await boot(backend);
    useAppStore.getState().setUi({ lastView: 'log' });
    await whenPersisted();
    expect(backend.commits).toHaveLength(2); // the import, then this action
    expect(backend.commits[1]).toEqual({
      clear: false,
      puts: [{ store: 'app', key: 'ui', value: expect.objectContaining({ lastView: 'log' }) as unknown }],
      deletes: [],
    });
  });

  it('a status-only change writes nothing', async () => {
    const backend = createMemoryBackend();
    await boot(backend);
    useAppStore.setState({ status: { ...useAppStore.getState().status, lastActionError: 'refused' } });
    await whenPersisted();
    expect(backend.commits).toEqual([]);
  });

  it('writes nothing before hydrate', async () => {
    persist();
    useAppStore.getState().setUi({ lastView: 'log' });
    await whenPersisted();
    expect(useAppStore.getState().status.hydrated).toBe(false);
  });

  it('a quota failure is reported, kept, and written by the next commit', async () => {
    const backend = createMemoryBackend();
    await boot(backend);
    backend.failNextCommit('quota');
    useAppStore.getState().setUi({ lastView: 'log' });
    await whenPersisted();
    expect(useAppStore.getState().status.lastSaveError?.reason).toBe('quota');
    expect(appRecords(backend.disk).get('ui')).toBeUndefined();
    useAppStore.getState().retrySave();
    await whenPersisted();
    expect(useAppStore.getState().status.lastSaveError).toBeNull();
    expect(appRecords(backend.disk).get('ui')).toMatchObject({ lastView: 'log' });
  });
});

describe('wipe and replace (R13, B14)', () => {
  it('wipeAll empties every store in one commit and then removes fti.v3', async () => {
    const backend = createMemoryBackend({ legacy: alphaFixtureJson });
    await boot(backend);
    useAppStore.getState().wipeAll();
    await whenPersisted();
    expect(backend.commits.at(-1)).toEqual({ clear: true, puts: [], deletes: [] });
    expect(backend.disk.legacy).toBeNull();
    // A later boot does not import anything again: the meta record survived the clear.
    await useAppStore.getState().hydrate(createMemoryBackend({ disk: backend.disk }));
    expect(selectState(useAppStore.getState())).toEqual(defaultState());
  });

  it('an import replaces every record and reopens writing after a refused load', async () => {
    const backend = createMemoryBackend({ legacy: '{"week":999}' });
    await boot(backend);
    expect(useAppStore.getState().importJson(exportJson(alpha()))).toEqual({ ok: true });
    await whenPersisted();
    expect(backend.commits).toHaveLength(1);
    expect(backend.commits[0]?.clear).toBe(true);
    await useAppStore.getState().hydrate(createMemoryBackend({ disk: backend.disk }));
    expect(selectState(useAppStore.getState())).toEqual(alpha());
    // fti.v3 is left as it was: only a wipe removes it.
    expect(backend.disk.legacy).toBe('{"week":999}');
  });
});

describe('another instance wrote first (B03)', () => {
  it('a stale commit writes nothing and this instance reloads the newer records', async () => {
    const a = createMemoryBackend({ legacy: alphaFixtureJson });
    await boot(a);
    // Instance B commits behind A's back (its announce is not delivered: the worst case).
    const b = createMemoryBackend({ disk: a.disk });
    const ui = appRecords(a.disk).get('ui') as Record<string, unknown>;
    expect(await b.commit({ clear: false, puts: [{ store: 'app', key: 'ui', value: { ...ui, lastView: 'atlas' } }], deletes: [] }, 1, 3)).toEqual({ ok: true, revision: 2 });
    useAppStore.getState().setUi({ lastView: 'log' });
    await whenPersisted();
    expect(appRecords(a.disk).get('ui')).toMatchObject({ lastView: 'atlas' });
    expect(useAppStore.getState().ui.lastView).toBe('atlas');
  });

  it('an announced revision makes this instance reload before it writes', async () => {
    const a = createMemoryBackend({ legacy: alphaFixtureJson });
    await boot(a);
    const b = createMemoryBackend({ disk: a.disk });
    const ui = appRecords(a.disk).get('ui') as Record<string, unknown>;
    await b.commit({ clear: false, puts: [{ store: 'app', key: 'ui', value: { ...ui, lastView: 'atlas' } }], deletes: [] }, 1, 3);
    b.announce(2);
    await whenPersisted();
    expect(useAppStore.getState().ui.lastView).toBe('atlas');
  });

  it('tells this window once that its unsaved change was replaced (reuses the P1 AM-10 notice)', async () => {
    const a = createMemoryBackend({ legacy: alphaFixtureJson });
    await boot(a);
    const b = createMemoryBackend({ disk: a.disk });
    const ui = appRecords(a.disk).get('ui') as Record<string, unknown>;
    await b.commit({ clear: false, puts: [{ store: 'app', key: 'ui', value: { ...ui, lastView: 'atlas' } }], deletes: [] }, 1, 3);
    useAppStore.getState().setUi({ lastView: 'log' });
    await whenPersisted();
    expect(useAppStore.getState().status.externalWriteReplaced).toBe(true);
    useAppStore.getState().acknowledgeExternalWrite();
    expect(useAppStore.getState().status.externalWriteReplaced).toBe(false);
  });

  it('says nothing when the other window changed records and this one had nothing pending', async () => {
    const a = createMemoryBackend({ legacy: alphaFixtureJson });
    await boot(a);
    const b = createMemoryBackend({ disk: a.disk });
    await b.commit({ clear: false, puts: [], deletes: [] }, 1, 3);
    b.announce(2);
    await whenPersisted();
    expect(useAppStore.getState().status.externalWriteReplaced ?? false).toBe(false);
  });
});

describe('the rollback mirror (amendment AM-P2-1)', () => {
  function hide(): void {
    window.dispatchEvent(new Event('pagehide'));
  }

  it('writes the whole document to fti.v3 on pagehide, in the shape a pre-P2 build parses', async () => {
    const backend = createMemoryBackend({ legacy: alphaFixtureJson });
    await boot(backend);
    useAppStore.getState().setUi({ lastView: 'log' });
    await whenPersisted();
    hide();
    const parsed = parseState(JSON.parse(backend.disk.legacy ?? 'null'));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state).toEqual(selectState(useAppStore.getState()));
    expect(parsed.state.ui.lastView).toBe('log');
  });

  it('writes on visibilitychange to hidden, and not while visible', async () => {
    const backend = createMemoryBackend({ legacy: alphaFixtureJson });
    await boot(backend);
    useAppStore.getState().setUi({ lastView: 'log' });
    await whenPersisted();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(backend.disk.legacy).toBe(alphaFixtureJson); // jsdom's page is visible
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
    }
    expect(backend.disk.legacy).toContain('"lastView":"log"');
  });

  it('leaves fti.v3 alone when nothing changed since it was read', async () => {
    const backend = createMemoryBackend({ legacy: alphaFixtureJson });
    await boot(backend);
    hide();
    expect(backend.disk.legacy).toBe(alphaFixtureJson);
  });

  it('never writes over a document the store refused to read', async () => {
    const backend = createMemoryBackend({ legacy: '{"week":999}' });
    await boot(backend);
    useAppStore.getState().setUi({ lastView: 'log' });
    hide();
    expect(backend.disk.legacy).toBe('{"week":999}');
  });

  it('is not imported again: the next boot reads the records', async () => {
    const backend = createMemoryBackend({ legacy: alphaFixtureJson });
    await boot(backend);
    useAppStore.getState().setUi({ lastView: 'log' });
    await whenPersisted();
    hide();
    const commits = backend.commits.length;
    await useAppStore.getState().hydrate(createMemoryBackend({ disk: backend.disk }));
    expect(backend.commits).toHaveLength(commits);
    expect(useAppStore.getState().ui.lastView).toBe('log');
  });
});
