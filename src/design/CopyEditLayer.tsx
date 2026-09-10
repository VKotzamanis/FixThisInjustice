/**
 * DESIGN MODE, IN-PLACE TEXT EDITING.
 *
 * Task 2 of docs/plans/2026-09-10-16-design-mode.md, widened to the long-form modules. `copy()`
 * marks its return value with the key that produced it (src/design/copyMarkers.ts records why the
 * marker is invisible tag characters rather than a readable sentinel). This layer turns each
 * marked run into a `data-copy-key` element, makes the ones it can attribute exactly
 * `contenteditable`, runs the copy contract as the owner types, and hands every committed string
 * back to the panel.
 *
 * IT ALSO REACHES THE R10 MODULES, WHICH `copy()` DOES NOT. Task 2 shipped saying they were out of
 * scope permanently, and the sentence that ruled them out - "they carry citations, DOIs and doses"
 * - was true of some of them and false of the one the owner opened the tool to edit.
 * `src/content/introSlides.ts` holds five slides of his own prose and not one citation.
 * `src/content/r10Text.ts` carries the restated rule, the derived lock and the reasoning; this
 * file only decorates what that registry reports.
 *
 * <!-- decision: decorate-the-existing-element-never-insert-one | status: adopted | supersedes: none -->
 *
 * IT NEVER INSERTS OR REMOVES A NODE REACT OWNS. The obvious build wraps each marked run in a
 * fresh `<span>`. That is how a decorator breaks React: the next reconciliation of that subtree
 * finds a child it did not create, and removal throws `NotFoundError: The node to be removed is
 * not a child of this node`. So this layer does two things only, both of which React tolerates:
 *
 *   1. it sets ATTRIBUTES on an element React already rendered (`data-copy-key`,
 *      `contenteditable`, `data-copy-invalid`, and the `data-r10-*` equivalents). React 19 writes
 *      only the props it was given, so an attribute it never set is not diffed and not removed;
 *   2. it assigns `nodeValue` on a text node React already created, which mutates the node in
 *      place and leaves React's own reference to it valid.
 *
 * WHAT THAT COSTS, STATED RATHER THAN HIDDEN: a run that is only PART of its parent's text -
 * `FORMAT.stepOf` renders `Step 1 of 8: Units`, where only `Units` came from a key - cannot be
 * made editable without inserting an element. Such a run is marked `data-copy-key` and
 * `data-copy-editable="false"`, and the panel offers it as a plain text field instead. The same
 * applies to a string a `FORMAT` frame substituted a value into: the words on screen are no
 * longer the row in the table, and writing them back would delete the `{slot}` the domain fills.
 *
 * TAKE `textContent`, NEVER `innerHTML`. `contenteditable` produces markup the instant anything
 * is pasted, and a copy table holding markup is a defect that reaches `catalogue.json`, the walk
 * pages and the deployed app. Every read below is `textContent`; `innerHTML` appears nowhere in
 * this file, and src/design/pasteGuard.ts refuses a paste that carries markup rather than
 * stripping it silently.
 *
 * A KNOWN LIMITATION, in design mode only: a marked string handed to an ATTRIBUTE rather than to
 * a text node (`aria-label`, `title`, `placeholder`) keeps its markers, because there is no text
 * node to decorate. The characters are Default_Ignorable_Code_Point so nothing draws them, but a
 * string compared for equality against a table value would not match while `?design=1` is on.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { SkinId } from '../domain/types';
import { findCopyMarks, hasCopyMarker, stripCopyMarkers } from './copyMarkers';
import { blockedReason, renderedRow, validateCopyEdit } from './copyEdits';
import type { CopyEdits } from './copyEdits';
import { r10Blocked, validateR10Edit } from './r10Edits';
import type { NoteIntent, R10Edits } from './r10Edits';
import { r10Field, r10FieldForValue } from '../content/r10Text';
import { judgePaste, normaliseEditedText } from './pasteGuard';
import type { CopyViolation } from '../content/copyContract';

/** Panel chrome is not app text, so it is never decorated. */
const PANEL_SELECTORS = '.dm-panel, .dm-copy-bubble, .dm-launcher';

