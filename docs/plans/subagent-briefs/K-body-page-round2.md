# Brief K: the body page, round 2

Read `00-CONTEXT.md` first. Claims r2.10 to r2.16 from
`docs/feedback/round-2/onboarding-owner-feedback.md`. **Read all seven sections in his words
before you start.** Also read Part A of `docs/plans/2026-09-06-12-round-2.md`: two rulings there
decide this brief and are not yours to revisit.

This is one brief and not several because r2.11 and r2.16 interact and he said to keep them
together.

Files: `src/ui/setup/SetupWizard.tsx`, `src/ui/setup/setup.css`, `src/content/sexRationale.ts`,
`src/content/bodyEquations.ts`, `src/content/copy.ts`, and the schema for the two data changes.

---

## 1. The page overflows a phone (r2.10)

> "The page is a bit wider/ doesn't fit in the phone."

A defect, not a preference. The two-column rows added in round 1 do not collapse early enough.
Fix and prove it: the step must not scroll sideways at 390 px, the iPhone reference width. jsdom
performs no layout, so assert the CSS rule that guarantees it rather than a measured width, and
record the manual pass in `docs/phone-visual-check.md`.

He likes the boxes. Keep them. This is a breakpoint problem, not a structure problem.

## 2. `ND` for sex, and commit-on-Next (r2.11)

**Both rulings are in Part A of the round-2 plan. Read them there.** In summary:

- The sex control is **deselectable**: clicking the selected option clears it back to `ND`.
- `ND` is the **default**, not an error state. Next does not block on it.
- **`ND` makes body fat REQUIRED**, because Mifflin-St Jeor has no sex-free form and averaging its
  two constants would invent a coefficient.
- **`ND` disables the tape method**, because the Navy equations differ by sex in FORM. Show the
  option, disabled, with one line saying why. Do not hide it.
- **`ND` shows the beverage target as a RANGE**, 2200 to 3000 mL, with a line saying the reference
  intake is published per sex. Do not average, do not pick one.

`Sex` becomes `'male' | 'female' | 'nd'` in `src/domain/types.ts`, additive with a `.catch()` so a
stored document cannot fail. Every consumer must handle `nd`: `computeTargets`, `dailyBeverageTargetML`,
`estimateBodyFatNavy` and the Navy site labels. **A switch that silently falls through to `male` is
the worst possible outcome here** — make the type force the branch.

**Commit-on-Next.** A field edits a per-step buffer; the buffer is written into the draft only when
Next is pressed. Back does not commit.

**The trap, and it must be solved not discovered:** round 1's most valued feature is that setup
survives a closed browser. If a field only reaches the draft on Next, closing mid-step loses the
step. **Persist BOTH tiers** — the committed draft and the in-progress buffer — so a reload
restores the half-typed values and the committed answers separately. A test must prove it: type
into a step, do not press Next, simulate a reload, assert the typing survived AND that the draft
was not overwritten.

**The name box takes the skin's own styling** (r2.11), so the name reads as the app's voice rather
than as a plain input. Style only; the value is the user's text and is never altered.

## 3. The sex modal, restructured (r2.12)

- **The close control moves to the upper RIGHT.** This REVERSES round 1's ruling, and
  `src/ui/setup/setup.css:566-571` records the old one in a comment citing C1.07.11 — **update that
  comment, do not leave it contradicting the code.** He gave a reason ("more intuitive") and
  `FormCuesModal` already closes upper-right, so this makes the app consistent rather than
  inconsistent. Make it bold and high contrast, and say in your report which other modals you
  aligned.
- **Load `wait-what` before rewriting the prose.** That is the "I don't get it" / ELI5 skill he
  names. The text is currently a wall; it becomes subsection headings and bullets.
- **Follow his rubric exactly**, in this order: introduce the topic; describe one function; give
  that equation; describe the other function; give that equation; close with a short comparison.
  The two equations currently sit together and are referenced from different places, which is what
  he objected to. Move each one to its own point of use.
- **Segment two gets subsection headings**, his words: `Still an Open Research Question`, then
  `What We Know`, then `I Do. So, What Now?`. R14 applies: Title Case.
