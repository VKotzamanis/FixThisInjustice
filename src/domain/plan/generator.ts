import { newId } from '../ids';
import type {
  Equipment,
  Exercise,
  Experience,
  GoalKind,
  PlanBlock,
  PlannedExercise,
  PlannedSession,
  PlanTemplate,
} from '../types';
import { INDIRECT_SET_FRACTION, MUSCLE_GROUPS } from './library';
import {
  prescriptionFor,
  resolveSlot,
  restSFor,
  SPLIT_TEMPLATES,
  WEEKLY_SET_BAND,
  type SessionsPerWeek,
  type SessionTemplate,
} from './templates';

/**
 * Plan generator: a split template plus a programme length becomes a calendar-free PlanTemplate.
 *
 * The generator invents no training variable. Split, slot order and set counts come from
 * templates.ts (content review section 7); rep ranges from prescriptionFor; rest intervals from
 * restSFor in library.ts (master plan section 6.3: one rest table for the whole app). What this
 * module adds is repetition across weeks, the block/deload layout, and the volume report.
 */

export const PLAN_WEEKS_MIN = 8; // [weeks]
export const PLAN_WEEKS_MAX = 24; // [weeks]
export const BLOCK_WEEKS = 4; // [weeks] per block cycle: three training weeks then one deload week

/**
 * Deload modifiers, dimensionless multipliers (1 = unchanged).
 *
 * A DELOAD CUTS VOLUME AND HOLDS LOAD. Bosquet L et al. (2007), Med Sci Sports Exerc
 * 39(8):1358-1365, DOI 10.1249/mss.0b013e31806010e0: the optimal taper decreases volume by
 * 41-60 % "without any modification of either training intensity or frequency". 0.5 sits inside
 * that band and loadModifier stays 1, which is the verbatim finding. The legacy rule ("reduce
 * weight by 40 %") is the reverse of the evidence and is not implemented (content review
 * section 2.2).
 *
 * The four-week CADENCE is a calendar backstop, NOT an evidence-based interval, and is labelled
 * a HEURISTIC for that reason. Bell L et al. (2023), Sports Med Open 9, DOI
 * 10.1186/s40798-023-00633-0: 100 % panel agreement that deload frequency "may depend on how
 * athlete responds" and that pre-planned deloads "might not be necessary". Coleman M et al.
 * (2024), PeerJ 12:e16777, DOI 10.7717/peerj.16777: a mid-programme deload produced no
 * hypertrophy benefit. The content review's recommendation is "autoregulate; keep a 4-8 week
 * calendar backstop"; four weeks is the lower edge of that backstop, chosen because this app
 * has no autoregulation signal to schedule from.
 */
export const DELOAD_SET_MODIFIER = 0.5;
const DELOAD_LOAD_MODIFIER = 1;

/** PlanTemplate.version: revision counter for the generated shape, dimensionless. */
const PLAN_VERSION = 1;

export interface PlanInput {
  sessionsPerWeek: SessionsPerWeek; // [sessions/week]
  weeks: number; // [weeks], whole, PLAN_WEEKS_MIN..PLAN_WEEKS_MAX
  /**
   * Affects the plan NAME only. The content review supplies no goal-stratified rep range or set
   * count, so goal drives energy and protein (src/domain/nutrition.ts) and nothing here.
   */
  goal: GoalKind;
  experience: Experience;
  equipment: Equipment;
  includeCardio: boolean;
}

/**
 * Goal wording for the plan name. Copy contract R5: the connector is a comma, never a dash; the
 * stored slug ("fat-loss") is an identifier and never reaches the user.
 */
const GOAL_LABEL: Record<GoalKind, string> = {
  'fat-loss': 'fat loss',
  'muscle-gain': 'muscle gain',
  recomposition: 'recomposition',
  maintenance: 'maintenance',
};

/**
 * Conditioning candidates, best first. The ergometers are full-gym only, so the walk is what a
 * dumbbells-only or bodyweight setting gets.
 */
const CARDIO_PREFERENCE = ['rower-intervals', 'stair-climber', 'walk'];

function buildSessionExercises(
  template: SessionTemplate,
  sets: { compound: { lo: number; hi: number }; isolation: { lo: number; hi: number } },
  equipment: Equipment,
): PlannedExercise[] {
  const used = new Set<string>();
  const planned: PlannedExercise[] = [];
  for (const slot of template.slots) {
    const ex = resolveSlot(slot, equipment, used);
    if (!ex) continue; // no candidate fits this equipment; the slot is dropped, not substituted
    used.add(ex.id);
    const prescription = prescriptionFor(ex, slot.intensity);
    const count = sets[slot.slotClass];
    planned.push({
      exerciseId: ex.id,
      setsLo: count.lo, // [sets]
      setsHi: count.hi, // [sets]
      prescription,
      restS: restSFor(ex, prescription), // [s]
    });
  }
  return planned;
}

