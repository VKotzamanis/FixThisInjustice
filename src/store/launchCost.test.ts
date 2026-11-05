// src/store/launchCost.test.ts
//
// Audit B15: launch reads and validates every stored record, so its cost grows with history.
// The audit measured the pre-P2 document at 3 years (~80 sets/week, 16 programmes): JSON.parse
// 35 ms + Zod 124 ms in Node, ~1 s to first frame at 4x CPU throttle. After P2 (per-record
// IndexedDB, spec R13) writes are per record, but a launch still reads everything. This test
// pins what that read costs: a 3-year synthetic history hydrated through the P2 engine's memory
// backend (read + assembleState + install), in Node, on the development laptop.
//
// MEASURED 2026-11-05 (16 GB laptop shared with other work, Node 22, vitest jsdom env,
// --maxWorkers=1): hydrate median 430 ms over 5 runs of this file (413, 428, 430, 451, 514 ms;
// an earlier batch of 5 ran 478-587 ms); assembleState alone, JIT-warm, ~260-290 ms. That is
// slower than the audit's pre-P2 whole-document parse + Zod (~160 ms): one safeParse per record
// (12,636 sets) costs more than one parse of the map. Reported as a follow-up, not acted on. BUDGET = 3x that, so CI noise does not flake and a
// regression of more than 3x (an accidental O(n^2), a second full validation) fails here.
// Not measured: a phone CPU, IndexedDB's own getAll cost (fake or real), first paint.
//
// The history is built from the alpha fixture's own records (docs/feedback/alpha-fixture.json,
// written by the store's actions), cloned with fresh ids and dates, so every record is one the
// app can produce; the test first asserts nothing was quarantined, so the timing is of a load
// that read everything.
import { describe, expect, it } from 'vitest';
import alphaFixtureJson from '../../docs/feedback/alpha-fixture.json?raw';
import { addDays } from '../domain/dates';
import { useAppStore } from './index';
import { assembleState } from './db/assemble';
import { createMemoryDisk } from './db/memoryBackend';
import { groupRecords, splitDocument } from './db/records';
import { bootMemoryStore } from './testBackend';

/** [ms] median hydrate of the 3-year document, measured as stated above. */
const HYDRATE_MEASURED_MS = 430;
/** [ms] 3x the measured value. */
const HYDRATE_BUDGET_MS = 3 * HYDRATE_MEASURED_MS;

const PROFILE = 'alpha-demo';
const WEEKS = 156; // [weeks] 3 years
const SESSIONS_PER_WEEK = 3; // [sessions/week]
const SETS_PER_SESSION = 27; // [sets] ~80 sets/week, the audit's 3-year density
const PROGRAMMES = 16; // [plans] the audit's 3-year count
const START = '2023-09-04'; // a Monday

type Rec = Record<string, unknown>;

function threeYearDocument(): Rec {
  const alpha = JSON.parse(alphaFixtureJson) as Rec & Record<string, Record<string, unknown>>;
  const setTemplate = Object.values(alpha.sets as Record<string, Rec>)[0] ?? {};
  const assignmentTemplate = (alpha.assignments as Record<string, Rec[]>)[PROFILE]?.[0] ?? {};
  const reviewTemplate = (alpha.weeklyReviews as Record<string, Rec[]>)[PROFILE]?.[0] ?? {};
  const massTemplate = (alpha.bodyMass as Record<string, Rec[]>)[PROFILE]?.[0] ?? {};
  const [planId, planTemplate] = Object.entries(alpha.plans as Record<string, Rec>)[0] ?? ['', {}];

  const plans: Record<string, Rec> = {};
  for (let i = 0; i < PROGRAMMES; i += 1) {
    const id = i === PROGRAMMES - 1 ? planId : `plan-${String(i)}`;
    plans[id] = { ...planTemplate, id };
  }
  const sets: Record<string, Rec> = {};
  const assignments: Rec[] = [];
  const reviews: Rec[] = [];
  const mass: Rec[] = [];
  let n = 0;
  for (let w = 0; w < WEEKS; w += 1) {
    const monday = addDays(START, w * 7);
    reviews.push({ ...reviewTemplate, weekStart: monday, weekEnd: addDays(monday, 6) });
    mass.push({ ...massTemplate, id: `m-${String(w)}`, date: monday });
    for (let d = 0; d < SESSIONS_PER_WEEK; d += 1) {
      const date = addDays(monday, d * 2);
      assignments.push({ ...assignmentTemplate, date });
      for (let s = 0; s < SETS_PER_SESSION; s += 1) {
        const id = `set-${String(n)}`;
        n += 1;
        sets[id] = { ...setTemplate, id, assignmentDate: date, setNumber: (s % 3) + 1 };
      }
    }
  }
  return {
    ...alpha,
    plans,
    sets,
    assignments: { [PROFILE]: assignments },
    weeklyReviews: { [PROFILE]: reviews },
    bodyMass: { [PROFILE]: mass },
    cursors: { [PROFILE]: { ...(alpha.cursors as Record<string, Rec>)[PROFILE], startedOn: addDays(START, (WEEKS - 12) * 7) } },
  };
}

describe('launch cost of a 3-year history (audit B15)', () => {
  it(`hydrates ${String(WEEKS * SESSIONS_PER_WEEK * SETS_PER_SESSION)} sets and ${String(PROGRAMMES)} plans within budget`, async () => {
    const split = splitDocument(threeYearDocument());
    if (!split.ok) throw new Error(split.error);
    const disk = createMemoryDisk();
    disk.records = groupRecords(split.puts);
    disk.meta = { schemaVersion: 3, revision: 1 };

    const t0 = performance.now(); // [ms]
    await bootMemoryStore({ disk });
    const elapsed = performance.now() - t0; // [ms]
    // Breakdown, after the timed hydrate so it does not warm it: validation alone (JIT-warm).
    const a0 = performance.now(); // [ms]
    assembleState(disk.records);
    const assembleMs = performance.now() - a0; // [ms]

    const state = useAppStore.getState();
    expect(state.status.lastLoadError).toBeNull();
    expect(state.status.quarantine).toEqual([]);
    expect(Object.keys(state.sets)).toHaveLength(WEEKS * SESSIONS_PER_WEEK * SETS_PER_SESSION);
    expect(Object.keys(state.plans)).toHaveLength(PROGRAMMES);
    console.info(`B15 hydrate, 3-year document: ${elapsed.toFixed(0)} ms (assembleState alone ${assembleMs.toFixed(0)} ms; budget ${String(HYDRATE_BUDGET_MS)} ms)`);
    expect(elapsed).toBeLessThan(HYDRATE_BUDGET_MS);
  });
});
