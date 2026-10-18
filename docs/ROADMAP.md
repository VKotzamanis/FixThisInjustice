# ROADMAP

Owner rulings from the restart audit (2026-10-17/18; verbatim answers in `docs/private/owner-feedback/restart-2026-10-18.md`). Every item was checked against code on 2026-10-17. Order = priority. Design before building anything marked (design).

## 0. First
- N1 Owner uses the app at the gym on his phone; collect findings per `docs/runbooks/phone-check.md`. No screen has ever been checked on a device.

## 1. Broken now
- B1-B6 fixed 2026-10-18 (`git log --grep '^fix(B'`). Follow-ups from B1:
  - B1a A completion week that ends mid-week is graded against the full weekly target, so finishing on the first slot day reads as a miss and opens the popup. Owner: pro-rate or exempt?
  - B1b After completion the last review (WeekStamp or Intervention) stays on Today until a new plan starts (`src/ui/views/TodayView.tsx`). Resolves with L5/L7.
  - B1c `src/domain/export/summary.ts:89` still lists stored post-completion reviews.
  - B1d `setPlan` keeps old reviews (`src/store/index.ts:650`); a leftover review blocks re-grading that week under a new plan. Matters once L5 regenerates plans.

## 2. Training loop (want, all)
- L1 DONE 2026-10-18 (`docs/design/session-editing.md`). Was: Edit a logged set (today: delete within 6 s undo, relog). `src/ui/views/train/SetRow.tsx`, store has no updateSet.
- L2 DONE 2026-10-18 (`docs/design/session-editing.md`). Was: Swap an exercise mid-session (no store action, no UI).
- L3 DONE 2026-10-18 (`docs/design/session-editing.md`). Was: Skip / remove / reorder exercises in a session.
- L4 DONE 2026-10-18 (`docs/design/session-editing.md`). Was: Add a library exercise mid-session. Today only free-text custom (`src/ui/views/train/AddCustomExercise.tsx`), `muscleGroups: []`, counts for no volume, no removal.
- L1-L4 follow-ups: swap A→B, log on B, swap to C labels B's sets "(bonus)" (data intact); `addBonusExercise` + `session.bonusExerciseIds` only read for sessions opened by older builds (remove later); `anyAppState` (`src/domain/arbitraries.ts`) never generates `edits`; not checked on a phone.
- L5 Programme follows Settings: changing equipment, days, goal or experience regenerates/updates the plan. Today `generatePlan` has one caller, the wizard (`src/ui/setup/SetupWizard.tsx`), reachable only via Wipe All.
- L6 (design) Open-ended programme, no length input. Owner ask: build the next block from what was logged ("one training ends -> create the next one based on the data logged"). Prior design `docs/design/programme-horizon.md` (copy cycle 1 forward) does NOT meet that ask; `docs/design/jit-scheduler-brief.md` is closer. Remove the wizard `programme` step; wizard tests navigate by counting `next()` presses.
- L7 (design) After the goal: switch to maintenance. Keep the gym habit, stop weight loss (energy target to maintenance).
- L8 RPE, one tap per set (e.g. Easy / Solid / Hard / Max), and progression uses it. Anchor: Zourdos 2016, RPE 10 = 0 reps in reserve, 9 = 1 (`docs/private/evidence/content-peer-review.md` line ~399). Schema field exists (`src/domain/schema.ts`, `rpe`), nothing writes it (`src/ui/views/train/ExerciseCard.tsx` `rpe: null`).
- L9 Form videos that play. All 40 `videoQuery` in `src/domain/plan/library.ts` are search text, none an 11-char id, so the embed never runs. 9 of 40 exercises lack form cues.
- L10 Re-measure body fat after setup (only writer of `baselineBodyFatPct` is the wizard).

