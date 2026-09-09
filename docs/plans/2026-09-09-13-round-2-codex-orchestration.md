# Round 2, Finished With Codex Workers: Implementation Plan

> **For agentic workers:** this is an ORCHESTRATION plan, not a code plan. The code contract for
> every task already exists in `docs/plans/subagent-briefs/`. A brief is the spec; this file is the
> dispatch order, the sandbox, the model tier, and the accept/reject gate. Do not restate a brief
> here and do not let this file and a brief drift apart: **when they disagree, the brief wins on
> what to build, this file wins on how to run it.** Steps use `- [ ]` for tracking.

**Goal:** close round 2 — verify and merge brief N, run briefs J, L, G, I and M, fix the live
Settings time-zone defect, and clear the 139 Title Case failures — using `codex exec` workers for
the implementation and Claude for orchestration, verification, and every load-bearing citation.

**Architecture:** one Codex worker per brief, each in its own git worktree nested under
`.claude/worktrees/`, dispatched non-interactively with `--sandbox workspace-write`. Claude never
edits `src/`. Claude runs every gate itself on the merge candidate, because the one failure mode
this project has hit repeatedly is a subagent reporting a test it never ran. Branches merge
serially into `main`; whichever merges second regenerates the catalogue.

**Tech Stack:** React 19, TypeScript, Vite, Zustand over one `localStorage` document, vitest,
strict ESLint, GitHub Pages. Workers: Codex CLI 0.153.4, ChatGPT-account auth.

---

## Global Constraints

Copied verbatim from `docs/plans/subagent-briefs/00-CONTEXT.md` and
`docs/plans/2026-09-06-ORCHESTRATION.md`. Every task's requirements implicitly include this section.

- **Never invent a citation, a DOI, a dose, or a study.** The only unrecoverable error in this
  project. A missing number is written `TODO: number not supplied`, not filled.
- **Never edit a file your brief does not list.** Report it and stop.
- **Regenerate the catalogue after ANY copy change**, in this order:
  `node scripts/alpha-catalogue.mjs && node scripts/alpha-catalogue.mjs --check && node scripts/alpha-walk-pages.mjs && node scripts/alpha-walk-pages.mjs --check`
  A new key also needs a part in `scripts/alpha-parts.mjs` and one step in `scripts/alpha-walk.mjs`.
- **Stage with pathspecs.** `git add -- <files>`, never `git add -A`.
- **Three skins ship:** limelight (lime ground, black ink, pink accent, default), clinical
  (near-black), board (charcoal). Every colour is a token in `src/ui/styles/tokens.css`. A hex
  literal in a component stylesheet is the bug.
- **R14:** labels, headings and control names are Title Case; a heading is a noun phrase.
- **R5** no em dash. **R6** no emoji, and U+2600–U+27BF counts, so `♂`/`♀` are rejected.
  **R8** no exclamation mark in the default table. **R11** name the quantity: `body mass` not
  `weight`, `kcal` not `calories`.
- **`toISOString()` is banned outside `src/domain/dates.ts`** by ESLint, for a civil-date defect class.
- **Stored units never change.** `KG_PER_LB = 0.45359237`, `1 in = 2.54 cm`, both exact.
- **Baseline before this plan starts, measured on `main` at `0dd4435` on 2026-09-09:**
  suite **123 files, 2462 tests, all passing** in 2m47s; `check-title-case` 139 of 229; `check-no-emoji` 120 files clean;
  both catalogue checks PASS. Re-derive these rather than quoting them.

---

<!-- decision: codex-workers-for-round-2 | status: adopted | supersedes: claude-agent-tool-subagents -->
## What Changes Because The Workers Are Codex

Five differences from `docs/plans/2026-09-06-ORCHESTRATION.md`, which assumed Claude Agent-tool
subagents. Each is a defect waiting to happen if it is not handled before the first dispatch.

1. **`00-CONTEXT.md` currently forbids the shell.** It says "You have no shell permission in this
   environment. Do not try to run `npx`, `node`, `git`, `rm` or anything else", and it also says
   "When your brief and this file disagree, this file wins." A Codex worker reads that and refuses
   to run the gates or regenerate the catalogue — and a branch that cannot regenerate the catalogue
   fails its own gate by construction. **A prompt-level override is not enough against a document
   that claims precedence.** Fix the document. Task 0.1.
2. **Codex has no `isolation: "worktree"`.** Worktrees are created by hand and passed with `-C`.
3. **Worktrees must stay nested inside the repo.** Verified on N's worktree: its `node_modules/` is
   an empty stub, and Node's upward resolution finds the parent tree's 278 MB install, so no
   `npm ci` and no network are needed. Vite's cache dir is `<root>/node_modules/.vite`, which with
   the stub present resolves to the worktree's own directory — writes stay inside the sandbox. A
   worktree placed outside the repo loses both properties.
4. **Codex is an independent model, not a paraphrase.** Its output is the authoritative return
   value of the call, not a suggestion to be silently edited. Where it is wrong, resume the session
   with evidence rather than patching its answer in private.
5. **Codex does not have the `wait-what` skill**, which is the ELI5 register the owner named by
   name in briefs J and L. Prose written in that register is drafted by Claude and handed to the
   worker as fixed input. See Task 3.1 and Task 4.
