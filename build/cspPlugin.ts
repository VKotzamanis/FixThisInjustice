import { loadEnv, type Plugin } from 'vite';
import { frameSrcList } from '../src/config/videoInstances.ts';

/**
 * Injects the master plan section 3 Content Security Policy as a meta tag.
 *
 * GitHub Pages cannot set response headers (master plan decision 1.12), so the
 * meta tag is the enforcement point. frame-src is generated from
 * src/config/videoInstances.ts so the policy and the runtime host list cannot
 * drift (security review constraint 21). frame-ancestors is deliberately
 * absent: MDN states it is not supported in a meta element, and clickjacking is
 * handled by typed confirmations instead.
 *
 * connect-src is derived from VITE_REMINDER_API at build time and fails closed.
 * With no variable the directive is `'self'` alone: a build that cannot reach
 * the reminders Worker is a degraded build, whereas a build that keeps the old
 * `https://*.workers.dev` wildcard trusts every Worker anyone has ever
 * deployed. An unusable value is a build failure, never a silent widening and
 * never a silent drop, because both of those ship a policy nobody chose.
 */

const REMINDER_API_HINT =
  "Set it to a bare https origin such as 'https://fti-reminders.example.workers.dev', " +
  'or leave it unset to build without reminders.';

/** Every rejection path for VITE_REMINDER_API, so the build stops with one voice. */
function invalid(value: string, reason: string): never {
  throw new Error(
    `[fti-csp] VITE_REMINDER_API is invalid: ${reason}. Received '${value}'. ${REMINDER_API_HINT}`,
  );
}

function parseUrl(raw: string): URL {
  try {
    return new URL(raw);
  } catch {
    invalid(raw, 'it is not a URL');
  }
}

/**
 * The reminders Worker as a connect-src source list: `[]` when the build had no
 * variable, one origin when it had a usable one, and a thrown error otherwise.
 *
 * `mode` is Vite's resolved mode. `http://localhost:<port>` is accepted only
 * outside a production build so that `vite dev` can talk to `wrangler dev`,
 * while a deployed bundle can never carry a cleartext source.
 */
export function workerConnectSrc(reminderApi: string | undefined, mode: string): string[] {
  if (typeof reminderApi !== 'string') return [];
  const raw = reminderApi.trim();
  if (raw.length === 0) return [];

  // Checked before parsing: '*' is not a forbidden host code point, so
  // 'https://*.workers.dev' parses cleanly and would otherwise pass every
  // later check while widening the policy to any Worker on the platform.
  if (raw.includes('*')) invalid(raw, 'it must not contain a wildcard');

  const url = parseUrl(raw);
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol === 'http:') {
    if (!isLoopback || mode === 'production') {
      invalid(raw, 'http is allowed only for localhost outside a production build');
    }
  } else if (url.protocol !== 'https:') {
    invalid(raw, `only https is allowed, not '${url.protocol}'`);
  }

  // Checked before the origin comparison below, which would otherwise report
  // credentials as a stray path: URL.origin drops them silently.
  if (url.username !== '' || url.password !== '') invalid(raw, 'it must not carry credentials');

  // A CSP source is matched by origin, so a path, query, fragment or trailing
  // slash is at best ignored and at worst a typo for a different host. Compare
  // against the serialised origin rather than trimming, so the value in CI and
  // the value in the policy are the same string.
  if (raw !== url.origin) {
    invalid(raw, 'it must be a bare origin with no path, query, fragment or trailing slash');
  }

  return [url.origin];
}

export interface CspOptions {
  readonly frameSrc: readonly string[];
  readonly connectSrc: readonly string[];
}

/** Master plan section 3, with connect-src supplied rather than wildcarded. */
export function buildCsp({ frameSrc, connectSrc }: CspOptions): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src ${["'self'", ...connectSrc].join(' ')}`,
    `frame-src ${frameSrc.length === 0 ? "'none'" : frameSrc.join(' ')}`,
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * The exact policy the plugin injects. Split from cspPlugin so a test can
 * assert the whole string without standing up a Vite build.
 */
export function resolveCsp(reminderApi: string | undefined, mode: string): string {
  return buildCsp({
    // frameSrcList() is the single source of the host list; splitting its
    // space-joined output keeps that so, and the filter means an empty list
    // closes frame-src to 'none' instead of emitting a bare directive.
    frameSrc: frameSrcList()
      .split(' ')
      .filter((origin) => origin.length > 0),
    connectSrc: workerConnectSrc(reminderApi, mode),
  });
}

export function cspPlugin(): Plugin {
  let csp = '';

  return {
    name: 'fti-csp',
    configResolved(resolved) {
      // loadEnv reads the .env files and then merges the matching process.env
      // entries over them, so a value exported by CI wins and this plugin needs
      // no Node typings of its own. An invalid value throws from here, which
      // fails `vite build` and `vite dev` before any HTML is emitted.
      const env = loadEnv(resolved.mode, resolved.root, 'VITE_');
      const reminderApi = env['VITE_REMINDER_API'];
      const configured = typeof reminderApi === 'string' && reminderApi.trim().length > 0;
      if (resolved.command === 'build' && !configured) {
        console.warn(
          "[fti-csp] VITE_REMINDER_API is unset: connect-src is 'self' only, so reminders " +
            'cannot reach the Worker from this build.',
        );
      }
      csp = resolveCsp(reminderApi, resolved.mode);
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html: string) {
        return {
          html,
          tags: [
            {
              tag: 'meta',
              attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
              injectTo: 'head-prepend',
            },
          ],
        };
      },
    },
  };
}
