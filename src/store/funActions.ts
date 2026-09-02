// src/store/funActions.ts
//
// The store's fun-mechanics actions (master plan section 6.7, P8). Structured like
// src/store/motivationActions.ts and src/store/reminderActions.ts: a slice built from an
// adapter over zustand's `set`, so the slice sees a pure AppState -> AppState transition and
// knows nothing about zustand, persistence or the status slice.
//
// It takes `get` as well, which neither of those two needs. attemptSpecimenDraw has to READ
// the document (the inventory, and the ordinal logSet's increment just produced), decide, and
// only then write; and that read must happen OUTSIDE any state updater, because React may
// invoke an updater more than once for a single dispatch and an updater that decides is not
// idempotent (code review A57). So the decision sits here, between a get() and a set(), and
// every write below is a pure function of the state it is handed.
//
// NO AMBIENT RANDOMNESS. Nothing in this file reaches Math.random or systemRng. Every draw is
// seeded from stored state through drawSpecimenForLoggedSet (master plan sections 10.7 and
// 10.8), so the same logged set always yields the same roll however often it is replayed: a
// re-render, a double-invoked updater, a replayed migration or a second call from the view all
// return the card that ordinal already produced. funActions.test.ts spies on Math.random and
// asserts zero calls.
//
// No error channel, for the reason motivationActions.ts gives: neither recording a drawn card
// nor writing a capsule can be REFUSED. The one thing that can go wrong is a caller naming a
// profile nobody owns, which is a defect rather than a refusal, so it throws and reaches
// RootErrorBoundary with its stack. Both `specimens` and `capsules` are profile-keyed maps the
// schema's root refinement checks, so a write under an unowned key would produce a document
// that cannot be saved and would lose data silently at the next load.
//
// Units: `now` and TimeCapsule.writtenAt are [ms] epoch UTC. `ordinal` is [sets] - the
// position of a logged set in the profile's history, counted from 1.

import { SPECIMEN_BY_ID, SPECIMEN_CARDS } from '../content/specimenCards';
import type { SpecimenCard } from '../content/specimenCards';
import {
  SPECIMEN_DROP_CHANCE,
  drawSpecimenForLoggedSet,
  recordSpecimenDraw,
} from '../domain/fun/specimens';
import { requireProfile } from './scheduleActions';
import type { AppState, EpochMs, SpecimenInventory, TimeCapsule } from '../domain/types';

export interface FunActionDeps {
  /** Applies a pure AppState transition. Zustand's `set` is adapted to this in index.ts. */
  set(updater: (state: AppState) => AppState): void;
  /** The current document, read outside any updater. Zustand's `get` is adapted in index.ts. */
  get(): AppState;
}

export interface FunActions {
  /**
   * Records one drawn card against both its id and the set ordinal that produced it.
   *
   * Idempotent on BOTH the ordinal and the card, and in both cases the document is left
   * untouched by reference. A second call for an ordinal that has already produced a card
   * writes nothing, so a double-invoked updater, a replayed action or a delete-and-relog at the
   * reused ordinal cannot take a second acquisition; a call naming a card the collection
   * already holds writes nothing either, so a card cannot be re-acquired under a later ordinal
   * (the plan's step 6, "first acquisition wins"). The first acquisition's instant and exercise
   * therefore stand, and each ordinal in the ledger names the set that really produced its
   * card.
   *
   * An id no shipped card owns records nothing. It would put a value in the collection that no
   * view can render, and the ordinal it spent could never be reconciled against a real card.
   *
   * @param ordinal [sets] the logged set's own ordinal: totalSetsLogged read AFTER logSet's
   *   increment, with no `+ 1` (master plan section 10.8, rule 1).
   * @param now [ms] epoch UTC, the instant the set was logged.
   */
  recordSpecimen(
    profileId: string,
    ordinal: number,
    cardId: string,
    exerciseId: string | null,
    now: EpochMs,
  ): void;
  /**
   * Stores the profile's time capsule, or clears it with null.
   *
   * Whole record, not a patch: `opensOn` and `opened` are read together by the panel that
   * decides whether the capsule may be opened, and a patch API would let a caller move the
   * opening date without saying whether it had been opened.
   *
   * An unchanged write is a no-op by identity, and an absent key counts as null: clearing a
   * capsule a profile never wrote is the common case, and minting a new map for it would cost
   * a persistence write and re-render every subscriber for nothing.
   */
  setCapsule(profileId: string, capsule: TimeCapsule | null): void;
  /**
   * Rolls for a specimen drop on the profile's most recently logged set and records the
   * result, returning the card or null.
   *
   * Takes no generator. The plan's draft signature had an `rng` parameter defaulting to
   * `systemRng`, which is superseded by master plan section 10.8: the roll is seeded from
   * `(profileId, ordinal)`, both of which are stored state, so the draw is a function of the
   * document rather than of when it was called. That is what lets logSet call this and the
   * Train view call it again for the same set without a second card dropping.
   *
   * Returns null when nothing has been logged for the profile yet (ordinal 0 belongs to no
   * set), when the roll fails, or when the pool is exhausted. Never throws except on a profile
   * nobody owns.
   *
   * @param now [ms] epoch UTC, the instant the set was logged; stored as the acquisition time.
   */
  attemptSpecimenDraw(
    profileId: string,
    exerciseId: string | null,
    now: EpochMs,
  ): SpecimenCard | null;
}

