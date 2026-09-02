/*
 * Hydration cue tests.
 *
 * Fixtures are declared here rather than in src/test/*: P4 Task 5 owns only
 * src/domain/training/hydration.{ts,test.ts}, and src/test/trainingFixtures.ts
 * is being written by another task in parallel. makeState() starts from
 * schema.defaultState() so it cannot drift from the shipped AppState shape.
 *
 * Clock anchor: 2026-03-02 is a Monday, and Europe/Athens is UTC+2 (EET) on
 * that date - EU summer time starts on the last Sunday of March, 2026-03-29 -
 * so 16:00 UTC is exactly 18:00 local, the daily-shortfall boundary.
 * All instants below are epoch milliseconds, UTC.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_COPY } from '../../content/copy';
import { defaultState } from '../schema';
import { MICRO_PLATE_STEP } from '../types';
import type {
  AppState,
  BodyMassEntry,
  EpochMs,
  HydrationEntry,
  LocalDate,
  Profile,
  SessionAssignment,
  TimeZone,
} from '../types';
import hydrationSource from './hydration.ts?raw';
import {
  DAILY_SHORTFALL_AFTER,
  DAILY_SHORTFALL_FRACTION,
  DEHYDRATION_FRACTION_TOL,
  DEHYDRATION_LOSS_FRACTION,
  HYDRATION_COPY_KEY,
  PRE_SESSION_MASS_WINDOW_MS,
  SESSION_CHECK_INTERVAL_MS,
  SESSION_LOOKBACK_MS,
  bodyMassLossFraction,
  dailyBeverageTargetML,
  exceedsDehydrationThreshold,
  hydrationCue,
} from './hydration';

const PROFILE_ID = 'profile-1';
const SESSION_ID = 's1';
const TZ_ATHENS: TimeZone = 'Europe/Athens';
const DAY: LocalDate = '2026-03-02';

const MIN_MS = 60_000; // [ms] one minute
const HOUR_MS = 3_600_000; // [ms] one hour

/** 2026-03-02T16:00Z = 18:00 Europe/Athens, the shortfall boundary itself. */
const AT_1800_LOCAL: EpochMs = Date.UTC(2026, 2, 2, 16, 0);
/** 2026-03-02T15:59Z = 17:59 Europe/Athens, one minute before the boundary. */
const AT_1759_LOCAL: EpochMs = Date.UTC(2026, 2, 2, 15, 59);
/** 2026-03-02T10:00Z = 12:00 Europe/Athens, well before the boundary. */
const AT_1200_LOCAL: EpochMs = Date.UTC(2026, 2, 2, 10, 0);

const TARGET_ML = 3000; // [mL/day] the profile's editable daily beverage target

function makeProfile(hydration: Partial<Profile['hydration']> = {}): Profile {
  return {
    id: PROFILE_ID,
    displayName: 'Test subject',
    timezone: TZ_ATHENS,
    units: 'metric',
    createdAt: AT_1200_LOCAL - 30 * 24 * HOUR_MS, // [ms] epoch, UTC
    body: {
      sex: 'male',
      birthYear: 1995,
      heightCm: 180, // [cm]
      baselineMassKg: 96, // [kg]
      baselineAt: '2026-02-01',
      baselineBodyFatPct: null,
    },
    activity: 'moderate',
    experience: 'novice',
    equipment: 'full-gym',
    equipmentSteps: {
      barbellKg: 2.5, // [kg] total on the bar
      dumbbellPairKg: 5, // [kg] per pair
      stackKg: 5, // [kg] per pin
      hasMicroPlates: false,
      microPlateKg: MICRO_PLATE_STEP.metric, // [kg] total for a micro-plate pair
    },
    goal: { kind: 'recomposition', targetMassKg: null, targetBodyFatPct: null, targetDate: null },
    supplements: { creatine: false },
    hydration: { dailyTargetML: TARGET_ML, cupSizeML: 250, weighInOptIn: false, ...hydration }, // [mL]
    readiness: { screenedAt: '2026-02-01', flagged: false },
  };
}

function makeState(patch: Partial<AppState> = {}, profile: Profile = makeProfile()): AppState {
  const base = defaultState();
  return {
    ...base,
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    ...patch,
  };
}

function inProgress(startedAt: EpochMs): SessionAssignment {
  return {
    date: DAY,
    sessionId: SESSION_ID,
    sourceIndex: 0,
    status: 'in-progress',
    startedAt, // [ms] epoch, UTC
    completedAt: null,
    skipReason: null,
  };
}

function completedSession(startedAt: EpochMs, completedAt: EpochMs): SessionAssignment {
  return {
    date: DAY,
    sessionId: SESSION_ID,
    sourceIndex: 0,
    status: 'completed',
    startedAt, // [ms] epoch, UTC
    completedAt, // [ms] epoch, UTC
    skipReason: null,
  };
}

