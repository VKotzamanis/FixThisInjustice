# P5 Measurements and set-entry engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Body mass, body fat and fluid become measurements a user can log any day, correct and undo; targets, the export and the chart read one derivation of them; the profile is editable after setup with the wizard's own rules; and the set row prefills, quantises once and asks before an early Finish.

**Architecture:** One pure module (`src/domain/measurements.ts`) owns "the" body mass (one trend point per civil date, never a post-session mass), "the" body fat (newest dated entry) and the nutrition input built from them; the selectors, the export summary and the chart import it. Body-mass entries gain an optional `role` (`morning`/`pre`/`post`, rule 7 additive) that the fluid-loss rule keys on. Store transformers for update/delete/restore live in `src/store/measurements.ts`; UI is one shared `BodyMassForm` used on Today (any day), on Log (edit/delete list) and in Train (pre/post with a fixed role). The wizard's field rules move to `src/ui/setup/fieldRules.ts` so the Settings profile editor refuses exactly what setup refuses. Set entry: the progression engine returns a grid load once; the row prefills load and reps and logs an untouched prefill exactly.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Zustand 5, Zod 4, date-fns 4 + @date-fns/tz, Vitest 4, @playwright/test 1.63 (Chromium, iPhone 13 + Pixel 7 emulation).