6. **A worker cannot commit, and the plan changed to suit.** Measured 2026-09-09 on the first live
   dispatch: `git commit` inside a nested worktree fails with `Unable to create
   .git/worktrees/<name>/index.lock: Read-only file system`, because git's metadata and object
   store are in the MAIN repository's `.git`, outside the worker's writable root. `--add-dir` on
   that `.git` would fix it and would also hand the worker every branch's refs. **Ruled: the
   orchestrator stages and commits.** The worker writes `MY-BRIEF-<letter>.patch` into its own
   worktree before reporting, so its work survives independently of the working tree. The
   `<execution_policy>` block below reflects this.

### The canonical dispatch

Every implementation task uses this shape. `<BRIEF>`, `<MODEL>`, and the prompt body change; nothing
else does.

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
BRIEF=J                       # the letter
WT=".claude/worktrees/brief-${BRIEF}"
git worktree add -b "brief-${BRIEF}" "$WT" main
mkdir -p "$WT/node_modules"   # stub: keeps vite's cache inside the sandbox
git -C "$WT" log --oneline -1 # RECORD THIS. Confirm the base is current main, not an older commit

filename=$(openssl rand -hex 4)
codex exec --skip-git-repo-check --sandbox workspace-write \
  -C "$(pwd)/${WT}" \
  -m <MODEL> \
  -o "$(pwd)/docs/review/2026-09-09-brief-${BRIEF}-report.md" \
  2>>"/tmp/codex-${filename}.log" <<'EOF'
<prompt body>
EOF
```

Run each dispatch with `run_in_background: true` and collect with `TaskOutput`; these are long calls.

### The prompt body, which is the same five blocks every time

```
<task>
You are implementing ONE brief in the FixThisInjustice repository. Read
docs/plans/subagent-briefs/00-CONTEXT.md IN FULL, then docs/plans/subagent-briefs/<BRIEF>.md
IN FULL, before you touch anything. Do exactly what the brief says and nothing else.
Done means: every claim in the brief implemented, every gate below passing, and one commit
made on this branch.
</task>

<scope>
Workspace: the git worktree you are running in. It is a real checkout of `main`.
Out of scope: any file your brief does not list. If a change seems to require one, say so in
your report and stop. Do not touch docs/ except your own report.
</scope>

<execution_policy>
YOU HAVE A SHELL AND YOU MUST USE IT. Run npx, node and git yourself. `node_modules` resolves
from the parent directory; do not run `npm install` and do not use the network.
Edits: allowed, inside your brief's file list only.
Destructive actions: stop and ask before executing.
DO NOT COMMIT. It fails in this worktree: git's metadata is outside your writable root. The
orchestrator commits your work after verifying it. Before you report, save your diff:
  git add -A --intent-to-add . && git diff > MY-BRIEF-<letter>.patch
That writes only inside your own worktree and stages nothing. Name the file in your report.
</execution_policy>

<grounding_rules>
NEVER invent a citation, a DOI, a dose or a study. If your brief does not supply a number with a
source, you do not have one: write `TODO: number not supplied` and say so in your report. A
fabricated citation is the only unrecoverable error in this project.
NEVER put a hex colour literal in a component stylesheet. Three skins ship; every colour is a
token in src/ui/styles/tokens.css.
Labels, headings and control names are Title Case and a heading is a noun phrase (R14). New keys
must comply even though 139 existing ones do not.
If you add, edit or delete ANY copy key you MUST run, in this order:
  node scripts/alpha-catalogue.mjs
  node scripts/alpha-catalogue.mjs --check
  node scripts/alpha-walk-pages.mjs
  node scripts/alpha-walk-pages.mjs --check
A NEW key also needs a part in scripts/alpha-parts.mjs and exactly one step in scripts/alpha-walk.mjs.
</grounding_rules>

<verification_loop>
Run all of these and fix what fails:
  npx tsc -b --force
  npx eslint ./src ./scripts
  npx vitest run
  node scripts/check-no-emoji.mjs
  node scripts/alpha-catalogue.mjs --check
  node scripts/alpha-walk-pages.mjs --check
Baseline before your change: run `npx vitest run` BEFORE you edit anything and record the
file and test counts. A drop in either afterwards is a regression. At the head of this plan
the count was 123 files / 2462 tests; every merged brief raises it.
`npx eslint .` reports 24 phantom errors from this worktree's dependency-less worker/ copy;
scope it to ./src ./scripts as above.
A failing test is not "done with a caveat". If a test fails because it asserted the behaviour your
brief replaced, update it and say which and why. If it fails for any other reason, stop and report.
</verification_loop>

