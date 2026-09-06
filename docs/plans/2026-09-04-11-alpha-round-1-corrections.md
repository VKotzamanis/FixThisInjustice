# Alpha Round 1 Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settle every claim in the owner's alpha round-1 feedback on walkthrough pages w0 and w1, implement the contained corrections, and hand the four rebuilds to their own numbered plans.

**Architecture:** The feedback splits three ways by cost. Wording and layout changes are contained by the copy contract and the view files, and land here. Two changes touch stored shape (`Profile.readiness`, setup draft persistence) and need an additive Zod field, not a schema bump. Four items ask for rebuilds that change engine behaviour or invent numbers, and each gets its own plan after the blocking decisions in Part C are answered.

**Tech Stack:** React 19 + TypeScript, Vite, Zustand store over a single `fti.v3` localStorage document, vitest, ESLint with project-specific restriction rules.

## Global Constraints

Every task inherits these. They come from `README.md`, `docs/design/2026-09-01-copy-contract.md` and `eslint.config.js`, and the CI workflows enforce most of them.

- **Copy lives in one place.** A view calls `copy(key)` or `copyFor(skin, key)`, never a string literal. A string carrying a value is a `FORMAT` frame, never assembled at the call site.
- **R1** button <= 3 words. **R2** hero <= 8 words. **R3** advice <= 12 words. **R4** banner <= 2 sentences. All three tables.
- **R5** no em dash (U+2014), no en dash as a connector. **R6** no emoji. All three tables, and `scripts/check-no-emoji.mjs` gates the tree.
- **R8** no exclamation mark, default table. **R9** arithmetic goes behind a `why?` disclosure.
- **R10** long reference text does not live in a copy table. It lives in its own module, as `src/content/formCues.ts` and `src/content/specimenCards.ts` do, and is exempt from R1 to R4 and R9 but not from R5, R6 or R11.
- **R11** name the defined quantity. `body mass`, not `weight`; `load` for kg on a bar; `kcal`, not `calories`.
- **R12** an override carries the unit symbol the default carries, verbatim.
- **No URL in a copy string.** `copy.test.ts` asserts it. A link is a component prop or a build constant.
- **No personal data in tracked source.** No medication, condition, biometric-identifier or location field. Both CI workflows grep for the forbidden identifiers and fail on a hit.
- **`src/store/persistence.ts` is the only module allowed to touch Web Storage.** An ESLint rule fails the build otherwise.
- **Additive state fields carry a Zod default.** `CURRENT_SCHEMA_VERSION` stays 3.
- **Platform floor: iOS 18.4.** `navigator.vibrate` is not implemented in Safari on iOS or iPadOS at any version (`src/ui/audio/chime.ts:168`, verified against caniuse and logged in `REFERENCES.md`). Any haptic cue is Android-only and must never be the sole cue.
- **No coefficient ships without a verified source.** `docs/review/2026-09-01-content-peer-review.md` is the corpus. A value the review marked PARAPHRASE, COULD NOT VERIFY or INSUFFICIENT EVIDENCE does not appear in code.

---

## Part A. The claim ledger

Every claim in the round-1 feedback, with its disposition. `ACCEPT` lands in this plan. `ACCEPT-SUB` lands in a sub-plan named in Part D. `DECIDE` is blocked on a Part C question. `CHALLENGE` is a claim the code contradicts; the reason is in Part B and the claim is not actioned until you rule on it.

### w0 — how to test

| Id | Claim | Disposition |
| --- | --- | --- |
| C0.1 | Page 0 met expectations; content stands | ACCEPT, no change |
| C0.2 | Generate synthetic data covering the states a fresh install cannot reach (missed week, ended block, legacy v2 data, reminder states), so the skippable steps can be reviewed | ACCEPT, Task 1 |

### w1.01 / w1.02 — boot and intro

| Id | Claim | Disposition |
| --- | --- | --- |
| C1.01.1 | Observed: no intro; the app opened straight on Setup step 1 of 9 | CONFIRMED. No intro sequence exists. `Boot.tsx` prints plan status lines only, and on a first run that is two lines lasting 0.18 s |
| C1.01.2 | Add an intro slideshow before setup | ACCEPT, Task 4 |
| C1.01.3 | Opening line naming the author by initial | ACCEPT, Task 4. `send` corrected to `sent` |
| C1.01.4 | Bullets appear in sequence, fading in over 1 to 2 s | ACCEPT, Task 4 |
| C1.01.5 | Text types out one letter at a time | ACCEPT, Task 4, with a `prefers-reduced-motion` branch that prints the slide whole |
| C1.01.6 | Bullet 1, "Who am I" | ACCEPT, Task 4 |
| C1.01.7 | Bullet 2, "Purpose and functions" | PARTIAL. The atlas and the reminder exist. The "demon function that berates you" overstates what ships, and one named feature does not exist at all. See B4 |
| C1.01.8 | Bullet 3, "Motivation", including games during rest periods | ACCEPT. No game exists today; the games are confirmed in scope, so the copy stands and plan 15 must land before the alpha widens beyond you. See B4 |
| C1.01.9 | Bullet 4, solo concept, built with Claude Code, one official repo | ACCEPT, Task 4 |
| C1.01.13 | "Be open-source and free to use" | BLOCKED. There is no licence file; the repo is source-visible, not open-source. See B32 and Q12 |
| C1.01.14 | "150$ per session to get a personal trainer" | CHALLENGE. An unsourced price claim printed to users. See B32 |
| C1.01.15 | "(*insert puke emoji*)" | ACCEPT as literal text; it contains no emoji code point. But it exposes a gate hole. See B32 and B36 |
| C1.01.10 | Each bullet replaces the previous one | ACCEPT, Task 4. Read as: one slide per bullet, advanced by click |
| C1.01.11 | ASCII SpongeBob flexing at the foot of the slide | CHALLENGE. Third-party character IP. See B5 |
| C1.01.12 | Hovering "Click to continue..." | ACCEPT, Task 4 |
| C1.02.1 | Observed: no intro, same as C1.01.1 | CONFIRMED, no separate action |
| C1.02.2 | A flashing tl;dr disclaimer slide | DECIDE, Q6. Flashing text is a WCAG 2.3.1 hazard. See B6 |
| C1.02.7 | "DO NOT be MJT trying to do what looks like a pull-up" | DECIDE, Q13. Names an identifiable person as the butt of a joke in a public app under your name |
| C1.02.3 | It clears on click | ACCEPT, Task 4 |
| C1.02.4 | A final slide naming the three things setup collects | ACCEPT, Task 4 |
| C1.02.5 | Regroup the 9 steps under those three headings | ACCEPT, Task 5 |
| C1.02.6 | Title becomes "Setup: Personal Information" and so on | ACCEPT, Task 5 |
| C1.02.x | (implied) the intro must be skippable and must not replay | ACCEPT, Task 4. `UiPrefs.bootSeen` already exists; the intro gets its own flag |

### w1.03 — shell topbar

| Id | Claim | Disposition |
| --- | --- | --- |
| C1.03.1 | The topbar is invisible under limelight | CONFIRMED AS A DEFECT. `src/app/App.tsx:483-494`. Task 2 |
| C1.03.2 | Make it a moving banner: app name fixed, page instruction moving | ACCEPT, Task 6. `src/ui/components/Marquee.tsx` already does this and is reused, not rewritten |
| C1.03.3 | The instruction is one sentence, concise, all caps | ACCEPT, Task 6. Upper case is a skin register, applied in CSS, not baked into the key |
| C1.03.4 | Move "local data loaded" to the foot of the page | ACCEPT, Task 6 |
| C1.03.5 | Add a discrete footer: name, GitHub link, last update, version | ACCEPT, Task 7. The URL is a build constant, never a copy string |
| C1.03.6 | "Think if we need to say something else" | ANSWERED in Part B7 |

### w1.04 / w1.05 — units and nav

| Id | Claim | Disposition |
| --- | --- | --- |
| C1.04.1 | Observed: step 1 of 9, units, with the stored-units helper | CONFIRMED, no separate action |
| C1.04.2 | Replace the units helper text | ACCEPT, Task 8, resplit to pass R3 |
| C1.04.3 | Units must be changeable later, from Settings, and "those static settings" plural | ACCEPT, Task 9. Read as units and time zone, the two fixed at setup |
| C1.04.4 | Store every number in both unit systems so a toggle needs no recalculation | CHALLENGE. The goal is already met and the proposed mechanism would break it. See B1 |
| C1.05.1 | Nav layout stands | ACCEPT, no change |
| C1.05.2 | Relabel to "Previous" and "Next" | ACCEPT, Task 8, in all three tables. Renaming the default alone leaves your screen reading "go on". See B8 and B39 |

### w1.06 — timezone

| Id | Claim | Disposition |
| --- | --- | --- |
| C1.06.1 | Replace the helper text | ACCEPT, Task 10 |
| C1.06.2 | Make it a dropdown with offset and city labels | ACCEPT, Task 10. `Intl.supportedValuesOf('timeZone')` is already wired as a datalist at `SetupWizard.tsx:514`; this converts it to a labelled select |
| C1.06.3 | Change the label above the box | ACCEPT, Task 10 |

### w1.07 — body, part one

| Id | Claim | Disposition |
| --- | --- | --- |
| C1.07.1 | The page is too long and scrolls | ACCEPT, Task 11 |
| C1.07.2 | Two-column rows | ACCEPT, Task 11 |
| C1.07.3 | "Name" becomes "How should I refer to you?" | ACCEPT, Task 11 |
| C1.07.4 | The equation helper does not belong under the name field | ACCEPT, Task 11. Confirmed: `displayName` reaches no equation. `NutritionInput` takes sex, age, height, mass, body fat, activity, goal, sessions, creatine, and no name |
| C1.07.5 | Move it to the foot of the body box as a citation list | ACCEPT, Task 12 |
| C1.07.6 | Do not present sex as a bare Male/Female pair | ACCEPT, Task 13 |
| C1.07.7 | Where is sex used? | ANSWERED. Two places, not one. See B2 |
| C1.07.8 | Age and sex as one two-column row with a footnote marker | ACCEPT, Task 13, with the label corrected per B2 |
| C1.07.9 | Selectable bold male and female glyphs | ACCEPT AS SVG. The characters fail both emoji gates. See B26 |
| C1.07.10 | A hyperlink reading "Options suck? I agree. Click here for a workround." | ACCEPT, Task 13, spelling corrected |
| C1.07.11 | A popup with a high-contrast close control at the upper left | ACCEPT. There is no competing convention; `ModalShell` renders no close control and its consumers differ |
| C1.07.12 | Two segments | ACCEPT, Task 13 |
| C1.07.13 | Equation with the sex term highlighted, in LaTeX if possible, with the source | ACCEPT, Task 13. Rendered as MathML, not a LaTeX runtime. See B9 |
| C1.07.14 | Quantify the difference for a 30-year-old male and female of equal mass | ACCEPT, Task 13. The exact figure is 166 kcal/day at RMR. See B3 |
| C1.07.15 | A lime divider between the segments | ACCEPT, Task 13 |
| C1.07.16 | Guidance for users on hormone therapy, split at 6 months | CHALLENGE, EVIDENCED. No validation exists and no threshold has support. Replacement drafted. See B10 |
| C1.07.17 | Ask for age, not birth year | ACCEPT, Task 14. Input age, store birth year, recompute age. See B11 |
| C1.07.18 | Two columns for height and mass | ACCEPT, Task 11 |
| C1.07.19 | Age-sex and mass-height in separate bordered boxes | ACCEPT, Task 11 |
| C1.07.20 | Height as two integer boxes, feet+inches or metres+centimetres | ACCEPT, Task 15 |
| C1.07.21 | Integers only, no unit characters, no decimals | ACCEPT, Task 15 |
| C1.07.22 | Body mass in one box, "decimals up to the 3rd significant digit" | DECIDE, Q8. The stated rule breaks above 99.9 kg. See B12 |

### w1.08 — body, part two

| Id | Claim | Disposition |
| --- | --- | --- |
| C1.08.1 | "why?" and "Optional" sit above the control they explain | ACCEPT as a general principle, Task 16 for this control and Task 27 for the other twelve sites. See B34 |
| C1.08.2 | Remove "Not measured", or add a fourth option | DECIDE, Q1. You leaned to removing; the add branch is not dropped, it is on the table. The control is a radio group, so removal forces a new default. See B13 |
| C1.08.3 | Two options: "Percentage %" and "Body Measurements" | ACCEPT, Task 16, subject to Q1 |
| C1.08.4 | "Click here to estimate" above the percentage box | ACCEPT, Task 16 |
| C1.08.5 | A popup with a row of male bodies and a row of female bodies | ACCEPT as an original asset, with the provenance tag of B31 |
| C1.08.6 | Sourced, open licence, from a validated journal or magazine | SUPERSEDED. No licensed asset exists (B27), so we draw our own and the licence is ours. See B31 |
| C1.08.7 | No obesity classification labels | ACCEPT, Task 16 |
| C1.08.8 | Girth inputs must follow the chosen unit system; today they do not | CONFIRMED AS A DEFECT. Task 3. The fix converts at entry; it does not implement the imperial equation. See B14 |
| C1.08.9 | A line diagram of the neck and abdomen measurement sites | ACCEPT, Task 17 |
| C1.08.10 | Remove the site prose ("Abdomen II: horizontal...") | CHALLENGE. That prose is what keeps the estimate valid. See B15 |
| C1.08.13 | Remove "US NAVY..." | ACCEPT with a fix: that string also hard-codes cm and carries the C1.08.8 defect. See B33 |
| C1.08.14 | Remove "Enter a number" | CHALLENGE. One string, ten call sites, every required-field message in the wizard and Settings. See B33 |
| C1.08.11 | Verify the numbers on the page connect correctly | ACCEPT, Task 18. One real trap found: the estimate is legitimately null for lean men |
| C1.08.12 | On a failed Next, vibrate and jump to the missing field | PARTIAL. The jump lands; the vibration is a no-op on iOS. Task 19 |

