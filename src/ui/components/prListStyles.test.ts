// src/ui/components/prListStyles.test.ts
//
// One personal record in two lines (owner 2026-10-18, Log "Too verbose"): the name with the
// record's date beside it, then the best set and the estimated 1RM. Asserted in prList.css's own
// text because jsdom computes no layout (setRowStyles.test.ts's reason). Measured in headless
// Chromium (alpha fixture): four stacked lines per record before, two after, at 400 and 320 px.
import { describe, expect, it } from 'vitest';
import prListCss from './prList.css?raw';

const CSS = prListCss.replace(/\/\*[\s\S]*?\*\//g, '');

function bodyOf(selector: string): string {
  const rule = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
    (m) => (m[1] ?? '').trim().replace(/\s+/g, ' ') === selector,
  );
  expect({ selector, found: rule !== undefined }).toEqual({ selector, found: true });
  return rule?.[2] ?? '';
}

describe('personal record row layout', () => {
  it('sets the name beside the date, then the figures on one line below', () => {
    const row = bodyOf('.pr-row');
    expect(row).toMatch(/display:\s*grid;/);
    expect(row).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/);
    expect(row).toMatch(/grid-template-areas:\s*'name date'\s*'meta meta';/);
    expect(bodyOf('.pr-name')).toMatch(/grid-area:\s*name;/);
    expect(bodyOf('.pr-date')).toMatch(/grid-area:\s*date;/);
    expect(bodyOf('.pr-meta')).toMatch(/grid-area:\s*meta;/);
  });

  it('lets the figures wrap rather than push the row past a 320 px screen', () => {
    expect(bodyOf('.pr-meta')).toMatch(/flex-wrap:\s*wrap;/);
  });

  it('sets no colour: the row inherits the view text tokens', () => {
    expect(CSS).not.toMatch(/(^|[^-])color\s*:/);
    expect(CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
