import { describe, expect, it } from 'vitest';
import { EXERCISE_BY_ID, EXERCISES, MUSCLE_GROUPS } from './library';
import { SPLIT_TEMPLATES, WEEKLY_SET_BAND, type SessionsPerWeek } from './templates';
import {
  BLOCK_WEEKS,
  DELOAD_SET_MODIFIER,
  generatePlan,
  volumeReport,
  weeklySetsByMuscle,
  type PlanInput,
} from './generator';
import { PlanTemplateSchema } from '../schema';
import type { Equipment, Experience, PlanTemplate } from '../types';

const DAY_COUNTS: SessionsPerWeek[] = [2, 3, 4, 5, 6];
const EXPERIENCES: Experience[] = ['novice', 'intermediate', 'advanced'];
const EQUIPMENT: Equipment[] = ['full-gym', 'dumbbells-only', 'bodyweight'];

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  sessionsPerWeek: 4, // [sessions/week]
  weeks: 12, // [weeks]
  goal: 'fat-loss',
  experience: 'intermediate',
  equipment: 'full-gym',
  includeCardio: false,
  ...over,
});

describe('plan shape', () => {
  it('emits weeks x sessionsPerWeek sessions with contiguous 1-based ordinals', () => {
    for (const d of DAY_COUNTS) {
      for (const weeks of [8, 10, 12, 24]) {
        const plan = generatePlan(input({ sessionsPerWeek: d, weeks }), EXERCISES);
        expect(plan.sessions.length).toBe(weeks * d);
        expect(plan.sessionsPerWeek).toBe(d);
        expect(plan.weeks).toBe(weeks);
        // types.ts invariant: plan.sessions[i].ordinal === i + 1.
        plan.sessions.forEach((s, i) => expect(s.ordinal).toBe(i + 1));
        expect(new Set(plan.sessions.map((s) => s.id)).size).toBe(plan.sessions.length);
      }
    }
  });

  it('repeats the template label sequence exactly once per week', () => {
    for (const d of DAY_COUNTS) {
      const plan = generatePlan(input({ sessionsPerWeek: d, weeks: 9 }), EXERCISES);
      const expected = SPLIT_TEMPLATES[d].sessions.map((s) => s.label);
      for (let w = 0; w < 9; w += 1) {
        const week = plan.sessions.slice(w * d, (w + 1) * d).map((s) => s.label);
        expect(week).toEqual(expected);
      }
    }
  });

  it('balances the label multiset inside every group of sessionsPerWeek sessions', () => {
    // The master plan section 7 gate says "each label balanced per week": every label occurs
    // its planned number of times in each week-sized group, whatever the order inside the week.
    const countLabels = (labels: string[]): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const l of labels) out[l] = (out[l] ?? 0) + 1;
      return out;
    };
    for (const d of DAY_COUNTS) {
      const weeks = 8; // [weeks]
      const plan = generatePlan(input({ sessionsPerWeek: d, weeks }), EXERCISES);
      const planned = countLabels(SPLIT_TEMPLATES[d].sessions.map((s) => s.label));
      for (let w = 0; w < weeks; w += 1) {
        const week = plan.sessions.slice(w * d, (w + 1) * d).map((s) => s.label);
        expect(countLabels(week)).toEqual(planned);
      }
    }
  });

  it('names only exercises that exist in the library', () => {
    for (const d of DAY_COUNTS) {
      const plan = generatePlan(input({ sessionsPerWeek: d }), EXERCISES);
      for (const s of plan.sessions) {
        expect(s.exercises.length).toBeGreaterThan(0);
        for (const pe of s.exercises) expect(EXERCISE_BY_ID[pe.exerciseId]).toBeDefined();
      }
    }
  });

  it('never repeats an exercise inside one session', () => {
    for (const d of DAY_COUNTS) {
      const plan = generatePlan(input({ sessionsPerWeek: d }), EXERCISES);
      for (const s of plan.sessions) {
        const ids = s.exercises.map((e) => e.exerciseId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('puts compound-primary exercises before the rest of the session', () => {
    for (const d of DAY_COUNTS) {
      const plan = generatePlan(input({ sessionsPerWeek: d }), EXERCISES);
      for (const s of plan.sessions) {
        const flags = s.exercises.map(
          (pe) => EXERCISE_BY_ID[pe.exerciseId]?.isCompoundPrimary === true,
        );
        const firstFalse = flags.indexOf(false);
        if (firstFalse === -1) continue;
        expect(flags.slice(firstFalse).every((f) => f === false)).toBe(true);
      }
    }
  });

  it('writes user-visible names with no dash connector', () => {
    // Copy contract R5: no em-dash or en-dash as a connector. The session name is also short
    // (R2, at most 8 words excluding numerals) because P3 renders it as the Today heading.
    const plan = generatePlan(input({ sessionsPerWeek: 4, weeks: 12, goal: 'fat-loss' }), EXERCISES);
    expect(plan.name).toBe('Upper / Lower x2, 12 weeks, fat loss');
    expect(plan.sessions[0]?.name).toBe('Week 1 Upper A');
    expect(plan.sessions[plan.sessions.length - 1]?.name).toBe('Week 12 Lower B');
    for (const s of plan.sessions) {
      expect(s.name).not.toMatch(/[–—]/);
      expect(s.name.split(/\s+/).length).toBeLessThanOrEqual(8); // words, numerals included
    }
    expect(plan.name).not.toMatch(/[–—]/);
  });

  it('rejects out-of-range programme lengths', () => {
    expect(() => generatePlan(input({ weeks: 7 }), EXERCISES)).toThrow(RangeError);
    expect(() => generatePlan(input({ weeks: 25 }), EXERCISES)).toThrow(RangeError);
    expect(() => generatePlan(input({ weeks: 12.5 }), EXERCISES)).toThrow(RangeError);
    expect(() => generatePlan(input({ weeks: Number.NaN }), EXERCISES)).toThrow(RangeError);
  });

  it('rejects a day count no split template covers', () => {
    const unsupported = { ...input(), sessionsPerWeek: 7 as unknown as SessionsPerWeek };
    expect(() => generatePlan(unsupported, EXERCISES)).toThrow(RangeError);
  });

  it('validates against the persisted schema', () => {
    for (const d of DAY_COUNTS) {
      for (const equipment of EQUIPMENT) {
        const plan = generatePlan(
          input({ sessionsPerWeek: d, equipment, weeks: 24, includeCardio: true }),
          EXERCISES,
        );
        const parsed = PlanTemplateSchema.safeParse(plan);
        expect(parsed.success, `${d} days, ${equipment}: ${JSON.stringify(parsed.error?.issues)}`)
          .toBe(true);
      }
    }
  });

  it('is deterministic apart from the generated ids', () => {
    const strip = (plan: PlanTemplate): PlanTemplate => ({
      ...plan,
      id: '',
      sessions: plan.sessions.map((s) => ({ ...s, id: '' })),
    });
    for (const d of DAY_COUNTS) {
      const a = generatePlan(input({ sessionsPerWeek: d, includeCardio: true }), EXERCISES);
      const b = generatePlan(input({ sessionsPerWeek: d, includeCardio: true }), EXERCISES);
      expect(a.id).not.toBe(b.id);
      expect(a.sessions[0]?.id).not.toBe(b.sessions[0]?.id);
      expect(strip(a)).toEqual(strip(b));
    }
  });
});

describe('blocks and deloads', () => {
  it('covers every session exactly once, in order', () => {
    for (const weeks of [8, 9, 10, 11, 12, 24]) {
      const plan = generatePlan(input({ weeks, sessionsPerWeek: 4 }), EXERCISES);
      let cursor = 0; // [sessions]
      plan.blocks.forEach((b, i) => {
        expect(b.index).toBe(i);
        expect(b.firstSessionIndex).toBe(cursor);
        expect(b.sessionCount).toBeGreaterThan(0);
        cursor += b.sessionCount;
      });
      expect(cursor).toBe(plan.sessions.length);
    }
  });

  it('cuts volume and holds load in every deload block', () => {
    const plan = generatePlan(input({ weeks: 24, sessionsPerWeek: 4 }), EXERCISES);
    const deloads = plan.blocks.filter((b) => b.isDeload);
    expect(deloads.length).toBe(24 / BLOCK_WEEKS);
    for (const b of deloads) {
      expect(b.setModifier).toBe(DELOAD_SET_MODIFIER);
      // Bosquet 2007: the optimal taper cuts VOLUME by 41-60 % and leaves the load alone.
      expect(b.setModifier).toBeGreaterThanOrEqual(0.4);
      expect(b.setModifier).toBeLessThanOrEqual(0.6);
      expect(b.loadModifier).toBe(1);
      expect(b.sessionCount).toBe(4); // [sessions] = one week at four sessions/week
    }
    for (const b of plan.blocks.filter((x) => !x.isDeload)) {
      expect(b.setModifier).toBe(1);
      expect(b.loadModifier).toBe(1);
    }
  });

  it('lays a 12-week plan out as three four-week blocks, the last week of each a deload', () => {
    const plan = generatePlan(input({ weeks: 12, sessionsPerWeek: 4 }), EXERCISES);
    expect(plan.blocks.map((b) => b.sessionCount)).toEqual([12, 4, 12, 4, 12, 4]); // [sessions]
    expect(plan.blocks.map((b) => b.isDeload)).toEqual([false, true, false, true, false, true]);
    // Deload weeks are 4, 8 and 12: the first session of each deload block is index 12, 28, 44.
    expect(plan.blocks.filter((b) => b.isDeload).map((b) => b.firstSessionIndex)).toEqual([
      12, 28, 44,
    ]);
  });

  it('gives a trailing partial block no deload', () => {
    // 10 weeks at 3/week: 3 training + 1 deload, 3 training + 1 deload, then 2 training weeks.
    const plan = generatePlan(input({ weeks: 10, sessionsPerWeek: 3 }), EXERCISES);
    expect(plan.blocks.map((b) => b.sessionCount)).toEqual([9, 3, 9, 3, 6]); // [sessions]
    expect(plan.blocks.map((b) => b.isDeload)).toEqual([false, true, false, true, false]);
  });
});

describe('prescriptions, rest and cardio', () => {
  it('gives every planned exercise a rest interval of at least 90 s and a set range', () => {
    const plan = generatePlan(input({ sessionsPerWeek: 5 }), EXERCISES);
    for (const s of plan.sessions) {
      for (const pe of s.exercises) {
        expect(pe.restS).toBeGreaterThanOrEqual(90); // [s]
        expect(pe.setsHi).toBeGreaterThanOrEqual(pe.setsLo);
        expect(pe.setsLo).toBeGreaterThan(0);
      }
    }
  });

  it('appends exactly one conditioning exercise per week when cardio is requested', () => {
    const off = generatePlan(input({ includeCardio: false, weeks: 8 }), EXERCISES);
    const on = generatePlan(input({ includeCardio: true, weeks: 8 }), EXERCISES);
    expect(on.sessions.length).toBe(off.sessions.length);
    const cardioCount = on.sessions.filter((s) =>
      s.exercises.some((pe) => pe.exerciseId === 'rower-intervals'),
    ).length;
    expect(cardioCount).toBe(8); // one per week
    expect(
      off.sessions.some((s) => s.exercises.some((pe) => pe.exerciseId === 'rower-intervals')),
    ).toBe(false);
  });

  it('prescribes the conditioning bout as one timed effort with no inter-set rest', () => {
    const plan = generatePlan(input({ includeCardio: true, weeks: 8 }), EXERCISES);
    const last = plan.sessions[3]?.exercises.at(-1);
    expect(last?.exerciseId).toBe('rower-intervals');
    expect(last?.setsLo).toBe(1); // [sets]
    expect(last?.setsHi).toBe(1); // [sets]
    expect(last?.prescription).toEqual({ kind: 'duration', targetS: 1200 }); // [s] = 20 min
    expect(last?.restS).toBe(0); // [s]: a single continuous bout has no inter-set rest
  });

  it('emits no session of kind cardio, because no split template declares one', () => {
    // The rule: a `kind: "cardio"` session is emitted only when the split template defines a
    // conditioning session of its own. None of the five templates does, so conditioning rides
    // the last lifting session of the week and the plan keeps weeks x sessionsPerWeek sessions.
    for (const d of DAY_COUNTS) {
      const plan = generatePlan(input({ sessionsPerWeek: d, includeCardio: true }), EXERCISES);
      expect(plan.sessions.every((s) => s.kind === 'lift')).toBe(true);
      expect(plan.sessions.length).toBe(12 * d);
    }
  });

  it('falls back to walking when the equipment has no ergometer', () => {
    const plan = generatePlan(
      input({ includeCardio: true, equipment: 'bodyweight', weeks: 8 }),
      EXERCISES,
    );
    expect(plan.sessions.filter((s) => s.exercises.some((pe) => pe.exerciseId === 'walk')).length)
      .toBe(8);
  });
});

describe('weekly set volume, the P2 generator gate', () => {
  it('reproduces the hand-computed 4-day intermediate volume exactly', () => {
    // Sets/muscle/week, dimensionless. Intermediate at four days prescribes 3-4 sets per
    // compound slot (midpoint 3.5) and 3 per isolation slot; a direct mover is credited 1.0
    // set, an assisting mover 0.5 (INDIRECT_SET_FRACTION).
    // Worked longhand for the two entries that changed when the library's direct-mover rule
    // was corrected (commit "library rulings"):
    //   glutes    = RDL 3.5 + trap-bar 3.5 + Bulgarian split squat 3.5 (direct)
    //             + back squat 1.75 + leg press 1.75 (assisting)            = 14
    //   rear-delt = face-pull 3 (direct)
    //             + Pendlay row 1.75 + DB single-arm row 1.75 (assisting)   = 6.5
    const plan = generatePlan(input({ sessionsPerWeek: 4, experience: 'intermediate' }), EXERCISES);
    const week = weeklySetsByMuscle(plan.sessions.slice(0, 4), EXERCISES);
    expect(week).toEqual({
      abs: 6,
      biceps: 13,
      calves: 6,
      chest: 14,
      'front-delt': 10.5,
      glutes: 14,
      hamstrings: 13.5,
      lats: 14,
      'mid-back': 12,
      quads: 14,
      'rear-delt': 6.5,
      'side-delt': 7.75,
      triceps: 10.5,
    });
  });

  it('places every declared band muscle inside the content review section 7 band, at every experience level', () => {
    for (const d of DAY_COUNTS) {
      const [lo, hi] = WEEKLY_SET_BAND[d];
      for (const experience of EXPERIENCES) {
        const plan = generatePlan(input({ sessionsPerWeek: d, experience }), EXERCISES);
        const week = weeklySetsByMuscle(plan.sessions.slice(0, d), EXERCISES);
        for (const muscle of SPLIT_TEMPLATES[d].bandMuscles) {
          const sets = week[muscle] ?? 0; // sets/muscle/week
          expect(
            sets >= lo && sets <= hi,
            `${d} days, ${experience}, ${muscle}: ${sets} sets outside [${lo}, ${hi}]`,
          ).toBe(true);
        }
      }
    }
  });

  it('never overshoots the band top for any muscle, at any day count or experience level', () => {
    for (const d of DAY_COUNTS) {
      const hi = WEEKLY_SET_BAND[d][1];
      for (const experience of EXPERIENCES) {
        const plan = generatePlan(input({ sessionsPerWeek: d, experience }), EXERCISES);
        const week = weeklySetsByMuscle(plan.sessions.slice(0, d), EXERCISES);
        for (const [muscle, sets] of Object.entries(week)) {
          expect(sets, `${d} days, ${experience}, ${muscle}`).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it('trains every muscle group in the vocabulary at every day count', () => {
    for (const d of DAY_COUNTS) {
      const plan = generatePlan(input({ sessionsPerWeek: d }), EXERCISES);
      const week = weeklySetsByMuscle(plan.sessions.slice(0, d), EXERCISES);
      for (const m of MUSCLE_GROUPS) {
        expect(week[m] ?? 0, `${d} days: ${m} is untrained`).toBeGreaterThan(0);
      }
    }
  });

  it('reports the maintenance-only muscles instead of hiding them', () => {
    const plan = generatePlan(input({ sessionsPerWeek: 4 }), EXERCISES);
    const report = volumeReport(plan, EXERCISES);
    expect(report.band).toEqual([12, 16]); // sets/muscle/week
    expect(report.over).toEqual([]);
    // Order follows MUSCLE_GROUPS, not the alphabet. At "intermediate" the 4-day template
    // also lifts mid-back (12.0) and glutes (14.0) into the band; the template's declared
    // bandMuscles are the stricter set that holds at ALL three experience levels.
    expect(report.inBand).toEqual([
      'chest',
      'biceps',
      'lats',
      'mid-back',
      'quads',
      'hamstrings',
      'glutes',
    ]);
    expect(report.maintenance).toEqual([
      'front-delt',
      'side-delt',
      'rear-delt',
      'triceps',
      'calves',
      'abs',
    ]);
  });
});

describe('equipment filtering', () => {
  it('never plans an exercise the equipment cannot perform', () => {
    for (const equipment of EQUIPMENT) {
      for (const d of DAY_COUNTS) {
        const plan = generatePlan(
          input({ sessionsPerWeek: d, equipment, includeCardio: true }),
          EXERCISES,
        );
        for (const s of plan.sessions) {
          for (const pe of s.exercises) {
            expect(EXERCISE_BY_ID[pe.exerciseId]?.equipment).toContain(equipment);
          }
        }
      }
    }
  });
});

describe('storage footprint', () => {
  it('keeps the largest plan well inside the localStorage budget', () => {
    const plan = generatePlan(
      input({ sessionsPerWeek: 6, weeks: 24, includeCardio: true }),
      EXERCISES,
    );
    expect(plan.sessions.length).toBe(144); // [sessions]
    expect(JSON.stringify(plan).length).toBeLessThan(400_000); // UTF-16 code units
  });
});
