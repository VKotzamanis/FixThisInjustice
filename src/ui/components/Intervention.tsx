import { useEffect, useRef, type ReactElement } from 'react';
import { FORMAT } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import type { WeeklyReview } from '../../domain/types';
import { Icon } from '../../skins/limelight/Icon';
import { playSfx } from '../../skins/sfx';
import { weekDeltaKey } from '../format/weekDelta';
import './limelight.css';

/**
 * Did this closed week miss its target, and has the popup already been answered?
 *
 * `missHandled` is set by markMotivationShown (src/store/motivationActions.ts) on the week the
 * modal was shown for and on every older one, so it is exactly "P6 has had its turn". While it
 * is false the missed-week modal owns the screen and this block stays silent: two renderings of
 * the same week at the same time is the duplication A59 recorded.
 *
 * `paused` is checked for the reason weekly.ts states: a paused week is not a miss, and its
 * delta is 0 rather than negative, so this predicate would be false anyway. It is written out
 * because a future change to the delta convention must not silently turn a pause into a verdict.
 */
export function handledMiss(review: WeeklyReview | null): review is WeeklyReview {
  return review !== null && !review.paused && review.delta < 0 && review.missHandled;
}

/**
 * The intervention, on the Today view, after the popup has been dismissed.
 *
 * ROUND-THREE SECTION 3.3 IS THE WHOLE SPECIFICATION HERE. This is the screen shown to someone
 * who has just missed a week, and the tone rule is enforced structurally rather than by good
 * intentions:
 *
 *  - the TITLE may be camp: `hero.weeklyTargetMissed` is "the intervention" on limelight;
 *  - the BODY may not: `advice.interventionBody` carries no verdict, no second-person judgement
 *    and no joke, in every skin;
 *  - the PICTURE is not the flopped mascot. This file imports no illustration at all, so the
 *    flop pose cannot reach this screen by an edit that looked harmless. A collapsed mascot
 *    shown to someone who missed a week is the picture version of a joke about the user, and
 *    round two found that a lever in a picture cannot be argued away by the words beside it.
 *
 * The honest line never leaves: the week's two counts render beneath the body through
 * FORMAT.withSlots. What round three removed from that pairing was METHOD (the delta formula),
 * never data.
 */
export function Intervention({ review }: { review: WeeklyReview | null }): ReactElement | null {
  const c = useCopy();
  const overrides = useCopyOverrides();
  const shown = handledMiss(review);
  const sounded = useRef(false);

  useEffect(() => {
    if (!shown) {
      sounded.current = false;
      return;
    }
    if (sounded.current) return;
    sounded.current = true;
    // Soft and low, not a sting (round-three section 6.1), and silent unless ui.sounds is on and
    // the asset exists. No audio ships in this repository.
    playSfx('intervention_open');
  }, [shown]);

  if (!shown) return null;

  return (
    <section className="ll-intervention" data-testid="intervention">
      <h2 className="ll-intervention-title">{c('hero.weeklyTargetMissed')}</h2>
      <p className="ll-intervention-body">
        <Icon name="heart" />
        {c('advice.interventionBody')}
      </p>
      <p className="ll-intervention-line">
        {/*
          * Through the shared mapper rather than by naming the row: `handledMiss` has already
          * decided the sign, and reading the key from the same function the ticker and the
          * stamp read keeps one definition of "what this week's delta is called". Written as a
          * literal, this line went on saying "below target" whatever the stored delta became.
          */}
        {FORMAT.withSlots(
          weekDeltaKey(review),
          { completed: review.completed, target: review.target }, // [sessions], [sessions/week]
          overrides,
        )}
      </p>
    </section>
  );
}
