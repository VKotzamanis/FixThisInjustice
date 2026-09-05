# Brief A: delete the readiness screen, build the guidance screen

Read `00-CONTEXT.md` first. Claims: C1.13.2, C1.13.3, C1.13.4, C1.13.5, C1.13.6, C1.13.8, C1.15.

## What the owner said, verbatim

> This is the dumbest thing I have ever seen. I answered yes to all and the app was like "OK :)".
> What is even the point of it being there? Remove it completely. COMPLETELY. I am not an Urgent
> Care and I am not doing medical questionnaires. Instead replace that with something useful such
> as: "Based on your goals, I would reccomend xx mg of creatine. You can mix it in your smoothie
> or coffee. It's one of the most researched compounds, you have nothing to worry about.
> References below". "Coffee: This much mg /daily. I reccomend iced coffee before the workout but
> do not do milk and sugar" "Get a good bottle/mixer for smoothies and protein powder" and "For
> protein powder: aim for Isolate/ Concetrade/Peptide" etc.

Three of those instructions are corrected by evidence, and the corrections are already decided.
**Do not restore the owner's original wording for these three.** Use the copy in Part 3.

- The creatine dose is in **grams**, not milligrams, and the engine already computes it.
- "do not do milk and sugar" has **no evidence** behind it and does not ship.
- Isolate / concentrate / hydrolysate do **not** differ meaningfully. The advice is about total
  daily intake and third-party testing instead.

---

## Part 1 — DELETE the readiness screen

### These files are ALREADY DELETED

The orchestrator removed them before dispatching you:

```
src/ui/setup/ReadinessScreen.tsx          src/ui/setup/ReadinessScreen.test.tsx
src/content/readinessQuestions.ts         src/ui/components/ReadinessNotice.tsx
src/ui/components/ReadinessNotice.test.tsx  src/ui/components/readinessNotice.css
```

**The tree does not compile right now.** Every file below still imports one of them, and your job
is to make the tree whole again. This is the exact list, from a grep run just before you started:

```
src/store/index.ts          src/store/sessionMirror.ts     src/store/profile.test.ts
src/app/App.tsx             src/ui/views/TodayView.tsx     src/ui/views/TodayView.test.tsx
src/ui/views/TrainView.tsx  src/ui/views/SettingsView.tsx  src/ui/views/SettingsView.test.tsx
src/ui/setup/SetupWizard.tsx  src/ui/setup/SetupWizard.test.tsx
src/content/copy.ts         src/content/formCues.ts        eslint.config.js
```

Two on that list are NOT in the table below and you must still handle them:
`src/store/sessionMirror.ts` and `src/content/formCues.ts`. Look at what each references and
remove only the readiness part. If `formCues.ts` merely contains the word in prose, leave it.

### Edit these, because they import what you just deleted. **The build breaks if you miss one.**

| File | What to do |
| --- | --- |
| `src/ui/views/TodayView.tsx` | remove the `ReadinessNotice` import and its render site |
| `src/ui/views/TrainView.tsx` | remove the `ReadinessNotice` import and its render site |
| `src/app/App.tsx` | remove the `ReadinessGate` component and the route gate that checks `profile.readiness.screenedAt === null` |
| `src/app/App.test.tsx` | remove the `describe('readiness gate')` block |
| `src/store/index.ts` | remove the `recordReadiness` action and its entry in the store interface |
| `src/ui/views/SettingsView.tsx` | remove the readiness redo panel and its row |
| `src/ui/setup/SetupWizard.tsx` | remove `'readiness'` from `STEPS`, remove `READINESS_INSERT_INDEX`, remove `readiness` from `Draft` and `initialDraft()`, remove the readiness branch, remove `readiness` from `STEP_GROUP`, and remove the `ReadinessScreen` import |
| `eslint.config.js` | remove `ReadinessNotice.tsx` from the `files` override that grants it a sessionStorage exemption |

### DO NOT delete `Profile.readiness` from the schema

`src/domain/types.ts` and `src/domain/schema.ts` keep the field. `ProfileSchema` is a plain
`z.object` with no `.strict()`, so Zod **strips unknown keys silently** — deleting the field would
quietly destroy screening data already on a user's device with no error anywhere. Leave it.