### w1.09 — training context

| Id | Claim | Disposition |
| --- | --- | --- |
| C1.09.1 | Rename to "Equipment & Availability" | CHALLENGE. Availability moves off this step under C1.10.8. See B16 |
| C1.09.2 | First box titled "Everyday Activity Level" | ACCEPT-SUB, plan 12 |
| C1.09.3 | An "Examples" call-out that toggles | ACCEPT-SUB, plan 12 |
| C1.09.4 | Where does the activity list come from? | ANSWERED. FAO/WHO/UNU 2004 Table 5.3. Not invented. See B17 |
| C1.09.5 | If arbitrary, replace with a 1 to 10 slider | NOT ACTIONED. Your own condition fails: it is not arbitrary. The real complaint is addressed instead. See B17 |
| C1.09.6 | Rename "Experience" to "Gym Comfort" | ACCEPT-SUB, plan 12 |
| C1.09.7 | Three levels, as a slider, with the wording given | ACCEPT-SUB, plan 12 |
| C1.09.8 | Icons per level | ACCEPT-SUB, plan 12, delivered as the icon register in Task 20 |
| C1.09.9 | An icon register naming each icon, its location and a 5 to 8 word prompt | ACCEPT, Task 20 |
| C1.09.10 | Rename "The gear" to "Equipment Access", as a slider | ACCEPT-SUB, plan 12 |
| C1.09.11 | Five equipment tiers instead of three | ACCEPT-SUB, plan 12. Ripples into all 40 library exercises. See B18 |
| C1.09.12 | Popup examples for the two combination tiers | ACCEPT-SUB, plan 12 |
| C1.09.13 | You will generate those icons | NOTED, Task 20 lists them |
| C1.09.14 | Step 4 is rebuilt and alpha-tested on its own | ACCEPT. That is plan 12's exit condition |
| C1.09.15 | Move the load-increment fields into their own box | ACCEPT-SUB, plan 12 |
| C1.09.16 | Make them conditional on the equipment tier | ACCEPT-SUB, plan 12 |
| C1.09.17 | Full gym: walk to the gym, yes/no, then minutes | DECIDE, Q4. Double-counts against the PAL band. See B19 |
| C1.09.18 | Home gym: a multi-select equipment list | ACCEPT-SUB, plan 12. You wrote "2 options for aerobic" and listed three |
| C1.09.19 | Body weight: simple options | ACCEPT-SUB, plan 12 |
| C1.09.20 | Exercises carry a requirement tag and are excluded when unmet | ALREADY BUILT. `Exercise.equipment: Equipment[]` and `resolveSlot` do this. Plan 12 extends the tag set. Your sentence says an unmatched exercise "would get recommended"; read as would NOT be recommended, which is what the code does |
| C1.09.21 | Remove microplates entirely | ACCEPT-SUB, plan 12. Note the conflict with C1.09.15. See B20 |

### w1.10 / w1.11 / w1.12 — goal, target date, programme

| Id | Claim | Disposition |
| --- | --- | --- |
| C1.10.1 | Observed: goal dropdown, target body mass, target date | CONFIRMED, no separate action |
| C1.10.2 | Rename to "Fitness Goal" | ACCEPT-SUB, plan 13 |
| C1.10.3 | The goal options are wrongly exclusive | ACCEPT-SUB, plan 13. There are four options, not three. See B21 |
| C1.10.4 | The whole page is rebuilt | ACCEPT-SUB, plan 13 |
| C1.10.5 | "Target body mass" is not a meaningful target | ACCEPT-SUB, plan 13. `Profile.goal.targetBodyFatPct` already exists and the wizard never fills it |
| C1.10.6 | Present goals as outcomes, with infographics and examples | ACCEPT-SUB, plan 13 |
| C1.10.7 | Search for the best presentation | ACCEPT-SUB, plan 13 |
| C1.10.8 | Reorder: goal, then availability, then target date | ACCEPT-SUB, plan 13 |
| C1.10.9 | Feasibility cannot be judged before training frequency is known | ACCEPT-SUB, plan 13. Correct, and the engine agrees |
| C1.11.1 | Availability moves earlier; this step becomes the target date | ACCEPT-SUB, plan 13 |
| C1.11.2 | Target date as a calendar | ACCEPT-SUB, plan 13 |
| C1.11.3 | Pastel red, orange, green for improbable to realistic | ACCEPT-SUB, plan 13 |
| C1.11.4 | A first-draft ballpark from current selections | ACCEPT-SUB, plan 13 |
| C1.11.5 | Plan how, from what is already set, and only that | ACCEPT-SUB, plan 13. Derivable for fat loss; not derivable for muscle gain. See B22 |
| C1.12.1 | The programme step is unexplained | CONFIRMED. It sets `PlanTemplate.weeks`, 8 to 24 |
| C1.12.2 | It should follow from the target date | ACCEPT-SUB, plan 13 |
| C1.12.3 | What is it for, what does it solve? | ANSWERED. See B25 |
| C1.12.4 | Ahead-of-time generation of N days: no | ACCEPT-SUB, plan 14 |
| C1.12.5 | Generate the next session when the last one ends | ACCEPT-SUB, plan 14, as a split: provisional schedule ahead, prescription just in time. See B23 |
| C1.12.6 | Drop fixed offload blocks | ACCEPT-SUB, plan 14. The code's own review already recommends autoregulation. See B23 |

### w1.13 / w1.14 / w1.15 — readiness, review, notice

| Id | Claim | Disposition |
| --- | --- | --- |
| C1.13.1 | Answering yes to all produced no consequence | UNDER INVESTIGATION, Task 21. If true it is a defect, and it is evidence either way |
| C1.13.2 | Remove the readiness screen completely | ACCEPT, Task 22, with one recorded caveat. See B24 |
| C1.13.3 | Replace it with a creatine recommendation | ACCEPT, Task 23. The dose is grams, not milligrams, and the engine already computes it |
| C1.13.8 | "It's one of the most researched compounds, you have nothing to worry about" | CHALLENGE. An unqualified safety claim replacing a screen whose function was to find the people for whom it is untrue. See B38 |
| C1.13.4 | Caffeine dose and timing | PARTIAL. Dose and timing hold and should be personalised. The milk-and-sugar clause is folklore. See B29 |
| C1.13.5 | A bottle or shaker recommendation | ACCEPT, Task 23 |
| C1.13.6 | Protein powder form guidance | CHALLENGE. The form does not matter; the evidence points elsewhere. See B28 |
| C1.13.7 | One Sonnet 5 subagent per point | DONE for caffeine, protein and HRT; creatine is already covered by the content review with verified DOIs and is not re-researched |
| C1.14 | Rebuild the review step afterwards | ACCEPT, Task 24 |
| C1.15 | Rebuild the readiness notice afterwards | SUPERSEDED by C1.13.2. Removed, not rebuilt |

### w1 general

| Id | Claim | Disposition |
| --- | --- | --- |
| C1.G.1 | Setup input must survive closing the browser | ACCEPT, Task 25. The single highest-value item in the set |

---

## Part B. Findings

Each of these changes what a claim should become. They are ordered by how much they cost to get wrong.

<!-- decision: units-canonical-storage-not-dual | status: adopted | supersedes: none -->
### B1. Storing both unit systems would break the property you are asking for (C1.04.4)

You asked that every number be converted and stored in both systems "so that a simple toggle won't mean a recalculation of the whole device". The goal is right. The mechanism would defeat it.

The app already stores one canonical value per quantity and formats at render. `src/domain/types.ts` opens with `Kg`, `ML`, `Seconds` declared as canonical, and every record follows: `LoggedSet.loadKg`, `BodyMassEntry.massKg`, `Profile.body.heightCm`. Switching units therefore costs **nothing today**. There is no recalculation to avoid, because nothing is stored in display units in the first place. `KG_PER_LB = 0.45359237` is exact by definition, so the conversion is lossless in double precision and reversible.

Storing both would introduce three failures the current design does not have:

1. **Two sources of truth that can disagree.** Any write that updates one field and not the other silently corrupts the record, and no test can catch every such path.
2. **Round-trip drift.** A value written in lb, read in kg, edited, and written back accumulates rounding at every display boundary. Canonical storage rounds once, at the last moment, for the eye only.
3. **A schema migration for zero benefit**, against a document that deliberately holds `CURRENT_SCHEMA_VERSION` at 3 through P1 to P8.

The app also already keeps what dual storage is usually wanted for: `LoggedSet.enteredUnit` and `BodyMassEntry.enteredUnit` record the unit the user typed in, so a set logged as 100 lb can always be shown back as the round number it was entered as.

**Proceeding as:** implement the Settings toggle you asked for (Task 9). Do not implement dual storage. If you want it anyway after reading this, say so and I will scope it, but it is a data-integrity regression and I will record it as one.

### B2. Sex is used in two engines, not one (C1.07.7, C1.07.8)

You asked where male and female are used, and proposed labelling the field "Biological Sex for RMR". That label would be incomplete.

- **Resting metabolic rate.** `src/domain/nutrition.ts:96`, Mifflin-St Jeor, `MSJ_CONSTANT = { male: 5, female: -161 }` kcal/day.
- **Body-fat estimate from tape.** `src/domain/bodyfat.ts`. The male and female equations are structurally different, not merely differently weighted: men use `abdomen II - neck`, women use `abdomen I + hip - neck`, with different coefficients and a different intercept. Women need a hip girth the men's form does not take.
- **Beverage target.** `BEVERAGE_TARGET_ML = { male: 3000, female: 2200 }` mL/day, IOM 2005.

So three, once fluid is counted. The honest label names the function, not one consumer of it.

**There is also a way out that the code already supports.** `NutritionTargets.basis.rmr` is `'mifflin-st-jeor' | 'cunningham'`. Cunningham (1991), `RMR = 370 + 21.6 * FFM(kg)`, has **no sex term at all**, and the engine prefers it whenever fat-free mass is available. Fat-free mass needs a body-fat percentage. So a user who supplies body fat gets an RMR that does not ask about sex.

That reframes the whole question from a labelling problem into an ordering problem, and it is the alternative I would put ahead of the popup: ask for body composition first, and the sex term stops being load-bearing for energy. It still governs the tape estimate and the fluid target, which the disclosure must say.

Note the code's own warning at `src/domain/nutrition.ts:100`: this equation is widely mislabelled Katch-McArdle. It is Cunningham. Use that name.

### B3. The number you guessed is right, and it is zero for half your users (C1.07.14)

CORRECTED 2026-09-04 after review. The first version of this finding said the user never sees RMR, and stated the 166 figure unconditionally. Both were wrong, and the second error would have written a false sentence into the one disclosure whose whole purpose is honesty about the sex term.

**The constant.** The Mifflin-St Jeor sex term is a fixed offset. For two people of identical mass, stature and age, `5 - (-161) = 166 kcal/day`, independent of every other input. Your "1 to 2 bananas" guess is right for that equation.

**It is zero on the other path.** `src/domain/nutrition.ts:481` selects Cunningham whenever `bodyFatPct` is not null, and Cunningham has no sex term. So for any user who supplies a body-fat percentage, which is exactly the user B2 and B31 steer people toward, the sex difference in resting metabolic rate is **not 166 kcal/day, it is nothing at all**. The disclosure must say which equation is running for the reader, not quote one number as if it always applied.

**The user does see RMR.** `src/ui/views/TargetsView.tsx:171-177` renders RMR, TDEE, and the name of the equation that produced them, through `FORMAT.rmrBasis`. So the disclosure can point at a screen the user can check rather than describing a hidden number.

**Is it significant?** You asked that, and the first version answered only how large it is. Set against the equation's own error: the content review records Mifflin-St Jeor as accurate within 10 % in 82 % of cases (`src/domain/nutrition.ts:85-88`). At a resting metabolic rate near 1600 kcal/day, 10 % is about 160 kcal/day. So the sex term and the equation's own accuracy band are the same order of magnitude. That is the honest answer to your question, and it is a better one than the banana: the term is large enough to matter and small enough that the equation's error can swallow it, which is precisely why a measured body composition beats arguing about the coefficient.

The banana figure still needs a USDA FoodData Central lookup before it is printed.

