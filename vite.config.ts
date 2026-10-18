import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { cspPlugin } from './build/cspPlugin.ts';

/*
 * The build date, as YYYY-MM-DD in UTC.
 *
 * The brief's own snippet reads `new Date().toISOString().slice(0, 10)`, which is the same
 * value this expression computes, but eslint.config.js's `no-restricted-syntax` bans
 * `toISOString()` everywhere outside src/domain/dates.ts (it converts to UTC and silently
 * shifts a CIVIL date, master plan section 3): a real rule for a user's own local date, and one
 * this build timestamp does not need to get past, since a build has no time zone to respect.
 * Computed by hand instead, byte-for-byte the same string, so the ban stays whole rather than
 * gaining an exception for a config file.
 */
const buildDate = new Date();
const BUILD_DATE_ISO = [
  buildDate.getUTCFullYear(),
  String(buildDate.getUTCMonth() + 1).padStart(2, '0'),
  String(buildDate.getUTCDate()).padStart(2, '0'),
].join('-');

export default defineConfig({
  // GitHub Pages project site: https://<user>.github.io/FixThisInjustice/
  base: '/FixThisInjustice/',
  // The three constants src/ui/components/SiteFooter.tsx reads (P10 Brief D), declared in
  // src/config/build.d.ts. Each is a literal string substitution, never a runtime env read, so
  // the footer needs no fetch and no build step of its own to know its own version.
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    __BUILD_COMMIT__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'),
    __BUILD_DATE__: JSON.stringify(BUILD_DATE_ISO),
  },
  build: {
    // The CSP is `font-src 'self'` (master plan section 3). Vite's default
    // 4096-byte inline limit rewrites any smaller asset as a `data:` URI, which
    // that directive blocks: the subset silently fails to load. 0 disables
    // inlining entirely, so every font subset ships as a same-origin file.
    assetsInlineLimit: 0,
  },
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      // Hand-written service worker, Workbox-precached (security constraint 23:
      // do not hand-roll caching; the legacy sw.js is dropped per the port table).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // P5 owns the update prompt; nothing is auto-injected into index.html
      // because the CSP forbids inline script.
      registerType: 'prompt',
      injectRegister: false,
      // The three icons already match injectManifest.globPatterns' `png`, so
      // Workbox's default of also folding manifest.icons into the precache
      // lists each one twice (20 entries, three of them duplicates).
      includeManifestIcons: false,
      manifest: {
        name: 'FixThisInjustice',
        short_name: 'FTI',
        description: 'Offline training companion. All data stays on this device.',
        start_url: '/FixThisInjustice/',
        scope: '/FixThisInjustice/',
        display: 'standalone',
        orientation: 'portrait',
        // Limelight ground, --lime in src/ui/styles/tokens.css (the only skin since 2026-10-18).
        background_color: '#8ace00',
        theme_color: '#8ace00',
        categories: ['health', 'fitness', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        globIgnores: [
          // The user-provided motivation video (P6) is served by a runtime
          // CacheFirst route, never precached: it would dominate the precache and
          // make every install all-or-nothing against a multi-megabyte file.
          '**/media/*.mp4',
          /*
           * Font subsets the app can never render (code review).
           *
           * @fontsource-variable/archivo publishes none, so its latin-ext and
           * vietnamese subsets are dropped here: every string the app renders comes
           * from the copy tables, which are ASCII and are checked for it, and user
           * text (a profile name, a capsule note) is not what a precache is sized
           * for - a subset absent from the precache still LOADS over the network
           * when a page asks for it, because the file is still in dist.
           */
          '**/archivo-latin-ext-*',
          '**/archivo-vietnamese-*',
          /*
           * The legacy woff of every face. @fontsource lists woff2 first and woff
           * second in each `src`, so woff is reached only by an engine with no woff2
           * support - Chrome < 36, Firefox < 39, Safari < 10, Edge < 14. None of
           * those implements a service worker either, so nothing that could read
           * this precache can need the file. It still ships in dist and is still
           * served, so such a browser renders online exactly as before.
           */
          '**/*.woff',
        ],
      },
    }),
  ],
});
