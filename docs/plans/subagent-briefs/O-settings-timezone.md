# Brief O: the Settings time zone, and the engine-naming hazard

Read `00-CONTEXT.md` first. Claim r2.09, the half brief N could not reach.

Files: `src/ui/views/SettingsView.tsx`, `src/domain/dates.ts`, and the test files beside them.

Brief N rebuilt the setup wizard's time-zone picker and left the Settings one alone, correctly:
rule 5 says do not edit a file your brief does not list, and `SettingsView.tsx` was not in brief N.
That leaves the r2.09 defect still shipping on one screen. This brief closes it.

---

## 1. Settings still builds the old flat list (r2.09)

`src/ui/views/SettingsView.tsx:102-116` builds every zone the platform offers, in the order the
platform returns them, labelled with the old parenthesis:

```ts
const timeZoneOptions = useMemo((): readonly string[] => {
  if (typeof Intl.supportedValuesOf !== 'function') return [];
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}, []);
const timeZoneOptionLabels = useMemo(
  () =>
    timeZoneOptions.map((zone) => ({
      zone,
      label: `(${utcOffsetLabel(zone, Date.now())}) ${zone}`,
    })),
  [timeZoneOptions],
);
```

That is 418 entries in IANA alphabetical order, which reads `-05:00, -04:00, -04:00, -04:00,
-05:00` — the exact defect he reported — with the `(UTC+02:00)` label he asked to change.

**Replace it with what brief N already built and tested.** `src/domain/dates.ts` exports:

- `groupTimeZones(zones, atEpochMs)` — the 418 zones collapsed to the 59 distinct year-round
  behaviours, sorted by offset then by representative name, each row carrying `representative`,
  `members`, `offsetMinutes` and `offsetLabel`.
- `promoteSelectedZone(groups, selected)` — the same rows with the user's own zone promoted to
  name its row. **Use this.** The stored zone is very often a collapsed member rather than a row's
  name (`Europe/Berlin` sits under `Europe/Paris`), and a Settings screen that silently renamed the
  user's saved answer reads as having ignored it.

Render the same label the setup wizard renders. Read `SetupWizard.tsx` and copy the construction
rather than guessing at it: the two screens must not drift apart, which is what §3 tests.

**Do not change what is stored.** `Profile.timezone` stays an IANA zone id, the same string the
platform gave. The grouping is a display reduction and nothing else.

**Keep the two guards.** `Intl.supportedValuesOf` is ES2022, absent on older engines, and a
locked-down engine can throw on it. Both cases still fall back to the free-text input, unchanged.

## 2. `PROMINENT_ZONES` is pinned to one engine's spelling

**Found 2026-09-09, verifying brief N. Not brief N's defect — it had no way to see it.**

`PROMINENT_ZONES` (`src/domain/dates.ts:377-388`) names each group after a city a reader will
recognise, by `.find()` on the group's members. Three of its forty entries are IANA **Link**
(superseded) names rather than canonical ones:

| in `PROMINENT_ZONES` | IANA canonical | in Node 22.23.1's list? |
| --- | --- | --- |
| `Asia/Calcutta` | `Asia/Kolkata` | only the Link name |
| `Asia/Rangoon` | `Asia/Yangon` | only the Link name |
| `America/Godthab` | `America/Nuuk` | only the Link name |

This runtime offers only the Link spelling, so brief N could not have written the canonical one —
`.find()` would never have matched. But **ECMA-402 does not require the canonical spelling either
way**: it says only that an available identifier must be "a Zone name or a Link name in the IANA
Time Zone Database", so an engine is free to return `Asia/Kolkata` instead. On such an engine these
three `.find()` calls miss, and those three groups get named by `fallbackRepresentative` instead —
alphabetically first within the modal region, which for India is not Kolkata.

**The suite cannot catch this.** It runs under Node, which returns the Link spelling, so
`timeZoneGroups.test.ts:202` asserting `Asia/Calcutta` will pass forever here and tell you nothing
about the browser the app actually ships to.

**The fix: list both spellings.** Add `Asia/Kolkata`, `Asia/Yangon` and `America/Nuuk` to
`PROMINENT_ZONES` beside their Link names. `.find()` takes whichever the engine offers, the other
is inert, and the row is named recognisably on both. Put the canonical name FIRST in each pair, so
an engine offering both prefers the modern one. Add a comment saying why the pair exists, naming
this brief, or the next reader will delete one as a duplicate.

Add a test asserting that for each of the three pairs, at least one member is present in
`Intl.supportedValuesOf('timeZone')` — which is the property that actually has to hold — rather
than asserting a specific spelling, which is the assertion that hid this.

## 3. The two screens must not drift apart again

A test that the Settings picker and the setup picker produce the **same label for the same zone**.
Compare rendered output, or a shared exported label builder. Do not assert a hard-coded string in
both places: two copies of the same literal is exactly how they drifted the first time.

## 4. Do NOT filter the list to canonical zones (D2.09.4)

He asked whether the list could be reduced by dropping alias entries. **Measured 2026-09-09**
against the IANA `backward` file (`github.com/eggert/tz`, 252 Link names): of the 418 zones this
runtime returns, **121 are Link names, leaving 297 canonical** — a 28.9 % reduction.

**Ruled: no.** Three reasons, and the number is the least of them.

1. **The display problem is already solved.** Brief N's grouping shows 59 rows, not 418. Filtering
   aliases would take the SEARCHABLE set from 418 to 297 while leaving the visible list at 59. It
   reduces the wrong number.
2. **The aliases are capital cities.** `Africa/Accra`, `Africa/Addis_Ababa`, `Africa/Bamako`,
   `Africa/Banjul`, `Africa/Brazzaville`, `Africa/Blantyre` are all Links onto Abidjan, Nairobi,
   Lagos or Maputo. A user in Accra typing "Accra" would find nothing.
3. **It would break the three names in §2**, which exist only as Links on this engine.

Record the measurement in the code comment so the question is not reopened without it.

## 5. One thing you will notice and must NOT fix

`scripts/alpha-parts.mjs` has a `setup.timezone` part (line 52) and **no `settings.timezone` part**,
so the Settings zone control is not in the catalogue and will not appear in the walk pages. That is
a real gap and it is not yours: rule 5. Say so in your report and stop there.

This brief should need no catalogue change at all, because it reuses `label.timezone` and adds no
key. If you find yourself adding one, run the four catalogue commands and add the part and the walk
step, as `00-CONTEXT.md` requires.

## Verification

Everything in `00-CONTEXT.md`, plus:

- `npm run test:tz` — the four-zone matrix. This brief changes time-zone display; a suite green in
  one zone proves little.
- The Settings picker shows 59 rows, not 418, and searching still reaches all 418.
- Changing the zone in Settings still writes an IANA id to `Profile.timezone`, unchanged in shape
  from before this brief.
- The three canonical/Link pairs are both present in `PROMINENT_ZONES` and the new test asserts
  presence of either, not of one spelling.