- **Leave space beside the last heading for a sprite.** He is supplying it. A placeholder at text
  height, commented to the register row. Do NOT draw or generate one.
- **The gender-affirming heading takes bold theme colour on a white highlight** — fuchsia pink on
  limelight, `var(--accent)` so the other skins resolve their own.
- **Move the reference out** and into the page's single reference list. See section 5.

## 4. The body-fat block (r2.13, r2.14)

- Body fat gets **its own bordered box**, holding everything about body fat including its sources.
- **The `why?` disclosure goes.** Its role is replaced by **citation superscripts** on the labels,
  each pointing into the reference list: `Percentage²`.
- `Optional. With it...` moves **above** the percentage field. `Click here to estimate` moves
  **below** it.
- A subheading, `Body Fat Estimate`, over the whole tape section, so it is obvious the tape
  produces a body-fat number. He said it currently is not clear.
- **The tape fields ALREADY change with the selected sex.** `SetupWizard.tsx:1815-1845` renders
  the hip field only for female and already swaps the waist label between `quantity.abdomenII` and
  `quantity.abdomenI`. **Do not rebuild it.** Verify it, and add only the `ND` branch: under `ND`
  the whole tape block is disabled per section 2.
- **Each girth field pairs with its diagram in a two-column row** — the diagram beside the input,
  not stacked above the group.
- The `why?` becomes a **`Disclaimer`** box below the US Navy line, carrying HIS text, grammar
  corrected only:

```
FYI: the fields differ between male and female in this method. For the best results, have somebody
else measure you; the tape should be horizontal and must NOT follow your body curves.
```

The old contents, naming which girths to enter, are removed: the fields themselves now say that.

## 5. The references (r2.15)

> "This is great but the format is bad."

- All citations move into **one collapsible `REFERENCES` box** at the foot of the step, in the
  pattern the `why?` disclosures use. Centred, larger than body text, theme-coloured.
- **Fix the double numbering.** Entries currently read `2. ¹ Body-fat percentage...`, an ordered
  list carrying superscripts of its own. Use ONE numbering scheme: the superscript on the label is
  the entry number, and the list is not separately enumerated.
- **Reformat every citation into Elsevier style.** Author initials after surname, journal
  abbreviated, volume(issue):pages, year, DOI last.
- **Above each citation, one bold sentence saying what it is for**, consistently. His example:
  `Methodology for deriving body fat from body measurements: US Navy.` then the citation beneath.
- **Every DOI must already appear in the engine that uses it.** `src/content/bodyEquations.test.ts`
  asserts this; keep that test passing. **Do not add a citation that no engine cites.**

## 6. The invalid-field cue (r2.16)

- **The shake ALREADY SHIPS and the vibration is already harmless.**
  `SetupWizard.tsx:1216-1241` shakes the invalid element, gated on `prefers-reduced-motion`, and
  calls `vibrate()` only as an additive cue; `src/ui/audio/chime.ts:173-175` makes that a no-op
  wherever `navigator.vibrate` is absent, which covers his desktop case exactly. **Verify, do not
  rebuild.** What he is actually missing is the second half of his own request, below.
- **THIS IS THE REAL WORK OF SECTION 6: every missing field is marked at once**, not one per
  press. Today the cue lands on the first invalid field only, so he has to press Next repeatedly to
  discover them one at a time. Mark them all on a failed Next. His spec, followed literally because
  it is simple and it works: white fill, bold red border. Use a token for the red; do not add a hex
  literal to a component stylesheet.
- Focus still moves to the first invalid field, and it still scrolls into view.

## Verification

Everything in `00-CONTEXT.md`, plus:

- `ND` with no body fat blocks Next; `ND` with a typed percentage does not.
- `ND` disables the tape option and the disabled state is announced, not merely greyed.
- `dailyBeverageTargetML` under `ND` returns the range and no consumer prints a single figure.
- A reload mid-step restores the buffer without overwriting the committed draft.
- The female tape form asks for hip; the male form does not.
- At 390 px the step's container rule prevents sideways scroll.
