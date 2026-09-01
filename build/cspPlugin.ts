import type { Plugin } from 'vite';
import { frameSrcList } from '../src/config/videoInstances.ts';

/**
 * Injects the master plan section 3 Content Security Policy as a meta tag.
 *
 * GitHub Pages cannot set response headers (master plan decision 1.12), so the
 * meta tag is the enforcement point. frame-src is generated from
 * src/config/videoInstances.ts so the policy and the runtime host list cannot
 * drift. frame-ancestors is deliberately absent: MDN states it is not supported
 * in a meta element, and clickjacking is handled by typed confirmations instead.
 */
export function cspPlugin(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    // P5 replaces the wildcard with the exact Worker hostname once it exists.
    "connect-src 'self' https://*.workers.dev",
    `frame-src ${frameSrcList()}`,
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');

  return {
    name: 'fti-csp',
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
