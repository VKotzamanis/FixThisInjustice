// src/ui/views/todayHero.ts
//
// What the Today hero is showing, and which of her sheets (if any) stands beside it.
//
// Stylize survey 2026-10-18, item 5, approved by the owner: every daily state gets a face,
// except where a picture would comment on the user. The faces were the round-three blob until the
// owner's request of 2026-10-18 ("Make her replace every pink sprite"); each blob pose is now her
// sheet of the same name (src/ui/components/herSheets.ts):
//
//   planned (not started)  her-lifting
//   in progress            her-lifting
//   completed              her-resting
//   rest day               her-resting
//   programme complete     her-crown
//   skipped, paused        no picture        a skip or a pause may be illness
//   a missed week shown    no picture        Intervention.tsx's veto: no mascot beside a
//                                             missed week, in any pose
//
// A flopped pose is excluded by TYPE: HeroPose is an allowlist of three sheets, so a sheet added
// to herSheets.ts later cannot reach Today without first changing this file's types.

import type { SpriteScale } from '../components/SpriteSheet';
import type { HerSheetName } from '../components/herSheets';

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

/** The sheets a hero may show: lifting, resting, the crown. Nothing else, by type. */
export type HeroPose = Extract<HerSheetName, 'her-lifting' | 'her-resting' | 'her-crown'>;

/**
 * [CSS px per source px] Her 64 px frames at 1x: 64 CSS px in every state, at every width.
 *
 * The blob drew at 56 px (planned) and 72 px, capped at 56 px on a phone so the heading kept the
 * room. A whole-number scale allows 64 or 128 only; 64 is the nearer to every one of those sizes
 * and keeps the phone rule. 128 would more than double the picture on a phone and push the
 * session list down.
 */
export const HERO_SCALE: SpriteScale = 1;

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

/** A Record, so a hero state without a decision here fails the type check. */
const HERO_POSE: Readonly<Record<HeroState, HeroPose | null>> = {
  planned: 'her-lifting',
  'in-progress': 'her-lifting',
  completed: 'her-resting',
  rest: 'her-resting',
  'programme-complete': 'her-crown',
  skipped: null,
  paused: null,
};

/**
 * Her sheet beside the hero, or null for no picture.
 *
 * @param state the hero branch on screen
 * @param weekMissed a missed week is on Today (its popup still owed, or its intervention block);
 *   it outranks every state, because the picture would sit on the same screen as the verdict
 */
export function heroPose(state: HeroState, weekMissed: boolean): HeroPose | null {
  return weekMissed ? null : HERO_POSE[state];
}
