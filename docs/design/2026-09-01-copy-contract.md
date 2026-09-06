# Copy contract (default skin)

Status: binding on every UI task in P1 to P9. Master plan section 3, "Copy in all user-facing
strings", points here. Rewritten on 2026-09-02 against the three tables that shipped.

The default skin is clinical. It states what happened and what to do, and nothing else. A skin may
change register (master plan section 3, "Skins"). It may not change a number, a unit, or the meaning
of a plan-altering control.

Every rule below is stated as `src/content/copy.test.ts` decides it, because that file is the half
of this contract a commit cannot argue with. Where the suite decides nothing, the rule says so.

## Rules

**How a word is counted.** A `{slot}` is removed first, then `.,:;!?()"'` and the right single quote
are stripped from each token. A token counts as a word only if it contains a letter and is not a
unit token. The unit tokens are `s`, `kg`, `lb`, `mL`, `g`, `kcal`, `MiB`, `cm`, `mm`, `ms`, `%` and
the multiplication sign. So `60 kg × 8` counts as zero words, not one. Capital `S` is absent from
that list on purpose. `S` is the siemens and this app measures no conductance. A table that shouts a
unit symbol is charged for the word.

**R1. A button is at most three words.** Keys under `button.`, in all three tables.
Before: `Train something else today` · After: `Train something else`

**R2. A hero is at most eight words.** Keys under `hero.`, the one line a screen is about.
Before: `two of four, bestie. the week flopped, not you.` · After: `Weekly target missed`

**R3. An advice line is at most twelve words.** Keys under `advice.`. The domain holds the same
bound: `MAX_REASON_WORDS` in `src/domain/training/progression.ts` is twelve, so a minted reason line
cannot outrun the rule it is written under.
Before: `Log your post-session body mass. A loss above two per cent of your pre-session mass means
fluid replacement was inadequate (ACSM 2007).`

After: `Log your post-session body mass.` The rest moves behind R9.

**R4. A banner is at most two sentences.** Keys under `banner.`. The count splits after a full stop
or a question mark followed by a space. No key is exempt from R4.
Before: `The document could not be serialised, so nothing was written and the stored document is
unchanged. Retry the save; if it fails again, export the last stored document before making further
changes.` · After: `The change could not be saved. The stored copy is unchanged.`

**R5. No em dash, and no en dash as a connector.** In any of the three tables an EM DASH (U+2014)
fails outright. An EN DASH (U+2013) passes only between two digits, and a `{slot}` counts as a digit
because the domain fills it with a number. Use a colon, a comma, a semicolon, or two sentences.
Before: `Sedentary [em dash] desk work, little walking` · After: `Sedentary: desk work, little
walking`
Retained: an en dash in a numeric range. `status.blockSessions` ships as `sessions {from}–{to}` and
renders as `sessions 4–6`, which is the one shape the suite allows. This contract once retained one
placeholder: a bare em dash standing for an absent value. It is not available to a copy string,
because the suite admits no exception. A component may still draw one, because a component is not a
table.

**R6. No emoji.** In any of the three tables. The suite reads emoji as four code point ranges:
U+1F300 to U+1FAFF, U+2600 to U+27BF, U+FE0F, and U+2B00 to U+2BFF. The dingbat check and cross fall
inside the second range, so no copy string may carry one. Component chrome may:
`src/ui/components/VideoModal.tsx` and `src/ui/components/FormCuesModal.tsx` draw a close cross and
a warning sign outside the tables and outside the suite.
Before: a trophy emoji ahead of `NEW PR · previous best 60 kg`
After: `Load personal record. Previous best {load} × {reps}.`, which is the shipped `coach.loadPr`.
The abbreviation goes with the emoji: R11 forbids `PR` in a line the user reads.

**R7. No hedging and no filler.** Cut "just", "simply", "please", "we", "you might want to", and any
clause about the app's own construction. The suite does not decide R7. A regular expression that
pretended to would pass bad copy and fail good copy, so review decides it.
Before: `It is added in the next plan; this build carries the storage, schema and unit layers it
needs.` · After: `Setup is not built yet.`

