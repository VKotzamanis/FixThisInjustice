// src/store/training.test.ts
//
// The P4 log transformers, tested as pure AppState -> AppState functions: no React, no store,
// no storage. Every assertion that a document is still storable goes through parseState, which
// is the same validator localStorage rehydration and JSON import use (master plan section 3).
//
// Deviation from the P4 plan's Task 6 Step 1 literal, recorded here (the plan is not edited):
// the plan imports `makeState` from ../test/fixtures, which exports no such builder (it ships
// makeProfile / makeExercise / makeSet only). The state builder is therefore local to this
// file, assembled from defaultState() and the shared profile fixture, and it seeds
// `profile-1`, which the amended actions require: requireProfile is now a guard on every
// action that writes a record keyed by a profile id.
import { describe, expect, it } from 'vitest';
import { makeExercise, makeProfile } from '../test/fixtures';
import { defaultState, parseState } from '../domain/schema';
import {
  applyAddCustomExercise,
  applyAddHydration,
  applyDeleteSet,
  applyLogBodyMass,
  applyLogSet,
  applyRestoreSet,
} from './training';
import type { AppState, LoggedSet } from '../domain/types';

const NOW = Date.UTC(2026, 2, 2, 18, 30, 0); // [ms] epoch, UTC

/** A document with one profile, which every profile-keyed action needs to exist. */
function makeState(): AppState {
  const profile = makeProfile();
  return { ...defaultState(), activeProfileId: profile.id, profiles: { [profile.id]: profile } };
}

/**
 * The document as it would be stored and read back: serialise, then run the loader's own
 * validator. A transformer that writes a field the schema refuses fails here rather than at
 * the user's next reload.
 */
function assertStorable(state: AppState): void {
  const round = parseState(JSON.parse(JSON.stringify(state)) as unknown);
  expect(round.ok ? null : round.error).toBeNull();
}

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
  rpe: null, // dimensionless, 1-10 half-point scale
};

describe('applyLogSet', () => {
  it('stores the set under its generated id with the supplied instant', () => {
    const next = applyLogSet(makeState(), setInput, 'set-abc', NOW);
    expect(next.sets['set-abc']).toEqual({ ...setInput, id: 'set-abc', loggedAt: NOW });
    assertStorable(next);
  });

  it('accepts loadKg 0 for a bodyweight set instead of dropping it', () => {
    // Master plan section 8 / code review A60: 0 is a valid load, never falsy-dropped.
    const next = applyLogSet(
      makeState(),
      { ...setInput, loadKg: 0, exerciseId: 'push-up' },
      'set-bw',
      NOW,
    );
    expect(next.sets['set-bw']?.loadKg).toBe(0);
    assertStorable(next);
  });

  it('accepts a null load for a set whose load was not recorded', () => {
    const next = applyLogSet(makeState(), { ...setInput, loadKg: null }, 'set-null', NOW);
    expect(next.sets['set-null']?.loadKg).toBeNull();
    assertStorable(next);
  });

  it('stores no derived values', () => {
    // Code review A28: the legacy froze exName, repsLo, repsHi, the suggestion
    // object and the lifetime-best object into every persisted set.
    const next = applyLogSet(makeState(), setInput, 'set-abc', NOW);
    expect(Object.keys(next.sets['set-abc'] ?? {}).sort()).toEqual(
      [
        'assignmentDate',
        'enteredUnit',
        'exerciseId',
        'durationS',
        'id',
        'isBonus',
        'loadKg',
        'loggedAt',
        'profileId',
        'reps',
        'rpe',
        'sessionId',
        'setNumber',
      ].sort(),
    );
  });

  it('rejects a negative load through the schema', () => {
    expect(() => applyLogSet(makeState(), { ...setInput, loadKg: -1 }, 'set-bad', NOW)).toThrow(
      /loadKg/i,
    );
  });

  it('rejects a non-finite load through the schema', () => {
    expect(() =>
      applyLogSet(makeState(), { ...setInput, loadKg: Number.POSITIVE_INFINITY }, 'set-inf', NOW),
    ).toThrow();
  });

  it('rejects an RPE off the half-point grid', () => {
    // The scale is defined on 0.5 steps: 7.5 is a reading, 7.3 is a typo.
    expect(() => applyLogSet(makeState(), { ...setInput, rpe: 7.3 }, 'set-rpe', NOW)).toThrow(
      /rpe/i,
    );
  });

  it('accepts an RPE on the half-point grid', () => {
    const next = applyLogSet(makeState(), { ...setInput, rpe: 7.5 }, 'set-rpe', NOW);
    expect(next.sets['set-rpe']?.rpe).toBe(7.5);
    assertStorable(next);
  });

  it('refuses a profile that does not exist', () => {
    expect(() =>
      applyLogSet(makeState(), { ...setInput, profileId: 'ghost' }, 'set-ghost', NOW),
    ).toThrow(/not a known profile/);
  });
});

