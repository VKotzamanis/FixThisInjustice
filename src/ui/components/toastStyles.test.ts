// Brief 5.2: where the toast sits and what it may intercept, read from the sheet's text.
import { describe, expect, it } from 'vitest';
import toastCss from './toastQueue.css?raw';

function bodyOf(selector: string): string {
  const clean = toastCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const m = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
    (r) => (r[1] ?? '').trim().replace(/\s+/g, ' ') === selector,
  );
  if (m === undefined) throw new Error(`toastQueue.css: no rule ${selector}`);
  return m[2] ?? '';
}

describe('toasts at the top, compact, tap-through (brief 5.2; F03, C08)', () => {
  it('stack sits under the header, inside the gutter, on the toast rung', () => {
    const b = bodyOf('.toast-stack');
    expect(b).toMatch(/top:\s*calc\(var\(--header-h\) \+ env\(safe-area-inset-top\) \+ var\(--space-2\)\);/);
    expect(b).not.toMatch(/bottom:/);
    expect(b).toMatch(/width:\s*min\(32rem, calc\(100vw - 2 \* var\(--gutter\)\)\);/);
    expect(b).toMatch(/z-index:\s*var\(--z-toast\);/);
    expect(b).toMatch(/pointer-events:\s*none;/);
  });

  it('the toast body takes no taps and is at most 96 px; only its buttons take taps', () => {
    const b = bodyOf('.toast');
    expect(b).toMatch(/pointer-events:\s*none;/);
    expect(b).toMatch(/max-height:\s*96px;/);
    expect(bodyOf('.toast button')).toMatch(/pointer-events:\s*auto;/);
  });

  it('marks the class with a top rule, never a side rule over 1 px (craft floor)', () => {
    const clean = toastCss.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(clean).not.toMatch(/border-left:\s*[2-9]px/);
    expect(clean).not.toMatch(/border-left-color/);
    expect(bodyOf('.toast')).toMatch(/border-top:\s*2px solid var\(--accent\);/);
  });

  it('enters from 8 px above over --dur-base', () => {
    expect(bodyOf('.toast')).toMatch(/animation:\s*toast-in var\(--dur-base\) var\(--ease-out\);/);
    expect(toastCss).toMatch(/@keyframes toast-in\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*translateY\(-8px\);/);
  });
});
