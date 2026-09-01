# FixThisInjustice — Project Summary

> A single-user, offline-first Progressive Web App that acts as a daily companion for a 24-week body-recomposition training protocol. Terminal/CRT aesthetic. All data lives in the user's browser localStorage. No backend, no accounts, no analytics.

---

## 1. Context & Origin

The user (a PhD candidate in the final six months of their thesis) came with a self-authored 24-week training and nutrition plan and asked for it to be turned into something usable. Over several iterations the deliverable evolved:

1. **Three visual directions** were prototyped side-by-side on a design canvas (editorial "Protocol", almanac "Almanac", terminal "Console").
2. The user picked **Console** — phosphor-on-black, CRT scanlines, monospace, telemetry framing.
3. It was expanded from a static dashboard into a **daily-use interactive app** with per-set logging, coaching feedback, form references, and light game mechanics.
4. It was made **installable as a PWA** and deployed to GitHub Pages.

**Deployed at:** `https://vkotzamanis.github.io/FixThisInjustice/`

**Critical constraint from the user:** the tone must be *scientific and formal*. An early draft used "Greek statue" framing — this was explicitly rejected. The voice is now clinical, measured, and honest (it tells the user the realistic outcome is 14–15% body fat by graduation, not the aspirational 12%).

---

## 2. What the App Does

### The underlying plan (from `data.js`)

| Field | Value |
|---|---|
| Baseline | (subject-specific values removed) |
| Lean mass | (removed) |
| Target | 79 kg / 174 lb, 12% body fat |
| Realistic outcome | 14–15% BF by week 24 |
| Horizon | 168 days / 24 weeks |
| Protein floor | 190 g/day (non-negotiable) |
| Creatine | 5 g/day |

**Three phases:**
1. **Reactivation** (wk 1–8) — 2,000→2,200 kcal, 2→3 sets, trap-bar deadlift only. Habit over intensity.
2. **Building** (wk 9–16) — 2,350 kcal, full volume, conventional deadlift returns, Bulgarian split squats.
3. **Peak** (wk 17–24) — 2,350 kcal, intensity rises, body-composition refinement.

**Weekly split (7-day rotation, NOT calendar weekdays):**
- D1 Push · D2 Pull · D3 Legs · D4 Rest (active) · D5 Upper Power · D6 Cardio+Core · D7 Full Rest
- Push-ups on D2, D3, D4, D6 only (push muscles recover on D1, D5, D7)

**Deload weeks:** 6, 12, 18, 24 — 2 sets, −40% load, no cardio, +200 kcal.

**Personal context baked into the data:** removed from this summary; the generic rewrite collects every personal parameter at setup.

### The seven views

| # | View | Hotkey | Purpose |
|---|---|---|---|
| 1 | **TODAY** | `1` | Auto-derives today's session from `startDate`. Hero shows the day name. Session preview, telemetry stats, meal tracker with running kcal/protein, (medication schedule removed)
| 2 | **TRAIN** | `2` | Gym mode. Per-set weight×reps logging, rest timer with audio chime + vibrate, last-session reference, auto-suggested loads, form-cue and video buttons, bonus sets, custom exercises. |
| 3 | **PLAN** | `3` | The 24-week protocol. Phase selector, week scrubber, day strip, exercise detail, macros with ASCII bars, meal table with editable swaps, supplements, standing rules. |
| 4 | **LOG** | `4` | Weight chart (projection vs measured), push-up curve, 24×7 compliance heatmap (clickable), personal records list. |
| 5 | **PROTOCOLS** | `5` | Deload / plateau / fallback protocols. Auto-highlights when triggers fire. Interactive fallback trigger checker. |
| 6 | **ATLAS** | `6` | Collectible specimen-card library. 42 scientific facts with rarity tiers, unlocked by logging sets. |
| 7 | **EXPORT** | `7` | Full data export (summary text + raw JSON), download as .txt/.json, and **import/restore** from a previous backup. |

---

## 3. Architecture

### File map

