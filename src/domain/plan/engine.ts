// src/domain/plan/engine.ts
//
// The open-ended programme engine (ROADMAP L6, docs/design/programme-engine.md). Owner: "one
// training ends -> create the next one based on the data logged".
//
// The plan is a list of sessions grouped into CYCLES: one normal block followed by its deload
// block (generator.ts buildBlocks, BLOCK_WEEKS = 4 weeks of sessions). ensureRunway keeps at
// least RUNWAY_SESSIONS sessions materialised ahead of the cursor, so every forward reader
// (Today strip, reminders, .ics, Plan tab) always has a schedule, and it decides the CONTENT of
// every cycle nobody has started from the cycle that last ended:
//
//   - a slot the user swapped (SessionEdits.swaps) and trained on in the latest completed
//     session of that label takes the substitute;
//   - a slot skipped in every completed, logged session of that label (at least
//     CONSISTENT_SKIP_MIN of them) takes the first inventory-fitting alternative for the same
//     slot (sessionEdits.ts swapAlternatives: the template's own peers first);
//   - every change passes the weekly volume guard (no muscle pushed above the template's band
//     top or EVIDENCE_CEILING_SETS, no in-band muscle pushed below the band bottom);
//   - with low adherence (completed < LOW_ADHERENCE_FRACTION of the pro-rated expected sessions
//     over the ended cycle) nothing changes: the next cycle repeats the exercises.
//
// Progression state is carried by IDENTITY: a kept or adopted exercise keeps its exerciseId and
// its prescription, and progression.ts reads the logged history by exerciseId at session start,
// so the working load and the met/unmet top of range continue across the boundary unchanged.
//
// Ids: no stored session id ever changes. Sessions behind the cursor, or named by any
// assignment row or logged set, are frozen; only cycles nobody has touched are rewritten, and
// they keep their ids, ordinals and positions. Appended sessions get fresh ids.
//
// Pure: AppState in, AppState out, the argument returned by identity when nothing changes. No
// clock; ids from newId() only for appended sessions.

import { CALENDAR_DAYS } from '../../config/export';
import { SCHEDULE_HORIZON_DAYS } from '../../config/reminders';
import { addDays, compareLocalDate, weekEnd, weekStart } from '../dates';
import { newId } from '../ids';
import { MAX_BLOCKS, MAX_PLAN_SESSIONS, MAX_PLAN_WEEKS } from '../limits';
import { expectedSessions } from '../schedule/quota';
import { programmeWeekOf } from '../schedule/rotation';
import { substitutePlanned, swapAlternatives } from '../training/sessionEdits';
import type {
  AppState,
  Exercise,
  LocalDate,
  LoggedSet,
  PlanBlock,
  PlannedExercise,
  PlannedSession,
  PlanTemplate,
  SessionAssignment,
} from '../types';
import { BLOCK_WEEKS, buildBlocks, CARDIO_EXERCISE_IDS, PLAN_WEEKS_MIN } from './generator';
import { inventoryOf } from './inventory';
import { EXERCISES, INDIRECT_SET_FRACTION } from './library';
import { EVIDENCE_CEILING_SETS, SPLIT_TEMPLATES, WEEKLY_SET_BAND } from './templates';

/**
 * [sessions] Sessions kept materialised ahead of the cursor. Derived from the two forward windows
 * (the .ics CALENDAR_DAYS = 28 d, the reminder SCHEDULE_HORIZON_DAYS = 21 d), never restated:
 * the projection places at most one session per civil date (calendar.ts: one row per date), so N
 * sessions ahead cover at least N calendar days whatever the slot density.
 */
export const RUNWAY_SESSIONS = Math.max(CALENDAR_DAYS, SCHEDULE_HORIZON_DAYS);

/**
 * [weeks] How deep a new programme is materialised at setup or restart. A materialisation choice,
 * not a prediction (the runway extends it): the generator's own minimum, a whole number of
 * BLOCK_WEEKS cycles (engine.test.ts asserts it) so the first programme ends on a deload.
 */
export const INITIAL_WEEKS = PLAN_WEEKS_MIN;