### B4. Two features the intro would promise do not exist (C1.01.7, C1.01.8)

- **"Small games you can play in the resting period."** None exist. `src/domain/fun/` holds `blocks.ts` (cursor and milestone arithmetic), `rng.ts` and `specimens.ts` (the Atlas cards). `RestTimerPanel.tsx` is a countdown ring with a chime and an Android vibration. There is a Konami easter egg and a time capsule. There is no minigame.
- **"A demon function that berates you in a cheeky way."** `src/ui/components/Intervention.tsx` exists and is the closest thing, but its specification forbids exactly what you describe: the title may be camp, and the body "carries no verdict, no second-person judgement and no joke, in every skin". So the app deliberately does not berate.

An intro that promises both would be false on first contact, which is the worst place to be wrong. Three ways out, and Q5 asks which:

1. Reword the intro to describe what ships.
2. Keep the copy and build the rest-period minigame, which is a new plan of its own.
3. Keep the copy and relax the Intervention body rule, which is a deliberate reversal of a reviewed decision and needs recording as one.

### B5. The SpongeBob art cannot ship as described (C1.01.11)

SpongeBob SquarePants is Viacom/Paramount property. ASCII art is a derivative work, and the app is public, open-source, and published under the owner's name on GitHub Pages. `README.md` currently states that "the icons and the mascot illustrations originate with this project, and no third-party licence applies to them" — shipping the character would make that statement false.

**Proposing:** an original mascot in the same register. The app already ships original mascot illustrations with provenance recorded in `src/skins/limelight/illustrations.ts`, so there is a house style to extend and an existing home for it. Q5 covers this.

### B6. Flashing text is an accessibility hazard (C1.02.2)

WCAG 2.1 success criterion 2.3.1 forbids content that flashes more than three times per second, because it can trigger seizures in photosensitive users. The app already takes accessibility seriously elsewhere: `Marquee.tsx` handles `prefers-reduced-motion` before the first paint, and `UiPrefs.hotkeys` exists specifically to satisfy SC 2.1.4.

A slow pulse under three flashes per second is compliant. A "flashing" warning as the phrase is normally meant is not. Q6 asks which you want, and the safe default is a slow single fade that respects `prefers-reduced-motion`.

Separately: this slide is the app's liability disclaimer wearing a joke. The joke can stay. But a disclaimer that only ever appears once, before setup, is one a user cannot find again when they want it. Task 7 puts a plain version in the footer so it is always reachable.

### B7. What else the footer should carry (C1.03.6)

You asked me to think about it. Beyond name, GitHub link, last-updated date and version:

- **A one-line data statement.** "Everything stays on this device." It is the app's strongest property and nothing currently says so outside the README.
- **The disclaimer, in plain words.** Per B6.
- **The licence.** The repository is public and the fonts are OFL-1.1.
- **The build commit.** `vite.config.ts` can inject it. When you get a bug report from a tester, the commit is the first thing you will want and the only one they cannot tell you.

I would leave out a contact address, because it is a live email in a public page, and a support link, because there is no support.

### B8. "Previous" and "Next" are shared keys (C1.05.2)

`button.back` and `button.continue` are not owned by the wizard. Task 8 must check every call site before renaming, or the migration wizard and the modals inherit the change. If they should differ, the wizard needs its own two keys rather than a rename.

### B9. LaTeX rendering does not need a LaTeX runtime (C1.07.13)

KaTeX is roughly 300 KB of JS and CSS and would be the largest dependency in an app that currently ships no maths library. MathML is now supported natively by every browser above the app's stated floor, renders as text rather than as an image, is selectable and readable by a screen reader, and costs nothing.

Task 13 writes the two equations as inline MathML with the sex term wrapped in its own styled element, which is what makes the highlight you asked for possible. Verify browser support against the platform floor before committing.

<!-- decision: hrt-no-threshold-ffm-path | status: adopted | supersedes: none -->
### B10. Neither of the two bullets you wrote can ship, and the evidence says why (C1.07.16)

The research came back and it is unambiguous on both halves.

**No study validates any of these equations in a population on gender-affirming hormone therapy.** Not Mifflin-St Jeor, not Harris-Benedict, not Cunningham. The absence held across three independent search strategies. The nearest things that exist are a trial with no results yet (NCT06733415) and a 2026 narrative review (Tosi et al., *Nutrients*, DOI `10.3390/nu18121967`) which says current assessment models "may not fully capture" hormone-therapy-related changes without testing any named equation.

**No evidence supports a six-month threshold, or any threshold.** This follows from the first finding: if no study has compared equation fit across timepoints, no crossover can have been found. Worse for the idea, the most relevant study argues against a fixed timeline outright. Van Velzen et al. 2020, *Eur J Endocrinol*, DOI `10.1530/EJE-20-0609`: 20.2 % of transmen and 9.4 % of transwomen showed no measurable body-composition change even at 24 months. A rule keyed to elapsed months would misroute one user in five.

Body composition does change, and the magnitudes are established. Klaver 2017's pooled estimate is a 2.4 kg lean-mass decrease in transwomen, though Auer 2018 found no significant lean-mass change at 12 months, and that inconsistency is real rather than a reading error.

No professional body fills the gap. WPATH SOC8, the 2017 Endocrine Society guideline and a 2026 ACSM statement on transgender athletes were each checked directly. None addresses resting metabolic rate or energy requirement estimation.

**So the segment writes itself, and it is better than what you asked for.** Instead of a threshold the evidence cannot support:

1. Say what the sex term does: it is a fixed 166 kcal/day offset in one equation, nothing more.
2. Say plainly that no predictive equation has been validated for people on hormone therapy, and that the app will not pretend otherwise.
3. Offer the route that sidesteps the question. Supplying a body-fat percentage moves the app onto Cunningham, which has no sex term. That is a real answer rather than a better guess, and the app already implements it.
4. Note that individual variation is large enough that any rule keyed to time would be wrong for a fifth of people, and cite van Velzen for it.

One caveat to keep honest: Cunningham is mechanistically more defensible during active body-composition change, but it is equally unvalidated in this population. The screen should say that too rather than sell it as solved.

On terminology: the literature uses "sex assigned at birth" and "gender-affirming hormone therapy". Older papers use "cross-sex hormone therapy" and "transsexual persons". "Fitness sex" appears nowhere and coining it would send anyone who searches the phrase into no literature at all.

### B11. Age is a decaying value; birth year is not (C1.07.17)

Asking for age is better UX and you are right to want it. Storing age is a bug in waiting: a user who enters 30 and returns two years later still computes as 30, and every energy target drifts with them. Your own sentence already contains the fix — "backcalculate the birth year, use that."

**Implementing as:** the field asks for age, the store keeps `Profile.body.birthYear`, and every read recomputes age from the current date. One caveat to record: birth year inferred from age alone is uncertain by one year, because we do not know whether the birthday has passed. At 5 kcal/day per year of age that is a 5 kcal/day uncertainty, which is far inside the equation's own error, so it is acceptable. It goes in a code comment rather than on screen.

### B12. "Third significant digit" does not survive a three-digit body mass (C1.07.22)

CORRECTED 2026-09-04 after review. At 78.5 kg the rule gives one decimal place. At 105.2 kg three significant figures gives 105, so the rule forbids the tenth the user typed rather than allowing a fourth digit. Either way significant figures are the wrong instrument for an input constraint: the permitted precision changes with the magnitude of the value, so the same scale reading is legal for one user and illegal for another.

**Proposing:** one decimal place, in both kg and lb. That is the resolution domestic scales report, it is stable across the whole range, and `round1()` already exists in `SetupWizard.tsx:352`. Q8 confirms.

### B13. Removing "Not measured" forces a value the engine treats as optional (C1.08.2)

`NutritionInput.bodyFatPct` is `number | null`, and null is a supported, meaningful state that changes two outputs:

- **RMR** falls back from Cunningham to Mifflin-St Jeor, which is the sex-term path from B2.
- **Protein on a fat-loss goal** falls back from 2.3 to 3.1 g/kg fat-free mass (Helms 2014) to 1.4 to 2.0 g/kg body mass (Jaeger 2017), because applying the fat-free-mass range to body mass is roughly a 33 % overfeed at 25 % body fat.

So a user with no tape and no scale must still be able to proceed. Removing the third option is fine as long as *some* skip path exists. Q1 asks which: an explicit skip control, or leaving both inputs blank and letting Next through.

There is a synthesis worth considering. If B2's ordering is adopted, body fat becomes the input that removes the sex question, which is a much better reason to supply it than "optional".

### B14. The girth unit inconsistency is real, and the fix is not the imperial equation (C1.08.8)

Confirmed. `Draft.neck`, `Draft.waist` and `Draft.hip` are all commented `// [cm], as typed` and are read straight into `estimateBodyFatNavy`, while mass and height switch with the unit system. An imperial user types inches into a field the engine reads as centimetres, and gets a silently wrong body-fat estimate. This is the worst defect in the round because it produces a plausible number rather than an error.

The fix is to convert inches to centimetres at entry. It is **not** to implement the DoD imperial form. `src/domain/bodyfat.ts:14` records why: the two are not algebraically equivalent, the imperial coefficients are a first-order linearisation returning percentage directly, and mixing them introduces a silent 0.3 to 0.7 percentage-point disagreement.

### B15. The site prose is what makes the tape estimate valid (C1.08.10)

You called "Abdomen II: horizontal, at the umbilicus" too detailed and not helpful. `src/domain/bodyfat.ts:60` states the cost of removing it: "Measuring a woman at the umbilicus, or a man at minimal width, silently biases the result: the girth term carries the whole prediction." The men's and women's equations measure at different sites, and this is not a naming variation.

**Proposing a middle path** rather than either extreme: the site diagram you asked for in C1.08.9 carries the same information visually, and carries it better. Replace the prose on the face with the diagram, and keep one short line of text as the diagram's caption for screen-reader users, who get nothing from an image. The full site definition moves behind the `why?` disclosure, where R10 already exempts it from the length rules. Nothing is lost and the wall of text goes.

### B16. Two of your instructions disagree about where availability lives (C1.09.1 vs C1.10.8)

C1.09.1 renames step 4 to "Equipment & Availability". C1.10.8 moves availability out of its own step to sit between goal and target date. Both cannot hold.

C1.02.5's three-way grouping suggests the resolution: availability belongs under "Fitness Goal & Schedule" with the goal and the target date, and step 4 keeps equipment alone. **Proposing:** step 4 becomes "Equipment", and availability moves into the goal group. Q9 confirms.

<!-- decision: activity-levels-three-bands-kept | status: adopted | supersedes: none -->
### B17. The activity levels are not arbitrary, so your own condition rules out the slider (C1.09.4, C1.09.5)

You asked whether the list is invented and said "let's revise this whole thing IF it's arbitrary". It is not.

`ActivityLevel` is three FAO/WHO/UNU (2004) PAL bands, *Human Energy Requirements*, Table 5.3 p.38, verified from the primary PDF by the content peer review. `ACTIVITY_FACTOR` takes each band's printed floor, so no number in the file was invented: 1.40, 1.70, 2.00.

The file also records what was rejected and why. The five-point gym ladder you would recognise, 1.2 / 1.375 / 1.55 / 1.725 / 1.9, is rejected because no primary source exists, its interior points are exact arithmetic interpolations, and its 1.2 anchor is a non-ambulant limit that FAO excludes, which under-feeds sedentary users. NASEM 2023 is rejected because its cut-points are percentiles of its own sample rather than physiological thresholds.

A 1-to-10 slider would be worse than either. Ten points over three evidenced bands invents seven values, and each one would need a PAL number that no source supplies. It would also invert the scale, since you put athlete at 1 and sedentary at 10.

**But your actual complaint is correct and unaddressed.** "Sedentary in Houston" and "sedentary in New York" are different lives, and the current labels do not help anyone place themselves. That is a labelling failure, not a banding failure. Plan 12 keeps the three bands and the three factors, and rewrites the descriptions with the concrete examples you asked for in C1.09.3, including the commute case. You get the clarity you were after and the numbers stay defensible.

### B18. Five equipment tiers ripple through all forty exercises (C1.09.11)

`Exercise.equipment: Equipment[]` tags every exercise in `src/domain/plan/library.ts`, and `resolveSlot` in `templates.ts` substitutes by tier. The generator's own test asserts the weekly-set band per tier, "because the band claim differs by tier". Adding two combination tiers means retagging forty exercises and extending that test matrix. It is the largest single piece of work in the round and belongs in plan 12, not here.

### B19. The gym-walk question double-counts against the activity band (C1.09.17)

If commute walking raises the PAL band *and* is added again as an explicit aerobic term, the same energy is counted twice. FAO PAL is total energy expenditure over BMR: everything the person does in a day is already inside it, walking to the gym included.

Q4 asks which you want. Either the walk informs which band the user should pick, as one of C1.09.3's examples, or it becomes a separate logged activity that the band must then exclude. It cannot be both without over-feeding the user.

### B20. "Remove microplates" and "move the step fields into their own box" may be the same fields (C1.09.15, C1.09.21)

