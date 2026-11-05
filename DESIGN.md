---
name: FixThisInjustice (limelight)
description: A one-hand gym log in a one-Pantone flyer world, lime ground, black lit signs, pink stickers.
colors:
  lime: "#8ace00"
  ink: "#000000"
  pink: "#ff5fcb"
  fine: "#454545"
  panel: "#000000"
  panel-text: "#ffffff"
  highlight-bg: "#ffffff"
  band-realistic: "#a4eab0"
  band-improbable: "#eac9a4"
  band-highly-improbable: "#eaa6a4"
typography:
  display:
    fontFamily: "Archivo Variable, Archivo, Helvetica, Arial, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.045em"
    fontVariation: "'wdth' 62"
  headline:
    fontFamily: "Archivo Variable, Archivo, Helvetica, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.045em"
    fontVariation: "'wdth' 62"
  title:
    fontFamily: "Archivo Variable, Archivo, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.08em"
  body:
    fontFamily: "Archivo Variable, Archivo, Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo Variable, Archivo, Helvetica, Arial, sans-serif"
    fontSize: "0.7rem"
    letterSpacing: "0.12em"
rounded:
  none: "0px"
  sm: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-default:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "44px"
  button-sticker:
    backgroundColor: "{colors.pink}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "44px"
  button-on-panel:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "44px"
  input-field:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "44px"
  nav-tab:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.fine}"
    height: "44px"
  nav-tab-current:
    backgroundColor: "{colors.pink}"
    textColor: "{colors.ink}"
    height: "44px"
  lit-sign:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.panel-text}"
    rounded: "{rounded.none}"
  toast:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.panel-text}"
    padding: "12px 14px"
---

# Design System: FixThisInjustice (limelight)

