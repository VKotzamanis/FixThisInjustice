/**
 * DESIGN MODE, IN-PLACE COPY EDITING.
 *
 * Task 2 of docs/plans/2026-09-10-16-design-mode.md. `copy()` marks its return value with the key
 * that produced it (src/design/copyMarkers.ts records why the marker is invisible tag characters
 * rather than a readable sentinel). This layer turns each marked run into a `data-copy-key`
 * element, makes the ones it can attribute exactly `contenteditable`, runs the copy contract as
 * the owner types, and hands every committed string back to the panel.
 *
 * <!-- decision: decorate-the-existing-element-never-insert-one | status: adopted | supersedes: none -->
 *
 * IT NEVER INSERTS OR REMOVES A NODE REACT OWNS. The obvious build wraps each marked run in a
 * fresh `<span>`. That is how a decorator breaks React: the next reconciliation of that subtree
 * finds a child it did not create, and removal throws `NotFoundError: The node to be removed is
 * not a child of this node`. So this layer does two things only, both of which React tolerates:
 *
 *   1. it sets ATTRIBUTES on an element React already rendered (`data-copy-key`,
 *      `contenteditable`, `data-copy-invalid`). React 19 writes only the props it was given, so
 *      an attribute it never set is not diffed and not removed;
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
 * ONLY `copy.ts` AND THE TWO SKIN TABLES ARE IN SCOPE. The R10 modules - `bodyEquations.ts`,
 * `guidanceReferences.ts`, `sexRationale.ts`, `supplementGuidance.ts`, `reviewDataNotes.ts` and
 * the rest - carry citations, DOIs and doses. They do not pass through `copy()`, so they are
 * never marked and never editable. Do not "fix" that.
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
import { judgePaste, normaliseEditedText } from './pasteGuard';
import type { CopyViolation } from '../content/copyContract';

/** Panel chrome is not app copy, so it is never decorated. */
const PANEL_SELECTORS = '.dm-panel, .dm-copy-bubble, .dm-launcher';

/** The editable host, if the event happened inside one. */
const EDITABLE = '[data-copy-editable="true"]';

/**
 * The `inputType` values an editable copy node accepts.
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
  /** A committed string. The panel decides whether it is a change or a revert. */
  readonly onCommit: (key: string, value: string) => void;
  /** Every key found on the current screen, so the panel can list the ones it cannot decorate. */
  readonly onDiscovered: (keys: readonly string[]) => void;
}

/** What the bubble is currently saying about one node. */
interface FocusState {
  readonly key: string;
  readonly value: string;
  readonly violations: readonly CopyViolation[];
  readonly editable: boolean;
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

/**
 * Decorates every marked run under `root`.
 *
 * Returns the keys it saw, so the panel can offer the ones it could not make editable. Mutates
 * only attributes and `nodeValue`, for the reason the file header gives.
 */
function decorate(skin: SkinId, edits: CopyEdits): readonly string[] {
  const seen = new Set<string>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const marked: Text[] = [];
  let node = walker.nextNode();
  while (node !== null) {
    const text = node as Text;
    if (hasCopyMarker(text.data)) marked.push(text);
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
   * THE SECOND PASS EXISTS BECAUSE THE FIRST ONE CONSUMES ITS OWN INPUT. Stripping the markers
   * from a text node means the walk above will not find that node again, so an edit made after
   * the words were decorated - typed into the panel's field rather than into the page - would
   * never reach the screen, and an Undo would never put the shipped words back. The attributes
   * survive where the markers do not, so they are what the page is re-synchronised from.
   */
  for (const element of document.querySelectorAll<HTMLElement>('[data-copy-key]')) {
    const key = element.getAttribute('data-copy-key');
    if (key === null) continue;
    seen.add(key);
    if (element.getAttribute('data-copy-editable') === 'true') syncEdited(element, skin, key, edits);
  }

  return [...seen].sort();
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
  if (document.activeElement !== element) {
    const only = element.childNodes.length === 1 ? element.firstChild : null;
    if (only !== null && only.nodeType === Node.TEXT_NODE && only.nodeValue !== shown) {
      only.nodeValue = shown;
    }
  }
  const failing = validateCopyEdit(skin, key, shown).filter(
    (violation) => violation.severity === 'error',
  );
  if (failing.length > 0) {
    element.setAttribute('data-copy-invalid', failing.map((v) => v.rule).join(' '));
  } else {
    element.removeAttribute('data-copy-invalid');
  }
}

export function CopyEditLayer({
  skin,
  edits,
  onCommit,
  onDiscovered,
}: CopyEditLayerProps): ReactElement | null {
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const skinRef = useRef<SkinId>(skin);
  const editsRef = useRef<CopyEdits>(edits);
  const applyingRef = useRef(false);
  const lastDiscoveredRef = useRef<string>('');

  skinRef.current = skin;
  editsRef.current = edits;

  const publishDiscovered = useCallback(
    (keys: readonly string[]) => {
      const signature = keys.join('\n');
      if (signature === lastDiscoveredRef.current) return;
      lastDiscoveredRef.current = signature;
      onDiscovered(keys);
    },
    [onDiscovered],
  );

  /* The decoration pass, plus the observer that repeats it after every React commit. */
  useEffect(() => {
    const run = (): void => {
      if (applyingRef.current) return;
      applyingRef.current = true;
      let keys: readonly string[];
      try {
        keys = decorate(skinRef.current, editsRef.current);
      } finally {
        // Our own attribute and text writes queued records. Discard them, or the next callback
        // decorates again for no reason and the two chase each other for as long as the panel
        // is open.
        observer.takeRecords();
        applyingRef.current = false;
      }
      publishDiscovered(keys);
    };
    const observer = new MutationObserver(run);
    run();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
    };
  }, [skin, edits, publishDiscovered]);

  /* Everything the owner does to an editable node. Delegated, so no per-node listener exists. */
  useEffect(() => {
    const refreshBubble = (host: HTMLElement): void => {
      const key = host.getAttribute('data-copy-key');
      if (key === null) return;
      // textContent, NEVER innerHTML. See the file header.
      const value = normaliseEditedText(host.textContent ?? '');
      setFocus({
        key,
        value,
        violations: validateCopyEdit(skinRef.current, key, value),
        editable: true,
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
      const key = host.getAttribute('data-copy-key');
      if (key === null) return;
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
      onCommit(key, value);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      const host = hostOf(event.target);
      if (host === null) return;
      if (event.key === 'Enter') {
        // A copy string is one line. Enter commits rather than opening a second one.
        event.preventDefault();
        host.blur();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setFocus(null);
        host.blur();
      }
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
          `Refused: ${event.inputType}. A copy string is plain text, so the formatting would not survive.`,
        );
        return;
      }
      if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
        setRefusal('Refused: a copy string is one line.');
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
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('beforeinput', onBeforeInput as EventListener, true);
    document.addEventListener('paste', onPaste as EventListener, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('input', onInput);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('beforeinput', onBeforeInput as EventListener, true);
      document.removeEventListener('paste', onPaste as EventListener, true);
    };
  }, [onCommit]);

  /* Every attribute this layer wrote comes off when the panel closes. */
  useEffect(
    () => () => {
      for (const element of document.querySelectorAll<HTMLElement>('[data-copy-key]')) {
        element.removeAttribute('data-copy-key');
        element.removeAttribute('data-copy-editable');
        element.removeAttribute('data-copy-invalid');
        element.removeAttribute('contenteditable');
      }
    },
    [],
  );

  if (focus === null && refusal === null) return null;

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
            {focus.key}
          </span>
          {focus.violations.length === 0 ? (
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
