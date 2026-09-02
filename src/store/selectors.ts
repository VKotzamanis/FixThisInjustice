import { useMemo } from 'react';
import type {
  AppState,
  BodyMassEntry,
  EpochMs,
  IntakeEntry,
  LocalDate,
  PlanTemplate,
  Profile,
} from '../domain/types';
import type { NutritionInput, NutritionTargets } from '../domain/nutrition';
import { computeTargets, isInDomain } from '../domain/nutrition';
import { compareLocalDate, todayLocal } from '../domain/dates';
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
    //
    // compareLocalDate rather than a raw `>`: the two agree today only because
    // every LocalDate is a zero-padded ISO string, which is an invariant of
    // dates.ts and not of this comparison. Routing the ordering through the one
    // function that owns it means a change to the date representation has one
    // place to be fixed instead of one place plus every inlined string compare.
    const byDate = compareLocalDate(e.date, best.date);
    if (byDate > 0 || (byDate === 0 && e.loggedAt > best.loggedAt)) best = e;
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
  // Age in whole years as (current year - birth year), read in the profile's own
  // zone. This is the age the person REACHES during this calendar year, not their
  // age today: the day of the birthday is not knowable from `birthYear`, because
  // the year is the only part the profile collects. Before their birthday the
  // figure therefore runs up to one year high, and Mifflin-St Jeor's age term is
  // -5 kcal/day per year, so the worst case understates RMR by 5 kcal/day (about
  // 0.2 % of a 2700 kcal/day target). Collecting a full birth date would remove
  // the error; it would also collect a date of birth this app has no other use
  // for, so the bias is accepted and recorded rather than engineered away.
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
 * NUTRITION_DOMAIN. The second is decided by asking isInDomain BEFORE calling
 * the engine, not by catching what the engine throws. Both routes return null
 * here, but they say different things about anything else that goes wrong: with
 * the gate in front, a throw that still escapes computeTargets is a defect in
 * the engine, and it now reaches the caller instead of being reported to the UI
 * as "this profile has no targets". A caught RangeError could not be told apart
 * from a legitimate domain refusal, so the wrong diagnosis was the cheap one.
 * The setup wizard still reads NUTRITION_DOMAIN directly, because it must name
 * the field the user has to change; a rendering component has no such control,
 * and an exception thrown during render takes the tree down with it.
 *
 * The memo is keyed on the four inputs that can change a number, `now` included.
 * Age is derived from the civil year (nutritionInputFor), so a memo keyed only
 * on the profile and the logs would keep serving December's age all through
 * January: the arithmetic depends on the clock, so the clock has to be a
 * dependency. It enters as a LocalDate rather than as the raw instant, so the
 * value is stable within a civil day and the memo still holds across re-renders.
 *
 * @param now [ms] epoch instant to read the civil date from. Defaults to the
 *   wall clock; a caller passes it to pin the day (tests, and any future
 *   store-level clock).
 */
export function useNutritionTargets(now: EpochMs = Date.now()): NutritionTargets | null {
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
  // Outside the memo so it is a dependency rather than a hidden read. It is a
  // "YYYY-MM-DD" string, so an unchanged day compares equal and re-renders cost
  // no arithmetic; the day rolling over is what makes the memo recompute.
  //
  // todayLocal throws RangeError on an invalid IANA zone, and that throw is now
  // outside the removed try/catch, so it reaches the caller. That is deliberate
  // and matches the rule above: Profile.timezone is refined by the schema, so a
  // profile carrying an unusable zone is a document the loader would have
  // rejected, i.e. a defect rather than a state the UI should render around.
  const todayIso = profile === null ? null : todayLocal(profile.timezone, now);
  return useMemo(() => {
    if (profile === null || todayIso === null) return null;
    const input = nutritionInputFor(profile, latest, sessionsPerWeek, todayIso);
    if (!isInDomain(input)) return null;
    return computeTargets(input);
  }, [profile, latest, sessionsPerWeek, todayIso]);
}

/**
 * The plan the active profile is working through, or null before setup.
 *
 * Read through the cursor rather than by searching `plans`. The cursor is the
 * one record that says which plan is CURRENT: setPlan mints a fresh plan id per
 * profile and keeps the plan it replaced, because logged sets carry the session
 * ids of the plan they were logged under and those ids are resolvable nowhere
 * else. So `plans` holds every plan the profile has ever run, only one of them
 * is active, and searching that map for "the" plan would be ambiguous by
 * construction. `?? null` still guards the lookup: a cursor pointing at a plan
 * that is not stored is a corrupt document, not a plan.
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
