// src/ui/views/atlasArt.tsx
//
// The Atlas's two pieces of art: the owner's icon for each drawn card (owner ruling 2026-10-18:
// an icon for every card, replacing the eight category glyphs), and the pixel question mark on a
// slot that has not been drawn.
//
// ONE MAP, KEYED BY CARD ID, DERIVED FROM THE FOLDER. `SpecimenCard` carries no image field and
// gets none (asset manifest 2026-09-06 section 8: art is a UI concern, so no schema change). The
// glob below is the only list of icon files and the id is read from each file name
// (`card-<id>.svg`); atlasArt.test.tsx holds that list equal to SPECIMEN_CARDS both ways, so a
// card with no icon, or an icon with no card, fails a test rather than shipping a blank face.
//
// LOADED ON DEMAND, NOT IN THE MAIN BUNDLE. The glob is not eager: each icon is its own small
// chunk, fetched when a card the profile holds is first drawn. The service worker precaches every
// chunk (vite.config.ts, injectManifest.globPatterns `**/*.js`), so the Atlas still draws offline.
// Until a file arrives its box is already in place and empty (CardIcon), so nothing reflows.
//
// INLINED, NOT LINKED. Each file is read as text (`?raw`) and placed in the DOM through InlineArt
// (src/ui/components/InlineArt.tsx, shared with the setup wizard), so its `fill="currentColor"`
// takes the colour of the element around it: the panel's lime on a card. The markup is the
// build's own file, fixed at build time; no user-supplied or stored text ever reaches it.
//
// The specimen toast (src/ui/components/ToastQueue.tsx) prints the category as text and carries
// no art; styling survey item 8 planned the category glyph there. Not wired by this file's task.

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { InlineArt } from '../components/InlineArt';

/** Every card icon file, by path, as a loader of its SVG text (viewBox 0 0 480 480, currentColor). */
const ICON_FILE_LOADERS = import.meta.glob<string>('../../assets/art/card-*.svg', {
  query: '?raw',
  import: 'default',
});

/** `../../assets/art/card-c001.svg` -> `c001`. A name it cannot read keeps its path as the key. */
const ICON_FILE_NAME = /\/card-([^/]+)\.svg$/;

/** Each card's icon loader, keyed by card id. The one map from a card to its art. */
export const CARD_ICON_LOADERS: Readonly<Record<string, () => Promise<string>>> =
  Object.fromEntries(
    Object.entries(ICON_FILE_LOADERS).map(([path, load]) => [
      ICON_FILE_NAME.exec(path)?.[1] ?? path,
      load,
    ]),
  );

/**
 * Icons already loaded this session, by card id. A card drawn again (the dialog after the grid,
 * the Atlas reopened) is painted on its first frame instead of flashing the empty box.
 */
const loadedIcons = new Map<string, string>();

/**
 * One card's icon, decorative: the card or dialog around it is named by its title, so the art is
 * hidden from assistive technology. Mount it only for a card the profile holds; a locked slot must
 * not learn anything about its card (src/ui/views/AtlasView.tsx header).
 *
 * The SAME span is the placeholder and the icon: `data-icon-state` reads `loading`, then `ready`,
 * and the file's markup is set into it in place. The box's size belongs to the caller's class
 * (atlas.css fixes `.atlas-card-art` and `.atlas-modal-art`), so arriving art never moves a line.
 * A file that fails to load leaves the box empty: the title still names the card.
 */
export function CardIcon(props: { id: string; className: string }): ReactElement {
  const { id } = props;
  const [arrived, setArrived] = useState<{ id: string; markup: string } | undefined>(undefined);
  const markup = arrived?.id === id ? arrived.markup : loadedIcons.get(id);

  useEffect(() => {
    if (loadedIcons.has(id)) return undefined;
    const load = CARD_ICON_LOADERS[id];
    if (load === undefined) return undefined;
    let mounted = true;
    load().then(
      (text) => {
        loadedIcons.set(id, text);
        if (mounted) setArrived({ id, markup: text });
      },
      () => {
        // Nothing to show and nothing to report: the empty box stays, the card keeps its title,
        // and the next mount tries again.
      },
    );
    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <InlineArt
      markup={markup ?? ''}
      data={{ 'data-card-icon': id, 'data-icon-state': markup === undefined ? 'loading' : 'ready' }}
      className={props.className}
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
