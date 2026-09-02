// One short line about the set just logged. Ladder order, thresholds and expected
// strings are the P4 plan's Task 2; the extra suites below cover the edge cases the
// plan's twelve do not reach (bodyweight, unrecorded load, a tie at the best, and
// the copy contract itself).
//
// Deviations from the P4 plan's Task 2 Step 1 literal (recorded here; the plan is not edited):
//  - Every ProgressionAdvice literal carries `why`. The shipped type (Task 1, commit 32e16f8)
//    requires it: master plan section 3 puts the arithmetic behind a "why?" disclosure, so the
//    plan's four-field literal no longer type-checks.
import { describe, expect, it } from 'vitest';
import { makeBlock, makeExercise, makePlannedExercise, makeProfile, makeSet } from '../../test/fixtures';
import { toStoredLoad } from '../units';
import { coachLine } from './coach';
import { MAX_REASON_WORDS, suggestedProgression, type ProgressionAdvice } from './progression';

const HOLD_AT_60: ProgressionAdvice = {
  kind: 'hold',
  loadKg: 60, // [kg]
  reason: '',
  why: '',
  prescription: { kind: 'reps', lo: 6, hi: 8 }, // [repetitions]
  nextPrescription: { kind: 'reps', lo: 6, hi: 8 }, // [repetitions]
};

/** What suggestedProgression returns for a bodyweight lift: no external load to suggest. */
const BODYWEIGHT_ADVICE: ProgressionAdvice = {
  ...HOLD_AT_60,
  kind: 'extend-reps',
  loadKg: null, // [kg] none exists
  nextPrescription: { kind: 'reps', lo: 6, hi: 10 }, // [repetitions]
};

describe('coachLine (metric)', () => {
  it('reports a load PR against the lifetime best', () => {
    const history = [makeSet({ loadKg: 60, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 62.5, reps: 6 }), history, HOLD_AT_60, 'metric');
    expect(line.text).toBe('Load PR. Previous best 60 kg × 8.');
    expect(line.tone).toBe('telemetry');
  });

  it('reports a rep PR at the same load', () => {
    const history = [makeSet({ loadKg: 60, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 9 }), history, HOLD_AT_60, 'metric');
    expect(line.text).toBe('Rep PR at 60 kg. Previous best 8 reps.');
    expect(line.tone).toBe('telemetry');
  });

  it('reports a load above the suggestion once the 0.5 kg band is cleared', () => {
    const history = [makeSet({ loadKg: 70, reps: 8 })]; // lifetime best is higher, so no PR
    const line = coachLine(makeSet({ loadKg: 62.5, reps: 7 }), history, HOLD_AT_60, 'metric');
    expect(line.text).toBe('2.5 kg over the suggested load.');
    expect(line.tone).toBe('coach');
  });

  it('reports a load below the suggestion once the 2.5 kg band is cleared', () => {
    const history = [makeSet({ loadKg: 70, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 55, reps: 7 }), history, HOLD_AT_60, 'metric');
    expect(line.text).toBe('5 kg under the suggested load.');
  });

  it('stays silent about the suggestion inside the deadband', () => {
    const history = [makeSet({ loadKg: 70, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 7 }), history, HOLD_AT_60, 'metric');
    expect(line.text).toBe('60 kg × 7, inside the prescribed 6-8.');
  });

  it('reports repetitions above the prescribed range', () => {
    const history = [makeSet({ loadKg: 70, reps: 12 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 10 }), history, HOLD_AT_60, 'metric');
    expect(line.text).toBe('2 reps above the prescribed range.');
  });

  it('reports repetitions below the prescribed range', () => {
    const history = [makeSet({ loadKg: 70, reps: 12 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 4 }), history, HOLD_AT_60, 'metric');
    expect(line.text).toBe('4 reps, below the prescribed 6-8.');
  });

  it('reports the top of the range', () => {
    const history = [makeSet({ loadKg: 70, reps: 12 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 8 }), history, HOLD_AT_60, 'metric');
    expect(line.text).toBe('Top of range at 60 kg × 8.');
    expect(line.tone).toBe('coach');
  });

  it('falls back to a plain readout for a timed set', () => {
    const set = makeSet({ loadKg: 0, reps: null, durationS: 45 }); // [s]
    const advice: ProgressionAdvice = {
      ...HOLD_AT_60,
      prescription: { kind: 'duration', targetS: 45 },
      nextPrescription: { kind: 'duration', targetS: 45 },
    };
    const line = coachLine(set, [], advice, 'metric');
    expect(line.text).toBe('45 s logged.');
    expect(line.tone).toBe('telemetry');
  });
});

