# Round-2 feedback: rows needing the orchestrator's ruling

Every assertion below cites the file and line it rests on, per `H-round2-intake.md`. Ledger ids
refer to `docs/feedback/round-2/ledger.md`.

## Contradictions

**D2.01.4 vs D2.04.1 — is "intro.skip" the same control the owner wants removed?**
D2.01.4 (step r2.01, "intro.sequence") asks to remove the "SKIP" option entirely. D2.04.1 (step
r2.04, "intro.skip") says of what is apparently a different, separately-walked step, "Works
perfectly." The walked page (`docs/feedback/walk/r2-onboarding.html`) treats `intro.sequence` and
`intro.skip` as two distinct step ids, and the code carries two distinct Skip controls: the intro's
own (`button.skipIntro`, `src/ui/intro/IntroSequence.tsx:182,191`) and Boot's
(`button.skipBoot`, referenced in `src/app/App.tsx:610-621`, which explains the two are
deliberately sequenced so their same-named "Skip" controls are never mounted together). If
`r2.04`'s "intro.skip" names Boot's skip, there is no conflict; if it names the same control D2.01.4
wants gone, the two rows cannot both be honoured. Needs the owner to confirm which "Skip" `r2.04`
walked.

**D2.11.7 vs the round-1 "draft survives a closed browser" feature.**
D2.11.7 asks that a step's data be held in a temp/local buffer and only committed "when NEXT is
pressed," never at the entry point. `src/ui/setup/SetupWizard.tsx:786-839` shows the wizard already
does the opposite on purpose: `patch()` (line 891) writes every keystroke straight into `draft`
state, and a debounced effect (lines 825-839) persists that same live `draft` to
`useAppStore().setupDraft` so a closed browser does not lose it — the feature the commit history
names "the draft survives a closed browser" (git log, commit `aa6bd14`). Committing only on Next
would reintroduce exactly the data-loss-on-close bug that feature was built to close. The owner
needs to say whether he wants per-step-commit UX badly enough to give up round-1's crash/close
protection, or whether a different mechanism (e.g. a `stepIndex`-scoped temp copy which still
debounce-persists so the browser-close guarantee holds) satisfies both.

**D2.12.2 vs the owner's own round-1 instruction on the close-button corner.**
D2.12.2 asks to move the SexRationaleModal's "X" to the upper right. `src/ui/setup/setup.css:566-571`
records: "Both draw their own close control at the UPPER LEFT: the owner's explicit instruction
(C1.07.11) ... FormCuesModal's close sits at the upper right by a different, unrelated convention;
this one does not follow it, on purpose." Round 2 asks for exactly the placement round 1 explicitly
rejected for this modal. Not a bug — a reversal of his own prior instruction, which he should confirm
before it is built.

**D2.13.3/D2.13.4 vs the round-1 positions for "Optional" and "Click here to estimate."**
D2.13.3 and D2.13.4 ask to move `advice.bodyFatOptional` above the body-fat field and
`advice.estimateBodyFat` below it. `src/ui/setup/SetupWizard.tsx:1734-1737` records these exact
elements were placed where they are now — Optional after the mode block, the estimate link before
the field — because "C1.08.1 to C1.08.4, C1.08.7" (round 1, his own words) asked for "why? and
Optional moved BELOW the control they explain." Round 2 asks to move them again, the other way.
Likely intentional (fresh look at the shipped page), but it is a reversal of a decision his own
earlier feedback drove, not a fresh request against neutral code.

## Claims the code already contradicts (or already does)

**D2.05.2 — "I do not see any skin picker or any app settings."**
Confirmed correct, and by design: `src/app/App.tsx:624-630` renders `<SetupWizard />` in place of
`<ViewShell />` (which holds the nav, the settings view, and the skin picker) whenever
`profile === null`. The comment there states why: "every other view needs a profile to read units,
time zone and targets from." This is an observation, not a defect — no ledger row here requests a
change, so nothing to build unless the owner asks for settings to be reachable mid-setup.

**D2.09.2/D2.09.4 — the UTC list order and "multiple options per UTC."**
Confirmed exactly as reported. `src/ui/setup/SetupWizard.tsx:864-889` builds the list from
`Intl.supportedValuesOf('timeZone')` and maps it straight through with no re-sort; that API returns
IANA zone ids in ASCII order by canonical name (ECMA-402 6.4.2), so `America/Cancun` (UTC-05) sorts
next to `America/Cayenne`/`America/Cayman` alphabetically, not by offset — reproducing the exact
Cancun/Cayman interleave he describes. The "multiple options per UTC" is not a bug: those are
distinct IANA zones because DST rules differ between them, and `zone` feeds `todayLocal(zone)`
(line 926) for day-reset timing, which needs the real zone, not a collapsed offset. See "needs a
number" below for the open research question this raises.

