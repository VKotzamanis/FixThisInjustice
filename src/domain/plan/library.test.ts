import { describe, expect, it } from 'vitest';

import type { Equipment, Exercise, Prescription } from '../types';
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
 * src/domain/types.ts. P4's src/content/formCues.ts is keyed by the same 38 slugs, so a
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
  // The seven equipment-tier exercises added after the Task 3 review, so the dumbbells-only and
  // bodyweight tiers reach every declared muscle. formCueId is null until P4 writes their cues.
  'db-overhead-press',
  'db-romanian-deadlift',
  'db-rear-delt-fly',
  'goblet-squat',
  'inverted-row',
  'pike-push-up',
  'nordic-hamstring-curl',
];

/** The seven ids added by the Task 3 review, asserted as a group for their shared field shape. */
const NEW_TIER_IDS = [
  'db-overhead-press',
  'db-romanian-deadlift',
  'db-rear-delt-fly',
  'goblet-squat',
  'inverted-row',
  'pike-push-up',
  'nordic-hamstring-curl',
];

/**
 * The three lower-body families of the master plan section 5 direct-mover rule. Membership is a
 * judgement about the movement pattern; what the rule then REQUIRES of each family is asserted
 * below, so a re-tag that breaks the rule fails here instead of silently shifting weekly volume.
 */
const HIP_DOMINANT = ['romanian-deadlift', 'db-romanian-deadlift', 'conventional-deadlift'];
const HIP_DOMINANT_HYBRID = ['trap-bar-deadlift', 'bulgarian-split-squat'];
const KNEE_DOMINANT = ['barbell-back-squat', 'leg-press', 'goblet-squat'];

const TIERS: Equipment[] = ['full-gym', 'dumbbells-only', 'bodyweight'];

/**
 * Muscles with NO direct exercise in a tier. Asserted as an EQUALITY, not a subset, so closing a
 * gap means deleting an entry here rather than editing an assertion. Empty for both loaded
 * tiers. The bodyweight tier lacks isolation for four groups: side delt (no unloaded
 * horizontal-plane abduction exists), and rear delt / triceps / biceps, whose direct bodyweight
 * options -- chin-up, bench dip, bodyweight curl -- are outside the canonical id list.
 */
const NO_DIRECT_EXCEPTIONS: Record<string, string[]> = {
  'full-gym': [],
  'dumbbells-only': [],
  bodyweight: ['biceps', 'rear-delt', 'side-delt', 'triceps'],
};

/**
 * Muscles with no stimulus of ANY kind in a tier -- direct or secondary. This is the master plan
 * section 5 claim ("a bodyweight-only tier has no side-delt isolation, which the generator
 * reports as maintenance-only") stated at its strongest: side delt is the ONLY group an unloaded
 * tier cannot touch at all.
 */
const NO_STIMULUS_EXCEPTIONS: Record<string, string[]> = {
  'full-gym': [],
  'dumbbells-only': [],
  bodyweight: ['side-delt'],
};

/** Exercises available in a tier, given that the tier tags nest (section 5). */
function inTier(tier: Equipment): Exercise[] {
  return EXERCISES.filter((e) => e.equipment.includes(tier));
}

/** Rep-range prescriptions used by the rest-interval tests. Reps are counts, not a unit. */
const HEAVY: Prescription = { kind: 'reps', lo: 4, hi: 6 };
const MODERATE: Prescription = { kind: 'reps', lo: 6, hi: 8 };
const HYPERTROPHY: Prescription = { kind: 'reps', lo: 10, hi: 12 };
const AMRAP: Prescription = { kind: 'amrap', minimum: null };
const TIMED: Prescription = { kind: 'time', targetS: 60 }; // [s] hold duration
const DURATION: Prescription = { kind: 'duration', targetS: 1200 }; // [s] = 20 min
const NONE: Prescription = { kind: 'none' };
const HIGH_REP: Prescription = { kind: 'reps', lo: 12, hi: 20 }; // above the review's 6-12 row

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
    expect(EXERCISES.length).toBe(38);
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

