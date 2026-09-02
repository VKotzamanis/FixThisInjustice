import { describe, expect, it } from 'vitest';
import {
  APP_SCOPE_PATH,
  FALLBACK_TAG,
  FALLBACK_TITLE,
  MAX_BODY_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TITLE_LENGTH,
  notificationClickTarget,
  parsePushPayload,
  resolveClickUrl,
} from './payload';

/*
 * The service worker itself is not tested here and cannot be: jsdom has no
 * ServiceWorkerGlobalScope, no PushEvent, and no registration.showNotification,
 * so src/sw.ts cannot be imported into a vitest run at all. Every decision the
 * worker makes therefore lives in payload.ts and is tested here; sw.ts keeps
 * only the two event registrations, which the build gate (grep of dist/sw.js)
 * and the on-device smoke test in the runbook cover.
 */

/** Any origin works; the module never hard-codes the deployed host. */
const ORIGIN = 'https://example.github.io';
const BASE_HREF = `${ORIGIN}${APP_SCOPE_PATH}`;

/** Worker-shaped payload (master plan section 6.6: title, body, tag, url). */
const VALID = {
  title: 'Upper today',
  body: 'Upper A at 18:00, session 3 of 24',
  tag: '2026-10-26:lead:120',
  url: '/FixThisInjustice/',
};

describe('parsePushPayload', () => {
  it('passes the payload the Worker sends through unchanged', () => {
    expect(parsePushPayload(VALID)).toEqual(VALID);
  });

  it('keeps a relative path inside the app scope', () => {
    expect(parsePushPayload({ title: 't', url: '/FixThisInjustice/today' }).url).toBe(
      '/FixThisInjustice/today',
    );
  });

  it('always yields a title, because a push with no notification costs the subscription', () => {
    // iOS Safari revokes the subscription when a delivered push shows nothing,
    // so parsing is total: there is no input for which the worker stays silent.
    for (const raw of [null, undefined, 'string', 42, [], [{ title: 'x' }], {}]) {
      expect(parsePushPayload(raw).title).toBe(FALLBACK_TITLE);
    }
  });

  it('falls back per field when fields are missing', () => {
    expect(parsePushPayload({ title: 'Upper today' })).toEqual({
      title: 'Upper today',
      body: '',
      tag: 'Upper today',
      url: APP_SCOPE_PATH,
    });
  });

  it('falls back per field when fields have the wrong type', () => {
    expect(parsePushPayload({ title: 42, body: {}, tag: [], url: 7 })).toEqual({
      title: FALLBACK_TITLE,
      body: '',
      tag: FALLBACK_TITLE,
      url: APP_SCOPE_PATH,
    });
  });

  it('rejects an empty or whitespace-only title', () => {
    expect(parsePushPayload({ title: '' }).title).toBe(FALLBACK_TITLE);
    expect(parsePushPayload({ title: '   \n' }).title).toBe(FALLBACK_TITLE);
  });

  it('falls back rather than truncating an oversize field', () => {
    const longTitle = 'a'.repeat(MAX_TITLE_LENGTH + 1);
    const longBody = 'b'.repeat(MAX_BODY_LENGTH + 1);
    const longTag = 'c'.repeat(MAX_TAG_LENGTH + 1);
    expect(parsePushPayload({ title: longTitle }).title).toBe(FALLBACK_TITLE);
    expect(parsePushPayload({ title: 't', body: longBody }).body).toBe('');
    expect(parsePushPayload({ title: 't', tag: longTag }).tag).toBe('t');
    expect(parsePushPayload({ title: 't', url: `/FixThisInjustice/${'d'.repeat(600)}` }).url).toBe(
      APP_SCOPE_PATH,
    );
  });

  it('holds every bound it advertises, including a title too long to reuse as a tag', () => {
    const title = 'e'.repeat(MAX_TITLE_LENGTH); // 80 > MAX_TAG_LENGTH 64
    const parsed = parsePushPayload({ title });
    expect(parsed.title).toBe(title);
    expect(parsed.tag).toBe(FALLBACK_TAG);
    expect(parsed.tag.length).toBeLessThanOrEqual(MAX_TAG_LENGTH);
  });

  it('replaces a cross-origin url with the app base', () => {
    for (const url of [
      'https://attacker.example/',
      'http://attacker.example/',
      '//attacker.example/',
      // Backslashes: the URL parser treats "\" as "/" for special schemes, so
      // "/\attacker.example" resolves to a cross-origin host.
      '/\\attacker.example/',
      '/FixThisInjustice/\\\\attacker.example',
      'FixThisInjustice/today', // no leading slash: resolves against the worker path
    ]) {
      expect(parsePushPayload({ title: 't', url }).url).toBe(APP_SCOPE_PATH);
    }
  });

  it('rejects javascript: and data: urls', () => {
    expect(parsePushPayload({ title: 't', url: 'javascript:alert(1)' }).url).toBe(APP_SCOPE_PATH);
    expect(parsePushPayload({ title: 't', url: 'JavaScript:alert(1)' }).url).toBe(APP_SCOPE_PATH);
    expect(parsePushPayload({ title: 't', url: 'data:text/html,<script>x</script>' }).url).toBe(
      APP_SCOPE_PATH,
    );
  });

  it('replaces a same-origin path outside the app scope with the app base', () => {
    expect(parsePushPayload({ title: 't', url: '/other-project/' }).url).toBe(APP_SCOPE_PATH);
  });

  it('reads own properties only, so a prototype-polluting payload parses to defaults', () => {
    const raw: unknown = JSON.parse('{"__proto__":{"title":"injected"}}');
    expect(parsePushPayload(raw).title).toBe(FALLBACK_TITLE);
    expect(({} as Record<string, unknown>)['title']).toBeUndefined();
  });
});

describe('resolveClickUrl', () => {
  it('reads the url from notification data', () => {
    expect(resolveClickUrl({ url: '/FixThisInjustice/today' })).toBe('/FixThisInjustice/today');
  });

  it('falls back to the app scope for anything else', () => {
    expect(resolveClickUrl(undefined)).toBe(APP_SCOPE_PATH);
    expect(resolveClickUrl(null)).toBe(APP_SCOPE_PATH);
    expect(resolveClickUrl({})).toBe(APP_SCOPE_PATH);
    expect(resolveClickUrl({ url: 'https://attacker.example/' })).toBe(APP_SCOPE_PATH);
    expect(resolveClickUrl({ url: 42 })).toBe(APP_SCOPE_PATH);
  });
});

describe('notificationClickTarget', () => {
  it('returns an absolute same-origin url for an in-scope path', () => {
    expect(notificationClickTarget('/FixThisInjustice/today', ORIGIN)).toBe(
      `${ORIGIN}/FixThisInjustice/today`,
    );
  });

  it('falls back to the app base, absolute, for anything not in scope', () => {
    for (const url of [
      undefined,
      null,
      42,
      '',
      'https://attacker.example/',
      '//attacker.example/',
      '/\\attacker.example/',
      'javascript:alert(1)',
      'data:text/html,x',
      '/other-project/',
    ]) {
      const target = notificationClickTarget(url, ORIGIN);
      expect(target).toBe(BASE_HREF);
      expect(new URL(target).origin).toBe(ORIGIN);
    }
  });

  it('is stable under a trailing slash on the origin', () => {
    expect(notificationClickTarget('/FixThisInjustice/', `${ORIGIN}/`)).toBe(BASE_HREF);
  });
});
