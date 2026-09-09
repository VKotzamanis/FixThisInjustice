# Brief I: the goal, the target date, and the programme

Read `00-CONTEXT.md` first. Claims: C1.10.2 to C1.10.9, C1.11.2 to C1.11.5, C1.12.2, C1.12.4 to
C1.12.6. Seventeen claims, setup steps 5 to 7.

The owner's own words are in `docs/feedback/round-1/w0-w1-owner-feedback.md` under `[w1.10 |
setup.goal]`, `[w1.11 | setup.availability]` and `[w1.12 | setup.programme]`. **Read all three
before you start.** This brief resolves them; it does not replace them.

The reasoning behind every ruling here is in `docs/plans/2026-09-04-11-alpha-round-1-corrections.md`,
findings **B21, B22 and B23**. Read those three too. They are short and they carry the evidence.

---

## Files, and one ruling that stops you adding a field you do not need

**Verified against the tree on 2026-09-09. Rule 5 stops you at the first unlisted file.**

<!-- decision: goal-axes-derived-not-stored | status: adopted | supersedes: none -->

**The two axes are DERIVED, not stored.** The mapping in Part 1 is a bijection: four axis
combinations, four `GoalKind` members, total in both directions. So the chooser reads its state
back OUT of `goal.kind` and writes only `goal.kind`. **Do not add `fatAxis`/`muscleAxis` to
`Profile`, do not bump `schemaVersion`, and do not write a migration.** Two fields that must agree
are two fields that can disagree, and this app already stores the answer.

| File | What changes |
| --- | --- |
| `src/ui/setup/SetupWizard.tsx` | Steps 5 to 7. The step ids are at line 129 and their copy keys at 148-150. The two-axis chooser, the body-fat target, the target date and the feasibility calendar all live here |
| `src/ui/setup/SetupWizard.test.tsx` | The four axis-combination tests and the uncoloured-muscle-gain test |
| `src/domain/types.ts` | `goal` is at line 124 and ALREADY has the shape you need: `{ kind: GoalKind; targetMassKg: Kg \| null; targetBodyFatPct: number \| null; targetDate: LocalDate \| null }`. `targetBodyFatPct` exists and the wizard never fills it. **Collect it. Add no field.** `GoalKind` at line 54 is unchanged |
| `src/domain/nutrition.ts` | Read only, unless the feasibility model needs a helper exported. `FAT_LOSS_RATE_BOUND` is already exported at line 258 as `{ loFraction: 0.005, hiFraction: 0.01 }`, and `rateKgPerWeek` returns `null` for muscle gain at line 448. **Change no coefficient** |
| `src/domain/nutrition.test.ts` | The test that the fat-loss bands sit exactly on `FAT_LOSS_RATE_BOUND`. Read the bound from the module; do not restate 0.005 and 0.01 as literals |
| `src/ui/styles/tokens.css` | The three pastel fills. The decision they bend is recorded at lines 160-163: "State colours are ink, not hues... an amber or a red invented here would ship an unmeasured contrast." **Update that comment to record the measurement in Part 4, do not leave it contradicting the code** |
| `src/ui/setup/setup.css` | The calendar's layout, including the limelight panel constraint in Part 4 |
| `src/content/copy.ts` | The four outcome sentences, the band words, the step rename to `Fitness Goal`. Union AND table |
| `src/content/copy.test.ts` | `LENGTH_EXEMPT` (line 159) only if you add an R10 module |
| `scripts/alpha-parts.mjs`, `scripts/alpha-walk.mjs` | A part and one step per new key |

**Do NOT touch `src/domain/plan/`, `src/domain/schema.ts`, `src/domain/migrations/`,
`src/ui/components/Boot.tsx` or `src/ui/components/TimeCapsule.tsx`.** Those belong to Part 5,
which is another agent's brief. See the note at the head of Part 5.

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

   **Measured 2026-09-06, by the asset-intake session, WCAG 2.1 relative luminance, sRGB.** One
   HSL family, hue-only variation (S 62%, L 78%), so the three read as siblings:

   | band | hex | vs `--bg` clinical `#0a0b0c` | vs `--bg` limelight `#8ace00` | vs `--board` `#0b0b0c` | vs limelight `--panel` `#000000` |
   | --- | --- | --- | --- | --- | --- |
   | realistic (green) | `#a4eab0` | 14.05:1 | **1.37:1 — fails** | 14.03:1 | 14.97:1 |
   | improbable (orange) | `#eac9a4` | 12.56:1 | **1.23:1 — fails** | 12.54:1 | 13.39:1 |
   | highly improbable (red) | `#eaa6a4` | 9.84:1 | **1.04:1 — fails** | 9.83:1 | 10.49:1 |

   Ink text (`#000000`) on any of the three fills clears 10.49:1 to 14.97:1 — never the
   constraint. **The constraint is the fill against its own page ground, and it fails exactly
   where the existing decision predicted: on raw `--bg` in limelight**, where a light pastel sits
   on a light lime ground at 1.0-1.4:1, below even the 3:1 non-text minimum (WCAG 1.4.11) — the
   band would be functionally invisible.

   **Resolution: these three fills render inside limelight's `--panel` (`#000000`), never on
   `--bg` directly** — the same move already made for the setup-wizard icons and the top bar,
   which hit the identical lime-ground problem. On clinical and board, which are already
   near-black, the raw page ground works with no panel needed. This is a **layout constraint on
   the calendar component**, not a colour change: in limelight, calendar cells carrying a band
   colour need the inverted-panel surface (or an equivalent dark card), not the bare page
   background. Do not re-derive the palette to fit the lime ground instead — a pastel light enough
   to read as "green" against black will not read as distinct from lime, and pastel-on-pastel is
   the failure this measurement exists to catch.
3. **Say it is an estimate.** The bands come from a prescribed rate, not a prediction about this
   user. One line, in the same honest register the basis strings use.

## Part 5 — MOVED to brief I2, and not yours

<!-- decision: brief-i-split-at-part-4 | status: adopted | supersedes: brief-i-single-pass -->

The programme step, the just-in-time split and the autoregulated deload were Part 5 of this brief.
They are now `docs/plans/subagent-briefs/I2-jit-scheduler.md`, reproduced there verbatim, and they
are round 3's first brief.

**Implement Parts 1 to 4 and stop.** Do not delete the programme step, do not touch
`src/domain/plan/`, `src/domain/schema.ts`, `src/domain/migrations/`, `src/ui/components/Boot.tsx`
or `src/ui/components/TimeCapsule.tsx`. The split follows this brief's own instruction that a
half-migrated scheduler is worse than none.

## Verification

Everything in `00-CONTEXT.md`. Plus:

- `npx vitest run src/domain/plan/` — the generator's matrix must still pass for every
  sessionsPerWeek x experience x equipment x weeks x cardio cell.
- A test that every one of the four axis combinations maps to a real `GoalKind`.
- A test that a muscle-gain-only target date is NOT coloured.
- A test that the fat-loss bands sit exactly on `FAT_LOSS_RATE_BOUND`, so a later edit cannot
  drift them off the cited numbers.