<output_contract>
Reply with exactly five sections and nothing else:
1. FILES CHANGED — every path, one line each.
2. COMMANDS RUN — each command and its ACTUAL pasted output, not a summary.
3. CLAIMS DONE — the claim ids from your brief you completed.
4. CLAIMS NOT DONE — the ids you did not, and why.
5. ANYTHING YOU CHANGED THAT THE BRIEF DID NOT ASK FOR — including test edits.
Under 900 words. Do not say a command passed without pasting its output.
</output_contract>
```

### Model tier and sandbox, per task

Per `~/.claude/skills/codex-subagent/SKILL.md`. Announced, not confirmed.

| Task | Model | Effort | Sandbox | Why |
| --- | --- | --- | --- | --- |
| N deep review (1.3) | `gpt-5.6-sol` | high | `workspace-write`, no edits | Audit class. Needs exhaustive exploration |
| O SettingsView (2) | `gpt-5.6-luna` | default | `workspace-write` | ~10 lines, fully specifiable up front |
| J intro (3) | `gpt-5.6-terra` | default | `workspace-write` | Normal multi-file implementation |
| L sourcing sweep (4.1) | `gpt-5.6-terra` | medium | bypass + `web_search="live"` | Needs shell network for DOI resolution |
| G activity slider (5) | `gpt-5.6-terra` | default | `workspace-write` | Every PAL and sentence supplied in-brief |
| I goal/target (6) | `gpt-5.6-sol` | high | `workspace-write` | 17 claims, a layout constraint to satisfy, real trade-offs |
| M review page (7) | `gpt-5.6-terra` | default | `workspace-write` | Small, but edits the largest file in the repo |
| Title Case (8) | `gpt-5.6-luna` | medium | `workspace-write` | Bulk pattern edit, gate is a script that counts |

---

<!-- decision: worker-shell-access-restored | status: adopted | supersedes: orchestrator-runs-all-checks -->
<!-- decision: worktrees-nested-in-repo | status: adopted | supersedes: none -->
## Task 0: Unblock The Pipeline

**Files:**
- Modify: `docs/plans/subagent-briefs/00-CONTEXT.md` — the shell section
- Modify: `.gitignore`
- Modify: `docs/plans/2026-09-06-ORCHESTRATION.md` — the worktree recipe

**Interfaces:**
- Produces: a `00-CONTEXT.md` whose execution section is true for a Codex worker; a clean
  `git status`, which is the precondition the codex-subagent skill sets for any write-capable
  dispatch.

- [ ] **Step 1: Replace the shell prohibition in `00-CONTEXT.md`**

Delete the section headed `## You do NOT run shell commands` in full, including the
`COMMANDS I COULD NOT RUN` instruction and the `DELETE THESE` fallback, and put this in its place:

```markdown
## You DO run shell commands

You have a sandboxed shell in your own git worktree. **Run the checks yourself.** `node_modules`
resolves from the parent directory, so `npx` works with no install and no network.

Run these, in this order, and fix what fails before you report:

    npx tsc -b --force               # expect: no output, exit 0
    npx eslint ./src ./scripts       # expect: no output, exit 0
    npx vitest run                   # expect: all files passed, 0 failed
    node scripts/check-no-emoji.mjs  # expect: OK - N file(s) clean

Plus the catalogue block above if you touched copy. `npx eslint .` reports 24 phantom errors
from the worktree's dependency-less `worker/` copy; scope

**Commit before you finish.** `git add -- <the exact files>`, never `git add -A`: other agents
share this tree. Uncommitted work inside your worktree is not backed up.

If your brief asks you to DELETE a file, delete it with `git rm` and say so in your report.
```

Then, in `## How to report back`, change section 2's name back to **COMMANDS RUN** and delete the
sentence "The orchestrator runs every check listed below and sends you the failures to fix."

- [ ] **Step 2: Verify no other brief contradicts it**

Run: `grep -rn 'no shell\|COULD NOT RUN\|orchestrator runs\|DELETE THESE' docs/plans/subagent-briefs/`
Expected: no hits after step 1. Any hit is a second copy of the same trap; fix it the same way.

- [ ] **Step 3: Ignore `.claude/`**

`git status` currently shows `?? .claude/`, which holds two 20 MB worktrees. That is the live
`git add -A` hazard rule 3 exists to prevent, and it blocks the clean-tree precondition. Append to
`.gitignore`:

```
# Agent worktrees and local Claude Code state. Worktrees are nested here deliberately: Node's
# upward module resolution finds the parent's node_modules, so a worker needs no install and no
# network, and vite's cache dir stays inside the worker's own sandbox.
.claude/
```

- [ ] **Step 4: Record the worktree recipe in the orchestration handout**

Add to `docs/plans/2026-09-06-ORCHESTRATION.md` §2, under the wave table: the `git worktree add`
plus `mkdir -p node_modules` stub recipe, and the standing instruction to run
`git -C "$WT" log --oneline -1` immediately after creating one and record the base commit. Brief
N's worktree branched from `739b88e` rather than `main` and cost the last session an hour.

- [ ] **Step 5: Prune the merged worktree**

`worktree-agent-a90ad95b11fd38dd7` is at `0c9604e`, already an ancestor of `main`.

```bash
git worktree remove .claude/worktrees/agent-a90ad95b11fd38dd7
git branch -d worktree-agent-a90ad95b11fd38dd7
```

Expected: both succeed. If `git branch -d` refuses, the branch is not merged — stop and find out why.

- [ ] **Step 6: Commit**

