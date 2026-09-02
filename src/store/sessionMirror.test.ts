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
import { installFakeStorage, makeStorageUnavailable } from './testStorage';

const T0 = Date.UTC(2026, 2, 2, 18, 0, 0); // [ms] epoch, UTC

/**
 * The raw Web Storage backing, seeded and read through installFakeStorage's Map.
 *
 * The `sessionStorage` global is deliberately not named here: the ESLint gate (P4 polish item
 * 5) exempts src/store/sessionMirror.ts and the readiness notice only, on the same argument
 * src/store/testStorage.ts already makes for localStorage - a test that named the global would
 * be indistinguishable from application code doing it. Installing the fake also makes each
 * test hermetic, which `sessionStorage.clear()` was doing before.
 */
let storage: Map<string, string>;

describe('sessionMirror', () => {
  beforeEach(() => {
    storage = installFakeStorage();
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
    const raw = storage.get(SESSION_KEY) ?? '';
    expect(raw).not.toContain('undo');
    expect(loadSessionMirror()?.restTimer).toBeNull();
  });

  it('returns null for corrupt JSON instead of throwing', () => {
    storage.set(SESSION_KEY, '{not json');
    expect(loadSessionMirror()).toBeNull();
  });

  it('returns null for a structurally invalid payload', () => {
    storage.set(SESSION_KEY, JSON.stringify({ restTimer: { startedAt: 'soon' } }));
    expect(loadSessionMirror()).toBeNull();
  });

  it('returns null for a mirror carrying a malformed date', () => {
    storage.set(
      SESSION_KEY,
      JSON.stringify({
        restTimer: null,
        activeAssignmentDate: '02/03/2026',
        bonusExerciseIds: [],
      }),
    );
    expect(loadSessionMirror()).toBeNull();
  });

  it('returns null for a mirror carrying a calendar-invalid date', () => {
    // "2026-02-30" passes the "YYYY-MM-DD" shape and names no day. The mirror is user-editable
    // storage, so the restored date is checked with the domain's own isValidLocalDate rather
    // than with a regex, and a date the calendar refuses takes the whole mirror down with it.
    storage.set(
      SESSION_KEY,
      JSON.stringify({
        restTimer: null,
        activeAssignmentDate: '2026-02-30',
        bonusExerciseIds: [],
      }),
    );
    expect(loadSessionMirror()).toBeNull();
  });

  it('returns null for a timer that ends before it started', () => {
    // remainingS clamps at 0 and totalS would go NEGATIVE, which the rest panel divides by to
    // draw its ring. An inverted interval is not a timer that has run out; it is a payload no
    // startRest could have produced.
    storage.set(
      SESSION_KEY,
      JSON.stringify({
        restTimer: { startedAt: T0, endsAt: T0 - 1_000, durationS: 90 }, // [ms], [ms], [s]
        activeAssignmentDate: '2026-03-02',
        bonusExerciseIds: [],
      }),
    );
    expect(loadSessionMirror()).toBeNull();
  });

  it('accepts a timer that has already run out', () => {
    // endsAt === startedAt is a zero-length interval, which startRest(0, t) produces and the
    // panel renders as 0:00. Only endsAt < startedAt is refused.
    storage.set(
      SESSION_KEY,
      JSON.stringify({
        restTimer: { startedAt: T0, endsAt: T0, durationS: 0 }, // [ms], [ms], [s]
        activeAssignmentDate: null,
        bonusExerciseIds: [],
      }),
    );
    expect(loadSessionMirror()?.restTimer).toEqual({ startedAt: T0, endsAt: T0, durationS: 0 });
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