At the wizard's Confirm step, keep writing the field with a literal:
`readiness: { screenedAt: null, flagged: false }`.

### Copy keys to delete

From `src/content/copy.ts` (the `CopyKey` union **and** the table), from `scripts/alpha-parts.mjs`
and from `scripts/alpha-walk.mjs`: every key beginning `readiness.`, plus `advice.readinessAnyYes`,
`advice.notMedicalAdvice`, `why.readiness`, `step.readiness`. Grep first; delete exactly what you
find, and list them in your report.

Also delete the catalogue parts `readiness.screen` and `readiness.notice` from
`scripts/alpha-parts.mjs`.

---

## Part 2 — The new step, in code

Create `src/ui/setup/GuidanceScreen.tsx` and add a `'guidance'` step to `STEPS` in
`SetupWizard.tsx` **at the index the readiness step used to occupy**, immediately before `review`.
Add `guidance: 'personal'` to `STEP_GROUP` and `guidance: 'step.guidance'` to `STEP_TITLE_KEY`.

The screen takes the profile's body mass in kg and renders four sections. It writes nothing to the
store. It has one control, the wizard's existing Next.

### The caffeine dose. Write this function EXACTLY as given, in `src/domain/nutrition.ts`

Do not change a number. Do not add a number.

```ts
/**
 * Caffeine, as an ergogenic dose for RESISTANCE training.
 *
 * Grgic J (2022), Nutrition 103-104:111604, DOI 10.1016/j.nut.2022.111604: 0.9-2 mg/kg is
 * sufficient for strength, muscular endurance and movement velocity. The wider 3-6 mg/kg band in
 * the ISSN position stand (Guest NS et al. 2021, J Int Soc Sports Nutr 18:1,
 * DOI 10.1186/s12970-020-00383-4) is evidenced mostly in ENDURANCE work, and at 70 kg its floor
 * already exceeds EFSA's safe single dose. This app prescribes lifting, so it prescribes the
 * resistance band and states the wider one as context rather than as a target.
 *
 * EFSA (2015), EFSA Journal 13(5):4102, DOI 10.2903/j.efsa.2015.4102: 200 mg is a safe single
 * dose and 400 mg a safe daily total for healthy adults. The returned range is CAPPED at the
 * single-dose figure, and the cap is disclosed on screen rather than applied silently.
 */
export const CAFFEINE_RESISTANCE_MG_PER_KG = { lo: 0.9, hi: 2 }; // mg/kg body mass
export const CAFFEINE_EFSA_SINGLE_MG = 200; // mg, one dose, healthy adults
export const CAFFEINE_EFSA_DAILY_MG = 400; // mg/day, healthy adults

export function caffeineDoseMg(massKg: Kg): { lo: number; hi: number; capped: boolean } {
  if (!Number.isFinite(massKg) || massKg <= 0) {
    throw new RangeError('caffeineDoseMg: massKg must be a finite number > 0');
  }
  const rawLo = CAFFEINE_RESISTANCE_MG_PER_KG.lo * massKg; // mg
  const rawHi = CAFFEINE_RESISTANCE_MG_PER_KG.hi * massKg; // mg
  return {
    lo: Math.round(Math.min(rawLo, CAFFEINE_EFSA_SINGLE_MG)),
    hi: Math.round(Math.min(rawHi, CAFFEINE_EFSA_SINGLE_MG)),
    capped: rawHi > CAFFEINE_EFSA_SINGLE_MG,
  };
}
```

Write a test for it in `src/domain/nutrition.test.ts`: at 70 kg the range is 63 to 140 mg and
`capped` is false; at 120 kg the top is 200 and `capped` is true; a mass of 0 throws.

The creatine dose already exists in that file as `creatineDoseG`. Use it. Do not write a second one.

---

## Part 3 — The words. Copy these EXACTLY

Long reference text, so it goes in a new module `src/content/supplementGuidance.ts`, NOT in a copy
table. Amend R10 in `docs/design/2026-09-01-copy-contract.md` to name the new module, the way
`bodyEquations.ts` is named there. Write `src/content/supplementGuidance.test.ts` modelled on
`src/content/bodyEquations.test.ts`: assert R5, R6, R11, no URL, and that every DOI printed also
appears in `src/domain/nutrition.ts`.

