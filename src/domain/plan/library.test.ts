import { describe, expect, it } from 'vitest';

import type { Exercise, Prescription } from '../types';
import {
  EXERCISES,
  EXERCISE_BY_ID,
  FORM_CUE_IDS,
  INDIRECT_SET_FRACTION,
  MUSCLE_GROUPS,
  restSFor,
} from './library';

/**
 * The canonical id list, copied verbatim from the master plan section 5 comment in
 * src/domain/types.ts. P4's src/content/formCues.ts is keyed by the same 31 slugs, so a
 * divergence here is a silent cue-lookup miss there. `barbell-row-heavy` is deliberately
 * absent (content review section 6, WRONG-unsafe cue).
 */
const CANONICAL_IDS = [
  'barbell-bench-press',
  'overhead-press-barbell',
  'incline-db-press',
  'lateral-raise',
  'triceps-overhead-extension',
  'pull-up',
  'lat-pulldown',
  'barbell-row-pendlay',
  'barbell-row',
  'db-single-arm-row',
  'face-pull',
  'barbell-curl',
  'hammer-curl',
  'barbell-back-squat',
  'romanian-deadlift',
  'leg-press',
  'bulgarian-split-squat',
  'leg-curl-machine',
  'calf-raise',
  'push-up',
  'trap-bar-deadlift',
  'conventional-deadlift',
  'weighted-pull-up',
  'close-grip-bench-press',
  'push-press',
  'rower-intervals',
  'plank',
  'ab-wheel-rollout',
  'hanging-knee-raise',
  'walk',
  'stair-climber',
];

/** Rep-range prescriptions used by the rest-interval tests. Reps are counts, not a unit. */
const HEAVY: Prescription = { kind: 'reps', lo: 4, hi: 6 };
const MODERATE: Prescription = { kind: 'reps', lo: 6, hi: 8 };
const HYPERTROPHY: Prescription = { kind: 'reps', lo: 10, hi: 12 };
const AMRAP: Prescription = { kind: 'amrap', minimum: null };
const TIMED: Prescription = { kind: 'time', targetS: 60 }; // [s] hold duration
const DURATION: Prescription = { kind: 'duration', targetS: 1200 }; // [s] = 20 min

function byId(id: string): Exercise {
  const ex = EXERCISE_BY_ID[id];
  if (!ex) throw new Error(`missing exercise: ${id}`);
  return ex;
}

