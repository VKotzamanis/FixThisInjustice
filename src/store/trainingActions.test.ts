// src/store/trainingActions.test.ts
//
// The P4 wiring: what the store adds on top of the pure transformers in ./training. The rules
// about what a log action does to the document are tested there; what is tested here is the
// undo window, the session slice and its sessionStorage mirror, and that the P1 persistence
// gate still covers every new action.
//
// The plan's Task 6 gives the wiring no test file of its own (it lists training.test.ts and
// sessionMirror.test.ts only). It is separated from training.test.ts rather than folded into
// it because that file is deliberately store-free and React-free, and from index.test.ts
// because that file is P1's; the deviation is recorded in the task report.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  SAVE_DEBOUNCE_MS,
  defaultState,
  selectState,
  startPersistence,
  useAppStore,
} from './index';
import { STORAGE_KEY } from './persistence';
import { EMPTY_SESSION, SESSION_KEY, loadSessionMirror } from './sessionMirror';
import { UNDO_WINDOW_MS } from './training';
import { installFakeStorage } from './testStorage';
import { useExerciseHistory, useRestTimer, useTodaysSets } from './selectors';
import { makeExercise, makeProfile } from '../test/fixtures';
import { parseState } from '../domain/schema';
import { startRest } from '../domain/training/restTimer';
import type { AppState, LoggedSet } from '../domain/types';

const NOW = Date.UTC(2026, 2, 2, 18, 30, 0); // [ms] epoch, UTC

const setInput: Omit<LoggedSet, 'id' | 'loggedAt'> = {
  profileId: 'profile-1',
  assignmentDate: '2026-03-02',
  sessionId: 's1',
  exerciseId: 'barbell-bench-press',
  setNumber: 1,
  isBonus: false,
  loadKg: 60, // [kg]
  enteredUnit: 'metric',
  reps: 8, // [repetitions]
  durationS: null, // [s]
  rpe: null,
};

/** The document as it would be stored and read back. */
function storedDocument(): AppState {
  return JSON.parse(JSON.stringify(selectState(useAppStore.getState()))) as AppState;
}

function expectStorable(): void {
  const round = parseState(storedDocument());
  expect(round.ok ? null : round.error).toBeNull();
}

const liveTeardowns = new Set<() => void>();

function startPersistenceForTest(): void {
  const stop = startPersistence();
  liveTeardowns.add(stop);
}

beforeEach(() => {
  sessionStorage.clear();
  const profile = makeProfile();
  useAppStore.setState({
    ...defaultState(),
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    // Seeded the way createProfile seeds them, so the actions under test are the only writers.
    pauses: { [profile.id]: [] },
    assignments: { [profile.id]: [] },
    bodyMass: { [profile.id]: [] },
    hydration: { [profile.id]: [] },
    intake: { [profile.id]: [] },
    weeklyReviews: { [profile.id]: [] },
    status: {
      lastSaveError: null,
      lastLoadError: null,
      lastLoadRaw: null,
      hydrated: true,
      lastActionError: null,
    },
    session: EMPTY_SESSION,
  });
});

