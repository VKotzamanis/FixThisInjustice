import { describe, expect, it } from 'vitest';
import { EXERCISE_BY_ID, EXERCISES, INDIRECT_SET_FRACTION, MUSCLE_GROUPS } from './library';
import {
  bandMusclesFor,
  resolveSlot,
  restSFor,
  SPLIT_TEMPLATES,
  WEEKLY_SET_BAND,
  type SessionsPerWeek,
} from './templates';
import {
  BLOCK_WEEKS,
  DELOAD_SET_MODIFIER,
  generatePlan,
  volumeReport,
  weeklySetsByMuscle,
  type PlanInput,
} from './generator';
import { PlanTemplateSchema } from '../schema';
import type { Equipment, EquipmentAccess, Experience, GoalKind, PlanTemplate } from '../types';

const DAY_COUNTS: SessionsPerWeek[] = [2, 3, 4, 5, 6];
const EXPERIENCES: Experience[] = ['novice', 'intermediate', 'advanced'];
/** The three exercise-need tiers. `bandMusclesFor` and `Exercise.equipment` still take these;
 * `PlanInput.equipment` and `resolveSlot` take an `EquipmentAccess` instead (Brief F Part 2), so
 * every call that reaches either goes through `ACCESS_FOR_TIER`. */
const EQUIPMENT: Equipment[] = ['full-gym', 'dumbbells-only', 'bodyweight'];
/** The pure `EquipmentAccess` position that unlocks EXACTLY one exercise-need tier and no more. */
const ACCESS_FOR_TIER: Record<Equipment, EquipmentAccess> = {
  'full-gym': 'full-gym',
  'dumbbells-only': 'home',
  bodyweight: 'bodyweight',
};
/**
 * All five Equipment Access slider positions (Brief F Part 1c), for the section 7 gate below,
 * which the brief asks to extend from three members to five.
 */
const EQUIPMENT_ACCESS: EquipmentAccess[] = [
  'bodyweight',
  'home-and-bodyweight',
  'home',
  'full-and-home',
  'full-gym',
];
/**
 * `bandMusclesFor` takes the exercise-need `Equipment`, not an `EquipmentAccess`. A combination
 * level resolves every slot IDENTICALLY to its dominant pure tier (templates.test.ts, "the two
 * combination access levels resolve identically to their dominant pure tier"), so its band claim
 * is that dominant tier's, exactly -- this is the bridge from all five access levels to the three
 * band rows `bandMusclesFor` actually has.
 */
const BAND_TIER_FOR_ACCESS: Record<EquipmentAccess, Equipment> = {
  bodyweight: 'bodyweight',
  'home-and-bodyweight': 'dumbbells-only',
  home: 'dumbbells-only',
  'full-and-home': 'full-gym',
  'full-gym': 'full-gym',
};
const GOALS: GoalKind[] = ['fat-loss', 'muscle-gain', 'recomposition', 'maintenance'];
/**
 * [weeks] The three programme lengths the gate sweeps: the minimum, the wizard default, and the
 * maximum. 8 and 24 are whole multiples of BLOCK_WEEKS and 12 is the default; 10 and 11, which
 * exercise the trailing partial block, are covered by the block tests above rather than repeated
 * across all 270 gate cells.
 */
const GATE_WEEKS = [8, 12, 24];
/**
 * sets/muscle/week. Top of the ACSM 2026 deceleration range (Currier BS et al. 2026, Med Sci
 * Sports Exerc 58(4):851-872, DOI 10.1249/mss.0000000000003897) and the citable ceiling for the
 * TOP of a prescribed set interval. templates.test.ts bounds the same figure from the template
 * side; this file bounds what the generator actually emitted.
 */
