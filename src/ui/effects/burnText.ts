// src/ui/effects/burnText.ts
//
// THE BURN (AM-4a-9, owner approval 2026-11-05: look FAITHFUL, glow ON). One word burns once:
// a value-noise heat field scrolls up through the letters (white-hot at the baseline, then hot
// pink, then wine), flame tongues lick above the cap line from the outside distance field, and a
// soft glow surrounds the word. The envelope rises once (0.06 s) and falls once (0.30 s).
//
// Re-implemented in raw WebGL 1 (no three.js) after the burn in the owner's phone-glow-build
// project, alarm/assets/web/lyrics-core.js FS_LETTER / FS_HALO (heat field, ramp, x1.6 linear
// gain clipped, flame reach, halo). Nothing is copied from the Komikaze pack (visual reference
// only). Report: docs/private/design-2026-11-04/holo-alarm-burn.md.
//
// hash12 below: "Hash without Sine", MIT License, Copyright (c) 2014 David Hoskins.
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software
//   and associated documentation files (the "Software"), to deal in the Software without
//   restriction, including without limitation the rights to use, copy, modify, merge, publish,
//   distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
//   Software is furnished to do so, subject to the following conditions: The above copyright
//   notice and this permission notice shall be included in all copies or substantial portions of
//   the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
//   PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
//   LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
//   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
//   DEALINGS IN THE SOFTWARE.
//
// Units: CSS px for layout, device px in the texture and the shader, seconds for shader time,
// milliseconds for timers. y grows DOWN in texture space (row 0 = top). Colours come from the
// --burn-* tokens (src/ui/styles/tokens.css) at create time, never from literals here.
//
// Reduced motion: burn() draws ONE still frame and requests no animation frame. No WebGL, a
// shader that does not compile, or a lost context: createBurn returns null (or the handle
// disposes itself) and the caller shows the plain styled text.

/**
 * THE LOOK SWITCH. 'faithful' (owner ruling 2026-11-05): the lyrics-core fire ramp, x1.6 clipped
 * gain, glow on. 'cel' (holo-alarm-burn.md "Two looks"): three flat token bands (--burn-cool,
 * --burn-mid, --burn-hot) with hard edges, no gain, no glow; inside DESIGN.md's no-gradient,
 * no-blur rules except for the motion itself. One constant, one place: change it here.
 */
export type BurnLook = 'faithful' | 'cel';
export const BURN_LOOK: BurnLook = 'faithful';

/** The shader switches for a look: uHard 0/1 (flat bands), uHalo 0/1 (glow), uGain linear. */
export function lookUniforms(look: BurnLook): { hard: 0 | 1; halo: 0 | 1; gain: number } {
  return look === 'cel' ? { hard: 1, halo: 0, gain: 1 } : { hard: 0, halo: 1, gain: BURN_GAIN };
}

/** [s] One burn, rise to fall. */
export const BURN_S = 1.2;
/** [s] Envelope rise and fall (lyrics-core.js BURN_RISE / BURN_FALL). */
export const BURN_RISE_S = 0.06;
export const BURN_FALL_S = 0.3;
/** [s] The shader time of the reduced-motion still frame: bands formed, frozen. */
export const STILL_FRAME_S = 0.45;
/** Linear-light gain before the clip (lyrics-core.js BURN_GAIN, the "HDR clipped" look). */
const BURN_GAIN = 1.6;
/** [device px per CSS px] Texture resolution cap: the texture cost grows with its square. */
export const DPR_CAP = 2;

const VS =
  'attribute vec2 aP; varying vec2 vUv; void main(){ vUv = vec2(aP.x * 0.5 + 0.5, 0.5 - aP.y * 0.5); gl_Position = vec4(aP, 0.0, 1.0); }';

/**
 * THE GLOW FADE, one definition for the shader (FS) and its tests. Without it the glow stays
 * nonzero where the distance texture clamps (|d| = spread) and at the canvas edge, so a flat
 * rectangle of haze shows round every word, burning or lit. spreadFrom/spreadTo: fraction of
 * the packed distance range over which the glow falls to zero; edgeCap [cap heights]: distance
 * from the outermost pixel centre over which glow and flame tongues fall to zero. Both act only
 * outside the glyphs: inside them (coverage 1) the glow and flames are already zero.
 */
