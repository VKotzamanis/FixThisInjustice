// src/ui/views/train/warmupNoticeStyles.test.ts
//
// The one-time warm-up notice on Train (owner 2026-10-18), asserted in train.css's own text for
// setRowStyles.test.ts's reason: jsdom computes no layout. Its contrast on the lime ground is
// computed with the other lime rules in src/ui/styles/limeContrast.test.ts.
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

describe('warm-up notice layout', () => {
  it('keeps its one control a 44 px target, sized by a rule that outranks `.view button`', () => {
    // `.view .train-warmup-ok` is (0,2,0) against `.view button`'s (0,1,1). 2.75rem is 44 px at
    // the 16 px root, the same figure views.css gives every other control.
    const ok = bodyOf('.view .train-warmup-ok');
    expect(ok).toMatch(/min-height:\s*2\.75rem;/);
    expect(ok).toMatch(/min-width:\s*2\.75rem;/);
  });

  it('wraps the control under the sentence on a narrow phone rather than overflowing', () => {
    expect(bodyOf('.train-warmup')).toMatch(/flex-wrap:\s*wrap;/);
    expect(bodyOf('.train-warmup-text')).toMatch(/min-width:\s*0;/);
  });

  it('paints only through tokens', () => {
    for (const selector of ['.train-warmup', '.train-warmup-text', '.view .train-warmup-ok']) {
      expect(bodyOf(selector)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });
});
