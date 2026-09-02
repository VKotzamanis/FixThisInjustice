// src/store/scheduleSelectors.ts
//
// React-facing schedule selectors (master plan §6.7, P3). These are hooks, so they live apart
// from the pure derivations in selectors.ts, and they derive rather than store: nothing here
// is written back to the document (master plan §3, no derived values persisted).
//
// Memoisation is not an optimisation here, it is a correctness requirement. projectedCalendar
// builds a fresh array on every call, and zustand 5 compares snapshots with Object.is and has
// no equality-function overload, so a selector that returns a new array each time makes
// useSyncExternalStore re-render until React gives up ("The result of getSnapshot should be
// cached to avoid an infinite loop").
//
// Results are memoised on the identity of the DOCUMENT SLICES the derivation reads, not on the
// identity of the store object. The store object is replaced by every set(), including the
// ones that write only the non-persisted `status` slice — a refusal message, a save failure —
// and keying on it made every one of those invalidate every calendar entry and hand
// useSyncExternalStore a fresh array for a document that had not changed. The slices are
// replaced rather than mutated by every action that touches them (cursor.ts and calendar.ts
// are pure), so identity is a sound stand-in for value equality here.
//
// Every hook that needs today's civil date takes an optional `now` [ms] epoch, UTC. It
// defaults to the wall clock and exists so a test can pin the day; the date itself is always
// derived through todayLocal in the profile's own zone, never from a raw instant.

import { useCallback } from 'react';
import { deviceTimeZone, todayLocal } from '../domain/dates';
import type { CalendarDay } from '../domain/schedule/calendar';
import { projectedCalendar, remainingLabelsThisWeek } from '../domain/schedule/calendar';
import type {
  AppState,
  EpochMs,
  LocalDate,
  PlanCursor,
  PlanTemplate,
  TimeZone,
  WeeklyReview,
} from '../domain/types';
import { useAppStore } from './index';
import { useActivePlan } from './selectors';

/*
 * One frozen instance per empty result, shared by every caller. A fresh [] would be a new
 * snapshot on every render for exactly the states that have nothing to show — no profile, no
 * plan — which is the loop described above.
 */
const EMPTY_DAYS: readonly CalendarDay[] = Object.freeze([]);
const EMPTY_LABELS: readonly string[] = Object.freeze([]);
const EMPTY_REVIEWS: readonly WeeklyReview[] = Object.freeze([]);

/**
 * The document slices both derivations in this file read, in a fixed order.
 *
 * calendar.ts reads exactly these five (availability, plans, cursors, pauses, assignments) and
 * nothing else — no profile, no ui, and none of the log arrays — so a change to any other part
 * of the document cannot change a projected calendar or a remaining-labels list. Adding a read
 * to calendar.ts means adding its slice here; leaving it out would serve a stale result, so
 * this list is the one thing to keep in step with that module.
 */
function documentSlices(state: AppState): readonly object[] {
  return [state.availability, state.plans, state.cursors, state.pauses, state.assignments];
}

function sameSlices(a: readonly object[], b: readonly object[]): boolean {
  return a.length === b.length && a.every((slice, i) => slice === b[i]);
}

interface CacheEntry<T> {
  /** The slice identities the value was computed from; the entry is valid while they hold. */
  slices: readonly object[];
  value: T;
}

/*
 * The WeakMap is anchored on `assignments` — any of the five slices would do — so that the
 * cache of a document nothing refers to any more can be collected with it, which is what a
 * WeakMap buys and a plain Map would not. The anchor is a container, not the cache key: what
 * decides a hit is the slice comparison in cached(), so a change to any OTHER slice reuses the
 * bucket and overwrites the entry rather than serving it.
 */
const calendarCache = new WeakMap<object, Map<string, CacheEntry<readonly CalendarDay[]>>>();
const labelCache = new WeakMap<object, Map<string, CacheEntry<readonly string[]>>>();

function cached<T>(
  store: WeakMap<object, Map<string, CacheEntry<T>>>,
  state: AppState,
  key: string,
  compute: () => T,
): T {
  const slices = documentSlices(state);
  let byKey = store.get(state.assignments);
  if (!byKey) {
    byKey = new Map<string, CacheEntry<T>>();
    store.set(state.assignments, byKey);
  }
  const hit = byKey.get(key);
  if (hit && sameSlices(hit.slices, slices)) return hit.value;
  const fresh = compute();
  byKey.set(key, { slices, value: fresh });
  return fresh;
}

/** The projected calendar for `days` days from `from`, memoised on this state object. */
export function selectCalendar(
  state: AppState,
  profileId: string,
  from: LocalDate,
  days: number, // [d] whole calendar days
): readonly CalendarDay[] {
  return cached(calendarCache, state, `cal|${profileId}|${from}|${String(days)}`, () =>
    projectedCalendar(state, profileId, from, days),
  );
}

/** The labels assignToday will honour on `date`, memoised on this state object. */
export function selectRemainingLabels(
  state: AppState,
  profileId: string,
  date: LocalDate,
): readonly string[] {
  return cached(labelCache, state, `lab|${profileId}|${date}`, () =>
    remainingLabelsThisWeek(state, profileId, date),
  );
}

/**
 * The zone every civil date in the UI is read in.
 *
 * Falls back to the device zone only while there is no profile, which is the setup wizard's
 * situation. A profile always carries its own zone, and that is what a date must be read in:
 * the device zone is where the phone is, not where the training week is kept.
 */
