# P8 — Fun Mechanics (generic and corrected) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rebuild the console's character features — boot sequence, toast queue, specimen collection, Atlas, time capsule, spotlight, hotkeys, phase cutscene — as generic, profile-driven, tested modules whose every scientific claim carries a citation the content peer review verified.

**Architecture:** content is a typed, frozen data module (`src/content/specimenCards.ts`); mechanics are pure functions over injected randomness (`src/domain/fun/`); presentation is React components driven by the Zustand store and one ordered toast queue. Nothing in this plan holds hidden state: the draw takes an `rng` parameter, the cutscene is keyed to `PlanBlock.index` derived from the plan cursor, and the four legacy `lastX` toast slots collapse into a single priority queue.

**Tech Stack:** React 19, TypeScript 5.9 (strict), Zustand 5, Zod 4, Vitest 4 + @testing-library/react + jsdom, date-fns 4 + @date-fns/tz.

---

## Global Constraints

Copied verbatim from master plan §3. Every task implicitly includes them.

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

## Assumptions carried from P1–P7

These are the seams P8 attaches to. Each is stated so a failure is diagnosable rather than mysterious.

1. **Store shape.** P1's store is `create<AppState & AppActions & { session: SessionSlice }>()(...)`, i.e. the `AppState` fields of master plan §5 sit at the top level of the store object alongside the actions of §6.7. Tests seed it with `useAppStore.setState(partialAppState)`. If P1 nested state under a key, adjust the `useAppStore.setState` call sites in Tasks 4, 5, 6, 7, 8, 10 and nothing else.
2. **Existing modules.** `src/domain/types.ts`, `src/domain/schema.ts`, `src/domain/dates.ts` (`addDays`, `daysBetween`, `todayLocal`, `compareLocalDate`), `src/domain/units.ts` (`displayMass`, `UNIT_LABEL`), `src/domain/ids.ts` (`newId`), `src/store/index.ts` (`useAppStore`), `src/ui/components/TopBar.tsx`, `src/app/App.tsx`, `src/ui/views/PlanView.tsx`, `src/ui/views/SettingsView.tsx` all exist.
3. **`logSet`.** P4 defined `logSet(set: Omit<LoggedSet, "id" | "loggedAt">, now: EpochMs): string` and `deleteSet(id: string): void` in `src/store/index.ts`. Task 4 edits both in place.
4. **Views.** The eight views of master plan §4 exist as components: `TodayView`, `PlanView`, `TrainView`, `LogView`, `ProtocolsView`, `AtlasView` (created here in Task 5), `SettingsView`, `ExportView`.
5. **Legacy tree.** The pre-rewrite source referenced below lives under `legacy/` (`legacy/console-content.js`, `legacy/console-fun.jsx`, `legacy/console-shared.jsx`, `legacy/console-app.jsx`, `legacy/console-store.jsx`). It is read-only reference material; P8 changes nothing there.

---

## Verification gate for P8 (stated before the work)

From master plan §7:

| Gate | Pass criterion |
| --- | --- |
| draw | specimen draw over 10,000 trials keeps rarity proportions within 2 percentage points and never exhausts the pool |

Expanded into the concrete checks this plan runs:

| # | Check | Pass criterion | Task |
| --- | --- | --- | --- |
| G1 | citation integrity | every `SpecimenCard.source.doi` is `null` or matches `^10\.\d{4,9}/\S+$`; the set of ids with a `null` doi equals the declared list exactly | 1 |
| G2 | personal-data gate | no card field matches `/vyvanse\|lisdexamfetamine\|ymca\|amphetamine/i` | 1 |
| G3 | tone gate | every card field is pure ASCII (mechanically excludes emoji) | 1 |
| G4 | pool size | `SPECIMEN_CARDS.length === 37`, at least 15 | 1 |
| G5 | rarity proportions | 10,000 seeded draws land within 2 percentage points of the weighted expectation (common 0.5854, uncommon 0.3171, rare 0.0976) | 2 |
| G6 | no duplicate drops | 37 consecutive drops yield 37 distinct ids; the 38th returns `null` and does not throw | 2 |
| G7 | economy | median sets-to-complete across 200 seeded programmes lies in [1650, 2050], i.e. 20.6–25.6 weeks at 80 logged sets/week | 2 |
| G8 | legacy regression | over the 280 logged sets that exhausted the legacy 42-card pool, fewer than 15 cards are collected | 2 |
| G9 | toast ordering | `undo` outranks `milestone` outranks `coach` outranks `telemetry` outranks `specimen`; a second toast of one class waits rather than replacing (code review A59) | 3 |
| G10 | RNG placement | `logSet` called twice in one batch increments `totalSetsLogged` by exactly 2; no `Math.random` appears in `src/store/` (code review A46, A57) | 4 |
| G11 | milestone crossing | a jump from 49 to 51 sets still yields the 50 milestone (code review A46) | 10 |
| G12 | hotkey collisions | registering the same combo twice in one scope throws; `j` on the Train view runs the Train handler only (code review A54) | 9 |
| G13 | cutscene keying | scrubbing the Plan view to a later block does not fire or consume the cutscene (code review A61) | 10 |

---

## File structure

```
src/content/specimenCards.ts              Task 1   frozen card data + rarity weights (37 cards)
src/content/specimenCards.test.ts         Task 1
src/domain/fun/rng.ts                     Task 2   mulberry32 seeded PRNG
src/domain/fun/rng.test.ts                Task 2
src/domain/fun/specimens.ts               Task 2   drawSpecimen(), SPECIMEN_DROP_CHANCE
src/domain/fun/specimens.test.ts          Task 2
src/ui/components/ToastQueue.tsx          Task 3   ToastProvider, useToasts(), <ToastQueue/>
src/ui/components/ToastQueue.test.tsx     Task 3
src/domain/types.ts                       Task 4   (modify) UiPrefs gains lastBlockSeenByProfile
src/domain/schema.ts                      Task 4   (modify) matching Zod field with a default
src/store/index.ts                        Task 4   (modify) recordSpecimen, setCapsule, setUi,
                                                   attemptSpecimenDraw; logSet/deleteSet counter
src/store/funActions.test.ts              Task 4
src/test/funFixtures.ts                   Task 4   makeProfile/makePlan/makeAppState for UI tests
src/ui/views/AtlasView.tsx                Task 5   grid, rarity + category filters, locked teaser
src/ui/views/AtlasView.test.tsx           Task 5
src/ui/components/Boot.tsx                Task 6   generic typewriter boot, skippable
src/ui/components/Boot.test.tsx           Task 6
src/ui/components/TimeCapsule.tsx         Task 7   write / sealed / openable / opened
src/ui/components/TimeCapsule.test.tsx    Task 7
src/ui/nav/views.ts                       Task 8   VIEWS single source (ids, labels, hotkey digits)
src/ui/planFocus.tsx                      Task 8   PlanFocusProvider, planRowDomId()
src/ui/components/Spotlight.tsx           Task 8   Cmd/Ctrl+K palette
src/ui/components/Spotlight.test.tsx      Task 8
src/ui/components/TopBar.tsx              Task 8   (modify) mobile search tap target
src/ui/views/PlanView.tsx                 Task 8   (modify) id + ref on each planned-exercise row
src/ui/hotkeys.tsx                        Task 9   one listener, scoped registry, useHotkeys()
src/ui/hotkeys.test.tsx                   Task 9
src/ui/planBrowse.tsx                     Task 9   block/session browse state J/K and arrows drive
src/ui/components/KonamiOverlay.tsx       Task 9   useKonamiCode() + overlay
src/app/App.tsx                           Task 9   (modify) providers, hotkeys, boot gate
src/domain/fun/blocks.ts                  Task 10  currentBlockIndex, crossedMilestones, blockStats
src/domain/fun/blocks.test.ts             Task 10
src/ui/components/PhaseTransition.tsx     Task 10  cutscene keyed to PlanBlock.index
src/ui/components/MilestoneToast.tsx      Task 10  50/100/250/500/1000
src/ui/components/PhaseTransition.test.tsx Task 10
```

---

### Task 1: Specimen card content, rebuilt from the content peer review

The legacy library (`legacy/console-content.js:564-711`) held 42 cards. The content peer review §5 judged them **3 SUPPORTED, 17 PARTIALLY, 1 UNSUPPORTED, 21 WRONG**. This task rebuilds the library under three rules, applied card by card:

- **SUPPORTED** — ported, with the verified DOI in `source`.
- **PARTIALLY** — rewritten *exactly* per the review's "Recommended change" column, with the corrected citation.
- **WRONG / UNSUPPORTED / COULD NOT VERIFY** — dropped, **unless** the review supplies a verified replacement claim, in which case that replacement is used.

Two further rules constrain the prose and are not negotiable:

- A title is reproduced in `citation` **only where the review states it**. Where the review gives journal, volume and pages but no title, the citation carries journal, volume and pages alone. Inventing a title is fabrication.
- No number appears in a card body unless the review's Evidence column states that number. Figures the review marked COULD NOT VERIFY or PARAPHRASE are deleted, not softened.

**Five cards are dropped and the reason for each is fixed:**

| Card | Verdict | Why dropped |
| --- | --- | --- |
| c007 "Vyvanse and the heart" | PARTIALLY | Review §7 row 6: medication content, deleted regardless of verdict. Also inflated ~3x. |
| c012 "Vietnamese coffee chemistry" | WRONG | Belay 2008 contains none of the numbers. Review supplies no replacement source ("Use three separate sources, or delete"). Also individual-specific per §7. |
| c013 "Hydration and Vyvanse" | WRONG | Review §7 row 7: medication content. Source is a paediatric PK study. |
| u008 "Genetic limits on growth" | WRONG | Lambert & Flynn 2002 is a fatigue review with no year-by-year figures. Review: "Present as a coaching heuristic with no primary citation, or delete." A card with no source is not a specimen card. |
| u013 "The 60s spinal disc" | WRONG | Recommended change is deletion of the protective claim, which inverts the source; the remaining water and height figures are COULD NOT VERIFY. Nothing survives. |

**Final count: 37 cards — 12 common, 13 uncommon, 12 rare.** Six carry `doi: null` because the cited work has no DOI: `c003` (self-published chart), `u001` (textbook, ISBN), `u003` and `u012` (classical texts), `r006` (book + contemporary etching), `r007` (1991 journal article, PMID only).

**Files:**
- Create: `src/content/specimenCards.ts`
- Test: `src/content/specimenCards.test.ts`
- Reference (read-only): `legacy/console-content.js:564-711`, `docs/review/2026-09-01-content-peer-review.md` §5

**Interfaces:**
- Consumes: nothing. This is a leaf data module.
- Produces:
  ```ts
  export type SpecimenRarity = "common" | "uncommon" | "rare";
  export type SpecimenCategory = "anatomy" | "biology" | "biomechanics" | "history" | "nutrition" | "recovery" | "supplements" | "training";
  export interface SpecimenSource { citation: string; doi: string | null }
  export interface SpecimenCard { id: string; rarity: SpecimenRarity; title: string; category: SpecimenCategory; body: string; source: SpecimenSource }
  export const SPECIMEN_RARITIES: readonly SpecimenRarity[];
  export const SPECIMEN_CATEGORIES: readonly SpecimenCategory[];
  export const SPECIMEN_CARDS: readonly SpecimenCard[];
  export const SPECIMEN_BY_ID: Readonly<Record<string, SpecimenCard>>;
  export const RARITY_WEIGHT: Readonly<Record<SpecimenRarity, number>>;   // common 6, uncommon 3, rare 1
  export const CARDS_WITHOUT_DOI: readonly string[];
  export const DROPPED_CARD_IDS: readonly string[];
  ```

- [ ] **Step 1: Write the failing test**

Create `src/content/specimenCards.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SPECIMEN_CARDS,
  SPECIMEN_BY_ID,
  SPECIMEN_CATEGORIES,
  SPECIMEN_RARITIES,
  RARITY_WEIGHT,
  CARDS_WITHOUT_DOI,
  DROPPED_CARD_IDS,
} from "./specimenCards";

// The DOI syntax registered by the DOI Foundation: "10." + registrant code + "/" + suffix.
const DOI_RE = /^10\.\d{4,9}\/\S+$/;

// The exact alternation the CI personal-data gate greps for (master plan §3, "Personal data").
const BANNED_RE = /vyvanse|lisdexamfetamine|ymca|amphetamine/i;

function allText(): string[] {
  return SPECIMEN_CARDS.flatMap((c) => [c.id, c.title, c.category, c.body, c.source.citation, c.source.doi ?? ""]);
}

describe("specimen card library", () => {
  it("holds 37 cards, at least the 15 the plan requires", () => {
    expect(SPECIMEN_CARDS.length).toBe(37);
    expect(SPECIMEN_CARDS.length).toBeGreaterThanOrEqual(15);
  });

  it("splits 12 common / 13 uncommon / 12 rare", () => {
    const counts = { common: 0, uncommon: 0, rare: 0 };
    for (const c of SPECIMEN_CARDS) counts[c.rarity] += 1;
    expect(counts).toEqual({ common: 12, uncommon: 13, rare: 12 });
  });

  it("gives every card a unique, well-formed id", () => {
    const ids = SPECIMEN_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[cur]\d{3}$/);
  });

  it("indexes every card by id", () => {
    expect(Object.keys(SPECIMEN_BY_ID).length).toBe(SPECIMEN_CARDS.length);
    for (const c of SPECIMEN_CARDS) expect(SPECIMEN_BY_ID[c.id]).toBe(c);
  });

  // G1
  it("carries a syntactically valid DOI wherever a DOI exists", () => {
    for (const c of SPECIMEN_CARDS) {
      if (c.source.doi !== null) expect(c.source.doi, c.id).toMatch(DOI_RE);
    }
  });

  // G1: a null DOI is allowed only for the six works the review verified without one.
  it("permits a null DOI only for the declared non-DOI works", () => {
    const nullDoi = SPECIMEN_CARDS.filter((c) => c.source.doi === null).map((c) => c.id).sort();
    expect(nullDoi).toEqual([...CARDS_WITHOUT_DOI].sort());
    for (const c of SPECIMEN_CARDS) expect(c.source.citation.length, c.id).toBeGreaterThan(20);
  });

  // G2
  it("contains none of the strings the personal-data gate bans", () => {
    for (const text of allText()) expect(BANNED_RE.test(text), text).toBe(false);
  });

  // G3: pure ASCII mechanically excludes emoji, which the tone rule forbids.
  it("is pure ASCII in every field", () => {
    for (const text of allText()) expect(/^[\x20-\x7E]*$/.test(text), text).toBe(true);
  });

  it("drops every card the review condemned without a replacement", () => {
    for (const id of DROPPED_CARD_IDS) expect(SPECIMEN_BY_ID[id]).toBeUndefined();
    expect(DROPPED_CARD_IDS).toEqual(["c007", "c012", "c013", "u008", "u013"]);
  });

  it("uses only declared rarities and categories at runtime", () => {
    for (const c of SPECIMEN_CARDS) {
      expect(SPECIMEN_RARITIES).toContain(c.rarity);
      expect(SPECIMEN_CATEGORIES).toContain(c.category);
    }
  });

  it("weights rarity 6 / 3 / 1", () => {
    expect(RARITY_WEIGHT).toEqual({ common: 6, uncommon: 3, rare: 1 });
  });

  it("writes a substantive body for every card", () => {
    for (const c of SPECIMEN_CARDS) {
      expect(c.body.length, c.id).toBeGreaterThan(80);
      expect(c.title.length, c.id).toBeGreaterThan(3);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/content/specimenCards.test.ts
```

Expected: FAIL — `Failed to resolve import "./specimenCards"`.

- [ ] **Step 3: Create the card library**

Create `src/content/specimenCards.ts`:

