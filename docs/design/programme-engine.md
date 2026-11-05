# Programme engine (ROADMAP L6)

Agent doc. Owner: "one training ends -> create the next one based on the data logged"; "more like a JIT compiler". Lead ruling 2026-11-05: build it. Code: `src/domain/plan/engine.ts`.

<!-- decision: programme-engine-derived-runway | status: adopted | supersedes: plan-open-ended-runway-extension -->
## Decision
- Open-ended plan. No length input; the wizard `programme` step is gone. `generatePlan` materialises `INITIAL_WEEKS` (= `PLAN_WEEKS_MIN`, 8, two cycles) at setup/restart; `programmeInput` no longer reads `plan.weeks`.
- Runway: `ensureRunway(state, profileId, today?)` keeps `sessions.length - nextSessionIndex >= RUNWAY_SESSIONS = max(CALENDAR_DAYS 28, SCHEDULE_HORIZON_DAYS 21)`. One session per civil date at most (calendar.ts), so N sessions cover >= N days of every forward window (Today strip, reminders, .ics).
- Cycle = one normal block + its deload (`cyclesOf`). Appended in whole cycles: `buildBlocks(spw, BLOCK_WEEKS)` offset, so the 3 + 1 deload cadence and `DELOAD_SET_MODIFIER` continue unchanged (deload stays a session-counted backstop; no autoregulation rule exists to cite).
- Next cycle from logged data (`deriveWeek`), evidence = latest cycle wholly behind the cursor:
  - Swap adopted: the SAME substitute swapped in (`SessionEdits.swaps`) and logged (non-bonus set) in each of the latest `CONSISTENT_SWAP_MIN` (= `CONSISTENT_SKIP_MIN`, derived) completed sessions of that label; fewer such sessions: none. Was latest-wins (one session): a one-tap Replace would rewrite the next block after one day (lead ruling R-A, 2026-11-05). Prescription via `substitutePlanned` (sets kept, reps re-derived at the slot intensity), the same entry Train used.
  - Consistent skip replaced: skipped (edit, or no set of it or its swap) in every completed session of that label that logged any set, at least `CONSISTENT_SKIP_MIN = 2`. Replacement = first of `swapAlternatives` (template peers, then shared direct mover; access + inventory filtered) that passes the guard. None passes: kept.
  - Volume guard (`volumeAllows`): no muscle's weekly midpoint above `WEEKLY_SET_BAND` top (or rising if already above), no interval top above `EVIDENCE_CEILING_SETS` (or rising), no in-band muscle below the band bottom. Template constants only; no new coefficient (rule 1).
  - Low adherence: completed < `LOW_ADHERENCE_FRACTION` (0.5, product rule, owner may tune) x pro-rated expected (`quota.ts expectedSessions`) over the ISO weeks the cycle's rows span, or no rows: next cycle keeps every exercise (no adoption, replacement or rotation).
  - Accessory rotation (decision `engine-accessory-rotation` below): each slot whose home exercise is not `isCompoundPrimary` alternates home / one alternate per cycle.
  - Progression carried by identity: kept/adopted entries keep `exerciseId` + prescription; `progression.ts` reads history by `exerciseId` at Train, so working load and met-top state continue. Rep-range extensions stay advisory (persisting them compounds per cycle with no cited cap).
- When: in the same transition as `completeSession`/`skipSession` (store `scheduleActions.ts`), in `applyReplacePlan` (setup, Start Next, Update), and as a launch/visibility catch-up after `closeWeeks` (`useWeeklyClose.ts`, store action `ensureRunway`).
- Ids: a session behind the cursor, or named by any row or set, is frozen. Only cycles starting at/after the cursor that nothing names are rewritten, in place (id, ordinal, position kept; labels canonical template order). Appended sessions get fresh ids. Each rewritten or appended cycle is derived from the cycle before it (latest materialised week + the evidence), so the rotation alternates; adoption and replacement do not re-fire (their keys are gone from the base).
- Ceiling: appending stops at `limits.ts` (`MAX_PLAN_WEEKS` 104, `MAX_PLAN_SESSIONS`, `MAX_BLOCKS`); there the cursor finishes and "Programme Complete" + Start Next Programme render as before.