Slots in braces are filled by a `FORMAT` frame with the user's own numbers. Leave them as slots.

```
CREATINE
Heading: Creatine
Body: Creatine monohydrate, {dose} g a day, from your body mass. There is no loading phase and
no need for one. Mix it into a smoothie or coffee; it does not matter when you take it. It is
among the most studied supplements in sport, and in healthy adults the trials have not found
harm. Monohydrate only: ethyl ester and buffered forms are rejected on muscle uptake, which is
the outcome their marketing claims.
Caution: If you have kidney disease, ask a doctor first. That is the one caution the evidence
supports, and it is not a general one.
Sources: Kreider RB et al. (2017), J Int Soc Sports Nutr 14:18. DOI 10.1186/s12970-017-0173-z
Antonio J et al. (2021), J Int Soc Sports Nutr 18:13. DOI 10.1186/s12970-021-00412-w

CAFFEINE
Heading: Caffeine
Body: {lo} to {hi} mg, about an hour before you lift. That is the range shown to help strength
and muscular endurance, and it is smaller than the dose usually quoted, which comes from
endurance research. Coffee works as well as a capsule at a matched dose, so iced coffee before
the gym is a fine way to take it. Whether milk and sugar change the effect has not been tested,
so this app makes no claim either way.
Caution: EFSA puts a safe single dose for healthy adults at 200 mg and a safe daily total at
400 mg. Habitual coffee drinking may blunt the effect; the evidence is mixed. Not for pregnancy
without medical advice, and not for adolescents.
Sources: Grgic J (2022), Nutrition 103-104:111604. DOI 10.1016/j.nut.2022.111604
Guest NS et al. (2021), J Int Soc Sports Nutr 18:1. DOI 10.1186/s12970-020-00383-4
EFSA (2015), EFSA Journal 13(5):4102. DOI 10.2903/j.efsa.2015.4102

PROTEIN
Heading: Protein powder
Body: The form does not matter. Isolate, concentrate and hydrolysate produce no meaningful
difference in muscle gain; what differs is lactose content and price. Buy on those. What does
matter is the daily total, which this app computes for you, spread across at least four meals at
roughly 0.4 g per kg of body mass each. Powder is convenience, not necessity: whole food meets
the same target.
Caution: Buy a product carrying third-party testing. Of 634 supplements sampled across thirteen
countries, 14.8 per cent held undeclared anabolic steroids, and a 2025 sample of 200 online
products found 35 per cent carrying substances banned in sport.
Sources: Castro LHA et al. (2019), Nutrients 11(9):2047. DOI 10.3390/nu11092047
Schoenfeld BJ, Aragon AA (2018), J Int Soc Sports Nutr 15:10. DOI 10.1186/s12970-018-0215-1
Morton RW et al. (2018), Br J Sports Med 52:376-384. DOI 10.1136/bjsports-2017-097608
Geyer H et al. (2004), Int J Sports Med 25(2):124-129. DOI 10.1055/s-2004-819955

KIT
Heading: Kit
Body: A shaker bottle with a wire whisk ball, and a scale that reads to a tenth of a kilogram.
Neither claim is a research finding; they are the two things that make logging and mixing less
annoying.
```

New copy keys needed in `copy.ts`, short strings only, all inside the contract:

- `step.guidance` = `Getting started`
- `hero.guidance` = `A few things worth knowing` (R2: 5 words, fits)
- `label.caution` — check whether it already exists before adding it. It does; reuse it.

---

## Part 4 — Verification

Run everything in `00-CONTEXT.md`, plus:

```
grep -rn "ReadinessScreen\|ReadinessNotice\|recordReadiness\|readinessQuestions" src/ | grep -v Binary
```
Expect **no output**. Any hit is a dangling reference.

```
grep -rn "readiness" src/domain/types.ts src/domain/schema.ts
```
Expect **hits**. The schema field stays.

Report per `00-CONTEXT.md`.
