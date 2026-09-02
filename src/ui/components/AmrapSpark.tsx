// src/ui/components/AmrapSpark.tsx
//
// Best repetitions per ISO week for one exercise, as a sparkline.
//
// Replaces the legacy PushupSpark (core.jsx lines 151-179), which plotted one subject's
// hard-coded 24-week push-up target curve on a fixed 0 to 55 axis: it drew the same picture
// for every user and for an empty log. This one takes both axes from the data, and says so
// when there is no data.
//
// A week with no logged set is absent from the series rather than plotted as zero: a week not
// trained is missing data, and drawing it as zero repetitions would show a collapse that never
// happened.
//
// Nothing animates, so prefers-reduced-motion has nothing to suppress. Colours are tokens from
// src/ui/styles/tokens.css, so the chart follows the skin.

import type { ReactElement } from 'react';
import { FORMAT } from '../../content/copy';
import { weeklyAmrapMax } from '../../domain/training/records';
import type { Exercise, LoggedSet } from '../../domain/types';

export interface AmrapSparkProps {
  sets: readonly LoggedSet[];
  exercise: Exercise;
  /** Rendered height in CSS pixels; the viewBox is fixed and scales into it. */
  height?: number; // [px]
}

const VIEW_W = 320; // viewBox units
const VIEW_H = 96; // viewBox units
const PAD_L = 46; // room for a "15 reps" axis label
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22; // room for the week labels under the axis
const DEFAULT_HEIGHT = 96; // [px]

function coord(n: number): string {
  return n.toFixed(1);
}

export function AmrapSpark(props: AmrapSparkProps): ReactElement {
  const { sets, exercise } = props;
  const height = props.height ?? DEFAULT_HEIGHT;
  const series = weeklyAmrapMax(sets, exercise.id);

  const first = series[0];
  const last = series[series.length - 1];
  if (first === undefined || last === undefined) {
    return <p className="view-note">{FORMAT.noSetsForExercise(exercise.name)}</p>;
  }

  let best = first.reps; // [repetitions]
  for (const p of series) if (p.reps > best) best = p.reps;

  // A single week has no horizontal span, and a series of all-zero reps has no vertical one.
  // Both denominators are floored at 1 so no coordinate can become 0/0.
  const span = Math.max(1, series.length - 1); // [weeks]
  const top = Math.max(1, best); // [repetitions]

  /** @param i index into the weekly series */
  const xAt = (i: number): number => PAD_L + (i / span) * (VIEW_W - PAD_L - PAD_R);
  /** @param reps [repetitions] */
  const yAt = (reps: number): number =>
    VIEW_H - PAD_B - (reps / top) * (VIEW_H - PAD_T - PAD_B);

  const path = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${coord(xAt(i))} ${coord(yAt(p.reps))}`)
    .join(' ');

  return (
    <figure className="amrap-spark" style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height={height}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={FORMAT.amrapChartLabel(
          exercise.name,
          first.weekStart,
          last.weekStart,
          last.reps,
        )}
        style={{ fontVariantNumeric: 'tabular-nums', display: 'block' }}
      >
        {/* The repetition axis, labelled at the top of its range with the unit it counts. */}
        <text
          data-testid="y-label"
          x={PAD_L - 6}
          y={coord(yAt(top) + 3)}
          textAnchor="end"
          fontSize="10"
          fill="var(--chart-text)"
        >
          {FORMAT.repsCount(top)}
        </text>
        <line
          x1={PAD_L}
          x2={VIEW_W - PAD_R}
          y1={VIEW_H - PAD_B}
          y2={VIEW_H - PAD_B}
          stroke="var(--chart-line)"
        />
        <text
          data-testid="x-label"
          x={PAD_L}
          y={VIEW_H - PAD_B + 14}
          textAnchor="start"
          fontSize="10"
          fill="var(--chart-text)"
        >
          {first.weekStart}
        </text>
        <text
          data-testid="x-label"
          x={VIEW_W - PAD_R}
          y={VIEW_H - PAD_B + 14}
          textAnchor="end"
          fontSize="10"
          fill="var(--chart-text)"
        >
          {last.weekStart}
        </text>
        <path d={path} fill="none" stroke="var(--chart-actual)" strokeWidth="1.5" />
        {series.map((p, i) => (
          <circle
            key={p.weekStart}
            data-testid="amrap-point"
            cx={coord(xAt(i))}
            cy={coord(yAt(p.reps))}
            r="2.5"
            fill="var(--chart-marker)"
          >
            <title>{FORMAT.amrapPoint(p.weekStart, FORMAT.repsCount(p.reps))}</title>
          </circle>
        ))}
      </svg>
      <figcaption>{FORMAT.amrapBest(exercise.name, best)}</figcaption>
    </figure>
  );
}