`Draft` carries `barbellStep`, `dumbbellStep`, `stackStep`, `hasMicroPlates` and `microPlateStep`. The first three are the increment the progression rounds to; the last two are the fine-increment option. C1.09.21 plainly removes the microplate pair. C1.09.15 and C1.09.16 then ask the remaining three to move and to become conditional, while C1.09.17 to C1.09.19 describe equipment questions that appear to replace them.

Q10 asks whether the three step fields survive at all. They are not cosmetic: `generator.ts` progression rounds to them, so removing them means picking a default per tier, and prescribed loads change.

### B21. There are four goals, not three, and one of them is unevidenced (C1.10.3)

`GoalKind` is `fat-loss | muscle-gain | recomposition | maintenance`. You saw a dropdown and read it as three.

You are right that the options overlap: recomposition is simultaneous fat loss and muscle gain, so it is not disjoint from fat loss. The engine half-admits this. `energyPlan` gives recomposition the same energy as maintenance and its own rule string says the content review does not cover recomposition at all. The protein rule for recomposition is explicitly labelled EXTRAPOLATION.

So the weakest option is the one your instinct picked out. Plan 13 rebuilds the goal model, and the honest constraint is that any new option must map onto an energy rule and a protein rule the review supports, or ship labelled as an extrapolation the way recomposition already is.

### B22. The calendar colouring is derivable for fat loss and not for muscle gain (C1.11.5)

Fat loss has everything needed, already exported and cited:

    FAT_LOSS_RATE_FRACTION = 0.007          Garthe 2011, 0.7 %BW/week
    FAT_LOSS_RATE_BOUND    = 0.005 to 0.01  Helms 2014, 0.5 to 1.0 %BW/week

That maps directly onto your three colours: inside 0.5 to 1.0 %BW/week is green, beyond 1.0 %BW/week is red, and the band between the target and the bound is orange.

Muscle gain has nothing. `energyPlan` returns `rateKgPerWeek: null` for it and says why: Garthe 2011 gives a total gain of +4.3 % body mass but the review does not state the study duration, so no weekly rate can be derived. Reporting null is the honest value.

So a muscle-gain target date cannot be coloured on the same basis. Plan 13 must either colour only the fat-loss axis, or find and verify a rate source, or show muscle gain uncoloured with a line saying no rate is established. The third is the honest default.

One further constraint: the engine never converts kcal to kg, deliberately, because the content review rejects 3500 kcal/lb (Hall 2011). The feasibility model must run off the rate rule, not off an accumulated deficit.

<!-- decision: jit-prescription-provisional-schedule | status: adopted | supersedes: none -->
### B23. Just-in-time generation is right, and pure JIT breaks three shipped features (C1.12.4, C1.12.5, C1.12.6)

Your instinct matches the project's own evidence. `generator.ts:56` records that the four-week deload cadence is "a calendar backstop, NOT an evidence-based interval", labelled HEURISTIC, against Bell 2023 finding 100 % panel agreement that pre-planned deloads "might not be necessary" and Coleman 2024 finding no hypertrophy benefit from a mid-programme deload. The content review's own recommendation is "autoregulate; keep a 4-8 week calendar backstop".

But three shipped features read the forward plan:

1. **Reminders.** The Worker is sent the instants of upcoming sessions. With nothing generated ahead, there is nothing to schedule.
2. **The `.ics` export.** It exports upcoming sessions. JIT would reduce it to one.
3. **The Plan tab.** Its whole content is "the generated programme, week by week".

**Proposing a split rather than a swap.** Generate the *schedule* ahead: dates, session labels, target volume. That keeps reminders, the export and the Plan tab working. Generate the *prescription* just in time: exercise selection, sets, and load, at session start, from what has actually been logged. Replace the fixed four-week deload with an autoregulated trigger against accumulated volume and completion, keeping the 4-to-8-week backstop the review asks for so a deload cannot be deferred indefinitely.

That gives you what you asked for, drops the constraint you objected to, keeps three features alive, and stays inside the cited evidence. Plan 14.

<!-- decision: readiness-screen-removed | status: adopted | supersedes: readiness-screen-own-wording -->
### B24. Removing the readiness screen is a decision worth recording, not a cleanup (C1.13.2)

I will remove it as instructed. Once, for the record: it is a pre-participation screen modelled on the PAR-Q+, the app takes the conservative branch of advising a physician on any yes, and `docs/plans/2026-09-01-00-master-plan.md` section 10.4 carries the decision behind it. Its removal is a deliberate reversal, and pairing it with the disclaimer in C1.02.2 is what makes that defensible rather than careless.

Three things follow that must land in the same commit or the document breaks:

1. `Profile.readiness` stays in the schema as a legacy field. CORRECTED 2026-09-04 after review: the first version said deleting it would fail validation on load. It would not. `ProfileSchema` is a plain `z.object` (`src/domain/schema.ts:148`) with no `.strict()` anywhere in the file, so Zod strips unknown keys silently. The real risk is worse for being quiet: the field would be dropped from every stored document on the next write, destroying screening data users already gave, with no error anywhere. Keep the field.
2. The Settings redo panel calls the same component and goes with it.
3. `ReadinessScreen.test.tsx` asserts inequality against the PAR-Q+ sentences, so that the form's copyrighted text cannot be pasted back in. That guard should survive the removal of the screen it guards.

And a note on your evidence. You answered yes to all seven and the app said OK. Whether that is a defect depends on where the consequence was meant to appear: `anyYes` sets `flagged`, and the physician notice is specified to show at session start, not at the end of the wizard. Task 21 checks which happened. If the notice never fires, that is a real defect and worth knowing even though the screen is being removed, because the same wiring pattern is used elsewhere.

### B25. What the programme step is for (C1.12.3)

You asked what it solves. It sets one number: `PlanTemplate.weeks`, bounded 8 to 24 by `PLAN_WEEKS_MIN` and `PLAN_WEEKS_MAX`. That number decides how many times the split template repeats and where the deload blocks fall, at `BLOCK_WEEKS = 4`: three training weeks then one deload week, emitted as two `PlanBlock` records per cycle.

So it exists to give the generator a horizon. CORRECTED 2026-09-04 after review: the first version said nothing else reads it. Two live consumers do, and both must be handled before the step can go:

- `src/ui/components/Boot.tsx:62,74,79` prints the "week X of Y" boot line from it.
- `src/ui/components/TimeCapsule.tsx:145` passes it to `defaultOpensOn(cursor.startedOn, plan.weeks)` to set the capsule's default opening date.

Under B23's split the horizon follows from the target date rather than from a question, so the step still disappears. But `PlanTemplate.weeks` does not: it keeps a value, now derived, and both readers keep working.


### B26. The male and female glyphs cannot ship as characters (C1.07.9)

You asked for bold ♂ and ♀ as the selectable icons. Both gates in this repository reject them, and I verified this by running the predicates rather than reading them:

- `src/content/copy.test.ts:60` treats U+2600 to U+27BF as emoji under R6. ♂ is U+2642 and ♀ is U+2640. Both are inside it.
- `scripts/check-no-emoji.mjs` tests `Extended_Pictographic`, which both glyphs also satisfy, and it scans every tracked `src/**/*.tsx`.

So the characters fail whether they sit in a copy string or in the JSX.

**Proposing:** draw them as SVG, the way every other icon in the app is done. `src/skins/limelight/icons.ts` is base64 in a `.ts` file and is explicitly outside the gate's scope, so the icon system already has the exemption and the house style. You lose nothing visually and the gates stay honest.

### B27. The body-fat visual chart should not ship at all (C1.08.5, C1.08.6, Q2)

Research came back with two findings, and the second is the one that decides it.

**No usable licensed asset exists.** Wikimedia Commons has none, confirmed by two independent searches. US Navy body composition documents are federal and public domain but contain only numeric tables, no silhouettes. The one near-miss is the Pulvers silhouette showcard reproduced as Figure 1 in Reese et al. 2022, *PLOS Global Public Health*, CC BY 4.0, DOI `10.1371/journal.pgph.0000127`. It fails twice: it is an ordinal BMI and body-size scale, not a body-fat-percentage scale, and its CC BY status rests on permission paperwork from a 2004 non-open Wiley journal that cannot be independently verified. The chart you linked is a content-farm image with no licence statement and cannot be used.

**Lay visual self-estimation of body fat is poor, and biased in the direction that matters.** The CRONICAS cohort found kappa 0.20 to 0.31 agreement against measured adiposity, with roughly half of people underestimating, and the underestimation worst among exactly the users the tool would be aimed at. Trained raters do better, around 2.3 to 2.4 % total error, but still disagree with each other by 2.7 percentage points, and a user eyeballing a chart is not a trained rater.

That matters here because body fat is not decorative. It selects the RMR equation and the protein rule (B13). A biased low estimate inflates fat-free mass, inflates Cunningham RMR, and inflates the protein target, all silently.

**Recommending: drop the visual estimator.** Keep the two paths that produce a real measurement, and let the tape method carry its SEE on the face. If you still want a visual aid after reading this, it must be labelled as a rough orientation that does not feed the engine, and the number it produces must not populate the field.

### B28. The protein advice you drafted is contradicted by the evidence (C1.13.6)

Your line is "For protein powder: aim for Isolate/Concentrate/Peptide". The evidence says the choice between those three does not matter. Castro et al. 2019, *Nutrients*, DOI `10.3390/nu11092047`: no clinically meaningful difference in hypertrophy or fat-free mass between whey concentrate, isolate and hydrolysate. What actually differs is lactose content and price.

What the evidence does support, and what the screen should say instead:

- **Total daily protein is what matters.** Gains plateau at 1.62 g/kg/day (Morton 2018, DOI `10.1136/bjsports-2017-097608`). The app already computes the user's own range.
- **Per meal, about 0.4 g/kg**, roughly 20 to 40 g, across at least four meals (Schoenfeld and Aragon 2018, DOI `10.1186/s12970-018-0215-1`). 40 g produced about 20 % higher myofibrillar synthesis than 20 g after resistance exercise (Macnaughton 2016, DOI `10.14814/phy2.12893`).
- **Powder is convenience, not necessity.** The ISSN position stand says whole food can meet the requirement (DOI `10.1186/s12970-017-0177-8`).
- **The anabolic window is not supported** once daily total is controlled (Schoenfeld, Aragon and Krieger 2013, DOI `10.1186/1550-2783-10-53`).
- **Third-party testing is the recommendation worth making.** 14.8 % of 634 supplements across 13 countries carried undeclared anabolic steroids (Geyer 2004, DOI `10.1055/s-2004-819955`); 35 % of 200 Australian online-marketplace products carried WADA-banned substances (Barker 2025, DOI `10.1002/dta.3893`). Note that the pass rate of the certification programmes themselves could not be verified against a peer-reviewed source, only against certifier marketing, so the screen recommends certification without quoting a number.
- **Kidney caution belongs only where evidence puts it.** No GFR difference across 1,358 participants on high versus normal protein in healthy adults (Devries 2018, DOI `10.1093/jn/nxy197`). Existing chronic kidney disease is the real caution: KDOQI 2020 restricts to 0.55 to 0.60 g/kg/day (DOI `10.1053/j.ajkd.2020.05.006`).

Plant protein is worth one line: soy matches whey, and a leucine-matched multi-source blend matches milk protein (Pinckaers 2022, DOI `10.1093/jn/nxac222`).


### B29. The caffeine advice is sound except for the last clause (C1.13.4)

You drafted: "Coffee: This much mg/daily. I reccomend iced coffee before the workout but do not do milk and sugar".

The dose and the timing hold. The milk and sugar clause does not.

- **Dose: 3 to 6 mg/kg body mass**, Guest et al. 2021 ISSN position stand, DOI `10.1186/s12970-020-00383-4`. As low as 2 mg/kg may be effective; at or above 9 mg/kg side effects rise with no further benefit. For resistance training specifically the effective floor is lower still, 0.9 to 2 mg/kg (Grgic 2022, DOI `10.1016/j.nut.2022.111604`).
- **This should be computed, not stated as a constant.** The app already personalises creatine by body mass and has the mass on hand. A 70 kg user gets 210 to 420 mg; the screen should say their number, not "this much".
- **Timing: about 60 minutes before exercise**, which is the position stand's stated window rather than a precise figure.
- **Coffee works as well as a capsule** at a matched 5 mg/kg dose, at least for endurance (Hodgson 2013, DOI `10.1371/journal.pone.0059561`). So "iced coffee" is fine advice.
- **Milk and sugar: no evidence.** The research found nothing supporting the claim that either blunts the ergogenic effect, and labelled it folklore. Under the project's own data-integrity rule it cannot ship as advice. Drop the clause, or restate it as a personal preference in as many words.
- **Ceiling and cautions must appear.** EFSA: 200 mg is a safe single dose and 400 mg/day a safe daily total for healthy adults, DOI `10.2903/j.efsa.2015.4102`. Pregnancy: under 200 to 300 mg/day. Adolescents: EFSA caps at 3 mg/kg/day and the AAP discourages use entirely. These matter because the recommended dose and the safe single dose collide for a heavy user: 6 mg/kg at 90 kg is 540 mg, well over EFSA's single-dose figure. The screen must cap what it recommends.
- One honest gap: habituation evidence is mixed. A 2025 study found habitual use reduces the effect, more so in trained lifters (DOI `10.1177/19417381251315093`), while the position stand calls the evidence mixed. Say that rather than pick a side.


