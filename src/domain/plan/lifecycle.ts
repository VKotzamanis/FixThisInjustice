// src/domain/plan/lifecycle.ts
//
// The programme's lifecycle: replacing the running plan with one regenerated from today
// (ROADMAP L5, B1b, L7; docs/design/programme-lifecycle.md). Pure; the store applies it.

import type { AppState } from '../types';

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