describe('coachLine (imperial)', () => {
  const lb = (n: number) => toStoredLoad(n, 'imperial'); // [lb] in, [kg] out

  it('labels a load PR in pounds', () => {
    const history = [makeSet({ loadKg: lb(135), reps: 8, enteredUnit: 'imperial' })];
    const line = coachLine(
      makeSet({ loadKg: lb(140), reps: 6, enteredUnit: 'imperial' }),
      history,
      HOLD_AT_60,
      'imperial',
    );
    expect(line.text).toBe('Load PR. Previous best 135 lb × 8.');
  });

  it('uses a 1 lb over-band and a 5 lb under-band, not 0.5 and 2.5', () => {
    // Code review A5: a 0.5 lb band fired on almost every set.
    const advice: ProgressionAdvice = { ...HOLD_AT_60, loadKg: lb(135) };
    const history = [makeSet({ loadKg: lb(200), reps: 8 })];
    const inside = coachLine(makeSet({ loadKg: lb(135.5), reps: 7 }), history, advice, 'imperial');
    expect(inside.text).toBe('135.5 lb × 7, inside the prescribed 6-8.');
    const outside = coachLine(makeSet({ loadKg: lb(140), reps: 7 }), history, advice, 'imperial');
    expect(outside.text).toBe('5 lb over the suggested load.');
  });

  it('reports a rep PR at the same load in pounds', () => {
    const history = [makeSet({ loadKg: lb(135), reps: 8, enteredUnit: 'imperial' })];
    const line = coachLine(
      makeSet({ loadKg: lb(135), reps: 9, enteredUnit: 'imperial' }),
      history,
      HOLD_AT_60,
      'imperial',
    );
    expect(line.text).toBe('Rep PR at 135 lb. Previous best 8 reps.');
    expect(line.tone).toBe('telemetry');
  });

  it('reports the rep-range rungs in pounds', () => {
    const advice: ProgressionAdvice = { ...HOLD_AT_60, loadKg: lb(135) };
    const history = [makeSet({ loadKg: lb(200), reps: 12 })];
    const above = coachLine(makeSet({ loadKg: lb(135), reps: 10 }), history, advice, 'imperial');
    expect(above.text).toBe('2 reps above the prescribed range.');
    const below = coachLine(makeSet({ loadKg: lb(135), reps: 4 }), history, advice, 'imperial');
    expect(below.text).toBe('4 reps, below the prescribed 6-8.');
    const top = coachLine(makeSet({ loadKg: lb(135), reps: 8 }), history, advice, 'imperial');
    expect(top.text).toBe('Top of range at 135 lb × 8.');
  });

  it('reports a load below the suggestion in pounds', () => {
    const advice: ProgressionAdvice = { ...HOLD_AT_60, loadKg: lb(135) };
    const history = [makeSet({ loadKg: lb(200), reps: 8 })];
    const line = coachLine(makeSet({ loadKg: lb(125), reps: 7 }), history, advice, 'imperial');
    expect(line.text).toBe('10 lb under the suggested load.');
    expect(line.tone).toBe('coach');
  });
});

