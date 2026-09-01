# UI redesign — four directions

**Date:** 2026-09-01
**Scope:** visual direction only. No component code, no changes to `src/`, `legacy/`, or any plan.
**Deliverables:** four self-contained HTML mockups in this directory, plus this comparison.

| Direction | File |
| --- | --- |
| A — Console, evolved | `2026-09-01-design-A-console-evolved.html` |
| B — Clinical dashboard | `2026-09-01-design-B-clinical-dashboard.html` |
| C — Editorial protocol | `2026-09-01-design-C-editorial-protocol.html` |
| D — Coach board | `2026-09-01-design-D-coach-board.html` |

Each file shows three stacked 390 × 844 screens — Today, Train, Week review — with sample data drawn
from the type contract in `docs/plans/2026-09-01-00-master-plan.md` §5. Open any file in a browser;
no server, no build step, no external requests except the two local images noted below.

## Sample data, and why it is internally consistent

The same fictional user appears in all four files, so the directions can be compared on form rather
than content. Plan: 12 weeks, 4 sessions per week, 48 sessions, labels rotating Push / Pull / Legs /
Upper. Ten sessions completed and one skipped advance the cursor eleven times, so the cursor sits at
`nextSessionIndex = 11` and reads **session 12 of 48**; 12 mod 4 = 0, so session 12 carries the label
**Upper**. Availability is Mon, Tue, Thu, Sat with a weekly target of 4. The reviewed week
(2026-08-24 → 08-30) has 2 completed, 1 skipped and 1 slot not logged, giving **delta −2**. Today is
Tuesday 2026-09-01, 18:00 slot, 8 minutes out.

Two progression cases appear on every Train screen, one per unit system:

- **Barbell bench press, lb.** Every set reached 8 reps last session, so load advances. 2.5 % of
  135 lb is 3.4 lb, rounded up to the 5 lb barbell step → **140 lb**.
- **Lat pulldown, kg.** The smallest stack increment is 5 kg, which is 11 % of 45 kg and above the
  10 % ceiling, so the load holds and the rep target extends to **10–14** instead. The stack is
  marked in kg and is logged as entered, which is what `LoggedSet.enteredUnit` exists for.

The hydration cue reads "Drink to thirst" with no volume attached, per the content review's finding
that no fixed between-set volume is defensible.

## Verification, and what it returned

Stated before the work: each mockup must carry a viewport meta tag, produce no horizontal scroll at
390 px, keep every interactive control at or above 44 px in height, and keep every text run at or
above the WCAG contrast threshold for its size (4.5:1 body, 3:1 for large text).

A headless Chromium script measured all four at 390 × 844. It walks every text node, resolves the
effective background by compositing ancestor background colours, and computes the contrast ratio
against the element's own font size and weight.

**Result after two fix rounds: all four pass on all four criteria.** Two real defects were found and
repaired:

