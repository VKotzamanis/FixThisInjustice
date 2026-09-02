import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import raw from './fixtures/v2-sample.json';
import { KG_PER_LB } from '../types';
import type { AppState, LoggedSet, PlanTemplate } from '../types';
import { displayLoad } from '../units';
import { parseState } from '../schema';
import { EXERCISES } from '../plan/library';
import { generatePlan } from '../plan/generator';
import type { SessionsPerWeek } from '../plan/templates';
import { makeBlankState, makePlan, makeProfile } from '../../test/migrationFactories';
import { LEGACY_SESSION_ID } from './v2plan';
import type { MigrateV2Options, MigrationReport, MigrationSkip } from './v2';
import { CUP_ML, applyMigration, migrateV2 } from './v2';

const OPTS: MigrateV2Options = {
  units: 'kg',
  timezone: 'Europe/Athens',
  profile: makeProfile(),
  plan: makePlan(),
};

/** Unwraps a migration that the test expects to succeed. */
function run(overrides: Partial<MigrateV2Options> = {}): {
  state: AppState;
  report: MigrationReport;
} {
  const result = migrateV2(raw, { ...OPTS, ...overrides });
  if (!result.ok) throw new Error(`migrateV2 refused the fixture: ${result.reason}`);
  return { state: result.state, report: result.report };
}

function setsOf(state: AppState): LoggedSet[] {
  return Object.values(state.sets);
}

function skipKeys(report: { setsSkipped: MigrationSkip[] }): string[] {
  return report.setsSkipped.map((s) => s.key).sort();
}

/** A minimal legacy document holding one decodable set on the given legacy day. */
function dayDoc(day: number, exIdx: number, exName: string): unknown {
  return {
    startDate: '2026-01-05',
    sets: {
      [`1-${day}-${exIdx}-1`]: { weight: 40, reps: 8, ts: 1767610800000, exName },
    },
  };
}

/** A plan as the app actually builds one, so the label-matching rule is tested for real. */
function generatedPlan(sessionsPerWeek: SessionsPerWeek): PlanTemplate {
  return generatePlan(
    {
      sessionsPerWeek,
      weeks: 12, // [weeks]
      goal: 'muscle-gain',
      experience: 'intermediate',
      equipment: 'full-gym',
      includeCardio: true,
    },
    EXERCISES,
  );
}

describe('migrateV2 - set decoding', () => {
  it('migrates 20 decodable set keys plus 2 weekly push-up maxima', () => {
    const { report } = run();
    expect(report.setsMigrated).toBe(22);
  });

  it('gives every migrated set a fresh unique id', () => {
    const { state } = run();
    const ids = setsOf(state).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(state.sets).sort()).toEqual(ids.sort());
  });

  it('resolves (week, day) to a date with day 1 of week 1 on the start date', () => {
    const { state } = run();
    const bench = setsOf(state).filter((s) => s.exerciseId === 'barbell-bench-press');
    expect(bench.map((s) => s.assignmentDate).sort()).toEqual([
      '2026-01-05',
      '2026-01-05',
      '2026-01-12',
      '2026-01-12',
      '2026-01-12',
    ]);
  });

  it('stores kg loads unchanged', () => {
    const { state } = run({ units: 'kg' });
    const first = setsOf(state).find(
      (s) =>
        s.exerciseId === 'barbell-bench-press' &&
        s.assignmentDate === '2026-01-05' &&
        s.setNumber === 1,
    );
    expect(first?.loadKg).toBe(60); // [kg]
    expect(first?.enteredUnit).toBe('metric');
  });

  it('converts lb loads exactly, with no rounding', () => {
    const { state } = run({ units: 'lb' });
    const first = setsOf(state).find(
      (s) =>
        s.exerciseId === 'barbell-bench-press' &&
        s.assignmentDate === '2026-01-05' &&
        s.setNumber === 1,
    );
    expect(first?.loadKg).toBe(60 * KG_PER_LB); // [kg] from 60 lb
    expect(first?.enteredUnit).toBe('imperial');
  });

  it('keeps a logged 0 as a bodyweight load, never as null', () => {
    const { state } = run();
    const pullup = setsOf(state).find((s) => s.exerciseId === 'pull-up' && s.setNumber === 1);
    expect(pullup?.loadKg).toBe(0); // [kg] bodyweight
  });

  it('resolves the two slots that change exercise mid-programme by week', () => {
    const { state } = run();
    const ids = setsOf(state).map((s) => s.exerciseId);
    expect(ids).toContain('leg-press'); // week 1, day 3, slot 2
    expect(ids).not.toContain('bulgarian-split-squat');
    expect(ids).toContain('trap-bar-deadlift'); // week 2, day 5, slot 0
    expect(ids).not.toContain('conventional-deadlift');
  });

  it('marks a set beyond the week prescribed count as a bonus set', () => {
    const { state } = run();
    const third = setsOf(state).find(
      (s) =>
        s.exerciseId === 'barbell-bench-press' &&
        s.assignmentDate === '2026-01-12' &&
        s.setNumber === 3,
    );
    expect(third?.isBonus).toBe(true);
    const second = setsOf(state).find(
      (s) =>
        s.exerciseId === 'barbell-bench-press' &&
        s.assignmentDate === '2026-01-12' &&
        s.setNumber === 2,
    );
    expect(second?.isBonus).toBe(false);
  });

  it('records no duration and no RPE, because the legacy set row had neither', () => {
    const { state } = run();
    expect(setsOf(state).every((s) => s.durationS === null && s.rpe === null)).toBe(true);
  });
});