describe('direct-mover rule (master plan section 5)', () => {
  it('makes glutes a direct mover in every hip-dominant lift, hybrid or not', () => {
    for (const id of [...HIP_DOMINANT, ...HIP_DOMINANT_HYBRID]) {
      const e = byId(id);
      expect({ id, direct: e.muscleGroups.includes('glutes') }).toEqual({ id, direct: true });
      expect({ id, secondary: e.secondaryMuscles.includes('glutes') }).toEqual({
        id,
        secondary: false,
      });
    }
  });

  it('makes hamstrings direct in the pure hinges and secondary in the knee-flexing hybrids', () => {
    for (const id of HIP_DOMINANT) {
      expect({ id, direct: byId(id).muscleGroups.includes('hamstrings') }).toEqual({
        id,
        direct: true,
      });
    }
    for (const id of HIP_DOMINANT_HYBRID) {
      // The knee extends as the hip extends, so the net hamstring length change is small.
      const e = byId(id);
      expect({ id, quadsDirect: e.muscleGroups.includes('quads') }).toEqual({
        id,
        quadsDirect: true,
      });
      expect({ id, hamsSecondary: e.secondaryMuscles.includes('hamstrings') }).toEqual({
        id,
        hamsSecondary: true,
      });
    }
  });

  it('makes quads direct and glutes AND hamstrings secondary in every knee-dominant lift', () => {
    for (const id of KNEE_DOMINANT) {
      const e = byId(id);
      expect({ id, direct: [...e.muscleGroups].sort() }).toEqual({ id, direct: ['quads'] });
      expect({ id, secondary: [...e.secondaryMuscles].sort() }).toEqual({
        id,
        secondary: ['glutes', 'hamstrings'],
      });
    }
  });

  it('credits quads in the conventional pull only, never in a Romanian deadlift', () => {
    // The shank is inclined off the floor in the conventional pull; the Romanian variants hold
    // the knee angle, so there is no quadriceps working range to credit at all.
    expect(byId('conventional-deadlift').secondaryMuscles).toContain('quads');
    for (const id of ['romanian-deadlift', 'db-romanian-deadlift']) {
      const e = byId(id);
      expect({ id, quads: [...e.muscleGroups, ...e.secondaryMuscles].includes('quads') }).toEqual({
        id,
        quads: false,
      });
    }
  });

  it('lists rear delt on every row, so the dumbbell row matches the two barbell rows', () => {
    for (const id of ['barbell-row', 'barbell-row-pendlay', 'db-single-arm-row', 'inverted-row']) {
      expect({ id, rearDelt: byId(id).secondaryMuscles.includes('rear-delt') }).toEqual({
        id,
        rearDelt: true,
      });
    }
  });
});

describe('the seven equipment-tier exercises added after the Task 3 review', () => {
  it('has no cue id yet and a mechanical "<name> form" search string', () => {
    for (const id of NEW_TIER_IDS) {
      const e = byId(id);
      expect({ id, cue: e.formCueId, note: e.note }).toEqual({ id, cue: null, note: null });
      expect(e.videoQuery).toBe(`${e.name.toLowerCase()} form`);
    }
  });

  it('marks exactly the three unloaded ones as bodyweight', () => {
    const bw = NEW_TIER_IDS.filter((id) => byId(id).isBodyweight).sort();
    expect(bw).toEqual(['inverted-row', 'nordic-hamstring-curl', 'pike-push-up']);
  });

  it('carries the load class and modality the review specified', () => {
    const expected: Record<string, [Exercise['loadClass'], Exercise['modality']]> = {
      'db-overhead-press': ['upper-compound', 'dumbbell'],
      'db-romanian-deadlift': ['lower-compound', 'dumbbell'],
      'db-rear-delt-fly': ['isolation', 'dumbbell'],
      'goblet-squat': ['lower-compound', 'dumbbell'],
      'inverted-row': ['upper-compound', 'bodyweight'],
      'pike-push-up': ['upper-compound', 'bodyweight'],
      'nordic-hamstring-curl': ['isolation', 'bodyweight'],
    };
    for (const [id, [loadClass, modality]] of Object.entries(expected)) {
      const e = byId(id);
      expect({ id, loadClass: e.loadClass, modality: e.modality }).toEqual({
        id,
        loadClass,
        modality,
      });
    }
  });

  it('puts each new direct mover where the review put it', () => {
    const direct: Record<string, string[]> = {
      'db-overhead-press': ['front-delt'],
      'db-romanian-deadlift': ['glutes', 'hamstrings'],
      'db-rear-delt-fly': ['rear-delt'],
      'goblet-squat': ['quads'],
      'inverted-row': ['lats', 'mid-back'],
      'pike-push-up': ['front-delt'],
      'nordic-hamstring-curl': ['hamstrings'],
    };
    for (const [id, muscles] of Object.entries(direct)) {
      expect({ id, direct: [...byId(id).muscleGroups].sort() }).toEqual({ id, direct: muscles });
    }
  });
});

