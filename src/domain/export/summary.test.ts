import { describe, expect, it } from 'vitest';
import { makeExercise } from '../../test/fixtures';
import { makeBlankState, makeProfile } from '../../test/migrationFactories';
import type { AppState, BodyMassEntry, LoggedSet, WeeklyReview } from '../types';
import { buildSummary } from './summary';

const NOW = Date.UTC(2026, 8, 1, 12, 0, 0); // [ms] 2026-09-01T12:00:00Z, 15:00 in Athens

function withMass(state: AppState): AppState {
  const entry = (id: string, date: string, massKg: number): BodyMassEntry => ({
    id,
    profileId: 'p1',
    date,
    massKg, // [kg]
    enteredUnit: 'metric',
    bodyFatPct: null,
    loggedAt: NOW,
  });
  return {
    ...state,
    bodyMass: { p1: [entry('m1', '2026-01-05', 95), entry('m2', '2026-02-02', 93.4)] },
  };
}

function withReview(state: AppState, patch: Partial<WeeklyReview> = {}): AppState {
  const review: WeeklyReview = {
    profileId: 'p1',
    weekStart: '2026-01-05',
    weekEnd: '2026-01-11',
    target: 4, // [sessions/week]
    completed: 3, // [sessions]
    skipped: 1, // [sessions]
    paused: false,
    delta: -1, // [sessions] completed - target
    evaluatedAt: NOW,
    missHandled: false,
    ...patch,
  };
  return { ...state, weeklyReviews: { p1: [review] } };
}

function withSets(state: AppState): AppState {
  const set = (id: string, loadKg: number, reps: number, date: string): LoggedSet => ({
    id,
    profileId: 'p1',
    assignmentDate: date,
    sessionId: 's-push',
    exerciseId: 'barbell-bench-press',
    setNumber: 1, // [sets]
    isBonus: false,
    loadKg, // [kg]
    enteredUnit: 'metric',
    reps, // [repetitions]
    durationS: null,
    rpe: null,
    loggedAt: NOW,
  });
  return {
    ...state,
    sets: { a: set('a', 60, 8, '2026-01-05'), b: set('b', 90, 3, '2026-01-19') },
  };
}