function drank(volumeML: number, marks: EpochMs[] = []): HydrationEntry {
  return { profileId: PROFILE_ID, date: DAY, volumeML, marks }; // [mL], marks in epoch ms UTC
}

function massEntry(id: string, massKg: number, loggedAt: EpochMs): BodyMassEntry {
  return {
    id,
    profileId: PROFILE_ID,
    date: DAY,
    massKg, // [kg]
    enteredUnit: 'metric',
    bodyFatPct: null,
    loggedAt, // [ms] epoch, UTC
  };
}

describe('published constants', () => {
  it('pins the cited thresholds', () => {
    expect(SESSION_CHECK_INTERVAL_MS).toBe(20 * 60 * 1000); // [ms] 20 min
    expect(DAILY_SHORTFALL_AFTER).toBe('18:00'); // [HH:mm] profile-local
    expect(DAILY_SHORTFALL_FRACTION).toBe(0.5); // dimensionless
    expect(DEHYDRATION_LOSS_FRACTION).toBe(0.02); // dimensionless, ACSM 2007
    expect(DEHYDRATION_FRACTION_TOL).toBe(1e-9); // dimensionless, float noise only
    expect(SESSION_LOOKBACK_MS).toBe(12 * 3_600_000); // [ms] 12 h
    expect(PRE_SESSION_MASS_WINDOW_MS).toBe(6 * 3_600_000); // [ms] 6 h
  });

  it('resolves every cue kind to a key the shipped copy table defines', () => {
    // The cue carries a CopyKey, never prose (see the file header). A key with no
    // entry renders as nothing in the Train view, which is a silent failure.
    for (const key of Object.values(HYDRATION_COPY_KEY)) {
      expect(Object.keys(DEFAULT_COPY)).toContain(key);
      expect(DEFAULT_COPY[key]).toBeTruthy();
    }
  });
});

describe('dailyBeverageTargetML', () => {
  it('re-exports the IOM 2005 beverage share, not the total-water AI', () => {
    expect(dailyBeverageTargetML('male')).toBe(3000); // [mL/day]
    expect(dailyBeverageTargetML('female')).toBe(2200); // [mL/day]
  });
});

describe('hydrationCue: session-check', () => {
  const startedAt = AT_1200_LOCAL;
  const activeState = (entries: HydrationEntry[] = []): AppState =>
    makeState({
      assignments: { [PROFILE_ID]: [inProgress(startedAt)] },
      ...(entries.length > 0 ? { hydration: { [PROFILE_ID]: entries } } : {}),
    });

  it('is not due 19 minutes into an active session', () => {
    expect(hydrationCue(activeState(), PROFILE_ID, startedAt + 19 * MIN_MS, true)).toBeNull();
  });

  it('is due exactly 20 minutes after the session started', () => {
    const cue = hydrationCue(activeState(), PROFILE_ID, startedAt + 20 * MIN_MS, true);
    expect(cue?.kind).toBe('session-check');
    expect(cue?.message).toBe(HYDRATION_COPY_KEY['session-check']);
    expect(cue?.shortfallML).toBeNull();
  });

  it('restarts the 20-minute window from the most recent drink mark', () => {
    const state = activeState([drank(400, [startedAt + 15 * MIN_MS])]);
    // 30 min after the start is only 15 min after the mark.
    expect(hydrationCue(state, PROFILE_ID, startedAt + 30 * MIN_MS, true)).toBeNull();
    expect(hydrationCue(state, PROFILE_ID, startedAt + 34 * MIN_MS, true)).toBeNull();
    expect(hydrationCue(state, PROFILE_ID, startedAt + 35 * MIN_MS, true)?.kind).toBe(
      'session-check',
    );
  });

  it('keeps its cues after the session crosses local midnight', () => {
    // Code review: the lookup was `assignment.date === todayLocal(now)`, so a session
    // started at 23:50 local lost every cue at 00:00. 23:50 Europe/Athens on 2026-03-02
    // is 21:50 UTC (UTC+2, EET); 25 min later the local day has already rolled over.
    const lateStart: EpochMs = Date.UTC(2026, 2, 2, 21, 50); // [ms] = 23:50 local, DAY
    const state = makeState({ assignments: { [PROFILE_ID]: [inProgress(lateStart)] } });
    const cue = hydrationCue(state, PROFILE_ID, lateStart + 25 * MIN_MS, true); // 00:15 local
    expect(cue?.kind).toBe('session-check');
    expect(cue?.message).toBe(HYDRATION_COPY_KEY['session-check']);
  });

  it('does not revive a session older than the lookback window', () => {
    const state = activeState();
    expect(
      hydrationCue(state, PROFILE_ID, startedAt + SESSION_LOOKBACK_MS + MIN_MS, true),
    ).toBeNull();
  });

  it('stays silent while no session is active', () => {
    expect(hydrationCue(activeState(), PROFILE_ID, startedAt + 40 * MIN_MS, false)).toBeNull();
  });

  it('never names a volume', () => {
    const cue = hydrationCue(activeState(), PROFILE_ID, startedAt + 25 * MIN_MS, true);
    expect(cue?.message).not.toMatch(/\d/);
  });
});