/**
 * The conditioning entry appended to the last lifting session of each week when includeCardio is
 * set.
 *
 * THE CARDIO RULE, stated because the type system allows more than the templates use: a session
 * of `kind: "cardio"` is emitted only when a split template declares a conditioning session of
 * its own. None of the five templates in templates.ts does, so conditioning rides the last
 * lifting session of the week instead and the plan keeps exactly weeks x sessionsPerWeek
 * sessions, which is what the master plan section 7 gate counts. Adding a conditioning session
 * to a template is therefore the single edit that turns the cardio session on.
 */
function cardioExercise(
  equipment: Equipment,
  library: readonly Exercise[],
): PlannedExercise | null {
  for (const id of CARDIO_PREFERENCE) {
    const ex = library.find((e) => e.id === id);
    if (ex && ex.equipment.includes(equipment)) {
      const prescription = prescriptionFor(ex, 'light');
      return {
        exerciseId: ex.id,
        setsLo: 1, // [sets]: one continuous bout
        setsHi: 1, // [sets]
        prescription,
        restS: 0, // [s]: a single bout has no inter-set rest interval to prescribe
      };
    }
  }
  return null;
}

/**
 * Block layout. Each four-week cycle is emitted as TWO blocks, because PlanBlock carries one
 * modifier pair: a normal block of three training weeks (setModifier 1) followed by a one-week
 * deload block (setModifier DELOAD_SET_MODIFIER, loadModifier 1). A trailing stretch of fewer
 * than BLOCK_WEEKS weeks is emitted as one normal block and carries no deload, so a programme
 * never ends on a week of reduced volume it has no following week to benefit.
 */
function buildBlocks(sessionsPerWeek: number, weeks: number): PlanBlock[] {
  const blocks: PlanBlock[] = [];
  let week = 0; // [weeks] laid out so far
  let firstSessionIndex = 0; // [sessions] offset into PlanTemplate.sessions
  let index = 0;
  while (week < weeks) {
    const remaining = weeks - week; // [weeks]
    if (remaining >= BLOCK_WEEKS) {
      const trainingWeeks = BLOCK_WEEKS - 1; // [weeks]
      blocks.push({
        index: index++,
        firstSessionIndex,
        sessionCount: trainingWeeks * sessionsPerWeek, // [sessions]
        setModifier: 1,
        loadModifier: 1,
        isDeload: false,
      });
      firstSessionIndex += trainingWeeks * sessionsPerWeek;
      blocks.push({
        index: index++,
        firstSessionIndex,
        sessionCount: sessionsPerWeek, // [sessions] = one week
        setModifier: DELOAD_SET_MODIFIER,
        loadModifier: DELOAD_LOAD_MODIFIER,
        isDeload: true,
      });
      firstSessionIndex += sessionsPerWeek;
      week += BLOCK_WEEKS;
    } else {
      blocks.push({
        index: index++,
        firstSessionIndex,
        sessionCount: remaining * sessionsPerWeek, // [sessions]
        setModifier: 1,
        loadModifier: 1,
        isDeload: false,
      });
      firstSessionIndex += remaining * sessionsPerWeek;
      week += remaining;
    }
  }
  return blocks;
}

/**
 * SPLIT_TEMPLATES is keyed by SessionsPerWeek, so TypeScript types the lookup as always present.
 * generatePlan's runtime guard needs the possibly-undefined view to stay honest about an
 * out-of-range day count arriving from an untyped source, such as an imported document.
 */
type SplitTemplateOrMissing = (typeof SPLIT_TEMPLATES)[SessionsPerWeek] | undefined;

/**
 * Build a plan. Deterministic apart from the generated ids: the same input yields the same
 * sessions, prescriptions and blocks, so a plan can be regenerated and compared.
 *
 * @throws RangeError when `weeks` is not a whole number in [PLAN_WEEKS_MIN, PLAN_WEEKS_MAX], or
 * when no split template covers `sessionsPerWeek` (the type admits 2..6; a value from a runtime
 * source such as an import can be anything).
 */
