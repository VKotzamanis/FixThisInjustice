# Round 3: the onboarding revision

> **For agentic workers:** the code contract for each task is in this file. Steps use `- [ ]`.
> Read `docs/plans/subagent-briefs/00-CONTEXT.md` before implementing any of it.

**Goal:** the owner's round-3 onboarding feedback, dissected into 21 discrete changes across nine
of his numbered points, plus four questions he asked and the answers found in the tree.

**Architecture:** all of it lands in the setup wizard and its content modules. Three items change
stored shape (`equipmentSteps`, `weeks`, `weighInOptIn`) and are called out as such. Nothing here
touches the plan generator's prescription logic.

**Tech stack:** React 19, TypeScript, Vite, Zustand over one `localStorage` document, vitest.

---

## Global constraints

Every task inherits these. They are the ones that get work rejected.

- **Never invent a citation, a DOI, a dose or a coefficient.** Nothing in round 3 needs a new one.
- **R14:** labels, headings and control names are Title Case; a heading is a noun phrase. This is
  now enforced in CI at 0 of 240, so a new key that fails it turns the build red.
- **R5** no em dash. **R6** no emoji, U+2600 to U+27BF included. **R11** name the quantity.
- **Every colour is a token** in `src/ui/styles/tokens.css`. A hex literal in a component
  stylesheet is a bug. Never `--accent` for text on limelight: 1.41:1, fuchsia on lime.
- **The catalogue trap:** any copy key added, edited or deleted needs the four commands, a part in
  `alpha-parts.mjs` and exactly one step in `alpha-walk.mjs`. A key may be claimed by ONE part.
- **The wizard is EIGHT steps** after round 2: units, timezone, body, training, goal, programme,
  guidance, review. Test fixtures navigate by counting `next()` presses; changing the step count
  breaks seven separate navigation routes across `SetupWizard.test.tsx` and `App.test.tsx`.

---

## His four questions, answered from the tree

Recorded here because the answers shaped the tasks below, and because two of them are findings in
their own right.

### Q(ii). What do "the noise" and "the shortcuts" do, and do they work?

**Sounds: the toggle currently does nothing audible.** `ui.sounds` is real, `src/skins/sfx.ts`
gates every sound on it, and `public/sfx/` contains **zero files**. So the switch works and there
is nothing for it to play. The `sfx.ts` comment is accurate — "the only thing that silences a skin"
— it just has nothing to silence yet.

**Hotkeys: real, and useless on a phone.** `src/ui/hotkeys.tsx` binds the digit keys to the nav
tabs (`App.tsx:212` sets `aria-keyshortcuts` from `ui.hotkeys`). The only explanation on screen is
`advice.hotkeysOff`: "Off leaves Escape and the modifier shortcuts bound." So OFF still keeps
Escape and the modifier combinations; ON adds bare single-digit switching. On a touch device
neither state changes anything the owner can reach.

**Consequence:** two switches on the screen he tests on, one of which does nothing at all and one
of which does nothing on that device. Task 2 addresses the labelling; whether the sounds toggle
should ship before the audio does is his call and is NOT assumed here.

### Q(iii). Why did "houston" find nothing, and what is the search box for?

**It searched exactly what it was built to search, and that is the defect.**
`zoneGroupMatches` (`src/domain/dates.ts:514`) matches the query against the group's offset label
and its **IANA zone ids** only. Verified: no IANA identifier contains "houston" — Houston keeps
`America/Chicago`. The same holds for Manchester, Munich, Osaka and most cities on earth: IANA
names roughly 418 representative places, not cities.

**What it was for:** finding your zone when it has been collapsed into a row named after a
different city. Type `berlin` and the `Europe/Paris` row appears and says it matched Berlin. That
works, and it is genuinely useful — it is just not what a person types.

Task 4 fixes it. The shape of the fix is an open question for him, below.

### Q(ix)a. Why is programme length asked at all?

`PlanTemplate.weeks`, bounded 8 to 24, sets the generator's horizon. Two shipped features read it:
`Boot.tsx` prints "week X of Y", and `TimeCapsule.tsx:145` computes the capsule's opening date from
it. So the number is load-bearing, but nothing requires the USER to be its source.

