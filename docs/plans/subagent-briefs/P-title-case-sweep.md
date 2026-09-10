# Brief P: the Title Case sweep

Read `00-CONTEXT.md` first. Copy contract R14. **Run this when no other brief is live**: it touches
`src/content/copy.ts` broadly and will conflict with anything else editing the copy table.

Files: `src/content/copy.ts`, and `.github/workflows/ci.yml` for the last step only.

---

## 1. What this is

`scripts/check-title-case.mjs` reports **139 of 234 naming keys are not Title Case**, measured
2026-09-09. Re-run it for the real number; the pool grows with every brief. The owner raised R14
three times and then said he would stop mentioning it, which is why it became a script. The script
has never been in CI because it has never been green.

Your job: take it to **0 of N**, then add it to CI.

## 2. Read the script's own header before you touch anything

`scripts/check-title-case.mjs` documents its rule and its two exemptions in its first 25 lines.
Read them. The summary, so you know what you are looking for:

**The rule.** Capitalise the first word, the last word, and every word between them EXCEPT articles,
coordinating conjunctions and prepositions of four letters or fewer. The exact list is `SMALL` in
the script: `a an the and but or nor for so yet of in on at to with from by as per vs`. So
`Units on the Weight Plates`, `Time Zone`, `What You Told Me`.

**It scans five key families only**, the `NAMING` array: `label.`, `hero.`, `step.`, `group.`,
`button.`. Nothing else.

### The two things it deliberately does NOT touch, and you must not either

<!-- decision: title-case-skips-skin-tables | status: adopted | supersedes: none -->

1. **THE SKIN TABLES.** `src/content/copy.limelight.ts` is deliberately lower case ("go on", "the
   look"). `src/content/copy.board.ts` is deliberately upper ("PROCEED"). **Both registers are
   recorded decisions and both are correct as they stand.** R8 and R9 already scope themselves to
   the default table for the same reason. If you Title Case a skin table you will silently undo two
   deliberate design choices and the script will not stop you, because it never looks there.
   **Edit `src/content/copy.ts` and nothing else.**
2. **UNIT SYMBOLS.** The `UNIT` set: `s kg lb ml min g kcal mib cm mm ms m ft in h oz fl`. Case IS
   the quantity. `(kg)` stays `(kg)`, `+30 s` stays `+30 s`. Title-casing a symbol states a
   different quantity, which is a units error, not a style error. R12 guards these.

## 3. Do the mechanical half. Do NOT do the judgement half

R14 has two clauses and the script can only check one.

- **Clause one, mechanical:** naming keys are Title Case. That is yours. Fix all 139.
- **Clause two, judgement:** a heading is a NOUN PHRASE, not a sentence or a question. The script's
  header says plainly that nothing in a string says whether it was meant as a heading, so that half
  is review. **It is not yours.**

So `label.name`, currently `"How should I refer to you?"`, becomes `"How Should I Refer to You?"` —
Title Case, still a question. That is the correct output of this brief. **Do not rewrite it into a
noun phrase.** The owner wrote that sentence and its voice is his.

**Instead, LIST them.** Your report must carry a section naming every string you Title Cased that is
still a sentence or a question rather than a noun phrase, so the owner can decide whether he wants
it reworded. That list is the deliverable for clause two. Ten or so are expected; `hero.` keys are
the likeliest.

## 4. Shared keys change everywhere at once

Title Case changes VALUES, not key names, so no call site breaks. But a shared key renders in many
places and you should read each before you change it:

- `error.valueRequired` has ten call sites.
- `disclosure.why` has six.
- `button.continue` is overridden per skin, and `button.introContinue` mirrors it.

None of those three is in a `NAMING` family, so they may not even be in your 139 — check rather
than assume. The principle holds for any key that is: grep its call sites and confirm the new value
reads correctly at every one.

## 5. Regenerate the catalogue

You are changing 139 copy strings, and `docs/feedback/catalogue.json` pins every one byte for byte.

```
node scripts/alpha-catalogue.mjs
node scripts/alpha-catalogue.mjs --check
node scripts/alpha-walk-pages.mjs
node scripts/alpha-walk-pages.mjs --check
```

You are adding and deleting no keys, so `alpha-parts.mjs` and `alpha-walk.mjs` need no change.

## 6. Add it to CI, and only then

**Only after `node scripts/check-title-case.mjs` reports `0 of N`.** Adding it while it still fails
turns every subsequent push red, which is why it was kept out until now.

`.github/workflows/ci.yml` already runs `npm run lint`, `npm run typecheck`, `npm run test:tz` and
`node scripts/check-no-emoji.mjs`. Add the title-case check beside the emoji one, in the same shape,
with a one-line comment saying what it guards.

## Verification

Everything in `00-CONTEXT.md`, plus:

- `node scripts/check-title-case.mjs` reports **0 of N**. This is the gate.
- `git diff --stat src/content/` shows `copy.ts` and NOTHING else. If `copy.limelight.ts` or
  `copy.board.ts` appear in your diff, you have broken section 2 and must revert those files.
- No unit symbol changed case: `git diff src/content/copy.ts | grep -iE '\(kg\)|\(lb\)|\(ml\)|kcal| s\b'`
  and read every hit.
- The full suite, unchanged in count. A copy-string change should break no test that the catalogue
  regeneration does not fix.
