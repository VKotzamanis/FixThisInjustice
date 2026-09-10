/**
 * The contrast arithmetic, checked against ratios this project already PUBLISHED.
 *
 * Every expected number below is quoted, not computed here:
 *   - round-three section 2.3, restated in the limelight comment of src/ui/styles/tokens.css;
 *   - round-two section 5 (Direction H, Palette), restated in the board comment;
 *   - the band measurement in docs/plans/subagent-briefs/I-goal-target-programme.md, restated
 *     in the `:root` comment.
 *
 * That is what makes this a check rather than a tautology: the panel's readout has to reproduce
 * a table measured by someone else, months earlier, or it is wrong.
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio, formatRatio, parseColour, relativeLuminance, toHex } from './colour';
import type { Rgb } from './colour';

/** The published pair, and the ratio the record says it measures. */
const PUBLISHED: readonly (readonly [string, string, number])[] = [
  // round three, section 2.3: the limelight palette.
  ['#000000', '#8ace00', 10.91],
  ['#454545', '#8ace00', 4.98],
  ['#ffffff', '#8ace00', 1.92],
  ['#ff5fcb', '#8ace00', 1.41],
  ['#000000', '#ff5fcb', 7.75],
  ['#ffffff', '#000000', 21.0],
  ['#8ace00', '#000000', 10.91],
  ['#ff5fcb', '#000000', 7.75],
  // round two, section 5: the board palette.
  ['#ffb000', '#0b0b0c', 10.74],
  ['#ffb000', '#17181a', 9.7],
  // `#000000 on #FFB000` is NOT in this table. See the block below: the published figure for it
  // is wrong, and this suite records what the arithmetic produces rather than matching it.
  ['#e8e4da', '#17181a', 13.99],
  ['#7c8288', '#0b0b0c', 5.06],
  ['#ff6b4a', '#0b0b0c', 6.98],
  // Brief I part 4: the three feasibility band fills, on all three grounds and on black.
  ['#a4eab0', '#0a0b0c', 14.05],
  ['#a4eab0', '#8ace00', 1.37],
  ['#a4eab0', '#0b0b0c', 14.03],
  ['#a4eab0', '#000000', 14.97],
  ['#eac9a4', '#0a0b0c', 12.56],
  ['#eac9a4', '#8ace00', 1.23],
  ['#eac9a4', '#0b0b0c', 12.54],
  ['#eac9a4', '#000000', 13.39],
  ['#eaa6a4', '#0a0b0c', 9.84],
  ['#eaa6a4', '#8ace00', 1.04],
  ['#eaa6a4', '#0b0b0c', 9.83],
  ['#eaa6a4', '#000000', 10.49],
];

function rgb(css: string): Rgb {
  const parsed = parseColour(css);
  if (parsed === null) throw new Error(`not a colour: ${css}`);
  return parsed;
}

describe('the WCAG 2.1 ratio reproduces every published measurement', () => {
  for (const [fg, bg, expected] of PUBLISHED) {
    it(`${fg} on ${bg} is ${expected}:1`, () => {
      expect(Number(contrastRatio(rgb(fg), rgb(bg)).toFixed(2))).toBe(expected);
    });
  }
});

describe('one published figure the arithmetic does not reproduce', () => {
  /*
   * DEFECT IN THE RECORD, FOUND 2026-09-10 BY THIS SUITE. NOT a defect in anything shipped.
   *
   * `docs/design/round2/2026-09-01-round2-plan.md` line 415 records, for the board skin:
   *   "10.74:1 on board - 9.70:1 on flap - black on amber 10.74:1"
   * and `src/ui/styles/tokens.css` restates the third figure verbatim as
   *   "#000000 on #FFB000 = 10.74:1  black type on an amber fill".
   *
   * The first two reproduce exactly (both are in the table above). The third does not, and it
   * cannot: it is the same number as the first, and the two are different quantities. Amber
   * against the near-black board ground divides by that ground's luminance; amber against pure
   * black divides by zero-plus-the-offset, which is necessarily a LARGER ratio. The published
   * value looks like the line above it, copied.
   *
   * The arithmetic below is checked against twenty-five other published pairs in the table
   * above, so the method is not in question. The value is 11.46:1.
   *
   * DIRECTION OF THE ERROR, which is why nothing shipped is affected: the true contrast is
   * BETTER than the record claims, not worse. Black type on the amber fill clears AA either
   * way. Nothing is retuned to match, and tokens.css is NOT edited here: it is outside this
   * brief's file list, and the correction is reported for the owner to make.
   */
  it('is 11.46:1, not the 10.74:1 tokens.css and the round-two plan both record', () => {
    expect(Number(contrastRatio(rgb('#000000'), rgb('#ffb000')).toFixed(2))).toBe(11.46);
  });
});

describe('the alpha composite', () => {
  it('reproduces the w1.03 defect ratios, which is the case the arithmetic exists for', () => {
    // src/app/topbar.test.ts records these: the hard-coded clinical bar, over the lime ground.
    const lime: Rgb = [138, 206, 0];
    const oldBar = parseColour('rgba(10, 11, 12, 0.92)', lime);
    expect(oldBar).not.toBeNull();
    if (oldBar === null) return;
    expect(Number(contrastRatio(rgb('#454545'), oldBar).toFixed(2))).toBe(1.84);
    expect(Number(contrastRatio(rgb('#000000'), oldBar).toFixed(2))).toBe(1.19);
  });

  it('composites an opaque colour to itself, whatever it sits on', () => {
    expect(parseColour('#8ace00', [255, 255, 255])).toEqual([138, 206, 0]);
  });
});

describe('parseColour accepts what the sheet actually writes', () => {
  it('reads the three hex lengths and both rgb forms', () => {
    expect(parseColour('#000')).toEqual([0, 0, 0]);
    expect(parseColour('#0a0b0c')).toEqual([10, 11, 12]);
    expect(parseColour('rgb(10, 11, 12)')).toEqual([10, 11, 12]);
    expect(parseColour('rgb(10 11 12)')).toEqual([10, 11, 12]);
    expect(parseColour('rgba(0, 0, 0, 1)')).toEqual([0, 0, 0]);
    expect(parseColour('#00000080', [255, 255, 255])?.[0]).toBeCloseTo(127.0, 0);
  });

  it('returns null rather than throwing on the things in this sheet that are not colours', () => {
    // Handing the panel a throw mid-keystroke would take the tool down.
    expect(parseColour('163, 230, 53')).toBeNull(); // --accent-rgb
    expect(parseColour('62%')).toBeNull(); // --display-stretch
    expect(parseColour('800')).toBeNull(); // --display-weight
    expect(parseColour('-0.045em')).toBeNull(); // --display-tracking
    expect(parseColour('4px')).toBeNull(); // --shadow-offset
    expect(parseColour("'Space Mono', ui-monospace, monospace")).toBeNull(); // --sans
    expect(parseColour('var(--lime)')).toBeNull();
    expect(parseColour('rebeccapurple')).toBeNull(); // named colours are deliberately refused
    expect(parseColour('')).toBeNull();
  });
});

describe('the reporting helpers', () => {
  it('writes a ratio the way the field writes it', () => {
    expect(formatRatio(10.9099)).toBe('10.91:1');
    expect(formatRatio(21)).toBe('21.00:1');
  });

  it('gives a colour input the #rrggbb it is the only form that control accepts', () => {
    expect(toHex([138, 206, 0])).toBe('#8ace00');
    expect(toHex([0, 0, 0])).toBe('#000000');
    expect(toHex([255.4, -3, 300])).toBe('#ff00ff');
  });

  it('puts black at zero luminance and white at one', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
  });
});
