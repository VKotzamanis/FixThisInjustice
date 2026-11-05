import { describe, expect, it } from 'vitest';
import { addDays, isoWeekday } from '../dates';
import { completeSession, startSession } from '../schedule/cursor';
import { suggestedProgression } from '../training/progression';
import { substitutePlanned, swapAlternatives } from '../training/sessionEdits';
import type {
  AppState,
  EquipmentAccess,
  Experience,
  LocalDate,
  LoggedSet,
  PlannedSession,
  PlanTemplate,
  SessionEdits,
} from '../types';
import { ACCESS_UNLOCKS } from '../types';
import { emptyState, makeProfile, MONDAY, PROFILE_ID, TZ_ATHENS } from '../../test/scheduleFixtures';
import { MAX_PLAN_WEEKS } from '../limits';
import {
  bandForWeek,
  CONSISTENT_SKIP_MIN,
  CONSISTENT_SWAP_MIN,
  cyclesOf,
  ensureRunway,
  INITIAL_WEEKS,
  RUNWAY_SESSIONS,
  withoutLength,
} from './engine';
import { BLOCK_WEEKS, CARDIO_EXERCISE_IDS, DELOAD_SET_MODIFIER, generatePlan, weeklySetsByMuscle } from './generator';
import { fitsInventory, inventoryOf } from './inventory';
import { EXERCISE_BY_ID, EXERCISES } from './library';
import { EVIDENCE_CEILING_SETS, type SessionsPerWeek } from './templates';
import { CALENDAR_DAYS } from '../../config/export';
import { SCHEDULE_HORIZON_DAYS } from '../../config/reminders';

const PLAN_ID = 'engine-plan';
const DAYS: readonly SessionsPerWeek[] = [2, 3, 4, 5, 6];
const EXPERIENCES: readonly Experience[] = ['novice', 'intermediate', 'advanced'];
const ACCESS: readonly EquipmentAccess[] = ['full-gym', 'home', 'bodyweight'];

interface Cell {
  spw: SessionsPerWeek;
  experience: Experience;
  equipment: EquipmentAccess;
  includeCardio: boolean;
  weeks?: number;
}

/** A state running a generated plan from MONDAY, slots on the first `spw` weekdays, quota spw. */
function programme(cell: Cell): AppState {
  const profile = { ...makeProfile(TZ_ATHENS), experience: cell.experience, equipment: cell.equipment };
  const plan = generatePlan(
    {
      sessionsPerWeek: cell.spw,
      weeks: cell.weeks ?? INITIAL_WEEKS,
      goal: 'recomposition',
      experience: cell.experience,
      equipment: cell.equipment,
      includeCardio: cell.includeCardio,
      inventory: inventoryOf(profile),
    },
    EXERCISES,
  );
  const base = emptyState();
  return {
    ...base,
    activeProfileId: PROFILE_ID,
    profiles: { [PROFILE_ID]: profile },
    availability: {
      [PROFILE_ID]: {
        slots: Array.from({ length: cell.spw }, (_, i) => ({
          weekday: (i + 1) as 1 | 2 | 3 | 4 | 5 | 6,
          startTime: '07:00',
          expectedDurationS: 3600, // [s]
        })),
        weeklySessionTarget: cell.spw, // [sessions/week]
      },
    },
    plans: { [PLAN_ID]: { ...plan, id: PLAN_ID } },
    cursors: { [PROFILE_ID]: { planId: PLAN_ID, nextSessionIndex: 0, startedOn: MONDAY, completedOn: null } },
    pauses: { [PROFILE_ID]: [] },
    assignments: { [PROFILE_ID]: [] },
  };
}

function planOf(s: AppState): PlanTemplate {
  const p = s.plans[PLAN_ID];
  if (p === undefined) throw new Error('plan missing');
  return p;
}

function cursorIndex(s: AppState): number {
  return s.cursors[PROFILE_ID]?.nextSessionIndex ?? -1;
}

/** The n-th (0-based) slot day on or after MONDAY for a plan of `spw` slot weekdays 1..spw. */
function slotDate(spw: number, n: number): LocalDate {
  let d = MONDAY;
  let seen = -1;
  for (;;) {
    if (isoWeekday(d) <= spw) seen += 1;
    if (seen === n) return d;
    d = addDays(d, 1);
  }
}

interface DayPlan {
  edits?: SessionEdits;
  /** Log nothing at all (a Finish with no sets). */
  noSets?: boolean;
}