/**
 * Dimensionless. PRODUCT RULE, NOT EVIDENCE (lead ruling, owner may tune): below half the
 * pro-rated expected sessions over the ended cycle, the next cycle keeps its exercises. Too few
 * sessions were trained for a swap or a skip pattern to say anything.
 */
export const LOW_ADHERENCE_FRACTION = 0.5;

/**
 * [sessions] PRODUCT RULE, NOT EVIDENCE: a slot counts as "consistently skipped" only when it was
 * skipped in every completed, logged session of its label in the ended cycle, and there were at
 * least this many. One skip is a bad day, not a pattern.
 */
export const CONSISTENT_SKIP_MIN = 2;

/** A cycle: the half-open session range [start, end) of one normal block and its deload. */
export interface Cycle {
  start: number; // [sessions] offset, inclusive
  end: number; // [sessions] offset, exclusive
}

/**
 * The plan's cycles, in order, covering every session. A normal block opens a cycle and the
 * deload that follows closes it; a normal block with no deload after it (the short trailing
 * block of an older fixed-length plan) is a cycle of its own. A plan with no blocks is one cycle;
 * sessions no block covers form a final cycle.
 */
export function cyclesOf(plan: Pick<PlanTemplate, 'blocks' | 'sessions'>): Cycle[] {
  const n = plan.sessions.length; // [sessions]
  if (n === 0) return [];
  const blocks = [...plan.blocks].sort((a, b) => a.firstSessionIndex - b.firstSessionIndex);
  const out: Cycle[] = [];
  let open: Cycle | null = null;
  for (const b of blocks) {
    const end = Math.min(n, b.firstSessionIndex + b.sessionCount);
    if (end <= b.firstSessionIndex) continue;
    if (b.isDeload && open !== null) {
      open.end = end;
      out.push(open);
      open = null;
      continue;
    }
    if (open !== null) out.push(open);
    open = { start: b.firstSessionIndex, end };
    if (b.isDeload) {
      out.push(open);
      open = null;
    }
  }
  if (open !== null) out.push(open);
  const last = out.at(-1)?.end ?? 0;
  if (out.length === 0) return [{ start: 0, end: n }];
  if (last < n) out.push({ start: last, end: n });
  return out;
}

/** Weekly fractional volume of one week of sessions, per muscle. */
interface WeekVolume {
  mid: Record<string, number>; // [sets/muscle/week] interval midpoints (the band statistic)
  top: Record<string, number>; // [sets/muscle/week] interval tops (the ceiling statistic)
}

/** Same counting rule as generator.ts weeklySetsByMuscle and templates.ts resolveWeek. */
function weekVolume(week: readonly (readonly PlannedExercise[])[], byId: ReadonlyMap<string, Exercise>): WeekVolume {
  const mid: Record<string, number> = {};
  const top: Record<string, number> = {};
  for (const session of week) {
    for (const pe of session) {
      const ex = byId.get(pe.exerciseId);
      if (ex === undefined) continue;
      const m1 = (pe.setsLo + pe.setsHi) / 2; // [sets]
      const t1 = pe.setsHi; // [sets]
      for (const m of ex.muscleGroups) {
        mid[m] = (mid[m] ?? 0) + m1;
        top[m] = (top[m] ?? 0) + t1;
      }
      for (const m of ex.secondaryMuscles) {
        mid[m] = (mid[m] ?? 0) + m1 * INDIRECT_SET_FRACTION;
        top[m] = (top[m] ?? 0) + t1 * INDIRECT_SET_FRACTION;
      }
    }
  }
  return { mid, top };
}

/** [sets/muscle/week] The template band for a day count; open for a count no template covers. */
export function bandForWeek(sessionsPerWeek: number): readonly [number, number] {
  const band = (WEEKLY_SET_BAND as Record<number, readonly [number, number] | undefined>)[sessionsPerWeek];
  return band ?? [0, Number.POSITIVE_INFINITY];
}

/**
 * VOLUME GUARD. A change from `before` to `after` is accepted only if, for every muscle: the
 * midpoint stays at or below the band top (or does not rise, for a muscle already above it); the
 * interval top stays at or below EVIDENCE_CEILING_SETS (or does not rise); and a muscle at or
 * above the band bottom stays there. No new coefficient: the band and the ceiling are the
 * template's (templates.ts WEEKLY_SET_BAND, EVIDENCE_CEILING_SETS).
 */
