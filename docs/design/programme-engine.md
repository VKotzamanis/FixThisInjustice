# Programme engine (ROADMAP L6)

Agent doc. Owner: "one training ends -> create the next one based on the data logged"; "more like a JIT compiler". Lead ruling 2026-11-05: build it. Code: `src/domain/plan/engine.ts`.

<!-- decision: programme-engine-derived-runway | status: adopted | supersedes: plan-open-ended-runway-extension -->
## Decision
- Open-ended plan. No length input; the wizard `programme` step is gone. `generatePlan` materialises `INITIAL_WEEKS` (= `PLAN_WEEKS_MIN`, 8, two cycles) at setup/restart; `programmeInput` no longer reads `plan.weeks`.
- Runway: `ensureRunway(state, profileId, today?)` keeps `sessions.length - nextSessionIndex >= RUNWAY_SESSIONS = max(CALENDAR_DAYS 28, SCHEDULE_HORIZON_DAYS 21)`. One session per civil date at most (calendar.ts), so N sessions cover >= N days of every forward window (Today strip, reminders, .ics).
- Cycle = one normal block + its deload (`cyclesOf`). Appended in whole cycles: `buildBlocks(spw, BLOCK_WEEKS)` offset, so the 3 + 1 deload cadence and `DELOAD_SET_MODIFIER` continue unchanged (deload stays a session-counted backstop; no autoregulation rule exists to cite).
- Next cycle from logged data (`deriveWeek`), evidence = latest cycle wholly behind the cursor:
  - Swap adopted: the latest completed session of that label swapped the slot (`SessionEdits.swaps`) and logged a non-bonus set of the substitute. Prescription via `substitutePlanned` (sets kept, reps re-derived at the slot intensity), the same entry Train used.
  - Consistent skip replaced: skipped (edit, or no set of it or its swap) in every completed session of that label that logged any set, at least `CONSISTENT_SKIP_MIN = 2`. Replacement = first of `swapAlternatives` (template peers, then shared direct mover; access + inventory filtered) that passes the guard. None passes: kept.
  - Volume guard (`volumeAllows`): no muscle's weekly midpoint above `WEEKLY_SET_BAND` top (or rising if already above), no interval top above `EVIDENCE_CEILING_SETS` (or rising), no in-band muscle below the band bottom. Template constants only; no new coefficient (rule 1).
  - Low adherence: completed < `LOW_ADHERENCE_FRACTION` (0.5, product rule, owner may tune) x pro-rated expected (`quota.ts expectedSessions`) over the ISO weeks the cycle's rows span, or no rows: next cycle keeps every exercise. "Rotating" = the two changes above; no variety rotation exists (no source in tree).
  - Progression carried by identity: kept/adopted entries keep `exerciseId` + prescription; `progression.ts` reads history by `exerciseId` at Train, so working load and met-top state continue. Rep-range extensions stay advisory (persisting them compounds per cycle with no cited cap).
- When: in the same transition as `completeSession`/`skipSession` (store `scheduleActions.ts`), in `applyReplacePlan` (setup, Start Next, Update), and as a launch/visibility catch-up after `closeWeeks` (`useWeeklyClose.ts`, store action `ensureRunway`).
- Ids: a session behind the cursor, or named by any row or set, is frozen. Only cycles starting at/after the cursor that nothing names are rewritten, in place (id, ordinal, position kept; labels canonical template order). Appended sessions get fresh ids. Later cycles copy the latest materialised week (so they already carry the evidence).
- Ceiling: appending stops at `limits.ts` (`MAX_PLAN_WEEKS` 104, `MAX_PLAN_SESSIONS`, `MAX_BLOCKS`); there the cursor finishes and "Programme Complete" + Start Next Programme render as before.

## Rule 7 (no migration, no schemaVersion bump)
- No stored field added or removed on `AppState`; plans only grow. `SetupAnswers.weeks` removed: zod strips the key from stored drafts; a draft resumes by `stepId` (a draft parked on `programme` resumes at the same index = guidance).
- Old finished programme: launch catch-up appends, clears `completedOn`, keeps `nextSessionIndex`; the finished days `[completedOn + 1, today)` become a closed pause so the Log grid and grading never call them missed. Grading runs first, under the finished cursor.
- Old plan names with ", N weeks," lose the length when the plan first grows (`withoutLength`); `sameProgramme` compares names without it.
- Rollback: an older build reads a grown plan (within schema ceilings); it drops a setup draft without `weeks` (outer `.catch(null)`).

## Displays (programme-horizon.md Q4)
- `S n` (`FORMAT.planPosition`), "Session n" / limelight "ep. n" (`status.sessionCursor`), Boot "week n" (`status.bootWeek`), reminder body "session n", plan name without length, review "Split, N sessions per week." + `advice.programmeContinues`. `programmeClosed`: "N sessions closed on D." (ceiling only).
- TimeCapsule default: goal target date, else `startedOn + INITIAL_WEEKS`.
- `sameProgramme` (Settings Update Programme): name (without length), split, first week as a multiset. A grown or evolved plan is not "changed".
- Start Next Programme stays for a goal change.

## Rejected
<!-- decision: plan-open-ended-runway-extension | status: superseded | supersedes: none -->
- Copy cycle 1 forward (programme-horizon.md Option A): open-ended but a blind copy; ignores the owner's "based on the data logged".
<!-- decision: plan-regenerate-on-exhaustion | status: rejected | supersedes: none -->
- Regenerate at the end (Option B): new plan id, cursor 0, assignments wiped, displays restart; still a blind template.
<!-- decision: plan-sessions-fully-derived | status: rejected | supersedes: none -->
- Pure JIT, no materialised sessions (Option C, audit D section 2 (c)): schema change + migration; breaks reminders, .ics, Plan tab, `assignToday` swap, `LoggedSet.sessionId` resolution.
- Append the next cycle only when the cursor reaches the end: violates the forecast windows (21/28 d) for every split.
- Generate each appended cycle once and never revisit: with a 28-session runway the cycle served next would be built 1-2 cycles before the data it should use.
- Persist the earned rep-range extension into the next cycle: compounds +2 reps per cycle with no cap in the sources.

## Tests
- `src/domain/plan/engine.test.ts`: every spw x experience x tier x cardio cell (ids unique, ordinals contiguous, blocks/cycles cover sessions, deload layout, runway, identity); trained sweep spw x tier (frozen ids, logged sets resolve, volume within band, engine choices fit access + inventory, progression advice unchanged); adoption, latest-wins, skip replacement, single skip, no-set Finish, low adherence, frozen cycle, revival + gap pause, ceiling.
- `src/domain/plan/engineForecast.test.ts`: reminders (21 d) and .ics (28 d) past the end of a 12-week plan.
- `src/store/scheduleActions.test.ts` (L6 block), `src/store/profile.test.ts`, wizard tests, `e2e/l6-next-block.spec.ts`.

## Open
- Owner wording: `advice.programmeContinues`, limelight `status.sessionCursor` ("ep. {shown}", was "ep. {shown} of {total}").
- Owner tuning: `LOW_ADHERENCE_FRACTION`, `CONSISTENT_SKIP_MIN`.
- Added exercises (`SessionEdits.added`) do not enter the next cycle.
- Plan view chip strip grows two chips per cycle (programme-horizon.md section 8).
