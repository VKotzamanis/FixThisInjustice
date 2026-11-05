import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_DEBOUNCE_MS, defaultState, startPersistence, useAppStore } from './index';
import { STORAGE_KEY, exportJson } from './persistence';
import { EMPTY_SESSION } from './sessionMirror';
import { installFakeStorage } from './testStorage';
import { PROFILE_ID, seedState } from '../test/scheduleFixtures';
import type { AppState } from '../domain/types';

function doc(name: string): AppState {
  const s = seedState({ labels: ['A'], weekdays: [1] });
  return { ...s, profiles: { [PROFILE_ID]: { ...s.profiles[PROFILE_ID]!, displayName: name } } };
}

/** The event a browser fires in THIS document when another same-origin document writes. */
function externalWrite(key: string | null, newValue: string | null): void {
  window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
}

beforeEach(() => {
  useAppStore.setState({
    ...defaultState(),
    session: EMPTY_SESSION,
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: false, lastActionError: null },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('another instance wrote fti.v3 (B03 stopgap)', () => {
  it('re-reads the newer document and never writes its stale copy over it', () => {
    vi.useFakeTimers();
    const data = installFakeStorage({ [STORAGE_KEY]: JSON.stringify(doc('First')) });
    useAppStore.getState().hydrate();
    const stop = startPersistence();
    useAppStore.getState().setUi({ lastView: 'log' }); // queues a write of the stale copy
    const second = JSON.stringify(doc('Second'));
    data.set(STORAGE_KEY, second); // the other tab writes
    externalWrite(STORAGE_KEY, second);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2); // [ms]
    expect(data.get(STORAGE_KEY)).toBe(second);
    expect(useAppStore.getState().profiles[PROFILE_ID]?.displayName).toBe('Second');
    stop();
  });

  it('follows a wipe in the other instance without any destructive write of its own (AM-10)', () => {
    vi.useFakeTimers();
    const data = installFakeStorage({ [STORAGE_KEY]: JSON.stringify(doc('First')) });
    useAppStore.getState().hydrate();
    const stop = startPersistence();
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const wipeAll = vi.spyOn(useAppStore.getState(), 'wipeAll');
    data.delete(STORAGE_KEY);
    externalWrite(null, null); // clear() in the other instance
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2); // [ms]
    expect(data.has(STORAGE_KEY)).toBe(false);
    expect(useAppStore.getState().profiles).toEqual({});
    expect(wipeAll).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(setItem.mock.calls.some(([key]) => key === STORAGE_KEY)).toBe(false);
    stop();
  });

  it('treats newValue === null as a removal even when the key is still readable (AM-10)', () => {
    vi.useFakeTimers();
    const data = installFakeStorage({ [STORAGE_KEY]: JSON.stringify(doc('First')) });
    useAppStore.getState().hydrate();
    const stop = startPersistence();
    externalWrite(STORAGE_KEY, null); // removeItem in the other instance
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2); // [ms]
    expect(useAppStore.getState().profiles).toEqual({});
    expect(data.get(STORAGE_KEY)).toBe(JSON.stringify(doc('First')));
    stop();
  });

  it('tells the user once when a pending local save was cancelled (AM-10)', () => {
    vi.useFakeTimers();
    const data = installFakeStorage({ [STORAGE_KEY]: JSON.stringify(doc('First')) });
    useAppStore.getState().hydrate();
    const stop = startPersistence();
    useAppStore.getState().setUi({ lastView: 'log' }); // pending local save
    const second = JSON.stringify(doc('Second'));
    data.set(STORAGE_KEY, second);
    externalWrite(STORAGE_KEY, second);
    expect(useAppStore.getState().status.externalWriteReplaced).toBe(true);
    useAppStore.getState().acknowledgeExternalWrite();
    expect(useAppStore.getState().status.externalWriteReplaced).toBe(false);
    stop();
  });

  it('says nothing when no local save was pending', () => {
    vi.useFakeTimers();
    const data = installFakeStorage({ [STORAGE_KEY]: JSON.stringify(doc('First')) });
    useAppStore.getState().hydrate();
    const stop = startPersistence();
    const second = JSON.stringify(doc('Second'));
    data.set(STORAGE_KEY, second);
    externalWrite(STORAGE_KEY, second);
    expect(useAppStore.getState().status.externalWriteReplaced ?? false).toBe(false);
    stop();
  });

  it('ignores writes to other keys', () => {
    vi.useFakeTimers();
    installFakeStorage({ [STORAGE_KEY]: JSON.stringify(doc('First')) });
    useAppStore.getState().hydrate();
    const stop = startPersistence();
    externalWrite('some-other-key', null);
    expect(useAppStore.getState().profiles[PROFILE_ID]?.displayName).toBe('First');
    stop();
  });
});

describe('import (B12)', () => {
  it('resets the session slice and keeps the user on the view they imported from', () => {
    installFakeStorage();
    useAppStore.setState({
      ...doc('Here'),
      session: { ...EMPTY_SESSION, restTimer: { startedAt: 0, endsAt: 60_000, durationS: 60 }, bonusExerciseIds: ['plank'] },
      status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
    });
    useAppStore.getState().setUi({ lastView: 'settings' });
    const incoming = doc('Imported');
    const text = exportJson({ ...incoming, ui: { ...incoming.ui, lastView: 'today' } });
    expect(useAppStore.getState().importJson(text)).toEqual({ ok: true });
    const s = useAppStore.getState();
    expect(s.profiles[PROFILE_ID]?.displayName).toBe('Imported');
    expect(s.ui.lastView).toBe('settings');
    expect(s.session).toEqual(EMPTY_SESSION);
  });
});