<!-- decision: dumbbell-bands-not-increments | status: adopted | supersedes: none -->
### B30. A dumbbell range and a dumbbell increment are different quantities (Q10, C1.09.18, C1.09.21)

Your clarification settles the microplate question: `hasMicroPlates` and `microPlateStep` go, and nothing else goes with them. And the reasoning behind the bands is right. Nobody owns a 20 lb pair and a 70 lb pair and nothing between, so a range describes a home rack far better than a point value.

One distinction to name, because the two are easy to conflate and the generator reads only one of them.

- A **range** is inventory: which dumbbells exist, from lightest to heaviest. "5 to 20 lb" is a range. It bounds what can be prescribed.
- An **increment** is granularity: the gap between one pair and the next inside that range. `DEFAULT_DUMBBELL_STEP` is 5 kg or 10 lb per pair. It is what `generator.ts` rounds a progression to.

Bands answer the first and say nothing about the second. A 5 to 20 lb band could be four pairs at 5 lb steps or seven pairs at 2.5 lb steps, and the prescribed load differs.

**Proposing:** collect the bands as you describe, multi-select, three of them. Derive the increment from the band rather than asking for it, since a home rack in a given band has a conventional spacing, and expose the derived value in Settings for the minority who need to correct it. The same treatment suits the barbell and stack steps, which already have sensible defaults in `src/domain/types.ts` and which no user setting up for the first time can answer meaningfully.

That empties three fields out of the setup step, which is the direction you wanted the page to move, and the generator still gets every number it reads.

One observation, not a request for a decision. Multi-select permits a non-contiguous inventory, 5 to 20 plus 40 to 60 with nothing between, which is the case you called unrealistic. I would leave it permitted rather than enforce contiguity: buying a light pair and a heavy pair and skipping the middle is uncommon but real, and an enforced rule would lock those users out of describing what they own.


<!-- decision: visual-bodyfat-tracked-not-engine-feeding | status: adopted | supersedes: none -->
### B31. The visual estimate ships, and it does not select the RMR equation (Q2, answered 2026-09-04)

You said we can draw the asset ourselves, and that half a population underestimating beats most of them skipping the field. The first point closes the licensing objection outright: an original illustration set is consistent with the existing mascot provenance and B27's licensing problem disappears.

The second point rests on a premise that is not right, and the correction matters more than the disagreement.

**Skipping does not produce nothing.** With `bodyFatPct` null the engine does not go silent, it changes equations. RMR falls back from Cunningham to Mifflin-St Jeor, which Frankenfield 2013 (DOI `10.1016/j.clnu.2013.03.022`, n=337) found accurate in 82 % of cases and unbiased at a 95 % CI of -26 to +8 kcal/day. Protein on a fat-loss goal falls back from Helms to Jaeger. Both fallbacks are validated. So the choice is not between a number and a void; it is between a biased number and a different validated number.

**The sensitivity, as arithmetic on the equation rather than as an opinion.** Cunningham is `370 + 21.6 * FFM`, so an error in body fat propagates at 21.6 kcal/day per kg of fat-free mass. For an 80 kg person a 7-point underestimate, well inside what kappa 0.20 to 0.31 implies, misplaces fat-free mass by 5.6 kg and RMR by about 121 kcal/day. At the moderate PAL band and a fat-loss cut that is roughly 185 kcal/day on the target the user actually sees, in the direction of eating more than intended.

**And the reason to prefer Cunningham is the accuracy of its input.** The engine prefers it because fat-free mass explains 65 to 90 % of resting energy variation (Thompson and Manore 1996, DOI `10.1016/S0002-8223(96)00010-7`). Feed it a visually estimated fat-free mass and the equation's form survives but the reason for choosing it does not. Whether it still beats Mifflin-St Jeor at that point is unknown, and no study answers it.

**So both things you want are available at once.** The chart ships. It teaches people what 15 % and 25 % look like, which is real value and is the good start you are after. What it must not do is silently displace a validated equation.

`Profile.body.baselineBodyFatPct` gains a provenance tag: `measured`, `tape` or `visual`.

- `measured` and `tape` select Cunningham, as today.
- `visual` does not. The number is stored, shown, charted and tracked over time; the energy target stays on Mifflin-St Jeor until a real measurement replaces it.
- The screen says which one is in use and what would change it, so the fallback is visible rather than silent.

This is the same rule `src/domain/bodyfat.ts:24` already applies one tier up, in capitals: use the tape figure to track change over time, never as an absolute number. A visual estimate earns that treatment more, not less.

It also gives the user a reason to upgrade. A tape measure costs almost nothing and moves them from kappa 0.2 to an SEE of 3.5 percentage points, and the screen can say so at the moment they are looking at their own number.


## Part B2. Findings added after peer review, 2026-09-04

A hostile review of this plan found eleven claims with no ledger row, four false statements about the code, ten requests accepted that should have been challenged, and thirteen task defects. The false statements are corrected in place above and marked CORRECTED. What follows is what was missing.

### B32. The intro carries three claims the repository does not support (C1.01.7, C1.01.9, and two unledgered)

B4 caught two absent features and missed three assertions of fact in the same slide deck.

1. **"Be open-source and free to use."** There is no `LICENSE` or `LICENCE` file in the repository, `package.json:3` sets `"private": true`, and there is no `license` field. `README.md:132-138` licenses the icons, the mascots and the fonts, and says nothing about the project. So the app is source-visible, not open-source: without a licence, default copyright applies and nobody may legally reuse it. The intro would state this to every tester, and B7 compounds it by putting "the licence" in the footer where none exists. **Add a licence file before the intro ships, or change the sentence.** Choosing the licence is yours; MIT matches how the project already treats its own assets.
2. **"150$ per session to get a personal trainer."** A price claim with no source, printed to users, in a project whose own rule is that no number ships without a verified citation. Either source it or write it as your own experience rather than as a figure.
3. **"*insert puke emoji*"** is an instruction to place an emoji. R6 forbids emoji in the copy tables and `scripts/check-no-emoji.mjs` scans the tree. The literal text passes both, since it contains no emoji code point, so it can ship as written. The gap is that the gate would not catch a real emoji here either: its pathspec is `src/content/copy*.ts` and `src/**/*.tsx` (`scripts/check-no-emoji.mjs:36`), and `introSlides.ts` matches neither. See B36.

### B33. "Remove Enter a number" would delete every required-field message in the app (C1.08.10)

C1.08.10 narrowed your three targets to one. The other two are real strings with consequences.

- `error.valueRequired` = `Enter a number.` (`src/content/copy.ts:706`) is reached from ten call sites: `SetupWizard.tsx:404,424,447,463,478,592,608,712` and `SettingsView.tsx:179,264`. Removing it strips the required-field error from the whole wizard and from Settings. What you actually want is for it to stop appearing as standing helper text under a field that has not been touched, which is a rendering change, not a deletion.
- `advice.tapeMethod` = `US Navy circumference method. Girths in cm, tape level and snug.` (`src/content/copy.ts:607`) is the copy half of the C1.08.8 unit defect: it hard-states cm regardless of the unit system. Task 3 must edit it, and its original file list did not.

### B34. "Explanatory text goes below what it explains" is a principle, and it applies in thirteen places (C1.08.1)

You stated it as a general rule and I scoped it to one control. There are thirteen `disclosure.why` sites: `ReadinessScreen.tsx:49`, `SetupWizard.tsx:1196,1310,1698`, `SettingsView.tsx:447`, `LogView.tsx:179`, `TargetsView.tsx:168`, `PlanView.tsx:307`, `HydrationBanner.tsx:96`, `BodyMassQuickLog.tsx:102`, `MigrationWizard.tsx:355`, `MotivationSettings.tsx:258`, `ExerciseCard.tsx:239`. One goes with the readiness screen. The other twelve are in scope for the principle, and Task 27 sweeps them.

### B35. Three colour instructions collide with a recorded contrast decision (C1.07.15, C1.07.9, C1.11.3)

This is the failure the round was called in to fix, repeated three times in the requests, and my first pass accepted all three.

1. **"A horizontal lime (match accent) divider."** Under limelight, lime **is the background**: `--bg: var(--lime)` (`src/ui/styles/tokens.css:109`), and the accent is pink, `--accent: var(--pink)` (line 123). A lime divider on a lime ground is invisible, which is the same defect as the topbar you reported in C1.03.1. Your parenthetical is the right instruction and the colour name is the wrong one. **Building it as the accent, which is pink.**
2. **"You click on the icon and it becomes darker and selected."** Darker-on-dark is invisible on the board skin, whose ground is `#141517`. Selection needs a skin-independent affordance: a border, a fill inversion, or a check, not a brightness shift.
3. **"Pastel red, pastel orange, pastel green" on the feasibility calendar.** Two problems. Colour alone as the carrier of meaning is a WCAG 1.4.1 failure, so the three bands need a label or a pattern as well as a hue. And `src/ui/styles/tokens.css:122-127` records the decision this would reverse, verbatim: "State colours are ink, not hues. Section 2.3 computed a ratio for five colours on this ground and for no others; an amber or a red invented here would ship an unmeasured contrast." Three new pastels are three unmeasured contrasts. Plan 13 must either measure them against every skin ground or express the three bands in the ink the skin already has.

### B36. The R10 exemption has to be granted before three new modules can claim it (Tasks 4, 13, 23)

The copy contract enumerates its exempt modules as a closed list: "None of them lives in a copy table: they are `src/content/formCues.ts`, `src/content/specimenCards.ts` and that runbook" (`docs/design/2026-09-01-copy-contract.md:89-90`). Tasks 4, 13 and 23 create `introSlides.ts`, `sexRationale.ts` and `supplementGuidance.ts` and each assumes the exemption applies. It does not yet.

Two things follow, and both are Task 28. The contract document is amended to name the three new modules, as an R10 amendment with a decision header. And each gets a contract test, because the precedent gives every exempt module one: `formCues.test.ts` bans em and en dashes (line 130) and medication and stimulant strings (line 108); `specimenCards.test.ts` enforces ASCII-only, no dashes, and DOI validity. Without both, three modules of long-form user-facing prose ship entirely ungated, and `check-no-emoji.mjs` does not scan them either.

### B37. The walk-minutes question needs a coefficient the project does not have (C1.09.17)

B19 argued about double-counting. The prior problem is that there is nothing to double-count: `grep -nE 'MET|metabolic equivalent|aerobic' src/domain/**/*.ts` returns nothing outside tests. Turning walk minutes into energy requires a MET value, and the content review supplies none. Under this project's own rule that is a coefficient that cannot ship.

So Q4's real choice is narrower than I wrote it. Either the walk informs which FAO band the user picks, which costs nothing and needs no coefficient, or someone sources and verifies a MET value for walking and the review corpus grows. The first is the default and I recommend it.

### B38. This round removes a medical screen and adds personalised drug dosing, and that trade was never put to you

Stated once, plainly, because it is the judgement of the round and it was buried across B24, B28 and B29.

You are deleting a pre-participation questionnaire modelled on the PAR-Q+ on the grounds that "I am not an Urgent Care and I am not doing medical questionnaires". In the same step you are adding a screen that computes a per-user creatine dose from body mass, a per-user caffeine dose in mg/kg, and protein targets, with your drafted copy saying of creatine "you have nothing to worry about".

The net effect moves the app toward medical advice, not away from it. A questionnaire asks; a dose tells. And "you have nothing to worry about" is an unqualified safety claim replacing a screen whose entire function was to find the people for whom that is untrue.

That does not make it wrong. It is your app, your risk, and the disclaimer in C1.02.2 is a reasonable answer. But it should be a decision you took knowingly, so: Q11.

What I will do unless you say otherwise: keep the doses, since they are well sourced; drop "you have nothing to worry about" for a statement of what the evidence actually shows; and carry the contraindications the research returned, which are short and specific rather than a wall of hedging.

### B39. Renaming only the default table changes nothing you can see (C1.05.2)

You test in limelight, and you quoted the button back to me as "Go on now" in w1.08. That is the limelight override: `copy.limelight.ts:109` sets `button.continue` to `go on`, and the board sets `PROCEED` (`copy.board.ts:110`). Renaming the default table to "Next" leaves your screen reading "go on".

So the question underneath C1.05.2 is a register question, not a rename: does limelight's deliberately lower-case, informal voice take "Next" and "Previous", or does it keep its own words? Answering "rename the default only" delivers you nothing. Task 8 changes all three tables or the change is invisible to the person who asked for it.

### B40. Dumbbell bands need a unit (C1.09.18)

"Dumbells: 5-20 lbs/kgs" leaves the unit open, and 5 to 20 lb and 5 to 20 kg are different racks. This is the same class of ambiguity as the C1.08.8 defect this round just found. The bands take the unit system chosen at step 1, like every other quantity.


