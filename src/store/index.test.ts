import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  SAVE_DEBOUNCE_MS,
  defaultState,
  flushSave,
  selectState,
  startPersistence,
  useAppStore,
} from './index';
import { STORAGE_KEY, exportJson, readRaw } from './persistence';
import { useActiveProfile, useHydrated, useLoadError, useSaveError } from './selectors';
import { installFakeStorage, makeStorageFull } from './testStorage';
import type { AppState, Profile } from '../domain/types';

function profile(id: string): Profile {
  return {
    id,
    displayName: 'Test',
    timezone: 'Europe/Athens',
    units: 'metric',
    createdAt: 1_756_000_000_000,
    body: {
      sex: 'female',
      birthYear: 1995,
      heightCm: 170, // [cm]
      baselineMassKg: 70, // [kg]
      baselineAt: '2026-09-01',
      baselineBodyFatPct: null,
    },
    activity: 'moderate',
    experience: 'novice',
    equipment: 'full-gym',
    equipmentSteps: {
      barbellKg: 2.5, // [kg] total on the bar
      dumbbellPairKg: 5, // [kg] per pair
      stackKg: 5, // [kg] per pin
      hasMicroPlates: false,
      microPlateKg: 0.5, // [kg] total for a micro-plate pair
    },
    goal: { kind: 'fat-loss', targetMassKg: null, targetBodyFatPct: null, targetDate: null },
    supplements: { creatine: false },
    hydration: { dailyTargetML: 2200, cupSizeML: 250, weighInOptIn: false }, // [mL]
    readiness: { screenedAt: null, flagged: false },
  };
}

beforeEach(() => {
  useAppStore.setState({
    ...defaultState(),
    status: {
      lastSaveError: null,
      lastLoadError: null,
      lastLoadRaw: null,
      hydrated: false,
      lastActionError: null,
    },
  });
});

/**
 * Teardowns for every persistence subscription a test started.
 *
 * startPersistence() attaches a store subscription and two window listeners
 * that outlive the test that created them. A test that fails before its
 * stop() would leave that subscription writing on behalf of every later test
 * in the file, turning one failure into a cascade whose cause is invisible.
 * The registry makes the teardown unconditional; stop() stays in the tests
 * that assert on what it does, and is idempotent through the guard below.
 */
const liveTeardowns = new Set<() => void>();

function startPersistenceForTest(): () => void {
  const stop = startPersistence();
  const teardown = (): void => {
    if (!liveTeardowns.has(teardown)) return;
    liveTeardowns.delete(teardown);
    stop();
  };
  liveTeardowns.add(teardown);
  return teardown;
}

afterEach(() => {
  for (const teardown of [...liveTeardowns]) teardown();
  vi.useRealTimers();
  // Undo any per-test visibilityState stub, restoring the jsdom prototype getter.
  Reflect.deleteProperty(document, 'visibilityState');
});

/**
 * jsdom's visibilityState is a prototype getter with no setter, so a test that
 * needs a hidden page shadows it with an own property and afterEach removes it.
 */
function setVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
}

describe('the persisted surface', () => {
  it('carries exactly the fields of a default document, and no store-only field', () => {
    const picked = selectState(useAppStore.getState());
    expect(Object.keys(picked).sort()).toEqual(Object.keys(defaultState()).sort());
    expect(picked).toEqual(defaultState());
    expect(Object.keys(picked)).not.toContain('status');
  });
});

