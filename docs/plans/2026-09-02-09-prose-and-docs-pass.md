# P9 Prose and Documentation Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task that writes
> prose also requires `writing-clearly-and-concisely`.

## Governing intent (the user's own words)

These five sentences decide every judgement call in this plan. Where a rule below and a sentence
here disagree, the sentence here wins and the rule gets amended in the same commit.

1. "use a subagent to reduce the verbosity of the app overall (except the tabs/details where
   verbosity is needed such as exercise explanation and tips and tricks). I want us to also remove
   AI mannerisms such as the em-dashes"
2. "The user does not need to know the math behind the app unless it's vital for progression"
3. "Things I enjoyed immensely: 'hydrate or diedrate' and 'MOTHER' call out"
4. "Do not shy away from being vulgar, my friend group is literally an online stan twitter
   twinkfest"
5. "at the end we need to rewrite the text and improve the prose/remove some text"

Sentence 1 sets the target: fewer words everywhere except reference text. Sentence 2 is the test
for R9: arithmetic stays behind `why?` unless the user must act differently because of it.
Sentence 3 names three strings that are frozen. Sentence 4 licenses the limelight register but
never overrides the no-slurs rule in master plan section 3. Sentence 5 is this plan.

**Goal:** Cut the app's word count, retire the copy keys nothing renders, and bring the copy
contract, the eight plan documents and the five reference documents into line with what shipped.

**Architecture:** Three layers, in order. First the copy tables (`src/content/copy.ts`,
`copy.limelight.ts`, `copy.board.ts`), gated by `src/content/copy.test.ts`, which decides R1 to R6,
R8, R10 exemptions, slot parity, digit parity and the limelight shout list mechanically. Second the
call sites that still render hardcoded English twins of table keys. Third the documents, which
describe what the first two now contain. No task changes a number, a unit, a quantity name or the
meaning of a control.

**Tech Stack:** TypeScript 5.9, React 19, Vitest 4, Vite 8 (Node API used by the word-count
harness), Node 22.23.1, git, graphify.

## Global Constraints

Copied from `docs/plans/2026-09-01-00-master-plan.md` section 3 and from the two incidents this
repository has already had. Every task's requirements implicitly include this section.

- **Copy contract R1 to R11** (`docs/design/2026-09-01-copy-contract.md`) binds every string.
  Buttons at most 3 words, heroes at most 8, advice at most 12, banners at most 2 sentences, no
  em-dash or connector en-dash, no emoji, no hedging, no exclamation mark, arithmetic behind
  `why?`, R10 exemptions, defined quantity names. Word counts exclude numerals and unit tokens.
- **A skin changes words, never facts.** Every `{slot}` the default carries is carried by every
  override row, and a literal digit appears in an override only where the default has the same
  digit. `src/content/copy.test.ts` decides both.
- **Never `git commit --amend` in this tree.** Incident 2026-09-02: a `--amend` rewrote another
  agent's commit `ca5d972` into `0fa62cb` and cost that agent a re-commit.
- **Never `git add -A`.** Every commit names explicit pathspecs. Two read-only reviewers and other
  agents may hold edits in the same working tree.
- **Build a `src/content/copy.ts` blob from the HEAD at commit time**, immediately before the
  write, and verify `git diff HEAD~1 HEAD -- src/content/copy.ts` shows no deletion you did not
  intend. Incident 2: commit `f7ceb3a` committed a stale-parent blob that deleted the boot keys,
  restored in `9d42e8d`.
- **Commit messages:** `feat|fix|test|chore|docs: <summary>`.
- **No run on this machine may exceed 20 minutes.** Estimate first. The full suite takes about
  3 min 25 s; `graphify . --update` is the only task here that can approach the cap.
- **Prose rules for every document this plan writes:** active voice, sentences of at most 25 words,
  no em-dash or en-dash outside a numeric range, no emoji, no puffery, no promotional adjective.
  Quote every path and command from the tree rather than from memory.

---

## Residual ledger, verified against the tree on 2026-09-02

The coordinator's running list at
`/tmp/claude-1000/-home-vx-Desktop-Claude-FixThisInjustice/82c42a41-e7b7-4aa1-96c9-b3e32530295c/scratchpad/open-items.md`
carries 80 lines. Each candidate below was probed with `git grep` or `sed` before it earned a task.

### Verified open

| # | Item | Probe |
| --- | --- | --- |
| 1 | 48 default keys have no reference anywhere in `src` outside their own definition | key sweep, Task 16 |
| 2 | 22 of those 48 have a byte-identical hardcoded twin in `App.tsx`, `UpdatePrompt.tsx`, `RootErrorBoundary.tsx` | `grep -n` on the three files |
| 3 | Copy contract body still lists all 17 keys retired in `1500997`, twice each | `grep -c "'<key>'"` returns 2 per key |
| 4 | Copy contract lines 216, 218, 411, 413 still carry `button.play` and `button.muteThisWeek` | `grep -n "Mute this week"` |
| 5 | Copy contract line 59 names `worker/RUNBOOK.md`, which does not exist | `ls worker/RUNBOOK.md` fails |
| 6 | Copy contract lines 34 and 383 illustrate R6 with `Load PR`; the shipped line reads `load personal record` in limelight and `Load personal record` in the default | `grep -n "Load PR"` |
| 7 | Copy contract has no `advice.tapForSound` row; `copy.ts:1262` has one and two call sites render it | `grep -n advice.tapForSound` |
| 8 | Copy contract has no limelight or board column | no such heading in the file |
| 9 | `ICON_FOR_KEY` has 16 entries; only 4 have a `SkinLabel` call site | `git grep -n SkinLabel -- src` |
| 10 | `MotivationModal.tsx:52` still holds the literal `TAP_TO_MUTE_LABEL` | `grep -n TAP_TO_MUTE_LABEL` |
| 11 | `assets.ts:108` throws `Not a video file: .` when `file.type` is empty | `sed -n '108p'` |
| 12 | `App.tsx` and `RootErrorBoundary.tsx` download `fixthisinjustice-*.json`; `ExportView.tsx:94` and `DataSection.tsx:178` use `fti-state-<stamp>.json` | `git grep -n "fixthisinjustice-"` |
| 13 | `src/domain/migrations/index.ts:49` carries two em-dashes in a JSDoc comment | `git grep -nP "[\x{2013}\x{2014}]"` |
| 14 | Master plan section 3 states no rule against user-agent sniffing; the rule lives only in section 10's P5 item 5 correction and in code comments | `grep -n "user-agent" master plan` |
| 15 | Master plan section 5 `UiPrefs` omits `milestoneFloorByProfile` and `hotkeys`, and says `skin default "clinical"`; `types.ts:111` has both fields and `schema.ts:511` defaults `skin` to `limelight` | line comparison |
| 16 | Master plan section 6.5 omits `ProgressionAdvice.why`, and `HydrationCue.message` is a `CopyKey`, not a `string` | `grep -n "interface ProgressionAdvice"` in `src/domain/training/progression.ts` |
| 17 | Master plan section 6.7 gives `attemptSpecimenDraw` a fourth `rng` parameter; `funActions.ts:104` takes three | `sed -n '104,109p' src/store/funActions.ts` |
| 18 | Master plan section 6.8 gives `pendingMotivation` two arguments; section 10.5 supersedes it with four | `sed -n '450p'` |
| 19 | Master plan section 4 file map lists `legacy/` and one file under `ui/motivation/`; P6 amendment 8 asked for six | `sed -n '196,205p'` |
| 20 | Master plan section 7 has no P9 row and no gate for the copy pass | section 7 table |
| 21 | Master plan section 10 has no P8 or P9 close-out entry | section 10 |
| 22 | `05-reminders.md:1883` states `REMINDER_API_BASE: string | null` and no scheme or host validation; `src/config/reminders.ts:39-63` validates both | line comparison |
| 23 | `05-reminders.md:4292` says the `env:` block goes on "that step"; master plan section 10 P5 item 11 puts it at job level | `sed -n '4292p'` |
| 24 | `06-motivation-video.md:811` states the modal never autoplays and has a `Play` button; decision 10.9 supersedes both | `sed -n '811p'` |
| 25 | `06-motivation-video.md` amendment 8 asks for six files under `ui/motivation/` in master plan section 4; the map still lists one | `sed -n '1905p'` |
| 26 | `07-...-cutover.md:1451` and `:2427` declare `MigrateV2Result` as `{ state, report }`; `v2.ts:111` ships a discriminated union | line comparison |
| 27 | `07-...-cutover.md:103` and `:2111` name `readLegacyV2`/`deleteLegacyData`; `persistence.ts` exports `readLegacyV2Raw`, `readLegacyBundle`, `hasLegacyV2`, `deleteLegacyV2` | `grep -n "export function"` |
| 28 | `07-...-cutover.md` Task 6 draft of `ConfirmDestructive` has no `titleKey`; the shipped props require one | `sed -n '8,30p' src/ui/components/ConfirmDestructive.tsx` |
| 29 | `07-...-cutover.md:4962` names `fti-state-before-wipe.json`; `DataSection.tsx:178` uses the stamped form | line comparison |
| 30 | `08-fun-mechanics.md:31`, `:833`, `:4834` write the personal-data grep unquoted, so it matches its own definition; `:8306` uses the bracketed form | `grep -n "git grep -nEi"` |
| 31 | `08-fun-mechanics.md:2053-2056` shows `attemptSpecimenDraw` calling `drawSpecimen` with `rng = systemRng`; `funActions.ts` uses `drawSpecimenForLoggedSet` and reaches no ambient randomness | line comparison |
| 32 | `08-fun-mechanics.md` amendment 2 keeps the `rng` parameter and amendment 5 says `skin` defaults to `clinical` | `sed -n '8477,8496p'` |
| 33 | `docs/RUNBOOK-reminders.md:349-356` says the status line carries "exactly one of seven strings" and omits `status.remindersNeedReenable`, which is the eighth | `grep -n "'status.reminders" src/content/copy.ts` returns 8 |
| 34 | `docs/RUNBOOK-reminders.md:417` quotes `Reminders are not configured in this build.`; the shipped string is `Reminders are not set up on this deployment.` | line comparison |
| 35 | `docs/RUNBOOK-reminders.md:363` gives a URL where `InstallGuide.tsx` renders `Open this page in Safari.` | line comparison |
| 36 | `docs/sfx.md:47` puts the sounds toggle "in the row headed the look", which is the limelight string for `label.settingsSkin`; the default string is `Skin` | `grep -n "'label.settingsSkin'"` |
| 37 | `docs/sfx.md:35-38` describes `session_done` firing on the last logged set and `pr_stamp` on a set that beats a record; `TrainView.tsx:284` fires `session_done` on session completion and `WeekStamp.tsx:79` fires `pr_stamp` when the week stamp appears | call-site comparison |
| 38 | `docs/review/2026-09-01-security-review.md:858` records the device-less panel as a residual; `ReminderSettingsPanel.tsx:44` maps `needs-reenable` and the copy key exists | line comparison |
| 39 | Security review H2 (`:164`) and M5 (`:470`) cite `console-app.jsx` and `console-store.jsx`, deleted in `1311f84`, with no note of where they are reachable | `git ls-files legacy` is empty |
| 40 | No monochrome badge icon exists; `src/sw.ts:75` points `badge` at `icons/icon-192.png` | `ls public/icons/` |
| 41 | Four untracked probe test files sit in the tree: `src/app/zzP7Probe.test.tsx`, `src/domain/export/zzP7Probe2.test.ts`, `src/ui/settings/zzP7Probe3.test.tsx`, `src/ui/components/zzP7Probe4.test.tsx` | `git status --short` |

### Closed by a later commit, and dropped from this plan

| Item | Closed by |
| --- | --- |
| `confirm.typeToConfirm` retired from the default table | `189a709` |
| `FORMAT.estimated1RM` duplicate resolved to one definition at `copy.ts:2146` | swept before `1c68398`; one definition today |
| `copy.ts` comment claiming "32 columns" corrected to 36 characters | `e65db6a` |
| `copy.ts` comment claiming the reload shows no name or size, corrected at `:1301` | `3784ee5` |
| `copy.ts` Atlas comment contradicting `atlas.css` uppercase, corrected at `:1340` | `e65db6a` |
| `copy.ts` comment citing R2 where R1 applies; no `R2` string remains in the file | `917ed1a` |
| Round-three plan section 4.3 contrast figures, now 11.12:1 and 5.04:1, measured 2026-09-02 | `954888d` |
| `docs/motivation-video.md` "not built" paragraphs | `1bfdcaa` |
| Security review I4 addendum recording the persisted `pushDevice.secret` | `7a64bec` |
| `status.remindersNeedReenable` added and wired into the panel | `02dee88` |
| `src/domain/reminders/zzprobe.test.ts` left by a reviewer | never tracked; absent from the tree |
| `src/domain/migrations/index.ts` en-dash | never present; the file carries em-dashes instead, which item 13 covers |
| SettingsView skin row above the data row | `0080f16` plus `f7ceb3a`; `skin` at line 64, `data` at line 77 |
| The three mandated limelight strings present and asserted | `1c68398`, asserted in `copy.test.ts:289-296` |

---

## File structure

Files this plan creates:

| Path | Responsibility |
| --- | --- |
| `scripts/copy-wordcount.mjs` | Prints keys and words per copy-key family for the three tables. The before-and-after check every copy task uses. |
| `docs/design/2026-09-02-limelight-side-by-side.md` | One page, default beside limelight, with an empty verdict column for the user to mark up. |

Files this plan modifies, grouped by the task that owns them:

| Path | Owner tasks |
| --- | --- |
| `src/content/copy.ts` | 2 to 11, 15, 16 |
| `src/content/copy.limelight.ts` | 12 |
| `src/content/copy.board.ts` | 14 |
| `src/content/copy.test.ts` | 12, 14, 16 |
| `src/app/App.tsx`, `src/app/UpdatePrompt.tsx`, `src/app/RootErrorBoundary.tsx` | 15 |
| `src/skins/limelight/Icon.tsx` | 17 |
| `src/ui/motivation/MotivationModal.tsx`, `src/domain/motivation/assets.ts` | 3 |
| `src/domain/migrations/index.ts` | 15 |
| `docs/design/2026-09-01-copy-contract.md` | 18 |
| `docs/plans/2026-09-01-00-master-plan.md` | 19, 30 |
| `docs/plans/2026-09-01-05-reminders.md` | 20 |
| `docs/plans/2026-09-01-06-motivation-video.md` | 21 |
| `docs/plans/2026-09-01-07-log-export-migration-cutover.md` | 22 |
| `docs/plans/2026-09-01-08-fun-mechanics.md` | 23 |
| `docs/RUNBOOK-reminders.md` | 24 |
| `docs/sfx.md` | 25 |
| `docs/review/2026-09-01-security-review.md` | 26 |
| `README.md`, `docs/motivation-video.md` | 27 |
| `graphify-out/` | 29 |

