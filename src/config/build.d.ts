// src/config/build.d.ts
//
// Ambient globals for the three build-time constants vite.config.ts's `define` block compiles
// in (P10 Brief D): the package version, the short build commit and the ISO build date. Each is
// a literal string substitution at build time, never a runtime lookup, so this file carries no
// import or export of its own (a global script, the same shape src/vite-env.d.ts and
// src/config/env.d.ts already use) and declares the three names as plain `const`s.
//
// vitest.config.ts carries the identical `define` block for the same reason
// src/app/App.test.tsx mounts the whole shell, SiteFooter included, in most of its suites: a
// bare `__APP_VERSION__` with no matching `define` is an undeclared identifier, and referencing
// one throws `ReferenceError` at the first render, not a `undefined` value TypeScript could
// catch. Keeping both `define` blocks byte-identical is what makes `string` (not
// `string | undefined`) the honest type here.

/** The `version` field of package.json at build time, or '0.0.0' outside a package install. */
declare const __APP_VERSION__: string;

/** The first 7 characters of `GITHUB_SHA` at build time, or 'local' outside CI. */
declare const __BUILD_COMMIT__: string;

/** The ISO calendar date (YYYY-MM-DD) the build ran, in UTC. */
declare const __BUILD_DATE__: string;
