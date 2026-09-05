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
    /*
     * tokens.css joins it for a different reason: src/skins/tokens.test.ts reads the sheet as
     * TEXT through ?raw to assert that the two data-skin blocks exist, and vitest empties a
     * CSS module that its `include` does not match -- query and all, which is why this entry
     * is not anchored with `$` the way crt.css is. The id it has to match is
     * `.../tokens.css?raw` (measured 2026-09-02: an anchored regex yielded a 0-length string).
     */
    /*
     * limelight.css joins them for crt.css's reason exactly (P8 Task 14): the marquee's
     * prefers-reduced-motion rule is a guarantee the app makes -- the strip stops and shows one
     * line -- it is CSS rather than component state so that it holds before the first paint, and
     * jsdom evaluates no media query. src/ui/components/Marquee.test.tsx therefore asserts the
     * rule in the injected stylesheet text, which requires the sheet to be processed rather than
     * stubbed.
     */
    /*
     * appShell.css joins tokens.css for the same reason (alpha round 1 Task 2): the top bar's
     * w1.03 defect was a colour LITERAL in this sheet, so src/app/topbar.test.ts reads it as
     * text through ?raw and asserts the rules name tokens instead. Unanchored for the query,
     * exactly as the tokens.css entry above.
     */
    css: {
      include: [
        /crt\.css$/,
        /tokens\.css(\?|$)/,
        /limelight\.css(\?|$)/,
        /appShell\.css(\?|$)/,
      ],
    },
  },
});
