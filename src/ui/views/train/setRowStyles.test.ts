// src/ui/views/train/setRowStyles.test.ts
//
// The set row's layout, asserted in train.css's own text for restPanelStyles.test.ts's reason:
// jsdom computes no layout, so a width cannot be measured here. The widths below were MEASURED
// in headless Chromium (2026-10-18, alpha fixture, 137.8 typed into set 1's load):
//
//   before  `4rem 1fr 1fr auto`: the load input 38 px wide at a 400 px phone and 25 px at 320,
//           against 54 px of text, so "137.8" showed as "13"; its label wrapped to 3 lines.
//   after   the counter and the actions on lines of their own, the two fields half the row each.
//
// The `auto` track held the bodyweight toggle and the Log button at their full width, and the two
// `1fr` fields split what was left after the 4rem counter.
import { describe, expect, it } from 'vitest';
import trainCss from '../../styles/train.css?raw';

const CSS = trainCss.replace(/\/\*[\s\S]*?\*\//g, '');

function bodyOf(selector: string): string {
  const rule = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
    (m) => (m[1] ?? '').trim().replace(/\s+/g, ' ') === selector,
  );
  expect({ selector, found: rule !== undefined }).toEqual({ selector, found: true });
  return rule?.[2] ?? '';
}

describe('set row layout (the load is always shown whole)', () => {
  it('gives the load and the count half the row each', () => {
    // minmax(0, 1fr): equal halves that never push the row past the card.
    expect(bodyOf('.set-row')).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  });

  it('puts the counter and the actions on lines of their own, so neither takes a field\'s width', () => {
    expect(bodyOf('.set-row:not(.done) > .set-marker, .set-row:not(.done) > .set-actions')).toMatch(
      /grid-column:\s*1 \/ -1;/,
    );
  });

  it('leaves the logged row as it was: counter, readout, then Edit and Delete', () => {
    expect(bodyOf('.set-row.done')).toMatch(/grid-template-columns:\s*4rem 1fr auto;/);
  });

  it('lets the Log button take the rest of the actions line beside the bodyweight toggle', () => {
    expect(bodyOf('.set-row:not(.done) .set-actions > button')).toMatch(/flex:\s*1 1 auto;/);
  });
});
