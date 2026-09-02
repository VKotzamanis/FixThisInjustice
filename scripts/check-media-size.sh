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
# Format: H.264 video with AAC audio in an .mp4 container. Ogg and WebM are rejected here
# because Safari does not decode them; see docs/motivation-video.md.
set -eu

DIR="${1:-public/media}"
HARD_LIMIT=104857600 # bytes, 100 MiB - GitHub blocks the push above this
SOFT_LIMIT=26214400  # bytes, 25 MiB - guidance for a Pages project site

if [ ! -d "$DIR" ]; then
  echo "check-media-size: FAIL - $DIR does not exist." >&2
  exit 1
fi

# Listing to a file, then reading from it, keeps the loop in this shell so that a failure
# inside it survives. A path containing a newline would break this; media filenames do not.
listing="$(mktemp)"
trap 'rm -f "$listing"' EXIT
find "$DIR" -type f ! -name '.gitkeep' >"$listing"

status=0
count=0

while IFS= read -r file; do
  [ -n "$file" ] || continue
  count=$((count + 1))

  case "$file" in
  *.mp4) ;;
  *)
    echo "check-media-size: FAIL - $file is not an .mp4. Safari decodes H.264/AAC in MP4; Ogg and WebM are silent there." >&2
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