export function volumeAllows(
  before: WeekVolume,
  after: WeekVolume,
  band: readonly [number, number],
): boolean {
  const muscles = new Set([...Object.keys(before.mid), ...Object.keys(after.mid)]);
  for (const m of muscles) {
    const b = before.mid[m] ?? 0; // [sets/muscle/week]
    const a = after.mid[m] ?? 0; // [sets/muscle/week]
    if (a > Math.max(band[1], b)) return false;
    if ((after.top[m] ?? 0) > Math.max(EVIDENCE_CEILING_SETS, before.top[m] ?? 0)) return false;
    if (b >= band[0] && a < band[0]) return false;
  }
  return true;
}

/** One decision the engine took for the next cycle, for tests and the design record. */
export interface EngineChange {
  kind: 'adopt-swap' | 'replace-skipped';
  label: string;
  from: string; // exerciseId replaced
  to: string; // exerciseId now planned
}

export interface DerivedWeek {
  /** One week of sessions in canonical order: label, kind and exercises. */
  week: { label: string; kind: PlannedSession['kind']; exercises: PlannedExercise[] }[];
  changes: EngineChange[];
  /** True when the ended cycle's adherence was low, so nothing was changed. */
  lowAdherence: boolean;
}

/**
 * The base week: the last `spw` sessions before `endIndex`, reordered into the split template's
 * label order when the week holds exactly the template's labels (assignToday swaps can permute a
 * week; the next cycle starts canonical again), else as stored.
 */
function baseWeek(plan: PlanTemplate, endIndex: number): PlannedSession[] {
  const spw = plan.sessionsPerWeek; // [sessions/week]
  const from = Math.max(0, endIndex - spw);
  const week = plan.sessions.slice(from, endIndex);
  const template = (SPLIT_TEMPLATES as Record<number, (typeof SPLIT_TEMPLATES)[2] | undefined>)[spw];
  if (template === undefined) return week;
  const labels = template.sessions.map((s) => s.label);
  const have = week.map((s) => s.label);
  if (have.length !== labels.length || [...have].sort().join('\n') !== [...labels].sort().join('\n')) {
    return week;
  }
  return labels.map((l) => week.find((s) => s.label === l) ?? week[0]).filter((s): s is PlannedSession => s !== undefined);
}

interface EngineContext {
  plan: PlanTemplate;
  rows: readonly SessionAssignment[];
  setsByDate: ReadonlyMap<LocalDate, readonly LoggedSet[]>;
  library: readonly Exercise[];
  byId: ReadonlyMap<string, Exercise>;
  state: AppState;
  profileId: string;
}

/** Non-bonus sets of `exerciseId` logged on `date`. */
function logged(ctx: EngineContext, date: LocalDate, exerciseId: string): boolean {
  return (ctx.setsByDate.get(date) ?? []).some((s) => !s.isBonus && s.exerciseId === exerciseId);
}

/**
 * Adherence over the ended cycle: completed rows against the pro-rated expected sessions
 * (quota.ts expectedSessions, the one quota the forecast and the weekly grade share) of the ISO
 * weeks its rows span. No row at all is no evidence, so it reads as low.
 */
export function cycleAdherenceLow(state: AppState, profileId: string, rows: readonly SessionAssignment[]): boolean {
  if (rows.length === 0) return true;
  const dates = rows.map((r) => r.date).sort(compareLocalDate);
  const first = dates[0];
  const last = dates.at(-1);
  if (first === undefined || last === undefined) return true;
  let expected = 0; // [sessions]
  for (let monday = weekStart(first); compareLocalDate(monday, last) <= 0; monday = addDays(monday, 7)) {
    expected += expectedSessions(state, profileId, monday, weekEnd(monday));
  }
  const completed = rows.filter((r) => r.status === 'completed').length; // [sessions]
  return completed < LOW_ADHERENCE_FRACTION * expected;
}