```bash
git add -- .gitignore docs/plans/subagent-briefs/00-CONTEXT.md docs/plans/2026-09-06-ORCHESTRATION.md docs/plans/2026-09-09-13-round-2-codex-orchestration.md
git commit -m "docs: workers now have a shell, and worktrees are ignored

00-CONTEXT.md told every agent it had no shell, which was true for the agy
generation and false for a Codex worker. It also claims precedence over the
brief, so a prompt-level override would have lost. Codex runs its own gates and
regenerates its own catalogue now.

.claude/ holds the worktrees. Untracked but not ignored is the exact state
rule 3's git add -A hazard needs."
```

---

## Task 1: Verify Brief N, Then Merge It

Branch `worktree-agent-af85b546ca8c9a7ac` at `53db114`. Confirmed 2026-09-09: its merge base with
`main` is `82e4a06` and `3f43e11` (brief K) IS an ancestor, so the agent's claim that it
fast-forwarded onto `main` is true. **Nothing else in its report has been checked.** Report:
`docs/review/2026-09-06-brief-N-report.md`.

**Files:** none modified by Claude. This task reads and merges.

**Interfaces:**
- Consumes: `groupTimeZones` and `PROMINENT_ZONES` from N's `src/domain/dates.ts`.
- Produces: `groupTimeZones`, which Task 2 (brief O) consumes for `SettingsView`.

- [ ] **Step 1: Run every gate in N's worktree, personally**

```bash
WT=.claude/worktrees/agent-af85b546ca8c9a7ac
cd "$WT" && npx tsc -b --force && npx eslint ./src ./scripts && npx vitest run 2>&1 | tail -8
node scripts/check-no-emoji.mjs
node scripts/check-title-case.mjs | tail -1
node scripts/alpha-catalogue.mjs --check && node scripts/alpha-walk-pages.mjs --check
git grep -nEi '\b(vyvans[e]|lisdexamfetamin[e]|ymc[a]|amphetamin[e])\b' -- . ':!docs/review/' ':!docs/plans/' ':!REFERENCES.md' ':!graphify-out/'
```

Expected: tsc silent; eslint silent; vitest **124 files, 2514 tests, 0 failed**; no-emoji OK;
title-case **139 of 233**; both catalogue checks PASS; the grep prints **nothing**.
Any deviation stops the merge.

- [ ] **Step 2: Run the gate N's own subject matter demands and the handout does not list**

`npm run test:tz` runs the suite under UTC, Europe/Athens, America/New_York and
America/Los_Angeles. N rewrote time-zone grouping; a single-TZ green suite does not cover it.

Run: `cd "$WT" && npm run test:tz`
Expected: four blocks, all passing. This is the check that would catch a grouping that only holds
in the developer's own zone.

- [x] **Step 3: Confirm the ESLint stash claim rather than believing it — DONE 2026-09-09, CONFIRMED**

N reported 24 ESLint errors, all in `worker/`, and said it proved they pre-date its change by
stashing. Proved independently from a tree N never touched, `main` at `0dd4435`:

```
$ npx eslint .                 -> 24 problems (24 errors, 0 warnings)
$ npx eslint ./src ./scripts   -> no output, exit 0
```

The count matches N's and `src/` plus `scripts/` are clean, so the errors are outside both and
N introduced none of them. **N's claim stands, and the scoped `eslint ./src ./scripts` this plan
puts in every worker prompt is safe** — a worker inherits no pre-existing failure from it.

- [ ] **Step 4: Dispatch the deep review to Codex**

The four claims no gate can check. Read-only in effect — the prompt forbids edits.

```bash
filename=$(openssl rand -hex 4)
codex exec --skip-git-repo-check --sandbox workspace-write \
  -C /home/vx/Desktop/Claude/FixThisInjustice/.claude/worktrees/agent-af85b546ca8c9a7ac \
  -m gpt-5.6-sol --config model_reasoning_effort="high" \
  2>>"/tmp/codex-${filename}.log" <<'EOF'
<task>
Adversarially review ONE commit. Do not edit any file. Report only.
The commit is HEAD (53db114) on this branch. `git show --stat HEAD` and `git diff HEAD~1 HEAD`
are your inputs. Four specific claims are in question; answer each with file:line evidence, and
answer "insufficient evidence" rather than speculating.
</task>

<questions>
1. PROMINENT_ZONES in src/domain/dates.ts: does ANY entry encode a population figure, a
   "largest city" ranking, or any other fact not derivable from the IANA database itself? The
   author claims it invented no population data. Verify or refute. Quote the list.
2. The setup banner (src/ui/setup/setupBanner.tsx): can it EVER alter the user's own typed text
   before rendering it? Look for case changes, trimming, truncation, capitalisation helpers,
   Title Case functions, or template interpolation that would mangle a name containing regex
   replacement patterns such as $& or $1. State exactly what path the user's name takes from
   store to DOM.
3. Every CSS rule added or changed by this commit in src/app/appShell.css and
   src/ui/setup/setup.css: does any declare a colour as a hex literal, an rgb()/hsl() literal, or
   a named colour, rather than a var(--token)? List every offending line. Three skins ship and a
   literal is a bug.
4. The numbers 59 and 418 appear in the code and the tests. Do they come from the ruling in
   docs/plans/2026-09-06-12-round-2.md section A4, or were they recomputed by this commit's own
   test helpers in a way that would agree with any implementation, correct or not? In other
   words: if groupTimeZones were subtly wrong, would any of these tests fail? Name the test that
   would catch it, or say none would.
</questions>

<output_contract>
Four numbered answers. Each: VERDICT (confirmed / refuted / insufficient evidence), then the
file:line evidence. Under 600 words total. No prose preamble.
EOF
```

