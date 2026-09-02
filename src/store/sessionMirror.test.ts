// src/store/sessionMirror.test.ts
//
// The mirror is the one thing between a mid-session reload and a lost rest timer, so the tests
// pin three properties: what it carries, what it deliberately does not carry (the undo buffer),
// and that every failure mode it can meet in a browser returns null instead of throwing.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_SESSION,
  SESSION_KEY,
  clearSessionMirror,
  loadSessionMirror,
  saveSessionMirror,
} from './sessionMirror';
import { startRest } from '../domain/training/restTimer';
import { makeStorageUnavailable } from './testStorage';

const T0 = Date.UTC(2026, 2, 2, 18, 0, 0); // [ms] epoch, UTC

describe('sessionMirror', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns null when nothing was written', () => {
    expect(loadSessionMirror()).toBeNull();
  });

  it('round-trips a running rest timer', () => {
    const timer = startRest(90, T0); // [s], [ms]
    saveSessionMirror({
      ...EMPTY_SESSION,
      restTimer: timer,
      activeAssignmentDate: '2026-03-02',
    });
    expect(loadSessionMirror()).toEqual({
      restTimer: timer,
      activeAssignmentDate: '2026-03-02',
      bonusExerciseIds: [],
    });
  });

  it('round-trips the bonus exercises added to this session', () => {
    saveSessionMirror({ ...EMPTY_SESSION, bonusExerciseIds: ['face-pull', 'calf-raise'] });
    expect(loadSessionMirror()?.bonusExerciseIds).toEqual(['face-pull', 'calf-raise']);
  });

  it('never mirrors the undo buffer', () => {
    // A six-second window that survived a reload would let a user restore a set minutes later
    // from a buffer that outlived the decision to delete it.
    saveSessionMirror({
      ...EMPTY_SESSION,
      undo: {
        set: {
          id: 's',
          profileId: 'p',
          assignmentDate: '2026-03-02',
          sessionId: 'x',
          exerciseId: 'e',
          setNumber: 1,
          isBonus: false,
          loadKg: 60, // [kg]
          enteredUnit: 'metric',
          reps: 8, // [repetitions]
          durationS: null, // [s]
          rpe: null,
          loggedAt: T0, // [ms]
        },
        expiresAt: T0 + 6_000, // [ms]
      },
    });
    const raw = sessionStorage.getItem(SESSION_KEY) ?? '';
    expect(raw).not.toContain('undo');
    expect(loadSessionMirror()?.restTimer).toBeNull();
  });

  it('returns null for corrupt JSON instead of throwing', () => {
    sessionStorage.setItem(SESSION_KEY, '{not json');
    expect(loadSessionMirror()).toBeNull();
  });

  it('returns null for a structurally invalid payload', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ restTimer: { startedAt: 'soon' } }));
    expect(loadSessionMirror()).toBeNull();
  });

  it('returns null for a mirror carrying a malformed date', () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        restTimer: null,
        activeAssignmentDate: '02/03/2026',
        bonusExerciseIds: [],
      }),
    );
    expect(loadSessionMirror()).toBeNull();
  });

  it('clears the mirror', () => {
    saveSessionMirror({ ...EMPTY_SESSION, activeAssignmentDate: '2026-03-02' });
    clearSessionMirror();
    expect(loadSessionMirror()).toBeNull();
  });

  it('degrades to no mirror when Web Storage is unreachable', () => {
    // Safari private browsing and a partitioned third-party context both throw on access. The
    // only cost is that the timer does not survive a reload; nothing may propagate.
    makeStorageUnavailable();
    expect(() => {
      saveSessionMirror({ ...EMPTY_SESSION, activeAssignmentDate: '2026-03-02' });
    }).not.toThrow();
    expect(loadSessionMirror()).toBeNull();
    expect(() => {
      clearSessionMirror();
    }).not.toThrow();
  });
});
