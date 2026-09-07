# Read this first

You are picking up **FixThisInjustice**, a training-log web app the owner built for himself and a
few friends. React 19, TypeScript, Vite, a Zustand store over one `localStorage` document, vitest,
strict ESLint, deployed to GitHub Pages.

This file is the entry point. It replaces reading the whole history.

---

## 1. What to do first

```
git log --oneline -15          # what just happened
npx vitest run                 # 123 files, 2462 tests, all passing. If not, stop and find out why
cat docs/plans/2026-09-06-ORCHESTRATION.md
```

Then dispatch **wave 2**: briefs **J** and **N**, in separate worktrees, in parallel. They are
disjoint, J being `src/ui/intro/` and N the shell and the time zone, and neither touches the wizard
body. Whichever branch merges second must regenerate the catalogue.

Wave 1 is done. Brief K merged on 2026-09-06 as `3f43e11`; it went first and alone because it
changed the `Sex` type and the wizard's draft model, and anything landing before it would have been
rewritten against it.

Everything you need is already written. **Do not re-plan the round.** Six briefs remain, every open
question is ruled, and the dispatch order is set.

## 2. The state, in one table

| | |
| --- | --- |
| Live | https://vkotzamanis.github.io/FixThisInjustice/ |
| Round 1 | Closed. 80 of 127 claims shipped |
| Round 2 | Open. 91 claims ledgered, every ruling taken, briefs F and K shipped, six waiting |
| Suite | 123 files, 2462 tests, green |
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