- [ ] **Step 5: Spot-check the review rather than taking it on trust**

Question 3 is a one-line grep and is cheaper to verify than to believe:

```bash
git -C "$WT" diff HEAD~1 HEAD -- '*.css' | grep -nE '^\+.*(#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\()' 
```
Expected: nothing, or only lines inside a comment. A hit that Codex missed means its other three
answers get re-read, not accepted.

- [ ] **Step 6: Merge, or send it back**

Merge only if steps 1–5 all pass. Codex resumes with a follow-up rather than a fresh dispatch if
anything is refuted.

```bash
git merge --no-ff worktree-agent-af85b546ca8c9a7ac -m "Merge brief N: the dynamic banner, the time zone, and Settings during setup (r2.05, r2.09)"
node scripts/alpha-catalogue.mjs --check && node scripts/alpha-walk-pages.mjs --check
npx vitest run 2>&1 | tail -5
```
Expected: catalogue checks PASS without regeneration (N is the first branch to merge since K, so
nothing else has added keys); suite 124 files / 2514 tests.

- [ ] **Step 7: Record the verification, and prune**

Append the actual gate output to `docs/review/2026-09-06-brief-N-report.md` under a new heading
`## Verified 2026-09-09, by re-running`. Then
`git worktree remove "$WT" && git branch -d worktree-agent-af85b546ca8c9a7ac`.

---

<!-- decision: settings-timezone-gets-its-own-brief | status: adopted | supersedes: none -->
## Task 2: Brief O — The Live Settings Time-Zone Defect

Brief N found this and was right to leave it: `src/ui/views/SettingsView.tsx:110-117` still builds
all 418 zones in IANA alphabetical order with the old `(UTC+02:00)` label. That is the r2.09 defect
still shipping on the Settings screen, and rule 5 told N to stop because the file was not in its
brief. It belongs to no one. **Ruling: it gets its own brief rather than a line in a later one** —
it is one screen, it is independent of every other brief, and it can run in parallel with J.

**Files:**
- Create: `docs/plans/subagent-briefs/O-settings-timezone.md` (Claude writes it)
- Modify (worker): `src/ui/views/SettingsView.tsx`

**Interfaces:**
- Consumes: `groupTimeZones()` from `src/domain/dates.ts`, merged in Task 1.

- [ ] **Step 1: Claude writes brief O**

It says exactly this and nothing more: replace the hand-built zone list at
`SettingsView.tsx:110-117` with `groupTimeZones()`, which brief N built for this purpose and which
is already tested; render the same `(UTC/GMT±HH:MM) Zone, N more` label the setup wizard now
renders; do not change the stored value, which stays an IANA zone id; add a test asserting the
Settings picker and the setup picker render the same label for the same zone, so the two cannot
drift apart again. Cite the ruling in `docs/plans/2026-09-06-12-round-2.md` §A4 for why one entry
per UTC offset is refused.

- [ ] **Step 2: Dispatch to Codex**

Canonical dispatch, `BRIEF=O`, `-m gpt-5.6-luna`, default effort.

- [ ] **Step 3: Verify and merge**

Full gate block run by Claude in the worktree, plus `npm run test:tz`, plus the one check no gate
makes: that the Settings list and the setup list produce byte-identical labels — read the new test
and confirm it compares rendered output rather than asserting a hard-coded string twice.

---

## Task 3: Brief J — The Intro, Reworked (r2.01–r2.03)

`docs/plans/subagent-briefs/J-intro-rework.md`. Never dispatched; three attempts failed on a harness
rate limit, not on the task.

**The prose split.** r2.02 is the owner's complaint "You are being too corporate and neutral", and
brief J says to load the `wait-what` skill before rewriting a word. Codex does not have that skill
and has never seen his register. **Handing the register complaint to a model that has never read his
feedback is how you ship the same defect again.** So: Claude drafts the slide copy, Codex implements
the mechanics.

**Files:**
- Modify (worker): `src/content/introSlides.ts`, `src/ui/intro/IntroSequence.tsx`,
  `src/ui/intro/intro.css`, `src/content/copy.ts`

- [ ] **Step 1: Claude drafts the slide copy**

Load `wait-what`. Read r2.02 and r2.03 in
`docs/feedback/round-2/onboarding-owner-feedback.md` in his words first. Produce a heading plus two
to four bullets per slide, each bullet led by a short emphasised phrase, following his own worked
example verbatim in structure:

```
Purpose of the App                                    <- bold, white highlight, fuchsia letters
Simplify the fitness habit: you get a day-to-day      <- underlined lead phrase, then the sentence
plan for what to lift and how.
```

