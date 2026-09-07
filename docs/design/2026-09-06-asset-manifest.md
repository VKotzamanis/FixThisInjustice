# Asset manifest

Every visual, audio and video asset this app names or implies, as of 2026-09-06. Derived by
reading the setup wizard, the limelight skin's own asset banks, `docs/sfx.md`,
`docs/motivation-video.md`, the intro slides, the specimen cards, briefs F and G, the PWA manifest,
and a repo-wide grep for `TODO` / `placeholder` / `artwork`. Nothing here is invented: every row
traces to a file and line cited in its **where** column.

Columns follow `docs/design/2026-09-04-icon-register.csv`'s shape (id, where it renders, what it
depicts, why it exists, the generation prompt, style constraints, licence, status), extended with
a **purpose** column (the one-sentence "what the user should understand" the brief asked for).

Status values: `exists` (asset is in the tree and correct), `specified` (fully specified, ready to
generate as written), `needs-decision` (a real ambiguity or gap blocks specifying it responsibly).

**Licence, every row**: `original, this project`. README.md's Licences section states the mascot
and icon art originate with the project; no third-party material is used anywhere below.

---

## 0. Decisions needed before generating anything

Four items gate correct specification of assets below them. Read this section before batch 1.

**RULED 2026-09-06, by the owner, via the asset-intake peer session:**

- **§0.1 (female body-fat range):** not actually a decision — the register was already right. Fix
  is `BODY_FAT_CHART_PERCENTAGES` going sex-specific in `src/content/bodyFatChart.ts`. Queued as
  fc's one-line `src/` fix, behind brief F. Generate the female silhouettes against 15-40.
- **§0.2 (icon format): SVG, `fill="currentColor"`.** Confirmed over the two-PNG convention. Batch A
  proceeds as written: generate a clean black-on-white raster reference, then hand-vectorize.
- **§0.3 (mascot wiring): wire them in**, per round 3's original plan — `mascotLifting` into
  `TodayView`'s hero, `mascotCrown` beside `WeekStamp`. This is a `src/` change (two import sites);
  the asset-intake session does not write to `src/`, so it is handed to fc to make.
- **§0.4 (specimen glyphs): yes**, add one glyph per `SpecimenCategory` (8). Prompts are Batch E,
  added to the companion file. Wiring an image field into `SpecimenCard`/`AtlasView.tsx` is a
  follow-on `src/` task once the art exists, also fc's.
- **§2 (app icon direction): direction 1, mascot-derived mark.** Colour resolved below, in §2.1 —
  it is not the two options the draft prompt offered.

### 0.1 Female body-fat chart: the register and the code disagree on which percentages

