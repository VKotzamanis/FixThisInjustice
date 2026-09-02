#!/usr/bin/env bash
# Gate 3b: the built CSP must carry the master plan §3 directives verbatim and the referrer meta must exist.
# GitHub Pages cannot set response headers, so the meta tag is the only enforcement point (master plan §1.12).
set -euo pipefail
html="${1:-dist/index.html}"
# The build serialises attribute quotes as HTML entities (&#39; &quot; &amp;); decode before matching.
csp=$(grep -o '<meta http-equiv="Content-Security-Policy" content="[^"]*"' "$html" | sed 's/.*content="//; s/"$//' | sed "s/&#39;/'/g; s/&quot;/\"/g; s/&amp;/\&/g")
if [ -z "$csp" ]; then echo "FAIL: CSP meta tag absent from $html"; exit 1; fi
required=(
  "default-src 'self'"
  "script-src 'self'"
  "style-src 'self' 'unsafe-inline'"
  "img-src 'self' data: blob:"
  "media-src 'self' blob:"
  "font-src 'self'"
  "worker-src 'self'"
  "base-uri 'none'"
  "form-action 'none'"
  "object-src 'none'"
)
for d in "${required[@]}"; do
  case "$csp" in *"$d"*) ;; *) echo "FAIL: CSP lacks directive: $d"; echo "CSP was: $csp"; exit 1;; esac
done
case "$csp" in *"unsafe-eval"*) echo "FAIL: CSP contains unsafe-eval"; exit 1;; esac
# connect-src is pinned to the deployed reminders Worker at build time (build/cspPlugin.ts).
# It fails closed: no VITE_REMINDER_API means 'self' alone, never a wildcard, because
# https://*.workers.dev trusted every Worker anyone has ever deployed on the platform.
connect=$(printf '%s' "$csp" | tr ';' '\n' | sed -n "s/^ *\(connect-src .*\)\$/\1/p" | sed 's/ *$//')
if [ -z "$connect" ]; then echo "FAIL: CSP has no connect-src directive"; echo "CSP was: $csp"; exit 1; fi
case "$connect" in "connect-src 'self'"|"connect-src 'self' "*) ;;
  *) echo "FAIL: connect-src must begin with 'self'"; echo "connect-src was: $connect"; exit 1;; esac
case "$connect" in *"*"*) echo "FAIL: connect-src contains a wildcard"; echo "connect-src was: $connect"; exit 1;; esac
# When the job exports the Worker origin, the built policy must name exactly it and nothing else.
# The build trims the variable before use, so trim here too or a stray newline reads as a mismatch.
api=$(printf '%s' "${VITE_REMINDER_API:-}" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
if [ -n "$api" ] && [ "$connect" != "connect-src 'self' $api" ]; then
  echo "FAIL: connect-src does not name VITE_REMINDER_API"
  echo "  expected: connect-src 'self' $api"
  echo "  actual:   $connect"
  exit 1
fi
# No directive may carry a wildcard host: every origin in this policy is exact.
if printf '%s' "$csp" | grep -qE "https?://[^ ;]*\*[^ ;]*|(^|[ ;])\*([ ;]|\$)"; then
  echo "FAIL: CSP contains a wildcard host"; echo "CSP was: $csp"; exit 1
fi
grep -q '<meta name="referrer" content="no-referrer"' "$html" || { echo "FAIL: referrer meta absent from $html"; exit 1; }
echo "PASS: CSP carries every §3 directive, no unsafe-eval, no wildcard; connect-src is $connect; referrer meta present"
