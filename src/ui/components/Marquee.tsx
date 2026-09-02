import { useState, type ReactElement } from 'react';
import { useSkin } from '../../skins/skinContext';
import { Icon } from '../../skins/limelight/Icon';
import type { LimelightIconName } from '../../skins/limelight/icons';
import './limelight.css';

/**
 * One line of the ticker: a string a FORMAT frame already produced, and the icon that leads it.
 *
 * The text is a prop rather than a copy key on purpose. Every line the marquee carries has a
 * number in it, and the frames that fill those numbers live at the call site with the values;
 * a component that took a key would have to fill the slots itself, which is the one thing a
 * skin-facing component must never do.
 */
export interface MarqueeItem {
  readonly icon: LimelightIconName;
  readonly text: string;
}

/**
 * The moving banner (round-three plan section 2.4). The user asked for it by name and called it
 * information rather than decoration, and four properties of this component are what make that
 * true rather than flattering:
 *
 *  1. IT CAN BE STOPPED. The strip is a real <button> with aria-pressed, so a keyboard or a
 *     thumb can latch it; limelight.css also pauses it on hover, focus and press. A line that
 *     scrolls past is otherwise gone, which was the defect in the parent design.
 *  2. IT IS ANNOUNCED ONCE. The moving copy is doubled so the translate loop is seamless, so it
 *     is aria-hidden and a clipped static node carries the same lines, once, in order. A screen
 *     reader that read the track would read every line twice.
 *  3. THE FIRST ITEM IS THE ONE THAT MATTERS. Under prefers-reduced-motion the sheet stops the
 *     strip and shows the first item alone, so the caller's first item is the item a
 *     reduced-motion user gets. That rule is CSS, not state: it holds before the first paint.
 *  4. IT NEVER BUILDS A STRING. Items arrive formatted; no number is restated here.
 *
 * SKIN. The ticker belongs to limelight and to the departures board, which are the two skins
 * whose whole character is type in motion. Clinical renders nothing: it is the plain, quiet
 * table this app falls back to, and a scrolling banner is not a fact it needs.
 */
export function Marquee({
  items,
  label,
}: {
  items: readonly MarqueeItem[];
  label: string;
}): ReactElement | null {
  const skin = useSkin();
  // A latch rather than press-and-hold: a hold is already CSS (:active, :hover, :focus-visible),
  // and a keyboard user needs a state that survives the key coming back up.
  const [paused, setPaused] = useState(false);

  if (skin === 'clinical' || items.length === 0) return null;

  // Doubled, so translateX(-50%) lands exactly one loop later on the same pixel.
  const scrolling = [...items, ...items];

  return (
    <div className="ll-marquee ll-panel">
      {/*
       * Outside the button, deliberately: a button's accessible name comes from its label, so a
       * static line inside it would be a name nothing can reach rather than a line to read.
       */}
      <p className="ll-marquee-static">
        {items.map((item) => (
          <span className="ll-marquee-line" key={item.text}>
            {item.text}
          </span>
        ))}
      </p>
      <button
        type="button"
        className="ll-marquee-strip"
        aria-label={label}
        aria-pressed={paused}
        data-paused={paused ? 'true' : 'false'}
        onClick={() => {
          setPaused((value) => !value);
        }}
      >
        <span className="ll-marquee-track" aria-hidden="true">
          <Icon name="megaphonePanel" />
          {scrolling.map((item, index) => (
            <span className="ll-marquee-item" key={`${String(index)}-${item.text}`}>
              <Icon name={item.icon} />
              <span className="ll-marquee-text">{item.text}</span>
              <Icon name="sparklePanel" />
            </span>
          ))}
        </span>
      </button>
    </div>
  );
}