Baseline, measured on 2026-09-02 with the harness Task 1 builds:

| Table | Keys | Words |
| --- | --- | --- |
| `DEFAULT_COPY` | 522 | 2175 |
| `LIMELIGHT_COPY` | 105 | not scored; register, not length, is its constraint |
| `BOARD_COPY` | 29 | not scored |

Default table by family: `advice` 92 keys 693 words, `status` 92 keys 336, `why` 9 keys 221,
`label` 103 keys 220, `button` 71 keys 146, `readiness` 9 keys 98, `hero` 37 keys 90,
`disclosure` 6 keys 85, `option` 16 keys 50, `banner` 11 keys 49, `quantity` 21 keys 47,
`coach` 13 keys 47, `recovery` 6 keys 27, `error` 5 keys 22, `step` 9 keys 12, `nav` 8 keys 8,
`weekday` 7 keys 7, `shell` 2 keys 6, `push` 1 key 5, `toast` 1 key 2, `notification` 1 key 2,
`setup` 1 key 1, `unit` 1 key 1.

---

## Task 1: The word-count harness

Every copy task states its check as a before-and-after word count. Nothing in the repository
measures one today, so this task builds the instrument first. It uses Vite's Node API because
`vite` is the only local package that loads a `.ts` module with unextensioned relative imports.
`esbuild` is not installed (`ls node_modules/esbuild` fails), so an `npx esbuild` recipe would
reach the network and must not be used.

**Files:**
- Create: `scripts/copy-wordcount.mjs`

**Interfaces:**
- Consumes: `DEFAULT_COPY`, `LIMELIGHT_COPY`, `BOARD_COPY` from `src/content/copy.ts`.
- Produces: a command, `node scripts/copy-wordcount.mjs`, whose stdout is one line per family
  and a `TOTAL` line. Tasks 2 to 17 quote its output.

**Check, stated first:** run against the untouched tree the script must print
`TOTAL        keys= 522 words= 2175`. Any other total means the word-count rule has drifted from
`wordCount` in `src/content/copy.test.ts:46-52`, and the script is wrong, not the table.

- [ ] **Step 1: Write the script**

```js
// scripts/copy-wordcount.mjs
//
// Keys and words per copy-key family, for the before-and-after check the P9 prose pass states.
//
// The word rule is `wordCount` in src/content/copy.test.ts, reproduced here rather than imported
// because that file is a test module: numerals, `{slot}` names and the unit tokens the contract
// lists are not words. Keeping the two in step is a manual duty, and the TOTAL below is the
// tripwire: it was 2175 over 522 keys on 2026-09-02.
//
// Vite's Node API loads the module because `src/content/copy.ts` imports './copy.board' with no
// extension, which Node's own resolver rejects. esbuild is not installed in this repository.
import { createServer } from 'vite';

const UNIT_TOKENS = new Set([
  's', 'S', 'kg', 'lb', 'mL', 'g', 'kcal', 'MiB', 'cm', 'mm', 'ms', '%', '×',
]);

function wordCount(value) {
  return value
    .split(/\s+/)
    .map((token) => token.replace(/\{[a-zA-Z]+\}/g, '').replace(/[.,:;!?()"'’]/g, ''))
    .filter((bare) => bare !== '' && /\p{L}/u.test(bare) && !UNIT_TOKENS.has(bare)).length;
}

function report(name, table) {
  const words = {};
  const keys = {};
  for (const [key, value] of Object.entries(table)) {
    const family = key.split('.')[0];
    words[family] = (words[family] ?? 0) + wordCount(value);
    keys[family] = (keys[family] ?? 0) + 1;
  }
  let totalWords = 0;
  let totalKeys = 0;
  console.log(`== ${name}`);
  for (const family of Object.keys(words).sort()) {
    console.log(
      `${family.padEnd(12)} keys=${String(keys[family]).padStart(4)} words=${String(words[family]).padStart(5)}`,
    );
    totalWords += words[family];
    totalKeys += keys[family];
  }
  console.log(
    `TOTAL        keys=${String(totalKeys).padStart(4)} words=${String(totalWords).padStart(5)}`,
  );
}

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const copy = await server.ssrLoadModule('/src/content/copy.ts');
await server.close();

report('DEFAULT_COPY', copy.DEFAULT_COPY);
report('LIMELIGHT_COPY', copy.LIMELIGHT_COPY);
report('BOARD_COPY', copy.BOARD_COPY);
```

- [ ] **Step 2: Run it and confirm the baseline**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
node scripts/copy-wordcount.mjs 2>/dev/null | grep -A1 '^== DEFAULT_COPY' | head -2
node scripts/copy-wordcount.mjs 2>/dev/null | sed -n '/^== DEFAULT_COPY/,/^TOTAL/p' | tail -1
```

Expected, exactly:

```
TOTAL        keys= 522 words= 2175
```

A dependency-scan warning about `virtual:pwa-register` goes to stderr and is expected. `2>/dev/null`
drops it.

- [ ] **Step 3: Confirm lint accepts the new script**

```bash
npx eslint scripts/copy-wordcount.mjs
```

Expected: no output. If ESLint reports `'console' is not defined`, `eslint.config.js` still ignores
`scripts/**`; add the Node-globals block for `scripts/**/*.mjs` in this same commit, using
`globals` 17, which is already installed.

- [ ] **Step 4: Commit**

```bash
git add scripts/copy-wordcount.mjs eslint.config.js
git commit -m "chore(P9): a word-count harness for the copy tables"
```

---

## Task 2: The `hero` family

37 keys, 90 words. A hero is the one line a screen is about, capped at 8 words by R2.

**Files:**
- Modify: `src/content/copy.ts` (the `hero.*` rows)

**Check, stated first:** after the edit `node scripts/copy-wordcount.mjs` reports
`hero keys= 37` with a word total at or below 90, `npx vitest run src/content/copy.test.ts` passes,
and `npx vitest run` reports the same test count as before the edit. A hero row that loses a word
must lose it from a test assertion in the same commit, which is why the full suite runs.

- [ ] **Step 1: List the family and its current lengths**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
grep -nP "^  'hero\.[a-zA-Z0-9_.]+':" src/content/copy.ts
node scripts/copy-wordcount.mjs 2>/dev/null | grep '^hero'
```

Expected: 37 rows listed, and `hero         keys=  37 words=   90`.

- [ ] **Step 2: Rewrite each row against the four questions**

For every row, in order, answer in a code comment only where the answer is not obvious:

1. Does the line say what the screen is about, in the fewest words that still name it? Cut any word
   that repeats the tab name the user just tapped.
2. Does it carry a number, a unit or a quantity name? Those are frozen. Rewrite around them.
3. Does it hedge, apologise or describe the app's own construction? Cut the clause (R7).
4. Does it use an em-dash or en-dash as a connector? Replace with a colon, a comma, a semicolon or
   two sentences (R5).

Worked example, from the current table:

```ts
// before
'hero.noProfile': 'No profile yet',
// after: 'yet' promises a future the screen cannot deliver, and the screen already
// shows the setup control underneath.
'hero.noProfile': 'No profile',
```

Do not touch `hero.weeklyTargetMissed`, whose limelight row `the intervention` and board row
`IRREGULAR OPERATIONS` are both asserted by name in `copy.test.ts`.

- [ ] **Step 3: Run the contract test**

```bash
npx vitest run src/content/copy.test.ts
```

Expected: PASS, 0 failed.

- [ ] **Step 4: Run the full suite**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: `Tests  <N> passed`, with `<N>` unchanged from the pre-edit run and 0 failed. A failure
here is a test that quotes the old string: fix the assertion in this commit, never the string.

- [ ] **Step 5: Record the delta**

```bash
node scripts/copy-wordcount.mjs 2>/dev/null | grep '^hero'
```

Expected: `keys=  37` and a word count at or below 90. Paste the before and after lines into the
commit body.

- [ ] **Step 6: Commit**

```bash
# Sanity: the deleted lines must be exactly the rows you rewrote. Read the list.
git diff -- src/content/copy.ts | grep -oP "^-  '\K[a-zA-Z0-9_.]+(?=':)"
git add src/content/copy.ts
# Name every test file you edited. Never expand a glob here: another agent may hold
# edits to a test file in this same tree, and a glob would sweep it into your commit.
git add <each test file this task changed>
git commit -m "docs(P9): tighten the hero family, 90 words to <N>"
```

---

## Task 3: The `advice` family

92 keys, 693 words. The largest family and the one sentence 1 of the governing intent is aimed at.

**Files:**
- Modify: `src/content/copy.ts` (the `advice.*` rows)
- Modify: `src/ui/motivation/MotivationModal.tsx` (retire the `TAP_TO_MUTE_LABEL` literal)
- Modify: `src/domain/motivation/assets.ts:108` (the empty-MIME message)

**Check, stated first:** `advice` drops to at most 550 words with all 92 keys intact,
`npx vitest run src/content/copy.test.ts` passes, `git grep -n "TAP_TO_MUTE_LABEL" -- src` returns
only the test file's import until the test is updated and then returns nothing, and the full suite
count is unchanged.

- [ ] **Step 1: List the family, longest first**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
grep -nP "^  'advice\.[a-zA-Z0-9_.]+':" src/content/copy.ts | awk '{ print length($0), $0 }' | sort -rn | head -30
```

Expected: 92 rows, the longest at the top. The top of that list is where the words are.

- [ ] **Step 2: Apply R3 and the R9 criterion, row by row**

R3 caps an advice line at 12 words. R9's criterion decides what moves out rather than what gets
cut: *show it inline only if the user must act differently because of it.* That is governing
sentence 2 restated. Arithmetic, derivations and thresholds move behind `disclosure.why`, whose
summary is the literal `why?`. The disclosure body is exempt from R1 to R4, so nothing is lost.

Two rows already carry a `LENGTH_EXEMPT` entry or a disclosure call site. `advice.motivationClipLimit`
is exempt at `copy.test.ts:104-109` because `MotivationSettings.tsx` renders it inside
`<details><summary>why?</summary>`. Adding a row to `LENGTH_EXEMPT` requires naming the call site
in the map entry, exactly as that one does.

- [ ] **Step 3: Move the tap-to-mute literal into the table**

```bash
sed -n '45,55p' src/ui/motivation/MotivationModal.tsx
sed -n '205,220p' src/ui/motivation/MotivationModal.tsx
```

The literal is `export const TAP_TO_MUTE_LABEL = 'Tap the video to mute.';` at line 52, rendered at
line 212 as the `aria-label` when sound is on. Its own comment says it "belongs beside
`advice.tapForSound` as `advice.tapToMute`, which is a move, not a rewrite." Make the move: add
`'advice.tapToMute': 'Tap the video to mute.'` to the union and the table beside
`advice.tapForSound` at `copy.ts:1262`, change line 212 to `t('advice.tapToMute')`, delete the
export, and update `MotivationModal.test.tsx` lines 6, 176 and 193 to read the key.

- [ ] **Step 4: Name the file when the MIME type is empty**

```bash
sed -n '100,115p' src/domain/motivation/assets.ts
```

Line 108 reads ``throw new Error(`Not a video file: ${file.type}.`);``. A file the browser gives no
type produces `Not a video file: .`, which names nothing. Replace with:

```ts
    // A browser that recognises no type gives an empty string, and `Not a video file: .` names
    // nothing the user can act on. Fall back to the file's own name. [no units]
    throw new Error(`Not a video file: ${file.type === '' ? file.name : file.type}.`);
```

Add a test in `src/domain/motivation/assets.test.ts` that constructs a `File` with `type: ''` and
asserts the message contains the file name.

- [ ] **Step 5: Run the contract test and the two touched suites**

```bash
npx vitest run src/content/copy.test.ts src/ui/motivation/MotivationModal.test.tsx src/domain/motivation/assets.test.ts
```

Expected: PASS, 0 failed, and the assets suite one test larger than before.

- [ ] **Step 6: Run the full suite and record the delta**

```bash
npx vitest run 2>&1 | tail -5
node scripts/copy-wordcount.mjs 2>/dev/null | grep '^advice'
```

Expected: 0 failed; `advice       keys=  92 words=<at most 550>`.

- [ ] **Step 7: Commit**

```bash
git add src/content/copy.ts src/ui/motivation/MotivationModal.tsx src/ui/motivation/MotivationModal.test.tsx src/domain/motivation/assets.ts src/domain/motivation/assets.test.ts
git commit -m "docs(P9): tighten the advice family, and move two literals into the table"
```

---

## Task 4: The `status` family

92 keys, 336 words. Status lines report a fact. Many are templates that `FORMAT` fills.

**Files:**
- Modify: `src/content/copy.ts` (the `status.*` rows)

**Check, stated first:** `status` keeps all 92 keys and every `{slot}` it carries today. The slot
check is mechanical: `copy.test.ts:231` asserts each override table carries exactly the default's
slots, so renaming a slot in the default breaks the limelight and board rows. Run the contract test
after every few rows rather than at the end.

- [ ] **Step 1: Capture the slot inventory before the edit**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
grep -oP "^  'status\.[a-zA-Z0-9_.]+': '\K[^']*" src/content/copy.ts | grep -oP '\{[a-zA-Z]+\}' | sort | uniq -c | sort -rn > /tmp/status-slots-before.txt
cat /tmp/status-slots-before.txt
```

- [ ] **Step 2: Rewrite the rows**

A status line states what happened or what holds now. Cut every word that restates the label beside
it. Never cut a slot, a number, a unit or a quantity name. Where a status line explains why the fact
holds, the explanation moves behind `disclosure.why`.

Leave these alone: `status.prStamp`, `status.weekMetStamp`, `status.weekDeltaNegative`,
`status.weekDeltaZero`, `status.weekDeltaPositive`, `status.rest`, `status.sessionCursor`,
`status.planProgress`, `status.prReached`, `status.milestoneSets`, `status.specimenAcquired`,
`status.sessionEyebrow`, `status.setCounter`, `status.lastSessionSets`, `status.refusalPaused`,
`status.konami` and the nine `status.boot*` rows. Each is asserted by name or by slot in
`copy.test.ts` or carries a limelight or board row that would drift.

- [ ] **Step 3: Confirm the slot inventory is unchanged**

```bash
grep -oP "^  'status\.[a-zA-Z0-9_.]+': '\K[^']*" src/content/copy.ts | grep -oP '\{[a-zA-Z]+\}' | sort | uniq -c | sort -rn > /tmp/status-slots-after.txt
diff /tmp/status-slots-before.txt /tmp/status-slots-after.txt && echo "slots unchanged"
```

