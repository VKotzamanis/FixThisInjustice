// e2e/support/sweeps.ts
//
// In-page measurements for the P4a acceptances (docs/design/p4-design-brief.md 2-7) that jsdom
// cannot make: computed contrast, computed font sizes, rectangles. Every function runs ONE
// page.evaluate and returns plain data, so a failing spec prints what failed and where.
//
// Contrast is WCAG 2.1 relative luminance on COMPUTED colours: the text colour composited over
// the first ancestor background that is opaque (semi-transparent layers on the way are
// composited in order). Background images (gradients, the CRT layers) are not read; the specs
// seed `scanlines: false`, and no text in the app sits on a gradient.
import type { Page } from '@playwright/test';

export interface ContrastFailure {
  text: string;
  ratio: number;
  need: number;
  px: number;
  where: string;
}

/** Every visible text node whose contrast is under 4.5:1 (3:1 at >= 24 px, or >= 18.66 px bold). */
export async function contrastFailures(page: Page): Promise<ContrastFailure[]> {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number];
    const parse = (css: string): Rgba => {
      const m = /rgba?\(([^)]+)\)/.exec(css);
      if (m === null) return [0, 0, 0, 0];
      const p = (m[1] ?? '').split(/[\s,/]+/).filter((x) => x !== '').map(Number);
      return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
    };
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3];
      return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
    };
    const lum = (c: Rgba): number => {
      const ch = [c[0], c[1], c[2]].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
    };
    const ratio = (a: Rgba, b: Rgba): number => {
      const x = lum(a);
      const y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const backgroundOf = (el: Element): Rgba => {
      const layers: Rgba[] = [];
      for (let n: Element | null = el; n !== null; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg[3] > 0) layers.push(bg);
        if (bg[3] >= 0.99) break;
      }
      let base: Rgba = [255, 255, 255, 1];
      for (let i = layers.length - 1; i >= 0; i -= 1) base = over(layers[i] ?? base, base);
      return base;
    };
    const visible = (el: Element): boolean => {
      if (el.closest('[aria-hidden="true"], .visually-hidden, [hidden]') !== null) return false;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    };
    const out: ContrastFailure[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      const el = node.parentElement;
      if (text === '' || el === null || !visible(el)) continue;
      // WCAG 1.4.3 exempts inactive controls.
      if (el.closest('button:disabled, [aria-disabled="true"]') !== null) continue;
      const style = getComputedStyle(el);
      const bg = backgroundOf(el);
      const fg = over(parse(style.color), bg);
      const px = Number.parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const need = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5;
      const r = ratio(fg, bg);
      if (r < need) {
        out.push({ text: text.slice(0, 40), ratio: Math.round(r * 100) / 100, need, px, where: el.className.toString() });
      }
    }
    return out;
  });
}

/** Visible text set under 12 px (brief 3.1). aria-hidden art is not text to read. */
export async function smallText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[aria-hidden="true"], .visually-hidden, [hidden]') !== null) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const px = Number.parseFloat(getComputedStyle(el).fontSize);
      if (px < 12) out.push(`${el.tagName.toLowerCase()}.${el.className.toString()} ${String(px)}px "${(el.textContent ?? '').trim().slice(0, 30)}"`);
    }
    return out;
  });
}

/** Visible text-entry controls under 16 px (F10; iOS zooms the page on focus below it). */
export async function smallFields(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel =
      "input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']):not([type='hidden']), select, textarea";
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[hidden]') !== null) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const px = Number.parseFloat(getComputedStyle(el).fontSize);
      if (px < 16) out.push(`${el.tagName.toLowerCase()}#${el.id} ${String(px)}px`);
    }
    return out;
  });
}

/** The page's rectangle for the first element matching `selector`, or null. [px] */
export async function rectOf(
  page: Page,
  selector: string,
): Promise<{ top: number; bottom: number; left: number; right: number; width: number; height: number } | null> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  }, selector);
}

/** Whether the element at the centre of `selector`'s box is that element or inside it. */
export async function hitsItself(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el === null) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && (hit === el || el.contains(hit));
  }, selector);
}
