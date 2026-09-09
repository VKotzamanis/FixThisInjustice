# Brief N: the agent's report, captured

Wave 2. Claims r2.05, r2.09 and `r2-onboarding.general`.

**Branch `worktree-agent-af85b546ca8c9a7ac`, commit `53db114`, parent `82e4a06`.**

**NOT VERIFIED BY THE ORCHESTRATOR.** Every figure below is the agent's own claim. The session was
paused before the gate re-run. Re-run all seven gates on the branch before merging, and do not
treat this file as evidence — three of five round-1 reports claimed passes that were not real.

---

## The base defect, resolved by the agent itself

The worktree branched from `739b88e`, which predates brief K. The agent read `NEXT-AGENT.md` §2.1,
found `SetupDraft` had no `buffer` and `Sex` had no `nd`, and ran `git merge --ff-only main`, which
was clean because the branch had no commits of its own. **Everything it did is against merged
`main`.** §2.1's merge-main-in instruction is therefore already satisfied for N.

## Files changed

| Path | What |
| --- | --- |
| `src/domain/dates.ts` | `zoneOffsetMinutes`, `utcGmtOffsetLabel`, `zoneYearSignature`, `TimeZoneGroup`, `groupTimeZones`, `promoteSelectedZone`, `zoneGroupMatches`, `matchedZoneMembers`, `PROMINENT_ZONES` |
| `src/domain/timeZoneGroups.test.ts` | New, 28 tests, fixed clocks six months apart |
| `src/content/copy.ts` | 14 keys, 3 FORMAT frames: `bannerName`, `timeZoneOption`, `timeZoneAlso` |
| `src/ui/nav/views.ts` | `VIEW_TITLES: Record<ViewId, CopyKey>` |
| `src/ui/setup/setupBanner.tsx` | New, bridges wizard state to the header |
| `src/app/App.tsx` | `TopbarTitle`, `TopbarSkinPicker`, `SetupBannerProvider` |
| `src/app/appShell.css` | `.topbar-title`, `.topbar-skin`, `.topbar-skin-panel` |
| `src/ui/setup/SetupWizard.tsx` | Publishes banner state; time-zone step rebuilt |
| `src/ui/setup/setup.css` | `.wiz-tz-why`, `.wiz-box-title`, `.wiz-tz-why-list`, `.wiz-tz-primary` |
| `src/app/App.test.tsx` | +13 tests |
| `src/ui/setup/SetupWizard.test.tsx` | +11 tests, 1 existing test updated |
| `scripts/alpha-parts.mjs`, `scripts/alpha-walk.mjs` | `shell.topbar`, `setup.timezone`; steps `w1.05`, `w1.09` |
| `docs/feedback/catalogue.{json,md}`, `walk/w1-first-open.html` | Regenerated |

## Gate results it reported

`tsc -b --force` exit 0. `vitest run` **124 files, 2514 tests**, exit 0. `check-no-emoji` clean.
`check-title-case` **139 of 233** — failures unchanged, pool grew by its four naming keys. Both
catalogue checks PASS, 543 keys placed.

`npx eslint .` reports **24 errors, all in `worker/`**. The agent stashed its whole change and
re-ran on the untouched tree to prove they pre-date it. `npx eslint ./src ./scripts` is clean.
This matches what brief K found. **Confirm the stash test rather than believing it.**

## What it left undone, and one of these is a live defect

- **`src/ui/views/SettingsView.tsx:110-117` still builds all 418 zones in IANA alphabetical order
  with the old `(UTC+02:00)` label.** That is the r2.09 defect, still shipping on the Settings
  screen. The file is not in brief N and rule 5 says stop rather than edit it, so it stopped.
  `groupTimeZones` is ready for it. **This needs a claim of its own or a line in another brief.**
- No `docs/phone-visual-check.md` row for the new top-bar control or the box.
- The skin disclosure shows `SkinSettings` whole, including the sounds and hotkeys switches,
  because splitting it would mean editing an unlisted file.

## Departures from the brief, in its own account

- **The brief's eleven non-whole-hour offsets is the standard-time set. Across the whole year
  there are thirteen** — Newfoundland `-02:30` and Adelaide `+10:30` are daylight offsets no
  January sample sees. Nothing depends on the count; both are pinned in the suite. It strengthens
  rather than weakens the never-build-a-picker-from-an-hour-loop ruling.