const GLOW_FADE = { spreadFrom: 0.5, spreadTo: 0.9, edgeCap: 0.2 } as const;

/** Edge factor 0..1 at edgeOverCap [cap heights] from the outermost pixel centre (0 there). */
export function edgeFade(edgeOverCap: number): number {
  return smoothstep(0, GLOW_FADE.edgeCap, edgeOverCap);
}

/** Glow factor 0..1 at dOverSpread (signed distance / spread, + outside) and edgeOverCap. */
export function glowFade(dOverSpread: number, edgeOverCap: number): number {
  return (1 - smoothstep(GLOW_FADE.spreadFrom, GLOW_FADE.spreadTo, Math.max(dOverSpread, 0))) * edgeFade(edgeOverCap);
}

/** A GLSL float literal (always with a decimal point). */
const glslFloat = (x: number): string => x.toFixed(3);

// uSize [device px]; uT [s]; uE 0..1; uSpread, uCap, uBase [device px]; uGain linear; uHard and
// uHalo 0/1 (lookUniforms); uFlame 0/1 (1 = flame tongues above the cap line, 0 = none: the
// static lit word, litText.ts); colours are linear RGB: resting letter (cool), fire deep -> mid
// -> hot, glow. The glow and flames fade to zero at the canvas edge (GLOW_FADE, edgeFade,
// glowFade) for the burn and the lit word alike. With uHard 0, uHalo 1, uFlame 1 the arithmetic
// inside the glyphs is the faithful look unchanged.
export const FS = [
  '#ifdef GL_FRAGMENT_PRECISION_HIGH',
  'precision highp float;',
  '#else',
  'precision mediump float;',
  '#endif',
  'uniform sampler2D uTex; uniform vec2 uSize;',
  'uniform float uT, uE, uSpread, uCap, uBase, uSeed, uGain;',
  'uniform float uHard, uHalo, uFlame;',
  'uniform vec3 uCool, uDeep, uMid, uHot, uGlow;',
  'varying vec2 vUv;',
  // Hash without Sine (c) 2014 David Hoskins, MIT; see the notice at the top of this file.
  'float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
  'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y); }',
  'vec3 l2s(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
  'void main(){',
  '  vec4 tx = texture2D(uTex, vUv); vec2 px = vUv * uSize;',
  '  float a = tx.a, d = (tx.r - 0.5) * 2.0 * uSpread, dOut = max(d, 0.0) / uCap;',
  '  float hy = (uBase - px.y) / uCap;',
  '  vec2 fp = vec2(px.x / uCap * 3.0 + uSeed * 17.0, hy * 2.5 - uT * 1.6);',
  '  float n = 0.65 * vnoise(fp) + 0.35 * vnoise(fp * 2.1 + 3.7);',
  '  float heat = clamp(1.15 - hy + 0.55 * (n - 0.5), 0.0, 1.0);',
  '  vec3 fc = mix(uDeep, uMid, smoothstep(0.25, 0.5, heat)); fc = mix(fc, uHot, smoothstep(0.62, 0.85, heat));',
  '  vec3 col = mix(uCool, min(fc * uGain, 1.0), uE * smoothstep(0.18, 0.32, heat));',
  // Cel: three flat bands by heat (cool, mid, hot), snapped on at half envelope.
  '  float on = step(0.5, uE);',
  '  vec3 cel = mix(uCool, uMid, step(0.32, heat) * on); cel = mix(cel, uHot, step(0.68, heat) * on);',
  '  col = mix(col, cel, uHard);',
  '  vec3 c = col * a; float al = a;',
  // edgeFade: [cap heights] from the outermost pixel centre, so that pixel gets exactly 0.
  '  vec2 ep = min(px, uSize - px) - 0.5;',
  `  float edge = smoothstep(0.0, ${glslFloat(GLOW_FADE.edgeCap)}, min(ep.x, ep.y) / uCap);`,
  '  float up = clamp((hy - 0.55) / 0.4, 0.0, 1.0);',
  '  float reach = 0.03 + up * (0.05 + 0.42 * n * n);',
  '  float h2 = 1.0 - dOut / reach;',
  '  float t2 = mix(smoothstep(0.0, 0.08, h2) * uE, step(0.04, h2) * on, uHard) * (1.0 - a) * uFlame * edge;',
  '  vec3 f2 = mix(uDeep, uMid, smoothstep(0.05, 0.45, h2)); f2 = mix(f2, uHot, smoothstep(0.55, 0.9, h2));',
  '  f2 = mix(min(f2 * uGain, 1.0), mix(uMid, uHot, step(0.6, h2)), uHard);',
  '  c += f2 * t2; al += t2 * (1.0 - al);',
  // glowFade: zero before |d| reaches uSpread (where the texture clamps) and at the canvas edge.
  `  float fade = (1.0 - smoothstep(${glslFloat(GLOW_FADE.spreadFrom)}, ${glslFloat(GLOW_FADE.spreadTo)}, max(d, 0.0) / uSpread)) * edge;`,
  '  float g = exp(-dOut / 0.32) * uE * uHalo * fade * (1.0 - al); c += uGlow * g; al += g;',
  '  if (al < 0.002) discard;',
  '  gl_FragColor = vec4(l2s(c / al) * al, al);',
  '}',
].join('\n');

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** The burn's envelope at time t [s] of a burn lasting burnS [s]: 0 outside, 1 at full heat. */
export function envelope(t: number, burnS: number = BURN_S): number {
  if (t < 0 || t > burnS) return 0;
  return smoothstep(0, BURN_RISE_S, t) * (1 - smoothstep(burnS - BURN_FALL_S, burnS, t));
}