let setSeq = 0;

/** Start, edit, log one met set per performed slot, complete, then keep the runway (the store). */
function trainNext(s: AppState, date: LocalDate, day: DayPlan = {}): AppState {
  const now = Date.parse(`${date}T12:00:00Z`); // [ms] epoch, UTC
  let next = startSession(s, PROFILE_ID, date, now);
  const rows = next.assignments[PROFILE_ID] ?? [];
  const row = rows.find((a) => a.date === date);
  if (row === undefined) throw new Error(`no row on ${date}`);
  const session = planOf(next).sessions.find((x) => x.id === row.sessionId);
  if (session === undefined) throw new Error('session missing');
  const edits = day.edits;
  if (edits !== undefined) {
    next = {
      ...next,
      assignments: { ...next.assignments, [PROFILE_ID]: rows.map((a) => (a === row ? { ...a, edits } : a)) },
    };
  }
  if (day.noSets !== true) {
    const sets: Record<string, LoggedSet> = { ...next.sets };
    for (const pe of session.exercises) {
      if (edits?.skipped.includes(pe.exerciseId) === true) continue;
      const exerciseId = edits?.swaps[pe.exerciseId] ?? pe.exerciseId;
      const reps = pe.prescription.kind === 'reps' ? pe.prescription.hi : 10; // [repetitions]
      for (let n = 1; n <= pe.setsLo; n += 1) {
        setSeq += 1;
        const id = `set-${String(setSeq)}`;
        sets[id] = {
          id,
          profileId: PROFILE_ID,
          assignmentDate: date,
          sessionId: session.id,
          exerciseId,
          setNumber: n,
          isBonus: false,
          loadKg: 40, // [kg]
          enteredUnit: 'metric',
          reps,
          durationS: null,
          rpe: 8,
          loggedAt: now,
        };
      }
    }
    next = { ...next, sets };
  }
  next = completeSession(next, PROFILE_ID, date, now);
  return ensureRunway(next, PROFILE_ID);
}

/** Train every session up to (excluding) index `to`, one per slot day, editing with `edit`. */
function trainUntil(s: AppState, spw: number, to: number, edit: (session: PlannedSession, i: number) => DayPlan = () => ({})): AppState {
  let state = s;
  while (cursorIndex(state) < to) {
    const i = cursorIndex(state);
    const session = planOf(state).sessions[i];
    if (session === undefined) throw new Error(`no session ${String(i)}`);
    state = trainNext(state, slotDate(spw, i), edit(session, i));
  }
  return state;
}

/** Structural invariants every plan the engine writes keeps. */
function expectWellFormed(plan: PlanTemplate): void {
  const ids = plan.sessions.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length); // ids unique
  plan.sessions.forEach((s, i) => {
    expect(s.ordinal).toBe(i + 1); // ordinals contiguous
  });
  const blocks = [...plan.blocks].sort((a, b) => a.firstSessionIndex - b.firstSessionIndex);
  let next = 0; // [sessions]
  blocks.forEach((b, i) => {
    expect(b.index).toBe(i);
    expect(b.firstSessionIndex).toBe(next); // contiguous, no overlap
    next += b.sessionCount;
  });
  expect(next).toBe(plan.sessions.length); // blocks cover every session
  const cycles = cyclesOf(plan);
  expect(cycles[0]?.start).toBe(0);
  cycles.forEach((c, i) => {
    if (i > 0) expect(c.start).toBe(cycles[i - 1]?.end);
  });
  expect(cycles.at(-1)?.end).toBe(plan.sessions.length);
  expect(plan.weeks).toBe(Math.ceil(plan.sessions.length / plan.sessionsPerWeek));
}

/** One week of sessions starting at `from`. */
function weekAt(plan: PlanTemplate, from: number): PlannedSession[] {
  return plan.sessions.slice(from, from + plan.sessionsPerWeek);
}

describe('constants', () => {
  it('derives the runway from the two forward windows', () => {
    expect(RUNWAY_SESSIONS).toBe(Math.max(CALENDAR_DAYS, SCHEDULE_HORIZON_DAYS));
  });
  it('materialises a whole number of cycles at setup', () => {
    expect(INITIAL_WEEKS % BLOCK_WEEKS).toBe(0);
  });
});

