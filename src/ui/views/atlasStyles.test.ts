import { describe, expect, it } from 'vitest';
import css from './atlas.css?raw';

describe('Atlas at 320 px (audit G15)', () => {
  it('uses two columns below 360 px instead of one 260 px column', () => {
    expect(css).toMatch(
      /@media \(max-width: 359px\)\s*\{\s*\.atlas \.atlas-grid\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
  });
});
