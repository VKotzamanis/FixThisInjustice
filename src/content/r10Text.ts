/**
 * THE R10 TEXT REGISTRY: which long-form module a run of text came from, and whether it may be
 * edited.
 *
 * <!-- decision: r10-is-locked-by-what-it-cites-not-by-being-r10 | status: adopted | supersedes: r10-modules-are-never-editable -->
 *
 * WHAT THIS REPLACES, AND WHY. Design Mode Task 2 shipped with "the R10 modules are not editable",
 * recorded in docs/plans/2026-09-10-16-design-mode.md and restated in src/design/copyEdits.ts and
 * src/design/CopyEditLayer.tsx. The stated reason was sound: those modules "carry citations, DOIs
 * and structure. They do not pass through `copy()` ... a WYSIWYG is how a DOI gets mangled."
 *
 * The rule was wider than the reason. Measured on this tree, `src/content/introSlides.ts` holds
 * ZERO citations: it is the owner's own five slides of prose, the words he wrote about himself.
 * He opened the tool to change them and found nothing on the screen would take an edit, because
 * they had been swept up by a rule aimed at `guidanceReferences.ts` (30 DOIs) and
 * `specimenCards.ts` (32). The rule is therefore restated:
 *
 *     A MODULE THAT CITES SOMETHING IS NOT EDITABLE. Being R10 is not, by itself, a reason.
 *
 * HOW THE LOCK IS DECIDED, AND WHY IT IS NOT A LIST. Two gates, in this order, and BOTH of them
 * only ever move a module from editable to locked. Neither can unlock anything.
 *
 *   1. A DECLARED lock, in `MODULES` below. Every module except `introSlides` carries one, each
 *      naming the evidence it holds. This IS a hand-written field, and the direction it rots in
 *      is the safe one: a module wrongly declared locked costs the owner an edit he has to make
 *      by hand, while a module wrongly declared editable costs a mangled dose or DOI. The gate
 *      that must never rot is the one below, and that one is derived.
 *
 *   2. A DERIVED lock, `evidenceIn()` over the module's OWN EXPORTED STRINGS, computed at module
 *      load on every run. A module carrying a DOI, a URL, a publication identifier, an author
 *      list, a reference number, a decimal number or a number with a unit is locked, whatever it
 *      was declared. Add a citation, a dose or a PAL figure to `introSlides.ts` tomorrow and it
 *      locks itself the next time the app loads: nobody has to remember to edit a list here.
 *
 * `src/content/r10Text.test.ts` proves gate 2 by injecting a DOI into a copy of a currently
 * editable module's strings and asserting it locks, and scans the SOURCE of every module this
 * registry reports editable for `10.\d{4,9}/`, which catches a DOI written into a comment that
 * gate 2, reading values only, cannot see.
 *
 * WHAT IT DOES NOT DECIDE. Whether the applier can rewrite a given row. A value the source builds
 * by concatenating two literals across two lines cannot be replaced in place, and this module
 * cannot tell: it holds the joined string, not the source. `scripts/design-patch.mjs` refuses
 * such a row by name, exactly as it already refuses a concatenated `copy.ts` row, and
 * `r10Text.test.ts` asserts that every field reported editable today locates cleanly, so a module
 * cannot be declared editable without someone finding out that half its rows cannot be applied.
 *
 * R10 TEXT IS NOT PER SKIN. `copy()` has three tables and src/design/copyEdits.ts spends its
 * header on routing an edit to the right one. These modules have exactly one version of each
 * string, which every skin renders, so an edit here is filed under the module and not under a
 * skin. The panel says so before he types.
 */
import * as activityLevels from './activityLevels';
import * as bodyEquations from './bodyEquations';
import * as bodyFatChart from './bodyFatChart';
import * as formCues from './formCues';
import * as guidanceReferences from './guidanceReferences';
import * as introSlides from './introSlides';
import * as reviewDataNotes from './reviewDataNotes';
import * as setupSliderExamples from './setupSliderExamples';
import * as sexRationale from './sexRationale';
import * as specimenCards from './specimenCards';
import * as supplementGuidance from './supplementGuidance';
import {
  hasConnectorEnDash,
  hasEmDash,
  hasEmoji,
  hasUrl,
  quantityAdvisories,
  titleCaseOffenders,
} from './copyContract';
import type { CopyViolation } from './copyContract';

