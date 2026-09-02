import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './index';
import { FUN_PROFILE_ID, makeAppState, makeInventory } from '../test/funFixtures';
import { SPECIMEN_CARDS } from '../content/specimenCards';
import { SPECIMEN_DROP_CHANCE, drawSpecimenForLoggedSet } from '../domain/fun/specimens';
import { parseState } from '../domain/schema';
import type { LoggedSet, TimeCapsule } from '../domain/types';

const P = FUN_PROFILE_ID;
const NOW = 1_757_000_000_000; // [ms] epoch, UTC

/** One logged set's worth of input. loadKg is [kg], durationS [s]. */
const BASE_SET: Omit<LoggedSet, 'id' | 'loggedAt'> = {
  profileId: P,
  assignmentDate: '2026-09-07',
  sessionId: 's-push',
  exerciseId: 'barbell-bench-press',
  setNumber: 1, // [sets] position within the exercise
  isBonus: false,
  loadKg: 60, // [kg]
  enteredUnit: 'metric',
  reps: 8, // [repetitions]
  durationS: null, // [s]
  rpe: null, // [RPE] 1-10; P4 writes null
};

function seed(): void {
  useAppStore.setState(makeAppState());
}

/**
 * The first set ordinal at or after `from` whose seeded roll yields a card for an empty
 * inventory.
 *
 * Searched with the domain function itself rather than pinned to a literal: the test then
 * states "an ordinal that drops" and stays true if the seed hash or the generator is ever
 * replaced. At SPECIMEN_DROP_CHANCE = 0.02 the expected search length is 50 ordinals.
 */
function firstHittingOrdinal(from: number): number {
  for (let ordinal = from; ordinal < from + 10_000; ordinal += 1) {
    const card = drawSpecimenForLoggedSet(
      makeInventory(),
      SPECIMEN_CARDS,
      P,
      ordinal,
      SPECIMEN_DROP_CHANCE,
    );
    if (card !== null) return ordinal;
  }
  throw new Error('funActions.test: no drop within 10000 ordinals; the economy has changed');
}

/** Seeds a store whose next logged set takes the ordinal `ordinal`. */
function seedAtOrdinal(ordinal: number): void {
  useAppStore.setState(
    makeAppState({
      specimens: { [P]: makeInventory({ totalSetsLogged: ordinal - 1 /* [sets] */ }) },
    }),
  );
}

describe('recordSpecimen', () => {
  beforeEach(seed);

  it('records a card against its id, its ordinal, its instant and its exercise', () => {
    useAppStore.getState().recordSpecimen(P, 7, 'c001', 'barbell-bench-press', NOW);
    const inv = useAppStore.getState().specimens[P];
    expect(inv?.acquired['c001']).toEqual({ at: NOW, exerciseId: 'barbell-bench-press' });
    expect(inv?.acquiredByOrdinal).toEqual({ '7': 'c001' });
  });

  it('is idempotent on a spent ordinal: the second call changes nothing', () => {
    useAppStore.getState().recordSpecimen(P, 7, 'c001', 'barbell-bench-press', NOW);
    const first = useAppStore.getState().specimens[P];
    useAppStore.getState().recordSpecimen(P, 7, 'c002', 'barbell-back-squat', NOW + 5_000);
    // Identity, not equality: an unchanged write must cost no state object and no save.
    expect(useAppStore.getState().specimens[P]).toBe(first);
    expect(useAppStore.getState().specimens[P]?.acquired['c002']).toBeUndefined();
  });

  /*
   * The plan's step 6 rule, "first acquisition wins". The ordinal guard alone does not give it:
   * a SECOND ordinal carrying a card the collection already holds passed straight through, so
   * `acquired[cardId]` was rewritten with the later instant and exercise and two ordinals were
   * left pointing at one card. A card is acquired once, by the set that first produced it.
   */
  it('is idempotent on an owned card: a later ordinal cannot re-acquire it', () => {
    useAppStore.getState().recordSpecimen(P, 5, 'c001', 'barbell-bench-press', NOW);
    const before = useAppStore.getState();
    const first = before.specimens[P];

    useAppStore.getState().recordSpecimen(P, 6, 'c001', 'pull-up', NOW + 5_000);

    // Identity at both levels: no new state object, so no persistence write and no re-render.
    expect(useAppStore.getState()).toBe(before);
    expect(useAppStore.getState().specimens[P]).toBe(first);
    // The first acquisition's instant [ms] and exercise stand.
    expect(first?.acquired['c001']).toEqual({ at: NOW, exerciseId: 'barbell-bench-press' });
    // Ordinal 6 [sets] is not spent either: the call wrote nothing at all.
    expect(first?.acquiredByOrdinal).toEqual({ '5': 'c001' });
    expect(Object.hasOwn(first?.acquiredByOrdinal ?? {}, '6')).toBe(false);
  });

  it('creates the inventory for a profile that has none', () => {
    useAppStore.setState(makeAppState({ specimens: {} }));
    useAppStore.getState().recordSpecimen(P, 1, 'r003', null, NOW);
    const inv = useAppStore.getState().specimens[P];
    expect(inv?.profileId).toBe(P);
    expect(inv?.totalSetsLogged).toBe(0); // [sets]
    expect(Object.keys(inv?.acquired ?? {})).toEqual(['r003']);
  });

  it('ignores an unknown card id', () => {
    useAppStore.getState().recordSpecimen(P, 1, 'not-a-card', null, NOW);
    expect(useAppStore.getState().specimens[P]?.acquired).toEqual({});
    expect(useAppStore.getState().specimens[P]?.acquiredByOrdinal).toBeUndefined();
  });

  it('throws on a profile nobody owns', () => {
    expect(() => {
      useAppStore.getState().recordSpecimen('ghost', 1, 'c001', null, NOW);
    }).toThrow(/not a known profile/);
  });
});

