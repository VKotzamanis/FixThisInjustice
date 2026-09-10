/**
 * DESIGN MODE, THE COPY KEY MARKER.
 *
 * Task 2 of docs/plans/2026-09-10-16-design-mode.md needs the rendered DOM to say WHICH copy key
 * produced each run of text, so a node can be made `contenteditable` and the edit routed back to
 * the right row in the right table. `copy()` returns a `string`; it cannot return a `<span>`
 * without breaking every call site that puts the result in an `aria-label`, a `title` or a
 * template literal. So the key travels INSIDE the string, and a decorator in the DOM turns the
 * marked run into an element (src/design/CopyEditLayer.tsx).
 *
 * <!-- decision: copy-keys-travel-as-invisible-tag-characters | status: adopted | supersedes: none -->
 *
 * WHY UNICODE TAG CHARACTERS (U+E0020 to U+E007F) AND NOT A READABLE SENTINEL. The decorator can
 * always lose a race with a render: React writes the text node, the MutationObserver runs a frame
 * later. Whatever the marker is, it is on screen for that frame, and it is on screen for good if
 * the decorator is not mounted at all. A readable sentinel such as `[[button.continue]]` would
 * flash the key at the owner and would corrupt any string measured, truncated or spoken before
 * the decorator ran. Tag characters are Default_Ignorable_Code_Point: a conforming renderer draws
 * NOTHING for them, so an unprocessed marker is invisible rather than merely unlikely to be seen.
 * They are also exactly ASCII shifted by 0xE0000, so the encoding is a total, invertible function
 * of the key with no table and no registry to drift.
 *
 * THE ALTERNATIVES, AND WHY EACH LOST.
 *   - Return a React element from `copy()`, cast to `string`. Rejected: `FORMAT.stepOf` and its
 *     twenty siblings interpolate the result into a template literal, where an element renders as
 *     `[object Object]`. That is a defect on the face of the app, not in design mode alone.
 *   - Match the rendered text against a value-to-key index built from the tables. Rejected: the
 *     index is not injective. `button.continue` and `button.introContinue` can hold the same
 *     word, and an edit would then be routed to whichever key the index happened to return.
 *   - Push each key onto a queue as `copy()` is called and pair queue order with DOM order.
 *     Rejected: React re-renders subtrees independently, so the two orders diverge on the first
 *     partial update and nothing detects that they have.
 *
 * WHAT THIS COSTS WHEN DESIGN MODE IS OFF: one boolean test per `copy()` call, and the identical
 * string. `MARKING` below is decided once, at module load, from the query parameter. It is not a
 * React state, so no render can turn it on by accident.
 *
 * IT IS NOT APP COPY AND IT IS NOT USER DATA. Nothing here is written to the store, to a profile
 * or to the catalogue: `scripts/alpha-catalogue.mjs` loads `copy.ts` in Node, where there is no
 * `window` and marking is off, so `catalogue.json` never sees a marker.
 */
import { isDesignMode } from './designMode';

/** Tag characters are ASCII plus this offset. U+E0020 is SPACE, U+E007E is TILDE. */
const TAG_BASE = 0xe0000;

/** The lowest and highest ASCII code points a copy key may use. Keys are `[a-zA-Z0-9.]` today. */
const ASCII_FIRST = 0x20;
const ASCII_LAST = 0x7e;

/** U+E007F CANCEL TAG: ends the key. Chosen because it is the tag block's own terminator. */
const KEY_END = String.fromCodePoint(0xe007f);

/** U+E0001 LANGUAGE TAG: ends the value. In the tag block, outside the key's own range. */
const VALUE_END = String.fromCodePoint(0xe0001);

/**
 * One marked run: `tag(key) + KEY_END + value + VALUE_END`.
 *
 * The value may not itself contain VALUE_END, which no copy string does and which `markCopyValue`
 * refuses to produce.
 */
const MARK_PATTERN = /[\u{E0020}-\u{E007E}]+\u{E007F}([^\u{E0001}]*)\u{E0001}/gu;

