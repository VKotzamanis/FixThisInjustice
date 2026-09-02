import type { ReactElement } from 'react';
import { LIMELIGHT_ICONS } from './icons';
import type { LimelightIconName } from './icons';
import { useSkin } from '../skinContext';
import { copy, type CopyKey } from '../../content/copy';

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
 * THE SKIN GATE (P8 Task 12). The set belongs to exactly one skin, so the component returns
 * null off it and no call site has to ask which skin is active. Clinical is emoji-free and
 * glyph-free by contract (copy contract R6), and the departures board ships no graphic at all:
 * its whole character is type and motion. Returning null rather than substituting something is
 * the point -- there is no fallback artwork, because a fallback would be a fourth design.
 *
 * The skin is read from the store through useSkin(), not taken as a prop: a prop would let one
 * call site render an icon the rest of the page has switched away from.
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
}: IconProps): ReactElement | null {
  const skin = useSkin();
  if (skin !== 'limelight') return null;
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

/**
 * Every position where the stan-twitter parent carried an emoji, mapped to the icon that
 * replaced it (round-three plan section 4.4, the "where it is used" column).
 *
 * NINE of the thirteen positions the design named are here. The four it also names --
 * status.weekDeltaNegative (skull), status.prStamp (crown), advice.interventionBody (heart) and
 * hero.weekReview (fan) -- have no CopyKey yet, because the tasks that render those strings have
 * not written them. Adding the key here before the string exists is not possible: the value type
 * is Partial<Record<CopyKey, ...>>, so an unknown key is a compile error rather than a silent
 * miss. Each of those four is added by the task that adds its string.
 *
 * The marquee lead (megaphone), its separators (sparkle) and the setlist bullet (barbell) are
 * absent by design: they are placed by a component, not by a copy key.
 */
export const ICON_FOR_KEY: Readonly<Partial<Record<CopyKey, LimelightIconName>>> = {
  'button.startSession': 'nails',
  'advice.drinkToThirst': 'drop',
  'button.trainSomethingElse': 'heel',
  'button.pausePlan': 'martini',
  'button.skipToday': 'skip',
  'button.skipRest': 'skip',
  'hero.weeklyTargetMissed': 'alert',
  'status.rest': 'stopwatchPanel',
  'label.settingsSkin': 'crown',
};

/**
 * A copy string with its icon in front of it.
 *
 * This is the one call-site shape that replaces an emoji position: on limelight it renders the
 * pixel icon and the string, and on the other two skins it renders the string alone, because
 * Icon returns null there. A key with no entry in ICON_FOR_KEY renders the string alone on every
 * skin, so a call site does not have to know whether its key has art.
 *
 * The icon is decorative: it carries no label, so it is hidden from assistive technology and the
 * string beside it is the whole accessible name. An icon that announced itself would double every
 * button's name.
 */
export function SkinLabel({ copyKey }: { copyKey: CopyKey }): ReactElement {
  const icon = ICON_FOR_KEY[copyKey];
  return (
    <>
      {icon === undefined ? null : <Icon name={icon} />}
      <span className="ll-label">{copy(copyKey)}</span>
    </>
  );
}