describe('setCapsule', () => {
  beforeEach(seed);

  it('stores and clears a capsule', () => {
    const capsule: TimeCapsule = {
      note: 'why I started',
      writtenAt: NOW, // [ms] epoch, UTC
      opensOn: '2026-10-19',
      opened: false,
    };
    useAppStore.getState().setCapsule(P, capsule);
    expect(useAppStore.getState().capsules[P]).toEqual(capsule);
    useAppStore.getState().setCapsule(P, null);
    expect(useAppStore.getState().capsules[P]).toBeNull();
  });

  it('throws on a profile nobody owns', () => {
    expect(() => {
      useAppStore.getState().setCapsule('ghost', null);
    }).toThrow(/not a known profile/);
  });
});

describe('setUi', () => {
  beforeEach(seed);

  it('patches ui preferences without dropping the others', () => {
    useAppStore.getState().setUi({ bootSeen: false });
    const ui = useAppStore.getState().ui;
    expect(ui.bootSeen).toBe(false);
    expect(ui.density).toBe('normal');
    expect(ui.lastBlockSeenByProfile).toEqual({});
  });

  it('carries lastBlockSeenByProfile through a patch', () => {
    useAppStore.getState().setUi({ lastBlockSeenByProfile: { [P]: 2 } });
    expect(useAppStore.getState().ui.lastBlockSeenByProfile).toEqual({ [P]: 2 });
    useAppStore.getState().setUi({ density: 'compact' });
    expect(useAppStore.getState().ui.lastBlockSeenByProfile).toEqual({ [P]: 2 });
  });
});

describe('logSet, deleteSet and the set counter', () => {
  beforeEach(seed);

  // A46: two logs in one batch must both count. The increment reads the updater's own
  // argument, never a render closure.
  it('increments totalSetsLogged once per logged set, even back to back', () => {
    useAppStore.getState().logSet(BASE_SET, NOW);
    useAppStore.getState().logSet({ ...BASE_SET, setNumber: 2 }, NOW + 1_000);
    expect(useAppStore.getState().specimens[P]?.totalSetsLogged).toBe(2); // [sets]
  });

  // A60: a bodyweight set stores loadKg 0 and counts like any other.
  it('counts a bodyweight set logged at 0 kg', () => {
    useAppStore.getState().logSet({ ...BASE_SET, exerciseId: 'pull-up', loadKg: 0 }, NOW);
    expect(useAppStore.getState().specimens[P]?.totalSetsLogged).toBe(1); // [sets]
  });

  it('creates the inventory when the profile has none yet', () => {
    useAppStore.setState(makeAppState({ specimens: {} }));
    useAppStore.getState().logSet(BASE_SET, NOW);
    expect(useAppStore.getState().specimens[P]?.totalSetsLogged).toBe(1); // [sets]
    expect(useAppStore.getState().specimens[P]?.profileId).toBe(P);
  });

  // A47: the counter must track the real set count, not a monotonic tally.
  it('decrements the counter when a set is deleted, clamped at zero', () => {
    const id = useAppStore.getState().logSet(BASE_SET, NOW);
    expect(useAppStore.getState().specimens[P]?.totalSetsLogged).toBe(1); // [sets]
    useAppStore.getState().deleteSet(id);
    expect(useAppStore.getState().specimens[P]?.totalSetsLogged).toBe(0); // [sets]
    useAppStore.getState().deleteSet(id);
    expect(useAppStore.getState().specimens[P]?.totalSetsLogged).toBe(0); // [sets]
  });

  it('puts the counter back when a delete is undone', () => {
    const id = useAppStore.getState().logSet(BASE_SET, NOW);
    useAppStore.getState().deleteSet(id);
    useAppStore.getState().undoDelete();
    expect(Object.keys(useAppStore.getState().sets)).toHaveLength(1);
    expect(useAppStore.getState().specimens[P]?.totalSetsLogged).toBe(1); // [sets]
  });
});

