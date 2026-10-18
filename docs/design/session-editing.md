# Session editing (ROADMAP L1-L4)

Agent doc. Change today's session while training: edit a logged set (L1), swap (L2), skip/remove/reorder (L3), add from the library (L4).

## Data model
- L1: no schema change. `updateSet(id, measurement)` rewrites `loadKg`, `reps`, `durationS`, `enteredUnit` of an existing `LoggedSet`; `id`, `loggedAt`, `setNumber`, `isBonus`, `sessionId`, `exerciseId`, `assignmentDate`, `rpe` are kept. Validated by `LoggedSetSchema`.
- L2-L4: optional `SessionAssignment.edits?: SessionEdits` (`src/domain/types.ts`, `src/domain/schema.ts` `SessionEditsSchema.optional()`). No default, no `.catch`: absent = plan as written.
  - `swaps: Record<slotKey, exerciseId>`: planned slot -> substitute.
  - `skipped: slotKey[]`.
  - `added: exerciseId[]`: library or custom, in the order added.
  - `order: slotKey[]`: display order; keys missing from it follow in default order (plan, then added). Tolerates stale entries.
  - `slotKey` = the planned `exerciseId` (unique per session: generator `used` set, `src/domain/plan/generator.ts:121`; TrainView already keys cards by it) or an added `exerciseId`.
  - Arrays capped at `MAX_SESSION_EDIT_IDS` (sanity ceiling).
- No `schemaVersion` bump. An old document or export has no `edits` key; parse keeps it absent, so the result deep-equals the input. Tests: `src/domain/schema.test.ts` (old document), `src/domain/alphaFixture.test.ts` (old export, round trip).
- Rejected: session slice / sessionStorage (lost when iOS relaunches a Home Screen app; no durable record). Rejected: root-level `sessionEdits` map (needs `PROFILE_KEYED_MAPS`, `selectState`, `defaultState`, fixtures, and manual clearing in `setPlan`; the assignment field gets that lifecycle for free).

## Where changes persist
- `fti.v3` through the store only. One action: `editSession(profileId, date, edit)` -> `applyEditSession` (`src/store/training.ts`) -> `applySessionEdit` (`src/domain/training/sessionEdits.ts`, pure).
- `edit` = `swap {key, exerciseId}` | `skip {key}` | `restore {key}` | `move {key, by: -1|1}` | `add {exerciseId}` | `remove {key}`.
- Throws (UI shows `status.sessionEditRefused`): unknown profile; no assignment on `date`; assignment `completed`/`skipped`; key not in lineup; exercise unknown to shipped + profile custom library; exercise already in lineup; `remove` of a planned slot.
- Edits return to "absent" when they are empty again (restore everything -> no key).
- Lifecycle = the assignment's: `setPlan` clears assignments (edits go); `assignToday` picking another session mints a fresh assignment (`src/domain/schedule/calendar.ts:378`), edits for the old session go; re-picking the same session is a no-op (`sameAssignment`), edits stay.
- Session slice untouched by every edit action (rest timer, `activeAssignmentDate`, undo buffer): the rest timer keeps running. Asserted in store tests.
- Custom exercises (`AddCustomExercise.tsx`) now also land in `edits.added`. `session.bonusExerciseIds` keeps being read (a mirror written by an older build mid-session) but has no writer from the UI.

## Lineup (`sessionLineup`, pure)
- Planned slots in plan order. Swap: substitute's prescription = `prescriptionFor(sub, slotIntensityOf(slot.prescription))`, rest = `restSFor(sub, prescription)`, `setsLo`/`setsHi` kept (the slot's volume decision; deload modifier still applies).
- Added: `prescriptionFor(ex, 'moderate')` (custom: 8-12 reps, same as the old bonus default), 3 sets (old default), rest from the cited table.
- Extra cards, never hidden: an exercise with sets logged today that is not in the lineup. A swapped-out original goes right after its slot with the original planned slot ("Swapped Out", non-bonus); anything else is a bonus card at the end (existing rule).
- Swap alternatives (`swapAlternatives`): suggested = other candidates of every template slot that lists the current exercise (`SPLIT_TEMPLATES`, best first), then library exercises sharing a direct mover (`muscleGroups`); both filtered by `ACCESS_UNLOCKS[profile.equipment]`. Others = rest of shipped + custom library. Lineup ids excluded.
- Add picker: fits equipment first, then the rest; lineup ids excluded; custom form kept as fallback.

