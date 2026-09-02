# Skin sound effects

**No audio ships in this repository, and none is planned to.** `public/sfx/` holds `.gitkeep` and
nothing else. Sound effects are optional assets you drop in yourself, and the app is correct without
them: a moment whose file is missing plays nothing, and nothing else changes.

The loader, the toggle and the CI gate are built. `src/skins/sfx.ts` fetches and decodes the files,
Settings turns them on, and `scripts/check-sfx-size.sh` measures whatever you add. This page tells
you what to add and where.

## Where the files go

Put each file at:

    public/sfx/<skin>/<name>.m4a

`<skin>` is `clinical`, `limelight` or `board`. Vite copies `public/` into `dist/` unchanged and
`vite.config.ts` sets `base` to `/FixThisInjustice/`, so a file at
`public/sfx/board/rest_over.m4a` is served at `/FixThisInjustice/sfx/board/rest_over.m4a`. That is
the path `sfxUrl()` builds:

```ts
export function sfxUrl(skin: SkinId, name: SfxName): string {
  return `${import.meta.env.BASE_URL}sfx/${skin}/${name}.m4a`;
}
```

Nothing scans the directory. The names are fixed, and a file under any other name is published but
never played.

`<name>` is one of four, and there is no fifth:

| Name | Fires when | Character | Length |
| --- | --- | --- | --- |
| `session_done` | the last set of the session is logged | the one celebratory sound; a short rising figure | 1.2 to 2.0 s |
| `pr_stamp` | a logged set beats the previous best for that exercise | a hard percussive stamp with a bright tail, timed to the 700 ms landing | 0.8 to 1.2 s |
| `rest_over` | the rest countdown reaches 0 | the only functional sound of the four; audible in a gym, and not like a notification | 1.0 to 1.5 s |
| `intervention_open` | the missed-week modal opens | soft and low, never a sting; it plays over a line about a missed week | 1.0 to 1.5 s |

A skin with no directory is silent. A skin with two of the four files plays those two. The skins are
independent: sounds under `limelight/` never play under `board/`.

## The toggle

Sounds are off by default. Settings turns them on, in the row headed "the look".

That toggle is the only thing that silences a skin. `prefers-reduced-motion` is not consulted, and
that is deliberate: it governs motion, and a user who suppresses animation has said nothing about
audio.

While the toggle is off the app fetches nothing. An install that never turns sounds on never asks
the network for an audio file, so a directory full of clips costs that user no bytes.

## The gesture requirement

Browsers refuse to start audio until the user has interacted with the page, so nothing can play on
load. The app unlocks at two points, and both sit inside a real gesture:

- `useFirstGestureUnlock()` listens for the first `pointerdown` or `keydown` on the window, unlocks,
  and then removes both listeners.
- The sounds checkbox unlocks inside its own change handler when it is switched on.

Unlocking also decodes. All four files for the active skin are fetched and decoded once, at the
unlock, and the decoded audio is held. Decoding at fire time would add a variable delay, and a stamp
sound arriving 300 ms after the stamp is worse than no sound. Switching skins decodes the new set on
the next unlock.

A sound is one shot. It never loops, and a new one stops the one before it rather than overlapping.
The app also stays silent while its tab is in the background.

## Format

**Ship AAC in an `.m4a` (MP4) container, or MP3.** Master plan section 10.10 records the decision.
Safari plays neither Ogg Vorbis nor WebM, so an Ogg-only or WebM-only asset is silent on every
iPhone, and an iPhone is the device this app is most likely installed on. A smaller alternate
encoding may sit beside the universal file, never in place of it.

To convert what you downloaded:

    ffmpeg -i in.ogg -c:a aac -b:a 96k -ac 1 out.m4a

`-ac 1` is mono, which is what halves the file. Play the result in Safari before you commit it.

## Size, length and loudness

`scripts/check-sfx-size.sh` enforces two numbers:

- **60 KiB (61440 bytes) per file**, counting alternates as well as universal files.
- **240 KiB (245760 bytes) per set**, counting the `.m4a` and `.mp3` files only, because one install
  downloads one file per moment.

A 2 s mono clip at 96 kb/s AAC is roughly 24 kB, so 60 KiB leaves about twice the headroom a clip
needs and none of them needs stereo.

**Length and loudness are guidance, not measurements.** Keep every clip to 2 s or less. The gate
counts bytes and cannot tell a 2 s clip from a 5 s one encoded at a lower bitrate, so the length rule
is yours to keep. Nothing in this project measures loudness either, and no target is asserted here:
set the level by ear against the rest timer chime at mid volume on a phone, and leave peak headroom
rather than normalising to full scale. If you want a measured level, `ffmpeg -af loudnorm` will give
you one, but no gate checks it and no number here has been verified.

## What CI checks, and what it does not

`.github/workflows/ci.yml` runs the gate on every push and pull request, before the install. With
the directory empty it prints `check-sfx-size: no audio under public/sfx.` and passes, which is the
state this repository is in today.

The gate fails on:

- any file over the per-file limit;
- a set over the set limit;
- any extension other than `.m4a` or `.mp3` with no `.m4a` or `.mp3` sibling beside it.

The gate does not check duration, loudness, channel count, sample rate or whether the file decodes
at all. A corrupt 24 kB file passes CI and is silent in the app, which is the same outcome as a
missing file and is not reported anywhere.

## Where to get CC0 files

Candidates to audition, not selections, carried over from the round-three design plan
(`docs/design/round3/2026-09-01-round3-plan.md` section 6.4). Verify the licence per file at the
moment you download it and record it in `REFERENCES.md`.

- Kenney, Interface Sounds: <https://kenney.nl/assets/interface-sounds>
- Kenney, Digital Audio: <https://kenney.nl/assets/digital-audio>
- Kenney, UI Audio: <https://kenney.nl/assets/ui-audio>
- Freesound, CC0 facet: <https://freesound.org/search/?q=&f=license:%22Creative%20Commons%200%22>
- OpenGameArt, CC0 sound effects:
  <https://opengameart.org/art-search-advanced?field_art_type_tid%5B%5D=13&field_art_licenses_tid%5B%5D=4>

Every Kenney audio pack ships Ogg Vorbis only, so transcoding is mandatory rather than optional.

**Sonniss GDC bundles are excluded.** They are often described as free to use and they are not CC0.
The bundle licence is a proprietary royalty-free agreement that forbids supplying the sounds onward
as sound effects, which is what a repository shipping its own `sfx/` directory would be doing.
