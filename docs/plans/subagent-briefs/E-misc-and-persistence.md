# Brief E: setup persistence, the time-zone select, units in Settings, and three strays

Read `00-CONTEXT.md` first. Claims: C1.G.1, C1.06.2, C1.04.3, C1.09.1, C1.09.9, C1.09.17.

Six unrelated items, grouped because each is small.

## 1. Setup input survives a closed browser (C1.G.1) — the most valuable item here

> "if I don't end the onboarding and close the browser, when I open the page again, the
> information that has been put there needs to be there waiting for me"

- `src/domain/types.ts`: add `setupDraft: SetupDraft | null` to `AppState`, where `SetupDraft` is
  the wizard's `Draft` shape plus `stepIndex: number`.
- `src/domain/schema.ts`: a matching schema with `.default(null)`. Additive field,
  `CURRENT_SCHEMA_VERSION` stays 3.
- `src/store/index.ts`: `saveSetupDraft(draft)` and `clearSetupDraft()`.
- `src/ui/setup/SetupWizard.tsx`: write the draft on every `patch()`, debounced to about 400 ms.
  On mount, restore it and jump to the stored step index. Confirm clears it.

**Store the RAW TYPED STRINGS, not parsed values.** A half-typed number must survive and be
re-validated on resume rather than trusted. `src/store/persistence.ts` is the ONLY module allowed
to touch Web Storage and it already writes the whole document; do not touch it.

Test: patch three fields, simulate a reload, assert all three survive and the step index is
restored. Then assert an invalid stored draft does not crash the wizard and does not corrupt the
rest of the document.

## 2. The time zone becomes a select (C1.06.2)

`src/ui/setup/SetupWizard.tsx` around line 547 already calls `Intl.supportedValuesOf('timeZone')`
and falls back to a plain text field when it is missing or throws. **Keep both branches.**

Turn the field into a `<select>` whose options read `(UTC+02:00) Europe/Athens`.

**Compute the offset for today's date, never store it.** Offsets move with daylight saving.
`src/domain/export/fixtures/athens-dst-week.ics` exists because that has already bitten this
project once. Use `Intl.DateTimeFormat` with `timeZoneName: 'longOffset'`.

The owner's sketch said "GMT+2 UTC+2 and the city". GMT+2 and UTC+2 are the same offset written
twice; use one.

## 3. Units changeable from Settings (C1.04.3)

Add a units toggle to `src/ui/views/SettingsView.tsx`, beside the skin picker. The owner also said
"those static settings" in the plural, so add the time zone there too.

It writes `Profile.units` and NOTHING ELSE. **Do not convert or rewrite any stored number.** Every
quantity is already stored canonically in kg and mL and formatted at render, so the toggle is
free. Storing values in both systems was considered and REJECTED: it creates two sources of truth
that can disagree and adds round-trip drift.

Test: log a set at 100 lb, switch to metric, assert the stored `loadKg` is still exactly
45.359237 and the display reads 45.4 kg; switch back and assert 100 lb.

## 4. Rename step 4 (C1.09.1)

`step.training` becomes `Equipment & Availability`. The owner settled this: one page asks what you
can provide, the next asks what you want and when.

## 5. The icon register (C1.09.9)

Create `docs/design/2026-09-04-icon-register.csv` with a header row and one row per icon:

`icon_id,screen,control,depicts,prompt_keywords,style_constraints,licence,status`

Rows needed: three gym-comfort levels (a person doing an overhead press, a gym machine, a person
stretching); five equipment tiers; two measurement-site diagrams (neck, abdomen); six body-fat
silhouettes per sex for the estimate chart. `prompt_keywords` is five to eight words. Style
constraints come from the existing house style in `src/skins/limelight/icons.ts`: flat, single
colour, no gradients, legible at 24 px. Licence column reads `original, this project`.

You are NOT generating images. This is a specification the owner will generate from.

## 6. The gym-walk question (C1.09.17)

The owner asked for a "do you walk to and from the gym" question feeding aerobic calculations.

**Do not build an energy term.** There is no MET coefficient anywhere in this project and the
content review supplies none, so an energy calculation would be the first unsourced number in the
codebase. Instead, add the walk as an EXAMPLE in the activity-level descriptions, which is where
it belongs: FAO PAL bands already count everything a person does in a day, gym commute included.
Counting it twice would over-feed the user.

Write the example text into the activity band descriptions and note in your report that no
separate field was added and why.

## Verification

Everything in `00-CONTEXT.md`.
