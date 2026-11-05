// src/store/db/errors.ts
//
// How a storage failure is classified, shared by the Web Storage and IndexedDB paths (rule 2).

/**
 * A quota failure must never be swallowed (finding H3 / A42). Browsers disagree on how they
 * report it, so check the standard name, the Firefox legacy name, and both legacy DOMException
 * codes. Structural rather than `instanceof DOMException`: a thrown value can come from another
 * realm, and the legacy Safari form is not a DOMException at all.
 */
export function isQuotaExceeded(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const name: unknown = Reflect.get(e, 'name');
  const code: unknown = Reflect.get(e, 'code');
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 || // DOMException.QUOTA_EXCEEDED_ERR
    code === 1014 // Firefox NS_ERROR_DOM_QUOTA_REACHED
  );
}

/** The thrown value's message, read structurally (jsdom's DOMException is not this realm's Error). */
export function messageOf(e: unknown): string {
  if (typeof e === 'object' && e !== null) {
    const message: unknown = Reflect.get(e, 'message');
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return String(e);
}
