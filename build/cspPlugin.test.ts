import { describe, expect, it } from 'vitest';
import { buildCsp, resolveCsp, workerConnectSrc } from './cspPlugin.ts';

/*
 * The Content-Security-Policy this repository shipped before connect-src was
 * tightened, copied byte for byte out of dist/index.html built at 53072c2 (the
 * entity-decoded meta content). Every directive except connect-src must survive
 * this change unchanged, so the constant is the regression fence: if frame-src
 * loses a host, or img-src loses `blob:`, the snapshot test below fails even
 * though connect-src is correct.
 */
const PRE_CHANGE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; " +
  "connect-src 'self' https://*.workers.dev; " +
  'frame-src https://invidious.nerdvpn.de https://inv.nadeko.net ' +
  'https://invidious.tiekoetter.com https://yt.chocolatemoo53.com ' +
  'https://inv.thepixora.com https://invidious.f5.si; ' +
  "worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";

/** Every directive of a policy except the named one, in source order. */
function directivesExcept(csp: string, name: string): string[] {
  return csp.split('; ').filter((directive) => !directive.startsWith(`${name} `));
}

describe('workerConnectSrc', () => {
  it("contributes nothing when the build carried no VITE_REMINDER_API", () => {
    expect(workerConnectSrc(undefined, 'production')).toEqual([]);
    expect(workerConnectSrc('', 'production')).toEqual([]);
    expect(workerConnectSrc('   ', 'production')).toEqual([]);
  });

  it('accepts a bare https origin', () => {
    expect(workerConnectSrc('https://fti-reminders.example.workers.dev', 'production')).toEqual([
      'https://fti-reminders.example.workers.dev',
    ]);
  });

  it('accepts an https origin carrying an explicit port', () => {
    expect(workerConnectSrc('https://reminders.example.org:8443', 'production')).toEqual([
      'https://reminders.example.org:8443',
    ]);
  });

  it('rejects a trailing slash rather than silently trimming it', () => {
    expect(() => workerConnectSrc('https://fti-reminders.example.workers.dev/', 'production')).toThrow(
      /VITE_REMINDER_API is invalid: it must be a bare origin with no path, query, fragment or trailing slash/,
    );
  });

  it('rejects a path', () => {
    expect(() => workerConnectSrc('https://fti-reminders.example.workers.dev/v1', 'production')).toThrow(
      /it must be a bare origin with no path, query, fragment or trailing slash/,
    );
  });

  it('rejects credentials embedded in the URL', () => {
    expect(() => workerConnectSrc('https://user:secret@reminders.example.org', 'production')).toThrow(
      /it must not carry credentials/,
    );
  });

  it('rejects a wildcard host instead of widening connect-src', () => {
    expect(() => workerConnectSrc('https://*.workers.dev', 'production')).toThrow(
      /it must not contain a wildcard/,
    );
  });

  it('rejects a javascript: URL', () => {
    expect(() => workerConnectSrc('javascript:alert(1)', 'production')).toThrow(
      /only https is allowed/,
    );
  });

  it('rejects a value that is not a URL at all', () => {
    expect(() => workerConnectSrc('not a url', 'production')).toThrow(/it is not a URL/);
  });

  it('allows http://localhost outside a production build', () => {
    expect(workerConnectSrc('http://localhost:8787', 'development')).toEqual([
      'http://localhost:8787',
    ]);
  });

  it('rejects http://localhost in a production build', () => {
    expect(() => workerConnectSrc('http://localhost:8787', 'production')).toThrow(
      /http is allowed only for localhost outside a production build/,
    );
  });

  it('rejects plain http for a non-localhost host even outside production', () => {
    expect(() => workerConnectSrc('http://reminders.example.org', 'development')).toThrow(
      /http is allowed only for localhost outside a production build/,
    );
  });
});

describe('buildCsp', () => {
  it("emits connect-src 'self' alone when no Worker origin is known", () => {
    expect(buildCsp({ frameSrc: ['https://yewtu.be'], connectSrc: [] })).toContain(
      "connect-src 'self';",
    );
  });

  it('appends the Worker origin to the self source', () => {
    expect(
      buildCsp({
        frameSrc: ['https://yewtu.be'],
        connectSrc: ['https://fti-reminders.example.workers.dev'],
      }),
    ).toContain("connect-src 'self' https://fti-reminders.example.workers.dev;");
  });

  it("closes frame-src to 'none' rather than emitting an empty directive", () => {
    expect(buildCsp({ frameSrc: [], connectSrc: [] })).toContain("frame-src 'none';");
  });
});

describe('resolveCsp', () => {
  it('fails closed to a same-origin connect-src when the variable is unset', () => {
    expect(resolveCsp(undefined, 'production')).toBe(
      PRE_CHANGE_CSP.replace("connect-src 'self' https://*.workers.dev", "connect-src 'self'"),
    );
  });

  it('leaves every directive other than connect-src byte for byte unchanged', () => {
    expect(directivesExcept(resolveCsp(undefined, 'production'), 'connect-src')).toEqual(
      directivesExcept(PRE_CHANGE_CSP, 'connect-src'),
    );
    expect(
      directivesExcept(
        resolveCsp('https://fti-reminders.example.workers.dev', 'production'),
        'connect-src',
      ),
    ).toEqual(directivesExcept(PRE_CHANGE_CSP, 'connect-src'));
  });

  it('never leaves the wildcard workers.dev host in the policy', () => {
    expect(resolveCsp('https://fti-reminders.example.workers.dev', 'production')).not.toContain(
      '*.workers.dev',
    );
    expect(resolveCsp(undefined, 'production')).not.toContain('*');
  });
});