**D2.09.8 — the notifications bullet describes an existing feature.**
`src/domain/reminders/client.ts`, `instants.ts`, `payload.ts`, `swHandlers.ts` and
`src/ui/components/ReminderSettingsPanel.tsx` already implement a working reminder/notification
system. D2.09.8 is copy work explaining a shipped capability inside the new timezone box, not new
engineering.

**D2.14.1 — sex-conditioned fields already exist.**
`src/ui/setup/SetupWizard.tsx:1815-1845` already renders the hip field only when
`draft.sex === 'female'`, and already swaps the waist label between `quantity.abdomenII` (male) and
`quantity.abdomenI` (female). The request is already satisfied; nothing to build for this clause.

**D2.15.3 — the citation list bug he describes is real and precisely reproducible.**
`src/content/bodyEquations.ts:41-81` gives three `BodyEquation` rows the marker `1` (RMR, tape
body-fat, beverage target). `src/ui/setup/SetupWizard.tsx:1900-1907` renders `BODY_EQUATIONS` inside
an `<ol>`, whose own auto-number collides with each row's own superscript marker. Row 2 in that list
is the body-fat row, which carries marker `1` — so it renders exactly as he describes,
"2. ¹ Body-fat percentage....". This is a genuine, reproducible defect, not a misreading.

**D2.15.5 — a "brief sentence above each citation" partially exists.**
Every `BodyEquation.computes` field in `src/content/bodyEquations.ts` already is that descriptive
sentence (e.g. "Body-fat percentage from tape girths..."), rendered ahead of `source` at
`SetupWizard.tsx:1903`. The ask is consistency and bold styling, not a new field.

**D2.16.2 — shake-in-place-of-rumble already ships.**
`src/ui/setup/SetupWizard.tsx:1216-1241` (`handleFailedBodyNext`) already shakes the invalid DOM
element (`el.classList.add('wiz-shake')`, gated on `prefers-reduced-motion` in CSS) and calls
`vibrate()` only as an "additive cue," per its own comment. `src/ui/audio/chime.ts:173-175` already
makes `vibrate()` a no-op wherever `navigator.vibrate` does not exist, which covers his stated PC
case. Nothing here needs new behaviour; if he still wants the vibrate call removed on desktop,
`vibrate()` already returns `false` there and does nothing.

**D2.18.3 — a REFERENCES-style hidden box partially exists on the guidance page.**
`src/ui/setup/GuidanceScreen.tsx:48-57` already renders a `<details><summary>{disclosure.why}</summary>`
per section. The gap is that it is per-section, not one consolidated REFERENCES box matching the
sex page's planned design (D2.15.2) — a restructure, not new capability.

**D2.17.1 — round 1's fix for the goal/training/availability/programme steps was not a slider.**
`docs/plans/subagent-briefs/I-goal-target-programme.md:15-40` shows round 1's remedy for the `goal`
step was a two-axis chooser (fat: lose/hold, muscle: gain/hold) deriving `GoalKind`, explicitly to
avoid touching the cited energy/protein coefficients — not the slider he asked for. His round-2
complaint is accurate: the shipped fix and his request were never the same thing. Scope for
`training`/`availability`/`programme` beyond `goal` is not addressed in that brief at all.

## Claims that would break a gate

**D2.12.6 — a literal emoji character fails R6.**
00-CONTEXT.md R6: "no emoji. The check treats U+2600 to U+27BF as emoji." He asks for "a small
emoji type" of a face wearing glasses next to a heading in `sexRationale.ts`. If built as a literal
Unicode emoji character in copy or an R10 content module, `scripts/check-no-emoji.mjs` fails the
build. If built as an image asset ("sprite," his own word two sentences later) referenced by a
component prop, it is not copy at all and R6 does not apply. The two sentences in his own message
disagree on which it is.

