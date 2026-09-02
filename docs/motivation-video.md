# Motivation video

The app is to play one clip after an ISO week closes below its session target. Playback is
not built yet. `src/ui/motivation/` does not exist, and Tasks 4 to 6 of
`docs/plans/2026-09-01-06-motivation-video.md` specify it. The domain half is built:
`src/domain/motivation/trigger.ts` chooses the week, and `src/domain/motivation/assets.ts`
chooses the file. This page covers the file.

## Where the clip goes

Put it at `public/media/motivation.mp4`.

Vite copies `public/` into `dist/` unchanged. `vite.config.ts` sets `base` to
`/FixThisInjustice/`, so the clip is served at `/FixThisInjustice/media/motivation.mp4`.
That is the path `src/domain/motivation/assets.ts` builds:

```ts
export const BUNDLED_VIDEO_SRC = `${import.meta.env.BASE_URL}media/motivation.mp4`;
```

The name is fixed. Nothing scans the directory. A file under any other name is published
but never played, and `scripts/check-media-size.sh` still measures it.

To replace the clip, overwrite that one file and rebuild. Nothing else changes. Nothing plays
the clip today: the app picks it up once Tasks 4 to 6 land.

Shipping no clip is a supported state. `public/media/` holds only `.gitkeep` today.
`probeBundledVideo()` sends a HEAD request to `BUNDLED_VIDEO_SRC`, so the app can tell a
missing clip from a broken one. It caches only a definite answer, and keeps that one for the
life of the page. A 2xx means present. A 404 or 410 means absent. Any other status, or a fetch
that fails, reports absent for that call alone. The next call repeats the request.

## Format

Encode H.264 video and AAC audio in an MP4 container. Reject every other container: the
gate script fails a build on any file under `public/media/` that is not an `.mp4`.

This command was run against ffmpeg 8.1.2 and produces a conforming file. The rate control
and bitrate are a starting point, not a measured optimum.

```sh
ffmpeg -i INPUT \
  -c:v libx264 -profile:v main -pix_fmt yuv420p -crf 23 \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  public/media/motivation.mp4
```

`-pix_fmt yuv420p` is the chroma format browsers decode in hardware. `-movflags +faststart`
runs a second pass that moves the index to the front of the file. Playback can then begin
before the whole clip has arrived.

Two facts about the player constrain the encode. WebKit's iOS video policy requires
`playsinline`, or iPhone Safari takes the video fullscreen the moment it plays. Starting
playback with sound requires a user gesture.

The modal is not built yet. Task 4 of `docs/plans/2026-09-01-06-motivation-video.md`
specifies it, and sets this contract. The modal renders a `<video>` that carries
`playsinline` and carries neither `autoplay` nor `muted`. It calls `play()` only from the
Play button's click handler. The clip therefore plays inline, at the modal's size, on a
portrait phone, and it never plays silently. Encode for that.

## Size

| Bytes | Limit | What happens |
| --- | --- | --- |
| 26214400 | 25 MiB | The guidance here, and GitHub's browser-upload ceiling. Above it the gate prints a warning. |
| 52428800 | 50 MiB | git prints a large-file warning. |
| 104857600 | 100 MiB | GitHub blocks the push. `scripts/check-media-size.sh` exits 1, and CI fails. |

Sources for all three are recorded in `REFERENCES.md`.

25 MiB is the guidance because of bandwidth, not disk. A published Pages site may be no
larger than 1 GB and carries a soft limit of 100 GB per month. Every install that triggers
the popup downloads the clip once.

The 150 MiB cap in `assets.ts` (`MAX_VIDEO_BYTES = 157286400`) is a different limit. It
bounds a clip the user picks in Settings. That clip lives in the browser's IndexedDB and
never reaches this directory. A bundled clip must clear the smaller GitHub limit as well.

Run the gate locally before pushing:

```sh
bash scripts/check-media-size.sh
```

## Caching

The clip is not precached. `vite.config.ts` carries:

```ts
injectManifest: {
  globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
  globIgnores: ['**/media/*.mp4'],
},
```

`globPatterns` does not list `mp4`, so the clip is already outside the manifest.
`globIgnores` states the exclusion outright, so a later edit to `globPatterns` cannot
readmit it.

Precaching would make every install download the whole clip before the app could work
offline. Instead `src/sw.ts` registers a `CacheFirst` route for same-origin paths
containing `/media/`. The clip is cached the first time it plays, and is available offline
after that.

To check a build:

```sh
npx vite build
grep -c 'motivation.mp4' dist/sw.js   # prints 0
```

`grep 'media/' dist/sw.js` still matches once. That match is the `CacheFirst` route's own
path test, not a precache entry.

## Using your own clip instead

Not built yet. Task 6 of `docs/plans/2026-09-01-06-motivation-video.md` specifies it and
`src/ui/motivation/` does not exist. The contract the plan sets:

- A Motivation video section in Settings, headed "Motivation video".
- A line reading "Bundled clip: present.", "Bundled clip: absent. Choose a file below.",
  or "Bundled clip: checking." while the HEAD probe is in flight.
- A line reading "Custom clip: none." or "Custom clip: stored on this device."
- A file input labelled "Choose a custom clip", with `accept="video/*"`.
- A Preview button, which opens the modal with no week attached and records nothing.
- A Remove custom clip button, shown only once a clip is stored.

`saveCustomVideo` rejects a file whose type does not start with `video/`, and one larger
than `MAX_VIDEO_BYTES`. The rejection message is shown in the section and nothing is
stored. The clip is written to IndexedDB (database `fti-assets`, object store `videos`) and
never uploaded.

IndexedDB is scoped to the browser, not to the profile, and `saveCustomVideo` deletes every
other record in the store. One clip is therefore kept per browser, not per profile. Saving
from a second profile replaces the first profile's clip. `resolveVideoSrc` prefers the stored
clip over the bundled file, and falls back to the bundled file when the stored id no longer
resolves.

Export is not built yet either. It belongs to P7, and the plan sets the contract. An export is
to carry the asset id only. The clip itself stays on the device that chose it.

## Why not Ogg or WebM

The project's codec rule is written down for sound effects, and it applies here unchanged.
Task 15 of `docs/plans/2026-09-01-08-fun-mechanics.md` (lines 7583 to 7586, and 8245 to 8247)
records two findings. Ogg Vorbis has no Safari support, so an Ogg-only asset is silent on every
iPhone. AAC in an MP4 container is the format every target browser decodes.
`docs/design/round3/2026-09-01-round3-plan.md` line 555 says the same for Ogg Opus.

The master plan's section 1.7 covers the push library and says nothing about media codecs,
so the P8 task above is the citation to follow.

The app ships one clip and one `src`, not a list of `<source>` elements. The single file has
to be the one format that plays everywhere, which is H.264 and AAC in MP4. Note the scope of
the recorded reasoning: it is about audio codecs. No plan states a measured Safari result for
VP9 or AV1 in WebM, and none was measured for this document.
