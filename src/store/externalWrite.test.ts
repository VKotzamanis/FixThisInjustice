import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState, useAppStore } from './index';
import { exportJson } from './persistence';
import { EMPTY_SESSION } from './sessionMirror';
import { installFakeStorage } from './testStorage';
import { PROFILE_ID, seedState } from '../test/scheduleFixtures';
import type { AppState } from '../domain/types';

function doc(name: string): AppState {
  const s = seedState({ labels: ['A'], weekdays: [1] });
  return { ...s, profiles: { [PROFILE_ID]: { ...s.profiles[PROFILE_ID]!, displayName: name } } };
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
    expect(useAppStore.getState().importJson(text)).toEqual({ ok: true, quarantine: [] });
    const s = useAppStore.getState();
    expect(s.profiles[PROFILE_ID]?.displayName).toBe('Imported');
    expect(s.ui.lastView).toBe('settings');
    expect(s.session).toEqual(EMPTY_SESSION);
  });
});
