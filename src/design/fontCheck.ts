/**
 * FONT AVAILABILITY: did this family actually resolve on THIS device?
 *
 * WHY THE TOOL NEEDS IT. A font-family token can be edited to any name at all, and a name that
 * resolves on the author's machine silently falls through to the next entry in the stack on a
 * tester's. An afternoon spent judging a face nobody else can see is the failure this answers.
 *
 * WHY `document.fonts.check()` IS NOT ENOUGH ON ITS OWN, and this is measured behaviour rather
 * than a worry. Per MDN and the CSS Font Loading spec, `check()` answers "can this be rendered
 * without waiting on a font in the FontFaceSet", NOT "is this family available": a family with
 * no matching `@font-face` rule matches nothing, so the method returns TRUE for a name that is
 * not installed anywhere. The behaviour also differs between engines (Mozilla bug 1564845,
 * WebKit bug 156035). So `check()` is used for the one thing it answers reliably - FALSE means
 * a declared face that has not loaded - and the width measurement below answers the rest.
 *
 * THE MEASUREMENT is the long-established canvas-width technique: render a probe string in
 * `"<family>", <generic>` and in `<generic>` alone. If the family resolved, the two widths
 * differ for at least one generic. Three generics are tried because a family can coincidentally
 * measure the same as one of them.
 *
 * THE HONEST LIMIT: a family whose metrics are identical to all three generic defaults reads as
 * unavailable. That is a false negative, not a false positive, and it is the safe direction for
 * this tool: it never tells the owner a face is present when it is not.
 *
 * CANNOT BE FIXED BY TYPING A NAME. `src/ui/styles/tokens.css` line 318 records the constraint:
 * `font-src 'self'`, self-hosted through @fontsource, no external font host. A new web face is a
 * dependency and an import in `src/main.tsx`, never a token edit.
 */

/** Generic families and system keywords. These always resolve; asking about them is meaningless. */
const GENERIC = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
  '-apple-system',
  'blinkmacsystemfont',
  'inherit',
  'initial',
  'unset',
]);

/** The probe: wide, narrow and round glyphs, so two different faces rarely measure the same. */
const PROBE = 'mmmmmmmmmmlliWWW0Oj';

/** The generics the measurement compares against. */
const FALLBACKS = ['monospace', 'serif', 'sans-serif'] as const;

export type FamilyStatus =
  /** A generic or system keyword. Always resolves; nothing to report. */
  | 'generic'
  /** Measured as resolving to a face of its own on this device. */
  | 'available'
  /** Measured as falling through: the next family in the stack is what renders. */
  | 'unavailable'
  /** Neither test could answer here (no canvas context, no FontFaceSet). */
  | 'unknown';

export interface FamilyReading {
  readonly family: string;
  readonly status: FamilyStatus;
}

/**
 * Splits a `font-family` value into its entries, quotes stripped.
 *
 * Top-level commas only, which is all a font stack contains; `var(--x)` is passed through as a
 * single entry so the panel can say it is an indirection rather than measure a nonsense name.
 */
export function parseFontStack(value: string): readonly string[] {
  return value
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, '').trim())
    .filter((entry) => entry.length > 0);
}

/**
 * ONE measuring canvas per document, probed once.
 *
 * A measuring canvas is a singleton by nature: it is never drawn, never attached and never
 * read, so creating a fresh element per keystroke would allocate for nothing. The panel calls
 * this for four font tokens on every render, which is what makes the difference worth having.
 * `null` - no canvas in this environment - is cached too, so a context-less environment is
 * probed once rather than on every reading.
 */
let contextProbed = false;
let sharedContext: CanvasRenderingContext2D | null = null;

function measuringContext(): CanvasRenderingContext2D | null {
  if (!contextProbed) {
    contextProbed = true;
    try {
      sharedContext = document.createElement('canvas').getContext('2d');
    } catch {
      // No canvas in this environment. The caller degrades to 'unknown'.
      sharedContext = null;
    }
  }
  return sharedContext;
}