/** The editable host, if the event happened inside one. Either kind. */
const EDITABLE = '[data-copy-editable="true"], [data-r10-editable="true"]';

/** Anything this layer has attributed, editable or not. A locked node is still tappable. */
const ATTRIBUTED = '[data-copy-key], [data-r10-field]';

/**
 * Elements whose own click means something to the user.
 *
 * A click inside a decorated node is STOPPED before it reaches the app, because the intro is a
 * `<section onClick={advance}>` and tapping a sentence to place the caret would otherwise turn
 * the slide over. It is NOT stopped inside one of these: `button.introContinue` renders inside a
 * real `<button>`, and a design mode that made the app's buttons stop working would be a tool
 * nobody could use to reach the second screen.
 */
const INTERACTIVE = 'button, a, summary, label, input, select, textarea, [role="button"]';

/** Never decorated: their text is not prose a reader sees. */
const NEVER_DECORATE = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'TITLE', 'OPTION']);

/**
 * The `inputType` values an editable node accepts.
 *
 * A whitelist rather than a blacklist: a new formatting command added to a browser next year is
 * refused by default instead of silently producing a `<b>` in a copy string. `insertFromPaste`
 * and `insertFromDrop` are absent on purpose - the paste handler has already refused or
 * substituted them, and a drop is the same problem with no interception point of its own.
 */
const ALLOWED_INPUT_TYPES: ReadonlySet<string> = new Set([
  'insertText',
  'insertReplacementText',
  'insertCompositionText',
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
  'deleteByCut',
  'deleteContent',
  'historyUndo',
  'historyRedo',
]);

export interface CopyEditLayerProps {
  /** The skin whose WORDS are on screen: the app's saved `ui.skin`, never the token preview. */
  readonly skin: SkinId;
  readonly edits: CopyEdits;
  /** R10 long-form edits, `module:path` to the retyped string. Not per skin: see r10Edits.ts. */
  readonly r10Edits: R10Edits;
  /** A committed copy string. The panel decides whether it is a change or a revert. */
  readonly onCommit: (key: string, value: string) => void;
  /** A committed R10 string. */
  readonly onR10Commit: (id: string, value: string) => void;
  /** A structural intent or free note against one element. */
  readonly onNote: (target: string, intent: NoteIntent) => void;
  /** Every copy key found on the current screen, so the panel can list what it cannot decorate. */
  readonly onDiscovered: (keys: readonly string[]) => void;
  /** Every R10 field found on the current screen. */
  readonly onR10Discovered: (ids: readonly string[]) => void;
}

/** What the bubble is currently saying about one node. */
interface FocusState {
  /** `copy.ts` and its skin tables, or one of the long-form modules. */
  readonly kind: 'copy' | 'r10';
  /** A `CopyKey`, or an R10 `module:path`. */
  readonly target: string;
  readonly value: string;
  readonly violations: readonly CopyViolation[];
  readonly editable: boolean;
  /** Why this text cannot be edited, or null. Shown in place of the contract readout. */
  readonly lock: string | null;
  readonly top: number;
  readonly left: number;
  readonly above: boolean;
}

/** The bubble's own width, so it can be clamped inside the viewport before it is drawn. */
const BUBBLE_WIDTH = 300;

function hostOf(target: EventTarget | null): HTMLElement | null {
  const node = target instanceof Node ? target : null;
  if (node === null) return null;
  const element = node instanceof HTMLElement ? node : node.parentElement;
  return element === null ? null : element.closest<HTMLElement>(EDITABLE);
}

/** Any decorated host, editable or locked. A locked one still opens the bubble that explains it. */
function attributedHost(target: EventTarget | null): HTMLElement | null {
  const node = target instanceof Node ? target : null;
  if (node === null) return null;
  const element = node instanceof HTMLElement ? node : node.parentElement;
  return element === null ? null : element.closest<HTMLElement>(ATTRIBUTED);
}

