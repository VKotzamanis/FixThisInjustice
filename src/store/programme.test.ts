// src/store/programme.test.ts
//
// restartProgramme: the one action behind Settings' Update Programme and Today's Start Next
// Programme (ROADMAP L5, B1b; docs/design/programme-lifecycle.md).
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './index';
import { importJson as parseDocument } from './persistence';
import { EXERCISES } from '../domain/plan/library';
import { generatePlan } from '../domain/plan/generator';
import { programmeInput, sameProgramme } from '../domain/plan/lifecycle';
import { makeProfile } from '../test/fixtures';
import type { BodyMassEntry, IsoWeekday, LoggedSet, PlanTemplate, Profile } from '../domain/types';

const PROFILE: Profile = makeProfile({
  id: 'p1',
  experience: 'novice',
  equipment: 'full-gym',
  goal: { kind: 'fat-loss', targetMassKg: 85, targetBodyFatPct: null, targetDate: '2027-01-04' },
});

/** Monday, Wednesday, Friday, 07:00, one hour each. */
const MWF: IsoWeekday[] = [1, 3, 5];

function seedProfileWithPlan(): PlanTemplate {
  const s = useAppStore.getState();
  s.createProfile(PROFILE);
  s.setAvailability('p1', {
    slots: MWF.map((weekday) => ({ weekday, startTime: '07:00', expectedDurationS: 3600 })), // [s]
    weeklySessionTarget: 3, // [sessions/week]
  });
  const plan = generatePlan(
    {
      sessionsPerWeek: 3, // [sessions/week]
      weeks: 12, // [weeks]
      goal: 'fat-loss',
      experience: 'novice',
      equipment: 'full-gym',
      includeCardio: false,
    },
    EXERCISES,
  );
  s.setPlan('p1', plan, '2026-09-07');
  return currentPlan();
}

function currentPlan(): PlanTemplate {
  const s = useAppStore.getState();
  const plan = s.plans[s.cursors['p1']?.planId ?? ''];
  if (plan === undefined) throw new Error('fixture: no current plan');
  return plan;
}

const SET: LoggedSet = {
  id: 'set-1',
  profileId: 'p1',
  assignmentDate: '2026-09-07',
  sessionId: 'any',
  exerciseId: 'barbell-back-squat',
  setNumber: 1,
  isBonus: false,
  loadKg: 100, // [kg]
  enteredUnit: 'metric',
  reps: 5, // [reps]
  durationS: null, // [s]
  rpe: null,
  loggedAt: 1, // [ms] epoch UTC
};

const WEIGH_IN: BodyMassEntry = {
  id: 'bm-1',
  profileId: 'p1',
  date: '2026-10-01',
  massKg: 90, // [kg]
  enteredUnit: 'metric',
  bodyFatPct: null, // [%]
  loggedAt: 2, // [ms] epoch UTC
};

beforeEach(() => {
  useAppStore.getState().wipeAll();
});

describe('restartProgramme', () => {
  it('starts a programme today from the current settings, keeping logs and the old plan', () => {
    const before = seedProfileWithPlan();
    useAppStore.setState((s) => ({
      sets: { [SET.id]: SET },
      bodyMass: { ...s.bodyMass, p1: [WEIGH_IN] },
    }));
    useAppStore.getState().updateProfile('p1', { experience: 'advanced' });

    useAppStore.getState().restartProgramme('p1', {}, '2026-10-14');

    const s = useAppStore.getState();
    const after = currentPlan();
    expect(after.id).not.toBe(before.id);
    expect(s.cursors['p1']).toMatchObject({ nextSessionIndex: 0, startedOn: '2026-10-14', completedOn: null });
    // Built from the profile as it is now: advanced, same split, length and conditioning.
    const expected = generatePlan(
      programmeInput(s.profiles['p1'] ?? PROFILE, before),
      EXERCISES,
    );
    expect(sameProgramme(after, expected)).toBe(true);
    expect(sameProgramme(after, before)).toBe(false);
    expect(after.weeks).toBe(12); // [weeks]
    // History stays: the replaced plan, the sets, the body mass.
    expect(s.plans[before.id]).toBeDefined();
    expect(s.sets).toEqual({ [SET.id]: SET });
    expect(s.bodyMass['p1']).toEqual([WEIGH_IN]);
    const parsed = parseDocument(s.exportJson());
    expect(parsed.ok ? null : parsed.error).toBeNull();
  });

  it('applies a chosen split and sets the weekly target to it, as the wizard does', () => {
    seedProfileWithPlan();
    useAppStore.getState().restartProgramme('p1', { sessionsPerWeek: 2, includeCardio: true }, '2026-10-14');
    const s = useAppStore.getState();
    expect(currentPlan().sessionsPerWeek).toBe(2); // [sessions/week]
    expect(s.availability['p1']?.weeklySessionTarget).toBe(2); // [sessions/week]
    expect(s.availability['p1']?.slots).toHaveLength(3);
  });

  it('keeps the weekly target when the split is unchanged', () => {
    seedProfileWithPlan();
    useAppStore.getState().setAvailability('p1', {
      ...(useAppStore.getState().availability['p1'] ?? { slots: [], weeklySessionTarget: 0 }),
      weeklySessionTarget: 2, // [sessions/week] the user chose fewer than the split
    });
    useAppStore.getState().restartProgramme('p1', { sessionsPerWeek: 3 }, '2026-10-14');
    expect(useAppStore.getState().availability['p1']?.weeklySessionTarget).toBe(2);
  });

  it('writes a chosen goal kind and leaves the rest of the goal as stored', () => {
    seedProfileWithPlan();
    useAppStore.getState().restartProgramme('p1', { goal: 'maintenance' }, '2026-10-14');
    expect(useAppStore.getState().profiles['p1']?.goal).toEqual({
      ...PROFILE.goal,
      kind: 'maintenance',
    });
    expect(currentPlan().name).toMatch(/maintenance$/);
  });

  it('refuses while a session is in progress, writing nothing', () => {
    const before = seedProfileWithPlan();
    useAppStore.getState().startSession('p1', '2026-09-07', 1); // [ms] epoch UTC
    const snapshot = useAppStore.getState();
    expect(() => {
      useAppStore.getState().restartProgramme('p1', { goal: 'maintenance' }, '2026-09-07');
    }).toThrow(/a session is in progress/);
    const s = useAppStore.getState();
    expect(currentPlan().id).toBe(before.id);
    expect(s.profiles).toBe(snapshot.profiles);
    expect(s.availability).toBe(snapshot.availability);
  });

  it('refuses a split above the number of training weekdays', () => {
    const before = seedProfileWithPlan();
    expect(() => {
      useAppStore.getState().restartProgramme('p1', { sessionsPerWeek: 4 }, '2026-10-14');
    }).toThrow(/4 sessions per week.*3 training days/);
    expect(currentPlan().id).toBe(before.id);
  });

  it('refuses a profile with no programme to restart', () => {
    useAppStore.getState().createProfile(PROFILE);
    expect(() => {
      useAppStore.getState().restartProgramme('p1', {}, '2026-10-14');
    }).toThrow(/no programme/);
  });
});
