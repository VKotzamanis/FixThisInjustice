import { describe, expect, it } from 'vitest';
import { FORMAT, copy } from '../../../content/copy';
import { STEPS, initialAnswers } from './answers';
import { stepFields, validateStep } from './fields';
import { validAnswers } from './testAnswers';

const NONE = {};

describe('stepFields: which fields each step shows', () => {
  it('lists the body fields for the chosen body-fat route', () => {
    expect(stepFields('body', validAnswers())).toEqual(['name', 'age', 'height', 'mass', 'bodyFatMode', 'bodyFat']);
    expect(stepFields('body', validAnswers({ bodyFatMode: 'tape', sex: 'female' }))).toEqual([
      'name', 'age', 'height', 'mass', 'bodyFatMode', 'neck', 'waist', 'hip', 'tapeDomain', 'tapeWithheld',
    ]);
    // Under `nd` the tape fields are not rendered (decision A1), whatever mode a draft holds.
    expect(stepFields('body', validAnswers({ bodyFatMode: 'tape', sex: 'nd' }))).not.toContain('neck');
  });

  it('shows the load steps and the walk minutes only where the equipment asks them', () => {
    expect(stepFields('training', validAnswers({ equipment: 'bodyweight' }))).toEqual([]);
    expect(stepFields('training', validAnswers({ equipment: 'full-gym', walksToGym: true }))).toEqual([
      'walkMinutes', 'dumbbellStep', 'barbellStep',
    ]);
    expect(stepFields('training', validAnswers({ equipment: 'home', walksToGym: true }))).toEqual([
      'dumbbellStep', 'barbellStep',
    ]);
  });

  it('shows one target, never both, and a slot pair per ticked weekday', () => {
    const noComposition = stepFields('goal', validAnswers());
    expect(noComposition).toContain('targetMass');
    expect(noComposition).not.toContain('targetBodyFat');
    expect(noComposition).toEqual(expect.arrayContaining(['start-1', 'duration-1', 'start-3', 'start-5']));
    expect(noComposition).not.toContain('start-2');
    const withComposition = stepFields('goal', validAnswers({ bodyFatPct: '20' }));
    expect(withComposition).toContain('targetBodyFat');
    expect(withComposition).not.toContain('targetMass');
  });

  it('has no fields on the steps that ask nothing checkable', () => {
    for (const step of ['units', 'guidance', 'review'] as const) expect(stepFields(step, validAnswers())).toEqual([]);
  });
});

describe('validateStep: the gate and the messages are one computation (A09)', () => {
  it('accepts a complete answer set on every step', () => {
    for (const step of STEPS) expect(validateStep(step, validAnswers(), NONE).blocked).toBe(false);
  });

  it('blocks a fresh body step and names every missing field, focus targets in order', () => {
    const v = validateStep('body', initialAnswers(), NONE);
    expect(v.blocked).toBe(true);
    expect(v.errors.age).toBe(copy('error.valueRequired'));
    expect(v.errors.mass).toBe(copy('error.valueRequired'));
    // `nd` is the default, so the percentage is required (A1).
    expect(v.errors.bodyFat).toBe(copy('error.valueRequired'));
    expect(v.invalidFocusIds).toEqual(['f-age', 'f-height-m', 'f-mass', 'f-bodyfat']);
  });

  it('A09: a hidden load step that was cleared does not block training', () => {
    const v = validateStep('training', validAnswers({ equipment: 'bodyweight', dumbbellStep: '', barbellStep: '' }), NONE);
    expect(v).toEqual({ errors: {}, blocked: false, invalidFocusIds: [] });
    expect(validateStep('training', validAnswers({ dumbbellStep: '' }), NONE).errors.dumbbellStep).toBe(
      copy('error.valueRequired'),
    );
  });

  it('A09: a target typed on the hidden route does not block goal', () => {
    // A target body mass left over from before a body-fat estimate existed: the field is hidden.
    expect(validateStep('goal', validAnswers({ bodyFatPct: '20', targetMass: 'abc' }), NONE).blocked).toBe(false);
    expect(validateStep('goal', validAnswers({ targetMass: 'abc' }), NONE).errors.targetMass).toBe(
      copy('error.valueRequired'),
    );
  });

  it('A01 path 1: a cleared start time blocks the day it belongs to', () => {
    const a = validAnswers();
    const v = validateStep('goal', { ...a, days: { ...a.days, 3: { ...a.days[3], startTime: '' } } }, NONE);
    expect(v.errors['start-3']).toBe(copy('error.startTimeRequired'));
    expect(v.blocked).toBe(true);
  });

  it('A01 path 2: a restored name over the loader cap blocks body', () => {
    const v = validateStep('body', validAnswers({ displayName: 'x'.repeat(81) }), NONE);
    expect(v.errors.name).toBe(FORMAT.withSlots('error.nameTooLong', { max: 80 }, NONE));
    expect(v.invalidFocusIds).toEqual([]); // maxLength owns the field; no focus target
  });

  it('names both counts when fewer days are ticked than sessions', () => {
    const v = validateStep('goal', validAnswers({ sessionsPerWeek: 4, weeklySessionTarget: '3' }), NONE);
    expect(v.errors.availabilityDays).toBe(FORMAT.daysForSessions(3, 4));
  });

  it('a restored `none` mode under `nd` blocks with the reason line', () => {
    const v = validateStep('body', validAnswers({ sex: 'nd', bodyFatMode: 'none' }), NONE);
    expect(v.errors.bodyFatMode).toBe(copy('advice.tapeNeedsSex'));
  });

  it('message wording follows the skin overrides', () => {
    const v = validateStep('body', validAnswers({ ageYears: '' }), { 'error.valueRequired': 'SKIN' });
    expect(v.errors.age).toBe('SKIN');
  });
});
