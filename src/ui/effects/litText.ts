// src/ui/effects/litText.ts
//
// THE LIT WORD (owner answer to review item 8, 2026-11-05: "use the font and shader font that we
// use on (9) but with lime green accents? no burn affect needed"). The burn's own shader
// (burnText.ts FS, faithful look, glow on) drawn ONCE as a still frame: full envelope, the heat
// field frozen at STILL_FRAME_S, flame tongues off (uFlame 0), recoloured from the --lit-* tokens
// (lime accents, src/ui/styles/tokens.css). No heat animation, no requestAnimationFrame, no timer.
//
// GPU COST IS BOUNDED TWO WAYS:
//  1. ONE shared WebGL context for every lit word in the app: an offscreen canvas, never in the
//     DOM, created on first use. Each word is drawn into it and copied with drawImage into a
//     plain 2D canvas (preserveDrawingBuffer keeps the frame readable for that copy).
//  2. A cache of finished frames keyed by text, font, device pixel ratio and resolved colours
//     (litCacheKey), at most CACHE_MAX entries, oldest dropped first. A re-render, a remount or a
//     second copy of the same word (the marquee doubles its track) is a 2D drawImage, not a draw.
//  A lost context is dropped; the next word builds a new one. Cached frames stay valid (2D).
//
// Units: CSS px for layout, device px in the texture, seconds for shader time.
import {
  BURN_LOOK,
  DPR_CAP,
  STILL_FRAME_S,
  buildProgram,
  drawFrame,
  loadWord,
  placeCanvas,
  rasterWord,
  readPalette,
  webglAvailable,
  type BurnProgram,
  type PaletteTokens,
  type WordFont,
} from './burnText';

/** The lit palette, in the burn's uniform order: resting letter, deep, mid, hot, glow. */
export const LIT_TOKENS: PaletteTokens = ['--lit-cool', '--lit-deep', '--lit-mid', '--lit-hot', '--lit-glow'];

/** The one frame a lit word shows: t [s] shader time, e envelope 0..1, flame 0/1. */
export const LIT_FRAME = { t: STILL_FRAME_S, e: 1, flame: 0 } as const;

/** [entries] Finished frames kept; a page shows about a dozen lit words. */
const CACHE_MAX = 64;
/** Fixed noise seed, so a word looks the same wherever it is drawn. */
const LIT_SEED = 0.31;

/**
 * The owner's switch (tokens.css --panel-glow): its computed value. 'none' or unset keeps the
 * plain CSS text; anything else (the static glow shadow) turns the lit word on.
 */
export function litSwitchOn(value: string): boolean {
  const v = value.trim();
  return v !== '' && v !== 'none';
}

/** [fraction] Largest canvas-vs-DOM width difference a frame may have, else it would misalign. */
export const WIDTH_TOLERANCE = 0.04;

/**
 * Does the canvas word match the DOM word's width? [CSS px both] WebKit's canvas has no
 * fontStretch, so a condensed label (75 %) rasterises at full width: that frame is refused and
 * the CSS text stays. A DOM width of 0 (not laid out, jsdom) is not a measurement: accepted.
 */
export function widthMatches(canvasPx: number, domPx: number): boolean {
  if (!(domPx > 0)) return true;
  return Math.abs(canvasPx - domPx) <= Math.max(1, WIDTH_TOLERANCE * domPx);
}

/** Everything that changes a lit word's pixels. */
export function litCacheKey(text: string, font: WordFont, dpr: number, colours: readonly string[]): string {
  return [
    text,
    font.fontStyle,
    font.fontWeight,
    String(font.fontSizePx),
    font.fontFamily,
    font.fontStretch,
    String(font.letterSpacingPx),
    String(dpr),
    ...colours,
  ].join('|');
}

interface Shared {
  gl: WebGLRenderingContext;
  canvas: HTMLCanvasElement;
  program: BurnProgram;
}

let shared: Shared | null = null;
const cache = new Map<string, HTMLCanvasElement>();

/** The one shared context, built on first use; null without WebGL or when a shader fails. */
function context(): Shared | null {
  if (shared !== null && !shared.gl.isContextLost()) return shared;
  shared = null;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', {
    premultipliedAlpha: true,
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true, // the frame is read back by drawImage after the draw
  });
  if (gl === null) return null;
  const program = buildProgram(gl);
  if (program === null) return null;
  canvas.addEventListener('webglcontextlost', () => {
    shared = null;
  });
  shared = { gl, canvas, program };
  return shared;
}

/** A fresh 2D canvas holding a copy of `source`, placed like the source frame. */
function copyOf(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  out.style.cssText = source.style.cssText;
  out.setAttribute('aria-hidden', 'true');
  out.className = 'lit-canvas';
  const ctx = out.getContext('2d');
  if (ctx === null) return null;
  ctx.drawImage(source, 0, 0);
  return out;
}

/**
 * The lit frame of `text` in `font`, coloured from the --lit-* tokens computed at `host`, as a
 * new aria-hidden 2D canvas (class lit-canvas) the caller appends. Null without WebGL, with a
 * token that does not resolve, or when the shader fails: the caller keeps the plain text.
 */
export function renderLit(host: Element, text: string, font: WordFont, domWidthPx = 0): HTMLCanvasElement | null {
  if (!webglAvailable() || text.trim() === '') return null;
  const styles = getComputedStyle(host);
  const colours = LIT_TOKENS.map((t) => styles.getPropertyValue(t).trim());
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP); // [device px / CSS px], as rasterWord
  const key = litCacheKey(text, font, dpr, colours);
  const hit = cache.get(key);
  if (hit !== undefined && !widthMatches(Number(hit.dataset.textW), domWidthPx)) return null;
  if (hit !== undefined) {
    cache.delete(key); // re-insert: most recently used last
    cache.set(key, hit);
    return copyOf(hit);
  }
  const palette = readPalette(host, LIT_TOKENS);
  if (palette === null) return null;
  const ctx = context();
  if (ctx === null) return null;
  const r = rasterWord(text, font);
  if (r === null || !widthMatches(r.textW / r.dpr, domWidthPx)) return null;
  ctx.canvas.width = r.W;
  ctx.canvas.height = r.H;
  ctx.gl.useProgram(ctx.program.program);
  loadWord(ctx.gl, ctx.program, r, palette, BURN_LOOK, LIT_SEED, LIT_FRAME.flame);
  drawFrame(ctx.gl, ctx.program, LIT_FRAME.t, LIT_FRAME.e);
  const frame = document.createElement('canvas');
  placeCanvas(frame, r);
  frame.dataset.textW = String(r.textW / r.dpr); // [CSS px]
  const fctx = frame.getContext('2d');
  if (fctx === null) return null;
  fctx.drawImage(ctx.canvas, 0, 0);
  cache.set(key, frame);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return copyOf(frame);
}

/** Test seam: drop the cache and the shared context. */
export function resetLit(): void {
  cache.clear();
  shared = null;
}
