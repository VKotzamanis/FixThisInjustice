// src/domain/measurements.ts
//
// Spec R9 (audit G05, G08, G11, G12, B11): which stored body-mass entry is "the" body mass, which
// is "the" body fat, whether a new mass looks like a typing slip, and the nutrition input built
// from them. Pure; one copy for the Targets screen, the export summary, the lifecycle test and the
// chart (rule 2).
//
// Units: mass [kg], body fat [% of body mass], dates LocalDate in the profile's zone, instants
// [ms] epoch UTC. No health coefficient lives here (AGENTS rule 1): the one number,
// BODY_MASS_PLAUSIBLE_FRACTION, is spec R4's data-entry sanity bound.
import { bandOfPal, palOf } from './activity';
import { compareLocalDate } from './dates';
import type { NutritionInput } from './nutrition';
import { weeklyQuota } from './schedule/quota';
import type { AppState, BodyMassEntry, Kg, LocalDate, Profile } from './types';

/**
 * Dimensionless. A new body mass more than this fraction away from the reference is asked about
 * once (spec R4: "body mass (> 10 % from last) asks once inline"). A data-entry sanity bound, not a
 * physiological limit: 18 typed for 180 is a 90 % slip, a real day-to-day change is far below it.
 */
export const BODY_MASS_PLAUSIBLE_FRACTION = 0.1;

/**
 * True when `massKg` differs from `referenceKg` by more than BODY_MASS_PLAUSIBLE_FRACTION of the
 * reference. Exactly 10 % is not questioned. No reference (first weigh-in) is never questioned.
 *
 * @param massKg [kg] the mass about to be stored
 * @param referenceKg [kg] the latest trend mass, else the profile baseline; null for none
 */
export function implausibleMass(massKg: Kg, referenceKg: Kg | null): boolean {
  if (referenceKg === null || !(referenceKg > 0) || !(massKg > 0)) return false;
  return Math.abs(massKg - referenceKg) > BODY_MASS_PLAUSIBLE_FRACTION * referenceKg;
}

/**
 * Rank of an entry for the daily trend point, lower wins; null = never a trend point.
 * `post` is dehydrated by design (that is what the 2 % check measures, audit G12), so it never
 * stands for the body mass. A morning reading beats an untagged one (every entry written before
 * roles existed), which beats a pre-session one.
 */
function trendRank(e: BodyMassEntry): number | null {
  if (e.role === 'post') return null;
  if (e.role === 'morning') return 0;
  if (e.role === 'pre') return 2;
  return 1;
}

/**
 * One trend point per civil date, ascending by date (audit G12: the chart and every reader of "the"
 * body mass use one role per day, so pre/post pairs no longer plot as vertical spikes). Within a
 * date the best rank wins, then the latest `loggedAt` (a re-typed weigh-in corrects the first).
 * Returns the stored objects themselves.
 */
export function trendEntries(list: readonly BodyMassEntry[]): BodyMassEntry[] {
  const best = new Map<LocalDate, BodyMassEntry>();
  for (const e of list) {
    const rank = trendRank(e);
    if (rank === null) continue;
    const current = best.get(e.date);
    const currentRank = current === undefined ? null : trendRank(current);
    if (
      current === undefined ||
      currentRank === null ||
      rank < currentRank ||
      (rank === currentRank && e.loggedAt > current.loggedAt)
    ) {
      best.set(e.date, e);
    }
  }
  return [...best.values()].sort((a, b) => compareLocalDate(a.date, b.date));
}

/** The newest trend point, or null. The stored object, so a store selector stays stable. */
export function latestTrendEntry(list: readonly BodyMassEntry[]): BodyMassEntry | null {
  return trendEntries(list).at(-1) ?? null;
}

/**
 * The body mass every reader means by "the latest weigh-in": targets, the L7 target-reached test,
 * the plausibility reference. Newest trend point (never a post-session mass), or null.
 */
export function latestBodyMassEntry(state: AppState, profileId: string): BodyMassEntry | null {
  return latestTrendEntry(state.bodyMass[profileId] ?? []);
}

/**
 * The newest entry that carries a body-fat percentage (audit G05, ROADMAP L10): by civil date,
 * then `loggedAt`. Null when none does, and the profile baseline then stands.
 */
