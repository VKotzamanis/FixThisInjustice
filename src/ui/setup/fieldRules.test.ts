import { describe, expect, it } from 'vitest';
import { FORMAT, copy } from '../../content/copy';
import { NUTRITION_DOMAIN } from '../../domain/nutrition';
import {
  ageYearsError,
  birthYearBound,
  bodyMassEntryError,
  heightCmError,
  heightCmFromParts,
} from './fieldRules';

const NONE = {};

describe('bodyMassEntryError (audit G08: the loader bound, in words)', () => {
  it('names what is wrong instead of refusing in silence', () => {
    const q = copy('quantity.bodyMass');
    expect(bodyMassEntryError(q, '', 'metric', NONE)).toBe(copy('error.valueRequired'));
    expect(bodyMassEntryError(q, 'abc', 'metric', NONE)).toBe(copy('error.valueRequired'));
    expect(bodyMassEntryError(q, '0', 'metric', NONE)).toBe(copy('error.positive'));
    expect(bodyMassEntryError(q, '-5', 'metric', NONE)).toBe(copy('error.positive'));
    expect(bodyMassEntryError(q, '501', 'metric', NONE)).toBe(FORMAT.atMost(q, 500, 'kg'));
    // 1800 lb = 816 kg: the G08 throw. The bound is shown in lb, rounded inward (1102.31 -> 1102.3).
    expect(bodyMassEntryError(q, '1800', 'imperial', NONE)).toBe(FORMAT.atMost(q, 1102.3, 'lb'));
    expect(bodyMassEntryError(q, '80,5', 'metric', NONE)).toBeNull();
    expect(bodyMassEntryError(q, '18', 'imperial', NONE)).toBeNull(); // inside the bound; the plausibility question catches it
  });
});

describe('the wizard rules the profile editor shares (audit G06)', () => {
  it('bounds a birth year by the age domain this calendar year', () => {
    expect(birthYearBound('2026-11-04')).toEqual({
      lo: 2026 - NUTRITION_DOMAIN.ageYears.hi,
      hi: 2026 - NUTRITION_DOMAIN.ageYears.lo,
    });
  });

  it('checks age and height as the wizard does', () => {
    expect(ageYearsError(null, NONE)).toBe(copy('error.valueRequired'));
    expect(ageYearsError(30.5, NONE)).toBe(copy('error.wholeNumber'));
    expect(ageYearsError(17, NONE)).toBe(FORMAT.outOfRange(copy('quantity.age'), 18, 80, 'years'));
    expect(ageYearsError(30, NONE)).toBeNull();
    expect(heightCmError(119, 'metric', NONE)).toBe(FORMAT.outOfRange(copy('quantity.height'), 120, 230, 'cm'));
    expect(heightCmError(180, 'imperial', NONE)).toBeNull();
  });

  it('reads stature from its two fields in either unit system', () => {
    expect(heightCmFromParts('metric', { m: '1', cm: '80', ft: '', inch: '' })).toBe(180); // [cm]
    expect(heightCmFromParts('imperial', { m: '', cm: '', ft: '5', inch: '11' })).toBeCloseTo(180.34, 10); // [cm]
    expect(heightCmFromParts('metric', { m: '', cm: '', ft: '', inch: '' })).toBeNull();
  });
});
