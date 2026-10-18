// src/domain/plan/lifecycle.test.ts
//
// The programme lifecycle's pure half (ROADMAP L5, docs/design/programme-lifecycle.md): what a
// regenerated programme is built from, and whether it would differ from the stored one.
import { describe, expect, it } from 'vitest';
import { EXERCISES } from './library';
import { CARDIO_EXERCISE_IDS, generatePlan, PLAN_WEEKS_MAX, PLAN_WEEKS_MIN } from './generator';
import { SPLIT_TEMPLATES, type SessionsPerWeek } from './templates';
import {
  massDirection,
  massTargetReached,
  nextProgrammeGoal,
  planIncludesCardio,
  programmeInput,
  sameProgramme,
} from './lifecycle';
import { makeProfile } from '../../test/fixtures';
import { targetDateFeasibility } from '../nutrition';
import { PlanTemplateSchema } from '../schema';
import type { EquipmentAccess, GoalKind, PlanTemplate, Profile } from '../types';

const DAY_COUNTS: SessionsPerWeek[] = [2, 3, 4, 5, 6];
const ACCESS: EquipmentAccess[] = [
  'bodyweight',
  'home-and-bodyweight',
  'home',
  'full-and-home',
  'full-gym',
];

const profile = makeProfile({ experience: 'intermediate', equipment: 'full-gym' });

/** The plan the wizard would have stored for `profile` with these split choices. */
function storedPlan(sessionsPerWeek: SessionsPerWeek, includeCardio: boolean, weeks = 12): PlanTemplate {
  return generatePlan(
    {
      sessionsPerWeek, // [sessions/week]
      weeks, // [weeks]
      goal: profile.goal.kind,
      experience: profile.experience,
      equipment: profile.equipment,
      includeCardio,
    },
    EXERCISES,
  );
}

describe('planIncludesCardio', () => {
  it('reads the conditioning option back out of every generated plan', () => {
    for (const sessionsPerWeek of DAY_COUNTS) {
      for (const equipment of ACCESS) {
        for (const includeCardio of [false, true]) {
          const plan = generatePlan(
            {
              sessionsPerWeek,
              weeks: PLAN_WEEKS_MIN,
              goal: 'maintenance',
              experience: 'novice',
              equipment,
              includeCardio,
            },
            EXERCISES,
          );
          expect({ sessionsPerWeek, equipment, includeCardio, read: planIncludesCardio(plan) }).toEqual(
            { sessionsPerWeek, equipment, includeCardio, read: includeCardio },
          );
        }
      }
    }
  });

  it('names no conditioning exercise in any template slot', () => {
    // The read-back is exact only while a lifting slot can never resolve to one of these ids.
    const slotIds = Object.values(SPLIT_TEMPLATES).flatMap((t) =>
      t.sessions.flatMap((s) => s.slots.flatMap((slot) => slot.candidates)),
    );
    expect(slotIds.filter((id) => CARDIO_EXERCISE_IDS.includes(id))).toEqual([]);
  });
});

describe('programmeInput', () => {
  it("takes goal, experience and equipment from the profile, and split, length and conditioning from the plan", () => {
    expect(programmeInput(profile, storedPlan(4, true, 10))).toEqual({
      sessionsPerWeek: 4, // [sessions/week]
      weeks: 10, // [weeks]
      goal: profile.goal.kind,
      experience: 'intermediate',
      equipment: 'full-gym',
      includeCardio: true,
    });
  });

  it('lets a choice override the goal, the split and the conditioning option', () => {
    const input = programmeInput(profile, storedPlan(4, true), {
      goal: 'maintenance',
      sessionsPerWeek: 3,
      includeCardio: false,
    });
    expect(input).toMatchObject({ goal: 'maintenance', sessionsPerWeek: 3, includeCardio: false });
  });

  it("clamps a stored plan's length and split into the generator's range", () => {
    // An imported or hand-made plan can hold values the generator refuses.
    const odd: PlanTemplate = { ...storedPlan(3, false), weeks: 2, sessionsPerWeek: 7 };
    expect(programmeInput(profile, odd)).toMatchObject({ weeks: PLAN_WEEKS_MIN, sessionsPerWeek: 6 });
    const long: PlanTemplate = { ...storedPlan(3, false), weeks: 40, sessionsPerWeek: 1 };
    expect(programmeInput(profile, long)).toMatchObject({ weeks: PLAN_WEEKS_MAX, sessionsPerWeek: 2 });
  });
});