export function latestBodyFatEntry(state: AppState, profileId: string): BodyMassEntry | null {
  let best: BodyMassEntry | null = null;
  for (const e of state.bodyMass[profileId] ?? []) {
    if (e.bodyFatPct === null) continue;
    if (best === null) {
      best = e;
      continue;
    }
    const byDate = compareLocalDate(e.date, best.date);
    if (byDate > 0 || (byDate === 0 && e.loggedAt > best.loggedAt)) best = e;
  }
  return best;
}

/**
 * The nutrition input from stored state. The newest trend mass and the newest body-fat entry win
 * over the profile baseline: the content review section 1 instruction is to recompute the target
 * at each re-measure, not to hard-code it.
 *
 * `latestBodyFat` defaults to `latest`, which is the pairing every caller made before body fat
 * could be re-measured on its own (audit G05). Residual limitation, stated: between re-measures
 * the body-fat PERCENTAGE is held, so a mass change is split between fat and fat-free mass in the
 * last measured proportion; no source in this project supports a different split.
 *
 * @param sessionsPerWeek [sessions/week], quoted in the basis text only (nutrition.ts NOTE-FREQ)
 * @param todayIso the civil date in the profile's zone; age = its year - birth year
 */
export function nutritionInputFor(
  profile: Profile,
  latest: BodyMassEntry | null,
  sessionsPerWeek: number,
  todayIso: LocalDate,
  latestBodyFat: BodyMassEntry | null = latest,
): NutritionInput {
  const massKg = latest?.massKg ?? profile.body.baselineMassKg; // [kg]
  const bodyFatPct = latestBodyFat?.bodyFatPct ?? profile.body.baselineBodyFatPct; // [%] or null
  // Age as (current year - birth year): the age reached this calendar year. Before the birthday
  // it runs up to one year high, which understates Mifflin-St Jeor RMR by at most 5 kcal/day
  // (its -5 kcal/day per year term); collecting a birth date would remove it and is not worth it.
  const ageYears = Number(todayIso.slice(0, 4)) - profile.body.birthYear; // [year]
  return {
    sex: profile.body.sex,
    ageYears,
    heightCm: profile.body.heightCm, // [cm]
    massKg,
    bodyFatPct,
    // Audit G04: one activity value. palOf is the PAL, else the band floor (the old fallback).
    activity: bandOfPal(palOf(profile)),
    activityPal: palOf(profile), // [PAL]
    goal: profile.goal.kind,
    sessionsPerWeek,
    creatine: profile.supplements.creatine,
  };
}

/**
 * The same input from a whole document (audit B11): the export summary and the Targets screen
 * now read one derivation. Null for an unknown profile.
 */
export function nutritionInputForState(
  state: AppState,
  profileId: string,
  todayIso: LocalDate,
): NutritionInput | null {
  const profile = state.profiles[profileId];
  if (profile === undefined) return null;
  return nutritionInputFor(
    profile,
    latestBodyMassEntry(state, profileId),
    weeklyQuota(state, profileId), // [sessions/week]
    todayIso,
    latestBodyFatEntry(state, profileId),
  );
}

/** Where the projected-mass line starts (audit G11): a civil date and a mass. */
export interface ProjectionAnchor {
  date: LocalDate;
  massKg: Kg; // [kg]
}

/**
 * The projection starts at the current programme's start (`from`, the cursor's `startedOn`) at the
 * mass measured then: the latest of the baseline and the trend points dated on or before `from`
 * (a trend point wins a tie with the baseline), else the earliest of them. So a finished cut no
 * longer redraws today's goal back over the months of loss (audit G11).
 */
export function projectionAnchor(
  trend: readonly BodyMassEntry[],
  from: LocalDate,
  baseline: ProjectionAnchor,
): ProjectionAnchor {
  // Stable sort: on a shared date the baseline stays first, so the trend point after it wins.
  const candidates: ProjectionAnchor[] = [
    baseline,
    ...trend.map((e) => ({ date: e.date, massKg: e.massKg })),
  ].sort((a, b) => compareLocalDate(a.date, b.date));
  let chosen: ProjectionAnchor = candidates[0] ?? baseline;
  for (const c of candidates) {
    if (compareLocalDate(c.date, from) <= 0) chosen = c;
  }
  return { date: from, massKg: chosen.massKg }; // [kg]
}
