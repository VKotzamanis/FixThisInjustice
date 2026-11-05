import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { cspPlugin } from './build/cspPlugin.ts';
import { buildInfoPlugin } from './build/buildInfo.ts';


export default defineConfig({
  // GitHub Pages project site: https://<user>.github.io/FixThisInjustice/
  base: '/FixThisInjustice/',
  // The package version SiteFooter reads (declared in src/config/build.d.ts). The commit and the
  // build date are NOT compiled in (audit E06): they change on every commit and would rehash the
  // main chunk; build/buildInfo.ts writes them to dist/build-info.json instead.
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
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
    buildInfoPlugin(),
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
        /*
         * Audit E15: identity pinned to today's start_url. Without `id` the browser keys the
         * installed app on start_url, so changing start_url would install a second app. MDN,
         * manifest `id` (read 2026-11-04): "If id is not specified ... the start_url value is
         * used"; a relative id is resolved against start_url's origin, so this is the same
         * identity installed apps already have.
         */
        id: '/FixThisInjustice/',
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
           *
           * Decision E15 (2026-11-04): kept out. Precaching latin-ext would add 86,240 B and
           * vietnamese 34,464 B [B, measured woff2] to every install and every font update, for
           * one case: user-typed text with Central European or Vietnamese letters, opened
           * OFFLINE before the subset was ever fetched online. That text still renders, in the
           * system face. Rejected: precache both (cost on every install for a rare glyph case).
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
