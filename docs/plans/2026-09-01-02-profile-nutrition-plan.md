# P2 — Profile, nutrition engine, plan generator, setup wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** collect one user's body data, goal, equipment and weekly availability once, and turn them into a cited energy/protein/fluid target and a generated 8–24 week training plan sized to the days they can actually train.

**Architecture:** four pure domain modules (`nutrition`, `bodyfat`, `plan/library`, `plan/templates` + `plan/generator`) with no React and no I/O, five store actions on top of the P1 Zustand store, one memoised selector, and two UI surfaces (a seven-step setup wizard and a targets/check-in view). Every coefficient is a named constant carrying the equation name and the DOI verified in `docs/review/2026-09-01-content-peer-review.md`; nothing that report marked PARAPHRASE, COULD NOT VERIFY or INSUFFICIENT EVIDENCE becomes a number.

**Tech Stack:** TypeScript 5.9 (strict), React 19, Zustand 5, Vitest 4 + Testing Library + jsdom + fast-check. No new runtime dependencies.

**Assumes P1 is complete:** `src/domain/{types,ids,units,dates,schema}.ts`, `src/store/{index,persistence,selectors}.ts`, `src/app/App.tsx`, the CRT stylesheet, Vitest and ESLint config all exist with the master-plan signatures. This plan adds to them; it never re-creates them.

---

## Global Constraints

Copied verbatim from `docs/plans/2026-09-01-00-master-plan.md` §3. Every task implicitly includes them.

**Versions (floors, from `npm view` on 2026-09-01):** Node `>=22.12` (installed 22.23.1); `vite ^8.2.2`; `@vitejs/plugin-react ^6.1.1`; `react ^19.2.8`, `react-dom ^19.2.8`, `@types/react ^19.2.18`, `@types/react-dom ^19.2.5`; `typescript ^5.9.3` (NOT 7.x); `zod ^4.5.4`; `zustand ^5.0.15`; `date-fns ^4.4.0`; `@date-fns/tz ^1.5.0`; `vite-plugin-pwa ^1.3.0`; `workbox-window ^7.4.1`; `vitest ^4.1.11`; `@testing-library/react ^16.3.3`; `jsdom ^30.0.1`; `fast-check ^4.9.0`; `eslint ^10.9.1`; `typescript-eslint ^8.69.0`; `eslint-plugin-react-hooks ^7.1.1`; `globals ^17.12.0`; `@fontsource-variable/jetbrains-mono ^5.3.0`; `@fontsource-variable/geist ^5.3.0`; `idb ^8.0.3`. Worker: `wrangler ^4.128.0`; `@cloudflare/workers-types ^5.20260901.1`; `@pushforge/builder ^2.0.5`.

**TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `verbatimModuleSyntax: true`, `target: ES2022`, `moduleResolution: bundler`. No `any`, no `as` casts on external data.

**Lint gates (must fail the build):** `no-empty` with no `allowEmptyCatch`; `no-restricted-syntax` banning `CallExpression[callee.property.name='toISOString']` outside `src/domain/dates.ts`; `no-restricted-globals` banning bare `localStorage` outside `src/store/persistence.ts`; `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` as errors; `@typescript-eslint/no-explicit-any` error.

**Units and sign conventions (canonical storage, no exceptions):** mass kg, volume mL, duration s, instants epoch ms UTC, distances m, energy kcal, protein g. Display unit is a profile property applied only in `src/domain/units.ts`. `1 lb = 0.45359237 kg` exactly. Logged loads display at 0.1 resolution in the display unit with no plate quantisation (a logged value is never altered for display); only *suggested* loads are quantised, rounding down, to the user's equipment step (defaults: barbell 2.5 kg or 5 lb, dumbbells 5 kg or 10 lb per pair, from the content review's verified plate table). Body mass displays at 0.1. Entered values are converted exactly and stored with `enteredUnit`. Deltas are `current − reference`: negative body-mass delta means loss; negative weekly delta means sessions missed. Every physical quantity in code carries a unit comment.

**Dates:** `LocalDate` is `"YYYY-MM-DD"` in the profile's IANA zone, produced only by `src/domain/dates.ts`. Week starts Monday (ISO). Tests for date logic run fixtures in `Europe/Athens`, `America/New_York`, `America/Los_Angeles`, and `UTC`, across both DST transitions; a 168-day programme must measure 168 days in every zone.

**Content Security Policy (meta tag in `index.html`; enforced in CI by grepping `dist/index.html`):**
`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' https://*.workers.dev; frame-src https://yewtu.be https://inv.nadeko.net https://invidious.nerdvpn.de https://iv.duti.dev https://invidious.f5.si https://id.420129.xyz; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'`.
(`connect-src` is tightened to the exact Worker hostname in P5 once it exists; the `frame-src` host list is generated from `src/config/videoInstances.ts` at build time by a Vite HTML transform so the two never drift.) No inline `<script>`, no `eval`, no runtime JSX. `<meta name="referrer" content="no-referrer">`.

**Personal data:** no medication, biometric, or location strings in tracked source. CI gate: `git grep -nEi 'vyvanse|lisdexamfetamine|ymca|amphetamine' -- ':!docs/review/*' ':!REFERENCES.md'` must return nothing after P7's cutover; during P1–P6 the legacy tree under `legacy/` is scrubbed of the lines listed in the content review §7 and security H1 before the baseline commit.

**Storage:** single key `fti.v3`, owned by `src/store/persistence.ts`; payload carries `schemaVersion`; every load, import, and paste passes `AppStateSchema.safeParse`; on failure keep last known-good state in memory, show the error, offer export; `QuotaExceededError` shows a blocking banner. No derived values persisted.

**Destructive actions:** typed confirmation (`type DELETE`) plus automatic JSON export download before the wipe. No always-visible wipe control.

**Tests:** Vitest; unit tests next to modules as `*.test.ts`; UI tests with Testing Library under `src/ui/**/*.test.tsx`; property tests with fast-check for units and schema round-trips. `npm test` must pass before every commit.

**Tone in all user-facing copy:** clinical, formal, honest; no hype, no emoji, no motivational filler (the video is the one sanctioned exception). Terminology: use the defined quantity (kcal, g protein, kg, mL, RPE, RIR, 1RM) never a colloquial stand-in.

**Commits:** each task ends with a commit on `main` of this repository (no push unless the user asks). Commit messages: `feat|fix|test|chore|docs: <summary>`.

---

## Evidence ledger — every number this plan hard-codes

Source for all of it: `docs/review/2026-09-01-content-peer-review.md`, Deliverable 2 (lines 218–444) and §2.2, §6, §9. DOIs below are the ones that report resolved against Crossref. **Nothing else may be hard-coded.** Where the report itself labels a value a heuristic or supplies a band but not a point value, the code comment says so in those words.

| # | Value in code | Report § | Source | DOI (verified by the report) |
|---|---|---|---|---|
| 1 | `10, 6.25, −5, +5 / −161` (Mifflin-St Jeor) | D2 §1 | Mifflin 1990, Am J Clin Nutr 51(2):241-247 | `10.1093/ajcn/51.2.241` |
| 2 | `370 + 21.6 × FFM` (Cunningham) | D2 §1 | Cunningham 1991, Am J Clin Nutr 54(6):963-969 | `10.1093/ajcn/54.6.963` |
| 3 | PAL bands `1.40–1.69 / 1.70–1.99 / 2.00–2.40` | D2 §2 | FAO/WHO/UNU 2004, Table 5.3 p.38 | no DOI (UN technical report); verified from the primary PDF |
| 4 | Fat-loss rate `0.7 %BW/wk` | D2 §3 | Garthe 2011, IJSNEM 21(2):97-104 | `10.1123/ijsnem.21.2.97` |
| 5 | Rate bound `0.5–1.0 %BW/wk` | D2 §3 | Helms 2014, JISSN 11:20 | `10.1186/1550-2783-11-20` |
| 6 | Muscle-gain surplus `500 kcal/d` (measured 506±84) | D2 §3 | Garthe 2011, APNM 36(4):547-554 | `10.1139/h11-051` |
| 7 | Surplus is weakly evidenced — say so in `basis` | D2 §3 | Slater 2019, Front Nutr 6:131 | `10.3389/fnut.2019.00131` |
| 8 | Protein `1.4–2.0 g/kg body mass` (maintenance) | D2 §4 | Jäger 2017, JISSN 14:20 | `10.1186/s12970-017-0177-8` |
| 9 | Protein `1.6–2.2 g/kg body mass` (gain) | D2 §4 | Morton 2018, BJSM 52(6):376-384 | `10.1136/bjsports-2017-097608` |
| 10 | Protein `2.3–3.1 g/kg FFM` (deficit) | D2 §4 | Helms 2014, IJSNEM 24(2):127-138 | `10.1123/ijsnem.2013-0054` |
| 11 | Navy tape coefficients (metric, both sexes) + Siri | D2 §5 | Hodgdon & Beckett 1984 NHRC 84-11 / 84-29 | `10.21236/ada143890`, `10.21236/ada146456` |
| 12 | Navy SEE `3.52` (men) / `3.72` (women) %BF | D2 §5 | as above | as above |
| 13 | Fractional set counting `direct 1.0 / indirect 0.5` | D2 §6 | Pelland 2025, Sports Med 56(2):481-505 | `10.1007/s40279-025-02344-w` |
| 14 | `≥10 sets/wk` floor, `~18–20` deceleration | D2 §6 | Currier 2026 ACSM Position Stand, MSSE 58(4):851-872 | `10.1249/mss.0000000000003897` |
| 15 | Weekly set band by day count `6-10 / 9-15 / 12-16 / 14-18 / 16-20` | D2 §7 | report table (built on 13, 14, and Currier 2023) | `10.1136/bjsports-2023-106807` |
| 16 | Split choice by day count; frequency is a scheduling variable | D2 §7 | Schoenfeld 2019, J Sports Sci 37(11):1286-1295 | `10.1080/02640414.2018.1555906` |
| 17 | Beverage target `3000 mL` male / `2200 mL` female | D2 §8 | IOM 2005 DRI Water | `10.17226/10925` |
| 18 | Rest `180 / 120 / 90 s` by load class | D2 §9 | Schoenfeld 2016 `10.1519/JSC.0000000000001272`; Grgic 2018 `10.1007/s40279-017-0788-x`; de Salles 2009 | `10.2165/11315230-000000000-00000` |
| 19 | Deload cuts **volume 41–60 %**, load unchanged | §2.2 | Bosquet 2007, MSSE 39(8):1358-1365 | `10.1249/mss.0b013e31806010e0` |
| 20 | Deload cadence is a calendar **backstop**, not evidence | §2.2 | Bell 2023 `10.1186/s40798-023-00633-0`; Coleman 2024 | `10.7717/peerj.16777` |
| 21 | Creatine `max(3 g, 0.1 g/kg)` capped near 10 g/d | D2 §11 | Kreider 2017 `10.1186/s12970-017-0173-z`; Antonio 2021 | `10.1186/s12970-021-00412-w` |
| 22 | No sex term outside RMR, body fat and fluid | D2 preamble | Roberts 2020, JSCR 34(5):1448-1460 | `10.1519/JSC.0000000000003521` |

**Explicitly banned from the code (report status):** `3500 kcal/lb`; the gym PAL ladder `1.2 / 1.375 / 1.55 / 1.725 / 1.9` (no primary source exists); `~1.5 L per kg lost` post-exercise replacement (PARAPHRASE, HTTP 402); a flat `3.5 L/day` fluid target; a flat `2.5 kg` load increment; `10 sets/wk` as an optimum (failed category boundary, P=0.074); any goal-stratified rep range (the report supplies none).

**Values the report supplies as a band, where the code must pick a point:** the code picks a band **edge or midpoint**, comments it `HEURISTIC — within-band placement`, and exposes it in `NutritionTargets.basis` so it is visible to the user rather than buried.

---

## File structure

| Path | Responsibility | Task |
|---|---|---|
| `src/domain/nutrition.ts` | RMR, TDEE, energy target, protein, fluid, creatine, expected rate | 1 |
| `src/domain/nutrition.test.ts` | worked numbers, rate bound, property tests | 1 |
| `src/domain/bodyfat.ts` | US Navy tape method (metric form) | 2 |
| `src/domain/bodyfat.test.ts` | longhand arithmetic, hip-term guard, validation | 2 |
| `src/domain/plan/library.ts` | `EXERCISES`, `EXERCISE_BY_ID`, `FORM_CUE_IDS`, `MUSCLE_GROUPS` | 3 |
| `src/domain/plan/library.test.ts` | id uniqueness, vocabulary, provenance, exclusion | 3 |
| `src/domain/plan/templates.ts` | split templates 2–6 days, set tables, prescriptions, rest | 4 |
| `src/domain/plan/templates.test.ts` | candidate integrity, equipment resolution, rest mapping | 4 |
| `src/domain/plan/generator.ts` | `generatePlan`, `weeklySetsByMuscle`, `volumeReport` | 5 |
| `src/domain/plan/generator.test.ts` | P2 generator gate | 5 |
| `src/store/index.ts` | +5 actions (modify) | 6 |
| `src/store/selectors.ts` | `latestBodyMassEntry`, `useNutritionTargets` (modify) | 6 |
| `src/store/profile.test.ts` | action semantics + selector memoisation | 6 |
| `src/ui/setup/SetupWizard.tsx` | seven-step wizard + review screen | 7 |
| `src/ui/setup/setup.css` | phone-first wizard layout (token fallbacks) | 7 |
| `src/ui/setup/SetupWizard.test.tsx` | unit labelling, exact conversion, no medication field | 7 |
| `src/ui/components/AsciiBar.tsx` | shared ASCII progress bar | 8 |
| `src/ui/views/TargetsView.tsx` | targets + daily kcal/protein check-in | 8 |
| `src/ui/views/SettingsView.tsx` | profile editing entry point | 8 |
| `src/ui/views/TargetsView.test.tsx` | bar rendering, check-in write-through | 8 |
| `src/app/App.tsx` | wire `targets` view + wizard gate (modify) | 8 |

---

## Task 1: Nutrition engine (`src/domain/nutrition.ts`)

**Files:**
- Create: `src/domain/nutrition.ts`
- Create: `src/domain/nutrition.test.ts`

**Interfaces:**
- Consumes (from P1): `src/domain/types.ts` — `ActivityLevel`, `GoalKind`, `Kg`, `ML`, `Sex`.
- Produces (used by Tasks 6, 7, 8 and by P4's `hydration.ts`):
  - `interface NutritionInput { sex: Sex; ageYears: number; heightCm: number; massKg: Kg; bodyFatPct: number | null; activity: ActivityLevel; goal: GoalKind; sessionsPerWeek: number; creatine: boolean }`
  - `interface NutritionTargets { rmrKcal: number; tdeeKcal: number; targetKcal: number; proteinG: { lo: number; hi: number }; fluidML: ML; creatineG: number | null; expectedRateKgPerWeek: number | null; basis: { rmr: "mifflin-st-jeor" | "cunningham"; activityFactor: number; proteinRule: string; deficitRule: string; rateRule: string } }`
  - `function computeTargets(input: NutritionInput): NutritionTargets`
  - `function dailyBeverageTargetML(sex: Sex): ML`
  - `function fatFreeMassKg(massKg: Kg, bodyFatPct: number): Kg`
  - `const ACTIVITY_FACTOR: Record<ActivityLevel, number>`, `const ACTIVITY_BAND: Record<ActivityLevel, readonly [number, number]>`
  - `const FAT_LOSS_RATE_BOUND: { loFraction: number; hiFraction: number }`

**Two deliberate design decisions, both forced by the report:**

1. `targetKcal` and `expectedRateKgPerWeek` are computed **independently and are not claimed to predict each other.** The report rejects `3500 kcal/lb` outright (Hall 2011, `10.1016/S0140-6736(11)60812-X`) and the replacement it offers — "10 kcal per day per pound of weight change" — is a *steady-state* relation (half the change takes about a year), not a weekly-rate rule. There is therefore **no verified coefficient in the report that converts a kcal deficit into a weekly mass change**, so the code must not perform that conversion. `targetKcal` is an intake prescription; `expectedRateKgPerWeek` is the *prescribed target rate* the plan is evaluated against; `basis.rateRule` says so in words.
2. `expectedRateKgPerWeek` is `number | null`. For muscle gain the report gives the surplus (506±84 kcal/d) and the total gain (+4.3±0.9 % body mass) but **no study duration**, so no weekly rate can be derived. The field is `null` and `basis.rateRule` states why, rather than inventing a number.

- [ ] **Step 1: Write the failing test**

Create `src/domain/nutrition.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  ACTIVITY_BAND,
  ACTIVITY_FACTOR,
  computeTargets,
  dailyBeverageTargetML,
  fatFreeMassKg,
  FAT_LOSS_RATE_BOUND,
  type NutritionInput,
} from "./nutrition";
import type { ActivityLevel, GoalKind, Sex } from "./types";

/** Base input: male, 30 y, 180 cm, 80 kg, body fat unknown. Used where the report
 *  supplies an equation but no worked subject (Mifflin needs height and age, which
 *  the legacy file never collected — see the plan's "unverified inputs" section). */
const base: NutritionInput = {
  sex: "male",
  ageYears: 30,          // years
  heightCm: 180,         // cm
  massKg: 80,            // kg
  bodyFatPct: null,      // percent
  activity: "moderate",
  goal: "maintenance",
  sessionsPerWeek: 4,    // sessions/week
  creatine: false,
};

describe("fat-free mass", () => {
  it("reproduces the report's stated body composition for 95.3 kg at 27 % body fat", () => {
    // Content review §1 "Body-composition baseline": 0.27 x 95.3 = 25.73 kg fat, 69.57 kg lean.
    expect(fatFreeMassKg(95.3, 27)).toBeCloseTo(69.569, 3);
    expect(95.3 - fatFreeMassKg(95.3, 27)).toBeCloseTo(25.731, 3);
  });

  it("rejects a body-fat percentage outside [0, 100)", () => {
    expect(() => fatFreeMassKg(80, -1)).toThrow(RangeError);
    expect(() => fatFreeMassKg(80, 100)).toThrow(RangeError);
  });
});

describe("resting metabolic rate", () => {
  it("uses Mifflin-St Jeor when body fat is unknown (male constant +5)", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780 kcal/day
    const t = computeTargets(base);
    expect(t.rmrKcal).toBe(1780);
    expect(t.basis.rmr).toBe("mifflin-st-jeor");
  });

  it("uses the female constant -161", () => {
    // 800 + 1125 - 150 - 161 = 1614 kcal/day
    expect(computeTargets({ ...base, sex: "female" }).rmrKcal).toBe(1614);
  });

  it("switches to Cunningham when body fat is known", () => {
    // FFM = 95.3 x (1 - 0.27) = 69.569 kg; 370 + 21.6 x 69.569 = 1872.6904 -> 1873 kcal/day
    const t = computeTargets({ ...base, massKg: 95.3, bodyFatPct: 27 });
    expect(t.rmrKcal).toBe(1873);
    expect(t.basis.rmr).toBe("cunningham");
  });
});

const ACTIVITY_LEVELS: ActivityLevel[] = ["sedentary", "light", "moderate", "active", "very-active"];

describe("activity factors", () => {
  it("places every factor inside its FAO 2004 band", () => {
    for (const level of ACTIVITY_LEVELS) {
      const [lo, hi] = ACTIVITY_BAND[level];
      expect(ACTIVITY_FACTOR[level]).toBeGreaterThanOrEqual(lo);
      expect(ACTIVITY_FACTOR[level]).toBeLessThanOrEqual(hi);
    }
  });

  it("never uses the unsourced gym ladder", () => {
    const banned = [1.2, 1.375, 1.725, 1.9];
    for (const v of Object.values(ACTIVITY_FACTOR)) expect(banned).not.toContain(v);
  });

  it("multiplies RMR by the factor to get TDEE", () => {
    // 1780 x 1.70 = 3026 kcal/day
    const t = computeTargets(base);
    expect(t.basis.activityFactor).toBe(1.7);
    expect(t.tdeeKcal).toBe(3026);
  });
});

describe("energy target by goal", () => {
  it("cuts 15 % of TDEE for fat loss", () => {
    // 1780 x 1.70 x 0.85 = 2572.1 -> 2572 kcal/day
    expect(computeTargets({ ...base, goal: "fat-loss" }).targetKcal).toBe(2572);
  });

  it("adds 500 kcal for muscle gain", () => {
    expect(computeTargets({ ...base, goal: "muscle-gain" }).targetKcal).toBe(3026 + 500);
  });

  it("holds TDEE for maintenance and recomposition", () => {
    expect(computeTargets(base).targetKcal).toBe(3026);
    expect(computeTargets({ ...base, goal: "recomposition" }).targetKcal).toBe(3026);
  });
});

describe("expected rate of body-mass change", () => {
  it("is signed negative for fat loss at 0.7 %BW/week", () => {
    // -0.007 x 80 kg = -0.56 kg/week
    const t = computeTargets({ ...base, goal: "fat-loss" });
    expect(t.expectedRateKgPerWeek).toBeCloseTo(-0.56, 10);
  });

  it("never exceeds the Helms 0.5-1.0 %BW/week bound at any body mass", () => {
    fc.assert(
      fc.property(fc.double({ min: 35, max: 250, noNaN: true }), (massKg) => {
        const t = computeTargets({ ...base, massKg, goal: "fat-loss" });
        const rate = t.expectedRateKgPerWeek;
        if (rate === null) return false;
        const fraction = Math.abs(rate) / massKg;
        return (
          rate < 0 &&
          fraction >= FAT_LOSS_RATE_BOUND.loFraction - 1e-12 &&
          fraction <= FAT_LOSS_RATE_BOUND.hiFraction + 1e-12
        );
      }),
      { numRuns: 2000 },
    );
  });

  it("is null for muscle gain because the report gives no study duration", () => {
    const t = computeTargets({ ...base, goal: "muscle-gain" });
    expect(t.expectedRateKgPerWeek).toBeNull();
    expect(t.basis.rateRule).toMatch(/no weekly rate/i);
  });

  it("is exactly zero for maintenance and recomposition", () => {
    expect(computeTargets(base).expectedRateKgPerWeek).toBe(0);
    expect(computeTargets({ ...base, goal: "recomposition" }).expectedRateKgPerWeek).toBe(0);
  });
});

describe("protein targets keep their denominators separate", () => {
  it("uses body mass for maintenance (1.4-2.0 g/kg)", () => {
    const t = computeTargets(base);
    expect(t.proteinG).toEqual({ lo: 112, hi: 160 });
    expect(t.basis.proteinRule).toMatch(/body mass/);
  });

  it("uses body mass for muscle gain (1.6-2.2 g/kg)", () => {
    expect(computeTargets({ ...base, goal: "muscle-gain" }).proteinG).toEqual({ lo: 128, hi: 176 });
  });

  it("uses FFM for fat loss (2.3-3.1 g/kg FFM) and brackets the report's 190 g example", () => {
    // FFM 69.569 kg -> 2.3 x 69.569 = 160.0087 -> 160 g; 3.1 x 69.569 = 215.6639 -> 216 g.
    // Content review §1: 190 g = 2.73 g/kg FFM, inside Helms 2.3-3.1 g/kg FFM.
    const t = computeTargets({ ...base, massKg: 95.3, bodyFatPct: 27, goal: "fat-loss" });
    expect(t.proteinG).toEqual({ lo: 160, hi: 216 });
    expect(190).toBeGreaterThanOrEqual(t.proteinG.lo);
    expect(190).toBeLessThanOrEqual(t.proteinG.hi);
    expect(t.basis.proteinRule).toMatch(/fat-free mass/);
  });

  it("reproduces the report's own two g/kg conversions for 190 g", () => {
    // Content review §1 "Protein mass": 190 g = 1.99 g/kg body weight = 2.73 g/kg FFM.
    expect(190 / 95.3).toBeCloseTo(1.99, 2);
    expect(190 / fatFreeMassKg(95.3, 27)).toBeCloseTo(2.73, 2);
  });

  it("falls back to the body-mass maintenance row when fat loss is requested without a body-fat estimate", () => {
    // The FFM range must never be applied to body mass: at 25 % body fat that is a ~33 % overfeed
    // (content review §4 "Unit trap"). With no FFM the engine drops to the lower, body-mass row.
    const t = computeTargets({ ...base, goal: "fat-loss" });
    expect(t.proteinG).toEqual({ lo: 112, hi: 160 });
    expect(t.basis.proteinRule).toMatch(/no body-fat estimate/i);
  });
});

describe("fluid and creatine", () => {
  it("uses the IOM beverage share, not the total-water AI", () => {
    expect(dailyBeverageTargetML("male")).toBe(3000);
    expect(dailyBeverageTargetML("female")).toBe(2200);
    expect(computeTargets(base).fluidML).toBe(3000);
    expect(computeTargets({ ...base, sex: "female" }).fluidML).toBe(2200);
  });

  it("returns null creatine when the toggle is off", () => {
    expect(computeTargets(base).creatineG).toBeNull();
  });

  it("doses creatine by body mass: max(3 g, 0.1 g/kg), capped at 10 g/day", () => {
    expect(computeTargets({ ...base, creatine: true, massKg: 25 }).creatineG).toBe(3);
    expect(computeTargets({ ...base, creatine: true, massKg: 80 }).creatineG).toBe(8);
    expect(computeTargets({ ...base, creatine: true, massKg: 95.3 }).creatineG).toBe(9.5);
    expect(computeTargets({ ...base, creatine: true, massKg: 140 }).creatineG).toBe(10);
  });
});

describe("goal direction is monotone in energy", () => {
  it("fat loss is always below TDEE and muscle gain always above", () => {
    const sexes: Sex[] = ["male", "female"];
    fc.assert(
      fc.property(
        fc.double({ min: 35, max: 250, noNaN: true }),
        fc.double({ min: 120, max: 220, noNaN: true }),
        fc.integer({ min: 16, max: 90 }),
        fc.constantFrom(...sexes),
        fc.constantFrom(...ACTIVITY_LEVELS),
        fc.option(fc.double({ min: 3, max: 60, noNaN: true }), { nil: null }),
        (massKg, heightCm, ageYears, sex, activity, bodyFatPct) => {
          const shared = { ...base, massKg, heightCm, ageYears, sex, activity, bodyFatPct };
          const lossGoal: GoalKind = "fat-loss";
          const gainGoal: GoalKind = "muscle-gain";
          const loss = computeTargets({ ...shared, goal: lossGoal });
          const gain = computeTargets({ ...shared, goal: gainGoal });
          return loss.targetKcal < loss.tdeeKcal && gain.targetKcal > gain.tdeeKcal;
        },
      ),
      { numRuns: 2000 },
    );
  });
});

describe("input validation", () => {
  it("throws on non-positive mass, height or age", () => {
    expect(() => computeTargets({ ...base, massKg: 0 })).toThrow(RangeError);
    expect(() => computeTargets({ ...base, heightCm: 0 })).toThrow(RangeError);
    expect(() => computeTargets({ ...base, ageYears: 0 })).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/nutrition.test.ts`
Expected: FAIL — `Failed to resolve import "./nutrition"`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/nutrition.ts`:

```ts
import type { ActivityLevel, GoalKind, Kg, ML, Sex } from "./types";

/**
 * Nutrition engine.
 *
 * Every coefficient in this file comes from docs/review/2026-09-01-content-peer-review.md,
 * Deliverable 2, and carries the equation name and the DOI that report verified against
 * Crossref. Values the report marked PARAPHRASE, COULD NOT VERIFY or INSUFFICIENT EVIDENCE
 * do not appear here. Where the report supplies a band and the code must pick one number,
 * the comment says HEURISTIC and the choice is exposed through NutritionTargets.basis.
 *
 * Units: energy kcal/day, mass kg, protein g/day, fluid mL/day, rate kg/week (signed,
 * negative = mass loss, per the master plan's delta convention current - reference).
 */

export interface NutritionInput {
  sex: Sex;
  ageYears: number; // years, > 0
  heightCm: number; // cm, > 0
  massKg: Kg; // kg, > 0
  bodyFatPct: number | null; // percent of body mass in [0, 100); null = not measured
  activity: ActivityLevel;
  goal: GoalKind;
  sessionsPerWeek: number; // sessions/week; see NOTE-FREQ below
  creatine: boolean;
}

export interface NutritionTargets {
  rmrKcal: number; // kcal/day
  tdeeKcal: number; // kcal/day
  targetKcal: number; // kcal/day
  proteinG: { lo: number; hi: number }; // g/day
  fluidML: ML; // mL/day, beverages only (food water is not counted)
  creatineG: number | null; // g/day; null when the supplement toggle is off
  expectedRateKgPerWeek: number | null; // kg/week, signed; null = the report gives no rate
  basis: {
    rmr: "mifflin-st-jeor" | "cunningham";
    activityFactor: number; // PAL, dimensionless
    proteinRule: string;
    deficitRule: string;
    rateRule: string;
  };
}

/* ------------------------------------------------------------------ *
 * Resting metabolic rate
 * ------------------------------------------------------------------ */

/**
 * Mifflin-St Jeor (1990). Am J Clin Nutr 51(2):241-247. DOI 10.1093/ajcn/51.2.241 (verified).
 *   Male:   RMR = 10*mass(kg) + 6.25*height(cm) - 5*age(y) + 5
 *   Female: RMR = 10*mass(kg) + 6.25*height(cm) - 5*age(y) - 161
 * Chosen over Harris-Benedict / Roza-Shizgal because Frankenfield 2013
 * (DOI 10.1016/j.clnu.2013.03.022) found it accurate in 82 % of n=337 and unbiased
 * (95 % CI -26 to +8 kcal/d) where the others overestimated.
 */
const MSJ_MASS_COEFF = 10; // kcal/day per kg body mass
const MSJ_HEIGHT_COEFF = 6.25; // kcal/day per cm stature
const MSJ_AGE_COEFF = -5; // kcal/day per year of age
const MSJ_CONSTANT: Record<Sex, number> = { male: 5, female: -161 }; // kcal/day

/**
 * Cunningham (1991). Am J Clin Nutr 54(6):963-969. DOI 10.1093/ajcn/54.6.963 (verified).
 *   RMR = 370 + 21.6 * FFM(kg)
 * Two traps the report flags: PubMed renders this as "370 +/- 21.6 x FFM" — a typesetting
 * artifact, the operator is +; and the equation is widely mislabelled "Katch-McArdle" —
 * Cunningham published it. Do NOT confuse it with Cunningham (1980) `500 + 22*LBM`.
 */
const CUNNINGHAM_INTERCEPT = 370; // kcal/day
const CUNNINGHAM_FFM_COEFF = 21.6; // kcal/day per kg fat-free mass

/** FFM in kg from body mass and body-fat percentage. */
export function fatFreeMassKg(massKg: Kg, bodyFatPct: number): Kg {
  if (!Number.isFinite(massKg) || massKg <= 0) {
    throw new RangeError("fatFreeMassKg: massKg must be a finite number > 0");
  }
  if (!Number.isFinite(bodyFatPct) || bodyFatPct < 0 || bodyFatPct >= 100) {
    throw new RangeError("fatFreeMassKg: bodyFatPct must be in [0, 100)");
  }
  return massKg * (1 - bodyFatPct / 100); // kg
}

function mifflinStJeorKcal(input: NutritionInput): number {
  return (
    MSJ_MASS_COEFF * input.massKg +
    MSJ_HEIGHT_COEFF * input.heightCm +
    MSJ_AGE_COEFF * input.ageYears +
    MSJ_CONSTANT[input.sex]
  ); // kcal/day
}

function cunninghamKcal(ffmKg: Kg): number {
  return CUNNINGHAM_INTERCEPT + CUNNINGHAM_FFM_COEFF * ffmKg; // kcal/day
}

/* ------------------------------------------------------------------ *
 * Activity
 * ------------------------------------------------------------------ */

/**
 * FAO/WHO/UNU (2004), Human Energy Requirements, Table 5.3 p.38. No DOI (UN technical
 * report); the content review verified it from the primary PDF and the HTML chapter.
 *   PAL = TEE / BMR
 *   Sedentary or light activity     1.40 - 1.69
 *   Active or moderately active     1.70 - 1.99
 *   Vigorous or vigorously active   2.00 - 2.40
 * The ubiquitous gym ladder 1.2 / 1.375 / 1.55 / 1.725 / 1.9 is REJECTED: no primary source
 * exists, the interior points are arithmetic interpolations, and the 1.2 anchor is Black's
 * NON-AMBULANT limit. FAO puts the free-living floor at 1.40.
 */
export const ACTIVITY_BAND: Record<ActivityLevel, readonly [number, number]> = {
  sedentary: [1.4, 1.69],
  light: [1.4, 1.69],
  moderate: [1.7, 1.99],
  active: [1.7, 1.99],
  "very-active": [2.0, 2.4],
};

/**
 * The profile offers five categories; the only verified source has three bands. Band edges
 * are verified values; the two interior points are within-band midpoints.
 */
export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.4, // verified band edge (FAO free-living floor)
  light: 1.55, // HEURISTIC - within-band placement: midpoint of 1.40-1.69 is 1.545, rounded to 1.55
  moderate: 1.7, // verified band edge
  active: 1.85, // HEURISTIC - within-band placement: midpoint of 1.70-1.99 is 1.845, rounded to 1.85
  "very-active": 2.0, // verified band edge
};

