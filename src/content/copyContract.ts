/**
 * The copy contract, as ONE executable implementation.
 *
 * docs/design/2026-09-01-copy-contract.md states R1 to R14 in prose. The parts that can be
 * decided from a string alone were, until Design Mode Task 2, implemented in two places that
 * could not see each other: `src/content/copy.test.ts` held R1 to R6 and R8 as file-local
 * helpers, and `scripts/check-title-case.mjs` held R14. Neither was importable by the running
 * app, so a panel that validated copy AS IT IS TYPED would have had to carry a third copy of
 * every rule.
 *
 * <!-- decision: one-copy-contract-implementation | status: adopted | supersedes: rules-duplicated-per-consumer -->
 *
 * A SECOND COPY OF A RULE THAT DISAGREES WITH THE FIRST IS WORSE THAN NO RULE. The panel would
 * pass a string the suite then failed at merge, which is exactly the hours-later, no-context
 * failure the live check exists to remove. So the helpers moved here, unchanged, and their three
 * consumers import them:
 *
 *   - `src/content/copy.test.ts`      the merge gate, over all three tables
 *   - `scripts/check-title-case.mjs`  the R14 gate, over the default table
 *   - `src/design/copyEdits.ts`       Design Mode's live validator, as the owner types
 *
 * WHY `src/content/` AND NOT `src/design/`. These rules govern `copy.ts`; they are content's, not
 * the design panel's. Putting them under `src/design/` would mean the copy contract stopped being
 * enforced the day Design Mode was deleted, which is a coupling nobody would choose deliberately.
 *
 * IT IMPORTS NOTHING. No React, no store, no Node built-in. A browser bundle, a vitest run and a
 * `vite ssrLoadModule` from a Node script all load it unchanged.
 *
 * WHAT IS STILL REVIEW, NOT A CHECK. R7 (no hedging, no filler), R14's second clause (a heading is
 * a NOUN PHRASE) and most of R11 are judgements about meaning. R11 appears below as an ADVISORY
 * with a severity of its own for exactly that reason: it is a prompt to look, not a gate.
 */

/**
 * Tokens that are a unit, not a word. The contract states the rule as "word counts exclude
 * numerals and units (`60 kg x 8` counts as one word)". A `{slot}` is excluded for the same
 * reason: at runtime it is a number the domain computed, so counting it as a word would charge a
 * sentence for a value it does not contain.
 */
const UNIT_TOKENS: ReadonlySet<string> = new Set([
  's',
  // 'S' WAS HERE, and it was the loophole that let the board write "+30 S DELAY" past the word
  // count: `S` is the siemens, and this app measures no conductance. A capital S counts as a
  // word now, so a table that shouts a unit symbol is charged for it (P8 review).
  'kg',
  'lb',
  'mL',
  'g',
  'kcal',
  'MiB',
  'cm',
  'mm',
  'ms',
  '%',
  '×', // MULTIPLICATION SIGN, as in "60 kg x 8"
]);

