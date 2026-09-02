// src/store/sessionRestore.test.ts
//
// The reload half of the P4 timer gate (master plan section 7: "rest timer survives a
// reload"), plus the two session-slice actions P4 Task 10 adds.
//
// Run without React and with a reset module registry, because what is under test is what the
// store does at MODULE INITIALISATION: `session: initialSession()` reads the sessionStorage
// mirror once, before anything mounts. A test that imported the store at the top of the file
// would have run that line before it could seed the mirror.
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** [ms] epoch UTC. */
const NOW = Date.UTC(2026, 2, 2, 10, 0, 0);
const MIRROR_KEY = 'fti.session.v3';

beforeEach(() => {
  sessionStorage.clear();
  vi.resetModules();
});

describe('session restore', () => {
  it('restores a running rest timer from sessionStorage at module init', async () => {
    sessionStorage.setItem(
      MIRROR_KEY,
      JSON.stringify({
        restTimer: { startedAt: NOW - 30_000, endsAt: NOW + 60_000, durationS: 90 },
        activeAssignmentDate: '2026-03-02',
        bonusExerciseIds: [],
      }),
    );

    const { useAppStore } = await import('./index');

    expect(useAppStore.getState().session.restTimer).toEqual({
      startedAt: NOW - 30_000, // [ms] epoch UTC
      endsAt: NOW + 60_000, // [ms] epoch UTC
      durationS: 90, // [s]
    });
    expect(useAppStore.getState().session.activeAssignmentDate).toBe('2026-03-02');
  });

  it('restores the bonus exercises added beyond the plan', async () => {
    sessionStorage.setItem(
      MIRROR_KEY,
      JSON.stringify({
        restTimer: null,
        activeAssignmentDate: '2026-03-02',
        bonusExerciseIds: ['face-pull', 'plank'],
      }),
    );

    const { useAppStore } = await import('./index');

    expect(useAppStore.getState().session.bonusExerciseIds).toEqual(['face-pull', 'plank']);
  });

  it('starts empty when nothing was mirrored', async () => {
    const { useAppStore } = await import('./index');

    expect(useAppStore.getState().session.restTimer).toBeNull();
    expect(useAppStore.getState().session.activeAssignmentDate).toBeNull();
    expect(useAppStore.getState().session.bonusExerciseIds).toEqual([]);
  });

  it('starts empty on a mirror the schema refuses, without throwing', async () => {
    sessionStorage.setItem(MIRROR_KEY, '{"restTimer":{"startedAt":"soon"}}');

    const { useAppStore } = await import('./index');

    expect(useAppStore.getState().session.restTimer).toBeNull();
  });
});

describe('setActiveAssignmentDate', () => {
  it('records the training day and mirrors it for a reload', async () => {
    const { useAppStore } = await import('./index');

    useAppStore.getState().setActiveAssignmentDate('2026-03-02');

    expect(useAppStore.getState().session.activeAssignmentDate).toBe('2026-03-02');
    expect(sessionStorage.getItem(MIRROR_KEY)).toContain('2026-03-02');
  });

  it('clears the training day without touching the rest timer', async () => {
    const { useAppStore } = await import('./index');
    const timer = { startedAt: NOW, endsAt: NOW + 60_000, durationS: 60 }; // [ms], [ms], [s]
    useAppStore.getState().setRestTimer(timer);
    useAppStore.getState().setActiveAssignmentDate('2026-03-02');

    useAppStore.getState().setActiveAssignmentDate(null);

    expect(useAppStore.getState().session.activeAssignmentDate).toBeNull();
    expect(useAppStore.getState().session.restTimer).toEqual(timer);
  });
});

describe('clearSessionSlice', () => {
  it('drops the timer, the training day, the bonus ids and the mirror', async () => {
    const { useAppStore } = await import('./index');
    useAppStore.getState().setRestTimer({ startedAt: NOW, endsAt: NOW + 60_000, durationS: 60 });
    useAppStore.getState().setActiveAssignmentDate('2026-03-02');
    useAppStore.getState().addBonusExercise('face-pull');

    useAppStore.getState().clearSessionSlice();

    expect(useAppStore.getState().session).toEqual({
      restTimer: null,
      activeAssignmentDate: null,
      bonusExerciseIds: [],
      undo: null,
    });
    // Removed, not rewritten empty: a reload must not revive a finished session.
    expect(sessionStorage.getItem(MIRROR_KEY)).toBeNull();
  });

  it('leaves the persisted document untouched', async () => {
    const { useAppStore } = await import('./index');
    const before = useAppStore.getState().ui;

    useAppStore.getState().clearSessionSlice();

    expect(useAppStore.getState().ui).toBe(before);
  });
});
