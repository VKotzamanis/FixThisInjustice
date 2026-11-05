// Brief 5.1: one sheet geometry for every reading dialog, read from the sheets' text.
import { describe, expect, it } from 'vitest';
import sheetCss from './sheet.css?raw';
import trainCss from '../styles/train.css?raw';
import capsuleCss from '../components/timeCapsule.css?raw';
import atlasCss from '../views/atlas.css?raw';
import phaseCss from '../components/phaseTransition.css?raw';
import motivationCss from '../motivation/motivation.css?raw';
import spotlightCss from '../components/spotlight.css?raw';

function bodyOf(css: string, selector: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
    (m) => (m[1] ?? '').trim().replace(/\s+/g, ' ') === selector,
  );
  if (rule === undefined) throw new Error(`no rule ${selector}`);
  return rule[2] ?? '';
}

describe('one sheet language (brief 5.1)', () => {
  it('the scrim is the token, fixed, at the modal rung, docking its sheet to the bottom', () => {
    const b = bodyOf(sheetCss, '.overlay-scrim');
    expect(b).toMatch(/position:\s*fixed;/);
    expect(b).toMatch(/z-index:\s*var\(--z-modal\);/);
    expect(b).toMatch(/background:\s*var\(--scrim\);/);
    expect(b).toMatch(/align-items:\s*flex-end;/);
  });

  it('the sheet is square, capped by svh after a vh fallback, safe-area padded, scroll-contained', () => {
    const b = bodyOf(sheetCss, '.sheet');
    expect(b).toMatch(/border-radius:\s*0;/);
    expect(b).toMatch(
      /max-height:\s*calc\(100vh - var\(--header-h\) - var\(--space-4\)\);[\s\S]*max-height:\s*calc\(100svh - var\(--header-h\) - env\(safe-area-inset-top\) - var\(--space-4\)\);/,
    );
    expect(b).toMatch(/overscroll-behavior:\s*contain;/);
    expect(b).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(b).toMatch(/animation:\s*sheet-in var\(--dur-base\) var\(--ease-out\);/);
  });

  it('a reading sheet is lime with ink type under a 2 px ink top rule', () => {
    const b = bodyOf(sheetCss, '.sheet-reading');
    expect(b).toMatch(/background:\s*var\(--lime\);/);
    expect(b).toMatch(/color:\s*var\(--ink\);/);
    expect(b).toMatch(/border-top:\s*2px solid var\(--ink\);/);
  });

  it('stops the entrance under reduced motion', () => {
    expect(sheetCss).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.sheet\s*\{\s*animation:\s*none;/);
  });

  it('no dialog sheet restates position, z-index or a scrim of its own', () => {
    const backdrops: Array<[string, string]> = [
      [trainCss, '.vmod-bg, .fcm-bg'],
      [capsuleCss, '.capsule-panel-bg'],
      [atlasCss, '.atlas .atlas-modal-bg'],
      [phaseCss, '.phase-bg'],
      [motivationCss, '.mmod-bg'],
      [spotlightCss, '.spotlight-bg'],
    ];
    for (const [css, selector] of backdrops) {
      const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
      const rule = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
        (m) => (m[1] ?? '').trim().replace(/\s+/g, ' ') === selector,
      );
      // A rule emptied by the move is deleted, which passes too.
      expect(rule?.[2] ?? '', selector).not.toMatch(/position:|z-index:|background:/);
    }
  });

  it('the palette marks its active row as the pink sticker (F06: it was ink on black)', () => {
    const b = bodyOf(spotlightCss, '.spotlight-item.is-active');
    expect(b).toMatch(/background:\s*var\(--accent\);/);
    expect(b).toMatch(/color:\s*var\(--ink\);/);
  });
});
