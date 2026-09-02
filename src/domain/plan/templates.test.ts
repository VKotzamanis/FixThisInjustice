import { describe, expect, it } from 'vitest';
import { EXERCISES, EXERCISE_BY_ID, INDIRECT_SET_FRACTION, MUSCLE_GROUPS } from './library';
import {
  prescriptionFor,
  resolveSlot,
  restSFor,
  SPLIT_TEMPLATES,
  WEEKLY_SET_BAND,
  type SessionsPerWeek,
} from './templates';
import type { Equipment, Experience } from '../types';

const DAY_COUNTS: SessionsPerWeek[] = [2, 3, 4, 5, 6];
const EXPERIENCES: Experience[] = ['novice', 'intermediate', 'advanced'];
const EQUIPMENT: Equipment[] = ['full-gym', 'dumbbells-only', 'bodyweight'];

describe('template integrity', () => {
  it('defines one template per supported day count, with that many sessions', () => {
    for (const d of DAY_COUNTS) {
      const t = SPLIT_TEMPLATES[d];
      expect(t.sessionsPerWeek).toBe(d);
      expect(t.sessions.length).toBe(d);
    }
  });

  it('gives every session a unique label', () => {
    for (const d of DAY_COUNTS) {
      const labels = SPLIT_TEMPLATES[d].sessions.map((s) => s.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('names only exercises that exist in the library', () => {
    for (const d of DAY_COUNTS) {
      for (const session of SPLIT_TEMPLATES[d].sessions) {
        for (const slot of session.slots) {
          expect(slot.candidates.length).toBeGreaterThan(0);
          for (const id of slot.candidates) expect(EXERCISE_BY_ID[id]).toBeDefined();
        }
      }
    }
  });

  it('orders compound slots before isolation slots in every session', () => {
    for (const d of DAY_COUNTS) {
      for (const session of SPLIT_TEMPLATES[d].sessions) {
        const firstIsolation = session.slots.findIndex((s) => s.slotClass === 'isolation');
        if (firstIsolation === -1) continue;
        const after = session.slots.slice(firstIsolation);
        expect(after.every((s) => s.slotClass === 'isolation')).toBe(true);
      }
    }
  });

  it('marks exactly one heavy slot per session, and it is the first', () => {
    for (const d of DAY_COUNTS) {
      for (const session of SPLIT_TEMPLATES[d].sessions) {
        const heavy = session.slots.filter((s) => s.intensity === 'heavy');
        expect(heavy.length).toBe(1);
        expect(session.slots[0]?.intensity).toBe('heavy');
      }
    }
  });

  it('keeps set counts monotone non-decreasing with experience', () => {
    for (const d of DAY_COUNTS) {
      const s = SPLIT_TEMPLATES[d].sets;
      for (const cls of ['compound', 'isolation'] as const) {
        const mid = (e: Experience) => (s[e][cls].lo + s[e][cls].hi) / 2;
        expect(mid('intermediate')).toBeGreaterThanOrEqual(mid('novice'));
        expect(mid('advanced')).toBeGreaterThanOrEqual(mid('intermediate'));
        for (const e of EXPERIENCES) expect(s[e][cls].hi).toBeGreaterThanOrEqual(s[e][cls].lo);
      }
    }
  });

  it('declares band muscles from the library vocabulary, sorted and without repeats', () => {
    for (const d of DAY_COUNTS) {
      const declared = SPLIT_TEMPLATES[d].bandMuscles;
      expect(declared.length).toBeGreaterThanOrEqual(4);
      expect(new Set(declared).size).toBe(declared.length);
      expect([...declared]).toEqual([...declared].sort());
      for (const m of declared) expect(MUSCLE_GROUPS as readonly string[]).toContain(m);
    }
  });

  it("carries the content review's bands verbatim", () => {
    expect(WEEKLY_SET_BAND[2]).toEqual([6, 10]);
    expect(WEEKLY_SET_BAND[3]).toEqual([9, 15]);
    expect(WEEKLY_SET_BAND[4]).toEqual([12, 16]);
    expect(WEEKLY_SET_BAND[5]).toEqual([14, 18]);
    expect(WEEKLY_SET_BAND[6]).toEqual([16, 20]);
  });

  it('uses full body at three days, not push/pull/legs', () => {
    const labels = SPLIT_TEMPLATES[3].sessions.map((s) => s.label);
    expect(labels.every((l) => l.startsWith('Full body'))).toBe(true);
    expect(SPLIT_TEMPLATES[4].sessions.map((s) => s.label)).toEqual([
      'Upper A',
      'Lower A',
      'Upper B',
      'Lower B',
    ]);
    expect(SPLIT_TEMPLATES[6].sessions.map((s) => s.label)).toEqual([
      'Push A',
      'Pull A',
      'Legs A',
      'Push B',
      'Pull B',
      'Legs B',
    ]);
  });
});

/**
 * Weekly fractional set volume.
 *
 * Counting rule, content review D2 section 6 (Pelland 2025, DOI 10.1007/s40279-025-02344-w):
 * a direct set counts 1.0, an indirect set INDIRECT_SET_FRACTION = 0.5. Sets are dimensionless
 * counts, so every figure below is in sets/muscle/week.
 *
 * STATISTIC. Each slot prescribes a RANGE of sets (setsLo to setsHi) because the progression is
 * double progression: the range is the device the user climbs, not two separate prescriptions.
 * The weekly figure compared against the review's band is therefore the MIDPOINT of that range,
 * which is the volume a user in steady state actually performs. This is stated rather than
 * assumed: the range endpoints are reported alongside, and the separate assertion below shows
 * that even the TOP of the range never exceeds the band's upper bound for any muscle.
 */
function weeklyFractionalSets(
  d: SessionsPerWeek,
  experience: Experience,
  equipment: Equipment,
): Map<string, { lo: number; mid: number; hi: number }> {
  const template = SPLIT_TEMPLATES[d];
  const out = new Map<string, { lo: number; mid: number; hi: number }>();
  for (const m of MUSCLE_GROUPS) out.set(m, { lo: 0, mid: 0, hi: 0 });
  const credit = (muscle: string, lo: number, hi: number) => {
    const acc = out.get(muscle);
    if (!acc) throw new Error(`muscle outside the library vocabulary: ${muscle}`);
    acc.lo += lo;
    acc.hi += hi;
    acc.mid += (lo + hi) / 2;
  };
  for (const session of template.sessions) {
    const used = new Set<string>();
    for (const slot of session.slots) {
      const ex = resolveSlot(slot, equipment, used);
      if (!ex) continue;
      used.add(ex.id);
      const sets = template.sets[experience][slot.slotClass];
      for (const m of ex.muscleGroups) credit(m, sets.lo, sets.hi);
      for (const m of ex.secondaryMuscles) {
        credit(m, sets.lo * INDIRECT_SET_FRACTION, sets.hi * INDIRECT_SET_FRACTION);
      }
    }
  }
  return out;
}

function volumeOf(
  v: Map<string, { lo: number; mid: number; hi: number }>,
  muscle: string,
): { lo: number; mid: number; hi: number } {
  return v.get(muscle) ?? { lo: 0, mid: 0, hi: 0 };
}

describe("weekly fractional set volume reproduces the content review's bands", () => {
  it('places exactly the declared band muscles inside the band, at every experience level', () => {
    for (const d of DAY_COUNTS) {
      const [bandLo, bandHi] = WEEKLY_SET_BAND[d];
      const inBandEverywhere = MUSCLE_GROUPS.filter((m) =>
        EXPERIENCES.every((e) => {
          const { mid } = volumeOf(weeklyFractionalSets(d, e, 'full-gym'), m);
          return mid >= bandLo && mid <= bandHi;
        }),
      );
      // bandMuscles is not a wish list: it is exactly the set the slot table verifiably places
      // in band. Anything else is reported to the user as maintenance-only.
      expect([...SPLIT_TEMPLATES[d].bandMuscles]).toEqual([...inBandEverywhere].sort());
    }
  });

  it('keeps every declared band muscle inside the band for every experience level', () => {
    for (const d of DAY_COUNTS) {
      const [bandLo, bandHi] = WEEKLY_SET_BAND[d];
      for (const e of EXPERIENCES) {
        const volume = weeklyFractionalSets(d, e, 'full-gym');
        for (const m of SPLIT_TEMPLATES[d].bandMuscles) {
          const { mid } = volumeOf(volume, m);
          expect(mid, `${d} days, ${e}, ${m}`).toBeGreaterThanOrEqual(bandLo);
          expect(mid, `${d} days, ${e}, ${m}`).toBeLessThanOrEqual(bandHi);
        }
      }
    }
  });

  it('never pushes any muscle above the band, and never past the evidence ceiling', () => {
    // Two different bounds, because they answer two different questions.
    //   (a) The PRESCRIBED weekly volume, the midpoint, never exceeds the day count's band top.
    //   (b) The TOP of the prescribed set range can exceed that band top: at five days an
    //       advanced user taking every exercise to its top set reaches 20 sets/muscle/week, which
    //       is the six-day band top. That is not a programming error and it is not hidden. The
    //       review's D2 section 6 states the dose-response curve is "monotonic increasing and
    //       decelerating -- not a threshold, not an inverted U within the studied range", with
    //       marginal return approaching zero near 18-20 sets/muscle/week (Currier BS et al. 2026,
    //       DOI 10.1249/mss.0000000000003897). So the citable ceiling is 20, and no template
    //       crosses it at any experience level. Exceeding a band top costs yield, not safety;
    //       the review names no volume at which hypertrophy declines.
    const EVIDENCE_CEILING = 20; // sets/muscle/week, top of the ACSM 2026 deceleration range
    for (const d of DAY_COUNTS) {
      const bandHi = WEEKLY_SET_BAND[d][1];
      for (const e of EXPERIENCES) {
        const volume = weeklyFractionalSets(d, e, 'full-gym');
        for (const m of MUSCLE_GROUPS) {
          const { mid, hi } = volumeOf(volume, m);
          expect(mid, `${d} days, ${e}, ${m} midpoint`).toBeLessThanOrEqual(bandHi);
          expect(hi, `${d} days, ${e}, ${m} range top`).toBeLessThanOrEqual(EVIDENCE_CEILING);
        }
      }
    }
  });

  it('leaves every muscle outside the declared set genuinely under-dosed, not over-dosed', () => {
    // "Maintenance-only" must mean BELOW the band. A muscle excluded from bandMuscles because it
    // overshot would be a programming error wearing an honest label.
    for (const d of DAY_COUNTS) {
      const bandLo = WEEKLY_SET_BAND[d][0];
      const declared = new Set(SPLIT_TEMPLATES[d].bandMuscles);
      for (const m of MUSCLE_GROUPS) {
        if (declared.has(m)) continue;
        const belowSomewhere = EXPERIENCES.some(
          (e) => volumeOf(weeklyFractionalSets(d, e, 'full-gym'), m).mid < bandLo,
        );
        expect(belowSomewhere, `${d} days, ${m}`).toBe(true);
      }
    }
  });

  it('sits novice in the lower half of the band and advanced strictly above novice', () => {
    // HEURISTIC, labelled as such: the report gives no experience-stratified volume coefficient,
    // so this is a within-band placement, not a published stratification. What is asserted is
    // only the placement's direction and that all three levels stay inside the band.
    for (const d of DAY_COUNTS) {
      const [bandLo, bandHi] = WEEKLY_SET_BAND[d];
      const bandMid = (bandLo + bandHi) / 2;
      const byExperience = EXPERIENCES.map((e) => weeklyFractionalSets(d, e, 'full-gym'));
      for (const m of SPLIT_TEMPLATES[d].bandMuscles) {
        const [novice, intermediate, advanced] = byExperience.map((v) => volumeOf(v, m).mid);
        expect(novice, `${d} days, ${m}`).toBeDefined();
        if (novice === undefined || intermediate === undefined || advanced === undefined) continue;
        expect(novice, `${d} days, ${m}`).toBeLessThanOrEqual(bandMid);
        expect(intermediate, `${d} days, ${m}`).toBeGreaterThanOrEqual(novice);
        expect(advanced, `${d} days, ${m}`).toBeGreaterThanOrEqual(intermediate);
        expect(advanced, `${d} days, ${m}`).toBeGreaterThan(novice);
      }
    }
  });

  it('reproduces the four-day intermediate case, the engine default, set for set', () => {
    // Sets/muscle/week, fractional counting, full-gym resolution. Band 12-16 (review D2 section 7).
    // RE-BASELINED against the corrected library: these are what the fixed muscle tags yield, not
    // what the first draft of this file predicted. Two figures moved and both moved because a
    // library tag moved, never because a slot did:
    //   glutes 12.25 -> 14   the Romanian deadlift makes glutes a DIRECT mover (1.0, not 0.5), per
    //                        the master plan section 5 hip-dominant family rule.
    //   rear delt 4.75 -> 6.5 the single-arm dumbbell row carries rear-delt as a secondary mover,
    //                        matching the two barbell rows it substitutes for.
    // Every other figure is unchanged, which is the check that no slot edit leaked into the
    // full-gym prescription while the dumbbell and bodyweight substitutions were extended.
    const volume = weeklyFractionalSets(4, 'intermediate', 'full-gym');
    const mid = (m: string) => volumeOf(volume, m).mid;
    // In band at all three experience levels, so declared in bandMuscles:
    expect(mid('chest')).toBe(14);
    expect(mid('lats')).toBe(14);
    expect(mid('quads')).toBe(14);
    expect(mid('glutes')).toBe(14);
    expect(mid('hamstrings')).toBe(13.5);
    expect(mid('biceps')).toBe(13);
    // Reported as maintenance-only at four days: each sits below the 12-set floor for at least one
    // experience level. Mid-back reaches the floor exactly HERE, at intermediate, but a novice gets
    // 10.5, so it is not in band everywhere and is not declared.
    expect(mid('mid-back')).toBe(12);
    expect(mid('front-delt')).toBe(10.5);
    expect(mid('triceps')).toBe(10.5);
    expect(mid('side-delt')).toBe(7.75);
    expect(mid('rear-delt')).toBe(6.5);
    expect(mid('calves')).toBe(6);
    expect(mid('abs')).toBe(6);
  });
});

describe('prescriptions', () => {
  it('prescribes 4-6 reps on a heavy compound and 6-8 on a moderate one', () => {
    const squat = EXERCISE_BY_ID['barbell-back-squat'];
    expect(squat).toBeDefined();
    if (!squat) return;
    expect(prescriptionFor(squat, 'heavy')).toEqual({ kind: 'reps', lo: 4, hi: 6 });
    expect(prescriptionFor(squat, 'moderate')).toEqual({ kind: 'reps', lo: 6, hi: 8 });
  });

  it('prescribes 8-12 reps on isolation work', () => {
    const curl = EXERCISE_BY_ID['barbell-curl'];
    expect(curl).toBeDefined();
    if (!curl) return;
    expect(prescriptionFor(curl, 'light')).toEqual({ kind: 'reps', lo: 8, hi: 12 });
  });

  it('overrides with the legacy prescription where the exercise has no external load', () => {
    const pushUp = EXERCISE_BY_ID['push-up'];
    const plank = EXERCISE_BY_ID['plank'];
    const rower = EXERCISE_BY_ID['rower-intervals'];
    expect(pushUp && prescriptionFor(pushUp, 'moderate')).toEqual({ kind: 'amrap', minimum: null });
    expect(plank && prescriptionFor(plank, 'light')).toEqual({ kind: 'time', targetS: 60 }); // [s]
    expect(rower && prescriptionFor(rower, 'light')).toEqual({ kind: 'duration', targetS: 1200 }); // [s]
  });
});

describe('rest intervals follow the content review section 9 load classes', () => {
  it('gives a heavy compound 180 s, a moderate compound 120 s and isolation 90 s', () => {
    const squat = EXERCISE_BY_ID['barbell-back-squat'];
    const curl = EXERCISE_BY_ID['barbell-curl'];
    expect(squat).toBeDefined();
    expect(curl).toBeDefined();
    if (!squat || !curl) return;
    expect(restSFor(squat, prescriptionFor(squat, 'heavy'))).toBe(180); // [s]
    expect(restSFor(squat, prescriptionFor(squat, 'moderate'))).toBe(120); // [s]
    expect(restSFor(curl, prescriptionFor(curl, 'light'))).toBe(90); // [s]
  });

  it('never returns the rejected 30-60 s hypertrophy default', () => {
    for (const ex of Object.values(EXERCISE_BY_ID)) {
      for (const intensity of ['heavy', 'moderate', 'light'] as const) {
        expect(restSFor(ex, prescriptionFor(ex, intensity))).toBeGreaterThanOrEqual(90); // [s]
      }
    }
  });
});

/**
 * Muscles with no DIRECT exercise after substitution, by equipment tier, for every day count.
 *
 * Both entries are LIBRARY limits rather than slot-table choices, and library.test.ts asserts the
 * same two ids as its own bodyweight exception set (master plan section 5): no unloaded exercise
 * abducts the humerus against gravity through a working range (side delt), and a direct rear-delt
 * exercise needs a dumbbell or a cable. Both keep assisting work in the bodyweight tier -- pike
 * push-up for the side delt, inverted-row and chin-up for the rear delt -- so the generator
 * reports them as maintenance-only rather than as absent.
 */
const NO_DIRECT_SLOT: Record<Equipment, string[]> = {
  'full-gym': [],
  'dumbbells-only': [],
  bodyweight: ['rear-delt', 'side-delt'],
};

/**
 * Day-count exceptions, applying to EVERY tier: the two- and three-day templates carry no
 * elbow-extension slot at all, so the triceps gets assisting work only there. That is a slot-table
 * limit, not a library one -- close-grip bench press, overhead extension and bench dip all exist.
 * It is left as it is because a short week spends its slots on the compounds; adding an isolation
 * slot would move the volume of every muscle those templates already place in band.
 */
const SHORT_WEEK_NO_DIRECT: Partial<Record<SessionsPerWeek, string[]>> = {
  2: ['triceps'],
  3: ['triceps'],
};

describe('equipment resolution', () => {
  const slot = SPLIT_TEMPLATES[4].sessions[0]?.slots[0];

  it('picks the first candidate the equipment supports', () => {
    expect(slot).toBeDefined();
    if (!slot) return;
    expect(resolveSlot(slot, 'full-gym', new Set())?.id).toBe('barbell-bench-press');
    expect(resolveSlot(slot, 'dumbbells-only', new Set())?.id).toBe('incline-db-press');
    expect(resolveSlot(slot, 'bodyweight', new Set())?.id).toBe('push-up');
  });

  it('skips a candidate already used in the same session', () => {
    expect(slot).toBeDefined();
    if (!slot) return;
    expect(resolveSlot(slot, 'bodyweight', new Set(['push-up']))).toBeNull();
    expect(resolveSlot(slot, 'full-gym', new Set(['barbell-bench-press']))?.id).toBe(
      'incline-db-press',
    );
  });

  it('returns null when no candidate fits the equipment', () => {
    const machineSlot = {
      role: 'test',
      slotClass: 'isolation' as const,
      intensity: 'light' as const,
      candidates: ['leg-curl-machine'],
    };
    expect(resolveSlot(machineSlot, 'bodyweight', new Set())).toBeNull();
  });

  it('leaves at least one usable slot per session for every equipment setting', () => {
    for (const d of DAY_COUNTS) {
      for (const session of SPLIT_TEMPLATES[d].sessions) {
        for (const equipment of EQUIPMENT) {
          const used = new Set<string>();
          let filled = 0;
          for (const s of session.slots) {
            const ex = resolveSlot(s, equipment, used);
            if (ex) {
              used.add(ex.id);
              filled += 1;
            }
          }
          expect(filled, `${d} days, ${session.label}, ${equipment}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('trains every muscle the tier can train DIRECTLY, bar the documented exceptions', () => {
    // The strong form of the substitution claim, and the one the generator's maintenance-only
    // report depends on: after substitution, each equipment setting still gets DIRECT work (1.0
    // set) for every muscle, and the muscles it does not are exactly the documented list. Asserted
    // as an equality on the uncovered set, so closing a gap means deleting an exception rather
    // than editing an assertion.
    for (const equipment of EQUIPMENT) {
      for (const d of DAY_COUNTS) {
        const direct = new Set<string>();
        for (const session of SPLIT_TEMPLATES[d].sessions) {
          const used = new Set<string>();
          for (const slot of session.slots) {
            const ex = resolveSlot(slot, equipment, used);
            if (!ex) continue;
            used.add(ex.id);
            for (const m of ex.muscleGroups) direct.add(m);
          }
        }
        const uncovered = MUSCLE_GROUPS.filter((m) => !direct.has(m)).sort();
        const expected = [
          ...new Set([...NO_DIRECT_SLOT[equipment], ...(SHORT_WEEK_NO_DIRECT[d] ?? [])]),
        ].sort();
        expect({ d, equipment, uncovered }).toEqual({ d, equipment, uncovered: expected });
      }
    }
  });

  it('leaves nothing uncovered that the library could have covered in that tier', () => {
    // Ties the exception list above back to the library: for the two loaded tiers every exception
    // is a slot-table fact (the short week has no elbow-extension slot), and for the bodyweight
    // tier every exception is a LIBRARY fact -- no unloaded exercise trains that muscle directly.
    // Without this, an exception could quietly hide a substitution the library already supports.
    for (const equipment of EQUIPMENT) {
      const reachableDirect = new Set<string>();
      for (const ex of EXERCISES) {
        if (!ex.equipment.includes(equipment)) continue;
        for (const m of ex.muscleGroups) reachableDirect.add(m);
      }
      const unreachable = MUSCLE_GROUPS.filter((m) => !reachableDirect.has(m)).sort();
      expect({ equipment, unreachable }).toEqual({
        equipment,
        unreachable: NO_DIRECT_SLOT[equipment],
      });
    }
  });

  it('substitutes without losing any muscle the equipment can still reach', () => {
    // The weaker companion to the test above: no muscle loses stimulus of ANY kind, direct or
    // assisting. It now holds for every tier including the bodyweight one, where the rear and side
    // delts survive as assisting movers only (inverted-row and chin-up; pike push-up).
    for (const equipment of EQUIPMENT) {
      const reachable = new Set<string>();
      for (const ex of EXERCISES) {
        if (!ex.equipment.includes(equipment)) continue;
        for (const m of ex.muscleGroups) reachable.add(m);
        for (const m of ex.secondaryMuscles) reachable.add(m);
      }
      for (const d of DAY_COUNTS) {
        const covered = new Set<string>();
        for (const session of SPLIT_TEMPLATES[d].sessions) {
          const used = new Set<string>();
          for (const slot of session.slots) {
            const ex = resolveSlot(slot, equipment, used);
            if (!ex) continue;
            used.add(ex.id);
            for (const m of ex.muscleGroups) covered.add(m);
            for (const m of ex.secondaryMuscles) covered.add(m);
          }
        }
        for (const m of reachable) {
          expect(covered.has(m), `${d} days, ${equipment}, ${m}`).toBe(true);
        }
      }
    }
  });

  it('trains chest, back, quads and hamstrings under every equipment setting', () => {
    // The four movement families a split exists to cover. Verified after substitution, so a
    // dumbbells-only or bodyweight user still gets a push, a pull, a squat and a hinge.
    for (const equipment of EQUIPMENT) {
      for (const d of DAY_COUNTS) {
        const volume = weeklyFractionalSets(d, 'intermediate', equipment);
        for (const m of ['chest', 'lats', 'quads', 'hamstrings']) {
          expect(volumeOf(volume, m).mid, `${d} days, ${equipment}, ${m}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
