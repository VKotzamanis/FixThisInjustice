/**
 * DESIGN MODE, R10 TEXT: what an edit to a long-form module is allowed to be, and what it exports
 * as.
 *
 * The rule this implements lives in `src/content/r10Text.ts`: a module that CITES something is
 * not editable, and being R10 is not by itself a reason. Read that header first; this file is the
 * design-mode half and decides only routing, refusals and patch shape.
 *
 * THREE DIFFERENCES FROM `src/design/copyEdits.ts`, all of them consequences of the content and
 * none of them a matter of taste.
 *
 *   1. NO SKIN. A copy edit has to be routed to one of three tables and copyEdits.ts spends its
 *      header on that. These modules export exactly one version of each string and every skin
 *      renders it, so an edit is filed under `module:path`. The panel states this before he types,
 *      because someone who has read the copy section will reasonably expect the opposite.
 *   2. THE PATCH CARRIES `before` AS WELL AS `after`. A copy row is found by its KEY, which the
 *      source writes out as `'button.continue':`. An R10 field has no key in the source: it is the
 *      third string in the second object of an array literal. Carrying the shipped value lets
 *      `scripts/design-patch.mjs` find the row by matching the literal it is about to replace, and
 *      refuse when that literal appears zero times or more than once. It never counts brackets and
 *      never re-serialises the array, so every comment in the module survives.
 *   3. STRUCTURE IS A NOTE, NOT AN EDIT. Promoting a bullet to the lead, demoting the lead, and
 *      deleting a bullet are recorded as intents against the element and exported for a human.
 *      The reasoning is in `buildNotes` below.
 */
import { checkR10Value, r10Field, r10Lock } from '../content/r10Text';
import type { CopyViolation } from '../content/copyContract';

/** Field id (`module:path`) to the string the owner retyped. */
export type R10Edits = Record<string, string>;

/**
 * The structural intents the panel offers, plus a free note.
 *
 * `heading` and `bullet` are the owner's own words for what he wanted: "reclassify some text as
 * headings/main text". `delete` is the third. `note` carries anything else he types.
 */
export type NoteIntent = 'heading' | 'bullet' | 'delete' | 'note';

export interface DesignNote {
  /** An R10 field id, a copy key, or any `data-part` the page carries. */
  readonly target: string;
  readonly intent: NoteIntent;
  /** Free text. Empty for a bare intent. */
  readonly text: string;
}

/** The sentence each intent exports as, so the patch reads as an instruction and not a code. */
const INTENT_WORDS: Readonly<Record<NoteIntent, string>> = {
  heading: 'Promote this to a heading.',
  bullet: 'Demote this to a bullet.',
  delete: 'Delete this.',
  note: '',
};

export interface R10Block {
  readonly reason: 'unknown-field' | 'locked';
  readonly message: string;
}

/** Why this field cannot be edited, or null when it can. */
export function r10Blocked(id: string): R10Block | null {
  const field = r10Field(id);
  if (field === undefined) {
    return {
      reason: 'unknown-field',
      message: `${id} is not a field this registry knows. Nothing on this screen should render it.`,
    };
  }
  const lock = r10Lock(id);
  if (lock !== null) {
    return {
      reason: 'locked',
      message: `${field.module} is locked. ${lock}`,
    };
  }
  return null;
}

/** Every rule that binds R10 text, for one field. See checkR10Value for which rules and why. */
export function validateR10Edit(id: string, value: string): readonly CopyViolation[] {
  const field = r10Field(id);
  if (field === undefined) return [];
  return checkR10Value(field.kind, value);
}

/** The string this field ships with, or undefined for an unknown field. */
export function r10Shipped(id: string): string | undefined {
  return r10Field(id)?.value;
}

/** The sentence the panel prints before he types. */
export function describeR10Target(): string {
  return (
    'Long-form text. These modules are not per skin: one version of each string, rendered by ' +
    'every skin, so an edit is filed under its module and not under clinical, limelight or board.'
  );
}

/** One rewritten row, as the patch carries it and the applier reads it. */
export interface R10PatchEntry {
  readonly module: string;
  /** Repository-relative, and the only file this entry may touch. */
  readonly file: string;
  /** `EXPORT_NAME` then one segment per index or key. Printed in the diff, never parsed. */
  readonly field: string;
  /** The literal the applier must find, exactly once, in `file`. */
  readonly before: string;
  readonly after: string;
}

