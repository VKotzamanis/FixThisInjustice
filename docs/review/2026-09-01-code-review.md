# FixThisInjustice Console — forensic code review

Date: 2026-09-01
Scope: `index.html`, `data.js`, `console-content.js`, `core.jsx`, `console-store.jsx`,
`console-shared.jsx`, `console-train.jsx`, `console-video.jsx`, `console-today-extras.jsx`,
`console-views.jsx`, `console-fun.jsx`, `tweaks-panel.jsx`, `console-app.jsx`, `sw.js`,
`manifest.json`.
Excluded by instruction: `prototype-*.html`, `design-canvas.jsx`, `console.html`.
Excluded by division of labour: the scientific content of the training plan; security.

Every finding below was confirmed by reading the executing code path. Line numbers refer to
the files as they stand at the time of writing.

---

## A. Bugs and fragile logic that must not be ported

Severity key:
**Critical** — silent data loss, or a wrong number the user will act on.
**High** — a documented feature is broken or wrong under normal use.
**Medium** — wrong on a reachable non-default path, dead state, or a performance defect.
**Low** — cosmetic or documentation drift.

### A.1 Unit handling

The app has no unit system. It has two hard-coded unit conventions that never meet, and a
third implied by the plan data.

| Quantity | Unit | Where |
| --- | --- | --- |
| Logged set load (`sets[k].weight`) | kg (by label only; no validation) | `console-train.jsx:127`, `console-views.jsx:508` |
| Body mass log (`weightLog[].lb`) | lb (field is literally named `lb`) | `console-store.jsx:92,256-258` |
| Projection curve (`PLAN.weight_curve_lb`) | lb | `data.js:70-74` |
| Subject baseline | both (`weight_kg: 95.3`, `weight_lb: 210`) | `data.js:6-7` |
| Phase milestones | mixed per field (`weight_lb`, `bench_kg`) | `data.js:30-33` |
| Load increment | 2.5 (kg) | `console-store.jsx:252`, `console-train.jsx:129` |
| Plateau threshold | 1.0 (lb) | `console-store.jsx:322` |

**A1 — Critical. Load increment and plateau threshold are unit-inconsistent with each other
and unenforced against input.**
`console-store.jsx:252` — `if (hitTop) return { weight: last.weight + 2.5, hint: "+2.5 kg — top reps × 2" };`
`console-store.jsx:322` — `plateau = wkSpan >= 2 && lbSpan <= 1.0;`
The set input (`console-train.jsx:127-130`) is a bare `type="number" step="2.5"` with
placeholder `"kg"`. Nothing rejects, tags, or converts a value. A user who trains on lb plates
enters `225`; every downstream consumer treats it as 225 kg.
Observed: `PRList` (`console-views.jsx:508`) renders `225 kg × 5`; `buildTelemetryMsg`
(`console-fun.jsx:139`) computes an Epley e1RM of 262 "kg"; the phase-transition cutscene
(`console-app.jsx:69`, `console-fun.jsx:290`) reports tonnage in "kg".
Expected: one canonical stored unit with an explicit per-user display preference.

**A2 — Critical. Body-mass entry silently rejects any kg value.**
`console-today-extras.jsx:147` and `:152`, and `console-views.jsx:422` and `:427`:
`if (lb > 100 && lb < 300) { logWeight(s.week, lb); setVal(""); }`
Failing input: a user weighing 95 kg types `95`. Observed: the guard is false, `logWeight`
is never called, the input is not cleared, and **no error is shown**. The user believes the
weigh-in was recorded. Expected: either a unit-aware range or a visible validation message.
The same guard also caps the app at 100–300 lb (45–136 kg), excluding real users at either end.

**A3 — Critical. The Δ-vs-baseline display hard-codes one subject's start mass in lb.**
`console-views.jsx:24` — `const delta = lastLogged ? (lastLogged.lb - 210).toFixed(1) : null;`
`console-views.jsx:647` (export) — `const delta = (w.lb - 210).toFixed(1);`
Observed for any user other than the original subject: a delta measured against 210 lb,
presented as their progress. Expected: delta against that user's own recorded baseline.

**A4 — High. The body-mass chart's y-axis is a fixed lb window.**
`core.jsx:86` — `const min = 180, max = 212;`
Failing input: any logged value outside 180–212. Observed: `yAt()` returns a coordinate
outside the plot box; because the `<svg>` carries `style={{ overflow: "visible" }}`
(`core.jsx:103`), the polyline is drawn over neighbouring UI rather than clipped or rescaled.
A kg-entering user (e.g. 95) plots roughly 4× the chart height above the frame.
Milestone markers at 202/192/183 lb (`core.jsx:96-98`) are likewise fixed to one subject.

**A5 — High. Coach feedback is unit-labelled kg while comparing against unlabelled numbers.**
`console-store.jsx:14` — ``return `weight PR · prev best ${lastBest.weight} kg`;``
`console-store.jsx:33` — ``return `top of range at ${weight} kg × ${reps} · +2.5 kg next session`;``
The `± 0.5` and `± 2.5` deadbands at `console-store.jsx:17` and `:21` are absolute constants
in the same unlabelled space. On lb input, the "over suggested" band is 0.5 lb (0.23 kg) —
i.e. essentially every set trips it. Observed: `+2.3 kg over suggested · pushing hard` fires
on a 1 lb difference, phrased in the wrong unit.

**A6 — Medium. The export is the only place a conversion exists, and it is one-way and
unlabelled at source.**
`console-views.jsx:646` — `const kg = (w.lb / 2.20462).toFixed(1);`
Set loads in the same export are printed as kg (`console-views.jsx:666`) without ever having
been established as kg. Two different unit assumptions are serialised into one document with
no provenance.

**A7 — Low. Divisor precision.** `2.20462` (`console-views.jsx:646`) instead of the exact
`0.45359237 kg/lb`; ~0.9 ppm error. Irrelevant at 0.1 lb display resolution, but there is no
reason to carry an approximate constant.

### A.2 Date, timezone and program position

**A8 — Critical. `todayISO()` returns the UTC date, not the user's local date.**
`console-store.jsx:53` — `const todayISO = () => new Date().toISOString().slice(0, 10);`
`toISOString()` converts to UTC before formatting. Failing scenario, Europe/Athens (UTC+3 in
summer): at 01:30 local on 3 September, `toISOString()` yields `2026-09-02T22:30:00Z` →
`"2026-09-02"`.
Observed: the day's hydration cups (`console-store.jsx:262,354`) and daily note
(`console-store.jsx:263`, `console-views.jsx:17`) reset at **03:00 local**, not midnight, and
between 00:00 and 03:00 the user is writing into yesterday's record. Symmetrically for
UTC-offset users west of Greenwich, the day rolls over early: in America/New_York the app
switches to "tomorrow" at 20:00 local.
Expected: a local-calendar date derived from `getFullYear()/getMonth()/getDate()` or
`Intl.DateTimeFormat` with an explicit IANA zone.

**A9 — Critical. `isoDaysBetween` loses a day across a spring-forward DST boundary.**
`console-store.jsx:54-58`:
```
const da = new Date(a + "T00:00:00");
const db = new Date(b + "T00:00:00");
return Math.floor((db - da) / 86400000);
```
`"YYYY-MM-DDT00:00:00"` without a zone designator is parsed as **local** midnight. If a
spring-forward transition falls between the two dates, the true elapsed interval is
`N·86400000 − 3600000` ms, and `Math.floor((N·24 − 1)/24) = N − 1`.
Failing scenario: `startDate = "2026-02-02"`, today `= "2026-04-06"` in Europe/Athens
(transition 29 March 2026). True elapsed = 63 days; function returns **62**.
Observed: `programPosition` reports day 63 of 168 as day 62 — the whole plan silently slips
one day behind for the remainder of the program (until the autumn fall-back adds it back,
because the +1 h case floors to the correct N). Every derived value keyed on `day_idx` —
week, day-of-rotation, streak window, progress percentage — is wrong by one day for roughly
seven months of a 24-week program that spans a March transition.
Expected: compute the difference on UTC-noon anchors, or on a calendar-day count, so the
result is DST-independent.

**A10 — High. `isoOffset` returns the previous day in every positive-UTC-offset timezone.**
`console-store.jsx:59-63`:
```
const d = new Date(iso + "T00:00:00");
d.setDate(d.getDate() + days);
return d.toISOString().slice(0, 10);
```
It parses as local midnight and formats as UTC — the same mismatch as A8, in one function.
Failing input, Europe/Athens: `isoOffset("2026-09-03", 0)` → local `2026-09-03T00:00+03:00`
→ `2026-09-02T21:00Z` → returns `"2026-09-02"`.
Observed: an identity operation shifts the date back one day. Currently harmless only
because the function is **never called** — it is defined and exported
(`console-store.jsx:402`) and has no call site anywhere in the codebase. Do not port it; it
is a trap primed for whoever needs date arithmetic next.

**A11 — High. The program advances on wall-clock time alone; skipped days are not
recoverable.**
`console-store.jsx:68-77`. `programPosition` is a pure function of `(startDate, today)`. There
is no attendance, pause, or cursor input.
Failing scenario: the user trains days 1–3, then travels for ten days.
Observed: on return the app shows day 14 (week 2, day 7 = Full Rest). Days 4–13 are
permanently in the past; their `sets` keys can only be reached by manually scrubbing week
and day in the PLAN view, and doing so makes `onTrack` false while the Today hero still says
"today is …". The streak (A19) reads 0. Expected under the new requirements: a plan cursor
that only advances when a session is completed or explicitly skipped.

**A12 — Medium. The before-start and after-end branches produce plausible-looking wrong
states, and their flags are never read.**
`console-store.jsx:71` — `if (days < 0) return { day_idx: 0, week: 1, doW: 1, future: true };`
`console-store.jsx:72` — `if (days >= 168) return { day_idx: 167, week: 24, doW: 7, past: true };`
Grep confirms no consumer reads `.future` or `.past` anywhere.
Observed, future start date: the app renders as though the user is on day 1 today —
`onTrack` is true, TopBar shows `D 1/168`, TRAIN offers the Push session.
Observed, day 168+: the app pins permanently to week 24 / day 7, which is the Full Rest day,
with a 100% progress bar and no completion state. The user who finishes the program is left
looking at a rest day forever.

