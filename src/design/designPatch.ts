/**
 * The export patch: the shape the panel emits and `scripts/design-patch.mjs` applies.
 *
 * `assets` and `notes` are present and EMPTY on purpose. Tasks 3 and 4 of
 * docs/plans/2026-09-10-16-design-mode.md fill them, and the applier should accept the whole
 * shape from the first day rather than growing a second version number per task. A reader who
 * finds two empty fields here is looking at a plan, not at an oversight.
 *
 * `copy` was one of those three until Task 2 filled it. It is keyed BY SKIN, mirroring `tokens`,
 * and src/design/copyEdits.ts records why the plan's flat `{ key: value }` could not be used: a
 * flat map carries no skin, so an applier reading it would have to guess which of the three
 * tables a key belongs to, and guessing wrong writes a Title-Case clinical sentence into a table
 * whose whole register is lower case. `version` stays 1: the field has only ever shipped as `{}`,
 * which is valid under both readings, so no patch already in existence changes meaning.
 */
import { SKIN_IDS } from '../skins/skinContext';
import type { SkinId } from '../domain/types';
import { shippedValues } from './tokenSheet';
import { buildCopyPatch, copyPatchSize } from './copyEdits';
import type { StoredEdits } from './designStorage';

/** The only `version` `scripts/design-patch.mjs` accepts. Bump both together, never one. */
export const PATCH_VERSION = 1;

export interface DesignPatch {
  readonly version: typeof PATCH_VERSION;
  /** UTC, `YYYY-MM-DDTHH:MM:SSZ`. Provenance for a patch that may be applied days later. */
  readonly generatedAt: string;
  /** Per skin, ONLY the tokens whose value differs from the shipped sheet. */
  readonly tokens: Partial<Record<SkinId, Record<string, string>>>;
  /** Per skin, ONLY the keys whose value differs from that skin's own row. Task 2. */
  readonly copy: Partial<Record<SkinId, Record<string, string>>>;
  /** Task 3. Empty here. */
  readonly assets: readonly unknown[];
  /** Task 4. Empty here. */
  readonly notes: readonly unknown[];
}

/**
 * `YYYY-MM-DDTHH:MM:SSZ` in UTC, built by hand.
 *
 * NOT `toISOString()`: eslint.config.js bans that call outside src/domain/dates.ts, because it
 * converts to UTC and silently shifts a CIVIL date. A build stamp has no time zone to respect
 * and this string is UTC by construction, so the ban is honoured rather than given an
 * exception, exactly as vite.config.ts does for its own build date.
 */
export function utcStamp(now: number): string {
  const d = new Date(now);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const date = [d.getUTCFullYear(), pad(d.getUTCMonth() + 1), pad(d.getUTCDate())].join('-');
  const time = [pad(d.getUTCHours()), pad(d.getUTCMinutes()), pad(d.getUTCSeconds())].join(':');
  return `${date}T${time}Z`;
}

/**
 * The patch for the current edits.
 *
 * ONLY CHANGED TOKENS SURVIVE. An edit that equals the shipped value is dropped, and a skin
 * left with nothing is dropped whole. A patch of 121 unchanged declarations is not reviewable,
 * and the applier's job is to rewrite exactly the lines a human agreed to.
 */
export function buildPatch(edits: StoredEdits, now: number): DesignPatch {
  const tokens: Partial<Record<SkinId, Record<string, string>>> = {};
  for (const skin of SKIN_IDS) {
    const shipped = shippedValues(skin);
    const edited = edits.tokens[skin] ?? {};
    const changed: Record<string, string> = {};
    for (const [name, value] of Object.entries(edited)) {
      const before = shipped.get(name);
      if (before === undefined) continue; // A token this skin does not declare. Never invented.
      if (value.trim() === before.trim()) continue;
      changed[name] = value.trim();
    }
    if (Object.keys(changed).length > 0) tokens[skin] = changed;
  }
  return {
    version: PATCH_VERSION,
    generatedAt: utcStamp(now),
    tokens,
    copy: buildCopyPatch(edits.copy),
    assets: [],
    notes: [],
  };
}

/** How many declarations and copy rows the patch would rewrite. Shown beside the button. */
export function patchSize(patch: DesignPatch): number {
  const tokens = Object.values(patch.tokens).reduce(
    (total, map) => total + Object.keys(map).length,
    0,
  );
  return tokens + copyPatchSize(patch.copy);
}
