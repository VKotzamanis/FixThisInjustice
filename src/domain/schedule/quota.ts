import type { AppState } from '../types';

/** [sessions/week] One availability target for the forecast and weekly grading (AM-5). */
export function weeklyQuota(state: AppState, profileId: string): number {
  return state.availability[profileId]?.weeklySessionTarget ?? 0;
}