describe('hydrationCue: daily-shortfall', () => {
  it('fires at 18:00 local when intake is below half the target', () => {
    const state = makeState({ hydration: { [PROFILE_ID]: [drank(1000)] } });
    const cue = hydrationCue(state, PROFILE_ID, AT_1800_LOCAL, false);
    expect(cue?.kind).toBe('daily-shortfall');
    expect(cue?.message).toBe(HYDRATION_COPY_KEY['daily-shortfall']);
    expect(cue?.shortfallML).toBe(2000); // [mL] 3000 target - 1000 logged
  });

  it('does not fire at 17:59 local', () => {
    const state = makeState({ hydration: { [PROFILE_ID]: [drank(1000)] } });
    expect(hydrationCue(state, PROFILE_ID, AT_1759_LOCAL, false)).toBeNull();
  });

  it('does not fire at exactly half the target', () => {
    const state = makeState({ hydration: { [PROFILE_ID]: [drank(1500)] } }); // [mL] = 0.5 x 3000
    expect(hydrationCue(state, PROFILE_ID, AT_1800_LOCAL, false)).toBeNull();
  });

  it('fires one millilitre below half the target', () => {
    const state = makeState({ hydration: { [PROFILE_ID]: [drank(1499)] } });
    expect(hydrationCue(state, PROFILE_ID, AT_1800_LOCAL, false)?.shortfallML).toBe(1501); // [mL]
  });

  it('treats a day with no logged entry as zero intake', () => {
    const cue = hydrationCue(makeState(), PROFILE_ID, AT_1800_LOCAL, false);
    expect(cue?.kind).toBe('daily-shortfall');
    expect(cue?.shortfallML).toBe(TARGET_ML); // [mL]
  });
});

describe('hydrationCue: post-session-weigh', () => {
  const completedAt = AT_1200_LOCAL;
  const startedAt = completedAt - HOUR_MS;
  const preMass = massEntry('bm-pre', 96, startedAt - MIN_MS); // [kg] logged before the session

  const weighState = (weighInOptIn: boolean, bodyMass: BodyMassEntry[]): AppState =>
    makeState(
      {
        assignments: { [PROFILE_ID]: [completedSession(startedAt, completedAt)] },
        bodyMass: { [PROFILE_ID]: bodyMass },
      },
      makeProfile({ weighInOptIn }),
    );

  it('asks for a post-session mass when the profile opted in and a pre-session mass exists', () => {
    const cue = hydrationCue(weighState(true, [preMass]), PROFILE_ID, completedAt + MIN_MS, false);
    expect(cue?.kind).toBe('post-session-weigh');
    expect(cue?.message).toBe(HYDRATION_COPY_KEY['post-session-weigh']);
    expect(cue?.shortfallML).toBeNull();
  });

  it('stays silent when the profile did not opt in', () => {
    expect(
      hydrationCue(weighState(false, [preMass]), PROFILE_ID, completedAt + MIN_MS, false),
    ).toBeNull();
  });

  it('stays silent when no pre-session mass was recorded', () => {
    expect(hydrationCue(weighState(true, []), PROFILE_ID, completedAt + MIN_MS, false)).toBeNull();
  });

  it('does not accept a mass logged a day before the session as the pre-session mass', () => {
    // The calendar day is not what disqualifies it - see the previous-day case above -
    // the 6 h window is.
    const yesterday: BodyMassEntry = {
      ...massEntry('bm-old', 96, startedAt - 24 * HOUR_MS),
      date: '2026-03-01',
    };
    expect(
      hydrationCue(weighState(true, [yesterday]), PROFILE_ID, completedAt + MIN_MS, false),
    ).toBeNull();
  });

  it('does not accept a mass logged more than 6 h before the session started', () => {
    // Same local day, so the old day-scoped rule accepted it. Body mass drifts by of
    // order 1-2 kg within a day, which on this subject is the same order as the 2 %
    // threshold the entry feeds, so a stale mass cannot support the flag.
    const stale = massEntry('bm-stale', 96, startedAt - PRE_SESSION_MASS_WINDOW_MS - MIN_MS);
    expect(hydrationCue(weighState(true, [stale]), PROFILE_ID, completedAt + MIN_MS, false)).toBeNull();
  });

  it('accepts a mass logged inside the 6 h window', () => {
    const fresh = massEntry('bm-fresh', 96, startedAt - PRE_SESSION_MASS_WINDOW_MS + MIN_MS);
    const cue = hydrationCue(weighState(true, [fresh]), PROFILE_ID, completedAt + MIN_MS, false);
    expect(cue?.kind).toBe('post-session-weigh');
  });

  it('accepts a pre-session mass logged on the previous local day', () => {
    // A session that starts at 00:30 local has its pre-session mass on the day before.
    // The window is what qualifies the entry, not the calendar day it is filed under.
    const startedAfterMidnight: EpochMs = Date.UTC(2026, 2, 2, 22, 30); // [ms] = 00:30 local, 03-03
    const endedAfterMidnight: EpochMs = startedAfterMidnight + HOUR_MS;
    const preOnPreviousDay: BodyMassEntry = massEntry('bm-eve', 96, startedAfterMidnight - HOUR_MS);
    const state = makeState(
      {
        assignments: {
          [PROFILE_ID]: [
            { ...completedSession(startedAfterMidnight, endedAfterMidnight), date: '2026-03-03' },
          ],
        },
        bodyMass: { [PROFILE_ID]: [preOnPreviousDay] }, // filed under DAY = 2026-03-02
      },
      makeProfile({ weighInOptIn: true }),
    );
    expect(hydrationCue(state, PROFILE_ID, endedAfterMidnight + MIN_MS, false)?.kind).toBe(
      'post-session-weigh',
    );
  });

  it('stays silent before the session has been completed', () => {
    expect(hydrationCue(weighState(true, [preMass]), PROFILE_ID, completedAt - MIN_MS, false)).toBeNull();
  });

  it('stops asking once a mass has been logged after the session ended', () => {
    const state = weighState(true, [preMass, massEntry('bm-post', 94.2, completedAt + 30_000)]);
    expect(hydrationCue(state, PROFILE_ID, completedAt + MIN_MS, false)).toBeNull();
  });
});