/**
 * The next cycle's week, from the cycle that ended (`evidence`) and the content before
 * `baseEnd`. With no evidence the base week is returned unchanged.
 */
export function deriveWeek(ctx: EngineContext, evidence: Cycle | null, baseEnd: number): DerivedWeek {
  const base = baseWeek(ctx.plan, baseEnd);
  const week = base.map((s) => ({ label: s.label, kind: s.kind, exercises: s.exercises.map((e) => ({ ...e })) }));
  if (evidence === null) return { week, changes: [], lowAdherence: false };

  const inCycle = new Map<string, PlannedSession>();
  for (const s of ctx.plan.sessions.slice(evidence.start, evidence.end)) inCycle.set(s.id, s);
  const rows = ctx.rows.filter((r) => inCycle.has(r.sessionId));
  if (cycleAdherenceLow(ctx.state, ctx.profileId, rows)) return { week, changes: [], lowAdherence: true };

  const profile = ctx.state.profiles[ctx.profileId];
  if (profile === undefined) return { week, changes: [], lowAdherence: false };
  const inventory = inventoryOf(profile);
  const band = bandForWeek(ctx.plan.sessionsPerWeek);
  const changes: EngineChange[] = [];
  const completed = rows
    .filter((r) => r.status === 'completed')
    .sort((a, b) => compareLocalDate(a.date, b.date));

  const tryChange = (si: number, ei: number, next: PlannedExercise): boolean => {
    const session = week[si];
    if (session === undefined) return false;
    const before = weekVolume(week.map((s) => s.exercises), ctx.byId);
    const trial = week.map((s, i) =>
      i === si ? s.exercises.map((e, j) => (j === ei ? next : e)) : s.exercises,
    );
    if (!volumeAllows(before, weekVolume(trial, ctx.byId), band)) return false;
    session.exercises = trial[si] ?? session.exercises;
    return true;
  };

  week.forEach((session, si) => {
    const ofLabel = completed.filter((r) => inCycle.get(r.sessionId)?.label === session.label);
    session.exercises.forEach((planned, ei) => {
      const key = planned.exerciseId;
      if (CARDIO_EXERCISE_IDS.includes(key)) return;
      const withKey = ofLabel.filter((r) =>
        (inCycle.get(r.sessionId)?.exercises ?? []).some((e) => e.exerciseId === key),
      );
      const inUse = new Set(session.exercises.map((e) => e.exerciseId));

      // 1. Swap adoption: the latest completed occurrence decides.
      const latest = withKey.at(-1);
      const sub = latest?.edits?.swaps[key];
      if (latest !== undefined && sub !== undefined && !inUse.has(sub) && logged(ctx, latest.date, sub)) {
        const ex = ctx.byId.get(sub);
        if (ex !== undefined && tryChange(si, ei, substitutePlanned(planned, ex))) {
          changes.push({ kind: 'adopt-swap', label: session.label, from: key, to: sub });
          return;
        }
      }

      // 2. Consistent skip: every completed session of the label that logged anything skipped it.
      const evidenceRows = withKey.filter((r) => (ctx.setsByDate.get(r.date) ?? []).length > 0);
      if (evidenceRows.length < CONSISTENT_SKIP_MIN) return;
      const skippedEvery = evidenceRows.every((r) => {
        if (r.edits?.skipped.includes(key) === true) return true;
        const swappedTo = r.edits?.swaps[key];
        return !logged(ctx, r.date, key) && (swappedTo === undefined || !logged(ctx, r.date, swappedTo));
      });
      if (!skippedEvery) return;
      const original = ctx.byId.get(key);
      if (original === undefined) return;
      const { suggested } = swapAlternatives({
        original,
        access: profile.equipment,
        inventory,
        library: ctx.library,
        inUse,
      });
      for (const alt of suggested) {
        if (alt.id === key || CARDIO_EXERCISE_IDS.includes(alt.id)) continue;
        if (tryChange(si, ei, substitutePlanned(planned, alt))) {
          changes.push({ kind: 'replace-skipped', label: session.label, from: key, to: alt.id });
          return;
        }
      }
    });
  });
  return { week, changes, lowAdherence: false };
}