afterEach(() => {
  for (const stop of [...liveTeardowns]) {
    liveTeardowns.delete(stop);
    stop();
  }
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('logSet', () => {
  it('returns the generated id and stores a document that still parses', () => {
    const id = useAppStore.getState().logSet(setInput, NOW);
    expect(id).toMatch(/\S/);
    expect(useAppStore.getState().sets[id]).toEqual({ ...setInput, id, loggedAt: NOW });
    expectStorable();
  });

  it('mints a fresh id per set rather than overwriting', () => {
    const first = useAppStore.getState().logSet(setInput, NOW);
    const second = useAppStore.getState().logSet({ ...setInput, setNumber: 2 }, NOW + 60_000);
    expect(second).not.toBe(first);
    expect(Object.keys(useAppStore.getState().sets)).toHaveLength(2);
    expectStorable();
  });

  it('leaves the document untouched when the schema refuses the set', () => {
    const before = useAppStore.getState().sets;
    expect(() => useAppStore.getState().logSet({ ...setInput, rpe: 7.3 }, NOW)).toThrow(/rpe/i);
    expect(useAppStore.getState().sets).toBe(before);
  });
});

describe('deleteSet / undoDelete', () => {
  it('restores the identical record inside the undo window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const id = useAppStore.getState().logSet(setInput, NOW);
    const original = useAppStore.getState().sets[id];
    useAppStore.getState().deleteSet(id);
    expect(useAppStore.getState().sets[id]).toBeUndefined();
    expect(useAppStore.getState().session.undo?.expiresAt).toBe(NOW + UNDO_WINDOW_MS);

    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1); // [ms] still inside the window
    useAppStore.getState().undoDelete();
    expect(useAppStore.getState().sets[id]).toEqual(original);
    expect(useAppStore.getState().session.undo).toBeNull();
    expectStorable();
  });

  it('drops the buffer without restoring once the window has closed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const id = useAppStore.getState().logSet(setInput, NOW);
    useAppStore.getState().deleteSet(id);

    vi.advanceTimersByTime(UNDO_WINDOW_MS + 1); // [ms] past the window
    useAppStore.getState().undoDelete();
    expect(useAppStore.getState().sets[id]).toBeUndefined();
    expect(useAppStore.getState().session.undo).toBeNull();
    expectStorable();
  });

  it('mints no buffer for an unknown id', () => {
    useAppStore.getState().deleteSet('nope');
    expect(useAppStore.getState().session.undo).toBeNull();
  });

  it('is a no-op when nothing is buffered', () => {
    const before = useAppStore.getState().sets;
    useAppStore.getState().undoDelete();
    expect(useAppStore.getState().sets).toBe(before);
  });

  it('never mirrors the buffered set', () => {
    const id = useAppStore.getState().logSet(setInput, NOW);
    useAppStore.getState().deleteSet(id);
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe('the session slice', () => {
  it('mirrors the rest timer and persists nothing', () => {
    vi.useFakeTimers();
    const data = installFakeStorage();
    startPersistenceForTest();
    const timer = startRest(90, NOW); // [s], [ms]

    useAppStore.getState().setRestTimer(timer);
    expect(useAppStore.getState().session.restTimer).toEqual(timer);
    expect(loadSessionMirror()?.restTimer).toEqual(timer);

    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    // The slice is not part of the document: a rest timer must not make the store write.
    expect(data.get(STORAGE_KEY)).toBeUndefined();
  });

  it('clears the mirrored timer with null', () => {
    useAppStore.getState().setRestTimer(startRest(90, NOW));
    useAppStore.getState().setRestTimer(null);
    expect(loadSessionMirror()?.restTimer).toBeNull();
  });

  it('adds each bonus exercise once, in order', () => {
    useAppStore.getState().addBonusExercise('face-pull');
    useAppStore.getState().addBonusExercise('calf-raise');
    useAppStore.getState().addBonusExercise('face-pull');
    expect(useAppStore.getState().session.bonusExerciseIds).toEqual(['face-pull', 'calf-raise']);
    expect(loadSessionMirror()?.bonusExerciseIds).toEqual(['face-pull', 'calf-raise']);
  });

  it('survives a reload: a new store reads the mirror at creation', async () => {
    const timer = startRest(120, NOW); // [s], [ms]
    useAppStore.getState().setRestTimer(timer);
    useAppStore.getState().addBonusExercise('face-pull');

    // A reload is a fresh module registry over the same sessionStorage.
    vi.resetModules();
    const reloaded = await import('./index');
    expect(reloaded.useAppStore).not.toBe(useAppStore);
    const session = reloaded.useAppStore.getState().session;
    expect(session.restTimer).toEqual(timer);
    expect(session.bonusExerciseIds).toEqual(['face-pull']);
    // The buffer is per-tab-session state that must not come back from storage.
    expect(session.undo).toBeNull();
  });

  it('starts empty when the mirror is corrupt', async () => {
    sessionStorage.setItem(SESSION_KEY, '{not json');
    vi.resetModules();
    const reloaded = await import('./index');
    expect(reloaded.useAppStore.getState().session).toEqual(EMPTY_SESSION);
  });
});

describe('resetting the session slice', () => {
  it('wipeAll clears the slice and its mirror', () => {
    installFakeStorage();
    useAppStore.getState().setRestTimer(startRest(90, NOW));
    useAppStore.getState().addBonusExercise('face-pull');

    useAppStore.getState().wipeAll();
    expect(useAppStore.getState().session).toEqual(EMPTY_SESSION);
    expect(loadSessionMirror()).toBeNull();
  });

  it('setPlan clears the slice and its mirror', () => {
    useAppStore.getState().setRestTimer(startRest(90, NOW));
    useAppStore.getState().addBonusExercise('face-pull');

    useAppStore.getState().setPlan(
      'profile-1',
      {
        id: 'plan-seed',
        version: 1,
        name: 'Upper / lower',
        sessionsPerWeek: 4, // [sessions/week]
        weeks: 12, // [weeks]
        sessions: [
          {
            id: 'session-1',
            ordinal: 1,
            name: 'Upper A',
            kind: 'lift',
            label: 'Upper',
            exercises: [],
          },
        ],
        blocks: [],
      },
      '2026-03-02',
    );

    expect(useAppStore.getState().session).toEqual(EMPTY_SESSION);
    expect(loadSessionMirror()).toBeNull();
    expectStorable();
  });
});

describe('the persistence gate', () => {
  it('writes a logged set once the store has hydrated', () => {
    vi.useFakeTimers();
    const data = installFakeStorage();
    startPersistenceForTest();

    useAppStore.getState().logSet(setInput, NOW);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);

    const written = data.get(STORAGE_KEY);
    expect(written).toBeDefined();
    const round = parseState(JSON.parse(written ?? 'null') as unknown);
    expect(round.ok ? null : round.error).toBeNull();
  });

  it('refuses to write anything the P4 actions change before hydrate', () => {
    vi.useFakeTimers();
    const data = installFakeStorage();
    useAppStore.setState({ status: { ...useAppStore.getState().status, hydrated: false } });
    startPersistenceForTest();

    useAppStore.getState().logSet(setInput, NOW);
    useAppStore.getState().addHydration('profile-1', '2026-03-02', 250, NOW); // [mL], [ms]
    useAppStore.getState().logBodyMass(
      {
        profileId: 'profile-1',
        date: '2026-03-02',
        massKg: 95, // [kg]
        enteredUnit: 'metric',
        bodyFatPct: null, // [%]
      },
      NOW,
    );
    useAppStore.getState().addCustomExercise('profile-1', makeExercise({ id: 'custom-1' }));
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 4);

    expect(data.get(STORAGE_KEY)).toBeUndefined();
  });

  it('refuses to write after a failed load, which froze the stored document', () => {
    vi.useFakeTimers();
    const data = installFakeStorage({ [STORAGE_KEY]: '{"schemaVersion":3,"corrupt":true}' });
    useAppStore.setState({
      status: { ...useAppStore.getState().status, lastLoadError: 'sets: invalid' },
    });
    startPersistenceForTest();

    useAppStore.getState().logSet(setInput, NOW);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 4);

    expect(data.get(STORAGE_KEY)).toBe('{"schemaVersion":3,"corrupt":true}');
  });
});

