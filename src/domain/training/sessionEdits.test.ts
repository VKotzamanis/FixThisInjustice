// src/domain/training/sessionEdits.test.ts
//
// ROADMAP L2-L4: the pure rules behind changing today's session while training
// (docs/design/session-editing.md). No store, no React.
import { describe, expect, it } from 'vitest';
import { EXERCISES, EXERCISE_BY_ID } from '../plan/library';
import { SPLIT_TEMPLATES, prescriptionFor, restSFor } from '../plan/templates';
import { ACCESS_UNLOCKS } from '../types';
import type { Exercise, PlannedSession, SessionEdits } from '../types';
import {
  EMPTY_EDITS,
  UNPLANNED_SETS,
  addBlockedIds,
  addChoices,
  applySessionEdit,
  sessionLineup,
  swapAlternatives,
  unplannedSlot,
} from './sessionEdits';

function ex(id: string): Exercise {
  const e = EXERCISE_BY_ID[id];
  if (e === undefined) throw new Error(`library.ts no longer defines ${id}`);
  return e;
}

/** A three-slot session as the generator writes it: heavy press, moderate pull, timed hold. */
const SESSION: PlannedSession = {
  id: 'session-1',
  ordinal: 1,
  name: 'Upper A',
  kind: 'lift',
  label: 'Upper',
  exercises: [
    {
      exerciseId: 'barbell-bench-press',
      setsLo: 3, // [sets]
      setsHi: 4, // [sets]
      prescription: { kind: 'reps', lo: 4, hi: 6 }, // [repetitions] heavy
      restS: 180, // [s]
    },
    {
      exerciseId: 'lat-pulldown',
      setsLo: 3,
      setsHi: 3,
      prescription: { kind: 'reps', lo: 6, hi: 8 }, // [repetitions] moderate
      restS: 120,
    },
    {
      exerciseId: 'plank',
      setsLo: 2,
      setsHi: 2,
      prescription: { kind: 'time', targetS: 60 }, // [s]
      restS: 90,
    },
  ],
};

function edits(patch: Partial<SessionEdits>): SessionEdits {
  return { ...EMPTY_EDITS, ...patch };
}

function lineup(e: SessionEdits | undefined, logged: string[] = []): ReturnType<typeof sessionLineup> {
  return sessionLineup({ session: SESSION, edits: e, library: EXERCISE_BY_ID, loggedExerciseIds: logged });
}

describe('sessionLineup: the plan as written', () => {
  it('lists the planned slots in plan order, unchanged, when there are no edits', () => {
    const l = lineup(undefined);
    expect(l.map((e) => [e.key, e.exerciseId, e.kind])).toEqual([
      ['barbell-bench-press', 'barbell-bench-press', 'planned'],
      ['lat-pulldown', 'lat-pulldown', 'planned'],
      ['plank', 'plank', 'planned'],
    ]);
    expect(l.map((e) => e.planned)).toEqual(SESSION.exercises);
  });

  it('drops a planned id the library cannot resolve, as the view always has', () => {
    const session: PlannedSession = {
      ...SESSION,
      exercises: [...SESSION.exercises, { ...SESSION.exercises[0]!, exerciseId: 'gone' }],
    };
    const l = sessionLineup({ session, edits: undefined, library: EXERCISE_BY_ID, loggedExerciseIds: [] });
    expect(l.map((e) => e.key)).not.toContain('gone');
  });
});

describe('sessionLineup: swaps (L2)', () => {
  it('puts the substitute in the slot at the slot intensity, keeping the set count', () => {
    const l = lineup(edits({ swaps: { 'barbell-bench-press': 'incline-db-press' } }));
    const slot = l[0];
    expect(slot?.key).toBe('barbell-bench-press');
    expect(slot?.kind).toBe('swapped');
    expect(slot?.replaces).toBe('barbell-bench-press');
    expect(slot?.exerciseId).toBe('incline-db-press');
    const p = prescriptionFor(ex('incline-db-press'), 'heavy');
    expect(p).toEqual({ kind: 'reps', lo: 4, hi: 6 }); // the heavy slot stays heavy
    expect(slot?.planned).toEqual({
      exerciseId: 'incline-db-press',
      setsLo: 3, // [sets] the slot's volume decision, kept
      setsHi: 4,
      prescription: p,
      restS: restSFor(ex('incline-db-press'), p), // [s] the cited table, not a copy
    });
  });

  it('re-prescribes by what the substitute is, so a push-up goes to AMRAP', () => {
    const l = lineup(edits({ swaps: { 'barbell-bench-press': 'push-up' } }));
    expect(l[0]?.planned.prescription).toEqual({ kind: 'amrap', minimum: null });
  });

  it('keeps an original with sets logged today on screen, right after its slot', () => {
    const l = lineup(edits({ swaps: { 'barbell-bench-press': 'incline-db-press' } }), [
      'barbell-bench-press',
    ]);
    expect(l.map((e) => [e.exerciseId, e.kind])).toEqual([
      ['incline-db-press', 'swapped'],
      ['barbell-bench-press', 'swapped-out'],
      ['lat-pulldown', 'planned'],
      ['plank', 'planned'],
    ]);
    // Its own planned slot, so its rows count against the prescription it was logged under.
    expect(l[1]?.planned).toEqual(SESSION.exercises[0]);
    expect(l[1]?.key).not.toBe(l[0]?.key);
  });

  it('shows any other exercise logged today as a bonus card at the end', () => {
    const l = lineup(undefined, ['lateral-raise', 'lat-pulldown']);
    const last = l.at(-1);
    expect(l).toHaveLength(4);
    expect(last?.exerciseId).toBe('lateral-raise');
    expect(last?.kind).toBe('logged');
    expect(last?.planned.prescription).toEqual(prescriptionFor(ex('lateral-raise'), 'moderate'));
  });
});