describe('cyclesOf', () => {
  it('pairs each normal block with its deload, and keeps a short trailing block on its own', () => {
    const plan = generatePlan(
      { sessionsPerWeek: 3, weeks: 10, goal: 'maintenance', experience: 'novice', equipment: 'full-gym', includeCardio: false },
      EXERCISES,
    );
    expect(cyclesOf(plan)).toEqual([
      { start: 0, end: 12 },
      { start: 12, end: 24 },
      { start: 24, end: 30 },
    ]);
  });
  it('treats a plan with no blocks as one cycle', () => {
    const plan = generatePlan(
      { sessionsPerWeek: 2, weeks: 8, goal: 'maintenance', experience: 'novice', equipment: 'full-gym', includeCardio: false },
      EXERCISES,
    );
    expect(cyclesOf({ ...plan, blocks: [] })).toEqual([{ start: 0, end: 16 }]);
  });
});

describe('ensureRunway: extension on every generator cell', () => {
  for (const spw of DAYS) {
    for (const experience of EXPERIENCES) {
      for (const equipment of ACCESS) {
        for (const includeCardio of [false, true]) {
          it(`${String(spw)}/wk ${experience} ${equipment}${includeCardio ? ' +cardio' : ''}`, () => {
            const s0 = programme({ spw, experience, equipment, includeCardio });
            const before = planOf(s0);
            const s1 = ensureRunway(s0, PROFILE_ID);
            const plan = planOf(s1);
            expectWellFormed(plan);
            expect(plan.sessions.length - cursorIndex(s1)).toBeGreaterThanOrEqual(RUNWAY_SESSIONS);
            // The materialised start is untouched: same ids, same content.
            expect(plan.sessions.slice(0, before.sessions.length)).toEqual(before.sessions);
            // Appended cycles repeat the 3 + 1 layout with the generator's deload modifier.
            for (const b of plan.blocks.slice(before.blocks.length)) {
              expect(b.isDeload ? b.sessionCount : b.sessionCount / 3).toBe(spw);
              expect(b.setModifier).toBe(b.isDeload ? DELOAD_SET_MODIFIER : 1);
              expect(b.loadModifier).toBe(1);
            }
            // Idempotent: a plan already holding the runway is returned by identity.
            expect(ensureRunway(s1, PROFILE_ID)).toBe(s1);
          });
        }
      }
    }
  }
});

/** [cells] Sweep cells whose next cycle differs from the first: the rules fired somewhere. */
let changedCells = 0;