<!--
Scan-mode record of the incumbent system, 2026-11-04 (impeccable document). Source of truth is
code: src/ui/styles/tokens.css and the component sheets cited below. The qualitative language
(north star, rule names) is the agent's reading of the round-three design notes quoted in
tokens.css and limelight.css; impeccable asks the user for it and this run could not ask, so it is
provisional. The .impeccable/design.json sidecar was not written (outside this task's paths).
Screenshots for every "broken" note: docs/private/design-2026-11-04/ (gitignored).
-->

## Overview

**Creative North Star: "The One-Pantone Gig Flyer"**

The app is printed, not rendered: one acid-lime ground, pure black ink, one hot pink, and black "lit sign" panels where white or pink type is allowed to live. Headings are a narrow, heavy cut of Archivo with a hard pink offset shadow, the "brat" heading the owner asked for. His pixel character "her" appears at key moments (Today hero, week stamp, intro, rest-game win), and a pixel icon bank (32 x 32, 21 files) carries status and sparkle.

Density is phone-first in intent but desktop-first in structure: a sticky black top bar, an in-flow horizontal tab strip, then a single 34 rem column of stacked blocks separated by ink hairlines. Motion is budgeted: one moving strip per screen (the marquee), a stamp landing, a dither wipe, a 2 Hz rest-over pulse; no quantity is ever animated, faded or blurred (`limelight.css:6-10`).

The palette rules are measured, not taste, and they are the system's spine (`tokens.css:154-168`). The rest of the craft (shell, spacing, overlays) has not reached the same standard yet; the Do's and Don'ts list what is broken today.

**Key Characteristics:**
- Lime ground everywhere; black only as a panel (top bar, rest sign, toasts, marquee, Atlas card faces).
- Pink is a fill, an outline or a shadow, never type on lime; ink-on-pink "stickers" mark the current thing.
- Square corners, 1-2 px ink rules, hard offset shadows; no blur, no gradients, no radius except the palette and a few wizard controls.
- One family, two widths: Archivo Variable at 100 % for UI and 62 % for display.
- Owner-made pixel art, shown at integer scale with `image-rendering: pixelated`.

## Colors

One saturated ground, one ink, one accent, plus a black surface that inverts them.

### Primary
- **Acid Lime** (#8ace00): the page ground (`--bg`, `--bg-2`) and every default control fill. Also type and outlines inside black panels (10.91:1).

### Secondary
- **Hot Pink** (#ff5fcb): `--accent`. Current-tab and current-chip fills, the Undo action, the rest ring arc, offset shadows, the rest-over fill. Type only inside a black panel (7.75:1).

### Neutral
- **Print Ink** (#000000): all display and body type on lime (10.91:1), control borders (`--line-2`), the panel surface (`--panel`, `--topbar-bg`).
- **Fine Print Grey** (#454545): `--text-2` / `--text-3`, secondary text on lime only (4.98:1, the floor). On black it is 2.19:1 and on pink 3.54:1 [MEASURED], both failing.
- **Panel White** (#ffffff): `--panel-text`, type on black (21:1); also `--highlight-bg` and `--field-invalid-bg`.
- **Hairline** (rgba(0,0,0,0.22)): `--line`, dividers that do not carry meaning.
- **Band pastels** (#a4eab0, #eac9a4, #eaa6a4): the feasibility calendar only, always on a black band surface (`tokens.css:54-88`).

### Named Rules
**The No-White-On-Lime Rule.** White type on lime is 1.92:1 and banned at every size.
**The Pink-Is-Never-Type-On-Lime Rule.** Pink on lime is 1.41:1; pink becomes a fill with ink type (7.75:1) or moves onto a black panel.
**The Panel Owns Its Colours Rule.** Anything on `--panel` must set its own text colour; inherited ink on black is 1:1. (Broken in three places today, see Don'ts.)

## Typography

**Display Font:** Archivo Variable at `font-stretch: 62%`, weight 800 (self-hosted @fontsource-variable)
**Body Font:** Archivo Variable at 100 % (`--sans`; `--mono` is the same proportional face)
**Label/Mono Font:** none distinct; ASCII art uses the system monospace (`pre.ll-ascii`, `tokens.css:301-303`)

**Character:** a condensed, shouting display cut over a plain grotesque, like a club flyer's headline over its small print.

### Hierarchy
- **Display** (800, 2rem / 1.05, wdth 62, tracking -0.045em, 4 px pink offset shadow): Today hero name (`views.css:202-207`).
- **Headline** (800, 1.5rem / 1.1, wdth 62): view headings without a numeral (`views.css:49-55`, `.ll-display`).
- **Title** (700, 1rem, uppercase, tracking 0.08em): headings that carry a numeral (`views.css:29-35`), wizard step title, cutscene head.
- **Body** (400, 16 px controls; 0.85-0.9rem rows; root `body` is 13 px, `tokens.css:132`).
- **Label** (0.65-0.75rem, uppercase, tracking 0.06-0.12em, `--fine`): set markers, field labels, eyebrows, toast tags.

### Named Rules
**The No-Shadow-On-Numerals Rule.** A heading that contains a number never takes the display cut (`src/ui/format/display.ts`); numbers stay plain and static.
**The 16-Pixel Field Rule.** Every text-entry control is 16 px so iOS does not zoom (`views.css:7-9`). (Broken for search, time and textarea fields; audit F10.)

## Layout

- Shell: sticky black top bar (`appShell.css:2-17`), then `main` (padding 18/14/40 px under 820 px, `appShell.css:64-75`), then a `.view` column (max 34 rem, padding 16/16/64 px, `views.css:18-22`), then a site footer on every view.
- Navigation: a horizontal tab strip of 7 views + palette button inside `main`, `overflow-x: auto`, not sticky (`appShell.css:214-249`). Needs 854 px; 292-384 px visible at 320-412 px.
- Gutter: 14 + 16 = 30 px per side on phones; 260 px of content at 320 px [MEASURED].
- Rhythm: rem steps of 0.25 / 0.5 / 0.75 / 1 / 1.5 rem in views; px values (10, 12, 14, 18, 24, 28) in the shell. No spacing tokens exist.
- Rows: ink-hairline separated lists (session list, 14-day strip, plan sessions), two-column grids with tabular numerals right-aligned.
- Safe areas: none. `index.html` sets `viewport-fit=cover` and a black-translucent status bar, but 0 CSS rules use `env(safe-area-inset-*)` [MEASURED, CSSOM scan].

## Elevation & Depth

Flat. Depth is expressed by inversion (a black panel on lime) and by hard offset blocks, never by blur. Overlays dim the page with a dark scrim and sit on a z-index ladder spread over 10 files (30 top bar, 40 modals, 49 cutscene, 50/51 CRT layers and missed-week popup, 55 boot, 56 Konami and intro, 57 intro modal, 60 toasts and palette).

### Shadow Vocabulary
- **Sticker offset** (`box-shadow: 4px 4px 0 var(--pink)`, `--shadow-offset`): warm-up notice, rest game frame, wizard accent block (`train.css:507`, `:702`, `setup.css:1069`).
- **Display shadow** (`text-shadow: 4px 4px 0 var(--pink)`): every `.ll-display` line (`tokens.css:289`).
- **Selected-chip foot** (`box-shadow: inset 0 -0.25rem 0 var(--ink)`): the plan chip the scrubber shows (`views.css:368`).

### Named Rules
**The Hard-Offset Rule.** Shadows are zero-blur blocks in pink or ink; a soft shadow is off-world. (This world earns the block shadow; it is the flyer's misregistration, not a costume.)

## Shapes

Square. Radius 0 everywhere except the palette sheet (0.25-0.5rem, `spotlight.css`) and wizard sliders and chips (1-6 px, 50 % for round knobs, `setup.css`). Borders are 1 px ink for controls, 2 px ink for stickers and signs, 3 px for the marquee strip. Status marks are 12 px pixel grids drawn in `currentColor` (`statusMark.css`).

## Components

### Buttons
- **Shape:** square, 1 px ink border, full width by default (`views.css:118-127`).
- **Default:** lime fill, inherited ink type, 16 px, tracking 0.06em, min height 44 px. Primary and secondary actions look identical (Today's Start is the same box as Skip).
- **Sticker (current/primary):** pink fill, ink type, 2 px ink border (current tab, current plan chip, Undo, Next badge).
- **On panel:** lime fill, ink type, 2 px ink border (`train.css:429-433`).
- **Hover / Focus:** no hover state; browser default focus ring (`outline auto 1px`). No pressed state.
- **Broken:** `.view button` (0,1,1) out-specifies single-class component rules, so components that forget to restate colour inherit white or ink from a panel (audit F06).

### Chips
- **Plan block chips:** lime, 1 px border, 0.8rem; current = pink sticker; selected-by-scrubber = 4 px ink foot.
- **Effort chips:** four equal 44 px buttons under every logged set; selected = black panel fill with white type.

### Cards / Containers
- **Exercise card:** 1 px ink frame, 12 px padding, collapsible head, content stack at 8 px gaps (`train.css:226-251`).
- **Notice:** 2 px ink frame plus 4 px pink offset block (warm-up).
- **Banner:** 1 px hairline frame with a 3 px left rule (`appShell.css:77-89`; detector "side-tab" finding).
- **Lit sign:** `.ll-panel`, black ground, white type, pink only via `.ll-panel-state` (`tokens.css:307-326`).

### Inputs / Fields
- **Style:** lime fill, 1 px ink border, 44 px tall, 16 px text (`views.css:95-107`). Unit field labels 10.4 px `--fine` above the field [MEASURED].
- **Invalid:** white fill, bold ink border, message in words (`--field-invalid-bg`).
- **Broken:** timezone search, reminder time and import textarea render at 13.33 px with browser-default white styling (audit F10, screenshot `iphone13-settings.png`); wizard radios and checkboxes render in the browser's blue (`fresh-wizard-step1.png`).

### Navigation
- **Top bar:** black, 85 px tall on every phone [MEASURED]; brand (white, 13 px, pink interpuncts), page title (12 px, shrinks to 15-27 px wide: "t.", "s."), then a ticker whose text is black on black (audit F06, F07).
- **Tab strip:** lowercase owner labels at 16 px in `--fine`; current tab = pink sticker. Side-scrolls, not sticky.
- **Palette ("find it"):** lime sheet, radius 8 px, active row black with black label (unreadable, `iphone13-modal-palette.png`).

### The Marquee (signature)
A 44 px black strip with a 3 px ink rule top and bottom, items = pixel icon + text, 24 s linear loop, paused by tap/focus/hover, one static line under reduced motion (`limelight.css:22-106`). On Today its text renders white on lime (1.92:1) because `.view button` repaints the strip lime (audit F06).

### The Rest Sign (signature)
Black panel, 64 px ring (lime track, pink arc), lime tabular digits, lime controls; flips to pink with ink at zero and pulses 3 times at 2 Hz (`train.css:375-480`). Sits in the Train header, scrolled off screen while the user logs (audit C05).

### Toasts
Black lit-sign cards, pink 2 px left rule, uppercase pink tag, 44 px Undo/Dismiss, fixed `bottom: 1rem`, full width, z 60 (`toastQueue.css`). They cover the next set's Log button (139 px band at 509-648 px of a 664 px iPhone 13 viewport [MEASURED]).

### Her and the icon bank
Sprite sheets at 64 CSS px, `steps()` frames, static under reduced motion (`spriteSheet.css`, `ownerSprite.css`). Icon bank: 16 icons + 5 `Panel` variants with lime outlines for black grounds (`src/skins/limelight/icons.ts`).

## Do's and Don'ts

### Do:
- **Do** set ink (#000000) type on lime and white or lime type on black; check every computed pair, not only the token pair.
- **Do** mark the current item with the pink sticker (pink fill, ink type, 2 px ink border).
- **Do** use the display cut for headings without numerals, at 1.5rem or larger.
- **Do** keep every tap target at least 44 x 44 px and every text field at 16 px.
- **Do** put white, lime or pink type only inside an element that sets `--panel` ground and its own colour.
- **Do** stop every animation under `prefers-reduced-motion` and keep flashes at or below 2 Hz.

### Don't:
- **Don't** use pink as type on lime, or white type on lime, at any size (1.41:1, 1.92:1).
- **Don't** use `--fine` (#454545) on black (2.19:1) or on pink (3.54:1).
- **Don't** rely on source order against `.view button` / `.view input`: today this paints the Today marquee lime under white text and the palette's active row black under black text.
- **Don't** write hex literals in component CSS; today `motivation.css:67` has `background: #000` and about 97 `var(--x, #hex)` fallbacks carry retired clinical colours (e.g. `#8e97a3`, `#13161a`, `#a3e635`).
- **Don't** place fixed UI without `env(safe-area-inset-*)`; 0 rules use it today.
- **Don't** let a passive toast intercept taps on controls under it.
- **Don't** add soft shadows, gradients, glass or rounded cards; they are off-world.
