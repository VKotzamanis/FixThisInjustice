import { defineConfig } from "vitest/config";

// Vitest 4 defaults `include` to `src/**/*.test.{ts,tsx}`, which never reaches this
// package's tests: the Worker's tests live in `test/` so `src/` holds only deployed
// code. The `?raw` imports in test/config.test.ts are served by Vite's raw loader,
// which is why the tests run through Vitest rather than node:fs (see test/raw.d.ts).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
