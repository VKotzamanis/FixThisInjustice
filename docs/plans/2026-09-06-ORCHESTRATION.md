# Orchestration handout: dispatching round 2

For the session that runs the round-2 briefs. You are the orchestrator: you dispatch, you verify,
you commit. **You do not implement.** The moment you start editing `src/` yourself you become a
seventh agent competing for the same files.

Read `docs/HANDOFF-2026-09-06.md` and `docs/plans/2026-09-06-12-round-2.md` first. This file tells
you how to run the work, not what the work is.

---

## 1. The rule that governs everything

**Every brief edits `src/content/copy.ts`.** Most also edit `src/ui/setup/SetupWizard.tsx`. Two
agents in one working tree will silently overwrite each other, and you will not notice until a
gate fails an hour later.

So: **one agent per working tree.** Either run them one at a time, or give each its own worktree
via the Agent tool's `isolation: "worktree"` and merge the branches yourself.

Whichever branch merges second must regenerate the catalogue. `docs/feedback/catalogue.json` pins
every copy string byte for byte, so two branches that both added keys will both be stale.

## 2. The dispatch order, and why

| Wave | Briefs | Isolation | Why here |
| --- | --- | --- | --- |
| 1 | **K** | own tree | Largest, and it changes `Sex` and the draft model. Everything else is easier once it lands. Do it alone. |
| 2 | **J**, **N** | separate trees | Disjoint: J is `src/ui/intro/`, N is the shell and the time zone. Neither touches the wizard body. |
| 3 | **L** | own tree | One strong-model agent, whole screen. Long-running because it does literature work. |
| 4 | **G**, **I** | separate trees | G widens F's activity slider; I rebuilds steps 5 to 7. Both are round-1 carry-over. |
| 5 | **M** | anywhere | Small, and it must be last: the review page restates what the earlier steps collect, so it cannot be written while they are still moving. |
| 6 | Title Case | own tree | 139 corrections across `copy.ts`. Do it when no other brief is live, then add `scripts/check-title-case.mjs` to CI. |

**K before everything.** It introduces `Sex = 'male' | 'female' | 'nd'` and the two-tier draft.
A brief that lands first and then has to be rewritten against those types wastes a whole agent.

**M last, always.** Round 1 learned this: the review screen restates the other steps.

### Creating a worktree by hand, for a Codex worker

<!-- decision: worktrees-nested-in-repo | status: adopted | supersedes: none -->

Codex has no `isolation: "worktree"`. Make the tree yourself, and **keep it nested inside the
repo** — that is load-bearing, not tidiness. Verified 2026-09-09 on brief N's worktree: its
`node_modules/` is an empty stub, and Node's upward module resolution finds the parent tree's
install (351 packages), so a worker needs no `npm ci` and no network. Vite's cache dir is
`<root>/node_modules/.vite`, which with the stub present resolves inside the worktree, so cache
writes stay in the worker's own sandbox. A worktree outside the repo loses both properties.

```bash
BRIEF=J
WT=".claude/worktrees/brief-${BRIEF}"
git worktree add -b "brief-${BRIEF}" "$WT" main
mkdir -p "$WT/node_modules"        # the stub. Do not populate it
git -C "$WT" log --oneline -1      # RECORD THIS
```

**Run that last line and record the base commit, every time.** Brief N's worktree branched from
`739b88e`, the session's starting commit, not from `main`, so it began without brief K. It caught
this itself and fast-forwarded, but it cost an hour. Do not assume isolation branches from `HEAD`.

## 3. The dispatch prompt

Give every agent the same four things. Nothing else is reliably read.

1. The working directory.
2. **Read `docs/plans/subagent-briefs/00-CONTEXT.md` IN FULL, then your brief IN FULL, before
   touching anything.**
3. The two or three rules that will actually get its work rejected, repeated inline. Do not rely
   on it finding them in the context file — repeat them in the prompt.
4. The verification block, and an instruction to paste ACTUAL output.

