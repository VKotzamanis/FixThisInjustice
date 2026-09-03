# P10 Alpha Feedback Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task that writes
> prose also requires `writing-clearly-and-concisely`. The coordinator must load the
> `artifact-design` skill before writing any file it will publish with the Artifact tool.

## Governing intent (the owner's own words)

Quoted verbatim. Where a rule below disagrees with this paragraph, this paragraph wins and the
rule gets amended in the same commit.

> "Assume I open the app. We will review each step/page and I will leave comments on each section
> on what needs to be changed. Esentially I will function as an alpha tester, and to make this
> easier, your goal will be to catalogue my feedback on EACH POSSIBLE part and then use agentic
> approach to implement them. *Focus on the gay/brat theme. The minimal/straggot theme will
> essentially be the same - any interesting language."

Four sentences, four instructions. A second instruction arrived on 2026-09-02, after the first
task had shipped:

> "You don't have to publish all different 'designs'. As I said, the feedback will be on the
> gay/brat design and will mostly cover the UI and app itself. not the design. The design
> differences will be just an adaptation of the finalized app of 1 design"

The second instruction sets the unit of design: one. The review pages show the app as it renders
on Limelight and nothing beside it. The comments are about the UI and the app, and the other two
skins are adapted from the finalized Limelight app in a later pass, not row by row during the
round. Decision `alpha-review-limelight-only` records it.

Sentence 1 sets the unit of review: a step or a page, not the app. The review pages this plan
builds are one per screen group, in app order, and the owner walks them beside the live app.

Sentence 2 sets the unit of feedback: a section. Every section gets its own comment box, so a
comment arrives already attached to the thing it is about.

Sentence 3 sets the unit of record: EACH POSSIBLE part. Task 1 to Task 3 enumerate the parts and
give each one a stable id. Nothing is catalogued as free text.

Sentence 4 names the focus. "gay/brat theme" is the **Limelight** skin
(`src/content/copy.limelight.ts`, `:root[data-skin='limelight']` in `src/ui/styles/tokens.css`).
"minimal/straggot theme" is the **clinical** default (`src/content/copy.ts`, no override table).
The two skins share every layout and every behaviour, so the split is:

| Feedback kind | Where it lands | Which skins move |
| --- | --- | --- |
| Language, register, a word choice | `src/content/copy.limelight.ts` | Limelight only |
| Language that is verbose or inaccurate | `src/content/copy.ts` | both, because the default is the source |
| Layout, spacing, order, size | the component and its CSS | both |
| Behaviour, state, what a control does | the domain or the store | both |

The clinical table changes only for verbosity or accuracy. It never takes a register change: it is
the skin a user picks to be told what happened and nothing else.

**Goal:** Turn the owner's screen-by-screen alpha pass into a catalogued, id-keyed backlog, and
implement it with subagents without losing a comment or a rule.

**Architecture:** Three layers. First a catalogue: `scripts/alpha-catalogue.mjs` reads the copy
tables, the view registry and four source-level unions, joins them to an authored part table in
`scripts/alpha-parts.mjs`, and writes `docs/feedback/catalogue.json` and
`docs/feedback/catalogue.md`. Second a set of static review pages: `scripts/alpha-pages.mjs` reads
that JSON and writes one HTML page per screen group under `docs/feedback/pages/`, which the
coordinator publishes with the Artifact tool. Third a capture and implementation loop: one round
document holding the owner's comments verbatim against part ids, and one task per accepted comment
drawn from five templates.

**Tech Stack:** Node 22.23.1, Vite 8 (Node API, used to load the copy tables the way
`scripts/copy-wordcount.mjs` and `scripts/limelight-side-by-side.mjs` already do), TypeScript 5.9,
React 19, Vitest 4, git, graphify, the Artifact tool.

---

## Decisions

<!-- decision: alpha-feedback-review-pages | status: adopted | supersedes: none -->
### `alpha-feedback-review-pages` (adopted, 2026-09-02)

**Rule.** The owner reviews the app through static HTML pages under `docs/feedback/pages/`, one
page per screen group, each section carrying its own comment box and each page publishable as an
Artifact so the owner can also leave comment threads on it. The pages mirror the app's structure
and strings. They are not the app and they show no pixels of it.

**Reason.** The pages are generated from the tree, so they cannot drift from what ships. They are
committed, so a round is reproducible. They cost no deploy: publishing an Artifact is one tool
call, and a redeploy to the same file path keeps the same URL.

**Rejected: an in-app feedback overlay behind a flag.** It puts test code in the product, it needs
a GitHub Pages deploy for every iteration of the overlay itself, and a flag that ships is a flag
that can be turned on by accident. The app already carries a Konami overlay and a spotlight; a
third global overlay would compete with both for the same keyboard surface.

**Rejected: a single long page.** The owner reviews on a phone, screen by screen, with the live app
open beside the page. One page of ninety parts is a scroll the owner loses their place in, and it
cannot say "you are on Today, open Today".

<!-- decision: alpha-feedback-part-ids | status: adopted | supersedes: none -->
### `alpha-feedback-part-ids` (adopted, 2026-09-02)

**Rule.** Every reviewable part of the app carries a stable id of the form `screen.section` or
`screen.section.state`. All feedback is keyed by that id: the comment box writes it, the round
document's first column holds it, and every implementation task names it. An id is never renamed
once published. A part that stops existing keeps its id and takes `"status": "retired"`.

**Reason.** An id makes a comment attributable, countable and closable. It also survives the round:
round 2 can say "still wrong at `today.strip`" and reach the same task.

**Rejected: free-text notes.** A note cannot be attributed to a screen, cannot be counted, and
cannot be checked off. It also cannot be split when it spans two parts, which the owner's comments
will do.

<!-- decision: alpha-focus-limelight | status: adopted | supersedes: none -->
### `alpha-focus-limelight` (adopted, 2026-09-02)

**Rule.** Language feedback edits `src/content/copy.limelight.ts`. Layout and behaviour feedback
edits the shared component, CSS, domain or store, so both skins move together. The clinical default
in `src/content/copy.ts` changes only when a string is verbose or inaccurate.

**Reason.** The owner named the Limelight skin as the focus and said the other skin is essentially
the same. Layout and behaviour are shared by construction: there is one component tree and the skin
is a token block plus an override table. Register is the only axis the skins differ on.

**Rejected: mirroring every Limelight edit into the clinical table.** It would put the same sentence
in two files and rot the second, which is the argument the head of `src/content/copy.limelight.ts`
already makes against cloning a string to change its case.

**Rejected: editing only the Limelight table and leaving layout alone.** A layout complaint made on
the Limelight skin is a complaint about the component, because the component is the same on both
skins. Fixing it on one skin only is not possible without forking the tree.

<!-- decision: alpha-review-limelight-only | status: adopted | supersedes: none -->
### `alpha-review-limelight-only` (adopted, 2026-09-02)

**Rule.** The round reviews one design. Every review page shows each string as the Limelight app
renders it, in one column: the Limelight override where one exists, the default table's string
where none does. No clinical or board string appears beside it, and no control asks which skin a
comment is for. Every comment is read as a comment on the Limelight app. The clinical and board
skins are adapted from the finalized Limelight app after the round, as their own pass.

**Reason.** The owner's second instruction, quoted under "Governing intent". The owner reviews on a
phone with the Limelight app open. A second and a third string under every part triples the
reading for a comparison the owner said they will not make, and a skin chip asks a question the
owner has already answered.

**What it leaves in place.** Where a wording change lands is unchanged, because that follows from
the copy system, not from the pages: a register change goes to `src/content/copy.limelight.ts`; a
correction of length or accuracy on a string the Limelight app shows from the default table goes
to `src/content/copy.ts`, and reaches every skin. The four binding skin rules stand. The page
`docs/design/2026-09-02-limelight-side-by-side.md` keeps its three-column view for the later
adaptation pass and is regenerated by every wording task.

**Rejected: three strings per part, Limelight first.** That is what Tasks 4 and 5 specified before
this amendment. It put the design system on a page meant for the app.

**Rejected: a skin chip under every box.** Its answers were limelight, clinical or both, and the
owner has said every comment is about the one design.

---

## Global Constraints

Copied from `docs/plans/2026-09-01-00-master-plan.md` section 3, from
`docs/plans/2026-09-02-09-prose-and-docs-pass.md`, and from `.github/workflows/ci.yml`. Every
task's requirements implicitly include this section.

- **Copy contract R1 to R13** (`docs/design/2026-09-01-copy-contract.md`) binds every string.
  Buttons at most 3 words, heroes at most 8, advice at most 12, banners at most 2 sentences, no em
  dash and no en dash outside a numeric range, no emoji, no hedging, no exclamation mark in the
  default table, arithmetic behind `why?`, the `LENGTH_EXEMPT` list, defined quantity names, unit
  symbol parity across skins, and no promise of return on `button.dismiss`, `button.cancel` or
  `button.close`. Word counts exclude numerals and unit tokens.
- **The four binding skin rules** (head of `src/content/copy.limelight.ts`, restated in the copy
  contract). 1: a skin changes words, never facts, so every `{slot}`, literal digit, unit symbol
  and quantity name survives. 2: lower case everywhere except the three shouted keys
  (`button.startSession`, `status.prStamp`, `status.weekMetStamp`, carrying two distinct strings).
  3: no emoji, in the strings or in the comments. 4: the joke never sits on a control whose
  misreading costs data.
- **A skin never alters a number, a unit, a `{slot}` or what a control does.** No feedback is
  implemented that would. Section "Triage" names this as a rejection ground.
- **Lint bans** (`eslint.config.js`). `toISOString()` only in `src/domain/dates.ts`. `localStorage`
  and `window.localStorage` and `globalThis.localStorage` only in `src/store/persistence.ts`.
  `sessionStorage` only in `src/store/sessionMirror.ts` and
  `src/ui/components/ReadinessNotice.tsx`. **The review pages are static HTML under `docs/`, not
  application code.** ESLint's flat config lints `dist/**`, `dev-dist/**`, `coverage/**` and
  `node_modules/**` out and lints `**/*.{ts,tsx}`, `**/*.js` and `scripts/**/*.mjs` in. An `.html`
  file under `docs/` is in no glob, so the pages' `localStorage` use is outside the ban and is
  correct there. The generator that writes them, `scripts/alpha-pages.mjs`, is linted as a Node
  script and must not itself touch storage.
- **The no-emoji gate.** `node scripts/check-no-emoji.mjs` scans tracked `src/content/copy*.ts` and
  tracked `src/**/*.tsx`. The review pages live under `docs/` and the gate does not see them. They
  carry no emoji anyway, by the owner's own rule, and Task 8 checks them with an explicit command.