**A13 — Medium. Nothing recomputes the program position at midnight.**
`programPosition` is called inside the `derived` `useMemo` (`console-store.jsx:295`) whose
dependency is `[s]`. `s` does not change on a clock tick.
Observed: an app left open across midnight continues to show the previous day's session
until some state write or a reload occurs. The one interval in the app
(`console-views.jsx:11`, 30 s) only refreshes a `Date` held in local component state for the
header string; it does not touch `derived`. Result: the header clock says 00:05 while the
session below it is yesterday's.

**A14 — Medium. The week/day auto-sync effect has incomplete dependencies.**
`console-store.jsx:122-133`, deps `[s.startDate, s.view]`.
Failing scenario: the user is on the TODAY view and presses `j` (App's global handler,
`console-app.jsx:131`, changes `s.week`).
Observed: `s.week` moves off the program week; the effect does not re-run because neither
dependency changed; TODAY now renders a different week's session under the heading
"today is …", flagged only by the small `[scrubbed — not today]` badge
(`console-views.jsx:39`). Switching to any other view and back silently reverts it.

**A15 — Low. "Monday" weigh-in is a calendar Monday, unrelated to the program week.**
`console-today-extras.jsx:127` — `const isMon = (new Date()).getDay() === 1;`
The program week boundary is `startDate + 7n` (`console-store.jsx:74`), and Setup explicitly
tells the user to pick their first *training* day, not a Monday (`console-shared.jsx:132-133`).
Observed: for a Thursday start, the "MONDAY · LOG WEIGHT" prompt appears mid-week, and
`logWeight(s.week, …)` files the result under whichever week is *selected*, not the week the
measurement belongs to.

### A.3 `setsForWeek` and `parseReps`

**A16 — High. `setsForWeek` returns a 2-set target for exercises with no set count.**
`console-store.jsx:381-382`:
```
const n = parseInt(ex.sets, 10);
return isNaN(n) ? 2 : n;
```
Failing input: `sets: "—"`, which occurs four times in `data.js` — "Light walk" (`data.js:167`),
"Rower intervals" (`data.js:191`), "Stair climber" (`data.js:192`), and "No training"
(`data.js:205`).
Observed: the Full Rest day (day 7) reports `setsTarget = 2` for an exercise called
"No training"; the cardio day demands 2 sets of "Rower intervals". `ComplianceGrid`
(`console-shared.jsx:252-265`) therefore computes `setsTarget = 2` and `setsLogged = 0` for
every rest day of all 24 weeks, so the heatmap renders every rest day as permanently
non-compliant.
Expected: `"—"` means "no set target"; the sentinel must be distinguishable from a parse
failure.

**A17 — Medium. `setsForWeek` ignores the weekly volume ramp for fixed-count exercises.**
`console-store.jsx:376-382`. The `"lo→hi"` branch clamps against `vol.sets`; the plain-integer
branch does not.
Observed: "Face pulls" (`sets: "3"`, `data.js:140`) prescribes 3 sets in week 1, where
`vol.sets = 2` (`data.js:78`) and every ranged exercise correctly drops to 2. Two different
volume policies coexist in one session with no marker distinguishing them.

**A18 — Medium. The deload override silently overwrites user-authored custom exercises.**
`console-store.jsx:374` — `if (vol.deload) return 2;`
`AddCustomExercise` lets the user type any set count (`console-train.jsx:305-306`).
Observed in a deload week (6, 12, 18, 24): a custom exercise created with `sets: "5"` renders
a target of 2, and `ExerciseCard` shows `0/2` regardless of what the user asked for.

**A19 — High. `parseReps` treats durations as repetitions.**
`console-store.jsx:386-392`. The regex `/(\d+)\s*[–-]\s*(\d+)/` and the `parseInt` fallback
are applied to a free-text field that contains durations.
Failing inputs present in `data.js`:
- `"60 s"` (Plank, `data.js:193`) → `{lo: 60, hi: 60}` — a 60-second hold becomes a 60-rep target.
- `"20 min"` (Rower/Stair, `data.js:191-192`) → `{lo: 20, hi: 20}`.
- `"20–30 min"` (Light walk, `data.js:167`) → `{lo: 20, hi: 30}`.
Observed downstream: `suggestedLoad(ex.name, repRange.hi)` (`console-train.jsx:150`) is
called with `currentTopRep = 60` for a plank; `makeCoachLine` (`console-store.jsx:32-34`)
will emit `top of range at X kg × 60 · +2.5 kg next session` for a 60-second plank.
Expected: a typed prescription (`reps` vs `seconds` vs `minutes` vs `amrap`), not a string
parsed by regex.

**A20 — Medium. `"max"` disables load progression rather than triggering AMRAP handling.**
`parseReps("max")` → `null` (`console-store.jsx:391`). `console-train.jsx:150` then passes
`repRange?.hi ?? 99` = 99 to `suggestedLoad`, and `console-store.jsx:251` tests
`m.reps >= 99`.
Observed: for Pull-ups (`data.js:137`) and Push-ups (`data.js:166`), the +2.5 progression can
never fire. There is no error; the feature simply never applies to the two bodyweight lifts
that most need it.

**A21 — Low. Two dash conventions are in play.** `data.js` uses the en dash `–` for rep
ranges (`"6–8"`) while `AddCustomExercise` defaults to the ASCII hyphen (`"8-12"`,
`console-train.jsx:279`). `parseReps` happens to accept both (`console-store.jsx:387`), and
`setsForWeek` requires the arrow `→` (`console-store.jsx:376`). Three separator conventions
across two parsers; none is validated at the data source.

### A.4 `suggestedLoad` and `makeCoachLine`

**A22 — High. `suggestedLoad` uses the two most recent *sets*, not the two most recent
*sessions*.**
`console-store.jsx:240` (comment) — `// Suggested next load: if the last 2 sessions hit the top of the rep range, +2.5 kg.`
`console-store.jsx:251` — `const hitTop = matches.slice(0, 2).every((m) => m.reps >= currentTopRep && m.weight === last.weight);`
`matches` is every set for that exercise name, sorted by timestamp only; there is no grouping
by `(week, day)`.
Failing scenario: within a single session the user logs set 1 at 80 kg × 8 and set 2 at
80 kg × 8, top of an `"6–8"` range. Observed: on the *next set of the same session* the app
suggests 82.5 kg. Expected per the stated rule: a bump only after two separate sessions.

**A23 — High. `suggestedLoad` has no week or session boundary, so scrubbing corrupts the
suggestion.**
`console-store.jsx:243-247` iterates all of `s.sets` and orders by `b.ts - a.ts`. `logSet`
stamps `ts: Date.now()` (`console-store.jsx:157`), which is wall-clock time, whereas the key
`${wk}-${day}-${exIdx}-${setN}` carries program time.
Failing scenario: the user scrubs to week 24 to look ahead, logs a trial set at 40 kg, then
returns to week 5.
Observed: the week-24 set has the newest `ts`, so it becomes `matches[0]`, and the suggestion
for week 5 is `40 kg · match last`. Timestamp order and program order disagree, and nothing
reconciles them.
Note the sibling function `lastLoggedSet` (`console-store.jsx:228-238`) *does* filter by
`(wk, d)` but then still ranks the survivors by `v.ts` (`console-store.jsx:235`) — so the two
functions that feed the same card use two different notions of "last".

**A24 — Medium. Exact float equality gates the progression.**
`console-store.jsx:251` — `m.weight === last.weight`. Any 82.5 vs 82.50000000000001 arising
from a future kg↔lb conversion, or a user entering 80 in one set and 80.0… in another, kills
the rule silently. Compare within a tolerance tied to the plate increment.

**A25 — Medium. `makeCoachLine`'s PR branch compares weight only, ignoring reps and unit.**
`console-store.jsx:14` — `if (lastBest && weight > lastBest.weight) return \`weight PR · prev best ${lastBest.weight} kg\`;`
`lastBest` is computed in `console-train.jsx:181-190` over all sets for the name.
Observed: a single-rep grinder at 85 kg is announced as a PR over a clean 5×80 kg. That is
defensible for a "weight PR", but the same `lastBest` object is then also used for the
`e1RM`/PR messages in `buildTelemetryMsg` (`console-fun.jsx:133-135,157-159`) where the
comparison is presented as an overall record. Two different record definitions, one label.

**A26 — High. Custom-exercise indices `1000 + i` are positional, so deleting one
re-attributes another's logged sets.**
`console-train.jsx:391` — `const exIdx = 1000 + i;`
`console-store.jsx:274-278` — `removeCustomExercise` filters the array by index:
`[key]: cur.filter((_, i) => i !== customIdx)`.
Failing scenario: on week 3 day 1 the user adds "Cable crunch" (index 0 → exIdx 1000) and
"Face pull" (index 1 → exIdx 1001), logs sets under both, then removes "Cable crunch".
Observed: "Face pull" shifts to array index 0, so it now renders as exIdx **1000** and
displays the sets logged for the *deleted* "Cable crunch"; its own sets, keyed `…-1001-n`,
become orphaned rows that no view can reach and no code ever cleans up. This is silent data
corruption plus unbounded storage growth.
Expected: a stable generated id per custom exercise, never a positional index.

**A27 — Medium. Custom exercises are logged but never counted.**
`derived.exCount`/`setsTarget` (`console-store.jsx:299-313`), `ComplianceGrid`
(`console-shared.jsx:253-263`) and the streak scan (`console-store.jsx:339`) all iterate
`day.exercises` only.
Observed: a session consisting entirely of custom exercises shows `0/0` progress, contributes
nothing to the heatmap, and does not extend the streak — while its sets are stored and do
increment `totalSetsLogged` (`console-store.jsx:160`). The two counters disagree by
construction.

