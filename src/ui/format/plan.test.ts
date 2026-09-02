import { describe, expect, it } from 'vitest';
import {
  WEEKDAY_ABBR,
  exerciseName,
  formatDayOfMonth,
  formatPrescription,
  formatRest,
  formatSeconds,
  formatSets,
  formatWeekday,
} from './plan';

/*
 * Deviation from the P3 plan's literal (recorded here and in the task report): the plan's
 * draft mocked `EXERCISES` as a Record keyed by id. The shipped library exports `EXERCISES`
 * as a readonly ARRAY and `EXERCISE_BY_ID` as the keyed view (library.ts, master plan
 * amendment P3-10), so there is nothing to mock: the real library is asked for a real id and
 * for one it does not hold.
 */

describe('formatSeconds', () => {
  it('prints seconds below two minutes', () => {
    expect(formatSeconds(45)).toBe('45 s'); // [s]
    expect(formatSeconds(90)).toBe('90 s'); // [s]
  });

  it('prints whole minutes at or above two minutes', () => {
    expect(formatSeconds(120)).toBe('2 min'); // [s] -> [min]
    expect(formatSeconds(180)).toBe('3 min'); // [s] -> [min]
  });

  it('keeps seconds when the value is not a whole number of minutes', () => {
    // 150 s is 2.5 min. Rounding it for looks would state a duration the plan does not hold.
    expect(formatSeconds(150)).toBe('150 s');
  });
});

describe('formatPrescription', () => {
  it('prints a rep range', () => {
    expect(formatPrescription({ kind: 'reps', lo: 6, hi: 10 })).toBe('6–10 reps');
  });

  it('collapses a single rep target', () => {
    expect(formatPrescription({ kind: 'reps', lo: 5, hi: 5 })).toBe('5 reps');
  });

  it('prints AMRAP with and without a minimum', () => {
    expect(formatPrescription({ kind: 'amrap', minimum: null })).toBe('AMRAP');
    expect(formatPrescription({ kind: 'amrap', minimum: 8 })).toBe('AMRAP, min 8 reps');
  });

  it('prints a timed hold', () => {
    expect(formatPrescription({ kind: 'time', targetS: 45 })).toBe('hold 45 s'); // [s]
  });

  it('prints a continuous bout', () => {
    expect(formatPrescription({ kind: 'duration', targetS: 1800 })).toBe('30 min'); // [s]
  });

  it('prints an em dash for no prescription', () => {
    // Copy contract R5 retains a bare em dash in a VALUE slot meaning "no value".
    expect(formatPrescription({ kind: 'none' })).toBe('—');
  });
});

describe('formatSets and formatRest', () => {
  it('prints a set range and a fixed set count', () => {
    expect(formatSets(3, 4)).toBe('3–4'); // [sets]
    expect(formatSets(3, 3)).toBe('3'); // [sets]
  });

  it('prints rest', () => {
    expect(formatRest(120)).toBe('rest 2 min'); // [s]
    expect(formatRest(90)).toBe('rest 90 s'); // [s]
  });
});

describe('weekday formatting', () => {
  it('maps ISO weekdays Monday-first', () => {
    expect(WEEKDAY_ABBR[1]).toBe('Mon');
    expect(WEEKDAY_ABBR[7]).toBe('Sun');
  });

  it("formats a LocalDate's weekday and day of month", () => {
    expect(formatWeekday('2026-09-07')).toBe('Mon');
    expect(formatWeekday('2026-09-13')).toBe('Sun');
    expect(formatDayOfMonth('2026-09-07')).toBe('07');
  });
});

describe('exerciseName', () => {
  it('resolves a known id', () => {
    expect(exerciseName('barbell-bench-press')).toBe('Barbell bench press');
  });

  it('falls back to the id rather than throwing', () => {
    // A plan generated against an older library must still render its rows.
    expect(exerciseName('ex-unknown')).toBe('ex-unknown');
  });
});