`src/content/bodyFatChart.ts` exports one shared `BODY_FAT_CHART_PERCENTAGES = [10, 15, 20, 25,
30, 35]`, and `SetupWizard.tsx`'s `BodyFatChartModal` maps that **same** array over **both** the
male and the female row. But `docs/design/2026-09-04-icon-register.csv` specifies male silhouettes
at 10/15/20/25/30/35 (matching the code) and **female silhouettes at 15/20/25/30/35/40** (not
matching it — no `bf-female-10` row exists, and `bf-female-40` has no home in the code's array).

The register's female range is the physiologically defensible one: essential fat is roughly 2-5%
in men against roughly 10-13% in women (ACE body-composition categories), so a 10% female
silhouette depicts a body composition that is not a realistic target, while omitting 40% drops a
real, common data point. The code's shared array looks like the bug, not the register.

**Decision needed:** make `BODY_FAT_CHART_PERCENTAGES` sex-specific (male 10-35, female 15-40, per
the register) before commissioning the six female silhouettes below — generating them against the
current shared array would produce two images (`bf-female-15`, `bf-female-40`'s neighbours) the
code cannot yet display, and the code would still ask for a `bf-female-10` that was never drawn.
This is a one-line code fix (out of this task's scope) that should land before or alongside the
art.

### 0.2 Format: SVG with `currentColor`, not a second PNG colourway

The limelight icon bank (`src/skins/limelight/icons.ts`) solves the multi-ground problem by
shipping **two PNG colourways per icon that needs one** — a base icon (dark ink, for the lime
ground) and a `...Panel` variant (lime ink, for a black panel) — because a raster PNG cannot
recolour itself. That convention exists for limelight-only decoration sitting on exactly two
grounds it controls.

The 24 register icons are different: they render inside `SetupWizard`, which is **shared chrome**
across all three skins, so the ground under a `comfort-2-machines` icon is lime, `#0a0b0c`
(clinical), or `#0b0b0c` (board's panel) depending on which skin is active — a light ground and two
near-identical dark ones. Two fixed PNG colourways would work, but a single-colour **SVG using
`fill: currentColor`** is strictly better: one file, no duplicate export, and it inherits whatever
text colour the active skin already sets on its ancestor, with no separate "Panel" fork to keep in
sync. This is also what the brief's own style constraint already implies ("a single-colour
silhouette that takes `currentColor` survives all three grounds").

**Consequence for generation:** Nano Banana (`agy`) outputs raster PNG/JPG, not SVG, and none of
the icons below is complex enough to need AI generation of the final asset. **Recommendation:**
skip the AI-image step for this batch and hand-author the SVGs directly — every depict in section 1
is a single closed silhouette or a handful of straight/curved strokes, well within reach of a
30-60 minute pass in Inkscape or by hand-editing `<path>` data, and a hand-drawn path is exactly
reproducible and diffable in a way a traced AI raster is not. If AI generation is preferred anyway
(e.g. to nail a specific pose), generate a **pure black silhouette on white, no anti-aliasing
requested, no gradient** per the prompts in the companion file, then vectorize (Inkscape's
"Trace Bitmap", threshold mode) and hand-clean the path before committing — never ship the raster
trace directly. No existing script builds this pipeline (`scripts/inline-icons.mjs` is hard-coded
to the limelight bank's exact 21+4 file counts and 32 px / 256 px sizes); a new small
`icons.ts`-style module (or plain `.svg` files imported as React components) is new, small
plumbing this task does not build.

### 0.3 The four mascot illustrations exist, are wired nowhere, and one placement was deliberately vetoed

`src/skins/limelight/illustrations.ts` ships four 256x256 mascot poses (`mascotCrown`,
`mascotFlop`, `mascotLifting`, `mascotResting`), generated 2026-09-01, documented in
`docs/design/round3/2026-09-01-round3-plan.md` section 5 with an intended home for each: lifting on
Today (the "not started yet" hero), crowned beside the personal-record stamp, flopped on a week
retrospective, resting on the missed-week intervention.

A repo-wide grep for every one of those four names, outside test files, returns nothing. `Today`
(`TodayView.tsx`), the PR stamp (`WeekStamp.tsx`) and the missed-week screen (`Intervention.tsx`)
all render today using the small flat pixel-art icons (`crown`, `sparkle`, `heart`) instead. For
`Intervention.tsx` this is not an oversight — its own header comment states the rule structurally:

> the PICTURE is not the flopped mascot. This file imports no illustration at all, so the flop pose
> cannot reach this screen by an edit that looked harmless. A collapsed mascot shown to someone who
> missed a week is the picture version of a joke about the user, and round two found that a lever
> in a picture cannot be argued away by the words beside it.

That veto is recorded and correct, and this manifest does not reopen it. It has **no equivalent
comment for `mascotLifting` or `mascotCrown`** — those two simply are not imported anywhere, with
no note saying why. **Decision needed:** wire `mascotLifting` into `TodayView`'s hero and
`mascotCrown` beside `WeekStamp` per round three's original placement, or leave them as an
intentionally-orphaned asset bank and say so in a comment the way `Intervention.tsx` does, so the
next reader does not re-discover this gap by grepping. No new art is needed either way — this is a
wiring decision, not a generation one.

### 0.4 Specimen cards are text-only by design; a category glyph is optional, not assumed

`SpecimenCard` (`src/content/specimenCards.ts`) carries no image field, and `AtlasView.tsx` draws
every card — owned or locked — as typography inside a coloured frame (`role="img"` on the locked
state is the card's rarity + "Undiscovered" text, not a picture). Nothing in the plans or the
briefs asks for card art. A small glyph per `SpecimenCategory` (anatomy, biology, biomechanics,
history, nutrition, recovery, supplements, training — 8 categories) is a plausible enhancement, not
a gap: it is not specified here, and no prompt is written for it in the companion file. Flagged so
the owner can say yes or no rather than have it silently decided by omission.

---

## 1. Setup-wizard control icons (24, from the icon register)

All 24 already exist as fully specified rows in `docs/design/2026-09-04-icon-register.csv` — this
manifest does not re-specify them, only carries them forward with the format decision from §0.2
applied and the discrepancy from §0.1 flagged. Every row below renders behind an `ArtworkPlaceholder`
today (`src/ui/setup/SetupWizard.tsx`, `.wiz-placeholder-frame` in `src/ui/setup/setup.css`, 64x64
CSS px for comfort/tape sites, 44x76 for the body-fat chart's torso frames) and must read correctly
at 24 px per the register's own constraint, since a slider or a chart frame can render smaller than
its CSS box on a narrow phone.

**Format for every row in this section:** single-colour SVG, `fill="currentColor"` (or `stroke`
for the line-drawing rows), no fixed hex baked in. See §0.2.

| id | where | control | why | purpose | status |
| --- | --- | --- | --- | --- | --- |
| `comfort-1-starting` | `SetupWizard.tsx` step `training`, Gym Comfort slider position 1 (Brief F Part 1b) | Gym Comfort slider, lowest position | C1.09.7 — the slider needs a wordless anchor per position, verified against the label | one glance says "someone new to a gym floor" before the label text is read | specified |
| `comfort-2-machines` | same slider, position 2 | Gym Comfort, middle | C1.09.7 | reads as "the machine-comfortable regular," distinct from free weights | specified |
| `comfort-3-freeweights` | same slider, position 3 | Gym Comfort, highest | C1.09.7 | reads as "confident under a loaded bar" | specified |
| `tape-neck` | `SetupWizard.tsx` step `body`, tape method (Brief B Part 2, `ArtworkPlaceholder label={t('quantity.neck')}`) | neck girth measurement site | C1.08.5 — a tape site is easy to place wrong from text alone | shows exactly where the tape sits so a self-measurement is repeatable | specified |
| `tape-abdomen-male` | same step, sex `male` | Abdomen II site (umbilicus) | C1.08.5 | shows the correct horizontal band on the male protocol | specified |
| `tape-abdomen-female` | same step, sex `female` | Abdomen I site (minimal width) | C1.08.5 | shows the female protocol's different landmark, which the text alone conflates with the male one if unillustrated | specified |
| `tape-hip` | same step, sex `female` only | hip girth site | C1.08.5 | shows the greatest-protrusion landmark, a judgement call the tape alone doesn't communicate | specified |
| `equip-1-bodyweight` | intended for the Equipment Access slider (`EQUIPMENT_ACCESS_OPTIONS`, Brief F Part 1c) — **not yet rendered**; no `ArtworkPlaceholder` call exists at that slider today (verified by grep; only the Gym Comfort slider renders icon placeholders) | Equipment Access, position 1 | C1.09.11 | anchors "body weight only" against the four higher positions | specified, integration pending (code gap, not an art gap) |
| `equip-2-home-bodyweight` | same slider, position 2 | Equipment Access, position 2 | C1.09.11 | anchors the first combination tier | specified, integration pending |
| `equip-3-home` | same slider, position 3 | Equipment Access, position 3 | C1.09.11 | anchors "home gym" | specified, integration pending |
| `equip-4-full-home` | same slider, position 4 | Equipment Access, position 4 | C1.09.11 | anchors the second combination tier | specified, integration pending |
| `equip-5-full-gym` | same slider, position 5 | Equipment Access, position 5 | C1.09.11 | anchors "full gym" | specified, integration pending |
| `bf-male-10` … `bf-male-35` (6 rows) | `BodyFatChartModal`, `SetupWizard.tsx` line ~740, male row | body-fat visual-estimate chart | C1.08.5, C1.08.9 — "compare against the pictures and pick the closest" needs pictures | lets the user place themselves without a tape, while the copy right above it (`BODY_FAT_CHART_INTRO`) tells them not to trust the placement too far | specified |
| `bf-female-15` … `bf-female-40` (6 rows) | same modal, female row | body-fat visual-estimate chart | C1.08.5, C1.08.9 | same as above, for the female row | specified, art can proceed — code fix queued (fc, behind brief F) |

**How the art must signal "orientation, not instrument" (the accuracy constraint):** lay
self-estimation of body fat against a photographic reference agrees with measured values at
kappa 0.20-0.31 (weak agreement; sourced in the round-1 body-fat research pass,
`agy-artifacts/research-bodyfat-chart.md`, logged in `REFERENCES.md`). The chart must not look like
a calibrated instrument. Two choices carry that: (1) render every torso as a **flat, generic
silhouette** — no muscle striation, no skin texture, no photographic shading, exactly the
"flat silhouette, front view, uniform lighting, no face" the register already specifies — because
detail reads as precision, and a silhouette reads as a rough shape; (2) keep it in the **same
low-fidelity register as the rest of the app's art** (the limelight icon bank's own words: "coarse
32 x 32 grid, hard-edged pixels"). A body-fat chart drawn in a more refined style than the app's
existing icon language would look more authoritative than its own accuracy warrants, which is the
opposite of what the copy right beside it says.

---

## 2. PWA / home-screen icons

| id | where | why | purpose | spec | status |
| --- | --- | --- | --- | --- | --- |
| `app-icon` | `vite.config.ts` (`VitePWA.manifest.icons`), `index.html` (`<link rel="icon">`, `<link rel="apple-touch-icon">`); files at `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | the icon a user sees on their Home Screen and app switcher — the first and most repeated brand impression the app makes | the app has an identity distinct from whatever it was ported from | 192x192, 512x512 (`purpose: any`), 512x512 (`purpose: maskable`, safe content inside the inner ~80% circle per the maskable-icon spec), full colour, must read as a mark at 48 px (Android's smallest shown size) | **specified** — ruled, §2.1 |

**Why this is flagged rather than just "exists":** all three files are present and are not blank —
opened and inspected (192px and 512px, RGBA, 351-477 unique colours each) — but they depict a
neon-green triangle logo over the caption **"W.CONSOLE"**, which is this repository's `legacy/`
console app, not FixThisInjustice. `docs/plans/2026-09-01-01-foundation.md` confirms these three
files were `git mv`'d from `legacy/` in the first commit and never redrawn. Two independent
problems: it is the wrong app's brand, and it bakes text into the artwork, which this task's own
constraint bars for anything a translation or a contrast check needs to reach (a home-screen icon
is exactly that surface — Android and iOS both render it at sizes where "W.CONSOLE" is illegible
anyway, so the baked text buys nothing even on its own terms).

**What needs deciding, not drawing, first:** what the mark should *be*. Two defensible directions,
both usable with existing, already-original IP:
1. A simplified, single-shape mark derived from the mascot's own crown-and-barbell motif
   (`mascotCrown`/`mascotLifting`, `docs/design/round3/2026-09-01-round3-plan.md` §5's palette:
   `#000000`, `#FCA3BE`, `#BB5F7B`, `#6D6D6D`, `#242424`) — consistent with the app's one existing
   character.
2. An abstract mark with no character at all (e.g. a stylised barbell or a checkmark-on-bar),
   safer against the maskable-icon crop and against ever needing to redraw the mascot.
Once the owner picks a direction, this becomes a `specified` row with a prompt in the companion
file; a proposed prompt for direction 1 is included there as a starting point to react to.

**§2.1 Ruled: direction 1, and a third colour, not either one the draft prompt offered.** Neither
`#8ace00` (limelight's own `--lime`, one skin only) nor the mascot's round-3 palette is the app's
cross-skin identity. `vite.config.ts`'s `VitePWA` manifest already declares `theme_color: '#a3e635'`
and `background_color: '#0a0b0c'`, and `index.html` repeats `#a3e635` in its `theme-color` meta —
this is `--accent` (`src/ui/styles/tokens.css:39`), the one colour every skin carries, documented
there as canonical over `--lime`. Android reads `theme_color` for the icon's own surrounding chrome,
so an icon in a different green would sit next to a UI chrome in this one. **Mark: `#0a0b0c` figure
on `#a3e635` ground** — matching what the PWA manifest already ships, not introducing a fourth
colour. Prompt updated in the companion file (was: a colour choice between two options neither of
which was this one).

| id | where | why | purpose | spec | status |
| --- | --- | --- | --- | --- | --- |
| `notification-badge` | `src/sw.ts` line 75 (`badge:`) | Android's status-bar and lock-screen badge for a reminder or rest-timer notification | at a glance, in a notification tray with a dozen other apps' badges, which one is this app's | **96x96 px PNG, monochrome silhouette on a transparent background, no colour, no text, no fine internal detail** (Android auto-masks and recolours it; MDN / web.dev, logged in `REFERENCES.md`) | **specified** — same mark as `app-icon` (§2.1), silhouetted; still needs the `src/sw.ts` pointer changed off `icon-192.png`, fc's `src/` edit |

**Why this is a real gap, not a nicety:** `docs/plans/2026-09-01-00-master-plan.md` and the
prose-pass doc both already flag it — `src/sw.ts` currently points `badge` at the same full-colour
`icon-192.png` used for the app icon. A full-colour icon is not what Android's badge slot expects;
some Android versions will still render it (heavily downsampled and desaturated by the OS), others
render a generic bell instead. Either outcome is silent — nothing errors — so this has shipped
unnoticed. It should be drawn as its own asset once the app-icon direction is picked, not
approximated from the colour icon.

---

## 3. Limelight decorative icon bank (existing, no new work)

`src/skins/limelight/icons.ts`: 21 files, 32x32 pixel art, inlined as base64 PNG, 8072 B decoded
total, generated with Gemini via `agy` on 2026-09-01, licence `original, this project`. Sixteen
names (`alert`, `barbell`, `crown`, `drop`, `fan`, `heart`, `heel`, `lips`, `martini`, `megaphone`,
`nails`, `pause`, `skip`, `skull`, `sparkle`, `stopwatch`) plus five `...Panel` recolours
(`barbellPanel`, `crownPanel`, `megaphonePanel`, `sparklePanel`, `stopwatchPanel`) for sitting on an
inverted black panel rather than the lime ground. All 21 are consumed today (`App.tsx`'s
`VIEW_ICONS`, `WeekStamp.tsx`, `Marquee.tsx`, `Intervention.tsx`'s title icon via `ICON_FOR_KEY`).
**Status: exists. Limelight-only** — clinical and board have no icon bank of their own and none is
implied: both skins carry their register through typography and layout, not iconography (confirmed
by `find src/skins` — no `clinical/` or `board/` directory exists alongside `limelight/`).

## 4. Limelight mascot illustrations (existing, orphaned — see §0.3)

`src/skins/limelight/illustrations.ts`: 4 files, 256x256, 13528 B decoded total, same generation
batch and licence as above. `mascotCrown`, `mascotFlop`, `mascotLifting`, `mascotResting`.
**Status: exists**, consumed nowhere in application code today; see §0.3 for the wiring decision
this manifest surfaces rather than resolves.

## 5. ASCII figure

| id | where | why | purpose | status |
| --- | --- | --- | --- | --- |
| `intro-figure` | `src/content/introSlides.ts`, `INTRO_FIGURE`, rendered on intro slides 1-4 by `IntroSequence.tsx` | replaces a named cartoon character the owner's brief specified, which is third-party IP; README's Licences section requires original art here | a small flexing stick figure that keeps the intro warm without borrowing anyone's IP | exists |

Four lines by seven columns, well inside the brief's 8-line by 20-column ceiling — there is room
for something larger if wanted. No second ASCII slot exists anywhere else in the codebase (checked
`src/content/*.ts` and `src/ui/**` for any other multi-line string literal rendered as
preformatted text); more ASCII is a stylistic option to raise with the owner, not a gap this
manifest is specifying against. No prompt is written for "more ASCII" in the companion file for
that reason — it needs a "yes, and where" before it is a spec.

## 6. Sound effects (specified, zero files shipped — see `docs/sfx.md`)

Not an image-generation task: these are sourced (Kenney/Freesound/OpenGameArt, all CC0, per
`docs/sfx.md`'s own candidate list) or recorded, then transcoded to AAC/`.m4a`. Slot names are
fixed by `src/skins/sfx.ts` and are not this manifest's to invent; reproduced here only as a
pointer, not re-specified:

| id (fixed name) | fires when | character (from `docs/sfx.md`) | length | status |
| --- | --- | --- | --- | --- |
| `session_done` | a session ends `completed` | the one celebratory sound; a short rising figure | 1.2-2.0 s | specified |
| `pr_stamp` | the week stamp lands (met or beaten week) | a hard percussive stamp, bright tail, timed to a 700 ms landing | 0.8-1.2 s | specified |
| `rest_over` | rest countdown reaches 0 | the only *functional* one — audible in a gym, not like a notification | 1.0-1.5 s | specified |
| `intervention_open` | missed-week modal opens | soft and low, never a sting | 1.0-1.5 s | specified |

Each is needed **per skin** (`public/sfx/<clinical|limelight|board>/<name>.m4a`) — skins do not
share files, and a skin with none is simply silent, which is a supported state. Budget: 60 KiB per
file, 240 KiB per skin's set (`scripts/check-sfx-size.sh`). Whether all three skins get a distinct
character (e.g. board's stamp reading more mechanical, limelight's louder) or all three reuse one
take is a taste call for whoever sources them, not specified here.

## 7. Motivation video (specified, zero files shipped — see `docs/motivation-video.md`)

| id | where | why | spec | status |
| --- | --- | --- | --- | --- |
| `motivation-clip` | `public/media/motivation.mp4`, played by `MotivationModal.tsx` after a week closes below its session target | the app's one non-textual "the coach cares" moment (intro slide 3 names it: "something that berates you when you slack off") | H.264 + AAC in `.mp4`, `yuv420p`, `+faststart`; must start silently and play inline (`playsinline muted autoplay loop`, unmutes on tap); guidance ceiling 25 MiB, hard CI ceiling 100 MiB | specified |

Real footage the owner supplies, not an AI-image or AI-video generation target — no prompt is
written for it in the companion file.

## 8. Specimen / Atlas cards — category glyphs, ruled yes (§0.4)

`src/content/specimenCards.ts`, 37 cards (12 common, 13 uncommon, 12 rare), rendered by
`AtlasView.tsx` as coloured typography, no image field on `SpecimenCard` today. §0.4 flagged an
optional per-category glyph rather than assuming it; **the owner said yes.**

| id | category | status |
| --- | --- | --- |
| `glyph-anatomy` | anatomy | specified, Batch E |
| `glyph-biology` | biology | specified, Batch E |
| `glyph-biomechanics` | biomechanics | specified, Batch E |
| `glyph-history` | history | specified, Batch E |
| `glyph-nutrition` | nutrition | specified, Batch E |
| `glyph-recovery` | recovery | specified, Batch E |
| `glyph-supplements` | supplements | specified, Batch E |
| `glyph-training` | training | specified, Batch E |

Same format ruling as §0.2: SVG, `currentColor`, one flat pictogram-register shape per category, no
text. Wiring an image field onto `SpecimenCard` and rendering it in `AtlasView.tsx` is a follow-on
`src/` task once the art exists — not done from this session; handed to fc alongside the mascot
wiring and the `sw.ts` badge pointer.

---

## 9. Round-2 additions (from the owner's feedback, flagged by fc before the ledger landed)

Two rows added to `docs/design/2026-09-04-icon-register.csv`. Both target files are `unknown`
pending the ledger `brief H` is producing — per that brief's own rule, `unknown` beats a guess.

| id | source claim | why it's here | status |
| --- | --- | --- | --- |
| `sprite-subsection-marker` | r2.12: "a small emoji type as height as the text of the subsection, an emoji wearing a black bob and with eyeglasses (Azealia Banks meme)" | The named reference is a real public figure plus a meme — cannot ship as drawn, third-party likeness, contradicts README's originality claim the same way the earlier cartoon-character request did (§5, `intro-figure`). Depicts an **original** character carrying only the two visual traits named (bob, eyeglasses), no other resemblance. | **needs-decision**: confirm the substitution (original character, same two traits) is acceptable before generating, since it is a correction against what was literally asked, not what was asked |
| `reset-cookies-icon` | r2.19: "Click on the {icon that I will provide as an asset}" (browser cookies-and-site-data reset) | Owner-supplied. Tracked here only so nothing gets drawn twice — no prompt is written for it and none should be. | owner-supplied |

**Lower priority, not a register item:** r2.18 (a section on shoes and baby powder) — the owner said
that where no reference exists he'll supply his own recommendation. When that batch is worked, flag
which claims have no citable source rather than reaching for a weak one; this is a content-sourcing
note, not an asset.

---

## 10. SpriteAI character animation (owner-drawn layers, script-composited)

Not part of the round-2 register — a separate character asset the owner drew and animated
alongside it, tracked here so it isn't lost. Method and pitfalls are written up in full in
**[`docs/design/2026-09-06-layered-sprite-animation-guide.md`](2026-09-06-layered-sprite-animation-guide.md)**,
the reusable how-to for this technique; this entry is only the asset's own record.

| id | where | what | status |
| --- | --- | --- | --- |
| `spriteai-vasileios-layers` | `agy-artifacts/SpriteAI_Vasileios/{HairandFace,OnlyHair,Sunglasses,Only_face,Character_Combined}_32x32px.png` | five owner-drawn layers (base, hair overlay, sunglasses, hairless face, static reference), 32x32 each, verified to composite back to the reference within single-digit pixel drift | exists |
| `spriteai-vasileios-jolt-animation` | `agy-artifacts/SpriteAI_Vasileios/sprite-40x40px-11f-sheet.png` (160x120, 11 frames of 40x40) and `Untitled-sprite-40x40px-11f.gif` (11 frames, 130ms each) | sunglasses slide down revealing the owner's drawn eyes, head-jolt with a row-sheared hair reaction, settle — built via `scripts/make-sunglasses-jolt-spritesheet.py`, then refined by the owner to 11 frames | exists, final |

**Licence:** original, this project — same standing as every other asset in this manifest.

## Summary

| type | exists | specified, ready | needs-decision |
| --- | --- | --- | --- |
| Setup-wizard control icons (§1) | 0 | 24 (all — female row's code fix is queued, not blocking) | 0 |
| PWA / notification icons (§2) | 0 | 2 | 0 |
| Limelight icon bank (§3) | 21 | 0 | 0 |
| Mascot illustrations (§4) | 4 | 0 (art done; wiring is fc's `src/` task) | 0 |
| ASCII (§5) | 1 | 0 | 0 (open stylistic question, not specified against) |
| Sound effects (§6) | 0 | 4 slots x 3 skins | 0 |
| Motivation video (§7) | 0 | 1 | 0 |
| Specimen cards (§8) | 37 (text) | 8 (category glyphs) | 0 |
| SpriteAI character animation (§10) | 7 files (5 layers + sheet + gif) | 0 | 0 |

**All four §0 decisions are ruled** (2026-09-06, owner via the asset-intake peer session): SVG
format, mascot wiring on, app-icon direction 1 with the accent-matched colour in §2.1, category
glyphs yes. **Total drawable/generatable image assets specified and ready now: 32** — the 24
register icons, the app icon, the notification badge, and the 8 category glyphs. Prompts for the
original 18 plus the app icon are in the companion file, `docs/design/2026-09-06-asset-prompts.md`;
the 6 female body-fat, the notification badge and the 8 category glyphs still need prompts written
there.
