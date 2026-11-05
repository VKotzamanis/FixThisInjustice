import { describe, expect, it } from 'vitest';
import { reviewDraft } from '../../../e2e/support/document';
import { convertBodyAnswers } from './unitSwitch';

describe('convertBodyAnswers (A04): a unit switch converts what was typed', () => {
  const metric = reviewDraft({ mass: '80', targetMass: '75', heightM: '1', heightCm: '80', neck: '38', waist: '', hip: 'abc' });

  it('converts mass to lb at 0.1 and stature to whole feet and inches', () => {
    const out = convertBodyAnswers(metric, 'imperial');
    expect(out.mass).toBe('176.4'); // 80 kg / 0.45359237 = 176.37 lb
    expect(out.targetMass).toBe('165.3'); // 75 kg = 165.35 lb
    expect([out.heightFt, out.heightIn]).toEqual(['5', '11']); // 180 cm = 70.87 in, rounds to 71
    expect(out.neck).toBe('15'); // 38 cm = 14.96 in
  });

  it('leaves blank and unparseable text exactly as typed', () => {
    const out = convertBodyAnswers(metric, 'imperial');
    expect(out.waist).toBe('');
    expect(out.hip).toBe('abc');
  });

  it('converts back without drift for these values', () => {
    const imperial = { ...metric, ...convertBodyAnswers(metric, 'imperial'), units: 'imperial' as const };
    const back = convertBodyAnswers(imperial, 'metric');
    expect(back.mass).toBe('80'); // 176.4 lb = 80.01 kg, shown at 0.1
    expect([back.heightM, back.heightCm]).toEqual(['1', '80']); // 71 in = 180.34 cm
  });

  it('changes nothing when the unit is the same', () => {
    expect(convertBodyAnswers(metric, 'metric').mass).toBe('80');
  });
});