State plainly that the agent HAS shell access, because `00-CONTEXT.md` contains a line saying the
orchestrator runs the commands, which is left over from when agy could not.

Always repeat these, whatever the brief:

- **Never invent a citation, a DOI, a dose or a coefficient.** The one unrecoverable error here.
- **The catalogue trap**, in full, with the four commands in order.
- **R14**: labels, headings and control names are Title Case; a heading is a noun phrase. New keys
  must comply even though 139 old ones do not.
- **The baseline test count**, so a regression is visible. Currently 123 files, 2462 tests.

## 4. Verify. Do not read the report and believe it.

**Three of five round-1 reports claimed clean runs that were not.** One shipped a module with no
contract test; one silently dropped a feature from a skin; one left the top bar empty through the
whole of setup. Every one was found by re-running the gates, and none by reading the report.

After each brief, run yourself:

```
npx tsc -b --force
npx eslint .
npx vitest run
node scripts/check-no-emoji.mjs
node scripts/alpha-catalogue.mjs --check
node scripts/alpha-walk-pages.mjs --check
git grep -nEi '\b(vyvans[e]|lisdexamfetamin[e]|ymc[a]|amphetamin[e])\b' -- . ':!docs/review/' ':!docs/plans/' ':!REFERENCES.md' ':!graphify-out/'
```

The last one must print nothing. It greps for identifiers CI rejects, and it once failed a deploy
because a test spelled the banned words out to assert their absence. Use one-character classes if
you ever need to write them.

Then check the claims the brief made that a gate cannot: that a citation matches the engine that
uses it, that a colour is a token and not a literal, that a decision the code records was not
quietly reversed.

## 5. Commit with pathspecs. Always.

```
git add -- <the exact files>          NOT git add -A
```

A bare `git add -A` in this repository sweeps up whatever another agent has mid-write. It has
already happened once: commit `0d89936` is titled as a docs change and carries fifteen source
files of brief F's work, because the orchestrator staged everything while F was still writing.
Nothing was lost, but the history now misdescribes itself.

Write the message so it says what changed AND why it departs from what was asked, where it does.
That record is the reason round 1's decisions did not have to be re-argued.

## 6. What needs the owner, and what does not

**Do not park work behind a decision the owner has already made, or one that is yours to take.**
Round 1 filed thirty claims as "blocked on design decisions" when the icons were his to draw, the
retagging was an engineering question, and "rethink the goal page" was an instruction. He caught
it and he was right.

Genuinely his: anything that changes what the app CLAIMS (a dose, a safety statement), anything
that spends money or reputation, and the assets, which he has taken.

Yours: engineering approach, file layout, which test proves a thing, and any conflict between two
of his own instructions — surface it with both quoted, then proceed on the reading you state.

## 7. The failure modes this project has actually hit

- **A subagent reporting a passing test it never ran.** Verify.
- **A copy change without a catalogue regeneration.** Red suite, desynchronised review pages.
- **A colour that works on one skin.** Three ship: lime ground, near-black, charcoal. A literal in
  a component stylesheet is the bug.
- **A fix that breaks a neighbouring claim.** Commit-on-Next versus survives-a-closed-browser is
  the live example; the brief solves it, but look for the pattern.
- **agy returning nothing.** It auto-denies every tool call in headless mode and the error blames
  permissions, which is misleading. Neutral directory, no file paths in the prompt, explicit "do
  not read, write or run anything", redirect stdout.
- **Deleting a shared string.** `error.valueRequired` has ten call sites. Grep before removing.

## 8. Done looks like

Every brief verified, committed, pushed, and deployed green — CI and Deploy both pass and the live
site serves the new build. Then regenerate the round-2 walkthrough page from
`scripts/alpha-retest.mjs`, republish it to the SAME artifact URL so his links keep working, and
tell him which claims are closed and which are not.

The register at https://claude.ai/code/artifact/0058cdef-4798-4516-a337-5142b6d81877 is round 1's
and stays as it is. Round 2 gets its own when the ledger lands.
