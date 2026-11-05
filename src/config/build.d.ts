// src/config/build.d.ts
//
// The commit and build date moved to dist/build-info.json (audit E06, build/buildInfo.ts).
//
// Ambient globals for the build-time constant vite.config.ts's `define` block compiles
// in (P10 Brief D): the package version. It is a literal string substitution at build time,
// never a runtime lookup, so this file carries no import or export of its own (a global script,
// the same shape src/vite-env.d.ts and src/config/env.d.ts already use) and declares the name
// as a plain `const`.
//
// vitest.config.ts carries the identical `define` block for the same reason
// src/app/App.test.tsx mounts the whole shell, SiteFooter included, in most of its suites: a
// bare `__APP_VERSION__` with no matching `define` is an undeclared identifier, and referencing
// one throws `ReferenceError` at the first render, not a `undefined` value TypeScript could
// catch. Keeping both `define` blocks byte-identical is what makes `string` (not
// `string | undefined`) the honest type here.

/** The `version` field of package.json at build time, or '0.0.0' outside a package install. */
declare const __APP_VERSION__: string;

/** Audit E15: the sound files under public/sfx at build time, as '<skin>/<name>.m4a'. */
declare const __SFX_FILES__: readonly string[];
