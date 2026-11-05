// src/ui/views/train/HydrationBanner.tsx
//
// The post-session weigh-in cue, chosen by the domain (src/domain/training/hydration.ts) and
// rendered here. The domain returns a COPY KEY, never a sentence, so a skin can rewrite the
// wording without the cue logic knowing that copy exists.
//
// Only that cue: the in-session drink reminder is DrinkReminder (under the rest bar, owner
// 2026-11-05), and the daily-shortfall cue and the log-a-cup button are gone, because drinks are
// a reminder, not a log the day must fill.
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useCopy } from '../../../content/useCopy';
import { HYDRATION_COPY_KEY, hydrationCue } from '../../../domain/training/hydration';
import type { Profile } from '../../../domain/types';
import { SkinLabel } from '../../../skins/limelight/Icon';
import { useAppStore } from '../../../store';
import '../../styles/train.css';

/** [ms] The cue only changes on the minute scale, so it is re-evaluated on that scale. */
const REEVALUATE_MS = 60_000;

export function HydrationBanner(props: { profile: Profile }): ReactElement | null {
  const { profile } = props;
  /*
   * Read unconditionally, above the `cue === null` return below: a hook behind an early return
   * is a hook that stops being called when the cue clears, which is the rules-of-hooks defect.
   * One subscription per banner, and the banner is a singleton on this screen.
   */
  const c = useCopy();
  /*
   * Audit G21: the four records hydrationCue reads, each a stable reference, instead of the whole
   * store (which re-rendered this banner on every set logged). Combined in a memo so the
   * snapshot never changes identity between unrelated updates.
   */
  const profiles = useAppStore((s) => s.profiles);
  const assignments = useAppStore((s) => s.assignments);
  const hydration = useAppStore((s) => s.hydration);
  const bodyMass = useAppStore((s) => s.bodyMass);
  const records = useMemo(
    () => ({ profiles, assignments, hydration, bodyMass }),
    [profiles, assignments, hydration, bodyMass],
  );
  const [now, setNow] = useState<number>(() => Date.now()); // [ms] epoch UTC

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now()); // [ms] epoch UTC
    }, REEVALUATE_MS);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  // sessionActive false: the in-session cadence is DrinkReminder's, so only the weigh-in remains.
  const cue = hydrationCue(records, profile.id, now, false);
  if (cue?.kind !== 'post-session-weigh') return null;

  return (
    <div className="hydration-banner" role="status">
      <span>
        <SkinLabel copyKey={HYDRATION_COPY_KEY[cue.kind]} />
      </span>
      <details className="hydration-why">
        <summary>{c('disclosure.why')}</summary>
        <p>{c('why.postSessionMass')}</p>
      </details>
    </div>
  );
}
