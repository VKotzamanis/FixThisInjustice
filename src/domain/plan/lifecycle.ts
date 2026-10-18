// src/domain/plan/lifecycle.ts
//
// The programme's lifecycle: replacing the running plan with one regenerated from today
// (ROADMAP L5, B1b, L7; docs/design/programme-lifecycle.md). Pure; the store applies it.

import type { AppState, GoalKind, PlannedSession, PlanTemplate, Profile } from '../types';
import { CARDIO_EXERCISE_IDS, PLAN_WEEKS_MAX, PLAN_WEEKS_MIN, type PlanInput } from './generator';
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
 * Goal, experience and equipment are the profile's: Settings writes them, so the profile is the
 * current answer. Split, length and conditioning are not profile fields; they are the running
 * plan's unless chosen. A stored length or split outside what the generator accepts (an imported
 * or hand-made plan) is clamped to the nearest accepted value, never otherwise changed.
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
    weeks: clamp(Math.round(plan.weeks), PLAN_WEEKS_MIN, PLAN_WEEKS_MAX), // [weeks]
    goal: choice.goal ?? profile.goal.kind,
    experience: profile.experience,
    equipment: profile.equipment,
    includeCardio: choice.includeCardio ?? planIncludesCardio(plan),
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

/** One session's content, without its id or position. */
function sessionKey(s: PlannedSession): string {
  return canonical([s.name, s.kind, s.label, s.exercises]);
}

/**
 * Would `built` give the user the same programme as `stored`?
 *
 * Compares what the user trains and reads: the name (it carries the goal), split, length, block
 * layout, and the sessions as a multiset. Ids are ignored (every build mints fresh ones) and so
 * is session order, because Today's "train something else" swaps two sessions of the stored plan
 * (src/domain/schedule/calendar.ts assignToday) without changing the programme.
 */
export function sameProgramme(stored: PlanTemplate, built: PlanTemplate): boolean {
  if (stored.name !== built.name) return false;
  if (stored.sessionsPerWeek !== built.sessionsPerWeek || stored.weeks !== built.weeks) return false;
  if (canonical(stored.blocks) !== canonical(built.blocks)) return false;
  if (stored.sessions.length !== built.sessions.length) return false;
  const a = stored.sessions.map(sessionKey).sort();
  const b = built.sessions.map(sessionKey).sort();
  return a.every((key, i) => key === b[i]);
}