Expected: `slots unchanged`.

- [ ] **Step 4: Run the contract test and the full suite**

```bash
npx vitest run src/content/copy.test.ts
npx vitest run 2>&1 | tail -5
node scripts/copy-wordcount.mjs 2>/dev/null | grep '^status'
```

Expected: PASS; 0 failed; `status       keys=  92` with a word total at or below 336.

- [ ] **Step 5: Commit**

```bash
git add src/content/copy.ts
# Name every test file you edited. Never expand a glob here: another agent may hold
# edits to a test file in this same tree, and a glob would sweep it into your commit.
git add <each test file this task changed>
git commit -m "docs(P9): tighten the status family, slots and numbers unchanged"
```

---

## Task 5: The `button` family

71 keys, 146 words. R1 caps a button at 3 words, so this family is already tight. The work is
register and duplication, not length.

**Files:**
- Modify: `src/content/copy.ts` (the `button.*` rows)

**Check, stated first:** every `button.*` row is at most 3 words after the edit, no two rows carry
the same string unless they front the same action, and `copy.test.ts:258` still passes, which is the
test that no skin swaps an abort for a commit. The abort keys are `button.cancel` and
`button.dismiss`; the commit keys are `button.confirmSkip`, `button.confirmStart` and
`button.wipeConfirm`.

- [ ] **Step 1: Find duplicate strings**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
grep -oP "^  'button\.[a-zA-Z0-9_.]+': '\K[^']*" src/content/copy.ts | sort | uniq -d
```

Expected: a short list. For each duplicate, decide whether the two keys front the same action. If
they do, retire one in Task 16 and repoint its call site. If they do not, the two strings must
differ, because a screen reader announces nothing else.

- [ ] **Step 2: Check the word cap by hand before the test does**

```bash
node scripts/copy-wordcount.mjs 2>/dev/null | grep '^button'
```

Expected: `button       keys=  71 words= 146`, an average of 2.06 words. A rewrite that raises the
total is going the wrong way.

- [ ] **Step 3: Rewrite the rows**

Cut the object where the screen already names it. `Download JSON` beats `Download the JSON file`.
Keep the verb first. Never rename an abort into a commit or a commit into an abort.

- [ ] **Step 4: Run the contract test and the full suite**

```bash
npx vitest run src/content/copy.test.ts
npx vitest run 2>&1 | tail -5
```

Expected: PASS; 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src/content/copy.ts
# Name every test file you edited. Never expand a glob here: another agent may hold
# edits to a test file in this same tree, and a glob would sweep it into your commit.
git add <each test file this task changed>
git commit -m "docs(P9): tighten the button family and remove duplicate labels"
```

---

## Task 6: The `label` and `option` families

103 `label` keys at 220 words, and 16 `option` keys at 50 words. A label names a field; an option
names a choice. Neither is a sentence.

**Files:**
- Modify: `src/content/copy.ts` (the `label.*` and `option.*` rows)

**Check, stated first:** no label ends in a colon (the layout supplies it), no label repeats the
section heading above it, and every `label.modality.*` row still matches its `Modality` member so
`MODALITY_KEY` in `AddCustomExercise.tsx` stays exhaustive. `npx tsc -b` catches the last one.

- [ ] **Step 1: Find labels carrying punctuation or a repeated heading**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
grep -nP "^  'label\.[a-zA-Z0-9_.]+': '[^']*[:.]'" src/content/copy.ts
grep -nP "^  'option\.[a-zA-Z0-9_.]+':" src/content/copy.ts | wc -l
```

Expected: a list of labels ending in a colon or a full stop, and `16`.

- [ ] **Step 2: Rewrite the rows**

Strip trailing punctuation. Where the label duplicates its heading, cut the duplication from the
label, not from the heading, because the heading is the landmark a screen reader announces first.
Leave `label.settingsSkin`, `label.settingsSounds` and `label.settingsHotkeys` alone: all three
carry a limelight row and the last one is quoted in a WCAG 2.1 SC 2.1.4 comment at
`copy.ts:1520-1527`.

- [ ] **Step 3: Typecheck, then test**

```bash
npx tsc -b
npx vitest run src/content/copy.test.ts
npx vitest run 2>&1 | tail -5
```

Expected: `tsc -b` silent; contract test PASS; 0 failed.

- [ ] **Step 4: Commit**

```bash
git add src/content/copy.ts
# Name every test file you edited. Never expand a glob here: another agent may hold
# edits to a test file in this same tree, and a glob would sweep it into your commit.
git add <each test file this task changed>
git commit -m "docs(P9): tighten the label and option families"
```

---

## Task 7: The `coach` family

13 keys, 47 words. Every one is a template with slots, read after a logged set, and every one has a
limelight row asserted by slot in `copy.test.ts:521`.

**Files:**
- Modify: `src/content/copy.ts` (the `coach.*` rows)

**Check, stated first:** each of the 13 rows keeps exactly the slots it has today, so
`copy.test.ts:231` ("keeps every slot the default uses, and adds none") and `copy.test.ts:243`
("carries exactly the numbers the default carries") both pass unchanged. A slot removed here fails
in the limelight table, not here, which is why the check runs the whole contract file.

- [ ] **Step 1: Print the family with its slots**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
grep -nP "^  'coach\.[a-zA-Z0-9_.]+':" src/content/copy.ts
grep -nP "^  'coach\.[a-zA-Z0-9_.]+':" src/content/copy.limelight.ts
```

Expected: 13 rows in each file, the same 13 keys.

- [ ] **Step 2: Rewrite the default rows only**

The limelight rows are Task 12's. Here, cut the clinical sentence to its fact. `coach.loadPr`
currently reads `Load personal record. Previous best {load} × {reps}.` The quantity name
`personal record` is fixed by R11, the two slots are fixed by the parity test, and `Previous best`
is the only phrase a rewrite can reach.

- [ ] **Step 3: Run the contract test**

```bash
npx vitest run src/content/copy.test.ts
```

Expected: PASS. A failure naming `keeps every slot the default uses` means a slot was dropped.

- [ ] **Step 4: Run the full suite**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src/content/copy.ts
# Name every test file you edited. Never expand a glob here: another agent may hold
# edits to a test file in this same tree, and a glob would sweep it into your commit.
git add <each test file this task changed>
git commit -m "docs(P9): tighten the coach lines, every slot intact"
```

---

## Task 8: The `quantity`, `unit`, `weekday` and `step` families

21 `quantity` keys at 47 words, 1 `unit` key, 7 `weekday` keys, 9 `step` keys at 12 words. These are
the names R11 governs. This task changes almost nothing, and proves it.

**Files:**
- Modify: `src/content/copy.ts` (only where a name is wrong)

**Check, stated first:** every quantity name matches the term the field uses. The list to check
against is master plan section 3: mass in kg, volume in mL, duration in s, energy in kcal, protein
in g, load on a bar, body mass, beverage intake, RPE, RIR, 1RM, e1RM. A colloquial stand-in is a
defect; a correct name that reads oddly is not.

- [ ] **Step 1: Print the four families**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
grep -nP "^  '(quantity|unit|weekday|step)\.[a-zA-Z0-9_.]+':" src/content/copy.ts
```

Expected: 38 rows.

- [ ] **Step 2: Grep the whole table for the four banned stand-ins**

```bash
grep -nP "^  '[a-zA-Z0-9_.]+': '[^']*\b(weight|calories|water|efficiency)\b" src/content/copy.ts
```

Expected: either no output, or rows where the word is correct in context. `weight` is wrong for a
load on a bar and wrong for body mass; it is right in `body weight` only if no other term fits, and
`bodyweight` as a modality name is a standard term and stays. `calories` is wrong for kcal.
`water` is wrong for beverage intake. Record the verdict for each hit in the commit body.

- [ ] **Step 3: Fix only the wrong names, and comment the unit beside each**

```ts
// Every physical quantity carries its unit in a comment (master plan section 3).
'quantity.bodyMass': '{value} kg', // [kg] stored unit; units.ts converts for display
```

- [ ] **Step 4: Run the full suite**

```bash
npx vitest run 2>&1 | tail -5
node scripts/copy-wordcount.mjs 2>/dev/null | grep -E '^(quantity|unit|weekday|step)'
```

Expected: 0 failed; the four family lines with their key counts unchanged.

- [ ] **Step 5: Commit**

If Step 2 found nothing, commit nothing and record "no stand-in found; 38 rows verified" in the
task report. Otherwise:

```bash
git add src/content/copy.ts
# Name every test file you edited. Never expand a glob here: another agent may hold
# edits to a test file in this same tree, and a glob would sweep it into your commit.
git add <each test file this task changed>
git commit -m "fix(P9): name the defined quantity in <N> rows"
```

---

## Task 9: The `why` and `disclosure` families

9 `why` keys at 221 words and 6 `disclosure` keys at 85 words. Together they are 306 words, 14 per
cent of the table, and they are the words governing sentence 2 says the user should not have to
read unless progression depends on them.

**Files:**
- Modify: `src/content/copy.ts` (the `why.*` and `disclosure.*` rows)

**Check, stated first:** every `why.*` row is reachable only from inside a `<details>` element, and
every `disclosure.*` summary is either the literal `why?` or a noun phrase of at most 5 words (R9).
The reachability check is a grep against the call sites, not a test, because no test asserts the
DOM ancestor.

- [ ] **Step 1: Prove each `why.*` key renders inside a disclosure**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
for k in $(grep -oP "^  'why\.\K[a-zA-Z0-9_.]+(?=':)" src/content/copy.ts); do
  echo "--- why.$k"
  git grep -n "why.$k" -- src ':!src/content/copy.ts' | head -3
done
```

Expected: each key has a call site, or none. `why.deloadSets` has none and is Task 16's to retire.
For each key that does render, open the component and confirm a `<details>` ancestor. Record the
file and line per key in the commit body.

- [ ] **Step 2: Check every disclosure summary against R9**

```bash
grep -nP "^  'disclosure\.[a-zA-Z0-9_.]+':" src/content/copy.ts
```

Expected: 6 rows. `disclosure.why` must be exactly `why?`. The other five are noun phrases; count
their words and cut any above 5.

- [ ] **Step 3: Rewrite the `why.*` bodies**

A disclosure body is exempt from R1 to R4 and may be long. It is not exempt from R5, R6 or R7, and
it is not licensed to ramble. Cut the sentence that explains why the app was built a certain way.
Keep the sentence that lets the user reproduce the number. Keep every citation.

- [ ] **Step 4: Run the contract test and the full suite**

```bash
npx vitest run src/content/copy.test.ts
npx vitest run 2>&1 | tail -5
node scripts/copy-wordcount.mjs 2>/dev/null | grep -E '^(why|disclosure)'
```

Expected: PASS; 0 failed; both families with their key counts intact.

- [ ] **Step 5: Commit**

```bash
git add src/content/copy.ts
# Name every test file you edited. Never expand a glob here: another agent may hold
# edits to a test file in this same tree, and a glob would sweep it into your commit.
git add <each test file this task changed>
git commit -m "docs(P9): tighten the why and disclosure bodies"
```

---

## Task 10: The `push` and `notification` families

1 `push` key at 5 words and 1 `notification` key at 2. These two strings are the only copy that
leaves the device and arrives on a lock screen.

**Files:**
- Modify: `src/content/copy.ts` (the `push.*` and `notification.*` rows)

**Check, stated first:** the rendered push body stays inside the Worker's bounds, which
`src/domain/reminders/payload.ts` and `worker/src/index.ts` pin at 100 characters for the title, 300
for the body and 120 for the tag. `src/domain/reminders/payload.test.ts` asserts those bounds
against the Worker's source, so the full suite is the check. `push.body` also has no call site
today: confirm that before editing it.

- [ ] **Step 1: Establish where the push text actually comes from**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
grep -n "'push.body'\|'notification" src/content/copy.ts
git grep -n "push.body" -- src worker | grep -v "^src/content/copy.ts"
grep -n "title\|body" src/domain/reminders/instants.ts | head -20
```

Expected: `push.body` has no reference outside `copy.ts`. `instants.ts` builds the title and body
directly. Record that finding; it decides whether Task 16 retires `push.body` or this task wires it.

- [ ] **Step 2: Decide, and write the decision down**

Two outcomes, both acceptable, and the choice belongs in the commit body:

- Wire `instants.ts` to read `push.body` through `FORMAT`, so a skin can reach the lock screen.
  This adds a slot-carrying template and needs `copy.test.ts` slot parity to hold.
- Retire `push.body` in Task 16 and record in master plan section 6.6 that push text is built in
  `instants.ts` and is not skinnable, because a notification arrives with no app chrome to place it.

The second is the smaller change and matches what shipped. Prefer it unless the user asks otherwise.

- [ ] **Step 3: Run the reminder suites**

```bash
npx vitest run src/domain/reminders/ worker/test 2>&1 | tail -5
```

Expected: 0 failed. The client suites run 46 tests and the Worker 148 as of `628da00`.

- [ ] **Step 4: Commit**

```bash
git add src/content/copy.ts src/domain/reminders/instants.ts
git commit -m "docs(P9): settle where the push text lives"
```

If the decision is to retire, commit nothing here and add the key to Task 16's retirement list.

---

## Task 11: The `nav`, `setup`, `shell`, `error`, `banner`, `recovery` and `readiness` families

8 + 1 + 2 + 5 + 11 + 6 + 9 = 42 keys. `readiness` alone is 98 words, and it is the screen that
carries a medical disclaimer, so it is the one family where cutting a word can change a claim.

**Files:**
- Modify: `src/content/copy.ts`

**Check, stated first:** the seven `readiness.*` screening domains still name the same seven
conditions master plan section 10.4 lists, and the screen still states that it is not medical advice
and names the PAR-Q+ as its model. Cutting either sentence changes a legal claim, not a word count.
`banner.*`, `recovery.*` and `shell.*` are Task 15's and Task 16's; leave their strings alone here.