describe('hydrate', () => {
  it('marks the store hydrated on a first run with no stored document', () => {
    installFakeStorage();
    useAppStore.getState().hydrate();
    expect(useAppStore.getState().status.hydrated).toBe(true);
    expect(useAppStore.getState().status.lastLoadError).toBeNull();
    expect(selectState(useAppStore.getState())).toEqual(defaultState());
  });

  it('loads a valid stored document', () => {
    const stored = { ...defaultState(), activeProfileId: 'p', profiles: { p: profile('p') } };
    installFakeStorage({ [STORAGE_KEY]: JSON.stringify(stored) });
    useAppStore.getState().hydrate();
    expect(useAppStore.getState().activeProfileId).toBe('p');
  });

  it('keeps the last known-good state and reports the error when the document is invalid', () => {
    installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });
    useAppStore.getState().hydrate();
    expect(selectState(useAppStore.getState())).toEqual(defaultState());
    expect(useAppStore.getState().status.lastLoadError).toBe('missing or non-integer schemaVersion');
    expect(useAppStore.getState().status.hydrated).toBe(true);
    // The corrupt document is never overwritten: the user can still export it.
    expect(readRaw()).toBe('{"week":999}');
  });

  it('snapshots the unreadable document into status.lastLoadRaw', () => {
    installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });
    useAppStore.getState().hydrate();
    expect(useAppStore.getState().status.lastLoadRaw).toBe('{"week":999}');
  });

  it('leaves lastLoadRaw null when the load succeeded', () => {
    installFakeStorage({ [STORAGE_KEY]: JSON.stringify(defaultState()) });
    useAppStore.getState().hydrate();
    expect(useAppStore.getState().status.lastLoadRaw).toBeNull();
  });

  it('does not write a just-hydrated valid document straight back', () => {
    vi.useFakeTimers();
    const stored = { ...defaultState(), activeProfileId: 'p', profiles: { p: profile('p') } };
    installFakeStorage({ [STORAGE_KEY]: JSON.stringify(stored) });
    const stop = startPersistenceForTest();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    useAppStore.getState().hydrate();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 4);

    // Re-serialising what was just read is a write that can only fail, never help.
    expect(setItem).not.toHaveBeenCalled();
    stop();
  });
});

describe('persistence after a failed hydrate', () => {
  it('never overwrites a document that failed to load', () => {
    vi.useFakeTimers();
    installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });
    const stop = startPersistenceForTest();

    useAppStore.getState().hydrate();
    expect(useAppStore.getState().status.lastLoadError).not.toBeNull();

    useAppStore.getState().setUi({ lastView: 'train' });
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);

    // The user's only copy of the unreadable data survives the edit.
    expect(readRaw()).toBe('{"week":999}');
    stop();
  });

  it('drops a write that was already queued when the load failed', () => {
    vi.useFakeTimers();
    const data = installFakeStorage({ [STORAGE_KEY]: JSON.stringify(defaultState()) });
    const stop = startPersistenceForTest();
    useAppStore.getState().hydrate();

    useAppStore.getState().setUi({ lastView: 'train' });
    // The document turns unreadable — another tab, a partial write — and the
    // next load rejects it while a write is still sitting in the debounce.
    data.set(STORAGE_KEY, '{"week":999}');
    useAppStore.getState().hydrate();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 4);

    expect(readRaw()).toBe('{"week":999}');
    stop();
  });

  it('keeps the failed document exportable after wipeAll clears storage', () => {
    installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });
    useAppStore.getState().hydrate();
    useAppStore.getState().wipeAll();

    expect(readRaw()).toBeNull();
    expect(useAppStore.getState().status.lastLoadRaw).toBe('{"week":999}');
  });

  it('resumes writing once wipeAll clears the load error', () => {
    vi.useFakeTimers();
    installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });
    const stop = startPersistenceForTest();
    useAppStore.getState().hydrate();

    useAppStore.getState().wipeAll();
    expect(useAppStore.getState().status.lastLoadError).toBeNull();

    useAppStore.getState().setUi({ lastView: 'train' });
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(readRaw()).toContain('"lastView":"train"');
    stop();
  });

  it('resumes writing once an import replaces the unreadable document', () => {
    vi.useFakeTimers();
    installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });
    const stop = startPersistenceForTest();
    useAppStore.getState().hydrate();

    const text = exportJson({ ...defaultState(), activeProfileId: null });
    expect(useAppStore.getState().importJson(text)).toEqual({ ok: true });
    expect(useAppStore.getState().status.lastLoadError).toBeNull();

    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(readRaw()).not.toBe('{"week":999}');
    stop();
  });
});

