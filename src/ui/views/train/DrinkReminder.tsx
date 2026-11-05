// src/ui/views/train/DrinkReminder.tsx
//
// The in-session drink reminder (owner, 2026-11-05: "a reminder the way it was, like a button
// that appears below games. it doesn't have to log them"). ONE button, on the cadence
// hydrationCue sets (SESSION_CHECK_INTERVAL_MS, 20 min), worded by `advice.drinkToThirst` with no
// volume named (src/domain/training/hydration.ts header, Sawka 2007). A tap acknowledges it: the
// reminder hides until the next cadence mark and NO fluid record is written
// (drinkAcknowledgement.ts). It sits under the docked rest bar (RestTimerPanel), never in the
// exercise list.
import { useMemo, type ReactElement } from 'react';
import { HYDRATION_COPY_KEY, hydrationCue } from '../../../domain/training/hydration';
import type { EpochMs } from '../../../domain/types';
import { SkinLabel } from '../../../skins/limelight/Icon';
import { useAppStore } from '../../../store';
import { acknowledgeDrinkReminder, useDrinkAcknowledgedAt } from './drinkAcknowledgement';
import '../../styles/train.css';

export function DrinkReminder(props: { now: EpochMs /* [ms] epoch UTC, the caller's clock */ }): ReactElement | null {
  const { now } = props;
  const profileId = useAppStore((s) => s.activeProfileId) ?? '';
  // Audit G21: the records hydrationCue reads, each a stable reference, never the whole store.
  const profiles = useAppStore((s) => s.profiles);
  const assignments = useAppStore((s) => s.assignments);
  const hydration = useAppStore((s) => s.hydration);
  const bodyMass = useAppStore((s) => s.bodyMass);
  const records = useMemo(
    () => ({ profiles, assignments, hydration, bodyMass }),
    [profiles, assignments, hydration, bodyMass],
  );
  const acknowledgedAt = useDrinkAcknowledgedAt(profileId); // [ms] epoch UTC, 0 = none
  // A session is active while one of the profile's assignments is open (TrainView's own rule).
  const sessionActive = (assignments[profileId] ?? []).some((a) => a.status === 'in-progress');
  const cue = hydrationCue(records, profileId, now, sessionActive, acknowledgedAt);
  if (cue?.kind !== 'session-check') return null;

  return (
    <button
      type="button"
      className="drink-reminder"
      onClick={() => {
        acknowledgeDrinkReminder(profileId, Date.now()); // [ms] epoch UTC
      }}
    >
      <SkinLabel copyKey={HYDRATION_COPY_KEY['session-check']} />
    </button>
  );
}
