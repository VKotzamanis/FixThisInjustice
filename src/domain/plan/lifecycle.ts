// src/domain/plan/lifecycle.ts
//
// The programme's lifecycle: replacing the running plan with one regenerated from today
// (ROADMAP L5, B1b, L7; docs/design/programme-lifecycle.md). Pure; the store applies it.

import { GOAL_AXES_BY_KIND } from '../types';
import type { AppState, GoalKind, Kg, PlannedSession, PlanTemplate, Profile } from '../types';
import { INITIAL_WEEKS, withoutLength } from './engine';
import { CARDIO_EXERCISE_IDS, type PlanInput } from './generator';
import { inventoryOf } from './inventory';
import { SPLIT_TEMPLATES, type SessionsPerWeek } from './templates';

/**
 * Is a session open for this profile? The one definition setPlan's refusal and the UI's
 * "finish the session first" gate share: a re-plan mid-session would strand the sets being
 * logged against a schedule row the re-plan clears.
 */
export function sessionInProgress(
  state: Pick<AppState, 'assignments'>,
  profileId: string,
): boolean {
  return (state.assignments[profileId] ?? []).some((a) => a.status === 'in-progress');
}

/** The split sizes a template exists for, ascending: the generator's accepted sessionsPerWeek. */
export const SESSIONS_PER_WEEK_CHOICES: readonly SessionsPerWeek[] = (
  Object.keys(SPLIT_TEMPLATES).map(Number) as SessionsPerWeek[]
).sort((a, b) => a - b);

/** Was this plan built with the conditioning option? Exact for generated plans (see the export). */
export function planIncludesCardio(plan: PlanTemplate): boolean {
  return plan.sessions.some((s) => s.exercises.some((e) => CARDIO_EXERCISE_IDS.includes(e.exerciseId)));
}

/** What a restart may change beyond the profile's own fields. Absent = as the current plan. */
export interface ProgrammeChoice {
  goal?: GoalKind | undefined;
  sessionsPerWeek?: SessionsPerWeek | undefined; // [sessions/week]
  includeCardio?: boolean | undefined;
}

/** `n` clamped into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * The generator input for a programme regenerated from `plan` (the running one) and `profile`
 * (as it is now), with `choice` applied.
 *
 * Goal, experience, equipment and inventory are the profile's: Settings writes them, so the
 * profile is the current answer (inventoryOf: no filter with a full gym, the pre-P3a assumption
 * for a profile that never answered, audit D07).
 * Split and conditioning are not profile fields; they are the running plan's unless chosen. A
 * stored split outside what the generator accepts (an imported or hand-made plan) is clamped to
 * the nearest accepted value, never otherwise changed. There is no length (ROADMAP L6): the new
 * programme is materialised INITIAL_WEEKS deep and the engine keeps it going.
 */
export function programmeInput(
  profile: Profile,
  plan: PlanTemplate,
  choice: ProgrammeChoice = {},
): PlanInput {
  const lo = SESSIONS_PER_WEEK_CHOICES[0] ?? 2; // [sessions/week]
  const hi = SESSIONS_PER_WEEK_CHOICES[SESSIONS_PER_WEEK_CHOICES.length - 1] ?? 6; // [sessions/week]
  const storedSplit = clamp(Math.round(plan.sessionsPerWeek), lo, hi) as SessionsPerWeek;
  return {
    sessionsPerWeek: choice.sessionsPerWeek ?? storedSplit, // [sessions/week]
    // [weeks] materialisation depth only; the engine's runway extends it (ROADMAP L6).
    weeks: INITIAL_WEEKS,
    goal: choice.goal ?? profile.goal.kind,
    experience: profile.experience,
    equipment: profile.equipment,
    includeCardio: choice.includeCardio ?? planIncludesCardio(plan),
    inventory: inventoryOf(profile),
  };
}

/**
 * A value as text with object keys sorted. A plan read back from storage has been through the
 * schema, which emits keys in ITS order, not the generator's, so plain JSON.stringify would call
 * two equal plans different.
 */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'undefined';
}

/**
 * Which way a goal moves body mass, read off the goal axes (GOAL_AXES_BY_KIND, types.ts): losing
 * fat while holding muscle is down (fat loss), holding fat while gaining muscle is up (muscle
 * gain). Recomposition and maintenance hold mass: nutrition.ts energyPlan holds energy at TDEE
 * for both (lifecycle.test.ts checks the two agree goal by goal).
 */
