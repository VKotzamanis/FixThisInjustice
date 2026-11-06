// src/ui/views/train/DrinkReminder.tsx
//
// The in-session drink reminder (owner, 2026-11-05: "a reminder the way it was, like a button
// that appears below games. it doesn't have to log them"). ONE button, on the cadence
// hydrationCue sets (SESSION_CHECK_INTERVAL_MS, 20 min), worded by `advice.drinkToThirst` with no
// volume named (src/domain/training/hydration.ts header, Sawka 2007). A tap acknowledges it: the
// reminder hides until the next cadence mark and NO fluid record is written
// (drinkAcknowledgement.ts). Two places, never the exercise list:
//  - DrinkReminder: under the docked rest bar while no game sheet is open (RestTimerPanel);
//  - RestDrinkRow: the row directly below the game in the open sheet (lead ruling G2), always
//    present, so the game never moves when the reminder turns due.
import { useMemo, type ReactElement } from 'react';
import { FORMAT } from '../../../content/copy';
import { useCopyOverrides } from '../../../content/useCopy';
import { HYDRATION_COPY_KEY, hydrationCue, nextSessionCheckAt } from '../../../domain/training/hydration';
import type { EpochMs } from '../../../domain/types';
import { SkinLabel } from '../../../skins/limelight/Icon';
import { useAppStore } from '../../../store';
import { acknowledgeDrinkReminder, useDrinkAcknowledgedAt } from './drinkAcknowledgement';
import '../../styles/train.css';

const MS_PER_MIN = 60_000; // [ms/min]

interface DrinkReminderState {
  profileId: string;
  due: boolean;
  dueAt: EpochMs | null; // [ms] epoch UTC, null while no session is active
}

/** The cue for the active profile at `now` [ms] epoch UTC, from the one cadence definition. */
function useDrinkReminder(now: EpochMs): DrinkReminderState {
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
  const dueAt = nextSessionCheckAt(records, profileId, now, sessionActive, acknowledgedAt);
  return { profileId, due: cue?.kind === 'session-check', dueAt };
}

function ReminderButton(props: { profileId: string }): ReactElement {
  return (
    <button
      type="button"
      className="drink-reminder"
      onClick={() => {
        acknowledgeDrinkReminder(props.profileId, Date.now()); // [ms] epoch UTC
      }}
    >
      <SkinLabel copyKey={HYDRATION_COPY_KEY['session-check']} />
    </button>
  );
}

/** Under the docked rest bar: the button while due, nothing otherwise. */
export function DrinkReminder(props: { now: EpochMs /* [ms] epoch UTC, the caller's clock */ }): ReactElement | null {
  const { profileId, due } = useDrinkReminder(props.now);
  return due ? <ReminderButton profileId={profileId} /> : null;
}

/**
 * Below the game in the open sheet: one box of a fixed height (restGames.css) in two states, a
 * quiet line counting whole minutes to the reminder, or the button once it is due.
 */
export function RestDrinkRow(props: { now: EpochMs /* [ms] epoch UTC, the caller's clock */ }): ReactElement {
  const { now } = props;
  const overrides = useCopyOverrides();
  const { profileId, due, dueAt } = useDrinkReminder(now);
  // [min] rounded up, so "1 min" shows until the reminder is due, never "0 min".
  const minutes = dueAt === null ? null : Math.max(1, Math.ceil((dueAt - now) / MS_PER_MIN));
  return (
    <div className="rest-drink-row">
      {due ? (
        <ReminderButton profileId={profileId} />
      ) : (
        <p className="rest-drink-wait">{minutes === null ? '' : FORMAT.nextDrinkReminder(minutes, overrides)}</p>
      )}
    </div>
  );
}
