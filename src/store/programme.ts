// src/store/programme.ts
//
// Replacing a profile's running plan, as a pure AppState -> AppState transition. setPlan (the
// setup wizard) and restartProgramme (Settings and Today) both go through applyReplacePlan, so
// what a new programme keeps and clears is stated once (docs/design/programme-lifecycle.md).

import { compareLocalDate, weekStart } from '../domain/dates';
import { generatePlan } from '../domain/plan/generator';
import {
  programmeInput,
  sessionInProgress,
  type ProgrammeChoice,
} from '../domain/plan/lifecycle';
import { EXERCISES } from '../domain/plan/library';
import { isTerminal } from '../domain/schedule/cursor';
import type { AppState, LocalDate, PlanTemplate } from '../domain/types';
import { requireProfile } from './scheduleActions';

/**
 * Replaces the running programme with one built from the profile as it is now, starting on
 * `today` (ROADMAP L5 and B1b). The generator input is `programmeInput`; the replacement is
 * `applyReplacePlan`, so it keeps and clears exactly what the wizard's setPlan does.
 *
 * Besides the plan it writes two things, each only when it changed: the goal kind, when
 * `choice.goal` names another one (Start Next Programme, L7), and the weekly session target,
 * set to the new split when the split changed (the wizard's own rule: picking a split sets the
 * target to it). Target mass and date are left as stored.
 *
 * Throws, writing nothing: an unknown profile; no running plan; a session in progress; a split
 * above the schedule's distinct training weekdays (the projection serves one session per
 * weekday, so the surplus would never be scheduled).
 */
export function applyRestartProgramme(
  s: AppState,
  profileId: string,
  choice: ProgrammeChoice,
  today: LocalDate,
  planId: string,
): AppState {
  const action = 'restartProgramme';
  const profile = requireProfile(s, action, profileId);
  const cursor = s.cursors[profileId];
  const current = cursor === undefined ? undefined : s.plans[cursor.planId];
  if (current === undefined) {
    throw new Error(`${action}: "${profileId}" has no programme to restart; finish setup first`);
  }
  const input = programmeInput(profile, current, choice);
  const splitChanged = input.sessionsPerWeek !== current.sessionsPerWeek;
  const availability = s.availability[profileId];
  // [days/week] distinct ISO weekdays: the calendar uses one slot per weekday (calendar.ts).
  const trainingDays = new Set((availability?.slots ?? []).map((slot) => slot.weekday)).size;
  if (splitChanged && input.sessionsPerWeek > trainingDays) {
    throw new RangeError(
      `${action}: ${String(input.sessionsPerWeek)} sessions per week need as many training days; ` +
        `the schedule has ${String(trainingDays)} training days. Choose at most ${String(trainingDays)}.`,
    );
  }
  const plan = generatePlan(input, EXERCISES);
  const goalChanged = input.goal !== profile.goal.kind;
  const patched: AppState = {
    ...s,
    profiles: goalChanged
      ? { ...s.profiles, [profileId]: { ...profile, goal: { ...profile.goal, kind: input.goal } } }
      : s.profiles,
    availability:
      splitChanged && availability !== undefined
        ? {
            ...s.availability,
            [profileId]: { ...availability, weeklySessionTarget: input.sessionsPerWeek }, // [sessions/week]
          }
        : s.availability,
  };
  return applyReplacePlan(patched, action, profileId, plan, planId, today);
}

/**
 * Stores `plan` under `planId` and starts the profile's cursor on it at session 0 on
 * `startedOn`. Throws while a session is in progress, writing nothing.
 *
 * Persisted fields only: the caller resets the non-persisted session slice and its mirror.
 */
export function applyReplacePlan(
  s: AppState,
  action: string,
  profileId: string,
  plan: PlanTemplate,
  planId: string,
  startedOn: LocalDate,
): AppState {
  requireProfile(s, action, profileId);
  /*
   * Refuse rather than discard. An in-progress assignment means the user is
   * mid-session: sets are being logged against `assignment.date` and
   * `session.id`, and a rest timer may be running. Clearing that row would
   * strand those sets on a schedule entry that no longer exists and leave the
   * timer counting for a session the app has forgotten, so re-planning is not
   * something the store may decide to do quietly. The caller finishes or skips
   * the session first (P3's completeSession / skipSession) and then re-plans.
   */
  if (sessionInProgress(s, profileId)) {
    throw new Error(`${action}: a session is in progress`);
  }
  // A PlanTemplate belongs to exactly one profile (master plan section 5), so
  // the stored copy always gets a fresh id. Without it, handing the same
  // generated template to two profiles would leave one record that either
  // profile's later edits would rewrite under the other.
  const stored: PlanTemplate = { ...plan, id: planId };
  // [d] Monday of the week the new programme starts in: the first week closeWeeks grades.
  const firstWeek = weekStart(startedOn);
  return {
    ...s,
    /*
     * The replaced plan is KEPT (master plan section 6.7). Every LoggedSet
     * carries the `sessionId` of the session it was logged under, and `plans`
     * is the only place that id resolves to a name, an ordinal or an exercise
     * list. Deleting the plan on re-planning severed every set logged before
     * the change from its session — the sets survived, but nothing could say
     * what they were sets OF. The cursor, not the contents of this map, is
     * what identifies the active plan, so an unreferenced plan here is history
     * rather than an orphan. It is bounded by how often a user re-plans.
     */
    plans: { ...s.plans, [stored.id]: stored },
    cursors: {
      ...s.cursors,
      [profileId]: { planId: stored.id, nextSessionIndex: 0, startedOn, completedOn: null },
    },
    /*
     * The schedule is replaced in the SAME transition as the cursor, so no reader
     * ever observes the new plan beside the old plan's calendar.
     *
     *   assignments  each row names a `sessionId` and a `sourceIndex` into the
     *                REPLACED plan's session list. Planned rows go: left in place,
     *                P3's projectedCalendar would resolve them against the new plan.
     *                Finished rows (completed, skipped) of the week the new
     *                programme starts in, up to its first day, STAY (ROADMAP B1d):
     *                closeWeeks grades that week under the new programme, so a
     *                Monday trained under the old plan still counts, and a session
     *                finished today keeps today closed. Older finished rows go, as
     *                before: the logged sets, which are what the user actually did,
     *                are in `sets` and are not touched.
     *   pauses       a pause is a suspension OF a plan. An open pause (to ===
     *                null) carried across would silently suspend the plan the
     *                user just asked to start.
     */
    assignments: {
      ...s.assignments,
      [profileId]: (s.assignments[profileId] ?? []).filter(
        (a) =>
          isTerminal(a) &&
          compareLocalDate(a.date, firstWeek) >= 0 &&
          compareLocalDate(a.date, startedOn) <= 0,
      ),
    },
    pauses: { ...s.pauses, [profileId]: [] },
    /*
     * Reviews of weeks before the new programme are history and stay. A review of a week the
     * new programme grades itself (ROADMAP B1d) goes: closeWeeks skips any week already
     * reviewed, so a leftover would stand in for the new programme's own grade. Under a forward
     * clock none exists, because only ended weeks are reviewed; a zone change or a back-dated
     * start can produce one.
     */
    weeklyReviews: {
      ...s.weeklyReviews,
      [profileId]: (s.weeklyReviews[profileId] ?? []).filter(
        (r) => compareLocalDate(r.weekStart, firstWeek) < 0,
      ),
    },
  };
}