export type MassDirection = 'down' | 'up' | 'held';

export function massDirection(kind: GoalKind): MassDirection {
  const { fat, muscle } = GOAL_AXES_BY_KIND[kind];
  if (fat === 'lose' && muscle === 'hold') return 'down';
  if (fat === 'hold' && muscle === 'gain') return 'up';
  return 'held';
}

/**
 * Has the body-mass target been reached (ROADMAP L7)?
 *
 * True only for a goal that moves mass, with a stored target that lies in the goal's direction
 * from the setup baseline, and a logged weigh-in at or past the target in that direction: for fat
 * loss a target below the baseline and a weigh-in at or below it, for muscle gain a target above
 * the baseline and a weigh-in at or above it. `latestMassKg` is the latest logged entry
 * (latestBodyMassEntry); the setup baseline is not a weigh-in. No tolerance band: the app has no
 * sourced figure for one.
 *
 * The baseline is the reference because it is the mass the target was set against: the wizard
 * writes `body.baselineMassKg` and `goal.targetMassKg` in one profile, and nothing else writes
 * either. A target on the wrong side of it (review R1: a body-fat target stored as the mass it
 * implies at held lean mass, below the start under muscle gain; or a fat-loss target kept after
 * Settings or a restart changed only `goal.kind`) asks for no change in the goal's direction, so
 * it is never reached. A target equal to the baseline is the same case.
 *
 * @param latestMassKg [kg] the latest logged body mass, or null when nothing is logged.
 * @param baselineMassKg [kg] `profile.body.baselineMassKg`, the mass at setup.
 */
export function massTargetReached(
  goal: Profile['goal'],
  latestMassKg: Kg | null,
  baselineMassKg: Kg,
): boolean {
  const target = goal.targetMassKg; // [kg]
  if (target === null || latestMassKg === null) return false;
  switch (massDirection(goal.kind)) {
    case 'down':
      return target < baselineMassKg && latestMassKg <= target;
    case 'up':
      return target > baselineMassKg && latestMassKg >= target;
    case 'held':
      return false;
  }
}

/**
 * The goal Start Next Programme preselects: maintenance once the body-mass target was reached
 * (the owner: "it shift to maintenance ... habit of gym going but not losing weight"), otherwise
 * the current goal. A default only; the user picks the goal the next programme runs on.
 *
 * @param latestMassKg [kg] the latest logged body mass, or null when nothing is logged.
 * @param baselineMassKg [kg] `profile.body.baselineMassKg` (see massTargetReached).
 */
export function nextProgrammeGoal(
  goal: Profile['goal'],
  latestMassKg: Kg | null,
  baselineMassKg: Kg,
): { goal: GoalKind; targetReached: boolean } {
  const targetReached = massTargetReached(goal, latestMassKg, baselineMassKg);
  return { goal: targetReached ? 'maintenance' : goal.kind, targetReached };
}

/** One session's content, without its id or position. */
function sessionKey(s: PlannedSession): string {
  return canonical([s.name, s.kind, s.label, s.exercises]);
}

/**
 * Would `built` give the user the same programme as `stored`?
 *
 * Compares what the Settings inputs decide: the name (it carries the goal and the split), the
 * split, and the FIRST WEEK's sessions as a multiset. Ids are ignored (every build mints fresh
 * ones) and so is session order, because Today's "train something else" swaps two sessions of
 * the stored plan (src/domain/schedule/calendar.ts assignToday) without changing the programme.
 *
 * Not compared (ROADMAP L6): the length and the later cycles. The engine grows the stored plan
 * and rewrites cycles nobody has started from logged data (adopted swaps, replaced skips), so a
 * stored plan is longer and later weeks differ from a fresh build by design; neither is a
 * Settings change. A stored name from before L6 carries its length ("12 weeks"); it is compared
 * without it.
 */
export function sameProgramme(stored: PlanTemplate, built: PlanTemplate): boolean {
  if (withoutLength(stored.name) !== withoutLength(built.name)) return false;
  if (stored.sessionsPerWeek !== built.sessionsPerWeek) return false;
  const spw = stored.sessionsPerWeek; // [sessions/week]
  const a = stored.sessions.slice(0, spw).map(sessionKey).sort();
  const b = built.sessions.slice(0, spw).map(sessionKey).sort();
  return a.length === b.length && a.every((key, i) => key === b[i]);
}
