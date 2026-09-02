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
// cached to avoid an infinite loop"). Results are therefore memoised on the IDENTITY of the
// state object they were computed from: every action replaces the state object, so a cache
// entry can never outlive the document it describes, and a WeakMap lets old states be
// collected with their entries.
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

/*
 * One frozen instance per empty result, shared by every caller. A fresh [] would be a new
 * snapshot on every render for exactly the states that have nothing to show — no profile, no
 * plan — which is the loop described above.
 */
const EMPTY_DAYS: readonly CalendarDay[] = Object.freeze([]);
const EMPTY_LABELS: readonly string[] = Object.freeze([]);
const EMPTY_REVIEWS: readonly WeeklyReview[] = Object.freeze([]);

const calendarCache = new WeakMap<object, Map<string, readonly CalendarDay[]>>();
const labelCache = new WeakMap<object, Map<string, readonly string[]>>();

function cached<T>(
  store: WeakMap<object, Map<string, T>>,
  state: AppState,
  key: string,
  compute: () => T,
): T {
  let byKey = store.get(state);
  if (!byKey) {
    byKey = new Map<string, T>();
    store.set(state, byKey);
  }
  const hit = byKey.get(key);
  if (hit !== undefined) return hit;
  const fresh = compute();
  byKey.set(key, fresh);
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
 * says which one is current. selectors.ts's useActivePlan() is the same derivation in hook
 * form, shipped by P2; this is the pure form, which the calendar selectors below need
 * inside a store subscription.
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

export function usePlan(): PlanTemplate | null {
  return useAppStore(selectPlan);
}

export function useCursor(): PlanCursor | null {
  return useAppStore(selectCursor);
}

/** Master plan §6.7's name for useCursor, kept so both spellings resolve to one selector. */
export function useActiveCursor(): PlanCursor | null {
  return useCursor();
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