/** The probe's width in one font shorthand. */
function probeWidth(ctx: CanvasRenderingContext2D, font: string): number {
  ctx.font = font;
  return ctx.measureText(PROBE).width;
}

/**
 * Whether one family resolves to a face of its own, by width measurement.
 *
 * `null` when the environment cannot measure: every width came back 0, which is what a stubbed
 * canvas does, and treating that as "unavailable" would report a false alarm on every face.
 */
export function measuresAsResolved(family: string): boolean | null {
  const ctx = measuringContext();
  if (ctx === null) return null;
  let measured = false;
  for (const fallback of FALLBACKS) {
    const base = probeWidth(ctx, `72px ${fallback}`);
    if (base <= 0) continue;
    measured = true;
    const withFamily = probeWidth(ctx, `72px "${family}", ${fallback}`);
    if (withFamily !== base) return true;
  }
  return measured ? false : null;
}

/**
 * `document.fonts.check()` for one family, or `null` where there is no FontFaceSet.
 *
 * Read the caveat at the top of this file before trusting a TRUE from this.
 */
export function fontFaceSetSaysLoaded(family: string): boolean | null {
  const fonts: FontFaceSet | undefined = document.fonts;
  if (fonts === undefined || typeof fonts.check !== 'function') return null;
  try {
    return fonts.check(`16px "${family}"`);
  } catch {
    // An unparseable family name throws a SyntaxError. Not an answer, so not an alarm.
    return null;
  }
}

/**
 * The two probes, as an injectable pair.
 *
 * Injected rather than stubbed at the DOM: a suite that spied on `document.createElement` to
 * fake a canvas would be testing jsdom rather than this rule, and it would fight the
 * one-canvas cache above. The panel always uses the default pair, which is the real browser.
 */
export interface FontProbes {
  /** `document.fonts.check()`, or null where there is no FontFaceSet. */
  readonly check: (family: string) => boolean | null;
  /** The width measurement, or null where nothing can be measured. */
  readonly measure: (family: string) => boolean | null;
}

export const DEFAULT_PROBES: FontProbes = {
  check: fontFaceSetSaysLoaded,
  measure: measuresAsResolved,
};

/** Both tests, combined into the one answer the panel shows. */
export function readFamily(family: string, probes: FontProbes = DEFAULT_PROBES): FamilyReading {
  const key = family.toLowerCase();
  if (GENERIC.has(key)) return { family, status: 'generic' };
  if (family.startsWith('var(')) return { family, status: 'unknown' };

  // A FALSE here is the one thing check() answers reliably: a declared face that has not loaded.
  if (probes.check(family) === false) return { family, status: 'unavailable' };

  const measured = probes.measure(family);
  if (measured === true) return { family, status: 'available' };
  if (measured === false) return { family, status: 'unavailable' };
  return { family, status: 'unknown' };
}

/** Every family in a stack, in order. */
export function readFontStack(
  value: string,
  probes: FontProbes = DEFAULT_PROBES,
): readonly FamilyReading[] {
  return parseFontStack(value).map((family) => readFamily(family, probes));
}

/**
 * The sentence the panel prints under a font-family control.
 *
 * Names the family that actually renders, which is the fact the owner needs; says plainly when
 * the first choice is not available here.
 */
export function describeFontStack(value: string, probes: FontProbes = DEFAULT_PROBES): string {
  const readings = readFontStack(value, probes);
  if (readings.length === 0) return 'No family named.';
  const first = readings[0];
  if (first === undefined) return 'No family named.';
  const rendering = readings.find((r) => r.status === 'available' || r.status === 'generic');
  if (first.status === 'available' || first.status === 'generic') {
    return `${first.family}: available here.`;
  }
  if (first.status === 'unknown') {
    return `${first.family}: could not be checked in this browser.`;
  }
  const next = rendering === undefined ? 'the browser default' : rendering.family;
  return `${first.family}: not available here, showing ${next}, the next in the stack.`;
}