```ts
// Specimen cards: collectible scientific facts drawn on logged sets.
//
// PROVENANCE. Every card below is derived from docs/review/2026-09-01-content-peer-review.md §5,
// which checked all 42 legacy cards for (a) whether the cited work exists and (b) whether it
// supports the card's specific claim. Verdicts were 3 SUPPORTED, 17 PARTIALLY, 1 UNSUPPORTED,
// 21 WRONG. Rules applied here:
//   SUPPORTED  -> ported, verified DOI attached.
//   PARTIALLY  -> rewritten exactly per the review's "Recommended change", corrected citation.
//   WRONG / UNSUPPORTED / COULD NOT VERIFY -> dropped, unless the review supplied a verified
//                 replacement claim, in which case the replacement is the card.
// A work's title appears in `citation` only where the review states it. No number appears in a
// body unless the review's Evidence column states that number.
//
// Do not add a card without a citation the review verified. Do not edit a body without editing
// its citation. Text is ASCII only: the tone rule forbids emoji and the test enforces it.

export type SpecimenRarity = "common" | "uncommon" | "rare";

export type SpecimenCategory =
  | "anatomy"
  | "biology"
  | "biomechanics"
  | "history"
  | "nutrition"
  | "recovery"
  | "supplements"
  | "training";

export interface SpecimenSource {
  /** Author, year, journal, volume and pages as the review verified them. */
  citation: string;
  /** DOI when the work has one; null for books, classical texts and pre-DOI articles. */
  doi: string | null;
}

export interface SpecimenCard {
  id: string;
  rarity: SpecimenRarity;
  title: string;
  category: SpecimenCategory;
  body: string;
  source: SpecimenSource;
}

export const SPECIMEN_RARITIES: readonly SpecimenRarity[] = ["common", "uncommon", "rare"];

export const SPECIMEN_CATEGORIES: readonly SpecimenCategory[] = [
  "anatomy",
  "biology",
  "biomechanics",
  "history",
  "nutrition",
  "recovery",
  "supplements",
  "training",
];

/** Draw weights. Dimensionless; only their ratios matter. */
export const RARITY_WEIGHT: Readonly<Record<SpecimenRarity, number>> = {
  common: 6,
  uncommon: 3,
  rare: 1,
};

/** Cards whose cited work has no DOI. Any other null DOI is a mistake, and the test says so. */
export const CARDS_WITHOUT_DOI: readonly string[] = ["c003", "u001", "u003", "u012", "r006", "r007"];

/** Legacy ids deliberately not rebuilt. Kept so a future edit cannot silently resurrect one. */
export const DROPPED_CARD_IDS: readonly string[] = ["c007", "c012", "c013", "u008", "u013"];

export const SPECIMEN_CARDS: readonly SpecimenCard[] = [
  // ---------------- common (12) ----------------
  {
    id: "c001",
    rarity: "common",
    title: "The post-exercise anabolic window",
    category: "nutrition",
    body:
      "The claim that protein must be eaten within about 30 minutes of training is not supported. The review that examined it rejected the narrow window and recommends 0.4 to 0.5 g of protein per kg of lean body mass at each of several meals across the day.",
    source: {
      citation:
        "Aragon AA, Schoenfeld BJ (2013). Nutrient timing revisited: is there a post-exercise anabolic window? J Int Soc Sports Nutr 10(1):5.",
      doi: "10.1186/1550-2783-10-5",
    },
  },
  {
    id: "c002",
    rarity: "common",
    title: "Muscle length, not just load",
    category: "biology",
    body:
      "Training the hamstrings at long muscle lengths produced more growth than the same exercise performed at short lengths: about 14 percent versus 9 percent muscle volume. Where in the range of motion the load is applied is a programming variable in its own right.",
    source: { citation: "Maeo S et al. (2021). Med Sci Sports Exerc 53(4):825-837.", doi: "10.1249/MSS.0000000000002523" },
  },
  {
    id: "c003",
    rarity: "common",
    title: "A 1RM is an estimate, not a measurement",
    category: "training",
    body:
      "A one-repetition maximum is normally estimated from a multi-repetition set using the Epley chart: 1RM is approximately load times (1 + reps/30). A set of 100 kg for 5 reps predicts 116.7 kg. The chart is a self-published table, not a peer-reviewed model, and measured estimation error at 5RM ran from 1.85 kg on the chest press to 14.05 kg on the leg press.",
    source: {
      citation:
        "Epley B (1985). Poundage chart. In: Boyd Epley Workout. Body Enterprises, p. 86 (self-published, not peer-reviewed). Error range: Reynolds JM, Gordon TJ, Robergs RA (2006). J Strength Cond Res 20(3):584-592.",
      doi: null,
    },
  },
  {
    id: "c004",
    rarity: "common",
    title: "Caffeine and creatine",
    category: "supplements",
    body:
      "The 1996 study behind the claim that caffeine cancels creatine gave caffeine at 5 mg/kg per day for six days alongside creatine loading, not a single dose before training. A 2015 review concluded caffeine may blunt creatine's ergogenic effect; a 2016 trial found no such interference. The interaction is not settled.",
    source: {
      citation:
        "Vandenberghe K et al. (1996). J Appl Physiol 80(2):452-457. Review: Trexler ET, Smith-Ryan AE (2015). Int J Sport Nutr Exerc Metab 25(6):607-623. Null finding: Trexler ET et al. (2016). J Strength Cond Res 30(5):1438-1446.",
      doi: "10.1152/jappl.1996.80.2.452",
    },
  },
  {
    id: "c005",
    rarity: "common",
    title: "Volume and hypertrophy",
    category: "training",
    body:
      "Each additional weekly set per muscle group is associated with a small increase in growth: 0.023 effect-size units per set, P = 0.002. That meta-regression is linear and detects no plateau. The widely quoted 10-set threshold comes from a categorical model in the same paper that was not statistically significant, P = 0.074.",
    source: {
      citation:
        "Schoenfeld BJ, Ogborn D, Krieger JW (2017). Dose-response relationship between weekly resistance training volume and increases in muscle mass. J Sports Sci 35(11):1073-1082.",
      doi: "10.1080/02640414.2016.1210197",
    },
  },
  {
    id: "c006",
    rarity: "common",
    title: "Sleep restriction and testosterone",
    category: "recovery",
    body:
      "Ten healthy young men slept 10 hours a night for three nights, then 5 hours a night for eight. Daytime testosterone fell under restriction, 16.5 against 18.4 nmol/L, P = 0.049. The comparison is against a 10-hour condition rather than an ordinary night, and the study measured neither growth hormone nor strength.",
    source: { citation: "Leproult R, Van Cauter E (2011). JAMA 305(21):2173-2174 (research letter).", doi: "10.1001/jama.2011.710" },
  },
  {
    id: "c008",
    rarity: "common",
    title: "Soreness is not growth",
    category: "training",
    body:
      "Delayed-onset muscle soreness reflects unaccustomed eccentric loading, not training quality. A muscle can grow significantly without ever being sore. Soreness fades within 2-3 weeks of a routine even as gains continue.",
    source: { citation: "Nosaka K, Newton M, Sacco P (2002). Scand J Med Sci Sports 12(6):337-346.", doi: "10.1034/j.1600-0838.2002.10178.x" },
  },
  {
    id: "c009",
    rarity: "common",
    title: "The thermic effect of protein",
    category: "nutrition",
    body:
      "Processing protein costs roughly 20 to 30 percent of the energy it supplies, against 5 to 10 percent for carbohydrate and 0 to 3 percent for fat. That cost belongs on the expenditure side of the energy balance: Atwater factors already report metabolisable energy, so subtracting it again from intake counts it twice.",
    source: { citation: "Westerterp KR (2004). Diet induced thermogenesis. Nutr Metab (Lond) 1:5.", doi: "10.1186/1743-7075-1-5" },
  },
  {
    id: "c010",
    rarity: "common",
    title: "Squat depth and the knee",
    category: "training",
    body:
      "Squatting below parallel does not raise anterior (ACL) shear: that shear peaks around 30 to 60 degrees of knee flexion and falls as depth increases. Retropatellar compressive stress peaks near 90 degrees and falls beyond it. Posterior (PCL) shear behaves differently and is higher at parallel than at quarter depth.",
    source: { citation: "Hartmann H, Wirth K, Klusemann M (2013). Sports Med 43(10):993-1008.", doi: "10.1007/s40279-013-0073-6" },
  },
  {
    id: "c011",
    rarity: "common",
    title: "Tonnage is a weak proxy",
    category: "training",
    body:
      "In a trained-lifter comparison the high-volume group moved roughly twice the squat tonnage of the high-intensity group, 8,753 plus or minus 1,033 kg against 4,528 plus or minus 889 kg, and gained less: lean arm mass rose 2.2 percent against 5.2 percent, bench 1RM 6.9 percent against 14.8 percent. Total load moved is easy to count and a poor guide to what the training produced.",
    source: { citation: "Mangine GT et al. (2015). Physiol Rep 3(8):e12472.", doi: "10.14814/phy2.12472" },
  },
  {
    id: "c014",
    rarity: "common",
    title: "What a push-up loads",
    category: "biomechanics",
    body:
      "A standard push-up places about 64 percent of body mass on the upper limbs, measured on a force plate. With the hands raised on a 61.0 cm box the figure falls to about 41 percent; with the feet on the same box it rises to about 74 percent. Knee push-ups load about 49 percent, which makes them a load regression on the same movement rather than a different pattern.",
    source: { citation: "Ebben WP et al. (2011). J Strength Cond Res 25(10):2891-2894.", doi: "10.1519/JSC.0b013e31820c8587" },
  },
  {
    id: "c015",
    rarity: "common",
    title: "Whey and casein",
    category: "nutrition",
    body:
      "Whey and casein both raise plasma amino acids to a peak at about 80 minutes after ingestion. The difference between them is duration, not the timing of the peak: casein was still elevated at 360 minutes. The familiar description of casein as slow to peak is a misreading of that plateau.",
    source: { citation: "Boirie Y et al. (1997). PNAS 94(26):14930-14935.", doi: "10.1073/pnas.94.26.14930" },
  },

  // ---------------- uncommon (13) ----------------
  {
    id: "u001",
    rarity: "uncommon",
    title: "The smallest skeletal muscle",
    category: "anatomy",
    body:
      "The stapedius, attached to the stapes in the middle ear, is about 4 to 5 mm long and is the smallest skeletal muscle in the body. It contracts to damp loud sound and is innervated by the facial nerve.",
    source: { citation: "Standring S (ed.) (2020). Gray's Anatomy, 42nd edition. Elsevier. ISBN 9780702077050.", doi: null },
  },
  {
    id: "u002",
    rarity: "uncommon",
    title: "Fibre type varies by muscle",
    category: "anatomy",
    body:
      "Fibre-type proportions differ markedly between muscles. They were first tabulated across 36 human muscles in six male autopsy subjects aged 17 to 30. The soleus is predominantly slow-twitch, reported between about 70 and 87 percent across sources.",
    source: {
      citation:
        "Johnson MA, Polgar J, Weightman D, Appleton D (1973). Data on the distribution of fibre types in thirty-six human muscles. An autopsy study. J Neurol Sci 18(1):111-129.",
      doi: "10.1016/0022-510X(73)90023-3",
    },
  },
  {
    id: "u003",
    rarity: "uncommon",
    title: "Milo of Croton",
    category: "training",
    body:
      "The oldest surviving reference to progressive overload is one line in Quintilian: Milo, who had been used to carrying a calf, carried a bull. It appears there as a chria, a rhetorical exercise example, not as a training account.",
    source: { citation: "Quintilian, Institutio Oratoria I.9.5 (c. 95 CE), Latin text verified at LacusCurtius.", doi: null },
  },
  {
    id: "u004",
    rarity: "uncommon",
    title: "The discovery of creatine",
    category: "supplements",
    body:
      "Creatine was isolated in 1832 by Michel Eugene Chevreul from an alkaline water extract of skeletal muscle, and named after the Greek kreas, flesh. It took 160 years for the first study to show that oral supplementation raises muscle stores: 5 g four to six times daily for at least two days raised quadriceps total creatine, by up to 50 percent in subjects with low initial stores.",
    source: { citation: "Harris RC, Soderlund K, Hultman E (1992). Clin Sci 83(3):367-374.", doi: "10.1042/cs0830367" },
  },
  {
    id: "u005",
    rarity: "uncommon",
    title: "Training frequency",
    category: "training",
    body:
      "Splitting the same weekly volume over two sessions rather than one was associated with about 3.1 percent more growth, 95 percent CI 1.6 to 4.6, P = 0.003, in cohorts dominated by untrained subjects. Whether three sessions is better could not be estimated. A later analysis found that once weekly volume is equated, frequency does not meaningfully change hypertrophy.",
    source: {
      citation:
        "Schoenfeld BJ, Ogborn D, Krieger JW (2016). Sports Med 46(11):1689-1697. Volume-equated follow-up: Schoenfeld BJ, Grgic J, Krieger J (2019). How many times per week should a muscle be trained to maximize muscle hypertrophy? J Sports Sci 37(11):1286-1295.",
      doi: "10.1007/s40279-016-0543-8",
    },
  },
  {
    id: "u006",
    rarity: "uncommon",
    title: "The trap bar",
    category: "biomechanics",
    body:
      "The hex or trap bar deadlift produced lower peak lumbar moments than the straight-bar deadlift at the same load. It is also faster at the bar, not slower: 0.805 plus or minus 0.165 m/s against 0.725 plus or minus 0.138 m/s. Neither study measured lumbar shear force, which is often claimed for it.",
    source: {
      citation:
        "Swinton PA et al. (2011). J Strength Cond Res 25(7):2000-2009 (peak moments). Bar velocity: Camara KD et al. (2016). J Strength Cond Res 30(5):1183-1188.",
      doi: "10.1519/JSC.0b013e3181e73f87",
    },
  },
  {
    id: "u007",
    rarity: "uncommon",
    title: "The case for face pulls",
    category: "biomechanics",
    body:
      "External-rotation and scapular-retraction exercises are selected on measured activation ratios: the useful ones recruit the external rotators and lower trapezius without a large upper-trapezius contribution. That electromyographic evidence is the whole case for them. The repeated claim that lifters are several times stronger in horizontal push than in horizontal pull has no basis in this literature.",
    source: {
      citation: "Cools AM et al. (2007). Rehabilitation of Scapular Muscle Balance. Am J Sports Med 35(10):1744-1751.",
      doi: "10.1177/0363546507303560",
    },
  },
  {
    id: "u009",
    rarity: "uncommon",
    title: "Caffeine and endurance",
    category: "supplements",
    body:
      "An umbrella review of 21 meta-analyses found caffeine reduces rating of perceived exertion by about 5.6 percent and improves endurance performance by 12.3 percent, 95 percent CI 9.1 to 15.4. It reports no dose-specific effects, so a per-kilogram prescription does not follow from it.",
    source: {
      citation:
        "Grgic J et al. (2020). Wake up and smell the coffee: caffeine supplementation and exercise performance - an umbrella review of 21 published meta-analyses. Br J Sports Med 54(11):681-688.",
      doi: "10.1136/bjsports-2018-100278",
    },
  },
  {
    id: "u010",
    rarity: "uncommon",
    title: "Heavy loading and bone",
    category: "biology",
    body:
      "In 101 postmenopausal women aged 65 plus or minus 5 with a T-score below -1.0, eight months of twice-weekly high-intensity resistance and impact training above 85 percent of 1RM raised lumbar spine bone mineral density by 2.9 plus or minus 2.8 percent, against -1.2 plus or minus 2.8 percent in controls, p < 0.001. The result is for that population; it has not been shown to generalise.",
    source: { citation: "Watson SL et al. (2018). J Bone Miner Res 33(2):211-220 (LIFTMOR trial).", doi: "10.1002/jbmr.3284" },
  },
  {
    id: "u011",
    rarity: "uncommon",
    title: "Muscle loss with age",
    category: "biology",
    body:
      "Muscle fibre loss begins around age 50, and by age 80 approximately 50 percent of fibres are gone. Selectivity for fast-twitch fibres is supported by the wider literature, but the commonly quoted split between fibre types is not established. The review's own conclusion is that this atrophy can be slowed, not halted.",
    source: { citation: "Faulkner JA et al. (2007). Clin Exp Pharmacol Physiol 34(11):1091-1096.", doi: "10.1111/j.1440-1681.2007.04752.x" },
  },
  {
    id: "u012",
    rarity: "uncommon",
    title: "The ox-eating athlete",
    category: "history",
    body:
      "Athenaeus records the pankratiast Theagenes of Thasos eating a bull, citing Poseidippus, and separately records Milo of Croton carrying a four-year-old bull and eating it in a day. The story is usually attributed to Galen; there is no evidence it appears anywhere in his work.",
    source: { citation: "Athenaeus, Deipnosophists 10.412-413.", doi: null },
  },
  {
    id: "u014",
    rarity: "uncommon",
    title: "The maintenance dose",
    category: "training",
    body:
      "In a detraining study the leanest maintenance dose was one set of three exercises once a week, three sets weekly, taken to volitional fatigue and held for 32 weeks. Both maintenance doses preserved hypertrophy in young subjects but not in older ones. In the same study, 32 weeks of complete detraining left strength only 7 percent below peak and still 23 percent above baseline.",
    source: { citation: "Bickel CS, Cross JM, Bamman MM (2011). Med Sci Sports Exerc 43(7):1177-1187.", doi: "10.1249/MSS.0b013e318207c15d" },
  },
  {
    id: "u015",
    rarity: "uncommon",
    title: "Lifting and running economy",
    category: "training",
    body:
      "Eight weeks of heavy half-squat training in 17 well-trained runners improved running economy at 70 percent of VO2max by 5.0 percent, with 1RM up 33.2 percent and time to exhaustion up 21.3 percent, and no change in VO2max. The study measured neither tendon stiffness nor ground contact time, so no mechanism follows from it.",
    source: { citation: "Storen O, Helgerud J, Stoa EM, Hoff J (2008). Med Sci Sports Exerc 40(6):1087-1092.", doi: "10.1249/MSS.0b013e318168da2f" },
  },

  // ---------------- rare (12) ----------------
  {
    id: "r001",
    rarity: "rare",
    title: "The soleus push-up",
    category: "anatomy",
    body:
      "Repeated low-effort soleus contractions performed seated, at roughly 2 METs and without fatigue, reduced the postprandial blood glucose excursion by 52 percent and hyperinsulinaemia by 60 percent. The soleus is about 88 percent type I fibre. The same paper cites evidence that standing instead of sitting did not reduce glucose at all.",
    source: {
      citation:
        "Hamilton MT, Hamilton DG, Zderic TW (2022). A potent physiological method to magnify and sustain soleus oxidative metabolism improves glucose and lipid regulation. iScience 25(9):104869.",
      doi: "10.1016/j.isci.2022.104869",
    },
  },
  {
    id: "r002",
    rarity: "rare",
    title: "What Roman gladiators ate",
    category: "history",
    body:
      "Stable-isotope analysis of 22 gladiator skeletons from Ephesus shows a diet dominated by C3 plants, principally wheat, barley and legumes, rather than the meat-heavy regimen of popular accounts.",
    source: { citation: "Losch S et al. (2014). PLoS ONE 9(10):e110489.", doi: "10.1371/journal.pone.0110489" },
  },
  {
    id: "r003",
    rarity: "rare",
    title: "Myostatin loss of function",
    category: "biology",
    body:
      "A German child carrying a homozygous splice-donor mutation in the myostatin gene, g.IVS1+5G to A, showed gross muscle hypertrophy from birth and could hold 3 kg dumbbells with arms extended at four and a half years old. The Belgian Blue cattle comparison often attached to this case comes from elsewhere, not from this report.",
    source: {
      citation: "Schuelke M et al. (2004). Myostatin Mutation Associated with Gross Muscle Hypertrophy in a Child. N Engl J Med 350(26):2682-2688.",
      doi: "10.1056/NEJMoa040933",
    },
  },
  {
    id: "r004",
    rarity: "rare",
    title: "Strength per unit muscle",
    category: "biomechanics",
    body:
      "Women measured about 52 percent as strong as men in the upper body, and men were stronger even after adjusting for lean body mass. Only when strength was expressed per unit of muscle cross-sectional area did the sex difference disappear. The gap is in muscle quantity and distribution, not in contractile quality.",
    source: { citation: "Miller AE et al. (1993). Eur J Appl Physiol 66(3):254-262.", doi: "10.1007/BF00235103" },
  },
  {
    id: "r005",
    rarity: "rare",
    title: "Exercise and respiratory infection",
    category: "biology",
    body:
      "Adults reporting aerobic exercise on five or more days a week had 43 percent fewer days with upper-respiratory infection. The finding is self-reported and concerns aerobic exercise; no comparable result exists for resistance training, and the acute open-window claim is questioned by the position statement usually cited for it.",
    source: { citation: "Nieman DC et al. (2011). Br J Sports Med.", doi: "10.1136/bjsm.2010.077875" },
  },
  {
    id: "r006",
    rarity: "rare",
    title: "Thomas Topham's lift",
    category: "history",
    body:
      "On 28 May 1741 the London strongman Thomas Topham raised three hogsheads of water, 1,836 lb or 833 kg, from the ground using a rope and tackle harness, a feat recorded in a contemporary etching. Harness lifts of this kind are not comparable to a modern barbell deadlift.",
    source: {
      citation:
        "Webster DP (1976). The Iron Game: An Illustrated History of Weight-Lifting. John Geddes. ISBN 0950682101. Contemporary etching: Wellcome Collection.",
      doi: null,
    },
  },
  {
    id: "r007",
    rarity: "rare",
    title: "Why your nose runs in the cold",
    category: "biology",
    body:
      "Cold-air rhinorrhoea is cholinergic: 96 percent of 90 patients reported it, and atropine blocked it in 92 percent of the 14 tested. Exercise itself normally produces sympathetic nasal decongestion, so the running nose belongs to the air rather than to the effort.",
    source: {
      citation: "Silvers WS (1991). The skier's nose: a model of cold-induced rhinorrhea. Annals of Allergy 67(1):32-36. PMID 1859038.",
      doi: null,
    },
  },
  {
    id: "r008",
    rarity: "rare",
    title: "Partial sleep restriction and lifting",
    category: "recovery",
    body:
      "Eight men slept 3 hours a night for three nights. Bench press, leg press and deadlift performance all declined significantly, p < 0.001; the biceps curl did not. The study had no total-deprivation arm, and the percentage losses usually quoted for it are not in the paper.",
    source: {
      citation: "Reilly T, Piercy M (1994). The effect of partial sleep deprivation on weight-lifting performance. Ergonomics 37(1):107-115.",
      doi: "10.1080/00140139408963628",
    },
  },
  {
    id: "r009",
    rarity: "rare",
    title: "Early gains are mostly neural",
    category: "biology",
    body:
      "Strength gained in the first weeks of training is predominantly neural, though the precise locus of the adaptation remains unresolved. Measurable hypertrophy starts earlier than usually claimed: vastus lateralis anatomical cross-sectional area rose 2.9 plus or minus 2.7 percent after two weeks.",
    source: {
      citation:
        "Skarabot J et al. (2021). Eur J Appl Physiol 121(3):675-685. Early hypertrophy: Bontemps B et al. (2022). Eur J Appl Physiol 122(4):1071-1084.",
      doi: "10.1007/s00421-020-04567-3",
    },
  },
  {
    id: "r010",
    rarity: "rare",
    title: "The milk-mucus belief",
    category: "nutrition",
    body:
      "In a blinded sensory comparison of cow's milk against a soy placebo, 3 of 14 mucus-related indicators rose, and rose equally in both arms. The sensation tracks the texture of the drink rather than the dairy in it.",
    source: {
      citation:
        "Pinnock CB, Arney WK (1993). The milk-mucus belief: sensory analysis comparing cow's milk and a soy placebo. Appetite 20(1):61-70.",
      doi: "10.1006/appe.1993.1006",
    },
  },
  {
    id: "r011",
    rarity: "rare",
    title: "Cold water immersion after lifting",
    category: "recovery",
    body:
      "Ten minutes of immersion at 10.1 plus or minus 0.3 degrees C within five minutes of each session left quadriceps lean mass up 103 plus or minus 71 g, against 309 plus or minus 73 g for active recovery. Type II fibre cross-sectional area rose 17.1 plus or minus 5.1 percent with active recovery, p = 0.009, and not at all with immersion, p = 0.10.",
    source: {
      citation:
        "Roberts LA et al. (2015). Post-exercise cold water immersion attenuates acute anabolic signalling and long-term adaptations in muscle to strength training. J Physiol 593(18):4285-4301.",
      doi: "10.1113/JP270570",
    },
  },
  {
    id: "r012",
    rarity: "rare",
    title: "Grip strength and mortality",
    category: "biology",
    body:
      "In a cohort aged 35 to 70 at enrolment, each 5 kg decrement in grip strength was associated with a 16 percent higher hazard of death, HR 1.16, 95 percent CI 1.13 to 1.20, over a median 4.0 years of follow-up. Grip strength was a stronger predictor of mortality than systolic blood pressure.",
    source: {
      citation:
        "Leong DP et al. (2015). Prognostic value of grip strength: findings from the Prospective Urban Rural Epidemiology (PURE) study. Lancet 386(9990):266-273.",
      doi: "10.1016/S0140-6736(14)62000-6",
    },
  },
];

export const SPECIMEN_BY_ID: Readonly<Record<string, SpecimenCard>> = Object.fromEntries(
  SPECIMEN_CARDS.map((c) => [c.id, c]),
);
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/content/specimenCards.test.ts
```

Expected: PASS — 11 passed.

- [ ] **Step 5: Confirm the CI personal-data gate is clean for this file**

```bash
git grep -nEi 'vyvanse|lisdexamfetamine|ymca|amphetamine' -- src/content/
```

Expected: no output, exit status 1.

- [ ] **Step 6: Lint and commit**

```bash
npx eslint src/content/specimenCards.ts src/content/specimenCards.test.ts
npm test
git add src/content/specimenCards.ts src/content/specimenCards.test.ts
git commit -m "feat: rebuild specimen card library from the content peer review (37 cards, verified citations)"
```

Expected: eslint silent; `npm test` all suites pass.

---

### Task 2: Seeded PRNG and the corrected specimen draw

The legacy mechanic (`legacy/console-store.jsx:184-189`, `legacy/console-content.js:706-711`) rolled `Math.random() < 0.15` per logged set and drew from the unowned pool. The content review §2.2 computed that this exhausts the 42-card library in about 3.2 weeks of a 24-week programme, leaving the reward loop dead for roughly 87 percent of it. Code review A57 adds that the roll ran inside a React state updater, and A58 that the rare tier is a 12-of-42 slice.

This task fixes the economy and the placement. Randomness is a parameter, so the whole mechanic is deterministic under test.

**Files:**
- Create: `src/domain/fun/rng.ts`, `src/domain/fun/specimens.ts`
- Test: `src/domain/fun/rng.test.ts`, `src/domain/fun/specimens.test.ts`

**Interfaces:**
- Consumes: `SPECIMEN_CARDS`, `RARITY_WEIGHT`, `SpecimenCard` from `src/content/specimenCards.ts` (Task 1); `SpecimenInventory` from `src/domain/types.ts` (master plan §5).
- Produces:
  ```ts
  // src/domain/fun/rng.ts
  export function mulberry32(seed: number): () => number;   // uniform [0, 1)
  export function systemRng(): number;                       // Math.random passthrough, one place

  // src/domain/fun/specimens.ts
  export const SPECIMEN_DROP_CHANCE: number;                 // 0.02
  export function drawSpecimen(
    inventory: SpecimenInventory | undefined,
    cards: readonly SpecimenCard[],
    rng: () => number,
    dropChance: number,
  ): SpecimenCard | null;
  export function expectedRarityShares(cards: readonly SpecimenCard[]): Record<SpecimenRarity, number>;
  ```

- [ ] **Step 1: Write the failing PRNG test**

Create `src/domain/fun/rng.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mulberry32 } from "./rng";

describe("mulberry32", () => {
  it("returns values in [0, 1)", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 10_000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different streams for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("is roughly uniform over 100000 draws", () => {
    const rng = mulberry32(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i += 1) {
      const idx = Math.min(9, Math.floor(rng() * 10));
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
    // Expected 10,000 per bucket; SD = sqrt(100000 * 0.1 * 0.9) = 94.9, so 600 is > 6 SD.
    for (const b of buckets) expect(Math.abs(b - 10_000)).toBeLessThan(600);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/domain/fun/rng.test.ts
```

Expected: FAIL — `Failed to resolve import "./rng"`.

- [ ] **Step 3: Write the PRNG**

Create `src/domain/fun/rng.ts`:

```ts
// A seedable 32-bit PRNG so every random mechanic in the app can be replayed in a test.
// mulberry32 is a public-domain generator with a 2^32 period; it is used for reproducible
// gameplay randomness, never for anything security-relevant. Ids use crypto.randomUUID().

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The production source of randomness. One call site so tests can see what they replaced. */
export function systemRng(): number {
  return Math.random();
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/domain/fun/rng.test.ts
```

Expected: PASS — 4 passed.

- [ ] **Step 5: Write the failing draw test**