## Derived numbers
- Progression (`suggestedProgression`, per `exerciseId`, excludes `isBonus`): swapped-in sets are non-bonus (they fill a planned slot) and feed the substitute's own history; the original gets no sets that day, its next suggestion is unchanged. Added-exercise sets stay `isBonus: true` (`ExerciseCard.tsx:154`): never feed progression. Skipped: no sets.
- Records (`src/domain/training/records.ts`): every set of an `exerciseId`, bonus included, derived on read; an edited set re-derives them.
- Weekly volume: Targets `volumeReport(plan)` reads the plan template, not logs (`src/ui/views/TargetsView.tsx:94`). Session edits do not change it. No logged-volume tally exists.
- Compliance: `src/domain/schedule/weekly.ts:142` counts `completed` assignments. A swapped/skipped/added session counts once Finish is tapped, as before.
- Specimens, milestones: `updateSet` changes no count and draws nothing.

## Logged data
- No edit deletes a set. Swap: original's sets stay under its `exerciseId`, shown on its own "Swapped Out" card. Skip: the card stays in place, tagged Skipped, closed, its sets visible and editable when opened; Restore brings it back. Remove: offered only for an added exercise with no sets today; with sets the control is Skip.
- `updateSet` keeps id and `loggedAt`.

## UI (one hand, phone)
- Logged set row: [Edit] beside [Delete]. Edit reopens the row's own fields in place, prefilled (load, reps or seconds, bodyweight toggle), with [Save] [Cancel]. No rest-timer restart, no coach line.
- Open card, session not finished, at the bottom of the card: 2-column grid of [Swap] [Skip Exercise | Remove Exercise] [Move Up] [Move Down], wrapped in a group named by the exercise. Swap opens an inline native `<select>` (OS picker, large rows) with optgroups Same Muscle / Other Exercises, then [Confirm Swap] [Cancel].
- Skipped: the same card, tagged Skipped, not auto-opened; its bar offers only [Restore]. The card being moved, swapped or restored stays open; after Skip or Remove the first card still to do opens; an added card opens itself.
- End of list: [Add Exercise] -> native `<select>` (Fits Your Equipment / Other Exercises) + [Add to Session] [Cancel]; [Custom Exercise] -> existing free-text form.
- Every control is a `.view button` / `.view select`: 44 px min height, 16 px text (`src/ui/views/views.css`). No hover-only control, no drag, no swipe. Finished session: edit bar and both add controls hidden; skipped cards stay tagged.

## Copy keys added (base table, no limelight overrides; parity fixture extended)
- `button.editSet`, `button.saveSet`, `button.swapExercise`, `button.confirmSwap`, `button.skipExercise`, `button.removeExercise`, `button.restoreExercise`, `button.moveUp`, `button.moveDown`, `button.addCustomExercise`, `button.addToSession`
- `label.exerciseChoice`, `label.sameMuscle`, `label.otherExercises`, `label.fitsEquipment`, `label.skipped`, `label.swappedOut`
- `status.swappedFrom`, `status.sessionEditRefused`
- Frames: `FORMAT.editSetLabel`, `FORMAT.saveSetLabel`, `FORMAT.swappedFrom`.

## Not in scope
- RPE (L8), plan regeneration (L5), editing past sessions from Log, logged-volume tally.

- Update 2026-10-18: L8 shipped. Effort (`rpe`) is set by one tap after logging and edited via the L1 Edit flow; see ROADMAP L8.
