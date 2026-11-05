// Brief 3.2: one heading system. Every view-level h1/h2 in a *View.tsx goes through
// displayClass() (src/ui/format/display.ts: the display cut unless the text carries a numeral);
// a modal's own title (class *-modal-title) is the modal's business. Read as source text, the
// convention src/ui/nav/views.test.ts uses for App.tsx.
import { describe, expect, it } from 'vitest';

const VIEW_SOURCES = import.meta.glob<string>('./*View.tsx', { query: '?raw', import: 'default', eager: true });

describe('one heading system (brief 3.2)', () => {
  it('found the views', () => {
    expect(Object.keys(VIEW_SOURCES).length).toBeGreaterThanOrEqual(7);
  });

  it('every view heading takes displayClass()', () => {
    const plain = Object.entries(VIEW_SOURCES).flatMap(([path, source]) =>
      source
        .split('\n')
        .filter((line) => /<h[12][\s>]/.test(line))
        .filter((line) => !line.includes('displayClass(') && !/-modal-title/.test(line))
        .map((line) => `${path}: ${line.trim()}`),
    );
    expect(plain).toEqual([]);
  });
});