const EVIDENCE_CEILING = 20;

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

  it('keeps plan.name inside the copy contract R2 limit of 8 words, at every day count and goal', () => {
    /*
     * R2 is 8 words, and the copy contract states its own counting rule at the head of the file:
     * "Word counts exclude numerals and units (`60 kg x 8` counts as one word)". `countWords`
     * below is that rule, applied literally: a whitespace token counts as a word when it carries a
     * letter and is neither a bare multiplier ("x2") nor the unit of the numeral before it
     * ("12 weeks" is one word). The punctuation glyphs the split names use as separators ("/",
     * "+") carry no letter and are not words.
     *
     * The strictest possible reading -- every whitespace-separated glyph is a word -- gives 7, 7,
     * 8, 10 and 10 at two through six days, so the five- and six-day names would exceed 8. That
     * reading is not the contract's: it counts "/" and "+" as words and splits "12 weeks" in two.
     * The figures are recorded here so a reader can see which measure this assertion uses.
     */
    const countWords = (s: string): number => {
      const tokens = s.split(/\s+/).map((t) => t.replace(/[,.]$/, ''));
      let words = 0;
      tokens.forEach((t, i) => {
        if (!/[A-Za-z]/.test(t)) return; // "/", "+", and bare numerals such as "12"
        if (/^x\d+$/.test(t)) return; // "x2": a numeral multiplier, not a word
        if (i > 0 && /^\d+$/.test(tokens[i - 1] ?? '')) return; // unit of the numeral before it
        words += 1;
      });
      return words;
    };
    // The rule reproduces the contract's own worked example.
    expect(countWords('60 kg x 8')).toBe(1);

    for (const d of DAY_COUNTS) {
      for (const goal of GOALS) {
        for (const weeks of [8, 12, 24]) {
          const plan = generatePlan(input({ sessionsPerWeek: d, goal, weeks }), EXERCISES);
          expect(countWords(plan.name), `${d} days, ${goal}, ${weeks} weeks: "${plan.name}"`)
            .toBeLessThanOrEqual(8);
          expect(plan.name).not.toMatch(/[–—]/); // R5: no dash connector
        }
      }
    }
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
          input({ sessionsPerWeek: d, equipment: ACCESS_FOR_TIER[equipment], weeks: 24, includeCardio: true }),
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
  it('gives every planned exercise, conditioning included, a rest interval from restSFor', () => {
    // Master plan section 6.3: the rest table has ONE home, library.ts, and restSFor is it. Every
    // entry the generator writes must equal what that table returns, the conditioning entry
    // included -- P4 reads `restS > 0 ? restS : defaultRestS(...)`, so an entry of 0 does not mean
    // "no rest", it means "unset". The three conditioning exercises carry loadClass "isolation",
    // so restSFor returns 90 s: the same figure P4's fallback would have produced.
    for (const d of DAY_COUNTS) {
      for (const equipment of EQUIPMENT) {
        const plan = generatePlan(
          input({ sessionsPerWeek: d, equipment: ACCESS_FOR_TIER[equipment], includeCardio: true, weeks: 8 }),
          EXERCISES,
        );
        for (const s of plan.sessions) {
          for (const pe of s.exercises) {
            const ex = EXERCISE_BY_ID[pe.exerciseId];
            expect(ex).toBeDefined();
            expect(pe.restS, `${d} days, ${equipment}, ${pe.exerciseId}`).toBe(
              restSFor(ex!, pe.prescription),
            );
            expect(pe.restS).toBeGreaterThanOrEqual(90); // [s]
            expect(pe.setsHi).toBeGreaterThanOrEqual(pe.setsLo);
            expect(pe.setsLo).toBeGreaterThan(0);
          }
        }
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

  it('prescribes the conditioning bout as one timed effort resting from the shared table', () => {
    const plan = generatePlan(input({ includeCardio: true, weeks: 8 }), EXERCISES);
    const last = plan.sessions[3]?.exercises.at(-1);
    expect(last?.exerciseId).toBe('rower-intervals');
    expect(last?.setsLo).toBe(1); // [sets]
    expect(last?.setsHi).toBe(1); // [sets]
    expect(last?.prescription).toEqual({ kind: 'duration', targetS: 1200 }); // [s] = 20 min
    // [s] The one bout has no inter-set interval to run, but the field is not a way to say so:
    // P4 reads 0 as "unset, use defaultRestS", which returns this same 90 s. Master plan section
    // 6.3 keeps one rest table, so the entry states what that table says rather than a 0 the
    // consumer reinterprets.
    expect(last?.restS).toBe(90);
    expect(last?.restS).toBe(restSFor(EXERCISE_BY_ID['rower-intervals']!, last!.prescription));
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

  /**
   * THE MASTER PLAN SECTION 7 P2 GENERATOR GATE, over the whole input space.
   *
   * 5 sessionsPerWeek x 3 Experience x 5 Equipment Access x 3 weeks x 2 cardio = 450 cells.
   * Brief F Part 2 extends this from three equipment members to five: the two combination access
   * levels (`home-and-bodyweight`, `full-and-home`) join the three pure ones. Every criterion the
   * gate names is checked in each cell, and every violation is collected rather than thrown at
   * the first one, so a failure prints the full census instead of one example.
   *
   * A combination cell is not redundant with its dominant pure-tier cell even though the two
   * resolve identically (proven in templates.test.ts): this gate additionally checks schema
   * validity, block/deload arithmetic and the evidence ceiling for the SPECIFIC plan the wizard
   * would build for that access level, so a future change that broke the identity -- say, a
   * combination that stopped resolving to its dominant part -- would fail HERE too, independent
   * of the templates-level proof. This is also Brief F Part 2's "a combination tier should never
   * produce a worse band than either of its parts": a combination cell's declared band muscles are
   * read from its dominant part via `BAND_TIER_FOR_ACCESS`, and that dominant part's band-muscle
   * COUNT is asserted, in templates.test.ts, to be >= the other part's at every day count.
   *
   * The band claim is read PER TIER, from `bandMusclesFor(days, BAND_TIER_FOR_ACCESS[equipment])`
   * (master plan section 5), NOT from the flat `bandMuscles` list. That distinction is the whole
   * point of the sweep: `bandMuscles` is the full-gym row, and asserting it against the sub-gym
   * tiers produces violations -- the dumbbells-only tier has no barbell row to put the mid-back in
   * band, the bodyweight tier has no curl for the biceps. Those are honest consequences of the
   * equipment, declared per tier by the templates and reported to the user as maintenance-only,
   * not defects to assert away.
   *
   * Two set statistics, because they answer two questions. The MIDPOINT of each prescribed set
   * interval is the prescribed weekly volume and is what the section 7 band describes. The TOP of
   * the interval is what a user who takes every exercise to its top set performs, and it is bounded
   * by the separate 20 sets/muscle/week evidence ceiling.
   */
  it('holds the section 7 gate in all 450 day x experience x equipment access x weeks x cardio cells', () => {
    const violations: string[] = [];
    let cells = 0;
    for (const d of DAY_COUNTS) {
      const [lo, hi] = WEEKLY_SET_BAND[d];
      const plannedLabels = SPLIT_TEMPLATES[d].sessions.map((s) => s.label);
      for (const experience of EXPERIENCES) {
        for (const equipment of EQUIPMENT_ACCESS) {
          for (const weeks of GATE_WEEKS) {
            for (const includeCardio of [false, true]) {
              cells += 1;
              const cell = `${d}d ${experience} ${equipment} ${weeks}w cardio=${includeCardio}`;
              const plan = generatePlan(
                input({ sessionsPerWeek: d, experience, equipment, weeks, includeCardio }),
                EXERCISES,
              );
              const fail = (msg: string): number => violations.push(`${cell}: ${msg}`);

              // Session count and 1-based contiguous ordinals.
              if (plan.sessions.length !== weeks * d) {
                fail(`${plan.sessions.length} sessions, expected ${weeks * d}`);
              }
              plan.sessions.forEach((s, i) => {
                if (s.ordinal !== i + 1) fail(`session ${i} has ordinal ${s.ordinal}`);
                if (s.exercises.length === 0) fail(`session ${i} is empty`);
              });

              // Label balance: every week-sized group carries the template's label multiset.
              for (let w = 0; w < weeks; w += 1) {
                const week = plan.sessions.slice(w * d, (w + 1) * d).map((s) => s.label);
                if (JSON.stringify(week) !== JSON.stringify(plannedLabels)) {
                  fail(`week ${w + 1} labels ${JSON.stringify(week)}`);
                }
              }

              // Deload invariants: volume cut inside Bosquet 2007's 41-60 %, load untouched, one
              // week long, and none in a trailing partial block.
              const deloads = plan.blocks.filter((b) => b.isDeload);
              if (deloads.length !== Math.floor(weeks / BLOCK_WEEKS)) {
                fail(`${deloads.length} deload blocks for ${weeks} weeks`);
              }
              for (const b of deloads) {
                if (b.setModifier !== DELOAD_SET_MODIFIER) fail(`setModifier ${b.setModifier}`);
                if (b.setModifier < 0.4 || b.setModifier > 0.6) {
                  fail(`setModifier ${b.setModifier} outside [0.4, 0.6]`);
                }
                if (b.loadModifier !== 1) fail(`loadModifier ${b.loadModifier}`);
                if (b.sessionCount !== d) fail(`deload block spans ${b.sessionCount} sessions`);
              }
              let cursor = 0; // [sessions]
              for (const b of plan.blocks) {
                if (b.firstSessionIndex !== cursor) fail(`block ${b.index} starts at ${cursor}`);
                cursor += b.sessionCount;
              }
              if (cursor !== plan.sessions.length) fail(`blocks cover ${cursor} sessions`);

              // Schema validity of the persisted shape.
              const parsed = PlanTemplateSchema.safeParse(plan);
              if (!parsed.success) fail(`schema: ${JSON.stringify(parsed.error.issues)}`);

              // Weekly fractional sets, sets/muscle/week, from the first week of the plan.
              const week = weeklySetsByMuscle(plan.sessions.slice(0, d), EXERCISES);
              for (const muscle of bandMusclesFor(d, BAND_TIER_FOR_ACCESS[equipment])) {
                const sets = week[muscle] ?? 0;
                if (sets < lo || sets > hi) {
                  fail(`declared band muscle ${muscle} at ${sets} outside [${lo}, ${hi}]`);
                }
              }
              for (const m of MUSCLE_GROUPS) {
                const sets = week[m] ?? 0;
                if (sets > hi) fail(`${m} midpoint ${sets} above the band top ${hi}`);
              }
              // Interval TOP: setsHi credited 1.0 direct, INDIRECT_SET_FRACTION indirect.
              const tops: Record<string, number> = {};
              for (const s of plan.sessions.slice(0, d)) {
                for (const pe of s.exercises) {
                  const ex = EXERCISE_BY_ID[pe.exerciseId];
                  if (!ex) continue;
                  for (const m of ex.muscleGroups) tops[m] = (tops[m] ?? 0) + pe.setsHi;
                  for (const m of ex.secondaryMuscles) {
                    tops[m] = (tops[m] ?? 0) + pe.setsHi * INDIRECT_SET_FRACTION;
                  }
                }
              }
              for (const [m, top] of Object.entries(tops)) {
                if (top > EVIDENCE_CEILING) {
                  fail(`${m} interval top ${top} above the ${EVIDENCE_CEILING}-set ceiling`);
                }
              }
            }
          }
        }
      }
    }
    expect(cells).toBe(
      DAY_COUNTS.length * EXPERIENCES.length * EQUIPMENT_ACCESS.length * GATE_WEEKS.length * 2,
    );
    expect(cells).toBe(450);
    expect(violations).toEqual([]);
  });

  it('trains every muscle group in the vocabulary at every day count, in every tier', () => {
    // Including the bodyweight tier, where the rear and side delts have no DIRECT exercise
    // (master plan section 5) and are reached as secondary movers only. "Trained" here means
    // "receives some stimulus", which is a weaker claim than "in band" and is stated as such.
    for (const d of DAY_COUNTS) {
      for (const equipment of EQUIPMENT) {
        const plan = generatePlan(
          input({ sessionsPerWeek: d, equipment: ACCESS_FOR_TIER[equipment] }),
          EXERCISES,
        );
        const week = weeklySetsByMuscle(plan.sessions.slice(0, d), EXERCISES);
        for (const m of MUSCLE_GROUPS) {
          expect(week[m] ?? 0, `${d} days, ${equipment}: ${m} is untrained`).toBeGreaterThan(0);
        }
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

  it('calls an untrained muscle maintenance-only under the open band, never in band', () => {
    // generatePlan cannot produce a day count no template covers; an IMPORTED plan can, and
    // bandFor then returns the open band [0, +Infinity] rather than fabricating a range. Its
    // bottom is 0 because no lower bound is known, not because zero sets is enough: `0 >= 0`
    // used to report every untrained muscle as in band, which is the one claim this report makes.
    const base = generatePlan(input({ sessionsPerWeek: 4 }), EXERCISES);
    const imported: PlanTemplate = {
      ...base,
      sessionsPerWeek: 7,
      sessions: base.sessions.map((s) => ({ ...s, exercises: [] })),
    };
    const report = volumeReport(imported, EXERCISES);
    expect(report.band).toEqual([0, Number.POSITIVE_INFINITY]);
    expect(report.inBand).toEqual([]);
    expect(report.over).toEqual([]);
    expect(report.maintenance).toEqual([...MUSCLE_GROUPS]);

    // A plan that trains something under the open band still reports what it trains.
    const partial: PlanTemplate = {
      ...base,
      sessionsPerWeek: 7,
      sessions: base.sessions.map((s, i) => (i === 0 ? s : { ...s, exercises: [] })),
    };
    const partialReport = volumeReport(partial, EXERCISES);
    expect(partialReport.inBand).toContain('chest');
    expect(partialReport.maintenance).toContain('calves'); // 0 sets in Upper A
    expect(partialReport.inBand).not.toContain('calves');
  });
});

describe('equipment substitution', () => {
  it('never plans an exercise the equipment cannot perform', () => {
    for (const equipment of EQUIPMENT) {
      for (const d of DAY_COUNTS) {
        const plan = generatePlan(
          input({ sessionsPerWeek: d, equipment: ACCESS_FOR_TIER[equipment], includeCardio: true }),
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

  it('emits exactly what the templates resolve, slot for slot, in every tier', () => {
    // SUBSTITUTE, NEVER DROP. The generator holds no substitution table and applies no equipment
    // filter of its own: it calls the templates' resolveSlot with the user's equipment, so the
    // sub-gym tiers get the candidate list's substitution (barbell bench press -> incline dumbbell
    // press -> push-up) rather than a shorter session. Any generator-side omission shows up here
    // as an id sequence shorter than the template's own resolution.
    for (const d of DAY_COUNTS) {
      for (const equipment of EQUIPMENT) {
        const plan = generatePlan(input({ sessionsPerWeek: d, equipment: ACCESS_FOR_TIER[equipment], weeks: 8 }), EXERCISES);
        SPLIT_TEMPLATES[d].sessions.forEach((sessionTemplate, i) => {
          const used = new Set<string>();
          const expected: string[] = [];
          for (const slot of sessionTemplate.slots) {
            const ex = resolveSlot(slot, ACCESS_FOR_TIER[equipment], used);
            if (!ex) continue;
            used.add(ex.id);
            expected.push(ex.id);
          }
          const got = plan.sessions[i]?.exercises.map((pe) => pe.exerciseId);
          expect(got, `${d} days, ${equipment}, ${sessionTemplate.label}`).toEqual(expected);
        });
      }
    }
  });

  it('keeps the exact per-tier session length the templates resolve to', () => {
    /*
     * [exercises] per session, first week, by day count and equipment tier. Asserted as a table
     * rather than a loose floor so that a candidate-list edit which thins a session shows up here
     * as a number, not as an inequality that still passes.
     *
     * WHAT THE TABLE SAYS, stated rather than smoothed over: the full-gym tier loses nothing. The
     * dumbbells-only tier loses at most one slot a session, always to a collision (the deadlift
     * slot has already taken the Bulgarian split squat when the split-squat slot asks for it; the
     * second curl slot has already taken the hammer curl). The bodyweight tier is thin, and the
     * thinnest session in the whole matrix is the 6-day Pull A at TWO exercises: three of its five
     * slots are a rear-delt isolation and two elbow-flexion isolations, and the bodyweight tier
     * has no direct rear-delt exercise and no curl at all (master plan section 5). That is a limit
     * of the equipment, declared by the templates and reported through volumeReport as
     * maintenance-only, not something the generator can substitute its way out of.
     */
    const sizes: Record<string, Record<string, number[]>> = {};
    for (const d of DAY_COUNTS) {
      for (const equipment of EQUIPMENT) {
        const plan = generatePlan(input({ sessionsPerWeek: d, equipment: ACCESS_FOR_TIER[equipment], weeks: 8 }), EXERCISES);
        sizes[String(d)] = {
          ...sizes[String(d)],
          [equipment]: plan.sessions.slice(0, d).map((s) => s.exercises.length),
        };
        // Whatever the tier, a session is never emptied, and every week repeats the first.
        for (const s of plan.sessions) expect(s.exercises.length).toBeGreaterThan(0);
      }
    }
    expect(sizes).toEqual({
      '2': { 'full-gym': [7, 7], 'dumbbells-only': [7, 7], bodyweight: [6, 5] },
      '3': { 'full-gym': [6, 7, 6], 'dumbbells-only': [6, 7, 6], bodyweight: [4, 6, 3] },
      '4': {
        'full-gym': [6, 6, 6, 6],
        'dumbbells-only': [6, 6, 6, 5],
        bodyweight: [3, 4, 4, 4],
      },
      '5': {
        'full-gym': [6, 6, 6, 5, 6],
        'dumbbells-only': [6, 6, 6, 4, 6],
        bodyweight: [3, 4, 4, 3, 4],
      },
      '6': {
        'full-gym': [5, 5, 5, 5, 5, 5],
        'dumbbells-only': [5, 4, 5, 5, 5, 4],
        bodyweight: [3, 2, 3, 4, 4, 3],
      },
    });
  });

  it('omits a slot only when the templates themselves resolve nothing for it', () => {
    // The census of omitted slots, declared here so a candidate-list edit that silently drops more
    // of the week fails this test rather than shipping. Two causes, both the templates':
    //   - no candidate available in the tier (a curl with no dumbbell, a machine leg curl);
    //   - every available candidate already used earlier in the SAME session, which is what stops
    //     an exercise being prescribed twice in one session (templates.ts resolveSlot).
    // Full-gym omits nothing, which is why it has no entry.
    const census: Record<string, Record<string, string[]>> = {};
    for (const d of DAY_COUNTS) {
      for (const equipment of EQUIPMENT) {
        const plan = generatePlan(input({ sessionsPerWeek: d, equipment: ACCESS_FOR_TIER[equipment], weeks: 8 }), EXERCISES);
        const omitted: string[] = [];
        SPLIT_TEMPLATES[d].sessions.forEach((sessionTemplate, i) => {
          const planned = plan.sessions[i]?.exercises.length ?? 0;
          const used = new Set<string>();
          for (const slot of sessionTemplate.slots) {
            const ex = resolveSlot(slot, ACCESS_FOR_TIER[equipment], used);
            if (!ex) {
              omitted.push(`${sessionTemplate.label}/${slot.role}`);
              continue;
            }
            used.add(ex.id);
          }
          // The generator dropped nothing the templates did not: slots minus omissions.
          expect(planned + omitted.length, `${d} days, ${equipment}`).toBeGreaterThanOrEqual(
            planned,
          );
        });
        if (omitted.length > 0) {
          census[String(d)] = { ...census[String(d)], [equipment]: omitted };
        }
      }
    }
    expect(census).toEqual({
      '2': {
        bodyweight: [
          'Full body A/lateral raise',
          'Full body B/rear delt',
          'Full body B/elbow flexion',
        ],
      },
      '3': {
        bodyweight: [
          'Full body A/lateral raise',
          'Full body A/elbow flexion',
          'Full body B/knee flexion',
          'Full body C/push-up',
          'Full body C/rear delt',
          'Full body C/elbow flexion',
        ],
      },
      '4': {
        'dumbbells-only': ['Lower B/split squat'],
        bodyweight: [
          'Upper A/incline press',
          'Upper A/lateral raise',
          'Upper A/elbow flexion',
          'Lower A/leg press',
          'Lower A/knee flexion',
          'Upper B/rear delt',
          'Upper B/elbow flexion',
          'Lower B/split squat',
          'Lower B/lateral raise',
        ],
      },
      '5': {
        'dumbbells-only': ['Lower B/split squat'],
        bodyweight: [
          'Upper A/incline press',
          'Upper A/lateral raise',
          'Upper A/elbow flexion',
          'Lower A/leg press',
          'Lower A/knee flexion',
          'Upper B/rear delt',
          'Upper B/elbow flexion',
          'Lower B/split squat',
          'Lower B/lateral raise',
          'Accessory/rear delt',
          'Accessory/lateral raise',
        ],
      },
      '6': {
        'dumbbells-only': ['Pull A/elbow flexion', 'Legs B/split squat'],
        bodyweight: [
          'Push A/incline press',
          'Push A/lateral raise',
          'Pull A/rear delt',
          'Pull A/elbow flexion',
          'Pull A/elbow flexion',
          'Legs A/leg press',
          'Legs A/knee flexion',
          'Push B/lateral raise',
          'Pull B/rear delt',
          'Legs B/split squat',
          'Legs B/lateral raise',
        ],
      },
    });
  });
});

describe('the library argument is the plan vocabulary', () => {
  it('names no exercise outside the library it was handed', () => {
    // The generator used to resolve slots against the module-level EXERCISE_BY_ID and so could
    // prescribe an exercise the caller had withheld. Withholding the barbell bench press must
    // move the full-gym horizontal-press slot down its candidate list, not re-import the barbell.
    const withheld = new Set(['barbell-bench-press', 'lat-pulldown', 'leg-curl-machine']);
    const reduced = EXERCISES.filter((e) => !withheld.has(e.id));
    const allowed = new Set(reduced.map((e) => e.id));
    for (const d of DAY_COUNTS) {
      for (const equipment of EQUIPMENT) {
        const plan = generatePlan(
          input({ sessionsPerWeek: d, equipment: ACCESS_FOR_TIER[equipment], includeCardio: true, weeks: 8 }),
          reduced,
        );
        for (const s of plan.sessions) {
          for (const pe of s.exercises) {
            expect(allowed.has(pe.exerciseId), `${d} days, ${equipment}: ${pe.exerciseId}`).toBe(
              true,
            );
          }
        }
      }
    }
    // And the substitution actually happened rather than the slot being dropped.
    const plan = generatePlan(input({ sessionsPerWeek: 4 }), reduced);
    expect(plan.sessions[0]?.exercises[0]?.exerciseId).toBe('incline-db-press');
  });

  it('throws a RangeError on an empty library instead of emitting exercises', () => {
    expect(() => generatePlan(input(), [])).toThrow(RangeError);
    expect(() => generatePlan(input(), [])).toThrow(/library is empty/);
  });

  it('throws a RangeError when the library fills no slot of a session', () => {
    // A non-empty library that holds only conditioning entries: every lifting slot resolves to
    // nothing, and an empty session is not a plan.
    const cardioOnly = EXERCISES.filter((e) =>
      ['rower-intervals', 'stair-climber', 'walk'].includes(e.id),
    );
    expect(cardioOnly.length).toBe(3);
    expect(() => generatePlan(input({ includeCardio: true }), cardioOnly)).toThrow(RangeError);
    expect(() => generatePlan(input({ includeCardio: true }), cardioOnly)).toThrow(/fills no slot/);
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
