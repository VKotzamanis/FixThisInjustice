// src/domain/schedule/rotation.ts
//
// What a session is CALLED, derived from where it stands (audit D09, D15). A session is a
// rotation label (Upper A, Full body C) at a plan position; its programme week is a fact about
// the position, never about the name baked into the plan at generation. assignToday's swap
// moves labels between positions and rewrites ordinals, so a baked "Week 4 Full body B" landed
// in week 3; reading the week from the position cannot.
//
// The title format is the generator's own (src/domain/plan/generator.ts, copy contract R2:
// "Week 12 Upper A"); rotation.test.ts pins sessionTitle to every generated name (rule 2).

import type { PlannedSession, PlanTemplate } from '../types';

/**
 * [weeks] 1-based programme week of the session at `sessionIndex` (0-based position in
 * plan.sessions). A plan with no weekly rate is one undivided week.
 */
export function programmeWeekOf(plan: Pick<PlanTemplate, 'sessionsPerWeek'>, sessionIndex: number): number {
  if (plan.sessionsPerWeek <= 0) return 1;
  return Math.floor(Math.max(0, sessionIndex) / plan.sessionsPerWeek) + 1;
}

/**
 * "Week N <label>", with N from the session's position (ordinal - 1; the invariant
 * plan.sessions[i].ordinal === i + 1 is kept by every writer, including assignToday).
 */
export function sessionTitle(
  plan: Pick<PlanTemplate, 'sessionsPerWeek'>,
  session: Pick<PlannedSession, 'ordinal' | 'label'>,
): string {
  return `Week ${String(programmeWeekOf(plan, session.ordinal - 1))} ${session.label}`;
}
