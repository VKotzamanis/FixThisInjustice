# Brief J: the intro, reworked

Read `00-CONTEXT.md` first. Claims r2.01, r2.02, r2.03, from
`docs/feedback/round-2/onboarding-owner-feedback.md`. **Read those three sections in his words
before you start.**

Files: `src/content/introSlides.ts`, `src/ui/intro/IntroSequence.tsx`, `src/ui/intro/intro.css`.

## 1. Delete the Skip control (r2.01)

> "(a) if I make it to the end, it's saved on my cache and this doesn't actually appear again
> (b) I don't want somebody to be able to skip the caveats the first time they open the app."

Remove the button, the any-key skip, and the `button.skipIntro` copy key. `ui.introSeen` already
stops the sequence returning, so the control only ever let a first-time reader skip the caveats,
which is the one thing it must not do.

**Remove the INTRO's skip only, `button.skipIntro`. Leave Boot's `button.skipBoot` alone.** The
intake assessment flagged an apparent conflict: he says "remove the SKIP" at r2.01 and "works
perfectly" at r2.04, whose part id is `intro.skip`. Ruled here, not escalated: r2.04's step asked
him to press Skip and confirm the intro does not return on a reload, so "works perfectly" is praise
for the seen-flag mechanism, which stays. r2.01 gives two reasons for removing the control anyway
and both stand. Praise for a mechanism is not a request to keep the escape hatch that exercises it.

Advancing between slides stays a click or a tap. Only the escape hatch goes.

## 2. The prose, restructured (r2.02)

> "You are being too corporate and neutral."

**Load the `wait-what` skill before rewriting a word.** That is the skill he means by "I don't get
it" and "ELI5". The slides are currently walls of text; his instruction is bullet points,
subsection headings, and emphasis used to break monotony.

His own worked example, to follow rather than to improve on:

- A subsection title, **bold**, white highlight, fuchsia-pink letters: `Purpose of the App`
- Under it, an *underlined* lead phrase then the sentence:
  *Simplify the fitness habit*: you get a day-to-day plan for what to lift and how.

So each slide becomes: a heading, then two to four bullets, each led by a short emphasised phrase.
Keep his content and his jokes. Cut the connective prose that turns three facts into a paragraph.

**Emphasis is a house style, not per-slide decoration.** Add classes to `intro.css` for the
highlight, the lead phrase and the subsection title, and use them consistently. He said "do not
over do it": at most one highlighted title and one underlined lead per bullet group.

R14 governs the headings: Title Case, and a noun phrase.

**Do not soften the register.** He was explicit that the corporate voice is for a later, stripped
version of the app, not this one.

## 3. Transitions and typing (r2.03)

- Slides fade **in and out**. They currently only fade in.
- The **body** types out a character at a time. The **heading** does not: it appears whole, so the
  reader knows what the slide is before the text arrives.
- Both branch on `prefers-reduced-motion`, which prints the slide whole with no typing.

## 4. The tl;dr becomes an acknowledgement (r2.03)

Today it is a slide. It becomes a **modal over the previous slide**, bold, styled as a warning,
and it cannot be dismissed by clicking away, by pressing a key, or by any route except the
checkbox below.

The checkbox label is HIS SENTENCE. Correct grammar only; change nothing else:

```
I realise that asking for help from an actual human is necessary when I am unsure about my form.
I agree to use common sense and stop being shy to the detriment of my own health.
```

Only `I'm` expanded and `realize` set to the spelling the rest of the app uses. Do not make it
more formal, do not hedge it, do not add a second clause. He gave the reason: the risk being
guarded against is an injury, not hurt feelings.

The continue control stays disabled until the box is ticked. Store nothing: this is an
acknowledgement, not a consent record, and the app collects no such field.

Reuse `ModalShell`. **The close control goes upper RIGHT** — round 2 reversed round 1 on this
(r2.12), and every modal in the app should agree.

## Verification

Everything in `00-CONTEXT.md`, plus:

- A test that the sequence renders no control named Skip.
- A test that the continue control is disabled until the checkbox is ticked, and enabled after.
- A test that no animation is applied under `prefers-reduced-motion`.