/** The DOI pattern the brief names, and the one the merge gate scans source with. */
export const DOI_PATTERN = /10\.\d{4,9}\/[^\s'"]+/;

/**
 * What counts as EVIDENCE, each with the words the panel shows when it refuses.
 *
 * The DOI is the case the original rule was written for and it is first. The rest are here
 * because measuring this tree showed the DOI alone under-detects badly:
 * `src/content/supplementGuidance.ts` carries no DOI at all and is the single most dangerous
 * module in the set, holding "EFSA puts a safe single dose for healthy adults at 200 mg",
 * "roughly 0.4 g per kg of body mass" and "14.8 per cent held undeclared anabolic steroids".
 * A gate that reads only for `10.` would have handed all three to a WYSIWYG.
 *
 * EVERY PATTERN WAS CHECKED AGAINST `introSlides.ts` BEFORE IT WAS ADDED, because a gate that
 * locks the one module this work exists to unlock is a gate that has failed. The intro's only
 * digits are "since 2020" and "150 dollars a session": no decimal point, and `dollars` is not a
 * unit, so neither trips anything below. That is a property of today's words, not a guarantee,
 * and it is exactly the property the derived gate is meant to keep watching.
 */
const EVIDENCE: ReadonlyArray<{ readonly pattern: RegExp; readonly why: string }> = [
  { pattern: DOI_PATTERN, why: 'a DOI' },
  { pattern: /https?:\/\/|www\.[a-z]/i, why: 'a URL' },
  { pattern: /\b(?:PMID|PMCID|ISBN|ISSN)\b/i, why: 'a publication identifier' },
  { pattern: /\bet al\b/i, why: 'an author list' },
  { pattern: /\bsee references? \d/i, why: 'a reference number' },
  { pattern: /\d+\.\d+/, why: 'a decimal number' },
  { pattern: /\d+\s?(?:mg|kg|lb|mL|kcal|cm|mm|ms|g|L)\b/, why: 'a number with a unit' },
  { pattern: /\d+\s?per cent\b/i, why: 'a percentage' },
];

/** The evidence `value` carries, in the words the panel uses, or null when it carries none. */
export function evidenceIn(value: string): string | null {
  for (const { pattern, why } of EVIDENCE) {
    if (pattern.test(value)) return why;
  }
  return null;
}

export type R10ModuleId =
  | 'activityLevels'
  | 'bodyEquations'
  | 'bodyFatChart'
  | 'formCues'
  | 'guidanceReferences'
  | 'introSlides'
  | 'reviewDataNotes'
  | 'setupSliderExamples'
  | 'sexRationale'
  | 'specimenCards'
  | 'supplementGuidance';

interface ModuleDecl {
  readonly id: R10ModuleId;
  /** Repository-relative, and the path the export patch carries. */
  readonly file: string;
  /** The whole module namespace. Fields are WALKED out of it, never listed by hand. */
  readonly namespace: Readonly<Record<string, unknown>>;
  /**
   * A declared lock, or null to let the derived gate decide. Safe direction only: this field can
   * lock a module, and nothing here can unlock one.
   */
  readonly declaredLock: string | null;
}

/**
 * The eleven long-form modules, and the one declaration each carries.
 *
 * The measured DOI count is in each note because it is the number the original rule was reasoning
 * from, and four of the eleven show why that number alone was the wrong gate.
 */
const MODULES: readonly ModuleDecl[] = [
  {
    id: 'introSlides',
    file: 'src/content/introSlides.ts',
    namespace: introSlides,
    // 0 DOIs, and no dose, no coefficient and no attribution: five slides of the owner's own
    // prose about himself, plus the warning and the acknowledgement he wrote. The one module in
    // this set with nothing to protect, and the one he opened the tool to edit.
    declaredLock: null,
  },
  {
    id: 'reviewDataNotes',
    file: 'src/content/reviewDataNotes.ts',
    namespace: reviewDataNotes,
    declaredLock:
      'This module builds two of its three sentences from DEFAULT_COPY at load, so the words on ' +
      'screen are not the row in the source. Writing them back as a literal would delete the ' +
      'derivation and let the sentence go stale the next time a control is renamed. Edit the ' +
      'copy keys it quotes instead.',
  },
  {
    id: 'bodyFatChart',
    file: 'src/content/bodyFatChart.ts',
    namespace: bodyFatChart,
    declaredLock:
      'Its one paragraph states an evidentiary claim, that studies of self-estimated body fat ' +
      'find weak agreement with measured values. That is a finding, not a label.',
  },
  {
    id: 'setupSliderExamples',
    file: 'src/content/setupSliderExamples.ts',
    namespace: setupSliderExamples,
    declaredLock:
      'The nine activity examples are keyed by PAL and setupSliderExamples.test.ts asserts they ' +
      "cover src/domain/nutrition.ts's ACTIVITY_STOPS exactly, so these strings are pinned to " +
      'the engine rather than free prose.',
  },
  {
    id: 'activityLevels',
    file: 'src/content/activityLevels.ts',
    namespace: activityLevels,
    declaredLock:
      'It prints the FAO/WHO/UNU (2004) Table 5.3 bands and every PAL bound, and ' +
      "activityLevels.test.ts scans src/domain/nutrition.ts's source to prove the two agree. A " +
      'retyped bound is a silent numeric drift between the modal and the engine.',
  },
  {
    id: 'supplementGuidance',
    file: 'src/content/supplementGuidance.ts',
    namespace: supplementGuidance,
    declaredLock:
      'Doses. It carries the EFSA single-dose and daily-total caffeine limits, a protein figure ' +
      'per kg of body mass, and sampled contamination percentages. It holds no DOI, which is ' +
      'exactly why the DOI count alone was never the right gate.',
  },
  {
    id: 'formCues',
    file: 'src/content/formCues.ts',
    namespace: formCues,
    declaredLock: 'Carries a citation (1 DOI on this tree) beside safety cues for lifting.',
  },
  {
    id: 'sexRationale',
    file: 'src/content/sexRationale.ts',
    namespace: sexRationale,
    declaredLock: 'Carries citations (3 DOIs on this tree).',
  },
  {
    id: 'bodyEquations',
    file: 'src/content/bodyEquations.ts',
    namespace: bodyEquations,
    declaredLock: 'Carries citations and the equation coefficients themselves (4 DOIs).',
  },
  {
    id: 'guidanceReferences',
    file: 'src/content/guidanceReferences.ts',
    namespace: guidanceReferences,
    declaredLock: 'The reference list itself (30 DOIs).',
  },
  {
    id: 'specimenCards',
    file: 'src/content/specimenCards.ts',
    namespace: specimenCards,
    declaredLock: 'The Atlas card bodies and their sources (32 DOIs).',
  },
];

/** A heading takes R14; everything else does not. Derived from the path, never declared. */
export type R10FieldKind = 'heading' | 'prose';

export interface R10Field {
  readonly module: R10ModuleId;
  /** `EXPORT_NAME` then one segment per array index or object key, dot separated. */
  readonly path: string;
  /** `module:path`, the id the DOM, the panel and the patch all use. */
  readonly id: string;
  readonly kind: R10FieldKind;
  /** The string as the module exports it today. */
  readonly value: string;
}

/**
 * Fields are WALKED out of the namespace, not listed.
 *
 * A list here would be the fifth hand-maintained list this round has had to unpick, and it would
 * rot in the unsafe direction: a bullet added to a slide would simply not appear in the tool, and
 * nothing would say so. The walk finds it the moment it exists.
 *
 * A string carrying a newline is skipped. `INTRO_FIGURE` is the ASCII stick figure, four lines by
 * seven columns; it is drawing, not prose, and a single-line `contenteditable` would flatten it.
 */
function collect(
  module: R10ModuleId,
  prefix: string,
  node: unknown,
  depth: number,
  out: R10Field[],
  visited: WeakSet<object>,
): void {
  if (depth > 6) return;
  if (typeof node === 'string') {
    if (node === '' || node.includes('\n')) return;
    out.push({
      module,
      path: prefix,
      id: `${module}:${prefix}`,
      kind: kindOf(prefix),
      value: node,
    });
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  /*
   * ONE PATH PER OBJECT, and this is not an optimisation either.
   *
   * `specimenCards.ts` exports the same 38 card objects twice, as `SPECIMEN_CARDS` (an array) and
   * `SPECIMEN_BY_ID` (a map). Walking both reaches every card body under two paths, which the
   * value index then reads as a collision and drops - so the Atlas would have been the one place
   * a tap could never say anything, purely because the module offers two ways to reach the same
   * object. Identity, not value: two cards that happen to share a sentence still collide, which is
   * correct, because those really are two rows.
   */
  if (visited.has(node)) return;
  visited.add(node);
  if (Array.isArray(node)) {
    node.forEach((entry, index) => {
      collect(module, `${prefix}.${index}`, entry, depth + 1, out, visited);
    });
    return;
  }
  for (const [key, entry] of Object.entries(node)) {
    collect(module, `${prefix}.${key}`, entry, depth + 1, out, visited);
  }
}

/** R14 binds a heading. Derived from the path's last segment, or from an export named for one. */
function kindOf(path: string): R10FieldKind {
  const segments = path.split('.');
  const last = segments[segments.length - 1] ?? '';
  if (last === 'heading' || last === 'title') return 'heading';
  if (/_(?:HEADING|TITLE)$/.test(segments[0] ?? '')) return 'heading';
  return 'prose';
}

export interface R10Module {
  readonly id: R10ModuleId;
  readonly file: string;
  readonly fields: readonly R10Field[];
  /** Null when the module may be edited. Otherwise the sentence the panel shows. */
  readonly lock: string | null;
}

/** The registry, built once at load. */
export const R10_MODULES: readonly R10Module[] = MODULES.map((decl) => {
  const fields: R10Field[] = [];
  const visited = new WeakSet<object>();
  for (const [name, value] of Object.entries(decl.namespace)) {
    collect(decl.id, name, value, 0, fields, visited);
  }
  fields.sort((a, b) => a.path.localeCompare(b.path));
  return { id: decl.id, file: decl.file, fields, lock: lockFor(decl, fields) };
});

/**
 * The lock for one module: the declared reason, else the derived one, else null.
 *
 * The declared reason wins only because it is more specific; when it is absent the derived gate
 * is the whole of the decision, which is the case that matters. Both are stated to the owner.
 */
function lockFor(decl: ModuleDecl, fields: readonly R10Field[]): string | null {
  return decl.declaredLock ?? derivedLock(decl.file, fields);
}

/**
 * The derived half of the lock, over any set of fields.
 *
 * EXPORTED SO IT CAN BE PROVED RATHER THAN TRUSTED. `r10Text.test.ts` runs it over a copy of
 * `introSlides`' own fields with a DOI spliced into one of them, and asserts it locks. A gate
 * whose failure mode is "it silently stopped firing" has to be exercised by a test that does not
 * depend on today's content, and this is the seam that allows one.
 */
export function derivedLock(file: string, fields: readonly R10Field[]): string | null {
  for (const field of fields) {
    const why = evidenceIn(field.value);
    if (why === null) continue;
    return (
      `${file} now carries ${why}, at ${field.path}. A module that cites or doses ` +
      'something is not editable here: a WYSIWYG is how a DOI gets mangled. This lock was ' +
      'derived from the words themselves, not from a list, so removing that evidence unlocks ' +
      'the module again.'
    );
  }
  return null;
}

const BY_ID: ReadonlyMap<R10ModuleId, R10Module> = new Map(
  R10_MODULES.map((module) => [module.id, module]),
);

/** One module by id. */
export function r10Module(id: R10ModuleId): R10Module | undefined {
  return BY_ID.get(id);
}

/** Every field of every module, editable or not, in module then path order. */
export const R10_FIELDS: readonly R10Field[] = R10_MODULES.flatMap((module) => module.fields);

const FIELD_BY_ID: ReadonlyMap<string, R10Field> = new Map(
  R10_FIELDS.map((field) => [field.id, field]),
);

/** One field by `module:path`, or undefined. The applier's "unknown key" test, in the browser. */
export function r10Field(id: string): R10Field | undefined {
  return FIELD_BY_ID.get(id);
}

/** The lock on the module `id` belongs to, or null. */
export function r10Lock(id: string): string | null {
  const field = FIELD_BY_ID.get(id);
  if (field === undefined) return null;
  return BY_ID.get(field.module)?.lock ?? null;
}

/**
 * THE VALUE INDEX: rendered text back to the field that produced it.
 *
 * <!-- decision: r10-text-is-found-by-its-value-not-by-a-marker | status: adopted | supersedes: none -->
 *
 * `copy()` carries its key to the DOM as invisible tag characters, and src/design/copyMarkers.ts
 * records that it REJECTED value matching for that job: "the index is not injective.
 * `button.continue` and `button.introContinue` can hold the same word, and an edit would then be
 * routed to whichever key the index happened to return."
 *
 * That objection is answered here rather than ignored, and the difference is worth stating.
 *
 *   - The collision is DETECTED, not hoped against. The index is built at load and any value
 *     appearing under more than one field is DELETED from it. A colliding string is simply not
 *     offered for editing, so no edit can ever be misrouted. Nothing is guessed.
 *   - The match is against an element's WHOLE `textContent`, never a substring, so a sentence
 *     that merely contains a field's words does not match it.
 *   - These are long-form paragraphs rather than the two-word control labels that collide.
 *
 * WHAT IT BUYS, and it is the reason this is not a marker. Marking would mean editing each
 * module's exports, or each render site. Four of these modules render ONLY from
 * `src/ui/setup/SetupWizard.tsx`, which this work is not permitted to touch, and marking their
 * exports at load would push invisible characters into a wizard nobody can adjust if it goes
 * wrong. Reading the DOM costs those files nothing and reaches all eleven modules.
 *
 * WHAT IT COSTS: text still being typed out does not match. `src/ui/intro/IntroSequence.tsx`
 * reveals the intro one character at a time, so a slide is not editable until it has finished
 * typing. That is the correct behaviour rather than a workaround; half a sentence is not the row.
 */
const BY_VALUE: ReadonlyMap<string, R10Field> = (() => {
  const seen = new Map<string, R10Field | null>();
  for (const field of R10_FIELDS) {
    const key = field.value.trim();
    if (key.length < 2) continue;
    seen.set(key, seen.has(key) ? null : field);
  }
  const out = new Map<string, R10Field>();
  for (const [key, field] of seen) {
    if (field !== null) out.set(key, field);
  }
  return out;
})();

/** The field whose value is exactly `text`, or undefined. Never a guess: see BY_VALUE. */
export function r10FieldForValue(text: string): R10Field | undefined {
  return BY_VALUE.get(text.trim());
}

/** How many declared values are NOT offered because a second field holds the same string. */
export function r10ValueCollisions(): number {
  const counts = new Map<string, number>();
  for (const field of R10_FIELDS) {
    const key = field.value.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

/**
 * The contract, over one R10 string.
 *
 * WHICH RULES BIND R10 TEXT, and this is the contract's own scoping rather than a choice made
 * here. docs/plans/subagent-briefs/00-CONTEXT.md: "Long reference text ... goes in its own module
 * under `src/content/`, which R10 exempts from R1 to R4 - but not from R5, R6 or R11."
 *
 *   - R1, R2, R3, R4 do NOT bind. R10 exists because these strings run past those caps: the
 *     intro's slide-3 bullet is 33 words and `bodyFatChart.ts`'s own header records 47. Running a
 *     length cap here would fail every string in the set on the first keystroke.
 *   - R5, R6 and the URL ban DO bind, and `introSlides.test.ts` already asserts all three.
 *   - R11 binds as an ADVISORY, exactly as it does for the copy tables: two thirds of it is
 *     decidable and the rest is judgement (src/content/copyContract.ts).
 *   - R8 does NOT bind. The contract scopes it to "the default table", as R9 is scoped, and
 *     `copyContract.checkCopyValue` only applies it when `table === 'DEFAULT_COPY'`. These
 *     modules are not that table. An exclamation mark in the owner's own intro is his to write.
 *   - R14 binds a HEADING only. `IntroSlide.heading` is documented "Title Case noun phrase", and
 *     `check-title-case` is at 0 failures in CI, so a heading retyped in lower case has to be
 *     flagged AS HE TYPES rather than at merge. It is not applied to body prose, which is
 *     sentences and would fail on its first word.
 *
 * The EVIDENCE rule is new and belongs to this module. It fires when an edit would introduce a
 * DOI, a dose or a citation into a module that has none, and it is an error rather than an
 * advisory because the consequence is not cosmetic: the module locks itself on the next load and
 * the rest of his edits to it stop being applicable.
 */
export function checkR10Value(kind: R10FieldKind, value: string): readonly CopyViolation[] {
  const found: CopyViolation[] = [];

  if (value.trim() === '') {
    found.push({
      rule: 'R5',
      severity: 'error',
      message: 'An empty string is not an edit. Undo it, or type the replacement.',
    });
  }
  if (hasEmDash(value)) {
    found.push({ rule: 'R5', severity: 'error', message: 'R5: no em dash. Use a colon or a full stop.' });
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
      message: 'No URL in app text. A link is a component prop or a build constant.',
    });
  }
  if (kind === 'heading') {
    const bad = titleCaseOffenders(value);
    if (bad.length > 0) {
      found.push({
        rule: 'R14',
        severity: 'error',
        message: `R14: Title Case. These words are not capitalised: ${bad.join(', ')}.`,
      });
    }
  }
  const evidence = evidenceIn(value);
  if (evidence !== null) {
    found.push({
      rule: 'EVIDENCE',
      severity: 'error',
      message:
        `This adds ${evidence} to the text. A module that cites or doses something locks ` +
        'itself, so this edit would be the last one this module accepted.',
    });
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
