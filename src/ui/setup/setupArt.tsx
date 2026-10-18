import type { CSSProperties, JSX } from 'react';
import { BODY_FAT_CHART_PERCENTAGES } from '../../content/bodyFatChart';
import comfort1Starting from '../../assets/art/comfort-1-starting.svg?raw';
import comfort2Machines from '../../assets/art/comfort-2-machines.svg?raw';
import comfort3Freeweights from '../../assets/art/comfort-3-freeweights.svg?raw';
import equip1Bodyweight from '../../assets/art/equip-1-bodyweight.svg?raw';
import equip2HomeBodyweight from '../../assets/art/equip-2-home-bodyweight.svg?raw';
import equip3Home from '../../assets/art/equip-3-home.svg?raw';
import equip4FullHome from '../../assets/art/equip-4-full-home.svg?raw';
import equip5FullGym from '../../assets/art/equip-5-full-gym.svg?raw';
import tapeNeck from '../../assets/art/tape-neck.svg?raw';
import tapeAbdomenMale from '../../assets/art/tape-abdomen-male.svg?raw';
import tapeAbdomenFemale from '../../assets/art/tape-abdomen-female.svg?raw';
import tapeHip from '../../assets/art/tape-hip.svg?raw';

/*
 * The setup wizard's art: the owner's drawings in src/assets/art/ (approved 2026-10-18, survey
 * item 4; rows in docs/design/2026-09-04-icon-register.csv). Each file is inlined as text (`?raw`)
 * so its `fill="currentColor"` takes the colour of the element it sits in; an <img> would paint
 * it black whatever the theme. The markup is the build's own file, never user input, which is why
 * it may go through dangerouslySetInnerHTML (setupArt.test.ts asserts it carries no script, event
 * handler or link).
 */

/** Every named icon the wizard draws, keyed by its icon-register row id. */
export const SETUP_ICON_ART = {
  'comfort-1-starting': comfort1Starting,
  'comfort-2-machines': comfort2Machines,
  'comfort-3-freeweights': comfort3Freeweights,
  'equip-1-bodyweight': equip1Bodyweight,
  'equip-2-home-bodyweight': equip2HomeBodyweight,
  'equip-3-home': equip3Home,
  'equip-4-full-home': equip4FullHome,
  'equip-5-full-gym': equip5FullGym,
  'tape-neck': tapeNeck,
  'tape-abdomen-male': tapeAbdomenMale,
  'tape-abdomen-female': tapeAbdomenFemale,
  'tape-hip': tapeHip,
} as const satisfies Readonly<Record<string, string>>;

/** An icon-register row id with a drawing. An unknown id is a compile error, not a blank frame. */
export type SetupIconId = keyof typeof SETUP_ICON_ART;

export type BodyFatChartSex = keyof typeof BODY_FAT_CHART_PERCENTAGES;
export type BodyFatChartView = 'front' | 'side';

/** The two drawings each chart cell shows, left to right. */
export const BODY_FAT_CHART_VIEWS: readonly BodyFatChartView[] = ['front', 'side'];

/*
 * Every body-fat drawing in the folder, by file name. The glob is the only list of files: which
 * ones the chart asks for is derived from BODY_FAT_CHART_PERCENTAGES (AGENTS rule 2), so a
 * percentage with no drawing reads as a missing entry, which setupArt.test.ts fails on.
 */
const BODY_FAT_FILES = import.meta.glob<string>('../../assets/art/bf-*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The file id for one drawing, e.g. `bf-female-45-side`. */
export function bodyFatArtId(sex: BodyFatChartSex, pct: number, view: BodyFatChartView): string {
  return `bf-${sex}-${String(pct)}-${view}`;
}

/*
 * The crop each view is drawn with, in viewBox units of the source frame (0 0 400 560; at that
 * size one unit is one px). MEASURED 2026-10-18 by rasterising all 24 files at 400 x 560 and
 * trimming to the inked pixels: fronts span x 24..375, sides x 73..326, and every file y 17..543.
 * The brief's estimate of x 40..360 would have cut the arms off the 30 % and 35 % male fronts.
 *
 * ONE BOX PER VIEW, NOT ONE PER FILE. The chart is read by comparing widths across percentages,
 * so every front shares one crop and every side shares another; a crop fitted to each figure
 * would rescale each one and hide the very difference the chart shows. Both views share the
 * vertical crop, so a front and side drawn at one height share one scale.
 */
export const BODY_FAT_CHART_CROP: Readonly<
  Record<BodyFatChartView, { x: number; y: number; w: number; h: number }>
> = {
  front: { x: 20, y: 12, w: 360, h: 536 }, // x 20..380, y 12..548
  side: { x: 60, y: 12, w: 280, h: 536 }, // x 60..340, y 12..548
};

/** The source frame the crop above was measured in. */
const BODY_FAT_SOURCE_VIEWBOX = 'viewBox="0 0 400 560"';

/**
 * One body-fat drawing with its view's crop applied, or undefined when the folder has no file for
 * that sex, percentage and view. A file drawn in another frame is returned uncropped rather than
 * cropped by numbers measured for a different frame.
 */
export function bodyFatChartArt(
  sex: BodyFatChartSex,
  pct: number,
  view: BodyFatChartView,
): string | undefined {
  const markup = BODY_FAT_FILES[`../../assets/art/${bodyFatArtId(sex, pct, view)}.svg`];
  if (markup === undefined) return undefined;
  const { x, y, w, h } = BODY_FAT_CHART_CROP[view];
  return markup.replace(
    BODY_FAT_SOURCE_VIEWBOX,
    `viewBox="${String(x)} ${String(y)} ${String(w)} ${String(h)}"`,
  );
}

/**
 * One inlined drawing. Decorative by contract: aria-hidden, because every position that shows art
 * also shows the words it stands for (a caption, an option label, a percentage, a slider readout).
 * `data-art` names the file, so a test or a reader of the DOM can tell which drawing is where.
 */
export function SetupArt(props: {
  id: string;
  markup: string;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}): JSX.Element {
  return (
    <span
      className={props.className === undefined ? 'wiz-art' : `wiz-art ${props.className}`}
      data-art={props.id}
      aria-hidden="true"
      style={props.style}
      // Trimmed: the files end in whitespace after </svg>, which would add a text node.
      dangerouslySetInnerHTML={{ __html: props.markup.trim() }}
    />
  );
}

/** A named icon from SETUP_ICON_ART. */
export function SetupIcon(props: { id: SetupIconId; className?: string | undefined }): JSX.Element {
  return <SetupArt id={props.id} markup={SETUP_ICON_ART[props.id]} className={props.className} />;
}