**R8. No exclamation mark.** Checked on the default table alone. P8's own test for the milestone
line is named "states the count without motivational filler", and that is the register everywhere.
Before: `1,000 sets logged!` · After: `1,000 sets recorded.`

**R9. Arithmetic goes behind a "why?" disclosure.** Checked on `advice.` keys of the default table.
The suite reads arithmetic as a signed percentage, an equals sign, the word `rounded`, or the phrase
`stored as`. A bare threshold such as "above 2 %" is an instruction, not a justification, and stays.

The criterion for inlining a number: show it inline only if the user must act differently because of
it. A suggested load the user will dial in must be inline. How that load was rounded must not.

The disclosure is a `<details>` element. Its summary is the literal `why?` when it carries a
derivation. When it carries reference content the summary is a noun phrase of at most five words,
such as "What transfers". Text inside a disclosure is exempt from R1 to R4, and every exemption is
registered under R10. Where a domain function produces the sentence, it returns a separate `why`
string and never concatenates it into the message.

**R10. Exempt content.** Two halves, and only one of them is mechanical.

Exercise form cues, exercise notes and tips, Atlas card bodies and citations, the body-step
equation list, the sex-field rationale, supplement guidance, the body-fat chart text, and the
reminders runbook
(`docs/RUNBOOK-reminders.md`) are exempt from R1 to R4
and R9. They are reference text a user chooses to open. They are not exempt from R5, R6 or R11.
None of them lives in a copy table: they are `src/content/formCues.ts`,
`src/content/specimenCards.ts`, `src/content/bodyEquations.ts`, `src/content/sexRationale.ts`,
`src/content/supplementGuidance.ts`, `src/content/bodyFatChart.ts`, `src/content/introSlides.ts`
and that runbook.

<!-- decision: r10-body-equations-module | status: adopted | supersedes: none -->
`src/content/bodyEquations.ts` was added to that list on 2026-09-04, for alpha round 1 claim
C1.07.5: the owner asked for a citation list under the body box, naming the methods the page's
numbers feed. A citation carrying a DOI cannot pass R3's twelve words and should not try. The
module carries its own suite, `src/content/bodyEquations.test.ts`, asserting R5, R6 and R11 and
that every DOI it prints also appears in the engine that uses it, so a citation cannot drift from
the code it describes.

<!-- decision: r10-sex-rationale-module | status: adopted | supersedes: none -->
`src/content/sexRationale.ts` was added to that list on 2026-09-05, for alpha round 1 claims
C1.07.6 and C1.07.10 to C1.07.16: the sex-field explainer opened from the body step, in two
segments separated by a rule in `var(--accent)`. Segment one quotes the two RMR equations and the
exact 166 kcal/day offset difference; segment two replaces the owner's requested six-month
hormone-therapy threshold, which the evidence does not support (decision
`hrt-no-threshold-ffm-path`, `docs/plans/2026-09-04-11-alpha-round-1-corrections.md` section B10).
The module carries its own suite, `src/content/sexRationale.test.ts`, asserting R5, R6 and R11,
that the Mifflin-St Jeor and Cunningham DOIs it prints also appear in `src/domain/nutrition.ts`,
and that no six-month rule ships.

<!-- decision: r10-supplement-guidance-module | status: adopted | supersedes: none -->
`src/content/supplementGuidance.ts` was added to that list on 2026-09-05, replacing the deleted
readiness screening with an evidence-based guidance step covering creatine, caffeine, protein
powder, and basic kit. Each section cites published literature with DOIs verified in
`src/domain/nutrition.ts`. The module carries its own suite, `src/content/supplementGuidance.test.ts`,
asserting R5, R6, R11, and that every DOI it prints appears in `src/domain/nutrition.ts`.

