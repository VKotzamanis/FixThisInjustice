/**
 * Design Mode's OWN `localStorage` key, and the only module allowed to touch it.
 *
 * WHY THIS IS AN EXCEPTION TO "ONE KEY, ONE OWNER". `eslint.config.js` reserves `localStorage`
 * for `src/store/persistence.ts` because the app's DOCUMENT must have exactly one writer. This
 * key is not the document: it holds a developer's unsaved token edits, under a namespace of its
 * own, and nothing in the app reads it. The ban is restated for `sessionStorage` and for
 * `toISOString`, following the pattern the two existing exemptions in that file already set, so
 * lifting one ban does not lift the others.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never touches `FTI_DOC_KEY` or anything under it, and it
 * never reads or writes a profile. A failure to persist is swallowed at the call site with a
 * reason, not silently: `catch` bodies here are non-empty, which `no-empty` also enforces.
 *
 * Storage can be absent entirely (Safari private browsing throws on the first read, a blocked
 * context throws on every call), so every entry point degrades to "no stored edits" rather than
 * taking the panel down. Losing an afternoon of edits is bad; a white screen is worse.
 */
import type { SkinId } from '../domain/types';

/** One namespaced key, versioned so a later shape change can be recognised rather than guessed. */
export const DESIGN_STORAGE_KEY = 'fti.designMode.tokenEdits.v1';

/** The stored shape: per skin, the tokens the owner has changed and what he changed them to. */
export interface StoredEdits {
  readonly version: 1;
  readonly tokens: Partial<Record<SkinId, Record<string, string>>>;
}

const EMPTY: StoredEdits = { version: 1, tokens: {} };

/** True when `value` is a flat object of string to string. */
function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === 'string');
}

/**
 * Reads the stored edits.
 *
 * Anything unrecognised - a different `version`, a corrupt JSON body, a value that is not a
 * string - is discarded rather than repaired. These are one developer's uncommitted colour
 * tweaks; guessing at a half-parsed shape would apply a value nobody chose.
 */
export function readStoredEdits(): StoredEdits {
  let raw: string | null;
  try {
    raw = localStorage.getItem(DESIGN_STORAGE_KEY);
  } catch {
    // Storage unavailable (private browsing, a blocked context). No stored edits, not a crash.
    return EMPTY;
  }
  if (raw === null) return EMPTY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A corrupt body is discarded, for the reason above.
    return EMPTY;
  }
  if (typeof parsed !== 'object' || parsed === null) return EMPTY;
  const body = parsed as { version?: unknown; tokens?: unknown };
  if (body.version !== 1) return EMPTY;
  if (typeof body.tokens !== 'object' || body.tokens === null) return EMPTY;
  const tokens: Partial<Record<SkinId, Record<string, string>>> = {};
  for (const [skin, values] of Object.entries(body.tokens as Record<string, unknown>)) {
    if (skin !== 'clinical' && skin !== 'limelight' && skin !== 'board') continue;
    if (!isStringRecord(values)) continue;
    tokens[skin] = values;
  }
  return { version: 1, tokens };
}

/** Writes the edits. Returns false when storage refused them, so the panel can say so. */
export function writeStoredEdits(edits: StoredEdits): boolean {
  try {
    localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(edits));
    return true;
  } catch {
    // Quota, or storage unavailable. The panel reports it rather than pretending it saved.
    return false;
  }
}

/** Drops the key entirely, which is what RESET means: back to the shipped values. */
export function clearStoredEdits(): boolean {
  try {
    localStorage.removeItem(DESIGN_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