```
index.html               ← the app shell: ALL CSS (~1200 lines) + script tags. THIS IS THE ENTRY POINT.
console.html             ← identical duplicate of index.html (legacy; keep in sync or delete)

data.js                  ← window.PLAN — the entire 24-week protocol as a data object
console-content.js       ← window.FORM_CUES (24 exercises) + window.SPECIMEN_CARDS (42 cards)

core.jsx                 ← WeightChart, PushupSpark (shared SVG chart components)
console-store.jsx        ← usePlanStore() — the single source of truth. All state + actions + derived.
console-shared.jsx       ← CRT, TopBar, Nav, Boot, Setup, Spotlight, AsciiBar, ComplianceGrid, (removed stimulant-curve component), VIEWS
console-video.jsx        ← Invidious-only video modal with instance rotation
console-train.jsx        ← TrainView, ExerciseCard, SetRow, RestTimer, AddCustomExercise
console-today-extras.jsx ← MealTracker, QuickWeightLog, PushupTodayCard, SkipSession
console-views.jsx        ← TodayView, PlanView, LogView, ProtocolsView, ExportView, PRList, FallbackTrigger
console-fun.jsx          ← AtlasView, FormCuesModal, TimeCapsule, PhaseTransition, toasts, ErrorBoundary, Konami
tweaks-panel.jsx         ← starter component: floating tweaks panel (host protocol + form controls)
console-app.jsx          ← <App /> root. MUST LOAD LAST. Wires everything together.

manifest.json            ← PWA manifest (start_url "./", standalone, phosphor theme)
sw.js                    ← service worker, app-shell cache. Bump CACHE_NAME on every deploy.
icon-192.png             ← home-screen icon (△ glyph, phosphor on black)
icon-512.png
icon-maskable-512.png    ← Android adaptive icon with safe-zone padding

DEPLOY.md                ← browser-only deployment guide (GitHub Pages + Netlify paths)

--- NOT part of the deployed app (dev artifacts) ---
design-canvas.jsx        ← starter component for the original 3-way comparison
prototype-protocol.html  ← direction 1 (editorial)
prototype-almanac.html   ← direction 2 (almanac)
prototype-console.html   ← direction 3 (early console — superseded by index.html)
screenshots/             ← review captures
uploads/                 ← user-uploaded files
```

### Loading model

**No build step.** Everything runs in the browser via Babel standalone. `index.html` loads scripts in this exact order:

```html
<script src="react@18.3.1 UMD"></script>
<script src="react-dom@18.3.1 UMD"></script>
<script src="@babel/standalone@7.29.0"></script>

<script src="data.js"></script>              <!-- plain JS -->
<script src="console-content.js"></script>   <!-- plain JS -->
<script type="text/babel" src="core.jsx"></script>
<script type="text/babel" src="console-store.jsx"></script>
<script type="text/babel" src="console-shared.jsx"></script>
<script type="text/babel" src="console-train.jsx"></script>
<script type="text/babel" src="console-video.jsx"></script>
<script type="text/babel" src="console-today-extras.jsx"></script>
<script type="text/babel" src="console-views.jsx"></script>
<script type="text/babel" src="console-fun.jsx"></script>
<script type="text/babel" src="tweaks-panel.jsx"></script>
<script type="text/babel" src="console-app.jsx"></script>  <!-- LAST -->
```

**Critical: Babel scripts do NOT share scope.** Every file ends with `Object.assign(window, { ... })` to export its components globally. `console-app.jsx` must load last because it references everything.

> **This bit the project twice.** Inline `<script type="text/babel">` blocks execute *before* external `.jsx` files finish fetching, causing `ReferenceError` on deployed hosts (works fine locally where latency is ~0). The fix was moving `<App />` out of an inline block into `console-app.jsx`. Do not put component code back inline.

### State

Single `useState` object in `usePlanStore()`, persisted to `localStorage["fti.console.v2"]` on every change.

