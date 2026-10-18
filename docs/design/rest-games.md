# Rest games (ROADMAP F1)

Agent doc. Small games for the rest between sets. First family: Rest Word (Wordle-style), ported from `wip/rest-word-game` (3868dfd).

## How a game plugs into the rest timer
- Identity rides on the timer: `RestTimer.game?: RestGameContext` (`src/domain/training/restTimer.ts:80`, `:88`). `startRest(durationS, now, game?)` (`:101`) attaches it; `endsAt` depends on `durationS` only. Absent on old timers: no game offered.
- Set by the one rest starter, `ExerciseCard.handleLog` (`src/ui/views/train/ExerciseCard.tsx:183`): exercise, session, date, set number, day ordinal (counted after `logSet`).
- Host: `RestTimerPanel` (`src/ui/views/train/RestTimerPanel.tsx`). Phase per interval, keyed by `startedAt` (`:84`): `ready` -> `open` -> `closed`. A new rest (next set) has a new `startedAt`, so it reads `ready` again; an extension keeps `startedAt`.
- Offer: `[Play Word Game]` in the rest controls while `ready` and the rest runs (`:170`); disabled with `status.restWordTooLate` once the round no longer fits (`:171`).
- End: board hidden when `remainingS <= 0` (`:257`), made final by an effect (`:92`), so +30 s after the end revives nothing. Skip Rest (timer null) unmounts the panel. Next set: new interval.
- Round: `restWordRound(context, durationS, wins)` (`src/domain/fun/restWord.ts:58`); round clock 45/60/90 s for rests <= 90 / <= 120 / longer (`:37`). Game deadline = min(round clock, current `timer.endsAt`) (`src/ui/views/train/RestWordGame.tsx:86`).

## Constraints and where each is held
1. Never stretches or pauses the rest: no game code writes the timer; `startRest` same instants with or without `game`. Tests: `restTimer.test.ts` "carries a rest-game identity without moving either instant"; `RestTimerPanel.test.tsx` "offers one optional round ... never writes the timer", "keeps counting the rest down while the game is open", "closes the game when the rest ends ..."; `TrainView.test.tsx` "logs the next set with the game open ..." (`durationS` unchanged).
2. Interruptible: `[Exit Game]` always enabled (`RestWordGame.tsx:250`). Hardware keys only when focus is on the body or inside the board (`:58`), so Enter on Log Set / a set field is never taken. Tests: "lets the user leave immediately ...", "leaves Enter on a control outside the game alone ...", TrainView "logs the next set with the game open ...", panel "closes with the rest when the rest is skipped".
3. Offline: DOM/CSS board, synthesised cues (Web Audio oscillators), word bank in source (< 1 KiB). Tests: `RestWordGame.test.tsx` "makes no request and loads no media ...", "names no network API ... in any game source"; `restGameAudio.test.ts` "... fetches nothing".
4. No stored score beyond the session: `restGameWins` lives in the session slice + sessionStorage mirror (`src/store/sessionMirror.ts:38`, `:114`, default 0 for an older mirror), `recordRestGameWin` (`src/store/index.ts:930`), reset by `clearSessionSlice`. `fti.v3` schema untouched. Tests: `trainingActions.test.ts` "keeps rest-game wins in the session mirror and out of the main document"; `sessionMirror.test.ts` pre-game mirror, round trip, bad game date refused.
5. Sound only with `ui.sounds`: `playRestGameCue(cue, soundsOn)` returns before touching the context (`src/ui/audio/restGameAudio.ts:52`); Play tap unlocks audio only with sounds on (`RestTimerPanel.tsx:247`). Reduced motion: every rest-game animation `none` (`src/ui/styles/train.css:755`). Tests: audio "stays silent with sounds off ..."; panel "makes no game sound with ui.sounds off", "plays the game cue with ui.sounds on"; `restGameStyles.test.ts` "stops every rest-game animation ...".
6. Copy: keys containing `restWord`, base table only, parity fixture extended. Tests: `src/content/restGameCopy.test.ts` (R14 Title Case, R1, R6, no limelight row), `limelightParity.test.ts`. Colours: tokens only (inverted panel; ratios in the `train.css` block comment). Test: `restGameStyles.test.ts` "colours only through tokens ...".
7. Phone: keys 44 x 44 px (`train.css:632`), 6 fixed columns (`:627`), 5 under 360 px; alphabetical, not QWERTY (10 columns of 44 px need 458 px; a 412 px phone leaves 332). Measured in headless Chromium at 320/360/390/412 px: no horizontal overflow, min key 44.0 px. No `:hover` rule. Tests: `restGameStyles.test.ts` (44 px, 6 columns, no hover).

## Adding a second game family
- Engine: pure module in `src/domain/fun/<game>.ts` taking `RestGameContext` + rest `durationS`; its round must fit the shortest rest that offers it.
- Choice: derive the family from the context (e.g. `restGameSeed` of the context, `src/domain/fun/restWord.ts`) in `RestTimerPanel` where `restWordRound` is called; keep one round per interval.
- Component: same props as `RestWordGame` (`timer`, `priorWins`, `soundsEnabled`, `t`, `overrides`, `onExit`, `onWin`); never import the store's timer actions.
- Copy: new keys in the base table, Title Case names, parity fixture rows, `restGameCopy.test.ts` stem filter widened.
- CSS: rules under `.rest-game`; extend `restGameStyles.test.ts` selector filter.

## Not done
- Board state is per mount: leaving Train mid-rest and coming back offers the same round again.
- Tile results are not announced to screen readers (letters only; result line is live).
- Mascot ASCII rows are uneven width (`PixelMascot.tsx`, kept from the WIP); owner's art call.
