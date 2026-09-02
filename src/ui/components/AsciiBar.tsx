import type { JSX } from 'react';

const FILLED = '#';
const EMPTY = '-';

/** Default bar width in characters. Fits a 320 px phone in the monospace body font. */
const DEFAULT_WIDTH = 20; // [characters]

/**
 * Pure bar renderer. `value` and `target` must already share a unit; this function never
 * converts, so a caller passing kcal against g gets a meaningless bar and no warning. The
 * ratio is clamped to [0, 1]: a bar is a progress indicator, not a measurement, and an
 * overshoot is reported by the numeric read-out beside it rather than by a bar that overflows.
 *
 * A non-positive or non-finite target returns an empty bar rather than throwing. The only way
 * to reach that is a target the engine could not compute, and an empty bar states exactly
 * that; Infinity or NaN characters would not.
 */
export function asciiBar(value: number, target: number, width: number): string {
  const safeWidth = Math.max(1, Math.floor(width)); // [characters]
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) {
    return `[${EMPTY.repeat(safeWidth)}]`;
  }
  const ratio = Math.min(1, Math.max(0, value / target)); // dimensionless, clamped
  const filled = Math.round(ratio * safeWidth); // [characters]
  return `[${FILLED.repeat(filled)}${EMPTY.repeat(safeWidth - filled)}]`;
}

/**
 * The bar as a labelled element. The label is the accessible name, because the glyphs
 * themselves are read out character by character by a screen reader and say nothing; the
 * numeric read-out that accompanies every use of this component carries the actual values.
 */
export function AsciiBar(props: {
  value: number;
  target: number;
  width?: number;
  label: string;
  testId?: string;
}): JSX.Element {
  return (
    <span
      className="ascii-bar"
      aria-label={props.label}
      data-testid={props.testId}
      style={{ whiteSpace: 'pre' }}
    >
      {asciiBar(props.value, props.target, props.width ?? DEFAULT_WIDTH)}
    </span>
  );
}