/** Any marker character at all, for the cheap "is there anything to do here" test. */
const ANY_MARKER = /[\u{E0001}\u{E0020}-\u{E007F}]/u;

/**
 * Whether `copy()` marks its return value.
 *
 * Read once from the query parameter at module load, BEFORE React renders anything, because a
 * flag flipped by an effect would arrive after the tree it needed to mark had already committed.
 * `window` is absent under `vite ssrLoadModule`, which is how the catalogue and title-case
 * scripts read the tables, so the guard is a real one rather than defensive decoration.
 */
let marking: boolean = (() => {
  try {
    return typeof window !== 'undefined' && isDesignMode(window.location.search);
  } catch {
    // A context with no reachable location. Marking off is always the safe answer.
    return false;
  }
})();

/** True when `copy()` is currently marking. */
export function isMarkingCopyKeys(): boolean {
  return marking;
}

/**
 * Turns marking on or off.
 *
 * The ONLY caller in the app is none: the query parameter decides. It exists for tests, which
 * must be able to assert both halves of "outside design mode the accessor returns an identical
 * string" without navigating jsdom.
 */
export function setCopyKeyMarking(on: boolean): void {
  marking = on;
}

/** `key` as tag characters. Returns null when the key holds a character the block cannot carry. */
function tagEncode(key: string): string | null {
  let out = '';
  for (const character of key) {
    const point = character.codePointAt(0) ?? 0;
    if (point < ASCII_FIRST || point > ASCII_LAST) return null;
    out += String.fromCodePoint(TAG_BASE + point);
  }
  return out === '' ? null : out;
}

/** A tag-character run back to ASCII. */
function tagDecode(tags: string): string {
  let out = '';
  for (const character of tags) {
    const point = character.codePointAt(0) ?? 0;
    out += String.fromCodePoint(point - TAG_BASE);
  }
  return out;
}

/**
 * The marked form of one table value.
 *
 * Refuses, by returning `value` untouched, when the key cannot be encoded or when the value
 * already holds a marker character. Both are impossible with today's tables; returning the plain
 * string rather than throwing keeps a malformed key from taking the whole app down in the one
 * mode whose entire job is to be used on a phone, far from a console.
 */
export function markCopyValue(key: string, value: string): string {
  const tags = tagEncode(key);
  if (tags === null) return value;
  if (ANY_MARKER.test(value)) return value;
  return `${tags}${KEY_END}${value}${VALUE_END}`;
}

/** Every marker character removed, leaving what a reader was always going to see. */
export function stripCopyMarkers(text: string): string {
  return text.replace(new RegExp(ANY_MARKER, 'gu'), '');
}

/** True when `text` holds at least one complete marked run. */
export function hasCopyMarker(text: string): boolean {
  MARK_PATTERN.lastIndex = 0;
  return MARK_PATTERN.test(text);
}

/** One decoded run, with its position in the ORIGINAL string. */
export interface CopyMark {
  readonly key: string;
  readonly value: string;
  /** Index of the first marker character in the original string. */
  readonly start: number;
  /** Index one past the last marker character in the original string. */
  readonly end: number;
}

/**
 * Every marked run in `text`, in order.
 *
 * A composed string carries one run per key it read: `FORMAT.stepOf` produces
 * `Step 1 of 8: <mark>Units</mark>`, so the decorator sees the literal frame as unmarked text and
 * the key's own words as a run it can attribute. That is the whole reason the marker is a PAIR
 * rather than a prefix.
 */
export function findCopyMarks(text: string): readonly CopyMark[] {
  const marks: CopyMark[] = [];
  MARK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null = MARK_PATTERN.exec(text);
  while (match !== null) {
    const whole = match[0];
    const value = match[1] ?? '';
    const keyTags = whole.slice(0, whole.length - value.length - KEY_END.length - VALUE_END.length);
    marks.push({
      key: tagDecode(keyTags),
      value,
      start: match.index,
      end: match.index + whole.length,
    });
    match = MARK_PATTERN.exec(text);
  }
  return marks;
}