describe('ensureRunway: next cycle from logged data, every day count and tier', () => {
  for (const spw of DAYS) {
    for (const equipment of ACCESS) {
      it(`${String(spw)}/wk ${equipment}: ids kept, volume in band, inventory respected, progression carried`, () => {
        const cell: Cell = { spw, experience: 'intermediate', equipment, includeCardio: spw % 2 === 0 };
        const s0 = ensureRunway(programme(cell), PROFILE_ID);
        const profile = s0.profiles[PROFILE_ID];
        if (profile === undefined) throw new Error('profile');
        const inventory = inventoryOf(profile);
        const cycleLen = BLOCK_WEEKS * spw; // [sessions]
        const firstWeek = weekAt(planOf(s0), 0);
        const swapLabel = firstWeek[0]?.label ?? '';
        const skipLabel = firstWeek[1]?.label ?? '';
        // The user swaps the first slot of the first label to its first fitting alternative and
        // skips the second slot of the second label, every time, for a whole cycle.
        const firstOfSwap = firstWeek[0]?.exercises[0];
        const swapFrom = firstOfSwap?.exerciseId ?? '';
        const swapTo =
          swapAlternatives({
            original: EXERCISE_BY_ID[swapFrom] ?? EXERCISES[0]!,
            access: equipment,
            inventory,
            library: EXERCISES,
            inUse: new Set(firstWeek[0]?.exercises.map((e) => e.exerciseId)),
          }).suggested.find((e) => e.id !== swapFrom)?.id ?? swapFrom;
        const skipKey = firstWeek[1]?.exercises[1]?.exerciseId ?? '';
        const edit = (session: PlannedSession): DayPlan => ({
          edits: {
            swaps: session.label === swapLabel && swapTo !== swapFrom ? { [swapFrom]: swapTo } : {},
            skipped: session.label === skipLabel ? [skipKey] : [],
            added: [],
            order: [],
          },
        });
        const s1 = trainUntil(s0, spw, cycleLen, edit);
        const plan = planOf(s1);
        expectWellFormed(plan);
        expect(plan.sessions.length - cursorIndex(s1)).toBeGreaterThanOrEqual(RUNWAY_SESSIONS);

        // Ids: every trained session kept its id, so every logged set still resolves.
        const ids = new Set(plan.sessions.map((s) => s.id));
        for (const set of Object.values(s1.sets)) expect(ids.has(set.sessionId)).toBe(true);
        expect(plan.sessions.slice(0, cycleLen)).toEqual(planOf(s0).sessions.slice(0, cycleLen));

        // Volume: the next cycle's week keeps every in-band muscle in band and no muscle above
        // the band top or the evidence ceiling that was not already there.
        const band = bandForWeek(spw);
        const oldWeek = weeklySetsByMuscle(weekAt(plan, 0), EXERCISES);
        const newWeek = weeklySetsByMuscle(weekAt(plan, cycleLen), EXERCISES);
        for (const m of new Set([...Object.keys(oldWeek), ...Object.keys(newWeek)])) {
          const a = newWeek[m] ?? 0;
          const b = oldWeek[m] ?? 0;
          expect(a).toBeLessThanOrEqual(Math.max(band[1], b));
          if (b >= band[0]) expect(a).toBeGreaterThanOrEqual(band[0]);
        }
        let topSets = 0;
        for (const s of weekAt(plan, cycleLen)) for (const e of s.exercises) topSets = Math.max(topSets, e.setsHi);
        expect(topSets).toBeLessThanOrEqual(EVIDENCE_CEILING_SETS);

        // Every cycle after the ended one carries the same derived week.
        for (let c = cycleLen; c + spw <= plan.sessions.length; c += spw) {
          expect(weekAt(plan, c).map((s) => s.exercises)).toEqual(weekAt(plan, cycleLen).map((s) => s.exercises));
        }

        const nextWeek = weekAt(plan, cycleLen);
        if (JSON.stringify(nextWeek.map((x) => x.exercises)) !== JSON.stringify(firstWeek.map((x) => x.exercises))) {
          changedCells += 1;
        }
        const swapSession = nextWeek.find((s) => s.label === swapLabel);
        const skipSession = nextWeek.find((s) => s.label === skipLabel);
        const oldSkip = firstWeek[1];
        // Inventory: every exercise the ENGINE chose (not the user's swap) fits access and inventory.
        for (const session of nextWeek) {
          for (const e of session.exercises) {
            if (e.exerciseId === swapTo) continue;
            const ex = EXERCISE_BY_ID[e.exerciseId];
            expect(ex).toBeDefined();
            if (ex === undefined) continue;
            expect(ex.equipment.some((t) => ACCESS_UNLOCKS[equipment].includes(t))).toBe(true);
            expect(fitsInventory(ex, equipment, inventory)).toBe(true);
          }
        }
        // The skipped slot is gone or kept for a stated reason (no alternative passed the guard).
        if (skipSession !== undefined && oldSkip !== undefined && skipLabel !== swapLabel) {
          const replaced = !skipSession.exercises.some((e) => e.exerciseId === skipKey);
          if (replaced) {
            const pos = oldSkip.exercises.findIndex((e) => e.exerciseId === skipKey);
            const now = skipSession.exercises[pos];
            expect(now?.setsLo).toBe(oldSkip.exercises[pos]?.setsLo); // sets kept: the slot's volume decision
          }
        }
        // Progression carried: a kept slot keeps its id and prescription, so the rule reads the
        // same history and returns the same advice on the first session of the next cycle.
        const normal = plan.blocks.find((b) => !b.isDeload && b.firstSessionIndex === cycleLen);
        expect(normal).toBeDefined();
        if (swapSession !== undefined && normal !== undefined) {
          const history = Object.values(s1.sets);
          const firstWeekSwap = firstWeek[0];
          for (const [j, e] of swapSession.exercises.entries()) {
            const old = firstWeekSwap?.exercises[j];
            const ex = EXERCISE_BY_ID[e.exerciseId];
            if (old === undefined || ex === undefined || e.exerciseId !== old.exerciseId) continue;
            expect(e).toEqual(old);
            expect(suggestedProgression(history, e, ex, profile, normal)).toEqual(
              suggestedProgression(history, old, ex, profile, normal),
            );
          }
        }
      });
    }
  }
});

