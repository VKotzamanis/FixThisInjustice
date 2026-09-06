# Brief F: step 4, the sliders and the equipment tiers

Read `00-CONTEXT.md` first. Claims: C1.09.2, C1.09.3, C1.09.6, C1.09.7, C1.09.8, C1.09.10,
C1.09.11, C1.09.12, C1.09.15, C1.09.16, C1.09.18, C1.09.19, C1.09.21.

The owner's words for this step are in `docs/feedback/round-1/w0-w1-owner-feedback.md` under
`[w1.09 | setup.training]`, 788 words. **Read that section before you start.** This brief is the
resolution of it, not a replacement for it.

Everything is in `src/ui/setup/SetupWizard.tsx`, step `training`, plus the domain changes below.

---

## Part 1 — three sliders

All three replace `<select>` controls. Use `<input type="range">` with `step="1"`, a visible label
per position, and the current position named in text beside it. Minimum 44 px touch target. The
value is an index into a closed list, never a free number.

### 1a. Everyday Activity Level, 3 positions

`ActivityLevel` stays exactly as it is: `sedentary | moderate | vigorous`. **Do not add positions
and do not invent intermediate values.** These are FAO/WHO/UNU 2004 PAL bands and
`src/domain/nutrition.ts` records rejecting a five-point ladder because its interior points have
no source. The owner asked for a 1-to-10 slider CONDITIONAL on the levels being arbitrary; they
are not, so the slider carries three positions over the evidenced bands.

Below it, an **Examples** call-out that toggles open and closed on click, in the same shape as the
existing `why?` disclosure. Its content, verbatim:

```
Sedentary: a desk job and a car commute, with little walking in a normal day.
Moderate: regular walking, including a walk to and from the gym, an active job, or training most
days.
Vigorous: heavy physical work, or training hard most days on top of an active job.
```

The walk to the gym appears HERE and nowhere else. FAO bands already count everything a person
does in a day, so a separate walking field would count it twice, and no MET coefficient exists in
this project to build one from.

### 1b. Gym Comfort, 3 positions

Rename `Experience` in the UI only. The type stays `novice | intermediate | advanced`. The three
labels, verbatim from the owner:

```
Starting out
Regular at the gym, mostly the machines
Free weights for three years or more
```

Each position gets an icon from `docs/design/2026-09-04-icon-register.csv`
(`comfort-1-starting`, `comfort-2-machines`, `comfort-3-freeweights`). **The artwork does not
exist yet.** Render a labelled placeholder frame at the icon's final size and leave a comment
naming the register row. Do not generate images.

### 1c. Equipment Access, 5 positions

This is the one that needs a domain change. Read Part 2 first.

Positions, in order, lowest to highest access:

```
Body weight only
Home gym and body weight
Home gym
Full gym and home gym
Full gym
```

Each carries a short example, shown for the selected position only:

```
Body weight only: a mat, a rope, and what your own weight can do.
Home gym and body weight: dumbbells combined with rope work, walking or burpees.
Home gym: dumbbells, and whatever else is in the room.
Full gym and home gym: three days at the gym, one at home.
Full gym: racks, barbells, machines and cables.
```

---

## Part 2 — five tiers WITHOUT retagging the exercise library

`Equipment` in `src/domain/types.ts` describes what an exercise NEEDS. Leave it alone: it stays
`full-gym | dumbbells-only | bodyweight`, and all forty entries in
`src/domain/plan/library.ts` keep their tags untouched.

Add a separate type for what the USER HAS, and a mapping to the tiers it unlocks:

```ts
/**
 * What the user has access to, as the five positions the Equipment slider offers. Distinct from
 * `Equipment`, which says what an EXERCISE needs: the two combination tiers have no
 * corresponding exercise tag and never will, because an exercise does not need "a full gym and a
 * home gym". Round 1 claim C1.09.11.
 */
export type EquipmentAccess =
  | 'bodyweight'
  | 'home-and-bodyweight'
  | 'home'
  | 'full-and-home'
  | 'full-gym';

/** The exercise tiers each access level opens. A combination is the union of its parts. */
export const ACCESS_UNLOCKS: Record<EquipmentAccess, readonly Equipment[]> = {
  bodyweight: ['bodyweight'],
  'home-and-bodyweight': ['bodyweight', 'dumbbells-only'],
  home: ['dumbbells-only'],
  'full-and-home': ['dumbbells-only', 'full-gym'],
  'full-gym': ['full-gym'],
};
```

`Profile.equipment` becomes `EquipmentAccess`. Write a migration note: an existing profile's
`full-gym`, `dumbbells-only` or `bodyweight` maps to `full-gym`, `home` and `bodyweight`
respectively. Give the schema field a `.catch()` onto `'full-gym'` so a stored value from before
this change cannot fail the whole document.

`resolveSlot` in `src/domain/plan/templates.ts` currently takes one `Equipment` and matches on
equality. Change it to take an `EquipmentAccess`, resolve it through `ACCESS_UNLOCKS`, and match
when the exercise's own `equipment` array **intersects** that set. Same for `generatePlan`'s
`PlanInput.equipment` and anything else that threads it through.

**This is why no retagging is needed:** `Exercise.equipment` is already an array of the tiers an
exercise belongs to, so a combination tier is a union match, not a new tag.

The generator's test asserts the weekly-set band per tier and the band claim differs by tier.
Extend that matrix to five members. A combination tier should never produce a WORSE band than
either of its parts alone; assert that.

---

## Part 3 — the questions that follow the tier

The three load-increment fields (`barbellStep`, `dumbbellStep`, `stackStep`) move OUT of the main
box into their own bordered box, and `hasMicroPlates` and `microPlateStep` are **deleted
entirely** from `Draft`, `initialDraft`, the UI, `Profile.equipmentSteps` and the schema. The
owner asked for the microplate option to go, and only that.

Below the increments box, render questions conditional on the slider position:

**Full gym, or full gym and home gym:**
```
Do you walk to and from the gym?
```
Two large Yes/No buttons side by side. Yes reveals one number field, `Minutes each way`. No sets
it to zero. **Store the answer. Do NOT feed it into any energy calculation** — see 1a for why.

**Home gym, or either combination that includes it:** a multi-select, `What equipment do you have?`

```
Aerobic:   Treadmill · Elliptical · Rowing machine
Dumbbells: 5 to 20 · 20 to 40 · 40 and above
Machines:  Squat rack · Cable machine · Bench · Leg press · Lat pulldown · Smith machine
```

The dumbbell bands take the unit chosen in step 1, so they read `5 to 20 kg` or `5 to 20 lb`. The
owner flagged this: a range with no unit is ambiguous. Multi-select allows a non-contiguous
inventory; leave it permitted, since buying a light pair and a heavy pair and skipping the middle
is uncommon but real.

**Body weight only:**
```
Yoga mat · Skipping rope · Pull-up bar · Resistance bands
```

Store the selections on the profile as a string array. Nothing reads them yet; that wiring is a
later task and you should say so in your report.

---

## Part 4 — the heading

`step.training` already reads `Equipment & Availability`. Leave it.

## Verification

Everything in `00-CONTEXT.md`. Then confirm no exercise tag changed:

```
git diff --stat src/domain/plan/library.ts
```
Expect **no output**. If that file changed, the design in Part 2 was not followed.
