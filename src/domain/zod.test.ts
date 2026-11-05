import { describe, expect, it } from 'vitest';
import { z } from './zod';

/** Every non-test source file under src, as text, keyed by its path relative to this file. */
const SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('Zod is configured before any schema is built (audit E11)', () => {
  it('runs jitless, so the eval probe never fires under the CSP', () => {
    expect(z.config().jitless).toBe(true);
  });

  it("no app module imports 'zod' except src/domain/zod.ts", () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path, text]) => path !== './zod.ts' && /from 'zod(\/[^']*)?'/.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
