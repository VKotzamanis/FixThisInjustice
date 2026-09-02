// src/config/reminders.test.ts
//
// The scheme check on VITE_REMINDER_API (P5 Task 5 review, item 2).
//
// `import.meta.env` is frozen into the module at import time, so the exported constants can
// only ever be observed in the one configuration this test run was built with. The rule is
// therefore tested through resolveReminderApiBase(raw, dev), which takes both inputs as
// arguments; the module-scope constants below are asserted only for the shape they take in a
// test build, which carries neither variable.
//
// Units: none here. Every value is a URL string.

import { describe, expect, it } from 'vitest';
import { REMINDER_API_BASE, REMINDERS_CONFIGURED, resolveReminderApiBase } from './reminders';

describe('resolveReminderApiBase', () => {
  it('rejects an absent variable', () => {
    expect(resolveReminderApiBase(undefined, false)).toBe('');
    expect(resolveReminderApiBase(undefined, true)).toBe('');
  });

  it('rejects an empty or whitespace-only variable', () => {
    expect(resolveReminderApiBase('', false)).toBe('');
    expect(resolveReminderApiBase('   ', false)).toBe('');
  });

  it('accepts a bare https origin', () => {
    expect(resolveReminderApiBase('https://x.workers.dev', false)).toBe('https://x.workers.dev');
  });

  it('trims a trailing slash from an https origin', () => {
    // Runtime safety net only: build/cspPlugin.ts rejects the trailing slash outright, so a
    // build that reaches here has already been through that gate.
    expect(resolveReminderApiBase('https://x.workers.dev/', false)).toBe('https://x.workers.dev');
    expect(resolveReminderApiBase('https://x.workers.dev///', false)).toBe('https://x.workers.dev');
  });

  it('accepts http loopback in a dev build and refuses it in a production build', () => {
    expect(resolveReminderApiBase('http://localhost:8787', true)).toBe('http://localhost:8787');
    expect(resolveReminderApiBase('http://localhost:8787', false)).toBe('');
    expect(resolveReminderApiBase('http://127.0.0.1:8787', true)).toBe('http://127.0.0.1:8787');
    expect(resolveReminderApiBase('http://127.0.0.1', true)).toBe('http://127.0.0.1');
    expect(resolveReminderApiBase('http://127.0.0.1', false)).toBe('');
  });

  it('refuses cleartext http to any host that is not loopback, even in a dev build', () => {
    expect(resolveReminderApiBase('http://x.workers.dev', true)).toBe('');
    expect(resolveReminderApiBase('http://localhost.evil.test', true)).toBe('');
  });

  it('refuses a javascript: URL', () => {
    expect(resolveReminderApiBase('javascript:alert(1)', true)).toBe('');
    expect(resolveReminderApiBase('javascript:alert(1)', false)).toBe('');
  });

  it('refuses any other scheme', () => {
    expect(resolveReminderApiBase('ftp://x', true)).toBe('');
    expect(resolveReminderApiBase('data:text/plain,x', true)).toBe('');
    expect(resolveReminderApiBase('//x.workers.dev', true)).toBe('');
    expect(resolveReminderApiBase('x.workers.dev', true)).toBe('');
  });

  it('refuses an origin carrying credentials', () => {
    // URL.origin drops the userinfo silently, so this is checked before the origin is read.
    expect(resolveReminderApiBase('https://user:pw@x', false)).toBe('');
    expect(resolveReminderApiBase('https://user@x.workers.dev', false)).toBe('');
  });

  it('refuses a wildcard, a path, a query or a fragment', () => {
    expect(resolveReminderApiBase('https://*.workers.dev', false)).toBe('');
    expect(resolveReminderApiBase('https://x.workers.dev/v1', false)).toBe('');
    expect(resolveReminderApiBase('https://x.workers.dev?k=v', false)).toBe('');
    expect(resolveReminderApiBase('https://x.workers.dev#f', false)).toBe('');
  });
});

describe('module constants in a build with no variables', () => {
  it('reports reminders as unconfigured', () => {
    expect(REMINDER_API_BASE).toBeNull();
    expect(REMINDERS_CONFIGURED).toBe(false);
  });
});