**A28 — High. Derived context is frozen into every persisted set.**
`console-store.jsx:157` — `sets: { ...p.sets, [k]: { ...payload, ts: Date.now() } }`, where
`payload` is `logPayload(p)` from `console-train.jsx:175-191`: `{ weight, reps, exName,
repsLo, repsHi, suggested, lastBest }`.
Observed: each stored set carries the exercise name, both rep-range bounds, the *suggestion
object* and the *lifetime-best object* as they stood at log time. These are recomputable and
go stale immediately. At ~2,400 sets over 24 weeks this is roughly a 5× multiplier on the
largest table in the store, against a ~5 MB localStorage quota that fails silently (A31).
Expected: persist `{ exerciseId, loadKg, reps, ts }`; derive the rest.

### A.5 `RestTimer`

`console-train.jsx:7-78`.

**A29 — High. The chime's `AudioContext` is constructed inside a timer callback, so it is
never unlocked.**
`console-train.jsx:28` — `const ctx = new AC();` inside the `setInterval` handler at
`console-train.jsx:17-42`.
An `AudioContext` created outside a user-gesture task starts in the `suspended` state, and the
code never calls `ctx.resume()`. Observed on Safari/iOS and on Chrome without a prior gesture
on the page: the oscillator is scheduled and `ctx.close()` runs 600 ms later
(`console-train.jsx:38`) without a sound ever being produced. The user gets no rest cue at
all. Expected: create and `resume()` one long-lived context inside the START button's click
handler, keep it, and schedule the tone on it.

**A30 — High. The haptic fallback does not exist on the target platform.**
`console-train.jsx:24` — `if (navigator.vibrate) navigator.vibrate([180, 80, 180]);`
`navigator.vibrate` is not implemented in Safari on iOS or iPadOS (recorded independently in
this project's own `REFERENCES.md`). Combined with A29, on an iPhone the rest timer's
completion signal is silent, haptic-free, and visual-only — on a screen that is off, in a
pocket, between sets.

**A31 — High. The timer is frozen while the tab is backgrounded and fires late on return.**
The elapsed value itself is computed from wall-clock (`console-train.jsx:18`,
`Math.floor((Date.now() - startedAt.current) / 1000)`), which correctly avoids accumulator
drift. But the **chime test** lives inside the same callback (`console-train.jsx:21`), and
background tabs are throttled to ≥1 s and, on iOS, suspended outright.
Observed: lock the phone at t=30 s of a 90 s rest, unlock at t=150 s. The interval fires for
the first time on resume, `e = 150 >= 90`, and the chime plays 60 s late — announcing a rest
period that ended a minute ago. Expected: a scheduled notification or alarm, not a foreground
interval.

**A32 — High. The timer is component-local and is destroyed by any navigation.**
`RestTimer` is rendered inside `TrainView` (`console-train.jsx:371`), and `App` swaps views by
conditional render (`console-app.jsx:168-174`), which unmounts it.
Observed: pressing `1` to check Today mid-rest, or tapping the hydration cups, discards
`running`, `elapsed` and `startedAt` with no warning. Returning to TRAIN shows `START` at
0:00. There is exactly one timer for the whole session, it is not tied to a set, and its state
is not persisted.

**A33 — Medium. Overtime is unbounded and the display flips format.**
`console-train.jsx:50,64` — once `elapsed > target` the ring is pinned at `pct = 1`
(`console-train.jsx:51`) and the label switches to `+Ns`. A timer left running overnight
displays `+43200s`. There is no auto-stop and no upper bound.

### A.6 Hydration and streak

**A34 — Medium. The hydration target is a fixed 7 cups of 500 mL with the volume implied
only in a label.**
`console-store.jsx:95` — `waterTarget: 7,          // 500 ml × 7 = 3.5 L`
The 500 mL figure exists nowhere in code: it appears in a heading string
(`console-views.jsx:194`, `3.5 L · 7×500ml`) and a tooltip (`console-views.jsx:203`). The
stored quantity is a dimensionless cup count. Nothing scales it to body mass, training load,
or climate, and there is no UI to change `waterTarget` — it is read at `console-views.jsx:196`
and `:199` and never written.
Consequence for the rewrite: intake must be stored as a volume in mL, with the cup size a
display concern.

**A35 — Critical (compounding A8). The hydration day boundary is UTC.**
`console-store.jsx:262` — `water: { ...p.water, [todayISO()]: n }` and
`console-store.jsx:354` — `const water = s.water[todayISO()] || 0;`
Observed in Europe/Athens: cups tapped at 01:00 local are credited to the previous calendar
day, and the grid visibly resets at 03:00 rather than midnight. The same applies to the daily
note (`console-store.jsx:263`) and the meal tracker (`console-today-extras.jsx:10`,
`const today = todayISO();`).

**A36 — Medium. The cup control cannot express a partial or non-monotonic day.**
`console-views.jsx:202` — `onClick={() => setWaterToday(i + 1 === water ? i : i + 1)}`
Tapping cup *i* sets the count to `i+1`, so the state is always a prefix. That is a reasonable
simplification, but combined with a single integer per day it makes it impossible to record
timing — which is exactly what a hydration *cue* (the new requirement) needs.

**A37 — High. The streak reads 0 for the whole of every day until the first set is logged.**
`console-store.jsx:329-350`. The loop starts at `back = 0`, i.e. **today**, and breaks on the
first non-compliant day (`console-store.jsx:349`, `else break;`).
Failing scenario: 20 consecutive compliant days, and it is now 07:00 on day 21.
Observed: today has no logged set and is not a rest day, so `any` is false at `back = 0`, the
loop breaks immediately, and the TopBar (`console-shared.jsx:35`) and Today card
(`console-views.jsx:129`) both display `0`. The streak the user is protecting is invisible at
exactly the moment it would motivate them.
Expected: evaluate the streak up to *yesterday*, and show today separately as "at risk".

**A38 — Medium. Rest days are counted as compliant on weak and inconsistent grounds.**
`console-store.jsx:347` — `if (dayDef.kind === "rest" && (s.pushupLog[wk] != null || dy === 7)) any = true;`
Day 7 is unconditionally compliant. Day 4 is compliant if a push-up value exists **anywhere
in that week** — and `pushupLog` is keyed by week, not day (`console-store.jsx:93`), so one
push-up entry on Monday marks the whole week's rest days compliant. Day 6 (`kind: "cardio"`,
`data.js:188`) gets no such exemption and requires logged sets that, per A16 and A44, cannot
be logged.

**A39 — Medium. The streak window is capped at 30 days with no indication.**
`console-store.jsx:331` — `for (let back = 0; back < 30; back++)`. A 60-day streak displays
as 30 and then stops growing. In a 168-day program that ceiling is reached before the halfway
point.

**A40 — Low. `s.streak` is dead state.** `defaultState()` declares
`streak: { last: null, count: 0 }` (`console-store.jsx:99`); grep finds no reader or writer.
The live value is the derived `streakCount`.

### A.7 State container and persistence

**A41 — Critical. Every state change writes the entire store to localStorage synchronously.**
`console-store.jsx:118` — `useEffect(() => { saveV2(s); }, [s]);`
Every write goes through `update` → `setS` → new object identity → effect → `JSON.stringify`
of the whole state → `localStorage.setItem`.
Failing scenario: typing in the daily note (`console-views.jsx:221`,
`onChange={(e) => setNoteToday(e.target.value)}`) or a meal-swap field
(`console-views.jsx:359`).
Observed: one full serialise-and-write **per keystroke**, on the main thread, against a store
that (per A28) carries ~7 fields per set across up to ~2,400 sets. The same effect also
recomputes the entire `derived` memo (`console-store.jsx:290-357`, dependency `[s]`), which
re-runs the 30-day streak scan and the whole-log plateau scan on every character typed.

**A42 — Critical. A quota failure is swallowed and the user is told nothing.**
`console-store.jsx:50` — `try { localStorage.setItem(STORE_KEY_V2, JSON.stringify(s)); } catch (e) {}`
Observed once the store exceeds the ~5 MB origin quota (reachable given A28 and A26's orphan
accumulation): every subsequent write throws `QuotaExceededError`, is discarded, and the app
continues rendering from in-memory state that looks perfectly healthy. The loss becomes
visible only on the next reload, when an arbitrary amount of recent work is gone.

**A43 — Critical. Import races the persistence effect and can be overwritten before the
reload lands.**
`console-views.jsx:611-616`:
```
const fresh = { ...defaultState(), ...parsed, bootSeen: true };
localStorage.setItem("fti.console.v2", JSON.stringify(fresh));
setImportStatus({ ok: true, msg: "imported · reloading…" });
setTimeout(() => location.reload(), 800);
```
This writes localStorage directly, behind the store's back, and then waits 800 ms.
Failing scenario: any `setS` during that window re-fires `console-store.jsx:118` and
overwrites the imported snapshot with the *pre-import* in-memory state. Reachable triggers in
that window include the toast auto-dismiss timers (`console-app.jsx:151-153` driven by
`TelemetryToast`'s 4.5 s timeout, `UndoToast`'s 6 s, `SpecimenDrop`'s 12 s — any of which may
land mid-window if fired just before the click), the SW update toast
(`console-app.jsx:100`), and the auto-sync effect (`console-store.jsx:129`).
Observed on collision: the reload restores the old data and reports `✓ imported`. Expected:
tear down the store, or write through the store, or reload immediately.

**A44 — Critical. One-tap irreversible wipe with no confirmation, on every screen.**
`console-app.jsx:179` —
`<button onClick={() => { localStorage.removeItem("fti.console.v2"); location.reload(); }}>`
labelled `$ rm -rf logs/` (`console-app.jsx:180`), rendered in the footer of every view
(`console-app.jsx:176-183`). The *other* reset path (`console-store.jsx:281`) does prompt.
Observed: a single mis-tap at the bottom of a scrolling mobile page destroys all data with no
prompt and no undo.

**A45 — Medium. `defaultState()` is not the state shape.**
`console-store.jsx:80-111` omits four fields the app actually writes: `customEx`
(`console-store.jsx:272`), `mealsByDay` (`console-today-extras.jsx:22`), `skipped`
(`console-today-extras.jsx:207`) and `lastDeletedSet` (`console-store.jsx:210`).
Consequence: the import merge at `console-views.jsx:613` cannot supply defaults for them, so
every consumer must defend individually (`(p.customEx || {})`, `(s.mealsByDay && …)`), and a
single missed guard is a crash. The declared shape and the real shape have diverged.