describe('buildSummary', () => {
  it('states the unit system explicitly in the header and again at the foot', () => {
    const out = buildSummary(makeBlankState(), 'p1', NOW);
    expect(out).toMatch(/Units:\s+metric \(kg, mL\)/);
    expect(out).toMatch(/All loads and masses in this document are in kg\./);
  });

  it('states the imperial unit system for an imperial profile', () => {
    const out = buildSummary(makeBlankState(makeProfile({ units: 'imperial' })), 'p1', NOW);
    expect(out).toMatch(/Units:\s+imperial \(lb, fl oz\)/);
    expect(out).toMatch(/All loads and masses in this document are in lb\./);
    expect(out).not.toMatch(/\d kg\b/);
  });

  it('reports the profile own goal and baseline, never a hard-coded subject', () => {
    const out = buildSummary(makeBlankState(), 'p1', NOW);
    expect(out).toContain('Test subject');
    expect(out).toMatch(/Goal:\s+muscle-gain/);
    expect(out).toMatch(/Baseline:\s+95\.0 kg on 2026-01-01/);
  });

  it('dates the document in the profile zone, not the process zone', () => {
    const out = buildSummary(makeBlankState(), 'p1', NOW);
    expect(out).toMatch(/Generated:\s+2026-09-01/);
    expect(out).toMatch(/Time zone:\s+Europe\/Athens/);
  });

  it('lists the nutrition targets computed for this profile', () => {
    const out = buildSummary(makeBlankState(), 'p1', NOW);
    expect(out).toMatch(/Resting metabolic rate:\s+\d+ kcal/);
    expect(out).toMatch(/Protein:\s+\d+-\d+ g/);
    expect(out).toMatch(/Basis:\s+mifflin-st-jeor, activity factor \d/);
  });

  it('reports the expected change over four weeks, in the profile unit', () => {
    // A fat-loss profile: the engine states a rate only for that goal.
    const state = makeBlankState(
      makeProfile({
        goal: { kind: 'fat-loss', targetMassKg: null, targetBodyFatPct: null, targetDate: null },
      }),
    );
    // -0.7 %BW/week of 95 kg over four weeks, formatted at the 0.1 kg the units module uses.
    expect(buildSummary(state, 'p1', NOW)).toMatch(/Expected change \(4 weeks\):\s+-2\.7 kg/);
  });

  it('says the rate is not estimated where the evidence base gives none', () => {
    // makeProfile's goal is muscle-gain, for which nutrition.ts returns a null weekly rate.
    expect(buildSummary(makeBlankState(), 'p1', NOW)).toMatch(
      /Expected change \(4 weeks\):\s+not estimated/,
    );
  });

  it('says so rather than throwing when the profile is outside the equation domain', () => {
    const young = makeProfile({
      body: { ...makeProfile().body, birthYear: 2020 }, // 6 years old at NOW
    });
    const out = buildSummary(makeBlankState(young), 'p1', NOW);
    expect(out).toMatch(/not estimated for this profile/i);
    expect(out).toContain('SESSIONS PER WEEK');
  });

  it('lists sessions completed against the weekly target, with the signed delta', () => {
    const out = buildSummary(withReview(makeBlankState()), 'p1', NOW);
    expect(out).toMatch(/2026-01-05\s+3 \/ 4\s+\(-1\)/);
  });

  it('marks a paused week rather than counting it as a miss', () => {
    const out = buildSummary(withReview(makeBlankState(), { paused: true }), 'p1', NOW);
    expect(out).toMatch(/2026-01-05.*paused/);
  });

  it('says no weeks have been reviewed when none have', () => {
    expect(buildSummary(makeBlankState(), 'p1', NOW)).toContain('No weeks to show yet.');
  });

  it('lists every body-mass check-in as a LocalDate with the profile unit', () => {
    const out = buildSummary(withMass(makeBlankState()), 'p1', NOW);
    expect(out).toMatch(/2026-01-05\s+95\.0 kg/);
    expect(out).toMatch(/2026-02-02\s+93\.4 kg/);
    // Sign convention: latest - first, so a negative change is a loss.
    expect(out).toMatch(/Change since the first check-in:\s+-1\.6 kg/);
  });

  it('lists personal records by exercise name, with the estimated 1RM marked as an estimate', () => {
    const out = buildSummary(withSets(makeBlankState()), 'p1', NOW);
    expect(out).toContain('PERSONAL RECORDS');
    expect(out).toContain('Barbell bench press');
    // Heaviest set is 90 kg x 3 on 2026-01-19; Epley on it gives 90*(1 + 3/30) = 99 kg.
    expect(out).toMatch(/90 kg . 3/);
    expect(out).toMatch(/99 kg estimated 1RM/);
    expect(out).toContain('2026-01-19');
  });

  it('says no sets have been logged when none have', () => {
    expect(buildSummary(makeBlankState(), 'p1', NOW)).toContain('No sets logged yet.');
  });

  it('states records in the profile unit', () => {
    const state = withSets(makeBlankState(makeProfile({ units: 'imperial' })));
    const out = buildSummary(state, 'p1', NOW);
    expect(out).toMatch(/198\.4 lb . 3/);
    expect(out).not.toMatch(/\d kg\b/);
  });

  it('sorts personal records by code point, not by host ICU locale', () => {
    // 'Z' is U+005A (decimal 90); 'Ä' is U+00C4 (decimal 196). A code-point (ordinal)
    // comparison of the raw UTF-16 units therefore places "Zug" before "Ärme" -- the
    // OPPOSITE of ICU collation, which treats Ä as a diacritic of A and sorts it near
    // the front of the alphabet, ahead of Z. The fixed order below must not flip under
    // a host whose default locale collates differently (e.g. de-DE vs C).
    const set = (id: string, exerciseId: string): LoggedSet => ({
      id,
      profileId: 'p1',
      assignmentDate: '2026-01-05',
      sessionId: 's-push',
      exerciseId,
      setNumber: 1, // [sets]
      isBonus: false,
      loadKg: 60, // [kg]
      enteredUnit: 'metric',
      reps: 8, // [repetitions]
      durationS: null,
      rpe: null,
      loggedAt: NOW,
    });
    const state: AppState = {
      ...makeBlankState(),
      customExercises: {
        p1: [
          makeExercise({ id: 'ex-zug', name: 'Zug' }),
          makeExercise({ id: 'ex-arme', name: 'Ärme' }),
        ],
      },
      sets: { a: set('a', 'ex-zug'), b: set('b', 'ex-arme') },
    };
    const out = buildSummary(state, 'p1', NOW);
    const zugIndex = out.indexOf('Zug');
    const armeIndex = out.indexOf('Ärme');
    expect(zugIndex).toBeGreaterThan(-1);
    expect(armeIndex).toBeGreaterThan(-1);
    expect(zugIndex).toBeLessThan(armeIndex);
  });

  it('collapses a control character in an exercise name before padding it, so it cannot split the record onto extra lines', () => {
    // ExerciseSchema (schema.ts) bounds a name's length but not its character class, so a
    // custom exercise name can legally carry a raw CR, LF or TAB. Unsanitized, a '\n' would
    // insert a hard line break in the middle of the fixed-width PERSONAL RECORDS row.
    const set: LoggedSet = {
      id: 'a',
      profileId: 'p1',
      assignmentDate: '2026-01-05',
      sessionId: 's-push',
      exerciseId: 'ex-weird',
      setNumber: 1, // [sets]
      isBonus: false,
      loadKg: 60, // [kg]
      enteredUnit: 'metric',
      reps: 8, // [repetitions]
      durationS: null,
      rpe: null,
      loggedAt: NOW,
    };
    const state: AppState = {
      ...makeBlankState(),
      customExercises: { p1: [makeExercise({ id: 'ex-weird', name: 'Push\nPress' })] },
      sets: { a: set },
    };
    const out = buildSummary(state, 'p1', NOW);
    expect(out).not.toContain('Push\nPress');
    const line = out.split('\n').find((l) => l.includes('Push Press'));
    // The sanitized name, the heaviest-set field and the date land on ONE line: had the
    // raw newline survived, this line would end right after "Push" instead.
    expect(line).toMatch(/Push Press\s+60 kg . 8.*2026-01-05/);
  });

  it('counts what the document holds', () => {
    const out = buildSummary(withSets(withMass(withReview(makeBlankState()))), 'p1', NOW);
    expect(out).toMatch(/Body-mass check-ins:\s+2/);
    expect(out).toMatch(/Weeks reviewed:\s+1/);
    expect(out).toMatch(/Sets logged:\s+2/);
  });

  it('returns a stated failure rather than throwing for an unknown profile', () => {
    const out = buildSummary(makeBlankState(), 'nobody', NOW);
    expect(out).toMatch(/no profile with id "nobody"/i);
  });

  it('writes no ISO timestamp anywhere: every date is a LocalDate', () => {
    const out = buildSummary(withMass(withReview(makeBlankState())), 'p1', NOW);
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(out).not.toContain('Z\n');
  });
});
