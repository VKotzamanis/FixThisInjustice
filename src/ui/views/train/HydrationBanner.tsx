// src/ui/views/train/HydrationBanner.tsx
//
// One hydration cue at a time, chosen by the domain (src/domain/training/hydration.ts) and
// rendered here. The domain returns a COPY KEY, never a sentence, so a skin can rewrite the
// wording without the cue logic knowing that copy exists.
//
// Content review sections 3 and 8: no fixed between-set volume is prescribed. The in-session
// cue names no amount at all ("Drink to thirst"), and the button's volume is the profile's own
// editable cup size, which is display granularity rather than a dose.
import { useEffect, useState, type ReactElement } from 'react';
import { FORMAT } from '../../../content/copy';
import { useCopy, useCopyOverrides } from '../../../content/useCopy';
import { HYDRATION_COPY_KEY, hydrationCue } from '../../../domain/training/hydration';
import type { LocalDate, Profile } from '../../../domain/types';
import { formatVolume } from '../../../domain/units';
import { useAppStore } from '../../../store';
import '../../styles/train.css';

/** [ms] The cue only changes on the minute scale, so it is re-evaluated on that scale. */
const REEVALUATE_MS = 60_000;

export function HydrationBanner(props: {
  profile: Profile;
  date: LocalDate;
  sessionActive: boolean;
}): ReactElement | null {
  const { profile, date, sessionActive } = props;
  /*
   * Read unconditionally, above the `cue === null` return below: a hook behind an early return
   * is a hook that stops being called when the cue clears, which is the rules-of-hooks defect.
   * One subscription per banner, and the banner is a singleton on this screen.
   */
  const c = useCopy();
  /*
   * The same skin's table, read beside the lookup and above the early return for the same
   * reason. The two frames this banner renders read a copy key since P8 close-out B
   * (`advice.beverageShortfall` and `button.logVolume`), so without the overlay the shortfall
   * sentence and the drink control were the only clinical strings on a skinned Train screen.
   */
  const overrides = useCopyOverrides();
  /*
   * The whole store snapshot, deliberately: hydrationCue reads profiles, assignments,
   * hydration and bodyMass, and the store keeps AppState at its top level, so the snapshot IS
   * an AppState. The no-selector form returns the store's own state object, which is
   * referentially stable between updates; a selector building `{ profiles, hydration, ... }`
   * would mint a new object on every notification and loop useSyncExternalStore.
   *
   * The cost is that this banner re-renders on any document change. It was NOT measured, and
   * is recorded as an open limitation in the P4 plan: if it shows up, split the cue into three
   * narrower selectors rather than memoising this one.
   */
  const state = useAppStore();
  const [now, setNow] = useState<number>(() => Date.now()); // [ms] epoch UTC

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now()); // [ms] epoch UTC
    }, REEVALUATE_MS);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  const cue = hydrationCue(state, profile.id, now, sessionActive);
  if (cue === null) return null;

  const targetML = profile.hydration.dailyTargetML; // [mL/day]
  const message =
    cue.kind === 'daily-shortfall'
      ? FORMAT.beverageShortfall(
          // Logged = target minus the shortfall the domain measured, so the sentence cannot
          // state a pair the cue did not compute. Floored at 0: a shortfall can never exceed
          // the target, and reporting a negative volume would be a defect wearing a number.
          formatVolume(Math.max(0, targetML - (cue.shortfallML ?? 0)), profile.units),
          formatVolume(targetML, profile.units),
          overrides,
        )
      : c(HYDRATION_COPY_KEY[cue.kind]);

  return (
    <div className="hydration-banner" role="status">
      <span>{message}</span>
      {cue.kind === 'post-session-weigh' ? (
        <details className="hydration-why">
          <summary>{c('disclosure.why')}</summary>
          <p>{c('why.postSessionMass')}</p>
        </details>
      ) : (
        <button
          type="button"
          onClick={() => {
            const at = Date.now(); // [ms] epoch UTC
            state.addHydration(profile.id, date, profile.hydration.cupSizeML, at); // [mL]
            // The mark restarts the cadence, so the cue is re-evaluated at once rather than
            // at the next minute boundary.
            setNow(at);
          }}
        >
          {FORMAT.logVolume(formatVolume(profile.hydration.cupSizeML, profile.units), overrides)}
        </button>
      )}
    </div>
  );
}