<!-- decision: r10-intro-slides-module | status: adopted | supersedes: none -->
`src/content/introSlides.ts` was added to that list on 2026-09-05, for alpha round 1 claims
C1.01.2 to C1.01.15: the intro sequence shown once before "Setup, step 1 of 9", four caveat
slides typed out, a disclaimer and a slide naming what setup collects. The six slides are the
owner's own words, copied verbatim, and none of them is a control label a skin retunes, which is
what puts them here rather than in a copy table. The module carries its own suite,
`src/content/introSlides.test.ts`, modelled on `bodyEquations.test.ts`: it asserts R5, R6 and
R11, that no slide carries a URL, and that the module's shape matches the brief (six slides, the
two headingless ones, slide 4's two-paragraph split, and the disclaimer quoted byte for byte).

Inside the tables the exemption list is one key long, and the suite holds it as `LENGTH_EXEMPT`:

| Key | The position that earns it |
| --- | --- |
| `advice.motivationClipLimit` | rendered inside `<details><summary>why?</summary>` in `src/ui/motivation/MotivationSettings.tsx` |

A key earns a place there only by being rendered inside a `<details>`. The call site is named so the
exemption can be revoked the day the call site changes.

**R11. Name the defined quantity.** Never a colloquial stand-in, in copy or in identifiers. The
suite does not decide R11: nothing in a string says which quantity a word was meant to name.
Before: `weight`, `calories`, `water` · After: `load` (kg on a bar) or `body mass`; `kcal`;
`beverage intake (mL)`. Likewise RPE, RIR, 1RM and e1RM where the field has a name.

R11 also decides which words are keys. `unit.characters` is a copy key while `cm`, `%` and `s` are
not, because those three are symbols and this one is an English word. A model identifier never
reaches the screen either: `ADVICE_KEY` in `src/ui/views/train/ExerciseCard.tsx` and `MODALITY_KEY`
in `src/ui/views/train/AddCustomExercise.tsx` map each enum member onto a copy key. Both are
`Record<Enum, CopyKey>` and exhaustive by type, so a new member is a compile error rather than a
lower-case identifier on screen.

<!-- decision: copy-rule-unit-symbol-parity | status: adopted | supersedes: none -->
**R12. An override carries the unit symbol the default carries, verbatim.** (adopted, 2026-09-02)

Where the default names a unit symbol, the override names the same symbols, in the same case, with
the same space. The reason is that the case and the space are the symbol: `+30 S DELAY` states
thirty siemens, not thirty seconds. Rejected: letting a register re-case the symbol with the
sentence, which would let taste decide a quantity.

The word count cannot catch the mistake, because a unit token is excluded from it. `+30s` states no
SI quantity at all. The board therefore writes `+30 s DELAY`, stopping its upper case at the one
token that has no case to give.

The symbols the rule guards are `s`, `kg`, `lb`, `mL`, `min`, `g`, `kcal`, `MiB`, `cm`, `mm` and
`ms`. The per cent and multiplication signs are unit tokens but not symbols here, having no case to
get wrong. The gate reads the default, not the override. A skin may write a sentence that names no
quantity, and every row that names one names it the same way.

<!-- decision: copy-rule-title-case | status: adopted | supersedes: none -->
**R14. A label, a heading or a control name is Title Case, and a heading is a noun phrase.**
(adopted, 2026-09-06)

Two clauses. The first is mechanical and `scripts/check-title-case.mjs` decides it; the second is
review, like R7 and R11.

**Title Case.** Capitalise the first word, the last word, and everything between them except
articles, coordinating conjunctions, and prepositions of four letters or fewer. `Units on the
Weight Plates`. `Time Zone`. `What You Told Me`. It applies to the `label.`, `hero.`, `step.`,
`group.` and `button.` families: the keys that NAME something. It does not apply to `advice.`,
`banner.`, `why.` or `error.`, which are sentences and stay sentence case.

**A heading is a noun phrase.** Not a sentence, not a question, not a conditional clause.
`Individuals in Gender-Affirming Hormone Therapy`, never `If you are on gender-affirming hormone
therapy`. A heading names the thing below it; it does not address the reader.

