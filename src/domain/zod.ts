// src/domain/zod.ts
//
// Audit E11: the ONE way app code reaches Zod. Zod 4 probes `new Function('')` when a z.object()
// is CONSTRUCTED unless `jitless` is set (node_modules/zod/v4/core/schemas.js: `jit &&
// allowsEval.value`; util.js allowsEval returns false under jitless without probing), and the
// app's CSP (`script-src 'self'`, no 'unsafe-eval') reports that probe as a
// securitypolicyviolation on every load. A config call in main.tsx is too late: the bundler
// evaluates the shared chunk that builds the schemas before the entry's own body (measured in a
// production build, 2026-11-04). Every schema module imports `z` from here, so the config runs
// before the first schema is built, in any chunk order. zod.test.ts fails on a direct import.
import { z } from 'zod';

z.config({ jitless: true });

export { z };