1. C used `--rule-2` (#b6ab96) for the unlogged-set marker — 1.98:1. Changed to `--ink-3`, 5.4:1.
2. All four docked action bars used a gradient scrim, so the scrolling list showed through the
   plan-altering buttons sitting on them. The bars are now opaque with a short gradient above.

One checker limitation is recorded rather than hidden: text over A's background image is measured
against the panel colour, not the image pixels. The image sits at 0.11 opacity behind a radial mask,
so the real deviation is small, but it was not sampled.

## A — Console, evolved

**Intent.** Keep the identity the current users chose, and fix what a gym floor breaks. The hero is
the session label at 44 px; the cursor line states `SESSION 12 OF 48` in the accent colour; a
seven-day compliance strip sits directly under it; the primary action is docked above a 56 px bottom
nav with the three plan-altering controls in the same band, always reachable. Rest is a thick
phosphor ring with the remaining time inside it and the absolute end instant beside it.

**Token set.** Inherits the whole `:root` block from `legacy/index.html`. Three changes:
`--text-3` moves from `#5a6270` to `#7e8896`, because the legacy value is 3.1:1 on `--bg` and fails
for body text; `--tap: 44px` and `--dock` are added to make the reach rules explicit rather than
scattered through media queries. The scanline layer survives at a lower amplitude (2.0 % instead of
2.2 %) because it costs legibility on a small screen for no gain.

**Cost.** The lowest of the four. The colour and type tokens port directly, subject to reconciling
the three conflicting accent definitions the code review recorded (A67). What has to be written is
layout, not language: the docked action band, the compliance strip, and the rest ring are new
components, but they draw on tokens that already exist and on `AsciiBar` and `ComplianceGrid`, both
of which the review already marks for reuse.

## B — Clinical dashboard

**Intent.** Read it at arm's length under a ceiling of LED panels. A dark screen in that light is a
mirror; a light one is not. Every question on the screen gets exactly one encoding, and no two
adjacent elements use the same one: a hero signed delta, a categorical seven-day compliance strip,
two line sparklines for load and body mass, and bullet bars with a shaded band for the protein
range. Rest is a plain 84 px numeral over a depletion bar — no ring.

**Token set.** A full replacement, not a re-skin. Ground `#f7f8fa`, ink `#101418`, one accent
`#1d4ed8` at 6.3:1, plus three status colours chosen for contrast on white rather than for hue
family: `#15803d` completed, `#b45309` below target, `#9a3412` skipped. What survives from the
legacy set is structural, not chromatic: no border radius, tabular numerals everywhere numbers
appear, mono for chrome and sans for content, the 16 px input floor, the 44 px tap floor.

**Cost.** Medium, with the cost concentrated in charts rather than chrome. `WeightChart` and
`PushupSpark` already have the right shape but hard-code a dark palette and a fixed axis domain
(A4); both need colour tokens and derived domains regardless of which direction wins. New here are
the sparkline pair and the bullet bar with a band, neither of which exists in the current build.

## C — Editorial protocol

**Intent.** Revive the typographic direction from the original Protocol prototype and give it a
phone. The session is a printed card with a ruled header band; the prescription is a table of
contents with leader rules and roman numerals; qualifications that would otherwise crowd the
interface are set as numbered footnotes. Rest is an engraved dial: two hairline circles and a 5 px
oxblood arc with a serif numeral inside.

**Token set.** Colour and type both replaced. Paper `#f4efe6`, ink `#1b1a17`, one accent — oxblood
`#8c2f21` at 7.3:1 — and a system serif display stack. The CRT layers go: scanlines, vignette and
flicker have no meaning on paper, which also removes the Tweaks controls that toggle them and the
user-tweakable accent, since the accent is load-bearing here rather than decorative. The generated
paper texture (`agy-artifacts/paper.jpg`, 21 kB) is laid at 25 % opacity; above roughly 35 % the
muted ink token drops below 4.5:1, so the opacity is a contrast constraint, not a taste setting.

**Cost.** The highest of the four, and the cost is not all CSS. Deleting the CRT layer removes three
Tweaks controls and the settings surface behind them. Serif display at these sizes needs real
optical sizing to hold up, and system serif stacks vary between iOS and Android more than the sans
stacks do, so this direction is the most likely to render differently on the two phones the group
actually uses.

## D — Coach board

**Intent.** One screen, one action. The session label is a filled slab (`UPPER · S12/48`), the
scheduled time is 80 px, the rest clock is 132 px, and the delta is 120 px. Plan progress is a
stacked bar of completed / skipped / remaining rather than a percentage, so a skipped session stays
visible instead of being absorbed into a number. The lb–kg toggle sits at the top of both training
screens as a 48 px segmented control, and it works in the mockup: it converts displayed loads
through `KG_PER_LB` while the kg-marked machine stack stays pinned to kg.

**Token set.** Colour replaced, type largely retained. Ground `#0d0f11`, white ink, one signal
colour `#ffd400` at 13:1 both as text on the ground and as ground under black text. Mono is demoted
to timestamps and set identifiers; everything that carries a number is sans at weight 800 with tight
tracking and tabular figures. `--tap` rises to 48 px, above the 44 px floor, because the target
users are tapping with chalked or sweaty hands.

**Cost.** Medium. The token swap is mechanical, but the display-numeral scale is new, and the unit
toggle is a new control that has to appear in every training view and stay consistent with the
profile's stored unit. The risk is stylistic: yellow-on-black is one bad copy decision away from
looking like a supplement advertisement, and this app has already rejected that register once.

## Comparison

| | A — Console | B — Clinical | C — Editorial | D — Coach board |
| --- | --- | --- | --- | --- |
| **Legibility under gym lighting** | Good. Phosphor on black is high-contrast but the panel reflects an LED ceiling. | Best. Light ground does not mirror overhead light; body text is near-black on near-white. | Good. Paper ground behaves like B; the serif is the limiting factor at small sizes, not the contrast. | Good in the dark, best at distance. 132 px numerals read across a rack; the black panel still reflects. |
| **One-hand use** | Good. Docked action plus minor controls in the same band; 44 px floor throughout. | Good. Same band structure; the 4-slot week meter is a reach target near the top, but it is read, not tapped. | Adequate. Same band, but the footnote-heavy screens are longer, so more of the content sits above the thumb. | Best. 48 px floor, one filled action per screen, and the rest controls are two 64 px half-width blocks. |
| **Implementation cost vs the legacy CRT stylesheet** | Lowest. Token set ports with one contrast fix and the A67 accent reconciliation. | Medium. Full colour replacement plus two new chart forms. | Highest. Full colour and type replacement, CRT layers and their settings deleted, cross-platform serif risk. | Medium. Full colour replacement, new numeral scale, new unit control in every training view. |
| **Fit with the clinical tone** | Strong. Terminal framing reads as instrumentation and has already been accepted by the users. | Strongest. Reads like a clinical chart; a signed delta in plain type neither scolds nor congratulates. | Strong, differently. Reads as a protocol document; footnotes make qualification native to the layout. | Weakest, and it is a live risk. Scale and one saturated colour are the sport-poster idiom; only the copy holds the line. |
| **Weekly data carried by the infographics** | Adequate. Compliance strip and target bars, but all three targets use the same bar form. | Strongest. Four distinct encodings, a shared 1.25 × target scale so bar lengths are comparable, a real band for the protein range, and a per-week history the others lack. | Adequate. The table is precise and the gauges are honest, but a table asks to be read rather than glanced at. | Good. The stacked bar is the best single idea in the set — it refuses to hide a skip — but three of the four target rows repeat one form. |

## Recommendation

<!-- decision: ui-direction-console-evolved-with-b-data-layer | status: adopted | supersedes: none -->

**Adopt A — Console, evolved — as the shell, and take B's data layer into it for the Week review and
Log views.** Two reasons, in order of weight. First, the users chose Console when three directions
were put side by side, and the brief for this round is a phone redesign, not a rebrand; changing the
identity spends the group's goodwill on a problem they have not reported. Second, A is the cheapest
direction to ship on a build that is already mid-migration to Vite and TypeScript, and every hour
not spent on CSS is an hour available for the plan cursor, reminders and the unit work, which are
what the users actually asked for.

The qualification is real and should not be softened: **A is the weakest of the four at carrying the
weekly data**, and A is also the direction most exposed to gym lighting, since a black panel under
LED ceiling panels becomes a mirror. Both are fixable inside A. B's four-encoding treatment —
sparkline for progression, categorical strip for compliance, bullet bar with a band for the protein
range, and a shared 1.25 × target scale — transplants into A's dark tokens without any change to its
geometry, and B's stacked per-week history has no equivalent in A. Take those. A high-brightness
variant that swaps A's ground for a light one, keeping the same layout, is worth prototyping before
launch; it is a token swap, not a redesign, precisely because A keeps colour in tokens.

Two further borrowings, both cheap:

- **D's stacked progress bar** (completed / skipped / remaining) replaces A's plain percentage. A
  percentage lets a skipped session disappear; the stacked bar does not.
- **D's prominent unit toggle.** The group is split across lb and kg gyms and several members are
  international. A unit setting buried in a profile screen will be wrong for somebody every week.

### Rejected alternatives

<!-- decision: ui-direction-clinical-dashboard | status: rejected | supersedes: none -->

**B — Clinical dashboard, rejected.** It wins on the two criteria that matter most in isolation:
legibility under gym light and the quality of its data display. It lost on identity and on cost. The
users picked the terminal look deliberately, and B discards it entirely — every colour token is
replaced, and the character the app is meant to keep (`docs/plans/…-00-master-plan.md` §2, "keep the
console character") is gone with them. Its data layer is the best in the set, which is why the
recommendation takes that layer rather than dismissing B outright.

<!-- decision: ui-direction-editorial-protocol | status: rejected | supersedes: none -->

**C — Editorial protocol, rejected.** It is the most distinctive of the four and the best fit for
honest qualification: footnotes let a caveat sit near its claim without shouting. It lost on three
counts. It was already rejected once by the same user when the three original prototypes were
compared. It is the most expensive to build. And a serif at display size is the least predictable
element in a cross-platform system font stack, which matters for a group split across iOS and
Android.

<!-- decision: ui-direction-coach-board | status: rejected | supersedes: none -->

**D — Coach board, rejected as a whole, adopted in parts.** Its ergonomics are the best in the set:
48 px targets, one action per screen, split tap zones on the rest timer, numerals readable at
distance. It lost on tone. The sport-poster idiom carries an implicit promise this app has
explicitly refused to make — the project rejected "Greek statue" framing once already — and holding
that line would depend entirely on copy discipline in a visual language that pulls the other way.
The two ideas that survive the tone objection, the stacked progress bar and the prominent unit
toggle, are taken into A.

## On the Gemini critique

A design critique round was run through `agy` and is logged in `REFERENCES.md`. It is a paraphrase
from another model; nothing in it is cited here as fact, and it shaped layout decisions only where
those decisions are independently defensible.

Two of its recommendations were adopted: put plan-altering controls directly above the primary action
rather than behind a menu, and split the rest screen into large tap zones instead of small buttons.
One was rejected outright. It proposed a hydration cue reading "HYDRATION CUE: 250 mL", a fixed
between-set volume. `docs/review/2026-09-01-content-peer-review.md` §3 and §8 record that no such
fixed volume is supported; replacement is judged from body-mass change across the session. All four
mockups therefore show "Drink to thirst" with no number.

Its claim that a ring "disappears under 1000-lux gym lighting" is unverified and was not treated as
evidence. A and C use rings, B and D use plain numerals — the split is deliberate, so the question
can be settled by looking at real phones in a real gym rather than by argument.

## What I did not do

- **No device testing.** Every check ran in headless Chromium at 390 × 844. Nothing was opened on an
  Android phone or an iPhone, no Safari rendering was checked, and no one-handed reach test was run
  on real hardware. The 44 px and 48 px floors are measured in CSS pixels, not verified with a thumb.
- **No gym-lighting test.** The central claim behind B — that a dark panel mirrors an LED ceiling —
  is an argument, not a measurement. It should be settled by holding two phones under the actual
  lights before any of it is built.
- **No colour-vision-deficiency check.** The `epic-infographics` palette validator was not run
  against any of the four palettes. B's green/amber/rust status triple is the most exposed: it is
  distinguishable by shape and label in the mockup, but the hues were not simulated.
- **No token file.** These are static HTML pages with inline CSS, not a `tokens.css` the Vite build
  can import. Whichever direction is chosen, the token set has to be written again as a real module.
- **Only three screens.** Plan, Log, Atlas, Export, the setup wizard, reminder settings and the
  motivation modal are all absent. So is every empty, error, offline and first-run state.
- **No system colour-scheme variant.** All four are fixed schemes. None responds to
  `prefers-color-scheme`.
- **No images for B or D.** One generated asset each was made for A and C. B and D use only CSS and
  inline SVG.
- **The knowledge graph was not updated.** The decision headers above are in the file but not in
  `graphify-out/graph.json`; running `graphify . --update` would write outside the paths this task
  was scoped to, and other agents were editing `src/` concurrently. Run it before treating the graph
  as current.
- **Nothing outside `docs/design/`, `agy-artifacts/` and `REFERENCES.md` was touched.** `src/`,
  `legacy/`, the plans and the reviews are unchanged.
