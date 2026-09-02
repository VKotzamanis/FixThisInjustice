import { useEffect, useRef, type ReactElement } from 'react';
import { FORMAT } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import type { WeeklyReview } from '../../domain/types';
import { Icon } from '../../skins/limelight/Icon';
import { playSfx } from '../../skins/sfx';
import { usePendingMotivation } from '../../store/selectors';
import { weekDeltaKey } from '../format/weekDelta';
import './limelight.css';

/** Twelve, as round-three section 2.5 fixed it. The fan tracks are nth-child rules in the sheet. */
export const SPARKLE_COUNT = 12;

/**
 * Did this closed week meet its target?
 *
 * `delta = completed - target` [sessions/week] is STORED by src/domain/schedule/weekly.ts and is
 * read here, never recomputed. The `paused` guard is the load-bearing half: a week overlapped by
 * a PlanPause carries delta = 0 by construction, so a test on the sign alone would stamp "target
 * met" on a week the user deliberately paused and completed nothing in.
 */
export function metWeek(review: WeeklyReview | null): review is WeeklyReview {
  return review !== null && !review.paused && review.delta >= 0;
}

/**
 * The stamp that lands on the Today view when the week that has just closed met its target.
 *
 * THE WORD IS `status.weekMetStamp`, which shouts MOTHER on limelight (round three section 3.2)
 * and renders its own plain phrase on clinical and on the board, so the component holds no skin
 * branch: `useCopy()` resolves the row and `Icon` returns null off limelight.
 *
 * IT IS NOT `status.prStamp`, which is what this component read until P8 close-out B. A met week
 * is an ATTENDANCE fact -- the completed count reached the target -- and a personal record is a
 * load or a repetition count nothing else in the document beat. Stamping "Personal record" over
 * a week in which the user merely turned up four times claimed a record the document does not
 * hold. `status.prStamp` stays in the table, unchanged, for the record toast P4 detects.
 *
 * THE COUNTS ARE NEVER THE STAMP. The line beneath is the week's own two counts through
 * FORMAT.withSlots, which is round two's safety rule kept: the camp word always sits beside the
 * honest sentence. Which of the two rows fills it is decided by the SIGN of the stored delta and
 * by nothing this component computes.
 *
 * THE SOUND fires once per appearance, guarded by a ref rather than by a store field. P8 Task 14
 * specifies no UiPrefs flag for it and the sound is decorative: it is already behind ui.sounds
 * (src/skins/sfx.ts), a missing asset is silent, and the worst case of the ref is a stamp that
 * sounds again after a remount, which is a second appearance and is what "once per appearance"
 * means. A persisted flag would make a decoration a document field.
 */
export function WeekStamp({ review }: { review: WeeklyReview | null }): ReactElement | null {
  const c = useCopy();
  const overrides = useCopyOverrides();
  /*
   * THE POPUP OUTRANKS THE STAMP, and the two are about DIFFERENT weeks.
   *
   * `review` is the week that closed most recently; `usePendingMotivation()` is the oldest miss
   * still inside the 14-day window that has not been answered. A backlog makes both non-null at
   * once: week n - 1 was missed and never dismissed, week n met its target. Nothing in the
   * component's own predicate can see that, because it is handed one week and the popup is
   * about another, so the celebration for the newest week rendered behind P6's modal.
   *
   * Read unconditionally and above the early return, as the rules of hooks require. It is the
   * selector the modal's own gate reads (src/ui/motivation/MotivationGate.tsx), so "a popup is
   * on screen" has one definition rather than two that can drift.
   */
  const pendingMiss = usePendingMotivation();
  const shown = metWeek(review) && pendingMiss === null;
  const sounded = useRef(false);

  useEffect(() => {
    if (!shown) {
      // Rearmed for the next appearance, which is what makes this once-per-appearance rather
      // than once-per-mount.
      sounded.current = false;
      return;
    }
    if (sounded.current) return;
    sounded.current = true;
    playSfx('pr_stamp');
  }, [shown]);

  if (!shown) return null;

  // delta === 0 is the target met exactly; delta > 0 is the target beaten. The mapper reads the
  // stored value's sign and is shared with the ticker and the intervention, so the three places
  // that name a week's outcome cannot drift apart (src/ui/format/weekDelta.ts).
  const outcome = weekDeltaKey(review);

  return (
    <section className="ll-stamp" data-testid="week-stamp">
      <p className="ll-stamp-word ll-display">
        <Icon name="crown" />
        {c('status.weekMetStamp')}
      </p>
      <p className="ll-stamp-line">
        {FORMAT.withSlots(
          outcome,
          { completed: review.completed, target: review.target }, // [sessions], [sessions/week]
          overrides,
        )}
      </p>
      <span className="ll-stamp-fan" aria-hidden="true">
        {Array.from({ length: SPARKLE_COUNT }, (_, index) => (
          <span className="ll-stamp-sparkle" key={index}>
            <Icon name="sparkle" />
          </span>
        ))}
      </span>
    </section>
  );
}
