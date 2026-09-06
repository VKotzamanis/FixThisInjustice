# Brief N: the dynamic banner, the time zone, and reaching Settings

Read `00-CONTEXT.md` first. Claims r2.05, r2.09, and `r2-onboarding.general`.

## 1. The banner says where you are (general)

> "The banner of the web page (That now says FIX THIS INJUSTICE) is not dynamic."

The brand stays fixed; what follows it changes with context.

| Context | Banner |
| --- | --- |
| The intro | `Hi, How Are Ya` |
| Setup, before a name is given | `Welcome Aboard` |
| Setup, once a name is given | `Welcome Aboard: {name}` |
| Setup, name left blank at the end | `Welcome Aboard: Shy or Paranoid?` |
| After setup | the view's own name: `Atlas`, `Leg Day`, and so on |

The last row already half exists: `VIEW_INSTRUCTIONS` in `src/ui/nav/views.ts` maps each view to a
copy key. Add a parallel `VIEW_TITLES` rather than reusing the instruction, which is a sentence.

Two things to get right:

- **The name is the user's own text.** It goes through a `FORMAT` frame with a slot, never string
  concatenation at the call site, and it is not title-cased or altered.
- **The joke fires only at the end.** `Shy or Paranoid?` is for a user who reached the end of
  setup without giving a name, not for one who has simply not typed it yet. Keyed off the review
  step, not off an empty field.

## 2. The time zone (r2.09)

**The ordering is the real defect.** The list is in IANA alphabetical order, so it reads UTC-05,
-04, -04, -04, -05. Sort by current offset, then by zone name within each offset.

**The label reads `(UTC/GMT-05:00) America/Cancun`.** He asked for both, and gave the reason:
Europe says GMT.

**One entry per offset is REFUSED, and the brief says why so nobody re-opens it.** Measured
against the platform's own 418 zones: 37 distinct offsets in January, of which **16 split into
different offsets by July**. New York and Panama are both UTC-05:00 in January; in July New York is
-04:00 and Panama is not. Collapsing them breaks reminders for eight months of the year, which is
the class of defect `src/domain/export/fixtures/athens-dst-week.ics` exists to catch. The offset
is not the identity; the IANA id is.

**RULED 2026-09-06: show 59, search 418.** Measured on this machine, not estimated. Group every
zone by its behaviour across the whole year, sampling the offset on the first of each month so DST
rules are part of the key. That gives **59 distinct behaviours out of 418 zones**. Two zones with
the same offset in every month are interchangeable for everything this app does, which is day
resets and reminder instants, so collapsing them loses nothing.

Thirty-three European zones share one behaviour: Amsterdam, Ceuta, Longyearbyen and thirty others
are one zone wearing different names.

**This is NOT one-per-offset, which stays refused.** There are 37 distinct offsets in January and
16 of them split by July. 59 is the safe reduction; 37 is the lossy one.

**Offsets are not all whole hours.** Eleven are not: `+05:30` India, `+05:45` Nepal, `+03:30`
Iran, `+04:30` Afghanistan, `+06:30` Myanmar, `+08:45` Eucla, `+09:30` Adelaide, `+12:45` and
`+13:45` Chatham, `-03:30` Newfoundland, `-09:30` Marquesas. The span runs `-11:00` to `+14:00`,
which is 25 hours, not 24. Never build a picker from `for (h = -12; h <= 12; h++)`.

**Search the full 418, display the 59.** Someone typing "Amsterdam" must find their group even
though the list shows a different representative city, or the reduction costs them the ability to
find themselves. Pick the representative by population or by prominence, and label it so a user in
a collapsed city still recognises the row.

Store the IANA id of the representative, never an offset.

**A bordered box below the field**, headed `Why the Time Zone Matters` (Title Case, noun phrase),
with two bullets. Rework his words; keep his meaning and his register.

1. The day boundary. Every date in the app, every streak and every weekly close is computed in
   this zone. Make this one stand out: he asked for it bold or underlined.
2. Reminders. If notifications are turned on, the app can nudge you on a training day so the gym
   bag does not stay at home.

## 3. Settings is unreachable during setup (r2.05)

> "I do not see any skin picker or any app settings."

Confirmed gap: the tab strip does not render until a profile exists, so nothing in setup can reach
the skin picker. Someone who dislikes the default skin cannot change it until they have finished
the whole wizard.

Add a small control in the top bar, visible during setup only, opening the skin picker alone.
**Not the whole Settings view**: most of it reads a profile that does not exist yet, and mounting
it early is a crash waiting to happen. Reuse `SkinSettings` if it can stand alone; check before
assuming it can.

## Verification

Everything in `00-CONTEXT.md`, plus:

- A test that the zone list is sorted by offset, using a fake clock so it does not drift with the
  season.
- A test for each banner state, including the blank-name joke firing only at review.
- A test that the skin picker is reachable with no profile in the document.