describe('sameProgramme', () => {
  it('is true for two builds from the same inputs, whose ids all differ', () => {
    const a = storedPlan(3, false);
    const b = storedPlan(3, false);
    expect(a.id).not.toBe(b.id);
    expect(sameProgramme(a, b)).toBe(true);
  });

  it('is true after a train-something-else swap reordered two sessions', () => {
    const a = storedPlan(3, false);
    const sessions = [...a.sessions];
    const [first, second] = [sessions[0], sessions[1]];
    if (first === undefined || second === undefined) throw new Error('fixture: two sessions');
    // assignToday's transposition (src/domain/schedule/calendar.ts): positions and ordinals swap.
    sessions[0] = { ...second, ordinal: 1 };
    sessions[1] = { ...first, ordinal: 2 };
    expect(sameProgramme({ ...a, sessions }, storedPlan(3, false))).toBe(true);
  });

  it('is true for a stored plan read back through the schema', () => {
    // The schema emits keys in its own order; a reload must not make the plan look changed.
    const a = storedPlan(3, true);
    const parsed = PlanTemplateSchema.parse(JSON.parse(JSON.stringify(a)));
    const reversed = JSON.parse(JSON.stringify(parsed), (_key, value: unknown) =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    ) as PlanTemplate;
    expect(sameProgramme(reversed, storedPlan(3, true))).toBe(true);
  });

  it('is false when experience, equipment, goal, split or conditioning would change', () => {
    const stored = storedPlan(3, false);
    const variants = [
      programmeInput({ ...profile, experience: 'advanced' }, stored),
      programmeInput({ ...profile, equipment: 'bodyweight' }, stored),
      programmeInput({ ...profile, goal: { ...profile.goal, kind: 'fat-loss' } }, stored),
      programmeInput(profile, stored, { sessionsPerWeek: 4 }),
      programmeInput(profile, stored, { includeCardio: true }),
    ];
    for (const input of variants) {
      expect({ input, same: sameProgramme(stored, generatePlan(input, EXERCISES)) }).toEqual({
        input,
        same: false,
      });
    }
    expect(sameProgramme(stored, generatePlan(programmeInput(profile, stored), EXERCISES))).toBe(true);
  });
});

/*
 * ROADMAP L7: after the goal, maintenance. The rule is stated in docs/design/programme-lifecycle.md
 * ("Goal reached") and uses no coefficient: the stored target mass, the latest logged mass, and
 * the direction the goal moves body mass in.
 */
describe('massDirection', () => {
  it('reads the direction off the goal axes: fat loss down, muscle gain up', () => {
    expect(massDirection('fat-loss')).toBe('down');
    expect(massDirection('muscle-gain')).toBe('up');
    expect(massDirection('recomposition')).toBe('held');
    expect(massDirection('maintenance')).toBe('held');
  });

  it('calls a goal mass-held exactly where the nutrition engine holds energy at TDEE', () => {
    const goals: GoalKind[] = ['fat-loss', 'muscle-gain', 'recomposition', 'maintenance'];
    for (const goal of goals) {
      const feasibility = targetDateFeasibility({
        goal,
        currentMassKg: 90, // [kg]
        targetMassKg: 80, // [kg]
        weeks: 10, // [week]
      });
      const engineHolds = !feasibility.assessable && feasibility.gap === 'mass-held';
      expect({ goal, held: massDirection(goal) === 'held' }).toEqual({ goal, held: engineHolds });
    }
  });
});

