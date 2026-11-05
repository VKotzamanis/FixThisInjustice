import { describe, expect, it } from 'vitest';
import { ACTIVITY_BAND, ACTIVITY_FACTOR, ACTIVITY_STOPS } from './nutrition';
import { bandOfPal, palOf, withPal } from './activity';

describe('the PAL is the one activity value (audit G04)', () => {
  it('reads the stored PAL, else the band floor computeTargets always fell back to', () => {
    expect(palOf({ activity: 'sedentary', activityPal: 1.85 })).toBe(1.85); // [PAL] the diverged G04 document
    expect(palOf({ activity: 'vigorous', activityPal: null })).toBe(ACTIVITY_FACTOR.vigorous);
    expect(palOf({ activity: 'moderate' })).toBe(ACTIVITY_FACTOR.moderate);
  });

  it('derives the band of every stop from the stop table, and of any PAL from the bands', () => {
    for (const stop of ACTIVITY_STOPS) expect(bandOfPal(stop.pal)).toBe(stop.level);
    expect(bandOfPal(1.695)).toBe('sedentary'); // between the printed bands: the lower one
    expect(bandOfPal(ACTIVITY_BAND.vigorous[1])).toBe('vigorous');
  });

  it('writes the PAL and its band together', () => {
    expect(withPal(2.2)).toEqual({ activityPal: 2.2, activity: 'vigorous' });
  });
});
