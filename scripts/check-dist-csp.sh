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
# The only wildcard host permitted is the Workers placeholder until P5 pins the exact origin.
if printf '%s' "$csp" | grep -oE "https?://[^ ;]*\*[^ ;]*|(^|[ ;])\*([ ;]|$)" | grep -v 'https://\*\.workers\.dev' | grep -q .; then
  echo "FAIL: CSP contains a wildcard other than https://*.workers.dev"; echo "CSP was: $csp"; exit 1
fi
grep -q '<meta name="referrer" content="no-referrer"' "$html" || { echo "FAIL: referrer meta absent from $html"; exit 1; }
echo "PASS: CSP carries every §3 directive, no unsafe-eval, no stray wildcard; referrer meta present"
