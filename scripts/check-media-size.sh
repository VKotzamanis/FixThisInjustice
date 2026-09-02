#!/usr/bin/env bash
# Gate: every file shipped in public/media/ must be an .mp4 and must stay under GitHub's
# hard file-size limit. Vite copies public/ verbatim into dist/, so anything left here is
# published to Pages and downloaded by every install that plays the motivation clip.
#
# Limits (sources recorded in REFERENCES.md):
#   100 MiB = 104857600 bytes  GitHub blocks the push outright. This is the hard failure.
#    50 MiB =  52428800 bytes  git prints a large-file warning.
#    25 MiB =  26214400 bytes  GitHub's browser-upload ceiling, and the guidance here: a
#                              published Pages site may be no larger than 1 GB and carries
#                              a soft limit of 100 GB/month of bandwidth, so the clip's real
#                              cost is one download per install.
# The 150 MiB (157286400 bytes) cap in src/domain/motivation/assets.ts is a different limit:
# it bounds a clip the user picks in Settings, which lives in that browser's IndexedDB and
# never reaches this directory. A bundled clip must clear the smaller GitHub limit as well.
#
# Format: H.264 video with AAC audio in an .mp4 container. Only .mp4 is accepted: it is the
# container this project ships and the one every target browser plays H.264/AAC from. The
# recorded codec evidence covers Ogg audio, which Safari does not decode. No plan records a
# measured Safari result for VP9 or AV1 in WebM. See docs/motivation-video.md.
set -eu

DIR="${1:-public/media}"
HARD_LIMIT=104857600 # bytes, 100 MiB - GitHub blocks the push above this
SOFT_LIMIT=26214400  # bytes, 25 MiB - guidance for a Pages project site

if [ ! -d "$DIR" ]; then
  echo "check-media-size: FAIL - $DIR does not exist." >&2
  exit 1
fi

# Listing to a file, then reading from it, keeps the loop in this shell so that a failure
# inside it survives. `read` splits on newlines, so a filename holding one arrives as two
# paths and the gate measures neither. That case fails closed rather than open: the second
# find prints one line per file whatever the name contains, so its count differs from the
# listing's line count exactly when some name contains a newline.
listing="$(mktemp)"
trap 'rm -f "$listing"' EXIT
find "$DIR" -type f ! -name '.gitkeep' >"$listing"

# `wc` pads its count with spaces on some platforms; strip them before comparing.
lines="$(wc -l <"$listing" | tr -d " ")"
entries="$(find "$DIR" -type f ! -name '.gitkeep' -exec printf 'x\n' \; | wc -l | tr -d " ")"

if [ "$lines" -ne "$entries" ]; then
  echo "check-media-size: FAIL - a filename under $DIR contains a newline. Rename it." >&2
  exit 1
fi

status=0
count=0

while IFS= read -r file; do
  [ -n "$file" ] || continue
  count=$((count + 1))

  # Lowercased before the match, so CLIP.MP4 passes the gate. src/domain/motivation/assets.ts
  # tests the extension case-insensitively too, because iOS names its captures .MOV.
  lower="$(printf '%s' "$file" | tr '[:upper:]' '[:lower:]')"

  case "$lower" in
  *.mp4) ;;
  *)
    echo "check-media-size: FAIL - $file is not an .mp4. Only .mp4 is accepted: it is the container this project ships and the one every target browser plays H.264/AAC from." >&2
    status=1
    continue
    ;;
  esac

  # `wc -c` pads its count with spaces on some platforms; strip them before comparing.
  size="$(wc -c <"$file" | tr -d " ")"
  echo "check-media-size: $file is $size bytes."

  if [ "$size" -gt "$HARD_LIMIT" ]; then
    echo "check-media-size: FAIL - $size bytes exceeds the 100 MiB ($HARD_LIMIT bytes) GitHub file limit." >&2
    status=1
  elif [ "$size" -gt "$SOFT_LIMIT" ]; then
    echo "check-media-size: WARNING - $size bytes exceeds the 25 MiB ($SOFT_LIMIT bytes) guidance for a Pages project site."
  fi
done <"$listing"

if [ "$count" -eq 0 ]; then
  echo "check-media-size: $DIR holds no clip. The app falls back to a clip chosen in Settings."
  exit 0
fi

if [ "$status" -ne 0 ]; then
  exit 1
fi

echo "check-media-size: OK."