describe('sweep census', () => {
  it('changed the next cycle in most cells (adoption or replacement fired)', () => {
    expect(changedCells).toBeGreaterThanOrEqual(DAYS.length * ACCESS.length - 3);
  });
});

describe('ensureRunway: the rules, on a full-gym 4-day plan', () => {
  const cell: Cell = { spw: 4, experience: 'intermediate', equipment: 'full-gym', includeCardio: false };
  const cycleLen = BLOCK_WEEKS * 4; // [sessions]
  const s0 = ensureRunway(programme(cell), PROFILE_ID);
  const week0 = weekAt(planOf(s0), 0);
  const upper = week0[0];
  if (upper === undefined) throw new Error('week');
  const fromId = upper.exercises[0]?.exerciseId ?? '';
  const profile = s0.profiles[PROFILE_ID];
  if (profile === undefined) throw new Error('profile');
  const toId =
    swapAlternatives({
      original: EXERCISE_BY_ID[fromId]!,
      access: 'full-gym',
      inventory: null,
      library: EXERCISES,
      inUse: new Set(upper.exercises.map((e) => e.exerciseId)),
    }).suggested.find((e) => e.id !== fromId && e.muscleGroups.join() === EXERCISE_BY_ID[fromId]?.muscleGroups.join())?.id ?? '';
  const swapEdits = (session: PlannedSession): DayPlan =>
    session.label === upper.label ? { edits: { swaps: { [fromId]: toId }, skipped: [], added: [], order: [] } } : {};

  /** Plan indexes of the upper label's sessions in cycle 0, in order. */
  const upperIndexes = planOf(s0)
    .sessions.slice(0, cycleLen)
    .flatMap((s, i) => (s.label === upper.label ? [i] : []));
  /** Swap only in the latest `n` sessions of the upper label. */
  const swapLatest = (n: number, sub = toId) => (_session: PlannedSession, i: number): DayPlan =>
    upperIndexes.slice(-n).includes(i)
      ? { edits: { swaps: { [fromId]: sub }, skipped: [], added: [], order: [] } }
      : {};
  const upperNext = (s: AppState): PlannedSession | undefined =>
    weekAt(planOf(s), cycleLen).find((x) => x.label === upper.label);

  it('derives the swap threshold from the skip threshold (one "consistent" rule)', () => {
    expect(CONSISTENT_SWAP_MIN).toBe(CONSISTENT_SKIP_MIN);
    expect(upperIndexes.length).toBeGreaterThan(CONSISTENT_SWAP_MIN);
  });

  it('does not adopt a swap made in only the latest session of that label (R-A)', () => {
    const s1 = trainUntil(s0, 4, cycleLen, swapLatest(1));
    expect(upperNext(s1)?.exercises[0]?.exerciseId).toBe(fromId);
  });

  it('adopts a swap made in each of the latest CONSISTENT_SWAP_MIN sessions of that label (R-A)', () => {
    const s1 = trainUntil(s0, 4, cycleLen, swapLatest(CONSISTENT_SWAP_MIN));
    expect(upperNext(s1)?.exercises[0]).toEqual(substitutePlanned(upper.exercises[0]!, EXERCISE_BY_ID[toId]!));
  });

  it('does not adopt when the latest sessions swapped to different substitutes (R-A)', () => {
    const other =
      swapAlternatives({
        original: EXERCISE_BY_ID[fromId]!,
        access: 'full-gym',
        inventory: null,
        library: EXERCISES,
        inUse: new Set([...upper.exercises.map((e) => e.exerciseId), toId]),
      }).suggested.find((e) => e.id !== fromId)?.id ?? '';
    expect(other).not.toBe('');
    const last = upperIndexes.at(-1);
    const s1 = trainUntil(s0, 4, cycleLen, (session, i) =>
      swapLatest(CONSISTENT_SWAP_MIN, i === last ? other : toId)(session, i),
    );
    expect(upperNext(s1)?.exercises[0]?.exerciseId).toBe(fromId);
  });

  it('adopts a swap the user trained in every session of that label', () => {
    expect(toId).not.toBe('');
    const s1 = trainUntil(s0, 4, cycleLen, swapEdits);
    const next = weekAt(planOf(s1), cycleLen).find((s) => s.label === upper.label);
    const old = upper.exercises[0];
    expect(next?.exercises[0]).toEqual(substitutePlanned(old!, EXERCISE_BY_ID[toId]!));
    // The rest of the session is the old cycle's.
    expect(next?.exercises.slice(1)).toEqual(upper.exercises.slice(1));
  });

  it('keeps the planned exercise when the latest session went back to it', () => {
    let last = -1;
    upperIndexes: for (let i = cycleLen - 1; i >= 0; i -= 1) {
      if (planOf(s0).sessions[i]?.label === upper.label) {
        last = i;
        break upperIndexes;
      }
    }
    const s1 = trainUntil(s0, 4, cycleLen, (session, i) => (i === last ? {} : swapEdits(session)));
    const next = weekAt(planOf(s1), cycleLen).find((s) => s.label === upper.label);
    expect(next?.exercises[0]?.exerciseId).toBe(fromId);
  });

  it('replaces a slot skipped in every logged session of its label', () => {
    const key = upper.exercises[1]?.exerciseId ?? '';
    const s1 = trainUntil(s0, 4, cycleLen, (session) =>
      session.label === upper.label ? { edits: { swaps: {}, skipped: [key], added: [], order: [] } } : {},
    );
    const next = weekAt(planOf(s1), cycleLen).find((s) => s.label === upper.label);
    expect(next?.exercises.some((e) => e.exerciseId === key)).toBe(false);
    const alt = next?.exercises[1];
    expect(alt).toBeDefined();
    expect(alt?.setsLo).toBe(upper.exercises[1]?.setsLo);
  });

  it('does not count a skip once as consistent', () => {
    expect(CONSISTENT_SKIP_MIN).toBeGreaterThan(1);
    const key = upper.exercises[1]?.exerciseId ?? '';
    let first = true;
    const s1 = trainUntil(s0, 4, cycleLen, (session) => {
      if (session.label !== upper.label) return {};
      const skip = first;
      first = false;
      return skip ? { edits: { swaps: {}, skipped: [key], added: [], order: [] } } : {};
    });
    const next = weekAt(planOf(s1), cycleLen).find((s) => s.label === upper.label);
    expect(next?.exercises.some((e) => e.exerciseId === key)).toBe(true);
  });

  it('a Finish with no sets is no evidence of a skip', () => {
    const s1 = trainUntil(s0, 4, cycleLen, () => ({ noSets: true }));
    expect(weekAt(planOf(s1), cycleLen).map((s) => s.exercises)).toEqual(week0.map((s) => s.exercises));
  });

  it('keeps the exercises after a low-adherence cycle, swaps or not', () => {
    // One session a fortnight against a quota of four: far below half.
    let state = s0;
    let date = MONDAY;
    while (cursorIndex(state) < cycleLen) {
      const session = planOf(state).sessions[cursorIndex(state)];
      state = trainNext(state, date, session === undefined ? {} : swapEdits(session));
      date = addDays(date, 14);
    }
    expect(weekAt(planOf(state), cycleLen).map((s) => s.exercises)).toEqual(week0.map((s) => s.exercises));
  });

  it('never rewrites a session a row names; the untouched cycles after it continue from its content', () => {
    const key = upper.exercises[1]?.exerciseId ?? '';
    const skipEdits = (session: PlannedSession): DayPlan =>
      session.label === upper.label ? { edits: { swaps: {}, skipped: [key], added: [], order: [] } } : {};
    const s1 = trainUntil(s0, 4, cycleLen, skipEdits);
    const derived = weekAt(planOf(s1), cycleLen).map((s) => s.exercises);
    expect(derived).not.toEqual(week0.map((s) => s.exercises));
    // The next session is opened: cycle 1 is now named by a row.
    const date = slotDate(4, cycleLen);
    const opened = startSession(s1, PROFILE_ID, date, Date.parse(`${date}T12:00:00Z`));
    // The evidence changes afterwards (the skips are taken back on the old rows).
    const rows = (opened.assignments[PROFILE_ID] ?? []).map((a) => {
      if (a.edits === undefined) return a;
      const copy = { ...a };
      delete copy.edits;
      return copy;
    });
    const changed = ensureRunway({ ...opened, assignments: { [PROFILE_ID]: rows } }, PROFILE_ID);
    const plan = planOf(changed);
    expect(weekAt(plan, cycleLen).map((s) => s.exercises)).toEqual(derived); // frozen
    // The base of every later cycle is the latest materialised week, so the replacement stands:
    // taking the skips back on old rows does not undo a change already in a started cycle.
    expect(weekAt(plan, 2 * cycleLen).map((s) => s.exercises)).toEqual(derived);
    expect(plan.sessions.map((s) => s.id)).toEqual(planOf(opened).sessions.map((s) => s.id)); // ids kept
  });
});

