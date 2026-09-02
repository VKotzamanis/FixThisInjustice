import { describe, expect, it } from 'vitest';

import { EXERCISE_BY_ID } from '../plan/library';
import type { LegacyDay, LegacyExerciseRange } from './v2plan';
import {
  LEGACY_SESSION_ID,
  LEGACY_WEEKS,
  UNMAPPED,
  V2_DAYS,
  V2_DAY_LABEL,
  V2_VOLUME,
  legacyDateOf,
  legacyExerciseIdAt,
  legacyIdForName,
  legacySlot,
  legacyTargetSets,
} from './v2plan';
/*
 * The module's own text, read through vite's ?raw loader, so the "no medication, biometric or
 * location strings in tracked source" gate (master plan section 3) is asserted here and not
 * only in CI. ?raw rather than node:fs because tsconfig.app.json pins `types` to the vite
 * client typings, under which node:fs has no declaration.
 */
import v2planSource from './v2plan.ts?raw';

describe('V2_VOLUME', () => {
  it('has one entry per legacy week', () => {
    expect(V2_VOLUME).toHaveLength(24);
    expect(V2_VOLUME).toHaveLength(LEGACY_WEEKS);
  });

  it('marks exactly the four legacy deload weeks (data.js:85,91,97,103)', () => {
    const deloadWeeks = V2_VOLUME.flatMap((v, i) => (v.deload ? [i + 1] : []));
    expect(deloadWeeks).toEqual([6, 12, 18, 24]);
  });

  it('reproduces the legacy set ramp (data.js:79-104)', () => {
    expect(V2_VOLUME.map((v) => v.sets)).toEqual([
      2, 2, 3, 3, 3, 2, 3, 4, 4, 4, 4, 2, 4, 4, 4, 4, 4, 2, 4, 4, 4, 4, 4, 2,
    ]);
  });
});

