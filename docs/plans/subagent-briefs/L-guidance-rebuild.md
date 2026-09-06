# Brief L: the guidance screen, rebuilt

Read `00-CONTEXT.md` first. Claim r2.18. **Read his words for that step before you start.**

**This brief goes to ONE agent on the strongest model available.** His instruction, verbatim:
"Give this slide to an Opus 5 subagent and ask it to redo it completely with your instructions.
Do not break it into Sonnet subagents." Honour that: one agent, whole screen, no fan-out.

Files: `src/content/supplementGuidance.ts`, `src/ui/setup/GuidanceScreen.tsx`, `setup.css`, and a
new references module.

---

## 1. The shape of the screen

Today it is four sections rendered as prose. It becomes a page of **big topic headings, each a
collapsible box**, in the pattern the `why?` disclosures already use. Nothing renders expanded, so
the screen reads as a short menu rather than a wall.

Topics, each its own box:

```
CREATINE      CAFFEINE      PROTEIN      WATER      COOL-DOWN      ELECTROLYTES      SHOES      KIT
```

R14 governs the headings: Title Case, noun phrases. His example spelled them upper case, which is
a styling choice; apply it in CSS, not by shouting in the copy table.

**Load `wait-what` before writing a word of the bodies.** That is the "I don't get it" / ELI5
skill he names. Inside a box: a one-line answer first, then bullets. No paragraph longer than
three lines.

## 2. What already exists and must not be re-derived

`src/content/supplementGuidance.ts` holds four sections with verified sources. **Keep their
substance and their citations.** Restructure the prose; do not re-research creatine, caffeine or
protein, and do not alter a dose or a DOI. The load-bearing numbers:

- Creatine: `max(3 g, 0.1 g/kg)`, capped near 10 g/day, monohydrate only, no loading phase.
- Caffeine: 0.9 to 2 mg/kg for resistance work, capped at EFSA's 200 mg single dose.
- Protein: form does not matter; daily total and third-party testing do.

## 3. Four new sections, each needing sources

**This is the part that can go wrong.** Every claim needs a verified citation or an explicit note
that none was found. He said so himself: where a reference cannot be found, he will supply his own
recommendation. **Never reach for a weak source to fill a gap.** Leave a marked placeholder and
list it in your report.

**Water.** How much during a session and WHEN. He asked for a worked example, because "a regular
workout" means different things to different people, so anchor it: a named session length and
intensity, with a volume. Start from Sawka 2007 (DOI 10.1249/mss.0b013e31802ca597), which
`src/domain/nutrition.ts` already cites for keeping in-session loss under 2 % of body mass. Note
that the commonly quoted 1.5 L per kg lost is marked PARAPHRASE in this project's content review
and therefore ships as no number anywhere.

**Cool-down, and repetition speed.** Two claims: that a cool-down between heavy sets matters, and
that fast repetitions do not build muscle. The second is about time under tension and lifting
tempo. **Check what the evidence actually supports before writing it** — tempo research is mixed,
and if the honest finding is "slower is not clearly better", say that instead of repeating the gym
truism. He would rather be told the truth than agreed with.

**Electrolytes.** What they are, and that sports drinks are unnecessary for ordinary training. The
"workout water is a scam unless you are running a marathon" framing is his and it is broadly
right; find what the evidence says about the duration or sweat-loss threshold where replacement
starts to matter, and give the number rather than the attitude.

**Shoes, and foot care.** That footwear is the one place worth spending, and why: a compressible
sole under a heavy lift. And baby powder for foot odour. **The shoe claim may have no strong
trial behind it, and the powder claim almost certainly does not.** Flag both rather than dressing
opinion as evidence; he has already said he will supply his own recommendation for the shaker, and
this is the same case.

## 4. References

A collapsible `REFERENCES` box at the foot, matching the one brief K builds on the body page:
Elsevier format, one bold line above each citation saying what it is for, single numbering scheme,
superscripts on the topic headings pointing into it.

Where a claim has no source, the entry reads as a marked placeholder naming the claim, so he can
drop his own recommendation in. Do not invent a citation to fill the row.

New long-form text goes in R10 modules named in the contract's R10 list, each with its own
contract suite. Follow `src/content/bodyEquations.ts`.

## 5. Sourcing

You may use `agy` for literature search. It works ONLY in pure print mode: run from a directory
that is not this repository, put no file paths in the prompt, open with "Do not read any file. Do
not write any file. Do not run any command", and redirect stdout to a file you then read. A prompt
that names a path makes it reach for a tool, get denied, and return nothing.

**Every DOI you print must resolve.** Check it. A fabricated citation is the one unrecoverable
error in this project.

## Verification

Everything in `00-CONTEXT.md`, plus:

- Every DOI in the new modules resolves, and the ones carried over still match
  `src/domain/nutrition.ts`.
- Every box is collapsed on first render.
- A test that no section body contains a paragraph longer than three lines, so the wall cannot
  come back.
- Your report lists every claim you could NOT source, by name.
