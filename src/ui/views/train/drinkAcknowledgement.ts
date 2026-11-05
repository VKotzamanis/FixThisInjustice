// src/ui/views/train/drinkAcknowledgement.ts
//
// The last tap on the in-session drink reminder, per profile, held IN MEMORY only (owner,
// 2026-11-05: the drink button is "a reminder to drink to replenish the sweat", it "doesn't have
// to log them"). A tap writes no fluid record and no stored field, so no schema changes and no
// old document is touched (AGENTS rule 7). A reload forgets the tap: the reminder then follows
// the session start and any drink marks an older build logged, which is the safe direction
// (one reminder too many, never one missing).
import { useSyncExternalStore } from 'react';
import type { EpochMs } from '../../../domain/types';

const acknowledged = new Map<string, EpochMs>(); // profile id -> [ms] epoch UTC of the last tap
const listeners = new Set<() => void>();

/** Records a tap on the reminder at `at` [ms] epoch UTC; hydrationCue restarts its window there. */
export function acknowledgeDrinkReminder(profileId: string, at: EpochMs): void {
  acknowledged.set(profileId, at);
  for (const listener of listeners) listener();
}

/** [ms] epoch UTC of `profileId`'s last tap, 0 = none since the page loaded. */
export function useDrinkAcknowledgedAt(profileId: string): EpochMs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => acknowledged.get(profileId) ?? 0,
  );
}

/** Test seam: forget every tap. */
export function resetDrinkAcknowledgements(): void {
  acknowledged.clear();
  for (const listener of listeners) listener();
}