describe('massTargetReached and nextProgrammeGoal', () => {
  const goalOf = (kind: GoalKind, targetMassKg: number | null): Profile['goal'] => ({
    kind,
    targetMassKg, // [kg]
    targetBodyFatPct: null,
    targetDate: null,
  });
  // [kg] setup baselines the targets below were set against: above a fat-loss target, below a
  // muscle-gain one.
  const ABOVE = 95; // [kg]
  const BELOW = 80; // [kg]

  it('reaches a fat-loss target at or below it', () => {
    expect(massTargetReached(goalOf('fat-loss', 85), 85, ABOVE)).toBe(true); // [kg]
    expect(massTargetReached(goalOf('fat-loss', 85), 84.9, ABOVE)).toBe(true); // [kg]
    expect(massTargetReached(goalOf('fat-loss', 85), 85.1, ABOVE)).toBe(false); // [kg]
  });

  it('reaches a muscle-gain target at or above it', () => {
    expect(massTargetReached(goalOf('muscle-gain', 90), 90, BELOW)).toBe(true); // [kg]
    expect(massTargetReached(goalOf('muscle-gain', 90), 89.9, BELOW)).toBe(false); // [kg]
  });

  it('never reaches a goal that holds mass, a missing target, or no weigh-in', () => {
    expect(massTargetReached(goalOf('recomposition', 80), 70, ABOVE)).toBe(false); // [kg]
    expect(massTargetReached(goalOf('maintenance', 80), 80, ABOVE)).toBe(false); // [kg]
    expect(massTargetReached(goalOf('fat-loss', null), 70, ABOVE)).toBe(false); // [kg]
    expect(massTargetReached(goalOf('fat-loss', 85), null, ABOVE)).toBe(false);
  });

  /*
   * Review R1 (2026-10-18). The wizard stores a body-fat target as the mass it implies at HELD
   * lean mass (SetupWizard.tsx, impliedTargetMassKg): 95 kg at 20 % with a 15 % target is
   * 76 kg lean / 0.85 = 89.41 kg, below the start. Under muscle gain that target points down,
   * so it is never "reached" by standing still at 95 kg.
   */
  it('never reaches a muscle-gain target set below the starting mass', () => {
    const startKg = 95; // [kg] setup baseline
    const leanKg = startKg * (1 - 20 / 100); // [kg] 76 at 20 % body fat
    const targetKg = leanKg / (1 - 15 / 100); // [kg] 89.41 at a 15 % target
    const goal = goalOf('muscle-gain', targetKg);
    expect(massTargetReached(goal, startKg, startKg)).toBe(false);
    expect(nextProgrammeGoal(goal, startKg, startKg)).toEqual({
      goal: 'muscle-gain',
      targetReached: false,
    });
  });

  it('never reaches a target a goal change left pointing the other way, or one at the start', () => {
    // A fat-loss target (85 kg from 95 kg) kept after Settings switched the goal to muscle gain.
    expect(massTargetReached(goalOf('muscle-gain', 85), 96, ABOVE)).toBe(false); // [kg]
    // A muscle-gain target (90 kg from 80 kg) kept after a switch to fat loss.
    expect(massTargetReached(goalOf('fat-loss', 90), 78, BELOW)).toBe(false); // [kg]
    // A target equal to the start asks for no change in either direction.
    expect(massTargetReached(goalOf('fat-loss', 95), 94, 95)).toBe(false); // [kg]
    expect(massTargetReached(goalOf('muscle-gain', 95), 96, 95)).toBe(false); // [kg]
  });

  it('defaults the next goal to maintenance only when the target was reached', () => {
    expect(nextProgrammeGoal(goalOf('fat-loss', 85), 84, ABOVE)).toEqual({
      goal: 'maintenance',
      targetReached: true,
    });
    expect(nextProgrammeGoal(goalOf('fat-loss', 85), 86, ABOVE)).toEqual({
      goal: 'fat-loss',
      targetReached: false,
    });
    expect(nextProgrammeGoal(goalOf('recomposition', 85), 80, ABOVE)).toEqual({
      goal: 'recomposition',
      targetReached: false,
    });
  });
});
