# Read this first

You are picking up **FixThisInjustice**, a training-log web app the owner built for himself and a
few friends. React 19, TypeScript, Vite, a Zustand store over one `localStorage` document, vitest,
strict ESLint, deployed to GitHub Pages.

This file is the entry point. It replaces reading the whole history.

---

## 1. What to do first

```
git log --oneline -15          # what just happened
npx vitest run                 # 128 files, 2605 tests as of 2026-09-09. Re-derive; do not quote
cat docs/plans/2026-09-06-ORCHESTRATION.md
git worktree list              # if any agent worktree exists, CHECK ITS BASE COMMIT first
```

## 1a. Round 2 is CLOSED and PUSHED, 2026-09-09

All ten briefs merged and pushed as `9544925`. Re-derive every number below rather than quoting
it; this table has been wrong before, on seven rows at once.

| Brief | Claims | Merged as |
| --- | --- | --- |
| **F** | equipment sliders | round 2 wave 0 |
| **K** | r2.10 to r2.16 | `3f43e11` |
| **N** | r2.05, r2.09 | `0f2383e` |
| **O** | r2.09, the Settings half | `941614e` |
| **J** | r2.01 to r2.03 | `8703a18` |
| **L** | r2.18 | `550f9f1` |
| **G** | C1.09.5 reopened | `bda7398` |
| **I** | C1.10.x to C1.12.x, Parts 1, 2, 4 | `0488587` |
| **M** | r2.19 | `a89afa9` |
| **P** | R14, the Title Case sweep | `fb0757a` |

Suite **128 files, 2605 tests**, green in all four zones. Title case **0 of 240**, and
`check-title-case.mjs` is in CI for the first time.

### Seven defects fixed that belonged to no brief

Found by re-running gates and checking claims against the tree, never by reading a report.

1. **The Settings time-zone list** still built 418 zones in IANA order. Became brief O.
2. **The REFERENCES control read at 1.41:1 on limelight**, fuchsia on lime. `tokens.css` records
   the rule it broke, "pink is never type", and `alpha-walk-pages.mjs` ASSERTS that rule and was
   green throughout, because it only reads the generated review pages and never the app's own
   stylesheets. **THAT GAP IS STILL OPEN.**
3. **The round-trip property test ran unseeded**, the only nondeterministic test here. Seeded at
   20260909. No failing seed exists: 120 seeds and 60000 documents found nothing.
4. **`schema.ts` restated the PAL bounds as literals** one file from the test written to stop that
   drift. Now derived from `ACTIVITY_BAND`.
5. **The nine-stop activity slider had three readouts.** Brief G widened the control and left the
   feedback at band level, so six of nine positions were indistinguishable from a neighbour.
6. **The target date was chosen before training frequency** (C1.10.8). `availability` is folded
   into `training` now.
7. **`REVIEW_DATA_HOW_TO_MOVE` quoted control names as literals** and went stale within hours when
   the Title Case sweep renamed one. Now derived from `DEFAULT_COPY`.

### The one defect shape that recurred all day

**A value transcribed into a second place: correct when written, silently wrong later.** Numbers
4, 5 and 7 above are all it, and so were the feasibility band thresholds and the slider examples
keyed by index rather than by value. When you find a constant restated somewhere, derive it or
add a test that reads both sides from the same source.

### Three things that cost real time and will again

- **Assume every agent worktree branches from a STALE commit.** Every agent dispatched on
  2026-09-09 did, without exception, including two dispatched in the same message. Put
  `git merge main` in the agent's own prompt as step 1 and have it report both commits.
- **A copy key may be claimed by exactly ONE part** in `alpha-parts.mjs`. A collision always means
  a new key, never a second claim.
- **The wizard test fixtures navigate by COUNTING `next()` presses**, not by naming steps. Folding
  one step out cost seven separate navigation routes across two files, and each failure surfaced
  lines later as a missing control rather than as a navigation error.

### Left for round 3

- **Brief I2**, the just-in-time scheduler: written, deliberately not dispatched.
- **r2.17's other half.** The training step now has three working sliders; `goal`, `availability`
  and `programme` were revised without becoming sliders. The owner's call.
- **The noun-phrase list** in brief P's report: about ten strings now Title Case but still
  questions or sentences. R14's second clause is review, not automation.
- **Nobody has read the 74 audited papers against the claims the code makes from them.** The audit
  in `docs/review/2026-09-09-doi-audit.md` proves every DOI resolves and its metadata matches. It
  proves nothing about whether the paper supports the claim.

## 2. The state, in one table

| | |
| --- | --- |
| Live | https://vkotzamanis.github.io/FixThisInjustice/ |
| Round 1 | Closed. 80 of 127 claims shipped |
| Round 2 | Open. 91 claims ledgered, every ruling taken. F, K, N, O, J, L, G merged; I in flight; M and the Title Case sweep waiting. See section 1a |
| Suite | 126 files, 2561 tests, green, 2026-09-09 |
| Failing on purpose | `scripts/check-title-case.mjs`, 139 of 229 naming keys. Not in CI until they are fixed. Run it rather than quoting this row: the count moves with every key added |

## 3. The five rules that get work rejected

1. **Never invent a citation, a DOI, a dose or a coefficient.** This app makes health claims. Every
   number in `src/domain/nutrition.ts` and `bodyfat.ts` carries a verified source, and a value the
   content review marked PARAPHRASE or COULD NOT VERIFY ships nowhere. If you need a number you do
   not have, say so. A fabricated citation is the only unrecoverable error here.
