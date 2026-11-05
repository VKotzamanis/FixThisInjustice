#!/usr/bin/env bash
# scripts/dist-fingerprint.sh DIR
#
# Audit E06: one SHA-256 over every published file in DIR except the per-build stamp
# (build-info.json) and this fingerprint's own file (content-sha256.txt). Two builds that ship
# the same bytes get the same fingerprint, so deploy.yml skips a publish that would change
# nothing a user downloads (a docs-only commit). Paths are hashed with their contents, so a
# renamed file changes it too. LC_ALL=C fixes the sort order across runners.
set -euo pipefail
dir="${1:?usage: dist-fingerprint.sh DIR}"
cd "$dir"
find . -type f ! -name build-info.json ! -name content-sha256.txt -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 sha256sum \
  | sha256sum \
  | cut -d' ' -f1
