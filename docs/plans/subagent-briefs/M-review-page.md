# Brief M: the review page

Read `00-CONTEXT.md` first. Claim r2.19. **Read his words for that step before you start.**

File: `src/ui/setup/SetupWizard.tsx`, the `review` step.

## 1. An acknowledgement before Confirm

A checkbox reading `Looks Good` (R14: Title Case). Confirm stays disabled until it is ticked.

Store nothing. Like the intro's acknowledgement, this is a gesture, not a record.

## 2. The data explainer

He asked the review screen to teach the user how their data actually works, because this is the
last screen before anything is written. A block at the foot, headed `Your Data` (Title Case, noun
phrase), carrying three facts:

1. **Where it lives.** Everything stays in this browser, on this device. Nothing is sent anywhere.
2. **How to move it.** Settings, then Data, then export the JSON backup; on the other device,
   Settings, then Data, then import it. Confirm the wording against `src/ui/views/ExportView.tsx`
   before writing it: name the controls by the words actually on them, not by what this brief
   guesses they say.
3. **How to start over.** Clearing the browser's cookies and site data for this site wipes it.
   **Say plainly that there is no way back afterwards.** He asked for that sentence and he is
   right to: it is the one irreversible action a user can take from outside the app.

An icon goes beside the reset instruction. **He is supplying it** — leave a placeholder frame and
a comment naming `docs/design/2026-09-04-icon-register.csv` row `reset-cookies-icon`. Do not draw
one and do not generate one.

This is long-form reference text. It goes in an R10 module, not in a copy table, named in the
contract's R10 list, with its own contract suite. Follow `src/content/bodyEquations.ts`.

## Verification

Everything in `00-CONTEXT.md`, plus a test that Confirm is disabled until the box is ticked, and
that the export and import controls are named with the same strings `ExportView` renders.
