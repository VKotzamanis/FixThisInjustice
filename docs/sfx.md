# Skin sound effects

**No audio ships in this repository, and none is planned to.** `public/sfx/` holds `.gitkeep` and
nothing else. Sound effects are optional assets you drop in yourself. The app is correct without
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
independent: sounds under `limelight/` never play under `board/`. The player enforces that rather
than trusting it, and the test that holds it is `stays silent after a skin change until the next
unlock` in `src/skins/sfx.test.ts`.

## The toggle

Sounds are off by default. Settings turns them on, in the row headed "the look".

That toggle is the only thing that silences a skin. `prefers-reduced-motion` is not consulted, and
that is deliberate: it governs motion, and a user who suppresses animation has said nothing about
audio.

While the toggle is off the app fetches nothing. An install that never turns sounds on never asks
the network for an audio file. A directory full of clips costs that user no bytes.

## The gesture requirement

Browsers refuse to start audio until the user has interacted with the page, so nothing can play on
load. The app unlocks at three points, and each one sits inside a real gesture:

- `useFirstGestureUnlock()` listens for the first `pointerdown` or `keydown` on the window, unlocks,
  and then removes both listeners.
- The sounds checkbox unlocks inside its own change handler when the user switches it on.
- The skin picker unlocks when the user chooses a different skin, which is what decodes that skin's
  set.

Unlocking also decodes. The unlock fetches and decodes all four files for the active skin once, and
holds the decoded audio. Decoding at fire time would add a variable delay, and a stamp sound
arriving 300 ms after the stamp is worse than no sound.

Switching skins decodes that skin's set, and the app stays silent until the decode lands. It never
falls back to the set the skin you left behind had loaded.

A sound is one shot. It never loops, and a new one stops the one before it rather than overlapping.
The app also stays silent while its tab is in the background.

## Format

**Ship AAC in an `.m4a` (MP4) container, or MP3.** Master plan section 10.10 records the decision.
Safari plays neither Ogg Vorbis nor WebM. An Ogg-only or WebM-only asset is therefore silent on
every iPhone, and an iPhone is the device this app is most likely installed on. A smaller alternate
encoding may sit beside the universal file, never in place of it.

To convert what you downloaded:

    ffmpeg -i in.ogg -c:a aac -b:a 96k -ac 1 out.m4a

`-ac 1` is mono, which is what halves the file. Play the result in Safari before you commit it.

## Size, length and loudness

`scripts/check-sfx-size.sh` enforces two numbers:

- **60 KiB (61440 bytes) per file**, counting alternates as well as universal files.
- **240 KiB (245760 bytes) per set**, counting the `.m4a` and `.mp3` files only, because one install
  downloads one file per moment.

A set is one skin. The gate totals the bytes per immediate subdirectory of `public/sfx/`. Three
skins at 240 KiB each pass, and a failure names the skin that broke the limit.

A 2 s mono clip at 96 kb/s AAC is roughly 24 kB. The 60 KiB limit is therefore about twice the
headroom a clip needs, and none of them needs stereo.

**Length and loudness are guidance, not measurements.** Keep every clip to 2 s or less. The gate
counts bytes, and it cannot tell a 2 s clip from a 5 s one encoded at a lower bitrate. The length
rule is yours to keep.

Nothing in this project measures loudness either, and this page asserts no target. Set the level by
ear against the rest timer chime, at mid volume on a phone. Leave peak headroom rather than
normalising to full scale. `ffmpeg -af loudnorm` will give you a measured level if you want one, but
no gate checks it and no number here has been verified.

## What CI checks, and what it does not

`.github/workflows/ci.yml` runs the gate on every push and pull request, before the install, and
`.github/workflows/deploy.yml` runs it again before it publishes. Both are needed: the two workflows
are independent, so a red `ci.yml` does not stop a deploy. With the directory empty the gate prints
`check-sfx-size: no audio under public/sfx.` and passes, which is the state this repository is in
today.

The gate fails on:

- any file over the per-file limit;
- any one skin's set over the set limit, naming that skin;
- any extension other than `.m4a` or `.mp3` with no `.m4a` or `.mp3` sibling beside it.

The gate does not check duration, loudness, channel count, sample rate or whether the file decodes
at all. A corrupt 24 kB file passes CI and is silent in the app. That is the same outcome as a
missing file, and nothing reports it.

One neighbouring gate has a blind spot worth knowing about while you work locally.
`scripts/check-no-emoji.mjs`, which both workflows run, lists its files with `git ls-files`, so it
scans tracked files only. A component or copy table you have not yet added to the index is invisible
to it. A local run therefore passes on a file that CI will scan the moment you commit it.
`scripts/check-sfx-size.sh` does not share this: it walks the tree with `find`, so it sees untracked
audio as readily as tracked audio.

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

**Sonniss GDC bundles are excluded.** They are often described as free to use, and they are not CC0.
The licence is the #GameAudioGDC Bundle Unlimited User License, version 2.0, and it is a proprietary
royalty-free agreement. Its redistribution clause reads:

> Licensee may not distribute, publish, sub-license or otherwise supply the sound effects as sound
> effects to any other person, without the Licensor's prior written permission.

Shipping them in an `sfx/` directory of this repository is exactly that. Fetched from
<https://sonniss.com/gdc-bundle-license/> on 2026-09-02 and recorded in `REFERENCES.md`.
