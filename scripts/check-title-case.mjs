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

/** Lower-case unless first or last: articles, coordinating conjunctions, short prepositions. */
const SMALL = new Set([
  'a', 'an', 'the',
  'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
  'of', 'in', 'on', 'at', 'to', 'with', 'from', 'by', 'as', 'per', 'vs',
]);

/*
 * EXACT-CASED TOKENS, which pass whatever their first letter. Same principle as UNIT below, one
 * step wider: there the case IS the quantity, here the case IS the identity.
 *
 * Added 2026-09-09 after the sweep mechanically produced "IPhone and IPad", "Download Summary
 * .Txt" and "Download Calendar .Ics". Every one satisfied the rule as written and every one was
 * wrong on screen: `iPhone` and `iPad` are trademarks with a fixed lower-case initial, and `.txt`
 * and `.ics` are file extensions a user types verbatim. A rule that forces a visible defect is an
 * incomplete rule, so the rule moved rather than the copy.
 */
const FIXED = new Set(['iphone', 'ipad', 'ios', 'ipados', 'macos', '.txt', '.ics', '.json', '.csv']);

/** R12's guarded symbols, plus the ones the setup wizard writes. Case is the quantity. */
const UNIT = new Set([
  's', 'kg', 'lb', 'ml', 'min', 'g', 'kcal', 'mib', 'cm', 'mm', 'ms', 'm', 'ft', 'in', 'h', 'oz', 'fl',
]);

/** The key families that name something rather than say something. */
const NAMING = ['label.', 'hero.', 'step.', 'group.', 'button.'];

/** The words in `value` that R14 says should have been capitalised and were not. */
export function titleCaseOffenders(value) {
  const words = value.split(/\s+/).filter(Boolean);
  const bad = [];
  words.forEach((word, i) => {
    const bare = word.replace(/[^A-Za-z-]/g, '');
    if (bare === '') return;
    /*
     * A PLACEHOLDER SLOT IS NOT A WORD. `{volume}` is a substitution key: capitalising it renames
     * the slot and the substitution silently stops matching, which is a functional break dressed
     * as a style fix. Skipped outright.
     */
    if (/^\{.*\}$/.test(word)) return;
    if (FIXED.has(word.toLowerCase()) || FIXED.has(bare.toLowerCase())) return;
    if (/^[A-Z]/.test(bare)) return;
    if (bare === bare.toUpperCase() && bare.length > 1) return; // an acronym
    if (UNIT.has(bare.toLowerCase())) return; // R12
    const isSmall = SMALL.has(bare.toLowerCase());
    const isEdge = i === 0 || i === words.length - 1;
    if (isSmall && !isEdge) return;
    bad.push(word);
  });
  return bad;
}

const server = await createServer({
  configFile: false,
  root: ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const { DEFAULT_COPY } = await server.ssrLoadModule('/src/content/copy.ts');
await server.close();

const scanned = Object.entries(DEFAULT_COPY).filter(
  ([key, value]) => NAMING.some((p) => key.startsWith(p)) && typeof value === 'string',
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