```js
{
  startDate: "2026-05-04",   // ISO. Anchors all "today" math. Day 1 = this date.
  bootSeen: true,
  view: "today",
  week: 12, day: 3,          // currently SELECTED (auto-syncs to today on Today/Train views)

  sets: {                    // `${wk}-${day}-${exIdx}-${setN}` → { weight, reps, ts, exName, ... }
    "12-1-0-1": { weight: 80, reps: 8, ts: 1747..., exName: "Barbell bench press" }
  },
  completed: {},             // `${wk}-${day}-${exIdx}` → bool
  weightLog: [{ wk, lb, ts }],
  pushupLog: { 12: 28 },     // week → max reps
  water: { "2026-05-04": 5 },// ISO date → cups (target 7 × 500ml = 3.5L)
  notes: { "2026-05-04": "slept 5h" },
  mealsByDay: { "2026-05-04": { 3: { skipped: true } } },
  mealSwaps: { 5: "chicken instead of salmon" },
  mealOutNote: "",
  customEx: { "12-3": [{ name: "Cable crunch", sets: "3", reps: "12" }] },

  // fun mechanics
  specimens: { c001: { acquiredAt, exercise } },
  totalSetsLogged: 247,
  lastDrop: null,            // UI watches → shows specimen toast
  lastTelemetry: null,       // { msg, tone: "coach"|"telemetry" }
  lastMilestone: null,
  lastDeletedSet: null,      // undo buffer, 6s window
  lastPhaseSeen: 2,          // detects phase transitions → cutscene
  timeCapsule: { note, writtenAt, opened },

  tweaks: { accent, scanlines, flicker, density }
}
```

`derived` is a `useMemo` over the whole state producing: `phase`, `day`, `vol`, `projWeight`, `pos` (program position), `onTrack`, `exCount`/`exDone`, `setsLogged`/`setsTarget`, `plateau`, `isDeload`, `streakCount`, `water`.

### Cross-file communication

Components reach each other via `window` globals:
- `window.__videoModal` — `{ open(videoIdOrQuery, title), close, node }`
- `window.__formCuesModal` — `{ open(exerciseName), close, node }`
- `window.__pwaReload` — triggers SKIP_WAITING + reload
- `window.buildTelemetryMsg`, `window.drawSpecimen`, `window.setsForWeek`, `window.parseReps`, `window.COMPOUND_LIFTS`

Custom event: `window.dispatchEvent(new CustomEvent("__open-spotlight"))` — lets the mobile ⌘K tap open spotlight.

---

## 4. Feature Detail

### Program position
`programPosition(startDate)` converts today's date into `{ day_idx (0-167), week (1-24), doW (1-7) }`. Day 1 of the program is the start date, so "Day 3" means the third day since starting, not Wednesday. Today/Train views auto-sync to this; Plan/Log let you scrub freely.

