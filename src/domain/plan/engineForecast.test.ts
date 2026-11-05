// ROADMAP L6: the forward readers keep a schedule past the end of a 12-week plan. Reminders
// (computeReminderInstants, SCHEDULE_HORIZON_DAYS) and the .ics window (projectedCalendar over
// CALENDAR_DAYS, as ExportView builds it) both read the forecast the engine keeps materialised.
import { describe, expect, it } from 'vitest';
import { CALENDAR_DAYS } from '../../config/export';
import { SCHEDULE_HORIZON_DAYS } from '../../config/reminders';
import { addDays, isoWeekday } from '../dates';
import { buildIcs, type IcsEvent } from '../export/ics';
import { computeReminderInstants } from '../reminders/instants';
import { projectedCalendar } from '../schedule/calendar';
import { completeSession, isTerminal, startSession } from '../schedule/cursor';
import type { AppState, LocalDate } from '../types';
import { emptyState, makeProfile, MONDAY, PROFILE_ID, TZ_ATHENS } from '../../test/scheduleFixtures';
import { ensureRunway } from './engine';
import { generatePlan } from './generator';
import { EXERCISES } from './library';

const PLAN_ID = 'forecast-plan';
const SPW = 3; // [sessions/week] Mon/Wed/Fri
const WEEKS = 12; // [weeks] the old fixed length

function twelveWeeks(): AppState {
  const plan = generatePlan(
    { sessionsPerWeek: SPW, weeks: WEEKS, goal: 'maintenance', experience: 'novice', equipment: 'full-gym', includeCardio: false },
    EXERCISES,
  );
  return {
    ...emptyState(),
    activeProfileId: PROFILE_ID,
    profiles: { [PROFILE_ID]: makeProfile(TZ_ATHENS) },
    availability: {
      [PROFILE_ID]: {
        slots: [1, 3, 5].map((weekday) => ({ weekday: weekday as 1 | 3 | 5, startTime: '18:00', expectedDurationS: 3600 })),
        weeklySessionTarget: SPW, // [sessions/week]
      },
    },
    plans: { [PLAN_ID]: { ...plan, id: PLAN_ID } },
    cursors: { [PROFILE_ID]: { planId: PLAN_ID, nextSessionIndex: 0, startedOn: MONDAY, completedOn: null } },
    pauses: { [PROFILE_ID]: [] },
    assignments: { [PROFILE_ID]: [] },
    reminderSettings: { [PROFILE_ID]: { enabled: true, dayOfTime: '08:00', leadMinutes: [120] } },
  };
}

/** Every Mon/Wed/Fri from MONDAY, completed through the store's path (completion + runway). */
function finishTwelveWeeks(): { state: AppState; lastDay: LocalDate } {
  let s = twelveWeeks();
  let date = MONDAY;
  let last = MONDAY;
  for (let i = 0; i < WEEKS * SPW; i += 1) {
    while (![1, 3, 5].includes(isoWeekday(date))) date = addDays(date, 1);
    const now = Date.parse(`${date}T15:00:00Z`); // [ms] epoch, UTC
    s = ensureRunway(completeSession(startSession(s, PROFILE_ID, date, now), PROFILE_ID, date, now), PROFILE_ID);
    last = date;
    date = addDays(date, 1);
  }
  return { state: s, lastDay: last };
}

describe('ROADMAP L6: the forecast past the old end of a 12-week plan', () => {
  const { state, lastDay } = finishTwelveWeeks();
  const from = addDays(lastDay, 1);

  it('has not finished: the cursor stands past session 36 with sessions ahead', () => {
    const cursor = state.cursors[PROFILE_ID];
    expect(cursor?.nextSessionIndex).toBe(WEEKS * SPW);
    expect(cursor?.completedOn).toBeNull();
  });

  it('sends reminders for the next SCHEDULE_HORIZON_DAYS days', () => {
    const now = Date.parse(`${from}T06:00:00Z`); // [ms] epoch, UTC
    const instants = computeReminderInstants(state, PROFILE_ID, from, SCHEDULE_HORIZON_DAYS, now);
    // Three slot days a week over three weeks: nine days, a day-of and a 120 min lead each.
    expect(new Set(instants.map((i) => i.key.split(':')[0])).size).toBe(9);
    expect(instants).toHaveLength(18);
    // Every one is past the old last session (36), numbered without an "of N".
    for (const i of instants) {
      const n = Number(/session (\d+)$/.exec(i.body)?.[1]);
      expect(n).toBeGreaterThan(WEEKS * SPW);
    }
    expect(instants[0]?.body).toMatch(/session 37$/);
  });

  it('exports a full .ics window of CALENDAR_DAYS days', () => {
    const events: IcsEvent[] = [];
    for (const day of projectedCalendar(state, PROFILE_ID, from, CALENDAR_DAYS)) {
      if (day.paused || day.slot === null || day.projectedSession === null) continue;
      if (day.assignment !== null && isTerminal(day.assignment)) continue;
      events.push({
        uid: `${day.date}-${day.projectedSession.id}@fixthisinjustice`,
        date: day.date,
        startTime: day.slot.startTime,
        durationS: day.slot.expectedDurationS, // [s]
        summary: day.projectedSession.label,
        description: day.projectedSession.name,
        alarmLeadMinutes: 120, // [min]
      });
    }
    expect(events).toHaveLength(12); // 4 weeks x Mon/Wed/Fri
    expect(new Set(events.map((e) => e.uid)).size).toBe(events.length);
    const ics = buildIcs(events, TZ_ATHENS, Date.parse(`${from}T06:00:00Z`));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(12);
  });
});
