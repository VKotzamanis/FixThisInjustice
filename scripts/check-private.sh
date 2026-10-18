#!/usr/bin/env bash
# Gate: no owner-private identifiers in the tracked tree. No exemptions.
# The pattern itself is private: env PRIVACY_PATTERN (CI secret) or docs/private/privacy-pattern.txt
# (gitignored, one extended regex). Neither present: prints SKIPPED and exits 0.
set -euo pipefail
pattern="${PRIVACY_PATTERN:-}"
if [ -z "$pattern" ] && [ -f docs/private/privacy-pattern.txt ]; then
  pattern="$(tr -d '\n' < docs/private/privacy-pattern.txt)"
fi
if [ -z "$pattern" ]; then
  echo "SKIPPED: no PRIVACY_PATTERN secret and no docs/private/privacy-pattern.txt"
  exit 0
fi
# git grep exits 1 on no match, which is the passing case. -c prints counts, never the matched text.
if git grep -c -i -E "$pattern" -- . ; then
  echo "FAIL: private identifiers found in the tracked tree (counts above)"
  exit 1
fi
echo "PASS: no private identifiers in the tracked tree"
