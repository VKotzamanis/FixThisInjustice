import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { cspPlugin } from './build/cspPlugin.ts';

export default defineConfig({
  // GitHub Pages project site: https://<user>.github.io/FixThisInjustice/
  base: '/FixThisInjustice/',
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
        background_color: '#0a0b0c',
        // Reconciled accent, code review A67. See src/ui/styles/tokens.css.
        theme_color: '#a3e635',
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
        // The user-provided motivation video (P6) is served by a runtime
        // CacheFirst route, never precached: it would dominate the precache and
        // make every install all-or-nothing against a multi-megabyte file.
        globIgnores: ['**/media/*.mp4'],
      },
    }),
  ],
});
