// scripts/check-title-case.mjs
//
// R14: a label, a heading or a control name is Title Case.
//
// WHY THIS IS A SCRIPT AND NOT A NOTE. The owner reported this three times across two rounds and
// prefaced the third with "something I won't mention in the feedback but you keep doing wrongly".
// A rule an author has to remember is a rule that decays; this one is mechanical, so it belongs
// in a check. Prose in a contract is a request. A gate is a guarantee.
//
// WHAT TITLE CASE MEANS HERE. Capitalise the first word, the last word, and every word between
// them EXCEPT articles, coordinating conjunctions, and prepositions of four letters or fewer.
// "Units on the Weight Plates". "Time Zone". "What You Told Me".
//
// TWO THINGS IT DOES NOT TOUCH.
//   - The SKIN tables. Limelight is deliberately lower case ("go on", "the look") and the board
//     is deliberately upper ("PROCEED"); both registers are recorded decisions, and R8 and R9
//     already scope themselves to the default table for the same reason.
//   - Unit symbols. R12 guards these: the case IS the quantity, so "(kg)" stays "(kg)" and
//     "+30 s" stays "+30 s". Title-casing a symbol would state a different quantity.
//
// THE HALF THIS CANNOT CHECK is R14's second clause: a heading is a NOUN PHRASE, not a sentence
// or a question. "Individuals in Gender-Affirming Hormone Therapy", never "If you are on gender
// affirming hormone therapy". Nothing in a string says whether it was meant as a heading, so
// that half is review, exactly as R7 and R11 are.

import { createServer } from 'vite';

const ROOT = new URL('..', import.meta.url).pathname;

/*
 * THE RULE ITSELF LIVES IN src/content/copyContract.ts AND IS LOADED, NOT RESTATED HERE.
 *
 * `titleCaseOffenders`, the small-word list, the fixed-case list and the unit list were all
 * defined in this file until Design Mode Task 2, which needed to run R14 in the BROWSER as the
 * owner types a label. A `.mjs` script that imports `vite` and calls `process.exit` cannot be
 * imported by an app bundle, so the choice was to move the rule or to write it a second time.
 *
 * A second R14 that disagreed with this one is worse than no live check at all: the panel would
 * pass a label this gate then failed at merge, hours later, with no context - which is the exact
 * failure the live check exists to remove. So the rule moved to a module with no imports at all,
 * and this script loads it through the Vite server it already had to create for `copy.ts`.
 *
 * The output format, the exit code and what is scanned are unchanged.
 */

const server = await createServer({
  configFile: false,
  root: ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const { DEFAULT_COPY } = await server.ssrLoadModule('/src/content/copy.ts');
const { NAMING_PREFIXES, titleCaseOffenders } = await server.ssrLoadModule(
  '/src/content/copyContract.ts',
);
await server.close();

const scanned = Object.entries(DEFAULT_COPY).filter(
  ([key, value]) => NAMING_PREFIXES.some((p) => key.startsWith(p)) && typeof value === 'string',
);
const failures = scanned
  .map(([key, value]) => ({ key, value, bad: titleCaseOffenders(value) }))
  .filter((row) => row.bad.length > 0);

for (const row of failures) {
  process.stdout.write(`  ${row.key.padEnd(32)} ${JSON.stringify(row.value)}\n`);
}
process.stdout.write(
  `check-title-case: ${failures.length} of ${scanned.length} naming keys are not Title Case\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