**A46 — Medium. `logSet` computes `wasNew` from the render closure, not the updater
argument.**
`console-store.jsx:155` — `const wasNew = !s.sets[k];` — while the mutation itself runs inside
`update((p) => …)` at `console-store.jsx:156`.
Failing scenario: two `logSet` calls in the same React batch (a fast double-tap on LOG, or
Enter plus a click).
Observed: both calls read the same stale `s`, both see `wasNew === true`, and the side-effect
block (`console-store.jsx:159-195`) runs twice for one set — double-incrementing
`totalSetsLogged`, rolling the specimen RNG twice, and potentially stepping *over* a
milestone value so that `[50,100,250,500,1000].includes(newCount)` (`console-store.jsx:193`)
never matches and that milestone is lost permanently. `clearSet` has the same defect at
`console-store.jsx:202`.

**A47 — Medium. `totalSetsLogged` only ever increases.**
`clearSet` (`console-store.jsx:200-213`) removes the set but does not decrement the counter.
Observed: log → delete → log inflates the count; the milestone toasts therefore fire against a
number that does not match the `Object.keys(s.sets).length` shown in the export
(`console-views.jsx:690`).

**A48 — Medium. The whole app re-renders on every write.**
A single `useState` object (`console-store.jsx:114`) is passed as one `store` prop into every
view. There is no memoisation of `store`, so `TopBar`, `Nav`, the active view and every
descendant re-render on each keystroke. `ComplianceGrid` compounds this: it builds a
168-element array and then calls `cells.find(...)` inside a nested render loop
(`console-shared.jsx:278`), i.e. ~14,000 comparisons per render while LOG is open.
`console-shared.jsx:259` — `if (s.completed[\`${wk}-${dy}-${ei}\`]) setsLogged += 0;` — is a
no-op left in the loop.

**A49 — Low. Tweaks never persist, and the store's own tweak plumbing is dead.**
`console-app.jsx:15` — `const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);` and
`tweaks-panel.jsx:167-175`, whose `setTweak` calls `window.parent.postMessage(…, '*')` and
writes nothing to localStorage. `useTweaks` is a design-canvas host protocol; in the deployed
PWA `window.parent === window`, so the message goes nowhere useful.
Observed: every appearance change resets on reload. Meanwhile `defaultState().tweaks`
(`console-store.jsx:109`) and the store's `setTweak` (`console-store.jsx:144`) exist, are
exported (`console-store.jsx:361`), and have no reader — grep finds no use of `s.tweaks`.

### A.8 Globals, load order and the build

**A50 — Critical (latent). The app functions only because Babel's default preset-env target
downlevels every top-level `const` to a global `var`.**
`index.html:1498` loads `@babel/standalone@7.29.0`. Its script-tag runner injects each
transformed file as a **classic** `<script>` appended to `<head>` — verified in the minified
source (`SEe`: `r.text = …; xEe.appendChild(r)`) — so all eight `.jsx` files share one global
scope. The same function supplies default presets `["react", "env"]` with
`targets: {browsers: undefined}`; with no targets, `preset-env` compiles to ES5, so
`const`/`let` become `var` and redeclaration is legal.
Eight files open with a top-level `const { useState, … } = React;` (`console-store.jsx:4`,
`console-shared.jsx:3`, `console-train.jsx:4`, `console-video.jsx:16`,
`console-today-extras.jsx:4`, `console-views.jsx:3`, `console-fun.jsx:4`, `console-app.jsx:3`,
plus `core.jsx:4`).
Observed if that downlevelling ever stops — a `data-targets` attribute, a Babel upgrade, or
the planned move to a real bundler with modern output: the second file to load throws
`SyntaxError: Identifier 'useState' has already been declared`, that script never executes,
and every file after it fails on `ReferenceError`. The page renders black. This is the
mechanism behind the "black screen after deploy" history recorded in `DEPLOY.md`.
Note also that `PROJECT_SUMMARY.md:125` asserts "**Critical: Babel scripts do NOT share
scope.**" That statement is false, and A51 is its direct consequence.

**A51 — Medium. A live global-name collision on `STORE_KEY`.**
`core.jsx:6` — `const STORE_KEY = "fti.plan.v1";`
`console-video.jsx:30` — `const STORE_KEY = "fti.video.instance";`
Both are top-level in the shared global scope (A50); `console-video.jsx` loads after
`core.jsx` (`index.html:1502` then `:1506`), so the video key wins.
Observed: `core.jsx`'s `loadStore()`/`saveStore()` (`core.jsx:8-17`) would read and write the
*video instance* key. Currently latent only because `usePlanState` has no caller in the
console app — `core.jsx` is loaded for `WeightChart` and `PushupSpark` alone. It is a live
bug the moment anything calls `loadStore()`.

**A52 — High. A conditionally-called React hook.**
`console-app.jsx:116` — `if (window.useKonamiCode) window.useKonamiCode(() => setKonami(true));`
`useKonamiCode` calls `useRef` and `useEffect` (`console-fun.jsx:388-389`). This is a direct
Rules-of-Hooks violation: the hook count depends on a runtime condition. It survives only
because `console-fun.jsx` always loads before `console-app.jsx` and the condition is
therefore constant for the page's lifetime. A slow or failed fetch of `console-fun.jsx`
changes the hook order between mounts.
The same pattern at `console-app.jsx:40-41` calls `useVideoModal`/`useFormCuesModal` through
`(window.X || fallback)()` — the fallback returns a plain object and calls no hooks at all,
so a failed load changes the hook count.

**A53 — Medium. The modal-handle effect re-runs on every render and briefly nulls the
handles.**
`console-app.jsx:42-46`, deps `[videoModal, formCuesModal]`. Both hooks return a fresh object
literal on every render (`console-fun.jsx:68`, `console-video.jsx:159`), so the dependency
array never compares equal.
Observed: on every render the cleanup sets `window.__videoModal = null` and the effect
immediately re-sets it. `ExerciseCard` reads the handle during *render*
(`console-train.jsx:154`, `const videoModal = window.__videoModal;`), so on the first paint —
before the effect has ever run — it is `null` and the video button is inert until something
forces a second render.

**A54 — High. Two keydown listeners bind the same keys.**
`console-app.jsx:131-132` (global): `if (e.key === "j") setWeek(Math.min(24, s.week + 1));`
`console-train.jsx:332-339` (TRAIN): `if (e.key === "j" || e.key === "ArrowDown") … setOpenIdx(…)`
Both are attached to `window` and neither stops propagation. The App handler skips only when
the target is an `INPUT`/`TEXTAREA` (`console-app.jsx:122,126`); the TrainView handler skips
`INPUT`/`BUTTON` (`console-train.jsx:330`).
Observed: pressing `j` on the TRAIN view with a non-input focused opens the next exercise
**and** advances the program week by one. The user navigating exercises with the keyboard
silently walks the week counter forward.

**A55 — Medium. Cross-file exports are incomplete; the app relies on implicit function
globals.**
`console-fun.jsx:521` exports only `{ ErrorBoundary, PWAUpdateToast, UndoToast }`. Yet
`console-store.jsx:178` calls `window.buildTelemetryMsg`, `console-app.jsx:116` calls
`window.useKonamiCode`, `console-app.jsx:41` calls `window.useFormCuesModal`, and
`console-views.jsx:229` reads `window.TimeCapsule` — none of which appear in any
`Object.assign`. They resolve only because top-level `function` declarations in a classic
script land on `window` (A50). Every one of these becomes `undefined` under module semantics,
and each is *guarded*, so the failure mode is silent feature loss rather than a visible error.

**A56 — Medium. Production ships React development builds and an in-browser compiler.**
`index.html:1496-1498` load `react.development.js`, `react-dom.development.js` and
`@babel/standalone` (~3.0 MB uncompressed for Babel alone), and `sw.js:26-28` caches all
three. Every page load parses and compiles nine `.jsx` files in the browser. Babel's own
documentation is explicit that `@babel/standalone` is not for production.

### A.9 Specimen drops, milestones, phase transitions

**A57 — Medium. The drop RNG runs inside a state updater.**
`console-store.jsx:185` — `if (Math.random() < 0.15 && window.drawSpecimen) {` inside
`update((p) => …)`. React may invoke an updater more than once for a single dispatch (it does
so under `StrictMode`, which this app does not enable — hence "medium", not "high"). A
non-idempotent updater is nevertheless a defect: the same dispatch can yield different state.
Move the roll outside the updater and pass the result in.

**A58 — Medium. Drop rarity flattens as the collection fills, and the collection completes
early.**
`console-content.js:702-711` draws without replacement from unowned cards, weighting
common:uncommon:rare as 6:3:1. Card counts are 15 common, 15 uncommon, 12 rare (42 total).
At 15% per qualifying set and roughly 60–100 qualifying sets per week, the pool is exhausted
within about the first month, after which every remaining set produces nothing and the whole
mechanic goes dead for 20 weeks. The "rare" tier is a 12-of-42 slice, so it is not rare.

**A59 — Medium. An undismissed drop is silently replaced.**
`console-store.jsx:189` — `next.lastDrop = { card, ts: Date.now() };` overwrites any pending
`lastDrop`. `SpecimenDrop` auto-dismisses after 12 s (`console-fun.jsx:77`); a second drop
inside that window replaces the first card, which the user never sees. The card is still
credited to `specimens`, so the collection grows without the reveal that justifies it.

**A60 — High. Bodyweight and timed work cannot be logged as a real set at all.**
`console-store.jsx:159` — `if (wasNew && payload.weight && payload.reps && payload.exName) {`
and `console-store.jsx:12` — `if (!weight || !reps) return null;`
`0` is falsy. `SetRow.submit` (`console-train.jsx:93-95`) accepts `weight = 0` and stores it,
but every downstream consumer then treats the set as not-real.
Failing input: Pull-ups (`data.js:137`), Push-ups (`data.js:166`), Plank (`data.js:193`) —
logged at 0 kg.
Observed: no coach line, no telemetry toast, no specimen roll, and `totalSetsLogged` is not
incremented, so bodyweight sets never count toward any milestone. The set row does render as
`✓ logged`, so the user has no signal that it was treated differently.
Expected: an explicit `bodyweight` flag, or `loadKg === null` distinguished from `0`.