describe('attemptSpecimenDraw', () => {
  beforeEach(seed);

  it('records the drawn card against the just-logged set ordinal and returns it', () => {
    const ordinal = firstHittingOrdinal(1);
    seedAtOrdinal(ordinal);
    useAppStore.getState().logSet(BASE_SET, NOW);
    const card = useAppStore.getState().attemptSpecimenDraw(P, 'barbell-bench-press', NOW);
    expect(card).not.toBeNull();
    const inv = useAppStore.getState().specimens[P];
    expect(inv?.acquired[card?.id ?? '']).toEqual({ at: NOW, exerciseId: 'barbell-bench-press' });
    expect(inv?.acquiredByOrdinal?.[String(ordinal)]).toBe(card?.id);
  });

  it('returns null and records nothing on an ordinal whose roll fails', () => {
    const hit = firstHittingOrdinal(1);
    // The ordinal before the first hit is by construction a miss.
    seedAtOrdinal(hit - 1 > 0 ? hit - 1 : hit + 1);
    useAppStore.getState().logSet(BASE_SET, NOW);
    expect(useAppStore.getState().attemptSpecimenDraw(P, null, NOW)).toBeNull();
    expect(useAppStore.getState().specimens[P]?.acquired).toEqual({});
  });

  it('returns null before any set is logged, so no card is credited to ordinal zero', () => {
    expect(useAppStore.getState().attemptSpecimenDraw(P, null, NOW)).toBeNull();
    expect(useAppStore.getState().specimens[P]?.acquired).toEqual({});
  });

  it('returns null once the pool is exhausted', () => {
    const acquired: Record<string, { at: number; exerciseId: string | null }> = {};
    for (const c of SPECIMEN_CARDS) acquired[c.id] = { at: NOW, exerciseId: null };
    useAppStore.setState(
      makeAppState({
        specimens: { [P]: makeInventory({ acquired, totalSetsLogged: 100 /* [sets] */ }) },
      }),
    );
    expect(useAppStore.getState().attemptSpecimenDraw(P, null, NOW)).toBeNull();
  });

  it('is reproducible: the same profile and ordinal always yield the same card', () => {
    const ordinal = firstHittingOrdinal(1);
    seedAtOrdinal(ordinal);
    useAppStore.getState().logSet(BASE_SET, NOW);
    const a = useAppStore.getState().attemptSpecimenDraw(P, null, NOW);
    seedAtOrdinal(ordinal);
    useAppStore.getState().logSet(BASE_SET, NOW);
    const b = useAppStore.getState().attemptSpecimenDraw(P, null, NOW);
    expect(a?.id).toBe(b?.id);
    expect(a?.id).toBeDefined();
  });

  // Master plan section 10.8, rule 3. Delete and relog reuses the ordinal, and the ordinal
  // ledger returns the card it already produced instead of rolling a second one.
  it('returns the recorded card on a delete-and-relog, taking no second acquisition', () => {
    const ordinal = firstHittingOrdinal(1);
    seedAtOrdinal(ordinal);
    const id = useAppStore.getState().logSet(BASE_SET, NOW);
    const first = useAppStore.getState().attemptSpecimenDraw(P, 'barbell-bench-press', NOW);
    expect(first).not.toBeNull();

    useAppStore.getState().deleteSet(id);
    useAppStore.getState().logSet(BASE_SET, NOW + 60_000);
    const second = useAppStore.getState().attemptSpecimenDraw(P, 'pull-up', NOW + 60_000);

    expect(second?.id).toBe(first?.id);
    expect(Object.keys(useAppStore.getState().specimens[P]?.acquired ?? {})).toHaveLength(1);
    // The first acquisition's instant and exercise stand; the relog does not rewrite them.
    expect(useAppStore.getState().specimens[P]?.acquired[first?.id ?? '']).toEqual({
      at: NOW,
      exerciseId: 'barbell-bench-press',
    });
  });

  // Code review A57 and master plan section 10.7: the draw is seeded from stored state, so a
  // re-invoked updater, a replayed action or a second call cannot reroll it. Nothing in the
  // path may reach an ambient generator.
  it('consumes no ambient randomness: Math.random is never called', () => {
    const spy = vi.spyOn(Math, 'random');
    const ordinal = firstHittingOrdinal(1);
    seedAtOrdinal(ordinal);
    useAppStore.getState().logSet(BASE_SET, NOW);
    expect(useAppStore.getState().attemptSpecimenDraw(P, null, NOW)).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('survives parseState(exportJson()) with its collection and its ordinal ledger', () => {
    const ordinal = firstHittingOrdinal(1);
    seedAtOrdinal(ordinal);
    useAppStore.getState().logSet(BASE_SET, NOW);
    const card = useAppStore.getState().attemptSpecimenDraw(P, 'barbell-bench-press', NOW);
    expect(card).not.toBeNull();

    const parsed = parseState(JSON.parse(useAppStore.getState().exportJson()) as unknown);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const inv = parsed.state.specimens[P];
    expect(inv?.acquired[card?.id ?? '']).toEqual({ at: NOW, exerciseId: 'barbell-bench-press' });
    expect(inv?.acquiredByOrdinal).toEqual({ [String(ordinal)]: card?.id });
    expect(inv?.totalSetsLogged).toBe(ordinal); // [sets]
  });
});
