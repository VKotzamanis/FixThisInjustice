// src/domain/limits.ts
//
// Plan ceilings, one home (rule 2). The schema bounds a stored plan by them and the programme
// engine (src/domain/plan/engine.ts) stops appending at them, so the two can never disagree about
// how long a plan may grow.

/** [sessions/week] Sanity ceiling: one session per day. */
export const MAX_SESSIONS_PER_WEEK = 7;
/** [weeks] Sanity ceiling for a plan's length; two years. */
export const MAX_PLAN_WEEKS = 104;
/**
 * [sessions] Sanity ceiling for any index into a plan's session list, and for a
 * count of them. MAX_PLAN_WEEKS * MAX_SESSIONS_PER_WEEK is the largest plan the
 * bounds above admit; a cursor may sit one past the last session, so the ceiling
 * is inclusive of the count itself.
 */
export const MAX_PLAN_SESSIONS = MAX_PLAN_WEEKS * MAX_SESSIONS_PER_WEEK;
/** [blocks] Sanity ceiling: at most one block per week of the longest plan. */
export const MAX_BLOCKS = MAX_PLAN_WEEKS;
