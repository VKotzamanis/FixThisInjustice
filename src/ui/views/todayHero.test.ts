// The Today hero's mascot pose (stylize survey 2026-10-18, item 5): one mapping from the hero's
// state to a pose or to no picture, tested over the whole state union so a state added later
// cannot reach the screen without a decision here.
import { describe, expect, it } from 'vitest';
import {
  DAY_STATUSES,
  HERO_STATES,
  heroPose,
  heroStateOf,
  type HeroPose,
  type HeroState,
} from './todayHero';

/** The owner-approved map, restated as the expectation (survey item 5, build brief 2026-10-18). */
const EXPECTED: Readonly<Record<HeroState, HeroPose | null>> = {
  // Not started yet: round three's original spot for lifting (asset manifest section 0.3), at
  // 56 px so the session list under it moves down less.
  planned: { name: 'mascotLifting', size: 56 },
  'in-progress': { name: 'mascotLifting', size: 72 },
  completed: { name: 'mascotResting', size: 72 },
  rest: { name: 'mascotResting', size: 72 },
  'programme-complete': { name: 'mascotCrown', size: 72 },
  // No picture beside a skip or a pause, which may be illness.
  skipped: null,
  paused: null,
};

describe('heroStateOf', () => {
  it('passes every day status through, except that a rest day ends the programme once finished', () => {
    for (const status of DAY_STATUSES) {
      expect({ status, state: heroStateOf(status, false) }).toEqual({ status, state: status });
    }
    expect(heroStateOf('rest', true)).toBe('programme-complete');
  });

  it('keeps the hero precedence: a day with its own status outranks the finished programme', () => {
    // TodayView tests the slot, in-progress, paused, completed and skipped branches before the
    // finished one, so only a day the projection serves nothing on reads as programme complete.
    for (const status of DAY_STATUSES.filter((s) => s !== 'rest')) {
      expect({ status, state: heroStateOf(status, true) }).toEqual({ status, state: status });
    }
  });
});

describe('heroPose', () => {
  it('maps every hero state to the approved pose or to no picture', () => {
    expect([...HERO_STATES].sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const state of HERO_STATES) {
      expect({ state, pose: heroPose(state, false) }).toEqual({ state, pose: EXPECTED[state] });
    }
  });

  it('shows no picture at all while a missed week is on the screen', () => {
    // Intervention.tsx records the veto: no mascot beside a missed week, in any pose. Today shows
    // that week (the popup, then the intervention block) until the next week closes.
    for (const state of HERO_STATES) {
      expect({ state, pose: heroPose(state, true) }).toEqual({ state, pose: null });
    }
  });

  it('never returns the flopped mascot', () => {
    for (const state of HERO_STATES) {
      for (const missed of [false, true]) {
        expect(heroPose(state, missed)?.name).not.toBe('mascotFlop');
      }
    }
  });
});
