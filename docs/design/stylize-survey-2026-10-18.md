# Stylize survey: FixThisInjustice (limelight), 2026-10-18

Read-only. Tags: [READ file:line], [MEASURED] = ran it here, [INFERRED], [U] = unverified (no device render done).
Contrast figures are quoted from tokens.css (round-3 section 2.3), not recomputed.

## Premise corrections (read first)
- mascotLifting and mascotCrown ARE wired, commit 8c12438 (2026-09-06): TodayView.tsx:325 (in-progress hero only, 72 px), WeekStamp.tsx:93 (64 px). [READ]
  - What is missing is round 3's intended spot for lifting: the "not started yet" hero (asset-manifest §0.3). The planned hero (TodayView.tsx:350-376) has no mascot. mascotResting is still unused. [READ]
- The 32 SVGs in src/assets/art/ (commit 5c41912, 2026-10-18, "Not wired yet; pending owner review") are imported nowhere: `grep -rn "assets/art\|\.svg" src` finds no import. [MEASURED]
  - Their viewBoxes are 10x the spec units (440x760, 640x640, 480x480 vs 44x76/64x64/48x48). Same aspect ratio, so harmless. [MEASURED]
- The owner's 11-frame sprite (agy-artifacts/SpriteAI_Vasileios/sprite-40x40px-11f-sheet.png, 2761 B, 13 colours, true 40x40 grid, manifest §10 "exists, final") is wired nowhere. [MEASURED]
- public/icons/apple-touch-icon-180.png and notification-badge-96.png exist but are unused. index.html:12 still points apple-touch at icon-192; sw.ts:75 badge = full-colour icon-192 (Android paints a badge as an alpha mask, so this shows as a white blob [INFERRED]). [READ]

