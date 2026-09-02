/**
 * Push payload parsing and notification click targets, shared by the service
 * worker and its tests.
 *
 * No imports: `src/sw.ts` reaches these functions through `swHandlers.ts`, and
 * nothing else follows them into the worker bundle.
 *
 * Why the decisions live here and not in `sw.ts`: a service worker cannot be
 * instantiated under jsdom (no `ServiceWorkerGlobalScope`, no `PushEvent`, no
 * `registration.showNotification`), so `sw.ts` is left with two event
 * registrations that forward to `swHandlers.ts`, and every judgement either of
 * them makes is a pure function tested in `payload.test.ts` or
 * `swHandlers.test.ts`.
 */

/**
 * GitHub Pages project path. Mirrors `base` in vite.config.ts and `scope` in
 * the generated manifest; `sw.ts` uses `import.meta.env.BASE_URL` for asset
 * URLs, and the two must stay equal. Also the fallback click target.
 */
export const APP_SCOPE_PATH = '/FixThisInjustice/';

/**
 * Shown when the payload carries no usable title. Constant, never computed:
 * iOS Safari revokes the push subscription when a delivered push shows no
 * notification, so `parsePushPayload` is total and the worker always has a
 * title to show, however malformed the payload was.
 */
export const FALLBACK_TITLE = 'Training reminder';

/** Tag used when neither the payload nor the title can supply one. */
export const FALLBACK_TAG = 'fti-reminder';

/*
 * Length bounds, in UTF-16 code units (String.length), not code points: the
 * platform measures notification text the same way. A field over its bound is
 * replaced by its fallback rather than truncated, because a truncated title is
 * a claim the Worker did not make, and mid-surrogate or mid-sentence cuts read
 * as corruption.
 *
 * The numbers are the Worker's, not a display budget of this module's own:
 * worker/src/schedule.ts accepts a title of 100 and a body of 300, and rejects
 * the whole upload otherwise. A tighter bound here does not shorten anything,
 * it discards a payload the Worker already accepted, replacing a real title
 * with the generic fallback and a real body with nothing. A title elided past
 * one line by the platform is the lesser failure. payload.test.ts asserts these
 * three numbers against the Worker's source text so the pair cannot drift.
 */
export const MAX_TITLE_LENGTH = 100;
export const MAX_BODY_LENGTH = 300;
/**
 * Pinned to the Worker's MAX_KEY_LENGTH, because worker/src/push.ts sends
 * `tag: instant.key`: a key at the Worker's limit must survive as a tag, or two
 * distinct reminders collapse into one notification.
 */
export const MAX_TAG_LENGTH = 120;
/** Generous for `/FixThisInjustice/<view>`; anything longer is not ours. */
export const MAX_URL_LENGTH = 512;

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
}

/** A plain object, so `parsePushPayload` can read fields off it. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A string of the right type, non-blank, and within its bound, else `fallback`.
 * Blankness is judged on the trimmed value but the original is returned: the
 * payload's text is displayed as the Worker wrote it, never edited.
 */
function boundedString(value: unknown, maxLength: number, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  if (value.trim().length === 0) return fallback;
  if (value.length > maxLength) return fallback;
  return value;
}

/**
 * An in-scope, same-origin path, or null.
 *
 * Absolute URLs are rejected wholesale rather than compared against an origin,
 * because this function has no origin to compare with; that check belongs to
 * `notificationClickTarget`, which does. So the rule here is purely textual:
 * the string must start with the app scope path. That single test rejects
 * `javascript:`, `data:`, `https://host/`, the protocol-relative `//host/`, and
 * every same-origin path outside the app (this app shares github.io with every
 * other project site of the same account).
 *
 * Backslashes are rejected anywhere in the string: the URL parser treats `\`
 * as `/` for special schemes, so `/\attacker.example/` resolves to a
 * cross-origin host despite starting with a slash. No legitimate route here
 * contains one.
 */
function safePath(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null;
  if (candidate.length > MAX_URL_LENGTH) return null;
  if (!candidate.startsWith(APP_SCOPE_PATH)) return null;
  if (candidate.includes('\\')) return null;
  return candidate;
}

/**
 * Narrow a decrypted push payload into something showable.
 *
 * Total for any JSON-derived value: every push event must produce a visible
 * notification or iOS Safari drops the subscription, so there is no failure
 * return. Each field falls back independently, so one bad field does not
 * discard the rest.
 *
 * The qualifier is load-bearing. The spread below invokes any getter it copies,
 * so a hand-built object with a throwing accessor would make this function
 * throw. JSON.parse cannot produce one (JSON carries no accessors), and the
 * only caller feeds it `PushMessageData.json()`, so the guarantee holds
 * everywhere it is relied on.
 *
 * Postconditions: `title` is non-blank and at most MAX_TITLE_LENGTH; `tag` is
 * non-blank and at most MAX_TAG_LENGTH; `url` starts with APP_SCOPE_PATH.
 */
export function parsePushPayload(raw: unknown): PushPayload {
  // Spread copies own enumerable properties with CreateDataProperty semantics,
  // so an own "__proto__" key from JSON.parse becomes an ordinary property and
  // nothing inherited from Object.prototype is mistaken for a payload field.
  const source: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
  const title = boundedString(source['title'], MAX_TITLE_LENGTH, FALLBACK_TITLE);
  // The tag is the ReminderInstant key, so a re-sent reminder replaces the
  // previous notification instead of stacking. Falling back to the title keeps
  // that collapsing behaviour for a tagless payload, but only while the title
  // itself fits the tag bound. With both bounds pinned to the Worker the title
  // bound sits inside the tag bound, so the guard never fires today; it stays
  // because it, and not the pair of numbers, is what makes the tag
  // postcondition above true.
  const tagFallback = title.length <= MAX_TAG_LENGTH ? title : FALLBACK_TAG;
  return {
    title,
    body: boundedString(source['body'], MAX_BODY_LENGTH, ''),
    tag: boundedString(source['tag'], MAX_TAG_LENGTH, tagFallback),
    url: safePath(source['url']) ?? APP_SCOPE_PATH,
  };
}

/** The path a notification click should open, read back from `Notification.data`. */
export function resolveClickUrl(data: unknown): string {
  if (!isRecord(data)) return APP_SCOPE_PATH;
  return safePath(data['url']) ?? APP_SCOPE_PATH;
}

/**
 * The absolute URL a notification click opens: same origin, inside the app
 * scope, always. `origin` is `self.location.origin` in the worker.
 *
 * The textual check in `safePath` is repeated here against the parsed URL, so
 * a string that slips past it still cannot send `clients.openWindow` to
 * another origin.
 */
export function notificationClickTarget(url: unknown, origin: string): string {
  let base: URL;
  try {
    base = new URL(APP_SCOPE_PATH, origin);
  } catch {
    // Unreachable from the worker: self.location.origin always parses. A
    // relative path is still a safe thing to hand back.
    return APP_SCOPE_PATH;
  }
  const path = safePath(url);
  if (path === null) return base.href;
  let target: URL;
  try {
    target = new URL(path, base);
  } catch {
    return base.href;
  }
  if (target.origin !== base.origin) return base.href;
  if (!target.pathname.startsWith(APP_SCOPE_PATH)) return base.href;
  return target.href;
}
