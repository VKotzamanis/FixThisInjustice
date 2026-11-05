import { describe, expect, it } from 'vitest';
import { defaultState, parseState } from './schema';
import {
  BODY_MASS_PLAUSIBLE_FRACTION,
  implausibleMass,
  latestBodyFatEntry,
  latestBodyMassEntry,
  nutritionInputFor,
  nutritionInputForState,
  projectionAnchor,
  trendEntries,
} from './measurements';
import { makeProfile } from '../test/fixtures';
import type { AppState, BodyMassEntry } from './types';

/** A body-mass entry of profile-1; [kg], [ms] epoch UTC. */
function entry(patch: Partial<BodyMassEntry> & Pick<BodyMassEntry, 'id' | 'date' | 'massKg'>): BodyMassEntry {
  return {
    profileId: 'profile-1',
    enteredUnit: 'metric',
    bodyFatPct: null,
    loggedAt: 1_000,
    ...patch,
  };
}

function stateWith(list: BodyMassEntry[]): AppState {
  const profile = makeProfile();
  return {
    ...defaultState(),
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    bodyMass: { [profile.id]: list },
    availability: {
      [profile.id]: { slots: [{ weekday: 1, startTime: '18:00', expectedDurationS: 3600 }], weeklySessionTarget: 1 },
    },
  };
}

describe('implausibleMass (spec R4: > 10 % from the last mass asks once)', () => {
  it('questions a slip and never the first weigh-in', () => {
    expect(BODY_MASS_PLAUSIBLE_FRACTION).toBe(0.1);
    expect(implausibleMass(8.2, 82)).toBe(true); // [kg] 18 typed for 180 lb
    expect(implausibleMass(88.5, 80)).toBe(true);
    expect(implausibleMass(88, 80)).toBe(false); // exactly 10 %, binary-exact
    expect(implausibleMass(72, 80)).toBe(false); // exactly 10 %, binary-exact
    expect(implausibleMass(81, 82)).toBe(false);
    expect(implausibleMass(81, null)).toBe(false);
  });
});

describe('trendEntries (audit G12: one role per day, never post)', () => {
  it('keeps one point per day: morning over untagged over pre, post never', () => {
    const list = [
      entry({ id: 'pre', date: '2026-09-07', massKg: 80, role: 'pre', loggedAt: 10 }),
      entry({ id: 'post', date: '2026-09-07', massKg: 78, role: 'post', loggedAt: 20 }),
      entry({ id: 'old', date: '2026-09-07', massKg: 81, loggedAt: 5 }),
      entry({ id: 'am', date: '2026-09-08', massKg: 79.5, role: 'morning', loggedAt: 30 }),
      entry({ id: 'untagged', date: '2026-09-08', massKg: 79.9, loggedAt: 40 }),
      entry({ id: 'post-only', date: '2026-09-09', massKg: 77, role: 'post', loggedAt: 50 }),
    ];
    expect(trendEntries(list).map((e) => e.id)).toEqual(['old', 'am']);
  });

  it('breaks a tie of the same role on the later loggedAt (a re-typed weigh-in corrects the first)', () => {
    const list = [
      entry({ id: 'a', date: '2026-09-08', massKg: 79, loggedAt: 20 }),
      entry({ id: 'b', date: '2026-09-08', massKg: 78.5, loggedAt: 30 }),
    ];
    expect(trendEntries(list).map((e) => e.id)).toEqual(['b']);
  });
});

describe('latestBodyMassEntry and latestBodyFatEntry', () => {
  it('reads the newest trend point, skipping a newer post-session mass (G12)', () => {
    const s = stateWith([
      entry({ id: 'am', date: '2026-09-08', massKg: 80, role: 'morning' }),
      entry({ id: 'post', date: '2026-09-09', massKg: 78, role: 'post' }),
    ]);
    expect(latestBodyMassEntry(s, 'profile-1')?.id).toBe('am');
  });

  it('reads the newest body-fat entry even when a later mass carries none (G05)', () => {
    const s = stateWith([
      entry({ id: 'bf', date: '2026-09-01', massKg: 90, bodyFatPct: 24 }),
      entry({ id: 'later', date: '2026-09-08', massKg: 88 }),
    ]);
    expect(latestBodyFatEntry(s, 'profile-1')?.id).toBe('bf');
    const input = nutritionInputForState(s, 'profile-1', '2026-09-08');
    expect(input?.massKg).toBe(88); // [kg] the newest mass
    expect(input?.bodyFatPct).toBe(24); // [%] the newest body fat, not the null baseline
  });
});

describe('nutritionInputFor keeps its old contract', () => {
  it('pairs the latest entry with its own body fat when no body-fat entry is passed', () => {
    const input = nutritionInputFor(
      makeProfile(),
      entry({ id: 'x', date: '2026-09-08', massKg: 76, bodyFatPct: 24 }),
      4,
      '2026-09-08',
    );
    expect(input.massKg).toBe(76); // [kg]
    expect(input.bodyFatPct).toBe(24); // [%]
    expect(input.ageYears).toBe(31); // [year] 2026 - 1995
  });
});

describe('nutritionInputForState (audit B11: one derivation for screen and export)', () => {
  it('is null for an unknown profile and reads the availability quota', () => {
    const s = stateWith([]);
    expect(nutritionInputForState(s, 'nobody', '2026-09-08')).toBeNull();
    expect(nutritionInputForState(s, 'profile-1', '2026-09-08')?.sessionsPerWeek).toBe(1);
  });
});

describe('projectionAnchor (audit G11)', () => {
  const baseline = { date: '2026-01-01', massKg: 95 }; // [kg]
  it('starts at the programme start, at the latest mass measured on or before it', () => {
    const trend = trendEntries([
      entry({ id: 'a', date: '2026-05-01', massKg: 90 }),
      entry({ id: 'b', date: '2026-06-01', massKg: 85 }),
      entry({ id: 'c', date: '2026-07-01', massKg: 84 }),
    ]);
    expect(projectionAnchor(trend, '2026-06-15', baseline)).toEqual({ date: '2026-06-15', massKg: 85 });
  });

  it('falls back to the baseline, then to the earliest point', () => {
    expect(projectionAnchor([], '2026-02-01', baseline)).toEqual({ date: '2026-02-01', massKg: 95 });
    const trend = trendEntries([entry({ id: 'a', date: '2026-05-01', massKg: 90 })]);
    expect(projectionAnchor(trend, '2025-12-01', baseline)).toEqual({ date: '2025-12-01', massKg: 95 });
  });
});

describe('the role field is additive (rule 7)', () => {
  it('loads an entry without a role and keeps a role it is given', () => {
    const s = stateWith([
      entry({ id: 'old', date: '2026-09-07', massKg: 80 }),
      entry({ id: 'new', date: '2026-09-08', massKg: 79, role: 'pre' }),
    ]);
    const parsed = parseState(JSON.parse(JSON.stringify(s)) as unknown);
    if (!parsed.ok) throw new Error(parsed.error);
    const list = parsed.state.bodyMass['profile-1'] ?? [];
    expect(list[0]).not.toHaveProperty('role');
    expect(list[1]?.role).toBe('pre');
  });
});