## 3. Loose ends (want)
- N3 Home Screen icon still the previous app's W.CONSOLE logo (`public/icons/`). Owner supplies art.
- N5 Remove the old-console import (`src/domain/migrations/v2.ts`, `src/ui/migration/`, ~3,900 lines incl. tests) once the owner confirms he no longer needs it. Drop.
- N4 Daily notes: stored (`AppState.notes`), no UI. Drop: remove field with a coercion so old documents load (rule 7).

- N7 Skin-removal leftovers (2026-10-18), owner wording first:
  - `advice.settingsInstruction` (`src/content/copy.ts`) still lists "skin" among Settings items. Owner's words: ask.
  - `hero.skin` "the look and the noise" now heads only sound + shortcut switches (`src/ui/settings/InteractionSettings.tsx`). Owner's words: ask.
  - Sound and shortcut switches no longer reachable during setup (lived in the removed "Choose Skin" disclosure). Needs owner copy for a new label.
  - Accent `#a3e635` in `index.html` theme-color, the manifest and `UiPrefs.accent` matches no token.
  - Dead: sfx skin-switch logic (`src/skins/sfx.ts`), geist/jetbrains entries in `vite.config.ts` globIgnores, 4 unused font packages in `package.json` (@fontsource-variable/geist, @fontsource-variable/jetbrains-mono, @fontsource/dm-mono, @fontsource/space-mono).
  - Nothing stops a new call site from calling `copy()` without the limelight overlay; `src/content/limelightParity.test.ts` covers the existing render path only.

## 4. Fun (want, all)
- F1 (design) Rest games. Word game parked on branch `wip/rest-word-game` (red: tsc `src/store/sessionMirror.ts:170`). More small games later. Constraint: a game must never stretch the prescribed rest (`src/domain/training/restTimer.ts`), must be interruptible, offline, no stored score unless schema change.
- F2 Limelight voice: the vulgar register the owner asked for; never written (agent chose camp only). Owner's words, his call on lines.
- F3 Sound effects: player exists (`src/skins/sfx.ts`), zero files in `public/sfx/`. Make them locally with the owner's MIDI/FluidSynth/equation-instrument pipeline (`orchestrate` skill). Formats AAC `.m4a`/MP3.
- F4 Motivation clip after a missed week: modal built, no clip (`public/media/` empty). Owner picks or films one.
- F5 (design) Music in-app through YouTube mirror servers (owner's pick, NewPipe-like). Known costs: widens CSP `media-src`/`connect-src` (`build/cspPlugin.ts`, gated by `scripts/check-dist-csp.sh`); mirrors die and get blocked, so the session must never hang on a dead stream; the existing Invidious list for form videos (`src/config/videoInstances.ts`) shares the problem.
- F6 Two unused mascot poses (resting, flop), Atlas filters, fuller board-style extras: low priority.

## 5. Later
- N2 Deploy the reminder Worker (`docs/runbooks/reminders.md`). Needed only for alarms with the screen locked or session reminders.
- N6 Monochrome Android notification badge (`src/sw.ts` badge is the colour icon).
- A1 Owner's art: 24 setup icons, 8 Atlas glyphs, app icon, sprite, tape diagrams, body-fat silhouettes. `docs/design/2026-09-06-asset-manifest.md`, `docs/design/2026-09-06-asset-prompts.md`, register CSV.
- Wording edits without an editor app: idea is one plain file of all app strings the owner edits directly or via chat (copy tables today: `src/content/copy.ts` + `src/content/copy.limelight.ts`).
- Copy contract R1-R14 (`docs/design/2026-09-01-copy-contract.md`, `src/content/copyContract.ts`): keep/cut decision deferred.

## Dropped (stays dropped unless the owner says)
- Pre-training health questionnaire (owner: "Remove it completely"). Residue: `Profile.readiness` schema field.
- Micro-plates; five activity levels (nine-stop slider instead); Protocols tab; gym-walk minutes as energy; HRT threshold bullets (no evidence); cartoon intro character and Kirby-style sprite (copyright); clinical and board skins (2026-10-18); both design tools (2026-10-18).
