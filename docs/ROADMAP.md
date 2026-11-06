# ROADMAP

Owner rulings from the restart audit and review pages (2026-10-17/18; verbatim answers in `docs/private/owner-feedback/restart-2026-10-18.md`). Every item was checked against code on 2026-10-17. Order = priority. Design before building anything marked (design).

## 0. First
- N1 IN PROGRESS (since 2026-10-21): owner uses the app on his phone; triage each report here. Rounds so far: 2026-11-04 (AAA rebuild, P0-P8), 2026-11-05 (section 1b).
- N8 OPEN (owner): real-device checks: iPhone notch/home-bar insets; burn + lit words on iOS; praise-word burn while the reps field keeps focus; Android Back in the installed app (Replace, More, rest-game sheets); form-video playback; Replace sheet, drink row and session numeral at real size. Checklist `docs/runbooks/phone-check.md`.

## 1b. Phone report 2026-11-05 (verbatim in `docs/private/owner-feedback/phone-week-2026-11-04.md`)
- P1 DONE (e0cb296): session counter was 12-16 px in five places (header ticker, Today marquee, Today line, Train eyebrow); now one numeral per screen at `--burn-word-size` beside the heading; marquees text only; Today strip text was invisible (ink on black), now `--panel-text`.
- P2 DONE (01abd70, 0afda2d, 1db89c5): drinks are a reminder, not a log (owner): `DrinkReminder` acknowledge-only (memory, no fluid record), 20 min cadence, fixed row below the rest game and under the docked rest bar; Today Fluid card and the 18:00 shortfall cue removed; stored hydration records kept.
- P3 DONE (0afda2d): rest-game sheet covers the tab bar (Rest Word's third key row was under it, untappable); sheet cap +52 px. Trade-off: Safari tab (390x664) the open sheet covers the next set's Log button; at 844 tall it clears it by 108-126 px.
- P4 DONE (0afda2d): Targets energy/protein totals on their own line (no wrap at 320).
- P5 OPEN: Rest Word scrolls 15 px inside the sheet at 320/360 x 664 (needs a shorter legend or cap ruling).
- P6 OPEN: rest-over bar skip button clips at 320 px.
- P7 OPEN: no tests for the inert tab bar, the drink row, `nextSessionCheckAt`; the contrast sweep skips text inside `aria-hidden` marquee tracks (it missed P1's invisible strip).
- P9 DONE (b708311, owner chose "Estimated date"): recomposition shows "Estimated date: <date> (about N weeks)" + Use This Date, one dashed-outline day, no band colours; `recompositionEstimateWeeks` (`src/domain/nutrition.ts`) from the printed means of Vargas-Molina 2026 (DOI 10.1007/s00421-026-06209-6; fat -2.94 kg, lean +1.04 kg, 10 wk, 80.3 kg; evidence `docs/private/evidence/recomposition-rate-2026-11-06.md` R6): 80 kg 25 -> 20 % = 15.68 wk. Needs current + target body-fat %. Earlier history:
- P9 history (owner 2026-11-06, goal "Lose fat + Gain muscle"): cause = recomposition has no sourced rate, so `targetDateFeasibility` bands no day (`mass-held`); fat-loss goals reproduced fine on the live site (Chromium + WebKit, kg + lb). DONE (453f536): "Earliest realistic date" line + Use This Date (`earliestRealisticDays`, derived from `FAT_LOSS_RATE_BOUND.hiFraction`), calendar opens on that month, gap reason shown up front with the legend hidden; e2e `e2e/p9-goal-feasibility.spec.ts`. OPEN: recomposition bands, only if `docs/private/evidence/recomposition-rate-2026-11-06.md` finds a source; Settings target date (`ProfileEditor.tsx:192`) has no band check.
- P8 OPEN (evidence): ACSM 2009 full text may add "on two consecutive training sessions" to the 2-10 % load rule; `progression.ts` raises after one. Unverified; unchanged.

## 1. Broken now
- B1-B6 fixed 2026-10-18 (`git log --grep '^fix(B'`). Follow-ups from B1:
  - B1a DONE (a2e9e11, audit D03): weeks graded against pro-rated `expectedSessions`.
  - B1b DONE 2026-10-18: Today offers Start Next Programme (`src/ui/components/RestartProgramme.tsx`).
  - B1c DONE (7f401ea): the export summary lists only reviews inside the programme (`isInProgramme`).
  - B1d DONE 2026-10-18: re-plan drops reviews of weeks the new programme grades; popup ignores weeks before the current programme (`src/domain/schedule/weekly.ts` `isBeforeProgramme`).

## 2. Training loop (want, all)
- L1 DONE 2026-10-18 (`docs/design/session-editing.md`). Was: Edit a logged set (today: delete within 6 s undo, relog). `src/ui/views/train/SetRow.tsx`, store has no updateSet.
- L2 DONE 2026-10-18 (`docs/design/session-editing.md`). Was: Swap an exercise mid-session (no store action, no UI).
- L3 DONE 2026-10-18 (`docs/design/session-editing.md`). Was: Skip / remove / reorder exercises in a session.
- L4 DONE 2026-10-18 (`docs/design/session-editing.md`). Was: Add a library exercise mid-session. Today only free-text custom (`src/ui/views/train/AddCustomExercise.tsx`), `muscleGroups: []`, counts for no volume, no removal.
- L1-L4 follow-ups: swap A→B, log on B, swap to C labels B's sets "(bonus)" (data intact); `addBonusExercise` + `session.bonusExerciseIds` only read for sessions opened by older builds (remove later); not checked on a phone. DONE (3d50357): `anyAppState` generates `edits`.
- R1-R3, R5, R6 (review 2026-10-18) DONE: goal-reached needs the target on the goal side of the setup baseline; editing reps keeps the stored load exactly; Add picker and store agree; custom-exercise retry is idempotent; null-load sets editable.
- R4 DONE (3d50357, lead ruling 2026-11-05): swap-day sets at a slot whose range differs from the substitute's own slot stay in history and records but are left out of its progression (`progressionHistory`, `src/domain/training/progression.ts`); no own slot = unchanged.
- R7 DONE (ec0e93d confirm panel, audit D12; 7d85705 plan pruning, D14).
- L5 DONE 2026-10-18 (`docs/design/programme-lifecycle.md`): Settings "Programme" group (equipment, sessions/week, conditioning) + Update Programme; `restartProgramme` in `src/store/programme.ts`. Gap closed (89c4fed, audit D05): Settings Training Days editor.
- L6 DONE 2026-11-05 (branch p7-engine): open-ended programme engine, no length input. Each next cycle is derived from the logged one (adopted swaps, replaced consistent skips, template volume band, low adherence keeps the exercises); runway >= the reminder/.ics windows; wizard `programme` step removed; "of N" displays gone. `docs/design/programme-engine.md`, `src/domain/plan/engine.ts`. Open: owner wording (`advice.programmeContinues`, limelight `status.sessionCursor`), owner tuning (`LOW_ADHERENCE_FRACTION`, `CONSISTENT_SKIP_MIN`).
- L7 DONE 2026-10-18: Start Next Programme defaults to maintenance when the latest weigh-in has reached the stored target (fat loss: at/below; gain: at/above). `src/domain/plan/lifecycle.ts`.
- L8 DONE 2026-10-18: one tap per set (Easy 7 / Solid 8 / Hard 9 / Max 10, `src/domain/training/effort.ts`); a top-of-range set marked Max holds the load (ACSM 2009 + Zourdos 2016, `src/domain/training/progression.ts` `showsRepetitionInReserve`). Not yet shown in LogView, export summary or last-session line.
- L9 PARTIAL: videos play (8b6a500, 81f7d65; `videoId` on every library exercise). Open: library entries with `formCueId: null` need sourced cue text (owner/content).
- L10 DONE (1964815): dated body-fat re-measure in the Settings profile editor.
- L11 DONE 2026-11-05 (owner item 11; merge 9456106): one-tap Replace in the card header (`docs/design/session-editing.md`); swap adopted only after 2 consecutive sessions (`CONSISTENT_SWAP_MIN`); accessory A/B rotation per 4-week cycle, primaries fixed, Settings switch (`docs/design/programme-engine.md`, evidence `docs/private/evidence/exercise-variation-2026-11-05.md`). Open: muscle ids shown raw in the sheet ("front-delt"); adopted alternate re-alternates next cycle.

## 3. Loose ends (want)
- N3 DONE 2026-10-18: app icon = frame 0 of the owner's sprite (`public/icons/`), apple-touch-icon-180 added.
- N5 DONE 2026-10-18: old-console import removed (~4,000 lines). A device still holding `fti.console.v2` is ignored, never deleted. `ui.legacyMigration` stays in the v3 schema, unused.
- N4 DONE (71e42e1): `AppState.notes` removed; old documents and exports load with it stripped (`src/store/db/retiredFields.test.ts`).

- N7 Skin-removal leftovers (2026-10-18), owner wording first:
  - `advice.settingsInstruction` (`src/content/copy.ts`) still lists "skin" among Settings items. Owner's words: ask.
  - `hero.skin` "the look and the noise" now heads only sound + shortcut switches (`src/ui/settings/InteractionSettings.tsx`). Owner's words: ask.
  - Sound and shortcut switches no longer reachable during setup (lived in the removed "Choose Skin" disclosure). Needs owner copy for a new label.
  - DONE: theme-color/manifest now `#8ace00`. `UiPrefs.accent` retired (71e42e1), stripped on read.
  - DONE: unused fonts and their globIgnores removed. Sfx per-skin paths kept on purpose (one skin, door left open).
  - DONE (38ee5f7): `src/content/limelightParity.test.ts` fails on any `copy(key)` call without an overlay (TypeScript AST scan); the export summary now resolves through the skin.

## 3b. Art and style (2026-10-18, done unless listed)
- DONE: approved art wired (body-fat torsos, slider icons, tape diagrams, Atlas glyphs, app icon from owner sprite, badge); all 10 survey items (`docs/design/stylize-survey-2026-10-18.md`); contrast sweep test `src/ui/styles/limeContrast.test.ts`. Review pages: art https://claude.ai/code/artifact/892f9e79-641c-4408-9540-d7810eacda2c, screenshots https://claude.ai/code/artifact/f57b6407-07a7-4d17-b8cb-1296a6b94d61.
- S1 `.wiz-modal-hrt` pink on white 2.71:1: owner's own request (r2.12 iv), needs his ruling.
- S2 DONE (37c341d, bb611b5).
- S3 DONE (84b3bfd, 37c341d; audit A10).
- S4 DONE (85ef90e): fixture sessions on the Mon/Wed/Fri slots. Open: Log grid shows an unopened past slot day as "not planned", not "missed": owner call.
- S5 DONE (8463a1e): body-fat art lazy. Precache size not re-measured since.
- S7 2026-10-18 later: her sprite sheets replace the pink blob (Today, week stamp); Train/Log decluttered; warm-up notice once per profile; per-card Atlas icons (37, lazy, precache now ~1.19 MB). Atlas shows no category since the glyphs left (needs owner wording for a text label); glyph-*.svg kept unused.
- S6 Specimen toast could show the card icon (`CardIcon`, `src/ui/views/atlasArt.tsx`). Category glyphs `src/assets/art/glyph-*.svg` are unused (kept). `INTRO_FIGURE` in `src/content/introSlides.ts` is now unrendered: owner decides whether to delete it.

## 4. Fun (want, all)
- F1 DONE 2026-10-18, extended P6 2026-11-04: five rest games (Rest Word on QWERTY, Plate Math, Reaction, Sequence Recall, Gym Anagram) in a bottom sheet over Train with a per-rest picker; the next set stays loggable (audit C14). Design and constraints `docs/design/rest-games.md`. Chime obeys `ui.sounds` (68fd8ec, audit C11); views stay mounted, so leaving Train keeps the round (a reload still re-offers it).
- F2 Limelight voice: the vulgar register the owner asked for; never written (agent chose camp only). Owner's words, his call on lines.
- F3 Sound effects: player exists (`src/skins/sfx.ts`), zero files in `public/sfx/`. Make them locally with the owner's MIDI/FluidSynth/equation-instrument pipeline (`orchestrate` skill). Formats AAC `.m4a`/MP3.
- F4 Motivation clip after a missed week: modal built, no clip (`public/media/` empty). Owner picks or films one.
- F5 (design) Music in-app through YouTube mirror servers (owner's pick, NewPipe-like). Known costs: widens CSP `media-src`/`connect-src` (`build/cspPlugin.ts`, gated by `scripts/check-dist-csp.sh`); mirrors die and get blocked, so the session must never hang on a dead stream; the existing Invidious list for form videos (`src/config/videoInstances.ts`) shares the problem.
- F6 Atlas filters; more "her" poses or animations (sheets in `src/assets/sprite/`, component `src/ui/components/SpriteSheet.tsx`): low priority.

## 5. Later
- N2 Deploy the reminder Worker (`docs/runbooks/reminders.md`). Decided not to ship for now (owner, 2026-11-05). Was needed only for alarms with the screen locked or session reminders.
- N6 DONE 2026-10-18: `public/icons/notification-badge-96.png` (owner sprite outline), `src/sw.ts` badge points at it.
- A1 DONE 2026-10-18 (see 3b). New art: generate per `docs/design/asset-spec-2026-10-18.md`, owner reviews on an artifact page before wiring, register in the CSV.
- Wording edits without an editor app: idea is one plain file of all app strings the owner edits directly or via chat (copy tables today: `src/content/copy.ts` + `src/content/copy.limelight.ts`).
- Copy contract R1-R14 (`docs/design/2026-09-01-copy-contract.md`, `src/content/copyContract.ts`): keep/cut decision deferred.

## Dropped (stays dropped unless the owner says)
- Pre-training health questionnaire (owner: "Remove it completely"). Residue: `Profile.readiness` schema field.
- Micro-plates; five activity levels (nine-stop slider instead); Protocols tab; gym-walk minutes as energy; HRT threshold bullets (no evidence); cartoon intro character and Kirby-style sprite (copyright); clinical and board skins (2026-10-18); both design tools (2026-10-18).