describe('hydrationCue: silence', () => {
  it('returns null when no rule applies', () => {
    const state = makeState({ hydration: { [PROFILE_ID]: [drank(TARGET_ML)] } });
    expect(hydrationCue(state, PROFILE_ID, AT_1800_LOCAL, false)).toBeNull();
  });

  it('returns null for an unknown profile', () => {
    expect(hydrationCue(makeState(), 'no-such-profile', AT_1800_LOCAL, true)).toBeNull();
  });
});

describe('body-mass loss check', () => {
  it('computes loss as a positive fraction of pre-session mass', () => {
    expect(bodyMassLossFraction(100, 98)).toBeCloseTo(0.02, 10); // [kg] -> dimensionless
    expect(bodyMassLossFraction(100, 101)).toBeCloseTo(-0.01, 10); // mass gained -> negative
  });

  it('does not flag a loss of exactly 2 % of pre-session mass', () => {
    expect(exceedsDehydrationThreshold(100, 98)).toBe(false); // [kg], 2.0 % loss
  });

  it('does not flag exactly 2 % at any pre-session mass', () => {
    // Code review: (pre - post) / pre for a 2 % loss lands a few ulp above 0.02 at
    // pre = 70, 85, 96 and 110 kg and at or below it at 80 and 100 kg, so a bare `>`
    // made a physical threshold depend on the subject's mass through rounding.
    for (const preKg of [70, 80, 85, 96, 100, 110]) {
      const postKg = preKg * (1 - DEHYDRATION_LOSS_FRACTION); // [kg] exactly 2 % lost
      expect(exceedsDehydrationThreshold(preKg, postKg), `pre = ${preKg} kg`).toBe(false);
    }
  });

  it('flags 2.01 % at every one of those masses', () => {
    // The tolerance removes float noise, not the threshold: the first hundredth of a
    // percentage point past 2 % is still flagged, and 0.0001 is five orders of
    // magnitude above DEHYDRATION_FRACTION_TOL.
    for (const preKg of [70, 80, 85, 96, 100, 110]) {
      const postKg = preKg * (1 - 0.0201); // [kg] 2.01 % lost
      expect(exceedsDehydrationThreshold(preKg, postKg), `pre = ${preKg} kg`).toBe(true);
    }
  });

  it('flags a loss of 2.1 % of pre-session mass', () => {
    expect(exceedsDehydrationThreshold(100, 97.9)).toBe(true); // [kg], 2.1 % loss
  });
});

describe('no fixed volume is prescribed during a session', () => {
  it('carries no millilitre constant and no per-set fluid instruction', () => {
    expect(hydrationSource).not.toMatch(/\b500\b/);
    expect(hydrationSource).not.toMatch(/between\s+sets/i);
    expect(hydrationSource).not.toMatch(/\bper\s+set\b/i);
    expect(hydrationSource).not.toMatch(/\d+\s*m[lL]\b/);
  });
});
