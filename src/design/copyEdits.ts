/**
 * DESIGN MODE, COPY EDITS: which table an edit lands in, and whether it is legal.
 *
 * <!-- decision: a-copy-edit-is-routed-by-the-skin-whose-words-are-on-screen | status: adopted | supersedes: none -->
 *
 * THE ROUTING RULE, AND IT IS THE SUBTLE PART OF TASK 2.
 *
 * Three skins ship and their tables are DELIBERATELY different registers: limelight is lower case
 * ("go on", "the look"), the board is upper ("PROCEED"), and scripts/check-title-case.mjs skips
 * both on purpose. Writing a limelight edit into `DEFAULT_COPY` would destroy both decisions
 * silently, so the edit has to reach the right table every time.
 *
 * THE TABLE IS CHOSEN BY `ui.skin`, THE APP'S OWN SAVED SKIN, AND NOT BY THE PANEL'S SKIN
 * SWITCHER. Task 1's switcher previews TOKENS: `DesignPanel` flips `<html data-skin>`, which is
 * what the two attribute-scoped blocks in tokens.css key on, and it deliberately does not write
 * `ui.skin` because that would mean writing to the Zustand document. The WORDS on screen never
 * move with it: `useCopy()` calls `copyFor(useSkin(), key)`, and `useSkin()` reads the store. So
 * previewing the board's colours while the app is set to clinical leaves CLINICAL words on the
 * page, and an edit to those words belongs in `DEFAULT_COPY`.
 *
 * Getting this backwards is not a cosmetic error. It would file a Title-Case clinical sentence
 * into `copy.board.ts` under a skin whose whole register is upper case, and the merge gates would
 * not catch it: R14 skips the skin tables by design.
 *
 * BECAUSE THAT IS SUBTLE, THE PANEL STATES IT RATHER THAN LEAVING IT TO BE INFERRED.
 * `describeTarget()` below returns the sentence the panel prints before the owner types: which
 * skin's words are on screen, which file the edit is written to, and whether the row he is about
 * to edit exists in that file yet.
 *
 * WHAT IS OUT OF SCOPE, PERMANENTLY. Only `src/content/copy.ts` and the two skin override tables
 * are editable. The R10 modules - `bodyEquations.ts`, `guidanceReferences.ts`, `sexRationale.ts`,
 * `supplementGuidance.ts`, `reviewDataNotes.ts` and the rest - carry citations, DOIs, doses and
 * structure. They do not pass through `copy()`, they are never marked, and they must not be made
 * editable: a WYSIWYG is how a DOI gets mangled.
 */
import { BOARD_COPY, DEFAULT_COPY, LIMELIGHT_COPY } from '../content/copy';
import type { CopyKey } from '../content/copy';
import { checkCopyValue } from '../content/copyContract';
import type { CopyTableId, CopyViolation } from '../content/copyContract';
import type { SkinId } from '../domain/types';

/** Per skin, the keys the owner has retyped and what he retyped them to. */
export type CopyEdits = Partial<Record<SkinId, Record<string, string>>>;

/** The table one skin's edits are written into. `clinical` IS the default table, not an overlay. */
export function tableIdForSkin(skin: SkinId): CopyTableId {
  if (skin === 'limelight') return 'LIMELIGHT_COPY';
  if (skin === 'board') return 'BOARD_COPY';
  return 'DEFAULT_COPY';
}

/** The source file each table lives in. The applier and the panel name the same path. */
export const TABLE_FILE: Readonly<Record<CopyTableId, string>> = {
  DEFAULT_COPY: 'src/content/copy.ts',
  LIMELIGHT_COPY: 'src/content/copy.limelight.ts',
  BOARD_COPY: 'src/content/copy.board.ts',
};

const TABLE: Readonly<Record<CopyTableId, Readonly<Partial<Record<CopyKey, string>>>>> = {
  DEFAULT_COPY,
  LIMELIGHT_COPY,
  BOARD_COPY,
};

/**
 * The row the TARGET table itself declares, or undefined when it declares none.
 *
 * Not the merged value. A key limelight does not override renders the clinical sentence, and
 * `copy.limelight.ts` still has no row for it: the difference is exactly what decides whether an
 * edit can be applied at all.
 */
export function tableRow(skin: SkinId, key: string): string | undefined {
  return TABLE[tableIdForSkin(skin)][key as CopyKey];
}