/** Where the bubble sits relative to `host`, clamped so it is reachable on a phone. */
function placeBubble(host: HTMLElement): { top: number; left: number; above: boolean } {
  const rect = host.getBoundingClientRect();
  const viewportWidth = window.innerWidth || 360;
  const viewportHeight = window.innerHeight || 640;
  const above = rect.bottom > viewportHeight * 0.45;
  return {
    top: above ? Math.max(8, rect.top - 8) : rect.bottom + 8,
    left: Math.max(8, Math.min(rect.left, viewportWidth - BUBBLE_WIDTH - 8)),
    above,
  };
}

/** What one decoration pass saw, so the panel can list the rows the page could not decorate. */
interface Discovered {
  readonly copyKeys: readonly string[];
  readonly r10Ids: readonly string[];
}

/**
 * Decorates every marked run and every recognised R10 paragraph under `document.body`.
 *
 * Mutates only attributes and `nodeValue`, for the reason the file header gives.
 */
function decorate(skin: SkinId, edits: CopyEdits, r10: R10Edits): Discovered {
  const seen = new Set<string>();
  const seenR10 = new Set<string>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const marked: Text[] = [];
  const plain: Text[] = [];
  let node = walker.nextNode();
  while (node !== null) {
    const text = node as Text;
    if (hasCopyMarker(text.data)) marked.push(text);
    else if (text.data.trim().length > 1) plain.push(text);
    node = walker.nextNode();
  }

  for (const text of marked) {
    const parent = text.parentElement;
    if (parent === null) continue;
    if (parent.closest(PANEL_SELECTORS) !== null) continue;

    const marks = findCopyMarks(text.data);
    if (marks.length === 0) continue;
    for (const mark of marks) seen.add(mark.key);

    // The markers come out FIRST, in place, so the node React holds keeps its identity.
    const clean = stripCopyMarkers(text.data);
    if (text.data !== clean) text.data = clean;

    if (marks.length !== 1) {
      // Several keys in one text node. Attributing a typed change to one of them is guesswork.
      parent.setAttribute('data-copy-editable', 'false');
      continue;
    }
    const mark = marks[0];
    if (mark === undefined) continue;
    const { key, value } = mark;

    parent.setAttribute('data-copy-key', key);

    /*
     * EDITABLE ONLY WHEN THIS ELEMENT'S WHOLE TEXT IS THIS KEY'S WHOLE ROW.
     *
     *  - a partial run means an inserted element would be needed, which this layer will not do;
     *  - a value that differs from the table's row means a FORMAT frame substituted a number
     *    into a `{slot}`, and committing the rendered words would delete the slot.
     */
    const wholeElement = stripCopyMarkers(parent.textContent ?? '') === value;
    const rendered = renderedRow(skin, key);
    const composed = rendered === undefined || rendered !== value;
    const blocked = blockedReason(skin, key);
    const editable = wholeElement && !composed && blocked === null;

    if (editable) {
      parent.setAttribute('data-copy-editable', 'true');
      parent.setAttribute('contenteditable', 'plaintext-only');
      parent.setAttribute('spellcheck', 'false');
    } else {
      parent.setAttribute('data-copy-editable', 'false');
      parent.removeAttribute('contenteditable');
    }

    if (editable) syncEdited(parent, skin, key, edits);
  }

  /*
   * THE R10 PASS. These strings carry no marker: they never go through `copy()`, and four of the
   * eleven modules render ONLY from a file this work is not allowed to touch. They are recognised
   * by their VALUE instead, from an index that DROPS any string two fields share, so a collision
   * makes a paragraph un-editable rather than misrouting an edit. src/content/r10Text.ts states
   * that decision against copyMarkers.ts's own rejection of value matching for copy keys.
   */
  for (const text of plain) {
    const parent = text.parentElement;
    if (parent === null) continue;
    if (NEVER_DECORATE.has(parent.tagName)) continue;
    if (parent.closest(PANEL_SELECTORS) !== null) continue;
    if (parent.hasAttribute('data-copy-key') || parent.hasAttribute('data-r10-field')) continue;
    /*
     * THE TEXT MUST BE THE ELEMENT'S ONLY CHILD, and this is a correctness rule rather than an
     * optimisation. The intro's acknowledgement renders as `<label><input type=checkbox />TEXT
     * </label>`, whose `textContent` is exactly the stored string. Decorating it would put
     * `contenteditable` on a label that owns a form control, and the focusout repair below
     * assigns `textContent` when it does not find a single text child - which would delete the
     * checkbox. One child, or nothing.
     */
    if (parent.childNodes.length !== 1) continue;

    const field = r10FieldForValue(parent.textContent ?? '');
    if (field === undefined) continue;
    seenR10.add(field.id);

    parent.setAttribute('data-r10-field', field.id);
    const blocked = r10Blocked(field.id);
    if (blocked === null) {
      parent.setAttribute('data-r10-editable', 'true');
      parent.setAttribute('contenteditable', 'plaintext-only');
      parent.setAttribute('spellcheck', 'false');
      syncR10(parent, field.id, r10);
    } else {
      parent.setAttribute('data-r10-editable', 'false');
      parent.removeAttribute('contenteditable');
    }
  }

  /*
   * THE SECOND PASS EXISTS BECAUSE THE FIRST ONE CONSUMES ITS OWN INPUT. Stripping the markers
   * from a text node means the walk above will not find that node again, and an R10 paragraph
   * that has already been retyped no longer matches the value index. So an edit made after the
   * words were decorated - typed into the panel's field rather than into the page - would never
   * reach the screen, and an Undo would never put the shipped words back. The attributes survive
   * where the markers and the matches do not, so they are what the page is re-synchronised from.
   */
  for (const element of document.querySelectorAll<HTMLElement>('[data-copy-key]')) {
    const key = element.getAttribute('data-copy-key');
    if (key === null) continue;
    seen.add(key);
    if (element.getAttribute('data-copy-editable') === 'true') syncEdited(element, skin, key, edits);
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-r10-field]')) {
    const id = element.getAttribute('data-r10-field');
    if (id === null) continue;
    seenR10.add(id);
    if (element.getAttribute('data-r10-editable') === 'true') syncR10(element, id, r10);
  }

  return { copyKeys: [...seen].sort(), r10Ids: [...seenR10].sort() };
}

