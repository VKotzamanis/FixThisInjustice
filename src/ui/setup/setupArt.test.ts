import { describe, expect, it } from 'vitest';
import { BODY_FAT_CHART_PERCENTAGES } from '../../content/bodyFatChart';
import {
  BODY_FAT_CHART_CROP,
  BODY_FAT_CHART_VIEWS,
  SETUP_ICON_ART,
  bodyFatArtId,
  bodyFatChartArt,
} from './setupArt';

/*
 * The setup wizard's art, read through the module the wizard renders from. The files themselves
 * are the owner's (src/assets/art/, registered in docs/design/2026-09-04-icon-register.csv); what
 * is asserted here is that every id the wizard can ask for resolves to an SVG that takes its
 * colour from the page (currentColor), so no file can go missing or carry its own paint unseen.
 */

describe('setup icon art', () => {
  it('resolves every named icon to a currentColor SVG', () => {
    const ids = Object.keys(SETUP_ICON_ART);
    expect(ids).toHaveLength(12);
    for (const markup of Object.values(SETUP_ICON_ART)) {
      expect(markup.trimStart().startsWith('<svg')).toBe(true);
      expect(markup).toContain('currentColor');
      expect(markup).not.toMatch(/<script|\son[a-z]+=|href=/i);
    }
  });
});

describe('body-fat chart art', () => {
  it('has a front and a side drawing for every percentage, ids derived from the percentages', () => {
    for (const sex of ['male', 'female'] as const) {
      for (const pct of BODY_FAT_CHART_PERCENTAGES[sex]) {
        for (const view of BODY_FAT_CHART_VIEWS) {
          expect(bodyFatArtId(sex, pct, view)).toBe(`bf-${sex}-${String(pct)}-${view}`);
          const markup = bodyFatChartArt(sex, pct, view);
          expect(markup, bodyFatArtId(sex, pct, view)).toBeDefined();
          expect(markup).toContain('currentColor');
        }
      }
    }
  });

  it('crops every drawing to its view box, one box per view so the scale is shared', () => {
    for (const sex of ['male', 'female'] as const) {
      for (const pct of BODY_FAT_CHART_PERCENTAGES[sex]) {
        for (const view of BODY_FAT_CHART_VIEWS) {
          const { x, y, w, h } = BODY_FAT_CHART_CROP[view];
          const markup = bodyFatChartArt(sex, pct, view) ?? '';
          expect(markup).toContain(`viewBox="${String(x)} ${String(y)} ${String(w)} ${String(h)}"`);
          // The source frame the crop was measured in is gone, not left as a second viewBox.
          expect(markup).not.toContain('viewBox="0 0 400 560"');
        }
      }
    }
    // Front and side share one vertical crop, so a pair drawn at one height shares one scale.
    expect(BODY_FAT_CHART_CROP.front.y).toBe(BODY_FAT_CHART_CROP.side.y);
    expect(BODY_FAT_CHART_CROP.front.h).toBe(BODY_FAT_CHART_CROP.side.h);
  });

  it('returns nothing for a percentage with no drawing', () => {
    expect(bodyFatChartArt('female', 15, 'front')).toBeUndefined();
  });
});