describe('exercise library integrity', () => {
  it('has unique, kebab-case ids', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('is exactly the canonical id set from master plan section 5', () => {
    expect([...EXERCISES.map((e) => e.id)].sort()).toEqual([...CANONICAL_IDS].sort());
    expect(EXERCISES.length).toBe(31);
  });

  it('indexes every exercise by id, and the map holds the same object as the array', () => {
    expect(Object.keys(EXERCISE_BY_ID).length).toBe(EXERCISES.length);
    for (const id of CANONICAL_IDS) {
      expect(EXERCISE_BY_ID[id]).toBe(EXERCISES.find((e) => e.id === id));
    }
    for (const e of EXERCISES) expect(EXERCISE_BY_ID[e.id]).toBe(e);
  });

  it('uses only the closed muscle vocabulary', () => {
    for (const e of EXERCISES) {
      for (const m of [...e.muscleGroups, ...e.secondaryMuscles]) {
        expect(MUSCLE_GROUPS).toContain(m);
      }
    }
  });

  it('never lists the same muscle as both a direct and an indirect mover', () => {
    for (const e of EXERCISES) {
      const overlap = e.muscleGroups.filter((m) => e.secondaryMuscles.includes(m));
      expect({ id: e.id, overlap }).toEqual({ id: e.id, overlap: [] });
      expect(new Set(e.muscleGroups).size).toBe(e.muscleGroups.length);
      expect(new Set(e.secondaryMuscles).size).toBe(e.secondaryMuscles.length);
    }
  });

  it('gives every muscle group at least one direct exercise', () => {
    for (const m of MUSCLE_GROUPS) {
      expect(EXERCISES.some((e) => e.muscleGroups.includes(m))).toBe(true);
    }
  });

  it('lists at least one equipment setting for every exercise', () => {
    for (const e of EXERCISES) expect(e.equipment.length).toBeGreaterThan(0);
  });

  it('keeps bodyweight exercises on the bodyweight modality', () => {
    for (const e of EXERCISES) {
      if (e.isBodyweight) expect(e.modality).toBe('bodyweight');
    }
  });

  it('counts an indirect set as half a direct set', () => {
    expect(INDIRECT_SET_FRACTION).toBe(0.5);
  });
});

describe('form-cue contract with P4', () => {
  it('exports exactly the ids that src/content/formCues.ts must key on', () => {
    const withCues = EXERCISES.filter((e) => e.formCueId !== null).map((e) => e.formCueId);
    expect([...FORM_CUE_IDS].sort()).toEqual([...withCues].sort());
  });

  it('uses the exercise id as its own cue id, so a lookup can never silently miss', () => {
    for (const e of EXERCISES) {
      if (e.formCueId !== null) expect(e.formCueId).toBe(e.id);
    }
  });
});

describe('content review exclusions and scrubbing', () => {
  it('excludes the heavy barbell row whose cue was flagged unsafe', () => {
    // Content review section 6: "you can use a slight cheat / TnT" on a loaded hip-hinge
    // -- WRONG (unsafe). The strict barbell row keeps the movement pattern.
    expect(EXERCISES.some((e) => e.id === 'barbell-row-heavy')).toBe(false);
    expect(EXERCISE_BY_ID['barbell-row-pendlay']).toBeDefined();
    expect(EXERCISE_BY_ID['barbell-row']).toBeDefined();
  });

  it('splits the three legacy compound entries so no cue lookup can fail', () => {
    for (const id of [
      'pull-up',
      'lat-pulldown',
      'leg-press',
      'bulgarian-split-squat',
      'trap-bar-deadlift',
      'conventional-deadlift',
    ]) {
      expect(EXERCISE_BY_ID[id]).toBeDefined();
    }
  });

  it('carries no personal, medication or location text', () => {
    const blob = JSON.stringify(EXERCISES).toLowerCase();
    for (const needle of [
      // Medication and location identifiers, assembled from two halves for exactly the reason
      // the CI workflow writes them with one-character classes: a literal spelling here would
      // make this test file itself fail the repository's personal-data grep over src/
      // (master plan section 3).
      'vyvans' + 'e',
      'lisdexamfetamin' + 'e',
      'ymc' + 'a',
      'amphetamin' + 'e',
      // Personal literals the port drops (content review section 7 and Task 3 provenance).
      'thesis',
      '65 kg',
      'previous max',
      'forever',
      'wk 9',
      'wk 5',
      // The cue permission the content review marked WRONG (unsafe).
      'cheat',
      'tnt',
    ]) {
      expect(blob).not.toContain(needle);
    }
  });

  it('keeps the ported video search strings and nulls the ones the legacy file never had', () => {
    expect(byId('barbell-bench-press').videoQuery).toBe('bench press perfect form jeff nippard');
    expect(byId('face-pull').videoQuery).toBe('face pulls athlean rear delt form');
    expect(byId('incline-db-press').videoQuery).toBe('incline dumbbell press form jeff nippard');
    expect(byId('db-single-arm-row').videoQuery).toBe('single arm dumbbell row form meadows');
    // Split halves the legacy file never carried a search string for.
    expect(byId('lat-pulldown').videoQuery).toBeNull();
    expect(byId('leg-press').videoQuery).toBeNull();
    // The three legacy entries with no `video` field at all; "No training" is dropped.
    expect(byId('walk').videoQuery).toBeNull();
    expect(byId('stair-climber').videoQuery).toBeNull();
  });
});

describe('rest intervals follow the content review section 9 table', () => {
  it('gives a heavy compound 180 s, a moderate compound 120 s and isolation 90 s', () => {
    const squat = byId('barbell-back-squat'); // lower-compound
    const bench = byId('barbell-bench-press'); // upper-compound
    const curl = byId('barbell-curl'); // isolation
    expect(restSFor(squat, HEAVY)).toBe(180); // [s]
    expect(restSFor(squat, MODERATE)).toBe(120); // [s]
    expect(restSFor(squat, HYPERTROPHY)).toBe(120); // [s]
    expect(restSFor(bench, HEAVY)).toBe(180); // [s]
    expect(restSFor(bench, HYPERTROPHY)).toBe(120); // [s]
    expect(restSFor(curl, HEAVY)).toBe(90); // [s] isolation is capped by load class, not reps
    expect(restSFor(curl, HYPERTROPHY)).toBe(90); // [s]
  });

  it('gives a compound without a rep range the moderate default', () => {
    const pullUp = byId('pull-up');
    expect(restSFor(pullUp, AMRAP)).toBe(120); // [s]
  });

  it('gives a timed or duration prescription its load-class default', () => {
    expect(restSFor(byId('plank'), TIMED)).toBe(90); // [s] isolation
    expect(restSFor(byId('rower-intervals'), DURATION)).toBe(90); // [s] isolation
  });

  it('never returns the rejected 30-60 s hypertrophy default', () => {
    // Schoenfeld 2016 (DOI 10.1519/JSC.0000000000001272) found 1 min worse than 3 min.
    for (const ex of EXERCISES) {
      for (const p of [HEAVY, MODERATE, HYPERTROPHY, AMRAP, TIMED, DURATION]) {
        expect(restSFor(ex, p)).toBeGreaterThanOrEqual(90); // [s]
      }
    }
  });
});
