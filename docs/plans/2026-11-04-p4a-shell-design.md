# P4a Phone-First Shell and Design Polish Implementation Plan

> SUPERSEDED 2026-11-06 executed plan (P4a shipped). Current design `DESIGN.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the desktop-first shell into a phone-first one (one-line header, fixed bottom tab bar with a More sheet, safe areas, top toasts, a rest bar docked above the tab bar) with real Back behaviour (hash router, one overlay stack), views that keep their drafts and scroll, an app-level rest controller, and the cross-view type, spacing, state and contrast fixes of the P4 design brief, each pinned by a unit or Playwright test.

**Architecture:** Tokens first (one spacing, type, geometry, motion, focus and z ladder in `tokens.css`), then zero-specificity base rules so component classes always win. `src/ui/nav/history.ts` becomes the only owner of `window.history` and of the one `popstate` listener; `src/ui/overlay/overlayStack.ts` is the one Escape listener, one scroll lock and one history entry per open overlay; `src/ui/nav/router.ts` makes history follow `ui.lastView` (which stays the render source, so every existing writer keeps working). Visited views stay mounted and hidden. Rest cues move from `RestTimerPanel` (Train only) into `src/app/RestController.tsx` (shell). Then the shell (tab bar, header, toasts, sheets) and the views (Train, Today, Targets, Log) are re-laid to the brief, and two Playwright specs sweep geometry, contrast, font size and motion.

**Tech Stack:** React 19, TypeScript 5.9 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vite 8, Zustand 5, Vitest 4 + Testing Library (jsdom), @playwright/test 1.63.0 (Chromium 1243, `iphone13` + `pixel7` projects, one worker), plain CSS with tokens.

**Spec:** `docs/plans/2026-11-04-aaa-rebuild-spec.md` (R6, P4 line) and the decided design `docs/design/p4-design-brief.md` (sections 0-10; on branch `design-direction`, merged into `main` before this plan runs, together with `PRODUCT.md`, `DESIGN.md`, `docs/design/critique-2026-11-04.md` and the `archive`/`archivePanel`/`dropPanel`/`more`/`morePanel` icons in `src/skins/limelight/icons.ts`). Audit IDs (F01-F15, C05-C08, C11, C17, A10, A11) refer to `docs/private/audit-2026-11-04/{F-shell,C-training,A-onboarding}.md` (gitignored, this laptop only). Craft floor: `/home/vx/Desktop/Claude/web-assets/.claude/skills/impeccable/reference/craft-floor.md`.

## Global Constraints

- AGENTS.md rules 1-10 and its Verify block bind every task. Rule 1: no new health number; the only new numeric constants here are layout, motion and timing values copied from the design brief (each with its unit in a comment). Rule 2: derive, never copy (one tab order, one icon map, one z ladder). Rule 3: `git add -- <paths>`, never `git add -A`. Rule 5: colours only through tokens in `src/ui/styles/tokens.css`; a hex literal in component CSS is a bug. Rule 6: only `src/store/persistence.ts` touches web storage; `toISOString()` only in `src/domain/dates.ts`. Rule 8: re-run the gates yourself.
- Rule 7: old `fti.v3` documents and old JSON exports must load unchanged. This plan changes no stored schema field and no enum. The one default it changes (`ui.scanlines` for NEW documents, Task 7) is a value in `defaultState()`; a stored document keeps the value it carries, and `scanlines` is a required field, so every stored document carries one.
- Wording is out of scope (owner: "Do not focus on the text"). Exactly one new copy key: `nav.more` (base table `src/content/copy.ts` only, value `More`, plus its row in `src/content/__fixtures__/limelight-resolved.json`; flagged for the owner, brief section 9). Existing strings are never edited. A removed key goes to `REMOVED_KEYS` in `src/content/limelightParity.test.ts` with a one-line reason.
- Tests: always `--maxWorkers=1`, one group at a time; `free -m` first and wait while `available` is under 1500 MB. "Test timed out" is not an assertion failure; rerun that file alone once before diagnosing. E2E: `npm run e2e` (one worker) is run by the Claude runner, never by the Codex implementer (it cannot bind a port).
- Units and sign conventions in comments on every quantity: `[px]` CSS pixels, `[ms]` durations, `[ms] epoch UTC` instants, `[s]`, `[kg]`, `[overlays]` stack depth.
- Phone width 320-412 px, installed iPhone Safari and Android Chrome. Playwright here is Chromium with iPhone/Pixel emulation, NOT WebKit: safe-area insets, the iOS keyboard, Android back in an installed app and iOS audio states are device checks for the owner (listed in Task 18).
- Craft floor (impeccable) for every UI task: no eyebrow above a heading (the brief's Train "eyebrow" becomes a trailing position line, Task 13), no coloured `border-left`/`border-right` over 1 px (the toast's pink left rule becomes a top rule, Task 9), focus rings, selection, caret and range/checkbox themed from the palette (Task 2), one authored motion moment per screen (brief section 6), real controls at 44 px.
- Line numbers below are pre-P4a HEAD numbers and drift as earlier tasks land: anchor every edit by its quoted content, never by number. Inside one task apply multi-insert steps bottom-up.
- Commit once per task with the message given; never push (the owner pushes after Task 18). In a `.claude/worktrees/*` worktree the git guard refuses git: STOP, leave changes uncommitted, list the files.
- No new dependency, no `npm install`.

## Order and preconditions (lead: check before Task 1)

- Lands AFTER: P1 Tasks 1-18 (`docs/plans/2026-11-04-p0-p1-unblock.md`; P1 Tasks 11, 12 and 17 rewrite `TodayView.tsx`, `TrainView.tsx`/`ExerciseCard.tsx` and `App.tsx`, and every anchor below quotes their post-P1 text), P2 (storage), P3 (schedule, library, wizard), and P6 Tasks 1-11 (`docs/plans/2026-11-04-p6-games.md`; Task 9 creates `RestGameSheet.tsx` and `useSheetDismiss.ts`). Check: `test -f src/app/LoadRecovery.tsx && test -f src/ui/views/train/RestGameSheet.tsx && test -f src/ui/views/train/useSheetDismiss.ts && grep -q "archivePanel" src/skins/limelight/icons.ts && test -f docs/design/p4-design-brief.md && echo READY`. Expected `READY`. If P6 has not landed, Tasks 1-11 and 13-16 may run; Tasks 12, 17 and 18 wait for it (Task 12 rewrites P6's `useSheetDismiss.ts` and docks its sheet).
- Shared surfaces and who goes first: `src/app/App.tsx` (P1 Task 17 first, then P4a Tasks 5, 7, 8, 11); `src/ui/views/TodayView.tsx` (P1 Task 11 first, then P4a Task 15); `src/ui/views/TrainView.tsx`, `train/ExerciseCard.tsx`, `train/SetRow.tsx` (P1 Tasks 12-14 first, then P4a Tasks 5, 11, 13, 14; P5's C09 prefill and C12 finish confirm come AFTER P4a and fit the active-row layout of Task 14); `src/ui/views/train/RestTimerPanel.tsx`, `RestGameSheet.tsx`, `useSheetDismiss.ts`, `src/ui/styles/restGames.css` (P6 Tasks 1, 4, 9 first, then P4a Tasks 1, 11, 12); `src/ui/components/BodyMassChart.tsx` (P4a Task 16 first; P5 R9/G10 builds on its responsive viewBox); `src/ui/setup/setup.css` (P3 wizard items first, then P4a Task 3); `src/content/copy.ts` and the one-line parity fixture (any phase; a textual conflict on the fixture is resolved by taking one side and re-running the other side's node command).
- P4b (platform: R7 updates, R8 durability, B07, E09/F14 splitting) is a separate plan. The update banner (`UpdatePrompt`) keeps its place inside `<main>` here (brief section 10: E's call).

---

## Amendments (lead rulings, 2026-11-05; binding, override task text)

Owner answers: docs/private/owner-feedback/phone-week-2026-11-04.md ("Design review page answers").
- AM-4a-1 Ticker KEPT (owner rejected removal: "I specifically want the moving banner"). Task 8: no ticker removal and none of its 9 keys deleted. The header stays ONE 44 px row (+ safe-area top): brand, then the page title with a min-width floor that fits the widest nav label, then the ticker taking the remaining width (`flex: 1 1 0; min-width: 0`). Fix the ticker's text colour (black on black today, audit F06) through tokens; contrast >= 4.5:1 asserted by the Task 18 sweep. Reduced motion keeps the static single item.
- AM-4a-2 Approved by the owner: bottom tab bar Today/Train/Targets/Log/More with More = Plan/Atlas/Settings/Find (Task 7), the icons archive/archive-panel, more/more-panel, drop-panel (wire them; register status -> approved 2026-11-05), the display-shadow scaling (Task 3), and P3's `postponed` Log mark.
- AM-4a-3 Vignette: NO default change for new installs (owner could not judge it). Drop that part of Task 8.
- AM-4a-4 Since this plan was written, main gained: P3 (Training Days editor in Settings, 7-cell Log grid, positional session titles, wizard fixes, intro replay), P5 (Today weigh-in + fluid quick add, Log weigh-in list, Settings profile editor + PAL slider, Targets history), P6 (rest-game sheet over Train, restGames.css), P4b platform tasks 1,2,3,7,8,10,11 (src/domain/zod.ts is the only zod import; build-info.json; durability in Settings > Data). Apply the token system, `:where()` base rules, type floor, sticker/primary rules and safe areas to those surfaces too; anchor edits by content.
- AM-4a-5 e2e/p6-rest-sheet.spec.ts: remove the `test.fail(width === 390, ...)` line once the 44 px header lands (Task 8), and extend the "Log above the sheet" assertion from 390 px to all four widths (measured failing at 360/412 too with the 85 px header).
- AM-4a-6 After P4a, run P4b Tasks 4, 5, 6, 9, 12 (update controller, banner under the header, route-level code splitting, install card, game sheet chunk) on top, then the full gates once.

## File Structure

| Path | Status | Responsibility | Task |
|---|---|---|---|
| `src/ui/styles/tokens.css` | modify | Spacing, type, geometry, motion, focus, display-shadow and z tokens in both blocks; body 16 px | 1, 2 |
| `src/ui/styles/cssHygiene.test.ts` | create | z only from `--z-*`, no hex outside tokens.css, no undeclared token, no font under 12 px | 1, 2 |
| every `src/**/*.css` with a `z-index` literal or a `var(--x, #hex)` fallback | modify | Ladder tokens; fallbacks dropped | 1 |
| `src/ui/views/views.css` | modify | `:where()` base rules, states, text-entry 16 px, native controls, `.is-primary` sticker, sub-headings, Plan range, `.view` gutter, Today grid, Targets fields | 2, 3, 8, 15 |
| `src/ui/styles/baseRules.test.ts` | create | The base-rule, state and type contract read from the sheets | 2, 3 |
| `src/ui/setup/setup.css` | modify | A10 row specificity, A11 calendar cells, 24 px marks | 3 |
| `src/ui/views/AtlasView.tsx`, `src/ui/views/viewHeadings.test.tsx` | modify / create | One heading system (brief 3.2); Atlas card as a sheet | 3, 6 |
| `src/ui/nav/history.ts` (+ test) | create | The only `window.history` owner and `popstate` listener | 4 |
| `src/ui/overlay/overlayStack.ts` (+ test) | create | One Escape listener, one scroll lock, one history entry per overlay | 4 |
| `src/ui/components/ModalShell.tsx` | modify | Registers with the stack; Tab trap only when on top | 4 |
| `src/test/setup.ts` | modify | Resets the history, stack and router singletons after each test | 4, 5 |
| `src/ui/nav/router.ts` (+ test) | create | History follows `ui.lastView`; per-view scroll; `goToView` | 5 |
| `src/ui/nav/viewActive.ts` | create | `ViewActiveContext`, `useViewActive()` | 5 |
| `src/app/App.tsx` | modify | Router, kept-mounted views, tab bar and More, one-line header, footer out, rest controller | 5, 7, 8, 11 |
| `src/ui/nav/views.ts` (+ test) | modify | `TAB_ORDER`, `MORE_VIEWS`, `TAB_ICONS`, `MORE_ICONS` (the one icon map the owner swaps); `VIEW_INSTRUCTIONS` removed | 5, 7, 8 |
| `src/ui/nav/TabBar.tsx`, `src/ui/nav/MoreSheet.tsx`, `src/ui/nav/tabBar.css` (+ test) | create | Fixed bottom bar, More sheet; `SpotlightButton` deleted | 7 |
| `src/content/copy.ts`, parity fixture, `limelightParity.test.ts` | modify | `nav.more` added; nine ticker keys to `REMOVED_KEYS` | 7, 8 |
| `src/app/appShell.css`, `src/app/topbar.test.ts` | modify | `.viewnav` out, `main` padding for the dock; one-line header with safe area | 7, 8 |
| `src/ui/views/SettingsView.tsx`, `src/ui/components/siteFooter.css` | modify | Footer on Settings only, 44 px link; zone grouping once | 8, 10 |
| `src/domain/schema.ts` (defaultState only) | modify | `scanlines: false` for new documents | 8 |
| `src/ui/components/ToastQueue.tsx`, `toastQueue.css` (+ tests) | modify | Actions/state contexts split; top placement; body taps pass through | 9 |
| `src/ui/overlay/sheet.css` (+ test) | create | One sheet geometry for the reading dialogs | 6 |
| `src/ui/components/Spotlight.tsx`, `spotlight.css`, `KonamiOverlay.tsx`, `konami.css`, the dialogs' sheets | modify | Palette as a bottom sheet (F11), Konami on the stack (F12), dialog geometry removed | 6 |
| `src/domain/dates.ts` (+ test) | modify | Memoised zone validity and grouping (F08) | 10 |
| `src/ui/views/train/HydrationBanner.tsx` | modify | C17: selects its cue | 10 |
| `src/app/RestController.tsx` (+ test) | create | App-level rest cues (C06, C11), visible on any view | 11 |
| `src/ui/audio/chime.ts` (+ test) | modify | Resume from `interrupted` (C07) | 11 |
| `src/ui/views/train/RestTimerPanel.tsx`, `restPanelStyles.test.ts`, `src/ui/styles/train.css` | modify | No cues of its own (C06); docked rest bar (C05); title row, coach line, set rows | 11, 12, 13, 14 |
| `src/ui/views/train/RestGameSheet.tsx`, `useSheetDismiss.ts`, `src/ui/styles/restGames.css` | modify | Sheet over the dock, minimised = rest bar, Back via the stack | 12 |
| `src/ui/views/TrainView.tsx`, `train/ExerciseCard.tsx` | modify | Wake lock on screen only; toast actions; no pointerdown unlock; title row, rest bar last, hydration under the cards, inline coach line; one active row | 5, 9, 11, 13, 14 |
| `src/ui/views/train/SetRow.tsx` (+ test) | modify | Active row, pending lines, latest-only effort, 44 px toggle | 14 |
| `src/ui/views/TodayView.tsx`, `TargetsView.tsx` | modify | Start is the hero's sticker; 2 x 2 secondary grid; Record sticker | 15 |
| `src/ui/components/BodyMassChart.tsx` (+ test) | modify | Width from the container, 200 px tall, CSS-px ticks | 16 |
| `e2e/support/sweeps.ts` | create | In-page geometry, contrast and font helpers | 17 |
| `e2e/p4a-shell.spec.ts`, `e2e/p4a-sweeps.spec.ts` | create | Brief acceptances that need layout | 17, 18 |
| `docs/STATUS.md` | modify | Gates line | 18 |

---

### Task 1: Tokens, one z ladder, no hex fallbacks (brief section 1, critique D11, AGENTS rule 5)

**Files:**
- Modify: `src/ui/styles/tokens.css` (both the bare `:root` block and `:root[data-skin='limelight']`)
- Modify: every stylesheet the commands in Step 3 list (z-index literals; `var(--x, #hex)` fallbacks), `src/ui/components/sessionIndicator.css` (`--text-dim`), `src/ui/motivation/motivation.css` (`background: #000`)
- Create: `src/ui/styles/cssHygiene.test.ts`
- Modify: `src/skins/tokens.test.ts` (one describe appended)

**Interfaces:**
- Consumes: nothing.
- Produces (CSS custom properties every later task reads): `--space-1..6` (4, 8, 12, 16, 24, 32 px), `--gutter` 16px, `--text-xs/sm/md/lg/xl/2xl` (12, 14, 16, 20, 24, 32 px), `--header-h` 44px, `--tabbar-h` 56px, `--restbar-h` 56px, `--dock-bottom`, `--tap` 44px, `--tap-primary` 56px, `--scrim`, `--dur-fast/base/slow` (120, 160, 240 ms), `--ease-out`, `--focus`, `--focus-on-panel`, `--shadow-offset-display`, and the ladder `--z-header 30 < --z-dock 32 < --z-sheet 35 < --z-crt 44 < --z-toast 45 < --z-modal 50 < --z-system 60`.

Design: the brief's six-step ladder plus one rung, `--z-crt` (44), for the two opt-in CRT layers (they are `pointer-events: none` decoration; at 44 they sit over the page, dock and sheets and under toasts, modals and system gates; before this they covered everything but toasts). Layers that were one apart keep their order with `calc(var(--z-x) +/- n)`: the cutscene stays one under the missed-week popup, Konami and the intro one over boot, the intro modal two over. Toasts move from 60 to 45, so an open modal now covers a toast instead of a toast covering the modal's bottom controls (audit F12).

- [ ] **Step 1: Write the failing tests**

Create `src/ui/styles/cssHygiene.test.ts`:

```ts
// src/ui/styles/cssHygiene.test.ts
//
// Stylesheet-wide guarantees, read from every sheet's text (jsdom computes no style):
//  - z-order comes from the one ladder in tokens.css (P4 design brief section 1, critique D11);
//  - no hex colour outside tokens.css (AGENTS rule 5; the 96 `var(--x, #hex)` fallbacks carried
//    retired clinical colours);
//  - no custom property is read that nothing declares (a dropped fallback must not leave a hole).
import { describe, expect, it } from 'vitest';
import tokensCss from './tokens.css?raw';

const ALL_SHEETS = import.meta.glob<string>('/src/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const declaredIn = (css: string): Set<string> =>
  new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1] ?? ''));
const TOKENS = declaredIn(tokensCss);

/** `var(--z-name)` or `calc(var(--z-name) + n)`; -1 is a local stacking order (Atlas foil). */
const LADDER_VALUE = /^(var\(--z-[a-z]+\)|calc\(var\(--z-[a-z]+\) [+-] \d\)|-1)$/;

describe('stylesheet hygiene (P4 design brief section 1, AGENTS rule 5)', () => {
  it('found the sheets', () => {
    expect(Object.keys(ALL_SHEETS).length).toBeGreaterThan(20);
  });

  it('sets every z-index from the --z-* ladder', () => {
    const literal = Object.entries(ALL_SHEETS).flatMap(([path, css]) =>
      [...stripComments(css).matchAll(/z-index:\s*([^;]+);/g)]
        .map((m) => (m[1] ?? '').trim())
        .filter((value) => !LADDER_VALUE.test(value))
        .map((value) => `${path}: ${value}`),
    );
    expect(literal).toEqual([]);
  });

  it('writes no hex colour outside tokens.css', () => {
    const hex = Object.entries(ALL_SHEETS)
      .filter(([path]) => !path.endsWith('/tokens.css'))
      .flatMap(([path, css]) =>
        [...stripComments(css).matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => `${path}: ${m[0]}`),
      );
    expect(hex).toEqual([]);
  });

  it('reads no custom property without a fallback that neither tokens.css nor the sheet declares', () => {
    const missing = Object.entries(ALL_SHEETS).flatMap(([path, css]) => {
      const local = declaredIn(css);
      return [...stripComments(css).matchAll(/var\((--[a-z0-9-]+)\)/gi)]
        .map((m) => m[1] ?? '')
        .filter((name) => !TOKENS.has(name) && !local.has(name))
        .map((name) => `${path}: ${name}`);
    });
    expect([...new Set(missing)]).toEqual([]);
  });
});
```

Append to `src/skins/tokens.test.ts`:

```ts