<!-- decision: bodyfat-visual-first-none-last | status: adopted | supersedes: none -->
### B41. The body-fat control, as settled (Q1, answered 2026-09-04)

Three options survive, reordered so the easiest route is the one people land on:

1. **Percentage, default and pre-selected.** A number box with "Click here to estimate" above it, opening the visual chart from B31.
2. **Body measurements.** The tape flow, with the site diagram from Task 17.
3. **Not measured.** Last, still reachable, still meaningful: it routes to Mifflin-St Jeor and the Jaeger protein rule, both validated.

This also dissolves the radio-group problem the review raised. `bodyFatMode` stays a three-member radio, so there is no unreachable state and no method silently pre-selected that the user never chose; the default is simply the one most people can answer.

**Provenance follows the control that produced the number**, which is what makes B31 enforceable without asking anyone an extra question:

- the estimator popup writes `visual`
- the tape flow writes `tape`
- a number typed straight into the box writes `measured`

`visual` does not select Cunningham. The other two do. The field shows which is in force and what would change it.

<!-- decision: intro-animation-not-character | status: adopted | supersedes: none -->
### B42. The requirement is animation, not that character (Q5, answered 2026-09-04)

Corrected understanding. B5 read the SpongeBob line as a request for a mascot and argued licensing at it. That was the wrong target. The stated intent is to keep the app from reading as corporate and sterile, and to keep the promise that this is meant to be fun. The character was one idea for it, not the requirement.

So the licensing question disappears with the character, and what Task 4 owes is motion and personality.

The app already has a motion vocabulary to build in rather than inventing one: `src/ui/components/AsciiBar.tsx`, `src/ui/styles/crt.css`, `src/ui/components/PhaseTransition.tsx`, `src/ui/components/Spotlight.tsx`, `src/ui/components/KonamiOverlay.tsx`.

Proposed for the intro, all original: the typewriter reveal you asked for, a per-bullet fade, an animated ASCII figure at the foot of the slides, and the tl;dr arriving with weight rather than strobing. Every one of them branches on `prefers-reduced-motion`, which this codebase already does everywhere.

The specific figure is open. Revise it when you see it.


<!-- decision: setup-grouped-by-question-type | status: adopted | supersedes: none -->
### B43. Step 4 keeps availability, and the split is semantic (Q9, answered 2026-09-04)

I proposed moving availability out to sit with the goal. Rejected, and the reasoning is better than mine: the two pages ask different **kinds** of question.

- **"What can you provide."** Equipment, gear inventory, everyday activity, gym comfort, and the days and times you can train. Time is a resource you bring, exactly as a squat rack is.
- **"What do you want, and by when."** The goal and its target date.

So step 4 is named **Equipment & Availability**, as C1.09.1 originally said, and C1.10.8's reordering is satisfied a different way than I had it.

**The dependency you cared about still holds, and holds better.** In w1.10 you wanted the target date to come after training frequency, so an unrealistic date could be caught. Under this split availability is settled in step 4 and the target date is picked in step 5, so the feasibility calendar has everything it needs when it renders. My version reached the same place in three steps; this reaches it in two.

Consequence for plan 13: the goal page carries the goal **and** the target date together, rather than splitting them across two steps. Update its task list accordingly.

<!-- decision: intro-motion-fade-and-typewriter | status: adopted | supersedes: none -->
### B44. The intro's motion vocabulary is fade and typewriter (Q6, answered 2026-09-04)

No flashing was ever intended. The word in the feedback meant "give this sentence some animation".

Two techniques, used throughout the intro:

- **Fade in and fade out**, per bullet and between slides.
- **Typewriter**, one character at a time, which C1.01.5 already asked for on the first slide.

The tl;dr gets the same treatment rather than a strobe, so the WCAG 2.3.1 concern in B6 is moot: neither technique flashes. B6's second half stands unchanged, since the disclaimer still belongs in the footer where it can be found again.

Both branch on `prefers-reduced-motion`, which prints the slide whole.


<!-- decision: bodyfat-write-once-gap | status: adopted | supersedes: none -->
### B45. The girth fix propagates everywhere automatically, and repairs nothing already stored

The owner asked whether the round's changes reach every page that uses those numbers. Traced, and the answer has two halves.

**Downstream is entirely derived, so the fix propagates on its own.** The chain is:

    SetupWizard tape estimate
      -> Profile.body.baselineBodyFatPct            (SetupWizard.tsx:930)
      -> nutritionInputFor                          (selectors.ts:124)
      -> computeTargets, at two call sites          (selectors.ts:202, export/summary.ts:143)
      -> TargetsView, LogView, and the text export

`TargetsView.tsx:63` states the property in as many words: "Every number here is DERIVED, never stored". Nothing caches an RMR, a protein range or a fluid target, so a corrected body-fat percentage changes every screen at the next render with no migration and no recomputation step.

**But the stored number itself is write-once, and there is no way to change it.** `Profile.body.baselineBodyFatPct` has exactly one writer outside test fixtures, `SetupWizard.tsx:930`. The fallback in `selectors.ts:124` is `latest?.bodyFatPct ?? baseline`, and the only UI that writes a `BodyMassEntry` is `BodyMassQuickLog.tsx:59`, which hard-codes `bodyFatPct: null`. The store action and the schema both accept a value; no screen ever supplies one.

Three consequences:

1. **Anyone who completed setup in imperial before this fix has a wrong body-fat percentage stored, and no way to correct it** short of wiping and starting again. In an alpha with one tester that is cheap; it is still the honest state.
2. Body composition cannot be re-measured as it changes, which is the one number in the profile most expected to move. The content review's own instruction, quoted at `selectors.ts:110`, is to recompute at each re-measure. Body mass can be re-measured. Body fat cannot.
3. Export carries the stale figure (`export/summary.ts:132`), so a backup preserves it.

That is a gap the round-1 feedback did not name and the defect exposed. Task 31.

---

## Part C. Decisions blocking work

Ten questions. Each names the task it blocks and what I will do if you say nothing.

| Q | Question | Blocks | Default if unanswered |
| --- | --- | --- | --- |
| Q1 | CLOSED 2026-09-04: keep "Not measured" as the last option; the percentage entry with the visual estimator becomes first and default. See B41 | Task 16 | Done |
| Q2 | ANSWERED 2026-09-04: we draw the asset ourselves and the chart ships. It stores and tracks a number but does not select the RMR equation. See B31 | Task 16, 17 | Proceeding as B31 sets out |
| Q3 | RESOLVED BY EVIDENCE, not open. No equation is validated in this population and no threshold has support; van Velzen 2020 argues against any fixed timeline. Confirm you accept the replacement segment in B10 | Task 13 | Proceed as B10 sets out |
| Q4 | The gym walk. Narrower than first written: there is no MET coefficient in the project and the review corpus supplies none, so an energy term cannot be built without new sourced evidence. Walk informs the band, or someone sources a MET value? See B37 | Plan 12 | It informs the band. No second energy term, no new coefficient |
| Q5 | CLOSED 2026-09-04: minigames confirmed in scope (plan 15). The character was never a mascot; the requirement is animation and personality, not that figure. See B42 | Task 4 | Done |
| Q6 | CLOSED 2026-09-04: no flashing was intended. The vocabulary is fade in, fade out and typewriter. See B44 | Task 4 | Done |
| Q7 | Close control at the upper left. CORRECTED: there is no house convention to break. `ModalShell.tsx:136-157` renders no close control at all, and its four consumers already differ | Task 13 | Upper left as you asked. My original objection appealed to a consistency that does not exist |
| Q8 | CLOSED 2026-09-04: one decimal place, kg and lb | Task 15 | Done |
| Q9 | CLOSED 2026-09-04: step 4 keeps availability and is named "Equipment & Availability". Grouped by what the question asks, not by what the engine reads. See B43 | Plan 12, 13 | Done |
| Q11 | CLOSED 2026-09-04: both halves proceed. Owner's reasoning: the app is for him and his friends, he is not signing anyone up, and a screening gate before fitness advice is friction without value. Raised once, reaffirmed, settled. Not to be re-raised | Task 22, 23 | Done |
| Q12 | CLOSED 2026-09-04: MIT | Task 29 | Done |
| Q13 | CLOSED 2026-09-04: keep. It is an abbreviation, not an explicit name | Task 4 | Done |
| Q10 | ANSWERED 2026-09-04: remove the microplate option only, and replace the dumbbell question with multi-select inventory bands. See B30 for the range-versus-increment distinction that remains | Plan 12 | Bands are collected; increments are derived from the band and move to Settings |

---

## Part D. Tasks

Tasks 1 to 25 land in this plan. Plans 12 to 14 are separate documents, written once Part C is answered.

**Order.** Tasks 1 to 3 are the defects and come first: they are what the round has already proven wrong. Tasks 4 to 7 are the shell and the intro. Tasks 8 to 19 walk the wizard in step order. Tasks 20 to 25 close the round.

### Group 1 — defects found by this round

**Task 1: DONE 2026-09-04. Synthetic alpha fixture (C0.2)**
- Create: `scripts/alpha-fixture.mjs`, `src/domain/fixtures/alphaDemo.ts`
- Produces: a `fti.v3` document reachable from Settings that covers a missed week, a completed block, a deload block in progress, legacy v2 data pending import, all seven reminder states, all three Atlas rarities, and a body-fat estimate in its null branch.
- Verification: load the fixture, then walk the steps w2 to w6 mark skippable and confirm each renders. The count of skippable steps that become reachable is the measure: 22 of the 89 are currently marked skippable.
- Note: the fixture must carry no personal-data identifier, or the CI grep fails.

**Task 2: DONE 2026-09-04. The limelight topbar is invisible (C1.03.1)**
- Modify: `src/app/App.tsx:483-494`, and whichever of `src/app/appShell.css` or `src/ui/components/limelight.css` owns the token.
- Root cause, confirmed: `.topbar` hard-codes `background: rgba(10,11,12,0.92)` (`src/app/appShell.css:10`) while limelight sets `--text: #000000` and `--text-2: #454545` (`src/ui/styles/tokens.css:101-118`). Black type on near-black ground, with `--text-2` marginally more legible, which is exactly what you saw.
- CORRECTED verification. The first version asked for a computed-contrast assertion in the test suite. That cannot be written here: vitest runs `environment: 'jsdom'` (`vitest.config.ts:8`), there is no browser runner, and jsdom returns CSS variables unresolved and every box at zero height. The real check is a **token-level unit test plus a manual device check**: assert in a test that `.topbar` takes its background from a skin token rather than a literal, and record the manual pass on iPhone and Android in `docs/phone-visual-check.md`, which already exists for this purpose.

**Task 3: DONE 2026-09-04. Girth inputs ignore the unit system (C1.08.8, B14)**
- Modify: `src/ui/setup/SetupWizard.tsx` (`Draft.neck`, `Draft.waist`, `Draft.hip` at lines 256-258, and `girthError` at line 473), and `src/content/copy.ts:607`, where `advice.tapeMethod` hard-states "Girths in cm" regardless of unit system and carries the same bug in words.
- The three fields join the `UnitInput` path that mass and height already use. Entry accepts cm or inches by unit system; the value converts to cm before `estimateBodyFatNavy`. The metric equation stays the only implemented form.
- Test: an imperial user entering a 15 in neck and a 34 in waist produces the same body-fat estimate as a metric user entering 38.1 cm and 86.36 cm. Both conversions are exact (15 x 2.54 = 38.1, 34 x 2.54 = 86.36), so assert exact equality with no epsilon. This test fails today.

### Group 2 — intro and shell

**Task 4: The intro sequence (C1.01.x, C1.02.2 to C1.02.4)**
- Create: `src/content/introSlides.ts`, `src/ui/intro/IntroSequence.tsx`, `src/ui/intro/intro.css`
- Modify: `src/domain/types.ts` for the `UiPrefs.introSeen: boolean` field; `src/domain/schema.ts:492` for `UiPrefsSchema` and `src/domain/schema.ts:692-707` for the seeded defaults object, because `types.ts` contains no Zod. Note `bootSeen` at `schema.ts:493` carries no default, so `introSeen` must be given one explicitly or an existing document has no value for it. Then `src/app/App.tsx` to gate the sequence.
- The slide text is long-form prose and does not go in a copy table. It goes in `introSlides.ts`, following the `formCues.ts` and `specimenCards.ts` precedent, which R10 exempts from R1 to R4 and R9 but not from R5, R6 or R11.
- Typewriter and fade are CSS, with a `prefers-reduced-motion` branch that prints the slide whole. A Skip control on every slide, matching `button.skipBoot`.
- Blocked on Q5 and Q6.

**Task 5: Group the wizard steps under three headings (C1.02.5, C1.02.6)**
- Modify: `src/ui/setup/SetupWizard.tsx`, the `STEPS` array at line 81 and `STEP_TITLE_KEY` at line 107.
- Add a `STEP_GROUP: Record<StepId, GroupId>` map and three group title keys. The step counter reads the array, so nothing is renumbered by hand.
- Group 3 holds step 4 (Equipment & Availability) and step 5 (Fitness Goal), per B43. Still runs after plans 12 and 13 settle the contents of those two steps, so sequence it last within its group.

