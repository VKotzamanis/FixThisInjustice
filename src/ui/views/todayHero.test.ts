// The Today hero's pose (stylize survey 2026-10-18, item 5; her sheets since the owner's request
// of 2026-10-18): one mapping from the hero's state to one of her sheets or to no picture, tested
// over the whole state union so a state added later cannot reach the screen without a decision.
import { describe, expect, it } from 'vitest';
import { HER_SHEETS } from '../components/herSheets';
import {
  DAY_STATUSES,
  HERO_SCALE,
  HERO_STATES,
  heroPose,
  heroStateOf,
  type HeroPose,
  type HeroState,
} from './todayHero';

/**
 * The owner-approved map, restated as the expectation (survey item 5, build brief 2026-10-18),
 * with each blob pose swapped for her sheet of the same name: lifting, resting, crown.
 */
const EXPECTED: Readonly<Record<HeroState, HeroPose | null>> = {
  planned: 'her-lifting',
  'in-progress': 'her-lifting',
  completed: 'her-resting',
  rest: 'her-resting',
  'programme-complete': 'her-crown',
  // No picture beside a skip or a pause, which may be illness.
  skipped: null,
  paused: null,
};

/** The sheets a hero may show. Anything else (a flopped pose, say) is a new decision. */
const ALLOWED: readonly HeroPose[] = ['her-lifting', 'her-resting', 'her-crown'];

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
  it('maps every hero state to the approved sheet or to no picture', () => {
    expect([...HERO_STATES].sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const state of HERO_STATES) {
      expect({ state, pose: heroPose(state, false) }).toEqual({ state, pose: EXPECTED[state] });
    }
  });

  it('names only sheets that ship', () => {
    for (const state of HERO_STATES) {
      const pose = heroPose(state, false);
      if (pose !== null) expect({ state, ships: pose in HER_SHEETS }).toEqual({ state, ships: true });
    }
  });

  it('shows no picture at all while a missed week is on the screen', () => {
    // Intervention.tsx records the veto: no mascot beside a missed week, in any pose. Today shows
    // that week (the popup, then the intervention block) until the next week closes.
    for (const state of HERO_STATES) {
      expect({ state, pose: heroPose(state, true) }).toEqual({ state, pose: null });
    }
  });

  it('never returns a flopped pose: only lifting, resting or the crown', () => {
    for (const state of HERO_STATES) {
      for (const missed of [false, true]) {
        const pose = heroPose(state, missed);
        if (pose !== null) expect(ALLOWED).toContain(pose);
        expect(pose ?? '').not.toMatch(/flop/);
      }
    }
  });

  it('draws her 64 px frames at 1x, a whole-number scale', () => {
    expect(HERO_SCALE).toBe(1);
    for (const pose of ALLOWED) expect(HER_SHEETS[pose].frameWidth * HERO_SCALE).toBe(64);
  });
});