/** R1 to R3's word count. Numerals, units and `{slot}` names are not words. */
export function wordCount(value: string): number {
  return value
    .split(/\s+/)
    .map((token) => token.replace(/\{[a-zA-Z]+\}/g, '').replace(/[.,:;!?()"'’]/g, ''))
    .filter((bare) => bare !== '' && /\p{L}/u.test(bare) && !UNIT_TOKENS.has(bare)).length;
}

/** R4's sentence count. A sentence ends at `.` or `?` followed by white space. */
export function sentenceCount(value: string): number {
  return value.split(/(?<=[.?])\s+/).filter((part) => part !== '').length;
}

/** Emoji ranges from round-three verification criterion 5. R6 binds every skin. */
export function hasEmoji(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point >= 0x1f300 && point <= 0x1faff) return true;
    if (point >= 0x2600 && point <= 0x27bf) return true;
    if (point === 0xfe0f) return true;
    if (point >= 0x2b00 && point <= 0x2bff) return true;
  }
  return false;
}

/** R5: the em dash is banned outright. Use a colon or a full stop. */
export function hasEmDash(value: string): boolean {
  return value.includes('—');
}

/** R5: an en-dash is legal only between two digits (`6-8`). Anywhere else it is a connector. */
export function hasConnectorEnDash(value: string): boolean {
  // A `{slot}` stands for a number a domain module computed, so it is scored as one digit here,
  // for the reason `wordCount` gives for not scoring it as a word: `status.blockSessions` is a
  // numeric range at runtime, and reading the brace as a letter would fail a legal string.
  const rendered = value.replace(/\{[a-zA-Z]+\}/g, '0');
  for (let i = 0; i < rendered.length; i += 1) {
    if (rendered[i] !== '–') continue;
    const before = rendered[i - 1] ?? '';
    const after = rendered[i + 1] ?? '';
    if (!/\d/.test(before) || !/\d/.test(after)) return true;
  }
  return false;
}

/** The unnamed rule in docs/plans/subagent-briefs/00-CONTEXT.md: a string is not a place for a link. */
export function hasUrl(value: string): boolean {
  return /https?:\/\/|www\.[a-z]/i.test(value);
}

/*
 * ----------------------------------------------------------------------------------------------
 * R14, moved here verbatim from scripts/check-title-case.mjs so the script and the panel decide
 * the same thing. The script now loads this module through the Vite server it already creates.
 * ----------------------------------------------------------------------------------------------
 *
 * WHAT TITLE CASE MEANS HERE. Capitalise the first word, the last word, and every word between
 * them EXCEPT articles, coordinating conjunctions, and prepositions of four letters or fewer.
 * "Units on the Weight Plates". "Time Zone". "What You Told Me".
 *
 * TWO THINGS IT DOES NOT TOUCH.
 *   - The SKIN tables. Limelight is deliberately lower case ("go on", "the look") and the board
 *     is deliberately upper ("PROCEED"); both registers are recorded decisions, and R8 and R9
 *     already scope themselves to the default table for the same reason.
 *   - Unit symbols. R12 guards these: the case IS the quantity, so "(kg)" stays "(kg)" and
 *     "+30 s" stays "+30 s". Title-casing a symbol would state a different quantity.
 */

/** Lower-case unless first or last: articles, coordinating conjunctions, short prepositions. */
const SMALL: ReadonlySet<string> = new Set([
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
const FIXED: ReadonlySet<string> = new Set([
  'iphone', 'ipad', 'ios', 'ipados', 'macos', '.txt', '.ics', '.json', '.csv',
]);

/** R12's guarded symbols, plus the ones the setup wizard writes. Case is the quantity. */
const UNIT: ReadonlySet<string> = new Set([
  's', 'kg', 'lb', 'ml', 'min', 'g', 'kcal', 'mib', 'cm', 'mm', 'ms', 'm', 'ft', 'in', 'h', 'oz', 'fl',
]);

/** The key families that name something rather than say something. */
export const NAMING_PREFIXES: readonly string[] = [
  'label.',
  'hero.',
  'step.',
  'group.',
  'button.',
];

/** The words in `value` that R14 says should have been capitalised and were not. */
export function titleCaseOffenders(value: string): readonly string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const bad: string[] = [];
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

/**
 * R10 and R9 exemptions, key by key, each with the position that earns it.
 *
 * R10 exempts form cues, exercise notes and tips, Atlas card bodies and citations; none of those
 * live in the copy table (they are `src/content/formCues.ts` and `src/content/specimenCards.ts`,
 * and, as of Brief G, `src/content/activityLevels.ts` for the "Where These Levels Come From"
 * modal, and, as of Brief M, `src/content/reviewDataNotes.ts` for the review step's "Your Data"
 * block). What does live there is R9's other exemption: "text inside a disclosure is exempt from
 * R1-R4". A key earns a place below only by being rendered inside a `<details>`, and the call
 * site is named so the exemption can be revoked when the call site changes.
 */
export const LENGTH_EXEMPT: ReadonlyMap<string, string> = new Map([
  [
    'advice.motivationClipLimit',
    'rendered inside <details><summary>why?</summary> in src/ui/motivation/MotivationSettings.tsx',
  ],
  /*
   * Brief I's two disclosure bodies, both on the goal step of src/ui/setup/SetupWizard.tsx and
   * both earning the exemption the same way `advice.motivationClipLimit` does: they render
   * inside a `<details><summary>why?</summary>`, which is R9's own carve-out from R1 to R4.
   */
  [
    'advice.goalRecompositionCost',
    'rendered inside <details><summary>why?</summary> on the goal step in src/ui/setup/SetupWizard.tsx',
  ],
  [
    'advice.targetBodyFatBasis',
    'rendered inside <details><summary>why?</summary> on the goal step in src/ui/setup/SetupWizard.tsx',
  ],
]);

/*
 * ----------------------------------------------------------------------------------------------
 * R11, and it is an ADVISORY rather than a gate.
 * ----------------------------------------------------------------------------------------------
 *
 * 00-CONTEXT states R11 as "name the quantity: `body mass` not `weight`, `load` for kg on a bar,
 * `kcal` not `calories`". Two thirds of that is decidable from the string; the `load` clause is
 * not, because nothing in a string says whether the kilograms it names are on a bar.
 *
 * IT IS NEW CODE, not a move. `copy.test.ts` lists R11 under "what this file does not check", so
 * there was no implementation to reuse and this is the first one. It is deliberately kept OUT of
 * the merge gate: the default table already carries four legitimate uses of the word - "Units on
 * the Weight Plates", "Free weights for three years or more", "Body Weight Only" and "Home Gym
 * and Body Weight" - where the word names an OBJECT or a MODALITY rather than the quantity. A
 * gate that fails those would be a rule forcing a visible defect, which is the same mistake the
 * FIXED list above records. So the carve-outs are explicit and the finding is advisory.
 */

/** The compound uses where the word names an object or a modality, not the quantity. */
const R11_CARVE_OUTS: readonly RegExp[] = [
  /\bweight plates?\b/i,
  /\bfree weights?\b/i,
  /\bbody ?weights?\b/i,
  /\bweight room\b/i,
];

interface QuantityTerm {
  readonly pattern: RegExp;
  readonly wrong: string;
  readonly right: string;
}

const R11_TERMS: readonly QuantityTerm[] = [
  { pattern: /\bweights?\b/i, wrong: 'weight', right: 'body mass' },
  { pattern: /\bcalories\b|\bcals\b/i, wrong: 'calories', right: 'kcal' },
];

/** The R11 substitutions this string invites, after the carve-outs are removed. */
export function quantityAdvisories(value: string): ReadonlyArray<{ wrong: string; right: string }> {
  let stripped = value;
  for (const carve of R11_CARVE_OUTS) stripped = stripped.replace(new RegExp(carve, 'gi'), ' ');
  return R11_TERMS.filter((term) => term.pattern.test(stripped)).map((term) => ({
    wrong: term.wrong,
    right: term.right,
  }));
}

/* ---------------------------------------------------------------------------------------------- */

/** The three tables a copy edit can land in. Named by their exported binding, not by skin. */
export type CopyTableId = 'DEFAULT_COPY' | 'LIMELIGHT_COPY' | 'BOARD_COPY';

/**
 * `EVIDENCE` is not one of R1 to R14. It belongs to `src/content/r10Text.ts`, which reuses this
 * violation shape rather than declaring a second one so that the panel can render a copy-table
 * finding and an R10 finding through the same component. The rule it names is that module's:
 * long-form text that acquires a DOI, a dose or a citation locks itself against further editing.
 */
export type CopyRuleId =
  | 'R1'
  | 'R2'
  | 'R3'
  | 'R4'
  | 'R5'
  | 'R6'
  | 'R8'
  | 'R11'
  | 'R14'
  | 'URL'
  | 'EVIDENCE';

export interface CopyViolation {
  readonly rule: CopyRuleId;
  /** `error` fails the merge gate today. `advisory` is a prompt to look, and gates nothing. */
  readonly severity: 'error' | 'advisory';
  /** One sentence, naming the rule and the number the string missed. */
  readonly message: string;
}

/** R1 to R3's caps, by key prefix. `label.` carries no length cap at all. */
const LENGTH_CAPS: ReadonlyArray<{ prefix: string; cap: number; rule: CopyRuleId }> = [
  { prefix: 'button.', cap: 3, rule: 'R1' },
  { prefix: 'hero.', cap: 8, rule: 'R2' },
  { prefix: 'advice.', cap: 12, rule: 'R3' },
];

/**
 * Every rule that can be decided from `value` alone, for one key in one table.
 *
 * THE PER-TABLE SCOPING IS THE CONTRACT'S, NOT AN INVENTION. R1 to R6 and the URL ban bind every
 * table (copy.test.ts runs them over all three). R8 and R14 bind the DEFAULT table alone: the
 * limelight register is deliberately lower case and the board's is deliberately upper, and
 * scripts/check-title-case.mjs skips both for that reason. Applying R14 to a skin would destroy
 * two recorded design decisions the first time it was obeyed.
 */
export function checkCopyValue(
  key: string,
  value: string,
  table: CopyTableId,
): readonly CopyViolation[] {
  const found: CopyViolation[] = [];
  const exempt = LENGTH_EXEMPT.has(key);

  for (const { prefix, cap, rule } of LENGTH_CAPS) {
    if (!key.startsWith(prefix) || exempt) continue;
    const words = wordCount(value);
    if (words > cap) {
      found.push({
        rule,
        severity: 'error',
        message: `${rule}: a ${prefix} string is at most ${cap} words. This one is ${words}.`,
      });
    }
  }

  if (key.startsWith('banner.')) {
    const sentences = sentenceCount(value);
    if (sentences > 2) {
      found.push({
        rule: 'R4',
        severity: 'error',
        message: `R4: a banner. string is at most 2 sentences. This one is ${sentences}.`,
      });
    }
  }

  if (hasEmDash(value)) {
    found.push({
      rule: 'R5',
      severity: 'error',
      message: 'R5: no em dash. Use a colon or a full stop.',
    });
  }
  if (hasConnectorEnDash(value)) {
    found.push({
      rule: 'R5',
      severity: 'error',
      message: 'R5: an en dash is legal only between two digits. Use a colon or a full stop.',
    });
  }
  if (hasEmoji(value)) {
    found.push({
      rule: 'R6',
      severity: 'error',
      message: 'R6: no emoji. The check treats U+2600 to U+27BF as emoji, so the sex symbols fail.',
    });
  }
  if (hasUrl(value)) {
    found.push({
      rule: 'URL',
      severity: 'error',
      message: 'No URL in a copy string. A link is a component prop or a build constant.',
    });
  }

  if (table === 'DEFAULT_COPY') {
    if (value.includes('!')) {
      found.push({
        rule: 'R8',
        severity: 'error',
        message: 'R8: no exclamation mark in the default table.',
      });
    }
    if (NAMING_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      const bad = titleCaseOffenders(value);
      if (bad.length > 0) {
        found.push({
          rule: 'R14',
          severity: 'error',
          message: `R14: Title Case. These words are not capitalised: ${bad.join(', ')}.`,
        });
      }
    }
  }

  for (const advisory of quantityAdvisories(value)) {
    found.push({
      rule: 'R11',
      severity: 'advisory',
      message: `R11: name the quantity. Prefer "${advisory.right}" to "${advisory.wrong}".`,
    });
  }

  return found;
}