Create `src/domain/fun/specimens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SPECIMEN_CARDS, RARITY_WEIGHT } from "../../content/specimenCards";
import type { SpecimenRarity } from "../../content/specimenCards";
import type { SpecimenInventory } from "../types";
import { mulberry32 } from "./rng";
import { drawSpecimen, expectedRarityShares, SPECIMEN_DROP_CHANCE } from "./specimens";

function emptyInventory(): SpecimenInventory {
  return { profileId: "p1", acquired: {}, totalSetsLogged: 0 };
}

/** Runs one simulated programme and returns how many logged sets it took to collect every card. */
function setsToComplete(seed: number, dropChance: number): number {
  const rng = mulberry32(seed);
  const inv = emptyInventory();
  let sets = 0;
  // Hard stop at 100,000 sets so a broken implementation fails the assertion, not the runner.
  while (Object.keys(inv.acquired).length < SPECIMEN_CARDS.length && sets < 100_000) {
    sets += 1;
    const card = drawSpecimen(inv, SPECIMEN_CARDS, rng, dropChance);
    if (card) inv.acquired[card.id] = { at: sets, exerciseId: null };
  }
  return sets;
}

describe("expectedRarityShares", () => {
  it("computes the weighted pool share of each rarity", () => {
    const shares = expectedRarityShares(SPECIMEN_CARDS);
    // 12 common x 6 + 13 uncommon x 3 + 12 rare x 1 = 72 + 39 + 12 = 123 weight units.
    expect(shares.common).toBeCloseTo(72 / 123, 6);
    expect(shares.uncommon).toBeCloseTo(39 / 123, 6);
    expect(shares.rare).toBeCloseTo(12 / 123, 6);
    expect(shares.common + shares.uncommon + shares.rare).toBeCloseTo(1, 10);
  });
});

describe("drawSpecimen", () => {
  it("returns null when the roll fails", () => {
    // rng() = 0.99 on the first call, which is >= any sane drop chance.
    const rng = () => 0.99;
    expect(drawSpecimen(emptyInventory(), SPECIMEN_CARDS, rng, 0.02)).toBeNull();
  });

  it("returns null when dropChance is zero, without consuming randomness", () => {
    let calls = 0;
    const rng = () => {
      calls += 1;
      return 0;
    };
    expect(drawSpecimen(emptyInventory(), SPECIMEN_CARDS, rng, 0)).toBeNull();
    expect(calls).toBe(0);
  });

  // G6: an exhausted pool returns null instead of throwing.
  it("returns null rather than throwing when the pool is empty", () => {
    const inv = emptyInventory();
    for (const c of SPECIMEN_CARDS) inv.acquired[c.id] = { at: 1, exerciseId: null };
    expect(() => drawSpecimen(inv, SPECIMEN_CARDS, mulberry32(1), 1)).not.toThrow();
    expect(drawSpecimen(inv, SPECIMEN_CARDS, mulberry32(1), 1)).toBeNull();
  });

  it("tolerates a missing inventory", () => {
    const card = drawSpecimen(undefined, SPECIMEN_CARDS, mulberry32(3), 1);
    expect(card).not.toBeNull();
  });

  // G5: the master plan §7 P8 gate.
  it("keeps rarity proportions within 2 percentage points over 10,000 draws", () => {
    const rng = mulberry32(20260901);
    const counts: Record<SpecimenRarity, number> = { common: 0, uncommon: 0, rare: 0 };
    const n = 10_000;
    for (let i = 0; i < n; i += 1) {
      const card = drawSpecimen(emptyInventory(), SPECIMEN_CARDS, rng, 1);
      expect(card).not.toBeNull();
      if (card) counts[card.rarity] += 1;
    }
    const expected = expectedRarityShares(SPECIMEN_CARDS);
    for (const rarity of ["common", "uncommon", "rare"] as const) {
      const observed = counts[rarity] / n;
      expect(Math.abs(observed - expected[rarity]), rarity).toBeLessThan(0.02);
    }
  });

  it("weights common cards above rare ones in the same pool", () => {
    expect(RARITY_WEIGHT.common).toBeGreaterThan(RARITY_WEIGHT.uncommon);
    expect(RARITY_WEIGHT.uncommon).toBeGreaterThan(RARITY_WEIGHT.rare);
  });

  // G6: excluding owned cards means a drop never repeats, so exactly N drops complete the pool.
  it("never repeats a card and returns null on the drop after the last one", () => {
    const rng = mulberry32(99);
    const inv = emptyInventory();
    const seen: string[] = [];
    for (let i = 0; i < SPECIMEN_CARDS.length; i += 1) {
      const card = drawSpecimen(inv, SPECIMEN_CARDS, rng, 1);
      expect(card, `draw ${i}`).not.toBeNull();
      if (card) {
        seen.push(card.id);
        inv.acquired[card.id] = { at: i, exerciseId: null };
      }
    }
    expect(new Set(seen).size).toBe(SPECIMEN_CARDS.length);
    expect(drawSpecimen(inv, SPECIMEN_CARDS, rng, 1)).toBeNull();
  });
});

describe("drop-chance economy", () => {
  it("uses the tuned 2 percent chance", () => {
    expect(SPECIMEN_DROP_CHANCE).toBe(0.02);
  });

  // G7: at 4 sessions/week x ~20 sets = 80 logged sets/week, completion should land near the
  // 24-week programme length. Mean sets-to-complete is N/p = 37/0.02 = 1850 (23.1 weeks);
  // SD = sqrt(N(1-p))/p = 301 sets. The median over 200 runs has SD ~27, so this band is ~7 SD.
  it("completes the pool in a median 1650-2050 logged sets across 200 programmes", () => {
    const runs: number[] = [];
    for (let seed = 1; seed <= 200; seed += 1) runs.push(setsToComplete(seed, SPECIMEN_DROP_CHANCE));
    runs.sort((a, b) => a - b);
    const median = (runs[99]! + runs[100]!) / 2;
    expect(median).toBeGreaterThanOrEqual(1650);
    expect(median).toBeLessThanOrEqual(2050);
  });

  // G8: the legacy 15 percent rate exhausted 42 cards in about 280 logged sets. At the tuned
  // rate, that same budget must not come close to emptying the pool.
  it("collects fewer than 15 cards over the 280 sets that exhausted the legacy pool", () => {
    const rng = mulberry32(555);
    const inv = emptyInventory();
    for (let i = 0; i < 280; i += 1) {
      const card = drawSpecimen(inv, SPECIMEN_CARDS, rng, SPECIMEN_DROP_CHANCE);
      if (card) inv.acquired[card.id] = { at: i, exerciseId: null };
    }
    expect(Object.keys(inv.acquired).length).toBeLessThan(15);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
npx vitest run src/domain/fun/specimens.test.ts
```

Expected: FAIL — `Failed to resolve import "./specimens"`.

- [ ] **Step 7: Write the draw**

Create `src/domain/fun/specimens.ts`:

```ts
import type { SpecimenCard, SpecimenRarity } from "../../content/specimenCards";
import { RARITY_WEIGHT } from "../../content/specimenCards";
import type { SpecimenInventory } from "../types";

// ---------------------------------------------------------------------------
// Drop-chance arithmetic. Show the working; the number is not a taste call.
//
//   Cards in the pool                       N = 37
//   Default availability                    4 sessions/week
//   Working sets per session                ~20
//   Logged sets per week                    4 x 20 = 80
//   Programme length (master plan §3)       24 weeks = 1920 logged sets
//
// A drop is only ever taken from the not-yet-owned pool, so no drop is ever a duplicate and
// completing the collection takes exactly N drops. The number of logged sets that requires is
// the sum of N geometric(p) variables:
//
//   E[sets] = N / p                         SD[sets] = sqrt(N (1 - p)) / p
//
//   p = 0.02  ->  E = 37 / 0.02   = 1850 sets = 23.1 weeks   (96 % of the programme)
//                 SD = sqrt(37 x 0.98) / 0.02 = 301 sets = 3.8 weeks
//
// So a typical user finishes the Atlas between roughly week 19 and week 27: the mechanic stays
// alive for the whole programme and completing it is an event rather than a formality.
//
// Legacy comparison (content review §2.2): p = 0.15 with 42 cards gives 42 / 0.15 = 280 sets.
// At the legacy 70-89 sets/week that is ~3.2 weeks, after which every set produced nothing for
// the remaining ~87 % of the programme. That is the defect this constant exists to fix.
//
// The review's own recommendation was "~1.5 %"; 2 % is chosen instead because it lands the
// expectation on the programme length for the app's default 4-sessions-a-week availability,
// which the review did not have (it assumed the legacy fixed 7-day split).
// ---------------------------------------------------------------------------
export const SPECIMEN_DROP_CHANCE = 0.02;

/**
 * Share of drops each rarity should win from a full pool, given the rarity weights.
 * For the shipped 37-card pool: common 0.5854, uncommon 0.3171, rare 0.0976.
 */
export function expectedRarityShares(cards: readonly SpecimenCard[]): Record<SpecimenRarity, number> {
  const weight: Record<SpecimenRarity, number> = { common: 0, uncommon: 0, rare: 0 };
  let total = 0;
  for (const c of cards) {
    const w = RARITY_WEIGHT[c.rarity];
    weight[c.rarity] += w;
    total += w;
  }
  if (total === 0) return { common: 0, uncommon: 0, rare: 0 };
  return {
    common: weight.common / total,
    uncommon: weight.uncommon / total,
    rare: weight.rare / total,
  };
}

/**
 * Attempt one specimen drop for a logged set.
 *
 * Consumes at most two values from `rng`: one for the drop roll, one to select the card.
 * `rng` is a parameter rather than a module-level `Math.random` so the caller can keep the roll
 * out of any React state updater (code review A57) and so the economy is testable.
 *
 * Returns the drawn card, or null when the roll fails, the pool is exhausted, or `dropChance`
 * is not positive. It never throws.
 */
export function drawSpecimen(
  inventory: SpecimenInventory | undefined,
  cards: readonly SpecimenCard[],
  rng: () => number,
  dropChance: number,
): SpecimenCard | null {
  if (!(dropChance > 0)) return null;
  if (rng() >= dropChance) return null;

  const owned = inventory?.acquired ?? {};
  const pool = cards.filter((c) => !Object.prototype.hasOwnProperty.call(owned, c.id));
  if (pool.length === 0) return null;

  let total = 0;
  for (const c of pool) total += RARITY_WEIGHT[c.rarity];
  if (total <= 0) return null;

  let ticket = rng() * total;
  for (const c of pool) {
    ticket -= RARITY_WEIGHT[c.rarity];
    if (ticket < 0) return c;
  }
  // Floating-point guard: only reachable if ticket lands exactly on `total`.
  return pool[pool.length - 1] ?? null;
}
```

- [ ] **Step 8: Run it to verify it passes**

```bash
npx vitest run src/domain/fun/specimens.test.ts
```

Expected: PASS — 10 passed. The rarity test reports observed shares within 0.02 of 0.5854 / 0.3171 / 0.0976 and the economy test reports a median in [1650, 2050].

- [ ] **Step 9: Lint and commit**

```bash
npx eslint src/domain/fun/
npm test
git add src/domain/fun/
git commit -m "feat: seeded PRNG and rarity-weighted specimen draw tuned to programme length"
```

Expected: eslint silent; `npm test` all suites pass.

---

### Task 3: One ordered toast queue

The legacy app kept four independent single-value slots in persisted state — `lastTelemetry`, `lastDrop`, `lastMilestone`, `lastDeletedSet` (`legacy/console-app.jsx:190-215`) — each rendered by its own component with its own timer. Code review A59 records the consequence: a second specimen drop inside the first one's 12-second window silently replaced it, so the card was credited without ever being shown. A43 records the other consequence: those timers fire mid-import and re-persist stale state.

This task replaces all four with one ordered, non-persisted queue.

**Rules:**
- Priority order, highest first: `undo` > `milestone` > `coach` > `telemetry` > `specimen`. Undo is first because it is the only class with a deadline the user can miss irreversibly; the brief's `undo > coach > telemetry > specimen` ordering is preserved as a subsequence.
- At most one toast per class is visible. A second toast of the same class waits in the queue and becomes visible when the first is dismissed. This is the A59 fix.
- Auto-dismiss durations are the legacy values: specimen 12000 ms (`legacy/console-fun.jsx:77`), milestone 7000 ms (`:449`), undo 6000 ms (`:517`), coach and telemetry 4500 ms (`:105`).
- A toast's timer starts when it becomes *visible*, not when it is queued.
- The queue lives in React state only. Nothing here is persisted, so it cannot race persistence.

**Files:**
- Create: `src/ui/components/ToastQueue.tsx`
- Test: `src/ui/components/ToastQueue.test.tsx`
- Reference (read-only): `legacy/console-fun.jsx` (`SpecimenDrop`, `TelemetryToast`, `MilestoneToast`, `UndoToast`)

**Interfaces:**
- Consumes: `SPECIMEN_BY_ID` from `src/content/specimenCards.ts` (Task 1); `newId` from `src/domain/ids.ts`.
- Produces:
  ```ts
  export type ToastKind = "undo" | "milestone" | "coach" | "telemetry" | "specimen";
  export type ToastInput =
    | { kind: "undo"; message: string; onUndo: () => void }
    | { kind: "milestone"; count: number }
    | { kind: "coach"; message: string }
    | { kind: "telemetry"; message: string }
    | { kind: "specimen"; cardId: string };
  export type Toast = ToastInput & { id: string };
  export const TOAST_PRIORITY: readonly ToastKind[];              // undo, milestone, coach, telemetry, specimen
  export const TOAST_DURATION_MS: Readonly<Record<ToastKind, number>>;
  export function selectVisible(queue: readonly Toast[]): Toast[];
  export function ToastProvider(props: { children: React.ReactNode }): React.ReactElement;
  export function useToasts(): { queue: Toast[]; visible: Toast[]; push(t: ToastInput): string; dismiss(id: string): void; clear(): void };
  export function ToastQueue(): React.ReactElement | null;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/ui/components/ToastQueue.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ToastProvider, ToastQueue, useToasts, selectVisible, TOAST_DURATION_MS } from "./ToastQueue";
import type { Toast } from "./ToastQueue";

function t(id: string, kind: Toast["kind"]): Toast {
  if (kind === "undo") return { id, kind, message: "deleted", onUndo: () => {} };
  if (kind === "milestone") return { id, kind, count: 50 };
  if (kind === "specimen") return { id, kind, cardId: "c001" };
  return { id, kind, message: "msg" };
}

let api: ReturnType<typeof useToasts> | null = null;
function Probe(): ReactElement {
  api = useToasts();
  return <ToastQueue />;
}
function renderQueue() {
  return render(
    <ToastProvider>
      <Probe />
    </ToastProvider>,
  );
}

describe("selectVisible", () => {
  // G9
  it("orders classes undo > milestone > coach > telemetry > specimen", () => {
    const queue = [t("1", "specimen"), t("2", "telemetry"), t("3", "coach"), t("4", "milestone"), t("5", "undo")];
    expect(selectVisible(queue).map((x) => x.kind)).toEqual(["undo", "milestone", "coach", "telemetry", "specimen"]);
  });

  // G9: the A59 fix. The second specimen waits instead of replacing the first.
  it("shows only the first queued toast of each class", () => {
    const queue = [t("1", "specimen"), t("2", "specimen"), t("3", "telemetry")];
    expect(selectVisible(queue).map((x) => x.id)).toEqual(["3", "1"]);
  });

  it("returns nothing for an empty queue", () => {
    expect(selectVisible([])).toEqual([]);
  });
});

describe("useToasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api = null;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("queues a pushed toast and returns its id", () => {
    renderQueue();
    let id = "";
    act(() => {
      id = api!.push({ kind: "telemetry", message: "set banked" });
    });
    expect(id).not.toBe("");
    expect(api!.queue).toHaveLength(1);
    expect(screen.getByText("set banked")).toBeTruthy();
  });

  it("dismisses by id", () => {
    renderQueue();
    let id = "";
    act(() => {
      id = api!.push({ kind: "telemetry", message: "set banked" });
    });
    act(() => {
      api!.dismiss(id);
    });
    expect(api!.queue).toHaveLength(0);
    expect(screen.queryByText("set banked")).toBeNull();
  });

  it("auto-dismisses each class after its legacy duration", () => {
    renderQueue();
    act(() => {
      api!.push({ kind: "telemetry", message: "telemetry line" });
      api!.push({ kind: "specimen", cardId: "c001" });
    });
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS.telemetry);
    });
    expect(screen.queryByText("telemetry line")).toBeNull();
    expect(screen.queryByText(/A 1RM is an estimate|post-exercise anabolic window|SPECIMEN/i)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS.specimen - TOAST_DURATION_MS.telemetry);
    });
    expect(api!.queue).toHaveLength(0);
  });

  it("starts a queued toast's timer only once it becomes visible", () => {
    renderQueue();
    act(() => {
      api!.push({ kind: "specimen", cardId: "c001" });
      api!.push({ kind: "specimen", cardId: "c002" });
    });
    // First specimen expires; the second becomes visible and gets a full duration of its own.
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS.specimen);
    });
    expect(api!.queue).toHaveLength(1);
    expect(api!.queue[0]!.kind).toBe("specimen");
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS.specimen - 1);
    });
    expect(api!.queue).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(api!.queue).toHaveLength(0);
  });

  it("runs the undo callback and dismisses the toast", () => {
    renderQueue();
    const onUndo = vi.fn();
    act(() => {
      api!.push({ kind: "undo", message: "set 3 deleted", onUndo });
    });
    act(() => {
      screen.getByRole("button", { name: /undo/i }).click();
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(api!.queue).toHaveLength(0);
  });

  it("renders a milestone count and a specimen card title", () => {
    renderQueue();
    act(() => {
      api!.push({ kind: "milestone", count: 250 });
      api!.push({ kind: "specimen", cardId: "c005" });
    });
    expect(screen.getByText("250")).toBeTruthy();
    expect(screen.getByText("Volume and hypertrophy")).toBeTruthy();
  });

  it("ignores a specimen toast for an unknown card id", () => {
    renderQueue();
    act(() => {
      api!.push({ kind: "specimen", cardId: "nope" });
    });
    expect(screen.queryByText(/SPECIMEN ACQUIRED/i)).toBeNull();
  });

  it("clears everything", () => {
    renderQueue();
    act(() => {
      api!.push({ kind: "coach", message: "hold this load" });
      api!.push({ kind: "telemetry", message: "banked" });
      api!.clear();
    });
    expect(api!.queue).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/ui/components/ToastQueue.test.tsx
```

Expected: FAIL — `Failed to resolve import "./ToastQueue"`.

- [ ] **Step 3: Write the toast queue**

Create `src/ui/components/ToastQueue.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { SPECIMEN_BY_ID } from "../../content/specimenCards";
import { newId } from "../../domain/ids";

export type ToastKind = "undo" | "milestone" | "coach" | "telemetry" | "specimen";

export type ToastInput =
  | { kind: "undo"; message: string; onUndo: () => void }
  | { kind: "milestone"; count: number }
  | { kind: "coach"; message: string }
  | { kind: "telemetry"; message: string }
  | { kind: "specimen"; cardId: string };

export type Toast = ToastInput & { id: string };

/**
 * Highest priority first. `undo` leads because it is the only class carrying a deadline the user
 * can miss irreversibly. The rest keep the legacy ordering.
 */
export const TOAST_PRIORITY: readonly ToastKind[] = ["undo", "milestone", "coach", "telemetry", "specimen"];

/** Auto-dismiss durations in milliseconds, carried over from the legacy components. */
export const TOAST_DURATION_MS: Readonly<Record<ToastKind, number>> = {
  undo: 6000, // legacy/console-fun.jsx UndoToast
  milestone: 7000, // legacy/console-fun.jsx MilestoneToast
  coach: 4500, // legacy/console-fun.jsx TelemetryToast (coach tone)
  telemetry: 4500, // legacy/console-fun.jsx TelemetryToast
  specimen: 12000, // legacy/console-fun.jsx SpecimenDrop
};

/**
 * The visible set: the earliest queued toast of each class, ordered by class priority.
 * A second toast of a class waits rather than replacing the first (code review A59).
 */
export function selectVisible(queue: readonly Toast[]): Toast[] {
  const out: Toast[] = [];
  for (const kind of TOAST_PRIORITY) {
    const first = queue.find((t) => t.kind === kind);
    if (first) out.push(first);
  }
  return out;
}

interface ToastApi {
  queue: Toast[];
  visible: Toast[];
  push(input: ToastInput): string;
  dismiss(id: string): void;
  clear(): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  const [queue, setQueue] = useState<Toast[]>([]);

  const push = useCallback((input: ToastInput): string => {
    const id = newId();
    setQueue((q) => [...q, { ...input, id }]);
    return id;
  }, []);

  const dismiss = useCallback((id: string): void => {
    setQueue((q) => q.filter((t) => t.id !== id));
  }, []);

  const clear = useCallback((): void => {
    setQueue([]);
  }, []);

  const visible = useMemo(() => selectVisible(queue), [queue]);
  const value = useMemo<ToastApi>(() => ({ queue, visible, push, dismiss, clear }), [queue, visible, push, dismiss, clear]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToasts(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToasts must be used inside <ToastProvider>");
  return ctx;
}

function ToastShell({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }): ReactElement | null {
  const { id, kind } = toast;
  // The timer starts when the toast becomes visible, which is when this component mounts.
  useEffect(() => {
    const handle = setTimeout(() => onDismiss(id), TOAST_DURATION_MS[kind]);
    return () => clearTimeout(handle);
  }, [id, kind, onDismiss]);

  if (toast.kind === "undo") {
    return (
      <div className="toast toast-undo" role="status">
        <span className="toast-tag">DELETED</span>
        <span className="toast-msg">{toast.message}</span>
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.onUndo();
            onDismiss(id);
          }}
        >
          Undo
        </button>
      </div>
    );
  }

  if (toast.kind === "milestone") {
    return (
      <button type="button" className="toast toast-milestone" onClick={() => onDismiss(id)}>
        <span className="toast-count">{toast.count}</span>
        <span className="toast-label">sets logged</span>
      </button>
    );
  }

  if (toast.kind === "specimen") {
    const card = SPECIMEN_BY_ID[toast.cardId];
    if (!card) return null;
    return (
      <button type="button" className={`toast toast-specimen rarity-${card.rarity}`} onClick={() => onDismiss(id)}>
        <span className="toast-tag">{card.rarity.toUpperCase()} SPECIMEN ACQUIRED</span>
        <span className="toast-cat">{card.category}</span>
        <span className="toast-title">{card.title}</span>
        <span className="toast-body">{card.body}</span>
        <span className="toast-source">{card.source.citation}</span>
      </button>
    );
  }

  return (
    <button type="button" className={`toast toast-${toast.kind}`} onClick={() => onDismiss(id)}>
      <span className="toast-tag">{toast.kind === "coach" ? "COACH" : "TELEMETRY"}</span>
      <span className="toast-msg">{toast.message}</span>
    </button>
  );
}

export function ToastQueue(): ReactElement | null {
  const { visible, dismiss } = useToasts();
  if (visible.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {visible.map((t) => (
        <ToastShell key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/ui/components/ToastQueue.test.tsx
```

Expected: PASS — 12 passed.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/ui/components/ToastQueue.tsx src/ui/components/ToastQueue.test.tsx
npm test
git add src/ui/components/ToastQueue.tsx src/ui/components/ToastQueue.test.tsx
git commit -m "feat: single priority toast queue replacing the four legacy lastX slots"
```

Expected: eslint silent; `npm test` all suites pass.

---

### Task 4: Store actions for specimens, capsule and UI preferences

Three defects from the code review are fixed here at once.

- **A57** — the drop roll ran inside a React state updater, so a re-invoked updater could yield different state. The roll moves out: `attemptSpecimenDraw` reads state with `get()`, rolls, and then dispatches a pure `recordSpecimen`.
- **A46** — `logSet` read `wasNew` from the render closure, so two logs in one batch both saw a stale value and double-counted. The counter increment moves inside the updater and reads `p`, the updater's own argument.
- **A47** — `totalSetsLogged` only ever increased, so log-delete-log inflated it away from the real set count. `deleteSet` now decrements, clamped at zero.

This task also adds the one persisted field P8 needs that master plan §5 does not yet have: `UiPrefs.lastBlockSeenByProfile`, used by Task 10 to show each phase cutscene once. It is additive with a Zod default, so no schema version bump and no migration are required.

**Files:**
- Modify: `src/domain/types.ts` (the `UiPrefs` interface)
- Modify: `src/domain/schema.ts` (the matching Zod object)
- Modify: `src/store/index.ts` (`AppActions`, `logSet`, `deleteSet`, new actions)
- Create: `src/test/funFixtures.ts`
- Test: `src/store/funActions.test.ts`
- Reference (read-only): `legacy/console-store.jsx:150-215`

**Interfaces:**
- Consumes: `drawSpecimen`, `SPECIMEN_DROP_CHANCE` from `src/domain/fun/specimens.ts`; `systemRng` from `src/domain/fun/rng.ts`; `SPECIMEN_CARDS` from `src/content/specimenCards.ts`; `useAppStore` from `src/store/index.ts`.
- Produces:
  ```ts
  // src/domain/types.ts (added field)
  export interface UiPrefs {
    bootSeen: boolean; lastView: string; accent: string; scanlines: boolean;
    flicker: boolean; density: "compact" | "normal";
    lastBlockSeenByProfile: Record<string, number>;   // P8: highest PlanBlock.index whose cutscene has played
  }

  // src/store/index.ts (added actions)
  recordSpecimen(profileId: string, cardId: string, exerciseId: string | null, now: EpochMs): void;
  setCapsule(profileId: string, c: TimeCapsule | null): void;
  setUi(patch: Partial<UiPrefs>): void;
  attemptSpecimenDraw(profileId: string, exerciseId: string | null, now: EpochMs, rng?: () => number): SpecimenCard | null;

  // src/test/funFixtures.ts
  export function makeProfile(over?: Partial<Profile>): Profile;
  export function makePlan(over?: Partial<PlanTemplate>): PlanTemplate;
  export function makeAppState(over?: Partial<AppState>): AppState;
  ```

- [ ] **Step 1: Write the test fixtures**

Create `src/test/funFixtures.ts`:

```ts
// Minimal, valid domain objects for P8's UI and store tests. Values are arbitrary but internally
// consistent; nothing here is a real user's data.
import type {
  AppState,
  Availability,
  PlanCursor,
  PlanTemplate,
  Profile,
  SpecimenInventory,
  UiPrefs,
} from "../domain/types";

