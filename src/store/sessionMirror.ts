// src/store/sessionMirror.ts
//
// The non-persisted session slice, and its mirror in sessionStorage.
//
// sessionStorage, not localStorage: this state is scoped to one tab and one browsing session
// and must not outlive it. A rest timer restored a week later would count down against a
// session the user finished long ago, and `fti.v3` is the persisted document's key, owned by
// src/store/persistence.ts (master plan section 3: one key, one owner). This module and the
// readiness-notice dismissal (src/ui/components/ReadinessNotice.tsx) are the only sanctioned
// sessionStorage writers in the app.
//
// What is mirrored is what a reload must not lose: the running timer, the day the user is
// training, and the exercises added beyond the plan. The undo buffer is deliberately excluded;
// see PendingUndo.
//
// Reads are validated and failures are swallowed on purpose. The mirror is a convenience, not
// a record: every failure mode below (unavailable storage, corrupt JSON, a payload from an
// older build) costs the user a restored timer and nothing else, so none of them may throw
// into a store initialiser that runs before React mounts.
import { z } from 'zod';
import { isValidLocalDate } from '../domain/dates';
import type { EpochMs, LocalDate, LoggedSet } from '../domain/types';
import type { RestTimer } from '../domain/training/restTimer';

/** The mirror's key. `v3` tracks the document's schema version, not this module's shape. */
export const SESSION_KEY = 'fti.session.v3';

export interface PendingUndo {
  set: LoggedSet;
  /** [ms] epoch UTC. After this instant the buffer is spent and undoDelete restores nothing. */
  expiresAt: EpochMs;
}

export interface SessionState {
  /** The running rest interval, or null when no rest is under way. */
  restTimer: RestTimer | null;
  /** The civil day the user is training, once a session has been opened on it. */
  activeAssignmentDate: LocalDate | null;
  /** Exercises added to today's session beyond the plan; their sets carry isBonus. */
  bonusExerciseIds: string[];
  /**
   * The delete buffer. Deliberately NOT mirrored: a six-second undo window that survived a
   * reload would let a user restore a set minutes later from a buffer that outlived the
   * decision to delete it, and the record it holds is the one thing in this slice that is a
   * copy of persisted data rather than a fact about the tab.
   */
  undo: PendingUndo | null;
}

export const EMPTY_SESSION: SessionState = {
  restTimer: null,
  activeAssignmentDate: null,
  bonusExerciseIds: [],
  undo: null,
};

/**
 * The three durable fields, validated on the way back in.
 *
 * Written out here rather than reused from the domain because a mirror is untrusted input:
 * it is user-editable storage, it can be written by an older build, and it reaches a store
 * initialiser. The bounds are structural (a timer is three finite numbers, a date is a real
 * civil day) and the list of bonus ids is capped so a hand-edited mirror cannot inflate the
 * session.
 *
 * Two of the checks are semantic rather than structural, because the structural version of
 * each admitted a payload the app cannot act on (P4 polish items 7):
 *
 *  - the date is checked with the domain's own isValidLocalDate, not with the "YYYY-MM-DD"
 *    shape. The shape accepts "2026-02-30", which names no day; it would then be handed to
 *    useTodaysSets as the training day and would match no assignment and no logged set,
 *    silently, for the rest of the tab's life.
 *  - the timer must not end before it started. remainingS clamps at 0, but totalS is
 *    endsAt - startedAt and the rest panel divides by it to draw its progress ring, so an
 *    inverted interval renders a negative fraction. No startRest or extend can produce one.
 *
 * A refusal takes the WHOLE mirror down rather than the offending field, which is this
 * module's documented contract: every failure mode costs a restored timer and nothing else,
 * and a partially-trusted mirror would be a third state with no reader.
 */
const MirrorSchema = z.object({
  restTimer: z
    .object({
      startedAt: z.number().int().finite(), // [ms] epoch UTC
      endsAt: z.number().int().finite(), // [ms] epoch UTC
      durationS: z.number().nonnegative().finite(), // [s]
    })
    // Non-strict: endsAt === startedAt is the zero-length interval startRest(0, t) produces.
    .refine((t) => t.endsAt >= t.startedAt, {
      message: 'endsAt is before startedAt',
    })
    .nullable(),
  activeAssignmentDate: z
    .string()
    .refine((d) => isValidLocalDate(d), { message: 'not a calendar-valid "YYYY-MM-DD" date' })
    .nullable(),
  bonusExerciseIds: z.array(z.string().min(1)).max(50),
});

export type SessionMirror = z.infer<typeof MirrorSchema>;

/**
 * The mirrored fields, or null when there is nothing usable to restore.
 *
 * Null covers every failure equally — no mirror, unreachable storage, corrupt JSON, a payload
 * the schema refuses — because the caller's response is the same in all four cases: start the
 * session slice empty.
 */
export function loadSessionMirror(): SessionMirror | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw === null) return null;
    const parsed = MirrorSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // sessionStorage throws outright in Safari private browsing and in a partitioned context,
    // and JSON.parse throws on a truncated write. Deliberately not an empty block; no-empty
    // forbids that.
    return null;
  }
}

/** Writes the three durable fields. The undo buffer is dropped here, by construction. */
export function saveSessionMirror(s: SessionState): void {
  const mirror: SessionMirror = {
    restTimer: s.restTimer,
    activeAssignmentDate: s.activeAssignmentDate,
    bonusExerciseIds: s.bonusExerciseIds,
  };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(mirror));
  } catch {
    // A mirror that cannot be written costs a restored timer after a reload and nothing else,
    // so there is no failure to surface: the document itself is untouched by this module.
    return;
  }
}

/** Removes the mirror. Called wherever the session slice is reset, so a reload cannot revive it. */
export function clearSessionMirror(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Already unreachable, which is the goal.
    return;
  }
}

/** The session slice a fresh store starts from: the mirror if there is one, empty otherwise. */
export function initialSession(): SessionState {
  return { ...EMPTY_SESSION, ...(loadSessionMirror() ?? {}) };
}