describe('coachLine edge cases', () => {
  it('does not call a tie at the lifetime best a PR', () => {
    const history = [makeSet({ loadKg: 60, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 8 }), history, HOLD_AT_60, 'metric');
    expect(line.text).toBe('Top of range at 60 kg × 8.');
    expect(line.text).not.toContain('PR');
  });

  it('compares loads within a tolerance, never by float equality', () => {
    // Code review A24: 62.5 vs 62.50000000000001 out of a lb conversion is one load.
    const history = [makeSet({ loadKg: 60, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 60 + 1e-12, reps: 8 }), history, HOLD_AT_60, 'metric');
    expect(line.text).not.toContain('Load PR');
    expect(line.text).toBe('Top of range at 60 kg × 8.');
  });

  it('never reports a load PR for a bodyweight set, only a rep PR', () => {
    const history = [makeSet({ loadKg: 0, reps: 10 })]; // [kg] bodyweight
    const line = coachLine(makeSet({ loadKg: 0, reps: 12 }), history, BODYWEIGHT_ADVICE, 'metric');
    expect(line.text).toBe('Rep PR at BW. Previous best 10 reps.');
    expect(line.text).not.toContain('Load PR');
  });

  it('compares a bodyweight set by repetitions alone', () => {
    const history = [makeSet({ loadKg: 0, reps: 10 })];
    const line = coachLine(makeSet({ loadKg: 0, reps: 8 }), history, BODYWEIGHT_ADVICE, 'metric');
    expect(line.text).toBe('Top of range at BW × 8.');
  });

  it('ignores history entries whose load was not recorded', () => {
    const history = [
      makeSet({ loadKg: null, reps: 20 }), // never a lifetime best
      makeSet({ loadKg: 60, reps: 8 }),
    ];
    const line = coachLine(makeSet({ loadKg: 62.5, reps: 6 }), history, HOLD_AT_60, 'metric');
    expect(line.text).toBe('Load PR. Previous best 60 kg × 8.');
  });

  it('gives a plain readout for a set whose load was not recorded', () => {
    const line = coachLine(makeSet({ loadKg: null, reps: 5 }), [], HOLD_AT_60, 'metric');
    expect(line.text).toBe('Set logged.');
    expect(line.tone).toBe('telemetry');
  });

  it('gives a plain readout for an AMRAP prescription', () => {
    const advice: ProgressionAdvice = {
      ...HOLD_AT_60,
      prescription: { kind: 'amrap', minimum: null },
      nextPrescription: { kind: 'amrap', minimum: null },
    };
    const history = [makeSet({ loadKg: 70, reps: 15 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 12 }), history, advice, 'metric');
    expect(line.text).toBe('60 kg × 12 logged.');
    expect(line.tone).toBe('telemetry');
  });

  it('gives a plain readout for a timed prescription completed with reps', () => {
    const advice: ProgressionAdvice = {
      ...HOLD_AT_60,
      prescription: { kind: 'time', targetS: 60 },
      nextPrescription: { kind: 'time', targetS: 60 },
    };
    const line = coachLine(makeSet({ loadKg: 60, reps: 7 }), [], advice, 'metric');
    expect(line.text).toBe('60 kg × 7 logged.');
    expect(line.tone).toBe('telemetry');
  });

  it('says nothing about a suggestion the engine could not make', () => {
    const advice: ProgressionAdvice = { ...HOLD_AT_60, loadKg: null };
    const line = coachLine(makeSet({ loadKg: 200, reps: 7 }), [], advice, 'metric');
    expect(line.text).toBe('200 kg × 7, inside the prescribed 6-8.');
  });

  it('agrees in singular and plural above the range', () => {
    const history = [makeSet({ loadKg: 70, reps: 12 })];
    const one = coachLine(makeSet({ loadKg: 60, reps: 9 }), history, HOLD_AT_60, 'metric');
    expect(one.text).toBe('1 rep above the prescribed range.');
  });
});

