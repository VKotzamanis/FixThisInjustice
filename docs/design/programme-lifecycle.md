# Programme lifecycle (ROADMAP L5, B1b, B1d, L7)

Agent doc. Regenerate the programme from today: when Settings no longer match it (L5), and after Programme Complete (B1b). After a reached body-mass target the next programme defaults to maintenance (L7). Fixed length kept; L6 (open-ended) is separate.

## One mechanism
- Store action `restartProgramme(profileId, choice, today)`; `choice = { goal?, sessionsPerWeek?, includeCardio? }`. Both entry points call it; nothing regenerates without a tap.
- Input (`programmeInput`, `src/domain/plan/lifecycle.ts`, pure): goal = `choice.goal ?? profile.goal.kind`; experience, equipment = profile; sessionsPerWeek = `choice` or the current plan's; weeks = current plan's; includeCardio = `choice` or `planIncludesCardio(plan)`. Plan values outside the generator's range (imported or fixture plans) are clamped to it (weeks 8-24, sessions 2-6), never otherwise adjusted.
- `planIncludesCardio`: any planned exercise in `CARDIO_EXERCISE_IDS` (the generator's conditioning list, now exported). No template slot names those ids (test).
- Generator unchanged: `generatePlan(input, EXERCISES)`, same call as the wizard (`src/ui/setup/SetupWizard.tsx` `generatePlan`).
- One `set()`: goal kind patched only when `choice.goal` differs; `availability.weeklySessionTarget = sessionsPerWeek` only when sessionsPerWeek changed (the wizard's own rule: picking a split sets the target to it); plan replaced exactly as `setPlan` (shared pure `applyReplacePlan`, `src/store/programme.ts`).
- Throws, writing nothing: unknown profile; no current plan; a session in progress (setPlan's existing guard, `sessionInProgress`); a changed sessionsPerWeek above the distinct slot weekdays (the wizard blocks the same, `FORMAT.daysForSessions`).
- No schema change.

## Kept / cleared (applyReplacePlan; wizard and restart alike)
- Kept: sets, records (derived from sets), body mass, hydration, intake, specimens, capsules, custom exercises, motivation state, every old plan (sets resolve their sessionId there), profile except goal kind.
- Kept: weekly reviews of weeks before `weekStart(startedOn)`.
- Kept: finished assignments (completed/skipped) dated `weekStart(startedOn)..startedOn`. The new programme grades that week (`closeWeeks` starts there), so a Monday trained under the old plan still counts; today's finished session stays a fact (no second session served today; Train shows "no session today").
- Cleared: planned assignments, finished ones before that week, pauses, session slice + mirror (as before).
- Cleared: reviews with `weekStart >= weekStart(startedOn)`. Under a forward clock none exist (only ended weeks are reviewed); they arise from a zone change or a back-dated start.
- Block stats (`src/domain/fun/blocks.ts`) count only assignments whose sessionId is in the current plan, so a kept start-week row's old `sourceIndex` cannot land in a new block.

## B1d resolution
- Grading: the reviews the new programme would grade are removed by setPlan (above), so `closeWeeks`' `alreadyReviewed` never holds a leftover week.
- Popup and Today: `isBeforeProgramme(monday, cursor)` (`weekly.ts`, mirror of `isAfterProgramme`): week begins before `weekStart(cursor.startedOn)`. `pendingMotivation` and Today's last review skip such weeks, so an old-plan miss neither pops up nor shows on the new programme.

## Goal reached (L7)
- Applies only to a goal that moves body mass: `massDirection(kind)` from `GOAL_AXES_BY_KIND` (fat lose + muscle hold = down: fat loss; fat hold + muscle gain = up: muscle gain; recomposition and maintenance hold mass, `nutrition.ts` energyPlan at TDEE).
- Reached: `goal.targetMassKg` set, at least one logged body-mass entry, and the latest one (by date, then loggedAt; `latestBodyMassEntry`) is at or below the target (down) or at or above it (up). Baseline mass is not a logged entry.
- Then Start Next Programme preselects Maintenance and says so in one sentence. The user can pick any goal. Target mass and date are left as stored. Energy follows from `goal.kind` (`computeTargets`); no coefficient added.
- Update Programme (Settings) does not apply L7: the goal there is the Settings goal.

## UI
- Settings, Profile section, after Creatine: `hero.programme` group: Equipment Access select (writes `profile.equipment` at once, like Goal and Experience), Sessions per Week select (options up to the distinct slot weekdays), conditioning checkbox. The last two are local choices seeded from the plan, applied only by Update.
- Offered when the plan built from these settings differs from the stored one (`sameProgramme`: name, length, split, blocks, sessions as a multiset ignoring ids and order; `assignToday` swaps reorder sessions). Note + [Update Programme] -> group: restart sentence + [Start Programme] [Cancel]. During a live session: note only, no button.
- Today, Programme Complete: WeekStamp and Intervention no longer render (B1b). [Start Next Programme] -> group: Goal select (default per L7), L7 sentence when it applied, restart sentence, [Start Programme] [Cancel].
- Controls: `.view button`/`.view select` (44 px, 16 px). No new CSS.

## Copy keys (base table; no limelight overrides; parity fixture extended)
- `button.updateProgramme`, `button.startNextProgramme`, `button.startProgramme`
- `advice.programmeDiffers`, `advice.programmeRestart`, `advice.targetReachedMaintenance`, `advice.programmeLockedInSession`
- Reused: `hero.programme`, `label.equipmentAccess`, `option.access*`, `label.sessionsPerWeek`, `label.includeCardio`, `label.goal`, `option.goal*`, `button.cancel`.

## Not in scope
- Editing training weekdays and times after setup (availability; calendar-only, plan unchanged). Programme length control. Partial first/last week grading (B1a). Export summary listing (B1c). Open-ended programme (L6).
