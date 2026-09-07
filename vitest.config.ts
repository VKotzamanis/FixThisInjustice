import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/*
 * The build date, as YYYY-MM-DD in UTC. Computed by hand rather than with `toISOString()`, and
 * kept identical to vite.config.ts's own copy of this expression: see that file's comment for
 * why (eslint.config.js's `no-restricted-syntax` bans the call outside src/domain/dates.ts).
 */
const buildDate = new Date();
const BUILD_DATE_ISO = [
  buildDate.getUTCFullYear(),
  String(buildDate.getUTCMonth() + 1).padStart(2, '0'),
  String(buildDate.getUTCDate()).padStart(2, '0'),
].join('-');

export default defineConfig({
  plugins: [react()],
  /*
   * BEYOND THE BRIEF, AND REQUIRED. vitest does not read vite.config.ts's `define` block: the
   * two are separate Vite configurations, and without this the bare identifiers
   * `__APP_VERSION__`, `__BUILD_COMMIT__` and `__BUILD_DATE__` src/ui/components/SiteFooter.tsx
   * reads (P10 Brief D) are undeclared globals, and every suite that mounts the app shell
   * (src/app/App.test.tsx, most of it) throws a ReferenceError on first render rather than
   * failing one assertion. Kept byte-identical to vite.config.ts's own block, which is also why
   * src/config/build.d.ts declares the three as `string` rather than `string | undefined`.
   */
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    __BUILD_COMMIT__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'),
    __BUILD_DATE__: JSON.stringify(BUILD_DATE_ISO),
  },
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
    /*
     * setup.css joins them for alpha round 2 (claims r2.10 and r2.12(i)). Two guarantees in that
     * sheet are LAYOUT rules, and jsdom performs no layout at all: the shrink permission that
     * stops the body step scrolling sideways at 390 px, and the corner the modal close control is
     * drawn in. src/ui/setup/SetupWizard.test.tsx asserts both in the sheet's own text, which
     * requires the sheet to be processed rather than stubbed. Unanchored for the query, exactly
     * as the tokens.css entry above.
     */
    css: {
      include: [
        /crt\.css$/,
        /tokens\.css(\?|$)/,
        /limelight\.css(\?|$)/,
        /appShell\.css(\?|$)/,
        /setup\.css(\?|$)/,
      ],
    },
  },
});