/**
 * A plan name without the fixed length older builds wrote into it: "Full body x3, 12 weeks, fat
 * loss" -> "Full body x3, fat loss". Any other name is returned unchanged.
 */
export function withoutLength(name: string): string {
  return name.replace(/, \d+ weeks,/, ',');
}

/** Field-by-field equality of two exercise lists (stored key order differs from built order). */
function sameExercises(a: readonly PlannedExercise[], b: readonly PlannedExercise[]): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => {
      const y = b[i];
      return (
        y !== undefined &&
        x.exerciseId === y.exerciseId &&
        x.setsLo === y.setsLo &&
        x.setsHi === y.setsHi &&
        x.restS === y.restS &&
        JSON.stringify(Object.entries(x.prescription).sort()) ===
          JSON.stringify(Object.entries(y.prescription).sort())
      );
    })
  );
}

/** The session ids nothing may rewrite: named by a row or a logged set of this profile. */
function touchedSessionIds(state: AppState, profileId: string): Set<string> {
  const ids = new Set<string>();
  for (const a of state.assignments[profileId] ?? []) ids.add(a.sessionId);
  for (const s of Object.values(state.sets)) if (s.profileId === profileId) ids.add(s.sessionId);
  return ids;
}

/** The engine's view of one profile's documents. */
function contextFor(state: AppState, profileId: string, plan: PlanTemplate): EngineContext {
  const setsByDate = new Map<LocalDate, LoggedSet[]>();
  for (const s of Object.values(state.sets)) {
    if (s.profileId !== profileId) continue;
    const list = setsByDate.get(s.assignmentDate);
    if (list === undefined) setsByDate.set(s.assignmentDate, [s]);
    else list.push(s);
  }
  const library = [...EXERCISES, ...(state.customExercises[profileId] ?? [])];
  return {
    plan,
    rows: state.assignments[profileId] ?? [],
    setsByDate,
    library,
    byId: new Map(library.map((e) => [e.id, e])),
    state,
    profileId,
  };
}

/** Can one more cycle of `count` sessions and two blocks be appended inside the ceilings? */
function fitsCeilings(plan: PlanTemplate, count: number, blocksAdded: number): boolean {
  const length = plan.sessions.length + count; // [sessions]
  const weeks = Math.ceil(length / plan.sessionsPerWeek); // [weeks]
  const lastIndex = plan.blocks.reduce((m, b) => Math.max(m, b.index), -1) + blocksAdded;
  return length <= MAX_PLAN_SESSIONS && weeks <= MAX_PLAN_WEEKS && lastIndex <= MAX_BLOCKS;
}

/**
 * Keep the runway and the next cycle's content (see the header).
 *
 * 1. The latest cycle wholly behind the cursor is the evidence. Every later cycle that no row and
 *    no set names, and that starts at or after the cursor, is rewritten in place from it (ids,
 *    ordinals and positions kept).
 * 2. While fewer than RUNWAY_SESSIONS sessions lie ahead of the cursor, one cycle of BLOCK_WEEKS
 *    weeks is appended: the plan's last week repeated (it already carries the latest evidence),
 *    with fresh ids, ordinals continued and buildBlocks' 3 + 1 layout offset onto the end.
 *    A finished cursor is revived (completedOn cleared, its index unchanged). Appending stops at
 *    the plan ceilings (limits.ts); a plan there finishes exactly as before.
 *
 * Returns `state` itself when nothing changed.
 */