Keep his content and his jokes. Cut the connective prose. Do not soften the register — he was
explicit that the corporate voice is for a later stripped version, not this one. R14 on the
headings. Write it into the brief as a fenced block the worker copies character for character.

- [ ] **Step 2: Pin the acknowledgement sentence in the brief as uneditable**

It is HIS sentence and the brief already carries it. Repeat it in the dispatch prompt inside
`<grounding_rules>` with "copy character for character, do not make it more formal, do not hedge
it, do not add a clause":

```
I realise that asking for help from an actual human is necessary when I am unsure about my form.
I agree to use common sense and stop being shy to the detriment of my own health.
```

- [ ] **Step 3: Dispatch to Codex**

Canonical dispatch, `BRIEF=J`, `-m gpt-5.6-terra`, default effort. Add to `<scope>`: "All slide
copy is supplied in the brief. Do not rewrite, improve, shorten or re-tone a single sentence of it."

- [ ] **Step 4: Verify**

Full gate block, plus the three tests the brief requires (no control named Skip; continue disabled
until the checkbox is ticked; no animation under `prefers-reduced-motion`), plus two checks no gate
makes: that `button.skipBoot` still exists and only `button.skipIntro` was removed, and that the
acknowledgement sentence in the shipped code is byte-identical to his.

```bash
git grep -n 'skipBoot\|skipIntro' -- src/
```
Expected: `skipBoot` present, `skipIntro` absent everywhere including `copy.limelight.ts`.

---

<!-- decision: brief-l-stays-on-opus-5 | status: adopted | supersedes: none -->
<!-- decision: brief-l-on-codex-sol | status: rejected | supersedes: none -->
## Task 4: Brief L — The Guidance Screen (r2.18)

**This is the one brief that does not go to a Codex implementer, and the reason is quoted, not
inferred.** Brief L records the owner's instruction verbatim:

> "Give this slide to an Opus 5 subagent and ask it to redo it completely with your instructions.
> Do not break it into Sonnet subagents."

Two of his instructions now point in different directions: that one, and "use codex subagents" from
2026-09-09. **Surfaced rather than resolved silently; proceeding on this reading:** the instruction's
load-bearing content is *one strong agent, whole screen, no fan-out*, and it names Opus 5
specifically. Brief L is also the maximum-exposure brief for the one unrecoverable error — four new
sections, each needing sources, on a health screen. So L splits three ways and the citation risk
never sits inside a single model's judgement.

**This ruling is reversible on one word from the owner.** If he wants L on `gpt-5.6-sol` instead,
step 3 changes and nothing else does.

- [ ] **Step 1: Codex researcher gathers candidates (bypass sandbox, live web search)**

This is where Codex genuinely earns its keep — network-bound literature search costs Claude far more
than it costs Codex. It returns **candidates, not citations**.

```bash
filename=$(openssl rand -hex 4)
codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox \
  -m gpt-5.6-terra --config model_reasoning_effort="medium" \
  --config web_search="live" \
  -o /home/vx/Desktop/Claude/FixThisInjustice/agy-artifacts/2026-09-09-brief-L-candidates.md \
  2>>"/tmp/codex-${filename}.log" <<'EOF'
<task>
Find candidate peer-reviewed sources for four claims in a resistance-training guidance screen.
Return CANDIDATES for a human to verify. You are not writing the copy and you are not deciding
what ships.
</task>

<claims>
1. WATER: fluid intake during a resistance-training session, and timing. Anchor: keeping
   in-session body-mass loss under 2%. Sawka et al. 2007, DOI 10.1249/mss.0b013e31802ca597, is
   already cited by this project — find what else supports a worked example for a named session
   length and intensity.
2. LIFTING TEMPO / TIME UNDER TENSION: does repetition velocity affect hypertrophy? The gym
   truism is that fast reps do not build muscle. The evidence is reportedly mixed. Report what
   the evidence ACTUALLY supports, including if the honest finding is "no clear difference across
   0.5-8 s per repetition". Do not resolve the mixture in favour of the truism.
3. ELECTROLYTES: the duration or sweat-loss threshold above which electrolyte replacement starts
   to matter for an ordinary trainee. A NUMBER with a source, not an attitude.
4. FOOTWEAR: is there any trial evidence that shoe sole compressibility affects performance or
   injury risk under heavy lifting? If there is no strong trial, SAY SO — that is the answer we
   need, not a weak substitute.
</claims>

<grounding_rules>
Every row must carry a DOI you actually resolved over the network. Resolve it: fetch
https://api.crossref.org/works/<DOI> and confirm it returns 200 with a matching title. Do not
print a DOI you did not resolve. A guessed DOI is worse than an empty row.
Where you found nothing adequate, write NO ADEQUATE SOURCE FOUND and say what you searched.
Do not soften a null result into a weak citation.
</grounding_rules>

<output_contract>
A markdown table: | claim | DOI | title | year | journal | what it actually supports | crossref
resolved? |. Then a short section "WHAT I COULD NOT SOURCE". No prose preamble. Under 900 words.
EOF
```

- [ ] **Step 2: Claude verifies every DOI independently, before any of it reaches `src/`**

