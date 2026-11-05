// scripts/capture-schema-fixture.mjs
//
// Audit B16: one captured document per release, under src/domain/migrations/fixtures/, written
// by THIS build: docs/feedback/alpha-fixture.json (synthetic, no personal data) run through the
// current parseState and the user's own exportJson. src/domain/migrations/captures.test.ts then
// keeps every earlier capture loading in every later build, and fails when the current build no
// longer reproduces the newest capture byte for byte, which is the moment to capture again.
//
// Usage: node scripts/capture-schema-fixture.mjs <label>     e.g. 2026-11-05
// Writes fixtures/v<CURRENT_SCHEMA_VERSION>-capture-<label>.json. Never overwrites: a capture is
// a frozen record of what a released build wrote.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const ROOT = new URL('..', import.meta.url).pathname;
const SOURCE = `${ROOT}docs/feedback/alpha-fixture.json`;

async function main() {
  const label = process.argv[2];
  if (label === undefined || !/^[0-9A-Za-z._-]+$/.test(label)) {
    throw new Error('capture label missing or not [0-9A-Za-z._-]+; run: node scripts/capture-schema-fixture.mjs 2026-11-05');
  }
  const server = await createServer({
    configFile: false,
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const { parseState, CURRENT_SCHEMA_VERSION } = await server.ssrLoadModule('/src/domain/schema.ts');
    const { exportJson } = await server.ssrLoadModule('/src/store/persistence.ts');
    const out = `${ROOT}src/domain/migrations/fixtures/v${CURRENT_SCHEMA_VERSION}-capture-${label}.json`;
    if (existsSync(out)) throw new Error(`${out} exists; captures are never overwritten, choose a new label`);
    const parsed = parseState(JSON.parse(readFileSync(SOURCE, 'utf8')));
    if (!parsed.ok) throw new Error(`the alpha fixture fails this build's schema: ${parsed.error}; regenerate it first (node scripts/alpha-fixture.mjs)`);
    writeFileSync(out, exportJson(parsed.state));
    console.log(`wrote ${out.replace(ROOT, '')}`);
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
