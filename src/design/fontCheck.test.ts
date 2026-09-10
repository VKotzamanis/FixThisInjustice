/**
 * The font availability reading.
 *
 * WHAT THIS SUITE ASSERTS AND WHAT IT CANNOT. The RULE - how the two probes combine into one
 * answer, and what sentence the panel prints - is pure once the probes are injected, and it is
 * asserted exhaustively below. Whether a family is actually installed is a property of a real
 * device: jsdom implements no canvas 2D context and no FontFaceSet, so both real probes answer
 * `null` here and the reading degrades to "could not be checked". That degradation is itself
 * worth pinning, because the alternative - a false alarm on every face - would make the tool
 * lie in the one direction that costs the owner an afternoon.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PROBES,
  describeFontStack,
  fontFaceSetSaysLoaded,
  measuresAsResolved,
  parseFontStack,
  readFamily,
  readFontStack,
} from './fontCheck';
import type { FontProbes } from './fontCheck';

/** Probes that answer whatever the test says, with no DOM involved. */
function probes(check: boolean | null, measure: boolean | null): FontProbes {
  return { check: () => check, measure: () => measure };
}

describe('parseFontStack', () => {
  it('splits the stacks this sheet actually writes, quotes stripped', () => {
    expect(
      parseFontStack("'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace"),
    ).toEqual(['JetBrains Mono Variable', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace']);
    expect(parseFontStack("'Geist Variable', -apple-system, system-ui, sans-serif")).toEqual([
      'Geist Variable',
      '-apple-system',
      'system-ui',
      'sans-serif',
    ]);
    expect(parseFontStack('"Space Mono", monospace')).toEqual(['Space Mono', 'monospace']);
  });

  it('drops empty entries rather than reporting a nameless family', () => {
    expect(parseFontStack('  ,  Menlo ,, ')).toEqual(['Menlo']);
    expect(parseFontStack('')).toEqual([]);
  });
});

describe('readFamily combines the two probes', () => {
  it('says nothing about a generic or a system keyword, and probes neither', () => {
    const check = vi.fn();
    const measure = vi.fn();
    for (const family of ['monospace', 'sans-serif', 'system-ui', 'ui-monospace', '-apple-system']) {
      expect({ family, status: readFamily(family, { check, measure }).status }).toEqual({
        family,
        status: 'generic',
      });
    }
    expect(check).not.toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
  });

  it('treats a var() indirection as unanswerable rather than measuring a nonsense name', () => {
    expect(readFamily('var(--disp)', probes(true, true)).status).toBe('unknown');
  });

  it('reports unavailable on a FALSE from check(), whatever the measurement says', () => {
    // The one thing check() answers reliably: a DECLARED face that has not loaded. See fontCheck.ts.
    expect(readFamily('Archivo Variable', probes(false, true)).status).toBe('unavailable');
  });

  it('does not trust a TRUE from check() on its own', () => {
    // check() returns true for a family it has never heard of, which is the whole caveat.
    expect(readFamily('Not Installed Anywhere', probes(true, false)).status).toBe('unavailable');
  });

  it('reports available when the measurement separates the family from every generic', () => {
    expect(readFamily('Comic Neue', probes(true, true)).status).toBe('available');
    expect(readFamily('Comic Neue', probes(null, true)).status).toBe('available');
  });

  it('reports unknown when neither probe can answer', () => {
    expect(readFamily('Comic Neue', probes(null, null)).status).toBe('unknown');
  });
});

describe('the real probes, in this environment', () => {
  it('answer null in jsdom, which has no canvas context and no FontFaceSet', () => {
    expect(measuresAsResolved('Archivo Variable')).toBeNull();
    expect(fontFaceSetSaysLoaded('Archivo Variable')).toBeNull();
    expect(DEFAULT_PROBES.check('Archivo Variable')).toBeNull();
    expect(readFamily('Archivo Variable').status).toBe('unknown');
  });
});

describe('describeFontStack, the sentence the panel prints', () => {
  it('says the first family is available when it is', () => {
    expect(describeFontStack('monospace')).toBe('monospace: available here.');
    expect(describeFontStack("'Comic Neue', monospace", probes(true, true))).toBe(
      'Comic Neue: available here.',
    );
  });

  it('names what renders instead when the first choice is not available here', () => {
    // The generic at the end of the stack is what the browser will actually draw.
    expect(describeFontStack("'Missing Face', monospace", probes(null, false))).toBe(
      'Missing Face: not available here, showing monospace, the next in the stack.',
    );
  });

  it('says plainly that it could not check, rather than implying an answer', () => {
    expect(describeFontStack("'Archivo Variable', Archivo, sans-serif")).toBe(
      'Archivo Variable: could not be checked in this browser.',
    );
  });

  it('handles a value that names no family at all', () => {
    expect(describeFontStack('   ')).toBe('No family named.');
  });

  it('reads every family in the stack, in order', () => {
    const readings = readFontStack("'A Face', Menlo, monospace", probes(null, null));
    expect(readings.map((reading) => reading.family)).toEqual(['A Face', 'Menlo', 'monospace']);
  });
});
