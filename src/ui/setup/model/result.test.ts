import { describe, expect, it } from 'vitest';
import { FORMAT, copy } from '../../../content/copy';
import { seedBeverageTargetML } from '../../../domain/nutrition';
import { validateStep } from './fields';
import { buildSetupResult, type SetupContext } from './result';
import { validAnswers } from './testAnswers';

const CTX: SetupContext = {
  today: '2026-09-04',
  zone: 'America/Chicago',
  profileId: 'p-test',
  now: 1_788_000_000_000, // [ms] epoch, synthetic
  overrides: {},
};

describe('buildSetupResult: the values completeSetup takes', () => {
  it('builds profile, availability and plan from a complete answer set', () => {
    const built = buildSetupResult(validAnswers(), CTX);
    if (!built.ok) throw new Error(`expected a result, got ${built.reason}`);
    const { profile, availability, plan, startedOn } = built.result;
    expect(startedOn).toBe('2026-09-04');
    expect(profile.id).toBe('p-test');
    expect(profile.displayName).toBe('Tester');
    expect(profile.body.birthYear).toBe(1996); // 2026 - 30 [year]
    expect(profile.body.heightCm).toBe(178); // 1 m + 78 cm [cm]
    expect(profile.body.baselineMassKg).toBe(80); // [kg]
    expect(profile.hydration.dailyTargetML).toBe(seedBeverageTargetML('male')); // [mL/day]
    expect(availability.slots.map((s) => [s.weekday, s.startTime, s.expectedDurationS])).toEqual([
      [1, '07:30', 3600],
      [3, '18:00', 2700],
      [5, '07:30', 3600],
    ]);
    expect(availability.weeklySessionTarget).toBe(3);
    expect(plan.sessionsPerWeek).toBe(3);
  });

  it('defaults a blank name and re-gates answers whose question is no longer shown', () => {
    const built = buildSetupResult(
      validAnswers({ displayName: '  ', equipment: 'home', walksToGym: true, walkMinutes: '15', bodyweightEquipment: ['yoga-mat'] }),
      CTX,
    );
    if (!built.ok) throw new Error(built.reason);
    expect(built.result.profile.displayName).toBe('Operator');
    expect(built.result.profile.gymCommute).toEqual({ walks: false, minutesEachWay: 0 });
  });

  it('A09: a hidden, cleared load step stores the unit default instead of failing', () => {
    const built = buildSetupResult(validAnswers({ equipment: 'bodyweight', barbellStep: '', dumbbellStep: '' }), CTX);
    if (!built.ok) throw new Error(built.reason);
    expect(built.result.profile.equipmentSteps.barbellKg).toBeGreaterThan(0); // [kg]
  });

  it('stores the target mass a body-fat target implies at held lean mass', () => {
    const built = buildSetupResult(validAnswers({ bodyFatPct: '20', targetBodyFat: '15', targetMass: '70' }), CTX);
    if (!built.ok) throw new Error(built.reason);
    // lean = 80 * 0.8 = 64 kg; target = 64 / 0.85 = 75.29 kg. The typed 70 kg is not stored.
    expect(built.result.profile.goal.targetMassKg).toBeCloseTo(64 / 0.85, 10);
    expect(built.result.profile.goal.targetBodyFatPct).toBe(15);
  });

  it('refuses to build while a step is blocked, and names the steps', () => {
    const built = buildSetupResult(validAnswers({ ageYears: '', timezone: 'Not/AZone' }), CTX);
    expect(built).toEqual({ ok: false, reason: 'blocked', steps: ['timezone', 'body'] });
  });

  it('A01 path 3: the goal step refuses a body-fat target whose implied mass exceeds the schema cap', () => {
    // 300 kg at 3 % fat, 60 % target: lean 291 kg, implied 727.5 kg > MAX_MASS_KG (500 kg).
    const a = validAnswers({ mass: '300', bodyFatPct: '3', targetBodyFat: '60' });
    expect(validateStep('goal', a, {}).errors.targetBodyFat).toBe(
      FORMAT.atMost(copy('quantity.targetBodyMass'), 500, 'kg'),
    );
    expect(buildSetupResult(a, CTX)).toEqual({ ok: false, reason: 'blocked', steps: ['goal'] });
    // In pounds the bound is named in pounds, rounded inward (1102.31 -> 1102.3).
    const lb = validateStep('goal', validAnswers({ units: 'imperial', mass: '661', bodyFatPct: '3', targetBodyFat: '60' }), {});
    expect(lb.errors.targetBodyFat).toBe(FORMAT.atMost(copy('quantity.targetBodyMass'), 1102.3, 'lb'));
    // 41 % implies 291 / 0.59 = 493.2 kg, inside the cap: accepted.
    expect(validateStep('goal', validAnswers({ mass: '300', bodyFatPct: '3', targetBodyFat: '41' }), {}).blocked).toBe(false);
  });
});
