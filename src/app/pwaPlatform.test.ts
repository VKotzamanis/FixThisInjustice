import { describe, expect, it } from 'vitest';
// ?raw, not node:fs: tsconfig.app.json pins `types` to the vite client types (pwaIcons.test.ts).
import viteConfigSource from '../../vite.config.ts?raw';
import swSource from '../sw.ts?raw';

describe('PWA platform (audit E09, E15)', () => {
  it('pins the manifest id to the current start_url, so identity survives a start_url change', () => {
    expect(viteConfigSource).toMatch(/start_url: '\/FixThisInjustice\/',/);
    expect(viteConfigSource).toMatch(/\bid: '\/FixThisInjustice\/',/);
  });

  it('claims open pages when a worker activates (first session is served offline-first)', () => {
    expect(swSource).toMatch(/self\.addEventListener\('activate'/);
    expect(swSource).toMatch(/self\.clients\.claim\(\)/);
  });

  it('keeps the latin-ext and vietnamese subsets out of the precache (decision E15)', () => {
    const ignores = viteConfigSource.slice(viteConfigSource.indexOf('globIgnores'));
    expect(ignores).toContain("'**/archivo-latin-ext-*'");
    expect(ignores).toContain("'**/archivo-vietnamese-*'");
  });
});
