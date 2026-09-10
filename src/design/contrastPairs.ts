/**
 * The token pairs the panel can honestly identify as one thing drawn ON another, and the WCAG
 * 2.1 threshold each one has to clear.
 *
 * WHY A TABLE AND NOT A GUESS. Nothing in a stylesheet says which colour is type and which is
 * ground: `--accent` is body type on one skin and a fill on another, and a tool that inferred
 * pairs from names would invent readings for combinations the app never draws. The table names
 * only pairs this app actually renders, which is why every entry can also name its threshold.
 *
 * WHAT IS DELIBERATELY ABSENT. `--line`, `--line-2`, `--chart-line` and `--chart-grid` are
 * hairlines and gridlines. WCAG 2.1 SC 1.4.11 applies to what a user must PERCEIVE to operate
 * or understand the interface, and it exempts purely decorative rules; these ship faint on
 * purpose. Scoring them would put four permanent failures in the readout and teach the owner to
 * ignore it, which is the failure mode of every contrast tool that cries wolf.
 *
 * THRESHOLDS. 4.5:1 is SC 1.4.3 for normal body text. 3:1 is SC 1.4.11 for a non-text thing
 * that has to be seen, and also SC 1.4.3's large-text floor. Both are quoted, not derived.
 */
import { AA_NON_TEXT, AA_TEXT, contrastRatio, parseColour } from './colour';
import type { Rgb } from './colour';
import { resolveValue } from './tokenSheet';

/** What the pair is: which threshold applies. */
export type PairKind = 'text' | 'non-text';

export interface ContrastPair {
  /** What the app draws, in the owner's language, not the token's. Title Case. */
  readonly label: string;
  /** The token drawn on top. */
  readonly fg: string;
  /** The token it is drawn on. */
  readonly bg: string;
  readonly kind: PairKind;
  /** A recorded decision a reader needs in order to read the number correctly. */
  readonly note?: string;
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { label: 'Body Text on Ground', fg: '--text', bg: '--bg', kind: 'text' },
  { label: 'Secondary Text on Ground', fg: '--text-2', bg: '--bg', kind: 'text' },
  { label: 'Tertiary Text on Ground', fg: '--text-3', bg: '--bg', kind: 'text' },
  { label: 'Top Bar Brand', fg: '--topbar-brand', bg: '--topbar-bg', kind: 'text' },
  { label: 'Top Bar Status', fg: '--topbar-text', bg: '--topbar-bg', kind: 'text' },
  {
    label: 'Accent on Ground',
    fg: '--accent',
    bg: '--bg',
    kind: 'non-text',
    note: 'On limelight this is pink on lime, 1.41:1, and is deliberate: tokens.css bans pink as type at every size there and uses the accent as a fill, an outline and an offset shadow only.',
  },
  {
    label: 'Accent on the White Highlight',
    fg: '--accent',
    bg: '--highlight-bg',
    kind: 'text',
    note: 'The r2.12(iv) highlight exists so the accent can be type at all on limelight.',
  },
  { label: 'Warning on Ground', fg: '--warn', bg: '--bg', kind: 'non-text' },
  { label: 'Danger on Ground', fg: '--danger', bg: '--bg', kind: 'non-text' },
  { label: 'Info on Ground', fg: '--info', bg: '--bg', kind: 'non-text' },
  { label: 'Panel Text on Panel', fg: '--panel-text', bg: '--panel', kind: 'text' },
  { label: 'Band Text on Realistic', fg: '--band-ink', bg: '--band-realistic', kind: 'text' },
  { label: 'Band Text on Improbable', fg: '--band-ink', bg: '--band-improbable', kind: 'text' },
  {
    label: 'Band Text on Highly Improbable',
    fg: '--band-ink',
    bg: '--band-highly-improbable',
    kind: 'text',
  },
  {
    label: 'Realistic Fill on Its Surface',
    fg: '--band-realistic',
    bg: '--band-surface',
    kind: 'non-text',
    note: 'The surface, not the page ground. All three fills measure 1.0 to 1.4:1 on the lime --bg limelight uses, which is why they render on --band-surface instead.',
  },
  {
    label: 'Improbable Fill on Its Surface',
    fg: '--band-improbable',
    bg: '--band-surface',
    kind: 'non-text',
  },
  {
    label: 'Highly Improbable Fill on Its Surface',
    fg: '--band-highly-improbable',
    bg: '--band-surface',
    kind: 'non-text',
  },
  { label: 'Band Caption on Its Surface', fg: '--band-surface-text', bg: '--band-surface', kind: 'text' },
  {
    label: 'Invalid Field Text on Its Fill',
    fg: '--field-invalid-text',
    bg: '--field-invalid-bg',
    kind: 'text',
  },
  {
    label: 'Invalid Field Border on Its Fill',
    fg: '--danger',
    bg: '--field-invalid-bg',
    kind: 'non-text',
  },
  { label: 'Chart Labels on Ground', fg: '--chart-text', bg: '--bg', kind: 'text' },
  { label: 'Plotted Series on Ground', fg: '--chart-actual', bg: '--bg', kind: 'non-text' },
];

export interface ContrastReading {
  readonly pair: ContrastPair;
  /** The WCAG 2.1 ratio, or `null` when either side is not declared in this skin. */
  readonly ratio: number | null;
  /** 4.5 for text, 3 for anything else that has to be seen. */
  readonly threshold: number;
  /** `null` when the ratio is. */
  readonly passes: boolean | null;
}

/**
 * Reads one pair against a live value map.
 *
 * The background is composited over the skin's own `--bg` first, because a translucent surface
 * is only as dark as what it sits on (this is the arithmetic the w1.03 top-bar defect turned
 * on: `rgba(10, 11, 12, 0.92)` over lime is not near-black). The foreground is then composited
 * over that background, which is what makes a translucent type colour such as
 * `--chart-text: rgba(220, 230, 240, 0.5)` score the colour a reader actually sees.
 */
export function readPair(
  pair: ContrastPair,
  values: ReadonlyMap<string, string>,
  root: ReadonlyMap<string, string>,
): ContrastReading {
  const threshold = pair.kind === 'text' ? AA_TEXT : AA_NON_TEXT;
  const groundCss = resolveValue('--bg', values, root);
  const ground: Rgb = (groundCss === undefined ? null : parseColour(groundCss)) ?? [0, 0, 0];

  const bgCss = resolveValue(pair.bg, values, root);
  const fgCss = resolveValue(pair.fg, values, root);
  const bg = bgCss === undefined ? null : parseColour(bgCss, ground);
  const fg = fgCss === undefined || bg === null ? null : parseColour(fgCss, bg);
  if (bg === null || fg === null) {
    return { pair, ratio: null, threshold, passes: null };
  }
  const ratio = contrastRatio(fg, bg);
  return { pair, ratio, threshold, passes: ratio >= threshold };
}

/** Every pair the panel can score in this skin, in table order. */
export function readAllPairs(
  values: ReadonlyMap<string, string>,
  root: ReadonlyMap<string, string>,
): readonly ContrastReading[] {
  return CONTRAST_PAIRS.map((pair) => readPair(pair, values, root));
}
