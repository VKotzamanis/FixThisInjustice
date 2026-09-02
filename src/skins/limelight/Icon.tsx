import type { ReactElement } from 'react';
import { LIMELIGHT_ICONS } from './icons';
import type { LimelightIconName } from './icons';

export type { LimelightIconName } from './icons';

/**
 * The default CSS box, in px (round three, task 13). The art is drawn at 32 px and shown at 20, a
 * non-integer downscale, so the browser is told not to interpolate: image-rendering: pixelated
 * keeps the hard pixel edges that a smoothing filter turns to mush. The rule is set inline rather
 * than in a stylesheet because it is a property of this artwork, not of a theme.
 */
export const DEFAULT_ICON_SIZE = 20; // CSS px

export interface IconProps {
  /** One of the generated names. There is no string fallback and no emoji fallback: an unknown
   *  name is a compile error, not a blank box at runtime. */
  name: LimelightIconName;
  /** Accessible name. Omit for decoration, which hides the icon from assistive technology. */
  label?: string;
  /** CSS px. Defaults to DEFAULT_ICON_SIZE. */
  width?: number;
  /** CSS px. Defaults to DEFAULT_ICON_SIZE. */
  height?: number;
}

/**
 * One limelight pixel icon, inlined as a data URI by scripts/inline-icons.mjs.
 *
 * Accessibility follows the decorative-image rule: with no label the icon is an empty-alt image and
 * carries aria-hidden, so a screen reader never announces it and the text beside it stands alone.
 * With a label it is a role="img" with that accessible name, for the rare position where the icon
 * is the only thing carrying the meaning.
 */
export function Icon({
  name,
  label,
  width = DEFAULT_ICON_SIZE,
  height = DEFAULT_ICON_SIZE,
}: IconProps): ReactElement {
  const accessibility =
    label === undefined
      ? ({ alt: '', 'aria-hidden': true } as const)
      : ({ alt: label, role: 'img', 'aria-label': label } as const);
  return (
    <img
      className="ll-icon"
      src={LIMELIGHT_ICONS[name]}
      width={width}
      height={height}
      draggable={false}
      style={{ imageRendering: 'pixelated' }}
      {...accessibility}
    />
  );
}
