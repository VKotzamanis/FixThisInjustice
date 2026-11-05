# Rest games (ROADMAP F1, P6)

Agent doc. Small games for the rest between sets: Rest Word, Plate Math, Reaction, Sequence Recall, Gym Anagram. Genres, not copies: no name, art, sound or layout from a commercial title. Plan and arithmetic: `docs/plans/2026-11-04-p6-games.md` (decisions D1-D7).

## How a game plugs into the rest timer
- Identity rides on the timer: `RestTimer.game?: RestGameContext` (`src/domain/training/restTimer.ts`). `startRest(durationS, now, game?)` attaches it; `endsAt` depends on `durationS` only. Absent on old timers: no game offered.
- Set by the one rest starter, `ExerciseCard.handleLog` (`src/ui/views/train/ExerciseCard.tsx`).
- `RestTimerPanel` is the ONLY reader of the timer, the wins count and the profile units; it passes them to `RestGameSheet` as props (contract with P1, which moves where the timer lives). Phase per interval keyed by `startedAt`: `ready` -> `open` -> `closed`.
- Offer: `[Play a Game]` in the rest controls while `ready` and the round clock fits the rest left; disabled with `status.restWordTooLate` otherwise.
- Host: `RestGameSheet`, a non-modal bottom sheet fixed over Train (`role="dialog"`, `aria-modal="false"`). Height at most `100svh - 12rem` (472 px at 390 x 664); `body.rest-sheet-open` pads the page so every set row can scroll above it. `Hide Game` collapses it to a 60 px bar, `Show Game` restores the same round. Back (one history entry, `useSheetDismiss.ts`) and Escape close it. P4's overlay stack replaces `useSheetDismiss`.
- Picker: `RestGamePicker`. First option = the last pick in this lifting session (`restGameChoice.ts`, module memory, never stored) else `seededFamily(context)`. One pick = one round; `Not Now` leaves the offer standing.
- End: the sheet unmounts when the rest ends, is skipped or is replaced by the next set's rest.
- Round clock: `restRoundClockS(restS)` (`src/domain/fun/restGames.ts`): 45/60/90 s for rests <= 90 / <= 120 / longer, shared by every family. Game deadline = min(round clock, current `timer.endsAt`) (`useRoundClock.ts`).

## Constraints and where each is held
1. Never stretches or pauses the rest: no game code writes the timer. Tests: `restTimer.test.ts` "carries a rest-game identity without moving either instant"; `RestTimerPanel.test.tsx` "offers one optional round ... never writes the timer", "keeps counting the rest down ...", "closes the game when the rest ends ..."; `TrainView.test.tsx` "logs the next set with the game sheet open ..."; `restGameGuarantees.test.tsx` (timer unchanged per family; no timer writer in any source).
2. Interruptible: Exit always enabled (`RestGameFrame.tsx`); Back, Escape, Not Now; hardware keys only from the body or inside the sheet (`RestWordGame.tsx` `keyIsForGame`), none while hidden. Tests: `RestGameFrame.test.tsx`, `RestGameSheet.test.tsx`, `RestWordGame.test.tsx`.
3. Offline: DOM/CSS boards, synthesised cues, word banks in source (Rest Word < 1 KiB, Gym Anagram < 2 KiB). Tests: `restGameGuarantees.test.tsx` (source scan of every game file; no request, no media per family), `restGameAudio.test.ts`.
4. No stored score beyond the session: wins only through `recordRestGameWin` in `RestTimerPanel`; `fti.v3` untouched; the last pick is module memory. Tests: `trainingActions.test.ts`, `restGameGuarantees.test.tsx` (no store import, no web storage in any game source).
5. Sound only with `ui.sounds`: `playRestGameCue(cue, soundsOn)`; reduced motion stops every rest-game animation; no transitions. Tests: `restGameGuarantees.test.tsx` (silent off, cue on, per family), `restGameStyles.test.ts`.
6. Copy: keys with `restWord` or `restGame` in the name, base table only, Title Case names, parity fixture rows; retired keys in `REMOVED_KEYS`. Value frames in `src/content/restGameFormat.ts`. Tests: `restGameCopy.test.ts`, `limelightParity.test.ts`, `copy.test.ts`.
7. Phone: every control >= 44 px tall; Rest Word keys QWERTY on 20 half-columns, >= 24 px wide at 320 px (WCAG 2.2 SC 2.5.8, AA); colour never alone (tile shapes, struck letters, worded pad states). Colours through tokens only; all rest-game CSS in `src/ui/styles/restGames.css`. Tests: `restGameStyles.test.ts`, `limeContrast.test.ts`. Measured in Chromium: see "Measured".

## Adding a game family
- Engine: `src/domain/fun/<game>.ts`, seeded by `restGameRng('<family>', context, difficulty)`, difficulty from `restGameDifficulty`, round clock `restRoundClockS`; its worst case fits that clock (test it).
- Register: add the family to `REST_GAME_FAMILIES` (`restGames.ts`) and `REST_GAME_CATALOG` (`restGameCatalog.ts`); add its sources to `SOURCES` in `restGameGuarantees.test.tsx`.
- Component: `RestGameProps` only (`restGameProps.ts`), drawn in `RestGameFrame`, units from `useRestGameHost()`; never import the store.
- Copy: keys with `restGame` in the name, base table, fixture rows; frames with values in `restGameFormat.ts`.
- CSS: a `/* ===== <name> ===== */` section in `restGames.css`; add the name to the section list in `restGameStyles.test.ts`.

## Measured
- `e2e/p6-rest-sheet.spec.ts` (Playwright, Chromium, 320/360/390/412 x 664): key width >= 24 px, key height >= 44 px, no sideways scroll; at 390 x 664 the sheet <= 472 px with no inner scroll and the next set's row and Log button above it. Numbers in `docs/STATUS.md`.

## Not done
- Round state is per mount: leaving Train mid-rest and coming back offers the rest's round again (the offer phase lives in the panel).
- Sequence Recall shows its sequence visually; the status line names each lit pad, but rapid announcements may be dropped by a screen reader.
- Gym Anagram accepts only the listed word; an alternative anagram the user finds is refused (words with a known second anagram were left out of the bank).
- Real iOS Safari and Android hardware not tested by an agent.
