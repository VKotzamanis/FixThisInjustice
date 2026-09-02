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
import { DEFAULT_COPY, FORMAT } from '../../content/copy';
import { makeBlock, makeExercise, makePlannedExercise, makeProfile, makeSet } from '../../test/fixtures';
import { toStoredLoad } from '../units';
import { coachLine, type CoachLine } from './coach';
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

/**
 * The sentence a coach line renders to under the DEFAULT skin.
 *
 * P4 review item 2: coachLine returns a copy key and its values, not English. Every literal
 * asserted below is the string this module shipped before that refactor, so the suite is the
 * byte-identity check the review asked for. The two personal-record lines are the deliberate
 * exception (review item 3): "PR" was a colloquial stand-in and contract R11 forbids it.
 */
function render(line: CoachLine): string {
  return FORMAT.withSlots(line.key, line.params);
}

describe('coachLine (metric)', () => {
  it('reports a load personal record against the lifetime best', () => {
    const history = [makeSet({ loadKg: 60, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 62.5, reps: 6 }), history, HOLD_AT_60, 'metric');
    expect(render(line)).toBe('Load personal record. Previous best 60 kg × 8.');
    expect(line.tone).toBe('telemetry');
  });

  it('reports a repetition personal record at the same load', () => {
    const history = [makeSet({ loadKg: 60, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 9 }), history, HOLD_AT_60, 'metric');
    expect(render(line)).toBe('Repetition personal record at 60 kg. Previous best 8 reps.');
    expect(line.tone).toBe('telemetry');
  });

  it('reports a load above the suggestion once the 0.5 kg band is cleared', () => {
    const history = [makeSet({ loadKg: 70, reps: 8 })]; // lifetime best is higher, so no personal record
    const line = coachLine(makeSet({ loadKg: 62.5, reps: 7 }), history, HOLD_AT_60, 'metric');
    expect(render(line)).toBe('2.5 kg over the suggested load.');
    expect(line.tone).toBe('coach');
  });

  it('reports a load below the suggestion once the 2.5 kg band is cleared', () => {
    const history = [makeSet({ loadKg: 70, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 55, reps: 7 }), history, HOLD_AT_60, 'metric');
    expect(render(line)).toBe('5 kg under the suggested load.');
  });

  it('stays silent about the suggestion inside the deadband', () => {
    const history = [makeSet({ loadKg: 70, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 7 }), history, HOLD_AT_60, 'metric');
    expect(render(line)).toBe('60 kg × 7, inside the prescribed 6-8.');
  });

  it('reports repetitions above the prescribed range', () => {
    const history = [makeSet({ loadKg: 70, reps: 12 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 10 }), history, HOLD_AT_60, 'metric');
    expect(render(line)).toBe('2 reps above the prescribed range.');
  });

  it('reports repetitions below the prescribed range', () => {
    const history = [makeSet({ loadKg: 70, reps: 12 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 4 }), history, HOLD_AT_60, 'metric');
    expect(render(line)).toBe('4 reps, below the prescribed 6-8.');
  });

  it('reports the top of the range', () => {
    const history = [makeSet({ loadKg: 70, reps: 12 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 8 }), history, HOLD_AT_60, 'metric');
    expect(render(line)).toBe('Top of range at 60 kg × 8.');
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
    expect(render(line)).toBe('45 s logged.');
    expect(line.tone).toBe('telemetry');
  });
});

