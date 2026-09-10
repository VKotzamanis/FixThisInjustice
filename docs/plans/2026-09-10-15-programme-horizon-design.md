# Programme horizon: design for removing the programme length as an input

> Design document, 2026-09-10. Written against tree `fcefb58`. Nothing here is implemented.
> The task breakdown in section 7 is the contract for the agent that implements it.
>
> Owner's verdict, verbatim: "the programme length is NOT something that's helpful. it's
> introducing more bugs than intended. What happens if the user loses a session? or does not do all
> the exercises or does more? Does the code now take that into account into recalculating the
> programme length? No? Then let's scrap it (verify though the downstream calls). All we need is
> the app to propose a programme length and keep reccomending the programme until the user decides
> they want to change their goal/input etc."

## 0. Summary

The code already treats programme position as a **count of sessions**, never a date
(`src/domain/schedule/cursor.ts:3-5`: "It advances by exactly one when a session is completed or
explicitly skipped, and never on the passage of time"). `PlanTemplate.weeks` is the one stored
number that pretends otherwise, and the app trusts it in exactly two places that matter: the
generator materialises `weeks x sessionsPerWeek` sessions and then stops, and the Time Capsule
computes a calendar date from it. Everything else either derives the week count from the session
list or reads the cursor.

The recommendation is to make the session list **open-ended by extension**: the plan keeps a
runway of at least 28 sessions ahead of the cursor, appended one four-week cycle at a time by a
pure function that copies the plan's own first cycle. The cursor, the blocks, the deload cadence,
the logged-set references and the calendar projection all keep their current shape. No schema
field is added or removed, `schemaVersion` stays 3, and the wizard loses its programme step. Every
"of N" the UI prints today is removed, because under this model there is no N.

## 1. Verified consumers of `PlanTemplate.weeks`

Each entry below was read at the stated line. Two entries in the brief are corrected.

| # | Location | Brief said | Verified |
| --- | --- | --- | --- |
| 1 | `src/domain/nutrition.ts:438,442` | feasibility divides by `weeks` as its horizon | **WRONG as a consumer of `PlanTemplate.weeks`.** `FeasibilityInput.weeks` is documented at `nutrition.ts:397` as "[week] from today to the target date". Its only caller is `src/ui/setup/SetupWizard.tsx:1744-1749`, which passes `daysBetween(today, date) / 7`. The feasibility model never reads the programme length. It is unaffected by this design. |
| 2 | `src/domain/plan/generator.ts:256-263` | bounds 8 to 24, refuses outside | Confirmed. `PLAN_WEEKS_MIN = 8`, `PLAN_WEEKS_MAX = 24` (`generator.ts:40-41`), `RangeError` outside. |
| 3 | `src/domain/plan/generator.ts:279` | emits exactly `weeks` weeks of sessions | Confirmed. `for (let week = 1; week <= input.weeks; ...)`. |
| 4 | `src/domain/plan/generator.ts:309,311,313` | names, stores, builds blocks | Confirmed. The name bakes the number in: `` `${template.name}, ${input.weeks} weeks, ${GOAL_LABEL[input.goal]}` ``. `buildBlocks(sessionsPerWeek, weeks)` lays out three training weeks then one deload week per `BLOCK_WEEKS = 4`, with a trailing stretch shorter than four weeks emitted as a normal block. |
| 5 | `src/ui/components/Boot.tsx:62,74,79` | prints "week X of Y" | Confirmed, with a qualification that matters for section 3: X is the **cursor's** week, `Math.floor(cursor.nextSessionIndex / plan.sessionsPerWeek) + 1`, clamped to `plan.weeks`. Only the denominator Y reads `plan.weeks`. Boot's own comment (`Boot.tsx:66-68`): "It is the CURSOR's week, never the calendar's: the two diverge the moment a session is missed". |
| 6 | `src/ui/components/TimeCapsule.tsx:145` | computes the opening date from it | Confirmed. `defaultOpensOn(cursor.startedOn, plan.weeks)` = `startedOn + weeks x 7 - 1` days (`TimeCapsule.tsx:85-88`). This is the **only** consumer that turns `weeks` into a calendar date, so it is the only one that drifts against attendance. |
| 7 | `src/ui/planBrowse.tsx:78` | deliberately does not use it | Confirmed. `weekCountOf` is `ceil(sessions.length / sessionsPerWeek)`. **Also** `src/ui/views/PlanView.tsx:180-182`: "Derived from the sessions actually held, not from PlanTemplate.weeks: the scrubber must not offer a week the session list cannot fill." |

Consumers the brief did not list:

- **Input side**: `src/ui/setup/SetupWizard.tsx` step `programme` (`STEPS` at line 153-162; the
  branch at 3596-3617; `weeksError` at 1795-1800; `weeksTyped`/`DEFAULT_WEEKS = 12` at 226 and
  1919-1933). `SetupAnswers.weeks` (`src/domain/types.ts:388`) is a **persisted** draft field with
  a schema row at `src/domain/schema.ts:781`.
- **Stored shape**: `src/domain/schema.ts:420` `weeks: z.int().min(1).max(MAX_PLAN_WEEKS)` with
  `MAX_PLAN_WEEKS = 104` (`schema.ts:54`), and the derived ceilings `MAX_PLAN_SESSIONS = 728` and
  `MAX_BLOCKS = 104` (`schema.ts:61-63`). These bound any extension scheme.
- **Scripts**: `scripts/alpha-parts.mjs:81` claims the programme step's four copy keys for part
  `setup.programme`; `scripts/alpha-walk.mjs:362-368` walks the step; `scripts/alpha-walk.mjs:72`
  names `status.bootWeek`.
- **Comments that will go stale**: `src/domain/fun/specimens.ts:31-34` derives its drop-rate
  reasoning from "Default programme length 12 weeks" and "Longest programme 24 weeks";
  `src/ui/components/TimeCapsule.tsx:71-73` says the 24-week maximum is always inside the capsule
  window; `src/domain/schema.ts:703` says `STEPS` has nine entries (it has eight).
- **Tests**: 43 references across 12 test files (grep `\.weeks\b|weeks:`), the heaviest being
  `src/domain/plan/generator.test.ts` (22 sites) and `src/domain/nutrition.test.ts` (9 sites, all
  `FeasibilityInput.weeks`, unaffected).

## 2. What happens today when the plan runs out

Read, not assumed. The path is:

1. `advanceCursor` (`cursor.ts:146-153`) clamps `nextSessionIndex` at `plan.sessions.length` and
   stamps `completedOn` once, with the LocalDate of the closing session.
2. `assignmentFor` (`cursor.ts:110-111`) returns `null` when `plan.sessions[nextSessionIndex]` is
   undefined, so `startSession`, `completeSession` and `skipSession` return their argument
   unchanged: **a documented no-op, not a throw**. `scheduleActions.ts` leaves any standing
   refusal banner in place because nothing changed.
3. `projectedCalendar` (`calendar.ts` walk) reads `plan.sessions[walk] ?? null`, so every future
   day projects `null`. `windowBase` (`calendar.ts:221`) returns `null` "plan finished", so
   `remainingLabelsThisWeek` is empty and `assignToday` throws `notOffered`.
4. `TodayView.tsx:196,358-368`: `finished = cursor.completedOn !== null`; the hero prints
   `hero.programmeComplete` ("Programme Complete.") and `FORMAT.programmeClosed(total,
   completedOn)` ("48 of 48 sessions closed on 2026-09-07."). `dayStatus` is `rest` (no assignment,
   no projected session), so `canRun` is false and Start, Skip and the pick control are hidden;
   the pause control is hidden by `!finished` (`TodayView.tsx:495`).
5. `SessionIndicator.tsx:33` and `App.tsx:572` print "S 48/48 complete".
6. Reminders: `computeReminderInstants` walks a projection with no sessions and returns `[]`; the
   hash changes and the next sync uploads an empty schedule. Coherent.
7. `.ics`: `ExportView.downloadCalendar` builds zero events; `buildIcs` handles an empty list.
   Coherent.

**What the user can still do**: browse the Plan view (scrubber clamps to the weeks the sessions
fill), Log, Targets, Export, Settings. **What the user cannot do**: start another programme.
`setPlan` has exactly one caller, `SetupWizard.tsx:2163`, and the wizard is reachable only with no
profile. `SettingsView.tsx` edits `goal.kind`, `experience`, `activity`, `units` and `timezone`
through `updateProfile` and never touches the plan. **Nothing regenerates.** The finished state is
terminal for the life of the document short of wiping it.

**Two defects of the finished state**, both confirmed by reading:

- `closeWeeks` (`weekly.ts`) has no `completedOn` gate: it checks profile, availability, cursor and
  that the plan exists. After completion every ISO week records `completed = 0`, `delta = -target`,
  `missHandled = false`. Neither `src/store/selectors.ts` nor `src/domain/motivation/trigger.ts`
  reads `completedOn` (grep, both files), so the missed-week modal fires inside its 14-day window
  for weeks after the programme ended.
- `src/ui/views/LogView.tsx:120-123` draws the compliance grid over `weeksBetween(startedOn,
  today)`, so post-completion weeks accumulate as missed weeks. Inferred from the test title at
  `LogView.test.tsx:244`; the rendering branch itself was not read.

## 3. The drift problem

The owner asks what the code does when the user misses sessions or does extra. The answer has two
halves, and they disagree.

**The cursor half is coherent.** Position is `nextSessionIndex`, advanced only by
`completeSession`/`skipSession`. A missed slot day leaves no assignment at all (assignments are
materialised only by start/complete/skip/`assignToday`), so the projection re-flows the same
session onto the next available slot day and the whole programme **slides later** in calendar
time by one slot per miss. `closeWeeks` records the miss as `delta < 0` for that ISO week. An extra
session on a non-slot day is allowed (`assignmentFor` gates on pause and on another open day, never
on a slot; `cursor.ts:112-118`) and advances the cursor, so the programme **compresses**. A second
session on the same date is impossible (assignments are keyed by date; a terminal day is a no-op).
Extra sets inside a session (`isBonus`) do not touch the cursor. `SessionIndicator` ("S n/N"),
`TodayView`'s eyebrow, Boot's week numerator, the Plan view's `isNext` marker, `PhaseTransition`'s
block index and `blockStats` all read the cursor and are truthful under both kinds of drift. The
project already recorded this as decision `attendance_driven_plan_cursor` (graph rationale: "the
legacy programPosition(startDate, today) ... a user training days 1-3 then travelling 10 days
returns to 'day 14, Full Rest'").

**The `weeks` half is fiction.** Every place `weeks` is read as a duration is wrong the moment
attendance departs from `sessionsPerWeek` per calendar week:

- The plan name says "12 weeks". The programme takes as many calendar weeks as attendance makes it.
- Boot prints "week 3 of 12". The numerator is honest (3 x 4 = 12 sessions done); the denominator
  promises 12 weeks of something that is measured in sessions. After six sessions on a 3/week plan
  Boot says "week 3 of 12" whether that took two calendar weeks or ten. The owner's "week 12 of 12
  after six sessions" cannot occur from Boot; the failure is in the other direction, an
  under-report that reads like a schedule.
- `TimeCapsule`'s default opening date is `startedOn + weeks x 7 - 1`. Under any miss the capsule
  opens before the programme's last session.
- The wizard's review step promises "12 weeks, 48 sessions" and the deload note says "Every fourth
  week". The user reads calendar weeks; the code means blocks of `sessionsPerWeek` sessions.
- A user who offers more slot days than `sessionsPerWeek` (the wizard blocks fewer, allows more:
  `SetupWizard.tsx:1764-1771`) is projected one session per slot day, so "Week 3 Upper A" can land
  in calendar week 2. The generator's `Week N` prefix is already nominal.

**Does the code recalculate the programme length under drift?** No. `weeks` is written once by
the generator and never read back into any decision except the two above. Nothing needs to
recalculate it because nothing that matters depends on it. The owner's instinct is right: the
number is a promise the code cannot keep, and the fix is to stop making it, not to keep it
current.

## 4. Design questions answered

### Q1. Where does the horizon come from once the user is not asked?

It does not exist as a plan property. Two narrower quantities replace it, both derived at the
moment they are needed and never stored:

- **Initial materialisation depth** for `generatePlan`: `proposedHorizonWeeks(today, targetDate)`
  = `clamp(ceil(daysBetween(today, targetDate) / 7), PLAN_WEEKS_MIN, PLAN_WEEKS_MAX)` when a target
  date is set, else `DEFAULT_WEEKS` (12, the existing constant at `SetupWizard.tsx:226`, moved to
  the domain). The muscle-gain case (`energyPlan` returns `rateKgPerWeek: null`,
  `nutrition.ts:665-672`) and the no-target-date case both fall to 12. This costs nothing, because
  the depth is a materialisation choice, not a prediction: the runway extension (Q2) makes the
  initial depth invisible to the user within a few weeks either way. No new number is introduced;
  8, 12 and 24 are the constants already in the code, and they remain labelled as product choices
  with no evidence claim.
- **Time Capsule default**: `profile.goal.targetDate` when set (clamped into the capsule's own
  7 to 730 day window as today), else `addDays(startedOn, DEFAULT_WEEKS x 7 - 1)`. The real target
  date is a better default than a week count derived from it.

The review step states the proposal in words: the split, the sessions per week, and "Your plan
continues until you change it" plus, when a target date exists, "Your target date is in N weeks".
That is the owner's "propose a programme length" satisfied without storing one.

### Q2. What does "keep recommending the programme" mean concretely?

**Runway extension in place.** After every cursor advance, and once at load, the plan is extended
so that `plan.sessions.length - cursor.nextSessionIndex >= RUNWAY_SESSIONS`, by appending whole
four-week cycles. A cycle is a copy of the plan's own first `BLOCK_WEEKS x sessionsPerWeek`
sessions with fresh ids, continued ordinals and names, plus the two blocks `buildBlocks(spw, 4)`
emits, offset to the current length. For a generator-built plan this is byte-for-byte (up to ids)
what `generatePlan` would have emitted for a longer `weeks`, which is the property test in Task 2.

`RUNWAY_SESSIONS = max(CALENDAR_DAYS, SCHEDULE_HORIZON_DAYS) = max(28, 21) = 28`, derived from the
two forward windows rather than restated. The justification is an invariant the code already
holds: at most one assignment per date (`upsertAssignment` keys by date; `projectedCalendar` emits
one session per day at most), so N sessions ahead always cover N calendar days, whatever the slot
density. `CALENDAR_DAYS` moves from `src/ui/views/ExportView.tsx:59` into `src/config/` so the
domain does not import from the UI.

Cost to the three forward-plan consumers:

| Consumer | Today | Under extension |
| --- | --- | --- |
| Reminders (`instants.ts`, 21-day window, `MAX_INSTANTS = 200`) | body reads `session ${ordinal} of ${totalSessions}` (`instants.ts:88`) | total is now the runway and grows; drop "of N". One string, one test (`instants.test.ts:133`). Windows unchanged. The hash changes once, forcing one re-upload. |
| `.ics` (`ExportView.tsx:119-136`, 28-day window; `buildIcs` caps at 400 days) | summary = label, description = `session.name` ("Week 13 Upper A"), uid = `${date}-${sessionId}` | **No change.** The export was already a window, never the whole plan. The brief's concern that "a plan with no end cannot be exported naively" is already answered by `CALENDAR_DAYS = 28` and `FORMAT.calendarWindow`. |
| Plan tab (`PlanView.tsx`) | one week at a time; scrubber max = `weekCountOf(plan)`; chip strip renders every block | Unchanged in mechanism. The scrubber max and the chip count grow by one cycle per extension. The chip strip becomes long over years (two chips per cycle); flagged in section 8, not fixed here. |

The ceilings in `schema.ts` bound the growth: `MAX_PLAN_WEEKS = 104` is the binding one (since
`weeks = ceil(sessions.length / spw)` is kept consistent), so extension refuses after 104 weeks of
sessions, which is two years at full attendance and longer under drift. At the ceiling the cursor
terminates exactly as today and the existing "Programme Complete." branch renders. Raising the
ceilings is out of scope; a "start the next programme" control is the owner's open item 4
("reach your goal and then maintain?", `docs/plans/2026-09-10-14-round-3-onboarding.md:229`) and
is not designed here.

### Q3. What happens to the deload?

Nothing changes in the cadence or the modifier, and nothing new is claimed. Each appended cycle
carries the same three-training-weeks-then-one-deload layout, with `DELOAD_SET_MODIFIER = 0.5`
and load held (Bosquet 2007, as cited at `generator.ts:46-53`). What the design makes explicit is
the unit: a "week" in this plan is `sessionsPerWeek` sessions, so the cycle is a **session-counted
backstop**, not a calendar one. It always was; the extension makes it continue indefinitely.

The content review's recommendation is "Autoregulate; keep a 4-8 week calendar backstop"
(`docs/review/2026-09-01-content-peer-review.md:74`), and the generator's own comment says four
weeks was "chosen because this app has no autoregulation signal to schedule from"
(`generator.ts:55-63`). That is still true: `LoggedSet.rpe` exists but no rule with a citation
consumes it, and the review rejected velocity-based autoregulation on instrumentation
(`content-peer-review.md:426`). This design does not invent a rule.

One sentence on metric fit, said once: the review states its backstop in calendar weeks and this
plan counts sessions; under low attendance a "four-week" cycle can span more than eight calendar
weeks, which is outside the review's stated band. No source in the codebase supports either
reading over the other for this population, so the design keeps the existing session-counted
cadence and records the calendar-backstop variant as a rejected alternative in section 5.

### Q4. The drift complaint

Under the recommendation, every displayed quantity is cursor-derived or window-derived, and every
"of N" goes:

- Boot: `status.bootWeek` becomes "week {week}" (numerator only, from `weekOfIndex`).
- `SessionIndicator`, `TodayView` eyebrow, `App.tsx` ticker: `FORMAT.planPosition` becomes
  "S {n}" and `status.sessionCursor` becomes "Session {shown}" in all three skin tables.
- Reminders body: "session N".
- Plan name: "Upper / Lower x2, fat loss".
- Time Capsule default: target date or the 12-week default, never `plan.weeks`.
- Review step copy states the unit: "A week in this plan is N sessions. Week 5 begins after
  4 x N sessions, however many calendar weeks that takes."

Missed sessions still slide the programme; extra sessions still compress it; the runway keeps both
directions inside a materialised list. There is no number left for drift to falsify.

### Q5. Does `PlanTemplate.weeks` survive?

**In storage, yes; as an input, no; as something the UI reads, no.** It is redefined as
"[weeks] the span the session list currently fills, `ceil(sessions.length / sessionsPerWeek)`,
maintained by `generatePlan` and `extendPlan`, read by nothing outside tests". The reasons for
keeping it rather than deleting it:

- Deleting it is a stored-shape change. Zod strips unknown keys by default (no `.strict()` in
  `schema.ts`, verified by grep; strip behaviour verified against the installed zod 4.5.4 with a
  one-line `parse`), so a **newer** build reads an **older** document without a
  migration. But an **older** build reading a **newer** document without `weeks` fails
  `z.int().min(1)` and the whole `AppStateSchema` with it, which is a rollback hazard the
  `schemaVersion` refusal message exists to prevent. Doing it properly means `schemaVersion 4`, a
  `{ from: 3, to: 4 }` step in `src/domain/migrations/`, a captured fixture per version (security
  review constraint 4, `migrations/index.ts:4-6`), and edits to every `PlanTemplate` literal in the
  tree (`src/test/scheduleFixtures.ts:191`, `src/test/migrationFactories.ts:56`,
  `src/domain/arbitraries.ts:265`, `src/domain/reminders/state.fixture.ts:112`,
  `scripts/alpha-fixture.mjs:112`, plus ten test files).
- The master plan's "no derived values persisted" rule argues for deletion, and it is right. It is
  outweighed here by the migration cost for an integer nothing reads. Delete it at the next schema
  bump, whenever one is forced by something else.

A test invariant replaces the schema's silence: `plan.weeks === ceil(plan.sessions.length /
plan.sessionsPerWeek)` for every output of `generatePlan` and `extendPlan`. It is a test, not a
schema refinement, so a document from before this change is never rejected for it.

## 5. Options

Three were designed far enough to cost. Each is assessed against the three forward-plan consumers,
the migration question, and test cost.

<!-- decision: plan-open-ended-runway-extension | status: adopted | supersedes: none -->
### Option A: open-ended plan by runway extension (adopted)

Described in Q2. Pure `extendPlan(plan, cycles)` in `src/domain/plan/`; pure
`ensureRunway(state, profileId)` in `cursor.ts` called from `completeSession`, `skipSession`,
`setPlan` and once at mount/visibility (folded into `useWeeklyClose`'s existing catch-up).

- Reminders: one string. `.ics`: none. Plan tab: none in mechanism; chip strip grows.
- Migration: **none.** No field added or removed. `weeks`, `sessions`, `blocks` grow in value;
  `completedOn` may be reset to null when a terminal cursor is extended (the revival case for
  documents finished before this ships). `SetupAnswers.weeks` is removed from the draft type and
  schema; stored drafts carrying the key parse because unknown keys are stripped.
- Why it wins: the cursor, blocks, `LoggedSet.sessionId` resolution, `assignToday`'s in-array
  swap, `blockStats`, `PhaseTransition`'s block index and the LogView anchor all keep their
  meaning without a discontinuity. Extension of a generator plan is provably identical to having
  generated longer, so the test gate is exact rather than approximate.
- Test cost: two new test files (`extend.test.ts`, runway cases in `cursor.test.ts`); edits in
  `generator.test.ts` (name), `profile.test.ts` (setPlan), `useWeeklyClose.test.ts`,
  `Boot.test.tsx`, `SessionIndicator.test.tsx`, `TodayView.test.tsx`, `App.test.tsx`,
  `Marquee.test.tsx`, `copy.test.ts`, `instants.test.ts`, `TimeCapsule.test.tsx`, and the wizard
  fold below. Estimate: 14 to 16 test files touched, no new fixtures.

<!-- decision: plan-regenerate-on-exhaustion | status: rejected | supersedes: none -->
### Option B: regenerate on exhaustion (rejected)

When `completedOn` is stamped, call `setPlan` with a fresh plan (a copy of the finished plan's
cycle, or `generatePlan` from profile fields), automatically or from a "Start Next Cycle" control.

- Reminders and `.ics`: none. Plan tab: resets to week 1.
- Migration: none.
- Why it lost: `setPlan` (`src/store/index.ts:676-715`) resets the cursor to 0, clears
  `assignments` and `pauses`, and mints a new plan id. Every cursor-derived display restarts
  ("S 1/48"), `PhaseTransition` compares the new plan's block 0 against a `lastBlockSeenByProfile`
  from the old plan and never fires again until it is exceeded, `blockStats` for the finished block
  is emptied by the assignment wipe, and `LogView`'s grid re-anchors on the new `startedOn`.
  Automatic regeneration shows "Programme Complete." for one render; manual regeneration adds a
  decision the owner said the user should not have to make. It also leaves the drift half of
  section 3 untouched: the new plan carries the same nominal "12 weeks". `includeCardio` is not
  persisted on `Profile` (it lives only in the cleared setup draft), so a `generatePlan`-based
  variant would have to infer it from the old plan's exercises.

<!-- decision: plan-sessions-fully-derived | status: rejected | supersedes: none -->
### Option C: sessions materialised on demand (rejected)

Replace `plan.sessions` with a rule (split template, experience, equipment, cardio flag) and a
pure `sessionAt(plan, index)`; blocks become `index mod (BLOCK_WEEKS x spw)`.

- Reminders and `.ics`: unchanged in output, rewritten in source (both resolve sessions by id
  from the array). Plan tab: rewritten.
- Migration: **required.** `PlanTemplate` changes shape, so `schemaVersion 4`, a migration, and a
  fixture. `assignToday`'s swap (`calendar.ts:345-405`) transposes two entries of the array and
  rewrites ordinals; with no array it needs a persisted override map, which is a second new stored
  shape. `LoggedSet.sessionId` needs deterministic ids or a resolver over the override map.
- Why it lost: it is the purest model and it buys the user nothing Option A does not. It touches
  every module that reads `plan.sessions` (cursor, calendar, reminders, export, PlanView,
  TrainView, TodayView, fun/blocks, progression, migrations) and it is the only option that needs
  a migration.

<!-- decision: programme-length-derived-from-target-date-only | status: rejected | supersedes: none -->
### Option D: keep a fixed length, derive it from the target date (rejected)

This is `docs/plans/2026-09-10-14-round-3-onboarding.md` Task 10 as written: "Derive the
programme length from the target date and propose it rather than asking. `weeks` stays in the
model: `Boot.tsx` and `TimeCapsule.tsx:145` both read it."

- Why it lost: it removes the input and keeps the premise. The plan still runs out (section 2),
  the drift fiction stays (section 3), and it has no answer for muscle gain or no target date
  beyond the default. The owner's verdict is about the premise, not the input. Task 10 should be
  marked superseded by this document.

<!-- decision: deload-calendar-backstop-eight-weeks | status: rejected | supersedes: none -->
### Deload variant: add a calendar backstop (rejected, deferrable)

Force the next block to be a deload when more than eight calendar weeks have elapsed since the
last one, using the upper edge the review states.

- Why it lost for now: it puts calendar arithmetic back into the block structure, which is the
  drift problem re-entering by another door, and no source in the codebase says calendar-timed
  deloads outperform session-timed ones for this population. Revisit when an autoregulation signal
  with a citation exists; the four-week session cycle stays as the backstop.

<!-- decision: plan-weeks-kept-as-derived-span | status: adopted | supersedes: none -->
### `PlanTemplate.weeks`: kept as a derived span (adopted)

Reasoning in Q5. Rejected alternative: delete the field under `schemaVersion 4`.

<!-- decision: session-indicator-drops-denominator | status: adopted | supersedes: none -->
### Session indicator: "S n", not "S n/N" (adopted)

With a runway, N is `plan.sessions.length`, which jumps by a cycle at moments unrelated to
anything the user sees (at S 21, S 37, ... for a 4/week plan). Rejected alternatives: keep "S n/N"
with N as the runway (incoherent jumps); N as the proposed horizon in sessions (reads "S 49/48"
once passed); position within the current cycle ("S 5/16", a second concept in a 6-character
slot). The Plan view already carries week and block; the indicator carries the one fact the
master plan gave it, the session the cursor stands at.

## 6. Recommendation

Adopt Option A with the display, deload and `weeks` decisions above. Mark round-3 Task 10 as
superseded by this document. Do not open the owner's item 4 (what happens at the goal) in this
brief; the design leaves the door open by keeping `completedOn`, the "Programme Complete." branch
and `setPlan` intact for the ceiling case and for a later "start the next programme" control.

## 7. Task breakdown

Rules for the implementing agent: work in a worktree; `git merge main` first and report both
commits (memory: worktrees branch from stale commits). Commit per task **with a pathspec**. State
each gate before running it and report the actual outcome. Add unit and sign comments to every
physical quantity. Never restate a constant: import it.

Baseline before Task 1: `npm run typecheck`, `npm run lint`, `npx vitest run`. Record the file and
test counts; do not quote the 128 / 2605 figures from the brief (section 8).

### Task 1: one home for the plan ceilings

**Files**: new `src/domain/limits.ts`; `src/domain/schema.ts:53-63`.

- Move `MAX_PLAN_WEEKS`, `MAX_PLAN_SESSIONS`, `MAX_BLOCKS` (and `MAX_SESSIONS_PER_WEEK`, which
  `MAX_PLAN_SESSIONS` derives from) into `limits.ts` with their existing comments; `schema.ts`
  imports them. No value changes.
- **Gate**: `npm run typecheck`; `npx vitest run src/domain/schema.test.ts`; `grep -rn
  "MAX_PLAN_WEEKS\s*=" src` returns exactly one line.

### Task 2: `extendPlan` and the generator's name

**Files**: new `src/domain/plan/extend.ts` and `extend.test.ts`; `src/domain/plan/generator.ts`
(export `buildBlocks`; name at line 309; move `DEFAULT_WEEKS = 12` here from
`SetupWizard.tsx:226`); `src/domain/plan/generator.test.ts:167-168,184-215`.

- `extendPlan(plan, cycles)`: cycle = `plan.sessions.slice(0, min(BLOCK_WEEKS x spw,
  sessions.length))`; each copy gets `id: newId()`, `ordinal: index + 1`, `name: \`Week ${weekOfIndex(index, spw) + 1} ${label}\``;
  blocks appended from `buildBlocks(spw, BLOCK_WEEKS)` with `index` and `firstSessionIndex`
  offset; `weeks = ceil(newLength / spw)`. Returns `null` (or throws `RangeError`, pick one and
  document it) when the result would exceed any ceiling from `limits.ts`. Returns the argument by
  identity when `cycles <= 0`.
- Plan name becomes `` `${template.name}, ${GOAL_LABEL[input.goal]}` ``. Copy contract R5 (comma
  connector) still holds.
- **Gates**: (a) property test over every `sessionsPerWeek x weeks` cell `generator.test.ts`
  already sweeps: `extendPlan(generatePlan({...x, weeks: w}), k)` equals `generatePlan({...x,
  weeks: w + 4k})` after stripping `id` from plan and sessions, for `k` in 1..3; (b) ordinals
  contiguous and `sessions[i].ordinal === i + 1`; (c) blocks contiguous, non-overlapping, covering
  every session, deload blocks exactly at every fourth week of sessions; (d) `weeks === ceil(len /
  spw)`; (e) all session ids unique; (f) the ceiling refusal on a plan one cycle short of
  `MAX_PLAN_WEEKS`; (g) `generator.test.ts` name assertions updated and the word-count test at
  184-215 still passes.

### Task 3: `RUNWAY_SESSIONS` and `ensureRunway`

**Files**: `src/config/export.ts` (new; receives `CALENDAR_DAYS = 28` from
`src/ui/views/ExportView.tsx:59`, which imports it back); `src/domain/schedule/cursor.ts`;
`src/domain/schedule/cursor.test.ts`.

- `export const RUNWAY_SESSIONS = Math.max(CALENDAR_DAYS, SCHEDULE_HORIZON_DAYS); // [sessions]`
  with the one-assignment-per-date justification in the comment.
- `ensureRunway(state, profileId): AppState`: resolve cursor and plan; `remaining = sessions.length
  - nextSessionIndex`; while `remaining < RUNWAY_SESSIONS` and `extendPlan` succeeds, extend by one
  cycle; if anything was appended, write `plans[cursor.planId]` (the key every read resolves by;
  see `calendar.ts:394-400`) and set `completedOn: null` if it was set. Return the argument by
  identity when nothing changed. Never reads a clock.
- Call it at the end of `completeSession` and `skipSession`, after `advanceCursor`.
- **Gates**: after any completion below the ceiling, `remaining >= RUNWAY_SESSIONS` and
  `completedOn === null`; a terminal cursor on a 12-week plan is revived (`completedOn` null,
  `nextSessionIndex` unchanged, `sessions.length` grown); at the ceiling the cursor terminates and
  `completedOn` is stamped exactly as today's tests assert; identity on a plan already holding the
  runway; existing `cursor.test.ts` suite green.

### Task 4: store and catch-up wiring

**Files**: `src/store/index.ts:676-715` (`setPlan`); `src/store/scheduleActions.ts` (new action
`ensureRunway(profileId)`, not routed through `attempt()`, guarded like `closeWeeks`);
`src/app/useWeeklyClose.ts` (call `ensureRunway` beside `closeWeeks` in `close()`; update the
header comment; do not add a second listener); `src/store/profile.test.ts`,
`src/store/scheduleActions.test.ts`. No test file exists for `useWeeklyClose` today (checked); add
`src/app/useWeeklyClose.test.ts` or cover the mount-time revival through `src/app/App.test.tsx`.

- **Gates**: `setPlan` with a 2/week 8-week plan (16 sessions) stores a plan with `>= 28`
  sessions; `setPlan` with a 4/week 12-week plan stores exactly 48 (no extension, so
  `SetupWizard.test.tsx:481` still holds); a document hydrated with a finished cursor is revived on
  mount; `npx vitest run src/store src/app`.

### Task 5: the wizard loses the programme step

**Files**: `src/ui/setup/SetupWizard.tsx` (`STEPS` 153-162; `STEP_TITLE_KEY` 171-180;
`STEP_GROUP` 201-210; `initialDraft` 646; `weeksError` 1795-1800; `BLOCKED` entry; `weeksTyped`
1919-1933 replaced by `proposedHorizonWeeks(today, draft.targetDate)`; branch 3596-3617 removed;
`includeCardio` checkbox moves to the `training` step; review summary and deload sentence);
new `src/domain/plan/horizon.ts` with `proposedHorizonWeeks`; `src/domain/types.ts:388`
(`SetupAnswers.weeks` removed); `src/domain/schema.ts:781` (row removed) and `:703` (stale
comment); `src/domain/arbitraries.ts:593`; `src/content/copy.ts` (retire `step.programme`,
`quantity.programmeWeeks`; move `label.includeCardio` and `advice.deloadEveryFourth` to their new
homes; add the review sentence on session-counted weeks and the "continues until you change it"
line; check `copy.limelight.ts` and `copy.board.ts` for overrides of the retired keys);
`scripts/alpha-parts.mjs:81` (retire part `setup.programme`, re-claim its two surviving keys under
`setup.training` and `setup.review`; a key may be claimed by exactly one part);
`scripts/alpha-walk.mjs:362-368`.

Test routes that count `next()` presses through the programme step (ten, not seven):
`src/ui/setup/SetupWizard.test.tsx` 198-206 (`fillImperialWizard`), 396-417, 495-516, 812-821
(the fractional-length test: delete it), 1055-1060, 1465-1470, 1891, 1919, 2755;
`src/app/App.test.tsx:1185` (`walkFromBodyToReview`). Assertion sites: `SetupWizard.test.tsx`
236-247 (the `STEPS` literal), 371-381 ("12 weeks", "48 sessions"), 34 (`PLAN_WEEKS_MIN` import).
The loops at 600, 618, 666 iterate `STEPS.length` and self-adjust.

A stored `setupDraft.stepIndex` written under eight steps resumes one step later under seven
(`STEPS[stepIndex] ?? 'units'` at `SetupWizard.tsx:1213` catches an index past the end). Accept
and state it in the commit; the answers survive.

- **Gates**: `npx vitest run src/ui/setup src/app/App.test.tsx src/content/copy.test.ts
  src/domain/schema.test.ts` (the `schemaInfersAppState` identity check must pass with both
  `types.ts` and `schema.ts` edited); `node scripts/check-title-case.mjs` at 0;
  `node scripts/alpha-parts.mjs` (not in `package.json` scripts; read its header for the coverage
  gate and the `--unplaced` list) reports no orphaned or doubly claimed key; `grep -rn "programme" src/content/copy.ts`
  shows only `hero.programme`, `hero.programmeComplete` and comments.

### Task 6: every "of N" goes

**Files**: `src/ui/components/Boot.tsx:62-79` (guard drops `plan.weeks >= 1`; week from
`weekOfIndex`, clamped by `weekCountOf`; slot `weeks` removed); `src/content/copy.ts:1513`
(`status.bootWeek` -> 'week {week}'), `:1638` (`status.sessionCursor` -> 'Session {shown}'),
`:2159-2160` (`FORMAT.planPosition` -> 'S {shown}' plus suffix), `:2168-2182`
(`planPositionLabel`); `src/content/copy.board.ts:64`, `src/content/copy.limelight.ts:85`;
`src/ui/components/SessionIndicator.tsx`, `src/ui/views/TodayView.tsx:199,362`, `src/app/App.tsx:568-580`
(the `total` variables become dead; remove them); `src/domain/reminders/instants.ts:88`;
`src/ui/components/TimeCapsule.tsx:140-146,71-73` (default from `profile.goal.targetDate`, else
`defaultOpensOn(startedOn, DEFAULT_WEEKS)`; comment rewritten).

Tests: `Boot.test.tsx:72-89`; `SessionIndicator.test.tsx`; `TodayView.test.tsx`; `App.test.tsx`;
`Marquee.test.tsx`; `copy.test.ts`; `instants.test.ts:133`; `TimeCapsule.test.tsx`. The grep
`S [0-9]*/[0-9]*|Session [0-9]* of` hits 17 sites in six files; some are the weekly-delta copy
("{completed} of {target}") and must not be touched. Triage each hit.

- **Gates**: `npx vitest run src/ui/components src/ui/views/TodayView.test.tsx src/app
  src/content src/domain/reminders`; `grep -rn "of \${total}\|of {total}\|of {weeks}" src` returns
  nothing outside the weekly-delta keys.

### Task 7: comments and documents

**Files**: `src/domain/fun/specimens.ts:26-50` (the drop-rate working keeps `p = 0.02` and every
computed figure; only the framing sentences about a 12-week default and a 24-week maximum are
rewritten to describe an open-ended programme; do not touch `p`); `docs/plans/2026-09-10-14-round-3-onboarding.md`
Task 10 (mark superseded, point here); `docs/NEXT-AGENT.md` (one line under "Left for round 3").
Then `graphify . --update` so the decision headers in this file enter the graph.

- **Gate**: `graphify query "why is the plan open-ended"` returns this document.

### Task 8: full gates

`npm run typecheck`; `npm run lint`; `npm run test:tz` (four zones); regenerate the alpha fixture
if `scripts/alpha-fixture.mjs` executes domain code (section 8) and run
`src/domain/alphaFixture.test.ts`. Report the file and test counts as measured, beside the
baseline from before Task 1.

## 8. What I could not establish

- **I did not run the suite.** The brief's "128 files / 2605 tests" is unverified; `find src
  worker -name "*.test.*"` counts 132 files. Re-derive before and after.
- **The tree's HEAD is `fcefb58`**, not the `0dd4435` the session's git snapshot named. The
  implementer must confirm which tree they start from.
- **`scripts/alpha-fixture.mjs`** builds a 12-week plan and walks nine weeks of completions
  (`:104-123`). Whether it executes the domain's `completeSession` (and so would be extended under
  Task 3) or hand-writes state was not read. `alphaFixture.test.ts:50` asserts `weeks >= 12` and a
  cursor inside the plan, both of which hold under extension.
- **`MigrationWizard.tsx:37`** takes a `plan: PlanTemplate` prop; who builds it was not traced.
  `generatePlan(` has one non-test caller (`SetupWizard.tsx:1936`), so the migration's plan comes
  from elsewhere or from the wizard. The name change in Task 2 affects whichever it is.
- **LogView's post-completion rendering** was inferred from a test title, not read.
- **The Plan view chip strip's overflow behaviour** (`PlanView.tsx:251-285`, `views.css`) was not
  checked. Under years of extension the strip holds dozens of chips.
- **Whether `graphify-out/` is tracked** was not checked; I did not run `graphify --update`, so the
  decision headers above are not yet in the graph.
- **No literature search** was performed. The design adds no citation and no coefficient; the
  session-counted reading of the deload cadence is reasoning about the existing code, stated as
  such in Q3, and the cadence itself is unchanged.
- **No web sources were fetched**, so `REFERENCES.md` has no new line from this session.
- **Not designed**: what happens at the goal (owner's open item 4); a "start the next programme"
  control for the 104-week ceiling; regenerating the plan when `experience` or `equipment` is
  changed in Settings (an existing gap: `SettingsView.tsx:428` edits `experience`, and the plan's
  set counts came from the old value); windowing the block chip strip.