- [ ] **Step 1: Read section 10.4 before touching the readiness rows**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
sed -n '566,570p' docs/plans/2026-09-01-00-master-plan.md
grep -nP "^  'readiness\.[a-zA-Z0-9_.]+':" src/content/copy.ts
```

Expected: the decision text naming seven domains, and 9 readiness rows.

- [ ] **Step 2: Rewrite `nav`, `setup`, `error` only**

`nav` is 8 words across 8 keys and needs nothing. `error` is 22 words across 5 keys: check each
reads as a fact the user can act on, with no HTTP status, no endpoint and no stack text.

- [ ] **Step 3: Leave the readiness wording unless a word is wrong**

If a readiness row hedges (R7) without changing the claim, cut the hedge. If cutting a word would
narrow or widen a screening question, stop and record why the row stands.

- [ ] **Step 4: Run the full suite**

```bash
npx vitest run 2>&1 | tail -5
node scripts/copy-wordcount.mjs 2>/dev/null | sed -n '/^== DEFAULT_COPY/,/^TOTAL/p' | tail -1
```

Expected: 0 failed, and a `TOTAL` line whose word count is below 2175. Paste that line and the
2175 baseline into the commit body: this is the number governing sentence 1 asked for.

- [ ] **Step 5: Commit**

```bash
git add src/content/copy.ts
# Name every test file you edited. Never expand a glob here: another agent may hold
# edits to a test file in this same tree, and a glob would sweep it into your commit.
git add <each test file this task changed>
git commit -m "docs(P9): tighten nav, setup, error and readiness; default table now <N> words"
```

---

## Task 12: The limelight voice pass

105 rows over 522 default keys, which is 20.1 per cent coverage. Governing sentences 3 and 4 are
about this file. The register is brat summer crossed with stan twitter: camp, lower case, and aimed
at the week or at the app, never at the person reading it.

**Files:**
- Modify: `src/content/copy.limelight.ts`
- Modify: `src/content/copy.test.ts` (only if a new shouted row or a new required row is added)

**Check, stated first, and it is four mechanical gates plus one human one:**

1. `copy.test.ts:363` asserts exactly three shouted keys carrying two distinct strings:
   `button.startSession`, `status.prStamp`, `status.weekMetStamp`. A fourth shouted row fails.
2. `copy.test.ts:231` asserts slot parity with the default; `:243` asserts digit parity.
3. `copy.test.ts:289` asserts the three strings the user named: `hydrate or diedrate`, `MOTHER`,
   `LET'S GO BABES`. These are frozen by governing sentence 3.
4. `copy.test.ts:258` asserts no skin swaps an abort for a commit.
5. The register itself is the user's call, not the model's. Task 13 produces the page they mark up.

- [ ] **Step 1: Derive the keys still clinical, per screen**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
for f in "src/ui/views/TodayView.tsx" "src/ui/views/TrainView.tsx src/ui/views/train" "src/ui/views/PlanView.tsx" "src/ui/views/SettingsView.tsx src/ui/settings src/ui/components/ReminderSettingsPanel.tsx src/ui/components/InstallGuide.tsx"; do
  echo "=== $f"
  git grep -oh "'[a-z][a-zA-Z0-9_.]*\.[a-zA-Z0-9_.]*'" -- $f | tr -d "'" | sort -u > /tmp/used.txt
  grep -oP "^  '\K[a-zA-Z0-9_.]+(?=':)" src/content/copy.limelight.ts | sort -u > /tmp/lime.txt
  grep -oP "^  '\K[a-zA-Z0-9_.]+(?=':)" src/content/copy.ts | sort -u > /tmp/def.txt
  comm -12 /tmp/used.txt /tmp/def.txt | comm -23 - /tmp/lime.txt
done
```

Expected counts, measured 2026-09-02: Today 12 keys with no limelight row, Train 26, Plan 6,
Settings 81. That is 125 decisions, and every one of them gets a verdict in Step 2.

- [ ] **Step 2: Write one verdict per key, as a comment or a row**

Three verdicts are allowed, and each has a form:

- **A row.** The words change. Write it lower case unless it is one of the three shouted keys.
- **A comment naming the reason it stays clinical.** The file already carries eleven of these, and
  they are the pattern: `status.setsBy` stays because the string is two numbers and a
  multiplication sign, with no word for a skin to change. Copy that shape.
- **Silence, only for a key whose value contains no word at all.** A row of pure slots and units
  needs no comment.

The four rules at the top of `copy.limelight.ts` bind every new row, and rule 4 is the hard one:
the joke never sits on a control whose misreading costs data. Every string fronting a wipe, an
import, a legacy delete, an export or a save failure stays clinical in every skin. The 81 Settings
keys include the data section: most of them fall to rule 4, and the verdict comment should say so
once at the head of a block rather than 30 times.

- [ ] **Step 3: Vulgarity, where it lands**

Governing sentence 4 licenses it. Master plan section 3 bounds it: no slurs, no body-shaming, no
food morality. The bound is not negotiable and is not a matter of taste. A vulgar row that fronts a
destructive control also fails rule 4, so the two rules stack rather than compete.

- [ ] **Step 4: Run the contract test**

```bash
npx vitest run src/content/copy.test.ts
```

Expected: PASS. Read the failure name if it fails. `shouts three keys` means a new row is upper
case. `keeps every slot` means a slot was dropped or invented. `carries exactly the numbers` means a
digit appeared that the default does not have.

- [ ] **Step 5: Run the full suite**

```bash
npx vitest run 2>&1 | tail -5
node scripts/copy-wordcount.mjs 2>/dev/null | sed -n '/^== LIMELIGHT_COPY/,/^TOTAL/p' | tail -1
```

Expected: 0 failed, and a limelight key count above 105.

- [ ] **Step 6: Commit**

```bash
git add src/content/copy.limelight.ts src/content/copy.test.ts
git commit -m "feat(P9): the limelight table covers <N> keys, with a verdict on every screen"
```

---

## Task 13: The side-by-side page for the user

The register is the user's call. This task hands them one page they can read in a sitting and mark
up in the repository.

**Files:**
- Create: `docs/design/2026-09-02-limelight-side-by-side.md`

**Check, stated first:** the page carries one row per limelight key, the default string and the
limelight string are quoted byte for byte from the two tables (not retyped), the verdict column is
empty, and the row count equals the limelight table's key count.

- [ ] **Step 1: Generate the table body from the tables themselves**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
cat > .sbs.tmp.mjs <<'JS'
import { createServer } from 'vite';
const s = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const m = await s.ssrLoadModule('/src/content/copy.ts');
await s.close();
const esc = (v) => v.replace(/\|/g, '\\|');
console.log('| Key | Default (clinical) | Limelight | Keep? |');
console.log('| --- | --- | --- | --- |');
for (const k of Object.keys(m.LIMELIGHT_COPY).sort()) {
  console.log(`| \`${k}\` | ${esc(m.DEFAULT_COPY[k])} | ${esc(m.LIMELIGHT_COPY[k])} |  |`);
}
JS
node .sbs.tmp.mjs 2>/dev/null > /tmp/sbs-body.md
rm -f .sbs.tmp.mjs
wc -l /tmp/sbs-body.md
```

Expected: the line count equals the limelight key count plus 2 for the header rows.

- [ ] **Step 2: Write the page around that body**

```markdown
# Limelight, beside the clinical default

Read this on a phone if you can, because that is where the strings land. Every row is a place the
limelight skin says something different from the default. The default column is what a `clinical`
user reads and is not up for a vote here.

Mark the last column. `keep` means ship it. `cut` means fall back to the clinical string. Anything
else you write in that column is the string you want instead, and it ships as written.

Three rows are frozen because you named them: `advice.drinkToThirst`, `status.prStamp` and
`button.startSession`. `status.weekMetStamp` carries the same `MOTHER` as `status.prStamp`, at the
key the week stamp reads. Mark them anyway if you want them changed.

Two constraints bind whatever you write. A skin may not change a number, a unit or a quantity name:
`60 kg`, `8 reps` and `beverage intake` survive every rewrite. A skin may not put a joke on a
control whose misreading destroys data, so the wipe, the import, the legacy delete, the export and
the save-failure lines have no rows here and will not get any.

<the generated table>
```

- [ ] **Step 3: Verify the row count and that nothing was retyped**

```bash
grep -c '^| `' docs/design/2026-09-02-limelight-side-by-side.md
node scripts/copy-wordcount.mjs 2>/dev/null | sed -n '/^== LIMELIGHT_COPY/,/^TOTAL/p' | tail -1
```

Expected: the two counts agree.

- [ ] **Step 4: Commit**

```bash
git add docs/design/2026-09-02-limelight-side-by-side.md
git commit -m "docs(P9): a side-by-side of the limelight table for the user to mark up"
```

- [ ] **Step 5: Stop and hand it over**

Tell the user the file path and that the register decision is theirs. Do not proceed to a second
limelight pass without their marks. Everything after this task is independent of their answer.

---

## Task 14: The board voice pass

29 rows over 522 keys, which is 5.6 per cent. The file's own header says the thinness is deliberate:
round two's design table is sixteen rows, and the board is a second skin rather than the one the
brief was written about. This task keeps it sparse and writes the reason down.

**Files:**
- Modify: `src/content/copy.board.ts` (comments, and at most a handful of rows)

**Check, stated first:** `copy.test.ts:460` asserts the whole table is upper case, `:469` asserts
the design's em-dash became the colon R5 prescribes, and `:474` asserts the met-week stamp reads
`ALL DEPARTED`. Slot and digit parity apply here exactly as they do to limelight.

- [ ] **Step 1: Produce the decision list**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
grep -oP "^  '\K[a-zA-Z0-9_.]+(?=':)" src/content/copy.board.ts | sort > /tmp/board.txt
grep -oP "^  '\K[a-zA-Z0-9_.]+(?=':)" src/content/copy.limelight.ts | sort > /tmp/lime.txt
echo "=== limelight has a row, board does not:"; comm -23 /tmp/lime.txt /tmp/board.txt
echo "=== board has a row, limelight does not:"; comm -13 /tmp/lime.txt /tmp/board.txt
```

Expected: 76 keys in the first list and 0 in the second, given the 105 and 29 counts.

- [ ] **Step 2: Write the decision, once, at the head of the file**

Add a block comment stating the rule this task adopts and the alternative it rejects. The rule:
a board row exists only where a real airport term names the thing. The rejected alternative:
mirroring limelight's coverage, which would mean inventing airport vocabulary for a hydration
shortfall and a body-mass check-in, and a board that says `REFRESHMENT SERVICE IRREGULAR` about
water is a joke wearing a uniform, not a register.

Then list, in that comment, the families that fall through to clinical on purpose: the setup wizard,
the nutrition targets, the readiness screen, the migration wizard, the export view and the data
section. Name the count beside each so a later reviewer can check the comment against the file.

- [ ] **Step 3: Add rows only where the term already exists**

Candidates worth a row, each because round two's design or ordinary airport usage supplies the word:
`button.cancel` (`CANCEL`), `button.continue` (`PROCEED`), `status.rest` already exists,
`hero.train` (`DEPARTURES`), `advice.noSessionToday` (`NO SERVICE TODAY`). Do not add a row you have
to invent a term for.

- [ ] **Step 4: Run the contract test and the full suite**

```bash
npx vitest run src/content/copy.test.ts
npx vitest run 2>&1 | tail -5
```

Expected: PASS; 0 failed. If `is upper case throughout` fails, a new row carries lower case.

- [ ] **Step 5: Commit**

```bash
git add src/content/copy.board.ts
git commit -m "docs(P9): record why the board table stays sparse, and add <N> rows"
```

---

## Task 15: The hardcoded twins

`src/app/App.tsx`, `src/app/UpdatePrompt.tsx` and `src/app/RootErrorBoundary.tsx` render English
that is byte-identical to 22 keys in the default table. The keys have never been read. Master plan
section 3 says a view imports `copy('button.startSession')`, never a literal.

**Files:**
- Modify: `src/app/App.tsx` (lines 273 to 371)
- Modify: `src/app/UpdatePrompt.tsx` (lines 44 to 51)
- Modify: `src/app/RootErrorBoundary.tsx` (lines 126 to 150)
- Modify: `src/domain/migrations/index.ts:49`
- Test: `src/app/App.test.tsx`, `src/app/UpdatePrompt.test.tsx`, `src/app/RootErrorBoundary.test.tsx`

**Check, stated first:** after the conversion,
`git grep -c "Storage is full\|A new version is ready\|The app could not start" -- src ':!src/content/copy.ts'` returns
only test files, and the three suites pass with the same test counts. `RootErrorBoundary` is a class
component and cannot call a hook, so it reads `copy(key)` directly, which returns the clinical
string. That is correct: the recovery screen renders when the store failed to hydrate, so no skin
preference is loadable.

- [ ] **Step 1: Confirm the twins are byte-identical before converting**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
sed -n '601,626p' src/content/copy.ts
grep -n "Storage is full. Export now.\|Storage is unavailable here. Export now.\|The change could not be saved. The stored copy is unchanged." src/app/App.tsx
grep -n "A new version is ready.\|UPDATE READY" src/app/UpdatePrompt.tsx
grep -n "The app could not start\|Your data is unchanged\|Stored data cleared\|Reload to start empty" src/app/RootErrorBoundary.tsx
```

Expected: every literal in the three components appears verbatim in the table block. Any that does
not is a rewrite, not a conversion: fix the table row to match the shipped string first, in this
same commit, and say so in the commit body.

- [ ] **Step 2: Convert `UpdatePrompt.tsx`, the smallest case**

```tsx
import { useCopy } from '../skins/skinContext';

export function UpdatePrompt(): ReactElement | null {
  const apply = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const t = useCopy();
  if (apply === null) return null;

  return (
    <div className="banner update" role="status">
      <span className="banner-tag">{t('banner.update.tag')}</span>
      <span>{t('banner.update.body')}</span>
      <button type="button" onClick={apply}>
        {t('button.reload')}
      </button>
    </div>
  );
}
```

Confirm the hook's real name and path first: `git grep -n "export function useCopy" -- src`.

- [ ] **Step 3: Run that one suite**

```bash
npx vitest run src/app/UpdatePrompt.test.tsx
```

Expected: PASS. The suite has 1 test as of `671382a`; the count must not change.

- [ ] **Step 4: Convert `App.tsx`'s two banners**

`saveErrorCopy` returns `{ tag, message, recovery }` with literals. Change `tag` and `message` to
`CopyKey` values and resolve them at the render site, so the exhaustive switch keeps its `never`
arm:

```tsx
interface SaveErrorCopy {
  tag: CopyKey;
  message: CopyKey;
  recovery: 'export-memory' | 'retry-and-export-stored';
}
```

`LoadErrorBanner` interpolates the validation reason, so it reads `FORMAT.loadInvalid(loadError)`
against `banner.loadInvalid.body`, whose row already carries the `// formatted` marker. Add that
frame to `FORMAT` if it does not exist; the table row is
`'Stored data did not validate: unrecognized key. Nothing was overwritten.'` and the slot replaces
`unrecognized key`.

- [ ] **Step 5: Convert `RootErrorBoundary.tsx`**

Six keys: `recovery.hero`, `recovery.advice`, `recovery.exported`, `recovery.confirm`,
`button.exportStoredData`, `button.clearData`, plus `recovery.cleared.hero` and
`recovery.cleared.advice`. `recovery.confirm` reads `Export first, then type DELETE.` and the
component interpolates `CONFIRMATION_WORD`. Add a `FORMAT.recoveryConfirm(word)` frame so the word
and the string cannot disagree, in the pattern `ConfirmDestructive` already uses.

