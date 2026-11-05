# P4 design brief: phone-first shell and cross-view polish (limelight, refined)

Agent doc, 2026-11-04. Input to the P4 plan (`docs/plans/2026-11-04-aaa-rebuild-spec.md`, R6, P4) and to the P5/P6 tasks that share its surfaces. Evidence: `docs/design/critique-2026-11-04.md` (defects D1-D15 = its ranked list), screenshots in `docs/private/design-2026-11-04/` (gitignored), metrics `metrics-*.json` there. System record: `DESIGN.md`. Wording is out of scope: no item changes a copy string; the one new key it needs (`nav.more`) is flagged for the owner.

Tags: [MEASURED] this run (headless Chromium, iPhone 13 390x664, Pixel 7 412x839, 320x640); [READ file:line]; [INFERRED]. Chromium cannot emulate safe-area insets, the iOS keyboard or Android back: those acceptances need the owner's phone and say so.

## 0. Rulings (owner wants rulings; each names the rejected alternative)
- **Refine, not redesign.** Palette, Archivo display cut, pink stickers, lit-sign panels, her sprite, icon bank, owner copy all stay. Rejected: a dark ground for dim gyms (owner pinned limelight; ink on lime is 10.91:1; dim light is served by larger type, item 4).
- **Frame = two black bands.** One-line black header (top) + fixed black tab bar (bottom). Rejected: sticky top tab strip (7 labels need 854 px [MEASURED]; top edge is the far reach for one thumb). Rejected: lime tab bar (blends with content, needs a heavy rule to read as chrome; the black bar reuses the existing lit-sign surface and the 5 `Panel` icons drawn for it).
- **Primary tabs: Today, Train, Targets, Log, More.** More opens a sheet with Plan, Atlas, Settings and the palette ("find it"). Rationale: in-session and daily views (Train, Today, Targets intake check-in, Log history) first; programme overview, collection and settings are weekly or rarer [INFERRED from view content; owner may reorder, one array in `src/ui/nav/views.ts`]. Rejected: 6 tabs (53 px slots at 320 px; "the numbers" is 57.6 px at the chosen label style [MEASURED]); all 7 icon-only (owner labels are the identity and icons alone fail recognition).
- **Header ticker removed.** Its text has rendered black on black since it shipped (D4, computed `rgb(0,0,0)` on `rgb(0,0,0)` [MEASURED]), so no user has read it; the session position it carries is already on Today (session indicator) and moves into Train's title row. Rejected: fixing its colour and keeping it (it is what squeezes the page title to one letter, F07). Owner-visible: yes, list on the review page.
- **Live state docks at the bottom, notices at the top.** Rest countdown = bar docked above the tab bar; toasts = small signs under the header. Rejected: bottom toasts with a reserved band (it would sit exactly where the rest bar and the Log button live).

## 1. Tokens to add (`src/ui/styles/tokens.css`, both the bare `:root` and `:root[data-skin='limelight']` blocks; `src/skins/tokens.test.ts` keeps them identical)
| Token | Value | Use |
|---|---|---|
| `--space-1..6` | 4, 8, 12, 16, 24, 32 px | the only spacing steps in shell and view CSS |
| `--gutter` | 16px | the one side gutter at phone width (replaces 14 + 16) |
| `--text-xs/sm/md/lg/xl/2xl` | 12, 14, 16, 20, 24, 32 px | type scale, ratio about 1.2; 12 px is the floor on phone |
| `--header-h` | 44px | one-line header, excluding safe area |
| `--tabbar-h` | 56px | tab bar, excluding safe area |
| `--restbar-h` | 56px | docked rest bar |
| `--dock-bottom` | `calc(var(--tabbar-h) + env(safe-area-inset-bottom))` | where any bottom-docked layer starts |
| `--tap` | 44px | minimum target; `--tap-primary` 56px for the one primary action per screen |
| `--scrim` | `rgba(0, 0, 0, 0.6)` | overlay backdrop (replaces per-file scrims) |
| `--dur-fast/base/slow` | 120, 160, 240 ms | motion durations |
| `--ease-out` | `cubic-bezier(0.2, 0.9, 0.2, 1)` | the curve the stamp already uses (`limelight.css:130`) |
| `--focus` | `2px solid var(--ink)`; on panels `2px solid var(--lime)` | themed focus ring |
| `--z-header 30, --z-dock 32, --z-sheet 35, --z-toast 45, --z-modal 50, --z-system 60` | integers | one ladder; replaces the 9 literals in 10 files (critique D11) |
Acceptance: `grep -rn "z-index: [0-9]" src --include=*.css` returns only `var(--z-*)` users; `tokens.test.ts` asserts every token above in both blocks. The 97 stale `var(--x, #hex)` fallbacks and `motivation.css:67 background: #000` go (AGENTS rule 5); acceptance: `grep -rnE "#[0-9a-fA-F]{3,6}" src --include=*.css` hits only `tokens.css` and comments.