**A61 — High. The phase-transition cutscene is keyed to the *selected* week and can be
permanently consumed by scrubbing.**
`console-app.jsx:56` — `const cur = derived.phase.n;`, where `derived.phase` comes from
`s.week` (`console-store.jsx:291`), the scrub position — not from `pos.week`, the program
position.
`console-app.jsx:82` — `update({ lastPhaseSeen: derived.phase.n });` on close.
Failing scenario: in week 2, the user drags the PLAN week scrubber (`console-views.jsx:271`)
to week 20 to look ahead.
Observed: the full-screen Phase 1 → Phase 3 cutscene fires immediately, reporting the stats
of a phase not yet trained; closing it sets `lastPhaseSeen = 3`; the condition
`cur > seen` (`console-app.jsx:58`) can then never be true again, so the real transitions at
weeks 9 and 17 never play. A single scrub disables the feature for the rest of the program.
The phase-strip buttons at `console-views.jsx:259` (`onClick={() => setWeek(p.weeks[0])}`)
make this a one-tap path.

### A.10 `SkipSession` and `completed` semantics

**A62 — High. `SkipSession` writes to a key nothing reads.**
`console-today-extras.jsx:207` —
`update((p) => ({ ...p, skipped: { ...(p.skipped || {}), [\`${s.week}-${s.day}\`]: true } }));`
Grep confirms no reader of `s.skipped` anywhere in the codebase.
Observed: the button reports nothing, changes no visible state, does not exempt the day from
the streak (`console-store.jsx:339-349` does not consult `skipped`), does not mark the
compliance heatmap, and cannot be undone. It also disappears the moment anything is logged
(`console-today-extras.jsx:203`), so a partially-completed session can never be marked
skipped.

**A63 — High. "Done" has three incompatible definitions.**
1. `completed[wk-day-exIdx]` — a manual boolean toggle (`console-store.jsx:222-225`).
2. `setsLogged >= target` — derived from set rows (`console-train.jsx:172`).
3. `intensity = setsLogged / setsTarget` — the heatmap's own measure
   (`console-shared.jsx:265-267`).
`derived.exDone` (`console-store.jsx:300-303`) counts **only** definition 1.
Observed: a user who logs every set of every exercise and never touches "mark exercise
complete" sees the Today session card report `0/5 exercises` (`console-views.jsx:104`) beside
`20/20 sets`, and never gets the `✓ ALL DONE` badge (`console-views.jsx:105`), which tests
`derived.exDone === derived.exCount`. The ExerciseCard, meanwhile, shows the card as complete
(`console-train.jsx:194`, `allDone || exDone`). Three views, three answers.

**A64 — Medium. `pushupLog[wk]` carries two contradictory meanings.**
Declared as `wk -> max` (`console-store.jsx:93`); labelled "max unbroken" in the export
(`console-views.jsx:653`) and "last logged max" in the card
(`console-today-extras.jsx:175`). But `PushupTodayCard` treats the same field as a running
daily tally: `logPushups(s.week, cur + 1)` and `cur + 5`
(`console-today-extras.jsx:184-185`), while `PushupQuickLog` overwrites it with an absolute
max (`console-train.jsx:432`).
Observed: tapping `+1` ten times on Tuesday, then entering a true max of 22 on Wednesday,
destroys Tuesday's tally; and the streak's rest-day exemption (`console-store.jsx:347`) keys
off whichever meaning happened to be written last.

### A.11 Service worker, manifest, miscellany

**A65 — High. The update toast is unreachable by design because the worker skips waiting at
install.**
`sw.js:36` — `.then(() => self.skipWaiting())` inside the `install` handler.
`console-app.jsx:93` — `if (reg.waiting && reg.active) { waitingWorker = reg.waiting; setPwaUpdate(true); }`
A worker that calls `skipWaiting()` during install does not sit in the `waiting` state, so the
primary detection branch is dead. The secondary `statechange` branch (`console-app.jsx:97-102`)
may still catch `installed`, but by then `__pwaReload`'s `postMessage({type:"SKIP_WAITING"})`
(`console-app.jsx:109`) is a no-op against a worker that already activated. Meanwhile
`activate` deletes the old cache and claims clients (`sw.js:46-52`) while the page keeps
running the old code. The result is a version-skew window with an unreliable prompt.

**A66 — Medium. The install step swallows 404s, so a partial deploy caches silently.**
`sw.js:35` — `Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))`
A missing or mistyped file installs "successfully" with a hole in the shell. The fetch handler
is cache-first (`sw.js:71`, `return cached || network;`), so a stale copy of a `.jsx` file is
served indefinitely until `CACHE_NAME` is bumped by hand (`sw.js:5`).

**A67 — Low. `manifest.json` and the CSS disagree on the theme colour.** `theme_color`
`#00ff88` (`manifest.json`) and `index.html:7` versus `--accent: #a3e635`
(`index.html:30`) and `TWEAK_DEFAULTS.accent: "#f472b6"` (`console-app.jsx:6`). Three accents.

**A68 — Low. The boot sequence hard-codes one subject's anthropometry.**
`console-shared.jsx:78-93` prints `mass 95.3 kg / 210 lb`, `bf% 27.0 %`, `lean 69.6 kg`,
`target 79.0 kg / 12 % bf`. For a multi-user build this is the first screen a new user sees.

**A69 — Low. The export snapshot includes transient UI state.** `dlJson`
(`console-views.jsx:709`) serialises the whole of `s`, including `lastDrop`, `lastTelemetry`,
`lastMilestone` and `lastDeletedSet`. Re-importing replays a stale toast on first render.

**A70 — Low. String/number comparison in the export.**
`console-views.jsx:648` — `${delta > 0 ? "+" : ""}` where `delta` is the *string* returned by
`toFixed(1)` (`console-views.jsx:647`). It works by coercion; it is not a correctness bug, but
it will not survive a TypeScript port unchanged.

**A71 — Low. The video modal only persists a working instance if the user clicks the
external link.** `markInstanceWorking` (`console-video.jsx:63-65`) is wired solely to the
"open in new tab" anchor's `onClick` (`console-video.jsx:129`). A user for whom the embedded
iframe works perfectly and who never leaves the app re-tries instance 1 every time.

**A72 — Low. Nav/hotkey documentation drift.** `VIEWS` has seven entries
(`console-shared.jsx:46-54`) and the help panel says `1-7` (`console-app.jsx:250`), while
`DEPLOY.md` documents Export as item 6.

**Count: 72 findings — 11 Critical, 22 High, 28 Medium, 11 Low.**

---

## B. What is worth porting

Verdicts: **Port-as-is** (logic is correct and unit-agnostic), **Port-with-fix** (the shape is
right, a named defect must be repaired), **Rewrite** (the requirement has changed or the
approach is wrong), **Drop** (no place in the new build).