/** Exact 1-D squared distance transform (Felzenszwalb & Huttenlocher 2012, lower envelope). */
function edt1(g: Float64Array, off: number, st: number, n: number, f: Float64Array, v: Int32Array, z: Float64Array): void {
  for (let q = 0; q < n; q++) f[q] = g[off + q * st] ?? 0;
  let k = 0;
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    // z[0] is -1e20, so the walk back stops at k = 0 at the latest.
    let s: number;
    for (;;) {
      const r = v[k] ?? 0;
      s = ((f[q] ?? 0) - (f[r] ?? 0) + q * q - r * r) / (2 * q - 2 * r);
      if (k > 0 && s <= (z[k] ?? 0)) k--;
      else break;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? 1e20) < q) k++;
    const r = v[k] ?? 0;
    g[off + q * st] = (f[r] ?? 0) + (q - r) * (q - r);
  }
}

/**
 * Signed distance field of a coverage mask. alpha: 0..255 per pixel, row-major w x h.
 * Returns signed distance [px], positive outside the glyphs, negative inside.
 */
export function sdf(alpha: Uint8Array, w: number, h: number): Float32Array {
  const size = w * h;
  const outer = new Float64Array(size);
  const inner = new Float64Array(size);
  const m = Math.max(w, h);
  const f = new Float64Array(m);
  const v = new Int32Array(m);
  const z = new Float64Array(m + 1);
  for (let i = 0; i < size; i++) {
    const a = (alpha[i] ?? 0) / 255;
    const e = 0.5 - a;
    if (a >= 1) {
      outer[i] = 0;
      inner[i] = 1e20;
    } else if (a <= 0) {
      outer[i] = 1e20;
      inner[i] = 0;
    } else {
      outer[i] = e > 0 ? e * e : 0;
      inner[i] = e < 0 ? e * e : 0;
    }
  }
  for (const g of [outer, inner]) {
    for (let x = 0; x < w; x++) edt1(g, x, w, h, f, v, z);
    for (let y = 0; y < h; y++) edt1(g, y * w, 1, w, f, v, z);
  }
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) out[i] = Math.sqrt(outer[i] ?? 0) - Math.sqrt(inner[i] ?? 0);
  return out;
}

/**
 * '#rgb', '#rrggbb' or 'rgb(r, g, b)' (a computed token) -> linear RGB 0..1; null when unreadable.
 * A custom property computes to its authored text, so '#fff' arrives as written (--panel-text).
 */