2. **Regenerate the catalogue after ANY copy change.** `docs/feedback/catalogue.json` pins every
   string byte for byte and a committed test asserts it:
   `node scripts/alpha-catalogue.mjs && node scripts/alpha-catalogue.mjs --check && node scripts/alpha-walk-pages.mjs && node scripts/alpha-walk-pages.mjs --check`
   A new key also needs a part in `scripts/alpha-parts.mjs` and a step in `scripts/alpha-walk.mjs`.
3. **Stage with pathspecs.** `git add -- <files>`, never `git add -A`. Multiple agents share this
   tree. A bare stage has already swept another agent's half-written work into an unrelated commit.
4. **Three skins ship.** limelight (lime ground, black ink, pink accent, the default), clinical
   (near-black), board (charcoal). Every colour comes from a token in `src/ui/styles/tokens.css`.
   A hex literal in a component stylesheet is the bug, not the style.
5. **Verify your own work.** `npx tsc -b --force`, `npx eslint .`, `npx vitest run`,
   `node scripts/check-no-emoji.mjs`, both catalogue checks, and the personal-data grep in
   `.github/workflows/ci.yml`.

## 4. How the owner works, which matters more than it sounds

- **He tests on limelight.** Changing only the default copy table shows him nothing. Check whether
  a string has an override in `copy.limelight.ts` before you rename it.
- **He writes long, and requirements hide mid-paragraph.** A single paragraph routinely carries
  five distinct asks. A hostile review of round 1 found eleven claims missing from that round's
  ledger, every one buried inside a sentence about something else. Read sentence by sentence.
- **He wants rulings, not questions.** The failure he has caught twice is work parked behind a
  blocker that was either already decided or was yours to decide. Ask only when the answer changes
  what the app CLAIMS, or spends his money or reputation.
- **He would rather be contradicted than agreed with**, when the evidence contradicts him. Six
  pushbacks in round 1 stuck because each carried a file and a line. One with no evidence is an
  opinion and he will treat it as one.
- **He reverses his own earlier decisions**, and that is allowed. Round 2 moved a modal's close
  button to the corner round 1 had explicitly rejected. Note it, update the comment that records
  the old ruling, and move on. It is not a contradiction to escalate.
- **He notices prose.** "You are being too corporate and neutral" was fair. Short sentences,
  bullets over walls, a heading before any block longer than three lines. Load the `wait-what`
  skill before rewriting explanatory text: that is the "I don't get it" / ELI5 skill he means.
- **Labels and headings are Title Case**, and a heading is a noun phrase. Copy-contract R14. He
  raised it three times and then said he would stop mentioning it, which is why it is a script.

## 5. Traps this project has actually fallen into

- **A subagent reporting a passing test it never ran.** Three of five round-1 reports did. Every
  one was caught by re-running the gates and none by reading the report.
- **Deleting a shared copy key.** `error.valueRequired` has ten call sites. `disclosure.why` has
  six. `button.continue` is overridden per skin. Grep before you rename.
- **Rebuilding something that already exists.** The round-2 assessment caught three such
  instructions in a brief written by the previous orchestrator. Read the code before writing a
  task that says "add".
- **Fixing one claim and breaking its neighbour.** Commit-on-Next versus survives-a-closed-browser
  is the live example; the brief solves it by persisting both tiers. Look for the pattern.
- **agy returning nothing.** It auto-denies every tool call in headless mode and blames
  permissions, which is misleading: the cause is a prompt that invites tool use. Run from a
  directory that is not this repo, put no file paths in the prompt, open with "Do not read any
  file. Do not write any file. Do not run any command", and redirect stdout to a file you read.
- **`toISOString()` outside `src/domain/dates.ts`.** ESLint bans it for a civil-date defect class.
- **Emoji.** `♂` and `♀` are rejected by both gates: they satisfy `Extended_Pictographic` and sit
  inside U+2600 to U+27BF. Draw glyphs in CSS or SVG.

## 6. Where everything is

| Path | What |
| --- | --- |
| `docs/plans/2026-09-06-ORCHESTRATION.md` | How to dispatch and verify. Read before dispatching |
| `docs/plans/2026-09-06-12-round-2.md` | Round 2: the rulings, the brief queue, what is not done |
| `docs/plans/subagent-briefs/` | `00-CONTEXT.md` plus briefs A to N. A to F are worked examples |
| `docs/feedback/round-2/` | His words verbatim, the 91-row ledger, the assessment |
| `docs/HANDOFF-2026-09-06.md` | Round 1's close, and the twelve places shipped behaviour differs from what he asked, with the evidence |
| `docs/design/2026-09-01-copy-contract.md` | R1 to R14, and where copy may live |
| `docs/feedback/alpha-fixture.json` | Synthetic data reaching states a fresh install cannot. Import via Settings, Data |
| `agy-artifacts/research-*.md` | Four research runs behind the health claims |

**The engines carry their own citations.** `src/domain/nutrition.ts` and `src/domain/bodyfat.ts`
name the equation, the DOI and what was verified, for every coefficient, and record what was
rejected and why. Read them before changing a number. They will usually have anticipated you.

## 7. Not yours

**All assets.** The owner has the manifest, the prompts and the register, and he is generating.
Do not draw, generate or re-specify one. Placeholder frames stay until artwork arrives.

Two things are still his and still open: the app icon on the Home Screen is the PREVIOUS app's
`W.CONSOLE` logo and ships today, and the subsection sprite cannot be the real person's likeness
that was asked for.
