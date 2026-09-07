# Brief B: the body-fat control, and the sex explainer modal

Read `00-CONTEXT.md` first. Claims: C1.07.6, C1.07.10 to C1.07.16, C1.08.1 to C1.08.5, C1.08.7,
C1.08.9 to C1.08.14.

Everything here is on **step 3, `body`**, in `src/ui/setup/SetupWizard.tsx`. That step was already
rebuilt into two bordered boxes with two-column rows; do not undo that.

---

## Part 1 — Reorder the body-fat control (C1.08.1 to C1.08.4, C1.08.7)

Today the control offers three options in the order `none`, `known`, `tape`, with the `why?`
disclosure and the "Optional" line ABOVE it.

The owner's instruction: explanatory text belongs **below** the thing it explains, and the
percentage entry should be **first and default**.

New order, top to bottom:

1. A radio group, `bodyFatMode`, in this order:
   - `known` — label `Percentage`, **pre-selected by `initialDraft()`**
   - `tape` — label `Body measurements`
   - `none` — label `Not measured`, stays last and stays reachable
2. The revealed control for whichever option is selected.
3. Then, and only then, `advice.bodyFatOptional` and the `<details><summary>why?</summary>` block.

When `known` is selected, render **above the percentage number field** a text button reading
`Click here to estimate`, which opens the modal in Part 2b.

Do NOT show any obesity or category classification anywhere. Numbers only.

`initialDraft()` changes `bodyFatMode: 'none'` to `bodyFatMode: 'known'`.

## Part 2 — Two modals

Both use the existing `src/ui/components/ModalShell.tsx`. It renders **no close control of its
own**, so each consumer draws one. Draw it at the **upper left**, high contrast, minimum 44 px.
That placement is the owner's explicit instruction; `ModalShell` has no convention to break.

### 2a. The sex explainer (C1.07.6, C1.07.10 to C1.07.16)

Under the sex field, add a small text button, styled as a link:

```
Options suck? I agree. Click here for a workaround.
```

Clicking it opens a modal in **two segments separated by a horizontal rule**. The rule takes
`var(--accent)`. **It is NOT lime.** On the limelight skin lime is the page background and the
accent is pink; a lime rule on a lime ground is invisible, which is the exact defect this round
was called in to fix.

**Segment one** renders the two equations as **inline MathML**, not an image and not a LaTeX
library. Wrap the sex term in its own element so it can be highlighted with `var(--accent)`.

The words for segment one, verbatim:

```
Your resting metabolic rate is estimated from one of two published equations, and which one
depends on whether you give a body-fat percentage.

Without one, the app uses Mifflin-St Jeor, where sex enters as a fixed offset. For two people of
the same body mass, stature and age the difference is exactly 166 kcal a day, whatever those
other numbers are. After the activity factor and a fat-loss target that lands near 280 kcal a day
on the figure you actually see. For scale, the equation's own published error is about 10 per
cent in 82 per cent of cases, so the sex term and the equation's uncertainty are the same size.

With a body-fat percentage, the app uses Cunningham instead, which reads fat-free mass and has no
sex term at all. Supplying a body-fat estimate is therefore the most direct way to stop this
field mattering to your energy target.

Sex still enters two other places: the tape body-fat equations, whose male and female forms
differ in shape rather than in coefficient, and the daily beverage target.
```

Then the two equations, in MathML:

- Mifflin-St Jeor: `RMR = 10 x mass + 6.25 x height - 5 x age + S`, with `S` highlighted, and
  under it `S = +5 for male, -161 for female [kcal/day]`.
- Cunningham: `RMR = 370 + 21.6 x FFM`, with a note that no sex term appears.

Sources, verbatim:
```
Mifflin MD, St Jeor ST et al. (1990), Am J Clin Nutr 51(2):241-247. DOI 10.1093/ajcn/51.2.241
Cunningham JJ (1991), Am J Clin Nutr 54(6):963-969. DOI 10.1093/ajcn/54.6.963
```

**Segment two.** The owner asked for a six-month hormone-therapy threshold. The research came back
and **no such threshold has support**, so it does not ship. Use these words verbatim and add
nothing:

