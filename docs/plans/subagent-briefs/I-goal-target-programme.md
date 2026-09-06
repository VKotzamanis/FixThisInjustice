# Brief I: the goal, the target date, and the programme

Read `00-CONTEXT.md` first. Claims: C1.10.2 to C1.10.9, C1.11.2 to C1.11.5, C1.12.2, C1.12.4 to
C1.12.6. Seventeen claims, setup steps 5 to 7.

The owner's own words are in `docs/feedback/round-1/w0-w1-owner-feedback.md` under `[w1.10 |
setup.goal]`, `[w1.11 | setup.availability]` and `[w1.12 | setup.programme]`. **Read all three
before you start.** This brief resolves them; it does not replace them.

The reasoning behind every ruling here is in `docs/plans/2026-09-04-11-alpha-round-1-corrections.md`,
findings **B21, B22 and B23**. Read those three too. They are short and they carry the evidence.

---

## Part 1 — The goal is two axes, not four exclusive options (C1.10.2 to C1.10.6)

> "The way the 'Goal' is seperated is exclusionary. Recomposition and fat loss are not
> exclusionary. This WHOLE page needs to be reworked because the LOGIC is not nuanced and very
> basic."

He is right, and the engine half-admits it. `GoalKind` has four members: `fat-loss`,
`muscle-gain`, `recomposition`, `maintenance`. `energyPlan` in `src/domain/nutrition.ts` gives
recomposition the SAME energy as maintenance, and its own rule string says the content review does
not cover recomposition at all. Its protein row is labelled EXTRAPOLATION. The option he singled
out is the one the engine supports least.

**Do NOT delete `GoalKind`.** It is the key into every energy and protein rule, all of which carry
verified citations. Changing it means changing coefficients, and no coefficient ships here without
a source.

Instead, put a two-axis chooser in FRONT of it and DERIVE the `GoalKind`:

- **Fat**: `lose` or `hold`
- **Muscle**: `gain` or `hold`

```
lose + hold  -> fat-loss
hold + gain  -> muscle-gain
lose + gain  -> recomposition
hold + hold  -> maintenance
```

That is the whole fix. The four combinations are exhaustive and the mapping is total, so the
chooser cannot produce a goal the engine has no rule for. It also stops the page claiming fat loss
and recomposition are alternatives, which was his actual objection: they are the same fat axis
with a different muscle axis beside it.

**Label them as outcomes, in his register**, not as jargon. He asked for "Build better habits?
Lose fat and regain muscle?". Write the four as plain sentences. Keep `GoalKind`'s member names in
the code exactly as they are.

**Rename the step to `Fitness Goal`.** R14: Title Case.

**Where `recomposition` is chosen, say what it costs.** `energyPlan` holds energy at maintenance
and the protein row is an extrapolation from the muscle-gain row. That is honest but it is not
free, and the `why?` disclosure must say the review does not cover it, in the same voice the other
basis strings use.

## Part 2 — Target body mass is replaced (C1.10.5)

> "instead of having a 'target body mass'' which is stupid, we need to have something more user
> friendly and intuitive. Target body mass can be muscle or fat. Dumb."

Correct, and `Profile.goal.targetBodyFatPct` **already exists in the schema and the wizard never
fills it** (`SetupWizard.tsx` writes `targetBodyFatPct: null`). Collect it.

Where a body-fat estimate exists, offer the target as a body-fat percentage and show the implied
fat mass and lean mass beside it, so the number means something physical. Where no estimate
exists, fall back to target body mass and SAY why the better option is unavailable. Keep
`targetMassKg` for that path; do not delete it.

## Part 3 — Order (C1.10.8, C1.10.9)

> "if I choose an unrealistic goal and a 2 day target, who will tell me that im being delusional?"

The order is settled and is NOT the one he first proposed. Finding B43: one page asks what you can
provide, the next asks what you want and when.

```
step 4  Equipment & Availability   equipment AND the weekly slots
step 5  Fitness Goal               the two axes, the target, AND the target date
```

Availability is already on step 4 after brief F. So by the time the target date is picked, the
training frequency is known and the feasibility model has its inputs. Do not move availability.

## Part 4 — The feasibility calendar (C1.11.2 to C1.11.5)

> "the calendar should be pastel colored with green colors. Pastel red, pastel orange, and pastel
> green. each color would mean 'Highly Improbable', 'Improbable', and 'Realistic'."

**The fat-loss axis is derivable and already exported.** `src/domain/nutrition.ts`:

```
FAT_LOSS_RATE_FRACTION = 0.007          Garthe 2011, target 0.7 %BW/week
FAT_LOSS_RATE_BOUND    = { loFraction: 0.005, hiFraction: 0.01 }   Helms 2014
```

Required weekly rate = (current mass - target mass) / weeks to the date, as a fraction of body
mass. Colour it:

- inside 0.5 to 1.0 %BW/week -> realistic
- above 1.0 and up to 1.5 -> improbable
- above 1.5 -> highly improbable
- below 0.5 -> realistic but slow; say so rather than colouring it a warning

**The muscle-gain axis is NOT derivable and must not be coloured.** `energyPlan` returns
`rateKgPerWeek: null` for muscle gain and its rule string says why: Garthe 2011 gives a total gain
but the review does not state the study duration, so no weekly rate can be derived. Reporting null
is the honest value. A muscle-gain-only target date renders **uncoloured**, with one line saying
no established weekly rate exists. **Do not invent one, do not interpolate one, and do not borrow
the fat-loss bound.**

**The engine never converts kcal to kg.** Hall 2011 rejects 3500 kcal/lb and the review supplies
no replacement. Drive the model from the RATE rule only. If you find yourself multiplying a
deficit by days, stop.

### Three things about the colours

1. **Colour cannot be the only carrier.** WCAG 1.4.1. Each band needs its word as well as its
   hue: `Realistic`, `Improbable`, `Highly Improbable`.
2. **These are three NEW hues on three skin grounds.** `src/ui/styles/tokens.css` records the
   decision they bend: "State colours are ink, not hues. Section 2.3 computed a ratio for five
   colours on this ground and for no others; an amber or a red invented here would ship an
   unmeasured contrast." So either compute the contrast for all three pastels on all three
   grounds and record it, or express the bands in the ink the skins already have. Do not add an
   unmeasured colour.
3. **Say it is an estimate.** The bands come from a prescribed rate, not a prediction about this
   user. One line, in the same honest register the basis strings use.

## Part 5 — The programme step disappears (C1.12.2, C1.12.4 to C1.12.6)

> "How many generated exercise days would be generated -like a Ahead Of Time compiler? if that's
> the case NO. It would be much better if each day's program can be more like a JIT compiler."

Finding B25: the step sets one number, `PlanTemplate.weeks`, bounded 8 to 24. Derive it from the
target date instead and DELETE the step. Two consumers keep reading `weeks` and must keep working:
`src/ui/components/Boot.tsx` prints "week X of Y", and `src/ui/components/TimeCapsule.tsx:145`
computes the capsule's opening date from it.

**The just-in-time change is a SPLIT, not a swap.** Finding B23. Three shipped features read the
forward plan and all three break under pure JIT:

- reminders send the instants of upcoming sessions to the Worker;
- the `.ics` export exports upcoming sessions;
- the Plan tab's whole content is the programme week by week.

So: **generate the SCHEDULE ahead** — dates, session labels, target volume — and **generate the
PRESCRIPTION just in time**, at session start, from what has actually been logged. Reminders, the
export and the Plan tab all keep working against the schedule; the exercises, sets and loads are
decided when the session begins.

**The deload stops being a calendar position.** `src/domain/plan/generator.ts` already labels the
four-week cadence a HEURISTIC and cites Bell 2023 (100 % panel agreement that pre-planned deloads
"might not be necessary") and Coleman 2024 (no hypertrophy benefit from a mid-programme deload).
The review's own recommendation is "autoregulate; keep a 4-8 week calendar backstop". Trigger the
deload from accumulated volume and completion, and keep the backstop so a deload cannot be
deferred for ever.

**This part is large.** If it does not fit one pass, do Parts 1 to 4 and STOP, and say so. A
half-migrated scheduler is worse than none.

## Verification

Everything in `00-CONTEXT.md`. Plus:

- `npx vitest run src/domain/plan/` — the generator's matrix must still pass for every
  sessionsPerWeek x experience x equipment x weeks x cardio cell.
- A test that every one of the four axis combinations maps to a real `GoalKind`.
- A test that a muscle-gain-only target date is NOT coloured.
- A test that the fat-loss bands sit exactly on `FAT_LOSS_RATE_BOUND`, so a later edit cannot
  drift them off the cited numbers.