describe('coachLine integrates with suggestedProgression', () => {
  it('announces the top of range when the engine is about to add load', () => {
    const history = [
      makeSet({ assignmentDate: '2026-03-02', setNumber: 1, loadKg: 60, reps: 8 }),
      makeSet({ assignmentDate: '2026-03-02', setNumber: 2, loadKg: 60, reps: 8 }),
      makeSet({ assignmentDate: '2026-03-02', setNumber: 3, loadKg: 60, reps: 8 }),
    ];
    const advice = suggestedProgression(
      history,
      makePlannedExercise(),
      makeExercise(),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('add-load');
    const line = coachLine(
      makeSet({ assignmentDate: '2026-03-09', loadKg: 62.5, reps: 6 }),
      history,
      advice,
      'metric',
    );
    expect(line.text).toBe('Load PR. Previous best 60 kg × 8.');
  });
});

describe('coachLine obeys the copy contract', () => {
  const lb = (n: number) => toStoredLoad(n, 'imperial'); // [lb] in, [kg] out
  const history = [makeSet({ loadKg: 70, reps: 12 })];
  const lbHistory = [makeSet({ loadKg: lb(200), reps: 12 })];
  const lbAdvice: ProgressionAdvice = { ...HOLD_AT_60, loadKg: lb(135) };

  // Every rung of the ladder, in both unit systems.
  const lines = [
    coachLine(makeSet({ loadKg: 80, reps: 6 }), history, HOLD_AT_60, 'metric'),
    coachLine(makeSet({ loadKg: 70, reps: 13 }), history, HOLD_AT_60, 'metric'),
    coachLine(makeSet({ loadKg: 62.5, reps: 7 }), history, HOLD_AT_60, 'metric'),
    coachLine(makeSet({ loadKg: 55, reps: 7 }), history, HOLD_AT_60, 'metric'),
    coachLine(makeSet({ loadKg: 60, reps: 10 }), history, HOLD_AT_60, 'metric'),
    coachLine(makeSet({ loadKg: 60, reps: 4 }), history, HOLD_AT_60, 'metric'),
    coachLine(makeSet({ loadKg: 60, reps: 8 }), history, HOLD_AT_60, 'metric'),
    coachLine(makeSet({ loadKg: 60, reps: 7 }), history, HOLD_AT_60, 'metric'),
    coachLine(makeSet({ loadKg: null, reps: 5 }), history, HOLD_AT_60, 'metric'),
    coachLine(makeSet({ loadKg: 0, reps: null, durationS: 45 }), history, HOLD_AT_60, 'metric'),
    coachLine(makeSet({ loadKg: lb(225), reps: 6 }), lbHistory, lbAdvice, 'imperial'),
    coachLine(makeSet({ loadKg: lb(200), reps: 13 }), lbHistory, lbAdvice, 'imperial'),
    coachLine(makeSet({ loadKg: lb(145), reps: 7 }), lbHistory, lbAdvice, 'imperial'),
    coachLine(makeSet({ loadKg: lb(125), reps: 7 }), lbHistory, lbAdvice, 'imperial'),
    coachLine(makeSet({ loadKg: lb(135), reps: 10 }), lbHistory, lbAdvice, 'imperial'),
    coachLine(makeSet({ loadKg: lb(135), reps: 4 }), lbHistory, lbAdvice, 'imperial'),
    coachLine(makeSet({ loadKg: lb(135), reps: 8 }), lbHistory, lbAdvice, 'imperial'),
    coachLine(makeSet({ loadKg: lb(135), reps: 7 }), lbHistory, lbAdvice, 'imperial'),
  ];

  // The rep-range rungs carry no unit, so a metric and an imperial line coincide
  // there by design; uniqueness is asserted within each unit system, not across them.
  const metricLines = lines.slice(0, 10);
  const imperialLines = lines.slice(10);

  it('covers every rung of the ladder in both unit systems', () => {
    expect(new Set(metricLines.map((l) => l.text)).size).toBe(metricLines.length);
    expect(new Set(imperialLines.map((l) => l.text)).size).toBe(imperialLines.length);
  });

  it('keeps every line to twelve words or fewer', () => {
    for (const line of lines) {
      expect(line.text.trim().split(/\s+/).length).toBeLessThanOrEqual(MAX_REASON_WORDS);
    }
  });

  it('uses no dash connector, no percentage and no exclamation', () => {
    for (const line of lines) {
      expect(line.text).not.toMatch(/[—–%!]/);
    }
  });

  it('shows no arithmetic inline', () => {
    for (const line of lines) {
      expect(line.text).not.toMatch(/[+=]/);
    }
  });

  it('never mixes the two unit systems in one line', () => {
    for (const line of metricLines) expect(line.text).not.toContain('lb');
    for (const line of imperialLines) expect(line.text).not.toContain('kg');
  });
});