### Q(ix)b. What is a conditioning block, and why is it needed?

`generator.ts:141`: one cardio exercise appended to the **last lifting session of each week** when
`includeCardio` is set. It is not a session of its own — no split template declares one — so the
plan keeps exactly `weeks x sessionsPerWeek` sessions either way.

**The app never explains this anywhere.** The only user-facing string is the label itself,
`label.includeCardio`: "One Conditioning Block per Week". He is being asked to opt into a term the
app never defines. Task 9 fixes that.

---

## Task 1: the visual-settings callout (his i)

**Files:** `src/content/introSlides.ts`, `src/ui/intro/IntroSequence.tsx`, `src/ui/intro/intro.css`,
`src/content/copy.ts`, `scripts/alpha-parts.mjs`, `scripts/alpha-walk.mjs`

On the intro's final slide, `What Setup Collects`, draw an arrow pointing at the top-right control
that opens the skin and preferences panel, labelled **`Change Visual Settings Here`** (R14: Title
Case, and it is a control-adjacent label so Title Case applies).

- [ ] The arrow is CSS or inline SVG, not an image asset and not a character: R6 rejects U+2600 to
      U+27BF, which is where most arrow glyphs live. `->` in text is not an arrow.
- [ ] It must point at the real control's position, which is the top right of the app shell, so it
      is positioned relative to the shell and not to the slide's text block.
- [ ] It branches on `prefers-reduced-motion` if it moves at all. A static arrow is fine.
- [ ] It disappears with the intro. It is not a permanent overlay.

## Task 2: label the preferences panel's switches (his ii)

**Files:** `src/content/copy.ts`, `src/ui/components/SkinSettings.tsx`

- [ ] Give the sounds switch a line saying what it will do AND that no sounds ship yet, so the
      switch is not silently inert. Do not invent a shipping date.
- [ ] Give the hotkeys switch a line saying it binds the digit keys to the tabs and does nothing
      on a touch device. `advice.hotkeysOff` already covers the OFF case; the ON case has nothing.
- [ ] Both strings are `advice.` keys: R3 caps them at twelve words. If the sentence does not fit,
      it belongs in an R10 module, not in a longer `advice.` string.

## Task 3: body-fat methods disabled without a stated sex (his iv)

**Files:** `src/ui/setup/SetupWizard.tsx`, `src/ui/setup/setup.css`, `src/content/copy.ts`

`src/domain/bodyfat.ts` takes `sex: StatedSex`, which is `Exclude<Sex, 'nd'>`. With `nd` selected
or nothing selected, the tape method cannot compute — and today the controls still look live,
which is why he read them as unresponsive.

- [ ] Disable the tape-method controls whenever the stated sex is not `male` or `female`.
- [ ] Beside them, in italic, a hint naming what is missing. **The wording is an open question:
      the control is called `Biological Sex`, so a hint reading "(Needs Gender)" points at a
      control that does not exist by that name.** See the open items.
- [ ] Use `aria-disabled` with a refused handler, matching the pattern already at
      `SetupWizard.tsx:2592`, not the bare `disabled` attribute — the existing code chose that
      deliberately so the control stays reachable by a screen reader.
- [ ] The percentage-entry path does NOT need sex and must stay enabled.

## Task 4: the time-zone search (his iii)

**Files:** depends on the ruling. See open items.

## Task 5: stop markers on the sliders (his v, first half)

**Files:** `src/ui/setup/setup.css`, `src/ui/setup/SetupWizard.tsx`

- [ ] Render a tick at each stop of the activity slider: nine ticks, evenly spaced, aligned to the
      thumb positions.
- [ ] Tokens only. The ticks must be visible on all three skins; check limelight specifically,
      where a light mark on lime disappears.
- [ ] They are decoration for a control that already announces its position in a live region, so
      they take `aria-hidden="true"` and add no new announcements.

## Task 6: Gym Comfort becomes image boxes (his v, second half)

**Files:** `src/ui/setup/SetupWizard.tsx`, `src/ui/setup/setup.css`

- [ ] Replace the three-position slider with a three-option picker in the same shape as the sex
      control on the body step. Read that control and follow it rather than inventing a second
      pattern.