Scoped to the DEFAULT table, exactly as R8 and R9 are. The skin registers are recorded decisions
going the other way: limelight is deliberately lower case (`go on`, `the look`) and the board is
deliberately upper (`PROCEED`). Applying R14 to them would overwrite a design decision with a
typographic one.

Unit symbols are exempt, because R12 already owns them: the case IS the quantity, so `(kg)` stays
`(kg)`. Title-casing a symbol states a different quantity.

WHY IT IS A GATE AND NOT A NOTE. The owner reported it three times across two rounds, the third
time prefaced with "something I won't mention in the feedback but you keep doing wrongly". A rule
an author has to remember is a rule that decays. As of adoption, 141 of 221 naming keys fail it;
they are corrected in round 2, and the gate joins CI once they do.

<!-- decision: copy-rule-no-return-promise | status: adopted | supersedes: none -->
**R13. A control that closes for good never promises a return.** (adopted, 2026-09-02)

No override of `button.dismiss`, `button.cancel` or `button.close` may contain "now", "later",
"soon" or "next". The reason is that Dismiss writes `missHandled` for that week, so "not now" would
state a postponement that never happens. Rejected: leaving it to review, because the missed-week
screen is where a skin is most tempted to be kind.

The write happens in `src/ui/motivation/MotivationModal.tsx`, and the screen does not come back. A
label that promised otherwise would tell the user the wrong thing about their own record. That is a
control semantic rather than a register, which master plan section 3 puts outside what a skin may
change.

`button.close` has no `CopyKey` yet. It is on the guarded list so the rule stands the day one is
added. The suite therefore looks these keys up by string rather than by `CopyKey`.

## What the suite decides, and what it leaves to review

| Rule | Tables checked | Decided by |
| --- | --- | --- |
| R1, R2, R3 | all three | word count, less the `LENGTH_EXEMPT` key |
| R4 | all three | sentence count, no exemption |
| R5, R6 | all three | character scan |
| R7 | none | review |
| R8, R9 | default only | character scan, arithmetic pattern |
| R10 | all three | the `LENGTH_EXEMPT` map itself |
| R11 | none | review |
| R12, R13 | override tables | symbol parity, word list |

Four more gates carry no rule number and bind just as hard. No string in any table may hold a URL,
because a string is not a place to put a link. Every override key must exist in `CopyKey`. Every
override must carry the slots and the literal digits its default carries, and no others. An override
may rename an abort or a commit and may never swap them. The aborts are `button.cancel` and
`button.dismiss`. The commits are `button.confirmSkip`, `button.confirmStart` and
`button.wipeConfirm`.

The round-three tone rule stays with review for the same reason R7 and R11 do. It reads: "the joke
is about the app, or about the week, never about the user". That is a fact about aim, and nothing in
a string says where it points.

## Where the copy lives

`src/content/copy.ts` exports `DEFAULT_COPY`, and that table is the union of record. This document
does not restate it. A key list copied into prose rots the moment a task appends a key. That is what
happened here: 45 of the keys this contract named no longer existed. What binds is R1 to R13 above
and the suite in `src/content/copy.test.ts`.

A view calls `copy(key)` or `copyFor(skin, key)`, never a literal. A string that interpolates a
value is a `FORMAT` frame. It is a function of its arguments, not a template assembled at the call
site, so a skin can reorder it. P8 converted twenty two frames from template literals onto keys, and
the suite pins each one to the clinical literal it replaced, byte for byte.

Counts on 2026-09-02, from `node scripts/copy-wordcount.mjs`:

| Table | File | Keys | Words | Coverage |
| --- | --- | --- | --- | --- |
| clinical (default) | `src/content/copy.ts` | 493 | 1888 | the union |
| limelight | `src/content/copy.limelight.ts` | 120 | 379 | 24.3 % |
| board | `src/content/copy.board.ts` | 37 | 68 | 7.5 % |

