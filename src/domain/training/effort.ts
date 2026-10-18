// One-tap effort per logged set (ROADMAP L8), stored as an RPE in `LoggedSet.rpe`.
//
// The scale is the repetitions-in-reserve (RIR) RPE of Zourdos MC et al. (2016), J Strength
// Cond Res 30(1):267-275, DOI 10.1519/JSC.0000000000001049 (verified;
// docs/private/evidence/content-peer-review.md section 10, "Effort target"): RPE 10 = 0
// repetitions in reserve, RPE 9 = 1. Those two anchors are the only numbers progression.ts
// reads. The other two levels follow the same one-point-per-repetition scale and are the
// owner's labels (ROADMAP L8 brief): Solid = RPE 8 (2 in reserve), Easy = RPE 7 (3 or more in
// reserve, stored as 7). Labels are copy keys (`button.effort*`), never words here.

/** [RPE] dimensionless. Zourdos 2016: no repetition left in reserve. */
export const RPE_ZERO_RIR = 10;

/** [RPE] dimensionless. Zourdos 2016: exactly one repetition left in reserve. */
export const RPE_ONE_RIR = 9;

export type EffortLevel = 'easy' | 'solid' | 'hard' | 'max';

/** The order the set row offers them in: easiest first. */
export const EFFORT_LEVELS: readonly EffortLevel[] = ['easy', 'solid', 'hard', 'max'];

/**
 * [RPE] dimensionless, on the schema's half-point grid (`LoggedSetSchema.rpe`). Max and Hard are
 * the two cited anchors themselves, so the rule in progression.ts and the button that feeds it
 * cannot drift apart.
 */
export const EFFORT_RPE: Readonly<Record<EffortLevel, number>> = {
  easy: 7, // [RPE] 3 or more repetitions in reserve
  solid: 8, // [RPE] 2 in reserve
  hard: RPE_ONE_RIR, // [RPE] 1 in reserve
  max: RPE_ZERO_RIR, // [RPE] 0 in reserve
};

/**
 * The level a stored RPE was recorded as, or null when there is none: nothing recorded, or a
 * value no button writes (a half point or a 6 from an imported export). Such a value is kept as
 * stored and shown as a number, never relabelled to the nearest button.
 */
export function effortLevelOf(rpe: number | null): EffortLevel | null {
  if (rpe === null) return null;
  return EFFORT_LEVELS.find((level) => EFFORT_RPE[level] === rpe) ?? null;
}