**Spec:** `docs/plans/2026-11-04-aaa-rebuild-spec.md` (ruling R9, R4's body-mass bound, phase line P5). Audit IDs refer to `docs/private/audit-2026-11-04/` (gitignored, this laptop only): `G-targets.md` G01-G23, `B-data.md` B11, `C-training.md` C09, C12, C13, C16.

## Global Constraints

- AGENTS.md rules 1-10 and its Verify block apply to every task.
- Rule 1: no new health coefficient, dose or citation. Every existing number keeps its source. The only new numbers are engineering bounds, each with unit and source in a comment: `BODY_MASS_PLAUSIBLE_FRACTION = 0.1` (spec R4, data-entry sanity bound) and display rounding (0.1 fl oz).
- Rule 2: derive, never copy. A constant or rule in two places is derived from one, or one test reads both (schema bounds are exported from `src/domain/schema.ts`, wizard field rules from `src/ui/setup/fieldRules.ts`).
- Rule 3: stage with pathspecs, `git add -- <files>`, never `git add -A`. One commit per task with the message given. Never push.
- Rule 4: never edit `src/content/introSlides.ts`; existing copy strings are never reworded.
- Rule 5: colours only through tokens in `src/ui/styles/tokens.css`; no hex literal in component CSS.
- Rule 6: only `src/store/persistence.ts` touches web storage; `toISOString()` only in `src/domain/dates.ts`.
- Rule 7 (spec): old `fti.v3` documents and old exports must load unchanged. Schema changes in this plan are additive OPTIONAL fields only (`BodyMassEntry.role`). No new enum value inside an existing enum. `CURRENT_SCHEMA_VERSION` stays 3.
- Rule 8: the runner re-runs every gate itself; a "passed" from the implementer is a claim.
- Wording is out of scope. A new copy key only where a new control or message needs one: base table `src/content/copy.ts` only (union line + table line), never `copy.limelight.ts`; `button.`/`label.`/`hero.`/`option.` values in Title Case; button at most 3 words, hero at most 8, advice at most 12; no em dash, no emoji, no exclamation mark. Every added key also gets its row `"<key>":"<value>"` in `src/content/__fixtures__/limelight-resolved.json` (the value is the base string, since no limelight override exists for it), and the task runs `npx vitest run --maxWorkers=1 src/content`.
- Tests: always `--maxWorkers=1`, one heavy process at a time (16 GB machine shared with MATLAB). "Test timed out" is not an assertion failure: rerun that file alone once before diagnosing. `free -m` before a vitest run; wait while available memory is below 1500 MB.
- Every physical quantity carries its unit in a comment: `[kg]`, `[mL]`, `[mL/day]`, `[ms] epoch UTC`, `[%]`, `[PAL]`, `[sets]`, `[repetitions]`. Sign convention (master plan section 3): a change is current minus reference, negative = loss; a fluid-loss fraction is POSITIVE when mass was lost.
- Phone width 320-412 px, iPhone Safari installed and Android Chrome; both themes. Playwright here is Chromium with device emulation, not WebKit.
- Implementers (Codex, no network, no ports) never run `npm run e2e`; the runner runs every e2e spec a task adds and `npm run e2e` before committing tasks 6 and 7.
- Edits are anchored by quoted content, never by line number: P1 Tasks 8-18 land before this plan and move every line. Where this plan quotes code a P1 task wrote, the quote is that P1 task's text.

## Cross-phase ownership (read before starting)

- P1 lands first (Tasks 11-14 especially): `TodayView` reads `useOpenAssignment`, Train is read-only after Finish with "Add Forgotten Set", `UnitInput` is `type="text"` with `parseDecimal` -> `parseDecimalInput`, `SetRow` has `referenceKg` and the load plausibility question (`button.logAnyway`, `advice.loadLooksOff`), `ExerciseCard` computes `latestToday` and `referenceKg`, `updateProfile` parses with `ProfileSchema` and throws (`src/store/validate.ts` `parseOrThrow`). This plan reuses `button.logAnyway` and `parseOrThrow`.
- P2 (storage engine) changes `src/store/persistence.ts` and the e2e helper that reads the stored document. This plan never touches persistence; the e2e specs read storage only through `readDocument` in `e2e/support/app.ts`, which P2 owns.
- P4a (shell/design) owns the visual sizing of `BodyMassChart` (G10: container-sized viewBox, CSS-px labels and points, no fixed 260 px height), the 44 px toggles and the one-big-Log-button layout of C09, and the overall placement of sections on Today and Settings. P5 owns the chart's DATA (one trend point per day) and the projection ANCHOR (G11), and gives P4a stable props: `entries` (already trend points), `projectionFrom?: ProjectionAnchor`. P4a must not re-derive either.
- P4b (platform) owns G19 under E12 (same root cause, same file `src/ui/views/atlasArt.tsx`: lazy card-icon chunk retry). P5 does not touch `atlasArt.tsx`.
- P3 (schedule and wizard items A04-A17) also edits `src/ui/setup/SetupWizard.tsx`. Task 4 here only moves module-level helpers out of it and replaces two inline validators with calls; if P3 has already moved them, Task 4 imports from wherever P3 put them and keeps one copy.
- P6 (games) touches none of these files.

## Decisions (each names the rejected alternative)

- G04 PAL: the stored PAL (`activityPal`) is the single source of the activity value. `src/domain/activity.ts` has the one reader `palOf(profile)` (PAL, else the band floor for a profile from before the slider) and the one writer `withPal(pal)` that sets `activityPal` and the band `activity` it belongs to in one patch. `activity` stays in the stored record as the derived band. Rejected: deleting `activity` from the schema (a rollback build requires it and would refuse or quarantine every profile; 30+ fixtures; nothing reads it once `palOf` exists). Rejected: coercing an absent PAL into a stored number on load (adds a key to every legacy profile and breaks the round-trip property for no behavioural gain: absent already means the floor).
- G05 body fat: a re-measure is a dated `BodyMassEntry` carrying `bodyFatPct` (the field already exists); targets read the newest such entry, else the baseline. Rejected: a new `bodyFat` collection (new root key, a P2 object store, two places for one fact). Residual: between re-measures the percentage is held (unchanged behaviour); "hold fat-free mass" would be an unsourced modelling choice (rule 1).
- G12 trend: one point per civil date; rank morning > untagged (every pre-role entry) > pre; post never. Ties on the same rank: latest `loggedAt` (keeps today's `latestBodyMassEntry` contract). Rejected: daily minimum (a typo low would win).
- G03 undo: delete returns the removed entry and the view holds it in the toast's closure; `restoreBodyMass` puts it back by id. Rejected: a second undo buffer in the mirrored session slice (sessionMirror schema change for a 6 s offer).
- G16 capsule: "Write Another" from the opened state replaces the opened capsule. Rejected: an archive collection (new root key; the note was already read; the JSON export is the archive).
- G23 fluid display: `formatVolume` shows imperial volumes to 0.1 fl oz. Rejected: an imperial cup default of 237 mL only (leaves every existing 250 mL cup mislabelled).
- C12 Finish undo: the view keeps the pre-Finish assignment and cursor and the store restores them only if neither changed since (identity). Rejected: a "Reopen" action (P1 Task 12 rejected it: it would rewind a graded week).
- G19 left to P4b E12 (see ownership).

---
## File Structure

| Path | Status | Task | Responsibility |
|---|---|---|---|
| `src/domain/types.ts` | modify | 1 | `BodyMassRole`; optional `BodyMassEntry.role` |
| `src/domain/schema.ts` | modify | 1 | `BodyMassRoleSchema`, `role` optional; export `MAX_MASS_KG`, `MAX_NOTE_CHARS` |
| `src/domain/arbitraries.ts` | modify | 1 | Body-mass arbitrary emits a role sometimes (round trip sees it) |
| `src/domain/measurements.ts` | create | 1 | Trend point per day, latest mass / body fat, plausibility, nutrition input, projection anchor |
| `src/store/selectors.ts` | modify | 1, 11 | Re-export measurement readers; targets read the newest body-fat entry; `useCivilToday`, `useNutritionGate` |
| `src/domain/export/summary.ts` | modify | 1 | Targets from `nutritionInputForState` (B11), trend mass, role column |
| `src/domain/training/hydration.ts` | modify | 2 | Pre/post weigh-in by role (G01) |
| `src/store/measurements.ts` | create | 3 | Pure update/delete/restore of a body-mass entry; remove one drink |
| `src/store/index.ts` | modify | 3, 15 | Measurement actions; `logBodyMass` returns the id; `restoreFinishedSession` |
| `src/ui/setup/fieldRules.ts` | create | 4 | Wizard field rules shared with Settings; body-mass entry bound in words |
| `src/ui/setup/SetupWizard.tsx` | modify | 4 | Imports its field rules instead of defining them |
| `src/ui/measurements/BodyMassForm.tsx` | create | 5 | One mass field: role, bound in words, plausibility question |
| `src/ui/measurements/measurements.css` | create | 5 | Layout of the measurement controls (tokens only) |
| `src/ui/measurements/MeasurementsPanel.tsx` | create | 6 | Today: log a mass any day |
| `src/ui/measurements/BodyMassLog.tsx` | create | 6 | Log view: entries with edit, delete (undo) and a body-fat re-measure |
| `src/ui/views/TodayView.tsx` | modify | 6, 8, 12 | Mounts the panels; ticking clock |
| `src/ui/views/LogView.tsx` | modify | 6, 13 | Mounts the list; trend data and anchored projection |
| `src/ui/views/TrainView.tsx` | modify | 7, 15 | Weigh-ins with a role and the fluid-loss flag; Finish confirm and undo |
| `src/ui/views/train/BodyMassQuickLog.tsx` (+ test) | delete | 7 | Replaced by `BodyMassForm` (spec R9) |
| `src/domain/units.ts` | modify | 8 | `formatVolume` to 0.1 fl oz; `toStoredVolume` |
| `src/ui/measurements/FluidQuickAdd.tsx` | create | 8 | Cup, custom volume, undo, progress against the one target |
| `src/ui/views/train/HydrationBanner.tsx` | modify | 8 | Narrow selectors instead of the whole store (G21) |
| `src/ui/views/TargetsView.tsx` | modify | 8, 11 | One fluid target; keyed check-in, named out-of-range field, 7-day history |
| `src/ui/views/SettingsView.tsx` | modify | 8, 9, 10 | Unit-aware fluid target and cup; profile editor row; nine-stop PAL slider |
| `src/ui/settings/ProfileEditor.tsx` | create | 9 | Height, birth year, sex, body fat, target mass, target date |
| `src/domain/activity.ts` | create | 10 | `palOf`, `bandOfPal`, `withPal` |
| `src/ui/settings/ActivitySlider.tsx` | create | 10 | The nine-stop slider for Settings |
| `src/content/rmrEquations.ts` | create | 11 | The one copy of the RMR equation display names (G22) |
| `src/ui/components/TimeCapsule.tsx` | modify | 12 | Write Another; max length from the schema; seal reads the tap's clock |
| `src/ui/components/BodyMassChart.tsx` | modify | 13 | Optional anchored projection |
| `src/domain/training/records.ts` | modify | 13 | `isUnloadedSet`; weekly series unloaded only |
| `src/ui/components/AmrapSpark.tsx`, `PRList.tsx` | modify | 13 | x by weeks; memoised derivations |
| `src/ui/views/atlas.css` | modify | 13 | Two columns below 360 px |
| `src/domain/training/progression.ts` | modify | 14 | Every returned load on the grid, reason quotes it (C13) |
| `src/ui/views/train/ExerciseCard.tsx`, `SetRow.tsx` | modify | 14 | No second quantisation; load and reps prefill; exact prefill logged; reps refusal shown |
| `src/content/copy.ts`, `src/content/__fixtures__/limelight-resolved.json` | modify | 5-15 | New base keys only |
| `e2e/p5-measurements.spec.ts` | create | 6, 7 | Rest-day mass, typo edit, fluid-loss flag |
| `e2e/support/constants.ts`, `src/test/e2eDocument.test.ts` | modify | 6 | Labels the new specs tap, pinned to the copy table |

---
### Task 1: The measurement domain (role field, trend, newest body fat, one nutrition input)

**Files:**
- Modify: `src/domain/types.ts` (the `BodyMassEntry` line)
- Modify: `src/domain/schema.ts` (`MAX_MASS_KG` and `MAX_NOTE_CHARS` declarations; `BodyMassEntrySchema`)
- Modify: `src/domain/arbitraries.ts` (`anyBodyMassEntry`)
- Create: `src/domain/measurements.ts`, `src/domain/measurements.test.ts`
- Modify: `src/store/selectors.ts` (imports; delete `latestBodyMassEntry` and `nutritionInputFor`; `useNutritionTargets`)
- Modify: `src/domain/export/summary.ts`, `src/domain/export/summary.test.ts` (append one describe)

**Interfaces:**
- Produces (types.ts): `type BodyMassRole = 'morning' | 'pre' | 'post'`; `BodyMassEntry.role?: BodyMassRole | undefined`.
- Produces (schema.ts): `export const MAX_MASS_KG = 500` [kg]; `export const MAX_NOTE_CHARS = 5_000` [characters]; `export const BodyMassRoleSchema`.
- Produces (measurements.ts): `BODY_MASS_PLAUSIBLE_FRACTION = 0.1`; `implausibleMass(massKg: Kg, referenceKg: Kg | null): boolean`; `trendEntries(list: readonly BodyMassEntry[]): BodyMassEntry[]`; `latestTrendEntry(list): BodyMassEntry | null`; `latestBodyMassEntry(state: AppState, profileId: string): BodyMassEntry | null`; `latestBodyFatEntry(state: AppState, profileId: string): BodyMassEntry | null`; `nutritionInputFor(profile: Profile, latest: BodyMassEntry | null, sessionsPerWeek: number, todayIso: LocalDate, latestBodyFat?: BodyMassEntry | null): NutritionInput`; `nutritionInputForState(state: AppState, profileId: string, todayIso: LocalDate): NutritionInput | null`; `interface ProjectionAnchor { date: LocalDate; massKg: Kg }`; `projectionAnchor(trend: readonly BodyMassEntry[], from: LocalDate, baseline: ProjectionAnchor): ProjectionAnchor`.
- Produces (selectors.ts): re-exports `latestBodyFatEntry`, `latestBodyMassEntry`, `nutritionInputFor` (existing importers keep compiling).

Design: "the" body mass is the newest trend point: one per civil date, rank morning > untagged (every entry written before roles) > pre, never post (audit G12; post-session mass is dehydrated by design). Same-rank ties go to the later `loggedAt`, which is the contract `latestBodyMassEntry` already has (`src/store/profile.test.ts` "picks the newest civil date, breaking ties on loggedAt" stays green). Body fat is the newest entry carrying one (G05). The export summary builds its input through `nutritionInputForState`, the same derivation the screen uses (B11). Pure module; `nutritionInputFor` moves here so `src/domain/export/` stops needing the store.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/measurements.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultState, parseState } from './schema';
import {
  BODY_MASS_PLAUSIBLE_FRACTION,
  implausibleMass,
  latestBodyFatEntry,
  latestBodyMassEntry,
  nutritionInputFor,
  nutritionInputForState,
  projectionAnchor,
  trendEntries,
} from './measurements';
import { makeProfile } from '../test/fixtures';
import type { AppState, BodyMassEntry } from './types';

/** A body-mass entry of profile-1; [kg], [ms] epoch UTC. */
function entry(patch: Partial<BodyMassEntry> & Pick<BodyMassEntry, 'id' | 'date' | 'massKg'>): BodyMassEntry {
  return {
    profileId: 'profile-1',
    enteredUnit: 'metric',
    bodyFatPct: null,
    loggedAt: 1_000,
    ...patch,
  };
}

function stateWith(list: BodyMassEntry[]): AppState {
  const profile = makeProfile();
  return {
    ...defaultState(),
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    bodyMass: { [profile.id]: list },
    availability: {
      [profile.id]: { slots: [{ weekday: 1, startTime: '18:00', expectedDurationS: 3600 }], weeklySessionTarget: 1 },
    },
  };
}

describe('implausibleMass (spec R4: > 10 % from the last mass asks once)', () => {
  it('questions a slip and never the first weigh-in', () => {
    expect(BODY_MASS_PLAUSIBLE_FRACTION).toBe(0.1);
    expect(implausibleMass(8.2, 82)).toBe(true); // [kg] 18 typed for 180 lb
    expect(implausibleMass(88.5, 80)).toBe(true);
    expect(implausibleMass(88, 80)).toBe(false); // exactly 10 %, binary-exact
    expect(implausibleMass(72, 80)).toBe(false); // exactly 10 %, binary-exact
    expect(implausibleMass(81, 82)).toBe(false);
    expect(implausibleMass(81, null)).toBe(false);
  });
});

describe('trendEntries (audit G12: one role per day, never post)', () => {
  it('keeps one point per day: morning over untagged over pre, post never', () => {
    const list = [
      entry({ id: 'pre', date: '2026-09-07', massKg: 80, role: 'pre', loggedAt: 10 }),
      entry({ id: 'post', date: '2026-09-07', massKg: 78, role: 'post', loggedAt: 20 }),
      entry({ id: 'old', date: '2026-09-07', massKg: 81, loggedAt: 5 }),
      entry({ id: 'am', date: '2026-09-08', massKg: 79.5, role: 'morning', loggedAt: 30 }),
      entry({ id: 'untagged', date: '2026-09-08', massKg: 79.9, loggedAt: 40 }),
      entry({ id: 'post-only', date: '2026-09-09', massKg: 77, role: 'post', loggedAt: 50 }),
    ];
    expect(trendEntries(list).map((e) => e.id)).toEqual(['old', 'am']);
  });

  it('breaks a tie of the same role on the later loggedAt (a re-typed weigh-in corrects the first)', () => {
    const list = [
      entry({ id: 'a', date: '2026-09-08', massKg: 79, loggedAt: 20 }),
      entry({ id: 'b', date: '2026-09-08', massKg: 78.5, loggedAt: 30 }),
    ];
    expect(trendEntries(list).map((e) => e.id)).toEqual(['b']);
  });
});

describe('latestBodyMassEntry and latestBodyFatEntry', () => {
  it('reads the newest trend point, skipping a newer post-session mass (G12)', () => {
    const s = stateWith([
      entry({ id: 'am', date: '2026-09-08', massKg: 80, role: 'morning' }),
      entry({ id: 'post', date: '2026-09-09', massKg: 78, role: 'post' }),
    ]);
    expect(latestBodyMassEntry(s, 'profile-1')?.id).toBe('am');
  });

  it('reads the newest body-fat entry even when a later mass carries none (G05)', () => {
    const s = stateWith([
      entry({ id: 'bf', date: '2026-09-01', massKg: 90, bodyFatPct: 24 }),
      entry({ id: 'later', date: '2026-09-08', massKg: 88 }),
    ]);
    expect(latestBodyFatEntry(s, 'profile-1')?.id).toBe('bf');
    const input = nutritionInputForState(s, 'profile-1', '2026-09-08');
    expect(input?.massKg).toBe(88); // [kg] the newest mass
    expect(input?.bodyFatPct).toBe(24); // [%] the newest body fat, not the null baseline
  });
});

describe('nutritionInputFor keeps its old contract', () => {
  it('pairs the latest entry with its own body fat when no body-fat entry is passed', () => {
    const input = nutritionInputFor(
      makeProfile(),
      entry({ id: 'x', date: '2026-09-08', massKg: 76, bodyFatPct: 24 }),
      4,
      '2026-09-08',
    );
    expect(input.massKg).toBe(76); // [kg]
    expect(input.bodyFatPct).toBe(24); // [%]
    expect(input.ageYears).toBe(31); // [year] 2026 - 1995
  });
});

describe('nutritionInputForState (audit B11: one derivation for screen and export)', () => {
  it('is null for an unknown profile and reads the availability quota', () => {
    const s = stateWith([]);
    expect(nutritionInputForState(s, 'nobody', '2026-09-08')).toBeNull();
    expect(nutritionInputForState(s, 'profile-1', '2026-09-08')?.sessionsPerWeek).toBe(1);
  });
});

describe('projectionAnchor (audit G11)', () => {
  const baseline = { date: '2026-01-01', massKg: 95 }; // [kg]
  it('starts at the programme start, at the latest mass measured on or before it', () => {
    const trend = trendEntries([
      entry({ id: 'a', date: '2026-05-01', massKg: 90 }),
      entry({ id: 'b', date: '2026-06-01', massKg: 85 }),
      entry({ id: 'c', date: '2026-07-01', massKg: 84 }),
    ]);
    expect(projectionAnchor(trend, '2026-06-15', baseline)).toEqual({ date: '2026-06-15', massKg: 85 });
  });

  it('falls back to the baseline, then to the earliest point', () => {
    expect(projectionAnchor([], '2026-02-01', baseline)).toEqual({ date: '2026-02-01', massKg: 95 });
    const trend = trendEntries([entry({ id: 'a', date: '2026-05-01', massKg: 90 })]);
    expect(projectionAnchor(trend, '2025-12-01', baseline)).toEqual({ date: '2025-12-01', massKg: 95 });
  });
});

describe('the role field is additive (rule 7)', () => {
  it('loads an entry without a role and keeps a role it is given', () => {
    const s = stateWith([
      entry({ id: 'old', date: '2026-09-07', massKg: 80 }),
      entry({ id: 'new', date: '2026-09-08', massKg: 79, role: 'pre' }),
    ]);
    const parsed = parseState(JSON.parse(JSON.stringify(s)) as unknown);
    if (!parsed.ok) throw new Error(parsed.error);
    const list = parsed.state.bodyMass['profile-1'] ?? [];
    expect(list[0]).not.toHaveProperty('role');
    expect(list[1]?.role).toBe('pre');
  });
});
```

Append to `src/domain/export/summary.test.ts`, and add these imports next to `import { buildSummary } from './summary';`:
```ts
import { localDateOf } from '../dates';
import { nutritionInputForState } from '../measurements';
import { computeTargets, isInDomain } from '../nutrition';
```
```ts
describe('the summary states the targets the screen states (audit B11)', () => {
  it('reads the PAL and the newest body-fat entry, through nutritionInputForState', () => {
    const base = makeBlankState(makeProfile({ activityPal: 2.2 })); // [PAL] a slider stop above the floor
    const state: AppState = {
      ...base,
      bodyMass: {
        p1: [
          { id: 'bf', profileId: 'p1', date: '2026-08-01', massKg: 90, enteredUnit: 'metric', bodyFatPct: 22, loggedAt: NOW - 1 }, // [kg], [%]
          { id: 'm', profileId: 'p1', date: '2026-08-20', massKg: 88, enteredUnit: 'metric', bodyFatPct: null, loggedAt: NOW }, // [kg]
          { id: 'post', profileId: 'p1', date: '2026-08-21', massKg: 86, enteredUnit: 'metric', bodyFatPct: null, loggedAt: NOW, role: 'post' }, // [kg] never "the" mass
        ],
      },
    };
    const profile = state.profiles['p1'];
    if (profile === undefined) throw new Error('fixture has no p1');
    const input = nutritionInputForState(state, 'p1', localDateOf(NOW, profile.timezone));
    if (input === null || !isInDomain(input)) throw new Error('fixture is outside the engine domain');
    expect(input.massKg).toBe(88); // [kg] trend, not the post-session 86
    expect(input.bodyFatPct).toBe(22); // [%] newest body-fat entry
    const kcal = computeTargets(input).targetKcal; // [kcal/day]
    expect(buildSummary(state, 'p1', NOW)).toMatch(new RegExp(`Intake target:\\s+${String(kcal)} kcal`));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/domain/measurements.test.ts src/domain/export/summary.test.ts`
Expected: FAIL (`./measurements` does not exist).

- [ ] **Step 3: Types and schema**

In `src/domain/types.ts` replace
```ts
export interface BodyMassEntry { id: string; profileId: string; date: LocalDate; massKg: Kg; enteredUnit: UnitSystem; bodyFatPct: number | null; loggedAt: EpochMs; }
```
with
```ts
/**
 * When a body mass was taken (spec R9, audit G01/G12). `morning` is the trend reading, `pre` and
 * `post` bracket a session for the > 2 % fluid-loss check. Optional and additive (rule 7): an
 * entry written before the field existed has no role and still counts towards the trend.
 */
export type BodyMassRole = 'morning' | 'pre' | 'post';
export interface BodyMassEntry { id: string; profileId: string; date: LocalDate; massKg: Kg; enteredUnit: UnitSystem; bodyFatPct: number | null; loggedAt: EpochMs; role?: BodyMassRole | undefined; }
```
In `src/domain/schema.ts`:
- Replace
```ts
/** [kg] Security constraint 3: 0 < mass <= 500. Body mass, unlike a load, cannot be zero. */
const MAX_MASS_KG = 500;
```
with
```ts
/**
 * [kg] Security constraint 3: 0 < mass <= 500. Body mass, unlike a load, cannot be zero. Exported so
 * the measurement field states the bound the loader refuses by (audit G08, rule 2).
 */
export const MAX_MASS_KG = 500;
```
- Replace
```ts
/** [characters] Free-text ceilings, so a corrupted blob cannot be stored back. */
const MAX_NOTE_CHARS = 5_000;
```
with
```ts
/**
 * [characters] Free-text ceilings, so a corrupted blob cannot be stored back. Exported so the time
 * capsule caps its field by the number the loader refuses by (audit G22, rule 2).
 */
export const MAX_NOTE_CHARS = 5_000;
```
- Replace `export const BodyMassEntrySchema = z.object({` with
```ts
/** Spec R9: when a body mass was taken. types.ts BodyMassRole. */
export const BodyMassRoleSchema = z.enum(['morning', 'pre', 'post']);

export const BodyMassEntrySchema = z.object({
```
and inside that object, after `  loggedAt: EpochMsSchema, // [ms]`, add
```ts
  // Additive (spec R9, audit G01/G12; rule 7): absent on every entry written before roles existed.
  role: BodyMassRoleSchema.optional(),
```
(`HydrationEntrySchema` follows; leave it alone.)

In `src/domain/arbitraries.ts` replace the whole `export const anyBodyMassEntry ... = fc.record({ ... });` with
```ts
export const anyBodyMassEntry: fc.Arbitrary<BodyMassEntry> = fc
  .tuple(
    fc.record({
      id: anyId,
      profileId: anyId,
      date: anyLocalDate,
      massKg: finite(1, 500), // [kg]
      enteredUnit: anyUnitSystem,
      bodyFatPct: fc.option(finite(0, 100), { nil: null }),
      loggedAt: anyEpochMs,
    }),
    // Spec R9: the role is optional, so the round trip sees both an absent key and every value.
    fc.option(fc.constantFrom('morning' as const, 'pre' as const, 'post' as const), { nil: undefined }),
  )
  .map(([entry, role]) => (role === undefined ? entry : { ...entry, role }));
```

- [ ] **Step 4: The domain module**

Create `src/domain/measurements.ts`:
```ts
// src/domain/measurements.ts
//
// Spec R9 (audit G05, G08, G11, G12, B11): which stored body-mass entry is "the" body mass, which
// is "the" body fat, whether a new mass looks like a typing slip, and the nutrition input built
// from them. Pure; one copy for the Targets screen, the export summary, the lifecycle test and the
// chart (rule 2).
//
// Units: mass [kg], body fat [% of body mass], dates LocalDate in the profile's zone, instants
// [ms] epoch UTC. No health coefficient lives here (AGENTS rule 1): the one number,
// BODY_MASS_PLAUSIBLE_FRACTION, is spec R4's data-entry sanity bound.
import { compareLocalDate } from './dates';
import type { NutritionInput } from './nutrition';
import { weeklyQuota } from './schedule/quota';
import type { AppState, BodyMassEntry, Kg, LocalDate, Profile } from './types';

/**
 * Dimensionless. A new body mass more than this fraction away from the reference is asked about
 * once (spec R4: "body mass (> 10 % from last) asks once inline"). A data-entry sanity bound, not a
 * physiological limit: 18 typed for 180 is a 90 % slip, a real day-to-day change is far below it.
 */
export const BODY_MASS_PLAUSIBLE_FRACTION = 0.1;

/**
 * True when `massKg` differs from `referenceKg` by more than BODY_MASS_PLAUSIBLE_FRACTION of the
 * reference. Exactly 10 % is not questioned. No reference (first weigh-in) is never questioned.
 *
 * @param massKg [kg] the mass about to be stored
 * @param referenceKg [kg] the latest trend mass, else the profile baseline; null for none
 */
export function implausibleMass(massKg: Kg, referenceKg: Kg | null): boolean {
  if (referenceKg === null || !(referenceKg > 0) || !(massKg > 0)) return false;
  return Math.abs(massKg - referenceKg) > BODY_MASS_PLAUSIBLE_FRACTION * referenceKg;
}

/**
 * Rank of an entry for the daily trend point, lower wins; null = never a trend point.
 * `post` is dehydrated by design (that is what the 2 % check measures, audit G12), so it never
 * stands for the body mass. A morning reading beats an untagged one (every entry written before
 * roles existed), which beats a pre-session one.
 */
function trendRank(e: BodyMassEntry): number | null {
  if (e.role === 'post') return null;
  if (e.role === 'morning') return 0;
  if (e.role === 'pre') return 2;
  return 1;
}

/**
 * One trend point per civil date, ascending by date (audit G12: the chart and every reader of "the"
 * body mass use one role per day, so pre/post pairs no longer plot as vertical spikes). Within a
 * date the best rank wins, then the latest `loggedAt` (a re-typed weigh-in corrects the first).
 * Returns the stored objects themselves.
 */
export function trendEntries(list: readonly BodyMassEntry[]): BodyMassEntry[] {
  const best = new Map<LocalDate, BodyMassEntry>();
  for (const e of list) {
    const rank = trendRank(e);
    if (rank === null) continue;
    const current = best.get(e.date);
    const currentRank = current === undefined ? null : trendRank(current);
    if (
      current === undefined ||
      currentRank === null ||
      rank < currentRank ||
      (rank === currentRank && e.loggedAt > current.loggedAt)
    ) {
      best.set(e.date, e);
    }
  }
  return [...best.values()].sort((a, b) => compareLocalDate(a.date, b.date));
}

/** The newest trend point, or null. The stored object, so a store selector stays stable. */
export function latestTrendEntry(list: readonly BodyMassEntry[]): BodyMassEntry | null {
  return trendEntries(list).at(-1) ?? null;
}

/**
 * The body mass every reader means by "the latest weigh-in": targets, the L7 target-reached test,
 * the plausibility reference. Newest trend point (never a post-session mass), or null.
 */
export function latestBodyMassEntry(state: AppState, profileId: string): BodyMassEntry | null {
  return latestTrendEntry(state.bodyMass[profileId] ?? []);
}

/**
 * The newest entry that carries a body-fat percentage (audit G05, ROADMAP L10): by civil date,
 * then `loggedAt`. Null when none does, and the profile baseline then stands.
 */
export function latestBodyFatEntry(state: AppState, profileId: string): BodyMassEntry | null {
  let best: BodyMassEntry | null = null;
  for (const e of state.bodyMass[profileId] ?? []) {
    if (e.bodyFatPct === null) continue;
    if (best === null) {
      best = e;
      continue;
    }
    const byDate = compareLocalDate(e.date, best.date);
    if (byDate > 0 || (byDate === 0 && e.loggedAt > best.loggedAt)) best = e;
  }
  return best;
}

/**
 * The nutrition input from stored state. The newest trend mass and the newest body-fat entry win
 * over the profile baseline: the content review section 1 instruction is to recompute the target
 * at each re-measure, not to hard-code it.
 *
 * `latestBodyFat` defaults to `latest`, which is the pairing every caller made before body fat
 * could be re-measured on its own (audit G05). Residual limitation, stated: between re-measures
 * the body-fat PERCENTAGE is held, so a mass change is split between fat and fat-free mass in the
 * last measured proportion; no source in this project supports a different split.
 *
 * @param sessionsPerWeek [sessions/week], quoted in the basis text only (nutrition.ts NOTE-FREQ)
 * @param todayIso the civil date in the profile's zone; age = its year - birth year
 */
export function nutritionInputFor(
  profile: Profile,
  latest: BodyMassEntry | null,
  sessionsPerWeek: number,
  todayIso: LocalDate,
  latestBodyFat: BodyMassEntry | null = latest,
): NutritionInput {
  const massKg = latest?.massKg ?? profile.body.baselineMassKg; // [kg]
  const bodyFatPct = latestBodyFat?.bodyFatPct ?? profile.body.baselineBodyFatPct; // [%] or null
  // Age as (current year - birth year): the age reached this calendar year. Before the birthday
  // it runs up to one year high, which understates Mifflin-St Jeor RMR by at most 5 kcal/day
  // (its -5 kcal/day per year term); collecting a birth date would remove it and is not worth it.
  const ageYears = Number(todayIso.slice(0, 4)) - profile.body.birthYear; // [year]
  return {
    sex: profile.body.sex,
    ageYears,
    heightCm: profile.body.heightCm, // [cm]
    massKg,
    bodyFatPct,
    activity: profile.activity,
    // Brief G: the PAL wins over `activity`'s band floor when it is a number.
    activityPal: profile.activityPal ?? null,
    goal: profile.goal.kind,
    sessionsPerWeek,
    creatine: profile.supplements.creatine,
  };
}

/**
 * The same input from a whole document (audit B11): the export summary and the Targets screen
 * now read one derivation. Null for an unknown profile.
 */
export function nutritionInputForState(
  state: AppState,
  profileId: string,
  todayIso: LocalDate,
): NutritionInput | null {
  const profile = state.profiles[profileId];
  if (profile === undefined) return null;
  return nutritionInputFor(
    profile,
    latestBodyMassEntry(state, profileId),
    weeklyQuota(state, profileId), // [sessions/week]
    todayIso,
    latestBodyFatEntry(state, profileId),
  );
}

/** Where the projected-mass line starts (audit G11): a civil date and a mass. */
export interface ProjectionAnchor {
  date: LocalDate;
  massKg: Kg; // [kg]
}

/**
 * The projection starts at the current programme's start (`from`, the cursor's `startedOn`) at the
 * mass measured then: the latest of the baseline and the trend points dated on or before `from`
 * (a trend point wins a tie with the baseline), else the earliest of them. So a finished cut no
 * longer redraws today's goal back over the months of loss (audit G11).
 */
export function projectionAnchor(
  trend: readonly BodyMassEntry[],
  from: LocalDate,
  baseline: ProjectionAnchor,
): ProjectionAnchor {
  // Stable sort: on a shared date the baseline stays first, so the trend point after it wins.
  const candidates: ProjectionAnchor[] = [
    baseline,
    ...trend.map((e) => ({ date: e.date, massKg: e.massKg })),
  ].sort((a, b) => compareLocalDate(a.date, b.date));
  let chosen: ProjectionAnchor = candidates[0] ?? baseline;
  for (const c of candidates) {
    if (compareLocalDate(c.date, from) <= 0) chosen = c;
  }
  return { date: from, massKg: chosen.massKg }; // [kg]
}
```

- [ ] **Step 5: Selectors read it**

In `src/store/selectors.ts`:
- Delete the whole `latestBodyMassEntry` function with its doc comment ("Newest body-mass entry by civil date, ...") and the whole `nutritionInputFor` function with its doc comment ("Assemble the nutrition input from stored state. ..."), and put in their place:
```ts
/*
 * Spec R9 / audit B11: "the" body mass (the newest trend point, never a post-session mass), "the"
 * body fat (the newest entry carrying one) and the nutrition input built from them live in
 * src/domain/measurements.ts, so the export summary reads the same derivation. Re-exported here
 * for the callers that already import them from the store.
 */
export { latestBodyFatEntry, latestBodyMassEntry, nutritionInputFor } from '../domain/measurements';
```
- Imports: remove `AppState` and `BodyMassEntry` from the `import type { ... } from '../domain/types'` list; change `import type { NutritionInput, NutritionTargets } from '../domain/nutrition';` to `import type { NutritionTargets } from '../domain/nutrition';`; change `import { compareLocalDate, todayLocal } from '../domain/dates';` to `import { todayLocal } from '../domain/dates';` and add `import { latestBodyFatEntry, latestBodyMassEntry, nutritionInputFor } from '../domain/measurements';`.
- In `useNutritionTargets`, after the `const latest = useAppStore(...)` statement add
```ts
  // Audit G05: the newest body-fat entry, which a later mass without one no longer hides.
  const latestBodyFat = useAppStore((s) =>
    s.activeProfileId === null ? null : latestBodyFatEntry(s, s.activeProfileId),
  );
```
and replace the memo with
```ts
  return useMemo(() => {
    if (profile === null || todayIso === null) return null;
    const input = nutritionInputFor(profile, latest, sessionsPerWeek, todayIso, latestBodyFat);
    if (!isInDomain(input)) return null;
    return computeTargets(input);
  }, [profile, latest, latestBodyFat, sessionsPerWeek, todayIso]);
```

- [ ] **Step 6: The export summary (B11)**

In `src/domain/export/summary.ts`:
- Replace
```ts
  const massLog = state.bodyMass[profileId] ?? [];
  const latestMassKg: Kg = massLog.at(-1)?.massKg ?? profile.body.baselineMassKg; // [kg]
```
with
```ts
  const massLog = state.bodyMass[profileId] ?? [];
  // Spec R9 / audit G12: one trend point per day, never a post-session mass (measurements.ts).
  const trend = trendEntries(massLog);
  const latestMassKg: Kg = trend.at(-1)?.massKg ?? profile.body.baselineMassKg; // [kg]
```
- Delete the line `  const availability = state.availability[profileId] ?? null;` (its only reader is the block replaced next).
- Replace the whole `const input: NutritionInput = { ... };` statement with
```ts
  // Audit B11: the same derivation the Targets screen reads (newest trend mass, newest body-fat
  // entry, the PAL), so a printed export and the screen cannot state two different targets.
  const input = nutritionInputForState(state, profileId, today);
```
and the following `  if (!isInDomain(input)) {` with `  if (input === null || !isInDomain(input)) {`.
- In the BODY MASS block replace
```ts
    for (const entry of massLog) {
      lines.push(`  ${entry.date}   ${formatMass(entry.massKg, units)}`);
    }
    const first = massLog[0];
    if (first !== undefined && massLog.length > 1) {
```
with
```ts
    for (const entry of massLog) {
      // The role, when one was recorded (spec R9), so a pre/post pair reads as one.
      const role = entry.role === undefined ? '' : `   ${entry.role}`;
      lines.push(`  ${entry.date}   ${formatMass(entry.massKg, units)}${role}`);
    }
    const first = trend[0];
    if (first !== undefined && trend.length > 1) {
```
- Imports: delete `import type { NutritionInput } from '../nutrition';` and add `import { nutritionInputForState, trendEntries } from '../measurements';`.

- [ ] **Step 7: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit` then `npx vitest run --maxWorkers=1 src/domain src/store/profile.test.ts src/ui/views/LogView.test.tsx`
Expected: no type errors; PASS (the round-trip property in `src/domain/schema.test.ts` now generates roles; `schemaInfersAppState` holds because `role` is `?: ... | undefined` on both sides). Prototyped against the pre-P1 tree: `measurements.test.ts` 10 passed, `schema.test.ts` and `summary.test.ts` passed.

- [ ] **Step 8: Commit**

```bash
git add -- src/domain/types.ts src/domain/schema.ts src/domain/arbitraries.ts src/domain/measurements.ts src/domain/measurements.test.ts src/store/selectors.ts src/domain/export/summary.ts src/domain/export/summary.test.ts
git commit -m "feat(measurements): body-mass role, one trend point per day, newest body fat, one nutrition input (R9, G05, G12, B11)"
```

---

### Task 2: The fluid-loss pair by role (G01)

**Files:**
- Modify: `src/domain/training/hydration.ts` (`preSessionMass`; new `postSessionMass`; the two `has...SessionMass` lines in `hydrationCue`)
- Test: `src/domain/training/hydration.test.ts` (import list; append one describe)

**Interfaces:**
- Consumes: `BodyMassEntry.role` (Task 1).
- Produces: `preSessionMass(masses: readonly BodyMassEntry[], startedAt: EpochMs, endedAt?: EpochMs | null): BodyMassEntry | null` (third argument new, default null); `postSessionMass(masses: readonly BodyMassEntry[], startedAt: EpochMs, completedAt: EpochMs): BodyMassEntry | null`.

Design (G01): Start stamps `startedAt` before Train renders the weigh-in field, so "logged at or before startedAt" refused every pre mass the field stored and the 2 % check never fired. A `pre`-tagged entry now counts from 6 h before Start until the session ends; untagged and `morning` keep the old rule; `post` never counts as pre. The post half is a `post` entry after Start, or an untagged entry after completion. Sawka 2007's threshold and the 6 h window are unchanged (rule 1). Existing `preSessionMass` tests pass unchanged (untagged rule identical).

- [ ] **Step 1: Write the failing test**

In `src/domain/training/hydration.test.ts` change the import tail `  hydrationCue,\n  preSessionMass,\n} from './hydration';` to include `postSessionMass,` between them, and append:
```ts
describe('the weigh-in pair by role (spec R9, audit G01)', () => {
  const startedAt = AT_1200_LOCAL; // [ms] epoch UTC, stamped by Today's Start tap
  const completedAt = startedAt + HOUR_MS; // [ms]
  const tagged = (id: string, massKg: number, loggedAt: EpochMs, role: BodyMassEntry['role']): BodyMassEntry => ({
    ...massEntry(id, massKg, loggedAt),
    role,
  });

  it('counts a pre-tagged mass logged AFTER Start, which the old rule refused', () => {
    const pre = tagged('pre', 80, startedAt + 30_000, 'pre'); // [kg], 30 s after Start
    expect(preSessionMass([pre], startedAt, null)?.id).toBe('pre');
    expect(preSessionMass([pre], startedAt, completedAt)?.id).toBe('pre');
    // An untagged mass at the same instant still does not count: it may be a mid-session reading.
    expect(preSessionMass([massEntry('x', 80, startedAt + 30_000)], startedAt)).toBeNull();
  });

  it('never takes a post mass as the pre mass, and prefers a tagged pre over an untagged one', () => {
    const post = tagged('post', 78, startedAt - MIN_MS, 'post');
    const untagged = massEntry('old', 81, startedAt - 2 * MIN_MS);
    const pre = tagged('pre', 80, startedAt + MIN_MS, 'pre');
    expect(preSessionMass([post], startedAt)).toBeNull();
    expect(preSessionMass([untagged, pre], startedAt, completedAt)?.id).toBe('pre');
  });

  it('refuses a pre mass logged after the session ended or outside the 6 h window', () => {
    expect(preSessionMass([tagged('late', 80, completedAt + 1, 'pre')], startedAt, completedAt)).toBeNull();
    expect(
      preSessionMass([tagged('stale', 80, startedAt - PRE_SESSION_MASS_WINDOW_MS - 1, 'pre')], startedAt, completedAt),
    ).toBeNull();
  });

  it('asks for the post mass after a pre mass logged in-session, then stops once a post mass exists', () => {
    const pre = tagged('pre', 80, startedAt + 30_000, 'pre');
    const state = (masses: BodyMassEntry[]): AppState =>
      makeState(
        {
          assignments: { [PROFILE_ID]: [completedSession(startedAt, completedAt)] },
          bodyMass: { [PROFILE_ID]: masses },
        },
        makeProfile({ weighInOptIn: true }),
      );
    expect(hydrationCue(state([pre]), PROFILE_ID, completedAt + MIN_MS, false)?.kind).toBe('post-session-weigh');
    // A post mass typed just before Finish counts as the post half.
    const post = tagged('post', 78, completedAt - MIN_MS, 'post');
    expect(postSessionMass([pre, post], startedAt, completedAt)?.id).toBe('post');
    expect(hydrationCue(state([pre, post]), PROFILE_ID, completedAt + MIN_MS, false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=1 src/domain/training/hydration.test.ts`
Expected: FAIL (`postSessionMass` is not exported; the in-session `pre` entry is refused).

- [ ] **Step 3: Implement**

In `src/domain/training/hydration.ts` replace the whole `preSessionMass` function and its doc comment (from `/**\n * The body-mass entry that counts as this session's PRE-session mass, or null.` to the closing `}` before `/**\n * The most recent drink mark of the day`) with:
```ts
/**
 * The body-mass entry that counts as this session's PRE-session mass, or null.
 *
 * Spec R9 / audit G01: by ROLE first. An entry the user tagged `pre` counts when it was logged
 * no more than PRE_SESSION_MASS_WINDOW_MS before the session started and no later than the
 * session ended (`endedAt`, null while it is open): Today's Start tap stamps `startedAt` before
 * Train can show the field, so the old "logged at or before startedAt" rule refused every mass
 * the field ever stored and the 2 % check could never fire. An untagged or `morning` entry keeps
 * the old rule (logged within the window at or before `startedAt`). A `post` entry never counts.
 * A tagged `pre` entry wins over an untagged one; ties go to the latest `loggedAt`, never to
 * array position (the store sorts bodyMass by civil DATE only).
 *
 * Exported because the Train view needs exactly the reference the post-session cue's own guard
 * uses: the > 2 % comparison is meaningful only against the mass this session started from.
 *
 * @param startedAt [ms] epoch UTC, the session's start
 * @param endedAt [ms] epoch UTC, the session's completion, or null while it is open
 */
export function preSessionMass(
  masses: readonly BodyMassEntry[],
  startedAt: EpochMs,
  endedAt: EpochMs | null = null,
): BodyMassEntry | null {
  let best: BodyMassEntry | null = null;
  const tagged = (e: BodyMassEntry): boolean => e.role === 'pre';
  for (const entry of masses) {
    const { loggedAt } = entry; // [ms] epoch UTC
    if (entry.role === 'post') continue;
    if (startedAt - loggedAt > PRE_SESSION_MASS_WINDOW_MS) continue; // too stale to compare
    if (tagged(entry)) {
      if (endedAt !== null && loggedAt > endedAt) continue; // after the session: not its start
    } else if (loggedAt > startedAt) {
      continue; // untagged and after the session began: not a pre-session mass
    }
    if (
      best === null ||
      (tagged(entry) && !tagged(best)) ||
      (tagged(entry) === tagged(best) && loggedAt > best.loggedAt)
    ) {
      best = entry;
    }
  }
  return best;
}

/**
 * The body-mass entry that counts as this session's POST-session mass, or null (spec R9, G01).
 * A `post` entry logged after the session started (the user may weigh in before tapping Finish),
 * or an untagged one logged at or after `completedAt`. A `pre` or `morning` entry never counts.
 * The latest by `loggedAt`.
 *
 * @param startedAt [ms] epoch UTC
 * @param completedAt [ms] epoch UTC
 */
export function postSessionMass(
  masses: readonly BodyMassEntry[],
  startedAt: EpochMs,
  completedAt: EpochMs,
): BodyMassEntry | null {
  let best: BodyMassEntry | null = null;
  for (const entry of masses) {
    const counts =
      entry.role === 'post'
        ? entry.loggedAt >= startedAt
        : entry.role === undefined && entry.loggedAt >= completedAt;
    if (counts && (best === null || entry.loggedAt > best.loggedAt)) best = entry;
  }
  return best;
}

```
In `hydrationCue`, replace
```ts
    const hasPreSessionMass = preSessionMass(masses, startedAt) !== null;
    const hasPostSessionMass = masses.some((b) => b.loggedAt >= completedAt);
```
with
```ts
    const hasPreSessionMass = preSessionMass(masses, startedAt, completedAt) !== null;
    const hasPostSessionMass = postSessionMass(masses, startedAt, completedAt) !== null;
```

- [ ] **Step 4: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit` then `npx vitest run --maxWorkers=1 src/domain/training src/ui/views/TrainView.test.tsx src/ui/views/train`
Expected: PASS (prototyped: `hydration.test.ts` 40 passed). The file-text test in `hydration.test.ts` ("no fixed volume is prescribed") reads this file: add no volume figure to the comments.

- [ ] **Step 5: Commit**

```bash
git add -- src/domain/training/hydration.ts src/domain/training/hydration.test.ts
git commit -m "fix(hydration): pre/post weigh-ins counted by role, so the 2 % fluid-loss check can fire (G01)"
```

---

### Task 3: Store actions to correct, delete and restore a body mass, and to take back a drink

**Files:**
- Create: `src/store/measurements.ts`, `src/store/measurements.test.ts`
- Modify: `src/store/index.ts` (imports; `AppActions` after `logBodyMass`; the `logBodyMass` implementation; four new implementations after it)

**Interfaces:**
- Consumes: `parseOrThrow` from `src/store/validate.ts` (P1 Task 9), `requireProfile` from `src/store/scheduleActions.ts`, `BodyMassRole` (Task 1).
- Produces:
  - `interface BodyMassEdit { massKg: Kg; enteredUnit: UnitSystem; bodyFatPct: number | null; role: BodyMassRole | null }` (null role = untagged) in `src/store/measurements.ts`, re-exported from `src/store/index.ts`.
  - Pure: `applyUpdateBodyMass(state, profileId, id, edit): AppState`, `applyDeleteBodyMass(state, profileId, id): { next: AppState; removed: BodyMassEntry | null }`, `applyRestoreBodyMass(state, entry): AppState`, `applyRemoveDrink(state, profileId, date, volumeML, at): AppState`.
  - Store: `logBodyMass(e, now): string` (now returns the new id; was `void`), `updateBodyMass(profileId: string, id: string, edit: BodyMassEdit): void`, `deleteBodyMass(profileId: string, id: string): BodyMassEntry | null`, `restoreBodyMass(entry: BodyMassEntry): void`, `removeDrink(profileId: string, date: LocalDate, volumeML: ML, at: EpochMs): void`.

Design (G03, G07 undo): an edit keeps the entry's id, date and `loggedAt` (the instant it was measured) and changes the measurement, its unit, its body fat and its role; it is parsed with the loader's schema and throws on refusal (spec R5). Delete returns the removed record; the view holds it in its undo toast and `restoreBodyMass` puts the identical record back (idempotent by id). `removeDrink` takes one drink back by its instant (idempotent: a mark already gone changes nothing). Rejected: an undo buffer in the session slice (mirror schema change for a 6 s offer).

- [ ] **Step 1: Write the failing test**

Create `src/store/measurements.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultState, useAppStore } from './index';
import { installFakeStorage } from './testStorage';
import { makeProfile } from '../test/fixtures';

const P = 'profile-1';
const NOW = Date.UTC(2026, 8, 7, 12, 0); // [ms] epoch UTC

beforeEach(() => {
  installFakeStorage();
  useAppStore.setState({
    ...defaultState(),
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
  useAppStore.getState().createProfile(makeProfile());
});

function log(massKg: number, role?: 'morning' | 'pre' | 'post'): string {
  return useAppStore.getState().logBodyMass(
    { profileId: P, date: '2026-09-07', massKg, enteredUnit: 'metric', bodyFatPct: null, ...(role === undefined ? {} : { role }) },
    NOW,
  );
}

describe('body-mass corrections (spec R9, audit G03)', () => {
  it('logBodyMass returns the stored id', () => {
    const id = log(80);
    expect(useAppStore.getState().bodyMass[P]?.map((e) => e.id)).toEqual([id]);
  });

  it('edits the measurement and role in place, keeping id, date and loggedAt', () => {
    const id = log(18); // [kg] the typo
    useAppStore.getState().updateBodyMass(P, id, { massKg: 81.6, enteredUnit: 'metric', bodyFatPct: null, role: 'morning' });
    expect(useAppStore.getState().bodyMass[P]).toEqual([
      { id, profileId: P, date: '2026-09-07', massKg: 81.6, enteredUnit: 'metric', bodyFatPct: null, loggedAt: NOW, role: 'morning' },
    ]);
  });

  it('removes the role when the edit says untagged', () => {
    const id = log(80, 'pre');
    useAppStore.getState().updateBodyMass(P, id, { massKg: 80, enteredUnit: 'metric', bodyFatPct: null, role: null });
    expect(useAppStore.getState().bodyMass[P]?.[0]).not.toHaveProperty('role');
  });

  it('refuses an edit the loader would refuse, and an unknown id, writing nothing', () => {
    const id = log(80);
    const before = useAppStore.getState().bodyMass;
    expect(() =>
      useAppStore.getState().updateBodyMass(P, id, { massKg: 600, enteredUnit: 'metric', bodyFatPct: null, role: null }),
    ).toThrow(/updateBodyMass: massKg/);
    expect(() =>
      useAppStore.getState().updateBodyMass(P, 'nope', { massKg: 80, enteredUnit: 'metric', bodyFatPct: null, role: null }),
    ).toThrow(/updateBodyMass: no body-mass entry/);
    expect(useAppStore.getState().bodyMass).toBe(before);
  });

  it('deletes and restores the identical record', () => {
    const a = log(80);
    const b = log(81);
    const removed = useAppStore.getState().deleteBodyMass(P, a);
    expect(useAppStore.getState().bodyMass[P]?.map((e) => e.id)).toEqual([b]);
    expect(removed?.id).toBe(a);
    if (removed === null) throw new Error('nothing removed');
    useAppStore.getState().restoreBodyMass(removed);
    useAppStore.getState().restoreBodyMass(removed); // idempotent
    expect(useAppStore.getState().bodyMass[P]?.map((e) => e.id).sort()).toEqual([a, b].sort());
    expect(useAppStore.getState().deleteBodyMass(P, 'nope')).toBeNull();
  });
});

describe('taking back a drink (audit G07)', () => {
  it('subtracts the volume and removes that one mark, once', () => {
    const s = useAppStore.getState();
    s.addHydration(P, '2026-09-07', 250, NOW); // [mL]
    s.addHydration(P, '2026-09-07', 250, NOW + 1); // [mL]
    useAppStore.getState().removeDrink(P, '2026-09-07', 250, NOW + 1);
    useAppStore.getState().removeDrink(P, '2026-09-07', 250, NOW + 1); // already gone
    expect(useAppStore.getState().hydration[P]).toEqual([
      { profileId: P, date: '2026-09-07', volumeML: 250, marks: [NOW] },
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=1 src/store/measurements.test.ts`
Expected: FAIL (`logBodyMass` returns undefined; `updateBodyMass is not a function`).

- [ ] **Step 3: The pure transformers**

Create `src/store/measurements.ts`:
```ts
// src/store/measurements.ts
//
// Pure AppState transformers for correcting measurements (spec R9, audit G03, G07). No React, no
// I/O. Every write is parsed with the loader's schema (spec R5), so a refusal throws before the
// store's set() and writes nothing. Units: mass [kg], volume [mL], instants [ms] epoch UTC.
import { compareLocalDate } from '../domain/dates';
import { BodyMassEntrySchema, HydrationEntrySchema } from '../domain/schema';
import type {
  AppState,
  BodyMassEntry,
  BodyMassRole,
  EpochMs,
  Kg,
  LocalDate,
  ML,
  UnitSystem,
} from '../domain/types';
import { requireProfile } from './scheduleActions';
import { parseOrThrow } from './validate';

/** What an edit may change. `role: null` stores the entry untagged. */
export interface BodyMassEdit {
  massKg: Kg; // [kg] canonical
  enteredUnit: UnitSystem;
  bodyFatPct: number | null; // [%] of body mass, or null
  role: BodyMassRole | null;
}

/** Civil-date order, which every reader of bodyMass may assume (stable: a day keeps its order). */
function byDate(list: readonly BodyMassEntry[]): BodyMassEntry[] {
  return [...list].sort((a, b) => compareLocalDate(a.date, b.date));
}

/**
 * Rewrites one entry's measurement in place. The id, the civil date and `loggedAt` (when it was
 * measured) are the record's identity and are kept. Throws on an unknown id or a refused value.
 */
export function applyUpdateBodyMass(
  state: AppState,
  profileId: string,
  id: string,
  edit: BodyMassEdit,
): AppState {
  requireProfile(state, 'updateBodyMass', profileId);
  const list = state.bodyMass[profileId] ?? [];
  const current = list.find((e) => e.id === id);
  if (current === undefined) {
    throw new Error(`updateBodyMass: no body-mass entry "${id}"; it may have been deleted`);
  }
  const candidate: BodyMassEntry = {
    ...current,
    massKg: edit.massKg, // [kg]
    enteredUnit: edit.enteredUnit,
    bodyFatPct: edit.bodyFatPct, // [%] or null
  };
  if (edit.role === null) delete candidate.role;
  else candidate.role = edit.role;
  const stored = parseOrThrow(BodyMassEntrySchema, candidate, 'updateBodyMass');
  return {
    ...state,
    bodyMass: { ...state.bodyMass, [profileId]: list.map((e) => (e === current ? stored : e)) },
  };
}

/** Removes one entry and hands it back for the undo offer; identity unchanged for an unknown id. */
export function applyDeleteBodyMass(
  state: AppState,
  profileId: string,
  id: string,
): { next: AppState; removed: BodyMassEntry | null } {
  const list = state.bodyMass[profileId] ?? [];
  const removed = list.find((e) => e.id === id) ?? null;
  if (removed === null) return { next: state, removed: null };
  return {
    next: { ...state, bodyMass: { ...state.bodyMass, [profileId]: list.filter((e) => e !== removed) } },
    removed,
  };
}

/** Puts a deleted entry back exactly as it was. A no-op when its id is already stored. */
export function applyRestoreBodyMass(state: AppState, entry: BodyMassEntry): AppState {
  requireProfile(state, 'restoreBodyMass', entry.profileId);
  const list = state.bodyMass[entry.profileId] ?? [];
  if (list.some((e) => e.id === entry.id)) return state;
  const stored = parseOrThrow(BodyMassEntrySchema, entry, 'restoreBodyMass');
  return { ...state, bodyMass: { ...state.bodyMass, [entry.profileId]: byDate([...list, stored]) } };
}

/**
 * Takes back one drink: subtracts its volume (floored at 0) and removes the mark logged at `at`.
 * Idempotent: a mark that is no longer there changes nothing, so a second undo tap is harmless.
 *
 * @param volumeML [mL] the volume that drink added
 * @param at [ms] epoch UTC, the instant addHydration recorded for it
 */
export function applyRemoveDrink(
  state: AppState,
  profileId: string,
  date: LocalDate,
  volumeML: ML,
  at: EpochMs,
): AppState {
  const list = state.hydration[profileId] ?? [];
  const current = list.find((e) => e.date === date);
  if (current === undefined) return state;
  const index = current.marks.indexOf(at);
  if (index < 0) return state;
  const candidate = {
    ...current,
    volumeML: Math.max(0, current.volumeML - volumeML), // [mL] cumulative for the day
    marks: current.marks.filter((_, k) => k !== index), // [ms] epoch UTC
  };
  const stored = parseOrThrow(HydrationEntrySchema, candidate, 'removeDrink');
  return {
    ...state,
    hydration: { ...state.hydration, [profileId]: list.map((e) => (e === current ? stored : e)) },
  };
}
```

- [ ] **Step 4: Wire the store**

In `src/store/index.ts`:
- Add to the type import list from `'../domain/types'` nothing new (BodyMassEntry, EpochMs, LocalDate, ML are already there) and add:
```ts
import {
  applyDeleteBodyMass,
  applyRemoveDrink,
  applyRestoreBodyMass,
  applyUpdateBodyMass,
  type BodyMassEdit,
} from './measurements';
```
- In `AppActions`, replace
```ts
  /** @param now [ms] epoch UTC, the instant the weigh-in was entered. */
  logBodyMass(e: Omit<BodyMassEntry, 'id' | 'loggedAt'>, now: EpochMs): void;
```
with
```ts
  /**
   * Stores one weigh-in and returns its id, so the view can offer an edit or an undo at once.
   * Throws on a value the loader would refuse (spec R5).
   *
   * @param now [ms] epoch UTC, the instant the weigh-in was entered.
   */
  logBodyMass(e: Omit<BodyMassEntry, 'id' | 'loggedAt'>, now: EpochMs): string;
  /**
   * Spec R9 / audit G03: corrects one weigh-in in place (mass, unit, body fat, role); id, date and
   * loggedAt are kept. Throws, writing nothing, on an unknown id or a refused value.
   */
  updateBodyMass(profileId: string, id: string, edit: BodyMassEdit): void;
  /** Removes one weigh-in and returns it for the undo offer; null (no write) for an unknown id. */
  deleteBodyMass(profileId: string, id: string): BodyMassEntry | null;
  /** Puts back a weigh-in `deleteBodyMass` returned, exactly; a no-op when it is already there. */
  restoreBodyMass(entry: BodyMassEntry): void;
  /**
   * Audit G07: takes back one drink by the instant addHydration recorded for it. Idempotent.
   *
   * @param volumeML [mL] @param at [ms] epoch UTC
   */
  removeDrink(profileId: string, date: LocalDate, volumeML: ML, at: EpochMs): void;
```
- Replace the implementation
```ts
  logBodyMass(entry: Omit<BodyMassEntry, 'id' | 'loggedAt'>, now: EpochMs): void {
    set((s) => applyLogBodyMass(s, entry, newId(), now)); // now: [ms] epoch, UTC
  },
```
with
```ts
  logBodyMass(entry: Omit<BodyMassEntry, 'id' | 'loggedAt'>, now: EpochMs): string {
    // Minted before the write so it can be returned (same pattern as logSet).
    const id = newId();
    set((s) => applyLogBodyMass(s, entry, id, now)); // now: [ms] epoch, UTC
    return id;
  },

  updateBodyMass(profileId: string, id: string, edit: BodyMassEdit): void {
    set((s) => applyUpdateBodyMass(s, profileId, id, edit));
  },

  deleteBodyMass(profileId: string, id: string): BodyMassEntry | null {
    const { next, removed } = applyDeleteBodyMass(get(), profileId, id);
    // Identity kept for an unknown id: no persisted field changed, so no write.
    if (removed !== null) set({ bodyMass: next.bodyMass });
    return removed;
  },

  restoreBodyMass(entry: BodyMassEntry): void {
    set((s) => applyRestoreBodyMass(s, entry));
  },

  removeDrink(profileId: string, date: LocalDate, volumeML: ML, at: EpochMs): void {
    set((s) => applyRemoveDrink(s, profileId, date, volumeML, at)); // [mL], [ms] epoch UTC
  },
```
- At the bottom, next to `export { defaultState };`, add `export type { BodyMassEdit } from './measurements';`.

- [ ] **Step 5: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit` then `npx vitest run --maxWorkers=1 src/store src/ui/views/train`
Expected: PASS. (`grep -rn "Object.keys(useAppStore.getState())" src` found no test that enumerates the actions.)

- [ ] **Step 6: Commit**

```bash
git add -- src/store/measurements.ts src/store/measurements.test.ts src/store/index.ts
git commit -m "feat(store): correct, delete and restore a weigh-in; take back a drink (R9, G03, G07)"
```

---

### Task 4: One copy of the profile field rules (wizard and Settings), and the measurement bound in words

**Files:**
- Create: `src/ui/setup/fieldRules.ts`, `src/ui/setup/fieldRules.test.ts`
- Modify: `src/ui/setup/SetupWizard.tsx` (the `UNIT` / `CM_PER_*` / `INCHES_PER_FOOT` constants; `round1` through `HEIGHT_BOUND_IN`; `requiredInRange` through `massDomainError`; the `heightCm` memo; `ageError` and `heightError`; the `KG_PER_LB` import; one new import)

**Interfaces:**
- Consumes: `MAX_MASS_KG` (Task 1); `parseDecimal` (`UnitInput.tsx`, comma-aware since P1 Task 13).
- Produces (`src/ui/setup/fieldRules.ts`): `UNIT`, `CM_PER_INCH`, `CM_PER_METRE`, `INCHES_PER_FOOT`, `interface Bound { lo: number; hi: number }`, `round1(v)`, `inwardBound(b)`, `massBoundInDisplayUnit(kgBound: Bound, units): Bound`, `HEIGHT_BOUND_IN`, `requiredInRange(quantity, text, bound, overrides, unit?)`, `requiredIntegerInRange(quantity, text, bound, overrides, unit?)`, `massDomainError(quantity, text, units, overrides)`, `heightCmFromParts(units, parts: { m: string; cm: string; ft: string; inch: string }): number | null` [cm], `ageYearsError(ageYears: number | null, overrides)`, `heightCmError(heightCm: number | null, units, overrides)`, `bodyMassEntryError(quantity, text, units, overrides): string | null`, `birthYearBound(todayIso: LocalDate): Bound` [year]. Every function returns the message string or null.

Design (G06 prerequisite, G08): the module-level helpers move out of the 4,000-line wizard VERBATIM, and the wizard's inline age and height checks become the two named functions, so the Settings editor (Task 9) and the wizard cannot drift (rule 2). `bodyMassEntryError` is the loader's bound (0, 500] kg in words; the wizard's NUTRITION_DOMAIN bound stays for setup. No behaviour of the wizard changes; its suite is the regression gate. If P3 has already moved any of these helpers, import them from where P3 put them instead of creating a second copy.

- [ ] **Step 1: Write the failing test**

Create `src/ui/setup/fieldRules.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FORMAT, copy } from '../../content/copy';
import { NUTRITION_DOMAIN } from '../../domain/nutrition';
import {
  ageYearsError,
  birthYearBound,
  bodyMassEntryError,
  heightCmError,
  heightCmFromParts,
} from './fieldRules';

const NONE = {};

describe('bodyMassEntryError (audit G08: the loader bound, in words)', () => {
  it('names what is wrong instead of refusing in silence', () => {
    const q = copy('quantity.bodyMass');
    expect(bodyMassEntryError(q, '', 'metric', NONE)).toBe(copy('error.valueRequired'));
    expect(bodyMassEntryError(q, 'abc', 'metric', NONE)).toBe(copy('error.valueRequired'));
    expect(bodyMassEntryError(q, '0', 'metric', NONE)).toBe(copy('error.positive'));
    expect(bodyMassEntryError(q, '-5', 'metric', NONE)).toBe(copy('error.positive'));
    expect(bodyMassEntryError(q, '501', 'metric', NONE)).toBe(FORMAT.atMost(q, 500, 'kg'));
    // 1800 lb = 816 kg: the G08 throw. The bound is shown in lb, rounded inward (1102.31 -> 1102.3).
    expect(bodyMassEntryError(q, '1800', 'imperial', NONE)).toBe(FORMAT.atMost(q, 1102.3, 'lb'));
    expect(bodyMassEntryError(q, '80,5', 'metric', NONE)).toBeNull();
    expect(bodyMassEntryError(q, '18', 'imperial', NONE)).toBeNull(); // inside the bound; the plausibility question catches it
  });
});

describe('the wizard rules the profile editor shares (audit G06)', () => {
  it('bounds a birth year by the age domain this calendar year', () => {
    expect(birthYearBound('2026-11-04')).toEqual({
      lo: 2026 - NUTRITION_DOMAIN.ageYears.hi,
      hi: 2026 - NUTRITION_DOMAIN.ageYears.lo,
    });
  });

  it('checks age and height as the wizard does', () => {
    expect(ageYearsError(null, NONE)).toBe(copy('error.valueRequired'));
    expect(ageYearsError(30.5, NONE)).toBe(copy('error.wholeNumber'));
    expect(ageYearsError(17, NONE)).toBe(FORMAT.outOfRange(copy('quantity.age'), 18, 80, 'years'));
    expect(ageYearsError(30, NONE)).toBeNull();
    expect(heightCmError(119, 'metric', NONE)).toBe(FORMAT.outOfRange(copy('quantity.height'), 120, 230, 'cm'));
    expect(heightCmError(180, 'imperial', NONE)).toBeNull();
  });

  it('reads stature from its two fields in either unit system', () => {
    expect(heightCmFromParts('metric', { m: '1', cm: '80', ft: '', inch: '' })).toBe(180); // [cm]
    expect(heightCmFromParts('imperial', { m: '', cm: '', ft: '5', inch: '11' })).toBeCloseTo(180.34, 10); // [cm]
    expect(heightCmFromParts('metric', { m: '', cm: '', ft: '', inch: '' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=1 src/ui/setup/fieldRules.test.ts`
Expected: FAIL (`./fieldRules` does not exist).

- [ ] **Step 3: Create the module**

Create `src/ui/setup/fieldRules.ts`:
```ts
// src/ui/setup/fieldRules.ts
//
// The profile field rules the setup wizard checks, in one module so the Settings profile editor
// refuses exactly what setup refuses (spec R9, audit G06, AGENTS rule 2). Moved verbatim out of
// SetupWizard.tsx; the two wrappers at the bottom are the wizard's former inline age and height
// checks. Every bound is NUTRITION_DOMAIN's (src/domain/nutrition.ts); nothing here is new.
import { FORMAT, copy, type CopyKey } from '../../content/copy';
import { NUTRITION_DOMAIN } from '../../domain/nutrition';
import { MAX_MASS_KG } from '../../domain/schema';
import { KG_PER_LB, type LocalDate, type UnitSystem } from '../../domain/types';
import { massUnit, parseDecimal, storedMassKg } from '../components/UnitInput';

/*
 * Units, not copy: a unit label is part of the contract and never changes with a skin
 * (copy contract, "Numbers, units and quantity names are part of the contract"). The mass and
 * load labels come from UNIT_LABEL through UnitInput; these are the ones UNIT_LABEL does not
 * carry because they are the same in both unit systems.
 */
export const UNIT = { years: 'years', weeks: 'weeks', minutes: 'min', m: 'm', cm: 'cm', ft: 'ft', inch: 'in', pct: '%' };

export const CM_PER_INCH = 2.54; // [cm/in] exact by definition
export const CM_PER_METRE = 100; // [cm/m]
export const INCHES_PER_FOOT = 12; // [in/ft]

type Overrides = Readonly<Partial<Record<CopyKey, string>>>;

/** Round to 0.1 for a bound shown in a message. Display resolution only, never storage. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface Bound {
  lo: number;
  hi: number;
}

/**
 * A bound rounded INWARD to 0.1, for message text.
 *
 * Rounding to nearest prints a bound that is itself refused: the 30 kg floor is 66.1387 lb,
 * which rounds to 66.1 lb, and 66.1 lb converts back to 29.98 kg. Every endpoint this returns
 * converts to a value strictly inside the bound it came from, so a user who types the number
 * the message names is accepted.
 */
export function inwardBound(bound: Bound): Bound {
  return { lo: Math.ceil(bound.lo * 10) / 10, hi: Math.floor(bound.hi * 10) / 10 };
}

/**
 * A canonical kg bound expressed in the display unit, for message text only. The conversion is
 * the exact inverse of toStoredMass (1 lb = 0.45359237 kg exactly, master plan section 3), not
 * displayMass, because displayMass rounds to nearest and a message bound must round inward.
 */
export function massBoundInDisplayUnit(kgBound: Bound, units: UnitSystem): Bound {
  if (units === 'metric') return inwardBound(kgBound); // [kg]
  return inwardBound({ lo: kgBound.lo / KG_PER_LB, hi: kgBound.hi / KG_PER_LB }); // [lb]
}

/** The stature domain in inches, inward-rounded, for the imperial height message. */
export const HEIGHT_BOUND_IN: Bound = inwardBound({
  lo: NUTRITION_DOMAIN.heightCm.lo / CM_PER_INCH, // [in]
  hi: NUTRITION_DOMAIN.heightCm.hi / CM_PER_INCH, // [in]
});

/** Required numeric field: empty is an error, and so is a value outside the bound. */
export function requiredInRange(
  quantity: string,
  text: string,
  bound: Bound,
  overrides: Overrides,
  unit?: string,
): string | null {
  const value = parseDecimal(text);
  if (value === null) return copy('error.valueRequired', overrides);
  if (value < bound.lo || value > bound.hi) {
    return FORMAT.outOfRange(quantity, bound.lo, bound.hi, unit);
  }
  return null;
}

/**
 * Required whole-number count. `Math.round` is never applied to a user value: the schema stores
 * `birthYear`, `weeklySessionTarget` and the plan's `weeks` as `z.int()`, so a fraction is
 * refused here, visibly, rather than rounded into the document behind the user's back.
 */
export function requiredIntegerInRange(
  quantity: string,
  text: string,
  bound: Bound,
  overrides: Overrides,
  unit?: string,
): string | null {
  const value = parseDecimal(text);
  if (value === null) return copy('error.valueRequired', overrides);
  if (!Number.isInteger(value)) return copy('error.wholeNumber', overrides);
  if (value < bound.lo || value > bound.hi) {
    return FORMAT.outOfRange(quantity, bound.lo, bound.hi, unit);
  }
  return null;
}

/**
 * A body mass entered in the display unit, validated in CANONICAL kg after the exact conversion.
 *
 * This is not the same test as comparing the entered number against a rounded display bound, and
 * the difference is a crash: 66.1 lb clears a 66.1 lb floor, converts to 29.98 kg, and
 * computeTargets throws RangeError on it while Review renders (master plan section 6.3). The
 * rounded bound appears in the message text and nowhere else.
 */
export function massDomainError(
  quantity: string,
  text: string,
  units: UnitSystem,
  overrides: Overrides,
): string | null {
  const kg = storedMassKg(text, units); // [kg] exact
  if (kg === null) return copy('error.valueRequired', overrides);
  if (kg < NUTRITION_DOMAIN.massKg.lo || kg > NUTRITION_DOMAIN.massKg.hi) {
    const shown = massBoundInDisplayUnit(NUTRITION_DOMAIN.massKg, units); // [lb] or [kg]
    return FORMAT.outOfRange(quantity, shown.lo, shown.hi, massUnit(units));
  }
  return null;
}

/**
 * Stature from two whole-number fields, in both unit systems. Round 1 claims C1.07.20 and
 * C1.07.21: metres and centimetres, or feet and inches. Either field may be blank and counts as
 * zero, so 1 m 78 and 5 ft 0 both work; both blank is null, a missing entry rather than a zero.
 *
 * @returns [cm] exact, or null
 */
export function heightCmFromParts(
  units: UnitSystem,
  parts: { m: string; cm: string; ft: string; inch: string },
): number | null {
  if (units === 'metric') {
    const metres = parseDecimal(parts.m);
    const centimetres = parseDecimal(parts.cm);
    if (metres === null && centimetres === null) return null;
    return (metres ?? 0) * CM_PER_METRE + (centimetres ?? 0); // [cm]
  }
  const feet = parseDecimal(parts.ft);
  const inches = parseDecimal(parts.inch);
  if (feet === null && inches === null) return null;
  return ((feet ?? 0) * INCHES_PER_FOOT + (inches ?? 0)) * CM_PER_INCH; // [cm] exact
}

/** Age [years]: required, whole, inside NUTRITION_DOMAIN.ageYears. */
export function ageYearsError(ageYears: number | null, overrides: Overrides): string | null {
  if (ageYears === null) return copy('error.valueRequired', overrides);
  if (!Number.isInteger(ageYears)) return copy('error.wholeNumber', overrides);
  if (ageYears < NUTRITION_DOMAIN.ageYears.lo || ageYears > NUTRITION_DOMAIN.ageYears.hi) {
    return FORMAT.outOfRange(
      copy('quantity.age', overrides),
      NUTRITION_DOMAIN.ageYears.lo,
      NUTRITION_DOMAIN.ageYears.hi,
      UNIT.years,
    );
  }
  return null;
}

/** Height [cm]: required, inside NUTRITION_DOMAIN.heightCm; the message names the display unit. */
export function heightCmError(
  heightCm: number | null,
  units: UnitSystem,
  overrides: Overrides,
): string | null {
  if (heightCm === null) return copy('error.valueRequired', overrides);
  if (heightCm >= NUTRITION_DOMAIN.heightCm.lo && heightCm <= NUTRITION_DOMAIN.heightCm.hi) return null;
  return units === 'metric'
    ? FORMAT.outOfRange(
        copy('quantity.height', overrides),
        NUTRITION_DOMAIN.heightCm.lo,
        NUTRITION_DOMAIN.heightCm.hi,
        UNIT.cm,
      )
    : FORMAT.outOfRange(copy('quantity.height', overrides), HEIGHT_BOUND_IN.lo, HEIGHT_BOUND_IN.hi, UNIT.inch);
}

/**
 * A body mass typed into a MEASUREMENT field (spec R9, audit G08): the loader's own bound,
 * 0 < mass <= MAX_MASS_KG, stated in words in the display unit (inward-rounded, so the number the
 * message names is accepted). Wider than NUTRITION_DOMAIN on purpose: a mass the equations do not
 * cover is still a real measurement, and Targets names the field instead (G09). A slip inside the
 * bound is caught by the plausibility question (src/domain/measurements.ts).
 */
export function bodyMassEntryError(
  quantity: string,
  text: string,
  units: UnitSystem,
  overrides: Overrides,
): string | null {
  const kg = storedMassKg(text, units); // [kg] exact
  if (kg === null) return copy('error.valueRequired', overrides);
  if (!(kg > 0)) return copy('error.positive', overrides);
  if (kg > MAX_MASS_KG) {
    const shown = massBoundInDisplayUnit({ lo: 0, hi: MAX_MASS_KG }, units); // [kg] or [lb]
    return FORMAT.atMost(quantity, shown.hi, massUnit(units));
  }
  return null;
}

/**
 * [year] The birth years whose age THIS calendar year (the age nutritionInputFor computes) lies
 * inside NUTRITION_DOMAIN.ageYears. For the Settings editor, which stores the year directly.
 */
export function birthYearBound(todayIso: LocalDate): Bound {
  const year = Number(todayIso.slice(0, 4)); // [year]
  return { lo: year - NUTRITION_DOMAIN.ageYears.hi, hi: year - NUTRITION_DOMAIN.ageYears.lo };
}
```

- [ ] **Step 4: The wizard imports it**

In `src/ui/setup/SetupWizard.tsx`:
1. Replace the block from `/*\n * Units, not copy: a unit label is part of the contract` through `const INCHES_PER_FOOT = 12; // [in/ft]` (the `UNIT` object and the three length constants) with the single line
```ts
// UNIT, CM_PER_INCH, CM_PER_METRE and INCHES_PER_FOOT live in ./fieldRules (spec R9, rule 2).
```
(Keep `const SECONDS_PER_MINUTE = 60;` and everything after it.)
2. Delete from `/** Round to 0.1 for a bound shown in a message.` up to (not including) `/** The ids of the messages currently on screen` and put in its place
```ts
// round1, Bound, inwardBound, massBoundInDisplayUnit and HEIGHT_BOUND_IN: ./fieldRules.
```
3. Delete from `/** Required numeric field: empty is an error` up to (not including) `/** A load increment: strictly positive` and put in its place
```ts
// requiredInRange, requiredIntegerInRange and massDomainError: ./fieldRules (G06, rule 2).
```
4. Replace the `heightCm` memo
```ts
  const heightCm = useMemo((): number | null => {
    if (draft.units === 'metric') {
```
... through its closing `}, [draft.units, draft.heightM, draft.heightCm, draft.heightFt, draft.heightIn]);` with
```ts
  const heightCm = useMemo(
    (): number | null =>
      heightCmFromParts(draft.units, {
        m: draft.heightM,
        cm: draft.heightCm,
        ft: draft.heightFt,
        inch: draft.heightIn,
      }), // [cm] exact
    [draft.units, draft.heightM, draft.heightCm, draft.heightFt, draft.heightIn],
  );
```
5. Replace everything from `  const ageError =` up to (not including) `  const massError = massDomainError(` with
```ts
  // Spec R9 / audit G06: the same two rules the Settings profile editor applies (./fieldRules).
  const ageError = ageYearsError(ageYears, overrides);

  const heightError = heightCmError(heightCm, draft.units, overrides);

```
6. Remove `  KG_PER_LB,` from the `'../../domain/types'` import, and after the `} from '../components/UnitInput';` import add
```ts
import {
  UNIT,
  ageYearsError,
  heightCmError,
  heightCmFromParts,
  massDomainError,
  requiredInRange,
  requiredIntegerInRange,
  round1,
} from './fieldRules';
```
(`stepError`, `girthError` and `describedBy` stay in the wizard; `stepError` uses the imported `round1`.)

- [ ] **Step 5: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/ui/setup`, then `npx vitest run --maxWorkers=1 src/ui/setup`
Expected: no errors; PASS. Prototyped on the pre-P1 tree: tsc and eslint clean, `src/ui/setup` 4 files / 174 tests passed (263 s on a loaded machine), `fieldRules.test.ts` 4 passed with `'80.5'`; the `'80,5'` assertion needs P1 Task 13's comma parser, which lands first.

- [ ] **Step 6: Commit**

```bash
git add -- src/ui/setup/fieldRules.ts src/ui/setup/fieldRules.test.ts src/ui/setup/SetupWizard.tsx
git commit -m "refactor(setup): wizard field rules in one module the profile editor shares; body-mass bound in words (G06, G08)"
```

---

### Task 5: `BodyMassForm`, the one mass field (role, bound in words, plausibility question)

**Files:**
- Create: `src/ui/measurements/BodyMassForm.tsx`, `src/ui/measurements/measurements.css`, `src/ui/measurements/BodyMassForm.test.tsx`
- Modify: `src/content/copy.ts` (six keys), `src/content/__fixtures__/limelight-resolved.json` (six rows)

**Interfaces:**
- Consumes: `bodyMassEntryError` (Task 4), `implausibleMass` (Task 1), `button.logAnyway` (P1 Task 14), `UnitInput`, `massUnit`, `storedMassKg` (`src/ui/components/UnitInput.tsx`), `displayMass` (`src/domain/units.ts`).
- Produces:
```ts
export interface BodyMassFormProps {
  profile: Profile;
  /** DOM id prefix; unique per instance on a screen. */
  idPrefix: string;
  /** The resolved field name, e.g. c('quantity.bodyMass'). */
  quantity: string;
  /** A fixed role, or 'choose' to show the role select. */
  role: BodyMassRole | 'choose';
  /** [kg] What a new mass is compared against (spec R4); null = never questioned. */
  referenceKg: Kg | null;
  /** [kg] An edit's stored mass: prefilled, and kept exactly while its text is untouched. */
  initialKg?: Kg | null;
  /** An edit's stored role (null = untagged); only read when role is 'choose'. */
  initialRole?: BodyMassRole | null;
  /** The resolved submit label. */
  submitLabel: string;
  /** Stores the mass. Returns false when the store refused it. [kg] */
  onSubmit: (massKg: Kg, role: BodyMassRole | null) => boolean;
  onCancel?: () => void;
}
export function BodyMassForm(props: BodyMassFormProps): ReactElement;
export const MASS_ROLE_KEY: Record<BodyMassRole, CopyKey>;
```
- Copy keys: `label.massRole`, `option.massRoleMorning`, `option.massRolePre`, `option.massRolePost`, `option.massRoleNone`, `advice.massLooksOff`.

Design (G08, spec R4): Log validates against the loader's bound and says the bound in words (`role="alert"`), never a silent return or an uncaught throw; a mass more than 10 % from the reference stops once with "Log Anyway" (the P1 load-question pattern), and editing the field drops the question. An edit whose text still shows the stored value submits the stored kg exactly (review R2's rule for sets: 0.1 display rounding never rewrites a record). The component never touches the store; callers decide log versus update. Rejected: patching `BodyMassQuickLog` (spec R9: its entry point lives inside Train).

- [ ] **Step 1: Write the failing test**

Create `src/ui/measurements/BodyMassForm.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FORMAT, copy } from '../../content/copy';
import { makeProfile } from '../../test/fixtures';
import { toStoredMass } from '../../domain/units';
import { BodyMassForm, type BodyMassFormProps } from './BodyMassForm';

const Q = copy('quantity.bodyMass');

function setup(patch: Partial<BodyMassFormProps> = {}): BodyMassFormProps['onSubmit'] {
  const onSubmit = vi.fn<BodyMassFormProps['onSubmit']>(() => true);
  render(
    <BodyMassForm
      profile={makeProfile()}
      idPrefix="mass-test"
      quantity={Q}
      role="choose"
      referenceKg={80} // [kg]
      submitLabel={copy('button.logBodyMass')}
      onSubmit={onSubmit}
      {...patch}
    />,
  );
  return onSubmit;
}

function type(text: string, unit = 'kg'): void {
  fireEvent.change(screen.getByLabelText(`${Q} (${unit})`), { target: { value: text } });
}

function submit(): void {
  fireEvent.click(screen.getByRole('button', { name: copy('button.logBodyMass') }));
}

describe('BodyMassForm (spec R9, audit G08)', () => {
  it('logs a plausible mass with the chosen role', () => {
    const onSubmit = setup();
    fireEvent.change(screen.getByLabelText(copy('label.massRole')), { target: { value: 'pre' } });
    type('80,5');
    submit();
    expect(onSubmit).toHaveBeenCalledWith(80.5, 'pre'); // [kg]
  });

  it('defaults the role select to morning', () => {
    const onSubmit = setup();
    type('81');
    submit();
    expect(onSubmit).toHaveBeenCalledWith(81, 'morning');
  });

  it('states the bound in words instead of throwing or staying silent', () => {
    const onSubmit = setup({ profile: makeProfile({ units: 'imperial' }) });
    type('1800', 'lb');
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(FORMAT.atMost(Q, 1102.3, 'lb'));
    type('');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(copy('error.valueRequired'));
  });

  it('asks once about a mass far from the last one; Log Anyway stores it', () => {
    const onSubmit = setup({ profile: makeProfile({ units: 'imperial' }), referenceKg: toStoredMass(180, 'imperial') });
    type('18', 'lb'); // the G03 typo
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(copy('advice.massLooksOff'));
    fireEvent.click(screen.getByRole('button', { name: copy('button.logAnyway') }));
    expect(onSubmit).toHaveBeenCalledWith(toStoredMass(18, 'imperial'), 'morning'); // [kg]
  });

  it('drops the question once the field is edited', () => {
    setup();
    type('8');
    submit();
    type('80');
    expect(screen.queryByRole('button', { name: copy('button.logAnyway') })).toBeNull();
  });

  it('keeps a fixed role and shows no select', () => {
    const onSubmit = setup({ role: 'post' });
    expect(screen.queryByLabelText(copy('label.massRole'))).toBeNull();
    type('79');
    submit();
    expect(onSubmit).toHaveBeenCalledWith(79, 'post');
  });

  it('submits an untouched edit exactly, whatever the display rounding', () => {
    const storedKg = toStoredMass(180, 'imperial') + 0.0001; // [kg] not on the 0.1 lb display grid
    const onSubmit = setup({ profile: makeProfile({ units: 'imperial' }), initialKg: storedKg, initialRole: null });
    submit();
    expect(onSubmit).toHaveBeenCalledWith(storedKg, null);
  });

  it('says so when the store refuses', () => {
    setup({ onSubmit: () => false });
    type('80');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(copy('error.outsideAccepted'));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=1 src/ui/measurements/BodyMassForm.test.tsx`
Expected: FAIL (module missing; copy keys unknown).

- [ ] **Step 3: Copy keys**

In `src/content/copy.ts`, after the union line `  | 'button.dismiss'` add
```ts
  | 'label.massRole'
  | 'option.massRoleMorning'
  | 'option.massRolePre'
  | 'option.massRolePost'
  | 'option.massRoleNone'
  | 'advice.massLooksOff'
```
and after the table line `  'button.dismiss': 'Dismiss',` add
```ts
  // Spec R9 / audit G12: when a body mass was taken. The role decides the trend and the 2 % pair.
  'label.massRole': 'Weighed',
  'option.massRoleMorning': 'Morning',
  'option.massRolePre': 'Before Training',
  'option.massRolePost': 'After Training',
  'option.massRoleNone': 'Not Set',
  // Spec R4: the one-tap body-mass plausibility question (more than 10 % from the last weigh-in).
  'advice.massLooksOff': 'That is far from your last weigh-in. Check it.',
```
In `src/content/__fixtures__/limelight-resolved.json` add the six rows with the same strings, e.g. `"label.massRole":"Weighed"` (insert before the final `}`; keep it one JSON object).

- [ ] **Step 4: The component**

Create `src/ui/measurements/measurements.css`:
```css
/* Spec R9: measurement controls. Layout only; every colour comes from tokens.css (rule 5). */
.mass-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.5rem;
}

.mass-form .wiz-field,
.mass-form .view-field {
  flex: 1 1 8rem;
  min-width: 0;
}

.mass-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.mass-form-question {
  flex-basis: 100%;
}
```
Create `src/ui/measurements/BodyMassForm.tsx`:
```tsx
// src/ui/measurements/BodyMassForm.tsx
//
// The one body-mass field (spec R9): Today's any-day weigh-in, the Log list's edit row and Train's
// pre/post weigh-ins all render this, so the bound, the plausibility question and the role are
// stated once. It never writes the store: `onSubmit` does, and reports a refusal.
//
// Units: mass typed in the profile's display unit, converted exactly to [kg] (src/domain/units.ts).
import { useState, type ReactElement } from 'react';
import type { CopyKey } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { implausibleMass } from '../../domain/measurements';
import type { BodyMassRole, Kg, Profile } from '../../domain/types';
import { displayMass } from '../../domain/units';
import { UnitInput, massUnit, storedMassKg } from '../components/UnitInput';
import { bodyMassEntryError } from '../setup/fieldRules';
import './measurements.css';

export interface BodyMassFormProps {
  profile: Profile;
  /** DOM id prefix; unique per instance on a screen. */
  idPrefix: string;
  /** The resolved field name, e.g. c('quantity.bodyMass'). */
  quantity: string;
  /** A fixed role, or 'choose' to show the role select. */
  role: BodyMassRole | 'choose';
  /** [kg] What a new mass is compared against (spec R4); null = never questioned. */
  referenceKg: Kg | null;
  /** [kg] An edit's stored mass: prefilled, and kept exactly while its text is untouched. */
  initialKg?: Kg | null;
  /** An edit's stored role (null = untagged); only read when role is 'choose'. */
  initialRole?: BodyMassRole | null;
  /** The resolved submit label. */
  submitLabel: string;
  /** Stores the mass. Returns false when the store refused it. [kg] */
  onSubmit: (massKg: Kg, role: BodyMassRole | null) => boolean;
  onCancel?: () => void;
}

/** The option word for each stored role; the Log list prints it beside an entry (Task 6). */
export const MASS_ROLE_KEY: Record<BodyMassRole, CopyKey> = {
  morning: 'option.massRoleMorning',
  pre: 'option.massRolePre',
  post: 'option.massRolePost',
};

/** The select's values: the three roles, and '' for an untagged entry. */
type RoleChoice = BodyMassRole | '';

const ROLE_OPTIONS: readonly { value: RoleChoice; key: CopyKey }[] = [
  { value: 'morning', key: MASS_ROLE_KEY.morning },
  { value: 'pre', key: MASS_ROLE_KEY.pre },
  { value: 'post', key: MASS_ROLE_KEY.post },
  { value: '', key: 'option.massRoleNone' },
];

/** A stored mass as the user would type it: the display unit at its 0.1 resolution. */
function massText(kg: Kg, profile: Profile): string {
  return String(displayMass(kg, profile.units)); // [kg] or [lb]
}

export function BodyMassForm(props: BodyMassFormProps): ReactElement {
  const { profile, idPrefix, quantity, role, referenceKg, submitLabel, onSubmit, onCancel } = props;
  const initialKg = props.initialKg ?? null;
  const c = useCopy();
  const overrides = useCopyOverrides();
  const initialText = initialKg === null ? '' : massText(initialKg, profile);
  const [text, setText] = useState(initialText); // as typed, display unit
  const [choice, setChoice] = useState<RoleChoice>(
    role === 'choose' ? (props.initialKg === undefined ? 'morning' : (props.initialRole ?? '')) : role,
  );
  const [error, setError] = useState<string | null>(null);
  /** [kg] The mass the form has asked about once (spec R4); null when no question stands. */
  const [questionedKg, setQuestionedKg] = useState<Kg | null>(null);
  const errorId = `${idPrefix}-error`;

  const submit = (confirmed: boolean): void => {
    const refusal = bodyMassEntryError(quantity, text, profile.units, overrides);
    if (refusal !== null) {
      setError(refusal);
      setQuestionedKg(null);
      return;
    }
    // Review R2's rule: an untouched edit keeps the stored kg, never the 0.1-rounded display.
    const typedKg = storedMassKg(text, profile.units); // [kg] exact conversion
    const massKg = initialKg !== null && text === initialText ? initialKg : typedKg; // [kg]
    if (massKg === null) return; // unreachable: the bound check above refused null
    if (!confirmed && implausibleMass(massKg, referenceKg)) {
      setQuestionedKg(massKg);
      setError(null);
      return;
    }
    const stored = onSubmit(massKg, choice === '' ? null : choice);
    if (!stored) {
      setError(c('error.outsideAccepted'));
      return;
    }
    setError(null);
    setQuestionedKg(null);
    if (initialKg === null) setText('');
  };

  return (
    <div className="mass-form">
      <div
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          submit(false);
        }}
      >
        <UnitInput
          id={`${idPrefix}-mass`}
          quantity={quantity}
          unit={massUnit(profile.units)}
          value={text}
          error={null}
          sharedErrorId={error === null ? null : errorId}
          onChange={(next) => {
            setText(next);
            setError(null);
            setQuestionedKg(null);
          }}
        />
      </div>
      {role === 'choose' && (
        <div className="view-field">
          <label htmlFor={`${idPrefix}-role`}>{c('label.massRole')}</label>
          <select
            id={`${idPrefix}-role`}
            value={choice}
            onChange={(e) => {
              const next = ROLE_OPTIONS.find((o) => o.value === e.target.value);
              if (next !== undefined) setChoice(next.value);
            }}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.key} value={o.value}>
                {c(o.key)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="mass-form-actions">
        <button
          type="button"
          onClick={() => {
            submit(false);
          }}
        >
          {submitLabel}
        </button>
        {onCancel !== undefined && (
          <button type="button" onClick={onCancel}>
            {c('button.cancel')}
          </button>
        )}
      </div>
      {error !== null && (
        <p className="view-error" id={errorId} role="alert">
          {error}
        </p>
      )}
      {questionedKg !== null && (
        <div className="mass-form-question">
          <p role="alert">{c('advice.massLooksOff')}</p>
          <button
            type="button"
            onClick={() => {
              submit(true);
            }}
          >
            {c('button.logAnyway')}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/ui/measurements`, `npx vitest run --maxWorkers=1 src/ui/measurements src/content`
Expected: PASS. If the impeccable hook reports findings on the new CSS, fix real ones; never add `ignore-file`/`ignore-rule`.

- [ ] **Step 6: Commit**

```bash
git add -- src/ui/measurements/BodyMassForm.tsx src/ui/measurements/BodyMassForm.test.tsx src/ui/measurements/measurements.css src/content/copy.ts src/content/__fixtures__/limelight-resolved.json
git commit -m "feat(measurements): one body-mass field with role, bound in words and plausibility question (R9, R4, G08)"
```

---

### Task 6: Body mass any day from Today; every entry editable and deletable with undo on Log (G02, G03)

**Files:**
- Create: `src/ui/measurements/MeasurementsPanel.tsx`, `src/ui/measurements/BodyMassLog.tsx`, `src/ui/measurements/measurementsViews.test.tsx`
- Modify: `src/ui/measurements/measurements.css` (append)
- Modify: `src/ui/views/TodayView.tsx` (one import, one mount), `src/ui/views/LogView.tsx` (one import, one mount)
- Modify: `src/ui/views/TodayView.test.tsx`, `src/ui/views/LogView.test.tsx` (a `render` wrapper with `ToastProvider`)
- Modify: `src/content/copy.ts`, `src/content/__fixtures__/limelight-resolved.json` (seven keys)
- Create: `e2e/p5-measurements.spec.ts`
- Modify: `e2e/support/constants.ts`, `e2e/support/document.ts`, `src/test/e2eDocument.test.ts`

**Interfaces:**
- Consumes: `BodyMassForm`, `MASS_ROLE_KEY` (Task 5); `logBodyMass(...): string`, `updateBodyMass`, `deleteBodyMass`, `restoreBodyMass` (Task 3); `latestBodyMassEntry`, `latestTrendEntry` (Task 1); `useToasts` (`src/ui/components/ToastQueue.tsx`, `{ kind: 'undo'; message; onUndo; deadlineAt }`); `UNDO_WINDOW_MS` (`src/store/training.ts`, 6 000 ms).
- Produces: `MeasurementsPanel(props: { profile: Profile; today: LocalDate }): ReactElement`; `BodyMassLog(props: { profile: Profile }): ReactElement`; `BODY_MASS_ROWS_SHOWN = 14`; e2e helpers `bodyMassEntry(patch)`, `DocumentOptions.bodyMass`, `DocumentOptions.weighInOptIn`, `massLabel()`, `preMassLabel()`, `postMassLabel()`, `LABEL.logBodyMass`, `LABEL.logTab`, `LABEL.editEntry`, `LABEL.saveEntry`, `LABEL.fluidLoss`.
- Copy keys: `hero.measurements`, `status.massLogged`, `status.massDeleted`, `button.editEntry`, `button.deleteEntry`, `button.saveEntry`, `button.showAllEntries`.

Design: Today carries a Body Mass section on every day (rest days included, G02), role select defaulting to Morning, and a 6 s Undo after each log (an immediate slip is one tap). Log lists entries newest first (14, then Show All) with Edit (the same form, prefilled, Save/Cancel, stored kg kept while untouched) and Delete (6 s Undo restores the identical record). The edit's plausibility reference is the newest trend point other than the entry being edited, else the baseline, so correcting 8 kg to 80 kg is not questioned against the typo itself.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/measurements/measurementsViews.test.tsx`:
```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, copyFor } from '../../content/copy';
import { defaultState } from '../../domain/schema';
import type { BodyMassEntry } from '../../domain/types';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { makeProfile } from '../../test/fixtures';
import { ToastProvider, ToastQueue } from '../components/ToastQueue';
import { BODY_MASS_ROWS_SHOWN, BodyMassLog } from './BodyMassLog';
import { MeasurementsPanel } from './MeasurementsPanel';

const P = 'profile-1';
const TODAY = '2026-03-03';
const NOW = Date.UTC(2026, 2, 3, 6, 0); // [ms] epoch UTC, 08:00 in Athens
const Q = `${copy('quantity.bodyMass')} (kg)`;

function entry(id: string, date: string, massKg: number): BodyMassEntry {
  return { id, profileId: P, date, massKg, enteredUnit: 'metric', bodyFatPct: null, loggedAt: NOW - 1 }; // [kg]
}

function seed(bodyMass: BodyMassEntry[] = []): void {
  installFakeStorage();
  const profile = makeProfile();
  useAppStore.setState({
    ...defaultState(),
    ui: { ...defaultState().ui, skin: 'limelight' },
    activeProfileId: P,
    profiles: { [P]: profile },
    bodyMass: { [P]: bodyMass },
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
}

function withToasts(ui: ReactElement): void {
  render(
    <ToastProvider>
      {ui}
      <ToastQueue />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

describe('MeasurementsPanel (spec R9, audit G02)', () => {
  it('logs a morning weigh-in on any day, then Undo takes it back', () => {
    seed();
    withToasts(<MeasurementsPanel profile={makeProfile()} today={TODAY} />);
    fireEvent.change(screen.getByLabelText(Q), { target: { value: '94,6' } });
    fireEvent.click(screen.getByRole('button', { name: copy('button.logBodyMass') }));
    expect(useAppStore.getState().bodyMass[P]).toMatchObject([{ date: TODAY, massKg: 94.6, role: 'morning' }]);
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.undo') }));
    expect(useAppStore.getState().bodyMass[P]).toEqual([]);
  });
});

describe('BodyMassLog (spec R9, audit G03)', () => {
  it('corrects a typo in place: same id, same date, the stored loggedAt', () => {
    seed([entry('a', '2026-03-01', 94), entry('typo', '2026-03-02', 9.4)]);
    withToasts(<BodyMassLog profile={makeProfile()} />);
    const row = screen.getAllByTestId('mass-entry').find((r) => r.textContent?.includes('2026-03-02'));
    if (row === undefined) throw new Error('no row for the typo');
    fireEvent.click(within(row).getByRole('button', { name: copy('button.editEntry') }));
    fireEvent.change(within(row).getByLabelText(Q), { target: { value: '94.2' } });
    fireEvent.click(within(row).getByRole('button', { name: copy('button.saveEntry') }));
    expect(useAppStore.getState().bodyMass[P]?.find((e) => e.id === 'typo')).toMatchObject({
      massKg: 94.2, // [kg]
      date: '2026-03-02',
      loggedAt: NOW - 1,
    });
  });

  it('deletes with a 6 s Undo that restores the identical record', () => {
    const typo = entry('typo', '2026-03-02', 9.4);
    seed([entry('a', '2026-03-01', 94), typo]);
    withToasts(<BodyMassLog profile={makeProfile()} />);
    const row = screen.getAllByTestId('mass-entry').find((r) => r.textContent?.includes('2026-03-02'));
    if (row === undefined) throw new Error('no row for the typo');
    fireEvent.click(within(row).getByRole('button', { name: copy('button.deleteEntry') }));
    expect(useAppStore.getState().bodyMass[P]?.map((e) => e.id)).toEqual(['a']);
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.undo') }));
    expect(useAppStore.getState().bodyMass[P]?.find((e) => e.id === 'typo')).toEqual(typo);
  });

  it('shows the newest entries first and the rest behind Show All', () => {
    const many = Array.from({ length: BODY_MASS_ROWS_SHOWN + 1 }, (_, i) =>
      entry(`m${String(i)}`, `2026-02-${String(i + 1).padStart(2, '0')}`, 90 + i / 10),
    );
    seed(many);
    withToasts(<BodyMassLog profile={makeProfile()} />);
    expect(screen.getAllByTestId('mass-entry')).toHaveLength(BODY_MASS_ROWS_SHOWN);
    expect(screen.getAllByTestId('mass-entry')[0]?.textContent).toContain('2026-02-15');
    fireEvent.click(screen.getByRole('button', { name: copy('button.showAllEntries') }));
    expect(screen.getAllByTestId('mass-entry')).toHaveLength(BODY_MASS_ROWS_SHOWN + 1);
  });
});
```
Append to `src/ui/views/TodayView.test.tsx` (inside the outermost describe that seeds a profile with a plan, or as its own describe reusing that file's seeding helper and `NOW_MS` clock; P1 Task 11 uses `DAY_MS` and `TUESDAY` there):
```tsx
describe('body mass on Today (spec R9, audit G02)', () => {
  it('offers the weigh-in on a day with no session', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS + DAY_MS); // Tuesday: no preferred slot
    render(<TodayView />);
    expect(screen.getByLabelText(`${copyFor('limelight', 'quantity.bodyMass')} (kg)`)).toBeTruthy();
  });
});
```
(If `TodayView.test.tsx`'s `beforeEach` does not seed a profile for a top-level describe, place the `it` inside the existing `describe('TodayView controls', ...)`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/measurements/measurementsViews.test.tsx src/ui/views/TodayView.test.tsx`
Expected: FAIL (modules missing; no mass field on Today).

- [ ] **Step 3: Copy keys**

In `src/content/copy.ts`, after the union line `  | 'button.dismiss'` add
```ts
  | 'hero.measurements'
  | 'status.massLogged'
  | 'status.massDeleted'
  | 'button.editEntry'
  | 'button.deleteEntry'
  | 'button.saveEntry'
  | 'button.showAllEntries'
```
and after the table line `  'button.dismiss': 'Dismiss',` add
```ts
  // Spec R9 / audit G02, G03: the weigh-in log on Today and on Log, each with a 6 s Undo.
  'hero.measurements': 'Weigh-Ins',
  'status.massLogged': 'Weigh-in logged.',
  'status.massDeleted': 'Weigh-in deleted.',
  'button.editEntry': 'Edit',
  'button.deleteEntry': 'Delete',
  'button.saveEntry': 'Save',
  'button.showAllEntries': 'Show All',
```
and the seven rows in `src/content/__fixtures__/limelight-resolved.json` with the same strings.

- [ ] **Step 4: The two components**

Create `src/ui/measurements/MeasurementsPanel.tsx`:
```tsx
// src/ui/measurements/MeasurementsPanel.tsx
//
// Spec R9 / audit G02: a weigh-in from Today on ANY day, not only inside a session. Logs today's
// civil date with the chosen role and offers a 6 s Undo, so an immediate slip is one tap.
import { useId, type ReactElement } from 'react';
import { useCopy } from '../../content/useCopy';
import { latestBodyMassEntry } from '../../domain/measurements';
import type { BodyMassRole, Kg, LocalDate, Profile } from '../../domain/types';
import { useAppStore } from '../../store';
import { UNDO_WINDOW_MS } from '../../store/training';
import { useToasts } from '../components/ToastQueue';
import { BodyMassForm } from './BodyMassForm';
import './measurements.css';

export function MeasurementsPanel(props: { profile: Profile; today: LocalDate }): ReactElement {
  const { profile, today } = props;
  const c = useCopy();
  const { push } = useToasts();
  const headingId = useId();
  // The stored entry (stable identity), so the subscription cannot loop.
  const latest = useAppStore((s) => latestBodyMassEntry(s, profile.id));
  // [kg] Spec R4: the plausibility reference, the newest trend mass, else the setup baseline.
  const referenceKg = latest?.massKg ?? profile.body.baselineMassKg;

  const onSubmit = (massKg: Kg, role: BodyMassRole | null): boolean => {
    const now = Date.now(); // [ms] epoch UTC
    let id: string;
    try {
      id = useAppStore.getState().logBodyMass(
        {
          profileId: profile.id,
          date: today,
          massKg, // [kg]
          enteredUnit: profile.units,
          bodyFatPct: null,
          ...(role === null ? {} : { role }),
        },
        now,
      );
    } catch {
      // The store refused (spec R5); the form says so on its error line.
      return false;
    }
    push({
      kind: 'undo',
      message: c('status.massLogged'),
      deadlineAt: now + UNDO_WINDOW_MS, // [ms] epoch UTC
      onUndo: () => {
        useAppStore.getState().deleteBodyMass(profile.id, id);
      },
    });
    return true;
  };

  return (
    <section className="measurements" aria-labelledby={headingId}>
      <h3 id={headingId}>{c('hero.bodyMass')}</h3>
      <BodyMassForm
        profile={profile}
        idPrefix="today-mass"
        quantity={c('quantity.bodyMass')}
        role="choose"
        referenceKg={referenceKg}
        submitLabel={c('button.logBodyMass')}
        onSubmit={onSubmit}
      />
    </section>
  );
}
```
Create `src/ui/measurements/BodyMassLog.tsx`:
```tsx
// src/ui/measurements/BodyMassLog.tsx
//
// Spec R9 / audit G03: every weigh-in, newest first, each editable in place and deletable with a
// 6 s Undo that restores the identical record. A typo no longer poisons Targets and the chart
// forever.
import { useId, useMemo, useState, type ReactElement } from 'react';
import { useCopy } from '../../content/useCopy';
import { compareLocalDate } from '../../domain/dates';
import { latestTrendEntry } from '../../domain/measurements';
import type { BodyMassEntry, Profile } from '../../domain/types';
import { formatMass } from '../../domain/units';
import { useAppStore } from '../../store';
import { UNDO_WINDOW_MS } from '../../store/training';
import { useToasts } from '../components/ToastQueue';
import { BodyMassForm, MASS_ROLE_KEY } from './BodyMassForm';
import './measurements.css';

/** [entries] Shown before Show All: two weeks of daily weigh-ins. Display only. */
export const BODY_MASS_ROWS_SHOWN = 14;

const NO_ENTRIES: readonly BodyMassEntry[] = [];

export function BodyMassLog(props: { profile: Profile }): ReactElement | null {
  const { profile } = props;
  const c = useCopy();
  const { push } = useToasts();
  const headingId = useId();
  const stored = useAppStore((s) => s.bodyMass[profile.id] ?? NO_ENTRIES);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Newest first: civil date, then the instant it was entered.
  const rows = useMemo(
    () => [...stored].sort((a, b) => compareLocalDate(b.date, a.date) || b.loggedAt - a.loggedAt),
    [stored],
  );
  if (rows.length === 0) return null;
  const shown = showAll ? rows : rows.slice(0, BODY_MASS_ROWS_SHOWN);

  /** [kg] An edit is compared with the newest OTHER trend point, never with the typo itself. */
  const referenceFor = (id: string): number =>
    latestTrendEntry(stored.filter((e) => e.id !== id))?.massKg ?? profile.body.baselineMassKg;

  const remove = (e: BodyMassEntry): void => {
    const removed = useAppStore.getState().deleteBodyMass(profile.id, e.id);
    if (removed === null) return;
    push({
      kind: 'undo',
      message: c('status.massDeleted'),
      deadlineAt: Date.now() + UNDO_WINDOW_MS, // [ms] epoch UTC
      onUndo: () => {
        try {
          useAppStore.getState().restoreBodyMass(removed);
        } catch {
          // The profile is gone; there is nothing to restore into.
        }
      },
    });
  };

  return (
    <section className="measurements" aria-labelledby={headingId}>
      <h3 id={headingId}>{c('hero.measurements')}</h3>
      <ul className="mass-log">
        {shown.map((e) => (
          <li key={e.id} className="mass-log-row" data-testid="mass-entry">
            {editingId === e.id ? (
              <BodyMassForm
                profile={profile}
                idPrefix={`mass-edit-${e.id}`}
                quantity={c('quantity.bodyMass')}
                role="choose"
                referenceKg={referenceFor(e.id)}
                initialKg={e.massKg}
                initialRole={e.role ?? null}
                submitLabel={c('button.saveEntry')}
                onSubmit={(massKg, role) => {
                  try {
                    useAppStore.getState().updateBodyMass(profile.id, e.id, {
                      massKg, // [kg]
                      enteredUnit: profile.units,
                      bodyFatPct: e.bodyFatPct, // [%] unchanged by a mass edit
                      role,
                    });
                  } catch {
                    return false;
                  }
                  setEditingId(null);
                  return true;
                }}
                onCancel={() => {
                  setEditingId(null);
                }}
              />
            ) : (
              <>
                <span className="mass-log-date">{e.date}</span>
                <span className="mass-log-value">{formatMass(e.massKg, profile.units)}</span>
                {e.bodyFatPct !== null && <span className="mass-log-fat">{`${String(e.bodyFatPct)} %`}</span>}
                {e.role !== undefined && <span className="mass-log-role">{c(MASS_ROLE_KEY[e.role])}</span>}
                <span className="mass-log-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(e.id);
                    }}
                  >
                    {c('button.editEntry')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      remove(e);
                    }}
                  >
                    {c('button.deleteEntry')}
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {!showAll && rows.length > shown.length && (
        <button
          type="button"
          onClick={() => {
            setShowAll(true);
          }}
        >
          {c('button.showAllEntries')}
        </button>
      )}
    </section>
  );
}
```

Append to `src/ui/measurements/measurements.css`:
```css
.measurements {
  margin: 1rem 0;
}

.mass-log {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.mass-log-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75rem;
  overflow-wrap: anywhere;
}

.mass-log-value {
  font-variant-numeric: tabular-nums;
}

.mass-log-actions {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}
```

- [ ] **Step 5: Mount them**

In `src/ui/views/TodayView.tsx` add `import { MeasurementsPanel } from '../measurements/MeasurementsPanel';` and immediately before the line `      {!finished && <WeekStamp review={lastReview} />}` insert
```tsx
      {/* Spec R9 / audit G02: a weigh-in any day, not only inside a session. */}
      <MeasurementsPanel profile={profile} today={today} />
```
In `src/ui/views/LogView.tsx` add `import { BodyMassLog } from '../measurements/BodyMassLog';` and immediately after the closing `</details>` of `<details data-testid="body-mass-basis">` insert
```tsx
      {/* Spec R9 / audit G03: every entry editable and deletable with undo. */}
      <BodyMassLog profile={profile} />
```
Both views now raise undo toasts, so their suites render inside the provider. In `src/ui/views/TodayView.test.tsx` and `src/ui/views/LogView.test.tsx`, change the RTL import's `render` to `render as rtlRender`, add `import type { ReactElement } from 'react';` and `import { ToastProvider } from '../components/ToastQueue';`, and define after the imports:
```tsx
/** P5: the measurement panels raise undo toasts, so every render sits inside the provider. */
function render(ui: ReactElement): ReturnType<typeof rtlRender> {
  return rtlRender(<ToastProvider>{ui}</ToastProvider>);
}
```
(Any `rerender(<X />)` call in those files becomes `rerender(<ToastProvider><X /></ToastProvider>)`; `grep -n "rerender" src/ui/views/TodayView.test.tsx src/ui/views/LogView.test.tsx` lists them.)

- [ ] **Step 6: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/ui/measurements src/ui/views`, `npx vitest run --maxWorkers=1 src/ui/measurements src/ui/views/TodayView.test.tsx src/ui/views/LogView.test.tsx src/content src/app`
Expected: PASS. A LogView test that counts every `Edit`/`Delete` button or every `<li>` on the page now also sees the weigh-in rows: scope that query with `within(...)` to its own section and name the test in the commit body.

- [ ] **Step 7: e2e specs (written here, run by the runner)**

In `e2e/support/document.ts`: add `BodyMassEntry` to the type import; add to `DocumentOptions`
```ts
  /** The profile's weigh-ins. Default none. */
  bodyMass?: BodyMassEntry[];
  /** Pre/post-session weigh-in opt-in. Default false. */
  weighInOptIn?: boolean;
```
add the builder
```ts
/** A weigh-in of the e2e profile, metric, logged at 12:00 UTC on its date; patch what the spec needs. */
export function bodyMassEntry(patch: Partial<BodyMassEntry> & Pick<BodyMassEntry, 'id' | 'date' | 'massKg'>): BodyMassEntry {
  return {
    profileId: PROFILE_ID,
    enteredUnit: 'metric',
    bodyFatPct: null, // [%]
    loggedAt: Date.parse(`${patch.date}T12:00:00Z`), // [ms] epoch, UTC
    ...patch,
  };
}
```
and in `e2eDocument` change `hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: false }` to `hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: opts.weighInOptIn ?? false }` and `bodyMass: { [PROFILE_ID]: [] },` to `bodyMass: { [PROFILE_ID]: opts.bodyMass ?? [] },`.

In `e2e/support/constants.ts` add to `LABEL`:
```ts
  logTab: 'the archive',
  logBodyMass: 'Log Body Mass',
  editEntry: 'Edit',
  saveEntry: 'Save',
  fluidLoss: 'Fluid loss above 2 %. Replace over the next hours.',
```
and after `deleteLabel`:
```ts
/** "Body mass (kg)": FORMAT.quantityWithUnit(copy('quantity.bodyMass'), 'kg'). */
export function massLabel(): string {
  return 'Body mass (kg)';
}

/** "Pre-session body mass (kg)". */
export function preMassLabel(): string {
  return 'Pre-session body mass (kg)';
}

/** "Post-session body mass (kg)". */
export function postMassLabel(): string {
  return 'Post-session body mass (kg)';
}
```
In `src/test/e2eDocument.test.ts` import `massLabel`, `preMassLabel`, `postMassLabel` and add to the last test:
```ts
    expect(LABEL.logTab).toBe(copyFor('limelight', 'nav.log'));
    expect(LABEL.logBodyMass).toBe(copyFor('limelight', 'button.logBodyMass'));
    expect(LABEL.editEntry).toBe(copyFor('limelight', 'button.editEntry'));
    expect(LABEL.saveEntry).toBe(copyFor('limelight', 'button.saveEntry'));
    expect(LABEL.fluidLoss).toBe(copyFor('limelight', 'advice.fluidLoss'));
    expect(massLabel()).toBe(FORMAT.quantityWithUnit(copyFor('limelight', 'quantity.bodyMass'), 'kg'));
    expect(preMassLabel()).toBe(FORMAT.quantityWithUnit(copyFor('limelight', 'quantity.preSessionBodyMass'), 'kg'));
    expect(postMassLabel()).toBe(FORMAT.quantityWithUnit(copyFor('limelight', 'quantity.postSessionBodyMass'), 'kg'));
```
Create `e2e/p5-measurements.spec.ts`:
```ts
// Spec R9 / audit G02, G03 (and G01, Task 7): measurements on the phone.
import { expect, test } from '@playwright/test';
import { LABEL, PROFILE_ID, massLabel } from './support/constants';
import { chicago, flushWrites, openApp, readDocument, seedDocument, setClock } from './support/app';
import { MONDAY, TUESDAY, WEDNESDAY, bodyMassEntry, e2eDocument } from './support/document';

test('G02: a morning weigh-in on a rest day, from Today', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(TUESDAY, '07:30')); // Tuesday has no preferred slot
  const page = await openApp(context);
  await page.getByLabel(massLabel(), { exact: true }).fill('80,4');
  await page.getByRole('button', { name: LABEL.logBodyMass, exact: true }).click();
  await flushWrites(page);
  const masses = (await readDocument(page)).bodyMass[PROFILE_ID] ?? [];
  expect(masses).toHaveLength(1);
  expect(masses[0]).toMatchObject({ date: TUESDAY, massKg: 80.4, role: 'morning' }); // [kg]
});

test('G03: a typo weigh-in is corrected in place from the Log', async ({ context }) => {
  await seedDocument(
    context,
    e2eDocument({
      bodyMass: [
        bodyMassEntry({ id: 'm1', date: MONDAY, massKg: 80 }), // [kg]
        bodyMassEntry({ id: 'typo', date: TUESDAY, massKg: 8 }), // [kg] 80 typed without its 0
      ],
    }),
  );
  await setClock(context, chicago(WEDNESDAY, '07:30'));
  const page = await openApp(context);
  await page.getByRole('navigation').getByRole('button', { name: LABEL.logTab, exact: true }).click({ timeout: 10_000 });
  const row = page.getByTestId('mass-entry').filter({ hasText: TUESDAY });
  await row.getByRole('button', { name: LABEL.editEntry, exact: true }).click();
  // 80.2 is within 10 % of Monday's 80 (the reference excludes the typo), so no question is asked.
  await row.getByLabel(massLabel(), { exact: true }).fill('80.2');
  await row.getByRole('button', { name: LABEL.saveEntry, exact: true }).click();
  await flushWrites(page);
  const masses = (await readDocument(page)).bodyMass[PROFILE_ID] ?? [];
  expect(masses).toHaveLength(2);
  expect(masses.find((e) => e.id === 'typo')?.massKg).toBe(80.2); // [kg]
});
```
Runner: `npx vitest run --maxWorkers=1 src/test/e2eDocument.test.ts`, then `npm run e2e -- e2e/p5-measurements.spec.ts` (expected `4 passed`: 2 tests x 2 devices) and `npm run e2e` (all green). If the P4a shell has replaced the navigation buttons, open Log the way `e2e/support/app.ts` does at that point.

- [ ] **Step 8: Commit**

```bash
git add -- src/ui/measurements/MeasurementsPanel.tsx src/ui/measurements/BodyMassLog.tsx src/ui/measurements/measurementsViews.test.tsx src/ui/measurements/measurements.css src/ui/views/TodayView.tsx src/ui/views/LogView.tsx src/ui/views/TodayView.test.tsx src/ui/views/LogView.test.tsx src/content/copy.ts src/content/__fixtures__/limelight-resolved.json e2e/p5-measurements.spec.ts e2e/support/constants.ts e2e/support/document.ts src/test/e2eDocument.test.ts
git commit -m "feat(measurements): weigh-in any day from Today; edit and delete with undo on Log (R9, G02, G03)"
```

---

### Task 7: Train weigh-ins with a role; the fluid-loss flag fires (G01 UI, G12)

**Files:**
- Modify: `src/ui/views/TrainView.tsx` (imports; one state hook; `preSessionMassKg`; the three `BodyMassQuickLog` blocks)
- Delete: `src/ui/views/train/BodyMassQuickLog.tsx`, `src/ui/views/train/BodyMassQuickLog.test.tsx`
- Modify: `src/ui/styles/train.css` (the `.mass-quick-log,\n.post-session {` selector)
- Test: `src/ui/views/TrainView.test.tsx` (four existing tests in `describe` blocks around "logs a body mass entry from the quick log")
- Modify: `e2e/p5-measurements.spec.ts` (append one test)

**Interfaces:**
- Consumes: `BodyMassForm` (Task 5), `preSessionMass(masses, startedAt, endedAt)` (Task 2), `latestTrendEntry` (Task 1), `logBodyMass(...): string` (Task 3), e2e helpers from Task 6, `startFromToday`, `logSet` (`e2e/support/app.ts`).
- Produces: nothing new for later tasks.

Design: Train asks for the pre-session mass (opt-in, before the first set) with role `pre` and for the post-session mass (opt-in, after Finish) with role `post`. Both are logged on the open session's own date (`assignment.date`, spec R1). The pre field disappears as soon as it is logged, because a `pre` mass after Start now counts (Task 2). The mid-session "Body mass" quick log is removed from Train: Today carries the any-day weigh-in (spec R9) and a mid-session reading is neither half of the pair nor a trend point (G12). The > 2 % flag moves from the deleted component into TrainView unchanged (Sawka 2007 threshold and `FORMAT.fluidLossWhy` as before). Rejected: keeping `BodyMassQuickLog` with a role prop (spec R9 rejects patching it; two mass fields would keep two bound rules).

- [ ] **Step 1: Rewrite the affected tests first**

In `src/ui/views/TrainView.test.tsx`:
1. Replace the whole `it('logs a body mass entry from the quick log', ...)` with:
```tsx
  it('offers no mid-session weigh-in: Today carries it (spec R9, audit G12)', () => {
    seedStore(seed());
    renderTrain();
    expect(screen.queryByLabelText(`${copyFor('limelight', 'quantity.bodyMass')} (kg)`)).toBeNull();
  });
```
2. In `it('offers a pre-session mass at session start when the profile opted in', ...)` replace its last three statements (from `expect(useAppStore.getState().bodyMass['profile-1']?.[0]?.massKg).toBe(96); // [kg]` to the end of the test body) with:
```tsx
    // Spec R9 / audit G01: stored by role, so it counts although Start was tapped first.
    expect(useAppStore.getState().bodyMass['profile-1']?.[0]).toMatchObject({ massKg: 96, role: 'pre', date: TODAY }); // [kg]
    expect(screen.queryByLabelText(`${copyFor('limelight', 'quantity.preSessionBodyMass')} (kg)`)).toBeNull();
```
3. In `it('offers no pre-session mass to a profile that did not opt in', ...)` replace
```tsx
    expect(screen.getByLabelText(`${copyFor('limelight', 'quantity.bodyMass')} (kg)`)).toBeInTheDocument();
```
with
```tsx
    expect(screen.queryByLabelText(`${copyFor('limelight', 'quantity.bodyMass')} (kg)`)).toBeNull();
```
4. Append inside the same describe as the two "flags a post-session loss" tests:
```tsx
  it('fires the fluid-loss flag from a pre mass logged after Start (audit G01)', () => {
    seedStore(seed({ weighInOptIn: true }));
    renderTrain();
    fireEvent.change(screen.getByLabelText(`${copyFor('limelight', 'quantity.preSessionBodyMass')} (kg)`), {
      target: { value: '95' },
    });
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.logBodyMass') }));
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.finishSession') }));
    fireEvent.change(screen.getByLabelText(`${copyFor('limelight', 'quantity.postSessionBodyMass')} (kg)`), {
      target: { value: '92' },
    });
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.logBodyMass') }));
    expect(screen.getByText(copyFor('limelight', 'advice.fluidLoss'))).toBeInTheDocument();
    expect(useAppStore.getState().bodyMass['profile-1']?.map((e) => e.role)).toEqual(['pre', 'post']);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/views/TrainView.test.tsx`
Expected: FAIL (the quick log is still there; no role is stored; the in-session pre mass does not count).

- [ ] **Step 3: TrainView**

In `src/ui/views/TrainView.tsx`:
1. Replace `import { preSessionMass } from '../../domain/training/hydration';` with
```ts
import { latestTrendEntry } from '../../domain/measurements';
import {
  DEHYDRATION_LOSS_FRACTION,
  bodyMassLossFraction,
  exceedsDehydrationThreshold,
  preSessionMass,
} from '../../domain/training/hydration';
import type { BodyMassRole, Kg } from '../../domain/types';
```
(merge `Kg`/`BodyMassRole` into the existing `import type { Exercise } from '../../domain/types';` line), replace `import { BodyMassQuickLog } from './train/BodyMassQuickLog';` with `import { BodyMassForm } from '../measurements/BodyMassForm';`, and add below the imports:
```ts
const PERCENT = 100; // [%] per unit fraction
```
2. After `const [openId, setOpenId] = useState<string | null>(null);` add
```ts
  /** [%] The session's fluid loss to one decimal when it exceeded the threshold, else null (G01). */
  const [fluidLossPct, setFluidLossPct] = useState<string | null>(null);
```
3. In the `preSessionMassKg` expression replace `preSessionMass(bodyMass[profileId] ?? [], assignment.startedAt)` with `preSessionMass(bodyMass[profileId] ?? [], assignment.startedAt, assignment.completedAt)`, and right after that statement add
```ts
  // [kg] Spec R4: a weigh-in is compared with the newest trend mass, else the setup baseline.
  const latestMassKg: Kg = latestTrendEntry(bodyMass[profileId] ?? [])?.massKg ?? profile.body.baselineMassKg;
```
(It must sit after the `profile === null` early return, where `profile` is narrowed.)
4. Immediately before `const completed = assignment.status === 'completed';` add
```ts
  /** Logs one weigh-in of this session, on the session's own date (spec R1). False when refused. */
  const logWeighIn = (massKg: Kg, role: BodyMassRole): boolean => {
    try {
      useAppStore.getState().logBodyMass(
        { profileId, date: assignment.date, massKg, enteredUnit: profile.units, bodyFatPct: null, role }, // [kg]
        Date.now(), // [ms] epoch UTC
      );
      return true;
    } catch {
      return false;
    }
  };
```
5. Replace the `{asksPreSessionMass && ( <BodyMassQuickLog ... /> )}` block AND the following `{!completed && !asksPreSessionMass && ( <BodyMassQuickLog ... /> )}` block with:
```tsx
      {asksPreSessionMass && (
        <BodyMassForm
          profile={profile}
          idPrefix="body-mass-pre-session"
          quantity={c('quantity.preSessionBodyMass')}
          role="pre"
          referenceKg={latestMassKg}
          submitLabel={c('button.logBodyMass')}
          onSubmit={(massKg) => logWeighIn(massKg, 'pre')}
        />
      )}
```
6. In the `{completed && profile.hydration.weighInOptIn && ( <div className="post-session"> ... )}` block replace the `<BodyMassQuickLog ... />` element with:
```tsx
          <BodyMassForm
            profile={profile}
            idPrefix="body-mass-post-session"
            quantity={c('quantity.postSessionBodyMass')}
            role="post"
            referenceKg={preSessionMassKg} // [kg] this session's own starting mass, or null
            submitLabel={c('button.logBodyMass')}
            onSubmit={(massKg) => {
              if (!logWeighIn(massKg, 'post')) return false;
              // Sign convention: bodyMassLossFraction is POSITIVE for a loss (Sawka 2007, > 2 %).
              setFluidLossPct(
                preSessionMassKg !== null && exceedsDehydrationThreshold(preSessionMassKg, massKg)
                  ? (bodyMassLossFraction(preSessionMassKg, massKg) * PERCENT).toFixed(1) // [%]
                  : null,
              );
              return true;
            }}
          />
          {fluidLossPct !== null && (
            <>
              <p className="fcm-caution" role="alert">
                {c('advice.fluidLoss')}
              </p>
              <details className="fcm-why">
                <summary>{c('disclosure.why')}</summary>
                <p>{FORMAT.fluidLossWhy(fluidLossPct, DEHYDRATION_LOSS_FRACTION * PERCENT, overrides)}</p>
              </details>
            </>
          )}
```
7. Update the file's header comment line "the two things a session has to collect beyond sets (fluid and body mass)" only if it now misdescribes the view; do not reword other copy.

Delete `src/ui/views/train/BodyMassQuickLog.tsx` and `src/ui/views/train/BodyMassQuickLog.test.tsx` (`git rm`). In `src/ui/styles/train.css` replace `.mass-quick-log,\n.post-session {` with `.post-session {`.

- [ ] **Step 4: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/ui/views`, `npx vitest run --maxWorkers=1 src/ui/views/TrainView.test.tsx src/ui/views/train src/ui/measurements src/app`
Expected: PASS. `grep -rn "BodyMassQuickLog" src` prints only the historical comment in `src/content/copy.limelight.ts` (a comment; leave it, rule 4 forbids rewording that table's prose).

- [ ] **Step 5: e2e (written here, run by the runner)**

Append to `e2e/p5-measurements.spec.ts` (and extend its imports with `logSet`, `startFromToday` from `./support/app` and `preMassLabel`, `postMassLabel` from `./support/constants`):
```ts
test('G01: a pre-session weigh-in after Start makes the 2 % fluid-loss flag fire', async ({ context }) => {
  await seedDocument(context, e2eDocument({ weighInOptIn: true }));
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  await startFromToday(page);
  await page.getByLabel(preMassLabel(), { exact: true }).fill('80');
  await page.getByRole('button', { name: LABEL.logBodyMass, exact: true }).click();
  // Before G01 the field stayed on screen: every mass it stored was "after Start".
  await expect(page.getByLabel(preMassLabel(), { exact: true })).toHaveCount(0);
  await logSet(page, 1, '60', '5');
  await page.getByRole('button', { name: LABEL.finish }).dispatchEvent('click');
  await page.getByLabel(postMassLabel(), { exact: true }).fill('77.5'); // [kg] 3.1 % below 80
  await page.getByRole('button', { name: LABEL.logBodyMass, exact: true }).click();
  await expect(page.getByText(LABEL.fluidLoss)).toBeVisible();
});
```
Runner: `npm run e2e -- e2e/p5-measurements.spec.ts` (expected `6 passed`), then `npm run e2e`.

- [ ] **Step 6: Commit**

```bash
git rm -- src/ui/views/train/BodyMassQuickLog.tsx src/ui/views/train/BodyMassQuickLog.test.tsx
git add -- src/ui/views/TrainView.tsx src/ui/views/TrainView.test.tsx src/ui/styles/train.css e2e/p5-measurements.spec.ts
git commit -m "feat(train): pre/post weigh-ins stored by role; the fluid-loss flag fires; quick log retired (R9, G01, G12)"
```

---

### Task 8: One fluid target, an always-available quick add, unit-aware fields (G07, G14, G23, G21 banner)

**Files:**
- Modify: `src/domain/units.ts` (`formatVolume`; add `displayVolume`, `toStoredVolume`), `src/domain/units.test.ts`
- Modify: `src/domain/training/hydration.ts` (`hydrationCue`'s `state` parameter type only)
- Create: `src/ui/measurements/FluidQuickAdd.tsx`, `src/ui/measurements/FluidQuickAdd.test.tsx`
- Modify: `src/ui/views/TodayView.tsx` (mount), `src/ui/views/TargetsView.tsx` (`target-fluid` row), `src/ui/views/SettingsView.tsx` (fluid target and cup size), `src/ui/views/train/HydrationBanner.tsx` (narrow selectors)
- Test: `src/ui/views/TargetsView.test.tsx`, `src/ui/views/SettingsView.test.tsx` (append), `src/domain/export/summary.test.ts` and `src/ui/setup/SetupWizard.test.tsx` (only where a run shows a whole-ounce string)
- Modify: `src/content/copy.ts`, `src/content/__fixtures__/limelight-resolved.json` (five keys)

**Interfaces:**
- Consumes: `addHydration`, `removeDrink` (Task 3); `useToasts`; `UNDO_WINDOW_MS`; `AsciiBar` (`src/ui/components/AsciiBar.tsx`, props `value`, `target`, `label`, `testId`).
- Produces: `displayVolume(ml: ML, units: UnitSystem): number` (mL, or fl oz to 0.1); `toStoredVolume(entered: number, units: UnitSystem): ML` (whole mL, the schema's integer); `formatVolume` prints fl oz to 0.1; `hydrationCue(state: Pick<AppState, 'profiles' | 'assignments' | 'hydration' | 'bodyMass'>, ...)`; `FluidQuickAdd(props: { profile: Profile; today: LocalDate }): ReactElement`.
- Copy keys: `quantity.drinkVolume`, `button.logDrink`, `status.drinkLogged`, `quantity.cupSize`, `label.fluidProgress`.

Design: the stored, editable `profile.hydration.dailyTargetML` is THE fluid target everywhere (Targets, Today's progress, the banner); the IOM 2005 figure is shown beside it as the reference with the existing `FORMAT.beverageDefault`/`beveragePerSex` sentence (G14). Today gets a fluid section on every day: one cup tap (the editable cup size), a custom volume in the display unit, a 6 s Undo, and the day's progress (G07). Settings asks for the target and the cup in the display unit and stores whole mL (G14). Imperial volumes print to 0.1 fl oz, so a 250 mL cup reads 8.5 fl oz and three of them 25.4 fl oz (G23). The banner subscribes to the four records `hydrationCue` reads instead of the whole store (G21). Rejected: an imperial 237 mL default cup only (existing 250 mL cups stay mislabelled).

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/units.test.ts` (and import `displayVolume`, `toStoredVolume`):
```ts
describe('volumes in the display unit (audit G14, G23)', () => {
  it('prints fl oz to 0.1, so a cup and its sum agree', () => {
    expect(formatVolume(250, 'imperial')).toBe('8.5 fl oz'); // [mL] -> [fl oz]
    expect(formatVolume(750, 'imperial')).toBe('25.4 fl oz');
    expect(formatVolume(3000, 'metric')).toBe('3000 mL');
  });

  it('stores a typed volume as whole mL and shows it back', () => {
    expect(toStoredVolume(8, 'imperial')).toBe(237); // [mL] 8 x 29.5735 rounded to the schema's integer
    expect(toStoredVolume(330, 'metric')).toBe(330);
    expect(displayVolume(237, 'imperial')).toBe(8); // [fl oz] to 0.1
    expect(displayVolume(3000, 'metric')).toBe(3000);
  });
});
```
and change the existing `expect(formatVolume(500, 'imperial')).toBe('17 fl oz');` to `expect(formatVolume(500, 'imperial')).toBe('16.9 fl oz');`.

Create `src/ui/measurements/FluidQuickAdd.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMAT, SKIN_COPY, copy, copyFor } from '../../content/copy';
import { defaultState } from '../../domain/schema';
import type { Profile } from '../../domain/types';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { makeProfile } from '../../test/fixtures';
import { ToastProvider, ToastQueue } from '../components/ToastQueue';
import { FluidQuickAdd } from './FluidQuickAdd';

const P = 'profile-1';
const TODAY = '2026-03-03';
const NOW = Date.UTC(2026, 2, 3, 8, 0); // [ms] epoch UTC, 10:00 in Athens: no cue is showing

function mount(profile: Profile): void {
  installFakeStorage();
  useAppStore.setState({
    ...defaultState(),
    ui: { ...defaultState().ui, skin: 'limelight' },
    activeProfileId: P,
    profiles: { [P]: profile },
    hydration: { [P]: [] },
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
  render(
    <ToastProvider>
      <FluidQuickAdd profile={profile} today={TODAY} />
      <ToastQueue />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

describe('FluidQuickAdd (spec R9, audit G07)', () => {
  it('logs one cup at 10:00, with no cue showing, and shows progress against the stored target', () => {
    mount(makeProfile());
    fireEvent.click(screen.getByRole('button', { name: FORMAT.logVolume('250 mL', SKIN_COPY.limelight) }));
    expect(useAppStore.getState().hydration[P]?.[0]).toMatchObject({ date: TODAY, volumeML: 250 }); // [mL]
    expect(screen.getByTestId('fluid-progress')).toHaveTextContent(FORMAT.valueOfTarget('250 mL', '3000 mL'));
  });

  it('logs a custom volume typed in fl oz as whole mL, and Undo takes it back', () => {
    mount(makeProfile({ units: 'imperial' }));
    fireEvent.change(screen.getByLabelText(`${copy('quantity.drinkVolume')} (fl oz)`), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: copy('button.logDrink') }));
    expect(useAppStore.getState().hydration[P]?.[0]?.volumeML).toBe(355); // [mL] 12 x 29.5735
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.undo') }));
    expect(useAppStore.getState().hydration[P]?.[0]?.volumeML).toBe(0);
  });

  it('refuses an empty or non-positive custom volume in words', () => {
    mount(makeProfile());
    fireEvent.click(screen.getByRole('button', { name: copy('button.logDrink') }));
    expect(screen.getByRole('alert')).toHaveTextContent(copy('error.valueRequired'));
    fireEvent.change(screen.getByLabelText(`${copy('quantity.drinkVolume')} (mL)`), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: copy('button.logDrink') }));
    expect(screen.getByRole('alert')).toHaveTextContent(copy('error.positive'));
    expect(useAppStore.getState().hydration[P]).toEqual([]);
  });
});
```
In `src/ui/views/TargetsView.test.tsx`, add to `describe('TargetsView', ...)`:
```tsx
  it('states the stored fluid target, with the IOM figure as the reference beside it (G14)', () => {
    useAppStore.getState().updateProfile('p1', {
      hydration: { ...PROFILE.hydration, dailyTargetML: 2500 }, // [mL/day] edited in Settings
    });
    render(<TargetsView />);
    expect(screen.getByTestId('target-fluid')).toHaveTextContent('2500 mL');
    expect(screen.getByTestId('fluid-reference')).toHaveTextContent(FORMAT.beverageDefault('3000 mL'));
  });
```
and change the imperial assertion `toHaveTextContent('101 fl oz'); // 3000 mL` to `toHaveTextContent('101.4 fl oz'); // 3000 mL`.
Append to `src/ui/views/SettingsView.test.tsx` (it already renders `SettingsView` and seeds a profile in its `beforeEach`; reuse its helpers):
```tsx
describe('fluid fields in the display unit (audit G14)', () => {
  it('asks an imperial user for fl oz and stores whole mL', async () => {
    useAppStore.getState().updateProfile(useAppStore.getState().activeProfileId ?? '', { units: 'imperial' });
    render(<SettingsView />);
    const target = screen.getByLabelText('Daily beverage target (fl oz)');
    await userEvent.clear(target);
    await userEvent.type(target, '100{Enter}');
    const id = useAppStore.getState().activeProfileId ?? '';
    expect(useAppStore.getState().profiles[id]?.hydration.dailyTargetML).toBe(2957); // [mL/day]
  });

  it('makes the cup size editable', async () => {
    render(<SettingsView />);
    const cup = screen.getByLabelText(`${copy('quantity.cupSize')} (mL)`);
    await userEvent.clear(cup);
    await userEvent.type(cup, '330{Enter}');
    const id = useAppStore.getState().activeProfileId ?? '';
    expect(useAppStore.getState().profiles[id]?.hydration.cupSizeML).toBe(330); // [mL]
  });
});
```
(Import `copy` from `'../../content/copy'` if the file does not already.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/domain/units.test.ts src/ui/measurements/FluidQuickAdd.test.tsx src/ui/views/TargetsView.test.tsx src/ui/views/SettingsView.test.tsx`
Expected: FAIL (whole-ounce rounding; no component; Targets shows the IOM figure; Settings asks in mL).

- [ ] **Step 3: Units**

In `src/domain/units.ts` replace
```ts
/** "500 mL" | "17 fl oz" — whole units; volume is never shown to a decimal. */
export function formatVolume(ml: ML, units: UnitSystem): string {
  if (units === 'metric') return `${Math.round(ml)} ${UNIT_LABEL.metric.volume}`;
  return `${Math.round(ml / ML_PER_US_FL_OZ)} ${UNIT_LABEL.imperial.volume}`; // [fl oz]
}
```
with
```ts
/**
 * A stored volume in the display unit: whole mL, or fl oz to 0.1. Audit G23: whole ounces made a
 * 250 mL cup read "8 fl oz" and three of them "25 fl oz"; at 0.1 they read 8.5 and 25.4.
 */
export function displayVolume(ml: ML, units: UnitSystem): number {
  if (units === 'metric') return Math.round(ml); // [mL]
  return Math.round((ml / ML_PER_US_FL_OZ) * 10) / 10; // [fl oz] to 0.1
}

/** A volume typed in the display unit, stored as the whole mL the schema accepts. [mL] */
export function toStoredVolume(entered: number, units: UnitSystem): ML {
  return Math.round(units === 'metric' ? entered : entered * ML_PER_US_FL_OZ); // [mL]
}

/** "500 mL" | "16.9 fl oz": whole mL, fl oz to 0.1 (displayVolume). */
export function formatVolume(ml: ML, units: UnitSystem): string {
  return `${String(displayVolume(ml, units))} ${UNIT_LABEL[units].volume}`;
}
```
In `src/domain/training/hydration.ts` change the parameter `state: AppState,` of `hydrationCue` to
```ts
  state: Pick<AppState, 'profiles' | 'assignments' | 'hydration' | 'bodyMass'>,
```

- [ ] **Step 4: Copy keys**

In `src/content/copy.ts`, after the union line `  | 'button.dismiss'` add
```ts
  | 'quantity.drinkVolume'
  | 'button.logDrink'
  | 'status.drinkLogged'
  | 'quantity.cupSize'
  | 'label.fluidProgress'
```
and after the table line `  'button.dismiss': 'Dismiss',` add
```ts
  // Spec R9 / audit G07, G14: the always-available fluid quick add and the editable cup.
  'quantity.drinkVolume': 'Drink volume',
  'button.logDrink': 'Log Drink',
  'status.drinkLogged': 'Drink logged.',
  'quantity.cupSize': 'Cup size',
  'label.fluidProgress': 'Fluid Against Target',
```
and the five rows in `src/content/__fixtures__/limelight-resolved.json`.

- [ ] **Step 5: The quick add**

Create `src/ui/measurements/FluidQuickAdd.tsx`:
```tsx
// src/ui/measurements/FluidQuickAdd.tsx
//
// Spec R9 / audit G07: a drink can be logged at any time of any day, not only while a nag is on
// screen. One cup (the profile's editable cup size), or a custom volume in the display unit, each
// with a 6 s Undo; the day's progress is drawn against the ONE stored target (G14). The Train
// banner stays a reminder. No volume is prescribed here (src/domain/training/hydration.ts header).
import { useId, useState, type ReactElement } from 'react';
import { FORMAT } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import type { HydrationEntry, LocalDate, ML, Profile } from '../../domain/types';
import { UNIT_LABEL, formatVolume, toStoredVolume } from '../../domain/units';
import { useAppStore } from '../../store';
import { UNDO_WINDOW_MS } from '../../store/training';
import { AsciiBar } from '../components/AsciiBar';
import { useToasts } from '../components/ToastQueue';
import { UnitInput, parseDecimal } from '../components/UnitInput';
import './measurements.css';

export function FluidQuickAdd(props: { profile: Profile; today: LocalDate }): ReactElement {
  const { profile, today } = props;
  const c = useCopy();
  const overrides = useCopyOverrides();
  const { push } = useToasts();
  const headingId = useId();
  const errorId = useId();
  // The stored entry for the day (stable identity), or null.
  const entry = useAppStore(
    (s): HydrationEntry | null => (s.hydration[profile.id] ?? []).find((e) => e.date === today) ?? null,
  );
  const [text, setText] = useState(''); // as typed, display unit
  const [error, setError] = useState<string | null>(null);
  const loggedML = entry?.volumeML ?? 0; // [mL] today
  const targetML = profile.hydration.dailyTargetML; // [mL/day] the one target (G14)
  const cupML = profile.hydration.cupSizeML; // [mL]

  /** Adds one drink and offers its Undo. False when the store refused it (schema bound). */
  const drink = (volumeML: ML): boolean => {
    const at = Date.now(); // [ms] epoch UTC, the drink's own instant (the Undo removes this mark)
    try {
      useAppStore.getState().addHydration(profile.id, today, volumeML, at);
    } catch {
      return false;
    }
    push({
      kind: 'undo',
      message: c('status.drinkLogged'),
      deadlineAt: at + UNDO_WINDOW_MS, // [ms] epoch UTC
      onUndo: () => {
        useAppStore.getState().removeDrink(profile.id, today, volumeML, at);
      },
    });
    return true;
  };

  const logCustom = (): void => {
    const entered = parseDecimal(text); // [mL] or [fl oz]
    if (entered === null) {
      setError(c('error.valueRequired'));
      return;
    }
    const volumeML = toStoredVolume(entered, profile.units); // [mL]
    if (!(volumeML > 0)) {
      setError(c('error.positive'));
      return;
    }
    if (!drink(volumeML)) {
      setError(c('error.outsideAccepted'));
      return;
    }
    setError(null);
    setText('');
  };

  return (
    <section className="measurements" aria-labelledby={headingId}>
      <h3 id={headingId}>{c('label.fluid')}</h3>
      <p className="view-progress">
        <AsciiBar value={loggedML} target={targetML} label={c('label.fluidProgress')} testId="fluid-bar" />{' '}
        <span data-testid="fluid-progress">
          {FORMAT.valueOfTarget(formatVolume(loggedML, profile.units), formatVolume(targetML, profile.units))}
        </span>
      </p>
      <div className="mass-form">
        <button
          type="button"
          onClick={() => {
            drink(cupML);
          }}
        >
          {FORMAT.logVolume(formatVolume(cupML, profile.units), overrides)}
        </button>
        <div
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            logCustom();
          }}
        >
          <UnitInput
            id="fluid-custom"
            quantity={c('quantity.drinkVolume')}
            unit={UNIT_LABEL[profile.units].volume}
            value={text}
            error={null}
            sharedErrorId={error === null ? null : errorId}
            onChange={(next) => {
              setText(next);
              setError(null);
            }}
          />
        </div>
        <button type="button" onClick={logCustom}>
          {c('button.logDrink')}
        </button>
        {error !== null && (
          <p className="view-error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
```
In `src/ui/views/TodayView.tsx` add `import { FluidQuickAdd } from '../measurements/FluidQuickAdd';` and directly after the `<MeasurementsPanel profile={profile} today={today} />` line (Task 6) add
```tsx
      {/* Spec R9 / audit G07: a drink can be logged at any time, not only when a cue is up. */}
      <FluidQuickAdd profile={profile} today={today} />
```

- [ ] **Step 6: Targets, Settings, banner**

`src/ui/views/TargetsView.tsx`: replace
```tsx
        <dd data-testid="target-fluid">{formatBeverageTarget(targets.fluidML, profile.units)}</dd>
```
with
```tsx
        {/* Audit G14: ONE fluid target, the stored and editable one the quick add and the banner
            measure against; the IOM 2005 figure is the reference beside it. */}
        <dd data-testid="target-fluid">{formatVolume(profile.hydration.dailyTargetML, profile.units)}</dd>
```
and immediately after the closing `</dl>` of that first `<dl className="view-dl">` add
```tsx
      <p className="view-note" data-testid="fluid-reference">
        {targets.fluidML.kind === 'stated'
          ? FORMAT.beverageDefault(formatBeverageTarget(targets.fluidML, profile.units))
          : FORMAT.beveragePerSex(formatBeverageTarget(targets.fluidML, profile.units))}
      </p>
```
and change the units import to `import { displayMass, formatBeverageTarget, formatVolume } from '../../domain/units';`.

`src/ui/views/SettingsView.tsx`:
- Units import: `import { displayLoad, displayVolume, formatBeverageTarget, toStoredLoad, toStoredVolume, UNIT_LABEL } from '../../domain/units';`
- Replace `fluidError` with a factory both fields use:
```ts
  /** A volume field of `hydration`, refused as the schema would refuse it (G14). [display unit] */
  const volumeError =
    (field: 'dailyTargetML' | 'cupSizeML') =>
    (value: number | null): string | null => {
      if (value === null) return t('error.valueRequired');
      const ml = toStoredVolume(value, units); // [mL]
      // A zero or negative target is a broken DENOMINATOR (volume/target), not a preference, and
      // a zero cup logs nothing; updateProfile throws on the first, the schema on neither, so
      // both are caught here.
      if (!(ml > 0)) return t('error.positive');
      const patched = { ...profile.hydration, [field]: ml }; // [mL]
      return ProfileSchema.shape.hydration.safeParse(patched).success ? null : t('error.outsideAccepted');
    };
```
- Replace the whole `<NumberSetting key="fluid" ... />` element with:
```tsx
      <NumberSetting
        key={`fluid-${units}`}
        id="settings-fluid-target"
        quantity={t('quantity.dailyBeverageTarget')}
        // Audit G14: asked and shown in the display unit, stored as whole mL (toStoredVolume).
        unit={UNIT_LABEL[units].volume}
        initial={String(displayVolume(profile.hydration.dailyTargetML, units))}
        validate={volumeError('dailyTargetML')}
        commit={(value) => {
          updateProfile({
            hydration: { ...profile.hydration, dailyTargetML: toStoredVolume(value, units) }, // [mL/day]
          });
        }}
      />
      <NumberSetting
        key={`cup-${units}`}
        id="settings-cup-size"
        quantity={t('quantity.cupSize')}
        unit={UNIT_LABEL[units].volume}
        initial={String(displayVolume(profile.hydration.cupSizeML, units))}
        validate={volumeError('cupSizeML')}
        commit={(value) => {
          updateProfile({
            hydration: { ...profile.hydration, cupSizeML: toStoredVolume(value, units) }, // [mL]
          });
        }}
      />
```
(If P1 Task 9 or a later edit made `ProfileSchema` a non-object, use the same `.shape` access it uses for `equipmentSteps`; this plan keeps `ProfileSchema` a `z.object`.)

`src/ui/views/train/HydrationBanner.tsx`: replace `const state = useAppStore();` and its preceding comment with
```ts
  /*
   * Audit G21: the four records hydrationCue reads, each a stable reference, instead of the whole
   * store (which re-rendered this banner on every set logged). Combined in a memo so the
   * snapshot never changes identity between unrelated updates.
   */
  const profiles = useAppStore((s) => s.profiles);
  const assignments = useAppStore((s) => s.assignments);
  const hydration = useAppStore((s) => s.hydration);
  const bodyMass = useAppStore((s) => s.bodyMass);
  const records = useMemo(
    () => ({ profiles, assignments, hydration, bodyMass }),
    [profiles, assignments, hydration, bodyMass],
  );
```
change `const cue = hydrationCue(state, profile.id, now, sessionActive);` to `const cue = hydrationCue(records, profile.id, now, sessionActive);`, change `state.addHydration(` to `useAppStore.getState().addHydration(`, and add `useMemo` to the React import. Put the four selector lines and the memo ABOVE `const cue` and above any early return (hooks order).

- [ ] **Step 7: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/ui src/domain`, then `npx vitest run --maxWorkers=1 src/domain src/ui/measurements src/ui/views/TargetsView.test.tsx src/ui/views/SettingsView.test.tsx src/ui/views/train src/ui/views/TodayView.test.tsx src/content` and `npx vitest run --maxWorkers=1 src/ui/setup`
Expected: PASS after updating every whole-ounce assertion the run reports (grep found `src/domain/export/summary.test.ts`, `src/ui/setup/SetupWizard.test.tsx`, `src/ui/views/TargetsView.test.tsx`, `src/domain/units.test.ts` containing "fl oz"): replace the expected string with the 0.1 value `formatVolume` now prints, and list each changed assertion in the commit body.

- [ ] **Step 8: Commit**

```bash
git add -- src/domain/units.ts src/domain/units.test.ts src/domain/training/hydration.ts src/ui/measurements/FluidQuickAdd.tsx src/ui/measurements/FluidQuickAdd.test.tsx src/ui/views/TodayView.tsx src/ui/views/TargetsView.tsx src/ui/views/TargetsView.test.tsx src/ui/views/SettingsView.tsx src/ui/views/SettingsView.test.tsx src/ui/views/train/HydrationBanner.tsx src/content/copy.ts src/content/__fixtures__/limelight-resolved.json
git commit -m "feat(fluid): one stored target, any-time quick add with undo, unit-aware fields, 0.1 fl oz (R9, G07, G14, G23, G21)"
```
(Add `src/domain/export/summary.test.ts` and `src/ui/setup/SetupWizard.test.tsx` to the pathspec if Step 7 changed them.)

---

### Task 9: Profile editor with the wizard's rules, and a dated body-fat re-measure (G06, G05)

**Files:**
- Create: `src/ui/settings/ProfileEditor.tsx`, `src/ui/settings/ProfileEditor.test.tsx`
- Modify: `src/ui/views/SettingsView.tsx` (one import, one mount)
- Modify: `src/content/copy.ts`, `src/content/__fixtures__/limelight-resolved.json` (six keys)

**Interfaces:**
- Consumes: `heightCmFromParts`, `heightCmError`, `requiredIntegerInRange`, `requiredInRange`, `massDomainError`, `birthYearBound`, `round1`, `UNIT`, `CM_PER_INCH`, `CM_PER_METRE`, `INCHES_PER_FOOT` (Task 4); `bodyMassEntryError` (Task 4); `latestBodyMassEntry` (Task 1); `logBodyMass` (Task 3); `updateProfile` (throws on refusal since P1 Task 9); `NUTRITION_DOMAIN`, `isValidLocalDate`, `todayLocal`; `UnitInput`, `storedMassKg`, `massUnit`, `parseDecimal`.
- Produces: `ProfileEditor(props: { profile: Profile }): JSX.Element` (remount with `key={profile.id + profile.units}`); copy keys `hero.editBody`, `quantity.birthYear`, `button.saveProfile`, `status.profileSaved`, `hero.bodyFatRemeasure`, `button.logBodyFat`.

Design (G06): one form for the six setup facts that had no editor: height (metres + centimetres or feet + inches, as setup asks), birth year (stored directly; bounded so this year's age is inside NUTRITION_DOMAIN), sex (with `nd` the body-fat field becomes required, decision A1, the same rule `isInDomain` applies), setup body fat (optional), target mass (optional, display unit) and target date (optional). Every check is a `fieldRules` function, so setup and Settings refuse the same things (rule 2). One Save writes `body` and `goal` in one `updateProfile`; an unchanged height field keeps the stored cm exactly (review R2's rule). Below it, the re-measure (G05, ROADMAP L10): body fat % plus today's mass (prefilled from the newest weigh-in), stored as a dated `morning` entry carrying `bodyFatPct`; targets read the newest such entry (Task 1). Rejected: making setup body fat the only body-fat input (it froze body fat at setup, G05).

- [ ] **Step 1: Write the failing test**

Create `src/ui/settings/ProfileEditor.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMAT, copy, copyFor } from '../../content/copy';
import { NUTRITION_DOMAIN } from '../../domain/nutrition';
import { defaultState } from '../../domain/schema';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { makeProfile } from '../../test/fixtures';
import { ProfileEditor } from './ProfileEditor';

const P = 'profile-1';
const NOW = Date.UTC(2026, 8, 7, 9, 0); // [ms] epoch UTC; 2026-09-07 in Athens

function mount(patch: Parameters<typeof makeProfile>[0] = {}): void {
  installFakeStorage();
  const profile = makeProfile(patch);
  useAppStore.setState({
    ...defaultState(),
    ui: { ...defaultState().ui, skin: 'limelight' },
    activeProfileId: P,
    profiles: { [P]: profile },
    bodyMass: { [P]: [] },
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
  render(<ProfileEditor profile={profile} />);
}

function field(label: string): HTMLElement {
  return screen.getByLabelText(label);
}

function save(): void {
  fireEvent.click(screen.getByRole('button', { name: copy('button.saveProfile') }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

describe('ProfileEditor (spec R9, audit G06)', () => {
  it('corrects a setup height typo and a birth year', () => {
    mount({ body: { ...makeProfile().body, heightCm: 108 } }); // [cm] 180 typed as 108
    fireEvent.change(field(copyFor('limelight', 'label.centimetres')), { target: { value: '80' } });
    fireEvent.change(field(copy('quantity.birthYear')), { target: { value: '1990' } });
    save();
    const stored = useAppStore.getState().profiles[P]?.body;
    expect(stored?.heightCm).toBe(180); // [cm]
    expect(stored?.birthYear).toBe(1990); // [year]
    expect(screen.getByRole('status')).toHaveTextContent(copy('status.profileSaved'));
  });

  it('keeps an untouched height exactly (no display rounding)', () => {
    mount({ body: { ...makeProfile().body, heightCm: 180.34 } }); // [cm] 5 ft 11 in
    fireEvent.change(field(copy('quantity.birthYear')), { target: { value: '1991' } });
    save();
    expect(useAppStore.getState().profiles[P]?.body.heightCm).toBe(180.34);
  });

  it('refuses what setup refuses, naming the bound, and writes nothing', () => {
    mount();
    const before = useAppStore.getState().profiles[P];
    fireEvent.change(field(copy('quantity.birthYear')), { target: { value: '2015' } }); // age 11
    fireEvent.change(field(copyFor('limelight', 'label.metres')), { target: { value: '3' } });
    save();
    const bound = { lo: 2026 - NUTRITION_DOMAIN.ageYears.hi, hi: 2026 - NUTRITION_DOMAIN.ageYears.lo };
    expect(screen.getByText(FORMAT.outOfRange(copy('quantity.birthYear'), bound.lo, bound.hi))).toBeTruthy();
    expect(screen.getByText(FORMAT.outOfRange(copy('quantity.height'), 120, 230, 'cm'))).toBeTruthy();
    expect(useAppStore.getState().profiles[P]).toBe(before);
  });

  it('requires body fat once the sex is not disclosed (decision A1)', () => {
    mount();
    fireEvent.change(field(copyFor('limelight', 'label.sex')), { target: { value: 'nd' } });
    save();
    expect(screen.getByText(copy('error.valueRequired'))).toBeTruthy();
    // Two fields carry "Body fat (%)": the setup value here, the re-measure below.
    fireEvent.change(screen.getByLabelText(`${copy('quantity.bodyFat')} (%)`, { selector: '#profile-bodyfat' }), {
      target: { value: '22' },
    });
    save();
    expect(useAppStore.getState().profiles[P]?.body).toMatchObject({ sex: 'nd', baselineBodyFatPct: 22 });
  });

  it('edits the target mass and date, and clears them when emptied', () => {
    mount();
    fireEvent.change(field(`${copy('quantity.targetBodyMass')} (kg)`), { target: { value: '85' } });
    fireEvent.change(field(copyFor('limelight', 'label.targetDate')), { target: { value: '2026-12-31' } });
    save();
    expect(useAppStore.getState().profiles[P]?.goal).toMatchObject({ targetMassKg: 85, targetDate: '2026-12-31' });
    fireEvent.change(field(`${copy('quantity.targetBodyMass')} (kg)`), { target: { value: '' } });
    fireEvent.change(field(copyFor('limelight', 'label.targetDate')), { target: { value: '' } });
    save();
    expect(useAppStore.getState().profiles[P]?.goal).toMatchObject({ targetMassKg: null, targetDate: null });
  });
});

describe('body-fat re-measure (audit G05, ROADMAP L10)', () => {
  it('stores a dated morning entry carrying the body fat, which targets then read', () => {
    mount();
    fireEvent.change(screen.getByLabelText(`${copy('quantity.bodyFat')} (%)`, { selector: '#bodyfat-remeasure-pct' }), {
      target: { value: '21,5' },
    });
    fireEvent.change(screen.getByLabelText(`${copy('quantity.bodyMass')} (kg)`), { target: { value: '93' } });
    fireEvent.click(screen.getByRole('button', { name: copy('button.logBodyFat') }));
    expect(useAppStore.getState().bodyMass[P]).toMatchObject([
      { date: '2026-09-07', massKg: 93, bodyFatPct: 21.5, role: 'morning' }, // [kg], [%]
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=1 src/ui/settings/ProfileEditor.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Copy keys**

In `src/content/copy.ts`, after the union line `  | 'button.dismiss'` add
```ts
  | 'hero.editBody'
  | 'quantity.birthYear'
  | 'button.saveProfile'
  | 'status.profileSaved'
  | 'hero.bodyFatRemeasure'
  | 'button.logBodyFat'
```
and after the table line `  'button.dismiss': 'Dismiss',` add
```ts
  // Spec R9 / audit G06, G05: the setup facts made editable, and the dated body-fat re-measure.
  'hero.editBody': 'Body And Goal',
  'quantity.birthYear': 'Birth year',
  'button.saveProfile': 'Save Profile',
  'status.profileSaved': 'Profile saved.',
  'hero.bodyFatRemeasure': 'Re-Measure Body Fat',
  'button.logBodyFat': 'Log Body Fat',
```
and the six fixture rows.

- [ ] **Step 4: The editor**

Create `src/ui/settings/ProfileEditor.tsx`:
```tsx
// src/ui/settings/ProfileEditor.tsx
//
// Spec R9 / audit G06: the setup facts that had no editor (height, birth year, sex, setup body
// fat, target mass, target date), checked by the wizard's own rules (src/ui/setup/fieldRules.ts),
// and the dated body-fat re-measure (G05). Units: height [cm], mass [kg], body fat [% of body mass],
// dates LocalDate in the profile's zone.
import { useState, type JSX } from 'react';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { isValidLocalDate, todayLocal } from '../../domain/dates';
import { latestBodyMassEntry } from '../../domain/measurements';
import { NUTRITION_DOMAIN } from '../../domain/nutrition';
import type { Profile, Sex } from '../../domain/types';
import { displayMass } from '../../domain/units';
import { useAppStore } from '../../store';
import { UnitInput, massUnit, parseDecimal, storedMassKg } from '../components/UnitInput';
import {
  CM_PER_INCH,
  CM_PER_METRE,
  INCHES_PER_FOOT,
  UNIT,
  birthYearBound,
  bodyMassEntryError,
  heightCmError,
  heightCmFromParts,
  massDomainError,
  requiredInRange,
  requiredIntegerInRange,
  round1,
} from '../setup/fieldRules';

const SEX_OPTIONS: readonly { value: Sex; key: 'label.sexMale' | 'label.sexFemale' | 'label.sexNotDisclosed' }[] = [
  { value: 'male', key: 'label.sexMale' },
  { value: 'female', key: 'label.sexFemale' },
  { value: 'nd', key: 'label.sexNotDisclosed' },
];

/** The two height fields as setup shows them, from the stored cm. [cm] -> m + cm, or ft + in. */
function heightParts(heightCm: number, units: Profile['units']): { a: string; b: string } {
  if (units === 'metric') {
    const m = Math.floor(heightCm / CM_PER_METRE); // [m]
    return { a: String(m), b: String(round1(heightCm - m * CM_PER_METRE)) }; // [cm]
  }
  const totalIn = heightCm / CM_PER_INCH; // [in]
  const ft = Math.floor(totalIn / INCHES_PER_FOOT); // [ft]
  return { a: String(ft), b: String(round1(totalIn - ft * INCHES_PER_FOOT)) }; // [in]
}

/** A stored mass as typed: display unit at 0.1, '' for none. */
function massText(kg: number | null, units: Profile['units']): string {
  return kg === null ? '' : String(displayMass(kg, units)); // [kg] or [lb]
}

export function ProfileEditor(props: { profile: Profile }): JSX.Element {
  const { profile } = props;
  const t = useCopy();
  const overrides = useCopyOverrides();
  const units = profile.units;
  const today = todayLocal(profile.timezone);
  const initialHeight = heightParts(profile.body.heightCm, units);
  const [heightA, setHeightA] = useState(initialHeight.a); // [m] or [ft], as typed
  const [heightB, setHeightB] = useState(initialHeight.b); // [cm] or [in], as typed
  const [birthYear, setBirthYear] = useState(String(profile.body.birthYear)); // [year]
  const [sex, setSex] = useState<Sex>(profile.body.sex);
  const [bodyFat, setBodyFat] = useState(
    profile.body.baselineBodyFatPct === null ? '' : String(profile.body.baselineBodyFatPct),
  ); // [%]
  const [targetMass, setTargetMass] = useState(massText(profile.goal.targetMassKg, units));
  const [targetDate, setTargetDate] = useState(profile.goal.targetDate ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const heightUntouched = heightA === initialHeight.a && heightB === initialHeight.b;
  const heightCm = heightUntouched
    ? profile.body.heightCm // [cm] review R2: the stored value, not its 0.1 display
    : heightCmFromParts(units, {
        m: heightA,
        cm: heightB,
        ft: heightA,
        inch: heightB,
      });
  const errors = {
    height: heightCmError(heightCm, units, overrides),
    birthYear: requiredIntegerInRange(t('quantity.birthYear'), birthYear, birthYearBound(today), overrides),
    // Decision A1: with no stated sex only Cunningham remains, which needs body fat (isInDomain).
    bodyFat:
      bodyFat.trim() === ''
        ? sex === 'nd'
          ? t('error.valueRequired')
          : null
        : requiredInRange(t('quantity.bodyFat'), bodyFat, NUTRITION_DOMAIN.bodyFatPct, overrides, UNIT.pct),
    targetMass:
      targetMass.trim() === '' ? null : massDomainError(t('quantity.targetBodyMass'), targetMass, units, overrides),
    targetDate: targetDate === '' || isValidLocalDate(targetDate) ? null : t('error.valueRequired'),
  };
  const shown = (message: string | null): string | null => (submitted ? message : null);

  const save = (): void => {
    setSubmitted(true);
    setStatus(null);
    if (Object.values(errors).some((e) => e !== null) || heightCm === null) return;
    const birth = parseDecimal(birthYear); // [year], an integer by the rule above
    if (birth === null) return;
    try {
      useAppStore.getState().updateProfile(profile.id, {
        body: {
          ...profile.body,
          heightCm, // [cm]
          birthYear: birth, // [year]
          sex,
          baselineBodyFatPct: bodyFat.trim() === '' ? null : parseDecimal(bodyFat), // [%]
        },
        goal: {
          ...profile.goal,
          targetMassKg: targetMass.trim() === '' ? null : storedMassKg(targetMass, units), // [kg]
          targetDate: targetDate === '' ? null : targetDate,
        },
      });
    } catch {
      // Spec R5: the store refused; nothing was written.
      setStatus(t('error.outsideAccepted'));
      return;
    }
    setSubmitted(false);
    setStatus(t('status.profileSaved'));
  };

  return (
    <section className="view-section">
      <h3>{t('hero.editBody')}</h3>
      <div className="view-field">
        <p className="view-label">{t('quantity.height')}</p>
        <div className="mass-form">
          <UnitInput
            id="profile-height-a"
            quantity={t(units === 'metric' ? 'label.metres' : 'label.feet')}
            unit={null}
            inputMode="numeric"
            value={heightA}
            error={null}
            onChange={setHeightA}
          />
          <UnitInput
            id="profile-height-b"
            quantity={t(units === 'metric' ? 'label.centimetres' : 'label.inches')}
            unit={null}
            value={heightB}
            error={null}
            onChange={setHeightB}
          />
        </div>
        {shown(errors.height) !== null && <p className="view-error" role="alert">{errors.height}</p>}
      </div>
      <UnitInput
        id="profile-birth-year"
        quantity={t('quantity.birthYear')}
        unit={null}
        inputMode="numeric"
        value={birthYear}
        error={null}
        onChange={setBirthYear}
      />
      {shown(errors.birthYear) !== null && <p className="view-error" role="alert">{errors.birthYear}</p>}
      <div className="view-field">
        <label htmlFor="profile-sex">{t('label.sex')}</label>
        <select
          id="profile-sex"
          value={sex}
          onChange={(e) => {
            const next = SEX_OPTIONS.find((o) => o.value === e.target.value);
            if (next !== undefined) setSex(next.value);
          }}
        >
          {SEX_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.key)}
            </option>
          ))}
        </select>
      </div>
      <UnitInput id="profile-bodyfat" quantity={t('quantity.bodyFat')} unit={UNIT.pct} value={bodyFat} error={null} onChange={setBodyFat} />
      {shown(errors.bodyFat) !== null && <p className="view-error" role="alert">{errors.bodyFat}</p>}
      <UnitInput
        id="profile-target-mass"
        quantity={t('quantity.targetBodyMass')}
        unit={massUnit(units)}
        value={targetMass}
        error={null}
        onChange={setTargetMass}
      />
      {shown(errors.targetMass) !== null && <p className="view-error" role="alert">{errors.targetMass}</p>}
      <div className="view-field">
        <label htmlFor="profile-target-date">{t('label.targetDate')}</label>
        <input
          id="profile-target-date"
          type="date"
          value={targetDate}
          onChange={(e) => {
            setTargetDate(e.target.value);
          }}
        />
      </div>
      {shown(errors.targetDate) !== null && <p className="view-error" role="alert">{errors.targetDate}</p>}
      <button type="button" onClick={save}>
        {t('button.saveProfile')}
      </button>
      {status !== null && <p className="view-note" role="status">{status}</p>}
      <BodyFatRemeasure profile={profile} today={today} />
    </section>
  );
}

/**
 * Audit G05 / ROADMAP L10: body fat re-measured as a dated weigh-in carrying the percentage
 * (role `morning`), so targets read it as the newest body fat instead of the setup value.
 */
function BodyFatRemeasure(props: { profile: Profile; today: string }): JSX.Element {
  const { profile, today } = props;
  const t = useCopy();
  const overrides = useCopyOverrides();
  const latest = useAppStore((s) => latestBodyMassEntry(s, profile.id));
  const [pct, setPct] = useState(''); // [%] as typed
  const [mass, setMass] = useState(() => massText(latest?.massKg ?? profile.body.baselineMassKg, profile.units));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const log = (): void => {
    setStatus(null);
    const pctError =
      pct.trim() === ''
        ? t('error.valueRequired')
        : requiredInRange(t('quantity.bodyFat'), pct, NUTRITION_DOMAIN.bodyFatPct, overrides, UNIT.pct);
    const massError = bodyMassEntryError(t('quantity.bodyMass'), mass, profile.units, overrides);
    const bodyFatPct = parseDecimal(pct); // [%]
    const massKg = storedMassKg(mass, profile.units); // [kg]
    if (pctError !== null || massError !== null || bodyFatPct === null || massKg === null) {
      setError(pctError ?? massError ?? t('error.valueRequired'));
      return;
    }
    try {
      useAppStore.getState().logBodyMass(
        { profileId: profile.id, date: today, massKg, enteredUnit: profile.units, bodyFatPct, role: 'morning' },
        Date.now(), // [ms] epoch UTC
      );
    } catch {
      setError(t('error.outsideAccepted'));
      return;
    }
    setError(null);
    setPct('');
    setStatus(t('status.massLogged'));
  };

  return (
    <div className="view-field">
      <h3>{t('hero.bodyFatRemeasure')}</h3>
      <UnitInput id="bodyfat-remeasure-pct" quantity={t('quantity.bodyFat')} unit={UNIT.pct} value={pct} error={null} onChange={setPct} />
      <UnitInput
        id="bodyfat-remeasure-mass"
        quantity={t('quantity.bodyMass')}
        unit={massUnit(profile.units)}
        value={mass}
        error={null}
        onChange={setMass}
      />
      <button type="button" onClick={log}>
        {t('button.logBodyFat')}
      </button>
      {error !== null && <p className="view-error" role="alert">{error}</p>}
      {status !== null && <p className="view-note" role="status">{status}</p>}
    </div>
  );
}
```

In `src/ui/views/SettingsView.tsx` add `import { ProfileEditor } from '../settings/ProfileEditor';` and immediately after `<TimeZoneSetting key={profile.id} profile={profile} />` insert
```tsx
      {/* Spec R9 / audit G06, G05: the setup facts, editable with the wizard's rules. */}
      <ProfileEditor key={`editor-${profile.id}-${profile.units}`} profile={profile} />
```

- [ ] **Step 5: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/ui/settings`, `npx vitest run --maxWorkers=1 src/ui/settings src/ui/views/SettingsView.test.tsx src/content`
Expected: PASS. A SettingsView test that finds a field by a label the editor now repeats ("Body fat", "Target Body Mass") is narrowed with `{ selector: '#<its id>' }`; name it in the commit body.

- [ ] **Step 6: Commit**

```bash
git add -- src/ui/settings/ProfileEditor.tsx src/ui/settings/ProfileEditor.test.tsx src/ui/views/SettingsView.tsx src/content/copy.ts src/content/__fixtures__/limelight-resolved.json
git commit -m "feat(settings): edit height, birth year, sex, body fat and targets with the wizard's rules; dated body-fat re-measure (R9, G06, G05)"
```

---

### Task 10: The PAL is the activity value; Settings uses the nine-stop slider (G04)

**Files:**
- Create: `src/domain/activity.ts`, `src/domain/activity.test.ts`
- Create: `src/ui/settings/ActivitySlider.tsx`, `src/ui/settings/ActivitySlider.test.tsx`
- Modify: `src/domain/measurements.ts` (`nutritionInputFor`'s two activity fields)
- Modify: `src/ui/views/SettingsView.tsx` (the `settings-activity` select block; `ACTIVITY_OPTIONS` moves to the slider)

**Interfaces:**
- Consumes: `ACTIVITY_BAND`, `ACTIVITY_FACTOR`, `ACTIVITY_STOPS` (`src/domain/nutrition.ts`), `ACTIVITY_STOP_EXAMPLES` (`src/content/setupSliderExamples.ts`), `updateProfile`.
- Produces: `palOf(profile: Pick<Profile, 'activity' | 'activityPal'>): number` [PAL]; `bandOfPal(pal: number): ActivityLevel`; `withPal(pal: number): { activity: ActivityLevel; activityPal: number }`; `ActivitySlider(props: { profile: Profile }): JSX.Element`; `BAND_LABEL_KEY: Record<ActivityLevel, CopyKey>` in `ActivitySlider.tsx`.

Design (G04): every profile the wizard makes stores a PAL, and computeTargets prefers it, so a Settings select that wrote only the band changed nothing. Now there is one reader (`palOf`: the PAL, else the band floor for a profile from before the slider, exactly computeTargets' old fallback, so no stored number moves) and one writer (`withPal`: the PAL and the band it belongs to, in one patch). Settings shows the same nine FAO/WHO/UNU 2004 stops as setup, with the band and the stop's example. A document that already diverged (band "sedentary", PAL 1.85) keeps the PAL the targets have been using; the stale band is no longer read anywhere. Rejected: deleting `activity` (see Decisions: rollback safety, 30+ fixtures).

- [ ] **Step 1: Write the failing tests**

Create `src/domain/activity.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ACTIVITY_BAND, ACTIVITY_FACTOR, ACTIVITY_STOPS } from './nutrition';
import { bandOfPal, palOf, withPal } from './activity';

describe('the PAL is the one activity value (audit G04)', () => {
  it('reads the stored PAL, else the band floor computeTargets always fell back to', () => {
    expect(palOf({ activity: 'sedentary', activityPal: 1.85 })).toBe(1.85); // [PAL] the diverged G04 document
    expect(palOf({ activity: 'vigorous', activityPal: null })).toBe(ACTIVITY_FACTOR.vigorous);
    expect(palOf({ activity: 'moderate' })).toBe(ACTIVITY_FACTOR.moderate);
  });

  it('derives the band of every stop from the stop table, and of any PAL from the bands', () => {
    for (const stop of ACTIVITY_STOPS) expect(bandOfPal(stop.pal)).toBe(stop.level);
    expect(bandOfPal(1.695)).toBe('sedentary'); // between the printed bands: the lower one
    expect(bandOfPal(ACTIVITY_BAND.vigorous[1])).toBe('vigorous');
  });

  it('writes the PAL and its band together', () => {
    expect(withPal(2.2)).toEqual({ activityPal: 2.2, activity: 'vigorous' });
  });
});
```
Create `src/ui/settings/ActivitySlider.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { copyFor } from '../../content/copy';
import { ACTIVITY_STOP_EXAMPLES } from '../../content/setupSliderExamples';
import { ACTIVITY_STOPS } from '../../domain/nutrition';
import { defaultState } from '../../domain/schema';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { makeProfile } from '../../test/fixtures';
import { ActivitySlider } from './ActivitySlider';

const P = 'profile-1';

beforeEach(() => {
  installFakeStorage();
  useAppStore.setState({
    ...defaultState(),
    ui: { ...defaultState().ui, skin: 'limelight' },
    activeProfileId: P,
    profiles: { [P]: makeProfile({ activity: 'sedentary', activityPal: 1.85 }) },
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
});

describe('ActivitySlider (audit G04)', () => {
  it('shows the stored PAL, not the stale band, and writes PAL and band together', () => {
    const profile = useAppStore.getState().profiles[P];
    if (profile === undefined) throw new Error('no profile');
    render(<ActivitySlider profile={profile} />);
    const slider = screen.getByLabelText(copyFor('limelight', 'label.activity'));
    expect(slider).toHaveValue(String(ACTIVITY_STOPS.findIndex((s) => s.pal === 1.85)));
    expect(screen.getByText(ACTIVITY_STOP_EXAMPLES[1.85] ?? '', { exact: false })).toBeTruthy();
    fireEvent.change(slider, { target: { value: '0' } });
    expect(useAppStore.getState().profiles[P]).toMatchObject({ activityPal: 1.4, activity: 'sedentary' });
    fireEvent.change(slider, { target: { value: String(ACTIVITY_STOPS.length - 1) } });
    expect(useAppStore.getState().profiles[P]).toMatchObject({ activityPal: 2.4, activity: 'vigorous' });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/domain/activity.test.ts src/ui/settings/ActivitySlider.test.tsx`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

Create `src/domain/activity.ts`:
```ts
// src/domain/activity.ts
//
// Audit G04 (AGENTS rule 2): the physical activity level (PAL, dimensionless) is ONE value. The
// stored `activityPal` is it; `activity` is the FAO/WHO/UNU 2004 band it falls in, written beside
// it by `withPal` and read by nothing that computes. A profile from before the nine-stop slider
// has no PAL and uses its band's printed floor, computeTargets' fallback since Brief G, so no
// stored number moves. No new coefficient: the stops and bands are nutrition.ts's.
import { ACTIVITY_BAND, ACTIVITY_FACTOR, ACTIVITY_STOPS } from './nutrition';
import type { ActivityLevel, Profile } from './types';

/** [PAL] The profile's activity value: the stored PAL, else its band's printed floor. */
export function palOf(profile: Pick<Profile, 'activity' | 'activityPal'>): number {
  return profile.activityPal ?? ACTIVITY_FACTOR[profile.activity];
}

/** The band a PAL belongs to: the stop table's own band, else the highest band whose floor it reaches. */
export function bandOfPal(pal: number): ActivityLevel {
  const stop = ACTIVITY_STOPS.find((s) => s.pal === pal);
  if (stop !== undefined) return stop.level;
  if (pal >= ACTIVITY_BAND.vigorous[0]) return 'vigorous';
  if (pal >= ACTIVITY_BAND.moderate[0]) return 'moderate';
  return 'sedentary';
}

/** The one write of the activity value: the PAL and its band, together. [PAL] */
export function withPal(pal: number): { activity: ActivityLevel; activityPal: number } {
  return { activityPal: pal, activity: bandOfPal(pal) };
}
```
In `src/domain/measurements.ts`, in `nutritionInputFor`, replace
```ts
    activity: profile.activity,
    // Brief G: the PAL wins over `activity`'s band floor when it is a number.
    activityPal: profile.activityPal ?? null,
```
with
```ts
    // Audit G04: one activity value. palOf is the PAL, else the band floor (the old fallback).
    activity: bandOfPal(palOf(profile)),
    activityPal: palOf(profile), // [PAL]
```
and add `import { bandOfPal, palOf } from './activity';`.

Create `src/ui/settings/ActivitySlider.tsx`:
```tsx
// src/ui/settings/ActivitySlider.tsx
//
// Audit G04: Settings edits the same nine FAO/WHO/UNU 2004 stops setup offers, and writes the PAL
// and its band in one patch (src/domain/activity.ts withPal). The readout names the band and the
// stop's own example, as the wizard does.
import type { JSX } from 'react';
import type { CopyKey } from '../../content/copy';
import { ACTIVITY_STOP_EXAMPLES } from '../../content/setupSliderExamples';
import { useCopy } from '../../content/useCopy';
import { bandOfPal, palOf, withPal } from '../../domain/activity';
import { ACTIVITY_STOPS } from '../../domain/nutrition';
import type { ActivityLevel, Profile } from '../../domain/types';
import { useAppStore } from '../../store';

/** The band's name, read per render through useCopy (moved here from SettingsView's select). */
export const BAND_LABEL_KEY: Record<ActivityLevel, CopyKey> = {
  sedentary: 'option.activitySedentary',
  moderate: 'option.activityModerate',
  vigorous: 'option.activityVigorous',
};

/** The stop nearest a PAL: exact for every stored stop, nearest for a hand-edited value. */
function stopIndexOf(pal: number): number {
  let best = 0;
  ACTIVITY_STOPS.forEach((s, i) => {
    const current = ACTIVITY_STOPS[best];
    if (current !== undefined && Math.abs(s.pal - pal) < Math.abs(current.pal - pal)) best = i;
  });
  return best;
}

export function ActivitySlider(props: { profile: Profile }): JSX.Element {
  const { profile } = props;
  const t = useCopy();
  const pal = palOf(profile); // [PAL]
  const index = stopIndexOf(pal);

  return (
    <div className="view-field">
      <label htmlFor="settings-activity">{t('label.activity')}</label>
      <input
        id="settings-activity"
        type="range"
        min={0}
        max={ACTIVITY_STOPS.length - 1}
        step={1}
        value={index}
        onChange={(e) => {
          const stop = ACTIVITY_STOPS[Number(e.target.value)];
          if (stop === undefined) return;
          useAppStore.getState().updateProfile(profile.id, withPal(stop.pal));
        }}
      />
      <p className="view-note" aria-live="polite">
        {t(BAND_LABEL_KEY[bandOfPal(pal)])} {ACTIVITY_STOP_EXAMPLES[ACTIVITY_STOPS[index]?.pal ?? pal] ?? ''}
      </p>
    </div>
  );
}
```
In `src/ui/views/SettingsView.tsx`: delete the `ACTIVITY_OPTIONS` constant (its doc comment above `EXPERIENCE_OPTIONS` stays, it describes both lists) and remove `ActivityLevel` from the type import; replace the whole `<div className="view-field">` block that holds `<label htmlFor="settings-activity">` and its `<select id="settings-activity" ...>` with
```tsx
      {/* Audit G04: the nine-stop slider writes the PAL (and its band); a band-only select did nothing. */}
      <ActivitySlider key={`activity-${profile.id}`} profile={profile} />
```
and add `import { ActivitySlider } from '../settings/ActivitySlider';`.

- [ ] **Step 4: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/domain src/ui/settings src/ui/views`, `npx vitest run --maxWorkers=1 src/domain src/store src/ui/settings src/ui/views/SettingsView.test.tsx src/ui/views/TargetsView.test.tsx src/ui/setup`
Expected: PASS; every target number in the existing suites is unchanged (palOf returns the old fallback). `src/store/profile.test.ts` "recomputes when the profile changes" still passes: its profile has no PAL, so the band floor applies.

- [ ] **Step 5: Commit**

```bash
git add -- src/domain/activity.ts src/domain/activity.test.ts src/domain/measurements.ts src/ui/settings/ActivitySlider.tsx src/ui/settings/ActivitySlider.test.tsx src/ui/views/SettingsView.tsx
git commit -m "fix(activity): the PAL is the one activity value; Settings edits it on the nine-stop slider (G04)"
```

---

### Task 11: Targets: a civil clock that ticks, the out-of-range field named, seven days of intake (G13, G09, G17, G22)

**Files:**
- Modify: `src/store/selectors.ts` (`useNutritionTargets` split into `useNutritionInput` + `useNutritionTargets`; add `useCivilToday`)
- Modify: `src/domain/measurements.ts` (add `nutritionDomainIssue`), `src/domain/measurements.test.ts` (append)
- Create: `src/content/rmrEquations.ts`
- Modify: `src/ui/setup/SetupWizard.tsx` (delete its private `RMR_EQUATION_NAME`; import the shared one)
- Rewrite: `src/ui/views/TargetsView.tsx` (whole file below; it carries P1 Task 13's text inputs and Task 8's fluid rows)
- Test: `src/ui/views/TargetsView.test.tsx` (append)
- Modify: `src/content/copy.ts`, `src/content/__fixtures__/limelight-resolved.json` (three keys)

**Interfaces:**
- Consumes: `nutritionInputFor`, `latestBodyMassEntry`, `latestBodyFatEntry` (Task 1); `useMinuteClock` (`src/store/selectors.ts`); `formatVolume` (Task 8); `addDays`, `todayLocal` (`src/domain/dates.ts`); `parseDecimal` (comma-aware, P1 Task 13).
- Produces:
  - `useCivilToday(): LocalDate | null` (active profile's civil date; re-read every minute and on `visibilitychange`, via `useMinuteClock`).
  - `useNutritionInput(now?: EpochMs): NutritionInput | null`; `useNutritionTargets(now?: EpochMs)` unchanged in signature and result.
  - `type DomainField = 'massKg' | 'heightCm' | 'ageYears' | 'bodyFatPct' | 'sessionsPerWeek'`; `nutritionDomainIssue(input: NutritionInput): DomainField | null` (null iff `isInDomain(input)`).
  - `RMR_EQUATION_NAME: Record<'mifflin-st-jeor' | 'cunningham', string>` in `src/content/rmrEquations.ts`.
- Copy keys: `advice.outsideEquations` (template `{field}`), `label.checkInDay`, `hero.intakeHistory`.

Design: `today` is no longer computed once per render (G13): `useCivilToday` ticks with the minute clock, and the check-in form is keyed on its date, so after midnight it shows the new day's (empty) entry and Record never writes yesterday's numbers under today. A day select (today and the six days before) makes past intake viewable and correctable, and a seven-row list shows what is stored (G17). When the inputs fall outside the equations' domain, Targets names the field instead of "no profile" (G09), using one predicate that agrees with `isInDomain` (tested over generated inputs, rule 2). The two RMR name maps become one (G22).

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/measurements.test.ts` (add `import fc from 'fast-check';`, `import { isInDomain, type NutritionInput } from './nutrition';` and `nutritionDomainIssue` to the measurements import):
```ts
describe('nutritionDomainIssue (audit G09: name the field)', () => {
  const base: NutritionInput = {
    sex: 'male', ageYears: 30, heightCm: 180, massKg: 80, bodyFatPct: null, activity: 'moderate',
    activityPal: 1.7, goal: 'maintenance', sessionsPerWeek: 3, creatine: false,
  };

  it('names the first failing input', () => {
    expect(nutritionDomainIssue(base)).toBeNull();
    expect(nutritionDomainIssue({ ...base, massKg: 8.2 })).toBe('massKg'); // [kg] the G03 typo
    expect(nutritionDomainIssue({ ...base, ageYears: 81 })).toBe('ageYears'); // [year] 80 at setup, 81 on 1 January
    expect(nutritionDomainIssue({ ...base, sex: 'nd' })).toBe('bodyFatPct'); // decision A1
    expect(nutritionDomainIssue({ ...base, heightCm: 108 })).toBe('heightCm'); // [cm]
  });

  it('is null exactly when isInDomain is true (rule 2)', () => {
    fc.assert(
      fc.property(
        fc.record({
          sex: fc.constantFrom('male' as const, 'female' as const, 'nd' as const),
          ageYears: fc.integer({ min: 10, max: 90 }),
          heightCm: fc.double({ min: 100, max: 250, noNaN: true }),
          massKg: fc.double({ min: 1, max: 400, noNaN: true }),
          bodyFatPct: fc.option(fc.double({ min: 0, max: 80, noNaN: true }), { nil: null }),
          sessionsPerWeek: fc.integer({ min: 0, max: 16 }),
        }),
        (patch) => (nutritionDomainIssue({ ...base, ...patch }) === null) === isInDomain({ ...base, ...patch }),
      ),
      { numRuns: 500, seed: 20261104 },
    );
  });
});
```
Append to `src/ui/views/TargetsView.test.tsx` (add `act` to the RTL import and `FORMAT` is already imported):
```tsx
describe('Targets across midnight and outside the equations (audit G13, G09, G17)', () => {
  it('moves the check-in to the new day without reusing yesterday’s numbers (G13)', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-09-04T20:59:00Z')); // 23:59 in Athens (UTC+3)
    render(<TargetsView />);
    typeIntake('2000', '150');
    recordIntake();
    act(() => {
      vi.setSystemTime(new Date('2026-09-04T21:01:00Z')); // 00:01 on 2026-09-05
      vi.advanceTimersByTime(60_000); // the minute clock ticks
    });
    expect(screen.getByRole('heading', { name: /2026-09-05/ })).toBeTruthy();
    expect(kcalField()).toHaveValue('');
    expect(proteinField()).toHaveValue('');
  });

  it('names the field that left the equations’ range instead of saying "no profile" (G09)', () => {
    useAppStore.getState().updateProfile('p1', { body: { ...PROFILE.body, birthYear: 1945 } }); // age 81 in 2026
    render(<TargetsView />);
    expect(
      screen.getByText(FORMAT.withSlots('advice.outsideEquations', { field: copyFor('limelight', 'quantity.age') })),
    ).toBeTruthy();
    expect(screen.queryByText(copyFor('limelight', 'advice.noProfileSetupFirst'))).toBeNull();
  });

  it('shows the last seven days and corrects a past day through the day select (G17)', () => {
    useAppStore.getState().logIntake('p1', { profileId: 'p1', date: '2026-08-30', kcal: 1800, proteinG: 120 });
    render(<TargetsView />);
    expect(screen.getByTestId('intake-history')).toHaveTextContent('2026-08-30');
    expect(screen.getByTestId('intake-history')).toHaveTextContent('1800');
    fireEvent.change(screen.getByLabelText(copyFor('limelight', 'label.checkInDay')), { target: { value: '2026-08-30' } });
    expect(kcalField()).toHaveValue('1800');
    typeIntake('1900', '125');
    recordIntake();
    expect(useAppStore.getState().intake['p1']?.find((e) => e.date === '2026-08-30')).toMatchObject({ kcal: 1900, proteinG: 125 });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/domain/measurements.test.ts src/ui/views/TargetsView.test.tsx`
Expected: FAIL (`nutritionDomainIssue` missing; the heading stays on 2026-09-04; "no profile" shown; no history).

- [ ] **Step 3: Domain, selectors, shared names, copy**

Append to `src/domain/measurements.ts` (and add `NUTRITION_DOMAIN` to a value import from `'./nutrition'`):
```ts
/** The NutritionInput fields a domain refusal can name (audit G09). */
export type DomainField = 'massKg' | 'heightCm' | 'ageYears' | 'bodyFatPct' | 'sessionsPerWeek';

function inBound(value: number, bound: { lo: number; hi: number }): boolean {
  return Number.isFinite(value) && value >= bound.lo && value <= bound.hi;
}

/**
 * The first input outside NUTRITION_DOMAIN, or null when computeTargets will accept the input.
 * The same conditions, in the same terms, as nutrition.ts isInDomain; measurements.test.ts
 * asserts over generated inputs that the two agree (rule 2), so Targets can name the field.
 */
export function nutritionDomainIssue(input: NutritionInput): DomainField | null {
  if (input.sex === 'nd' && input.bodyFatPct === null) return 'bodyFatPct'; // decision A1
  if (!inBound(input.massKg, NUTRITION_DOMAIN.massKg)) return 'massKg';
  if (!inBound(input.heightCm, NUTRITION_DOMAIN.heightCm)) return 'heightCm';
  if (!inBound(input.ageYears, NUTRITION_DOMAIN.ageYears)) return 'ageYears';
  if (input.bodyFatPct !== null && !inBound(input.bodyFatPct, NUTRITION_DOMAIN.bodyFatPct)) return 'bodyFatPct';
  if (!Number.isInteger(input.sessionsPerWeek) || !inBound(input.sessionsPerWeek, NUTRITION_DOMAIN.sessionsPerWeek)) {
    return 'sessionsPerWeek';
  }
  return null;
}
```
In `src/store/selectors.ts` replace the whole `useNutritionTargets` function (keep its doc comment above the new `useNutritionTargets`) with:
```ts
/**
 * The nutrition input for the active profile, memoised on the records it reads and the civil
 * date (age runs on the civil year). Null with no active profile.
 *
 * @param now [ms] epoch UTC to read the civil date from; defaults to the wall clock.
 */
export function useNutritionInput(now: EpochMs = Date.now()): NutritionInput | null {
  const profile = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.profiles[s.activeProfileId] ?? null),
  );
  const latest = useAppStore((s) =>
    s.activeProfileId === null ? null : latestBodyMassEntry(s, s.activeProfileId),
  );
  // Audit G05: the newest body-fat entry, which a later mass without one no longer hides.
  const latestBodyFat = useAppStore((s) =>
    s.activeProfileId === null ? null : latestBodyFatEntry(s, s.activeProfileId),
  );
  // [sessions/week] Quoted in basis.deficitRule only (nutrition.ts NOTE-FREQ).
  const sessionsPerWeek = useAppStore((s) =>
    s.activeProfileId === null ? 0 : (s.availability[s.activeProfileId]?.weeklySessionTarget ?? 0),
  );
  const todayIso = profile === null ? null : todayLocal(profile.timezone, now);
  return useMemo(
    () =>
      profile === null || todayIso === null
        ? null
        : nutritionInputFor(profile, latest, sessionsPerWeek, todayIso, latestBodyFat),
    [profile, latest, latestBodyFat, sessionsPerWeek, todayIso],
  );
}

export function useNutritionTargets(now: EpochMs = Date.now()): NutritionTargets | null {
  const input = useNutritionInput(now);
  // isInDomain is asked first, so a throw that still escapes computeTargets is an engine defect.
  return useMemo(() => (input === null || !isInDomain(input) ? null : computeTargets(input)), [input]);
}

/**
 * Audit G13/G20: the active profile's civil date, re-read every minute and whenever the tab
 * becomes visible (useMinuteClock), so a screen left open overnight moves to the new day.
 */
export function useCivilToday(): LocalDate | null {
  const timezone = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.profiles[s.activeProfileId]?.timezone ?? null),
  );
  const now = useMinuteClock(); // [ms] epoch UTC
  return timezone === null ? null : todayLocal(timezone, now);
}
```
and change `import type { NutritionTargets } from '../domain/nutrition';` to `import type { NutritionInput, NutritionTargets } from '../domain/nutrition';`. (`useMinuteClock` is declared later in the same file; function declarations are hoisted.)

Create `src/content/rmrEquations.ts`:
```ts
// src/content/rmrEquations.ts
//
// Audit G22 (rule 2): the display name of each RMR equation, once. Proper nouns, not skin copy,
// so not CopyKeys. Read by the Targets view and the setup wizard's review.
export const RMR_EQUATION_NAME: Record<'mifflin-st-jeor' | 'cunningham', string> = {
  'mifflin-st-jeor': 'Mifflin-St Jeor',
  cunningham: 'Cunningham',
};
```
In `src/ui/setup/SetupWizard.tsx` delete
```ts
/** Display name of each RMR equation. A proper noun, not skin copy. */
const RMR_EQUATION_NAME: Record<'mifflin-st-jeor' | 'cunningham', string> = {
  'mifflin-st-jeor': 'Mifflin-St Jeor',
  cunningham: 'Cunningham',
};
```
and add `import { RMR_EQUATION_NAME } from '../../content/rmrEquations';`.

In `src/content/copy.ts`, after the union line `  | 'button.dismiss'` add
```ts
  | 'advice.outsideEquations'
  | 'label.checkInDay'
  | 'hero.intakeHistory'
```
and after the table line `  'button.dismiss': 'Dismiss',` add
```ts
  // Audit G09: Targets names the input the equations do not cover. Template; FORMAT.withSlots.
  'advice.outsideEquations': '{field} is outside the range the equations cover.',
  // Audit G17: intake history and the day a check-in is for.
  'label.checkInDay': 'Day',
  'hero.intakeHistory': 'Last Seven Days',
```
and the three fixture rows.

- [ ] **Step 4: TargetsView**

Replace the whole of `src/ui/views/TargetsView.tsx` with:
```tsx
import { useMemo, useState, type JSX } from 'react';
import { displayClass } from '../format/display';
import { NO_VALUE } from '../format/plan';
import { AsciiBar } from '../components/AsciiBar';
import { massUnit, parseDecimal } from '../components/UnitInput';
import { FORMAT, copy } from '../../content/copy';
import type { CopyKey } from '../../content/copy';
import { RMR_EQUATION_NAME } from '../../content/rmrEquations';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { addDays } from '../../domain/dates';
import { nutritionDomainIssue, type DomainField } from '../../domain/measurements';
import { statedBeverageTargetML, type NutritionTargets } from '../../domain/nutrition';
import { volumeReport } from '../../domain/plan/generator';
import { EXERCISES } from '../../domain/plan/library';
import { IntakeEntrySchema } from '../../domain/schema';
import type { IntakeEntry, LocalDate, Profile } from '../../domain/types';
import { displayMass, formatBeverageTarget, formatVolume } from '../../domain/units';
import { useAppStore } from '../../store';
import {
  useActivePlan,
  useActiveProfile,
  useCivilToday,
  useIntakeForDate,
  useMinuteClock,
  useNutritionInput,
  useNutritionTargets,
} from '../../store/selectors';
import './views.css';

/**
 * DOM id of the intake refusal message. Both fields point at it with aria-describedby: the
 * check-in is refused as a PAIR (an entry needs both totals), so a message owned by one field
 * would leave the other looking acceptable to a screen reader.
 */
const INTAKE_ERROR_ID = 'intake-error';

/** [d] The check-in day select and the history list: today and the six days before it. */
const INTAKE_DAYS = 7;

/** The quantity each domain refusal names (audit G09). */
const DOMAIN_FIELD_KEY: Record<DomainField, CopyKey> = {
  massKg: 'quantity.bodyMass',
  heightCm: 'quantity.height',
  ageYears: 'quantity.age',
  bodyFatPct: 'quantity.bodyFat',
  sessionsPerWeek: 'quantity.weeklySessionTarget',
};

/**
 * "-0.6 kg/week", or the honest statement that the evidence base gives no rate.
 *
 * `overrides` is the active skin's table, passed in rather than read here: this is a plain
 * function and a hook inside it would be a rules-of-hooks violation.
 */
function rateText(
  targets: NutritionTargets,
  profile: Profile,
  overrides: Readonly<Partial<Record<CopyKey, string>>>,
): string {
  if (targets.expectedRateKgPerWeek === null) return copy('status.rateUnknown', overrides);
  // Sign convention: negative = mass loss. displayMass rounds to 0.1 in the display unit.
  return FORMAT.signedRate(
    displayMass(targets.expectedRateKgPerWeek, profile.units),
    massUnit(profile.units),
  );
}

/**
 * One day's intake check-in. Keyed on its date by the caller (audit G13): the fields are seeded
 * from THAT day's stored entry when the form mounts, and a new date is a new form, so a value
 * typed for one day can never be recorded under another.
 */
function IntakeCheckIn(props: { profile: Profile; date: LocalDate; targets: NutritionTargets }): JSX.Element {
  const { profile, date, targets } = props;
  const t = useCopy();
  const existing = useIntakeForDate(date);
  // Held as typed, not as a number: an in-progress "1." must stay enterable.
  const [kcalText, setKcalText] = useState(existing === null ? '' : String(existing.kcal));
  const [proteinText, setProteinText] = useState(existing === null ? '' : String(existing.proteinG));
  const [rejected, setRejected] = useState(false);

  // The bars report the STORED entry, never the draft: zero means "nothing recorded".
  const loggedKcal = existing?.kcal ?? 0; // [kcal/day]
  const loggedProteinG = existing?.proteinG ?? 0; // [g/day]

  const record = (): void => {
    // BOTH fields must hold a number: a missing total is not a zero total.
    const kcal = parseDecimal(kcalText); // [kcal/day], or null
    const proteinG = parseDecimal(proteinText); // [g/day], or null
    if (kcal === null || proteinG === null) {
      setRejected(true);
      return;
    }
    const entry: IntakeEntry = { profileId: profile.id, date, kcal, proteinG };
    // Validated against the schema that reads it back: a refused value costs one correction,
    // a stored one the user's whole document.
    if (!IntakeEntrySchema.safeParse(entry).success) {
      setRejected(true);
      return;
    }
    setRejected(false);
    useAppStore.getState().logIntake(profile.id, entry);
  };

  // Carries the date, a numeral, so displayClass keeps it out of the display cut.
  const checkInHeading = FORMAT.headingWithDate(t('hero.intakeCheckIn'), date);

  return (
    <>
      <h2 className={displayClass(checkInHeading)}>{checkInHeading}</h2>
      <div className="view-field">
        <label htmlFor="intake-kcal">{FORMAT.quantityWithUnit(t('quantity.energyIntake'), 'kcal')}</label>
        <input
          id="intake-kcal"
          /* Spec R4: text parsed by parseDecimal, so "2,100" is refused, never read as 2.1. */
          type="text"
          inputMode="numeric"
          aria-invalid={rejected}
          aria-describedby={rejected ? INTAKE_ERROR_ID : undefined}
          value={kcalText}
          onChange={(e) => {
            setKcalText(e.target.value);
          }}
        />
      </div>
      <div className="view-field">
        <label htmlFor="intake-protein">{FORMAT.quantityWithUnit(t('quantity.proteinIntake'), 'g')}</label>
        <input
          id="intake-protein"
          /* Spec R4: text parsed by parseDecimal, so "2,100" is refused, never read as 2.1. */
          type="text"
          inputMode="numeric"
          aria-invalid={rejected}
          aria-describedby={rejected ? INTAKE_ERROR_ID : undefined}
          value={proteinText}
          onChange={(e) => {
            setProteinText(e.target.value);
          }}
        />
      </div>
      {rejected && (
        <p className="view-error" id={INTAKE_ERROR_ID} role="alert" data-testid="intake-error">
          {t('advice.intakeRejected')}
        </p>
      )}
      <button type="button" onClick={record}>
        {t('button.recordIntake')}
      </button>
      <p className="view-progress">
        <AsciiBar value={loggedKcal} target={targets.targetKcal} label={t('label.energyProgress')} testId="kcal-bar" />{' '}
        <span data-testid="kcal-progress">
          {FORMAT.valueOfTarget(String(loggedKcal), FORMAT.kcal(targets.targetKcal))}
        </span>
      </p>
      <p className="view-progress">
        {/* The denominator is the LOWER bound of the protein range: "is the requirement met". */}
        <AsciiBar value={loggedProteinG} target={targets.proteinG.lo} label={t('label.proteinProgress')} testId="protein-bar" />{' '}
        <span data-testid="protein-progress">
          {FORMAT.valueOfTarget(String(loggedProteinG), FORMAT.gramsRange(targets.proteinG.lo, targets.proteinG.hi))}
        </span>
      </p>
    </>
  );
}

/**
 * The daily targets, and the one screen that writes against them. Every number is DERIVED from
 * the profile and the newest measurements on every render (master plan section 6.3); the
 * arithmetic sits behind the one `why?` disclosure (copy contract R9).
 */
export function TargetsView(): JSX.Element {
  const t = useCopy();
  const overrides = useCopyOverrides();
  const profile = useActiveProfile();
  // Audit G13: one ticking clock for the age term and the civil date.
  const now = useMinuteClock(); // [ms] epoch UTC
  const input = useNutritionInput(now);
  const targets = useNutritionTargets(now);
  const plan = useActivePlan();
  const today = useCivilToday() ?? '';
  // Audit G17: the day the check-in is for; null follows today, including across midnight.
  const [pickedDay, setPickedDay] = useState<LocalDate | null>(null);
  const days = useMemo<LocalDate[]>(
    () => (today === '' ? [] : Array.from({ length: INTAKE_DAYS }, (_, i) => addDays(today, -i))),
    [today],
  );
  const checkInDay = pickedDay !== null && days.includes(pickedDay) ? pickedDay : today;
  const intake = useAppStore((s) => (s.activeProfileId === null ? null : (s.intake[s.activeProfileId] ?? null)));
  // Memoised on the plan object: recomputed when the plan changes, not on every keystroke.
  const volume = useMemo(() => (plan === null ? null : volumeReport(plan, EXERCISES)), [plan]);

  if (profile === null) return <p>{t('advice.noProfileSetupFirst')}</p>;
  if (targets === null) {
    // Audit G09: a profile whose inputs left the equations' domain is told WHICH input.
    const issue = input === null ? null : nutritionDomainIssue(input);
    return (
      <p role="status">
        {issue === null
          ? t('advice.noProfileSetupFirst')
          : FORMAT.withSlots('advice.outsideEquations', { field: t(DOMAIN_FIELD_KEY[issue]) }, overrides)}
      </p>
    );
  }

  return (
    <section className="view">
      <h2 className={displayClass(t('hero.dailyTargets'))}>{t('hero.dailyTargets')}</h2>
      <dl className="view-dl">
        <dt>{t('label.energy')}</dt>
        <dd data-testid="target-kcal">{FORMAT.kcal(targets.targetKcal)}</dd>
        <dt>{t('label.protein')}</dt>
        <dd data-testid="target-protein">{FORMAT.gramsRange(targets.proteinG.lo, targets.proteinG.hi)}</dd>
        <dt>{t('label.fluid')}</dt>
        {/* Audit G14: ONE fluid target, the stored and editable one the quick add and the banner
            measure against; the IOM 2005 figure is the reference beside it. */}
        <dd data-testid="target-fluid">{formatVolume(profile.hydration.dailyTargetML, profile.units)}</dd>
        <dt>{t('label.expectedRate')}</dt>
        <dd data-testid="target-rate">{rateText(targets, profile, overrides)}</dd>
        <dt>{t('label.creatineDose')}</dt>
        <dd data-testid="target-creatine">
          {targets.creatineG === null ? t('label.none') : FORMAT.grams(targets.creatineG)}
        </dd>
      </dl>
      <p className="view-note" data-testid="fluid-reference">
        {targets.fluidML.kind === 'stated'
          ? FORMAT.beverageDefault(formatBeverageTarget(targets.fluidML, profile.units))
          : FORMAT.beveragePerSex(formatBeverageTarget(targets.fluidML, profile.units))}
      </p>

      {/* R9: the derivation, and the intermediate quantities it passes through. */}
      <details data-testid="basis">
        <summary>{t('disclosure.why')}</summary>
        <div className="view-note">
          <dl className="view-dl">
            <dt>{t('label.rmr')}</dt>
            <dd>{FORMAT.kcal(targets.rmrKcal)}</dd>
            <dt>{t('label.tdee')}</dt>
            <dd>{FORMAT.kcal(targets.tdeeKcal)}</dd>
          </dl>
          <p>{FORMAT.rmrBasis(RMR_EQUATION_NAME[targets.basis.rmr], targets.basis.activityFactor)}</p>
          <p>{targets.basis.proteinRule}</p>
          <p>{targets.basis.deficitRule}</p>
          <p>{targets.basis.rateRule}</p>
          <p>{FORMAT.beverageBasis(statedBeverageTargetML('male'), statedBeverageTargetML('female'))}</p>
        </div>
      </details>

      <div className="view-field">
        <label htmlFor="intake-day">{t('label.checkInDay')}</label>
        <select
          id="intake-day"
          value={checkInDay}
          onChange={(e) => {
            setPickedDay(e.target.value === today ? null : e.target.value);
          }}
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      {checkInDay !== '' && (
        <IntakeCheckIn key={checkInDay} profile={profile} date={checkInDay} targets={targets} />
      )}

      <h3>{t('hero.intakeHistory')}</h3>
      <ul className="view-list" data-testid="intake-history">
        {days.map((d) => {
          const e = (intake ?? []).find((x) => x.date === d) ?? null;
          return (
            <li key={d}>
              {`${d}  ${e === null ? NO_VALUE : FORMAT.kcal(e.kcal)}  ${e === null ? NO_VALUE : FORMAT.grams(e.proteinG)}`}
            </li>
          );
        })}
      </ul>

      {volume !== null && (
        <p className="view-note" data-testid="maintenance-only">
          {FORMAT.muscleList(t('label.maintenanceOnly'), volume.maintenance, t('label.none'))}
        </p>
      )}
    </section>
  );
}
```
Before replacing, diff the current file against the P1/Task 8 state this text assumes: if a later P1 commit changed a line of the check-in that this text does not carry (for example a different `inputMode`), keep that line's current form.

- [ ] **Step 5: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/ui/views src/store src/domain src/content`, `npx vitest run --maxWorkers=1 src/domain/measurements.test.ts src/store src/ui/views/TargetsView.test.tsx src/content src/ui/setup`
Expected: PASS. The existing test "says so plainly when there is no profile" still finds `advice.noProfileSetupFirst`. A test that counts headings on Targets now also sees "Last Seven Days": scope it and name it in the commit body.

- [ ] **Step 6: Commit**

```bash
git add -- src/store/selectors.ts src/domain/measurements.ts src/domain/measurements.test.ts src/content/rmrEquations.ts src/ui/setup/SetupWizard.tsx src/ui/views/TargetsView.tsx src/ui/views/TargetsView.test.tsx src/content/copy.ts src/content/__fixtures__/limelight-resolved.json
git commit -m "feat(targets): civil day that ticks, keyed check-in, out-of-range field named, seven-day intake (G13, G09, G17, G22)"
```

---

### Task 12: Today's clock ticks; the time capsule can be written again (G20, G16, G22)

**Files:**
- Modify: `src/ui/views/TodayView.tsx` (`const now = Date.now();`; selectors import)
- Modify: `src/ui/components/TimeCapsule.tsx` (`CAPSULE_MAX_CHARS`; `seal`; the write dialog; the opened branch)
- Test: `src/ui/views/TodayView.test.tsx`, `src/ui/components/TimeCapsule.test.tsx` (append)
- Modify: `src/content/copy.ts`, `src/content/__fixtures__/limelight-resolved.json` (one key)

**Interfaces:**
- Consumes: `useMinuteClock` (`src/store/selectors.ts`), `MAX_NOTE_CHARS` (Task 1), `setCapsule` (fun slice, unchanged).
- Produces: copy key `button.writeAnotherCapsule`; `CAPSULE_MAX_CHARS` now equals `MAX_NOTE_CHARS` by derivation.

Design: Today read `Date.now()` once per render, so an installed app resumed on the capsule's opening day kept saying "sealed, 1 day" until something else re-rendered (G20); it now reads the minute clock (`useMinuteClock`: every minute and on `visibilitychange`). The seal records `writtenAt` from the tap, not from a render that may be hours old. An opened capsule offers "Write Another"; sealing it replaces the opened one (G16; see Decisions for the rejected archive). `CAPSULE_MAX_CHARS` is derived from the schema's note bound (G22).

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/components/TimeCapsule.test.tsx` (add `MAX_NOTE_CHARS` to the `'../../domain/schema'` import):
```tsx
describe('write another, one length bound (audit G16, G22)', () => {
  it('caps the note by the loader schema bound', () => {
    expect(CAPSULE_MAX_CHARS).toBe(MAX_NOTE_CHARS); // [characters]
  });

  it('offers Write Another once opened, and sealing replaces the opened capsule', () => {
    seedCapsule({ opensOn: STARTED_ON, opened: true });
    render(<TimeCapsule now={at('2026-09-20', '09:00')} />);
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.writeAnotherCapsule') }));
    fireEvent.change(noteField(), { target: { value: 'A second note, written after reading the first one.' } });
    fireEvent.click(sealButton());
    expect(capsuleInStore()).toMatchObject({
      note: 'A second note, written after reading the first one.',
      opened: false,
    });
  });
});
```
Append to `src/ui/views/TodayView.test.tsx` (add `act` to the RTL import, and `import { addDays, todayLocal } from '../../domain/dates';`):
```tsx
describe('the clock ticks on Today (audit G20)', () => {
  it('opens the capsule on its day without another interaction', () => {
    const tz = useAppStore.getState().profiles[PROFILE_ID]?.timezone ?? 'Europe/Athens';
    const tomorrow = addDays(todayLocal(tz, NOW_MS), 1);
    useAppStore.getState().setCapsule(PROFILE_ID, {
      note: 'A note long enough for the twenty-character floor.',
      writtenAt: NOW_MS - DAY_MS, // [ms] epoch UTC
      opensOn: tomorrow,
      opened: false,
    });
    render(<TodayView />);
    expect(screen.queryByText(copyFor('limelight', 'advice.capsuleOpenDatePassed'))).toBeNull();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS + DAY_MS); // the phone slept overnight
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByText(copyFor('limelight', 'advice.capsuleOpenDatePassed'))).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/components/TimeCapsule.test.tsx src/ui/views/TodayView.test.tsx`
Expected: FAIL (no Write Another; Today keeps the render-time clock).

- [ ] **Step 3: Implement**

Copy key: after the union line `  | 'button.dismiss'` add `  | 'button.writeAnotherCapsule'`, after the table line `  'button.dismiss': 'Dismiss',` add
```ts
  // Audit G16: an opened capsule can be followed by a new one, which replaces it.
  'button.writeAnotherCapsule': 'Write Another',
```
and the fixture row `"button.writeAnotherCapsule":"Write Another"`.

`src/ui/views/TodayView.tsx`: replace
```ts
  const now = Date.now(); // [ms] epoch, UTC
```
with
```ts
  // Audit G20: the minute clock (every minute, and on return to the tab), not a render-time read,
  // so a resumed app moves to the new day and the capsule opens on its day without a tap.
  const now = useMinuteClock(); // [ms] epoch, UTC
```
and add `useMinuteClock` to the `'../../store/selectors'` import. (Handlers keep reading `Date.now()` at the tap, as P1 Task 11 wrote them.)

`src/ui/components/TimeCapsule.tsx`:
1. Replace the `export const CAPSULE_MAX_CHARS = 5_000;` statement (keep its doc comment, adding one line "Derived from the loader's own note bound (audit G22, rule 2).") with
```ts
export const CAPSULE_MAX_CHARS = MAX_NOTE_CHARS; // [characters]
```
and add `import { MAX_NOTE_CHARS } from '../../domain/schema';`.
2. In `seal`, replace `      writtenAt: now, // [ms] epoch UTC` with `      writtenAt: Date.now(), // [ms] epoch UTC, the tap itself (G20), not the render's clock`.
3. Cut the whole `{dialog === 'write' && ( <ModalShell ... testId="capsule-write-backdrop" ...> ... </ModalShell> )}` block out of the `if (capsule === null) { return ( ... ) }` branch, and immediately before the line `  if (capsule === null) {` declare it:
```tsx
  // The write dialog, shared by "no capsule yet" and, since audit G16, "opened: write another".
  const writeDialog = dialog === 'write' && (
    /* paste the cut <ModalShell ...> ... </ModalShell> element here, unchanged */
  );
```
(paste the element in place of the comment line), then put `{writeDialog}` where the block was cut.
4. In the opened branch (the final `return`), immediately after the `<button ...>{t('button.readCapsule')}</button>` element add
```tsx
      {/* Audit G16: not one-shot any more. Sealing a new capsule replaces this opened one. */}
      <button
        type="button"
        className="capsule-action"
        onClick={() => {
          setDialog('write');
        }}
      >
        {t('button.writeAnotherCapsule')}
      </button>
      {writeDialog}
```

- [ ] **Step 4: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/ui`, `npx vitest run --maxWorkers=1 src/ui/components/TimeCapsule.test.tsx src/ui/views/TodayView.test.tsx src/content src/app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- src/ui/views/TodayView.tsx src/ui/views/TodayView.test.tsx src/ui/components/TimeCapsule.tsx src/ui/components/TimeCapsule.test.tsx src/content/copy.ts src/content/__fixtures__/limelight-resolved.json
git commit -m "feat(today): the clock ticks; an opened time capsule can be written again (G20, G16, G22)"
```

---

### Task 13: Log data: one point per day, an anchored projection, AMRAP by weeks, memoised records, Atlas at 320 px (G10 data, G11, G12, G18, G21, G15)

**Files:**
- Modify: `src/ui/components/BodyMassChart.tsx` (props; the projection block), `src/ui/components/BodyMassChart.test.tsx` (append)
- Modify: `src/ui/views/LogView.tsx` (trend memo; chart props), `src/ui/views/LogView.test.tsx` (append)
- Modify: `src/domain/training/records.ts` (`isUnloadedSet`; `weeklyAmrapMax`), `src/domain/training/records.test.ts` (append)
- Modify: `src/ui/components/AmrapSpark.tsx` (memo; x by weeks), `src/ui/components/AmrapSpark.test.tsx` (append)
- Modify: `src/ui/components/PRList.tsx` (memo)
- Modify: `src/ui/views/atlas.css` (append); Create: `src/ui/views/atlasStyles.test.ts`

**Interfaces:**
- Consumes: `trendEntries`, `projectionAnchor`, `ProjectionAnchor` (Task 1); `daysBetween` (`src/domain/dates.ts`).
- Produces: `BodyMassChartProps.projectionFrom?: ProjectionAnchor | undefined` (absent = the old baseline behaviour, so every existing chart test is unchanged); `isUnloadedSet(s: Pick<LoggedSet, 'loadKg'>): boolean` in `records.ts`.

Design: P5 owns the chart's DATA and ANCHOR; P4a owns its sizing (G10: container-sized viewBox, CSS-px labels, no fixed height) and must keep these props. Log passes one trend point per civil date (G12: pre/post pairs no longer draw vertical spikes, and a post-session mass never plots as the body mass) and starts the dashed line at the current programme's start, at the mass measured then (G11: a finished cut is no longer redrawn back over the months of loss). Residual, stated: the slope is still the CURRENT targets' rate (a % of the current mass); deriving a historical rate would need a stored goal history (not built). AMRAP: x is weeks since the first point, and only unloaded sets count, by the same predicate the records use (G18, rule 2). `computeRecords` and `weeklyAmrapMax` run in memos (G21). Atlas gets two columns below 360 px (G15).

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/components/BodyMassChart.test.tsx`:
```tsx
describe('the anchored projection (audit G11)', () => {
  it('starts the dashed line at the anchor date and mass', () => {
    const { container } = render(
      <BodyMassChart
        entries={[entry('2026-02-02', 93, 'a')]} // [kg] a point on the anchor date, at the anchor mass
        units="metric"
        {...BASE}
        projectionFrom={{ date: '2026-02-02', massKg: 93 }}
      />,
    );
    const point = container.querySelector("[data-testid='measured-point']");
    const d = container.querySelector("[data-testid='projection']")?.getAttribute('d') ?? '';
    expect(d.startsWith(`M ${point?.getAttribute('cx') ?? ''} ${point?.getAttribute('cy') ?? ''} L`)).toBe(true);
  });

  it('draws no line when the anchor lies after today', () => {
    const { container } = render(
      <BodyMassChart entries={[]} units="metric" {...BASE} projectionFrom={{ date: '2026-07-01', massKg: 90 }} />,
    );
    expect(container.querySelector("[data-testid='projection']")).toBeNull();
  });
});
```
Append to `src/ui/views/LogView.test.tsx` (inside a describe whose `beforeEach` pins the clock like the rest of the file; `mass`, `seed` and `PROFILE_ID` are the file's own):
```tsx
describe('one body-mass point per day (audit G12)', () => {
  it('plots a pre/post pair as one point and never the post-session mass', () => {
    useAppStore.setState(
      seed({
        bodyMass: {
          [PROFILE_ID]: [
            { ...mass('2026-02-16', 93.5, 'pre'), role: 'pre' }, // [kg]
            { ...mass('2026-02-16', 91.8, 'post'), role: 'post' }, // [kg] 1.8 % lighter after training
          ],
        },
      }),
    );
    const { container } = render(<LogView />);
    expect(container.querySelectorAll("[data-testid='measured-point']")).toHaveLength(1);
  });
});
```
Append to `src/domain/training/records.test.ts` (import `isUnloadedSet` and `weeklyAmrapMax` if not imported; `makeSet` from `'../../test/fixtures'`):
```ts
describe('the AMRAP series counts unloaded sets only (audit G18)', () => {
  it('uses the same predicate as the records', () => {
    expect(isUnloadedSet({ loadKg: 0 })).toBe(true); // [kg] bodyweight
    expect(isUnloadedSet({ loadKg: null })).toBe(true);
    expect(isUnloadedSet({ loadKg: 20 })).toBe(false); // [kg] a weighted set
    const series = weeklyAmrapMax(
      [
        makeSet({ exerciseId: 'push-up', loadKg: 0, reps: 20, assignmentDate: '2026-01-05' }),
        makeSet({ exerciseId: 'push-up', loadKg: 20, reps: 30, assignmentDate: '2026-01-05' }), // weighted: excluded
      ],
      'push-up',
    );
    expect(series).toEqual([{ weekStart: '2026-01-05', reps: 20 }]);
  });
});
```
Append to `src/ui/components/AmrapSpark.test.tsx`:
```tsx
describe('time on the x axis (audit G18)', () => {
  it('spaces points by weeks, so a ten-week gap is drawn as one', () => {
    const { container } = render(
      <AmrapSpark
        sets={[set('2026-01-05', 10), set('2026-01-12', 11), set('2026-03-23', 12)]} // weeks 0, 1, 11
        exercise={PUSHUP}
      />,
    );
    const xs = [...container.querySelectorAll("[data-testid='amrap-point']")].map((c) => Number(c.getAttribute('cx')));
    const [a, b, c] = xs;
    if (a === undefined || b === undefined || c === undefined) throw new Error('expected three points');
    expect(c - b).toBeCloseTo(10 * (b - a), 0); // [viewBox units] ten weeks against one
  });
});
```
Create `src/ui/views/atlasStyles.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import css from './atlas.css?raw';

describe('Atlas at 320 px (audit G15)', () => {
  it('uses two columns below 360 px instead of one 260 px column', () => {
    expect(css).toMatch(
      /@media \(max-width: 359px\)\s*\{\s*\.atlas \.atlas-grid\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/ui/components/BodyMassChart.test.tsx src/ui/views/LogView.test.tsx src/domain/training/records.test.ts src/ui/components/AmrapSpark.test.tsx src/ui/views/atlasStyles.test.ts`
Expected: FAIL (no `projectionFrom`; two points for the pair; `isUnloadedSet` missing; index spacing; no media rule).

- [ ] **Step 3: Chart and Log**

In `src/ui/components/BodyMassChart.tsx`:
- Add `import type { ProjectionAnchor } from '../../domain/measurements';` and to `BodyMassChartProps`:
```ts
  /**
   * Audit G11: where the dashed line starts, the current programme's start and the mass measured
   * then (measurements.ts projectionAnchor). Absent: the baseline, as before.
   */
  projectionFrom?: ProjectionAnchor | undefined;
```
- Replace
```ts
  const rate = expectedRateKgPerWeek; // [kg/week]
  const todayDay = daysBetween(baselineDate, today); // [d] relative to baselineDate
  const projEndDay = Math.min(lastDay, Math.max(firstDay, todayDay)); // [d] clamped to today
  const projStartKg = rate === null ? null : baselineKg + (rate * firstDay) / 7; // [kg]
  const projEndKg = rate === null ? null : baselineKg + (rate * projEndDay) / 7; // [kg]
```
with
```ts
  const rate = expectedRateKgPerWeek; // [kg/week] signed, negative = loss
  const todayDay = daysBetween(baselineDate, today); // [d] relative to baselineDate
  const projEndDay = Math.min(lastDay, Math.max(firstDay, todayDay)); // [d] clamped to today
  // Audit G11: the line starts at the anchor (programme start), not at the profile baseline.
  const anchor = props.projectionFrom;
  const anchorDay = anchor === undefined ? 0 : daysBetween(baselineDate, anchor.date); // [d]
  const anchorKg = anchor === undefined ? baselineKg : anchor.massKg; // [kg]
  const projStartDay = anchor === undefined ? firstDay : Math.max(firstDay, anchorDay); // [d]
  const drawn = rate !== null && projStartDay <= projEndDay;
  const projStartKg = drawn ? anchorKg + (rate * (projStartDay - anchorDay)) / 7 : null; // [kg]
  const projEndKg = drawn ? anchorKg + (rate * (projEndDay - anchorDay)) / 7 : null; // [kg]
```
- In the projection `<path data-testid="projection" d={...}>` replace `xAt(firstDay)` with `xAt(projStartDay)`.

In `src/ui/views/LogView.tsx`:
- Add `import { projectionAnchor, trendEntries } from '../../domain/measurements';`.
- After the `const bodyMass = useAppStore(...)` statement add
```ts
  // Audit G12: one trend point per civil date (never a post-session mass) is what is plotted.
  const trend = useMemo(() => trendEntries(bodyMass ?? NO_BODY_MASS), [bodyMass]);
```
- In the `<BodyMassChart ... />` element replace `entries={entries}` with `entries={trend}` and add
```tsx
        // Audit G11: the dashed line starts at this programme's start, at the mass measured then.
        projectionFrom={
          startedOn === null
            ? undefined
            : projectionAnchor(trend, startedOn, { date: baselineDate, massKg: profile.body.baselineMassKg })
        }
```
(`entries` stays for the "no body mass logged" line.)

- [ ] **Step 4: Records, AMRAP, PR list, Atlas**

`src/domain/training/records.ts`: above `computeRecords` add
```ts
/**
 * Unloaded work: a bodyweight set (0 kg) or one whose load was never recorded. The one predicate
 * the AMRAP record and the weekly AMRAP series share (audit G18, rule 2).
 */
export function isUnloadedSet(s: Pick<LoggedSet, 'loadKg'>): boolean {
  return s.loadKg === null || s.loadKg === 0; // [kg]
}
```
replace `    if (loadKg === null || loadKg === 0) {` (the "Unloaded work" branch in `computeRecords`) with `    if (isUnloadedSet(s)) {`, and in `weeklyAmrapMax` replace
```ts
    if (s.exerciseId !== exerciseId || s.reps === null) continue;
```
with
```ts
    // Audit G18: unloaded sets only, by the same predicate as bestAmrap; a loaded set's reps are
    // not an AMRAP of this movement.
    if (s.exerciseId !== exerciseId || s.reps === null || !isUnloadedSet(s)) continue;
```
`src/ui/components/AmrapSpark.tsx`: add `useMemo` to a React import and `import { daysBetween } from '../../domain/dates';`; replace `  const series = weeklyAmrapMax(sets, exercise.id);` with
```ts
  // Audit G21: one scan of the set list per change of it, not per render.
  const series = useMemo(() => weeklyAmrapMax(sets, exercise.id), [sets, exercise.id]);
```
replace
```ts
  const span = Math.max(1, series.length - 1); // [weeks]
```
with
```ts
  // Audit G18: x is weeks since the first point, so a ten-week gap is drawn as ten weeks.
  const weeksFromFirst = (weekStart: string): number => daysBetween(first.weekStart, weekStart) / 7; // [weeks]
  const span = Math.max(1, weeksFromFirst(last.weekStart)); // [weeks]
```
replace `  const xAt = (i: number): number => PAD_L + (i / span) * (VIEW_W - PAD_L - PAD_R);` with `  const xAt = (weekStart: string): number => PAD_L + (weeksFromFirst(weekStart) / span) * (VIEW_W - PAD_L - PAD_R);`, and change the two call sites `xAt(i)` to `xAt(p.weekStart)`; the path's map callback keeps `i` for the `M`/`L` choice, and the circles' `series.map((p, i) => (` becomes `series.map((p) => (` (its `i` is then unused).
`src/ui/components/PRList.tsx`: add `useMemo` to the React import and wrap the `rows` computation: `const rows: PRRow[] = useMemo(() => [...computeRecords(sets).values()] ... , [sets, library]);` (the same chain, unchanged, inside the memo; keep it above any early return).
Append to `src/ui/views/atlas.css`:
```css
/* Audit G15: at 320 px the 9rem track fits one 260 px column and the page runs ~4,400 px tall.
   Two shrinkable columns below 360 px halve it; 360 px and up keep auto-fill. */
@media (max-width: 359px) {
  .atlas .atlas-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 5: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/ui src/domain`, `npx vitest run --maxWorkers=1 src/ui/components src/ui/views/LogView.test.tsx src/ui/views/AtlasView.test.tsx src/ui/views/atlasStyles.test.ts src/domain/training src/domain/export`
Expected: PASS (existing chart tests unchanged: no `projectionFrom`). Runner: screenshot Atlas at 320 px (headless Chromium, AGENTS "Screenshots") and confirm a two-column card neither clips its title nor scrolls horizontally; if it does, report it to P4a rather than tuning here.

- [ ] **Step 6: Commit**

```bash
git add -- src/ui/components/BodyMassChart.tsx src/ui/components/BodyMassChart.test.tsx src/ui/views/LogView.tsx src/ui/views/LogView.test.tsx src/domain/training/records.ts src/domain/training/records.test.ts src/ui/components/AmrapSpark.tsx src/ui/components/AmrapSpark.test.tsx src/ui/components/PRList.tsx src/ui/views/atlas.css src/ui/views/atlasStyles.test.ts
git commit -m "feat(log): one body-mass point per day, projection from the programme start, AMRAP by weeks, memoised records, Atlas two columns at 320 px (G11, G12, G18, G21, G15)"
```

---

### Task 14: Set entry: quantise once, prefill load and reps, log an untouched prefill exactly, say why a log was refused (C13, C09, C16)

**Files:**
- Modify: `src/domain/training/progression.ts` (`suggestedProgression`), `src/domain/training/progression.test.ts` (append)
- Modify: `src/ui/views/train/ExerciseCard.tsx` (`suggestedKg`; units import; `prefillCount`; two `SetRow` props)
- Modify: `src/ui/views/train/SetRow.tsx` (props; destructure; load and count state; `submit`; reps input)
- Create: `src/ui/views/train/SetRow.prefill.test.tsx`
- Test: `src/ui/views/TrainView.test.tsx` (append)
- Modify: `src/content/copy.ts`, `src/content/__fixtures__/limelight-resolved.json` (one key)

**Interfaces:**
- Consumes: `achievableLoad`, `stepFor` (`src/domain/units.ts`); P1 Task 14's `referenceKg` (ExerciseCard) and `questionedKg`/`submit(confirmed)` (SetRow).
- Produces: `ProgressionAdvice.loadKg` is always on the equipment grid (rounded down); `SetRowProps.prefillKg?: Kg | null` (default `suggestedKg`), `SetRowProps.prefillCount?: number | null` (default null); copy key `advice.repsNeeded`.

Design: C13: the engine quantises once (`onGrid`, rounded down, master plan section 3) and its reason quotes that same number; ExerciseCard stops quantising a second time and the coach compares against the same `advice.loadKg`. An off-grid add-load (61 kg + 2.5 kg step) lands on the grid (62.5 kg) and the reason names the real increase (1.5 kg). C09: a new row opens with the load of this exercise's latest set today, else the suggestion (P1's `referenceKg`, the same number the plausibility question uses), and with the count of the latest set today, else the top of the rep range (or the target seconds); a field the user typed in is never overwritten. An empty count is refused with words, like the timed field already was. C16: Log with an untouched prefill stores the exact kg it came from, never the 0.1 display value converted back (review R2's rule, now for new sets). The 44 px toggle and the single big Log button of C09 are layout (P4a).

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/training/progression.test.ts`:
```ts
describe('one quantisation, in the engine (audit C13)', () => {
  // Barbell step 2.5 kg (makeProfile). 61 kg is off that grid: the last session was loaded with
  // plates the profile's step cannot assemble again.
  it('holds an off-grid load at the grid load below it, and the reason names that same load', () => {
    const advice = suggestedProgression(
      session('2026-03-02', 3, 61, 6), // [kg], [repetitions]: below the top of 6-8
      makePlannedExercise(),
      makeExercise({ loadClass: 'upper-compound' }),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('hold');
    expect(advice.loadKg).toBe(60); // [kg]
    expect(advice.reason).toContain('60 kg');
    expect(advice.reason).not.toContain('61');
  });

  it('adds load onto the grid, and the reason names the real increase over the last load', () => {
    const advice = suggestedProgression(
      session('2026-03-02', 3, 61, 8), // [kg], [repetitions]: every set at the top
      makePlannedExercise(),
      makeExercise({ loadClass: 'upper-compound' }),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.kind).toBe('add-load');
    expect(advice.loadKg).toBe(62.5); // [kg] floor(61 + 2.5) on the 2.5 kg grid
    expect(advice.reason).toContain('1.5 kg'); // [kg] 62.5 - 61
  });

  it('leaves an on-grid load exactly as it was', () => {
    const advice = suggestedProgression(
      session('2026-03-02', 3, 60, 6),
      makePlannedExercise(),
      makeExercise({ loadClass: 'upper-compound' }),
      makeProfile(),
      makeBlock(),
    );
    expect(advice.loadKg).toBe(60); // [kg]
  });
});
```
Create `src/ui/views/train/SetRow.prefill.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FORMAT, copy, type CopyKey } from '../../../content/copy';
import { displayLoad } from '../../../domain/units';
import { SetRow, type SetRowProps } from './SetRow';

function props(patch: Partial<SetRowProps>): SetRowProps {
  return {
    t: (key: CopyKey) => copy(key),
    overrides: {},
    domIdPrefix: 'ex-test',
    n: 2,
    targetSets: 3,
    isBonus: false,
    units: 'metric',
    prescription: { kind: 'reps', lo: 6, hi: 8 },
    suggestedKg: 60, // [kg]
    logged: null,
    isBodyweightExercise: false,
    onLog: vi.fn(),
    onEdit: () => true,
    onEffort: () => true,
    onDelete: () => undefined,
    ...patch,
  };
}

function logButton(): HTMLElement {
  return screen.getByRole('button', { name: FORMAT.logSetLabel(2) });
}

describe('set-row prefill (audit C09, C16)', () => {
  it('opens with the prefill load and count and logs them, the kg exactly (C16)', () => {
    const onLog = vi.fn<SetRowProps['onLog']>();
    render(<SetRow {...props({ units: 'imperial', suggestedKg: 62.5, prefillKg: 62.5, prefillCount: 8, onLog })} />);
    expect(screen.getByLabelText(`${FORMAT.setLoadQuantity(2)} (lb)`)).toHaveValue(String(displayLoad(62.5, 'imperial')));
    expect(screen.getByLabelText(FORMAT.setRepsQuantity(2))).toHaveValue('8');
    fireEvent.click(logButton());
    expect(onLog).toHaveBeenCalledWith(62.5, { reps: 8, durationS: null }); // [kg] not 62.50503
  });

  it('follows a new prefill until the user types, then keeps what was typed', () => {
    const { rerender } = render(<SetRow {...props({ prefillKg: 60, prefillCount: 8 })} />);
    rerender(<SetRow {...props({ prefillKg: 65, prefillCount: 7 })} />); // set 1 was logged at 65 x 7
    expect(screen.getByLabelText(`${FORMAT.setLoadQuantity(2)} (kg)`)).toHaveValue('65');
    expect(screen.getByLabelText(FORMAT.setRepsQuantity(2))).toHaveValue('7');
    fireEvent.change(screen.getByLabelText(FORMAT.setRepsQuantity(2)), { target: { value: '6' } });
    rerender(<SetRow {...props({ prefillKg: 65, prefillCount: 5 })} />);
    expect(screen.getByLabelText(FORMAT.setRepsQuantity(2))).toHaveValue('6');
  });

  it('says why an empty count is refused (C09)', () => {
    const onLog = vi.fn<SetRowProps['onLog']>();
    render(<SetRow {...props({ onLog })} />);
    fireEvent.click(logButton());
    expect(onLog).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(copy('advice.repsNeeded'));
  });
});
```
Append to `src/ui/views/TrainView.test.tsx`:
```tsx
describe('set entry (audit C13, C09)', () => {
  it('states one held load in the reason, the suggestion and the prefill (C13)', () => {
    const history = [1, 2, 3].map((n) =>
      makeSet({ id: `h-${String(n)}`, assignmentDate: YESTERDAY, sessionId: 'session-1', exerciseId: UPPER.id, setNumber: n, loadKg: 61, reps: 6 }),
    ); // [kg] off the grid, below the top of 6-8
    seedStore(seed({ sets: history }));
    renderTrain();
    expect(screen.getByText(/Hold 60 kg/)).toBeInTheDocument();
    expect(screen.getByLabelText(`${FORMAT.setLoadQuantity(1)} (kg)`)).toHaveValue('60');
  });

  it('opens the next row with the load and reps just logged (C09)', () => {
    seedStore(seed());
    renderTrain();
    logRow(1, '65', '7');
    expect(screen.getByLabelText(`${FORMAT.setLoadQuantity(2)} (kg)`)).toHaveValue('65');
    expect(screen.getByLabelText(FORMAT.setRepsQuantity(2))).toHaveValue('7');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/domain/training/progression.test.ts src/ui/views/train/SetRow.prefill.test.tsx src/ui/views/TrainView.test.tsx -t "quantisation|prefill|set entry"`
Expected: FAIL ("Hold 61 kg"; unknown props; empty reps field; silent refusal).

- [ ] **Step 3: The engine quantises once (C13)**

In `src/domain/training/progression.ts`, inside `suggestedProgression`:
1. After `  const base = { prescription, nextPrescription: prescription };` add
```ts
  // Audit C13: every load this function returns is on the equipment grid, rounded DOWN (master
  // plan section 3: a suggestion the user cannot assemble is worse than one slightly under), and
  // the reason line quotes that same number, so the reason, the prefill and the coach agree.
  const stepKg = stepFor(ex, profile.equipmentSteps); // [kg] smallest achievable increment
  const onGrid = (kg: Kg): Kg => (stepKg > 0 ? achievableLoad(kg, stepKg) : kg); // [kg]
```
2. Deload branch: `loadKg: last ? last.loadKg : null,` becomes `loadKg: last ? onGrid(last.loadKg) : null,` (keep its comment).
3. Non-`reps` branch: replace `    const heldText = last ? \` at ${formatLoad(last.loadKg, units)}\` : '';` with
```ts
    const heldKg = last ? onGrid(last.loadKg) : null; // [kg]
    const heldText = heldKg !== null ? ` at ${formatLoad(heldKg, units)}` : '';
```
and in its return `loadKg: last ? last.loadKg : null,` becomes `loadKg: heldKg,`.
4. After `  const workingLoadKg = lastSession.reduce((m, s) => Math.max(m, s.loadKg), 0); // [kg]` add `  const heldKg = onGrid(workingLoadKg); // [kg] the load a hold suggests (C13)`.
5. In the `!metTop` hold and the effort-rule hold, replace `loadKg: workingLoadKg,` with `loadKg: heldKg,` and `formatLoad(workingLoadKg, units)` in their `reason` with `formatLoad(heldKg, units)` (their `why` keeps quoting what was lifted).
6. Delete the later line `  const stepKg = stepFor(ex, profile.equipmentSteps); // [kg] smallest achievable increment` (now declared at the top).
7. In the step-guard `extend-reps` return, `loadKg: workingLoadKg, // [kg] unchanged` becomes `loadKg: heldKg, // [kg] unchanged, on the grid`.
8. Replace
```ts
  const nextKg = workingLoadKg + deltaKg; // [kg]
  return {
    ...base,
    kind: 'add-load',
    loadKg: nextKg, // [kg]
    reason: `Add ${formatLoad(deltaKg, units)} and reset to ${prescription.lo} repetitions.`,
```
with
```ts
  // C13: an off-grid working load (61 kg on a 2.5 kg bar step) plus the step is off the grid too,
  // so the sum is rounded down once more; the reason then names the real increase over the last
  // working load, which is what the user will see between the two sessions.
  const nextKg = onGrid(workingLoadKg + deltaKg); // [kg]
  const addedKg = nextKg - workingLoadKg; // [kg] > 0: floor(w + s) on the grid exceeds w
  return {
    ...base,
    kind: 'add-load',
    loadKg: nextKg, // [kg]
    reason: `Add ${formatLoad(addedKg, units)} and reset to ${prescription.lo} repetitions.`,
```
(The `stepKg > 0` extend-reps branch keeps `loadKg: workingLoadKg`: with no step `onGrid` is the identity.)

In `src/ui/views/train/ExerciseCard.tsx` replace
```ts
  const stepKg = stepFor(exercise, profile.equipmentSteps); // [kg]
  // Only a SUGGESTED load is quantised, and it rounds down (master plan section 3): a
  // suggestion the user cannot assemble is worse than one slightly under.
  const suggestedKg: Kg | null =
    advice.loadKg === null
      ? null
      : stepKg > 0
        ? achievableLoad(advice.loadKg, stepKg)
        : advice.loadKg; // [kg]
```
with
```ts
  // Audit C13: the engine quantises its suggestion once, onto the equipment grid, and its reason
  // line quotes the same number; quantising again here could only make the two disagree.
  const suggestedKg: Kg | null = advice.loadKg; // [kg] on the grid, or null
```
and the units import becomes `import { formatLoad } from '../../../domain/units';`.

- [ ] **Step 4: Prefill and refusal (C09, C16)**

Copy key: after the union line `  | 'button.dismiss'` add `  | 'advice.repsNeeded'`; after `  'button.dismiss': 'Dismiss',` add
```ts
  // Audit C09: an empty repetition count is refused in words, like the timed field.
  'advice.repsNeeded': 'Enter the repetitions.',
```
and the fixture row.

`src/ui/views/train/ExerciseCard.tsx`: after P1 Task 14's `const referenceKg: Kg | null = latestToday?.loadKg ?? suggestedKg;` add
```ts
  // Audit C09: the next row opens with the count of the latest set today, else the top of the rep
  // range (or the target seconds); nothing for AMRAP or no prescription. [repetitions] or [s]
  const latestSetToday = todaysSets.reduce<LoggedSet | null>(
    (best, s) => (best === null || s.setNumber > best.setNumber ? s : best),
    null,
  );
  const prefillCount: number | null =
    latestSetToday !== null
      ? (latestSetToday.durationS ?? latestSetToday.reps)
      : planned.prescription.kind === 'reps'
        ? planned.prescription.hi
        : planned.prescription.kind === 'time' || planned.prescription.kind === 'duration'
          ? planned.prescription.targetS
          : null;
```
and pass to `<SetRow ... />`:
```tsx
                  prefillKg={referenceKg} // [kg] C09: the latest load today, else the suggestion
                  prefillCount={prefillCount}
```
`src/ui/views/train/SetRow.tsx`:
1. In `SetRowProps`, after the P1 `referenceKg?: Kg | null;` member add
```ts
  /** [kg] Audit C09: the load a new row opens with. Defaults to `suggestedKg`. */
  prefillKg?: Kg | null;
  /** [repetitions] or [s] Audit C09: the count a new row opens with; null for none. */
  prefillCount?: number | null;
```
2. In the destructure, after `suggestedKg,` add `prefillKg = suggestedKg,` and `prefillCount = null,`.
3. Replace `  const [loadText, setLoadText] = useState(() => prefill(suggestedKg, units));` with `  const [loadText, setLoadText] = useState(() => prefill(prefillKg, units));`, and `  const [countText, setCountText] = useState('');` with
```ts
  const [countText, setCountText] = useState(() => (prefillCount === null ? '' : String(prefillCount)));
  /** Audit C09: true once the user typed a count (or opened an edit), so a new prefill never overwrites it. */
  const countTouched = useRef(false);
```
4. Replace the prefill effect
```ts
  useEffect(() => {
    if (touched.current) return;
    setLoadText(prefill(suggestedKg, units));
  }, [suggestedKg, units]);
```
with
```ts
  useEffect(() => {
    if (touched.current) return;
    setLoadText(prefill(prefillKg, units));
  }, [prefillKg, units]);
  useEffect(() => {
    if (countTouched.current) return;
    setCountText(prefillCount === null ? '' : String(prefillCount));
  }, [prefillCount]);
```
5. In `submit`, replace
```ts
    if (!Number.isFinite(count) || count <= 0 || (timed && count > MAX_DURATION_S)) {
      // The timed field says what it wants, wired to the control by UnitInput's own
      // aria-describedby / aria-invalid pair. The repetition field keeps its silent refusal:
      // changing it is outside this pass, and a message there would be a second contract.
      if (timed) setCountError(t('advice.durationNeeded'));
      return;
    }
```
with
```ts
    if (!Number.isFinite(count) || count <= 0 || (timed && count > MAX_DURATION_S)) {
      // Audit C09: both fields say what they want; a silent refusal read as a broken button.
      setCountError(t(timed ? 'advice.durationNeeded' : 'advice.repsNeeded'));
      return;
    }
```
and replace
```ts
    const loadKg = kept !== undefined ? kept : bodyweight ? 0 : storedLoadKg(loadText, units); // [kg]
```
with
```ts
    // Audit C16: an untouched prefill logs the exact kg it came from, never its 0.1 display value
    // converted back (137.8 lb -> 62.50503 kg broke LOAD_EQ_TOL_KG). Same rule as review R2's edit.
    const prefilled =
      !editing && !bodyweight && prefillKg !== null && loadText === prefill(prefillKg, units)
        ? prefillKg
        : undefined; // [kg]
    const loadKg =
      kept !== undefined ? kept : prefilled !== undefined ? prefilled : bodyweight ? 0 : storedLoadKg(loadText, units); // [kg]
```
and in the lines after a successful log, next to `touched.current = false;`, add `countTouched.current = false;`.
6. In `startEdit` add `countTouched.current = true;` beside `touched.current = true;`; in `cancelEdit` replace `setCountText('');` with `setCountText(prefillCount === null ? '' : String(prefillCount));`, add `countTouched.current = false;`, and change `setLoadText(prefill(suggestedKg, units));` to `setLoadText(prefill(prefillKg, units));`.
7. On the repetition `<input id={\`${domIdPrefix}-set-${n}-reps\`} ...>` add
```tsx
            aria-invalid={countError !== null}
            aria-describedby={countError === null ? undefined : `${domIdPrefix}-set-${n}-reps-error`}
```
change its `onChange` body to
```tsx
              countTouched.current = true;
              setCountText(e.target.value);
              setCountError(null);
```
add `countTouched.current = true;` as the first line of the duration `UnitInput`'s `onChange`, and right after the closing `</div>` of that `<div className="unit-input">` (the repetition field's wrapper) add
```tsx
      {!timed && countError !== null && (
        <p className="set-edit-error" id={`${domIdPrefix}-set-${n}-reps-error`} role="alert">
          {countError}
        </p>
      )}
```

- [ ] **Step 5: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/domain/training src/ui/views/train`, `npx vitest run --maxWorkers=1 src/domain/training src/ui/views/train src/ui/views/TrainView.test.tsx src/content`
Expected: PASS. Prototyped on the pre-P1 tree: the C13 engine change and the ExerciseCard change left all 19 files / 410 tests of `src/domain/training` and `src/ui/views/train` green, and the three C13 tests above passed. A test that now meets a prefilled count where it expected an empty field (`grep -n "toHaveValue('')" src/ui/views`) is updated to the prefill and named in the commit body; a test that relied on Log refusing an empty count in silence now expects the `advice.repsNeeded` alert.

- [ ] **Step 6: Commit**

```bash
git add -- src/domain/training/progression.ts src/domain/training/progression.test.ts src/ui/views/train/ExerciseCard.tsx src/ui/views/train/SetRow.tsx src/ui/views/train/SetRow.prefill.test.tsx src/ui/views/TrainView.test.tsx src/content/copy.ts src/content/__fixtures__/limelight-resolved.json
git commit -m "feat(train): one quantised load in reason, suggestion and prefill; rows prefill load and reps; exact prefill logged; reps refusal shown (C13, C09, C16)"
```

---

### Task 15: Finish asks when sets are missing, and can be undone (C12)

**Files:**
- Create: `src/store/finishUndo.ts`, `src/store/finishUndo.test.ts`
- Modify: `src/store/index.ts` (`AppActions`; one implementation; one re-export)
- Modify: `src/ui/views/train/ExerciseCard.tsx` (export `targetSetsFor`; use it)
- Modify: `src/ui/views/TrainView.tsx` (state hook; `onFinish` -> `finishNow` + new `onFinish`; the question block)
- Test: `src/ui/views/TrainView.test.tsx` (helper, call sites, three tests)
- Modify: `e2e/p5-measurements.spec.ts` (the G01 test answers the question), `e2e/support/constants.ts`, `src/test/e2eDocument.test.ts`
- Modify: `src/content/copy.ts`, `src/content/__fixtures__/limelight-resolved.json` (three keys)

**Interfaces:**
- Consumes: `completeSession` (store, unchanged), `useToasts`, `UNDO_WINDOW_MS`, `sessionLineup`/`isEditable` (already imported by TrainView).
- Produces:
  - `interface FinishSnapshot { profileId: string; before: { assignment: SessionAssignment; cursor: PlanCursor }; after: { assignment: SessionAssignment; cursor: PlanCursor; reviews: readonly WeeklyReview[] | undefined } }` and `applyUndoFinish(state: AppState, snap: FinishSnapshot): AppState | null` in `src/store/finishUndo.ts`.
  - `AppActions.undoFinish(snap: FinishSnapshot): boolean` (true when restored).
  - `targetSetsFor(planned: PlannedExercise, block: PlanBlock): number` [sets] exported from `ExerciseCard.tsx`.
  - Copy keys `advice.finishShort` (template `{logged}`, `{prescribed}`), `button.finishAnyway`, `status.sessionFinished`; e2e `LABEL.finishAnyway`.

Design (C12): Finish with fewer logged sets than prescribed (the non-skipped planned and swapped slots, each at the block's set count, the same formula ExerciseCard renders, rule 2) asks once: "{logged} of {prescribed} sets logged. Finish anyway?" with Finish Anyway / Cancel. A full session finishes at once. Every Finish offers a 6 s Undo that puts back the assignment row and the cursor exactly as they were, and only if neither they nor the week's reviews changed since (identity), so an undo can never rewind a week another action has already graded. Rejected: a "Reopen" action (P1 Task 12: it would rewind graded weeks); a confirm on every Finish (one extra tap on every full session).

- [ ] **Step 1: Write the failing tests**

Create `src/store/finishUndo.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultState } from '../domain/schema';
import type { AppState, PlanCursor, SessionAssignment } from '../domain/types';
import { applyUndoFinish, type FinishSnapshot } from './finishUndo';

const P = 'p1';
const open: SessionAssignment = {
  date: '2026-03-02', sessionId: 's1', sourceIndex: 0, status: 'in-progress',
  startedAt: 1_000, completedAt: null, skipReason: null, // [ms] epoch UTC
};
const done: SessionAssignment = { ...open, status: 'completed', completedAt: 2_000 };
const cursorBefore: PlanCursor = { planId: 'plan', nextSessionIndex: 0, startedOn: '2026-03-02', completedOn: null };
const cursorAfter: PlanCursor = { ...cursorBefore, nextSessionIndex: 1 };

function finished(): AppState {
  return { ...defaultState(), assignments: { [P]: [done] }, cursors: { [P]: cursorAfter }, weeklyReviews: { [P]: [] } };
}

describe('applyUndoFinish (audit C12)', () => {
  it('restores the row and the cursor exactly', () => {
    const s = finished();
    const snap: FinishSnapshot = {
      profileId: P,
      before: { assignment: open, cursor: cursorBefore },
      after: { assignment: done, cursor: cursorAfter, reviews: s.weeklyReviews[P] },
    };
    const next = applyUndoFinish(s, snap);
    expect(next?.assignments[P]).toEqual([open]);
    expect(next?.cursors[P]).toBe(cursorBefore);
  });

  it('refuses when anything it would rewind has moved since', () => {
    const s = finished();
    const snap: FinishSnapshot = {
      profileId: P,
      before: { assignment: open, cursor: cursorBefore },
      after: { assignment: done, cursor: cursorAfter, reviews: s.weeklyReviews[P] },
    };
    expect(applyUndoFinish({ ...s, cursors: { [P]: { ...cursorAfter } } }, snap)).toBeNull();
    expect(applyUndoFinish({ ...s, weeklyReviews: { [P]: [] } }, snap)).toBeNull();
    expect(applyUndoFinish({ ...s, assignments: { [P]: [{ ...done }] } }, snap)).toBeNull();
  });
});
```
In `src/ui/views/TrainView.test.tsx`, after `logRow` add
```tsx
/** Audit C12: Finish asks once when fewer sets than prescribed were logged; this answers it. */
function finishSession(): void {
  fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.finishSession') }));
  const anyway = screen.queryByRole('button', { name: copyFor('limelight', 'button.finishAnyway') });
  if (anyway !== null) fireEvent.click(anyway);
}
```
replace every existing `fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.finishSession') }));` in the file (P1's, Task 7's and the older ones; `grep -n "button.finishSession') }))" src/ui/views/TrainView.test.tsx`) with `finishSession();`, and append:
```tsx
describe('Finish (audit C12)', () => {
  it('asks when fewer sets than prescribed were logged; Cancel keeps the session open', () => {
    seedStore(seed()); // 3 prescribed sets, none logged
    renderTrain();
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.finishSession') }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      FORMAT.withSlots('advice.finishShort', { logged: 0, prescribed: 3 }),
    );
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.cancel') }));
    expect(useAppStore.getState().assignments['profile-1']?.[0]?.status).toBe('in-progress');
  });

  it('Finish Anyway finishes, and Undo puts the open session and the cursor back', () => {
    seedStore(seed());
    renderTrain();
    finishSession();
    expect(useAppStore.getState().assignments['profile-1']?.[0]?.status).toBe('completed');
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.undo') }));
    expect(useAppStore.getState().assignments['profile-1']?.[0]?.status).toBe('in-progress');
    expect(useAppStore.getState().cursors['profile-1']?.nextSessionIndex).toBe(0);
  });

  it('finishes at once when every prescribed set is logged', () => {
    seedStore(seed({ planned: { setsLo: 1, setsHi: 1 } }));
    renderTrain();
    logRow(1, '60', '8');
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.finishSession') }));
    expect(screen.queryByRole('button', { name: copyFor('limelight', 'button.finishAnyway') })).toBeNull();
    expect(useAppStore.getState().assignments['profile-1']?.[0]?.status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=1 src/store/finishUndo.test.ts src/ui/views/TrainView.test.tsx`
Expected: FAIL (module missing; Finish completes with no question; no Undo).

- [ ] **Step 3: The pure undo and the store action**

Create `src/store/finishUndo.ts`:
```ts
// src/store/finishUndo.ts
//
// Audit C12: Finish can be taken back for UNDO_WINDOW_MS. The view snapshots the assignment row
// and the cursor before and after completeSession; the undo puts the BEFORE records back only if
// the AFTER records (and the week's reviews) are still the stored objects, so it never rewinds
// a state another action has moved on from (a graded week above all).
import type { AppState, PlanCursor, SessionAssignment, WeeklyReview } from '../domain/types';

export interface FinishSnapshot {
  profileId: string;
  before: { assignment: SessionAssignment; cursor: PlanCursor };
  after: { assignment: SessionAssignment; cursor: PlanCursor; reviews: readonly WeeklyReview[] | undefined };
}

/** The state with the pre-Finish row and cursor restored, or null when something moved since. */
export function applyUndoFinish(state: AppState, snap: FinishSnapshot): AppState | null {
  const { profileId } = snap;
  const rows = state.assignments[profileId] ?? [];
  const current = rows.find((a) => a.date === snap.after.assignment.date);
  if (current !== snap.after.assignment) return null;
  if (state.cursors[profileId] !== snap.after.cursor) return null;
  if (state.weeklyReviews[profileId] !== snap.after.reviews) return null;
  return {
    ...state,
    assignments: { ...state.assignments, [profileId]: rows.map((a) => (a === current ? snap.before.assignment : a)) },
    cursors: { ...state.cursors, [profileId]: snap.before.cursor },
  };
}
```
In `src/store/index.ts`: add `import { applyUndoFinish, type FinishSnapshot } from './finishUndo';`; in `AppActions` after `undoAvailable(now: EpochMs): boolean;` add
```ts
  /**
   * Audit C12: takes back a Finish within its undo window. Restores the snapshot's pre-Finish
   * assignment row and cursor when nothing they would rewind has moved since; returns whether
   * it did. Writes nothing when it refuses.
   */
  undoFinish(snap: FinishSnapshot): boolean;
```
add the implementation after `undoAvailable(...) { ... },`:
```ts
  undoFinish(snap: FinishSnapshot): boolean {
    const next = applyUndoFinish(selectState(get()), snap);
    if (next === null) return false;
    set({ assignments: next.assignments, cursors: next.cursors });
    return true;
  },
```
and `export type { FinishSnapshot } from './finishUndo';` beside `export { defaultState };`.

- [ ] **Step 4: Copy keys and the view**

Copy: after the union line `  | 'button.dismiss'` add
```ts
  | 'advice.finishShort'
  | 'button.finishAnyway'
  | 'status.sessionFinished'
```
and after `  'button.dismiss': 'Dismiss',` add
```ts
  // Audit C12: Finish with sets missing asks once; every Finish can be undone for 6 s.
  // Template; FORMAT.withSlots. {logged} and {prescribed} are [sets].
  'advice.finishShort': '{logged} of {prescribed} sets logged. Finish anyway?',
  'button.finishAnyway': 'Finish Anyway',
  'status.sessionFinished': 'Session finished.',
```
and the three fixture rows.

`src/ui/views/train/ExerciseCard.tsx`: add above `export function ExerciseCard` (with `PlanBlock` and `PlannedExercise` in the type import)
```ts
/**
 * [sets] The sets a card prescribes: the plan's floor scaled by the block's set modifier (a
 * deload cuts volume, master plan section 6.5), floored at 1 so a block never prescribes no work.
 * Shared with TrainView's Finish question (audit C12, rule 2).
 */
export function targetSetsFor(planned: PlannedExercise, block: PlanBlock): number {
  return Math.max(1, Math.round(planned.setsLo * block.setModifier));
}
```
and replace `  const targetSets = Math.max(1, Math.round(planned.setsLo * block.setModifier)); // [sets]` with `  const targetSets = targetSetsFor(planned, block); // [sets]`.

`src/ui/views/TrainView.tsx`:
1. Import `targetSetsFor` from `'./train/ExerciseCard'` (extend the existing import), `UNDO_WINDOW_MS` from `'../../store/training'`, and `type FinishSnapshot` from `'../../store'`.
2. After the `fluidLossPct` state (Task 7) add
```ts
  /** Audit C12: true while Finish is asking about missing sets. */
  const [finishQuestion, setFinishQuestion] = useState(false);
```
3. Rename the existing `const onFinish = (): void => {` to `const finishNow = (): void => {`, and make its FIRST statements
```ts
    // Audit C12: the records an Undo would put back, read at the tap (not from the render).
    const atTap = useAppStore.getState();
    const rowBefore = (atTap.assignments[profileId] ?? []).find((a) => a.date === assignment.date) ?? null;
    const cursorBefore = atTap.cursors[profileId] ?? null;
```
and its LAST statements (after the `lastView` navigation)
```ts
    const after = useAppStore.getState();
    const rowAfter = (after.assignments[profileId] ?? []).find((a) => a.date === assignment.date) ?? null;
    const cursorAfter = after.cursors[profileId] ?? null;
    if (rowBefore !== null && cursorBefore !== null && rowAfter?.status === 'completed' && cursorAfter !== null) {
      const snap: FinishSnapshot = {
        profileId,
        before: { assignment: rowBefore, cursor: cursorBefore },
        after: { assignment: rowAfter, cursor: cursorAfter, reviews: after.weeklyReviews[profileId] },
      };
      push({
        kind: 'undo',
        message: c('status.sessionFinished'),
        deadlineAt: Date.now() + UNDO_WINDOW_MS, // [ms] epoch UTC
        onUndo: () => {
          if (useAppStore.getState().undoFinish(snap)) useAppStore.getState().setUi({ lastView: 'train' });
        },
      });
    }
```
4. Immediately after `finishNow` add
```ts
  // Audit C12: the prescribed sets of the slots still in play (planned or swapped, not skipped).
  const prescribedSets = lineup
    .filter((e) => (e.kind === 'planned' || e.kind === 'swapped') && !e.skipped)
    .reduce((sum, e) => sum + targetSetsFor(e.planned, block), 0); // [sets]
  const onFinish = (): void => {
    if (todaysSets.length < prescribedSets) {
      setFinishQuestion(true);
      return;
    }
    finishNow();
  };
```
5. Immediately after the `{!completed && ( <button type="button" onClick={onFinish}> ... </button> )}` element add
```tsx
      {finishQuestion && !completed && (
        <div className="finish-question">
          <p role="alert">
            {FORMAT.withSlots(
              'advice.finishShort',
              { logged: todaysSets.length, prescribed: prescribedSets }, // [sets]
              overrides,
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setFinishQuestion(false);
              finishNow();
            }}
          >
            {c('button.finishAnyway')}
          </button>
          <button
            type="button"
            onClick={() => {
              setFinishQuestion(false);
            }}
          >
            {c('button.cancel')}
          </button>
        </div>
      )}
```
(If P1 Task 12 left the Finish button under a different condition than `!completed`, keep that condition on both elements.)

e2e: in `e2e/support/constants.ts` add `finishAnyway: 'Finish Anyway',` to `LABEL`; in `src/test/e2eDocument.test.ts` add `expect(LABEL.finishAnyway).toBe(copyFor('limelight', 'button.finishAnyway'));`; in the G01 test of `e2e/p5-measurements.spec.ts`, after `await page.getByRole('button', { name: LABEL.finish }).dispatchEvent('click');` add
```ts
  // Audit C12: 1 of 6 prescribed sets logged, so Finish asks once.
  await page.getByRole('button', { name: LABEL.finishAnyway, exact: true }).dispatchEvent('click');
```
`grep -rn "LABEL.finish" e2e` lists any other spec that taps Finish with sets missing; give it the same line.

- [ ] **Step 5: Run**

Run: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/store src/ui/views`, `npx vitest run --maxWorkers=1 src/store src/ui/views/TrainView.test.tsx src/ui/views/train src/content src/test src/app`
Expected: PASS. Runner: `npm run e2e` (all green, including `e2e/p5-measurements.spec.ts`).

- [ ] **Step 6: Commit**

```bash
git add -- src/store/finishUndo.ts src/store/finishUndo.test.ts src/store/index.ts src/ui/views/train/ExerciseCard.tsx src/ui/views/TrainView.tsx src/ui/views/TrainView.test.tsx src/content/copy.ts src/content/__fixtures__/limelight-resolved.json e2e/p5-measurements.spec.ts e2e/support/constants.ts src/test/e2eDocument.test.ts
git commit -m "feat(train): Finish asks when sets are missing and can be undone for 6 s (C12)"
```

---

## After Task 15 (runner)

Run the whole AGENTS.md Verify block in order, one heavy process at a time, and compare the number of test files run with `find src build -name '*.test.ts*' | wc -l`. Then `npm run e2e`. Screenshot Today, Log, Targets and Settings at 320 px and 412 px in both themes (AGENTS "Screenshots") and hand them to the P4a reviewer; P5 adds sections, P4a owns their final placement.

## Self-review

**Spec coverage** (R9, the P5 line, G01-G23, B11, C09, C12, C13, C16):

| Item | Task |
|---|---|
| G01 pre-session weigh-in by role, 2 % check fires | 2 (domain), 7 (Train, e2e) |
| G02 body mass any day from Today | 6 (+ e2e) |
| G03 edit/delete with undo | 3 (store), 6 (Today undo, Log list, e2e typo) |
| G04 PAL only stored activity value; nine-stop slider in Settings | 10 (see Decisions: `activity` kept as a derived band) |
| G05 body-fat re-measure as a dated entry; targets use the newest | 1 (reader), 9 (form) |
| G06 profile editor with wizard validators | 4 (rules moved), 9 (editor) |
| G07 always-available fluid quick add | 3 (undo), 8 |
| G08 bound in words, plausibility at entry | 1 (`implausibleMass`), 4 (`bodyMassEntryError`), 5 |
| G09 Targets names the out-of-range field | 11 |
| G10 chart sizing | P4a (data props fixed in 13) |
| G11 projection anchored at the programme start | 1 (`projectionAnchor`), 13 |
| G12 trend from one role | 1, 7, 13 |
| G13 `useCivilToday`, keyed check-in | 11 |
| G14 one fluid target, unit-aware fields, cup size | 8 |
| G15 Atlas 320 px | 13 |
| G16 time capsule write another | 12 |
| G17 intake history | 11 |
| G18 AMRAP x by weeks, unloaded only | 13 |
| G19 lazy icon retry | P4b E12 (not here) |
| G20 render-time clocks (Today, capsule) | 12 |
| G21 memoised derivations, banner selectors | 8 (banner), 13 (PRList, AmrapSpark) |
| G22 duplicated constants | 11 (RMR names), 12 (capsule bound) |
| G23 fl oz rounding | 8 |
| B11 export summary from `nutritionInputFor` | 1 |
| C09 prefill reps and load; refusal in words | 14 (layout parts: P4a) |
| C12 finish confirm and undo | 15 |
| C13 quantise once in the domain | 14 |
| C16 untouched prefill logs exact kg | 14 |
| e2e: rest-day mass, typo edit, fluid-loss flag | 6, 7 (+ 15 answers the Finish question) |

**Placeholder scan:** every code step carries the code; two steps are mechanical moves by quoted anchor (Task 4 moves wizard helpers verbatim; Task 12 moves the capsule's write dialog unchanged). Where P1 text is assumed, the quote is P1's.

**Type consistency:** `logBodyMass(...): string` (Task 3) is used by Tasks 6, 7, 9; `BodyMassEdit.role: BodyMassRole | null` (3) matches `BodyMassForm`'s `onSubmit(massKg, role: BodyMassRole | null)` (5); `preSessionMass(masses, startedAt, endedAt)` (2) is called with `assignment.completedAt` (7); `ProjectionAnchor` (1) is the chart's `projectionFrom` type (13); `nutritionInputFor(..., latestBodyFat?)` (1) is called by `useNutritionInput` (11) and gets `palOf` fields (10); `MASS_ROLE_KEY` (5) is read by `BodyMassLog` (6); `targetSetsFor` (15) replaces the inline formula in ExerciseCard; `prefillKg`/`prefillCount` (14) default so P1's `SetRow` tests compile unchanged.

**Shared files with other phases:** P1 (Tasks 9, 11, 12, 13, 14): `src/store/index.ts`, `src/store/training.ts` (read only), `TodayView.tsx`, `TrainView.tsx`, `ExerciseCard.tsx`, `SetRow.tsx`, `TargetsView.tsx`, `UnitInput.tsx` (read only), `src/content/copy.ts`. P2: `src/domain/schema.ts` (one optional field), e2e storage helpers (read only here). P3: `src/ui/setup/SetupWizard.tsx` (Tasks 4, 11), `TodayView.tsx`. P4a: `TodayView.tsx`, `LogView.tsx`, `SettingsView.tsx`, `BodyMassChart.tsx`, `atlas.css`, `SetRow.tsx` layout. P4b: none (G19 left to it). P6: none.

**Known risks (each with the observation that settles it):**
- Copy-key rows in `limelight-resolved.json` collide when two phases append at the same place: the runner resolves the JSON merge; `src/content/limelightParity.test.ts` proves the result.
- Task 4 vs P3 wizard edits: if P3 moved the same helpers first, Task 4 would make a second copy. Settled by `grep -n "function requiredInRange" -r src` before starting (exactly one hit afterwards).
- Task 11 rewrites `TargetsView.tsx` whole: a P1/P3/P4a edit landing between this plan and execution would be lost. Settled by diffing the file against the P1 Task 13 + Task 8 state before replacing (the step says so).
- C09 prefill changes what an untouched row logs (the top of the range). Settled by the owner on the phone; reversible by passing `prefillCount={null}` in ExerciseCard.
- Atlas two columns at 320 px may clip a card's title: settled by the Task 13 screenshot.
- The G01 e2e depends on P1's `startFromToday` and on the Train layout the P4a shell leaves; if P4a moves Finish into a sheet, the spec's locator follows `e2e/support/app.ts`.
