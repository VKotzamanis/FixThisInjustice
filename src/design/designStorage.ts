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
import type { DesignNote, NoteIntent } from './r10Edits';

/** One namespaced key, versioned so a later shape change can be recognised rather than guessed. */
export const DESIGN_STORAGE_KEY = 'fti.designMode.tokenEdits.v1';

/**
 * The stored shape: per skin, what the owner changed.
 *
 * `copy` was added by Task 2 and shares this key rather than taking a second one, because the two
 * halves are one afternoon's work and are exported as one patch. It is keyed by skin for the same
 * reason `tokens` is: an edit made while limelight's words are on screen belongs in
 * `copy.limelight.ts`, and a flat map would leave the applier to guess which of the three tables
 * a key came from. src/design/copyEdits.ts carries that decision in full.
 *
 * NO VERSION BUMP. A stored body written before Task 2 has no `copy` field, and an absent field
 * reads as "no copy edits", which is exactly what it means. Bumping would have discarded a
 * developer's uncommitted colour work to add a field that defaults correctly without it.
 */
export interface StoredEdits {
  readonly version: 1;
  readonly tokens: Partial<Record<SkinId, Record<string, string>>>;
  readonly copy: Partial<Record<SkinId, Record<string, string>>>;
  /**
   * R10 long-form text, `module:path` to the retyped string. NOT keyed by skin, and that is a
   * property of the content rather than an omission: these modules export one version of each
   * string and every skin renders it. src/design/r10Edits.ts carries the reasoning.
   */
  readonly r10: Record<string, string>;
  /** Structural intents and free notes, one per element. src/design/r10Edits.ts says why. */
  readonly notes: readonly DesignNote[];
}

/**
 * NO VERSION BUMP, for the same reason Task 2 did not bump when it added `copy`: a body stored
 * before this change has no `r10` and no `notes`, an absent field reads as "none of those", and
 * that is exactly what it means. Bumping would discard a developer's uncommitted colour work to
 * add two fields that default correctly without it.
 */
const EMPTY: StoredEdits = { version: 1, tokens: {}, copy: {}, r10: {}, notes: [] };

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
  const body = parsed as {
    version?: unknown;
    tokens?: unknown;
    copy?: unknown;
    r10?: unknown;
    notes?: unknown;
  };
  if (body.version !== 1) return EMPTY;
  if (typeof body.tokens !== 'object' || body.tokens === null) return EMPTY;
  return {
    version: 1,
    tokens: perSkin(body.tokens),
    // Absent before Task 2, and an absent field means no copy edits. See the interface above.
    copy: perSkin(body.copy),
    r10: isStringRecord(body.r10) ? body.r10 : {},
    notes: readNotes(body.notes),
  };
}

/** The four intents the panel writes. Anything else in storage is discarded, not repaired. */
const INTENTS: ReadonlySet<string> = new Set<NoteIntent>(['heading', 'bullet', 'delete', 'note']);

/** Stored notes, with every malformed entry dropped for the reason `readStoredEdits` gives. */
function readNotes(value: unknown): readonly DesignNote[] {
  if (!Array.isArray(value)) return [];
  const out: DesignNote[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const note = entry as { target?: unknown; intent?: unknown; text?: unknown };
    if (typeof note.target !== 'string' || note.target === '') continue;
    if (typeof note.intent !== 'string' || !INTENTS.has(note.intent)) continue;
    if (typeof note.text !== 'string') continue;
    out.push({ target: note.target, intent: note.intent as NoteIntent, text: note.text });
  }
  return out;
}

/** A `{ skin: { name: value } }` body, with every unrecognised skin and value discarded. */
function perSkin(value: unknown): Partial<Record<SkinId, Record<string, string>>> {
  const out: Partial<Record<SkinId, Record<string, string>>> = {};
  if (typeof value !== 'object' || value === null) return out;
  for (const [skin, values] of Object.entries(value as Record<string, unknown>)) {
    if (skin !== 'clinical' && skin !== 'limelight' && skin !== 'board') continue;
    if (!isStringRecord(values)) continue;
    out[skin] = values;
  }
  return out;
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