export function selectTimeZone(state: AppState): TimeZone {
  const id = state.activeProfileId;
  const profile = id === null ? undefined : state.profiles[id];
  return profile ? profile.timezone : deviceTimeZone();
}

/**
 * The plan the active profile is working through, read through the cursor.
 *
 * `plans` holds every plan the profile has ever run (setPlan keeps the one it replaces, so
 * logged sets can still resolve their session ids), so the cursor is the only record that
 * says which one is current. This is the pure form, for a caller that needs the derivation
 * inside a store subscription of its own; the hook form is selectors.ts's useActivePlan(),
 * which usePlan() below is a name for.
 */
export function selectPlan(state: AppState): PlanTemplate | null {
  const id = state.activeProfileId;
  if (id === null) return null;
  const cursor = state.cursors[id];
  if (!cursor) return null;
  return state.plans[cursor.planId] ?? null;
}

export function selectCursor(state: AppState): PlanCursor | null {
  const id = state.activeProfileId;
  if (id === null) return null;
  return state.cursors[id] ?? null;
}

export function useActiveProfileId(): string | null {
  return useAppStore((s: AppState) => s.activeProfileId);
}

export function useTimeZone(): TimeZone {
  return useAppStore(selectTimeZone);
}

/**
 * Today's LocalDate in the active profile's zone. Never Date#toISOString, which would answer
 * with the UTC day and be wrong for part of every day in every zone but one.
 *
 * @param now [ms] epoch, UTC. Defaults to the wall clock.
 */
export function useTodayDate(now: EpochMs = Date.now()): LocalDate {
  return todayLocal(useTimeZone(), now);
}

/**
 * Master plan §6.7's name for P2's useActivePlan, and nothing more than a name for it.
 *
 * It used to subscribe with selectPlan, which made two hooks over one derivation: identical
 * today, free to drift tomorrow, and a reviewer reading either one had no way to know the
 * other existed. One derivation, two spellings, is the arrangement useCursor/useActiveCursor
 * already uses below.
 */
export function usePlan(): PlanTemplate | null {
  return useActivePlan();
}

export function useCursor(): PlanCursor | null {
  return useAppStore(selectCursor);
}

/** Master plan §6.7's name for useCursor, kept so both spellings resolve to one selector. */
export function useActiveCursor(): PlanCursor | null {
  return useCursor();
}

/**
 * Why the last schedule action the user attempted was refused, or null when nothing is
 * standing (master plan §6.4 as amended; the field is documented on StoreStatus in index.ts).
 *
 * The read half of the refusal channel, so the banner subscribes to one selector rather than
 * reaching into `status` through a selector of its own; clearActionError() is the write half
 * the dismiss control calls. The value is a string, which useSyncExternalStore compares by
 * value, so this selector cannot loop however often the store notifies.
 *
 * It reads the non-persisted `status` slice rather than the document, which is why it takes
 * the store type rather than AppState: a refusal is a fact about one attempt, never a field of
 * the document (master plan §3).
 */
export function useActionError(): string | null {
  return useAppStore((s) => s.status.lastActionError);
}

/** Every closed week for the active profile, oldest first. Empty until a week has ended. */
export function useWeeklyReviews(): readonly WeeklyReview[] {
  return useAppStore((s: AppState) => {
    const id = s.activeProfileId;
    if (id === null) return EMPTY_REVIEWS;
    // The stored array itself, so the snapshot is stable between unrelated updates.
    return s.weeklyReviews[id] ?? EMPTY_REVIEWS;
  });
}

/**
 * The next `days` days of the calendar, starting today.
 *
 * @param days [d] whole calendar days
 * @param now [ms] epoch, UTC. Defaults to the wall clock.
 */
export function useUpcoming(days: number, now: EpochMs = Date.now()): readonly CalendarDay[] {
  const from = useTodayDate(now);
  // A stable selector identity is not required by zustand (it re-runs the selector on every
  // notification anyway), but useCallback keeps the closure from being rebuilt per render and
  // makes the two things it depends on explicit.
  const select = useCallback(
    (s: AppState): readonly CalendarDay[] => {
      const id = s.activeProfileId;
      return id === null ? EMPTY_DAYS : selectCalendar(s, id, from, days);
    },
    [from, days],
  );
  return useAppStore(select);
}

/** Today's CalendarDay, or null before setup. */
export function useTodayPlan(now: EpochMs = Date.now()): CalendarDay | null {
  return useUpcoming(1, now)[0] ?? null;
}

/** The labels assignToday will honour on `date`; empty for a null date or no profile. */
export function useRemainingLabels(date: LocalDate | null): readonly string[] {
  const select = useCallback(
    (s: AppState): readonly string[] => {
      const id = s.activeProfileId;
      if (id === null || date === null) return EMPTY_LABELS;
      return selectRemainingLabels(s, id, date);
    },
    [date],
  );
  return useAppStore(select);
}

/**
 * The labels the current week still has to offer today: what the pick-today control lists.
 *
 * @param now [ms] epoch, UTC. Defaults to the wall clock.
 */
export function useRemainingLabelsThisWeek(now: EpochMs = Date.now()): readonly string[] {
  return useRemainingLabels(useTodayDate(now));
}
