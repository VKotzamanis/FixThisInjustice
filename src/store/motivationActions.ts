// src/store/motivationActions.ts
//
// The store's motivation actions (master plan §6.7, P6). Structured like
// src/store/scheduleActions.ts: a slice built from an adapter over zustand's `set`, so the
// slice sees a pure AppState -> AppState transition and knows nothing about zustand,
// persistence or the status slice.
//
// It carries no error channel, and that is a statement rather than an omission. The schedule
// slice has one because the schedule domain REFUSES — a paused day, a session already open —
// and a refusal is a legal state the user can act on. Neither action here can be refused:
// dismissing a popup and naming a video file are always honoured. The one thing that can go
// wrong is a caller handing over a profile id nobody owns, and that is a defect, not a
// refusal, so it throws and reaches RootErrorBoundary with its stack (the argument
// requireProfile's own doc comment makes; `motivation` is one of the profile-keyed maps the
// schema's root refinement checks, so a write under an unowned key would produce a document
// that cannot be saved and would lose data silently at the next load).
//
// IndexedDB is not touched here. `setCustomVideo` stores an asset id and nothing else; the
// blob lives in the object store src/domain/motivation/assets.ts owns, and deleting the asset
// a replaced id used to name belongs to the caller that has the file in hand, not to a
// synchronous store action that cannot await anything.

import { compareLocalDate } from '../domain/dates';
import { requireProfile } from './scheduleActions';
import type { AppState, EpochMs, LocalDate, MotivationState, WeeklyReview } from '../domain/types';

export interface MotivationActionDeps {
  /** Applies a pure AppState transition. Zustand's `set` is adapted to this in index.ts. */
  set(updater: (state: AppState) => AppState): void;
}

export interface MotivationActions {
  /**
   * Records that the popup was answered for `weekStart`, and closes the backlog behind it.
   *
   * Three writes, all of them durable:
   *   motivation[profileId].lastShownForWeek — the week just answered
   *   motivation[profileId].lastShownAt      — when, in epoch milliseconds UTC
   *   weeklyReviews[profileId][].missHandled — true on that week AND on every OLDER week that
   *                                            is still an unhandled miss
   *
   * The backlog half is the reason this rule lives in the store rather than in
   * `pendingMotivation`, which is a reader and leaves `missHandled` alone (master plan §10.5).
   * `closeWeeks` back-fills up to MAX_WEEKS_EVALUATED = 520 weeks from a back-dated
   * `setPlan`, so a first run can produce years of unhandled misses. The 14 day window keeps
   * the popup from OFFERING them, but on its own it strands them unhandled for ever: move the
   * clock back, or back-date another plan, and the queue returns. One Dismiss therefore
   * answers the whole of the history up to and including the week shown — the user has been
   * told they missed a week, and being told again about older ones is a fault report, not
   * motivation.
   *
   * Two boundaries on that sweep:
   *   - Only OLDER weeks. A miss from a LATER week is a separate event, and nothing has asked
   *     the user about it: the popup reports one week at a time, so an answer covers the week
   *     shown and the history behind it, never a week still ahead of it. No caller shows a
   *     week out of order today: the Settings preview passes `review={null}` and records
   *     nothing at all. The boundary states what one answer can close, and does not depend on
   *     which callers exist.
   *   - Only MISSES. A week that met its target, and a week overlapping a PlanPause, are not
   *     misses at all; nothing was ever asked about them, so their flag is left where
   *     `closeWeeks` put it rather than being rewritten to say a question was answered.
   *
   * The week named by `weekStart` is marked handled whatever its delta, because it is the one
   * the user actually answered. That covers a week that met its target and a week that was
   * paused: neither is a miss, but either can be the week on screen.
   *
   * Dismissing the same week twice is a no-op down to object identity: the transition returns
   * the state it was given, which is the only thing zustand treats as no change at all (it
   * compares with Object.is before notifying, so no subscriber runs and no write is queued).
   * `lastShownAt` therefore records the FIRST dismissal of a week rather than the last, which
   * is the instant the question was answered. Nothing reads it: `pendingMotivation` gates on
   * `lastShownForWeek` and `missHandled`, and the field exists to be exported.
   *
   * @param now [ms] epoch UTC. The caller owns the clock, as everywhere else in this contract.
   */
  markMotivationShown(profileId: string, weekStart: LocalDate, now: EpochMs): void;
  /**
   * Points the profile's motivation clip at a stored asset, or back at the shipped default
   * with null. Writes the id only: the blob is IndexedDB's, and a caller replacing an id is
   * the one that must delete the asset the old id named.
   */
  setCustomVideo(profileId: string, assetId: string | null): void;
}

