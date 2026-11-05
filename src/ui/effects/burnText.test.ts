import { describe, expect, it } from 'vitest';
import { BURN_S, createBurn, cssColourToLinear, envelope, sdf, stretchKeyword, webglAvailable } from './burnText';

describe('burnText (AM-4a-9)', () => {
  it('rises once and falls once inside the burn, and is zero outside it', () => {
    expect(envelope(-0.01)).toBe(0);
    expect(envelope(0)).toBe(0);
    expect(envelope(0.06)).toBeCloseTo(1, 6);
    expect(envelope(BURN_S / 2)).toBeCloseTo(1, 6);
    expect(envelope(BURN_S)).toBeCloseTo(0, 6);
    expect(envelope(BURN_S + 0.01)).toBe(0);
  });

  it('gives a disc its analytic signed distance within 0.75 px', () => {
    const w = 64;
    const h = 64;
    const r = 16; // [px]
    const alpha = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) alpha[y * w + x] = Math.hypot(x - 32, y - 32) <= r ? 255 : 0;
    const d = sdf(alpha, w, h);
    let worst = 0; // [px]
    for (let y = 4; y < h - 4; y++)
      for (let x = 4; x < w - 4; x++) {
        const exact = Math.hypot(x - 32, y - 32) - r;
        worst = Math.max(worst, Math.abs((d[y * w + x] ?? 0) - exact));
      }
    expect(worst).toBeLessThanOrEqual(1.25); // one-pixel step of the binary mask included
    expect(d[32 * w + 32] ?? 0).toBeLessThan(0); // inside: negative
    expect(d[0] ?? 0).toBeGreaterThan(0); // outside: positive
  });

  it('reads computed token colours into linear RGB', () => {
    expect(cssColourToLinear('#ffffff')).toEqual([1, 1, 1]);
    expect(cssColourToLinear(' rgb(0, 0, 0) ')).toEqual([0, 0, 0]);
    expect(cssColourToLinear('var(--lime)')).toBeNull();
  });

  it('maps the computed font-stretch to a canvas keyword', () => {
    expect(stretchKeyword('62%')).toBe('extra-condensed');
    expect(stretchKeyword('100%')).toBe('normal');
    expect(stretchKeyword('125%')).toBe('expanded');
  });

  it('returns null without WebGL, so the caller keeps the plain text (jsdom has none)', () => {
    expect(webglAvailable()).toBe(false);
    const host = document.createElement('span');
    const handle = createBurn(host, 'mother', {
      fontStyle: 'normal',
      fontWeight: '800',
      fontSizePx: 24,
      fontFamily: 'sans-serif',
      fontStretch: '100%',
      letterSpacingPx: 0,
      reduced: false,
    });
    expect(handle).toBeNull();
    expect(host.querySelector('canvas')).toBeNull();
  });
});
