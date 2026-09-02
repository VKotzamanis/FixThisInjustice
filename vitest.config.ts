import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    testTimeout: 20_000, // [ms] UI suites run 25 s in total under a loaded runner; the default 5 s flaked (P2 final review)
    environment: 'jsdom',
    // build/ holds the Vite plugin tests (build/cspPlugin.test.ts). They are plain
    // Node-side unit tests but share this config so `npm test` is the single gate.
    include: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    /*
     * CSS is stubbed by default, which is what every other stylesheet here
     * wants: no test asserts a computed style. crt.css is the exception. Its
     * prefers-reduced-motion rule is a guarantee the app makes and jsdom cannot
     * evaluate a media query, so the rule is asserted in the injected
     * stylesheet text instead. Scoped to that one file so nothing else pays
     * the transform cost.
     */
    css: { include: [/crt\.css$/] },
  },
});