describe('nested equipment tiers (master plan section 5)', () => {
  it('closes every tag upward: bodyweight implies dumbbells-only implies full-gym', () => {
    for (const e of EXERCISES) {
      if (e.equipment.includes('bodyweight')) {
        expect({ id: e.id, eq: [...e.equipment].sort() }).toEqual({
          id: e.id,
          eq: ['bodyweight', 'dumbbells-only', 'full-gym'],
        });
      }
      if (e.equipment.includes('dumbbells-only')) {
        expect({ id: e.id, gym: e.equipment.includes('full-gym') }).toEqual({
          id: e.id,
          gym: true,
        });
      }
    }
  });

  it('gives every dumbbell exercise both the dumbbells-only and full-gym tiers', () => {
    for (const e of EXERCISES) {
      if (e.modality !== 'dumbbell') continue;
      expect({
        id: e.id,
        dumbbells: e.equipment.includes('dumbbells-only'),
        gym: e.equipment.includes('full-gym'),
      }).toEqual({ id: e.id, dumbbells: true, gym: true });
    }
  });

  it('restricts a bodyweight-modality exercise to full-gym only when it needs apparatus', () => {
    // The documented exceptions to "bodyweight modality gets all three tiers", each because the
    // movement needs equipment a home setting cannot assume.
    const APPARATUS_ONLY = ['weighted-pull-up', 'ab-wheel-rollout', 'rower-intervals', 'stair-climber'];
    for (const e of EXERCISES) {
      if (e.modality !== 'bodyweight') continue;
      const expected = APPARATUS_ONLY.includes(e.id)
        ? ['full-gym']
        : ['bodyweight', 'dumbbells-only', 'full-gym'];
      expect({ id: e.id, eq: [...e.equipment].sort() }).toEqual({ id: e.id, eq: expected });
    }
  });

  it('keeps the weighted pull-up bodyweight-based but full-gym only', () => {
    // isBodyweight answers "what is being lifted" (the body, with the plate as an increment);
    // equipment answers "which tier has the plates" (only full-gym).
    const wp = byId('weighted-pull-up');
    expect({ bw: wp.isBodyweight, modality: wp.modality, eq: [...wp.equipment] }).toEqual({
      bw: true,
      modality: 'bodyweight',
      eq: ['full-gym'],
    });
  });

  it('gives every muscle a direct exercise in every tier, bar the documented exceptions', () => {
    for (const tier of TIERS) {
      const uncovered = MUSCLE_GROUPS.filter(
        (m) => !inTier(tier).some((e) => e.muscleGroups.includes(m)),
      ).sort();
      expect({ tier, uncovered }).toEqual({ tier, uncovered: NO_DIRECT_EXCEPTIONS[tier] });
    }
  });

  it('leaves only the side delt with no stimulus at all in the bodyweight tier', () => {
    for (const tier of TIERS) {
      const untouched = MUSCLE_GROUPS.filter(
        (m) =>
          !inTier(tier).some(
            (e) => e.muscleGroups.includes(m) || e.secondaryMuscles.includes(m),
          ),
      ).sort();
      expect({ tier, untouched }).toEqual({ tier, untouched: NO_STIMULUS_EXCEPTIONS[tier] });
    }
  });
});

