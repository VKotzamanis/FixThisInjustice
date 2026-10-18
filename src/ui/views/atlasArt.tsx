// src/ui/views/atlasArt.tsx
//
// The Atlas's two pieces of art: the owner's category glyph on a drawn card, and the pixel
// question mark on a slot that has not been drawn.
//
// ONE MAP, KEYED BY THE CATEGORY TYPE. `SpecimenCard` carries no image field and gets none
// (asset manifest 2026-09-06 section 8: the glyph is a UI concern, so no schema change). The
// record below is typed `Record<SpecimenCategory, string>`, so a category added to
// src/content/specimenCards.ts without a glyph is a compile error here, not a blank card.
//
// INLINED, NOT LINKED. Each file is imported as text (`?raw`) and placed in the DOM, so its
// `fill="currentColor"` takes the colour of the element around it: the panel's lime on a card.
// An <img> of the same file would paint the SVG's own black, because currentColor does not
// cross an image boundary. The markup is the bundled file itself, fixed at build time; no
// user-supplied or stored text ever reaches `dangerouslySetInnerHTML` here.
//
// The specimen toast (src/ui/components/ToastQueue.tsx) is meant to carry the same glyph
// (styling survey item 8); it is not wired from this file's task and imports CategoryGlyph when
// it is, so the map stays in one place.

import type { ReactElement } from 'react';
import type { SpecimenCategory } from '../../content/specimenCards';
import anatomy from '../../assets/art/glyph-anatomy.svg?raw';
import biology from '../../assets/art/glyph-biology.svg?raw';
import biomechanics from '../../assets/art/glyph-biomechanics.svg?raw';
import history from '../../assets/art/glyph-history.svg?raw';
import nutrition from '../../assets/art/glyph-nutrition.svg?raw';
import recovery from '../../assets/art/glyph-recovery.svg?raw';
import supplements from '../../assets/art/glyph-supplements.svg?raw';
import training from '../../assets/art/glyph-training.svg?raw';

/** Each category's glyph, as SVG markup (viewBox 0 0 480 480, currentColor). */
export const CATEGORY_GLYPH: Readonly<Record<SpecimenCategory, string>> = {
  anatomy,
  biology,
  biomechanics,
  history,
  nutrition,
  recovery,
  supplements,
  training,
};

/**
 * One category glyph, decorative: the card or dialog around it is named by its title, so the
 * art is hidden from assistive technology. Mount it only for a card the profile holds; a locked
 * slot must not learn its category (src/ui/views/AtlasView.tsx header).
 */
export function CategoryGlyph(props: {
  category: SpecimenCategory;
  className: string;
}): ReactElement {
  return (
    <span
      className={props.className}
      data-glyph={props.category}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: CATEGORY_GLYPH[props.category] }}
    />
  );
}

/*
 * The question mark, drawn on a 12 x 12 cell grid ('#' = filled cell, column 0 on the left):
 *
 *   row  0  ...######...
 *   row  1  ..########..
 *   row  2  ..##....##..
 *   row  3  ..##....##..
 *   row  4  .......###..
 *   row  5  .....####...
 *   row  6  .....##.....
 *   row  7  .....##.....
 *   row  8  ............
 *   row  9  .....##.....
 *   row 10  .....##.....
 *   row 11  ............
 *
 * One rectangle per run, in grid units. Shown at 36 CSS px (atlas.css), an integer 3x, with
 * crispEdges so no cell edge is antialiased into a grey seam.
 */
const UNKNOWN_PATH =
  'M3 0h6v1H3z' + // row 0
  'M2 1h8v1H2z' + // row 1
  'M2 2h2v2H2z' + // rows 2-3, left
  'M8 2h2v2H8z' + // rows 2-3, right
  'M7 4h3v1H7z' + // row 4
  'M5 5h4v1H5z' + // row 5
  'M5 6h2v2H5z' + // rows 6-7, stem
  'M5 9h2v2H5z'; //  rows 9-10, dot

/** The locked slot's mark. Decorative: the slot's own label already says it is undiscovered. */
export function UnknownMark(props: { className: string }): ReactElement {
  return (
    <svg
      className={props.className}
      data-mark="unknown"
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path d={UNKNOWN_PATH} fill="currentColor" />
    </svg>
  );
}