## 2. Shell

### 2.1 Header: one line, safe-area top (D4)
- Touches: `src/app/appShell.css:2-61`, `src/app/App.tsx:618-635` (`TopbarTicker` removed from the header, `:519-539` deleted or moved), `src/app/topbar.test.ts`.
- Spec: `position: sticky; top: 0`; height `var(--header-h)` + `padding-top: env(safe-area-inset-top)`; side padding `max(var(--gutter), env(safe-area-inset-left/right))`; brand 13 px (145 px wide [MEASURED]), 1 px `--line-2`-on-panel separator, page title 13 px white, `flex: 1 1 auto; min-width: 0` with ellipsis; no `backdrop-filter` (F15).
- Acceptance: header height 44 px at 320/390/412 [Playwright]; title width >= its text width for every `nav.*` label at 320 px (122 px available [INFERRED from 288 - 145 - 21]; widest label "the collection" about 76 px at 12-13 px); CSSOM has a `safe-area-inset-top` rule on `.topbar`; on the owner's installed iPhone the brand clears the status bar [device check].
- Defect shot: `iphone13-today.png`, `w320-train-open.png`, `fresh-wizard-step1.png` (title "w...").

### 2.2 Bottom tab bar (D3)
- Touches: `src/app/App.tsx:196-238` (nav moves out of `main` into a `<nav>` after it), `src/app/appShell.css:209-249` (replaced), `src/ui/nav/views.ts` (add `primary: boolean` or a `TAB_ORDER` array; digits unchanged), new `src/ui/nav/MoreSheet.tsx`, `src/skins/limelight/Icon.tsx` (icons already render from the bank).
- Spec: `position: fixed; bottom: 0; left: 0; right: 0; z-index: var(--z-dock)`; height `var(--tabbar-h)` + `padding-bottom: env(safe-area-inset-bottom)`; ground `--panel`, 2 px `--ink` top rule; 5 equal slots (`grid-template-columns: repeat(5, 1fr)`), each a button >= 64 x 56 px at 320 px; content = 32 px pixel icon (`Panel` variant, `image-rendering: pixelated`, integer 1x so it is crisp at 2x/3x DPR) over a label in Archivo 12 px, weight 600, `font-stretch: 75%`, tracking 0.02em, colour `--lime` (10.91:1 on black). Current tab: pink sticker block behind icon + label (pink fill, ink label 7.75:1, 2 px ink border inset 4 px), `aria-current="page"`. Pressed: label and icon shift 1 px down (`transform`), no colour flash. `main` gets `padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--space-4))`.
- More: opens the shared sheet (section 5) with rows Plan, Atlas, Settings, find it (44 px rows, icon + owner label, current view row as sticker). The More slot is the current tab when Plan, Atlas or Settings is shown.
- Acceptance: no label clipped or wrapped at 320 px (`scrollWidth <= clientWidth` per label; widest "the numbers" 57.6 px vs 64 px slot [MEASURED]); every tab target >= 64 x 56 px; tab bar visible at every scroll position of every view (Playwright: scroll to bottom of Settings, `getBoundingClientRect().bottom === innerHeight`); hotkey digits 1-7 still switch view; Android back pops the More sheet first (R6 overlay stack).
- Defect shot: `iphone13-today.png` (strip cut at "the numb"), `iphone13-settings.png` (strip scrolled to backstage).