describe('import and export', () => {
  it('exports the current state and imports it back through the store', () => {
    installFakeStorage();
    const next = { ...defaultState(), activeProfileId: 'p', profiles: { p: profile('p') } };
    useAppStore.getState().replaceState(next);

    const text = useAppStore.getState().exportJson();
    expect(text).toBe(exportJson(next));

    useAppStore.getState().replaceState(defaultState());
    expect(useAppStore.getState().importJson(text)).toEqual({ ok: true });
    expect(useAppStore.getState().activeProfileId).toBe('p');
  });

  it('refuses an invalid import and leaves the state untouched', () => {
    installFakeStorage();
    useAppStore.getState().replaceState({
      ...defaultState(),
      activeProfileId: 'p',
      profiles: { p: profile('p') },
    });
    const before = selectState(useAppStore.getState());

    const result = useAppStore.getState().importJson('{"week":999}');

    expect(result).toEqual({ ok: false, error: 'missing or non-integer schemaVersion' });
    expect(selectState(useAppStore.getState())).toEqual(before);
    // Reference identity, not just deep equality: nothing was rebuilt either.
    expect(useAppStore.getState().profiles).toBe(before.profiles);
  });

  it('routes an accepted import through replaceState, so there is one write path', () => {
    installFakeStorage();
    // Detached with bind(): the recorder has to call the original action, not
    // the stand-in about to be installed over it.
    const real = useAppStore.getState().replaceState.bind(null);
    const seen: AppState[] = [];
    try {
      useAppStore.setState({
        replaceState: (next: AppState) => {
          seen.push(next);
          real(next);
        },
      });
      const text = exportJson({ ...defaultState(), activeProfileId: null });
      expect(useAppStore.getState().importJson(text)).toEqual({ ok: true });
      expect(seen).toHaveLength(1);
    } finally {
      useAppStore.setState({ replaceState: real });
    }
  });

  it('clears a load error when replaceState installs a document', () => {
    installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });
    useAppStore.getState().hydrate();
    expect(useAppStore.getState().status.lastLoadError).not.toBeNull();

    useAppStore.getState().replaceState(defaultState());
    expect(useAppStore.getState().status.lastLoadError).toBeNull();
  });
});

describe('setUi', () => {
  it('patches the named preferences and leaves the rest of the document alone', () => {
    const before = selectState(useAppStore.getState());
    useAppStore.getState().setUi({ lastView: 'train', bootSeen: true });
    const ui = useAppStore.getState().ui;
    expect(ui.lastView).toBe('train');
    expect(ui.bootSeen).toBe(true);
    // Untouched preferences survive the shallow patch.
    expect(ui.accent).toBe(before.ui.accent);
    expect(ui.density).toBe(before.ui.density);
    // Nothing outside ui moved.
    expect(useAppStore.getState().profiles).toBe(before.profiles);
  });
});

describe('wipeAll', () => {
  it('clears storage and resets to the default document', () => {
    const data = installFakeStorage({ [STORAGE_KEY]: 'anything', 'other.owner': 'keep me' });
    useAppStore.getState().replaceState({
      ...defaultState(),
      activeProfileId: 'p',
      profiles: { p: profile('p') },
    });
    useAppStore.getState().wipeAll();
    expect(data.has(STORAGE_KEY)).toBe(false);
    // Only fti.v3 is this module's to clear; the asset store is cleared by the
    // caller in P7.
    expect(data.get('other.owner')).toBe('keep me');
    expect(selectState(useAppStore.getState())).toEqual(defaultState());
  });

  it('leaves no document behind after the debounce window, until the next change', () => {
    vi.useFakeTimers();
    installFakeStorage({ [STORAGE_KEY]: JSON.stringify(defaultState()) });
    const stop = startPersistenceForTest();
    useAppStore.getState().hydrate();

    // A write is already queued when the user clears: it must not land either.
    useAppStore.getState().setUi({ lastView: 'today' });
    useAppStore.getState().wipeAll();
    vi.advanceTimersByTime(1000);
    expect(readRaw()).toBeNull();

    // The next user-driven change starts persistence again from a clean slate.
    useAppStore.getState().setUi({ lastView: 'train' });
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(readRaw()).toContain('"lastView":"train"');
    stop();
  });
});

