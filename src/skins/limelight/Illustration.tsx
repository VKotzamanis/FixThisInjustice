import type { ReactElement } from 'react';

import { useSkin } from '../skinContext';
import { LIMELIGHT_ILLUSTRATIONS, type LimelightIllustrationName } from './illustrations';

/**
 * A limelight mascot illustration.
 *
 * Mirrors `Icon.tsx` deliberately, including the null return on every other skin: the mascots are
 * this skin's voice, and clinical is the plain table the app falls back to. Round 3 drew four of
 * them and none was ever wired; this component is what round 2 of the alpha needed to place two
 * of them (asset manifest, 2026-09-06).
 *
 * DECORATIVE BY DEFAULT, and that is a decision rather than a shortcut. A mascot beside a heading
 * carries nothing the heading does not already say, so it takes an empty alt and is hidden from
 * assistive technology. Passing `label` makes it informative instead, for a future placement where
 * the picture carries a fact the words do not. An illustration that duplicated the heading aloud
 * would make the screen worse for a screen-reader user, not better.
 *
 * THE FLOPPED MASCOT IS NOT REACHABLE FROM HERE BY ACCIDENT, but nothing in this file stops it
 * either. `src/ui/components/Intervention.tsx` states why it imports no illustration at all: a
 * collapsed mascot shown to someone who missed a week is the picture version of a joke about the
 * user, and a lever in a picture cannot be argued away by the words beside it. That veto stands.
 * Do not import this component there.
 */
export function Illustration({
  name,
  label,
  width = 96,
  height = 96,
}: {
  name: LimelightIllustrationName;
  /** Omit for decoration, which is the usual case. Pass a sentence only if the picture informs. */
  label?: string;
  width?: number;
  height?: number;
}): ReactElement | null {
  const skin = useSkin();
  if (skin !== 'limelight') return null;
  const accessibility =
    label === undefined
      ? ({ alt: '', 'aria-hidden': true } as const)
      : ({ alt: label, role: 'img', 'aria-label': label } as const);
  return (
    <img
      className="ll-illustration"
      src={LIMELIGHT_ILLUSTRATIONS[name]}
      width={width}
      height={height}
      draggable={false}
      style={{ imageRendering: 'pixelated' }}
      {...accessibility}
    />
  );
}