### 2.3 Content column and gutters (D10)
- Touches: `src/app/appShell.css:64-75`, `src/ui/views/views.css:18-22`, `src/ui/setup/setup.css` (its own wrapper), `train.css`/`atlas.css` where they restate 14 or 16 px.
- Spec: `main { padding: var(--space-4) 0 <tab-bar pad> }` at phone width; `.view { padding-inline: max(var(--gutter), env(safe-area-inset-left)) }`; max width 34 rem kept.
- Acceptance: content width = viewport - 32 px at 320/390/412 (288/358/380 px; today 260/330/352 [MEASURED]); no horizontal overflow (existing check).
- Defect shot: `w320-train-open.png`.

### 2.4 Footer (D15)
- Touches: `src/app/App.tsx:682`, `src/ui/views/SettingsView.tsx` (render `<SiteFooter />` at the end of Settings), `siteFooter.css` (link 44 px tall target).
- Acceptance: footer present only on Settings; its link >= 44 px tall (53 x 12 today [MEASURED]). Words unchanged.

### 2.5 Scroll and history (with R6)
- Each view restores its own scroll offset; a programmatic switch (Start, palette) opens the target at the top (F09). Visited views stay mounted and hidden (F02), so the set drafts survive a tab switch. Engineering in R6; listed so the design acceptance includes them: Start from Today scrolled 600 px opens Train with `scrollY === 0`.

## 3. Type, spacing, states (cross-view)

### 3.1 Type scale (D13 + gym legibility)
- Touches: `tokens.css:130-133` (`body` 13 px -> `var(--text-md)`), `views.css` headings, `train.css` labels, `toastQueue.css`.
- Spec: body 16; secondary rows 14; labels and fine print 12 (never below); view heading (display cut, no numeral) 24; Today hero 32; numeral headings use the uppercase title at 16 / 0.08em (rule kept). Set fields: digits 20 px tabular. Display shadow: keep pink, but scale the offset with the type, `--shadow-offset-display: max(2px, 0.1em)` (2.4 px at 24, 3.2 px at 32) so it no longer fills the next glyph's counters.
- Acceptance: no computed font-size below 12 px in any view (Playwright sweep of text nodes; 10.4 px unit labels and 11.2 px set markers today [MEASURED]); every text-entry control >= 16 px including search, time, date, textarea (F10).
- Owner review: the shadow offset change (before/after on the review page); everything else is invisible to him except larger text.
- Defect shot: `iphone13-targets.png` (pink smear), `iphone13-train-open.png` (tiny labels).

### 3.2 One heading system
- Every view's first heading is the display cut unless it contains a numeral (rule in `src/ui/format/display.ts`); Atlas "ATLAS" and the wizard title move to it; Train's "WEEK 10 FULL BODY A" keeps the numeral title. Sub-headings (`Body Mass`, `the attendance`) = 20 px weight 700, no shadow.
- Acceptance: one class per role, asserted by a DOM test listing `h1,h2` classes per view.