- [ ] **Step 6: Fix the two em-dashes in the migration comment**

```bash
sed -n '45,51p' src/domain/migrations/index.ts
```

Line 49 reads `real cause — a missing migration — would be invisible.` Replace the pair with commas:
`real cause, a missing migration, would be invisible.` This is the one code comment this plan
touches, and it is here because the residual list assigned it to P9 by name. Every other em-dash in
a code comment is out of scope and is recorded in Task 30.

- [ ] **Step 7: Run the three suites, then the full suite**

```bash
npx vitest run src/app/
npx vitest run 2>&1 | tail -5
git grep -n "Storage is full\|A new version is ready\|The app could not start" -- src ':!src/content/copy.ts' ':!src/app/*.test.tsx'
```

Expected: 0 failed; the last command returns nothing.

- [ ] **Step 8: Commit**

```bash
git add src/app/App.tsx src/app/UpdatePrompt.tsx src/app/RootErrorBoundary.tsx src/app/App.test.tsx src/app/UpdatePrompt.test.tsx src/app/RootErrorBoundary.test.tsx src/content/copy.ts src/domain/migrations/index.ts
git commit -m "feat(P9): the shell banners and the recovery screen read the copy table"
```

---

## Task 16: Retire the keys nothing renders

48 default keys have no reference anywhere under `src` outside their own two definition lines. Task
15 converts 22 of them to live call sites. This task decides the other 26 and re-runs the sweep so
the count is measured, not assumed.

**Files:**
- Modify: `src/content/copy.ts` (the `CopyKey` union and the `DEFAULT_COPY` table)
- Modify: `src/content/copy.test.ts` (only if a retired key sits in a REQUIRED list)
- Modify: `src/content/copy.limelight.ts` (only if a retired key carries a row)

**Check, stated first:** for every key retired, `git grep -c "<key>" -- src worker public index.html`
returns 0 before the deletion, `npx tsc -b` is silent after it, and `npx vitest run` reports 0
failed. The `tsc -b` step is load-bearing: `CopyKey` is a union, so a deleted member that something
still names is a compile error rather than a runtime blank.

- [ ] **Step 1: Re-run the sweep after Task 15 has landed**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
for k in $(grep -oP "^  '\K[a-zA-Z0-9_.]+(?=':)" src/content/copy.ts | sort -u); do
  hits=$(git grep -F "$k" -- src ':!src/content/copy.limelight.ts' ':!src/content/copy.board.ts' ':!src/content/copy.test.ts' \
    | grep -v "^src/content/copy.ts: *| '$k'$" \
    | grep -v "^src/content/copy.ts: *'$k':" | wc -l)
  [ "$hits" -eq 0 ] && echo "$k"
done | tee /tmp/dead-keys.txt | wc -l
```

Expected: 26, or 25 if Task 10 wired `push.body`. The 2026-09-02 list of 48 was:

- 22 twins, all closed by Task 15: `banner.loadInvalid.body`, `banner.loadInvalid.tag`,
  `banner.saveFailed.body`, `banner.saveFailed.tag`, `banner.saveQuota.body`, `banner.saveQuota.tag`,
  `banner.saveUnavailable.body`, `banner.saveUnavailable.tag`, `banner.update.body`,
  `banner.update.tag`, `button.clearData`, `button.exportData`, `button.exportStoredCopy`,
  `button.exportStoredData`, `button.reload`, `button.retrySave`, `recovery.advice`,
  `recovery.cleared.advice`, `recovery.cleared.hero`, `recovery.confirm`, `recovery.exported`,
  `recovery.hero`.
- 11 superseded migration-wizard keys: `advice.importDownloadFirst`, `advice.importIntro`,
  `advice.importNoResult`, `advice.importNothingDeleted`, `advice.importUnitsNeeded`,
  `advice.importUnreadable`, `button.keepImport`, `button.runImport`, `button.startClean`,
  `hero.importFromOldApp`, `why.importRejections`. The shipped wizard renders `advice.legacy*`,
  `button.legacy*` and `disclosure.*` instead, renamed by `a33cfc0`.
- 3 design-table rows with a skin override and no renderer: `status.planProgress`,
  `status.prReached`, `toast.setDeleted`.
- 12 with no renderer and no twin: `advice.bodyFatEstimate`, `advice.noMatches`,
  `advice.noSessionsLeftThisWeek`, `advice.viewNotBuilt`, `button.continueTransition`,
  `hero.noProfile`, `push.body`, `shell.status.loaded`, `shell.status.loading`,
  `status.setsLogged`, `why.deloadSets`, `why.targetsBasis`.

- [ ] **Step 2: Retire the 11 migration keys and 8 of the 12 orphans**

Delete the union member and the table row for each. Do not delete `status.planProgress`,
`status.prReached` or `toast.setDeleted` in this step: they are Step 3's.
Do not delete `hero.noProfile` or `advice.viewNotBuilt` without checking the shell first, because a
profile-less shell and an unbuilt view are states the app can still reach:

```bash
git grep -n "noProfile\|viewNotBuilt" -- src ':!src/content/copy.ts'
```

If that returns nothing, they go. If a component renders an equivalent literal, they are twins and
belong to Task 15's pattern rather than here.

- [ ] **Step 3: Decide the three design rows explicitly**

`status.planProgress`, `status.prReached` and `toast.setDeleted` each carry a limelight row, and the
first two carry a board row. All three sit in the REQUIRED list at `copy.test.ts:384`. They came from
round two and round three design tables and no component renders them. Two verdicts are allowed:

- **Keep, and say why.** A design row that shipped its skin table but not its component is a
  component the design still wants. Record the missing call site in master plan section 10's P9
  entry so it is a task, not a leak.
- **Retire all three, in every table, and remove them from the REQUIRED list.** This is a design
  change and needs a decision header on the copy contract per Task 18.

Prefer keeping, and record the missing call sites. The rows cost 3 keys and the alternative deletes
work the design asked for.

- [ ] **Step 4: Confirm the sweep is clean and the union compiles**

```bash
npx tsc -b
npx eslint .
npx vitest run 2>&1 | tail -5
node scripts/copy-wordcount.mjs 2>/dev/null | sed -n '/^== DEFAULT_COPY/,/^TOTAL/p' | tail -1
```

Expected: `tsc -b` silent; ESLint silent; 0 failed; a key count of about 503 and a word total below
the Task 11 figure.

- [ ] **Step 5: Verify the commit deletes nothing it should not**

```bash
git diff -- src/content/copy.ts | grep '^-' | grep -oP "^-  '\K[a-zA-Z0-9_.]+(?=':)" | sort > /tmp/deleted.txt
comm -23 /tmp/deleted.txt <(sort /tmp/dead-keys.txt)
```

Expected: no output. Any key printed here is a live key the diff is about to delete, which is
incident 2 happening again.

- [ ] **Step 6: Commit**

```bash
git add src/content/copy.ts src/content/copy.test.ts src/content/copy.limelight.ts src/content/copy.board.ts
git commit -m "chore(P9): retire <N> copy keys nothing renders"
```

---

## Task 17: `ICON_FOR_KEY` entries with no call site

`src/skins/limelight/Icon.tsx:103` maps 16 copy keys to pixel icons. Only 4 reach a `SkinLabel` call
site: `button.startSession` in `TodayView.tsx:448`, `advice.drinkToThirst` in
`HydrationBanner.tsx:88`, and `status.rest` and `button.skipRest` in `RestTimerPanel.tsx:182,200`.
The other 12 render no icon anywhere.

**Files:**
- Modify: `src/skins/limelight/Icon.tsx` (the `ICON_FOR_KEY` map and its comment block)
- Modify: the call sites that gain a `SkinLabel`, if any

**Check, stated first:** every entry left in `ICON_FOR_KEY` after this task either has a `SkinLabel`
call site, provable with `git grep -n SkinLabel -- src`, or carries a comment naming the component
that will place it. The file already carries that discipline for `lips` and `pause` at lines 86 to
99: `lips` has no position in the app and none is invented.

- [ ] **Step 1: List the unreachable entries**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
grep -oP "^  '\K[a-zA-Z0-9_.]+(?=':)" src/skins/limelight/Icon.tsx | sort > /tmp/icon-keys.txt
git grep -oh 'copyKey="\K[a-zA-Z0-9_.]*' -- src | sort -u > /tmp/skinlabel-keys.txt
comm -23 /tmp/icon-keys.txt /tmp/skinlabel-keys.txt
```

Expected, measured 2026-09-02: `advice.interventionBody`, `button.pausePlan`, `button.pauseTicker`,
`button.skipToday`, `button.trainSomethingElse`, `hero.weekReview`, `hero.weeklyTargetMissed`,
`label.settingsSkin`, `status.prStamp`, `status.weekDeltaNegative`, `status.weekMetStamp`. Eleven.

- [ ] **Step 2: For each, choose a call site or a comment**

Round three section 4.4 places the sixteen icons. Read it before deciding:

```bash
sed -n '417,470p' docs/design/round3/2026-09-01-round3-plan.md
```

Where the design draws a glyph at a position the app renders, wrap that string in `<SkinLabel>`.
Where the component places the icon itself rather than through a copy key (the stamp and the marquee
do), the map entry is dead and comes out, with the reason recorded in the comment block.

- [ ] **Step 3: Run the icon and view suites**

```bash
npx vitest run src/skins/limelight/ src/ui/views/ src/ui/components/ 2>&1 | tail -5
```

Expected: 0 failed. `Icon.test.tsx:125` asserts `ICON_FOR_KEY['button.back']` is undefined, and
`:136` asserts two entries by name; both must still hold.

- [ ] **Step 4: Run the full suite**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src/skins/limelight/Icon.tsx src/skins/limelight/Icon.test.tsx
# Name every view file you edited. No glob: other agents hold edits under src/ui/.
git add <each view file this task changed>
git commit -m "fix(P9): every mapped limelight icon reaches a call site or says why not"
```

---

## Task 18: Rewrite the copy contract

`docs/design/2026-09-01-copy-contract.md` is 629 lines. Its rule section is sound and its body is
stale: the key block still lists all 17 keys retired in `1500997`, the R6 illustration quotes a
string that changed, and rule R10 names a file that does not exist.

**Files:**
- Modify: `docs/design/2026-09-01-copy-contract.md`

**Check, stated first:** after the rewrite, for every key named in the contract body,
`grep -c "'<key>'" src/content/copy.ts` returns at least 1; every path the contract names resolves;
and `grep -nP "[\x{2013}\x{2014}]" docs/design/2026-09-01-copy-contract.md` returns only the R5 rule
text and the numeric ranges it licenses. The first of those three is a loop, written below.

- [ ] **Step 1: Fix the five stale lines first, because they are exact**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
sed -n '34p;59p;216p;218p;383p;411p;413p;536p' docs/design/2026-09-01-copy-contract.md
```

Five edits, each exact:

1. Line 59: `worker/RUNBOOK.md` becomes `docs/RUNBOOK-reminders.md`. The P7 close-out at master
   plan section 10.11 records that the runbook was never moved and that `README.md` links the real
   path.
2. Line 34, the R6 illustration: `After: `Load PR. Previous best 60 kg × 8.`` becomes
   ``After: `Load personal record. Previous best 60 kg × 8.``. R11 forbids the abbreviation in a
   line the user reads, and the shipped `coach.loadPr` says so.
3. Line 383, the same string in the pasted table block, changes with it.
4. Lines 216, 218, 411 and 413: delete the `button.play` and `button.muteThisWeek` union members
   and table rows. Both were retired in `1500997`, and master plan decision 10.2 settled the modal
   on one `Dismiss` control.
5. Line 536, the sweep table row that turns `Don't show again for this week` into `Mute this week`:
   append to that row's After cell `(retired in 1500997; decision 10.2)`, because the row is a
   record of a change that happened and deleting it would falsify the history.

- [ ] **Step 2: Delete the other 15 retired keys from the body**

```bash
for k in advice.installIos advice.iosVersion advice.videoStoreFailed advice.videoTooLarge \
         advice.videoWrongType advice.wipeAll button.preview button.removeCustomClip \
         button.setUpProfile hero.installFirst status.bundledClipAbsent status.bundledClipChecking \
         status.bundledClipPresent status.customClipNone status.customClipStored; do
  echo "$k: $(grep -c "'$k'" docs/design/2026-09-01-copy-contract.md) in contract, $(grep -c "'$k'" src/content/copy.ts) in copy.ts"
done
```

Expected before the edit: `2 in contract, 0 in copy.ts` for every one. Delete both occurrences of
each. Leave the appended "Retired and added keys" section alone: it is the record of the deletion
and must survive the deletion it records.

- [ ] **Step 3: Add the keys the body is missing**

```bash
grep -oP "^  '\K[a-zA-Z0-9_.]+(?=':)" src/content/copy.ts | sort > /tmp/shipped.txt
grep -oP "^  \| '\K[a-zA-Z0-9_.]+(?=')" docs/design/2026-09-01-copy-contract.md | sort > /tmp/contract.txt
echo "shipped but absent from the contract:"; comm -23 /tmp/shipped.txt /tmp/contract.txt | wc -l
echo "in the contract but not shipped:"; comm -13 /tmp/shipped.txt /tmp/contract.txt
```

The second list must be empty when this task ends. The first will be large, because P2 to P8
appended keys the contract's original 180-key block never held. Do not paste 300 rows into the
contract. Replace the pasted `CopyKey` block with a statement of where the union actually lives and
what the contract binds:

```markdown
## Where the copy lives

`src/content/copy.ts` exports the default table, and it is the union of record. This document does
not restate it: a key list copied into prose rots the moment a task appends a key, which is what
happened between the P2 sweep and the P8 close-outs. What binds is R1 to R11 above, and the four
tests in `src/content/copy.test.ts` that decide them.

Counts on 2026-09-02, from `node scripts/copy-wordcount.mjs`:

| Table | File | Keys | Coverage |
| --- | --- | --- | --- |
| clinical (default) | `src/content/copy.ts` | 522 | the union |
| limelight | `src/content/copy.limelight.ts` | 105 | 20.1 % |
| board | `src/content/copy.board.ts` | 29 | 5.6 % |
```

Update those three counts to the post-Task-16 figures before committing.

- [ ] **Step 4: Add the missing `advice.tapForSound` row and the limelight column**

Add to the contract body, in the motivation block:

```markdown
| `advice.tapForSound` | `Tap the video for sound.` | The clip autoplays muted, which is the only
autoplay an engine allows. Decision 10.9 makes the tap the unmute gesture, and this line names that
state while it holds. `advice.tapToMute` is its opposite number. |
```

