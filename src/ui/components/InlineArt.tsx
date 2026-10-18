// src/ui/components/InlineArt.tsx
//
// One bundled SVG file, placed in the DOM as markup. Shared by the Atlas glyphs
// (src/ui/views/atlasArt.tsx) and the setup wizard's drawings (src/ui/setup/setupArt.tsx).
//
// INLINED, NOT LINKED. Each caller imports its files as text (`?raw`), so a file's
// `fill="currentColor"` takes the colour of the element around it. An <img> of the same file would
// paint the SVG's own black, because currentColor does not cross an image boundary.
//
// SAFE BECAUSE OF WHERE THE MARKUP COMES FROM. `markup` must be the text of a file in
// src/assets/art/, fixed at build time; no user-supplied or stored text may be passed here. The
// callers' tests assert their files carry no script, event handler or link (setupArt.test.ts) and
// no colour of their own (atlasArt.test.tsx).
//
// DECORATIVE BY CONTRACT: aria-hidden, because every place that shows art also shows the words it
// stands for. The `data-*` attribute names the drawing, so a test or a reader of the DOM can tell
// which one is where.

import type { CSSProperties, JSX } from 'react';

export function InlineArt(props: {
  /** The file's text, rendered as given; a caller that wants it trimmed trims it. */
  markup: string;
  /** The attribute naming the drawing, e.g. `{ 'data-art': 'tape-neck' }`. */
  data: Readonly<Record<`data-${string}`, string>>;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}): JSX.Element {
  return (
    <span
      className={props.className}
      {...props.data}
      aria-hidden="true"
      style={props.style}
      dangerouslySetInnerHTML={{ __html: props.markup }}
    />
  );
}