/** The string this skin actually renders: its own row, or the clinical one it inherits. */
export function renderedRow(skin: SkinId, key: string): string | undefined {
  return tableRow(skin, key) ?? DEFAULT_COPY[key as CopyKey];
}

/** True when `key` is a real `CopyKey`. The applier refuses anything else outright. */
export function isKnownCopyKey(key: string): boolean {
  return Object.hasOwn(DEFAULT_COPY, key);
}

/** Every rule that can be decided from the string, for this key under this skin's table. */
export function validateCopyEdit(
  skin: SkinId,
  key: string,
  value: string,
): readonly CopyViolation[] {
  return checkCopyValue(key, value, tableIdForSkin(skin));
}

/** Why a key cannot be edited here, or null when it can. */
export type CopyEditBlock =
  | { readonly reason: 'unknown-key'; readonly message: string }
  | { readonly reason: 'no-row'; readonly message: string };

/**
 * Whether an edit to `key` under `skin` can be carried by a patch.
 *
 * TWO REFUSALS, BOTH THE APPLIER'S RULES RESTATED AT THE KEYBOARD so the owner learns at the
 * moment of typing rather than from a script hours later.
 *
 *   - `unknown-key`: not a `CopyKey`. Inventing one needs a union entry, a part in
 *     scripts/alpha-parts.mjs and a step in scripts/alpha-walk.mjs. A patch cannot do that.
 *   - `no-row`: a real key, but this SKIN's table has no row for it, so the rendered words are
 *     the clinical ones falling through. `scripts/design-patch.mjs` rewrites rows in place and
 *     never inserts one, for the same reason its token half never invents a declaration: an
 *     inserted line has no comment saying why the row exists, and `copy.limelight.ts` states in
 *     its own header that a row exists "only where the WORDS change". Add the row by hand, with
 *     that sentence, then edit it here.
 */
export function blockedReason(skin: SkinId, key: string): CopyEditBlock | null {
  if (!isKnownCopyKey(key)) {
    return {
      reason: 'unknown-key',
      message: `${key} is not a CopyKey. Nothing on this screen should render it.`,
    };
  }
  if (tableRow(skin, key) === undefined) {
    const file = TABLE_FILE[tableIdForSkin(skin)];
    return {
      reason: 'no-row',
      message: `${file} has no row for ${key}: this screen is showing the clinical sentence. Add the row by hand first, with the comment that says why the skin needs its own words.`,
    };
  }
  return null;
}

/** The sentence the panel prints before he types, naming the skin and the file. */
export function describeTarget(skin: SkinId): string {
  const table = tableIdForSkin(skin);
  return `Words on screen: ${skin}. An edit is written to ${table} in ${TABLE_FILE[table]}.`;
}

/**
 * The patch's `copy` map: per skin, only the keys whose value differs from that skin's own row.
 *
 * SHAPE NOTE, and it is a deliberate departure from the plan document. Task 2 of
 * docs/plans/2026-09-10-16-design-mode.md writes "the patch's `copy` map is `{ key: newValue }`"
 * and, three bullets later, "per-skin edits write to the skin's override table". Both cannot hold
 * at once: a flat map carries no skin, so an applier reading it would have to GUESS which of the
 * three tables a key belongs to, which is the one mistake this task exists to prevent. The map is
 * therefore keyed by skin exactly as `tokens` already is. `version` stays 1 because the field has
 * only ever shipped as `{}`, which is valid under both readings, so no patch in existence changes
 * meaning.
 */
export function buildCopyPatch(edits: CopyEdits): Partial<Record<SkinId, Record<string, string>>> {
  const out: Partial<Record<SkinId, Record<string, string>>> = {};
  for (const [skin, map] of Object.entries(edits) as ReadonlyArray<
    readonly [SkinId, Record<string, string>]
  >) {
    const changed: Record<string, string> = {};
    for (const [key, value] of Object.entries(map)) {
      const before = tableRow(skin, key);
      if (before === undefined) continue; // Never invents a row. See blockedReason.
      if (value === before) continue;
      changed[key] = value;
    }
    if (Object.keys(changed).length > 0) out[skin] = changed;
  }
  return out;
}

/** How many rows the copy half of a patch would rewrite. */
export function copyPatchSize(map: Partial<Record<SkinId, Record<string, string>>>): number {
  return Object.values(map).reduce((total, rows) => total + Object.keys(rows).length, 0);
}