Then add a section headed `## The override tables` stating that limelight and board are partial
`Partial<Record<CopyKey, string>>` tables merged over the default per key, that an unlisted key
falls through to the clinical string by design, and that the four rules at the head of
`copy.limelight.ts` bind both. State the limelight rule set in one line each rather than restating
the file.

- [ ] **Step 5: Add a decision header for every rule that changed**

The convention is one line immediately above the section, per the global instruction file:

```markdown
<!-- decision: copy-contract-no-pasted-key-list | status: adopted | supersedes: none -->
```

Add one for the pasted-block removal and one for any rule whose text changed. If R10's file name
change counts as a rule change, and it does, it gets one too:

```markdown
<!-- decision: r10-runbook-path | status: adopted | supersedes: none -->
```

- [ ] **Step 6: Run the three checks**

```bash
grep -oP "^  \| '\K[a-zA-Z0-9_.]+(?=')" docs/design/2026-09-01-copy-contract.md | sort > /tmp/contract.txt
comm -13 /tmp/shipped.txt /tmp/contract.txt
grep -nP "[\x{2013}\x{2014}]" docs/design/2026-09-01-copy-contract.md
awk 'BEGIN{RS="[.!?]"} { n=split($0, w, /[ \n]+/); if (n > 26) print FILENAME": "n" words: "$0 }' docs/design/2026-09-01-copy-contract.md | head
for p in $(grep -oP '`\K[a-z][a-zA-Z0-9_./-]*\.(ts|tsx|md|sh|mjs|json)(?=`)' docs/design/2026-09-01-copy-contract.md | sort -u); do [ -e "$p" ] || echo "MISSING: $p"; done
```

Expected: the first returns nothing; the second returns only R5's own rule text and numeric ranges
such as `6–8`; the third returns nothing; the fourth returns nothing.

- [ ] **Step 7: Commit**

```bash
git add docs/design/2026-09-01-copy-contract.md
git commit -m "docs(P9): the copy contract describes the tables that shipped"
```

---

## Task 19: Master plan drift

`docs/plans/2026-09-01-00-master-plan.md`, 649 lines. Eight recorded drifts across sections 3, 4, 5,
6.5, 6.7, 6.8 and 7. Section 10 is an amendment log, so entries append; sections 3 to 7 are
contracts, so entries replace.

**Files:**
- Modify: `docs/plans/2026-09-01-00-master-plan.md`

**Check, stated first:** after the edit, every signature in sections 5, 6.5, 6.7 and 6.8 matches the
shipped export byte for byte, checked one by one with the greps below. A signature that cannot be
matched is a signature that changed after the plan was written, and the plan text is what moves.

- [ ] **Step 1: Section 3 gains the no-user-agent-sniffing rule**

The rule exists in code and in section 10's P5 item 5 correction, and nowhere in section 3. Add to
the section 3 copy paragraph, as its own line:

```markdown
**Platform detection:** feature detection only. No code parses `navigator.userAgent`. The reminders
panel decides from `pushAvailability()` in `src/domain/reminders/client.ts`, which reads
`serviceWorker`, `PushManager` and `Notification`, and from `isInstalledPwa()`, which reads the
`(display-mode: standalone)` media query. A user-agent string tells a user their browser cannot do
something it can.
```

Verify the claim before writing it:

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
git grep -n "userAgent" -- src worker
```

Expected: no output outside a comment. If a hit appears, the rule is aspirational and must be
written as such.

- [ ] **Step 2: Section 4 file map**

Two edits. Delete the `legacy/` line: `git ls-files legacy` is empty as of `1311f84`, and section
10.11 records the deletion. Replace the `motivation/MotivationModal.tsx   P6` line with the six
files P6 amendment 8 asked for:

```
    motivation/MotivationModal.tsx MotivationGate.tsx MotivationSettings.tsx motivation.css   P6
```

and add `public/media/.gitkeep`, `docs/motivation-video.md` and `scripts/check-media-size.sh` to the
lines that list those trees. Verify each path exists:

```bash
for p in src/ui/motivation/MotivationModal.tsx src/ui/motivation/MotivationGate.tsx \
         src/ui/motivation/MotivationSettings.tsx src/ui/motivation/motivation.css \
         public/media/.gitkeep docs/motivation-video.md scripts/check-media-size.sh; do
  [ -e "$p" ] && echo "ok $p" || echo "MISSING $p"
done
```

- [ ] **Step 3: Section 5 `UiPrefs`**

```bash
grep -n "interface UiPrefs" src/domain/types.ts
sed -n '303p' docs/plans/2026-09-01-00-master-plan.md
```

The shipped interface at `types.ts:111` has `milestoneFloorByProfile: Record<string, number>;` and
`hotkeys: boolean;` that the plan line lacks, and the plan's trailing comment says
`skin default "clinical"` where `schema.ts:511` defaults it to `limelight`. Replace the plan line
with the shipped interface, and rewrite the comment to:
`skin default "limelight" (the user's choice, P8 Task 12); sounds default false; hotkeys default true; all Zod defaults, no version bump`.

- [ ] **Step 4: Section 6.5**

```bash
grep -n "interface ProgressionAdvice" -A 3 src/domain/training/progression.ts
grep -n "interface HydrationCue" -A 5 src/domain/training/hydration.ts
grep -n "preSessionMass\|SESSION_LOOKBACK_MS\|PRE_SESSION_MASS_WINDOW_MS" src/domain/training/hydration.ts | head
```

Replace the two interface blocks in section 6.5 with what those greps print. The recorded deltas are
`ProgressionAdvice.why`, `HydrationCue.message` typed as `CopyKey` rather than `string`, and the
three hydration exports the plan does not name. Also correct the progression rule sentence: the
mechanism is floor-then-floor-at-one-step, and 3.57 per cent is what a 5 lb step applies at 140 lb;
the plan text says "round up".

- [ ] **Step 5: Section 6.7**

```bash
sed -n '104,109p' src/store/funActions.ts
grep -n "undoAvailable\|setActiveAssignmentDate\|clearSessionSlice" src/store/*.ts | grep export | head
```

Three edits. Drop the `rng?: () => number` parameter from `attemptSpecimenDraw`: `funActions.ts`
takes three arguments and reaches no ambient randomness, per decisions 10.7 and 10.8. Add
`undoAvailable(now: EpochMs): boolean`, `setActiveAssignmentDate` and `clearSessionSlice` with the
signatures those greps print. Add one sentence: `addBonusExercise` and `addCustomExercise` throw on
a colliding id, and `AddCustomExercise.tsx` does not catch, which is unreachable through the UI
because the form mints the id.

- [ ] **Step 6: Section 6.8**

```bash
sed -n '450p' docs/plans/2026-09-01-00-master-plan.md
grep -n "export function pendingMotivation" -A 4 src/domain/motivation/trigger.ts
```

Replace the two-argument `pendingMotivation` with the shipped four-argument form and append the
sentence `Superseded by section 10.5, which bounds the window at MOTIVATION_MISS_WINDOW_DAYS = 14.`

- [ ] **Step 7: Section 7 gains a P9 row**

Append one row to the gates table:

```markdown
| P9 | copy | `npx vitest run src/content/copy.test.ts` passes; `node scripts/copy-wordcount.mjs` reports a default-table word total below the 2175 measured on 2026-09-02; `git grep` finds a call site for every key in `DEFAULT_COPY`; every path and command quoted in `docs/` resolves |
```

- [ ] **Step 8: Verify every edited signature against the tree**

```bash
npx tsc -b
for sym in pendingMotivation attemptSpecimenDraw undoAvailable hydrationCue suggestedProgression; do
  echo "=== $sym"; git grep -n "export function $sym" -- src
done
```

Expected: `tsc -b` silent, and each symbol found once. Compare each printed signature against the
plan line you wrote.

- [ ] **Step 9: Commit**

```bash
git add docs/plans/2026-09-01-00-master-plan.md
git commit -m "docs(P9): the master plan's contracts match the shipped signatures"
```

---

## Task 20: `05-reminders.md` drift

**Files:**
- Modify: `docs/plans/2026-09-01-05-reminders.md`

**Check, stated first:** the two lines the residual list names are replaced with text that matches
`src/config/reminders.ts` and master plan section 10's P5 item 11, and no other line in the file
claims something the tree contradicts. The verification is a targeted diff, not a re-read of 4300
lines.

- [ ] **Step 1: Line 1883, the API base**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
sed -n '1883p' docs/plans/2026-09-01-05-reminders.md
sed -n '20,70p' src/config/reminders.ts
```

The plan's Produces line names `REMINDER_API_BASE: string | null` and stops. Replace that fragment
with:

```
  - `src/config/reminders.ts`: `REMINDER_API_BASE: string | null` (the build variable resolved
    through `resolveReminderApiBase(raw, dev)`, which accepts a bare `https:` origin, accepts
    `http://localhost` and `http://127.0.0.1` only when `import.meta.env.DEV`, and returns null for
    everything else including a `javascript:` or `data:` URL and any userinfo; the rejected value is
    never logged, because it can carry a credential), `VAPID_PUBLIC_KEY: string | null`,
    `REMINDERS_CONFIGURED: boolean`, `SCHEDULE_HORIZON_DAYS = 21`, `SYNC_MAX_AGE_MS`,
    `MAX_INSTANTS = 200`, `MAX_HORIZON_MS`, `LEAD_MINUTE_CHOICES = [120, 60, 30]`,
    `DEFAULT_REMINDER_SETTINGS: ReminderSettings`
```

- [ ] **Step 2: Line 4292, the env block**

```bash
sed -n '4290,4300p' docs/plans/2026-09-01-05-reminders.md
```

The step says the `env:` block goes on "that step". Master plan section 10, P5 item 11, puts it at
job level: `scripts/check-dist-csp.sh` reads `VITE_REMINDER_API` itself, so a step-scoped variable
leaves its assertion inert. Rewrite the step to name the `verify` job in `ci.yml` and the `build`
job in `deploy.yml`, and confirm against what shipped:

```bash
grep -n "VITE_REMINDER_API" .github/workflows/ci.yml .github/workflows/deploy.yml
```

Expected: the variable appears under a job-level `env:` in both files. If it appears under a step,
the plan is right and the workflow is wrong; stop and report rather than editing either.

- [ ] **Step 3: Add an amendment note rather than rewriting history**

This plan document has no amendment log section. Append one at the end:

```markdown
## P9 corrections (2026-09-02)

Two lines were replaced rather than annotated, because both stated a contract another agent would
have implemented from the plan. Line 1883 understated the API base validation; the shipped
`resolveReminderApiBase` is quoted there now. Line 4292 placed the `env:` block on the build step;
master plan section 10, P5 item 11, puts it at job level, and both workflows do.
```

- [ ] **Step 4: Check the prose**

```bash
grep -nP "[\x{2013}\x{2014}]" docs/plans/2026-09-01-05-reminders.md | grep -v '[0-9]–[0-9]' | head
```

Expected: no new hits from the lines this task wrote. Pre-existing hits elsewhere in a 4300-line
plan document are out of scope and are recorded in Task 30.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-09-01-05-reminders.md
git commit -m "docs(P9): correct the API base validation and the env-block placement in P5"
```

---

## Task 21: `06-motivation-video.md` drift

**Files:**
- Modify: `docs/plans/2026-09-01-06-motivation-video.md`

**Check, stated first:** the plan's Task 4 no longer describes a `Play` button or a no-autoplay
modal, and the file cites decision 10.9 for what replaced them. Amendment 8 is marked landed and
names the six files, all of which resolve on disk.

- [ ] **Step 1: Line 811, the autoplay paragraph**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
sed -n '805,815p' docs/plans/2026-09-01-06-motivation-video.md
sed -n '590,592p' docs/plans/2026-09-01-00-master-plan.md
```

Replace the paragraph headed **Why the modal never autoplays** with:

```markdown
**Why the modal autoplays muted.** Superseded by master plan decision 10.9
(`motivation-muted-autoplay-tap-to-unmute`, adopted 2026-09-02). The clip carries `playsinline`,
`muted`, `autoplay` and `loop`, and no transport control. A tap on the element unmutes it, and
`advice.tapForSound` names that state while it holds. The draft below argued for a `Play` button;
decision 10.2 had already settled the dialog on one `Dismiss` control, and WebKit's iOS policy
permits a muted inline element to start with no gesture, so the clip is running before the user
decides whether to hear it. The `MotivationModalProps` block below is also stale: the shipped
component takes one `onDismiss`, not two callbacks.
```

Verify the props claim first:

```bash
grep -n "interface MotivationModalProps" -A 12 src/ui/motivation/MotivationModal.tsx
```

- [ ] **Step 2: Mark amendment 8 landed**

```bash
sed -n '1905p' docs/plans/2026-09-01-06-motivation-video.md
```

Append to that item: `Landed in the P9 pass; master plan section 4 now lists all six.` Do this only
after Task 19 Step 2 has committed, so the claim is true when it is written.

- [ ] **Step 3: Record the Task 4 draft supersession as an amendment**

Append to the file's own amendments section:

```markdown
11. **Task 4's draft is superseded by decision 10.9.** The draft specified no autoplay and a `Play`
    button. What shipped is a muted autoplay with tap-to-unmute and one `Dismiss`. The reason is in
    the decision; recorded here so a reviewer comparing the plan against `MotivationModal.tsx` reads
    it as a decision rather than as drift.
```

- [ ] **Step 4: Check the six paths and the prose**

```bash
for p in src/ui/motivation/MotivationModal.tsx src/ui/motivation/MotivationGate.tsx \
         src/ui/motivation/MotivationSettings.tsx src/ui/motivation/motivation.css \
         public/media/.gitkeep docs/motivation-video.md scripts/check-media-size.sh; do
  [ -e "$p" ] || echo "MISSING $p"
done
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-09-01-06-motivation-video.md
git commit -m "docs(P9): P6's Task 4 draft is superseded by decision 10.9"
```

---

## Task 22: `07-log-export-migration-cutover.md` drift

**Files:**
- Modify: `docs/plans/2026-09-01-07-log-export-migration-cutover.md`

**Check, stated first:** the four interface fragments this task rewrites match the shipped exports,
verified one by one. The plan is 4900 lines and only these four fragments are in scope.

- [ ] **Step 1: The `MigrateV2Result` shape, lines 1451 and 2427**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
sed -n '1450,1454p;2425,2429p' docs/plans/2026-09-01-07-log-export-migration-cutover.md
sed -n '111,118p' src/domain/migrations/v2.ts
```

Both plan fragments declare `interface MigrateV2Result { state: AppState; report: MigrationReport }`.
The shipped type at `v2.ts:111` is a discriminated union:

```ts
export type MigrateV2Result =
  | { ok: true; state: AppState; report: MigrationReport }
  | { ok: false; reason: string };

export type ApplyMigrationResult =
  | { ok: true; state: AppState; skipped: MigrationSkip[] }
  | { ok: false; reason: string };
```

Replace both fragments with that block. The reason it changed: `migrateV2` must never throw, and an
unknown IANA zone has to arrive as a value rather than as an exception.

- [ ] **Step 2: `MigrateV2Options`, line 2465 and around**

```bash
sed -n '71,84p' src/domain/migrations/v2.ts
```

The plan's Task 3 interface omits `opts.units` and `opts.bodyMassUnits`. Paste the shipped
`MigrateV2Options` block in place of the plan's, keeping the plan's surrounding prose.

- [ ] **Step 3: The `ConfirmDestructive` shape, Task 6**

```bash
grep -n "ConfirmDestructive" docs/plans/2026-09-01-07-log-export-migration-cutover.md | head
sed -n '8,60p' src/ui/components/ConfirmDestructive.tsx
```

The plan's draft has no `titleKey`. The shipped props are
`{ titleKey, word, exportLabelKey, exportFilename, exportText, confirmLabelKey, onConfirm, onCancel }`,
and `titleKey` is required because two panels can be on screen at once. Replace the draft and add one
sentence naming that reason.

- [ ] **Step 4: The persistence names**

```bash
sed -n '103p;2111p' docs/plans/2026-09-01-07-log-export-migration-cutover.md
grep -n "^export function readLegacy\|^export function deleteLegacy\|^export function hasLegacy" src/store/persistence.ts
```

The plan names `readLegacyV2`, `hasLegacyV2`, `deleteLegacyData`. The exports are `readLegacyV2Raw`,
`readLegacyBundle`, `hasLegacyV2`, `deleteLegacyV2`. Replace both plan lines, and add that
`readLegacyBundle()` returns a JSON envelope of all three legacy keys, which is what the wipe and
the wizard both export.

- [ ] **Step 5: The download filename, line 4962**

```bash
sed -n '4960,4964p' docs/plans/2026-09-01-07-log-export-migration-cutover.md
grep -n "fti-state-" src/ui/views/ExportView.tsx src/ui/settings/DataSection.tsx
```

The plan writes `fti-state-before-wipe.json`; both call sites use `fti-state-${stamp}.json`. Replace
the plan line, and add a sentence: the stamped form is the convention, and `App.tsx` and
`RootErrorBoundary.tsx` still write `fixthisinjustice-export.json` and
`fixthisinjustice-recovery.json`, which are the crash-path names and stay distinct on purpose.

- [ ] **Step 6: Append a corrections note**

```markdown
## P9 corrections (2026-09-02)

Five interface fragments were replaced with the shipped declarations: `MigrateV2Result` and
`ApplyMigrationResult` (both discriminated unions, so `migrateV2` never throws), `MigrateV2Options`
(gained `units` and `bodyMassUnits`), `ConfirmDestructive` (gained the required `titleKey`), and the
three legacy persistence exports (`readLegacyV2Raw`, `readLegacyBundle`, `deleteLegacyV2`). The
wipe's download filename is the stamped form.
```

- [ ] **Step 7: Verify every fragment against the tree**

```bash
npx tsc -b
grep -c "MigrateV2Result" docs/plans/2026-09-01-07-log-export-migration-cutover.md
grep -c "deleteLegacyData" docs/plans/2026-09-01-07-log-export-migration-cutover.md
```

Expected: `tsc -b` silent, and `deleteLegacyData` at 0.

- [ ] **Step 8: Commit**

```bash
git add docs/plans/2026-09-01-07-log-export-migration-cutover.md
git commit -m "docs(P9): P7's interfaces match the shipped migration and persistence exports"
```

---

## Task 23: `08-fun-mechanics.md` drift

**Files:**
- Modify: `docs/plans/2026-09-01-08-fun-mechanics.md`

**Check, stated first:** the three personal-data greps in the plan use the one-character-class form,
so the pattern no longer matches its own definition; the draw pseudocode matches `funActions.ts`;
and the amendments section carries the six items the close-outs produced. The grep form is checkable
by running it.

- [ ] **Step 1: The self-matching greps, lines 31, 833 and 4834**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
sed -n '31p;833p;4834p;8306p' docs/plans/2026-09-01-08-fun-mechanics.md
```

Lines 31, 833 and 4834 write `'vyvanse|lisdexamfetamine|ymca|amphetamine'`. Line 8306 already uses
the bracketed form the master plan and both workflows use. Change the three to match line 8306:

```
git grep -nEi 'vyvans[e]|lisdexamfetamin[e]|ymc[a]|amphetamin[e]' -- 'src/' 'worker/' 'public/' 'index.html'
```

Prove the fix by running the corrected line against the tree:

```bash
git grep -nEi 'vyvans[e]|lisdexamfetamin[e]|ymc[a]|amphetamin[e]' -- 'src/' 'worker/' 'public/' 'index.html'
```

Expected: no output.

- [ ] **Step 2: The draw pseudocode, lines 2053 to 2058**

```bash
sed -n '2050,2060p' docs/plans/2026-09-01-08-fun-mechanics.md
sed -n '160,186p' src/store/funActions.ts
```

The plan calls `drawSpecimen(inventory, SPECIMEN_CARDS, rng, SPECIMEN_DROP_CHANCE)` with
`rng = systemRng`. The shipped action takes three arguments and goes through
`drawSpecimenForLoggedSet`, seeded from stored state, so a replay returns the card that ordinal
already produced. Replace the block with the shipped body and cite decisions 10.7 and 10.8.

- [ ] **Step 3: Amendments 2 and 5**

```bash
sed -n '8477,8496p' docs/plans/2026-09-01-08-fun-mechanics.md
```

Amendment 2 asks master plan section 6.7 to add the `rng` parameter; that parameter does not exist.
Amendment 5 says `skin` defaults to `clinical`; `schema.ts:511` defaults it to `limelight`. Append a
correction line to each rather than editing the request, because the amendments section is a record
of what was asked:

```markdown
   **Corrected 2026-09-02 (P9):** the shipped action takes three arguments. Ambient randomness was
   removed entirely (decisions 10.7 and 10.8), so there is no `rng` parameter to default.
```

```markdown
   **Corrected 2026-09-02 (P9):** `skin` ships defaulting to `limelight`, which is the user's own
   choice, not `clinical`. `schema.ts:511` and `types.ts:111` are the record.
```

- [ ] **Step 4: Add the six close-out amendments**

Append items 11 to 16 to the same section, each one sentence, each verified before it is written:

11. Task 6's boot sequence carries no display name, no zone and no `session n of N`; it prints the
    week instead. Generic by design, per the security constraint on personal data in a boot log.
12. Task 9's hotkeys shipped with week-based plan browsing, no `PlanBrowseProvider`, the Escape and
    `t` bindings dropped, and the digit bindings renumbered.
13. G12's wording in the gate table is "registering the same combo twice in one scope throws"; the
    shipped invariant is that one listener holds every binding, and the registry rejects a
    duplicate.
14. Task 12 places the skin row above the data row in `SETTINGS_ROWS`, so the wipe stays last.
15. The Atlas test ids were renamed to `atlas-count-*`.
16. `logSet` returns `LogSetResult { id, specimen }` rather than a bare id string.

Verify 14 and 16 before writing them:

```bash
grep -n "id: '" src/ui/views/SettingsView.tsx
grep -n "LogSetResult" src/store/training.ts src/domain/types.ts | head
```

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-09-01-08-fun-mechanics.md
git commit -m "docs(P9): P8's greps, draw pseudocode and amendments match what shipped"
```

---

## Task 24: `docs/RUNBOOK-reminders.md`

493 lines. R10 exempts the runbook from the length rules and does not exempt it from being accurate.

**Files:**
- Modify: `docs/RUNBOOK-reminders.md`

**Check, stated first:** every status string the runbook quotes appears verbatim in
`src/content/copy.ts`, and the count it claims matches the number of `status.reminders*` keys. Both
are greps.

- [ ] **Step 1: Compare the quoted strings against the table**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
grep -n "'status.reminders" src/content/copy.ts | grep "':" 
sed -n '348,360p' docs/RUNBOOK-reminders.md
sed -n '415,420p' docs/RUNBOOK-reminders.md
```

Expected: 8 keys in the table against 7 strings listed in section 12, and one quoted string at line
417 that no key carries.

- [ ] **Step 2: Fix the count and add the eighth string**

Change "exactly one of seven strings" to "exactly one of eight strings" and add:

```markdown
- `Reminders need enabling again on this device.`
```

with one sentence after the list: the reminder preference travels with an exported document and the
push subscription does not, because it is a bearer credential the export withholds. On the restoring
device the panel names the device and the action, because nothing recovers on its own. The key is
`status.remindersNeedReenable` and `ReminderSettingsPanel.tsx:44` maps it.

- [ ] **Step 3: Fix the troubleshooting quote at line 417**

`Reminders are not configured in this build.` is not a shipped string. Replace it with
`Reminders are not set up on this deployment.`, which is what `copy.ts:862` holds.

- [ ] **Step 4: Fix the install-steps claim at line 362**

The runbook says "These four steps are the ones the in-app install guide gives" and then gives six,
the first quoting a URL the guide does not carry. `InstallGuide.tsx` renders four iOS steps:
`Open this page in Safari.`, `Tap Share, the square with an upward arrow.`,
`Scroll down, tap Add to Home Screen, then tap Add.`, `Open the app from the Home Screen icon.`
Rewrite the lead-in to say that steps 1 to 4 are the guide's, quote the guide's step 1 verbatim, and
put the deployment URL in the sentence before the list where it belongs.

- [ ] **Step 5: Sweep every quoted string in the file against the table**

```bash
grep -oP '^\s*[-|].*`\K[A-Z][^`]{10,}(?=`)' docs/RUNBOOK-reminders.md | sort -u | while read -r s; do
  grep -qF "$s" src/content/copy.ts || echo "NOT IN TABLE: $s"
done
```

Expected: no output, or output naming strings that are Worker log lines rather than app copy. Check
each hit before dismissing it.

- [ ] **Step 6: Check the prose**

```bash
grep -nP "[\x{2013}\x{2014}]" docs/RUNBOOK-reminders.md
awk 'BEGIN{RS="[.!?]"} { n=split($0, w, /[ \n]+/); if (n > 26) print n" words: "$0 }' docs/RUNBOOK-reminders.md | head
```

Expected: no dashes; no sentence over 25 words in the sections this task wrote.

- [ ] **Step 7: Commit**

```bash
git add docs/RUNBOOK-reminders.md
git commit -m "docs(P9): the runbook quotes the eight status strings that shipped"
```

---

## Task 25: `docs/sfx.md`

161 lines. Two claims contradict the call sites and one names a limelight string as though it were
the default.

**Files:**
- Modify: `docs/sfx.md`

**Check, stated first:** the "Fires when" column matches the four `playSfx` call sites, and the
toggle's location names the default string. Both are greps.

- [ ] **Step 1: Read the four call sites**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
git grep -n "playSfx(" -- src | grep -v test
sed -n '280,290p' src/ui/views/TrainView.tsx
sed -n '70,82p' src/ui/components/WeekStamp.tsx
```

Expected: `session_done` at `TrainView.tsx:284` behind `if (ended?.status === 'completed')`;
`pr_stamp` at `WeekStamp.tsx:79` when the stamp appears; `rest_over` at `RestTimerPanel.tsx:121`;
`intervention_open` at `Intervention.tsx:60`.

- [ ] **Step 2: Correct the table's two wrong rows**

`session_done` fires when the session is completed, not when the last set is logged. A user can log
the last set and leave without completing. `pr_stamp` fires when the week stamp appears, which is a
met or beaten week, not a set that beats a record. Rewrite both cells and add the call site to each
so the next reader can check it in one grep.

- [ ] **Step 3: Correct the toggle's location, line 47**

The row is `label.settingsSkin`, whose default string is `Skin` and whose limelight string is
`the look`. Rewrite: `Settings turns them on, in the skin row (`label.settingsSkin`), which the
limelight skin titles "the look".`

- [ ] **Step 4: Verify the three-unlock claim**

```bash
git grep -n "useFirstGestureUnlock\|unlock(" -- src/skins/sfx.ts src/ui/settings/SkinSettings.tsx | head
```

Expected: the first-gesture hook, the sounds checkbox and the skin picker. If a fourth appears, add
it; if one is missing, remove the claim.

- [ ] **Step 5: Check the prose and the paths**

```bash
grep -nP "[\x{2013}\x{2014}]" docs/sfx.md
for p in $(grep -oP '`\K[a-z][a-zA-Z0-9_./-]*\.(ts|tsx|sh|mjs|yml|m4a)(?=`)' docs/sfx.md | sort -u); do
  case "$p" in *.m4a) continue;; esac; [ -e "$p" ] || echo "MISSING: $p"
done
```

Expected: no dashes; no missing paths. `.m4a` paths are examples and are skipped.

- [ ] **Step 6: Commit**

```bash
git add docs/sfx.md
git commit -m "docs(P9): the sfx page names the call sites that actually fire"
```

---

## Task 26: `docs/review/2026-09-01-security-review.md`

860 lines. The I4 addendum is present and correct. Its closing residual is stale, and two findings
cite a tree that was deleted.

**Files:**
- Modify: `docs/review/2026-09-01-security-review.md`

**Check, stated first:** no finding cites a path that neither exists nor says where it is reachable,
and the addendum's residual matches what `ReminderSettingsPanel.tsx` does today.

- [ ] **Step 1: Close the addendum's residual**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
sed -n '856,860p' docs/review/2026-09-01-security-review.md
grep -n "needs-reenable" src/ui/components/ReminderSettingsPanel.tsx
```

The addendum says an imported document reports "Reminders are on. Schedule not sent yet." until the
user toggles. `ReminderSettingsPanel.tsx:44` now maps `needs-reenable` to
`status.remindersNeedReenable`. Replace the residual paragraph:

```markdown
Closed 2026-09-02 in `02dee88`. An imported document that carries `reminderSettings.enabled = true`
with no device now reads `Reminders need enabling again on this device.` The panel names the device
and the action, because no subscription exists and nothing is queued.
```

- [ ] **Step 2: Annotate H2 and M5, which cite a deleted tree**

```bash
sed -n '162,166p;468,472p' docs/review/2026-09-01-security-review.md
git ls-files legacy | wc -l
```

Expected: 0 tracked files under `legacy/`. Both findings quote `console-app.jsx` and
`console-store.jsx`. Add one line under each finding's first code fence, in the form
`src/domain/migrations/v2.ts` already uses after `1311f84`:

```markdown
> The legacy tree was deleted in `1311f84`. This file is reachable at
> `git show 1311f84^:console-app.jsx`.
```

Do not rewrite the findings. A security review is a record of what was found on a date, and its
citations are evidence.

- [ ] **Step 3: Sweep every legacy path in the file**

```bash
grep -oP '`\K(console-[a-z]+\.jsx|core\.jsx|data\.js|legacy/[a-zA-Z0-9_./-]+)(?=`)' docs/review/2026-09-01-security-review.md | sort -u
```

For each name, confirm the file has a reachability note somewhere in the section that cites it. Add
one where it does not, using the same `git show 1311f84^:<path>` form.

- [ ] **Step 4: Check the prose of the lines this task wrote**

```bash
git diff -- docs/review/2026-09-01-security-review.md | grep '^+' | grep -P "[\x{2013}\x{2014}]"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add docs/review/2026-09-01-security-review.md
git commit -m "docs(P9): the security review's citations say where the deleted tree lives"
```

---

## Task 27: `README.md` and `docs/motivation-video.md`

`README.md` is 137 lines and was written in `1bfdcaa` with two corrections in `e78be69`.
`docs/motivation-video.md` is 156 lines and was corrected in the same commit. Both are the documents
a new reader meets first, so both get a full pass rather than a targeted diff.

**Files:**
- Modify: `README.md`
- Modify: `docs/motivation-video.md`

**Check, stated first:** every path the two files name resolves; every command runs; every claim
about a default matches the schema; no sentence exceeds 25 words; no dash appears outside a numeric
range. The P7 close-out measured the longest README sentence at 24 words, so that gate already held
once and must still hold.

- [ ] **Step 1: Resolve every path**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
for f in README.md docs/motivation-video.md; do
  echo "=== $f"
  grep -oP '`\K[a-z][a-zA-Z0-9_./-]*\.(ts|tsx|md|sh|mjs|json|yml|css|html)(?=`)' "$f" | sort -u | while read -r p; do
    [ -e "$p" ] || echo "MISSING: $p"
  done
done
```

Expected: no output.

- [ ] **Step 2: Run every command the README lists**

```bash
npm run typecheck && npm run lint && npm test 2>&1 | tail -3
```

Expected: all three succeed. Do not run `npm run test:tz`, which is four full suites and approaches
the 20-minute cap; the README's claim about it is checked by CI.

- [ ] **Step 3: Check the defaults the README asserts**

```bash
grep -n "limelight" README.md
grep -n "z.enum(\['clinical', 'limelight', 'board'\])" src/domain/schema.ts
grep -n "sounds:" src/domain/schema.ts | head -2
```

The README says limelight is the default. Confirm against `schema.ts:511`. If the README says
anything about sounds being on, it is wrong: the default is false.

- [ ] **Step 4: Check the prose of both files**

```bash
for f in README.md docs/motivation-video.md; do
  echo "=== $f"
  grep -nP "[\x{2013}\x{2014}]" "$f"
  awk 'BEGIN{RS="[.!?]"} { n=split($0, w, /[ \n]+/); if (n > 26) print n" words: "$0 }' "$f"
done
```

Expected: no dashes and no sentence over 25 words. Fix any hit by splitting the sentence, not by
deleting a fact.

- [ ] **Step 5: Cut what the reader does not need**

Governing sentence 1 applies to documentation as well as to the app. Cut any paragraph that
describes how the app was built rather than how it is used or run. Keep every paragraph a user or a
maintainer would need. `docs/motivation-video.md` cites the P8 plan by line number for its media
format; replace those citations with a citation of master plan decision 10.10, which is stable and
does not move when a plan document is edited.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/motivation-video.md
git commit -m "docs(P9): a prose pass over the README and the motivation-clip page"
```

---

## Task 28: The visual pass on a phone

**Nothing in this session measured a pixel.** Every layout claim in this repository comes from
jsdom, which renders no geometry, or from a design document. The marquee, the stamp, the
intervention CSS, the Atlas grid, the boot line width, the Konami overlay and the toast stack have
never been seen on a device by any agent. This task is the user's own, and it cannot be delegated.

**Files:**
- None. The output is the user's marks on the checklist below, which Task 30 records.

**Check, stated first:** one pass on an iPhone and one on an Android phone, both from the installed
app rather than a browser tab, with the limelight skin selected. Each row below gets a verdict.

- [ ] **Step 1: Install and open**

Add the site to the Home Screen and open it from the icon. A browser tab has different safe-area
insets and different viewport units, so a tab pass does not substitute.

- [ ] **Step 2: Walk the checklist**

| What | Where | What would be wrong |
| --- | --- | --- |
| Limelight tokens | every screen | pink type on lime, which is 1.41:1 and unreadable; only the outline should carry a silhouette |
| Marquee | Today, the ticker strip | text that clips at the screen edge, or a strip that keeps scrolling while a popup is open |
| Week stamp | Today, after a week closes | a stamp that overlaps the session card, or one that appears while a missed-week popup is pending |
| Atlas grid | Atlas | cards that reflow to one column below 360 px, or a locked slot with no accessible name |
| Boot line width | first open after a wipe | a line longer than the viewport; the boot line is 36 characters, about 276 px at 12.8 px mono, and is meant to overrun a 320 px phone into a horizontal scroll |
| Konami overlay | the Konami sequence | an overlay that does not cover the screen, or one that traps focus with no way out |
| Toast stack | log a set, then delete it | toasts that stack off-screen, or an undo toast whose deadline passes with the toast still up |
| Settings order | Settings | the wipe control anywhere but last |
| Rest timer | mid-session | a countdown that freezes when the screen locks |
| Safe area | every screen | content under the notch or under the home indicator |

- [ ] **Step 3: Report**

Write the verdicts anywhere convenient and hand them back. A row that fails becomes a task; a row
that passes is the first geometric evidence this project has.

---

## Task 29: Refresh the knowledge graph

Task 18 adds decision headers to the copy contract, and the global instruction file requires
`graphify <path> --update` after a decision header changes. Master plan section 10.11 records that
the last regeneration was partial and that the manifest was not saved, so the next `--update` still
sees 46 documents and images as changed.

**Files:**
- Modify: `graphify-out/graph.json`, `graphify-out/graph.html`, `graphify-out/GRAPH_REPORT.md`,
  `graphify-out/cost.json`

**Check, stated first:** after the run, `graphify-out/graph.json` contains a node for every decision
header this pass added, and no node is sourced from a path that no longer exists. Both are greps
over the JSON. The run must not exceed 20 minutes; time it and stop it if it does.

- [ ] **Step 1: Count the decision headers before the run**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
grep -rhoP '<!-- decision: \K[a-z0-9-]+' docs/ | sort -u | tee /tmp/headers.txt | wc -l
```

Expected: the ten headers 10.1 to 10.10 plus the ones Task 18 added.

- [ ] **Step 2: Run the update, timed**

```bash
time graphify . --update 2>&1 | tail -20
```

Expected: completion inside 20 minutes. If the semantic pass over the changed documents would take
longer, interrupt it, run `graphify docs/design/2026-09-01-copy-contract.md --update` alone, and
record the partial state in `graphify-out/cost.json` exactly as section 10.11 did.

- [ ] **Step 3: Verify every header reached the graph**

```bash
while read -r h; do
  grep -q "\"$h\"" graphify-out/graph.json || echo "MISSING NODE: $h"
done < /tmp/headers.txt
```

Expected: no output.

- [ ] **Step 4: Verify no node cites a deleted path**

```bash
grep -oP '"source":\s*"\K[^"]+' graphify-out/graph.json | sort -u | while read -r p; do
  [ -e "$p" ] || echo "STALE SOURCE: $p"
done | head -20
```

Expected: no output. A hit under `legacy/` means the prune in `68870ca` did not reach it.

- [ ] **Step 5: Commit**

```bash
git add graphify-out/graph.json graphify-out/graph.html graphify-out/GRAPH_REPORT.md graphify-out/cost.json graphify-out/manifest.json
git commit -m "chore(P9): regenerate the tracked graph after the contract's decision headers"
```

`graphify-out/cache/` stays ignored.

---

## Task 30: Close out P9

**Files:**
- Modify: `docs/plans/2026-09-01-00-master-plan.md` (section 10, append only)

**Check, stated first:** the close-out states measured numbers, not estimated ones, and its
"what was not done" list names every item this plan knowingly left open. Every number in it comes
from a command run in this task, not from a memory of an earlier task.

- [ ] **Step 1: Measure everything the close-out will claim**

```bash
cd /home/vx/Desktop/Claude/FixThisInjustice
node scripts/copy-wordcount.mjs 2>/dev/null | grep -E '^(== |TOTAL)'
npx vitest run 2>&1 | tail -5
npx tsc -b && echo "typecheck clean"
npx eslint . && echo "lint clean"
npx vite build 2>&1 | tail -3
scripts/check-dist-csp.sh dist/index.html && echo "csp gate passed"
git log --oneline e107036..HEAD | wc -l
```

Record every figure. The baseline to compare against is 522 keys and 2175 words, measured
2026-09-02 before this pass began.

- [ ] **Step 2: Append the P9 close-out to section 10**

Append only. Do not edit an existing entry and do not reorder the section.

```markdown
### 10.12 P9 close-out (2026-09-02)

The prose pass is done. The default copy table went from 522 keys and 2175 words to <N> keys and
<M> words. <K> keys nothing rendered were retired, and 22 hardcoded twins in `App.tsx`,
`UpdatePrompt.tsx` and `RootErrorBoundary.tsx` now read the table. The copy contract describes the
tables that shipped rather than the ones the P2 sweep froze. Five plan documents and five reference
documents were corrected against the tree.

Gates: `npx vitest run` passes <T> tests across <F> files; `npx tsc -b`, `npx eslint .` and
`npx vite build` are clean; `scripts/check-dist-csp.sh dist/index.html` passes;
`node scripts/copy-wordcount.mjs` reports the totals above.

Commits, in order: <list>.

**What was not done.**

- **No pixel was measured.** No agent in this session or any earlier one rendered this app on a
  device. Every layout claim in this repository comes from jsdom, which renders no geometry, or
  from a design document. Task 28's checklist is the user's own and was not executed here. The
  marquee, the week stamp, the intervention CSS, the Atlas grid, the boot line width, the Konami
  overlay, the toast stack and the safe-area insets are all unverified.
- **The limelight register was not settled.** `docs/design/2026-09-02-limelight-side-by-side.md`
  is a page for the user to mark up. Until it comes back marked, the table is the model's taste,
  not the user's.
- **Em-dashes in code comments were not swept.** One was fixed, at
  `src/domain/migrations/index.ts:49`, because the residual list named it. `git grep -cP
  "[\x{2013}\x{2014}]" -- src` finds them in about 30 other modules. They are comments, not shipped
  copy, and R5 binds copy. A sweep would be a large diff for no user-visible change and was not
  attempted.
- **No monochrome badge icon exists.** `src/sw.ts:75` points `badge` at `icons/icon-192.png`, and
  Android masks a badge to a monochrome silhouette, so a coloured icon arrives as a blob. A 96 px
  monochrome PNG is still needed.
- **Four untracked probe test files sit in the tree**, left by a reviewer:
  `src/app/zzP7Probe.test.tsx`, `src/domain/export/zzP7Probe2.test.ts`,
  `src/ui/settings/zzP7Probe3.test.tsx`, `src/ui/components/zzP7Probe4.test.tsx`. They were not
  deleted, because reviewers were running when this pass ran and the files may be theirs.
- **`0fa62cb` is still mislabelled.** Its message describes a toast fix and its content is a
  runbook one-liner, a consequence of the `--amend` incident. History was left as it is.
- **The three design rows with no renderer were kept, not wired.** `status.planProgress`,
  `status.prReached` and `toast.setDeleted` carry skin rows and sit in the `copy.test.ts` REQUIRED
  list, and nothing renders them. The missing call sites are a task, not a leak.
- **`R7` and `R11` are still not machine-checked**, and neither is the round-three tone rule. All
  three are judgements about meaning, and `copy.test.ts` says so in its closing comment. They stay
  with review.
- **The cutover has not run.** Master plan section 10.11 records that this clone has no git remote,
  so nothing was pushed and no Pages deployment exists. `docs/DEPLOY-CUTOVER-NOTE.md` is the
  checklist.
```

- [ ] **Step 3: Fill every angle bracket with a measured number**

```bash
grep -n "<N>\|<M>\|<K>\|<T>\|<F>\|<list>" docs/plans/2026-09-01-00-master-plan.md
```

Expected: no output. A placeholder left in a close-out is a false record.

- [ ] **Step 4: Check the prose**

```bash
git diff -- docs/plans/2026-09-01-00-master-plan.md | grep '^+' | grep -P "[\x{2013}\x{2014}]"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-09-01-00-master-plan.md
git commit -m "docs(P9): append the P9 close-out to the master plan amendment log"
```

---

## Self-review

**Spec coverage.** The brief's ten sections map to tasks as follows. Section 1 (default-table prose
pass) is Tasks 1 to 11, one per key family with the harness first. Section 2 (limelight) is Tasks 12
and 13, and Task 13 is the page the user marks up, because the register is theirs. Section 3 (board)
is Task 14. Section 4 (dead keys and twins) is Tasks 15, 16 and 17. Section 5 (copy contract) is
Task 18. Section 6 (plan-document drift) is Tasks 19 to 23, one per plan file. Section 7 (doc drift)
is Tasks 24 to 27. Section 8 (visual pass) is Task 28. Section 9 (graph) is Task 29. Section 10
(close-out) is Task 30.

**Placeholder scan.** No task says "handle edge cases", "add appropriate validation" or "similar to
Task N". Task 30 contains six angle-bracket slots on purpose, and its Step 3 is a grep that fails
until every one is filled with a measured number.

**Type consistency.** The signatures named across tasks are the shipped ones, each verified with a
grep quoted in the task that names it: `MigrateV2Result` and `ApplyMigrationResult` as discriminated
unions (`v2.ts:111`), `attemptSpecimenDraw` with three parameters (`funActions.ts:104`),
`pendingMotivation` with four (decision 10.5), `ConfirmDestructive` with a required `titleKey`
(`ConfirmDestructive.tsx:22`), `readLegacyV2Raw` / `readLegacyBundle` / `hasLegacyV2` /
`deleteLegacyV2` (`persistence.ts`), and `UiPrefs` with `milestoneFloorByProfile` and `hotkeys`
(`types.ts:111`).

**Ordering.** Task 1 precedes every copy task, because they all quote its output. Task 15 precedes
Task 16, because the twin conversion removes 22 keys from the dead list. Task 18 precedes Task 29,
because the graph refresh exists to pick up the contract's new decision headers. Task 19 Step 2
precedes Task 21 Step 2, because that step marks an amendment landed and the claim must be true when
it is written. Everything else is independent and may run in any order.