Codex resolving its own DOIs is the same trust problem as a subagent reporting its own tests.
For each row: `WebFetch https://api.crossref.org/works/<DOI>` and confirm title, year and journal
match the row. Reject any mismatch outright rather than correcting it — a DOI that resolves to a
different paper than claimed means the row was assembled, not read.

Log every fetch to `REFERENCES.md`, one line each:
`- <URL> — <YYYY-MM-DD HH:MM> — WebFetch — session $CLAUDE_CODE_SESSION_ID — brief L, claim <n>`

- [ ] **Step 3: One Opus 5 agent writes the screen**

Per the owner's instruction: one agent, whole screen, no fan-out. It receives the verified source
set as a closed list and the standing rule that a claim with no verified source ships as a marked
placeholder naming the claim, never as a weak citation. Carry over creatine, caffeine and protein
from `src/content/supplementGuidance.ts` unchanged — `max(3 g, 0.1 g/kg)` capped near 10 g/day,
0.9–2 mg/kg caffeine capped at EFSA's 200 mg single dose — restructuring the prose only.

- [ ] **Step 4: Verify**

Full gate block, plus: every box collapsed on first render; no section body paragraph longer than
three lines; every DOI in the new modules resolves AND matches `src/domain/nutrition.ts` where
carried over; the report lists every claim that could not be sourced, by name.

---

## Task 5: Brief G — The Activity Slider, Nine Stops

`docs/plans/subagent-briefs/G-activity-slider.md`. Every PAL, every band, every example sentence
and the FAO/WHO/UNU citation are supplied in the brief. This is the cleanest Codex task in the
round: the correct output is fully specifiable before the worker runs.

- [ ] **Step 1: Dispatch** — canonical, `BRIEF=G`, `-m gpt-5.6-terra`, default effort.
- [ ] **Step 2: Verify** — full gate block, plus the gate that makes this defensible: the test
      asserting every stop's PAL lies inside `ACTIVITY_BAND[stop.level]`. Read that test; confirm
      it reads the bands from `nutrition.ts` rather than restating them as literals, or it cannot
      catch the drift it exists to catch.
- [ ] **Step 3: Check the recorded reversal is recorded, not buried.** The brief makes the app able
      to over-prescribe where it structurally could not. Confirm `ACTIVITY_FACTOR` is still exported
      and unchanged, that `computeTargets` falls back to the band floor when `activityPal` is null
      so every pre-existing document keeps its number, and that `schemaVersion` is still 3.

---

<!-- decision: brief-i-split-at-part-4 | status: adopted | supersedes: brief-i-single-pass -->
## Task 6: Brief I — The Goal And The Target Date, Parts 1–4 Only

`docs/plans/subagent-briefs/I-goal-target-programme.md`. Seventeen claims across setup steps 5–7.

**Ruling: dispatch Parts 1–4 and defer Part 5.** The brief supplies the escape hatch itself — "This
part is large. If it does not fit one pass, do Parts 1 to 4 and STOP, and say so. A half-migrated
scheduler is worse than none." Part 5 deletes a wizard step, rewrites the plan generator, splits
schedule from prescription, and changes the deload from a calendar position to an autoregulated
trigger, while three shipped features (reminders, `.ics` export, the Plan tab) read the forward plan.
Taking that in the same pass as the goal chooser is how both end up half done.

- [ ] **Step 1: Split the brief.** Create `docs/plans/subagent-briefs/I2-jit-scheduler.md` holding
      Part 5 verbatim, plus the three consumers it must not break and the Bell 2023 / Coleman 2024
      citations already in `src/domain/plan/generator.ts`. Add a line to Part 5 of brief I pointing
      at it. **Writing I2 is in this plan; dispatching it is not.** It is round 3's first brief.
- [ ] **Step 2: Dispatch** — canonical, `BRIEF=I`, `-m gpt-5.6-sol`,
      `--config model_reasoning_effort="high"`. Add to `<scope>`: "Implement Parts 1 to 4 only.
      Part 5 is another agent's brief. Do not delete the programme step and do not touch
      src/domain/plan/."
- [ ] **Step 3: Verify** — full gate block, plus `npx vitest run src/domain/plan/` (the generator
      matrix must still pass for every cell), plus the three tests the brief names: all four axis
      combinations map to a real `GoalKind`; a muscle-gain-only target date is NOT coloured; the
      fat-loss bands sit exactly on `FAT_LOSS_RATE_BOUND`.
- [ ] **Step 4: Check the two things a gate cannot.** That nothing multiplies a kcal deficit by days
      to produce a mass change — Hall 2011 rejects 3500 kcal/lb and the review supplies no
      replacement, so the model is driven from the RATE rule only. And that the three pastel fills
      render inside limelight's `--panel` (`#000000`) and never on `--bg` directly, because the
      measured contrast on the lime ground is 1.04–1.37:1, below even WCAG 1.4.11's 3:1 non-text
      minimum.

```bash
git grep -nE '3500|kcalPerKg|deficit\s*\*\s*days' -- src/domain/
```
Expected: nothing outside a comment explaining the rejection.

---

## Task 7: Brief M — The Review Page (r2.19)

`docs/plans/subagent-briefs/M-review-page.md`. **Last, always.** The review screen restates what the
earlier steps collect, so it cannot be written while they are still moving. Round 1 learned this.

