// src/ui/components/OwnerSprite.tsx
//
// The owner's own animated sprite (asset manifest section 10, `spriteai-vasileios-jolt-animation`,
// "exists, final"): sunglasses slide down to show his drawn eyes, the head jolts, it settles. 11
// frames of 40 x 40 px at 130 ms each, drawn at an integer 2x by ownerSprite.css.
//
// Two places: the Rest Word win (RestWordGame.tsx), where it replaced the ASCII stand-in for this
// same character, and the intro's figure slides (IntroSequence.tsx), where it replaced the ASCII
// stick figure. Stylize survey item 7.
//
// A CSS background on a span, not an <img>: the picture is decoration (the words beside it carry
// the meaning), and the rest game's offline suite counts media elements.
import { useState, type ReactElement } from 'react';
import { prefersReducedMotion } from '../hooks/reducedMotion';
import './ownerSprite.css';

/**
 * @param play true: run the 11 frames once, from this render on. Reduced motion holds frame 0
 *   whatever is asked, read once at mount as Boot and PhaseTransition read it.
 */
export function OwnerSprite({ play }: { play: boolean }): ReactElement {
  const [reduced] = useState<boolean>(prefersReducedMotion);
  const playing = play && !reduced;
  return (
    <span
      className={playing ? 'll-sprite ll-sprite-play' : 'll-sprite'}
      data-sprite={playing ? 'playing' : 'still'}
      aria-hidden="true"
    />
  );
}
