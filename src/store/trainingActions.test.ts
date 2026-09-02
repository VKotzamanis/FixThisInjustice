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

/**
 * The raw Web Storage backing. The `sessionStorage` global is not named here; see the note in
 * sessionMirror.test.ts and the ESLint gate it describes (P4 polish item 5). Installing the
 * fake per test also makes the mirror hermetic, which `sessionStorage.clear()` was doing.
 */
let storage: Map<string, string>;

beforeEach(() => {
  storage = installFakeStorage();
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

  it('reports the offer as unavailable once the window has closed', () => {
    // What the view asks before it draws an Undo control (P4 polish item 8). The answer must
    // be the same comparison undoDelete makes, or the control and the action disagree.
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const id = useAppStore.getState().logSet(setInput, NOW);
    useAppStore.getState().deleteSet(id);

    expect(useAppStore.getState().undoAvailable(NOW)).toBe(true);
    expect(useAppStore.getState().undoAvailable(NOW + UNDO_WINDOW_MS)).toBe(true); // exactly at
    expect(useAppStore.getState().undoAvailable(NOW + UNDO_WINDOW_MS + 100)).toBe(false); // 6.1 s
  });

  it('reports no offer when nothing is buffered', () => {
    expect(useAppStore.getState().undoAvailable(NOW)).toBe(false);
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
    expect(storage.get(SESSION_KEY)).toBeUndefined();
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

  it('refuses a bonus exercise no library and no profile knows', () => {
    // The session slice is mirrored, so an id with no Exercise behind it would be written to
    // storage and read back on every reload to render a card that can never appear.
    expect(() => {
      useAppStore.getState().addBonusExercise('not-an-exercise');
    }).toThrow(/not-an-exercise/);
    expect(useAppStore.getState().session.bonusExerciseIds).toEqual([]);
  });

  it('accepts a bonus exercise from the profile own custom library', () => {
    useAppStore
      .getState()
      .addCustomExercise('profile-1', makeExercise({ id: 'custom-1', name: 'Cable crunch' }));

    useAppStore.getState().addBonusExercise('custom-1');

    expect(useAppStore.getState().session.bonusExerciseIds).toEqual(['custom-1']);
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
    storage.set(SESSION_KEY, '{not json');
    vi.resetModules();
    const reloaded = await import('./index');
    expect(reloaded.useAppStore.getState().session).toEqual(EMPTY_SESSION);
  });
});

/**
 * A plan, a cursor and one in-progress assignment on TRAIN_DATE, with the session slice
 * populated the way an open Train view populates it.
 */
const TRAIN_DATE = '2026-03-02';

function seedOpenSession(): void {
  useAppStore.setState({
    plans: {
      'plan-1': {
        id: 'plan-1',
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
    },
    cursors: {
      'profile-1': {
        planId: 'plan-1',
        nextSessionIndex: 0,
        startedOn: TRAIN_DATE,
        completedOn: null,
      },
    },
    assignments: {
      'profile-1': [
        {
          date: TRAIN_DATE,
          sessionId: 'session-1',
          sourceIndex: 0,
          status: 'in-progress',
          startedAt: NOW, // [ms] epoch, UTC
          completedAt: null,
          skipReason: null,
        },
      ],
    },
  });
  fillSessionSlice();
}

/** The three mirrored fields, as an open session leaves them. */
function fillSessionSlice(): void {
  useAppStore.getState().setRestTimer(startRest(90, NOW)); // [s], [ms]
  useAppStore.getState().setActiveAssignmentDate(TRAIN_DATE);
  useAppStore.getState().addBonusExercise('face-pull');
}

describe('resetting the session slice', () => {
  it('completeSession clears the slice and its mirror', () => {
    seedOpenSession();

    useAppStore.getState().completeSession('profile-1', TRAIN_DATE, NOW + 3_600_000);

    expect(useAppStore.getState().assignments['profile-1']?.[0]?.status).toBe('completed');
    expect(useAppStore.getState().session).toEqual(EMPTY_SESSION);
    expect(loadSessionMirror()).toBeNull();
  });

  it('skipSession clears the slice and its mirror, exactly as completeSession does', () => {
    // A skipped session is over in every sense a completed one is: the cursor advances and no
    // further set belongs to it. Leaving the slice up left a rest timer counting down for a
    // session that no longer exists, and a training day that logged the next set against it.
    seedOpenSession();

    useAppStore.getState().skipSession('profile-1', TRAIN_DATE, 'illness');

    expect(useAppStore.getState().assignments['profile-1']?.[0]?.status).toBe('skipped');
    expect(useAppStore.getState().session).toEqual(EMPTY_SESSION);
    expect(loadSessionMirror()).toBeNull();
  });

  it('leaves the slice alone when the skip changes nothing', () => {
    // Only a transition that MOVED the document ends the session. A second skip of an
    // already-skipped day is a documented no-op, and a no-op must not reach into a slice that
    // by then belongs to whatever the user is doing next.
    seedOpenSession();
    useAppStore.getState().skipSession('profile-1', TRAIN_DATE, 'illness');
    fillSessionSlice();

    useAppStore.getState().skipSession('profile-1', TRAIN_DATE, 'illness again');

    expect(useAppStore.getState().session.activeAssignmentDate).toBe(TRAIN_DATE);
    expect(useAppStore.getState().session.restTimer).not.toBeNull();
    expect(useAppStore.getState().session.bonusExerciseIds).toEqual(['face-pull']);
  });

  it('leaves the slice alone when the transition is refused', () => {
    seedOpenSession();
    // A pause over the training day: cursor.ts refuses the transition and the document is not
    // rewritten, so the session the user still has open must survive.
    useAppStore.getState().pausePlan('profile-1', '2026-03-01', null);
    useAppStore.setState({
      assignments: { 'profile-1': [] },
      cursors: {
        'profile-1': {
          planId: 'plan-1',
          nextSessionIndex: 0,
          startedOn: TRAIN_DATE,
          completedOn: null,
        },
      },
    });
    fillSessionSlice();

    useAppStore.getState().skipSession('profile-1', TRAIN_DATE, null);

    expect(useAppStore.getState().status.lastActionError).toMatch(/paused/);
    expect(useAppStore.getState().session.activeAssignmentDate).toBe(TRAIN_DATE);
    expect(useAppStore.getState().session.restTimer).not.toBeNull();
  });

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