describe('V2_DAYS', () => {
  it('has the seven legacy rotation days in order', () => {
    expect(V2_DAYS.map((d) => d.name)).toEqual([
      'Push',
      'Pull',
      'Legs',
      'Rest',
      'Upper Power',
      'Cardio + Core',
      'Full Rest',
    ]);
  });

  it('numbers the days 1..7 in array order', () => {
    expect(V2_DAYS.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps the legacy exercise counts per day', () => {
    expect(V2_DAYS.map((d) => d.exercises.length)).toEqual([5, 6, 5, 2, 5, 5, 1]);
  });

  it('keeps the legacy day kinds', () => {
    expect(V2_DAYS.map((d) => d.kind)).toEqual([
      'lift',
      'lift',
      'lift',
      'rest',
      'lift',
      'cardio',
      'rest',
    ]);
  });

  it('covers weeks 1..24 with no gap and no overlap in every slot', () => {
    for (const day of V2_DAYS) {
      for (const slot of day.exercises) {
        const covered: number[] = [];
        for (const r of slot.ranges) {
          for (let w = r.fromWeek; w <= r.toWeek; w++) covered.push(w);
        }
        covered.sort((a, b) => a - b);
        expect(covered, `${day.name} / ${slot.legacyName}`).toEqual(
          Array.from({ length: 24 }, (_, i) => i + 1),
        );
      }
    }
  });

  it('references only ids that exist in the P2 exercise library', () => {
    const missing: string[] = [];
    for (const day of V2_DAYS) {
      for (const slot of day.exercises) {
        for (const r of slot.ranges) {
          if (r.exerciseId !== null && EXERCISE_BY_ID[r.exerciseId] === undefined) {
            missing.push(`${day.name} / ${slot.legacyName} -> ${r.exerciseId}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('every legacy exercise name resolves or is explicitly unmapped', () => {
  it('holds the 29 legacy slots the legacy day lists declare', () => {
    const total = V2_DAYS.reduce((n, d) => n + d.exercises.length, 0);
    expect(total).toBe(29);
  });

  it('maps 28 of them to a library id', () => {
    const mapped = V2_DAYS.flatMap((d) => d.exercises).filter((s) =>
      s.ranges.some((r) => r.exerciseId !== null),
    );
    expect(mapped).toHaveLength(28);
  });

  it('leaves no slot both unmapped and unexplained', () => {
    const unexplained: string[] = [];
    for (const day of V2_DAYS) {
      for (const slot of day.exercises) {
        const everyRangeNull = slot.ranges.every((r) => r.exerciseId === null);
        if (everyRangeNull && UNMAPPED[slot.legacyName] === undefined) {
          unexplained.push(`${day.name} / ${slot.legacyName}`);
        }
      }
    }
    expect(unexplained).toEqual([]);
  });

  it('lists exactly the legacy rows with no library equivalent', () => {
    expect(Object.keys(UNMAPPED)).toEqual(['No training']);
  });

  it('gives every unmapped name a non-empty reason', () => {
    for (const [name, reason] of Object.entries(UNMAPPED)) {
      expect({ name, hasReason: reason.trim().length > 0 }).toEqual({ name, hasReason: true });
    }
  });

  it('never lists a name that does resolve to an id', () => {
    for (const name of Object.keys(UNMAPPED)) {
      expect(legacyIdForName(name), name).toBeNull();
    }
  });

  it('maps the legacy "Light walk" row to the ported walk entry (formCues.ts:767)', () => {
    expect(legacyIdForName('Light walk')).toBe('walk');
  });
});

describe('the two slots whose exercise changes mid-programme', () => {
  it('day 3 slot 2 is leg press to week 4 and Bulgarian split squat from week 5', () => {
    expect(legacyExerciseIdAt(3, 2, 4)).toBe('leg-press');
    expect(legacyExerciseIdAt(3, 2, 5)).toBe('bulgarian-split-squat');
    expect(legacyExerciseIdAt(3, 2, 24)).toBe('bulgarian-split-squat');
  });

  it('day 5 slot 0 is trap bar deadlift to week 8 and conventional from week 9', () => {
    expect(legacyExerciseIdAt(5, 0, 8)).toBe('trap-bar-deadlift');
    expect(legacyExerciseIdAt(5, 0, 9)).toBe('conventional-deadlift');
  });

  it('leaves every other slot week-independent', () => {
    expect(legacyExerciseIdAt(1, 0, 1)).toBe('barbell-bench-press');
    expect(legacyExerciseIdAt(1, 0, 24)).toBe('barbell-bench-press');
  });

  it('returns null for a week outside 1..24', () => {
    expect(legacyExerciseIdAt(1, 0, 0)).toBeNull();
    expect(legacyExerciseIdAt(1, 0, 25)).toBeNull();
  });
});

describe('legacySlot', () => {
  it('returns null for an index past the day\'s exercise list', () => {
    expect(legacySlot(1, 9)).toBeNull();
  });

  it('returns null for a day outside 1..7', () => {
    expect(legacySlot(0, 0)).toBeNull();
    expect(legacySlot(8, 0)).toBeNull();
  });

  it('returns the slot for a valid index', () => {
    expect(legacySlot(2, 3)?.legacyName).toBe('Face pulls');
  });
});

describe('legacyTargetSets (reproduces console-store.jsx:372-383)', () => {
  it('returns 2 in a deload week regardless of the spec', () => {
    expect(legacyTargetSets('3→4', 6)).toBe(2);
    expect(legacyTargetSets('4', 12)).toBe(2);
  });

  it('clamps an arrow spec between its bounds using the week\'s volume', () => {
    expect(legacyTargetSets('2→4', 1)).toBe(2);
    expect(legacyTargetSets('2→4', 3)).toBe(3);
    expect(legacyTargetSets('2→4', 8)).toBe(4);
    expect(legacyTargetSets('2→3', 8)).toBe(3);
  });

  it('uses a fixed count verbatim', () => {
    expect(legacyTargetSets('3', 8)).toBe(3);
  });

  it('falls back to 2 for the em-dash sentinel', () => {
    expect(legacyTargetSets('—', 8)).toBe(2);
  });

  it('falls back to 2 for a week outside 1..24', () => {
    expect(legacyTargetSets('4', 99)).toBe(2);
    expect(legacyTargetSets('4', 0)).toBe(2);
  });
});

describe('legacyDateOf (console-store.jsx:68-77)', () => {
  it('puts week 1 day 1 on the start date itself', () => {
    expect(legacyDateOf('2026-01-05', 1, 1)).toBe('2026-01-05');
  });

  it('advances seven days per week and one per day', () => {
    // Hand-computed: (wk-1)*7 + (day-1) days after 2026-01-05.
    expect(legacyDateOf('2026-01-05', 1, 7)).toBe('2026-01-11'); //   6 days
    expect(legacyDateOf('2026-01-05', 2, 1)).toBe('2026-01-12'); //   7 days
    expect(legacyDateOf('2026-01-05', 24, 7)).toBe('2026-06-21'); // 167 days
  });

  it('measures 167 days from week 1 day 1 to week 24 day 7', () => {
    const first = legacyDateOf('2026-01-05', 1, 1);
    const last = legacyDateOf('2026-01-05', 24, 7);
    expect(first).toBe('2026-01-05');
    expect(last).toBe('2026-06-21');
  });

  it('crosses a leap day without drift', () => {
    // 2024-02-28 + 2 days = 2024-03-01 in a common year, 2024-02-29 + 1 in a leap year.
    expect(legacyDateOf('2024-02-26', 1, 5)).toBe('2024-03-01');
  });
});

describe('legacyIdForName', () => {
  it('maps a legacy display name to a library id', () => {
    expect(legacyIdForName('Face pulls')).toBe('face-pull');
  });

  it('maps an ambiguous slot name to the id of its first week range', () => {
    expect(legacyIdForName('Trap bar DL → conventional')).toBe('trap-bar-deadlift');
    expect(legacyIdForName('Leg press → Bulgarian split')).toBe('leg-press');
  });

  it('returns null for an unknown name', () => {
    expect(legacyIdForName('Kettlebell swing')).toBeNull();
  });

  it('returns null for a slot with no library equivalent', () => {
    expect(legacyIdForName('No training')).toBeNull();
  });
});

describe('V2_DAY_LABEL', () => {
  it('labels only the five legacy training days', () => {
    expect(V2_DAY_LABEL[1]).toBe('Push');
    expect(V2_DAY_LABEL[4]).toBeNull();
    expect(V2_DAY_LABEL[7]).toBeNull();
  });

  it('covers all seven legacy days', () => {
    expect(Object.keys(V2_DAY_LABEL).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('maps every rest day to null and every training day to a label', () => {
    for (const day of V2_DAYS) {
      const label = V2_DAY_LABEL[day.day];
      if (day.kind === 'rest') {
        expect({ day: day.day, label }).toEqual({ day: day.day, label: null });
      } else {
        expect({ day: day.day, kind: typeof label }).toEqual({ day: day.day, kind: 'string' });
      }
    }
  });
});

describe('the table is frozen', () => {
  it('freezes V2_VOLUME and every entry', () => {
    expect(Object.isFrozen(V2_VOLUME)).toBe(true);
    for (const v of V2_VOLUME) expect(Object.isFrozen(v)).toBe(true);
  });

  it('freezes V2_DAYS down to every week range', () => {
    expect(Object.isFrozen(V2_DAYS)).toBe(true);
    for (const day of V2_DAYS) {
      expect(Object.isFrozen(day)).toBe(true);
      expect(Object.isFrozen(day.exercises)).toBe(true);
      for (const slot of day.exercises) {
        expect(Object.isFrozen(slot)).toBe(true);
        expect(Object.isFrozen(slot.ranges)).toBe(true);
        for (const r of slot.ranges) expect(Object.isFrozen(r)).toBe(true);
      }
    }
  });

  it('freezes V2_DAY_LABEL and UNMAPPED', () => {
    expect(Object.isFrozen(V2_DAY_LABEL)).toBe(true);
    expect(Object.isFrozen(UNMAPPED)).toBe(true);
  });

  it('throws on an attempted mutation rather than rewriting the user\'s history', () => {
    const day = V2_DAYS[0] as LegacyDay;
    expect(() => (V2_DAYS as LegacyDay[]).push(day)).toThrow(TypeError);
    const slot = day.exercises[0];
    if (slot === undefined) throw new Error('day 1 has no slots');
    expect(() =>
      (slot.ranges as LegacyExerciseRange[]).push({ fromWeek: 1, toWeek: 1, exerciseId: null }),
    ).toThrow(TypeError);
  });
});

describe('LEGACY_SESSION_ID', () => {
  it('is a stable literal other modules can compare against', () => {
    expect(LEGACY_SESSION_ID).toBe('legacy-v2');
  });
});

describe('the personal-data gate (master plan section 3)', () => {
  /*
   * Needles assembled from halves so this file does not itself trip the CI grep it is
   * asserting. Case-insensitive, matching the gate's -i flag.
   */
  const NEEDLE_HALVES = [
    ['vyvan', 'se'],
    ['lisdexam', 'fetamine'],
    ['ym', 'ca'],
    ['amphet', 'amine'],
  ] as const;

  it('carries no medication or location string in the module source', () => {
    const haystack = v2planSource.toLowerCase();
    for (const [head, tail] of NEEDLE_HALVES) {
      const needle = head + tail;
      expect({ needle, present: haystack.includes(needle) }).toEqual({ needle, present: false });
    }
  });
});