### 3.3 Component states (all controls)
| State | Lime control | Sticker (primary/current) | Control on panel |
|---|---|---|---|
| default | lime fill, ink 1 px border, ink text | pink fill, ink 2 px border, ink text | lime fill, ink 2 px border |
| pressed (`:active`) | `box-shadow: inset 0 0 0 2px var(--ink)` | translate 2 px, 2 px with the offset shadow collapsing | inset 2 px ink |
| focus-visible | `outline: var(--focus)`, offset 2 px | same | lime 2 px outline |
| disabled | opacity 0.45 + dashed border (shape, not colour alone) | same | same |
| selected/current | becomes sticker | n/a | pink fill, ink text |
| error | white fill, 2 px ink border + message (existing `--field-invalid-*`) | n/a | n/a |
- Every button: `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent` (F15); no `:hover`-only state (hover allowed as a duplicate of focus on fine pointers).
- Native controls themed: `accent-color: var(--ink)` on checkbox, radio, range; range track 4 px ink on lime; checkbox/radio drawn 24 px inside a 44 px label row.
- Specificity rule: base element rules in `views.css:95-127` become `:where(.view) button`, `:where(.view) input[...]` (zero specificity), so component classes always win (F06 root cause).
- Acceptance: computed-contrast sweep in Playwright over every view and open overlay: every text node >= 4.5:1 (>= 3:1 at >= 24 px or 18.66 px bold) against its painted background; fails today on the palette active row (1:1), Today marquee (1.92:1), header ticker (1:1) [MEASURED]. Wizard radios no longer platform blue (`fresh-wizard-step1.png`); Settings tz search lime/ink 16 px (`iphone13-settings.png`); plan range track ink (`iphone13-plan.png`).

## 4. Views

### 4.1 Today: the next session and its Start are the hero (D6)
- Touches: `src/ui/views/TodayView.tsx:219-226` (hero), `:423-426` (marquee), `:463-500` (controls), `views.css:186-247`, `limelight.css:281-283`.
- Order: marquee (black strip, fixed contrast) -> her (56 px on the planned hero, per survey item 5) -> session name (display 32) -> Start as the sticker at `--tap-primary` (56 px, full width) -> one sub line (time, count) -> exercise list (unchanged rows) -> secondary actions (mark done, skip, train something else, pause) as a 2 x 2 grid of 44 px lime buttons -> week stamp -> 14-day strip.
- Acceptance: Start fully visible without scrolling and above the tab bar at 320x640 and 390x664 (today its top is 743 px, below the 664 px fold [MEASURED]); exactly one sticker-styled button on the screen; the 4 secondary actions are 2 per row, each >= 44 px tall.
- Defect shot: `iphone13-today-full.png`.

### 4.2 Train: set rows, sticky rest bar, nothing above set 1 (D1, D2, D5)
- Touches: `src/ui/views/TrainView.tsx:345-360` (header, rest panel, hydration, warm-up), `src/ui/views/train/ExerciseCard.tsx`, `SetRow.tsx:73,305-316,430-435`, `RestTimerPanel.tsx:185-291`, `train.css:218-480`, `HydrationBanner.tsx`.
- Above the cards: only the session title row (eyebrow + title, session position `S n/m` at the right). Hydration banner moves under the exercise stack; the once-only warm-up notice stays above, once.
- Active exercise card auto-expanded; others collapsed to a 56 px head row with `done/total`.
- Active set row (the first unlogged set of the open card): load and reps fields side by side, 56 px tall, 20 px tabular digits, ink 12 px labels above; bodyweight toggle = 44 x 44 labelled toggle button (not a 20 px checkbox); **one** Log button, sticker style, full width, 56 px. Later unlogged sets render as one 44 px line ("set 3 of 3" + target), tap to make active. Logged sets: one 44 px line (value + effort word + Edit/Delete as 44 px icon-sized buttons); the four effort buttons show only under the most recently logged set and collapse when the next set is logged. Form Reference and Form Cues share one row (two half-width 44 px buttons).
- Rest bar (C05): when a rest runs, a `--panel` bar of `--restbar-h` docks at `bottom: var(--dock-bottom)`, `z-index: var(--z-dock)`, full width with gutter padding: remaining time in lime 24 px tabular (no icon: the digits are the signal), then `+30 s` and `i'm ready` (existing keys) as 44 px lime-on-panel buttons, and a 44 x 44 icon button that opens the game sheet (`sparklePanel`, accessible name from the existing launch key). Width budget at 320 px: 288 px of content for time + 3 controls + 3 x 8 px gaps [INFERRED; button text widths not measured]; acceptance (f): the bar is one row with no clipped label at 320 px, else `+30 s` moves into the game sheet's row. A 4 px pink progress strip on the bar's top edge replaces the ring (a clock, not an animated quantity; digits never tween). Rest over: the bar flips to pink with ink type (existing `.rest-over` rule) and 3 pulses at 2 Hz, steady under reduced motion. `main` padding-bottom grows by `--restbar-h` while it shows.
- Per-set coach/PR feedback: an inline line in the card under the logged set (C08); a PR may still raise a toast, which now sits at the top (section 5.2).
- Acceptance: (a) after any Log, the remaining rest time is visible in the viewport at every scroll position (today the panel is 594-790 px above the viewport [MEASURED]); (b) `elementFromPoint` at the active Log button's centre returns the button at every scroll position where the button is in the viewport, with a toast showing (today returns `toast-controls` [MEASURED]); (c) on a second session (warm-up dismissed) the active set row's top is <= 50 % of viewport height at 390x664 (907 px today [MEASURED]); (d) exactly one Log button in the DOM per open card (3 today [MEASURED]); (e) every target in the set row >= 44 x 44 px (checkbox 20 x 20 today [MEASURED]); (f) see the rest-bar width budget above.
- Defect shots: `iphone13-train-open.png`, `iphone13-train-set2-toast.png`, `w320-train-open.png`, `iphone13-train-after-log.png`.