export function cssColourToLinear(value: string): [number, number, number] | null {
  let s = value.trim();
  let rgb: number[];
  if (/^#[0-9a-f]{3}$/i.test(s)) s = `#${[...s.slice(1)].map((h) => h + h).join('')}`;
  if (/^#[0-9a-f]{6}$/i.test(s)) {
    const n = parseInt(s.slice(1), 16);
    rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else {
    const parts = /^rgba?\(([^)]*)\)$/i.exec(s)?.[1]?.match(/[\d.]+/g);
    if (parts === undefined || parts === null || parts.length < 3) return null;
    rgb = parts.slice(0, 3).map(Number);
  }
  const lin = rgb.map((u) => {
    const c = u / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return [lin[0] ?? 0, lin[1] ?? 0, lin[2] ?? 0];
}

/** CSS font-stretch percentage -> the keyword CanvasRenderingContext2D.fontStretch accepts. */
export function stretchKeyword(computed: string): string {
  const pct = computed.endsWith('%') ? Number(computed.slice(0, -1)) : NaN; // [%]
  if (!Number.isFinite(pct)) return computed === '' ? 'normal' : computed;
  const steps: readonly [number, string][] = [
    [50, 'ultra-condensed'],
    [62.5, 'extra-condensed'],
    [75, 'condensed'],
    [87.5, 'semi-condensed'],
    [100, 'normal'],
    [112.5, 'semi-expanded'],
    [125, 'expanded'],
    [150, 'extra-expanded'],
    [200, 'ultra-expanded'],
  ];
  let best = steps[4] ?? [100, 'normal'];
  for (const step of steps) if (Math.abs(step[0] - pct) < Math.abs(best[0] - pct)) best = step;
  return best[1];
}

export interface BurnOptions {
  /** CSS font shorthand pieces of the DOM word, read from its computed style. */
  fontStyle: string;
  fontWeight: string;
  fontSizePx: number; // [CSS px]
  fontFamily: string;
  fontStretch: string; // computed, e.g. '62%'
  letterSpacingPx: number; // [CSS px]
  /** Reduced motion: burn() draws one still frame, no animation frames. */
  reduced: boolean;
  /** 0..1, varies the noise between words. */
  seed?: number;
  /** Defaults to BURN_LOOK, the one switch. */
  look?: BurnLook;
}

export interface BurnHandle {
  canvas: HTMLCanvasElement;
  /** True while an animation frame loop is scheduled. Never true under reduced motion. */
  readonly running: boolean;
  /** Burns once; resolves when the burn has ended (or the handle was disposed). */
  burn: () => Promise<void>;
  dispose: () => void;
}

/** The tokens the burn reads, in uniform order: resting letter, fire deep, mid, hot, glow. */
export const BURN_TOKENS = ['--burn-cool', '--burn-deep', '--burn-mid', '--burn-hot', '--burn-glow'] as const;
/** Five colour token names in the shader's uniform order (BURN_TOKENS or litText's LIT_TOKENS). */
export type PaletteTokens = readonly [string, string, string, string, string];
/** The colour uniforms, in the order of a PaletteTokens. */
const COLOUR_UNIFORMS = ['uCool', 'uDeep', 'uMid', 'uHot', 'uGlow'] as const;
type Linear = [number, number, number];

/** The computed palette at `host` in linear RGB, or null when a token does not resolve. */
export function readPalette(host: Element, tokens: PaletteTokens): Linear[] | null {
  const styles = getComputedStyle(host);
  const out: Linear[] = [];
  for (const token of tokens) {
    const colour = cssColourToLinear(styles.getPropertyValue(token));
    if (colour === null) return null; // a token that does not resolve: plain text, not a guess
    out.push(colour);
  }
  return out;
}

/** The DOM word's font, read from its computed style (CSS px). */
export type WordFont = Pick<
  BurnOptions,
  'fontStyle' | 'fontWeight' | 'fontSizePx' | 'fontFamily' | 'fontStretch' | 'letterSpacingPx'
>;

/** A word rasterised into the shader's texture: coverage in A, signed distance in R. */
export interface WordRaster {
  W: number; // [device px] texture width
  H: number; // [device px] texture height
  tex: Uint8Array; // RGBA, W x H
  cap: number; // [device px] cap height
  base: number; // [device px] baseline row (y down)
  padT: number; // [device px] room above the cap line
  spread: number; // [device px] distance range packed into R
  dpr: number; // [device px / CSS px]
  textW: number; // [device px] the word's advance width as the canvas measured it
}

/** Rasterises `text` in `font` at the capped device pixel ratio; null without a 2D context. */
export function rasterWord(text: string, font: WordFont): WordRaster | null {
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP); // [device px / CSS px]
  const sizeDev = font.fontSizePx * dpr; // [device px]
  const raster = document.createElement('canvas').getContext('2d');
  if (raster === null) return null;
  const setFont = (): void => {
    raster.font = `${font.fontStyle} ${font.fontWeight} ${String(sizeDev)}px ${font.fontFamily}`;
    if ('fontStretch' in raster) raster.fontStretch = stretchKeyword(font.fontStretch) as CanvasFontStretch;
    if ('letterSpacing' in raster) raster.letterSpacing = `${String(font.letterSpacingPx * dpr)}px`;
  };
  setFont();
  const metrics = raster.measureText(text);
  const cap = raster.measureText('H').actualBoundingBoxAscent || sizeDev * 0.7; // [device px]
  const padT = Math.ceil(0.75 * cap); // room for flames above the cap line
  const padB = Math.ceil(0.2 * cap + metrics.actualBoundingBoxDescent);
  const padX = Math.ceil(0.35 * cap);
  const W = Math.ceil(metrics.width + 2 * padX); // [device px]
  const H = Math.ceil(padT + cap + padB); // [device px]
  const base = padT + cap; // [device px] baseline row
  raster.canvas.width = W;
  raster.canvas.height = H;
  setFont(); // resizing a canvas resets its state
  raster.fillStyle = '#fff'; // coverage mask only (alpha channel is read); not a painted colour
  raster.textBaseline = 'alphabetic';
  raster.fillText(text, padX, base);
  const img = raster.getImageData(0, 0, W, H).data;
  const alpha = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = img[4 * i + 3] ?? 0;
  const spread = Math.ceil(0.6 * cap); // [device px] distance range packed into the texture
  const dist = sdf(alpha, W, H);
  const tex = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    tex[4 * i] = Math.max(0, Math.min(255, Math.round((0.5 + (dist[i] ?? 0) / (2 * spread)) * 255)));
    tex[4 * i + 3] = alpha[i] ?? 0;
  }
  return { W, H, tex, cap, base, padT, spread, dpr, textW: metrics.width };
}

/** Sizes a canvas to a raster and centres the cap on its host (burn-canvas / lit-canvas CSS). */
export function placeCanvas(canvas: HTMLCanvasElement, r: WordRaster): void {
  canvas.width = r.W;
  canvas.height = r.H;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.width = `${String(r.W / r.dpr)}px`; // [CSS px]
  canvas.style.height = `${String(r.H / r.dpr)}px`; // [CSS px]
  // Cap centre on the host's centre: shift by the canvas centre's distance from the cap centre.
  canvas.style.marginTop = `${String((r.H / 2 - (r.padT + r.cap / 2)) / r.dpr)}px`; // [CSS px]
}

/** One compiled burn program on a context, with its quad and its texture. */
export interface BurnProgram {
  program: WebGLProgram;
  buffer: WebGLBuffer | null;
  texture: WebGLTexture | null;
  u: (name: string) => WebGLUniformLocation | null;
}

/** Compiles and binds the burn program on `gl`; null when a shader fails. */
export function buildProgram(gl: WebGLRenderingContext): BurnProgram | null {
  const shader = (type: number, src: string): WebGLShader | null => {
    const s = gl.createShader(type);
    if (s === null) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) === true ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VS);
  const fs = shader(gl.FRAGMENT_SHADER, FS);
  const program = gl.createProgram();
  if (vs === null || fs === null || program === null) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) return null;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'aP');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const u = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name);
  gl.uniform1i(u('uTex'), 0);
  return { program, buffer, texture, u };
}