- [ ] Each option carries a placeholder frame naming its `docs/design/2026-09-04-icon-register.csv`
      row: `comfort-1-starting`, `comfort-2-machines`, `comfort-3-freeweights`. The artwork is the
      owner's and does not exist. Do not draw one.
- [ ] `Experience` stays the stored type with its three values. This is a control change, not a
      model change.
- [ ] Tap targets 44 px minimum.

## Task 7: equipment access, five stops with three icons (his vi)

**Files:** `src/ui/setup/SetupWizard.tsx`, `src/ui/setup/setup.css`

- [ ] Keep the slider. Give it five markers matching its five positions.
- [ ] Replace the marker at the start, the middle and the end with a placeholder icon frame; the
      two between stay plain markers. Draft boxes, named by their register rows.
- [ ] The existing per-position example sentence stays and still changes with the position.

## Task 8: the load-step fields (his vii)

**Files:** `src/ui/setup/SetupWizard.tsx`, `src/ui/setup/setup.css`, `src/content/copy.ts`,
`src/domain/types.ts`, `src/domain/schema.ts`

Six changes in one paragraph of his:

- [ ] **Show them only when the equipment access is home-gym or above.** Below that there are no
      plates and no dumbbells to step.
- [ ] **Move them after the equipment question**, not before it.
- [ ] **One row, two columns**, not one column of three rows.
- [ ] **A heading above them reading `Load Step`** (R14).
- [ ] **Two fields, labelled `Dumbbell` and `Plates`.** `Plates` is the field currently called
      barbell step; `Dumbbell` is the dumbbell pair step.
- [ ] **Drop the third.** His reason, recorded: machine increments are standardised.
      **`Profile.equipmentSteps.stackKg` is a STORED field.** Ruling: stop collecting it, keep the
      field with its existing default so no document needs migrating and `schemaVersion` stays 3.
      Removing it from the type is a separate change with a migration, and is not worth it for a
      field nothing will write.

## Task 9: the goal page's contents (his viii, and the closing line)

**Files:** `src/ui/setup/SetupWizard.tsx`, `src/content/copy.ts`, `scripts/alpha-*.mjs`

- [ ] **Availability moves to the goal page, as the first thing on it.** This does NOT undo
      C1.10.8: the requirement is that training frequency is known before the target date is
      chosen, and first-on-the-goal-page still satisfies it. It answers the question the round-3
      form asked at `r3.09` — whether step 4 now holds too much.
- [ ] **Creatine moves to the review page**, his closing instruction.
- [ ] **Weigh-in leaves the goal page.** It stays an opt-in, with copy saying that weighing in
      improves the result and that a number that looks bad now is the number he will enjoy watching
      move. **Where it lands is an open question.** See open items.

## Task 10: programme length (his ix)

**Files:** `src/ui/setup/SetupWizard.tsx`, `src/domain/plan/`, `src/content/copy.ts`

- [ ] **Derive the programme length from the target date** and propose it rather than asking.
      `weeks` stays in the model: `Boot.tsx` and `TimeCapsule.tsx:145` both read it.
- [ ] With no target date, fall back to the current default rather than blocking.
- [ ] **Explain the conditioning block** where it is offered. One cardio exercise appended to the
      last lifting session of each week, not a session of its own, so the session count does not
      change. This is long-form and belongs in an R10 module or a `why?` disclosure, not in a
      twelve-word `advice.` string.
- [ ] **Removing the programme step entirely takes the wizard to seven steps** and breaks the same
      seven navigation routes round 2's fold broke. Budget for that; it is not a one-line change.

---

## Open items: his ruling needed before Tasks 3, 4, 9 and 10 are final

1. **The disabled-field hint's wording.** He wrote "(Needs Gender)". The control is
   `Biological Sex`, and `src/content/sexRationale.ts` exists specifically because that distinction
   was argued once already. A hint that names a control the app does not have sends the user
   looking for it.
2. **The time-zone search.** Three shapes, each with a different cost, in the open-items section of
   the reply.
3. **Where the weigh-in opt-in goes** now that it leaves the goal page.
4. **What happens when the programme ends.** He asked "What if you want to reach your goal and then
   maintain?" and nothing in the app answers it today. That is a feature, not a fix, and it is
   larger than the rest of round 3 combined.