export function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    displayName: "Operator",
    timezone: "Europe/Athens",
    units: "metric",
    createdAt: 1_756_684_800_000, // 2026-09-01T00:00:00Z
    body: {
      sex: "male",
      birthYear: 1995,
      heightCm: 180, // cm
      baselineMassKg: 80, // kg
      baselineAt: "2026-09-01",
      baselineBodyFatPct: null,
    },
    activity: "moderate",
    experience: "novice",
    equipment: "full-gym",
    equipmentSteps: { barbellKg: 2.5, dumbbellPairKg: 5, stackKg: 5, hasMicroPlates: false }, // kg
    goal: { kind: "muscle-gain", targetMassKg: null, targetBodyFatPct: null, targetDate: null },
    supplements: { creatine: false },
    hydration: { dailyTargetML: 3000, cupSizeML: 250 }, // mL
    ...over,
  };
}

export function makePlan(over: Partial<PlanTemplate> = {}): PlanTemplate {
  const sessions = Array.from({ length: 24 }, (_, i) => ({
    id: `s${i + 1}`,
    ordinal: i + 1,
    name: `Session ${i + 1}`,
    kind: "lift" as const,
    label: i % 2 === 0 ? "Upper" : "Lower",
    exercises: [
      {
        exerciseId: i % 2 === 0 ? "bench-press" : "back-squat",
        setsLo: 3,
        setsHi: 4,
        prescription: { kind: "reps" as const, lo: 6, hi: 10 },
        restS: 120, // s
      },
    ],
  }));
  return {
    id: "plan1",
    version: 1,
    name: "Upper / Lower",
    sessionsPerWeek: 4,
    weeks: 6,
    sessions,
    blocks: [
      { index: 0, firstSessionIndex: 0, sessionCount: 8, setModifier: 1, loadModifier: 1, isDeload: false },
      { index: 1, firstSessionIndex: 8, sessionCount: 8, setModifier: 1, loadModifier: 1, isDeload: false },
      { index: 2, firstSessionIndex: 16, sessionCount: 8, setModifier: 1, loadModifier: 1, isDeload: false },
    ],
    ...over,
  };
}

export function makeUiPrefs(over: Partial<UiPrefs> = {}): UiPrefs {
  return {
    bootSeen: true,
    lastView: "today",
    accent: "#a3e635",
    scanlines: true,
    flicker: false,
    density: "normal",
    lastBlockSeenByProfile: {},
    ...over,
  };
}

export function makeInventory(over: Partial<SpecimenInventory> = {}): SpecimenInventory {
  return { profileId: "p1", acquired: {}, totalSetsLogged: 0, ...over };
}

export function makeAppState(over: Partial<AppState> = {}): AppState {
  const profile = makeProfile();
  const plan = makePlan();
  const cursor: PlanCursor = { planId: plan.id, nextSessionIndex: 0, startedOn: "2026-09-07", completedOn: null };
  const availability: Availability = {
    slots: [
      { weekday: 1, startTime: "18:00", expectedDurationS: 3600 }, // s
      { weekday: 2, startTime: "18:00", expectedDurationS: 3600 },
      { weekday: 4, startTime: "18:00", expectedDurationS: 3600 },
      { weekday: 5, startTime: "18:00", expectedDurationS: 3600 },
    ],
    weeklySessionTarget: 4,
  };
  return {
    schemaVersion: 3,
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    availability: { [profile.id]: availability },
    plans: { [plan.id]: plan },
    cursors: { [profile.id]: cursor },
    pauses: { [profile.id]: [] },
    assignments: { [profile.id]: [] },
    sets: {},
    bodyMass: { [profile.id]: [] },
    hydration: { [profile.id]: [] },
    intake: { [profile.id]: [] },
    weeklyReviews: { [profile.id]: [] },
    reminderSettings: {},
    pushDevice: null,
    motivation: {},
    specimens: { [profile.id]: makeInventory() },
    capsules: { [profile.id]: null },
    ui: makeUiPrefs(),
    ...over,
  };
}
```

- [ ] **Step 2: Write the failing store test**

Create `src/store/funActions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./index";
import { makeAppState } from "../test/funFixtures";
import { mulberry32 } from "../domain/fun/rng";
import { SPECIMEN_CARDS } from "../content/specimenCards";

const NOW = 1_757_000_000_000; // epoch ms, UTC

function seed(): void {
  useAppStore.setState(makeAppState());
}

describe("recordSpecimen", () => {
  beforeEach(seed);

  it("records a card with its acquisition time and exercise", () => {
    useAppStore.getState().recordSpecimen("p1", "c001", "bench-press", NOW);
    const inv = useAppStore.getState().specimens.p1;
    expect(inv?.acquired.c001).toEqual({ at: NOW, exerciseId: "bench-press" });
  });

  it("is idempotent: a second record does not overwrite the first timestamp", () => {
    useAppStore.getState().recordSpecimen("p1", "c001", "bench-press", NOW);
    useAppStore.getState().recordSpecimen("p1", "c001", "back-squat", NOW + 5000);
    expect(useAppStore.getState().specimens.p1?.acquired.c001).toEqual({ at: NOW, exerciseId: "bench-press" });
  });

  it("creates the inventory for a profile that has none", () => {
    useAppStore.setState(makeAppState({ specimens: {} }));
    useAppStore.getState().recordSpecimen("p1", "r003", null, NOW);
    const inv = useAppStore.getState().specimens.p1;
    expect(inv?.profileId).toBe("p1");
    expect(inv?.totalSetsLogged).toBe(0);
    expect(Object.keys(inv?.acquired ?? {})).toEqual(["r003"]);
  });

  it("ignores an unknown card id", () => {
    useAppStore.getState().recordSpecimen("p1", "not-a-card", null, NOW);
    expect(useAppStore.getState().specimens.p1?.acquired).toEqual({});
  });
});

describe("setCapsule and setUi", () => {
  beforeEach(seed);

  it("stores and clears a capsule", () => {
    const capsule = { note: "why I started", writtenAt: NOW, opensOn: "2026-10-19", opened: false };
    useAppStore.getState().setCapsule("p1", capsule);
    expect(useAppStore.getState().capsules.p1).toEqual(capsule);
    useAppStore.getState().setCapsule("p1", null);
    expect(useAppStore.getState().capsules.p1).toBeNull();
  });

  it("patches ui preferences without dropping the others", () => {
    useAppStore.getState().setUi({ bootSeen: false });
    const ui = useAppStore.getState().ui;
    expect(ui.bootSeen).toBe(false);
    expect(ui.density).toBe("normal");
    expect(ui.lastBlockSeenByProfile).toEqual({});
  });

  it("carries lastBlockSeenByProfile through a patch", () => {
    useAppStore.getState().setUi({ lastBlockSeenByProfile: { p1: 2 } });
    expect(useAppStore.getState().ui.lastBlockSeenByProfile).toEqual({ p1: 2 });
  });
});

describe("logSet and the set counter", () => {
  beforeEach(seed);

  const base = {
    profileId: "p1",
    assignmentDate: "2026-09-07",
    sessionId: "s1",
    exerciseId: "bench-press",
    setNumber: 1,
    isBonus: false,
    loadKg: 60, // kg
    enteredUnit: "metric" as const,
    reps: 8,
    durationS: null,
    rpe: 7,
  };

  // G10: A46 — two logs in one batch must both count.
  it("increments totalSetsLogged once per logged set, even back to back", () => {
    useAppStore.getState().logSet(base, NOW);
    useAppStore.getState().logSet({ ...base, setNumber: 2 }, NOW + 1000);
    expect(useAppStore.getState().specimens.p1?.totalSetsLogged).toBe(2);
  });

  // A60: a bodyweight set stores loadKg 0 and still counts.
  it("counts a bodyweight set logged at 0 kg", () => {
    useAppStore.getState().logSet({ ...base, exerciseId: "pull-up", loadKg: 0 }, NOW);
    expect(useAppStore.getState().specimens.p1?.totalSetsLogged).toBe(1);
  });

  // A47: the counter must track the real set count.
  it("decrements the counter when a set is deleted, clamped at zero", () => {
    const id = useAppStore.getState().logSet(base, NOW);
    expect(useAppStore.getState().specimens.p1?.totalSetsLogged).toBe(1);
    useAppStore.getState().deleteSet(id);
    expect(useAppStore.getState().specimens.p1?.totalSetsLogged).toBe(0);
    useAppStore.getState().deleteSet(id);
    expect(useAppStore.getState().specimens.p1?.totalSetsLogged).toBe(0);
  });
});