describe('coachLine (imperial)', () => {
  const lb = (n: number) => toStoredLoad(n, 'imperial'); // [lb] in, [kg] out

  it('labels a load personal record in pounds', () => {
    const history = [makeSet({ loadKg: lb(135), reps: 8, enteredUnit: 'imperial' })];
    const line = coachLine(
      makeSet({ loadKg: lb(140), reps: 6, enteredUnit: 'imperial' }),
      history,
      HOLD_AT_60,
      'imperial',
    );
    expect(render(line)).toBe('Load personal record. Previous best 135 lb × 8.');
  });

  it('uses a 1 lb over-band and a 5 lb under-band, not 0.5 and 2.5', () => {
    // Code review A5: a 0.5 lb band fired on almost every set.
    const advice: ProgressionAdvice = { ...HOLD_AT_60, loadKg: lb(135) };
    const history = [makeSet({ loadKg: lb(200), reps: 8 })];
    const inside = coachLine(makeSet({ loadKg: lb(135.5), reps: 7 }), history, advice, 'imperial');
    expect(render(inside)).toBe('135.5 lb × 7, inside the prescribed 6-8.');
    const outside = coachLine(makeSet({ loadKg: lb(140), reps: 7 }), history, advice, 'imperial');
    expect(render(outside)).toBe('5 lb over the suggested load.');
  });

  it('reports a repetition personal record at the same load in pounds', () => {
    const history = [makeSet({ loadKg: lb(135), reps: 8, enteredUnit: 'imperial' })];
    const line = coachLine(
      makeSet({ loadKg: lb(135), reps: 9, enteredUnit: 'imperial' }),
      history,
      HOLD_AT_60,
      'imperial',
    );
    expect(render(line)).toBe('Repetition personal record at 135 lb. Previous best 8 reps.');
    expect(line.tone).toBe('telemetry');
  });

  it('reports the rep-range rungs in pounds', () => {
    const advice: ProgressionAdvice = { ...HOLD_AT_60, loadKg: lb(135) };
    const history = [makeSet({ loadKg: lb(200), reps: 12 })];
    const above = coachLine(makeSet({ loadKg: lb(135), reps: 10 }), history, advice, 'imperial');
    expect(render(above)).toBe('2 reps above the prescribed range.');
    const below = coachLine(makeSet({ loadKg: lb(135), reps: 4 }), history, advice, 'imperial');
    expect(render(below)).toBe('4 reps, below the prescribed 6-8.');
    const top = coachLine(makeSet({ loadKg: lb(135), reps: 8 }), history, advice, 'imperial');
    expect(render(top)).toBe('Top of range at 135 lb × 8.');
  });

  it('reports a load below the suggestion in pounds', () => {
    const advice: ProgressionAdvice = { ...HOLD_AT_60, loadKg: lb(135) };
    const history = [makeSet({ loadKg: lb(200), reps: 8 })];
    const line = coachLine(makeSet({ loadKg: lb(125), reps: 7 }), history, advice, 'imperial');
    expect(render(line)).toBe('10 lb under the suggested load.');
    expect(line.tone).toBe('coach');
  });
});

describe('coachLine edge cases', () => {
  it('does not call a tie at the lifetime best a personal record', () => {
    const history = [makeSet({ loadKg: 60, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 8 }), history, HOLD_AT_60, 'metric');
    expect(render(line)).toBe('Top of range at 60 kg × 8.');
    expect(line.key).not.toBe('coach.loadPr');
    expect(line.key).not.toBe('coach.repPr');
    expect(render(line)).not.toContain('personal record');
  });

  it('compares loads within a tolerance, never by float equality', () => {
    // Code review A24: 62.5 vs 62.50000000000001 out of a lb conversion is one load.
    const history = [makeSet({ loadKg: 60, reps: 8 })];
    const line = coachLine(makeSet({ loadKg: 60 + 1e-12, reps: 8 }), history, HOLD_AT_60, 'metric');
    expect(render(line)).not.toContain('Load personal record');
    expect(render(line)).toBe('Top of range at 60 kg × 8.');
  });

  it('never reports a load personal record for a bodyweight set, only a repetition one', () => {
    const history = [makeSet({ loadKg: 0, reps: 10 })]; // [kg] bodyweight
    const line = coachLine(makeSet({ loadKg: 0, reps: 12 }), history, BODYWEIGHT_ADVICE, 'metric');
    expect(render(line)).toBe('Repetition personal record at BW. Previous best 10 reps.');
    expect(render(line)).not.toContain('Load personal record');
  });

  it('compares a bodyweight set by repetitions alone', () => {
    const history = [makeSet({ loadKg: 0, reps: 10 })];
    const line = coachLine(makeSet({ loadKg: 0, reps: 8 }), history, BODYWEIGHT_ADVICE, 'metric');
    expect(render(line)).toBe('Top of range at BW × 8.');
  });

  it('ignores history entries whose load was not recorded', () => {
    const history = [
      makeSet({ loadKg: null, reps: 20 }), // never a lifetime best
      makeSet({ loadKg: 60, reps: 8 }),
    ];
    const line = coachLine(makeSet({ loadKg: 62.5, reps: 6 }), history, HOLD_AT_60, 'metric');
    expect(render(line)).toBe('Load personal record. Previous best 60 kg × 8.');
  });

  it('gives a plain readout for a set whose load was not recorded', () => {
    const line = coachLine(makeSet({ loadKg: null, reps: 5 }), [], HOLD_AT_60, 'metric');
    expect(render(line)).toBe('Set logged.');
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
    expect(render(line)).toBe('60 kg × 12 logged.');
    expect(line.tone).toBe('telemetry');
  });

  it('gives a plain readout for a timed prescription completed with reps', () => {
    const advice: ProgressionAdvice = {
      ...HOLD_AT_60,
      prescription: { kind: 'time', targetS: 60 },
      nextPrescription: { kind: 'time', targetS: 60 },
    };
    const line = coachLine(makeSet({ loadKg: 60, reps: 7 }), [], advice, 'metric');
    expect(render(line)).toBe('60 kg × 7 logged.');
    expect(line.tone).toBe('telemetry');
  });

  it('says nothing about a suggestion the engine could not make', () => {
    const advice: ProgressionAdvice = { ...HOLD_AT_60, loadKg: null };
    const line = coachLine(makeSet({ loadKg: 200, reps: 7 }), [], advice, 'metric');
    expect(render(line)).toBe('200 kg × 7, inside the prescribed 6-8.');
  });

  it('agrees in singular and plural above the range', () => {
    const history = [makeSet({ loadKg: 70, reps: 12 })];
    const one = coachLine(makeSet({ loadKg: 60, reps: 9 }), history, HOLD_AT_60, 'metric');
    expect(render(one)).toBe('1 rep above the prescribed range.');
  });
});

