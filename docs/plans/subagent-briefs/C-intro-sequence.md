# Brief C: the intro sequence

Read `00-CONTEXT.md` first. Claims: C1.01.2 to C1.01.15, C1.02.2, C1.02.3, C1.02.4, C1.02.7.

The owner opens the app and lands straight on "Setup, step 1 of 9". They asked for an intro
before it: four slides of caveats, typed out, then a disclaimer, then a slide naming what setup
collects.

## Files

- Create `src/content/introSlides.ts` — the slide text. R10 reference text, NOT a copy table.
  Add it to R10 in `docs/design/2026-09-01-copy-contract.md` beside `bodyEquations.ts`, and give
  it `src/content/introSlides.test.ts` modelled on `src/content/bodyEquations.test.ts`.
- Create `src/ui/intro/IntroSequence.tsx` and `src/ui/intro/intro.css`.
- Modify `src/domain/types.ts` — add `introSeen: boolean` to `UiPrefs`.
- Modify `src/domain/schema.ts` — `UiPrefsSchema` around line 492 AND the seeded defaults object
  around line 692. `bootSeen` beside it carries no default, so give `introSeen` one explicitly:
  `.default(false)`. `CURRENT_SCHEMA_VERSION` stays 3; this is an additive field.
- Modify `src/app/App.tsx` — gate the sequence on `ui.introSeen`, ahead of the existing boot gate.

## Behaviour

Five slides, advanced by a click or tap anywhere, or by any key.

- The body text types out one character at a time. Roughly 18 ms per character.
- Each slide fades in over about 1.2 s.
- Each slide REPLACES the one before it. They do not accumulate.
- A Skip control is visible on every slide, matching `button.skipBoot`'s treatment in
  `src/ui/components/Boot.tsx`.
- Finishing or skipping sets `ui.introSeen = true` and the sequence never returns.
- Under `prefers-reduced-motion` there is no typing and no fade: each slide appears whole.
- At the foot of slides 1 to 4, an ASCII figure and a hovering line reading `Click to continue...`

**The ASCII figure is ORIGINAL.** The owner's note named a cartoon character; that is third-party
IP and the repository states its mascot art originates with the project. Draw a small original
figure in ASCII, a stick figure flexing, no more than 8 lines by 20 columns. Keep it in
`introSlides.ts` as a string constant.

## The text. Copy it EXACTLY

Slide 1, no heading:

```
Hi. You probably have this link because V sent you the app he has been working on. If not, here
are some caveats.
```

Slide 2, heading `Who am I`:

```
The creator of this app is not a medical professional and has not actively pursued bodybuilding
since 2020. That said, he is the guy who will come to the gym with you, teach you how to lift,
and build you a plan.
```

Slide 3, heading `Purpose and functions`:

```
The purpose of this app, webpage really, is to make going to the gym somewhat stress free, by
handing you a plan for what to lift, when, and how. It is also a fitness diary, and yes, that
phrase is as unpleasant to write as it is to read. It is built so that logging an exercise,
cataloguing your progress and seeing whether you are drifting off your goal are all easy. There
are some things in it I like: a reminder on your gym day, an atlas of odd facts that unlocks as
you go, and my own favourite, something that berates you when you slack off.
```

Slide 4, heading `Motivation`:

```
Two reasons. First, this should be open and free. Most people I know cannot spend 150 dollars a
session on a personal trainer, and the fitness apps I have tried are generic and keep the useful
part behind a paywall. Second, exercise should not feel like a chore to get through, so there
are small games to play during the rest between hard sets.

The concept was a solo project to get myself back in shape. The code was written with Claude
Code, and this repository is the only official one.
```

Slide 5, the disclaimer. It is emphasised by a slow pulse, NOT a flash. Nothing on this page may
flash more than three times a second, which is a seizure risk under WCAG 2.3.1, and the pulse is
disabled entirely under `prefers-reduced-motion`.

```
Tl;dr: do not be MJT attempting what looks like a pull-up. If you are unsure of an exercise, skip
it and ask someone who works at your gym to show you. Consider yourself warned and me not liable.
```

Slide 6, heading `Before we launch`:

```
You need to give me three things: your preferred settings, your personal information, and your
fitness goal and schedule.
```

## Two claims in that text the repository does not yet support

Both are the owner's decision, already taken, and they ship as written:

1. **Small games during rest.** None exist yet. The owner confirmed they are in scope and will be
   built. Add a comment in `introSlides.ts` recording that slide 4 promises a feature which must
   ship before the app is shown to anyone but the owner.
2. **Open and free.** Add a `LICENSE` file at the repository root containing the MIT licence,
   copyright 2026 V Kotzamanis. Add `"license": "MIT"` to `package.json`. Add a licence line to
   `README.md`. The owner chose MIT.

## Copy keys

Only the controls, which are short and live in `copy.ts` normally:

- `button.skipIntro` = `Skip` (R1: 1 word)
- `advice.clickToContinue` = `Click to continue` (R3: 3 words)

## Verification

Everything in `00-CONTEXT.md`, plus a test that the sequence sets `introSeen` and does not render
when it is already true.