describe('applyDeleteSet / applyRestoreSet', () => {
  it('removes the set and returns it for the undo buffer', () => {
    const seeded = applyLogSet(makeState(), setInput, 'set-abc', NOW);
    const { next, removed } = applyDeleteSet(seeded, 'set-abc');
    expect(next.sets['set-abc']).toBeUndefined();
    expect(removed?.id).toBe('set-abc');
    assertStorable(next);
  });

  it('returns null and leaves the state alone for an unknown id', () => {
    const state = makeState();
    const { next, removed } = applyDeleteSet(state, 'nope');
    expect(removed).toBeNull();
    expect(next).toBe(state);
  });

  it('restores a removed set unchanged', () => {
    const seeded = applyLogSet(makeState(), setInput, 'set-abc', NOW);
    const { next, removed } = applyDeleteSet(seeded, 'set-abc');
    expect(removed).not.toBeNull();
    if (removed === null) return;
    const restored = applyRestoreSet(next, removed);
    expect(restored.sets['set-abc']).toEqual(removed);
    assertStorable(restored);
  });
});

describe('applyLogBodyMass', () => {
  it('appends an entry and keeps the list ordered by date', () => {
    const first = applyLogBodyMass(
      makeState(),
      {
        profileId: 'profile-1',
        date: '2026-03-09',
        massKg: 94.2, // [kg]
        enteredUnit: 'metric',
        bodyFatPct: null, // [%]
      },
      'bm-2',
      NOW,
    );
    const second = applyLogBodyMass(
      first,
      {
        profileId: 'profile-1',
        date: '2026-03-02',
        massKg: 95, // [kg]
        enteredUnit: 'metric',
        bodyFatPct: null, // [%]
      },
      'bm-1',
      NOW,
    );
    expect(second.bodyMass['profile-1']?.map((e) => e.date)).toEqual(['2026-03-02', '2026-03-09']);
    assertStorable(second);
  });

  it('rejects a zero body mass, which is not a measurement', () => {
    expect(() =>
      applyLogBodyMass(
        makeState(),
        {
          profileId: 'profile-1',
          date: '2026-03-02',
          massKg: 0, // [kg]
          enteredUnit: 'metric',
          bodyFatPct: null,
        },
        'bm-0',
        NOW,
      ),
    ).toThrow(/massKg/i);
  });
});

describe('applyAddHydration', () => {
  it('creates the day entry and records the drink instant', () => {
    const next = applyAddHydration(makeState(), 'profile-1', '2026-03-02', 250, NOW);
    expect(next.hydration['profile-1']?.[0]).toEqual({
      profileId: 'profile-1',
      date: '2026-03-02',
      volumeML: 250, // [mL]
      marks: [NOW], // [ms]
    });
    assertStorable(next);
  });

  it('accumulates volume and appends a mark on the same day', () => {
    const once = applyAddHydration(makeState(), 'profile-1', '2026-03-02', 250, NOW);
    const twice = applyAddHydration(once, 'profile-1', '2026-03-02', 250, NOW + 60_000);
    expect(twice.hydration['profile-1']?.[0]?.volumeML).toBe(500); // [mL]
    expect(twice.hydration['profile-1']?.[0]?.marks).toEqual([NOW, NOW + 60_000]);
    expect(twice.hydration['profile-1']).toHaveLength(1);
    assertStorable(twice);
  });

  it('keeps the days apart', () => {
    const day1 = applyAddHydration(makeState(), 'profile-1', '2026-03-02', 250, NOW);
    const day2 = applyAddHydration(day1, 'profile-1', '2026-03-03', 500, NOW + 86_400_000);
    expect(day2.hydration['profile-1']?.map((e) => [e.date, e.volumeML])).toEqual([
      ['2026-03-02', 250],
      ['2026-03-03', 500],
    ]);
    assertStorable(day2);
  });

  it('rejects a negative volume', () => {
    expect(() => applyAddHydration(makeState(), 'profile-1', '2026-03-02', -100, NOW)).toThrow();
  });

  it('refuses a profile that does not exist', () => {
    expect(() => applyAddHydration(makeState(), 'ghost', '2026-03-02', 250, NOW)).toThrow(
      /not a known profile/,
    );
  });
});

describe('applyAddCustomExercise', () => {
  it('appends to the per-profile custom library', () => {
    const ex = makeExercise({
      id: '9f0c1d2e-0000-4000-8000-000000000001',
      name: 'Cable crunch',
      formCueId: null,
    });
    const next = applyAddCustomExercise(makeState(), 'profile-1', ex);
    expect(next.customExercises['profile-1']).toEqual([ex]);
    assertStorable(next);
  });

  it('rejects an exercise with an empty name', () => {
    const ex = makeExercise({ name: '' });
    expect(() => applyAddCustomExercise(makeState(), 'profile-1', ex)).toThrow(/name/i);
  });

  it('keeps ids stable when an earlier custom exercise is removed', () => {
    // Code review A26: positional 1000 + i indices re-attributed logged sets.
    const a = makeExercise({ id: 'id-a', name: 'Cable crunch' });
    const b = makeExercise({ id: 'id-b', name: 'Face pull' });
    const withBoth = applyAddCustomExercise(
      applyAddCustomExercise(makeState(), 'profile-1', a),
      'profile-1',
      b,
    );
    const withoutA: AppState = {
      ...withBoth,
      customExercises: {
        'profile-1': (withBoth.customExercises['profile-1'] ?? []).filter((e) => e.id !== 'id-a'),
      },
    };
    expect(withoutA.customExercises['profile-1']?.[0]?.id).toBe('id-b');
  });

  it('refuses a profile that does not exist', () => {
    expect(() => applyAddCustomExercise(makeState(), 'ghost', makeExercise())).toThrow(
      /not a known profile/,
    );
  });
});
