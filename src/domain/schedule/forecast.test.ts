import { describe, expect, it } from 'vitest';
import { assignToday, projectedCalendar, remainingLabelsThisWeek } from './calendar';
import { completeSession, postponeSession, skipSession, startSession } from './cursor';
import { parseState } from '../schema';
import { makeSet } from '../../test/fixtures';
import {
  FRIDAY,
  MONDAY,
  NOW_MS,
  PROFILE_ID,
  SATURDAY,
  SUNDAY,
  THURSDAY,
  TUESDAY,
  WEDNESDAY,
  assignmentOn,
  cursorOf,
  seedState,
} from '../../test/scheduleFixtures';
import type { AppState, LocalDate } from '../types';

const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];

function served(state: AppState, from: LocalDate, days: number): LocalDate[] {
  return projectedCalendar(state, PROFILE_ID, from, days)
    .filter((d) => d.projectedSession !== null)
    .map((d) => d.date);
}

describe('the quota forecast (R3, audit D04)', () => {
  it('serves at most the weekly target per ISO week, on the first preferred days', () => {
    const s = seedState({
      labels: LABELS,
      weekdays: [1, 2, 3, 4, 5],
      sessionsPerWeek: 3,
      weeklySessionTarget: 3,
    });
    expect(served(s, MONDAY, 7)).toEqual([MONDAY, TUESDAY, WEDNESDAY]);
  });

  it('counts a session already done this week against the quota', () => {
    const s = seedState({
      labels: LABELS,
      weekdays: [1, 2, 3, 4, 5],
      sessionsPerWeek: 3,
      weeklySessionTarget: 3,
    });
    const done = completeSession(s, PROFILE_ID, MONDAY, NOW_MS); // [ms] epoch, UTC
    expect(served(done, TUESDAY, 6)).toEqual([TUESDAY, WEDNESDAY]);
  });

  it('never lets a skipped row consume quota: only completed sessions and the open one count (N1)', () => {
    const s = seedState({
      labels: LABELS,
      weekdays: [1, 2, 3, 4, 5],
      sessionsPerWeek: 3,
      weeklySessionTarget: 3,
    });
    const skipped = skipSession(s, PROFILE_ID, MONDAY, null);
    expect(served(skipped, TUESDAY, 6)).toEqual([TUESDAY, WEDNESDAY, THURSDAY]);
  });

  it('counts the open (in-progress) session against its week', () => {
    const s = seedState({
      labels: LABELS,
      weekdays: [1, 2, 3, 4, 5],
      sessionsPerWeek: 3,
      weeklySessionTarget: 3,
    });
    const open = startSession(s, PROFILE_ID, MONDAY, NOW_MS); // [ms] epoch, UTC
    expect(served(open, TUESDAY, 6)).toEqual([TUESDAY, WEDNESDAY]);
  });

  it('serves the full quota again in the next ISO week', () => {
    const s = seedState({
      labels: LABELS,
      weekdays: [1, 2, 3, 4, 5],
      sessionsPerWeek: 3,
      weeklySessionTarget: 3,
    });
    expect(served(s, MONDAY, 14).length).toBe(6); // [sessions] 3 + 3
  });
});

describe('postponeSession (R2)', () => {
  const MWF = (): AppState => seedState({ labels: LABELS, weekdays: [1, 3, 5] });

  it('holds the cursor, records the date, and the forecast serves the session on the next preferred day', () => {
    const next = postponeSession(MWF(), PROFILE_ID, MONDAY);
    expect(cursorOf(next).nextSessionIndex).toBe(0);
    expect(cursorOf(next).postponed).toEqual([MONDAY]);
    const days = projectedCalendar(next, PROFILE_ID, MONDAY, 7);
    expect(days[0]?.projectedSession).toBeNull();
    expect(days[2]?.projectedSession?.id).toBe('s-1'); // Wednesday
    expect(days[4]?.projectedSession?.id).toBe('s-2'); // Friday
    const parsed = parseState(next);
    expect(parsed.ok ? parsed.state : parsed.error).toEqual(next);
  });

  it("removes today's planned pick, which holds no sets", () => {
    const picked = assignToday(MWF(), PROFILE_ID, MONDAY, 'Legs');
    const next = postponeSession(picked, PROFILE_ID, MONDAY);
    expect(assignmentOn(next, MONDAY)).toBeNull();
  });

  it('prunes postponed dates before the new one', () => {
    const twice = postponeSession(postponeSession(MWF(), PROFILE_ID, MONDAY), PROFILE_ID, WEDNESDAY);
    expect(cursorOf(twice).postponed).toEqual([WEDNESDAY]);
  });

  it('is a no-op on a day already postponed and on a closed day', () => {
    const once = postponeSession(MWF(), PROFILE_ID, MONDAY);
    expect(postponeSession(once, PROFILE_ID, MONDAY)).toBe(once);
    const done = completeSession(MWF(), PROFILE_ID, MONDAY, NOW_MS);
    expect(postponeSession(done, PROFILE_ID, MONDAY)).toBe(done);
  });

  it('refuses a day whose session has started', () => {
    const started = startSession(MWF(), PROFILE_ID, MONDAY, NOW_MS);
    expect(() => postponeSession(started, PROFILE_ID, MONDAY)).toThrow(
      `postponeSession: session already started on ${MONDAY}`,
    );
  });

  it('refuses a planned pick that already has sets', () => {
    const picked = assignToday(MWF(), PROFILE_ID, MONDAY, 'Legs');
    const set = makeSet({ id: 'x', profileId: PROFILE_ID, assignmentDate: MONDAY, sessionId: 's-2' });
    expect(() => postponeSession({ ...picked, sets: { x: set } }, PROFILE_ID, MONDAY)).toThrow(
      'postponeSession: session already started',
    );
  });
});

describe('any day is trainable (R3, audit D02)', () => {
  it("startSession on a day with no preferred slot opens the cursor's next session", () => {
    const started = startSession(seedState({ labels: LABELS, weekdays: [1, 3, 5] }), PROFILE_ID, TUESDAY, NOW_MS);
    expect(assignmentOn(started, TUESDAY)).toMatchObject({ sessionId: 's-1', status: 'in-progress' });
  });
});

describe('the pick stays the exact dual of its offer under quota and postponement', () => {
  it('offers exactly what assignToday honours on every day of the week', () => {
    const s = postponeSession(
      seedState({ labels: LABELS, weekdays: [1, 2, 3, 4, 5], sessionsPerWeek: 3, weeklySessionTarget: 3 }),
      PROFILE_ID,
      TUESDAY,
    );
    for (const date of [MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY]) {
      const allowed = remainingLabelsThisWeek(s, PROFILE_ID, date);
      for (const label of ['Push', 'Legs', 'Pull']) {
        if (allowed.includes(label)) {
          expect(() => assignToday(s, PROFILE_ID, date, label)).not.toThrow();
        } else {
          expect(() => assignToday(s, PROFILE_ID, date, label)).toThrow(RangeError);
        }
      }
    }
  });
});