**Task 6: Topbar becomes a marquee carrying the page instruction (C1.03.2 to C1.03.4)**
- Modify: `src/app/App.tsx`, `src/ui/nav/views.ts`
- Reuse `src/ui/components/Marquee.tsx`. It already handles the pause latch, the aria-hidden duplicate track and the reduced-motion first-item rule.
- One new copy key per view and per wizard step, holding the instruction sentence. Upper case is applied in CSS as a skin register, never baked into the key, or R12's case argument is violated.
- `shell.status.loaded` moves to the footer in Task 7.
- `MarqueeItem` requires `{ icon: LimelightIconName, text: string }` (`src/ui/components/Marquee.tsx:15-18`), so each instruction needs an icon as well as a key. Task 20 registers them.
- `SessionIndicator` currently sits in the topbar between the brand and the status (`App.tsx:483-494`) and is described in-file as visible from every view. The redesign displaces it. Decide where it goes before writing this task; it is a shipped P3 feature and must not be dropped silently.
- Note: `Marquee` renders nothing under the clinical skin by design. The topbar must degrade to a static instruction line there, not vanish.

**Task 7: The footer (C1.03.5, B6, B7)**
- Create: `src/ui/components/SiteFooter.tsx`, and the ambient type declaration for the injected globals.
- Modify: `vite.config.ts`, which today has no `define` block. `grep -E 'APP_VERSION|__BUILD' src/` returns nothing, so the version and commit constants must be created, not merely read.
- The GitHub URL, the version and the build commit are build constants injected by `vite.config.ts`, never copy strings: `copy.test.ts` asserts that no copy string contains a URL.
- Carries: author, repository link, version, build commit, last-updated date, the one-line data statement, and the plain-words disclaimer. The licence line waits on Q12: there is no licence to name today.

### Group 3 — the wizard, in step order

**Task 8: Units step copy and nav labels (C1.04.2, C1.05.2)**
- Modify: `src/content/copy.ts`, `src/content/copy.limelight.ts`, `src/content/copy.board.ts`, `src/content/copy.test.ts`
- The replacement text is two sentences and exceeds R3's twelve words as one advice key. Split it: a label key for "Units on the weight plates", an advice key for the rest.
- Before renaming `button.back` and `button.continue`, grep every call site (B8). If the migration wizard or a modal shares them, create wizard-specific keys instead.
- `copy.test.ts` pins several strings byte for byte. Any pinned string changed here updates its assertion in the same commit.

**Task 9: Units become changeable from Settings (C1.04.3)**
- Modify: `src/ui/views/SettingsView.tsx`, `src/store/index.ts`
- The toggle writes `Profile.units` and nothing else. No stored number is touched, because none is stored in display units (B1).
- Test: log a set at 100 lb, switch to metric, confirm the stored `loadKg` is unchanged at 45.359237 and the display reads 45.4 kg; switch back and confirm 100 lb.

**Task 10: Timezone select (C1.06.1 to C1.06.3)**
- Modify: `src/ui/setup/SetupWizard.tsx:514`
- The `Intl.supportedValuesOf('timeZone')` call already exists and already falls back to a plain text field when the API is missing or throws. Keep both branches.
- Labels show the current UTC offset and the zone id. The offset must be computed for today's date, not stored: offsets move with daylight saving, and `src/domain/export/fixtures/athens-dst-week.ics` exists because that has already bitten this project once.
- Your label sketch says "GMT+2 UTC+2 and the city". GMT+2 and UTC+2 are the same offset written twice. Use one.

**Task 11: Body page layout (C1.07.1 to C1.07.4, C1.07.18, C1.07.19)**
- Modify: `src/ui/setup/SetupWizard.tsx`, `src/ui/setup/setup.css`
- Two-column rows, two bordered boxes: age with sex, then body mass with height.
- Delete the equation helper from under the name field. It is wrong there: `displayName` reaches no equation.
- CORRECTED verification. jsdom performs no layout and evaluates no media query (`vitest.config.ts:33` says so). A viewport assertion is not writable in this stack. The check is a manual pass at 390 x 844 recorded in `docs/phone-visual-check.md`, plus a unit test that the step renders the expected number of two-column rows.

**Task 12: The equation citation list (C1.07.5)**
- Modify: `src/ui/setup/SetupWizard.tsx`
- Footnote markers on the fields, resolving to a list at the foot of the body box. Every entry already exists in the source comments with a verified DOI: Mifflin-St Jeor 1990 `10.1093/ajcn/51.2.241`; Cunningham 1991 `10.1093/ajcn/54.6.963`; Hodgdon and Beckett 1984 `10.21236/ada143890` and `10.21236/ada146456`; IOM 2005 `10.17226/10925`; FAO/WHO/UNU 2004, no DOI, and the list must say so rather than omit the row.
- Reference text is R10-exempt from the length rules and lives outside the copy tables.

**Task 13: The sex field and its disclosure (C1.07.6, C1.07.8 to C1.07.16)**
- Create: `src/ui/setup/SexRationaleModal.tsx`, `src/content/sexRationale.ts`
- Modify: `src/ui/setup/SetupWizard.tsx`
- The label names all three consumers, not RMR alone (B2).
- Segment one: what the field does, the two equations in inline MathML with the sex term in its own styled element, the verified DOIs, and the worked example. Use 166 kcal/day at RMR and roughly 280 kcal/day at the moderate band, which is the number the app will actually show (B3). Verify the banana figure against USDA FoodData Central or drop the comparison.
- Segment two: the hormone-therapy guidance, blocked on Q3 and on the running research.
- Blocked on Q3 and Q7.

**Task 14: Age replaces birth year (C1.07.17, B11)**
- Modify: `src/ui/setup/SetupWizard.tsx`, `Draft.birthYear` becomes `Draft.ageYears`
- `Profile.body.birthYear` is unchanged in the schema. Confirm derives it; every read recomputes age from the current date.
- Test: a profile created in 2026 with age 30 computes age 32 when the clock is faked to 2028. This is the test that fails if anyone later stores age directly.

**Task 15: Height and mass entry (C1.07.20 to C1.07.22)**
- Modify: `src/ui/setup/SetupWizard.tsx`, `src/ui/components/UnitInput.tsx`
- Height becomes two integer inputs: feet and inches, or metres and centimetres. Reject any non-integer, any unit character, any prime mark. Bound inches to 0 to 11 and centimetres to 0 to 99, or the two fields can express the same stature twice.
- `requiredIntegerInRange` at `SetupWizard.tsx:416` already exists for this.
- Body mass precision blocked on Q8.

**Task 16: Body-fat control (C1.08.1 to C1.08.7)**
- Modify: `src/ui/setup/SetupWizard.tsx`
- "why?" and "Optional" move below the control. Options reduce to two. The percentage box gains an estimate affordance.
- Blocked on Q1 and Q2.

**Task 17: Measurement site diagram (C1.08.9, C1.08.10, B15)**
- Create: two SVG assets and their provenance entry.
- The diagram replaces the site prose on the face. A caption carries the same fact in text for screen readers, and the full definition moves behind the `why?` disclosure.
- Generated through `agy`, per the `image-generation` skill. Prompts are registered in Task 20.

**Task 18: Verify the body-fat page arithmetic (C1.08.11)**
- Modify: `src/ui/setup/SetupWizard.tsx`, `src/ui/setup/SetupWizard.test.tsx`
- One trap is already known and must be covered: `estimateBodyFatNavy` returns null for a lean man as a routine outcome, not an error. `src/domain/bodyfat.ts:140` works the threshold: a 180 cm man with a 40 cm neck and a waist under about 69.7 cm gets null. The UI must say the model has left its domain, not "measurement failed", and must never clamp to zero.
- The Navy SEE must appear beside any figure shown: 3.52 percentage points for men, 3.72 for women. It is larger than most changes a user will chase.

**Task 19: Failed-validation cue (C1.08.12)**
- Modify: `src/ui/setup/SetupWizard.tsx`
- Primary cue: focus the first invalid field, `scrollIntoView`, and a short CSS shake. This works on every platform.
- Haptic: reuse the existing `vibrate()` wrapper in `src/ui/audio/chime.ts:173`, which already guards for absence. It is an Android-only additive and never the sole cue, because `navigator.vibrate` is not implemented in Safari on iOS or iPadOS at any version.
- The shake respects `prefers-reduced-motion`.

### Group 4 — closing the round

**Task 20: The icon register (C1.09.9, C1.09.13, C1.08.9)**
- Create: `docs/design/2026-09-04-icon-register.csv`
- Columns: icon id, the screen and control it appears on, what it must depict, the 5 to 8 word generation prompt, style constraints inherited from `src/skins/limelight/icons.ts`, licence, and status.
- Covers the three gym-comfort levels, the five equipment tiers, and the two measurement-site diagrams from Task 17.
- Read the `image-generation` skill before writing any prompt.

**Task 21: DONE, resolved by reading (C1.13.1)**
- Answered during review, by reading rather than by investigation. `ReadinessNotice` is rendered by the views, not by the wizard: `src/ui/views/TodayView.tsx:436` and `src/ui/views/TrainView.tsx:318` both render `<ReadinessNotice flagged={profile.readiness.flagged} />`.
- So the wiring works and there is no defect. Answering yes to all seven set `flagged`, the wizard said what a wizard step says, and the consequence was waiting on Today and Train. Your complaint stands on different grounds: the consequence was too far from the answer to read as a consequence at all.

**Task 22: Remove the readiness screen (C1.13.2, C1.15)**
- Delete: `src/ui/setup/ReadinessScreen.tsx`, `src/content/readinessQuestions.ts`, `src/ui/components/ReadinessNotice.tsx`, `src/ui/components/readinessNotice.css`, and their tests.
- Modify, and this list is load-bearing because the first version omitted every importer and the build would have broken: `src/ui/views/TodayView.tsx:21,436` and `src/ui/views/TrainView.tsx:36,318` (they import and render `ReadinessNotice`); `src/app/App.tsx:394-410,527` (the `ReadinessGate` component and the `readiness.screenedAt === null` route gate); `src/store/index.ts:774` (`recordReadiness`); `eslint.config.js:109` (a `files` override naming `ReadinessNotice.tsx` for the sessionStorage exemption); `src/app/App.test.tsx:270` (`describe('readiness gate')`); `src/ui/setup/SetupWizard.tsx` (`STEPS`, `READINESS_INSERT_INDEX`, `Draft.readiness`); `src/ui/views/SettingsView.tsx`; `src/content/copy.ts` (seven question keys, two notes, `advice.readinessAnyYes`, `why.readiness`).
- And the catalogue: the `readiness.screen` part holds 14 keys and `readiness.notice` holds 2. Task 26 regenerates it.
- Do NOT delete `Profile.readiness` from the schema. It keeps its Zod default, or every stored document fails validation on load (B24).
- Keep the PAR-Q+ inequality guard somewhere that survives, so the copyrighted text cannot return.

**Task 23: The supplement guidance screen (C1.13.3 to C1.13.6)**
- Create: `src/content/supplementGuidance.ts`, `src/ui/setup/GuidanceScreen.tsx`
- Q11 settled the framing: doses ship, the screening does not, and the screen does not hedge. The creatine safety line stays in substance and gains its source, because Kreider 2017 supports it for healthy adults; the one real caution, pre-existing kidney disease, is one short factual line, not a disclaimer block.
- Creatine is already in the engine and needs no new research: `max(3 g, 0.1 g/kg)`, capped near 10 g/day, Kreider 2017 `10.1186/s12970-017-0173-z`, Antonio 2021 `10.1186/s12970-021-00412-w`, monohydrate only, no loading phase. Dose by body mass, not by sex. Note that your feedback says milligrams; the dose is grams, and the app already computes it per user.
- Caffeine, protein form and intake logistics: from the running research, and nothing ships that the research marks COULD NOT VERIFY.
- R10-exempt long text, outside the copy tables.
- Every source lands in `REFERENCES.md` with the URL, timestamp, method and session id.

**Task 24: Rebuild the review step (C1.14)**
- Modify: `src/ui/setup/SetupWizard.tsx`
- Runs last. It restates what the earlier steps collected, so it cannot be written until they stop moving.

**Task 25: Setup draft persistence (C1.G.1)**
- Modify: `src/domain/types.ts`, `src/domain/schema.ts`, `src/store/index.ts`, `src/ui/setup/SetupWizard.tsx`
- Add `AppState.setupDraft: SetupDraft | null` with a Zod default of `null`. Additive field, `CURRENT_SCHEMA_VERSION` stays 3, matching the pattern the document already uses.
- `persistence.ts` is untouched. It is the only module allowed to reach Web Storage and it already writes the whole document.
- The draft holds the raw typed strings, not parsed values, so a half-typed number survives and is re-validated on resume rather than trusted.
- Confirm clears the draft. Resume returns to the furthest step reached, not to step 1.
- Test: patch three fields, simulate a reload, assert all three survive and the step index is restored. Then assert an invalid stored draft does not crash the wizard and does not corrupt the main document.