describe('P4a shell tokens (P4 design brief section 1)', () => {
  /** Value per token, copied from the brief's table; [px], [ms] and z integers. */
  const REQUIRED: Readonly<Record<string, string>> = {
    '--space-1': '4px',
    '--space-2': '8px',
    '--space-3': '12px',
    '--space-4': '16px',
    '--space-5': '24px',
    '--space-6': '32px',
    '--gutter': '16px',
    '--text-xs': '12px',
    '--text-sm': '14px',
    '--text-md': '16px',
    '--text-lg': '20px',
    '--text-xl': '24px',
    '--text-2xl': '32px',
    '--header-h': '44px',
    '--tabbar-h': '56px',
    '--restbar-h': '56px',
    '--dock-bottom': 'calc(var(--tabbar-h) + env(safe-area-inset-bottom))',
    '--tap': '44px',
    '--tap-primary': '56px',
    '--scrim': 'rgba(0, 0, 0, 0.6)',
    '--dur-fast': '120ms',
    '--dur-base': '160ms',
    '--dur-slow': '240ms',
    '--ease-out': 'cubic-bezier(0.2, 0.9, 0.2, 1)',
    '--focus': '2px solid var(--ink)',
    '--focus-on-panel': '2px solid var(--lime)',
    '--shadow-offset-display': 'max(2px, 0.1em)',
    '--z-header': '30',
    '--z-dock': '32',
    '--z-sheet': '35',
    '--z-crt': '44',
    '--z-toast': '45',
    '--z-modal': '50',
    '--z-system': '60',
  };
  const valuesIn = (block: string): Record<string, string> =>
    Object.fromEntries(
      [...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]),
    );

  it('declares every shell token with the brief value in both blocks', () => {
    const base = valuesIn(BASE_BLOCK);
    const limelight = valuesIn(LIMELIGHT_BLOCK);
    for (const [token, value] of Object.entries(REQUIRED)) {
      expect({ token, base: base[token], limelight: limelight[token] }).toEqual({ token, base: value, limelight: value });
    }
  });

  it('orders the z ladder header < dock < sheet < crt < toast < modal < system', () => {
    const z = (t: string): number => Number(REQUIRED[t]);
    const ladder = ['--z-header', '--z-dock', '--z-sheet', '--z-crt', '--z-toast', '--z-modal', '--z-system'];
    expect(ladder.map(z)).toEqual([...ladder.map(z)].sort((a, b) => a - b));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/styles/cssHygiene.test.ts src/skins/tokens.test.ts`
Expected: FAIL: the ladder test lists the literal z-indexes (`appShell.css: 30`, `toastQueue.css: 60`, ...), the hex test lists about 97 hits, the undeclared test lists `sessionIndicator.css: --text-dim` only after the purge (before it, `--text-dim` carries a fallback), and the token test reports every token above as undefined.

- [ ] **Step 3: Implement**

1. In `src/ui/styles/tokens.css`, insert this block twice: in the bare `:root` block immediately before its closing `}` (after `  --highlight-bg: #ffffff;`), and in the `:root[data-skin='limelight']` block immediately after `  --shadow-offset: 4px;`:

```css

  /*
   * P4 shell tokens (docs/design/p4-design-brief.md section 1). The only spacing steps, type
   * sizes, chrome heights, motion values and z rungs shell and view CSS may use. [px], [ms].
   */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  /* The one side gutter at phone width (was main 14 px + .view 16 px = 30 px a side). */
  --gutter: 16px;
  /* Type scale, ratio about 1.2; 12 px is the floor on a phone. */
  --text-xs: 12px;
  --text-sm: 14px;
  --text-md: 16px;
  --text-lg: 20px;
  --text-xl: 24px;
  --text-2xl: 32px;
  /* Chrome heights, excluding the safe-area insets added where each is drawn. */
  --header-h: 44px;
  --tabbar-h: 56px;
  --restbar-h: 56px;
  /* Where any bottom-docked layer starts: on top of the tab bar and the home indicator. */
  --dock-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
  /* Minimum target; the one primary action per screen is taller. */
  --tap: 44px;
  --tap-primary: 56px;
  /* The one overlay backdrop (replaces per-file scrims). */
  --scrim: rgba(0, 0, 0, 0.6);
  --dur-fast: 120ms;
  --dur-base: 160ms;
  --dur-slow: 240ms;
  /* The curve the stamp already lands on (limelight.css). */
  --ease-out: cubic-bezier(0.2, 0.9, 0.2, 1);
  /* Themed focus rings: ink on lime (10.91:1), lime on a black panel (10.91:1). */
  --focus: 2px solid var(--ink);
  --focus-on-panel: 2px solid var(--lime);
  /* The display shadow scales with its type: 2.4 px at 24 px, 3.2 px at 32 px (brief 3.1). */
  --shadow-offset-display: max(2px, 0.1em);
  /*
   * ONE z ladder (critique D11). --z-crt is the one rung the brief's table does not list: the
   * opt-in scanline and vignette layers, pointer-events none, over the page and under toasts.
   */
  --z-header: 30;
  --z-dock: 32;
  --z-sheet: 35;
  --z-crt: 44;
  --z-toast: 45;
  --z-modal: 50;
  --z-system: 60;
```

2. Drop every hex fallback, then fix the one token it uncovers and the one bare hex:

```bash
grep -rlE "var\(--[a-z0-9-]+, *#[0-9a-fA-F]{3,8}\)" src --include=*.css | xargs sed -i -E 's/var\((--[a-z0-9-]+), *#[0-9a-fA-F]{3,8}\)/var(\1)/g'
sed -i 's/var(--text-dim)/var(--text-2)/' src/ui/components/sessionIndicator.css
sed -i 's/^  background: #000;$/  background: var(--panel);/' src/ui/motivation/motivation.css
```

3. Replace every z-index literal with its rung (each line is `file: old -> new`; edit with exact string replacement and update any comment in the same rule that states the old number to name the token instead):
- `src/app/appShell.css`: `z-index: 30;` -> `z-index: var(--z-header);`
- `src/ui/views/atlas.css`: `z-index: 40;` -> `z-index: var(--z-modal);`
- `src/ui/components/timeCapsule.css`: `z-index: 40;` -> `z-index: var(--z-modal);`
- `src/ui/styles/train.css`: `z-index: 40;` -> `z-index: var(--z-modal);`
- `src/ui/setup/setup.css`: `z-index: 40;` -> `z-index: var(--z-modal);`
- `src/ui/motivation/motivation.css`: `z-index: 50;` -> `z-index: var(--z-modal);`
- `src/ui/components/phaseTransition.css`: `z-index: 49;` -> `z-index: calc(var(--z-modal) - 1);`
- `src/ui/styles/crt.css`: `z-index: 50;` -> `z-index: var(--z-crt);` and `z-index: 51;` -> `z-index: calc(var(--z-crt) + 1);`
- `src/ui/components/boot.css`: `z-index: 55;` -> `z-index: var(--z-system);`
- `src/ui/components/konami.css`: `z-index: 56;` -> `z-index: calc(var(--z-system) + 1);`
- `src/ui/intro/intro.css`: `z-index: 56;` -> `z-index: calc(var(--z-system) + 1);` and `z-index: 57;` -> `z-index: calc(var(--z-system) + 2);`
- `src/ui/components/spotlight.css`: `z-index: 60;` -> `z-index: var(--z-modal);`
- `src/ui/components/toastQueue.css`: `z-index: 60; /* above the CRT scanline and vignette layers, which sit at 50 and 51 */` -> `z-index: var(--z-toast); /* above sheets, the dock and the CRT layers; below modals (critique D11) */`
- `src/ui/styles/restGames.css` (P6): `z-index: 35;` -> `z-index: var(--z-sheet);`

Then confirm nothing is left: `grep -rnE "z-index: [0-9]" src --include=*.css` prints nothing.

- [ ] **Step 4: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/styles src/skins src/app/topbar.test.ts src/ui/components src/ui/views/train/restGameStyles.test.ts src/ui/views/train/restPanelStyles.test.ts`
Expected: PASS. (No existing test pins a hex fallback or a z number: `grep -rln "#13161a\|#8e97a3\|#dde3ea\|z-index" src --include=*.test.ts*` lists only `src/domain/schema.test.ts`, whose `#a3e635` is the stored `ui.accent`, untouched.)

- [ ] **Step 5: Commit**

```bash
git add -- src/ui/styles/tokens.css src/ui/styles/cssHygiene.test.ts src/skins/tokens.test.ts $(git diff --name-only -- '*.css')
git commit -m "style(tokens): spacing, type, chrome, motion and z ladder tokens; no hex fallbacks (P4 brief 1, D11, rule 5)"
```

---

### Task 2: Zero-specificity base rules, states, 16 px fields, 12 px floor (F06, F10, F15, brief 3.1, 3.3)

**Files:**
- Modify: `src/ui/views/views.css` (`.view input[...]`, `.view select`, `.view input[type='checkbox']`, `.view button` rules), `src/ui/styles/tokens.css` (`body` rule)
- Modify: every stylesheet the Step 3 script rewrites (font sizes under 12 px)
- Create: `src/ui/styles/baseRules.test.ts`
- Modify: `src/ui/styles/cssHygiene.test.ts` (one case), `src/ui/styles/limeContrast.test.ts` (the `.view button` row, ~:178)

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: class `.is-primary` (the one sticker-styled primary action per screen: pink fill, ink type, 2 px ink border, `--tap-primary` tall) used by Tasks 14 and 15; zero-specificity base rules, so any single component class wins over them.

Design: `.view button` (0,1,1) out-ranked every one-class component rule, which is how the Today marquee went white on lime and the palette's active row black on black (F06). Wrapped in `:where()` the base rules weigh (0,0,0); a component class always wins regardless of bundle order. The 16 px field rule moves out of `.view` and covers every text-entry control in the app (search, time, date, textarea: F10). States (brief 3.3): pressed = inset 2 px ink, focus-visible = themed ring, disabled = 0.45 opacity plus a dashed border (shape, not colour alone). Body text goes from 13 px to `--text-md` (16 px). Rejected: CSS Modules (audit F verdict: churn for a specificity problem `:where()` solves).

- [ ] **Step 1: Write the failing test**

Create `src/ui/styles/baseRules.test.ts`:

```ts
// src/ui/styles/baseRules.test.ts
//
// The base-rule contract (P4 design brief 3.1, 3.3; audit F06, F10, F15), read from the sheets'
// text because jsdom computes no style. Layout-dependent acceptances (computed sizes, contrast)
// are in e2e/p4a-sweeps.spec.ts.
import { describe, expect, it } from 'vitest';
import tokensCss from './tokens.css?raw';
import viewsCss from '../views/views.css?raw';

interface Rule {
  selector: string;
  body: string;
}

function rulesOf(css: string): Rule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? '').trim().replace(/\s+/g, ' '),
    body: m[2] ?? '',
  }));
}

const VIEW_RULES = rulesOf(viewsCss);
const body = (selector: string): string => {
  const rule = VIEW_RULES.find((r) => r.selector === selector);
  if (rule === undefined) throw new Error(`views.css: no rule ${selector}`);
  return rule.body;
};

describe('base element rules weigh nothing (F06)', () => {
  it('no views.css selector names .view directly in front of a bare element', () => {
    const heavy = VIEW_RULES.map((r) => r.selector).filter((s) =>
      /(^|,\s*)\.view (button|input|select|textarea)\b/.test(s),
    );
    expect(heavy).toEqual([]);
  });

  it('styles buttons through :where(), with tap hygiene (F15)', () => {
    const b = body(':where(.view) :where(button)');
    expect(b).toMatch(/min-height:\s*var\(--tap\);/);
    expect(b).toMatch(/touch-action:\s*manipulation;/);
    expect(b).toMatch(/-webkit-tap-highlight-color:\s*transparent;/);
  });
});

describe('every text-entry control is 16 px (F10)', () => {
  it('one app-wide rule covers search, time, date, text, number, select and textarea', () => {
    const rule = VIEW_RULES.find((r) => r.selector.startsWith(':where(input:not('));
    expect(rule?.selector).toContain("[type='checkbox']");
    expect(rule?.selector).toContain("[type='radio']");
    expect(rule?.selector).toContain("[type='range']");
    expect(rule?.selector).toContain('select, textarea');
    expect(rule?.body).toMatch(/font-size:\s*16px;/);
    expect(rule?.body).toMatch(/caret-color:\s*var\(--ink\);/);
  });
});

describe('states (brief 3.3)', () => {
  it('pressed is an inset ink ring, never a colour flash', () => {
    expect(body(':where(.view) :where(button):active:not(:disabled)')).toMatch(
      /box-shadow:\s*inset 0 0 0 2px var\(--ink\);/,
    );
  });

  it('disabled is shape as well as opacity', () => {
    const b = body(':where(.view) :where(button):disabled');
    expect(b).toMatch(/opacity:\s*0\.45;/);
    expect(b).toMatch(/border-style:\s*dashed;/);
  });

  it('focus-visible is the themed ring, lime inside a black panel', () => {
    expect(body(':where(:focus-visible)')).toMatch(/outline:\s*var\(--focus\);/);
    expect(body(':where(.ll-panel :focus-visible)')).toMatch(/outline:\s*var\(--focus-on-panel\);/);
  });

  it('native checkbox, radio and range take the ink accent, never platform blue (A10)', () => {
    const rule = VIEW_RULES.find((r) => r.selector.includes("input[type='radio']") && r.body.includes('accent-color'));
    expect(rule?.body).toMatch(/accent-color:\s*var\(--ink\);/);
  });

  it('text selection is themed', () => {
    expect(body('::selection')).toMatch(/background:\s*var\(--ink\);/);
    expect(body('::selection')).toMatch(/color:\s*var\(--lime\);/);
  });

  it('defines the one primary sticker', () => {
    const b = body('.view .is-primary');
    expect(b).toMatch(/background:\s*var\(--accent\);/);
    expect(b).toMatch(/color:\s*var\(--ink\);/);
    expect(b).toMatch(/border:\s*2px solid var\(--ink\);/);
    expect(b).toMatch(/min-height:\s*var\(--tap-primary\);/);
  });
});

describe('type scale (brief 3.1)', () => {
  it('body text is 16 px', () => {
    expect(tokensCss).toMatch(/body \{[^}]*font-size:\s*var\(--text-md\);/);
    expect(tokensCss).not.toMatch(/body \{[^}]*font-size:\s*13px;/);
  });
});
```

Append to the `describe` in `src/ui/styles/cssHygiene.test.ts`:

```ts

  it('sets no font size under 12 px (brief 3.1; .konami-art is aria-hidden ASCII art)', () => {
    const PX_PER_REM = 16; // [px/rem] the root size
    const small = Object.entries(ALL_SHEETS).flatMap(([path, css]) =>
      [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((rule) =>
        [...(rule[2] ?? '').matchAll(/font-size:\s*([0-9.]+)(px|rem)\b/g)]
          .filter((d) => Number(d[1]) * (d[2] === 'rem' ? PX_PER_REM : 1) < 12)
          .filter(() => !(rule[1] ?? '').includes('.konami-art'))
          .map((d) => `${path}: ${(rule[1] ?? '').trim()} ${d[0]}`),
      ),
    );
    expect(small).toEqual([]);
  });
```

In `src/ui/styles/limeContrast.test.ts` replace

```ts
  { sheet: 'views.css', css: viewsCss, selector: '.view button', property: 'border', value: '1px solid var(--line-2)' },
```

with

```ts
  { sheet: 'views.css', css: viewsCss, selector: ':where(.view) :where(button)', property: 'border', value: '1px solid var(--line-2)' },
```

and in its `it('finds the three tinted controls the brief names', ...)` rename it to `'finds the tinted controls: the three the brief names and the app-wide base rule (A10)'` and replace its expected list with:

```ts
    expect(tinted.map((r) => r.selector).sort()).toEqual([
      '.intro-acknowledgement input',
      '.view.plan .plan-scrub input[type=\'range\']',
      '.wiz-slider input[type=\'range\']',
      ":where(input[type='checkbox'], input[type='radio'], input[type='range'])",
    ]);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/styles/baseRules.test.ts src/ui/styles/cssHygiene.test.ts src/ui/styles/limeContrast.test.ts`
Expected: FAIL (no `:where()` rules; body 13 px; 22 rules under 12 px, e.g. `train.css: .unit-input label font-size: 0.65rem`).

- [ ] **Step 3: Implement**

1. In `src/ui/styles/tokens.css`, in the `body { ... }` rule replace `  font-size: 13px;` with `  font-size: var(--text-md); /* [px] 16; brief 3.1 (was 13) */`.

2. In `src/ui/views/views.css` replace the three rules from `.view input[type='number'],` through the closing `}` of `.view button { ... }` (the `.view input[type='number'], .view input[type='text'], .view select` rule, the `.view input[type='checkbox']` rule, the comment above `.view button` and `.view button` itself) with:

```css
/*
 * F10: EVERY text-entry control in the app is 16 px, or iOS Safari zooms on focus. App-wide (the
 * wizard, the palette and the time capsule live outside .view) and zero-specificity, so a
 * component class may restyle a field but a size below 16 px fails cssHygiene/e2e sweeps.
 */
:where(input:not([type='checkbox'], [type='radio'], [type='range'], [type='file'], [type='button'], [type='submit'])),
:where(select, textarea) {
  font-size: 16px;
  font-family: inherit;
  caret-color: var(--ink);
  font-variant-numeric: tabular-nums;
}

/*
 * F06: the base rules weigh (0,0,0). `.view button` was (0,1,1) and beat every one-class
 * component rule that forgot to restate a colour (the Today marquee, the palette row). Any
 * component class now wins whatever order the bundle loads the sheets in.
 */
:where(.view) :where(input[type='number'], input[type='text'], input[type='search'], input[type='time'], input[type='date'], select, textarea) {
  display: block;
  width: 100%;
  min-height: var(--tap);
  padding: var(--space-1) var(--space-2);
  color: inherit;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
}

/* Native marks take the ink accent (A10: they were platform blue) and are drawn 24 px inside a
 * 44 px label row (the label is the tap area). */
:where(input[type='checkbox'], input[type='radio'], input[type='range']) {
  accent-color: var(--ink);
}

:where(.view) :where(input[type='checkbox'], input[type='radio']) {
  width: 1.5rem;
  height: 1.5rem;
  flex: none;
}

/* The 1 px edge is ink (10.91:1 on lime, SC 1.4.11). Buttons on the black panels set their own. */
:where(.view) :where(button) {
  width: 100%;
  min-height: var(--tap);
  color: inherit;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  font-family: inherit;
  font-size: 16px;
  letter-spacing: 0.06em;
  /* F15: no double-tap zoom on +30 s or effort taps, no grey flash on iOS. */
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
}

/* Brief 3.3 states. Pressed: an inset ink ring, never a colour flash. */
:where(.view) :where(button):active:not(:disabled) {
  box-shadow: inset 0 0 0 2px var(--ink);
}

/* Disabled by shape as well as by opacity (WCAG 1.4.1). */
:where(.view) :where(button):disabled {
  opacity: 0.45;
  border-style: dashed;
  cursor: not-allowed;
}

:where(:focus-visible) {
  outline: var(--focus);
  outline-offset: 2px;
}

:where(.ll-panel :focus-visible) {
  outline: var(--focus-on-panel);
}

::selection {
  background: var(--ink);
  color: var(--lime);
}

/*
 * The ONE primary action per screen (brief 3.3, 4.1, 4.2): the pink sticker. Ink on pink is
 * 7.75:1. Pressed: it moves 2 px down and right, the way a sticker is pressed flat.
 */
.view .is-primary {
  min-height: var(--tap-primary);
  background: var(--accent);
  color: var(--ink);
  border: 2px solid var(--ink);
  font-weight: 700;
}

.view .is-primary:active:not(:disabled) {
  transform: translate(2px, 2px);
  box-shadow: none;
}
```

3. Raise every font size under 12 px to the floor (one script; it prints each change for the commit message review):

```bash
node -e "
const fs=require('fs'),path=require('path');
const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):e.name.endsWith('.css')?[path.join(d,e.name)]:[]);
for(const f of walk('src')){
  const s=fs.readFileSync(f,'utf8');
  const out=s.replace(/([^{}]+)\{([^{}]*)\}/g,(all,sel,body)=>{
    if(sel.includes('.konami-art'))return all;
    const nb=body.replace(/font-size:\s*([0-9.]+)(px|rem)\b/g,(d,v,u)=>Number(v)*(u==='rem'?16:1)<12?(console.log(f,sel.trim().split('\n').pop(),d),'font-size: var(--text-xs)'):d);
    return sel+'{'+nb+'}';
  });
  if(out!==s)fs.writeFileSync(f,out);
}"
```

Expected output: about 21 lines (the list in `cssHygiene`'s failure), e.g. `src/ui/styles/train.css .unit-input label font-size: 0.65rem`.

- [ ] **Step 4: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/styles src/skins src/app/topbar.test.ts src/ui/components src/ui/views src/ui/setup`
Expected: PASS. If a test in `src/ui/styles/stickerStates.test.ts` or `limeContrast.test.ts` names another `.view <element>` selector, change only its selector string to the new `:where(...)` form above; do not change its asserted value.

- [ ] **Step 5: Commit**

```bash
git add -- src/ui/views/views.css src/ui/styles/tokens.css src/ui/styles/baseRules.test.ts src/ui/styles/cssHygiene.test.ts src/ui/styles/limeContrast.test.ts $(git diff --name-only -- '*.css')
git commit -m "style(base): zero-specificity base rules, states, 16 px fields, 12 px floor (F06, F10, F15, brief 3.1, 3.3)"
```

---

### Task 3: One heading system, display shadow scale, wizard rows and calendar, themed range (brief 3.1, 3.2, 4.3; A10, A11)

**Files:**
- Modify: `src/ui/styles/tokens.css` (`.ll-display` text-shadow), `src/ui/views/views.css` (`.view h3` sub-heading rule; `.view.plan .plan-scrub input[type='range']`), `src/ui/setup/setup.css` (`@media (max-width: 560px)` row rules, `@media (max-width: 24rem) .wiz .wiz-row`, `.wiz input[type='checkbox'], .wiz input[type='radio']`, `.wiz .wiz-calendar-grid`, a new calendar bleed rule), `src/ui/views/AtlasView.tsx` (its first heading)
- Create: `src/ui/views/viewHeadings.test.tsx`
- Modify: `src/ui/styles/baseRules.test.ts` (one describe appended)

**Interfaces:**
- Consumes: Task 1 `--shadow-offset-display`, `--text-lg`, `--gutter`; `displayClass(text, extra?)` from `src/ui/format/display.ts` (unchanged).
- Produces: nothing new.

Design: every view's first heading is the display cut unless it carries a numeral (`displayClass`, unchanged); Atlas's first heading moves to it. Sub-headings (`h3` in a view) are 20 px, weight 700, no shadow. The display shadow offset scales with the type (`max(2px, 0.1em)`), so at 24-32 px it no longer fills the next glyph's counters. A10: the phone row rule out-ranks `.wiz .wiz-row` by restating its selector inside the media query. A11: under 24 rem the calendar bleeds to the viewport edge with no side padding, so seven columns at a 2 px gap are (320 - 6 x 2) / 7 = 44.0 px wide at 320 px. Rejected for A11: accepting 36 px cells (the WCAG 2.5.8 AA floor is 24 px, but the app's own rule is 44 px everywhere).

- [ ] **Step 1: Write the failing tests**

Create `src/ui/views/viewHeadings.test.tsx`:

```tsx
// Brief 3.2: one heading system. Every view-level h1/h2 in a *View.tsx goes through
// displayClass() (src/ui/format/display.ts: the display cut unless the text carries a numeral);
// a modal's own title (class *-modal-title) is the modal's business. Read as source text, the
// convention src/ui/nav/views.test.ts uses for App.tsx.
import { describe, expect, it } from 'vitest';

const VIEW_SOURCES = import.meta.glob<string>('./*View.tsx', { query: '?raw', import: 'default', eager: true });

describe('one heading system (brief 3.2)', () => {
  it('found the views', () => {
    expect(Object.keys(VIEW_SOURCES).length).toBeGreaterThanOrEqual(7);
  });

  it('every view heading takes displayClass()', () => {
    const plain = Object.entries(VIEW_SOURCES).flatMap(([path, source]) =>
      source
        .split('\n')
        .filter((line) => /<h[12][\s>]/.test(line))
        .filter((line) => !line.includes('displayClass(') && !/-modal-title/.test(line))
        .map((line) => `${path}: ${line.trim()}`),
    );
    expect(plain).toEqual([]);
  });
});
```

Append to `src/ui/styles/baseRules.test.ts`:

```ts

import setupCss from '../setup/setup.css?raw';

describe('display shadow, sub-headings, range, wizard rows and calendar (brief 3.1-4.3, A10, A11)', () => {
  const setup = rulesOf(setupCss);
  const setupBody = (selector: string): string[] => setup.filter((r) => r.selector === selector).map((r) => r.body);

  it('the display shadow offset scales with the type', () => {
    expect(tokensCss).toMatch(
      /\.ll-display \{[^}]*text-shadow:\s*var\(--shadow-offset-display\) var\(--shadow-offset-display\) 0 var\(--pink\);/,
    );
  });

  it('a view sub-heading is 20 px bold with no shadow', () => {
    const b = body('.view h3');
    expect(b).toMatch(/font-size:\s*var\(--text-lg\);/);
    expect(b).toMatch(/font-weight:\s*700;/);
    expect(b).toMatch(/text-shadow:\s*none;/);
  });

  it('the Plan range is a 4 px ink track with a 24 px ink thumb', () => {
    expect(body(".view.plan .plan-scrub input[type='range']::-webkit-slider-runnable-track")).toMatch(/height:\s*4px;/);
    expect(body(".view.plan .plan-scrub input[type='range']::-webkit-slider-thumb")).toMatch(/width:\s*24px;/);
  });

  it('A10: the phone row rule restates .wiz .wiz-row so it out-ranks the desktop flex row', () => {
    expect(setupBody('.wiz .wiz-row').some((b) => /display:\s*grid;/.test(b))).toBe(true);
    expect(setupBody('.wiz .wiz-row-tight').some((b) => /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\);/.test(b))).toBe(true);
    expect(setupBody('.wiz .wiz-row').some((b) => /flex-direction:\s*column;/.test(b))).toBe(false);
  });

  it('A11: seven columns at a 2 px gap, full bleed under 24 rem: 44 px cells at 320 px', () => {
    const grid = setupBody('.wiz .wiz-calendar-grid').join('');
    expect(grid).toMatch(/grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\);/);
    expect(grid).toMatch(/gap:\s*2px;/);
    const bleed = setupBody('.wiz .wiz-calendar').join('');
    expect(bleed).toMatch(/margin-inline:\s*calc\(-1 \* var\(--gutter\)\);/);
    expect(bleed).toMatch(/padding-inline:\s*0;/);
    const viewport = 320; // [px]
    const cell = (viewport - 6 * 2) / 7; // [px]
    expect(cell).toBeGreaterThanOrEqual(44);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/styles/baseRules.test.ts src/ui/views/viewHeadings.test.tsx`
Expected: FAIL (fixed 4 px shadow; no `.view h3` rule; no track/thumb rules; A10/A11 rules absent; `AtlasView.tsx: <h2>{t('hero.atlas')}</h2>` listed).

- [ ] **Step 3: Implement**

1. `src/ui/styles/tokens.css`, in `:root[data-skin='limelight'] .ll-display`: replace `  text-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--pink);` with `  text-shadow: var(--shadow-offset-display) var(--shadow-offset-display) 0 var(--pink);`. (`--shadow-offset` stays for the box shadows that read it.)
2. `src/ui/views/views.css`, after the `.view h2.ll-display { ... }` rule add:

```css
/* Brief 3.2: a sub-heading (Body Mass, the attendance) is 20 px bold, never the display cut. */
.view h3 {
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1.2;
  text-shadow: none;
  margin: var(--space-5) 0 var(--space-2);
}
```

and after the `.view.plan .plan-scrub input[type='range'] { ... }` rule add:

```css
/* Brief 4.3: a 4 px ink track and a 24 px ink thumb; never the platform's white track. */
.view.plan .plan-scrub input[type='range'] {
  appearance: none;
  background: transparent;
}

.view.plan .plan-scrub input[type='range']::-webkit-slider-runnable-track {
  height: 4px;
  background: var(--ink);
}

.view.plan .plan-scrub input[type='range']::-moz-range-track {
  height: 4px;
  background: var(--ink);
}

.view.plan .plan-scrub input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 24px;
  height: 24px;
  margin-top: -10px; /* [px] (24 - 4) / 2 centres the thumb on the track */
  background: var(--ink);
  border: 2px solid var(--lime);
}

.view.plan .plan-scrub input[type='range']::-moz-range-thumb {
  width: 24px;
  height: 24px;
  background: var(--ink);
  border: 2px solid var(--lime);
}
```

3. `src/ui/setup/setup.css`:
- Delete the whole `@media (max-width: 24rem) { .wiz .wiz-row { flex-direction: column; } }` block (it stacked the metres/centimetres pair, A10).
- In the `@media (max-width: 560px) { ... }` block change the three selectors `.wiz-row {`, `.wiz-row-tight {`, `.wiz-row-site {` to `.wiz .wiz-row {`, `.wiz .wiz-row-tight {`, `.wiz .wiz-row-site {` (bodies unchanged).
- Replace `.wiz input[type='checkbox'],\n.wiz input[type='radio'] {\n  width: 1.25rem;\n  height: 1.25rem;` with the same selectors and `width: 1.5rem;\n  height: 1.5rem;` (24 px marks, brief 3.3).
- In `.wiz .wiz-calendar-grid` replace `grid-template-columns: repeat(7, 1fr);` with `grid-template-columns: repeat(7, minmax(0, 1fr));`, and correct the comment above `.wiz .wiz-calendar-day` to: `One day. 44 px tall; 44 px wide at 320 px because the calendar bleeds to the viewport edge below 24 rem ((320 - 6 x 2) / 7 = 44.0 px; A11).`
- After the `.wiz .wiz-calendar { ... }` rule add:

```css
/* A11: below 24 rem the band spans the viewport, so each of seven columns is >= 44 px wide. */
@media (max-width: 24rem) {
  .wiz .wiz-calendar {
    margin-inline: calc(-1 * var(--gutter));
    padding-inline: 0;
    border-inline: 0;
    border-radius: 0;
  }
}
```

4. `src/ui/views/AtlasView.tsx`: replace `      <h2>{t('hero.atlas')}</h2>` with `      <h2 className={displayClass(t('hero.atlas'))}>{t('hero.atlas')}</h2>`, adding `import { displayClass } from '../format/display';` to its imports if it is not there.

- [ ] **Step 4: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/styles src/ui/views src/ui/setup src/skins`
Expected: PASS. `src/ui/setup/SetupWizard.test.tsx` reads `setup.css` as text for two layout rules (r2.10 shrink, modal close corner); neither is touched.

- [ ] **Step 5: Commit**

```bash
git add -- src/ui/styles/tokens.css src/ui/views/views.css src/ui/setup/setup.css src/ui/views/AtlasView.tsx src/ui/views/viewHeadings.test.tsx src/ui/styles/baseRules.test.ts
git commit -m "style(views): one heading system, scaled display shadow, themed range, wizard rows and 44 px calendar cells (brief 3.1-4.3, A10, A11)"
```

---

### Task 4: One history owner and one overlay stack; ModalShell joins it (R6, F01, F12)

**Files:**
- Create: `src/ui/nav/history.ts`, `src/ui/overlay/overlayStack.ts`, `src/ui/overlay/overlayStack.test.tsx`
- Modify: `src/ui/components/ModalShell.tsx` (module scroll-lock block and the component body), `src/test/setup.ts` (the `afterEach`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `history.ts`: `interface HistoryEntry { view: string; depth: number }`; `entryOf(state: unknown): HistoryEntry | null`; `hashFor(view: string): string` (`#/view`); `viewFromHash(hash: string): string | null`; `setOverlayCloser(fn: (depth: number) => void): void`; `setViewShower(fn: ((view: string) => void) | null): void`; `currentEntry(): HistoryEntry | null`; `replaceEntry(entry: HistoryEntry): void`; `pushEntry(entry: HistoryEntry): void`; `stepBack(): void` (batched into one `history.go(-n)` per task); `resetHistoryForTests(): void`.
  - `overlayStack.ts`: `interface OverlayOptions { modal: boolean }`; `closeOverlaysTo(depth: number): void`; `abandonOverlaysForNavigation(): void` (Task 5's router calls it before pushing a new view entry); `overlayDepth(): number`; `isTopOverlay(id: number): boolean`; `openOverlay(close: () => void, options: OverlayOptions): { id: number; release: () => void }`; `useOverlay(onClose: () => void, options: OverlayOptions): { readonly current: number }`; `resetOverlaysForTests(): void`.
  - Every overlay from here on registers through `useOverlay` (ModalShell does it for every dialog built on it). Task 6 registers Konami; Task 12 rewrites P6's `useSheetDismiss` onto it; Task 7's More sheet is a ModalShell.

Design: one history entry per open overlay, written `{ fti: { view, depth } }`. Back lands on an earlier entry and the overlays above its depth close, top first (F01: back never leaves the app with an overlay up). An overlay closed by its own control (or Escape) steps back over one overlay entry; step-backs asked for in one task are issued as one `history.go(-n)` in a microtask (measured in this plan's dry run: two synchronous `history.back()` calls traverse once in jsdom), its `popstate` is counted and swallowed, and any push asked for meanwhile waits for it. One Escape listener closes the top overlay only (F12: two stacked ModalShells closed together); one scroll lock, taken by the first modal and released by the last. Tab is trapped only by the top shell. z-order stays in CSS (`--z-*`, Task 1). Measured in this plan's dry run: jsdom delivers the `popstate` of a traversal on a later task, and with ModalShell on the stack and Task 5 applied, `src/ui/components src/ui/motivation src/app src/ui/nav src/ui/overlay` (47 files, 487 tests) pass. Rejected: native `<dialog>.showModal()` alone (audit F verdict: no Back integration); keeping per-overlay listeners and adding a dummy `pushState` each (F12 stays).

- [ ] **Step 1: Write the failing test**

Create `src/ui/overlay/overlayStack.test.tsx`:

```tsx
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactElement } from 'react';
import { currentEntry, pushEntry, replaceEntry, resetHistoryForTests, setViewShower } from '../nav/history';
import { overlayDepth, resetOverlaysForTests, useOverlay } from './overlayStack';

/** Resolves after the browser has delivered any queued history traversal. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20)); // [ms]
  });
}

function Layer(props: { name: string; modal?: boolean; onClose: () => void }): ReactElement {
  useOverlay(props.onClose, { modal: props.modal ?? true });
  return <div data-testid={props.name} />;
}

function Harness(): ReactElement {
  const [a, setA] = useState(true);
  const [b, setB] = useState(true);
  return (
    <>
      {a && (
        <Layer
          name="a"
          onClose={() => {
            setA(false);
          }}
        />
      )}
      {b && (
        <Layer
          name="b"
          onClose={() => {
            setB(false);
          }}
        />
      )}
      <button
        type="button"
        onClick={() => {
          setB(false);
        }}
      >
        close b
      </button>
      <button
        type="button"
        onClick={() => {
          setA(false);
          setB(false);
        }}
      >
        close both
      </button>
    </>
  );
}

describe('the overlay stack (R6, F01, F12)', () => {
  beforeEach(async () => {
    await settle(); // the previous test's own step-backs land first
    replaceEntry({ view: 'train', depth: 0 });
  });
  afterEach(() => {
    resetOverlaysForTests();
    resetHistoryForTests();
  });

  it('pushes one history entry per open overlay', () => {
    const before = window.history.length;
    render(<Harness />);
    expect(overlayDepth()).toBe(2);
    expect(window.history.length - before).toBe(2);
    expect(currentEntry()).toEqual({ view: 'train', depth: 2 });
  });

  it('Escape closes the top overlay only', async () => {
    const { queryByTestId } = render(<Harness />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(queryByTestId('b')).toBeNull();
    expect(queryByTestId('a')).not.toBeNull();
    await settle();
    expect(currentEntry()).toEqual({ view: 'train', depth: 1 });
  });

  it('Back closes the top overlay, then the next, then switches view', async () => {
    replaceEntry({ view: 'today', depth: 0 });
    pushEntry({ view: 'train', depth: 0 });
    const shown: string[] = [];
    setViewShower((v) => {
      shown.push(v);
    });
    const { queryByTestId } = render(<Harness />);
    const back = async (): Promise<void> => {
      await act(async () => {
        window.history.back();
        await new Promise((resolve) => setTimeout(resolve, 20)); // [ms]
      });
    };
    await back();
    expect(queryByTestId('b')).toBeNull();
    expect(queryByTestId('a')).not.toBeNull();
    await back();
    expect(queryByTestId('a')).toBeNull();
    expect(overlayDepth()).toBe(0);
    expect(shown).toEqual(['train', 'train']);
    await back();
    expect(shown).toEqual(['train', 'train', 'today']);
  });

  it('locks the page scroll while a modal overlay is open, once', () => {
    const { unmount } = render(<Harness />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('a close by its own control steps back over its own entry', async () => {
    const spy = vi.spyOn(window.history, 'go');
    const { getByText } = render(<Harness />);
    await act(async () => {
      getByText('close b').click();
      await Promise.resolve(); // the step-back is issued in a microtask
    });
    expect(spy).toHaveBeenCalledWith(-1);
    await settle();
    expect(currentEntry()).toEqual({ view: 'train', depth: 1 });
  });

  it('two overlays closed together step back twice, to the view entry', async () => {
    const spy = vi.spyOn(window.history, 'go');
    const { getByText } = render(<Harness />);
    await act(async () => {
      getByText('close both').click();
      await Promise.resolve(); // the step-backs are issued together in a microtask
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(-2);
    await settle();
    expect(currentEntry()).toEqual({ view: 'train', depth: 0 });
  });

  it('works under fake timers too (no settle)', () => {
    vi.useFakeTimers();
    const { getByText } = render(<Harness />);
    act(() => {
      getByText('close b').click();
    });
    expect(overlayDepth()).toBe(1);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=1 src/ui/overlay`
Expected: FAIL to import `./overlayStack` and `../nav/history`.

- [ ] **Step 3: Implement history.ts and overlayStack.ts**

Create `src/ui/nav/history.ts`:

```ts
// src/ui/nav/history.ts
//
// The ONE owner of window.history and the ONE popstate listener (spec R6; audit F01, F12).
//
// Every history entry this app writes carries `{ fti: { view, depth } }`: the view on screen and
// how many overlays were open when the entry was written. Back (Android back, browser back, an
// iOS edge swipe in a browser tab) lands on an earlier entry, and `reconcile` makes the screen
// match it: overlays above the entry's depth close (top first), then the view switches. So back
// closes the top overlay first, then goes to the previous view, and an overlay never outlives
// the entry it was opened on.
//
// An overlay closed by its own control (not by Back) steps back over its own entry, so the
// stack and the history stay one-to-one. history.go() is asynchronous: the popstate it causes
// is counted in `selfPops` and swallowed, and any push requested before it lands is deferred
// until it has, so a push can never be undone by a traversal that was queued before it.
//
// Rejected: React Router or TanStack Router (spec R6: bundle weight, loaders unused); a dummy
// pushState per overlay with no view entries (audit F verdict: fixes back, leaves no per-view
// history).

export interface HistoryEntry {
  /** The view on screen when the entry was written (a ViewId; kept as string here). */
  view: string;
  /** [overlays] how many overlays were open when the entry was written. */
  depth: number;
}

const KEY = 'fti';

/** The entry a history state carries, or null for an entry this app did not write. */
export function entryOf(state: unknown): HistoryEntry | null {
  if (typeof state !== 'object' || state === null) return null;
  const raw = (state as Record<string, unknown>)[KEY];
  if (typeof raw !== 'object' || raw === null) return null;
  const { view, depth } = raw as Record<string, unknown>;
  if (typeof view !== 'string' || typeof depth !== 'number' || !Number.isInteger(depth) || depth < 0) {
    return null;
  }
  return { view, depth };
}

/** `#/today`: the hash a view entry is written under. */
export function hashFor(view: string): string {
  return `#/${view}`;
}

/** The view named by a `#/view` hash, or null. */
export function viewFromHash(hash: string): string | null {
  const m = /^#\/([a-z]+)$/.exec(hash);
  return m === null ? null : (m[1] ?? null);
}

/** Closes overlays until at most `depth` remain, top first. Set once by the overlay stack. */
let closeOverlaysTo: ((depth: number) => void) | null = null;
/** Shows a view (writes ui.lastView). Set by the router while the view shell is mounted. */
let showView: ((view: string) => void) | null = null;
let selfPops = 0; // [traversals] history.go() calls of ours whose popstate has not arrived yet
let pendingSteps = 0; // [entries] step-backs asked for in this task, not yet issued
let deferred: Array<() => void> = [];
let listening = false;

function flushDeferred(): void {
  const run = deferred;
  deferred = [];
  for (const f of run) f();
}

function inFlight(): boolean {
  return selfPops > 0 || pendingSteps > 0;
}

function onPopState(event: PopStateEvent): void {
  if (selfPops > 0) {
    selfPops -= 1;
    if (!inFlight()) flushDeferred();
    return;
  }
  const entry = entryOf(event.state);
  const depth = entry?.depth ?? 0; // [overlays]
  const view = entry?.view ?? viewFromHash(window.location.hash);
  closeOverlaysTo?.(depth);
  if (view !== null) showView?.(view);
}

function ensureListening(): void {
  if (listening) return;
  window.addEventListener('popstate', onPopState);
  listening = true;
}

/** The overlay stack registers its closer here, once, at module load. */
export function setOverlayCloser(fn: (depth: number) => void): void {
  ensureListening();
  closeOverlaysTo = fn;
}

/** The router registers the view switch here while the shell is mounted; null detaches it. */
export function setViewShower(fn: ((view: string) => void) | null): void {
  ensureListening();
  showView = fn;
}

/** The entry history is on now, or null if it is not one of ours. */
export function currentEntry(): HistoryEntry | null {
  return entryOf(window.history.state);
}

/** Replaces the current entry (cold start: the first view gets its hash without a new entry). */
export function replaceEntry(entry: HistoryEntry): void {
  ensureListening();
  window.history.replaceState({ [KEY]: entry }, '', hashFor(entry.view));
}

/** Adds one entry on top. Deferred while one of our own traversals is still in flight. */
export function pushEntry(entry: HistoryEntry): void {
  ensureListening();
  if (inFlight()) {
    deferred.push(() => {
      pushEntry(entry);
    });
    return;
  }
  window.history.pushState({ [KEY]: entry }, '', hashFor(entry.view));
}

/**
 * Steps back over one entry of our own; its popstate is swallowed. Step-backs asked for in one
 * task (two overlays closed together) are issued as ONE `history.go(-n)` in a microtask:
 * measured in jsdom (and not guaranteed by browsers), two synchronous `history.back()` calls
 * traverse once.
 */
export function stepBack(): void {
  ensureListening();
  pendingSteps += 1;
  if (pendingSteps > 1) return;
  queueMicrotask(() => {
    const steps = pendingSteps; // [entries]
    pendingSteps = 0;
    selfPops += 1;
    window.history.go(-steps);
  });
}

/**
 * Test seam (src/test/setup.ts, after every test): drop deferred pushes and the view switch.
 * `selfPops` is KEPT: a traversal the last test queued still arrives (jsdom delivers it on a
 * later task) and must be swallowed, not read as the next test's Back.
 */
export function resetHistoryForTests(): void {
  deferred = [];
  showView = null;
}
```

Create `src/ui/overlay/overlayStack.ts`:

```ts
// src/ui/overlay/overlayStack.ts
//
// One overlay stack for the whole app (spec R6; audit F12). Every dialog, sheet and full-screen
// layer that the user can dismiss registers here while it is on screen, and the stack owns the
// three things each of them used to do for itself:
//  - ONE Escape listener: Escape closes the top overlay only (two stacked ModalShells used to
//    close together on one press, F12);
//  - ONE history entry per open overlay, through src/ui/nav/history.ts: Back closes the top
//    overlay first and never leaves the app with one up (F01);
//  - ONE scroll lock: the page under a modal overlay does not scroll; the lock is taken by the
//    first modal and released by the last.
// z-order is NOT decided here: every layer takes a `--z-*` token in its own stylesheet
// (src/ui/styles/tokens.css), so the order is one ladder in one file.
import { useEffect, useRef } from 'react';
import { currentEntry, pushEntry, setOverlayCloser, stepBack, viewFromHash } from '../nav/history';

export interface OverlayOptions {
  /** A modal overlay locks the page scroll and owns Tab (ModalShell); a non-modal sheet does not. */
  modal: boolean;
}

interface Handle {
  id: number;
  close: () => void;
  modal: boolean;
  /** [overlays] the depth of the history entry this overlay pushed (1 = the first overlay). */
  depth: number;
  /** True once Back (or closeTo) has already consumed this overlay's history entry. */
  poppedByHistory: boolean;
}

const stack: Handle[] = [];
let nextId = 1;
/**
 * [entries] overlay entries this stack has pushed above the current view entry and not yet
 * stepped back over. One per open overlay, except while a close by control is still landing.
 */
let ownEntries = 0;
let keyListening = false;
let scrollLocked = false;
let overflowBeforeLock = '';

function syncScrollLock(): void {
  const wantLock = stack.some((h) => h.modal);
  if (wantLock && !scrollLocked) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    scrollLocked = true;
  } else if (!wantLock && scrollLocked) {
    document.body.style.overflow = overflowBeforeLock;
    scrollLocked = false;
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  const top = stack.at(-1);
  if (top === undefined) return;
  event.preventDefault();
  top.close();
}

function ensureKeyListener(): void {
  if (keyListening) return;
  window.addEventListener('keydown', onKeyDown);
  keyListening = true;
}

/**
 * Back landed on an entry written with `depth` overlays open: close the ones above it, top
 * first. Each is taken off the stack BEFORE its close runs, so its unmount does not step back
 * over an entry the browser has already left.
 */
export function closeOverlaysTo(depth: number): void {
  // The browser has already left every entry above `depth`.
  ownEntries = Math.min(ownEntries, depth);
  while (stack.length > depth) {
    const top = stack.pop();
    if (top === undefined) break;
    top.poppedByHistory = true;
    syncScrollLock();
    top.close();
  }
}

/**
 * A view switch that did not come from Back (a tab, Start, the palette) closes whatever overlay
 * is still open (only the non-modal rest-game sheet can be: a modal's scrim covers the tabs)
 * WITHOUT stepping back: the new view entry goes on top and the overlay entries under it become
 * plain stops on the way back, which reconcile to their view.
 */
export function abandonOverlaysForNavigation(): void {
  closeOverlaysTo(0);
}

// Back reaches the stack whether or not a router is mounted (a dialog in a unit test, the wizard).
setOverlayCloser(closeOverlaysTo);

/** [overlays] how many overlays are open. */
export function overlayDepth(): number {
  return stack.length;
}

/** Whether the overlay registered under `id` is the top one (ModalShell's focus trap asks). */
export function isTopOverlay(id: number): boolean {
  return stack.at(-1)?.id === id;
}

function viewNow(): string {
  return currentEntry()?.view ?? viewFromHash(window.location.hash) ?? 'today';
}

/** Registers an open overlay; returns its id and the release its unmount must call. */
export function openOverlay(close: () => void, options: OverlayOptions): { id: number; release: () => void } {
  ensureKeyListener();
  const handle: Handle = {
    id: nextId,
    close,
    modal: options.modal,
    depth: stack.length + 1,
    poppedByHistory: false,
  };
  nextId += 1;
  stack.push(handle);
  syncScrollLock();
  pushEntry({ view: viewNow(), depth: handle.depth });
  ownEntries += 1;
  let released = false;
  return {
    id: handle.id,
    release: () => {
      if (released) return;
      released = true;
      const index = stack.indexOf(handle);
      if (index !== -1) stack.splice(index, 1);
      syncScrollLock();
      if (handle.poppedByHistory) return;
      // Closed by its own control (or Escape): step back over one overlay entry, so the history
      // keeps exactly one entry per open overlay (two closed together step back twice).
      if (ownEntries > stack.length) {
        ownEntries -= 1;
        stepBack();
      }
    },
  };
}

/**
 * The hook every overlay calls while it is mounted (mounted = open). `onClose` is read at event
 * time, so an inline arrow is fine. Returns a ref holding this overlay's id for `isTopOverlay`.
 */
export function useOverlay(onClose: () => void, options: OverlayOptions): { readonly current: number } {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const idRef = useRef(0);
  const { modal } = options;
  useEffect(() => {
    const { id, release } = openOverlay(() => {
      closeRef.current();
    }, { modal });
    idRef.current = id;
    return release;
  }, [modal]);
  return idRef;
}

/** Test seam: empty the stack and drop the lock (src/test/setup.ts calls it after each test). */
export function resetOverlaysForTests(): void {
  stack.length = 0;
  ownEntries = 0;
  if (scrollLocked) {
    document.body.style.overflow = overflowBeforeLock;
    scrollLocked = false;
  }
}
```

- [ ] **Step 4: Reset the singletons between tests**

In `src/test/setup.ts` add after `import '@testing-library/jest-dom/vitest';`:

```ts
import { resetHistoryForTests } from '../ui/nav/history';
import { resetOverlaysForTests } from '../ui/overlay/overlayStack';
```

and replace

```ts
afterEach(() => {
  cleanup();
});
```

with

```ts
afterEach(() => {
  cleanup();
  // Spec R6: the overlay stack and the history owner are module singletons; one test's open
  // dialog must not be the next test's top overlay.
  resetOverlaysForTests();
  resetHistoryForTests();
});
```

- [ ] **Step 5: ModalShell registers with the stack**

In `src/ui/components/ModalShell.tsx`:
1. Delete the whole block from `/**\n * How many shells currently hold the scroll lock` through the closing `}` of `function acquireScrollLock(): () => void { ... }` (the module counter and the function; the stack owns the lock now).
2. After `import { useEffect, useRef } from 'react';` add `import { isTopOverlay, useOverlay } from '../overlay/overlayStack';`.
3. Replace the component's body from `export function ModalShell(props: ModalShellProps): ReactElement {` down to (not including) its `  return (` with:

```tsx
export function ModalShell(props: ModalShellProps): ReactElement {
  const { onClose } = props;
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Spec R6 / audit F12: Escape, Back and the scroll lock belong to the one overlay stack, so two
  // stacked shells close one at a time and the page is locked once.
  const overlayId = useOverlay(onClose, { modal: true });

  useEffect(() => {
    const panel = panelRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus lands on the panel, not on its first control: the dialog's name is read before
    // the user is handed a button they did not ask for.
    panel?.focus();

    const onKey = (e: KeyboardEvent): void => {
      // Tab only, and only in the TOP shell: a shell under another one does not trap (F12).
      if (e.key !== 'Tab' || panel === null || !isTopOverlay(overlayId.current)) return;

      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (first === undefined || last === undefined) {
        // A dialog with no controls still must not leak focus to the page behind it.
        e.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement;
      if (active === null || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      // The dialog unmounts on close, so this is where focus goes back to the control that
      // opened it. Focusing a detached node is a no-op, which covers the whole tree
      // unmounting at once.
      opener?.focus();
    };
  }, [overlayId]);
```

4. In the file's header comment replace `Escape and backdrop close, a focus\n// trap, focus restored to whatever opened the dialog, and a scroll lock on the body.` with `backdrop close, a focus trap (top\n// dialog only), focus restored to whatever opened the dialog; Escape, Back and the scroll lock\n// belong to the overlay stack (src/ui/overlay/overlayStack.ts, spec R6).`

- [ ] **Step 6: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/overlay src/ui/components src/ui/motivation`
Expected: PASS (`overlayStack.test.tsx` 7 tests; the existing `ModalShell.test.tsx`, `Spotlight.test.tsx`, `FormCuesModal.test.tsx`, `VideoModal.test.tsx`, `TimeCapsule.test.tsx`, `PhaseTransition.test.tsx` unchanged and green).
Then: `npx vitest run --maxWorkers=1 src/app src/ui/views src/ui/setup src/ui/intro`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -- src/ui/nav/history.ts src/ui/overlay/overlayStack.ts src/ui/overlay/overlayStack.test.tsx src/ui/components/ModalShell.tsx src/test/setup.ts
git commit -m "feat(shell): one history owner and one overlay stack; dialogs close one at a time and on Back (R6, F01, F12)"
```

---

### Task 5: Hash router, visited views kept mounted, per-view scroll (R6, F01, F02, F09; C17 wake lock)

**Files:**
- Create: `src/ui/nav/router.ts`, `src/ui/nav/router.test.tsx`, `src/ui/nav/viewActive.ts`
- Modify: `src/app/App.tsx` (imports; `ViewShell`; the digit bindings and the tab `onClick` in `ViewSwitch`; the seven `{view === '...' && <...View />}` lines; two new components above `useHydrateOnce`)
- Modify: `src/ui/nav/views.test.ts` (the "has a switch arm" assertion), `src/test/setup.ts`
- Modify: `src/ui/views/TrainView.tsx` (the `useWakeLock(true)` call)

**Interfaces:**
- Consumes: Task 4 `currentEntry`, `pushEntry`, `replaceEntry`, `setViewShower`, `abandonOverlaysForNavigation`.
- Produces: `goToView(view: ViewId): void` (a user-driven switch: restores that view's scroll; Task 7's tab bar and More sheet call it); `useHistoryRouter(view: ViewId): void`; `resetRouterForTests(): void`; `ViewActiveContext` and `useViewActive(): boolean` from `src/ui/nav/viewActive.ts`.

Design: `ui.lastView` stays the render source, so every writer that exists (tabs, digits, Today's Start, the palette, Train's Finish, Back to Today) keeps working unchanged; the router makes history follow it: the cold-start entry is replaced with `#/<view>`, each later change pushes one entry, Back lands on an earlier one and `history.ts` calls the view switch registered here. Scroll: one window scroller serves every view, so the leaving view's `scrollY` is saved in a synchronous store subscription (before React hides it) and restored when the switch came from a tab or Back; any other switch (Start, palette, Finish) opens the target at the top (F09). Every view visited since launch stays mounted under `hidden` (F02: typed set values, Targets drafts and Settings fields survive a tab switch), mounted on its first visit only. Train holds its wake lock only while a session is open AND Train is on screen (C17: it held one whenever mounted, and mounted now means visited). Measured in this plan's dry run: `src/app` (incl. `App.test.tsx`, 1309 lines) passes with views kept mounted and the router on; the only assertion that changes is `views.test.ts`'s source-text check for `view === 'id'`. Rejected: the hash as the source of truth (a hash one jsdom test leaves behind would choose the next test's view; `ui.lastView` already restores the view on a cold start); unmount-and-lift-drafts-to-the-store (every view's local drafts would need a store slice; F02 lists four kinds).

- [ ] **Step 1: Write the failing test**

Create `src/ui/nav/router.test.tsx`:

```tsx
// Spec R6 / audit F01, F09: history follows ui.lastView; Back switches view; a tab or Back
// restores the view's own scroll offset, any other switch opens the view at the top.
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { useAppStore } from '../../store';
import { currentEntry } from './history';
import { goToView, useHistoryRouter } from './router';
import { isViewId, type ViewId } from './views';

function Shell(): ReactElement {
  const stored = useAppStore((s) => s.ui.lastView);
  const view: ViewId = isViewId(stored) ? stored : 'today';
  useHistoryRouter(view);
  return <p data-testid="view">{view}</p>;
}

/** Resolves after jsdom has delivered a queued history traversal. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20)); // [ms]
  });
}

describe('the hash router (R6, F01, F09)', () => {
  beforeEach(async () => {
    await settle(); // a previous test's own step-backs land first
    useAppStore.getState().setUi({ lastView: 'today' });
  });

  it('replaces the cold-start entry with the view hash, then pushes one entry per view change', () => {
    const before = window.history.length;
    render(<Shell />);
    expect(currentEntry()).toEqual({ view: 'today', depth: 0 });
    expect(window.location.hash).toBe('#/today');
    act(() => {
      goToView('log');
    });
    expect(currentEntry()).toEqual({ view: 'log', depth: 0 });
    expect(window.location.hash).toBe('#/log');
    expect(window.history.length - before).toBe(1);
  });

  it('Back returns to the previous view without pushing a new entry', async () => {
    const { getByTestId } = render(<Shell />);
    act(() => {
      goToView('plan');
    });
    const length = window.history.length;
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20)); // [ms]
    });
    expect(getByTestId('view').textContent).toBe('today');
    expect(useAppStore.getState().ui.lastView).toBe('today');
    expect(window.history.length).toBe(length);
  });

  it('a tab restores the offset the view was left at; Start-style switches open at the top (F09)', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    render(<Shell />);
    Object.defineProperty(window, 'scrollY', { value: 600, configurable: true }); // [px] Today
    act(() => {
      goToView('plan');
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true }); // [px] Plan
    act(() => {
      goToView('today');
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 600, behavior: 'instant' });
    Object.defineProperty(window, 'scrollY', { value: 600, configurable: true });
    act(() => {
      // Today's Start writes the preference directly: the target opens at the top.
      useAppStore.getState().setUi({ lastView: 'train' });
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });
});
```

In `src/ui/nav/views.test.ts` replace

```ts
      expect(APP_SOURCE, `App.tsx routes no view '${id}'`).toContain(`view === '${id}'`);
```

with

```ts
      expect(APP_SOURCE, `App.tsx routes no view '${id}'`).toContain(`case '${id}':`);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/nav`
Expected: FAIL (`./router` does not exist; `App.tsx` has no `case 'today':`).

- [ ] **Step 3: The router and the view-active context**

Create `src/ui/nav/router.ts`:

```ts
// src/ui/nav/router.ts
//
// The hash router (spec R6; audit F01, F09). `ui.lastView` stays the one source of truth for
// which view renders, so every existing writer (a tab, a hotkey digit, Today's Start, the
// palette, Train's Finish) keeps working unchanged; this hook makes history follow it:
//  - cold start: the current entry is REPLACED with `#/<view>` (no new entry);
//  - every later change of the view PUSHES one entry, unless the change came from Back;
//  - Back lands on an earlier entry and history.ts closes overlays above it, then calls the
//    view switch registered here.
// Scroll (F09): one window scroller is shared by every view, so each view's offset is saved the
// moment the view changes (a synchronous store subscription, before React hides the old view)
// and restored when the change came from a tab or from Back; any other change (Start, the
// palette, Finish) opens the target at the top.
//
// Rejected: making the hash the source of truth (a hash left in jsdom by one test would decide
// the next test's view; a persisted lastView already gives cold-start restore).
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { abandonOverlaysForNavigation } from '../overlay/overlayStack';
import { currentEntry, pushEntry, replaceEntry, setViewShower } from './history';
import { isViewId, type ViewId } from './views';

/** How the next view change was asked for: from a tab or Back (restore), or by the app (top). */
let restoreNext = false;

/** A tab, the More sheet or a hotkey digit: the user is moving between views, not being moved. */
export function goToView(view: ViewId): void {
  restoreNext = true;
  useAppStore.getState().setUi({ lastView: view });
}

/** [px] the offset each view was left at. Module scope: one shell, one window scroller. */
const savedScroll = new Map<string, number>();

/** Test seam (src/test/setup.ts): forget offsets and the pending restore flag. */
export function resetRouterForTests(): void {
  savedScroll.clear();
  restoreNext = false;
}

export function useHistoryRouter(view: ViewId): void {
  // Captured synchronously when lastView changes, before the old view is hidden and the page
  // height (and so the clamped offset) changes under it.
  const restoreRef = useRef(false);
  useEffect(
    () =>
      useAppStore.subscribe((state, prev) => {
        if (state.ui.lastView === prev.ui.lastView) return;
        savedScroll.set(prev.ui.lastView, window.scrollY); // [px]
        restoreRef.current = restoreNext;
        restoreNext = false;
      }),
    [],
  );

  // Back: show the entry's view without pushing a new entry (the effect below sees it equal).
  useEffect(() => {
    setViewShower((next) => {
      if (!isViewId(next)) return;
      restoreNext = true;
      useAppStore.getState().setUi({ lastView: next });
    });
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    return () => {
      setViewShower(null);
    };
  }, []);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      replaceEntry({ view, depth: 0 });
      return;
    }
    if (currentEntry()?.view === view && currentEntry()?.depth === 0) return; // Back landed here
    abandonOverlaysForNavigation();
    pushEntry({ view, depth: 0 });
  }, [view]);

  useLayoutEffect(() => {
    const restore = restoreRef.current;
    restoreRef.current = false;
    // 'instant': a view switch is not a scroll the user should watch (brief section 6).
    window.scrollTo({ top: restore ? (savedScroll.get(view) ?? 0) : 0, behavior: 'instant' }); // [px]
  }, [view]);
}
```

Create `src/ui/nav/viewActive.ts`:

```ts
// src/ui/nav/viewActive.ts
//
// Audit F02 keeps every visited view mounted and hidden. A view that holds something only while
// it is ON SCREEN (Train's wake lock, audit C17) reads this instead of assuming mounted = shown.
import { createContext, useContext } from 'react';

/** True for the subtree of the view on screen; the shell provides it per view slot. */
export const ViewActiveContext = createContext(true);

export function useViewActive(): boolean {
  return useContext(ViewActiveContext);
}
```

In `src/test/setup.ts`: add `import { resetRouterForTests } from '../ui/nav/router';` after the overlay-stack import, add `  resetRouterForTests();` after `  resetHistoryForTests();` in the `afterEach`, and append at the end of the file:

```ts

// jsdom performs no layout and implements no scrolling: window.scrollTo logs "Not implemented"
// on every call. The router (src/ui/nav/router.ts) scrolls on every view switch, so every suite
// that mounts the shell would print it. A no-op stub; src/ui/nav/router.test.tsx spies on it.
if (typeof window !== 'undefined') {
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
}
```

- [ ] **Step 4: Wire the shell**

In `src/app/App.tsx`:
1. After `import { HotkeyProvider, useHotkeys } from '../ui/hotkeys';` add:

```ts
import { goToView, useHistoryRouter } from '../ui/nav/router';
import { ViewActiveContext } from '../ui/nav/viewActive';
```

and change `import { SPOTLIGHT_COMBO, VIEWS, VIEW_INSTRUCTIONS, VIEW_TITLES, isViewId } from '../ui/nav/views';` to import `VIEW_IDS` as well.
2. In `ViewShell`, after `  const view: ViewId = isViewId(stored) ? stored : 'targets';` add:

```ts
  // Spec R6: one history entry per view; Back closes the top overlay, then switches view.
  useHistoryRouter(view);
```

3. In `ViewSwitch`, in the `globalKeys` loop replace `        useAppStore.getState().setUi({ lastView: v.id });` with `        goToView(v.id);`, and in the tab `onClick` replace `              useAppStore.getState().setUi({ lastView: n.id });` with `              goToView(n.id);` (keep the comment above it).
4. Replace the seven lines from `      {view === 'targets' && <TargetsView />}` through `      {view === 'atlas' && <AtlasView />}` with `      <ViewStack view={view} />`.
5. Immediately above the doc comment of `function useHydrateOnce(): void` add:

```tsx
/** The component each view id renders. A switch, so a ninth ViewId is a compile error here. */
function renderView(id: ViewId): ReactElement {
  switch (id) {
    case 'targets':
      return <TargetsView />;
    case 'settings':
      return <SettingsView />;
    case 'today':
      return <TodayView />;
    case 'plan':
      return <PlanView />;
    case 'train':
      return <TrainView />;
    case 'log':
      return <LogView />;
    case 'atlas':
      return <AtlasView />;
  }
}

/**
 * Audit F02: every view visited since launch stays MOUNTED and is hidden when another is shown,
 * so a half-typed set, a Targets draft or a Settings field survives a tab switch. A view is
 * mounted on its first visit, never before (cold start pays for one view, not seven).
 */
function ViewStack({ view }: { view: ViewId }): ReactElement {
  const [visited, setVisited] = useState<ReadonlySet<ViewId>>(() => new Set([view]));
  if (!visited.has(view)) setVisited(new Set([...visited, view]));
  return (
    <>
      {VIEW_IDS.filter((id) => visited.has(id) || id === view).map((id) => (
        <div key={id} className="view-slot" data-view={id} hidden={id !== view}>
          <ViewActiveContext value={id === view}>{renderView(id)}</ViewActiveContext>
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 5: Train holds its wake lock only on screen with a session open (C17)**

In `src/ui/views/TrainView.tsx` add `import { useViewActive } from '../nav/viewActive';` to the imports, and replace

```ts
  useWakeLock(true);
```

with

```ts
  // C17: a visited Train view stays mounted (F02), so "mounted" no longer means "on screen".
  // The lock is held while a session is open and Train is the view shown.
  const viewActive = useViewActive();
  useWakeLock(open !== null && viewActive);
```

(`open` is P1 Task 12's `const open = useOpenAssignment();`, declared above this call; if it is declared below it in the file, move that one line above.) Update the comment block above the call ("Held for as long as this view is mounted") to "Held while a session is open and this view is on screen (C17)".

- [ ] **Step 6: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/nav src/app`
Expected: PASS (`router.test.tsx` 3 tests).
Run: `npx vitest run --maxWorkers=1 src/ui/views src/ui/hooks`
Expected: PASS. If a `TrainView.test.tsx` case asserts that `navigator.wakeLock.request` is called on mount with no session open, it now pins the C17 defect: change only its expectation to "not called" and add `// C17: no lock without an open session` beside it.

- [ ] **Step 7: Commit**

```bash
git add -- src/ui/nav/router.ts src/ui/nav/router.test.tsx src/ui/nav/viewActive.ts src/ui/nav/views.test.ts src/app/App.tsx src/test/setup.ts src/ui/views/TrainView.tsx $(git diff --name-only -- src/ui/views/TrainView.test.tsx)
git commit -m "feat(shell): hash router, visited views kept mounted, per-view scroll, wake lock only on screen (R6, F01, F02, F09, C17)"
```

---

### Task 6: One sheet language for dialogs; the palette as a phone sheet (F11); Konami on the stack (F12)

**Files:**
- Create: `src/ui/overlay/sheet.css`, `src/ui/overlay/sheetStyles.test.ts`
- Modify: `src/ui/components/ModalShell.tsx` (new optional prop `sheet`), and the seven callers that opt in: `FormCuesModal.tsx`, `VideoModal.tsx`, `Spotlight.tsx`, `TimeCapsule.tsx` (both shells), `PhaseTransition.tsx`, `src/ui/motivation/MotivationModal.tsx`, `src/ui/views/AtlasView.tsx`
- Modify (geometry declarations removed): `src/ui/styles/train.css` (`.vmod-bg, .fcm-bg`; `.vmod, .fcm`), `src/ui/components/timeCapsule.css` (`.capsule-panel-bg`, `.capsule-panel`), `src/ui/views/atlas.css` (`.atlas .atlas-modal-bg`, `.atlas .atlas-modal`), `src/ui/components/phaseTransition.css` (`.phase-bg`, `.phase`), `src/ui/motivation/motivation.css` (`.mmod-bg`, `.mmod`), `src/ui/components/spotlight.css` (`.spotlight-bg`, `.spotlight`, `.spotlight-item.is-active`)
- Modify: `src/ui/components/Spotlight.tsx` (focus effect; element order), `src/ui/components/KonamiOverlay.tsx`, `src/ui/components/konami.css` (`.konami button`)
- Test: `src/ui/components/Spotlight.test.tsx` (one describe appended), `src/ui/components/KonamiOverlay.test.tsx` (one describe appended), `src/app/App.test.tsx` (the palette test ~:658-679)

**Interfaces:**
- Consumes: Task 1 tokens (`--scrim`, `--z-modal`, `--header-h`, `--space-4`, `--dur-base`, `--ease-out`); Task 4 `useOverlay`, `overlayDepth`.
- Produces: `ModalShellProps.sheet?: 'reading' | 'face'` (`'reading'`: lime ground, ink type, 2 px ink top rule; `'face'`: the sheet geometry only, the panel paints itself, used by the Atlas card); classes `.overlay-scrim`, `.sheet`, `.sheet-reading` (Task 7's More sheet uses `sheet="reading"`); `finePointer(): boolean` exported from `Spotlight.tsx`.

Design (brief 5.1): every reading dialog becomes one bottom-docked, full-width, square-cornered sheet over the one `--scrim`, capped at `100svh - header - safe top - 16 px` (a `vh` line first, P6 D3), inner scroll contained, safe-area padded, entering by 16 px + opacity over `--dur-base` (none under reduced motion). Their own CSS keeps content layout and loses geometry. The wizard's guidance modals and the intro are not in the brief's list and keep their own geometry (`sheet` omitted). Palette on touch (F11): no autofocus unless the primary pointer is fine (a phone would raise the keyboard over the results), the query field moves below the results so the keyboard pushes the field, not the list, and the active row is the pink sticker (ink on pink 7.75:1; it was ink on black, 1:1). Konami (F12): registers with the stack (one Escape, Back closes it) and its detector ignores keys typed into a field or pressed while another overlay is open. Deviation from brief 5.1: no shared 44 px close control is added; each dialog keeps the close control it already has (a second one would duplicate it).

- [ ] **Step 1: Write the failing tests**

Create `src/ui/overlay/sheetStyles.test.ts`:

```ts
// Brief 5.1: one sheet geometry for every reading dialog, read from the sheets' text.
import { describe, expect, it } from 'vitest';
import sheetCss from './sheet.css?raw';
import trainCss from '../styles/train.css?raw';
import capsuleCss from '../components/timeCapsule.css?raw';
import atlasCss from '../views/atlas.css?raw';
import phaseCss from '../components/phaseTransition.css?raw';
import motivationCss from '../motivation/motivation.css?raw';
import spotlightCss from '../components/spotlight.css?raw';

function bodyOf(css: string, selector: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
    (m) => (m[1] ?? '').trim().replace(/\s+/g, ' ') === selector,
  );
  if (rule === undefined) throw new Error(`no rule ${selector}`);
  return rule[2] ?? '';
}

describe('one sheet language (brief 5.1)', () => {
  it('the scrim is the token, fixed, at the modal rung, docking its sheet to the bottom', () => {
    const b = bodyOf(sheetCss, '.overlay-scrim');
    expect(b).toMatch(/position:\s*fixed;/);
    expect(b).toMatch(/z-index:\s*var\(--z-modal\);/);
    expect(b).toMatch(/background:\s*var\(--scrim\);/);
    expect(b).toMatch(/align-items:\s*flex-end;/);
  });

  it('the sheet is square, capped by svh after a vh fallback, safe-area padded, scroll-contained', () => {
    const b = bodyOf(sheetCss, '.sheet');
    expect(b).toMatch(/border-radius:\s*0;/);
    expect(b).toMatch(
      /max-height:\s*calc\(100vh - var\(--header-h\) - var\(--space-4\)\);[\s\S]*max-height:\s*calc\(100svh - var\(--header-h\) - env\(safe-area-inset-top\) - var\(--space-4\)\);/,
    );
    expect(b).toMatch(/overscroll-behavior:\s*contain;/);
    expect(b).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(b).toMatch(/animation:\s*sheet-in var\(--dur-base\) var\(--ease-out\);/);
  });

  it('a reading sheet is lime with ink type under a 2 px ink top rule', () => {
    const b = bodyOf(sheetCss, '.sheet-reading');
    expect(b).toMatch(/background:\s*var\(--lime\);/);
    expect(b).toMatch(/color:\s*var\(--ink\);/);
    expect(b).toMatch(/border-top:\s*2px solid var\(--ink\);/);
  });

  it('stops the entrance under reduced motion', () => {
    expect(sheetCss).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.sheet\s*\{\s*animation:\s*none;/);
  });

  it('no dialog sheet restates position, z-index or a scrim of its own', () => {
    const backdrops: Array<[string, string]> = [
      [trainCss, '.vmod-bg, .fcm-bg'],
      [capsuleCss, '.capsule-panel-bg'],
      [atlasCss, '.atlas .atlas-modal-bg'],
      [phaseCss, '.phase-bg'],
      [motivationCss, '.mmod-bg'],
      [spotlightCss, '.spotlight-bg'],
    ];
    for (const [css, selector] of backdrops) {
      const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
      const rule = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
        (m) => (m[1] ?? '').trim().replace(/\s+/g, ' ') === selector,
      );
      // A rule emptied by the move is deleted, which passes too.
      expect(rule?.[2] ?? '', selector).not.toMatch(/position:|z-index:|background:/);
    }
  });

  it('the palette marks its active row as the pink sticker (F06: it was ink on black)', () => {
    const b = bodyOf(spotlightCss, '.spotlight-item.is-active');
    expect(b).toMatch(/background:\s*var\(--accent\);/);
    expect(b).toMatch(/color:\s*var\(--ink\);/);
  });
});
```

Append to `src/ui/components/Spotlight.test.tsx` (it already imports `render`, `screen`, `vi`, `describe`, `it`, `expect`; add any missing name to its existing imports):

```tsx
describe('the palette on a phone (F11)', () => {
  it('does not raise the keyboard on a coarse pointer, and puts the field below the results', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)', media: query }));
    render(<Spotlight open onClose={() => undefined} />);
    const field = screen.getByRole('combobox');
    expect(document.activeElement).not.toBe(field);
    const list = screen.getByRole('listbox');
    expect(list.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('focuses the field when the primary pointer is fine (a keyboard is at hand)', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: fine)', media: query }));
    render(<Spotlight open onClose={() => undefined} />);
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
    vi.unstubAllGlobals();
  });
});
```

Append to `src/ui/components/KonamiOverlay.test.tsx` (reuse that file's own sequence helper; if it has none, the `CODE` list below is the sequence the file's header documents):

```tsx
describe('Konami and the overlay stack (F12)', () => {
  const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

  function Detector({ onActivate }: { onActivate: () => void }): null {
    useKonamiCode(onActivate);
    return null;
  }

  it('ignores the sequence typed into a field', () => {
    const onActivate = vi.fn();
    render(
      <>
        <Detector onActivate={onActivate} />
        <input aria-label="field" />
      </>,
    );
    const field = screen.getByLabelText('field');
    for (const key of CODE) fireEvent.keyDown(field, { key });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('ignores the sequence while another overlay is open', () => {
    const onActivate = vi.fn();
    const { release } = openOverlay(() => undefined, { modal: true });
    render(<Detector onActivate={onActivate} />);
    for (const key of CODE) fireEvent.keyDown(window, { key });
    expect(onActivate).not.toHaveBeenCalled();
    release();
  });

  it('closes once on Escape, through the stack', () => {
    const onClose = vi.fn();
    render(<KonamiOverlay onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

(with `import { openOverlay } from '../overlay/overlayStack';` and `fireEvent` added to the file's imports.)

In `src/app/App.test.tsx`, in `it('opens from the nav button, with the query box focused, and closes on Escape', ...)`, rename it to `'opens from the nav button and closes on Escape (F11: no autofocus on touch)'` and replace

```ts
    const queryBox = screen.getByRole('combobox');
    // Focus is the palette's whole point: it opens onto a query the user types immediately.
    expect(document.activeElement).toBe(queryBox);
```

with

```ts
    const queryBox = screen.getByRole('combobox');
    // F11: jsdom has no matchMedia, which the palette reads as "not a fine pointer": the
    // keyboard is not raised over the results. Spotlight.test.tsx covers the fine-pointer case.
    expect(document.activeElement).not.toBe(queryBox);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/overlay/sheetStyles.test.ts src/ui/components/Spotlight.test.tsx src/ui/components/KonamiOverlay.test.tsx`
Expected: FAIL (`sheet.css` missing; the field is focused and sits above the list; Konami fires inside a field and over an open overlay).

- [ ] **Step 3: sheet.css and ModalShell**

Create `src/ui/overlay/sheet.css`:

```css
/*
 * One sheet language (docs/design/p4-design-brief.md 5.1). Every reading dialog (form cues, the
 * video chooser, the palette, More, the time capsule, the missed-week popup, the block cutscene)
 * and the Atlas card dock to the bottom edge at full width over the one scrim. ModalShell adds
 * these classes when its caller passes `sheet`; the dialogs' own sheets keep content layout only.
 */
.overlay-scrim {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: var(--scrim);
}

.sheet {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  max-width: 34rem;
  /* vh first: Safari < 15.4 and Chrome < 108 have no svh (P6 D3). */
  max-height: calc(100vh - var(--header-h) - var(--space-4));
  max-height: calc(100svh - var(--header-h) - env(safe-area-inset-top) - var(--space-4));
  overflow-y: auto;
  overscroll-behavior: contain;
  margin: 0;
  padding: var(--space-4) max(var(--space-4), env(safe-area-inset-right))
    calc(var(--space-4) + env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
  border-radius: 0;
  animation: sheet-in var(--dur-base) var(--ease-out);
}

.sheet-reading {
  background: var(--lime);
  color: var(--ink);
  border: 0;
  border-top: 2px solid var(--ink);
}

@keyframes sheet-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheet {
    animation: none;
  }
}
```

In `src/ui/components/ModalShell.tsx`:
- add `import '../overlay/sheet.css';` after the overlay-stack import;
- in `ModalShellProps`, after `testId: string;` add:

```ts
  /**
   * Brief 5.1: dock as a bottom sheet. 'reading' also paints lime with ink type; 'face' leaves
   * the panel's own ground (the Atlas card). Omitted: the caller's CSS owns the geometry (the
   * wizard's guidance modals and the intro, which the brief does not list).
   */
  sheet?: 'reading' | 'face';
```

- in the returned JSX replace `className={props.backdropClassName}` with `className={props.sheet === undefined ? props.backdropClassName : \`overlay-scrim ${props.backdropClassName}\`}` and the panel's `className={props.className}` with `className={props.sheet === undefined ? props.className : \`sheet${props.sheet === 'reading' ? ' sheet-reading' : ''} ${props.className}\`}`.

Pass the prop: `sheet="reading"` on the `<ModalShell` in `FormCuesModal.tsx`, `VideoModal.tsx`, `Spotlight.tsx`, both in `TimeCapsule.tsx`, `PhaseTransition.tsx`, `MotivationModal.tsx`; `sheet="face"` in `AtlasView.tsx`.

- [ ] **Step 4: Drop the dialogs' own geometry**

Delete exactly these declarations (keep every other line of each rule; a rule left empty is deleted):
- `src/ui/styles/train.css`, `.vmod-bg, .fcm-bg`: `position`, `inset`, `z-index`, `background`, `display`, `align-items`, `justify-content`, `padding`. `.vmod, .fcm`: `background`, `border`, `color`, `width`, `max-height`, `overflow-y`.
- `src/ui/components/timeCapsule.css`, `.capsule-panel-bg`: `position`, `inset`, `display`, `align-items`, `justify-content`, `padding`, `background`, `z-index`. `.capsule-panel`: `width`, `max-height`, `overflow-y`, `padding`, `border`, `background`, `color`.
- `src/ui/views/atlas.css`, `.atlas .atlas-modal-bg`: `position`, `inset`, `z-index`, `background`, `display`, `align-items`, `justify-content`, `padding`. `.atlas .atlas-modal`: `width`, `max-height`, `overflow-y`, `padding` (the card face keeps its own ground).
- `src/ui/components/phaseTransition.css`, `.phase-bg`: `position`, `inset`, `z-index`, `display`, `align-items`, `justify-content`, `padding`, `background`. `.phase`: `width`, `max-height`, `overflow`, `padding`, `color`, `background`, `border`.
- `src/ui/motivation/motivation.css`, `.mmod-bg`: `position`, `inset`, `z-index`, `display`, `align-items`, `justify-content`, `padding`, `background`. `.mmod`: `width`, `max-height`, `overflow-y`, `padding`, `color`, `background`, `border`.
- `src/ui/components/spotlight.css`, `.spotlight-bg`: `position`, `inset`, `z-index`, `display`, `justify-content`, `align-items`, `padding`, `background`. `.spotlight`: `width`, `max-height`, `overflow-y`, `padding`, `border`, `border-radius`, `background`, `color`.

Then replace the `.spotlight-item.is-active` rule and the comment above it with:

```css
/* The active row is the pink sticker (brief 5.1; F06 left it ink on black, 1:1): ink on pink
 * 7.75:1, marked by fill AND by a 2 px ink edge, never by colour alone. */
.spotlight-item.is-active {
  background: var(--accent);
  color: var(--ink);
  box-shadow: inset 0 0 0 2px var(--ink);
}
```

and in `.spotlight-kind` and `.spotlight-hint` replace `color: var(--text-3)` / `color: var(--text-2)` with `color: inherit;` (both now sit on lime or on the pink row, where `--fine` is 3.54:1).

- [ ] **Step 5: The palette on a phone (F11)**

In `src/ui/components/Spotlight.tsx`:
1. Above `export function Spotlight(` add:

```ts
/**
 * F11: whether the primary pointer is fine (a mouse or trackpad, so a keyboard is at hand).
 * On a phone, focusing the field raises the soft keyboard over the results; there the user taps
 * the field. jsdom has no matchMedia, which reads as "not fine".
 */
export function finePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
}
```

2. In the open/close effect replace `      inputRef.current?.focus();` with `      if (finePointer()) inputRef.current?.focus();`, and in the comment above it replace `On open, the query box takes the caret.` with `On open, the query box takes the caret where the pointer is fine (F11); on touch the panel keeps focus.`
3. Move the whole `<input ref={inputRef} ... />` element (with its comment) from above the `<ul id={listId} ...>` to after the `<p id={emptyId} role="status" ...>...</p>` element, so the order inside the shell is: title, list, empty line, field. Add the comment `{/* F11: the field sits at the sheet's bottom edge, results above it, so the soft keyboard pushes the field and never covers the list. */}` above it.

- [ ] **Step 6: Konami joins the stack (F12)**

In `src/ui/components/KonamiOverlay.tsx`:
1. Add `import { overlayDepth, useOverlay } from '../overlay/overlayStack';`.
2. In `useKonamiCode`'s `onKey`, as its first lines add:

```ts
      // F12: a key typed into a field is text, and a key pressed over another overlay belongs to
      // that overlay; neither feeds the sequence.
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      if (overlayDepth() > 0) return;
```

3. In `KonamiOverlay`, after `const dismissRef = useRef<HTMLButtonElement>(null);` add:

```ts
  // F12: one Escape and Back close it, through the one stack, like every other overlay.
  useOverlay(onClose, { modal: true });
```

and in its any-key effect change `const onKey = (): void => {\n      latest.current();\n    };` to:

```ts
    const onKey = (e: KeyboardEvent): void => {
      // Escape is the stack's (one close per press); every other key still dismisses.
      if (e.key === 'Escape') return;
      latest.current();
    };
```

4. In `src/ui/components/konami.css` replace the `.konami button { ... }` rule's `color: inherit;`, `background: var(--bg-3);` and `border: 1px solid var(--line-2);` with `color: var(--ink);`, `background: var(--lime);` and `border: 2px solid var(--ink);` (brief 7: the dismiss control was ink on black, 1:1; lime with ink type on the black card is 10.91:1), and its `:focus-visible` outline with `outline: var(--focus-on-panel);`.

- [ ] **Step 7: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/overlay src/ui/components src/ui/motivation src/ui/views/AtlasView.test.tsx`
Expected: PASS.
Run: `npx vitest run --maxWorkers=1 src/app src/ui/styles`
Expected: PASS. If `src/ui/styles/limeContrast.test.ts` pins a colour on one of the deleted `.phase`, `.capsule-panel`, `.mmod` or `.spotlight` declarations, replace that row's sheet/selector with `sheet.css` `.sheet-reading` and its value with the one Step 3 wrote (ink on lime, 10.91:1); do not weaken its threshold.

- [ ] **Step 8: Commit**

```bash
git add -- src/ui/overlay/sheet.css src/ui/overlay/sheetStyles.test.ts src/ui/components/ModalShell.tsx src/ui/components/FormCuesModal.tsx src/ui/components/VideoModal.tsx src/ui/components/Spotlight.tsx src/ui/components/TimeCapsule.tsx src/ui/components/PhaseTransition.tsx src/ui/motivation/MotivationModal.tsx src/ui/views/AtlasView.tsx src/ui/styles/train.css src/ui/components/timeCapsule.css src/ui/views/atlas.css src/ui/components/phaseTransition.css src/ui/motivation/motivation.css src/ui/components/spotlight.css src/ui/components/KonamiOverlay.tsx src/ui/components/konami.css src/ui/components/Spotlight.test.tsx src/ui/components/KonamiOverlay.test.tsx src/app/App.test.tsx $(git diff --name-only -- src/ui/styles/limeContrast.test.ts)
git commit -m "feat(overlays): one bottom-sheet language, palette for phones, Konami on the stack (brief 5.1, F11, F12)"
```

---

### Task 7: Fixed bottom tab bar and the More sheet (brief 2.2; F05; icons behind one map)

**Files:**
- Modify: `src/ui/nav/views.ts` (types and constants appended above `isViewId`), `src/ui/nav/views.test.ts`
- Create: `src/ui/nav/TabBar.tsx`, `src/ui/nav/MoreSheet.tsx`, `src/ui/nav/tabBar.css`, `src/ui/nav/TabBar.test.tsx`
- Modify: `src/app/App.tsx` (`ViewSwitch`: the `<nav className="viewnav">` block, palette and More state), `src/app/appShell.css` (the `.viewnav` rules removed; `main` bottom padding)
- Delete: `src/ui/components/SpotlightButton.tsx`, `src/ui/components/SpotlightButton.test.tsx` (the More sheet's "find it" row replaces it)
- Modify: `src/content/copy.ts` (`nav.more`), `src/content/__fixtures__/limelight-resolved.json`
- Test: `src/app/App.test.tsx` (five nav assertions, quoted in Step 5), `src/ui/styles/stickerStates.test.ts` (the active-tab row)

**Interfaces:**
- Consumes: Task 5 `goToView`; Task 6 `ModalShellProps.sheet`; `Icon` from `src/skins/limelight/Icon.tsx`; icon names `crownPanel`, `barbellPanel`, `dropPanel`, `archivePanel`, `morePanel`, `heel`, `heart`, `fan`, `megaphone` (all in `src/skins/limelight/icons.ts` after the design-branch merge).
- Produces: `type TabSlot = ViewId | 'more'`; `TAB_ORDER: readonly TabSlot[]`; `MORE_VIEWS: readonly ViewId[]` (derived); `TAB_ICONS: Readonly<Partial<Record<TabSlot, LimelightIconName>>>`; `MORE_ICONS: Readonly<Partial<Record<ViewId | 'find', LimelightIconName>>>`; `TabBar(props: { view: ViewId; moreOpen: boolean; onMore: () => void })`; `MoreSheet(props: { view: ViewId; onClose: () => void; onFind: () => void })`; copy key `nav.more` (base `More`).

Design (brief 2.2, ruling 0): primary tabs Today, Train, Targets, Log, More, fixed to the bottom on the black lit-sign surface; More opens a reading sheet with Plan, Atlas, Settings and "find it". The order is ONE array and the icons ONE map in `views.ts`; More's rows are derived (every view not in the bar), so the owner can reorder or swap icons after his review (pending; nothing here blocks on it). The hotkey digits stay VIEWS positions. `main` pads its bottom by the bar plus the home indicator. Rejected: 6 tabs (53 px slots at 320 px; "the numbers" is 57.6 px [brief, measured]); icon-only tabs (owner labels are the identity); a lime bar (blends with content).

- [ ] **Step 1: Write the failing tests**

Create `src/ui/nav/TabBar.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../content/copy';
import { useAppStore } from '../../store';
import { MoreSheet } from './MoreSheet';
import { TabBar } from './TabBar';
import { MORE_VIEWS, TAB_ORDER, VIEWS, type TabSlot } from './views';

/** The base-table label of a slot, read through the registry as TabBar reads it. */
const labelOf = (slot: TabSlot): string =>
  copy(slot === 'more' ? 'nav.more' : (VIEWS.find((v) => v.id === slot)?.copyKey ?? 'nav.more'));

describe('the bottom tab bar (brief 2.2)', () => {
  beforeEach(() => {
    useAppStore.getState().setUi({ lastView: 'today', hotkeys: true });
  });

  it('renders the slots of TAB_ORDER, in order, as one navigation landmark', () => {
    render(<TabBar view="today" moreOpen={false} onMore={() => undefined} />);
    const nav = screen.getByRole('navigation', { name: copy('nav.label') });
    const names = within(nav)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual(TAB_ORDER.map(labelOf));
  });

  it('marks the view on screen as the current page, and More while a More view is shown', () => {
    const { rerender } = render(<TabBar view="train" moreOpen={false} onMore={() => undefined} />);
    expect(screen.getByRole('button', { name: copy('nav.train') })).toHaveAttribute('aria-current', 'page');
    rerender(<TabBar view="settings" moreOpen={false} onMore={() => undefined} />);
    expect(screen.getByRole('button', { name: copy('nav.more') })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: copy('nav.train') })).not.toHaveAttribute('aria-current');
  });

  it('a tab switches the view; More asks for the sheet', () => {
    const onMore = vi.fn();
    render(<TabBar view="today" moreOpen={false} onMore={onMore} />);
    fireEvent.click(screen.getByRole('button', { name: copy('nav.log') }));
    expect(useAppStore.getState().ui.lastView).toBe('log');
    fireEvent.click(screen.getByRole('button', { name: copy('nav.more') }));
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('More lists every view the bar does not hold, then the palette row', () => {
    const onClose = vi.fn();
    const onFind = vi.fn();
    render(<MoreSheet view="atlas" onClose={onClose} onFind={onFind} />);
    const sheet = screen.getByRole('dialog', { name: copy('nav.more') });
    const rows = within(sheet).getAllByRole('button').map((b) => b.textContent);
    expect(rows).toEqual([...MORE_VIEWS.map(labelOf), copy('button.openSpotlight')]);
    expect(within(sheet).getByRole('button', { name: copy('nav.atlas') })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(within(sheet).getByRole('button', { name: copy('nav.plan') }));
    expect(onClose).toHaveBeenCalled();
    expect(useAppStore.getState().ui.lastView).toBe('plan');
  });

  it('the palette row closes the sheet and opens the palette', () => {
    const onClose = vi.fn();
    const onFind = vi.fn();
    render(<MoreSheet view="today" onClose={onClose} onFind={onFind} />);
    fireEvent.click(screen.getByRole('button', { name: copy('button.openSpotlight') }));
    expect(onClose).toHaveBeenCalled();
    expect(onFind).toHaveBeenCalled();
  });
});
```


Append to `src/ui/nav/views.test.ts` (add `MORE_ICONS, MORE_VIEWS, TAB_ICONS, TAB_ORDER` to its `./views` import and `import TABBAR_SOURCE from './TabBar.tsx?raw';`):

```ts

describe('the tab bar order and icons (brief 2.2, section 8)', () => {
  it('holds four views and More, each once', () => {
    expect(TAB_ORDER.filter((s) => s === 'more')).toHaveLength(1);
    expect(new Set(TAB_ORDER).size).toBe(TAB_ORDER.length);
    expect(TAB_ORDER.filter((s) => s !== 'more')).toHaveLength(4);
  });

  it('reaches every view exactly once: in the bar or in More (MORE_VIEWS is derived)', () => {
    const reached = [...TAB_ORDER.filter((s) => s !== 'more'), ...MORE_VIEWS].sort();
    expect(reached).toEqual([...VIEW_IDS].sort());
  });

  it('has an icon for every bar slot and every More row, so a reorder names its gap', () => {
    for (const slot of TAB_ORDER) expect({ slot, icon: TAB_ICONS[slot] !== undefined }).toEqual({ slot, icon: true });
    for (const row of [...MORE_VIEWS, 'find' as const]) {
      expect({ row, icon: MORE_ICONS[row] !== undefined }).toEqual({ row, icon: true });
    }
  });

  it('bar icons are Panel variants (lime outline on the black bar)', () => {
    for (const slot of TAB_ORDER) expect(TAB_ICONS[slot]).toMatch(/Panel$/);
  });
});
```

and replace the body of `it('is read by the strip through the copy key, not through the baked label', ...)` from its first `expect(` line to its end with:

```ts
    expect(TABBAR_SOURCE).not.toMatch(/\.label\}/);
    expect(TABBAR_SOURCE).toMatch(/def\.copyKey/);
    expect(TABBAR_SOURCE).not.toMatch(/aria-label=\{copy\(/);
```

In `src/ui/styles/stickerStates.test.ts`: add `import tabBarCss from '../nav/tabBar.css?raw';`, and replace the `STICKERS` row `['active nav tab', ".viewnav button[aria-current='true']"],` with `['active nav tab', ".tabbar .tab[aria-current='page']::before"],` and `const css = selector.startsWith('.viewnav') ? shellCss : viewsCss;` with `const css = selector.startsWith('.tabbar') ? tabBarCss : viewsCss;`; then, because the sticker's ink TYPE is on the tab itself and its fill on the `::before`, replace that `it.each` body's three `expect` lines with:

```ts
    expect(valueOf(body, 'background')).toBe('var(--accent)');
    expect(valueOf(body, 'border')).toBe('2px solid var(--ink)');
    const type = selector.startsWith('.tabbar')
      ? valueOf(ruleFor(tabBarCss, ".tabbar .tab[aria-current='page']").body, 'color')
      : valueOf(body, 'color');
    expect(type).toBe('var(--ink)');
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/nav src/ui/styles/stickerStates.test.ts`
Expected: FAIL (no `TabBar`, `MoreSheet`, `TAB_ORDER`; `nav.more` is not a key).

- [ ] **Step 3: The copy key**

In `src/content/copy.ts` add `  | 'nav.more'` after the union line `  | 'nav.atlas'`, and after the table line `  'nav.atlas': 'Atlas',` add:

```ts
  // P4 design brief 2.2: the fifth bottom-bar slot, opening Plan, Atlas, Settings and the
  // palette. Base table only; the owner words the limelight label (brief section 9).
  'nav.more': 'More',
```

Then:

```bash
node -e "const fs=require('fs');const p='src/content/__fixtures__/limelight-resolved.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));Object.assign(d,{'nav.more':'More'});fs.writeFileSync(p,JSON.stringify(d)+'\n');"
```

- [ ] **Step 4: Registry, components, CSS**

In `src/ui/nav/views.ts` add `import type { LimelightIconName } from '../../skins/limelight/icons';` after the `CopyKey` import, and insert above `/** Whether a persisted \`lastView\` string names a view this build actually has. */`:

```ts
/** A bottom-bar slot: a view, or 'more', which opens the More sheet (P4 design brief 2.2). */
export type TabSlot = ViewId | 'more';

/**
 * The bottom tab bar, left to right (brief 2.2). THE one place the owner reorders the bar. Every
 * view not listed is reached from the More sheet (MORE_VIEWS, derived below); the hotkey digits
 * stay VIEWS' positions whatever this order is.
 */
export const TAB_ORDER: readonly TabSlot[] = ['today', 'train', 'targets', 'log', 'more'];

/** The views the More sheet lists, in VIEWS order: DERIVED, so a view is in exactly one place. */
export const MORE_VIEWS: readonly ViewId[] = VIEW_IDS.filter((id) => !TAB_ORDER.includes(id));

/**
 * THE icon map for the bar and the More sheet (brief section 8). Owner review of `dropPanel`,
 * `archivePanel`, `morePanel` and the More-row mapping is pending: swapping an icon is one edit
 * here and nothing else. Bar icons are `Panel` variants (lime outline for the black bar); More
 * rows are lime-ground icons. Partial on purpose: views.test.ts asserts every slot in TAB_ORDER
 * and every row in MORE_VIEWS has one, so a reordered bar names its missing icon.
 */
export const TAB_ICONS: Readonly<Partial<Record<TabSlot, LimelightIconName>>> = {
  today: 'crownPanel',
  train: 'barbellPanel',
  targets: 'dropPanel',
  log: 'archivePanel',
  more: 'morePanel',
};

/** More-sheet row icons; `find` is the palette row ("find it"). */
export const MORE_ICONS: Readonly<Partial<Record<ViewId | 'find', LimelightIconName>>> = {
  plan: 'heel',
  atlas: 'heart',
  settings: 'fan',
  find: 'megaphone',
};
```

Create `src/ui/nav/TabBar.tsx`:

```tsx
// src/ui/nav/TabBar.tsx
//
// The fixed bottom tab bar (P4 design brief 2.2; audit F05): five equal slots on the black
// lit-sign surface, a 32 px pixel icon over the owner's label, the current slot a pink sticker.
// Bottom, not top: the top edge is the far reach for one thumb, and 7 labels need 854 px [brief].
// Order and icons come from src/ui/nav/views.ts (TAB_ORDER, TAB_ICONS); nothing is listed here.
import type { ReactElement } from 'react';
import { useCopy } from '../../content/useCopy';
import { Icon } from '../../skins/limelight/Icon';
import { useAppStore } from '../../store';
import { goToView } from './router';
import { MORE_VIEWS, TAB_ICONS, TAB_ORDER, VIEWS, type ViewId } from './views';
import './tabBar.css';

export interface TabBarProps {
  /** The view on screen. */
  view: ViewId;
  /** Whether the More sheet is open (the More slot's aria-expanded). */
  moreOpen: boolean;
  onMore: () => void;
}

export function TabBar(props: TabBarProps): ReactElement {
  const { view, moreOpen, onMore } = props;
  const c = useCopy();
  // WCAG 2.1 SC 2.1.4: announce a digit only while the digits work.
  const hotkeysOn = useAppStore((s) => s.ui.hotkeys);

  return (
    <nav className="tabbar" aria-label={c('nav.label')}>
      {TAB_ORDER.map((slot) => {
        const def = slot === 'more' ? null : (VIEWS.find((v) => v.id === slot) ?? null);
        // The More slot is the current one while Plan, Atlas or Settings is shown (brief 2.2).
        const current = slot === 'more' ? MORE_VIEWS.includes(view) : slot === view;
        const icon = TAB_ICONS[slot];
        return (
          <button
            key={slot}
            type="button"
            className="tab"
            aria-current={current ? 'page' : undefined}
            aria-expanded={slot === 'more' ? moreOpen : undefined}
            aria-keyshortcuts={hotkeysOn && def !== null ? String(def.digit) : undefined}
            onClick={() => {
              if (slot === 'more') onMore();
              else goToView(slot);
            }}
          >
            {icon !== undefined && <Icon name={icon} width={32} height={32} />}
            <span className="tab-label">{c(def === null ? 'nav.more' : def.copyKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

Create `src/ui/nav/MoreSheet.tsx`:

```tsx
// src/ui/nav/MoreSheet.tsx
//
// The More sheet (P4 design brief 2.2): the views the bar does not hold (MORE_VIEWS: Plan,
// Atlas, Settings) and the palette ("find it"), as 44 px rows with an icon and the owner's label,
// the current view's row a sticker. A reading sheet on the one overlay stack (ModalShell), so
// Android Back and Escape close it before anything else.
import { useId, type ReactElement } from 'react';
import { useCopy } from '../../content/useCopy';
import { Icon } from '../../skins/limelight/Icon';
import { useAppStore } from '../../store';
import { ModalShell } from '../components/ModalShell';
import { displayClass } from '../format/display';
import { goToView } from './router';
import { MORE_ICONS, MORE_VIEWS, VIEWS, type ViewId } from './views';
import './tabBar.css';

export interface MoreSheetProps {
  view: ViewId;
  onClose: () => void;
  /** Opens the palette; the sheet closes first. */
  onFind: () => void;
}

export function MoreSheet(props: MoreSheetProps): ReactElement {
  const { view, onClose, onFind } = props;
  const c = useCopy();
  const titleId = useId();
  const hotkeysOn = useAppStore((s) => s.ui.hotkeys);
  const findIcon = MORE_ICONS.find;

  return (
    <ModalShell
      labelledBy={titleId}
      className="more-sheet"
      backdropClassName="more-sheet-bg"
      testId="more-sheet"
      onClose={onClose}
      sheet="reading"
    >
      <h2 id={titleId} className={displayClass(c('nav.more'))}>
        {c('nav.more')}
      </h2>
      <ul className="more-rows">
        {MORE_VIEWS.map((id) => {
          const def = VIEWS.find((v) => v.id === id);
          if (def === undefined) return null;
          const icon = MORE_ICONS[id];
          return (
            <li key={id}>
              <button
                type="button"
                className="more-row"
                aria-current={id === view ? 'page' : undefined}
                aria-keyshortcuts={hotkeysOn ? String(def.digit) : undefined}
                onClick={() => {
                  // Close first: the sheet's history entry is stepped back over before the view's
                  // own entry is pushed (src/ui/nav/history.ts defers the push until it lands).
                  onClose();
                  goToView(id);
                }}
              >
                {icon !== undefined && <Icon name={icon} width={32} height={32} />}
                <span>{c(def.copyKey)}</span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className="more-row"
            onClick={() => {
              onClose();
              onFind();
            }}
          >
            {findIcon !== undefined && <Icon name={findIcon} width={32} height={32} />}
            <span>{c('button.openSpotlight')}</span>
          </button>
        </li>
      </ul>
    </ModalShell>
  );
}
```

Create `src/ui/nav/tabBar.css`:

```css
/*
 * The bottom tab bar and the More sheet's rows (docs/design/p4-design-brief.md 2.2).
 *
 * Bar: fixed to the bottom edge on the black panel with a 2 px ink top rule, height --tabbar-h
 * plus the home-indicator inset. Equal slots (grid-auto-columns), whatever TAB_ORDER's length.
 * Label: Archivo 12 px, 600, 75 % width, lime on black 10.91:1. Widest owner label "the numbers"
 * is 57.6 px [brief, measured] in a 64 px slot at 320 px.
 */
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-dock);
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  box-sizing: border-box;
  height: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
  padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  background: var(--panel);
  border-top: 2px solid var(--ink);
}

.tabbar .tab {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  min-height: var(--tabbar-h);
  margin: 0;
  padding: var(--space-1) 2px;
  background: transparent;
  color: var(--lime);
  border: 0;
  font-family: var(--sans);
  font-size: var(--text-xs);
  font-weight: 600;
  font-stretch: 75%;
  letter-spacing: 0.02em;
  line-height: 1.1;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
}

/* 32 x 32 pixel art at 1x: integer scale, crisp at 2x and 3x DPR. */
.tabbar .tab img {
  width: 32px;
  height: 32px;
  image-rendering: pixelated;
}

.tabbar .tab-label {
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
}

/* Current: a pink sticker block inset 4 px behind icon and label, ink label (7.75:1). */
.tabbar .tab[aria-current='page'] {
  color: var(--ink);
}

.tabbar .tab[aria-current='page']::before {
  content: '';
  position: absolute;
  inset: 4px;
  z-index: -1;
  background: var(--accent);
  border: 2px solid var(--ink);
}

/* Pressed: icon and label shift 1 px down; no colour flash (brief 2.2). */
.tabbar .tab:active > * {
  transform: translateY(1px);
}

.tabbar .tab:focus-visible {
  outline: var(--focus-on-panel);
  outline-offset: -2px;
}

/* More sheet rows: 44 px, icon + owner label, the current view a sticker. */
.more-rows {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}

.more-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: var(--tap);
  padding: var(--space-1) var(--space-3);
  background: var(--lime);
  color: var(--ink);
  border: 1px solid var(--ink);
  font-family: var(--sans);
  font-size: var(--text-md);
  text-align: left;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
}

.more-row img {
  width: 32px;
  height: 32px;
  image-rendering: pixelated;
}

.more-row[aria-current='page'] {
  background: var(--accent);
  border: 2px solid var(--ink);
}
```

In `src/app/appShell.css`: delete the whole `.viewnav` block (from the comment `/*\n * View navigation (P2 Task 8).` through the closing `}` of `.viewnav button[aria-current='true'] { ... }`), and add to the `main { ... }` rule (the first one, outside the media query):

```css
  /* The fixed tab bar and the home indicator cover the last 56 px + inset (brief 2.2). */
  padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--space-4));
```

and in the `@media (max-width: 820px) { main { ... } }` rule replace `padding: 18px 14px 40px;` with `padding: 18px 14px calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--space-4));` (Task 8 sets the side gutters).

- [ ] **Step 5: Wire the shell**

In `src/app/App.tsx`:
1. Replace `import { SpotlightButton } from '../ui/components/SpotlightButton';` with `import { MoreSheet } from '../ui/nav/MoreSheet';\nimport { TabBar } from '../ui/nav/TabBar';`.
2. In `ViewSwitch`, after the `closeSpotlight` callback add:

```ts
  // Brief 2.2: the More sheet, opened from the fifth slot.
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => {
    setMoreOpen(false);
  }, []);
```

3. Delete the `hotkeysOn` selector and its comment, and the `c` (`useCopy()`) call and its comment, from `ViewSwitch` if nothing else in it reads them after the next step (TabBar reads both itself).
4. Replace the whole `<nav className="viewnav" ...> ... </nav>` element (with the `SpotlightButton` inside it) by nothing, and after `      <ViewStack view={view} />` add:

```tsx
      {/* Brief 2.2: the fixed bottom bar; More opens the sheet with the other views and the palette. */}
      <TabBar
        view={view}
        moreOpen={moreOpen}
        onMore={() => {
          setMoreOpen(true);
        }}
      />
      {moreOpen && (
        <MoreSheet
          view={view}
          onClose={closeMore}
          onFind={() => {
            setSpotlightOpen(true);
          }}
        />
      )}
```

5. Delete `src/ui/components/SpotlightButton.tsx` and `src/ui/components/SpotlightButton.test.tsx` (`git rm`); move its `.spotlight-open` rule out of `src/ui/components/spotlight.css` (delete it with its comment).

In `src/app/App.test.tsx` (the default-table tests; `copy` is the base table there):
- `it('switches view on a nav tap and records it', ...)`: replace `    await userEvent.click(screen.getByRole('button', { name: copy('nav.plan') }));` with `    await userEvent.click(screen.getByRole('button', { name: copy('nav.more') }));\n    await userEvent.click(screen.getByRole('button', { name: copy('nav.plan') }));`, and its `aria-current` assertion on `copy('nav.plan')` with `expect(screen.getByRole('button', { name: copy('nav.more') })).toHaveAttribute('aria-current', 'page');`.
- `describe('spotlight palette')`: replace `    const nav = screen.getByRole('navigation', { name: copy('nav.label') });\n    await userEvent.click(\n      within(nav).getByRole('button', { name: copy('button.openSpotlight') }),\n    );` with `    await userEvent.click(screen.getByRole('button', { name: copy('nav.more') }));\n    await userEvent.click(screen.getByRole('button', { name: copy('button.openSpotlight') }));`, and rename the test to `'opens from More, find it, and closes on Escape (F11: no autofocus on touch)'`. If `within` is then unused in the file, drop it from the import.
- `it('switches view on the digit the registry gives it', ...)`: replace its `aria-current` assertion with `expect(screen.getByRole('button', { name: copy('nav.more') })).toHaveAttribute('aria-current', 'page');`.
- `it('names the digit each tab answers to, for assistive technology', ...)`: replace `name: copy('nav.plan')` with `name: copy('nav.train')` and `digitFor('plan')` with `digitFor('train')` in its second assertion.
- `it('reaches the Atlas, which is a tab like any other', ...)`: rename to `'reaches the Atlas from More and by its digit'` and replace `    await userEvent.click(screen.getByRole('button', { name: copy('nav.atlas') }));` with `    await userEvent.click(screen.getByRole('button', { name: copy('nav.more') }));\n    await userEvent.click(screen.getByRole('button', { name: copy('nav.atlas') }));`.

- [ ] **Step 6: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/nav src/ui/styles src/app src/content`
Expected: PASS (`TabBar.test.tsx` 5 tests; `copy.test.ts` "finds a call site or a frame for every key" finds `nav.more` in `TabBar.tsx`).
Run: `npx vitest run --maxWorkers=1 src/ui/components src/skins`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git rm -q -- src/ui/components/SpotlightButton.tsx src/ui/components/SpotlightButton.test.tsx
git add -- src/ui/nav/views.ts src/ui/nav/views.test.ts src/ui/nav/TabBar.tsx src/ui/nav/MoreSheet.tsx src/ui/nav/tabBar.css src/ui/nav/TabBar.test.tsx src/app/App.tsx src/app/App.test.tsx src/app/appShell.css src/ui/components/spotlight.css src/content/copy.ts src/content/__fixtures__/limelight-resolved.json src/ui/styles/stickerStates.test.ts
git commit -m "feat(shell): fixed bottom tab bar and More sheet; one order and one icon map in views.ts (brief 2.2, F05)"
```

---

### Task 8: One-line header with safe area, one gutter, footer on Settings, vignette off for new installs (brief 2.1, 2.3, 2.4, 4.4; F04, F07, F15)

**Files:**
- Modify: `src/app/App.tsx` (`TopbarTicker`, `VIEW_ICONS` and their imports deleted; `<SiteFooter />` moved out), `src/app/appShell.css` (`.topbar`, `.topbar .brand`, `.topbar-title`, `.topbar .ll-marquee`, `main`, `.banner`), `src/ui/views/views.css` (`.view`), `src/ui/views/SettingsView.tsx` (footer at the end), `src/ui/components/siteFooter.css`
- Modify: `src/ui/nav/views.ts` (`VIEW_INSTRUCTIONS` deleted), `src/content/copy.ts` (nine keys deleted), `src/content/limelightParity.test.ts` (`REMOVED_KEYS`)
- Modify: `src/domain/schema.ts` (`defaultState()`: `scanlines: false`)
- Test: `src/app/topbar.test.ts` (describe appended), `src/app/App.test.tsx` (`describe('top bar')` replaced, `describe('site footer')` replaced), `src/domain/schema.test.ts` (one case appended)

**Interfaces:**
- Consumes: Task 1 tokens; Task 7 `main` bottom padding.
- Produces: nothing new. Removed: `VIEW_INSTRUCTIONS`; copy keys `advice.setupInstruction`, `advice.todayInstruction`, `advice.planInstruction`, `advice.trainInstruction`, `advice.targetsInstruction`, `advice.logInstruction`, `advice.atlasInstruction`, `advice.settingsInstruction`, `button.pauseUpdates` (their only renderer was the ticker).

Design: the header is one 44 px line: brand, a 1 px separator, the page title (13 px, may shrink with an ellipsis, never to one letter: F07). The ticker goes (brief ruling 0: its text rendered black on black since it shipped, D4; the session position it carried is on Today and moves into Train's title row, Task 13); owner-visible, listed for his review page (brief section 9 item 2). Safe area (F04): the header pads `env(safe-area-inset-top)` and its sides `max(gutter, inset)`; no `backdrop-filter` (F15: compositor cost on an opaque bar). One gutter (brief 2.3): `main` has no side padding, `.view` pads `max(16px, inset)`, so content is viewport - 32 px. The footer renders only at the end of Settings with a 44 px link target (brief 2.4). New documents start with the CRT vignette off (brief 4.4); a stored document keeps the `scanlines` it carries (rule 7: the field is required, so every stored document carries one). Rejected: fixing the ticker colour and keeping it (it is what squeezed the title to one letter, F07).

- [ ] **Step 1: Write the failing tests**

Append to `src/app/topbar.test.ts`:

```ts

describe('one-line header with safe area (P4 brief 2.1; F04, F07, F15)', () => {
  const rule = (selector: string): string => {
    const clean = shellCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const m = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((r) => (r[1] ?? '').trim() === selector);
    if (m === undefined) throw new Error(`appShell.css: no rule ${selector}`);
    return m[2] ?? '';
  };

  it('is 44 px plus the top inset, border included, with inset-aware side padding', () => {
    const b = rule('.topbar');
    expect(b).toMatch(/box-sizing:\s*border-box;/);
    expect(b).toMatch(/height:\s*calc\(var\(--header-h\) \+ env\(safe-area-inset-top\)\);/);
    expect(b).toMatch(/padding-top:\s*env\(safe-area-inset-top\);/);
    expect(b).toMatch(/padding-left:\s*max\(var\(--gutter\), env\(safe-area-inset-left\)\);/);
    expect(b).toMatch(/padding-right:\s*max\(var\(--gutter\), env\(safe-area-inset-right\)\);/);
    expect(b).toMatch(/z-index:\s*var\(--z-header\);/);
  });

  it('carries no backdrop blur (F15)', () => {
    expect(shellCss).not.toMatch(/backdrop-filter/);
  });

  it('lets the title take the rest of the line and ellipsise, never collapse to a letter (F07)', () => {
    const b = rule('.topbar-title');
    expect(b).toMatch(/flex:\s*1 1 auto;/);
    expect(b).toMatch(/min-width:\s*0;/);
    expect(b).toMatch(/text-overflow:\s*ellipsis;/);
    expect(b).toMatch(/font-size:\s*13px;/);
  });

  it('main has no side gutter of its own (brief 2.3: one gutter, on .view)', () => {
    const phone = shellCss.slice(shellCss.indexOf('@media (max-width: 820px)'));
    expect(phone).toMatch(/main \{\s*padding:\s*var\(--space-4\) 0 calc\(var\(--tabbar-h\) \+ env\(safe-area-inset-bottom\) \+ var\(--space-4\)\);/);
  });
});
```

In `src/app/App.test.tsx` replace the whole `describe('top bar', () => { ... });` block (and the doc comment above it) with:

```tsx
/**
 * P4 design brief 2.1, ruling 0: the header is one line, brand and page title; the ticker that
 * rendered black on black (D4) is gone. The title itself stays covered by
 * describe('the top bar banner') below.
 */
describe('top bar', () => {
  beforeEach(() => {
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  });

  it('holds the brand and the page title, and no ticker', () => {
    useAppStore.setState(seedState({ labels: ['Push'], weekdays: [1], startedOn: MONDAY }));
    render(<App />);
    const header = screen.getByRole('banner');
    expect(within(header).getByTestId('topbar-title')).toBeInTheDocument();
    expect(header.querySelector('.ll-marquee')).toBeNull();
  });
});
```

and replace the whole `describe('site footer', () => { ... });` block with:

```tsx
/** P4 design brief 2.4: the footer sits at the end of Settings only (it was on every screen). */
describe('site footer', () => {
  beforeEach(() => {
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  });

  it('is not part of setup or of Today', () => {
    render(<App />);
    expect(screen.queryByText(copy('footer.licence'))).toBeNull();
  });

  it('renders at the end of Settings, carrying the on-device promise', () => {
    useAppStore.setState(seedState({ labels: ['Push'], weekdays: [1], startedOn: MONDAY }));
    render(<App />);
    expect(screen.queryByText(copy('advice.dataOnDevice'))).toBeNull();
    act(() => {
      useAppStore.getState().setUi({ lastView: 'settings' });
    });
    expect(screen.getByText(copy('advice.dataOnDevice'))).toBeTruthy();
  });
});
```

Append to `src/domain/schema.test.ts` (inside its outermost `describe`, or as a new `describe` if it has none):

```ts

describe('the CRT vignette default (P4 brief 4.4; rule 7)', () => {
  it('is off for a new document', () => {
    expect(defaultState().ui.scanlines).toBe(false);
  });

  it('keeps the value a stored document carries', () => {
    const stored = { ...defaultState(), ui: { ...defaultState().ui, scanlines: true } };
    const result = parseState(JSON.parse(JSON.stringify(stored)));
    expect(result.ok && result.state.ui.scanlines).toBe(true);
  });
});
```

(`defaultState` and `parseState` are exported by `src/domain/schema.ts`; add whichever the file does not import yet.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/app/topbar.test.ts src/app/App.test.tsx src/domain/schema.test.ts`
Expected: FAIL (two-part header with backdrop blur; the marquee is in the banner; the footer renders during setup; the default is `true`).

- [ ] **Step 3: Header, gutter, footer CSS**

In `src/app/appShell.css` replace the `.topbar { ... }`, `.topbar .brand { ... }`, `.topbar-title { ... }` and `.topbar .ll-marquee { ... }` rules (with their comments) by:

```css
/*
 * The one-line header (docs/design/p4-design-brief.md 2.1): 44 px plus the status-bar inset on
 * an installed iPhone (viewport-fit=cover, black-translucent: F04), brand then page title. No
 * backdrop-filter: the bar is opaque, so a blur only cost compositor time on every scroll (F15).
 */
.topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-header);
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: calc(var(--header-h) + env(safe-area-inset-top));
  padding-top: env(safe-area-inset-top);
  padding-left: max(var(--gutter), env(safe-area-inset-left));
  padding-right: max(var(--gutter), env(safe-area-inset-right));
  background: var(--topbar-bg);
  border-bottom: 1px solid var(--line);
  font-size: 13px;
  color: var(--topbar-text);
  letter-spacing: 0.04em;
}

.topbar .brand {
  font-family: var(--sans);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--topbar-brand);
  /* The brand never shrinks; the title beside it does. */
  flex-shrink: 0;
}

.topbar .brand .acc {
  color: var(--accent);
  margin: 0 2px;
}

/*
 * The page title (round 2, r2-onboarding.general), read with the brand behind a 1 px rule. It
 * takes the rest of the line and ellipsises: the user's own name has no length bound (F07: it
 * was squeezed to one letter by the ticker that sat beside it).
 */
.topbar-title {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--sans);
  font-weight: 600;
  font-size: 13px;
  color: var(--topbar-brand);
  padding-left: var(--space-2);
  margin-left: var(--space-2);
  /* White on the black bar (21:1); --line-2 is ink and vanished there. */
  border-left: 1px solid var(--topbar-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```


In the `@media (max-width: 820px) { main { ... } }` rule replace the `padding:` line with `padding: var(--space-4) 0 calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--space-4));`, and add after the `.banner { ... }` rule:

```css
/* Banners sit in main, which has no side gutter at phone width (brief 2.3). */
@media (max-width: 820px) {
  main > .banner {
    margin-inline: var(--gutter);
  }
}
```

In `src/ui/views/views.css` replace the `.view { ... }` rule with:

```css
/*
 * One gutter (brief 2.3): main has none at phone width, the view pads max(16 px, the side
 * inset), so content is viewport - 32 px (288 / 358 / 380 px at 320 / 390 / 412).
 */
.view {
  max-width: 34rem;
  margin: 0 auto;
  padding: 0 max(var(--gutter), env(safe-area-inset-right)) var(--space-6) max(var(--gutter), env(safe-area-inset-left));
}
```

In `src/ui/components/siteFooter.css` replace `  padding: 18px 18px 28px;` with `  padding: var(--space-4) 0 var(--space-5);\n  margin-top: var(--space-6);`, and the `.site-footer a { ... }` rule with:

```css
/* A 44 px tall target (brief 2.4: it was 53 x 12 px), still a fact rather than a CTA. */
.site-footer a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}
```

- [ ] **Step 4: Shell code**

In `src/app/App.tsx`:
1. Delete `function TopbarTicker(): ReactElement | null { ... }` with its doc comment (the comment begins with the duplicated `/**` line above "The top bar's moving instruction"), the `VIEW_ICONS` constant with its doc comment, and `<TopbarTicker />` with the comment above it in the header.
2. Delete `<SiteFooter />` and its comment, and the `SiteFooter` import.
3. Remove `VIEW_INSTRUCTIONS` from the `../ui/nav/views` import, and delete the imports that are now unused (`Marquee`, `MarqueeItem`, `LimelightIconName`, `useActivePlan`, `useActiveCursor`); run `npx tsc -p tsconfig.app.json --noEmit` to list any other.

In `src/ui/views/SettingsView.tsx` add `import { SiteFooter } from '../components/SiteFooter';` and, in the main `return (` of the component that renders `<section className="view">` with `hero.profile`, insert immediately before its closing `</section>`:

```tsx
      {/* Brief 2.4: the footer belongs to Settings, the one screen it is quiet beneath. */}
      <SiteFooter />
```

In `src/ui/nav/views.ts` delete `VIEW_INSTRUCTIONS` and its doc comment, and in the `VIEW_TITLES` comment replace the two mentions of `` `VIEW_INSTRUCTIONS` `` with "the old header ticker's instruction".

In `src/content/copy.ts` delete the nine keys listed under Interfaces from the `CopyKey` union and from `DEFAULT_COPY` (and from `src/content/copy.limelight.ts` if any appears there: `grep -n "Instruction'\|pauseUpdates" src/content/copy.limelight.ts`). In `src/content/limelightParity.test.ts` add above `const REMOVED_KEYS`:

```ts
/** P4 design brief ruling 0 / D4: the header ticker, their only renderer, is removed. */
const TICKER = 'the header ticker (rendered black on black since it shipped) is removed; brief ruling 0';
```

and inside `REMOVED_KEYS`:

```ts
  'advice.setupInstruction': TICKER,
  'advice.todayInstruction': TICKER,
  'advice.planInstruction': TICKER,
  'advice.trainInstruction': TICKER,
  'advice.targetsInstruction': TICKER,
  'advice.logInstruction': TICKER,
  'advice.atlasInstruction': TICKER,
  'advice.settingsInstruction': TICKER,
  'button.pauseUpdates': TICKER,
```

(The fixture keeps their rows, as the parity test's header requires for a removed key.)

In `src/domain/schema.ts`, inside `defaultState()`'s `ui: { ... }`, replace `      scanlines: true,` with:

```ts
      // P4 brief 4.4: the CRT vignette starts off for a NEW document. A stored one keeps the
      // value it carries (rule 7; `scanlines` is required, so every stored document has one).
      scanlines: false,
```

- [ ] **Step 5: Run**

Run: `npx vitest run --maxWorkers=1 src/app src/content src/domain/schema.test.ts src/ui/nav src/ui/views/SettingsView.test.tsx src/ui/components/SiteFooter.test.tsx`
Expected: PASS. `TodayView.test.tsx`'s marquee tests read Today's OWN marquee (`.ll-marquee-static` inside the view), which stays.
Run: `npx vitest run --maxWorkers=1 src/domain src/ui/views`
Expected: PASS. If a test asserts `defaultState().ui.scanlines` is `true`, it pins the old default: change that one expectation to `false`.

- [ ] **Step 6: Commit**

```bash
git add -- src/app/App.tsx src/app/App.test.tsx src/app/appShell.css src/app/topbar.test.ts src/ui/views/views.css src/ui/views/SettingsView.tsx src/ui/components/siteFooter.css src/ui/nav/views.ts src/content/copy.ts src/content/limelightParity.test.ts src/domain/schema.ts src/domain/schema.test.ts $(git diff --name-only -- src/content/copy.limelight.ts src/domain src/ui/views)
git commit -m "feat(shell): one-line safe-area header, one gutter, footer on Settings, vignette off for new installs (brief 2.1-2.4, 4.4; F04, F07, F15)"
```

---

### Task 9: Toasts at the top, taps pass through, actions split from state (brief 5.2; F03, F13)

**Files:**
- Modify: `src/ui/components/ToastQueue.tsx` (`ToastApi`, `ToastContext`, `ToastProvider`, `useToasts`, `ToastShell`, the Escape guard in `ToastQueue`), `src/ui/components/toastQueue.css` (`.toast-stack`, `.toast`, `@keyframes toast-in`, the three `border-left-color` rules)
- Modify: `src/ui/views/TrainView.tsx`, `src/app/StaleSessionNotice.tsx` (read the actions hook)
- Test: `src/ui/components/ToastQueue.test.tsx` (the tap test ~:494 rewritten; one describe appended), `src/ui/components/toastStyles.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 tokens; Task 4 `overlayDepth()`.
- Produces: `interface ToastActions { push: (input: ToastInput) => string; dismiss: (id: string) => void; clear: () => void }`; `useToastActions(): ToastActions` (stable identity; a reader does not re-render when the queue changes); `useToasts(): ToastApi` keeps its shape (`queue`, `visible` and the three actions) for the queue component and the tests.

Design (brief 5.2): one compact sign under the header (`top: header + safe top + 8 px`), at most one visible, at most 96 px tall, `--z-toast` (above sheets and the dock, below modals). Its BODY takes no pointer events, only its own buttons do, so a toast can no longer swallow the tap meant for the next Log button (F03/C08); the tap-anywhere dismiss goes (Dismiss and Undo remain real buttons; Escape remains). The class mark moves from a 2 px pink LEFT rule (craft floor: no coloured side rule over 1 px) to a 2 px TOP rule. Inside 96 px a specimen toast shows its tag and title; the card's body and source live in the Atlas (unchanged). Enter from -8 px over `--dur-base`, none under reduced motion. F13: the provider exposes two contexts, actions (stable) and state, so TrainView and the stale-session notice stop re-rendering on every push, dismiss and expiry. Rejected: bottom toasts above a reserved band (it would sit exactly where the rest bar and the Log button live, brief ruling 0).

- [ ] **Step 1: Write the failing tests**

Create `src/ui/components/toastStyles.test.ts`:

```ts
// Brief 5.2: where the toast sits and what it may intercept, read from the sheet's text.
import { describe, expect, it } from 'vitest';
import toastCss from './toastQueue.css?raw';

function bodyOf(selector: string): string {
  const clean = toastCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const m = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
    (r) => (r[1] ?? '').trim().replace(/\s+/g, ' ') === selector,
  );
  if (m === undefined) throw new Error(`toastQueue.css: no rule ${selector}`);
  return m[2] ?? '';
}

describe('toasts at the top, compact, tap-through (brief 5.2; F03, C08)', () => {
  it('stack sits under the header, inside the gutter, on the toast rung', () => {
    const b = bodyOf('.toast-stack');
    expect(b).toMatch(/top:\s*calc\(var\(--header-h\) \+ env\(safe-area-inset-top\) \+ var\(--space-2\)\);/);
    expect(b).not.toMatch(/bottom:/);
    expect(b).toMatch(/width:\s*min\(32rem, calc\(100vw - 2 \* var\(--gutter\)\)\);/);
    expect(b).toMatch(/z-index:\s*var\(--z-toast\);/);
    expect(b).toMatch(/pointer-events:\s*none;/);
  });

  it('the toast body takes no taps and is at most 96 px; only its buttons take taps', () => {
    const b = bodyOf('.toast');
    expect(b).toMatch(/pointer-events:\s*none;/);
    expect(b).toMatch(/max-height:\s*96px;/);
    expect(bodyOf('.toast button')).toMatch(/pointer-events:\s*auto;/);
  });

  it('marks the class with a top rule, never a side rule over 1 px (craft floor)', () => {
    const clean = toastCss.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(clean).not.toMatch(/border-left:\s*[2-9]px/);
    expect(clean).not.toMatch(/border-left-color/);
    expect(bodyOf('.toast')).toMatch(/border-top:\s*2px solid var\(--accent\);/);
  });

  it('enters from 8 px above over --dur-base', () => {
    expect(bodyOf('.toast')).toMatch(/animation:\s*toast-in var\(--dur-base\) var\(--ease-out\);/);
    expect(toastCss).toMatch(/@keyframes toast-in\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*translateY\(-8px\);/);
  });
});
```

In `src/ui/components/ToastQueue.test.tsx` replace the whole `it('dismisses on a tap anywhere on an ordinary toast', ...)` block with:

```tsx
  it('a tap on the toast body does nothing: the tap belongs to the control under it (F03)', () => {
    renderQueue();
    act(() => {
      api!.push({ kind: 'telemetry', message: 'set banked' });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('toast'));
    });
    expect(api!.queue).toHaveLength(1);
  });
```

and append:

```tsx
describe('actions are split from state (F13)', () => {
  it('a reader of the actions does not re-render when the queue changes', () => {
    let renders = 0;
    let actions: ToastActions | null = null;
    function Reader(): null {
      renders += 1;
      actions = useToastActions();
      return null;
    }
    render(
      <ToastProvider>
        <Reader />
        <ToastQueue />
      </ToastProvider>,
    );
    expect(renders).toBe(1);
    act(() => {
      actions!.push({ kind: 'coach', message: 'nice' });
    });
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    expect(renders).toBe(1);
  });
});
```

(add `useToastActions` and `type ToastActions` to the file's import from `./ToastQueue`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/components/toastStyles.test.ts src/ui/components/ToastQueue.test.tsx`
Expected: FAIL (bottom stack; tap dismisses; `useToastActions` not exported).

- [ ] **Step 3: Split the contexts**

In `src/ui/components/ToastQueue.tsx`:
1. Replace `interface ToastApi {` and its body through the closing `}` with:

```ts
/** What a caller does to the queue. Stable identities: reading this never re-renders on a toast. */
export interface ToastActions {
  /**
   * Queues a toast and returns the id of the toast that now REPRESENTS this push: the new one,
   * or - when the push merged into a standing toast of the same payload - the standing one.
   * Either way `dismiss(id)` withdraws what the user can see, so a caller never has to know
   * which of the two happened. Function-typed properties, not methods: callers destructure them
   * (@typescript-eslint/unbound-method).
   */
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

/** The queue as rendered. Changes on every push, dismiss and expiry. */
interface ToastState {
  queue: Toast[];
  /** The toast on screen. At most one, as a list so the shape survives a sixth class. */
  visible: Toast[];
}

/** Both halves, for the queue component and the tests. */
interface ToastApi extends ToastActions, ToastState {}
```

2. Replace `const ToastContext = createContext<ToastApi | null>(null);` with:

```ts
// F13: two contexts, so a view that only pushes (Train) is not re-rendered by the queue.
const ToastActionsContext = createContext<ToastActions | null>(null);
const ToastStateContext = createContext<ToastState | null>(null);
```

3. In `ToastProvider` replace

```ts
  const value = useMemo<ToastApi>(
    () => ({ queue, visible, push, dismiss, clear }),
    [queue, visible, push, dismiss, clear],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
```

with

```ts
  const actions = useMemo<ToastActions>(() => ({ push, dismiss, clear }), [push, dismiss, clear]);
  const state = useMemo<ToastState>(() => ({ queue, visible }), [queue, visible]);

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastStateContext.Provider value={state}>{children}</ToastStateContext.Provider>
    </ToastActionsContext.Provider>
  );
```

4. Replace `export function useToasts(): ToastApi { ... }` with:

```ts
export function useToastActions(): ToastActions {
  const ctx = useContext(ToastActionsContext);
  // A missing provider is a wiring bug, not a state: a silent no-op queue would swallow the
  // undo offer along with everything else.
  if (ctx === null) throw new Error('useToastActions must be used inside <ToastProvider>');
  return ctx;
}

/** Actions AND state: re-renders on every queue change. Views that only push use useToastActions. */
export function useToasts(): ToastApi {
  const actions = useToastActions();
  const state = useContext(ToastStateContext);
  if (state === null) throw new Error('useToasts must be used inside <ToastProvider>');
  return { ...actions, ...state };
}
```

5. In `ToastShell` delete the `tapDismisses` constant with the comment above it, and `onClick={tapDismisses ? dismiss : undefined}` from the toast's root `<div>`.
6. In `ToastQueue`'s Escape effect replace the `if (document.querySelector('[role="dialog"][aria-modal="true"]:not([hidden])') !== null)\n        return;` statement (and the comment above it) with:

```ts
      // An open overlay owns Escape (the one stack, src/ui/overlay/overlayStack.ts): one press
      // closes it and never also withdraws a toast behind it, an undo offer included.
      if (overlayDepth() > 0) return;
```

and add `import { overlayDepth } from '../overlay/overlayStack';` to the imports.

In `src/ui/views/TrainView.tsx` and `src/app/StaleSessionNotice.tsx` replace `useToasts` by `useToastActions` in the import and in the call (`const { push, dismiss } = useToastActions();` in Train after P1 Task 12; `const { push } = useToastActions();` in the notice).

- [ ] **Step 4: The sheet**

In `src/ui/components/toastQueue.css` replace the `.toast-stack { ... }` rule with:

```css
/*
 * Brief 5.2: one compact sign under the header, never at the bottom where the rest bar and the
 * next Log button live (F03, C08). Above sheets and the dock, below modals (--z-toast).
 */
.toast-stack {
  position: fixed;
  left: 50%;
  top: calc(var(--header-h) + env(safe-area-inset-top) + var(--space-2));
  transform: translateX(-50%);
  width: min(32rem, calc(100vw - 2 * var(--gutter)));
  z-index: var(--z-toast);
  pointer-events: none;
}
```

In the `.toast { ... }` rule replace `  pointer-events: auto;` with `  /* The body takes no taps: a tap lands on the control under it. Only its buttons take taps. */\n  pointer-events: none;\n  max-height: 96px;\n  overflow: hidden;`, replace `  border-left: 2px solid var(--accent);` with `  border-top: 2px solid var(--accent);`, and replace `  animation: toast-in 160ms ease-out;` with `  animation: toast-in var(--dur-base) var(--ease-out);`. In `@keyframes toast-in` change `transform: translateY(0.5rem);` to `transform: translateY(-8px);`. Add after the `.toast` rule:

```css
.toast button {
  pointer-events: auto;
}

/* Inside 96 px a specimen shows its tag and title; its body and source are in the Atlas. */
.toast-specimen .toast-body,
.toast-specimen .toast-source {
  display: none;
}
```

and replace `border-left-color:` with `border-top-color:` in the `.toast-undo`, `.toast-specimen.rarity-uncommon` and `.toast-specimen.rarity-rare` rules, rewording their comment's "left rule" to "top rule".

- [ ] **Step 5: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/components src/app src/ui/views/TrainView.test.tsx src/ui/styles`
Expected: PASS. `App.test.tsx` "mounts both live regions" is unchanged. If a `TrainView.test.tsx` case clicked a toast body to clear it before the next action, click its Dismiss button instead (`copyFor('limelight', 'button.dismiss')`).

- [ ] **Step 6: Commit**

```bash
git add -- src/ui/components/ToastQueue.tsx src/ui/components/toastQueue.css src/ui/components/toastStyles.test.ts src/ui/components/ToastQueue.test.tsx src/ui/views/TrainView.tsx src/app/StaleSessionNotice.tsx $(git diff --name-only -- src/ui/views/TrainView.test.tsx)
git commit -m "feat(toasts): compact signs under the header, body taps pass through, actions split from state (brief 5.2; F03, F13)"
```

---

### Task 10: Settings opens without a one-second freeze (F08); the hydration banner stops re-rendering on every write (C17)

**Files:**
- Modify: `src/domain/dates.ts` (`isValidTimeZone`; new `groupTimeZonesOnce`)
- Modify: `src/ui/views/SettingsView.tsx` (`TimeZoneSetting`'s `timeZoneGroups` memo)
- Modify: `src/ui/views/train/HydrationBanner.tsx` (the whole-store subscription)
- Test: `src/domain/dates.test.ts` (describe appended), `src/ui/views/train/HydrationBanner.test.tsx` (describe appended)

**Interfaces:**
- Consumes: `groupTimeZones(zones: readonly string[], atEpochMs: EpochMs): TimeZoneGroup[]` (unchanged); `hydrationCue(state: AppState, profileId: string, now: EpochMs, sessionActive: boolean): HydrationCue | null` (unchanged).
- Produces: `groupTimeZonesOnce(zones: readonly string[], atEpochMs: EpochMs): TimeZoneGroup[]` (the same result, computed once per zone list and UTC year per session); `isValidTimeZone` answers from a cache after the first call per zone.

Design: F08 measured a 1101 ms long task per Settings visit on a 4x-throttled Pixel 7: every mount regrouped 418 zones, 12 `tzOffset` calls each, through an uncached `isValidTimeZone` that builds an `Intl.DateTimeFormat` per call. Validity of a zone id cannot change within a session, so it is cached per id; the grouping depends only on the zone list and the UTC year (`zoneYearSignature` reads the year's twelve month starts), so it is computed once per (list, year). Settings also stays mounted after its first visit now (Task 5), so even the first computation runs once a session. C17: `HydrationBanner` subscribed to the whole store and re-rendered on every document write during a session; it now selects only the cue it renders, compared shallowly. Not done (C17): `React.memo` on `ExerciseCard`; its `onToggle` and `children` props are new on every TrainView render, so a memo would never hit, and the audit measured 5 fibres per commit.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/dates.test.ts` (add `groupTimeZonesOnce`, `groupTimeZones` and `isValidTimeZone` to its import from `./dates` if absent; add `vi` to the vitest import):

```ts

describe('time-zone work is done once per session (audit F08)', () => {
  const NOW = Date.UTC(2026, 10, 4, 12, 0, 0); // [ms] epoch UTC

  it('isValidTimeZone builds no formatter for a zone it has already answered', () => {
    expect(isValidTimeZone('Europe/Athens')).toBe(true);
    const spy = vi.spyOn(Intl, 'DateTimeFormat');
    expect(isValidTimeZone('Europe/Athens')).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('caches a refusal too', () => {
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    const spy = vi.spyOn(Intl, 'DateTimeFormat');
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('groupTimeZonesOnce equals groupTimeZones and returns the same array for the same list and year', () => {
    const zones = ['America/Chicago', 'America/New_York', 'Europe/Athens', 'Asia/Tokyo'];
    const first = groupTimeZonesOnce(zones, NOW);
    expect(first).toEqual(groupTimeZones(zones, NOW));
    expect(groupTimeZonesOnce([...zones], NOW + 3_600_000)).toBe(first); // [ms] one hour later
  });

  it('recomputes for another year or another list', () => {
    const zones = ['America/Chicago', 'Europe/Athens'];
    const first = groupTimeZonesOnce(zones, NOW);
    const nextYear = Date.UTC(2027, 0, 2, 0, 0, 0); // [ms] epoch UTC
    expect(groupTimeZonesOnce(zones, nextYear)).not.toBe(first);
    expect(groupTimeZonesOnce(['Asia/Tokyo'], NOW)).not.toBe(first);
  });
});
```

Append to `src/ui/views/train/HydrationBanner.test.tsx` (it defines `seed(skin)`, `PROFILE` and `TODAY` at its top; add `import { Profiler } from 'react';` and `act` to its Testing Library import):

```tsx

describe('subscribes to its cue, not to the whole document (audit C17)', () => {
  it('does not re-render on a write that does not change the cue', () => {
    useAppStore.setState(seed('limelight'));
    let commits = 0;
    render(
      <Profiler
        id="banner"
        onRender={() => {
          commits += 1;
        }}
      >
        <HydrationBanner profile={PROFILE} date={TODAY} sessionActive />
      </Profiler>,
    );
    const before = commits;
    act(() => {
      // A UI preference: no profile, assignment, hydration or body-mass change.
      useAppStore.getState().setUi({ hotkeys: !useAppStore.getState().ui.hotkeys });
    });
    expect(commits).toBe(before);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/domain/dates.test.ts src/ui/views/train/HydrationBanner.test.tsx`
Expected: FAIL (`groupTimeZonesOnce` is not exported; the formatter is rebuilt; the banner commits on the UI write).

- [ ] **Step 3: Implement**

In `src/domain/dates.ts` replace `export function isValidTimeZone(s: string): s is TimeZone { ... }` with:

```ts
/**
 * Audit F08: whether a zone id is valid cannot change within a session, and building an
 * Intl.DateTimeFormat per question cost about 350 ms of a 1101 ms long task on every Settings
 * visit (4x throttled Pixel 7). Answered once per id, refusals included.
 */
const zoneValidity = new Map<string, boolean>();

export function isValidTimeZone(s: string): s is TimeZone {
  if (s === '') return false;
  const known = zoneValidity.get(s);
  if (known !== undefined) return known;
  let valid: boolean;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s });
    valid = true;
  } catch {
    valid = false;
  }
  zoneValidity.set(s, valid);
  return valid;
}
```

and immediately after the closing `}` of `export function groupTimeZones(...)` add:

```ts
/**
 * Audit F08: `groupTimeZones` for the picker, computed once per (zone list, UTC year). The
 * grouping reads only the twelve month starts of `atEpochMs`'s UTC year (zoneYearSignature), so
 * any instant in the same year gives the same groups. One entry: the picker asks for one list.
 */
let groupedOnce: { key: string; groups: TimeZoneGroup[] } | null = null;

export function groupTimeZonesOnce(zones: readonly string[], atEpochMs: EpochMs): TimeZoneGroup[] {
  const key = `${String(new Date(atEpochMs).getUTCFullYear())}|${zones.join(',')}`;
  if (groupedOnce !== null && groupedOnce.key === key) return groupedOnce.groups;
  const groups = groupTimeZones(zones, atEpochMs);
  groupedOnce = { key, groups };
  return groups;
}
```

In `src/ui/views/SettingsView.tsx` replace `    return groupTimeZones(zones, Date.now());` with `    return groupTimeZonesOnce(zones, Date.now()); // F08: once per list and year` and the `groupTimeZones` import with `groupTimeZonesOnce` (keep `groupTimeZones` only if the file still uses it elsewhere).

In `src/ui/views/train/HydrationBanner.tsx`:
- add `import { useShallow } from 'zustand/react/shallow';`;
- move the `const [now, setNow] = useState<number>(...)` line above the subscription;
- replace the comment block and `  const state = useAppStore();` and `  const cue = hydrationCue(state, profile.id, now, sessionActive);` with:

```ts
  /*
   * Audit C17: the cue, not the document. The banner used to take the whole store snapshot and
   * re-render on every write of a session; the selector computes the cue and useShallow keeps
   * the result referentially stable while its three fields are equal, so an unrelated write
   * (a set, a UI preference) does not render this banner.
   */
  const cue: ShownCue = useAppStore(
    useShallow((s): ShownCue => {
      const found = hydrationCue(s, profile.id, now, sessionActive);
      return found === null ? NO_CUE : { kind: found.kind, message: found.message, shortfallML: found.shortfallML };
    }),
  );
```

and above the component add:

```ts
/** The "no cue" value the selector returns: one object, so a shallow compare holds it stable. */
const NO_CUE = { kind: null, message: null, shortfallML: null } as const;
type ShownCue = HydrationCue | typeof NO_CUE;
```

(import `type HydrationCue` from `'../../../domain/training/hydration'` beside `hydrationCue`), then replace `  if (cue === null) return null;` with `  if (cue.kind === null) return null;` (the `kind` literal narrows `cue` to `HydrationCue` below it).

- [ ] **Step 4: Run**

Run: `npx vitest run --maxWorkers=1 src/domain/dates.test.ts src/ui/views/train src/ui/views/SettingsView.test.tsx src/ui/setup`
Expected: PASS (the wizard's time-zone step calls the uncached `groupTimeZones` and the cached `isValidTimeZone`; its results are unchanged).

- [ ] **Step 5: Commit**

```bash
git add -- src/domain/dates.ts src/domain/dates.test.ts src/ui/views/SettingsView.tsx src/ui/views/train/HydrationBanner.tsx src/ui/views/train/HydrationBanner.test.tsx
git commit -m "perf: zone validity and grouping once per session (F08); hydration banner selects its cue (C17)"
```

---

### Task 11: One app-level rest controller; the chime obeys Sounds; audio re-unlocked on every Log and Extend (C06, C07, C11)

**Files:**
- Create: `src/app/RestController.tsx`, `src/app/RestController.test.tsx`
- Modify: `src/app/App.tsx` (`ViewSwitch` mounts `<RestController />`)
- Modify: `src/ui/views/train/RestTimerPanel.tsx` (the zero-crossing effect, `notifyRestOver`, `VIBRATE_PATTERN`, `firedRef` and their imports removed; Extend re-unlocks)
- Modify: `src/ui/views/train/ExerciseCard.tsx` (`handleLog` re-unlocks), `src/ui/views/TrainView.tsx` (the `pointerdown` once-unlock effect removed)
- Modify: `src/ui/audio/chime.ts` (`unlockAudio` resumes `interrupted`), `src/ui/audio/restGameAudio.ts` (one comment sentence)
- Test: `src/ui/audio/chime.test.ts` (describe appended), `src/ui/views/train/RestTimerPanel.test.tsx` (the cue assertions move out)

**Interfaces:**
- Consumes: `useRestTimer(): RestTimer | null` (`src/store/selectors.ts`), `extend(timer: RestTimer, s: number): RestTimer`, `playChime(): boolean`, `vibrate(pattern: number | number[]): boolean`, `unlockAudio(): Promise<boolean>`, `playSfx(name: 'rest_over' | ...)`.
- Produces: `RestController(): null`; `restOverCues(sounds: boolean, overrides: Partial<Record<CopyKey, string>>): void`; `VIBRATE_PATTERN: number[]` [ms]; `REST_OVER_GRACE_MS = 10_000` [ms]. `RestTimerPanel` keeps its props-free signature and its visuals; it no longer sounds anything (Task 12 docks it).

Design: C06: the cues lived in `RestTimerPanel`, mounted only on Train, and its tick stopped while hidden, so a rest that ended on Today was silent and the notification path was dead code. One controller in the shell schedules a timeout to `endsAt`, re-armed on `visibilitychange`; it fires whichever view is shown, and includes the service-worker notification when the page is hidden. Once per interval: an extension is a new timer object, which re-arms. A rest that ended more than 10 s before the app could look (closed, frozen) gets no cue, the bar already shows it over (an engineering bound, stated in the code). C11: the chime plays only with `ui.sounds` on (it was the one sound that ignored the switch; `restGameAudio.ts` called it an alarm, a design call nobody made with the owner). C07: iOS moves a backgrounded app's context to `interrupted` (MDN, BaseAudioContext.state: "In iOS Safari, when a user leaves the page ... the audio context's state changes to 'interrupted' and needs to be resumed", https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state, read 2026-11-04); `unlockAudio` resumed only `suspended`. Every Log and every Extend tap is a gesture, so each one calls `unlockAudio()` when sounds are on (the old unlock fired once per Train mount). Platform limit kept and stated: a locked installed iPhone runs no script, so nothing fires until it is opened. Rejected: keeping the cues in the panel and mounting the panel on every view (the bar is Train's; the cue is the app's).

- [ ] **Step 1: Write the failing tests**

Create `src/app/RestController.test.tsx`:

```tsx
// Audit C06, C11: one app-level rest controller fires the rest-over cues once per interval,
// whichever view is on screen, gated on ui.sounds, with a notification while hidden.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extend } from '../domain/training/restTimer';
import { useAppStore } from '../store';
import { EMPTY_SESSION } from '../store/sessionMirror';
import { makeAppState, makeUiPrefs } from '../test/funFixtures';
import { REST_OVER_GRACE_MS, RestController, VIBRATE_PATTERN } from './RestController';

const playChime = vi.hoisted(() => vi.fn(() => true));
const vibrate = vi.hoisted(() => vi.fn(() => true));
vi.mock('../ui/audio/chime', () => ({ playChime, vibrate }));
const playSfx = vi.hoisted(() => vi.fn());
vi.mock('../skins/sfx', () => ({ playSfx }));

/** [ms] epoch UTC. */
const NOW = Date.UTC(2026, 2, 2, 10, 0, 0);
const REST_MS = 90_000; // [ms]

function seed(sounds: boolean): void {
  useAppStore.setState({ ...makeAppState({ ui: makeUiPrefs({ skin: 'limelight', sounds }) }), session: EMPTY_SESSION });
  useAppStore.getState().setRestTimer({ startedAt: NOW, endsAt: NOW + REST_MS, durationS: REST_MS / 1000 });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(NOW);
  playChime.mockClear();
  vibrate.mockClear();
  playSfx.mockClear();
});

afterEach(() => {
  useAppStore.getState().setRestTimer(null);
  vi.useRealTimers();
});

describe('RestController (C06, C11)', () => {
  it('fires the cues once at the end of the rest, with no view mounted at all', () => {
    seed(true);
    render(<RestController />);
    act(() => {
      vi.advanceTimersByTime(REST_MS - 1);
    });
    expect(playSfx).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(playChime).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith('rest_over');
    expect(vibrate).toHaveBeenCalledWith(VIBRATE_PATTERN);
    act(() => {
      vi.advanceTimersByTime(60_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it('plays no chime with ui.sounds off (C11)', () => {
    seed(false);
    render(<RestController />);
    act(() => {
      vi.advanceTimersByTime(REST_MS);
    });
    expect(playChime).not.toHaveBeenCalled();
    // The sample gates itself inside sfx.ts; vibration is not a sound.
    expect(playSfx).toHaveBeenCalledWith('rest_over');
  });

  it('re-arms for an extension and fires once at the new end', () => {
    seed(true);
    render(<RestController />);
    act(() => {
      const timer = useAppStore.getState().session.restTimer;
      if (timer !== null) useAppStore.getState().setRestTimer(extend(timer, 30)); // [s]
    });
    act(() => {
      vi.advanceTimersByTime(REST_MS);
    });
    expect(playChime).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it('is silent for a rest that ended long before the app looked (relaunch, frozen tab)', () => {
    seed(true);
    vi.setSystemTime(NOW + REST_MS + REST_OVER_GRACE_MS + 1);
    render(<RestController />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(playChime).not.toHaveBeenCalled();
    expect(playSfx).not.toHaveBeenCalled();
  });

  it('posts the notification when the rest ends while the page is hidden', async () => {
    const showNotification = vi.fn(() => Promise.resolve());
    vi.stubGlobal('Notification', { permission: 'granted' });
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ showNotification }) },
      configurable: true,
    });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    seed(true);
    render(<RestController />);
    await act(async () => {
      vi.advanceTimersByTime(REST_MS);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(showNotification).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Reflect.deleteProperty(navigator, 'serviceWorker');
    vi.unstubAllGlobals();
  });
});
```

Append to `src/ui/audio/chime.test.ts`:

```ts

/** iOS: a backgrounded app's context is 'interrupted' (MDN BaseAudioContext.state). */
class InterruptedAudioContext extends FakeAudioContext {
  constructor() {
    super();
    (this as { state: string }).state = 'interrupted';
  }
}

describe('unlock after an iOS interruption (audit C07)', () => {
  it('resumes an interrupted context from the gesture and reports it running', async () => {
    vi.stubGlobal('AudioContext', InterruptedAudioContext);
    const { unlockAudio } = await loadChime();
    await expect(unlockAudio()).resolves.toBe(true);
    expect(onlyContext().resumeCalls).toBe(1);
  });
});
```

In `src/ui/views/train/RestTimerPanel.test.tsx`:
- delete the whole `describe('RestTimerPanel: the rest-over sound (P8 Task 15)', ...)` block (its four cases are `RestController.test.tsx`'s now);
- in every remaining case delete each line that asserts on `playChime`, `playSfx` or `vibrate` (e.g. `    expect(playChime).toHaveBeenCalledTimes(1);` in "turns to the pulsing rest-over state" and in P6's "closes the game when the rest ends, and the rest-over cues still fire once", which becomes "closes the game when the rest ends"), and the comments that explain those lines;
- add one case to the lit-sign describe:

```tsx
  it('sounds nothing itself: the app-level RestController owns the cues (C06)', () => {
    renderPanel('limelight');
    expireRest();
    expect(playChime).not.toHaveBeenCalled();
    expect(playSfx).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/app/RestController.test.tsx src/ui/audio/chime.test.ts src/ui/views/train/RestTimerPanel.test.tsx`
Expected: FAIL (`./RestController` missing; `unlockAudio` does not resume `interrupted`; the panel still chimes).

- [ ] **Step 3: The controller**

Create `src/app/RestController.tsx`:

```tsx
// src/app/RestController.tsx
//
// The one app-level rest controller (audit C06, C11; spec R6 P4 line). Mounted in the view
// shell, so the rest-over cues fire whichever view is on screen; it used to live in
// RestTimerPanel, which only Train mounts (C06: "ended on Today view, oscillators 0").
//
// It schedules ONE timeout to the rest's own `endsAt` [ms] epoch UTC and re-arms it on every
// visibilitychange, so a backgrounded tab that is throttled or frozen is corrected on return.
// When the timeout fires while the page is hidden, the cue includes the local notification
// (master plan section 6.5), which the old panel could never reach: its tick stopped while
// hidden, so `document.hidden` was never true at the zero crossing (C06).
//
// Cues, once per rest interval (an extension mints a new timer object, which re-arms them):
//  - the chime, ONLY with ui.sounds on (C11: it ignored the switch);
//  - the skin's rest-over sample (playSfx gates on ui.sounds itself);
//  - a vibration where navigator.vibrate exists (Android; never iOS);
//  - a notification through the service worker while the page is hidden.
// A rest that ended more than REST_OVER_GRACE_MS ago (the app was closed or frozen through it)
// gets no cue: the bar already shows it over, and a chime minutes late is noise.
//
// Platform limit, unchanged: an installed iOS app that is locked runs no JavaScript, so nothing
// here fires until it is opened again (docs/ARCHITECTURE.md).
import { useEffect, useRef } from 'react';
import { copy, type CopyKey } from '../content/copy';
import { useCopyOverrides } from '../content/useCopy';
import type { RestTimer } from '../domain/training/restTimer';
import { playSfx } from '../skins/sfx';
import { useAppStore } from '../store';
import { useRestTimer } from '../store/selectors';
import { playChime, vibrate } from '../ui/audio/chime';

/** navigator.vibrate's pattern, in milliseconds on / off / on (moved from RestTimerPanel). */
export const VIBRATE_PATTERN = [180, 80, 180]; // [ms]

/**
 * [ms] How late a rest-over cue may still fire. An engineering bound, not a health number: long
 * enough for a throttled background timeout or a return from the lock screen within the same
 * minute, short enough that reopening the app minutes later is silent.
 */
export const REST_OVER_GRACE_MS = 10_000;

/**
 * A local notification for a rest that ended while the page was hidden, through the service
 * worker registration (the only route a PWA has on Android and iOS). Every failure is swallowed:
 * the visual and the chime already ran, so there is nothing for the user to act on.
 */
async function notifyRestOver(overrides: Partial<Record<CopyKey, string>>): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(copy('notification.restOver', overrides), { tag: 'rest' });
  } catch {
    return;
  }
}

/** The cues for one rest that has just ended. Exported for the controller's tests. */
export function restOverCues(sounds: boolean, overrides: Partial<Record<CopyKey, string>>): void {
  if (sounds) playChime(); // C11: the chime obeys ui.sounds like every other sound
  playSfx('rest_over'); // gated on ui.sounds inside src/skins/sfx.ts
  vibrate(VIBRATE_PATTERN);
  if (document.hidden) void notifyRestOver(overrides);
}

export function RestController(): null {
  const timer = useRestTimer();
  const sounds = useAppStore((s) => s.ui.sounds);
  const overrides = useCopyOverrides();
  // The interval the cues already fired for; identity, because an extension is a new object.
  const firedFor = useRef<RestTimer | null>(null);
  // Read at fire time, so toggling sounds mid-rest does not re-arm the timeout.
  const soundsRef = useRef(sounds);
  const overridesRef = useRef(overrides);
  useEffect(() => {
    soundsRef.current = sounds;
    overridesRef.current = overrides;
  });

  useEffect(() => {
    if (timer === null || firedFor.current === timer) return;
    let handle: number | undefined;
    const fire = (): void => {
      if (firedFor.current === timer) return;
      firedFor.current = timer;
      const late = Date.now() - timer.endsAt; // [ms]
      if (late > REST_OVER_GRACE_MS) return;
      restOverCues(soundsRef.current, overridesRef.current);
    };
    const arm = (): void => {
      window.clearTimeout(handle);
      const wait = Math.max(0, timer.endsAt - Date.now()); // [ms]
      handle = window.setTimeout(() => {
        if (Date.now() >= timer.endsAt) fire();
        else arm(); // woken early (clock change): wait again for the real end
      }, wait);
    };
    arm();
    document.addEventListener('visibilitychange', arm);
    return () => {
      window.clearTimeout(handle);
      document.removeEventListener('visibilitychange', arm);
    };
  }, [timer]);

  return null;
}
```

In `src/app/App.tsx` add `import { RestController } from './RestController';` and, in `ViewSwitch`'s returned fragment, as its first child:

```tsx
      {/* C06: the rest-over cues fire on whichever view is shown, not only on Train. */}
      <RestController />
```

- [ ] **Step 4: The panel stops sounding; taps re-unlock**

In `src/ui/views/train/RestTimerPanel.tsx`:
1. Delete `/** navigator.vibrate's pattern ... */ const VIBRATE_PATTERN = ...;`, the whole `async function notifyRestOver(...) { ... }` with its doc comment, `const firedRef = useRef(false);`, the effect that resets `firedRef` on `[timer]` with its comment, and the zero-crossing effect (`useEffect(() => { if (timer === null || firedRef.current) return; ... }, [timer, now, overrides]);`) with its comment.
2. Change `import { playChime, unlockAudio, vibrate } from '../../audio/chime';` to `import { unlockAudio } from '../../audio/chime';`, drop `playSfx` and `copy`/`CopyKey` from their imports if nothing else uses them (`npx tsc -p tsconfig.app.json --noEmit` lists them), and keep `useRef` only if still used.
3. In the Extend button's `onClick`, as the first statement add:

```ts
              // C07: every Extend tap is a gesture, so it wakes an iOS context that a lock or an
              // app switch interrupted; with sounds off it is left alone.
              if (sounds) void unlockAudio();
```

4. Add to the file header comment: `// The rest-over CUES are not here: src/app/RestController.tsx fires them on any view (C06).`

In `src/ui/views/train/ExerciseCard.tsx`, in `handleLog`, as its first statement add:

```ts
    // C07: every Log tap is a gesture; it wakes an iOS context a lock or an app switch
    // interrupted, so the rest this log starts can chime at its end. Sounds off: left alone.
    if (useAppStore.getState().ui.sounds) void unlockAudio();
```

with `import { unlockAudio } from '../../audio/chime';`.

In `src/ui/views/TrainView.tsx` delete the effect that adds the `pointerdown` once-listener calling `unlockAudio()` (the shell's first-gesture unlock, the Log tap and the Extend tap cover it), drop `unlockAudio` from its `../audio/chime` import, and in the file header replace "the audio context is unlocked on the first pointer event that reaches this view, because a user who navigated straight to Train never passed through Today's Start tap (code review A29);" with "the audio context is re-unlocked on every Log and Extend tap (C07);".

In `src/ui/audio/chime.ts`, in `unlockAudio`, replace

```ts
  if (ctx.state === 'suspended') {
```

with

```ts
  /*
   * C07: iOS moves a backgrounded app's context to 'interrupted' and it needs resume() from a
   * gesture like 'suspended' does (MDN BaseAudioContext.state, read 2026-11-04). TypeScript's
   * AudioContextState lists only suspended, running and closed, hence the string compare.
   */
  const before: string = ctx.state;
  if (before === 'suspended' || before === 'interrupted') {
```

In `src/ui/audio/restGameAudio.ts` replace `Unlike the rest-over\n * chime, a game cue is decoration, not an alarm, so it obeys the switch.` with `Like the rest-over chime\n * (C11, src/app/RestController.tsx), a game cue obeys the switch.`

- [ ] **Step 5: Run**

Run: `npx vitest run --maxWorkers=1 src/app src/ui/audio src/ui/views/train src/ui/views/TrainView.test.tsx`
Expected: PASS (`RestController.test.tsx` 5 tests; `chime.test.ts` +1). If a `TrainView.test.tsx` case asserted the `pointerdown` unlock, replace its trigger with a Log tap (`logRow(1, '60', '8')`) and keep its expectation.

- [ ] **Step 6: Commit**

```bash
git add -- src/app/RestController.tsx src/app/RestController.test.tsx src/app/App.tsx src/ui/views/train/RestTimerPanel.tsx src/ui/views/train/RestTimerPanel.test.tsx src/ui/views/train/ExerciseCard.tsx src/ui/views/TrainView.tsx src/ui/audio/chime.ts src/ui/audio/chime.test.ts src/ui/audio/restGameAudio.ts $(git diff --name-only -- src/ui/views/TrainView.test.tsx)
git commit -m "feat(rest): app-level rest controller; chime obeys Sounds; re-unlock on every Log and Extend (C06, C07, C11)"
```

---

### Task 12: The rest bar docked above the tab bar; the game sheet over it, on the overlay stack (C05; brief 4.2, 5.1; P6 D5)

**Precondition:** P6 Task 9 landed (`test -f src/ui/views/train/RestGameSheet.tsx && test -f src/ui/views/train/useSheetDismiss.ts`). If not, STOP and report; nothing else in this plan depends on this task.

**Files:**
- Modify: `src/ui/views/train/RestTimerPanel.tsx` (the returned JSX; ring constants)
- Modify: `src/ui/styles/train.css` (the rest-panel section: `.rest-panel`, `.rest-summary`, `.rest-ring*`, `.rest-time`, `.rest-controls`, `.rest-label`, `.rest-game-unavailable`)
- Modify: `src/ui/views/train/RestGameSheet.tsx` (one optional prop, a clock row), `src/ui/views/train/useSheetDismiss.ts` (body replaced), `src/ui/styles/restGames.css` (sheet section: minimised geometry, clock)
- Test: `src/ui/views/train/restPanelStyles.test.ts` (ring assertions replaced), `src/ui/views/train/RestTimerPanel.test.tsx` (ring/icon case replaced), `src/ui/views/train/RestGameSheet.test.tsx` (Back and Escape cases rewritten), `src/ui/views/train/restGameStyles.test.ts` (describe appended), `src/ui/views/TrainView.test.tsx` and `RestTimerPanel.test.tsx` (`history.back` stubs become `history.go` stubs)

**Interfaces:**
- Consumes: Task 4 `useOverlay(onClose, { modal: false })`; Task 1 `--dock-bottom`, `--restbar-h`, `--z-dock`, `--z-sheet`; P6 `RestGameSheetProps` (`timer`, `priorWins`, `soundsEnabled`, `units`, `t`, `overrides`, `onClose(played)`, `onWin`), `REST_SHEET_BODY_CLASS`, copy key `button.restGameLaunch`; `Icon` with `sparklePanel`.
- Produces: `RestGameSheetProps.clock?: string` (the remaining rest as the panel formats it; shown in the sheet's top row and in its minimised bar); `useSheetDismiss(onDismiss: () => void): void` keeps its signature (P6's sheet keeps calling it) and now registers a NON-modal overlay with the stack (P6 D5: "P4's overlay stack replaces this hook").

Design (brief 4.2, 5.1; C05): while a rest runs, Train shows a 56 px black bar docked at `bottom: var(--dock-bottom)` (on top of the tab bar and the home indicator), full width with gutter padding: the remaining time in lime 24 px tabular digits (the digits are the signal; no icon), `+30 s` and "i'm ready" (existing keys) as 44 px lime-on-panel buttons, and a 44 x 44 icon button (`sparklePanel`, named by `button.restGameLaunch`) that opens the game sheet. A 4 px pink strip on the bar's top edge shows elapsed rest (it replaces the ring; it moves once a second and never tweens). Rest over: the existing `.rest-over` flip to pink with ink type and the 2 Hz pulse, steady under reduced motion. The label ("rest" / "rest over") stays as a polite live region for screen readers, visually hidden: the one-row bar has no room for it at 320 px, and the over state is carried by the digits reading 0:00 as well as by colour. The page under Train pads the bar's height while it shows. The game sheet keeps P6 D1's geometry (bottom 0, cap `100svh - 12rem`), sits at `--z-sheet` above the bar and the tab bar, and shows the remaining rest in its own top row; minimised, it docks exactly over the rest bar (`bottom: --dock-bottom`, one 56 px row: time, game name, Show Game), so the two never stack. Back and Escape reach the sheet through the one stack: Escape closes the top overlay, so a Form Cues dialog opened above the sheet closes first. Width budget at 320 px [INFERRED, measured in Task 17]: 288 px for the time (about 60 px at 24 px), three controls and three 8 px gaps; if Task 17 measures a clipped label, `+30 s` moves into the sheet's row (brief 4.2 f).

- [ ] **Step 1: Write the failing tests**

In `src/ui/views/train/restPanelStyles.test.ts` replace the two ring assertions

```ts
    expect(bodyOf('.rest-ring-track')).toMatch(/stroke:\s*var\(--lime\)/);
    expect(bodyOf('.rest-ring-arc')).toMatch(/stroke:\s*var\(--pink\)/);
```

with

```ts
    // C05: the ring is gone; a 4 px pink strip on the bar's top edge shows elapsed rest.
    expect(bodyOf('.rest-progress')).toMatch(/height:\s*4px;/);
    expect(bodyOf('.rest-progress')).toMatch(/background:\s*var\(--accent\);/);
```

and append:

```ts

describe('the docked rest bar (C05, brief 4.2)', () => {
  it('docks above the tab bar at the dock rung, full width', () => {
    const b = bodyOf('.rest-panel');
    expect(b).toMatch(/position:\s*fixed;/);
    expect(b).toMatch(/bottom:\s*var\(--dock-bottom\);/);
    expect(b).toMatch(/left:\s*0;/);
    expect(b).toMatch(/right:\s*0;/);
    expect(b).toMatch(/z-index:\s*var\(--z-dock\);/);
  });

  it('is one 56 px row with gutter padding', () => {
    const b = bodyOf('.rest-summary');
    expect(b).toMatch(/height:\s*var\(--restbar-h\);/);
    expect(b).toMatch(/display:\s*flex;/);
    expect(b).toMatch(/padding:\s*0 max\(var\(--gutter\), env\(safe-area-inset-right\)\) 0 max\(var\(--gutter\), env\(safe-area-inset-left\)\);/);
  });

  it('sets the digits in lime, 24 px, tabular', () => {
    const b = bodyOf('.rest-time');
    expect(b).toMatch(/font-size:\s*var\(--text-xl\);/);
    expect(b).toMatch(/font-variant-numeric:\s*tabular-nums;/);
    expect(b).toMatch(/color:\s*var\(--lime\);/);
  });

  it('pads the Train page by the bar while a rest shows', () => {
    expect(bodyOf('.view.train:has(.rest-panel)')).toMatch(
      /padding-bottom:\s*calc\(var\(--restbar-h\) \+ var\(--space-6\)\);/,
    );
  });
});
```

(`bodyOf(selector)` is that file's own helper reading `train.css`.)

In `src/ui/views/train/RestTimerPanel.test.tsx` replace the case `it('draws the ring, the clock and the controls on the black panel', ...)` with:

```tsx
  it('is one row on the black panel: the clock, +30 s, i am ready and the game icon button', () => {
    const container = renderPanel('limelight');
    const panel = sign(container);
    expect(panel?.classList.contains('ll-panel')).toBe(true);
    expect(panel?.classList.contains('rest-over')).toBe(false);
    // C05: no ring; a strip whose width is the elapsed fraction.
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.rest-progress')).not.toBeNull();
    expect(screen.getByRole('button', { name: copyFor('limelight', 'button.extendRest') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copyFor('limelight', 'button.skipRest') })).toBeInTheDocument();
  });
```

and in that file's (and in `src/ui/views/TrainView.test.tsx`'s) rest-game sections replace each `vi.spyOn(window.history, 'back').mockImplementation(() => undefined);` with `vi.spyOn(window.history, 'go').mockImplementation(() => undefined);` (the stack steps back with `history.go(-n)`, Task 4).

In `src/ui/views/train/RestGameSheet.test.tsx`:
- in `beforeEach` replace `    back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);` with `    back = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);`;
- replace the whole `it('closes on Escape, unless a modal dialog above it owns the key', ...)` case with:

```tsx
  it('closes on Escape, unless an overlay opened above it takes the key first (one stack, R6)', () => {
    const { onClose } = renderSheet();
    const above = vi.fn();
    const modal = openOverlay(above, { modal: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(above).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    modal.release();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith(false);
  });
```

- replace the whole `it('closes on Back, and ignores a traversal that lands on its own entry', ...)` case with:

```tsx
  it('pushes one history entry and closes on Back (R6)', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const { onClose } = renderSheet();
    expect(push).toHaveBeenCalledTimes(1);
    expect(entryOf(push.mock.calls[0]?.[0])).toMatchObject({ depth: 1 });
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { fti: { view: 'train', depth: 0 } } }));
    });
    expect(onClose).toHaveBeenCalledWith(false);
  });
```

- replace the body of `it('steps back over its own history entry when it closes any other way', ...)` with:

```tsx
    const { unmount } = renderSheet();
    await act(async () => {
      unmount();
      await Promise.resolve(); // the step-back is issued in a microtask (src/ui/nav/history.ts)
    });
    expect(back).toHaveBeenCalledWith(-1);
```

  and make that case `async`;
- add to the file's imports `import { entryOf } from '../../nav/history';` and `import { openOverlay } from '../../overlay/overlayStack';`;
- append inside the describe:

```tsx
  it('shows the remaining rest in its top row and in its minimised bar (brief 5.1)', () => {
    render(
      <RestGameSheet
        timer={TIMER}
        priorWins={0}
        soundsEnabled={false}
        units="metric"
        t={copy}
        overrides={{}}
        clock="1:30"
        onClose={() => undefined}
        onWin={() => undefined}
      />,
    );
    expect(screen.getByText('1:30')).toBeInTheDocument();
  });
```

Append to `src/ui/views/train/restGameStyles.test.ts`:

```ts

describe('the game sheet and the dock (P4a, brief 5.1)', () => {
  const rule = (selector: string): string => gameRules.find((r) => r.selector === selector)?.body ?? '';

  it('sits on the sheet rung, above the dock and the tab bar', () => {
    expect(rule('.rest-sheet')).toMatch(/z-index:\s*var\(--z-sheet\);/);
  });

  it('minimised, docks exactly over the rest bar, one 56 px row, so the two never stack', () => {
    const b = rule('.rest-sheet.is-minimised');
    expect(b).toMatch(/bottom:\s*var\(--dock-bottom\);/);
    expect(b).toMatch(/height:\s*var\(--restbar-h\);/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/views/train/restPanelStyles.test.ts src/ui/views/train/RestTimerPanel.test.tsx src/ui/views/train/RestGameSheet.test.tsx src/ui/views/train/restGameStyles.test.ts`
Expected: FAIL (ring present, panel in flow, the hook pushes its own marker, no `clock` prop).

- [ ] **Step 3: The bar**

In `src/ui/views/train/RestTimerPanel.tsx`:
1. Delete `RING_RADIUS` and `RING_CIRCUMFERENCE`; add `import { Icon } from '../../../skins/limelight/Icon';` and `useId` to the React import.
2. After `  const [reduced] = useState<boolean>(prefersReducedMotion);` add `  const tooLateId = useId(); // the too-late message the disabled game button points at` (a hook, so above the `if (timer === null) return null;` line), and after `  const startedAt = timer.startedAt; // [ms] epoch UTC, the interval a phase is keyed to` add `  const clock = FORMAT.restRemaining(minutes, seconds, overrides); // one formatted clock: bar and sheet`.
3. Replace the returned JSX from `  return (\n    <div className="rest-panel">` to the end of the component's `return` with:

```tsx
  return (
    <div className="rest-panel">
      {/*
        * C05, brief 4.2: one 56 px bar docked above the tab bar. The digits are the signal; the
        * strip on the top edge shows the elapsed fraction and never tweens (limelight.css: no
        * quantity animates). The label stays a polite live region, visually hidden: the state is
        * in the digits (0:00) and the pink flip, and a screen reader hears the words.
        */}
      <div className={signClass} role="group" aria-label={c('status.rest')}>
        <span className="rest-progress" aria-hidden="true" style={{ width: `${String(elapsedFraction * 100)}%` }} />
        <span className="rest-time">{clock}</span>
        <div className="rest-label visually-hidden" aria-live="polite">
          {restOver ? <span className="ll-label">{c('notification.restOver')}</span> : <SkinLabel copyKey="status.rest" />}
        </div>
        <div className="rest-controls">
          <button
            type="button"
            onClick={() => {
              // C07: every Extend tap is a gesture; with sounds off the context is left alone.
              if (sounds) void unlockAudio();
              useAppStore.getState().setRestTimer(extend(timer, EXTEND_S));
            }}
          >
            {c('button.extendRest')}
          </button>
          <button
            type="button"
            onClick={() => {
              useAppStore.getState().setRestTimer(null);
            }}
          >
            <SkinLabel copyKey="button.skipRest" />
          </button>
          {offerGame && (
            <button
              type="button"
              className="rest-game-launch"
              aria-label={c('button.restGameLaunch')}
              aria-describedby={gameFits ? undefined : tooLateId}
              disabled={!gameFits}
              onClick={() => {
                // The tap is a user gesture, so it may wake the shared audio context for the
                // game's cues; with sounds off it is left alone.
                if (sounds) void unlockAudio();
                setGame({ startedAt, phase: 'open' });
              }}
            >
              <Icon name="sparklePanel" width={32} height={32} />
            </button>
          )}
        </div>
      </div>
      {offerGame && !gameFits && (
        <p id={tooLateId} className="rest-game-unavailable visually-hidden">
          {c('status.restWordTooLate')}
        </p>
      )}
      {phase === 'open' && !restOver && (
        <RestGameSheet
          key={startedAt}
          timer={timer}
          priorWins={restGameWins}
          soundsEnabled={sounds}
          units={units}
          t={c}
          overrides={overrides}
          clock={clock}
          onClose={(played) => {
            // A round played spends this rest's one offer; a picker closed unplayed leaves it.
            setGame(played ? { startedAt, phase: 'closed' } : null);
          }}
          onWin={() => {
            useAppStore.getState().recordRestGameWin();
          }}
        />
      )}
    </div>
  );
```

(This replaces Task 11's Extend `onClick` with the same body. `SkinLabel copyKey="button.skipRest"` keeps the `skip` icon `ICON_FOR_KEY` maps to it.)

4. In `src/ui/styles/train.css`, replace the rest-panel rules (`.rest-panel`, `.rest-summary`, `.rest-ring`, `.rest-ring svg`, `.rest-ring-track`, `.rest-ring-arc`, `.rest-time`, `.rest-controls`, `.rest-controls button`, `.rest-label`, `.rest-game-unavailable` and their comments; keep `.rest-summary.rest-over`, `.rest-summary.rest-over-pulse`, the pulse keyframes and the reduced-motion rule unchanged) with:

```css
/*
 * The rest bar (audit C05; docs/design/p4-design-brief.md 4.2): docked above the tab bar while a
 * rest runs, so the remaining time is on screen at every scroll position of Train.
 */
.rest-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--dock-bottom);
  z-index: var(--z-dock);
}

.rest-summary {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  box-sizing: border-box;
  height: var(--restbar-h);
  padding: 0 max(var(--gutter), env(safe-area-inset-right)) 0 max(var(--gutter), env(safe-area-inset-left));
  border-top: 2px solid var(--ink);
}

/* Elapsed rest, a 4 px pink strip on the top edge; its width moves once a second, never tweened. */
.rest-progress {
  position: absolute;
  top: 0;
  left: 0;
  height: 4px;
  background: var(--accent);
}

.rest-time {
  margin-right: auto;
  font-size: var(--text-xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--lime);
}

.rest-controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* Lime on the panel, ink type and edge (10.91:1), 44 px; the game launcher is a 44 x 44 icon. */
.view .rest-controls button {
  width: auto;
  min-width: var(--tap);
  min-height: var(--tap);
  padding: 0 var(--space-3);
  background: var(--lime);
  color: var(--ink);
  border: 2px solid var(--ink);
  font-size: var(--text-sm);
  white-space: nowrap;
}

.view .rest-controls .rest-game-launch {
  width: var(--tap);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.rest-game-launch img {
  image-rendering: pixelated;
}

/* At zero the digits turn ink with the sign's pink flip (.rest-summary.rest-over). */
.rest-summary.rest-over .rest-time {
  color: var(--ink);
}

/* The page under Train scrolls far enough that the last control clears the bar. */
.view.train:has(.rest-panel) {
  padding-bottom: calc(var(--restbar-h) + var(--space-6));
}

/* Text for assistive technology only. */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 4: The sheet over the dock, on the stack**

Replace the whole of `src/ui/views/train/useSheetDismiss.ts` with:

```ts
// src/ui/views/train/useSheetDismiss.ts
//
// Back and Escape close the game sheet (P6, plan D5), now through the ONE overlay stack (spec R6,
// src/ui/overlay/overlayStack.ts), which P6 D5 said would absorb this hook: one history entry
// while the sheet is open, Back closes it, Escape closes it when it is the top overlay (a Form
// Cues dialog opened above it takes Escape first). NON-modal: no scroll lock, no focus trap, so
// the next set stays loggable with the sheet open (P6 D1).
import { useOverlay } from '../../overlay/overlayStack';

export function useSheetDismiss(onDismiss: () => void): void {
  useOverlay(onDismiss, { modal: false });
}
```

In `src/ui/views/train/RestGameSheet.tsx`:
- in `RestGameSheetProps` after `onWin: () => void;` add:

```ts
  /** The remaining rest as the panel formats it ("1:30"); shown in the top row and the bar. */
  clock?: string;
```

- destructure `clock` with the other props;
- inside `<div className="rest-sheet-bar">` insert as its first child `{clock !== undefined && <span className="rest-sheet-clock">{clock}</span>}`;
- inside `<div className="rest-sheet-body" hidden={minimised}>` insert as its first child `{clock !== undefined && <p className="rest-sheet-clock">{clock}</p>}`.

In `src/ui/styles/restGames.css`, in the sheet section, add after the `.rest-sheet:focus-visible` rule:

```css
/*
 * Brief 5.1: minimised, the sheet IS the rest bar: it docks exactly over it (one 56 px row:
 * time, game name, Show Game) at the sheet rung, so the two never stack.
 */
.rest-sheet.is-minimised {
  bottom: var(--dock-bottom);
  box-sizing: border-box;
  height: var(--restbar-h);
  max-height: var(--restbar-h);
  padding-top: 0;
  padding-bottom: 0;
  display: flex;
  align-items: center;
}

.rest-sheet-clock {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--lime);
}
```

and replace the `body.rest-sheet-min .view.train { padding-bottom: ... }` declaration value with `calc(var(--restbar-h) + var(--space-6))` (the minimised bar now sits where the rest bar sits).

- [ ] **Step 5: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/views/train src/ui/views/TrainView.test.tsx src/ui/overlay src/ui/styles`
Expected: PASS. `restGameGuarantees.test.tsx` (P6 Task 10) scans game sources for store imports and timer writers; `useSheetDismiss.ts` now imports only `overlayStack`, neither.

- [ ] **Step 6: Commit**

```bash
git add -- src/ui/views/train/RestTimerPanel.tsx src/ui/views/train/RestTimerPanel.test.tsx src/ui/styles/train.css src/ui/views/train/restPanelStyles.test.ts src/ui/views/train/RestGameSheet.tsx src/ui/views/train/RestGameSheet.test.tsx src/ui/views/train/useSheetDismiss.ts src/ui/styles/restGames.css src/ui/views/train/restGameStyles.test.ts src/ui/views/TrainView.test.tsx
git commit -m "feat(rest): rest bar docked above the tab bar; game sheet over it on the one overlay stack (C05, brief 4.2, 5.1, P6 D5)"
```

---

### Task 13: Nothing above set 1 but the title row; the coach line inline under its set (brief 4.2; C08)

**Files:**
- Modify: `src/ui/views/TrainView.tsx` (the `train-header` block, the `HydrationBanner` and `RestTimerPanel` placement, `onSetLogged`)
- Modify: `src/ui/views/train/ExerciseCard.tsx` (coach state, `handleLog`, the rows map)
- Modify: `src/ui/styles/train.css` (`.train-header`, `.train-eyebrow` rules; new `.train-title-row`, `.set-coach`)
- Test: `src/ui/views/TrainView.test.tsx` (one describe appended; two dismiss taps removed)

**Interfaces:**
- Consumes: `coachLine(...)` returning `CoachLine { key, params, tone }` (unchanged), `FORMAT.withSlots`, `FORMAT.sessionEyebrow(ordinal, label, overrides)` (unchanged), `ExerciseCardProps.onCoach(line, specimen)` (unchanged signature; TrainView stops toasting the line).
- Produces: DOM contract used by Task 17's e2e: the session title row is `.train-title-row` (an `h2` and a `.train-position` span to its right); the coach line is `p.set-coach[role=status]` directly after the set row it is about.

Design (brief 4.2): above the cards only the title row: the session name (display cut) with the session position to its right (the old eyebrow's words, now a trailing line: the craft floor bans a label above a heading); the deload line and the once-only warm-up notice follow, then the cards. The hydration banner moves under the exercise stack, the rest bar to the end of the view (it is docked, Task 12, so its DOM position only decides reading order). C08: the per-set coach line is no longer a toast over the next Log button for 4.5 s; it is one line under the set just logged, replaced by the next log. Milestone and specimen toasts stay (at the top, Task 9). Acceptance (c) of brief 4.2, "on a second session the active set row's top is at most 50 % of the viewport at 390 x 664", is measured in Task 17.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/views/TrainView.test.tsx`:

```tsx
describe('the Train layout (brief 4.2; C08)', () => {
  it('puts only the title row above the cards: name, then the position to its right', () => {
    seedStore(withSkin(seed(), 'limelight'));
    const { container } = renderTrain();
    const row = container.querySelector('.train-title-row');
    expect(row?.querySelector('h2')?.textContent).toBe('Upper A');
    expect(row?.querySelector('.train-position')?.textContent).toBe(
      FORMAT.sessionEyebrow(1, 'Upper', SKIN_COPY.limelight),
    );
    const stack = container.querySelector('.ex-stack');
    // Nothing but the title row, the deload line and the warm-up notice precedes the cards.
    const before = [...(container.querySelector('.view.train')?.children ?? [])].filter(
      (el) => stack !== null && el.compareDocumentPosition(stack) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(before.map((el) => el.className).filter((c) => !/train-title-row|train-deload|train-warmup/.test(c))).toEqual([]);
  });

  it('shows the coach line under the set it is about, not as a toast (C08)', () => {
    seedStore(withSkin(seed(), 'limelight'));
    const { container } = renderTrain();
    logRow(1, '60', '8');
    const line = container.querySelector('p.set-coach');
    expect(line?.textContent).toContain(
      FORMAT.withSlots('coach.topOfRange', { load: '60 kg', reps: 8 }, SKIN_COPY.limelight),
    );
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});
```

In the same file, in `it('shows the card a drawn specimen carries', ...)` delete the line `    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.dismiss') }));` that precedes `expect(screen.getByText(card.title)).toBeInTheDocument();` and change the comment above it to `// C08: the coach line is inline, so the card is the toast on screen.`; in the case that follows it (the delete-and-relog of the same ordinal) delete the line `    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.dismiss') }));` between the two `expect(screen.queryByText(card.title)).toBeNull();` lines, and change the comment above them to `// C08: no toast at all: the coach line is inline, and the card is already owned.`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/views/TrainView.test.tsx -t "the Train layout"`
Expected: FAIL (no `.train-title-row`; the coach line is a toast).

- [ ] **Step 3: TrainView**

In `src/ui/views/TrainView.tsx`:
1. Replace the block from `      <div className="train-header">` through its closing `</div>` (it holds the eyebrow, the `h2`, the deload line and `<RestTimerPanel />`) with:

```tsx
      {/*
        * Brief 4.2: nothing above set 1 but this row. The position sits to the RIGHT of the name
        * (craft floor: no label above a heading); the rest bar is docked (RestTimerPanel, below).
        */}
      <div className="train-title-row">
        <h2 className={displayClass(session.name)}>{session.name}</h2>
        <span className="train-position">
          {FORMAT.sessionEyebrow(session.ordinal, session.label, overrides)}
        </span>
      </div>
      {block.isDeload && <p className="train-deload">{c('advice.deloadBlock')}</p>}
```

2. Move `<HydrationBanner profile={profile} date={today} sessionActive={sessionActive} />` (the one directly after the old header) to immediately after the closing `</div>` of `<div className="ex-stack">` (after P1 Task 12's Add Forgotten Set button if it follows the stack).
3. Add `<RestTimerPanel />` as the last child of the returned `<div className="view train">`, with the comment `{/* C05: docked above the tab bar (train.css); last in reading order. */}`.
4. In `onSetLogged`, delete the statement `push({ kind: line.tone, message: FORMAT.withSlots(line.key, line.params, overrides) });` and the comment block above it; replace them with `// C08: the coach line is rendered inline by ExerciseCard under the set it is about.`. `line` stays the callback's first parameter (eslint's `after-used` rule does not flag it while `specimen` is used).

- [ ] **Step 4: ExerciseCard**

In `src/ui/views/train/ExerciseCard.tsx`:
1. Add `Fragment` to the React import.
2. After `  const [bonusRows, setBonusRows] = useState(0);` add:

```ts
  /** C08: the coach line for the set just logged on this card, shown under that set. */
  const [coach, setCoach] = useState<{ n: number; line: CoachLine } | null>(null);
```

3. In `handleLog` replace

```ts
    onCoach(coachLine({ ...set, id, loggedAt: now }, history, advice, profile.units), specimen);
```

with

```ts
    const line = coachLine({ ...set, id, loggedAt: now }, history, advice, profile.units);
    // C08: inline under this set; the view still hears it for milestones and specimens.
    setCoach({ n, line });
    onCoach(line, specimen);
```

4. In the rows map, wrap the returned `<SetRow ... />` in `<Fragment key={n}> ... </Fragment>` (move `key={n}` from `SetRow` to the fragment) and add after `<SetRow ... />`, inside the fragment:

```tsx
                  {coach !== null && coach.n === n && logged !== null && (
                    <p className="set-coach" role="status">
                      {FORMAT.withSlots(coach.line.key, coach.line.params, overrides)}
                    </p>
                  )}
```

5. In `src/ui/styles/train.css` replace the `.train-header { ... }` rule with:

```css
/* Brief 4.2: the one row above the cards, name left, position right. */
.train-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin: 0 0 var(--space-3);
}

.train-title-row h2 {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
```

rename the selector `.train-eyebrow` to `.train-position` (keep its body, add `white-space: nowrap;` and set `font-size: var(--text-sm);`), and add:

```css
/* C08: the coach line under the set it is about; ink on lime, 14 px, never over a control. */
.set-coach {
  margin: var(--space-1) 0 var(--space-2);
  font-size: var(--text-sm);
  color: var(--ink);
}
```

- [ ] **Step 5: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/views/TrainView.test.tsx src/ui/views/train src/ui/styles`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -- src/ui/views/TrainView.tsx src/ui/views/TrainView.test.tsx src/ui/views/train/ExerciseCard.tsx src/ui/styles/train.css
git commit -m "feat(train): only the title row above set 1; coach line inline under its set (brief 4.2, C08)"
```

---

### Task 14: One active set row per card, one Log button, 44 px everything (brief 4.2 (d), (e))

**Files:**
- Modify: `src/ui/views/train/SetRow.tsx` (props `mode`, `onActivate`, `showEffort`; a pending render; the bodyweight control; the Log button's class)
- Modify: `src/ui/views/train/ExerciseCard.tsx` (active row and latest set; Add Set activates its row)
- Modify: `src/ui/styles/train.css` (`.set-row`, `.unit-input`, `.ex-head`, `.ex-links` rules; new `.set-row.pending`, `.set-bw`)
- Test: `src/ui/views/train/SetRow.test.tsx` (describe appended), `src/ui/views/train/ExerciseCard.test.tsx` (describe appended), `src/ui/views/TrainView.test.tsx` (the deload row-count case ~:471)

**Interfaces:**
- Consumes: Task 2 `.is-primary`; `FORMAT.setCounter`, `formatPrescription` (`src/ui/format/plan.ts`); P1 Task 12 `readOnly`/`amending` on `ExerciseCardProps`.
- Produces: `SetRowProps.mode?: 'active' | 'pending'` (an unlogged row; default `'active'`), `SetRowProps.onActivate?: () => void` (a pending row's tap), `SetRowProps.showEffort?: boolean` (a logged row offers the four effort taps only when true; default `true`). DOM: a pending row is `button.set-row.pending`; the bodyweight control is `button.set-bw[role=switch][aria-checked]` named `FORMAT.setBodyweightQuantity(n)`; the active row's Log button carries `.is-primary`.

Design (brief 4.2): the open card shows the last session and the suggested load, then ONE active row, the first unlogged set (or the one the user tapped): load and reps side by side, 56 px tall, 20 px tabular digits, 12 px labels above; a 44 px labelled bodyweight toggle (`role="switch"`, it was a 20 x 20 checkbox, C09/e); one Log button, the screen's sticker, full width, 56 px. Every other unlogged set is one 44 px line ("set 3 of 3" and its target); a tap makes it the active row. Logged sets stay one line with Edit and Delete; the four effort taps show only under the most recently logged set and collapse when the next is logged. Form Reference and Form Cues share one row. A collapsed card is a 56 px head with done/total (unchanged content). Add Set makes the new row the active one (the user asked for that row). Acceptance (d) "exactly one Log button per open card" and (e) "every target in the set row >= 44 x 44 px" are asserted here in jsdom (count) and in Task 17 (geometry). P5's C09 prefill fills this active row later; nothing here decides prefill values.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/views/train/SetRow.test.tsx` (it already defines `renderRow(overrides)` and `loggedSet(patch)`):

```tsx
describe('SetRow: active, pending and latest (brief 4.2)', () => {
  it('a pending row is one button that activates the row, with no fields and no Log', () => {
    const onActivate = vi.fn();
    renderRow({ mode: 'pending', onActivate });
    expect(screen.queryByLabelText(`${FORMAT.setLoadQuantity(1)} (kg)`)).toBeNull();
    expect(screen.queryByRole('button', { name: FORMAT.logSetLabel(1) })).toBeNull();
    fireEvent.click(screen.getByRole('button'));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('the active row has one Log button, the primary sticker', () => {
    renderRow({});
    const log = screen.getByRole('button', { name: FORMAT.logSetLabel(1) });
    expect(log.classList.contains('is-primary')).toBe(true);
  });

  it('the bodyweight control is a labelled switch, not a 20 px checkbox', () => {
    renderRow({});
    const toggle = screen.getByRole('switch', { name: FORMAT.setBodyweightQuantity(1) });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it('offers the effort taps only under the latest logged set', () => {
    renderRow({ logged: loggedSet(), showEffort: false });
    expect(screen.queryByRole('group', { name: FORMAT.setEffortQuantity(1) })).toBeNull();
  });
});
```

Append to `src/ui/views/train/ExerciseCard.test.tsx` (it defines `renderCard(skin, onCoach)`; `logRow` there logs a row by Enter):

```tsx
describe('ExerciseCard: one active row (brief 4.2 d)', () => {
  it('renders exactly one Log button in an open card, and moves it to the next set after a log', () => {
    renderCard('limelight', vi.fn());
    expect(screen.getAllByRole('button', { name: /^Log set \d+$/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: FORMAT.logSetLabel(1) })).toBeInTheDocument();
    logRow(1, '60', '8');
    expect(screen.getAllByRole('button', { name: /^Log set \d+$/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: FORMAT.logSetLabel(2) })).toBeInTheDocument();
  });

  it('a tap on a pending line makes that set the active row', () => {
    renderCard('limelight', vi.fn());
    fireEvent.click(screen.getByText(FORMAT.setCounter(3, 3, SKIN_COPY.limelight)));
    expect(screen.getByRole('button', { name: FORMAT.logSetLabel(3) })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: FORMAT.logSetLabel(1) })).toBeNull();
  });
});
```

(`/^Log set \d+$/` is `FORMAT.logSetLabel(n)`'s shape, "Log set 1"; `e2e/support/constants.ts` pins the same words.)

In `src/ui/views/TrainView.test.tsx`, in `it('applies the deload block set modifier to the row count', ...)` replace

```tsx
    expect(screen.getByLabelText(`${FORMAT.setLoadQuantity(2)} (kg)`)).toBeInTheDocument();
    expect(screen.queryByLabelText(`${FORMAT.setLoadQuantity(3)} (kg)`)).toBeNull();
```

with

```tsx
    // Brief 4.2: set 1 is the active row, set 2 a pending line; there is no set 3.
    expect(screen.getByText(FORMAT.setCounter(2, 2, SKIN_COPY.limelight))).toBeInTheDocument();
    expect(screen.queryByText(FORMAT.setCounter(3, 2, SKIN_COPY.limelight))).toBeNull();
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/views/train/SetRow.test.tsx src/ui/views/train/ExerciseCard.test.tsx`
Expected: FAIL (no `mode`/`showEffort` props; three Log buttons; a checkbox).

- [ ] **Step 3: SetRow**

In `src/ui/views/train/SetRow.tsx`:
1. Add `formatPrescription` to the `../../format/plan` import.
2. In `SetRowProps`, after `onDelete: () => void;` add:

```ts
  /**
   * Brief 4.2: an unlogged row is the card's ONE active row (fields, toggle, Log) or a pending
   * 44 px line that becomes active on a tap. Default 'active', so a lone row is always usable.
   */
  mode?: 'active' | 'pending';
  /** A pending line's tap: make this set the active row. */
  onActivate?: () => void;
  /** Brief 4.2: the effort taps show only under the most recently logged set. Default true. */
  showEffort?: boolean;
```

and destructure `mode = 'active'`, `onActivate`, `showEffort = true` after `onDelete,`.
3. Immediately before `  if (logged !== null && !editing) {` add:

```tsx
  if (logged === null && !editing && mode === 'pending') {
    // Brief 4.2: one 44 px line, the set and its target; a tap makes it the active row.
    return (
      <button type="button" className="set-row pending" onClick={onActivate}>
        <span className="set-marker">{marker}</span>
        <span className="set-target">{formatPrescription(prescription)}</span>
      </button>
    );
  }
```

4. In the logged-row branch change `        {logged.rpe === null && (` to `        {logged.rpe === null && showEffort && (`.
5. In the unlogged/editing render, change the root `<div className={rowClass}>` so `rowClass` reads `editing ? 'set-row editing' : isBonus ? 'set-row active bonus' : 'set-row active'`, and replace the whole bodyweight `<div className="unit-input"> <label ...> <input type="checkbox" .../> </div>` inside `set-actions` with:

```tsx
        {/* Brief 4.2 (e): a 44 px labelled switch; the old 20 x 20 checkbox missed the target. */}
        <button
          type="button"
          role="switch"
          className="set-bw"
          aria-checked={bodyweight}
          onClick={() => {
            setBodyweight((b) => !b);
          }}
        >
          {FORMAT.setBodyweightQuantity(n)}
        </button>
```

6. Give the non-editing Log button `className="is-primary"`.

- [ ] **Step 4: ExerciseCard**

In `src/ui/views/train/ExerciseCard.tsx`:
1. After `const [bonusRows, setBonusRows] = useState(0);` add `  /** Brief 4.2: the set the user tapped to make active; null = the first unlogged set. */\n  const [chosenN, setChosenN] = useState<number | null>(null);`.
2. After `const rowCount = Math.max(targetSets, maxLoggedNumber) + bonusRows;` add:

```ts
  // Brief 4.2: ONE active row per card: the tapped set if it is still unlogged, else the first
  // unlogged one. [sets], 1-based.
  const isLogged = (n: number): boolean => todaysSets.some((s) => s.setNumber === n);
  const firstOpen = Array.from({ length: rowCount }, (_, i) => i + 1).find((n) => !isLogged(n)) ?? null;
  const activeN = chosenN !== null && chosenN <= rowCount && !isLogged(chosenN) ? chosenN : firstOpen;
  // The most recently logged set of this card: the only one that offers the effort taps.
  const latestId =
    todaysSets.reduce<LoggedSet | null>((a, s) => (a === null || s.loggedAt > a.loggedAt ? s : a), null)?.id ??
    null;
```

3. On the `<SetRow` element add the props:

```tsx
                  mode={n === activeN ? 'active' : 'pending'}
                  onActivate={() => {
                    setChosenN(n);
                  }}
                  showEffort={logged !== null && logged.id === latestId}
```

4. In the Add Set button's `onClick` replace `setBonusRows((b) => b + 1);` with:

```ts
              // The user asked for this row: it becomes the active one.
              setChosenN(rowCount + 1);
              setBonusRows((b) => b + 1);
```

5. Move, with their comments, the `{advice.kind !== 'deload' && <p className="ex-reason">{advice.reason}</p>}` line, the `<details className="ex-why">...</details>` element and the `<div className="ex-links">...</div>` element from above `<div className="set-list">` to just after the Add Set button (before `{children}`). The card body then reads: last session and suggested load, the set rows, Add Set, the reason, the why disclosure, the form buttons; the active row sits right under the suggested load (brief 4.2 (c): its top in the upper half of a 390 x 664 screen, measured in Task 17).

- [ ] **Step 5: CSS**

In `src/ui/styles/train.css`:
- replace `.unit-input label { ... }` body's `font-size` with `font-size: var(--text-xs);` and its `color: var(--text-3);` with `color: var(--ink);` (12 px ink labels, brief 4.2);
- append:

```css
/* Brief 4.2: the active row's two fields side by side, 56 px tall, 20 px tabular digits. */
.set-row.active .unit-input input {
  min-height: var(--tap-primary);
  font-size: var(--text-lg);
  font-variant-numeric: tabular-nums;
}

.set-row.active .set-actions {
  display: flex;
  gap: var(--space-2);
  align-items: stretch;
}

.set-row.active .set-actions > .is-primary {
  flex: 1 1 auto;
}

/* The bodyweight switch: 44 px, its label visible; pressed state by fill and by aria-checked. */
.view .set-bw {
  width: auto;
  min-width: var(--tap);
  min-height: var(--tap);
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
}

.view .set-bw[aria-checked='true'] {
  background: var(--panel);
  color: var(--panel-text);
}

/* A pending set: one 44 px line, the set and its target; a tap makes it the active row. */
.view .set-row.pending {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: var(--tap);
  padding: 0 var(--space-3);
  text-align: left;
}

/* Brief 4.2: a collapsed card is a 56 px head row with done/total. */
.ex-head {
  min-height: var(--tap-primary);
}

/* Form Reference and Form Cues share one row, two half-width 44 px buttons. */
.ex-links {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
}
```

and delete the now-unused `.set-row:not(.done) .set-actions > .unit-input { flex: none }` rule.

- [ ] **Step 6: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/views/train src/ui/views/TrainView.test.tsx src/ui/styles`
Expected: PASS. Every existing case that logs set `n` first logs sets 1..n-1 or taps Add Set (which activates its row), so `logRow` finds the fields.

- [ ] **Step 7: Commit**

```bash
git add -- src/ui/views/train/SetRow.tsx src/ui/views/train/SetRow.test.tsx src/ui/views/train/ExerciseCard.tsx src/ui/views/train/ExerciseCard.test.tsx src/ui/views/TrainView.test.tsx src/ui/styles/train.css
git commit -m "feat(train): one active set row and one Log per card, pending lines, 44 px switch, latest-only effort (brief 4.2)"
```

---

### Task 15: Today's next session and its Start are the hero; Targets records with its sticker (brief 4.1, 4.3)

**Files:**
- Modify: `src/ui/views/TodayView.tsx` (a `startButton` element; the hero branches; the controls)
- Modify: `src/ui/views/TargetsView.tsx` (the section class; the Record button class)
- Modify: `src/ui/views/views.css` (`.view.today .today-controls ...` rule, `.view.today .today-eyebrow` renamed, Targets field rule)
- Test: `src/ui/views/TodayView.test.tsx` (describe appended), `src/ui/views/TargetsView.test.tsx` (describe appended)

**Interfaces:**
- Consumes: Task 2 `.is-primary`; P1 Task 11's `canStartAnyway`, `onStart`, `status`, `position` in `TodayView`.
- Produces: DOM contract for Task 17: Today's Start is `button.is-primary.today-start`, rendered inside `.today-hero` directly after the hero name; Today's secondary actions are the buttons of `.today-controls`, two per row.

Design (brief 4.1): order on Today is marquee, her, the session name (display 32 px), Start as the screen's one sticker at 56 px full width, one sub line (time, count), the exercise list, then the secondary actions (mark done, skip, train something else, pause) as a 2 x 2 grid of 44 px lime buttons, the week stamp and the 14-day strip. The session position line moves BELOW the name (craft floor: no label above a heading). When a session is open, "return to session" is the sticker instead (one sticker per screen either way). Today measured Start's top at 743 px, under the 664 px fold of an iPhone 13 [brief, measured]; Task 17 measures it above the tab bar at 320 x 640 and 390 x 664. Targets (brief 4.3): intake fields 56 px with 20 px digits; Record is the screen's sticker.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/views/TodayView.test.tsx` (it renders with `render(<TodayView />)` on a planned Monday by default and defines `button(key)`):

```tsx
describe('Today: Start is the hero (brief 4.1)', () => {
  it('renders Start as the one sticker, directly after the session name, before the sub line', () => {
    const { container } = render(<TodayView />);
    const start = button('button.startSession');
    expect(start.classList.contains('is-primary')).toBe(true);
    const name = container.querySelector('.today-hero h1');
    expect(name?.nextElementSibling).toBe(start);
    const sub = container.querySelector('.today-hero .today-sub');
    expect(start.compareDocumentPosition(sub as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll('.is-primary')).toHaveLength(1);
  });

  it('puts no label above the hero name: the position line follows it', () => {
    const { container } = render(<TodayView />);
    const hero = container.querySelector('.today-hero');
    const position = hero?.querySelector('.today-position');
    const name = hero?.querySelector('h1');
    expect(position).not.toBeNull();
    expect((name as Node).compareDocumentPosition(position as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps Start out of the secondary controls', () => {
    const { container } = render(<TodayView />);
    const controls = container.querySelector('.today-controls');
    expect(controls?.textContent ?? '').not.toContain(copyFor('limelight', 'button.startSession'));
  });
});
```

(`HeroName` renders the name as an `h1`; `button(key)` is the file's helper that finds a button by its limelight label; the file's top-level `beforeEach` seeds the planned Monday.)

Append to `src/ui/views/TargetsView.test.tsx` (it renders `<TargetsView />` after seeding a profile in its own `beforeEach`):

```tsx
describe('Targets: Record is the sticker (brief 4.3)', () => {
  it('marks the Record button as the one primary action', () => {
    const { container } = render(<TargetsView />);
    const record = screen.getByRole('button', { name: copyFor('limelight', 'button.recordIntake') });
    expect(record.classList.contains('is-primary')).toBe(true);
    expect(container.querySelectorAll('.is-primary')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/views/TodayView.test.tsx src/ui/views/TargetsView.test.tsx -t "hero|sticker"`
Expected: FAIL.

- [ ] **Step 3: Today**

In `src/ui/views/TodayView.tsx`:
1. Immediately before `  let hero: JSX.Element;` add:

```tsx
  /*
   * Brief 4.1: Start is the hero's own control, the screen's one sticker, directly under the
   * session name, so it is above the fold and above the tab bar on a 320 x 640 phone.
   */
  const startButton =
    status === 'planned' || canStartAnyway ? (
      <button type="button" className="is-primary today-start" onClick={onStart}>
        {/*
         * P8 Task 13 step 7: the labelled form puts the `nails` icon in front of the string; the
         * icon carries alt="", so the accessible name is the string alone.
         */}
        <SkinLabel copyKey="button.startSession" />
      </button>
    ) : null;
```

2. In EVERY hero branch move the `<p className="today-eyebrow">...</p>` element (its contents unchanged) to directly after that branch's last `<p className="today-sub">` (or after the `HeroName` where the branch has no sub line), and rename its class to `today-position`.
3. In the `session !== null` branch and in the final `else` branch (`hero.noSessionToday`), insert `{startButton}` directly after the `<HeroName ... />` element.
4. In `<div className="today-controls">` delete the whole `{(status === 'planned' || canStartAnyway) && ( <button ...> ... <SkinLabel copyKey="button.startSession" /> </button> )}` block and its comment, and give the `button.returnToSession` button `className="is-primary"`.

In `src/ui/views/views.css`:
- rename the selector `.view.today .today-eyebrow` to `.view.today .today-position` (body unchanged; it is 12 px after Task 2);
- after the `.view.today .today-controls, .view.today .today-skip, .view.today .today-picker { ... }` rule add:

```css
/* Brief 4.1: the secondary actions two per row, 44 px each; the sticker spans the row. */
.view.today .today-controls {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.view.today .today-controls > .is-primary,
.view.today .today-controls > .today-banner {
  grid-column: 1 / -1;
}

.view.today .today-start {
  margin: var(--space-2) 0 var(--space-3);
}

/* Brief 4.3: the intake fields are 56 px with 20 px tabular digits. */
.view.targets .view-field input {
  min-height: var(--tap-primary);
  font-size: var(--text-lg);
}
```

- [ ] **Step 4: Targets**

In `src/ui/views/TargetsView.tsx` change the component's root `<section className="view">` to `<section className="view targets">` and `<button type="button" onClick={record}>` to `<button type="button" className="is-primary" onClick={record}>`.

- [ ] **Step 5: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/views/TodayView.test.tsx src/ui/views/TargetsView.test.tsx src/app/App.test.tsx`
Expected: PASS (P1 Task 11's "renders a refusal directly below the controls" still finds `.today-controls`).

- [ ] **Step 6: Commit**

```bash
git add -- src/ui/views/TodayView.tsx src/ui/views/TodayView.test.tsx src/ui/views/TargetsView.tsx src/ui/views/TargetsView.test.tsx src/ui/views/views.css
git commit -m "feat(today): Start is the hero's sticker under the name; 2 x 2 secondary actions; Targets Record sticker (brief 4.1, 4.3)"
```

---

### Task 16: The body-mass chart drawn at its real width, 12 px ticks, 200 px tall (brief 4.3; D9, G10)

**Files:**
- Modify: `src/ui/components/BodyMassChart.tsx` (geometry constants, a width hook, the root element, tick font size, stroke widths, point radius)
- Test: `src/ui/components/BodyMassChart.test.tsx` (describe appended)

**Interfaces:**
- Consumes: nothing new.
- Produces: `BodyMassChartProps` unchanged (`height?: number` [px], default now 200); `CHART_FALLBACK_WIDTH_PX = 340` exported for the tests; the chart renders `<div className="bm-chart"><svg viewBox="0 0 W H" width={W} height={H}>` with W the container's measured width [px], so one viewBox unit is one CSS pixel. P5 (R9, G10) builds on this geometry.

Design (brief 4.3): the fixed 640 x 260 viewBox scaled into a 358 px column drew its 10-unit tick labels at about 6 px and left empty bands above and below the plot [brief, measured]. The viewBox now takes the container's width (ResizeObserver) and a 200 px height, so labels set at 12 are 12 CSS px in `--fine` (`--chart-text`), points are 4 px, the measured line 2 px ink, the projection 1.5 px dashed `--chart-line`; padding top 8 / bottom 24 puts the plot at (200 - 32) / 200 = 84 % of the height (brief: >= 70 %). Where ResizeObserver is absent (jsdom) the width falls back to 340 px. Rejected: a CSS-only fix (`font-size` in CSS px inside a scaled viewBox still scales with the viewBox).

- [ ] **Step 1: Write the failing test**

Append to `src/ui/components/BodyMassChart.test.tsx`:

```tsx
describe('drawn at its real width (brief 4.3; D9, G10)', () => {
  it('uses one viewBox unit per CSS pixel, 200 px tall, at the fallback width without ResizeObserver', () => {
    const { container } = render(<BodyMassChart entries={[entry('2026-01-12', 94, 'a')]} units="metric" {...BASE} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${String(CHART_FALLBACK_WIDTH_PX)} 200`);
    expect(svg?.getAttribute('width')).toBe(String(CHART_FALLBACK_WIDTH_PX));
    expect(svg?.getAttribute('height')).toBe('200');
  });

  it('takes the container width a ResizeObserver reports', () => {
    class FakeObserver {
      readonly cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe(): void {
        // [px] the 390 px phone's column: 390 - 2 x 16 gutter
        this.cb([{ contentRect: { width: 358 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect(): void {
        return;
      }
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
    const { container } = render(<BodyMassChart entries={[]} units="metric" {...BASE} />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 358 200'); // [px]
    vi.unstubAllGlobals();
  });

  it('sets tick labels at 12 px, points at r 4, the line at 2 and the projection at 1.5 dashed', () => {
    const { container } = render(<BodyMassChart entries={[entry('2026-01-12', 94, 'a')]} units="metric" {...BASE} />);
    for (const text of container.querySelectorAll('text')) expect(text.getAttribute('font-size')).toBe('12');
    expect(container.querySelector("[data-testid='measured-point']")?.getAttribute('r')).toBe('4');
    expect(container.querySelector("[data-testid='measured']")?.getAttribute('stroke-width')).toBe('2');
    expect(container.querySelector("[data-testid='projection']")?.getAttribute('stroke-width')).toBe('1.5');
  });

  it('gives the plot at least 70 % of the height', () => {
    const { container } = render(<BodyMassChart entries={[entry('2026-01-12', 94, 'a')]} units="metric" {...BASE} />);
    const grid = [...container.querySelectorAll('g line')].map((l) => Number(l.getAttribute('y1')));
    const span = Math.max(...grid) - Math.min(...grid); // [px] top tick to bottom tick
    expect(span / 200).toBeGreaterThanOrEqual(0.7);
  });
});
```

and add `vi` to the vitest import and `CHART_FALLBACK_WIDTH_PX` to the `./BodyMassChart` import.

(`BASE` is the file's fixture: baseline 2026-01-05, a rate and a horizon; `entry(date, kg, id)` its builder.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=1 src/ui/components/BodyMassChart.test.tsx`
Expected: FAIL (`viewBox="0 0 640 260"`, font size 10, r 3).

- [ ] **Step 3: Implement**

In `src/ui/components/BodyMassChart.tsx`:
1. Change the React import to `import { useEffect, useRef, useState, type ReactElement } from 'react';`.
2. Replace the constants block from `const VIEW_W = 640;` through `const DEFAULT_HEIGHT = 260; // [px]` with:

```ts
/**
 * Brief 4.3 (D9, G10): the viewBox is the container's own size, so one unit is one CSS pixel and
 * a 12-unit label is 12 px on every phone. 340 px is the width used where ResizeObserver is
 * absent (jsdom); a 320-412 px phone column is 288-380 px.
 */
export const CHART_FALLBACK_WIDTH_PX = 340; // [px]
const PAD_L = 56; // [px] room for a "210.1 lb" tick label at 12 px
const PAD_R = 12; // [px]
const PAD_T = 8; // [px]
const PAD_B = 24; // [px] the date labels under the axis; plot = (200 - 32) / 200 = 84 %
const Y_TICKS = 5;
const DEFAULT_HEIGHT = 200; // [px]
const LABEL_PX = 12; // [px] the type floor (brief 3.1)

/** [px] The width of `ref`'s element, followed as it changes; the fallback where unmeasurable. */
function useContainerWidth(ref: { readonly current: HTMLDivElement | null }): number {
  const [width, setWidth] = useState(CHART_FALLBACK_WIDTH_PX);
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0; // [px]
      if (measured > 0) setWidth(Math.round(measured));
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}
```

3. In the component, after `const height = props.height ?? DEFAULT_HEIGHT;` add:

```ts
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const VIEW_W = useContainerWidth(wrapRef); // [px] = viewBox units
  const VIEW_H = height; // [px] = viewBox units
```

(move the `const height = ...` line above every early use; the two hooks must run before any return).
4. Wrap the returned `<svg ...>...</svg>` in `<div ref={wrapRef} className="bm-chart">...</div>`, and on the `<svg>` replace `width="100%"` with `width={VIEW_W}` and `preserveAspectRatio="xMidYMid meet"` with `preserveAspectRatio="none"` (the viewBox already equals the box).
5. Replace every `fontSize="10"` with `fontSize={LABEL_PX}`; in the y-label `<text>` change `y={coord(yAt(kg) + 3)}` to `y={coord(yAt(kg) + 4)}`; in the two x-label `<text>` elements change `y={VIEW_H - PAD_B + 14}` to `y={VIEW_H - PAD_B + 16}`.
6. On the projection path change `strokeWidth="1.25"` to `strokeWidth="1.5"` and `strokeDasharray="3 3"` to `strokeDasharray="4 4"`; on the measured path `strokeWidth="1.75"` to `strokeWidth="2"`; on each circle `r="3"` to `r="4"`.

- [ ] **Step 4: Run**

Run: `npx vitest run --maxWorkers=1 src/ui/components/BodyMassChart.test.tsx src/ui/views/LogView.test.tsx`
Expected: PASS (the existing cases compare coordinates with each other, never with 640).

- [ ] **Step 5: Commit**

```bash
git add -- src/ui/components/BodyMassChart.tsx src/ui/components/BodyMassChart.test.tsx
git commit -m "feat(log): body-mass chart at its real width, 200 px tall, 12 px ticks (brief 4.3; D9, G10)"
```

---

### Task 17: Playwright acceptances for the shell and Train (brief 2.1-2.5, 4.1, 4.2, 5.2)

**Files:**
- Create: `e2e/support/sweeps.ts`, `e2e/p4a-shell.spec.ts`
- Modify: `e2e/support/constants.ts` (`LABEL` gains eight words), `src/test/e2eDocument.test.ts` (pins them)

**Interfaces:**
- Consumes: every earlier task's DOM contract: `.topbar`, `.topbar-title`, `.tabbar .tab`, `.tab-label`, the More dialog's row buttons, `.view-slot[hidden]`, `.site-footer a`, `.today-start`, `.today-controls`, `.ex-card.open .set-row.active .is-primary`, `.rest-panel`, `.rest-summary`, `[data-testid="toast"]`; e2e helpers `seedDocument`, `setClock`, `openApp`, `startFromToday`, `logSet`, `chicago`, `MONDAY`, `e2eDocument`.
- Produces: `contrastFailures(page): Promise<ContrastFailure[]>`, `smallText(page): Promise<string[]>`, `smallFields(page): Promise<string[]>`, `rectOf(page, selector)`, `hitsItself(page, selector): Promise<boolean>` (Task 18 uses the first three); `LABEL.trainTab`, `targetsTab`, `logTab`, `moreTab`, `planRow`, `atlasRow`, `settingsRow`, `findRow`.

Design: every brief acceptance that needs layout becomes a Playwright check on the phone projects (iPhone 13 390 x 664 and Pixel 7 emulation, plus `setViewportSize` for 320 px): header 44 px with the title never cut (2.1, F07); five tab slots of at least 64 x 56 px at 320 px with no clipped label, the bar at the viewport bottom on Settings scrolled to its end (2.2); content = viewport - 32 px (2.3); footer only on Settings with a 44 px link (2.4); Back closes More first, then returns to the previous view, staying in the app (R6, F01); Start from Today scrolled 600 px opens Train at scrollY 0 (F09); a typed load survives a tab switch (F02); Today's Start fully visible between header and tab bar at 320 x 640 and 390 x 664, secondary actions 44 px (4.1); Train (4.2): active row top in the upper half (c), one Log button per open card (d), every active-row target at least 44 px (e), the rest bar in the viewport at the top and the bottom of the page (a), the toast's bottom at most 44 + 8 + 96 px and the active Log button hit by `elementFromPoint` with the undo toast up (b; 5.2), the rest bar one 56 px row with no clipped label at 320 px (f). The Codex implementer cannot run Playwright (no ports): it writes the files and runs `tsc`; the Claude runner runs the specs. Not measurable in Chromium and left to the owner's device check (Task 18): safe-area insets, Android back in an installed app, the iOS keyboard over the palette.

- [ ] **Step 1: The sweep helpers and labels**

Create `e2e/support/sweeps.ts`:

```ts
// e2e/support/sweeps.ts
//
// In-page measurements for the P4a acceptances (docs/design/p4-design-brief.md 2-7) that jsdom
// cannot make: computed contrast, computed font sizes, rectangles. Every function runs ONE
// page.evaluate and returns plain data, so a failing spec prints what failed and where.
//
// Contrast is WCAG 2.1 relative luminance on COMPUTED colours: the text colour composited over
// the first ancestor background that is opaque (semi-transparent layers on the way are
// composited in order). Background images (gradients, the CRT layers) are not read; the specs
// seed `scanlines: false`, and no text in the app sits on a gradient.
import type { Page } from '@playwright/test';

export interface ContrastFailure {
  text: string;
  ratio: number;
  need: number;
  px: number;
  where: string;
}

/** Every visible text node whose contrast is under 4.5:1 (3:1 at >= 24 px, or >= 18.66 px bold). */
export async function contrastFailures(page: Page): Promise<ContrastFailure[]> {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number];
    const parse = (css: string): Rgba => {
      const m = /rgba?\(([^)]+)\)/.exec(css);
      if (m === null) return [0, 0, 0, 0];
      const p = (m[1] ?? '').split(/[\s,/]+/).filter((x) => x !== '').map(Number);
      return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
    };
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3];
      return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
    };
    const lum = (c: Rgba): number => {
      const ch = [c[0], c[1], c[2]].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
    };
    const ratio = (a: Rgba, b: Rgba): number => {
      const x = lum(a);
      const y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const backgroundOf = (el: Element): Rgba => {
      const layers: Rgba[] = [];
      for (let n: Element | null = el; n !== null; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg[3] > 0) layers.push(bg);
        if (bg[3] >= 0.99) break;
      }
      let base: Rgba = [255, 255, 255, 1];
      for (let i = layers.length - 1; i >= 0; i -= 1) base = over(layers[i] ?? base, base);
      return base;
    };
    const visible = (el: Element): boolean => {
      if (el.closest('[aria-hidden="true"], .visually-hidden, [hidden]') !== null) return false;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    };
    const out: ContrastFailure[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      const el = node.parentElement;
      if (text === '' || el === null || !visible(el)) continue;
      // WCAG 1.4.3 exempts inactive controls.
      if (el.closest('button:disabled, [aria-disabled="true"]') !== null) continue;
      const style = getComputedStyle(el);
      const bg = backgroundOf(el);
      const fg = over(parse(style.color), bg);
      const px = Number.parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const need = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5;
      const r = ratio(fg, bg);
      if (r < need) {
        out.push({ text: text.slice(0, 40), ratio: Math.round(r * 100) / 100, need, px, where: el.className.toString() });
      }
    }
    return out;
  });
}

/** Visible text set under 12 px (brief 3.1). aria-hidden art is not text to read. */
export async function smallText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[aria-hidden="true"], .visually-hidden, [hidden]') !== null) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const px = Number.parseFloat(getComputedStyle(el).fontSize);
      if (px < 12) out.push(`${el.tagName.toLowerCase()}.${el.className.toString()} ${String(px)}px "${(el.textContent ?? '').trim().slice(0, 30)}"`);
    }
    return out;
  });
}

/** Visible text-entry controls under 16 px (F10; iOS zooms the page on focus below it). */
export async function smallFields(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel =
      "input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']):not([type='hidden']), select, textarea";
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[hidden]') !== null) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const px = Number.parseFloat(getComputedStyle(el).fontSize);
      if (px < 16) out.push(`${el.tagName.toLowerCase()}#${el.id} ${String(px)}px`);
    }
    return out;
  });
}

/** The page's rectangle for the first element matching `selector`, or null. [px] */
export async function rectOf(
  page: Page,
  selector: string,
): Promise<{ top: number; bottom: number; left: number; right: number; width: number; height: number } | null> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  }, selector);
}

/** Whether the element at the centre of `selector`'s box is that element or inside it. */
export async function hitsItself(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el === null) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && (hit === el || el.contains(hit));
  }, selector);
}
```

In `e2e/support/constants.ts`, inside `LABEL`, after `  writesPaused: 'Nothing is saved until you import a backup',` add:

```ts
  // P4a (plan docs/plans/2026-11-04-p4a-shell-design.md Task 17): the bar and the More sheet.
  trainTab: 'showtime',
  targetsTab: 'the numbers',
  logTab: 'the archive',
  moreTab: 'More',
  planRow: 'the run',
  atlasRow: 'the collection',
  settingsRow: 'backstage',
  findRow: 'find it',
```

In `src/test/e2eDocument.test.ts`, inside `it('taps the words the app renders on the limelight skin', ...)`, add:

```ts
    expect(LABEL.trainTab).toBe(copyFor('limelight', 'nav.train'));
    expect(LABEL.targetsTab).toBe(copyFor('limelight', 'nav.targets'));
    expect(LABEL.logTab).toBe(copyFor('limelight', 'nav.log'));
    expect(LABEL.moreTab).toBe(copyFor('limelight', 'nav.more'));
    expect(LABEL.planRow).toBe(copyFor('limelight', 'nav.plan'));
    expect(LABEL.atlasRow).toBe(copyFor('limelight', 'nav.atlas'));
    expect(LABEL.settingsRow).toBe(copyFor('limelight', 'nav.settings'));
    expect(LABEL.findRow).toBe(copyFor('limelight', 'button.openSpotlight'));
```

Run: `npx vitest run --maxWorkers=1 src/test/e2eDocument.test.ts`
Expected: PASS (the eight words equal the limelight table; `nav.more` resolves to the base `More`).

- [ ] **Step 2: The shell spec**

Create `e2e/p4a-shell.spec.ts`:

```ts
// P4a shell and Train acceptances that need layout (docs/design/p4-design-brief.md 2.1-2.5,
// 4.1, 4.2, 5.2; audit F01, F02, F05, F07, F09, C05, C08). Chromium emulation: safe-area insets,
// the iOS keyboard and Android back in an installed app are device checks (plan Task 18).
import { expect, test, type Page } from '@playwright/test';
import { LABEL, deleteLabel, loadLabel, logLabel } from './support/constants';
import { chicago, logSet, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';
import { hitsItself, rectOf } from './support/sweeps';

const PHONE_WIDTHS = [320, 390, 412] as const; // [px]

/** A returning user on a planned Monday evening, opened cold. */
async function launch(context: Parameters<typeof openApp>[0]): Promise<Page> {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  return openApp(context);
}

const tab = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true });

async function openFromMore(page: Page, row: string): Promise<void> {
  await tab(page, LABEL.moreTab).click();
  await page.getByRole('dialog').getByRole('button', { name: row, exact: true }).click();
}

test('header: one 44 px line at every phone width, the title never cut to a letter (2.1, F07)', async ({ context }) => {
  const page = await launch(context);
  for (const width of PHONE_WIDTHS) {
    await page.setViewportSize({ width, height: 700 });
    const header = await rectOf(page, '.topbar');
    expect(header?.height).toBe(44); // [px] no safe-area inset in Chromium
    for (const go of [
      () => tab(page, LABEL.todayTab).click(),
      () => tab(page, LABEL.trainTab).click(),
      () => tab(page, LABEL.targetsTab).click(),
      () => tab(page, LABEL.logTab).click(),
      () => openFromMore(page, LABEL.planRow),
      () => openFromMore(page, LABEL.atlasRow),
      () => openFromMore(page, LABEL.settingsRow),
    ]) {
      await go();
      const fits = await page.evaluate(() => {
        const t = document.querySelector('.topbar-title');
        return t !== null && t.scrollWidth <= t.clientWidth;
      });
      expect(fits).toBe(true);
    }
  }
});

test('tab bar: five slots, 64 x 56 px or more at 320 px, no clipped label, always at the bottom (2.2, F05)', async ({ context }) => {
  const page = await launch(context);
  await page.setViewportSize({ width: 320, height: 640 });
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll('.tabbar .tab')].map((b) => {
      const r = b.getBoundingClientRect();
      const label = b.querySelector('.tab-label');
      return { w: r.width, h: r.height, clipped: label === null || label.scrollWidth > label.clientWidth };
    }),
  );
  expect(tabs).toHaveLength(5);
  for (const t of tabs) {
    expect(t.w).toBeGreaterThanOrEqual(64);
    expect(t.h).toBeGreaterThanOrEqual(56);
    expect(t.clipped).toBe(false);
  }
  await openFromMore(page, LABEL.settingsRow);
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const bar = await rectOf(page, '.tabbar');
  const inner = await page.evaluate(() => innerHeight);
  expect(bar?.bottom).toBe(inner);
});

test('one gutter: content is the viewport minus 32 px (2.3)', async ({ context }) => {
  const page = await launch(context);
  for (const width of PHONE_WIDTHS) {
    await page.setViewportSize({ width, height: 700 });
    const content = await page.evaluate(() => {
      const v = document.querySelector('.view-slot:not([hidden]) .view');
      if (v === null) return -1;
      const s = getComputedStyle(v);
      return v.getBoundingClientRect().width - Number.parseFloat(s.paddingLeft) - Number.parseFloat(s.paddingRight);
    });
    expect(content).toBe(width - 32);
  }
});

test('footer only on Settings, its link 44 px tall (2.4)', async ({ context }) => {
  const page = await launch(context);
  expect(await page.locator('.view-slot:not([hidden]) .site-footer').count()).toBe(0);
  await openFromMore(page, LABEL.settingsRow);
  const link = await rectOf(page, '.view-slot:not([hidden]) .site-footer a');
  expect(link?.height).toBeGreaterThanOrEqual(44);
});

test('Back closes the More sheet first, then returns to the previous view, and never leaves the app (R6, F01)', async ({ context }) => {
  const page = await launch(context);
  await tab(page, LABEL.logTab).click();
  await tab(page, LABEL.moreTab).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.url()).toContain('#/log');
  await page.goBack();
  expect(page.url()).toContain('#/today');
  await expect(tab(page, LABEL.todayTab)).toHaveAttribute('aria-current', 'page');
});

test('Start from Today scrolled 600 px opens Train at the top (2.5, F09)', async ({ context }) => {
  const page = await launch(context);
  await page.setViewportSize({ width: 390, height: 664 });
  await page.evaluate(() => {
    window.scrollTo(0, 600);
  });
  await page.getByRole('button', { name: LABEL.start }).click({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: LABEL.finish })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('a typed set value survives a tab switch (2.5, F02)', async ({ context }) => {
  const page = await launch(context);
  await startFromToday(page);
  await page.getByLabel(loadLabel(1), { exact: true }).fill('62.5');
  await tab(page, LABEL.logTab).click();
  await tab(page, LABEL.trainTab).click();
  await expect(page.getByLabel(loadLabel(1), { exact: true })).toHaveValue('62.5');
});

test('Today: Start is fully visible above the tab bar at 320 x 640 and 390 x 664 (4.1)', async ({ context }) => {
  const page = await launch(context);
  for (const [width, height] of [
    [320, 640],
    [390, 664],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    const start = await rectOf(page, '.view-slot:not([hidden]) .today-start');
    const bar = await rectOf(page, '.tabbar');
    const header = await rectOf(page, '.topbar');
    expect(start).not.toBeNull();
    expect(start?.top ?? 0).toBeGreaterThanOrEqual(header?.bottom ?? 0);
    expect(start?.bottom ?? Infinity).toBeLessThanOrEqual(bar?.top ?? 0);
    const controls = await page.evaluate(() =>
      [...document.querySelectorAll('.view-slot:not([hidden]) .today-controls > button')].map((b) => b.getBoundingClientRect().height),
    );
    for (const h of controls) expect(h).toBeGreaterThanOrEqual(44);
  }
});

test('Train: rest bar always in view, Log reachable under a toast, one active row near the top (4.2, C05, C08)', async ({ context }) => {
  const page = await launch(context);
  await page.setViewportSize({ width: 390, height: 664 });
  await startFromToday(page);
  // (c) second session (warm-up dismissed in the seed): the active row's top in the upper half.
  const row = await rectOf(page, '.view-slot:not([hidden]) .ex-card.open .set-row.active');
  expect(row?.top ?? Infinity).toBeLessThanOrEqual(664 / 2);
  // (d) one Log button per open card; (e) every target in the active row >= 44 x 44.
  expect(await page.locator('.view-slot:not([hidden]) .ex-card.open .set-row.active .is-primary').count()).toBe(1);
  const targets = await page.evaluate(() =>
    [...document.querySelectorAll('.view-slot:not([hidden]) .set-row.active button, .view-slot:not([hidden]) .set-row.active input')].map((e) => {
      const r = e.getBoundingClientRect();
      return Math.min(r.width, r.height);
    }),
  );
  for (const side of targets) expect(side).toBeGreaterThanOrEqual(44);

  await logSet(page, 1, '60', '5');
  // (a) the remaining rest is in the viewport at the top and at the bottom of the page.
  for (const y of [0, 100_000]) {
    await page.evaluate((top) => {
      window.scrollTo(0, top);
    }, y);
    const bar = await rectOf(page, '.view-slot:not([hidden]) .rest-panel');
    expect(bar).not.toBeNull();
    expect(bar?.top ?? -1).toBeGreaterThanOrEqual(0);
    expect(bar?.bottom ?? Infinity).toBeLessThanOrEqual(664);
  }
  // (b) with a toast showing (the undo offer), the active Log button takes its own tap.
  await page.getByRole('button', { name: deleteLabel(1), exact: true }).click();
  await expect(page.getByRole('button', { name: LABEL.undo, exact: true })).toBeVisible();
  const toast = await rectOf(page, '[data-testid="toast"]');
  expect(toast?.bottom ?? Infinity).toBeLessThanOrEqual(44 + 8 + 96); // [px] header + gap + cap
  await page.getByRole('button', { name: logLabel(1), exact: true }).scrollIntoViewIfNeeded();
  expect(await hitsItself(page, '.view-slot:not([hidden]) .set-row.active .is-primary')).toBe(true);
});

test('rest bar at 320 px: one row, no clipped label (4.2 f)', async ({ context }) => {
  const page = await launch(context);
  await page.setViewportSize({ width: 320, height: 640 });
  await startFromToday(page);
  await logSet(page, 1, '60', '5');
  const bar = await page.evaluate(() => {
    const sign = document.querySelector('.view-slot:not([hidden]) .rest-summary');
    if (sign === null) return null;
    const buttons = [...sign.querySelectorAll('button')].map((b) => b.scrollWidth <= b.clientWidth);
    return { height: sign.getBoundingClientRect().height, unclipped: buttons.every(Boolean) };
  });
  expect(bar?.height).toBeLessThanOrEqual(56); // [px] --restbar-h, border included
  expect(bar?.unclipped).toBe(true);
});
```

- [ ] **Step 3: Type-check and lint (implementer); run (runner)**

Implementer: `npx tsc -b --force` and `npx eslint ./e2e playwright.config.ts`. Expected: silent.
Runner (not the Codex implementer): `npm run e2e -- e2e/p4a-shell.spec.ts`. Expected: `20 passed` (10 tests x 2 projects). Then `npm run e2e`. Expected: every earlier spec still passes (`startFromToday` clicks the Today tab inside the one `navigation` landmark, which the tab bar still is).
If a geometry check fails, fix the CSS of the task that owns it (named in the test title) in a follow-up commit; never loosen a threshold the brief states. One allowed outcome is written into the brief itself: if "rest bar at 320 px" fails on a clipped label, `+30 s` moves into the game sheet's row (brief 4.2 f) in `RestTimerPanel.tsx`, and the test then asserts the remaining controls.

- [ ] **Step 4: Commit**

```bash
git add -- e2e/support/sweeps.ts e2e/p4a-shell.spec.ts e2e/support/constants.ts src/test/e2eDocument.test.ts
git commit -m "test(e2e): P4a shell and Train acceptances in phone emulation (brief 2.1-2.5, 4.1, 4.2, 5.2)"
```

---

### Task 18: Contrast, type and motion sweeps; owner after-shots; full verification and STATUS (brief 3.1, 3.3, 6, 7, 10)

**Files:**
- Create: `e2e/p4a-sweeps.spec.ts`, `e2e/p4a-shots.spec.ts`
- Modify: `docs/STATUS.md` (`## Gates`, `Last update:`)

**Interfaces:**
- Consumes: Task 17 `contrastFailures`, `smallText`, `smallFields`, `LABEL.*`.
- Produces: the sweeps in `npm run e2e` (one worker); `P4A_SHOTS=1 npm run e2e -- e2e/p4a-shots.spec.ts` writes the owner's after-shots to `docs/private/design-2026-11-04/after/` (gitignored).

Design: brief 3.3/7 asks every text node over every view and open overlay to clear 4.5:1 (3:1 at >= 24 px or >= 18.66 px bold) against its painted background, computed in the browser; brief 3.1 a 12 px floor for visible text and 16 px for every field; brief 6 no running animation after 1 s under `reducedMotion: 'reduce'` on every view. Train is swept with a session open, the rest bar up and the undo toast showing. Disabled controls are exempt (WCAG 1.4.3 "inactive user interface components"); aria-hidden art and visually hidden text are not read. Before P4a the palette's active row measured 1:1, Today's marquee 1.92:1, the header ticker 1:1 [brief, measured]; Tasks 2, 6 and 8 fix them.

- [ ] **Step 1: The sweeps**

Create `e2e/p4a-sweeps.spec.ts`:

```ts
// P4a sweeps over every view and the open overlays (docs/design/p4-design-brief.md 3.1, 3.3,
// 6, 7; audit F06, F10): computed contrast, the 12 px type floor, 16 px fields, and no running
// animation under reduced motion. One worker; each sweep prints what failed and where.
import { expect, test, type Page } from '@playwright/test';
import { LABEL, deleteLabel } from './support/constants';
import { chicago, logSet, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';
import { contrastFailures, smallFields, smallText } from './support/sweeps';

const tab = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true });

async function openFromMore(page: Page, row: string): Promise<void> {
  await tab(page, LABEL.moreTab).click();
  await page.getByRole('dialog').getByRole('button', { name: row, exact: true }).click();
}

/** Each screen the sweeps visit, reached the way a user reaches it. */
const SCREENS: ReadonlyArray<readonly [string, (page: Page) => Promise<void>]> = [
  ['today', (p) => tab(p, LABEL.todayTab).click()],
  ['train (session, rest bar, undo toast)', async (p) => {
    await startFromToday(p);
    await logSet(p, 1, '60', '5');
    // The undo offer: a toast on screen over the rest bar and the set rows.
    await p.getByRole('button', { name: deleteLabel(1), exact: true }).click();
  }],
  ['targets', (p) => tab(p, LABEL.targetsTab).click()],
  ['log', (p) => tab(p, LABEL.logTab).click()],
  ['plan', (p) => openFromMore(p, LABEL.planRow)],
  ['atlas', (p) => openFromMore(p, LABEL.atlasRow)],
  ['settings', (p) => openFromMore(p, LABEL.settingsRow)],
  ['more sheet', (p) => tab(p, LABEL.moreTab).click()],
  ['palette', async (p) => {
    await tab(p, LABEL.moreTab).click();
    await p.getByRole('dialog').getByRole('button', { name: LABEL.findRow, exact: true }).click();
  }],
];

async function launch(context: Parameters<typeof openApp>[0]): Promise<Page> {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  return openApp(context);
}

for (const [name, reach] of SCREENS) {
  test(`contrast >= 4.5:1 (3:1 large) on ${name} (brief 3.3, 7; F06)`, async ({ context }) => {
    const page = await launch(context);
    await reach(page);
    expect(await contrastFailures(page)).toEqual([]);
  });

  test(`no text under 12 px and no field under 16 px on ${name} (brief 3.1; F10)`, async ({ context }) => {
    const page = await launch(context);
    await reach(page);
    expect(await smallText(page)).toEqual([]);
    expect(await smallFields(page)).toEqual([]);
  });
}

test('reduced motion: no running animation on any view after 1 s (brief 6)', async ({ context }) => {
  const page = await launch(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [, reach] of SCREENS.slice(0, 7)) {
    await reach(page);
    await page.waitForTimeout(1_000); // [ms]
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.playState === 'running').length,
    );
    expect(running).toBe(0);
  }
});
```

Create `e2e/p4a-shots.spec.ts`:

```ts
// The P4a after-shots for the owner's side-by-side review (docs/design/p4-design-brief.md 10):
// the same names as the before-set in docs/private/design-2026-11-04/ (gitignored), written to
// its after/ folder. Runs only with P4A_SHOTS=1, so CI and the normal e2e run skip it.
import { test, type Page } from '@playwright/test';
import { LABEL } from './support/constants';
import { chicago, logSet, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';

const OUT = 'docs/private/design-2026-11-04/after';

test.skip(process.env.P4A_SHOTS !== '1', 'owner review shots: run with P4A_SHOTS=1');

const tab = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true });

test('after-shots', async ({ context }, info) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  const shot = async (name: string, fullPage = false): Promise<void> => {
    await page.screenshot({ path: `${OUT}/${info.project.name}-${name}.png`, fullPage });
  };
  await shot('today');
  await shot('today-full', true);
  await startFromToday(page);
  await shot('train-open');
  await logSet(page, 1, '60', '5');
  await shot('train-after-log');
  for (const [name, label] of [
    ['targets', LABEL.targetsTab],
    ['log', LABEL.logTab],
  ] as const) {
    await tab(page, label).click();
    await shot(name);
  }
  for (const [name, row] of [
    ['plan', LABEL.planRow],
    ['atlas', LABEL.atlasRow],
    ['settings', LABEL.settingsRow],
  ] as const) {
    await tab(page, LABEL.moreTab).click();
    await page.getByRole('dialog').getByRole('button', { name: row, exact: true }).click();
    await shot(name);
  }
  await tab(page, LABEL.moreTab).click();
  await shot('modal-more');
  await page.getByRole('dialog').getByRole('button', { name: LABEL.findRow, exact: true }).click();
  await shot('modal-palette');
  await page.setViewportSize({ width: 320, height: 640 });
  await page.keyboard.press('Escape');
  await tab(page, LABEL.trainTab).click();
  await shot('w320-train-open');
});
```

Implementer: `npx tsc -b --force` and `npx eslint ./e2e`. Expected: silent.

- [ ] **Step 2: Run the sweeps (runner)**

Run: `npm run e2e -- e2e/p4a-sweeps.spec.ts`
Expected: `38 passed` (9 screens x 2 sweeps + 1 motion test = 19, x 2 projects). A contrast or size failure prints the text, ratio, size and class: fix the rule in the owning sheet (tokens only; never a hex) and rerun; never add an exemption that the brief does not state.

- [ ] **Step 3: The owner's after-shots (runner)**

Run: `P4A_SHOTS=1 npm run e2e -- e2e/p4a-shots.spec.ts`
Expected: `2 passed`; `ls docs/private/design-2026-11-04/after/ | wc -l` prints 24 (12 shots x 2 projects). Publish them beside the before-set on the owner review page with the five items of brief section 9 (tab order and More contents incl. `nav.more`; ticker removal; display-shadow scaling; vignette default off; the icons `dropPanel`, `archive`, `more` and the More-row mapping), per AGENTS "Owner".

- [ ] **Step 4: The AGENTS Verify block, one command at a time**

```bash
npx tsc -b --force
npx eslint ./src ./scripts ./build ./e2e playwright.config.ts
node scripts/check-no-emoji.mjs
bash scripts/check-private.sh
npx vitest run --maxWorkers=1 src/domain src/content
npx vitest run --maxWorkers=1 src/ui
npx vitest run --maxWorkers=1 src/app src/store src/skins src/test src/config build
npm run build && bash scripts/check-dist-csp.sh
cd worker && npx tsc --noEmit -p . && npx vitest run --maxWorkers=1 && cd ..
npm run e2e
grep -rnE "z-index: [0-9]" src --include=*.css ; echo "z exit $?"
grep -rnE "#[0-9a-fA-F]{3,6}\b" src --include=*.css | grep -v "src/ui/styles/tokens.css" ; echo "hex exit $?"
```

Expected: tsc and eslint silent; emoji and privacy gates PASS; every vitest group `0 failed`; build and CSP pass; worker suite passes; e2e all passed; both greps print nothing and `exit 1`. Count test files run against `find src build -name '*.test.ts*' | wc -l` and report both numbers.

- [ ] **Step 5: STATUS**

In `docs/STATUS.md` set `Last update: 2026-11-04.` (or the run date) and add under `## Gates`:

```markdown
- P4a shell (plan `docs/plans/2026-11-04-p4a-shell-design.md`): hash router + one overlay stack (Back closes the top overlay, then the previous view), bottom tab bar + More, one-line safe-area header, toasts at the top, docked rest bar + app-level rest controller. E2E `p4a-shell` (geometry) and `p4a-sweeps` (contrast, 12 px floor, 16 px fields, reduced motion) in `npm run e2e`. Device checks open: safe areas on an installed iPhone, Android back with More/sheets open, rest bar over the home indicator, rest chime after a lock (iOS 'interrupted').
```

- [ ] **Step 6: Commit**

```bash
git add -- e2e/p4a-sweeps.spec.ts e2e/p4a-shots.spec.ts docs/STATUS.md
git commit -m "test(e2e): contrast, type-floor and reduced-motion sweeps over every view; owner after-shots; status (brief 3, 6, 7, 10)"
```

Then give the owner the push line `! cd /home/vx/Desktop/Claude/web-assets/FixThisInjustice && git push origin main`, and after the push follow AGENTS.md Deploy (CI incl. `e2e`, a Deploy run with a `deploy` job, the live `assets/index-*.js` grepped for `tabbar`).

Device checks for the owner (Chromium cannot emulate them; brief section 10):
1. Installed iPhone: the brand clears the status bar; the tab bar and the rest bar clear the home indicator.
2. Android installed app: with More, the palette, Form Cues or the game sheet open, Back closes it and the app stays open; Back from a second view returns to the first.
3. iPhone: lock during a rest, unlock after it ends, start the next rest with a Log tap: the chime sounds at its end (Sounds on) (C07).
4. iPhone keyboard: the palette's field sits above the keyboard and the results stay visible (F11).

---

## Dry run (planner, 2026-11-04)

Prototyped in a scratch copy of `main` at `92ebd80` plus the working tree (P1 Tasks 1-7 landed, Task 8 in progress; P6 not landed), `node_modules` linked, one vitest worker:
- Tasks 1 and 2 applied (tokens, z ladder, fallback purge, `:where()` base rules, 12 px script): `src/ui/styles src/skins src/app/topbar.test.ts src/ui/components` and the two rest-style suites, 44 files, 487 tests: 1 failure, `limeContrast.test.ts` "finds the three tinted controls", fixed by the list update now in Task 2 and re-run green.
- Task 4 (history owner, overlay stack, ModalShell on it) and Task 5 (router, kept-mounted views): `src/ui/components src/ui/motivation src/app src/ui/nav src/ui/overlay`, 47 files, 487 tests, all passed. Two defects found and fixed in the plan: (1) jsdom traverses ONCE for two synchronous `history.back()` calls (measured), so step-backs are batched into one `history.go(-n)`; (2) a release that compared depths could not see a sibling's in-flight step-back, replaced by a count of the stack's own entries.
- Task 11 `RestController.test.tsx`: 5 tests passed after one test fix (the extension must commit before time advances).
- Tasks 7 and 17-18: `TabBar.tsx`, `MoreSheet.tsx`, `tabBar.css`, `e2e/support/sweeps.ts` and the three e2e specs type-check (`tsc -p tsconfig.app.json` and `-p tsconfig.e2e.json`), apart from the two names other tasks add (`ModalShellProps.sheet`, Task 6; `nav.more`, Task 7) and `icons.test.ts` on the design branch. The e2e specs were NOT run (port 4174 is the main runner's).
- Not prototyped: Tasks 3, 6, 8-10, 12-16 (Task 12 targets P6 code that has not landed; Tasks 13-15 target P1 Tasks 11-12 code that has not landed). Their test edits quote the current files; anchors quote P1/P6 plan text.

## Self-review

**Spec coverage (brief sections and the prompt's list):**
- Tokens and z ladder (1): Task 1. Hex fallbacks and `motivation.css #000`: Task 1.
- Header (2.1, F04, F07, F15): Task 8. Tab bar and More (2.2, F05), icons behind one map: Task 7. Gutters (2.3): Task 8. Footer (2.4): Task 8. Scroll/history (2.5, F01, F02, F09): Tasks 4, 5.
- Type scale, display shadow (3.1): Tasks 2, 3. One heading system (3.2): Task 3. States, native controls, `:where()` (3.3, F06, A10, F10, F15): Tasks 2, 3.
- Today (4.1): Task 15. Train (4.2): Tasks 12, 13, 14. Targets, Log chart, Plan range, Atlas, Settings (4.3): Tasks 15, 16, 3, 3, 8. Wizard radios, title, vignette (4.4): Tasks 2, 8, 8.
- Sheets (5.1, F11, F12): Tasks 4, 6, 7, 12. Toasts (5.2, F03, F13): Task 9. Motion (6): Tasks 6, 9 (entrances), 18 (reduced-motion sweep). Contrast (7): Tasks 2, 6, 8, 18.
- R6 router and one overlay stack, P6 `useSheetDismiss` absorbed: Tasks 4, 5, 12. F08: Task 10. C05: Task 12. C06/C07/C11: Task 11. C08: Task 13. C17: Tasks 5 (wake lock), 9 (toast context), 10 (hydration banner). A10, A11: Task 3. Computed-contrast and min-font Playwright sweeps: Task 18.

**Gaps, stated:**
- C17: `React.memo` on `ExerciseCard` not done (its props are new every render, so a memo would never hit; the audit measured 5 fibres per commit).
- Brief 4.1: "her (56 px on the planned hero, per survey item 5)": the mascot size was not checked against the current `todayHero.ts`/sprite CSS; the after-shots (Task 18) show it to the owner.
- Brief 5.1: no shared 44 px close control (each dialog keeps its own); the wizard's guidance modals and the intro keep their own geometry (the brief does not list them).
- Brief 5.1 "no two overlays visible at once except toast over sheet": enforced by structure (a modal's scrim covers the tabs; the stack closes one at a time), not asserted by its own test.
- A11 is asserted by arithmetic on the sheet (44.0 px at 320 px), not measured in a browser: reaching the calendar step in e2e needs a wizard draft at the goal step, which the harness does not build.
- Brief 4.2 (f): if Task 17 measures a clipped rest-bar label at 320 px, `+30 s` moves into the game sheet's row (the brief's own fallback, Task 17 Step 3).
- R7 update banner placement (brief section 10: "E's call") is P4b's; `UpdatePrompt` stays in `<main>`.
- `docs/design/rest-games.md` still names `useSheetDismiss`'s own history marker; P6 Task 11 owns that doc, and Task 12's comment states the change.
- Owner review (brief section 9) is pending and not blocking: tab order and icons are one array and one map in `views.ts`; `nav.more` is base-table only.

**Deviations from the brief, each for a stated reason:** `--z-crt` (a seventh rung for the CRT layers, which the ladder table omits); the Train "eyebrow" and Today's position line move BELOW/BESIDE the heading (craft floor bans a label above a heading); the toast's class mark moves from a 2 px left rule to a top rule (craft floor); the rest-bar label is visually hidden (no room in one 288 px row; the over state is the digits and the pink flip, and the words remain for screen readers); specimen toasts show tag and title only within the 96 px cap.

**Placeholder scan:** no "TBD", "TODO", "implement later" or "similar to Task N". Two steps are conditional on a measured outcome and say exactly what to do (Task 17 Step 3 rest-bar fallback; the `TrainView.test.tsx` wake-lock and unlock cases in Tasks 5 and 11, which are adjusted only if they assert the old behaviour).

**Type consistency:** `HistoryEntry { view, depth }`, `pushEntry`, `replaceEntry`, `stepBack`, `setViewShower`, `setOverlayCloser` (Task 4) are what Tasks 5 and 12 call; `useOverlay(onClose, { modal })`, `openOverlay`, `overlayDepth`, `abandonOverlaysForNavigation`, `isTopOverlay` (Task 4) are what Tasks 5, 6, 9 and 12 call; `goToView` (Task 5) is what Task 7 calls; `ModalShellProps.sheet` (Task 6) is what Task 7 passes; `TAB_ORDER`, `MORE_VIEWS`, `TAB_ICONS`, `MORE_ICONS`, `TabSlot` (Task 7) match their tests; `useToastActions`/`ToastActions` (Task 9) match Tasks 9 and 13; `RestGameSheetProps.clock` (Task 12) is what the panel passes; `SetRowProps.mode`/`onActivate`/`showEffort` (Task 14) are what `ExerciseCard` passes; `.is-primary` (Task 2) is what Tasks 14, 15 and 17 select; `contrastFailures`/`smallText`/`smallFields` (Task 17) are what Task 18 imports.
