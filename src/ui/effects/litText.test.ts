// The static lit word (owner answer to review item 8, 2026-11-05): the burn's font and shader
// look in lime accents, one still frame, no flames, no frame loop, one shared WebGL context.
import { describe, expect, it } from 'vitest';
import { BURN_TOKENS, FS, STILL_FRAME_S } from './burnText';
import { LIT_FRAME, LIT_TOKENS, litCacheKey, litSwitchOn, renderLit } from './litText';

const FONT = {
  fontStyle: 'normal',
  fontWeight: '600',
  fontSizePx: 12, // [CSS px]
  fontFamily: 'Archivo Variable',
  fontStretch: '75%',
  letterSpacingPx: 0.24, // [CSS px]
};

describe('lit word (review item 8)', () => {
  it('reads its own --lit-* tokens in the burn uniform order, never the fire ramp', () => {
    expect(LIT_TOKENS).toEqual(['--lit-cool', '--lit-deep', '--lit-mid', '--lit-hot', '--lit-glow']);
    expect(LIT_TOKENS.length).toBe(BURN_TOKENS.length);
    for (const t of LIT_TOKENS) expect(BURN_TOKENS).not.toContain(t);
  });

  it('is one still frame: full envelope, frozen heat, flames off', () => {
    expect(LIT_FRAME).toEqual({ t: STILL_FRAME_S, e: 1, flame: 0 });
    expect(FS).toMatch(/uniform float [^;]*\buFlame\b/);
    expect(FS).toContain('* uFlame;');
  });

  it('is switched by --panel-glow: none (or unset) keeps the plain text', () => {
    expect(litSwitchOn('none')).toBe(false);
    expect(litSwitchOn('')).toBe(false);
    expect(litSwitchOn('  none ')).toBe(false);
    expect(litSwitchOn('0 0 0.3em #8ace00')).toBe(true);
  });

  it('caches by everything that changes the pixels', () => {
    const colours = ['#8ace00', '#5f8f00', '#c6ff3d', '#ffffff', '#8ace00'];
    const base = litCacheKey('today', FONT, 2, colours);
    expect(litCacheKey('today', FONT, 2, colours)).toBe(base);
    expect(litCacheKey('log', FONT, 2, colours)).not.toBe(base);
    expect(litCacheKey('today', { ...FONT, fontSizePx: 13 }, 2, colours)).not.toBe(base);
    expect(litCacheKey('today', FONT, 3, colours)).not.toBe(base);
    expect(litCacheKey('today', FONT, 2, ['#000000', ...colours.slice(1)])).not.toBe(base);
  });

  it('returns null without WebGL (jsdom), so the caller keeps the CSS text', () => {
    const host = document.createElement('span');
    expect(renderLit(host, 'today', FONT)).toBeNull();
  });
});
