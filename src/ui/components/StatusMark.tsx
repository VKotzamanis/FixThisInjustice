// src/ui/components/StatusMark.tsx
//
// One set of day-status marks for the Today strip and the Log compliance grid (stylize survey
// 2026-10-18, item 6). Both used to draw their own: Today stroked a pink check (pink on lime,
// 1.41:1, banned as a mark colour by tokens.css) and a red cross through the undefined `--bad`
// token; the grid filled squares whose skipped and missed states differed only in luminance.
// AGENTS.md rule 2: one status, one drawing, so the two views cannot disagree about what a
// skipped day looks like.
//
// THE MARKS ARE PIXEL GRIDS, DRAWN BELOW AS TEXT. Each kind is 12 rows of 12 characters, `#` for
// an inked unit and `.` for none, so the drawing in this file IS the artwork and a review can see
// it without rendering anything. The SVG is drawn at 12 CSS px, one grid unit per pixel, with
// crispEdges, so nothing is resampled. The ink layer is `currentColor`; the two chips under it
// take their fill from tokens in statusMark.css.
//
// SHAPE CARRIES THE STATE (WCAG 1.4.1), not colour:
//   completed    a filled chip with a check            (pink chip, ink ring and check)
//   missed       a filled chip with a cross            (white chip, ink ring and cross)
//   skipped      a ring with diagonal hatching
//   planned      a heavy two-unit ring, empty
//   none         a dotted ring (the grid's "not planned")
//   in-progress  a solid triangle (Today only)
//   paused       two bars (Today only; the row itself keeps its hatched band)
//   rest         a dash (Today only)
// StatusMark.test.tsx holds every pair of ink layers distinct.

import type { ReactElement } from 'react';
import './statusMark.css';

/** Every state either view can show. Today's DayStatus and the grid's ComplianceMark are subsets. */
export const MARK_KINDS = [
  'completed',
  'missed',
  'skipped',
  'planned',
  'none',
  'in-progress',
  'paused',
  'rest',
] as const;

export type MarkKind = (typeof MARK_KINDS)[number];

/** One mark: the ink grid, and on the two chip marks the fill grid drawn beneath it. */
interface MarkGrid {
  ink: readonly string[];
  chip?: readonly string[];
}

/** [grid units] A full 12 x 12 chip, painted under the ring. */
const FULL: readonly string[] = Array.from({ length: 12 }, () => '############');

export const MARK_GRIDS: Readonly<Record<MarkKind, MarkGrid>> = {
  completed: {
    chip: FULL,
    ink: [
      '############',
      '#..........#',
      '#..........#',
      '#..........#',
      '#.......##.#',
      '#......##..#',
      '#.##..##...#',
      '#..####....#',
      '#...##.....#',
      '#..........#',
      '#..........#',
      '############',
    ],
  },
  missed: {
    chip: FULL,
    ink: [
      '############',
      '#..........#',
      '#.##....##.#',
      '#..##..##..#',
      '#...####...#',
      '#....##....#',
      '#....##....#',
      '#...####...#',
      '#..##..##..#',
      '#.##....##.#',
      '#..........#',
      '############',
    ],
  },
  skipped: {
    ink: [
      '############',
      '#..........#',
      '#..##..##..#',
      '#.##..##...#',
      '#.#..##..#.#',
      '#...##..##.#',
      '#..##..##..#',
      '#.##..##...#',
      '#.#..##..#.#',
      '#...##..##.#',
      '#..........#',
      '############',
    ],
  },
  planned: {
    ink: [
      '############',
      '############',
      '##........##',
      '##........##',
      '##........##',
      '##........##',
      '##........##',
      '##........##',
      '##........##',
      '##........##',
      '############',
      '############',
    ],
  },
  none: {
    ink: [
      '#.#.#.#.#.#.',
      '...........#',
      '#...........',
      '...........#',
      '#...........',
      '...........#',
      '#...........',
      '...........#',
      '#...........',
      '...........#',
      '#...........',
      '.#.#.#.#.#.#',
    ],
  },
  'in-progress': {
    ink: [
      '............',
      '............',
      '..##........',
      '..####......',
      '..######....',
      '..########..',
      '..########..',
      '..######....',
      '..####......',
      '..##........',
      '............',
      '............',
    ],
  },
  paused: {
    ink: [
      '............',
      '............',
      '...##..##...',
      '...##..##...',
      '...##..##...',
      '...##..##...',
      '...##..##...',
      '...##..##...',
      '...##..##...',
      '...##..##...',
      '............',
      '............',
    ],
  },
  rest: {
    ink: [
      '............',
      '............',
      '............',
      '............',
      '............',
      '..########..',
      '..########..',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
  },
};

/**
 * One SVG path for a pixel grid: a unit-high rectangle per run of `#` along a row.
 *
 * Coordinates are grid units, x to the right and y down, which is the SVG user space of the
 * 12 x 12 viewBox. Runs are merged so a solid row is one rectangle rather than twelve, which
 * keeps the path short and leaves no hairline seams between neighbouring units.
 */
export function gridPath(rows: readonly string[]): string {
  const parts: string[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') {
        x += 1;
        continue;
      }
      let end = x;
      while (row[end] === '#') end += 1;
      const run = end - x; // [grid units]
      parts.push(`M${x} ${y}h${run}v1h-${run}z`);
      x = end;
    }
  });
  return parts.join(' ');
}

/** The paths, built once at module load: the grids are constants. */
const PATHS: Readonly<Record<MarkKind, { ink: string; chip: string | null }>> = Object.fromEntries(
  MARK_KINDS.map((kind) => {
    const grid = MARK_GRIDS[kind];
    return [kind, { ink: gridPath(grid.ink), chip: grid.chip === undefined ? null : gridPath(grid.chip) }];
  }),
) as Record<MarkKind, { ink: string; chip: string | null }>;

/** [CSS px] Drawn size: one grid unit per CSS pixel, so the grid is never resampled. */
const MARK_PX = 12;

/** The figure each grid draws, named for the data attribute a test or a style can select on. */
const SHAPE_ID: Readonly<Record<MarkKind, string>> = {
  completed: 'chip-check',
  missed: 'chip-cross',
  skipped: 'ring-hatch',
  planned: 'ring-heavy',
  none: 'ring-dotted',
  'in-progress': 'triangle',
  paused: 'bars',
  rest: 'dash',
};

/**
 * A status mark.
 *
 * `label` makes the mark the named element (role="img", aria-label), which is what the Today
 * strip needs: the mark is the only thing in its column that says the status. Omit it where the
 * container already carries the name (the grid's gridcell has its own aria-label), and the mark
 * is hidden from assistive technology so the name is not read twice. No <title> child either
 * way: it would be a second copy of the name that the accessible-name computation never reads.
 */
export function StatusMark(props: { kind: MarkKind; label?: string }): ReactElement {
  const { kind, label } = props;
  const paths = PATHS[kind];
  const accessibility =
    label === undefined
      ? ({ 'aria-hidden': true } as const)
      : ({ role: 'img', 'aria-label': label } as const);
  return (
    <svg
      className="status-mark"
      viewBox="0 0 12 12"
      width={MARK_PX}
      height={MARK_PX}
      shapeRendering="crispEdges"
      focusable="false"
      data-mark={kind}
      data-shape={SHAPE_ID[kind]}
      {...accessibility}
    >
      {paths.chip !== null && <path className={`sm-chip-${kind}`} d={paths.chip} />}
      <path className="sm-ink" d={paths.ink} />
    </svg>
  );
}