/* ------------------------------------------------------------------ *
 * Energy target and rate of change
 * ------------------------------------------------------------------ */

/**
 * Fat loss. The report supplies a RATE (Garthe 2011, DOI 10.1123/ijsnem.21.2.97: aim for
 * 0.7 %BW/week; bound 0.5-1.0 %BW/week, Helms 2014 DOI 10.1186/1550-2783-11-20) but no
 * verified kcal-per-week conversion: 3500 kcal/lb is rejected outright (Hall 2011,
 * DOI 10.1016/S0140-6736(11)60812-X) and Hall's replacement ("10 kcal/day per pound") is a
 * steady-state relation that takes about a year to reach half its effect, not a weekly rule.
 * The intake cut is therefore taken from the report's own intake-cut recommendation
 * (§2.2 "Plateau response": cut 10-15 % of current intake) applied to TDEE at the top of
 * that band. HEURISTIC - the report gives this as a recommendation, not a measured value.
 * The two numbers are independent: targetKcal is an intake prescription, expectedRate is the
 * prescribed rate the plan is evaluated against. Neither predicts the other.
 */
const FAT_LOSS_INTAKE_CUT = 0.15; // fraction of TDEE

/**
 * Muscle gain. Garthe 2011 (Appl Physiol Nutr Metab 36(4):547-554, DOI 10.1139/h11-051)
 * counselled 506 +/- 84 kcal/day with 4 strength sessions/week: body mass +4.3 +/- 0.9 %,
 * lean body mass +2.8 +/- 0.5 %. Slater 2019 (DOI 10.3389/fnut.2019.00131) states verbatim
 * that the surplus required "is unknown" — the basis string says so.
 */
const MUSCLE_GAIN_SURPLUS_KCAL = 500; // kcal/day, inside 506 +/- 84

/** Garthe 2011 target rate and the Helms 2014 bound, as fractions of body mass per week. */
const FAT_LOSS_RATE_FRACTION = 0.007; // 0.7 %BW/week
export const FAT_LOSS_RATE_BOUND = { loFraction: 0.005, hiFraction: 0.01 }; // 0.5-1.0 %BW/week

/* ------------------------------------------------------------------ *
 * Protein
 * ------------------------------------------------------------------ */

/**
 * Denominators are kept strictly separate. Applying the FFM range to body mass is a ~33 %
 * overfeed at 25 % body fat (content review §4 "Unit trap - do not propagate").
 *
 *   maintenance / general training  1.4-2.0 g/kg BODY MASS  Jäger 2017, DOI 10.1186/s12970-017-0177-8
 *   muscle gain                     1.6-2.2 g/kg BODY MASS  Morton 2018, DOI 10.1136/bjsports-2017-097608
 *   fat loss in a deficit           2.3-3.1 g/kg FAT-FREE MASS  Helms 2014, DOI 10.1123/ijsnem.2013-0054
 *
 * Morton caution carried into the basis string: the 1.62 break point is reported as a
 * segmental regression that was NOT statistically significant (p=0.079), and 2.2 is the
 * confidence-interval upper bound, not a second measurement.
 */
const PROTEIN_BODY_MASS_MAINTENANCE = { lo: 1.4, hi: 2.0 }; // g/kg body mass/day
const PROTEIN_BODY_MASS_GAIN = { lo: 1.6, hi: 2.2 }; // g/kg body mass/day
const PROTEIN_FFM_DEFICIT = { lo: 2.3, hi: 3.1 }; // g/kg fat-free mass/day

/* ------------------------------------------------------------------ *
 * Fluid
 * ------------------------------------------------------------------ */

/**
 * IOM (2005) Dietary Reference Intakes for Water, DOI 10.17226/10925 (verified). The AI for
 * TOTAL water is 3.7 L men / 2.7 L women, of which BEVERAGES supply 3.0 L and 2.2 L (~81 %;
 * food ~19 %). An app cannot measure the water in food, so it displays the beverage figure.
 * Never display 3.7 / 2.7 L, and never the legacy flat 3.5 L (overshoots the female total AI
 * by ~30 %, undershoots the male, and is sex-invariant where the DRI is not).
 */
const BEVERAGE_TARGET_ML: Record<Sex, ML> = { male: 3000, female: 2200 }; // mL/day

export function dailyBeverageTargetML(sex: Sex): ML {
  return BEVERAGE_TARGET_ML[sex];
}

/* ------------------------------------------------------------------ *
 * Creatine
 * ------------------------------------------------------------------ */

/**
 * Content review §11 engine rule, verbatim: "maintenance max(3 g, 0.1 g/kg), capped near
 * 10 g/d". Kreider 2017 (DOI 10.1186/s12970-017-0173-z): maintenance "3-5 g/day, although
 * some studies indicate that larger athletes may need to ingest as much as 5-10 g/day".
 * Antonio 2021 (DOI 10.1186/s12970-021-00412-w) gives the body-mass form "3-5 g or 0.1 g/kg".
 * Dose by body mass, not sex: neither source gives a sex-specific dose.
 */
const CREATINE_FLOOR_G = 3; // g/day
const CREATINE_PER_KG = 0.1; // g/day per kg body mass
const CREATINE_CAP_G = 10; // g/day, top of Kreider's 5-10 g/day for larger athletes

function creatineDoseG(massKg: Kg): number {
  const dose = Math.min(CREATINE_CAP_G, Math.max(CREATINE_FLOOR_G, CREATINE_PER_KG * massKg));
  return Math.round(dose * 10) / 10; // g/day at 0.1 resolution
}

/* ------------------------------------------------------------------ *
 * Engine
 * ------------------------------------------------------------------ */

interface EnergyPlan {
  targetKcal: number; // kcal/day
  rateKgPerWeek: number | null; // kg/week, signed
  deficitRule: string;
  rateRule: string;
}

function energyPlan(goal: GoalKind, tdeeKcal: number, massKg: Kg): EnergyPlan {
  switch (goal) {
    case "fat-loss": {
      // Clamp is inert while the rate is fixed at 0.7 %BW/week; it is the enforcement point
      // for P7, where the rate becomes user-adjustable. Sign: negative = mass loss.
      const raw = -FAT_LOSS_RATE_FRACTION * massKg; // kg/week
      const mostNegative = -FAT_LOSS_RATE_BOUND.hiFraction * massKg;
      const leastNegative = -FAT_LOSS_RATE_BOUND.loFraction * massKg;
      return {
        targetKcal: tdeeKcal * (1 - FAT_LOSS_INTAKE_CUT),
        rateKgPerWeek: Math.min(leastNegative, Math.max(mostNegative, raw)),
        deficitRule:
          "15 % cut from TDEE (content review §2.2 recommends cutting 10-15 % of current intake; HEURISTIC — a recommendation, not a measured value). 3500 kcal/lb is rejected (Hall 2011, DOI 10.1016/S0140-6736(11)60812-X).",
        rateRule:
          "Target 0.7 %BW/week loss (Garthe 2011, DOI 10.1123/ijsnem.21.2.97), bounded 0.5-1.0 %BW/week (Helms 2014, DOI 10.1186/1550-2783-11-20). This is a prescribed rate, not a prediction from the energy target: the report supplies no verified kcal-to-mass conversion.",
      };
    }
    case "muscle-gain":
      return {
        targetKcal: tdeeKcal + MUSCLE_GAIN_SURPLUS_KCAL,
        rateKgPerWeek: null,
        deficitRule:
          "+500 kcal/day surplus (Garthe 2011, DOI 10.1139/h11-051, measured 506 +/- 84 kcal/day). Slater 2019 (DOI 10.3389/fnut.2019.00131) states the required surplus is unknown — treat this as weakly evidenced.",
        rateRule:
          "No weekly rate is reported: Garthe 2011 gives the total gain (+4.3 +/- 0.9 % body mass) but the content review does not state the study duration, so no kg/week figure can be derived.",
      };
    case "maintenance":
      return {
        targetKcal: tdeeKcal,
        rateKgPerWeek: 0,
        deficitRule: "Energy held at TDEE.",
        rateRule: "Zero by construction: maintenance targets a stable body mass.",
      };
    case "recomposition":
      return {
        targetKcal: tdeeKcal,
        rateKgPerWeek: 0,
        deficitRule:
          "Energy held at TDEE. The content review does not cover recomposition; holding maintenance energy introduces no coefficient the report does not supply.",
        rateRule: "Zero by construction: recomposition targets a stable body mass.",
      };
  }
}

interface ProteinPlan {
  lo: number; // g/day
  hi: number; // g/day
  rule: string;
}

function proteinPlan(goal: GoalKind, massKg: Kg, ffmKg: Kg | null): ProteinPlan {
  const byBodyMass = (r: { lo: number; hi: number }, label: string): ProteinPlan => ({
    lo: Math.round(r.lo * massKg),
    hi: Math.round(r.hi * massKg),
    rule: label,
  });

  if (goal === "fat-loss") {
    if (ffmKg === null) {
      return byBodyMass(
        PROTEIN_BODY_MASS_MAINTENANCE,
        "1.4-2.0 g/kg body mass (Jäger 2017, DOI 10.1186/s12970-017-0177-8). Fallback: the deficit range 2.3-3.1 g/kg is per kg FAT-FREE MASS and there is no body-fat estimate, so it cannot be applied — applying it to body mass would be a ~33 % overfeed at 25 % body fat. Add a body-fat estimate to use the deficit range.",
      );
    }
    return {
      lo: Math.round(PROTEIN_FFM_DEFICIT.lo * ffmKg),
      hi: Math.round(PROTEIN_FFM_DEFICIT.hi * ffmKg),
      rule: "2.3-3.1 g/kg fat-free mass (Helms 2014, DOI 10.1123/ijsnem.2013-0054). Denominator is FFM, not body mass.",
    };
  }
  if (goal === "muscle-gain") {
    return byBodyMass(
      PROTEIN_BODY_MASS_GAIN,
      "1.6-2.2 g/kg body mass (Morton 2018, DOI 10.1136/bjsports-2017-097608). The 1.62 break point was not statistically significant (p=0.079) and 2.2 is the confidence-interval upper bound, so treat the range as soft.",
    );
  }
  if (goal === "recomposition") {
    return byBodyMass(
      PROTEIN_BODY_MASS_GAIN,
      "1.6-2.2 g/kg body mass (Morton 2018, DOI 10.1136/bjsports-2017-097608), applied to recomposition. EXTRAPOLATION: the content review does not cover recomposition; the muscle-gain row is used because recomposition targets muscle gain at maintenance energy.",
    );
  }
  return byBodyMass(
    PROTEIN_BODY_MASS_MAINTENANCE,
    "1.4-2.0 g/kg body mass (Jäger 2017, DOI 10.1186/s12970-017-0177-8), verbatim: sufficient for most exercising individuals.",
  );
}

