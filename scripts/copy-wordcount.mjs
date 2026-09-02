// scripts/copy-wordcount.mjs
//
// Keys and words per copy-key family, for the before-and-after check the P9 prose pass states.
//
// The word rule is `wordCount` in src/content/copy.test.ts, reproduced here rather than imported
// because that file is a test module: numerals, `{slot}` names and the unit tokens the contract
// lists are not words. Keeping the two in step is a manual duty, and the TOTAL below is the
// tripwire: it was 2175 over 522 keys on 2026-09-02.
//
// Vite's Node API loads the module because `src/content/copy.ts` imports './copy.board' with no
// extension, which Node's own resolver rejects. esbuild is not installed in this repository.
import { createServer } from 'vite';

const UNIT_TOKENS = new Set([
  's', 'S', 'kg', 'lb', 'mL', 'g', 'kcal', 'MiB', 'cm', 'mm', 'ms', '%', '×',
]);

function wordCount(value) {
  return value
    .split(/\s+/)
    .map((token) => token.replace(/\{[a-zA-Z]+\}/g, '').replace(/[.,:;!?()"'’]/g, ''))
    .filter((bare) => bare !== '' && /\p{L}/u.test(bare) && !UNIT_TOKENS.has(bare)).length;
}

function report(name, table) {
  const words = {};
  const keys = {};
  for (const [key, value] of Object.entries(table)) {
    const family = key.split('.')[0];
    words[family] = (words[family] ?? 0) + wordCount(value);
    keys[family] = (keys[family] ?? 0) + 1;
  }
  let totalWords = 0;
  let totalKeys = 0;
  console.log(`== ${name}`);
  for (const family of Object.keys(words).sort()) {
    console.log(
      `${family.padEnd(12)} keys=${String(keys[family]).padStart(4)} words=${String(words[family]).padStart(5)}`,
    );
    totalWords += words[family];
    totalKeys += keys[family];
  }
  console.log(
    `TOTAL        keys=${String(totalKeys).padStart(4)} words=${String(totalWords).padStart(5)}`,
  );
}

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const copy = await server.ssrLoadModule('/src/content/copy.ts');
await server.close();

report('DEFAULT_COPY', copy.DEFAULT_COPY);
report('LIMELIGHT_COPY', copy.LIMELIGHT_COPY);
report('BOARD_COPY', copy.BOARD_COPY);