describe('the P4 selectors', () => {
  it('useExerciseHistory returns the active profile s sets in programme order', () => {
    useAppStore.getState().logSet({ ...setInput, assignmentDate: '2026-03-09' }, NOW);
    useAppStore.getState().logSet({ ...setInput, setNumber: 2 }, NOW);
    useAppStore.getState().logSet({ ...setInput, exerciseId: 'lat-pulldown' }, NOW);
    useAppStore.getState().logSet({ ...setInput, profileId: 'profile-1' }, NOW);

    const { result } = renderHook(() => useExerciseHistory('barbell-bench-press'));
    expect(result.current.map((s) => [s.assignmentDate, s.setNumber])).toEqual([
      ['2026-03-02', 1],
      ['2026-03-02', 2],
      ['2026-03-09', 1],
    ]);
  });

  it('useTodaysSets follows the active assignment date', () => {
    useAppStore.getState().logSet(setInput, NOW);
    useAppStore.getState().logSet({ ...setInput, assignmentDate: '2026-03-09' }, NOW);
    useAppStore.setState({
      session: { ...useAppStore.getState().session, activeAssignmentDate: '2026-03-09' },
    });

    const { result } = renderHook(() => useTodaysSets());
    expect(result.current.map((s) => s.assignmentDate)).toEqual(['2026-03-09']);
  });

  it('useRestTimer reads the session slice', () => {
    const timer = startRest(90, NOW);
    const { result } = renderHook(() => useRestTimer());
    expect(result.current).toBeNull();
    // act() so the subscription's re-render is flushed before the assertion reads it.
    act(() => {
      useAppStore.getState().setRestTimer(timer);
    });
    expect(result.current).toEqual(timer);
  });
});
