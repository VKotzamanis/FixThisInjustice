#!/usr/bin/env bash
# Gate: size and format for the per-skin sound effects in public/sfx/.
#
# Vite copies public/ verbatim into dist/, so anything left here is published to Pages and fetched
# by every install that turns sounds on. The repository ships no audio at all (docs/sfx.md), so the
# normal result of this gate is "nothing to check"; it exists for the day someone drops files in.
#
# FORMAT. AAC in an .m4a (MP4) container, or MP3. Master plan section 10.10 records the decision:
# Ogg Vorbis is unsupported in Safari, so an Ogg-only asset is silent on every iPhone, which is the
# platform this PWA is most likely installed on. Any other extension therefore fails unless an .m4a
# or .mp3 sibling sits beside it, which is the shape of a legitimate smaller alternate listed first
# in a <source> list with the universal file behind it.
#
# SIZE. 60 KiB per file, 240 KiB for one skin's set of four. What one install downloads is one file
# per moment, so the set total counts the universal files and not the alternates; the per-file limit
# applies to every file, alternates included, because any one of them may be the one downloaded.
#
# WHAT THIS DOES NOT MEASURE: duration. The plan's rule is 2 s or less per clip, and this gate
# bounds bytes rather than seconds, on the arithmetic that a 2 s mono clip at 96 kb/s AAC is about
# 24 kB, so 60 KiB carries roughly 2x headroom. A 60 KiB file can still be a 5 s clip at a lower
# bitrate. Length stays the author's responsibility, stated in docs/sfx.md as guidance.
set -eu

DIR="${1:-public/sfx}"
PER_FILE_LIMIT=61440 # bytes, 60 KiB
SET_LIMIT=245760     # bytes, 240 KiB, one skin's four moments

if [ ! -d "$DIR" ]; then
  echo "check-sfx-size: $DIR is absent. No skin ships sound effects yet."
  exit 0
fi

# Listing to a file, then reading from it, keeps the loop in this shell so a failure inside it
# survives. `read` splits on newlines, so a filename holding one arrives as two paths and the gate
# measures neither; the entry count below catches that case and fails closed. This mirrors
# scripts/check-media-size.sh, which guards the same hazard for public/media/.
listing="$(mktemp)"
trap 'rm -f "$listing"' EXIT
find "$DIR" -type f ! -name '.gitkeep' | sort >"$listing"

lines="$(wc -l <"$listing" | tr -d ' ')"
entries="$(find "$DIR" -type f ! -name '.gitkeep' -exec printf 'x\n' \; | wc -l | tr -d ' ')"

if [ "$lines" -ne "$entries" ]; then
  echo "check-sfx-size: FAIL - a filename under $DIR contains a newline. Rename it." >&2
  exit 1
fi

status=0
total=0
universal=0
alternates=0

while IFS= read -r file; do
  [ -n "$file" ] || continue

  # Lowercased before the match, so CLIP.M4A passes.
  lower="$(printf '%s' "$file" | tr '[:upper:]' '[:lower:]')"
  stem="${file%.*}"

  case "$lower" in
  *.m4a | *.mp3)
    kind=universal
    ;;
  *)
    if [ -f "$stem.m4a" ] || [ -f "$stem.mp3" ]; then
      kind=alternate
    else
      echo "check-sfx-size: FAIL - $file is not an .m4a or .mp3 and has no .m4a or .mp3 sibling. Safari plays neither Ogg Vorbis nor WebM, so this file is silent on every iPhone." >&2
      status=1
      continue
    fi
    ;;
  esac

  # `wc -c` pads its count with spaces on some platforms; strip them before comparing.
  size="$(wc -c <"$file" | tr -d ' ')"

  if [ "$size" -gt "$PER_FILE_LIMIT" ]; then
    echo "check-sfx-size: FAIL - $file is $size bytes, over the $PER_FILE_LIMIT byte per-file limit." >&2
    status=1
  fi

  if [ "$kind" = universal ]; then
    universal=$((universal + 1))
    total=$((total + size))
  else
    alternates=$((alternates + 1))
  fi
done <"$listing"

if [ "$universal" -eq 0 ] && [ "$alternates" -eq 0 ]; then
  echo "check-sfx-size: no audio under $DIR. No skin ships sound effects yet."
  exit "$status"
fi

if [ "$total" -gt "$SET_LIMIT" ]; then
  echo "check-sfx-size: FAIL - the universal files total $total bytes, over the $SET_LIMIT byte set limit." >&2
  status=1
fi

if [ "$status" -ne 0 ]; then
  exit 1
fi

echo "check-sfx-size: OK - $universal universal file(s) totalling $total bytes, $alternates alternate(s)."
