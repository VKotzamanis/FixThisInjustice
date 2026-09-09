# Brief M: the review page

Read `00-CONTEXT.md` first. Claim r2.19. **Read his words for that step before you start.**

**Files. Verified against the tree on 2026-09-09.**

| File | What changes |
| --- | --- |
| `src/ui/setup/SetupWizard.tsx` | The `review` step only. This is the largest file in the repo; stay in that step |
| `src/ui/setup/SetupWizard.test.tsx` | The two tests in Verification below |
| `src/content/reviewDataNotes.ts` | NEW R10 module for the `Your Data` block. Follow `src/content/bodyEquations.ts` |
| `src/content/reviewDataNotes.test.ts` | NEW. Its contract suite, as every R10 module has one |
| `src/content/copy.ts` | The `Looks Good` checkbox label and the `Your Data` heading. Union AND table |
| `src/content/copy.test.ts` | Register the new module in the `LENGTH_EXEMPT` map at line 159. That map IS the mechanical half of R10 |
| `src/ui/setup/setup.css` | The placeholder frame and the block's layout, tokens only |
| `scripts/alpha-parts.mjs`, `scripts/alpha-walk.mjs` | A part and one step for each new key |
| `docs/design/2026-09-01-copy-contract.md` | Name `reviewDataNotes.ts` in the R10 list |

**Read `src/ui/views/ExportView.tsx` but do not edit it.** The controls you must name are
`button.downloadJson`, `button.downloadSummary` and `button.downloadCalendar` under the
`label.downloads` heading, inside the view titled `hero.exportImport`; the import half is under
`label.importSection`. **Resolve those keys and use the words they actually render**, not the words
section 2 below guesses at. Verified 2026-09-09: this brief's phrase "Settings, then Data, then
export the JSON backup" does not match any of them.

**The icon register row exists.** `docs/design/2026-09-04-icon-register.csv` line 27 is
`reset-cookies-icon`, marked owner-supplied on every column. Leave the placeholder frame and a
comment naming that row. Do not draw one, do not generate one, do not substitute a character.

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
