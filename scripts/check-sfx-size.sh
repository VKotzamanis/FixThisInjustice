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
# SIZE. 60 KiB per file, 240 KiB for one skin's set of four. The set total is accumulated per
# immediate subdirectory of the directory, because a subdirectory is one skin and an install
# downloads one skin's set: summing the whole tree instead would fail three lawful skins that each
# sit well inside the limit. What an install downloads is one file per moment, so the set total
# counts the universal files and not the alternates; the per-file limit applies to every file,
# alternates included, because any one of them may be the one downloaded. A universal file lying
# loose in the directory rather than under a skin is booked to a bucket named for that, since
# sfxUrl() always puts a skin segment in the path and so no skin can ever fetch it.
#
# WHAT THIS DOES NOT MEASURE: duration. The plan's rule is 2 s or less per clip, and this gate
# bounds bytes rather than seconds, on the arithmetic that a 2 s mono clip at 96 kb/s AAC is about
# 24 kB, so 60 KiB carries roughly 2x headroom. A 60 KiB file can still be a 5 s clip at a lower
# bitrate. Length stays the author's responsibility, stated in docs/sfx.md as guidance.
set -eu

DIR="${1:-public/sfx}"
# A trailing slash would survive into the prefix strip that names each file's skin, so it goes here
# rather than being handled at every use. Root is left alone: stripping it leaves nothing at all.
if [ "$DIR" != / ]; then DIR="${DIR%/}"; fi
PER_FILE_LIMIT=61440 # bytes, 60 KiB
SET_LIMIT=245760     # bytes, 240 KiB, one skin's four moments
TAB="$(printf '\t')"

if [ ! -d "$DIR" ]; then
  echo "check-sfx-size: $DIR is absent. No skin ships sound effects yet."
  exit 0
fi

# Listing to a file, then reading from it, keeps the loop in this shell so a failure inside it
# survives. `read` splits on newlines, so a filename holding one arrives as two paths and the gate
# measures neither; the entry count below catches that case and fails closed. This mirrors
# scripts/check-media-size.sh, which guards the same hazard for public/media/.
listing="$(mktemp)"
# One "<skin><tab><bytes>" line per universal file. A POSIX shell has no associative array, so the
# per-skin totals are accumulated in awk from this file rather than in the loop below.
sums="$(mktemp)"
trap 'rm -f "$listing" "$sums"' EXIT
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
rejected=0

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
      # Counted, not just rejected: a rejected file is audio that was found, so the summary below
      # must not go on to report an empty directory.
      rejected=$((rejected + 1))
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
    # Booked to the immediate subdirectory, which is the skin whose set limit these bytes count
    # against. A file lying loose in $DIR is under no skin and says so.
    rel="${file#"$DIR"/}"
    case "$rel" in
    */*) skin="${rel%%/*}" ;;
    *) skin="(no skin directory)" ;;
    esac
    printf '%s%s%s\n' "$skin" "$TAB" "$size" >>"$sums"
  else
    alternates=$((alternates + 1))
  fi
done <"$listing"

# `rejected` belongs in this test as much as the other two. A rejected file is audio that was
# found, so a directory holding nothing but one .ogg must not be reported as holding no audio at
# all: the FAIL line above and "no skin ships sound effects yet" cannot both be true.
if [ "$universal" -eq 0 ] && [ "$alternates" -eq 0 ] && [ "$rejected" -eq 0 ]; then
  echo "check-sfx-size: no audio under $DIR. No skin ships sound effects yet."
  exit "$status"
fi

# One line per skin over the limit, sorted so the same tree always reports in the same order.
over="$(awk -F"$TAB" -v limit="$SET_LIMIT" '
  { bytes[$1] += $2 }
  END { for (skin in bytes) if (bytes[skin] > limit) printf "%s\t%d\n", skin, bytes[skin] }
' "$sums" | sort)"

if [ -n "$over" ]; then
  status=1
  printf '%s\n' "$over" | while IFS="$TAB" read -r skin skin_total; do
    echo "check-sfx-size: FAIL - the $skin set totals $skin_total bytes, over the $SET_LIMIT byte per-skin set limit." >&2
  done
fi

if [ "$status" -ne 0 ]; then
  exit 1
fi

echo "check-sfx-size: OK - $universal universal file(s) totalling $total bytes, $alternates alternate(s)."