### 4.3 Targets, Log, Plan, Atlas, Settings
- Targets: intake fields at 56 px with 20 px digits; Record as the screen's sticker. Acceptance: one sticker; fields 16 px+.
- Log chart (G10, D9): `src/ui/components/BodyMassChart.tsx:53-60,177-200`: viewBox width from the container (ResizeObserver), height 200 px at phone width, tick labels set in CSS px (12 px, `--fine`), points r 4 px, line 2 px ink, projection 1.5 px dashed `--chart-line`. Acceptance: plot area >= 70 % of the SVG height; computed tick label >= 12 px (6 px today); no empty band > 16 px above or below the plot (`iphone13-log.png`).
- Plan: range track ink 4 px, thumb 24 px ink; block chips unchanged. Acceptance: no platform white track (`iphone13-plan.png`).
- Atlas: heading to the display cut; no other change (best-scoring view, 26/40).
- Settings: footer moves here (2.4); tz search becomes a full-width lime 16 px field (F10); Settings no longer the only way to reach Plan/Atlas (More sheet). Acceptance: 3 fields at 16 px (13.33 px today [MEASURED, audit F10]).

### 4.4 Setup wizard and intro
- Wizard radios/checkboxes themed (3.3); title in the header no longer "w..." (2.1); CRT vignette default off for new documents (`src/domain/schema.ts:1049` default `scanlines: true` -> false; old documents keep their stored value, rule 7). Owner review: vignette default (it is his CRT option, kept in Settings).
- Defect shot: `fresh-wizard-step1.png`.

## 5. Overlays: one sheet language, shared with the P6 game sheet