/**
 * The `r10` half of a patch: only the fields whose value differs from the shipped string.
 *
 * AN ARRAY, NOT THE NESTED MAP `tokens` AND `copy` USE, because an entry has to carry four fields
 * and a map of maps would have to nest a fifth level to hold `before`. The applier reads it in
 * order and prints one diff hunk per entry.
 *
 * A LOCKED FIELD NEVER REACHES THE PATCH, even if one somehow got into storage from an earlier
 * session where the module was not yet locked. The lock is re-derived on every load and re-checked
 * here, and `scripts/design-patch.mjs` re-derives it a third time from the file on disk. Three
 * independent checks, because the one this exists to prevent is unrecoverable.
 */
export function buildR10Patch(edits: R10Edits): readonly R10PatchEntry[] {
  const out: R10PatchEntry[] = [];
  for (const [id, value] of Object.entries(edits)) {
    const field = r10Field(id);
    if (field === undefined) continue;
    if (r10Lock(id) !== null) continue;
    if (value === field.value) continue;
    if (value.trim() === '') continue;
    out.push({
      module: field.module,
      file: fileOf(field.module),
      field: field.path,
      before: field.value,
      after: value,
    });
  }
  out.sort((a, b) => `${a.module}.${a.field}`.localeCompare(`${b.module}.${b.field}`));
  return out;
}

function fileOf(module: string): string {
  return `src/content/${module}.ts`;
}

/**
 * The `notes` half: the structural changes, as instructions rather than as a rewritten array.
 *
 * <!-- decision: r10-structure-is-annotated-not-rewritten | status: adopted | supersedes: none -->
 *
 * WHY THIS IS A NOTE AND NOT AN APPLIER. `INTRO_SLIDES` is a nested array literal: promoting a
 * bullet to the lead means deleting one object, rewriting a sibling string and renumbering nothing
 * that is numbered, and the applier would have to GENERATE source lines rather than replace a
 * literal inside one. Three things follow, and each on its own is enough.
 *
 *   - Every other write in this tool replaces the text between two known offsets and copies the
 *     rest of the file through byte for byte. That property is why `scripts/design-patch.mjs` can
 *     be trusted with a module whose comments carry measured figures. A generator does not have
 *     it: a comment sitting above the bullet being deleted has no defined destination, and the
 *     applier would be choosing, silently, whether to keep it.
 *   - `src/ui/intro/IntroSequence.tsx` types the slide out one character at a time from a budget
 *     it derives by joining the lead and every bullet. A structural change alters that budget, so
 *     a half-correct rewrite does not merely look wrong: it types out wrong.
 *   - `introSlides.ts` states that the content is the owner's and must not be reworded. A delete
 *     that lands on the wrong bullet destroys the only copy of a sentence he wrote, and a patch
 *     file cannot put it back.
 *
 * docs/plans/2026-09-10-16-design-mode.md already made this trade for layout, in the decision
 * `layout-is-annotated-not-edited`: "a pile of coordinates someone then has to reinterpret ...
 * is worse than a sentence". The same argument holds here and the same shape is reused, so these
 * notes drop into the ledger beside the layout ones rather than needing a reader of their own.
 *
 * A NOTE IS REVERSIBLE AND AN APPLIED DELETE IS NOT. He uses this on a phone and will mis-tap.
 * Removing a note in the panel restores nothing, because nothing was destroyed.
 */
export function buildNotes(notes: readonly DesignNote[]): ReadonlyArray<{
  readonly part: string;
  readonly text: string;
}> {
  return notes
    .filter((note) => note.intent !== 'note' || note.text.trim() !== '')
    .map((note) => ({
      part: note.target,
      text: [INTENT_WORDS[note.intent], note.text.trim()].filter((part) => part !== '').join(' '),
    }));
}

/** Notes with the entry at `index` removed, which is what undoing one in the panel means. */
export function withoutNote(notes: readonly DesignNote[], index: number): readonly DesignNote[] {
  return notes.filter((_note, at) => at !== index);
}