export function generatePlan(input: PlanInput, library: readonly Exercise[]): PlanTemplate {
  if (
    !Number.isInteger(input.weeks) ||
    input.weeks < PLAN_WEEKS_MIN ||
    input.weeks > PLAN_WEEKS_MAX
  ) {
    throw new RangeError(
      `generatePlan: weeks must be a whole number in [${PLAN_WEEKS_MIN}, ${PLAN_WEEKS_MAX}]`,
    );
  }
  const template = SPLIT_TEMPLATES[input.sessionsPerWeek] as SplitTemplateOrMissing;
  if (!template) {
    throw new RangeError(`generatePlan: no split template for ${input.sessionsPerWeek} days/week`);
  }
  const sets = template.sets[input.experience];
  const cardio = input.includeCardio ? cardioExercise(input.equipment, library) : null;

  const sessions: PlannedSession[] = [];
  for (let week = 1; week <= input.weeks; week += 1) {
    template.sessions.forEach((sessionTemplate, i) => {
      const exercises = buildSessionExercises(sessionTemplate, sets, input.equipment);
      const isLastOfWeek = i === template.sessions.length - 1;
      if (cardio && isLastOfWeek) exercises.push(cardio);
      sessions.push({
        id: newId(),
        // types.ts invariant: plan.sessions[i].ordinal === i + 1.
        ordinal: sessions.length + 1,
        // Copy contract R2 (short) and R5 (no dash connector): "Week 12 Upper A".
        name: `Week ${week} ${sessionTemplate.label}`,
        kind: 'lift', // see the cardio rule on cardioExercise
        label: sessionTemplate.label,
        exercises,
      });
    });
  }

  return {
    id: newId(),
    version: PLAN_VERSION,
    // Copy contract R5: comma connectors, e.g. "Upper / Lower x2, 12 weeks, fat loss".
    name: `${template.name}, ${input.weeks} weeks, ${GOAL_LABEL[input.goal]}`,
    sessionsPerWeek: input.sessionsPerWeek, // [sessions/week]
    weeks: input.weeks, // [weeks]
    sessions,
    blocks: buildBlocks(input.sessionsPerWeek, input.weeks),
  };
}

/**
 * Weekly fractional sets per muscle for one week of sessions, in sets/muscle/week (dimensionless
 * counts, not a physical quantity).
 *
 * Counting rule, content review section 6 (Pelland JC et al. 2025, Sports Medicine 56(2):481-505,
 * DOI 10.1007/s40279-025-02344-w): a direct set counts 1.0 and an indirect set
 * INDIRECT_SET_FRACTION = 0.5. Each planned exercise contributes the MIDPOINT of its prescribed
 * set range, because that range is a double-progression device rather than two prescriptions;
 * templates.ts compares the same statistic against the section 7 band.
 *
 * Block modifiers are NOT applied: this is the prescribed volume of a normal training week, which
 * is what the band describes. A deload week's volume is that figure times the block's setModifier.
 */
export function weeklySetsByMuscle(
  sessions: readonly PlannedSession[],
  library: readonly Exercise[],
): Record<string, number> {
  const byId = new Map(library.map((e) => [e.id, e]));
  const totals: Record<string, number> = {};
  const add = (muscle: string, sets: number): void => {
    totals[muscle] = (totals[muscle] ?? 0) + sets;
  };
  for (const session of sessions) {
    for (const pe of session.exercises) {
      const ex = byId.get(pe.exerciseId);
      if (!ex) continue;
      const midSets = (pe.setsLo + pe.setsHi) / 2; // [sets]
      for (const m of ex.muscleGroups) add(m, midSets);
      for (const m of ex.secondaryMuscles) add(m, midSets * INDIRECT_SET_FRACTION);
    }
  }
  return totals;
}

export interface VolumeReport {
  band: readonly [number, number]; // sets/muscle/week, content review section 7
  perMuscle: Record<string, number>; // sets/muscle/week
  inBand: string[];
  maintenance: string[]; // below the band bottom; declared to the user, never hidden
  over: string[]; // above the band top
}

/**
 * The band for a day count, or an open band for a plan whose day count no template covers.
 * generatePlan cannot produce one; an imported plan can, and an open band reports it as such
 * rather than fabricating a range.
 */
function bandFor(sessionsPerWeek: number): readonly [number, number] {
  const band = (WEEKLY_SET_BAND as Record<number, readonly [number, number] | undefined>)[
    sessionsPerWeek
  ];
  return band ?? [0, Number.POSITIVE_INFINITY];
}

/**
 * The honest summary the wizard shows. With thirteen muscle groups and a band of, say, 12-16
 * sets each, no achievable session length puts every muscle in band; the content review
 * section 2.1 permits the alternative explicitly: state that the rest are maintenance-only.
 * Muscles are listed in MUSCLE_GROUPS order, which is anatomical rather than alphabetical.
 */
export function volumeReport(plan: PlanTemplate, library: readonly Exercise[]): VolumeReport {
  const sessionsPerWeek = plan.sessionsPerWeek; // [sessions/week]
  const band = bandFor(sessionsPerWeek);
  const perMuscle = weeklySetsByMuscle(plan.sessions.slice(0, sessionsPerWeek), library);
  const inBand: string[] = [];
  const maintenance: string[] = [];
  const over: string[] = [];
  for (const m of MUSCLE_GROUPS) {
    const sets = perMuscle[m] ?? 0; // sets/muscle/week
    if (sets > band[1]) over.push(m);
    else if (sets >= band[0]) inBand.push(m);
    else maintenance.push(m);
  }
  return { band, perMuscle, inBand, maintenance, over };
}