/** Uploads a word and its constants (size, palette, look, seed, flames) to a program. */
export function loadWord(
  gl: WebGLRenderingContext,
  p: BurnProgram,
  r: WordRaster,
  palette: Linear[],
  look: BurnLook,
  seed: number,
  flame: 0 | 1,
): void {
  gl.bindTexture(gl.TEXTURE_2D, p.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, r.W, r.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, r.tex);
  gl.uniform2f(p.u('uSize'), r.W, r.H);
  gl.uniform1f(p.u('uSpread'), r.spread);
  gl.uniform1f(p.u('uCap'), r.cap);
  gl.uniform1f(p.u('uBase'), r.base);
  gl.uniform1f(p.u('uSeed'), seed);
  const l = lookUniforms(look);
  gl.uniform1f(p.u('uGain'), l.gain);
  gl.uniform1f(p.u('uHard'), l.hard);
  gl.uniform1f(p.u('uHalo'), l.halo);
  gl.uniform1f(p.u('uFlame'), flame);
  for (let i = 0; i < COLOUR_UNIFORMS.length; i++) gl.uniform3fv(p.u(COLOUR_UNIFORMS[i] ?? ''), palette[i] ?? [0, 0, 0]);
  gl.viewport(0, 0, r.W, r.H);
  gl.clearColor(0, 0, 0, 0);
}

