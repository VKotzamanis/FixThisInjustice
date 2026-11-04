// src/store/setup.ts
//
// Profile creation, availability and the setup wizard's confirm as pure transitions (spec R5,
// audit A01/A14). completeSetup is ONE write: profile, availability, plan, cursor, draft cleared.
import { AvailabilitySchema, PlanTemplateSchema, ProfileSchema } from '../domain/schema';
import { seedBeverageTargetML } from '../domain/nutrition';
import type { AppState, Availability, LocalDate, PlanTemplate, Profile } from '../domain/types';
import { applyReplacePlan } from './programme';
import { requireProfile } from './scheduleActions';
import { parseOrThrow } from './validate';

export interface SetupResult {
  profile: Profile;
  availability: Availability;
  plan: PlanTemplate;
  /** The civil date the programme starts on, in the profile's zone. */
  startedOn: LocalDate;
}

/**
 * Inserts the profile, seeds its per-profile log arrays, and makes it active when nothing else
 * is. Create, not upsert: a live id throws (a history must never move under another name). A
 * zero hydration target gets the IOM 2005 beverage seed for the stated sex (nutrition.ts).
 * Parsed with ProfileSchema after the seed, so what is stored is what the loader accepts.
 */
export function applyCreateProfile(s: AppState, p: Profile, action: string): AppState {
  if (s.profiles[p.id] !== undefined) {
    throw new Error(`${action}: "${p.id}" already exists`);
  }
  const seeded: Profile =
    p.hydration.dailyTargetML > 0
      ? p
      : { ...p, hydration: { ...p.hydration, dailyTargetML: seedBeverageTargetML(p.body.sex) } }; // [mL/day]
  const stored = parseOrThrow(ProfileSchema, seeded, action);
  return {
    ...s,
    profiles: { ...s.profiles, [stored.id]: stored },
    activeProfileId: s.activeProfileId ?? stored.id,
    // The six array-valued per-profile logs; `?? []` never erases a history.
    pauses: { ...s.pauses, [stored.id]: s.pauses[stored.id] ?? [] },
    assignments: { ...s.assignments, [stored.id]: s.assignments[stored.id] ?? [] },
    bodyMass: { ...s.bodyMass, [stored.id]: s.bodyMass[stored.id] ?? [] },
    hydration: { ...s.hydration, [stored.id]: s.hydration[stored.id] ?? [] },
    intake: { ...s.intake, [stored.id]: s.intake[stored.id] ?? [] },
    weeklyReviews: { ...s.weeklyReviews, [stored.id]: s.weeklyReviews[stored.id] ?? [] },
  };
}

/** Stores the weekday slots and weekly target, parsed with AvailabilitySchema. */
export function applySetAvailability(
  s: AppState,
  profileId: string,
  a: Availability,
  action: string,
): AppState {
  requireProfile(s, action, profileId);
  const stored = parseOrThrow(AvailabilitySchema, a, action);
  return { ...s, availability: { ...s.availability, [profileId]: stored } };
}

/** Spec R5: the wizard's confirm as one transition. Throws, writing nothing, on any refusal. */
export function applyCompleteSetup(s: AppState, result: SetupResult, planId: string): AppState {
  const action = 'completeSetup';
  const plan = parseOrThrow(PlanTemplateSchema, result.plan, action);
  const withProfile = applyCreateProfile(s, result.profile, action);
  const withAvailability = applySetAvailability(withProfile, result.profile.id, result.availability, action);
  const planned = applyReplacePlan(withAvailability, action, result.profile.id, plan, planId, result.startedOn);
  return { ...planned, setupDraft: null };
}