| File / module | Verdict | Reason |
| --- | --- | --- |
| **`index.html`** — app shell, ~1,200 lines of CSS | Rewrite | CDN script tags and in-browser Babel are replaced by Vite; the CSS is worth salvaging as a token file, the document is not. |
| `index.html` `:root` design tokens (`:26-…`) | Port-with-fix | Good token set; three conflicting accent definitions must be reconciled (A67). |
| `index.html` SW registration (`:14-21`) | Rewrite | `vite-plugin-pwa` owns registration and update flow (A65). |
| **`manifest.json`** | Port-with-fix | Structurally correct; `name`/`theme_color` need to stop referencing one subject's build (A67). |
| **`sw.js`** | Drop | Hand-rolled cache-first shell with silent 404 swallowing and a broken update handshake (A65, A66). Workbox replaces it, and Web Push needs a worker this file cannot become. |
| **`data.js`** `PLAN` | Rewrite | Single-subject plan with untyped string prescriptions (`"2→4"`, `"60 s"`, `"—"`) and lb-only projections (A16, A19, A3). Needs a typed, per-user plan schema. |
| `data.js` exercise catalogue (names, notes, `video` query strings) | Port-as-is | The search-query-instead-of-video-ID decision is sound and avoids dead links; the content is reusable as an exercise library. |
| **`console-content.js`** `FORM_CUES` (24 exercises) | Port-as-is | Pure content, keyed by exercise name; needs only a stable id instead of a display-name key. |
| `console-content.js` `SPECIMEN_CARDS` (42 cards) | Port-as-is | Pure content with sources. Content is fine; the drop mechanic that consumes it is not (A58). |
| `console-content.js` `drawSpecimen` | Rewrite | Draw-without-replacement exhausts the pool in ~4 weeks and inverts the rarity intent (A58). |
| **`core.jsx`** `loadStore`/`saveStore`/`usePlanState` | Drop | Dead in the console app, and its `STORE_KEY` collides with the video modal's (A51). |
| `core.jsx` `phaseOf`, `dayProgress` | Drop | Duplicated inside `usePlanStore`'s `derived` (`console-store.jsx:291,299-303`). |
| `core.jsx` `WeightChart` | Port-with-fix | Clean SVG projection-vs-measured chart; the fixed 180–212 lb axis and hard-coded milestones must become props (A4). |
| `core.jsx` `PushupSpark` | Port-with-fix | Same pattern, same fix: derive the domain from the data. |
| `core.jsx` `WeekSlider`, `DayTabs`, `Checklist` | Drop | Prototype-era render-prop helpers with no call site in the console app. |
| **`console-store.jsx`** `usePlanStore` | Rewrite | One monolithic `useState` + write-on-every-change (A41, A42, A48) and a state shape that cannot express the new requirements (see §C). |
| `console-store.jsx` `todayISO`, `isoDaysBetween`, `isoOffset` | Rewrite | All three mix UTC and local (A8, A9, A10). Replace with a date library or explicit IANA-zone helpers. |
| `console-store.jsx` `programPosition` | Rewrite | Calendar-derived by construction; the new plan cursor must be decoupled from the date (A11, A12). |
| `console-store.jsx` `setsForWeek` | Port-with-fix | The volume-ramp clamp is the right idea; the `"—"` sentinel and the fixed-count bypass must be handled explicitly (A16, A17). |
| `console-store.jsx` `parseReps` | Drop | Regex over a free-text field that also holds durations (A19). Replace with a typed prescription. |
| `console-store.jsx` `suggestedLoad` | Rewrite | Two-most-recent-*sets* rather than sessions, no program-order filter, exact float equality (A22, A23, A24). |
| `console-store.jsx` `makeCoachLine` | Port-with-fix | The priority ladder (PR → vs suggested → vs range) is sound; every threshold and label must become unit-aware (A5). |
| `console-store.jsx` `lastLoggedSet` | Port-with-fix | Correct `(week, day)` filter, wrong tiebreak — ranks by `ts` instead of program order (A23). |
| `console-store.jsx` `logSet` | Rewrite | Stale-closure `wasNew`, RNG and toast side effects inside a state updater, and derived context frozen into storage (A46, A57, A28). |
| `console-store.jsx` `clearSet`/`undoDeleteSet`/`clearUndo` | Port-with-fix | The 6-second undo is worth keeping; move `wasThere` inside the updater (A46) and decrement the counter (A47). |
| `console-store.jsx` derived streak scan | Rewrite | Reads 0 for most of every day, caps at 30, and treats rest days inconsistently (A37, A38, A39). |
| `console-store.jsx` derived plateau rule | Port-with-fix | Three points spanning ≥2 weeks within a tolerance is a reasonable rule; the tolerance must be stored in kg (A1). |
| `console-store.jsx` `COMPOUND_LIFTS` | Port-with-fix | Correct concept, but it is a `Set` of display strings — key it on exercise id. |
| **`console-shared.jsx`** `CRT` | Port-as-is | Trivial class-name wrapper; no logic. |
| `console-shared.jsx` `TopBar` | Port-with-fix | Presentation is fine; `D n/168` must come from the plan cursor, not the calendar (A11). |
| `console-shared.jsx` `Nav`, `VIEWS` | Port-with-fix | Clean; the view list changes with the new feature set. |
| `console-shared.jsx` `Boot` | Rewrite | Hard-codes one subject's body composition (A68). Keep the effect, change the content. |
| `console-shared.jsx` `Setup` | Rewrite | Collects one field (start date). The new build needs a full profile: body data, goals, training days and times, unit system (§C). |
| `console-shared.jsx` `Spotlight` | Port-as-is | Self-contained, correct, and genuinely useful; the item list is rebuilt from the new plan schema. |
| `console-shared.jsx` `AsciiBar` | Port-as-is | Pure, clamped, no state. |
| `console-shared.jsx` `ComplianceGrid` | Rewrite | O(n²) `find` inside the render loop, a no-op statement, and it marks every rest day non-compliant (A48, A16). The visual is worth keeping. |
| `console-shared.jsx` `VyvanseCurve` | Drop | Subject-specific pharmacokinetics hard-coded to one dose at one time; out of scope for a generic multi-user app. |
| **`console-train.jsx`** `RestTimer` | Rewrite | Explicitly in scope for a rethink; audio never unlocks, vibrate is unsupported on iOS, state dies on navigation, background-frozen (A29–A33). |
| `console-train.jsx` `SetRow` | Port-with-fix | Good keyboard flow (Enter advances, then submits, then blurs). Needs a unit-tagged input and a bodyweight affordance (A60). |
| `console-train.jsx` `ExerciseCard` | Port-with-fix | Sound structure; `lastBest` must move out of the render body into a selector, and `window.__videoModal` must become a context (A53). |
| `console-train.jsx` `AddCustomExercise` | Port-with-fix | Useful feature, fatally indexed — needs stable ids (A26). |
| `console-train.jsx` `TrainView` | Port-with-fix | Layout is right; the `j`/`k` handler must stop colliding with the global one (A54). |
| `console-train.jsx` `PushupQuickLog` | Port-with-fix | Fine as a numeric entry; the field's meaning must be settled first (A64). |
| **`console-video.jsx`** `VideoModal` + instance rotation | Port-with-fix | The search-query + rotating-instance design is a defensible answer to a real fragility; persist the working instance on successful load, not only on outbound click (A71). |
| `console-video.jsx` `useVideoModal` | Port-with-fix | Correct hook shape; must be provided by context rather than a `window` handle (A53). |
| **`console-today-extras.jsx`** `MealTracker` | Port-with-fix | Per-day meal state with skip/swap is the right model; the day key must be local, not UTC (A35). |
| `console-today-extras.jsx` `QuickWeightLog` | Rewrite | Silent rejection of kg input, lb-only field name, calendar-Monday trigger (A2, A15). |
| `console-today-extras.jsx` `PushupTodayCard` | Rewrite | Increments a field documented as a weekly maximum (A64); renders one DOM node per target rep. |
| `console-today-extras.jsx` `SkipSession` | Rewrite | Writes to a key nothing reads (A62). The new calendar's pause/skip is the replacement. |
| **`console-views.jsx`** `TodayView` | Port-with-fix | Best-composed view in the app; the hero must state the *scrubbed* day honestly, and every hard-coded lb figure must go (A3, A14). |
| `console-views.jsx` `PlanView` | Port-as-is | Straightforward render of plan data; phase buttons should not silently arm the cutscene bug (A61 lives in `console-app.jsx`, not here). |
| `console-views.jsx` `LogView` | Port-with-fix | Good composition of chart + spark + heatmap + PRs; inherits the unit fixes. |
| `console-views.jsx` `PRList` | Port-with-fix | Correct max-by-(weight, reps) reduction; label the unit from the profile. |
| `console-views.jsx` `ProtocolsView` | Port-as-is | Pure content render with an active-state highlight. |
| `console-views.jsx` `FallbackTrigger` | Port-as-is | Small, self-contained decision aid with no persistence and no unit exposure. |
| `console-views.jsx` `ExportView` (export half) | Port-with-fix | The plain-text summary is genuinely useful; it must record the unit system and stop hard-coding 210 lb (A3, A6). |
| `console-views.jsx` `ExportView` (import half) | Rewrite | Writes localStorage behind the store's back and races the persistence effect (A43). Needs schema versioning and a migration path. |
| **`console-fun.jsx`** `FormCuesModal` + `useFormCuesModal` | Port-as-is | Clean modal with Escape handling and scroll locking; only the `window` handle changes. |
| `console-fun.jsx` `SpecimenDrop`, `MilestoneToast`, `TelemetryToast`, `UndoToast` | Port-with-fix | Presentational and correct; they need a real toast queue instead of four independent `lastX` slots that overwrite each other (A59). |
| `console-fun.jsx` `buildTelemetryMsg` | Port-with-fix | Recomputes lifetime aggregates on every set log — move to a memoised selector; Epley e1RM is correctly implemented and correctly attributed. |
| `console-fun.jsx` `AtlasView` | Port-as-is | Filter/expand grid over the card set; no defects found. |
| `console-fun.jsx` `PhaseTransition` | Port-with-fix | The cutscene is fine; its trigger is not (A61) — key it to the plan cursor. |
| `console-fun.jsx` `TimeCapsule` | Port-with-fix | Nice mechanic; `canOpen` keys off `pos.week` which is calendar-derived (A11) and must follow the cursor. |
| `console-fun.jsx` `useKonamiCode`, `KonamiOverlay` | Port-with-fix | Harmless easter egg; must be called unconditionally (A52). |
| `console-fun.jsx` `ErrorBoundary` | Port-as-is | Correct `getDerivedStateFromError` + `componentDidCatch` with a retry and an escape hatch. One of the few defensive pieces in the codebase. |
| `console-fun.jsx` `PWAUpdateToast` | Port-with-fix | Presentation is fine; the detection behind it is broken (A65). |
| **`tweaks-panel.jsx`** (whole file) | Drop | A design-canvas host protocol (`window.parent.postMessage`) with no host in the deployed PWA; persists nothing (A49). Replace with a settings screen backed by the profile. |
| **`console-app.jsx`** `App` | Rewrite | Conditional hooks, effect churn, a colliding key handler, an unconfirmed wipe button, and a cutscene keyed to the wrong week (A44, A52, A53, A54, A61). |
| `console-app.jsx` visual-viewport `--kb-h` effect (`:23-37`) | Port-as-is | Correct and genuinely useful for on-screen-keyboard insets on mobile; the one piece of platform handling in the file with no defect. |

**Totals: 13 Port-as-is · 30 Port-with-fix · 19 Rewrite · 7 Drop (69 rows).**

---

## C. Data model gaps for the generic version

### C.1 What `defaultState()` cannot represent

`console-store.jsx:80-111` is a single flat object describing one anonymous user following one
fixed 168-day plan anchored to a calendar date. Against the new requirements it is missing:

1. **Any notion of a user.** There is no profile, no id, no body data, no goal. Body mass
   appears only as an untyped `weightLog` in lb; the baseline (210 lb), the target (183 lb)
   and the projection curve live in `data.js`, not in state. Two friends cannot use one
   deployment, and a single user cannot restate their own goal.
2. **A unit preference.** Nothing in the state records whether a stored number is kg or lb;
   the unit is encoded in *field names* (`lb`) and *display strings* (`"kg"`). There is no
   safe migration from the current store because the existing `sets[].weight` values have no
   recorded unit.
3. **Weekly availability with times.** The plan assumes a fixed 7-day rotation
   (`data.js:115-207`) mapped onto consecutive calendar days. There is nowhere to say "I train
   Tuesday/Thursday/Saturday at 18:30".
4. **A plan cursor decoupled from the calendar.** `programPosition(startDate)` *is* the cursor
   (`console-store.jsx:68-77`), and it is a pure function of the date. There is no stored
   position, so there is no way to be "on session 14" while the calendar says day 30.
5. **Pauses.** No representation of a suspension interval, so an illness or a holiday is
   indistinguishable from a run of missed sessions (A11).
6. **Session reordering / "pick today's session".** `s.day` selects an index into a fixed
   array; there is no per-day assignment record, so choosing to do Legs on a Push day cannot
   be expressed, only simulated by scrubbing (which then desynchronises everything, A14).