```
If you are on gender-affirming hormone therapy

No predictive equation for resting metabolic rate has been validated in people on hormone
therapy. Not the one this app uses, and not its alternatives. Anyone who tells you which box to
tick is guessing, including this app.

Body composition does change on hormone therapy, and the published estimates put the lean-mass
shift in the region of a couple of kilograms over the first year, though the studies disagree and
the variation between individuals is large: in one cohort followed for two years, a fifth of
transmasculine participants showed no measurable change at all. A rule keyed to months elapsed
would therefore be wrong for a lot of people.

The honest way round it is to skip the question. Give the app a body-fat percentage, from a tape
measurement or any other source, and it switches to the equation with no sex term in it. If you
would rather not, pick whichever option you expect to fit your current body composition better,
and treat every energy number that follows as the estimate it already was.

van Velzen DM et al. (2020), Eur J Endocrinol 183(5):529-536. DOI 10.1530/EJE-20-0609
```

> **Page range corrected 2026-09-06.** This brief shipped 529-537 and the app carried it until
> brief K. CrossRef and PubMed (PMID 33071222) independently give **529-536**. Copy the range
> above, not the one in round 1's `sexRationale.ts` history comment.

This text is long-form reference content. Put both segments in a new module
`src/content/sexRationale.ts`, NOT in a copy table, and add it to R10 in
`docs/design/2026-09-01-copy-contract.md` beside `bodyEquations.ts`. Give it a test modelled on
`src/content/bodyEquations.test.ts`.

### 2b. The body-fat estimate chart (C1.08.5, C1.08.9)

The modal opened by `Click here to estimate` has two rows, male bodies and female bodies, each a
row of silhouettes with a percentage under each. **You are not drawing the artwork.** Render a
placeholder grid of labelled empty frames with the percentages under them, sized and laid out as
the real asset will be, and leave a code comment naming `docs/design/2026-09-04-icon-register.csv`
as where the artwork is specified. Percentages to label, per row: 10, 15, 20, 25, 30, 35.

Above the rows, verbatim:

```
Compare against the pictures and pick the closest. This is a rough orientation, not a
measurement: studies of people estimating their own body fat this way find weak agreement with
measured values, and most people underestimate. A tape measurement is better, and this app will
take one.
```

A number chosen here fills the percentage field but must record its provenance as `visual`.
If a `provenance` field does not exist yet on the draft, **add `bodyFatSource: 'measured' |
'tape' | 'visual'` to `Draft`** and set it: the modal sets `visual`, the tape flow sets `tape`,
typing straight into the box sets `measured`. Store nothing new on the profile in this brief;
just carry it in the draft and report that it is unused downstream.

## Part 3 — The tape block (C1.08.10, C1.08.11, C1.08.13, C1.08.14)

- Replace the measurement-site prose on the face with a **placeholder diagram frame** per girth,
  captioned with the site in a short sentence for screen readers. Move the full site definition
  from `NAVY_SITE_LABEL` **behind the `why?` disclosure**, where R10 exempts its length. **Do not
  delete the site information.** It is what keeps the estimate valid.
- `advice.tapeMethod` stays and already reads correctly.
- **`error.valueRequired` ("Enter a number.") must NOT be deleted.** It is reached from ten call
  sites across the wizard and Settings. What changes is WHEN it renders: only after a field has
  been touched or Next has been pressed, never as standing helper text under an untouched field.
  Add a `touched` set to the wizard's state and gate every field error on it.
- The estimate can legitimately return **null for a lean man** — that is a routine outcome of the
  equation leaving its domain, not a failure. The UI must say the model has left its domain and
  must never clamp to zero. Check the existing `tapeWithheld` branch says this and fix it if not.
- The Navy standard error must appear beside any estimate: 3.52 percentage points for male,
  3.72 for female. `NAVY_SEE_PCT` already holds these.

## Part 4 — Failed Next (C1.08.12)

When Next is pressed with a blocking error: mark every field touched, focus the first invalid
field, `scrollIntoView({ block: 'center' })`, and apply a short CSS shake that branches on
`prefers-reduced-motion`. Call the existing `vibrate()` helper in `src/ui/audio/chime.ts` as an
extra cue only — it is a no-op on iOS and must never be the only signal.

## Verification

Everything in `00-CONTEXT.md`. Then:

```
grep -rn "0x2642\|0x2640\|♂\|♀" src/
```
Expect **no output**: those characters fail both emoji gates.

Report per `00-CONTEXT.md`.
