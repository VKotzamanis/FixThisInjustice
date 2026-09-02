import { useMemo } from 'react';
import type {
  AppState,
  BodyMassEntry,
  IntakeEntry,
  LocalDate,
  PlanTemplate,
  Profile,
} from '../domain/types';
import type { NutritionInput, NutritionTargets } from '../domain/nutrition';
import { computeTargets } from '../domain/nutrition';
import { todayLocal } from '../domain/dates';
import type { SaveError } from './index';
import { useAppStore } from './index';
import { readRaw } from './persistence';

/**
 * The profile the app is currently operating on, or null before setup.
 *
 * Selector subscriptions are the point of Zustand here: the legacy store passed
 * one useState object into every view, so every keystroke re-rendered the whole
 * tree (A48). A component that reads only the active profile re-renders only
 * when that profile's object identity changes.
 *
 * The lookup returns the stored object itself, not a derived copy, so the
 * snapshot is referentially stable between renders — a new object per render
 * would make useSyncExternalStore loop.
 */
export function useActiveProfile(): Profile | null {
  return useAppStore((s) => {
    const id = s.activeProfileId;
    if (id === null) return null;
    return s.profiles[id] ?? null;
  });
}

/** True once hydrate() has run, whether or not it found a stored document. */
export function useHydrated(): boolean {
  return useAppStore((s) => s.status.hydrated);
}

/**
 * Non-null while the last persistence write failed; drives the blocking banner.
 * Typed through SaveError rather than by repeating its members, so a new
 * failure mode reaches the UI instead of stopping at a stale literal union.
 */
export function useSaveError(): SaveError | null {
  return useAppStore((s) => s.status.lastSaveError);
}

/** Non-null when the stored document failed validation on load. */
export function useLoadError(): string | null {
  return useAppStore((s) => s.status.lastLoadError);
}

/**
 * The raw text of the document that failed to load, for the recovery exports.
 *
 * The snapshot taken at hydrate time comes first and a live read is only the
 * fallback, because storage can move on underneath the banner — a wipeAll(), a
 * write from another tab, a store that has since become unreachable — while
 * the snapshot stays the user's copy of data the schema could not read. Null
 * only when there is nothing to offer at all.
 *
 * readRaw() is called during render rather than folded into the store selector
 * so a store update does not re-read Web Storage; the fallback is reached only
 * while the snapshot is null. Both branches return a string, which
 * useSyncExternalStore compares by value, so neither can loop.
 */
export function useLastLoadRaw(): string | null {
  const snapshot = useAppStore((s) => s.status.lastLoadRaw);
  return snapshot ?? readRaw();
}

/**
 * Newest body-mass entry by civil date, ties broken by the instant it was logged.
 *
 * A plain state function rather than a hook: the targets selector needs it
 * inside a store subscription, and P2's Today view needs it outside one. It
 * returns the stored object itself, so a subscribing selector that calls it
 * stays referentially stable between unrelated store updates.
 */
export function latestBodyMassEntry(state: AppState, profileId: string): BodyMassEntry | null {
  const list = state.bodyMass[profileId] ?? [];
  let best: BodyMassEntry | null = null;
  for (const e of list) {
    if (best === null) {
      best = e;
      continue;
    }
    // Civil date first, then the logging instant: two weigh-ins on one day are
    // ordered by when they were entered, not by the order of the array.
    if (e.date > best.date || (e.date === best.date && e.loggedAt > best.loggedAt)) best = e;
  }
  return best;
}

/**
 * Assemble the nutrition input from stored state. The latest logged body mass
 * and body fat win over the profile baseline, which is the content review
 * section 1 instruction: recompute the target at each body-mass re-measure, do
 * not hard-code it.
 */
export function nutritionInputFor(
  profile: Profile,
  latest: BodyMassEntry | null,
  sessionsPerWeek: number, // [sessions/week]
  todayIso: LocalDate,
): NutritionInput {
  const massKg = latest?.massKg ?? profile.body.baselineMassKg; // [kg]
  const bodyFatPct = latest?.bodyFatPct ?? profile.body.baselineBodyFatPct; // [%] or null
  // Age in whole years from the birth year, read in the profile's own zone. A
  // birthday during a session does not retrigger this: it is recomputed on the
  // next profile or body-mass change. Whole years is all the Mifflin-St Jeor
  // and the domain gate use, so the day of the birthday changes no number.
  const ageYears = Number(todayIso.slice(0, 4)) - profile.body.birthYear; // [year]
  return {
    sex: profile.body.sex,
    ageYears,
    heightCm: profile.body.heightCm, // [cm]
    massKg,
    bodyFatPct,
    activity: profile.activity,
    goal: profile.goal.kind,
    sessionsPerWeek,
    creatine: profile.supplements.creatine,
  };
}

/**
 * Memoised nutrition targets for the active profile.
 *
 * Null in two cases, neither of which is an error the UI has to handle: no
 * active profile, and a profile whose measurements fall outside
 * NUTRITION_DOMAIN. computeTargets throws RangeError in the second rather than
 * extrapolating an equation past the sample it was fitted on, which is the
 * right behaviour for a caller that can act on it: the setup wizard imports
 * the same bounds and blocks the value at the field. A rendering component
 * cannot act on it, and an exception thrown during render takes the tree down
 * with it, so the throw is converted to null here. Only RangeError is caught:
 * anything else is a defect in the engine and must still surface.
 *
 * The memo is keyed on the three inputs that can change a number. Each is read
 * through its own store subscription and each returns a stored reference, so an
 * unrelated write re-runs no arithmetic and the returned object keeps its
 * identity across re-renders.
 */
export function useNutritionTargets(): NutritionTargets | null {
  const profile = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.profiles[s.activeProfileId] ?? null),
  );
  const latest = useAppStore((s) =>
    s.activeProfileId === null ? null : latestBodyMassEntry(s, s.activeProfileId),
  );
  // [sessions/week] 0 until the wizard stores availability. It is inside
  // NUTRITION_DOMAIN.sessionsPerWeek and changes no number (nutrition.ts
  // NOTE-FREQ); it reaches the engine only to be quoted in basis.deficitRule.
  const sessionsPerWeek = useAppStore((s) =>
    s.activeProfileId === null ? 0 : (s.availability[s.activeProfileId]?.weeklySessionTarget ?? 0),
  );
  return useMemo(() => {
    if (profile === null) return null;
    const input = nutritionInputFor(profile, latest, sessionsPerWeek, todayLocal(profile.timezone));
    try {
      return computeTargets(input);
    } catch (e) {
      if (e instanceof RangeError) return null;
      throw e;
    }
  }, [profile, latest, sessionsPerWeek]);
}

/**
 * The plan the active profile is working through, or null before setup.
 *
 * Read through the cursor rather than by searching `plans`: the cursor is the
 * one record that says which plan belongs to this profile (setPlan mints a
 * fresh plan id per profile), so a plan with no cursor is unreachable by
 * construction.
 */
export function useActivePlan(): PlanTemplate | null {
  return useAppStore((s) => {
    const id = s.activeProfileId;
    if (id === null) return null;
    const cursor = s.cursors[id];
    if (cursor === undefined) return null;
    return s.plans[cursor.planId] ?? null;
  });
}

/** The active profile's intake entry for one civil date, or null if none was logged. */
export function useIntakeForDate(date: LocalDate): IntakeEntry | null {
  return useAppStore((s) => {
    const id = s.activeProfileId;
    if (id === null) return null;
    // logIntake keeps at most one entry per date, so the first match is the only one.
    return (s.intake[id] ?? []).find((e) => e.date === date) ?? null;
  });
}
