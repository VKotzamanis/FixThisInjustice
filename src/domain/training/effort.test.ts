// The one-tap effort scale (ROADMAP L8): four buttons, each stored as an RPE in LoggedSet.rpe.
import { describe, expect, it } from 'vitest';
import { LoggedSetSchema } from '../schema';
import { makeSet } from '../../test/fixtures';
import { EFFORT_LEVELS, EFFORT_RPE, effortLevelOf, RPE_ONE_RIR, RPE_ZERO_RIR } from './effort';

describe('effort scale (ROADMAP L8)', () => {
  it('stores the four levels as the RPE the brief names: Easy 7, Solid 8, Hard 9, Max 10', () => {
    expect(EFFORT_RPE).toEqual({ easy: 7, solid: 8, hard: 9, max: 10 }); // [RPE]
    expect(EFFORT_LEVELS).toEqual(['easy', 'solid', 'hard', 'max']);
  });

  it('takes Max and Hard from the two Zourdos 2016 anchors, not from a second copy', () => {
    expect(RPE_ZERO_RIR).toBe(10); // [RPE] 0 repetitions in reserve
    expect(RPE_ONE_RIR).toBe(9); // [RPE] 1 repetition in reserve
    expect(EFFORT_RPE.max).toBe(RPE_ZERO_RIR);
    expect(EFFORT_RPE.hard).toBe(RPE_ONE_RIR);
  });

  it('writes only values the stored schema accepts', () => {
    for (const level of EFFORT_LEVELS) {
      const parsed = LoggedSetSchema.safeParse(makeSet({ rpe: EFFORT_RPE[level] }));
      expect({ level, ok: parsed.success }).toEqual({ level, ok: true });
    }
  });

  it('reads a stored RPE back as its level, and anything no button writes as null', () => {
    for (const level of EFFORT_LEVELS) expect(effortLevelOf(EFFORT_RPE[level])).toBe(level);
    expect(effortLevelOf(null)).toBeNull();
    expect(effortLevelOf(7.5)).toBeNull(); // an imported half point is kept, not relabelled
    expect(effortLevelOf(6)).toBeNull();
  });
});