export function computeTargets(input: NutritionInput): NutritionTargets {
  if (!Number.isFinite(input.massKg) || input.massKg <= 0) {
    throw new RangeError("computeTargets: massKg must be a finite number > 0");
  }
  if (!Number.isFinite(input.heightCm) || input.heightCm <= 0) {
    throw new RangeError("computeTargets: heightCm must be a finite number > 0");
  }
  if (!Number.isFinite(input.ageYears) || input.ageYears <= 0) {
    throw new RangeError("computeTargets: ageYears must be a finite number > 0");
  }

  const ffmKg = input.bodyFatPct === null ? null : fatFreeMassKg(input.massKg, input.bodyFatPct);
  const rmrKcal = ffmKg === null ? mifflinStJeorKcal(input) : cunninghamKcal(ffmKg); // kcal/day
  const activityFactor = ACTIVITY_FACTOR[input.activity]; // PAL
  const tdeeKcal = rmrKcal * activityFactor; // kcal/day, unrounded through the chain
  const energy = energyPlan(input.goal, tdeeKcal, input.massKg);
  const protein = proteinPlan(input.goal, input.massKg, ffmKg);

  // NOTE-FREQ: sessionsPerWeek is collected because the content review §3 lists training
  // frequency among the setup inputs, but the report supplies NO frequency coefficient for
  // energy. It is therefore recorded in the basis string and changes no number.
  const deficitRule = `${energy.deficitRule} Training frequency ${input.sessionsPerWeek} session(s)/week is recorded but does not alter the energy target: the content review supplies no frequency coefficient.`;

  return {
    rmrKcal: Math.round(rmrKcal),
    tdeeKcal: Math.round(tdeeKcal),
    targetKcal: Math.round(energy.targetKcal),
    proteinG: { lo: protein.lo, hi: protein.hi },
    fluidML: dailyBeverageTargetML(input.sex),
    creatineG: input.creatine ? creatineDoseG(input.massKg) : null,
    expectedRateKgPerWeek: energy.rateKgPerWeek,
    basis: {
      rmr: ffmKg === null ? "mifflin-st-jeor" : "cunningham",
      activityFactor,
      proteinRule: protein.rule,
      deficitRule,
      rateRule: energy.rateRule,
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/nutrition.test.ts`
Expected: PASS — 25 tests passed.

- [ ] **Step 5: Lint and type-check**

Run: `npx tsc --noEmit && npx eslint src/domain/nutrition.ts src/domain/nutrition.test.ts`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add src/domain/nutrition.ts src/domain/nutrition.test.ts
git commit -m "feat: nutrition engine with cited RMR, activity, protein, fluid and creatine rules"
```

---

## Task 2: Body fat from a tape measure (`src/domain/bodyfat.ts`)

**Files:**
- Create: `src/domain/bodyfat.ts`
- Create: `src/domain/bodyfat.test.ts`

**Interfaces:**
- Consumes (from P1): `src/domain/types.ts` — `Sex`.
- Produces (used by Task 7):
  - `interface NavyTapeInput { sex: Sex; heightCm: number; neckCm: number; waistCm: number; hipCm: number | null }`
  - `function estimateBodyFatNavy(input: NavyTapeInput): number | null` — percent body fat, or `null` when the input is outside the equation's domain.
  - `function navyBodyDensity(input: NavyTapeInput): number | null` — g/cm³.
  - `const NAVY_SEE_PCT: Record<Sex, number>` — standard error of the estimate in percentage points.
  - `const NAVY_SITE_LABEL: Record<Sex, { waist: string; hip: string | null }>` — the exact measurement sites, because they differ by sex and getting them wrong silently corrupts the result.

**Three traps from the report that this implementation must respect:**
1. The **metric** form returns *density*, which Siri turns into %BF non-linearly; the DoD **imperial** form returns %BF *linearly* and is a first-order linearisation, not a unit conversion. This module implements the **metric** form only and says so in `basis` text shown by the wizard.
2. The abdomen site **differs by sex**: men measure Abdomen II (at the umbilicus); women measure Abdomen I (minimal width, midway xyphoid–umbilicus) **plus hip**.
3. Potter 2022 (`10.3389/fphys.2022.868627`) prints the female equation **omitting the hip term** — a typo in the published Methods. A test guards the hip term explicitly.

- [ ] **Step 1: Write the failing test**

Create `src/domain/bodyfat.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { estimateBodyFatNavy, navyBodyDensity, NAVY_SEE_PCT, type NavyTapeInput } from "./bodyfat";

const man: NavyTapeInput = { sex: "male", heightCm: 180, neckCm: 40, waistCm: 95, hipCm: null };
const woman: NavyTapeInput = { sex: "female", heightCm: 165, neckCm: 32, waistCm: 75, hipCm: 95 };

describe("US Navy circumference method, metric form", () => {
  it("computes the male density and %BF longhand", () => {
    // D = -0.19077*log10(95 - 40) + 0.15456*log10(180) + 1.0324
    //   = -0.19077*1.7403626895 + 0.15456*2.2552725051 + 1.0324
    //   = -0.3320089903 + 0.3485749184 + 1.0324 = 1.0489659281 g/cm3
    // %BF = 100*(4.95/1.0489659281 - 4.50) = 21.8933063 %
    expect(navyBodyDensity(man)).toBeCloseTo(1.0489659281, 9);
    expect(estimateBodyFatNavy(man)).toBeCloseTo(21.8933063, 6);
  });

  it("computes the female density and %BF longhand, hip term included", () => {
    // D = -0.35004*log10(75 + 95 - 32) + 0.22100*log10(165) + 1.29579
    //   = -0.35004*log10(138) + 0.22100*log10(165) + 1.29579 = 1.0368106821 g/cm3
    // %BF = 100*(4.95/1.0368106821 - 4.50) = 27.4256394 %
    expect(navyBodyDensity(woman)).toBeCloseTo(1.0368106821, 9);
    expect(estimateBodyFatNavy(woman)).toBeCloseTo(27.4256394, 6);
  });

  it("keeps the hip term (guards the Potter 2022 published typo)", () => {
    const wider = estimateBodyFatNavy({ ...woman, hipCm: 100 });
    expect(wider).toBeCloseTo(29.9301338, 6);
    expect(wider).not.toBeCloseTo(27.4256394, 3);
  });

  it("is monotone increasing in waist girth for both sexes", () => {
    const a = estimateBodyFatNavy(man) ?? 0;
    const b = estimateBodyFatNavy({ ...man, waistCm: 105 }) ?? 0;
    expect(b).toBeGreaterThan(a);
    const c = estimateBodyFatNavy(woman) ?? 0;
    const d = estimateBodyFatNavy({ ...woman, waistCm: 85 }) ?? 0;
    expect(d).toBeGreaterThan(c);
  });

  it("carries the report's standard error of the estimate", () => {
    expect(NAVY_SEE_PCT.male).toBe(3.52);
    expect(NAVY_SEE_PCT.female).toBe(3.72);
  });
});

describe("validation returns null rather than a wrong number", () => {
  it("rejects non-positive or non-finite measurements", () => {
    expect(estimateBodyFatNavy({ ...man, neckCm: 0 })).toBeNull();
    expect(estimateBodyFatNavy({ ...man, heightCm: Number.NaN })).toBeNull();
    expect(estimateBodyFatNavy({ ...man, waistCm: -1 })).toBeNull();
  });

  it("rejects a female measurement with no hip girth", () => {
    expect(estimateBodyFatNavy({ ...woman, hipCm: null })).toBeNull();
  });

  it("rejects a logarithm argument that is not positive", () => {
    // waist <= neck for a man leaves log10(0) or log10(negative)
    expect(estimateBodyFatNavy({ ...man, waistCm: 40 })).toBeNull();
    expect(estimateBodyFatNavy({ ...man, waistCm: 35 })).toBeNull();
  });

  it("rejects a result outside the physically possible range", () => {
    // A girth combination that drives Siri outside (0, 100) must not be reported.
    expect(estimateBodyFatNavy({ ...man, waistCm: 40.5, neckCm: 40 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/bodyfat.test.ts`
Expected: FAIL — `Failed to resolve import "./bodyfat"`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/bodyfat.ts`:

```ts
import type { Sex } from "./types";

/**
 * US Navy circumference (tape) method — METRIC form.
 *
 * Hodgdon JA, Beckett MB (1984), Prediction of Percent Body Fat for U.S. Navy Men from Body
 * Circumferences and Height, NHRC Report 84-11, DOI 10.21236/ada143890 (verified);
 * ... for U.S. Navy Women ..., NHRC Report 84-29, DOI 10.21236/ada146456 (verified).
 *
 * The equations predict body DENSITY (g/cm3), not %BF; Siri's equation, printed verbatim in
 * both reports, converts it. Girths and stature in cm; logarithms base 10.
 *
 *   Men:   D = -0.19077*log10(abdomen II - neck) + 0.15456*log10(height) + 1.0324
 *   Women: D = -0.35004*log10(abdomen I + hip - neck) + 0.22100*log10(height) + 1.29579
 *   %BF   = 100 * ((4.95 / D) - 4.50)
 *
 * The metric form is implemented and the imperial DoD form is NOT: the two are not
 * algebraically equivalent (the imperial coefficients are a first-order linearisation that
 * returns %BF directly), and mixing them would introduce a silent ~0.3-0.7 %BF disagreement.
 *
 * Accuracy, from the same reports: men n=602, R=0.90, SEE 3.52 %BF; women n=214, R=0.85,
 * SEE 3.72 %BF. Potter 2022 (DOI 10.3389/fphys.2022.868627) measured the bias against DXA:
 * underestimates men by ~2.5 %BF, overestimates women by 1.3-2.3 %BF, and concludes verbatim
 * that the method "is not suitable for applications requiring quantitative body composition
 * assessment". Merrill 2020 (DOI 10.1002/osp4.392) found 17.3 % relative RMSE in general
 * working adults. USE IT TO TRACK CHANGE OVER TIME, NEVER AS AN ABSOLUTE NUMBER — the UI
 * must show the SEE beside the figure.
 */

export interface NavyTapeInput {
  sex: Sex;
  heightCm: number; // cm, > 0
  neckCm: number; // cm, > 0, measured below the larynx
  waistCm: number; // cm, > 0; men: Abdomen II (umbilicus); women: Abdomen I (minimal width)
  hipCm: number | null; // cm, > 0; women only — required for the female equation
}

/** Standard error of the estimate, percentage points of body fat (NHRC 84-11 / 84-29). */
export const NAVY_SEE_PCT: Record<Sex, number> = { male: 3.52, female: 3.72 };

/**
 * The abdomen site differs by sex — this is not a naming variation. Measuring a woman at the
 * umbilicus, or a man at minimal width, silently biases the result.
 */
export const NAVY_SITE_LABEL: Record<Sex, { waist: string; hip: string | null }> = {
  male: { waist: "Abdomen II — horizontal, at the umbilicus", hip: null },
  female: {
    waist: "Abdomen I — horizontal, at minimal width, midway between xyphoid and umbilicus",
    hip: "Hip — horizontal, at the greatest posterior protrusion of the buttocks",
  },
};

// Male density coefficients (NHRC 84-11).
const M_LOG_GIRTH = -0.19077; // per log10(cm)
const M_LOG_HEIGHT = 0.15456; // per log10(cm)
const M_INTERCEPT = 1.0324; // g/cm3

// Female density coefficients (NHRC 84-29). The hip term is part of the girth sum.
const F_LOG_GIRTH = -0.35004; // per log10(cm)
const F_LOG_HEIGHT = 0.221; // per log10(cm)
const F_INTERCEPT = 1.29579; // g/cm3

// Siri (printed verbatim in both NHRC reports): %BF = 100 * ((4.95 / D) - 4.50).
const SIRI_NUMERATOR = 4.95;
const SIRI_OFFSET = 4.5;

function positive(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v) && v > 0);
}

/** Body density in g/cm3, or null when the input is outside the equation's domain. */
export function navyBodyDensity(input: NavyTapeInput): number | null {
  if (!positive(input.heightCm, input.neckCm, input.waistCm)) return null;

  let girthSum: number; // cm
  let logGirthCoeff: number;
  let logHeightCoeff: number;
  let intercept: number;

  if (input.sex === "male") {
    girthSum = input.waistCm - input.neckCm;
    logGirthCoeff = M_LOG_GIRTH;
    logHeightCoeff = M_LOG_HEIGHT;
    intercept = M_INTERCEPT;
  } else {
    if (input.hipCm === null || !positive(input.hipCm)) return null;
    girthSum = input.waistCm + input.hipCm - input.neckCm;
    logGirthCoeff = F_LOG_GIRTH;
    logHeightCoeff = F_LOG_HEIGHT;
    intercept = F_INTERCEPT;
  }

  if (!(girthSum > 0)) return null; // log10 is undefined at or below zero

  const density =
    logGirthCoeff * Math.log10(girthSum) + logHeightCoeff * Math.log10(input.heightCm) + intercept;
  return Number.isFinite(density) && density > 0 ? density : null;
}

/** Percent body fat, or null when the input is outside the equation's domain. */
export function estimateBodyFatNavy(input: NavyTapeInput): number | null {
  const density = navyBodyDensity(input);
  if (density === null) return null;
  const pct = 100 * (SIRI_NUMERATOR / density - SIRI_OFFSET);
  // Physical bound, not a tuned range: a body-fat percentage outside (0, 100) is impossible,
  // so the estimate is withheld rather than reported.
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return null;
  return pct;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/bodyfat.test.ts`
Expected: PASS — 9 tests passed.

- [ ] **Step 5: Lint and type-check**

Run: `npx tsc --noEmit && npx eslint src/domain/bodyfat.ts src/domain/bodyfat.test.ts`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add src/domain/bodyfat.ts src/domain/bodyfat.test.ts
git commit -m "feat: US Navy tape body-fat estimate (metric form) with domain validation"
```

---

## Task 3: Exercise library (`src/domain/plan/library.ts`)

**Files:**
- Create: `src/domain/plan/library.ts`
- Create: `src/domain/plan/library.test.ts`

**Interfaces:**
- Consumes (from P1): `src/domain/types.ts` — `Exercise`, `Equipment`, `LoadClass`, `Modality`.
- Produces (used by Tasks 4, 5, 7, 8 and by P4's `src/content/formCues.ts`):
  - `const EXERCISES: readonly Exercise[]`
  - `const EXERCISE_BY_ID: Readonly<Record<string, Exercise>>`
  - `const FORM_CUE_IDS: readonly string[]` — **P4 imports this**; `Object.keys(FORM_CUES)` must equal it as a set.
  - `const MUSCLE_GROUPS: readonly string[]` — the closed vocabulary for `muscleGroups` and `secondaryMuscles`.
  - `const INDIRECT_SET_FRACTION = 0.5`

**Type change this task requires (see "Master plan amendments requested"):** `Exercise` gains `secondaryMuscles: string[]`. The report's counting rule (`direct 1.0, indirect 0.5`, Pelland 2025 `10.1007/s40279-025-02344-w`) cannot be implemented with a single undifferentiated `muscleGroups` array. `muscleGroups` keeps its meaning as the **direct** movers; `secondaryMuscles` holds the **indirect** ones. Edit `src/domain/types.ts` and the matching Zod object in `src/domain/schema.ts` in Step 1 of this task.

**Provenance rules for this port:**
- Names, `videoQuery` strings and operational notes come from `data.js`; cue keys come from `console-content.js`. Nothing is invented: where the legacy file has no video string for a newly split exercise, `videoQuery` is `null` and P4 hides the video control.
- Three legacy entries are **split into two exercises each**, which also fixes the content review §6 "Form-cue key mismatch (silent failure)": `"Pull-ups (or lat pulldown)"` → `pull-up` + `lat-pulldown`; `"Leg press → Bulgarian split"` → `leg-press` + `bulgarian-split-squat`; `"Trap bar DL → conventional"` → `trap-bar-deadlift` + `conventional-deadlift`. P4 splits the corresponding cue objects, whose text is already written in `[Leg press] / [Bulgarian]` bracketed halves.
- **`"Barbell row (heavier)"` is excluded.** Content review §6 marks its cue **WRONG (unsafe)**: it permits "a slight cheat / TnT" and "5-6 reps, slightly cheaty TnT is fine here" on a loaded hip-hinge, contradicting the same file's own "Rounding lower back → injury". It may return in P4 **only** if the cue is rewritten to the strict standard; `barbell-row-pendlay` covers the movement pattern in the meantime.
- `"No training"` is not an exercise and is dropped. All personal lines are dropped: `"Start at 65 kg"`, `"60% of previous max"`, `"Mandatory — every Pull day, forever"`, `"Daily push-up sets only"`, `"Conventional from wk 9"`.

- [ ] **Step 1: Add `secondaryMuscles` to the shared type and schema**

Edit `src/domain/types.ts`, replacing the `Exercise` interface:

```ts
export interface Exercise { id: string; name: string; isBodyweight: boolean; isCompoundPrimary: boolean; modality: Modality; loadClass: LoadClass; muscleGroups: string[]; secondaryMuscles: string[]; equipment: Equipment[]; videoQuery: string | null; formCueId: string | null; note: string | null; }
// muscleGroups = DIRECT movers, counted 1.0 set each; secondaryMuscles = INDIRECT movers,
// counted 0.5 (content review §6, Pelland 2025, DOI 10.1007/s40279-025-02344-w).
```

Edit `src/domain/schema.ts`, adding the field to the exercise object schema next to `muscleGroups`:

```ts
  secondaryMuscles: z.array(z.string()),
```

- [ ] **Step 2: Write the failing test**

Create `src/domain/plan/library.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  EXERCISES,
  EXERCISE_BY_ID,
  FORM_CUE_IDS,
  INDIRECT_SET_FRACTION,
  MUSCLE_GROUPS,
} from "./library";

describe("exercise library integrity", () => {
  it("has unique, kebab-case ids", () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("indexes every exercise by id", () => {
    expect(Object.keys(EXERCISE_BY_ID).length).toBe(EXERCISES.length);
    for (const e of EXERCISES) expect(EXERCISE_BY_ID[e.id]).toBe(e);
  });

  it("uses only the closed muscle vocabulary, and never lists a muscle twice", () => {
    for (const e of EXERCISES) {
      for (const m of [...e.muscleGroups, ...e.secondaryMuscles]) {
        expect(MUSCLE_GROUPS).toContain(m);
      }
      const overlap = e.muscleGroups.filter((m) => e.secondaryMuscles.includes(m));
      expect(overlap).toEqual([]);
    }
  });

  it("gives every muscle group at least one direct exercise", () => {
    for (const m of MUSCLE_GROUPS) {
      expect(EXERCISES.some((e) => e.muscleGroups.includes(m))).toBe(true);
    }
  });

  it("lists at least one equipment setting for every exercise", () => {
    for (const e of EXERCISES) expect(e.equipment.length).toBeGreaterThan(0);
  });

  it("keeps bodyweight exercises loadless and everything else loadable", () => {
    for (const e of EXERCISES) {
      if (e.isBodyweight) expect(e.modality).toBe("bodyweight");
    }
  });

  it("counts an indirect set as half a direct set", () => {
    expect(INDIRECT_SET_FRACTION).toBe(0.5);
  });
});

describe("form-cue contract with P4", () => {
  it("exports exactly the ids that src/content/formCues.ts must key on", () => {
    const withCues = EXERCISES.filter((e) => e.formCueId !== null).map((e) => e.formCueId);
    expect([...FORM_CUE_IDS].sort()).toEqual([...withCues].sort());
  });

  it("uses the exercise id as its own cue id, so a lookup can never silently miss", () => {
    for (const e of EXERCISES) {
      if (e.formCueId !== null) expect(e.formCueId).toBe(e.id);
    }
  });
});

describe("content review exclusions and scrubbing", () => {
  it("excludes the heavy barbell row whose cue was flagged unsafe", () => {
    // Content review §6: "you can use a slight cheat / TnT" on a loaded hip-hinge — WRONG (unsafe).
    expect(EXERCISES.some((e) => e.id === "barbell-row-heavy")).toBe(false);
    expect(EXERCISE_BY_ID["barbell-row-pendlay"]).toBeDefined();
  });

  it("splits the three legacy compound entries so no cue lookup can fail", () => {
    for (const id of [
      "pull-up",
      "lat-pulldown",
      "leg-press",
      "bulgarian-split-squat",
      "trap-bar-deadlift",
      "conventional-deadlift",
    ]) {
      expect(EXERCISE_BY_ID[id]).toBeDefined();
    }
  });

  it("carries no personal, medication or location text", () => {
    const blob = JSON.stringify(EXERCISES).toLowerCase();
    for (const needle of [
      "vyvanse",
      "lisdexamfetamine",
      "ymca",
      "thesis",
      "65 kg",
      "previous max",
      "forever",
      "wk 9",
      "wk 5",
    ]) {
      expect(blob).not.toContain(needle);
    }
  });

  it("keeps the ported video search strings and nulls the ones the legacy file never had", () => {
    expect(EXERCISE_BY_ID["barbell-bench-press"]?.videoQuery).toBe(
      "bench press perfect form jeff nippard",
    );
    expect(EXERCISE_BY_ID["face-pull"]?.videoQuery).toBe("face pulls athlean rear delt form");
    expect(EXERCISE_BY_ID["lat-pulldown"]?.videoQuery).toBeNull();
    expect(EXERCISE_BY_ID["leg-press"]?.videoQuery).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/domain/plan/library.test.ts`
Expected: FAIL — `Failed to resolve import "./library"`.

- [ ] **Step 4: Write the implementation**

Create `src/domain/plan/library.ts`:

```ts
import type { Exercise } from "../types";

/**
 * Exercise library, ported from the legacy `data.js` day tables and `console-content.js`
 * FORM_CUES keys. Generic only: no personal literals, no medication, no location.
 *
 * muscleGroups  = DIRECT movers, counted as 1.0 set each.
 * secondaryMuscles = INDIRECT movers, counted as 0.5 set each.
 * Counting rule: content review §6, Pelland 2025, Sports Med 56(2):481-505,
 * DOI 10.1007/s40279-025-02344-w — "a direct set counts 1.0, an indirect set 0.5".
 *
 * The report does NOT define which muscles are direct for a given lift. The convention used
 * here is stated explicitly so it can be audited: a muscle is SECONDARY only when it acts as
 * a dynamic assisting mover through the working range. Isometric stabilisers (erector spinae
 * in a squat or deadlift, abdominals in a standing press, forearm flexors in a row) are NOT
 * counted at all. HEURISTIC — the assignment is an engineering judgement inside a cited
 * counting rule, not a published table.
 */
export const INDIRECT_SET_FRACTION = 0.5;

/** Closed vocabulary. The first twelve are the groups the content review §2.1 counted. */
export const MUSCLE_GROUPS = [
  "chest",
  "front-delt",
  "side-delt",
  "rear-delt",
  "triceps",
  "biceps",
  "lats",
  "mid-back",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
] as const;

export const EXERCISES: readonly Exercise[] = [
  // ---- horizontal and vertical pressing ----
  {
    id: "barbell-bench-press",
    name: "Barbell bench press",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "barbell",
    loadClass: "upper-compound",
    muscleGroups: ["chest"],
    secondaryMuscles: ["front-delt", "triceps"],
    equipment: ["full-gym"],
    videoQuery: "bench press perfect form jeff nippard",
    formCueId: "barbell-bench-press",
    note: null, // legacy "Start at 65 kg" dropped: an individual literal (content review §2.1)
  },
  {
    id: "close-grip-bench-press",
    name: "Close-grip bench press",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "barbell",
    loadClass: "upper-compound",
    muscleGroups: ["triceps", "chest"],
    secondaryMuscles: ["front-delt"],
    equipment: ["full-gym"],
    videoQuery: "close grip bench press tricep form",
    formCueId: "close-grip-bench-press",
    note: null,
  },
  {
    id: "overhead-press-barbell",
    name: "Overhead press (barbell)",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "barbell",
    loadClass: "upper-compound",
    muscleGroups: ["front-delt"],
    secondaryMuscles: ["side-delt", "triceps"],
    equipment: ["full-gym"],
    videoQuery: "overhead press standing barbell form athlean",
    formCueId: "overhead-press-barbell",
    note: null,
  },
  {
    id: "push-press",
    name: "Push press",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "barbell",
    loadClass: "upper-compound",
    muscleGroups: ["front-delt"],
    secondaryMuscles: ["side-delt", "triceps"],
    equipment: ["full-gym"],
    videoQuery: "push press form technique jeff nippard",
    formCueId: "push-press",
    note: null,
  },
  {
    id: "incline-dumbbell-press",
    name: "Incline dumbbell press",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "dumbbell",
    loadClass: "upper-compound",
    muscleGroups: ["chest"],
    secondaryMuscles: ["front-delt", "triceps"],
    equipment: ["full-gym", "dumbbells-only"],
    videoQuery: "incline dumbbell press form jeff nippard",
    formCueId: "incline-dumbbell-press",
    note: null,
  },
  {
    id: "push-up",
    name: "Push-up",
    isBodyweight: true,
    isCompoundPrimary: true,
    modality: "bodyweight",
    loadClass: "upper-compound",
    muscleGroups: ["chest"],
    secondaryMuscles: ["front-delt", "triceps"],
    equipment: ["full-gym", "dumbbells-only", "bodyweight"],
    videoQuery: "perfect pushup form athlean",
    formCueId: "push-up",
    note: null,
  },
  // ---- shoulder and arm isolation ----
  {
    id: "lateral-raise",
    name: "Lateral raise",
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: "dumbbell",
    loadClass: "isolation",
    muscleGroups: ["side-delt"],
    secondaryMuscles: [],
    equipment: ["full-gym", "dumbbells-only"],
    videoQuery: "lateral raises perfect form jeff nippard",
    formCueId: "lateral-raise",
    note: null,
  },
  {
    id: "triceps-overhead-extension",
    name: "Overhead triceps extension",
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: "dumbbell",
    loadClass: "isolation",
    muscleGroups: ["triceps"],
    secondaryMuscles: [],
    equipment: ["full-gym", "dumbbells-only"],
    videoQuery: "overhead tricep extension long head form",
    formCueId: "triceps-overhead-extension",
    // One dumbbell held in both hands, or a cable rope. Load steps follow the dumbbell-pair
    // setting, which over-estimates the step for a single bell; the effect is a larger
    // suggested increment, which P4's guard converts into "extend reps" — the safe direction.
    note: "One dumbbell held in both hands, or a cable rope.",
  },
  {
    id: "barbell-curl",
    name: "Barbell curl",
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: "barbell",
    loadClass: "isolation",
    muscleGroups: ["biceps"],
    secondaryMuscles: [],
    equipment: ["full-gym"],
    videoQuery: "barbell bicep curl form jeff nippard",
    formCueId: "barbell-curl",
    note: null,
  },
  {
    id: "hammer-curl",
    name: "Hammer curl",
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: "dumbbell",
    loadClass: "isolation",
    muscleGroups: ["biceps"],
    secondaryMuscles: [],
    equipment: ["full-gym", "dumbbells-only"],
    videoQuery: "hammer curl brachialis form",
    formCueId: "hammer-curl",
    note: null,
  },
  // ---- pulling ----
  {
    id: "pull-up",
    name: "Pull-up",
    isBodyweight: true,
    isCompoundPrimary: true,
    modality: "bodyweight",
    loadClass: "upper-compound",
    muscleGroups: ["lats"],
    secondaryMuscles: ["biceps", "mid-back"],
    equipment: ["full-gym", "bodyweight"],
    videoQuery: "perfect pullup form jeff nippard",
    formCueId: "pull-up",
    note: null,
  },
  {
    id: "lat-pulldown",
    name: "Lat pulldown",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "machine",
    loadClass: "upper-compound",
    muscleGroups: ["lats"],
    secondaryMuscles: ["biceps", "mid-back"],
    equipment: ["full-gym"],
    videoQuery: null, // the legacy entry carried only the pull-up search string
    formCueId: "lat-pulldown",
    note: null,
  },
  {
    id: "weighted-pull-up",
    name: "Weighted pull-up",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "bodyweight",
    loadClass: "upper-compound",
    muscleGroups: ["lats"],
    secondaryMuscles: ["biceps", "mid-back"],
    equipment: ["full-gym", "bodyweight"],
    videoQuery: "weighted pullup form progression",
    formCueId: "weighted-pull-up",
    // External load hangs from a belt or between the feet, so there is no plate step to
    // quantise against: P1's stepFor() returns 0 for modality "bodyweight". P4 must treat a
    // zero step as "no quantisation" rather than dividing by it.
    note: "External load added by belt or dumbbell.",
  },
  {
    id: "barbell-row-pendlay",
    name: "Barbell row (Pendlay)",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "barbell",
    loadClass: "upper-compound",
    muscleGroups: ["mid-back", "lats"],
    secondaryMuscles: ["biceps", "rear-delt"],
    equipment: ["full-gym"],
    videoQuery: "pendlay row form technique",
    formCueId: "barbell-row-pendlay",
    note: null,
  },
  {
    id: "dumbbell-row-single-arm",
    name: "Single-arm dumbbell row",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "dumbbell",
    loadClass: "upper-compound",
    muscleGroups: ["mid-back", "lats"],
    secondaryMuscles: ["biceps"],
    equipment: ["full-gym", "dumbbells-only"],
    videoQuery: "single arm dumbbell row form meadows",
    formCueId: "dumbbell-row-single-arm",
    note: null,
  },
  {
    id: "face-pull",
    name: "Face pull",
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: "cable",
    loadClass: "isolation",
    muscleGroups: ["rear-delt"],
    secondaryMuscles: ["mid-back"],
    equipment: ["full-gym"],
    videoQuery: "face pulls athlean rear delt form",
    formCueId: "face-pull",
    note: null, // legacy "Mandatory — every Pull day, forever" dropped: a personal rule
  },
  // ---- lower body ----
  {
    id: "barbell-back-squat",
    name: "Barbell back squat",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "barbell",
    loadClass: "lower-compound",
    muscleGroups: ["quads"],
    secondaryMuscles: ["glutes", "hamstrings"],
    equipment: ["full-gym"],
    videoQuery: "back squat form squat university",
    formCueId: "barbell-back-squat",
    note: null, // legacy "60% of previous max" dropped: undefined for a new user
  },
  {
    id: "leg-press",
    name: "Leg press",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "machine",
    loadClass: "lower-compound",
    muscleGroups: ["quads"],
    secondaryMuscles: ["glutes", "hamstrings"],
    equipment: ["full-gym"],
    videoQuery: null, // the legacy combined entry carried only the Bulgarian search string
    formCueId: "leg-press",
    note: null,
  },
  {
    id: "bulgarian-split-squat",
    name: "Bulgarian split squat",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "dumbbell",
    loadClass: "lower-compound",
    muscleGroups: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["full-gym", "dumbbells-only", "bodyweight"],
    videoQuery: "bulgarian split squat form jeff nippard",
    formCueId: "bulgarian-split-squat",
    note: "Rear foot elevated. Unloaded when no dumbbells are available — log the load as 0.",
  },
  {
    id: "romanian-deadlift",
    name: "Romanian deadlift",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "barbell",
    loadClass: "lower-compound",
    muscleGroups: ["hamstrings"],
    secondaryMuscles: ["glutes"],
    equipment: ["full-gym"],
    videoQuery: "romanian deadlift form jeff nippard",
    formCueId: "romanian-deadlift",
    note: null,
  },
  {
    id: "trap-bar-deadlift",
    name: "Trap-bar deadlift",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "barbell",
    loadClass: "lower-compound",
    muscleGroups: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["full-gym"],
    videoQuery: "trap bar deadlift vs conventional biomechanics",
    formCueId: "trap-bar-deadlift",
    note: null,
  },
  {
    id: "conventional-deadlift",
    name: "Conventional deadlift",
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: "barbell",
    loadClass: "lower-compound",
    muscleGroups: ["hamstrings", "glutes"],
    secondaryMuscles: ["quads"],
    equipment: ["full-gym"],
    videoQuery: "trap bar deadlift vs conventional biomechanics",
    formCueId: "conventional-deadlift",
    note: null,
  },
  {
    id: "leg-curl-machine",
    name: "Leg curl (machine)",
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: "machine",
    loadClass: "isolation",
    muscleGroups: ["hamstrings"],
    secondaryMuscles: [],
    equipment: ["full-gym"],
    videoQuery: "lying leg curl form hamstring",
    formCueId: "leg-curl-machine",
    note: null,
  },
  {
    id: "calf-raise",
    name: "Calf raise",
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: "machine",
    loadClass: "isolation",
    muscleGroups: ["calves"],
    secondaryMuscles: [],
    equipment: ["full-gym", "dumbbells-only", "bodyweight"],
    videoQuery: "calf raise form jeff nippard",
    formCueId: "calf-raise",
    note: "Machine, dumbbells in hand, or bodyweight on a step.",
  },
  // ---- trunk ----
  {
    id: "plank",
    name: "Plank",
    isBodyweight: true,
    isCompoundPrimary: false,
    modality: "bodyweight",
    loadClass: "isolation",
    muscleGroups: ["abs"],
    secondaryMuscles: [],
    equipment: ["full-gym", "dumbbells-only", "bodyweight"],
    videoQuery: "plank perfect form athlean",
    formCueId: "plank",
    note: null,
  },
  {
    id: "ab-wheel-rollout",
    name: "Ab wheel rollout",
    isBodyweight: true,
    isCompoundPrimary: false,
    modality: "bodyweight",
    loadClass: "isolation",
    muscleGroups: ["abs"],
    secondaryMuscles: [],
    equipment: ["full-gym"],
    videoQuery: "ab wheel rollout form athlean",
    formCueId: "ab-wheel-rollout",
    note: null,
  },
  {
    id: "hanging-knee-raise",
    name: "Hanging knee raise",
    isBodyweight: true,
    isCompoundPrimary: false,
    modality: "bodyweight",
    loadClass: "isolation",
    muscleGroups: ["abs"],
    secondaryMuscles: [],
    equipment: ["full-gym", "bodyweight"],
    videoQuery: "hanging knee raise form abs",
    formCueId: "hanging-knee-raise",
    note: null,
  },
  // ---- conditioning ----
  {
    id: "rower-intervals",
    name: "Rower intervals",
    isBodyweight: true,
    isCompoundPrimary: false,
    modality: "bodyweight", // ergometer resistance is not a plate step; stepFor() returns 0
    loadClass: "isolation", // loadClass drives rest and progression, neither of which applies
    muscleGroups: [],
    secondaryMuscles: [],
    equipment: ["full-gym"],
    videoQuery: "rowing machine perfect form technique drive",
    formCueId: "rower-intervals",
    note: "1 min hard / 2 min easy.",
  },
  {
    id: "stair-climber",
    name: "Stair climber",
    isBodyweight: true,
    isCompoundPrimary: false,
    modality: "bodyweight",
    loadClass: "isolation",
    muscleGroups: [],
    secondaryMuscles: [],
    equipment: ["full-gym"],
    videoQuery: null, // the legacy entry carried no search string
    formCueId: "stair-climber",
    note: "Steady moderate.",
  },
  {
    id: "walk",
    name: "Walk",
    isBodyweight: true,
    isCompoundPrimary: false,
    modality: "bodyweight",
    loadClass: "isolation",
    muscleGroups: [],
    secondaryMuscles: [],
    equipment: ["full-gym", "dumbbells-only", "bodyweight"],
    videoQuery: null,
    formCueId: "walk",
    note: "Optional.",
  },
];

export const EXERCISE_BY_ID: Readonly<Record<string, Exercise>> = Object.freeze(
  Object.fromEntries(EXERCISES.map((e) => [e.id, e])),
);

/**
 * The contract P4's `src/content/formCues.ts` must satisfy: its keys are exactly these ids.
 * Twenty-seven legacy cue objects cover thirty ids, because three of them describe two
 * exercises each in bracketed halves and are split in P4:
 *   "Pull-ups (or lat pulldown)"        -> pull-up, lat-pulldown
 *   "Leg press → Bulgarian split squat" -> leg-press, bulgarian-split-squat
 *   "Trap bar DL → conventional"        -> trap-bar-deadlift, conventional-deadlift
 * P4 must also apply the content review §6 corrections before shipping the cue text:
 * delete the weighted-pull-up "5-7 bodyweight pull-ups" equivalence (UNSUPPORTED); delete
 * "knee push-ups ... don't transfer well" (contradicted by Ebben 2011); replace the leg-press
 * "STOP at 90°" cap with the lumbar-flexion limit; delete "Locking knees fully at the top →
 * joint stress" (UNSUPPORTED); soften "Knees caving inward → ACL strain"; mark the push-press
 * "~20% more weight", the stair-climber "~30% fewer calories" and the rower "legs do 60%"
 * as COULD NOT VERIFY or drop the numbers; gate the squat Valsalva cue behind a
 * contraindication note.
 */
export const FORM_CUE_IDS: readonly string[] = EXERCISES.flatMap((e) =>
  e.formCueId === null ? [] : [e.formCueId],
);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/domain/plan/library.test.ts`
Expected: PASS — 13 tests passed.

- [ ] **Step 6: Run the whole suite so the type change to `Exercise` is checked everywhere**

Run: `npx tsc --noEmit && npm test`
Expected: type-check clean; every existing P1 test still passes (the P1 schema round-trip test exercises the new `secondaryMuscles` field).

- [ ] **Step 7: Commit**

```bash
git add src/domain/types.ts src/domain/schema.ts src/domain/plan/library.ts src/domain/plan/library.test.ts
git commit -m "feat: exercise library ported from legacy data with direct/indirect muscle split"
```

---

## Task 4: Split templates (`src/domain/plan/templates.ts`)

**Files:**
- Create: `src/domain/plan/templates.ts`
- Create: `src/domain/plan/templates.test.ts`

**Interfaces:**
- Consumes: `src/domain/types.ts` (`Equipment`, `Exercise`, `Experience`, `Prescription`, `Seconds`), `./library` (`EXERCISE_BY_ID`).
- Produces (used by Task 5, and by P4 for `defaultRestS`):
  - `type SessionsPerWeek = 2 | 3 | 4 | 5 | 6`
  - `type SlotClass = "compound" | "isolation"`; `type SlotIntensity = "heavy" | "moderate" | "light"`
  - `interface ExerciseSlot { role: string; slotClass: SlotClass; intensity: SlotIntensity; candidates: string[] }`
  - `interface SessionTemplate { label: string; slots: ExerciseSlot[] }`
  - `interface SplitTemplate { sessionsPerWeek: SessionsPerWeek; name: string; note: string; sessions: SessionTemplate[]; sets: Record<Experience, Record<SlotClass, { lo: number; hi: number }>>; bandMuscles: readonly string[] }`
  - `const SPLIT_TEMPLATES: Record<SessionsPerWeek, SplitTemplate>`
  - `const WEEKLY_SET_BAND: Record<SessionsPerWeek, readonly [number, number]>`
  - `function prescriptionFor(ex: Exercise, intensity: SlotIntensity): Prescription`
  - `function restSFor(ex: Exercise, prescription: Prescription): Seconds`
  - `function resolveSlot(slot: ExerciseSlot, equipment: Equipment, used: ReadonlySet<string>): Exercise | null`

**Where every number in this file comes from:**
- **Split by day count** — content review D2 §7 table, verbatim: 2 = full body ×2; 3 = full body ×3 (*prefer over PPL*, because PPL at 3 days gives 1×/muscle/week); 4 = upper/lower ×2 (**the engine default**, matching Currier 2023's highest-ranked prescription, `10.1136/bjsports-2023-106807`); 5 = U/L/U/L + accessory; 6 = push/pull/legs ×2.
- **Weekly set bands** — same table: 6–10 / 9–15 / 12–16 / 14–18 / 16–20 fractional sets per muscle per week.
- **Rep ranges and rest** — D2 §9: heavy multi-joint (≥80 % 1RM, ≤6 reps) 180–300 s; moderate compound (6–12 reps) 120–180 s; single-joint isolation and machine 60–90 s. The master plan §6.5 fixes the defaults at 180 / 120 / 90 s. The report states plainly that stratifying by exercise *type* rather than by load is **an engineering heuristic — INSUFFICIENT EVIDENCE for exercise-type stratification per se**; that wording is reproduced in the file.
- **Experience scaling** — the report gives no experience-stratified volume coefficient. Novice sits at the bottom of the verified band and advanced at the top, which is a **within-band placement heuristic**, labelled as such. The set tables below were computed, not guessed: see the gate in Task 5.
- **What the report does *not* supply, and is therefore absent:** any goal-stratified rep range. `PlanInput.goal` changes energy and protein only. Frequency is a scheduling variable, not a growth variable (Schoenfeld 2019, `10.1080/02640414.2018.1555906`).

**Honest statement carried into the UI:** with 13 muscle groups and a band of 12–16 sets each, no achievable session length puts *every* muscle in band — that would be ~180 sets a week. Each template therefore declares `bandMuscles`, the groups it verifiably places inside the band, and the generator reports the rest as **maintenance-only**. This is the content review §2.1 recommendation taken literally: "Raise … to ≥10 sets/wk, **or state that they are maintenance-only**." The 2-day template additionally carries the report's own caveat that it sits below the ACSM ≥10 sets/week hypertrophy floor.

- [ ] **Step 1: Write the failing test**

Create `src/domain/plan/templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXERCISE_BY_ID } from "./library";
import {
  prescriptionFor,
  resolveSlot,
  restSFor,
  SPLIT_TEMPLATES,
  WEEKLY_SET_BAND,
  type SessionsPerWeek,
} from "./templates";
import type { Equipment, Experience } from "../types";

const DAY_COUNTS: SessionsPerWeek[] = [2, 3, 4, 5, 6];
const EXPERIENCES: Experience[] = ["novice", "intermediate", "advanced"];

describe("template integrity", () => {
  it("defines one template per supported day count, with that many sessions", () => {
    for (const d of DAY_COUNTS) {
      const t = SPLIT_TEMPLATES[d];
      expect(t.sessionsPerWeek).toBe(d);
      expect(t.sessions.length).toBe(d);
    }
  });

  it("gives every session a unique label", () => {
    for (const d of DAY_COUNTS) {
      const labels = SPLIT_TEMPLATES[d].sessions.map((s) => s.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("names only exercises that exist in the library", () => {
    for (const d of DAY_COUNTS) {
      for (const session of SPLIT_TEMPLATES[d].sessions) {
        for (const slot of session.slots) {
          expect(slot.candidates.length).toBeGreaterThan(0);
          for (const id of slot.candidates) expect(EXERCISE_BY_ID[id]).toBeDefined();
        }
      }
    }
  });

  it("orders compound slots before isolation slots in every session", () => {
    for (const d of DAY_COUNTS) {
      for (const session of SPLIT_TEMPLATES[d].sessions) {
        const firstIsolation = session.slots.findIndex((s) => s.slotClass === "isolation");
        if (firstIsolation === -1) continue;
        const after = session.slots.slice(firstIsolation);
        expect(after.every((s) => s.slotClass === "isolation")).toBe(true);
      }
    }
  });

  it("marks exactly one heavy slot per session, and it is the first", () => {
    for (const d of DAY_COUNTS) {
      for (const session of SPLIT_TEMPLATES[d].sessions) {
        const heavy = session.slots.filter((s) => s.intensity === "heavy");
        expect(heavy.length).toBe(1);
        expect(session.slots[0]?.intensity).toBe("heavy");
      }
    }
  });

  it("keeps set counts monotone non-decreasing with experience", () => {
    for (const d of DAY_COUNTS) {
      const s = SPLIT_TEMPLATES[d].sets;
      for (const cls of ["compound", "isolation"] as const) {
        const mid = (e: Experience) => (s[e][cls].lo + s[e][cls].hi) / 2;
        expect(mid("intermediate")).toBeGreaterThanOrEqual(mid("novice"));
        expect(mid("advanced")).toBeGreaterThanOrEqual(mid("intermediate"));
        for (const e of EXPERIENCES) expect(s[e][cls].hi).toBeGreaterThanOrEqual(s[e][cls].lo);
      }
    }
  });

  it("declares only muscles the report's band can contain", () => {
    for (const d of DAY_COUNTS) {
      expect(SPLIT_TEMPLATES[d].bandMuscles.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("carries the content review's bands verbatim", () => {
    expect(WEEKLY_SET_BAND[2]).toEqual([6, 10]);
    expect(WEEKLY_SET_BAND[3]).toEqual([9, 15]);
    expect(WEEKLY_SET_BAND[4]).toEqual([12, 16]);
    expect(WEEKLY_SET_BAND[5]).toEqual([14, 18]);
    expect(WEEKLY_SET_BAND[6]).toEqual([16, 20]);
  });

  it("uses full body at three days, not push/pull/legs", () => {
    const labels = SPLIT_TEMPLATES[3].sessions.map((s) => s.label);
    expect(labels.every((l) => l.startsWith("Full body"))).toBe(true);
    expect(SPLIT_TEMPLATES[4].sessions.map((s) => s.label)).toEqual([
      "Upper A",
      "Lower A",
      "Upper B",
      "Lower B",
    ]);
    expect(SPLIT_TEMPLATES[6].sessions.map((s) => s.label)).toEqual([
      "Push A",
      "Pull A",
      "Legs A",
      "Push B",
      "Pull B",
      "Legs B",
    ]);
  });
});

describe("prescriptions", () => {
  it("prescribes 4-6 reps on a heavy compound and 6-8 on a moderate one", () => {
    const squat = EXERCISE_BY_ID["barbell-back-squat"];
    expect(squat).toBeDefined();
    if (!squat) return;
    expect(prescriptionFor(squat, "heavy")).toEqual({ kind: "reps", lo: 4, hi: 6 });
    expect(prescriptionFor(squat, "moderate")).toEqual({ kind: "reps", lo: 6, hi: 8 });
  });

  it("prescribes 8-12 reps on isolation work", () => {
    const curl = EXERCISE_BY_ID["barbell-curl"];
    expect(curl).toBeDefined();
    if (!curl) return;
    expect(prescriptionFor(curl, "light")).toEqual({ kind: "reps", lo: 8, hi: 12 });
  });

  it("overrides with the legacy prescription where the exercise has no external load", () => {
    const pushUp = EXERCISE_BY_ID["push-up"];
    const plank = EXERCISE_BY_ID["plank"];
    const rower = EXERCISE_BY_ID["rower-intervals"];
    expect(pushUp && prescriptionFor(pushUp, "moderate")).toEqual({ kind: "amrap", minimum: null });
    expect(plank && prescriptionFor(plank, "light")).toEqual({ kind: "time", targetS: 60 });
    expect(rower && prescriptionFor(rower, "light")).toEqual({ kind: "duration", targetS: 1200 });
  });
});

describe("rest intervals follow the content review §9 load classes", () => {
  it("gives a heavy compound 180 s, a moderate compound 120 s and isolation 90 s", () => {
    const squat = EXERCISE_BY_ID["barbell-back-squat"];
    const curl = EXERCISE_BY_ID["barbell-curl"];
    expect(squat).toBeDefined();
    expect(curl).toBeDefined();
    if (!squat || !curl) return;
    expect(restSFor(squat, prescriptionFor(squat, "heavy"))).toBe(180);
    expect(restSFor(squat, prescriptionFor(squat, "moderate"))).toBe(120);
    expect(restSFor(curl, prescriptionFor(curl, "light"))).toBe(90);
  });

  it("never returns the rejected 30-60 s hypertrophy default", () => {
    for (const ex of Object.values(EXERCISE_BY_ID)) {
      for (const intensity of ["heavy", "moderate", "light"] as const) {
        expect(restSFor(ex, prescriptionFor(ex, intensity))).toBeGreaterThanOrEqual(90);
      }
    }
  });
});

describe("equipment resolution", () => {
  const slot = SPLIT_TEMPLATES[4].sessions[0]?.slots[0];

  it("picks the first candidate the equipment supports", () => {
    expect(slot).toBeDefined();
    if (!slot) return;
    expect(resolveSlot(slot, "full-gym", new Set())?.id).toBe("barbell-bench-press");
    expect(resolveSlot(slot, "dumbbells-only", new Set())?.id).toBe("incline-dumbbell-press");
    expect(resolveSlot(slot, "bodyweight", new Set())?.id).toBe("push-up");
  });

  it("skips a candidate already used in the same session", () => {
    expect(slot).toBeDefined();
    if (!slot) return;
    expect(resolveSlot(slot, "bodyweight", new Set(["push-up"]))).toBeNull();
    expect(resolveSlot(slot, "full-gym", new Set(["barbell-bench-press"]))?.id).toBe(
      "incline-dumbbell-press",
    );
  });

  it("returns null when no candidate fits the equipment", () => {
    const machineSlot = { role: "test", slotClass: "isolation" as const, intensity: "light" as const, candidates: ["leg-curl-machine"] };
    expect(resolveSlot(machineSlot, "bodyweight", new Set())).toBeNull();
  });

  it("leaves at least one usable slot per session for every equipment setting", () => {
    const settings: Equipment[] = ["full-gym", "dumbbells-only", "bodyweight"];
    for (const d of DAY_COUNTS) {
      for (const session of SPLIT_TEMPLATES[d].sessions) {
        for (const equipment of settings) {
          const used = new Set<string>();
          let filled = 0;
          for (const s of session.slots) {
            const ex = resolveSlot(s, equipment, used);
            if (ex) {
              used.add(ex.id);
              filled += 1;
            }
          }
          expect(filled).toBeGreaterThan(0);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/plan/templates.test.ts`
Expected: FAIL — `Failed to resolve import "./templates"`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/plan/templates.ts`:

```ts
import type { Equipment, Exercise, Experience, Prescription, Seconds } from "../types";
import { EXERCISE_BY_ID } from "./library";

/**
 * Split templates for 2-6 training days.
 *
 * Source for the split choice and the weekly set band: content review Deliverable 2 §7.
 * Source for the counting rule behind the band: §6 (Pelland 2025, DOI 10.1007/s40279-025-02344-w).
 * Source for the >=10 sets/week floor and the ~18-20 deceleration point: Currier 2026 ACSM
 * Position Stand, DOI 10.1249/mss.0000000000003897.
 * Frequency is a scheduling variable, not a growth variable: Schoenfeld 2019,
 * DOI 10.1080/02640414.2018.1555906 — "strong evidence that resistance training frequency does
 * not significantly or meaningfully impact muscle hypertrophy when volume is equated".
 * No coefficient here is sex-specific: Roberts 2020, DOI 10.1519/JSC.0000000000003521.
 */

export type SessionsPerWeek = 2 | 3 | 4 | 5 | 6;
export type SlotClass = "compound" | "isolation";
export type SlotIntensity = "heavy" | "moderate" | "light";

export interface ExerciseSlot {
  role: string; // movement pattern, for readability and debugging only
  slotClass: SlotClass;
  intensity: SlotIntensity;
  candidates: string[]; // exercise ids, best first; the generator takes the first that fits
}

export interface SessionTemplate {
  label: string;
  slots: ExerciseSlot[];
}

export interface SplitTemplate {
  sessionsPerWeek: SessionsPerWeek;
  name: string;
  note: string; // shown on the wizard review screen; states the split's honest limits
  sessions: SessionTemplate[];
  sets: Record<Experience, Record<SlotClass, { lo: number; hi: number }>>; // sets per exercise
  bandMuscles: readonly string[]; // muscles this template places inside WEEKLY_SET_BAND
}

/**
 * Fractional sets per muscle per week, by training days. Content review D2 §7 table.
 * Set counts use the fractional rule: a direct set 1.0, an indirect set 0.5.
 */
export const WEEKLY_SET_BAND: Record<SessionsPerWeek, readonly [number, number]> = {
  2: [6, 10],
  3: [9, 15],
  4: [12, 16],
  5: [14, 18],
  6: [16, 20],
};

/**
 * Sets per exercise by experience. The report supplies the weekly BAND but no
 * experience-stratified coefficient, so novice sits at the bottom of the band and advanced at
 * the top. HEURISTIC — within-band placement. The exact figures were chosen by computing the
 * resulting weekly fractional volume for every template and every experience level and
 * requiring it to land inside the band; that computation is the Task 5 gate, not an assertion.
 */
const SETS_2_TO_4: SplitTemplate["sets"] = {
  novice: { compound: { lo: 3, hi: 3 }, isolation: { lo: 3, hi: 3 } },
  intermediate: { compound: { lo: 3, hi: 4 }, isolation: { lo: 3, hi: 3 } },
  advanced: { compound: { lo: 4, hi: 4 }, isolation: { lo: 3, hi: 4 } },
};
const SETS_5: SplitTemplate["sets"] = {
  novice: { compound: { lo: 3, hi: 4 }, isolation: { lo: 3, hi: 4 } },
  intermediate: { compound: { lo: 4, hi: 4 }, isolation: { lo: 4, hi: 4 } },
  advanced: { compound: { lo: 4, hi: 5 }, isolation: { lo: 4, hi: 5 } },
};
const SETS_6: SplitTemplate["sets"] = {
  novice: { compound: { lo: 4, hi: 4 }, isolation: { lo: 4, hi: 4 } },
  intermediate: { compound: { lo: 4, hi: 5 }, isolation: { lo: 4, hi: 5 } },
  advanced: { compound: { lo: 5, hi: 5 }, isolation: { lo: 5, hi: 5 } },
};

/* Slot constructors keep the tables below readable. */
const heavy = (role: string, candidates: string[]): ExerciseSlot => ({
  role,
  slotClass: "compound",
  intensity: "heavy",
  candidates,
});
const comp = (role: string, candidates: string[]): ExerciseSlot => ({
  role,
  slotClass: "compound",
  intensity: "moderate",
  candidates,
});
const iso = (role: string, candidates: string[]): ExerciseSlot => ({
  role,
  slotClass: "isolation",
  intensity: "light",
  candidates,
});

/* Candidate orders. Each list runs full-gym first, then a dumbbell option, then a bodyweight
 * option, so one table serves all three equipment settings. A slot with no fitting candidate
 * is dropped by the generator rather than substituted with something it does not train. */
const HORIZONTAL_PRESS = ["barbell-bench-press", "incline-dumbbell-press", "push-up"];
const INCLINE_PRESS = ["incline-dumbbell-press", "push-up"];
const TRICEPS_PRESS = ["close-grip-bench-press", "push-up"];
const VERTICAL_PRESS = ["overhead-press-barbell", "push-up"];
const EXPLOSIVE_PRESS = ["push-press", "push-up"];
const VERTICAL_PULL_A = ["lat-pulldown", "pull-up"];
const VERTICAL_PULL_B = ["pull-up", "lat-pulldown"];
const HORIZONTAL_PULL_A = ["barbell-row-pendlay", "dumbbell-row-single-arm"];
const HORIZONTAL_PULL_B = ["dumbbell-row-single-arm", "barbell-row-pendlay"];
const SQUAT = ["barbell-back-squat", "bulgarian-split-squat"];
const LEG_PRESS = ["leg-press", "bulgarian-split-squat"];
const DEADLIFT = ["trap-bar-deadlift", "conventional-deadlift", "bulgarian-split-squat"];
const SPLIT_SQUAT = ["bulgarian-split-squat"];
const HINGE = ["romanian-deadlift", "conventional-deadlift"];
const LEG_CURL = ["leg-curl-machine"];
const CALF = ["calf-raise"];
const LATERAL = ["lateral-raise"];
const REAR_DELT = ["face-pull"];
const CURL_A = ["barbell-curl", "hammer-curl"];
const CURL_B = ["hammer-curl", "barbell-curl"];
const CORE_PLANK = ["plank"];
const CORE_HANG = ["hanging-knee-raise", "plank"];
const CORE_WHEEL = ["ab-wheel-rollout", "plank"];

export const SPLIT_TEMPLATES: Record<SessionsPerWeek, SplitTemplate> = {
  2: {
    sessionsPerWeek: 2,
    name: "Full body x2",
    note: "Two full-body sessions. Content review §7: at two days a week most muscles sit below the ACSM >=10 sets/week hypertrophy floor unless the sessions run long. This is stated rather than hidden. It still clears the >=2 sessions/week the ACSM 2026 position stand recommends for strength.",
    sessions: [
      {
        label: "Full body A",
        slots: [
          heavy("squat", SQUAT),
          comp("horizontal press", HORIZONTAL_PRESS),
          comp("horizontal pull", HORIZONTAL_PULL_A),
          comp("hinge", HINGE),
          comp("vertical press", VERTICAL_PRESS),
          iso("lateral raise", LATERAL),
          iso("core", CORE_PLANK),
        ],
      },
      {
        label: "Full body B",
        slots: [
          heavy("deadlift", DEADLIFT),
          comp("incline press", INCLINE_PRESS),
          comp("vertical pull", VERTICAL_PULL_A),
          iso("rear delt", REAR_DELT),
          iso("elbow flexion", CURL_A),
          iso("calf", CALF),
          iso("core", CORE_HANG),
        ],
      },
    ],
    sets: SETS_2_TO_4,
    bandMuscles: [
      "abs",
      "biceps",
      "chest",
      "front-delt",
      "glutes",
      "hamstrings",
      "lats",
      "mid-back",
      "quads",
    ],
  },
  3: {
    sessionsPerWeek: 3,
    name: "Full body x3",
    note: "Three full-body sessions. Content review §7 prefers this over push/pull/legs at three days: PPL would give each muscle only one session a week and force all its weekly volume into that session, where the last sets are least productive.",
    sessions: [
      {
        label: "Full body A",
        slots: [
          heavy("squat", SQUAT),
          comp("horizontal press", HORIZONTAL_PRESS),
          comp("horizontal pull", HORIZONTAL_PULL_A),
          iso("lateral raise", LATERAL),
          iso("elbow flexion", CURL_A),
          iso("core", CORE_PLANK),
        ],
      },
      {
        label: "Full body B",
        slots: [
          heavy("hinge", HINGE),
          comp("vertical press", VERTICAL_PRESS),
          comp("vertical pull", VERTICAL_PULL_A),
          comp("leg press", LEG_PRESS),
          iso("knee flexion", LEG_CURL),
          iso("calf", CALF),
          iso("core", CORE_HANG),
        ],
      },
      {
        label: "Full body C",
        slots: [
          heavy("deadlift", DEADLIFT),
          comp("incline press", INCLINE_PRESS),
          comp("horizontal pull", HORIZONTAL_PULL_B),
          comp("push-up", ["push-up"]),
          iso("rear delt", REAR_DELT),
          iso("elbow flexion", CURL_B),
        ],
      },
    ],
    sets: SETS_2_TO_4,
    bandMuscles: ["biceps", "chest", "hamstrings", "lats", "mid-back", "quads"],
  },
  4: {
    sessionsPerWeek: 4,
    name: "Upper / Lower x2",
    note: "The engine default. Content review §7: best evidence fit, matching Currier 2023's highest-ranked hypertrophy prescription (higher-load, multiset, twice-weekly; SMD 0.66, 95 % CrI 0.47-0.85).",
    sessions: [
      {
        label: "Upper A",
        slots: [
          heavy("horizontal press", HORIZONTAL_PRESS),
          comp("horizontal pull", HORIZONTAL_PULL_A),
          comp("incline press", INCLINE_PRESS),
          comp("vertical pull", VERTICAL_PULL_A),
          iso("lateral raise", LATERAL),
          iso("elbow flexion", CURL_A),
        ],
      },
      {
        label: "Lower A",
        slots: [
          heavy("squat", SQUAT),
          comp("hinge", HINGE),
          comp("leg press", LEG_PRESS),
          iso("knee flexion", LEG_CURL),
          iso("calf", CALF),
          iso("core", CORE_PLANK),
        ],
      },
      {
        label: "Upper B",
        slots: [
          heavy("triceps press", TRICEPS_PRESS),
          comp("vertical pull", VERTICAL_PULL_B),
          comp("vertical press", VERTICAL_PRESS),
          comp("horizontal pull", HORIZONTAL_PULL_B),
          iso("rear delt", REAR_DELT),
          iso("elbow flexion", CURL_B),
        ],
      },
      {
        label: "Lower B",
        slots: [
          heavy("deadlift", DEADLIFT),
          comp("split squat", SPLIT_SQUAT),
          comp("push-up", ["push-up"]),
          iso("lateral raise", LATERAL),
          iso("calf", CALF),
          iso("core", CORE_HANG),
        ],
      },
    ],
    sets: SETS_2_TO_4,
    bandMuscles: ["biceps", "chest", "hamstrings", "lats", "quads"],
  },
  5: {
    sessionsPerWeek: 5,
    name: "Upper / Lower x2 + accessory",
    note: "Upper, lower, upper, lower, then an accessory session for the groups the four main sessions leave at maintenance. Content review §7: approaching the 18-20 sets/week point where marginal return approaches zero.",
    sessions: [
      {
        label: "Upper A",
        slots: [
          heavy("horizontal press", HORIZONTAL_PRESS),
          comp("horizontal pull", HORIZONTAL_PULL_A),
          comp("incline press", INCLINE_PRESS),
          comp("vertical pull", VERTICAL_PULL_A),
          iso("lateral raise", LATERAL),
          iso("elbow flexion", CURL_A),
        ],
      },
      {
        label: "Lower A",
        slots: [
          heavy("squat", SQUAT),
          comp("hinge", HINGE),
          comp("leg press", LEG_PRESS),
          iso("knee flexion", LEG_CURL),
          iso("calf", CALF),
          iso("core", CORE_PLANK),
        ],
      },
      {
        label: "Upper B",
        slots: [
          heavy("triceps press", TRICEPS_PRESS),
          comp("vertical pull", VERTICAL_PULL_B),
          comp("vertical press", VERTICAL_PRESS),
          comp("horizontal pull", HORIZONTAL_PULL_B),
          iso("rear delt", REAR_DELT),
          iso("elbow flexion", CURL_B),
        ],
      },
      {
        label: "Lower B",
        slots: [
          heavy("deadlift", DEADLIFT),
          comp("split squat", SPLIT_SQUAT),
          iso("lateral raise", LATERAL),
          iso("calf", CALF),
          iso("core", CORE_HANG),
        ],
      },
      {
        label: "Accessory",
        slots: [
          heavy("push-up", ["push-up"]),
          iso("rear delt", REAR_DELT),
          iso("lateral raise", LATERAL),
          iso("calf", CALF),
          iso("core", CORE_WHEEL),
          iso("core", CORE_HANG),
        ],
      },
    ],
    sets: SETS_5,
    bandMuscles: ["abs", "biceps", "chest", "hamstrings", "lats", "mid-back", "quads"],
  },
  6: {
    sessionsPerWeek: 6,
    name: "Push / Pull / Legs x2",
    note: "Content review §7: the top of the useful range. Marginal return is near zero beyond roughly 18-20 sets per muscle per week, so this template adds frequency, not volume beyond the band.",
    sessions: [
      {
        label: "Push A",
        slots: [
          heavy("horizontal press", HORIZONTAL_PRESS),
          comp("incline press", INCLINE_PRESS),
          comp("vertical press", VERTICAL_PRESS),
          iso("lateral raise", LATERAL),
          iso("core", CORE_PLANK),
        ],
      },
      {
        label: "Pull A",
        slots: [
          heavy("horizontal pull", HORIZONTAL_PULL_A),
          comp("vertical pull", VERTICAL_PULL_A),
          iso("rear delt", REAR_DELT),
          iso("elbow flexion", CURL_A),
          iso("elbow flexion", CURL_B),
        ],
      },
      {
        label: "Legs A",
        slots: [
          heavy("squat", SQUAT),
          comp("hinge", HINGE),
          comp("leg press", LEG_PRESS),
          iso("knee flexion", LEG_CURL),
          iso("calf", CALF),
        ],
      },
      {
        label: "Push B",
        slots: [
          heavy("triceps press", TRICEPS_PRESS),
          comp("push-up", ["push-up"]),
          comp("explosive press", EXPLOSIVE_PRESS),
          iso("lateral raise", LATERAL),
          iso("core", CORE_WHEEL),
        ],
      },
      {
        label: "Pull B",
        slots: [
          heavy("vertical pull", VERTICAL_PULL_B),
          comp("horizontal pull", HORIZONTAL_PULL_B),
          iso("rear delt", REAR_DELT),
          iso("core", CORE_HANG),
          iso("calf", CALF),
        ],
      },
      {
        label: "Legs B",
        slots: [
          heavy("deadlift", DEADLIFT),
          comp("split squat", SPLIT_SQUAT),
          iso("lateral raise", LATERAL),
          iso("core", CORE_HANG),
          iso("calf", CALF),
        ],
      },
    ],
    sets: SETS_6,
    bandMuscles: [
      "abs",
      "biceps",
      "chest",
      "front-delt",
      "hamstrings",
      "lats",
      "mid-back",
      "quads",
      "side-delt",
    ],
  },
};

/**
 * Rep prescriptions.
 *
 * Content review §9 stratifies by LOAD, not by goal: heavy multi-joint work is >=80 % 1RM at
 * <=6 reps; moderate compound work is 6-12 reps. The report supplies NO goal-stratified rep
 * range, so PlanInput.goal does not appear here.
 *
 * Exercise-level overrides reproduce the legacy prescriptions for movements with no external
 * load: push-ups were "3 x max", the plank "60 s", the rower and stair climber "20 min",
 * the walk "20-30 min" (1500 s is the midpoint of that legacy range, not a physiological
 * figure).
 */
const REPS_HEAVY = { lo: 4, hi: 6 } as const; // <=6 reps: the §9 heavy class
const REPS_MODERATE = { lo: 6, hi: 8 } as const; // inside the §9 moderate 6-12 band
const REPS_ISOLATION = { lo: 8, hi: 12 } as const; // inside the §9 moderate 6-12 band

export function prescriptionFor(ex: Exercise, intensity: SlotIntensity): Prescription {
  switch (ex.id) {
    case "push-up":
    case "pull-up":
      return { kind: "amrap", minimum: null };
    case "plank":
      return { kind: "time", targetS: 60 }; // seconds
    case "rower-intervals":
    case "stair-climber":
      return { kind: "duration", targetS: 1200 }; // seconds (20 min)
    case "walk":
      return { kind: "duration", targetS: 1500 }; // seconds (25 min, midpoint of legacy 20-30)
    default:
      break;
  }
  if (ex.loadClass === "isolation") return { kind: "reps", ...REPS_ISOLATION };
  return intensity === "heavy" ? { kind: "reps", ...REPS_HEAVY } : { kind: "reps", ...REPS_MODERATE };
}

/**
 * Rest defaults, content review §9 and master plan §6.5:
 *   heavy multi-joint compound (<=6 reps)  180-300 s  -> 180
 *   moderate compound (6-12 reps)          120-180 s  -> 120
 *   single-joint isolation / machine        60-90 s   ->  90
 * The report's honest limit, reproduced verbatim: "the literature stratifies rest by load and
 * goal, not by exercise type. The multi-joint/single-joint mapping above is an engineering
 * heuristic onto the load ranges actually tested — INSUFFICIENT EVIDENCE for exercise-type
 * stratification per se." The rejected 30-60 s "hypertrophy rest" default is never returned:
 * Schoenfeld 2016 (DOI 10.1519/JSC.0000000000001272) found 1 min worse than 3 min.
 *
 * P4's defaultRestS() must delegate to this function so the two never drift.
 */
export function restSFor(ex: Exercise, prescription: Prescription): Seconds {
  if (ex.loadClass === "isolation") return 90; // seconds
  if (prescription.kind === "reps" && prescription.hi <= 6) return 180; // seconds
  return 120; // seconds
}

/** First candidate that the equipment supports and the session has not already used. */
export function resolveSlot(
  slot: ExerciseSlot,
  equipment: Equipment,
  used: ReadonlySet<string>,
): Exercise | null {
  for (const id of slot.candidates) {
    const ex = EXERCISE_BY_ID[id];
    if (!ex) continue;
    if (used.has(ex.id)) continue;
    if (!ex.equipment.includes(equipment)) continue;
    return ex;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/plan/templates.test.ts`
Expected: PASS — 18 tests passed.

- [ ] **Step 5: Lint and type-check**

Run: `npx tsc --noEmit && npx eslint src/domain/plan/templates.ts src/domain/plan/templates.test.ts`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add src/domain/plan/templates.ts src/domain/plan/templates.test.ts
git commit -m "feat: split templates for 2-6 training days with cited set bands and rest defaults"
```

---

## Task 5: Plan generator (`src/domain/plan/generator.ts`)

**Files:**
- Create: `src/domain/plan/generator.ts`
- Create: `src/domain/plan/generator.test.ts`

**Interfaces:**
- Consumes: `src/domain/ids.ts` (`newId`), `src/domain/types.ts` (`Equipment`, `Exercise`, `Experience`, `GoalKind`, `PlanBlock`, `PlannedExercise`, `PlannedSession`, `PlanTemplate`), `./templates`, `./library` (`INDIRECT_SET_FRACTION`, `MUSCLE_GROUPS`).
- Produces (used by Tasks 7 and 8, and by P3's cursor):
  - `interface PlanInput { sessionsPerWeek: SessionsPerWeek; weeks: number; goal: GoalKind; experience: Experience; equipment: Equipment; includeCardio: boolean }`
  - `function generatePlan(input: PlanInput, library: readonly Exercise[]): PlanTemplate`
  - `function weeklySetsByMuscle(sessions: readonly PlannedSession[], library: readonly Exercise[]): Record<string, number>`
  - `interface VolumeReport { band: readonly [number, number]; perMuscle: Record<string, number>; inBand: string[]; maintenance: string[]; over: string[] }`
  - `function volumeReport(plan: PlanTemplate, library: readonly Exercise[]): VolumeReport`
  - `const PLAN_WEEKS_MIN = 8`, `const PLAN_WEEKS_MAX = 24`, `const BLOCK_WEEKS = 4`, `const DELOAD_SET_MODIFIER = 0.5`

**Block and deload rules, and where they come from:**
- Blocks are four weeks long: three training weeks then one deload week, repeated; a trailing partial block of fewer than four weeks carries no deload. `PlanBlock` holds one modifier pair, so each four-week cycle is emitted as **two** blocks — a normal one (`setModifier 1`) and a deload one (`setModifier 0.5`).
- **A deload cuts volume and holds load.** Bosquet 2007 (`10.1249/mss.0b013e31806010e0`) found the optimal taper decreases volume by **41–60 %** "without any modification of either training intensity or frequency". `setModifier = 0.5` sits inside that band; `loadModifier = 1` is the verbatim finding. The legacy "reduce weight by 40 %" is the reverse and is not implemented.
- **The four-week cadence is a calendar backstop, not an evidence-based interval.** Bell 2023 (`10.1186/s40798-023-00633-0`) reports 100 % panel agreement that deload frequency "may depend on how athlete responds" and that pre-planned deloads "might not be necessary"; Coleman 2024 (`10.7717/peerj.16777`) found a mid-programme deload gave no hypertrophy benefit. The content review's recommendation is "autoregulate; keep a 4–8 week calendar backstop" — this is the lower edge of that backstop, labelled a heuristic in the code.

**Gate for this task (master plan §7, P2 generator row):** every `sessionsPerWeek ∈ {2..6}` yields `weeks × sessionsPerWeek` sessions, each label balanced per week, no exercise absent from the library, every deload block with `setModifier ∈ [0.4, 0.6]` and `loadModifier === 1`, and weekly fractional sets per muscle inside the §7 band for that day count.

- [ ] **Step 1: Write the failing test**

Create `src/domain/plan/generator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXERCISES, EXERCISE_BY_ID, MUSCLE_GROUPS } from "./library";
import { SPLIT_TEMPLATES, WEEKLY_SET_BAND, type SessionsPerWeek } from "./templates";
import {
  BLOCK_WEEKS,
  DELOAD_SET_MODIFIER,
  generatePlan,
  volumeReport,
  weeklySetsByMuscle,
  type PlanInput,
} from "./generator";
import type { Equipment, Experience } from "../types";

const DAY_COUNTS: SessionsPerWeek[] = [2, 3, 4, 5, 6];
const EXPERIENCES: Experience[] = ["novice", "intermediate", "advanced"];

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  sessionsPerWeek: 4,
  weeks: 12,
  goal: "fat-loss",
  experience: "intermediate",
  equipment: "full-gym",
  includeCardio: false,
  ...over,
});

describe("plan shape", () => {
  it("emits weeks x sessionsPerWeek sessions with contiguous ordinals", () => {
    for (const d of DAY_COUNTS) {
      for (const weeks of [8, 10, 12, 24]) {
        const plan = generatePlan(input({ sessionsPerWeek: d, weeks }), EXERCISES);
        expect(plan.sessions.length).toBe(weeks * d);
        plan.sessions.forEach((s, i) => expect(s.ordinal).toBe(i));
        expect(new Set(plan.sessions.map((s) => s.id)).size).toBe(plan.sessions.length);
      }
    }
  });

  it("repeats the template's label sequence exactly once per week", () => {
    for (const d of DAY_COUNTS) {
      const plan = generatePlan(input({ sessionsPerWeek: d, weeks: 9 }), EXERCISES);
      const expected = SPLIT_TEMPLATES[d].sessions.map((s) => s.label);
      for (let w = 0; w < 9; w += 1) {
        const week = plan.sessions.slice(w * d, (w + 1) * d).map((s) => s.label);
        expect(week).toEqual(expected);
      }
    }
  });

  it("names only exercises that exist in the library", () => {
    for (const d of DAY_COUNTS) {
      const plan = generatePlan(input({ sessionsPerWeek: d }), EXERCISES);
      for (const s of plan.sessions) {
        expect(s.exercises.length).toBeGreaterThan(0);
        for (const pe of s.exercises) expect(EXERCISE_BY_ID[pe.exerciseId]).toBeDefined();
      }
    }
  });

  it("never repeats an exercise inside one session", () => {
    for (const d of DAY_COUNTS) {
      const plan = generatePlan(input({ sessionsPerWeek: d }), EXERCISES);
      for (const s of plan.sessions) {
        const ids = s.exercises.map((e) => e.exerciseId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it("puts compound-primary exercises before the rest of the session", () => {
    for (const d of DAY_COUNTS) {
      const plan = generatePlan(input({ sessionsPerWeek: d }), EXERCISES);
      for (const s of plan.sessions) {
        const flags = s.exercises.map((pe) => EXERCISE_BY_ID[pe.exerciseId]?.isCompoundPrimary === true);
        const firstFalse = flags.indexOf(false);
        if (firstFalse === -1) continue;
        expect(flags.slice(firstFalse).every((f) => f === false)).toBe(true);
      }
    }
  });

  it("rejects out-of-range programme lengths", () => {
    expect(() => generatePlan(input({ weeks: 7 }), EXERCISES)).toThrow(RangeError);
    expect(() => generatePlan(input({ weeks: 25 }), EXERCISES)).toThrow(RangeError);
    expect(() => generatePlan(input({ weeks: 12.5 }), EXERCISES)).toThrow(RangeError);
  });
});

describe("blocks and deloads", () => {
  it("covers every session exactly once, in order", () => {
    for (const weeks of [8, 9, 10, 11, 12, 24]) {
      const plan = generatePlan(input({ weeks, sessionsPerWeek: 4 }), EXERCISES);
      let cursor = 0;
      plan.blocks.forEach((b, i) => {
        expect(b.index).toBe(i);
        expect(b.firstSessionIndex).toBe(cursor);
        expect(b.sessionCount).toBeGreaterThan(0);
        cursor += b.sessionCount;
      });
      expect(cursor).toBe(plan.sessions.length);
    }
  });

  it("cuts volume and holds load in every deload block", () => {
    const plan = generatePlan(input({ weeks: 24, sessionsPerWeek: 4 }), EXERCISES);
    const deloads = plan.blocks.filter((b) => b.isDeload);
    expect(deloads.length).toBe(24 / BLOCK_WEEKS);
    for (const b of deloads) {
      expect(b.setModifier).toBe(DELOAD_SET_MODIFIER);
      expect(b.setModifier).toBeGreaterThanOrEqual(0.4);
      expect(b.setModifier).toBeLessThanOrEqual(0.6);
      expect(b.loadModifier).toBe(1);
      expect(b.sessionCount).toBe(4); // one week
    }
    for (const b of plan.blocks.filter((x) => !x.isDeload)) {
      expect(b.setModifier).toBe(1);
      expect(b.loadModifier).toBe(1);
    }
  });

  it("gives a trailing partial block no deload", () => {
    // 10 weeks at 3/week: 3 training + 1 deload, 3 training + 1 deload, then 2 training weeks.
    const plan = generatePlan(input({ weeks: 10, sessionsPerWeek: 3 }), EXERCISES);
    expect(plan.blocks.map((b) => b.sessionCount)).toEqual([9, 3, 9, 3, 6]);
    expect(plan.blocks.map((b) => b.isDeload)).toEqual([false, true, false, true, false]);
  });
});

describe("prescriptions, rest and cardio", () => {
  it("gives every planned exercise a rest interval of at least 90 s and a set range", () => {
    const plan = generatePlan(input({ sessionsPerWeek: 5 }), EXERCISES);
    for (const s of plan.sessions) {
      for (const pe of s.exercises) {
        expect(pe.restS).toBeGreaterThanOrEqual(90);
        expect(pe.setsHi).toBeGreaterThanOrEqual(pe.setsLo);
        expect(pe.setsLo).toBeGreaterThan(0);
      }
    }
  });

  it("appends exactly one conditioning exercise per week when cardio is requested", () => {
    const off = generatePlan(input({ includeCardio: false, weeks: 8 }), EXERCISES);
    const on = generatePlan(input({ includeCardio: true, weeks: 8 }), EXERCISES);
    expect(on.sessions.length).toBe(off.sessions.length);
    const cardioCount = on.sessions.filter((s) =>
      s.exercises.some((pe) => pe.exerciseId === "rower-intervals"),
    ).length;
    expect(cardioCount).toBe(8);
    expect(off.sessions.some((s) => s.exercises.some((pe) => pe.exerciseId === "rower-intervals"))).toBe(
      false,
    );
  });

  it("falls back to walking when the equipment has no ergometer", () => {
    const plan = generatePlan(input({ includeCardio: true, equipment: "bodyweight", weeks: 8 }), EXERCISES);
    expect(plan.sessions.filter((s) => s.exercises.some((pe) => pe.exerciseId === "walk")).length).toBe(8);
  });
});

describe("weekly set volume — the P2 generator gate", () => {
  it("reproduces the hand-computed 4-day intermediate volume exactly", () => {
    const plan = generatePlan(input({ sessionsPerWeek: 4, experience: "intermediate" }), EXERCISES);
    const week = weeklySetsByMuscle(plan.sessions.slice(0, 4), EXERCISES);
    expect(week).toEqual({
      abs: 6,
      biceps: 13,
      calves: 6,
      chest: 14,
      "front-delt": 10.5,
      glutes: 12.25,
      hamstrings: 13.5,
      lats: 14,
      "mid-back": 12,
      quads: 14,
      "rear-delt": 4.75,
      "side-delt": 7.75,
      triceps: 10.5,
    });
  });

  it("places every declared band muscle inside the content review §7 band, at every experience level", () => {
    for (const d of DAY_COUNTS) {
      const [lo, hi] = WEEKLY_SET_BAND[d];
      for (const experience of EXPERIENCES) {
        const plan = generatePlan(input({ sessionsPerWeek: d, experience }), EXERCISES);
        const week = weeklySetsByMuscle(plan.sessions.slice(0, d), EXERCISES);
        for (const muscle of SPLIT_TEMPLATES[d].bandMuscles) {
          const sets = week[muscle] ?? 0;
          expect(
            sets >= lo && sets <= hi,
            `${d} days, ${experience}, ${muscle}: ${sets} sets outside [${lo}, ${hi}]`,
          ).toBe(true);
        }
      }
    }
  });

  it("never overshoots the band top for any muscle, at any day count or experience level", () => {
    for (const d of DAY_COUNTS) {
      const hi = WEEKLY_SET_BAND[d][1];
      for (const experience of EXPERIENCES) {
        const plan = generatePlan(input({ sessionsPerWeek: d, experience }), EXERCISES);
        const week = weeklySetsByMuscle(plan.sessions.slice(0, d), EXERCISES);
        for (const [muscle, sets] of Object.entries(week)) {
          expect(sets, `${d} days, ${experience}, ${muscle}`).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it("trains every muscle group in the vocabulary at every day count", () => {
    for (const d of DAY_COUNTS) {
      const plan = generatePlan(input({ sessionsPerWeek: d }), EXERCISES);
      const week = weeklySetsByMuscle(plan.sessions.slice(0, d), EXERCISES);
      for (const m of MUSCLE_GROUPS) {
        expect(week[m] ?? 0, `${d} days: ${m} is untrained`).toBeGreaterThan(0);
      }
    }
  });

  it("reports the maintenance-only muscles instead of hiding them", () => {
    const plan = generatePlan(input({ sessionsPerWeek: 4 }), EXERCISES);
    const report = volumeReport(plan, EXERCISES);
    expect(report.band).toEqual([12, 16]);
    expect(report.over).toEqual([]);
    // Order follows MUSCLE_GROUPS, not the alphabet. At "intermediate" the 4-day template
    // also lifts mid-back (12.0) and glutes (12.25) into the band; the template's declared
    // bandMuscles are the stricter set that holds at ALL three experience levels.
    expect(report.inBand).toEqual([
      "chest",
      "biceps",
      "lats",
      "mid-back",
      "quads",
      "hamstrings",
      "glutes",
    ]);
    expect(report.maintenance).toEqual([
      "front-delt",
      "side-delt",
      "rear-delt",
      "triceps",
      "calves",
      "abs",
    ]);
  });
});

describe("equipment filtering", () => {
  it("never plans an exercise the equipment cannot perform", () => {
    const settings: Equipment[] = ["full-gym", "dumbbells-only", "bodyweight"];
    for (const equipment of settings) {
      for (const d of DAY_COUNTS) {
        const plan = generatePlan(input({ sessionsPerWeek: d, equipment }), EXERCISES);
        for (const s of plan.sessions) {
          for (const pe of s.exercises) {
            expect(EXERCISE_BY_ID[pe.exerciseId]?.equipment).toContain(equipment);
          }
        }
      }
    }
  });
});

describe("storage footprint", () => {
  it("keeps the largest plan well inside the localStorage budget", () => {
    const plan = generatePlan(
      input({ sessionsPerWeek: 6, weeks: 24, includeCardio: true }),
      EXERCISES,
    );
    expect(plan.sessions.length).toBe(144);
    expect(JSON.stringify(plan).length).toBeLessThan(400_000); // bytes of UTF-16 code units
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/plan/generator.test.ts`
Expected: FAIL — `Failed to resolve import "./generator"`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/plan/generator.ts`:

```ts
import { newId } from "../ids";
import type {
  Equipment,
  Exercise,
  Experience,
  GoalKind,
  PlanBlock,
  PlannedExercise,
  PlannedSession,
  PlanTemplate,
} from "../types";
import { INDIRECT_SET_FRACTION, MUSCLE_GROUPS } from "./library";
import {
  prescriptionFor,
  resolveSlot,
  restSFor,
  SPLIT_TEMPLATES,
  WEEKLY_SET_BAND,
  type SessionsPerWeek,
  type SessionTemplate,
} from "./templates";

export const PLAN_WEEKS_MIN = 8; // weeks
export const PLAN_WEEKS_MAX = 24; // weeks
export const BLOCK_WEEKS = 4; // weeks per block: three training weeks then one deload week

/**
 * Deload modifiers. Bosquet 2007 (DOI 10.1249/mss.0b013e31806010e0): the optimal taper
 * decreases VOLUME by 41-60 % "without any modification of either training intensity or
 * frequency". 0.5 sits inside that band; the load is untouched. The legacy rule ("reduce
 * weight by 40 %") is the reverse and is not implemented.
 *
 * The four-week CADENCE is a calendar backstop, not an evidence-based interval: Bell 2023
 * (DOI 10.1186/s40798-023-00633-0) records 100 % panel agreement that deload frequency "may
 * depend on how athlete responds" and that pre-planned deloads "might not be necessary";
 * Coleman 2024 (DOI 10.7717/peerj.16777) found no hypertrophy benefit from a mid-programme
 * deload. The content review's recommendation is "autoregulate; keep a 4-8 week calendar
 * backstop" — HEURISTIC, this is the lower edge of that backstop.
 */
export const DELOAD_SET_MODIFIER = 0.5;
const DELOAD_LOAD_MODIFIER = 1;
const PLAN_VERSION = 1;

export interface PlanInput {
  sessionsPerWeek: SessionsPerWeek;
  weeks: number; // whole weeks, PLAN_WEEKS_MIN..PLAN_WEEKS_MAX
  goal: GoalKind; // affects the plan NAME only: the content review supplies no goal-stratified
  // rep range or set count. Goal drives energy and protein, in nutrition.ts.
  experience: Experience;
  equipment: Equipment;
  includeCardio: boolean;
}

/** Conditioning appended to the last session of each week when includeCardio is set. */
const CARDIO_PREFERENCE = ["rower-intervals", "stair-climber", "walk"];

function buildSessionExercises(
  template: SessionTemplate,
  sets: { compound: { lo: number; hi: number }; isolation: { lo: number; hi: number } },
  equipment: Equipment,
): PlannedExercise[] {
  const used = new Set<string>();
  const planned: PlannedExercise[] = [];
  for (const slot of template.slots) {
    const ex = resolveSlot(slot, equipment, used);
    if (!ex) continue; // no candidate fits this equipment; the slot is dropped, not substituted
    used.add(ex.id);
    const prescription = prescriptionFor(ex, slot.intensity);
    const count = sets[slot.slotClass];
    planned.push({
      exerciseId: ex.id,
      setsLo: count.lo, // sets
      setsHi: count.hi, // sets
      prescription,
      restS: restSFor(ex, prescription), // seconds
    });
  }
  return planned;
}

function cardioExercise(equipment: Equipment, library: readonly Exercise[]): PlannedExercise | null {
  for (const id of CARDIO_PREFERENCE) {
    const ex = library.find((e) => e.id === id);
    if (ex && ex.equipment.includes(equipment)) {
      const prescription = prescriptionFor(ex, "light");
      return {
        exerciseId: ex.id,
        setsLo: 1, // sets
        setsHi: 1, // sets
        prescription,
        restS: 0, // seconds: conditioning carries no inter-set rest
      };
    }
  }
  return null;
}

function buildBlocks(sessionsPerWeek: number, weeks: number): PlanBlock[] {
  const blocks: PlanBlock[] = [];
  let week = 0;
  let firstSessionIndex = 0;
  let index = 0;
  while (week < weeks) {
    const remaining = weeks - week;
    if (remaining >= BLOCK_WEEKS) {
      const trainingWeeks = BLOCK_WEEKS - 1;
      blocks.push({
        index: index++,
        firstSessionIndex,
        sessionCount: trainingWeeks * sessionsPerWeek,
        setModifier: 1,
        loadModifier: 1,
        isDeload: false,
      });
      firstSessionIndex += trainingWeeks * sessionsPerWeek;
      blocks.push({
        index: index++,
        firstSessionIndex,
        sessionCount: sessionsPerWeek,
        setModifier: DELOAD_SET_MODIFIER,
        loadModifier: DELOAD_LOAD_MODIFIER,
        isDeload: true,
      });
      firstSessionIndex += sessionsPerWeek;
      week += BLOCK_WEEKS;
    } else {
      // Trailing partial block: fewer than four weeks left, so no deload is scheduled.
      blocks.push({
        index: index++,
        firstSessionIndex,
        sessionCount: remaining * sessionsPerWeek,
        setModifier: 1,
        loadModifier: 1,
        isDeload: false,
      });
      firstSessionIndex += remaining * sessionsPerWeek;
      week += remaining;
    }
  }
  return blocks;
}

export function generatePlan(input: PlanInput, library: readonly Exercise[]): PlanTemplate {
  if (!Number.isInteger(input.weeks) || input.weeks < PLAN_WEEKS_MIN || input.weeks > PLAN_WEEKS_MAX) {
    throw new RangeError(
      `generatePlan: weeks must be a whole number in [${PLAN_WEEKS_MIN}, ${PLAN_WEEKS_MAX}]`,
    );
  }
  const template = SPLIT_TEMPLATES[input.sessionsPerWeek];
  const sets = template.sets[input.experience];
  const cardio = input.includeCardio ? cardioExercise(input.equipment, library) : null;

  const sessions: PlannedSession[] = [];
  for (let week = 1; week <= input.weeks; week += 1) {
    template.sessions.forEach((sessionTemplate, i) => {
      const exercises = buildSessionExercises(sessionTemplate, sets, input.equipment);
      const isLastOfWeek = i === template.sessions.length - 1;
      if (cardio && isLastOfWeek) exercises.push(cardio);
      sessions.push({
        id: newId(),
        ordinal: sessions.length,
        name: `Week ${week} · ${sessionTemplate.label}`,
        kind: "lift",
        label: sessionTemplate.label,
        exercises,
      });
    });
  }

  return {
    id: newId(),
    version: PLAN_VERSION,
    name: `${template.name} · ${input.weeks} weeks · ${input.goal}`,
    sessionsPerWeek: input.sessionsPerWeek,
    weeks: input.weeks,
    sessions,
    blocks: buildBlocks(input.sessionsPerWeek, input.weeks),
  };
}

/**
 * Weekly fractional sets per muscle for one week of sessions.
 * Content review §6 (Pelland 2025, DOI 10.1007/s40279-025-02344-w): a direct set counts 1.0,
 * an indirect set 0.5. Each planned exercise contributes the midpoint of its prescribed set
 * range, because that is the volume a compliant user actually performs across the range.
 * Block modifiers are NOT applied here: this is the prescribed volume of a normal week, which
 * is what the content review §7 band describes.
 */
export function weeklySetsByMuscle(
  sessions: readonly PlannedSession[],
  library: readonly Exercise[],
): Record<string, number> {
  const byId = new Map(library.map((e) => [e.id, e]));
  const totals: Record<string, number> = {};
  const add = (muscle: string, sets: number): void => {
    totals[muscle] = (totals[muscle] ?? 0) + sets;
  };
  for (const session of sessions) {
    for (const pe of session.exercises) {
      const ex = byId.get(pe.exerciseId);
      if (!ex) continue;
      const midSets = (pe.setsLo + pe.setsHi) / 2; // sets
      for (const m of ex.muscleGroups) add(m, midSets);
      for (const m of ex.secondaryMuscles) add(m, midSets * INDIRECT_SET_FRACTION);
    }
  }
  return totals;
}

export interface VolumeReport {
  band: readonly [number, number]; // fractional sets/muscle/week
  perMuscle: Record<string, number>;
  inBand: string[];
  maintenance: string[]; // below the band bottom — declared, never hidden
  over: string[]; // above the band top — must be empty
}

/**
 * The honest summary the wizard shows. With thirteen muscle groups and a band of, say, 12-16
 * sets each, no achievable session length puts every muscle in band; the content review §2.1
 * explicitly permits the alternative: "state that they are maintenance-only".
 */
function bandFor(sessionsPerWeek: number): readonly [number, number] {
  switch (sessionsPerWeek) {
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
      return WEEKLY_SET_BAND[sessionsPerWeek];
    default:
      // A plan with an unsupported day count cannot be produced by generatePlan; an imported
      // one is reported with an open band rather than a fabricated one.
      return [0, Number.POSITIVE_INFINITY];
  }
}

export function volumeReport(plan: PlanTemplate, library: readonly Exercise[]): VolumeReport {
  const sessionsPerWeek = plan.sessionsPerWeek;
  const band = bandFor(sessionsPerWeek);
  const perMuscle = weeklySetsByMuscle(plan.sessions.slice(0, sessionsPerWeek), library);
  const inBand: string[] = [];
  const maintenance: string[] = [];
  const over: string[] = [];
  for (const m of MUSCLE_GROUPS) {
    const sets = perMuscle[m] ?? 0;
    if (sets > band[1]) over.push(m);
    else if (sets >= band[0]) inBand.push(m);
    else maintenance.push(m);
  }
  return { band, perMuscle, inBand, maintenance, over };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/plan/generator.test.ts`
Expected: PASS — 19 tests passed. In particular the "reproduces the hand-computed 4-day intermediate volume" case must match to the digit; if it does not, the template set tables changed and the band assertions below it are no longer the ones this plan verified.

- [ ] **Step 5: Lint and type-check**

Run: `npx tsc --noEmit && npx eslint src/domain/plan/generator.ts src/domain/plan/generator.test.ts`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add src/domain/plan/generator.ts src/domain/plan/generator.test.ts
git commit -m "feat: plan generator with four-week blocks, volume-only deloads and a verified set-volume gate"
```

---

## Task 6: Store actions and the nutrition selector

**Files:**
- Modify: `src/store/index.ts` (add five actions to `AppActions` and to the store creator)
- Modify: `src/store/selectors.ts` (add `latestBodyMassEntry`, `nutritionInputFor`, `useNutritionTargets`)
- Create: `src/store/profile.test.ts`

**Interfaces:**
- Consumes (from P1): `useAppStore` (Zustand store with `AppState & AppActions`), `wipeAll()` (resets to the empty state — used by tests), `newId()`, `todayLocal(tz)`.
- Produces (used by Tasks 7 and 8, and by P3):
  - `createProfile(p: Profile): void` — inserts the profile, seeds its empty log arrays, and makes it active when no profile is active.
  - `updateProfile(id: string, patch: Partial<Profile>): void` — shallow patch; unknown id is a no-op.
  - `setPlan(profileId: string, plan: PlanTemplate, startedOn: LocalDate): void` — stores the plan **and** creates the `PlanCursor` at `nextSessionIndex 0`.
  - `logIntake(profileId: string, entry: IntakeEntry): void` — one entry per date; a second entry for the same date replaces the first.
  - `setAvailability(profileId: string, a: Availability): void` — P2 collects it in the wizard; **P3 consumes it** (see amendments).
  - `latestBodyMassEntry(state: AppState, profileId: string): BodyMassEntry | null`
  - `nutritionInputFor(profile: Profile, latest: BodyMassEntry | null, sessionsPerWeek: number, todayIso: LocalDate): NutritionInput`
  - `useNutritionTargets(): NutritionTargets | null`

- [ ] **Step 1: Write the failing test**

Create `src/store/profile.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./index";
import { latestBodyMassEntry, nutritionInputFor, useNutritionTargets } from "./selectors";
import { EXERCISES } from "../domain/plan/library";
import { generatePlan } from "../domain/plan/generator";
import type { Availability, BodyMassEntry, IntakeEntry, Profile } from "../domain/types";

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: "p1",
  displayName: "Test subject",
  timezone: "Europe/Athens",
  units: "metric",
  createdAt: 1_756_684_800_000, // 2026-09-01T00:00:00Z
  body: {
    sex: "male",
    birthYear: 1996,
    heightCm: 180, // cm
    baselineMassKg: 80, // kg
    baselineAt: "2026-09-01",
    baselineBodyFatPct: null,
  },
  activity: "moderate",
  experience: "intermediate",
  equipment: "full-gym",
  equipmentSteps: { barbellKg: 2.5, dumbbellPairKg: 5, stackKg: 5, hasMicroPlates: false }, // kg
  goal: { kind: "fat-loss", targetMassKg: null, targetBodyFatPct: null, targetDate: null },
  supplements: { creatine: false },
  hydration: { dailyTargetML: 3000, cupSizeML: 250 }, // mL
  ...over,
});

beforeEach(() => {
  useAppStore.getState().wipeAll();
});

describe("createProfile", () => {
  it("stores the profile and makes the first one active", () => {
    useAppStore.getState().createProfile(profile());
    const s = useAppStore.getState();
    expect(s.profiles["p1"]?.displayName).toBe("Test subject");
    expect(s.activeProfileId).toBe("p1");
  });

  it("seeds empty log arrays so later writes never index undefined", () => {
    useAppStore.getState().createProfile(profile());
    const s = useAppStore.getState();
    expect(s.intake["p1"]).toEqual([]);
    expect(s.bodyMass["p1"]).toEqual([]);
    expect(s.hydration["p1"]).toEqual([]);
    expect(s.weeklyReviews["p1"]).toEqual([]);
    expect(s.pauses["p1"]).toEqual([]);
    expect(s.assignments["p1"]).toEqual([]);
  });

  it("does not steal the active slot from an existing profile", () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().createProfile(profile({ id: "p2" }));
    expect(useAppStore.getState().activeProfileId).toBe("p1");
    expect(Object.keys(useAppStore.getState().profiles).sort()).toEqual(["p1", "p2"]);
  });
});

describe("updateProfile", () => {
  it("patches the named fields and leaves the rest", () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().updateProfile("p1", { units: "imperial", activity: "very-active" });
    const p = useAppStore.getState().profiles["p1"];
    expect(p?.units).toBe("imperial");
    expect(p?.activity).toBe("very-active");
    expect(p?.body.baselineMassKg).toBe(80);
  });

  it("ignores an unknown id", () => {
    useAppStore.getState().updateProfile("nope", { units: "imperial" });
    expect(useAppStore.getState().profiles["nope"]).toBeUndefined();
  });
});

describe("setPlan", () => {
  it("stores the plan and starts a cursor at session zero", () => {
    useAppStore.getState().createProfile(profile());
    const plan = generatePlan(
      {
        sessionsPerWeek: 4,
        weeks: 12,
        goal: "fat-loss",
        experience: "intermediate",
        equipment: "full-gym",
        includeCardio: false,
      },
      EXERCISES,
    );
    useAppStore.getState().setPlan("p1", plan, "2026-09-07");
    const s = useAppStore.getState();
    expect(s.plans[plan.id]?.sessions.length).toBe(48);
    expect(s.cursors["p1"]).toEqual({
      planId: plan.id,
      nextSessionIndex: 0,
      startedOn: "2026-09-07",
      completedOn: null,
    });
  });
});

describe("logIntake", () => {
  const entry = (over: Partial<IntakeEntry> = {}): IntakeEntry => ({
    profileId: "p1",
    date: "2026-09-01",
    kcal: 2400, // kcal/day
    proteinG: 150, // g/day
    ...over,
  });

  it("appends one entry per date", () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().logIntake("p1", entry());
    useAppStore.getState().logIntake("p1", entry({ date: "2026-09-02", kcal: 2500 }));
    expect(useAppStore.getState().intake["p1"]?.length).toBe(2);
  });

  it("replaces the entry for a date that is logged twice", () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().logIntake("p1", entry());
    useAppStore.getState().logIntake("p1", entry({ kcal: 2600, proteinG: 175 }));
    const list = useAppStore.getState().intake["p1"] ?? [];
    expect(list.length).toBe(1);
    expect(list[0]).toEqual({ profileId: "p1", date: "2026-09-01", kcal: 2600, proteinG: 175 });
  });
});

describe("setAvailability", () => {
  it("stores slots and the weekly session target", () => {
    const availability: Availability = {
      slots: [
        { weekday: 1, startTime: "07:30", expectedDurationS: 3600 }, // seconds
        { weekday: 4, startTime: "07:30", expectedDurationS: 3600 },
      ],
      weeklySessionTarget: 2,
    };
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().setAvailability("p1", availability);
    expect(useAppStore.getState().availability["p1"]).toEqual(availability);
  });
});

describe("latestBodyMassEntry", () => {
  const bm = (date: string, massKg: number, loggedAt: number): BodyMassEntry => ({
    id: `bm-${date}`,
    profileId: "p1",
    date,
    massKg, // kg
    enteredUnit: "metric",
    bodyFatPct: null,
    loggedAt, // epoch ms
  });

  it("returns null when nothing has been logged", () => {
    useAppStore.getState().createProfile(profile());
    expect(latestBodyMassEntry(useAppStore.getState(), "p1")).toBeNull();
  });

  it("picks the newest civil date, breaking ties on loggedAt", () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.setState((s) => ({
      bodyMass: {
        ...s.bodyMass,
        p1: [bm("2026-09-01", 80, 10), bm("2026-09-08", 79, 20), bm("2026-09-08", 78.5, 30)],
      },
    }));
    expect(latestBodyMassEntry(useAppStore.getState(), "p1")?.massKg).toBe(78.5);
  });
});

describe("nutritionInputFor", () => {
  it("prefers the latest logged mass and body fat over the baseline", () => {
    const input = nutritionInputFor(
      profile({ body: { ...profile().body, baselineMassKg: 80, baselineBodyFatPct: 30 } }),
      {
        id: "x",
        profileId: "p1",
        date: "2026-09-08",
        massKg: 76,
        enteredUnit: "metric",
        bodyFatPct: 24,
        loggedAt: 1,
      },
      4,
      "2026-09-08",
    );
    expect(input.massKg).toBe(76);
    expect(input.bodyFatPct).toBe(24);
    expect(input.ageYears).toBe(30); // 2026 - 1996
    expect(input.sessionsPerWeek).toBe(4);
  });

  it("falls back to the profile baseline when nothing is logged", () => {
    const input = nutritionInputFor(profile(), null, 3, "2026-09-01");
    expect(input.massKg).toBe(80);
    expect(input.bodyFatPct).toBeNull();
  });
});

describe("useNutritionTargets", () => {
  it("returns null with no active profile", () => {
    const { result } = renderHook(() => useNutritionTargets());
    expect(result.current).toBeNull();
  });

  it("computes from the active profile and keeps the same object across re-renders", () => {
    useAppStore.getState().createProfile(profile());
    const { result, rerender } = renderHook(() => useNutritionTargets());
    const first = result.current;
    expect(first?.rmrKcal).toBe(1780); // 10*80 + 6.25*180 - 5*30 + 5
    expect(first?.targetKcal).toBe(2572); // 1780 * 1.70 * 0.85
    rerender();
    expect(result.current).toBe(first); // memoised: same reference, no recomputation
  });

  it("recomputes when the profile changes", () => {
    useAppStore.getState().createProfile(profile());
    const { result } = renderHook(() => useNutritionTargets());
    const before = result.current;
    act(() => {
      useAppStore.getState().updateProfile("p1", { activity: "sedentary" });
    });
    expect(result.current).not.toBe(before);
    expect(result.current?.tdeeKcal).toBe(2492); // 1780 * 1.40
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/store/profile.test.ts`
Expected: FAIL — `createProfile is not a function`.

- [ ] **Step 3: Add the actions to `src/store/index.ts`**

Add to the `AppActions` interface, under the existing `// P2` comment (the master plan §6.7 already declares four of these; `setAvailability` moves here from P3 because the wizard collects it):

```ts
  // P2
  createProfile(p: Profile): void;
  updateProfile(id: string, patch: Partial<Profile>): void;
  setPlan(profileId: string, plan: PlanTemplate, startedOn: LocalDate): void;
  logIntake(profileId: string, entry: IntakeEntry): void;
  setAvailability(profileId: string, a: Availability): void;
```

Add to the store creator, alongside the P1 actions:

```ts
  createProfile: (p) =>
    set((s) => ({
      profiles: { ...s.profiles, [p.id]: p },
      activeProfileId: s.activeProfileId ?? p.id,
      // Seed the profile-keyed log arrays so no later action has to guard against undefined.
      pauses: { ...s.pauses, [p.id]: s.pauses[p.id] ?? [] },
      assignments: { ...s.assignments, [p.id]: s.assignments[p.id] ?? [] },
      bodyMass: { ...s.bodyMass, [p.id]: s.bodyMass[p.id] ?? [] },
      hydration: { ...s.hydration, [p.id]: s.hydration[p.id] ?? [] },
      intake: { ...s.intake, [p.id]: s.intake[p.id] ?? [] },
      weeklyReviews: { ...s.weeklyReviews, [p.id]: s.weeklyReviews[p.id] ?? [] },
    })),

  updateProfile: (id, patch) =>
    set((s) => {
      const current = s.profiles[id];
      if (!current) return {};
      return { profiles: { ...s.profiles, [id]: { ...current, ...patch } } };
    }),

  setPlan: (profileId, plan, startedOn) =>
    set((s) => ({
      plans: { ...s.plans, [plan.id]: plan },
      cursors: {
        ...s.cursors,
        [profileId]: { planId: plan.id, nextSessionIndex: 0, startedOn, completedOn: null },
      },
    })),

  logIntake: (profileId, entry) =>
    set((s) => {
      const list = s.intake[profileId] ?? [];
      // One entry per civil date: a second entry for the same date replaces the first.
      const next = [...list.filter((e) => e.date !== entry.date), entry].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
      );
      return { intake: { ...s.intake, [profileId]: next } };
    }),

  setAvailability: (profileId, a) =>
    set((s) => ({ availability: { ...s.availability, [profileId]: a } })),
```

- [ ] **Step 4: Add the selectors to `src/store/selectors.ts`**

```ts
import { useMemo } from "react";
import { computeTargets, type NutritionInput, type NutritionTargets } from "../domain/nutrition";
import { todayLocal } from "../domain/dates";
import type { AppState, BodyMassEntry, LocalDate, Profile } from "../domain/types";
import { useAppStore } from "./index";

/** Newest body-mass entry by civil date, ties broken by the instant it was logged. */
export function latestBodyMassEntry(state: AppState, profileId: string): BodyMassEntry | null {
  const list = state.bodyMass[profileId] ?? [];
  let best: BodyMassEntry | null = null;
  for (const e of list) {
    if (best === null) {
      best = e;
      continue;
    }
    if (e.date > best.date || (e.date === best.date && e.loggedAt > best.loggedAt)) best = e;
  }
  return best;
}

/**
 * Assemble the nutrition input from stored state. The latest logged body mass and body fat
 * win over the profile baseline, which is the content review §1 instruction: "Recompute the
 * target at each body-mass re-measure; do not hard-code."
 */
export function nutritionInputFor(
  profile: Profile,
  latest: BodyMassEntry | null,
  sessionsPerWeek: number,
  todayIso: LocalDate,
): NutritionInput {
  const massKg = latest?.massKg ?? profile.body.baselineMassKg; // kg
  const bodyFatPct = latest?.bodyFatPct ?? profile.body.baselineBodyFatPct; // percent or null
  // Age in whole years from the birth year in the profile's own zone. A birthday during a
  // session does not retrigger this: it is recomputed on the next profile or body-mass change.
  const ageYears = Number(todayIso.slice(0, 4)) - profile.body.birthYear; // years
  return {
    sex: profile.body.sex,
    ageYears,
    heightCm: profile.body.heightCm, // cm
    massKg,
    bodyFatPct,
    activity: profile.activity,
    goal: profile.goal.kind,
    sessionsPerWeek,
    creatine: profile.supplements.creatine,
  };
}

/** Memoised targets for the active profile; null when there is no active profile. */
export function useNutritionTargets(): NutritionTargets | null {
  const profile = useAppStore((s) => (s.activeProfileId ? s.profiles[s.activeProfileId] : undefined));
  const latest = useAppStore((s) =>
    s.activeProfileId ? latestBodyMassEntry(s, s.activeProfileId) : null,
  );
  const sessionsPerWeek = useAppStore((s) =>
    s.activeProfileId ? (s.availability[s.activeProfileId]?.weeklySessionTarget ?? 0) : 0,
  );
  return useMemo(() => {
    if (!profile) return null;
    return computeTargets(
      nutritionInputFor(profile, latest, sessionsPerWeek, todayLocal(profile.timezone)),
    );
  }, [profile, latest, sessionsPerWeek]);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/store/profile.test.ts`
Expected: PASS — 16 tests passed.

- [ ] **Step 6: Run the whole suite and lint**

Run: `npx tsc --noEmit && npx eslint src/store && npm test`
Expected: no lint output; every suite green.

- [ ] **Step 7: Commit**

```bash
git add src/store/index.ts src/store/selectors.ts src/store/profile.test.ts
git commit -m "feat: profile, plan, intake and availability actions with a memoised targets selector"
```

---

## Task 7: Setup wizard (`src/ui/setup/SetupWizard.tsx`)

**Files:**
- Create: `src/ui/setup/SetupWizard.tsx`
- Create: `src/ui/setup/setup.css`
- Create: `src/ui/setup/SetupWizard.test.tsx`

**Interfaces:**
- Consumes: `src/domain/units.ts` (`toStoredMass`, `displayMass`, `formatVolume`, `UNIT_LABEL`), `src/domain/dates.ts` (`deviceTimeZone`, `isValidTimeZone`, `todayLocal`), `src/domain/ids.ts` (`newId`), `src/domain/nutrition.ts` (`computeTargets`, `dailyBeverageTargetML`), `src/domain/bodyfat.ts` (`estimateBodyFatNavy`, `NAVY_SEE_PCT`, `NAVY_SITE_LABEL`), `src/domain/plan/library.ts` (`EXERCISES`), `src/domain/plan/generator.ts` (`generatePlan`, `volumeReport`, `PLAN_WEEKS_MIN`, `PLAN_WEEKS_MAX`), `src/store/index.ts` (`createProfile`, `setAvailability`, `setPlan`).
- Produces: `export function SetupWizard(): JSX.Element` — used by Task 8's `App.tsx` when `activeProfileId === null`.

**Screen order (units first, because every later field is labelled in the chosen unit):**

| # | Screen | Collects |
|---|---|---|
| 1 | Units | `metric` / `imperial` |
| 2 | Time zone | auto-detected via `deviceTimeZone()`, confirmed or overridden |
| 3 | Body | display name, sex, birth year, height (cm, or ft + in), body mass, optional body fat: none / known % / tape measurements → Navy estimate |
| 4 | Training context | activity level, experience, equipment, equipment steps seeded from `DEFAULT_*_STEP` in the chosen unit, micro-plate toggle |
| 5 | Goal | goal kind, optional target mass and target date, creatine toggle |
| 6 | Availability | sessions per week, which weekdays, start time and expected duration per selected day, weekly session target |
| 7 | Programme length | 8–24 weeks, conditioning toggle |
| 8 | Review | computed targets and the generated split summary; confirm writes the profile, availability and plan |

**Copy rules for this screen set:** clinical and formal; no emoji; no motivational filler. The body-fat estimate is always shown with its standard error and the sentence "Use it to track change over time, not as an absolute number" (content review §5, Potter 2022 `10.3389/fphys.2022.868627`). **No medication, biometric-identifier or location field exists anywhere in this wizard by design** — `Profile.supplements` has exactly one member, `creatine`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/setup/SetupWizard.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupWizard } from "./SetupWizard";
import { useAppStore } from "../../store/index";

const MEDICAL_PATTERN = /vyvanse|lisdexamfetamine|medicat|prescription|drug|dose of|stimulant/i;

beforeEach(() => {
  useAppStore.getState().wipeAll();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Click the primary Continue control. */
function next(): void {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

function setValue(label: RegExp | string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Drive screens 1-7 with an imperial profile, leaving the review screen on show. */
function fillImperialWizard(): void {
  render(<SetupWizard />);
  // 1 — units
  fireEvent.click(screen.getByLabelText("Pounds (lb)"));
  next();
  // 2 — time zone
  setValue(/time zone/i, "America/New_York");
  next();
  // 3 — body
  setValue(/name/i, "Test subject");
  fireEvent.click(screen.getByLabelText("Male"));
  setValue(/birth year/i, "1996");
  setValue(/feet/i, "5");
  setValue(/inches/i, "11");
  setValue(/body mass \(lb\)/i, "210");
  next();
  // 4 — training context
  setValue(/activity level/i, "moderate");
  setValue(/experience/i, "intermediate");
  setValue(/equipment/i, "full-gym");
  next();
  // 5 — goal
  setValue(/goal/i, "fat-loss");
  next();
  // 6 — availability
  setValue(/sessions per week/i, "4");
  for (const day of ["Monday", "Tuesday", "Thursday", "Friday"]) {
    fireEvent.click(screen.getByLabelText(day));
  }
  next();
  // 7 — programme length
  setValue(/programme length/i, "12");
  next();
}

describe("unit labelling", () => {
  it("labels body mass in kg for a metric user and lb for an imperial one", () => {
    const { unmount } = render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText("Kilograms (kg)"));
    next();
    next(); // accept the detected time zone
    expect(screen.getByLabelText(/body mass \(kg\)/i)).toBeDefined();
    expect(screen.getByLabelText(/height \(cm\)/i)).toBeDefined();
    unmount();

    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText("Pounds (lb)"));
    next();
    next();
    expect(screen.getByLabelText(/body mass \(lb\)/i)).toBeDefined();
    expect(screen.getByLabelText(/feet/i)).toBeDefined();
    expect(screen.getByLabelText(/inches/i)).toBeDefined();
  });

  it("seeds the equipment steps in the chosen unit", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText("Pounds (lb)"));
    next();
    next();
    setValue(/birth year/i, "1996");
    setValue(/feet/i, "5");
    setValue(/inches/i, "11");
    setValue(/body mass \(lb\)/i, "210");
    next();
    expect(screen.getByLabelText(/barbell step \(lb\)/i)).toHaveProperty("value", "5");
    expect(screen.getByLabelText(/dumbbell step \(lb\)/i)).toHaveProperty("value", "10");
  });
});

describe("review screen", () => {
  it("shows the computed targets in the user's units", () => {
    fillImperialWizard();
    const review = screen.getByTestId("review");
    // Mifflin-St Jeor: 10*95.2543977 + 6.25*180.34 - 5*30 + 5 = 1934.669 -> 1935 kcal/day
    // TDEE at PAL 1.70 = 3288.94 -> 3289 kcal/day; fat-loss target = x0.85 -> 2796 kcal/day
    expect(within(review).getByTestId("target-kcal").textContent).toContain("2796");
    // Protein, maintenance body-mass row (no body-fat estimate): 1.4-2.0 g/kg of 95.2543977 kg
    expect(within(review).getByTestId("target-protein").textContent).toContain("133");
    expect(within(review).getByTestId("target-protein").textContent).toContain("191");
    // Fluid: IOM beverage share 3000 mL -> 101 fl oz
    expect(within(review).getByTestId("target-fluid").textContent).toContain("101 fl oz");
    // Rate: -0.7 %BW/week of 95.2543977 kg = -0.6668 kg/week = -1.47 lb -> -1.5 lb/week
    expect(within(review).getByTestId("target-rate").textContent).toContain("-1.5 lb/week");
    // Split summary
    expect(within(review).getByTestId("split-summary").textContent).toContain("Upper / Lower x2");
    expect(within(review).getByTestId("split-summary").textContent).toContain("48 sessions");
  });

  it("names the maintenance-only muscle groups instead of hiding them", () => {
    fillImperialWizard();
    const summary = screen.getByTestId("split-summary").textContent ?? "";
    expect(summary).toContain("Maintenance only");
    expect(summary).toContain("rear-delt");
  });
});

describe("submission", () => {
  it("converts imperial entries exactly and writes profile, availability and plan", () => {
    fillImperialWizard();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and start" }));

    const state = useAppStore.getState();
    const id = state.activeProfileId;
    expect(id).not.toBeNull();
    if (!id) return;
    const p = state.profiles[id];
    expect(p).toBeDefined();
    if (!p) return;

    expect(p.units).toBe("imperial");
    expect(p.timezone).toBe("America/New_York");
    expect(p.body.sex).toBe("male");
    expect(p.body.birthYear).toBe(1996);
    // 5 ft 11 in = 71 in x 2.54 cm/in = 180.34 cm exactly
    expect(p.body.heightCm).toBeCloseTo(180.34, 10);
    // 210 lb x 0.45359237 kg/lb = 95.2543977 kg exactly
    expect(p.body.baselineMassKg).toBeCloseTo(95.2543977, 10);
    expect(p.body.baselineBodyFatPct).toBeNull();
    // Steps are stored canonically in kg: 5 lb = 2.26796185 kg, 10 lb = 4.5359237 kg
    expect(p.equipmentSteps.barbellKg).toBeCloseTo(2.26796185, 10);
    expect(p.equipmentSteps.dumbbellPairKg).toBeCloseTo(4.5359237, 10);
    expect(p.equipmentSteps.hasMicroPlates).toBe(false);
    // Hydration seeded from the IOM beverage share for the stated sex
    expect(p.hydration.dailyTargetML).toBe(3000);
    expect(p.supplements).toEqual({ creatine: false });

    const availability = state.availability[id];
    expect(availability?.slots.map((s) => s.weekday)).toEqual([1, 2, 4, 5]);
    expect(availability?.weeklySessionTarget).toBe(4);

    const cursor = state.cursors[id];
    expect(cursor?.nextSessionIndex).toBe(0);
    expect(cursor?.startedOn).toBe("2026-09-01"); // todayLocal in America/New_York
    const plan = cursor ? state.plans[cursor.planId] : undefined;
    expect(plan?.sessions.length).toBe(48); // 12 weeks x 4 sessions
  });

  it("stores a metric entry with no conversion", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText("Kilograms (kg)"));
    next();
    next();
    setValue(/name/i, "Metric subject");
    fireEvent.click(screen.getByLabelText("Female"));
    setValue(/birth year/i, "2000");
    setValue(/height \(cm\)/i, "165");
    setValue(/body mass \(kg\)/i, "62.5");
    next();
    next();
    next();
    setValue(/sessions per week/i, "3");
    for (const day of ["Monday", "Wednesday", "Friday"]) {
      fireEvent.click(screen.getByLabelText(day));
    }
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and start" }));

    const state = useAppStore.getState();
    const id = state.activeProfileId ?? "";
    expect(state.profiles[id]?.body.baselineMassKg).toBe(62.5);
    expect(state.profiles[id]?.body.heightCm).toBe(165);
    expect(state.profiles[id]?.hydration.dailyTargetML).toBe(2200); // female beverage share
  });
});

describe("body fat by tape measure", () => {
  it("computes the Navy estimate and shows its standard error", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText("Kilograms (kg)"));
    next();
    next();
    setValue(/birth year/i, "1996");
    setValue(/height \(cm\)/i, "180");
    setValue(/body mass \(kg\)/i, "95.3");
    fireEvent.click(screen.getByLabelText("Estimate from tape measurements"));
    setValue(/neck/i, "40");
    setValue(/abdomen ii/i, "95");
    const estimate = screen.getByTestId("bodyfat-estimate").textContent ?? "";
    expect(estimate).toContain("21.9");
    expect(estimate).toContain("3.52");
    expect(estimate).toMatch(/track change over time/i);
  });

  it("asks a female user for the hip girth and withholds the estimate until it is given", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText("Kilograms (kg)"));
    next();
    next();
    fireEvent.click(screen.getByLabelText("Female"));
    setValue(/birth year/i, "1996");
    setValue(/height \(cm\)/i, "165");
    setValue(/body mass \(kg\)/i, "62.5");
    fireEvent.click(screen.getByLabelText("Estimate from tape measurements"));
    setValue(/neck/i, "32");
    setValue(/abdomen i\b/i, "75");
    expect(screen.getByTestId("bodyfat-estimate").textContent).toMatch(/hip/i);
    setValue(/hip/i, "95");
    expect(screen.getByTestId("bodyfat-estimate").textContent).toContain("27.4");
  });
});

describe("no medication field exists", () => {
  /** Minimum entry needed to pass each screen's Continue guard. */
  function unblock(screenIndex: number): void {
    if (screenIndex === 2) {
      setValue(/birth year/i, "1996");
      setValue(/height \(cm\)/i, "180");
      setValue(/body mass \(kg\)/i, "80");
    }
    if (screenIndex === 5) fireEvent.click(screen.getByLabelText("Monday"));
  }

  it("shows no medication input or copy on any screen", () => {
    render(<SetupWizard />);
    for (let screenIndex = 0; screenIndex < 8; screenIndex += 1) {
      unblock(screenIndex);
      for (const field of [...screen.queryAllByRole("textbox"), ...screen.queryAllByRole("spinbutton")]) {
        expect(field.getAttribute("aria-label") ?? "").not.toMatch(MEDICAL_PATTERN);
      }
      expect(document.body.textContent ?? "").not.toMatch(MEDICAL_PATTERN);
      const continueButton = screen.queryByRole("button", { name: "Continue" });
      if (!continueButton) break;
      fireEvent.click(continueButton);
    }
    expect(screen.getByTestId("review")).toBeDefined();
  });

  it("offers exactly one supplement toggle, creatine", () => {
    render(<SetupWizard />);
    next();
    next();
    setValue(/birth year/i, "1996");
    setValue(/height \(cm\)/i, "180");
    setValue(/body mass \(kg\)/i, "80");
    next();
    next();
    const toggles = screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label") ?? "");
    expect(toggles.filter((t) => /creatine/i.test(t)).length).toBe(1);
    expect(toggles.filter((t) => MEDICAL_PATTERN.test(t)).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/setup/SetupWizard.test.tsx`
Expected: FAIL — `Failed to resolve import "./SetupWizard"`.

- [ ] **Step 3: Write the stylesheet**

Create `src/ui/setup/setup.css`. Every custom property carries a literal fallback so the wizard renders correctly whatever the P1 token names turn out to be:

```css
.wiz {
  max-width: 34rem;
  margin: 0 auto;
  padding: 1rem 1rem 4rem;
  color: var(--fg, #cfe8cf);
  background: var(--bg, #0b0f0b);
  font-family: var(--font-mono, ui-monospace, monospace);
  line-height: 1.5;
}
.wiz h1 { font-size: 1.1rem; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 0.25rem; }
.wiz .wiz-step { font-size: 0.8rem; opacity: 0.7; margin: 0 0 1.25rem; }
.wiz fieldset { border: 1px solid var(--line, #2c452c); margin: 0 0 1rem; padding: 0.75rem; }
.wiz legend { padding: 0 0.4rem; font-size: 0.8rem; letter-spacing: 0.06em; }
.wiz label { display: block; margin: 0 0 0.75rem; font-size: 0.9rem; }
.wiz label.wiz-inline { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
.wiz input[type="text"], .wiz input[type="number"], .wiz input[type="time"], .wiz select {
  display: block;
  width: 100%;
  min-height: 2.75rem; /* phone-first: a comfortable touch target */
  margin-top: 0.25rem;
  padding: 0.4rem 0.5rem;
  color: inherit;
  background: var(--bg-raised, #121a12);
  border: 1px solid var(--line, #2c452c);
  font: inherit;
}
.wiz .wiz-row { display: flex; gap: 0.75rem; }
.wiz .wiz-row > * { flex: 1 1 0; }
.wiz .wiz-nav { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
.wiz button { flex: 1 1 0; min-height: 3rem; color: inherit; background: var(--bg-raised, #121a12); border: 1px solid var(--accent, #7dd37d); font: inherit; letter-spacing: 0.06em; }
.wiz button[disabled] { opacity: 0.45; }
.wiz .wiz-note { font-size: 0.8rem; opacity: 0.8; margin: 0.25rem 0 0.75rem; }
.wiz .wiz-figure { font-size: 1.4rem; }
.wiz dl { display: grid; grid-template-columns: 1fr auto; gap: 0.35rem 1rem; margin: 0 0 1rem; }
.wiz dt { opacity: 0.8; }
.wiz dd { margin: 0; text-align: right; }
@media (max-width: 24rem) { .wiz .wiz-row { flex-direction: column; } }
```

- [ ] **Step 4: Write the wizard**

Create `src/ui/setup/SetupWizard.tsx`:

```tsx
import { useMemo, useState, type JSX } from "react";
import "./setup.css";
import { estimateBodyFatNavy, NAVY_SEE_PCT, NAVY_SITE_LABEL } from "../../domain/bodyfat";
import { deviceTimeZone, isValidTimeZone, todayLocal } from "../../domain/dates";
import { newId } from "../../domain/ids";
import { computeTargets, dailyBeverageTargetML } from "../../domain/nutrition";
import { EXERCISES } from "../../domain/plan/library";
import {
  generatePlan,
  PLAN_WEEKS_MAX,
  PLAN_WEEKS_MIN,
  volumeReport,
} from "../../domain/plan/generator";
import { SPLIT_TEMPLATES, type SessionsPerWeek } from "../../domain/plan/templates";
import {
  DEFAULT_BARBELL_STEP,
  DEFAULT_DUMBBELL_STEP,
  DEFAULT_STACK_STEP,
  type ActivityLevel,
  type Availability,
  type Equipment,
  type Experience,
  type GoalKind,
  type IsoWeekday,
  type Profile,
  type Sex,
  type UnitSystem,
} from "../../domain/types";
import { displayMass, formatVolume, toStoredMass, UNIT_LABEL } from "../../domain/units";
import { useAppStore } from "../../store/index";

const CM_PER_INCH = 2.54; // exact by definition
const INCHES_PER_FOOT = 12;
const DEFAULT_SESSION_DURATION_MIN = 60; // minutes
const DEFAULT_CUP_ML = 250; // mL — display granularity only, not a physiological figure

const WEEKDAYS: { value: IsoWeekday; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Sedentary — desk work, little walking" },
  { value: "light", label: "Light — some walking or standing" },
  { value: "moderate", label: "Moderate — regular walking, active job or training" },
  { value: "active", label: "Active — physical work or daily training" },
  { value: "very-active", label: "Very active — heavy physical work" },
];

interface DaySlot {
  enabled: boolean;
  startTime: string; // "HH:mm"
  durationMin: string; // minutes, as typed
}

interface Draft {
  units: UnitSystem;
  timezone: string;
  displayName: string;
  sex: Sex;
  birthYear: string;
  heightCm: string; // metric entry
  heightFt: string; // imperial entry
  heightIn: string; // imperial entry
  mass: string; // in the chosen unit, as typed
  bodyFatMode: "none" | "known" | "tape";
  bodyFatPct: string; // percent, as typed
  neck: string; // cm
  waist: string; // cm
  hip: string; // cm
  activity: ActivityLevel;
  experience: Experience;
  equipment: Equipment;
  barbellStep: string; // in the chosen unit
  dumbbellStep: string; // in the chosen unit
  stackStep: string; // in the chosen unit
  hasMicroPlates: boolean;
  goalKind: GoalKind;
  targetMass: string; // in the chosen unit
  targetDate: string; // "YYYY-MM-DD"
  creatine: boolean;
  sessionsPerWeek: SessionsPerWeek;
  days: Record<IsoWeekday, DaySlot>;
  weeklySessionTarget: string;
  weeks: string;
  includeCardio: boolean;
}

const defaultDay = (): DaySlot => ({
  enabled: false,
  startTime: "07:30",
  durationMin: String(DEFAULT_SESSION_DURATION_MIN),
});

function initialDraft(): Draft {
  const days: Record<IsoWeekday, DaySlot> = {
    1: defaultDay(),
    2: defaultDay(),
    3: defaultDay(),
    4: defaultDay(),
    5: defaultDay(),
    6: defaultDay(),
    7: defaultDay(),
  };
  return {
    units: "metric",
    timezone: deviceTimeZone(),
    displayName: "",
    sex: "male",
    birthYear: "",
    heightCm: "",
    heightFt: "",
    heightIn: "",
    mass: "",
    bodyFatMode: "none",
    bodyFatPct: "",
    neck: "",
    waist: "",
    hip: "",
    activity: "moderate",
    experience: "novice",
    equipment: "full-gym",
    barbellStep: String(DEFAULT_BARBELL_STEP.metric),
    dumbbellStep: String(DEFAULT_DUMBBELL_STEP.metric),
    stackStep: String(DEFAULT_STACK_STEP.metric),
    hasMicroPlates: false,
    goalKind: "fat-loss",
    targetMass: "",
    targetDate: "",
    creatine: false,
    sessionsPerWeek: 4,
    days,
    weeklySessionTarget: "4",
    weeks: "12",
    includeCardio: false,
  };
}

/** Parse a <select> value against its closed option list without an `as` cast. */
const ACTIVITY_VALUES = ["sedentary", "light", "moderate", "active", "very-active"] as const;
const EXPERIENCE_VALUES = ["novice", "intermediate", "advanced"] as const;
const EQUIPMENT_VALUES = ["full-gym", "dumbbells-only", "bodyweight"] as const;
const GOAL_VALUES = ["fat-loss", "muscle-gain", "recomposition", "maintenance"] as const;

const toActivity = (v: string): ActivityLevel => ACTIVITY_VALUES.find((x) => x === v) ?? "moderate";
const toExperience = (v: string): Experience => EXPERIENCE_VALUES.find((x) => x === v) ?? "novice";
const toEquipment = (v: string): Equipment => EQUIPMENT_VALUES.find((x) => x === v) ?? "full-gym";
const toGoal = (v: string): GoalKind => GOAL_VALUES.find((x) => x === v) ?? "fat-loss";

function num(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Height in cm. Imperial entry converts exactly: 1 in = 2.54 cm by definition. */
function heightCmOf(d: Draft): number | null {
  if (d.units === "metric") return num(d.heightCm);
  const ft = num(d.heightFt) ?? 0;
  const inches = num(d.heightIn) ?? 0;
  if (ft === 0 && inches === 0) return null;
  return (ft * INCHES_PER_FOOT + inches) * CM_PER_INCH; // cm
}

/** Body fat percentage from whichever method the user chose, or null. */
function bodyFatOf(d: Draft): number | null {
  if (d.bodyFatMode === "known") return num(d.bodyFatPct);
  if (d.bodyFatMode !== "tape") return null;
  const heightCm = heightCmOf(d);
  const neckCm = num(d.neck);
  const waistCm = num(d.waist);
  const hipCm = num(d.hip);
  if (heightCm === null || neckCm === null || waistCm === null) return null;
  return estimateBodyFatNavy({ sex: d.sex, heightCm, neckCm, waistCm, hipCm });
}

const SCREEN_TITLES = [
  "Units",
  "Time zone",
  "Body",
  "Training context",
  "Goal",
  "Availability",
  "Programme length",
  "Review",
];

export function SetupWizard(): JSX.Element {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [screen, setScreen] = useState(0);
  const createProfile = useAppStore((s) => s.createProfile);
  const setAvailability = useAppStore((s) => s.setAvailability);
  const setPlan = useAppStore((s) => s.setPlan);

  const patch = (p: Partial<Draft>): void => setDraft((d) => ({ ...d, ...p }));

  /** Switching unit re-seeds the equipment steps in the new unit. */
  const setUnits = (units: UnitSystem): void =>
    patch({
      units,
      barbellStep: String(DEFAULT_BARBELL_STEP[units]),
      dumbbellStep: String(DEFAULT_DUMBBELL_STEP[units]),
      stackStep: String(DEFAULT_STACK_STEP[units]),
    });

  const labels = UNIT_LABEL[draft.units];
  const heightCm = heightCmOf(draft);
  const massKg = useMemo(() => {
    const entered = num(draft.mass);
    return entered === null ? null : toStoredMass(entered, draft.units); // kg
  }, [draft.mass, draft.units]);
  const bodyFatPct = bodyFatOf(draft);

  const targets = useMemo(() => {
    const birthYear = num(draft.birthYear);
    if (massKg === null || heightCm === null || birthYear === null) return null;
    const ageYears = Number(todayLocal(draft.timezone).slice(0, 4)) - birthYear; // years
    if (ageYears <= 0) return null;
    return computeTargets({
      sex: draft.sex,
      ageYears,
      heightCm,
      massKg,
      bodyFatPct,
      activity: draft.activity,
      goal: draft.goalKind,
      sessionsPerWeek: num(draft.weeklySessionTarget) ?? draft.sessionsPerWeek,
      creatine: draft.creatine,
    });
  }, [
    draft.activity,
    draft.birthYear,
    draft.creatine,
    draft.goalKind,
    draft.sex,
    draft.timezone,
    draft.weeklySessionTarget,
    bodyFatPct,
    heightCm,
    massKg,
  ]);

  const weeks = Math.min(PLAN_WEEKS_MAX, Math.max(PLAN_WEEKS_MIN, num(draft.weeks) ?? 12));
  const plan = useMemo(
    () =>
      generatePlan(
        {
          sessionsPerWeek: draft.sessionsPerWeek,
          weeks,
          goal: draft.goalKind,
          experience: draft.experience,
          equipment: draft.equipment,
          includeCardio: draft.includeCardio,
        },
        EXERCISES,
      ),
    [draft.sessionsPerWeek, draft.equipment, draft.experience, draft.goalKind, draft.includeCardio, weeks],
  );
  const volume = useMemo(() => volumeReport(plan, EXERCISES), [plan]);

  const canContinue = (): boolean => {
    if (screen === 1) return isValidTimeZone(draft.timezone);
    if (screen === 2) return massKg !== null && heightCm !== null && num(draft.birthYear) !== null;
    if (screen === 5) return WEEKDAYS.some((d) => draft.days[d.value].enabled);
    return true;
  };

  const confirm = (): void => {
    if (massKg === null || heightCm === null) return;
    const birthYear = num(draft.birthYear);
    if (birthYear === null) return;
    const today = todayLocal(draft.timezone);
    const targetMass = num(draft.targetMass);
    const profileId = newId();
    const profile: Profile = {
      id: profileId,
      displayName: draft.displayName.trim() === "" ? "Operator" : draft.displayName.trim(),
      timezone: draft.timezone,
      units: draft.units,
      createdAt: Date.now(), // epoch ms
      body: {
        sex: draft.sex,
        birthYear,
        heightCm, // cm
        baselineMassKg: massKg, // kg
        baselineAt: today,
        baselineBodyFatPct: bodyFatPct,
      },
      activity: draft.activity,
      experience: draft.experience,
      equipment: draft.equipment,
      equipmentSteps: {
        // Entered in the display unit; stored canonically in kg.
        barbellKg: toStoredMass(num(draft.barbellStep) ?? DEFAULT_BARBELL_STEP[draft.units], draft.units),
        dumbbellPairKg: toStoredMass(
          num(draft.dumbbellStep) ?? DEFAULT_DUMBBELL_STEP[draft.units],
          draft.units,
        ),
        stackKg: toStoredMass(num(draft.stackStep) ?? DEFAULT_STACK_STEP[draft.units], draft.units),
        hasMicroPlates: draft.hasMicroPlates,
      },
      goal: {
        kind: draft.goalKind,
        targetMassKg: targetMass === null ? null : toStoredMass(targetMass, draft.units), // kg
        targetBodyFatPct: null,
        targetDate: draft.targetDate === "" ? null : draft.targetDate,
      },
      supplements: { creatine: draft.creatine },
      hydration: {
        // IOM 2005 beverage share for the stated sex; editable afterwards in Settings.
        dailyTargetML: dailyBeverageTargetML(draft.sex),
        cupSizeML: DEFAULT_CUP_ML,
      },
    };

    const slots = WEEKDAYS.filter((d) => draft.days[d.value].enabled).map((d) => ({
      weekday: d.value,
      startTime: draft.days[d.value].startTime,
      expectedDurationS: (num(draft.days[d.value].durationMin) ?? DEFAULT_SESSION_DURATION_MIN) * 60, // s
    }));
    const requested = num(draft.weeklySessionTarget) ?? slots.length;
    const availability: Availability = {
      slots,
      weeklySessionTarget: Math.min(Math.max(1, Math.round(requested)), Math.max(1, slots.length)),
    };

    createProfile(profile);
    setAvailability(profileId, availability);
    setPlan(profileId, plan, today);
  };

  const signedRate = (): string => {
    if (!targets || targets.expectedRateKgPerWeek === null) {
      return "Not established by the evidence base";
    }
    const shown = displayMass(targets.expectedRateKgPerWeek, draft.units);
    const sign = shown < 0 ? "-" : "+";
    return `${sign}${Math.abs(shown).toFixed(1)} ${labels.mass}/week`;
  };

  return (
    <div className="wiz">
      <h1>Setup</h1>
      <p className="wiz-step">
        Step {screen + 1} of {SCREEN_TITLES.length} — {SCREEN_TITLES[screen]}
      </p>

      {screen === 0 && (
        <fieldset>
          <legend>Units</legend>
          <p className="wiz-note">
            Chosen once. Every field below is labelled in this unit; values are stored in
            kilograms and converted exactly.
          </p>
          <label className="wiz-inline">
            <input
              type="radio"
              name="units"
              aria-label="Kilograms (kg)"
              checked={draft.units === "metric"}
              onChange={() => setUnits("metric")}
            />
            Kilograms (kg)
          </label>
          <label className="wiz-inline">
            <input
              type="radio"
              name="units"
              aria-label="Pounds (lb)"
              checked={draft.units === "imperial"}
              onChange={() => setUnits("imperial")}
            />
            Pounds (lb)
          </label>
        </fieldset>
      )}

      {screen === 1 && (
        <fieldset>
          <legend>Time zone</legend>
          <p className="wiz-note">
            Detected from this device. Every date and reminder is computed in this zone.
          </p>
          <label>
            Time zone
            <input
              type="text"
              aria-label="Time zone"
              value={draft.timezone}
              onChange={(e) => patch({ timezone: e.target.value })}
            />
          </label>
          {!isValidTimeZone(draft.timezone) && (
            <p className="wiz-note">Not a recognised IANA time zone identifier.</p>
          )}
        </fieldset>
      )}

      {screen === 2 && (
        <fieldset>
          <legend>Body</legend>
          <label>
            Name
            <input
              type="text"
              aria-label="Name"
              value={draft.displayName}
              onChange={(e) => patch({ displayName: e.target.value })}
            />
          </label>
          <p className="wiz-note">
            Sex is collected because the resting-metabolic-rate equation, the body-fat equation
            and the fluid target each take a sex term. Nothing else in the app does.
          </p>
          <label className="wiz-inline">
            <input
              type="radio"
              name="sex"
              aria-label="Male"
              checked={draft.sex === "male"}
              onChange={() => patch({ sex: "male" })}
            />
            Male
          </label>
          <label className="wiz-inline">
            <input
              type="radio"
              name="sex"
              aria-label="Female"
              checked={draft.sex === "female"}
              onChange={() => patch({ sex: "female" })}
            />
            Female
          </label>
          <label>
            Birth year
            <input
              type="number"
              aria-label="Birth year"
              value={draft.birthYear}
              onChange={(e) => patch({ birthYear: e.target.value })}
            />
          </label>
          {draft.units === "metric" ? (
            <label>
              {`Height (cm)`}
              <input
                type="number"
                aria-label="Height (cm)"
                value={draft.heightCm}
                onChange={(e) => patch({ heightCm: e.target.value })}
              />
            </label>
          ) : (
            <div className="wiz-row">
              <label>
                Feet
                <input
                  type="number"
                  aria-label="Feet"
                  value={draft.heightFt}
                  onChange={(e) => patch({ heightFt: e.target.value })}
                />
              </label>
              <label>
                Inches
                <input
                  type="number"
                  aria-label="Inches"
                  value={draft.heightIn}
                  onChange={(e) => patch({ heightIn: e.target.value })}
                />
              </label>
            </div>
          )}
          <label>
            {`Body mass (${labels.mass})`}
            <input
              type="number"
              aria-label={`Body mass (${labels.mass})`}
              value={draft.mass}
              onChange={(e) => patch({ mass: e.target.value })}
            />
          </label>

          <p className="wiz-note">
            Body fat is optional. With it the engine uses the Cunningham fat-free-mass equation
            and sets protein per kilogram of fat-free mass; without it, Mifflin-St Jeor and
            protein per kilogram of body mass.
          </p>
          <label className="wiz-inline">
            <input
              type="radio"
              name="bf"
              aria-label="Not measured"
              checked={draft.bodyFatMode === "none"}
              onChange={() => patch({ bodyFatMode: "none" })}
            />
            Not measured
          </label>
          <label className="wiz-inline">
            <input
              type="radio"
              name="bf"
              aria-label="Known percentage"
              checked={draft.bodyFatMode === "known"}
              onChange={() => patch({ bodyFatMode: "known" })}
            />
            Known percentage
          </label>
          <label className="wiz-inline">
            <input
              type="radio"
              name="bf"
              aria-label="Estimate from tape measurements"
              checked={draft.bodyFatMode === "tape"}
              onChange={() => patch({ bodyFatMode: "tape" })}
            />
            Estimate from tape measurements
          </label>

          {draft.bodyFatMode === "known" && (
            <label>
              Body fat (%)
              <input
                type="number"
                aria-label="Body fat (%)"
                value={draft.bodyFatPct}
                onChange={(e) => patch({ bodyFatPct: e.target.value })}
              />
            </label>
          )}

          {draft.bodyFatMode === "tape" && (
            <>
              <p className="wiz-note">
                US Navy circumference method, metric form. All girths in centimetres, measured
                horizontally, tape snug but not compressing.
              </p>
              <label>
                Neck (cm)
                <input
                  type="number"
                  aria-label="Neck (cm)"
                  value={draft.neck}
                  onChange={(e) => patch({ neck: e.target.value })}
                />
              </label>
              <label>
                {draft.sex === "male" ? "Abdomen II (cm)" : "Abdomen I (cm)"}
                <input
                  type="number"
                  aria-label={draft.sex === "male" ? "Abdomen II (cm)" : "Abdomen I (cm)"}
                  value={draft.waist}
                  onChange={(e) => patch({ waist: e.target.value })}
                />
              </label>
              <p className="wiz-note">{NAVY_SITE_LABEL[draft.sex].waist}</p>
              {draft.sex === "female" && (
                <>
                  <label>
                    Hip (cm)
                    <input
                      type="number"
                      aria-label="Hip (cm)"
                      value={draft.hip}
                      onChange={(e) => patch({ hip: e.target.value })}
                    />
                  </label>
                  <p className="wiz-note">{NAVY_SITE_LABEL.female.hip}</p>
                </>
              )}
              <p className="wiz-note" data-testid="bodyfat-estimate">
                {bodyFatPct === null
                  ? draft.sex === "female"
                    ? "Enter neck, abdomen I and hip girths to estimate."
                    : "Enter neck and abdomen II girths to estimate."
                  : `${bodyFatPct.toFixed(1)} % body fat, standard error ${NAVY_SEE_PCT[
                      draft.sex
                    ].toFixed(2)} percentage points. Use it to track change over time, not as an absolute number.`}
              </p>
            </>
          )}
        </fieldset>
      )}

      {screen === 3 && (
        <fieldset>
          <legend>Training context</legend>
          <label>
            Activity level
            <select
              aria-label="Activity level"
              value={draft.activity}
              onChange={(e) => patch({ activity: toActivity(e.target.value) })}
            >
              {ACTIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Experience
            <select
              aria-label="Experience"
              value={draft.experience}
              onChange={(e) => patch({ experience: toExperience(e.target.value) })}
            >
              <option value="novice">Novice — under one year of consistent training</option>
              <option value="intermediate">Intermediate — one to three years</option>
              <option value="advanced">Advanced — over three years</option>
            </select>
          </label>
          <label>
            Equipment
            <select
              aria-label="Equipment"
              value={draft.equipment}
              onChange={(e) => patch({ equipment: toEquipment(e.target.value) })}
            >
              <option value="full-gym">Full gym</option>
              <option value="dumbbells-only">Dumbbells only</option>
              <option value="bodyweight">Bodyweight only</option>
            </select>
          </label>
          <p className="wiz-note">
            Load steps set the smallest increment a suggested load may use. Defaults are the
            common smallest plate pair.
          </p>
          <label>
            {`Barbell step (${labels.load})`}
            <input
              type="number"
              aria-label={`Barbell step (${labels.load})`}
              value={draft.barbellStep}
              onChange={(e) => patch({ barbellStep: e.target.value })}
            />
          </label>
          <label>
            {`Dumbbell step (${labels.load}, per pair)`}
            <input
              type="number"
              aria-label={`Dumbbell step (${labels.load}, per pair)`}
              value={draft.dumbbellStep}
              onChange={(e) => patch({ dumbbellStep: e.target.value })}
            />
          </label>
          <label>
            {`Weight-stack step (${labels.load})`}
            <input
              type="number"
              aria-label={`Weight-stack step (${labels.load})`}
              value={draft.stackStep}
              onChange={(e) => patch({ stackStep: e.target.value })}
            />
          </label>
          <label className="wiz-inline">
            <input
              type="checkbox"
              aria-label="Micro-plates available"
              checked={draft.hasMicroPlates}
              onChange={(e) => patch({ hasMicroPlates: e.target.checked })}
            />
            Micro-plates available
          </label>
        </fieldset>
      )}

      {screen === 4 && (
        <fieldset>
          <legend>Goal</legend>
          <label>
            Goal
            <select
              aria-label="Goal"
              value={draft.goalKind}
              onChange={(e) => patch({ goalKind: toGoal(e.target.value) })}
            >
              <option value="fat-loss">Fat loss</option>
              <option value="muscle-gain">Muscle gain</option>
              <option value="recomposition">Recomposition</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </label>
          <label>
            {`Target body mass (${labels.mass}, optional)`}
            <input
              type="number"
              aria-label={`Target body mass (${labels.mass}, optional)`}
              value={draft.targetMass}
              onChange={(e) => patch({ targetMass: e.target.value })}
            />
          </label>
          <label>
            Target date (optional)
            <input
              type="text"
              aria-label="Target date (optional)"
              placeholder="YYYY-MM-DD"
              value={draft.targetDate}
              onChange={(e) => patch({ targetDate: e.target.value })}
            />
          </label>
          <label className="wiz-inline">
            <input
              type="checkbox"
              aria-label="Creatine monohydrate"
              checked={draft.creatine}
              onChange={(e) => patch({ creatine: e.target.checked })}
            />
            Creatine monohydrate
          </label>
          <p className="wiz-note">
            The only supplement the app tracks. Maintenance dose is scaled by body mass.
          </p>
        </fieldset>
      )}

      {screen === 5 && (
        <fieldset>
          <legend>Availability</legend>
          <label>
            Sessions per week
            <select
              aria-label="Sessions per week"
              value={String(draft.sessionsPerWeek)}
              onChange={(e) => {
                const value = Number(e.target.value);
                const sessions: SessionsPerWeek =
                  value === 2 || value === 3 || value === 4 || value === 5 || value === 6
                    ? value
                    : 4;
                patch({ sessionsPerWeek: sessions, weeklySessionTarget: String(sessions) });
              }}
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <p className="wiz-note">{SPLIT_TEMPLATES[draft.sessionsPerWeek].note}</p>
          {WEEKDAYS.map((d) => (
            <div key={d.value}>
              <label className="wiz-inline">
                <input
                  type="checkbox"
                  aria-label={d.label}
                  checked={draft.days[d.value].enabled}
                  onChange={(e) =>
                    patch({
                      days: {
                        ...draft.days,
                        [d.value]: { ...draft.days[d.value], enabled: e.target.checked },
                      },
                    })
                  }
                />
                {d.label}
              </label>
              {draft.days[d.value].enabled && (
                <div className="wiz-row">
                  <label>
                    {`${d.label} start time`}
                    <input
                      type="time"
                      aria-label={`${d.label} start time`}
                      value={draft.days[d.value].startTime}
                      onChange={(e) =>
                        patch({
                          days: {
                            ...draft.days,
                            [d.value]: { ...draft.days[d.value], startTime: e.target.value },
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    {`${d.label} duration (minutes)`}
                    <input
                      type="number"
                      aria-label={`${d.label} duration (minutes)`}
                      value={draft.days[d.value].durationMin}
                      onChange={(e) =>
                        patch({
                          days: {
                            ...draft.days,
                            [d.value]: { ...draft.days[d.value], durationMin: e.target.value },
                          },
                        })
                      }
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
          <label>
            Weekly session target
            <input
              type="number"
              aria-label="Weekly session target"
              value={draft.weeklySessionTarget}
              onChange={(e) => patch({ weeklySessionTarget: e.target.value })}
            />
          </label>
        </fieldset>
      )}

      {screen === 6 && (
        <fieldset>
          <legend>Programme length</legend>
          <label>
            {`Programme length (weeks, ${PLAN_WEEKS_MIN}-${PLAN_WEEKS_MAX})`}
            <input
              type="number"
              aria-label={`Programme length (weeks, ${PLAN_WEEKS_MIN}-${PLAN_WEEKS_MAX})`}
              value={draft.weeks}
              onChange={(e) => patch({ weeks: e.target.value })}
            />
          </label>
          <p className="wiz-note">
            Every fourth week is a deload: set counts are halved and the load is unchanged.
          </p>
          <label className="wiz-inline">
            <input
              type="checkbox"
              aria-label="Add one conditioning block per week"
              checked={draft.includeCardio}
              onChange={(e) => patch({ includeCardio: e.target.checked })}
            />
            Add one conditioning block per week
          </label>
        </fieldset>
      )}

      {screen === 7 && (
        <div data-testid="review">
          <fieldset>
            <legend>Daily targets</legend>
            <dl>
              <dt>Energy</dt>
              <dd data-testid="target-kcal">{targets ? `${targets.targetKcal} kcal` : "—"}</dd>
              <dt>Protein</dt>
              <dd data-testid="target-protein">
                {targets ? `${targets.proteinG.lo}-${targets.proteinG.hi} g` : "—"}
              </dd>
              <dt>Fluid (beverages)</dt>
              <dd data-testid="target-fluid">
                {targets ? formatVolume(targets.fluidML, draft.units) : "—"}
              </dd>
              <dt>Expected rate</dt>
              <dd data-testid="target-rate">{signedRate()}</dd>
              {targets?.creatineG !== null && targets !== null && (
                <>
                  <dt>Creatine</dt>
                  <dd data-testid="target-creatine">{`${targets.creatineG} g`}</dd>
                </>
              )}
            </dl>
            <details>
              <summary>Basis</summary>
              <p className="wiz-note">{targets?.basis.proteinRule}</p>
              <p className="wiz-note">{targets?.basis.deficitRule}</p>
              <p className="wiz-note">{targets?.basis.rateRule}</p>
            </details>
          </fieldset>
          <fieldset>
            <legend>Programme</legend>
            <p data-testid="split-summary">
              {`${SPLIT_TEMPLATES[draft.sessionsPerWeek].name} · ${weeks} weeks · ${
                plan.sessions.length
              } sessions. In the target set range: ${volume.inBand.join(", ")}. Maintenance only: ${
                volume.maintenance.join(", ") || "none"
              }.`}
            </p>
            <p className="wiz-note">{SPLIT_TEMPLATES[draft.sessionsPerWeek].note}</p>
          </fieldset>
        </div>
      )}

      <div className="wiz-nav">
        {screen > 0 && (
          <button type="button" onClick={() => setScreen((n) => n - 1)}>
            Back
          </button>
        )}
        {screen < SCREEN_TITLES.length - 1 && (
          <button type="button" disabled={!canContinue()} onClick={() => setScreen((n) => n + 1)}>
            Continue
          </button>
        )}
        {screen === SCREEN_TITLES.length - 1 && (
          <button type="button" onClick={confirm}>
            Confirm and start
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/ui/setup/SetupWizard.test.tsx`
Expected: PASS — 10 tests passed.

- [ ] **Step 6: Lint and type-check**

Run: `npx tsc --noEmit && npx eslint src/ui/setup`
Expected: no output (exit 0).

- [ ] **Step 7: Commit**

```bash
git add src/ui/setup
git commit -m "feat: setup wizard collecting units, body, goal, equipment and availability"
```

---

## Task 8: Targets view, settings entry point and app wiring

**Files:**
- Create: `src/ui/components/AsciiBar.tsx`
- Create: `src/ui/views/TargetsView.tsx`
- Create: `src/ui/views/SettingsView.tsx`
- Create: `src/ui/views/TargetsView.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `useNutritionTargets()` and `latestBodyMassEntry` (Task 6), `logIntake` and `updateProfile` (Task 6), `todayLocal` (P1), `formatVolume`/`formatMass`/`displayMass`/`UNIT_LABEL` (P1), `SetupWizard` (Task 7).
- **P1 contract this task depends on:** `src/app/App.tsx` exports `function App(): JSX.Element` and renders a view switch over a `ViewId` union held in `useState`. This task replaces that skeleton with the version below; P3–P8 add their views to the same switch and the same `NAV` list.
- Produces:
  - `export function AsciiBar(props: { value: number; target: number; width?: number; label: string }): JSX.Element`
  - `export function asciiBar(value: number, target: number, width: number): string`
  - `export function TargetsView(): JSX.Element` — view id `"targets"`
  - `export function SettingsView(): JSX.Element` — view id `"settings"`

- [ ] **Step 1: Write the failing test**

Create `src/ui/views/TargetsView.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asciiBar } from "../components/AsciiBar";
import { TargetsView } from "./TargetsView";
import { useAppStore } from "../../store/index";
import type { Profile } from "../../domain/types";

const profile: Profile = {
  id: "p1",
  displayName: "Test subject",
  timezone: "Europe/Athens",
  units: "metric",
  createdAt: 1_756_684_800_000,
  body: {
    sex: "male",
    birthYear: 1996,
    heightCm: 180, // cm
    baselineMassKg: 80, // kg
    baselineAt: "2026-09-01",
    baselineBodyFatPct: null,
  },
  activity: "moderate",
  experience: "intermediate",
  equipment: "full-gym",
  equipmentSteps: { barbellKg: 2.5, dumbbellPairKg: 5, stackKg: 5, hasMicroPlates: false },
  goal: { kind: "fat-loss", targetMassKg: null, targetBodyFatPct: null, targetDate: null },
  supplements: { creatine: true },
  hydration: { dailyTargetML: 3000, cupSizeML: 250 },
};

beforeEach(() => {
  useAppStore.getState().wipeAll();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
  useAppStore.getState().createProfile(profile);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("asciiBar", () => {
  it("fills proportionally and clamps at both ends", () => {
    expect(asciiBar(0, 100, 10)).toBe("[----------]");
    expect(asciiBar(50, 100, 10)).toBe("[#####-----]");
    expect(asciiBar(100, 100, 10)).toBe("[##########]");
    expect(asciiBar(150, 100, 10)).toBe("[##########]");
    expect(asciiBar(-5, 100, 10)).toBe("[----------]");
  });

  it("returns an empty bar when the target is not positive", () => {
    expect(asciiBar(20, 0, 10)).toBe("[----------]");
  });
});

describe("TargetsView", () => {
  it("shows the computed targets with their units", () => {
    render(<TargetsView />);
    expect(screen.getByTestId("target-kcal").textContent).toContain("2572"); // 1780 x 1.70 x 0.85
    expect(screen.getByTestId("target-protein").textContent).toContain("112");
    expect(screen.getByTestId("target-protein").textContent).toContain("160");
    expect(screen.getByTestId("target-fluid").textContent).toContain("3000 mL");
    expect(screen.getByTestId("target-creatine").textContent).toContain("8 g");
    expect(screen.getByTestId("target-rate").textContent).toContain("-0.6 kg/week"); // -0.007 x 80
  });

  it("records a daily intake check-in and shows progress against the target", () => {
    render(<TargetsView />);
    fireEvent.change(screen.getByLabelText(/energy consumed today \(kcal\)/i), {
      target: { value: "1286" },
    });
    fireEvent.change(screen.getByLabelText(/protein consumed today \(g\)/i), {
      target: { value: "56" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record intake" }));

    const list = useAppStore.getState().intake["p1"] ?? [];
    expect(list).toEqual([{ profileId: "p1", date: "2026-09-01", kcal: 1286, proteinG: 56 }]);
    // 1286 of 2572 kcal is exactly half the target.
    expect(screen.getByTestId("kcal-bar").textContent).toBe("[##########----------]");
    // 56 g against the 112 g lower bound is also half.
    expect(screen.getByTestId("protein-bar").textContent).toBe("[##########----------]");
  });

  it("reloads today's entry into the form so a correction replaces it", () => {
    useAppStore
      .getState()
      .logIntake("p1", { profileId: "p1", date: "2026-09-01", kcal: 2000, proteinG: 140 });
    render(<TargetsView />);
    expect(screen.getByLabelText(/energy consumed today \(kcal\)/i)).toHaveProperty("value", "2000");
    fireEvent.change(screen.getByLabelText(/energy consumed today \(kcal\)/i), {
      target: { value: "2100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record intake" }));
    const list = useAppStore.getState().intake["p1"] ?? [];
    expect(list.length).toBe(1);
    expect(list[0]?.kcal).toBe(2100);
  });

  it("shows the basis for every number rather than presenting them as fact", () => {
    render(<TargetsView />);
    const basis = screen.getByTestId("basis").textContent ?? "";
    expect(basis).toContain("Mifflin-St Jeor");
    expect(basis).toContain("1.7");
    expect(basis).toMatch(/Garthe 2011/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/views/TargetsView.test.tsx`
Expected: FAIL — `Failed to resolve import "../components/AsciiBar"`.

- [ ] **Step 3: Write the ASCII bar**

Create `src/ui/components/AsciiBar.tsx`:

```tsx
import type { JSX } from "react";

const FILLED = "#";
const EMPTY = "-";

/** Pure bar renderer: value and target share a unit; the ratio is clamped to [0, 1]. */
export function asciiBar(value: number, target: number, width: number): string {
  const safeWidth = Math.max(1, Math.floor(width));
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) {
    return `[${EMPTY.repeat(safeWidth)}]`;
  }
  const ratio = Math.min(1, Math.max(0, value / target));
  const filled = Math.round(ratio * safeWidth);
  return `[${FILLED.repeat(filled)}${EMPTY.repeat(safeWidth - filled)}]`;
}

export function AsciiBar(props: {
  value: number;
  target: number;
  width?: number;
  label: string;
  testId?: string;
}): JSX.Element {
  const width = props.width ?? 20;
  return (
    <span aria-label={props.label} data-testid={props.testId} style={{ whiteSpace: "pre" }}>
      {asciiBar(props.value, props.target, width)}
    </span>
  );
}
```

- [ ] **Step 4: Write the targets view**

Create `src/ui/views/TargetsView.tsx`:

```tsx
import { useState, type JSX } from "react";
import { AsciiBar } from "../components/AsciiBar";
import { todayLocal } from "../../domain/dates";
import { displayMass, formatVolume, UNIT_LABEL } from "../../domain/units";
import { useAppStore } from "../../store/index";
import { useNutritionTargets } from "../../store/selectors";

export function TargetsView(): JSX.Element {
  const profile = useAppStore((s) => (s.activeProfileId ? s.profiles[s.activeProfileId] : undefined));
  const logIntake = useAppStore((s) => s.logIntake);
  const targets = useNutritionTargets();
  const today = profile ? todayLocal(profile.timezone) : "";
  const existing = useAppStore((s) =>
    profile ? (s.intake[profile.id] ?? []).find((e) => e.date === today) : undefined,
  );
  const [kcalText, setKcalText] = useState(existing ? String(existing.kcal) : "");
  const [proteinText, setProteinText] = useState(existing ? String(existing.proteinG) : "");

  if (!profile || !targets) return <p>No profile. Complete setup first.</p>;

  const labels = UNIT_LABEL[profile.units];
  const kcal = Number(kcalText === "" ? 0 : kcalText); // kcal/day
  const proteinG = Number(proteinText === "" ? 0 : proteinText); // g/day

  const rateText = (): string => {
    if (targets.expectedRateKgPerWeek === null) return "Not established by the evidence base";
    const shown = displayMass(targets.expectedRateKgPerWeek, profile.units);
    const sign = shown < 0 ? "-" : "+";
    return `${sign}${Math.abs(shown).toFixed(1)} ${labels.mass}/week`;
  };

  const record = (): void => {
    logIntake(profile.id, {
      profileId: profile.id,
      date: today,
      kcal: Number.isFinite(kcal) ? kcal : 0, // kcal/day
      proteinG: Number.isFinite(proteinG) ? proteinG : 0, // g/day
    });
  };

  return (
    <section>
      <h2>Daily targets</h2>
      <dl>
        <dt>Energy</dt>
        <dd data-testid="target-kcal">{`${targets.targetKcal} kcal`}</dd>
        <dt>Protein</dt>
        <dd data-testid="target-protein">{`${targets.proteinG.lo}-${targets.proteinG.hi} g`}</dd>
        <dt>Fluid (beverages)</dt>
        <dd data-testid="target-fluid">{formatVolume(targets.fluidML, profile.units)}</dd>
        <dt>Expected rate</dt>
        <dd data-testid="target-rate">{rateText()}</dd>
        {targets.creatineG !== null && (
          <>
            <dt>Creatine</dt>
            <dd data-testid="target-creatine">{`${targets.creatineG} g`}</dd>
          </>
        )}
        <dt>Resting metabolic rate</dt>
        <dd>{`${targets.rmrKcal} kcal`}</dd>
        <dt>Total daily energy expenditure</dt>
        <dd>{`${targets.tdeeKcal} kcal`}</dd>
      </dl>

      <h2>{`Intake check-in — ${today}`}</h2>
      <label>
        {`Energy consumed today (kcal)`}
        <input
          type="number"
          aria-label="Energy consumed today (kcal)"
          value={kcalText}
          onChange={(e) => setKcalText(e.target.value)}
        />
      </label>
      <label>
        {`Protein consumed today (g)`}
        <input
          type="number"
          aria-label="Protein consumed today (g)"
          value={proteinText}
          onChange={(e) => setProteinText(e.target.value)}
        />
      </label>
      <button type="button" onClick={record}>
        Record intake
      </button>

      <p>
        <AsciiBar
          value={kcal}
          target={targets.targetKcal}
          label="Energy against target"
          testId="kcal-bar"
        />
        {` ${kcal} / ${targets.targetKcal} kcal`}
      </p>
      <p>
        <AsciiBar
          value={proteinG}
          target={targets.proteinG.lo}
          label="Protein against the lower bound of the target range"
          testId="protein-bar"
        />
        {` ${proteinG} / ${targets.proteinG.lo}-${targets.proteinG.hi} g`}
      </p>

      <details data-testid="basis">
        <summary>How these numbers were derived</summary>
        <p>{`Resting metabolic rate: ${targets.basis.rmr === "cunningham" ? "Cunningham 1991, DOI 10.1093/ajcn/54.6.963" : "Mifflin-St Jeor 1990, DOI 10.1093/ajcn/51.2.241"}.`}</p>
        <p>{`Physical activity level ${targets.basis.activityFactor} (FAO/WHO/UNU 2004, Table 5.3).`}</p>
        <p>{targets.basis.proteinRule}</p>
        <p>{targets.basis.deficitRule}</p>
        <p>{targets.basis.rateRule}</p>
        <p>
          Fluid: IOM 2005 beverage share of the total-water adequate intake, DOI 10.17226/10925.
        </p>
      </details>
    </section>
  );
}
```

- [ ] **Step 5: Write the settings view**

Create `src/ui/views/SettingsView.tsx`:

```tsx
import type { JSX } from "react";
import { useNutritionTargets } from "../../store/selectors";
import { useAppStore } from "../../store/index";
import { dailyBeverageTargetML } from "../../domain/nutrition";
import { UNIT_LABEL, toStoredMass, displayMass } from "../../domain/units";
import type { ActivityLevel, Experience, GoalKind, UnitSystem } from "../../domain/types";

const ACTIVITY_VALUES = ["sedentary", "light", "moderate", "active", "very-active"] as const;
const EXPERIENCE_VALUES = ["novice", "intermediate", "advanced"] as const;
const GOAL_VALUES = ["fat-loss", "muscle-gain", "recomposition", "maintenance"] as const;

const toActivity = (v: string): ActivityLevel => ACTIVITY_VALUES.find((x) => x === v) ?? "moderate";
const toExperience = (v: string): Experience => EXPERIENCE_VALUES.find((x) => x === v) ?? "novice";
const toGoal = (v: string): GoalKind => GOAL_VALUES.find((x) => x === v) ?? "fat-loss";

/**
 * Profile editing. Targets are derived, never stored, so every change here recomputes them on
 * the next render — there is no "recalculate" button to forget to press.
 */
export function SettingsView(): JSX.Element {
  const profile = useAppStore((s) => (s.activeProfileId ? s.profiles[s.activeProfileId] : undefined));
  const updateProfile = useAppStore((s) => s.updateProfile);
  const targets = useNutritionTargets();

  if (!profile || !targets) return <p>No profile. Complete setup first.</p>;
  const labels = UNIT_LABEL[profile.units];

  const setUnits = (units: UnitSystem): void => updateProfile(profile.id, { units });

  return (
    <section>
      <h2>Profile</h2>
      <label>
        Display unit
        <select
          aria-label="Display unit"
          value={profile.units}
          onChange={(e) => setUnits(e.target.value === "imperial" ? "imperial" : "metric")}
        >
          <option value="metric">Kilograms (kg)</option>
          <option value="imperial">Pounds (lb)</option>
        </select>
      </label>
      <p>
        Stored values never change with this setting: mass is always held in kilograms and
        converted for display.
      </p>

      <label>
        Activity level
        <select
          aria-label="Activity level"
          value={profile.activity}
          onChange={(e) => updateProfile(profile.id, { activity: toActivity(e.target.value) })}
        >
          {ACTIVITY_VALUES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label>
        Experience
        <select
          aria-label="Experience"
          value={profile.experience}
          onChange={(e) => updateProfile(profile.id, { experience: toExperience(e.target.value) })}
        >
          {EXPERIENCE_VALUES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label>
        Goal
        <select
          aria-label="Goal"
          value={profile.goal.kind}
          onChange={(e) =>
            updateProfile(profile.id, { goal: { ...profile.goal, kind: toGoal(e.target.value) } })
          }
        >
          {GOAL_VALUES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label>
        <input
          type="checkbox"
          aria-label="Creatine monohydrate"
          checked={profile.supplements.creatine}
          onChange={(e) => updateProfile(profile.id, { supplements: { creatine: e.target.checked } })}
        />
        Creatine monohydrate
      </label>

      <h2>Equipment steps</h2>
      <label>
        {`Barbell step (${labels.load})`}
        <input
          type="number"
          aria-label={`Barbell step (${labels.load})`}
          value={displayMass(profile.equipmentSteps.barbellKg, profile.units)}
          onChange={(e) =>
            updateProfile(profile.id, {
              equipmentSteps: {
                ...profile.equipmentSteps,
                barbellKg: toStoredMass(Number(e.target.value), profile.units), // kg
              },
            })
          }
        />
      </label>
      <label>
        <input
          type="checkbox"
          aria-label="Micro-plates available"
          checked={profile.equipmentSteps.hasMicroPlates}
          onChange={(e) =>
            updateProfile(profile.id, {
              equipmentSteps: { ...profile.equipmentSteps, hasMicroPlates: e.target.checked },
            })
          }
        />
        Micro-plates available
      </label>

      <h2>Hydration</h2>
      <label>
        Daily beverage target (mL)
        <input
          type="number"
          aria-label="Daily beverage target (mL)"
          value={profile.hydration.dailyTargetML}
          onChange={(e) =>
            updateProfile(profile.id, {
              hydration: { ...profile.hydration, dailyTargetML: Number(e.target.value) }, // mL
            })
          }
        />
      </label>
      <p>
        {`Default for the stated sex is ${dailyBeverageTargetML(profile.body.sex)} mL of beverages per day (IOM 2005, DOI 10.17226/10925). Water in food is additional and is not counted here.`}
      </p>
    </section>
  );
}
```

- [ ] **Step 6: Wire the views into `src/app/App.tsx`**

Replace `src/app/App.tsx` with the version below. It keeps the P1 error-boundary contract (`main.tsx` still mounts `<RootErrorBoundary><App/></RootErrorBoundary>`), adds the setup gate, and registers `targets` and `settings`. P3–P8 replace the placeholder entries with their own views.

```tsx
import { useState, type JSX } from "react";
import { SetupWizard } from "../ui/setup/SetupWizard";
import { SettingsView } from "../ui/views/SettingsView";
import { TargetsView } from "../ui/views/TargetsView";
import { useAppStore } from "../store/index";

export type ViewId = "today" | "plan" | "train" | "targets" | "log" | "settings";

const NAV: { id: ViewId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "plan", label: "Plan" },
  { id: "train", label: "Train" },
  { id: "targets", label: "Targets" },
  { id: "log", label: "Log" },
  { id: "settings", label: "Settings" },
];

/** Views P3-P8 deliver. Until then the tab exists and says what will fill it. */
function Placeholder(props: { name: string; plan: string }): JSX.Element {
  return <p>{`${props.name} is delivered in ${props.plan}.`}</p>;
}

export function App(): JSX.Element {
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const [view, setView] = useState<ViewId>("targets");

  if (activeProfileId === null) return <SetupWizard />;

  return (
    <div className="app">
      <nav>
        {NAV.map((n) => (
          <button key={n.id} type="button" aria-current={view === n.id} onClick={() => setView(n.id)}>
            {n.label}
          </button>
        ))}
      </nav>
      <main>
        {view === "targets" && <TargetsView />}
        {view === "settings" && <SettingsView />}
        {view === "today" && <Placeholder name="Today" plan="P3" />}
        {view === "plan" && <Placeholder name="Plan" plan="P3" />}
        {view === "train" && <Placeholder name="Train" plan="P4" />}
        {view === "log" && <Placeholder name="Log" plan="P7" />}
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/ui/views/TargetsView.test.tsx`
Expected: PASS — 6 tests passed.

- [ ] **Step 8: Run the whole suite, lint and build**

Run: `npx tsc --noEmit && npx eslint src && npm test && npm run build`
Expected: every suite green; no lint output; the build succeeds and `dist/index.html` still contains the CSP meta tag and no inline `<script>`.

- [ ] **Step 9: Commit**

```bash
git add src/ui/components/AsciiBar.tsx src/ui/views/TargetsView.tsx src/ui/views/SettingsView.tsx src/ui/views/TargetsView.test.tsx src/app/App.tsx
git commit -m "feat: targets view with daily intake check-in, settings entry point and app wiring"
```

---

## Verification gates for P2 (stated before the work)

| Gate | Where it runs | Pass criterion |
|---|---|---|
| Nutrition — report reproduction | Task 1, `nutrition.test.ts` | FFM for 95.3 kg at 27 % body fat is 69.569 kg and fat mass 25.731 kg, matching the report's 69.57 / 25.73; 190 g protein reproduces the report's 1.99 g/kg body mass and 2.73 g/kg FFM to two decimals and lies inside the computed 160–216 g deficit range. Tolerance ±1 kcal, ±1 g. |
| Nutrition — rate bound | Task 1, property test | Over 2,000 random body masses in [35, 250] kg the fat-loss rate is negative and its magnitude stays inside 0.5–1.0 %BW/week. |
| Nutrition — goal direction | Task 1, property test | Over 2,000 random profiles `targetKcal < tdeeKcal` for fat loss and `targetKcal > tdeeKcal` for muscle gain. |
| Body fat | Task 2, `bodyfat.test.ts` | Male 180/40/95 cm gives D = 1.0489659281 and 21.8933063 %BF; female 165/32/75/95 gives 27.4256394 %BF; changing hip girth changes the female result (the Potter 2022 typo cannot creep in); out-of-domain inputs return `null`. |
| Library | Task 3, `library.test.ts` | Ids unique and kebab-case; `FORM_CUE_IDS` equals the set of non-null `formCueId`s, which P4 imports; the unsafe-cue exercise is absent; no personal string survives the port. |
| Templates | Task 4, `templates.test.ts` | Every candidate id exists; compound slots precede isolation; exactly one heavy slot per session; the §7 bands are reproduced verbatim; three days is full body, not push/pull/legs; rest is never below 90 s. |
| **Generator (master plan §7 P2 row)** | Task 5, `generator.test.ts` | For every `sessionsPerWeek ∈ {2..6}`: `weeks × sessionsPerWeek` sessions; each week's label multiset equals the template's; every planned exercise exists in the library; every deload block has `setModifier ∈ [0.4, 0.6]` and `loadModifier === 1`; every declared band muscle lands inside the §7 band at all three experience levels; no muscle exceeds the band top; every muscle group is trained. |
| Store | Task 6, `profile.test.ts` | `setPlan` creates the cursor at index 0; `logIntake` keeps one entry per date; `useNutritionTargets` returns the identical object across a re-render and a fresh one after a profile change. |
| Wizard | Task 7, `SetupWizard.test.tsx` | Field labels carry the chosen unit; 210 lb stores 95.2543977 kg and 5 ft 11 in stores 180.34 cm exactly; the review screen shows 2796 kcal, 133–191 g, 101 fl oz and −1.5 lb/week; no medication input or copy exists on any of the eight screens; `supplements` has exactly one key. |
| Targets view | Task 8, `TargetsView.test.tsx` | The ASCII bar is proportional and clamped; a check-in writes one `IntakeEntry` for today and a correction replaces it; the basis panel names the equation and the citation for every number. |
| Whole-plan hygiene | after every task | `npx tsc --noEmit && npx eslint src && npm test` clean; `git grep -nEi 'vyvanse|lisdexamfetamine|ymca|amphetamine' -- src/` returns nothing. |

---

## Master plan amendments requested / unverified inputs

Each item below is either a change to `docs/plans/2026-09-01-00-master-plan.md` that this plan needs, or a gap in the evidence base that the code exposes rather than fills. Nothing here was invented to close a hole.

**Amendments to the master plan (§5 types and §6 contracts)**

1. **`Exercise` gains `secondaryMuscles: string[]`** (§5). The content review §6 counting rule — direct 1.0, indirect 0.5 — cannot be implemented against a single undifferentiated `muscleGroups` array. `muscleGroups` keeps its meaning as the direct movers. Task 3 edits `types.ts` and `schema.ts`.
2. **`NutritionTargets.expectedRateKgPerWeek` becomes `number | null`** (§5, §6.3). For muscle gain the report gives the surplus (506 ± 84 kcal/day) and the total gain (+4.3 ± 0.9 % body mass) but not the study duration, so no weekly rate exists to report. `null` with a stated reason is the honest value.
3. **`NutritionTargets.basis` gains `rateRule: string`** (§6.3). `targetKcal` and `expectedRateKgPerWeek` are computed independently — see item 8 — and the UI must be able to say so without overloading `deficitRule`.
4. **`dailyBeverageTargetML(sex)` moves from `src/domain/training/hydration.ts` (P4, §6.5) to `src/domain/nutrition.ts` (P2)**, because the setup wizard seeds `Profile.hydration.dailyTargetML` from it before P4 exists. P4's `hydration.ts` re-exports it, preserving the §6.5 signature for P4 consumers.
5. **`setAvailability` moves from P3 to P2 in §6.7.** The wizard collects availability; P3 consumes it. The signature is unchanged.
6. **P4's `defaultRestS(ex, lib)` should delegate to P2's `restSFor(ex, prescription)`** (§6.5). Two independent copies of the 180/120/90 s table would drift, and the rest interval depends on the prescription, not on the exercise alone.
7. **P4 must treat an equipment step of `0` as "no quantisation"** rather than dividing by it. `stepFor()` returns 0 for `modality: "bodyweight"`, which `weighted-pull-up` uses because a belt-hung load has no plate step. This is a latent division-by-zero in the §6.5 progression rule as written.

**Gaps in the evidence base, exposed rather than filled**

8. **No verified kcal ↔ mass-change coefficient exists in the report.** It rejects 3,500 kcal/lb outright (Hall 2011, `10.1016/S0140-6736(11)60812-X`), and Hall's replacement — "10 kcal per day per pound of weight change" — is a steady-state relation that takes about a year to reach half its effect, not a weekly rate rule. `targetKcal` and `expectedRateKgPerWeek` are therefore computed independently and `basis.rateRule` says so in the UI. **Consequence to watch:** for a 95 kg user the prescribed −0.7 %BW/week and a 15 % intake cut are not guaranteed to agree; P7's re-measure loop is what reconciles them against observed data, which is what the content review §1 actually recommends ("recompute the target at each body-mass re-measure").
9. **The initial fat-loss deficit is 15 % of TDEE, taken from the report's §2.2 plateau-response recommendation ("cut 10–15 % of *current* intake"), applied to TDEE at the top of that band.** That is a reviewer recommendation, not a measured coefficient, and is labelled HEURISTIC in the code and shown in `basis.deficitRule`. No better-sourced figure exists in the report.
10. **The report contains no end-to-end worked energy example.** Mifflin-St Jeor needs height and age, which the legacy `data.js` never collected, so there is no published kcal figure for the report's own subject to reproduce. The Task 1 gate therefore reproduces (a) the report's *stated* arithmetic — 69.57 kg lean, 25.73 kg fat, 1.99 g/kg body mass, 2.73 g/kg FFM — and (b) hand-computed values from the verified equations, with the arithmetic written out longhand in the test comments so a reviewer can check it without running the code.
11. **The report gives no worked example for the Navy tape equations** — only the coefficients and the accuracy statistics. Task 2 therefore tests against longhand arithmetic shown in the test, plus a hip-term guard and monotonicity, rather than a published example.
12. **Five activity categories, three verified bands.** `ActivityLevel` has five members; FAO/WHO/UNU 2004 Table 5.3 has three PAL bands. Band edges are used where they exist; `light` (1.55) and `active` (1.85) are within-band midpoints, labelled HEURISTIC and surfaced in `basis.activityFactor`. **Alternative if this is unacceptable:** collapse `ActivityLevel` to three members in §5 and re-run the wizard copy.
13. **Recomposition is not covered by the report.** It is given maintenance energy (introducing no coefficient) and the muscle-gain protein row, labelled EXTRAPOLATION in `basis.proteinRule`.
14. **Experience-stratified volume has no coefficient in the report.** Novice sits at the bottom of the verified §7 band and advanced at the top; this is a within-band placement, and the Task 5 gate verifies that all three levels stay inside the band rather than asserting the placement is correct.
15. **The muscle-by-muscle direct/indirect assignment is an engineering judgement.** The report supplies the counting *rule* (1.0 / 0.5) but no table of which muscles are direct for a given lift. The convention — a secondary muscle is a dynamic assisting mover, never an isometric stabiliser — is written into `library.ts` so it can be audited and changed deliberately.
16. **No goal-stratified rep range exists in the report.** Reps are set by load class only (§9). `PlanInput.goal` therefore affects the plan's name, and nothing else in the training prescription.
17. **The §7 band cannot hold every muscle at once.** Thirteen groups at 12–16 sets each is ~180 sets a week. Each template declares the muscles it places in band; the rest are reported as maintenance-only, which is the content review §2.1 sanctioned alternative, and the wizard states it on the review screen.
18. **Deload cadence has no supporting evidence.** Four weeks is the lower edge of the reviewer's recommended 4–8 week calendar *backstop*; Bell 2023 and Coleman 2024 both argue against fixed pre-planned deloads. Autoregulation is P4's concern; the calendar backstop is what P2 can honestly ship.
19. **Excluded from the library pending P4:** `barbell-row-heavy`. Its cue is the one item the content review §6 marks **WRONG (unsafe)**. It returns only if P4 rewrites the cue to the strict standard.
20. **Not in scope, and therefore not done in P2:** the warm-up protocol and pre-participation screen the content review §6 flags as a **WRONG (omission)** — grep found zero hits for `warm.?up|par-?q|physician|contraindic|screen` across the legacy files. P2 collects no injury history and shows no readiness screen. This belongs in P4 (session flow) and should be added to the master plan's requirements map; until it exists, the generated plan prescribes 4–6 rep barbell work with no warm-up guidance.
21. **Not verified by this plan:** the `videoQuery` strings are ported verbatim and were never audited — the content review says so explicitly. Three exercises (`lat-pulldown`, `leg-press`, `stair-climber`) carry `videoQuery: null` because the legacy file had no string for them; P4's video control must handle `null`.
22. **Not touched by this plan:** `src/domain/schema.ts` beyond the one added field; the legacy tree; P1's units and dates modules; anything under `worker/`.