/**
 * Puts the current value on one editable element and re-runs the contract over it.
 *
 * Never while the owner is typing into that very element: overwriting the node under the caret
 * would move it, and the commit is what decides the value anyway.
 */
function syncEdited(element: HTMLElement, skin: SkinId, key: string, edits: CopyEdits): void {
  const edited = edits[skin]?.[key];
  const shown = edited ?? renderedRow(skin, key) ?? element.textContent ?? '';
  writeIfIdle(element, shown);
  const failing = validateCopyEdit(skin, key, shown).filter(
    (violation) => violation.severity === 'error',
  );
  if (failing.length > 0) {
    element.setAttribute('data-copy-invalid', failing.map((v) => v.rule).join(' '));
  } else {
    element.removeAttribute('data-copy-invalid');
  }
}

/** The same, for one R10 field. Separate because the rules and the lookup differ, not the shape. */
function syncR10(element: HTMLElement, id: string, edits: R10Edits): void {
  const shown = edits[id] ?? r10Field(id)?.value ?? element.textContent ?? '';
  writeIfIdle(element, shown);
  const failing = validateR10Edit(id, shown).filter((violation) => violation.severity === 'error');
  if (failing.length > 0) {
    element.setAttribute('data-r10-invalid', failing.map((v) => v.rule).join(' '));
  } else {
    element.removeAttribute('data-r10-invalid');
  }
}

/** Assigns `shown` to the element's single text child, unless the caret is in it. */
function writeIfIdle(element: HTMLElement, shown: string): void {
  if (document.activeElement === element) return;
  const only = element.childNodes.length === 1 ? element.firstChild : null;
  if (only !== null && only.nodeType === Node.TEXT_NODE && only.nodeValue !== shown) {
    only.nodeValue = shown;
  }
}