### 5.1 Sheets and modals
- One family, two grounds: **reading sheets** (Form Cues, Video, More, palette, Atlas card, Time Capsule, missed-week, block cutscene) on lime with ink type and a 2 px ink top rule; **live sheets** (rest game, rest over) on `--panel` with a 2 px pink top rule, exactly as P6 Task 9 already specifies for `.rest-sheet` (`docs/plans/2026-11-04-p6-games.md:5399-5418`).
- Geometry (both): bottom-docked, full width, square corners, `max-height: calc(100svh - var(--header-h) - env(safe-area-inset-top) - var(--space-4))` with a `vh` line first (P6 D3), inner scroll with `overscroll-behavior: contain`, padding `var(--space-4)` + safe-area insets, a 44 px close control top-right, scrim `--scrim` behind reading sheets only (the game sheet stays non-modal, P6 D1). Enter: translateY(16 px) + opacity over `--dur-base` `--ease-out`; exit `--dur-fast`; none under reduced motion.
- Stacking with the dock: the game sheet sits at `--z-sheet` above the rest bar and tab bar and shows the remaining rest time in its own top row (it already receives `timer`); minimised, it is the rest bar (one 56 px row: time, game name, Show Game), so the two never stack. This keeps P6 D1's 472 px sheet cap at 390x664: 664 - 44 header - 133 one set row = 487 >= 472 [arithmetic from P6 D1 inputs; Task 11 measures].
- Back/Escape: every sheet registers with the R6 overlay stack; P6's `useSheetDismiss.ts` is absorbed (P6 D5).
- Palette on touch: no autofocus; field at the sheet's bottom edge, results above it; active row = sticker (pink fill, ink label). Acceptance: active row contrast >= 7.75:1 (1:1 today, `iphone13-modal-palette.png`).
- Acceptance (all): no two overlays visible at once except toast over sheet; Android back closes the top overlay first [device check]; z-order only from `--z-*`.

### 5.2 Toasts (D1, D11)
- Touches: `src/ui/components/toastQueue.css:18-160`, `ToastQueue.tsx:395-407`.
- Spec: stack at `top: calc(var(--header-h) + env(safe-area-inset-top) + var(--space-2))`, width `min(32rem, 100vw - 2 * var(--gutter))`, `z-index: var(--z-toast)` (above sheets, below system gates); at most 1 visible, others queued; compact sign: 1 line of text where it fits, tag inline, max height 96 px; the toast body has `pointer-events: none`, only its own buttons take taps (no tap-anywhere dismiss); swipe is not required. Enter from -8 px over `--dur-base`; none under reduced motion.
- Acceptance: on Train, with a toast showing, `elementFromPoint` at every control below `header-h + 104 px` returns that control; toast bottom <= `header-h + safe-top + 8 + 96` px; Form Cues' bottom controls never covered (`iphone13-modal-formcues.png` today).

## 6. Motion rules
- Allowed: sheet and toast enter/exit (`--dur-base`/`--dur-fast`, `--ease-out`, transform + opacity), tab press 1 px shift, rest-over pulse (3 x 500 ms, 2 Hz, `steps(1)`), the Today marquee (only moving strip on any screen), week stamp land, dither wipe (3 rare moments), her sprite frames.
- Banned: animating or fading a number (`limelight.css:6-10`), view-switch transitions, page-load choreography, any loop on Train other than the rest progress strip.
- Reduced motion: every item above becomes an instant state change; marquee shows one static item (existing); sprites show frame 0. Acceptance: with `reducedMotion: 'reduce'`, `document.getAnimations().length === 0` on every view after 1 s (2 running on Today without it, audit F p8).

## 7. Contrast fixes (summary of 3.3 + 2.1)
| Pair today | Where | Fix | Target |
|---|---|---|---|
| ink on black 1:1 | header ticker (`limelight.css:43`) | ticker removed from header | n/a |
| ink on black 1:1 | palette active row (`spotlight.css:71-82`) | sticker row | 7.75:1 |
| ink on black 1:1 | Konami dismiss (`konami.css:66-75`) | lime-on-panel button | 10.91:1 |
| white on lime 1.92:1 | Today marquee (`views.css:118-127` beats `limelight.css:33`) | `:where()` base rules; strip sets its own ground | 21:1 |
| `--fine` on black 2.19:1, on pink 3.54:1 [MEASURED] | any label inside a panel or sticker | panels use `--panel-text` or `--lime`; stickers use ink | >= 7.75:1 |
Acceptance: the Playwright computed-contrast sweep in 3.3, added to `npm run e2e` (one worker).

