// src/ui/components/BodyMassChart.tsx
//
// Measured body mass against the projection the nutrition engine expects.
//
// Ported from the legacy core.jsx WeightChart, with the three defects that made it
// single-subject fixed:
//   A4  the y domain came from a fixed 180-212 lb window, so any other subject fell off the
//       chart; it is now taken from the data and the projection together.
//   A3  the projection was a hard-coded 24-week lb curve; it is now drawn from the profile's
//       own NutritionTargets.expectedRateKgPerWeek, and not drawn at all when the engine
//       declines to give one.
//   A67 the SVG carried `overflow: visible`, so the series could paint over neighbouring UI.
//
// No chart library: one inline SVG with a fixed viewBox, which scales with the container and
// costs no bundle. Nothing here animates, so there is nothing for prefers-reduced-motion to
// suppress; the reduced-motion guarantee is met by construction rather than by a media query.
//
// Units. Every mass in this module is canonical kilograms, exactly as stored. The display unit
// is applied only where a number becomes text, through src/domain/units.ts, so the geometry is
// unit-free and the labels cannot state a unit the profile does not use.

import type { ReactElement } from 'react';
import { FORMAT } from '../../content/copy';
import { addDays, compareLocalDate, daysBetween } from '../../domain/dates';
import type { BodyMassEntry, Kg, LocalDate, UnitSystem } from '../../domain/types';
import { formatMass } from '../../domain/units';

export interface BodyMassChartProps {
  entries: readonly BodyMassEntry[];
  units: UnitSystem;
  /** The profile's recorded starting mass. */
  baselineKg: Kg; // [kg]
  baselineDate: LocalDate;
  /**
   * Signed expected rate: negative is loss (master plan section 6.3, NutritionTargets).
   * `null` is the engine declining to give a rate, and draws no projection.
   */
  expectedRateKgPerWeek: number | null; // [kg/week]
  /** How far the projection runs forward from the baseline date. */
  horizonDays: number; // [d]
  /**
   * The profile's civil today. The dashed projection line stops here regardless of how far
   * `horizonDays` reaches or how far a weigh-in is dated into the future: the engine states a
   * rate for the present, and a line drawn past today would extrapolate a rate the engine never
   * gave for that span. The chart's own horizontal domain (the date axis) is unaffected — only
   * the projection's endpoint is clamped.
   */
  today: LocalDate;
  /** Rendered height in CSS pixels; the viewBox is fixed and scales into it. */
  height?: number; // [px]
}

const VIEW_W = 640; // viewBox units
const VIEW_H = 260; // viewBox units
const PAD_L = 56; // viewBox units; room for a "210.1 lb" tick label
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 30; // room for the date labels under the axis
const Y_TICKS = 5;
const DEFAULT_HEIGHT = 260; // [px]

/**
 * [kg] Narrowest mass domain the chart will draw. A domain narrower than this is widened about
 * its midpoint: a single measurement, or a flat projection, otherwise gives hi === lo and every
 * y coordinate becomes 0/0. Widening is honest here because the alternative is a chart whose
 * vertical axis has no scale at all.
 */
const MIN_DOMAIN_KG = 1;

/** Fraction of the domain added above and below so the extreme points are not on the frame. */
const DOMAIN_PAD_FRACTION = 0.08; // dimensionless

/** Numbers in an SVG attribute are printed at 0.1 viewBox units; more is noise in the DOM. */
function coord(n: number): string {
  return n.toFixed(1);
}