export function CopyEditLayer({
  skin,
  edits,
  r10Edits,
  onCommit,
  onR10Commit,
  onNote,
  onDiscovered,
  onR10Discovered,
}: CopyEditLayerProps): ReactElement | null {
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const skinRef = useRef<SkinId>(skin);
  const editsRef = useRef<CopyEdits>(edits);
  const r10Ref = useRef<R10Edits>(r10Edits);
  const applyingRef = useRef(false);
  const lastDiscoveredRef = useRef<string>('');
  const lastR10Ref = useRef<string>('');

  skinRef.current = skin;
  editsRef.current = edits;
  r10Ref.current = r10Edits;

  const publishDiscovered = useCallback(
    (found: Discovered) => {
      const copySignature = found.copyKeys.join('\n');
      if (copySignature !== lastDiscoveredRef.current) {
        lastDiscoveredRef.current = copySignature;
        onDiscovered(found.copyKeys);
      }
      const r10Signature = found.r10Ids.join('\n');
      if (r10Signature !== lastR10Ref.current) {
        lastR10Ref.current = r10Signature;
        onR10Discovered(found.r10Ids);
      }
    },
    [onDiscovered, onR10Discovered],
  );

  /* The decoration pass, plus the observer that repeats it after every React commit. */
  useEffect(() => {
    const run = (): void => {
      if (applyingRef.current) return;
      applyingRef.current = true;
      let found: Discovered;
      try {
        found = decorate(skinRef.current, editsRef.current, r10Ref.current);
      } finally {
        // Our own attribute and text writes queued records. Discard them, or the next callback
        // decorates again for no reason and the two chase each other for as long as the panel
        // is open.
        observer.takeRecords();
        applyingRef.current = false;
      }
      publishDiscovered(found);
    };
    const observer = new MutationObserver(run);
    run();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
    };
  }, [skin, edits, r10Edits, publishDiscovered]);

  /* Everything the owner does to a decorated node. Delegated, so no per-node listener exists. */
  useEffect(() => {
    const refreshBubble = (host: HTMLElement): void => {
      const copyKey = host.getAttribute('data-copy-key');
      // textContent, NEVER innerHTML. See the file header.
      const value = normaliseEditedText(host.textContent ?? '');
      if (copyKey !== null) {
        setFocus({
          kind: 'copy',
          target: copyKey,
          value,
          violations: validateCopyEdit(skinRef.current, copyKey, value),
          editable: true,
          lock: null,
          ...placeBubble(host),
        });
        return;
      }
      const id = host.getAttribute('data-r10-field');
      if (id === null) return;
      setFocus({
        kind: 'r10',
        target: id,
        value,
        violations: validateR10Edit(id, value),
        editable: true,
        lock: null,
        ...placeBubble(host),
      });
    };

    const onFocusIn = (event: FocusEvent): void => {
      const host = hostOf(event.target);
      if (host === null) {
        setFocus(null);
        return;
      }
      setRefusal(null);
      refreshBubble(host);
    };

    const onInput = (event: Event): void => {
      const host = hostOf(event.target);
      if (host !== null) refreshBubble(host);
    };

    const onFocusOut = (event: FocusEvent): void => {
      const host = hostOf(event.target);
      if (host === null) return;
      const value = normaliseEditedText(host.textContent ?? '');
      /*
       * A repair, not a rewrite. `plaintext-only` and the `beforeinput` whitelist should leave a
       * single text child, but a composition or an undo can leave two. Collapsing them here keeps
       * the next decoration pass reading one node, and the assignment is the normalised text this
       * layer just committed rather than anything read out of the DOM as markup.
       */
      const only = host.childNodes.length === 1 ? host.firstChild : null;
      if (only !== null && only.nodeType === Node.TEXT_NODE) {
        if (only.nodeValue !== value) only.nodeValue = value;
      } else {
        host.textContent = value;
      }
      setFocus(null);
      const copyKey = host.getAttribute('data-copy-key');
      if (copyKey !== null) {
        onCommit(copyKey, value);
        return;
      }
      const id = host.getAttribute('data-r10-field');
      if (id !== null) onR10Commit(id, value);
    };

    /*
     * KEYS ARE STOPPED AT `document` BEFORE THE APP SEES THEM, and this is not tidiness.
     * `src/ui/intro/IntroSequence.tsx` listens for keydown on `window` and turns the slide over on
     * ANY key. Without this, typing a single character into a slide advances it, which makes the
     * intro - the one screen this widening exists for - the one screen that cannot be edited. The
     * default action is untouched, so the character is still inserted.
     */
    const onKeyDown = (event: KeyboardEvent): void => {
      const host = hostOf(event.target);
      if (host === null) return;
      event.stopPropagation();
      if (event.key === 'Enter') {
        // One line. Enter commits rather than opening a second one.
        event.preventDefault();
        host.blur();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setFocus(null);
        host.blur();
      }
    };

    /*
     * A CLICK ON DECORATED TEXT DOES NOT REACH THE APP, for the same reason and with one carve-out
     * that matters. The intro is a `<section onClick={advance}>`, so tapping a sentence to place
     * the caret would turn the page. But `button.introContinue` renders INSIDE a real `<button>`,
     * and a design mode whose buttons do not work cannot reach the second screen at all. So the
     * stop applies only outside an interactive element.
     */
    const onClickCapture = (event: MouseEvent): void => {
      const host = attributedHost(event.target);
      if (host === null) {
        setFocus((current) => (current !== null && current.lock !== null ? null : current));
        return;
      }
      /*
       * ONLY A NODE THE TAP IS ACTUALLY FOR. A `data-copy-editable="false"` run - a FORMAT frame,
       * a partial string - takes no caret and opens no bubble, so swallowing its click would cost
       * the app a click for nothing. The stop is for a node that will take an edit, and for a
       * locked long-form paragraph, which needs the tap in order to say why it is locked.
       */
      const wanted =
        host.matches(EDITABLE) || host.getAttribute('data-r10-editable') === 'false';
      if (wanted && host.closest(INTERACTIVE) === null) event.stopPropagation();
      if (host.getAttribute('data-r10-editable') !== 'false') return;
      // A locked paragraph takes no focus, so the tap is the only way it can say why.
      const id = host.getAttribute('data-r10-field');
      if (id === null) return;
      const blocked = r10Blocked(id);
      setFocus({
        kind: 'r10',
        target: id,
        value: normaliseEditedText(host.textContent ?? ''),
        violations: [],
        editable: false,
        lock: blocked === null ? 'This text is not editable here.' : blocked.message,
        ...placeBubble(host),
      });
    };

    const onBeforeInput = (event: InputEvent): void => {
      const host = hostOf(event.target);
      if (host === null) return;
      if (ALLOWED_INPUT_TYPES.has(event.inputType)) return;
      event.preventDefault();
      if (event.inputType === 'insertFromDrop') {
        setRefusal(
          'Drop refused: a dropped fragment carries markup. Type the words, or paste from a plain text field.',
        );
        return;
      }
      if (event.inputType.startsWith('format')) {
        setRefusal(
          `Refused: ${event.inputType}. This text is plain, so the formatting would not survive.`,
        );
        return;
      }
      if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
        setRefusal('Refused: one line. Use the panel to add a second.');
      }
    };

    const onPaste = (event: ClipboardEvent): void => {
      const host = hostOf(event.target);
      if (host === null) return;
      // Always. Nothing the browser would have inserted is ever allowed to reach the node.
      event.preventDefault();
      const data = event.clipboardData;
      const verdict = judgePaste(data?.getData('text/html') ?? '', data?.getData('text/plain') ?? '');
      if (!verdict.accepted) {
        setRefusal(verdict.message);
        return;
      }
      setRefusal(null);
      let inserted: boolean;
      try {
        inserted = document.execCommand('insertText', false, verdict.text);
      } catch {
        // jsdom has no execCommand, and a browser may refuse it. The range path below is the
        // fallback rather than a silent loss of the paste.
        inserted = false;
      }
      if (!inserted) {
        const selection = window.getSelection();
        if (selection !== null && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(verdict.text));
          range.collapse(false);
        } else {
          host.textContent = `${host.textContent ?? ''}${verdict.text}`;
        }
      }
      refreshBubble(host);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('beforeinput', onBeforeInput as EventListener, true);
    document.addEventListener('paste', onPaste as EventListener, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('input', onInput);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('beforeinput', onBeforeInput as EventListener, true);
      document.removeEventListener('paste', onPaste as EventListener, true);
    };
  }, [onCommit, onR10Commit]);

  /* Every attribute this layer wrote comes off when the panel closes. */
  useEffect(
    () => () => {
      for (const element of document.querySelectorAll<HTMLElement>(ATTRIBUTED)) {
        element.removeAttribute('data-copy-key');
        element.removeAttribute('data-copy-editable');
        element.removeAttribute('data-copy-invalid');
        element.removeAttribute('data-r10-field');
        element.removeAttribute('data-r10-editable');
        element.removeAttribute('data-r10-invalid');
        element.removeAttribute('contenteditable');
      }
    },
    [],
  );

  if (focus === null && refusal === null) return null;

  /*
   * THE NOTE BUTTONS TAKE `pointerdown` AND PREVENT ITS DEFAULT, so focus never leaves the text
   * being annotated. A plain click would blur the node first, `focusout` would tear the bubble
   * down, and the button would be gone before the finger landed on it.
   */
  const noteButton = (intent: NoteIntent, label: string, target: string): ReactElement => (
    <button
      type="button"
      className="dm-note-intent"
      data-testid={`dm-note-${intent}`}
      onPointerDown={(event) => {
        event.preventDefault();
        onNote(target, intent);
      }}
      onClick={(event) => {
        event.preventDefault();
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="dm-copy-bubble"
      data-testid="dm-copy-bubble"
      role="status"
      style={
        focus === null
          ? { bottom: '84px', left: '8px', width: `${BUBBLE_WIDTH}px` }
          : focus.above
            ? { top: `${focus.top}px`, left: `${focus.left}px`, width: `${BUBBLE_WIDTH}px`, transform: 'translateY(-100%)' }
            : { top: `${focus.top}px`, left: `${focus.left}px`, width: `${BUBBLE_WIDTH}px` }
      }
    >
      {focus === null ? null : (
        <>
          <span className="dm-copy-bubble-key" data-testid="dm-copy-bubble-key">
            {focus.target}
          </span>
          {focus.lock !== null ? (
            <span className="dm-copy-violation" data-severity="error" data-testid="dm-r10-lock">
              {focus.lock}
            </span>
          ) : focus.violations.length === 0 ? (
            <span className="dm-copy-ok" data-testid="dm-copy-ok">
              Contract: PASS
            </span>
          ) : (
            focus.violations.map((violation) => (
              <span
                key={`${violation.rule}${violation.message}`}
                className="dm-copy-violation"
                data-severity={violation.severity}
                data-testid={`dm-copy-violation-${violation.rule}`}
              >
                {violation.message}
              </span>
            ))
          )}
          <span className="dm-note-row" data-testid="dm-note-row">
            {noteButton('heading', 'Make Heading', focus.target)}
            {noteButton('bullet', 'Make Bullet', focus.target)}
            {noteButton('delete', 'Delete', focus.target)}
          </span>
          <span className="dm-note">
            These three do not change the file. They export as an instruction beside the edits, and
            the panel can take any of them back. src/design/r10Edits.ts says why.
          </span>
        </>
      )}
      {refusal === null ? null : (
        <span className="dm-copy-refusal" data-testid="dm-copy-refusal">
          {refusal}
        </span>
      )}
    </div>
  );
}