Test assertions quote the default table. Changing a string here changes its test in the same commit.

### The missed-week screen

R13 is argued from this screen, so its rows are named here rather than left to a grep.

| Key | Default | Why it exists |
| --- | --- | --- |
| `advice.tapForSound` | `Tap the video for sound.` | The clip autoplays muted, which is the only autoplay an engine allows. Master plan decision 10.9 makes the tap the unmute gesture, and this line names that state while it holds. |
| `advice.tapToMute` | `Tap the video to mute.` | The other half of the pair, and the clip's accessible name once sound is on. A control with a role and no name cannot be identified at all. |
| `button.dismiss` | `Dismiss` | The only control on the screen. Master plan decision 10.2 settled the modal on one control, and R13 stops a skin softening it. |

There is no play control and there is no per-week mute. Decision 10.9 rules out the first and
decision 10.2 the second, and both keys were retired.

## The override tables

`SKIN_COPY` maps a skin id to a table. `clinical` maps to an empty object, so the default stands
unchanged and the suite asserts that it is empty. `limelight` and `board` are
`Partial<Record<CopyKey, string>>`, merged over the default one key at a time. An unlisted key falls
through to the clinical string by design. A partial table is the mechanism, not a gap in the work.

Four rules bind both override tables. They are stated at the head of `src/content/copy.limelight.ts`
and decided mechanically by the suite.

1. A skin changes words, never facts. Slots, literal digits, unit symbols and quantity names all
   survive the translation (R11, R12).
2. Lower case everywhere in limelight, except the shouted rows named below.
3. No emoji, in the strings or in the comments. A position that carried one now carries a pixel
   icon, mapped in `src/skins/limelight/Icon.tsx`.
4. The joke never sits on a control whose misreading costs data.

### limelight, 120 rows

Register: camp, lower case, aimed at the week or at the app, never at the person reading it. Source:
`docs/design/round3/2026-09-01-round3-plan.md`, section 3.4 for the twenty rows the design names and
sections 3.1 to 3.3 for the rules every other row obeys.

**The shouted rows: three keys, two strings.** `button.startSession` is `LET'S GO BABES`.
`status.prStamp` and `status.weekMetStamp` are both `MOTHER`, at two keys because a met week and a
personal record became two different claims. Round three closed the shouted list at three, the third
being the marquee, which is a component rather than a string. The suite asserts the key list and
asserts that the three keys resolve to two distinct strings, so a fourth shouted word fails. Every
other row is lower case once its slots are removed.

**Coverage.** 130 default keys reach Today, Train, Plan or Settings. Twenty carry a limelight row.
The other 110 stay clinical, and `src/content/copy.limelight.ts` records one verdict per group
rather than one per key:

| Group | Keys | Why it stays clinical |
| --- | --- | --- |
| a control whose misreading costs data | 18 | Rule 4. The wipe, the two legacy paths, the backup download and the clip failure say what they destroy, and a set delete cannot be taken back. |
| the quantities, the units and the increments | 17 | Rule 1 and R11. A skin may put a word beside a quantity and may not rename one. |
| the profile fields the targets are computed from | 14 | The same words name the picker and the target it drives, so renaming one leaves them calling one thing two things. |
| the install guide | 12 | Every string quotes a label another program draws: Share, Add to Home Screen, Install app. |
| the reminder state and its controls | 12 | The panel reports whether this device will receive a push, and `src/ui/components/ReminderSettingsPanel.test.tsx` asserts these by key. |
| the readiness screening | 6 | Camp on a health gate is what round three, section 3.3 rules out, and the physician flag has to read as a flag. |
| the equipment names | 5 | The picker writes the exercise modality, so a renamed option selects something other than it says. |
| case alone, or the limelight word already | 4 | Cloning a string to lower-case it puts one sentence in two files and rots the second. |
| the number-entry errors | 4 | Each states the number the field will accept, which is the whole content of the string. |
| the progression advice kinds | 4 | They resolve into the slot of `label.suggestedLoad`, which has no row, so a camp kind would render inside a clinical frame. |
| body mass and fluid loss | 3 | Rule 4 again. `src/ui/views/train/BodyMassQuickLog.test.tsx` asserts the fall-through by key. |
| the three skin names | 3 | Proper nouns, and the id an export carries. `src/ui/settings/SkinSettings.test.tsx` asserts them under all three skins. |
| the custom-exercise form | 2 | Its noun is the domain's, and the camp alternative coins a word for "exercise" no other row uses. |
| the technique reference | 2 | "Form cues" names the content the modal shows, and renaming the button parts the control from what it opens. |
| the two training terms | 2 | A deload block and a training block are the periodisation terms the plan documents use. |
| the two sentences about the app's own rules | 2 | One names browser keys, and the other states the promise this table lives under. |

