import { describe, expect, it } from 'vitest';
// The three places that name an icon file, as text. ?raw rather than node:fs because
// tsconfig.app.json pins `types` to the vite client types (the convention topbar.test.ts states).
import viteConfigSource from '../../vite.config.ts?raw';
import indexHtml from '../../index.html?raw';
import swSource from '../sw.ts?raw';

/*
 * Every icon path the PWA shell names must be a file that ships. A wrong name here fails quietly
 * on a device: the home-screen icon falls back to a screenshot, and the notification badge to a
 * blank square. The file list is read from public/icons itself (keys only; nothing is loaded).
 */
const SHIPPED_ICONS = new Set(
  Object.keys(import.meta.glob('../../public/icons/*.png')).map((path) =>
    path.replace('../../public/', ''),
  ),
);

/** Every `icons/<name>.png` a source text mentions, in order. */
function iconPaths(source: string): string[] {
  return [...source.matchAll(/icons\/[\w-]+\.png/g)].map((m) => m[0]);
}

describe('PWA icon paths', () => {
  it('reads the shipped icon files', () => {
    expect(SHIPPED_ICONS).toContain('icons/apple-touch-icon-180.png');
    expect(SHIPPED_ICONS).toContain('icons/notification-badge-96.png');
  });

  it('names only shipped files in the manifest, index.html and the service worker', () => {
    for (const source of [viteConfigSource, indexHtml, swSource]) {
      const paths = iconPaths(source);
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) expect(SHIPPED_ICONS, path).toContain(path);
    }
  });

  it('lists 192 any, 512 any and 512 maskable in the manifest', () => {
    expect(viteConfigSource).toMatch(
      /src: 'icons\/icon-192\.png', sizes: '192x192', type: 'image\/png', purpose: 'any'/,
    );
    expect(viteConfigSource).toMatch(
      /src: 'icons\/icon-512\.png', sizes: '512x512', type: 'image\/png', purpose: 'any'/,
    );
    expect(viteConfigSource).toMatch(
      /src: 'icons\/icon-maskable-512\.png',\s*sizes: '512x512',\s*type: 'image\/png',\s*purpose: 'maskable'/,
    );
  });

  it('gives iOS the 180 px touch icon, not the 192 px reuse', () => {
    const touch = indexHtml.match(/<link rel="apple-touch-icon"[^>]*>/)?.[0] ?? '';
    expect(touch).toContain('icons/apple-touch-icon-180.png');
    expect(touch).toContain('sizes="180x180"');
  });

  it('badges a notification with the monochrome 96 px badge and keeps the 192 px icon', () => {
    expect(swSource).toMatch(/badge: `\$\{import\.meta\.env\.BASE_URL\}icons\/notification-badge-96\.png`/);
    expect(swSource).toMatch(/icon: `\$\{import\.meta\.env\.BASE_URL\}icons\/icon-192\.png`/);
  });

  /*
   * Precached on purpose: Workbox's globPatterns takes every png in dist (public/icons is copied
   * there), and globIgnores names no icon. The touch icon and badge are read by the OS while the
   * app may be offline, so a precache miss would be a visible blank.
   */
  it('precaches the icons through the png glob, with no ignore rule naming them', () => {
    expect(viteConfigSource).toMatch(/globPatterns: \['\*\*\/\*\.\{[^}]*\bpng\b[^}]*\}'\]/);
    const ignores = viteConfigSource.slice(viteConfigSource.indexOf('globIgnores'));
    expect(ignores).not.toMatch(/icons/);
  });
});