- **The personal-data gate** (`.github/workflows/ci.yml`, step "No personal health data in the
  tracked tree"):

  ```bash
  git grep -nEi '\b(vyvans[e]|lisdexamfetamin[e]|ymc[a]|amphetamin[e])\b' -- . ':!docs/review/' ':!docs/plans/' ':!REFERENCES.md' ':!graphify-out/'
  ```

  The four exempt paths are `docs/review/`, `docs/plans/`, `REFERENCES.md` and `graphify-out/`.
  **`docs/feedback/` is not exempt.** A round document quoting the owner verbatim fails CI if the
  owner names one of those four terms. Task 9 runs the gate before it commits, and states the
  redaction rule.
- **Explicit pathspec commits.** Every `git commit` names the files. Never `git add -A`. Two
  read-only reviewers and other agents may hold edits in the same working tree.
- **Never `git commit --amend` in this tree.** Incident 2026-09-02: an amend rewrote another
  agent's commit `ca5d972` into `0fa62cb` and cost that agent a re-commit.
- **Build a shared file's blob from `HEAD` immediately before committing it.** Incident 2:
  commit `f7ceb3a` committed a stale-parent blob that deleted the boot keys, restored in `9d42e8d`.
  `src/content/copy.ts`, `src/content/copy.limelight.ts`, `docs/HANDOFF-2026-09-02.md` and this
  plan are the shared files in this phase.
- **Push nothing.** The coordinator pushes. No task in this plan runs `git push`.
- **Commit messages:** `feat|fix|test|chore|docs: <summary>`, scoped `(P10)`.
- **No run on this machine may exceed 20 minutes.** The full suite takes about 3 min 25 s.
  `graphify . --update` is the only command here that can approach the cap; Task 16 wraps it in
  `timeout 1200`.
- **ASCII source.** Every file this plan writes is ASCII except where it quotes a shipped string.
  A non-ASCII character in a quoted string is copied, never retyped.
- **Prose rules for every document this plan writes:** active voice, sentences of at most 25 words,
  no em dash or en dash outside a numeric range, no emoji, no puffery, no promotional adjective.
  Quote every path and command from the tree rather than from memory.

---

## Baseline, measured on 2026-09-02

Run before the first task, so a later count has something to be compared against.

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
node scripts/copy-wordcount.mjs 2>/dev/null | grep TOTAL
```

Output on 2026-09-02, at commit `f8dd18a`:

```
TOTAL        keys= 494 words= 1891
TOTAL        keys= 121 words=  380
TOTAL        keys=  37 words=   68
```

The three lines are `DEFAULT_COPY`, `LIMELIGHT_COPY` and `BOARD_COPY` in that order.
`docs/design/2026-09-01-copy-contract.md` still prints 493, 120 and 37 from an earlier run. The
drift is three keys and is not this plan's to fix; quote the measured numbers, not the contract's.

Structural counts, each with the command that proves it:

| Count | Value | Command |
| --- | --- | --- |
| Views in the tab strip | 7 | `grep -c "copyKey: 'nav\." src/ui/nav/views.ts` |
| Setup wizard steps | 9 | `sed -n '/^export const STEPS/,/as const/p' src/ui/setup/SetupWizard.tsx \| grep -c "^  '"` |
| Settings rows | 5 | `sed -n '/^const SETTINGS_ROWS/,/^\];/p' src/ui/views/SettingsView.tsx \| grep -c "id: '"` |
| Toast kinds | 5 | `grep -n "export type ToastKind" src/ui/components/ToastQueue.tsx` |
| Reminder panel states | 7 | `sed -n '/^export type ReminderStatus/,/;/p' src/ui/components/ReminderSettingsPanel.tsx \| grep -c "  \| '"` |
| Migration wizard phases | 3 | `grep -n "^type Phase" src/ui/migration/MigrationWizard.tsx` |
| Atlas rarities | 3 | `sed -n '/^const RARITY_LABEL/,/^};/p' src/ui/views/AtlasView.tsx \| grep -c "label.rarity"` |
| Targets figures | 7 | `grep -c "<dt>" src/ui/views/TargetsView.tsx` |

---

## File structure

Files this plan creates:

| Path | Responsibility |
| --- | --- |
| `scripts/alpha-parts.mjs` | The authored part table: one record per reviewable part, with id, title, screen, component paths and states. Data only, no I/O. |
| `scripts/alpha-catalogue.mjs` | Reads the copy tables and the source-level unions, joins them to the part table, writes `docs/feedback/catalogue.json` and `docs/feedback/catalogue.md`. Carries `--check`, `--count` and `--keys <screen>`. |
| `scripts/alpha-pages.mjs` | Reads `docs/feedback/catalogue.json`, writes the eight review pages under `docs/feedback/pages/`. |
| `docs/feedback/catalogue.json` | The generated catalogue. Committed, so a round is reproducible. |
| `docs/feedback/catalogue.md` | The same catalogue as a readable page, for a reviewer with no JSON tool. |
| `docs/feedback/pages/00-how-to-test.html` | How to run the pass. |
| `docs/feedback/pages/01-boot-setup-readiness.html` | Boot, the app shell, the nine wizard steps, the readiness screening. |
| `docs/feedback/pages/02-today.html` | Today. |
| `docs/feedback/pages/03-train.html` | Train. |
| `docs/feedback/pages/04-plan-targets.html` | Plan and Targets. |
| `docs/feedback/pages/05-log-atlas.html` | Log and Atlas. |
| `docs/feedback/pages/06-settings.html` | Settings, including export, import, wipe, legacy delete, and the install guide. |
| `docs/feedback/pages/07-popups-toasts.html` | The popups and the five toasts. |
| `docs/feedback/pages/README.md` | The published Artifact URL of each page, and the regeneration command. |
| `docs/feedback/2026-09-XX-round-1.md` | Round 1: the owner's comments verbatim, keyed by part id, triaged, mapped to tasks. The executor writes the real date. |
| `src/content/alphaCatalogue.test.ts` | The gate: every key a screen renders belongs to exactly one part, every component path exists, the part count is stated. |

Files this plan modifies:

| Path | Owner task |
| --- | --- |
| `src/content/copy.limelight.ts` | 11 (a Limelight wording change) |
| `src/content/copy.ts`, `src/content/copy.test.ts` | 12 (a default wording change), 15 (a new string) |
| a component and its CSS under `src/ui/` | 13 (a layout change) |
| a module under `src/domain/` or `src/store/` | 14 (a behaviour change) |
| `docs/design/2026-09-02-limelight-side-by-side.md` | 11, 12, 15, regenerated |
| `docs/phone-visual-check.md` | 13, one row per layout change |
| `docs/HANDOFF-2026-09-02.md` | 16, append-only |
| `graphify-out/` | 16 |

---

## The part id scheme

The grammar, enforced by `src/content/alphaCatalogue.test.ts`:

```
<screen>.<section>
<screen>.<section>.<state>
```

- Each segment matches `^[a-z0-9]+(-[a-z0-9]+)*$`. Lower case ASCII, hyphen-separated words.
- Two or three segments. Never one, never four.
- `<screen>` is one of fourteen fixed values, in app order:
  `boot`, `shell`, `setup`, `readiness`, `today`, `train`, `plan`, `targets`, `log`, `atlas`,
  `settings`, `install`, `popup`, `toast`.
- A third segment exists only where the second segment names a container the APP groups by, and
  it then names either a sub-section or a state. The containers are the five `SETTINGS_ROWS` ids
  (`settings.data.export`, `settings.skin.sounds`), the three atlas rarities
  (`atlas.rarity.rare`), and the migration wizard's three phases (`popup.migration.preview`).
  Fifteen of the 102 parts carry three segments.
- A part with several states that share one section lists them in its `states` array rather than
  splitting into one part per state. The reminders panel is the case that decides this: it has
  seven states and one control, so it is one part with seven states, not seven parts.

Stability rules:

- An id is assigned once and never renamed. Renaming one orphans every comment already filed
  against it.
- A part that leaves the app keeps its record with `"status": "retired"` and a `"retiredIn"` commit
  hash. It stops appearing on the review pages.
- A new part appends. It never renumbers a neighbour, because nothing in the scheme is a number.

---

## The fourteen screens, and the files that render them

`boot` and `shell` come before `setup` because they are what the owner meets first: the boot
sequence covers the screen, and the topbar and tab strip frame every view behind it. Every path
below was verified with `git ls-files` on 2026-09-02.

| Screen | Files |
| --- | --- |
| `boot` | `src/ui/components/Boot.tsx` |
| `shell` | `src/app/App.tsx`, `src/app/UpdatePrompt.tsx`, `src/ui/components/SessionIndicator.tsx`, `src/ui/components/SpotlightButton.tsx`, `src/ui/nav/views.ts` |
| `setup` | `src/ui/setup/SetupWizard.tsx` |
| `readiness` | `src/ui/setup/ReadinessScreen.tsx`, `src/ui/components/ReadinessNotice.tsx`, `src/content/readinessQuestions.ts` |
| `today` | `src/ui/views/TodayView.tsx`, `src/ui/components/Marquee.tsx`, `src/ui/components/WeekStamp.tsx`, `src/ui/components/Intervention.tsx`, `src/ui/format/refusal.ts`, `src/ui/format/weekDelta.ts` |
| `train` | `src/ui/views/TrainView.tsx`, `src/ui/views/train`, `src/domain/training/hydration.ts` |
| `plan` | `src/ui/views/PlanView.tsx` |
| `targets` | `src/ui/views/TargetsView.tsx` |
| `log` | `src/ui/views/LogView.tsx`, `src/ui/components/BodyMassChart.tsx`, `src/ui/components/ComplianceGrid.tsx`, `src/ui/components/AmrapSpark.tsx`, `src/ui/components/PRList.tsx` |
| `atlas` | `src/ui/views/AtlasView.tsx` |
| `settings` | `src/ui/views/SettingsView.tsx`, `src/ui/settings`, `src/ui/components/ReminderSettingsPanel.tsx`, `src/ui/motivation/MotivationSettings.tsx`, `src/ui/views/ExportView.tsx`, `src/domain/export/summary.ts` |
| `install` | `src/ui/components/InstallGuide.tsx` |
| `popup` | `src/ui/components/Spotlight.tsx`, `src/ui/components/KonamiOverlay.tsx`, `src/ui/components/PhaseTransition.tsx`, `src/ui/components/TimeCapsule.tsx`, `src/ui/components/ConfirmDestructive.tsx`, `src/ui/components/ModalShell.tsx`, `src/ui/components/VideoModal.tsx`, `src/ui/components/FormCuesModal.tsx`, `src/ui/migration`, `src/ui/motivation/MotivationModal.tsx`, `src/ui/motivation/MotivationGate.tsx` |
| `toast` | `src/ui/components/ToastQueue.tsx`, `src/domain/training/coach.ts` |

A key lands under the first screen in this order whose files mention it, exactly as
`scripts/limelight-side-by-side.mjs` already assigns a key to a screen, and it is filed once: one
claim map spans the whole tree, never one per screen. That is why `shell` sits second:
`src/ui/nav/views.ts` names the seven `nav.*` keys (`src/app/App.tsx` does not, verified on
2026-09-02 by the Task 1 reviewer with `git grep`), and putting the shell last would file the tab
strip under a popup.

Some keys are named only in a helper module and never in a view file. The helper joins the screen
that renders its strings, which is why the table above lists `src/content/readinessQuestions.ts`
under `readiness` and `src/domain/training/coach.ts` under `toast`. Keys named nowhere but inside
`src/content/copy.ts`, behind a `FORMAT` helper, reach no screen by mention. `--unplaced` lists
them (40 on 2026-09-02, at `350b8e2`), Task 2 Step 3 places each by hand in the part whose section
renders it, and a key with no surface at all is excused by name in `NOT_RENDERED` with the file
and line that proves it. `src/skins/limelight/Icon.tsx` is a lookup keyed by copy key, not a
renderer, and is deliberately in no list: under `shell` it would claim `advice.drinkToThirst` away
from `train`.

---

## Task 1: The reader layer

Everything the catalogue needs that can be read from the tree rather than typed. No authored data
in this task, so a drift in the tree fails here rather than in a page.

**Files:**
- Create: `scripts/alpha-catalogue.mjs`

**Interfaces:**
- Produces, for Task 2: `loadCopy()` returning `{ DEFAULT_COPY, LIMELIGHT_COPY, BOARD_COPY }`;
  `keysIn(paths)` returning a `Set<string>`; `readConstArray(rel, name)`, `readUnion(rel, name)`,
  `readSettingsRowIds()` and `readLimelightRefusals()` returning
  `Map<string, { group: string, reason: string }>`; the constant `SCREEN_FILES`.

**Check, stated first:** `node scripts/alpha-catalogue.mjs --probe` prints the eight structural
counts, and each one equals the value in the Baseline table above: 7 views, 9 setup steps, 5
settings rows, 5 toast kinds, 7 reminder states, 3 migration phases, 3 atlas rarities, 110 refused
Limelight keys across 16 groups.

- [ ] **Step 1: Write the script**

```javascript
// scripts/alpha-catalogue.mjs
//
// The alpha-review catalogue: one record per reviewable part of the app, keyed by a stable part
// id. P10 Tasks 1 to 3.
//
//   node scripts/alpha-catalogue.mjs --probe          the structural counts, and nothing else
//   node scripts/alpha-catalogue.mjs --keys <screen>  every copy key a screen's files mention
//   node scripts/alpha-catalogue.mjs --count          the number of live parts
//   node scripts/alpha-catalogue.mjs --check          the gate, exit 1 on any failure
//   node scripts/alpha-catalogue.mjs                  writes catalogue.json and catalogue.md
//
// DETERMINISM. The output is a function of the tree alone. Two runs on one tree agree byte for
// byte: every list is sorted or comes from a source-order read, and no clock and no random source
// is touched. Nothing is retyped: every string is read from src/content/copy.ts through the same
// module the app imports.
//
// Vite's Node API loads that module because it imports './copy.board' with no extension, which
// Node's own resolver rejects. scripts/copy-wordcount.mjs and scripts/limelight-side-by-side.mjs
// give the same reason, and all three load the table the same way.
//
// WHY REGEX FOR THE UNIONS. ToastKind, ReminderStatus and Phase are TYPE aliases: they are erased
// before anything can import them, so there is no runtime value to read. SETTINGS_ROWS is a
// runtime value but is not exported, and exporting it to satisfy a script would change app code
// for a documentation tool. Each reader below therefore matches a named block and THROWS when the
// block is absent, so a rename fails loudly here instead of silently shrinking a page.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';

export const ROOT = new URL('..', import.meta.url).pathname;

/** The screens in app order, each with the paths that render its strings. */
export const SCREEN_FILES = [
  ['boot', ['src/ui/components/Boot.tsx']],
  [
    'shell',
    [
      'src/app/App.tsx',
      'src/app/UpdatePrompt.tsx',
      'src/ui/components/SessionIndicator.tsx',
      'src/ui/components/SpotlightButton.tsx',
    ],
  ],
  ['setup', ['src/ui/setup/SetupWizard.tsx']],
  ['readiness', ['src/ui/setup/ReadinessScreen.tsx', 'src/ui/components/ReadinessNotice.tsx']],
  [
    'today',
    [
      'src/ui/views/TodayView.tsx',
      'src/ui/components/Marquee.tsx',
      'src/ui/components/WeekStamp.tsx',
      'src/ui/components/Intervention.tsx',
      'src/ui/components/TimeCapsule.tsx',
    ],
  ],
  ['train', ['src/ui/views/TrainView.tsx', 'src/ui/views/train']],
  ['plan', ['src/ui/views/PlanView.tsx']],
  ['targets', ['src/ui/views/TargetsView.tsx']],
  [
    'log',
    [
      'src/ui/views/LogView.tsx',
      'src/ui/components/BodyMassChart.tsx',
      'src/ui/components/ComplianceGrid.tsx',
      'src/ui/components/AmrapSpark.tsx',
      'src/ui/components/PRList.tsx',
    ],
  ],
  ['atlas', ['src/ui/views/AtlasView.tsx']],
  [
    'settings',
    [
      'src/ui/views/SettingsView.tsx',
      'src/ui/settings',
      'src/ui/components/ReminderSettingsPanel.tsx',
      'src/ui/motivation/MotivationSettings.tsx',
      'src/ui/views/ExportView.tsx',
    ],
  ],
  ['install', ['src/ui/components/InstallGuide.tsx']],
  [
    'popup',
    [
      'src/ui/components/Spotlight.tsx',
      'src/ui/components/KonamiOverlay.tsx',
      'src/ui/components/PhaseTransition.tsx',
      'src/ui/components/ConfirmDestructive.tsx',
      'src/ui/components/ModalShell.tsx',
      'src/ui/components/VideoModal.tsx',
      'src/ui/components/FormCuesModal.tsx',
      'src/ui/migration',
      'src/ui/motivation/MotivationModal.tsx',
      'src/ui/motivation/MotivationGate.tsx',
    ],
  ],
  ['toast', ['src/ui/components/ToastQueue.tsx']],
];

export const SCREEN_IDS = SCREEN_FILES.map(([id]) => id);

/** A tracked file's text. Throws rather than returning an empty string on a bad path. */
export function sourceOf(rel) {
  const path = ROOT + rel;
  if (!existsSync(path)) throw new Error(`alpha-catalogue: no such file: ${rel}`);
  return readFileSync(path, 'utf8');
}

/** `export const NAME = [ 'a', 'b' ] as const;` -> ['a','b'], in source order. */
export function readConstArray(rel, name) {
  const m = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`).exec(sourceOf(rel));
  if (m === null) throw new Error(`${rel}: no "export const ${name} = [...] as const;" block`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** `type Name = 'a' | 'b';`, exported or not -> ['a','b'], in source order. */
export function readUnion(rel, name) {
  const m = new RegExp(`(?:export )?type ${name} =([\\s\\S]*?);`).exec(sourceOf(rel));
  if (m === null) throw new Error(`${rel}: no "type ${name} = ...;" alias`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** The SETTINGS_ROWS ids, in the order the screen renders them. */
export function readSettingsRowIds() {
  const src = sourceOf('src/ui/views/SettingsView.tsx');
  const m = /const SETTINGS_ROWS: readonly SettingsRow\[\] = \[([\s\S]*?)\n\];/.exec(src);
  if (m === null) throw new Error('SettingsView.tsx: no SETTINGS_ROWS array literal');
  return [...m[1].matchAll(/\{\s*id: '([^']+)'/g)].map((x) => x[1]);
}

/**
 * The verdict groups at the foot of src/content/copy.limelight.ts.
 *
 * That block is the record of which keys may NEVER take a limelight row, and why. It is prose
 * with a strict shape: a header line ending "(<n>)." states the count, and the key lines under it
 * begin with an asterisk and THREE spaces, which is what separates them from the reason's own
 * continuation lines. The declared count is checked against the parsed count per group, so a hand
 * edit that adds a key without moving the number fails here.
 */
export function readLimelightRefusals() {
  const src = sourceOf('src/content/copy.limelight.ts');
  const block = /WHAT STAYS CLINICAL ON THE FOUR MAIN SCREENS([\s\S]*?)\n\s*\*\/\s*\n\};/.exec(src);
  if (block === null) throw new Error('copy.limelight.ts: no verdict block');
  const out = new Map();
  const groups = [];
  let current = null;
  for (const line of block[1].split('\n')) {
    const head = /^\s*\*\s(\S.*?)\s\((\d+)\)\.\s/.exec(line);
    if (head !== null) {
      current = { group: head[1], declared: Number(head[2]), reason: head[0].trim(), keys: [] };
      groups.push(current);
      continue;
    }
    const keyLine = /^\s*\*\s{3}(\S.*)$/.exec(line);
    if (keyLine !== null && current !== null) {
      for (const k of keyLine[1].split(',')) {
        const key = k.trim();
        if (key !== '') current.keys.push(key);
      }
    }
  }
  for (const g of groups) {
    if (g.keys.length !== g.declared) {
      throw new Error(`copy.limelight.ts: group "${g.group}" declares ${g.declared}, parsed ${g.keys.length}`);
    }
    for (const key of g.keys) out.set(key, { group: g.group, reason: g.reason });
  }
  const total = /The other (\d+) are named below/.exec(block[1]);
  if (total === null) throw new Error('copy.limelight.ts: the verdict block states no total');
  if (out.size !== Number(total[1])) {
    throw new Error(`copy.limelight.ts: block states ${total[1]} refusals, parsed ${out.size}`);
  }
  return { refusals: out, groupCount: groups.length };
}

/**
 * The copy keys one path set mentions.
 *
 * BOTH QUOTE STYLES. A view that calls the hook writes `c('button.skipToday')` and a view that
 * hands the key to a component writes `copyKey="button.skipToday"`, so a single-quote grep files
 * half of Today's controls nowhere. execFileSync passes the pattern as one argument, which keeps
 * the two quote characters out of a shell.
 */
export function keysIn(paths) {
  let out;
  try {
    out = execFileSync(
      'git',
      ['grep', '-ohE', `['"][a-z][a-zA-Z0-9_.]*\\.[a-zA-Z0-9_.]*['"]`, '--', ...paths],
      { encoding: 'utf8', cwd: ROOT },
    );
  } catch {
    // git grep exits 1 when a path set mentions no key at all. That is an empty set, not an error.
    out = '';
  }
  return new Set(
    out
      .split('\n')
      .map((line) => line.replace(/['"]/g, '').trim())
      .filter(Boolean),
  );
}

/** The same, with the file and the line, in file order. For --keys. */
export function keyLinesIn(paths) {
  let out;
  try {
    out = execFileSync(
      'git',
      ['grep', '-nohE', `['"][a-z][a-zA-Z0-9_.]*\\.[a-zA-Z0-9_.]*['"]`, '--', ...paths],
      { encoding: 'utf8', cwd: ROOT },
    );
  } catch {
    out = '';
  }
  return out.split('\n').filter(Boolean);
}

/** The three copy tables, loaded through Vite exactly as the app imports them. */
export async function loadCopy() {
  const server = await createServer({
    configFile: false,
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  const copy = await server.ssrLoadModule('/src/content/copy.ts');
  const views = await server.ssrLoadModule('/src/ui/nav/views.ts');
  await server.close();
  return {
    DEFAULT_COPY: copy.DEFAULT_COPY,
    LIMELIGHT_COPY: copy.LIMELIGHT_COPY,
    BOARD_COPY: copy.BOARD_COPY,
    VIEWS: views.VIEWS,
  };
}

/** The eight structural counts, for --probe. */
export function probe() {
  const { refusals, groupCount } = readLimelightRefusals();
  return {
    setupSteps: readConstArray('src/ui/setup/SetupWizard.tsx', 'STEPS').length,
    settingsRows: readSettingsRowIds().length,
    toastKinds: readUnion('src/ui/components/ToastQueue.tsx', 'ToastKind').length,
    reminderStates: readUnion('src/ui/components/ReminderSettingsPanel.tsx', 'ReminderStatus').length,
    migrationPhases: readUnion('src/ui/migration/MigrationWizard.tsx', 'Phase').length,
    atlasRarities: (sourceOf('src/ui/views/AtlasView.tsx').match(/'label\.rarity[A-Za-z]+'/g) ?? []).length,
    limelightRefusals: refusals.size,
    limelightRefusalGroups: groupCount,
  };
}

const argv = process.argv.slice(2);

if (argv[0] === '--probe') {
  const p = probe();
  const { VIEWS } = await loadCopy();
  process.stdout.write(
    [
      `views            ${VIEWS.length}`,
      `setupSteps       ${p.setupSteps}`,
      `settingsRows     ${p.settingsRows}`,
      `toastKinds       ${p.toastKinds}`,
      `reminderStates   ${p.reminderStates}`,
      `migrationPhases  ${p.migrationPhases}`,
      `atlasRarities    ${p.atlasRarities}`,
      `refusals         ${p.limelightRefusals} in ${p.limelightRefusalGroups} groups`,
      '',
    ].join('\n'),
  );
} else if (argv[0] === '--keys') {
  const screen = SCREEN_FILES.find(([id]) => id === argv[1]);
  if (screen === undefined) throw new Error(`--keys: unknown screen "${argv[1]}"`);
  const { DEFAULT_COPY } = await loadCopy();
  for (const line of keyLinesIn(screen[1])) {
    const m = /^(\d+):['"]([a-z][a-zA-Z0-9_.]*\.[a-zA-Z0-9_.]*)['"]$/.exec(line);
    if (m === null) continue;
    const value = DEFAULT_COPY[m[2]];
    if (value === undefined) continue;
    process.stdout.write(`${m[1]}\t${m[2]}\t${value}\n`);
  }
}
```

- [ ] **Step 2: Run the probe**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
node scripts/alpha-catalogue.mjs --probe 2>/dev/null
```

Expected, exactly:

```
views            7
setupSteps       9
settingsRows     5
toastKinds       5
reminderStates   7
migrationPhases  3
atlasRarities    3
refusals         110 in 16 groups
unplaced         40
```

A different number is a drift in the tree, not a bug in the script. Read the file the reader names
and fix the plan's Baseline table in the same commit.

- [ ] **Step 3: Check one screen's key list**

```bash
node scripts/alpha-catalogue.mjs --keys atlas 2>/dev/null | head -5
node scripts/alpha-catalogue.mjs --keys atlas 2>/dev/null | wc -l
```

Expected: five tab-separated lines of `<line>\t<key>\t<default string>`, and a count above 10.
The count is the number of key MENTIONS, not of distinct keys, so a key rendered twice appears
twice. That is what the author needs in order to see where a key is used.

- [ ] **Step 4: Lint the script**

```bash
npx eslint scripts/alpha-catalogue.mjs
```

Expected: no output. `eslint.config.js` lints `scripts/**/*.mjs` with the recommended JavaScript
rules and Node globals.

- [ ] **Step 5: Commit**

```bash
git add scripts/alpha-catalogue.mjs
git commit -m "feat(P10): the alpha catalogue's reader layer, gated by --probe"
```

---

## Task 2: The part table and the catalogue

**Files:**
- Create: `scripts/alpha-parts.mjs`
- Modify: `scripts/alpha-catalogue.mjs` (append the join and the two writers)
- Create: `docs/feedback/catalogue.json`, `docs/feedback/catalogue.md`

**Interfaces:**
- Consumes from Task 1: `loadCopy`, `keysIn`, `readConstArray`, `readUnion`,
  `readSettingsRowIds`, `readLimelightRefusals`, `SCREEN_FILES`, `SCREEN_IDS`, `sourceOf`.
- Produces for Tasks 3 and 4: `docs/feedback/catalogue.json`, whose shape is fixed below.

**Check, stated first:** `node scripts/alpha-catalogue.mjs --check` exits 0, which means every part
id matches the grammar, no id repeats, every component path exists, every key in a part exists in
`DEFAULT_COPY`, and every screen's `<screen>.unassigned` part holds zero keys. Then
`node scripts/alpha-catalogue.mjs --count` prints the part count, and the executor writes that
number into this plan's Self-review section.

### The record shape

```json
{
  "generatedFrom": "<git rev-parse --short HEAD>",
  "counts": { "screens": 14, "parts": 0, "keys": 0 },
  "parts": [
    {
      "id": "today.session-card",
      "screen": "today",
      "order": 1,
      "title": "Session card",
      "what": "The card naming today's session and its exercises.",
      "components": ["src/ui/views/TodayView.tsx"],
      "states": ["scheduled", "in-progress", "paused", "skipped", "completed", "rest-day"],
      "keys": [
        {
          "key": "hero.sessionInProgress",
          "default": "Session in progress",
          "limelight": "the show is live",
          "board": "same",
          "isControl": false,
          "limelightRowPermitted": true,
          "refusalGroup": null
        }
      ],
      "status": "live"
    }
  ]
}
```

`limelightRowPermitted` is `false` exactly when the key appears in a verdict group at the foot of
`src/content/copy.limelight.ts`, and `refusalGroup` then names the group. A review page prints that
refusal beside the control, so the owner sees which words are not on offer before writing a
comment about them.

- [ ] **Step 1: Write the part table**

Every record below carries `id`, `title`, `what`, `screen`, `components` and `states`. `keys` is
filled in Step 3, one screen at a time. A part with no `keys` field takes every key its
`components` mention that no earlier part, on this screen or an earlier one, has claimed, which is
how the parts that own a whole file are filled with no typing at all.

```javascript
// scripts/alpha-parts.mjs
//
// The authored half of the alpha catalogue: one record per reviewable part of the app, in the
// order the owner meets it. Data only; scripts/alpha-catalogue.mjs joins it to the tree.
//
// THE ONE RULE FOR ADDING A PART. An id is assigned once and never renamed, because every comment
// the owner has ever filed is keyed by it. A part that leaves the app keeps its record and takes
// status: 'retired'. See docs/plans/2026-09-02-10-alpha-feedback-loop.md, decision
// alpha-feedback-part-ids.
//
// `keys` is optional. Omit it and the part takes every copy key its `components` mention that no
// earlier part, on this screen or an earlier one, has claimed. State it where several parts share
// one file, which is every view that draws more than one section.

/** @typedef {{id:string,title:string,what:string,screen:string,components:string[],states:string[],keys?:string[],status?:string}} Part */

/** @type {Part[]} */
export const PARTS = [
  // --- boot ---
  { id: 'boot.sequence', title: 'Boot sequence', what: 'The dotted step lines that print on the first open.', screen: 'boot', components: ['src/ui/components/Boot.tsx'], states: ['running', 'finished'] },
  { id: 'boot.skip', title: 'Skip control', what: 'The control that ends the sequence, and the any-key skip.', screen: 'boot', components: ['src/ui/components/Boot.tsx'], states: ['visible'], keys: ['button.skipBoot'] },

  // --- shell ---
  { id: 'shell.topbar', title: 'Top bar', what: 'The brand line and the loading or loaded status word.', screen: 'shell', components: ['src/app/App.tsx'], states: ['loading', 'loaded'] },
  { id: 'shell.session-indicator', title: 'Session indicator', what: 'The plan position shown in the header from every view.', screen: 'shell', components: ['src/ui/components/SessionIndicator.tsx'], states: ['no-plan', 'idle', 'in-progress'] },
  { id: 'shell.tab-strip', title: 'Tab strip', what: 'The seven tabs, in the order src/ui/nav/views.ts sets.', screen: 'shell', components: ['src/app/App.tsx'], states: ['default'] },
  { id: 'shell.spotlight-button', title: 'Spotlight button', what: 'The control that opens the command palette.', screen: 'shell', components: ['src/ui/components/SpotlightButton.tsx'], states: ['default'] },
  { id: 'shell.update-prompt', title: 'Update prompt', what: 'The banner offering a reload when a new build is waiting.', screen: 'shell', components: ['src/app/UpdatePrompt.tsx'], states: ['hidden', 'offered'] },
  { id: 'shell.save-error', title: 'Save error banner', what: 'The banner shown when the document could not be written.', screen: 'shell', components: ['src/app/App.tsx'], states: ['hidden', 'raised'] },
  { id: 'shell.load-error', title: 'Load error banner', what: 'The banner shown when the stored document could not be read.', screen: 'shell', components: ['src/app/App.tsx'], states: ['hidden', 'raised'] },

  // --- setup, nine steps in the order src/ui/setup/SetupWizard.tsx sets ---
  { id: 'setup.progress', title: 'Step counter', what: 'The "step N of 9" line and the step title above every screen.', screen: 'setup', components: ['src/ui/setup/SetupWizard.tsx'], states: ['default'] },
  { id: 'setup.units', title: 'Step 1, Units', what: 'Metric or imperial, and what the choice does to stored values.', screen: 'setup', components: ['src/ui/setup/SetupWizard.tsx'], states: ['default'] },
  { id: 'setup.timezone', title: 'Step 2, Time zone', what: 'The zone every civil date in the app is computed in.', screen: 'setup', components: ['src/ui/setup/SetupWizard.tsx'], states: ['default'] },
  { id: 'setup.body', title: 'Step 3, Body', what: 'Body mass, height, age, sex, and the optional tape estimate.', screen: 'setup', components: ['src/ui/setup/SetupWizard.tsx'], states: ['default', 'blocked'] },
  { id: 'setup.training', title: 'Step 4, Training context', what: 'Experience and activity, which drive the energy target.', screen: 'setup', components: ['src/ui/setup/SetupWizard.tsx'], states: ['default'] },
  { id: 'setup.goal', title: 'Step 5, Goal', what: 'Fat loss, maintenance, muscle gain or recomposition.', screen: 'setup', components: ['src/ui/setup/SetupWizard.tsx'], states: ['default'] },
  { id: 'setup.availability', title: 'Step 6, Availability', what: 'The days and the equipment the plan may use.', screen: 'setup', components: ['src/ui/setup/SetupWizard.tsx'], states: ['default'] },
  { id: 'setup.programme', title: 'Step 7, Programme length', what: 'How many weeks the generated plan runs for.', screen: 'setup', components: ['src/ui/setup/SetupWizard.tsx'], states: ['default'] },
  { id: 'setup.readiness', title: 'Step 8, Readiness', what: 'The pre-participation screening, inside the wizard.', screen: 'setup', components: ['src/ui/setup/SetupWizard.tsx'], states: ['unanswered', 'answered'] },
  { id: 'setup.review', title: 'Step 9, Review', what: 'The summary, and the control that writes the profile.', screen: 'setup', components: ['src/ui/setup/SetupWizard.tsx'], states: ['ready', 'blocked'] },
  { id: 'setup.nav', title: 'Wizard navigation', what: 'Back and Continue, and what a blocked step does to them.', screen: 'setup', components: ['src/ui/setup/SetupWizard.tsx'], states: ['default', 'blocked'] },

  // --- readiness ---
  { id: 'readiness.screen', title: 'Readiness screening', what: 'The health questions and the physician-consult flag.', screen: 'readiness', components: ['src/ui/setup/ReadinessScreen.tsx'], states: ['unanswered', 'no-flags', 'consult'] },
  { id: 'readiness.notice', title: 'Consult notice', what: 'The per-tab notice a flagged screening raises.', screen: 'readiness', components: ['src/ui/components/ReadinessNotice.tsx'], states: ['shown', 'dismissed'] },

  // --- today ---
  { id: 'today.marquee', title: 'Marquee', what: 'The scrolling ticker strip at the top of Today.', screen: 'today', components: ['src/ui/components/Marquee.tsx'], states: ['scrolling', 'reduced-motion'] },
  { id: 'today.hero', title: 'Hero line', what: 'The one line Today is about, and the eyebrow above it.', screen: 'today', components: ['src/ui/views/TodayView.tsx'], states: ['no-plan', 'scheduled', 'in-progress', 'paused', 'skipped', 'completed', 'rest-day'] },
  { id: 'today.session-card', title: 'Session card', what: 'The exercise list for today, with sets, reps and rest.', screen: 'today', components: ['src/ui/views/TodayView.tsx'], states: ['scheduled', 'rest-day'] },
  { id: 'today.start', title: 'Start control', what: 'The control that opens the session.', screen: 'today', components: ['src/ui/views/TodayView.tsx'], states: ['enabled', 'in-progress'] },
  { id: 'today.week-stamp', title: 'Week stamp', what: 'The stamp a week at or above its target earns.', screen: 'today', components: ['src/ui/components/WeekStamp.tsx'], states: ['hidden', 'stamped'] },
  { id: 'today.intervention', title: 'Intervention', what: 'The missed-week panel on Today, not the popup.', screen: 'today', components: ['src/ui/components/Intervention.tsx'], states: ['hidden', 'raised'] },
  { id: 'today.time-capsule', title: 'Time capsule', what: 'The capsule entry point on Today.', screen: 'today', components: ['src/ui/components/TimeCapsule.tsx'], states: ['none', 'sealed', 'openable', 'opened'] },
  { id: 'today.strip', title: 'Fourteen-day strip', what: 'The fourteen day glyphs and their accessible names.', screen: 'today', components: ['src/ui/views/TodayView.tsx'], states: ['planned', 'live', 'served', 'no-show', 'on-hiatus', 'off'] },
  { id: 'today.pause', title: 'Pause control', what: 'The control that stops the plan, and the paused line.', screen: 'today', components: ['src/ui/views/TodayView.tsx'], states: ['pausable', 'paused'] },
  { id: 'today.skip', title: 'Skip control', what: 'The skip control and its optional reason field.', screen: 'today', components: ['src/ui/views/TodayView.tsx'], states: ['closed', 'open', 'skipped'] },

  // --- train ---
  { id: 'train.header', title: 'Session header', what: 'The session name, the eyebrow and the set counter.', screen: 'train', components: ['src/ui/views/TrainView.tsx'], states: ['no-session', 'in-progress'] },
  { id: 'train.exercise-card', title: 'Exercise card', what: 'One exercise, its prescription and its suggested load.', screen: 'train', components: ['src/ui/views/train/ExerciseCard.tsx'], states: ['pending', 'active', 'done'] },
  { id: 'train.set-row', title: 'Set row', what: 'One set: load, reps, the log control and the delete.', screen: 'train', components: ['src/ui/views/train/SetRow.tsx'], states: ['planned', 'logged', 'bonus'] },
  { id: 'train.rest-panel', title: 'Rest panel', what: 'The rest countdown, the extend control and the skip.', screen: 'train', components: ['src/ui/views/train/RestTimerPanel.tsx'], states: ['hidden', 'running', 'elapsed'] },
  { id: 'train.hydration-banner', title: 'Hydration banner', what: 'The beverage intake cue and its log control.', screen: 'train', components: ['src/ui/views/train/HydrationBanner.tsx'], states: ['hidden', 'shortfall', 'met'] },
  { id: 'train.add-custom-exercise', title: 'Add custom exercise', what: 'The form that adds an exercise the plan does not carry.', screen: 'train', components: ['src/ui/views/train/AddCustomExercise.tsx'], states: ['closed', 'open', 'refused'] },
  { id: 'train.body-mass-quick-log', title: 'Body mass quick log', what: 'The pre- and post-session body mass entry.', screen: 'train', components: ['src/ui/views/train/BodyMassQuickLog.tsx'], states: ['empty', 'logged', 'fluid-loss'] },
  { id: 'train.completion', title: 'Session completion', what: 'The finish control and the line that follows it.', screen: 'train', components: ['src/ui/views/TrainView.tsx'], states: ['incomplete', 'complete'] },

  // --- plan ---
  { id: 'plan.block-strip', title: 'Block strip', what: 'The training and deload blocks, with their session ranges.', screen: 'plan', components: ['src/ui/views/PlanView.tsx'], states: ['training', 'deload'] },
  { id: 'plan.week-scrubber', title: 'Week scrubber', what: 'The control that moves the view a week at a time.', screen: 'plan', components: ['src/ui/views/PlanView.tsx'], states: ['first-week', 'middle', 'last-week'] },
  { id: 'plan.session-cards', title: 'Session cards', what: 'One card per session, with its exercises and rest.', screen: 'plan', components: ['src/ui/views/PlanView.tsx'], states: ['past', 'next', 'future'] },
  { id: 'plan.deep-link', title: 'Deep link to a session', what: 'The control that opens a session from a plan card.', screen: 'plan', components: ['src/ui/views/PlanView.tsx'], states: ['enabled', 'no-plan'] },

  // --- targets, seven figures ---
  { id: 'targets.energy', title: 'Energy target', what: 'The daily energy figure and its unit.', screen: 'targets', components: ['src/ui/views/TargetsView.tsx'], states: ['default'] },
  { id: 'targets.protein', title: 'Protein target', what: 'The daily protein figure and its unit.', screen: 'targets', components: ['src/ui/views/TargetsView.tsx'], states: ['default'] },
  { id: 'targets.fluid', title: 'Fluid target', what: 'The daily beverage intake target.', screen: 'targets', components: ['src/ui/views/TargetsView.tsx'], states: ['default'] },
  { id: 'targets.expected-rate', title: 'Expected rate', what: 'The expected rate of body mass change.', screen: 'targets', components: ['src/ui/views/TargetsView.tsx'], states: ['default', 'maintenance'] },
  { id: 'targets.creatine-dose', title: 'Creatine dose', what: 'The daily dose and the sentence that defines it.', screen: 'targets', components: ['src/ui/views/TargetsView.tsx'], states: ['default'] },
  { id: 'targets.why', title: 'The why disclosure', what: 'RMR and TDEE behind the "why?" summary, under contract R9.', screen: 'targets', components: ['src/ui/views/TargetsView.tsx'], states: ['closed', 'open'] },
  { id: 'targets.intake-check-in', title: 'Intake check-in', what: 'The daily energy and beverage entry, and its progress lines.', screen: 'targets', components: ['src/ui/views/TargetsView.tsx'], states: ['empty', 'partial', 'met', 'error'] },

  // --- log ---
  { id: 'log.body-mass-chart', title: 'Body mass chart', what: 'The body mass series and its axes.', screen: 'log', components: ['src/ui/components/BodyMassChart.tsx'], states: ['empty', 'plotted'] },
  { id: 'log.compliance-grid', title: 'Compliance grid', what: 'The grid of sessions met and missed by week.', screen: 'log', components: ['src/ui/components/ComplianceGrid.tsx'], states: ['empty', 'plotted'] },
  { id: 'log.amrap-spark', title: 'AMRAP spark', what: 'The reps-per-week spark line.', screen: 'log', components: ['src/ui/components/AmrapSpark.tsx'], states: ['empty', 'plotted'] },
  { id: 'log.records', title: 'Personal records', what: 'The record list and what counts as a record.', screen: 'log', components: ['src/ui/components/PRList.tsx'], states: ['empty', 'listed'] },
  { id: 'log.empty', title: 'Log empty state', what: 'What Log says before anything has been logged.', screen: 'log', components: ['src/ui/views/LogView.tsx'], states: ['no-profile', 'no-data'] },

  // --- atlas, three rarities ---
  { id: 'atlas.count', title: 'Collected count', what: 'The count line above the grid.', screen: 'atlas', components: ['src/ui/views/AtlasView.tsx'], states: ['none', 'partial', 'complete'] },
  { id: 'atlas.rarity.common', title: 'Common section', what: 'The common rarity heading, count and grid.', screen: 'atlas', components: ['src/ui/views/AtlasView.tsx'], states: ['default'] },
  { id: 'atlas.rarity.uncommon', title: 'Uncommon section', what: 'The uncommon rarity heading, count and grid.', screen: 'atlas', components: ['src/ui/views/AtlasView.tsx'], states: ['default'] },
  { id: 'atlas.rarity.rare', title: 'Rare section', what: 'The rare rarity heading, count and grid.', screen: 'atlas', components: ['src/ui/views/AtlasView.tsx'], states: ['default'] },
  { id: 'atlas.locked-slot', title: 'Locked slot', what: 'An undiscovered card, and the name a screen reader hears.', screen: 'atlas', components: ['src/ui/views/AtlasView.tsx'], states: ['locked'] },
  { id: 'atlas.detail-dialog', title: 'Card dialog', what: 'The card body, its citation and the close control.', screen: 'atlas', components: ['src/ui/views/AtlasView.tsx'], states: ['open'] },

  // --- settings, the five SETTINGS_ROWS ids in order ---
  { id: 'settings.readiness', title: 'Readiness row', what: 'The screening date, the flag, and the redo control.', screen: 'settings', components: ['src/ui/views/SettingsView.tsx'], states: ['not-screened', 'no-flags', 'consult', 'screening'] },
  { id: 'settings.reminders', title: 'Reminders panel', what: 'The push state line and the enable control.', screen: 'settings', components: ['src/ui/components/ReminderSettingsPanel.tsx'], states: ['not-configured', 'unsupported', 'needs-install', 'denied', 'off', 'needs-reenable', 'active'] },
  { id: 'settings.reminders.lead-times', title: 'Reminder lead times', what: 'The day-of time and the lead times before a session.', screen: 'settings', components: ['src/ui/components/ReminderSettingsPanel.tsx'], states: ['default'] },
  { id: 'settings.motivation-clip', title: 'Motivation clip', what: 'The clip picker, its size limit and the clear control.', screen: 'settings', components: ['src/ui/motivation/MotivationSettings.tsx'], states: ['none', 'stored', 'too-large', 'clear-failed'] },
  { id: 'settings.skin.picker', title: 'Skin picker', what: 'Clinical, Limelight and Board, and what a skin may change.', screen: 'settings', components: ['src/ui/settings/SkinSettings.tsx'], states: ['clinical', 'limelight', 'board'] },
  { id: 'settings.skin.sounds', title: 'Sounds toggle', what: 'The switch for the app sounds.', screen: 'settings', components: ['src/ui/settings/SkinSettings.tsx'], states: ['on', 'off'] },
  { id: 'settings.skin.hotkeys', title: 'Hotkeys toggle', what: 'The switch for the single-character shortcuts.', screen: 'settings', components: ['src/ui/settings/SkinSettings.tsx'], states: ['on', 'off'] },
  { id: 'settings.data.export', title: 'Export', what: 'The JSON backup and the calendar file.', screen: 'settings', components: ['src/ui/views/ExportView.tsx'], states: ['ready', 'no-profile'] },
  { id: 'settings.data.import', title: 'Import', what: 'The file picker, and what an invalid file does.', screen: 'settings', components: ['src/ui/views/ExportView.tsx'], states: ['idle', 'invalid', 'done'] },
  { id: 'settings.data.wipe', title: 'Wipe', what: 'The control that destroys the document, and its confirm.', screen: 'settings', components: ['src/ui/settings/DataSection.tsx'], states: ['idle', 'confirming'] },
  { id: 'settings.data.legacy-delete', title: 'Legacy delete', what: 'The old app keys, the download that must precede the delete.', screen: 'settings', components: ['src/ui/settings/DataSection.tsx'], states: ['absent', 'present', 'confirming'] },

  // --- install ---
  { id: 'install.ios', title: 'Install on iOS', what: 'The Safari, Share and Add to Home Screen steps.', screen: 'install', components: ['src/ui/components/InstallGuide.tsx'], states: ['default'] },
  { id: 'install.android', title: 'Install on Android', what: 'The menu and Install app steps.', screen: 'install', components: ['src/ui/components/InstallGuide.tsx'], states: ['default'] },

  // --- popups ---
  { id: 'popup.missed-week', title: 'Missed-week popup', what: 'The clip, the two sound lines and the single Dismiss control.', screen: 'popup', components: ['src/ui/motivation/MotivationModal.tsx', 'src/ui/motivation/MotivationGate.tsx'], states: ['muted', 'unmuted', 'no-clip'] },
  { id: 'popup.phase-transition', title: 'Phase transition', what: 'The block change cutscene.', screen: 'popup', components: ['src/ui/components/PhaseTransition.tsx'], states: ['entering', 'shown'] },
  { id: 'popup.spotlight', title: 'Spotlight palette', what: 'The command palette, its filter and its results.', screen: 'popup', components: ['src/ui/components/Spotlight.tsx'], states: ['open', 'no-results'] },
  { id: 'popup.konami', title: 'Konami overlay', what: 'The overlay the sequence raises, and the way out.', screen: 'popup', components: ['src/ui/components/KonamiOverlay.tsx'], states: ['open'] },
  { id: 'popup.capsule-write', title: 'Capsule write', what: 'The note field, the open date and the seal control.', screen: 'popup', components: ['src/ui/components/TimeCapsule.tsx'], states: ['empty', 'too-short', 'too-long', 'date-out-of-range'] },
  { id: 'popup.capsule-read', title: 'Capsule read', what: 'The note as it reads on the open date.', screen: 'popup', components: ['src/ui/components/TimeCapsule.tsx'], states: ['sealed', 'openable', 'opened'] },
  { id: 'popup.confirm-destructive', title: 'Destructive confirm', what: 'The dialog that gates the wipe and the legacy delete.', screen: 'popup', components: ['src/ui/components/ConfirmDestructive.tsx'], states: ['download-pending', 'type-to-confirm', 'armed'] },
  { id: 'popup.modal-shell', title: 'Modal shell', what: 'The frame every dialog shares: focus trap, close, backdrop.', screen: 'popup', components: ['src/ui/components/ModalShell.tsx'], states: ['open'] },
  { id: 'popup.migration.explain', title: 'Migration, explain', what: 'What the old data is and what the import will do.', screen: 'popup', components: ['src/ui/migration/MigrationWizard.tsx', 'src/ui/migration/MigrationGate.tsx'], states: ['explain'] },
  { id: 'popup.migration.preview', title: 'Migration, preview', what: 'What the import found, before anything is written.', screen: 'popup', components: ['src/ui/migration/MigrationWizard.tsx'], states: ['preview', 'refused'] },
  { id: 'popup.migration.applied', title: 'Migration, applied', what: 'What was written, and what happens to the old keys.', screen: 'popup', components: ['src/ui/migration/MigrationWizard.tsx'], states: ['applied'] },
  { id: 'popup.form-cues', title: 'Form cues', what: 'The technique reference for one exercise.', screen: 'popup', components: ['src/ui/components/FormCuesModal.tsx'], states: ['open'] },
  { id: 'popup.video', title: 'Video modal', what: 'The clip player and its close control.', screen: 'popup', components: ['src/ui/components/VideoModal.tsx'], states: ['open', 'failed'] },

  // --- toasts, the five ToastKind members ---
  { id: 'toast.undo', title: 'Undo toast', what: 'The toast that offers to undo a delete, with its deadline.', screen: 'toast', components: ['src/ui/components/ToastQueue.tsx'], states: ['live', 'expired'] },
  { id: 'toast.milestone', title: 'Milestone toast', what: 'The set-count milestone line.', screen: 'toast', components: ['src/ui/components/ToastQueue.tsx'], states: ['shown'] },
  { id: 'toast.coach', title: 'Coach toast', what: 'The progression line after a logged set.', screen: 'toast', components: ['src/ui/components/ToastQueue.tsx'], states: ['shown'] },
  { id: 'toast.telemetry', title: 'Telemetry toast', what: 'The line reporting a background action.', screen: 'toast', components: ['src/ui/components/ToastQueue.tsx'], states: ['shown'] },
  { id: 'toast.specimen', title: 'Specimen toast', what: 'The card-drawn line that points at Atlas.', screen: 'toast', components: ['src/ui/components/ToastQueue.tsx'], states: ['shown'] },
];

/**
 * Keys the table holds and no screen renders, each with the file and line that proves it, so the
 * coverage gate can tell "excused" from "forgotten". A key here can never be claimed by a part and
 * a key claimed by a part can never be here. Step 3 fills this from the --unplaced list.
 */
/** @type {Record<string, string>} */
export const NOT_RENDERED = {
  'advice.noCardsMatch': 'src/ui/views/AtlasView.tsx:28 says the key goes unrendered',
};
```

That table held 93 parts as drafted; the executor added nine on 2026-09-02 for sections no drafted part rendered (`today.refusal-banner`, `today.mark-completed`, `today.label-picker`, `targets.empty`, `settings.profile`, `settings.equipment-steps`, `settings.hydration`, `settings.data.on-device`, `install.intro`), so it holds **102 live parts** across the fourteen screens, counted with:

```bash
grep -c "^  { id: '" scripts/alpha-parts.mjs
```

Expected: `102`. The catalogue adds one synthetic `<screen>.unassigned` part per screen, which must
end up empty, so `--count` prints 102 and `--check` proves the fourteen leftovers are empty.

- [ ] **Step 2: Append the join and the writers to `scripts/alpha-catalogue.mjs`**

Two edits to the head of the file. Widen the `node:fs` import, because the writers need it:

```javascript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
```

Add the part table beside the other imports:

```javascript
import { NOT_RENDERED, PARTS } from './alpha-parts.mjs';
```

Then append, above the `const argv = process.argv.slice(2);` line:

```javascript
/** The part id grammar: two or three hyphen-lower-case segments. */
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*){1,2}$/;

/** One key, resolved on all three skins, with its limelight verdict. */
function keyRecord(key, tables, refusals) {
  const refusal = refusals.get(key) ?? null;
  return {
    key,
    default: tables.DEFAULT_COPY[key],
    limelight: tables.LIMELIGHT_COPY[key] ?? 'same',
    board: tables.BOARD_COPY[key] ?? 'same',
    isControl: key.startsWith('button.'),
    limelightRowPermitted: refusal === null,
    refusalGroup: refusal === null ? null : refusal.group,
  };
}

/**
 * The catalogue, and every problem found while building it.
 *
 * A part with an explicit `keys` array takes exactly those keys. A part without one takes every
 * key its own files mention that no earlier part has claimed, which is how a part that owns a
 * whole component file fills itself. Whatever a screen mentions and no part claims lands in
 * `<screen>.unassigned`, and whatever the table holds and no part claims must be excused by name
 * in NOT_RENDERED, so a key can never fall out of the catalogue silently.
 */
export async function buildCatalogue() {
  const tables = await loadCopy();
  const { refusals } = readLimelightRefusals();
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
    cwd: ROOT,
  }).trim();

  const problems = [];
  const parts = [];
  const seen = new Set();

  /*
   * ONE CLAIM MAP FOR THE WHOLE TREE, key to part id. A key is filed once, under the first screen
   * in app order that claims or mentions it, the way scripts/limelight-side-by-side.mjs files a
   * key once through one `placed` Map. A set per screen would let today and shell both demand
   * hero.programmeComplete and leave it unassigned on whichever screen has no part for it.
   */
  const claimed = new Map();

  for (const [screen, files] of SCREEN_FILES) {
    const inScreen = PARTS.filter((p) => p.screen === screen);
    const assigned = new Map();

    /*
     * TWO PASSES, and the order matters. Every explicit `keys` array claims first, across the
     * whole screen. Only then does a part without one sweep up what its own files still mention.
     * One pass in authored order would let boot.sequence, which owns Boot.tsx and declares no
     * keys, swallow button.skipBoot before boot.skip could claim it.
     */
    for (const part of inScreen) {
      if (part.keys === undefined) continue;
      const keys = [...part.keys].sort();
      for (const k of keys) {
        if (!(k in tables.DEFAULT_COPY)) problems.push(`${part.id}: key not in DEFAULT_COPY: ${k}`);
        if (claimed.has(k)) problems.push(`${part.id}: key already claimed by ${claimed.get(k)}: ${k}`);
        claimed.set(k, part.id);
      }
      assigned.set(part.id, keys);
    }
    for (const part of inScreen) {
      if (part.keys !== undefined) continue;
      const keys = [...keysIn(part.components)]
        .filter((k) => k in tables.DEFAULT_COPY && !claimed.has(k))
        .sort();
      for (const k of keys) claimed.set(k, part.id);
      assigned.set(part.id, keys);
    }

    let order = 0;
    for (const part of inScreen) {
      if (!ID_RE.test(part.id)) problems.push(`bad id: ${part.id}`);
      if (!part.id.startsWith(`${screen}.`)) problems.push(`id does not start with its screen: ${part.id}`);
      if (seen.has(part.id)) problems.push(`duplicate id: ${part.id}`);
      seen.add(part.id);
      for (const rel of part.components) {
        if (!existsSync(ROOT + rel)) problems.push(`${part.id}: no such component: ${rel}`);
      }
      order += 1;
      parts.push({
        id: part.id,
        screen,
        order,
        title: part.title,
        what: part.what,
        components: part.components,
        states: part.states,
        keys: (assigned.get(part.id) ?? []).map((k) => keyRecord(k, tables, refusals)),
        status: part.status ?? 'live',
      });
    }
    const left = [...keysIn(files)]
      .filter((k) => k in tables.DEFAULT_COPY && !claimed.has(k))
      .sort();
    if (left.length > 0) problems.push(`${screen}.unassigned holds ${left.length} keys: ${left.join(', ')}`);
    parts.push({
      id: `${screen}.unassigned`,
      screen,
      order: order + 1,
      title: 'Unassigned',
      what: 'Keys this screen renders that no part claims. Must be empty.',
      components: files,
      states: [],
      keys: left.map((k) => keyRecord(k, tables, refusals)),
      status: 'synthetic',
    });
  }

  /*
   * THE STATES THE TREE ENUMERATES, checked against the tree rather than trusted.
   *
   * Three parts take their states from a union type, two screens take their sections from a
   * runtime list, and each is compared here. A member added to any of them without a matching
   * part fails --check, which is the whole reason the catalogue is generated instead of written.
   */
  const secondSegments = (screen) =>
    new Set(PARTS.filter((p) => p.screen === screen).map((p) => p.id.split('.')[1]));
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

  const reminders = PARTS.find((p) => p.id === 'settings.reminders');
  const reminderStates = readUnion('src/ui/components/ReminderSettingsPanel.tsx', 'ReminderStatus');
  if (!sameSet(reminders.states, reminderStates)) {
    problems.push(`settings.reminders states differ from ReminderStatus: ${reminders.states.join(', ')} vs ${reminderStates.join(', ')}`);
  }

  const toastIds = PARTS.filter((p) => p.screen === 'toast').map((p) => p.id.split('.')[1]);
  const toastKinds = readUnion('src/ui/components/ToastQueue.tsx', 'ToastKind');
  if (!sameSet(toastIds, toastKinds)) {
    problems.push(`toast parts differ from ToastKind: ${toastIds.join(', ')} vs ${toastKinds.join(', ')}`);
  }

  const migrationIds = PARTS.filter((p) => p.id.startsWith('popup.migration.')).map((p) => p.id.split('.')[2]);
  const phases = readUnion('src/ui/migration/MigrationWizard.tsx', 'Phase');
  if (!sameSet(migrationIds, phases)) {
    problems.push(`popup.migration parts differ from Phase: ${migrationIds.join(', ')} vs ${phases.join(', ')}`);
  }

  const setupSections = secondSegments('setup');
  for (const step of readConstArray('src/ui/setup/SetupWizard.tsx', 'STEPS')) {
    if (!setupSections.has(step)) problems.push(`no setup part for wizard step: ${step}`);
  }

  const settingsSections = secondSegments('settings');
  for (const row of readSettingsRowIds()) {
    if (!settingsSections.has(row)) problems.push(`no settings part for SETTINGS_ROWS id: ${row}`);
  }

  for (const view of tables.VIEWS) {
    if (!SCREEN_IDS.includes(view.id)) problems.push(`no screen for view: ${view.id}`);
  }

  /*
   * EVERY KEY IN THE TABLE, placed once or excused by name. A key the app can show and no part
   * claims is a part of the app the owner cannot comment on, which is the one failure this
   * catalogue exists to prevent. NOT_RENDERED is checked both ways, so an excuse cannot outlive
   * the surface it excuses.
   */
  const allKeys = Object.keys(tables.DEFAULT_COPY).sort();
  for (const key of allKeys) {
    if (claimed.has(key) && key in NOT_RENDERED) {
      problems.push(`${claimed.get(key)} claims a key NOT_RENDERED excuses: ${key}`);
    }
    if (!claimed.has(key) && !(key in NOT_RENDERED)) {
      problems.push(`no part claims and NOT_RENDERED does not excuse: ${key}`);
    }
  }
  for (const key of Object.keys(NOT_RENDERED)) {
    if (!(key in tables.DEFAULT_COPY)) problems.push(`NOT_RENDERED names a key not in DEFAULT_COPY: ${key}`);
  }
  const notRendered = Object.keys(NOT_RENDERED)
    .sort()
    .map((key) => ({ key, reason: NOT_RENDERED[key] }));

  const live = parts.filter((p) => p.status === 'live');
  return {
    catalogue: {
      generatedFrom: head,
      counts: {
        screens: SCREEN_IDS.length,
        parts: live.length,
        keys: live.reduce((n, p) => n + p.keys.length, 0),
        notRendered: notRendered.length,
        table: allKeys.length,
      },
      parts,
      notRendered,
    },
    problems,
  };
}

/** The same catalogue as a page a person can read. */
function toMarkdown(cat) {
  const out = [];
  out.push('# Alpha review catalogue');
  out.push('');
  out.push('Generated by `scripts/alpha-catalogue.mjs` from the tree. Nothing here is retyped.');
  out.push('Regenerate after any change to a copy table or a component:');
  out.push('');
  out.push('```bash');
  out.push('node scripts/alpha-catalogue.mjs');
  out.push('```');
  out.push('');
  out.push(`Built from \`${cat.generatedFrom}\`. ${cat.counts.parts} parts across ${cat.counts.screens} screens, holding ${cat.counts.keys} of the table's ${cat.counts.table} copy keys; ${cat.counts.notRendered} have no surface and are excused by name at the foot.`);
  out.push('');
  for (const screen of SCREEN_IDS) {
    const inScreen = cat.parts.filter((p) => p.screen === screen && p.status === 'live');
    out.push(`## ${screen} (${inScreen.length})`);
    out.push('');
    for (const part of inScreen) {
      out.push(`### \`${part.id}\``);
      out.push('');
      out.push(`${part.title}. ${part.what}`);
      out.push('');
      out.push(`Renders: ${part.components.map((c) => `\`${c}\``).join(', ')}`);
      out.push('');
      out.push(`States: ${part.states.map((s) => `\`${s}\``).join(', ')}`);
      out.push('');
      if (part.keys.length === 0) {
        out.push('No copy key. Review its layout and behaviour only.');
        out.push('');
        continue;
      }
      out.push('| Key | Clinical | Limelight | Board | Limelight row allowed |');
      out.push('| --- | --- | --- | --- | --- |');
      for (const k of part.keys) {
        const allowed = k.limelightRowPermitted ? 'yes' : `no: ${k.refusalGroup}`;
        const cell = (v) => v.replace(/\|/g, '\\|');
        out.push(`| \`${k.key}\` | ${cell(k.default)} | ${cell(k.limelight)} | ${cell(k.board)} | ${cell(allowed)} |`);
      }
      out.push('');
    }
  }
  out.push('## not rendered');
  out.push('');
  out.push('| Key | Why it has no surface |');
  out.push('| --- | --- |');
  for (const n of cat.notRendered) out.push(`| \`${n.key}\` | ${n.reason.replace(/\|/g, '\\|')} |`);
  out.push('');
  return out.join('\n');
}
```

Then replace the `argv` dispatch block's closing `}` with these three further branches:

```javascript
} else if (argv[0] === '--count') {
  const { catalogue } = await buildCatalogue();
  process.stdout.write(`${catalogue.counts.parts}\n`);
} else if (argv[0] === '--check') {
  const { problems } = await buildCatalogue();
  if (problems.length > 0) {
    for (const p of problems) process.stderr.write(`FAIL ${p}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('PASS alpha catalogue\n');
  }
} else {
  const { catalogue, problems } = await buildCatalogue();
  mkdirSync(`${ROOT}docs/feedback`, { recursive: true });
  writeFileSync(`${ROOT}docs/feedback/catalogue.json`, `${JSON.stringify(catalogue, null, 2)}\n`);
  writeFileSync(`${ROOT}docs/feedback/catalogue.md`, `${toMarkdown(catalogue)}\n`);
  process.stdout.write(`parts ${catalogue.counts.parts} keys ${catalogue.counts.keys} problems ${problems.length}\n`);
}
```

- [ ] **Step 3: Distribute the keys, one screen at a time**

Twelve of the fourteen screens draw more than one part out of one file, so those parts need an
explicit `keys` array. Only `boot` and `readiness` fill themselves, because each of their parts
either owns a whole file or declares its one key. Work one screen per iteration, in this order:

| Screen | Parts sharing a file |
| --- | --- |
| `shell` | `src/app/App.tsx` renders the topbar, the tab strip and both error banners |
| `setup` | one file, eleven parts |
| `today` | `src/ui/views/TodayView.tsx` renders the hero, the card, the start, the strip, the pause and the skip |
| `train` | `src/ui/views/TrainView.tsx` renders the header and the completion |
| `plan` | one file, four parts |
| `targets` | one file, seven parts |
| `log` | `src/ui/views/LogView.tsx` renders the section headings and the empty state |
| `atlas` | one file, six parts |
| `settings` | four files carry two or three parts each: the reminders panel, the skin settings, the export view and the data section |
| `install` | one file, two parts |
| `popup` | `src/ui/components/TimeCapsule.tsx` carries two parts and `src/ui/migration/MigrationWizard.tsx` carries three |
| `toast` | one file, five parts |

For each screen:

```bash
node scripts/alpha-catalogue.mjs --keys today 2>/dev/null
```

That prints one line per key mention, as `<line number>\t<key>\t<clinical string>`, in file order.
Open the component at those line numbers and assign each key to the part whose section renders it.
Three rules settle every case:

1. A key rendered by two sections goes to the earlier part, the one nearer the top of the screen.
2. A key with no visible section, such as an aria-label on the container, goes to the part whose
   element carries it.
3. A key rendered only inside a state the part already lists goes to that part, not to a new one.
4. A key that another screen's files also mention is filed once, under the first screen in app
   order. Claim it there. A later screen that wants the same key gets `already claimed by` from
   `--check`, and that is correct, not a defect.

After the fourteen screens, place what no screen reaches:

```bash
node scripts/alpha-catalogue.mjs --unplaced 2>/dev/null
```

That prints every key in `DEFAULT_COPY` the fourteen file lists do not mention, with the first
file under `src/` that names it. For a key behind a `FORMAT` helper in `src/content/copy.ts`, open
the helper, find the component that calls it (`git grep -n "FORMAT\.<helper>" -- src/ui`), and
claim the key in that component's part. For a key with no surface at all, add it to
`NOT_RENDERED` in `scripts/alpha-parts.mjs` with the file and line that proves it. Never leave a
key in neither place: `--check` fails on it by name.

Two screens have a rule of their own, because the tree already pairs the key with the section.
Each `step.<name>` key goes to `setup.<name>`, which is the mapping `STEP_TITLE_KEY` in
`src/ui/setup/SetupWizard.tsx` makes. Each `nav.<view>` key goes to `shell.tab-strip`, because the
tab strip is the one place `src/ui/nav/views.ts` is rendered as a list.

Write the array into the part's record in `scripts/alpha-parts.mjs`, sorted the way the file reads.
Then re-run the check for that screen:

```bash
node scripts/alpha-catalogue.mjs --check 2>&1 | grep "^FAIL today" || echo "today clean"
```

Expected once the screen is done: `today clean`.

- [ ] **Step 4: Run the whole gate**

```bash
node scripts/alpha-catalogue.mjs --check
node scripts/alpha-catalogue.mjs --count
```

Expected: `PASS alpha catalogue`, then `102`.

`--check` proves nine things at once: every id matches the grammar and starts with its screen, no
id repeats, every component path exists, every key exists in `DEFAULT_COPY`, no key is claimed
twice anywhere in the tree, every screen's leftovers are empty, every key in `DEFAULT_COPY` is
claimed once or excused in `NOT_RENDERED` and never both, the three union-backed part sets match
their unions in the tree, and every wizard step, settings row and view has a part.

- [ ] **Step 5: Generate the catalogue, twice, and prove it is deterministic**

```bash
node scripts/alpha-catalogue.mjs
sha256sum docs/feedback/catalogue.json docs/feedback/catalogue.md > /tmp/alpha-cat-1.sha
node scripts/alpha-catalogue.mjs
sha256sum -c /tmp/alpha-cat-1.sha
```

Expected: the summary line twice, then two `OK` lines. A mismatch means something in the build
reads a clock or an unsorted set, and it must be fixed before the pages are generated.

- [ ] **Step 6: Lint and commit**

```bash
npx eslint scripts/alpha-catalogue.mjs scripts/alpha-parts.mjs
git add scripts/alpha-catalogue.mjs scripts/alpha-parts.mjs docs/feedback/catalogue.json docs/feedback/catalogue.md
git commit -m "feat(P10): the alpha catalogue, 102 parts keyed by a stable id"
```

---

## Task 3: The catalogue gate in the suite

`--check` runs when somebody runs it. The suite runs on every push, so the closing assertion lives
there.

**Files:**
- Create: `src/content/alphaCatalogue.test.ts`

**Interfaces:**
- Consumes: `docs/feedback/catalogue.json`, read through Vite's `?raw` loader.

**Check, stated first:** `npx vitest run src/content/alphaCatalogue.test.ts` passes with seven tests,
and `npx tsc -b` stays clean.

The file is read with `?raw` rather than `node:fs`. `tsconfig.app.json` pins `types` to
`["vite/client", "vite-plugin-pwa/client"]`, so `@types/node` is not in the app project and a
`node:fs` import fails `tsc -b`. `src/domain/schedule/cursor.test.ts` and
`src/domain/migrations/v2plan.test.ts` already read source text this way, for the same reason.

- [ ] **Step 1: Write the failing test**

```typescript
// src/content/alphaCatalogue.test.ts
//
// The alpha catalogue is generated by scripts/alpha-catalogue.mjs and committed. This suite is
// the assertion that the committed copy still describes the tree: a key added to a screen with no
// part to hold it fails here rather than going missing from a review page.
//
// ?raw rather than node:fs because tsconfig.app.json pins `types` to the vite client types, the
// convention src/domain/schedule/cursor.test.ts already uses.
import { describe, expect, it } from 'vitest';

import catalogueJson from '../../docs/feedback/catalogue.json?raw';
import { DEFAULT_COPY } from './copy';

interface CatalogueKey {
  key: string;
  default: string;
  limelight: string;
  board: string;
  isControl: boolean;
  limelightRowPermitted: boolean;
  refusalGroup: string | null;
}

interface CataloguePart {
  id: string;
  screen: string;
  order: number;
  title: string;
  what: string;
  components: string[];
  states: string[];
  keys: CatalogueKey[];
  status: string;
}

interface Catalogue {
  generatedFrom: string;
  counts: { screens: number; parts: number; keys: number; notRendered: number; table: number };
  parts: CataloguePart[];
  notRendered: { key: string; reason: string }[];
}

const catalogue = JSON.parse(catalogueJson) as Catalogue;
const live = catalogue.parts.filter((p) => p.status === 'live');

/** Two or three hyphen-lower-case segments. Decision alpha-feedback-part-ids. */
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*){1,2}$/;

const SCREENS = [
  'boot',
  'shell',
  'setup',
  'readiness',
  'today',
  'train',
  'plan',
  'targets',
  'log',
  'atlas',
  'settings',
  'install',
  'popup',
  'toast',
];

describe('the alpha catalogue', () => {
  it('states its part count, and holds it', () => {
    expect(catalogue.counts.parts).toBe(102);
    expect(live).toHaveLength(102);
  });

  it('gives every part an id in the grammar, under a known screen', () => {
    for (const part of catalogue.parts) {
      expect(ID_RE.test(part.id), part.id).toBe(true);
      expect(SCREENS).toContain(part.screen);
      expect(part.id.startsWith(`${part.screen}.`), part.id).toBe(true);
    }
  });

  it('assigns every key to exactly one part', () => {
    const homes = new Map<string, string[]>();
    for (const part of live) {
      for (const k of part.keys) {
        const list = homes.get(k.key) ?? [];
        list.push(part.id);
        homes.set(k.key, list);
      }
    }
    const shared = [...homes.entries()].filter(([, ids]) => ids.length > 1);
    expect(shared).toEqual([]);
  });

  it('leaves no key unassigned on any screen', () => {
    const leftovers = catalogue.parts
      .filter((p) => p.id.endsWith('.unassigned'))
      .filter((p) => p.keys.length > 0)
      .map((p) => `${p.id}: ${p.keys.map((k) => k.key).join(', ')}`);
    expect(leftovers).toEqual([]);
  });

  it('places every key in DEFAULT_COPY exactly once, or excuses it by name', () => {
    const placed = new Set(live.flatMap((p) => p.keys.map((k) => k.key)));
    const excused = new Set(catalogue.notRendered.map((n) => n.key));
    const table = Object.keys(DEFAULT_COPY);
    const missing = table.filter((k) => !placed.has(k) && !excused.has(k));
    expect(missing).toEqual([]);
    const both = [...excused].filter((k) => placed.has(k));
    expect(both).toEqual([]);
    expect(placed.size + excused.size).toBe(table.length);
    expect(catalogue.counts.table).toBe(table.length);
  });

  it('quotes the default string the table holds, byte for byte', () => {
    for (const part of live) {
      for (const k of part.keys) {
        expect(DEFAULT_COPY[k.key as keyof typeof DEFAULT_COPY], k.key).toBe(k.default);
      }
    }
  });

  it('names a refusal group for every control that may not take a limelight row', () => {
    for (const part of live) {
      for (const k of part.keys) {
        if (k.limelightRowPermitted) {
          expect(k.refusalGroup, k.key).toBeNull();
        } else {
          expect(typeof k.refusalGroup, k.key).toBe('string');
          expect(k.limelight, k.key).toBe('same');
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run it and watch it pass**

```bash
npx vitest run src/content/alphaCatalogue.test.ts
```

Expected: `Test Files  1 passed (1)` and `Tests  7 passed (7)`.

If the third or fourth test fails, the part table is wrong, not the test. Fix
`scripts/alpha-parts.mjs`, regenerate with `node scripts/alpha-catalogue.mjs`, and run again.

- [ ] **Step 3: Prove it fails when the catalogue drifts**

```bash
node -e "const f='docs/feedback/catalogue.json';const c=JSON.parse(require('fs').readFileSync(f,'utf8'));c.counts.parts=1;require('fs').writeFileSync(f,JSON.stringify(c,null,2)+'\n')"
npx vitest run src/content/alphaCatalogue.test.ts 2>&1 | tail -5
node scripts/alpha-catalogue.mjs
npx vitest run src/content/alphaCatalogue.test.ts 2>&1 | tail -3
```

Expected: the first run reports `1 failed`, and the second reports `7 passed` once the generator
has put the file back. A test that cannot fail is not a gate.

- [ ] **Step 4: Typecheck and lint**

```bash
npx tsc -b
npx eslint src/content/alphaCatalogue.test.ts
```

Expected: no output from either.

- [ ] **Step 5: Commit**

```bash
git add src/content/alphaCatalogue.test.ts docs/feedback/catalogue.json
git commit -m "test(P10): the alpha catalogue describes the tree, or the suite says so"
```

---

## Task 4: The review page generator

**Files:**
- Create: `scripts/alpha-pages.mjs`
- Create: `docs/feedback/pages/01-boot-setup-readiness.html` through
  `docs/feedback/pages/07-popups-toasts.html`

**Interfaces:**
- Consumes: `docs/feedback/catalogue.json` from Task 2.
- Produces for Task 5: the `PAGES` array and the `page()` function, which page 0 joins.

**Check, stated first:** the generator writes seven pages, each page holds one `<section>` per live
part of its screens and none of any other screen, the section count across the seven pages equals
102, and two runs produce byte-identical files.

### The design rules this page obeys

| Rule | How |
| --- | --- |
| Limelight identity | The palette is quoted from `:root[data-skin='limelight']` in `src/ui/styles/tokens.css`: lime `#8ace00`, ink `#000000`, pink `#ff5fcb`, fine `#454545`, panel `#000000`, panel text `#ffffff`. |
| Contrast | Only pairs `src/ui/styles/tokens.css` states a measured ratio for: `#000000` on `#8ace00` at 10.91:1, `#454545` on `#8ace00` at 4.98:1, `#ffffff` on `#000000` at 21.00:1, `#8ace00` on `#000000` at 10.91:1, `#ff5fcb` on `#000000` at 7.75:1, `#000000` on `#ff5fcb` at 7.75:1. |
| Pink is never type on lime | `#ff5fcb` on `#8ace00` measures 1.41:1. In the light theme pink is a fill, a border and a focus ring, and nothing else. It becomes type only in the dark theme, on black, where it measures 7.75:1. |
| White is never type on lime | `#ffffff` on `#8ace00` measures 1.92:1. White is used as an input FILL, with black type on it at 21.00:1, which is a different job. |
| No invented colour | The dark theme carries no separate fine-print grey, because no measured ratio exists for one. Secondary text in the dark theme is `#ffffff` at a smaller size and a lighter weight. Hierarchy comes from size, not from an unmeasured colour. |
| Fonts | Archivo and JetBrains Mono from Google Fonts, each with a real fallback stack. Archivo is the skin's own family. JetBrains Mono sets the part ids and copy keys, because this is a review tool and a key is code. |
| Phone first | One column, `max-width: 44rem`, 16 px gutters, no table. Nothing scrolls the body sideways. |
| Both themes | The complete light palette on bare `:root`, redefined under `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]` and `:root[data-theme="light"]` so an explicit choice wins either way. |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` turns off every transition, animation and smooth scroll. |
| 44 px targets | Every button and the theme control carry `min-height: 44px`. |
| No emoji | Asserted in Task 6 with a command. The favicon is the one exception, and Task 8 states why. |

- [ ] **Step 1: Write the generator**

```javascript
// scripts/alpha-pages.mjs
//
// The alpha review pages: one HTML page per screen group, generated from docs/feedback/catalogue.json.
// P10 Tasks 4 and 5.
//
//   node scripts/alpha-pages.mjs            round 1
//   node scripts/alpha-pages.mjs --round 2  round 2, with its own storage keys
//
// The pages are static HTML under docs/. They are not application code, so the ESLint storage ban
// (eslint.config.js, "Storage is owned by src/store/persistence.ts") does not reach them and their
// localStorage use is correct there. This generator is linted as scripts/**/*.mjs and touches no
// storage itself.
//
// THE PAGES SHOW NO PIXELS OF THE APP. No screenshot exists and no agent has a browser. Each page
// mirrors a screen's structure and its strings; the owner keeps the live app open beside it, at
// https://vkotzamanis.github.io/FixThisInjustice/ , where limelight is the shipped default skin
// (src/domain/schema.ts, the `skin` default).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = `${ROOT}docs/feedback/pages/`;

const roundFlag = process.argv.indexOf('--round');
const ROUND = roundFlag === -1 ? 1 : Number(process.argv[roundFlag + 1]);
if (!Number.isInteger(ROUND) || ROUND < 1) throw new Error('--round takes a positive integer');

const catalogue = JSON.parse(readFileSync(`${ROOT}docs/feedback/catalogue.json`, 'utf8'));
const LIVE = catalogue.parts.filter((p) => p.status === 'live');

const LIVE_URL = 'https://vkotzamanis.github.io/FixThisInjustice/';

/** The eight pages, in the order the owner walks them. */
export const PAGES = [
  { file: '00-how-to-test.html', id: '00-how-to-test', title: 'How To Test', short: 'How to test', screens: [] },
  { file: '01-boot-setup-readiness.html', id: '01-boot-setup-readiness', title: 'Boot And Setup Review', short: 'Boot and setup', screens: ['boot', 'shell', 'setup', 'readiness'] },
  { file: '02-today.html', id: '02-today', title: 'Today Review', short: 'Today', screens: ['today'] },
  { file: '03-train.html', id: '03-train', title: 'Train Review', short: 'Train', screens: ['train'] },
  { file: '04-plan-targets.html', id: '04-plan-targets', title: 'Plan And Targets Review', short: 'Plan and Targets', screens: ['plan', 'targets'] },
  { file: '05-log-atlas.html', id: '05-log-atlas', title: 'Log And Atlas Review', short: 'Log and Atlas', screens: ['log', 'atlas'] },
  { file: '06-settings.html', id: '06-settings', title: 'Settings Review', short: 'Settings', screens: ['settings', 'install'] },
  { file: '07-popups-toasts.html', id: '07-popups-toasts', title: 'Popups And Toasts Review', short: 'Popups and toasts', screens: ['popup', 'toast'] },
];

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The stylesheet. One copy per page, because a page is published on its own origin and cannot
 * load a stylesheet from anywhere but the allowed font host.
 *
 * Every colour is quoted from :root[data-skin='limelight'] in src/ui/styles/tokens.css, and every
 * pair used for type has a measured ratio recorded in the comment block above that rule.
 */
const CSS = `
:root{
  --lime:#8ace00; --ink:#000000; --pink:#ff5fcb; --fine:#454545;
  --panel:#000000; --panel-text:#ffffff; --field:#ffffff;
  --bg:var(--lime); --text:var(--ink); --text-2:var(--fine);
  --line:rgba(0,0,0,.22); --line-2:var(--ink);
  --chip:var(--pink); --chip-text:var(--ink);
  --code:var(--fine);
  --sans:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  color-scheme:light;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:var(--panel); --text:var(--panel-text); --text-2:var(--panel-text);
    --line:rgba(255,255,255,.24); --line-2:var(--lime);
    --chip:var(--pink); --chip-text:var(--ink);
    --code:var(--lime); --field:var(--panel);
    color-scheme:dark;
  }
}
:root[data-theme="dark"]{
  --bg:var(--panel); --text:var(--panel-text); --text-2:var(--panel-text);
  --line:rgba(255,255,255,.24); --line-2:var(--lime);
  --chip:var(--pink); --chip-text:var(--ink);
  --code:var(--lime); --field:var(--panel);
  color-scheme:dark;
}
:root[data-theme="light"]{
  --bg:var(--lime); --text:var(--ink); --text-2:var(--fine);
  --line:rgba(0,0,0,.22); --line-2:var(--ink);
  --chip:var(--pink); --chip-text:var(--ink);
  --code:var(--fine); --field:#ffffff;
  color-scheme:light;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);font-size:16px;line-height:1.5;overflow-x:hidden}
.wrap{max-width:44rem;margin:0 auto;padding:16px}
header.page{padding:24px 16px 12px;border-bottom:2px solid var(--line-2)}
.eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 6px}
h1{font-family:var(--sans);font-weight:800;font-size:clamp(28px,7vw,40px);line-height:1.05;margin:0 0 10px;text-transform:lowercase}
h2{font-family:var(--sans);font-weight:800;font-size:22px;margin:32px 0 4px;text-transform:lowercase;border-top:2px solid var(--line-2);padding-top:14px}
h3{font-family:var(--sans);font-weight:700;font-size:18px;margin:0 0 2px}
p{margin:0 0 10px}
.lede{max-width:60ch}
.small{font-size:13px;color:var(--text-2)}
code{font-family:var(--mono);font-size:12.5px;color:var(--code);word-break:break-all}
section.part{border:1px solid var(--line);border-radius:4px;padding:14px;margin:0 0 16px;background:transparent}
.pid{display:inline-block;font-family:var(--mono);font-size:12px;border:1px solid var(--line-2);border-radius:3px;padding:2px 6px;margin:0 0 8px}
.what{margin:0 0 10px;font-size:14px;color:var(--text-2)}
.states{font-family:var(--mono);font-size:12px;margin:0 0 12px;color:var(--text-2)}
ol.strings{list-style:none;margin:0 0 14px;padding:0}
ol.strings li{border-left:3px solid var(--chip);padding:0 0 0 10px;margin:0 0 12px}
.lime-str{font-size:17px;font-weight:700;margin:2px 0 4px}
.refusal{font-size:12px;margin:4px 0 0;border:1px dashed var(--line-2);padding:4px 6px;border-radius:3px}
label.box{display:block;font-weight:700;font-size:14px;margin:0 0 6px}
textarea{width:100%;min-height:88px;padding:10px;border:1px solid var(--line-2);border-radius:3px;background:var(--field);color:var(--ink);font:inherit;font-size:15px}
:root[data-theme="dark"] textarea,:root:not([data-theme="light"]) textarea{color:var(--text)}
textarea:focus-visible{outline:3px solid var(--chip);outline-offset:2px}
textarea.set{border-width:3px;border-color:var(--chip)}
button{min-height:44px;padding:0 16px;border:2px solid var(--line-2);border-radius:3px;background:var(--chip);color:var(--chip-text);font:inherit;font-weight:700;cursor:pointer}
button.quiet{background:transparent;color:var(--text)}
button:focus-visible{outline:3px solid var(--line-2);outline-offset:2px}
.tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2}
.count{font-family:var(--mono);font-size:12px}
.assembled{width:100%;min-height:180px;font-family:var(--mono);font-size:12.5px}
nav.pager{display:flex;gap:10px;flex-wrap:wrap;padding:16px;border-top:2px solid var(--line-2)}
nav.pager a{font-family:var(--mono);font-size:13px;min-height:44px;display:inline-flex;align-items:center;padding:0 12px;border:1px solid var(--line-2);border-radius:3px;color:var(--text);text-decoration:none}
a{color:var(--text)}
@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;

/** One string, as the Limelight app renders it: the override where one exists, else the default. */
function stringBlock(k) {
  const lines = [
    `<li>`,
    `<code>${esc(k.key)}</code>`,
    `<p class="lime-str">${esc(k.limelight === 'same' ? k.default : k.limelight)}</p>`,
  ];
  if (!k.limelightRowPermitted) {
    lines.push(`<p class="refusal">This string keeps its plain wording on every skin: ${esc(k.refusalGroup)}. A word change here is out of scope; a layout or behaviour change is not.</p>`);
  }
  lines.push('</li>');
  return lines.join('\n');
}

/** One part: what it is, what it says, and the box the owner writes in. */
function partSection(part) {
  const strings =
    part.keys.length === 0
      ? '<p class="small">No copy key. Review its layout and behaviour.</p>'
      : `<ol class="strings">\n${part.keys.map(stringBlock).join('\n')}\n</ol>`;
  return `
<section class="part" id="${esc(part.id)}">
  <p class="pid"><code>${esc(part.id)}</code></p>
  <h3>${esc(part.title)}</h3>
  <p class="what">${esc(part.what)}</p>
  <p class="states">states: ${part.states.length === 0 ? 'none' : part.states.map(esc).join(', ')}</p>
  ${strings}
  <label class="box" for="c-${esc(part.id)}">What needs to change here?</label>
  <textarea id="c-${esc(part.id)}" data-part="${esc(part.id)}" placeholder="What you saw. What you expected."></textarea>
</section>`;
}

/** The per-page script: persistence, the counter and the Assemble block. */
function pageScript(pageId) {
  return `
(function(){
  var KEY='fti-alpha-r${ROUND}-${pageId}';
  var store={};
  try{store=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){store={};}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(store));}catch(e){}}
  var boxes=Array.prototype.slice.call(document.querySelectorAll('textarea[data-part]'));
  var count=document.getElementById('count');
  function tally(){
    var n=0;
    boxes.forEach(function(b){if((store[b.getAttribute('data-part')]||{}).text)n++;});
    count.textContent=n+' of '+boxes.length+' commented';
  }
  boxes.forEach(function(b){
    var id=b.getAttribute('data-part');
    var rec=store[id]||{};
    if(rec.text){b.value=rec.text;b.classList.add('set');}
    b.addEventListener('input',function(){
      var t=b.value.trim();
      if(t){store[id]={text:b.value};b.classList.add('set');}
      else{delete store[id];b.classList.remove('set');}
      save();tally();
    });
  });
  var out=document.getElementById('assembled'),status=document.getElementById('status');
  document.getElementById('assemble').addEventListener('click',function(){
    var lines=[];
    boxes.forEach(function(b){
      var id=b.getAttribute('data-part');
      var rec=store[id];
      if(rec&&rec.text&&rec.text.trim()){
        lines.push('- ['+id+'] '+rec.text.trim().replace(/\\s+/g,' '));
      }
    });
    out.value=lines.length?lines.join('\\n'):'(nothing written yet)';
    status.textContent=lines.length+' comment'+(lines.length===1?'':'s')+'. Select the text and copy it.';
    out.focus();out.select();
    if(navigator.clipboard&&lines.length){
      navigator.clipboard.writeText(out.value).then(function(){status.textContent=lines.length+' comments copied to the clipboard.';},function(){});
    }
  });
  document.getElementById('theme').addEventListener('click',function(){
    var r=document.documentElement;
    r.setAttribute('data-theme',r.getAttribute('data-theme')==='dark'?'light':'dark');
  });
  tally();
})();`;
}

/** A whole page. `body` is the content between the tools bar and the assemble block. */
export function page(def, body, index) {
  const next = PAGES[index + 1];
  const prev = PAGES[index - 1];
  const pager = [
    prev === undefined ? '' : `<a href="#">back: ${esc(prev.short)}</a>`,
    next === undefined ? '' : `<a href="#">next: ${esc(next.short)}</a>`,
  ]
    .filter(Boolean)
    .join('');
  return `<title>${esc(def.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;700;800&family=JetBrains+Mono:wght@400;600&display=swap">
<style>${CSS}</style>
<header class="page">
  <p class="eyebrow">alpha round ${ROUND}</p>
  <h1>${esc(def.short)}</h1>
  <p class="lede">Open <a href="${LIVE_URL}">the live app</a> on your phone beside this page. The skin is limelight by default. Walk the screen, come back, write in the box under the part you mean.</p>
</header>
<div class="tools">
  <span class="count" id="count">0 of 0 commented</span>
  <button type="button" id="assemble">Assemble</button>
  <button type="button" class="quiet" id="theme">Flip theme</button>
</div>
<main class="wrap">
${body}
<section class="part" id="${esc(def.id)}.general">
  <p class="pid"><code>${esc(def.id)}.general</code></p>
  <h3>Anything else on this page</h3>
  <p class="what">A comment that belongs to the whole screen rather than to one part.</p>
  <p class="states">states: none</p>
  <label class="box" for="c-${esc(def.id)}.general">What needs to change?</label>
  <textarea id="c-${esc(def.id)}.general" data-part="${esc(def.id)}.general" placeholder="What you saw. What you expected."></textarea>
</section>
<h2>your comments, ready to paste</h2>
<p class="small">One line per box you filled, in the form the round document reads. Press Assemble, then paste the block back into Claude. You can also leave a comment thread on this published page, or say it in the session and name the part id.</p>
<textarea class="assembled" id="assembled" readonly aria-label="Assembled comments" placeholder="Press Assemble."></textarea>
<p class="small" id="status" role="status" aria-live="polite"></p>
</main>
<nav class="pager">${pager}</nav>
<script>${pageScript(def.id)}</script>
`;
}

/** The screen pages. Page 0 is written by Task 5 and joins this loop there. */
mkdirSync(OUT, { recursive: true });
let written = 0;
let sections = 0;
PAGES.forEach((def, index) => {
  if (def.screens.length === 0) return;
  const parts = def.screens.flatMap((screen) => LIVE.filter((p) => p.screen === screen));
  const body = def.screens
    .map((screen) => {
      const inScreen = LIVE.filter((p) => p.screen === screen);
      return `<h2>${esc(screen)} (${inScreen.length})</h2>\n${inScreen.map(partSection).join('\n')}`;
    })
    .join('\n');
  writeFileSync(OUT + def.file, page(def, body, index));
  written += 1;
  sections += parts.length;
});
process.stdout.write(`pages ${written} sections ${sections} round ${ROUND}\n`);
```

- [ ] **Step 2: Generate and count**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
node scripts/alpha-pages.mjs
```

Expected: `pages 7 sections 102 round 1`.

- [ ] **Step 3: Prove one section per part, and no cross-page leakage**

```bash
grep -ho 'section class="part" id="[^"]*"' docs/feedback/pages/*.html | sed 's/.*id="//;s/"//' | grep -v '\.general$' | sort > /tmp/alpha-page-ids.txt
node -e "const c=require('./docs/feedback/catalogue.json');console.log(c.parts.filter(p=>p.status==='live').map(p=>p.id).sort().join('\n'))" > /tmp/alpha-cat-ids.txt
diff /tmp/alpha-page-ids.txt /tmp/alpha-cat-ids.txt && echo "ids match"
grep -c 'id="today\.' docs/feedback/pages/03-train.html || echo "no today parts on the train page"
```

Expected: `ids match`, then `no today parts on the train page`.

- [ ] **Step 4: Prove the generator is deterministic**

```bash
sha256sum docs/feedback/pages/*.html > /tmp/alpha-pages-1.sha
node scripts/alpha-pages.mjs
sha256sum -c /tmp/alpha-pages-1.sha
```

Expected: seven `OK` lines.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint scripts/alpha-pages.mjs
git add scripts/alpha-pages.mjs docs/feedback/pages/
git commit -m "feat(P10): one review page per screen group, generated from the catalogue"
```

---

## Task 5: Page 0, how to test

**Files:**
- Modify: `scripts/alpha-pages.mjs` (add the page 0 body and let the loop write it)
- Create: `docs/feedback/pages/00-how-to-test.html`

**Check, stated first:** page 0 exists, names the live URL, names the three channels, states what a
comment should say, and holds no part section. `node scripts/alpha-pages.mjs` reports
`pages 8 sections 102`.

- [ ] **Step 1: Add the page 0 body, above the generation loop**

```javascript
const HOW_TO_TEST = `
<h2>the pass</h2>
<p>Install the app on your phone first. Add it to the Home Screen and open it from the icon, because a browser tab has different safe-area insets and a tab pass does not substitute for an installed one.</p>
<p>The skin is <strong>limelight</strong> when you arrive: it is the shipped default. Leave it there. This round reviews one design. Every string on these pages is the one the limelight app shows, and every comment is read as a comment on that app: its words, its layout, and what it does. The other skins are adapted from the finished app afterwards.</p>
<p>Work one page at a time. Open the screen in the app, look at it, come back here, and write in the box under the part you mean. Each part carries its id in a box at the top; that id is how your comment reaches a task.</p>
<h2>what a comment should say</h2>
<p>Two things, in any order. <strong>What you saw.</strong> <strong>What you expected instead.</strong></p>
<p class="small">Good: "the day glyphs on the strip are too small to tap and I could not tell served from no-show. I expected a colour difference." Weak: "strip is bad."</p>
<h2>the three channels</h2>
<p><strong>The box.</strong> Type into the box under a part. It saves in this browser. Press <strong>Assemble</strong> at the top and the page builds a block of lines, one per box, and copies it. Paste that block back into Claude.</p>
<p><strong>The thread.</strong> These pages are published, so you can leave a comment thread on any part of one. Send the thread to Claude and it is read and answered in the thread.</p>
<p><strong>The session.</strong> Say it in the conversation and name the part id. That is the fastest channel for one comment and the worst for twenty.</p>
<h2>what cannot change</h2>
<p>A skin changes words. It never changes a number, a unit, a slot the app fills, or what a control does. A skin also never jokes on a control whose misreading costs data: the wipe, the import, the legacy delete, the export, the reminder states and the install steps carry the same plain sentence on every skin. Where that applies, the part says so under the string.</p>
<p>Ask for those changes anyway if you want them. They come back as a question rather than as a silent refusal.</p>
<h2>what to do when something is broken</h2>
<p>Say so in the box. A crash, a control that does nothing, a number that looks wrong: those are worth more than a wording note, and they get their own task with a test.</p>
`;
```

- [ ] **Step 2: Let the loop write page 0**

Replace the early return in the generation loop:

```javascript
PAGES.forEach((def, index) => {
  const body =
    def.screens.length === 0
      ? HOW_TO_TEST
      : def.screens
          .map((screen) => {
            const inScreen = LIVE.filter((p) => p.screen === screen);
            return `<h2>${esc(screen)} (${inScreen.length})</h2>\n${inScreen.map(partSection).join('\n')}`;
          })
          .join('\n');
  const parts = def.screens.flatMap((screen) => LIVE.filter((p) => p.screen === screen));
  writeFileSync(OUT + def.file, page(def, body, index));
  written += 1;
  sections += parts.length;
});
```

Page 0 still gets its own `00-how-to-test.general` box from `page()`, which is where a comment
about the procedure itself belongs.

- [ ] **Step 3: Generate and check**

```bash
node scripts/alpha-pages.mjs
grep -c 'section class="part"' docs/feedback/pages/00-how-to-test.html
grep -c 'vkotzamanis.github.io/FixThisInjustice' docs/feedback/pages/00-how-to-test.html
grep -o 'next: [a-zA-Z ]*' docs/feedback/pages/00-how-to-test.html
```

Expected: `pages 8 sections 102 round 1`, then `1` (the general box alone), then a count of at least
`1`, then `next: Boot and setup`.

- [ ] **Step 4: Commit**

```bash
git add scripts/alpha-pages.mjs docs/feedback/pages/00-how-to-test.html
git commit -m "feat(P10): page 0, how to run the alpha pass"
```

---

## Task 6: The page rules, checked

Nobody can measure a pixel here, so every rule that can be checked as text is checked as text.

**Files:**
- Modify: `docs/feedback/pages/*.html` only if a check fails.

**Check, stated first:** the eight commands below all pass, and each one names the rule it stands
for.

- [ ] **Step 1: No emoji anywhere in the pages**

```bash
node -e "
const {readdirSync,readFileSync}=require('fs');
const re=/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\uFE0F/u;
let bad=0;
for(const f of readdirSync('docs/feedback/pages')){
  if(!f.endsWith('.html'))continue;
  const t=readFileSync('docs/feedback/pages/'+f,'utf8').split('\n');
  t.forEach((l,i)=>{if(re.test(l)){console.log('FAIL',f+':'+(i+1),l.trim().slice(0,80));bad++;}});
}
console.log(bad===0?'PASS no emoji':'FAIL '+bad+' lines');
"
```

Expected: `PASS no emoji`. The gate mirrors `scripts/check-no-emoji.mjs`, which scans
`src/content/copy*.ts` and `src/**/*.tsx` and does not reach `docs/`.

- [ ] **Step 2: Pink is never type on lime**

```bash
grep -n 'color:var(--pink)\|color:#ff5fcb' docs/feedback/pages/*.html && echo "FAIL pink used as type" || echo "PASS pink is fill and border only"
```

Expected: `PASS pink is fill and border only`. `#ff5fcb` on `#8ace00` measures 1.41:1 and
`src/ui/styles/tokens.css` bans it at every size. The dark theme reaches pink type only through
`--chip-text` on a pink fill, which is `#000000` on `#ff5fcb` at 7.75:1.

- [ ] **Step 3: All four theme blocks are present on every page**

```bash
for f in docs/feedback/pages/*.html; do
  n=$(grep -c 'prefers-color-scheme: dark\|data-theme="dark"\|data-theme="light"' "$f")
  echo "$f $n"
done
```

Expected: `4` on every page. The four lines are the `@media (prefers-color-scheme: dark)` opener,
the `:root:not([data-theme="light"])` selector inside it, `:root[data-theme="dark"]` and
`:root[data-theme="light"]`. The bare `:root` block above them carries the complete light palette,
so no colour has its only definition inside a media or attribute block.

- [ ] **Step 4: Reduced motion, and 44 px targets**

```bash
grep -c 'prefers-reduced-motion: reduce' docs/feedback/pages/*.html
grep -c 'min-height:44px' docs/feedback/pages/*.html
```

Expected: `1` and `2` on every page. The two 44 px targets are the buttons and the pager links.
The comment box is a textarea at 88 px, which clears the floor by construction.

- [ ] **Step 5: Only allowed external hosts**

```bash
grep -ohE 'https://[a-z.]+' docs/feedback/pages/*.html | sort -u
```

Expected exactly three hosts: `https://fonts.googleapis.com`, `https://fonts.gstatic.com` and
`https://vkotzamanis.github.io`. The Artifact runtime blocks every other host, and a stylesheet
from anywhere but `fonts.googleapis.com` fails silently.

After Task 8 has filled in `urls.json` this command returns a fourth host, `https://claude.ai`,
which is the pager pointing at the sibling pages. Re-run it then and expect four.

- [ ] **Step 6: The body never scrolls sideways**

```bash
grep -c 'overflow-x:hidden' docs/feedback/pages/*.html
grep -n '<table' docs/feedback/pages/*.html && echo "FAIL a table would need its own scroller" || echo "PASS no table"
```

Expected: `1` per page, then `PASS no table`.

- [ ] **Step 7: Every string on a page came from the catalogue**

```bash
node -e "
const c=require('./docs/feedback/catalogue.json');
const {readFileSync}=require('fs');
const html=readFileSync('docs/feedback/pages/02-today.html','utf8');
const part=c.parts.find(p=>p.id==='today.strip');
const missing=part.keys.filter(k=>!html.includes(k.key));
console.log(missing.length===0?'PASS today.strip keys all present':'FAIL '+missing.map(k=>k.key).join(', '));
"
```

Expected: `PASS today.strip keys all present`.

- [ ] **Step 8: Commit any fix**

If a check failed, fix `scripts/alpha-pages.mjs`, regenerate, and re-run every check in this task
before committing.

```bash
git add scripts/alpha-pages.mjs docs/feedback/pages/
git commit -m "fix(P10): the review pages pass the design and contrast checks"
```

If nothing failed, record that in the task's review note and make no commit. An empty commit is a
false record of work.

---

## Task 7: The page index, and links that go somewhere

A generated page cannot know the URL it will be published at, so the pager links point at `#`
until a published URL exists. This task teaches the generator to read them from a file and writes
the index that holds them.

**Files:**
- Modify: `scripts/alpha-pages.mjs`
- Create: `docs/feedback/pages/urls.json`
- Create: `docs/feedback/pages/README.md`

**Check, stated first:** with an empty `urls.json` the pager still renders and every `href` is `#`.
With a URL in it, the matching `href` is that URL, and `grep -c 'href="#"'` drops by one per URL.

- [ ] **Step 1: Read the URLs in the generator**

Add, below the `catalogue` load:

```javascript
/**
 * The published Artifact URL of each page, filled in by the coordinator after the first publish.
 * A page cannot know its own URL at generation time, so the pager falls back to '#' and the index
 * carries the list. Regenerate and republish after filling this in.
 */
let URLS = {};
try {
  URLS = JSON.parse(readFileSync(`${ROOT}docs/feedback/pages/urls.json`, 'utf8'));
} catch {
  URLS = {};
}
```

Then change the two pager lines in `page()`. `||` rather than `??`, because an unpublished page
is recorded as an empty string and `??` falls back only on `null` and `undefined`:

```javascript
  const pager = [
    prev === undefined ? '' : `<a href="${esc(URLS[prev.id] || '#')}">back: ${esc(prev.short)}</a>`,
    next === undefined ? '' : `<a href="${esc(URLS[next.id] || '#')}">next: ${esc(next.short)}</a>`,
  ]
    .filter(Boolean)
    .join('');
```

- [ ] **Step 2: Create the empty URL file**

```bash
cat > docs/feedback/pages/urls.json <<'JSON'
{
  "00-how-to-test": "",
  "01-boot-setup-readiness": "",
  "02-today": "",
  "03-train": "",
  "04-plan-targets": "",
  "05-log-atlas": "",
  "06-settings": "",
  "07-popups-toasts": ""
}
JSON
node scripts/alpha-pages.mjs
grep -c 'href="#"' docs/feedback/pages/00-how-to-test.html
```

Expected: `pages 8 sections 102 round 1`, then `1`. Page 0 has one pager link, forward, and it is
`#` until Task 8 fills in a URL.

- [ ] **Step 3: Write the index**

````bash
cat > docs/feedback/pages/README.md <<'MD'
# Alpha review pages

Eight static pages, generated from `docs/feedback/catalogue.json`. They are the input the owner's
alpha pass writes into. Regenerate after any change to a copy table or a component:

```bash
node scripts/alpha-catalogue.mjs
node scripts/alpha-pages.mjs
```

The generator is deterministic: two runs on one tree produce byte-identical files.

## The pages, in order

| Page | Screens | Parts | Published |
| --- | --- | --- | --- |
| `00-how-to-test.html` | none | 0 | not yet |
| `01-boot-setup-readiness.html` | boot, shell, setup, readiness | 22 | not yet |
| `02-today.html` | today | 13 | not yet |
| `03-train.html` | train | 8 | not yet |
| `04-plan-targets.html` | plan, targets | 12 | not yet |
| `05-log-atlas.html` | log, atlas | 11 | not yet |
| `06-settings.html` | settings, install | 18 | not yet |
| `07-popups-toasts.html` | popup, toast | 18 | not yet |

102 parts in total. `node scripts/alpha-catalogue.mjs --count` prints that number from the tree.

## Publishing

The coordinator publishes each page with the Artifact tool, one call per file, and must load the
`artifact-design` skill before writing or republishing any of them. A favicon is required on the
first publish of a page and is omitted on every redeploy, so a page keeps the icon it has. The same
file path redeploys to the same URL, so a regenerated page replaces its published version and the
link the owner has keeps working.

Record each URL in `urls.json`, then regenerate and republish so the pager links resolve.

## Reading the comments back

Three channels, all of which end in the round document.

1. The box on the page. The owner presses Assemble and pastes the block back.
2. A comment thread on the published page. The coordinator reads them with the Artifact tool's
   `comments` action and replies on the threads the owner has sent to Claude.
3. A message in the session naming the part id.
MD
git add docs/feedback/pages/README.md docs/feedback/pages/urls.json scripts/alpha-pages.mjs docs/feedback/pages/
git commit -m "docs(P10): the review page index, and pager links driven by urls.json"
````

- [ ] **Step 4: Check the part counts in the index against the catalogue**

```bash
node -e "
const c=require('./docs/feedback/catalogue.json');
const g={};
for(const p of c.parts.filter(x=>x.status==='live'))g[p.screen]=(g[p.screen]||0)+1;
const pages=[['01',['boot','shell','setup','readiness']],['02',['today']],['03',['train']],['04',['plan','targets']],['05',['log','atlas']],['06',['settings','install']],['07',['popup','toast']]];
for(const [n,s] of pages)console.log(n, s.reduce((t,k)=>t+(g[k]||0),0));
"
```

Expected: `01 22`, `02 13`, `03 8`, `04 12`, `05 11`, `06 18`, `07 18`. Those sum to 102. If a
number differs, correct the table in `docs/feedback/pages/README.md` and commit the correction.

---

## Task 8: Publish, and record the URLs

This task is the coordinator's, not an implementer's: only the coordinator holds the Artifact tool.

**Files:**
- Modify: `docs/feedback/pages/urls.json`, `docs/feedback/pages/README.md`, and the eight pages
  after the regeneration.

**Check, stated first:** eight URLs exist, `urls.json` holds all eight, the regenerated pages carry
no `href="#"` except on page 0's back link and page 7's next link, and each published page opens.

- [ ] **Step 1: Load the design skill**

Load `artifact-design` before the first publish. It is required before writing or republishing any
artifact and it is not optional here, because these pages are the owner's whole view of the round.

- [ ] **Step 2: Publish the eight pages**

One `Artifact` call per file, in page order, each with `file_path` set to the page, a one-sentence
`description`, and a `favicon` on this first publish only.

| Page | Title | Description |
| --- | --- | --- |
| `00-how-to-test.html` | How To Test | How to run the alpha pass, and the three ways to send a comment back. |
| `01-boot-setup-readiness.html` | Boot And Setup Review | The boot sequence, the shell, the nine wizard steps and the readiness screening. |
| `02-today.html` | Today Review | Today: the marquee, the session card, the strip, the pause and the skip. |
| `03-train.html` | Train Review | The training session: exercise cards, set rows, rest, hydration and completion. |
| `04-plan-targets.html` | Plan And Targets Review | The plan blocks and week scrubber, and the seven daily target figures. |
| `05-log-atlas.html` | Log And Atlas Review | The charts and records, and the specimen collection. |
| `06-settings.html` | Settings Review | The five settings rows, the data controls and the install guide. |
| `07-popups-toasts.html` | Popups And Toasts Review | Every modal the app can raise, and the five toasts. |

The favicon is the one place a pictograph appears in this work. The Artifact tool requires one on a
first publish and accepts nothing but emoji, so the no-emoji rule cannot be met there. Use the same
single magnifying-glass character on all eight, so the eight tabs read as one set, and never pass
`favicon` again on a redeploy.

- [ ] **Step 3: Record the URLs**

Write each returned URL into `docs/feedback/pages/urls.json` under its page id, and replace each
`not yet` in the index table with the URL.

- [ ] **Step 4: Regenerate and republish**

```bash
node scripts/alpha-pages.mjs
grep -c 'href="#"' docs/feedback/pages/*.html
```

Expected: `1` on page 0, `1` on page 7, `0` on the six in between.

Then republish each page with the same `file_path` as before and no `favicon`. The same path
redeploys to the same URL, so the links the owner already has keep working.

- [ ] **Step 5: Watch for comments**

A publish arms the live-update subscription. Confirm the publish result's status line says the
watch connected. If it did not, call the Artifact tool's `watch` action on each page URL, so a
comment the owner sends to Claude wakes this session.

- [ ] **Step 6: Commit**

```bash
git add docs/feedback/pages/
git commit -m "docs(P10): publish the eight review pages and record their URLs"
```

- [ ] **Step 7: Hand it over**

Send the owner one message: the eight links in order, the sentence that the skin is limelight by
default and the live app is at `https://vkotzamanis.github.io/FixThisInjustice/`, and the
instruction to start at page 0. Then stop. Nothing after this task runs before the owner has
walked at least one page.

---

## Task 9: The round document

**Files:**
- Create: `docs/feedback/2026-09-XX-round-1.md`, where `XX` is the day the comments arrive. The
  executor writes the real date and uses it consistently in every later reference.

**Check, stated first:** every comment the owner sent appears in the table exactly once, quoted
verbatim, with a part id that exists in `docs/feedback/catalogue.json`, and the personal-data gate
passes on the file before it is committed.

### The rules this document obeys

1. **Quote the owner verbatim.** Never paraphrase, never tidy the grammar, never soften a word.
   The comment column holds what was written. An interpretation belongs in the triage column,
   marked as one.
2. **A comment that spans parts is split by id.** One row per part, each carrying the whole
   sentence, with the split noted in the triage column. Never invent a shorter quote.
3. **A comment that contradicts a recorded decision is answered, not applied.** Name the decision's
   slug, state what it decided, and ask. `alpha-focus-limelight`, `alpha-feedback-part-ids` and
   `alpha-feedback-review-pages` are this plan's; the copy contract's R1 to R13 and the four skin
   rules are the tree's.
4. **Questions are batched.** One message per round, at the end of the triage pass, numbered, each
   naming its part id. Never a question per comment.
5. **A part id that does not exist is a defect in the catalogue**, not in the comment. Add the part
   in `scripts/alpha-parts.mjs`, regenerate, and then file the comment against the new id.

### Triage values

| Value | Meaning |
| --- | --- |
| `accept` | It becomes a task. The task number goes in the last column. |
| `question` | It needs one answer before it can become a task. It joins the batch. |
| `reject: <rule>` | It cannot be done as asked. The rule is named, always. |

The rejection grounds, each with what it protects:

| Rule | It would |
| --- | --- |
| `skin-facts` | change a number, a unit symbol, a `{slot}` or a quantity name in an override. Skin rule 1, contract R11 and R12. |
| `skin-data-control` | put a joke on a control whose misreading costs data: the wipe, the import, the legacy delete, the export, a set delete, the reminder states, the install steps. Skin rule 4. |
| `skin-return-promise` | promise a return on a control that closes for good. Contract R13: Dismiss writes `missHandled` for that week and the screen does not come back. |
| `skin-control-meaning` | rename an abort into a commit or the reverse. The aborts are `button.cancel` and `button.dismiss`; the commits are `button.confirmSkip`, `button.confirmStart` and `button.wipeConfirm`. |
| `copy-R<n>` | break a numbered copy contract rule: a button over three words, a hero over eight, an advice line over twelve, a banner over two sentences, an em dash, an emoji, an exclamation mark, inline arithmetic. |
| `clinical-register` | put register into the clinical default. Decision `alpha-focus-limelight`: the default changes for verbosity or accuracy only. |

A rejection is never the end of the exchange. Every rejected row also gets a sentence saying what
CAN be done at that part instead, and the owner decides.

- [ ] **Step 1: Collect the comments from all three channels**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
```

The box channel arrives as a pasted block of `- [<part id>] <comment>` lines. Save
it unchanged to the scratchpad first, so the verbatim text survives any later edit:

```bash
mkdir -p /tmp/claude-1000/-home-vx-Desktop-Claude-FixThisInjustice/82c42a41-e7b7-4aa1-96c9-b3e32530295c/scratchpad
# paste the block into this file, unedited
$EDITOR /tmp/claude-1000/-home-vx-Desktop-Claude-FixThisInjustice/82c42a41-e7b7-4aa1-96c9-b3e32530295c/scratchpad/alpha-round-1-raw.txt
```

The thread channel is read with the Artifact tool's `comments` action, once per published page URL.
Copy each comment's text verbatim. A thread the owner has sent to Claude can be answered in the
thread; a thread that is not sent to Claude is read only, and the round document records that its
answer went to the session instead.

The session channel is already in the transcript.

- [ ] **Step 2: Write the document**

```markdown
# Alpha round 1

Date: 2026-09-XX. Catalogue: `docs/feedback/catalogue.json`, built from `<short hash>`, 102 parts.
Pages: `docs/feedback/pages/README.md`.

Every comment below is the owner's own text. Nothing is paraphrased. Where one comment covered two
parts it appears once per part, with the split noted.

## The comments

| Part id | Comment, verbatim | Channel | Triage | Task |
| --- | --- | --- | --- | --- |
| `today.strip` | the day glyphs are too small to tap | box | accept | 11 |

## Questions, batched

1. `today.strip`: ...

## Rejected, and what is on offer instead

| Part id | Rule | What can be done instead |
| --- | --- | --- |

## Counts

- Comments received: 0
- Accepted: 0
- Questions: 0
- Rejected: 0
- Parts commented on, out of 102: 0
```

The single example row is a shape, not data. Delete it when the real rows go in.

- [ ] **Step 3: Check every part id against the catalogue**

```bash
grep -oE '^\| `[a-z0-9.-]+`' docs/feedback/2026-09-XX-round-1.md | tr -d '| `' | sort -u > /tmp/round1-ids.txt
node -e "const c=require('./docs/feedback/catalogue.json');console.log(c.parts.map(p=>p.id).concat(['00-how-to-test.general','01-boot-setup-readiness.general','02-today.general','03-train.general','04-plan-targets.general','05-log-atlas.general','06-settings.general','07-popups-toasts.general']).sort().join('\n'))" | sort -u > /tmp/known-ids.txt
comm -23 /tmp/round1-ids.txt /tmp/known-ids.txt
```

Expected: no output. A line here is a part id the catalogue does not have, and rule 5 above says
what to do about it.

- [ ] **Step 4: Run the personal-data gate before committing**

`docs/feedback/` is NOT one of the four exempt paths in `.github/workflows/ci.yml`, so a verbatim
quote naming one of the four terms fails CI.

```bash
git add -N docs/feedback/2026-09-XX-round-1.md
git grep -nEi '\b(vyvans[e]|lisdexamfetamin[e]|ymc[a]|amphetamin[e])\b' -- docs/feedback/ && echo "FAIL redact before committing" || echo "PASS"
```

Expected: `PASS`. If it fails, replace the term with `[redacted]` in the quote, and add a line
under the table saying which row was redacted and why. Do not widen the CI exemption: the exemption
list names four paths that argue about the terms, and a feedback log is not one of them.

- [ ] **Step 5: Commit**

```bash
git add docs/feedback/2026-09-XX-round-1.md
git commit -m "docs(P10): alpha round 1, the owner's comments verbatim against part ids"
```

---

## Task 10: Triage

**Files:**
- Modify: `docs/feedback/2026-09-XX-round-1.md`

**Check, stated first:** every row carries a triage value, every `accept` row names a task number
and a template, every `reject` row names a rule from the table in Task 9 and an alternative, and
the counts at the foot of the document add up to the number of rows.

- [ ] **Step 1: Classify each row by the change it needs**

| The comment is about | Template | Task |
| --- | --- | --- |
| a Limelight word, phrase or register | Limelight wording | 11 |
| a string the Limelight app shows from the default table, too long or untrue | default wording | 12 |
| size, spacing, order, contrast, a target that is hard to tap | layout | 13 |
| what a control does, when something appears, a number that is wrong | behaviour | 14 |
| a string the app does not have yet | new string | 15 |

A comment that is about two of these is two rows, one per part, or two tasks against one part.
Never one task that does both, because the gates differ.

- [ ] **Step 2: Check each accepted row against the rules before it becomes a task**

For a Limelight wording change, check the key's `limelightRowPermitted` in the catalogue:

```bash
node -e "
const c=require('./docs/feedback/catalogue.json');
const key=process.argv[1];
for(const p of c.parts)for(const k of p.keys)if(k.key===key)console.log(p.id,k.limelightRowPermitted?'allowed':'REFUSED: '+k.refusalGroup);
" 'button.wipeAll'
```

Expected for that key: `REFUSED: RULE 4, a control whose misreading costs data`. A refused key
makes the row `reject: skin-data-control`.

- [ ] **Step 3: Write the batched questions**

One numbered list, each item naming its part id, stating what is unclear in one sentence, and
offering the two answers the executor can act on. A question with no offered answers comes back as
another question.

Where a comment contradicts a decision, the question names the slug and quotes what the decision
decided, so the owner is overruling something specific rather than guessing.

- [ ] **Step 4: Fill the counts, and check them**

```bash
grep -c '^| `' docs/feedback/2026-09-XX-round-1.md
grep -c '| accept |' docs/feedback/2026-09-XX-round-1.md
grep -c '| question |' docs/feedback/2026-09-XX-round-1.md
grep -c '| reject' docs/feedback/2026-09-XX-round-1.md
```

Expected: the first number equals the sum of the other three, and the four numbers match the Counts
section at the foot of the document.

- [ ] **Step 5: Commit, then send the questions**

```bash
git add docs/feedback/2026-09-XX-round-1.md
git commit -m "docs(P10): triage round 1, with the rule named on every rejection"
```

Send the batch as one message. Then stop until the answers arrive: a task built on a guessed answer
costs more than the wait.

---

## The five implementation templates

Tasks 11 to 15 are templates, not single tasks. Each accepted row in the round document becomes one
instance of the template its triage names, dispatched to one implementer subagent, checked by one
independent reviewer, and closed by one fix agent when the review finds something. Run them in the
order the round document lists, so a wording change does not land on a component another instance
is moving.

Every instance carries the same three obligations. The check is stated before the work. Every claim
carries the command that proves it. The commit names explicit pathspecs and never uses `--amend`.

Where two instances touch one file, build that file's blob from `HEAD` immediately before
committing, and check the diff:

```bash
git diff HEAD~1 HEAD -- src/content/copy.limelight.ts
```

Expected: only the rows this instance changed. A deletion nobody intended is incident 2 repeating.

---

## Task 11 (template): A Limelight wording change

Use when the triage says a Limelight word, phrase or register is wrong.

**Files:**
- Modify: `src/content/copy.limelight.ts`
- Modify: `docs/design/2026-09-02-limelight-side-by-side.md` (regenerated, never hand-edited)

**Check, stated first:** the changed row keeps every `{slot}` and every literal digit its clinical
default carries, keeps the unit symbols verbatim, stays lower case unless it is one of the three
shouted keys, and the contract suite passes with 59 tests.

- [ ] **Step 1: Confirm the key may take a row at all**

```bash
node -e "
const c=require('./docs/feedback/catalogue.json');
const key='<the key>';
for(const p of c.parts)for(const k of p.keys)if(k.key===key)console.log(p.id,k.limelightRowPermitted?'allowed':'REFUSED: '+k.refusalGroup);
"
```

Expected: `<part id> allowed`. A `REFUSED` line ends the instance: it was mis-triaged and goes back
to Task 10 as `reject: skin-data-control` or whichever group the line names.

- [ ] **Step 2: Read the default and the current override**

```bash
grep -n "'<the key>':" src/content/copy.ts src/content/copy.limelight.ts
```

Expected: one line from each file, or one from `copy.ts` alone when the row is new. Copy the
`{slot}` names and any digit out of the default line. They are not retyped from memory.

- [ ] **Step 3: Edit the row, and write the reason above it**

Every row in `src/content/copy.limelight.ts` carries a comment saying why the words changed, in the
voice the file already uses. Add or update it in the same edit. A row with no reason is a row the
next reviewer deletes.

```typescript
  // Round 1, <part id>: the owner asked for <the owner's words, quoted>. The SLOTS and the
  // quantity name are the default's and survive; only the verdict is this skin's.
  'status.weekDeltaNegative': '{completed} of {target}. <the new words>',
```

- [ ] **Step 4: Run the contract suite**

```bash
npx vitest run src/content/copy.test.ts
```

Expected: `Test Files  1 passed (1)` and `Tests  59 passed (59)`. The suite is the gate: it decides
slot parity, digit parity, unit-symbol parity, the shouted-key list, the word caps, the em dash,
the emoji scan and the abort-versus-commit rule.

A failure names the rule. Do not weaken the assertion. Change the string.

- [ ] **Step 5: Run the skin-facing suites the row touches**

```bash
npx vitest run src/content/ src/skins/
```

Expected: all passing. `src/ui/settings/SkinSettings.test.tsx`,
`src/ui/components/ReminderSettingsPanel.test.tsx` and
`src/ui/views/train/BodyMassQuickLog.test.tsx` assert fall-through by key, so a row added where one
of them expects the clinical string fails there rather than here.

- [ ] **Step 6: Regenerate the side-by-side page and the catalogue**

```bash
node scripts/limelight-side-by-side.mjs > docs/design/2026-09-02-limelight-side-by-side.md
node scripts/alpha-catalogue.mjs
node scripts/copy-wordcount.mjs 2>/dev/null | grep -A1 '^== LIMELIGHT_COPY' | tail -1
```

Expected: the catalogue reports 102 parts, and the word count line shows the family the row belongs
to. Record the before and after word counts in the commit message when the change moves them.

- [ ] **Step 7: Commit**

```bash
git add src/content/copy.limelight.ts docs/design/2026-09-02-limelight-side-by-side.md docs/feedback/catalogue.json docs/feedback/catalogue.md
git commit -m "feat(P10): <part id>, the limelight row the owner asked for"
```

---

## Task 12 (template): A default-table wording change

Use only when the triage says a string the Limelight app shows from the default table is too long
or states something untrue. Never for register: decision `alpha-focus-limelight` keeps the default
plain, and decision `alpha-review-limelight-only` leaves the other skins to a later adaptation pass.

**Files:**
- Modify: `src/content/copy.ts`
- Modify: `src/content/copy.test.ts`, when an assertion quotes the string
- Modify: `docs/design/2026-09-02-limelight-side-by-side.md` (regenerated)

**Check, stated first:** the new string obeys R1 to R13, the assertions that quote it are updated
in the same commit, the word count for its family drops or its accuracy claim is stated, and the
full suite passes.

- [ ] **Step 1: Measure the family before the edit**

```bash
node scripts/copy-wordcount.mjs 2>/dev/null | sed -n '/^== DEFAULT_COPY/,/^TOTAL/p'
```

Write the family's line down. Verbosity is a number, and a claim to have reduced it needs a before.

- [ ] **Step 2: Find every place that quotes the string**

```bash
git grep -nF "<the exact current string>" -- src
```

Expected: the definition in `src/content/copy.ts`, plus any test that pins it. Every hit is edited
in the same commit, because the suite pins the FORMAT frames to their clinical literals byte for
byte.

- [ ] **Step 3: Edit the string**

Apply the thirteen rules by number. Buttons at most 3 words. Heroes at most 8. Advice at most 12.
Banners at most 2 sentences. No em dash. No emoji. No exclamation mark. No hedging. Arithmetic
behind `why?`. Defined quantity names, never a colloquial stand-in.

- [ ] **Step 4: Run the harness and the suite**

```bash
node scripts/copy-wordcount.mjs 2>/dev/null | sed -n '/^== DEFAULT_COPY/,/^TOTAL/p'
npx vitest run src/content/copy.test.ts
node scripts/check-no-emoji.mjs
```

Expected: the family's word count is lower than Step 1's, or the commit message states why an
accuracy fix made it longer; then `Tests  59 passed (59)`; then the emoji gate's pass line.

- [ ] **Step 5: Run the whole suite, because the default is what every test reads**

```bash
npm test
```

Expected: 114 test files, 2,319 tests or more, all passing, in about 3 min 25 s. A test that quoted
the old string fails here and is updated in this commit.

- [ ] **Step 6: Regenerate and commit**

```bash
node scripts/limelight-side-by-side.mjs > docs/design/2026-09-02-limelight-side-by-side.md
node scripts/alpha-catalogue.mjs
git add src/content/copy.ts src/content/copy.test.ts docs/design/2026-09-02-limelight-side-by-side.md docs/feedback/catalogue.json docs/feedback/catalogue.md
git commit -m "fix(P10): <part id>, the clinical line says less and says it accurately"
```

---

## Task 13 (template): A layout change

Use when the comment is about size, spacing, order, contrast or a target that is hard to tap. The
change lands in the component or its stylesheet, so both skins move.

**Files:**
- Modify: the component named by the part's `components` in `docs/feedback/catalogue.json`
- Modify: its stylesheet under `src/ui/`
- Modify: the component's `.test.tsx`
- Modify: `docs/phone-visual-check.md`, one row per change

**Check, stated first:** a jsdom test asserts the structural half of the change, a row in
`docs/phone-visual-check.md` states what the owner should see on the phone and what would be wrong,
and the change is in the shared component rather than under a skin selector unless the comment was
about the skin's own tokens.

**jsdom renders no geometry.** It cannot measure a tap target, a font size or an overflow. Say so
in the task's note. What a test CAN assert: that an element exists, that it carries the class the
stylesheet targets, that the order of children changed, that an accessible name is present, and
that a rule with a given selector is in the injected stylesheet text. Everything else is the
owner's own pass.

- [ ] **Step 1: Name the file from the catalogue, not from memory**

```bash
node -e "
const c=require('./docs/feedback/catalogue.json');
const p=c.parts.find(x=>x.id==='<part id>');
console.log(p.components.join('\n'));
console.log('states:',p.states.join(', '));
"
```

- [ ] **Step 2: Write the failing test**

```typescript
it('puts the fourteen day glyphs in one list with an accessible name each', () => {
  render(<TodayView />);
  const days = screen.getAllByRole('listitem');
  expect(days).toHaveLength(14);
  for (const day of days) {
    expect(day.getAttribute('aria-label')).not.toBeNull();
  }
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npx vitest run src/ui/views/TodayView.test.tsx -t 'fourteen day glyphs'
```

Expected: FAIL, naming the assertion that did not hold. A test that passes before the change is not
testing the change.

- [ ] **Step 4: Make the change in the component and the stylesheet**

If the stylesheet change is under `:root[data-skin='limelight']`, it moves one skin. If it is under
a plain class selector, it moves all three. The comment decides which, and the task note says which
was chosen and why.

Where the change touches a colour, quote the measured ratio from the comment block above
`:root[data-skin='limelight']` in `src/ui/styles/tokens.css`. Do not invent a colour: that block
records a ratio for five pairs and for no others.

- [ ] **Step 5: Run the test, then the component's whole suite**

```bash
npx vitest run src/ui/views/TodayView.test.tsx
npx eslint src/ui/views/TodayView.tsx
npx tsc -b
```

Expected: all passing, no lint output, no typecheck output.

- [ ] **Step 6: Add the row to the phone checklist**

```markdown
| Fourteen-day strip | Today, the day strip | `src/ui/views/TodayView.tsx`, styled by `src/ui/views/views.css` | a glyph under 44 px, or two states that look the same |
```

The table's four columns are What, Where to look, What renders it, and What would be wrong. That
last column is the point: a row with no failure condition cannot be walked.

- [ ] **Step 7: Commit**

```bash
git add src/ui/views/TodayView.tsx src/ui/views/views.css src/ui/views/TodayView.test.tsx docs/phone-visual-check.md
git commit -m "feat(P10): <part id>, <what changed>, on both skins"
```

---

## Task 14 (template): A behaviour change

Use when the comment is about what a control does, when something appears, or a number that is
wrong. This is the template with the most ways to lose data, so it carries the most gates.

**Files:**
- Modify: a module under `src/domain/` or `src/store/`
- Modify: its `.test.ts`
- Modify: the component that calls it, and its test, when the call site changes
- Modify: this plan, when the change alters a rule, with a decision header

**Check, stated first:** the wrong behaviour is reproduced in a failing test first, the fix makes
that test pass, the full suite passes, `npm run test:tz` passes in all four zones, and no number
the user reads changed unless the comment asked for exactly that change.

- [ ] **Step 1: Reproduce it in a test before changing anything**

```bash
npx vitest run src/domain/<area>/<module>.test.ts -t '<the new test name>'
```

Expected: FAIL, with the actual value printed beside the expected one. A behaviour change with no
reproduction is a guess. If the behaviour cannot be reproduced in a test, the comment goes back to
the owner as a question, not into the code.

- [ ] **Step 2: State the units and the sign convention in the test**

Every physical quantity in this tree carries its unit in a comment: `[ms] epoch, UTC`, `[kg]`,
`[mL]`, `[d]`. A new constant or field gets the same treatment in the same commit. A sign error
that nobody wrote down cannot be caught in review.

- [ ] **Step 3: Make the change in the domain, not in the component**

`src/domain/` holds pure logic with no React and no input or output. `src/store/` holds the
Zustand store, and `src/store/persistence.ts` is the only module allowed to touch web storage. A
behaviour fix in a component is a fix in the wrong layer and the reviewer rejects it.

- [ ] **Step 4: Run the module, then the suite, then the zones**

```bash
npx vitest run src/domain/<area>/
npm test
npm run test:tz
```

Expected: all passing. `test:tz` runs the suite four times, in `UTC`, `Europe/Athens`,
`America/New_York` and `America/Los_Angeles`. Budget about 15 minutes and check it against the
20-minute cap before starting; run it as the last command of the instance.

- [ ] **Step 5: Record the decision if the change alters a rule**

Append a section to this plan, with a one-line decision header immediately above the heading, in
the form `<!-- decision: SLUG | status: adopted | supersedes: none -->` where `SLUG` is a
hyphen-lower-case name. Write it as a real HTML comment on its own line; it is quoted inline here
so that graphify does not index this template as a decision of its own.

State the rule, the reason, and at least one rejected alternative with the reason it lost. A
decision with no rejected alternative is a preference. Then run `graphify . --update` before
treating the graph as current.

- [ ] **Step 6: Commit**

```bash
git add src/domain/<area>/<module>.ts src/domain/<area>/<module>.test.ts
git commit -m "fix(P10): <part id>, <the behaviour>, reproduced then fixed"
```

---

## Task 15 (template): A new string

Use when the owner asks for something the app does not say yet.

**Files:**
- Modify: `src/content/copy.ts` (the `CopyKey` union and the `DEFAULT_COPY` table)
- Modify: `src/content/copy.limelight.ts`, when the string earns a Limelight row
- Modify: the component that renders it, and its test
- Modify: `docs/design/2026-09-02-limelight-side-by-side.md` (regenerated)

**Check, stated first:** the key is appended at the end of its family in both the union and the
table, the clinical string obeys R1 to R13, the component renders it through `useCopy()` and never
as a literal, and the contract suite's call-site gate finds the key.

- [ ] **Step 1: Choose the key name under R11**

The name states the defined quantity, never a colloquial stand-in. The family prefix is one of
`advice`, `banner`, `button`, `coach`, `disclosure`, `error`, `hero`, `label`, `nav`,
`notification`, `option`, `quantity`, `readiness`, `setup`, `shell`, `status`, `step`, `unit`,
`weekday`, `why`. The family decides the word cap, so it decides the string.

```bash
grep -n "'<family>\." src/content/copy.ts | tail -3
```

Expected: the last three keys of that family, which is where the new one goes.

- [ ] **Step 2: Append to the union and to the table, at the end of the family**

```typescript
  | 'status.<newKey>'
```

```typescript
  'status.<newKey>': '<the clinical sentence>',
```

Appending rather than inserting keeps every diff small and keeps the union readable. Nothing in the
tree depends on key order.

- [ ] **Step 3: Render it through the hook**

```typescript
const t = useCopy();
// ...
<p className="view-note">{t('status.<newKey>')}</p>
```

Never a literal. `src/content/copy.test.ts` carries a call-site gate that finds every key, and a
key with no call site fails it.

- [ ] **Step 4: Add the Limelight row, if the string earns one**

It earns one when the WORDS change. Case alone earns nothing: the head of
`src/content/copy.limelight.ts` says why, and a cloned string in two files rots the second. It
earns nothing at all when the string fronts a control whose misreading costs data.

- [ ] **Step 5: Run the gates**

```bash
npx vitest run src/content/copy.test.ts
node scripts/check-no-emoji.mjs
npx tsc -b
npm test
```

Expected: `Tests  59 passed (59)`, the emoji gate's pass line, no typecheck output, and the full
suite green with one more test than before.

- [ ] **Step 6: Regenerate everything that lists keys**

```bash
node scripts/limelight-side-by-side.mjs > docs/design/2026-09-02-limelight-side-by-side.md
node scripts/alpha-catalogue.mjs
node scripts/alpha-catalogue.mjs --check
```

Expected: the catalogue reports 102 parts and `PASS alpha catalogue`. A new key that no part claims
lands in `<screen>.unassigned` and fails the check, which is the reminder to put it in a part.

- [ ] **Step 7: Commit**

```bash
git add src/content/copy.ts src/content/copy.limelight.ts src/ui/<the component> src/ui/<the component>.test.tsx docs/design/2026-09-02-limelight-side-by-side.md docs/feedback/catalogue.json docs/feedback/catalogue.md
git commit -m "feat(P10): <part id>, the line the owner asked for"
```

---

## Task 16: Close round 1

**Files:**
- Modify: `docs/feedback/catalogue.json`, `docs/feedback/catalogue.md`,
  `docs/feedback/pages/*.html`, `docs/feedback/2026-09-XX-round-1.md`
- Modify: `docs/HANDOFF-2026-09-02.md`, append-only
- Modify: `graphify-out/`

**Check, stated first:** the catalogue and the pages are regenerated from the tree as it now
stands, every published page is republished from its own file path, the round document carries a
"what was not done" section, the handoff's open-item table has gained one row per unfinished item
and lost none, and `graphify query` reaches this plan's three decisions.

- [ ] **Step 1: Regenerate from the tree as it now stands**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
node scripts/alpha-catalogue.mjs
node scripts/alpha-catalogue.mjs --check
node scripts/alpha-pages.mjs
npx vitest run src/content/alphaCatalogue.test.ts
```

Expected: the summary line, `PASS alpha catalogue`, `pages 8 sections 102 round 1`, and
`Tests  7 passed (7)`. A different part count means round 1 added or removed a part, and the count
in `src/content/alphaCatalogue.test.ts`, in `docs/feedback/pages/README.md` and in this plan's
Self-review all move together.

- [ ] **Step 2: Republish every page**

Load `artifact-design` first. Then publish each of the eight pages with the same `file_path` as
Task 8 used and no `favicon`, so each redeploys to the URL the owner already holds. Confirm each
result reports the same URL as `docs/feedback/pages/urls.json` records.

- [ ] **Step 3: Run the full gate**

```bash
npm test
npx eslint .
npx tsc -b
npx vite build
bash scripts/check-dist-csp.sh dist/index.html
node scripts/check-no-emoji.mjs
git grep -nEi '\b(vyvans[e]|lisdexamfetamin[e]|ymc[a]|amphetamin[e])\b' -- . ':!docs/review/' ':!docs/plans/' ':!REFERENCES.md' ':!graphify-out/' && echo "FAIL personal data" || echo "PASS personal data"
```

Expected: the suite green, no lint output, no typecheck output, a clean build, the CSP script's
pass line, the emoji gate's pass line, and `PASS personal data`.

- [ ] **Step 4: Write "what was not done"**

Append to `docs/feedback/2026-09-XX-round-1.md`:

```markdown
## What was not done in round 1

| Item | Why | What resolves it |
| --- | --- | --- |
```

One row for each of: every comment triaged `question` that got no answer; every comment triaged
`reject` where the owner has not yet chosen an alternative; every part of the 102 that received no
comment, stated as a count rather than a list; every check that could not run on this machine; and
every layout change whose phone verdict is still owed.

Silence about an omission reads as completeness, and the omission is what survives.

- [ ] **Step 5: Update the handoff, append-only**

Add rows to the open-item table in section 5 of `docs/HANDOFF-2026-09-02.md`. Delete nothing: a row
that round 1 closed gets a new row saying so, with the commit that closed it. Build the file's blob
from `HEAD` immediately before committing, because it is a shared file.

```bash
git show HEAD:docs/HANDOFF-2026-09-02.md | diff - docs/HANDOFF-2026-09-02.md | head -40
```

Expected: only added lines, marked `>`. A `<` line is a deletion and must be restored.

- [ ] **Step 6: Refresh the graph, under the cap**

```bash
timeout 1200 graphify . --update
graphify query "why does language feedback edit only the limelight table"
```

Expected: the update finishes inside the timeout, and the query names `alpha-focus-limelight`.

`graphify query`, `explain` and `path` print only label, source, file type and community. They do
not surface `status`, `supersedes` or `rationale`, even though those are stored. So read the graph
file itself before answering any question about a decision:

```bash
grep -o 'alpha-feedback-review-pages\|alpha-feedback-part-ids\|alpha-focus-limelight' graphify-out/graph.json | sort | uniq -c
```

Expected: three lines, one per slug, each with a count of at least 1. A slug with no line means the
graph did not pick up this plan's decision headers, and `graphify . --update` has to run again
after the plan is committed.

- [ ] **Step 7: Commit**

```bash
git add docs/feedback/ docs/HANDOFF-2026-09-02.md graphify-out/
git commit -m "docs(P10): close alpha round 1, and say what it did not do"
```

- [ ] **Step 8: Ask for round 2**

Send the owner one message: what changed, with the part ids; what was rejected and what is on offer
instead; what is still waiting on an answer; and the eight page links again, unchanged, ready for
the next pass. Then run `node scripts/alpha-pages.mjs --round 2` when the owner starts it, which
gives round 2 its own storage keys and leaves round 1's boxes intact in the browser.

Push nothing. The coordinator pushes.

---

## Self-review

Run before the plan is handed to an implementer, and again at Task 16.

**1. Spec coverage.** Each sentence of the owner's paragraph, and the task that serves it:

| The owner asked for | Task |
| --- | --- |
| review each step and page | 4 to 8, one page per screen group in app order |
| leave comments on each section | 4, a box per part; 8, comment threads |
| function as an alpha tester | 5, page 0 is the procedure |
| catalogue feedback on each possible part | 1 to 3, 102 parts with stable ids and a gate |
| use an agentic approach to implement | 11 to 15, one template per feedback kind |
| focus on the gay and brat theme | decision `alpha-focus-limelight`, and Limelight first in every string block |
| the minimal theme is the same, any interesting language | Task 12, the default table changes for verbosity or accuracy only |
| you don't have to publish all different designs; the feedback will be on the gay/brat design | decision `alpha-review-limelight-only`; Task 4 shows one string per key and no skin chip; Task 5 says so on page 0 |

**2. Placeholder scan.** The plan carries no "TBD", no "handle edge cases", no "similar to Task N".
Three things are deliberately left for the executor to measure rather than to invent: the date in
`docs/feedback/2026-09-XX-round-1.md`, the `keys` arrays for the seven screens whose parts share a
file (Task 2 Step 3 gives the command, the printed shape and the three assignment rules), and the
owner's own comments. Each is a measurement with a stated method, not a gap.

**3. Consistency.** Checked across every task:

- Script names: `scripts/alpha-catalogue.mjs`, `scripts/alpha-parts.mjs`, `scripts/alpha-pages.mjs`.
  No other name appears.
- Generated paths: `docs/feedback/catalogue.json`, `docs/feedback/catalogue.md`,
  `docs/feedback/pages/00-how-to-test.html` through `07-popups-toasts.html`,
  `docs/feedback/pages/urls.json`, `docs/feedback/pages/README.md`,
  `docs/feedback/2026-09-XX-round-1.md`, `src/content/alphaCatalogue.test.ts`.
- Part count: 102, stated in Task 2, asserted in Task 3, counted in Tasks 4, 7 and 16.
- Screen ids: the same fourteen in `SCREEN_FILES`, in `scripts/alpha-parts.mjs`, in the `PAGES`
  array and in the test's `SCREENS` constant.
- Function names: `loadCopy`, `keysIn`, `keyLinesIn`, `readConstArray`, `readUnion`,
  `readSettingsRowIds`, `readLimelightRefusals`, `probe`, `buildCatalogue`, `toMarkdown`,
  `keyRecord`, `stringBlock`, `partSection`, `pageScript`, `page`.
- Storage keys: `fti-alpha-r<round>-<page id>`, one per page per round.

**4. What the executor must report on completion.**

- The measured part count from `node scripts/alpha-catalogue.mjs --count`, and whether it is 102.
- The eight published Artifact URLs.
- The number of comments received, accepted, questioned and rejected.
- Every check that failed, with its output.
- What was not done, which Task 16 Step 4 writes into the round document.
