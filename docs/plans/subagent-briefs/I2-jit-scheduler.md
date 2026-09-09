# Brief I2: the just-in-time scheduler

Read `00-CONTEXT.md` first. Claims C1.12.2, C1.12.4 to C1.12.6. **Round 3's first brief.**

This was Part 5 of brief I. It was split out on 2026-09-09, on brief I's own instruction: "This
part is large. If it does not fit one pass, do Parts 1 to 4 and STOP, and say so. A half-migrated
scheduler is worse than none." Brief I shipped Parts 1 to 4; this is the remainder, reproduced
below exactly as brief I stated it.

<!-- decision: brief-i-split-at-part-4 | status: adopted | supersedes: brief-i-single-pass -->

**Why it is its own brief.** It deletes a wizard step, rewrites the plan generator, splits schedule
generation from prescription generation, and changes the deload from a calendar position to an
autoregulated trigger. Three shipped features read the forward plan and all three break under a
naive change: reminders send upcoming session instants to the Worker, the `.ics` export exports
upcoming sessions, and the Plan tab's whole content is the programme week by week. Doing that in
the same pass as the goal chooser is how both end up half done.

**Files this one owns, which brief I was told not to touch:** `src/domain/plan/`,
`src/domain/schema.ts`, `src/domain/migrations/`, `src/ui/components/Boot.tsx`,
`src/ui/components/TimeCapsule.tsx`, plus the wizard's `programme` step.

**Verify with `npx vitest run src/domain/plan/` before anything else.** The generator's matrix must
still pass for every `sessionsPerWeek` x experience x equipment x weeks x cardio cell.

---

## Part 5 — The programme step disappears (C1.12.2, C1.12.4 to C1.12.6)

> "How many generated exercise days would be generated -like a Ahead Of Time compiler? if that's
> the case NO. It would be much better if each day's program can be more like a JIT compiler."

Finding B25: the step sets one number, `PlanTemplate.weeks`, bounded 8 to 24. Derive it from the
target date instead and DELETE the step. Two consumers keep reading `weeks` and must keep working:
`src/ui/components/Boot.tsx` prints "week X of Y", and `src/ui/components/TimeCapsule.tsx:145`
computes the capsule's opening date from it.

**The just-in-time change is a SPLIT, not a swap.** Finding B23. Three shipped features read the
forward plan and all three break under pure JIT:

- reminders send the instants of upcoming sessions to the Worker;
- the `.ics` export exports upcoming sessions;
- the Plan tab's whole content is the programme week by week.

So: **generate the SCHEDULE ahead** — dates, session labels, target volume — and **generate the
PRESCRIPTION just in time**, at session start, from what has actually been logged. Reminders, the
export and the Plan tab all keep working against the schedule; the exercises, sets and loads are
decided when the session begins.

**The deload stops being a calendar position.** `src/domain/plan/generator.ts` already labels the
four-week cadence a HEURISTIC and cites Bell 2023 (100 % panel agreement that pre-planned deloads
"might not be necessary") and Coleman 2024 (no hypertrophy benefit from a mid-programme deload).
The review's own recommendation is "autoregulate; keep a 4-8 week calendar backstop". Trigger the
deload from accumulated volume and completion, and keep the backstop so a deload cannot be
deferred for ever.

**This part is large.** If it does not fit one pass, do Parts 1 to 4 and STOP, and say so. A
half-migrated scheduler is worse than none.
