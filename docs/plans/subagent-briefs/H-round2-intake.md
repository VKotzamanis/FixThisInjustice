# Brief H: turn the round-2 feedback into a ledger

This brief is run by a SUBAGENT, and its whole purpose is that the orchestrator never loads the
feedback prose into context. You read the words; the orchestrator reads your ledger.

## Input

`docs/feedback/round-2/onboarding-owner-feedback.md` — the owner's words on the round-2
walkthrough, pasted verbatim. If that file does not exist, stop and say so; do not go looking.

The page he walked is `docs/feedback/walk/r2-onboarding.html`, 20 steps with ids `r2.01` to
`r2.20` plus `r2-onboarding.general`. Step ids in his feedback refer to those.

## What you produce

`docs/feedback/round-2/ledger.md`, and nothing else. One table, one row per distinct claim:

| Id | Step | Verbatim | Target | Kind | Cost |

- **Id** — `D2.<step>.<n>`, e.g. `D2.07.3` for the third claim on step r2.07.
- **Step** — the `r2.xx` id, or `general`.
- **Verbatim** — HIS EXACT WORDS for that claim, quoted, not paraphrased. This column is the
  whole point of the file. If a claim spans two sentences, quote both. Never summarise, never
  tidy his spelling, never merge two claims into one row.
- **Target** — the file and, where you can tell, the symbol or copy key the change lands on. Grep
  for it; do not guess. `src/content/copy.ts` for a string, `src/ui/setup/SetupWizard.tsx` for a
  control, and so on. Write `unknown` rather than a guess.
- **Kind** — one of: `copy` (wording only), `layout`, `behaviour`, `data` (touches stored shape),
  `question` (he asked something rather than requested something), `praise` (no action).
- **Cost** — `contained` (one file, gated by the copy contract), `ripples` (touches the schema,
  the store, or more than three files), `needs-decision` (cannot be built without an answer).

## How to read the feedback

Two things break a ledger, and both have happened before:

1. **Requirements buried mid-paragraph.** He writes long. A single paragraph can carry five
   distinct asks. Round 1's hostile review found ELEVEN claims with no ledger row because they
   sat inside sentences about something else. Go sentence by sentence, not paragraph by
   paragraph.
2. **Reading an observation as a request, or the reverse.** "I saw X" is an observation and gets
   a row with kind `question` or no action; "I want X" is a request. Both get rows; the Kind
   column is what separates them.

## Then, and only then, assess

Add a second file, `docs/feedback/round-2/assessment.md`, holding ONLY the rows that need the
orchestrator's judgement:

- **Contradictions.** Two claims that cannot both be satisfied. Quote both and name the conflict.
  Round 1 had three of these and catching them early saved building the wrong thing twice.
- **Claims the code contradicts.** Before writing this, READ the file named in Target. If the
  code already does what he asks, or cannot do it for a reason recorded in a comment, say so with
  the file and line. Round 1's most useful output was six of these.
- **Claims that would break a gate.** A copy string over its word limit (R1 button 3, R2 hero 8,
  R3 advice 12), an em dash, an emoji, a URL in a string, a heading that is not Title Case (R14).
  Name the rule and the count.
- **Claims that need a number with no source.** This project ships no coefficient without a
  verified citation. If a request implies one, say which.

Quote the file and line for every assertion. An assertion with no file reference is an opinion,
and the orchestrator will discard it.

## What you must NOT do

- Do not edit any source file.
- Do not implement anything.
- Do not paraphrase his words in the Verbatim column.
- Do not decide anything the assessment flags. Surface it; the orchestrator rules on it.

## Report

Reply with: the row count, the count per Kind, the count per Cost, and the ids of any row you
marked `needs-decision`. Nothing else. The orchestrator reads the two files, not your reply.
