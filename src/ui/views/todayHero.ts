// src/ui/views/todayHero.ts
//
// What the Today hero is showing, and which mascot pose (if any) stands beside it.
//
// Stylize survey 2026-10-18, item 5, approved by the owner: every daily state gets a face from
// the round-three art that already ships (src/skins/limelight/illustrations.ts), except where a
// picture would comment on the user:
//
//   planned (not started)  lifting, 56 px    round three's original spot for it (asset
//                                             manifest section 0.3); smaller because the
//                                             session list sits under it
//   in progress            lifting, 72 px    (placed 2026-09-06, unchanged)
//   completed              resting, 72 px
//   rest day               resting, 72 px
//   programme complete     crown, 72 px
//   skipped, paused        no picture        a skip or a pause may be illness
//   a missed week shown    no picture        Intervention.tsx's veto: no mascot beside a
//                                             missed week, in any pose
//
// The flopped mascot is excluded by TYPE: HeroPose cannot name it, so no edit to the table can
// put it on Today without first changing this file's types.

import type { LimelightIllustrationName } from '../../skins/limelight/illustrations';

/** Every display status one civil day can have, in the hero's precedence (TodayView.tsx). */
export const DAY_STATUSES = [
  'in-progress',
  'paused',
  'completed',
  'skipped',
  'planned',
  'rest',
] as const;

export type DayStatus = (typeof DAY_STATUSES)[number];

/** The hero branches TodayView renders once a plan exists. */
export const HERO_STATES = [...DAY_STATUSES, 'programme-complete'] as const;

export type HeroState = (typeof HERO_STATES)[number];

export interface HeroPose {
  name: Exclude<LimelightIllustrationName, 'mascotFlop'>;
  /** [CSS px] Drawn width and height. limelight.css caps every mascot at 56 px on a phone. */
  size: number;
}

/**
 * The hero branch for today's status.
 *
 * TodayView tests a served or closed day before it tests the finished programme, so `finished`
 * changes only a day with nothing on it: a REST day on a finished plan is "programme complete".
 *
 * @param status today's DayStatus
 * @param finished the cursor has a completedOn date
 */
export function heroStateOf(status: DayStatus, finished: boolean): HeroState {
  return status === 'rest' && finished ? 'programme-complete' : status;
}

const LIFTING_PLANNED: HeroPose = { name: 'mascotLifting', size: 56 };
const LIFTING: HeroPose = { name: 'mascotLifting', size: 72 };
const RESTING: HeroPose = { name: 'mascotResting', size: 72 };
const CROWN: HeroPose = { name: 'mascotCrown', size: 72 };

/** A Record, so a hero state without a decision here fails the type check. */
const HERO_POSE: Readonly<Record<HeroState, HeroPose | null>> = {
  planned: LIFTING_PLANNED,
  'in-progress': LIFTING,
  completed: RESTING,
  rest: RESTING,
  'programme-complete': CROWN,
  skipped: null,
  paused: null,
};

/**
 * The pose beside the hero, or null for no picture.
 *
 * @param state the hero branch on screen
 * @param weekMissed a missed week is on Today (its popup still owed, or its intervention block);
 *   it outranks every state, because the picture would sit on the same screen as the verdict
 */
export function heroPose(state: HeroState, weekMissed: boolean): HeroPose | null {
  return weekMissed ? null : HERO_POSE[state];
}