### Set logging
Each exercise card expands to show one row per prescribed set (`setsForWeek()` resolves "2→4" notation against the week's volume). Enter on the weight input advances focus to reps; Enter on reps logs the set and blurs (collapsing the mobile keyboard).

**`+ add bonus set`** appends extra rows beyond the prescription — dashed phosphor border marks them.

**`+ add a bonus exercise to today`** opens an inline form (name / sets / reps). Custom exercises are stored per `week-day` at index `1000 + i` to avoid colliding with prescribed exercise indices.

### Coach feedback
`makeCoachLine()` in `console-store.jsx` compares the logged set against the plan and history, in priority order:
1. Weight PR vs lifetime best
2. Rep PR at same weight
3. Over/under the auto-suggested load
4. Over/under the target rep range
5. At top of range → "+2.5 kg next session"
6. Clean rep in range

Coach lines render cyan (`// COACH`); generic telemetry renders phosphor green (`// TELEMETRY`).

### Auto-progression
`suggestedLoad()` looks at the two most recent sets for an exercise. If both hit the top of the rep range at the same weight → suggests +2.5 kg. Otherwise → match last.

### Rest timer
90 s default, +60 s on days containing heavy compounds (`COMPOUND_LIFTS` set). At zero: `navigator.vibrate([180,80,180])` + a Web Audio 880 Hz sine bleep (no audio file). Ring animates via SVG `stroke-dashoffset`.

### Specimen cards (Atlas)
15% chance per logged set to drop a card. Rarity-weighted pool (common ×6, uncommon ×3, rare ×1). 42 cards across biology, anatomy, training, nutrition, supplements, recovery, history, biomechanics — each with a real citation. Locked cards show category + rarity as a teaser. Filter by all/owned/locked/rarity.

### Form cues
`window.FORM_CUES[exerciseName]` → `{ setup[], execution[], mistakes[], tip }`. All 24 exercises covered. Rendered in a warn-colored modal with numbered setup/execution lists and red ✗ mistake list.

### Video references
`data.js` exercises carry a `video` field containing a **search query string** (not a YouTube ID) — this was deliberate, so links can never 404. The modal (`console-video.jsx`) is **Invidious-only** after NewPipe intent URLs and Piped both proved unreliable:
- 6 curated instances from `docs.invidious.io/instances/`, rotated with a `↻ try next` button
- Working instance is remembered in `localStorage["fti.video.instance"]`
- The `YT_ID_RE` branch still exists for embedding if an 11-char ID is ever supplied

> **If instances go down:** edit the `INSTANCES` array at the top of `console-video.jsx`. The authoritative list is at https://docs.invidious.io/instances/

### Cutscenes & toasts
- **Boot sequence** — typewriter BIOS readout on first load, skippable, replayable from Tweaks
- **Phase transition** — fires when `derived.phase.n > s.lastPhaseSeen`. ASCII banner + staged stat reveal.
- **Milestone** — fullscreen at set #50, 100, 250, 500, 1000
- **Specimen drop** — center-screen card, rarity-colored border, 12s auto-dismiss
- **Telemetry / coach** — bottom toast, 4.5s
- **Undo** — 6s window after deleting a set
- **PWA update** — top toast when a new service worker is waiting

### Protocols
Deload (auto-active on weeks 6/12/18/24), Plateau (auto-detected: 3 weight points within 1 lb spanning 2+ weeks), Fallback (thesis crunch — gated behind a two-question trigger check so it can't be entered on vibes).

---

## 5. Design System

```css
--bg: #0a0b0c        --bg-2: #13161a      --bg-3: #1c2026     --bg-4: #252a32
--line: rgba(220,230,240,.08)             --line-2: rgba(220,230,240,.16)
--text: #dde3ea      --text-2: #8e97a3    --text-3: #5a6270
--accent: #a3e635    (phosphor green — user-tweakable)
--warn: #fbbf24      --danger: #f87171    --info: #67e8f9
--mono: "JetBrains Mono"                  --sans: "Geist"
```

- **CRT layers**: scanline overlay (`repeating linear-gradient`, 3px), vignette, 7s flicker animation. All toggleable in Tweaks.
- **Layout**: 180px left nav on desktop, fixed 64px bottom nav below 820px.
- **Type**: Geist for headings/body content, JetBrains Mono for all chrome, labels, and numbers. `font-variant-numeric: tabular-nums` everywhere numbers appear.
- **No border radius** anywhere. Hard edges only.
- **Mobile**: all inputs forced to ≥16px (prevents iOS zoom-on-focus), 44px minimum tap targets under `@media (hover:none)`, meal table reflows from `<table>` to stacked cards, `--kb-h` custom property set from `visualViewport` so fixed chrome sits above the on-screen keyboard.

---

## 6. Keyboard & Interaction

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Spotlight search (views, weeks, days, exercises, protocols). Tappable on mobile via the top-bar hint. |
| `1`–`7` | Switch view |
| `J` / `K` | Week ±1 |
| `←` / `→` | Day ±1 |
| `T` | Jump to today |
| `Esc` | Close modal / spotlight |
| `↑↑↓↓←→←→BA` | Konami easter egg |

Spotlight exercise results deep-link: they switch to Plan, scroll to the exercise row via `data-ex-anchor`, and flash it.

---

## 7. Deployment

**Live:** GitHub Pages, repo root, `main` branch. `index.html` is the entry point.

**The 18 files that must be deployed:**
```
index.html  data.js  console-content.js  core.jsx  console-store.jsx
console-shared.jsx  console-train.jsx  console-video.jsx
console-today-extras.jsx  console-views.jsx  console-fun.jsx
console-app.jsx  tweaks-panel.jsx  manifest.json  sw.js
icon-192.png  icon-512.png  icon-maskable-512.png
```

**Do NOT deploy:** `console.html` (duplicate), `design-canvas.jsx`, `prototype-*.html`, `DEPLOY.md`, `screenshots/`, `uploads/`.

**On every deploy: bump `CACHE_NAME` in `sw.js`** (currently `weight-console-v5`). Without this the service worker serves stale files and the update never lands.

### Known deployment gotchas (all previously hit)
1. **GitHub Pages is case-sensitive.** `Data.js` ≠ `data.js`. Local macOS/Windows won't catch this.
2. **`manifest.json` `start_url` must be `"./"`** — pointing it at a specific filename breaks the home-screen launcher with a 404 if that file is ever renamed.
3. **Missing `console-app.jsx`** or any `.jsx` → black screen with a `ReferenceError`, not a visible error. Check DevTools Network for 404s.
4. **Service worker caching** masks new deploys. Bump the cache name, or test in incognito.

---

## 8. Known Issues & Backlog

### Confirmed working
Everything in sections 2–6 has been verified in-browser and on the user's Android device.

### Deliberately not built
- User accounts / cloud sync (single-device by design)
- Food database / calorie lookup (meal checkoffs are enough)
- Wearable integration
- Music / soundtrack (user explicitly declined)
- Leaderboards, avatars, XP levels (brand conflict — the app is a scientific instrument, not an RPG)

### Suggested next steps (raised with the user, not yet built)
| Priority | Item |
|---|---|
| High | **End-of-session wrap-up cutscene** — currently the last set logs and nothing happens. Should show session tonnage, PRs, duration, comparison to last same-day session. |
| High | **Precompile JSX at deploy time** — Babel standalone adds ~500ms to first paint. Biggest single perf win. |
| Med | **Per-day push-up log** — currently one value per week; the plan calls for 3×max on D2/3/4/6 daily. |
| Med | **Recurring bonus exercises** — custom exercises must be re-added each week. |
| Med | **Exercise swap** — no way to substitute when equipment is unavailable. |
| Med | **Telemetry pool depth** — ~6 templates will feel repetitive after a few weeks. |
| Low | **Atlas category filter** (currently rarity only) |
| Low | **Specimen card packs** — 42 cards will all be collected before week 24 |
| Low | **Memoization** on PR list / heatmap / atlas filter |
| Low | **Accessibility labels** on icon-only buttons |
| Low | **Split localStorage by domain** to limit blast radius of corruption |

### Refactor candidates
- **`window.*` globals for cross-file refs** — works but fragile. React Context would be safer. This is the single biggest structural weakness; it caused two production black-screens.
- **Monolithic `useState`** — every micro-update re-renders the whole tree. `useReducer` + selectors, or splitting into domain stores, would help if the data grows.
- **`index.html` is ~1200 lines of CSS** — worth extracting to a stylesheet, though it does keep the deploy simple.
- **`console.html` / `index.html` duplication** — pick one and delete the other.

---

## 9. Working With This Codebase

**To change the plan itself** (exercises, meals, phases, schedule): edit `data.js`. Everything downstream derives from `window.PLAN`.

**To add form cues or specimen cards**: edit `console-content.js`. Cards need `{ id, rarity, title, category, body, source }`. Cues need `{ setup[], execution[], mistakes[], tip }` keyed by exact exercise name.

**To add a view**: add to `VIEWS` in `console-shared.jsx`, write the component, export it via `Object.assign(window, ...)`, and render it in `console-app.jsx`.

**To add state**: extend `defaultState()` in `console-store.jsx`, add an action, and include it in the returned object. Persistence is automatic.

**Testing locally**: open `index.html` directly (file://) — everything works except the service worker. For full PWA behavior, serve over HTTP (`python3 -m http.server`).

**The tone rule**: scientific, formal, honest. No hype, no emoji, no motivational filler. The app tells the user the realistic outcome, not the flattering one. Keep it that way.