Four Train frames carry no row: `status.setsBy`, `status.restRemaining`, `label.suggestedLoad` and
`why.fluidLoss`. The suite asserts each absence, so a later row cannot arrive without answering the
reason recorded against it.

**The review page.** `docs/design/2026-09-02-limelight-side-by-side.md` puts every limelight row
beside its clinical default for the user to mark up. It is generated by
`scripts/limelight-side-by-side.mjs` from the tables and nothing in it is retyped, so this contract
does not restate a single row. Regenerate that page after any table edit.

### board, 37 rows

Register: upper case throughout, because a split-flap board has no lower case. Every term is a real
airport term used in its real sense, and the humour comes from the discipline rather than from a
joke. Source: `docs/design/round2/2026-09-01-design-H-departures-board.html`, the copy table near
the end.

The rule this table adopts: a row exists only where a real airport term already names the thing the
key names. The alternative, rejected: mirror limelight's 120 rows. Matching them would mean minting
airport words for a hydration shortfall, a body-mass check-in and a creatine dose. A board that
announces irregular refreshment service about a glass of water is a joke in uniform. The moment it
invents a term, it stops being a board.

What falls through to the clinical string, counted against the tree on 2026-09-02:

| Area | Default keys rendered | Board rows |
| --- | --- | --- |
| the setup wizard | 104 | 1 (`button.continue`) |
| the migration wizard | 34 | 1 (`button.cancel`) |
| the nutrition targets | 20 | 0 |
| the export view | 18 | 0 |
| the readiness screen | 9 | 1 (`button.continue`) |
| the data section | 9 | 0 |

Those two rows are the controls every flow shares, not a foothold. A board names a gate control. It
does not name a protein target.

The board's upper case stops at one token. `button.extendRest` reads `+30 s DELAY`, for the reason
R12 gives. One row departs from the design document. Its hydration line used an em dash, and R5
prescribes the colon in every skin. The row ships as `REFRESHMENT: DRINK TO THIRST`.

## History, and where it lives

Three records left this file in the 2026-09-02 rewrite. None of them is lost, and each is named here
with the place that now holds it.

The pasted `CopyKey` union and default table. It listed 179 keys the day it was written and 179 on
the day it was cut, while the shipped union reached 493. `src/content/copy.ts` is the union of
record, and the block that copied it held 45 keys the tree no longer has.

The sweep of the P2 to P8 plans, a table of 70 string edits with a Before and an After cell. Twelve
of its Before cells quoted the em dash connector R5 forbids. A contract that prints the character it
bans cannot be checked with a grep. Every one of those edits is recorded in the plan document it
belongs to, and in the commit that made it.

The list of retired keys. Two sweeps removed keys nothing rendered: seventeen in `1500997` and
thirty in `b1b5154`. Each key was checked with `git grep` over `src`, with the three tables
excluded, and against the `FORMAT` frames, before deletion. The names are in those two commits and
in Tasks 15 and 16 of `docs/plans/2026-09-02-09-prose-and-docs-pass.md`. They are not repeated here,
because a contract that lists keys the tree does not have is the failure this rewrite exists to end.