describe('migrateV2 - session matching', () => {
  it('maps a legacy day label onto the matching session of the new plan', () => {
    const { state } = run();
    const push = setsOf(state).find((s) => s.exerciseId === 'barbell-bench-press');
    expect(push?.sessionId).toBe('s-push');
    const pull = setsOf(state).find((s) => s.exerciseId === 'barbell-row-pendlay');
    expect(pull?.sessionId).toBe('s-pull');
  });

  it('falls back to the legacy session id when no label matches', () => {
    const { state } = run();
    // legacy day 5 "Upper Power" has no equally named session in the test plan
    const dl = setsOf(state).find((s) => s.exerciseId === 'trap-bar-deadlift');
    expect(dl?.sessionId).toBe(LEGACY_SESSION_ID);
    // legacy day 4 is a rest day and claims no label
    const pushup = setsOf(state).find((s) => s.exerciseId === 'push-up');
    expect(pushup?.sessionId).toBe(LEGACY_SESSION_ID);
  });

  it('does not relabel a Push set as Upper for an upper/lower plan', () => {
    const plan = makePlan({
      sessions: makePlan().sessions.map((s) =>
        s.id === 's-push' ? { ...s, label: 'Upper', name: 'Upper' } : s,
      ),
    });
    const { state } = run({ plan });
    const push = setsOf(state).find((s) => s.exerciseId === 'barbell-bench-press');
    expect(push?.sessionId).toBe(LEGACY_SESSION_ID);
  });

  it('matches legacy day 6 on SessionKind, never on the label text', () => {
    const result = migrateV2(dayDoc(6, 2, 'Plank'), OPTS);
    if (!result.ok) throw new Error(result.reason);
    const plank = setsOf(result.state).find((s) => s.exerciseId === 'plank');
    // the fixture plan's cardio session is labelled "Conditioning", not "Cardio"
    expect(OPTS.plan.sessions.map((s) => s.label)).not.toContain('Cardio');
    expect(plank?.sessionId).toBe('s-cardio');
  });

  it('reports the fallback when the generated plan has no conditioning session', () => {
    const result = migrateV2(dayDoc(6, 2, 'Plank'), { ...OPTS, plan: generatedPlan(6) });
    if (!result.ok) throw new Error(result.reason);
    const plank = setsOf(result.state).find((s) => s.exerciseId === 'plank');
    expect(plank?.sessionId).toBe(LEGACY_SESSION_ID);
    expect(result.report.sessionFallbacks).toContainEqual({
      key: 'day.6',
      reason: 'no conditioning session in the generated plan',
    });
  });

  it('matches each legacy training day onto a generated plan by label prefix', () => {
    // Push / Pull / Legs x2 labels its sessions "Push A", "Pull A", "Legs A", ...
    const ppl = generatedPlan(6);
    const firstLabelled = (label: string): string | undefined =>
      ppl.sessions.find((s) => s.label === label)?.id;
    for (const [day, exIdx, exName, label] of [
      [1, 0, 'Barbell bench press', 'Push A'],
      [2, 1, 'Barbell row (Pendlay)', 'Pull A'],
      [3, 0, 'Barbell back squat', 'Legs A'],
    ] as const) {
      const result = migrateV2(dayDoc(day, exIdx, exName), { ...OPTS, plan: ppl });
      if (!result.ok) throw new Error(result.reason);
      expect(setsOf(result.state)[0]?.sessionId).toBe(firstLabelled(label));
    }

    // Upper / Lower x2 labels its sessions "Upper A", "Lower A", ...; legacy day 5 is
    // "Upper Power", whose first word is the discriminating one.
    const upperLower = generatedPlan(4);
    const result = migrateV2(dayDoc(5, 1, 'Weighted pull-ups'), {
      ...OPTS,
      plan: upperLower,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(setsOf(result.state)[0]?.sessionId).toBe(
      upperLower.sessions.find((s) => s.label === 'Upper A')?.id,
    );
  });

  it('takes the lowest-indexed session when several share the label prefix', () => {
    const ppl = generatedPlan(6);
    const pushSessions = ppl.sessions.filter((s) => s.label.toLowerCase().startsWith('push'));
    expect(pushSessions.length).toBeGreaterThan(1);
    const result = migrateV2(dayDoc(1, 0, 'Barbell bench press'), { ...OPTS, plan: ppl });
    if (!result.ok) throw new Error(result.reason);
    expect(setsOf(result.state)[0]?.sessionId).toBe(pushSessions[0]?.id);
  });

  it('records the fallback reason for a legacy day with no matching label', () => {
    const { report } = run();
    const keys = report.sessionFallbacks.map((f) => f.key).sort();
    // day 4 is a rest day; day 5 "Upper Power" has no "Upper" session in the test plan
    expect(keys).toEqual(['day.4', 'day.5']);
    expect(report.sessionFallbacks.find((f) => f.key === 'day.5')?.reason).toMatch(/upper/i);
  });
});

describe('migrateV2 - rejections, all reported', () => {
  it('reports exactly the ten undecodable set keys', () => {
    const { report } = run();
    const setSkips = skipKeys(report).filter((k) => k.startsWith('sets.'));
    expect(setSkips).toEqual(
      [
        'sets.1-1-1009-1',
        'sets.1-1-3-1',
        'sets.1-1-4-1',
        'sets.1-1-9-1',
        'sets.1-2-0-3',
        'sets.1-3-0-1',
        'sets.1-7-0-1',
        'sets.25-1-0-1',
        'sets.3-1-0-1',
        'sets.not-a-key',
      ].sort(),
    );
  });

  it('names the reason for each rejection', () => {
    const { report } = run();
    const reason = (key: string): string =>
      report.setsSkipped.find((s) => s.key === key)?.reason ?? '';
    expect(reason('sets.3-1-0-1')).toMatch(/negative/i);
    expect(reason('sets.1-2-0-3')).toMatch(/finite/i);
    expect(reason('sets.25-1-0-1')).toMatch(/week/i);
    expect(reason('sets.1-1-9-1')).toMatch(/exercise slot/i);
    expect(reason('sets.1-7-0-1')).toMatch(/no equivalent/i);
    expect(reason('sets.1-3-0-1')).toMatch(/reps/i);
    expect(reason('sets.1-1-3-1')).toMatch(/does not match/i);
    expect(reason('sets.1-1-4-1')).toMatch(/neither a load nor a rep count/i);
    expect(reason('sets.1-1-1009-1')).toMatch(/custom exercise/i);
    expect(reason('sets.not-a-key')).toMatch(/week-day-exIdx-setNumber/);
  });

  it('quotes the frozen UNMAPPED reason for a legacy row that is not an exercise', () => {
    const { report } = run();
    const reason = report.setsSkipped.find((s) => s.key === 'sets.1-7-0-1')?.reason ?? '';
    expect(reason).toMatch(/placeholder row/i);
  });

  it('reports non-set records with an origin-prefixed key', () => {
    const { report } = run();
    const keys = skipKeys(report);
    expect(keys).toContain('weightLog[2]');
    expect(keys).toContain('water.not-a-date');
    expect(keys).toContain('water.2026-01-07');
    expect(keys).toContain('notes.2026-01-06');
    expect(keys).toContain('pushupLog.3');
    expect(keys).toContain('completed.1-3-4');
    expect(keys).toContain('mealSwaps.3');
  });

  it('does not report a completed flag that a logged set already covers', () => {
    const { report } = run();
    expect(skipKeys(report)).not.toContain('completed.1-1-0');
    expect(skipKeys(report)).not.toContain('completed.1-1-1');
  });

  it('refuses a payload that is not an object without throwing', () => {
    const result = migrateV2('not a store', OPTS);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.reason).toMatch(/not a JSON object/i);
  });

  it('refuses an invalid time zone rather than throwing from dates.ts', () => {
    const result = migrateV2(raw, { ...OPTS, timezone: 'Mars/Olympus_Mons' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.reason).toMatch(/time zone/i);
  });

  it('skips every date-derived record when the legacy start date is missing', () => {
    const result = migrateV2({ ...raw, startDate: null }, OPTS);
    if (!result.ok) throw new Error(result.reason);
    const { report } = result;
    expect(report.setsMigrated).toBe(0);
    expect(report.bodyMassMigrated).toBe(0);
    // notes and hydration are keyed by date already, so they still migrate
    expect(report.hydrationDays).toBe(2);
    expect(report.notesKept).toBe(1);
    expect(report.setsSkipped.some((s) => /start date/i.test(s.reason))).toBe(true);
  });
});

describe('migrateV2 - push-up maxima', () => {
  it('appends each weekly maximum as an AMRAP set on legacy day 4 of that week', () => {
    const { state } = run();
    const pushups = setsOf(state)
      .filter((s) => s.exerciseId === 'push-up')
      .sort(
        (a, b) => a.assignmentDate.localeCompare(b.assignmentDate) || a.setNumber - b.setNumber,
      );
    expect(pushups.map((s) => [s.assignmentDate, s.setNumber, s.reps, s.isBonus])).toEqual([
      ['2026-01-08', 1, 12, true], // week 1 maximum, no sets logged that day
      ['2026-01-15', 1, 20, false], // set logged in the old app
      ['2026-01-15', 2, 18, false], // set logged in the old app
      ['2026-01-15', 3, 15, true], // week 2 maximum, appended after them
    ]);
    expect(pushups.every((s) => s.loadKg === 0)).toBe(true); // [kg] bodyweight
  });
});

describe('migrateV2 - body mass', () => {
  it('converts the legacy lb field to kg exactly, whatever the load unit answer was', () => {
    for (const units of ['kg', 'lb'] as const) {
      const { state, report } = run({ units });
      const entries = state.bodyMass['p1'] ?? [];
      expect(report.bodyMassMigrated).toBe(2);
      expect(entries[0]?.massKg).toBe(210 * KG_PER_LB); // [kg] from 210 lb
      expect(entries[0]?.date).toBe('2026-01-05');
      expect(entries[0]?.enteredUnit).toBe('imperial');
      expect(entries[1]?.date).toBe('2026-01-12');
    }
  });

  it('stores the number unchanged when the caller says the legacy field held kg', () => {
    const { state } = run({ bodyMassUnits: 'kg' });
    expect((state.bodyMass['p1'] ?? [])[0]?.massKg).toBe(210); // [kg]
    expect((state.bodyMass['p1'] ?? [])[0]?.enteredUnit).toBe('metric');
  });
});

describe('migrateV2 - hydration, notes, specimens, capsule', () => {
  it('converts cups to millilitres at 500 mL per cup', () => {
    const { state, report } = run();
    expect(CUP_ML).toBe(500); // [mL/cup]
    const h = state.hydration['p1'] ?? [];
    expect(report.hydrationDays).toBe(2);
    expect(h.map((e) => [e.date, e.volumeML])).toEqual([
      ['2026-01-05', 3500], // [mL]
      ['2026-01-06', 2500], // [mL]
    ]);
    expect(h.every((e) => e.marks.length === 0)).toBe(true);
  });

  it('keeps non-empty notes and drops whitespace-only ones', () => {
    const { state, report } = run();
    expect(report.notesKept).toBe(1);
    expect(state.notes['p1']).toEqual({
      '2026-01-05': 'first session back after eighteen months',
    });
  });

  it('carries the specimen inventory across and recomputes the set counter', () => {
    const { state } = run();
    const inv = state.specimens['p1'];
    expect(Object.keys(inv?.acquired ?? {}).sort()).toEqual(['c003', 'c019', 'c027']);
    expect(inv?.acquired['c003']?.exerciseId).toBe('barbell-bench-press');
    expect(inv?.acquired['c019']?.exerciseId).toBeNull();
    // legacy totalSetsLogged was 31 and only ever increased (code review A47)
    expect(inv?.totalSetsLogged).toBe(22);
  });

  it('dates a specimen from a phased slot by the week it was acquired in', () => {
    const { state } = run();
    // c027 was acquired 2026-02-09, legacy week 6, and the slot means the Bulgarian split
    // squat from week 5 onward. Taking the first range would have stored leg-press.
    expect(state.specimens['p1']?.acquired['c027']?.exerciseId).toBe('bulgarian-split-squat');
  });

  it('drops legacy specimen keys that are not card ids and reports every one', () => {
    // JSON.parse is the only way to build an OWN "__proto__" key: an object literal with
    // that key sets the prototype instead. A hand-edited legacy blob can carry one, and on
    // a plain {} the assignment `acquired['__proto__'] = rec` reaches Object.prototype's
    // __proto__ setter, so the row disappears with no entry in setsSkipped -- the one thing
    // this module's header promises never happens.
    const doc = JSON.parse(
      '{"startDate":"2026-01-05","specimens":{' +
        '"__proto__":{"acquiredAt":1767611000000,"exercise":"Barbell bench press"},' +
        '"constructor":{"acquiredAt":1767611000000,"exercise":"Barbell bench press"},' +
        '"c001":{"acquiredAt":1767611000000,"exercise":"Barbell bench press"}}}',
    ) as unknown;
    const result = migrateV2(doc, OPTS);
    if (!result.ok) throw new Error(result.reason);

    const acquired = result.state.specimens['p1']?.acquired ?? {};
    expect(Object.keys(acquired)).toEqual(['c001']);
    expect(acquired['c001']?.exerciseId).toBe('barbell-bench-press');

    const reasons = new Map(result.report.setsSkipped.map((s) => [s.key, s.reason]));
    expect(reasons.get('specimens.__proto__')).toMatch(/card id/i);
    expect(reasons.get('specimens.constructor')).toMatch(/card id/i);

    // Object.prototype is untouched: a fresh object inherits none of the record's fields.
    const fresh: Record<string, unknown> = {};
    expect(fresh['acquired']).toBeUndefined();
    expect(fresh['at']).toBeUndefined();
    expect(fresh['exerciseId']).toBeUndefined();
  });

  it('carries the time capsule and gives it the week-24 opening date', () => {
    const { state } = run();
    const capsule = state.capsules['p1'];
    expect(capsule?.note).toBe('Read this at graduation.');
    expect(capsule?.opensOn).toBe('2026-06-15'); // start + 23 weeks
    expect(capsule?.opened).toBe(false);
  });
});

describe('migrateV2 - custom exercises', () => {
  it('gives each distinct custom exercise one stable id, not 1000 + index', () => {
    const { state } = run();
    const customs = state.customExercises['p1'] ?? [];
    expect(customs).toHaveLength(1);
    expect(customs[0]?.name).toBe('Cable fly');
    expect(customs[0]?.id).not.toMatch(/^100\d$/);
    const set = setsOf(state).find((s) => s.exerciseId === customs[0]?.id);
    expect(set?.reps).toBe(15);
  });

  it('orders the legacy custom-exercise days by week then day, not as strings', () => {
    // Object.keys(...).sort() is a string sort, so '10-1' < '2-1' and week 10 is visited
    // before week 2. The order decides which day defines each exercise and the order the
    // exercises are stored in, so it has to be the numeric one.
    const doc = {
      startDate: '2026-01-05',
      customEx: {
        '2-1': [{ name: 'Beta', sets: '3' }],
        '10-1': [{ name: 'Gamma', sets: '3' }],
        '1-3': [{ name: 'Alpha', sets: '3' }],
      },
    };
    const result = migrateV2(doc, OPTS);
    if (!result.ok) throw new Error(result.reason);
    expect((result.state.customExercises['p1'] ?? []).map((e) => e.name)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
  });

  it('lets the numerically earliest day define an exercise named on two days', () => {
    // The rule already in the code is first-encountered-wins: customSetsSpec is written only
    // when the name is absent, and the loop returns early once customByName holds the name.
    // So the winner is the numerically FIRST key, which is what the sort has to deliver.
    // Under a string sort '10-1' is visited first and its "5" would set the target; under
    // week-then-day order '2-1' is first, the target is 2, and set 3 is a bonus set.
    const doc = {
      startDate: '2026-01-05',
      customEx: {
        '10-1': [{ name: 'Beta', sets: '5' }],
        '2-1': [{ name: 'Beta', sets: '2' }],
      },
      sets: {
        '2-1-1000-3': { weight: 20, reps: 10, ts: 1767610800000, exName: 'Beta' },
      },
    };
    const result = migrateV2(doc, OPTS);
    if (!result.ok) throw new Error(result.reason);
    const customs = result.state.customExercises['p1'] ?? [];
    expect(customs).toHaveLength(1);
    const set = Object.values(result.state.sets).find((x) => x.exerciseId === customs[0]?.id);
    expect(set?.setNumber).toBe(3); // [sets]
    expect(set?.isBonus).toBe(true); // 3 > the 2 sets that '2-1' prescribes
  });

  it('says in the exercise note that modality and load class were not recorded', () => {
    const { state } = run();
    expect(state.customExercises['p1']?.[0]?.note).toMatch(/no modality/i);
  });
});

describe('migrateV2 - report', () => {
  it('states the unit assumed for loads and for body mass', () => {
    const { report } = run({ units: 'lb' });
    expect(report.unitsAssumed).toEqual({ loads: 'lb', bodyMass: 'lb' });
  });

  it('counts the distinct legacy sessions that produced at least one set', () => {
    const { report } = run();
    // 2026-01-05 push, 01-06 pull, 01-07 legs, 01-08 push-up test, 01-12 push,
    // 01-15 push-ups, 01-16 upper power
    expect(report.sessionsMigrated).toBe(7);
  });

  it('produces a state that parseState accepts', () => {
    const { state } = run();
    const parsed = parseState(JSON.parse(JSON.stringify(state)) as unknown);
    expect(parsed.ok).toBe(true);
  });
});

describe('migrateV2 - properties', () => {
  it('never throws on arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.oneof(fc.jsonValue(), fc.anything()), (candidate) => {
        const result = migrateV2(candidate, OPTS);
        expect(typeof result.ok).toBe('boolean');
      }),
      { numRuns: 500 },
    );
  });

  it('stores a legacy load in kg with no rounding, and it round-trips to the display value', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 400, noNaN: true, noDefaultInfinity: true }),
        fc.constantFrom<'kg' | 'lb'>('kg', 'lb'),
        (entered, units) => {
          const doc = {
            startDate: '2026-01-05',
            sets: {
              '1-1-0-1': {
                weight: entered, // [kg] or [lb] per units
                reps: 5,
                ts: 1767610800000,
                exName: 'Barbell bench press',
              },
            },
          };
          const result = migrateV2(doc, { ...OPTS, units });
          if (!result.ok) throw new Error(result.reason);
          const set = Object.values(result.state.sets)[0];
          expect(set).toBeDefined();
          const expectedKg = units === 'lb' ? entered * KG_PER_LB : entered; // [kg]
          expect(set?.loadKg).toBe(expectedKg);
          // displayLoad rounds to 0.1 in the display unit, so the round trip is
          // exact to within half a step of that grid.
          const shown = displayLoad(set?.loadKg ?? 0, units === 'lb' ? 'imperial' : 'metric');
          expect(Math.abs(shown - entered)).toBeLessThanOrEqual(0.05 + 1e-9);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('applyMigration', () => {
  it('merges only the migrated slices and leaves the plan and cursor alone', () => {
    const base = makeBlankState();
    const { state: migrated } = run();
    const applied = applyMigration(base, migrated, 'p1');
    if (!applied.ok) throw new Error(applied.reason);
    const next = applied.state;
    expect(next.cursors).toEqual(base.cursors);
    expect(next.plans).toEqual(base.plans);
    expect(next.availability).toEqual(base.availability);
    expect(Object.keys(next.sets)).toHaveLength(22);
    expect(next.notes['p1']?.['2026-01-05']).toBe('first session back after eighteen months');
    expect(next.ui.legacyMigration).toBe('done');
  });

  it('keeps an existing note over a migrated one for the same day', () => {
    const base = makeBlankState();
    base.notes = { p1: { '2026-01-05': 'written in the new app' } };
    const { state: migrated } = run();
    const applied = applyMigration(base, migrated, 'p1');
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.state.notes['p1']?.['2026-01-05']).toBe('written in the new app');
  });

  it('keeps an existing time capsule rather than overwriting it', () => {
    const base = makeBlankState();
    base.capsules = {
      p1: { note: 'already sealed', writtenAt: 1, opensOn: '2026-12-01', opened: false },
    };
    const { state: migrated } = run();
    const applied = applyMigration(base, migrated, 'p1');
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.state.capsules['p1']?.note).toBe('already sealed');
  });

  it('never writes a duplicate set when applied twice, and reports the repeats', () => {
    const base = makeBlankState();
    const { state: migrated } = run();

    const first = applyMigration(base, migrated, 'p1');
    if (!first.ok) throw new Error(first.reason);
    const afterFirst = Object.keys(first.state.sets).length; // [sets]

    // migrateV2 mints a fresh id on every run and schema.ts carries no
    // (assignmentDate, exerciseId, setNumber) uniqueness refinement, so an id-keyed spread
    // stores a second copy of every set rather than recognising it.
    const { state: migratedAgain } = run();
    const second = applyMigration(first.state, migratedAgain, 'p1');
    if (!second.ok) throw new Error(second.reason);

    expect(Object.keys(second.state.sets)).toHaveLength(afterFirst);
    expect(first.skipped).toEqual([]);
    expect(second.skipped).toHaveLength(afterFirst);
    expect(new Set(second.skipped.map((k) => k.reason))).toEqual(new Set(['already present']));
  });

  it('refuses a merge that would not validate, rather than storing it', () => {
    const base = makeBlankState();
    const { state: migrated } = run();
    // an unknown profile id makes every merged slice an orphan, which the root
    // refinement of AppStateSchema rejects
    const applied = applyMigration(base, migrated, 'ghost');
    expect(applied.ok).toBe(false);
  });
});