**Task 26: RUN ONCE 2026-09-04 for Task 3; re-runs after every copy change. Regenerate the alpha catalogue and the walkthrough pages (process gate)**
- Run: `node scripts/alpha-catalogue.mjs`, then `node scripts/alpha-walk-pages.mjs`, then republish the seven artifacts to their existing URLs in `docs/feedback/walk/urls.json`.
- **This is not optional and it is not last.** `src/content/alphaCatalogue.test.ts:113-118` asserts `DEFAULT_COPY[key]` byte for byte against the catalogue, and line 110 asserts the key count. Tasks 3, 8, 10, 11, 13, 16, 22 and 23 all add, edit or delete copy keys. Any one of them run without this leaves the suite red and the published walkthrough pages describing strings the app no longer has.
- Neither script is in an npm script today. Add both to `package.json` so the step cannot be forgotten, and add the catalogue check to CI.
- Verification: `node scripts/alpha-catalogue.mjs --check` prints `PASS alpha catalogue`, `npx vitest run src/content/alphaCatalogue.test.ts` passes, and `node scripts/alpha-walk-pages.mjs --check` reports every key placed in exactly one step. Current baseline: 102 parts, 491 keys, table 494.

**Task 27: Move every explanatory disclosure below what it explains (C1.08.1, B34)**
- Modify the twelve surviving `disclosure.why` sites listed in B34. The thirteenth goes with the readiness screen in Task 22.
- One shared change if they share a wrapper; twelve if they do not. Check before splitting the task.

**Task 28: Grant the R10 exemption and gate the three new modules (B36)**
- Modify: `docs/design/2026-09-01-copy-contract.md`, R10, to name `introSlides.ts`, `sexRationale.ts` and `supplementGuidance.ts`, with a decision header.
- Modify: `scripts/check-no-emoji.mjs:36`, whose pathspec is `['src/content/copy*.ts', ':(glob)src/**/*.tsx']` and matches none of the three.
- Create: a contract test per module, following `formCues.test.ts` (em and en dash ban at line 130, medication and stimulant ban at line 108) and `specimenCards.test.ts` (ASCII-only, DOI validity).
- Without this, three modules of long-form user-facing prose ship with no gate at all.

**Task 29: Add a licence (B32, Q12)**
- Create: `LICENSE`. Modify: `package.json` to add the `license` field, and `README.md` to state it.
- Blocked on Q12. Task 4 must not ship the "open-source" sentence before this lands, and Task 7's footer cannot name a licence that does not exist.

**Task 30: Fix the required-field message rather than deleting it (B33)**
- Modify: `src/ui/setup/SetupWizard.tsx` at the eight `error.valueRequired` call sites, and `src/ui/views/SettingsView.tsx:179,264`.
- `error.valueRequired` stays. What changes is when it renders: on a touched or submitted field, not as standing helper text under an untouched one. That is what C1.08.14 actually wanted.

**Task 31: Let body fat be re-measured (B45)**
- Modify: `src/ui/views/train/BodyMassQuickLog.tsx:59`, which hard-codes `bodyFatPct: null`, and the Settings body section.
- The store action and the schema already accept the value. What is missing is a control that supplies one, and a tape flow reachable outside the wizard.
- Not asked for in round 1. It is the gap Task 3 exposed: a corrected estimate helps future setups and cannot repair a stored one.

---

## Sub-plans

| Plan | Covers | Blocked on |
| --- | --- | --- |
| 12 — equipment and training context | C1.09.x | Q4, Q9, Q10 |
| 13 — goal, target date and feasibility | C1.10.x, C1.11.x, C1.12.2 | B21, B22 |
| 14 — just-in-time session generation | C1.12.4 to C1.12.6 | B23, and plan 13 |
| 15 — rest-period minigame | C1.01.8 | Confirmed in scope 2026-09-04. Game design deferred until the intro is done |

## Round exit condition

Your own staging, and it holds: correct these parts, alpha-test the corrected parts, then move to w2. Step 4 is tested on its own once plan 12 lands, as you asked in C1.09.14.


---

## Execution log

**2026-09-04, Task 3 and Task 26.** The girth unit defect is fixed and every gate is green.

What changed:

- `src/domain/units.ts` — `CM_PER_IN = 2.54`, exact by definition; `UNIT_LABEL` gains a `girth` member; new `toStoredGirthCm(entered, units)`.
- `src/ui/components/UnitInput.tsx` — new `girthUnit()` and `storedGirthCm()`, matching the existing `massUnit` / `storedMassKg` pair.
- `src/ui/setup/SetupWizard.tsx` — the three girth fields take their unit label from the profile; `tapeEstimate` converts before calling `estimateBodyFatNavy`; `draft.units` added to the memo's dependency list; the three `Draft` comments now say what the fields actually hold.
- `src/content/copy.ts` — `advice.tapeMethod` no longer hard-states cm. 10 words, inside R3.
- `src/domain/units.test.ts` — three new tests, plus the `UNIT_LABEL` shape pin updated to carry the new member.
- `docs/feedback/catalogue.json`, `catalogue.md` and the seven `docs/feedback/walk/*.html` pages regenerated.

Checks, with their actual output:

- `npx vitest run src/domain/units.test.ts` before the fix: 3 failed, 19 passed. After: 22 passed.
- `node scripts/alpha-catalogue.mjs --check` -> `PASS alpha catalogue`, 102 parts, 491 keys, 0 problems.
- `node scripts/alpha-walk-pages.mjs --check` -> `PASS alpha walk pages`, 7 pages, 89 steps, two builds byte-identical.
- `npx tsc -b` -> exit 0. `npx eslint` on the five changed files -> exit 0. `node scripts/check-no-emoji.mjs` -> `OK - 118 file(s) clean`.
- `npx vitest run` -> **115 files, 2329 tests, all passed**.

The catalogue test failed exactly as the peer review predicted before Task 26 ran, which confirms the gate is real rather than theoretical.

**Not republished.** The seven walkthrough pages are regenerated on disk but not pushed to their artifact URLs. Republishing mid-round would change pages the owner may be reading for stages 2 to 6. It waits until this round's copy changes are finished, then goes out as one update to the same URLs.


**2026-09-04, Task 2.** The limelight top bar.

Root cause: `src/app/appShell.css:10` hard-coded `background: rgba(10, 11, 12, 0.92)`, the clinical skin's own `--bg` at 92 %. Nothing restated it per skin, so limelight inherited a near-black bar under `--text: #000000` and `--text-2: #454545`.

Measured, over the lime ground: the brand at **1.19:1** and the status line at **1.84:1**, against the 4.5:1 WCAG AA asks for. That is why the owner could "somehow" see one and not the other.

Fixed by tokening the bar: `--topbar-bg`, `--topbar-text` and `--topbar-brand`, defined on the clinical root with today's values and overridden per skin. Limelight takes the inverted black panel `.ll-panel` already uses on its light page. After: **21:1** for text and brand, **7.75:1** for the accent. Clinical and board are unchanged in appearance, at 6.67:1 / 15.24:1 and 15.50:1.

`--chrome` was NOT used as the token name: the board skin already binds it to a font family.

New gate `src/app/topbar.test.ts`, 7 tests: the rules name tokens rather than literals, no colour literal survives in the `.topbar` block, every skin defines all three tokens, and the contrast ratio is computed from the token file for all three skins. It also pins the two ratios the defect produced, so the regression stays legible. `vitest.config.ts` gained `appShell.css` in `css.include`, for the reason the file already documents for `tokens.css`: vitest empties a CSS module its include does not match, query and all. `src/skins/tokens.test.ts` pinned the clinical root at 22 tokens; now 25.

The rendered check stays manual, in `docs/phone-visual-check.md`: jsdom resolves no custom property and performs no layout, so no test in this stack can assert a painted colour.

**2026-09-04, Task 1.** The synthetic fixture, at `docs/feedback/alpha-fixture.json`, 130 KB.

Built by `scripts/alpha-fixture.mjs`, which drives the store's own actions and exports through the same `exportJson` the owner's backup uses, rather than hand-writing JSON. Cursors, assignments and weekly reviews are derived, so a hand-written document can be schema-valid and still describe a state the app can never produce.

What it contains, from the generator's own output: 225 logged sets; 9 weeks closed, 3 of them missed; the cursor at session 27 of 36; 6 blocks including 3 deloads; 9 body-mass entries; 5 of 37 Atlas cards covering all three rarities with the rest locked; reminders on with two lead times; a written time capsule; 25 completed and 2 skipped assignments.

Deliberately imperial with `baselineBodyFatPct: null` — the unit system Task 3's defect corrupted, and the branch that routes RMR to Mifflin-St Jeor and protein to the body-mass rule, which the walkthrough never otherwise shows.

Loading it: Settings, then Data, then the export and import screen, which already carries a file input and a textarea and re-validates through `importJson`. No new UI was needed.

New gate `src/domain/alphaFixture.test.ts`, 8 tests, asserting the committed document still reaches each state and carries no gated identifier.

**Two states this document cannot reach, stated rather than implied.**

1. **Legacy v2 data.** It lives under different storage keys (`fti.plan.v1` and its siblings), not inside the `fti.v3` document, so no import can create it. `ui.legacyMigration` is left `pending`, which shows the offer, but the wizard will find nothing to import. Reviewing the migration screens needs a separate legacy document written to those keys.
2. **Five of the seven reminder states.** They are browser facts — permission denied, push unsupported, no subscription — not stored ones. The document carries the enabled setting and its lead times, which is enough to read the panel's copy, and no more.

**Full suite after all three defects: 117 files, 2344 tests, all passing.** `tsc -b` exit 0, ESLint exit 0 on every changed file.


**2026-09-04, the closure artifact.** Published at https://claude.ai/code/artifact/0058cdef-4798-4516-a337-5142b6d81877

All 127 claim rows are generated from this document's Part A ledger rather than retyped, so the page cannot drift from the plan. Regenerate it from `docs/plans/` and republish to the same URL whenever the ledger changes.


**2026-09-05, brief A: the readiness screen removed, guidance in its place.** Commit `54c573e`.

Claims C1.13.2 to C1.13.6, C1.13.8 and C1.15 are closed. The questionnaire, its notice, its
questions module, the Settings redo panel, the route gate and `recordReadiness` are gone.
`Profile.readiness` stays in the schema for the reason B24 gives, corrected: Zod strips rather
than throws, so deleting it would have destroyed stored screening data silently.

Step 8 is now `Getting started`, carrying creatine, caffeine, protein and kit, each with a dose
computed from the user's own body mass. `caffeineDoseMg` prescribes the resistance-training range
0.9 to 2 mg/kg rather than the 3 to 6 mg/kg usually quoted, whose floor at 70 kg already exceeds
EFSA's safe single dose, and the range is capped at that figure with the cap disclosed.

Two defects surfaced while wiring it, both now fixed: `GuidanceScreen` guarded its caution block
on `!== undefined` while kit's caution is `null`, so it rendered an empty note; and
`creatineDoseG` carried no domain guard where `caffeineDoseMg` beside it does.

**How the delegation actually works, after four failed attempts.** `agy` in headless print mode
auto-denies every tool call, and the error names a permission problem, which is misleading: the
real cause is that the PROMPT invited tool use. A prompt that mentions a file path makes agy reach
for a file tool, get denied, and return nothing. The recipe that works is a neutral working
directory, no file paths in the prompt, an explicit "do not read, write or run anything", and the
output redirected to a file that Claude then applies and verifies. agy drafts; it never runs a
gate, so it can never report a passing test it did not run.

**2026-09-05, MIT licence and the icon register.** Commit `ff39400`. Claims C1.01.13 and C1.09.9.


---

## Round 1: closed, 2026-09-06

**80 of 127 claims shipped, tested and deployed.** 30 wait on sub-plans 12 to 15, which need
design decisions before code. The rest were answered, superseded or withdrawn.

Suite at close: 122 files, 2402 tests. `tsc`, `eslint`, the emoji gate, both catalogue gates and
the personal-data grep all green.

**A fourteenth contract rule was adopted at close.** R14: labels, headings and control names are
Title Case, and a heading is a noun phrase rather than a sentence. The owner reported it three
times across two rounds, the third time saying he would stop mentioning it, which is the point at
which a preference becomes a defect in the author. `scripts/check-title-case.mjs` decides the
mechanical half and reports 141 of 221 naming keys failing; correcting them is the first task of
round 2, after which the script joins CI.

**Delegation, recorded because it cost four failed dispatches to learn.** agy in headless print
mode auto-denies every tool call, and its error blames permissions, which sends you to the wrong
place: the cause is a prompt that invites tool use. Naming a file path is enough to trigger it.
The working recipe is a neutral working directory, no paths in the prompt, an explicit refusal
instruction, and stdout redirected to a file the orchestrator applies. Sonnet subagents through
the Agent tool are the reliable path for anything that must also run a gate.

**Verification is not optional.** Three of five subagent reports claimed clean runs that were not:
a module shipped with no contract test, the session position vanished from one skin, and the top
bar was empty through the whole of setup. Every one was found by re-running the gates rather than
reading the report.

Continues in `docs/HANDOFF-2026-09-06.md`.