/** One frame at shader time t [s] and envelope e (0..1). */
export function drawFrame(gl: WebGLRenderingContext, p: BurnProgram, t: number, e: number): void {
  gl.uniform1f(p.u('uT'), t); // [s]
  gl.uniform1f(p.u('uE'), e);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/** Does this environment offer WebGL 1 at all? (jsdom does not.) */
export function webglAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.WebGLRenderingContext === 'function';
}

/**
 * Builds the canvas for `text` over `host` (appended to it, aria-hidden). Returns null without
 * WebGL, without a 2D context, or when a shader fails: the caller then shows the plain text.
 */
export function createBurn(host: HTMLElement, text: string, opts: BurnOptions): BurnHandle | null {
  if (!webglAvailable() || text.trim() === '') return null;
  const palette = readPalette(host, BURN_TOKENS);
  if (palette === null) return null;
  const r = rasterWord(text, opts);
  if (r === null) return null;
  const canvas = document.createElement('canvas');
  placeCanvas(canvas, r);
  canvas.className = 'burn-canvas';
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (gl === null) return null;
  const p = buildProgram(gl);
  if (p === null) return null;
  loadWord(gl, p, r, palette, opts.look ?? BURN_LOOK, opts.seed ?? 0.31, 1);
  const { program, buffer, texture } = p;

  const draw = (t: number): void => {
    drawFrame(gl, p, t, envelope(t));
  };

  let raf = 0;
  let timer: number | undefined;
  let running = false;
  let disposed = false;
  let finish: (() => void) | null = null;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(timer);
    running = false;
    canvas.removeEventListener('webglcontextlost', dispose);
    if (!gl.isContextLost()) {
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    canvas.remove();
    finish?.();
    finish = null;
  };
  // A lost context ends the burn: the caller shows the plain text again.
  canvas.addEventListener('webglcontextlost', dispose);

  host.appendChild(canvas);
  draw(0); // envelope 0: the resting lime word, until burn()

  return {
    canvas,
    get running() {
      return running;
    },
    burn: () =>
      new Promise<void>((resolve) => {
        if (disposed) {
          resolve();
          return;
        }
        finish = resolve;
        if (opts.reduced) {
          // One still frame, held for the burn's length by a single timeout: no frame loop.
          draw(STILL_FRAME_S);
          timer = window.setTimeout(() => {
            finish?.();
            finish = null;
          }, BURN_S * 1000); // [ms]
          return;
        }
        running = true;
        const start = performance.now(); // [ms]
        const frame = (now: number): void => {
          if (disposed) return;
          const t = (now - start) / 1000; // [s]
          draw(Math.min(t, BURN_S));
          if (t < BURN_S) {
            raf = requestAnimationFrame(frame);
            return;
          }
          running = false;
          finish?.();
          finish = null;
        };
        raf = requestAnimationFrame(frame);
      }),
    dispose,
  };
}