describe('applySessionEdit: swap (L2)', () => {
  it('records the substitute against the slot', () => {
    const next = applySessionEdit(
      SESSION,
      undefined,
      { kind: 'swap', key: 'lat-pulldown', exerciseId: 'pull-up' },
      EXERCISE_BY_ID,
    );
    expect(next).toEqual(edits({ swaps: { 'lat-pulldown': 'pull-up' } }));
  });

  it('swapping back to the planned exercise removes the swap', () => {
    const next = applySessionEdit(
      SESSION,
      edits({ swaps: { 'lat-pulldown': 'pull-up' } }),
      { kind: 'swap', key: 'lat-pulldown', exerciseId: 'lat-pulldown' },
      EXERCISE_BY_ID,
    );
    expect(next.swaps).toEqual({});
  });

  it('refuses an exercise the library does not hold', () => {
    expect(() =>
      applySessionEdit(SESSION, undefined, { kind: 'swap', key: 'lat-pulldown', exerciseId: 'nope' }, EXERCISE_BY_ID),
    ).toThrow(/swap: "nope" is not a known exercise/);
  });

  it('refuses an exercise already in this session, so one card cannot appear twice', () => {
    expect(() =>
      applySessionEdit(SESSION, undefined, { kind: 'swap', key: 'lat-pulldown', exerciseId: 'plank' }, EXERCISE_BY_ID),
    ).toThrow(/swap: "plank" is already in this session/);
  });

  it('refuses a key that is not a planned slot of the session', () => {
    expect(() =>
      applySessionEdit(SESSION, undefined, { kind: 'swap', key: 'curl', exerciseId: 'pull-up' }, EXERCISE_BY_ID),
    ).toThrow(/swap: "curl" is not a planned exercise of this session/);
  });

  it('does not mutate the edits it was handed', () => {
    const before = edits({ swaps: { 'lat-pulldown': 'pull-up' } });
    const frozen = JSON.stringify(before);
    applySessionEdit(SESSION, before, { kind: 'swap', key: 'plank', exerciseId: 'ab-wheel-rollout' }, EXERCISE_BY_ID);
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

describe('sessionLineup: skip and order (L3)', () => {
  it('flags a skipped slot and leaves it in place, so its logged sets stay reachable', () => {
    const l = lineup(edits({ skipped: ['lat-pulldown'] }));
    expect(l.map((e) => [e.key, e.skipped])).toEqual([
      ['barbell-bench-press', false],
      ['lat-pulldown', true],
      ['plank', false],
    ]);
  });

  it('shows slots in the stored order, and any slot the order does not name after it', () => {
    const l = lineup(edits({ order: ['plank', 'gone', 'barbell-bench-press'] }));
    expect(l.map((e) => e.key)).toEqual(['plank', 'barbell-bench-press', 'lat-pulldown']);
  });

  it('moves a swapped-out card with the slot it left', () => {
    const l = lineup(
      edits({ swaps: { 'barbell-bench-press': 'incline-db-press' }, order: ['plank', 'barbell-bench-press'] }),
      ['barbell-bench-press'],
    );
    expect(l.map((e) => [e.exerciseId, e.kind])).toEqual([
      ['plank', 'planned'],
      ['incline-db-press', 'swapped'],
      ['barbell-bench-press', 'swapped-out'],
      ['lat-pulldown', 'planned'],
    ]);
  });
});

describe('applySessionEdit: skip, restore, move (L3)', () => {
  const apply = (e: SessionEdits | undefined, op: Parameters<typeof applySessionEdit>[2]): SessionEdits =>
    applySessionEdit(SESSION, e, op, EXERCISE_BY_ID);

  it('skips a slot once, however often it is asked', () => {
    const once = apply(undefined, { kind: 'skip', key: 'plank' });
    expect(once.skipped).toEqual(['plank']);
    expect(apply(once, { kind: 'skip', key: 'plank' }).skipped).toEqual(['plank']);
  });

  it('restores a skipped slot', () => {
    const skipped = apply(undefined, { kind: 'skip', key: 'plank' });
    expect(apply(skipped, { kind: 'restore', key: 'plank' }).skipped).toEqual([]);
  });

  it('moves a slot one place and stores the whole order', () => {
    const next = apply(undefined, { kind: 'move', key: 'lat-pulldown', by: -1 });
    expect(next.order).toEqual(['lat-pulldown', 'barbell-bench-press', 'plank']);
  });

  it('stores no order once the slots are back in plan order', () => {
    const moved = apply(undefined, { kind: 'move', key: 'plank', by: -1 });
    expect(apply(moved, { kind: 'move', key: 'plank', by: 1 }).order).toEqual([]);
  });

  it('leaves the first slot where it is when asked to move up, and the last when asked down', () => {
    expect(apply(undefined, { kind: 'move', key: 'barbell-bench-press', by: -1 }).order).toEqual([]);
    expect(apply(undefined, { kind: 'move', key: 'plank', by: 1 }).order).toEqual([]);
  });

  it('refuses a key that names no slot', () => {
    expect(() => apply(undefined, { kind: 'skip', key: 'curl' })).toThrow(/skip: "curl" is not in this session/);
    expect(() => apply(undefined, { kind: 'move', key: 'curl', by: 1 })).toThrow(/move: "curl" is not in this session/);
  });
});

describe('sessionLineup: added exercises (L4)', () => {
  it('lists added exercises after the plan, in the order added, as bonus work', () => {
    const l = lineup(edits({ added: ['lateral-raise', 'push-up'] }));
    expect(l.slice(3).map((e) => [e.key, e.kind])).toEqual([
      ['lateral-raise', 'added'],
      ['push-up', 'added'],
    ]);
    // Prescribed by what the exercise is: a push-up is AMRAP, never "8-12 reps".
    expect(l[4]?.planned).toEqual(unplannedSlot(ex('push-up')));
    expect(l[4]?.planned.prescription).toEqual({ kind: 'amrap', minimum: null });
    expect(l[4]?.planned.setsLo).toBe(UNPLANNED_SETS);
  });

  it('does not show an added exercise twice once sets are logged on it', () => {
    const l = lineup(edits({ added: ['lateral-raise'] }), ['lateral-raise']);
    expect(l.filter((e) => e.exerciseId === 'lateral-raise').map((e) => e.kind)).toEqual(['added']);
  });

  it('orders an added exercise like any slot', () => {
    const l = lineup(edits({ added: ['lateral-raise'], order: ['lateral-raise'] }));
    expect(l[0]?.key).toBe('lateral-raise');
  });
});

describe('applySessionEdit: add and remove (L4)', () => {
  const apply = (e: SessionEdits | undefined, op: Parameters<typeof applySessionEdit>[2]): SessionEdits =>
    applySessionEdit(SESSION, e, op, EXERCISE_BY_ID);

  it('adds a library exercise', () => {
    expect(apply(undefined, { kind: 'add', exerciseId: 'lateral-raise' }).added).toEqual(['lateral-raise']);
  });

  it('refuses an exercise the session already holds, planned, swapped in or added', () => {
    expect(() => apply(undefined, { kind: 'add', exerciseId: 'plank' })).toThrow(
      /add: "plank" is already in this session/,
    );
    const swapped = edits({ swaps: { 'lat-pulldown': 'pull-up' } });
    expect(() => apply(swapped, { kind: 'add', exerciseId: 'pull-up' })).toThrow(/already in this session/);
    const added = edits({ added: ['lateral-raise'] });
    expect(() => apply(added, { kind: 'add', exerciseId: 'lateral-raise' })).toThrow(/already in this session/);
  });

  it('refuses an exercise the library does not hold', () => {
    expect(() => apply(undefined, { kind: 'add', exerciseId: 'nope' })).toThrow(/add: "nope" is not a known exercise/);
  });

  it('removes an added exercise and every trace of it', () => {
    const state = edits({ added: ['lateral-raise'], skipped: ['lateral-raise'], order: ['lateral-raise', 'plank'] });
    const next = apply(state, { kind: 'remove', key: 'lateral-raise' });
    expect(next.added).toEqual([]);
    expect(next.skipped).toEqual([]);
    expect(next.order).not.toContain('lateral-raise');
  });

  it('refuses to remove a planned exercise: that is a skip, which can be restored', () => {
    expect(() => apply(undefined, { kind: 'remove', key: 'plank' })).toThrow(
      /remove: "plank" is a planned exercise; skip it instead/,
    );
  });
});

describe('addChoices (L4)', () => {
  it('lists what the equipment unlocks first, then the rest, never what the session holds', () => {
    const inUse = new Set(['barbell-bench-press', 'lat-pulldown', 'plank']);
    const { fits, others } = addChoices({ access: 'home', library: EXERCISES, inUse });
    for (const e of fits) expect(e.equipment.some((t) => ACCESS_UNLOCKS.home.includes(t))).toBe(true);
    for (const e of others) expect(e.equipment.some((t) => ACCESS_UNLOCKS.home.includes(t))).toBe(false);
    const all = [...fits, ...others].map((e) => e.id).sort();
    expect(all).toEqual(EXERCISES.map((e) => e.id).filter((id) => !inUse.has(id)).sort());
  });

  /*
   * Review R3. The view built the picker's exclusions from the cards on screen, so a planned
   * exercise whose slot was swapped away was offered, and 'add' then refused it (its id is the
   * slot's key). One set now feeds both.
   */
  it('offers exactly what add accepts, never a planned exercise whose slot was swapped away', () => {
    const swapped = edits({ swaps: { 'barbell-bench-press': 'incline-db-press' } });
    const blocked = addBlockedIds(SESSION, swapped);
    const { fits, others } = addChoices({ access: 'full-gym', library: EXERCISES, inUse: blocked });
    const offered = [...fits, ...others].map((e) => e.id);
    expect(offered).not.toContain('barbell-bench-press');
    expect(offered).not.toContain('incline-db-press');
    const add = (exerciseId: string): SessionEdits =>
      applySessionEdit(SESSION, swapped, { kind: 'add', exerciseId }, EXERCISE_BY_ID);
    for (const id of offered) expect(() => add(id)).not.toThrow();
    for (const id of blocked) expect(() => add(id)).toThrow(/^add: /);
    expect(() => add('barbell-bench-press')).toThrow(/swap the slot back instead/);
  });
});

describe('swapAlternatives (L2)', () => {
  const bench = ex('barbell-bench-press');
  const inUse = new Set(['barbell-bench-press', 'lat-pulldown', 'plank']);

  it('offers the template slot candidates first, then exercises sharing a direct mover', () => {
    const { suggested } = swapAlternatives({ original: bench, access: 'full-gym', library: EXERCISES, inUse });
    const peers = SPLIT_TEMPLATES[3].sessions
      .flatMap((s) => s.slots)
      .find((slot) => slot.candidates.includes('barbell-bench-press'))?.candidates;
    expect(peers).toBeDefined();
    // The curated "best first" list leads, minus the exercise itself.
    expect(suggested.slice(0, 2).map((e) => e.id)).toEqual(
      (peers ?? []).filter((id) => id !== 'barbell-bench-press'),
    );
    for (const e of suggested) {
      expect({ id: e.id, shares: e.muscleGroups.some((m) => bench.muscleGroups.includes(m)) }).toEqual({
        id: e.id,
        shares: true,
      });
    }
  });

  it('suggests only what the equipment unlocks, and leaves the rest of the library under Others', () => {
    const { suggested, others } = swapAlternatives({ original: bench, access: 'bodyweight', library: EXERCISES, inUse });
    for (const e of suggested) {
      expect(e.equipment.some((t) => ACCESS_UNLOCKS.bodyweight.includes(t))).toBe(true);
    }
    expect(suggested.map((e) => e.id)).toContain('push-up');
    // Together the two lists are the whole library minus what is already in the session.
    const all = [...suggested, ...others].map((e) => e.id).sort();
    expect(all).toEqual(EXERCISES.map((e) => e.id).filter((id) => !inUse.has(id)).sort());
    expect(new Set(all).size).toBe(all.length);
  });

  it('offers the planned exercise first once the slot has been swapped away from it', () => {
    const swappedInUse = new Set(['incline-db-press', 'lat-pulldown', 'plank']);
    const { suggested } = swapAlternatives({ original: bench, access: 'full-gym', library: EXERCISES, inUse: swappedInUse });
    expect(suggested[0]?.id).toBe('barbell-bench-press');
    expect(suggested.map((e) => e.id)).not.toContain('incline-db-press');
  });

  it('offers a custom exercise (no muscles recorded) only under Others', () => {
    const custom: Exercise = { ...bench, id: 'custom-1', name: 'Sled push', muscleGroups: [], secondaryMuscles: [] };
    const { suggested, others } = swapAlternatives({
      original: bench,
      access: 'full-gym',
      library: [...EXERCISES, custom],
      inUse,
    });
    expect(suggested.map((e) => e.id)).not.toContain('custom-1');
    expect(others.map((e) => e.id)).toContain('custom-1');
  });
});
