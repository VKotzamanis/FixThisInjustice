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
 * The bar as a labelled element.
 *
 * `role="img"` is what makes `label` the accessible NAME. A bare aria-label on a `<span>` is
 * ignored: a generic element takes no accessible name, so a screen reader fell back to the
 * text content and read the glyphs out one character at a time. The role both names the
 * element and makes its content inert.
 *
 * Chosen over `aria-hidden`, and applied to EVERY use rather than case by case: the label is
 * the only place that says which quantity the bar is about and against which bound (a target
 * or the lower end of a range), which the numeric read-out beside it does not state. That
 * read-out carries the values, so the name is deliberately not a number.
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
      role="img"
      aria-label={props.label}
      data-testid={props.testId}
      style={{ whiteSpace: 'pre' }}
    >
      {asciiBar(props.value, props.target, props.width ?? DEFAULT_WIDTH)}
    </span>
  );
}
