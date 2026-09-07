# Visual check on a phone

**No pixel in this repository has been measured on a device.** Every layout claim the code and the
plans make comes from one of two places. The first is jsdom, which the test suite runs in and which
renders no geometry at all. The second is a design document, which states an intent rather than a
result. `src/content/copy.ts` line 2382 says so for the boot line, in the file that sets its width.

This page is a checklist for the user to walk. Nothing here can be delegated to an agent, because
the evidence it asks for is a screen. Each row below gets a verdict on an iPhone and a verdict on an
Android phone. Eleven rows on two platforms is twenty-two verdicts: the eleventh is the setup body
step at 390 px, added for round 2 claim r2.10.

## Before the pass

Add the site to the Home Screen and open it from the icon. A browser tab has different safe-area
insets and different viewport units, so a tab pass does not substitute for an installed one.

Select the limelight skin in Settings first. It is the shipped default (`src/domain/schema.ts` line
511), and it is the skin every row below assumes.

## The rows

| What | Where to look | What renders it | What would be wrong |
| --- | --- | --- | --- |
| Limelight tokens | every screen | `src/ui/styles/tokens.css` line 101 | pink type on a lime ground. That pair measures 1.41:1 and fails at every size (`docs/design/round3/2026-09-01-round3-plan.md` line 123). Pink is a fill, an outline or a shadow, never type on lime |
| Marquee | Today, the ticker strip | `src/ui/components/Marquee.tsx`, styled by `src/ui/components/limelight.css` | text that clips at the screen edge, or a strip that keeps scrolling while a popup is open |
| Week stamp | Today, after a week closes at or above its target | `src/ui/components/WeekStamp.tsx`, styled by `src/ui/components/limelight.css` | a stamp that overlaps the session card, or one that appears while a missed-week popup is pending |
| Atlas grid | Atlas | `src/ui/views/AtlasView.tsx`, styled by `src/ui/views/atlas.css` line 55 | cards that drop to one column on a narrow phone. The track is `repeat(auto-fill, minmax(9rem, 1fr))`. Also a locked slot with no accessible name |
| Boot line width | the first open after a wipe | `src/ui/components/Boot.tsx`, styled by `src/ui/components/boot.css` | a line that wraps instead of scrolling. Each step line is 36 characters and is meant to overrun a 320 px phone into a horizontal scroll |
| Konami overlay | after the Konami sequence | `src/ui/components/KonamiOverlay.tsx`, styled by `src/ui/components/konami.css` | an overlay that leaves part of the screen uncovered, or one that traps focus with no way out |
| Toast stack | log a set, then delete it | `src/ui/components/ToastQueue.tsx`, styled by `src/ui/components/toastQueue.css` | toasts that stack off the screen, or an undo toast whose deadline passes with the toast still up |
| Settings order | Settings | `src/ui/views/SettingsView.tsx` line 77 | the wipe control anywhere but last. `SETTINGS_ROWS` puts the `data` row at the end, and nothing may be appended after it |
| Reminder panel states | Settings, then the reminders section | `src/ui/components/ReminderSettingsPanel.tsx` | a status line that wraps into the toggle, or one that names the wrong state. Seven states exist and eight strings cover them |
| Migration wizard | the first open with legacy data present | `src/ui/migration/MigrationWizard.tsx`, styled by `src/ui/migration/migration.css` | a phase whose buttons sit below the fold, or a preview that scrolls the page sideways. The phases are `explain`, `preview` and `applied` |
| Setup, step 3 (Body) at 390 px | Setup, the Body step, on an iPhone-width screen | `src/ui/setup/SetupWizard.tsx`, styled by `src/ui/setup/setup.css` | the step scrolls sideways. This is round 2 claim r2.10, "The page is a bit wider / doesn't fit in the phone". The rule that has to hold is that every two-column row can shrink below its content's intrinsic width: `grid-template-columns: minmax(0, 1fr)`, never a bare `1fr`, and `min-width: 0` on the flex form and on the controls. A bare `1fr` is `minmax(auto, 1fr)`, and that `auto` is a number field's default twenty-character width, which is what pushed the step past the viewport |

## Round 2, claim r2.10: what is fixed and what is still unverified

**The rule is in the code and asserted by a test. The 390 px pass has NOT been made on a device,
by anyone, and this page is where that would be recorded.**

`src/ui/setup/SetupWizard.test.tsx`, describe `r2.10: the step cannot scroll sideways at 390 px`,
asserts the CSS rule and nothing more. It cannot assert a width: jsdom performs no layout, so every
element it renders has a zero client rectangle, which is the reason this whole page exists.

What the diagnosis found, so that a failed pass can be argued with rather than just reported: the
defect was never the breakpoint (`@media (max-width: 560px)` already covers a 390 px phone). It was
that a grid track of `1fr` and a flex item of `flex: 1 1 0` both take their MINIMUM from the item's
min-content width, and the item is `<input type="number">`, whose intrinsic width is its default
`size` of about twenty characters. Two of those in one row demand roughly 390 px of content box
between them, which is more than the phone has left after the page padding, the fieldset padding
and the box padding.

The row to walk: open the Body step on a 390 px screen, in the limelight skin, from the Home Screen
icon rather than a browser tab. Swipe left. Nothing should move. The tape section is the hardest
case, because each girth field pairs with its diagram in a two-column row (r2.14(ii)), so select
`Body measurements` before judging it.

## Reaching the last two rows

The reminder panel shows one of seven states, and `src/ui/components/ReminderSettingsPanel.tsx` line
28 lists them in the order it decides them. A build with no Worker origin reaches `not-configured`
and stops there, so check the panel on a deployment that carries `VITE_REMINDER_API`. The state
worth the trip is `needs-reenable`, which an imported document reaches with reminders on and no
device.

The migration wizard needs four conditions at once, which `src/ui/migration/MigrationGate.tsx` sets
out. A `fti.console.v2` document must sit in this browser's `localStorage`. A profile and a plan
must exist. `ui.legacyMigration` must read `pending`. Settings can put that field back to `pending`
after a run.

## Reporting

Write the verdicts anywhere convenient and hand them back. A row that fails becomes a task. A row
that passes is the first geometric evidence this project has.
