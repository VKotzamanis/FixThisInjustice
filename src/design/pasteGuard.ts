/**
 * DESIGN MODE, THE PASTE GUARD.
 *
 * <!-- decision: a-paste-carrying-markup-is-refused-not-stripped | status: adopted | supersedes: none -->
 *
 * `contenteditable` produces markup the instant anything is pasted into it, and a copy table
 * holding markup is a defect that reaches `catalogue.json`, the walk pages and the deployed app.
 * So the editor takes `textContent` and NEVER `innerHTML`, and every paste is intercepted before
 * the browser can insert anything at all.
 *
 * WHY REFUSE RATHER THAN STRIP. Stripping silently is the more comfortable behaviour and it is
 * the wrong one: the owner would paste styled text, see the words arrive, and believe the bold
 * survived. He would find out at review, from a diff, days later. A refusal costs him one retype
 * and tells him the truth at the moment he can still act on it. The message names what was found.
 *
 * WHAT COUNTS AS MARKUP, and the line is drawn where it is because a browser adds a wrapper to
 * the `text/html` flavour of EVERY copy, including one taken from a plain text field. Refusing on
 * the mere presence of that flavour would refuse almost every paste, which is a guard nobody can
 * use. So the wrapper elements are ignored and anything else - a `<b>`, a `<span>`, a `<a>`, a
 * `<br>`, or a `style=` attribute on any element at all - is markup and is refused.
 *
 * A LINE BREAK IS ALSO REFUSED, from either flavour. A copy string is one line: `catalogue.json`
 * pins it, the tables hold single-quoted literals, and a newline inside a `contenteditable`
 * becomes a `<div>` or a `<br>` the moment the caret moves past it.
 *
 * These are pure functions over the two clipboard flavours so the rule can be tested without a
 * real clipboard, which jsdom does not have.
 */

/** Elements a browser adds around every copied fragment. Their presence is not formatting. */
const WRAPPER_ELEMENTS: ReadonlySet<string> = new Set([
  'html',
  'head',
  'body',
  'meta',
  'link',
  'base',
  'title',
  '!doctype',
  '?xml',
]);

/** Every element name the fragment opens, lower-cased, comments excluded. */
function elementNames(html: string): readonly string[] {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  return [...withoutComments.matchAll(/<\/?([a-zA-Z!?][a-zA-Z0-9-]*)/g)].map((match) =>
    (match[1] ?? '').toLowerCase(),
  );
}

/** The formatting this fragment carries, as names a person can read. Empty means none. */
export function markupFound(html: string): readonly string[] {
  if (html.trim() === '') return [];
  const found = new Set<string>();
  for (const name of elementNames(html)) {
    if (name === '' || WRAPPER_ELEMENTS.has(name)) continue;
    found.add(`<${name}>`);
  }
  // A style attribute survives a paste even when the element carrying it is a wrapper, and it is
  // what Google Docs and Word actually use: their fragments are spans and divs with inline colour,
  // family and size. Naming it separately makes the message say what was really there.
  if (/\sstyle\s*=\s*["']/i.test(html)) found.add('style=');
  return [...found].sort();
}

/** What the guard decided, and the sentence the panel shows when it refused. */
export type PasteVerdict =
  | { readonly accepted: true; readonly text: string }
  | { readonly accepted: false; readonly message: string };

/**
 * Whether this paste may be inserted, and what to insert if so.
 *
 * `html` is the `text/html` flavour and `text` the `text/plain` one; either may be empty. The
 * accepted text is always the PLAIN flavour: no path in this module ever reads `innerHTML` or
 * hands HTML to the DOM.
 */
export function judgePaste(html: string, text: string): PasteVerdict {
  const markup = markupFound(html);
  if (markup.length > 0) {
    return {
      accepted: false,
      message: `Paste refused: it carries markup (${markup.join(' ')}). A copy string is plain text, so the formatting would not survive. Retype it, or paste from a plain text field.`,
    };
  }
  if (/[\r\n]/.test(text)) {
    return {
      accepted: false,
      message:
        'Paste refused: it carries a line break. A copy string is one line, and a break inside an editable element becomes markup.',
    };
  }
  if (text === '') {
    return {
      accepted: false,
      message: 'Paste refused: the clipboard carries no plain text.',
    };
  }
  return { accepted: true, text };
}

/**
 * The text an editable node commits, cleaned of what `contenteditable` adds on its own.
 *
 * A no-break space is what a browser inserts when a trailing space would otherwise collapse; it
 * is not the character the owner typed and it is not the one the table should hold. Any stray
 * line break becomes a space rather than being refused here, because this runs on COMMIT and a
 * refusal at that point would discard the whole edit.
 */
export function normaliseEditedText(raw: string): string {
  return (
    raw
      // U+00A0 NO-BREAK SPACE, which contenteditable inserts by itself where a trailing space
      // would otherwise collapse. It is not the character anyone typed.
      .replace(/\u00a0/g, ' ')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim()
  );
}