- **Banner follows `buffer ?? committed`.** Re-asked against K's real code. That is what the name
  field's own `value` renders from, so the two cannot disagree; the committed tier alone lags a
  step and the buffer alone blanks on every Next. Asserted by a test, plus one that a name
  containing `$&` renders verbatim.
- One existing test updated: the zone-select assertion moved from `(UTC+03:00) Europe/Athens` to
  `(UTC/GMT+03:00) Europe/Athens, 15 more`, which is the label r2.09 asked for.
- `advice.timezonePick` moved, not rewritten — it says "Select from the drop down menu:" and now
  sits above the list rather than above the search box, which is not a menu.
- `VIEW_TITLES` points at the existing `nav.*` keys rather than seven new ones, so a view has one
  name and renaming it stays one edit.
- Representative city chosen from a ~40-entry `PROMINENT_ZONES` list, then a deterministic
  fallback. **No population figures recorded or invented**; a test asserts every row is named
  after one of its own members.
- One `eslint-disable-next-line react-hooks/exhaustive-deps` on the grouping memo, reason inline:
  `draft.timezone` in the deps would re-run 5016 offset lookups per keystroke.

## What it claims to have re-measured rather than trusted

418 zones to **59** behaviours, stable across the 1st and 15th in 2026 and 2027. **37** January
offsets, **16** splitting by July. New York's group is not Panama's. The European group is 33,
including Ceuta and Longyearbyen. Span -660 to +840 minutes, 25 hours. All asserted in the suite.

## The verification still owed

Nothing here has been checked. Run in the worktree: `tsc -b --force`, `eslint ./src ./scripts`,
`vitest run`, `check-no-emoji.mjs`, `check-title-case.mjs`, both catalogue checks, and the
personal-data grep. Then check what no gate can: that the `PROMINENT_ZONES` list contains no
invented data, that the banner never title-cases or alters the user's own text, that the new CSS
uses tokens and not literals, and that 59 and 418 in the code match the ruling rather than a
recomputation that happened to agree.

---

## Verified 2026-09-09, by re-running

Every gate run by the orchestrator in N's own worktree, not read from the report above.

| Gate | Result | Matches the report? |
| --- | --- | --- |
| `npx tsc -b --force` | exit 0 | yes |
| `npx eslint ./src ./scripts` | exit 0, no output | yes |
| `npx vitest run` | **124 files, 2514 tests, 0 failed** | yes, exactly |
| `node scripts/check-no-emoji.mjs` | OK, 121 files clean | yes |
| `node scripts/check-title-case.mjs` | **139 of 233** | yes, exactly |
| `alpha-catalogue --check` / `alpha-walk-pages --check` | both PASS | yes |
| personal-data grep | printed nothing | yes |

**The ESLint "24 errors in `worker/`" claim, RUN DOWN TO ITS CAUSE 2026-09-09, and it was never
a real defect.** N's report said 24 errors, all in `worker/`, pre-dating its change. The same count
appeared on `main` at `0dd4435`, which seemed to confirm it. It did not.

**There are zero ESLint errors in this repository.** The 24 come entirely from the agent worktrees
under `.claude/worktrees/`, which are full copies of the tree that `eslint.config.js` did not
ignore. A worktree's `worker/` copy has no `node_modules` -- CI runs `npm ci --prefix worker`, a
local `git worktree add` does not -- so the type-aware rules resolve every worker import to `any`
and emit exactly 24 `no-unsafe-*` errors per worktree. Measured: `brief-O`'s worktree alone gives
24; two worktreesL gave 48; the main tree's `worker/`, which does have `node_modules`, lints clean;
`npx eslint ./src ./scripts` lints clean. CI never saw any of this because it checks out a tree
with no worktrees in it.

Fixed by adding `.claude/**` to the ignores in `eslint.config.js`, with the measurement recorded
there. **N introduced none of them, and neither did anyone else: they were an artifact of running
`eslint .` from a root that contained worktrees.**

**`npm run test:tz` found a real failure that the single-zone suite could not.** This gate is in
`package.json` and is listed neither in the orchestration handout nor in brief N's report.