/**
 * The profile's inventory, or an empty one for a profile that has drawn nothing.
 *
 * Exported because the P4 log transformers in ./training.ts maintain `totalSetsLogged` and
 * must mint an absent inventory exactly the way this slice does. Absent is the honest value
 * for a profile that has never logged a set (src/store/index.ts, createProfile), so the empty
 * inventory is materialised at the first write and not before.
 */
export function inventoryOf(
  specimens: AppState['specimens'],
  profileId: string,
): SpecimenInventory {
  return specimens[profileId] ?? { profileId, acquired: {}, totalSetsLogged: 0 /* [sets] */ };
}

export function createFunActions(deps: FunActionDeps): FunActions {
  const recordSpecimen: FunActions['recordSpecimen'] = (
    profileId,
    ordinal,
    cardId,
    exerciseId,
    now,
  ) => {
    deps.set((s) => {
      requireProfile(s, 'recordSpecimen', profileId);
      const card = SPECIMEN_BY_ID[cardId];
      if (card === undefined) return s;
      const inventory = inventoryOf(s.specimens, profileId);
      // First acquisition wins (the plan's step 6). A card the collection already holds is not
      // re-acquired under a fresh ordinal: without this the second call rewrote acquired[cardId]
      // with the later instant and exercise and left two ordinals pointing at one card. The
      // ordinal is NOT spent either - nothing is written - so the ledger keeps naming the set
      // that actually produced the card.
      if (Object.hasOwn(inventory.acquired, cardId)) return s;
      const next = recordSpecimenDraw(inventory, ordinal, card, now, exerciseId);
      // recordSpecimenDraw returns its argument BY REFERENCE when the ordinal is already
      // spent. Identity is the store's no-op signal, so that case costs no state object, no
      // persistence write and no re-render.
      if (next === inventory) return s;
      return { ...s, specimens: { ...s.specimens, [profileId]: next } };
    });
  };

  const setCapsule: FunActions['setCapsule'] = (profileId, capsule) => {
    deps.set((s) => {
      requireProfile(s, 'setCapsule', profileId);
      // `?? null` so an absent key and a stored null compare equal: they are the same state to
      // every reader, and writing one over the other is a save that records nothing.
      if ((s.capsules[profileId] ?? null) === capsule) return s;
      return { ...s, capsules: { ...s.capsules, [profileId]: capsule } };
    });
  };

  const attemptSpecimenDraw: FunActions['attemptSpecimenDraw'] = (profileId, exerciseId, now) => {
    const state = deps.get();
    requireProfile(state, 'attemptSpecimenDraw', profileId);
    const inventory = state.specimens[profileId];
    // The ordinal of the set just logged, master plan section 10.8 rule 1. Zero means this
    // profile has logged nothing, so there is no set for a card to be credited to.
    const ordinal = inventory?.totalSetsLogged ?? 0; // [sets]
    if (ordinal < 1) return null;
    const card = drawSpecimenForLoggedSet(
      inventory,
      SPECIMEN_CARDS,
      profileId,
      ordinal,
      SPECIMEN_DROP_CHANCE,
    );
    if (card === null) return null;
    // Recording is idempotent on the ordinal, so this is safe to reach on every call: the
    // second caller for one set gets the same card back and writes nothing.
    recordSpecimen(profileId, ordinal, card.id, exerciseId, now);
    return card;
  };

  return { recordSpecimen, setCapsule, attemptSpecimenDraw };
}