describe('the library is deep-frozen', () => {
  it('refuses a push onto EXERCISES itself', () => {
    expect(Object.isFrozen(EXERCISES)).toBe(true);
    expect(() => (EXERCISES as Exercise[]).push({ ...byId('plank') })).toThrow(TypeError);
  });

  it('freezes every exercise object and all three of its arrays', () => {
    for (const e of EXERCISES) {
      expect({ id: e.id, frozen: Object.isFrozen(e) }).toEqual({ id: e.id, frozen: true });
      expect({ id: e.id, frozen: Object.isFrozen(e.muscleGroups) }).toEqual({
        id: e.id,
        frozen: true,
      });
      expect({ id: e.id, frozen: Object.isFrozen(e.secondaryMuscles) }).toEqual({
        id: e.id,
        frozen: true,
      });
      expect({ id: e.id, frozen: Object.isFrozen(e.equipment) }).toEqual({
        id: e.id,
        frozen: true,
      });
    }
  });

  it('throws on an in-place mutation, which is what an accidental push would be', () => {
    // ES modules are strict mode, so a write to a frozen object throws rather than failing
    // silently. A silent failure here would corrupt every later weekly volume count.
    const squat = byId('barbell-back-squat');
    expect(() => squat.muscleGroups.push('chest')).toThrow(TypeError);
    expect(() => squat.equipment.push('bodyweight')).toThrow(TypeError);
    expect(() => {
      (squat as { name: string }).name = 'mutated';
    }).toThrow(TypeError);
    expect(squat.muscleGroups).toEqual(['quads']);
    expect(squat.name).toBe('Barbell back squat');
  });

  it('freezes the derived exports as well', () => {
    expect(Object.isFrozen(EXERCISE_BY_ID)).toBe(true);
    expect(Object.isFrozen(FORM_CUE_IDS)).toBe(true);
    expect(Object.isFrozen(MUSCLE_GROUPS)).toBe(true);
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

  it('gives a { kind: "none" } prescription its load-class default', () => {
    // "none" is P4's prescription for a set with no target at all. An unknown rep count falls to
    // the moderate-compound 120 s whatever its cause, and isolation is still capped at 90 s.
    expect(restSFor(byId('barbell-bench-press'), NONE)).toBe(120); // [s] upper-compound
    expect(restSFor(byId('barbell-back-squat'), NONE)).toBe(120); // [s] lower-compound
    expect(restSFor(byId('plank'), NONE)).toBe(90); // [s] isolation
  });

  it('extrapolates a compound above 12 reps to the moderate 120 s row, and says so', () => {
    // The content review section 9 table stops at 12 reps; there is no verified row above it.
    // 120 s is returned by extrapolation, not lookup -- documented in the restSFor comment.
    expect(restSFor(byId('barbell-bench-press'), HIGH_REP)).toBe(120); // [s]
    expect(restSFor(byId('barbell-back-squat'), { kind: 'reps', lo: 15, hi: 20 })).toBe(120); // [s]
  });

  it('gives a timed or duration prescription its load-class default', () => {
    expect(restSFor(byId('plank'), TIMED)).toBe(90); // [s] isolation
    expect(restSFor(byId('rower-intervals'), DURATION)).toBe(90); // [s] isolation
  });

  it('never returns the rejected 30-60 s hypertrophy default', () => {
    // Schoenfeld 2016 (DOI 10.1519/JSC.0000000000001272) found 1 min worse than 3 min.
    for (const ex of EXERCISES) {
      for (const p of [HEAVY, MODERATE, HYPERTROPHY, HIGH_REP, AMRAP, TIMED, DURATION, NONE]) {
        expect(restSFor(ex, p)).toBeGreaterThanOrEqual(90); // [s]
      }
    }
  });
});