<!-- decision: engine-accessory-rotation | status: adopted | supersedes: none -->
## Accessory rotation
- Owner: "if you keep doing the same exercises over and over again there is a plateau and you would need to change your regiment." NOT a plateau fix: no source shows repetition causes a plateau (evidence `docs/private/evidence/exercise-variation-2026-11-05.md` Q1). Varied vs fixed: no clear difference at 8-12 wk (V1, V2, V6, V7). V3 (DOI 10.1519/jsc.0000000000004258): systematic variation may help regional hypertrophy and dynamic strength, excessive random variation may hinder. V16 ACSM 2026 (DOI 10.1249/mss.0000000000003897): "insufficient data". V1 Fonseca 2014 (DOI 10.1519/jsc.0000000000000539): accessories changed at 4-week boundaries, squat kept.
- Code: `engine.ts` `accessoryAlternates`, `rotationOn`, `deriveWeek` step 3.
- Scope: slots whose home is `isCompoundPrimary === false`; conditioning excluded. Home = that label's slot in the plan's first week (cycle 0 is never rewritten).
- When: once per cycle (`BLOCK_WEEKS`, V1's 4 weeks), at the boundary; every week of a cycle holds the same exercises. No new constant.
- What: A, B, A, B. Alternate = first of `swapAlternatives({ original: home }).suggested` not home, same `loadClass`, not in the home session (nor an earlier slot's alternate), passing `volumeAllows` against the home week both ways. Function of home week + profile only, so every cycle sees one pair. Prescription: `substitutePlanned`; home again = the template entry. Each change still passes the guard against the current week.
- Two, not round-robin (product choice): each exercise returns after one cycle, so its own `exerciseId` progression history is at most one cycle old (no inter-exercise load coefficient exists, C5).
- None for a slot when: low adherence; slot adopted or skip-replaced in this derivation; no alternate qualifies; base holds neither home nor alternate (the user's pick stays); switch off.
- Switch: Settings > Programme "Rotate Accessory Exercises Each Block" (`ProgrammeSettings.tsx`), `Profile.rotateAccessories` optional, absent = on (rule 7; `.catch(true)`). Toggle = `updateProfile` + store `ensureRunway`: untouched future cycles re-derived; off = copy of the cycle before (no revert to home).
- Rejected:
  - Round-robin over all alternatives: an exercise returns after N cycles with stale progression history; V3 "excessive rotation" caution.
  - Rotating primaries (file R1): V1 kept the main lift; specificity V9, V10, V11; file candidate C2 keeps primaries fixed.
  - Plateau-triggered rotation (file R2): no study tests that rotation resolves a stall; premise unsupported (Q1); V13: plateau vs short-term stall hard to tell apart.
  - Random per-session rotation (file R3): V3 "excessive, random variation may compromise muscular gains"; breaks per-`exerciseId` double progression.
  - 2-week schedule (file R4): appears only in V2's mis-description of V1; V1 Table 2 shows 4-week blocks.
  - Inter-exercise load coefficient: none exists (C5).

## Rule 7 (no migration, no schemaVersion bump)
- No stored field added or removed on `AppState`; plans only grow. `Profile.rotateAccessories` is additive and optional (absent = on); B16 captures still round-trip (no new capture). `SetupAnswers.weeks` removed: zod strips the key from stored drafts; a draft resumes by `stepId` (a draft parked on `programme` resumes at the same index = guidance).
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
- `src/domain/plan/engine.test.ts`: every spw x experience x tier x cardio cell (ids unique, ordinals contiguous, blocks/cycles cover sessions, deload layout, runway, identity); trained sweep spw x tier (frozen ids, logged sets resolve, volume within band, engine choices fit access + inventory, progression advice unchanged); adoption (`CONSISTENT_SWAP_MIN`: one session not adopted, two are, mixed substitutes not), skip replacement, single skip, no-set Finish, low adherence, frozen cycle, revival + gap pause, ceiling.
- Rotation (`engine.test.ts`): A/B/A/B, primaries fixed, switch off/absent, toggle re-derives with frozen sessions and ids kept, adopted and skip-replaced slots win, idempotent, progression by own `exerciseId`; `accessoryAlternates` volume guard, access + inventory per tier. Sweep: cycle k+2 = cycle k, guard against the cycle before. Schema: `schema.test.ts`. Settings: `SettingsView.test.tsx`.
- `src/domain/plan/engineForecast.test.ts`: reminders (21 d) and .ics (28 d) past the end of a 12-week plan.
- `src/store/scheduleActions.test.ts` (L6 block), `src/store/profile.test.ts`, wizard tests, `e2e/l6-next-block.spec.ts`.

## Open
- Owner wording: `advice.programmeContinues`, limelight `status.sessionCursor` ("ep. {shown}", was "ep. {shown} of {total}").
- Owner tuning: `LOW_ADHERENCE_FRACTION`, `CONSISTENT_SKIP_MIN` (also sets `CONSISTENT_SWAP_MIN`).
- Rotation: a slot adopted to exactly its alternate alternates again from the next cycle (no stored marker of the user's pick). A skip replacement that lands on the home exercise rotates back to the skipped alternate a cycle later.
- Added exercises (`SessionEdits.added`) do not enter the next cycle.
- Plan view chip strip grows two chips per cycle (programme-horizon.md section 8).