describe('persistence subscription', () => {
  it('coalesces a burst of changes into one write', () => {
    vi.useFakeTimers();
    installFakeStorage();
    useAppStore.getState().hydrate();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const stop = startPersistenceForTest();

    for (let i = 0; i < 3; i += 1) {
      useAppStore.getState().setUi({ lastView: `view-${String(i)}` });
    }
    expect(setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0]?.[0]).toBe(STORAGE_KEY);
    // The one write carries the last value of the burst, not the first.
    expect(setItem.mock.calls[0]?.[1]).toContain('"lastView":"view-2"');

    stop();
  });

  it('does not write when only status changed', () => {
    vi.useFakeTimers();
    installFakeStorage();
    useAppStore.getState().hydrate();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const stop = startPersistenceForTest();

    useAppStore.getState().reportSaveResult({ ok: false, reason: 'quota', error: 'full' });
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 4);
    expect(setItem).not.toHaveBeenCalled();

    stop();
  });

  it('flushes on pagehide instead of losing the last burst', () => {
    vi.useFakeTimers();
    installFakeStorage();
    useAppStore.getState().hydrate();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const stop = startPersistenceForTest();

    useAppStore.getState().replaceState({ ...defaultState(), activeProfileId: null });
    window.dispatchEvent(new Event('pagehide'));
    expect(setItem).toHaveBeenCalledTimes(1);

    // The timer must not fire a second write for the same change.
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 4);
    expect(setItem).toHaveBeenCalledTimes(1);

    stop();
  });

  it('records a quota failure in status while keeping the change in memory', () => {
    vi.useFakeTimers();
    installFakeStorage();
    useAppStore.getState().hydrate();
    makeStorageFull(new DOMException('full', 'QuotaExceededError'));
    const stop = startPersistenceForTest();

    useAppStore.getState().setUi({ lastView: 'train' });
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);

    // The reason drives the copy; the message is kept for the banner's detail
    // and for diagnosis, so the status carries both.
    expect(useAppStore.getState().status.lastSaveError).toEqual({
      reason: 'quota',
      error: 'full',
    });
    // Finding H3: the write failed, so the UI must say so — but the edit itself
    // is not silently rolled back underneath the user.
    expect(useAppStore.getState().ui.lastView).toBe('train');

    stop();
  });

  it('clears the save error once a write succeeds again', () => {
    vi.useFakeTimers();
    installFakeStorage();
    useAppStore.getState().hydrate();
    const stop = startPersistenceForTest();

    useAppStore.getState().reportSaveResult({ ok: false, reason: 'quota', error: 'full' });
    expect(useAppStore.getState().status.lastSaveError).toEqual({
      reason: 'quota',
      error: 'full',
    });

    useAppStore.getState().setUi({ lastView: 'today' });
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(useAppStore.getState().status.lastSaveError).toBeNull();

    stop();
  });

  it('flushes on visibilitychange once the page is hidden', () => {
    vi.useFakeTimers();
    installFakeStorage();
    useAppStore.getState().hydrate();
    const stop = startPersistenceForTest();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    useAppStore.getState().setUi({ lastView: 'train' });

    // A visible page is not a discard; the debounce still owns the write.
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(setItem).not.toHaveBeenCalled();

    // Android discards a backgrounded tab without ever firing pagehide.
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(setItem).toHaveBeenCalledTimes(1);

    // And the timer must not repeat the same write afterwards.
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 4);
    expect(setItem).toHaveBeenCalledTimes(1);
    stop();
  });

  it('flushSave is a no-op when nothing is pending', () => {
    installFakeStorage();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    flushSave();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('stops writing once the subscription is torn down', () => {
    vi.useFakeTimers();
    installFakeStorage();
    useAppStore.getState().hydrate();
    const stop = startPersistenceForTest();
    stop();

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    useAppStore.getState().replaceState({ ...defaultState(), activeProfileId: null });
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 4);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('retrySave', () => {
  it('writes immediately and reports the outcome through the same status field', () => {
    vi.useFakeTimers();
    const data = installFakeStorage();
    useAppStore.getState().hydrate();
    startPersistenceForTest();

    makeStorageFull(new DOMException('full', 'QuotaExceededError'));
    useAppStore.getState().setUi({ lastView: 'train' });
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(useAppStore.getState().status.lastSaveError).not.toBeNull();

    // Storage recovers — the user emptied it in another tab — and the retry is
    // the user's way of asking for the write again without editing anything.
    installFakeStorage(Object.fromEntries(data));
    useAppStore.getState().retrySave();

    expect(useAppStore.getState().status.lastSaveError).toBeNull();
    expect(readRaw()).toContain('"lastView":"train"');
  });

  it('refuses to write over a document that failed to load', () => {
    installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });
    useAppStore.getState().hydrate();
    expect(useAppStore.getState().status.lastLoadError).not.toBeNull();

    useAppStore.getState().retrySave();

    // The same freeze the debounced path obeys: a retry is a user action, but
    // not a decision to replace an unread document.
    expect(readRaw()).toBe('{"week":999}');
  });
});

/**
 * A pair, in this order. The first test deliberately leaks a subscription; the
 * second proves the afterEach teardown caught it. Without that teardown the
 * second test sees the leaked writer and fails, which is the regression this
 * guards: one failing test silently corrupting every test after it.
 */
describe('a leaked persistence subscription cannot reach the next test', () => {
  it('starts a subscription and never stops it', () => {
    installFakeStorage();
    useAppStore.getState().hydrate();
    startPersistenceForTest();
    expect(useAppStore.getState().status.hydrated).toBe(true);
  });

  it('sees no write from the subscription the previous test left running', () => {
    vi.useFakeTimers();
    installFakeStorage();
    useAppStore.setState({ status: { ...useAppStore.getState().status, hydrated: true } });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    useAppStore.getState().setUi({ lastView: 'leak-probe' });
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 4);

    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('selectors', () => {
  it('returns null when no profile is active', () => {
    const { result } = renderHook(() => useActiveProfile());
    expect(result.current).toBeNull();
  });

  it('returns the active profile object itself, so the snapshot is stable', () => {
    const p = profile('p');
    useAppStore.getState().replaceState({
      ...defaultState(),
      activeProfileId: 'p',
      profiles: { p },
    });
    const { result, rerender } = renderHook(() => useActiveProfile());
    expect(result.current).toBe(p);
    rerender();
    expect(result.current).toBe(p);
  });

  it('returns null when activeProfileId points at a missing profile', () => {
    useAppStore.getState().replaceState({ ...defaultState(), activeProfileId: 'ghost' });
    const { result } = renderHook(() => useActiveProfile());
    expect(result.current).toBeNull();
  });

  it('exposes hydration and error status', () => {
    useAppStore.setState({
      status: {
        lastSaveError: { reason: 'quota', error: 'full' },
        lastLoadError: 'bad document',
        lastLoadRaw: '{"week":999}',
        hydrated: true,
        lastActionError: null,
      },
    });
    expect(renderHook(() => useHydrated()).result.current).toBe(true);
    expect(renderHook(() => useSaveError()).result.current).toEqual({
      reason: 'quota',
      error: 'full',
    });
    expect(renderHook(() => useLoadError()).result.current).toBe('bad document');
  });
});