export function ensureRunway(state: AppState, profileId: string): AppState {
  const cursor = state.cursors[profileId];
  if (cursor === undefined) return state;
  const stored = state.plans[cursor.planId];
  if (stored === undefined) return state;
  const spw = stored.sessionsPerWeek; // [sessions/week]
  if (!Number.isInteger(spw) || spw < 1 || stored.sessions.length === 0) return state;

  const ctx = contextFor(state, profileId, stored);
  let sessions = stored.sessions;
  let blocks = stored.blocks;

  // 1. Rewrite the untouched future from the latest ended cycle.
  const cycles = cyclesOf(stored);
  const at = cursor.nextSessionIndex; // [sessions] offset
  const evidence = [...cycles].reverse().find((c) => c.end <= at) ?? null;
  if (evidence !== null) {
    const touched = touchedSessionIds(state, profileId);
    let first = cycles.length; // index into cycles of the first rewritable cycle
    for (let i = cycles.length - 1; i >= 0; i -= 1) {
      const c = cycles[i];
      if (c === undefined || c.start < at || c.start < evidence.end) break;
      if (stored.sessions.slice(c.start, c.end).some((s) => touched.has(s.id))) break;
      first = i;
    }
    const firstCycle = cycles[first];
    if (firstCycle !== undefined) {
      const derived = deriveWeek(ctx, evidence, firstCycle.start);
      let changed = false;
      const next = sessions.map((s, idx) => {
        if (idx < firstCycle.start) return s;
        const cycle = cycles.find((c) => idx >= c.start && idx < c.end) ?? firstCycle;
        const slot = derived.week[(idx - cycle.start) % derived.week.length];
        if (slot === undefined) return s;
        if (slot.label === s.label && slot.kind === s.kind && sameExercises(slot.exercises, s.exercises)) return s;
        changed = true;
        return {
          ...s,
          name: `Week ${String(programmeWeekOf(stored, idx))} ${slot.label}`,
          kind: slot.kind,
          label: slot.label,
          exercises: slot.exercises.map((e) => ({ ...e })),
        };
      });
      if (changed) sessions = next;
    }
  }

  // 2. Extend.
  const plan0: PlanTemplate = { ...stored, sessions, blocks };
  let plan = plan0;
  const perCycle = BLOCK_WEEKS * spw; // [sessions]
  const cycleBlocks = buildBlocks(spw, BLOCK_WEEKS);
  while (plan.sessions.length - at < RUNWAY_SESSIONS && fitsCeilings(plan, perCycle, cycleBlocks.length)) {
    // The appended cycle carries the latest evidence too: a finished programme revived on launch
    // has no untouched cycle for step 1 to rewrite, so its first new cycle is derived here.
    // Re-deriving a tail step 1 already derived changes nothing (the adopted and replaced keys
    // are no longer in it), so this is the same content in every other case.
    const week =
      evidence === null
        ? baseWeek(plan, plan.sessions.length)
        : deriveWeek({ ...ctx, plan }, evidence, plan.sessions.length).week;
    if (week.length === 0) break;
    const offset = plan.sessions.length; // [sessions]
    const appended: PlannedSession[] = [];
    for (let i = 0; i < perCycle; i += 1) {
      const src = week[i % week.length];
      if (src === undefined) break;
      const idx = offset + i;
      appended.push({
        id: newId(),
        ordinal: idx + 1, // types.ts invariant: sessions[i].ordinal === i + 1
        name: `Week ${String(programmeWeekOf(plan, idx))} ${src.label}`,
        kind: src.kind,
        label: src.label,
        exercises: src.exercises.map((e) => ({ ...e })),
      });
    }
    const nextIndex = plan.blocks.reduce((m, b) => Math.max(m, b.index), -1) + 1;
    const added: PlanBlock[] = cycleBlocks.map((b, j) => ({
      ...b,
      index: nextIndex + j,
      firstSessionIndex: b.firstSessionIndex + offset, // [sessions]
    }));
    sessions = [...plan.sessions, ...appended];
    blocks = [...plan.blocks, ...added];
    plan = {
      ...plan,
      sessions,
      blocks,
      weeks: Math.ceil(sessions.length / spw), // [weeks] the span the list now fills
    };
  }

  if (plan.sessions === stored.sessions && plan.blocks === stored.blocks) return state;
  const extended = plan.sessions.length > stored.sessions.length;
  // A plan built before L6 names its length ("Upper / Lower x2, 12 weeks, fat loss"); once it has
  // grown past it the claim is false, so the length goes (copy contract R5 comma kept).
  const named = extended ? { ...plan, name: withoutLength(plan.name) } : plan;
  return {
    ...state,
    plans: { ...state.plans, [cursor.planId]: named },
    cursors:
      extended && cursor.completedOn !== null
        ? { ...state.cursors, [profileId]: { ...cursor, completedOn: null } }
        : state.cursors,
  };
}