```
FAIL  SetupWizard.test.tsx > r2.09: the time-zone list > stores an IANA id and never an offset
      expected { value: 'UTC', offsetLike: true } to deeply equal { value: 'UTC', offsetLike: false }
```

A test defect, not a product defect. The guard regex `/^UTC|^GMT|^[+-]\d/` catches an offset LABEL
leaking into a value, and also matched the legitimate bare id `UTC`. Under `TZ=UTC` the device's
zone is `UTC`, which is a real IANA identifier but is absent from this runtime's
`supportedValuesOf('timeZone')`, so `SetupWizard` appends it on purpose. Fixed in `eccdfc9` by
requiring a sign after `UTC`/`GMT` and adding `^\(`, which catches a whole rendered label leaking
in and which the old regex would have missed. All four zones then passed at 124 files / 2514 tests.

**Add `npm run test:tz` to the verification block for any brief touching dates, zones or
reminders.** It is the only gate here that varies the one input the developer's machine holds fixed.

## The deep review, gpt-5.6-sol at high effort

The four claims no gate can check. Two confirmed, two refuted, and the orchestrator disagrees with
one refutation.

1. **`PROMINENT_ZONES` invents no population data — the report's claim stands.** Codex returned
   "refuted" on the ground that the array encodes a non-IANA prominence ordering. It does, and
   `dates.ts:364-372` says so in its own words: "It is a DISPLAY preference and nothing else... the
   ordering is an editorial judgement about which city name a reader will know, reviewable line by
   line." A declared editorial ordering that feeds no computation is not invented data, and no
   population figure appears. **Verdict overturned to confirmed.**
2. **The banner cannot alter the user's typed text. CONFIRMED.** Codex traced the whole path:
   `setupDraft` to `committed`/`buffer` (`SetupWizard.tsx:921-943`), `draft = buffer ?? committed`
   (`:952`), `e.target.value` unchanged through `patch()`, published at `:1020`, read unchanged at
   `App.tsx:455,463`. `trim()` only decides whether to render, so whitespace-only input is omitted
   rather than transformed. `FORMAT.bannerName` inserts with a replacement FUNCTION, so `$&` and
   `$1` stay literal (`copy.ts:2706-2707`).
3. **No colour literal in the added CSS. CONFIRMED, and checked independently.** Codex listed the
   token-using declarations. `git diff 53db114~1 53db114 -- '*.css' | grep -E '^\+' | grep -iE
   '#[0-9a-fA-F]{3,8}|rgb\(|hsl\('` returns nothing.
4. **59 and 418 are pinned, not derived, and one test does catch the failure mode.** Codex is right
   that §A4 supplies 418, 37 and 16 but not 59, which appears later in that document. The tests
   hard-code both numbers. It named the test that would catch a January-only grouping: "refuses to
   collapse New York into Panama" (`timeZoneGroups.test.ts:155-160`), which requires the two to be
   separate groups. That is the assertion that makes the reduction defensible.

## Found while verifying, and NOT brief N's defect: brief O

`PROMINENT_ZONES` is pinned to one engine's spelling. Three of its forty entries are IANA **Link**
names: `Asia/Calcutta`, `Asia/Rangoon`, `America/Godthab`. Node 22.23.1 returns only the Link
spelling for these, so brief N could not have written `Asia/Kolkata` — `.find()` would never have
matched. But ECMA-402 requires only that an identifier be "a Zone name or a Link name", so an
engine may return the canonical spelling instead, and on such an engine those three lookups miss
and the rows fall back to `fallbackRepresentative`. **The suite runs under Node and cannot catch
it**: `timeZoneGroups.test.ts:202` asserts `Asia/Calcutta` and always will here. Filed as brief O
with the fix (list both spellings) and a test that asserts presence of either.

## D2.09.4, the one row that was the owner's, measured and ruled

Against the IANA `backward` file (`github.com/eggert/tz`, 252 Link names): of the 418 zones this
runtime returns, **121 are Link names, leaving 297 canonical, a 28.9 % reduction**. Ruled: do not
filter. The visible list is already 59 rows after N's grouping, so filtering shrinks the SEARCHABLE
set and not the visible one; the aliases dropped are capital cities (Accra, Addis Ababa, Bamako,
Banjul, Brazzaville, Blantyre); and it would break the three names above, which exist only as Links
on this engine. Reversible if the owner wants it anyway.