**D2.14.3 — renaming `disclosure.why` would relabel every other "why?" in the app.**
He asks to rename "the Why? hidden box" on the tape-measurement step to "Disclaimer." `disclosure.why`
(`src/content/copy.ts:667`, `'why?'`) is one shared `CopyKey` read from at least five sites in
`SetupWizard.tsx` alone (lines 1851, 1876, 1888, 2489) plus `GuidanceScreen.tsx:50`. Editing that
key's string changes the label everywhere it is used, not just on this one box. This is buildable,
but only with a **new** key for this one disclosure, not an edit to the shared one — a decision
about naming, not a blocked request.

**D2.19.3's TIP text is too long for a copy-table key.**
The requested review-screen tip ("ALL YOUR DATA is saved... Settings-> Download .json...") runs to
several sentences and well past R3's twelve-word cap for an `advice.` key and R4's two-sentence cap
for a `banner.` key (00-CONTEXT.md). R10 gives an escape hatch — reference text lives in its own
`src/content/*.ts` module, exempt from R1-R4 but not R5/R6/R11 — so this is buildable, but only as
an R10 module (like `sexRationale.ts`), never as a `banner.`/`advice.` copy-table row.

## Claims that need a number or citation with no source given

**D2.18.5, D2.18.6, D2.18.7 — three new supplement-guidance sections make quantitative or
categorical health claims with no source attached.**
`src/content/supplementGuidance.ts` currently ships four sections (creatine, caffeine, protein, kit),
and every claim in it carries a DOI (lines 21-47). The owner's three new asks —
"how much water... and WHEN to drink it" (D2.18.5), "FAST repetition do not build muscle" and the
need for a cool-down (D2.18.6), and "'workout water' is a scam unless you're doing a marathon"
(D2.18.7) — are exactly the kind of dosed/definitive claim this file's own header says never ships
without a verified citation. He anticipates this himself in the same paragraph ("for stuff that
references can't be found ... let me know"), so this is not a gap in his instructions, just one this
ledger has to surface per 00-CONTEXT rule 1.

**D2.15.6 — his own rewritten description of the Navy body-fat method is self-flagged as unverified.**
His suggested replacement text reads "Methodology of deriving the body fat (is this true?) using
body measurements: US Navy," with his own parenthetical doubt attached. The method this describes is
cited at `src/content/bodyEquations.ts:49-55` (Hodgdon JA, Beckett MB (1984), NHRC 84-11 and 84-29).
The rewritten description should be checked against those reports before it ships, not carried
forward with the question mark still attached.

**D2.11.5/D2.11.6 — an "ND" (non-disclosed) sex value has no equation to run.**
`src/domain/types.ts:20` and `src/domain/schema.ts:139` fix `Sex` to exactly `"male" | "female"`,
and that value feeds three cited, sex-specific equations: Mifflin-St Jeor's fixed sex offset
(`src/content/sexRationale.ts:28-33`), the Navy tape body-fat equation (male/female forms differ in
shape, `bodyfat.ts:118`), and `dailyBeverageTargetML(sex)`. `sexRationale.ts:19-22` already records
a prior, closely related ruling — decision `hrt-no-threshold-ffm-path` — that no predictive RMR
equation has been validated for a sex-unspecified or hormone-therapy case, so none ships. Defaulting
silently to "ND" and running any of these three equations anyway would compute a number with no
cited method behind it, which 00-CONTEXT rule 1 forbids. This needs the owner to choose a documented
fallback (e.g. route "ND" to the same no-sex-term path the app already offers via a body-fat
percentage, which `sexRationale.ts:66-69` already recommends) rather than an implementer inventing one.

**D2.09.5 — "is there a conventional list... one option per UTC?" has no sourced answer yet.**
This is a legitimate, answerable question (the IANA tz database vs. a fixed `Etc/GMT±N` list are the
two real candidates), but the ledger's job is to surface it, not resolve it: a switch to one-zone-
per-offset would need to be checked against `todayLocal(zone)` (`SetupWizard.tsx:926`), which relies
on the real IANA zone's DST rules for correct day-reset timing, before it is adopted.

## Not assessed further

`D2.16.4` asks that `D2.11.*` and `D2.16.*` be assigned to "the same subagent" — a sequencing
preference the orchestrator can honour when splitting work, not a code claim to rule on.
Process-only instructions naming a specific skill or model tier (`D2.02.2`, `D2.12.3`, `D2.18.2`,
`D2.18.4`, `D2.18.10`) carry no file reference to cite and are left as `needs-decision` in the ledger
rather than argued here, per the citation rule above.
