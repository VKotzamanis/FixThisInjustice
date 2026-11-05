import { describe, expect, it } from 'vitest';
import introCss from './intro.css?raw';

/** The declarations of one rule, by exact selector. */
function rule(selector: string): string {
  const start = introCss.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  return introCss.slice(start, introCss.indexOf('}', start));
}

describe('the acknowledgement modal on a short screen (audit A02)', () => {
  it('lets the backdrop scroll, top-aligned, so Next is always reachable', () => {
    expect(rule('.intro-modal-bg')).toMatch(/overflow-y:\s*auto/);
    expect(rule('.intro-modal-bg')).toMatch(/align-items:\s*start/);
  });

  it('centres the modal only when it fits', () => {
    expect(rule('.intro-modal')).toMatch(/margin-block:\s*auto/);
  });
});