## 8. Assets
Existing art covers everything except two tab icons. Icons stay 32 x 32 PNG pixel art in the bank's palette (#000000 outline, #6D6D6D, #C9C9C9, #FFFFFF, #BB5F7B, #FCA3BE, transparent [MEASURED from `agy-artifacts/icons/*.png`]), inlined by `npm run icons:build` (`scripts/inline-icons.mjs`), each with a `Panel` variant (black remapped to #8ACE00, the existing rule).

| Slot | Icon | Source | Work |
|---|---|---|---|
| Today | `crown` / `crownPanel` | exists | none |
| Train | `barbell` / `barbellPanel` | exists | none |
| Targets | `drop` / **`dropPanel`** | `drop.png` exists | mechanical remap black -> #8ACE00 (no generation) |
| Log | **`archive`** / **`archivePanel`** | NEW | generate, snap, remap (prompt below) |
| More | **`more`** / **`morePanel`** | NEW | hand-authored: three 6 x 6 px black squares, 4 px apart, centred on the 32 grid, 1 px #6D6D6D shadow right/below; no generation |
| More sheet rows (Plan, Atlas, Settings, find it) | `heel`, `heart`, `fan`, `megaphone` (lime-ground variants) | exist | none; mapping is a proposal for the owner |
| Rest bar game button | `sparklePanel` | exists | none (sparkle is used nowhere else in the dock) |

Generation prompt for `archive` (Codex image generation, one run, copy only the path that run's own image call returns, `md5sum` the result; AGENTS "Process lessons"):
> A single 32 x 32 pixel-art icon on a pure white background, black on white only: a small stack of three tickets or index cards, slightly fanned, the top card showing a tiny 3 x 2 grid of square check marks. Hard 1-pixel black outline, flat fills, no anti-aliasing, no gradient, no text, no shadow beyond a 1-pixel offset, centred with 2 pixels of margin. Style matches a set of chunky 32 x 32 pixel icons of a barbell, a stopwatch, a crown and a water drop drawn with the same 1-pixel black outline. Output at 512 x 512 with each art pixel a clean 16 x 16 block.

Pipeline: downsample by 16 with nearest neighbour to 32 x 32, threshold to the bank palette (black outline, #C9C9C9/#FFFFFF fills, optional #FCA3BE/#BB5F7B accent on the checks), save `agy-artifacts/icons/archive.png`, derive `archive-panel.png` by the black -> #8ACE00 remap, run `npm run icons:build`, register in `docs/design/2026-09-04-icon-register.csv`. Owner reviews all three new icons (dropPanel, archive, more) at 32 px on black and lime on an artifact page before wiring (AGENTS, Art). Rejected: traced currentColor SVG for these two (the tab bar would mix a vector icon with the pixel bank, two icon styles in one bar). No other new raster or vector art is needed.

## 9. Owner review page (items that change what he sees)
1. Tab bar order and the More contents (2.2), including the new `nav.more` label (base table only until he words it).
2. Header ticker removal (0).
3. Display-shadow offset scaling (3.1), before/after.
4. Vignette default off for new installs (4.4).
5. Icons: `dropPanel`, `archive`, `more`, and the More-row mapping (8).
Everything else is a fix to a measured defect and needs no ruling.

## 10. Verification for the P4 plan
- Playwright (`e2e/`, iPhone 13 + Pixel 7 + 320 px, fixed clock, one worker): the acceptances marked above, plus a screenshot set re-run of `docs/private/design-2026-11-04/` names for side-by-side review.
- Unit: `tokens.test.ts` (new tokens), `topbar.test.ts` (header geometry), `views.test.ts` (tab order derived from `VIEWS`), contrast sweep.
- Device (owner): safe areas on an installed iPhone, Android back with More/sheets open, rest bar over the home indicator.
- Not decided here: R7 update banner placement (lives under the header like a toast, E's call); P5 set prefill values (C09) and finish confirm (C12), which the set-row layout above accommodates but does not define.
