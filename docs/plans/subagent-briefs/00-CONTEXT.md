# Shared context: read this first, every time

You are editing **FixThisInjustice**, a training-log web app. React 19 + TypeScript + Vite, a
Zustand store over one `localStorage` document, vitest, strict ESLint.

Your brief is one of the numbered files beside this one. Do exactly what it says and nothing else.
When your brief and this file disagree, this file wins.

---

## The five rules that get work rejected

1. **NEVER invent a citation, a DOI, a dose, or a study.** If your brief does not give you a
   number with a source, you do not have one. Write `TODO: number not supplied` and stop, rather
   than filling the gap. A fabricated citation is the only unrecoverable error in this project.
2. **NEVER invent user-facing copy that carries evidence.** Doses, equations, references and
   safety statements are supplied verbatim in your brief. Copy them character for character.
   Layout, labels and control names you may write.
3. **NEVER change a stored unit.** Body mass, load and volume are stored canonically in kg and
   mL and formatted at render. `KG_PER_LB = 0.45359237` and `1 in = 2.54 cm`, both exact.
4. **NEVER add a personal identifier** to tracked source. No medication, condition, biometric or
   location string. CI greps the tree and fails.
5. **NEVER edit a file your brief does not list.** If the change seems to require one, say so in
   your report and stop.

---

## Where user-facing text lives

A view calls `copy(key)` or `copyFor(skin, key)`. **Never a string literal in a component.**

- `src/content/copy.ts` — the default table and the `CopyKey` union. Add a key to BOTH.
- `src/content/copy.limelight.ts`, `copy.board.ts` — per-skin overrides. Optional.
- A string that interpolates a value is a `FORMAT` frame at the bottom of `copy.ts`, never
  assembled at the call site.

### The copy contract, the parts that fail a build

| Rule | Limit |
| --- | --- |
| R1 | a `button.` string is at most **3 words** |
| R2 | a `hero.` string is at most **8 words** |
| R3 | an `advice.` string is at most **12 words** |
| R4 | a `banner.` string is at most **2 sentences** |
| R5 | **no em dash** (U+2014), no en dash as a connector. Use a colon or a full stop |
| R6 | **no emoji.** The check treats **U+2600 to U+27BF** as emoji, so `♂` and `♀` are REJECTED |
| R8 | **no exclamation mark** in the default table |
| R9 | arithmetic goes behind a `why?` disclosure, not on the face |
| R11 | name the quantity: `body mass` not `weight`, `load` for kg on a bar, `kcal` not `calories` |
| — | **no URL in any copy string.** A link is a component prop or a build constant |

Long reference text (a citation list, a form cue) does **not** go in a copy table. It goes in its
own module under `src/content/`, which R10 exempts from R1 to R4 — but not from R5, R6 or R11.

---

## The trap that catches everyone

`docs/feedback/catalogue.json` pins **every copy string byte for byte**, and
`src/content/alphaCatalogue.test.ts` asserts it. **If you add, edit or delete any copy key you
must run, in this order:**

```
node scripts/alpha-catalogue.mjs        # regenerate
node scripts/alpha-catalogue.mjs --check
node scripts/alpha-walk-pages.mjs
node scripts/alpha-walk-pages.mjs --check
```

A **new** key also has to be claimed by a part in `scripts/alpha-parts.mjs` and placed in exactly
one step in `scripts/alpha-walk.mjs`, or the checks fail naming your key. A key nothing renders
any more must be **deleted** from `copy.ts`, from `alpha-parts.mjs` and from `alpha-walk.mjs`.

---

<!-- decision: worker-shell-access-restored | status: adopted | supersedes: orchestrator-runs-all-checks -->

## You DO run shell commands, and you must

You have a sandboxed shell inside your own git worktree. **Run every check yourself.**
`node_modules` resolves from the parent directory, so `npx` works with no install: do **not** run
`npm install` or `npm ci`, and do not use the network.

## Verification you run before you report

```
npx tsc -b --force               # expect: no output, exit 0
npx eslint ./src ./scripts       # expect: no output, exit 0
npx vitest run                   # expect: all files passed, 0 failed
node scripts/check-no-emoji.mjs  # expect: OK - N file(s) clean
```

Plus the catalogue block above if you touched copy.

**Scope ESLint to `./src ./scripts` as written.** A bare `npx eslint .` reports 24 pre-existing
errors under `worker/` that are not yours; measured on `main` at `0dd4435`, `./src ./scripts` is
clean, so any failure it reports is genuinely yours.

**Run `npx vitest run` once BEFORE you edit anything** and record the file and test counts. A drop
in either afterwards is a regression you caused.

**You CANNOT commit, and that is expected. Do not try.**

<!-- decision: orchestrator-commits-worker-output | status: adopted | supersedes: worker-commits-own-branch -->

Measured 2026-09-09: `git commit` inside a nested worktree fails with
`Unable to create .git/worktrees/<name>/index.lock: Read-only file system`. Git's metadata and its
object store live in the MAIN repository's `.git`, outside the directory you can write to. Widening
the sandbox to reach it would also hand you every other branch's refs, which is not a trade worth
making for a convenience.

**The orchestrator stages and commits your work after verifying it.** So instead, before you
report, save your diff where it cannot be lost:

```
git add -A --intent-to-add . && git diff > MY-BRIEF-<letter>.patch
git status --short
```

`--intent-to-add` makes new files show up in the diff; it stages nothing and writes only to a file
inside your own worktree. Name the patch file in your report.

If your brief asks you to DELETE a file, delete it with `rm` and list it under `DELETED` in your
report, so the orchestrator stages the deletion.

**A failing test is not "done with a caveat". Fix it or report the failure with its exact output.**
If a test fails because it asserts the old behaviour your brief replaced, update the test and say
which ones you changed and why. If a test fails for any other reason, stop and report.

---

## Accessibility, because this ships to a phone

- Tap targets **44 px minimum**.
- Every colour comes from a token in `src/ui/styles/tokens.css`. **Never a hex literal in a
  component stylesheet.** Three skins ship: `clinical` (dark), `limelight` (lime ground, black
  ink, pink accent), `board` (near-black). A colour that works on one can be invisible on another.
- Selection state is a **fill inversion or a border**, never "darker": darker-on-dark disappears.
- Animation branches on `prefers-reduced-motion`.
- `navigator.vibrate` does nothing on iOS at any version. It may be an extra cue, never the only one.

---

## How to report back

Reply with exactly these five sections, and nothing else:

1. **FILES CHANGED** — every path, and one line on what changed in it.
2. **COMMANDS RUN** — each command and its **actual** output, pasted, not summarised.
3. **CLAIMS DONE** — the claim ids from your brief you completed.
4. **CLAIMS NOT DONE** — the ids you did not, and why.
5. **ANYTHING YOU CHANGED THAT THE BRIEF DID NOT ASK FOR** — including test edits.

Do not say a command passed without pasting its output. Do not claim a file changed without
naming it.