- [ ] **Step 1: Dispatch** — canonical, `BRIEF=M`, `-m gpt-5.6-terra`, default effort. Add to
      `<scope>`: "The reset icon is the owner's and he is supplying it. Leave a placeholder frame
      and a comment naming docs/design/2026-09-04-icon-register.csv row reset-cookies-icon. Do not
      draw one, do not generate one, do not substitute a character."
- [ ] **Step 2: Verify** — full gate block, plus the test that Confirm is disabled until `Looks Good`
      is ticked, plus the one that matters more: that the export and import controls are named with
      the same strings `src/ui/views/ExportView.tsx` actually renders. Read that test and confirm it
      imports the strings rather than restating them.

---

## Task 8: The Title Case Sweep, Then CI

139 of 229 naming keys fail `scripts/check-title-case.mjs`, measured on `main` at `0dd4435` on
2026-09-09. The pool grows with every brief, so **re-run the script for the real count** rather than
quoting this line. Run when no other brief is live.

- [ ] **Step 1: Dispatch** — canonical, `BRIEF=title-case`, `-m gpt-5.6-luna`,
      `--config model_reasoning_effort="medium"`. The prompt is a script, not a brief: run
      `node scripts/check-title-case.mjs`, fix every reported key's VALUE to Title Case, leave every
      key NAME untouched, apply the same correction to any override of that key in
      `copy.limelight.ts` and `copy.board.ts`, then regenerate the catalogue. The gate is the script
      reporting **0 of N**.
- [ ] **Step 2: The check no gate makes.** Title Case changes values, not keys, so call sites do not
      break — but a shared key changes everywhere it renders. Before merging, read the diff for
      `error.valueRequired` (10 call sites), `disclosure.why` (6), and `button.continue` (overridden
      per skin) and confirm the new value reads correctly at every one of them.
- [ ] **Step 3: Add it to CI.** Append `node scripts/check-title-case.mjs` to
      `.github/workflows/ci.yml` only after step 1 reports 0. Adding it while it still fails turns
      every subsequent push red.

---

## Task 9: Push And Deploy

**Not automatic. This needs the owner's word, once.** `main` is nine commits ahead of `origin/main`,
and `origin/main` is what GitHub Actions deploys to the live Pages site. Pushing puts brief K's body
page, brief N's banner and time zone, and everything this plan merges in front of him as the live
app. That is presumably the point — he is the alpha tester — but it is an outward-facing action and
deploy timing is his call, not mine.

- [ ] **Step 1: Ask once, then push on his answer.** After Task 1 merges N, or at whatever point he
      names.
- [ ] **Step 2: Regenerate the walk pages** and confirm `docs/feedback/walk/` matches what actually
      ships, so the next alpha round comments on the live app rather than a stale render.
- [ ] **Step 3: Watch the Actions run** to green before telling him it is live.

---

## Open For The Owner, None Of It Blocking

Three things are his. Work proceeds around all three.

| | What | Why it is his | What happens meanwhile |
| --- | --- | --- | --- |
| **r2.12** | The subsection sprite | Cannot ship as the real person's likeness that was asked for; needs an original figure | Placeholder frame ships |
| **r2.19** | The reset icon | He is supplying it | Placeholder frame plus a comment naming the register row |
| **D2.09.4** | Whether to filter the time-zone list to canonical zones only | An honest reduction, but the number it saves must be measured before it is offered | Claude measures it during Task 1 and reports the count; he rules |

And one thing surfaced rather than decided: **brief L's model**, Task 4. His 2026-09-06 instruction
names Opus 5; his 2026-09-09 instruction says Codex. Proceeding on the reading in Task 4, reversible
on one word.

---

## What This Plan Does Not Do

Stated so the omissions do not read as completeness.

- **It does not touch assets.** Rule 7. The app icon on the Home Screen is still the previous app's
  `W.CONSOLE` logo and ships today; that stays his.
- **It does not deploy the reminder Worker.** Reminders remain off until the Worker is deployed per
  `docs/RUNBOOK-reminders.md` and the two repository variables are set. Nothing here changes that.
- **It does not verify the ~90 DOIs already in the tree.** Brief K's citation reformat turned up a
  round-1 error underneath it (the van Velzen page range was 529-537 and is 529-536). Roughly ninety
  DOIs have never had a CrossRef check. That is its own task and it is not in this plan.
- **It does not resolve brief I's Part 5.** Deferred to `I2-jit-scheduler.md`, wave 7, on the
  brief's own instruction.
- **It does not re-verify brief F or brief K.** Both are merged; K was verified by re-running every
  gate on 2026-09-06, F was not re-checked by this session.
- **It has not run the gates in a Codex worktree yet.** The claim that `npx` resolves from the
  parent tree is verified by inspection of N's worktree (empty `node_modules/` stub, 351 packages
  in the parent) and by the fact that N's agent reported a full suite run — but a Codex worker has
  not actually done it. **Task 1 Step 1 is the first live test of that assumption.** If it fails,
  every dispatch in this plan needs `cp -al node_modules "$WT/node_modules"` inserted after the
  worktree is created, and nothing else changes.
