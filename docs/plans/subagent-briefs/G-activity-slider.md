# Brief G: the activity slider, nine stops

Read `00-CONTEXT.md` first. Claim: C1.09.5, reopened. Runs AFTER brief F, which builds a
three-position version of this control; you are widening it, not replacing it.

<!-- decision: activity-slider-nine-stops | status: adopted | supersedes: activity-levels-three-bands -->

**Files. Verified against the tree on 2026-09-09; rule 5 will stop you if you work from a shorter
list.** `Profile` gains a field, so the surface reaches the schema and the store, not just the UI.

| File | What changes |
| --- | --- |
| `src/domain/nutrition.ts` | Add `ACTIVITY_STOPS`, the nine-row table below as its doc comment, and the FAO citation beside it. `ACTIVITY_FACTOR` and `ACTIVITY_BAND` stay exported and unchanged |
| `src/domain/nutrition.test.ts` | The containment test. `ACTIVITY_BAND` is already exported and already asserted here as `sedentary [1.4, 1.69]`, `moderate [1.7, 1.99]` (lines 104-108). **Read the bands from `ACTIVITY_BAND`, never restate them as literals** — restating them is what lets a stop drift out of range silently, which is the one thing this test exists to prevent |
| `src/domain/types.ts` | `Profile.activityPal: number | null`, beside `activity: ActivityLevel` (line 105). `ActivityLevel` itself is unchanged |
| `src/domain/schema.ts` | The Zod field, `.catch(null)`, beside `activity: ActivityLevelSchema` (lines 218 and 681 — there are TWO, check both). `AppState.schemaVersion` stays **3**: an additive nullable field needs no migration |
| `src/store/selectors.ts` | `computeTargets` prefers `activityPal` when present and falls back to the band floor when it is null (call site line 202) |
| `src/ui/setup/SetupWizard.tsx` | Widen brief F's three-position control. `ACTIVITY_OPTIONS` is at line 256 and the slider renders at 2338-2344. The doc comment there cites decision `activity-levels-three-bands`; **update it to record this supersession, do not leave it contradicting the code** |
| `src/ui/setup/SetupWizard.test.tsx` | The slider's tests (line 1333 iterates the three sliders) |
| `src/ui/setup/setup.css` | The callout link, using tokens only |
| `src/content/activityLevels.ts` | NEW R10 module. Follow `src/content/bodyEquations.ts` |
| `src/content/activityLevels.test.ts` | NEW. Its contract suite, as every R10 module has one |
| `src/content/copy.ts` | The link label and the modal's headings, in the `CopyKey` union AND the table |
| `src/content/copy.test.ts` | Register the new module in the `LENGTH_EXEMPT` map (line 159). That map IS the mechanical half of R10; a module missing from it fails the length rules |
| `scripts/alpha-parts.mjs`, `scripts/alpha-walk.mjs` | A part and one step for each new key |
| `docs/design/2026-09-01-copy-contract.md` | Name `activityLevels.ts` in the R10 list |

**Do not touch `src/domain/migrations/`.** The field is additive and nullable; `schemaVersion`
stays 3 and no migration is needed. If you think one is, stop and say so rather than writing it.

## What changed and why

Round 1 answered C1.09.5 with "the bands are not arbitrary, so no slider". That was half right.
The bands are not arbitrary, but they are **ranges**, not points, and the owner's follow-up
question is the one that resolves it: a stop INSIDE a published range invents nothing.

FAO/WHO/UNU 2004, Table 5.3 p.38:

```
Sedentary or light activity     PAL 1.40 - 1.69
Active or moderately active     PAL 1.70 - 1.99
Vigorous or vigorously active   PAL 2.00 - 2.40
```

Nine stops, three per band, every one inside its own band:

| Stop | Band | PAL | Example |
| --- | --- | --- | --- |
| 1 | sedentary | 1.40 | Desk, car, sofa. You have wondered whether standing counts as cardio. |
| 2 | sedentary | 1.55 | Desk job, but you walk somewhere most days and take the stairs when the lift is slow. |
| 3 | sedentary | 1.69 | Desk job with a commute on foot, and weekends that involve leaving the house. |
| 4 | moderate | 1.70 | You train a couple of times a week and are on your feet more than you sit. |
| 5 | moderate | 1.85 | Three or four sessions a week, or a job that keeps you moving all day. |
| 6 | moderate | 1.99 | Training most days, or an active job with training on top. |
| 7 | vigorous | 2.00 | Hard training most days, and a job that does not let you sit down. |
| 8 | vigorous | 2.20 | Two sessions most days, or manual work plus serious training. |
| 9 | vigorous | 2.40 | Athlete, or your job is brutal and you train as well. |

**What is still forbidden.** Interpolating BETWEEN bands to make a new category, and any value
outside 1.40 to 2.40. `src/domain/nutrition.ts` rejects the 1.2 / 1.375 / 1.55 / 1.725 / 1.9 gym
ladder because its interior points are arithmetic means with no source and its floor sits below
FAO's. That rejection stands; this does not disturb it.

## The consequence, which must be recorded not buried

`ACTIVITY_FACTOR` currently returns each band's printed FLOOR, and the file says why: it
under-prescribes rather than over-prescribes, and P7's re-measure loop corrects it. With nine
stops a user can select ABOVE the floor, so the app can now over-prescribe where it structurally
could not.

That is a deliberate reversal of a recorded decision, not an oversight. Keep the mitigation
visible: the targets re-derive at every body-mass re-measure (`src/store/selectors.ts:114`).
`ACTIVITY_FACTOR` stays exported and unchanged for the three-band default; the slider supplies
`Profile.activityPal` and `computeTargets` prefers it when present, falling back to the band floor
when it is absent, so every document written before this change keeps its old number.

## Code

- `ActivityLevel` is unchanged: `sedentary | moderate | vigorous`. The band is DERIVED from the
  stop, never stored twice.
- Add `ACTIVITY_STOPS: readonly { pal: number; level: ActivityLevel }[]` to
  `src/domain/nutrition.ts`, nine members, with the table above as its doc comment and the FAO
  citation beside it.
- A test asserts every stop's PAL lies inside `ACTIVITY_BAND[stop.level]`. That is the gate that
  makes this defensible; without it a later edit can drift a stop out of its range silently.
- `Profile.activityPal: number | null`, additive, `.catch(null)`, schema version stays 3.

## The callout

A text link under the slider, reading exactly:

```
Where These Levels Come From
```

It opens the same `ModalShell` the sex explainer uses, close control upper left. Content, in a
new R10 module `src/content/activityLevels.ts` named in the contract's R10 list, with its own
contract suite:

- One short paragraph: fitness guidance compresses a whole week of behaviour into a handful of
  bands because that is the resolution the research supports; these are the three the app uses,
  and the nine stops are points inside them.
- The three bands with their printed ranges.
- The nine stops with band, PAL and example.
- One closing line: the number is a starting estimate, and the app re-derives your targets from
  your own weigh-ins as they arrive.
- The citation: FAO/WHO/UNU (2004), Human Energy Requirements, Table 5.3 p.38. A United Nations
  technical report, which carries no DOI. Say that in words rather than omitting the row.

R14 applies to the link and to every heading in the modal: Title Case, and a heading is a noun
phrase.