7. **Reminder subscriptions.** Nothing. No push subscription, no endpoint, no per-user
   reminder schedule, no delivery log.
8. **A weekly target and miss detection.** The only weekly aggregate is `derived.setsTarget`
   for the *selected day*. There is no per-week completion target, no evaluation boundary, and
   no record of whether a week was missed — so the motivational-video trigger has nothing to
   fire on.
9. **A video asset.** `console-video.jsx` handles *exercise form* references via external
   Invidious instances. There is no concept of a locally-hosted motivational clip, no asset
   id, and no record of when it was last shown (so it would replay on every render).
10. **Schema versioning.** `loadV2` (`console-store.jsx:42-48`) spreads whatever it finds over
    `defaultState()` with no version field and no migration, and four live keys are absent
    from `defaultState()` entirely (A45).

Additionally, the following stored fields have no place in the new model and should not be
migrated: `s.tweaks` (A49), `s.streak` (A40), `s.skipped` (A62), `waterTarget` as a cup count
(A34), `lastDrop`/`lastTelemetry`/`lastMilestone`/`lastDeletedSet` (transient UI, A69), and the
`suggested`/`lastBest`/`repsLo`/`repsHi` copies frozen into every set (A28).

### C.2 Unit and rounding conventions

**Canonical storage is SI and unconditional.** Mass in kilograms, volume in millilitres,
duration in seconds, instants as epoch milliseconds (UTC). No stored field is ever in pounds,
cups, or minutes. The unit system is a *display and input* property of the profile.

**Display rounding.**
- Loads are rounded to the smallest plate increment the user can actually assemble, not to a
  decimal place: **kg → nearest 1.25 kg** (a pair of 0.625 kg plates is not standard; 1.25 kg
  is the smallest common pair increment), **lb → nearest 2.5 lb** (a pair of 1.25 lb plates).
- Conversion uses the exact definition `1 lb = 0.45359237 kg`, never an approximation.
- Rounding is applied **once, at the display boundary**, and the rounded value is never
  written back to storage — except when the user *enters* it, in which case the entered
  display value is converted exactly and stored, and `enteredUnit` records what they typed so
  the round trip is lossless.
- Body mass is displayed to 0.1 kg / 0.1 lb without plate quantisation.
- Suggested-load increments follow the same rule: `+1.25 kg` for a kg user, `+2.5 lb` for an
  lb user. Do not port the current unconditional `+2.5` (A1).

**Sign conventions.** All masses, volumes and durations are non-negative. Deltas are
`current − reference`, so **negative means loss** for body mass and **negative means behind
schedule** for plan progress. State the reference explicitly in every delta field's name.

### C.3 Proposed TypeScript types

```ts
// ============================================================================
// Units and primitives
// ----------------------------------------------------------------------------
// CANONICAL STORAGE UNITS — every persisted quantity uses these, without
// exception. Display units are a profile property, applied at the boundary.
//   mass      kilograms  (kg)
//   volume    millilitres (mL)
//   duration  seconds     (s)
//   instant   epoch milliseconds, UTC (ms)
// ============================================================================

/** Kilograms. Non-negative. Never rounded on write. */
type Kg = number;
/** Millilitres. Non-negative integer. */
type ML = number;
/** Seconds. Non-negative. */
type Seconds = number;
/** Epoch milliseconds, UTC. Monotonic within a device only. */
type EpochMs = number;

/**
 * Calendar day in the user's own timezone, "YYYY-MM-DD".
 * MUST be produced from the profile's `timezone` (Intl.DateTimeFormat with
 * that IANA zone), NEVER from Date.prototype.toISOString(), which yields the
 * UTC day and shifts the boundary by the offset.
 */
type LocalDate = string;

/** Wall-clock time of day in the user's timezone, "HH:mm" (24 h). */
type LocalTime = string;

/** IANA zone id, e.g. "Europe/Athens". Required; never inferred silently. */
type TimeZone = string;

/** 1 = Monday … 7 = Sunday (ISO-8601 weekday). */
type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type UnitSystem = "metric" | "imperial";

/** Exact by definition: 1 lb = 0.45359237 kg. */
const KG_PER_LB = 0.45359237;

/** Smallest assemblable increment per system: a pair of the smallest plates. */
const LOAD_INCREMENT: Record<UnitSystem, number> = {
  metric: 1.25,    // kg
  imperial: 2.5,   // lb
};

// ============================================================================
// Profile — one per user; a deployment holds many.
// ============================================================================

interface Profile {
  id: string;                      // uuid, stable for the profile's life
  displayName: string;
  timezone: TimeZone;              // authoritative for every LocalDate/LocalTime
  units: UnitSystem;               // display + input only; storage stays SI
  createdAt: EpochMs;

  body: {
    heightCm: number | null;       // centimetres
    baselineMassKg: Kg;            // reference for every mass delta; > 0
    baselineAt: LocalDate;         // when the baseline was measured
    baselineBodyFatPct: number | null;   // 0–100
    sex: "male" | "female" | "unspecified"; // affects hydration/BMR heuristics only
    birthYear: number | null;
  };

  goal: {
    kind: "fat-loss" | "muscle-gain" | "recomposition" | "maintenance";
    targetMassKg: Kg | null;       // absolute target, not a delta
    targetBodyFatPct: number | null;
    targetDate: LocalDate | null;
    /** Signed: negative = intended loss. Derived from target − baseline. */
    intendedDeltaKg: Kg | null;
  };

  /** Hydration is stored as a volume, not a cup count (see A34). */
  hydration: {
    dailyTargetML: ML;             // e.g. 3500
    cupSizeML: ML;                 // display granularity only, e.g. 500
  };
}

// ============================================================================
// Availability — replaces the implicit "7 consecutive calendar days" rotation.
// ============================================================================

interface AvailabilitySlot {
  weekday: IsoWeekday;
  startTime: LocalTime;            // in Profile.timezone
  expectedDurationS: Seconds;      // for reminder lead time and calendar blocks
}

interface Availability {
  slots: AvailabilitySlot[];       // 1..7 entries; order irrelevant
  /** Sessions the user commits to per week. Drives miss detection (below). */
  weeklySessionTarget: number;     // integer >= 1, <= slots.length
}

// ============================================================================
// Plan — a template, decoupled from any calendar.
// ============================================================================

/** Typed prescription: replaces the free-text "6–8" / "60 s" / "—" strings. */
type Prescription =
  | { kind: "reps"; lo: number; hi: number }        // hi >= lo; hi === lo means fixed
  | { kind: "amrap"; minimum: number | null }        // "max"
  | { kind: "time"; targetS: Seconds }               // planks, holds
  | { kind: "distance"; targetM: number }
  | { kind: "duration"; targetS: Seconds }           // steady cardio
  | { kind: "none" };                                // "—": prescribed, unmeasured

interface Exercise {
  id: string;                      // stable id; NEVER a positional index (see A26)
  name: string;
  /** Bodyweight lifts store loadKg = 0 legitimately; this flag disambiguates. */
  isBodyweight: boolean;
  isCompoundPrimary: boolean;      // replaces the COMPOUND_LIFTS name Set
  videoQuery: string | null;       // search query, not an id — cannot 404
  formCueId: string | null;
  note: string | null;
}

interface PlannedExercise {
  exerciseId: string;
  /** Sets are a resolved integer by the time they reach the UI. */
  setsLo: number;
  setsHi: number;                  // === setsLo for a fixed count
  prescription: Prescription;
}

interface PlannedSession {
  id: string;                      // stable
  ordinal: number;                 // 1-based position within the plan
  name: string;                    // "Push", "Legs", "Rest"
  kind: "lift" | "cardio" | "rest";
  exercises: PlannedExercise[];
}

interface PlanTemplate {
  id: string;
  version: number;
  name: string;
  sessions: PlannedSession[];      // the full ordered sequence, e.g. 168 entries
  /** Optional per-block volume/deload modifiers, indexed by block number. */
  blocks: { index: number; sessionCount: number; setModifier: number; isDeload: boolean }[];
}

// ============================================================================
// Cursor — the decoupling the current build lacks entirely (A11, A12).
// ============================================================================

interface PlanCursor {
  planId: string;
  /**
   * Index into PlanTemplate.sessions of the NEXT session to perform.
   * Advances ONLY when a session is completed or explicitly skipped —
   * never on a calendar tick. This is the whole point of the rewrite.
   */
  nextSessionIndex: number;        // 0-based
  startedOn: LocalDate;
  /** Set when nextSessionIndex passes the last session. */
  completedOn: LocalDate | null;
}

interface PlanPause {
  id: string;
  from: LocalDate;                 // inclusive
  to: LocalDate | null;            // inclusive; null = still paused
  reason: string | null;
}

/**
 * One calendar day's assignment. Lets the user pick today's session and
 * reorder without touching the cursor's underlying sequence.
 */
interface SessionAssignment {
  date: LocalDate;
  /** Which template session the user actually chose for this date. */
  sessionId: string;
  /** Cursor index at assignment time, so a reorder is auditable. */
  sourceIndex: number;
  status: "planned" | "in-progress" | "completed" | "skipped" | "paused";
  completedAt: EpochMs | null;
  skipReason: string | null;
}

// ============================================================================
// Logged data
// ============================================================================

interface LoggedSet {
  id: string;                      // uuid; NOT a composite "wk-day-ex-set" key
  profileId: string;
  assignmentDate: LocalDate;       // which session-day this belongs to
  sessionId: string;
  exerciseId: string;              // stable id — survives reordering and deletion
  setNumber: number;               // 1-based within the exercise, this session
  isBonus: boolean;                // beyond the prescribed count

  /**
   * Load in kilograms. 0 is a VALID value for a bodyweight lift and MUST be
   * distinguished from "not recorded" (null) — the current build treats both
   * as falsy and silently discards bodyweight work (see A60).
   */
  loadKg: Kg | null;
  /** What the user typed, so the display round-trips without drift. */
  enteredUnit: UnitSystem;

  reps: number | null;             // null for time/distance work
  durationS: Seconds | null;       // for holds and intervals
  distanceM: number | null;
  rpe: number | null;              // 1–10, 0.5 steps

  loggedAt: EpochMs;
  /** Derived values are NOT stored here (see A28) — recompute them. */
}

interface BodyMassEntry {
  id: string;
  profileId: string;
  date: LocalDate;                 // the day measured, in profile timezone
  massKg: Kg;                      // > 0
  enteredUnit: UnitSystem;
  bodyFatPct: number | null;
  loggedAt: EpochMs;
}

interface HydrationEntry {
  profileId: string;
  date: LocalDate;                 // local day, never the UTC day (see A35)
  volumeML: ML;                    // cumulative for the day, non-negative
  /** Timestamps of each increment, so a hydration CUE has something to read. */
  marks: EpochMs[];
}

// ============================================================================
// Reminders — Web Push from a Cloudflare Worker.
// ============================================================================

interface PushSubscriptionRecord {
  id: string;
  profileId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** The Worker needs the zone to fire at the user's local time, not UTC. */
  timezone: TimeZone;
  userAgent: string;
  createdAt: EpochMs;
  lastSeenAt: EpochMs;
  /** Set when the push service returns 404/410; stop sending. */
  expiredAt: EpochMs | null;
}

interface ReminderRule {
  id: string;
  profileId: string;
  kind: "session" | "hydration" | "weigh-in" | "weekly-review";
  /** For session reminders: minutes before AvailabilitySlot.startTime. */
  leadMinutes: number;
  /** For hydration: fire every N seconds within the active window. */
  intervalS: Seconds | null;
  activeWindow: { from: LocalTime; to: LocalTime } | null;
  weekdays: IsoWeekday[];
  enabled: boolean;
}

interface ReminderDelivery {
  ruleId: string;
  scheduledFor: EpochMs;
  sentAt: EpochMs | null;
  /** Idempotency guard: never send twice for the same scheduled instant. */
  dedupeKey: string;
  result: "sent" | "failed" | "expired" | "suppressed" | null;
}

// ============================================================================
// Weekly target and miss detection — the motivational-video trigger.
// ============================================================================

interface WeeklyReview {
  profileId: string;
  /** ISO week boundary, evaluated in Profile.timezone. */
  weekStart: LocalDate;            // the Monday
  weekEnd: LocalDate;              // the Sunday
  target: number;                  // Availability.weeklySessionTarget at eval time
  completed: number;               // SessionAssignment.status === "completed"
  skipped: number;
  paused: boolean;                 // any PlanPause overlapped this week
  /**
   * Signed shortfall: completed − target. Negative means missed.
   * A paused week is never a miss.
   */
  delta: number;
  evaluatedAt: EpochMs | null;     // null until the week closes
  missHandled: boolean;            // true once the video prompt has been shown
}

interface MotivationalAsset {
  id: string;
  /** Local/bundled asset — not an external instance (contrast console-video.jsx). */
  src: string;
  posterSrc: string | null;
  durationS: Seconds;
  caption: string | null;
}

interface MotivationVideoState {
  profileId: string;
  /** Prevents replay on every render and on every reload. */
  lastShownForWeek: LocalDate | null;   // the weekStart it was shown for
  lastShownAt: EpochMs | null;
  /** Rotate so the same clip is not shown twice running. */
  recentAssetIds: string[];
}

// ============================================================================
// Root
// ============================================================================

interface AppState {
  /** Bump on every shape change; migrate explicitly (contrast loadV2, A45). */
  schemaVersion: number;
  activeProfileId: string | null;
  profiles: Record<string, Profile>;
  availability: Record<string, Availability>;          // by profileId
  cursors: Record<string, PlanCursor>;                 // by profileId
  pauses: Record<string, PlanPause[]>;                 // by profileId
  assignments: Record<string, SessionAssignment[]>;    // by profileId
  sets: Record<string, LoggedSet>;                     // by LoggedSet.id
  bodyMass: Record<string, BodyMassEntry[]>;           // by profileId
  hydration: Record<string, HydrationEntry[]>;         // by profileId
  weeklyReviews: Record<string, WeeklyReview[]>;       // by profileId
  reminders: Record<string, ReminderRule[]>;           // by profileId
  subscriptions: Record<string, PushSubscriptionRecord[]>; // by profileId
  motivation: Record<string, MotivationVideoState>;    // by profileId
  plans: Record<string, PlanTemplate>;                 // by planId
}

// ============================================================================
// Display helpers — the ONLY place a unit conversion is allowed.
// ============================================================================

/** kg → display value in the profile's unit, quantised to the plate increment. */
function displayLoad(loadKg: Kg, units: UnitSystem): number {
  const raw = units === "metric" ? loadKg : loadKg / KG_PER_LB;
  const step = LOAD_INCREMENT[units];       // 1.25 kg or 2.5 lb
  return Math.round(raw / step) * step;     // half-up at the midpoint
}

/** Entered display value → exact kg for storage. Never pre-round the input. */
function toStoredLoad(entered: number, units: UnitSystem): Kg {
  return units === "metric" ? entered : entered * KG_PER_LB;
}

/** Body mass: 0.1 resolution, no plate quantisation. */
function displayMass(massKg: Kg, units: UnitSystem): number {
  const raw = units === "metric" ? massKg : massKg / KG_PER_LB;
  return Math.round(raw * 10) / 10;
}

/** Progression step in the user's own increment (contrast the flat +2.5, A1). */
function nextLoad(currentKg: Kg, units: UnitSystem): Kg {
  return toStoredLoad(displayLoad(currentKg, units) + LOAD_INCREMENT[units], units);
}
```

