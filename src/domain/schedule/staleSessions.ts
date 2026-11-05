// src/domain/schedule/staleSessions.ts
//
// Spec R1 (audit C01/D01, owner O1): a session left open on an earlier civil date never blocks
// the schedule. cursor.ts refuses to open a day while another is non-terminal, and before this
// module nothing could close a day the clock had moved past, so one forgotten Finish froze every
// later Start. Pure: the store runs it on launch and on every return to the foreground
// (src/app/useWeeklyClose.ts) and before Today's Start.
//
// Every date is a LocalDate in the profile's zone; every instant is epoch ms, UTC.
import { compareLocalDate } from '../dates';
import { completeSession, isTerminal } from './cursor';
import type { AppState, EpochMs, LocalDate, SessionAssignment } from '../types';

/**
 * [ms] A session whose last activity (its last set, else its start) is younger than this stays
 * open past midnight, so a lifter training at 23:30 is not cut off when the phone wakes at 00:05
 * between sets. 4 h is an engineering bound: longer than any session the plan prescribes,
 * shorter than a night. Not a physiological figure.
 */
export const STALE_SESSION_GRACE_MS = 4 * 60 * 60 * 1000; // [ms] 4 h

/** What the closer did to one day, for the one notice the user gets. */
export interface StaleClosure {
  date: LocalDate;
  sessionId: string;
  /** completed: it had sets, closed at the last one. released: no sets; the session is next again. */
  outcome: 'completed' | 'released';
}

/** The profile's open (in-progress) session, on whatever date it was opened, or null. */
export function openAssignment(
  state: Pick<AppState, 'assignments'>,
  profileId: string,
): SessionAssignment | null {
  return (state.assignments[profileId] ?? []).find((a) => a.status === 'in-progress') ?? null;
}

/** [ms] The newest loggedAt among this profile's sets on `date`, or null when there are none. */
function lastLoggedAt(state: AppState, profileId: string, date: LocalDate): EpochMs | null {
  let last: EpochMs | null = null;
  for (const s of Object.values(state.sets)) {
    if (s.profileId !== profileId || s.assignmentDate !== date) continue;
    if (last === null || s.loggedAt > last) last = s.loggedAt;
  }
  return last;
}

/** [ms] `instant` when it is not later than `now`; otherwise (or when null) -Infinity. */
function pastOrNull(instant: EpochMs | null, now: EpochMs): number {
  return instant !== null && instant <= now ? instant : Number.NEGATIVE_INFINITY;
}

/**
 * Closes every non-terminal assignment of `profileId` dated before `today` whose last activity is
 * older than STALE_SESSION_GRACE_MS. With sets: completed, completedAt = the last set's instant,
 * cursor advanced by one (cursor.ts completeSession). Without: the row is removed and the cursor
 * holds, so the same session is served next. Returns the argument itself when nothing closes.
 *
 * @param now [ms] epoch, UTC
 */
export function closeStaleSessions(
  state: AppState,
  profileId: string,
  today: LocalDate,
  now: EpochMs,
): { state: AppState; closed: StaleClosure[] } {
  const stale = (state.assignments[profileId] ?? []).filter(
    (a) => !isTerminal(a) && compareLocalDate(a.date, today) < 0,
  );
  if (stale.length === 0) return { state, closed: [] };

  let next = state;
  const closed: StaleClosure[] = [];
  for (const a of stale) {
    const last = lastLoggedAt(state, profileId, a.date); // [ms] or null
    /*
     * [ms] Review FIX-2: an instant later than `now` (a phone clock that was wrong once, or an
     * import from such a device) is no evidence of recent activity and is ignored. Kept, it made
     * `now - activity` negative forever: the row never closed and blocked every later Start and
     * weekly review. Clamping it to `now` is not enough: the row would then look active on every
     * run (now - now = 0 < grace) and still never close.
     */
    const activity = Math.max(pastOrNull(last, now), pastOrNull(a.startedAt, now));
    if (Number.isFinite(activity) && now - activity < STALE_SESSION_GRACE_MS) continue;
    if (last !== null) {
      // completedAt [ms] = the last set, clamped to `now` for the same reason (never in the future).
      const completed = completeSession(next, profileId, a.date, Math.min(last, now));
      if (completed === next) continue; // no cursor or plan: nothing the domain can close
      next = completed;
      closed.push({ date: a.date, sessionId: a.sessionId, outcome: 'completed' });
    } else {
      next = {
        ...next,
        assignments: {
          ...next.assignments,
          [profileId]: (next.assignments[profileId] ?? []).filter((r) => r.date !== a.date),
        },
      };
      closed.push({ date: a.date, sessionId: a.sessionId, outcome: 'released' });
    }
  }
  return closed.length === 0 ? { state, closed } : { state: next, closed };
}
