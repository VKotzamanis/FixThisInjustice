import { describe, expect, it } from 'vitest';
import { generatePlan } from '../plan/generator';
import { EXERCISES } from '../plan/library';
import { assignToday } from './calendar';
import { programmeWeekOf, sessionTitle } from './rotation';
import { MONDAY, PROFILE_ID, PLAN_ID, seedState } from '../../test/scheduleFixtures';

describe('programmeWeekOf (D09): the week is a fact about the position', () => {
  it('is 1-based, sessionsPerWeek positions to a week', () => {
    const plan = { sessionsPerWeek: 3 };
    expect([0, 2, 3, 5, 6].map((i) => programmeWeekOf(plan, i))).toEqual([1, 1, 2, 2, 3]);
  });
  it('treats a plan with no weekly rate as one week', () => {
    expect(programmeWeekOf({ sessionsPerWeek: 0 }, 7)).toBe(1);
  });
});

describe('sessionTitle', () => {
  it('equals every name the generator bakes, for every split (rule 2: one format)', () => {
    for (const sessionsPerWeek of [2, 3, 4, 5, 6] as const) {
      const plan = generatePlan(
        { sessionsPerWeek, weeks: 12, goal: 'fat-loss', experience: 'intermediate', equipment: 'full-gym', includeCardio: false },
        EXERCISES,
      );
      for (const s of plan.sessions) expect(sessionTitle(plan, s)).toBe(s.name);
    }
  });

  it('reads the week from the position after a plot twist, not from the moved name (D15)', () => {
    const labels = ['A', 'B', 'C', 'A', 'B', 'C'];
    const s = seedState({ labels, weekdays: [1, 3, 5], nextSessionIndex: 2 });
    const picked = assignToday(s, PROFILE_ID, MONDAY, 'A');
    const plan = picked.plans[PLAN_ID];
    if (plan === undefined) throw new Error('fixture: plan missing');
    // Index 2 (week 1) now holds the A that sat at index 3 (week 2).
    expect(plan.sessions[2]?.label).toBe('A');
    expect(sessionTitle(plan, plan.sessions[2] ?? { ordinal: 0, label: '' })).toBe('Week 1 A');
  });
});