describe('coachLine on a set carrying no external load', () => {
  // Code review: `advice.loadKg === null` covers a lift the PLAN marks bodyweight, but not a
  // loaded lift performed at zero external load. Both probes below are the reviewer's; before
  // the fix they printed the whole suggestion back as a shortfall.
  const lb = (n: number) => toStoredLoad(n, 'imperial'); // [lb] in, [kg] out
  const history = [makeSet({ loadKg: 70, reps: 12 })]; // lifetime best is higher, so no personal record
  const lbAdvice: ProgressionAdvice = { ...HOLD_AT_60, loadKg: lb(135) };
  const lbHistory = [makeSet({ loadKg: lb(200), reps: 12 })];

  it('does not report the suggested load back as a shortfall (metric)', () => {
    // Reviewer's probe: this printed "60 kg under the suggested load."
    const line = coachLine(makeSet({ loadKg: 0, reps: 7 }), history, HOLD_AT_60, 'metric');
    expect(render(line)).not.toContain('under the suggested load');
    expect(render(line)).toBe('BW × 7, inside the prescribed 6-8.');
  });

  it('does not report the suggested load back as a shortfall (imperial)', () => {
    // Reviewer's probe: this printed "135 lb under the suggested load."
    const line = coachLine(makeSet({ loadKg: 0, reps: 7 }), lbHistory, lbAdvice, 'imperial');
    expect(render(line)).not.toContain('under the suggested load');
    expect(render(line)).toBe('BW × 7, inside the prescribed 6-8.');
  });

  it('judges it on repetitions alone at every rung of the range', () => {
    const above = coachLine(makeSet({ loadKg: 0, reps: 10 }), history, HOLD_AT_60, 'metric');
    expect(render(above)).toBe('2 reps above the prescribed range.');
    const below = coachLine(makeSet({ loadKg: 0, reps: 4 }), history, HOLD_AT_60, 'metric');
    expect(render(below)).toBe('4 reps, below the prescribed 6-8.');
    const top = coachLine(makeSet({ loadKg: 0, reps: 8 }), history, HOLD_AT_60, 'metric');
    expect(render(top)).toBe('Top of range at BW × 8.');
  });

  it('carries no load delta in any unit, at any rung', () => {
    const lines = [
      coachLine(makeSet({ loadKg: 0, reps: 10 }), history, HOLD_AT_60, 'metric'),
      coachLine(makeSet({ loadKg: 0, reps: 7 }), history, HOLD_AT_60, 'metric'),
      coachLine(makeSet({ loadKg: 0, reps: 4 }), history, HOLD_AT_60, 'metric'),
      coachLine(makeSet({ loadKg: 0, reps: 10 }), lbHistory, lbAdvice, 'imperial'),
      coachLine(makeSet({ loadKg: 0, reps: 7 }), lbHistory, lbAdvice, 'imperial'),
      coachLine(makeSet({ loadKg: 0, reps: 4 }), lbHistory, lbAdvice, 'imperial'),
    ];
    for (const line of lines) {
      expect(render(line)).not.toMatch(/suggested load/);
      expect(render(line)).not.toMatch(/\d\s*(kg|lb)\b/);
    }
  });

  it('still judges a genuinely light load against the suggestion', () => {
    // The skip keys on exactly 0, not on "small": 20 kg under a 60 kg suggestion is a
    // measurement the deadband must still report.
    const line = coachLine(makeSet({ loadKg: 20, reps: 7 }), history, HOLD_AT_60, 'metric');
    expect(render(line)).toBe('40 kg under the suggested load.');
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
    expect(render(line)).toBe('Load personal record. Previous best 60 kg × 8.');
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
    expect(new Set(metricLines.map(render)).size).toBe(metricLines.length);
    expect(new Set(imperialLines.map(render)).size).toBe(imperialLines.length);
  });

  it('keeps every line to twelve words or fewer', () => {
    for (const line of lines) {
      expect(render(line).trim().split(/\s+/).length).toBeLessThanOrEqual(MAX_REASON_WORDS);
    }
  });

  it('uses no dash connector, no percentage and no exclamation', () => {
    for (const line of lines) {
      expect(render(line)).not.toMatch(/[—–%!]/);
    }
  });

  it('shows no arithmetic inline', () => {
    for (const line of lines) {
      expect(render(line)).not.toMatch(/[+=]/);
    }
  });

  it('never mixes the two unit systems in one line', () => {
    for (const line of metricLines) expect(render(line)).not.toContain('lb');
    for (const line of imperialLines) expect(render(line)).not.toContain('kg');
  });

  it('issues no progression instruction, in a generated line or in the copy table', () => {
    // Code review: `coach.aboveRange` read "2 reps above range. Add load next session.".
    // Whether to add load is ProgressionAdvice's decision and is stated in its own reason;
    // a coach line reports the set that was just logged and nothing else. The copy table is
    // included because that is where the divergence lived, not in the generated strings.
    const coachCopy = Object.entries(DEFAULT_COPY)
      .filter(([key]) => key.startsWith('coach.'))
      .map(([, text]) => text);
    expect(coachCopy.length).toBeGreaterThan(0);
    for (const text of [...lines.map(render), ...coachCopy]) {
      expect(text).not.toMatch(/add load/i);
      expect(text).not.toMatch(/next session/i);
    }
  });

  it('resolves the above-range rung through its own copy key', () => {
    // Before P4 review item 2 the table held a formatted EXAMPLE and this test compared it to
    // the string the module assembled; the two could only be kept equal by hand. The table now
    // holds the TEMPLATE the module's return value is rendered through, so the equality is
    // structural: the key is `coach.aboveRange` and rendering it gives the sentence.
    const history12 = [makeSet({ loadKg: 70, reps: 12 })];
    const line = coachLine(makeSet({ loadKg: 60, reps: 10 }), history12, HOLD_AT_60, 'metric');
    expect(line.key).toBe('coach.aboveRange');
    expect(render(line)).toBe('2 reps above the prescribed range.');
  });

  it('names a key for every rung, and fills every slot in it', () => {
    // P4 review item 2: a rung whose sentence had no key was assembled in the domain and could
    // not be overridden by a skin. Twelve keys, twelve rungs, and no `{slot}` left standing.
    const amrap: ProgressionAdvice = {
      ...HOLD_AT_60,
      prescription: { kind: 'amrap', minimum: null },
      nextPrescription: { kind: 'amrap', minimum: null },
    };
    const everyRung = [
      ...lines,
      coachLine(makeSet({ loadKg: 60, reps: 12 }), history, amrap, 'metric'), // coach.setReadout
      coachLine(makeSet({ loadKg: 60, reps: 9 }), history, HOLD_AT_60, 'metric'), // singular
    ];
    const keys = new Set(everyRung.map((l) => l.key));
    const tableKeys = Object.keys(DEFAULT_COPY).filter(
      (k) => k.startsWith('coach.') && k !== 'coach.setDeleted', // setDeleted is the UI's own
    );
    expect([...keys].sort()).toEqual(tableKeys.sort());
    for (const line of everyRung) expect(render(line)).not.toMatch(/\{\w+\}/);
  });

  it('names the personal record rather than abbreviating it, in every coach key', () => {
    // P4 review item 3. Contract R11: "PR" is a colloquial stand-in. The word boundary keeps
    // the check from firing on a capital pair inside an ordinary word.
    const coachCopy = Object.entries(DEFAULT_COPY)
      .filter(([key]) => key.startsWith('coach.'))
      .map(([, text]) => text);
    for (const text of [...lines.map(render), ...coachCopy]) {
      expect(text).not.toMatch(/\bPRs?\b/);
    }
    expect(DEFAULT_COPY['coach.loadPr']).toContain('personal record');
    expect(DEFAULT_COPY['coach.repPr']).toContain('personal record');
  });

  it('assembles no English in the domain: every param is a value, never a sentence', () => {
    // The point of review item 2. A param may carry a number, a formatted load ("60 kg",
    // "135 lb", "BW") or a repetition count; it may never carry a word the skin should own.
    const words = /\b(?!BW\b)[A-Za-z]{3,}\b/;
    for (const line of lines) {
      for (const value of Object.values(line.params)) {
        expect(String(value)).not.toMatch(words);
      }
    }
  });
});
