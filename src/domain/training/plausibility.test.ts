import { describe, expect, it } from 'vitest';
import { LOAD_PLAUSIBLE_MAX_RATIO, LOAD_PLAUSIBLE_MIN_RATIO, implausibleLoad } from './plausibility';

describe('implausibleLoad (spec R4)', () => {
  it('flags a load above 2x or below 0.5x the reference', () => {
    expect(LOAD_PLAUSIBLE_MAX_RATIO).toBe(2);
    expect(LOAD_PLAUSIBLE_MIN_RATIO).toBe(0.5);
    expect(implausibleLoad(625, 62.5)).toBe(true); // [kg] the C02 slip
    expect(implausibleLoad(30, 62.5)).toBe(true);
    expect(implausibleLoad(125, 62.5)).toBe(false); // exactly 2x
    expect(implausibleLoad(31.25, 62.5)).toBe(false); // exactly 0.5x
    expect(implausibleLoad(65, 62.5)).toBe(false);
  });

  it('never questions bodyweight or a set with no reference', () => {
    expect(implausibleLoad(0, 62.5)).toBe(false);
    expect(implausibleLoad(100, null)).toBe(false);
    expect(implausibleLoad(100, 0)).toBe(false);
  });
});
