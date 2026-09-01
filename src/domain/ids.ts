/**
 * Stable identifier for a persisted record.
 *
 * Replaces the legacy composite string key `${week}-${day}-${exIdx}-${setN}`,
 * which encoded four facts in one string, was parsed by split("-") in six
 * places, and could not express a reordered or paused schedule (code review
 * C.4, A26).
 *
 * crypto.randomUUID requires a secure context. The deployed site is HTTPS
 * (GitHub Pages), local development is http://localhost (a secure context by
 * definition), and jsdom 30 implements it, so every environment this app runs
 * in provides it.
 */
export function newId(): string {
  return crypto.randomUUID();
}
