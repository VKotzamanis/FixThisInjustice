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