export function BodyMassChart(props: BodyMassChartProps): ReactElement {
  const { entries, units, baselineKg, baselineDate, expectedRateKgPerWeek, horizonDays, today } =
    props;
  const height = props.height ?? DEFAULT_HEIGHT;

  // Programme order, not entry order: a weigh-in typed in late still belongs to the civil day
  // it was taken on. Ties on the day are broken by the instant it was entered, which is the
  // rule latestBodyMassEntry already applies in the store.
  const sorted = [...entries].sort(
    (a, b) => compareLocalDate(a.date, b.date) || a.loggedAt - b.loggedAt,
  );

  // ---- horizontal domain: days from the baseline ----------------------------------------
  // A measurement can predate the baseline (a profile edited after the fact), so the domain is
  // extended backwards rather than clipping the point off the chart.
  let firstDay = 0; // [d] relative to baselineDate
  let lastDay = Math.max(0, Math.round(horizonDays)); // [d]
  for (const e of sorted) {
    const day = daysBetween(baselineDate, e.date); // [d]
    if (day < firstDay) firstDay = day;
    if (day > lastDay) lastDay = day;
  }
  // A zero-width horizontal domain divides every x coordinate by zero.
  if (lastDay <= firstDay) lastDay = firstDay + 1; // [d]
  const firstDate = addDays(baselineDate, firstDay);
  const lastDate = addDays(baselineDate, lastDay);

  // ---- projection ------------------------------------------------------------------------
  // Drawn from the baseline at the engine's own rate. The line's own end is clamped to today
  // (never past it, never before the domain's own start), independent of how far the horizontal
  // domain (lastDay, above) reaches: a long horizonDays or a future-dated weigh-in widens the
  // AXIS so those points are visible, but the engine's rate was only ever stated through today,
  // so drawing the dashed line any further would extrapolate a rate nobody gave.
  const rate = expectedRateKgPerWeek; // [kg/week]
  const todayDay = daysBetween(baselineDate, today); // [d] relative to baselineDate
  const projEndDay = Math.min(lastDay, Math.max(firstDay, todayDay)); // [d] clamped to today
  const projStartKg = rate === null ? null : baselineKg + (rate * firstDay) / 7; // [kg]
  const projEndKg = rate === null ? null : baselineKg + (rate * projEndDay) / 7; // [kg]

  // ---- vertical domain: masses -----------------------------------------------------------
  // The baseline is always in the domain: it is the reference the projection starts from, and
  // a chart that cropped it would hide what the projection is measured against.
  const masses: Kg[] = [baselineKg];
  if (projStartKg !== null) masses.push(projStartKg);
  if (projEndKg !== null) masses.push(projEndKg);
  for (const e of sorted) masses.push(e.massKg);

  let lo = masses[0] ?? baselineKg; // [kg]
  let hi = lo; // [kg]
  for (const m of masses) {
    if (m < lo) lo = m;
    if (m > hi) hi = m;
  }
  if (hi - lo < MIN_DOMAIN_KG) {
    const mid = (hi + lo) / 2; // [kg]
    lo = mid - MIN_DOMAIN_KG / 2;
    hi = mid + MIN_DOMAIN_KG / 2;
  }
  const padKg = (hi - lo) * DOMAIN_PAD_FRACTION; // [kg]
  lo -= padKg;
  hi += padKg;

  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = VIEW_H - PAD_T - PAD_B;
  /** @param day [d] offset from baselineDate */
  const xAt = (day: number): number => PAD_L + ((day - firstDay) / (lastDay - firstDay)) * innerW;
  /** @param massKg [kg] */
  const yAt = (massKg: Kg): number => PAD_T + (1 - (massKg - lo) / (hi - lo)) * innerH;

  const ticksKg = Array.from(
    { length: Y_TICKS },
    (_, i) => lo + ((hi - lo) * i) / (Y_TICKS - 1),
  ); // [kg], ascending
  const tickLabels = ticksKg.map((kg) => formatMass(kg, units));

  const measuredPath = sorted
    .map(
      (e, i) =>
        `${i === 0 ? 'M' : 'L'} ${coord(xAt(daysBetween(baselineDate, e.date)))} ${coord(yAt(e.massKg))}`,
    )
    .join(' ');

  const last = sorted[sorted.length - 1] ?? null;
  const lowLabel = tickLabels[0] ?? '';
  const highLabel = tickLabels[tickLabels.length - 1] ?? '';
  const ariaLabel =
    last === null
      ? FORMAT.bodyMassChartEmptyLabel(firstDate, lastDate, lowLabel, highLabel)
      : FORMAT.bodyMassChartLabel(
          firstDate,
          lastDate,
          lowLabel,
          highLabel,
          formatMass(last.massKg, units),
          last.date,
        );

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      height={height}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
      // Tabular figures so the tick column does not shift width as the digits change.
      style={{ fontVariantNumeric: 'tabular-nums', display: 'block' }}
    >
      {ticksKg.map((kg, i) => (
        <g key={`tick-${String(i)}`}>
          <line
            x1={PAD_L}
            x2={VIEW_W - PAD_R}
            y1={coord(yAt(kg))}
            y2={coord(yAt(kg))}
            stroke="var(--chart-grid)"
          />
          <text
            data-testid="y-label"
            x={PAD_L - 6}
            y={coord(yAt(kg) + 3)}
            textAnchor="end"
            fontSize="10"
            fill="var(--chart-text)"
          >
            {tickLabels[i]}
          </text>
        </g>
      ))}

      {/* The date axis, labelled at both ends: the span the chart covers. */}
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
        {firstDate}
      </text>
      <text
        data-testid="x-label"
        x={VIEW_W - PAD_R}
        y={VIEW_H - PAD_B + 14}
        textAnchor="end"
        fontSize="10"
        fill="var(--chart-text)"
      >
        {lastDate}
      </text>

      {projStartKg !== null && projEndKg !== null && (
        <path
          data-testid="projection"
          d={`M ${coord(xAt(firstDay))} ${coord(yAt(projStartKg))} L ${coord(xAt(projEndDay))} ${coord(yAt(projEndKg))}`}
          fill="none"
          stroke="var(--chart-line)"
          strokeWidth="1.25"
          strokeDasharray="3 3"
        />
      )}

      {measuredPath !== '' && (
        <path
          data-testid="measured"
          d={measuredPath}
          fill="none"
          stroke="var(--chart-actual)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      )}

      {sorted.map((e) => (
        <circle
          key={e.id}
          data-testid="measured-point"
          cx={coord(xAt(daysBetween(baselineDate, e.date)))}
          cy={coord(yAt(e.massKg))}
          r="3"
          fill="var(--chart-marker)"
        >
          <title>{FORMAT.bodyMassPoint(e.date, formatMass(e.massKg, units))}</title>
        </circle>
      ))}
    </svg>
  );
}