## Cross-cutting defect the stylization should fix, not decorate around
- Pink as type on lime (1.41:1, banned at every size by tokens.css:159) is live in:
  - views.css:24-31 `.view h2` (every view heading), appShell.css:224-227 active nav tab, appShell.css:107-117 `.banner button`, :124 update tag, :164-171 `.recovery button`
  - train.css:149 `.vmod-link`, :397 `.train-deload`, :499 bonus set marker
  - motivation.css:33 `.mmod-title` (the missed-week popup's own title), toastQueue.css:71 `.toast-tag`, :126 `.toast-action`
  - views.css:335 current plan chip, :421 `.ps-cursor`; setup.css:955-961 the user's typed name; intro.css:120 figure; phaseTransition.css:53 art. [READ; grounds traced to bg/bg-2 = lime]
- Undefined tokens with live hex fallbacks: `--bad` (views.css:129 `.view-error` text, :220, :227 refusal banner tag, :300 skipped glyph: all render #f87171, an unmeasured red on lime) and `--line-1` (appShell.css:208, phaseTransition.css). AGENTS rule 5. [MEASURED: token list in tokens.css]
- `.ll-display` (the brat type: narrow Archivo, weight 800, pink offset shadow) is used once in the app (WeekStamp.tsx:94). `.ll-panel` (the lit black sign) is used once (Marquee.tsx:54). The skin's signature is almost absent from daily screens. [MEASURED grep]
- The Archivo wdth axis (62-125 %) is self-hosted, so `--display-stretch: 62%` really renders. [READ node_modules/@fontsource-variable/archivo/standard.css]

## Ranked top 10 (impact for cost)
Each item lists: where / now / treatment / why / cost / risk / art.

1. Brat headings
- Where: views.css:24 `.view h2`; views.css:168 `.hero-name`; Train h2 (TrainView.tsx:336); Settings/Export h2s.
- Now: pink uppercase h2 at 1.41:1; plain 1.4 rem hero.
- Do: ink type with `.ll-display` (stretch 62 %, weight 800, 4 px pink offset shadow). Never on a heading that carries a numeral (tokens.css:276-277), e.g. `FORMAT.pausedSince`, which contains a date.
- Why: brand on every screen, and it fixes the banned ratio.
- Cost S. Risk: the 62 % cut wraps differently; check at 320 px. Art: none.

2. Pink sticker states (sweep)
- Where: the pink-type list above; first the active tab (appShell.css:224).
- Now: active tab = pink text and border on lime, about 1.41:1, so the current view is nearly invisible. [INFERRED from CSS; no device check]
- Do: active tab and current chip get a pink FILL with ink text (7.75:1) plus a 2 px ink border. Links and secondary buttons become ink type with a pink offset underline. Replace the `--bad`/`--line-1` fallbacks with real tokens.
- Why: orientation and legibility.
- Cost S. Risk: test snapshots and colour tests change. Art: none.

3. Rest panel as the lit sign, plus a "rest over" flash
- Where: RestTimerPanel.tsx:175-205; train.css:348, :364, :520.
- Now: 64 px ring on lime with a 3 px pink arc (1.41:1). The label icon is `stopwatchPanel`, whose outline measures #8ace00 [MEASURED], drawn on lime, so it disappears. At 0 s nothing changes visually.
- Do: add `.ll-panel` (round 3 named the rest panel as an inverted panel, tokens.css:287). Lime track, pink arc (7.75:1), white tabular digits. At remaining <= 0 the panel flips to a pink fill with the ink word `notification.restOver`: 3 pulses at <= 2 Hz (WCAG 2.3.1), then steady. Reduced motion: steady fill, no pulse.
- Why: feedback at the gym with sound off (no sfx files ship, STATUS "Never done").
- Cost S-M. Risk: the arc changing in real time is a clock, not a tweened quantity; keep the digits un-animated. Art: none.

4. Wire the 2026-10-18 art
- Where: SetupWizard.tsx:583 ArtworkPlaceholder, :1061 chart frames, :3049/:3087 slider ticks; AtlasView card; index.html:12; sw.ts:75.
- Now: dashed empty frames; 32 committed SVGs unused.
- Do: inline as currentColor SVG at the existing frame sizes (64, 44x76, 20 px), so nothing reflows. Use apple-touch-icon-180 and notification-badge-96.
- Why: setup is the first impression, and the sliders get wordless anchors (C1.09.7).
- Cost M. Risk: the commit says "pending owner review" and AGENTS says "Art is his", so the owner's yes gates this. Check the 20 px slider ticks for specks. Art: exists.

5. Today hero pose map (existing art)
- Where: TodayView.tsx:319-405.
- Do:
  - planned: mascotLifting (round 3's original "not started" spot)
  - in-progress: lifting (already there)
  - completed ("ate."): mascotResting
  - rest day ("day off, apparently."): mascotResting
  - programme complete: mascotCrown
  - skipped and paused: none (no picture beside a skip or a pause, which may be illness)
  - flop: never on Today.
- Why: every daily state gets a face; the resting pose has been orphaned since 2026-09-01.
- Cost S. Risk: on the planned hero the mascot pushes the session list down by 72 px; use 56 px there. Art: exists.

6. One status-mark system for the Today strip and the Log grid
- Where: TodayView.tsx:108-130 StatusGlyph; ComplianceGrid.tsx:51-66, 172-181; views.css:295-302.
- Now: completed = pink check stroke (1.41:1); skipped = #f87171 via the missing `--bad`; in the grid, skipped (#454545 fill) vs missed (#000 fill) differ only by luminance.
- Do: one `StatusMark` component (AGENTS rule 2: derive, never copy), pixel-grid currentColor SVG at 12 px:
  - completed = pink chip with an ink check
  - skipped = ink diagonal hatch
  - missed = ink X on white (`--highlight-bg`)
  - planned = ink outline
  - rest = dash
  - paused = the existing hatch.
- Why: shape carries state (WCAG 1.4.1), and the same marks appear across views.
- Cost S-M. Risk: ComplianceGrid uses inline styles; move them to CSS. Art: hand-drawn 12x12 paths, no generation.

7. The owner's sprite, animated
- Where: RestWordGame.tsx:212 PixelMascot (win and idle); IntroSequence.tsx:154 INTRO_FIGURE (pink ASCII on lime, proportional font, about 1.41:1).
- Do: CSS sprite on the 4x3 sheet with 11 keyframes and `steps`, at 130 ms per frame (gif timing, manifest §10), shown at an integer 2x = 80 CSS px with `pixelated`.
  - Rest-game win: play once.
  - Intro figure slides: idle loop.
  - Reduced motion: frame 0, static.
- Why: the intro credits say the owner hand-drew the pixel art, and his art is currently nowhere in the app.
- Cost S-M. Risk: the intro figure constant sits in introSlides.ts (owner's file), but the figure is agent code, not his words (rule 4 covers words); say so in the commit. Art: exists, inline it as a data URI (CSP img-src allows data:, cspPlugin.ts:95).

8. Atlas specimen cards as collectibles
- Where: AtlasView.tsx:178-219; atlas.css:104-115; toast specimen kind (ToastQueue.tsx:357-363).
- Now: text cards. Rarity is a 3 px left border: common #454545, uncommon ink (`--info`), rare pink, so common and uncommon read alike and rare sits at 1.41:1.
- Do:
  - owned = black panel card with its category glyph (exists, currentColor in lime)
  - rare = pink offset-shadow block plus a one-shot CSS foil sweep (linear-gradient translate, 600 ms) when the dialog opens
  - uncommon = lime double rule
  - locked = dashed frame with a pixel "?" (no category leak)
  - the specimen toast carries the same glyph.
- Why: collection delight; 37 cards. [MEASURED count]
- Cost M. Risk: SpecimenCard has no image field; map category to glyph in UI only, no schema change. Art: exists, plus one "?" mark (hand SVG).

9. Toasts and modals as lit-sign panels
- Where: toastQueue.css:28-75; motivation.css:33; phaseTransition.css:30-57; konami.css:36-56; boot.css:30.
- Now: lime cards with a pink 2 px left rule and pink tags (1.41:1). The ASCII art in Konami, Phase and Boot renders in Archivo, which is proportional, so the boxes misalign. train.css:687 already notes this and fixes it for the game only.
- Do: toast = `.ll-panel` with a pink tag (7.75:1). Missed-week modal title = ink display type and NO picture (Intervention.tsx veto spirit). ASCII blocks use `ui-monospace`.
- Why: legibility and one consistent "sign" language for interruptions.
- Cost S. Risk: none beyond restyling; no copy change. Art: none.

10. Ordered-dither wipe (the one shader worth having)
- Where: three rare moments: boot to app (Boot.tsx), PhaseTransition open (once per block), WeekStamp land.
- Do: a 4x4 Bayer threshold wipe, pink to transparent, about 600 ms.
  - Canvas 2D at 1/8 resolution scaled with `pixelated`; a WebGL fragment shader gives the same look but needs a context-loss path.
  - rAF loop stops on finish and on `visibilitychange` hidden.
  - Reduced motion or no canvas: instant cut, which is today's behaviour, so the static fallback already exists.
- Why: delight, and it matches the pixel-art language.
- Cost M. Risk: must not cover or animate the stamp's numbers (section 2.5). Bundle-only code satisfies CSP script-src 'self'. Art: none.

## Also considered (ranked below the 10)
- Nav pictograms: 7 view icons (today, the run, showtime, the numbers, the archive, the collection, backstage) above short labels. Fits 7 tabs in about 364 px at 52 px each. Cost M. NEW ART: 7 pixel-grid currentColor SVGs, 16-unit grid, shown at 20 CSS px; reuse `barbell` for Train.
- Marquee chasing bulbs: a border of radial-gradient dots on `.ll-marquee-strip` (limelight.css:33), `steps(2)` at 1 s, static under reduced motion. Cost S. Round 3 calls the marquee "a lit sign" (tokens.css:287).
- Print-grain texture on the lime ground: a 64 px greyscale noise tile as a data URI, multiply, alpha <= 4 %. Cost S. Risk: it lowers contrast under fine print (#454545 at 4.98:1 has little headroom); measure before shipping.
- Crash screen with mascotFlop: RootErrorBoundary.tsx:152 "The app could not start". There the app collapsed, not the user. Never on :144 "Stored data cleared" (data loss is not a joke). Cost S. Owner call.
- Empty states: a small component with a dashed frame, an existing pixel icon and the note, for advice.noSetsLogged (PRList.tsx:64), noBodyMassLogged (LogView.tsx:174), noWeeksYet (ComplianceGrid.tsx:137), hero.noPlan (PlanView.tsx:232). Cost S.
- Time-capsule seal: pixel padlock and opened-envelope marks for `.capsule-sealed` / `.capsule-openable` (TimeCapsule.tsx:327, :345). NEW ART: 2 pixel PNG pairs at 32 px (base and Panel), or currentColor SVG.
- AsciiBar (TargetsView.tsx:240, :256): `[###---]` in a proportional font. Replace with a segmented block bar (CSS, static, role=img kept). Cost S.
- Mascot sampling: the 256 px mascots are not on an integer grid (horizontal run lengths 1, 2, 3, 5 px [MEASURED]), so `pixelated` at 72 / 56 px (limelight.css:268) drops and doubles rows unevenly. Either use `image-rendering:auto` for the mascots, or regenerate them on a true 64-cell grid.
- Exercise movement-pattern icons on ExerciseCard: deferred. There is no pattern field on stored exercises; `role` is a free string "for readability and debugging only" (templates.ts:32). Needs a new id-to-pattern map plus about 6 icons. Cost L.

## Rejected
- Animated full-screen WebGL ground (plasma or lime shader):
  - Train holds a Screen Wake Lock for the whole session (TrainView.tsx:86), so the GPU would run 45-90 min on a phone lying on a bench.
  - The design budget is one moving strip per screen (TodayView.tsx:414).
  - There is no reading the ground needs help with.
- Any mascot pose on the missed-week popup or Intervention, including resting or lifting: the round-two finding ("a lever in a picture cannot be argued away", Intervention.tsx header) is about pictures, not only the flop. The fix there is typographic (item 9).
- Reviving the CRT scanlines (crt.css:21-22): 2.2 % white lines on lime are invisible, and the legacy console look fights the one-Pantone flyer direction.
- Count-up or animated numbers on the PhaseTransition stats or the stamp counts: banned by round-3 section 2.5 (tokens.css:276-277).
- Lottie or another animation library: CSP and offline gains nothing over CSS `steps()` on an existing sprite.

## New-art summary
- Top 10: no generated art needed. Items 4, 5, 7 and 8 use existing files. Items 6 and 8 need small hand-drawn SVG marks (a status set and a "?").
- Below the 10: 7 nav pictograms and 2 capsule marks.

## Not done
- No device or browser render, no screenshots, no gates run, no contrast recomputation (ratios quoted from tokens.css), no edits to the repo.
