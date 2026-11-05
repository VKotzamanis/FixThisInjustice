// src/domain/activity.ts
//
// Audit G04 (AGENTS rule 2): the physical activity level (PAL, dimensionless) is ONE value. The
// stored `activityPal` is it; `activity` is the FAO/WHO/UNU 2004 band it falls in, written beside
// it by `withPal` and read by nothing that computes. A profile from before the nine-stop slider
// has no PAL and uses its band's printed floor, computeTargets' fallback since Brief G, so no
// stored number moves. No new coefficient: the stops and bands are nutrition.ts's.
import { ACTIVITY_BAND, ACTIVITY_FACTOR, ACTIVITY_STOPS } from './nutrition';
import type { ActivityLevel, Profile } from './types';

/** [PAL] The profile's activity value: the stored PAL, else its band's printed floor. */
export function palOf(profile: Pick<Profile, 'activity' | 'activityPal'>): number {
  return profile.activityPal ?? ACTIVITY_FACTOR[profile.activity];
}

/** The band a PAL belongs to: the stop table's own band, else the highest band whose floor it reaches. */
export function bandOfPal(pal: number): ActivityLevel {
  const stop = ACTIVITY_STOPS.find((s) => s.pal === pal);
  if (stop !== undefined) return stop.level;
  if (pal >= ACTIVITY_BAND.vigorous[0]) return 'vigorous';
  if (pal >= ACTIVITY_BAND.moderate[0]) return 'moderate';
  return 'sedentary';
}

/** The one write of the activity value: the PAL and its band, together. [PAL] */
export function withPal(pal: number): { activity: ActivityLevel; activityPal: number } {
  return { activityPal: pal, activity: bandOfPal(pal) };
}