### C.4 Two model decisions worth stating explicitly

- **Composite string keys are replaced by ids.** The current `${wk}-${day}-${exIdx}-${setN}`
  scheme encodes four facts in one string and is parsed by `split("-").map(Number)` in six
  places (`console-store.jsx:232`, `console-train.jsx:160`, `console-views.jsx:493,664`,
  `console-app.jsx:66,210`). It is the direct cause of A26 and it cannot express a
  reordered or paused schedule. Flat records keyed by uuid, with the position stored as
  fields, remove that entire class of bug.
- **Derived values are never persisted.** `suggested`, `lastBest`, `repsLo`, `repsHi` and the
  streak are all recomputable from the log. Storing them (A28, A40) creates a second source of
  truth that goes stale on the next write and multiplies the storage footprint against a quota
  that fails silently (A42).

---

## What I did not check

- **Security.** Assigned to another reviewer. I did not assess the SRI hashes at
  `index.html:1496-1498`, the `postMessage(…, '*')` target at `tweaks-panel.jsx:171`, the
  unsanitised `JSON.parse` of user-pasted text at `console-views.jsx:600`, the third-party
  iframe origins in `console-video.jsx:21-28`, or the service worker's cache scope. Several of
  these are adjacent to findings above; none of my findings should be read as a security
  clearance.
- **The scientific content of the training plan.** Assigned to another reviewer. I did not
  evaluate the volume progression, the deload placement, the calorie or protein targets, the
  push-up curve, the weight-loss projection in `data.js:70-74`, the exercise selection, the
  specimen-card claims and citations in `console-content.js:564-696`, or the Vyvanse-related
  scheduling. Where I cite these (A3, A16, A19) it is only as *inputs that break the parsing
  code*, never as a judgement on their correctness.
- **`prototype-almanac.html`, `prototype-console.html`, `prototype-protocol.html`,
  `design-canvas.jsx`, `console.html`.** Excluded by instruction. I did not verify the
  `PROJECT_SUMMARY.md:69` claim that `console.html` is an identical duplicate of `index.html`,
  nor the `DEPLOY.md`/`PROJECT_SUMMARY.md` disagreement about which file is the entry point
  (flagged as AMBIGUOUS in the knowledge graph). If `console.html` is *not* a duplicate, some
  findings above may not apply to it.
- **Runtime execution.** I did not run the app, open it in a browser, or exercise any path
  interactively. Every finding was derived by reading the code. Consequently:
  - The DST off-by-one (A9) is derived from the parsing semantics of
    `new Date("YYYY-MM-DDT00:00:00")` and the arithmetic at `console-store.jsx:57`; I did not
    execute it against a real March-transition date.
  - The AudioContext claim (A29) rests on the documented autoplay-policy behaviour for
    contexts constructed outside a user gesture; I did not observe the suspended state on a
    device.
  - The localStorage quota estimate in A28/A42 is an order-of-magnitude calculation from the
    stored field count, not a measurement of a real store.
  - The Babel scoping analysis (A50) *was* verified against the actual
    `@babel/standalone@7.29.0` bundle — the `SEe` injection function and the default
    `["react","env"]` presets with `targets: {browsers: undefined}`. What I did not do is
    confirm empirically that `preset-env` with those exact options emits `var` rather than
    `const` for this codebase.
  - The render-count claims in A41 and A48 are structural (dependency arrays and prop
    identity), not profiled.
- **CSS.** I read `index.html`'s stylesheet only for design tokens and the theme-colour
  conflict (A67). I did not review layout correctness, responsive breakpoints, the safe-area
  insets, contrast ratios, or any accessibility property beyond noting that `aria-label` is
  present on the set-row inputs (`console-train.jsx:130,135`).
- **Accessibility.** No audit performed. The keyboard handlers (A54) were reviewed for
  correctness of behaviour, not for focus management, screen-reader semantics, or the
  keyboard-trap risk in the four modal components.
- **`console-content.js` in full.** I read the `drawSpecimen` helper, the card schema, the
  rarity distribution, and spot-checked entries. I did not read all 24 `FORM_CUES` entries or
  all 42 card bodies.
- **The push backend.** No Cloudflare Worker exists in this repository. Section C proposes the
  client-side shape a Worker would consume; I did not review VAPID handling, cron granularity,
  KV limits, or per-plan quotas, and the `ReminderDelivery` idempotency design is a proposal,
  not a verified contract.
- **Migration of existing data.** I identified that the current `sets[].weight` values carry no
  recorded unit (C.1 item 2), which makes an automatic migration unsound. I did not design a
  migration, and I did not check whether any real store exists on the author's device.