/** Is this review a week the user actually fell short in, and has not answered yet? */
function isUnhandledMiss(r: WeeklyReview): boolean {
  // delta = completed − target, in sessions; negative = sessions missed. A paused week is
  // never a miss (master plan §6.4).
  return r.delta < 0 && !r.paused && !r.missHandled;
}

/**
 * The reviews with `weekStart` and every older unhandled miss marked handled.
 *
 * Returns the array it was given when nothing changed. Identity is the store's no-op signal:
 * the persistence subscription compares the persisted fields by reference, so an unchanged
 * array must not be minted again or a second Dismiss of the same week would cost a write and
 * re-render every subscriber of the review list.
 */
function handleBacklog(reviews: WeeklyReview[], weekStart: LocalDate): WeeklyReview[] {
  let changed = false;
  const next = reviews.map((r) => {
    const order = compareLocalDate(r.weekStart, weekStart); // -1 older, 0 the same week, 1 later
    if (order === 1) return r;
    if (order === -1 && !isUnhandledMiss(r)) return r;
    if (r.missHandled) return r;
    changed = true;
    return { ...r, missHandled: true };
  });
  return changed ? next : reviews;
}

export function createMotivationActions(deps: MotivationActionDeps): MotivationActions {
  return {
    markMotivationShown: (profileId, weekStart, now) => {
      deps.set((s) => {
        requireProfile(s, 'markMotivationShown', profileId);
        const prev = s.motivation[profileId];
        // undefined === undefined when the profile has no reviews at all: nothing to back-fill
        // is the same answer as nothing left to back-fill.
        const reviews = s.weeklyReviews[profileId];
        const handled = reviews === undefined ? undefined : handleBacklog(reviews, weekStart);
        const backlogSettled = handled === reviews;
        // A repeat dismissal of the week already recorded changes nothing that is stored, so
        // it returns the state itself rather than a copy that happens to hold equal values.
        // index.ts's persistedChanged compares the top-level fields by identity, so a rebuilt
        // `motivation` record IS a persistence write and a re-render of every subscriber; and
        // zustand skips the notification entirely when the updater returns its own argument.
        if (backlogSettled && prev !== undefined && prev.lastShownForWeek === weekStart) {
          return s;
        }
        const next: MotivationState = {
          profileId,
          lastShownForWeek: weekStart,
          lastShownAt: now, // [ms] epoch, UTC
          // The clip the user chose is not part of what a dismissal answers.
          customVideoAssetId: prev?.customVideoAssetId ?? null,
        };
        // The outer record is rebuilt only when the array under it actually changed: the
        // guard above has already returned for the case where nothing changed at all, and
        // this keeps `weeklyReviews` untouched when only `motivation` moved. The undefined
        // arm is redundant with `backlogSettled` and is what narrows the type of `handled`.
        return {
          ...s,
          motivation: { ...s.motivation, [profileId]: next },
          weeklyReviews:
            handled === undefined || backlogSettled
              ? s.weeklyReviews
              : { ...s.weeklyReviews, [profileId]: handled },
        };
      });
    },

    setCustomVideo: (profileId, assetId) => {
      deps.set((s) => {
        requireProfile(s, 'setCustomVideo', profileId);
        const prev = s.motivation[profileId];
        const next: MotivationState = {
          profileId,
          // Choosing a clip answers nothing, so the shown week and its instant are carried
          // through untouched.
          lastShownForWeek: prev?.lastShownForWeek ?? null,
          lastShownAt: prev?.lastShownAt ?? null,
          customVideoAssetId: assetId,
        };
        return { ...s, motivation: { ...s.motivation, [profileId]: next } };
      });
    },
  };
}