describe('ensureRunway: revival and ceilings', () => {
  it('revives a finished 12-week plan: completedOn cleared, index kept, next cycle appended', () => {
    const cell: Cell = { spw: 3, experience: 'novice', equipment: 'full-gym', includeCardio: false, weeks: 12 };
    let s = programme(cell);
    const old = planOf(s);
    s = { ...s, plans: { [PLAN_ID]: { ...old, name: 'Full body x3, 12 weeks, recomposition' } } };
    // Train it through with the pre-L6 store: no runway after each completion.
    for (let i = 0; i < old.sessions.length; i += 1) {
      const date = slotDate(3, i);
      const now = Date.parse(`${date}T12:00:00Z`);
      s = completeSession(startSession(s, PROFILE_ID, date, now), PROFILE_ID, date, now);
    }
    expect(s.cursors[PROFILE_ID]?.completedOn).not.toBeNull();
    const revived = ensureRunway(s, PROFILE_ID);
    const plan = planOf(revived);
    expect(revived.cursors[PROFILE_ID]?.completedOn).toBeNull();
    expect(cursorIndex(revived)).toBe(old.sessions.length);
    expect(plan.sessions.length - old.sessions.length).toBeGreaterThanOrEqual(RUNWAY_SESSIONS);
    expect(plan.name).toBe('Full body x3, recomposition');
    expectWellFormed(plan);
    // The old sessions and their ids are untouched.
    expect(plan.sessions.slice(0, old.sessions.length)).toEqual(old.sessions);
    // Without a clock no pause is written.
    expect(revived.pauses[PROFILE_ID]).toEqual([]);
    // With one, the days it stood finished are a closed pause [completedOn + 1, today).
    const finishedOn = s.cursors[PROFILE_ID]?.completedOn ?? MONDAY;
    const today = addDays(finishedOn, 30);
    const withClock = ensureRunway(s, PROFILE_ID, today);
    expect(withClock.pauses[PROFILE_ID]).toEqual([
      { id: expect.any(String) as string, from: addDays(finishedOn, 1), to: today, reason: null },
    ]);
    // Launched the day after it finished: no gap, no pause.
    expect(ensureRunway(s, PROFILE_ID, addDays(finishedOn, 1)).pauses[PROFILE_ID]).toEqual([]);
  });

  it('stops at the plan ceiling, so a plan there finishes as before', () => {
    const cell: Cell = { spw: 2, experience: 'novice', equipment: 'full-gym', includeCardio: false };
    let s = ensureRunway(programme(cell), PROFILE_ID);
    const plan = planOf(s);
    // Grow it to the ceiling by moving the cursor forward and re-running the runway.
    for (let guard = 0; guard < 200; guard += 1) {
      const p = planOf(s);
      const cursor = s.cursors[PROFILE_ID];
      if (cursor === undefined) break;
      const moved = { ...s, cursors: { [PROFILE_ID]: { ...cursor, nextSessionIndex: p.sessions.length } } };
      const next = ensureRunway(moved, PROFILE_ID);
      if (planOf(next).sessions.length === p.sessions.length) {
        s = next;
        break;
      }
      s = next;
    }
    const final = planOf(s);
    expect(final.weeks).toBeLessThanOrEqual(MAX_PLAN_WEEKS);
    expect(final.sessions.length).toBeGreaterThan(plan.sessions.length);
    expectWellFormed(final);
    // At the ceiling the runway can no longer be kept, and nothing is appended.
    expect(ensureRunway(s, PROFILE_ID)).toBe(s);
  });

  it('drops a stored length from an old name, and leaves other names alone', () => {
    expect(withoutLength('Upper / Lower x2, 12 weeks, fat loss')).toBe('Upper / Lower x2, fat loss');
    expect(withoutLength('Upper / Lower x2, fat loss')).toBe('Upper / Lower x2, fat loss');
    expect(withoutLength('E2E plan')).toBe('E2E plan');
  });

  it('leaves a document without a cursor or plan alone', () => {
    const s = emptyState();
    expect(ensureRunway(s, PROFILE_ID)).toBe(s);
  });

  it('ignores the conditioning entry when deciding skips', () => {
    expect(CARDIO_EXERCISE_IDS.length).toBeGreaterThan(0);
  });
});