describe("attemptSpecimenDraw", () => {
  beforeEach(seed);

  it("records the drawn card and returns it", () => {
    // dropChance is applied inside; a generator that always returns 0 guarantees a drop.
    const card = useAppStore.getState().attemptSpecimenDraw("p1", "bench-press", NOW, () => 0);
    expect(card).not.toBeNull();
    expect(useAppStore.getState().specimens.p1?.acquired[card!.id]).toEqual({ at: NOW, exerciseId: "bench-press" });
  });

  it("returns null and records nothing when the roll fails", () => {
    const card = useAppStore.getState().attemptSpecimenDraw("p1", null, NOW, () => 0.99);
    expect(card).toBeNull();
    expect(useAppStore.getState().specimens.p1?.acquired).toEqual({});
  });

  it("returns null once the pool is exhausted", () => {
    const acquired: Record<string, { at: number; exerciseId: string | null }> = {};
    for (const c of SPECIMEN_CARDS) acquired[c.id] = { at: NOW, exerciseId: null };
    useAppStore.setState(makeAppState({ specimens: { p1: { profileId: "p1", acquired, totalSetsLogged: 100 } } }));
    expect(useAppStore.getState().attemptSpecimenDraw("p1", null, NOW, () => 0)).toBeNull();
  });

  it("is reproducible under a seeded generator", () => {
    const a = useAppStore.getState().attemptSpecimenDraw("p1", null, NOW, mulberry32(11));
    seed();
    const b = useAppStore.getState().attemptSpecimenDraw("p1", null, NOW, mulberry32(11));
    expect(a?.id).toBe(b?.id);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run src/store/funActions.test.ts
```

Expected: FAIL — `recordSpecimen is not a function` (and the other new actions likewise).

- [ ] **Step 4: Add the `UiPrefs` field to the shared types**

In `src/domain/types.ts`, replace the `UiPrefs` interface with:

```ts
// ---- ui preferences (persisted) ----
export interface UiPrefs {
  bootSeen: boolean;
  lastView: string;
  accent: string;
  scanlines: boolean;
  flicker: boolean;
  density: "compact" | "normal";
  /**
   * P8. Highest PlanBlock.index whose transition cutscene has already played, per profileId.
   * Keyed by profile because block progress is per profile while UiPrefs is global.
   * Absent key means no cutscene has played yet for that profile.
   */
  lastBlockSeenByProfile: Record<string, number>;
}
```

- [ ] **Step 5: Add the matching Zod field**

In `src/domain/schema.ts`, find the object schema mirroring `UiPrefs` and add the field. It carries a default so states written before P8 parse unchanged and no schema version bump is needed:

```ts
export const UiPrefsSchema = z.object({
  bootSeen: z.boolean(),
  lastView: z.string(),
  accent: z.string(),
  scanlines: z.boolean(),
  flicker: z.boolean(),
  density: z.enum(["compact", "normal"]),
  // Additive in P8. The default keeps CURRENT_SCHEMA_VERSION at 3: an existing v3 document
  // without this key still parses, and parse-then-serialise fills it in.
  lastBlockSeenByProfile: z.record(z.string(), z.number().int().nonnegative()).default({}),
});
```

- [ ] **Step 6: Add the store actions**

In `src/store/index.ts`, add the imports:

```ts
import { SPECIMEN_BY_ID, SPECIMEN_CARDS } from "../content/specimenCards";
import type { SpecimenCard } from "../content/specimenCards";
import { drawSpecimen, SPECIMEN_DROP_CHANCE } from "../domain/fun/specimens";
import { systemRng } from "../domain/fun/rng";
```

Extend `AppActions` with the P8 block (the first three are master plan §6.7 verbatim; the fourth is the A57 fix and is listed as an amendment at the end of this plan):

```ts
  // P8
  recordSpecimen(profileId: string, cardId: string, exerciseId: string | null, now: EpochMs): void;
  setCapsule(profileId: string, c: TimeCapsule | null): void;
  setUi(patch: Partial<UiPrefs>): void;
  attemptSpecimenDraw(profileId: string, exerciseId: string | null, now: EpochMs, rng?: () => number): SpecimenCard | null;
```

Add this helper above the `create(...)` call:

```ts
/** Returns the profile's inventory, creating an empty one if it does not exist yet. */
function ensureInventory(specimens: AppState["specimens"], profileId: string): SpecimenInventory {
  return specimens[profileId] ?? { profileId, acquired: {}, totalSetsLogged: 0 };
}
```

Add the action implementations inside the store creator:

```ts
  recordSpecimen(profileId, cardId, exerciseId, now) {
    if (!SPECIMEN_BY_ID[cardId]) return; // unknown id: nothing to record
    set((s) => {
      const inv = ensureInventory(s.specimens, profileId);
      if (Object.prototype.hasOwnProperty.call(inv.acquired, cardId)) return s; // first acquisition wins
      return {
        ...s,
        specimens: {
          ...s.specimens,
          [profileId]: { ...inv, acquired: { ...inv.acquired, [cardId]: { at: now, exerciseId } } },
        },
      };
    });
  },

  setCapsule(profileId, c) {
    set((s) => ({ ...s, capsules: { ...s.capsules, [profileId]: c } }));
  },

  setUi(patch) {
    set((s) => ({ ...s, ui: { ...s.ui, ...patch } }));
  },

  /**
   * Roll for a specimen drop and record the result.
   *
   * The roll happens here, outside any state updater, because React may invoke an updater more
   * than once for a single dispatch and a non-idempotent updater then yields different state
   * (code review A57). Recording goes through recordSpecimen, which is pure.
   */
  attemptSpecimenDraw(profileId, exerciseId, now, rng = systemRng) {
    const inventory = get().specimens[profileId];
    const card = drawSpecimen(inventory, SPECIMEN_CARDS, rng, SPECIMEN_DROP_CHANCE);
    if (!card) return null;
    get().recordSpecimen(profileId, card.id, exerciseId, now);
    return card;
  },
```

- [ ] **Step 7: Hook the set counter into `logSet` and `deleteSet`**

In `src/store/index.ts`, inside the existing `logSet` action's `set((s) => ...)` updater, add the counter increment to the object it returns. It reads the updater's own argument `s`, never a render closure, so two logs in one React batch both count (code review A46):

```ts
    // P8: totalSetsLogged drives specimen drops and milestone toasts. Incremented inside the
    // updater from `s`, never from a render closure (code review A46). A bodyweight set stores
    // loadKg 0 and counts like any other (code review A60).
    const inv = ensureInventory(s.specimens, entry.profileId);
    const specimens = {
      ...s.specimens,
      [entry.profileId]: { ...inv, totalSetsLogged: inv.totalSetsLogged + 1 },
    };
```

and include `specimens` in the returned state object.

In the existing `deleteSet` action's updater, add the matching decrement (code review A47):

```ts
    // P8: keep the counter equal to the real set count. Clamped so a double delete cannot
    // drive it negative.
    const removed = s.sets[id];
    const specimens = removed
      ? {
          ...s.specimens,
          [removed.profileId]: (() => {
            const inv = ensureInventory(s.specimens, removed.profileId);
            return { ...inv, totalSetsLogged: Math.max(0, inv.totalSetsLogged - 1) };
          })(),
        }
      : s.specimens;
```

and include `specimens` in the returned state object.

- [ ] **Step 8: Run the test to verify it passes**

```bash
npx vitest run src/store/funActions.test.ts
```

Expected: PASS — 15 passed.

- [ ] **Step 9: Prove no randomness leaked into the store layer**

```bash
grep -rn "Math.random" src/store/ src/domain/fun/specimens.ts
```

Expected: no output. `Math.random` exists only in `src/domain/fun/rng.ts` behind `systemRng`.

- [ ] **Step 10: Lint and commit**

```bash
npx eslint src/store/ src/domain/types.ts src/domain/schema.ts src/test/funFixtures.ts
npm test
git add src/domain/types.ts src/domain/schema.ts src/store/index.ts src/store/funActions.test.ts src/test/funFixtures.ts
git commit -m "feat: specimen, capsule and ui store actions with the drop roll outside the updater"
```

Expected: eslint silent; `npm test` all suites pass, including P1's schema round-trip suite (the new field has a default, so old fixtures still parse).

---

### Task 5: Atlas view

The legacy view (`legacy/console-fun.jsx` `AtlasView`) filtered on one axis only, mixing ownership and rarity into a single button row. This version gives rarity and category their own controls, keeps the locked-card teaser and the owned counts, and reads everything from the store.

**Files:**
- Create: `src/ui/views/AtlasView.tsx`
- Test: `src/ui/views/AtlasView.test.tsx`
- Reference (read-only): `legacy/console-fun.jsx` `AtlasView`

**Interfaces:**
- Consumes: `SPECIMEN_CARDS`, `SPECIMEN_CATEGORIES`, `SPECIMEN_RARITIES` from `src/content/specimenCards.ts`; `useAppStore` from `src/store/index.ts`.
- Produces: `export function AtlasView(): React.ReactElement` — routed as view id `atlas` (hotkey 6, Task 8).

- [ ] **Step 1: Write the failing test**

Create `src/ui/views/AtlasView.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AtlasView } from "./AtlasView";
import { useAppStore } from "../../store";
import { makeAppState } from "../../test/funFixtures";
import { SPECIMEN_CARDS } from "../../content/specimenCards";

const NOW = 1_757_000_000_000; // epoch ms, UTC

function seedOwned(ids: string[]): void {
  const acquired: Record<string, { at: number; exerciseId: string | null }> = {};
  for (const id of ids) acquired[id] = { at: NOW, exerciseId: "bench-press" };
  useAppStore.setState(makeAppState({ specimens: { p1: { profileId: "p1", acquired, totalSetsLogged: 40 } } }));
}

describe("AtlasView", () => {
  beforeEach(() => seedOwned([]));

  it("reports the owned count against the pool size", () => {
    seedOwned(["c001", "u003", "r003"]);
    render(<AtlasView />);
    expect(screen.getByTestId("atlas-owned-total").textContent).toBe(`3/${SPECIMEN_CARDS.length}`);
  });

  it("reports owned counts per rarity", () => {
    seedOwned(["c001", "c002", "u003"]);
    render(<AtlasView />);
    expect(screen.getByTestId("atlas-owned-common").textContent).toBe("2/12");
    expect(screen.getByTestId("atlas-owned-uncommon").textContent).toBe("1/13");
    expect(screen.getByTestId("atlas-owned-rare").textContent).toBe("0/12");
  });

  it("shows every card, owned or not", () => {
    render(<AtlasView />);
    expect(screen.getAllByTestId(/^atlas-card-/)).toHaveLength(SPECIMEN_CARDS.length);
  });

  it("hides the body of a locked card and shows a teaser instead", () => {
    render(<AtlasView />);
    expect(screen.queryByText(/post-exercise anabolic window is not supported/i)).toBeNull();
    const locked = screen.getByTestId("atlas-card-c001");
    expect(locked.textContent).toContain("UNDISCOVERED");
    expect(locked.textContent).toContain("nutrition");
    expect(locked.textContent).toContain("common");
  });

  it("reveals an owned card's body and citation when it is opened", () => {
    seedOwned(["c005"]);
    render(<AtlasView />);
    fireEvent.click(screen.getByTestId("atlas-card-c005"));
    expect(screen.getByText(/0.023 effect-size units per set/)).toBeTruthy();
    expect(screen.getByText(/J Sports Sci 35\(11\):1073-1082/)).toBeTruthy();
  });

  it("filters by rarity", () => {
    render(<AtlasView />);
    fireEvent.change(screen.getByLabelText("Rarity"), { target: { value: "rare" } });
    expect(screen.getAllByTestId(/^atlas-card-/)).toHaveLength(12);
    expect(screen.queryByTestId("atlas-card-c001")).toBeNull();
    expect(screen.getByTestId("atlas-card-r001")).toBeTruthy();
  });

  it("filters by category", () => {
    render(<AtlasView />);
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "history" } });
    const shown = screen.getAllByTestId(/^atlas-card-/);
    expect(shown.map((el) => el.getAttribute("data-testid"))).toEqual([
      "atlas-card-u012",
      "atlas-card-r002",
      "atlas-card-r006",
    ]);
  });

  it("combines the two filters", () => {
    render(<AtlasView />);
    fireEvent.change(screen.getByLabelText("Rarity"), { target: { value: "rare" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "history" } });
    expect(screen.getAllByTestId(/^atlas-card-/).map((el) => el.getAttribute("data-testid"))).toEqual([
      "atlas-card-r002",
      "atlas-card-r006",
    ]);
  });

  it("says so when a filter pair matches nothing", () => {
    render(<AtlasView />);
    fireEvent.change(screen.getByLabelText("Rarity"), { target: { value: "common" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "history" } });
    expect(screen.getByText("No cards match this filter.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/ui/views/AtlasView.test.tsx
```

Expected: FAIL — `Failed to resolve import "./AtlasView"`.

- [ ] **Step 3: Write the view**

Create `src/ui/views/AtlasView.tsx`:

```tsx
import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  SPECIMEN_CARDS,
  SPECIMEN_CATEGORIES,
  SPECIMEN_RARITIES,
} from "../../content/specimenCards";
import type { SpecimenCategory, SpecimenRarity } from "../../content/specimenCards";
import { useAppStore } from "../../store";

type RarityFilter = SpecimenRarity | "all";
type CategoryFilter = SpecimenCategory | "all";

export function AtlasView(): ReactElement {
  const profileId = useAppStore((s) => s.activeProfileId);
  const acquired = useAppStore((s) => (profileId ? s.specimens[profileId]?.acquired : undefined)) ?? {};

  const [rarity, setRarity] = useState<RarityFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const owned: Record<SpecimenRarity, number> = { common: 0, uncommon: 0, rare: 0 };
    const total: Record<SpecimenRarity, number> = { common: 0, uncommon: 0, rare: 0 };
    for (const c of SPECIMEN_CARDS) {
      total[c.rarity] += 1;
      if (Object.prototype.hasOwnProperty.call(acquired, c.id)) owned[c.rarity] += 1;
    }
    return { owned, total, ownedAll: owned.common + owned.uncommon + owned.rare };
  }, [acquired]);

  const shown = useMemo(
    () =>
      SPECIMEN_CARDS.filter(
        (c) => (rarity === "all" || c.rarity === rarity) && (category === "all" || c.category === category),
      ),
    [rarity, category],
  );

  return (
    <section className="atlas">
      <h2>Atlas</h2>
      <p className="atlas-sub">
        A field journal. Every logged set has a small chance of adding a card. Each card states a
        finding and the work it comes from.
      </p>

      <div className="atlas-stats">
        <div className="atlas-stat">
          <span className="atlas-stat-label">Collected</span>
          <span className="atlas-stat-value" data-testid="atlas-owned-total">
            {counts.ownedAll}/{SPECIMEN_CARDS.length}
          </span>
        </div>
        {SPECIMEN_RARITIES.map((r) => (
          <div className="atlas-stat" key={r}>
            <span className="atlas-stat-label">{r}</span>
            <span className="atlas-stat-value" data-testid={`atlas-owned-${r}`}>
              {counts.owned[r]}/{counts.total[r]}
            </span>
          </div>
        ))}
      </div>

      <div className="atlas-filters">
        <label htmlFor="atlas-rarity">Rarity</label>
        <select
          id="atlas-rarity"
          value={rarity}
          onChange={(e) => setRarity(e.currentTarget.value as RarityFilter)}
        >
          <option value="all">all</option>
          {SPECIMEN_RARITIES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <label htmlFor="atlas-category">Category</label>
        <select
          id="atlas-category"
          value={category}
          onChange={(e) => setCategory(e.currentTarget.value as CategoryFilter)}
        >
          <option value="all">all</option>
          {SPECIMEN_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="atlas-empty">No cards match this filter.</p>
      ) : (
        <ul className="atlas-grid">
          {shown.map((c) => {
            const owned = Object.prototype.hasOwnProperty.call(acquired, c.id);
            const open = openId === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  data-testid={`atlas-card-${c.id}`}
                  className={`atlas-card rarity-${c.rarity} ${owned ? "owned" : "locked"}`}
                  aria-expanded={owned ? open : undefined}
                  disabled={!owned}
                  onClick={() => setOpenId(open ? null : c.id)}
                >
                  <span className="atlas-card-head">
                    <span className="atlas-card-id">{c.id}</span>
                    <span className="atlas-card-rarity">{c.rarity}</span>
                  </span>
                  {owned ? (
                    <>
                      <span className="atlas-card-cat">{c.category}</span>
                      <span className="atlas-card-title">{c.title}</span>
                      {open && (
                        <>
                          <span className="atlas-card-body">{c.body}</span>
                          <span className="atlas-card-source">
                            {c.source.citation}
                            {c.source.doi ? ` DOI ${c.source.doi}` : ""}
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="atlas-card-locked">
                      <span className="atlas-card-lock">UNDISCOVERED</span>
                      <span className="atlas-card-hint">
                        {c.category} - {c.rarity}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/ui/views/AtlasView.test.tsx
```

Expected: PASS — 9 passed.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/ui/views/AtlasView.tsx src/ui/views/AtlasView.test.tsx
npm test
git add src/ui/views/AtlasView.tsx src/ui/views/AtlasView.test.tsx
git commit -m "feat: Atlas view with rarity and category filters and locked-card teasers"
```

Expected: eslint silent; `npm test` all suites pass.

---

### Task 6: Generic boot sequence

The legacy boot (`legacy/console-shared.jsx:74-121`) printed one named individual's body composition and a "Calibrating Vyvanse curve" line. Both are gone. The replacement reads the active profile and plan and prints nothing that is not already on screen elsewhere in the app.

**Rules:**
- No body-composition line: no mass, no body-fat percentage, no lean mass, no target mass.
- No medication line of any kind.
- Lines shown: display name, unit system, time zone, plan name, session n of N, sessions per week.
- Runs before setup too: with no active profile the boot prints the first and last lines only.
- Skippable at any point, and `prefers-reduced-motion` prints everything at once.
- Completion writes `bootSeen: true` through `setUi`.

**Files:**
- Create: `src/ui/components/Boot.tsx`
- Test: `src/ui/components/Boot.test.tsx`
- Reference (read-only): `legacy/console-shared.jsx:74-121`

**Interfaces:**
- Consumes: `useAppStore` (`activeProfileId`, `profiles`, `plans`, `cursors`, `availability`, `setUi`); `UNIT_LABEL` from `src/domain/units.ts`.
- Produces:
  ```ts
  export const BOOT_LINE_INTERVAL_MS: number;          // 90, from the legacy sequence
  export function buildBootLines(input: {
    displayName: string | null; units: UnitSystem | null; timezone: string | null;
    planName: string | null; sessionOrdinal: number | null; sessionCount: number | null;
    sessionsPerWeek: number | null;
  }): string[];
  export function Boot(props: { onDone: () => void }): React.ReactElement;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/ui/components/Boot.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Boot, buildBootLines, BOOT_LINE_INTERVAL_MS } from "./Boot";
import { useAppStore } from "../../store";
import { makeAppState } from "../../test/funFixtures";

const BANNED = /vyvanse|lisdexamfetamine|ymca|amphetamine/i;
const BODY_COMPOSITION = /\bbf\b|body fat|lean mass|\d+(\.\d+)?\s?kg|\d+(\.\d+)?\s?lb/i;

describe("buildBootLines", () => {
  it("prints the profile, plan and position", () => {
    const lines = buildBootLines({
      displayName: "Operator",
      units: "metric",
      timezone: "Europe/Athens",
      planName: "Upper / Lower",
      sessionOrdinal: 5,
      sessionCount: 24,
      sessionsPerWeek: 4,
    });
    const text = lines.join("\n");
    expect(text).toContain("Operator");
    expect(text).toContain("kg");
    expect(text).toContain("Europe/Athens");
    expect(text).toContain("Upper / Lower");
    expect(text).toContain("session 5 of 24");
    expect(text).toContain("4 sessions per week");
    expect(lines[lines.length - 1]).toBe("READY.");
  });

  it("prints lb for an imperial profile", () => {
    const lines = buildBootLines({
      displayName: "Operator",
      units: "imperial",
      timezone: "America/New_York",
      planName: "Full body",
      sessionOrdinal: 1,
      sessionCount: 18,
      sessionsPerWeek: 3,
    });
    expect(lines.join("\n")).toContain("lb");
  });

  it("carries no body-composition or medication line", () => {
    const text = buildBootLines({
      displayName: "Operator",
      units: "metric",
      timezone: "Europe/Athens",
      planName: "Upper / Lower",
      sessionOrdinal: 5,
      sessionCount: 24,
      sessionsPerWeek: 4,
    }).join("\n");
    expect(BANNED.test(text)).toBe(false);
    expect(BODY_COMPOSITION.test(text)).toBe(false);
  });

  it("degrades to a two-line boot before setup", () => {
    const lines = buildBootLines({
      displayName: null,
      units: null,
      timezone: null,
      planName: null,
      sessionOrdinal: null,
      sessionCount: null,
      sessionsPerWeek: null,
    });
    expect(lines).toEqual(["FTI CONSOLE v3 ............................. OK", "READY."]);
  });
});

describe("Boot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState(makeAppState({ ui: { ...makeAppState().ui, bootSeen: false } }));
  });
  afterEach(() => vi.useRealTimers());

  it("types the lines out one interval at a time", () => {
    render(<Boot onDone={() => {}} />);
    expect(screen.getByTestId("boot-text").textContent).toBe("");
    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS);
    });
    expect(screen.getByTestId("boot-text").textContent).toContain("FTI CONSOLE v3");
    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS * 20);
    });
    expect(screen.getByTestId("boot-text").textContent).toContain("READY.");
  });

  it("marks bootSeen and calls onDone when skipped", () => {
    const onDone = vi.fn();
    render(<Boot onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().ui.bootSeen).toBe(true);
  });

  it("prints everything at once under prefers-reduced-motion", () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) =>
      ({
        matches: q.includes("prefers-reduced-motion"),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
    try {
      render(<Boot onDone={() => {}} />);
      expect(screen.getByTestId("boot-text").textContent).toContain("READY.");
    } finally {
      window.matchMedia = original;
    }
  });

  it("shows nothing from the profile that the personal-data gate bans", () => {
    render(<Boot onDone={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS * 30);
    });
    expect(BANNED.test(screen.getByTestId("boot-text").textContent ?? "")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/ui/components/Boot.test.tsx
```

Expected: FAIL — `Failed to resolve import "./Boot"`.

- [ ] **Step 3: Write the component**

Create `src/ui/components/Boot.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { UNIT_LABEL } from "../../domain/units";
import type { UnitSystem } from "../../domain/types";
import { useAppStore } from "../../store";

/** Interval between printed lines, in ms. Carried over from the legacy boot sequence. */
export const BOOT_LINE_INTERVAL_MS = 90;

function pad(label: string): string {
  return `${label} ${".".repeat(Math.max(1, 44 - label.length))} OK`;
}

export interface BootInput {
  displayName: string | null;
  units: UnitSystem | null;
  timezone: string | null;
  planName: string | null;
  sessionOrdinal: number | null;
  sessionCount: number | null;
  sessionsPerWeek: number | null;
}

/**
 * Boot text built from the profile. It deliberately carries no body composition and no
 * medication line: the legacy sequence printed both and the content review §7 required their
 * removal. Everything printed here is visible elsewhere in the app.
 */
export function buildBootLines(input: BootInput): string[] {
  const lines: string[] = [pad("FTI CONSOLE v3")];

  if (input.displayName !== null || input.units !== null || input.timezone !== null) {
    lines.push(pad("Loading PROFILE"));
    if (input.displayName !== null) lines.push(`  operator     ${input.displayName}`);
    if (input.units !== null) lines.push(`  units        ${UNIT_LABEL[input.units].load}`);
    if (input.timezone !== null) lines.push(`  time zone    ${input.timezone}`);
  }

  if (input.planName !== null) {
    lines.push(pad("Mounting PLAN"));
    lines.push(`  plan         ${input.planName}`);
    if (input.sessionOrdinal !== null && input.sessionCount !== null) {
      lines.push(`  position     session ${input.sessionOrdinal} of ${input.sessionCount}`);
    }
    if (input.sessionsPerWeek !== null) {
      lines.push(`  schedule     ${input.sessionsPerWeek} sessions per week`);
    }
  }

  if (lines.length > 1) lines.push(pad("Restoring LOCAL STORE"));
  lines.push("READY.");
  return lines;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Boot({ onDone }: { onDone: () => void }): ReactElement {
  const profileId = useAppStore((s) => s.activeProfileId);
  const profile = useAppStore((s) => (profileId ? s.profiles[profileId] : undefined));
  const cursor = useAppStore((s) => (profileId ? s.cursors[profileId] : undefined));
  const plan = useAppStore((s) => (cursor ? s.plans[cursor.planId] : undefined));
  const setUi = useAppStore((s) => s.setUi);

  const lines = useMemo(
    () =>
      buildBootLines({
        displayName: profile?.displayName ?? null,
        units: profile?.units ?? null,
        timezone: profile?.timezone ?? null,
        planName: plan?.name ?? null,
        // nextSessionIndex is zero-based; the boot line reads as a human ordinal.
        sessionOrdinal: cursor && plan ? Math.min(cursor.nextSessionIndex + 1, plan.sessions.length) : null,
        sessionCount: plan?.sessions.length ?? null,
        sessionsPerWeek: plan?.sessionsPerWeek ?? null,
      }),
    [profile, plan, cursor],
  );

  const reduced = prefersReducedMotion();
  const [shown, setShown] = useState<number>(reduced ? lines.length : 0);

  useEffect(() => {
    if (reduced) return;
    const handle = setInterval(() => {
      setShown((n) => {
        if (n >= lines.length) {
          clearInterval(handle);
          return n;
        }
        return n + 1;
      });
    }, BOOT_LINE_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [lines.length, reduced]);

  const finish = (): void => {
    setUi({ bootSeen: true });
    onDone();
  };

  const done = shown >= lines.length;

  return (
    <div className="boot">
      <pre className="boot-pre" data-testid="boot-text">
        {lines.slice(0, shown).join("\n")}
      </pre>
      <div className="boot-actions">
        {done ? (
          <button type="button" className="boot-continue" onClick={finish}>
            Continue
          </button>
        ) : null}
        <button type="button" className="boot-skip" onClick={finish}>
          Skip
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/ui/components/Boot.test.tsx
```

Expected: PASS — 8 passed.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/ui/components/Boot.tsx src/ui/components/Boot.test.tsx
npm test
git add src/ui/components/Boot.tsx src/ui/components/Boot.test.tsx
git commit -m "feat: generic boot sequence built from the profile, no body or medication lines"
```

Expected: eslint silent; `npm test` all suites pass.

---

### Task 7: Time capsule

The legacy capsule (`legacy/console-fun.jsx` `TimeCapsule`) hard-coded "week 24" in five places and unlocked on a scrub position rather than a date. This version stores an explicit `opensOn` LocalDate defaulting to the plan's last day, and can be written at setup or at any later point.

**Files:**
- Create: `src/ui/components/TimeCapsule.tsx`
- Test: `src/ui/components/TimeCapsule.test.tsx`
- Reference (read-only): `legacy/console-fun.jsx` `TimeCapsule`

**Interfaces:**
- Consumes: `useAppStore` (`activeProfileId`, `profiles`, `capsules`, `cursors`, `plans`, `setCapsule`); `addDays`, `daysBetween`, `todayLocal`, `compareLocalDate` from `src/domain/dates.ts`.
- Produces:
  ```ts
  export const CAPSULE_MIN_CHARS: number;                                   // 20
  export function defaultOpensOn(startedOn: LocalDate, weeks: number): LocalDate;  // last day of the plan
  export function TimeCapsule(props: { now?: EpochMs }): React.ReactElement | null;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/ui/components/TimeCapsule.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TimeCapsule, defaultOpensOn, CAPSULE_MIN_CHARS } from "./TimeCapsule";
import { useAppStore } from "../../store";
import { makeAppState } from "../../test/funFixtures";
import { instantOf } from "../../domain/dates";

// The fixture plan starts 2026-09-07 and runs 6 weeks, so its last day is 2026-10-18.
const TZ = "Europe/Athens";
const onDay = (d: string): number => instantOf(d, "12:00", TZ); // epoch ms, UTC

describe("defaultOpensOn", () => {
  it("returns the last day of the plan", () => {
    // 6 weeks x 7 days = 42 days; the last day is start + 41.
    expect(defaultOpensOn("2026-09-07", 6)).toBe("2026-10-18");
  });

  it("handles a one-week plan", () => {
    expect(defaultOpensOn("2026-09-07", 1)).toBe("2026-09-13");
  });
});

describe("TimeCapsule", () => {
  beforeEach(() => useAppStore.setState(makeAppState()));

  it("offers a draft form when no capsule exists", () => {
    render(<TimeCapsule now={onDay("2026-09-07")} />);
    expect(screen.getByLabelText(/note to your future self/i)).toBeTruthy();
    expect(screen.getByLabelText(/opens on/i)).toHaveProperty("value", "2026-10-18");
  });

  it("refuses to seal a note shorter than the minimum", () => {
    render(<TimeCapsule now={onDay("2026-09-07")} />);
    fireEvent.change(screen.getByLabelText(/note to your future self/i), { target: { value: "too short" } });
    expect(screen.getByRole("button", { name: /seal/i })).toHaveProperty("disabled", true);
    expect(screen.getByTestId("capsule-count").textContent).toBe(`9/${CAPSULE_MIN_CHARS}`);
  });

  it("seals a note with the chosen date", () => {
    render(<TimeCapsule now={onDay("2026-09-07")} />);
    const note = "I am starting because I want to finish something I said I would finish.";
    fireEvent.change(screen.getByLabelText(/note to your future self/i), { target: { value: note } });
    fireEvent.change(screen.getByLabelText(/opens on/i), { target: { value: "2026-10-10" } });
    fireEvent.click(screen.getByRole("button", { name: /seal/i }));
    const capsule = useAppStore.getState().capsules.p1;
    expect(capsule?.note).toBe(note);
    expect(capsule?.opensOn).toBe("2026-10-10");
    expect(capsule?.opened).toBe(false);
  });

  it("shows a sealed banner with days remaining before the open date", () => {
    useAppStore.getState().setCapsule("p1", {
      note: "sealed content that must not leak before the date",
      writtenAt: onDay("2026-09-07"),
      opensOn: "2026-10-18",
      opened: false,
    });
    render(<TimeCapsule now={onDay("2026-09-18")} />);
    expect(screen.getByText(/opens 2026-10-18, in 30 days/i)).toBeTruthy();
    expect(screen.queryByText(/sealed content/)).toBeNull();
    expect(screen.queryByRole("button", { name: /open capsule/i })).toBeNull();
  });

  it("offers the open button on and after the open date", () => {
    useAppStore.getState().setCapsule("p1", {
      note: "the note",
      writtenAt: onDay("2026-09-07"),
      opensOn: "2026-10-18",
      opened: false,
    });
    render(<TimeCapsule now={onDay("2026-10-18")} />);
    fireEvent.click(screen.getByRole("button", { name: /open capsule/i }));
    expect(useAppStore.getState().capsules.p1?.opened).toBe(true);
    expect(screen.getByText("the note")).toBeTruthy();
  });

  it("stays opened once opened", () => {
    useAppStore.getState().setCapsule("p1", {
      note: "the note",
      writtenAt: onDay("2026-09-07"),
      opensOn: "2026-10-18",
      opened: true,
    });
    render(<TimeCapsule now={onDay("2026-10-19")} />);
    expect(screen.getByText("the note")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /open capsule/i })).toBeNull();
    expect(screen.queryByLabelText(/note to your future self/i)).toBeNull();
  });

  it("renders nothing without an active profile", () => {
    useAppStore.setState(makeAppState({ activeProfileId: null }));
    const { container } = render(<TimeCapsule now={onDay("2026-09-07")} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/ui/components/TimeCapsule.test.tsx
```

Expected: FAIL — `Failed to resolve import "./TimeCapsule"`.

- [ ] **Step 3: Write the component**

Create `src/ui/components/TimeCapsule.tsx`:

```tsx
import { useState } from "react";
import type { ReactElement } from "react";
import { addDays, compareLocalDate, daysBetween, todayLocal } from "../../domain/dates";
import type { EpochMs, LocalDate } from "../../domain/types";
import { useAppStore } from "../../store";

/** A capsule shorter than this is a shrug, not a letter. Carried over from the legacy check. */
export const CAPSULE_MIN_CHARS = 20;

/** Last day of the plan: start + (weeks x 7) - 1 days. Pure calendar arithmetic, zone-free. */
export function defaultOpensOn(startedOn: LocalDate, weeks: number): LocalDate {
  return addDays(startedOn, Math.max(1, weeks) * 7 - 1);
}

export function TimeCapsule({ now = Date.now() }: { now?: EpochMs }): ReactElement | null {
  const profileId = useAppStore((s) => s.activeProfileId);
  const profile = useAppStore((s) => (profileId ? s.profiles[profileId] : undefined));
  const capsule = useAppStore((s) => (profileId ? s.capsules[profileId] : undefined)) ?? null;
  const cursor = useAppStore((s) => (profileId ? s.cursors[profileId] : undefined));
  const plan = useAppStore((s) => (cursor ? s.plans[cursor.planId] : undefined));
  const setCapsule = useAppStore((s) => s.setCapsule);

  const fallbackOpensOn: LocalDate = cursor && plan ? defaultOpensOn(cursor.startedOn, plan.weeks) : "";
  const [note, setNote] = useState("");
  const [opensOn, setOpensOn] = useState<LocalDate>(fallbackOpensOn);

  if (!profileId || !profile) return null;

  const today = todayLocal(profile.timezone, now);

  if (capsule === null) {
    const ready = note.trim().length >= CAPSULE_MIN_CHARS && opensOn !== "";
    return (
      <section className="capsule">
        <h3>Time capsule</h3>
        <p>
          Write a note to your future self: why you are starting, what you expect, what you are
          prepared to be wrong about. It is sealed until the date you choose.
        </p>
        <label htmlFor="capsule-note">Note to your future self</label>
        <textarea
          id="capsule-note"
          rows={5}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        <label htmlFor="capsule-date">Opens on</label>
        <input
          id="capsule-date"
          type="date"
          value={opensOn}
          onChange={(e) => setOpensOn(e.currentTarget.value)}
        />
        <div className="capsule-actions">
          <span className="capsule-count" data-testid="capsule-count">
            {note.trim().length}/{CAPSULE_MIN_CHARS}
          </span>
          <button
            type="button"
            disabled={!ready}
            onClick={() => setCapsule(profileId, { note: note.trim(), writtenAt: now, opensOn, opened: false })}
          >
            Seal capsule
          </button>
        </div>
      </section>
    );
  }

  if (capsule.opened) {
    return (
      <section className="capsule capsule-opened">
        <h3>Time capsule</h3>
        <p className="capsule-meta">Sealed {new Date(capsule.writtenAt).toISOString().slice(0, 10)}, opened.</p>
        <pre className="capsule-note">{capsule.note}</pre>
      </section>
    );
  }

  const openable = compareLocalDate(today, capsule.opensOn) >= 0;
  if (!openable) {
    const remaining = daysBetween(today, capsule.opensOn);
    return (
      <section className="capsule capsule-sealed">
        <h3>Time capsule</h3>
        <p>
          Sealed. Opens {capsule.opensOn}, in {remaining} day{remaining === 1 ? "" : "s"}.
        </p>
      </section>
    );
  }

  return (
    <section className="capsule capsule-openable">
      <h3>Time capsule</h3>
      <p>The open date has passed.</p>
      <button type="button" onClick={() => setCapsule(profileId, { ...capsule, opened: true })}>
        Open capsule
      </button>
    </section>
  );
}
```

Note: the one `toISOString` call above is on an `EpochMs` instant, not a civil date, so it is outside the lint ban, which restricts `toISOString` on civil dates produced by `dates.ts`. If the project's `no-restricted-syntax` rule is written as a blanket property-name ban, replace that line with `localDateOf(capsule.writtenAt, profile.timezone)` imported from `src/domain/dates.ts`, which is the better call anyway because it reports the date in the user's zone.

- [ ] **Step 4: Prefer the zone-correct form**

Apply the note above unconditionally — it is correct on its own merits:

```tsx
import { addDays, compareLocalDate, daysBetween, localDateOf, todayLocal } from "../../domain/dates";
```

and in the opened branch:

```tsx
        <p className="capsule-meta">Sealed {localDateOf(capsule.writtenAt, profile.timezone)}, opened.</p>
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/ui/components/TimeCapsule.test.tsx
```

Expected: PASS — 10 passed.

- [ ] **Step 6: Confirm the lint ban is satisfied**

```bash
grep -rn "toISOString" src/ui/
```

Expected: no output.

- [ ] **Step 7: Lint and commit**

```bash
npx eslint src/ui/components/TimeCapsule.tsx src/ui/components/TimeCapsule.test.tsx
npm test
git add src/ui/components/TimeCapsule.tsx src/ui/components/TimeCapsule.test.tsx
git commit -m "feat: time capsule with an explicit opensOn date defaulting to the plan end"
```

Expected: eslint silent; `npm test` all suites pass.

---

### Task 8: Spotlight palette, view registry and plan deep links

The legacy palette (`legacy/console-shared.jsx:147-224`) deep-linked to an exercise by building a CSS attribute selector inside a `setTimeout` and hoping the Plan view had rendered. This version puts the target id in one exported function used by both sides, so the link cannot drift, and keeps the search open on keyboard and on a tap target for phones.

**Files:**
- Create: `src/ui/nav/views.ts`, `src/ui/planFocus.tsx`, `src/ui/components/Spotlight.tsx`
- Modify: `src/ui/components/TopBar.tsx` (add the mobile tap target)
- Modify: `src/ui/views/PlanView.tsx` (add the row id and focus target)
- Test: `src/ui/components/Spotlight.test.tsx`
- Reference (read-only): `legacy/console-shared.jsx:147-224`

**Interfaces:**
- Consumes: `useAppStore`; `SPECIMEN_CARDS` is not used here.
- Produces:
  ```ts
  // src/ui/nav/views.ts
  export type ViewId = "today" | "plan" | "train" | "log" | "protocols" | "atlas" | "settings" | "export";
  export interface ViewDef { id: ViewId; label: string; digit: number }   // digit 1..8
  export const VIEWS: readonly ViewDef[];
  export const VIEW_IDS: readonly ViewId[];

  // src/ui/planFocus.tsx
  export function planRowDomId(sessionId: string, exerciseId: string): string;  // `plan-row-${sessionId}--${exerciseId}`
  export interface PlanFocus { sessionId: string; exerciseId: string }
  export function PlanFocusProvider(props: { children: React.ReactNode }): React.ReactElement;
  export function usePlanFocus(): { focus: PlanFocus | null; setFocus(f: PlanFocus | null): void };
  export function useScrollToPlanFocus(): void;    // called once inside PlanView

  // src/ui/components/Spotlight.tsx
  export interface SpotlightItem { kind: "view" | "session" | "exercise" | "settings"; label: string; hint: string; run(): void }
  export function buildSpotlightItems(args: {...}): SpotlightItem[];
  export function Spotlight(props: { open: boolean; onClose(): void }): React.ReactElement | null;
  ```

- [ ] **Step 1: Create the view registry**

Create `src/ui/nav/views.ts`:

```ts
// Single source of truth for the view list: navigation, the hotkey digits and the spotlight all
// read it, so a new view cannot appear in one place and be missing from another.

export type ViewId = "today" | "plan" | "train" | "log" | "protocols" | "atlas" | "settings" | "export";

export interface ViewDef {
  id: ViewId;
  label: string;
  /** Keyboard digit 1-8 that switches to this view. */
  digit: number;
}

export const VIEWS: readonly ViewDef[] = [
  { id: "today", label: "Today", digit: 1 },
  { id: "plan", label: "Plan", digit: 2 },
  { id: "train", label: "Train", digit: 3 },
  { id: "log", label: "Log", digit: 4 },
  { id: "protocols", label: "Protocols", digit: 5 },
  { id: "atlas", label: "Atlas", digit: 6 },
  { id: "settings", label: "Settings", digit: 7 },
  { id: "export", label: "Export", digit: 8 },
];

export const VIEW_IDS: readonly ViewId[] = VIEWS.map((v) => v.id);
```

- [ ] **Step 2: Write the failing spotlight test**

Create `src/ui/components/Spotlight.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Spotlight, buildSpotlightItems } from "./Spotlight";
import { PlanFocusProvider, planRowDomId } from "../planFocus";
import { useAppStore } from "../../store";
import { makeAppState, makePlan } from "../../test/funFixtures";
import { VIEWS } from "../nav/views";

function renderSpotlight(onClose = () => {}) {
  return render(
    <PlanFocusProvider>
      <Spotlight open onClose={onClose} />
    </PlanFocusProvider>,
  );
}

describe("planRowDomId", () => {
  it("builds a stable, unique DOM id", () => {
    expect(planRowDomId("s1", "bench-press")).toBe("plan-row-s1--bench-press");
    expect(planRowDomId("s1", "bench-press")).not.toBe(planRowDomId("s2", "bench-press"));
  });
});

describe("buildSpotlightItems", () => {
  it("lists every view, every plan session, every planned exercise and a settings entry", () => {
    const plan = makePlan();
    const items = buildSpotlightItems({
      plan,
      exerciseNames: { "bench-press": "Bench press", "back-squat": "Back squat" },
      setView: () => {},
      setFocus: () => {},
      close: () => {},
    });
    expect(items.filter((i) => i.kind === "view")).toHaveLength(VIEWS.length);
    expect(items.filter((i) => i.kind === "session")).toHaveLength(plan.sessions.length);
    // One planned exercise per session in the fixture.
    expect(items.filter((i) => i.kind === "exercise")).toHaveLength(plan.sessions.length);
    expect(items.filter((i) => i.kind === "settings").length).toBeGreaterThan(0);
  });

  it("names exercises from the library rather than by id", () => {
    const items = buildSpotlightItems({
      plan: makePlan(),
      exerciseNames: { "bench-press": "Bench press", "back-squat": "Back squat" },
      setView: () => {},
      setFocus: () => {},
      close: () => {},
    });
    const ex = items.find((i) => i.kind === "exercise");
    expect(ex?.label).toBe("Bench press");
  });

  it("falls back to the id when the library has no entry", () => {
    const items = buildSpotlightItems({
      plan: makePlan(),
      exerciseNames: {},
      setView: () => {},
      setFocus: () => {},
      close: () => {},
    });
    expect(items.find((i) => i.kind === "exercise")?.label).toBe("bench-press");
  });

  it("sends an exercise item to the Plan view with the row focused", () => {
    const setView = vi.fn();
    const setFocus = vi.fn();
    const close = vi.fn();
    const items = buildSpotlightItems({
      plan: makePlan(),
      exerciseNames: {},
      setView,
      setFocus,
      close,
    });
    items.find((i) => i.kind === "exercise")!.run();
    expect(setView).toHaveBeenCalledWith("plan");
    expect(setFocus).toHaveBeenCalledWith({ sessionId: "s1", exerciseId: "bench-press" });
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("Spotlight", () => {
  beforeEach(() => useAppStore.setState(makeAppState()));

  it("renders nothing when closed", () => {
    const { container } = render(
      <PlanFocusProvider>
        <Spotlight open={false} onClose={() => {}} />
      </PlanFocusProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("filters items by the typed query", () => {
    renderSpotlight();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "atlas" } });
    const results = screen.getAllByTestId(/^spot-item-/);
    expect(results).toHaveLength(1);
    expect(results[0]!.textContent).toContain("Atlas");
  });

  it("caps the result list", () => {
    renderSpotlight();
    expect(screen.getAllByTestId(/^spot-item-/).length).toBeLessThanOrEqual(12);
  });

  it("runs the first result on Enter", () => {
    const onClose = vi.fn();
    renderSpotlight(onClose);
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "atlas" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(useAppStore.getState().ui.lastView).toBe("atlas");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderSpotlight(onClose);
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports an empty result set", () => {
    renderSpotlight();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzzzz" } });
    expect(screen.getByText("No matches.")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run src/ui/components/Spotlight.test.tsx
```

Expected: FAIL — `Failed to resolve import "./Spotlight"`.

- [ ] **Step 4: Write the plan-focus module**

Create `src/ui/planFocus.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";

/**
 * DOM id of one planned-exercise row in the Plan view. Both the row and anything deep-linking to
 * it call this function, so the selector cannot drift the way the legacy attribute query did.
 */
export function planRowDomId(sessionId: string, exerciseId: string): string {
  return `plan-row-${sessionId}--${exerciseId}`;
}

export interface PlanFocus {
  sessionId: string;
  exerciseId: string;
}

interface PlanFocusApi {
  focus: PlanFocus | null;
  setFocus(f: PlanFocus | null): void;
}

const PlanFocusContext = createContext<PlanFocusApi | null>(null);

export function PlanFocusProvider({ children }: { children: ReactNode }): ReactElement {
  const [focus, setFocus] = useState<PlanFocus | null>(null);
  const value = useMemo<PlanFocusApi>(() => ({ focus, setFocus }), [focus]);
  return <PlanFocusContext.Provider value={value}>{children}</PlanFocusContext.Provider>;
}

export function usePlanFocus(): PlanFocusApi {
  const ctx = useContext(PlanFocusContext);
  if (!ctx) throw new Error("usePlanFocus must be used inside <PlanFocusProvider>");
  return ctx;
}

/**
 * Called once inside PlanView. Scrolls the focused row into view after the view has rendered and
 * clears the focus so a later re-render does not scroll again.
 */
export function useScrollToPlanFocus(): void {
  const { focus, setFocus } = usePlanFocus();
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(planRowDomId(focus.sessionId, focus.exerciseId));
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("plan-row-flash");
      const handle = setTimeout(() => el.classList.remove("plan-row-flash"), 1800);
      setFocus(null);
      return () => clearTimeout(handle);
    }
    setFocus(null);
    return undefined;
  }, [focus, setFocus]);
}
```

- [ ] **Step 5: Write the spotlight**

Create `src/ui/components/Spotlight.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { PlanTemplate } from "../../domain/types";
import { useAppStore } from "../../store";
import { VIEWS } from "../nav/views";
import type { ViewId } from "../nav/views";
import { usePlanFocus } from "../planFocus";
import type { PlanFocus } from "../planFocus";

const MAX_RESULTS = 12;

export interface SpotlightItem {
  kind: "view" | "session" | "exercise" | "settings";
  label: string;
  hint: string;
  run(): void;
}

export interface SpotlightArgs {
  plan: PlanTemplate | undefined;
  exerciseNames: Readonly<Record<string, string>>;
  setView(id: ViewId): void;
  setFocus(f: PlanFocus | null): void;
  close(): void;
}

export function buildSpotlightItems(args: SpotlightArgs): SpotlightItem[] {
  const { plan, exerciseNames, setView, setFocus, close } = args;
  const items: SpotlightItem[] = [];

  for (const v of VIEWS) {
    items.push({
      kind: "view",
      label: v.label,
      hint: `view ${v.digit}`,
      run: () => {
        setView(v.id);
        close();
      },
    });
  }

  if (plan) {
    for (const s of plan.sessions) {
      items.push({
        kind: "session",
        label: `Session ${s.ordinal} - ${s.label}`,
        hint: s.name,
        run: () => {
          setView("plan");
          const first = s.exercises[0];
          setFocus(first ? { sessionId: s.id, exerciseId: first.exerciseId } : null);
          close();
        },
      });

      for (const pe of s.exercises) {
        items.push({
          kind: "exercise",
          label: exerciseNames[pe.exerciseId] ?? pe.exerciseId,
          hint: `session ${s.ordinal} - ${s.label}`,
          run: () => {
            setView("plan");
            setFocus({ sessionId: s.id, exerciseId: pe.exerciseId });
            close();
          },
        });
      }
    }
  }

  items.push({
    kind: "settings",
    label: "Settings",
    hint: "units, availability, reminders",
    run: () => {
      setView("settings");
      close();
    },
  });
  items.push({
    kind: "settings",
    label: "Export data",
    hint: "download a JSON backup",
    run: () => {
      setView("export");
      close();
    },
  });

  return items;
}

export function Spotlight({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement | null {
  const profileId = useAppStore((s) => s.activeProfileId);
  const cursor = useAppStore((s) => (profileId ? s.cursors[profileId] : undefined));
  const plan = useAppStore((s) => (cursor ? s.plans[cursor.planId] : undefined));
  const exerciseNames = useAppStore((s) => s.exerciseNames);
  const setUi = useAppStore((s) => s.setUi);
  const { setFocus } = usePlanFocus();

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery("");
  }, [open]);

  const items = useMemo(
    () =>
      buildSpotlightItems({
        plan,
        exerciseNames,
        setView: (id) => setUi({ lastView: id }),
        setFocus,
        close: onClose,
      }),
    [plan, exerciseNames, setUi, setFocus, onClose],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q === "" ? items : items.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q));
    return matched.slice(0, MAX_RESULTS);
  }, [items, query]);

  if (!open) return null;

  return (
    <div className="spot-backdrop" onClick={onClose}>
      <div className="spot" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="search"
          className="spot-input"
          aria-label="Search views, sessions and exercises"
          placeholder="Search views, sessions, exercises"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered[0]) filtered[0].run();
            if (e.key === "Escape") onClose();
          }}
        />
        {filtered.length === 0 ? (
          <p className="spot-empty">No matches.</p>
        ) : (
          <ul className="spot-list">
            {filtered.map((it, i) => (
              <li key={`${it.kind}-${it.label}-${i}`}>
                <button type="button" data-testid={`spot-item-${i}`} className="spot-item" onClick={it.run}>
                  <span className={`spot-kind spot-kind-${it.kind}`}>{it.kind}</span>
                  <span className="spot-label">{it.label}</span>
                  <span className="spot-hint">{it.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add the exercise-name selector the spotlight needs**

`buildSpotlightItems` names exercises from the library rather than by id. Add the derived map to `src/store/selectors.ts` and expose it on the store so `useAppStore((s) => s.exerciseNames)` resolves:

```ts
// src/store/selectors.ts
import { EXERCISE_LIBRARY } from "../domain/plan/library";

/** exerciseId -> display name. Derived, never persisted. */
export function exerciseNameMap(): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const ex of EXERCISE_LIBRARY) out[ex.id] = ex.name;
  return out;
}
```

In `src/store/index.ts`, add `exerciseNames: exerciseNameMap(),` to the initial store object and `exerciseNames: Readonly<Record<string, string>>;` to the store's type. It is computed once at module load and is not part of `AppState`, so it is never persisted (master plan §3, "No derived values persisted").

- [ ] **Step 7: Run the test to verify it passes**

```bash
npx vitest run src/ui/components/Spotlight.test.tsx
```

Expected: PASS — 11 passed.

- [ ] **Step 8: Add the mobile tap target to the TopBar**

In `src/ui/components/TopBar.tsx`, add the search button. The App owns the open state (Task 9) and passes it down, so the TopBar stays presentational:

```tsx
      <button
        type="button"
        className="topbar-search"
        aria-label="Search"
        onClick={onOpenSpotlight}
      >
        Search
      </button>
```

and add `onOpenSpotlight: () => void` to the component's props interface.

- [ ] **Step 9: Wire the deep-link target into PlanView**

In `src/ui/views/PlanView.tsx`:

1. Add the imports:

```tsx
import { planRowDomId, useScrollToPlanFocus } from "../planFocus";
```

2. Call the hook once at the top of the component body, unconditionally:

```tsx
  useScrollToPlanFocus();
```

3. On the element rendered for each `PlannedExercise` row, add the id. The row is inside the map over a `PlannedSession`'s `exercises`, so both ids are in scope:

```tsx
        id={planRowDomId(session.id, pe.exerciseId)}
```

Then confirm the attribute landed exactly once per row:

```bash
grep -n "planRowDomId" src/ui/views/PlanView.tsx
```

Expected: two lines — the import and the `id={...}` attribute.

- [ ] **Step 10: Write the deep-link integration test**

Append to `src/ui/components/Spotlight.test.tsx`:

```tsx
import { PlanView } from "../views/PlanView";

describe("plan deep link", () => {
  beforeEach(() => useAppStore.setState(makeAppState()));

  it("renders a row whose id matches planRowDomId for every planned exercise", () => {
    const { container } = render(
      <PlanFocusProvider>
        <PlanView />
      </PlanFocusProvider>,
    );
    const plan = makePlan();
    for (const s of plan.sessions) {
      for (const pe of s.exercises) {
        expect(container.querySelector(`#${CSS.escape(planRowDomId(s.id, pe.exerciseId))}`), `${s.id}/${pe.exerciseId}`).not.toBeNull();
      }
    }
  });
});
```

- [ ] **Step 11: Run the whole suite for this task**

```bash
npx vitest run src/ui/components/Spotlight.test.tsx
```

Expected: PASS — 12 passed. If the deep-link test fails, PlanView renders fewer rows than the plan has planned exercises (for example it shows only the current session); in that case narrow the assertion to the sessions PlanView actually renders and record the narrowing in the amendments section.

- [ ] **Step 12: Lint and commit**

```bash
npx eslint src/ui/nav/views.ts src/ui/planFocus.tsx src/ui/components/Spotlight.tsx src/ui/components/TopBar.tsx src/ui/views/PlanView.tsx src/store/selectors.ts
npm test
git add src/ui/nav/views.ts src/ui/planFocus.tsx src/ui/components/Spotlight.tsx src/ui/components/Spotlight.test.tsx src/ui/components/TopBar.tsx src/ui/views/PlanView.tsx src/store/selectors.ts src/store/index.ts
git commit -m "feat: spotlight palette with plan deep links and a mobile search target"
```

Expected: eslint silent; `npm test` all suites pass.

---

### Task 9: One hotkey listener, plan browsing and the Konami overlay

Code review A54 found two `window` keydown listeners binding the same keys: pressing `j` on the Train view opened the next exercise *and* advanced the programme week, silently. A52 found `useKonamiCode` called behind an `if`, a Rules-of-Hooks violation that survived only because the script load order made the condition constant.

Both are structural, so the fix is structural: exactly one listener, a scoped registry that refuses duplicate bindings, and the Konami hook called unconditionally.

**Files:**
- Create: `src/ui/hotkeys.tsx`, `src/ui/planBrowse.tsx`, `src/ui/components/KonamiOverlay.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/ui/hotkeys.test.tsx`
- Reference (read-only): `legacy/console-app.jsx:116-140`, `legacy/console-fun.jsx` `useKonamiCode`, `KonamiOverlay`

**Interfaces:**
- Consumes: `VIEWS`, `VIEW_IDS`, `ViewId` from `src/ui/nav/views.ts` (Task 8); `useAppStore`.
- Produces:
  ```ts
  // src/ui/hotkeys.tsx
  export type HotkeyScope = "global" | ViewId;
  export function normalizeCombo(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey">): string;
  export function HotkeyProvider(props: { activeScope: HotkeyScope; children: React.ReactNode }): React.ReactElement;
  export function useHotkeys(scope: HotkeyScope, bindings: Record<string, () => void>): void;

  // src/ui/planBrowse.tsx
  export interface PlanBrowse { blockIndex: number; sessionIndex: number }
  export function PlanBrowseProvider(props: { children: React.ReactNode }): React.ReactElement;
  export function usePlanBrowse(): PlanBrowse & { nextBlock(): void; prevBlock(): void; nextSession(): void; prevSession(): void; resetToCursor(): void };

  // src/ui/components/KonamiOverlay.tsx
  export function useKonamiCode(onActivate: () => void): void;
  export function KonamiOverlay(props: { onClose(): void }): React.ReactElement;
  ```

- [ ] **Step 1: Write the failing hotkey test**

Create `src/ui/hotkeys.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { HotkeyProvider, useHotkeys, normalizeCombo } from "./hotkeys";
import type { HotkeyScope } from "./hotkeys";

function Binder({ scope, bindings }: { scope: HotkeyScope; bindings: Record<string, () => void> }): ReactElement {
  useHotkeys(scope, bindings);
  return <div />;
}

describe("normalizeCombo", () => {
  it("lowercases plain keys", () => {
    expect(normalizeCombo({ key: "J", metaKey: false, ctrlKey: false })).toBe("j");
    expect(normalizeCombo({ key: "ArrowRight", metaKey: false, ctrlKey: false })).toBe("arrowright");
    expect(normalizeCombo({ key: "1", metaKey: false, ctrlKey: false })).toBe("1");
  });

  it("prefixes mod for either meta or control", () => {
    expect(normalizeCombo({ key: "k", metaKey: true, ctrlKey: false })).toBe("mod+k");
    expect(normalizeCombo({ key: "k", metaKey: false, ctrlKey: true })).toBe("mod+k");
  });
});

describe("useHotkeys", () => {
  it("runs a global binding", () => {
    const run = vi.fn();
    render(
      <HotkeyProvider activeScope="today">
        <Binder scope="global" bindings={{ t: run }} />
      </HotkeyProvider>,
    );
    fireEvent.keyDown(window, { key: "t" });
    expect(run).toHaveBeenCalledTimes(1);
  });

  // G12: the A54 regression. One key, two scopes, exactly one handler runs.
  it("lets the active view's binding win over the global one, and runs only that", () => {
    const globalJ = vi.fn();
    const trainJ = vi.fn();
    render(
      <HotkeyProvider activeScope="train">
        <Binder scope="global" bindings={{ j: globalJ }} />
        <Binder scope="train" bindings={{ j: trainJ }} />
      </HotkeyProvider>,
    );
    fireEvent.keyDown(window, { key: "j" });
    expect(trainJ).toHaveBeenCalledTimes(1);
    expect(globalJ).not.toHaveBeenCalled();
  });

  it("falls back to the global binding when the active scope has none", () => {
    const globalJ = vi.fn();
    const trainK = vi.fn();
    render(
      <HotkeyProvider activeScope="train">
        <Binder scope="global" bindings={{ j: globalJ }} />
        <Binder scope="train" bindings={{ k: trainK }} />
      </HotkeyProvider>,
    );
    fireEvent.keyDown(window, { key: "j" });
    expect(globalJ).toHaveBeenCalledTimes(1);
    expect(trainK).not.toHaveBeenCalled();
  });

  it("ignores a scope that is not active", () => {
    const planJ = vi.fn();
    render(
      <HotkeyProvider activeScope="today">
        <Binder scope="plan" bindings={{ j: planJ }} />
      </HotkeyProvider>,
    );
    fireEvent.keyDown(window, { key: "j" });
    expect(planJ).not.toHaveBeenCalled();
  });

  // G12: a duplicate binding is a bug, so it fails loudly rather than silently shadowing.
  it("throws when the same combo is bound twice in one scope", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <HotkeyProvider activeScope="train">
          <Binder scope="train" bindings={{ j: () => {} }} />
          <Binder scope="train" bindings={{ j: () => {} }} />
        </HotkeyProvider>,
      ),
    ).toThrow(/already bound/i);
    spy.mockRestore();
  });

  it("does not fire while a text field has focus", () => {
    const run = vi.fn();
    render(
      <HotkeyProvider activeScope="today">
        <Binder scope="global" bindings={{ t: run }} />
        <input aria-label="note" />
      </HotkeyProvider>,
    );
    const field = screen.getByLabelText("note");
    field.focus();
    fireEvent.keyDown(field, { key: "t" });
    expect(run).not.toHaveBeenCalled();
  });

  it("still fires Escape and mod+k inside a text field", () => {
    const esc = vi.fn();
    const palette = vi.fn();
    render(
      <HotkeyProvider activeScope="today">
        <Binder scope="global" bindings={{ escape: esc, "mod+k": palette }} />
        <input aria-label="note" />
      </HotkeyProvider>,
    );
    const field = screen.getByLabelText("note");
    field.focus();
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.keyDown(field, { key: "k", metaKey: true });
    expect(esc).toHaveBeenCalledTimes(1);
    expect(palette).toHaveBeenCalledTimes(1);
  });

  it("releases a binding when its component unmounts", () => {
    const run = vi.fn();
    const { unmount } = render(
      <HotkeyProvider activeScope="today">
        <Binder scope="global" bindings={{ t: run }} />
      </HotkeyProvider>,
    );
    unmount();
    fireEvent.keyDown(window, { key: "t" });
    expect(run).not.toHaveBeenCalled();
  });

  it("registers exactly one window keydown listener regardless of how many bindings exist", () => {
    const add = vi.spyOn(window, "addEventListener");
    render(
      <HotkeyProvider activeScope="today">
        <Binder scope="global" bindings={{ t: () => {}, j: () => {}, k: () => {} }} />
        <Binder scope="today" bindings={{ "1": () => {}, "2": () => {} }} />
      </HotkeyProvider>,
    );
    expect(add.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    add.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/ui/hotkeys.test.tsx
```

Expected: FAIL — `Failed to resolve import "./hotkeys"`.

- [ ] **Step 3: Write the hotkey registry**

Create `src/ui/hotkeys.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import type { ViewId } from "./nav/views";

export type HotkeyScope = "global" | ViewId;

/** Combos that must still fire while a text field has focus. */
const ALWAYS_ACTIVE = new Set(["escape", "mod+k"]);

export function normalizeCombo(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey">): string {
  const key = e.key.toLowerCase();
  return e.metaKey || e.ctrlKey ? `mod+${key}` : key;
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

type ScopeMap = Map<HotkeyScope, Map<string, () => void>>;

interface HotkeyApi {
  register(scope: HotkeyScope, combo: string, handler: () => void): () => void;
}

const HotkeyContext = createContext<HotkeyApi | null>(null);

/**
 * The single keydown listener for the whole app. The legacy build attached one in App and another
 * in TrainView, so `j` advanced the week and moved the exercise cursor at the same time
 * (code review A54). Here every binding goes through one registry, the active view's scope is
 * consulted before "global", and the first match stops the dispatch.
 */
export function HotkeyProvider({
  activeScope,
  children,
}: {
  activeScope: HotkeyScope;
  children: ReactNode;
}): ReactElement {
  const scopesRef = useRef<ScopeMap>(new Map());
  const activeRef = useRef<HotkeyScope>(activeScope);
  activeRef.current = activeScope;

  const api = useMemo<HotkeyApi>(
    () => ({
      register(scope, combo, handler) {
        const scopes = scopesRef.current;
        let bucket = scopes.get(scope);
        if (!bucket) {
          bucket = new Map();
          scopes.set(scope, bucket);
        }
        if (bucket.has(combo)) {
          throw new Error(`Hotkey "${combo}" is already bound in scope "${scope}"`);
        }
        bucket.set(combo, handler);
        return () => {
          bucket.delete(combo);
        };
      },
    }),
    [],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const combo = normalizeCombo(e);
      if (isTextEntry(e.target) && !ALWAYS_ACTIVE.has(combo)) return;
      const scoped = scopesRef.current.get(activeRef.current)?.get(combo);
      const handler = scoped ?? scopesRef.current.get("global")?.get(combo);
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <HotkeyContext.Provider value={api}>{children}</HotkeyContext.Provider>;
}

/**
 * Bind combos in one scope. `bindings` is read on every render, so pass stable callbacks
 * (useCallback or store actions) rather than fresh closures with changing behaviour.
 */
export function useHotkeys(scope: HotkeyScope, bindings: Record<string, () => void>): void {
  const ctx = useContext(HotkeyContext);
  if (!ctx) throw new Error("useHotkeys must be used inside <HotkeyProvider>");
  const latest = useRef(bindings);
  latest.current = bindings;
  const combos = Object.keys(bindings).sort().join("|");

  useEffect(() => {
    const offs = combos
      .split("|")
      .filter((c) => c !== "")
      .map((combo) => ctx.register(scope, combo, () => latest.current[combo]?.()));
    return () => {
      for (const off of offs) off();
    };
  }, [ctx, scope, combos]);
}
```

- [ ] **Step 4: Run the hotkey test to verify it passes**

```bash
npx vitest run src/ui/hotkeys.test.tsx
```

Expected: PASS — 11 passed.

- [ ] **Step 5: Write the plan-browse state and its test**

Create `src/ui/planBrowse.tsx`:

```tsx
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { useAppStore } from "../store";

export interface PlanBrowse {
  /** Index into PlanTemplate.blocks that the Plan view is showing. */
  blockIndex: number;
  /** Index into PlanTemplate.sessions that the Plan view is showing. */
  sessionIndex: number;
}

interface PlanBrowseApi extends PlanBrowse {
  nextBlock(): void;
  prevBlock(): void;
  nextSession(): void;
  prevSession(): void;
  resetToCursor(): void;
}

const PlanBrowseContext = createContext<PlanBrowseApi | null>(null);

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function PlanBrowseProvider({ children }: { children: ReactNode }): ReactElement {
  const profileId = useAppStore((s) => s.activeProfileId);
  const cursor = useAppStore((s) => (profileId ? s.cursors[profileId] : undefined));
  const plan = useAppStore((s) => (cursor ? s.plans[cursor.planId] : undefined));

  const sessionCount = plan?.sessions.length ?? 0;
  const blockCount = plan?.blocks.length ?? 0;
  const cursorSession = clamp(cursor?.nextSessionIndex ?? 0, 0, Math.max(0, sessionCount - 1));

  const [browse, setBrowse] = useState<PlanBrowse>({ blockIndex: 0, sessionIndex: cursorSession });

  const nextBlock = useCallback(
    () => setBrowse((b) => ({ ...b, blockIndex: clamp(b.blockIndex + 1, 0, Math.max(0, blockCount - 1)) })),
    [blockCount],
  );
  const prevBlock = useCallback(
    () => setBrowse((b) => ({ ...b, blockIndex: clamp(b.blockIndex - 1, 0, Math.max(0, blockCount - 1)) })),
    [blockCount],
  );
  const nextSession = useCallback(
    () => setBrowse((b) => ({ ...b, sessionIndex: clamp(b.sessionIndex + 1, 0, Math.max(0, sessionCount - 1)) })),
    [sessionCount],
  );
  const prevSession = useCallback(
    () => setBrowse((b) => ({ ...b, sessionIndex: clamp(b.sessionIndex - 1, 0, Math.max(0, sessionCount - 1)) })),
    [sessionCount],
  );
  const resetToCursor = useCallback(
    () => setBrowse({ blockIndex: 0, sessionIndex: cursorSession }),
    [cursorSession],
  );

  const value = useMemo<PlanBrowseApi>(
    () => ({ ...browse, nextBlock, prevBlock, nextSession, prevSession, resetToCursor }),
    [browse, nextBlock, prevBlock, nextSession, prevSession, resetToCursor],
  );

  return <PlanBrowseContext.Provider value={value}>{children}</PlanBrowseContext.Provider>;
}

export function usePlanBrowse(): PlanBrowseApi {
  const ctx = useContext(PlanBrowseContext);
  if (!ctx) throw new Error("usePlanBrowse must be used inside <PlanBrowseProvider>");
  return ctx;
}
```

Append its test to `src/ui/hotkeys.test.tsx`:

```tsx
import { PlanBrowseProvider, usePlanBrowse } from "./planBrowse";
import { useAppStore } from "../store";
import { makeAppState } from "../test/funFixtures";

let browse: ReturnType<typeof usePlanBrowse> | null = null;
function BrowseProbe(): ReactElement {
  browse = usePlanBrowse();
  return <div data-testid="browse">{`${browse.blockIndex}:${browse.sessionIndex}`}</div>;
}

describe("planBrowse", () => {
  it("clamps block and session movement to the plan bounds", () => {
    useAppStore.setState(makeAppState());
    render(
      <PlanBrowseProvider>
        <BrowseProbe />
      </PlanBrowseProvider>,
    );
    // Fixture plan: 3 blocks, 24 sessions, cursor at session 0.
    expect(screen.getByTestId("browse").textContent).toBe("0:0");
    act(() => browse!.prevSession());
    expect(screen.getByTestId("browse").textContent).toBe("0:0");
    act(() => {
      browse!.nextSession();
      browse!.nextBlock();
    });
    expect(screen.getByTestId("browse").textContent).toBe("1:1");
    act(() => {
      for (let i = 0; i < 10; i += 1) browse!.nextBlock();
    });
    expect(screen.getByTestId("browse").textContent).toBe("2:1");
    act(() => browse!.resetToCursor());
    expect(screen.getByTestId("browse").textContent).toBe("0:0");
  });
});
```

Add `act` to the Testing Library import at the top of the file.

- [ ] **Step 6: Write the Konami overlay**

Create `src/ui/components/KonamiOverlay.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";

const CODE = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a",
];

const OVERLAY_MS = 6000;

/**
 * Called unconditionally from App. The legacy build called this behind `if (window.useKonamiCode)`
 * (code review A52), which made the hook count depend on a runtime condition.
 */
export function useKonamiCode(onActivate: () => void): void {
  const buffer = useRef<string[]>([]);
  const latest = useRef(onActivate);
  latest.current = onActivate;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      buffer.current.push(e.key.toLowerCase());
      if (buffer.current.length > CODE.length) buffer.current.shift();
      if (buffer.current.length === CODE.length && buffer.current.every((k, i) => k === CODE[i])) {
        buffer.current = [];
        latest.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function KonamiOverlay({ onClose }: { onClose: () => void }): ReactElement {
  useEffect(() => {
    const handle = setTimeout(onClose, OVERLAY_MS);
    return () => clearTimeout(handle);
  }, [onClose]);
  return (
    <button type="button" className="konami" onClick={onClose}>
      <pre className="konami-art">
{`  up up down down left right left right B A

  +-------------------------------+
  |  No cheat code found.         |
  |  A squat cannot be skipped.   |
  +-------------------------------+`}
      </pre>
    </button>
  );
}
```

- [ ] **Step 7: Wire the providers and bindings into App**

In `src/app/App.tsx`, add the imports:

```tsx
import { HotkeyProvider, useHotkeys } from "../ui/hotkeys";
import { PlanBrowseProvider, usePlanBrowse } from "../ui/planBrowse";
import { PlanFocusProvider } from "../ui/planFocus";
import { ToastProvider, ToastQueue } from "../ui/components/ToastQueue";
import { Spotlight } from "../ui/components/Spotlight";
import { Boot } from "../ui/components/Boot";
import { KonamiOverlay, useKonamiCode } from "../ui/components/KonamiOverlay";
import { VIEWS } from "../ui/nav/views";
import type { ViewId } from "../ui/nav/views";
```

Wrap the app body in the providers, outermost first, so every consumer below has its context:

```tsx
export function App(): ReactElement {
  return (
    <ToastProvider>
      <PlanFocusProvider>
        <PlanBrowseProvider>
          <AppShell />
        </PlanBrowseProvider>
      </PlanFocusProvider>
    </ToastProvider>
  );
}
```

`AppShell` holds the view state and mounts the hotkey provider around the bound component:

```tsx
function AppShell(): ReactElement {
  const view = useAppStore((s) => s.ui.lastView) as ViewId;
  return (
    <HotkeyProvider activeScope={view}>
      <AppBody />
    </HotkeyProvider>
  );
}
```

`AppBody` binds the global hotkeys. Every hook below is called unconditionally, before any early return:

```tsx
function AppBody(): ReactElement {
  const view = useAppStore((s) => s.ui.lastView) as ViewId;
  const bootSeen = useAppStore((s) => s.ui.bootSeen);
  const setUi = useAppStore((s) => s.setUi);
  const browse = usePlanBrowse();
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [konami, setKonami] = useState(false);
  const [bootDone, setBootDone] = useState(false);

  useKonamiCode(useCallback(() => setKonami(true), []));

  const bindings = useMemo<Record<string, () => void>>(() => {
    const map: Record<string, () => void> = {
      "mod+k": () => setSpotlightOpen(true),
      escape: () => {
        setSpotlightOpen(false);
        setKonami(false);
      },
      // J/K move between plan blocks; the arrows move between sessions.
      j: browse.nextBlock,
      k: browse.prevBlock,
      arrowright: browse.nextSession,
      arrowleft: browse.prevSession,
      t: () => {
        setUi({ lastView: "today" });
        browse.resetToCursor();
      },
    };
    for (const v of VIEWS) map[String(v.digit)] = () => setUi({ lastView: v.id });
    return map;
  }, [browse, setUi]);

  useHotkeys("global", bindings);

  if (!bootSeen && !bootDone) return <Boot onDone={() => setBootDone(true)} />;

  return (
    <>
      <TopBar onOpenSpotlight={() => setSpotlightOpen(true)} />
      <main>{renderView(view)}</main>
      <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
      <ToastQueue />
      {konami ? <KonamiOverlay onClose={() => setKonami(false)} /> : null}
    </>
  );
}
```

Keep the existing `renderView` switch; add the `atlas` case pointing at `AtlasView` from Task 5.

- [ ] **Step 8: Remove the legacy duplicate listener from TrainView if one was ported**

```bash
grep -rn "addEventListener(\"keydown\"" src/ | grep -v "src/ui/hotkeys.tsx" | grep -v "src/ui/components/KonamiOverlay.tsx"
```

Expected: no output. If TrainView registers its own listener, convert it to `useHotkeys("train", { j: ..., k: ... })`; the registry then guarantees the view binding wins and the global one does not also fire.

The Konami listener is the one sanctioned second listener: it is a sequence detector rather than a binding, it calls no `preventDefault`, and it cannot shadow a hotkey.

- [ ] **Step 9: Run the suite**

```bash
npx vitest run src/ui/hotkeys.test.tsx
npm test
```

Expected: the hotkeys file passes 12 tests; the whole suite passes.

- [ ] **Step 10: Lint and commit**

```bash
npx eslint src/ui/hotkeys.tsx src/ui/planBrowse.tsx src/ui/components/KonamiOverlay.tsx src/app/App.tsx src/ui/hotkeys.test.tsx
npm test
git add src/ui/hotkeys.tsx src/ui/hotkeys.test.tsx src/ui/planBrowse.tsx src/ui/components/KonamiOverlay.tsx src/app/App.tsx
git commit -m "fix: single scoped hotkey listener, unconditional Konami hook, plan browse state"
```

Expected: eslint silent (in particular `react-hooks/rules-of-hooks` clean, since `useKonamiCode` is now unconditional); `npm test` all suites pass.

---

### Task 10: Phase transition keyed to the cursor, and set milestones

Code review A61: the legacy cutscene was keyed to `s.week`, the *scrub* position, and closing it wrote `lastPhaseSeen`. Dragging the Plan view's week slider to week 20 in week 2 therefore fired the Phase 1 to Phase 3 cutscene immediately, reported the statistics of a phase not yet trained, and set `lastPhaseSeen = 3`, after which the real transitions could never fire. One tap disabled the feature for the rest of the programme.

The fix is to key the cutscene to `PlanBlock.index` derived from `PlanCursor.nextSessionIndex`, which only advances when a session is completed or skipped. Browsing cannot move it.

Code review A46 also noted that a milestone could be stepped over when two sets landed in one batch and `[50,100,250,500,1000].includes(newCount)` missed the exact value. `crossedMilestones(before, after)` returns every milestone in the half-open interval, so a jump of two still fires.

**Files:**
- Create: `src/domain/fun/blocks.ts`, `src/ui/components/PhaseTransition.tsx`, `src/ui/components/MilestoneToast.tsx`
- Modify: `src/app/App.tsx` (mount the cutscene), `src/ui/views/TrainView.tsx` (push the drop and milestone toasts)
- Test: `src/domain/fun/blocks.test.ts`, `src/ui/components/PhaseTransition.test.tsx`
- Reference (read-only): `legacy/console-app.jsx:54-83`, `legacy/console-fun.jsx` `PhaseTransition`, `MilestoneToast`

**Interfaces:**
- Consumes: `AppState`, `PlanCursor`, `PlanTemplate` from `src/domain/types.ts`; `displayMass`, `UNIT_LABEL` from `src/domain/units.ts`; `useToasts` from `src/ui/components/ToastQueue.tsx`; `useAppStore`.
- Produces:
  ```ts
  export const SET_MILESTONES: readonly number[];                          // 50, 100, 250, 500, 1000
  export function crossedMilestones(before: number, after: number): number[];
  export function currentBlockIndex(plan: PlanTemplate, cursor: PlanCursor): number;
  export interface BlockStats { sessionsCompleted: number; setsLogged: number; tonnageKg: number; specimensOwned: number }
  export function blockStats(state: AppState, profileId: string, blockIndex: number): BlockStats;
  export function PhaseTransition(props: { fromIndex: number; toIndex: number; stats: BlockStats; units: UnitSystem; onClose(): void }): React.ReactElement;
  export function PhaseTransitionGate(): React.ReactElement | null;
  export function milestoneMessage(count: number): string;
  ```

- [ ] **Step 1: Write the failing domain test**

Create `src/domain/fun/blocks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { blockStats, crossedMilestones, currentBlockIndex, SET_MILESTONES } from "./blocks";
import { makeAppState, makePlan } from "../../test/funFixtures";
import type { LoggedSet, PlanCursor, SessionAssignment } from "../types";

const plan = makePlan(); // 24 sessions, blocks 0..2 covering sessions 0-7, 8-15, 16-23
const cursorAt = (n: number): PlanCursor => ({ planId: plan.id, nextSessionIndex: n, startedOn: "2026-09-07", completedOn: null });

describe("currentBlockIndex", () => {
  it("maps a cursor position onto its block", () => {
    expect(currentBlockIndex(plan, cursorAt(0))).toBe(0);
    expect(currentBlockIndex(plan, cursorAt(7))).toBe(0);
    expect(currentBlockIndex(plan, cursorAt(8))).toBe(1);
    expect(currentBlockIndex(plan, cursorAt(15))).toBe(1);
    expect(currentBlockIndex(plan, cursorAt(16))).toBe(2);
  });

  it("stays in the final block once the plan is finished", () => {
    expect(currentBlockIndex(plan, cursorAt(24))).toBe(2);
    expect(currentBlockIndex(plan, cursorAt(999))).toBe(2);
  });

  it("returns the first block for a cursor below the first block's start", () => {
    expect(currentBlockIndex(plan, cursorAt(-3))).toBe(0);
  });

  it("returns 0 for a plan with no blocks", () => {
    expect(currentBlockIndex(makePlan({ blocks: [] }), cursorAt(5))).toBe(0);
  });
});

describe("crossedMilestones", () => {
  it("returns the milestone reached by a single increment", () => {
    expect(crossedMilestones(49, 50)).toEqual([50]);
  });

  // G11: A46 - a batched double increment must not step over a milestone.
  it("returns a milestone stepped over by a jump", () => {
    expect(crossedMilestones(49, 51)).toEqual([50]);
  });

  it("returns every milestone inside a large jump", () => {
    expect(crossedMilestones(40, 300)).toEqual([50, 100, 250]);
  });

  it("returns nothing when no milestone lies in the interval", () => {
    expect(crossedMilestones(51, 60)).toEqual([]);
    expect(crossedMilestones(50, 50)).toEqual([]);
  });

  it("returns nothing for a decreasing count", () => {
    expect(crossedMilestones(100, 99)).toEqual([]);
  });

  it("declares the milestone set", () => {
    expect(SET_MILESTONES).toEqual([50, 100, 250, 500, 1000]);
  });
});

describe("blockStats", () => {
  function stateWithBlockOneWork() {
    const assignments: SessionAssignment[] = [
      // sourceIndex 8 and 9 are inside block 1.
      { date: "2026-11-02", sessionId: "s9", sourceIndex: 8, status: "completed", startedAt: 1, completedAt: 2, skipReason: null },
      { date: "2026-11-03", sessionId: "s10", sourceIndex: 9, status: "completed", startedAt: 1, completedAt: 2, skipReason: null },
      // sourceIndex 2 is inside block 0 and must not be counted.
      { date: "2026-09-10", sessionId: "s3", sourceIndex: 2, status: "completed", startedAt: 1, completedAt: 2, skipReason: null },
      // a skipped session inside block 1 is not a completed session.
      { date: "2026-11-04", sessionId: "s11", sourceIndex: 10, status: "skipped", startedAt: null, completedAt: null, skipReason: "ill" },
    ];
    const set = (id: string, date: string, sessionId: string, loadKg: number | null, reps: number | null): LoggedSet => ({
      id,
      profileId: "p1",
      assignmentDate: date,
      sessionId,
      exerciseId: "bench-press",
      setNumber: 1,
      isBonus: false,
      loadKg, // kg
      enteredUnit: "metric",
      reps,
      durationS: null,
      rpe: 7,
      loggedAt: 1,
    });
    return makeAppState({
      assignments: { p1: assignments },
      sets: {
        a: set("a", "2026-11-02", "s9", 60, 8), // 480 kg
        b: set("b", "2026-11-03", "s10", 100, 5), // 500 kg
        c: set("c", "2026-11-03", "s10", 0, 12), // bodyweight: counts as a set, 0 kg tonnage
        d: set("d", "2026-11-03", "s10", null, null), // not recorded: counts as a set, 0 kg tonnage
        e: set("e", "2026-09-10", "s3", 80, 8), // block 0, excluded
      },
      specimens: { p1: { profileId: "p1", acquired: { c001: { at: 1, exerciseId: null } }, totalSetsLogged: 5 } },
    });
  }

  it("counts completed sessions, sets and tonnage inside the block only", () => {
    const stats = blockStats(stateWithBlockOneWork(), "p1", 1);
    expect(stats.sessionsCompleted).toBe(2);
    expect(stats.setsLogged).toBe(4);
    expect(stats.tonnageKg).toBe(980); // kg: 60x8 + 100x5 + 0x12 + 0
    expect(stats.specimensOwned).toBe(1);
  });

  it("returns zeros for a block with no work", () => {
    const stats = blockStats(stateWithBlockOneWork(), "p1", 2);
    expect(stats).toEqual({ sessionsCompleted: 0, setsLogged: 0, tonnageKg: 0, specimensOwned: 1 });
  });

  it("returns zeros for an unknown profile", () => {
    expect(blockStats(stateWithBlockOneWork(), "nobody", 1)).toEqual({
      sessionsCompleted: 0,
      setsLogged: 0,
      tonnageKg: 0,
      specimensOwned: 0,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/domain/fun/blocks.test.ts
```

Expected: FAIL - `Failed to resolve import "./blocks"`.

- [ ] **Step 3: Write the domain module**

Create `src/domain/fun/blocks.ts`:

```ts
import type { AppState, PlanCursor, PlanTemplate } from "../types";

/** Set counts that earn a milestone toast. Carried over from the legacy list. */
export const SET_MILESTONES: readonly number[] = [50, 100, 250, 500, 1000];

/**
 * Milestones inside the half-open interval (before, after].
 *
 * The legacy check was `MILESTONES.includes(newCount)`, which silently lost a milestone whenever
 * the counter advanced by more than one in a batch (code review A46). Working on the interval
 * cannot lose one.
 */
export function crossedMilestones(before: number, after: number): number[] {
  return SET_MILESTONES.filter((m) => m > before && m <= after);
}

/**
 * The block the plan cursor currently sits in.
 *
 * Derived from PlanCursor.nextSessionIndex, which advances only on completion or skip. It is
 * deliberately independent of anything the user browses to: keying the cutscene to a scrub
 * position let one drag of the week slider fire and permanently consume it (code review A61).
 */
export function currentBlockIndex(plan: PlanTemplate, cursor: PlanCursor): number {
  const blocks = plan.blocks;
  const first = blocks[0];
  if (!first) return 0;
  const i = cursor.nextSessionIndex;
  if (i < first.firstSessionIndex) return first.index;
  for (const b of blocks) {
    if (i >= b.firstSessionIndex && i < b.firstSessionIndex + b.sessionCount) return b.index;
  }
  // Cursor past the end of the plan: stay in the final block.
  return blocks[blocks.length - 1]?.index ?? 0;
}

export interface BlockStats {
  sessionsCompleted: number;
  setsLogged: number;
  /** Sum of loadKg x reps over the block's logged sets. kg. */
  tonnageKg: number;
  specimensOwned: number;
}

/**
 * Work done inside one block.
 *
 * Sets carry an assignmentDate and a sessionId but no block, so the join runs through
 * SessionAssignment.sourceIndex, which is the index into PlanTemplate.sessions.
 * A set with loadKg 0 (bodyweight, code review A60) or a null load counts as a set and adds
 * zero tonnage; it is never dropped.
 */
export function blockStats(state: AppState, profileId: string, blockIndex: number): BlockStats {
  const empty: BlockStats = { sessionsCompleted: 0, setsLogged: 0, tonnageKg: 0, specimensOwned: 0 };
  const cursor = state.cursors[profileId];
  if (!cursor) return empty;
  const plan = state.plans[cursor.planId];
  if (!plan) return empty;
  const owned = Object.keys(state.specimens[profileId]?.acquired ?? {}).length;
  const block = plan.blocks.find((b) => b.index === blockIndex);
  if (!block) return { ...empty, specimensOwned: owned };

  const lo = block.firstSessionIndex;
  const hi = block.firstSessionIndex + block.sessionCount; // exclusive
  const assignments = state.assignments[profileId] ?? [];
  const inBlock = assignments.filter((a) => a.sourceIndex >= lo && a.sourceIndex < hi);
  const keys = new Set(inBlock.map((a) => `${a.date} ${a.sessionId}`));

  let setsLogged = 0;
  let tonnageKg = 0; // kg
  for (const s of Object.values(state.sets)) {
    if (s.profileId !== profileId) continue;
    if (!keys.has(`${s.assignmentDate} ${s.sessionId}`)) continue;
    setsLogged += 1;
    tonnageKg += (s.loadKg ?? 0) * (s.reps ?? 0);
  }

  return {
    sessionsCompleted: inBlock.filter((a) => a.status === "completed").length,
    setsLogged,
    tonnageKg,
    specimensOwned: owned,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/domain/fun/blocks.test.ts
```

Expected: PASS - 13 passed.

- [ ] **Step 5: Write the milestone message helper**

Create `src/ui/components/MilestoneToast.tsx`:

```tsx
import type { ReactElement } from "react";

/**
 * Clinical, factual, no motivational filler. The legacy strings claimed a gym-dropout statistic
 * and the mass of Milo's bull, neither of which had a source; both are gone.
 */
export function milestoneMessage(count: number): string {
  switch (count) {
    case 50:
      return "50 sets recorded.";
    case 100:
      return "100 sets recorded.";
    case 250:
      return "250 sets recorded.";
    case 500:
      return "500 sets recorded.";
    case 1000:
      return "1,000 sets recorded.";
    default:
      return `${count} sets recorded.`;
  }
}

export function MilestoneCard({ count }: { count: number }): ReactElement {
  return (
    <div className="milestone-card">
      <span className="milestone-count">{count}</span>
      <span className="milestone-msg">{milestoneMessage(count)}</span>
    </div>
  );
}
```

- [ ] **Step 6: Write the failing cutscene test**

Create `src/ui/components/PhaseTransition.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PhaseTransition, PhaseTransitionGate } from "./PhaseTransition";
import { useAppStore } from "../../store";
import { makeAppState, makePlan } from "../../test/funFixtures";
import { milestoneMessage } from "./MilestoneToast";

describe("PhaseTransition", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reveals its statistics in steps and then offers Continue", () => {
    const onClose = vi.fn();
    render(
      <PhaseTransition
        fromIndex={0}
        toIndex={1}
        stats={{ sessionsCompleted: 8, setsLogged: 96, tonnageKg: 41208, specimensOwned: 5 }}
        units="metric"
        onClose={onClose}
      />,
    );
    expect(screen.getByText(/Block 1 to Block 2/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /continue/i })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByText("96")).toBeTruthy();
    expect(screen.getByText("41,208 kg")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows mass moved in the profile's display unit", () => {
    render(
      <PhaseTransition
        fromIndex={0}
        toIndex={1}
        stats={{ sessionsCompleted: 8, setsLogged: 96, tonnageKg: 1000, specimensOwned: 5 }}
        units="imperial"
        onClose={() => {}}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    // 1000 kg / 0.45359237 = 2204.6 lb, rounded for display.
    expect(screen.getByText("2,205 lb")).toBeTruthy();
  });
});

describe("PhaseTransitionGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState(makeAppState());
  });
  afterEach(() => vi.useRealTimers());

  it("stays silent while the cursor is inside the first block", () => {
    const { container } = render(<PhaseTransitionGate />);
    expect(container.firstChild).toBeNull();
  });

  it("fires once when the cursor enters a new block", () => {
    useAppStore.setState({
      cursors: { p1: { planId: "plan1", nextSessionIndex: 8, startedOn: "2026-09-07", completedOn: null } },
    });
    render(<PhaseTransitionGate />);
    expect(screen.getByText(/Block 1 to Block 2/i)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(useAppStore.getState().ui.lastBlockSeenByProfile.p1).toBe(1);
  });

  it("does not fire again for a block already seen", () => {
    useAppStore.setState({
      cursors: { p1: { planId: "plan1", nextSessionIndex: 8, startedOn: "2026-09-07", completedOn: null } },
      ui: { ...useAppStore.getState().ui, lastBlockSeenByProfile: { p1: 1 } },
    });
    const { container } = render(<PhaseTransitionGate />);
    expect(container.firstChild).toBeNull();
  });

  // G13: the A61 regression. Browsing must not fire or consume the cutscene.
  it("ignores the plan view's browse position entirely", () => {
    const plan = makePlan();
    useAppStore.setState({
      cursors: { p1: { planId: plan.id, nextSessionIndex: 2, startedOn: "2026-09-07", completedOn: null } },
    });
    const { container } = render(<PhaseTransitionGate />);
    // The user may be browsing block 2 in the Plan view; the cursor is still inside block 0.
    expect(container.firstChild).toBeNull();
    expect(useAppStore.getState().ui.lastBlockSeenByProfile.p1).toBeUndefined();
  });
});

describe("milestoneMessage", () => {
  it("states the count without motivational filler", () => {
    expect(milestoneMessage(50)).toBe("50 sets recorded.");
    expect(milestoneMessage(1000)).toBe("1,000 sets recorded.");
    expect(/congrat|amazing|beast|crush/i.test(milestoneMessage(250))).toBe(false);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

```bash
npx vitest run src/ui/components/PhaseTransition.test.tsx
```

Expected: FAIL - `Failed to resolve import "./PhaseTransition"`.

- [ ] **Step 8: Write the cutscene and its gate**

Create `src/ui/components/PhaseTransition.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { blockStats, currentBlockIndex } from "../../domain/fun/blocks";
import type { BlockStats } from "../../domain/fun/blocks";
import { UNIT_LABEL, displayMass } from "../../domain/units";
import type { UnitSystem } from "../../domain/types";
import { useAppStore } from "../../store";

const FIRST_STEP_MS = 600;
const STEP_MS = 800;
const STEPS = 5;

/** Total mass moved, rendered in the profile's display unit. kg in, display unit out. */
function formatTonnage(tonnageKg: number, units: UnitSystem): string {
  const value = Math.round(displayMass(tonnageKg, units));
  return `${value.toLocaleString("en-US")} ${UNIT_LABEL[units].mass}`;
}

export function PhaseTransition({
  fromIndex,
  toIndex,
  stats,
  units,
  onClose,
}: {
  fromIndex: number;
  toIndex: number;
  stats: BlockStats;
  units: UnitSystem;
  onClose: () => void;
}): ReactElement {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= STEPS) return undefined;
    const handle = setTimeout(() => setStep((s) => s + 1), step === 0 ? FIRST_STEP_MS : STEP_MS);
    return () => clearTimeout(handle);
  }, [step]);

  return (
    <div className="phase-transition" role="dialog" aria-modal="true" aria-label="Block transition">
      <h2 className="pt-head">
        Block {fromIndex + 1} to Block {toIndex + 1}
      </h2>
      <dl className="pt-stats">
        {step >= 1 && (
          <div className="pt-row">
            <dt>sessions completed</dt>
            <dd>{stats.sessionsCompleted}</dd>
          </div>
        )}
        {step >= 2 && (
          <div className="pt-row">
            <dt>sets logged</dt>
            <dd>{stats.setsLogged}</dd>
          </div>
        )}
        {step >= 3 && (
          <div className="pt-row">
            <dt>mass moved</dt>
            <dd>{formatTonnage(stats.tonnageKg, units)}</dd>
          </div>
        )}
        {step >= 4 && (
          <div className="pt-row">
            <dt>specimens collected</dt>
            <dd>{stats.specimensOwned}</dd>
          </div>
        )}
      </dl>
      {step >= STEPS && (
        <button type="button" className="pt-continue" onClick={onClose}>
          Continue
        </button>
      )}
    </div>
  );
}

/**
 * Decides whether the cutscene is due.
 *
 * Keyed to the block the plan CURSOR sits in, never to a browse position: the legacy version
 * keyed it to the selected week, so one drag of the week slider fired the cutscene early and
 * permanently consumed it (code review A61). Every hook below is called unconditionally; the
 * early returns come after them.
 */
export function PhaseTransitionGate(): ReactElement | null {
  const profileId = useAppStore((s) => s.activeProfileId);
  const profile = useAppStore((s) => (profileId ? s.profiles[profileId] : undefined));
  const cursor = useAppStore((s) => (profileId ? s.cursors[profileId] : undefined));
  const plan = useAppStore((s) => (cursor ? s.plans[cursor.planId] : undefined));
  const seenMap = useAppStore((s) => s.ui.lastBlockSeenByProfile);
  const setUi = useAppStore((s) => s.setUi);
  const stats = useAppStore((s) => {
    if (!profileId || !plan) return null;
    const c = s.cursors[profileId];
    if (!c) return null;
    // Statistics belong to the block just finished, which is the one before the current index.
    return blockStats(s, profileId, currentBlockIndex(plan, c) - 1);
  });

  if (!profileId || !profile || !cursor || !plan || !stats) return null;

  const current = currentBlockIndex(plan, cursor);
  const lastSeen = seenMap[profileId] ?? 0;
  if (current <= lastSeen) return null;

  return (
    <PhaseTransition
      fromIndex={current - 1}
      toIndex={current}
      stats={stats}
      units={profile.units}
      onClose={() => setUi({ lastBlockSeenByProfile: { ...seenMap, [profileId]: current } })}
    />
  );
}
```

- [ ] **Step 9: Run the cutscene test to verify it passes**

```bash
npx vitest run src/ui/components/PhaseTransition.test.tsx
```

Expected: PASS - 8 passed.

- [ ] **Step 10: Mount the gate in App**

In `src/app/App.tsx`, add the import:

```tsx
import { PhaseTransitionGate } from "../ui/components/PhaseTransition";
```

and render it beside the toast queue inside `AppBody`'s returned fragment:

```tsx
      <ToastQueue />
      <PhaseTransitionGate />
```

- [ ] **Step 11: Push the drop and milestone toasts from the set-logging call site**

In `src/ui/views/TrainView.tsx`, add the imports:

```tsx
import { useCallback } from "react";
import { crossedMilestones } from "../../domain/fun/blocks";
import { useToasts } from "../components/ToastQueue";
import { useAppStore } from "../../store";
import type { EpochMs, LoggedSet } from "../../domain/types";
```

Add this handler inside the component and call it everywhere the view currently calls `logSet`:

```tsx
  const { push } = useToasts();
  const logSet = useAppStore((s) => s.logSet);
  const attemptSpecimenDraw = useAppStore((s) => s.attemptSpecimenDraw);

  const logSetWithRewards = useCallback(
    (entry: Omit<LoggedSet, "id" | "loggedAt">, now: EpochMs): string => {
      const before = useAppStore.getState().specimens[entry.profileId]?.totalSetsLogged ?? 0;
      const id = logSet(entry, now);
      const after = useAppStore.getState().specimens[entry.profileId]?.totalSetsLogged ?? before;

      // Milestones are computed over the interval (before, after], so a batched double
      // increment cannot step over one (code review A46).
      for (const m of crossedMilestones(before, after)) push({ kind: "milestone", count: m });

      // The roll happens here, outside any state updater (code review A57).
      const card = attemptSpecimenDraw(entry.profileId, entry.exerciseId, now);
      if (card) push({ kind: "specimen", cardId: card.id });

      return id;
    },
    [logSet, attemptSpecimenDraw, push],
  );
```

- [ ] **Step 12: Confirm nothing still reads the legacy toast slots**

```bash
grep -rn "lastDrop\|lastTelemetry\|lastMilestone\|lastDeletedSet\|lastPhaseSeen" src/
```

Expected: no output. All five legacy fields are replaced by the toast queue (Task 3) and `ui.lastBlockSeenByProfile` (Task 4).

- [ ] **Step 13: Lint and commit**

```bash
npx eslint src/domain/fun/blocks.ts src/ui/components/PhaseTransition.tsx src/ui/components/MilestoneToast.tsx src/app/App.tsx src/ui/views/TrainView.tsx
npm test
git add src/domain/fun/blocks.ts src/domain/fun/blocks.test.ts src/ui/components/PhaseTransition.tsx src/ui/components/PhaseTransition.test.tsx src/ui/components/MilestoneToast.tsx src/app/App.tsx src/ui/views/TrainView.tsx
git commit -m "feat: block transition cutscene keyed to the plan cursor and interval-based milestones"
```

Expected: eslint silent; `npm test` all suites pass.

- [ ] **Step 14: Run the full P8 gate**

```bash
npm run lint
npm test
npm run build
git grep -nEi 'vyvanse|lisdexamfetamine|ymca|amphetamine' -- src/ worker/
```

Expected: lint silent; every suite passes; the build succeeds; the personal-data grep returns nothing and exits with status 1.

---

## Self-review

**1. Spec coverage.** Each item of the P8 brief maps to a task:

| Brief item | Task | Notes |
| --- | --- | --- |
| `src/content/specimenCards.ts` rebuilt from review §5 verdicts | 1 | 37 cards; both medication cards (c007, c013) dropped; count stated |
| DOI regex test, banned-string test, count at least 15 | 1 | plus an ASCII test that mechanically enforces the no-emoji tone rule |
| `drawSpecimen(inventory, cards, rng, dropChance)`, weights 6/3/1 | 2 | returns null on an empty pool rather than throwing |
| drop chance tuned, arithmetic shown in a comment | 2 | p = 0.02; 37/0.02 = 1850 sets = 23.1 weeks; legacy 15 % comparison included |
| mulberry32 in `src/domain/fun/rng.ts` | 2 | |
| rarity within 2 pp over 10,000 draws; never exhausts early | 2 | G5, G6, G7, G8 |
| `ToastQueue.tsx` + `useToasts()`, priorities, one per class, legacy durations | 3 | `milestone` inserted above `coach`; see amendment 3 |
| store `recordSpecimen`, `setCapsule`, `setUi` | 4 | master plan §6.7 signatures verbatim |
| `logSet` increments `totalSetsLogged`; draw via a store action, RNG injected | 4, 10 | `attemptSpecimenDraw`; see amendment 2 |
| `AtlasView.tsx`: rarity and category filters, locked teaser, owned count | 5 | |
| `Boot.tsx`: generic, profile-driven, skippable, `bootSeen` in `ui` | 6 | a test asserts no body-composition and no medication string |
| `TimeCapsule.tsx`: written any time, `opensOn` LocalDate, opened once | 7 | default is the plan's last day |
| `Spotlight.tsx`: views, sessions, exercises with a deep link, settings; TopBar target | 8 | `planRowDomId` is shared by the link and the row |
| hotkeys 1-8, J/K, arrows, T, Esc, one hook, no collision, Konami | 9 | scoped registry throws on a duplicate combo |
| `PhaseTransition` keyed to `PlanBlock.index` from the cursor, once per block | 10 | `ui.lastBlockSeenByProfile` |
| milestones at 50/100/250/500/1000 from `totalSetsLogged` | 10 | interval-based, so a jump cannot skip one |
| tone: clinical, no emoji, cards are facts with sources | 1, 10 | ASCII test; milestone copy asserts no filler |

Master plan §5 types used: `SpecimenInventory` (Tasks 4, 10), `TimeCapsule` (Task 7), `UiPrefs` (Tasks 4, 6, 10). Master plan §6.7 P8 actions: all three implemented in Task 4. Master plan §7 P8 gate: Task 2, expanded into G1 through G13.

**2. Placeholder scan.** No "TBD", "TODO", "similar to Task N", "add validation" or "handle edge cases" appears anywhere. Every code step carries complete code. Seven steps modify files this plan did not create (`types.ts`, `schema.ts`, `store/index.ts`, `selectors.ts`, `TopBar.tsx`, `PlanView.tsx`, `TrainView.tsx`, `App.tsx`); each shows the exact text to insert and, where the insertion point is not unique, a grep whose expected output verifies it landed. Task 8 step 11 names the one condition under which its integration assertion may legitimately need narrowing and requires the narrowing to be recorded rather than made silently.

**3. Type consistency.** Checked across tasks. `SpecimenCard`, `SpecimenRarity`, `SpecimenCategory`, `SpecimenSource` (Task 1) are consumed unchanged by Tasks 2, 3 and 5. `drawSpecimen(inventory, cards, rng, dropChance)` (Task 2) is called with exactly that argument order in Task 4. `SPECIMEN_DROP_CHANCE` is applied inside `attemptSpecimenDraw`, never at the call site, so Task 10's three-argument `attemptSpecimenDraw(profileId, exerciseId, now)` is correct. `ToastInput` (Task 3) is the parameter type of `push` in Tasks 3 and 10, and the `{ kind: "specimen"; cardId }` and `{ kind: "milestone"; count }` members match their call sites. `ViewId` (Task 8) is the type parameter of `HotkeyScope` (Task 9) and of `setView` in `SpotlightArgs` (Task 8). `planRowDomId(sessionId, exerciseId)` (Task 8) takes the same argument order in `useScrollToPlanFocus`, in the PlanView modification and in the test. `BlockStats` (Task 10) is produced by `blockStats` and consumed by `PhaseTransition` field for field. `UiPrefs.lastBlockSeenByProfile` (Task 4) is read in Task 10 with the same `Record<string, number>` shape and written through `setUi`, whose `Partial<UiPrefs>` parameter accepts it. `makeAppState` and `makePlan` (Task 4) are used with the same fixture values by Tasks 5, 6, 7, 8, 9 and 10 - in particular the fixture plan's 24 sessions and three eight-session blocks, which Task 10's `currentBlockIndex` expectations depend on.

**4. Gate coverage.** Every row of the gate table names the task that satisfies it, and every row is an executable assertion rather than a claim.

---

## Master plan amendments requested

Four contract changes. None alters a persisted shape in a way that requires a schema version bump.

1. **§5 `UiPrefs` gains one field** (Task 4):
   ```ts
   lastBlockSeenByProfile: Record<string, number>;   // highest PlanBlock.index whose cutscene has played, per profileId
   ```
   Reason: the phase cutscene must fire once per block and survive a reload, and `UiPrefs` is the only UI-preference container in §5. It is keyed by profile because block progress is per profile while `ui` is global. Additive with a Zod `.default({})`, so `CURRENT_SCHEMA_VERSION` stays 3 and P1's migration fixtures parse unchanged. Rejected alternative: hanging it off `SpecimenInventory`, which would conflate the card collection with cutscene bookkeeping.

2. **§6.7 `AppActions` gains one P8 action** (Task 4):
   ```ts
   attemptSpecimenDraw(profileId: string, exerciseId: string | null, now: EpochMs, rng?: () => number): SpecimenCard | null;
   ```
   Reason: code review A57 requires the drop roll to happen outside any React state updater. The three §6.7 P8 actions are all pure state writes, so something must read state, roll, and dispatch `recordSpecimen`. Doing that in the view instead would oblige every future `logSet` call site to remember it. The `rng` parameter defaults to `systemRng`, so production callers pass three arguments and tests pass a seeded generator.

3. **Toast priority classes are five, not four** (Task 3). The brief specifies `undo > coach > telemetry > specimen`; the implementation inserts `milestone` between `undo` and `coach`, giving `undo > milestone > coach > telemetry > specimen`, with the brief's ordering preserved as a subsequence. Reason: master plan §7 and the brief both require milestone toasts, they belong to none of the four named classes, and `undo` must stay first because it is the only class with a deadline the user can miss irreversibly. §5 and §6.7 say nothing about toast classes, so this is a P8 design note rather than a contract change; it is recorded here so a reviewer comparing the brief against the code does not read it as drift.

4. **`src/store/index.ts` exposes one derived, non-persisted field** (Task 8): `exerciseNames: Readonly<Record<string, string>>`, computed once from `EXERCISE_LIBRARY` at module load. Reason: the spotlight must name exercises rather than list ids. Master plan §3 forbids persisting derived values; this one is computed, never written, and never part of `AppState`, so it cannot reach `persistence.ts`.

**Contract dependencies P8 asserts but does not own** (flagged so a reviewer can confirm them against P1 to P7 rather than discovering them mid-execution):

- P3's `PlanView` must render each planned-exercise row with `id={planRowDomId(session.id, pe.exerciseId)}` and call `useScrollToPlanFocus()` once (Task 8, steps 9 and 10). If `PlanView` renders only the current session rather than every session, Task 8's deep-link assertion narrows accordingly and the narrowing is recorded here.
- P1's `TopBar` gains an `onOpenSpotlight: () => void` prop (Task 8, step 8).
- P4's `TrainView` routes set logging through `logSetWithRewards` rather than calling `logSet` directly (Task 10, step 11), and registers any view-local keys through `useHotkeys("train", ...)` rather than its own `window` listener (Task 9, step 8).
- P1's store is a flat `AppState & AppActions` object, as stated in "Assumptions carried from P1 to P7". Every `useAppStore.setState` in P8's tests depends on it.

**What this plan does not do.**

- It does not port the legacy `buildTelemetryMsg` message pool. Those strings mix Epley estimates, cumulative tonnage and a trophy emoji; the tone rule forbids the last, and the coach line is P4's contract. The `coach` and `telemetry` toast classes exist and are tested, but nothing in P8 pushes a `telemetry` toast - P4 is expected to.
- It does not port `useTweaks`, the tweaks panel, `VyvanseCurve` or `core.jsx`, all dropped by the code review's port table.
- It writes no CSS. Every component uses class names that P1's `src/ui/styles/` is expected to carry; no style is written or verified here, so the first visual pass over these components is unverified work.
- It does not re-verify any DOI against Crossref. Every citation is taken from the content peer review's verified evidence column; a claim the review did not verify was dropped rather than softened, and no title was reproduced that the review did not state.
- It does not touch the five dropped legacy cards anywhere but in `DROPPED_CARD_IDS`, and it does not audit `legacy/` for the §7 medication lines - that scrub is P1's, and P7 deletes the tree.
- It leaves the accessibility of the cutscene unverified beyond `role="dialog"`: focus trapping and restore are not implemented or tested.
