/**
 * Colour parsing and WCAG 2.1 contrast, for the Design Mode panel.
 *
 * WHY THIS EXISTS RATHER THAN AN IMPORT. `src/app/topbar.test.ts` already carries exactly this
 * arithmetic and it is the reference implementation: its numbers are asserted against the
 * ratios round three published, and this module's own suite checks itself against the SAME
 * published pairs. It could not be imported, because it lives in a `.test.ts` file that ships
 * in no bundle. The maths is restated here, in the one place the running app can reach it, and
 * `src/design/colour.test.ts` pins both to the same published table so they cannot drift.
 *
 * ONE DELIBERATE DIFFERENCE from the test's copy: `parseColour` returns `null` rather than
 * throwing on something that is not a colour. The panel hands it every token value in the
 * sheet, and `--display-stretch: 62%` and `--accent-rgb: 163, 230, 53` are not colours. A
 * throw there would take the panel down; `null` is the answer the caller needs.
 *
 * Units and conventions: channels are sRGB 0 to 255 (fractional after compositing, which is
 * correct - the luminance transfer function is continuous). Alpha is 0 to 1. Ratios are
 * WCAG 2.1 relative-luminance ratios in the range 1:1 to 21:1.
 */

/** One sRGB colour, channels 0 to 255. Fractional after an alpha composite. */
export type Rgb = readonly [number, number, number];

/** WCAG 2.1 SC 1.4.3, normal body text. */
export const AA_TEXT = 4.5;

/** WCAG 2.1 SC 1.4.3, large text (>= 24 px, or >= 18.66 px bold). */
export const AA_LARGE_TEXT = 3;

/** WCAG 2.1 SC 1.4.11, a non-text thing that has to be seen: a fill, an outline, a marker. */
export const AA_NON_TEXT = 3;

/** One #rrggbb pair as a number, 0 to 255. */
function hexPair(hex: string, index: number): number {
  return Number.parseInt(hex.slice(index, index + 2), 16);
}

/** Expands #rgb / #rgba to the six or eight digit form. */
function expandHex(digits: string): string {
  if (digits.length === 3 || digits.length === 4) {
    return [...digits].map((c) => `${c}${c}`).join('');
  }
  return digits;
}

/** Composites one channel of `over` at `alpha` onto `under`. */
function composite(over: number, under: number, alpha: number): number {
  return over * alpha + under * (1 - alpha);
}

/**
 * sRGB channels from a CSS colour literal, or `null` when the text is not one.
 *
 * Accepts `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()` in both the legacy
 * comma form and the modern space form with `/ alpha`. A translucent colour is composited over
 * `under`, because a translucent surface is only as dark as what it sits on: that is the
 * arithmetic the w1.03 top-bar defect turned on.
 *
 * Named CSS colours are deliberately NOT accepted. Resolving them needs a 148-entry table, and
 * no token in this repository is written as a name; the panel reports "not a colour" instead,
 * which is a truthful answer rather than a wrong ratio.
 */
export function parseColour(css: string, under: Rgb = [0, 0, 0]): Rgb | null {
  const text = css.trim();

  const digits = /^#([0-9a-f]{3,8})$/i.exec(text)?.[1];
  if (digits !== undefined) {
    const full = expandHex(digits);
    if (full.length !== 6 && full.length !== 8) return null;
    const alpha = full.length === 8 ? hexPair(full, 6) / 255 : 1;
    return [
      composite(hexPair(full, 0), under[0], alpha),
      composite(hexPair(full, 2), under[1], alpha),
      composite(hexPair(full, 4), under[2], alpha),
    ];
  }

  const inner = /^rgba?\(([^)]+)\)$/i.exec(text)?.[1];
  if (inner === undefined) return null;
  const parts = inner
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((part) => (part.endsWith('%') ? Number(part.slice(0, -1)) * 2.55 : Number(part)));
  const [r, g, b, a] = parts;
  if (r === undefined || g === undefined || b === undefined) return null;
  if (![r, g, b].every((v) => Number.isFinite(v))) return null;
  const alpha = a === undefined ? 1 : a;
  if (!Number.isFinite(alpha)) return null;
  return [composite(r, under[0], alpha), composite(g, under[1], alpha), composite(b, under[2], alpha)];
}

/** WCAG 2.1 relative luminance, 0 to 1. */
export function relativeLuminance(rgb: Rgb): number {
  const linear = [rgb[0], rgb[1], rgb[2]].map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

/** WCAG 2.1 contrast ratio between two opaque colours, 1 to 21. Order does not matter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The ratio as the field writes it: two decimals and a `:1`, e.g. `10.91:1`. */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

/**
 * `#rrggbb` for an `<input type="color">`, which accepts that form and no other.
 *
 * ALPHA IS DROPPED, and this is why the panel offers a text input beside every colour input: a
 * colour control cannot express `rgba(220, 230, 240, 0.08)` or `var(--lime)`, and forty of the
 * sheet's declarations are exactly one of those two. The swatch shows the composited colour; the
 * text field is where the real value lives.
 */
export function toHex(rgb: Rgb): string {
  const channel = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}
